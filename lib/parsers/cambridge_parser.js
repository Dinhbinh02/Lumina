

const CambridgeParser = {
    BASE_URL: 'https://dictionary.cambridge.org',

    parse: function(html) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const headwordEl = doc.querySelector('.headword.dhw') || doc.querySelector('.hw.dhw') || doc.querySelector('.dhw');
        const result = {
            word: headwordEl?.innerText.trim() || '',
            entries: [],
            browse: []
        };

        
        const dictionaryBlocks = doc.querySelectorAll('.pr.dictionary');
        
        dictionaryBlocks.forEach(dict => {
            const datasetId = dict.getAttribute('data-id') || '';
            const dictTitle = dict.querySelector('.di-title')?.innerText.toLowerCase() || '';
            
            
            
            if (datasetId === 'cacd' || datasetId === 'cbed') return;
            
            
            if (dictTitle.includes('american dictionary')) return;
            if (dictTitle.includes('business english')) return;

            
            
            
            let entryBodies = Array.from(dict.querySelectorAll('.entry-body__el, .pr.idiom-block, .idiom-block'));
            
            
            if (entryBodies.length === 0) {
                entryBodies = [dict];
            } else {
                
                entryBodies = entryBodies.filter((el, i, self) => {
                    return !self.some((other, j) => i !== j && other.contains(el));
                });
            }

            
            const processedElements = new Set();
            
            entryBodies.forEach(entry => {
                if (processedElements.has(entry)) return;
                processedElements.add(entry);

                const isIdiom = entry.classList.contains('idiom-block');
                
                
                
                const posEl = entry.querySelector(':scope > .pos-header .pos.dpos') || 
                              entry.querySelector('.pos.dpos');
                const pos = isIdiom ? 'idiom' : (posEl?.innerText.trim() || '');
                
                const ukIPA = entry.querySelector('.uk.dpron-i .ipa.dipa')?.innerText.trim() || '';
                const usIPA = entry.querySelector('.us.dpron-i .ipa.dipa')?.innerText.trim() || '';
                const ukAudio = entry.querySelector('.uk.dpron-i source[type="audio/mpeg"]')?.getAttribute('src');
                const usAudio = entry.querySelector('.us.dpron-i source[type="audio/mpeg"]')?.getAttribute('src');

                const entryData = {
                    pos: pos,
                    uk: { 
                        ipa: ukIPA, 
                        audio: ukAudio ? (ukAudio.startsWith('http') ? ukAudio : this.BASE_URL + ukAudio) : '' 
                    },
                    us: { 
                        ipa: usIPA, 
                        audio: usAudio ? (usAudio.startsWith('http') ? usAudio : this.BASE_URL + usAudio) : '' 
                    },
                    senses: []
                };

                
                
                let senses = entry.querySelectorAll('.dsense, .pr.dsense');
                
                if (senses.length > 0) {
                    senses.forEach(sense => {
                        const guideWord = sense.querySelector('.guideword span')?.innerText.trim() || '';
                        const senseData = {
                            indicator: guideWord,
                            definitions: []
                        };

                        const defBlocks = sense.querySelectorAll('.ddef_block, .def-block');
                        defBlocks.forEach(block => {
                            const meaning = block.querySelector('.ddef_d, .def')?.innerText.trim().replace(/:$/, '') || '';
                            const translation = block.querySelector('.trans.dtrans[lang="vi"]')?.innerText.trim() || '';
                            if (meaning || translation) {
                                senseData.definitions.push({ meaning, translation });
                            }
                        });

                        if (senseData.definitions.length > 0) {
                            entryData.senses.push(senseData);
                        }
                    });
                } else {
                    
                    const loneDefBlocks = entry.querySelectorAll('.ddef_block, .def-block');
                    const loneSense = { indicator: '', definitions: [] };
                    loneDefBlocks.forEach(block => {
                        const meaning = block.querySelector('.ddef_d, .def')?.innerText.trim().replace(/:$/, '') || '';
                        const translation = block.querySelector('.trans.dtrans[lang="vi"]')?.innerText.trim() || '';
                        if (meaning || translation) loneSense.definitions.push({ meaning, translation });
                    });
                    if (loneSense.definitions.length > 0) entryData.senses.push(loneSense);
                }

                if (entryData.senses.length > 0) {
                    
                    const isPureAmerican = !entryData.uk.ipa && entryData.us.ipa;
                    if (!isIdiom && isPureAmerican) {
                        
                        return;
                    }
                    result.entries.push(entryData);
                }
            });
        });

        
        const browseLinks = doc.querySelectorAll('.dbrowse a.tb');
        browseLinks.forEach(link => {
            const text = link.innerText.trim();
            if (text) {
                result.browse.push({
                    text: text,
                    url: link.href.startsWith('http') ? link.href : this.BASE_URL + link.getAttribute('href')
                });
            }
        });

        
        if (result.entries.length === 0) {
            
            const allLinks = Array.from(doc.querySelectorAll('a[href*="/search/english/direct/?q="]'));
            const firstSuggestion = allLinks[0];
            
            if (firstSuggestion) {
                result.suggestion = {
                    text: firstSuggestion.innerText.trim(),
                    url: firstSuggestion.getAttribute('href')
                };
            }
        }

        return result;
    }
};


if (typeof module !== 'undefined' && module.exports) {
    module.exports = CambridgeParser;
} else {
    window.CambridgeParser = CambridgeParser;
}
