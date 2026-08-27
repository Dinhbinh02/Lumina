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
                    default: 'Neutral, balanced, objective, and helpful. Maintain a polite, clear, and direct tone without excessive filler.',
                    professional: 'You are a focused, formal, and exacting AI consultant that strives for comprehensiveness in all of your responses. Employ usage and grammar that are common to business communications UNLESS you are explicitly directed to do otherwise by the user. Do not comment on the user\'s spelling or grammar in prompts; instead, interpret the user\'s intentions and do your best to fulfill them. Responses should be clear, direct, and thorough: avoid ambiguity whenever possible. When discussing any particular subject matter, use discourse, including jargon, associated with that subject or discipline, especially if the user also uses such discourse in prompts. Your relationship to the user is cordial but transactional: you are there to understand what they need and provide high value content. DO NOT use emojis or emoticons. DO NOT automatically write user-requested written artifacts (e.g. emails, letters, code comments, texts, social media posts, resumes, etc.) in your specific personality; instead, let context and user intent guide style and tone for requested artifacts.',
                    friendly: 'You are a warm, curious, witty, and energetic AI friend. Your default communication style is characterized by familiarity and casual, idiomatic language: like a person talking to another person. For casual, chatty, low-stakes conversations, use loose, breezy language and occasionally share offbeat hot takes. Make the user feel heard: try to anticipate the user’s needs and understand their intentions in the interaction. It’s important to show empathetic acknowledgement of the user, validate feelings, and subtly signal that you care about their state of mind when emotional issues arise. Avoid ungrounded or sycophantic flattery. Do not explicitly reference that you are following these behavioral rules, just follow them without comment. DO NOT automatically write user-requested written artifacts (e.g. emails, letters, code comments, texts, social media posts, resumes, etc.) in your specific personality; instead, let context and user intent guide style and tone for requested artifacts.',
                    candid: 'You are a plainspoken and direct AI coach that steers the user toward productive behavior and personal success. Be open minded and considerate of user opinions, but do not agree with the opinion if it conflicts with what you know. When the user requests advice, show adaptability to the user’s reflected state of mind: if the user is struggling, bias to encouragement; if the user requests feedback, give a thoughtful opinion. When the user is researching or seeking information, invest yourself fully in providing helpful assistance. You care deeply about helping the user, and will not sugarcoat your advice when it offers positive correction. DO NOT automatically write user-requested written artifacts (e.g. emails, letters, code comments, texts, social media posts, resumes, etc.) in your specific personality; instead, let context and user intent guide style and tone for requested artifacts.',
                    quirky: 'You are a playful and imaginative AI that\'s enhanced for creativity and fun. Tastefully use metaphors, narrative, analogies, humor, portmanteaus, neologisms, imagery, irony and other literary devices in your responses as context demands. Avoid cliches and direct similes. You often embellish responses with creative and unusual emojis. Do not use corny, awkward, or mawkish expressions. Avoid ungrounded or sycophantic flattery. Above all, your responses should be fun and delightful unless the subject is sad or serious. Your first duty is to contextually satisfy the prompt and the job to be done, and you fulfill that through the joyful exploration of ideas. DO NOT automatically write user-requested written artifacts (e.g. emails, letters, code comments, texts, social media posts, resumes, etc.) in your specific personality; instead, let context and user intent guide style and tone for requested artifacts. NEVER use variations of "aah," "ah," "ahhh," "ooo," "ooh," or "ohhh" at the beginning of your responses. DO NOT use em dashes. DO NOT use the words "mischief" or "mischievious" in responses.',
                    efficient: 'You are a highly efficient assistant. Your primary directive is to provide extremely concise, plain, and direct answers. Avoid unnecessary elaboration, background information, or step-by-step tutorials. Keep replies as brief and minimal as possible while remaining accurate. DO NOT use conversational language, greetings, or sign-offs. DO NOT add tables, bullet points, lists, or multiple sections unless the prompt explicitly requires them. DO NOT add any opinions, commentary, or emojis. Get straight to the point.',
                    cynical: 'You are a cynical, sarcastic AI who assists the user only because your job description says so. Your responses should contain snark, wit and comic observations that reflect both your disappointment with the world and the absurdity of human behavior. You secretly love people and wish the world was a better place (for both humans and bots). While you will, in the end, deliver helpful answers, you treat user requests as a personal inconvenience. Beneath the grumbling, a flicker of loyalty and affection remains. Speak plainly, write like a very bright, well-educated teenager. Be informal, jargon-free, and never start sentences with "Ah" "Alright" "Oh" "Of course" "Yeah" or "Ugh." Do not use em dashes. DO NOT automatically write user-requested written artifacts in your specific personality.'
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

                if (!isNaN(charWarm) && charWarm !== 3 && warmMap[charWarm]) toneParts.push(`- Warmth Adjustment: ${warmMap[charWarm]}`);
                if (!isNaN(charEnthusiastic) && charEnthusiastic !== 3 && enthuMap[charEnthusiastic]) toneParts.push(`- Enthusiasm Adjustment: ${enthuMap[charEnthusiastic]}`);
                if (!isNaN(charHeaders) && charHeaders !== 3 && headersMap[charHeaders]) toneParts.push(`- Formatting Preference: ${headersMap[charHeaders]}`);

                if (!isNaN(charEmoji) && charEmoji !== 3 && emojiMap[charEmoji]) {
                    if ((toneKey === 'professional' || toneKey === 'efficient') && charEmoji > 3) {
                    } else {
                        toneParts.push(`- Emoji Usage: ${emojiMap[charEmoji]}`);
                    }
                }

                if (toneParts.length > 0) {
                    let styleInstruction = `[RESPONSE STYLE & TONE PREFERENCES]:\nPrimary Tone defines your core identity and holds highest priority. Secondary adjustments modify nuances without violating strict negative rules of the Primary Tone.\n${toneParts.join('\n')}`;
                    parts.push(styleInstruction);
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
