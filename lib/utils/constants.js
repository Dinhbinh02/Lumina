/**
 * Lumina - Shared Constants
 * Centralized configuration for all scripts
 */

// Default settings
var LUMINA_DEFAULTS = {
    provider: 'groq',
    groqModel: 'llama3-8b-8192',
    geminiModel: 'gemini-2.5-flash-lite',
    openrouterModel: 'openai/gpt-4o-mini',
    responseLanguage: 'vi',
    disabledDomains: [],
    maxContextTokens: null,
    readWebpage: true,
    reasoningMode: false
};

if (typeof self.LUMINA_CONSTANTS_INITIALIZED === 'undefined') {
    self.LUMINA_CONSTANTS_INITIALIZED = true;

    var LUMINA_PROVIDERS = {
    groq: {
        link: 'https://console.groq.com/keys',
        modelsUrl: 'https://api.groq.com/openai/v1/models',
        defaultModel: 'llama3-8b-8192'
    },
    gemini: {
        link: 'https://aistudio.google.com/app/apikey',
        modelsUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
        defaultModel: 'gemini-2.0-flash-exp'
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


// Default shortcuts configuration
var LUMINA_DEFAULT_SHORTCUTS = {
    'luminaChat': { key: 'Space', modifiers: ['Alt'] },
    'askLumina': { key: 'L', modifiers: ['Alt'] },
    'audio': { key: 'Shift', modifiers: [] },
    'translate': { key: 'T', modifiers: ['Alt'] },
    'annotationShortcuts': [
        { key: 'h', code: 'KeyH', color: '#FFFB78' }
    ]
};

/**
 * Escapes HTML special characters to prevent XSS.
 * @param {string} str - The string to escape
 * @returns {string} - Escaped string
 */
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
if (typeof self !== 'undefined') {
    // Both content script and background worker context
    self.LUMINA_DEFAULTS = LUMINA_DEFAULTS;

    self.LUMINA_PROVIDERS = LUMINA_PROVIDERS;
    self.LUMINA_DEFAULT_SHORTCUTS = LUMINA_DEFAULT_SHORTCUTS;
    self.escapeHtml = escapeHtml;
    self.getTodayString = getTodayString;
    self.getKeysArray = getKeysArray;
}
}
