// User Memory System for Lumina (Manual Instructions)

const UserMemory = {
    MAX_FACTS: 10,
    STORAGE_KEY: 'user_memory',

    // Default empty memory
    getDefaultMemory() {
        return {
            facts: [],
            version: 2
        };
    },

    // Load memory from storage
    async load() {
        return new Promise((resolve) => {
            chrome.storage.local.get([this.STORAGE_KEY], (result) => {
                resolve(result[this.STORAGE_KEY] || this.getDefaultMemory());
            });
        });
    },

    // Save memory to storage
    async save(memory) {
        return new Promise((resolve) => {
            chrome.storage.local.set({ [this.STORAGE_KEY]: memory }, resolve);
        });
    },

    // Get all facts
    async getFacts() {
        const memory = await this.load();
        return memory.facts || [];
    },

    // Add a fact
    async addFact(fact) {
        const memory = await this.load();
        if (fact && fact.trim() && !memory.facts.includes(fact.trim())) {
            memory.facts.push(fact.trim());
            // No strict limit enforced on push, but UI might limit display
            // User requested max 10 display with scroll.
            // We can keep storing more if user wants, or limit to say 50.
            // Let's stick to a reasonable internal limit like 50 to avoid prompt overflow.
            if (memory.facts.length > 50) {
                memory.facts = memory.facts.slice(-50);
            }
            await this.save(memory);
        }
        return memory.facts;
    },

    // Update a fact at index
    async updateFact(index, newFact) {
        const memory = await this.load();
        if (index >= 0 && index < memory.facts.length && newFact && newFact.trim()) {
            memory.facts[index] = newFact.trim();
            await this.save(memory);
        }
        return memory.facts;
    },

    // Remove a fact at index
    async removeFact(index) {
        const memory = await this.load();
        if (index >= 0 && index < memory.facts.length) {
            memory.facts.splice(index, 1);
            await this.save(memory);
        }
        return memory.facts;
    },

    // Clear all facts
    async clearAll() {
        await this.save(this.getDefaultMemory());
    },

    // Get formatted string for system prompt injection
    async getSystemPromptAddition() {
        const facts = await this.getFacts();
        if (facts.length === 0) return '';

        return `
[USER INSTRUCTIONS]:
${facts.map(f => `• ${f}`).join('\n')}
`;
    }
};

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UserMemory;
}
