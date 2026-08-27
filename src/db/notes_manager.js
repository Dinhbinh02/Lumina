export class NotesManager {
    static DB_NAME = 'LuminaNotesDB';
    static DB_VERSION = 1;
    static STORE_COLLECTIONS = 'collections';
    static STORE_NOTES = 'notes';
    static _db = null;

    static async getDB() {
        if (NotesManager._db) return NotesManager._db;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(NotesManager.DB_NAME, NotesManager.DB_VERSION);

            request.onupgradeneeded = (e) => {
                const db = e.target.result;

                if (!db.objectStoreNames.contains(NotesManager.STORE_COLLECTIONS)) {
                    db.createObjectStore(NotesManager.STORE_COLLECTIONS, { keyPath: 'id' });
                }

                if (!db.objectStoreNames.contains(NotesManager.STORE_NOTES)) {
                    const notesStore = db.createObjectStore(NotesManager.STORE_NOTES, { keyPath: 'id' });
                    notesStore.createIndex('collectionId', 'collectionId', { unique: false });
                    notesStore.createIndex('updatedAt', 'updatedAt', { unique: false });
                }
            };

            request.onsuccess = async (e) => {
                NotesManager._db = e.target.result;
                NotesManager._db.onclose = () => { NotesManager._db = null; };
                NotesManager._db.onversionchange = () => {
                    if (NotesManager._db) {
                        NotesManager._db.close();
                        NotesManager._db = null;
                    }
                };

                await NotesManager.ensureDefaultSeed();
                resolve(NotesManager._db);
            };

            request.onerror = (e) => reject(e.target.error);
        });
    }

    static async ensureDefaultSeed() {}

    static async getCollections(includeDeleted = false) {
        const db = await NotesManager.getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(NotesManager.STORE_COLLECTIONS, 'readonly');
            const store = tx.objectStore(NotesManager.STORE_COLLECTIONS);
            const request = store.getAll();
            request.onsuccess = () => {
                const list = request.result || [];
                resolve(includeDeleted ? list : list.filter(c => c && !c.isDeleted));
            };
            request.onerror = (e) => reject(e.target.error);
        });
    }

    static async getAllCollectionsRaw() {
        return NotesManager.getCollections(true);
    }

    static async createCollection(name, icon = 'folder') {
        const db = await NotesManager.getDB();
        const newCol = {
            id: 'col_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            name: name.trim() || 'Untitled Collection',
            icon: icon,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        return new Promise((resolve, reject) => {
            const tx = db.transaction(NotesManager.STORE_COLLECTIONS, 'readwrite');
            const store = tx.objectStore(NotesManager.STORE_COLLECTIONS);
            const request = store.put(newCol);
            request.onsuccess = () => {
                if (typeof LuminaSync !== 'undefined' && typeof LuminaSync.triggerDebouncedSync === 'function') {
                    LuminaSync.triggerDebouncedSync();
                }
                resolve(newCol);
            };
            request.onerror = (e) => reject(e.target.error);
        });
    }

    static async renameCollection(collectionId, newName) {
        if (!collectionId || collectionId === 'all') return false;
        const db = await NotesManager.getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(NotesManager.STORE_COLLECTIONS, 'readwrite');
            const store = tx.objectStore(NotesManager.STORE_COLLECTIONS);

            const getReq = store.get(collectionId);
            getReq.onsuccess = () => {
                const col = getReq.result;
                if (!col || col.isDeleted) return resolve(false);
                col.name = newName.trim() || 'Untitled Collection';
                col.updatedAt = Date.now();
                const putReq = store.put(col);
                putReq.onsuccess = () => {
                    if (typeof LuminaSync !== 'undefined' && typeof LuminaSync.triggerDebouncedSync === 'function') {
                        LuminaSync.triggerDebouncedSync();
                    }
                    resolve(col);
                };
                putReq.onerror = (e) => reject(e.target.error);
            };
            getReq.onerror = (e) => reject(e.target.error);
        });
    }

    static async deleteCollection(collectionId) {
        const db = await NotesManager.getDB();

        return new Promise((resolve, reject) => {
            const tx = db.transaction([NotesManager.STORE_COLLECTIONS, NotesManager.STORE_NOTES], 'readwrite');
            const colStore = tx.objectStore(NotesManager.STORE_COLLECTIONS);
            const noteStore = tx.objectStore(NotesManager.STORE_NOTES);

            colStore.delete(collectionId);

            const index = noteStore.index('collectionId');
            const req = index.openCursor(IDBKeyRange.only(collectionId));

            req.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                    const note = cursor.value;
                    note.collectionId = null;
                    note.updatedAt = Date.now();
                    cursor.update(note);
                    cursor.continue();
                }
            };

            tx.oncomplete = () => {
                if (typeof LuminaSync !== 'undefined' && typeof LuminaSync.triggerDebouncedSync === 'function') {
                    LuminaSync.triggerDebouncedSync();
                }
                resolve(true);
            };
            tx.onerror = (e) => reject(e.target.error);
        });
    }

    static async getNotes(collectionId = null, includeDeleted = false) {
        const db = await NotesManager.getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(NotesManager.STORE_NOTES, 'readonly');
            const store = tx.objectStore(NotesManager.STORE_NOTES);

            let request;
            if (collectionId && collectionId !== 'all') {
                const index = store.index('collectionId');
                request = index.getAll(IDBKeyRange.only(collectionId));
            } else {
                request = store.getAll();
            }

            request.onsuccess = () => {
                let notes = request.result || [];
                if (!includeDeleted) {
                    notes = notes.filter(n => n && !n.isDeleted);
                }
                notes.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
                resolve(notes);
            };
            request.onerror = (e) => reject(e.target.error);
        });
    }

    static async getAllNotesRaw() {
        return NotesManager.getNotes(null, true);
    }

    static async getNote(noteId, includeDeleted = false) {
        const db = await NotesManager.getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(NotesManager.STORE_NOTES, 'readonly');
            const store = tx.objectStore(NotesManager.STORE_NOTES);
            const request = store.get(noteId);
            request.onsuccess = () => {
                const note = request.result || null;
                if (!note) return resolve(null);
                if (note.isDeleted && !includeDeleted) return resolve(null);
                resolve(note);
            };
            request.onerror = (e) => reject(e.target.error);
        });
    }

    static async createNote(collectionId = null, title = 'Untitled Note') {
        if (collectionId === 'all' || collectionId === 'col_default') collectionId = null;
        const db = await NotesManager.getDB();
        const now = Date.now();
        const newNote = {
            id: 'note_' + now + '_' + Math.random().toString(36).substr(2, 5),
            collectionId: collectionId,
            title: title,
            content: {
                time: now,
                blocks: [],
                version: '2.30.7'
            },
            pinned: false,
            createdAt: now,
            updatedAt: now
        };

        return new Promise((resolve, reject) => {
            const tx = db.transaction(NotesManager.STORE_NOTES, 'readwrite');
            const store = tx.objectStore(NotesManager.STORE_NOTES);
            const request = store.put(newNote);
            request.onsuccess = () => {
                if (typeof LuminaSync !== 'undefined' && typeof LuminaSync.triggerDebouncedSync === 'function') {
                    LuminaSync.triggerDebouncedSync();
                }
                resolve(newNote);
            };
            request.onerror = (e) => reject(e.target.error);
        });
    }

    static async saveNote(noteId, updates) {
        const db = await NotesManager.getDB();
        const existingNote = await NotesManager.getNote(noteId);
        if (!existingNote) return null;

        const updatedNote = {
            ...existingNote,
            ...updates,
            updatedAt: Date.now()
        };

        return new Promise((resolve, reject) => {
            const tx = db.transaction(NotesManager.STORE_NOTES, 'readwrite');
            const store = tx.objectStore(NotesManager.STORE_NOTES);
            const request = store.put(updatedNote);
            request.onsuccess = () => {
                if (typeof LuminaSync !== 'undefined' && typeof LuminaSync.triggerDebouncedSync === 'function') {
                    LuminaSync.triggerDebouncedSync();
                }
                resolve(updatedNote);
            };
            request.onerror = (e) => reject(e.target.error);
        });
    }

    static async pinNote(noteId, pinned = true) {
        return NotesManager.saveNote(noteId, { pinned, updatedAt: undefined });
    }

    static async moveNote(noteId, newCollectionId) {
        const db = await NotesManager.getDB();
        const note = await NotesManager.getNote(noteId);
        if (!note) return null;
        note.collectionId = newCollectionId;
        note.updatedAt = Date.now();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(NotesManager.STORE_NOTES, 'readwrite');
            const store = tx.objectStore(NotesManager.STORE_NOTES);
            const request = store.put(note);
            request.onsuccess = () => {
                if (typeof LuminaSync !== 'undefined' && typeof LuminaSync.triggerDebouncedSync === 'function') {
                    LuminaSync.triggerDebouncedSync();
                }
                resolve(note);
            };
            request.onerror = (e) => reject(e.target.error);
        });
    }

    static async getNoteCount(collectionId) {
        const notes = await NotesManager.getNotes(collectionId, false);
        return notes.length;
    }

    static async deleteNote(noteId) {
        const db = await NotesManager.getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(NotesManager.STORE_NOTES, 'readwrite');
            const store = tx.objectStore(NotesManager.STORE_NOTES);
            const req = store.delete(noteId);
            req.onsuccess = () => {
                if (typeof LuminaSync !== 'undefined' && typeof LuminaSync.triggerDebouncedSync === 'function') {
                    LuminaSync.triggerDebouncedSync();
                }
                resolve(true);
            };
            req.onerror = (e) => reject(e.target.error);
        });
    }
}

if (typeof globalThis !== 'undefined') {
    globalThis.NotesManager = NotesManager;
}
