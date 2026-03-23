
importScripts('../lib/marked.min.js');
importScripts('../lib/utils/constants.js');
importScripts('../lib/utils/memory.js');
importScripts('../lib/utils/auth.js');
importScripts('./youtube.js');

// Default settings
const DEFAULTS = LUMINA_DEFAULTS;

// Pending iframe injections: key = `${tabId}_${normalizedUrl}`
const pendingInjections = new Map();  // key: `${tabId}_${url}` → injection data
const tabInjectionKeys = new Map();   // key: tabId → Set of pendingInjections keys

// Clean up all injection data when a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
    const keys = tabInjectionKeys.get(tabId);
    if (keys) {
        for (const k of keys) pendingInjections.delete(k);
        tabInjectionKeys.delete(tabId);
    }
    // Clean up per-tab session tracking
    chrome.storage.local.get(['lumina_tab_sessions'], result => {
        const tabSessions = result.lumina_tab_sessions || {};
        if (tabSessions[tabId]) {
            delete tabSessions[tabId];
            chrome.storage.local.set({ lumina_tab_sessions: tabSessions });
        }
    });
});

// Listen for frame navigation and inject early (document_start equivalent)
chrome.webNavigation.onCommitted.addListener((details) => {
    if (details.frameId === 0) return; // Skip main frame, only subframes (iframes)
    const key = `${details.tabId}_${details.url}`;
    const injection = pendingInjections.get(key);
    if (!injection) return;
    // Do NOT delete — keep for subsequent frame reloads (same tab + url)

    const target = { tabId: details.tabId, frameIds: [details.frameId] };

    // Inject everything via a single executeScript with injectImmediately:true
    // (insertCSS does NOT support injectImmediately, so it runs at document_idle — too late)
    const hasCss = !!injection.css;
    const hasZoom = injection.zoom && injection.zoom !== 100;
    const hasSel = !!injection.selector;
    if (hasCss || hasZoom || hasSel) {
        chrome.scripting.executeScript({
            target,
            injectImmediately: true,
            func: (cssForced, zoom, selector) => {
                // ---- CSS: inject <style> tag + enforce via inline styles with MutationObserver ----
                if (cssForced) {
                    // Step 1: inject <style> tag as early as possible
                    const injectStyleTag = () => {
                        let existing = document.getElementById('__lumina_css__');
                        if (!existing) {
                            existing = document.createElement('style');
                            existing.id = '__lumina_css__';
                            (document.head || document.documentElement).appendChild(existing);
                        }
                        existing.textContent = cssForced;
                    };
                    if (document.head) {
                        injectStyleTag();
                    } else {
                        document.addEventListener('DOMContentLoaded', injectStyleTag, { once: true });
                    }

                    // Step 2: Parse CSS into rules [{selector, props: [{prop, val}]}]
                    // This lets us enforce rules as inline styles — inline !important beats everything
                    const parseRules = (css) => {
                        const rules = [];
                        // Remove comments
                        const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
                        const ruleRegex = /([^{]+)\{([^}]+)\}/g;
                        let m;
                        while ((m = ruleRegex.exec(clean)) !== null) {
                            const sel = m[1].trim();
                            const body = m[2];
                            const props = [];
                            const declRegex = /([\w-]+)\s*:\s*([^;]+?)(?:\s*!important)?\s*(?:;|$)/g;
                            let d;
                            while ((d = declRegex.exec(body)) !== null) {
                                props.push({ prop: d[1].trim(), val: d[2].trim() });
                            }
                            if (sel && props.length) rules.push({ sel, props });
                        }
                        return rules;
                    };

                    const rules = parseRules(cssForced);

                    // Apply inline !important styles to all elements matching each rule
                    const enforceRules = (root) => {
                        const doc = root || document;
                        for (const rule of rules) {
                            let elements;
                            try { elements = doc.querySelectorAll(rule.sel); } catch (e) { continue; }
                            for (const el of elements) {
                                for (const { prop, val } of rule.props) {
                                    el.style.setProperty(prop, val, 'important');
                                }
                            }
                        }
                    };

                    // Run immediately if DOM already available
                    if (document.readyState !== 'loading') {
                        enforceRules();
                    }

                    // rAF polling: enforce on every animation frame for 8 seconds after load.
                    // This beats any page JS that sets padding/styles via setTimeout/rAF itself,
                    // because we always run AFTER them and overwrite with inline !important.
                    const pollStart = Date.now();
                    const pollDuration = 8000;
                    const poll = () => {
                        enforceRules();
                        if (Date.now() - pollStart < pollDuration) {
                            requestAnimationFrame(poll);
                        }
                    };
                    // Start polling after DOMContentLoaded so elements exist
                    if (document.readyState === 'loading') {
                        document.addEventListener('DOMContentLoaded', () => requestAnimationFrame(poll), { once: true });
                    } else {
                        requestAnimationFrame(poll);
                    }

                    // MutationObserver: still watch for dynamic changes after the 8s window
                    const mo = new MutationObserver((mutations) => {
                        let needsEnforce = false;
                        for (const mut of mutations) {
                            if (mut.type === 'childList' && mut.addedNodes.length) { needsEnforce = true; break; }
                            if (mut.type === 'attributes' && (mut.attributeName === 'class' || mut.attributeName === 'style')) { needsEnforce = true; break; }
                        }
                        if (needsEnforce) enforceRules();
                    });
                    const startObserver = () => {
                        mo.observe(document.documentElement, {
                            childList: true, subtree: true,
                            attributes: true, attributeFilter: ['class', 'style']
                        });
                    };
                    if (document.documentElement) {
                        startObserver();
                    } else {
                        document.addEventListener('DOMContentLoaded', startObserver, { once: true });
                    }
                }

                // ---- Zoom (inline style, beats any stylesheet) ----
                if (zoom && zoom !== 100) {
                    document.documentElement.style.setProperty('zoom', String(zoom / 100), 'important');
                }

                // ---- Selector isolation — needs DOM to query ----
                if (selector) {
                    const run = () => {
                        const el = document.querySelector(selector);
                        if (!el) return;
                        let style = document.getElementById('__lumina_selector_iso__');
                        if (!style) {
                            style = document.createElement('style');
                            style.id = '__lumina_selector_iso__';
                            (document.head || document.documentElement).appendChild(style);
                        }
                        style.textContent = 'html,body{margin:0!important;padding:0!important;overflow:auto!important;background:#fff!important}body>*{display:none!important}';
                        let node = el;
                        while (node && node !== document.body) {
                            node.style.setProperty('display', 'block', 'important');
                            node = node.parentElement;
                        }
                    };
                    if (document.readyState === 'loading') {
                        document.addEventListener('DOMContentLoaded', run, { once: true });
                    } else {
                        run();
                    }
                }
            },
            args: [injection.cssForced || '', injection.zoom || 100, injection.selector || '']
        }).catch(() => {});
    }
});

// Register content scripts for all sites
async function checkAndRegisterScripts() {
    try {
        const scriptId = 'lumina-all-sites';

        let scripts = [];
        try {
            scripts = await chrome.scripting.getRegisteredContentScripts();
        } catch (e) {
            console.warn('[Lumina] Could not check registered scripts:', e);
        }

        const alreadyRegistered = scripts.some(s => s.id === scriptId);

        if (!alreadyRegistered) {
            await chrome.scripting.registerContentScripts([{
                id: scriptId,
                matches: ['<all_urls>'],
                js: [
                    "lib/katex/katex.min.js",
                    "lib/katex/auto-render.min.js",
                    "lib/marked.min.js",
                    "lib/highlight.min.js",
                    "lib/utils/constants.js",
                    "lib/utils/chat_ui.js",
                    "lib/utils/chat_history.js",
                    "scripts/content.js"
                ],
                runAt: 'document_idle',
                persistAcrossSessions: true
            }]);
        }
    } catch (err) {
    }
}

checkAndRegisterScripts();

// Model usage tracking
async function incrementModelUsage(modelId) {
    if (!modelId) return;

    try {
        const today = new Date().toISOString().split('T')[0];
        const data = await chrome.storage.local.get(['dailyModelStats']);

        let stats = data.dailyModelStats || { date: today, counts: {} };

        if (stats.date !== today) {
            stats.date = today;
            stats.counts = {};
        }

        if (!stats.counts[modelId]) {
            stats.counts[modelId] = 0;
        }

        stats.counts[modelId]++;

        await chrome.storage.local.set({
            dailyModelStats: stats,
            lastUsedModelId: modelId
        });
    } catch (e) {
        console.error('Error incrementing usage:', e);
    }
}

// Get Gemini API key
async function getGeminiApiKey() {
    const data = await chrome.storage.local.get(['providers']);
    const providers = data.providers || [];
    const geminiProvider = providers.find(p => p.type === 'gemini' && p.apiKey);
    if (geminiProvider && geminiProvider.apiKey) {
        const keys = geminiProvider.apiKey.split(',').map(k => k.trim()).filter(k => k);
        return keys[0] || null;
    }
    return null;
}

// Model Chain Management
async function getModelChain() {
    const data = await chrome.storage.local.get(['modelChains', 'providers', 'provider', 'model', 'lastUsedModel']);

    // 1. Build the full list from modelChains (no ordering dependency)
    let chain = [];
    if (data.modelChains && data.modelChains['text'] && data.modelChains['text'].length > 0) {
        chain = [...data.modelChains['text']];
    } else {
        // Legacy fallback
        chain = [{ providerId: data.provider, model: data.model }];
    }

    // 2. If the user has a lastUsedModel preference, move that entry to the front
    if (data.lastUsedModel && data.lastUsedModel.model) {
        const { providerId: lastPId, model: lastModel } = data.lastUsedModel;
        const idx = chain.findIndex(item => item.providerId === lastPId && item.model === lastModel);
        if (idx > 0) {
            // Move preferred model to front (no mutation of the stored array)
            const preferred = chain.splice(idx, 1)[0];
            chain.unshift(preferred);
        } else if (idx === -1 && lastPId && lastModel) {
            // lastUsedModel is not in the chain list – still use it as the first option
            chain.unshift({ providerId: lastPId, model: lastModel });
        }
    }

    // 3. Hydrate chain with provider details (API Keys, Endpoints)
    const hydratedChain = chain.map(config => {
        const provider = data.providers?.find(p => p.id === config.providerId);
        if (!provider) return null;
        return {
            ...config,
            providerType: provider.type,
            apiKey: provider.apiKey,
            endpoint: provider.endpoint,
            defaultModel: provider.defaultModel
        };
    }).filter(item => item !== null);

    return hydratedChain;
}

// API Key Management (Rotation)
function getKeysArray(keyStr) {
    if (!keyStr) return [];
    return keyStr.split(',').map(k => k.trim()).filter(k => k.length > 0);
}

// Helper to get today's date string (YYYY-MM-DD) for rotation reset
function getTodayString() {
    const now = new Date();
    return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

// Helper to manage exhausted keys (Rate Limited 429)
async function getExhaustedState(groupKey) {
    const today = getTodayString();
    const storageKey = `exhausted_${groupKey}`;
    try {
        const data = await chrome.storage.local.get([storageKey]);
        const state = data[storageKey];
        if (state && state.date === today) {
            return state.indices || [];
        }
    } catch (e) {}
    return [];
}

async function markKeyExhausted(groupKey, index) {
    const today = getTodayString();
    const storageKey = `exhausted_${groupKey}`;
    const indices = await getExhaustedState(groupKey);
    if (!indices.includes(index)) {
        indices.push(index);
        await chrome.storage.local.set({
            [storageKey]: { date: today, indices: indices }
        });
        console.warn(`[Lumina] Globally marked key ${index} as PERMANENTLY exhausted for today (${groupKey})`);
    }
}

async function fetchWithRotation(keys, requestFn, options = {}) {
    if (!keys || keys.length === 0) {
        return requestFn('');
    }

    // Determine the group key for index persistence
    const groupKey = 'rot_' + keys.join(',').substring(0, 32).replace(/[^a-zA-Z0-9]/g, '');
    const today = getTodayString();

    // 1. If a specific key index is requested, use ONLY that key (legacy support)
    if (typeof options.keyIndex === 'number' && options.keyIndex >= 0 && options.keyIndex < keys.length) {
        return await requestFn(keys[options.keyIndex]);
    }

    // 2. Load persisted active index
    let activeIndex = 0;
    try {
        const data = await chrome.storage.local.get([groupKey]);
        const state = data[groupKey];
        if (state && state.date === today) activeIndex = state.index;
    } catch (e) {}

    // 3. Try rotating through the keys
    for (let attempts = 0; attempts < keys.length; attempts++) {
        const currentIndex = (activeIndex + attempts) % keys.length;
        const currentKey = keys[currentIndex];

        try {
            const response = await requestFn(currentKey);

            // If success (or not rate-limited), save this as the last successful index and return
            if (response.status !== 429) {
                chrome.storage.local.set({
                    [groupKey]: { index: currentIndex, date: today }
                });
                return response;
            } else {
                console.warn(`[Lumina] Key ${currentIndex} hit rate limit (429). Rotating to next key.`);
                // Continue loop to try next key
            }
        } catch (err) {
            console.error(`[Lumina] Request failed with key ${currentIndex}:`, err);
            // Continue loop to try next key
        }
    }

    throw new Error("All API keys failed or were rate limited in this cycle.");
}

// Grounding models - use shared constant
const GROUNDING_MODELS = LUMINA_GROUNDING_MODELS;

// --- Gemini Grounding with Model + Key Rotation ---
async function fetchGroundingWithRotation(keys, requestFn) {
    if (!keys || keys.length === 0) throw new Error("No Gemini Grounding API Keys provided.");

    const groupKey = 'ground_rot_' + keys.join(',').substring(0, 32).replace(/[^a-zA-Z0-9]/g, '');
    const stateKey = 'grounding_rotation_state';
    const today = getTodayString();

    const exhaustedIndices = await getExhaustedState(groupKey);

    // Load persisted state
    let state = { keyIndex: 0, modelIndex: 0, date: today };
    try {
        const data = await chrome.storage.local.get([stateKey]);
        if (data[stateKey] && data[stateKey].date === today) state = data[stateKey];
    } catch (e) {}

    const totalKeys = keys.length;
    const totalModels = GROUNDING_MODELS.length;
    const maxAttempts = totalKeys * totalModels;

    let { keyIndex, modelIndex } = state;

    for (let attempts = 0; attempts < maxAttempts; attempts++) {
        const currentKeyIndex = (keyIndex + Math.floor(attempts / totalModels)) % totalKeys;
        const currentModelIndex = (modelIndex + (attempts % totalModels)) % totalModels;

        if (exhaustedIndices.includes(currentKeyIndex)) continue;

        const currentKey = keys[currentKeyIndex];
        const currentModel = GROUNDING_MODELS[currentModelIndex];

        try {
            const response = await requestFn(currentKey, currentModel);

            if (response.status === 429) {
                console.warn(`[Lumina Grounding] Rate limited on key index ${currentKeyIndex}`);
                await markKeyExhausted(groupKey, currentKeyIndex);
                continue;
            }

            chrome.storage.local.set({
                [stateKey]: { keyIndex: currentKeyIndex, modelIndex: currentModelIndex, date: today }
            });

            return { response, model: currentModel };
        } catch (err) {
            console.error(`[Lumina Grounding] Request failed:`, err);
        }
    }

    throw new Error("All Gemini Grounding keys exhausted or rate limited.");
}

// --- Helper Functions for Provider Settings ---
function getApiKeyForProvider(provider, keys) {
    switch (provider) {
        case 'groq': return keys.groqApiKey;
        case 'gemini': return keys.geminiApiKey;
        case 'openrouter': return keys.openrouterApiKey;
        default: return keys.groqApiKey;
    }
}

function getModelForProvider(provider, models) {
    switch (provider) {
        case 'groq': return models.groqModel || DEFAULTS.groqModel;
        case 'gemini': return models.geminiModel || DEFAULTS.geminiModel;
        case 'openrouter': return models.openrouterModel || DEFAULTS.openrouterModel;
        default: return models.groqModel || DEFAULTS.groqModel;
    }
}

function getDefaultModel(provider) {
    switch (provider) {
        case 'groq': return DEFAULTS.groqModel;
        case 'gemini': return DEFAULTS.geminiModel;
        case 'openrouter': return DEFAULTS.openrouterModel;
        default: return DEFAULTS.groqModel;
    }
}

function getDefaultVisionModel(provider) {
    switch (provider) {
        case 'groq': return 'llama-3.2-11b-vision-preview';
        case 'gemini': return 'gemini-flash-latest';
        case 'openrouter': return 'openai/gpt-4o';
        default: return 'gemini-flash-latest';
    }
}

async function setStatus(tabId, text, type = 'loading') {
    try {
        await chrome.tabs.sendMessage(tabId, {
            action: 'update_status',
            text: text,
            type: type
        });
    } catch (e) {
        // Tab might be closed
    }
}

// Cache System (Dictionary, Translation, Audio)
const CACHE_EXPIRATION_MS = 14 * 24 * 60 * 60 * 1000;

async function getLuminaCache(cacheKey) {
    try {
        const data = await chrome.storage.local.get([cacheKey]);
        const cache = data[cacheKey] || { entries: {} };

        const now = Date.now();
        let changed = false;
        const entryKeys = Object.keys(cache.entries);

        for (const key of entryKeys) {
            const entry = cache.entries[key];
            const entryTimestamp = entry.timestamp || 0;
            if (entryTimestamp && (now - entryTimestamp > CACHE_EXPIRATION_MS)) {
                delete cache.entries[key];
                changed = true;
            }
        }

        if (changed) {
            await chrome.storage.local.set({ [cacheKey]: cache });
        }

        return cache;
    } catch (e) {
        console.error(`[Lumina] Error reading cache ${cacheKey}:`, e);
        return { entries: {} };
    }
}

async function setLuminaCache(cacheKey, entries, maxEntries = 500) {
    try {
        const entryKeys = Object.keys(entries);
        if (entryKeys.length > maxEntries) {
            const sorted = Object.entries(entries)
                .sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0))
                .slice(0, maxEntries);
            entries = Object.fromEntries(sorted);
        }

        await chrome.storage.local.set({
            [cacheKey]: { entries, lastUpdate: Date.now() }
        });
    } catch (e) {
        console.error(`[Lumina] Error writing cache ${cacheKey}:`, e);
    }
}

// Audio Cache Logic
const AUDIO_CACHE_KEY = 'audio_cache';
const AUDIO_CACHE_MAX_ENTRIES = 200;

async function getAudioFromCache(text) {
    try {
        const cache = await getLuminaCache(AUDIO_CACHE_KEY);
        const key = text.trim().toLowerCase();
        const entry = cache.entries[key];

        if (entry && entry.data) {
            return entry;
        }
        return null;
    } catch (e) {
        console.error('[Lumina Audio] Cache read error:', e);
        return null;
    }
}

async function setAudioCache(text, type, data) {
    try {
        const cache = await getLuminaCache(AUDIO_CACHE_KEY);
        const key = text.trim().toLowerCase();

        cache.entries[key] = {
            type,
            data,
            timestamp: Date.now()
        };

        await setLuminaCache(AUDIO_CACHE_KEY, cache.entries, AUDIO_CACHE_MAX_ENTRIES);
    } catch (e) {
        console.error('[Lumina Audio] Cache write error:', e);
    }
}




// --- Page Content Fetcher ---
async function fetchPageContent(url) {
    try {
        // Fetching content from: url
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const html = await response.text();

        // Basic text extraction (strip HTML tags)
        let text = html
            .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gmi, "")
            .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gmi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim();

        // Limit context length
        const maxLength = 3000;
        if (text.length > maxLength) {
            text = text.substring(0, maxLength) + "... (truncated)";
        }

        return text;
    } catch (error) {
        console.error(`[Lumina] Error fetching page content: ${error.message}`);
        throw error;
    }
}

// --- Chat Request Executor (Single Model) ---
async function executeChatRequest(config, messages, initialContext, question, port, imageData = null, isSpotlight = false, globalSettings = {}, requestOptions = {}, action = 'chat_stream') {
    const { model, providerType: currentProvider, endpoint, apiKey, defaultModel } = config;

    // Per-model params from global settings
    const advancedParamsByModel = globalSettings.advancedParamsByModel || {};

    // Try composite key first (provider:model), then legacy (model)
    const providerId = config.providerId;
    const compositeKey = providerId ? `${providerId}:${model}` : model;

    const modelParams = advancedParamsByModel[compositeKey] || advancedParamsByModel[model] || {};
    const temperature = modelParams.temperature ?? 1.0;
    const topP = modelParams.topP ?? 1.0;
    const customParams = modelParams.customParams || {};
    const responseLanguage = globalSettings.responseLanguage;

    // Parse custom params - handle both object and string format (for backwards compatibility)
    let parsedCustomParams = {};
    if (customParams) {
        if (typeof customParams === 'object') {
            parsedCustomParams = customParams;
        } else if (typeof customParams === 'string') {
            try { parsedCustomParams = JSON.parse(customParams); } catch (e) { }
        }
    }

    const hasFiles = imageData && (Array.isArray(imageData) && imageData.length > 0);

    // --- TRACK USAGE ---
    if (model) {
        incrementModelUsage(model);
    }
    // -------------------
    if (!apiKey && !endpoint.includes('localhost') && !endpoint.includes('127.0.0.1')) {
        throw new Error(`No API Key for provider type: ${currentProvider}`);
    }

    const keys = getKeysArray(apiKey);

    let systemInstruction = `You are Lumina, a helpful and intelligent AI assistant.`;

    if (action === 'proofread') {
        systemInstruction = `You are a text correction tool, not a conversational AI.
Your ONLY job is to output the corrected/translated version of the INPUT TEXT.
NEVER answer, respond to, or engage with the content of the text.
NEVER say who you are or what you can do.
If the input is a question like "What is your name?", output ONLY the corrected English question — do NOT answer it.
Rules:
- Output ONLY the corrected English text. No explanations, no comments.
- Translate to English if input is NOT English.
- Keep original structure and meaning.
- Match original capitalization (lower -> lower, Upper -> Upper).
- Match original punctuation (no dot -> no dot).`;
    }

    // --- Inject User Memory Facts for Personalization ---
    try {
        const userMemoryAddition = await UserMemory.getSystemPromptAddition();
        if (userMemoryAddition) {
            systemInstruction += userMemoryAddition;
        }
    } catch (e) {
        console.error('[Lumina] Failed to load user memory:', e);
    }


    let fullMessages = [...messages];

    // Inject Page Context if available (as the first User message)
    if (initialContext && initialContext.trim().length > 0) {
        // Ensure context is static and early
        fullMessages.unshift({
            role: 'user',
            text: `[Context from current page]:\n${initialContext}\n\n[Instruction]: Use the above context to answer my questions.`
        });

        // Add a model acknowledgement to keep chat structure balanced (User -> Model -> User)
        fullMessages.splice(1, 0, {
            role: 'model',
            text: "Understood. I will use the provided context to answer your questions."
        });
    }

    // Only inject Time & Location for questions that might need real-time data
    let augmentedQuestion = question;

    // For proofread: wrap text explicitly so the model treats it as text-to-correct,
    // not as a question to answer.
    if (action === 'proofread') {
        augmentedQuestion = `Correct/translate this text:\n<text>${question}</text>`;
    } else if (currentProvider === 'gemini' && !hasFiles) {
        // Keywords that suggest real-time info might be needed
        const realTimeKeywords = /\b(mấy giờ|thời gian|ngày|hôm nay|bây giờ|thời tiết|weather|time|today|now|date|news|tin tức|giá|price|stock|forecast|dự báo|lịch|schedule|current|hiện tại)\b/i;

        // Only add time/location if:
        const needsRealTimeContext = realTimeKeywords.test(question) ||
            (messages.length === 0 && question.length > 50);

        if (needsRealTimeContext) {
            const now = new Date();
            const timeString = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
            const dateString = now.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });

            // Use a clearer format that indicates this is reference metadata
            augmentedQuestion = `[Reference - Current Time: ${timeString}, ${dateString}]\n\nUser Question: ${question}`;
        }
    }

    // Helper to process attachments
    const processAttachments = (attachments) => {
        const parts = [];
        if (!attachments || !Array.isArray(attachments)) return parts;
        for (const item of attachments) {
            if (typeof item === 'string') {
                const matches = item.match(/^data:(.+);base64,(.+)$/);
                if (matches) parts.push({ inline_data: { mime_type: matches[1], data: matches[2] } });
            } else if (typeof item === 'object' && item.mimeType && item.data) {
                parts.push({ inline_data: { mime_type: item.mimeType, data: item.data } });
            }
        }
        return parts;
    };

    // Helper to process attachments for Groq (OpenAI Vision format)
    const processAttachmentsForGroq = (attachments) => {
        const parts = [];
        if (!attachments || !Array.isArray(attachments)) return parts;
        for (const item of attachments) {
            let url = '';
            if (typeof item === 'string') url = item;
            else if (typeof item === 'object' && item.mimeType && item.data) {
                url = `data:${item.mimeType};base64,${item.data}`;
            }
            if (url) {
                parts.push({ type: "image_url", image_url: { url: url } });
            }
        }
        return parts;
    };

    // Build API input based on provider
    const buildApiPayload = async (msgs, currentQ, sysPrompt, activeKey) => {
        if (currentProvider === 'gemini') {
            const contents = [];
            for (const msg of msgs) {
                const parts = [];
                const attachments = msg.files || msg.images;
                parts.push(...processAttachments(attachments));
                if (msg.text) parts.push({ text: msg.text });
                if (parts.length > 0) {
                    contents.push({ role: msg.role === 'model' ? 'model' : 'user', parts: parts });
                }
            }
            const currentParts = [];
            if (imageData && imageData.length > 0) {
                const currentAttachments = Array.isArray(imageData) ? imageData : [imageData];
                currentParts.push(...processAttachments(currentAttachments));
            }
            currentParts.push({ text: currentQ });
            contents.push({ role: 'user', parts: currentParts });

            const generationConfig = {
                temperature: temperature,
                topP: topP
            };

            // Merge any custom params into generationConfig (supports thinkingConfig, maxOutputTokens, etc.)
            if (Object.keys(parsedCustomParams).length > 0) {
                Object.assign(generationConfig, parsedCustomParams);
            }

            const geminiBody = {
                system_instruction: { parts: [{ text: sysPrompt }] },
                contents: contents,
                generationConfig: generationConfig
            };
            // Inject Google Search Tool for Gemini 1-step (only if no files)
            let geminiUrl = endpoint;
            if (endpoint.includes('/models') && !endpoint.includes(':')) {
                geminiUrl = `${endpoint.replace(/\/models\/?$/, '')}/models/${model}:streamGenerateContent?key=${activeKey}`;
            } else {
                geminiUrl = `${endpoint}/${model}:streamGenerateContent?key=${activeKey}`;
            }

            return {
                url: geminiUrl,
                body: geminiBody
            };
        } else {
            // OpenAI-compatible API (Groq, OpenRouter, Local LLMs, etc.)
            const openaiMessages = [{ role: 'system', content: sysPrompt }];
            for (const msg of msgs) {
                const attachments = msg.files || msg.images;
                if (attachments && attachments.length > 0) {
                    const parts = [];
                    if (msg.text) parts.push({ type: "text", text: msg.text });
                    parts.push(...processAttachmentsForGroq(attachments));
                    openaiMessages.push({ role: msg.role === 'model' ? 'assistant' : 'user', content: parts });
                } else {
                    openaiMessages.push({ role: msg.role === 'model' ? 'assistant' : 'user', content: msg.text });
                }
            }

            // Add input question + images
            if (imageData && imageData.length > 0) {
                const parts = [];
                parts.push({ type: "text", text: currentQ });
                const currentAttachments = Array.isArray(imageData) ? imageData : [imageData];
                parts.push(...processAttachmentsForGroq(currentAttachments));
                openaiMessages.push({ role: 'user', content: parts });
            } else {
                openaiMessages.push({ role: 'user', content: currentQ });
            }

            // Use endpoint from provider config
            return {
                url: endpoint,
                body: { model: model, messages: openaiMessages, temperature, top_p: topP, stream: true, stream_options: { include_usage: true }, ...parsedCustomParams }
            };
        }
    };

    // --- FIRST CALL (Initial or Tool Check) ---

    let response = await fetchWithRotation(keys, async (key) => {
        const payload = await buildApiPayload(fullMessages, augmentedQuestion, systemInstruction, key);
        return fetch(payload.url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(currentProvider === 'openai' ? { 'Authorization': `Bearer ${key || 'proxypal-local'}` } : {})
            },
            body: JSON.stringify(payload.body)
        });
    }, requestOptions);

    if (!response.ok) {
        const errorData = await response.json();
        console.error('[Lumina] API Error:', errorData);
        throw new Error(errorData.error?.message || 'Failed to fetch from AI provider');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');

    let buffer = '';
    let fullToolResponse = ''; // Collect full response for tool detection

    // Universal reasoning field detection
    let isInReasoning = false;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });

        // --- Stream Parser Logic ---
        const textDeltas = [];

        if (currentProvider === 'gemini') {
            // Basic JSON parser for Gemini stream
            buffer += chunk;
            let depth = 0; let inStr = false; let isEsc = false; let start = -1; let lastEnd = 0;
            for (let i = 0; i < buffer.length; i++) {
                const char = buffer[i];
                if (char === '"' && !isEsc) inStr = !inStr;
                if (!inStr) {
                    if (char === '{') { if (depth === 0) start = i; depth++; }
                    else if (char === '}') {
                        depth--;
                        if (depth === 0 && start !== -1) {
                            const jsonStr = buffer.substring(start, i + 1);
                            try {
                                const json = JSON.parse(jsonStr);
                                const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
                                if (text) textDeltas.push(text);

                                // Extract Grounding Metadata (1-Step Flow)
                                if (json.candidates?.[0]?.groundingMetadata?.groundingChunks) {
                                    const chunks = json.candidates[0].groundingMetadata.groundingChunks;
                                    const sources = chunks.filter(c => c.web).map((c, idx) => ({
                                        num: idx + 1,
                                        title: c.web.title,
                                        link: c.web.uri,
                                        displayLink: new URL(c.web.uri).hostname
                                    }));
                                    if (sources.length > 0) {
                                        // Notify UI to show sources (without progress stepper for 1-step Gemini)
                                        port.postMessage({ action: 'web_search_status', status: 'completed', sources: sources, hideProgress: true });
                                    }
                                }
                            } catch (e) {
                                // Fallback: try to extract text with Regex if JSON parse fails
                                try {
                                    const textMatch = jsonStr.match(/"text"\s*:\s*"((?:[^"\\]|\\.)*)"/);
                                    if (textMatch && textMatch[1]) {
                                        const text = JSON.parse('"' + textMatch[1] + '"');
                                        if (text) textDeltas.push(text);
                                    }
                                } catch (err) {
                                    console.error('[Lumina] Gemini Parse Error:', e);
                                }
                            }
                            lastEnd = i + 1;
                            start = -1;
                        }
                    }
                }
                if (char === '\\' && !isEsc) isEsc = true; else isEsc = false;
            }
            buffer = buffer.substring(lastEnd);
        } else {
            // Groq or OpenRouter (both use OpenAI-compatible streaming)
            buffer += chunk;
            const lines = buffer.split('\n');
            buffer = lines.pop(); // Keep the last incomplete line in buffer

            for (const line of lines) {
                if (line.trim() === '' || line.includes('[DONE]')) continue;
                if (line.startsWith('data: ')) {
                    try {
                        const json = JSON.parse(line.substring(6));
                        const delta = json.choices?.[0]?.delta || {};
                        const content = delta.content;
                        // Universal reasoning detection: check reasoning, reasoning_content
                        const reasoning = delta.reasoning || delta.reasoning_content;

                        if (reasoning) {
                            // Start <think> tag if not already in reasoning mode
                            if (!isInReasoning) {
                                textDeltas.push('<think>');
                                isInReasoning = true;
                            }
                            textDeltas.push(reasoning);
                        }

                        if (content) {
                            // End </think> tag if transitioning from reasoning to content
                            if (isInReasoning) {
                                textDeltas.push('</think>');
                                isInReasoning = false;
                            }
                            textDeltas.push(content);
                        }
                    } catch (e) { }
                }
            }
        }

        // --- Collect all content for tool detection ---
        for (const text of textDeltas) {
            fullToolResponse += text;
            // Filter out tool call JSON before streaming to UI
            const filteredText = text.replace(/\{"tool"\s*:\s*"search_web"\s*,\s*"args"\s*:\s*\{[^}]+\}\s*\}/g, '');
            if (filteredText.length > 0) {
                port.postMessage({ action: 'chunk', chunk: filteredText });
            }
        }
    }

    // --- Stream Finished. Close reasoning tag if still open ---
    // This handles models that return only reasoning without content
    if (isInReasoning) {
        port.postMessage({ action: 'chunk', chunk: '</think>' });
        fullToolResponse += '</think>';
        isInReasoning = false;
    }

    // --- Stream Finished. Check for tool call anywhere in content ---
    const toolCallMatch = fullToolResponse.match(/\{"tool"\s*:\s*"search_web"\s*,\s*"args"\s*:\s*\{[^}]+\}\s*\}/);

    if (toolCallMatch) {
        try {
            const toolCall = JSON.parse(toolCallMatch[0]);

            if (toolCall && toolCall.tool === 'search_web' && toolCall.args && toolCall.args.query) {
                // 1. Notify UI - Start searching via Gemini Grounding
                port.postMessage({
                    action: 'web_search_status',
                    status: 'searching',
                    query: toolCall.args.query
                });

                // Find Gemini provider for grounding (search by type='gemini')
                const geminiProvider = providers.find(p => p.type === 'gemini' && p.apiKey);
                const groundingKeys = geminiProvider ? getKeysArray(geminiProvider.apiKey) : [];

                if (groundingKeys.length === 0) {
                    port.postMessage({ action: 'chunk', chunk: "> [System Error] Google Grounding requires a Gemini provider with API Key. Please add one in Options." });
                    return;
                }

                // 2. Call Gemini with Grounding Tool using model + key rotation
                const langPrompt = lang === 'en' ? "Answer in English." : "Answer in VIETNAMESE.";
                const groundMsg = {
                    role: 'user',
                    parts: [{ text: `Use Google Search to answer this query: "${toolCall.args.query}". \n\nOriginal Question: ${question}\n\n${langPrompt} Answer directly and concisely.` }]
                };

                const groundBody = {
                    contents: [groundMsg],
                    tools: [{ googleSearch: {} }]
                };

                try {
                    // Use new rotation function that rotates both models and keys
                    const { response: gResponse, model: groundingModel } = await fetchGroundingWithRotation(groundingKeys, async (key, modelName) => {
                        const groundUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:streamGenerateContent?key=${key}`;
                        return fetch(groundUrl, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(groundBody)
                        });
                    }, requestOptions);

                    if (!gResponse.ok) {
                        const errData = await gResponse.json();
                        console.error('[Lumina] Gemini Grounding Error:', errData);
                        throw new Error(errData.error?.message || `Gemini API Error: ${gResponse.status}`);
                    }

                    // 3. Stream Response & Parse Grounding Metadata
                    const reader2 = gResponse.body.getReader();
                    const decoder2 = new TextDecoder('utf-8');
                    let buffer2 = '';
                    let sourcesSent = false;

                    while (true) {
                        const { done: done2, value: value2 } = await reader2.read();
                        if (done2) break;
                        const chunk2 = decoder2.decode(value2, { stream: true });
                        buffer2 += chunk2;

                        let depth = 0; let inStr = false; let isEsc = false; let start = -1; let lastEnd = 0;
                        for (let i = 0; i < buffer2.length; i++) {
                            const char = buffer2[i];
                            if (char === '"' && !isEsc) inStr = !inStr;
                            if (!inStr) {
                                if (char === '{') { if (depth === 0) start = i; depth++; }
                                else if (char === '}') {
                                    depth--;
                                    if (depth === 0 && start !== -1) {
                                        // Found object
                                        const jsonStr = buffer2.substring(start, i + 1);
                                        try {
                                            const json = JSON.parse(jsonStr);

                                            // 1. Extract Text
                                            const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
                                            if (text) port.postMessage({ action: 'chunk', chunk: text });

                                            // 2. Extract Grounding Metadata (Sources)
                                            if (!sourcesSent && json.candidates?.[0]?.groundingMetadata?.groundingChunks) {
                                                const chunks = json.candidates[0].groundingMetadata.groundingChunks;
                                                const sources = chunks
                                                    .filter(c => c.web)
                                                    .map((c, idx) => ({
                                                        num: idx + 1,
                                                        title: c.web.title,
                                                        link: c.web.uri,
                                                        displayLink: new URL(c.web.uri).hostname
                                                    }));

                                                if (sources.length > 0) {
                                                    port.postMessage({
                                                        action: 'web_search_status',
                                                        status: 'analyzing',
                                                        sources: sources
                                                    });

                                                    // Send 'completed' shortly after or immediately
                                                    port.postMessage({
                                                        action: 'web_search_status',
                                                        status: 'completed',
                                                        sources: sources
                                                    });
                                                    sourcesSent = true;
                                                }
                                            }

                                            // 3. Store last usage (will track after stream ends)
                                        } catch (e) { }
                                        lastEnd = i + 1;
                                        start = -1;
                                    }
                                }
                            }
                            if (char === '\\' && !isEsc) isEsc = true; else isEsc = false;
                        }
                        buffer2 = buffer2.substring(lastEnd);
                    }
                } catch (err) {
                    port.postMessage({ action: 'web_search_status', status: 'error', error: err.message });
                    port.postMessage({ action: 'chunk', chunk: `\n> [Search Error]: ${err.message}` });
                }
            } else {
                // If not a valid search tool call, just dump raw (fallback)
                port.postMessage({ action: 'chunk', chunk: fullToolResponse });
            }
        } catch (e) {
            port.postMessage({ action: 'chunk', chunk: fullToolResponse });
        }
    }
}

// --- AI Helper for One-off Completions ---
// --- AI Helper for One-off Completions ---
async function generateOneOffCompletion(prompt, systemInstruction = "You are a helpful assistant.", modelConfig = null, requestOptions = {}) {
    let provider;
    
    if (modelConfig && modelConfig.providerId) {
        // Use specifically requested model/provider (for parallel generation)
        const data = await chrome.storage.local.get(['providers']);
        const found = data.providers?.find(p => p.id === modelConfig.providerId);
        if (!found) throw new Error("Provider not found: " + modelConfig.providerId);
        
        provider = {
            ...modelConfig,
            providerType: found.type,
            apiKey: found.apiKey,
            endpoint: found.endpoint
        };
    } else {
        // Default to active chain
        const chain = await getModelChain();
        provider = chain.length > 0 ? chain[0] : null;
    }

    if (!provider) throw new Error("No active AI provider configured.");

    const keys = getKeysArray(provider.apiKey);
    const modelToUse = provider.model;

    const response = await fetchWithRotation(keys, async (key) => {
        if (provider.providerType === 'gemini') {
            const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelToUse}:generateContent?key=${key}`;
            return fetch(geminiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: systemInstruction + "\n\n" + prompt }] }],
                    generationConfig: { temperature: 0.3 }
                })
            });
        } else {
            const endpoint = (provider.endpoint || 'https://api.groq.com/openai/v1/chat/completions').replace(/\/$/, "");
            return fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(key ? { 'Authorization': `Bearer ${key}` } : {})
                },
                body: JSON.stringify({
                    model: modelToUse,
                    messages: [
                        { role: 'system', content: systemInstruction },
                        { role: 'user', content: prompt }
                    ],
                    temperature: 0.3
                })
            });
        }
    }, requestOptions);

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`${provider.providerType} error (${response.status}): ${errText.substring(0, 100)}`);
    }
    const result = await response.json();
    return provider.providerType === 'gemini' 
        ? (result.candidates?.[0]?.content?.parts?.[0]?.text || '')
        : (result.choices?.[0]?.message?.content || '');
}

// --- Image Search Function ---
async function searchImages(query, apiKey, cx) {
    const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(query)}&searchType=image&num=4`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error?.message || `HTTP ${response.status}`);
        }

        const data = await response.json();
        return data.items?.map(item => ({
            link: item.link,
            title: item.title,
            thumbnail: item.image?.thumbnailLink || item.link,
            contextLink: item.image?.contextLink
        })) || [];
    } catch (error) {
        console.error('[Lumina] Image search error:', error);
        throw error;
    }
}


// --- Message Listener ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

    if (request.action === 'prepare_iframe_injection') {
        // Fix for extension pages (like Spotlight) where sender.tab might be undefined.
        // We attempt to get tabId from sender, or fall back to finding it.
        const processInjection = (tabId) => {
            if (!tabId || !request.frameUrl) return;
            // Force !important on every CSS declaration
            const forceImportant = (rawCss) => (rawCss || '').replace(
                /([a-zA-Z-]+)\s*:\s*([^;!}{][^;!}{]*?)(\s*!important)?\s*([;}])/g,
                (_, prop, val, _imp, end) => `${prop}: ${val.trim()} !important${end}`
            );
            const injKey = `${tabId}_${request.frameUrl}`;
            pendingInjections.set(injKey, {
                css: request.css || '',
                cssForced: forceImportant(request.css || ''),
                selector: request.selector || '',
                zoom: request.zoom || 100
            });
            // Track key under tabId so we can clean up when the tab is closed
            if (!tabInjectionKeys.has(tabId)) tabInjectionKeys.set(tabId, new Set());
            tabInjectionKeys.get(tabId).add(injKey);
        };

        const senderTabId = sender.tab && sender.tab.id;
        if (senderTabId) {
            processInjection(senderTabId);
        } else if (sender.url && sender.url.startsWith('chrome-extension://')) {
            // Search for the tab with this URL in all windows
            chrome.tabs.query({ url: sender.url }, (tabs) => {
                if (tabs && tabs.length > 0) {
                    processInjection(tabs[0].id);
                }
            });
        }
        return true; // Keep channel open
    }

    if (request.action === 'inject_iframe_css') {
        const tabId = sender.tab && sender.tab.id;
        if (tabId) injectIframeCss(tabId, request.css, request.frameUrl);
        else if (sender.url?.startsWith('chrome-extension://')) {
            chrome.tabs.query({ url: sender.url }, (tabs) => tabs?.[0] && injectIframeCss(tabs[0].id, request.css, request.frameUrl));
        }
        return true;
    }

    if (request.action === 'inject_iframe_zoom') {
        const tabId = sender.tab && sender.tab.id;
        if (tabId) injectIframeZoom(tabId, request.zoom, request.frameUrl);
        else if (sender.url?.startsWith('chrome-extension://')) {
            chrome.tabs.query({ url: sender.url }, (tabs) => tabs?.[0] && injectIframeZoom(tabs[0].id, request.zoom, request.frameUrl));
        }
        return true;
    }

    if (request.action === 'get_zoom') {
        const tabId = sender.tab && sender.tab.id;
        if (tabId) {
            chrome.tabs.getZoom(tabId, (zoom) => {
                sendResponse(zoom || 1);
            });
        } else {
            sendResponse(1);
        }
        return true;
    }

    if (request.action === 'inject_iframe_selector') {
        const tabId = sender.tab && sender.tab.id;
        if (tabId) injectIframeSelector(tabId, request.selector, request.frameUrl);
        else if (sender.url?.startsWith('chrome-extension://')) {
            chrome.tabs.query({ url: sender.url }, (tabs) => tabs?.[0] && injectIframeSelector(tabs[0].id, request.selector, request.frameUrl));
        }
        return true;
    }
    if (request.action === 'translate') {
        translateText(request.text, request.targetLang).then(sendResponse).catch(err => sendResponse({ error: err.message }));
        return true;
    }
    if (request.action === 'proofread') {
        proofreadText(request.text).then(sendResponse).catch(err => sendResponse({ error: err.message }));
        return true;
    }
    // Handle stop dictation from content script stop button
    if (request.action === 'toggle-dictation-stop') {
        if (isRecording) {
            stopDictation();
        }
        return true;
    }

    // Handle dictation cancellation from UI
    if (request.action === 'dictation-cancelled') {
        isRecording = false; // Reset state immediately
        return true;
    }

    // Handle audio playback from content script
    if (request.action === 'playAudio') {
        if (request.text) {
            playNativeTTS(request.text, request.speed).then(sendResponse).catch(() => {
                playEdgeTTSOffscreen(request.text, request.speed).then(sendResponse).catch(err => sendResponse({ error: err.message }));
            });
        } else {
            // Legacy fallback (might fail if playAudioOffscreen is removed)
            playAudioOffscreen(request.url, request.speed).then(sendResponse).catch(err => sendResponse({ error: err.message }));
        }
        return true;
    }

    // Fetch audio URL and return base64 for caching
    if (request.action === 'fetchAudioBase64') {
        (async () => {
            try {
                const response = await fetch(request.url);
                if (!response.ok) throw new Error('HTTP error');
                const arrayBuffer = await response.arrayBuffer();
                if (arrayBuffer.byteLength < 100) throw new Error('Empty audio');
                const base64 = btoa(new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), ''));
                sendResponse({ success: true, data: `data:audio/mpeg;base64,${base64}` });
            } catch (err) {
                sendResponse({ error: err.message });
            }
        })();
        return true;
    }

    // Get audio from persistent cache
    if (request.action === 'getAudioCache') {
        (async () => {
            try {
                const cached = await getAudioFromCache(request.text);
                if (cached) {
                    sendResponse({ success: true, type: cached.type, data: cached.data });
                } else {
                    sendResponse({ success: false });
                }
            } catch (err) {
                sendResponse({ success: false, error: err.message });
            }
        })();
        return true;
    }

    // Save audio to persistent cache
    if (request.action === 'setAudioCache') {
        (async () => {
            try {
                await setAudioCache(request.text, request.type, request.data);
                sendResponse({ success: true });
            } catch (err) {
                sendResponse({ success: false, error: err.message });
            }
        })();
        return true;
    }




    // Handle force memory consolidation from options page
    if (request.action === 'forceMemoryConsolidate') {
        (async () => {
            try {
                // Get chat history
                const data = await chrome.storage.local.get(['chat_history']);
                const chatHistory = data.chat_history || [];

                if (chatHistory.length === 0) {
                    sendResponse({ success: false, error: 'No chat history available' });
                    return;
                }

                // AI call function with provider rotation and retry logic
                const callAIForConsolidation = async (prompt) => {
                    const data = await chrome.storage.local.get(['providers', 'modelChains']);
                    const providers = data.providers || [];

                    // Preferred models for consolidation (fast and cheap)
                    const textChain = data.modelChains?.text || [];
                    const activeModelConfig = textChain.length > 0 ? textChain[0] : null; // Use first model in chain

                    // Use the active model ID if available, otherwise fallback to user preference or default
                    let targetModel = activeModelConfig ? activeModelConfig.model : 'gemini-flash-latest';

                    // Prioritize the provider of the active model
                    const orderedProviders = [];
                    if (activeModelConfig) {
                        const activeProvider = providers.find(p => p.id === activeModelConfig.providerId);
                        if (activeProvider) orderedProviders.push(activeProvider);
                    }

                    // Add other providers as backup
                    for (const p of providers) {
                        if (!orderedProviders.find(op => op.id === p.id)) {
                            orderedProviders.push(p);
                        }
                    }

                    let lastError = null;

                    for (const provider of orderedProviders) {
                        // Skip providers without API key
                        if (!provider.apiKey) continue;

                        const keys = provider.apiKey.split(',').map(k => k.trim()).filter(k => k);

                        // Use targetModel if it belongs to this provider, otherwise use provider's default
                        let modelToUse = targetModel;

                        // If provider type doesn't match active config, maybe fallback to safe defaults (e.g. gpt-4o-mini for openai)
                        if (activeModelConfig && provider.id !== activeModelConfig.providerId) {
                            if (provider.type === 'gemini') modelToUse = 'gemini-1.5-flash'; // Long context fallback
                            else if (provider.type === 'openai') modelToUse = 'gpt-4o-mini';
                            else if (provider.type === 'groq') modelToUse = 'llama-3.3-70b-versatile';
                        }

                        // Check for huge context
                        if (prompt.length > 200000 && provider.type !== 'gemini') {
                            console.warn(`[Lumina Memory] Context is huge (${prompt.length} chars). ${provider.name} might fail. Will fallback to Gemini if needed.`);
                        }

                        for (const key of keys) {
                            try {
                                let response, result, text;

                                if (provider.type === 'gemini') {
                                    // Gemini API
                                    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelToUse}:generateContent?key=${key}`;
                                    response = await fetch(geminiUrl, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                            contents: [{ parts: [{ text: prompt }] }],
                                            generationConfig: { temperature: 0.3, maxOutputTokens: 8192 }
                                        })
                                    });

                                    if (!response.ok) {
                                        const errText = await response.text();
                                        console.warn(`[Lumina Memory] Gemini API error (${response.status}):`, errText.substring(0, 200));
                                        if (response.status === 429 || response.status === 503) {
                                            lastError = new Error(`Rate limited: ${response.status}`);
                                            continue; // Try next key/provider
                                        }
                                        throw new Error(`Gemini API failed: ${response.status}`);
                                    }

                                    result = await response.json();
                                    text = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
                                } else {
                                    // OpenAI-compatible API (Groq, OpenRouter, etc.)
                                    const endpoint = provider.endpoint || 'https://api.groq.com/openai/v1/chat/completions';
                                    response = await fetch(endpoint, {
                                        method: 'POST',
                                        headers: {
                                            'Content-Type': 'application/json',
                                            ...(key ? { 'Authorization': `Bearer ${key}` } : {})
                                        },
                                        body: JSON.stringify({
                                            model: modelToUse,
                                            messages: [
                                                { role: 'system', content: 'You are a memory consolidation assistant. Output only valid JSON arrays.' },
                                                { role: 'user', content: prompt }
                                            ],
                                            temperature: 0.3,
                                            max_tokens: 8192
                                        })
                                    });

                                    if (!response.ok) {
                                        const errText = await response.text();
                                        console.warn(`[Lumina Memory] ${provider.type} API error (${response.status}):`, errText.substring(0, 200));
                                        if (response.status === 429 || response.status === 503) {
                                            lastError = new Error(`Rate limited: ${response.status}`);
                                            continue; // Try next key/provider
                                        }
                                        throw new Error(`${provider.type} API failed: ${response.status}`);
                                    }

                                    result = await response.json();
                                    text = result.choices?.[0]?.message?.content || '';
                                }

                                if (text && text.length > 0) {
                                    return text;
                                }
                            } catch (err) {
                                console.warn(`[Lumina Memory] Error with ${provider.name || provider.type}:`, err.message);
                                lastError = err;
                                continue; // Try next key
                            }
                        }
                    }

                    // If all providers failed
                    throw lastError || new Error('No available providers for consolidation');
                };

                // Force consolidation - use today's chats
                const memory = await UserMemory.load();
                memory.lastConsolidated = null; // Reset to force
                await UserMemory.save(memory);

                // Run consolidation with forceToday flag
                await UserMemory.dailyConsolidate(chatHistory, callAIForConsolidation, true);

                sendResponse({ success: true });
            } catch (e) {
                console.error('[Lumina] Force consolidation error:', e);
                sendResponse({ success: false, error: e.message });
            }
        })();
        return true;
    }

    // Transcribe audio using Whisper API
    if (request.action === 'transcribe_audio') {
        (async () => {
            const result = await transcribeAudio(request.audio, request.mimeType);
            sendResponse(result);
        })();
        return true; // Async response
    }

    if (request.action === 'play_audio') {
        const text = request.text;
        if (!text) {
            sendResponse({ error: 'No text provided' });
            return true;
        }

        (async () => {
            try {
                const encodedText = encodeURIComponent(text);
                const wordCount = text.trim().split(/\s+/).length;
                let oxfordPromise = null;

                // 1. Try Oxford if short text
                if (wordCount <= 2) {
                    const str = text.trim().toLowerCase();
                    const oxfordUrl = `https://ssl.gstatic.com/dictionary/static/sounds/oxford/${str}--_gb_1.mp3`;

                    oxfordPromise = fetch(oxfordUrl)
                        .then(async (response) => {
                            if (!response.ok) throw new Error('Oxford HTTP error');
                            const arrayBuffer = await response.arrayBuffer();
                            if (arrayBuffer.byteLength <= 100) throw new Error('Oxford empty response');
                            const base64 = btoa(
                                new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
                            );
                            return { source: 'oxford', audioChunks: [`data:audio/mpeg;base64,${base64}`] };
                        })
                        .catch(() => null); // Return null on failure to allow fallback
                }

                // 2. Google Translate TTS (Always prepare as fallback or primary)
                const googlePromise = (async () => {
                    const maxLength = 200;
                    const chunks = [];
                    if (text.length > maxLength) {
                        const words = text.split(' ');
                        let currentChunk = '';
                        for (const word of words) {
                            if ((currentChunk + ' ' + word).length > maxLength) {
                                chunks.push(currentChunk.trim());
                                currentChunk = word;
                            } else {
                                currentChunk += (currentChunk ? ' ' : '') + word;
                            }
                        }
                        if (currentChunk) chunks.push(currentChunk.trim());
                    } else {
                        chunks.push(text);
                    }

                    const chunkPromises = chunks.map(async (chunk) => {
                        const encodedChunk = encodeURIComponent(chunk);
                        const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=en-GB&client=tw-ob&q=${encodedChunk}&total=1&idx=0`;
                        const response = await fetch(url);
                        if (!response.ok) throw new Error(`HTTP ${response.status}`);
                        const arrayBuffer = await response.arrayBuffer();
                        const base64 = btoa(
                            new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
                        );
                        return `data:audio/mpeg;base64,${base64}`;
                    });

                    const results = await Promise.all(chunkPromises);
                    return { source: 'google', audioChunks: results.filter(url => url !== null) };
                })();

                // Execute Logic
                let result = null;
                if (oxfordPromise) {
                    result = await oxfordPromise;
                }

                if (!result) {
                    result = await googlePromise;
                }

                sendResponse({ audioChunks: result.audioChunks });

            } catch (error) {
                console.error('[Lumina] All audio sources failed:', error);
                sendResponse({ error: 'Failed to fetch audio from all sources' });
            }
        })();

        return true; // Async response
    }

    // Update translation cache manually (e.g. after regeneration)
    if (request.action === 'update_translation_cache') {
        (async () => {
            try {
                const { text, translation, targetLang } = request;
                const normalizedKey = `${text.toLowerCase().trim()}_${targetLang || 'vi'}`;
                const cache = await getLuminaCache('translation_cache');
                cache.entries[normalizedKey] = {
                    data: {
                        type: 'sentence',
                        original: text,
                        translation: translation,
                        showAudio: true
                    },
                    timestamp: Date.now()
                };
                await setLuminaCache('translation_cache', cache.entries, 300);
                sendResponse({ success: true });
            } catch (e) {
                console.error('[Lumina] Failed to update translation cache:', e);
                sendResponse({ success: false, error: e.message });
            }
        })();
        return true;
    }

    // Smart Image Lookup Handler (AI-powered)
    if (request.action === 'smart_image_lookup') {
        (async () => {
            try {
                // 1. Analyze text with AI
                const originalText = request.text;
                const systemInstruction = `You are a query optimization assistant for an image search engine. 
Your task is to analyze the user's selected text and generate the SINGLE BEST keyword or short phrase for a Google Image Search.
- Return ONLY the query string. No quotes, no explanations.
- If the text is already a simple noun or name, return it as is.
- If the text is a sentence or paragraph, extract the main subject or visual concept.
- Prefer English queries for better results, unless the entity is specific to another language.`;

                const optimizedQuery = await generateOneOffCompletion(originalText, systemInstruction);
                const cleanQuery = optimizedQuery.trim().replace(/^"|"$/g, '');

                // 2. Perform Image Search
                const items = await chrome.storage.local.get(['googleApiKey', 'googleCx']);
                if (!items.googleApiKey || !items.googleCx) {
                    sendResponse({ error: 'Please configure Google API Key and Search Engine ID in extension settings' });
                    return;
                }

                const results = await searchImages(cleanQuery, items.googleApiKey, items.googleCx);

                // Return results + the query used
                sendResponse({ results, query: cleanQuery });

            } catch (error) {
                sendResponse({ error: error.message });
            }
        })();
        return true;
    }

    // Image Search Handler
    if (request.action === 'search_images') {
        chrome.storage.local.get(['googleApiKey', 'googleCx'], async (items) => {
            if (!items.googleApiKey || !items.googleCx) {
                sendResponse({
                    error: 'Please configure Google API Key and Search Engine ID in extension settings'
                });
                return;
            }

            try {
                const results = await searchImages(request.query, items.googleApiKey, items.googleCx);
                sendResponse({ results });
            } catch (error) {
                sendResponse({ error: error.message });
            }
        });
        return true; // Keep channel open for async response
    }
    // Generic AI Completion (for Anki Smart Creator, etc)
    if (request.action === 'ai_completion') {
        (async () => {
            try {
                const prompt = request.prompt;
                const systemInstruction = request.system || "You are a helpful assistant.";
                const modelConfig = (request.providerId && request.model) ? { providerId: request.providerId, model: request.model } : null;

                const text = await generateOneOffCompletion(prompt, systemInstruction, modelConfig, request.requestOptions || {});
                sendResponse({ text });
            } catch (error) {
                // If it's a quota error, we want the sender to know so they can rotate/retry
                sendResponse({ error: error.message });
            }
        })();
        return true;
    }

    if (request.action === 'reset_exhausted_keys') {
        (async () => {
            const data = await chrome.storage.local.get();
            const keysToRemove = Object.keys(data).filter(k => k.startsWith('exhausted_'));
            if (keysToRemove.length > 0) {
                await chrome.storage.local.remove(keysToRemove);
            }
            sendResponse({ success: true, count: keysToRemove.length });
        })();
        return true;
    }
});

// --- Global Command Listener (Spotlight) ---
let spotlightWindowId = null;
let spotlightInitialPosition = null;
let spotlightHasMoved = false;

// Load spotlightWindowId from storage on service worker startup (survives SW restarts)
chrome.storage.local.get(['spotlightWindowId'], (data) => {
    if (data.spotlightWindowId) {
        // Verify the window still exists
        chrome.windows.get(data.spotlightWindowId, (win) => {
            if (chrome.runtime.lastError || !win) {
                // Window no longer exists, clear storage
                chrome.storage.local.remove('spotlightWindowId');
                spotlightWindowId = null;
            } else {
                spotlightWindowId = data.spotlightWindowId;

            }
        });
    }
});

chrome.commands.onCommand.addListener(async (command) => {
    if (command === 'open-lumina-chat') {
        // Early guard: prevent creating multiple windows if already in progress
        if (isCreatingSpotlight) {
            return;
        }

        try {
            // If spotlightWindowId is null, try to load from storage (service worker may have restarted)
            if (!spotlightWindowId) {
                const stored = await chrome.storage.local.get(['spotlightWindowId']);
                if (stored.spotlightWindowId) {
                    spotlightWindowId = stored.spotlightWindowId;

                }
            }

            if (spotlightWindowId) {
                // Check if window still exists
                const existingWindow = await new Promise(resolve => {
                    chrome.windows.get(spotlightWindowId, { populate: true }, (win) => {
                        if (chrome.runtime.lastError || !win) {
                            resolve(null);
                        } else {
                            resolve(win);
                        }
                    });
                });

                if (existingWindow) {
                    // Toggle: if window is already focused and normal/maximized, hide it (minimize)
                    if (existingWindow.focused && (existingWindow.state === 'normal' || existingWindow.state === 'maximized')) {
                        await chrome.windows.update(spotlightWindowId, { state: 'minimized' });
                        return;
                    }

                    // Window exists - Always focus or restore
                    if (existingWindow.state === 'minimized') {
                        // Window is minimized → restore and focus
                        await chrome.windows.update(spotlightWindowId, {
                            focused: true,
                            state: 'normal',
                            drawAttention: true
                        });
                    } else {
                        // Window exists (unfocused) → ensure focus
                        await chrome.windows.update(spotlightWindowId, {
                            focused: true,
                            drawAttention: true
                        });
                    }

                    // Clear text selection in the spotlight window
                    if (existingWindow.tabs && existingWindow.tabs.length > 0) {
                        chrome.tabs.sendMessage(existingWindow.tabs[0].id, { action: 'clear_selection' }).catch(() => {
                            // Ignore errors if tab is not ready
                        });
                    }
                } else {
                    // Window was closed, reset ID and create new
                    spotlightWindowId = null;
                    await chrome.storage.local.remove('spotlightWindowId');
                    await createSpotlightWindow();
                }
            } else {
                await createSpotlightWindow();
            }
        } catch (error) {
            console.error('[Lumina] Error handling spotlight command:', error);
            // Reset state on error
            spotlightWindowId = null;
            isCreatingSpotlight = false;
        }
    } else if (command === 'new-chat') {
        if (spotlightWindowId) {
            chrome.windows.get(spotlightWindowId, { populate: true }, (win) => {
                if (!chrome.runtime.lastError && win && win.tabs && win.tabs.length > 0) {
                    chrome.tabs.sendMessage(win.tabs[0].id, { action: 'new_chat' }).catch(() => { });
                    chrome.windows.update(spotlightWindowId, { focused: true }).catch(() => { });
                }
            });
        }
    }
});


async function transcribeAudio(base64Audio, mimeType) {
    try {
        // Get voice provider settings and providers list
        const data = await chrome.storage.local.get(['voiceProvider', 'voiceModel', 'providers']);
        const voiceProviderId = data.voiceProvider;
        const model = data.voiceModel || 'whisper-large-v3';
        const providers = data.providers || [];

        if (!voiceProviderId) {
            return { error: 'Please configure Voice Dictation in Settings → AI Configuration' };
        }

        // Find the provider config
        const provider = providers.find(p => p.id === voiceProviderId);
        if (!provider) {
            return { error: 'Voice provider not found. Please reconfigure in Settings.' };
        }

        if (!provider.apiKey) {
            return { error: `Please set API key for ${provider.name} in Settings → Providers` };
        }

        const apiKey = provider.apiKey.split(',')[0].trim(); // Use first key

        // Convert base64 to Blob
        const binary = atob(base64Audio);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        const audioBlob = new Blob([bytes], { type: mimeType || 'audio/webm' });

        // Determine file extension from mime type
        let extension = 'webm';
        if (mimeType) {
            if (mimeType.includes('mp4')) extension = 'mp4';
            else if (mimeType.includes('wav')) extension = 'wav';
            else if (mimeType.includes('webm')) extension = 'webm';
            else if (mimeType.includes('ogg')) extension = 'ogg';
        }

        // Create FormData for multipart upload
        const formData = new FormData();
        formData.append('file', audioBlob, `audio.${extension}`);
        formData.append('model', model);
        formData.append('response_format', 'text');

        // Build API endpoint
        let transcriptionUrl = provider.endpoint.replace('/chat/completions', '/audio/transcriptions');

        // For Groq specifically
        if (provider.type === 'groq' || provider.endpoint.includes('groq.com')) {
            transcriptionUrl = 'https://api.groq.com/openai/v1/audio/transcriptions';
        }

        const response = await fetch(transcriptionUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`
            },
            body: formData
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[Lumina] Transcription API error:', errorText);
            return { error: `Transcription failed: ${response.status}` };
        }

        const transcribedText = await response.text();

        return { text: transcribedText };
    } catch (err) {
        console.error('[Lumina] Transcription error:', err);
        return { error: err.message || 'Transcription failed' };
    }
}

let isCreatingSpotlight = false; // Guard against race conditions

async function createSpotlightWindow() {
    // Prevent multiple windows from being created simultaneously
    if (isCreatingSpotlight) {
        return;
    }
    isCreatingSpotlight = true;

    try {
        // Load saved dimensions and position
        const saved = await new Promise(resolve => {
            chrome.storage.local.get(['spotlightWidth', 'spotlightHeight', 'spotlightLeft', 'spotlightTop'], resolve);
        });

        const windowWidth = saved.spotlightWidth || 400;
        const windowHeight = saved.spotlightHeight || 400;

        try {
            // Get all displays to validate bounds
            const displays = await chrome.system.display.getInfo();

            // Try to get the last focused Chrome window to determine which screen
            const lastFocused = await new Promise(resolve => {
                chrome.windows.getLastFocused({ populate: false }, (win) => {
                    resolve(chrome.runtime.lastError ? null : win);
                });
            });

            let left, top;

            // Helper function to check if position is within any visible screen
            const isPositionValid = (x, y, w, h) => {
                for (const display of displays) {
                    const bounds = display.workArea;
                    // Check if at least 50% of window would be visible on this display
                    const overlapLeft = Math.max(x, bounds.left);
                    const overlapTop = Math.max(y, bounds.top);
                    const overlapRight = Math.min(x + w, bounds.left + bounds.width);
                    const overlapBottom = Math.min(y + h, bounds.top + bounds.height);

                    const overlapWidth = Math.max(0, overlapRight - overlapLeft);
                    const overlapHeight = Math.max(0, overlapBottom - overlapTop);
                    const overlapArea = overlapWidth * overlapHeight;
                    const windowArea = w * h;

                    if (overlapArea >= windowArea * 0.5) {
                        return true;
                    }
                }
                return false;
            };

            // If we have saved position, validate it's still on a visible screen
            if (saved.spotlightLeft !== undefined && saved.spotlightTop !== undefined) {
                if (isPositionValid(saved.spotlightLeft, saved.spotlightTop, windowWidth, windowHeight)) {
                    left = saved.spotlightLeft;
                    top = saved.spotlightTop;
                } else {
                    // Clear invalid saved position
                    await chrome.storage.local.remove(['spotlightLeft', 'spotlightTop']);
                }
            }

            // Calculate center position if no valid saved position
            if (left === undefined || top === undefined) {
                let targetDisplay = null;

                if (lastFocused && lastFocused.left !== undefined && lastFocused.top !== undefined) {
                    // Find which display contains the last focused window
                    const windowCenterX = lastFocused.left + (lastFocused.width || 0) / 2;
                    const windowCenterY = lastFocused.top + (lastFocused.height || 0) / 2;

                    for (const display of displays) {
                        const bounds = display.workArea;
                        if (windowCenterX >= bounds.left &&
                            windowCenterX < bounds.left + bounds.width &&
                            windowCenterY >= bounds.top &&
                            windowCenterY < bounds.top + bounds.height) {
                            targetDisplay = display;
                            break;
                        }
                    }
                }

                // Fallback to primary display
                if (!targetDisplay) {
                    targetDisplay = displays.find(d => d.isPrimary) || displays[0];
                }

                if (targetDisplay) {
                    const screenWidth = targetDisplay.workArea.width;
                    const screenHeight = targetDisplay.workArea.height;
                    const screenLeft = targetDisplay.workArea.left;
                    const screenTop = targetDisplay.workArea.top;

                    left = screenLeft + Math.round((screenWidth - windowWidth) / 2);
                    top = screenTop + Math.round((screenHeight - windowHeight) / 2);
                }
            }

            const windowConfig = {
                url: 'pages/spotlight/spotlight.html',
                type: 'popup',
                width: windowWidth,
                height: windowHeight,
                focused: true
            };

            if (left !== undefined && top !== undefined) {
                windowConfig.left = left;
                windowConfig.top = top;
            }

            chrome.windows.create(windowConfig, (win) => {
                // Check if window creation was successful
                if (chrome.runtime.lastError || !win) {
                    console.error('[Lumina] Failed to create spotlight window:', chrome.runtime.lastError?.message);
                    // Retry without position (let Chrome decide)
                    chrome.windows.create({
                        url: 'pages/spotlight/spotlight.html',
                        type: 'popup',
                        width: windowWidth,
                        height: windowHeight,
                        focused: true
                    }, (fallbackWin) => {
                        if (fallbackWin) {
                            spotlightWindowId = fallbackWin.id;
                            spotlightInitialPosition = { left: fallbackWin.left, top: fallbackWin.top };
                            spotlightHasMoved = false;
                            chrome.storage.local.set({ spotlightWindowId: fallbackWin.id });
                        } else {
                            console.error('[Lumina] Failed to create spotlight window even with fallback');
                        }
                    });
                    return;
                }

                spotlightWindowId = win.id;
                spotlightInitialPosition = { left: win.left, top: win.top };
                spotlightHasMoved = false;
                // Persist window ID to storage (survives service worker restarts)
                chrome.storage.local.set({ spotlightWindowId: win.id });
            });
        } catch (error) {
            console.error('Error creating spotlight window:', error);
            // Fallback with no position
            chrome.windows.create({
                url: 'pages/spotlight/spotlight.html',
                type: 'popup',
                width: windowWidth,
                height: windowHeight,
                focused: true
            }, (win) => {
                if (win) {
                    spotlightWindowId = win.id;
                    spotlightInitialPosition = { left: win.left, top: win.top };
                    spotlightHasMoved = false;
                    chrome.storage.local.set({
                        spotlightWindowId: win.id,
                        spotlightWidth: win.width,
                        spotlightHeight: win.height,
                        spotlightLeft: win.left,
                        spotlightTop: win.top
                    });
                }
            });
        }
    } finally {
        isCreatingSpotlight = false;
    }
}

// Track window movement and resize
chrome.windows.onBoundsChanged.addListener((window) => {
    if (window.id === spotlightWindowId) {
        // Check if window has moved from initial position
        if (spotlightInitialPosition) {
            const movedX = Math.abs(window.left - spotlightInitialPosition.left) > 5;
            const movedY = Math.abs(window.top - spotlightInitialPosition.top) > 5;

            // If moved, update flag and set always on top
            if (movedX || movedY) {
                if (!spotlightHasMoved) {
                    spotlightHasMoved = true;
                    chrome.windows.update(spotlightWindowId, { alwaysOnTop: true }, () => {
                    });
                }
                // Update initial position to current, so we can detect next movement
                spotlightInitialPosition = { left: window.left, top: window.top };
            }
        }

        // Always save position and dimensions (for cross-platform compatibility)

        chrome.storage.local.set({
            spotlightWidth: window.width,
            spotlightHeight: window.height,
            spotlightLeft: window.left,
            spotlightTop: window.top
        });
    }
});

// Track when spotlight window is manually closed
chrome.windows.onRemoved.addListener((windowId) => {
    if (windowId === spotlightWindowId) {
        spotlightWindowId = null;
        spotlightInitialPosition = null;
        spotlightHasMoved = false;
        // Clear from storage so next open creates fresh window
        chrome.storage.local.remove('spotlightWindowId');
    }
});

// --- Connect Listener (Long-lived for Chat Stream) ---
chrome.runtime.onConnect.addListener((port) => {
    if (port.name === 'lumina-chat-stream') {
        port.onMessage.addListener(async (msg) => {
            if (msg.action === 'chat_stream' || msg.action === 'proofread') {
                try {
                    await handleChatStream(
                        msg.messages,
                        msg.initialContext,
                        msg.question,
                        port,
                        msg.imageData,
                        msg.isSpotlight || false,
                        msg.requestOptions || {},
                        msg.hasTranscriptForVideoId || null,
                        msg.action
                    );
                } catch (e) {
                    port.postMessage({ action: 'chunk', chunk: `*Error: ${e.message}*` });
                } finally {
                    port.postMessage({ action: 'done' });
                }
            }
        });
    }

    if (port.name === 'lumina-audio-stream') {
        port.onMessage.addListener(async (msg) => {
            if (msg.action === 'play_stream') {
                const text = msg.text;
                if (!text) return;

                // --- Language Detection ---
                const detectLanguage = (text) => {
                    // Count characters in different Unicode ranges
                    let counts = {
                        vietnamese: 0,
                        chinese: 0,
                        japanese: 0,
                        korean: 0,
                        cyrillic: 0,
                        latin: 0
                    };

                    // Vietnamese-specific characters (diacritics)
                    const vietnameseRegex = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/gi;

                    for (const char of text) {
                        const code = char.charCodeAt(0);

                        // CJK Unified Ideographs (Chinese)
                        if (code >= 0x4E00 && code <= 0x9FFF) {
                            counts.chinese++;
                        }
                        // Hiragana
                        else if (code >= 0x3040 && code <= 0x309F) {
                            counts.japanese++;
                        }
                        // Katakana
                        else if (code >= 0x30A0 && code <= 0x30FF) {
                            counts.japanese++;
                        }
                        // Hangul (Korean)
                        else if (code >= 0xAC00 && code <= 0xD7AF) {
                            counts.korean++;
                        }
                        // Cyrillic
                        else if (code >= 0x0400 && code <= 0x04FF) {
                            counts.cyrillic++;
                        }
                        // Basic Latin (include extended for accented chars)
                        else if ((code >= 0x0041 && code <= 0x007A) || (code >= 0x00C0 && code <= 0x00FF)) {
                            counts.latin++;
                        }
                    }

                    // Check for Vietnamese (Latin with specific diacritics)
                    const vietnameseMatches = text.match(vietnameseRegex);
                    if (vietnameseMatches) {
                        counts.vietnamese = vietnameseMatches.length;
                    }

                    // Find dominant by highest count (no special priority)
                    const total = Object.values(counts).reduce((a, b) => a + b, 0);
                    if (total === 0) return 'en-GB'; // Default

                    // Determine by highest count
                    const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];

                    const langMap = {
                        chinese: 'zh-CN',
                        japanese: 'ja',
                        korean: 'ko',
                        cyrillic: 'ru',
                        latin: 'en-GB',
                        vietnamese: 'vi'
                    };

                    // Special case: If Latin dominant but has significant Vietnamese diacritics
                    if (dominant[0] === 'latin' && counts.vietnamese > 0 && counts.vietnamese / counts.latin > 0.15) {
                        return 'vi';
                    }

                    return langMap[dominant[0]] || 'en-GB';
                };

                // Detect language for TTS
                const detectedLang = detectLanguage(text);


                // --- 1. Prepare Google TTS Strategy ---
                // Split text by sentences (. ? !)
                const googleChunks = [];
                // Match sentences ending with . ? or !
                const sentences = text.match(/[^.?!]+[.?!]+/g) || [text];
                // Filter: remove single-letter chunks like "a.", "b.", "c." etc.
                const cleanSentences = sentences
                    .map(s => s.trim())
                    .filter(s => {
                        const textOnly = s.replace(/[.?!,;:]/g, '').trim();
                        return textOnly.length >= 2; // Must have at least 2 chars of actual text
                    });

                if (cleanSentences.length <= 1) {
                    // Use full text if only 1 or 0 valid sentences
                    const fullTextOnly = text.replace(/[.?!,;:]/g, '').trim();
                    if (fullTextOnly.length >= 2) {
                        googleChunks.push(text);
                    }
                } else {
                    const SENTENCES_PER_CHUNK = 1;
                    for (let i = 0; i < cleanSentences.length; i += SENTENCES_PER_CHUNK) {
                        const sentenceGroup = cleanSentences.slice(i, i + SENTENCES_PER_CHUNK);
                        const chunk = sentenceGroup.join(' ').trim();
                        if (chunk.length > 0) {
                            googleChunks.push(chunk);
                        }
                    }
                }

                // Define Google Fetcher with detected language
                const executeGoogleFallback = async () => {

                    port.postMessage({ type: 'meta', total: googleChunks.length, lang: detectedLang });

                    const fetchChunk = async (chunk, index) => {
                        try {
                            const encodedText = encodeURIComponent(chunk);
                            // 'tw-ob' is the standard client used by many extensions
                            const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${detectedLang}&client=tw-ob&q=${encodedText}&total=1&idx=0`;

                            const response = await fetch(url, { referrerPolicy: 'no-referrer' });
                            if (!response.ok) throw new Error(`HTTP ${response.status}`);

                            const contentType = response.headers.get('Content-Type');

                            // Google sometimes returns audio/mpeg or audio/mp3.
                            // If it's text/html, it's definitely an error (captcha/block).
                            if (contentType && !contentType.includes('audio') && !contentType.includes('mpeg')) {
                                const text = await response.text();

                                throw new Error('Invalid content type: ' + contentType);
                            }

                            // 1. Get raw bytes
                            const rawBlob = await response.blob();

                            // 2. Force type to audio/mpeg to ensure subsequent FileReader result is a valid DataURI
                            const blob = new Blob([rawBlob], { type: 'audio/mpeg' });

                            // 3. Return as a Promise so we can await all chunks
                            return new Promise((resolve) => {
                                const reader = new FileReader();
                                reader.onloadend = () => {
                                    const base64DataUrl = reader.result; // This includes data:audio/mpeg;base64,...
                                    try {
                                        port.postMessage({
                                            type: 'chunk',
                                            index: index,
                                            data: base64DataUrl
                                        });
                                    } catch (e) { /* Port disconnected */ }
                                    resolve();
                                };
                                reader.onerror = () => {
                                    try { port.postMessage({ type: 'error', index: index, error: 'Blob read failed' }); } catch (err) { }
                                    resolve();
                                };
                                reader.readAsDataURL(blob);
                            });

                        } catch (e) {
                            try { port.postMessage({ type: 'error', index: index, error: e.message }); } catch (err) { }
                        }
                    };

                    // Fetch ALL chunks in parallel for seamless playback
                    // Then send 'done' so content script knows the stream is finished
                    await Promise.all(googleChunks.map((chunk, index) => fetchChunk(chunk, index)));
                    try { port.postMessage({ type: 'done' }); } catch (e) { /* Port disconnected */ }
                };

                // --- STREAMING LOGIC ---
                // The content script manages the decision (Oxford vs Google).
                // If this port is called, we assume we want Google TTS chunks.

                await executeGoogleFallback();
            }
        });
    }
});

// --- Helper Functions (Dictionary & Translation) ---

async function translateText(text, targetLang = 'vi') {
    // --- DAILY CACHE SYSTEM (expires at midnight) ---
    const CACHE_KEY = 'translation_cache';
    const normalizedKey = `${text.toLowerCase().trim()}_${targetLang}`;

    // Try to get from daily cache first
    const cache = await getLuminaCache(CACHE_KEY);

    if (cache.entries[normalizedKey]) {
        const cached = cache.entries[normalizedKey];

        return { ...cached.data, fromCache: true };
    }

    // Get settings
    const settings = await chrome.storage.local.get(['transProvider', 'deepLApiKey', 'providers', 'provider', 'model', 'transModelProvider', 'transModel']);
    const transProvider = settings.transProvider || 'ai';

    // --- 1. AI Intelligent Translation ---
    if (transProvider === 'ai') {
        let chain;

        // Use dedicated translation model if configured
        if (settings.transModelProvider && settings.transModel) {
            const provider = settings.providers?.find(p => p.id === settings.transModelProvider);
            if (provider) {
                chain = [{
                    model: settings.transModel,
                    providerType: provider.type,
                    endpoint: provider.endpoint,
                    apiKey: provider.apiKey
                }];
            }
        }

        // Fallback to text model chain
        if (!chain) {
            chain = await getModelChain('text');
        }

        if (!chain || chain.length === 0) {
        } else {
            for (let i = 0; i < chain.length; i++) {
                const config = chain[i];
                const { model, providerType: currentProvider, endpoint, apiKey } = config;
                const keys = getKeysArray(apiKey);

                // Prompt for natural, high-quality translation (Maastricht University style)
                const targetLanguage = targetLang === 'vi' ? 'Vietnamese' : targetLang;
                const systemPrompt = `Above, you see a text. Please translate it to ${targetLanguage}. Do not print the original text, just the translation.

Follow the following instructions:

1. Ensure the translation accurately reflects the original text's meaning.

2. The translation should have correct grammar, including proper sentence structure, verb conjugation, punctuation, and the correct use of articles.

3. The translation should read naturally and fluently as if originally written in the target language. Avoid awkward phrasing or literal translations that sound unnatural.

4. Pay special attention to proper nouns and specific terms. Names of people, places, organizations, and other terms that should not be translated must be handled with care to maintain their original meaning and recognition.

5. Ensure that the translation maintains the original text's tone and style.

Output strictly valid JSON:
{
  "type": "sentence",
  "original": "${text.replace(/"/g, '\\"')}",
  "translation": "Your natural, fluent translation in ${targetLanguage}"
}
`;

                // --- TRACK USAGE ---
                if (model) incrementModelUsage(model);
                // -------------------

                try {
                    const result = await fetchWithRotation(keys, async (key) => {
                        if (currentProvider === 'gemini') {
                            let geminiUrl = endpoint;
                            if (endpoint.includes('/models') && !endpoint.includes(':')) {
                                geminiUrl = `${endpoint.replace(/\/models\/?$/, '')}/models/${model}:generateContent?key=${key}`;
                            } else {
                                geminiUrl = `${endpoint}/${model}:generateContent?key=${key}`;
                            }

                            const body = {
                                contents: [{ role: 'user', parts: [{ text: systemPrompt + "\n\nText to translate: " + text }] }],
                                generationConfig: { response_mime_type: "application/json" }
                            };

                            return fetch(geminiUrl, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
                        } else {
                            // OpenAI
                            const body = {
                                model: model,
                                messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: text }],
                                temperature: 0.3,
                                response_format: { type: "json_object" }
                            };
                            return fetch(endpoint, {
                                method: 'POST',
                                body: JSON.stringify(body),
                                headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }
                            });
                        }
                    });

                    if (result.ok) {
                        const json = await result.json();
                        let rawText = '';
                        if (currentProvider === 'gemini') {
                            rawText = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
                        } else {
                            rawText = json.choices?.[0]?.message?.content || '';
                        }

                        // Parse JSON
                        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
                        const data = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(rawText);

                        // Fallback if data is malformed
                        if (!data.translation) data.translation = text;

                        data.type = 'sentence'; // Enforce type
                        data.showAudio = true;
                        // Force ensure original text
                        if (!data.original) data.original = text;

                        // --- SAVE TO DAILY CACHE ---
                        const currentCache = await getLuminaCache(CACHE_KEY);
                        currentCache.entries[normalizedKey] = { data: data, timestamp: Date.now() };
                        await setLuminaCache(CACHE_KEY, currentCache.entries, 300);

                        return data; // Success!
                    }
                } catch (e) {
                    if (e.message === 'RATE_LIMIT_EXHAUSTED') {
                        console.warn(`[Lumina] Translation model ${model} hit rate limit. Rotating...`);
                        continue;
                    }
                    console.error(`[Lumina] Translation failed on model ${model}:`, e);
                    continue;
                }
            }
        }
    }

    // --- 2. DeepL Translation ---
    if (transProvider === 'deepl' && settings.deepLApiKey) {
        // (Existing DeepL Logic)
        try {
            const deepLApiKey = settings.deepLApiKey;
            const isFreePlan = deepLApiKey.endsWith(':fx');
            const apiEndpoint = isFreePlan ? 'https://api-free.deepl.com/v2/translate' : 'https://api.deepl.com/v2/translate';

            const deepLLangMap = { 'vi': 'VI', 'en': 'EN', 'ja': 'JA' }; // Add more if needed
            const deepLTargetLang = deepLLangMap[targetLang.toLowerCase()] || targetLang.toUpperCase();

            const response = await fetch(apiEndpoint, {
                method: 'POST',
                headers: { 'Authorization': `DeepL-Auth-Key ${deepLApiKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: [text], target_lang: deepLTargetLang })
            });

            if (response.ok) {
                const data = await response.json();
                const result = {
                    type: 'sentence',
                    original: text,
                    translation: data.translations?.[0]?.text || text,
                    showAudio: true
                };

                // --- SAVE TO DAILY CACHE ---
                const currentCache = await getLuminaCache(CACHE_KEY);
                currentCache.entries[normalizedKey] = { data: result, timestamp: Date.now() };
                await setLuminaCache(CACHE_KEY, currentCache.entries, 300);

                return result;
            }
        } catch (e) {
            console.error('[Lumina] DeepL failed:', e);
        }
    }

    // --- 3. Google Translate (Fallback) ---
    const fromLang = 'auto';
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${fromLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;

    try {
        const response = await fetch(url);
        const data = await response.json();
        let translatedText = data[0].map(item => item[0]).join('');

        // Preserve letter numbering
        const letterPrefix = text.match(/^([a-z])\.\s*/i);
        if (letterPrefix) {
            translatedText = translatedText.replace(/^(Một|Hai|Ba|Bốn|Năm|Sáu|Bảy|Tám|Chín|Mười|[A-Z])\.\s*/, letterPrefix[0]);
        }

        // Create final result
        const result = { type: 'sentence', original: text, translation: translatedText, fromProvider: 'google', showAudio: true };
        const currentCache = await getLuminaCache(CACHE_KEY);
        currentCache.entries[normalizedKey] = { data: result, timestamp: Date.now() };
        await setLuminaCache(CACHE_KEY, currentCache.entries, 300);

        return result;
    } catch (e) {
        console.error('[Lumina] Google Translate failed:', e);
        return { type: 'sentence', original: text, translation: text + " (Translation failed)" };
    }
}

async function proofreadText(text) {
    // 1. Get Model Chain
    const chain = await getModelChain();

    if (!chain || chain.length === 0) {
        throw new Error("No AI provider configured. Please add a provider in Options.");
    }

    // 2. Execution Loop
    for (let i = 0; i < chain.length; i++) {
        const config = chain[i];
        const { model, providerType: currentProvider, endpoint, apiKey } = config;
        const keys = getKeysArray(apiKey);

        // --- TRACK USAGE ---
        if (model) incrementModelUsage(model);
        // -------------------

        const systemPrompt = `You are an expert English proofreader.
Output ONLY the corrected English version. No explanations.
Rules:
- Translate to English if input is NOT English.
- Keep original structure and meaning.
- Match original capitalization (lower -> lower, Upper -> Upper).
- Match original punctuation (no dot -> no dot).`;

        try {
            const res = await fetchWithRotation(keys, async (key) => {
                if (currentProvider === 'gemini') {
                    // Build Gemini URL from endpoint
                    let geminiUrl = endpoint;
                    if (endpoint.includes('/models') && !endpoint.includes(':')) {
                        geminiUrl = `${endpoint.replace(/\/models\/?$/, '')}/models/${model}:generateContent?key=${key}`;
                    } else {
                        geminiUrl = `${endpoint}/${model}:generateContent?key=${key}`;
                    }
                    const body = {
                        contents: [{
                            role: 'user',
                            parts: [{ text: systemPrompt + "\n\n" + text }]
                        }]
                    };
                    return fetch(geminiUrl, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
                } else {
                    // OpenAI-compatible API
                    const body = {
                        model: model,
                        messages: [
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: text }
                        ]
                    };
                    return fetch(endpoint, { method: 'POST', body: JSON.stringify(body), headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } });
                }
            });

            if (res.ok) {
                const json = await res.json();
                if (currentProvider === 'gemini') {
                    return { corrected: json.candidates?.[0]?.content?.parts?.[0]?.text || text };
                } else {
                    return { corrected: json.choices[0]?.message?.content || text };
                }
            }
        } catch (e) {
            if (e.message === 'RATE_LIMIT_EXHAUSTED') {
                console.warn(`[Lumina] Proofreader hit rate limit on ${model}. Rotating...`);
                continue;
            }
            console.error(`[Lumina] Proofread failed on ${model}:`, e);
            continue; // Fallback for other errors too
        }
    }

    throw new Error("Proofreading failed on all models.");
}

// --- Main Chat Handler (New: Supports Model Chain) ---
async function handleChatStream(messages, initialContext, question, port, imageData = null, isSpotlight = false, requestOptions = {}, hasTranscriptForVideoId = null, action = 'chat_stream') {
    try {
        // --- YouTube Context Extraction ---
        try {
            let activeUrl = port?.sender?.tab?.url;
            let activeTabId = port?.sender?.tab?.id;

            if (!activeUrl) {
                // If the message came from popup (port.sender.tab is undefined)
                // or spotlight (which may not have the right tab associated), we query the current tab.
                const queryOptions = isSpotlight ? { active: true } : { active: true, currentWindow: true };

                // For Spotlight, currentWindow might be the Spotlight window itself which has no URL. 
                // In that case we want the last focused window's active tab.
                const tabs = await chrome.tabs.query(queryOptions);
                if (tabs && tabs.length > 0) {
                    activeUrl = tabs[0].url;
                    activeTabId = tabs[0].id;
                    // If spotlight grabbed its own tab by mistake, filter it out
                    if (isSpotlight && activeUrl && activeUrl.includes(chrome.runtime.id)) {
                        const allActive = await chrome.tabs.query({ active: true });
                        const realTab = allActive.find(t => t.url && !t.url.includes(chrome.runtime.id));
                        if (realTab) {
                            activeUrl = realTab.url;
                            activeTabId = realTab.id;
                        }
                    }
                }
            }

            if (activeUrl && YoutubeUtils.isYouTubeVideo(activeUrl)) {
                const videoId = YoutubeUtils.getVideoId(activeUrl);
                if (videoId) {
                    if (hasTranscriptForVideoId === videoId) {
                        console.log(`[Lumina] Skipping transcript fetch for ${videoId} to save tokens, already in this chat session.`);
                    } else {
                        // Check persistent cache (async)
                        const cached = await YoutubeUtils.getCachedTranscript(videoId);
                        if (!cached) {
                            // Notify start of fetching
                            port.postMessage({ action: 'youtube_status', status: 'fetching' });
                        }
                        const transcript = await YoutubeUtils.fetchTranscript(videoId);
                        if (transcript) {
                            // Notify transcript ready - pass videoId so content script can log it
                            port.postMessage({ action: 'youtube_status', status: 'ready', transcript: transcript, videoId: videoId });
                            initialContext = (initialContext ? initialContext + "\n\n" : "") + transcript;
                        }
                    }
                }
            }
        } catch (ytError) {
            console.warn("[Lumina] Optional YouTube context extraction failed:", ytError);
        }
        // ----------------------------------

        // 1. Load global settings for params (shared across models)
        const globalSettings = await chrome.storage.local.get(['responseLanguage', 'advancedParamsByModel']);

        // 2. Get Chain - Check if current message OR any message in history has images
        let hasImagesInConversation = imageData && Array.isArray(imageData) && imageData.length > 0;

        // Clean up history: Remove status messages from previous turns so AI doesn't mimic them
        const statusMsgPattern = /_?Fetching YouTube transcript for video context\.\.\._?\n\n?/g;
        const cleanMessages = messages.map(m => {
            if ((m.role === 'assistant' || m.role === 'model') && typeof m.content === 'string') {
                return { ...m, content: m.content.replace(statusMsgPattern, "").trim() };
            }
            return m;
        });

        // Check message history for any images
        if (!hasImagesInConversation && cleanMessages && Array.isArray(cleanMessages)) {
            for (let i = 0; i < cleanMessages.length; i++) {
                const msg = cleanMessages[i];

                // Check for files/images property (format from gatherFullContext)
                if (msg.files && Array.isArray(msg.files) && msg.files.length > 0) {
                    hasImagesInConversation = true;
                    break;
                }
                if (msg.images && Array.isArray(msg.images) && msg.images.length > 0) {
                    hasImagesInConversation = true;
                    break;
                }
                // Check for image_url in content array (OpenAI format)
                if (Array.isArray(msg.content)) {
                    if (msg.content.some(part => part.type === 'image_url' || part.type === 'image')) {
                        hasImagesInConversation = true;
                        break;
                    }
                }
                // Check for inline_data in parts (Gemini format)
                if (msg.parts && Array.isArray(msg.parts)) {
                    if (msg.parts.some(part => part.inline_data || part.inlineData)) {
                        hasImagesInConversation = true;
                        break;
                    }
                }
            }
        }

        const chainType = hasImagesInConversation ? 'vision' : 'text';

        let chain = await getModelChain();

        // If Spotlight provided a tab-specific model override, prioritize it for THIS request only
        if (requestOptions.tabModel) {
            const { providerId, model } = requestOptions.tabModel;
            const targetIdx = chain.findIndex(c => c.providerId === providerId && c.model === model);

            if (targetIdx > 0) {
                // Move it to the front
                const target = chain.splice(targetIdx, 1)[0];
                chain.unshift(target);
            } else if (targetIdx === -1) {
                // Fallback: manually hydrate if somehow not in the chain list
                const data = await chrome.storage.local.get(['providers']);
                const provider = (data.providers || []).find(p => p.id === providerId);
                if (provider) {
                    chain.unshift({
                        model: model,
                        providerId: providerId,
                        providerType: provider.type,
                        apiKey: provider.apiKey,
                        endpoint: provider.endpoint,
                        defaultModel: provider.defaultModel
                    });
                }
            }
        }

        if (!chain || chain.length === 0) {
            port.postMessage({ error: 'No valid AI models configured. Please check Options.' });
            return;
        }

        // 3. Execution Loop
        for (let i = 0; i < chain.length; i++) {
            const config = chain[i];
            try {
                // Determine if this is the last attempt to throw fatal error if it fails
                const isLast = i === chain.length - 1;

                await executeChatRequest(config, cleanMessages, initialContext, question, port, imageData, isSpotlight, globalSettings, requestOptions, action);

                return; // Success!
            } catch (e) {
                if (e.message === 'RATE_LIMIT_EXHAUSTED') {
                    console.warn(`[Lumina] Model ${config.model} hit RATE LIMIT. Falling back to next...`);

                    if (i < chain.length - 1) {
                        // Notify UI of fallback (optional, maybe via port message types that don't break content)
                        try {
                            port.postMessage({ action: 'status_update', text: `Rate limit hit on ${config.model}. Switching to backup model...` });
                        } catch (err) { }
                        continue; // Try next model
                    }
                }

                // If we are here: either NOT a rate limit error, OR it WAS rate limit but it was the last model
                console.error(`[Lumina] Chat Chain failed at index ${i} (${config.model}):`, e);

                // If it's the last model, or non-recoverable error, we must fail
                port.postMessage({ error: e.message || "AI Request Failed" });
                return;
            }
        }
    } catch (err) {
        console.error('[Lumina] Fatal Chat Error:', err);
        port.postMessage({ error: err.message });
    }
}

// --- Handle Model Selection updates from Content Script / Popup ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'updateModelChain') {
        (async () => {
            try {
                const { type, providerId, model } = request;

                // For popup pages: write lastUsedModel so all popups sync via storage.onChanged
                // For spotlight tabs: they manage their local selection; they send
                // action:'updateSpotlightTabModel' and do NOT write lastUsedModel globally.
                await chrome.storage.local.set({
                    lastUsedModel: { providerId, model },
                    // Keep legacy fields in sync
                    ...(type === 'text' ? { provider: providerId, model: model } : { visionProvider: providerId, visionModel: model })
                });

                sendResponse({ success: true });
            } catch (e) {
                console.error('[Lumina] Failed to update last used model:', e);
                sendResponse({ success: false, error: e.message });
            }
        })();
        return true;
    }
});

// --- Handle Spotlight tab-local model selection (does NOT affect other tabs) ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'chatWithModel') {
        // Spotlight uses this to specify exactly which model to use for THIS request
        // (no storage write – model stays local to the tab)
        sendResponse({ success: true });
        return true;
    }
});

// --- Offscreen Document Management ---
let creatingOffscreenParams = null;
async function setupOffscreenDocument(path) {
    if (await chrome.offscreen.hasDocument()) {
        return;
    }

    if (creatingOffscreenParams) {
        await creatingOffscreenParams;
        return;
    }

    creatingOffscreenParams = chrome.offscreen.createDocument({
        url: path,
        reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK, chrome.offscreen.Reason.USER_MEDIA],
        justification: 'Play audio and record voice',
    });

    await creatingOffscreenParams;
    creatingOffscreenParams = null;
}

async function playNativeTTS(text, speed = 1.0) {
    return new Promise((resolve, reject) => {
        chrome.tts.getVoices((voices) => {
            let voiceName = null;
            // Prioritize Vietnamese
            const isVietnamese = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(text);

            if (isVietnamese) {
                const vnVoice = voices.find(v => v.voiceName.includes('Vietnamese') && (v.voiceName.includes('Natural') || v.voiceName.includes('Online')));
                if (vnVoice) voiceName = vnVoice.voiceName;
                else {
                    const vnAny = voices.find(v => v.voiceName.includes('Vietnamese') || v.lang === 'vi-VN');
                    if (vnAny) voiceName = vnAny.voiceName;
                }
            } else {
                // Try English Natural (GB/UK preferred as per user request)
                let enVoice = voices.find(v => v.voiceName.includes('English') && v.voiceName.includes('Natural') && (v.voiceName.includes('United Kingdom') || v.voiceName.includes('Great Britain')));

                // Fallback to US Natural if UK not found
                if (!enVoice) enVoice = voices.find(v => v.voiceName.includes('English') && v.voiceName.includes('Natural') && v.voiceName.includes('United States'));

                // Fallback to any English Natural
                if (!enVoice) enVoice = voices.find(v => v.voiceName.includes('English') && (v.voiceName.includes('Natural') || v.voiceName.includes('Online')));

                // Fallback to ANY Microsoft English (faster than Library)
                if (!enVoice) enVoice = voices.find(v => v.voiceName.includes('Microsoft') && v.voiceName.includes('English'));

                if (enVoice) voiceName = enVoice.voiceName;
            }

            if (!voiceName) {
                reject(new Error('No native natural voice'));
                return;
            }

            // Explicitly interrupt current speech using the API option instead of stop()
            chrome.tts.speak(text, {
                voiceName: voiceName,
                rate: speed,
                enqueue: false,
                onEvent: (event) => {
                    if (event.type === 'end' || event.type === 'interrupted') resolve();
                    if (event.type === 'error') reject(new Error(event.errorMessage));
                }
            });
        });
    });
}

async function playAudioOffscreen(url, speed = 1.0) {
    if (!(await chrome.offscreen.hasDocument())) {
        await chrome.offscreen.createDocument({
            url: 'pages/offscreen/offscreen.html',
            reasons: ['AUDIO_PLAYBACK'],
            justification: 'Play audio from dictionary'
        });
    }
    return await chrome.runtime.sendMessage({
        action: 'offscreen_playAudio',
        url: url,
        speed: speed
    });
}

async function playEdgeTTSOffscreen(text, speed = 1.0) {
    let voice = 'en-GB-SoniaNeural';
    // Simple language detection
    const vietnameseRegex = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
    if (vietnameseRegex.test(text)) {
        voice = 'vi-VN-HoaiMyNeural';
    }

    if (!(await chrome.offscreen.hasDocument())) {
        await chrome.offscreen.createDocument({
            url: 'pages/offscreen/offscreen.html',
            reasons: ['AUDIO_PLAYBACK'],
            justification: 'Play Edge TTS audio'
        });
    }

    return await chrome.runtime.sendMessage({
        action: 'offscreen_playEdgeTTS',
        text: text,
        voice: voice,
        speed: speed
    });
}


async function playBase64AudioOffscreen(base64Data, speed = 1.0) {
    // Check if offscreen document exists
    if (!(await chrome.offscreen.hasDocument())) {
        await chrome.offscreen.createDocument({
            url: 'pages/offscreen/offscreen.html',
            reasons: ['AUDIO_PLAYBACK'],
            justification: 'Play audio chunks from Google TTS'
        });
    }

    // Send message to offscreen document
    return await chrome.runtime.sendMessage({
        action: 'offscreen_playBase64',
        data: base64Data,
        speed: speed
    });
}

async function stopAudioOffscreen() {
    if ((await chrome.offscreen.hasDocument())) {
        return await chrome.runtime.sendMessage({
            action: 'offscreen_stopAudio'
        });
    }
}

async function stopGoogleAudioOffscreen() {
    if ((await chrome.offscreen.hasDocument())) {
        return await chrome.runtime.sendMessage({
            action: 'offscreen_stopGoogleAudio'
        });
    }
}

// Unified audio fetch — single code path for both web (content.js) and spotlight.
// Returns { type: 'oxford'|'google', chunks: [base64, ...] }
//
// Logic:
//   1-2 words  → fire Oxford + Google in parallel; use Oxford if it succeeds, else Google
//   3+ words   → try Google with full text; if 400 Bad Request → split by sentence and retry
async function fetchAudio(text, speed = 1.0) {
    if (!text) return { type: null, chunks: [] };

    let normalizedText = text.trim();

    // Clean up variables/keys so TTS reads them naturally:
    // 1. Replace underscores with spaces (e.g. policy_holder_id -> policy holder id)
    normalizedText = normalizedText.replace(/_/g, ' ');
    // 2. Pronounce common programming acronyms by spelling them out
    const acronymsToSpellOut = ['id', 'url', 'ip', 'io', 'os', 'ui', 'db', 'api', 'ssl', 'tls', 'dto', 'dao'];
    acronymsToSpellOut.forEach(acronym => {
        // Match standalone acronyms (case-insensitive), replace with space-separated uppercase letters (e.g. 'i d')
        const regex = new RegExp(`\\b${acronym}\\b`, 'gi');
        normalizedText = normalizedText.replace(regex, acronym.toUpperCase().split('').join(' '));
    });

    const wordCount = normalizedText.split(/\s+/).length;

    // --- Language Detection ---
    const detectLanguage = (t) => {
        let counts = { vietnamese: 0, chinese: 0, japanese: 0, korean: 0, cyrillic: 0, latin: 0 };
        const vietnameseRegex = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/gi;
        for (const char of t) {
            const code = char.charCodeAt(0);
            if (code >= 0x4E00 && code <= 0x9FFF) counts.chinese++;
            else if (code >= 0x3040 && code <= 0x30FF) counts.japanese++;
            else if (code >= 0xAC00 && code <= 0xD7AF) counts.korean++;
            else if (code >= 0x0400 && code <= 0x04FF) counts.cyrillic++;
            else if ((code >= 0x0041 && code <= 0x007A) || (code >= 0x00C0 && code <= 0x00FF)) counts.latin++;
        }
        const vietnameseMatches = t.match(vietnameseRegex);
        if (vietnameseMatches) counts.vietnamese = vietnameseMatches.length;
        const total = Object.values(counts).reduce((a, b) => a + b, 0);
        if (total === 0) return 'en-GB';
        const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
        const langMap = { chinese: 'zh-CN', japanese: 'ja', korean: 'ko', cyrillic: 'ru', latin: 'en-GB', vietnamese: 'vi' };
        if (dominant[0] === 'latin' && counts.vietnamese > 0 && counts.vietnamese / counts.latin > 0.15) return 'vi';
        return langMap[dominant[0]] || 'en-GB';
    };

    const lang = detectLanguage(normalizedText);

    // Helper: fetch one URL → base64 data URI. Throws on any HTTP error.
    const fetchToBase64 = async (url, opts = {}) => {
        const response = await fetch(url, opts);
        if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status });
        const contentType = response.headers.get('Content-Type');
        if (contentType && !contentType.includes('audio') && !contentType.includes('mpeg')) throw new Error('Invalid content type');
        const arrayBuffer = await response.arrayBuffer();
        if (arrayBuffer.byteLength < 100) throw new Error('Empty audio');
        const base64 = btoa(new Uint8Array(arrayBuffer).reduce((d, byte) => d + String.fromCharCode(byte), ''));
        return `data:audio/mpeg;base64,${base64}`;
    };

    // Helper: strip leading list prefixes (a., 1., (a), (1), •, -) before sending
    // to Google TTS — these cause slower synthesis and sometimes a leading pause.
    const stripListPrefix = (q) =>
        q.replace(/^\s*(?:[a-zA-Z\d]{1,2}\)|[a-zA-Z\d]{1,2}\.|[•\-–—])\s+/, '').trim();

    // Helper: build Google TTS URL
    const googleUrl = (q) => {
        const cleaned = stripListPrefix(q);
        return `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(cleaned)}&tl=${lang}&total=1&idx=0&textlen=${cleaned.length}&client=tw-ob&prev=input&ttsspeed=${speed}`;
    };

    // Helper: split text into chunks that are short enough for Google TTS (~200 chars each).
    // Level 1: sentence boundaries (.?!)
    // Level 2: clause boundaries (,;–—) for chunks still too long
    // Level 3: fixed word-count split for chunks that have no punctuation at all
    const MAX_CHUNK_CHARS = 200;
    const splitIntoChunks = (text) => {
        // Level 1: sentence split
        const sentences = text.match(/[^.?!]+[.?!]+/g) || [];
        // Include trailing text not ending in sentence punctuation
        const lastSentenceEnd = sentences.reduce((acc, s) => acc + s.length, 0);
        if (lastSentenceEnd < text.length) sentences.push(text.slice(lastSentenceEnd).trim());
        const level1 = sentences.map(s => s.trim()).filter(s => s.replace(/[.?!,;:]/g, '').trim().length >= 2);
        const base = level1.length >= 2 ? level1 : [text];

        // Level 2: for chunks still too long, split on clause delimiters
        const level2 = [];
        for (const chunk of base) {
            if (chunk.length <= MAX_CHUNK_CHARS) { level2.push(chunk); continue; }
            const clauses = chunk.split(/(?<=[,;–—])\s+/);
            if (clauses.length >= 2) {
                // Group clauses so each group stays under MAX_CHUNK_CHARS
                let current = '';
                for (const clause of clauses) {
                    if (current && (current + ' ' + clause).length > MAX_CHUNK_CHARS) {
                        level2.push(current.trim());
                        current = clause;
                    } else {
                        current = current ? current + ' ' + clause : clause;
                    }
                }
                if (current.trim()) level2.push(current.trim());
            } else {
                level2.push(chunk);
            }
        }

        // Level 3: for any chunk still too long, split every N words
        const WORDS_PER_CHUNK = 25;
        const final = [];
        for (const chunk of level2) {
            if (chunk.length <= MAX_CHUNK_CHARS) { final.push(chunk); continue; }
            const words = chunk.split(/\s+/);
            for (let i = 0; i < words.length; i += WORDS_PER_CHUNK) {
                final.push(words.slice(i, i + WORDS_PER_CHUNK).join(' '));
            }
        }
        return final.filter(Boolean);
    };

    // Helper: fetch Google with full text first; if 400, chunk and retry
    const fetchGoogle = async () => {
        try {
            const data = await fetchToBase64(googleUrl(normalizedText), { referrerPolicy: 'no-referrer' });
            return [data];
        } catch (e) {
            if (e.status !== 400) return []; // unexpected error (network, etc.)
        }
        // 400 → split into digestible chunks and fetch in parallel
        const chunks = splitIntoChunks(normalizedText);
        const results = new Array(chunks.length).fill(null);
        await Promise.all(chunks.map(async (chunk, i) => {
            try { results[i] = await fetchToBase64(googleUrl(chunk), { referrerPolicy: 'no-referrer' }); }
            catch (e) { results[i] = null; }
        }));
        return results.filter(Boolean);
    };

    if (wordCount <= 2) {
        // Fire Oxford and Google simultaneously; prefer Oxford if it returns audio
        const oxfordUrl = `https://ssl.gstatic.com/dictionary/static/sounds/oxford/${normalizedText.toLowerCase()}--_gb_1.mp3`;
        const oxfordPromise = fetchToBase64(oxfordUrl).catch(() => null);
        const googlePromise = fetchGoogle(); // already running in parallel

        const oxfordData = await oxfordPromise;
        if (oxfordData) {
            return { type: 'oxford', chunks: [oxfordData] };
        }
        // Oxford failed (404) — Google is already done or nearly done
        const googleChunks = await googlePromise;
        return { type: 'google', chunks: googleChunks };
    }

    // 3+ words: Google only
    const googleChunks = await fetchGoogle();
    return { type: 'google', chunks: googleChunks };
}

// Handler for playBase64 request from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'playBase64Audio') {
        playBase64AudioOffscreen(request.base64, request.speed)
            .then(res => sendResponse(res))
            .catch(err => sendResponse({ error: err.message }));
        return true; // async
    }

    if (request.action === 'stopGoogleOffscreenAudio') {
        // CRITICAL: must await the actual offscreen stop and respond only after
        // it's done, otherwise a race causes the stop message to arrive AFTER
        // new audio starts playing in the offscreen document — killing new audio.
        stopGoogleAudioOffscreen()
            .then(res => sendResponse(res || { success: true }))
            .catch(() => sendResponse({ success: true }));
        return true; // keep channel open for async response
    }

    if (request.action === 'stopOffscreenAudio') {
        stopAudioOffscreen();
        return false;
    }

    if (request.action === 'fetchAudio') {
        fetchAudio(request.text, request.speed || 1.0)
            .then(result => sendResponse(result))
            .catch(() => sendResponse({ type: null, chunks: [] }));
        return true; // async
    }


});

// --- Injection Helpers and Storage Sync ---

function injectIframeCss(tabId, css, frameUrl) {
    if (!tabId || !frameUrl) return;
    let frameHost;
    try { frameHost = new URL(frameUrl).hostname; } catch(e) { return; }
    chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        func: (cssText, host) => {
            const current = window.location.hostname;
            if (current !== host && !current.endsWith('.' + host) && !host.endsWith('.' + current)) return;

            // Prepend a default fix for scroll chaining and layout jumps (common on Google AI / Search)
            // Targeting * ensures grid containers with their own overflow don't trap the scroll.
            const defaultFix = `
                html, body { overflow-anchor: none !important; }
                * { overscroll-behavior: auto !important; }
            `;

            const force = (raw) => (raw || '').replace(/([a-zA-Z-]+)\s*:\s*([^;!}{][^;!}{]*?)(\s*!important)?\s*([;}])/g, (_, p, v, _i, e) => `${p}: ${v.trim()} !important${e}`);
            const forced = defaultFix + force(cssText);

            if (document.adoptedStyleSheets !== undefined) {
                try {
                    const sheet = new CSSStyleSheet();
                    sheet.replaceSync(forced);
                    document.adoptedStyleSheets = [...document.adoptedStyleSheets.filter(s => !s.__lumina__), Object.assign(sheet, { __lumina__: true })];
                    return;
                } catch(e) {}
            }
            let style = document.getElementById('__lumina_source_css__');
            if (!style) { style = document.createElement('style'); style.id = '__lumina_source_css__'; document.head.appendChild(style); }
            style.textContent = forced;
        },
        args: [css || '', frameHost]
    }).catch(() => {});
}

function injectIframeZoom(tabId, zoom, frameUrl) {
    if (!tabId || !frameUrl) return;
    let frameHost;
    try { frameHost = new URL(frameUrl).hostname; } catch(e) { return; }
    const zoomPct = Math.min(200, Math.max(10, zoom || 100));
    chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        func: (z, host) => {
            const current = window.location.hostname;
            if (current !== host && !current.endsWith('.' + host) && !host.endsWith('.' + current)) return;

            const html = document.documentElement;
            const ratio = z / 100;

            // Reset previously applied styles
            html.style.removeProperty('zoom');
            html.style.removeProperty('transform');
            html.style.removeProperty('transform-origin');
            html.style.removeProperty('width');
            html.style.removeProperty('height');

            if (z === 100) return;

            // Prefer 'zoom' as it handles layout better for scrolling
            html.style.setProperty('zoom', String(ratio), 'important');

            // Fallback to transform scale if zoom isn't effectively applied or causes issues
            const actualZoom = getComputedStyle(html).zoom;
            if (!actualZoom || actualZoom === '1' || actualZoom === 'normal') {
                html.style.setProperty('transform', `scale(${ratio})`, 'important');
                html.style.setProperty('transform-origin', 'top left', 'important');
                
                // When using transform:scale, we need to compensate dimensions
                html.style.setProperty('width', (100 / ratio) + '%', 'important');
                html.style.setProperty('height', (100 / ratio) + '%', 'important');
            }
        },
        args: [zoomPct, frameHost]
    }).catch(() => {});
}

function injectIframeSelector(tabId, selector, frameUrl) {
    if (!tabId || !selector || !frameUrl) return;
    let frameHost;
    try { frameHost = new URL(frameUrl).hostname; } catch(e) { return; }
    chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        func: (sel, host) => {
            const current = window.location.hostname;
            if (current !== host && !current.endsWith('.' + host) && !host.endsWith('.' + current)) return;

            const el = document.querySelector(sel);
            if (!el) return;

            // Mark the target and all its ancestors
            let node = el;
            while (node && node.nodeType === 1) {
                node.classList.add('lumina-selector-path');
                node = node.parentElement;
            }

            const styleId = '__lumina_selector_iso__';
            let style = document.getElementById(styleId);
            if (!style) {
                style = document.createElement('style');
                style.id = styleId;
                document.head.appendChild(style);
            }

            // High-precision isolation:
            // 1. Hide siblings of any element on the path to our target.
            // 2. DO NOT force 'display: block' on ancestors, to preserve Grid/Flex context.
            // 3. Ensure ancestors don't clip the content.
            style.textContent = `
                html, body {
                    margin: 0 !important;
                    padding: 0 !important;
                    overflow: auto !important;
                    height: auto !important;
                    background: #fff !important;
                }
                
                /* Hide siblings of the target path */
                body > *:not(.lumina-selector-path),
                .lumina-selector-path > *:not(.lumina-selector-path) {
                    display: none !important;
                }

                /* Ensure path visibility and reset constraints */
                .lumina-selector-path {
                    visibility: visible !important;
                    opacity: 1 !important;
                    position: static !important;
                    height: auto !important;
                    min-height: 0 !important;
                    max-height: none !important;
                    overflow: visible !important;
                }

                /* If the target is a grid/flex container, keep it functional */
                ${sel}.lumina-selector-path {
                    display: revert !important;
                }
            `;
        },
        args: [selector, frameHost]
    }).catch(() => {});
}

// Watch for shortcut/source changes and sync to active iFrames
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.customSources) {
        const newSources = changes.customSources.newValue || [];
        const forceImportant = (rawCss) => (rawCss || '').replace(
            /([a-zA-Z-]+)\s*:\s*([^;!}{][^;!}{]*?)(\s*!important)?\s*([;}])/g,
            (_, prop, val, _imp, end) => `${prop}: ${val.trim()} !important${end}`
        );

        for (const [injKey, data] of pendingInjections.entries()) {
            const parts = injKey.split('_');
            const tabId = parseInt(parts[0]);
            const frameUrl = parts.slice(1).join('_');

            const source = newSources.find(s => {
                const base = (s.url || '').split('{{str}}')[0];
                return base && frameUrl.startsWith(base);
            });

            if (source) {
                data.css = source.css || '';
                data.cssForced = forceImportant(source.css || '');
                data.selector = source.selector || '';
                data.zoom = source.zoom || 100;

                // Push new styles immediately to all matching frames in that tab
                injectIframeCss(tabId, source.css, frameUrl);
                injectIframeZoom(tabId, source.zoom, frameUrl);
                if (source.selector) injectIframeSelector(tabId, source.selector, frameUrl);
            }
        }
    }
});
