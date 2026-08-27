export const WEB_OAUTH_CONFIG = {
    clientId: "824888142961-mlpoj5jeqbo1lv2d61mho7cnnde9aicv.apps.googleusercontent.com",
    scopes: [
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile",
        "https://www.googleapis.com/auth/drive.appdata"
    ]
};

export function launchGoogleWebAuthFlow(interactive) {
    return new Promise((resolve, reject) => {
        const redirectUri = chrome.identity.getRedirectURL();
        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
            `client_id=${encodeURIComponent(WEB_OAUTH_CONFIG.clientId)}&` +
            `response_type=token&` +
            `redirect_uri=${encodeURIComponent(redirectUri)}&` +
            `scope=${encodeURIComponent(WEB_OAUTH_CONFIG.scopes.join(' '))}`;

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

export class AuthService {
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
        this.notifyListeners(this.isAuthenticated, this.user);
        if (this.isAuthenticated && typeof window !== 'undefined') {
            setTimeout(() => {
                if (typeof LuminaSync !== 'undefined') {
                    LuminaSync.checkAutoSync(true);
                }
            }, 100);
        }
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
                } catch (e) { }
            }
            const token = await launchGoogleWebAuthFlow(interactive);
            this._cachedToken = token;
            return token;
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
                            launchGoogleWebAuthFlow(interactive)
                                .then((t) => {
                                    this._cachedToken = t;
                                    resolve(t);
                                })
                                .catch(reject);
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
            if (typeof LuminaSync !== 'undefined') {
                await LuminaSync.pullFromCloud(true).catch(e => console.warn('[Auth] Post-login pull error:', e));
            }
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
                } catch (e) { }
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
                        const newToken = await this.getAuthToken(false, true);
                        if (newToken && newToken !== token) {
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
            const wasAuth = this.isAuthenticated;
            this.isAuthenticated = true;
            chrome.storage.local.set({ google_user_info: this.user });
            if (!wasAuth) {
                this.notifyListeners();
            }
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

export const LuminaAuth = new AuthService();
if (typeof window !== 'undefined') {
    window.LuminaAuth = LuminaAuth;
}
