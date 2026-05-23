
const LuminaToken = {
    
    count: function(text) {
        if (!text) return 0;
        try {
            
            if (typeof GPTTokenizer_cl100k_base !== 'undefined') {
                return GPTTokenizer_cl100k_base.encode(text).length;
            }
            
            return Math.ceil(text.length / 2.5);
        } catch (e) {
            console.warn('[Lumina Token] Counting failed:', e);
            return Math.ceil(text.length / 2.5);
        }
    },

    
    truncate: function(text, maxTokens) {
        if (!text || maxTokens <= 0) return '';
        try {
            if (typeof GPTTokenizer_cl100k_base !== 'undefined') {
                const tokens = GPTTokenizer_cl100k_base.encode(text);
                if (tokens.length <= maxTokens) return text;
                return GPTTokenizer_cl100k_base.decode(tokens.slice(0, maxTokens));
            }
            
            return text.substring(0, Math.floor(maxTokens * 2.5));
        } catch (e) {
            console.warn('[Lumina Token] Truncation failed:', e);
            return text.substring(0, Math.floor(maxTokens * 2.5));
        }
    }
};


if (typeof self !== 'undefined') {
    self.LuminaToken = LuminaToken;
}
