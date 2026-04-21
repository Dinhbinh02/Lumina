/**
 * Lumina Authentication & Sync Service
 * Handles Google Sign-In and Data Synchronization
 */

class AuthService {
    constructor() {
        this.user = null;
        this.listeners = [];
        this.isAuthenticated = false;

        // Load initial state
        this.init();

        // Periodically refresh token to prevent session expiry (using Alarms API for MV3)
        // Google OAuth tokens expire after 1 hour, so refresh every 45 mins
        chrome.alarms.create('tokenRefresh', { periodInMinutes: 45 });

        chrome.alarms.onAlarm.addListener((alarm) => {
            if (alarm.name === 'tokenRefresh') {
                this._refreshTokenIfNeeded();
            }
        });
    }

    /**
     * Initialize Auth Service: Restore session then verify
     */
    async init() {
        try {
            // Restore from storage
            const data = await chrome.storage.local.get(['google_user_info']);
            if (data.google_user_info) {

                this.user = data.google_user_info;
                this.isAuthenticated = true;
                this.notifyListeners();
            }
        } catch (e) {
            console.warn('[Auth] Init failed:', e);
        }

        // Verify/Refresh token in background
        this.checkAuthStatus();
    }

    /**
     * Refresh token before it expires (called periodically)
     */
    async _refreshTokenIfNeeded() {
        if (!this.isAuthenticated) return;

        try {
            console.log('[Auth] Periodic token refresh check...');
            const token = await this.getAuthToken(false, true); // Force refresh
            if (token) {
                console.log('[Auth] Token refreshed successfully');
            }
        } catch (e) {
            console.log('[Auth] Token refresh failed:', e.message);
            // Don't logout - just log the error, user can re-auth when needed
        }
    }

    /**
     * Check if user is already authenticated
     */
    async checkAuthStatus() {
        try {
            const token = await this.getAuthToken(false);
            if (token) {
                await this.fetchUserInfo(token);
            }
        } catch (e) {
            // Not authenticated or token expired
            console.log('[Auth] Check status failed:', e.message);

            // CRITICAL FIX: Do NOT logout immediately on background check failure.
            // This prevents random logouts due to network glitches or SW restarts.
            // Only explicit logout() or failed interactive login should clear state.
        }
    }

    /**
     * Get OAuth token from Chrome Identity
     * @param {boolean} interactive - Whether to show login popup if needed
     * @param {boolean} forceRefresh - Force token refresh (for expired tokens)
     */
    async getAuthToken(interactive = false, forceRefresh = false) {
        try {
            // Check for Custom Client ID first
            const data = await chrome.storage.local.get(['googleClientId']);
            if (data.googleClientId) {
                console.log('[Auth] Using custom Google Client ID, bypassing getAuthToken');
                return await this.loginWithWebAuthFlow(interactive);
            }

            // If forceRefresh, remove cached token first
            if (forceRefresh) {
                const oldToken = await this._getCachedToken();
                if (oldToken) {
                    await new Promise(resolve => {
                        chrome.identity.removeCachedAuthToken({ token: oldToken }, resolve);
                    });
                    console.log('[Auth] Removed cached token for refresh');
                }
            }

            return await new Promise((resolve, reject) => {
                chrome.identity.getAuthToken({ interactive }, (token) => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                    } else if (!token) {
                        reject(new Error('No token returned'));
                    } else {
                        resolve(token);
                    }
                });
            });
        } catch (error) {
            // 2. Check Local Storage (Fallback for Edge/WebAuthFlow)
            if (!interactive) {
                const local = await chrome.storage.local.get(['google_oauth_token', 'google_oauth_token_time']);
                if (local.google_oauth_token) {
                    // Check if token is still likely valid (less than 50 mins old)
                    const tokenAge = Date.now() - (local.google_oauth_token_time || 0);
                    if (tokenAge < 50 * 60 * 1000) {

                        return local.google_oauth_token;
                    } else {
                        console.log('[Auth] Cached token expired, needs re-auth');
                        await chrome.storage.local.remove(['google_oauth_token', 'google_oauth_token_time']);
                    }
                }
            }

            // Check for Edge or other unsupported browser errors
            const isEdgeError = error.message && (
                error.message.includes('not supported on Microsoft Edge') ||
                error.message.includes('Platform not supported') ||
                // Chrome identity failures generally
                true
            );

            // On Edge/Others: If getAuthToken failed and no local token, try silent WebAuthFlow
            if (isEdgeError) {
                try {
                    // console.log('Attempting WebAuthFlow fallback (interactive:', interactive, ')');
                    return await this.loginWithWebAuthFlow(interactive);
                } catch (webAuthError) {
                    // If silent refresh failed, just propagate a cleaner error or the webAuthError
                    // This avoids logging "API not supported" when the real issue is just "Not logged in"
                    if (webAuthError.message.includes('User interaction required') ||
                        webAuthError.message.includes('Authorization failed')) {
                        throw new Error('User interaction required');
                    }
                    throw webAuthError;
                }
            }
            throw error;
        }
    }

    /**
     * Helper to get cached token without triggering interactive flow
     */
    async _getCachedToken() {
        return new Promise((resolve) => {
            chrome.identity.getAuthToken({ interactive: false }, (token) => {
                if (chrome.runtime.lastError || !token) {
                    resolve(null);
                } else {
                    resolve(token);
                }
            });
        });
    }

    /**
     * Fallback Login flow for Edge/Other Browsers using launchWebAuthFlow
     */
    async loginWithWebAuthFlow(interactive = false) {
        const data = await chrome.storage.local.get(['googleClientId']);
        const clientId = data.googleClientId;
        const scopes = [
            "https://www.googleapis.com/auth/userinfo.email",
            "https://www.googleapis.com/auth/userinfo.profile",
            "https://www.googleapis.com/auth/drive.appdata"
        ];

        if (!clientId) throw new Error('Google Client ID is not set. Please set it in the extension settings first.');

        const redirectUri = chrome.identity.getRedirectURL(); // e.g., https://<id>.chromiumapp.org/
        // console.log('Redirect URI:', redirectUri); // <-- LOG FOR DEBUGGING
        const scopeStr = encodeURIComponent(scopes.join(' '));
        const authUrl = `https://accounts.google.com/o/oauth2/auth?client_id=${clientId}&response_type=token&redirect_uri=${redirectUri}&scope=${scopeStr}`;

        return new Promise((resolve, reject) => {
            chrome.identity.launchWebAuthFlow(
                {
                    url: authUrl,
                    interactive: interactive
                },
                async (redirectUrl) => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                        return;
                    }
                    if (!redirectUrl) {
                        reject(new Error('Authorization failed'));
                        return;
                    }

                    // Parse token from URL fragment
                    const url = new URL(redirectUrl);
                    const params = new URLSearchParams(url.hash.substring(1)); // Remove #
                    const token = params.get('access_token');

                    if (token) {
                        // SAVE TOKEN TO STORAGE for persistence (with timestamp)
                        await chrome.storage.local.set({
                            google_oauth_token: token,
                            google_oauth_token_time: Date.now()
                        });
                        resolve(token);
                    } else {
                        reject(new Error('No access token in response'));
                    }
                }
            );
        });
    }

    /**
     * Initiate Login Flow
     */
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

    /**
     * Logout and revoke token
     */
    async logout() {
        try {
            const token = await this.getAuthToken(false);
            if (token) {
                const url = 'https://accounts.google.com/o/oauth2/revoke?token=' + token;
                await fetch(url);

                // Remove cached token
                chrome.identity.removeCachedAuthToken({ token }, () => { });
            }
        } catch (e) {
            // Ignore if token already invalid
        }

        // ALWAYS clear local storage token and user info
        await chrome.storage.local.remove(['google_oauth_token', 'google_oauth_token_time', 'google_user_info']);

        // Clear refresh alarm
        chrome.alarms.clear('tokenRefresh');

        this.user = null;
        this.isAuthenticated = false;
        this.notifyListeners();
    }

    /**
     * Fetch Google User Profile
     * @param {string} token - OAuth token
     * @param {boolean} isRetry - Whether this is a retry after token refresh
     */
    async fetchUserInfo(token, isRetry = false) {
        try {
            const response = await fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                // If 401, token might be expired - try to refresh
                if (response.status === 401) {
                    await chrome.storage.local.remove(['google_oauth_token', 'google_oauth_token_time']);

                    // Try to get a fresh token (only once)
                    if (!isRetry) {
                        console.log('[Auth] Token expired, attempting refresh...');
                        const newToken = await this.getAuthToken(false, true); // Force refresh
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

            // Save to storage for persistence across restarts
            chrome.storage.local.set({ google_user_info: this.user });

            this.notifyListeners();
        } catch (e) {
            console.error('Fetch user info error:', e);
            throw e;
        }
    }

    /**
     * Subscribe to auth state changes
     */
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

// Auto Sync Interval: 2 Hours
const AUTO_SYNC_INTERVAL = 2 * 60 * 60 * 1000;

/**
 * Sync Manager - Handles data synchronization via Google Drive App Data
 * Allows large file syncing beyond chrome.storage.sync limits (100KB)
 */
class SyncManager {
    constructor() {
        this.authService = new AuthService();
        this.FILENAME = 'lumina_backup.json';
        this.listeners = [];

        // Initial check
        this.checkAutoSync();

        // Setup Interval Check (every 15 mins)
        setInterval(() => this.checkAutoSync(), 15 * 60 * 1000);
    }

    addListener(callback) {
        this.listeners.push(callback);
    }

    notifyListeners(status, lastSync) {
        this.listeners.forEach(cb => cb(status, lastSync));
    }

    /**
     * Check if auto-sync is needed
     */
    async checkAutoSync() {
        if (!this.authService.isAuthenticated) return;

        const result = await chrome.storage.local.get(['last_sync_time']);
        const lastSync = result.last_sync_time || 0;
        const now = Date.now();

        if (now - lastSync > AUTO_SYNC_INTERVAL) {
            console.log('[Sync] Auto-sync triggered');
            try {
                await this.syncUp(true); // IsAuto = true
            } catch (e) {
                console.error('[Sync] Auto-sync failed', e);
            }
        }
    }

    async getLastSyncTime() {
        const result = await chrome.storage.local.get(['last_sync_time']);
        return result.last_sync_time ? new Date(result.last_sync_time).toLocaleString() : 'Never';
    }

    /**
     * Helper: Get Auth Token
     */
    async getToken() {
        return await this.authService.getAuthToken(false);
    }

    /**
     * Upload: Sync all local settings to Google Drive
     */
    async syncUp(isAuto = false) {
        try {
            const token = await this.getToken();
            if (!token) throw new Error('Not authenticated');

            if (!isAuto) this.notifyListeners('Uploading...', null);

            // 1. Get ALL Local Data
            const localData = await chrome.storage.local.get(null);

            // Add metadata
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

            // Update Last Sync Time
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

    /**
     * Download: Restore settings from Google Drive
     */
    async syncDown() {
        try {
            const token = await this.getToken();
            if (!token) throw new Error('Not authenticated');

            this.notifyListeners('Downloading...', null);

            const fileId = await this.findBackupFile(token);
            if (!fileId) {
                console.log('[Sync] No backup found on Drive');
                this.notifyListeners('No backup found', null);
                return false; // No data to restore
            }

            console.log('[Sync] Downloading backup file:', fileId);
            const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) throw new Error('Download failed');

            const backup = await response.json();

            if (backup && backup.data) {
                // Restore to local storage
                await chrome.storage.local.clear(); // Optional: clear old junk?
                await chrome.storage.local.set(backup.data);

                // Update Last Sync Time
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

    /**
     * Find file ID in App Data Folder
     */
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

    /**
     * Create new file in App Data Folder
     */
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

    /**
     * Update existing file
     */
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

// Export singleton instance
const LuminaAuth = new AuthService();
const LuminaSync = new SyncManager();
