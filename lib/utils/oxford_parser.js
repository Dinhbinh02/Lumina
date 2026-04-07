/**
 * Lumina - Oxford Learner's Dictionary Parser
 * Extracts structured data from Oxford Dictionary HTML.
 * Supports multi-entry discovery (e.g., bank_1, bank_2).
 */

const OxfordParser = {
    BASE_URL: 'https://www.oxfordlearnersdictionaries.com/definition/english/',

    parse: function(html) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        
        // Find the headword and POS
        const headwordEl = doc.querySelector('h1.headword');
        const posEl = doc.querySelector('.pos');
        
        const result = {
            word: headwordEl?.innerText.trim() || '',
            entries: [],
            relatedUrls: this.getRelatedEntryUrls(doc)
        };

        if (!headwordEl) return result;

        // Oxford usually has one primary entry per page (e.g. bank_1)
        // But we wrap it in our common 'entry' structure
        const entryData = {
            pos: posEl?.innerText.trim() || '',
            uk: { ipa: '', audio: '' },
            us: { ipa: '', audio: '' },
            senses: []
        };

        // Extract Phonetics
        const ukPhon = doc.querySelector('.phons_br');
        if (ukPhon) {
            entryData.uk.ipa = ukPhon.querySelector('.phon')?.innerText.trim().replace(/^\/|\/$/g, '') || '';
            const audioBtn = ukPhon.querySelector('.audio_play_button');
            if (audioBtn) {
                entryData.uk.audio = audioBtn.getAttribute('data-src-mp3') || '';
            }
        }

        const usPhon = doc.querySelector('.phons_n_am');
        if (usPhon) {
            entryData.us.ipa = usPhon.querySelector('.phon')?.innerText.trim().replace(/^\/|\/$/g, '') || '';
            const audioBtn = usPhon.querySelector('.audio_play_button');
            if (audioBtn) {
                entryData.us.audio = audioBtn.getAttribute('data-src-mp3') || '';
            }
        }

        // Extract Senses
        // Oxford structure can be: .shcut-g (topic group) containing senses
        // Or just senses directly in .top-g
        const senses = doc.querySelectorAll('li.sense');
        
        senses.forEach(sense => {
            // Find indicator (Shortcut/Topic or Labels)
            let indicator = '';
            
            // 1. Try Shortcut group header
            const shortcutG = sense.closest('.shcut-g');
            if (shortcutG) {
                indicator = shortcutG.querySelector('.shcut')?.innerText.trim() || '';
            }
            
            // 2. Try Grain (sub-label like [uncountable])
            const labels = sense.querySelector('.labels')?.innerText.trim() || '';
            if (labels) {
                indicator = indicator ? `${indicator} ${labels}` : labels;
            }

            const senseData = {
                indicator: indicator,
                definitions: []
            };

            const def = sense.querySelector('.def')?.innerText.trim() || '';
            
            if (def) {
                senseData.definitions.push({
                    meaning: def,
                    translation: ''
                });
            }

            if (senseData.definitions.length > 0) {
                entryData.senses.push(senseData);
            }
        });

        if (entryData.senses.length > 0) {
            result.entries.push(entryData);
        }

        return result;
    },

    /**
     * Looks for other entries of the same word (e.g., bank verb if we are on bank noun)
     * in the #relatedentries sidebar.
     */
    getRelatedEntryUrls: function(doc) {
        const headword = doc.querySelector('h1.headword')?.innerText.trim().toLowerCase();
        if (!headword) return [];

        const currentUrl = doc.querySelector('link[rel="canonical"]')?.getAttribute('href') || '';
        const urls = [];
        const relatedLinks = doc.querySelectorAll('#relatedentries li a, .nearby li a, .all-matches li a');
        
        relatedLinks.forEach(link => {
            const text = link.innerText.trim().toLowerCase();
            const href = link.getAttribute('href');
            
            const isExactMatch = text === headword || text.startsWith(headword + ' ');
            const isEntryLink = href && (href.includes('/definition/english/') || href.includes('_'));
            const fullUrl = href.startsWith('http') ? href : 'https://www.oxfordlearnersdictionaries.com' + href;
            
            if (isExactMatch && isEntryLink && fullUrl !== currentUrl && !urls.includes(fullUrl)) {
                urls.push(fullUrl);
            }
        });

        return [...new Set(urls)].slice(0, 5); // Limit to 5 related entries
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = OxfordParser;
} else {
    window.OxfordParser = OxfordParser;
}
