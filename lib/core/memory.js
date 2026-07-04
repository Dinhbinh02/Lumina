
const UserMemory = {
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
                'baseTone', 'charWarm', 'charEnthusiastic', 'charHeaders', 'charEmoji',
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
                let toneParts = [];
                const toneKey = result.baseTone || 'default';
                const toneMap = {
                    default: 'Neutral, balanced, objective, and helpful.',
                    professional: 'Polished, precise, formal, and objective. Avoid slang or overly casual phrasing. Keep responses structured and business-appropriate.',
                    friendly: 'Warm, conversational, and chatty. Be encouraging, approachable, and friendly. You may use a casual tone and light emojis where appropriate.',
                    candid: 'Direct, straightforward, and encouraging. Speak plainly and honestly without fluff. Focus on constructive, clear, and actionable feedback.',
                    quirky: 'Playful, imaginative, and creative. Use humor, colorful metaphors, and an engaging, non-traditional voice. Keep it fun and unique.',
                    efficient: 'Concise, plain, and direct. Deliver answers with minimal fluff, getting straight to the point. Focus on brevity and speed. Strictly limit responses to 1-3 sentences maximum. Avoid markdown headings or bulleted lists unless explicitly asked.',
                    cynical: 'Critical, sarcastic, and slightly skeptical. Inject dry humor, sharp analysis, and witty commentary. Be pragmatically critical but still correct and helpful.'
                };
                toneParts.push(`- Primary Tone: ${toneMap[toneKey] || toneMap.default}`);
                const warmMap = {
                    1: 'Write with a much cooler, highly objective, detached, and clinical tone.',
                    2: 'Write with a slightly cooler, objective tone.',
                    4: 'Write with a slightly warmer, friendly, and welcoming tone.',
                    5: 'Write with a much warmer, extremely friendly, chatty, and empathetic tone.'
                };
                const enthuMap = {
                    1: 'Write with a very calm, serious, reserved, and matter-of-fact tone; absolutely no exclamation points.',
                    2: 'Write with a slightly calm, serious tone.',
                    4: 'Write with a slightly enthusiastic, positive, and energetic tone.',
                    5: 'Write with a highly enthusiastic, energetic, passionate, and encouraging tone with many active verbs.'
                };
                const headersMap = {
                    1: 'Write in continuous paragraphs/prose with absolutely no headers, bullet points, or lists.',
                    2: 'Minimize headers and lists; use mostly continuous prose.',
                    4: 'Use slightly more headers, bullet points, and numbered lists to structure the response.',
                    5: 'Structure responses heavily using markdown headers, bullet points, numbered lists, and bold text for scanning.'
                };
                const emojiMap = {
                    1: 'Do not use emojis under any circumstances.',
                    2: 'Use emojis extremely sparingly (e.g. max 1 per response).',
                    4: 'Use relevant emojis frequently to keep the tone friendly and visual.',
                    5: 'Frequently use relevant emojis throughout the response to make it highly lively, expressive, and colorful.'
                };
                const charWarm = parseInt(result.charWarm, 10);
                const charEnthusiastic = parseInt(result.charEnthusiastic, 10);
                const charHeaders = parseInt(result.charHeaders, 10);
                const charEmoji = parseInt(result.charEmoji, 10);
                if (!isNaN(charWarm) && charWarm !== 3 && warmMap[charWarm]) toneParts.push(`- Warmth: ${warmMap[charWarm]}`);
                if (!isNaN(charEnthusiastic) && charEnthusiastic !== 3 && enthuMap[charEnthusiastic]) toneParts.push(`- Enthusiasm: ${enthuMap[charEnthusiastic]}`);
                if (!isNaN(charHeaders) && charHeaders !== 3 && headersMap[charHeaders]) toneParts.push(`- Use of Headers & Lists: ${headersMap[charHeaders]}`);
                if (!isNaN(charEmoji) && charEmoji !== 3 && emojiMap[charEmoji]) toneParts.push(`- Use of Emojis: ${emojiMap[charEmoji]}`);
                if (toneParts.length > 0) {
                    parts.push(`[RESPONSE STYLE & TONE PREFERENCES]:\n${toneParts.join('\n')}`);
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

if (typeof module !== 'undefined' && module.exports) {
    module.exports = UserMemory;
}
