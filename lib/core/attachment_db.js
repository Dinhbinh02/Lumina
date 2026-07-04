const LuminaAttachmentDB = {
    DB_NAME: 'LuminaAttachmentDB',
    DB_VERSION: 1,
    STORE_NAME: 'attachments',
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
                resolve(this._db);
            };
            request.onerror = (e) => reject(e.target.error);
        });
    },
    async put(key, blob) {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(this.STORE_NAME, 'readwrite');
            const store = tx.objectStore(this.STORE_NAME);
            const request = store.put(blob, key);
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
    async clear() {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(this.STORE_NAME, 'readwrite');
            const store = tx.objectStore(this.STORE_NAME);
            const request = store.clear();
            request.onsuccess = () => resolve(true);
            request.onerror = (e) => reject(e.target.error);
        });
    },
    async getAll() {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(this.STORE_NAME, 'readonly');
            const store = tx.objectStore(this.STORE_NAME);
            const request = store.openCursor();
            const results = {};
            const conversionPromises = [];
            request.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                    const key = cursor.key;
                    const blob = cursor.value;
                    if (blob instanceof Blob) {
                        const p = this.blobToDataURL(blob).then(dataUrl => {
                            if (dataUrl) {
                                results[key] = dataUrl;
                            }
                        });
                        conversionPromises.push(p);
                    }
                    cursor.continue();
                } else {
                    Promise.all(conversionPromises).then(() => {
                        resolve(results);
                    }).catch(reject);
                }
            };
            request.onerror = (e) => reject(e.target.error);
        });
    },
    async getAllMetadata() {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(this.STORE_NAME, 'readonly');
            const store = tx.objectStore(this.STORE_NAME);
            const request = store.openCursor();
            const results = [];
            request.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                    const key = cursor.key;
                    const blob = cursor.value;
                    if (blob instanceof Blob) {
                        results.push({
                            key: key,
                            size: blob.size,
                            type: blob.type
                        });
                    }
                    cursor.continue();
                } else {
                    resolve(results);
                }
            };
            request.onerror = (e) => reject(e.target.error);
        });
    },
    dataURLtoBlob(dataUrl) {
        try {
            const parts = dataUrl.split(',');
            if (parts.length < 2) return null;
            const mimeMatch = parts[0].match(/:(.*?);/);
            const mime = mimeMatch ? mimeMatch[1] : 'image/png';
            const bstr = atob(parts[1]);
            let n = bstr.length;
            const u8arr = new Uint8Array(n);
            while (n--) {
                u8arr[n] = bstr.charCodeAt(n);
            }
            return new Blob([u8arr], { type: mime });
        } catch (e) {
            console.error('Failed to convert dataURL to Blob', e);
            return null;
        }
    },
    blobToDataURL(blob) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
        });
    }
};

if (typeof window !== 'undefined') {
    window.LuminaAttachmentDB = LuminaAttachmentDB;
}
if (typeof globalThis !== 'undefined') {
    globalThis.LuminaAttachmentDB = LuminaAttachmentDB;
}
