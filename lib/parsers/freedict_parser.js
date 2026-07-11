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

        const getLemma = (w) => {
            if (!w) return '';
            if (w.endsWith('ss')) return w;
            if (w.endsWith('ies')) return w.slice(0, -3) + 'y';
            if (w.endsWith('es')) {
                const base = w.slice(0, -2);
                if (base.endsWith('sh') || base.endsWith('ch') || base.endsWith('x') || base.endsWith('s') || base.endsWith('z')) {
                    return base;
                }
                return w.slice(0, -1);
            }
            if (w.endsWith('s') && !w.endsWith('us') && !w.endsWith('is') && !w.endsWith('as')) {
                return w.slice(0, -1);
            }
            return w;
        };
        const getAmericanSpelling = (w) => {
            if (!w) return '';
            return w
                .replace(/isation/gi, 'ization')
                .replace(/isations/gi, 'izations')
                .replace(/ise\b/gi, 'ize')
                .replace(/ises\b/gi, 'izes')
                .replace(/ised\b/gi, 'ized')
                .replace(/ising\b/gi, 'izing')
                .replace(/yse\b/gi, 'yze')
                .replace(/yses\b/gi, 'yzes')
                .replace(/ysed\b/gi, 'yzed')
                .replace(/ysing\b/gi, 'yzing');
        };

        apiData.forEach(item => {
            const wordLower = (item.word || result.word || '').toLowerCase().trim();
            const lemma = getLemma(wordLower);
            const audioLemma = getAmericanSpelling(lemma);
            let ukIPA = '';
            let usIPA = '';
            
            let ukAudio = `https://ssl.gstatic.com/dictionary/static/sounds/oxford/${encodeURIComponent(audioLemma)}--_gb_1.mp3`;
            let usAudio = `https://ssl.gstatic.com/dictionary/static/sounds/oxford/${encodeURIComponent(audioLemma)}--_us_1.mp3`;

            const phonetics = item.phonetics || [];
            
            // Try to find UK IPA by audio tags or text tags
            const ukPhonetic = phonetics.find(p => 
                (p.audio && (p.audio.includes('-uk') || p.audio.includes('-au') || p.audio.includes('uk_pron'))) ||
                (p.text && (p.text.includes('uk') || p.text.includes('br')))
            );
            if (ukPhonetic) {
                ukIPA = ukPhonetic.text || '';
            }

            // Try to find US IPA by audio tags or text tags
            const usPhonetic = phonetics.find(p => 
                (p.audio && (p.audio.includes('-us') || p.audio.includes('-ca') || p.audio.includes('us_pron'))) ||
                (p.text && (p.text.includes('us') || p.text.includes('am')))
            );
            if (usPhonetic) {
                usIPA = usPhonetic.text || '';
            }

            // Fallback if either is missing
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
