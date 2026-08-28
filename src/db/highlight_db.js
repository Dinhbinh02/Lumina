export const NexusAnnotationDB = {
    DB_NAME: 'NexusHighlightDB',
    DB_VERSION: 1,
    STORE_NAME: 'highlights',
    _db: null,
    init() {
        return new Promise((resolve, reject) => {
            if (this._db) return resolve(this._db);
            const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(this.STORE_NAME)) {
                    db.createObjectStore(this.STORE_NAME);
                }
            };
            request.onsuccess = (e) => {
                this._db = e.target.result;
                this._db.onclose = () => { this._db = null; };
                this._db.onversionchange = () => { if (this._db) { this._db.close(); this._db = null; } };
                resolve(this._db);
            };
            request.onerror = (e) => reject(e.target.error);
        });
    },
    async put(key, highlightsArray) {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(this.STORE_NAME, 'readwrite');
            const store = tx.objectStore(this.STORE_NAME);
            const request = store.put(highlightsArray, key);
            request.onsuccess = () => resolve(true);
            request.onerror = (e) => reject(e.target.error);
        });
    },
    async get(key) {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(this.STORE_NAME, 'readonly');
            const store = tx.objectStore(this.STORE_NAME);
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = (e) => reject(e.target.error);
        });
    },
    async delete(key) {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(this.STORE_NAME, 'readwrite');
            const store = tx.objectStore(this.STORE_NAME);
            const request = store.delete(key);
            request.onsuccess = () => resolve(true);
            request.onerror = (e) => reject(e.target.error);
        });
    },
    async getAllKeys() {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(this.STORE_NAME, 'readonly');
            const store = tx.objectStore(this.STORE_NAME);
            const request = store.getAllKeys();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = (e) => reject(e.target.error);
        });
    },
    async getAll() {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(this.STORE_NAME, 'readonly');
            const store = tx.objectStore(this.STORE_NAME);
            const keysReq = store.getAllKeys();
            const valsReq = store.getAll();
            tx.oncomplete = () => {
                const keys = keysReq.result || [];
                const vals = valsReq.result || [];
                const results = {};
                for (let i = 0; i < keys.length; i++) {
                    results[keys[i]] = vals[i];
                }
                resolve(results);
            };
            tx.onerror = (e) => reject(e.target.error);
        });
    }
};

export const NexusHighlightDB = NexusAnnotationDB;

if (typeof globalThis !== 'undefined') {
    globalThis.NexusAnnotationDB = NexusAnnotationDB;
    globalThis.NexusHighlightDB = NexusHighlightDB;
}
