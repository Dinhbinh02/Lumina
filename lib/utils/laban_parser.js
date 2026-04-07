/**
 * Lumina - Laban Dictionary Parser
 * Extracts structured data from Laban Dictionary (dict.laban.vn) HTML.
 */

const LabanParser = {
    parse: function(html) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const content = doc.querySelector('#content_selectable');
        if (!content) return null;

        const result = {
            word: doc.querySelector('h2.title')?.innerText.trim() || '',
            ipa: doc.querySelector('.color-black, .color-orange')?.innerText.trim() || '',
            audio_uk: doc.querySelector('a.sp_uk')?.getAttribute('data-src') || '',
            audio_us: doc.querySelector('a.sp_us')?.getAttribute('data-src') || '',
            entries: []
        };

        // Laban's content can be nested in slide elements or direct
        let actualContent = content;
        const nestedContent = content.querySelector('.slide_content .content');
        if (nestedContent) actualContent = nestedContent;

        const children = Array.from(actualContent.children);
        let currentEntry = null;

        children.forEach(child => {
            // Word Type (Noun, Verb, etc.)
            if (child.classList.contains('bg-grey') && child.classList.contains('bold')) {
                currentEntry = {
                    pos: child.innerText.trim(),
                    definitions: []
                };
                result.entries.push(currentEntry);
            } 
            // Definition (Vietnamese)
            else if (child.classList.contains('green') && child.classList.contains('bold')) {
                if (!currentEntry) {
                    currentEntry = { pos: '', definitions: [] };
                    result.entries.push(currentEntry);
                }
                currentEntry.definitions.push({
                    meaning: child.innerText.trim(),
                    examples: []
                });
            }
            // Example (English)
            else if (child.classList.contains('color-light-blue')) {
                if (currentEntry && currentEntry.definitions.length > 0) {
                    const lastDef = currentEntry.definitions[currentEntry.definitions.length - 1];
                    const enText = child.innerText.trim();
                    
                    // The Vietnamese translation is usually the NEXT sibling
                    let viText = '';
                    const next = child.nextElementSibling;
                    if (next && next.classList.contains('margin25') && !next.classList.contains('color-light-blue') && !next.classList.contains('green')) {
                        viText = next.innerText.trim();
                    }

                    lastDef.examples.push({
                        en: enText,
                        vi: viText
                    });
                }
            }
        });

        return result;
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = LabanParser;
} else {
    window.LabanParser = LabanParser;
}
