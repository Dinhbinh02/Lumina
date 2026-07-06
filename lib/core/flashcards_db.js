// Lumina Flashcards Database & SRS Manager

class FlashcardDB {
    constructor() {
        this.state = {
            version: "1.0.0",
            lastUpdated: 0,
            decks: {},
            templates: {},
            cards: []
        };
        this.FILENAME = 'lumina_flashcards.json';
        this.isSyncing = false;
        this.initPromise = this.init();
    }

    async init() {
        try {
            const data = await chrome.storage.local.get(['lumina_flashcards']);
            if (data.lumina_flashcards) {
                this.state = data.lumina_flashcards;
            } else {
                // Seed default deck and template
                this.state = {
                    version: "1.0.0",
                    lastUpdated: Date.now(),
                    decks: {
                        "deck_default": {
                            id: "deck_default",
                            name: "General Vocabulary",
                            createdAt: Date.now()
                        }
                    },
                    templates: {
                        "tpl_default": {
                            id: "tpl_default",
                            name: "Basic (Q&A)",
                            fields: ["Front", "Back"],
                            frontHtml: "<div class=\"card-front\">{{Front}}</div>",
                            backHtml: "<div class=\"card-back\">{{Back}}</div>",
                            css: ".card-front, .card-back {\n  font-size: 22px;\n  text-align: center;\n  padding: 20px;\n  color: var(--text-primary);\n}"
                        }
                    },
                    cards: []
                };
                await this.save();
            }
        } catch (e) {
            console.error('[FlashcardDB] Init failed:', e);
        }
    }

    async save() {
        this.state.lastUpdated = Date.now();
        await chrome.storage.local.set({ 'lumina_flashcards': this.state });
        this.triggerAutoSync();
    }

    // --- Decks ---
    async addDeck(name) {
        await this.initPromise;
        const id = 'deck_' + Math.random().toString(36).substring(2, 11);
        this.state.decks[id] = {
            id,
            name,
            createdAt: Date.now()
        };
        await this.save();
        return id;
    }

    async renameDeck(deckId, newName) {
        await this.initPromise;
        if (this.state.decks[deckId]) {
            this.state.decks[deckId].name = newName;
            await this.save();
        }
    }

    async deleteDeck(deckId, deleteCards = true) {
        await this.initPromise;
        if (deckId === 'deck_default') return; // Cannot delete default deck
        
        if (this.state.decks[deckId]) {
            delete this.state.decks[deckId];
            if (deleteCards) {
                this.state.cards = this.state.cards.filter(c => c.deckId !== deckId);
            } else {
                // Move cards to default deck
                this.state.cards.forEach(c => {
                    if (c.deckId === deckId) c.deckId = 'deck_default';
                });
            }
            await this.save();
        }
    }

    // --- Templates ---
    async addTemplate(name, fields, frontHtml, backHtml, css = '') {
        await this.initPromise;
        const id = 'tpl_' + Math.random().toString(36).substring(2, 11);
        this.state.templates[id] = {
            id,
            name,
            fields,
            frontHtml,
            backHtml,
            css
        };
        await this.save();
        return id;
    }

    async updateTemplate(tplId, name, fields, frontHtml, backHtml, css = '') {
        await this.initPromise;
        if (this.state.templates[tplId]) {
            this.state.templates[tplId] = {
                id: tplId,
                name,
                fields,
                frontHtml,
                backHtml,
                css
            };
            await this.save();
        }
    }

    async deleteTemplate(tplId) {
        await this.initPromise;
        if (tplId === 'tpl_default') return;
        if (this.state.templates[tplId]) {
            delete this.state.templates[tplId];
            // Point cards back to default template
            this.state.cards.forEach(c => {
                if (c.templateId === tplId) c.templateId = 'tpl_default';
            });
            await this.save();
        }
    }

    // --- Cards ---
    async addCard(deckId, templateId, fields) {
        await this.initPromise;
        const id = 'card_' + Math.random().toString(36).substring(2, 15);
        const card = {
            id,
            deckId: deckId || 'deck_default',
            templateId: templateId || 'tpl_default',
            fields,
            srs: {
                interval: 0,
                repetitions: 0,
                easeFactor: 2.5,
                dueDate: Date.now()
            },
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        this.state.cards.push(card);
        await this.save();
        return card;
    }

    async updateCard(cardId, fields) {
        await this.initPromise;
        const card = this.state.cards.find(c => c.id === cardId);
        if (card) {
            card.fields = fields;
            card.updatedAt = Date.now();
            await this.save();
        }
    }

    async deleteCard(cardId) {
        await this.initPromise;
        this.state.cards = this.state.cards.filter(c => c.id !== cardId);
        await this.save();
    }

    async moveCard(cardId, targetDeckId) {
        await this.initPromise;
        const card = this.state.cards.find(c => c.id === cardId);
        if (card && this.state.decks[targetDeckId]) {
            card.deckId = targetDeckId;
            card.updatedAt = Date.now();
            await this.save();
        }
    }

    // --- SM-2 Core Repetition Scheduler ---
    async answerCard(cardId, quality) {
        await this.initPromise;
        const card = this.state.cards.find(c => c.id === cardId);
        if (!card) return;

        const srs = card.srs;
        
        // quality values:
        // 0: Again (Forgot)
        // 3: Good (Remembered)
        // 5: Easy (Very Easy)

        if (quality < 3) {
            // Card failed
            srs.repetitions = 0;
            srs.interval = 1; // repeat tomorrow (1 day)
        } else {
            // Card succeeded
            if (srs.repetitions === 0) {
                srs.interval = 1;
            } else if (srs.repetitions === 1) {
                srs.interval = 6;
            } else {
                srs.interval = Math.round(srs.interval * srs.easeFactor);
            }
            srs.repetitions += 1;
        }

        // Adjust Ease Factor (minimum cap 1.3)
        srs.easeFactor = srs.easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
        if (srs.easeFactor < 1.3) {
            srs.easeFactor = 1.3;
        }

        // Set due date to tomorrow/interval days out
        // Add tiny variance to prevent cards reviewed together from stacking up
        const fuzzFactor = (Math.random() - 0.5) * 0.1 * srs.interval;
        const actualIntervalDays = srs.interval + fuzzFactor;
        srs.dueDate = Date.now() + Math.max(1, Math.round(actualIntervalDays * 24 * 60 * 60 * 1000));

        card.updatedAt = Date.now();
        await this.save();
        return card;
    }

    // --- Sync Implementation via Google Drive appDataFolder ---
    async syncUp() {
        if (this.isSyncing) return;
        this.isSyncing = true;
        try {
            if (typeof LuminaAuth === 'undefined' || !LuminaAuth.isAuthenticated) return;
            const token = await LuminaAuth.getAuthToken(false);
            if (!token) return;

            await this.initPromise;
            const fileId = await this.findBackupFile(token);
            const payload = {
                timestamp: new Date().toISOString(),
                version: chrome.runtime.getManifest().version,
                data: this.state
            };
            const content = JSON.stringify(payload);

            if (fileId) {
                await this.updateBackupFile(token, fileId, content);
            } else {
                await this.createBackupFile(token, content);
            }
            console.log('[FlashcardSync] Sync up complete');
        } catch (e) {
            console.error('[FlashcardSync] Sync up failed:', e);
        } finally {
            this.isSyncing = false;
        }
    }

    async syncDown() {
        if (this.isSyncing) return;
        this.isSyncing = true;
        try {
            if (typeof LuminaAuth === 'undefined' || !LuminaAuth.isAuthenticated) return;
            const token = await LuminaAuth.getAuthToken(false);
            if (!token) return;

            const fileId = await this.findBackupFile(token);
            if (!fileId) return;

            const remoteBackup = await this.downloadBackup(token, fileId);
            if (remoteBackup && remoteBackup.data) {
                await this.mergeData(remoteBackup.data);
            }
            console.log('[FlashcardSync] Sync down complete');
        } catch (e) {
            console.error('[FlashcardSync] Sync down failed:', e);
        } finally {
            this.isSyncing = false;
        }
    }

    async mergeData(remoteState) {
        await this.initPromise;
        const localTime = this.state.lastUpdated || 0;
        const remoteTime = remoteState.lastUpdated || 0;

        // Simple strategy: newer timestamp wins
        if (remoteTime > localTime) {
            this.state = remoteState;
            await chrome.storage.local.set({ 'lumina_flashcards': this.state });
        } else if (localTime > remoteTime) {
            // Local is newer, trigger upload
            setTimeout(() => this.syncUp(), 1000);
        }
    }

    async findBackupFile(token) {
        const q = `name = '${this.FILENAME}' and 'appDataFolder' in parents and trashed = false`;
        const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&spaces=appDataFolder&fields=files(id, name)`;
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('Failed to find backup file');
        const data = await response.json();
        return data.files && data.files.length > 0 ? data.files[0].id : null;
    }

    async downloadBackup(token, fileId) {
        const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('Download failed');
        return await response.json();
    }

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
        if (!response.ok) throw new Error('Create file failed');
    }

    async updateBackupFile(token, fileId, content) {
        const metadata = { name: this.FILENAME };
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', new Blob([content], { type: 'application/json' }));
        const response = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${token}` },
            body: form
        });
        if (!response.ok) throw new Error('Update file failed');
    }

    triggerAutoSync() {
        if (this._syncTimeout) clearTimeout(this._syncTimeout);
        this._syncTimeout = setTimeout(() => this.syncUp(), 5000); // sync 5s after last modification
    }
}

// Instantiate globally
const LuminaFlashcardsDB = new FlashcardDB();
if (typeof window !== 'undefined') {
    window.LuminaFlashcardsDB = LuminaFlashcardsDB;
} else {
    globalThis.LuminaFlashcardsDB = LuminaFlashcardsDB;
}
