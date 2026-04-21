/**
 * Lumina Token Utilities
 * Provides accurate token counting and truncation using GPTTokenizer.
 */
const LuminaToken = {
    /**
     * Estimates or accurately counts tokens in a string.
     * @param {string} text - The text to count tokens for.
     * @returns {number} - Token count.
     */
    count: function(text) {
        if (!text) return 0;
        try {
            // GPTTokenizer_cl100k_base is the global exposed by gpt-tokenizer.js
            if (typeof GPTTokenizer_cl100k_base !== 'undefined') {
                return GPTTokenizer_cl100k_base.encode(text).length;
            }
            // Fallback if library not loaded
            return Math.ceil(text.length / 4);
        } catch (e) {
            console.warn('[Lumina Token] Counting failed:', e);
            return Math.ceil(text.length / 4);
        }
    },

    /**
     * Truncates text to a maximum number of tokens.
     * @param {string} text - The text to truncate.
     * @param {number} maxTokens - Max tokens allowed.
     * @returns {string} - Truncated text.
     */
    truncate: function(text, maxTokens) {
        if (!text || maxTokens <= 0) return '';
        try {
            if (typeof GPTTokenizer_cl100k_base !== 'undefined') {
                const tokens = GPTTokenizer_cl100k_base.encode(text);
                if (tokens.length <= maxTokens) return text;
                return GPTTokenizer_cl100k_base.decode(tokens.slice(0, maxTokens));
            }
            // Simple character-based fallback
            return text.substring(0, maxTokens * 4);
        } catch (e) {
            console.warn('[Lumina Token] Truncation failed:', e);
            return text.substring(0, maxTokens * 4);
        }
    }
};

// Also expose to global if in background script context
if (typeof self !== 'undefined') {
    self.LuminaToken = LuminaToken;
}
