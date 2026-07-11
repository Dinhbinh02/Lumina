importScripts('../lib/vendor/marked.min.js');
importScripts('../lib/core/constants.js');
importScripts('../lib/core/memory.js');
importScripts('../lib/core/attachment_db.js');
importScripts('../lib/core/auth.js');
importScripts('../lib/core/token_utils.js');

const DEFAULTS = LUMINA_DEFAULTS;

chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' }).catch(() => { });

function getPromptApiNamespace() {
    if (typeof chrome !== 'undefined' && chrome.ai && chrome.ai.languageModel) {
        return chrome.ai.languageModel;
    }
    if (typeof chrome !== 'undefined' && chrome.aiLanguageModel) {
        return chrome.aiLanguageModel;
    }
    if (typeof chrome !== 'undefined' && chrome.aiOriginTrial && chrome.aiOriginTrial.languageModel) {
        return chrome.aiOriginTrial.languageModel;
    }
    if (typeof ai !== 'undefined' && ai.languageModel) {
        return ai.languageModel;
    }
    if (typeof self !== 'undefined' && self.ai && self.ai.languageModel) {
        return self.ai.languageModel;
    }
    return null;
}

const sidePanelPorts = new Map();
let sessionOpenWindows = new Set();

const sessionPorts = new Map();
const sessionControllers = new Map();
const activeUploads = new Map();

function broadcastToSession(sessionId, message) {
    if (!sessionId) return;
    const ports = sessionPorts.get(sessionId);
    if (!ports) return;
    for (const port of ports) {
        try {
            port.postMessage(message);
        } catch (e) {
            console.warn('[Lumina BG] Failed to broadcast to session port:', e);
            ports.delete(port);
        }
    }
}

chrome.storage.session.get(['open_sidepanel_windows'], (result) => {
    if (result.open_sidepanel_windows) {
        sessionOpenWindows = new Set(result.open_sidepanel_windows);
        sessionOpenWindows.forEach(wid => {
            if (!sidePanelPorts.has(wid)) sidePanelPorts.set(wid, null);
        });
    }
});

function updateOpenSidePanelsSession() {
    chrome.storage.session.set({ open_sidepanel_windows: Array.from(sessionOpenWindows) }).catch(() => { });
}

chrome.runtime.onConnect.addListener((port) => {
    if (port.name === 'lumina-sidepanel') {
        let connectedWindowId = null;
        port.onMessage.addListener((msg) => {
            if (msg.action === 'closing' && msg.windowId) {
                sessionOpenWindows.delete(msg.windowId);
                sidePanelPorts.delete(msg.windowId);
                updateOpenSidePanelsSession();
            } else if (msg.windowId) {
                connectedWindowId = msg.windowId;
                sidePanelPorts.set(connectedWindowId, port);
                sessionOpenWindows.add(connectedWindowId);
                updateOpenSidePanelsSession();
            }
        });
        port.onDisconnect.addListener(() => {
            if (connectedWindowId) {
                sidePanelPorts.delete(connectedWindowId);
            }
        });
    }
});

chrome.windows.onRemoved.addListener((windowId) => {
    if (sessionOpenWindows.has(windowId)) {
        sessionOpenWindows.delete(windowId);
        sidePanelPorts.delete(windowId);
        updateOpenSidePanelsSession();
    }
});

if (chrome.sidePanel && chrome.sidePanel.onClosed) {
    chrome.sidePanel.onClosed.addListener((closeInfo) => {
        if (closeInfo && closeInfo.windowId) {
            sessionOpenWindows.delete(closeInfo.windowId);
            sidePanelPorts.delete(closeInfo.windowId);
            updateOpenSidePanelsSession();
        }
    });
}

chrome.tabs.onRemoved.addListener((tabId) => {
    chrome.storage.local.get(['lumina_tab_sessions'], result => {
        const tabSessions = result.lumina_tab_sessions || {};
        if (tabSessions[tabId]) {
            delete tabSessions[tabId];
            chrome.storage.local.set({ lumina_tab_sessions: tabSessions });
        }
    });
});

function toggleSidePanel(windowId) {
    if (!windowId) return;
    const isCurrentlyOpen = sidePanelPorts.has(windowId) || sessionOpenWindows.has(windowId);
    if (isCurrentlyOpen) {
        sessionOpenWindows.delete(windowId);
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
        sessionOpenWindows.add(windowId);
        sidePanelPorts.set(windowId, null);
        updateOpenSidePanelsSession();
        chrome.sidePanel.open({ windowId }).catch(() => {
            sessionOpenWindows.delete(windowId);
            sidePanelPorts.delete(windowId);
            updateOpenSidePanelsSession();
        });
    }
}

async function ensureSidePanelOpen(windowId) {
    if (!windowId) return;
    const isCurrentlyOpen = sidePanelPorts.has(windowId) || sessionOpenWindows.has(windowId);
    if (!isCurrentlyOpen) {
        sessionOpenWindows.add(windowId);
        sidePanelPorts.set(windowId, null);
        updateOpenSidePanelsSession();
        chrome.sidePanel.open({ windowId }).catch(() => {
            sessionOpenWindows.delete(windowId);
            sidePanelPorts.delete(windowId);
            updateOpenSidePanelsSession();
        });
    }
}

async function checkAndRegisterScripts() {
}

function updateDisplayMode(mode) {
    if (!chrome.sidePanel) return;
    chrome.sidePanel.setOptions({
        path: 'pages/spotlight/spotlight.html?sidepanel=1',
        enabled: true
    });
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(console.error);
    chrome.action.setPopup({ popup: 'pages/popup/popup.html' });
}

chrome.storage.local.get(['displayMode'], (result) => {
    updateDisplayMode(result.displayMode || 'popup');
});

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.displayMode) {
        updateDisplayMode(changes.displayMode.newValue || 'popup');
    }
});

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
    return m.includes('gemini') || m.includes('google');
}

function buildChatSystemInstruction(reasoningMode = false) {
    let userTimeZone = 'UTC';
    try {
        userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch (e) { }
    const currentTime = new Date().toLocaleString('en-US', { timeZone: userTimeZone });
    const currentYear = new Date().getFullYear();
    let instruction = `You are a helpful, neutral, and balanced AI assistant. Note: current year is ${currentYear}.
[Coding Guidelines & Code Block Gating]
- Write clean, clear, modular, and extremely easy-to-understand code.
- NEVER include comments inside the code block (no inline comments, no descriptive documentation comments, no commented-out code). Keep the code clean, self-explanatory, and completely comment-free.
- Use backticks (\`) or code blocks (\`\`\`) ONLY for actual programming source code (JavaScript, CSS, HTML, Python, etc.) or terminal/database commands.
- STRICTLY FORBIDDEN: Do NOT use backticks or code blocks for:
  - English/Vietnamese grammar formulas, templates, or sentence patterns (e.g. write **S + V + from A to B** instead of \`S + V + from A to B\`).
  - Regular prose, essays, vocabulary terms, or example sentences (e.g. write *The company's profits plummeted* instead of \`The company's profits plummeted\`).
  - Mathematical equations (use LaTeX instead).
[LaTeX Rules]
Use LaTeX ONLY for formal/complex math or science (equations, formulas, complex variables) where plain text is insufficient. Enclose with $inline$ or $$display$$. NEVER render LaTeX in a code block unless the user explicitly requests it.
Strictly Avoid LaTeX for: simple formatting (use Markdown instead), non-technical contexts and regular prose (resumes, letters, essays, cooking, weather, etc.), or simple units/numbers (render **180°C** or **10%** as plain text, not LaTeX).
[Response Guiding Principles]
Provide clear, natural, and well-structured responses. Use formatting tools (headings, bullet points, bolding, tables) only when appropriate to enhance readability, without forcing a rigid structure or unnecessary length. Adapt your layout naturally to the context and style preferences.
[Diagram Syntax — D2 & Chart.js]
- A single response CAN contain multiple diagrams (D2 and/or Chart.js charts) if multiple aspects of the topic benefit from visual explanation.
- Use D2 as the primary choice for structural diagrams: Flowcharts, Sequence diagrams, Database ERDs, UML Class diagrams, and Grid layouts. Prioritize horizontal layouts ('direction: right' or square). Keep text clean.
- Use Chart.js JSON config (chartjs code blocks) for all statistical charts and data visualizations: bar charts, line charts, pie/doughnut charts, scatter plots, radar charts, etc.
- EVERY diagram or chart (both D2 and Chart.js) MUST ALWAYS have a clear, descriptive title to make it self-explanatory.
CRITICAL D2 SYNTAX RULES:
1. Valid shapes ONLY: rectangle, square, page, parallelogram, document, cylinder, queue, package, step, callout, stored_data, person, diamond, oval, circle, hexagon, cloud. Do NOT use "folder", "star", "triangle", "card", "rounded_square", "rounded-rectangle".
2. Nested nodes MUST use full path from outside (e.g., 'Nucleus.mRNA -> Cytoplasm.Ribosome'). Plain 'mRNA -> Ribosome' is a syntax error.
3. Text labels with spaces/special characters MUST be quoted in double quotes. E.g. A: "Label text"
4. Color Styling & Padding: Set theme-id (3: Grape Soda, 4: Mixed Berry, 5: Sunset Glow, 6: Forest, 7: Cool Classics) and ALWAYS specify a border padding 'pad: 30' (value between 20 and 50) in vars.d2-config to leave comfortable empty space around all 4 sides of the diagram.
5. Node identifiers (keys) MUST be ASCII-only, without spaces, special characters, or non-ASCII/accented letters (e.g. use 'Nen' or 'Compressor' instead of 'Nén'). Accents, spaces, and Unicode are ONLY allowed inside the double-quoted label string value (e.g. Nen: "Nén").
PREMIUM DIAGRAM GUIDELINES (Make them beautiful!):
- Use styling classes ('classes: { classname: { style.fill: "#hex"; style.stroke: "#hex" } }') to define reusable styles.
- Enhance key boxes with 3D/Shadow: 'style.3d: true' or 'style.shadow: true'.
- Make connections dynamic: use 'style.animated: true' for active/important data flows (in cycles, pipelines, or feedback loops, animate ALL connections in the path to show the flow clearly).
- ALWAYS add titles or legends using positioning: e.g., 'title: "My Diagram" {near: top-center; style.font-size: 16; style.bold: true}'.
- Leave clean margins by specifying border padding, e.g. 'pad: 30' inside vars.d2-config.
D2 Example (Beautiful):
\`\`\`d2
vars: { d2-config: { theme-id: 5; pad: 30 } }
classes: {
  core: {
    style.fill: "#ff79c6"
    style.stroke: "#bd93f9"
    style.3d: true
  }
}
direction: right
title: "Data Pipeline" {
  near: top-left
  style.bold: true
  style.font-size: 16
}
Start: "Ingestion" {
  class: core
}
Queue: "Kafka Queue" {
  shape: queue
  style.shadow: true
}
Processor: "Worker Node" {
  shape: cylinder
  style.3d: true
}
Start -> Queue: "stream" { style.animated: true }
Queue -> Processor: "batch write" { style.animated: true }
A: "Start" -> B: "End" { style.animated: true }
\`\`\`
D2 Features Syntax:
- Sequence Diagram: 'seq: { shape: sequence_diagram; alice -> bob: "hello" }'
- SQL Table: 'users: { shape: sql_table; id: int {constraint: primary_key} }'
- UML Class: 'parser: { shape: class; +read(): string; -buffer: string }'
- Grid Layout: 'grid: { grid-rows: 2; grid-columns: 2; cell1; cell2 }'
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
[Context & Privacy]
Treat user data as factual and invisible. Do not reference system tags/sources. Never infer/include sensitive details (health, origin, religion, finance, etc.) unless requested.`;
    return instruction;
}

function buildProofreadSystemPrompt(responseLanguage = 'auto') {
    let languageInstruction = "Refine/translate ALL input into polished, native-level English fluency.";
    return `[Role]: Elite professional editor.
[Task]: Refine text inside <text> into sophisticated English.
[Rules]:
1. Output ONLY the refined text. No headers (e.g. [REVISED]), chat, or explanations.
2. ${languageInstruction}
3. Maintain original tone/intent but elevate to native fluency.
4. No hedging or offering options. Provide the best single version.
5. If extra context/instructions are provided, follow them implicitly but still output ONLY the final text.`;
}

async function getGeminiApiKey(providerId = null) {
    const data = await chrome.storage.local.get(['providers']);
    const providers = data.providers || [];
    let provider = null;
    if (providerId) {
        provider = providers.find(p => p.id === providerId && p.apiKey);
    }
    if (!provider) {
        provider = providers.find(p => (p.type === 'gemini' || (typeof p.endpoint === 'string' && p.endpoint.includes('generativelanguage.googleapis.com'))) && p.apiKey);
    }
    if (provider && provider.apiKey) {
        const keys = provider.apiKey.split(',').map(k => k.trim()).filter(k => k);
        if (keys.length === 0) return null;
        const groupKey = 'rot_' + keys.join(',').substring(0, 32).replace(/[^a-zA-Z0-9]/g, '');
        const today = getTodayString();
        let activeIndex = 0;
        try {
            const rotData = await chrome.storage.local.get([groupKey]);
            const state = rotData[groupKey];
            if (state && state.date === today && state.index >= 0 && state.index < keys.length) {
                activeIndex = state.index;
            }
        } catch (e) { }
        return keys[activeIndex] || keys[0];
    }
    return null;
}

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

function uint8ArrayToBase64(uint8Array) {
    let binary = '';
    const len = uint8Array.byteLength;
    const chunk = 8192;
    for (let i = 0; i < len; i += chunk) {
        const slice = uint8Array.subarray(i, i + chunk);
        binary += String.fromCharCode.apply(null, slice);
    }
    return btoa(binary);
}

async function readOpfsFileAsBase64(fileUri, fileName) {
    try {
        const urlParts = fileUri.replace('local-db://', '').split('/');
        if (urlParts.length >= 3) {
            const sessionId = urlParts[0];
            const attachmentId = urlParts[1];
            const name = urlParts.slice(2).join('/');
            const key = `${sessionId}_${attachmentId}_${name}`;
            const blob = await LuminaAttachmentDB.get(key);
            if (blob) {
                const dataUrl = await LuminaAttachmentDB.blobToDataURL(blob);
                if (dataUrl) {
                    return dataUrl.split(',')[1];
                }
            }
        }
    } catch (e) {
        console.error(`[Lumina DB Read] Failed to read ${fileName}:`, e);
    }
    return null;
}

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

function filterParentAttachments(attachments) {
    if (!attachments || !Array.isArray(attachments)) return [];
    const parentIds = new Set();
    for (const item of attachments) {
        if (item && typeof item === 'object' && item.parentAttachmentId) {
            parentIds.add(item.parentAttachmentId);
        }
    }
    return attachments.filter(item => {
        if (item && typeof item === 'object' && item.attachmentId && parentIds.has(item.attachmentId)) {
            return false;
        }
        return true;
    });
}

function processAttachments(attachments) {
    const parts = [];
    const unsupported = [];
    if (!attachments || !Array.isArray(attachments)) return { parts, unsupported };
    const filteredAttachments = filterParentAttachments(attachments);
    for (const item of filteredAttachments) {
        if (typeof item === 'string') {
            if (item.startsWith('data:text/')) {
                const matches = item.match(/^data:([^;]+);base64,(.+)$/i);
                const decoded = matches ? decodeBase64Utf8(matches[2]) : '';
                if (decoded) parts.push({ type: "text", text: `[Attached text file]\n${decoded}` });
            } else if (item.startsWith('data:')) {
                const matches = item.match(/^data:([^;]+);base64,(.+)$/i);
                if (matches) {
                    const mime = normalizeMimeType(matches[1]);
                    if (mime.startsWith('image/')) {
                        parts.push({ type: "image_url", image_url: { url: item, detail: "auto" } });
                    } else {
                        unsupported.push({ name: 'Attached file', mimeType: mime });
                    }
                }
            } else {
                parts.push({ type: "image_url", image_url: { url: item, detail: "auto" } });
            }
        } else if (typeof item === 'object') {
            const mimeType = normalizeMimeType(item.mimeType || '');
            const itemName = item.name || 'Unnamed file';
            if (mimeType && !isSupportedAttachmentMime(mimeType)) { unsupported.push({ name: itemName, mimeType }); continue; }
            if (isTextAttachmentMime(mimeType)) {
                const textContent = decodeBase64Utf8(getBase64FromAttachment(item));
                if (textContent) parts.push({ type: "text", text: `[Attached file: ${itemName} (${mimeType})]\n${textContent}` });
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
            } else if (mimeType.startsWith('image/')) {
                let url = item.dataUrl || item.previewUrl;
                if (!url && mimeType && item.data) url = `data:${mimeType};base64,${item.data}`;
                if (url) parts.push({ type: "image_url", image_url: { url, detail: item.detail || "auto" } });
            } else {
                unsupported.push({ name: itemName, mimeType });
            }
        }
    }
    return { parts, unsupported };
}

async function processAttachmentsForGemini(attachments) {
    const parts = [];
    const unsupported = [];
    if (!attachments || !Array.isArray(attachments)) return { parts, unsupported };
    const filteredAttachments = filterParentAttachments(attachments);
    for (const item of filteredAttachments) {
        if (typeof item === 'string') {
            if (item.startsWith('data:text/')) {
                const matches = item.match(/^data:([^;]+);base64,(.+)$/i);
                const decoded = matches ? decodeBase64Utf8(matches[2]) : '';
                if (decoded) parts.push({ text: `[Attached text file]\n${decoded}` });
            } else if (item.startsWith('data:')) {
                const matches = item.match(/^data:([^;]+);base64,(.+)$/i);
                if (matches) {
                    const mime = normalizeMimeType(matches[1]);
                    unsupported.push({ name: 'Inline file', mimeType: mime });
                }
            }
        } else if (typeof item === 'object') {
            const mimeType = normalizeMimeType(item.mimeType || '');
            const itemName = item.name || 'Unnamed file';
            if (mimeType && !isSupportedAttachmentMime(mimeType)) { unsupported.push({ name: itemName, mimeType }); continue; }
            if (isTextAttachmentMime(mimeType)) {
                const textContent = decodeBase64Utf8(getBase64FromAttachment(item));
                if (textContent) parts.push({ text: `[Attached file: ${itemName} (${mimeType})]\n${textContent}` });
                continue;
            }
            if (item.fileUri) {
                if (item.fileUri.startsWith('local-db://')) {
                    const b64Data = await readOpfsFileAsBase64(item.fileUri, itemName);
                    if (b64Data) {
                        parts.push({
                            inlineData: {
                                data: b64Data,
                                mimeType: mimeType
                            }
                        });
                    } else {
                        unsupported.push({ name: itemName, mimeType });
                    }
                } else {
                    parts.push({
                        fileData: {
                            fileUri: item.fileUri,
                            mimeType: mimeType
                        }
                    });
                }
            } else {
                unsupported.push({ name: itemName, mimeType });
            }
        }
    }
    return { parts, unsupported };
}

async function buildApiPayload(msgs, currentQ, sysPrompt, activeKey, params) {
    const { model, endpoint, providerType, temperature, topP, parsedCustomParams, normalizedThinkingLevel, isGemini25Model, reasoningMode, imageData, maxTokens = null, isStreaming = true, cachedContent = null } = params;
    const enableWebSearch = true;
    const isGemini = providerType === 'gemini' || (typeof endpoint === 'string' && endpoint.includes('generativelanguage.googleapis.com'));
    if (isGemini) {
        const geminiContents = [];
        for (const msg of msgs) {
            const attachments = msg.files || msg.images;
            const role = (msg.role === 'model' || msg.role === 'assistant') ? 'model' : 'user';
            if (attachments && attachments.length > 0) {
                const parts = [];
                if (!cachedContent) {
                    const processed = await processAttachmentsForGemini(attachments);
                    parts.push(...processed.parts);
                    if (processed.unsupported.length > 0) {
                        parts.push({ text: `[Note] Skipped unsupported attachments: ${processed.unsupported.map(i => i.name).join(', ')}` });
                    }
                }
                if (msg.text) parts.push({ text: msg.text });
                if (parts.length === 0) parts.push({ text: '' });
                geminiContents.push({ role, parts });
            } else {
                geminiContents.push({ role, parts: [{ text: msg.text || '' }] });
            }
        }
        if (imageData && imageData.length > 0) {
            const parts = [];
            if (!cachedContent) {
                const currentAttachments = Array.isArray(imageData) ? imageData : [imageData];
                const processed = await processAttachmentsForGemini(currentAttachments);
                parts.push(...processed.parts);
                if (processed.unsupported.length > 0) {
                    parts.push({ text: `[Note] Skipped unsupported attachments: ${processed.unsupported.map(i => i.name).join(', ')}` });
                }
            }
            if (currentQ) parts.push({ text: currentQ });
            if (parts.length === 0) parts.push({ text: '' });
            geminiContents.push({ role: 'user', parts });
        } else {
            geminiContents.push({ role: 'user', parts: [{ text: currentQ || '' }] });
        }
        const generationConfig = {
            ...parsedCustomParams
        };
        const isGemini3 = /gemini-[3-9]/i.test(model);
        if (!isGemini3) {
            generationConfig.temperature = temperature;
            generationConfig.topP = topP;
        }
        let level = normalizedThinkingLevel || 'minimal';
        if (level === 'none') {
            level = 'minimal';
        }
        if (isGemini3) {
            generationConfig.thinkingConfig = {
                includeThoughts: true,
                thinkingLevel: level
            };
        } else {
            let budget = -1;
            if (level === 'minimal') {
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
        const geminiBody = {
            contents: geminiContents,
            generationConfig,
            safetySettings: [
                { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_CIVIC_INTEGRITY", threshold: "BLOCK_NONE" }
            ],
            ...(sysPrompt ? {
                system_instruction: {
                    parts: [{ text: sysPrompt }]
                }
            } : {}),
            ...(cachedContent ? { cachedContent } : {})
        };
        const hasUrlInHistory = msgs && msgs.some(m => /https?:\/\/[^\s]+/.test(m.text || ''));
        const hasUrl = hasUrlInHistory || /https?:\/\/[^\s]+/.test(currentQ || '');
        const isSecondPassSearch = (currentQ || '').includes('### Web Search Results for');
        const useUrlContext = hasUrl || isSecondPassSearch;
        if (useUrlContext && isGemini3) {
            geminiBody.tools = [{
                url_context: {}
            }];
            if (!/gemini-2\.5-flash-lite/i.test(model)) {
                geminiBody.toolConfig = {
                    includeServerSideToolInvocations: true
                };
            }
        }
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
        if (attachments && attachments.length > 0) {
            const parts = [];
            if (msg.text) parts.push({ type: "text", text: msg.text });
            const processed = processAttachments(attachments);
            parts.push(...processed.parts);
            if (processed.unsupported.length > 0) {
                parts.push({ type: "text", text: `[Note] Skipped unsupported attachments: ${processed.unsupported.map(i => i.name).join(', ')}` });
            }
            openaiMessages.push({ role: (msg.role === 'model' || msg.role === 'assistant') ? 'assistant' : 'user', content: parts });
        } else {
            openaiMessages.push({ role: (msg.role === 'model' || msg.role === 'assistant') ? 'assistant' : 'user', content: msg.text });
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
    const hasCustomTokenLimit = Object.prototype.hasOwnProperty.call(openaiBody, 'max_tokens')
        || Object.prototype.hasOwnProperty.call(openaiBody, 'max_completion_tokens')
        || Object.prototype.hasOwnProperty.call(openaiBody, 'max_output_tokens');
    if (!hasCustomTokenLimit) {
        if (Number.isFinite(maxTokens) && maxTokens > 0) {
            openaiBody.max_tokens = maxTokens;
        } else {
            openaiBody.max_tokens = 4096;
        }
    }
    if (normalizedThinkingLevel && normalizedThinkingLevel !== 'none' && normalizedThinkingLevel !== 'minimal') {
        openaiBody.reasoning_effort = normalizedThinkingLevel;
    }
    return { url: normalizeOpenAICompatibleEndpoint(endpoint, '/chat/completions'), body: openaiBody };
}

async function getModelChain(type = 'text', preferredModel = null) {
    const data = await chrome.storage.local.get(['modelChains', 'providers', 'provider', 'model', 'lastUsedModel', 'dictProvider', 'dictModel']);
    let chain = [];
    if (data.modelChains && data.modelChains[type] && data.modelChains[type].length > 0) {
        chain = [...data.modelChains[type]];
    } else if (type === 'dictionary' && data.dictProvider && data.dictModel) {
        chain = [{ providerId: data.dictProvider, model: data.dictModel }];
    } else {
        if (data.modelChains && data.modelChains['text'] && data.modelChains['text'].length > 0) {
            chain = [...data.modelChains['text']];
        } else {
            chain = [{ providerId: data.provider, model: data.model }];
        }
    }
    const activeModel = preferredModel || (type === 'text' ? data.lastUsedModel : null);
    if (activeModel && activeModel.model) {
        let actPId = activeModel.providerId;
        const actModel = activeModel.model;
        if (!actPId || !data.providers?.some(p => p.id === actPId)) {
            const matchingChainItem = data.modelChains?.text?.find(item => item.model === actModel);
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
            chain.unshift({ providerId: actPId || '', model: actModel });
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
            if (err.name === 'AbortError' || err.message?.includes('aborted') || err.message === 'signal is aborted without reason') {
                throw err;
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
    const enableWebSearch = true;
    const advancedParamsByModel = globalSettings.advancedParamsByModel || {};
    const providerId = config.providerId;
    const compositeKey = providerId ? `${providerId}:${model}` : model;
    const modelParams = advancedParamsByModel[compositeKey] || advancedParamsByModel[model] || {};
    const temperature = requestOptions.temperature ?? modelParams.temperature ?? 1.0;
    const topP = modelParams.topP ?? 1.0;
    const maxTokens = requestOptions.maxTokens ?? modelParams.maxTokens ?? null;
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
    let systemInstruction = systemOverride || buildChatSystemInstruction(reasoningMode, enableWebSearch);
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
        console.log("%c[Lumina Context Debug] Web Source Content:", "color: #34c759; font-weight: bold;", processedContext);
        if (currentMessages.length > 0) {
            const contextInstruction = `\n\n### Webpage Source Content:\n${processedContext}\n\n(Note: This content is for background reference only. Prioritize the user's current goal in the history.)`;
            systemInstruction += contextInstruction;
            systemInstruction += "\nIMPORTANT: If context is provided, prioritize its information and avoid making unsupported claims.";
        } else {
            augmentedQuestion = `### Webpage Source Content:\n${processedContext}\n\n---\n\n### User Instruction:\n${augmentedQuestion}`;
        }
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

async function generateOneOffCompletion(prompt, systemInstruction = "You are a helpful assistant.", modelConfig = null, requestOptions = {}) {
    let provider;
    if (modelConfig && modelConfig.providerId) {
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
        const chain = await getModelChain();
        provider = chain.length > 0 ? chain[0] : null;
    }
    if (!provider) throw new Error("No active AI provider configured.");
    const keys = getKeysArray(provider.apiKey);
    const modelToUse = provider.model;
    const response = await fetchWithRotation(keys, async (key) => {
        const endpoint = (provider.endpoint || 'https://api.groq.com/openai/v1/chat/completions').replace(/\/$/, "");
        if (provider.providerType === 'gemini') {
            const url = `${endpoint}/${modelToUse}:generateContent`;
            const body = {
                contents: [
                    { role: 'user', parts: [{ text: prompt }] }
                ],
                system_instruction: {
                    parts: [{ text: systemInstruction }]
                },
                generationConfig: {
                    temperature: 0.3
                }
            };
            return fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(key ? { 'x-goog-api-key': key } : {})
                },
                body: JSON.stringify(body)
            });
        } else {
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
    if (provider.providerType === 'gemini') {
        return result.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }
    return result.choices?.[0]?.message?.content || '';
}

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

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'keep_alive_start') {
        const sid = request.sessionId;
        if (sid) {
            if (!globalThis.keepAliveResponses) {
                globalThis.keepAliveResponses = new Map();
            }
            globalThis.keepAliveResponses.set(sid, sendResponse);
        }
        return true;
    }
    if (request.action === 'keep_alive_stop') {
        const sid = request.sessionId;
        if (sid && globalThis.keepAliveResponses && globalThis.keepAliveResponses.has(sid)) {
            const pendingSendResponse = globalThis.keepAliveResponses.get(sid);
            try {
                pendingSendResponse({ success: true, stopped: true });
            } catch (e) { }
            globalThis.keepAliveResponses.delete(sid);
        }
        sendResponse({ success: true });
        return false;
    }
    if (request.type === 'LUMINA_CONTENT_UPDATED' && sender.tab) {
        for (const [windowId, port] of sidePanelPorts) {
            if (port) {
                try {
                    port.postMessage({ action: 'content_updated', tabId: sender.tab.id });
                } catch (e) {
                }
            }
        }
        return false;
    }
    switch (request.action) {
        case 'generate_chat_title': {
            const { modelObj, question, images, files, history } = request;
            console.log("[generate_chat_title] Received in background:", { question, images, files, history: history?.length });
            generateChatTitleFromModel(modelObj, question, images, files, history)
                .then(title => sendResponse({ success: true, title }))
                .catch(err => sendResponse({ success: false, error: err.message }));
            return true;
        }
        case 'fetch_image_base64': {
            fetch(request.url)
                .then(res => {
                    if (!res.ok) throw new Error(`HTTP status ${res.status}`);
                    return res.blob();
                })
                .then(blob => {
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        sendResponse({ success: true, dataUrl: reader.result });
                    };
                    reader.onerror = () => {
                        sendResponse({ success: false, error: 'FileReader failed to convert blob' });
                    };
                    reader.readAsDataURL(blob);
                })
                .catch(err => {
                    sendResponse({ success: false, error: err.message });
                });
            return true;
        }
        case 'fetch_dictionary': {
            const word = request.word ? request.word.toLowerCase().trim() : '';
            if (!word) {
                sendResponse({ success: false, error: 'No word provided' });
                return false;
            }

            const getLemma = (w) => {
                if (!w) return '';
                if (w.endsWith('ss')) return w;
                if (w.endsWith('ies')) return w.slice(0, -3) + 'y';
                if (w.endsWith('es')) {
                    const base = w.slice(0, -2);
                    if (base.endsWith('sh') || base.endsWith('ch') || base.endsWith('x') || base.endsWith('s') || base.endsWith('z')) {
                        return base;
                    }
                    return w.slice(0, -1);
                }
                if (w.endsWith('s') && !w.endsWith('us') && !w.endsWith('is') && !w.endsWith('as')) {
                    return w.slice(0, -1);
                }
                if (w.endsWith('ing')) {
                    return w.slice(0, -3);
                }
                if (w.endsWith('ed')) {
                    return w.slice(0, -2);
                }
                return w;
            };

            const fetchFreeDict = (w) => {
                return fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(w)}`, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
                    }
                })
                .then(async res => {
                    if (res.status === 404) return [];
                    if (!res.ok) throw new Error(`HTTP Status ${res.status}`);
                    return res.json();
                });
            };

            const fetchIPA = async (w) => {
                try {
                    const wikiRes = await fetch(`https://en.wiktionary.org/w/api.php?action=parse&page=${encodeURIComponent(w)}&prop=text&format=json`, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
                        }
                    });
                    if (wikiRes.ok) {
                        const wikiData = await wikiRes.json();
                        const html = wikiData?.parse?.text?.['*'] || '';
                        const ipaMatches = [];
                        const regex = /<span class="IPA[^"]*">([^<]+)<\/span>/gi;
                        let match;
                        while ((match = regex.exec(html)) !== null) {
                            const cleaned = match[1].trim();
                            if (cleaned && !ipaMatches.includes(cleaned)) {
                                ipaMatches.push(cleaned);
                            }
                        }
                        return ipaMatches;
                    }
                } catch (e) {
                    console.warn('[Lumina BG] Wiktionary IPA scrape failed:', e);
                }
                return [];
            };

            const wordLower = word.toLowerCase().trim();

            fetchFreeDict(wordLower)
                .then(async data => {
                    if (Array.isArray(data) && data.length > 0) {
                        // Nếu ngay từ ban đầu tra đã có response rồi (nhưng chưa có ipa thì chạy request lấy ipa)
                        let hasPhonetics = data[0].phonetics && data[0].phonetics.some(p => p.text);
                        if (!hasPhonetics) {
                            let ipas = await fetchIPA(wordLower);
                            const lemma = getLemma(wordLower);
                            if (ipas.length === 0 && lemma && lemma !== wordLower) {
                                ipas = await fetchIPA(lemma);
                                if (ipas.length > 0) {
                                    data[0].word = lemma; // Cập nhật hiển thị thành từ gốc
                                }
                            }
                            if (ipas.length > 0) {
                                if (!Array.isArray(data[0].phonetics)) {
                                    data[0].phonetics = [];
                                }
                                data[0].phonetics.push({ text: ipas[0] });
                                if (ipas[1]) {
                                    data[0].phonetics.push({ text: ipas[1] });
                                }
                            }
                        }
                        sendResponse({ success: true, data });
                    } else {
                        // nếu tra từ gốc trên Free Dictionary API không có response -> lúc này fallback về getlemma và chạy đồng thời getIPA, Free Dictionary API
                        const lemma = getLemma(wordLower);
                        if (lemma && lemma !== wordLower) {
                            try {
                                const [lemmaData, ipas] = await Promise.all([
                                    fetchFreeDict(lemma).catch(() => []),
                                    fetchIPA(lemma).catch(() => [])
                                ]);

                                if (Array.isArray(lemmaData) && lemmaData.length > 0) {
                                    let hasPhonetics = lemmaData[0].phonetics && lemmaData[0].phonetics.some(p => p.text);
                                    if (!hasPhonetics && ipas.length > 0) {
                                        if (!Array.isArray(lemmaData[0].phonetics)) {
                                            lemmaData[0].phonetics = [];
                                        }
                                        lemmaData[0].phonetics.push({ text: ipas[0] });
                                        if (ipas[1]) {
                                            lemmaData[0].phonetics.push({ text: ipas[1] });
                                        }
                                    }
                                    sendResponse({ success: true, data: lemmaData });
                                } else {
                                    sendResponse({ success: true, data: [] });
                                }
                            } catch (e) {
                                console.warn('[Lumina BG] Concurrent lemma fetch failed:', e);
                                sendResponse({ success: true, data: [] });
                            }
                        } else {
                            sendResponse({ success: true, data: [] });
                        }
                    }
                })
                .catch(err => {
                    console.error(`[Lumina BG] fetch_dictionary error:`, err.message);
                    sendResponse({ success: false, error: err.message });
                });
            return true;
        }
        case 'fetch_images': {
            const keyword = request.keyword;
            const cleanKeyword = `${keyword} -watermark -stock -site:shutterstock.com -site:alamy.com -site:123rf.com -site:depositphotos.com -site:dreamstime.com -site:gettyimages.com`;
            const url = `https://www.google.com/search?q=${encodeURIComponent(cleanKeyword)}&udm=2&tbs=isz:l,iar:w`;
            fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            })
                .then(res => res.text())
                .then(html => {
                    const regex = /\["(https?:\/\/[^"]+?\.(?:jpg|jpeg|png))",\d+,\d+\]/g;
                    let matches = [];
                    let match;
                    while ((match = regex.exec(html)) !== null) {
                        if (!match[1].includes('gstatic.com')) {
                            matches.push(match[1]);
                        }
                    }
                    const uniqueLinks = [...new Set(matches)].slice(0, 20);
                    sendResponse({ success: true, images: uniqueLinks });
                })
                .catch(err => {
                    console.error('[Lumina BG] fetch_images error:', err);
                    sendResponse({ success: false, error: err.message });
                });
            return true;
        }

        case 'check_sidepanel_open': {
            const windowIdSync = sender.tab ? sender.tab.windowId : null;
            sendResponse({ isOpen: !!(windowIdSync && sidePanelPorts.has(windowIdSync)) });
            return;
        }
        case 'get_stored_files': {
            (async () => {
                try {
                    const metadata = await LuminaAttachmentDB.getAllMetadata();
                    const files = [];
                    for (const item of metadata) {
                        const parts = item.key.split('_');
                        let sessionId = 'unknown';
                        let attachmentId = 'unknown';
                        let displayName = item.key;
                        if (parts.length >= 3) {
                            sessionId = parts[0] + '_' + parts[1];
                            attachmentId = parts[2];
                            displayName = parts.slice(3).join('_');
                        }
                        files.push({
                            rawName: item.key,
                            displayName: displayName,
                            sessionId: sessionId,
                            attachmentId: attachmentId,
                            size: item.size,
                            lastModified: Date.now()
                        });
                    }
                    files.sort((a, b) => b.size - a.size);
                    sendResponse({ success: true, files });
                } catch (e) {
                    console.error('[DB get_stored_files] error:', e);
                    sendResponse({ success: false, error: e.message });
                }
            })();
            return true;
        }
        case 'delete_stored_file': {
            (async () => {
                try {
                    await LuminaAttachmentDB.delete(request.fileName);
                    sendResponse({ success: true });
                } catch (e) {
                    console.error('[DB delete_stored_file] error:', e);
                    sendResponse({ success: false, error: e.message });
                }
            })();
            return true;
        }
        case 'cleanup_opfs_files': {
            (async () => {
                try {
                    const metadata = await LuminaAttachmentDB.getAllMetadata();
                    const sessionsResult = await chrome.storage.local.get(['lumina_chat_sessions']);
                    const sessions = sessionsResult.lumina_chat_sessions || {};
                    const activeSessionIds = new Set(Object.keys(sessions));
                    for (const item of metadata) {
                        const parts = item.key.split('_');
                        if (parts.length >= 2) {
                            const fileSessionId = parts[0] + '_' + parts[1];
                            if (!activeSessionIds.has(fileSessionId)) {
                                await LuminaAttachmentDB.delete(item.key);
                                console.log(`[DB Cleanup] Deleted orphaned attachment: ${item.key}`);
                            }
                        }
                    }
                    sendResponse({ success: true });
                } catch (e) {
                    console.error('[DB cleanup_db_files] error:', e);
                    sendResponse({ success: false, error: e.message });
                }
            })();
            return true;
        }
        case 'upload_gemini_file': {
            (async () => {
                const attachmentId = request.attachmentId || `att_${Date.now()}`;
                const sessionId = request.sessionId || 'temp_session';
                const controller = new AbortController();
                if (attachmentId) {
                    activeUploads.set(attachmentId, controller);
                }
                try {
                    const binaryString = atob(request.fileData);
                    const len = binaryString.length;
                    const bytes = new Uint8Array(len);
                    for (let i = 0; i < len; i++) {
                        bytes[i] = binaryString.charCodeAt(i);
                    }
                    try {
                        const dbKey = `${sessionId}_${attachmentId}_${request.fileName}`;
                        const blob = new Blob([bytes], { type: request.mimeType || 'application/octet-stream' });
                        await LuminaAttachmentDB.put(dbKey, blob);
                        console.log(`[DB Storage] Wrote ${dbKey} of size ${len} bytes`);
                    } catch (storeErr) {
                        console.error('[DB Storage] Failed to write file locally:', storeErr);
                    }
                    const fileUrl = `local-db://${sessionId}/${attachmentId}/${request.fileName}`;
                    sendResponse({
                        success: true,
                        file: {
                            uri: fileUrl,
                            name: request.fileName
                        }
                    });
                } catch (e) {
                    console.error('[Lumina Upload] error:', e);
                    sendResponse({ success: false, error: e.message });
                } finally {
                    if (attachmentId) {
                        activeUploads.delete(attachmentId);
                    }
                }
            })();
            return true;
        }
        case 'abort_gemini_upload': {
            const attachmentId = request.attachmentId;
            if (attachmentId && activeUploads.has(attachmentId)) {
                try {
                    activeUploads.get(attachmentId).abort();
                    activeUploads.delete(attachmentId);
                } catch (e) {
                    console.warn('[Lumina BG] Error aborting upload:', e);
                }
            }
            sendResponse({ success: true });
            return;
        }
        case 'preview_spark': {
            (async () => {
                try {
                    const { messages, model, providerId } = request;
                    const data = await chrome.storage.local.get(['providers', 'advancedParamsByModel']);
                    const found = data.providers?.find(p => p.id === providerId);
                    if (!found) {
                        sendResponse({ error: 'Provider not found' });
                        return;
                    }
                    const keys = getKeysArray(found.apiKey);
                    const endpoint = (found.endpoint || '').replace(/\/$/, '');
                    const modelToUse = model || found.model || 'gemini-2.0-flash';
                    const advancedParamsByModel = data.advancedParamsByModel || {};
                    const compositeKey = providerId ? `${providerId}:${modelToUse}` : modelToUse;
                    const modelParams = advancedParamsByModel[compositeKey] || advancedParamsByModel[modelToUse] || {};
                    const temperature = modelParams.temperature ?? 0.7;
                    const topP = modelParams.topP ?? 1.0;
                    const maxTokens = modelParams.maxTokens ?? null;
                    const thinkingLevel = modelParams.thinkingLevel || null;
                    const customParams = modelParams.customParams || {};
                    let parsedCustomParams = {};
                    if (customParams) {
                        if (typeof customParams === 'object') {
                            parsedCustomParams = customParams;
                        } else if (typeof customParams === 'string') {
                            try { parsedCustomParams = JSON.parse(customParams); } catch (e) { }
                        }
                    }
                    const normalizedModelName = modelToUse.toLowerCase();
                    const isGemini3 = /gemini-[3-9]/i.test(modelToUse);
                    const normalizedThinkingLevel = (typeof thinkingLevel === 'string' ? thinkingLevel.trim().toLowerCase() : '');
                    const response = await fetchWithRotation(keys, async (key) => {
                        if (found.type === 'gemini') {
                            const url = `${endpoint}/${modelToUse}:generateContent`;
                            const generationConfig = {
                                ...parsedCustomParams
                            };
                            if (!isGemini3) {
                                generationConfig.temperature = temperature;
                                generationConfig.topP = topP;
                            }
                            let level = normalizedThinkingLevel || 'minimal';
                            if (level === 'none') {
                                level = 'minimal';
                            }
                            if (isGemini3) {
                                generationConfig.thinkingConfig = {
                                    includeThoughts: true,
                                    thinkingLevel: level
                                };
                            } else {
                                let budget = -1;
                                if (level === 'minimal') {
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
                            return fetch(url, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    ...(key ? { 'x-goog-api-key': key } : {})
                                },
                                body: JSON.stringify({
                                    contents: messages,
                                    generationConfig: generationConfig
                                })
                            });
                        } else {
                            const openAiMessages = messages.map(m => ({
                                role: m.role === 'model' ? 'assistant' : m.role,
                                content: m.parts?.[0]?.text || ''
                            }));
                            const body = {
                                model: modelToUse,
                                messages: openAiMessages,
                                temperature: temperature,
                                top_p: topP,
                                ...parsedCustomParams
                            };
                            if (maxTokens) {
                                body.max_tokens = maxTokens;
                            }
                            if (normalizedThinkingLevel && normalizedThinkingLevel !== 'none' && normalizedThinkingLevel !== 'minimal') {
                                body.reasoning_effort = normalizedThinkingLevel;
                            }
                            return fetch(endpoint || 'https://api.openai.com/v1/chat/completions', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    ...(key ? { 'Authorization': `Bearer ${key}` } : {})
                                },
                                body: JSON.stringify(body)
                            });
                        }
                    }, {});
                    if (!response.ok) {
                        const errText = await response.text();
                        sendResponse({ error: `API error (${response.status}): ${errText.slice(0, 200)}` });
                        return;
                    }
                    const result = await response.json();
                    let text = '';
                    if (found.type === 'gemini') {
                        text = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
                    } else {
                        text = result.choices?.[0]?.message?.content || '';
                    }
                    sendResponse({ text });
                } catch (e) {
                    console.error('[Lumina BG] preview_spark error:', e);
                    sendResponse({ error: e.message });
                }
            })();
            return true;
        }
        case 'get_system_tokens': {
            const reasoningMode = request.reasoningMode || false;
            const isProofread = request.isProofread || false;
            let prompt = "";
            if (isProofread) {
                prompt = buildProofreadSystemPrompt(request.language || 'auto');
            } else {
                prompt = buildChatSystemInstruction(reasoningMode);
            }
            const tokens = (typeof countTokens !== 'undefined') ? countTokens(prompt) : Math.ceil(prompt.length / 2);
            sendResponse({ tokens });
            return true;
        }
        case 'pasteDictationText':
            pasteDictationText(request.text);
            return;
        case 'translate_input_text': {
            const textToTranslate = request.text || '';
            const runGoogleTranslate = (text, callback) => {
                const firstUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=vi&dt=t&q=${encodeURIComponent(text)}`;
                fetch(firstUrl)
                    .then(response => {
                        if (!response.ok) throw new Error(`HTTP ${response.status}`);
                        return response.json();
                    })
                    .then(data => {
                        const detectedLang = data[2];
                        const translatedToVi = data[0].map(item => item[0]).join('');
                        if (detectedLang === 'en') {
                            const secondUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=vi&tl=en&dt=t&q=${encodeURIComponent(translatedToVi)}`;
                            return fetch(secondUrl)
                                .then(response => {
                                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                                    return response.json();
                                })
                                .then(data2 => {
                                    const finalEnText = data2[0].map(item => item[0]).join('');
                                    callback({ translatedText: finalEnText });
                                });
                        } else {
                            const secondUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(text)}`;
                            return fetch(secondUrl)
                                .then(response => {
                                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                                    return response.json();
                                })
                                .then(data2 => {
                                    const finalEnText = data2[0].map(item => item[0]).join('');
                                    callback({ translatedText: finalEnText });
                                });
                        }
                    })
                    .catch(err => {
                        console.error("[Lumina BG] translate_input_text round-trip failed, falling back to direct translate:", err);
                        translateText(text, "en")
                            .then(res => {
                                callback({ translatedText: res.translation || text });
                            })
                            .catch(fallbackErr => {
                                console.error("[Lumina BG] translate_input_text fallback failed:", fallbackErr);
                                callback({ translatedText: text });
                            });
                    });
            };
            chrome.storage.local.get(['translateInputEngine', 'dictProvider', 'dictModel'], async (items) => {
                const engine = items.translateInputEngine || 'google';
                if (engine === 'ai' && items.dictProvider && items.dictModel) {
                    try {
                        const systemPrompt = "Translate the user's text into English naturally and colloquially. Output ONLY the final translation, without any introduction, explanations, or quotes. Keep the original format.";
                        const translatedText = await generateOneOffCompletion(textToTranslate, systemPrompt, {
                            providerId: items.dictProvider,
                            model: items.dictModel
                        });
                        const cleanedText = translatedText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
                        sendResponse({ translatedText: cleanedText });
                    } catch (err) {
                        console.error("[Lumina BG] AI translation failed, falling back to Google Translate:", err);
                        runGoogleTranslate(textToTranslate, sendResponse);
                    }
                } else {
                    runGoogleTranslate(textToTranslate, sendResponse);
                }
            });
            return true;
        }
        case 'open_sidepanel':
        case 'ensure_sidepanel_open': {
            const windowIdManual = sender.tab ? sender.tab.windowId : null;
            if (windowIdManual) {
                if (request.action === 'open_sidepanel') {
                    toggleSidePanel(windowIdManual);
                } else {
                    ensureSidePanelOpen(windowIdManual);
                }
                if (request.youtubeTrigger && sender.tab) {
                    const enrichedTrigger = {
                        ...request.youtubeTrigger,
                        tabId: sender.tab.id,
                        title: sender.tab.title || request.youtubeTrigger.title,
                        url: sender.tab.url || request.youtubeTrigger.url
                    };
                    chrome.storage.local.set({ 'lumina_youtube_trigger': enrichedTrigger });
                }
                const isInternal = sender.tab && sender.tab.url && sender.tab.url.includes('/pages/spotlight/spotlight.html');
                const sourceTab = (sender.tab && !isInternal) ? {
                    tabId: sender.tab.id,
                    title: sender.tab.title,
                    url: sender.tab.url
                } : null;
                if (sourceTab && sidePanelPorts.has(windowIdManual)) {
                    chrome.storage.local.get(['readWebpage'], (res) => {
                        const isReadWebpageEnabled = res.readWebpage !== false;
                        if (isReadWebpageEnabled) {
                            chrome.runtime.sendMessage({ action: 'pin_web_source', windowId: windowIdManual, source: sourceTab });
                        }
                    });
                }
            }
            sendResponse({ success: true });
            return true;
        }
        case 'open_sidepanel_with_query': {
            const windowIdQuery = sender.tab ? sender.tab.windowId : null;
            if (windowIdQuery) {
                const queryId = Date.now() + '-' + Math.random().toString(36).substring(2, 9);
                const isInternal = sender.tab && sender.tab.url && sender.tab.url.includes('/pages/spotlight/spotlight.html');
                const sourceTab = (sender.tab && !isInternal) ? {
                    tabId: sender.tab.id,
                    title: sender.tab.title,
                    url: sender.tab.url
                } : null;
                const isCurrentlyOpen = sidePanelPorts.has(windowIdQuery);
                const queryData = {
                    query: request.query,
                    displayQuery: request.displayQuery,
                    queryId,
                    mode: request.mode,
                    sourceTab: sourceTab,
                    isInternal: isInternal,
                    createNewChat: !isCurrentlyOpen,
                    timestamp: Date.now()
                };
                chrome.storage.local.set({ [`pending_sidepanel_query_${windowIdQuery}`]: queryData }, () => {
                    chrome.sidePanel.open({ windowId: windowIdQuery }).catch(() => { });
                    if (sidePanelPorts.has(windowIdQuery)) {
                        chrome.runtime.sendMessage({ action: 'ask_sidepanel', windowId: windowIdQuery, ...queryData });
                    }
                });
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
        case 'open_options': {
            let optionsUrl = chrome.runtime.getURL('pages/spotlight/spotlight.html?settings=1');
            if (request.section) optionsUrl += `&section=${request.section}`;
            if (request.requestMic) optionsUrl += '&requestMic=1';
            chrome.tabs.create({ url: optionsUrl });
            return true;
        }
        case 'translate':
            translateText(request.text, request.targetLang).then(sendResponse).catch(err => sendResponse({ error: err.message }));
            return true;
        case 'proofread':
            proofreadText(request.text).then(sendResponse).catch(err => sendResponse({ error: err.message }));
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
                            let isGemini = provider.type === 'gemini' || (typeof provider.endpoint === 'string' && provider.endpoint.includes('generativelanguage.googleapis.com'));
                            if (activeModelConfig && provider.id !== activeModelConfig.providerId) {
                                if (isGemini) modelToUse = 'gemini-3.5-flash';
                                else if (provider.type === 'openai') modelToUse = 'gpt-4o-mini';
                                else if (provider.type === 'groq') modelToUse = 'llama-3.3-70b-versatile';
                            }
                            for (const key of keys) {
                                try {
                                    let response;
                                    if (provider.type === 'gemini') {
                                        const url = `${provider.endpoint.replace(/\/$/, '')}/${modelToUse}:generateContent`;
                                        response = await fetch(url, {
                                            method: 'POST',
                                            headers: {
                                                'Content-Type': 'application/json',
                                                ...(key ? { 'x-goog-api-key': key } : {})
                                            },
                                            body: JSON.stringify({
                                                contents: [
                                                    { role: 'user', parts: [{ text: prompt }] }
                                                ],
                                                system_instruction: {
                                                    parts: [{ text: 'You are a memory consolidation assistant.' }]
                                                },
                                                generationConfig: {
                                                    temperature: 0.3
                                                }
                                            })
                                        });
                                    } else {
                                        const endpoint = normalizeOpenAICompatibleEndpoint(provider.endpoint || 'https://api.groq.com/openai/v1/chat/completions', '/chat/completions');
                                        response = await fetch(endpoint, {
                                            method: 'POST',
                                            headers: {
                                                'Content-Type': 'application/json',
                                                ...(key ? { 'Authorization': `Bearer ${key}` } : {})
                                            },
                                            body: JSON.stringify({
                                                model: modelToUse,
                                                messages: [
                                                    { role: 'system', content: 'You are a memory consolidation assistant.' },
                                                    { role: 'user', content: prompt }
                                                ],
                                                temperature: 0.3,
                                                max_tokens: 8192
                                            })
                                        });
                                    }
                                    if (!response.ok) continue;
                                    const result = await response.json();
                                    const text = provider.type === 'gemini'
                                        ? (result.candidates?.[0]?.content?.parts?.[0]?.text || '')
                                        : (result.choices?.[0]?.message?.content || '');
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
                        const chunks = [request.text];
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

let spotlightWindowId = null;
let spotlightInitialPosition = null;
let spotlightHasMoved = false;

async function getSpotlightWindowId() {
    if (spotlightWindowId) {
        try {
            const win = await chrome.windows.get(spotlightWindowId);
            if (win) return spotlightWindowId;
        } catch (e) {
            spotlightWindowId = null;
        }
    }
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

chrome.commands.onCommand.addListener(async (command, tab) => {
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
        if (tab && tab.windowId) {
            toggleSidePanel(tab.windowId);
        } else {
            chrome.windows.getCurrent({ populate: false }, (currentWindow) => {
                if (currentWindow && currentWindow.id) {
                    toggleSidePanel(currentWindow.id);
                }
            });
        }
    }
});

let isCreatingSpotlight = false;

async function createSpotlightWindow() {
    const currentId = await getSpotlightWindowId();
    if (currentId) {
        try {
            const win = await chrome.windows.get(currentId);
            if (win) {
                if (win.focused) {
                    await chrome.windows.remove(currentId);
                    isCreatingSpotlight = false;
                    return;
                } else {
                    await chrome.windows.update(currentId, { focused: true });
                    isCreatingSpotlight = false;
                    return;
                }
            }
        } catch (e) {
            spotlightWindowId = null;
            chrome.storage.local.remove('spotlightWindowId');
        }
    }
    if (isCreatingSpotlight) {
        return;
    }
    isCreatingSpotlight = true;
    try {
        const saved = await new Promise(resolve => {
            chrome.storage.local.get(['spotlightWidth', 'spotlightHeight', 'spotlightLeft', 'spotlightTop'], resolve);
        });
        const windowWidth = saved.spotlightWidth || 400;
        const windowHeight = saved.spotlightHeight || 400;
        try {
            const displays = await chrome.system.display.getInfo();
            const lastFocused = await new Promise(resolve => {
                chrome.windows.getLastFocused({ populate: false }, (win) => {
                    resolve(chrome.runtime.lastError ? null : win);
                });
            });
            let left, top;
            const isPositionValid = (x, y, w, h) => {
                for (const display of displays) {
                    const bounds = display.workArea;
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
            if (saved.spotlightLeft !== undefined && saved.spotlightTop !== undefined) {
                if (isPositionValid(saved.spotlightLeft, saved.spotlightTop, windowWidth, windowHeight)) {
                    left = saved.spotlightLeft;
                    top = saved.spotlightTop;
                } else {
                    await chrome.storage.local.remove(['spotlightLeft', 'spotlightTop']);
                }
            }
            if (left === undefined || top === undefined) {
                let targetDisplay = null;
                if (lastFocused && lastFocused.left !== undefined && lastFocused.top !== undefined) {
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
                if (chrome.runtime.lastError || !win) {
                    console.error('[Lumina] Failed to create spotlight window:', chrome.runtime.lastError?.message);
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
                chrome.storage.local.set({ spotlightWindowId: win.id });
            });
        } catch (error) {
            console.error('Error creating spotlight window:', error);
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

chrome.windows.onBoundsChanged.addListener(async (window) => {
    let isSpotlight = (window.id === spotlightWindowId);
    if (!isSpotlight && !spotlightWindowId) {
        const data = await chrome.storage.local.get(['spotlightWindowId']);
        if (data.spotlightWindowId === window.id) {
            spotlightWindowId = window.id;
            isSpotlight = true;
        }
    }
    if (isSpotlight) {
        if (spotlightInitialPosition) {
            const movedX = Math.abs(window.left - spotlightInitialPosition.left) > 5;
            const movedY = Math.abs(window.top - spotlightInitialPosition.top) > 5;
            if (movedX || movedY) {
                if (!spotlightHasMoved) {
                    spotlightHasMoved = true;
                }
                spotlightInitialPosition = { left: window.left, top: window.top };
            }
        }
        chrome.storage.local.set({
            spotlightWidth: window.width,
            spotlightHeight: window.height,
            spotlightLeft: window.left,
            spotlightTop: window.top
        });
    }
});

chrome.windows.onRemoved.addListener(async (removedId) => {
    let isSpotlight = (removedId === spotlightWindowId);
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
        chrome.storage.local.remove('spotlightWindowId');
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
                        const timeoutId = setTimeout(() => {
                            if (!sessionPorts.has(sid)) {
                                const controller = sessionControllers.get(sid);
                                if (controller) {
                                    console.log(`[Lumina BG] Aborting session ${sid} due to port disconnect timeout`);
                                    controller.abort();
                                    sessionControllers.delete(sid);
                                }
                                if (globalThis.keepAliveResponses && globalThis.keepAliveResponses.has(sid)) {
                                    const pendingSendResponse = globalThis.keepAliveResponses.get(sid);
                                    try {
                                        pendingSendResponse({ success: true, aborted: true });
                                    } catch (e) { }
                                    globalThis.keepAliveResponses.delete(sid);
                                }
                            }
                        }, 5000);
                        if (!globalThis.sessionAbortTimeouts) {
                            globalThis.sessionAbortTimeouts = new Map();
                        }
                        globalThis.sessionAbortTimeouts.set(sid, timeoutId);
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
                    if (globalThis.sessionAbortTimeouts && globalThis.sessionAbortTimeouts.has(sid)) {
                        clearTimeout(globalThis.sessionAbortTimeouts.get(sid));
                        globalThis.sessionAbortTimeouts.delete(sid);
                    }
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
                if (globalThis.sessionAbortTimeouts && globalThis.sessionAbortTimeouts.has(msg.sessionId)) {
                    clearTimeout(globalThis.sessionAbortTimeouts.get(msg.sessionId));
                    globalThis.sessionAbortTimeouts.delete(msg.sessionId);
                }
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
    if (port.name === 'lumina-audio-stream') {
        port.onMessage.addListener(async (msg) => {
            if (msg.action === 'play_stream') {
                const text = msg.text;
                if (!text) return;
                const detectLanguage = (text) => {
                    let counts = {
                        vietnamese: 0,
                        chinese: 0,
                        japanese: 0,
                        korean: 0,
                        cyrillic: 0,
                        latin: 0
                    };
                    const vietnameseRegex = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/gi;
                    for (const char of text) {
                        const code = char.charCodeAt(0);
                        if (code >= 0x4E00 && code <= 0x9FFF) {
                            counts.chinese++;
                        }
                        else if (code >= 0x3040 && code <= 0x309F) {
                            counts.japanese++;
                        }
                        else if (code >= 0x30A0 && code <= 0x30FF) {
                            counts.japanese++;
                        }
                        else if (code >= 0xAC00 && code <= 0xD7AF) {
                            counts.korean++;
                        }
                        else if (code >= 0x0400 && code <= 0x04FF) {
                            counts.cyrillic++;
                        }
                        else if ((code >= 0x0041 && code <= 0x007A) || (code >= 0x00C0 && code <= 0x00FF)) {
                            counts.latin++;
                        }
                    }
                    const vietnameseMatches = text.match(vietnameseRegex);
                    if (vietnameseMatches) {
                        counts.vietnamese = vietnameseMatches.length;
                    }
                    const total = Object.values(counts).reduce((a, b) => a + b, 0);
                    if (total === 0) return 'en-GB';
                    const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
                    const langMap = {
                        chinese: 'zh-CN',
                        japanese: 'ja',
                        korean: 'ko',
                        cyrillic: 'ru',
                        latin: 'en-GB',
                        vietnamese: 'vi'
                    };
                    if (dominant[0] === 'latin' && counts.vietnamese > 0 && counts.vietnamese / counts.latin > 0.15) {
                        return 'vi';
                    }
                    return langMap[dominant[0]] || 'en-GB';
                };
                const detectedLang = detectLanguage(text);
                const googleChunks = [];
                const sentences = text.match(/[^.?!]+[.?!]+/g) || [text];
                const cleanSentences = sentences
                    .map(s => s.trim())
                    .filter(s => {
                        const textOnly = s.replace(/[.?!,;:]/g, '').trim();
                        return textOnly.length >= 2;
                    });
                if (cleanSentences.length <= 1) {
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
                const executeGoogleFallback = async () => {
                    port.postMessage({ type: 'meta', total: googleChunks.length, lang: detectedLang });
                    const fetchChunk = async (chunk, index) => {
                        try {
                            const encodedText = encodeURIComponent(chunk);
                            const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${detectedLang}&client=tw-ob&q=${encodedText}&total=1&idx=0`;
                            const response = await fetch(url, { referrerPolicy: 'no-referrer' });
                            if (!response.ok) throw new Error(`HTTP ${response.status}`);
                            const contentType = response.headers.get('Content-Type');
                            if (contentType && !contentType.includes('audio') && !contentType.includes('mpeg')) {
                                const text = await response.text();
                                throw new Error('Invalid content type: ' + contentType);
                            }
                            const rawBlob = await response.blob();
                            const blob = new Blob([rawBlob], { type: 'audio/mpeg' });
                            return new Promise((resolve) => {
                                const reader = new FileReader();
                                reader.onloadend = () => {
                                    const base64DataUrl = reader.result;
                                    try {
                                        port.postMessage({
                                            type: 'chunk',
                                            index: index,
                                            data: base64DataUrl
                                        });
                                    } catch (e) { }
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
                    await Promise.all(googleChunks.map((chunk, index) => fetchChunk(chunk, index)));
                    try { port.postMessage({ type: 'done' }); } catch (e) { }
                };
                await executeGoogleFallback();
            }
        });
    }
});

async function translateTextGoogle(text, targetLang = 'vi') {
    let fromLang = 'auto';
    if (targetLang === 'en') {
        fromLang = 'vi';
    } else if (targetLang === 'vi') {
        fromLang = 'en';
    }
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${fromLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        let translatedText = data[0].map(item => item[0]).join('');
        const letterPrefix = text.match(/^([a-z])\.\s*/i);
        if (letterPrefix) {
            translatedText = translatedText.replace(/^(Một|Hai|Ba|Bốn|Năm|Sáu|Bảy|Tám|Chín|Mười|[A-Z])\.\s*/, letterPrefix[0]);
        }
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

function extractJsonArray(text) {
    let cleanText = text.trim();
    if (cleanText.startsWith('```')) {
        cleanText = cleanText.replace(/^```[a-zA-Z]*\n/, '').replace(/\n```$/, '').trim();
    }
    const startIdx = cleanText.indexOf('[');
    const endIdx = cleanText.lastIndexOf(']');
    if (startIdx !== -1 && endIdx !== -1) {
        cleanText = cleanText.substring(startIdx, endIdx + 1);
    }
    return JSON.parse(cleanText);
}

async function getActiveModelForTranslation() {
    const data = await chrome.storage.local.get([
        'lastUsedModel',
        'providers',
        'advancedParamsByModel'
    ]);
    let config = null;
    if (data.lastUsedModel && data.lastUsedModel.model) {
        const provider = data.providers?.find(p => p.id === data.lastUsedModel.providerId);
        if (provider) {
            config = {
                model: data.lastUsedModel.model,
                providerId: data.lastUsedModel.providerId,
                providerType: provider.type,
                apiKey: provider.apiKey,
                endpoint: provider.endpoint,
                defaultModel: provider.defaultModel
            };
        }
    }
    if (!config) {
        const chain = await getModelChain('text');
        if (chain && chain.length > 0) {
            config = chain[0];
        }
    }
    if (!config) return null;
    const advancedParamsByModel = data.advancedParamsByModel || {};
    const compositeKey = config.providerId ? `${config.providerId}:${config.model}` : config.model;
    const modelParams = advancedParamsByModel[compositeKey] || advancedParamsByModel[config.model] || {};
    const currentModel = config.model;
    const isGemini = config.providerType === 'gemini' ||
        (currentModel && currentModel.toLowerCase().includes('gemini'));
    const isGemma4 = /gemma-4/i.test(currentModel);
    let thinkingLevel = modelParams.thinkingLevel || (isGemma4 ? 'minimal' : (isGemini ? 'minimal' : 'none'));
    if (isGemma4) {
        if (thinkingLevel !== 'high') {
            thinkingLevel = 'minimal';
        }
    } else if (isGemini && thinkingLevel === 'none') {
        thinkingLevel = 'minimal';
    }
    return { config, thinkingLevel };
}

async function translateTextWithAI(text, config, thinkingLevel, targetLang = 'vi') {
    const targetLanguageName = targetLang === 'en' ? 'English' : 'Vietnamese';
    const systemPrompt = `You are a professional, context-aware translator.
Translate the user's text into the target language: ${targetLanguageName}.
You MUST respond with a valid JSON array of objects representing sentence-by-sentence translation.
Do not include any conversational filler, markdown formatting blocks (like \`\`\`json), or text outside the JSON array.
Each object in the JSON array MUST have:
1. "src": The exact original sentence from the input.
2. "tgt": The translated sentence.
Example Input:
Hello. How are you today?
Example Output:
[
  {"src": "Hello.", "tgt": "Xin chào."},
  {"src": "How are you today?", "tgt": "Hôm nay bạn thế nào?"}
]`;
    const keys = getKeysArray(config.apiKey);
    const modelToUse = config.model;
    const normalizedThinkingLevel = (typeof thinkingLevel === 'string' ? thinkingLevel.trim().toLowerCase() : '');
    const response = await fetchWithRotation(keys, async (key) => {
        let payloadUrl = '';
        let payloadBody = {};
        if (config.providerType === 'gemini') {
            let baseEndpoint = config.endpoint.replace(/\/$/, '')
                .replace(/\/openai\/chat\/completions$/, '')
                .replace(/\/chat\/completions$/, '')
                .replace(/\/openai$/, '')
                .replace(/\/models$/, '');
            let urlModel = modelToUse;
            if (!urlModel.startsWith('models/')) {
                urlModel = 'models/' + urlModel;
            }
            payloadUrl = `${baseEndpoint}/${urlModel}:generateContent`;
            const contents = [
                { role: 'user', parts: [{ text: text }] }
            ];
            const geminiConfig = {
                temperature: 0.3,
                responseMimeType: 'application/json'
            };
            const isGemini3 = /gemini-[3-9]/i.test(modelToUse);
            if (isGemini3) {
                geminiConfig.thinkingConfig = {
                    includeThoughts: true,
                    thinkingLevel: 'minimal'
                };
            } else {
                geminiConfig.thinkingConfig = {
                    includeThoughts: false,
                    thinkingBudget: 0
                };
            }
            payloadBody = {
                contents,
                system_instruction: {
                    parts: [{ text: systemPrompt }]
                },
                generationConfig: geminiConfig
            };
        } else {
            payloadUrl = normalizeOpenAICompatibleEndpoint(config.endpoint || 'https://api.groq.com/openai/v1/chat/completions', '/chat/completions');
            const openaiBody = {
                model: modelToUse,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: text }
                ],
                temperature: 0.3,
                response_format: { type: 'json_object' }
            };
            if (normalizedThinkingLevel && normalizedThinkingLevel !== 'none' && normalizedThinkingLevel !== 'minimal') {
                openaiBody.reasoning_effort = normalizedThinkingLevel;
            }
            payloadBody = openaiBody;
        }
        const headers = { 'Content-Type': 'application/json' };
        if (key) {
            if (config.providerType === 'gemini') {
                headers['x-goog-api-key'] = key;
            } else {
                headers['Authorization'] = `Bearer ${key}`;
            }
        }
        return fetch(payloadUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(payloadBody)
        });
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`AI Translation request failed: HTTP ${response.status} - ${errorText}`);
    }
    const resData = await response.json();
    let responseText = '';
    if (config.providerType === 'gemini') {
        responseText = resData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } else {
        responseText = resData.choices?.[0]?.message?.content || '';
    }
    let sentences = [];
    try {
        sentences = extractJsonArray(responseText);
    } catch (e) {
        console.error('[Lumina] Failed to parse JSON translation response:', responseText, e);
        throw new Error('Invalid JSON format from AI Translation');
    }
    if (!Array.isArray(sentences) || sentences.length === 0) {
        throw new Error('AI Translation returned empty or invalid structure');
    }
    const translatedText = sentences.map(s => s.tgt || '').join(' ');
    return {
        type: 'ai_translation',
        original: text,
        translation: translatedText,
        fromProvider: 'ai',
        model: modelToUse,
        sentences: sentences,
        showAudio: true
    };
}

async function translateText(text, targetLang = 'vi') {
    const settings = await chrome.storage.local.get(['translateEngine']);
    const engine = settings.translateEngine || 'google';
    if (engine === 'ai') {
        try {
            const active = await getActiveModelForTranslation();
            if (!active) {
                console.warn('[Lumina] No active AI model found, falling back to Google Translate.');
                return translateTextGoogle(text, targetLang);
            }
            return await translateTextWithAI(text, active.config, active.thinkingLevel, targetLang);
        } catch (err) {
            console.error('[Lumina] AI Translation failed, falling back to Google:', err);
            return translateTextGoogle(text, targetLang);
        }
    } else {
        return translateTextGoogle(text, targetLang);
    }
}

async function proofreadText(text) {
    const fromLang = 'auto';
    const targetLang = 'en';
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${fromLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        let translatedText = data[0].map(item => item[0]).join('');
        return { corrected: translatedText };
    } catch (e) {
        console.error('[Lumina] Google Translate fallback for proofread failed:', e);
        return { corrected: text };
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
            const isVietnamese = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(text);
            if (isVietnamese) {
                const vnVoice = voices.find(v => v.voiceName.includes('Vietnamese') && (v.voiceName.includes('Natural') || v.voiceName.includes('Online')));
                if (vnVoice) voiceName = vnVoice.voiceName;
                else {
                    const vnAny = voices.find(v => v.voiceName.includes('Vietnamese') || v.lang === 'vi-VN');
                    if (vnAny) voiceName = vnAny.voiceName;
                }
            } else {
                let enVoice = voices.find(v => v.voiceName.includes('English') && v.voiceName.includes('Natural') && (v.voiceName.includes('United Kingdom') || v.voiceName.includes('Great Britain')));
                if (!enVoice) enVoice = voices.find(v => v.voiceName.includes('English') && v.voiceName.includes('Natural') && v.voiceName.includes('United States'));
                if (!enVoice) enVoice = voices.find(v => v.voiceName.includes('English') && (v.voiceName.includes('Natural') || v.voiceName.includes('Online')));
                if (!enVoice) enVoice = voices.find(v => v.voiceName.includes('Microsoft') && v.voiceName.includes('English'));
                if (enVoice) voiceName = enVoice.voiceName;
            }
            if (!voiceName) {
                reject(new Error('No native natural voice'));
                return;
            }
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
    if (!(await chrome.offscreen.hasDocument())) {
        await chrome.offscreen.createDocument({
            url: 'pages/offscreen/offscreen.html',
            reasons: ['AUDIO_PLAYBACK'],
            justification: 'Play audio chunks from Google TTS'
        });
    }
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

function getLemma(w) {
    if (!w) return '';
    const word = w.toLowerCase().trim();
    if (word.endsWith('ss')) return word;
    if (word.endsWith('ies')) return word.slice(0, -3) + 'y';
    if (word.endsWith('es')) {
        const base = word.slice(0, -2);
        if (base.endsWith('sh') || base.endsWith('ch') || base.endsWith('x') || base.endsWith('s') || base.endsWith('z')) {
            return base;
        }
        return word.slice(0, -1);
    }
    if (word.endsWith('s') && !word.endsWith('us') && !word.endsWith('is') && !word.endsWith('as')) {
        return word.slice(0, -1);
    }
    return word;
}

function getAmericanSpelling(w) {
    if (!w) return '';
    return w
        .replace(/isation/gi, 'ization')
        .replace(/isations/gi, 'izations')
        .replace(/ise\b/gi, 'ize')
        .replace(/ises\b/gi, 'izes')
        .replace(/ised\b/gi, 'ized')
        .replace(/ising\b/gi, 'izing')
        .replace(/yse\b/gi, 'yze')
        .replace(/yses\b/gi, 'yzes')
        .replace(/ysed\b/gi, 'yzed')
        .replace(/ysing\b/gi, 'yzing');
}

async function fetchAudio(text, speed = 1.0, forcedLang = null) {
    if (!text) return { type: null, chunks: [] };
    let normalizedText = text.trim();
    normalizedText = normalizedText.replace(/_/g, ' ');
    const acronymsToSpellOut = ['id', 'url', 'ip', 'io', 'os', 'ui', 'db', 'api', 'ssl', 'tls', 'dto', 'dao'];
    acronymsToSpellOut.forEach(acronym => {
        const regex = new RegExp(`\\b${acronym}\\b`, 'gi');
        normalizedText = normalizedText.replace(regex, acronym.toUpperCase().split('').join(' '));
    });
    const wordCount = normalizedText.split(/\s+/).length;
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
    const stripListPrefix = (q) =>
        q.replace(/^\s*(?:[a-zA-Z\d]{1,2}\)|[a-zA-Z\d]{1,2}\.|[•\-–—])\s+/, '').trim();
    const googleUrl = (q) => {
        const cleaned = stripListPrefix(q);
        return `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(cleaned)}&tl=${lang}&total=1&idx=0&textlen=${cleaned.length}&client=gtx&prev=input&ttsspeed=${speed}`;
    };
    const MAX_CHUNK_CHARS = 200;
    const splitIntoChunks = (text) => {
        const sentences = text.match(/[^.?!]+[.?!]+/g) || [];
        const lastSentenceEnd = sentences.reduce((acc, s) => acc + s.length, 0);
        if (lastSentenceEnd < text.length) sentences.push(text.slice(lastSentenceEnd).trim());
        const level1 = sentences.map(s => s.trim()).filter(s => s.replace(/[.?!,;:]/g, '').trim().length >= 2);
        const base = level1.length >= 2 ? level1 : [text];
        const level2 = [];
        for (const chunk of base) {
            if (chunk.length <= MAX_CHUNK_CHARS) { level2.push(chunk); continue; }
            const clauses = chunk.split(/(?<=[,;–—])\s+/);
            if (clauses.length >= 2) {
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
    const fetchGoogle = async () => {
        try {
            const data = await fetchToBase64(googleUrl(normalizedText), { referrerPolicy: 'no-referrer' });
            return [data];
        } catch (e) {
            if (e.status !== 400) return [];
        }
        const chunks = splitIntoChunks(normalizedText);
        const results = new Array(chunks.length).fill(null);
        await Promise.all(chunks.map(async (chunk, i) => {
            try { results[i] = await fetchToBase64(googleUrl(chunk), { referrerPolicy: 'no-referrer' }); }
            catch (e) { results[i] = null; }
        }));
        return results.filter(Boolean);
    };
    if (wordCount <= 2) {
        const audioText = getAmericanSpelling(normalizedText);
        const oxfordUrl = `https://ssl.gstatic.com/dictionary/static/sounds/oxford/${audioText.toLowerCase()}--_gb_1.mp3`;
        const oxfordPromise = fetchToBase64(oxfordUrl).catch(() => null);
        const googlePromise = fetchGoogle();
        const oxfordData = await oxfordPromise;
        if (oxfordData) {
            return { type: 'oxford', chunks: [oxfordData] };
        }
        const googleChunks = await googlePromise;
        return { type: 'google', chunks: googleChunks };
    }
    const googleChunks = await fetchGoogle();
    return { type: 'google', chunks: googleChunks };
}

const SEARXNG_INSTANCES = [
    'https://searx.be',
    'https://searx.or.tz',
    'https://search.privacyredirect.com',
    'https://searx.work',
    'https://searx.nixnet.services',
    'https://searx.tiekoetter.com',
    'https://searx.space'
];

async function performSearXNGSearch(query) {
    const instances = [...SEARXNG_INSTANCES].sort(() => Math.random() - 0.5);
    for (const instance of instances) {
        try {
            console.log(`[Lumina] Trying SearXNG Search at ${instance} for: "${query}"`);
            const url = `${instance}/search?q=${encodeURIComponent(query)}&format=json`;
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });
            if (response.ok) {
                const contentType = response.headers.get('content-type') || '';
                if (!contentType.includes('application/json')) {
                    throw new Error(`Response is not JSON (Content-Type: ${contentType})`);
                }
                const data = await response.json();
                if (data && Array.isArray(data.results) && data.results.length > 0) {
                    return data.results.slice(0, 5).map((r, idx) => {
                        return `[Result ${idx + 1}]
Title: ${r.title || ''}
URL: ${r.url}
Snippet: ${r.content || ''}`;
                    }).join('\n\n');
                }
            }
        } catch (e) {
            console.warn(`[Lumina] SearXNG instance ${instance} failed: ${e.message || e}`);
        }
    }
    return 'No results found.';
}

async function performWebSearch(query) {
    try {
        console.log(`[Lumina] Performing DuckDuckGo Search for: "${query}"`);
        const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        if (!response.ok) {
            throw new Error(`DDG responded with status ${response.status}`);
        }
        const html = await response.text();
        if (html.includes('anomaly') || html.includes('captcha') || !html.includes('result__url')) {
            console.warn('[Lumina] DuckDuckGo blocked or returned no results. Trying SearXNG fallback...');
            return await performSearXNGSearch(query);
        }
        const results = [];
        const blocks = html.split('<div class="result results_links results_links_deep web-result ">');
        for (let i = 1; i < blocks.length && results.length < 5; i++) {
            const block = blocks[i];
            const urlMatch = block.match(/<a class="result__url"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
            const snippetMatch = block.match(/<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
            if (urlMatch) {
                let rawUrl = urlMatch[1];
                let title = urlMatch[2].replace(/<[^>]*>/g, '').trim();
                let snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]*>/g, '').trim() : '';
                let actualUrl = rawUrl;
                if (rawUrl.includes('uddg=')) {
                    try {
                        const searchParams = new URLSearchParams(rawUrl.split('?')[1]);
                        const uddg = searchParams.get('uddg');
                        if (uddg) actualUrl = decodeURIComponent(uddg);
                    } catch (e) {
                        try {
                            const matchUddg = rawUrl.match(/[?&]uddg=([^&]+)/);
                            if (matchUddg) actualUrl = decodeURIComponent(matchUddg[1]);
                        } catch (err) { }
                    }
                }
                title = title.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
                snippet = snippet.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
                results.push({ title, url: actualUrl, content: snippet });
            }
        }
        if (results.length > 0) {
            return results.map((r, idx) => `[Result ${idx + 1}]
Title: ${r.title}
URL: ${r.url}
Snippet: ${r.content}`).join('\n\n');
        }
        return await performSearXNGSearch(query);
    } catch (e) {
        console.error('[Lumina] DDG search error, falling back to SearXNG...', e);
        return await performSearXNGSearch(query);
    }
}

function extractUrlsFromSearchResults(text) {
    if (!text) return [];
    const urls = [];
    const regex = /URL:\s*(https?:\/\/[^\s\n\)\>\]]+)/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
        urls.push(match[1]);
    }
    return urls;
}

async function generateChatTitleFromModel(modelObj, question, images, files, history) {
    const chain = await getModelChain('text', modelObj);
    if (!chain || chain.length === 0) {
        throw new Error("No configured models found.");
    }
    const config = chain[0];
    const { model, providerType: currentProvider, endpoint, apiKey } = config;
    const keys = getKeysArray(apiKey);
    const systemInstruction = `Analyze the preceding conversation and generate a concise, descriptive chat title in 8 words or fewer. Capture the core topic, main intent, or action item directly without using filler words, matching the language of the prompt. Respond with ONLY the title itself, nothing else. Do not wrap the title in quotes.`;
    const attachments = [];
    if (Array.isArray(images)) attachments.push(...images);
    if (Array.isArray(files)) attachments.push(...files);
    const payloadParams = {
        model, endpoint, providerType: currentProvider,
        temperature: 0.3, topP: 1.0, maxTokens: 100, parsedCustomParams: {},
        normalizedThinkingLevel: '', isGemini25Model: false, reasoningMode: false,
        imageData: attachments.length > 0 ? attachments : null,
        isStreaming: false, cachedContent: null
    };
    const response = await fetchWithRotation(keys, async (key) => {
        const payload = await buildApiPayload(history || [], question, systemInstruction, key, payloadParams);
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
        text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
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
            // Otherwise, take the last line if the first lines repeated the prompt
            cleanedText = lines[lines.length - 1];
        }
    }
    // Remove common prefixes
    cleanedText = cleanedText.replace(/^(corrected\s+)?title\s*:\s*/i, '');
    cleanedText = cleanedText.replace(/^(suggested\s+)?title\s*:\s*/i, '');
    cleanedText = cleanedText.replace(/^chat\s+title\s*:\s*/i, '');
    cleanedText = cleanedText.trim().replace(/^["']|["']$/g, '').trim();
    if (!cleanedText || cleanedText.length > 50) {
        const firstLine = text.split('\n')[0].trim().replace(/^["']|["']$/g, '').trim();
        if (firstLine && firstLine.length <= 50) {
            return firstLine;
        }
        return question.substring(0, 20);
    }
    return cleanedText;
}
