
importScripts('../lib/marked.min.js');
importScripts('../lib/utils/constants.js');
importScripts('../lib/utils/memory.js');
importScripts('../lib/utils/auth.js');


// Default settings
const DEFAULTS = LUMINA_DEFAULTS;

// Set session access level so content scripts can see it
chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' }).catch(() => { });

// Side Panel State Tracking
const sidePanelPorts = new Map(); // windowId -> chrome.runtime.Port

// On startup, we might already have open panels (from a previous worker session)
chrome.storage.session.get(['open_sidepanel_windows'], (result) => {
    if (result.open_sidepanel_windows) {
        // We restore the keys into the Map. The value will be null until the panel re-connects,
        // but .has(windowId) will correctly return true, allowing toggling to work.
        result.open_sidepanel_windows.forEach(id => {
            if (!sidePanelPorts.has(id)) {
                sidePanelPorts.set(id, null);
            }
        });
    }
});

// Persist the list of open sidepanels into session storage for state stability
function updateOpenSidePanelsSession() {
    const windowIds = Array.from(sidePanelPorts.keys());
    chrome.storage.session.set({ open_sidepanel_windows: windowIds });
}

chrome.runtime.onConnect.addListener((port) => {
    if (port.name === 'lumina-sidepanel') {
        let connectedWindowId = null;
        
        port.onMessage.addListener((msg) => {
            if (msg.windowId) {
                // If this window already had a port, clear it
                if (connectedWindowId && connectedWindowId !== msg.windowId) {
                    sidePanelPorts.delete(connectedWindowId);
                }
                
                connectedWindowId = msg.windowId;
                sidePanelPorts.set(connectedWindowId, port);
                updateOpenSidePanelsSession();
            }
        });

        port.onDisconnect.addListener(() => {
            if (connectedWindowId && sidePanelPorts.get(connectedWindowId) === port) {
                sidePanelPorts.delete(connectedWindowId);
                updateOpenSidePanelsSession();
            }
        });
    }
});

// Clean up per-tab session tracking
chrome.tabs.onRemoved.addListener((tabId) => {
    chrome.storage.local.get(['lumina_tab_sessions'], result => {
        const tabSessions = result.lumina_tab_sessions || {};
        if (tabSessions[tabId]) {
            delete tabSessions[tabId];
            chrome.storage.local.set({ lumina_tab_sessions: tabSessions });
        }
    });
});

async function toggleSidePanel(windowId) {
    if (!windowId) return;
    if (sidePanelPorts.has(windowId)) {
        // Clear tracked state immediately so a stale port/session entry does not block the next open toggle.
        sidePanelPorts.delete(windowId);
        updateOpenSidePanelsSession();

        if (chrome.sidePanel.close) {
            chrome.sidePanel.close({ windowId }).catch(() => { });
        } else {
            chrome.sidePanel.setOptions({ windowId, enabled: false }, () => {
                chrome.sidePanel.setOptions({
                    windowId,
                    enabled: true,
                    path: 'pages/spotlight/spotlight.html?sidepanel=1'
                });
            });
        }
    } else {
        chrome.sidePanel.open({ windowId }).catch(() => { });
    }
}


// Registration of content scripts is handled via manifest.json for regular websites.
// Direct injection is ONLY needed for existing tabs during installation, which should be done via scripting.executeScript instead of persistent registration.
async function checkAndRegisterScripts() {
    // This function is now deprecated to avoid duplicate execution with manifest.json
}

// Removing immediate call to avoid duplicates
// checkAndRegisterScripts();

// Display Mode Management
function updateDisplayMode(mode) {
    if (!chrome.sidePanel) return;

    // Always keep Side Panel configured for opens
    chrome.sidePanel.setOptions({
        path: 'pages/spotlight/spotlight.html?sidepanel=1',
        enabled: true
    });

    // CRITICAL: Always keep extension icon as Options Popup (as requested)
    // Never allow icon click to open Side Panel automatically.
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(console.error);
    chrome.action.setPopup({ popup: 'pages/options/options.html' });
}

// Initial setup
chrome.storage.local.get(['displayMode'], (result) => {
    updateDisplayMode(result.displayMode || 'popup');
});

// Storage change listener
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.displayMode) {
        updateDisplayMode(changes.displayMode.newValue || 'popup');
    }
});

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

function isGeminiOpenAIEndpoint(endpoint) {
    return typeof endpoint === 'string' && endpoint.includes('generativelanguage.googleapis.com/v1beta/openai');
}

function normalizeOpenAICompatibleEndpoint(endpoint, targetPath) {
    if (typeof endpoint !== 'string') return endpoint;

    const trimmed = endpoint.trim().replace(/\/+$/, '');
    if (!trimmed) return trimmed;

    const knownSuffixes = ['/chat/completions', '/models', '/audio/transcriptions'];
    for (const suffix of knownSuffixes) {
        if (trimmed.endsWith(suffix)) {
            return trimmed.slice(0, -suffix.length) + targetPath;
        }
    }

    if (trimmed.endsWith('/v1') || trimmed.endsWith('/v1beta/openai') || trimmed.endsWith('/openai/v1')) {
        return `${trimmed}${targetPath}`;
    }

    return `${trimmed}${targetPath}`;
}

/**
 * Optimizes a context string by collapsing redundant newlines and whitespace.
 * This maximizes token efficiency across all model providers.
 */
function optimizeContextString(text) {
    if (!text || typeof text !== 'string') return '';
    return text
        .replace(/\r\n/g, '\n')           // Normalize newlines
        .replace(/\n{3,}/g, '\n\n')      // Collapse 3+ newlines to 2
        .replace(/[ \t]{2,}/g, ' ')      // Collapse multiple spaces/tabs to 1
        .trim();
}

function isGeminiModel(modelName) {
    const m = String(modelName || '').toLowerCase();
    return m.includes('gemini') || m.includes('google');
}

function buildChatSystemInstruction(reasoningMode = false) {
    let instruction = `<role>
You are Lumina, a helpful and intelligent AI assistant.
</role>

<constraints>
1. Be direct, accurate, and practical.
2. If the user asks for concise output, keep the response short.
3. For time-sensitive queries, use the provided current time context. Remember the year is 2026.
4. If context is provided by the user, prioritize that context and avoid unsupported claims.
</constraints>

<output_format>
Use clear markdown with concise sections only when needed.
</output_format>`;

    if (reasoningMode) {
        instruction += `

<reasoning_instructions>
1. **Plan first**: Before answering, create a mental plan for how to address the user's request.
2. **Step-by-step**: Break down complex problems into smaller, manageable steps.
3. **Self-critique**: Review your own reasoning as you go to catch errors or biases.
4. **Final check**: Ensure the final answer matches all user constraints and is factual.
</reasoning_instructions>`;
    }

    return instruction;
}

function buildProofreadSystemPrompt() {
    return `<role>
You are an expert editor and text refinement tool.
</role>

<task>
Refine the provided text. If the user provides specific feedback (e.g., "[USER COMMENTS]" or "[Iteration Instruction]"), apply those changes carefully to the original draft. 
Return ONLY the final corrected/refined version.
</task>

<constraints>
1. Output ONLY the refined text. No explanations, no conversation, no headers like "[REVISED VERSION]".
2. If the input is not English, translate it to natural, professional English.
3. Keep the original tone and intent unless specifically asked to change it.
4. If no specific instructions/comments are provided, simply correct all grammar, spelling, and style errors.
5. Match original capitalization and punctuation where appropriate.
</constraints>`;
}

function buildDictionarySystemPrompt(word) {
    return `You are a world-class lexicographer and expert linguist for Cambridge and Oxford University Press.
Provide a professional, high-fidelity dictionary entry for the English word or phrase: "${word}".

### Structure Guidelines (Follow Cambridge Standards):
1. **Multiple Entries**: If the word has multiple parts of speech (e.g., "run" as verb and noun), provide distinct entries for each.
2. **Senses & Indicators**: Group definitions into logical "Senses" with a capitalized, concise "Indicator" descriptor (e.g., MOVEMENT, ANALYTICAL INSTRUMENT). Use spaces, NOT underscores.
3. **Definitions**: Clear, academic English definitions.
   - **Phonetic Standards (MANDATORY)**:
     - **UK (Received Pronunciation)**: Use /e/ for the "short e" sound (e.g., manifest, chemical, resin). Use /ɒ/ for "short o" (hot). Use /ə/ or /ɪ/ for unstressed vowels. NEVER use /ɛ/ for UK English.
     - **US (General American)**: Use /ɛ/ for the "short e" sound. Use /ɑ/ for "short o". Use /ə/ or /ʌ/ as appropriate.
     - **Rhoticity**: Ensure UK is non-rhotic (e.g., /ə/ or /ɔː/ instead of /ɚ/ or /ɔːr/) and US is rhotic.
   - **Self-Correction Logic**: Before outputting the JSON, mentally verify: "Does the UK IPA use /e/? Does the US IPA use /ɛ/? Are they distinct strings?"
   - **Examples of Regional Variance expected**:
     - "chemicals": UK: /ˈkem.ɪ.kəlz/, US: /ˈkɛm.ɪ.kəlz/
     - "manifest": UK: /ˈmæn.ɪ.fest/, US: /ˈmæn.ə.fɛst/
     - "water": UK: /ˈwɔː.tər/, US: /ˈwɑː.t̬ɚ/
     - "schedule": UK: /ˈʃed.juːl/, US: /ˈskedʒ.uːl/
     - "can't": UK: /kɑːnt/, US: /kænt/

### JSON Schema (STRICT):
{
    "dialect_verification": "Self-verify rules: UK MUST use /e/ (not /ɛ/). US MUST use /ɛ/. Check rhoticity differences (water UK: /r/ null, US: /r/ present).",
    "word": "${word}",
    "entries": [
        {
            "pos": "noun/verb/adjective/etc.",
            "uk": { "ipa": "...", "audio": "" },
            "us": { "ipa": "...", "audio": "" },
            "senses": [
                {
                    "indicator": "UPPERCASE INDICATOR",
                    "definitions": [
                        { "meaning": "English definition" }
                    ]
                }
            ]
        }
    ]
}

- **Examples of Regional Variance expected**:
  - "headspace": UK: /ˈhed.speɪs/, US: /ˈhɛd.speɪs/
  - "chemicals": UK: /ˈkem.ɪ.kəlz/, US: /ˈkɛm.ɪ.kəlz/
  - "manifest": UK: /ˈmæn.ɪ.fest/, US: /ˈmæn.ə.fɛst/
  - "water": UK: /ˈwɔː.tər/, US: /ˈwɑː.t̬ɚ/
  - "schedule": UK: /ˈʃed.juːl/, US: /ˈskedʒ.uːl/

- Output ONLY valid JSON starting with { and ending with }.
- No markdown wrappers, no explanations outside the JSON.`;
}

// Get Gemini API key
async function getGeminiApiKey() {
    const data = await chrome.storage.local.get(['providers']);
    const providers = data.providers || [];
    const geminiProvider = providers.find(p => isGeminiOpenAIEndpoint(p.endpoint) && p.apiKey);
    if (geminiProvider && geminiProvider.apiKey) {
        const keys = geminiProvider.apiKey.split(',').map(k => k.trim()).filter(k => k);
        return keys[0] || null;
    }
    return null;
}

// Model Chain Management
function detectMediaType(item) {
    if (!item) return null;
    if (typeof item === 'string') {
        const v = item.toLowerCase();
        if (v.startsWith('data:video/')) return 'video';
        if (v.startsWith('data:application/pdf')) return 'pdf';
        if (v.startsWith('data:image/')) return 'image';
        if (/\.(mp4|mov|webm|mkv)(\?|$)/i.test(v)) return 'video';
        if (/\.pdf(\?|$)/i.test(v)) return 'pdf';
        return 'image';
    }
    if (typeof item === 'object') {
        const mimeType = (item.mimeType || '').toLowerCase();
        const dataUrl = (item.dataUrl || '').toLowerCase();
        const previewUrl = (item.previewUrl || '').toLowerCase();
        if (mimeType.startsWith('video/') || dataUrl.startsWith('data:video/')) return 'video';
        if (mimeType.includes('pdf') || dataUrl.startsWith('data:application/pdf')) return 'pdf';
        if (mimeType.startsWith('image/') || dataUrl.startsWith('data:image/')) return 'image';
        if (/\.(mp4|mov|webm|mkv)(\?|$)/i.test(previewUrl)) return 'video';
        if (/\.pdf(\?|$)/i.test(previewUrl)) return 'pdf';
        return 'image';
    }
    return null;
}

function inferGeminiMediaResolution(msgs, currentImageData, currentQuestion) {
    const allAttachments = [];
    for (const msg of (msgs || [])) {
        const files = msg?.files || msg?.images;
        if (Array.isArray(files)) allAttachments.push(...files);
    }
    if (Array.isArray(currentImageData)) allAttachments.push(...currentImageData);
    else if (currentImageData) allAttachments.push(currentImageData);

    let hasImage = false, hasPdf = false, hasVideo = false;
    for (const item of allAttachments) {
        const mediaType = detectMediaType(item);
        if (mediaType === 'image') hasImage = true;
        if (mediaType === 'pdf') hasPdf = true;
        if (mediaType === 'video') hasVideo = true;
    }
    const textHeavyVideoRegex = /\b(ocr|text-heavy|subtitle|subtitles|caption|captions|read text|small text|tiny text|screen text|nhan dien chu|nhận diện chữ|doc chu|đọc chữ|phu de|phụ đề)\b/i;
    const isTextHeavyVideo = textHeavyVideoRegex.test(currentQuestion || '');
    if (hasVideo && isTextHeavyVideo) return 'MEDIA_RESOLUTION_HIGH';
    if (hasImage) return 'MEDIA_RESOLUTION_HIGH';
    if (hasPdf) return 'MEDIA_RESOLUTION_MEDIUM';
    if (hasVideo) return 'MEDIA_RESOLUTION_LOW';
    return null;
}

const SUPPORTED_MIME_TYPES = new Set([
    'image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif', 'image/gif',
    'video/mp4', 'video/mpeg', 'video/mov', 'video/quicktime', 'video/avi', 'video/x-flv', 'video/flv', 'video/mpg', 'video/webm', 'video/wmv', 'video/3gpp',
    'audio/wav', 'audio/mp3', 'audio/aiff', 'audio/aac', 'audio/ogg', 'audio/flac', 'audio/mpeg', 'audio/m4a',
    'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain', 'text/html', 'text/css', 'text/javascript', 'text/csv', 'text/markdown',
    'text/x-python', 'text/x-java', 'text/x-c', 'text/x-cpp', 'text/x-shellscript', 'application/json', 'application/xml'
]);

const MIME_ALIASES = {
    'application/javascript': 'text/javascript', 'text/x-python-script': 'text/x-python', 'application/x-javascript': 'text/javascript'
};

function normalizeMimeType(mimeType) {
    const mt = String(mimeType || '').toLowerCase().trim();
    return MIME_ALIASES[mt] || mt;
}

function isSupportedAttachmentMime(mimeType) {
    const mt = normalizeMimeType(mimeType);
    return !!mt && SUPPORTED_MIME_TYPES.has(mt);
}

function isTextAttachmentMime(mimeType) {
    const mt = normalizeMimeType(mimeType);
    return mt.startsWith('text/') || mt === 'application/json' || mt === 'application/xml';
}

function getBase64FromAttachment(item) {
    if (!item || typeof item !== 'object') return '';
    if (item.data) return item.data;
    if (item.dataUrl) {
        const matches = item.dataUrl.match(/^data:([^;]+);base64,(.+)$/i);
        if (matches) return matches[2];
    }
    return '';
}

function decodeBase64Utf8(base64) {
    if (!base64) return '';
    try {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return new TextDecoder('utf-8').decode(bytes);
    } catch (_) { return ''; }
}

function processAttachments(attachments) {
    const parts = [];
    const unsupported = [];
    if (!attachments || !Array.isArray(attachments)) return { parts, unsupported };
    for (const item of attachments) {
        if (typeof item === 'string') {
            if (item.startsWith('data:text/')) {
                const matches = item.match(/^data:([^;]+);base64,(.+)$/i);
                const decoded = matches ? decodeBase64Utf8(matches[2]) : '';
                if (decoded) parts.push({ type: "text", text: `[Attached text file]\n${decoded.slice(0, 12000)}` });
            } else { parts.push({ type: "image_url", image_url: { url: item, detail: "auto" } }); }
        } else if (typeof item === 'object') {
            const mimeType = normalizeMimeType(item.mimeType || '');
            const itemName = item.name || 'Unnamed file';
            if (mimeType && !isSupportedAttachmentMime(mimeType)) { unsupported.push({ name: itemName, mimeType }); continue; }
            if (isTextAttachmentMime(mimeType)) {
                const textContent = decodeBase64Utf8(getBase64FromAttachment(item));
                if (textContent) parts.push({ type: "text", text: `[Attached file: ${itemName} (${mimeType})]\n${textContent.slice(0, 12000)}` });
                continue;
            }
            if (mimeType.startsWith('audio/')) {
                let base64Data = item.data;
                if (!base64Data && item.dataUrl) {
                    const matches = item.dataUrl.match(/^data:(.+?);base64,(.+)$/);
                    if (matches) base64Data = matches[2];
                }
                if (base64Data) {
                    let format = mimeType.split('/')[1] || 'wav';
                    if (format === 'mpeg') format = 'mp3';
                    parts.push({ type: "input_audio", input_audio: { data: base64Data, format } });
                }
            } else {
                let url = item.dataUrl || item.previewUrl;
                if (!url && mimeType && item.data) url = `data:${mimeType};base64,${item.data}`;
                if (url) parts.push({ type: "image_url", image_url: { url, detail: item.detail || "auto" } });
            }
        }
    }
    return { parts, unsupported };
}

async function buildApiPayload(msgs, currentQ, sysPrompt, activeKey, params) {
    const { model, endpoint, temperature, topP, parsedCustomParams, normalizedThinkingLevel, isGemini25Model, reasoningMode, imageData, maxTokens = null, isStreaming = true } = params;
    const openaiMessages = [{ role: 'system', content: sysPrompt }];
    for (const msg of msgs) {
        const attachments = msg.files || msg.images;
        if (attachments && attachments.length > 0) {
            const parts = [];
            if (msg.text) parts.push({ type: "text", text: msg.text });
            const processed = processAttachments(attachments);
            parts.push(...processed.parts);
            if (processed.unsupported.length > 0) {
                parts.push({ type: "text", text: `[Note] Skipped unsupported attachments: ${processed.unsupported.map(i => i.name).join(', ')}` });
            }
            openaiMessages.push({ role: msg.role === 'model' ? 'assistant' : 'user', content: parts });
        } else {
            openaiMessages.push({ role: msg.role === 'model' ? 'assistant' : 'user', content: msg.text });
        }
    }

    if (imageData && imageData.length > 0) {
        const parts = [{ type: "text", text: currentQ }];
        const currentAttachments = Array.isArray(imageData) ? imageData : [imageData];
        const processed = processAttachments(currentAttachments);
        parts.push(...processed.parts);
        openaiMessages.push({ role: 'user', content: parts });
    } else {
        openaiMessages.push({ role: 'user', content: currentQ });
    }

    const openaiBody = {
        model, messages: openaiMessages, temperature, top_p: topP,
        stream: isStreaming,
        ...(isStreaming ? { stream_options: { include_usage: true } } : {}),
        ...parsedCustomParams
    };

    // Respect explicit maxTokens from request/model params unless custom token fields are already set.
    const hasCustomTokenLimit = Object.prototype.hasOwnProperty.call(openaiBody, 'max_tokens')
        || Object.prototype.hasOwnProperty.call(openaiBody, 'max_completion_tokens')
        || Object.prototype.hasOwnProperty.call(openaiBody, 'max_output_tokens');
    if (!hasCustomTokenLimit && Number.isFinite(maxTokens) && maxTokens > 0) {
        openaiBody.max_tokens = maxTokens;
    }

    if (normalizedThinkingLevel === 'none') {
        if (isGeminiOpenAIEndpoint(endpoint) && isGemini25Model) openaiBody.reasoning_effort = 'none';
    } else if (normalizedThinkingLevel) {
        openaiBody.reasoning_effort = normalizedThinkingLevel;
    } else if (isGeminiOpenAIEndpoint(endpoint) && isGemini25Model) {
        openaiBody.reasoning_effort = 'none';
    }

    if (isGeminiOpenAIEndpoint(endpoint)) {
        if (reasoningMode) {
            if (!openaiBody.extra_body) openaiBody.extra_body = {};
            if (!openaiBody.extra_body.google) openaiBody.extra_body.google = {};
            openaiBody.extra_body.google.thinking_config = { include_thoughts: true };
        }
        const isGroundingSupported = /gemini-[3-9]/i.test(model);
    }

    return { url: normalizeOpenAICompatibleEndpoint(endpoint, '/chat/completions'), body: openaiBody };
}

async function getModelChain(type = 'text') {
    const data = await chrome.storage.local.get(['modelChains', 'providers', 'provider', 'model', 'lastUsedModel', 'dictProvider', 'dictModel']);

    // 1. Build the full list from modelChains or single selection
    let chain = [];
    if (data.modelChains && data.modelChains[type] && data.modelChains[type].length > 0) {
        chain = [...data.modelChains[type]];
    } else if (type === 'dictionary' && data.dictProvider && data.dictModel) {
        chain = [{ providerId: data.dictProvider, model: data.dictModel }];
    } else {
        // Fallback to text chain if specific chain not found
        if (data.modelChains && data.modelChains['text'] && data.modelChains['text'].length > 0) {
            chain = [...data.modelChains['text']];
        } else {
            // Legacy fallback
            chain = [{ providerId: data.provider, model: data.model }];
        }
    }

    // 2. If the user has a lastUsedModel preference, move that entry to the front (only for generic text tasks)
    if (type === 'text' && data.lastUsedModel && data.lastUsedModel.model) {
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
    } catch (e) { }

    // Helper: detect rate-limit or request-too-large from a response
    const isRateLimitOrTooLarge = async (response) => {
        if (response.status === 429 || response.status === 503) return true;
        if (response.status === 400 || response.status === 413) {
            try {
                const clone = response.clone();
                const text = await clone.text();
                if (/Request too large|tokens per minute|TPM|context_length_exceeded/i.test(text)) {
                    return true;
                }
            } catch (e) { }
        }
        return false;
    };

    // 3. Try rotating through the keys
    for (let attempts = 0; attempts < keys.length; attempts++) {
        const currentIndex = (activeIndex + attempts) % keys.length;
        const currentKey = keys[currentIndex];

        try {
            const response = await requestFn(currentKey);

            if (await isRateLimitOrTooLarge(response)) {
                console.warn(`[Lumina] Key ${currentIndex} hit rate limit or request-too-large. Rotating to next key.`);
                // Continue loop to try next key
            } else {
                // Success - save this as the last successful index and return
                chrome.storage.local.set({
                    [groupKey]: { index: currentIndex, date: today }
                });
                return response;
            }
        } catch (err) {
            console.error(`[Lumina] Request failed with key ${currentIndex}:`, err);
            // Continue loop to try next key
        }
    }

    throw new Error("All API keys failed or were rate limited in this cycle.");
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

async function executeChatRequest(config, messages, initialContext, question, port, imageData = null, isSpotlight = false, globalSettings = {}, requestOptions = {}, action = 'chat_stream', systemOverride = null) {
    const { model, providerType: currentProvider, endpoint, apiKey, defaultModel } = config;
    const streamLogPrefix = `[Lumina BG][${action}]`;

    // Per-model params from global settings
    const advancedParamsByModel = globalSettings.advancedParamsByModel || {};

    // Try composite key first (provider:model), then legacy (model)
    const providerId = config.providerId;
    const compositeKey = providerId ? `${providerId}:${model}` : model;

    const modelParams = advancedParamsByModel[compositeKey] || advancedParamsByModel[model] || {};
    const temperature = requestOptions.temperature ?? modelParams.temperature ?? 1.0;
    const topP = modelParams.topP ?? 1.0;
    const maxTokens = requestOptions.maxTokens ?? modelParams.maxTokens ?? null;
    const thinkingLevel = modelParams.thinkingLevel || null;
    const customParams = modelParams.customParams || {};
    const responseLanguage = globalSettings.responseLanguage;

    // Parse custom params
    let parsedCustomParams = {};
    if (customParams) {
        if (typeof customParams === 'object') {
            parsedCustomParams = customParams;
        } else if (typeof customParams === 'string') {
            try { parsedCustomParams = JSON.parse(customParams); } catch (e) { }
        }
    }

    const hasFiles = imageData && (Array.isArray(imageData) && imageData.length > 0);
    const normalizedModelName = (model || '').toLowerCase();
    const isGemini25Model = /gemini-2\.5/i.test(normalizedModelName);
    const normalizedThinkingLevel = (typeof thinkingLevel === 'string' ? thinkingLevel.trim().toLowerCase() : '');

    // --- TRACK USAGE ---
    if (model) {
        incrementModelUsage(model);
    }
    // -------------------
    if (!apiKey && !endpoint.includes('localhost') && !endpoint.includes('127.0.0.1')) {
        throw new Error(`No API Key for provider type: ${currentProvider}`);
    }

    const keys = getKeysArray(apiKey);

    const reasoningMode = !!globalSettings.reasoningMode;
    let systemInstruction = systemOverride || buildChatSystemInstruction(reasoningMode);

    if (action === 'proofread') {
        systemInstruction = systemOverride || buildProofreadSystemPrompt();
    }

    console.log(streamLogPrefix, 'start', {
        model,
        provider: currentProvider,
        endpoint,
        messageCount: messages?.length || 0,
        hasContext: !!(initialContext && initialContext.trim().length > 0),
        questionLength: question ? question.length : 0,
        maxTokens,
        hasFiles,
        isSpotlight
    });

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
    let augmentedQuestion = question;

    if (action === 'proofread' && !systemOverride) {
        // Wrap the user question in text tags for proofreading/translation
        augmentedQuestion = `Correct/translate this text:\n<text>${question}</text>`;
    }

    // Inject Page Context if available - Appended to the current question for better freshness & context switching
    // This is done last to ensure it's not overwritten by specialized action logic
    if (initialContext && initialContext.trim().length > 0) {
        const processedContext = optimizeContextString(initialContext);
        augmentedQuestion = `${processedContext}\n\n---\n\n${augmentedQuestion}`;
    }

    // Parameters for payload builder
    const payloadParams = {
        model,
        endpoint,
        temperature,
        topP,
        maxTokens,
        parsedCustomParams,
        normalizedThinkingLevel,
        isGemini25Model,
        reasoningMode,
        imageData
    };

    let response = await fetchWithRotation(keys, async (key) => {
        const payload = await buildApiPayload(fullMessages, augmentedQuestion, systemInstruction, key, payloadParams);
        return fetch(payload.url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(key ? { 'Authorization': `Bearer ${key}` } : {})
            },
            body: JSON.stringify(payload.body)
        });
    }, requestOptions);

    if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
            errorData = JSON.parse(errorText);
        } catch (e) {
            errorData = { raw: errorText };
        }
        console.error('[Lumina] API Error:', {
            endpoint,
            status: response.status,
            statusText: response.statusText,
            errorData
        });

        // Detect "Request too large" / TPM rate limit → trigger chain fallback
        const errMsg =
            (typeof errorData?.error?.message === 'string' && errorData.error.message.trim()) ||
            (typeof errorData?.message === 'string' && errorData.message.trim()) ||
            (typeof errorText === 'string' && errorText.trim()) ||
            '';
        const fallbackMsg = `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''} from ${endpoint}${errorText ? `: ${errorText.slice(0, 300)}` : ''}`;
        if (
            response.status === 429 ||
            /Request too large|tokens per minute|TPM|context_length_exceeded/i.test(errMsg)
        ) {
            throw new Error('RATE_LIMIT_EXHAUSTED');
        }

        throw new Error(errMsg || fallbackMsg || 'Failed to fetch from AI provider');
    }

    console.log(streamLogPrefix, 'response ok', {
        status: response.status,
        contentType: response.headers.get('content-type')
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');

    let buffer = '';
    let fullToolResponse = '';
    let emittedChunks = 0;
    let lastFinishReason = null;
    let sawDoneSignal = false;
    let lastUsage = null;

    // Universal reasoning field detection
    let isInReasoning = false;

    const collectDeltasFromPayload = (payloadStr, textDeltas) => {
        if (!payloadStr) return false;
        const trimmedPayload = payloadStr.trim();
        if (!trimmedPayload) return false;

        if (trimmedPayload === '[DONE]' || trimmedPayload.includes('[DONE]')) {
            sawDoneSignal = true;
            return true;
        }

        try {
            const json = JSON.parse(trimmedPayload);
            const choice = json.choices?.[0] || json.candidates?.[0] || {};
            const delta = choice.delta || {};
            const finishReason = choice.finish_reason
                || choice.finishReason
                || json.finish_reason
                || json.finishReason
                || null;

            if (json.usage) {
                lastUsage = json.usage;
            }

            if (finishReason) {
                lastFinishReason = finishReason;
                console.log(streamLogPrefix, 'finish_reason', { finishReason });
            }

            let content = delta.content;
            if (Array.isArray(content)) {
                content = content
                    .map((part) => {
                        if (typeof part === 'string') return part;
                        if (part && typeof part.text === 'string') return part.text;
                        if (part && typeof part.content === 'string') return part.content;
                        return '';
                    })
                    .join('');
            }
            if (!content && typeof choice.message?.content === 'string') {
                content = choice.message.content;
            }

            let reasoning = delta.reasoning || delta.reasoning_content || delta.reasoningContent || '';
            if (Array.isArray(reasoning)) {
                reasoning = reasoning
                    .map((part) => {
                        if (typeof part === 'string') return part;
                        if (part && typeof part.text === 'string') return part.text;
                        if (part && typeof part.content === 'string') return part.content;
                        return '';
                    })
                    .join('');
            }

            if (typeof reasoning === 'string' && reasoning.length > 0) {
                // Start <think> tag if not already in reasoning mode
                if (!isInReasoning) {
                    textDeltas.push('<think>');
                    isInReasoning = true;
                }
                textDeltas.push(reasoning);
            }

            if (typeof content === 'string' && content.length > 0) {
                // End </think> tag if transitioning from reasoning to content
                if (isInReasoning) {
                    textDeltas.push('</think>');
                    isInReasoning = false;
                }
                textDeltas.push(content);
            }

            return true;
        } catch (e) {
            // Ignore non-json payloads from keepalive/comment events.
            return false;
        }
    };

    const processSSEEvent = (rawEvent, textDeltas) => {
        if (!rawEvent) return;
        const lines = rawEvent.split(/\r?\n/);
        const dataLines = [];

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith(':') || trimmed.startsWith('event:')) continue;
            if (!trimmed.startsWith('data:')) continue;
            dataLines.push(trimmed.slice(5).trimStart());
        }

        if (dataLines.length === 0) return;

        const combinedPayload = dataLines.join('\n').trim();
        const parsedCombined = collectDeltasFromPayload(combinedPayload, textDeltas);
        if (!parsedCombined && dataLines.length > 1) {
            // Fallback: some providers may emit one payload per data line.
            dataLines.forEach((payloadLine) => {
                collectDeltasFromPayload(payloadLine, textDeltas);
            });
        }
    };

    while (true) {
        const { done, value } = await reader.read();
        if (done) {
            const flushChunk = decoder.decode();
            if (flushChunk) {
                buffer += flushChunk;
            }

            // Flush the final buffered line that may not end with a newline.
            const tailDeltas = [];
            const trailingBufferLength = buffer ? buffer.length : 0;
            while (buffer && buffer.length > 0) {
                const lfIdx = buffer.indexOf('\n\n');
                const crlfIdx = buffer.indexOf('\r\n\r\n');
                let splitIdx = -1;
                let splitLen = 0;

                if (crlfIdx !== -1 && (lfIdx === -1 || crlfIdx < lfIdx)) {
                    splitIdx = crlfIdx;
                    splitLen = 4;
                } else if (lfIdx !== -1) {
                    splitIdx = lfIdx;
                    splitLen = 2;
                }

                if (splitIdx === -1) break;
                const rawEvent = buffer.slice(0, splitIdx);
                buffer = buffer.slice(splitIdx + splitLen);
                processSSEEvent(rawEvent, tailDeltas);
            }

            if (buffer && buffer.trim().length > 0) {
                processSSEEvent(buffer, tailDeltas);
                buffer = '';
            }

            for (const text of tailDeltas) {
                fullToolResponse += text;
                const filteredText = text.replace(/\{"tool"\s*:\s*"search_web"\s*,\s*"args"\s*:\s*\{[^}]+\}\s*\}/g, '');
                if (filteredText.length > 0) {
                    emittedChunks += 1;
                    port.postMessage({ action: 'chunk', chunk: filteredText });
                }
            }

            console.log(streamLogPrefix, 'reader done', {
                emittedChunks,
                fullToolResponseLength: fullToolResponse.length,
                isInReasoning,
                lastFinishReason,
                sawDoneSignal,
                usage: lastUsage || null,
                trailingBufferLength,
                flushedTailDeltas: tailDeltas.length
            });
            break;
        }
        const chunk = decoder.decode(value, { stream: true });

        // --- Stream Parser Logic (OpenAI-compatible SSE event parser) ---
        const textDeltas = [];
        buffer += chunk;

        while (buffer && buffer.length > 0) {
            const lfIdx = buffer.indexOf('\n\n');
            const crlfIdx = buffer.indexOf('\r\n\r\n');
            let splitIdx = -1;
            let splitLen = 0;

            if (crlfIdx !== -1 && (lfIdx === -1 || crlfIdx < lfIdx)) {
                splitIdx = crlfIdx;
                splitLen = 4;
            } else if (lfIdx !== -1) {
                splitIdx = lfIdx;
                splitLen = 2;
            }

            if (splitIdx === -1) break;

            const rawEvent = buffer.slice(0, splitIdx);
            buffer = buffer.slice(splitIdx + splitLen);
            processSSEEvent(rawEvent, textDeltas);
        }

        // --- Collect all content for tool detection ---
        for (const text of textDeltas) {
            fullToolResponse += text;
            // Filter out tool call JSON before streaming to UI
            const filteredText = text.replace(/\{"tool"\s*:\s*"search_web"\s*,\s*"args"\s*:\s*\{[^}]+\}\s*\}/g, '');
            if (filteredText.length > 0) {
                emittedChunks += 1;
                if (emittedChunks <= 3 || emittedChunks % 10 === 0) {
                    console.log(streamLogPrefix, 'chunk', {
                        emittedChunks,
                        chunkLength: filteredText.length,
                        preview: filteredText.slice(0, 120)
                    });
                }
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

    console.log(streamLogPrefix, 'finished', {
        emittedChunks,
        fullToolResponseLength: fullToolResponse.length,
        hadOpenReasoningTag: false,
        lastFinishReason,
        sawDoneSignal,
        usage: lastUsage || null
    });

    // --- Stream Finished. Check for tool call anywhere in content ---
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
    }, requestOptions);

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`${provider.providerType} error (${response.status}): ${errText.substring(0, 100)}`);
    }
    const result = await response.json();
    return result.choices?.[0]?.message?.content || '';
}




// --- Utility: Bridge Background Logs to Content Script ---
async function bridgeLog(...args) {
    const msg = `[BG Bridge] ${args.join(' ')}`;
    console.log(msg);
    try {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (tab && tab.id) {
            chrome.tabs.sendMessage(tab.id, { action: 'background_log', message: msg }).catch(() => { });
        }
    } catch (e) { }
}

// --- Message Listener ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('[Lumina BG] Message received:', request.action, request.word || request.url || '');

    switch (request.action) {
        case 'fetch_cambridge':
        case 'fetch_oxford': {
            const word = request.word ? request.word.toLowerCase().trim() : '';
            if (!word) {
                sendResponse({ success: false, error: 'No word provided' });
                return false;
            }

            const isCambridge = request.action === 'fetch_cambridge';
            const url = isCambridge
                ? `https://dictionary.cambridge.org/dictionary/english/${encodeURIComponent(word.replace(/\s+/g, '-'))}`
                : `https://www.oxfordlearnersdictionaries.com/search/english/?q=${encodeURIComponent(word)}`;

            console.log(`[Lumina BG] Fetching ${request.action}:`, url);

            fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, redirect: 'follow' })
                .then(res => {
                    if (!res.ok) throw new Error(`HTTP Status ${res.status}`);
                    return res.text();
                })
                .then(html => {
                    console.log(`[Lumina BG] ${request.action} success, length:`, html.length);
                    sendResponse({ success: true, html });
                })
                .catch(err => {
                    console.error(`[Lumina BG] ${request.action} error:`, err.message);
                    sendResponse({ success: false, error: err.message });
                });
            return true;
        }




        case 'fetch_oxford_url': {
            fetch(request.url, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0' } })
                .then(res => res.ok ? res.text() : Promise.reject(`Status ${res.status}`))
                .then(html => sendResponse({ success: true, html }))
                .catch(error => sendResponse({ success: false, error: String(error) }));
            return true;
        }

        case 'check_sidepanel_open': {
            const windowIdSync = sender.tab ? sender.tab.windowId : null;
            sendResponse({ isOpen: !!(windowIdSync && sidePanelPorts.has(windowIdSync)) });
            return;
        }

        case 'pasteDictationText':
            pasteDictationText(request.text);
            return;

        case 'open_sidepanel': {
            const windowIdManual = sender.tab ? sender.tab.windowId : null;
            if (windowIdManual) {
                toggleSidePanel(windowIdManual);
                
                // Identify if this is internal toggle from the sidepanel itself
                const isInternal = sender.tab && sender.tab.url && sender.tab.url.includes('/pages/spotlight/spotlight.html');
                
                // Automatically pin the current tab when side panel is opened via shortcut (from external page)
                const sourceTab = (sender.tab && !isInternal) ? {
                    tabId: sender.tab.id,
                    title: sender.tab.title,
                    url: sender.tab.url
                } : null;
                
                if (sourceTab && sidePanelPorts.has(windowIdManual)) {
                    chrome.runtime.sendMessage({ action: 'pin_web_source', windowId: windowIdManual, source: sourceTab });
                }
            }
            sendResponse({ success: true });
            return true;
        }

        case 'open_sidepanel_with_query': {
            const windowIdQuery = sender.tab ? sender.tab.windowId : null;
            if (windowIdQuery) {
                chrome.sidePanel.open({ windowId: windowIdQuery }).catch(() => { });
                const queryId = Date.now() + '-' + Math.random().toString(36).substring(2, 9);
                
                // Identify if this is an internal query from the spotlight/sidepanel itself
                const isInternal = sender.tab && sender.tab.url && sender.tab.url.includes('/pages/spotlight/spotlight.html');
                
                // Only provide sourceTab for external web pages to avoid redundant pinning
                const sourceTab = (sender.tab && !isInternal) ? {
                    tabId: sender.tab.id,
                    title: sender.tab.title,
                    url: sender.tab.url
                } : null;

                const queryData = { 
                    query: request.query, 
                    displayQuery: request.displayQuery, 
                    queryId, 
                    mode: request.mode,
                    sourceTab: sourceTab,
                    isInternal: isInternal
                };

                if (sidePanelPorts.has(windowIdQuery)) {
                    chrome.runtime.sendMessage({ action: 'ask_sidepanel', windowId: windowIdQuery, ...queryData });
                } else {
                    chrome.storage.session.set({ [`pending_sidepanel_query_${windowIdQuery}`]: queryData });
                }
            }
            sendResponse({ success: true });
            return true;
        }


        case 'setAudioCache':
            (async () => {
                try {
                    await setAudioCache(request.text, request.type, request.data);
                    sendResponse({ success: true });
                } catch (err) {
                    sendResponse({ success: false, error: err.message });
                }
            })();
            return true;

        case 'fetch_ai_dict':
            fetchAIDict(request.word)
                .then(result => sendResponse(result))
                .catch(err => sendResponse({ success: false, error: err?.message || String(err) }));
            return true;

        case 'open_options': {
            let optionsUrl = chrome.runtime.getURL('pages/options/options.html');
            if (request.section) optionsUrl += `?section=${request.section}`;
            if (request.requestMic) optionsUrl += (optionsUrl.includes('?') ? '&' : '?') + 'requestMic=1';
            
            chrome.tabs.create({ url: optionsUrl });
            return true;
        }

        case 'translate':
            translateText(request.text, request.targetLang).then(sendResponse).catch(err => sendResponse({ error: err.message }));
            return true;

        case 'proofread':
            proofreadText(request.text).then(sendResponse).catch(err => sendResponse({ error: err.message }));
            return true;

        case 'toggle-dictation-stop':
            if (isRecording) stopDictation();
            return true;

        case 'dictation-cancelled':
            isRecording = false;
            return true;

        case 'playAudio':
            if (request.text) {
                playNativeTTS(request.text, request.speed).then(sendResponse).catch(() => {
                    playEdgeTTSOffscreen(request.text, request.speed).then(sendResponse).catch(err => sendResponse({ error: err.message }));
                });
            } else {
                playAudioOffscreen(request.url, request.speed).then(sendResponse).catch(err => sendResponse({ error: err.message }));
            }
            return true;

        case 'fetchAudioBase64':
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

        case 'getAudioCache':
            (async () => {
                try {
                    const cached = await getAudioFromCache(request.text);
                    if (cached) sendResponse({ success: true, type: cached.type, data: cached.data });
                    else sendResponse({ success: false });
                } catch (err) {
                    sendResponse({ success: false, error: err.message });
                }
            })();
            return true;




        case 'forceMemoryConsolidate':
            (async () => {
                try {
                    const data = await chrome.storage.local.get(['chat_history']);
                    const chatHistory = data.chat_history || [];
                    if (chatHistory.length === 0) { sendResponse({ success: false, error: 'No chat history available' }); return; }
                    const callAIForConsolidation = async (prompt) => {
                        const data = await chrome.storage.local.get(['providers', 'modelChains']);
                        const providers = data.providers || [];
                        const textChain = data.modelChains?.text || [];
                        const activeModelConfig = textChain.length > 0 ? textChain[0] : null;
                        let targetModel = activeModelConfig ? activeModelConfig.model : 'gemini-flash-latest';
                        const orderedProviders = [];
                        if (activeModelConfig) { const activeProvider = providers.find(p => p.id === activeModelConfig.providerId); if (activeProvider) orderedProviders.push(activeProvider); }
                        for (const p of providers) { if (!orderedProviders.find(op => op.id === p.id)) orderedProviders.push(p); }
                        let lastError = null;
                        for (const provider of orderedProviders) {
                            if (!provider.apiKey) continue;
                            const keys = provider.apiKey.split(',').map(k => k.trim()).filter(k => k);
                            let modelToUse = targetModel;
                            if (activeModelConfig && provider.id !== activeModelConfig.providerId) {
                                if (isGeminiOpenAIEndpoint(provider.endpoint)) modelToUse = 'gemini-3-flash-preview';
                                else if (provider.type === 'openai') modelToUse = 'gpt-4o-mini';
                                else if (provider.type === 'groq') modelToUse = 'llama-3.3-70b-versatile';
                            }
                            for (const key of keys) {
                                try {
                                    const endpoint = normalizeOpenAICompatibleEndpoint(provider.endpoint || 'https://api.groq.com/openai/v1/chat/completions', '/chat/completions');
                                    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(key ? { 'Authorization': `Bearer ${key}` } : {}) }, body: JSON.stringify({ model: modelToUse, messages: [{ role: 'system', content: 'You are a memory consolidation assistant.' }, { role: 'user', content: prompt }], temperature: 0.3, max_tokens: 8192 }) });
                                    if (!response.ok) continue;
                                    const result = await response.json();
                                    const text = result.choices?.[0]?.message?.content || '';
                                    if (text) return text;
                                } catch (err) { lastError = err; continue; }
                            }
                        }
                        throw lastError || new Error('No available providers');
                    };
                    const memory = await UserMemory.load(); memory.lastConsolidated = null; await UserMemory.save(memory);
                    await UserMemory.dailyConsolidate(chatHistory, callAIForConsolidation, true);
                    sendResponse({ success: true });
                } catch (e) { sendResponse({ success: false, error: e.message }); }
            })();
            return true;

        case 'transcribe_audio':
            (async () => {
                const result = await transcribeAudio(request.audio, request.mimeType);
                sendResponse(result);
            })();
            return true;

        case 'play_audio':
            (async () => {
                try {
                    const wordCount = request.text.trim().split(/\s+/).length;
                    let result = null;
                    if (wordCount <= 2) {
                        const str = request.text.trim().toLowerCase();
                        const oxfordUrl = `https://ssl.gstatic.com/dictionary/static/sounds/oxford/${str}--_gb_1.mp3`;
                        result = await fetch(oxfordUrl).then(async (res) => {
                            if (!res.ok) throw new Error();
                            const buf = await res.arrayBuffer();
                            return { audioChunks: [`data:audio/mpeg;base64,${btoa(new Uint8Array(buf).reduce((d, b) => d + String.fromCharCode(b), ''))}`] };
                        }).catch(() => null);
                    }
                    if (!result) {
                        const chunks = [request.text]; // Simplify for now
                        const res = await Promise.all(chunks.map(async c => {
                            const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=en-GB&client=tw-ob&q=${encodeURIComponent(c)}`;
                            const r = await fetch(url);
                            const b = await r.arrayBuffer();
                            return `data:audio/mpeg;base64,${btoa(new Uint8Array(b).reduce((d, b) => d + String.fromCharCode(b), ''))}`;
                        }));
                        result = { audioChunks: res };
                    }
                    sendResponse(result);
                } catch (e) { sendResponse({ error: e.message }); }
            })();
            return true;



        case 'ai_completion':
            (async () => {
                try {
                    const text = await generateOneOffCompletion(request.prompt, request.system || "Helpful assistant", null, request.requestOptions || {});
                    sendResponse({ text });
                } catch (e) { sendResponse({ error: e.message }); }
            })();
            return true;

        case 'reset_exhausted_keys':
            (async () => {
                const data = await chrome.storage.local.get();
                const keysToRemove = Object.keys(data).filter(k => k.startsWith('exhausted_'));
                if (keysToRemove.length > 0) await chrome.storage.local.remove(keysToRemove);
                sendResponse({ success: true, count: keysToRemove.length });
            })();
            return true;

        case 'open_spotlight_from_popup':
            createSpotlightWindow();
            sendResponse({ success: true });
            return true;

        // --- Model Consolidation ---
        case 'updateModelChain':
            (async () => {
                try {
                    await chrome.storage.local.set({ lastUsedModel: { providerId: request.providerId, model: request.model }, provider: request.providerId, model: request.model });
                    sendResponse({ success: true });
                } catch (e) { sendResponse({ success: false, error: e.message }); }
            })();
            return true;

        case 'chatWithModel':
            sendResponse({ success: true });
            return true;

        case 'playBase64Audio':
            playBase64AudioOffscreen(request.base64, request.speed).then(res => sendResponse(res)).catch(err => sendResponse({ error: err.message }));
            return true;

        case 'stopGoogleOffscreenAudio':
            stopGoogleAudioOffscreen().then(res => sendResponse(res || { success: true })).catch(() => sendResponse({ success: true }));
            return true;

        case 'stopOffscreenAudio':
            stopAudioOffscreen();
            sendResponse({ success: true });
            return true;

        case 'fetchAudio':
            fetchAudio(request.text, request.speed || 1.0, request.lang).then(result => sendResponse(result)).catch(() => sendResponse({ type: null, chunks: [] }));
            return true;

        default:
            return false;
    }
});

// --- Global Command Listener (Spotlight) ---
let spotlightWindowId = null;
let spotlightInitialPosition = null;
let spotlightHasMoved = false;

/**
 * Robustly retrieves the current spotlight window ID, checking both memory and storage.
 * This is crucial for MV3 where the service worker may restart.
 */
async function getSpotlightWindowId() {
    if (spotlightWindowId) {
        // Double check it still exists
        try {
            const win = await chrome.windows.get(spotlightWindowId);
            if (win) return spotlightWindowId;
        } catch (e) {
            spotlightWindowId = null;
        }
    }

    // Try storage
    const data = await chrome.storage.local.get(['spotlightWindowId']);
    if (data.spotlightWindowId) {
        try {
            const win = await chrome.windows.get(data.spotlightWindowId);
            if (win) {
                spotlightWindowId = data.spotlightWindowId;
                return spotlightWindowId;
            }
        } catch (e) {
            chrome.storage.local.remove('spotlightWindowId');
        }
    }
    return null;
}


chrome.commands.onCommand.addListener(async (command) => {
    if (command === 'open-lumina-chat') {
        createSpotlightWindow();
    } else if (command === 'new-chat') {
        chrome.runtime.sendMessage({ action: 'new_chat' }).catch(() => { });
        const currentId = await getSpotlightWindowId();
        if (currentId) {
            chrome.windows.get(currentId, { populate: true }, (win) => {
                if (!chrome.runtime.lastError && win && win.tabs && win.tabs.length > 0) {
                    chrome.tabs.sendMessage(win.tabs[0].id, { action: 'new_chat' }).catch(() => { });
                    chrome.windows.update(currentId, { focused: true }).catch(() => { });
                }
            });
        }
    } else if (command === 'toggle-side-panel') {
        chrome.windows.getCurrent({ populate: false }, (currentWindow) => {
            if (currentWindow && currentWindow.id) {
                toggleSidePanel(currentWindow.id);
            }
        });
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
        let transcriptionUrl = normalizeOpenAICompatibleEndpoint(provider.endpoint, '/audio/transcriptions');

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
    // --- TOGGLE LOGIC: Close if focused, focus if hidden, create if missing ---
    const currentId = await getSpotlightWindowId();
    if (currentId) {
        try {
            const win = await chrome.windows.get(currentId);
            if (win) {
                if (win.focused) {
                    await chrome.windows.remove(currentId);
                    // spotlightWindowId will be cleared by the onRemoved listener
                    isCreatingSpotlight = false;
                    return;
                } else {
                    await chrome.windows.update(currentId, { focused: true });
                    isCreatingSpotlight = false;
                    return;
                }
            }
        } catch (e) {
            // Window no longer exists, clear stale ID and proceed to create new
            spotlightWindowId = null;
            chrome.storage.local.remove('spotlightWindowId');
        }
    }

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
chrome.windows.onBoundsChanged.addListener(async (window) => {
    // Determine if this is the spotlight window
    let isSpotlight = (window.id === spotlightWindowId);
    if (!isSpotlight && !spotlightWindowId) {
        const data = await chrome.storage.local.get(['spotlightWindowId']);
        if (data.spotlightWindowId === window.id) {
            spotlightWindowId = window.id; // Restore memory state
            isSpotlight = true;
        }
    }

    if (isSpotlight) {
        // Check if window has moved from initial position
        if (spotlightInitialPosition) {
            const movedX = Math.abs(window.left - spotlightInitialPosition.left) > 5;
            const movedY = Math.abs(window.top - spotlightInitialPosition.top) > 5;

            // If moved, update flag and set always on top
            if (movedX || movedY) {
                if (!spotlightHasMoved) {
                    spotlightHasMoved = true;
                    // Note: alwaysOnTop is not supported in Manifest V3
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
chrome.windows.onRemoved.addListener(async (removedId) => {
    // Check against memory
    let isSpotlight = (removedId === spotlightWindowId);

    // If memory is null (SW just restarted), check storage
    if (!isSpotlight && !spotlightWindowId) {
        const data = await chrome.storage.local.get(['spotlightWindowId']);
        if (data.spotlightWindowId === removedId) {
            isSpotlight = true;
        }
    }

    if (isSpotlight) {
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
            console.log('[Lumina BG][stream] request', {
                action: msg.action,
                messageCount: msg.messages?.length || 0,
                questionLength: msg.question ? msg.question.length : 0,
                hasContext: !!(msg.initialContext && msg.initialContext.trim().length > 0),
                hasImages: !!(msg.imageData && msg.imageData.length),
                isSpotlight: !!msg.isSpotlight
            });
            if (msg.action === 'chat_stream' || msg.action === 'proofread' || msg.action === 'dict_stream') {
                try {
                    let question = msg.question;
                    let initialContext = msg.initialContext;
                    let systemMsg = null;

                    if (msg.action === 'dict_stream' && msg.word) {
                        question = `Dictionary entry for: ${msg.word}`;
                        systemMsg = `You are a professional lexicographer. Provide a concise dictionary entry for the word: "${msg.word}".
                            Use the structure of Cambridge/Oxford dictionaries but focus on SIMPLICITY and BREVITY.
                            Format your response in MARKDOWN with:
                            - **Word** in large bold.
                            - *UK /.../* and *US /.../* for phonetics.
                            - __[Part of Speech]__ (e.g. __[noun]__).
                            - Clear meanings: ONE short, easy-to-understand sentence max.
                            - Vietnamese translations in parentheses.
                            - 1-2 example sentences in italics.
                            Avoid long technical explanations. Be very concise.`;
                    }

                    // Important: Extract systemOverride from options or root msg
                    const finalSystemOverride = (msg.options && msg.options.systemOverride) || msg.systemOverride || systemMsg;

                    await handleChatStream(
                        msg.messages,
                        initialContext,
                        question,
                        port,
                        msg.imageData,
                        msg.isSpotlight || false,
                        msg.requestOptions || {},
                        msg.hasTranscriptForVideoId || null,
                        msg.action,
                        finalSystemOverride
                    );
                    console.log('[Lumina BG][stream] request complete', {
                        action: msg.action,
                        questionLength: question ? question.length : 0
                    });
                } catch (e) {
                    console.error('[Lumina BG][stream] request error', {
                        action: msg.action,
                        error: e?.message || String(e)
                    });
                    port.postMessage({ action: 'chunk', chunk: `*Error: ${e.message}*` });
                } finally {
                    console.log('[Lumina BG][stream] sending done', { action: msg.action });
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
    // --- Google Translate Only ---
    const fromLang = 'auto';
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${fromLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        let translatedText = data[0].map(item => item[0]).join('');

        // Preserve letter numbering
        const letterPrefix = text.match(/^([a-z])\.\s*/i);
        if (letterPrefix) {
            translatedText = translatedText.replace(/^(Một|Hai|Ba|Bốn|Năm|Sáu|Bảy|Tám|Chín|Mười|[A-Z])\.\s*/, letterPrefix[0]);
        }

        // Create final result
        const result = {
            type: 'sentence',
            original: text,
            translation: translatedText,
            fromProvider: 'google',
            showAudio: true
        };
        return result;
    } catch (e) {
        console.error('[Lumina] Google Translate failed:', e);
        return {
            type: 'sentence',
            original: text,
            translation: text + " (Translation failed)"
        };
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

        const systemPrompt = buildProofreadSystemPrompt();

        try {
            const res = await fetchWithRotation(keys, async (key) => {
                const body = {
                    model: model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: text }
                    ]
                };
                return fetch(endpoint, { method: 'POST', body: JSON.stringify(body), headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } });
            });

            if (res.ok) {
                const json = await res.json();
                return { corrected: json.choices[0]?.message?.content || text };
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
async function handleChatStream(messages, initialContext, question, port, imageData = null, isSpotlight = false, requestOptions = {}, hasTranscriptForVideoId = null, action = 'chat_stream', systemOverride = null) {
    try {
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
        } catch (e) {
             console.warn("[Lumina] Optional context extraction failed:", e);
        }

        // 1. Load global settings for params (shared across models)
        const globalSettings = await chrome.storage.local.get(['responseLanguage', 'advancedParamsByModel']);

        // 2. Get Chain
        let chain = await getModelChain();

        // Clean up history
        const cleanMessages = (messages || []).map(m => {
            if ((m.role === 'assistant' || m.role === 'model') && typeof m.content === 'string') {
                return { ...m, content: m.content.trim() };
            }
            return m;
        });

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

                await executeChatRequest(config, cleanMessages, initialContext, question, port, imageData, isSpotlight, globalSettings, requestOptions, action, systemOverride);

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
// --- Handle Model Selection updates merged above ---

// --- Handle Spotlight tab-local model selection (does NOT affect other tabs) ---
// --- Handle Spotlight tab-local model selection merged above ---

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
async function fetchAudio(text, speed = 1.0, forcedLang = null) {
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

    const lang = forcedLang || detectLanguage(normalizedText);

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
        return `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(cleaned)}&tl=${lang}&total=1&idx=0&textlen=${cleaned.length}&client=gtx&prev=input&ttsspeed=${speed}`;
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

// --- Audio Handlers merged above ---



/**
 * Fetches structured dictionary data from AI
 */
async function fetchAIDict(word) {
    const chain = await getModelChain('dictionary');
    if (!chain || chain.length === 0) {
        throw new Error('No AI model configured for dictionary.');
    }

    const systemPrompt = buildDictionarySystemPrompt(word);

    // IMPORTANT: To ensure consistency with the chat flow and bypass potential 503 errors 
    // often caused by non-streaming requests in Gemini OpenAI endpoints, we use streaming 
    // internally and collect the result.
    for (let i = 0; i < chain.length; i++) {
        const config = chain[i];
        const { model, endpoint, apiKey } = config;
        const keys = getKeysArray(apiKey);

        if (model) incrementModelUsage(model);

        const payloadParams = {
            model,
            endpoint,
            temperature: 0.1,
            topP: 1.0,
            parsedCustomParams: { response_format: { type: "json_object" } },
            normalizedThinkingLevel: 'none',
            isGemini25Model: /gemini-2\.5/i.test(model),
            reasoningMode: false,
            imageData: null,
            isStreaming: true // Use streaming for stability
        };

        try {
            const response = await fetchWithRotation(keys, async (key) => {
                const payload = await buildApiPayload([], word, systemPrompt, key, payloadParams);
                return fetch(payload.url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(key ? { 'Authorization': `Bearer ${key}` } : {})
                    },
                    body: JSON.stringify(payload.body)
                });
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`HTTP error ${response.status}: ${errText}`);
            }

            // Collect stream
            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let fullText = '';
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop();

                for (const line of lines) {
                    const cleanLine = line.trim();
                    if (!cleanLine || cleanLine === 'data: [DONE]') continue;
                    if (cleanLine.startsWith('data: ')) {
                        try {
                            const json = JSON.parse(cleanLine.substring(6));
                            const content = json.choices?.[0]?.delta?.content || "";
                            fullText += content;
                        } catch (e) { }
                    }
                }
            }

            // Clean up result
            let jsonStr = fullText.trim();
            if (jsonStr.startsWith('```')) {
                jsonStr = jsonStr.replace(/^```json\n?|```$/g, '').trim();
            }

            const parsedData = JSON.parse(jsonStr);
            return { success: true, data: parsedData };
        } catch (error) {
            console.error(`[Lumina] fetchAIDict failed with ${model}:`, error);
            if (i === chain.length - 1) throw error;
        }
    }
}
