/**
 * RAG Utilities for Lumina
 * Provides simple text chunking and keyword-based ranking (Mini-RAG).
 */

const LuminaRAG = {
    /**
     * Chunks text into overlapping segments.
     * @param {string} text - The full text content.
     * @param {number} chunkSize - Targeted chunk size in characters (~4 chars per token).
     * @param {number} overlap - Overlap size in characters.
     */
    chunkText(text, chunkSize = 1500, overlap = 200) {
        if (!text || text.length <= chunkSize) return [text];
        
        const chunks = [];
        let startIndex = 0;
        
        while (startIndex < text.length) {
            let endIndex = startIndex + chunkSize;
            
            // Try to find a good breaking point (newline or period)
            if (endIndex < text.length) {
                const searchRange = text.slice(endIndex - 200, endIndex + 100);
                const lastNewline = searchRange.lastIndexOf('\n');
                const lastPeriod = searchRange.lastIndexOf('. ');
                
                if (lastNewline !== -1) {
                    endIndex = (endIndex - 200) + lastNewline + 1;
                } else if (lastPeriod !== -1) {
                    endIndex = (endIndex - 200) + lastPeriod + 2;
                }
            }
            
            chunks.push(text.slice(startIndex, endIndex).trim());
            startIndex = endIndex - overlap;
            
            // Safety check
            if (overlap >= chunkSize) startIndex = endIndex - (chunkSize / 2);
        }
        
        return chunks.filter(c => c.length > 50);
    },

    /**
     * Ranks chunks based on relevance to the query using MiniSearch (BM25).
     * @param {string[]} chunks - Array of text chunks.
     * @param {string} query - The user's query.
     * @param {number} topK - Number of chunks to return.
     */
    rankChunks(chunks, query, topK = 5) {
        if (!query || !chunks || chunks.length === 0) return [];
        if (chunks.length <= topK) return chunks.slice(0, topK);

        try {
            // Check for MiniSearch (Global UMD bundle) accessible in self or window
            const MS = (typeof MiniSearch !== 'undefined') ? MiniSearch : (typeof self !== 'undefined' ? self.MiniSearch : null);
            
            if (MS) {
                const miniSearch = new MS({
                    fields: ['content'],
                    storeFields: ['content'],
                    searchOptions: {
                        boost: { content: 1 },
                        fuzzy: 0.2,
                        prefix: true,
                        combineWith: 'OR'
                    }
                });

                const docs = chunks.map((content, id) => ({ id, content }));
                miniSearch.addAll(docs);

                const results = miniSearch.search(query);
                
                if (results.length > 0) {
                    return results.slice(0, topK).map(r => r.content);
                }
            }
        } catch (e) {
            console.warn('[Lumina RAG] MiniSearch ranking failed, falling back:', e);
        }

        // --- Fallback Simple Ranking (Keyword based) ---
        const keywords = query.toLowerCase()
            .replace(/[^\w\s\u00C0-\u1EF9]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length > 2);

        if (keywords.length === 0) return chunks.slice(0, topK);

        const scoredChunks = chunks.map((content, index) => {
            let score = 0;
            const contentLower = content.toLowerCase();
            keywords.forEach(kw => {
                const count = (contentLower.split(kw).length - 1);
                score += count;
            });
            if (index === 0) score += 1;
            return { content, score, index };
        });

        scoredChunks.sort((a, b) => b.score - a.score || a.index - b.index);
        return scoredChunks.slice(0, topK).map(sc => sc.content);
    }
};

// Expose to different environments (Background Worker vs Content Script)
if (typeof self !== 'undefined') {
    self.LuminaRAG = LuminaRAG;
}
if (typeof window !== 'undefined') {
    window.LuminaRAG = LuminaRAG;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LuminaRAG;
}

