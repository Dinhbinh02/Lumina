export const NexusToken = {
    count: function(text) {
        if (!text) return 0;
        return Math.ceil(text.length / 2.5);
    },
    truncate: function(text, maxTokens) {
        if (!text || maxTokens <= 0) return '';
        return text.substring(0, Math.floor(maxTokens * 2.5));
    }
};

if (typeof globalThis !== 'undefined') {
    globalThis.NexusToken = NexusToken;
}
