import { detectMediaType, processAttachments, processAttachmentsForGemini, readOpfsFileAsBase64 } from './media_processor.js';

const sessionPorts = new Map();
const sessionControllers = new Map();

export function broadcastToSession(sessionId, message) {
    if (!sessionId) return;
    const ports = sessionPorts.get(sessionId);
    if (ports && ports.size > 0) {
        ports.forEach(port => {
            try {
                port.postMessage(message);
            } catch (_) {
                ports.delete(port);
            }
        });
    }
}

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

function normalizeOpenAICompatibleEndpoint(endpoint, targetPath) {
    if (typeof endpoint !== 'string') return endpoint;
    let trimmed = endpoint.trim().replace(/\/+$/, '');
    if (!trimmed) return trimmed;
    if (trimmed.includes('api.groq.com') && !trimmed.includes('/openai')) {
        trimmed = trimmed.replace('/v1', '/openai/v1');
    }
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

function optimizeContextString(text) {
    if (!text || typeof text !== 'string') return '';
    return text
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/--- \[Segment \d+\] ---/g, '')
        .replace(/\[Context Source:.*?\]/g, '')
        .replace(/URL: https?:\/\/\S+/g, '')
        .trim();
}

function isGeminiModel(modelName) {
    const m = String(modelName || '').toLowerCase();
    return m.includes('gemini') && !m.includes('gemma');
}

function buildChatSystemInstruction(reasoningMode = false) {
    let userTimeZone = 'UTC';
    try {
        userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch (e) { }
    const currentTime = new Date().toLocaleString('en-US', { timeZone: userTimeZone });
    const currentYear = new Date().getFullYear();
    let instruction = `You are a helpful and adaptive AI assistant. Note: current year is ${currentYear}.
[Language Rule]
- Respond in the language of the user's query. If the query consists of a single word, term, or phrase in English but the preceding conversation history is in another language, respond in that language.
[Response Quality & Formatting]
- Specifics Over Generalities: Replace vague claims with concrete details or numbers where applicable (e.g., write "150 min/week of moderate cardio reduces cardiovascular risk by 30-40%" instead of "Exercise has many benefits").
- Fluctuate Layout Naturally: Avoid rigid, repetitive formatting. Match your layout naturally to the content without forcing unnecessary walls of headers or bullet points for every turn.
- Define technical terms inline on first use if the query uses simple language (e.g., "lipolysis (breaking down fat)").
[Follow-Up Rules]
- Closed/Definitive tasks (facts, math, translations, code, JSON, direct questions): Generate a complete, self-contained response. DO NOT add trailing follow-up questions or menus at the end.
- Broad/Ambiguous/Advice queries: Answer directly first, then optionally ask a single relevant follow-up question to guide the user.
[Coding Guidelines & Code Block Gating]
- Write clean, clear, modular, and extremely easy-to-understand code.
- NEVER include comments inside the code block (no inline comments, no descriptive documentation comments, no commented-out code). Keep the code clean, self-explanatory, and completely comment-free.
- Use backticks (\`) or code blocks (\`\`\`) ONLY for actual programming source code (JavaScript, CSS, HTML, Python, etc.) or terminal/database commands.
- STRICTLY FORBIDDEN: Do NOT use backticks or code blocks for:
  - English/Vietnamese grammar formulas, templates, or sentence patterns (e.g. write **S + V + from A to B** instead of \`S + V + from A to B\`).
  - Regular prose, essays, quotes, vocabulary terms, or example sentences (e.g. write *The company's profits plummeted* instead of \`The company's profits plummeted\`).
  - Quotes or blockquotes (>): NEVER wrap quoted text, essay examples, or sentences inside backticks or code blocks. Use standard text, bold, or italics inside blockquotes.
  - Mathematical equations (use LaTeX instead).
[LaTeX Rules]
Use LaTeX ONLY for formal/complex math or science (equations, formulas, complex variables) where plain text is insufficient. Enclose with $inline$ or $$display$$. NEVER render LaTeX in a code block unless the user explicitly requests it.
Strictly Avoid LaTeX for: simple formatting (use Markdown instead), non-technical contexts and regular prose (resumes, letters, essays, cooking, weather, etc.), or simple units/numbers (render **180°C** or **10%** as plain text, not LaTeX).
[Response Guiding Principles]
Provide clear, natural, and well-structured responses. Use formatting tools (headings, bullet points, bolding, tables) only when appropriate to enhance readability, without forcing a rigid structure or unnecessary length. Adapt your layout naturally to the context and style preferences.
[Diagram Syntax — Chart.js]
- A single response CAN contain multiple Chart.js charts if multiple aspects of the topic benefit from visual explanation.
- Use Chart.js JSON config (chartjs code blocks) for all statistical charts and data visualizations: bar charts, line charts, pie/doughnut charts, scatter plots, radar charts, etc.
- EVERY chart MUST ALWAYS have a clear, descriptive title to make it self-explanatory.
Chart.js Chart Rule:
- Format code blocks EXACTLY with \`chartjs\` language identifier.
- The content MUST be a valid JSON object following Chart.js v3 API structure.
- ALWAYS include a descriptive title in options.plugins.title.
- Use vibrant, beautiful color palettes for datasets. Suggested palette: ["#6366f1","#06b6d4","#10b981","#f59e0b","#ef4444","#8b5cf6","#ec4899"].
- Do NOT include any JavaScript functions (callbacks) — pure JSON only.
- Example (Bar Chart):
\`\`\`chartjs
{
  "type": "bar",
  "data": {
    "labels": ["Q1", "Q2", "Q3", "Q4"],
    "datasets": [
      {
        "label": "Revenue ($M)",
        "data": [12.5, 18.3, 15.7, 22.1],
        "backgroundColor": ["#6366f1","#06b6d4","#10b981","#f59e0b"]
      }
    ]
  },
  "options": {
    "plugins": {
      "title": { "display": true, "text": "Quarterly Revenue 2024" },
      "legend": { "display": true }
    },
    "scales": {
      "y": { "beginAtZero": true }
    }
  }
}
\`\`\`
- Example (Line Chart):
\`\`\`chartjs
{
  "type": "line",
  "data": {
    "labels": ["Jan","Feb","Mar","Apr","May","Jun"],
    "datasets": [
      {
        "label": "Users",
        "data": [1200, 1900, 1700, 2400, 2200, 3100],
        "borderColor": "#6366f1",
        "backgroundColor": "rgba(99,102,241,0.15)",
        "fill": true,
        "tension": 0.4
      }
    ]
  },
  "options": {
    "plugins": {
      "title": { "display": true, "text": "Monthly Active Users" }
    },
    "scales": {
      "y": { "beginAtZero": true }
    }
  }
}
\`\`\`

[YouTube]
\`![Title](youtube://id)\` or \`![Title](youtube://search?q=query_keywords)\`.
[Lumina Canvas (Document Workspace)]
The Lumina Canvas is a side-by-side workspace next to the conversation. Use it ONLY for long documents or full code files (HTML, JS, React, etc.) that the user wants to write, iterate on, or preview.
To interact with the Canvas, you MUST wrap your commands in the following XML tags:
1. Create Canvas Document:
<lumina-canvas-create name="Document Name" type="code/html">
...content here...
</lumina-canvas-create>
(Use type: "document" for text, or "code/javascript", "code/html", "code/react", "code/css", etc. for code files. React and HTML types can be previewed live).
2. Update Canvas Document:
<lumina-canvas-update name="Document Name">
<pattern>regex_pattern</pattern>
<replacement>replacement_text</replacement>
</lumina-canvas-update>
(Always write code updates using a single update with ".*" for the pattern to replace the entire content).
3. Comment Canvas Document:
<lumina-canvas-comment name="Document Name">
<pattern>regex_pattern</pattern>
<comment>suggestion</comment>
</lumina-canvas-comment>
[Context & Personalization Privacy]
- When using user context or preferences, blend them in seamlessly. NEVER preface responses with artificial meta-phrases like "Based on your info," "Given your profile," or "Since you mentioned."
- Treat user data as factual and invisible. Do not reference system tags/sources. Never infer or include sensitive personal details (health conditions, origin, religion, financial status, etc.) unless explicitly requested.`;

    return instruction;
}


function buildProofreadSystemPrompt(responseLanguage = 'auto') {
    let languageInstruction = "Refine/translate ALL input into polished, native-level English fluency.";
    if (responseLanguage && responseLanguage !== 'auto') {
        languageInstruction = `Refine/translate ALL input into polished, native-level ${responseLanguage} fluency.`;
    }
    return `[Role]: Elite professional editor.
[Task]: Refine text inside <text> into sophisticated, natural fluency.
[Rules]:
1. Output ONLY the refined text. No headers, chat, or explanations.
2. Maintain original meaning and formatting.
${languageInstruction}`;
}

function cleanThinkingBlocks(text) {
    if (!text || typeof text !== 'string') return text || '';
    return text
        .replace(/<(think|thought|reasoning|details)>[\s\S]*?<\/(think|thought|reasoning|details)>/gi, '')
        .replace(/^<(think|thought|reasoning|details)>[\s\S]*/gi, '')
        .trim();
}


async function buildApiPayload(msgs, currentQ, sysPrompt, activeKey, params) {
    const { model, endpoint, providerType, temperature, topP, parsedCustomParams, normalizedThinkingLevel, isGemini25Model, reasoningMode, imageData, maxTokens = null, isStreaming = true, cachedContent = null } = params;
    const isGemini = providerType === 'gemini' || (typeof endpoint === 'string' && endpoint.includes('generativelanguage.googleapis.com'));
    if (isGemini) {
        const geminiContents = [];
        for (const msg of msgs) {
            const attachments = msg.files || msg.images;
            const role = (msg.role === 'model' || msg.role === 'assistant') ? 'model' : 'user';
            const cleanText = cleanThinkingBlocks(msg.text || '');
            if (attachments && attachments.length > 0) {
                const parts = [];
                if (!cachedContent) {
                    const processed = await processAttachmentsForGemini(attachments);
                    parts.push(...processed.parts);
                    if (processed.unsupported.length > 0) {
                        parts.push({ text: '[Note] Skipped unsupported attachments: ' + processed.unsupported.map(i => i.name).join(', ') });

                    }
                }
                if (cleanText) parts.push({ text: cleanText });
                if (parts.length === 0) parts.push({ text: '' });
                geminiContents.push({ role, parts });
            } else {
                geminiContents.push({ role, parts: [{ text: cleanText }] });
            }
        }
        if (imageData && imageData.length > 0) {
            const parts = [];
            if (!cachedContent) {
                const currentAttachments = Array.isArray(imageData) ? imageData : [imageData];
                const processed = await processAttachmentsForGemini(currentAttachments);
                parts.push(...processed.parts);
                if (processed.unsupported.length > 0) {
                    parts.push({ text: '[Note] Skipped unsupported attachments: ' + processed.unsupported.map(i => i.name).join(', ') });

                }
            }
            if (currentQ) parts.push({ text: currentQ });
            if (parts.length === 0) parts.push({ text: '' });
            geminiContents.push({ role: 'user', parts });
        } else {
            geminiContents.push({ role: 'user', parts: [{ text: currentQ || '' }] });
        }
        const maxOutputTokensVal = (Number.isFinite(maxTokens) && maxTokens > 0) ? parseInt(maxTokens, 10) : 8192;
        const generationConfig = {
            maxOutputTokens: maxOutputTokensVal,
            ...parsedCustomParams
        };
        const isGemini3 = /gemini-[3-9]/i.test(model);
        const isGemma = /gemma/i.test(model);
        if (!isGemini3) {
            generationConfig.temperature = temperature;
            generationConfig.topP = topP;
        }
        if (params.disableThinking) {
            delete generationConfig.thinkingConfig;
        } else {
            let level = normalizedThinkingLevel || 'medium';
            if (isGemma) {
                
                const gemmaLevel = (level === 'high' || level === 'medium') ? 'high' : 'minimal';
                generationConfig.thinkingConfig = {
                    includeThoughts: true,
                    thinkingLevel: gemmaLevel
                };
            } else if (isGemini3) {
                
                const validLevels = ['minimal', 'low', 'medium', 'high'];
                const targetLevel = validLevels.includes(level) ? level : (level === 'none' ? 'minimal' : 'medium');
                generationConfig.thinkingConfig = {
                    includeThoughts: true,
                    thinkingLevel: targetLevel
                };
            } else {
                
                let budget = -1;
                if (level === 'none' || level === 'minimal') {
                    budget = 0;
                } else if (level === 'low') {
                    budget = 1024;
                } else if (level === 'medium') {
                    budget = -1;
                } else if (level === 'high') {
                    budget = 4096;
                }
                generationConfig.thinkingConfig = {
                    includeThoughts: budget > 0 || budget === -1,
                    thinkingBudget: budget
                };
            }
        }
        const geminiBody = {
            contents: geminiContents,
            generationConfig,
            ...(sysPrompt ? {
                system_instruction: {
                    parts: [{ text: sysPrompt }]
                }
            } : {}),
            ...(cachedContent ? { cachedContent } : {})
        };
        const method = isStreaming ? 'streamGenerateContent' : 'generateContent';
        let baseEndpoint = endpoint.replace(/\/$/, '')
            .replace(/\/openai\/chat\/completions$/, '')
            .replace(/\/chat\/completions$/, '')
            .replace(/\/openai$/, '')
            .replace(/\/models$/, '');
        let urlModel = model;
        if (!urlModel.startsWith('models/')) {
            urlModel = 'models/' + urlModel;
        }
        const url = `${baseEndpoint}/${urlModel}:${method}${isStreaming ? '?alt=sse' : ''}`;
        return { url, body: geminiBody };
    }
    const openaiMessages = [{ role: 'system', content: sysPrompt }];
    if (typeof LuminaToken !== 'undefined') {
        const sysTokens = LuminaToken.count(sysPrompt || '');
        const historyTokens = msgs.reduce((acc, m) => acc + LuminaToken.count(m.text || ''), 0);
        const inputTokens = LuminaToken.count(currentQ || '');
        let attachmentTokens = 0;
        const allAttachments = [...(imageData || [])];
        msgs.forEach(m => { if (m.files || m.images) allAttachments.push(...(m.files || m.images)); });
        allAttachments.forEach(att => {
            const mime = normalizeMimeType(att.mimeType || '');
            if (isTextAttachmentMime(mime)) {
                attachmentTokens += LuminaToken.count(decodeBase64Utf8(getBase64FromAttachment(att)));
            } else {
                attachmentTokens += 765;
            }
        });
    }
    for (const msg of msgs) {
        const attachments = msg.files || msg.images;
        const cleanText = cleanThinkingBlocks(msg.text || '');
        if (attachments && attachments.length > 0) {
            const parts = [];
            if (cleanText) parts.push({ type: "text", text: cleanText });
            const processed = await processAttachments(attachments);
            parts.push(...processed.parts);
            if (processed.unsupported.length > 0) {
                parts.push({ type: "text", text: `[Note] Skipped unsupported attachments: ${processed.unsupported.map(i => i.name).join(', ')}` });
            }
            openaiMessages.push({ role: (msg.role === 'model' || msg.role === 'assistant') ? 'assistant' : 'user', content: parts });
        } else {
            openaiMessages.push({ role: (msg.role === 'model' || msg.role === 'assistant') ? 'assistant' : 'user', content: cleanText });
        }
    }
    if (imageData && imageData.length > 0) {
        const parts = [{ type: "text", text: currentQ }];
        const currentAttachments = Array.isArray(imageData) ? imageData : [imageData];
        const processed = await processAttachments(currentAttachments);
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
    const hasCustomTokenLimit = Object.prototype.hasOwnProperty.call(openaiBody, 'max_tokens')
        || Object.prototype.hasOwnProperty.call(openaiBody, 'max_completion_tokens')
        || Object.prototype.hasOwnProperty.call(openaiBody, 'max_output_tokens');
    if (!hasCustomTokenLimit) {
        if (Number.isFinite(maxTokens) && maxTokens > 0) {
            openaiBody.max_tokens = maxTokens;
        } else {
            openaiBody.max_tokens = 8192;
        }
    }
    if (normalizedThinkingLevel) {
        const effortMap = { none: 'none', minimal: 'low', low: 'low', medium: 'medium', high: 'high' };
        if (effortMap[normalizedThinkingLevel]) {
            openaiBody.reasoning_effort = effortMap[normalizedThinkingLevel];
        }
    }
    return { url: normalizeOpenAICompatibleEndpoint(endpoint, '/chat/completions'), body: openaiBody };
}

async function getModelChain(type = 'text', preferredModel = null) {
    const data = await chrome.storage.local.get(['models', 'providers', 'provider', 'model', 'lastUsedModel', 'dictProvider', 'dictModel']);
    let chain = [];
    const storedModels = data.models || [];
    if (storedModels.length > 0) {
        chain = [...storedModels];
    } else if (type === 'dictionary' && data.dictProvider && data.dictModel) {
        chain = [{ providerId: data.dictProvider, model: data.dictModel }];
    } else {
        chain = [{ providerId: data.provider, model: data.model }];
    }
    const activeModel = preferredModel || (type === 'text' ? data.lastUsedModel : null);
    if (activeModel && activeModel.model) {
        let actPId = activeModel.providerId;
        const actModel = activeModel.model;
        if (!actPId || !data.providers?.some(p => p.id === actPId)) {
            const matchingChainItem = storedModels.find(item => item.model === actModel);
            if (matchingChainItem) {
                actPId = matchingChainItem.providerId;
            } else {
                const matchingProvider = data.providers?.find(p => p.defaultModel === actModel);
                if (matchingProvider) {
                    actPId = matchingProvider.id;
                }
            }
        }
        const idx = chain.findIndex(item => item.providerId === actPId && item.model === actModel);
        if (idx > 0) {
            const preferred = chain.splice(idx, 1)[0];
            chain.unshift(preferred);
        } else if (idx === -1 && actModel) {
            const matchingChainItem = data.modelChains?.text?.find(item => item.model === actModel);
            chain.unshift({
                providerId: actPId || '',
                model: actModel,
                maxTokens: activeModel.maxTokens || matchingChainItem?.maxTokens || 8192
            });
        }
    }
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

function getKeysArray(keyStr) {
    if (!keyStr) return [];
    return keyStr.split(',').map(k => k.trim()).filter(k => k.length > 0);
}

function getTodayString() {
    const now = new Date();
    return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

async function fetchWithRotation(keys, requestFn, options = {}) {
    if (!keys || keys.length === 0) {
        return requestFn('');
    }
    const groupKey = 'rot_' + keys.join(',').substring(0, 32).replace(/[^a-zA-Z0-9]/g, '');
    const today = getTodayString();
    if (typeof options.keyIndex === 'number' && options.keyIndex >= 0 && options.keyIndex < keys.length) {
        return await requestFn(keys[options.keyIndex]);
    }
    let activeIndex = 0;
    try {
        const data = await chrome.storage.local.get([groupKey]);
        const state = data[groupKey];
        if (state && state.date === today) activeIndex = state.index;
    } catch (e) { }
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
    for (let attempts = 0; attempts < keys.length; attempts++) {
        const currentIndex = (activeIndex + attempts) % keys.length;
        const currentKey = keys[currentIndex];
        try {
            const response = await requestFn(currentKey);
            if (await isRateLimitOrTooLarge(response)) {
                console.warn(`[Lumina] Key ${currentIndex} hit rate limit or request-too-large. Rotating to next key.`);
            } else {
                chrome.storage.local.set({
                    [groupKey]: { index: currentIndex, date: today }
                });
                return response;
            }
        } catch (err) {
            const errName = err?.name || '';
            const errMsg = err?.message || '';
            if (errName === 'AbortError' || errMsg.includes('aborted') || errMsg === 'signal is aborted without reason') {
                throw err;
            }
            const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
            const isFetchFailed = errName === 'TypeError' || errMsg.includes('Failed to fetch') || errMsg.includes('fetch failed') || errMsg.includes('network') || errMsg.includes('net::ERR');
            if (isOffline || isFetchFailed) {
                const netErr = new Error("Network error: Failed to connect to the AI provider. Please check your internet connection.");
                netErr.name = 'NetworkError';
                throw netErr;
            }
            console.error(`[Lumina] Request failed with key ${currentIndex}:`, err);
        }
    }
    throw new Error("All API keys failed or were rate limited in this cycle.");
}

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
    }
}

const CACHE_EXPIRATION_MS = 1 * 24 * 60 * 60 * 1000;

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

const AUDIO_CACHE_KEY = 'audio_cache';
const AUDIO_CACHE_MAX_ENTRIES = 200;

async function getAudioFromCache(text) {
    try {
        if (typeof LuminaAudioCacheDB !== 'undefined') {
            const key = text.trim().toLowerCase();
            const entry = await LuminaAudioCacheDB.get(key);
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
        if (typeof LuminaAudioCacheDB !== 'undefined') {
            const key = text.trim().toLowerCase();
            const entry = {
                type,
                data,
                timestamp: Date.now()
            };
            await LuminaAudioCacheDB.put(key, entry);
        }
    } catch (e) {
        console.error('[Lumina Audio] Cache write error:', e);
    }
}

async function fetchPageContent(url) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const html = await response.text();
        let text = html
            .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gmi, "")
            .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gmi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim();
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

async function executeChatRequest(config, messages, initialContext, question, port, imageData = null, isSpotlight = false, globalSettings = {}, requestOptions = {}, action = 'chat_stream', systemOverride = null, sessionId = null) {
    const { model, providerType: currentProvider, endpoint, apiKey, defaultModel } = config;
    const streamLogPrefix = `[Lumina BG][${action}]`;
    const advancedParamsByModel = globalSettings.advancedParamsByModel || {};
    const providerId = config.providerId;
    const compositeKey = providerId ? `${providerId}:${model}` : model;
    const modelParams = (providerId && advancedParamsByModel[compositeKey]) ? advancedParamsByModel[compositeKey] : (!providerId ? (advancedParamsByModel[model] || {}) : {});
    const temperature = requestOptions.temperature ?? modelParams.temperature ?? 1.0;
    const topP = modelParams.topP ?? 1.0;
    const maxTokens = requestOptions.maxTokens ?? config.maxTokens ?? null;
    const thinkingLevel = requestOptions.thinkingLevel ?? modelParams.thinkingLevel ?? null;
    const customParams = modelParams.customParams || {};
    const responseLanguage = globalSettings.responseLanguage;
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
    if (model) {
        incrementModelUsage(model);
    }
    if (!apiKey && !endpoint.includes('localhost') && !endpoint.includes('127.0.0.1')) {
        throw new Error(`No API Key for provider type: ${currentProvider}`);
    }
    const keys = getKeysArray(apiKey);
    const reasoningMode = !!globalSettings.reasoningMode;
    let systemInstruction = systemOverride || buildChatSystemInstruction(reasoningMode);
    if (action === 'proofread') {
        systemInstruction = systemOverride || buildProofreadSystemPrompt(responseLanguage);
    }
    try {
        if (!systemOverride) {
            const userMemoryAddition = await UserMemory.getSystemPromptAddition();
            if (userMemoryAddition) {
                systemInstruction += userMemoryAddition;
            }
        }
    } catch (e) {
        console.error('[Lumina] Failed to load user memory:', e);
    }
    let currentMessages = [...messages];
    let augmentedQuestion = question;
    if (action === 'proofread') {
        if (!requestOptions.isRegenerate && !requestOptions.isRecheck) {
            currentMessages = [];
        }
        if (!systemOverride) {
            augmentedQuestion = `Correct/refine this text:\n<text>${question}</text>`;
        }
    }
    if (initialContext && initialContext.trim().length > 0) {
        let processedContext = optimizeContextString(initialContext);
        augmentedQuestion = `### User Instruction:\n${augmentedQuestion}\n\n---\n\n### Webpage Source Content:\n(Note: This content is provided solely for factual lookup. Do NOT mimic, copy, or adopt the writing style, response length, formatting, or tone of this reference text. Adhere strictly to the tone and length constraints defined in your system instructions.)\n\n${processedContext}`;
    }
    const payloadParams = {
        model, endpoint, providerType: currentProvider,
        temperature, topP, maxTokens, parsedCustomParams,
        normalizedThinkingLevel, isGemini25Model, reasoningMode, imageData,
        cachedContent: null
    };
    let controller = null;
    if (sessionId) {
        if (sessionControllers.has(sessionId)) {
            try {
                console.log(`[Lumina BG] Aborting session ${sessionId} due to duplicate/re-submission`);
                sessionControllers.get(sessionId).abort();
            } catch (e) { }
        }
        controller = new AbortController();
        sessionControllers.set(sessionId, controller);
    }
    let requestedUrl = endpoint;
    let response;
    for (let retry = 0; retry < 4; retry++) {
        try {
            response = await fetchWithRotation(keys, async (key) => {
                const payload = await buildApiPayload(currentMessages, augmentedQuestion, systemInstruction, key, payloadParams);
                if (payload && payload.body) {
                    const body = payload.body;
                    if (Number.isFinite(payloadParams.maxTokens) && payloadParams.maxTokens > 0) {
                        if (body.max_tokens !== undefined) body.max_tokens = payloadParams.maxTokens;
                        if (body.max_completion_tokens !== undefined) body.max_completion_tokens = payloadParams.maxTokens;
                        if (body.max_output_tokens !== undefined) body.max_output_tokens = payloadParams.maxTokens;
                    }
                }
                requestedUrl = payload.url;
                const headers = { 'Content-Type': 'application/json' };
                if (key) {
                    const isGemini = currentProvider === 'gemini' || (typeof endpoint === 'string' && endpoint.includes('generativelanguage.googleapis.com'));
                    if (isGemini) {
                        headers['x-goog-api-key'] = key;
                    } else {
                        headers['Authorization'] = `Bearer ${key}`;
                    }
                }
                return fetch(payload.url, {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify(payload.body),
                    signal: controller ? controller.signal : null
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
                    endpoint: requestedUrl,
                    status: response.status,
                    statusText: response.statusText,
                    errorData
                });
                const errMsg =
                    (typeof errorData?.error?.message === 'string' && errorData.error.message.trim()) ||
                    (typeof errorData?.message === 'string' && errorData.message.trim()) ||
                    (typeof errorText === 'string' && errorText.trim()) || '';
                const fallbackMsg = `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''} from ${requestedUrl}${errorText ? `: ${errorText.slice(0, 300)}` : ''}`;
                const isTpmRateLimit = response.status === 429 || /Request too large|tokens per minute|TPM|rate_limit_exceeded|context_length_exceeded/i.test(errMsg);
                if (isTpmRateLimit && retry < 3) {
                    const limitMatch = errMsg.match(/Limit\s+(\d+)/i);
                    const requestedMatch = errMsg.match(/Requested\s+(\d+)/i);
                    let diff = 1000;
                    if (limitMatch && requestedMatch) {
                        const limit = parseInt(limitMatch[1], 10);
                        const requested = parseInt(requestedMatch[1], 10);
                        if (requested > limit) {
                            diff = requested - limit + 150;
                        }
                    }
                    const currentMaxTokens = payloadParams.maxTokens || 4096;
                    let newMaxTokens = currentMaxTokens;
                    if (diff > 0) {
                        const maxReducible = currentMaxTokens - 1024;
                        if (maxReducible > 0) {
                            const reduction = Math.min(diff, maxReducible);
                            newMaxTokens = currentMaxTokens - reduction;
                            diff -= reduction;
                            payloadParams.maxTokens = newMaxTokens;
                            console.warn(`[Lumina] Dynamic token reduction: Changing max_tokens from ${currentMaxTokens} to ${newMaxTokens}. Remaining diff: ${diff}`);
                        }
                    }
                    if (diff > 0 && currentMessages.length > 2) {
                        let tokensRemoved = 0;
                        let pairsRemoved = 0;
                        while (diff > tokensRemoved && currentMessages.length > 2) {
                            const msg1 = currentMessages[0];
                            const msg2 = currentMessages[1];
                            const t1 = msg1 ? LuminaToken.count(JSON.stringify(msg1)) : 0;
                            const t2 = msg2 ? LuminaToken.count(JSON.stringify(msg2)) : 0;
                            tokensRemoved += (t1 + t2);
                            currentMessages.splice(0, 2);
                            pairsRemoved++;
                        }
                        console.warn(`[Lumina] Prompt too large. Removed ${pairsRemoved} message pair(s) to free up ~${tokensRemoved} tokens. Remaining diff: ${diff - tokensRemoved}`);
                    }
                    continue;
                }
                if (response.status === 429 || /Request too large|tokens per minute|TPM|context_length_exceeded/i.test(errMsg)) {
                    throw new Error('RATE_LIMIT_EXHAUSTED');
                }
                throw new Error(errMsg || fallbackMsg || 'Failed to fetch from AI provider');
            }
            break;
        } catch (e) {
            if (retry < 3 && (e.message === 'RATE_LIMIT_EXHAUSTED' || e.message === 'Failed to fetch')) {
                if (currentMessages.length > 2) {
                    console.warn(`[Lumina] Request failed. Retrying with cropped history...`);
                    currentMessages.splice(0, 2);
                    continue;
                }
            }
            throw e;
        }
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let emittedChunks = 0;
    let isInReasoning = false;
    const collectDeltasFromPayload = (payloadStr, textDeltas) => {
        if (!payloadStr) return false;
        const trimmedPayload = payloadStr.trim();
        if (!trimmedPayload) return false;
        if (trimmedPayload === '[DONE]' || trimmedPayload.includes('[DONE]')) {
            return true;
        }
        try {
            const parsed = JSON.parse(trimmedPayload);
            const choice = parsed.choices?.[0] || parsed.candidates?.[0] || {};
            const delta = choice.delta || {};
            let content = '';
            let reasoning = '';
            if (choice.content?.parts) {
                for (const part of choice.content.parts) {
                    if (part.thought === true) {
                        reasoning += part.text || '';
                    } else {
                        content += part.text || '';
                    }
                }
            } else {
                content = delta.content || '';
                if (Array.isArray(content)) {
                    content = content.map((part) => {
                        if (typeof part === 'string') return part;
                        if (part && typeof part.text === 'string') return part.text;
                        if (part && typeof part.content === 'string') return part.content;
                        return '';
                    }).join('');
                }
                if (!content && typeof choice.message?.content === 'string') {
                    content = choice.message.content;
                }
                reasoning = delta.reasoning || delta.reasoning_content || delta.reasoningContent || '';
                if (Array.isArray(reasoning)) {
                    reasoning = reasoning.map((part) => {
                        if (typeof part === 'string') return part;
                        if (part && typeof part.text === 'string') return part.text;
                        if (part && typeof part.content === 'string') return part.content;
                        return '';
                    }).join('');
                }
            }
            if (typeof reasoning === 'string' && reasoning.length > 0) {
                if (!isInReasoning) {
                    textDeltas.push('<think>');
                    isInReasoning = true;
                }
                textDeltas.push(reasoning);
            }
            if (typeof content === 'string' && content.length > 0) {
                if (isInReasoning) {
                    textDeltas.push('</think>');
                    isInReasoning = false;
                }
                textDeltas.push(content);
            }
            return true;
        } catch (e) {
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
            dataLines.forEach((payloadLine) => {
                collectDeltasFromPayload(payloadLine, textDeltas);
            });
        }
    };
    const emitChunk = (text) => {
        if (text.length > 0) {
            emittedChunks += 1;
            const chunkMsg = { action: 'chunk', chunk: text, sessionId };
            if (sessionId) broadcastToSession(sessionId, chunkMsg);
            else port.postMessage(chunkMsg);
        }
    };
    let nonSseBuffer = '';
    const detectAndExtractJsonError = (str) => {
        if (!str || typeof str !== 'string') return null;
        const trimmed = str.trim();
        if (!trimmed) return null;
        if (trimmed.includes('"error"') && (trimmed.includes('{') || trimmed.startsWith('{'))) {
            const firstBrace = trimmed.indexOf('{');
            const lastBrace = trimmed.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                const potentialJson = trimmed.slice(firstBrace, lastBrace + 1);
                try {
                    const parsed = JSON.parse(potentialJson);
                    if (parsed && parsed.error) {
                        return parsed.error.message || parsed.error.status || 'AI Service Error';
                    }
                } catch (e) {
                    const msgMatch = trimmed.match(/"message"\s*:\s*"([^"]+)"/);
                    if (msgMatch && msgMatch[1]) {
                        return msgMatch[1];
                    }
                }
            }
        }
        return null;
    };
    let keepAliveInterval = setInterval(() => {
        try {
            chrome.runtime.getPlatformInfo(() => { });
        } catch (e) {
            console.error('[Lumina] Keep-alive error:', e);
        }
    }, 5000);
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                const flushChunk = decoder.decode();
                if (flushChunk) {
                    buffer += flushChunk;
                }
                const tailDeltas = [];
                if (buffer && buffer.length > 0) {
                    const lines = buffer.split('\n');
                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (!trimmed || trimmed.startsWith(':') || trimmed.startsWith('event:')) continue;
                        if (trimmed.startsWith('data:')) {
                            processSSEEvent(line, tailDeltas);
                        } else {
                            nonSseBuffer += (nonSseBuffer ? '\n' : '') + line;
                        }
                    }
                }
                const errorMsg = detectAndExtractJsonError(nonSseBuffer) || detectAndExtractJsonError(buffer);
                if (errorMsg) {
                    throw new Error(errorMsg);
                }
                for (const text of tailDeltas) {
                    emitChunk(text);
                }
                break;
            }
            const chunk = decoder.decode(value, { stream: true });
            const textDeltas = [];
            buffer += chunk;
            const lines = buffer.split('\n');
            buffer = lines.pop();
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith(':') || trimmed.startsWith('event:')) continue;
                if (trimmed.startsWith('data:')) {
                    processSSEEvent(line, textDeltas);
                } else {
                    nonSseBuffer += (nonSseBuffer ? '\n' : '') + line;
                    const errorMsg = detectAndExtractJsonError(nonSseBuffer);
                    if (errorMsg) {
                        throw new Error(errorMsg);
                    }
                }
            }
            for (const text of textDeltas) {
                emitChunk(text);
            }
        }
    } finally {
        clearInterval(keepAliveInterval);
    }
    if (isInReasoning) {
        const thinkEndMsg = { action: 'chunk', chunk: '</think>', sessionId };
        if (sessionId) broadcastToSession(sessionId, thinkEndMsg);
        else port.postMessage(thinkEndMsg);
        isInReasoning = false;
    }
}

async function handleChatStream(messages, initialContext, question, port, imageData = null, isSpotlight = false, requestOptions = {}, hasTranscriptForVideoId = null, action = 'chat_stream', systemOverride = null, sessionId = null) {
    try {
        try {
            let activeUrl = port?.sender?.tab?.url;
            let activeTabId = port?.sender?.tab?.id;
            if (!activeUrl) {
                const queryOptions = isSpotlight ? { active: true } : { active: true, currentWindow: true };
                const tabs = await chrome.tabs.query(queryOptions);
                if (tabs && tabs.length > 0) {
                    activeUrl = tabs[0].url;
                    activeTabId = tabs[0].id;
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
        const globalSettings = await chrome.storage.local.get(['responseLanguage', 'advancedParamsByModel']);
        let chain = await getModelChain('text', requestOptions.tabModel);
        const cleanMessages = (messages || []).map(m => {
            if (typeof m.content === 'string') {
                let cleaned = m.content.replace(/(image-search:\/\/[^)#\s]+)#[^)\s]+/g, '$1');
                return { ...m, content: cleaned.trim() };
            }
            return m;
        });
        if (!chain || chain.length === 0) {
            const errorMsg = { error: 'No valid AI models configured. Please check Options.' };
            if (sessionId) broadcastToSession(sessionId, errorMsg);
            else port.postMessage(errorMsg);
            return;
        }
        for (let i = 0; i < chain.length; i++) {
            const config = chain[i];
            try {
                const isLast = i === chain.length - 1;
                await executeChatRequest(config, cleanMessages, initialContext, question, port, imageData, isSpotlight, globalSettings, requestOptions, action, systemOverride, sessionId);
                return;
            } catch (e) {
                if (e.name === 'AbortError' || e.message?.includes('aborted') || e.message === 'signal is aborted without reason') {
                    console.log(`[Lumina] Request aborted by user at index ${i} (${config.model})`);
                    return;
                }
                if (e.message === 'RATE_LIMIT_EXHAUSTED') {
                    console.warn(`[Lumina] Model ${config.model} hit RATE LIMIT. Falling back to next...`);
                    if (i < chain.length - 1) {
                        try {
                            const statusMsg = {
                                action: 'status_update',
                                text: `Rate limit hit on ${config.model}. Switching to backup model...`,
                                sessionId: sessionId
                            };
                            if (sessionId) broadcastToSession(sessionId, statusMsg);
                            else port.postMessage(statusMsg);
                        } catch (err) { }
                        continue;
                    }
                }
                console.error(`[Lumina] Chat Chain failed at index ${i} (${config.model}):`, e);
                const errorMsg = { error: e.message || "AI Request Failed" };
                if (sessionId) broadcastToSession(sessionId, errorMsg);
                else port.postMessage(errorMsg);
                return;
            }
        }
    } catch (err) {
        console.error('[Lumina] Fatal Chat Error:', err);
        const errorMsg = { error: err.message };
        if (sessionId) broadcastToSession(sessionId, errorMsg);
        else port.postMessage(errorMsg);
    }
}

async function generateChatTitleFromModel(modelObj, question, images, files, history) {
    const chain = await getModelChain('text', modelObj);
    if (!chain || chain.length === 0) {
        throw new Error("No configured models found.");
    }
    const config = chain[0];
    const { model, providerType: currentProvider, endpoint, apiKey } = config;
    const keys = getKeysArray(apiKey);
    const systemInstruction = `Analyze the preceding prompt/conversation and generate a concise, descriptive chat title in 8 words or fewer. Capture the core topic or main intent directly without filler words, matching the language of the prompt. Respond ONLY with the title itself, nothing else. Do not wrap in quotes.`;
    const attachments = [];
    if (Array.isArray(images)) attachments.push(...images);
    if (Array.isArray(files)) attachments.push(...files);
    const payloadParams = {
        model, endpoint, providerType: currentProvider,
        temperature: 0.3, topP: 1.0, maxTokens: 50, parsedCustomParams: {},
        normalizedThinkingLevel: 'none', isGemini25Model: false, reasoningMode: false,
        imageData: attachments.length > 0 ? attachments : null,
        isStreaming: false, cachedContent: null, disableThinking: true
    };
    const titlePrompt = `Generate a concise, descriptive chat title (8 words or fewer) in the exact same language for the following prompt. Respond ONLY with the title text itself, without quotes or conversational filler:\n\n${question}`;
    const response = await fetchWithRotation(keys, async (key) => {
        const payload = await buildApiPayload(history || [], titlePrompt, systemInstruction, key, payloadParams);
        const headers = { 'Content-Type': 'application/json' };
        if (key) {
            const isGemini = currentProvider === 'gemini' || (typeof endpoint === 'string' && endpoint.includes('generativelanguage.googleapis.com'));
            if (isGemini) {
                headers['x-goog-api-key'] = key;
            } else {
                headers['Authorization'] = `Bearer ${key}`;
            }
        }
        return fetch(payload.url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(payload.body)
        });
    });
    if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
    }
    const data = await response.json();
    let text = '';
    const isGemini = currentProvider === 'gemini' || (typeof endpoint === 'string' && endpoint.includes('generativelanguage.googleapis.com'));
    if (isGemini) {
        const parts = data.candidates?.[0]?.content?.parts || [];
        const textParts = parts.filter(p => p.text && !p.thoughtSignature && !p.thought);
        text = textParts.length > 0 ? textParts[textParts.length - 1].text : (parts[0]?.text || '');
    } else {
        text = data.choices?.[0]?.message?.content || '';
    }
    let cleanedText = text.trim();
    const lines = cleanedText.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length > 1) {
        const titleLine = lines.find(l => /^(corrected\s+)?title\s*:/i.test(l));
        if (titleLine) {
            cleanedText = titleLine;
        } else {
            
            cleanedText = lines[lines.length - 1];
        }
    }
    
    cleanedText = cleanedText.replace(/^(corrected\s+)?title\s*:\s*/i, '');
    cleanedText = cleanedText.replace(/^(suggested\s+)?title\s*:\s*/i, '');
    cleanedText = cleanedText.replace(/^chat\s+title\s*:\s*/i, '');
    cleanedText = cleanedText.trim().replace(/^["']|["']$/g, '').trim();
    if (!cleanedText) {
        return question.substring(0, 30);
    }
    return cleanedText;
}


export function initChatStreamService() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request && request.action === 'generate_chat_title') {
            generateChatTitleFromModel(request.modelObj, request.question, request.images, request.files, request.history)
                .then(title => {
                    sendResponse({ success: true, title });
                })
                .catch(err => {
                    console.error('[Lumina BG] generate_chat_title error:', err);
                    sendResponse({ success: false, error: err?.message || String(err) });
                });
            return true;
        }
    });

    chrome.runtime.onConnect.addListener((port) => {
    if (port.name === 'lumina-chat-stream') {
        const registeredSessions = new Set();
        port.onDisconnect.addListener(() => {
            for (const sid of registeredSessions) {
                if (sessionPorts.has(sid)) {
                    sessionPorts.get(sid).delete(port);
                    if (sessionPorts.get(sid).size === 0) {
                        sessionPorts.delete(sid);
                    }
                }
            }
        });
        port.onMessage.addListener(async (msg) => {
            if (msg.action === 'ping') {
                try {
                    chrome.runtime.getPlatformInfo(() => { });
                } catch (e) { }
                return;
            }
            if (msg.action === 'register_sessions' && Array.isArray(msg.sessionIds)) {
                msg.sessionIds.forEach(sid => {
                    registeredSessions.add(sid);
                    if (!sessionPorts.has(sid)) sessionPorts.set(sid, new Set());
                    sessionPorts.get(sid).add(port);
                });
                return;
            }
            if (msg.action === 'stop_chat' && msg.sessionId) {
                const controller = sessionControllers.get(msg.sessionId);
                if (controller) {
                    console.log(`[Lumina BG] Aborting session ${msg.sessionId} due to stop_chat message`);
                    controller.abort();
                    sessionControllers.delete(msg.sessionId);
                }
                broadcastToSession(msg.sessionId, { action: 'done', sessionId: msg.sessionId });
                return;
            }
            if (msg.sessionId && !registeredSessions.has(msg.sessionId)) {
                registeredSessions.add(msg.sessionId);
                if (!sessionPorts.has(msg.sessionId)) sessionPorts.set(msg.sessionId, new Set());
                sessionPorts.get(msg.sessionId).add(port);
            }
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
                        (msg.options && msg.options.mode) || msg.action,
                        finalSystemOverride,
                        msg.sessionId
                    );
                } catch (e) {
                    console.error('[Lumina BG][stream] request error', {
                        action: msg.action,
                        error: e?.message || String(e)
                    });
                    port.postMessage({ action: 'chunk', chunk: `*Error: ${e.message}*` });
                } finally {
                    const doneMsg = { action: 'done', sessionId: msg.sessionId };
                    if (msg.sessionId) broadcastToSession(msg.sessionId, doneMsg);
                    else port.postMessage(doneMsg);
                }
            }
        });
    }
    });
}

