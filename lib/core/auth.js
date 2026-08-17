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
        // Fallback for non-secure contexts if any
        let h = 5381;
        for (let i = 0; i < str.length; i++) {
            h = ((h << 5) + h) + str.charCodeAt(i);
            h |= 0;
        }
        return 'fallback_' + h.toString(36);
    }
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

function getEntityTime(item) {
    if (!item || typeof item !== 'object') return 0;
    return item.updatedAt || item.createdAt || item.timestamp || item.time || 0;
}

/**
 * Standard LWW (Last-Write-Wins) Element-Set merge function.
 * Supports both Array collections and Object maps.
 * Handles single-sided items (always preserved) and conflicts (newest timestamp wins).
 */
function mergeEntities(localCollection, remoteCollection, options = {}) {
    const isArrayFormat = Array.isArray(localCollection) || Array.isArray(remoteCollection);
    const tombstoneRetentionMs = options.tombstoneRetentionMs || (30 * 24 * 60 * 60 * 1000); // 30 days
    const now = Date.now();
    
    // Normalize to Maps indexed by entity ID
    const localMap = new Map();
    const remoteMap = new Map();

    if (isArrayFormat) {
        const localList = Array.isArray(localCollection) ? localCollection : [];
        const remoteList = Array.isArray(remoteCollection) ? remoteCollection : [];
        localList.forEach(item => { if (item && item.id) localMap.set(item.id, item); });
        remoteList.forEach(item => { if (item && item.id) remoteMap.set(item.id, item); });
    } else {
        const localObj = (localCollection && typeof localCollection === 'object') ? localCollection : {};
        const remoteObj = (remoteCollection && typeof remoteCollection === 'object') ? remoteCollection : {};
        Object.entries(localObj).forEach(([id, item]) => {
            if (item && typeof item === 'object') localMap.set(id, item.id ? item : { ...item, id });
        });
        Object.entries(remoteObj).forEach(([id, item]) => {
            if (item && typeof item === 'object') remoteMap.set(id, item.id ? item : { ...item, id });
        });
    }

    const mergedMap = new Map();
    const allIds = new Set([...localMap.keys(), ...remoteMap.keys()]);

    for (const id of allIds) {
        const localItem = localMap.get(id);
        const remoteItem = remoteMap.get(id);

        let chosen = null;
        if (localItem && remoteItem) {
            const localTime = getEntityTime(localItem);
            const remoteTime = getEntityTime(remoteItem);
            chosen = localTime >= remoteTime ? localItem : remoteItem;
        } else if (localItem) {
            chosen = localItem;
        } else if (remoteItem) {
            chosen = remoteItem;
        }

        if (chosen) {
            if (chosen.isDeleted) {
                const itemTime = getEntityTime(chosen);
                // Prune tombstones older than retention window (30 days)
                if (now - itemTime < tombstoneRetentionMs) {
                    mergedMap.set(id, chosen);
                }
            } else {
                mergedMap.set(id, chosen);
            }
        }
    }

    if (isArrayFormat) {
        return Array.from(mergedMap.values());
    } else {
        const resultMap = {};
        for (const [id, item] of mergedMap.entries()) {
            resultMap[id] = item;
        }
        return resultMap;
    }
}

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
        this.notifyListeners();
        if (this.isAuthenticated && typeof LuminaSync !== 'undefined') {
            // Only auto-sync on init in page context (when user opens Lumina UI), NOT on every background SW wake-up!
            if (typeof window !== 'undefined') {
                LuminaSync.checkAutoSync(true);
            }
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
    _delegateSyncToBackground(isAuto = false) {
        return new Promise((resolve) => {
            try {
                chrome.runtime.sendMessage({ action: 'lumina_drive_sync', isAuto }, (res) => {
                    if (chrome.runtime.lastError) {
                        console.warn('[Sync] SW delegate failed:', chrome.runtime.lastError.message);
                    }
                    resolve(res);
                });
            } catch (e) {
                console.warn('[Sync] SW delegate error:', e);
                resolve(null);
            }
        });
    }
    constructor(authService) {
        this.authService = authService || new AuthService();
        this.FILENAME = 'lumina_backup.json';
        this.listeners = [];
        this.isSyncing = false;

        // Auto sync is managed upon AuthService init completion

        const isBackground = typeof window === 'undefined';
        if (isBackground && typeof chrome !== 'undefined') {
            if (chrome.runtime && chrome.runtime.onStartup) {
                chrome.runtime.onStartup.addListener(() => {
                    this.checkAutoSync(true);
                });
            }
        }

        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
            chrome.storage.onChanged.addListener((changes, area) => {
                if (area !== 'local') return;
                if (this.isSyncing) return;
                const keys = Object.keys(changes);
                const excludedKeys = [
                    'google_oauth_token', 'google_oauth_token_time',
                    'google_user_info', 'lumina_cached_user', 'last_sync_time', 'last_sync_hash', 'last_sync_md5',
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

    triggerDebouncedSync(delayMs = 2000) {
        if (!this.authService.isAuthenticated) return;
        if (this._debounceTimer) clearTimeout(this._debounceTimer);
        this._debounceTimer = setTimeout(() => {
            this._debounceTimer = null;
            this.syncData(true).catch(err => console.error('[Sync] Debounced sync failed:', err));
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
        // In page context, delegate to Service Worker to avoid duplicate Drive requests
        if (this._isPageContext()) {
            await this._delegateSyncToBackground(true);
            return;
        }
        try {
            await this.syncData(true);
        } catch (e) {
            console.error('[Sync] Auto-sync failed:', e);
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
        if (this._isPageContext()) return await this._delegateSyncToBackground(isAuto);
        return await this.syncData(isAuto);
    }
    async syncDown() {
        if (this._isPageContext()) return await this._delegateSyncToBackground(false);
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
        const resData = await response.json();
        return resData;
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
        const resData = await response.json();
        return resData;
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
        const syncMeta = await chrome.storage.local.get(['last_sync_md5']);
        const lastSyncMd5 = syncMeta.last_sync_md5;

        if (lastSyncMd5 && remoteFile.md5Checksum === lastSyncMd5) {
            return { token: activeToken, remoteFile, remoteBackup: null, fileId, lastSyncMd5, driveFiles };
        }

        const remoteBackup = await this.downloadBackup(activeToken, fileId);
        return { token: activeToken, remoteFile, remoteBackup, fileId, lastSyncMd5, driveFiles };
    }

    async gatherLocalData() {
        const localData = await chrome.storage.local.get(null);

        // Gather Notes & Collections from NotesManager / IndexedDB (including tombstones)
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

        // Gather TTS recordings (Metadata only for JSON, blob handled separately, including tombstones)
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

        // Load chat history from IndexedDB (including tombstones)
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

    mergeSyncData(localData, remoteData) {
        const lastSynced = localData.last_sync_time || 0;
        const localSettingsTime = localData.settings_last_updated || 0;
        const remoteSettingsTime = remoteData.settings_last_updated || 0;
        const useLocalSettings = localSettingsTime >= remoteSettingsTime;

        const mergedData = {};
        const isSessionKey = (k) => k.startsWith('lumina_session_');
        const isExcludedKey = (k) => [
            'google_oauth_token', 'google_oauth_token_time',
            'google_user_info', 'last_sync_time', 'last_sync_hash', 'last_sync_md5',
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

        const allKeys = new Set([...Object.keys(localData), ...Object.keys(remoteData)]);
        for (const key of allKeys) {
            if (isExcludedKey(key) || key === 'lumina_chat_sessions' || isSessionKey(key)) continue;

            if (key === 'providers') {
                mergedData[key] = mergeProviders(localData[key], remoteData[key], useLocalSettings);
            } else if (key === 'lumina_sparks' || key === 'lumina_notes_collections' || key === 'lumina_notes_items' || key === 'lumina_tts_recordings') {
                mergedData[key] = mergeEntities(localData[key], remoteData[key]);
            } else if (key in localData && key in remoteData) {
                mergedData[key] = useLocalSettings ? localData[key] : remoteData[key];
            } else if (key in localData) {
                mergedData[key] = localData[key];
            } else if (key in remoteData) {
                mergedData[key] = remoteData[key];
            }
        }

        // Merge Chat Sessions using standardized mergeEntities
        const localSessions = localData.lumina_chat_sessions || {};
        const remoteSessions = remoteData.lumina_chat_sessions || {};
        const mergedSessions = mergeEntities(localSessions, remoteSessions);
        const updatedRemoteSessionIds = new Set();

        for (const sid of Object.keys(mergedSessions)) {
            const chosenSession = mergedSessions[sid];
            const sessionKey = `lumina_session_${sid}`;
            const localTime = getEntityTime(localSessions[sid]);
            const remoteTime = getEntityTime(remoteSessions[sid]);

            if (localSessions[sid] && remoteSessions[sid]) {
                if (localTime >= remoteTime) {
                    if (sessionKey in localData) mergedData[sessionKey] = localData[sessionKey];
                } else {
                    if (sessionKey in remoteData) {
                        mergedData[sessionKey] = remoteData[sessionKey];
                        updatedRemoteSessionIds.add(sid);
                    }
                }
            } else if (localSessions[sid]) {
                if (sessionKey in localData) mergedData[sessionKey] = localData[sessionKey];
            } else if (remoteSessions[sid]) {
                if (sessionKey in remoteData) {
                    mergedData[sessionKey] = remoteData[sessionKey];
                    updatedRemoteSessionIds.add(sid);
                }
            }
        }

        mergedData.lumina_chat_sessions = mergedSessions;

        const localKeysToRemove = [];
        for (const key of Object.keys(remoteData)) {
            if (isExcludedKey(key)) continue;
            if (!(key in mergedData) && key !== 'lumina_chat_sessions' && !isSessionKey(key)) {
                localKeysToRemove.push(key);
            }
        }

        mergedData.settings_last_updated = useLocalSettings ? (localSettingsTime || Date.now()) : remoteSettingsTime;

        return { mergedData, mergedSessions, localKeysToRemove, updatedRemoteSessionIds };
    }

    async persistMergedData(mergedData, mergedSessions, localKeysToRemove, updatedRemoteSessionIds = new Set()) {
        if (localKeysToRemove.length > 0) {
            await chrome.storage.local.remove(localKeysToRemove);
        }

        // Active attachments filter
        const activeAttachmentIds = new Set();
        for (const [sid, sessionMeta] of Object.entries(mergedSessions)) {
            if (sessionMeta && sessionMeta.isDeleted) continue;
            const sessionKey = `lumina_session_${sid}`;
            const sessionMsgs = mergedData[sessionKey];
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
            for (const [sid, sessionMeta] of Object.entries(mergedSessions)) {
                if (sessionMeta && sessionMeta.isDeleted) continue;
                if (key.includes(sid)) return true;
            }
            return false;
        };

        // Save highlights to IndexedDB
        if (typeof LuminaAnnotationDB !== 'undefined') {
            for (const key of Object.keys(mergedData)) {
                if (key.startsWith('highlights_')) {
                    await LuminaAnnotationDB.put(key, mergedData[key]).catch(() => {});
                    delete mergedData[key];
                }
            }
            for (const key of localKeysToRemove) {
                if (key.startsWith('highlights_')) {
                    await LuminaAnnotationDB.delete(key).catch(() => {});
                }
            }
        }

        // Save chat history to IndexedDB
        if (typeof LuminaChatDB !== 'undefined') {
            try {
                const currentSessions = await LuminaChatDB.getAllSessions().catch(() => ({}));
                for (const s of Object.values(currentSessions)) {
                    if (s && s.id && !mergedSessions[s.id]) {
                        await LuminaChatDB.deleteSession(s.id).catch(() => {});
                    }
                }
                for (const [sid, sessionMeta] of Object.entries(mergedSessions)) {
                    await LuminaChatDB.putSession(sessionMeta).catch(() => {});
                    if (sessionMeta && sessionMeta.isDeleted) {
                        await LuminaChatDB.deleteMessages(sid).catch(() => {});
                    } else {
                        const sessionKey = `lumina_session_${sid}`;
                        const messages = mergedData[sessionKey];
                        if (Array.isArray(messages)) {
                            await LuminaChatDB.putMessages(sid, messages).catch(() => {});
                        }
                    }
                    delete mergedData[`lumina_session_${sid}`];
                }
            } catch (err) {
                console.error('[Sync] Failed to save chat history to IndexedDB:', err);
            }
        }

        // Save Notes & Collections to IndexedDB via NotesManager
        if (typeof NotesManager !== 'undefined') {
            try {
                const mergedCollections = mergedData.lumina_notes_collections;
                const mergedNotes = mergedData.lumina_notes_items;
                const db = await NotesManager.getDB();
                if (Array.isArray(mergedCollections)) {
                    const activeColIds = new Set(mergedCollections.map(c => c && c.id).filter(Boolean));
                    const currentCols = await NotesManager.getCollections().catch(() => []);
                    const txCol = db.transaction(NotesManager.STORE_COLLECTIONS, 'readwrite');
                    const storeCol = txCol.objectStore(NotesManager.STORE_COLLECTIONS);
                    for (const c of currentCols) {
                        if (c && c.id && !activeColIds.has(c.id)) {
                            storeCol.delete(c.id);
                        }
                    }
                    for (const col of mergedCollections) {
                        if (col && col.id) {
                            storeCol.put(col);
                        }
                    }
                }
                if (Array.isArray(mergedNotes)) {
                    const activeNoteIds = new Set(mergedNotes.map(n => n && n.id).filter(Boolean));
                    const currentNotes = await NotesManager.getNotes().catch(() => []);
                    const txNote = db.transaction(NotesManager.STORE_NOTES, 'readwrite');
                    const storeNote = txNote.objectStore(NotesManager.STORE_NOTES);
                    for (const n of currentNotes) {
                        if (n && n.id && !activeNoteIds.has(n.id)) {
                            storeNote.delete(n.id);
                        }
                    }
                    for (const note of mergedNotes) {
                        if (note && note.id) {
                            storeNote.put(note);
                        }
                    }
                }
            } catch (err) {
                console.error('[Sync] Failed to save merged notes to IndexedDB:', err);
            }
        }

        // Save TTS Recordings Metadata & Remove deleted items from TTSDB
        let ttsUpdated = false;
        if (typeof TTSDB !== 'undefined' && Array.isArray(mergedData.lumina_tts_recordings)) {
            try {
                const mergedRecs = mergedData.lumina_tts_recordings;
                const activeRecIds = new Set(mergedRecs.map(r => r && r.id).filter(Boolean));
                const currentRecs = await TTSDB.getAllRecordings().catch(() => []);
                const currentMap = new Map(currentRecs.map(r => [r.id, r]));

                for (const r of currentRecs) {
                    if (r && r.id && !activeRecIds.has(r.id)) {
                        await TTSDB.deleteRecording(r.id).catch(() => {});
                        ttsUpdated = true;
                    }
                }

                for (const recMeta of mergedRecs) {
                    if (recMeta && recMeta.id) {
                        const localRec = currentMap.get(recMeta.id);
                        // Preserve existing audioBlob if not updated or until blob sync pulls new one
                        const existingBlob = localRec ? localRec.audioBlob : null;
                        await TTSDB.saveRecording({
                            ...recMeta,
                            audioBlob: existingBlob
                        }).catch(() => {});
                        ttsUpdated = true;
                    }
                }
            } catch (err) {
                console.error('[Sync] Failed to persist merged TTS records:', err);
            }
        }

        delete mergedData.lumina_chat_sessions;
        await chrome.storage.local.set(mergedData);

        if (typeof LuminaAttachmentDB !== 'undefined' && LuminaAttachmentDB.getAllMetadata) {
            try {
                const metadata = await LuminaAttachmentDB.getAllMetadata();
                for (const item of metadata) {
                    if (!isAttachmentActive(item.key)) {
                        await LuminaAttachmentDB.delete(item.key);
                    }
                }
            } catch (cleanupErr) {
                console.error('[Sync Cleanup] Failed to clean up orphaned attachments', cleanupErr);
            }
        }

        try {
            chrome.runtime.sendMessage({ action: 'lumina_sessions_index_updated' }).catch(() => {});
            chrome.runtime.sendMessage({ action: 'lumina_notes_updated' }).catch(() => {});
            chrome.runtime.sendMessage({ action: 'lumina_highlights_updated' }).catch(() => {});
            if (ttsUpdated) {
                chrome.runtime.sendMessage({ action: 'lumina_tts_updated' }).catch(() => {});
            }
            if (updatedRemoteSessionIds && updatedRemoteSessionIds.size > 0) {
                for (const sid of updatedRemoteSessionIds) {
                    chrome.runtime.sendMessage({ action: 'lumina_session_updated', sessionId: sid, source: 'drive_sync' }).catch(() => {});
                }
            }
        } catch (e) {}

        return { isAttachmentActive };
    }

    async syncBlobs(token, activeAttachmentIds, activeTtsRecMap, existingDriveFiles = null) {
        if (!token) return;
        try {
            const driveFiles = existingDriveFiles || (await this.listAppDataFiles(token));
            const driveFileMap = new Map(driveFiles.map(f => [f.name, f]));

            // 1. Sync Chat Attachments (att_{key}.bin)
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
                            if (cursor.value instanceof Blob) {
                                map.set(cursor.key, cursor.value);
                            }
                            cursor.continue();
                        } else {
                            resolve(map);
                        }
                    };
                    req.onerror = () => resolve(map);
                });

                // Upload missing local attachments
                for (const [key, blob] of localAttachments.entries()) {
                    if (!activeAttachmentIds.has(key)) continue;
                    const filename = `att_${key}.bin`;
                    if (!driveFileMap.has(filename) && blob) {
                        try {
                            const res = await this.uploadBlobFile(token, filename, blob);
                            if (res) driveFileMap.set(filename, res);
                        } catch (err) {
                            console.warn(`[Sync] Failed to upload attachment ${key}:`, err);
                        }
                    }
                }

                // Download remote attachments missing locally
                for (const [filename, fileObj] of driveFileMap.entries()) {
                    if (filename.startsWith('att_') && filename.endsWith('.bin')) {
                        const key = filename.slice(4, -4);
                        if (activeAttachmentIds.has(key) && !localAttachments.has(key)) {
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

            // 2. Sync TTS Audio Blobs (tts_{id}.bin)
            if (typeof TTSDB !== 'undefined') {
                const currentRecs = await TTSDB.getAllRecordings().catch(() => []);
                const localRecMap = new Map(currentRecs.map(r => [r.id, r]));

                // Upload missing local TTS audio blobs
                for (const [id, rec] of localRecMap.entries()) {
                    if (!activeTtsRecMap.has(id)) continue;
                    const filename = `tts_${id}.bin`;
                    if (rec.audioBlob instanceof Blob && !driveFileMap.has(filename)) {
                        try {
                            const res = await this.uploadBlobFile(token, filename, rec.audioBlob);
                            if (res) driveFileMap.set(filename, res);
                        } catch (err) {
                            console.warn(`[Sync] Failed to upload TTS audio ${id}:`, err);
                        }
                    }
                }

                // Download remote TTS audio blobs missing locally
                let ttsAudioDownloaded = false;
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

                if (ttsAudioDownloaded) {
                    try { chrome.runtime.sendMessage({ action: 'lumina_tts_updated' }); } catch (e) {}
                }
            }

            // 3. Clean up orphaned remote blobs on Drive
            for (const [filename, fileObj] of driveFileMap.entries()) {
                if (filename.startsWith('att_') && filename.endsWith('.bin')) {
                    const key = filename.slice(4, -4);
                    if (!activeAttachmentIds.has(key)) {
                        await this.deleteDriveFile(token, fileObj.id);
                    }
                } else if (filename.startsWith('tts_') && filename.endsWith('.bin')) {
                    const id = filename.slice(4, -4);
                    if (!activeTtsRecMap.has(id)) {
                        await this.deleteDriveFile(token, fileObj.id);
                    }
                }
            }
        } catch (blobErr) {
            console.error('[Sync] syncBlobs error:', blobErr);
        }
    }

    async syncData(isAuto = false, retryCount = 0) {
        // In page context, always delegate Drive calls to the Service Worker
        if (this._isPageContext()) {
            return await this._delegateSyncToBackground(isAuto);
        }
        if (this.isSyncing) return;
        this.isSyncing = true;
        try {
            let initialToken = await this.getToken(!isAuto);
            if (!initialToken) throw new Error('Not authenticated');

            const { token, remoteFile, remoteBackup, fileId, lastSyncMd5, driveFiles } = await this.fetchRemoteBackup(initialToken, isAuto);

            const remoteData = (remoteBackup && remoteBackup.data) ? remoteBackup.data : {};
            delete remoteData.attachments; // Backward compatibility cleanup

            const localData = await this.gatherLocalData();
            const { mergedData, mergedSessions, localKeysToRemove, updatedRemoteSessionIds } = this.mergeSyncData(localData, remoteData);

            // Construct payload to upload BEFORE persistMergedData mutates/deletes chat keys from mergedData
            const dataToUpload = { ...mergedData };

            if (remoteBackup !== null) {
                await this.persistMergedData(mergedData, mergedSessions, localKeysToRemove, updatedRemoteSessionIds);
            }

            // Compute hash (exclude volatile sync-meta keys from hash)
            const dataForHash = { ...dataToUpload };
            delete dataForHash.last_sync_time;
            delete dataForHash.last_sync_hash;
            delete dataForHash.last_sync_md5;
            delete dataForHash.last_sync_size;
            delete dataForHash.settings_last_updated; // volatile: can change after sync due to storage.onChanged
            delete dataForHash.lumina_chat_sessions;  // index-only: session data is in lumina_session_* keys
            const newHash = await sha256Hash(JSON.stringify(dataForHash));
            const stored = await chrome.storage.local.get(["last_sync_hash", "last_sync_md5"]);
            const now = Date.now();
            mergedData.last_sync_time = now;
            mergedData.last_sync_hash = newHash;

            // Gather active attachment IDs & active TTS IDs for blob sync
            const activeAttachmentIds = new Set();
            for (const [sid, sessionMeta] of Object.entries(mergedSessions)) {
                if (sessionMeta && sessionMeta.isDeleted) continue;
                const sessionKey = `lumina_session_${sid}`;
                const sessionMsgs = dataToUpload[sessionKey];
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

            const activeTtsRecMap = new Map();
            if (Array.isArray(dataToUpload.lumina_tts_recordings)) {
                dataToUpload.lumina_tts_recordings.forEach(r => {
                    if (r && r.id && !r.isDeleted) activeTtsRecMap.set(r.id, r);
                });
            }

            // If local data hash is unchanged and remote file was unchanged (or merged with no new diffs), skip metadata upload
            const isLocalUnchanged = (stored.last_sync_hash === newHash);
            const isRemoteUnchanged = (remoteBackup === null);

            if (fileId && isLocalUnchanged && (isRemoteUnchanged || remoteFile)) {
                const finalMd5 = remoteFile ? remoteFile.md5Checksum : lastSyncMd5;
                const finalSize = remoteFile ? remoteFile.size : null;
                await chrome.storage.local.set({
                    last_sync_time: now,
                    last_sync_hash: newHash,
                    last_sync_md5: finalMd5,
                    last_sync_size: finalSize
                });
                if (typeof globalThis !== 'undefined') globalThis._lastDriveSyncAt = now;
                
                // Still synchronize delta Blobs asynchronously using pre-fetched driveFiles
                this.syncBlobs(token, activeAttachmentIds, activeTtsRecMap, driveFiles).catch(err => {
                    console.error('[Sync] Background syncBlobs error:', err);
                });

                this.notifyListeners('Synced just now', now);
                return now;
            }

            // Notify ring only when actually uploading
            this.notifyListeners('Syncing...', null);
            try { chrome.runtime.sendMessage({ action: 'lumina_sync_status', status: 'syncing' }).catch(() => {}); } catch (e) {}

            const payload = {
                timestamp: new Date().toISOString(),
                version: chrome.runtime.getManifest().version,
                data: dataToUpload
            };

            const uploadRes = fileId
                ? await this.updateBackupFile(token, fileId, JSON.stringify(payload))
                : await this.createBackupFile(token, JSON.stringify(payload));

            const newUploadedMd5 = (uploadRes && typeof uploadRes === 'object') ? uploadRes.md5Checksum : uploadRes;
            const newUploadedSize = (uploadRes && typeof uploadRes === 'object') ? uploadRes.size : null;

            await chrome.storage.local.set({
                last_sync_time: now,
                last_sync_hash: newHash,
                last_sync_md5: newUploadedMd5,
                last_sync_size: newUploadedSize
            });

            if (typeof globalThis !== 'undefined') globalThis._lastDriveSyncAt = now;

            // Sync Blobs independently using pre-fetched driveFiles
            await this.syncBlobs(token, activeAttachmentIds, activeTtsRecMap, driveFiles);

            this.notifyListeners('Synced just now', now);
            // Broadcast sync-done status to all extension pages
            try { chrome.runtime.sendMessage({ action: 'lumina_sync_status', status: 'done', timestamp: now }).catch(() => {}); } catch (e) {}
            return now;
        } catch (error) {
            console.error('[Sync] Sync failed:', error);
            await chrome.storage.local.remove(['last_sync_hash']).catch(() => {});
            this.notifyListeners('Sync failure', null);
            try { chrome.runtime.sendMessage({ action: 'lumina_sync_status', status: 'failure' }).catch(() => {}); } catch (e) {}
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

