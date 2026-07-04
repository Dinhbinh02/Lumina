
const OxfordParser = {
    BASE_URL: 'https://www.oxfordlearnersdictionaries.com/definition/english/',
    parse: function(html) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const headwordEl = doc.querySelector('h1.headword');
        const posEl = doc.querySelector('.pos');
        const result = {
            word: headwordEl?.innerText.trim() || '',
            entries: [],
            relatedUrls: this.getRelatedEntryUrls(doc)
        };
        if (!result.word) return result;
        const entryData = {
            word: result.word,
            pos: posEl?.innerText.trim() || '',
            uk: { ipa: '', audio: '' },
            us: { ipa: '', audio: '' },
            senses: []
        };
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
        const senses = doc.querySelectorAll('li.sense');
        const senseGroups = new Map();
        senses.forEach(sense => {
            let indicator = '';
            const shortcutG = sense.closest('.shcut-g');
            if (shortcutG) {
                indicator = shortcutG.querySelector('.shcut')?.innerText.trim() || '';
            }
            if (!indicator) {
                const labels = sense.querySelector('.labels, .grammar, .dis-g')?.innerText.trim() || '';
                if (labels) indicator = labels;
            }
            const def = sense.querySelector('.def')?.innerText.trim() || '';
            if (!def) return;
            const groupKey = indicator || '__no_indicator__';
            if (!senseGroups.has(groupKey)) {
                senseGroups.set(groupKey, {
                    indicator: indicator,
                    definitions: []
                });
            }
            senseGroups.get(groupKey).definitions.push({
                meaning: def,
                translation: ''
            });
        });
        entryData.senses = Array.from(senseGroups.values());
        if (entryData.senses.length > 0) {
            result.entries.push(entryData);
        }
        return result;
    },
    getRelatedEntryUrls: function(doc) {
        const headword = doc.querySelector('h1.headword')?.innerText.trim().toLowerCase();
        if (!headword) return [];
        const currentUrl = doc.querySelector('link[rel="canonical"]')?.getAttribute('href') ||
                          window.location?.href || '';
        const urls = [];
        const selectors = [
            '#relatedentries li a',
            '.nearby li a',
            '.all-matches li a',
            '.results-container li a',
            '.oxford-container li a',
            '#relatedentries .list-g a'
        ];
        const relatedLinks = doc.querySelectorAll(selectors.join(', '));
        relatedLinks.forEach(link => {
            const text = link.innerText.trim().toLowerCase();
            const href = link.getAttribute('href');
            if (!href) return;
            const headwordEscaped = headword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const headwordRegex = new RegExp(`^${headwordEscaped}(\\s+\\d+|\\s+\\([a-z\\s/-]+\\)|\\s+noun|\\s+verb|\\s+adj|\\s+adv|\\s+pronoun|\\s+preposition|\\s+conjunction)?$`, 'i');
            if (headwordRegex.test(text)) {
                let fullUrl = href.startsWith('http') ? href : 'https://www.oxfordlearnersdictionaries.com' + (href.startsWith('/') ? '' : '/definition/english/') + href;
                if (fullUrl !== currentUrl && !urls.includes(fullUrl)) {
                    urls.push(fullUrl);
                }
            }
        });
        return [...new Set(urls)].slice(0, 3);
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = OxfordParser;
} else {
    window.OxfordParser = OxfordParser;
}
