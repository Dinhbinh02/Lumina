

class AnkiClient {
    constructor() {
        this.version = 6;
        this.endpoint = 'http://127.0.0.1:8765';
    }

    
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

    
    
    async findNoteIds(query = "deck:current") {
        return this.invoke('findNotes', { query: query });
    }

    
    async getNotesInfo(noteIds) {
        if (!noteIds || noteIds.length === 0) return [];
        const ids = noteIds.map(id => parseInt(id));
        return this.invoke('notesInfo', { notes: ids });
    }

    
    async findNotes(query = "deck:current", limit = null) {
        const ids = await this.findNoteIds(query);

        
        
        let targetIds = ids;
        if (limit && limit > 0) {
            targetIds = ids.sort((a, b) => b - a).slice(0, limit);
        } else {
            
            targetIds = ids.sort((a, b) => b - a);
        }

        return this.getNotesInfo(targetIds);
    }

    async getReviewsOfCards(cardIds) {
        return this.invoke('getReviewsOfCards', { cards: cardIds });
    }

    
    async getAllCardIds() {
        return this.invoke('findCards', { query: "deck:*" });
    }

    async deleteNotes(noteIds) {
        return this.invoke('deleteNotes', { notes: noteIds }); 
    }

    async deleteDecks(deckNames) {
        return this.invoke('deleteDecks', { decks: deckNames, cardsToo: true });
    }

    
    async updateNoteFields(id, fields) {
        return this.invoke('updateNoteFields', {
            note: {
                id: parseInt(id),
                fields: fields
            }
        });
    }

    
    async ping() {
        try {
            await this.invoke('version');
            return true;
        } catch (e) {
            return false;
        }
    }

    
    
    async sync() {
        return this.invoke('sync');
    }

    
    async addNotes(notes) {
        return this.invoke('addNotes', { notes });
    }

    
    async multi(actions) {
        return this.invoke('multi', { actions });
    }
}



