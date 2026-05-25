

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

        chrome.alarms.create('tokenRefresh', { periodInMinutes: 45 });
        chrome.alarms.onAlarm.addListener((alarm) => {
            if (alarm.name === 'tokenRefresh') {
                this._refreshTokenIfNeeded();
            }
        });
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
                        console.error("[Auth] Refresh token exchange failed:", err);
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
    constructor() {
        this.authService = new AuthService();
        this.FILENAME = 'lumina_backup.json';
        this.listeners = [];

        
        this.checkAutoSync();

        // setInterval doesn't run reliably in service worker / background environments.
        // We will use chrome.alarms instead, and also keep a fallback setInterval for options page / active page contexts.
        if (typeof chrome !== 'undefined' && chrome.alarms) {
            chrome.alarms.create('luminaAutoSync', { periodInMinutes: 15 });
            chrome.alarms.onAlarm.addListener((alarm) => {
                if (alarm.name === 'luminaAutoSync') {
                    this.checkAutoSync();
                }
            });
        }
        setInterval(() => this.checkAutoSync(), 15 * 60 * 1000);

        // Listen for storage updates and trigger auto sync check
        if (typeof chrome !== 'undefined' && chrome.storage) {
            chrome.storage.onChanged.addListener((changes, area) => {
                if (area === 'local' && !changes.last_sync_time) {
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
                await this.syncUp(true); 
            } catch (e) {
                console.error('[Sync] Auto-sync failed', e);
            }
        }
    }

    async getLastSyncTime() {
        const result = await chrome.storage.local.get(['last_sync_time']);
        return result.last_sync_time ? new Date(result.last_sync_time).toLocaleString() : 'Never';
    }

    
    async getToken() {
        return await this.authService.getAuthToken(false);
    }

    
    async syncUp(isAuto = false) {
        try {
            const token = await this.getToken();
            if (!token) throw new Error('Not authenticated');

            if (!isAuto) this.notifyListeners('Uploading...', null);

            
            const localData = await chrome.storage.local.get(null);

            
            const dataToSync = {
                timestamp: new Date().toISOString(),
                version: chrome.runtime.getManifest().version,
                data: localData
            };

            const fileContent = JSON.stringify(dataToSync);
            const fileId = await this.findBackupFile(token);

            if (fileId) {
                console.log('[Sync] Updating existing backup file:', fileId);
                await this.updateBackupFile(token, fileId, fileContent);
            } else {
                console.log('[Sync] Creating new backup file');
                await this.createBackupFile(token, fileContent);
            }

            
            const now = Date.now();
            await chrome.storage.local.set({ last_sync_time: now });

            if (!isAuto) this.notifyListeners('Synced just now', now);
            return true;
        } catch (error) {
            console.error('[Sync] Upload failed:', error);
            if (!isAuto) this.notifyListeners('Upload failed', null);
            throw error;
        }
    }

    
    async syncDown() {
        try {
            const token = await this.getToken();
            if (!token) throw new Error('Not authenticated');

            this.notifyListeners('Downloading...', null);

            const fileId = await this.findBackupFile(token);
            if (!fileId) {
                console.log('[Sync] No backup found on Drive');
                this.notifyListeners('No backup found', null);
                return false; 
            }

            console.log('[Sync] Downloading backup file:', fileId);
            const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) throw new Error('Download failed');

            const backup = await response.json();

            if (backup && backup.data) {
                
                await chrome.storage.local.clear(); 
                await chrome.storage.local.set(backup.data);

                
                const now = Date.now();
                await chrome.storage.local.set({ last_sync_time: now });

                console.log('[Sync] Data restored successfully. Timestamp:', backup.timestamp);
                this.notifyListeners('Restored successfully', now);
                return true;
            }

            return false;
        } catch (error) {
            console.error('[Sync] Download failed:', error);
            this.notifyListeners('Download failed', null);
            throw error;
        }
    }

    
    async findBackupFile(token) {
        const q = `name = '${this.FILENAME}' and 'appDataFolder' in parents and trashed = false`;
        const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&spaces=appDataFolder&fields=files(id, name)`;

        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

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

        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', new Blob([content], { type: 'application/json' }));

        const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: form
        });

        if (!response.ok) throw new Error('Failed to create file');
    }

    
    async updateBackupFile(token, fileId, content) {
        const metadata = {
            name: this.FILENAME
        };

        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', new Blob([content], { type: 'application/json' }));

        const response = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${token}` },
            body: form
        });

        if (!response.ok) throw new Error('Failed to update file');
    }
}


const LuminaAuth = new AuthService();
const LuminaSync = new SyncManager();
