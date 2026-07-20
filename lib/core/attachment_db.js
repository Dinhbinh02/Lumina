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
    async getAll(maxSize = 2 * 1024 * 1024) {
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
                        if (blob.size > maxSize) {
                            cursor.continue();
                            return;
                        }
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

const LuminaImageCacheDB = {
    DB_NAME: 'LuminaImageCacheDB',
    DB_VERSION: 1,
    STORE_NAME: 'image_queries',
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
    async put(key, value) {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(this.STORE_NAME, 'readwrite');
            const store = tx.objectStore(this.STORE_NAME);
            const request = store.put({ value, timestamp: Date.now() }, key);
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
            request.onsuccess = () => {
                const res = request.result;
                if (res) {
                    if (Date.now() - res.timestamp > 24 * 60 * 60 * 1000) {
                        this.delete(key).catch(() => {});
                        resolve(null);
                    } else {
                        resolve(res.value);
                    }
                } else {
                    resolve(null);
                }
            };
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
    async cleanupExpired() {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(this.STORE_NAME, 'readwrite');
            const store = tx.objectStore(this.STORE_NAME);
            const request = store.openCursor();
            const now = Date.now();
            request.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                    if (now - cursor.value.timestamp > 24 * 60 * 60 * 1000) {
                        cursor.delete();
                    }
                    cursor.continue();
                } else {
                    resolve(true);
                }
            };
            request.onerror = (e) => reject(e.target.error);
        });
    },
    async getStorageUsage() {
        const db = await this.init();
        let totalBytes = 0;
        return new Promise((resolve) => {
            const tx = db.transaction(this.STORE_NAME, 'readonly');
            const store = tx.objectStore(this.STORE_NAME);
            const request = store.openCursor();
            request.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                    const keyStr = JSON.stringify(cursor.key);
                    const valStr = JSON.stringify(cursor.value);
                    totalBytes += (keyStr.length + valStr.length) * 2;
                    cursor.continue();
                } else {
                    resolve(totalBytes);
                }
            };
            request.onerror = () => resolve(0);
        });
    }
};

const LuminaAudioCacheDB = {
    DB_NAME: 'LuminaAudioCacheDB',
    DB_VERSION: 1,
    STORE_NAME: 'audio_entries',
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
    async put(key, entry) {
        const db = await this.init();
        let dbValue = { ...entry };
        if (entry && entry.data && Array.isArray(entry.data)) {
            dbValue.data = entry.data.map(base64 => {
                if (typeof base64 !== 'string' || !base64.startsWith('data:')) return base64;
                return LuminaAttachmentDB.dataURLtoBlob(base64) || base64;
            });
        }
        return new Promise((resolve, reject) => {
            const tx = db.transaction(this.STORE_NAME, 'readwrite');
            const store = tx.objectStore(this.STORE_NAME);
            const request = store.put({ value: dbValue, timestamp: Date.now() }, key);
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
            request.onsuccess = async () => {
                const res = request.result;
                if (res) {
                    if (Date.now() - res.timestamp > 24 * 60 * 60 * 1000) {
                        this.delete(key).catch(() => {});
                        resolve(null);
                    } else {
                        const entry = { ...res.value };
                        if (entry && entry.data && Array.isArray(entry.data)) {
                            try {
                                const base64Promises = entry.data.map(async (item) => {
                                    if (item instanceof Blob) {
                                        return await LuminaAttachmentDB.blobToDataURL(item);
                                    }
                                    return item;
                                });
                                entry.data = (await Promise.all(base64Promises)).filter(Boolean);
                            } catch (err) {
                                console.error('Failed to deserialize Blobs in audio cache get:', err);
                            }
                        }
                        resolve(entry);
                    }
                } else {
                    resolve(null);
                }
            };
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
    async cleanupExpired() {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(this.STORE_NAME, 'readwrite');
            const store = tx.objectStore(this.STORE_NAME);
            const request = store.openCursor();
            const now = Date.now();
            request.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                    if (now - cursor.value.timestamp > 24 * 60 * 60 * 1000) {
                        cursor.delete();
                    }
                    cursor.continue();
                } else {
                    resolve(true);
                }
            };
            request.onerror = (e) => reject(e.target.error);
        });
    },
    async getStorageUsage() {
        const db = await this.init();
        let totalBytes = 0;
        return new Promise((resolve) => {
            const tx = db.transaction(this.STORE_NAME, 'readonly');
            const store = tx.objectStore(this.STORE_NAME);
            const request = store.openCursor();
            request.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                    const keyStr = JSON.stringify(cursor.key);
                    totalBytes += keyStr.length * 2;
                    const val = cursor.value;
                    if (val) {
                        if (val.value && val.value.data && Array.isArray(val.value.data)) {
                            val.value.data.forEach(item => {
                                if (item instanceof Blob) {
                                    totalBytes += item.size;
                                } else if (typeof item === 'string') {
                                    totalBytes += item.length * 2;
                                }
                            });
                            const copy = { ...val };
                            delete copy.value.data;
                            totalBytes += JSON.stringify(copy).length * 2;
                        } else {
                            totalBytes += JSON.stringify(val).length * 2;
                        }
                    }
                    cursor.continue();
                } else {
                    resolve(totalBytes);
                }
            };
            request.onerror = () => resolve(0);
        });
    }
};

if (typeof window !== 'undefined') {
    window.LuminaAttachmentDB = LuminaAttachmentDB;
    window.LuminaImageCacheDB = LuminaImageCacheDB;
    window.LuminaAudioCacheDB = LuminaAudioCacheDB;
}
if (typeof globalThis !== 'undefined') {
    globalThis.LuminaAttachmentDB = LuminaAttachmentDB;
    globalThis.LuminaImageCacheDB = LuminaImageCacheDB;
    globalThis.LuminaAudioCacheDB = LuminaAudioCacheDB;
}
