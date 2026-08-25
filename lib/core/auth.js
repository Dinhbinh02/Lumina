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

async function sha256Hash(str) {
    try {
        const msgUint8 = new TextEncoder().encode(str);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
        let h = 5381;
        for (let i = 0; i < str.length; i++) {
            h = ((h << 5) + h) + str.charCodeAt(i);
            h |= 0;
        }
        return 'fallback_' + h.toString(36);
    }
}

const isExcludedKey = (k) => [
    'google_oauth_token', 'google_oauth_token_time',
    'google_user_info', 'last_sync_time', 'last_sync_hash', 'last_sync_md5', 'last_sync_size',
    'drive_uploaded_blobs', 'drive_backup_file_id',
    'settings_last_updated', 'optionsLastSection', 'optionsLastScroll', 'optionsScrollPositions',
    'sidepanel_active_tab_index', 'sidepanel_active_group_index', 'sidepanel_secondary_tab_index',
    'sidepanel_is_split_mode', 'sidepanel_split_ratio',
    'lumina_active_tab_index', 'lumina_active_group_index', 'lumina_secondary_tab_index',
    'lumina_is_split_mode', 'lumina_split_ratio',
    'luminaWindowId', 'pendingMicToggle',
    'luminaTemplatesV3', 'luminaBatchHistoryV3', 'lastUsedGenAIModel',
    'lastUsedBatchSize', 'lastUsedDeck', 'lastUsedTemplateId', 'ankiQuickNoteContent',
    'attachments'
].includes(k) || k.includes('_inst_') || k.startsWith('pending_sidepanel_query_') || k.startsWith('rot_') ||
    k === 'audio_cache' || k.startsWith('lumina_img_cache_') || k.startsWith('lumina_img_query_') || k.startsWith('spotlight_history_') || k.startsWith('yt_transcript_');

const WEB_OAUTH_CONFIG = {
    clientId: "824888142961-mlpoj5jeqbo1lv2d61mho7cnnde9aicv.apps.googleusercontent.com",
    scopes: [
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile",
        "https://www.googleapis.com/auth/drive.appdata"
    ]
};

function launchGoogleWebAuthFlow(interactive) {
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
            // Cloud is authoritative: immediately pull cloud backup to replace local data
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

class SyncManager {
    _isPageContext() {
        return typeof window !== 'undefined';
    }
    _delegateSyncToBackground(action = 'lumina_drive_sync', params = {}) {
        this.notifyListeners('Syncing...', null);
        const wrapper = (typeof document !== 'undefined') ? document.getElementById('user-avatar-wrapper') : null;
        if (wrapper) wrapper.classList.add('is-syncing');

        return new Promise((resolve) => {
            try {
                chrome.runtime.sendMessage({ action, ...params }, (res) => {
                    if (chrome.runtime.lastError) {
                        console.warn('[Sync] SW delegate failed:', chrome.runtime.lastError.message);
                        if (wrapper) wrapper.classList.remove('is-syncing');
                        this.notifyListeners('Sync failure', null);
                    } else {
                        setTimeout(() => {
                            if (wrapper) wrapper.classList.remove('is-syncing');
                            this.notifyListeners('Synced just now', Date.now());
                        }, 500);
                    }
                    resolve(res);
                });
            } catch (e) {
                console.warn('[Sync] SW delegate error:', e);
                if (wrapper) wrapper.classList.remove('is-syncing');
                this.notifyListeners('Sync failure', null);
                resolve(null);
            }
        });
    }
    constructor(authService) {
        this.authService = authService || new AuthService();
        this.FILENAME = 'lumina_backup.json';
        this.listeners = [];
        this.isSyncing = false;

        const isBackground = typeof window === 'undefined';
        if (isBackground && typeof chrome !== 'undefined') {
            if (chrome.runtime && chrome.runtime.onStartup) {
                chrome.runtime.onStartup.addListener(() => {
                    this.checkAutoSync(true);
                });
            }
        } else if (typeof window !== 'undefined') {
            setTimeout(() => {
                this.checkAutoSync(true);
            }, 200);
        }

        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
            chrome.storage.onChanged.addListener((changes, area) => {
                if (area !== 'local') return;
                if (this.isSyncing) return;
                const keys = Object.keys(changes);
                const excludedKeys = [
                    'google_oauth_token', 'google_oauth_token_time',
                    'google_user_info', 'lumina_cached_user', 'last_sync_time', 'last_sync_hash', 'last_sync_md5', 'last_sync_size',
                    'drive_uploaded_blobs', 'drive_backup_file_id',
                    'settings_last_updated', 'optionsLastSection', 'optionsLastScroll', 'optionsScrollPositions',
                    'sidepanel_active_tab_index', 'sidepanel_active_group_index',
                    'lumina_active_tab_index', 'lumina_active_group_index'
                ];
                const hasSettingsKeys = keys.some(k =>
                    !k.startsWith('lumina_session_') &&
                    !k.startsWith('google_') &&
                    !excludedKeys.includes(k)
                );
                if (hasSettingsKeys) {
                    chrome.storage.local.set({ settings_last_updated: Date.now() });
                }
            });
        }
    }

    /**
     * Debounced push to cloud after user modifications on this device.
     */
    triggerDebouncedSync(delayMs = 1000) {
        if (!this.authService.isAuthenticated) return;
        if (this._debounceTimer) clearTimeout(this._debounceTimer);
        this._debounceTimer = setTimeout(() => {
            this._debounceTimer = null;
            this.pushToCloud().catch(err => console.error('[Sync] Debounced push failed:', err));
        }, delayMs);
    }

    addListener(callback) {
        this.listeners.push(callback);
    }
    notifyListeners(status, lastSync) {
        this.listeners.forEach(cb => cb(status, lastSync));
    }

    async checkAutoSync(forceCheck = false) {
        if (!this.authService.isAuthenticated) return;
        if (this._isPageContext()) {
            await this._delegateSyncToBackground('lumina_drive_sync', { isAuto: true });
            return;
        }
        try {
            await this.pullFromCloud(forceCheck);
        } catch (e) {
            console.error('[Sync] Auto-sync pull failed:', e);
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
        if (this._isPageContext()) return await this._delegateSyncToBackground('lumina_drive_sync', { isAuto: false, forcePush: true });
        return await this.pushToCloud();
    }

    async syncDown() {
        if (this._isPageContext()) return await this._delegateSyncToBackground('lumina_drive_sync', { isAuto: true, forcePull: true });
        return await this.pullFromCloud(true);
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

    async listAppDataFiles(token) {
        const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent("'appDataFolder' in parents and trashed = false")}&spaces=appDataFolder&fields=files(id, name, md5Checksum, modifiedTime, size)&pageSize=1000`;
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.status === 401 || response.status === 403) throw new Error('UNAUTHORIZED');
        if (!response.ok) throw new Error('Failed to list appData files');
        const data = await response.json();
        return data.files || [];
    }

    async uploadBlobFile(token, filename, blob, existingFileId = null) {
        const mimeType = (blob && blob.type) ? blob.type : 'application/octet-stream';
        const metadata = {
            name: filename,
            ...(existingFileId ? {} : { parents: ['appDataFolder'] })
        };
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', blob, filename);

        const url = existingFileId
            ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart&fields=id,name,md5Checksum,size`
            : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,md5Checksum,size`;

        const response = await fetch(url, {
            method: existingFileId ? 'PATCH' : 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: form
        });
        if (response.status === 401 || response.status === 403) throw new Error('UNAUTHORIZED');
        if (!response.ok) throw new Error(`Failed to upload blob ${filename}`);
        return await response.json();
    }

    async downloadBlobFile(token, fileId) {
        const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.status === 401 || response.status === 403) throw new Error('UNAUTHORIZED');
        if (!response.ok) throw new Error(`Failed to download blob ${fileId}`);
        return await response.blob();
    }

    async deleteDriveFile(token, fileId) {
        try {
            const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            return response.ok;
        } catch (e) {
            console.warn(`[Sync] Failed to delete drive file ${fileId}:`, e);
            return false;
        }
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
        const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,md5Checksum,size', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: form
        });
        if (response.status === 401 || response.status === 403) throw new Error('UNAUTHORIZED');
        if (!response.ok) throw new Error('Failed to create file');
        return await response.json();
    }

    async updateBackupFile(token, fileId, content) {
        const metadata = {
            name: this.FILENAME
        };
        const compressed = await compressData(content);
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', new Blob([compressed], { type: 'application/octet-stream' }));
        const response = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart&fields=id,name,md5Checksum,size`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${token}` },
            body: form
        });
        if (response.status === 401 || response.status === 403) throw new Error('UNAUTHORIZED');
        if (!response.ok) throw new Error('Failed to update file');
        return await response.json();
    }

    async getFileMetadata(token, fileId) {
        const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,md5Checksum,modifiedTime,size`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.status === 401 || response.status === 403) throw new Error('UNAUTHORIZED');
        if (!response.ok) return null;
        return await response.json();
    }

    async getOrFindBackupFile(token, forceRefresh = false) {
        let activeToken = token;
        let cachedId = this.cachedBackupFileId;
        if (!cachedId && !forceRefresh) {
            const stored = await chrome.storage.local.get(['drive_backup_file_id']);
            cachedId = stored.drive_backup_file_id;
        }

        if (cachedId && !forceRefresh) {
            try {
                const meta = await this.getFileMetadata(activeToken, cachedId);
                if (meta && meta.id) {
                    this.cachedBackupFileId = meta.id;
                    return { token: activeToken, remoteFile: meta, fileId: meta.id, driveFiles: null };
                }
            } catch (err) {
                if (err.message === 'UNAUTHORIZED') {
                    await chrome.storage.local.remove(['google_oauth_token', 'google_oauth_token_time']);
                    activeToken = await this.authService.getAuthToken(false, true);
                    const meta = await this.getFileMetadata(activeToken, cachedId).catch(() => null);
                    if (meta && meta.id) {
                        this.cachedBackupFileId = meta.id;
                        return { token: activeToken, remoteFile: meta, fileId: meta.id, driveFiles: null };
                    }
                }
            }
        }

        let driveFiles = [];
        try {
            driveFiles = await this.listAppDataFiles(activeToken);
        } catch (err) {
            if (err.message === 'UNAUTHORIZED') {
                await chrome.storage.local.remove(['google_oauth_token', 'google_oauth_token_time']);
                activeToken = await this.authService.getAuthToken(false, true);
                driveFiles = await this.listAppDataFiles(activeToken);
            } else {
                throw err;
            }
        }

        const remoteFile = driveFiles.find(f => f.name === this.FILENAME) || null;
        const fileId = remoteFile ? remoteFile.id : null;
        if (fileId) {
            this.cachedBackupFileId = fileId;
            chrome.storage.local.set({ drive_backup_file_id: fileId }).catch(() => {});
        }
        return { token: activeToken, remoteFile, fileId, driveFiles };
    }

    async fetchRemoteBackup(token, isAuto = false) {
        let activeToken = token;
        let driveFiles = [];
        try {
            driveFiles = await this.listAppDataFiles(activeToken);
        } catch (err) {
            if (err.message === 'UNAUTHORIZED') {
                await chrome.storage.local.remove(['google_oauth_token', 'google_oauth_token_time']);
                activeToken = await this.authService.getAuthToken(!isAuto, true);
                driveFiles = await this.listAppDataFiles(activeToken);
            } else {
                throw err;
            }
        }

        const remoteFile = driveFiles.find(f => f.name === this.FILENAME) || null;

        if (!remoteFile) {
            return { token: activeToken, remoteFile: null, remoteBackup: null, fileId: null, driveFiles };
        }

        const fileId = remoteFile.id;
        this.cachedBackupFileId = fileId;
        chrome.storage.local.set({ drive_backup_file_id: fileId }).catch(() => {});
        const remoteBackup = await this.downloadBackup(activeToken, fileId);
        return { token: activeToken, remoteFile, remoteBackup, fileId, lastSyncMd5: remoteFile.md5Checksum, driveFiles };
    }

    async gatherLocalData() {
        const localData = await chrome.storage.local.get(null);

        // Gather Notes & Collections from NotesManager / IndexedDB
        if (typeof NotesManager !== 'undefined') {
            try {
                localData.lumina_notes_collections = typeof NotesManager.getAllCollectionsRaw === 'function'
                    ? await NotesManager.getAllCollectionsRaw()
                    : await NotesManager.getCollections(true);
                localData.lumina_notes_items = typeof NotesManager.getAllNotesRaw === 'function'
                    ? await NotesManager.getAllNotesRaw()
                    : await NotesManager.getNotes(null, true);
            } catch (err) {
                console.error('[Sync] Failed to gather notes for sync:', err);
            }
        }

        // Gather TTS recordings (Metadata only for JSON, blob handled separately)
        if (typeof TTSDB !== 'undefined') {
            try {
                const recordings = typeof TTSDB.getAllRecordingsRaw === 'function'
                    ? await TTSDB.getAllRecordingsRaw()
                    : await TTSDB.getAllRecordings(true);
                localData.lumina_tts_recordings = recordings.map(rec => {
                    const { audioBlob, ...meta } = rec;
                    return meta;
                });
            } catch (err) {
                console.error('[Sync] Failed to gather TTS recordings for sync:', err);
            }
        }

        // Load highlights/annotations from IndexedDB
        if (typeof LuminaAnnotationDB !== 'undefined') {
            try {
                const highlights = await LuminaAnnotationDB.getAll();
                Object.assign(localData, highlights);
            } catch (err) {
                console.error('[Sync] Failed to load highlights from IndexedDB:', err);
            }
        }

        // Load chat history from IndexedDB
        if (typeof LuminaChatDB !== 'undefined') {
            try {
                const sessions = typeof LuminaChatDB.getAllSessionsRaw === 'function'
                    ? await LuminaChatDB.getAllSessionsRaw()
                    : await LuminaChatDB.getAllSessions(true);
                const sessionsObj = {};
                for (const s of Object.values(sessions)) {
                    if (s && s.id) {
                        sessionsObj[s.id] = s;
                        if (!s.isDeleted) {
                            localData[`lumina_session_${s.id}`] = await LuminaChatDB.getMessages(s.id).catch(() => []);
                        }
                    }
                }
                localData.lumina_chat_sessions = sessionsObj;
            } catch (err) {
                console.error('[Sync] Failed to load chats from IndexedDB:', err);
            }
        }

        return localData;
    }

    /**
     * PULL FROM CLOUD — Cloud is authoritative.
     * Overwrites local Dexie/IndexedDB and chrome.storage.local entirely with cloud backup.
     * Does NOT push anything to cloud.
     */
    async pullFromCloud(force = false) {
        if (this._isPageContext()) {
            return await this._delegateSyncToBackground('lumina_drive_sync', { isAuto: true, forcePull: force });
        }
        if (this.isSyncing) return;
        this.isSyncing = true;
        this.notifyListeners('Syncing...', null);
        try {
            try { chrome.runtime.sendMessage({ action: 'lumina_sync_status', status: 'syncing' }).catch(() => {}); } catch (e) {}
            const initialToken = await this.getToken(!force);
            if (!initialToken) throw new Error('Not authenticated');

            const localSync = await chrome.storage.local.get(['last_sync_md5']);
            const { token, remoteFile, fileId, driveFiles } = await this.getOrFindBackupFile(initialToken, force);

            if (!remoteFile || !fileId) {
                this.notifyListeners('No cloud data', null);
                try { chrome.runtime.sendMessage({ action: 'lumina_sync_status', status: 'done', timestamp: Date.now() }).catch(() => {}); } catch (e) {}
                return null;
            }

            // If MD5 matches and not forced, Cloud has NOT changed! Skip download!
            if (!force && remoteFile.md5Checksum && localSync.last_sync_md5 && remoteFile.md5Checksum === localSync.last_sync_md5) {
                const now = Date.now();
                this.notifyListeners('Synced just now', now);
                try { chrome.runtime.sendMessage({ action: 'lumina_sync_status', status: 'done', timestamp: now }).catch(() => {}); } catch (e) {}
                return now;
            }

            const remoteBackup = await this.downloadBackup(token, fileId);

            if (!remoteBackup || !remoteBackup.data) {
                this.notifyListeners('No cloud data', null);
                try { chrome.runtime.sendMessage({ action: 'lumina_sync_status', status: 'done', timestamp: Date.now() }).catch(() => {}); } catch (e) {}
                return null;
            }

            const remoteData = remoteBackup.data;
            delete remoteData.attachments; // Backward compatibility cleanup

            // 1. Replace chrome.storage.local keys with remoteData
            const currentLocal = await chrome.storage.local.get(null);
            const keysToRemove = [];
            for (const key of Object.keys(currentLocal)) {
                if (isExcludedKey(key)) continue;
                if (key.startsWith('lumina_session_') || key === 'lumina_chat_sessions') continue;
                if (key.startsWith('highlights_')) continue;
                if (!(key in remoteData)) {
                    keysToRemove.push(key);
                }
            }
            if (keysToRemove.length > 0) {
                await chrome.storage.local.remove(keysToRemove);
            }

            const storageToSet = {};
            for (const [k, v] of Object.entries(remoteData)) {
                if (isExcludedKey(k)) continue;
                if (k.startsWith('lumina_session_') || k === 'lumina_chat_sessions') continue;
                if (k.startsWith('highlights_')) continue;
                storageToSet[k] = v;
            }
            if (Object.keys(storageToSet).length > 0) {
                await chrome.storage.local.set(storageToSet);
            }

            // 2. Overwrite Highlights in IndexedDB
            if (typeof LuminaAnnotationDB !== 'undefined') {
                const currentHighlights = await LuminaAnnotationDB.getAll().catch(() => ({}));
                for (const key of Object.keys(currentHighlights)) {
                    if (!(key in remoteData)) {
                        await LuminaAnnotationDB.delete(key).catch(() => {});
                    }
                }
                for (const [k, v] of Object.entries(remoteData)) {
                    if (k.startsWith('highlights_')) {
                        await LuminaAnnotationDB.put(k, v).catch(() => {});
                    }
                }
            }

            // 3. Overwrite Chat Sessions & Messages in IndexedDB
            const remoteSessions = remoteData.lumina_chat_sessions || {};
            const activeAttachmentIds = new Set();

            if (typeof LuminaChatDB !== 'undefined') {
                try {
                    const currentSessions = await LuminaChatDB.getAllSessions().catch(() => ({}));
                    for (const s of Object.values(currentSessions)) {
                        if (s && s.id && !remoteSessions[s.id]) {
                            await LuminaChatDB.deleteSession(s.id).catch(() => {});
                            await LuminaChatDB.deleteMessages(s.id).catch(() => {});
                        }
                    }
                    for (const [sid, sessionMeta] of Object.entries(remoteSessions)) {
                        await LuminaChatDB.putSession(sessionMeta).catch(() => {});
                        if (sessionMeta && sessionMeta.isDeleted) {
                            await LuminaChatDB.deleteMessages(sid).catch(() => {});
                        } else {
                            const sessionKey = `lumina_session_${sid}`;
                            const messages = remoteData[sessionKey];
                            if (Array.isArray(messages)) {
                                await LuminaChatDB.putMessages(sid, messages).catch(() => {});
                                for (const msg of messages) {
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
                    }
                } catch (err) {
                    console.error('[Sync] Failed to apply chats from cloud:', err);
                }
            }

            // 4. Overwrite Notes & Collections via NotesManager
            if (typeof NotesManager !== 'undefined') {
                try {
                    const remoteCollections = remoteData.lumina_notes_collections;
                    const remoteNotes = remoteData.lumina_notes_items;
                    const db = await NotesManager.getDB();

                    if (Array.isArray(remoteCollections)) {
                        const remoteColIds = new Set(remoteCollections.map(c => c && c.id).filter(Boolean));
                        const currentCols = await NotesManager.getCollections().catch(() => []);
                        const txCol = db.transaction(NotesManager.STORE_COLLECTIONS, 'readwrite');
                        const storeCol = txCol.objectStore(NotesManager.STORE_COLLECTIONS);
                        for (const c of currentCols) {
                            if (c && c.id && !remoteColIds.has(c.id)) {
                                storeCol.delete(c.id);
                            }
                        }
                        for (const col of remoteCollections) {
                            if (col && col.id) storeCol.put(col);
                        }
                    }

                    if (Array.isArray(remoteNotes)) {
                        const remoteNoteIds = new Set(remoteNotes.map(n => n && n.id).filter(Boolean));
                        const currentNotes = await NotesManager.getNotes().catch(() => []);
                        const txNote = db.transaction(NotesManager.STORE_NOTES, 'readwrite');
                        const storeNote = txNote.objectStore(NotesManager.STORE_NOTES);
                        for (const n of currentNotes) {
                            if (n && n.id && !remoteNoteIds.has(n.id)) {
                                storeNote.delete(n.id);
                            }
                        }
                        for (const note of remoteNotes) {
                            if (note && note.id) storeNote.put(note);
                        }
                    }
                } catch (err) {
                    console.error('[Sync] Failed to apply notes from cloud:', err);
                }
            }

            // 5. Overwrite TTS Recordings in TTSDB
            const activeTtsRecMap = new Map();
            let ttsUpdated = false;
            if (typeof TTSDB !== 'undefined' && Array.isArray(remoteData.lumina_tts_recordings)) {
                try {
                    const remoteRecs = remoteData.lumina_tts_recordings;
                    const remoteRecIds = new Set(remoteRecs.map(r => r && r.id).filter(Boolean));
                    const currentRecs = await TTSDB.getAllRecordings().catch(() => []);
                    const currentMap = new Map(currentRecs.map(r => [r.id, r]));

                    for (const r of currentRecs) {
                        if (r && r.id && !remoteRecIds.has(r.id)) {
                            await TTSDB.deleteRecording(r.id).catch(() => {});
                            ttsUpdated = true;
                        }
                    }

                    for (const recMeta of remoteRecs) {
                        if (recMeta && recMeta.id) {
                            if (!recMeta.isDeleted) activeTtsRecMap.set(recMeta.id, recMeta);
                            const localRec = currentMap.get(recMeta.id);
                            await TTSDB.saveRecording({
                                ...recMeta,
                                audioBlob: localRec ? localRec.audioBlob : null
                            }).catch(() => {});
                            ttsUpdated = true;
                        }
                    }
                } catch (err) {
                    console.error('[Sync] Failed to apply TTS records from cloud:', err);
                }
            }

            // 6. Download remote blobs (attachments & TTS audio)
            let actualDriveFiles = driveFiles;
            if (!actualDriveFiles && (activeAttachmentIds.size > 0 || activeTtsRecMap.size > 0)) {
                actualDriveFiles = await this.listAppDataFiles(token).catch(() => []);
            }
            const driveFileMap = new Map((actualDriveFiles || []).map(f => [f.name, f]));

            // Download missing attachments
            if (typeof LuminaAttachmentDB !== 'undefined' && LuminaAttachmentDB.init) {
                const db = await LuminaAttachmentDB.init();
                for (const [filename, fileObj] of driveFileMap.entries()) {
                    if (filename.startsWith('att_') && filename.endsWith('.bin')) {
                        const key = filename.slice(4, -4);
                        if (activeAttachmentIds.has(key)) {
                            const exists = await LuminaAttachmentDB.get(key).catch(() => null);
                            if (!exists) {
                                try {
                                    const downloadedBlob = await this.downloadBlobFile(token, fileObj.id);
                                    if (downloadedBlob) {
                                        await LuminaAttachmentDB.put(key, downloadedBlob);
                                    }
                                } catch (err) {
                                    console.warn(`[Sync] Failed to download attachment ${key}:`, err);
                                }
                            }
                        }
                    }
                }

                // Clean up local orphaned attachments
                try {
                    const metadata = await LuminaAttachmentDB.getAllMetadata();
                    for (const item of metadata) {
                        if (!activeAttachmentIds.has(item.key)) {
                            await LuminaAttachmentDB.delete(item.key);
                        }
                    }
                } catch (cleanupErr) {}
            }

            // Download missing TTS audio
            if (typeof TTSDB !== 'undefined') {
                let ttsAudioDownloaded = false;
                const currentRecs = await TTSDB.getAllRecordings().catch(() => []);
                const localRecMap = new Map(currentRecs.map(r => [r.id, r]));

                for (const [filename, fileObj] of driveFileMap.entries()) {
                    if (filename.startsWith('tts_') && filename.endsWith('.bin')) {
                        const id = filename.slice(4, -4);
                        const localRec = localRecMap.get(id);
                        if (activeTtsRecMap.has(id) && localRec && !localRec.audioBlob) {
                            try {
                                const downloadedBlob = await this.downloadBlobFile(token, fileObj.id);
                                if (downloadedBlob) {
                                    localRec.audioBlob = downloadedBlob;
                                    await TTSDB.saveRecording(localRec);
                                    ttsAudioDownloaded = true;
                                }
                            } catch (err) {
                                console.warn(`[Sync] Failed to download TTS audio ${id}:`, err);
                            }
                        }
                    }
                }
                if (ttsAudioDownloaded) ttsUpdated = true;
            }

            // 7. Update Sync Metadata
            const now = Date.now();
            await chrome.storage.local.set({
                last_sync_time: now,
                last_sync_md5: remoteFile ? remoteFile.md5Checksum : null,
                last_sync_size: remoteFile ? remoteFile.size : null
            });
            if (typeof globalThis !== 'undefined') globalThis._lastDriveSyncAt = now;

            // 8. Broadcast UI updates to all components
            try {
                chrome.runtime.sendMessage({ action: 'lumina_sessions_index_updated' }).catch(() => {});
                chrome.runtime.sendMessage({ action: 'lumina_notes_updated' }).catch(() => {});
                chrome.runtime.sendMessage({ action: 'lumina_highlights_updated' }).catch(() => {});
                if (ttsUpdated) {
                    chrome.runtime.sendMessage({ action: 'lumina_tts_updated' }).catch(() => {});
                }
                chrome.runtime.sendMessage({ action: 'lumina_sync_status', status: 'done', timestamp: now }).catch(() => {});
            } catch (e) {}

            this.notifyListeners('Synced just now', now);
            return now;
        } catch (error) {
            console.error('[Sync] pullFromCloud error:', error);
            this.notifyListeners('Sync failure', null);
            try { chrome.runtime.sendMessage({ action: 'lumina_sync_status', status: 'failure' }).catch(() => {}); } catch (e) {}
            throw error;
        } finally {
            this.isSyncing = false;
        }
    }

    /**
     * PUSH TO CLOUD — Uploads local data to Google Drive.
     * Called after user actions (creating notes, changing settings, saving chat).
     */
    async pushToCloud() {
        if (this._isPageContext()) {
            return await this._delegateSyncToBackground('lumina_drive_sync', { isAuto: false, forcePush: true });
        }
        if (this.isSyncing) return;
        this.isSyncing = true;
        try {
            const initialToken = await this.getToken(true);
            if (!initialToken) throw new Error('Not authenticated');

            let { token, fileId, driveFiles } = await this.getOrFindBackupFile(initialToken, false);
            const localData = await this.gatherLocalData();

            // Notify UI
            this.notifyListeners('Syncing...', null);
            try { chrome.runtime.sendMessage({ action: 'lumina_sync_status', status: 'syncing' }).catch(() => {}); } catch (e) {}

            const dataToUpload = { ...localData };
            const payload = {
                timestamp: new Date().toISOString(),
                version: chrome.runtime.getManifest().version,
                data: dataToUpload
            };

            let uploadRes;
            try {
                uploadRes = fileId
                    ? await this.updateBackupFile(token, fileId, JSON.stringify(payload))
                    : await this.createBackupFile(token, JSON.stringify(payload));
            } catch (err) {
                // If 404 or file not found on Drive, refresh fileId and try creating or re-updating
                if (fileId) {
                    const refreshed = await this.getOrFindBackupFile(token, true);
                    token = refreshed.token;
                    fileId = refreshed.fileId;
                    uploadRes = fileId
                        ? await this.updateBackupFile(token, fileId, JSON.stringify(payload))
                        : await this.createBackupFile(token, JSON.stringify(payload));
                } else {
                    throw err;
                }
            }

            if (uploadRes && uploadRes.id) {
                this.cachedBackupFileId = uploadRes.id;
                chrome.storage.local.set({ drive_backup_file_id: uploadRes.id }).catch(() => {});
            }

            const newUploadedMd5 = (uploadRes && typeof uploadRes === 'object') ? uploadRes.md5Checksum : uploadRes;
            const newUploadedSize = (uploadRes && typeof uploadRes === 'object') ? uploadRes.size : null;

            // Track and skip already uploaded blobs so we NEVER re-upload existing blobs repeatedly!
            const storedBlobs = await chrome.storage.local.get(['drive_uploaded_blobs']);
            const uploadedBlobSet = new Set(storedBlobs.drive_uploaded_blobs || []);
            let hasNewBlobs = false;

            // Upload missing local attachments
            if (typeof LuminaAttachmentDB !== 'undefined' && LuminaAttachmentDB.init) {
                const db = await LuminaAttachmentDB.init();
                const localAttachments = await new Promise((resolve) => {
                    const tx = db.transaction(LuminaAttachmentDB.STORE_NAME, 'readonly');
                    const store = tx.objectStore(LuminaAttachmentDB.STORE_NAME);
                    const req = store.openCursor();
                    const map = new Map();
                    req.onsuccess = (e) => {
                        const cursor = e.target.result;
                        if (cursor) {
                            if (cursor.value instanceof Blob) map.set(cursor.key, cursor.value);
                            cursor.continue();
                        } else resolve(map);
                    };
                    req.onerror = () => resolve(map);
                });

                for (const [key, blob] of localAttachments.entries()) {
                    const filename = `att_${key}.bin`;
                    if (!uploadedBlobSet.has(filename) && blob) {
                        try {
                            await this.uploadBlobFile(token, filename, blob);
                            uploadedBlobSet.add(filename);
                            hasNewBlobs = true;
                        } catch (err) {
                            console.warn(`[Sync] Failed to upload attachment ${key}:`, err);
                        }
                    }
                }
            }

            // Upload missing local TTS audio
            if (typeof TTSDB !== 'undefined') {
                const currentRecs = await TTSDB.getAllRecordings().catch(() => []);
                for (const rec of currentRecs) {
                    if (rec && rec.id && rec.audioBlob instanceof Blob) {
                        const filename = `tts_${rec.id}.bin`;
                        if (!uploadedBlobSet.has(filename)) {
                            try {
                                await this.uploadBlobFile(token, filename, rec.audioBlob);
                                uploadedBlobSet.add(filename);
                                hasNewBlobs = true;
                            } catch (err) {
                                console.warn(`[Sync] Failed to upload TTS audio ${rec.id}:`, err);
                            }
                        }
                    }
                }
            }

            if (hasNewBlobs || !storedBlobs.drive_uploaded_blobs) {
                await chrome.storage.local.set({ drive_uploaded_blobs: Array.from(uploadedBlobSet) });
            }

            const now = Date.now();
            await chrome.storage.local.set({
                last_sync_time: now,
                last_sync_md5: newUploadedMd5,
                last_sync_size: newUploadedSize
            });

            if (typeof globalThis !== 'undefined') globalThis._lastDriveSyncAt = now;

            this.notifyListeners('Synced just now', now);
            try { chrome.runtime.sendMessage({ action: 'lumina_sync_status', status: 'done', timestamp: now }).catch(() => {}); } catch (e) {}
            return now;
        } catch (error) {
            console.error('[Sync] pushToCloud error:', error);
            this.notifyListeners('Sync failure', null);
            try { chrome.runtime.sendMessage({ action: 'lumina_sync_status', status: 'failure' }).catch(() => {}); } catch (e) {}
            throw error;
        } finally {
            this.isSyncing = false;
        }
    }

    /**
     * Cleans up duplicate files on Google Drive (keeps the latest, deletes older copies).
     */
    async cleanDriveDuplicates() {
        if (this._isPageContext()) {
            return await this._delegateSyncToBackground('lumina_clean_drive_duplicates');
        }
        const token = await this.getToken(true);
        if (!token) return { success: false, error: 'Not authenticated' };

        const allFiles = await this.listAppDataFiles(token);
        if (!Array.isArray(allFiles) || allFiles.length === 0) return { success: true, deletedCount: 0 };

        // Group by filename
        const fileMap = new Map();
        for (const file of allFiles) {
            if (!fileMap.has(file.name)) {
                fileMap.set(file.name, []);
            }
            fileMap.get(file.name).push(file);
        }

        let deletedCount = 0;
        for (const [name, files] of fileMap.entries()) {
            if (files.length > 1) {
                // Sort by modifiedTime descending (newest first)
                files.sort((a, b) => new Date(b.modifiedTime || 0) - new Date(a.modifiedTime || 0));
                // Keep the first (newest), delete all older duplicates
                const toDelete = files.slice(1);
                for (const f of toDelete) {
                    console.log(`[Sync] Deleting duplicate file on Drive: ${f.name} (id: ${f.id})`);
                    await this.deleteDriveFile(token, f.id);
                    deletedCount++;
                }
            }
        }

        // Also update local cache of uploaded blobs
        const uniqueBlobNames = Array.from(fileMap.keys()).filter(n => n.endsWith('.bin'));
        await chrome.storage.local.set({ drive_uploaded_blobs: uniqueBlobNames });

        console.log(`[Sync] Cleaned ${deletedCount} duplicate files on Google Drive.`);
        return { success: true, deletedCount };
    }

    /**
     * Prints a clean table of all files on Google Drive appDataFolder.
     */
    async showDriveFiles() {
        const token = await this.getToken(true);
        if (!token) {
            console.warn('[Sync] Not authenticated');
            return [];
        }
        const files = await this.listAppDataFiles(token);
        console.table(files.map(f => ({
            Name: f.name,
            Size: (f.size / 1024).toFixed(1) + ' KB',
            MD5: f.md5Checksum ? f.md5Checksum.slice(0, 10) + '...' : 'N/A',
            Modified: new Date(f.modifiedTime).toLocaleString(),
            ID: f.id
        })));
        return files;
    }

    /**
     * Cleans up orphaned blob files (att_*, blob_att_*, tts_*, blob_tts_*) on Google Drive that are no longer referenced in local data.
     */
    async cleanOrphanedDriveBlobs() {
        const token = await this.getToken(true);
        if (!token) return { success: false, error: 'Not authenticated' };

        const allFiles = await this.listAppDataFiles(token);
        if (!Array.isArray(allFiles) || allFiles.length === 0) return { success: true, deletedCount: 0 };

        // Collect all active attachment IDs from ChatDB & Notes
        const activeAttachmentKeys = new Set();
        if (typeof LuminaChatDB !== 'undefined') {
            try {
                const sessions = await LuminaChatDB.getAllSessions(true).catch(() => ({}));
                for (const sid of Object.keys(sessions)) {
                    const msgs = await LuminaChatDB.getMessages(sid).catch(() => []);
                    for (const m of msgs) {
                        if (Array.isArray(m.files)) {
                            for (const f of m.files) {
                                if (f && f.attachmentId) activeAttachmentKeys.add(String(f.attachmentId));
                            }
                        }
                    }
                }
            } catch (e) {}
        }

        // Collect active TTS IDs
        const activeTtsIds = new Set();
        if (typeof TTSDB !== 'undefined') {
            try {
                const recs = await TTSDB.getAllRecordings().catch(() => []);
                for (const r of recs) {
                    if (r && r.id && !r.isDeleted) activeTtsIds.add(String(r.id));
                }
            } catch (e) {}
        }

        let deletedCount = 0;
        for (const file of allFiles) {
            const name = file.name;
            let isOrphan = false;

            // Check old & new attachment naming
            if (name.startsWith('att_') && name.endsWith('.bin')) {
                const key = name.slice(4, -4);
                if (!activeAttachmentKeys.has(key)) isOrphan = true;
            } else if (name.startsWith('blob_att_')) {
                isOrphan = true;
                for (const key of activeAttachmentKeys) {
                    if (name.includes(key)) { isOrphan = false; break; }
                }
            } else if (name.startsWith('tts_') && name.endsWith('.bin')) {
                const id = name.slice(4, -4);
                if (!activeTtsIds.has(id)) isOrphan = true;
            } else if (name.startsWith('blob_tts_')) {
                isOrphan = true;
                for (const id of activeTtsIds) {
                    if (name.includes(id)) { isOrphan = false; break; }
                }
            }

            if (isOrphan) {
                console.log(`[Sync] Deleting orphaned file on Drive: ${name} (id: ${file.id})`);
                await this.deleteDriveFile(token, file.id);
                deletedCount++;
            }
        }

        // Update local cache
        const remainingFiles = await this.listAppDataFiles(token);
        const uniqueBlobNames = (remainingFiles || []).map(f => f.name).filter(n => n.endsWith('.bin'));
        await chrome.storage.local.set({ drive_uploaded_blobs: uniqueBlobNames });

        console.log(`[Sync] Cleaned ${deletedCount} orphaned blob files on Google Drive.`);
        return { success: true, deletedCount };
    }

    /**
     * Downloads lumina_backup.json from Google Drive and saves it as a file on your computer.
     */
    async downloadBackupFileToComputer() {
        const token = await this.getToken(true);
        if (!token) throw new Error('Not authenticated');
        const files = await this.listAppDataFiles(token);
        const remoteFile = files.find(f => f.name === this.FILENAME);
        if (!remoteFile) throw new Error('lumina_backup.json not found on Google Drive');
        const data = await this.downloadBackup(token, remoteFile.id);
        const jsonStr = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `lumina_backup_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        console.log('[Sync] Backup downloaded successfully!');
        return data;
    }

    /**
     * Backward compatible sync entry point.
     */
    async syncData(isAuto = false) {
        if (isAuto) {
            return await this.pullFromCloud(false);
        } else {
            return await this.pushToCloud();
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
