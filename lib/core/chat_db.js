const LuminaChatDB = {
    DB_NAME: 'LuminaChatDB',
    DB_VERSION: 1,
    SESSIONS_STORE: 'sessions',
    MESSAGES_STORE: 'messages',
    _db: null,
    
    init() {
        return new Promise((resolve, reject) => {
            if (this._db) return resolve(this._db);
            const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(this.SESSIONS_STORE)) {
                    db.createObjectStore(this.SESSIONS_STORE, { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains(this.MESSAGES_STORE)) {
                    db.createObjectStore(this.MESSAGES_STORE);
                }
            };
            request.onsuccess = (e) => {
                this._db = e.target.result;
                resolve(this._db);
            };
            request.onerror = (e) => reject(e.target.error);
        });
    },

    async getSession(sessionId) {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(this.SESSIONS_STORE, 'readonly');
            const store = tx.objectStore(this.SESSIONS_STORE);
            const request = store.get(sessionId);
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = (e) => reject(e.target.error);
        });
    },

    async putSession(sessionMeta) {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(this.SESSIONS_STORE, 'readwrite');
            const store = tx.objectStore(this.SESSIONS_STORE);
            const request = store.put(sessionMeta);
            request.onsuccess = () => resolve(true);
            request.onerror = (e) => reject(e.target.error);
        });
    },

    async deleteSession(sessionId) {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction([this.SESSIONS_STORE, this.MESSAGES_STORE], 'readwrite');
            tx.objectStore(this.SESSIONS_STORE).delete(sessionId);
            tx.objectStore(this.MESSAGES_STORE).delete(sessionId);
            tx.oncomplete = () => resolve(true);
            tx.onerror = (e) => reject(e.target.error);
        });
    },

    async getAllSessions() {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(this.SESSIONS_STORE, 'readonly');
            const store = tx.objectStore(this.SESSIONS_STORE);
            const request = store.getAll();
            request.onsuccess = () => {
                const sessionsMap = {};
                const list = request.result || [];
                list.forEach(s => {
                    if (s && s.id) {
                        sessionsMap[s.id] = s;
                    }
                });
                resolve(sessionsMap);
            };
            request.onerror = (e) => reject(e.target.error);
        });
    },

    async getMessages(sessionId) {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(this.MESSAGES_STORE, 'readonly');
            const store = tx.objectStore(this.MESSAGES_STORE);
            const request = store.get(sessionId);
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = (e) => reject(e.target.error);
        });
    },

    async putMessages(sessionId, messages) {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(this.MESSAGES_STORE, 'readwrite');
            const store = tx.objectStore(this.MESSAGES_STORE);
            const request = store.put(messages, sessionId);
            request.onsuccess = () => resolve(true);
            request.onerror = (e) => reject(e.target.error);
        });
    },

    async clearAll() {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction([this.SESSIONS_STORE, this.MESSAGES_STORE], 'readwrite');
            tx.objectStore(this.SESSIONS_STORE).clear();
            tx.objectStore(this.MESSAGES_STORE).clear();
            tx.oncomplete = () => resolve(true);
            tx.onerror = (e) => reject(e.target.error);
        });
    },
    
    async getStorageUsage() {
        const db = await this.init();
        let totalBytes = 0;
        
        const getStoreSize = (storeName) => {
            return new Promise((resolve) => {
                const tx = db.transaction(storeName, 'readonly');
                const store = tx.objectStore(storeName);
                const request = store.openCursor();
                request.onsuccess = (e) => {
                    const cursor = e.target.result;
                    if (cursor) {
                        const keyStr = JSON.stringify(cursor.key);
                        const valStr = JSON.stringify(cursor.value);
                        totalBytes += (keyStr.length + valStr.length) * 2;
                        cursor.continue();
                    } else {
                        resolve();
                    }
                };
                request.onerror = () => resolve();
            });
        };
        
        await getStoreSize(this.SESSIONS_STORE);
        await getStoreSize(this.MESSAGES_STORE);
        return totalBytes;
    }
};

if (typeof window !== 'undefined') {
    window.LuminaChatDB = LuminaChatDB;
}
if (typeof globalThis !== 'undefined') {
    globalThis.LuminaChatDB = LuminaChatDB;
}
