/**
 * Lumina - Cambridge Dictionary Parser
 * Extracts structured data from Cambridge Dictionary HTML.
 */

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

        // Find all dictionary blocks
        const dictionaryBlocks = doc.querySelectorAll('.pr.dictionary');
        
        dictionaryBlocks.forEach(dict => {
            const datasetId = dict.getAttribute('data-id') || '';
            const dictTitle = dict.querySelector('.di-title')?.innerText.toLowerCase() || '';
            
            // Explicitly exclude non-primary sections as requested by user
            // cald4 = Primary English, cacd = American, cbed = Business
            if (datasetId === 'cacd' || datasetId === 'cbed') return;
            
            // Fallback: exclude by title if data-id is missing, but be specific
            if (dictTitle.includes('american dictionary')) return;
            if (dictTitle.includes('business english')) return;

            // Target either regular entry bodies OR top-level idiom blocks
            // Use .pr.idiom-block to avoid nested .idiom-block elements (which cause duplicates)
            // Target primary entry bodies (standard Cambridge format)
            let entryBodies = Array.from(dict.querySelectorAll('.entry-body__el, .pr.idiom-block, .idiom-block'));
            
            // If no primary entry bodies (happens in PASSWORD/VI dictionaries), treat the whole dictionary as one entry
            if (entryBodies.length === 0) {
                entryBodies = [dict];
            } else {
                // Filter out nested ones JUST in case
                entryBodies = entryBodies.filter((el, i, self) => {
                    return !self.some((other, j) => i !== j && other.contains(el));
                });
            }

            // Use a Set to avoid processing the same element twice (just in case)
            const processedElements = new Set();
            
            entryBodies.forEach(entry => {
                if (processedElements.has(entry)) return;
                processedElements.add(entry);

                const isIdiom = entry.classList.contains('idiom-block');
                
                // Get POS from the PRIMARY header of this entry body element only.
                // We use :scope to ensure we don't pick up .pos.dpos from nested .dsense_h
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

                // Get Senses (Big meaning groups like EXTRA, THIN...)
                // For idioms, they might be in .dsense or just directly in .idiom-body
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
                    // Simple entries without Senses (often the case for standalone idiom blocks or simple VI entries)
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
                    // Final check: filter out pure American entries if we have no UK data
                    const isPureAmerican = !entryData.uk.ipa && entryData.us.ipa;
                    if (!isIdiom && isPureAmerican) {
                        // Skip if it looks like a secondary American dictionary entry
                        return;
                    }
                    result.entries.push(entryData);
                }
            });
        });

        // Get Browse section
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

        // If no entries found, check for auto-suggestions (spelling/similar)
        if (result.entries.length === 0) {
            // Target links that are specifically for "direct search" suggestions
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

// Export for common use if needed
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CambridgeParser;
} else {
    window.CambridgeParser = CambridgeParser;
}
