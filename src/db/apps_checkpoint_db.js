/**
 * Nexus Apps Checkpoint Database
 * Stores code versions, line diffs, and Accept/Reject status for each chat turn & AI modification.
 */

export const NexusAppsCheckpointDB = {
    DB_NAME: 'NexusAppsCheckpointDB',
    DB_VERSION: 1,
    STORE_CHECKPOINTS: 'checkpoints',
    _db: null,

    init() {
        return new Promise((resolve, reject) => {
            if (this._db) return resolve(this._db);
            const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(this.STORE_CHECKPOINTS)) {
                    const store = db.createObjectStore(this.STORE_CHECKPOINTS, { keyPath: 'id' });
                    store.createIndex('appId', 'appId', { unique: false });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                }
            };
            request.onsuccess = (e) => {
                this._db = e.target.result;
                this._db.onclose = () => { this._db = null; };
                this._db.onversionchange = () => {
                    if (this._db) {
                        this._db.close();
                        this._db = null;
                    }
                };
                resolve(this._db);
            };
            request.onerror = (e) => reject(e.target.error);
        });
    },

    /**
     * Compute line-by-line diff using LCS
     */
    computeLineDiff(beforeCode = '', afterCode = '') {
        const oldLines = beforeCode ? beforeCode.split('\n') : [];
        const newLines = afterCode ? afterCode.split('\n') : [];

        // Build LCS table
        const m = oldLines.length;
        const n = newLines.length;
        
        // Fast paths
        if (m === 0 && n === 0) {
            return { additions: 0, deletions: 0, hasChanges: false, lines: [] };
        }
        if (beforeCode === afterCode) {
            return {
                additions: 0,
                deletions: 0,
                hasChanges: false,
                lines: oldLines.map((line, idx) => ({
                    type: 'unchanged',
                    oldLine: idx + 1,
                    newLine: idx + 1,
                    content: line
                }))
            };
        }

        const dp = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1));
        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                if (oldLines[i - 1] === newLines[j - 1]) {
                    dp[i][j] = dp[i - 1][j - 1] + 1;
                } else {
                    dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
                }
            }
        }

        // Backtrack to build diff
        let i = m;
        let j = n;
        const rawDiff = [];
        let additions = 0;
        let deletions = 0;

        while (i > 0 || j > 0) {
            if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
                rawDiff.push({
                    type: 'unchanged',
                    oldLine: i,
                    newLine: j,
                    content: oldLines[i - 1]
                });
                i--;
                j--;
            } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
                rawDiff.push({
                    type: 'added',
                    oldLine: null,
                    newLine: j,
                    content: newLines[j - 1]
                });
                additions++;
                j--;
            } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
                rawDiff.push({
                    type: 'removed',
                    oldLine: i,
                    newLine: null,
                    content: oldLines[i - 1]
                });
                deletions++;
                i--;
            }
        }

        rawDiff.reverse();

        return {
            additions,
            deletions,
            hasChanges: additions > 0 || deletions > 0,
            lines: rawDiff
        };
    },

    async putCheckpoint(checkpoint) {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(this.STORE_CHECKPOINTS, 'readwrite');
            const store = tx.objectStore(this.STORE_CHECKPOINTS);
            const request = store.put(checkpoint);
            request.onsuccess = () => resolve(true);
            request.onerror = (e) => reject(e.target.error);
        });
    },

    async getCheckpoint(id) {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(this.STORE_CHECKPOINTS, 'readonly');
            const store = tx.objectStore(this.STORE_CHECKPOINTS);
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = (e) => reject(e.target.error);
        });
    },

    async getCheckpointsByApp(appId) {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(this.STORE_CHECKPOINTS, 'readonly');
            const store = tx.objectStore(this.STORE_CHECKPOINTS);
            const index = store.index('appId');
            const request = index.getAll(IDBKeyRange.only(appId));
            request.onsuccess = () => {
                const list = request.result || [];
                list.sort((a, b) => a.entryIndex - b.entryIndex);
                resolve(list);
            };
            request.onerror = (e) => reject(e.target.error);
        });
    },

    async updateStatus(id, status) {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(this.STORE_CHECKPOINTS, 'readwrite');
            const store = tx.objectStore(this.STORE_CHECKPOINTS);
            const getReq = store.get(id);
            getReq.onsuccess = () => {
                const item = getReq.result;
                if (!item) return resolve(false);
                item.status = status;
                item.updatedAt = Date.now();
                const putReq = store.put(item);
                putReq.onsuccess = () => resolve(true);
                putReq.onerror = (e) => reject(e.target.error);
            };
            getReq.onerror = (e) => reject(e.target.error);
        });
    },

    async deleteCheckpointsFrom(appId, minEntryIndex) {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(this.STORE_CHECKPOINTS, 'readwrite');
            const store = tx.objectStore(this.STORE_CHECKPOINTS);
            const index = store.index('appId');
            const req = index.openCursor(IDBKeyRange.only(appId));
            req.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                    if (cursor.value.entryIndex >= minEntryIndex) {
                        cursor.delete();
                    }
                    cursor.continue();
                } else {
                    resolve(true);
                }
            };
            req.onerror = (e) => reject(e.target.error);
        });
    },

    async deleteAppCheckpoints(appId) {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(this.STORE_CHECKPOINTS, 'readwrite');
            const store = tx.objectStore(this.STORE_CHECKPOINTS);
            const index = store.index('appId');
            const req = index.openCursor(IDBKeyRange.only(appId));
            req.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                    cursor.delete();
                    cursor.continue();
                } else {
                    resolve(true);
                }
            };
            req.onerror = (e) => reject(e.target.error);
        });
    }
};
