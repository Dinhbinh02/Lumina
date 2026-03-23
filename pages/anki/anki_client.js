/**
 * AnkiConnect Client
 * Wrapper for communicating with Anki via localhost:8765
 */

class AnkiClient {
    constructor() {
        this.version = 6;
        this.endpoint = 'http://127.0.0.1:8765';
    }

    /**
     * Generic invoke method for AnkiConnect
     * @param {string} action 
     * @param {object} params 
     */
    invoke(action, params = {}) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.addEventListener('error', () => reject('Failed to connect to AnkiConnect. Is Anki running?'));
            xhr.addEventListener('load', () => {
                try {
                    const response = JSON.parse(xhr.responseText);
                    if (Object.getOwnPropertyNames(response).length != 2) {
                        throw 'response has an unexpected number of fields';
                    }
                    if (!response.hasOwnProperty('error')) {
                        throw 'response is missing required error field';
                    }
                    if (!response.hasOwnProperty('result')) {
                        throw 'response is missing required result field';
                    }
                    if (response.error) {
                        throw response.error;
                    }
                    resolve(response.result);
                } catch (e) {
                    reject(e);
                }
            });

            xhr.open('POST', this.endpoint);
            xhr.send(JSON.stringify({ action, version: this.version, params }));
        });
    }

    // --- Core Methods ---

    async getVersion() {
        return this.invoke('version');
    }

    async getDecks() {
        return this.invoke('deckNames');
    }

    async getModels() {
        return this.invoke('modelNames');
    }

    async getModelFields(modelName) {
        return this.invoke('modelFieldNames', { modelName });
    }

    async addNote(note) {
        return this.invoke('addNote', { note });
    }

    /**
     * Search for notes. Defaults to 20 recent items if query is empty.
     */
    /**
     * Get just the IDs (fast)
     */
    async findNoteIds(query = "deck:current") {
        return this.invoke('findNotes', { query: query });
    }

    /**
     * Get info for specific IDs
     */
    async getNotesInfo(noteIds) {
        if (!noteIds || noteIds.length === 0) return [];
        const ids = noteIds.map(id => parseInt(id));
        return this.invoke('notesInfo', { notes: ids });
    }

    /**
     * Search for notes. Defaults to 20 recent items if query is empty.
     */
    async findNotes(query = "deck:current", limit = null) {
        const ids = await this.findNoteIds(query);

        // If limit is provided, take the most recent ones (assuming IDs allow roughly sorting by time)
        // ids from Anki are usually creation timestamps.
        let targetIds = ids;
        if (limit && limit > 0) {
            targetIds = ids.sort((a, b) => b - a).slice(0, limit);
        } else {
            // Newest first
            targetIds = ids.sort((a, b) => b - a);
        }

        return this.getNotesInfo(targetIds);
    }

    async getReviewsOfCards(cardIds) {
        return this.invoke('getReviewsOfCards', { cards: cardIds });
    }

    /**
     * Get all cards in the collection
     */
    async getAllCardIds() {
        return this.invoke('findCards', { query: "deck:*" });
    }

    async deleteNotes(noteIds) {
        return this.invoke('deleteNotes', { notes: noteIds }); // Note: 'deleteNotes' capability depends on AnkiConnect version
    }

    async deleteDecks(deckNames) {
        return this.invoke('deleteDecks', { decks: deckNames, cardsToo: true });
    }

    /**
     * Update fields of an existing note
     */
    async updateNoteFields(id, fields) {
        return this.invoke('updateNoteFields', {
            note: {
                id: parseInt(id),
                fields: fields
            }
        });
    }

    // Check if connected
    async ping() {
        try {
            await this.invoke('version');
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * Trigger synchronization with AnkiWeb
     */
    /**
     * Trigger synchronization with AnkiWeb
     */
    async sync() {
        return this.invoke('sync');
    }

    /**
     * Add multiple notes in a single request (much faster)
     */
    async addNotes(notes) {
        return this.invoke('addNotes', { notes });
    }

    /**
     * Execute multiple actions in a single request
     */
    async multi(actions) {
        return this.invoke('multi', { actions });
    }
}

// Export instance
// window.Anki = new AnkiClient();
