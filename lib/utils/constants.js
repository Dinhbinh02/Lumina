/**
 * Lumina - Shared Constants
 * Centralized configuration for all scripts
 */

// Default settings
var LUMINA_DEFAULTS = {
    provider: 'groq',
    groqModel: 'llama3-8b-8192',
    geminiModel: 'gemini-1.5-flash',
    openrouterModel: 'openai/gpt-4o-mini',
    responseLanguage: 'vi',
    disabledDomains: [],
    memoryThreshold: 50,
    compactionSize: 30,
    maxContextTokens: 4000,
    customSources: [
        { id: 'wikipedia', name: 'Wikipedia', url: 'https://vi.wikipedia.org/wiki/{{str}}', css: '' },
        { id: 'oxford', name: 'Oxford Dictionary', url: 'https://www.oxfordlearnersdictionaries.com/definition/english/{{str}}', css: '' },
        { id: 'cambridge', name: 'Cambridge Dictionary', url: 'https://dictionary.cambridge.org/dictionary/english/{{str}}', css: '' }
    ]
};



// Provider configurations (for Options page)
const LUMINA_PROVIDERS = {
    groq: {
        link: 'https://console.groq.com/keys',
        modelsUrl: 'https://api.groq.com/openai/v1/models',
        defaultModel: 'llama3-8b-8192'
    },
    gemini: {
        link: 'https://aistudio.google.com/app/apikey',
        modelsUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
        defaultModel: 'gemini-1.5-flash'
    },
    openrouter: {
        link: 'https://openrouter.ai/keys',
        modelsUrl: 'https://openrouter.ai/api/v1/models',
        defaultModel: 'openai/gpt-4o-mini'
    },
    cerebras: {
        link: 'https://cloud.cerebras.ai/platform',
        modelsUrl: 'https://api.cerebras.ai/v1/models',
        defaultModel: 'llama3.1-8b'
    },
    mistral: {
        link: 'https://console.mistral.ai/api-keys',
        modelsUrl: 'https://api.mistral.ai/v1/models',
        defaultModel: 'mistral-small-latest'
    }
};

// Grounding models for Gemini rotation
const LUMINA_GROUNDING_MODELS = ['gemini-flash-latest', 'gemini-flash-lite-latest'];

// Default shortcuts configuration
var LUMINA_DEFAULT_SHORTCUTS = {
    translate: { code: 'KeyT', key: 't', display: 'T' },
    chat: { code: 'KeyG', key: 'g', display: 'G' },
    image: { code: 'KeyI', key: 'i', display: 'I' },
    proofread: { code: 'KeyC', key: 'c', display: 'C' },
    luminaChat: { code: 'Backquote', key: '`', display: '`' },
    audio: { code: 'ShiftLeft', key: 'Shift', display: 'Shift', shiftKey: true },
    resetChat: { code: 'Mouse0', key: 'Mouse0', display: 'Left', metaKey: true, shiftKey: true },
    history: { code: 'KeyH', key: 'h', display: 'H', ctrlKey: true },
    regenerate: { code: 'KeyR', key: 'r', display: 'R' }
};

// Utility: Escape HTML to prevent XSS
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Utility: Get today's date string (YYYY-MM-DD)
function getTodayString() {
    const now = new Date();
    return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

// Utility: Parse comma-separated keys into array
function getKeysArray(keyStr) {
    if (!keyStr) return [];
    return keyStr.split(',').map(k => k.trim()).filter(k => k.length > 0);
}

// Export for different contexts
if (typeof window !== 'undefined') {
    // Content script context
    window.LUMINA_DEFAULTS = LUMINA_DEFAULTS;

    window.LUMINA_PROVIDERS = LUMINA_PROVIDERS;
    window.LUMINA_GROUNDING_MODELS = LUMINA_GROUNDING_MODELS;
    window.LUMINA_DEFAULT_SHORTCUTS = LUMINA_DEFAULT_SHORTCUTS;
    window.escapeHtml = escapeHtml;
    window.getTodayString = getTodayString;
    window.getKeysArray = getKeysArray;
}
