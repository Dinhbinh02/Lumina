export const UserMemory = {
    MAX_FACTS: 10,
    STORAGE_KEY: 'user_memory',
    getDefaultMemory() {
        return {
            facts: [],
            version: 2
        };
    },
    async load() {
        return new Promise((resolve) => {
            chrome.storage.local.get([this.STORAGE_KEY, 'userFacts'], (result) => {
                let memory = result[this.STORAGE_KEY];
                const legacyFacts = result['userFacts'];
                if (legacyFacts && Array.isArray(legacyFacts) && legacyFacts.length > 0) {
                    if (!memory) {
                        memory = this.getDefaultMemory();
                    }
                    if (!memory.facts) {
                        memory.facts = [];
                    }
                    let merged = false;
                    for (const fact of legacyFacts) {
                        if (fact && fact.trim() && !memory.facts.includes(fact.trim())) {
                            memory.facts.push(fact.trim());
                            merged = true;
                        }
                    }
                    if (merged) {
                        chrome.storage.local.set({ [this.STORAGE_KEY]: memory });
                    }
                    chrome.storage.local.remove('userFacts');
                }
                resolve(memory || this.getDefaultMemory());
            });
        });
    },
    async save(memory) {
        return new Promise((resolve) => {
            chrome.storage.local.set({ [this.STORAGE_KEY]: memory }, resolve);
        });
    },
    async getFacts() {
        const memory = await this.load();
        return memory.facts || [];
    },
    async addFact(fact) {
        const memory = await this.load();
        if (fact && fact.trim() && !memory.facts.includes(fact.trim())) {
            memory.facts.push(fact.trim());
            if (memory.facts.length > 50) {
                memory.facts = memory.facts.slice(-50);
            }
            await this.save(memory);
        }
        return memory.facts;
    },
    async updateFact(index, newFact) {
        const memory = await this.load();
        if (index >= 0 && index < memory.facts.length && newFact && newFact.trim()) {
            memory.facts[index] = newFact.trim();
            await this.save(memory);
        }
        return memory.facts;
    },
    async removeFact(index) {
        const memory = await this.load();
        if (index >= 0 && index < memory.facts.length) {
            memory.facts.splice(index, 1);
            await this.save(memory);
        }
        return memory.facts;
    },
    async clearAll() {
        await this.save(this.getDefaultMemory());
    },
    async getSystemPromptAddition() {
        return new Promise((resolve) => {
            chrome.storage.local.get([
                'aboutNickname', 'aboutOccupation', 'aboutInterests', this.STORAGE_KEY
            ], (result) => {
                let parts = [];
                let aboutYouParts = [];
                if (result.aboutNickname) aboutYouParts.push(`- Nickname: ${result.aboutNickname}`);
                if (result.aboutOccupation) aboutYouParts.push(`- Occupation: ${result.aboutOccupation}`);
                if (result.aboutInterests) aboutYouParts.push(`- Interests & Preferences: ${result.aboutInterests}`);
                if (aboutYouParts.length > 0) {
                    parts.push(`[ABOUT THE USER]:\n${aboutYouParts.join('\n')}`);
                }

                let facts = [];
                if (result[this.STORAGE_KEY] && Array.isArray(result[this.STORAGE_KEY].facts)) {
                    facts = result[this.STORAGE_KEY].facts;
                }
                if (facts.length > 0) {
                    parts.push(`[ADDITIONAL CUSTOM INSTRUCTIONS]:\n${facts.map(f => `• ${f}`).join('\n')}`);
                }
                if (parts.length === 0) {
                    resolve('');
                } else {
                    resolve('\n' + parts.join('\n\n') + '\n');
                }
            });
        });
    }
};

if (typeof globalThis !== 'undefined') {
    globalThis.UserMemory = UserMemory;
}
