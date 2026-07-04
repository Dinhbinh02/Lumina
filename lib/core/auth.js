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

function mergeSparks(local, remote, useLocalSettings) {
    if (!local || typeof local !== 'object') return remote || {};
    if (!remote || typeof remote !== 'object') return local || {};
    const merged = { ...remote };
    for (const [id, localSpark] of Object.entries(local)) {
        const remoteSpark = remote[id];
        if (remoteSpark) {
            if (useLocalSettings) {
                const localTime = localSpark.updatedAt || localSpark.createdAt || 0;
                const remoteTime = remoteSpark.updatedAt || remoteSpark.createdAt || 0;
                if (localTime >= remoteTime) {
                    merged[id] = localSpark;
                } else {
                    merged[id] = remoteSpark;
                }
            } else {
                merged[id] = remoteSpark;
            }
        } else {
            merged[id] = localSpark;
        }
    }
    return merged;
}



class AuthService {
    constructor() {
        this.user = null;
        this.listeners = [];
        this.isAuthenticated = false;
        this.isInitialized = false;
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
            }
        } catch (e) {
            console.warn('[Auth] Init failed:', e);
        }
        this.isInitialized = true;
        this.notifyListeners();
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
        
        
        const isChrome = typeof chrome !== 'undefined' && 
                         /Chrome/i.test(navigator.userAgent) && 
                         !/Edg/i.test(navigator.userAgent) && 
                         !/OPR/i.test(navigator.userAgent) && 
                         !(navigator.brave && typeof navigator.brave.isBrave === 'function');

        if (!isChrome) {
            if (forceRefresh) {
                this._cachedToken = null;
                await chrome.storage.local.remove(['google_oauth_token', 'google_oauth_token_time']);
            } else if (this._cachedToken) {
                return this._cachedToken;
            } else {
                try {
                    const storageData = await chrome.storage.local.get(['google_oauth_token', 'google_oauth_token_time']);
                    if (storageData && storageData.google_oauth_token && storageData.google_oauth_token_time) {
                        const ageMs = Date.now() - storageData.google_oauth_token_time;
                        if (ageMs < 3000000) {
                            this._cachedToken = storageData.google_oauth_token;
                            return this._cachedToken;
                        }
                    }
                } catch (e) {}
            }

            return new Promise((resolve, reject) => {
                const clientId = "824888142961-cmsfdrk950sa3jq238ugno4hf50clnqv.apps.googleusercontent.com";
                const redirectUri = chrome.identity.getRedirectURL();
                const scopes = [
                    "https://www.googleapis.com/auth/userinfo.email",
                    "https://www.googleapis.com/auth/userinfo.profile",
                    "https://www.googleapis.com/auth/drive.appdata"
                ];
                const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` + 
                    `client_id=${encodeURIComponent(clientId)}&` +
                    `response_type=token&` +
                    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
                    `scope=${encodeURIComponent(scopes.join(' '))}`;

                chrome.identity.launchWebAuthFlow({
                    url: authUrl,
                    interactive: interactive
                }, (redirectUrl) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else if (redirectUrl) {
                        try {
                            const url = new URL(redirectUrl);
                            const hashParams = new URLSearchParams(url.hash.substring(1));
                            const token = hashParams.get('access_token');
                            if (token) {
                                this._cachedToken = token;
                                chrome.storage.local.set({ 
                                    google_oauth_token: token,
                                    google_oauth_token_time: Date.now()
                                });
                                resolve(token);
                            } else {
                                reject(new Error("No access token found in redirect URL"));
                            }
                        } catch (err) {
                            reject(err);
                        }
                    } else {
                        reject(new Error("Authentication flow cancelled or failed"));
                    }
                });
            });
        }

        return new Promise((resolve, reject) => {
            if (typeof chrome === "undefined" || !chrome.identity || !chrome.identity.getAuthToken) {
                reject(new Error("Chrome Identity API is not available"));
                return;
            }

            const attemptNativeAuth = () => {
                chrome.identity.getAuthToken({ interactive: interactive }, (token) => {
                    if (chrome.runtime.lastError) {
                        const errMsg = chrome.runtime.lastError.message;
                        if (errMsg.includes("not supported") || errMsg.includes("not available")) {
                            const clientId = "824888142961-cmsfdrk950sa3jq238ugno4hf50clnqv.apps.googleusercontent.com";
                            const redirectUri = chrome.identity.getRedirectURL();
                            const scopes = [
                                "https://www.googleapis.com/auth/userinfo.email",
                                "https://www.googleapis.com/auth/userinfo.profile",
                                "https://www.googleapis.com/auth/drive.appdata"
                            ];
                            const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` + 
                                `client_id=${encodeURIComponent(clientId)}&` +
                                `response_type=token&` +
                                `redirect_uri=${encodeURIComponent(redirectUri)}&` +
                                `scope=${encodeURIComponent(scopes.join(' '))}`;

                            chrome.identity.launchWebAuthFlow({
                                url: authUrl,
                                interactive: interactive
                            }, (redirectUrl) => {
                                if (chrome.runtime.lastError) {
                                    reject(new Error(chrome.runtime.lastError.message));
                                } else if (redirectUrl) {
                                    try {
                                        const url = new URL(redirectUrl);
                                        const hashParams = new URLSearchParams(url.hash.substring(1));
                                        const token = hashParams.get('access_token');
                                        if (token) {
                                            this._cachedToken = token;
                                            chrome.storage.local.set({ 
                                                google_oauth_token: token,
                                                google_oauth_token_time: Date.now()
                                            });
                                            resolve(token);
                                        } else {
                                            reject(new Error("No access token found in redirect URL"));
                                        }
                                    } catch (err) {
                                        reject(err);
                                    }
                                } else {
                                    reject(new Error("Authentication flow cancelled or failed"));
                                }
                            });
                        } else {
                            reject(new Error(errMsg));
                        }
                    } else if (token) {
                        resolve(token);
                    } else {
                        reject(new Error("Failed to retrieve authentication token"));
                    }
                });
            };

            if (forceRefresh) {
                chrome.identity.getAuthToken({ interactive: false }, (token) => {
                    if (token) {
                        chrome.identity.removeCachedAuthToken({ token: token }, () => {
                            attemptNativeAuth();
                        });
                    } else {
                        attemptNativeAuth();
                    }
                });
            } else {
                attemptNativeAuth();
            }
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
            const token = this._cachedToken || (await chrome.storage.local.get(['google_oauth_token'])).google_oauth_token || await this.getAuthToken(false).catch(() => null);
            this._cachedToken = null;
            if (token) {
                const url = 'https://accounts.google.com/o/oauth2/revoke?token=' + token;
                await fetch(url);
                try {
                    chrome.identity.removeCachedAuthToken({ token }, () => { });
                } catch (e) {}
            }
        } catch (e) {
        }

        await chrome.storage.local.remove([
            'google_oauth_token',
            'google_oauth_token_time',
            'google_user_info'
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


const AUTO_SYNC_INTERVAL = 15 * 60 * 1000; 


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

        
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
            chrome.storage.onChanged.addListener((changes, area) => {
                if (area !== 'local') return;
                if (this.isSyncing) return;

                const keys = Object.keys(changes);
                const excludedKeys = [
                    'google_oauth_token', 'google_oauth_token_time',
                    'google_user_info', 'last_sync_time', 'last_sync_hash',
                    'settings_last_updated', 'optionsLastSection', 'optionsLastScroll', 'optionsScrollPositions',
                    'sidepanel_active_tab_index', 'sidepanel_active_group_index', 'sidepanel_secondary_tab_index',
                    'sidepanel_is_split_mode', 'sidepanel_split_ratio',
                    'spotlight_active_tab_index', 'spotlight_active_group_index', 'spotlight_secondary_tab_index',
                    'spotlight_is_split_mode', 'spotlight_split_ratio'
                ];
                const hasSettingsKeys = keys.some(k =>
                    !k.startsWith('lumina_session_') &&
                    !k.startsWith('google_') &&
                    !excludedKeys.includes(k)
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
                    token = await this.authService.getAuthToken(!isAuto, true);
                    fileId = await this.findBackupFile(token);
                    if (fileId) {
                        remoteBackup = await this.downloadBackup(token, fileId);
                    }
                } else {
                    throw err;
                }
            }

            const remoteData = (remoteBackup && remoteBackup.data) ? remoteBackup.data : {};
            const remoteAttachments = remoteData.attachments || {};
            delete remoteData.attachments;
            const remoteTimestamp = remoteBackup ? new Date(remoteBackup.timestamp).getTime() : 0;

            const localData = await chrome.storage.local.get(null);
            const lastSynced = localData.last_sync_time || 0;

            console.log('[Sync] local providers:', localData.providers);
            console.log('[Sync] remote providers:', remoteData.providers);

            const mergedData = {};

            const isSessionKey = (k) => k.startsWith('lumina_session_');
            const isExcludedKey = (k) => [
                'google_oauth_token', 'google_oauth_token_time',
                'google_user_info', 'last_sync_time', 'last_sync_hash',
                'settings_last_updated', 'optionsLastSection', 'optionsLastScroll', 'optionsScrollPositions',
                'sidepanel_active_tab_index', 'sidepanel_active_group_index', 'sidepanel_secondary_tab_index',
                'sidepanel_is_split_mode', 'sidepanel_split_ratio',
                'spotlight_active_tab_index', 'spotlight_active_group_index', 'spotlight_secondary_tab_index',
                'spotlight_is_split_mode', 'spotlight_split_ratio',
                'spotlightWindowId', 'pendingMicToggle',
                'luminaTemplatesV3', 'luminaBatchHistoryV3', 'lastUsedGenAIModel', 
                'lastUsedBatchSize', 'lastUsedDeck', 'lastUsedTemplateId', 'ankiQuickNoteContent'
            ].includes(k) || k.includes('_inst_') || k.startsWith('pending_sidepanel_query_') || k.startsWith('rot_');


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
                } else if (key === 'lumina_sparks') {
                    mergedData[key] = mergeSparks(localData[key], remoteData[key], useLocalSettings);
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
                    } else {
                        mergedSessions[sid] = remoteS;
                        if (`lumina_session_${sid}` in remoteData) mergedData[`lumina_session_${sid}`] = remoteData[`lumina_session_${sid}`];
                    }
                } else if (localS) {
                    
                    
                    mergedSessions[sid] = localS;
                    if (`lumina_session_${sid}` in localData) mergedData[`lumina_session_${sid}`] = localData[`lumina_session_${sid}`];
                } else if (remoteS) {
                    const remoteTime = remoteS.updatedAt || remoteS.createdAt || 0;
                    if (remoteTime > lastSynced) {
                        mergedSessions[sid] = remoteS;
                        if (`lumina_session_${sid}` in remoteData) mergedData[`lumina_session_${sid}`] = remoteData[`lumina_session_${sid}`];
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

            
            const activeAttachmentIds = new Set();
            for (const sid of Object.keys(mergedSessions)) {
                const sessionKey = `lumina_session_${sid}`;
                const sessionMsgs = mergedData[sessionKey] || localData[sessionKey] || remoteData[sessionKey];
                if (Array.isArray(sessionMsgs)) {
                    for (const msg of sessionMsgs) {
                        if (msg && Array.isArray(msg.images)) {
                            for (const img of msg.images) {
                                if (img && typeof img === 'object' && img.attachmentId) {
                                    activeAttachmentIds.add(img.attachmentId);
                                }
                            }
                        }
                    }
                }
            }

            const isAttachmentActive = (key) => {
                if (activeAttachmentIds.has(key)) return true;
                for (const sid of Object.keys(mergedSessions)) {
                    if (key.includes(sid)) return true;
                }
                return false;
            };

            let allAttachments = {};
            if (typeof LuminaAttachmentDB !== 'undefined' && LuminaAttachmentDB.getAll) {
                const rawAttachments = await LuminaAttachmentDB.getAll().catch(err => {
                    console.error('Failed to get all attachments for sync', err);
                    return {};
                });
                for (const [id, dataUrl] of Object.entries(rawAttachments)) {
                    if (isAttachmentActive(id)) {
                        allAttachments[id] = dataUrl;
                    }
                }
            }

            const dataToHash = {
                ...mergedData,
                attachments: allAttachments
            };
            const newHash = simpleHash(JSON.stringify(dataToHash));
            const stored = await chrome.storage.local.get(["last_sync_hash"]);
            const now = Date.now();

            mergedData.last_sync_time = now;
            mergedData.last_sync_hash = newHash;

            await chrome.storage.local.set(mergedData);

            if (typeof LuminaAttachmentDB !== 'undefined' && remoteAttachments) {
                for (const [id, dataUrl] of Object.entries(remoteAttachments)) {
                    if (dataUrl && isAttachmentActive(id)) {
                        const blob = LuminaAttachmentDB.dataURLtoBlob(dataUrl);
                        if (blob) {
                            await LuminaAttachmentDB.put(id, blob).catch(err => console.error('Failed to put sync attachment', err));
                        }
                    }
                }
            }

            
            if (typeof LuminaAttachmentDB !== 'undefined' && LuminaAttachmentDB.getAllMetadata) {
                try {
                    const metadata = await LuminaAttachmentDB.getAllMetadata();
                    for (const item of metadata) {
                        if (!isAttachmentActive(item.key)) {
                            await LuminaAttachmentDB.delete(item.key);
                            console.log(`[Sync Cleanup] Deleted orphaned attachment: ${item.key}`);
                        }
                    }
                } catch (cleanupErr) {
                    console.error('[Sync Cleanup] Failed to clean up orphaned attachments', cleanupErr);
                }
            }

            if (stored.last_sync_hash === newHash && fileId) {
                if (!isAuto) this.notifyListeners('Synced just now', now);
                return now;
            }

            const payload = {
                timestamp: new Date().toISOString(),
                version: chrome.runtime.getManifest().version,
                data: dataToHash
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

if (typeof window !== 'undefined') {
    window.LuminaAuth = LuminaAuth;
    window.LuminaSync = LuminaSync;
} else {
    globalThis.LuminaAuth = LuminaAuth;
    globalThis.LuminaSync = LuminaSync;
}
