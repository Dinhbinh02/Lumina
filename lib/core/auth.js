async function compressData(string) {
    const byteArray = new TextEncoder().encode(string);
    const stream = new CompressionStream("gzip");
    const writer = stream.writable.getWriter();
    writer.write(byteArray);
    writer.close();
    const response = new Response(stream.readable);
    return await response.arrayBuffer();
}

async function decompressData(arrayBuffer) {
    const stream = new DecompressionStream("gzip");
    const writer = stream.writable.getWriter();
    writer.write(new Uint8Array(arrayBuffer));
    writer.close();
    const response = new Response(stream.readable);
    const buffer = await response.arrayBuffer();
    return new TextDecoder().decode(buffer);
}

function simpleHash(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) {
        h = ((h << 5) + h) + str.charCodeAt(i);
        h |= 0;
    }
    return h.toString(36);
}

function mergeProviders(local, remote, useLocalSettings) {
    if (!Array.isArray(local)) return remote;
    if (!Array.isArray(remote)) return local;
    const merged = [];
    const localMap = new Map(local.map(p => [p.id, p]));
    const remoteMap = new Map(remote.map(p => [p.id, p]));
    const allIds = new Set([...localMap.keys(), ...remoteMap.keys()]);
    for (const id of allIds) {
        const localP = localMap.get(id);
        const remoteP = remoteMap.get(id);
        if (localP && remoteP) {
            const localKey = localP.apiKey || '';
            const remoteKey = remoteP.apiKey || '';
            let chosenKey = '';
            if (localKey && !remoteKey) {
                chosenKey = localKey;
            } else if (!localKey && remoteKey) {
                chosenKey = remoteKey;
            } else {
                chosenKey = useLocalSettings ? localKey : remoteKey;
            }
            const base = useLocalSettings ? localP : remoteP;
            merged.push({
                ...base,
                apiKey: chosenKey
            });
        } else if (localP) {
            merged.push(localP);
        } else if (remoteP) {
            merged.push(remoteP);
        }
    }
    return merged;
}


function generatePkcePair() {

    return new Promise((resolve) => {
        const array = new Uint8Array(32);
        crypto.getRandomValues(array);
        const verifier = Array.from(array, dec => ('0' + dec.toString(16)).slice(-2)).join('');
        const encoder = new TextEncoder();
        const data = encoder.encode(verifier);
        crypto.subtle.digest('SHA-256', data).then(hashBuffer => {
            const challenge = btoa(String.fromCharCode(...new Uint8Array(hashBuffer)))
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=+$/, '');
            resolve({ verifier, challenge });
        });
    });
}

async function exchangeCodeForTokens(clientId, clientSecret, code, verifier, redirectUrl) {
    const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: "authorization_code",
            code: code,
            code_verifier: verifier,
            redirect_uri: redirectUrl
        })
    });
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error_description || errData.error || "Failed to exchange code");
    }
    const data = await res.json();
    return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token
    };
}

async function refreshAccessToken(clientId, clientSecret, refreshToken) {
    const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: "refresh_token",
            refresh_token: refreshToken
        })
    });
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error_description || errData.error || "Failed to refresh token");
    }
    const data = await res.json();
    return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || refreshToken
    };
}

class AuthService {
    constructor() {
        this.user = null;
        this.listeners = [];
        this.isAuthenticated = false;
        this.init();

        const isBackground = typeof window === 'undefined';
        if (isBackground && typeof chrome !== 'undefined' && chrome.alarms) {
            chrome.alarms.get('tokenRefresh', (alarm) => {
                if (!alarm) {
                    chrome.alarms.create('tokenRefresh', { periodInMinutes: 45 });
                }
            });
            chrome.alarms.onAlarm.addListener((alarm) => {
                if (alarm.name === 'tokenRefresh') {
                    this._refreshTokenIfNeeded();
                }
            });
        }
    }

    async init() {
        try {
            const data = await chrome.storage.local.get(['google_user_info']);
            if (data.google_user_info) {
                this.user = data.google_user_info;
                this.isAuthenticated = true;
                this.notifyListeners();
            }
        } catch (e) {
            console.warn('[Auth] Init failed:', e);
        }
        this.checkAuthStatus();
    }

    async _refreshTokenIfNeeded() {
        if (!this.isAuthenticated) return;
        try {
            const token = await this.getAuthToken(false, true);
            if (token) {
                console.log('[Auth] Token refreshed successfully');
            }
        } catch (e) {
            console.log('[Auth] Token refresh failed:', e.message);
        }
    }

    async checkAuthStatus() {
        try {
            const token = await this.getAuthToken(false);
            if (token) {
                await this.fetchUserInfo(token);
            }
        } catch (e) {
            console.log('[Auth] Check status failed:', e.message);
        }
    }

    async getAuthToken(interactive = false, forceRefresh = false) {
        return new Promise((resolve, reject) => {
            chrome.storage.local.get(["google_oauth_token", "google_oauth_token_time", "refresh_token", "client_id", "client_secret"], async (result) => {
                if (!forceRefresh && result.google_oauth_token && result.google_oauth_token_time) {
                    const age = Date.now() - result.google_oauth_token_time;
                    if (age < 3500 * 1000) {
                        resolve(result.google_oauth_token);
                        return;
                    }
                }

                const clientId = result.client_id;
                const clientSecret = result.client_secret;

                if (!clientId || !clientSecret) {
                    reject(new Error("credentials_required"));
                    return;
                }

                if (result.refresh_token) {
                    try {
                        const refreshed = await refreshAccessToken(clientId, clientSecret, result.refresh_token);
                        await chrome.storage.local.set({
                            google_oauth_token: refreshed.accessToken,
                            google_oauth_token_time: Date.now(),
                            refresh_token: refreshed.refreshToken
                        });
                        resolve(refreshed.accessToken);
                        return;
                    } catch (err) {
                        console.error("[Auth] Refresh token exchange failed, clearing token storage:", err);
                        await chrome.storage.local.remove(["google_oauth_token", "google_oauth_token_time", "refresh_token", "google_user_info"]);
                        result.refresh_token = null;
                    }
                }

                if (!interactive) {
                    reject(new Error("interaction_required"));
                    return;
                }

                try {
                    const pair = await generatePkcePair();
                    await chrome.storage.local.set({ pkce_verifier: pair.verifier });
                    this.fallbackToWebAuthFlowPKCE(resolve, reject, clientId, clientSecret, pair.challenge);
                } catch (err) {
                    reject(err);
                }
            });
        });
    }

    fallbackToWebAuthFlowPKCE(resolve, reject, clientId, clientSecret, challenge) {
        const scopes = [
            "https://www.googleapis.com/auth/userinfo.email",
            "https://www.googleapis.com/auth/userinfo.profile",
            "https://www.googleapis.com/auth/drive.appdata"
        ];
        const redirectUrl = chrome.identity.getRedirectURL();
        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUrl)}&scope=${encodeURIComponent(scopes.join(' '))}&code_challenge=${challenge}&code_challenge_method=S256&access_type=offline&prompt=consent`;

        chrome.identity.launchWebAuthFlow({
            url: authUrl,
            interactive: true
        }, (responseUrl) => {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
                return;
            }
            if (!responseUrl) {
                reject(new Error("Authentication failed: empty response"));
                return;
            }

            chrome.storage.local.get(["pkce_verifier"], async (result) => {
                const verifier = result.pkce_verifier;
                try {
                    const url = new URL(responseUrl);
                    const hashParams = new URLSearchParams(url.hash.substring(1));
                    const searchParams = new URLSearchParams(url.search);
                    const code = hashParams.get("code") || searchParams.get("code");
                    const error = hashParams.get("error") || searchParams.get("error");

                    if (code) {
                        try {
                            const tokenRes = await exchangeCodeForTokens(clientId, clientSecret, code, verifier, redirectUrl);
                            await chrome.storage.local.set({
                                google_oauth_token: tokenRes.accessToken,
                                google_oauth_token_time: Date.now(),
                                refresh_token: tokenRes.refreshToken
                            });
                            resolve(tokenRes.accessToken);
                        } catch (exchangeErr) {
                            reject(exchangeErr);
                        }
                    } else if (error) {
                        reject(new Error(error));
                    } else {
                        reject(new Error("Authorization code not found in response"));
                    }
                } catch (e) {
                    reject(e);
                }
            });
        });
    }

    
    async login() {
        try {
            const token = await this.getAuthToken(true);
            await this.fetchUserInfo(token);
            return this.user;
        } catch (error) {
            console.error('Login failed:', error);
            throw error;
        }
    }

    
    async logout() {
        try {
            const token = await this.getAuthToken(false);
            if (token) {
                const url = 'https://accounts.google.com/o/oauth2/revoke?token=' + token;
                await fetch(url);
                chrome.identity.removeCachedAuthToken({ token }, () => { });
            }
        } catch (e) {
        }

        await chrome.storage.local.remove([
            'google_oauth_token',
            'google_oauth_token_time',
            'google_user_info',
            'refresh_token',
            'pkce_verifier'
        ]);

        chrome.alarms.clear('tokenRefresh');
        chrome.alarms.clear('luminaAutoSync');

        this.user = null;
        this.isAuthenticated = false;
        this.notifyListeners();
    }

    
    async fetchUserInfo(token, isRetry = false) {
        try {
            const response = await fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                
                if (response.status === 401) {
                    await chrome.storage.local.remove(['google_oauth_token', 'google_oauth_token_time']);

                    
                    if (!isRetry) {
                        console.log('[Auth] Token expired, attempting refresh...');
                        const newToken = await this.getAuthToken(false, true); 
                        if (newToken && newToken !== token) {
                            console.log('[Auth] Got new token, retrying fetchUserInfo');
                            return await this.fetchUserInfo(newToken, true);
                        }
                    }
                }
                throw new Error('Failed to fetch user info: ' + response.status);
            }

            const data = await response.json();
            this.user = {
                id: data.id,
                email: data.email,
                name: data.name,
                picture: data.picture
            };
            this.isAuthenticated = true;

            
            chrome.storage.local.set({ google_user_info: this.user });

            this.notifyListeners();
        } catch (e) {
            console.error('Fetch user info error:', e);
            throw e;
        }
    }

    
    addListener(callback) {
        this.listeners.push(callback);
    }

    removeListener(callback) {
        this.listeners = this.listeners.filter(l => l !== callback);
    }

    notifyListeners() {
        this.listeners.forEach(cb => cb(this.isAuthenticated, this.user));
    }
}


const AUTO_SYNC_INTERVAL = 15 * 60 * 1000; // Trigger auto-sync if 15 minutes have passed since last sync


class SyncManager {
    constructor(authService) {
        this.authService = authService || new AuthService();
        this.FILENAME = 'lumina_backup.json';
        this.listeners = [];

        
        this.checkAutoSync();

        const isBackground = typeof window === 'undefined';
        if (isBackground && typeof chrome !== 'undefined' && chrome.alarms) {
            chrome.alarms.get('luminaAutoSync', (alarm) => {
                if (!alarm) {
                    chrome.alarms.create('luminaAutoSync', { periodInMinutes: 15 });
                }
            });
            chrome.alarms.onAlarm.addListener((alarm) => {
                if (alarm.name === 'luminaAutoSync') {
                    this.checkAutoSync();
                }
            });
        }
        setInterval(() => this.checkAutoSync(), 15 * 60 * 1000);

        this.isSyncing = false;

        // Listen for storage updates and trigger auto sync check
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
            chrome.storage.onChanged.addListener((changes, area) => {
                if (area !== 'local') return;
                if (this.isSyncing) return;

                const keys = Object.keys(changes);
                const hasSettingsKeys = keys.some(k => 
                    !k.startsWith('lumina_session_') &&
                    !k.startsWith('spotlight_history_') &&
                    !k.startsWith('google_') &&
                    k !== 'refresh_token' &&
                    k !== 'client_id' &&
                    k !== 'client_secret' &&
                    k !== 'last_sync_time' &&
                    k !== 'last_sync_hash' &&
                    k !== 'settings_last_updated' &&
                    k !== 'optionsLastSection' &&
                    k !== 'optionsLastScroll' &&
                    k !== 'optionsScrollPositions'
                );

                if (hasSettingsKeys) {
                    chrome.storage.local.set({ settings_last_updated: Date.now() });
                }

                if (!changes.last_sync_time && !changes.settings_last_updated) {
                    this.checkAutoSync();
                }
            });
        }
    }

    addListener(callback) {
        this.listeners.push(callback);
    }

    notifyListeners(status, lastSync) {
        this.listeners.forEach(cb => cb(status, lastSync));
    }

    
    async checkAutoSync() {
        if (!this.authService.isAuthenticated) return;

        const result = await chrome.storage.local.get(['last_sync_time']);
        const lastSync = result.last_sync_time || 0;
        const now = Date.now();

        if (now - lastSync > AUTO_SYNC_INTERVAL) {
            console.log('[Sync] Auto-sync triggered');
            try {
                await this.syncData(true); 
            } catch (e) {
                console.error('[Sync] Auto-sync failed', e);
            }
        }
    }

    async getLastSyncTime() {
        const result = await chrome.storage.local.get(['last_sync_time']);
        return result.last_sync_time ? new Date(result.last_sync_time).toLocaleString() : 'Never';
    }

    async getToken(interactive = false) {
        return await this.authService.getAuthToken(interactive);
    }

    async syncUp(isAuto = false) {
        return await this.syncData(isAuto);
    }

    async syncDown() {
        return await this.syncData(false);
    }

    async downloadBackup(token, fileId) {
        const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.status === 401 || response.status === 403) throw new Error('UNAUTHORIZED');
        if (!response.ok) throw new Error('Download failed');
        const buffer = await response.arrayBuffer();
        
        // Check for Gzip Magic Bytes (0x1f, 0x8b)
        const arr = new Uint8Array(buffer);
        if (arr.length >= 2 && arr[0] === 0x1f && arr[1] === 0x8b) {
            const jsonStr = await decompressData(buffer);
            return JSON.parse(jsonStr);
        }
        
        const jsonStr = new TextDecoder().decode(buffer);
        return JSON.parse(jsonStr);
    }

    async findBackupFile(token) {
        const q = `name = '${this.FILENAME}' and 'appDataFolder' in parents and trashed = false`;
        const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&spaces=appDataFolder&fields=files(id, name)`;

        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.status === 401 || response.status === 403) throw new Error('UNAUTHORIZED');
        if (!response.ok) throw new Error('Failed to list files');

        const data = await response.json();
        if (data.files && data.files.length > 0) {
            return data.files[0].id;
        }
        return null;
    }

    async createBackupFile(token, content) {
        const metadata = {
            name: this.FILENAME,
            parents: ['appDataFolder']
        };

        const compressed = await compressData(content);
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', new Blob([compressed], { type: 'application/octet-stream' }));

        const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: form
        });

        if (response.status === 401 || response.status === 403) throw new Error('UNAUTHORIZED');
        if (!response.ok) throw new Error('Failed to create file');
    }

    async updateBackupFile(token, fileId, content) {
        const metadata = {
            name: this.FILENAME
        };

        const compressed = await compressData(content);
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', new Blob([compressed], { type: 'application/octet-stream' }));

        const response = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${token}` },
            body: form
        });

        if (response.status === 401 || response.status === 403) throw new Error('UNAUTHORIZED');
        if (!response.ok) throw new Error('Failed to update file');
    }

    async syncData(isAuto = false) {
        if (this.isSyncing) return;
        this.isSyncing = true;
        try {
            let token = await this.getToken(!isAuto);
            if (!token) throw new Error('Not authenticated');

            if (!isAuto) this.notifyListeners('Syncing...', null);

            const result = await chrome.storage.local.get(['last_sync_time']);
            const lastSynced = result.last_sync_time || 0;

            const localData = await chrome.storage.local.get(null);
            let remoteBackup = null;
            let fileId = null;

            try {
                fileId = await this.findBackupFile(token);
                if (fileId) {
                    remoteBackup = await this.downloadBackup(token, fileId);
                }
            } catch (err) {
                if (err.message === 'UNAUTHORIZED') {
                    console.log('[Sync] Token unauthorized, clearing token and retrying...');
                    await chrome.storage.local.remove(['google_oauth_token', 'google_oauth_token_time']);
                    token = await this.getToken(!isAuto);
                    fileId = await this.findBackupFile(token);
                    if (fileId) {
                        remoteBackup = await this.downloadBackup(token, fileId);
                    }
                } else {
                    throw err;
                }
            }

            const remoteData = (remoteBackup && remoteBackup.data) ? remoteBackup.data : {};
            const remoteTimestamp = remoteBackup ? new Date(remoteBackup.timestamp).getTime() : 0;

            console.log('[Sync] local providers:', localData.providers);
            console.log('[Sync] remote providers:', remoteData.providers);

            const mergedData = {};

            const isSessionKey = (k) => k.startsWith('lumina_session_') || k.startsWith('spotlight_history_');
            const isExcludedKey = (k) => [
                'client_id', 'client_secret', 'google_oauth_token', 'google_oauth_token_time',
                'google_user_info', 'refresh_token', 'pkce_verifier', 'last_sync_time', 'last_sync_hash',
                'settings_last_updated', 'optionsLastSection', 'optionsLastScroll', 'optionsScrollPositions'
            ].includes(k);

            const localSettingsTime = localData.settings_last_updated || 0;
            const remoteSettingsTime = remoteData.settings_last_updated || remoteTimestamp;
            const useLocalSettings = localSettingsTime >= remoteSettingsTime;

            const allKeys = new Set([...Object.keys(localData), ...Object.keys(remoteData)]);
            for (const key of allKeys) {
                if (isExcludedKey(key)) continue;

                if (key === 'lumina_chat_sessions') continue;
                if (isSessionKey(key)) continue;

                if (key === 'providers') {
                    mergedData[key] = mergeProviders(localData[key], remoteData[key], useLocalSettings);
                } else if (['deepLApiKey', 'googleClientId', 'githubClientId'].includes(key)) {
                    const localVal = localData[key] || '';
                    const remoteVal = remoteData[key] || '';
                    if (localVal && !remoteVal) {
                        mergedData[key] = localVal;
                    } else if (!localVal && remoteVal) {
                        mergedData[key] = remoteVal;
                    } else {
                        mergedData[key] = useLocalSettings ? localVal : remoteVal;
                    }
                } else if (key in localData && key in remoteData) {
                    if (useLocalSettings) {
                        mergedData[key] = localData[key];
                    } else {
                        mergedData[key] = remoteData[key];
                    }
                } else if (key in localData) {
                    mergedData[key] = localData[key];
                } else if (key in remoteData) {
                    mergedData[key] = remoteData[key];
                }
            }

            console.log('[Sync] merged providers:', mergedData.providers);

            const localSessions = localData.lumina_chat_sessions || {};
            const remoteSessions = remoteData.lumina_chat_sessions || {};
            const mergedSessions = {};

            const allSessionIds = new Set([...Object.keys(localSessions), ...Object.keys(remoteSessions)]);
            const localKeysToRemove = [];

            for (const sid of allSessionIds) {
                const localS = localSessions[sid];
                const remoteS = remoteSessions[sid];

                if (localS && remoteS) {
                    const localTime = localS.updatedAt || localS.createdAt || 0;
                    const remoteTime = remoteS.updatedAt || remoteS.createdAt || 0;
                    if (localTime >= remoteTime) {
                        mergedSessions[sid] = localS;
                        if (`lumina_session_${sid}` in localData) mergedData[`lumina_session_${sid}`] = localData[`lumina_session_${sid}`];
                        if (`spotlight_history_${sid}` in localData) mergedData[`spotlight_history_${sid}`] = localData[`spotlight_history_${sid}`];
                    } else {
                        mergedSessions[sid] = remoteS;
                        if (`lumina_session_${sid}` in remoteData) mergedData[`lumina_session_${sid}`] = remoteData[`lumina_session_${sid}`];
                        if (`spotlight_history_${sid}` in remoteData) mergedData[`spotlight_history_${sid}`] = remoteData[`spotlight_history_${sid}`];
                    }
                } else if (localS) {
                    const localTime = localS.updatedAt || localS.createdAt || 0;
                    if (localTime > lastSynced) {
                        mergedSessions[sid] = localS;
                        if (`lumina_session_${sid}` in localData) mergedData[`lumina_session_${sid}`] = localData[`lumina_session_${sid}`];
                        if (`spotlight_history_${sid}` in localData) mergedData[`spotlight_history_${sid}`] = localData[`spotlight_history_${sid}`];
                    } else {
                        localKeysToRemove.push(`lumina_session_${sid}`);
                        localKeysToRemove.push(`spotlight_history_${sid}`);
                    }
                } else if (remoteS) {
                    const remoteTime = remoteS.updatedAt || remoteS.createdAt || 0;
                    if (remoteTime > lastSynced) {
                        mergedSessions[sid] = remoteS;
                        if (`lumina_session_${sid}` in remoteData) mergedData[`lumina_session_${sid}`] = remoteData[`lumina_session_${sid}`];
                        if (`spotlight_history_${sid}` in remoteData) mergedData[`spotlight_history_${sid}`] = remoteData[`spotlight_history_${sid}`];
                    }
                }
            }

            mergedData.lumina_chat_sessions = mergedSessions;

            for (const key of Object.keys(remoteData)) {
                if (isExcludedKey(key)) continue;
                if (!(key in mergedData) && key !== 'lumina_chat_sessions' && !isSessionKey(key)) {
                    localKeysToRemove.push(key);
                }
            }

            if (localKeysToRemove.length > 0) {
                await chrome.storage.local.remove(localKeysToRemove);
            }

            if (!useLocalSettings) {
                mergedData.settings_last_updated = remoteSettingsTime;
            } else {
                mergedData.settings_last_updated = localSettingsTime || Date.now();
            }

            const newHash = simpleHash(JSON.stringify(mergedData));
            const stored = await chrome.storage.local.get(["last_sync_hash"]);
            const now = Date.now();

            mergedData.last_sync_time = now;
            mergedData.last_sync_hash = newHash;

            await chrome.storage.local.set(mergedData);

            if (stored.last_sync_hash === newHash && fileId) {
                if (!isAuto) this.notifyListeners('Synced just now', now);
                return now;
            }

            const payload = {
                timestamp: new Date().toISOString(),
                version: chrome.runtime.getManifest().version,
                data: mergedData
            };

            if (fileId) {
                await this.updateBackupFile(token, fileId, JSON.stringify(payload));
            } else {
                await this.createBackupFile(token, JSON.stringify(payload));
            }

            if (!isAuto) this.notifyListeners('Synced just now', now);
            return now;
        } catch (error) {
            console.error('[Sync] Sync failed:', error);
            if (!isAuto) this.notifyListeners('Sync failed', null);
            throw error;
        } finally {
            this.isSyncing = false;
        }
    }

}


const LuminaAuth = new AuthService();
const LuminaSync = new SyncManager(LuminaAuth);
