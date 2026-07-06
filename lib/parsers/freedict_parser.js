const FreeDictParser = {
    parse: function(apiData) {
        if (!apiData) return { word: '', entries: [] };
        if (apiData && Array.isArray(apiData.entries)) return apiData;

        const result = {
            word: '',
            entries: []
        };

        if (!Array.isArray(apiData) || apiData.length === 0) {
            return result;
        }

        result.word = apiData[0].word || '';

        apiData.forEach(item => {
            let ukIPA = '';
            let ukAudio = '';
            let usIPA = '';
            let usAudio = '';

            const phonetics = item.phonetics || [];
            
            const ukPhonetic = phonetics.find(p => p.audio && (p.audio.includes('-uk') || p.audio.includes('-au') || p.audio.includes('uk_pron')));
            const usPhonetic = phonetics.find(p => p.audio && (p.audio.includes('-us') || p.audio.includes('-ca') || p.audio.includes('us_pron')));

            if (ukPhonetic) {
                ukAudio = ukPhonetic.audio;
                ukIPA = ukPhonetic.text || item.phonetic || '';
            }
            if (usPhonetic) {
                usAudio = usPhonetic.audio;
                usIPA = usPhonetic.text || item.phonetic || '';
            }

            if (!ukAudio || !usAudio) {
                phonetics.forEach(p => {
                    if (p.audio) {
                        if (!ukAudio) {
                            ukAudio = p.audio;
                            if (p.text) ukIPA = p.text;
                        } else if (!usAudio && p.audio !== ukAudio) {
                            usAudio = p.audio;
                            if (p.text) usIPA = p.text;
                        }
                    }
                });
            }

            if (!ukIPA || !usIPA) {
                const texts = phonetics.filter(p => p.text).map(p => p.text);
                if (texts.length > 0) {
                    if (!ukIPA) ukIPA = texts[0];
                    if (!usIPA) usIPA = texts[1] || texts[0];
                } else if (item.phonetic) {
                    if (!ukIPA) ukIPA = item.phonetic;
                    if (!usIPA) usIPA = item.phonetic;
                }
            }

            const cleanIPA = (ipa) => ipa ? ipa.replace(/^\/|\/$/g, '') : '';
            ukIPA = cleanIPA(ukIPA);
            usIPA = cleanIPA(usIPA);

            const formatAudio = (url) => {
                if (!url) return '';
                if (url.startsWith('//')) return 'https:' + url;
                return url;
            };
            ukAudio = formatAudio(ukAudio);
            usAudio = formatAudio(usAudio);

            const meanings = item.meanings || [];
            meanings.forEach(meaning => {
                const pos = meaning.partOfSpeech || '';
                const senseData = {
                    indicator: '',
                    definitions: []
                };

                const defs = meaning.definitions || [];
                defs.forEach(def => {
                    const meaningText = def.definition || '';
                    const examples = def.example ? [def.example] : [];
                    if (meaningText) {
                        senseData.definitions.push({
                            meaning: meaningText,
                            translation: '',
                            examples: examples
                        });
                    }
                });

                if (senseData.definitions.length > 0) {
                    result.entries.push({
                        word: item.word || result.word,
                        pos: pos,
                        uk: { ipa: ukIPA, audio: ukAudio },
                        us: { ipa: usIPA, audio: usAudio },
                        senses: [senseData]
                    });
                }
            });
        });

        return result;
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = FreeDictParser;
} else {
    window.FreeDictParser = FreeDictParser;
}
