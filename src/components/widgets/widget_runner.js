import { widgetRegistry } from './widget_registry.js';

/**
 * WidgetRunner — Manages generation, sandboxing, and lifecycle for
 * Interactive Sandbox Widgets (<GenerateWidget>) & Built-in Widgets (<Widget>) in Nexus.
 */

export const WidgetRunner = {
    DEFAULT_HEIGHT: '380px',

    /**
     * Applies SEARCH / REPLACE patch blocks to existing code.
     */
    applySearchReplace(originalCode, patchText) {
        if (!originalCode || !patchText) return { success: false, code: originalCode || '', count: 0 };

        let workingCode = originalCode;
        let appliedCount = 0;

        const patchRegex = /<<<<<<< SEARCH\r?\n([\s\S]*?)\r?\n=======\r?\n([\s\S]*?)\r?\n>>>>>>> REPLACE/g;
        let match;

        while ((match = patchRegex.exec(patchText)) !== null) {
            const searchBlock = match[1];
            const replaceBlock = match[2];

            if (!searchBlock) continue;

            if (workingCode.includes(searchBlock)) {
                workingCode = workingCode.replace(searchBlock, replaceBlock);
                appliedCount++;
                continue;
            }

            const normWorking = workingCode.replace(/\r\n/g, '\n');
            const normSearch = searchBlock.replace(/\r\n/g, '\n');
            const normReplace = replaceBlock.replace(/\r\n/g, '\n');

            if (normWorking.includes(normSearch)) {
                workingCode = normWorking.replace(normSearch, normReplace);
                appliedCount++;
                continue;
            }

            const searchLines = normSearch.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            if (searchLines.length > 0) {
                const codeLines = normWorking.split('\n');
                let foundStart = -1;
                let foundEnd = -1;

                for (let i = 0; i <= codeLines.length - searchLines.length; i++) {
                    let isMatch = true;
                    for (let j = 0; j < searchLines.length; j++) {
                        if (codeLines[i + j].trim() !== searchLines[j]) {
                            isMatch = false;
                            break;
                        }
                    }
                    if (isMatch) {
                        foundStart = i;
                        foundEnd = i + searchLines.length;
                        break;
                    }
                }

                if (foundStart !== -1 && foundEnd !== -1) {
                    const before = codeLines.slice(0, foundStart).join('\n');
                    const after = codeLines.slice(foundEnd).join('\n');
                    workingCode = (before ? before + '\n' : '') + normReplace + (after ? '\n' + after : '');
                    appliedCount++;
                }
            }
        }

        return {
            success: appliedCount > 0,
            code: workingCode,
            count: appliedCount
        };
    },

    /**
     * Extracts raw HTML/CSS/JS or applies targeted SEARCH/REPLACE patches
     */
    extractWidgetCode(rawBody, currentCode = '') {
        if (!rawBody || typeof rawBody !== 'string') return null;
        let clean = rawBody.trim();

        if (clean.includes('<<<<<<< SEARCH') && clean.includes('>>>>>>> REPLACE')) {
            const patchContent = clean.includes('<PatchApp') || clean.includes('<PatchWidget')
                ? (clean.match(/<(?:PatchApp|PatchWidget)[^>]*>([\s\S]*?)(?:<\/(?:PatchApp|PatchWidget)>|$)/i)?.[1] || clean)
                : clean;

            const patchResult = this.applySearchReplace(currentCode, patchContent);
            if (patchResult.success) {
                return patchResult.code;
            }
        }

        const generateAppMatch = clean.match(/<(?:GenerateApp|GenerateWidget)[^>]*>([\s\S]*?)(?:<\/(?:GenerateApp|GenerateWidget)>|$)/i);
        if (generateAppMatch) {
            clean = generateAppMatch[1].trim();
        }

        const codeBlockMatch = clean.match(/```(?:html|xml)?\s*\n([\s\S]*?)\n```/i);
        if (codeBlockMatch) {
            const codeContent = codeBlockMatch[1].trim();
            if (codeContent.includes('<') && (codeContent.includes('</div>') || codeContent.includes('</html>') || codeContent.includes('</script>') || codeContent.includes('</style>'))) {
                return codeContent;
            }
        }

        const strippedFence = clean.replace(/^```(?:html|xml)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
        if (strippedFence.includes('<') && (strippedFence.includes('</div>') || strippedFence.includes('</html>') || strippedFence.includes('</script>') || strippedFence.includes('</style>') || strippedFence.includes('</canvas>') || strippedFence.includes('</button>') || strippedFence.includes('</svg>') || strippedFence.includes('/>') || strippedFence.includes('>'))) {
            return strippedFence;
        }

        const docTypeMatch = clean.match(/(<!DOCTYPE html[\s\S]*<\/html>)/i) ||
                             clean.match(/(<html[\s\S]*<\/html>)/i);
        if (docTypeMatch) {
            return docTypeMatch[1].trim();
        }

        if (clean.startsWith('{') && clean.endsWith('}')) {
            try {
                const parsed = JSON.parse(clean);
                if (parsed.html) return parsed.html.trim();
                if (parsed.widgetSpec?.html) return parsed.widgetSpec.html.trim();
                if (parsed.widgetSpec?.code) return parsed.widgetSpec.code.trim();
            } catch (_) { }
        }

        return null;
    },

    /**
     * Builds a complete, self-contained HTML document with safety constraints and theme styling
     */
    buildSandboxedHtml(rawCode, isDark = false) {
        const bg = isDark ? '#1e1e24' : '#ffffff';
        const text = isDark ? '#f1f6fe' : '#1f1f1f';
        const border = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
        const cardBg = isDark ? '#26282d' : '#f7f9fc';
        const accent = '#1a73e8';

        if (/<html[\s\S]*<\/html>/i.test(rawCode) || /<!DOCTYPE html>/i.test(rawCode)) {
            return rawCode;
        }

        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    :root {
      --bg-color: ${bg};
      --text-color: ${text};
      --border-color: ${border};
      --card-bg: ${cardBg};
      --accent-color: ${accent};
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: var(--bg-color);
      color: var(--text-color);
      padding: 16px;
      line-height: 1.5;
      font-size: 14px;
      overflow-x: hidden;
    }
    input, select, button, textarea { font-family: inherit; font-size: inherit; }
    input[type="range"] { cursor: pointer; accent-color: var(--accent-color); }
    button {
      cursor: pointer;
      border: 1px solid var(--border-color);
      background: var(--card-bg);
      color: var(--text-color);
      padding: 6px 14px;
      border-radius: 8px;
      font-weight: 500;
      transition: all 0.15s ease;
    }
    button:hover {
      background: var(--accent-color);
      color: #ffffff;
      border-color: var(--accent-color);
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      padding: 14px;
      margin-bottom: 12px;
    }
    .row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 8px;
    }
    canvas {
      display: block;
      max-width: 100%;
      border-radius: 8px;
    }
  </style>
</head>
<body>
  ${rawCode}
</body>
</html>`;
    },

    /**
     * Generates the outer Widget wrapper HTML for chat rendering
     */
    renderWidgetCard(rawBody, height = this.DEFAULT_HEIGHT, title = 'Interactive Widget') {
        const widgetId = 'widget-' + Date.now() + '-' + Math.random().toString(36).substr(2, 7);
        const cleanCode = this.extractWidgetCode(rawBody);
        const encodedCode = encodeURIComponent(cleanCode);
        const safeTitle = (title || 'Interactive Widget')
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        const safeHeight = height && /^\d+(?:px|vh|rem|%)?$/.test(height.trim()) ? height.trim() : this.DEFAULT_HEIGHT;
        const sandboxUrl = (typeof chrome !== 'undefined' && chrome.runtime?.getURL)
            ? chrome.runtime.getURL('pages/sandbox/widget_sandbox.html')
            : '/pages/sandbox/widget_sandbox.html';

        return `<div class="nexus-widget-wrapper" id="${widgetId}" data-widget-height="${safeHeight}">
      <div class="nexus-widget-header">
        <div class="nexus-widget-header-left">
          <span class="nexus-widget-title">${safeTitle}</span>
        </div>
        <div class="nexus-widget-header-right">
          <button type="button" class="nexus-widget-btn nexus-widget-btn-reload" title="Reset Widget">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="23 4 23 10 17 10"></polyline>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
            </svg>
          </button>
          <button type="button" class="nexus-widget-btn nexus-widget-btn-expand" title="Toggle Expand">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="15 3 21 3 21 9"></polyline>
              <polyline points="9 21 3 21 3 15"></polyline>
              <line x1="21" y1="3" x2="14" y2="10"></line>
              <line x1="3" y1="21" x2="10" y2="14"></line>
            </svg>
          </button>
        </div>
      </div>
      <div class="nexus-widget-frame-container" style="height: ${safeHeight};">
        <iframe
          class="nexus-widget-iframe"
          allow="autoplay"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"
          src="${sandboxUrl}"
          data-widget-raw="${encodedCode}"
          data-widget-id="${widgetId}"
          title="${safeTitle}">
        </iframe>
      </div>
    </div>`;
    },

    /**
     * Initializes all un-hydrated widget iframes and built-in widgets inside a DOM container
     */
    hydrateWidgets(containerEl = document) {
        if (!containerEl) return;

        if (typeof widgetRegistry !== 'undefined') {
            widgetRegistry.mountAllInContainer(containerEl);
        }

        const wrappers = containerEl.querySelectorAll('.nexus-widget-wrapper:not([data-hydrated])');

        wrappers.forEach(wrapper => {
            wrapper.setAttribute('data-hydrated', 'true');

            const reloadBtn = wrapper.querySelector('.nexus-widget-btn-reload');
            if (reloadBtn && !reloadBtn.__bound) {
                reloadBtn.__bound = true;
                reloadBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    reloadBtn.classList.add('nexus-spin-once');
                    setTimeout(() => reloadBtn.classList.remove('nexus-spin-once'), 600);
                    this.reloadWidget(wrapper);
                });
            }

            const expandBtn = wrapper.querySelector('.nexus-widget-btn-expand');
            if (expandBtn && !expandBtn.__bound) {
                expandBtn.__bound = true;
                expandBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    wrapper.classList.toggle('is-expanded');
                });
            }
        });
    },

    /**
     * Reloads/resets a specific widget iframe cleanly
     */
    reloadWidget(wrapperEl) {
        if (!wrapperEl) return;
        const iframe = wrapperEl.querySelector('.nexus-widget-iframe');
        if (!iframe) return;
        try {
            iframe.src = iframe.src;
        } catch (_) {
            const rawEncoded = iframe.getAttribute('data-widget-raw');
            const widgetId = iframe.getAttribute('data-widget-id') || 'default_app';
            if (rawEncoded && iframe.contentWindow) {
                const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
                const fontSize = getComputedStyle(document.documentElement).getPropertyValue('--nexus-fontSize') || '14px';
                iframe.contentWindow.postMessage({
                    type: 'NEXUS_WIDGET_RENDER',
                    code: decodeURIComponent(rawEncoded),
                    isDark,
                    fontSize: fontSize.trim(),
                    appId: widgetId
                }, '*');
            }
        }
    }
};

// ==========================================
// GLOBAL SANDBOX RUNTIME DISPATCHER
// ==========================================
if (typeof window !== 'undefined' && !window.__nexusWidgetSandboxListenerBound) {
    window.__nexusWidgetSandboxListenerBound = true;
    const activeTTSUtterances = new Map();
    const activeAIPorts = new Map();

    function findOptimalVoice(lang = 'zh-CN', preferredName = null) {
        if (typeof window === 'undefined' || !window.speechSynthesis) return null;
        const voices = window.speechSynthesis.getVoices() || [];
        if (!voices.length) return null;

        if (preferredName) {
            const byName = voices.find(v => v.name === preferredName);
            if (byName) return byName;
        }

        const normalizedLang = String(lang).toLowerCase().replace('_', '-');
        const langPrefix = normalizedLang.split('-')[0];

        let match = voices.find(v => v.lang && v.lang.toLowerCase().replace('_', '-') === normalizedLang);
        if (match) return match;

        if (langPrefix === 'zh') {
            match = voices.find(v => v.lang && (v.lang.toLowerCase().startsWith('zh') || v.lang.toLowerCase().startsWith('cmn')));
            if (match) return match;
        }

        match = voices.find(v => v.lang && v.lang.toLowerCase().startsWith(langPrefix));
        if (match) return match;

        return voices[0] || null;
    }

    window.addEventListener('message', async (event) => {
        if (!event.data) return;

        // 1. Sandbox ready -> Deliver code, theme, font size, and persistent storage
        if (event.data.type === 'NEXUS_WIDGET_READY') {
            const iframes = document.querySelectorAll('.nexus-widget-iframe, .apps-studio-preview-iframe');
            const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            const fontSize = getComputedStyle(document.documentElement).getPropertyValue('--nexus-fontSize') || '14px';

            for (const iframe of iframes) {
                if (iframe.contentWindow === event.source) {
                    const rawEncoded = iframe.getAttribute('data-widget-raw');
                    const appId = iframe.getAttribute('data-widget-id') || 'default_app';

                    let storedData = {};
                    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
                        try {
                            const storageKey = `nexus_sandbox_${appId}`;
                            const res = await chrome.storage.local.get([storageKey]);
                            if (res[storageKey]) storedData = res[storageKey];
                        } catch (_) {}
                    }

                    if (rawEncoded) {
                        const rawCode = decodeURIComponent(rawEncoded);
                        iframe.contentWindow.postMessage({
                            type: 'NEXUS_WIDGET_RENDER',
                            code: rawCode,
                            isDark,
                            fontSize: fontSize.trim(),
                            appId: appId,
                            storedData: storedData
                        }, '*');
                    }
                }
            }
        }

        // 2. Sandbox content size changed -> auto-fit frame container
        if (event.data.type === 'NEXUS_WIDGET_RESIZE' && typeof event.data.height === 'number') {
            const iframes = document.querySelectorAll('.nexus-widget-iframe');
            iframes.forEach(iframe => {
                if (iframe.contentWindow === event.source) {
                    const wrapper = iframe.closest('.nexus-widget-wrapper');
                    const frameContainer = iframe.parentElement;
                    if (frameContainer && (!wrapper || !wrapper.classList.contains('is-expanded'))) {
                        const fitHeight = Math.min(Math.max(event.data.height, 120), 650);
                        frameContainer.style.height = `${fitHeight}px`;
                    }
                }
            });
        }

        // 3. Persistent Storage Synchronizer
        if (event.data.type === 'NEXUS_STORAGE_SET') {
            const { appId = 'default_app', key, value } = event.data;
            if (typeof chrome !== 'undefined' && chrome.storage?.local && key) {
                const storageKey = `nexus_sandbox_${appId}`;
                chrome.storage.local.get([storageKey], (res) => {
                    const store = res[storageKey] || {};
                    store[key] = value;
                    chrome.storage.local.set({ [storageKey]: store });
                });
            }
        }
        if (event.data.type === 'NEXUS_STORAGE_REMOVE') {
            const { appId = 'default_app', key } = event.data;
            if (typeof chrome !== 'undefined' && chrome.storage?.local && key) {
                const storageKey = `nexus_sandbox_${appId}`;
                chrome.storage.local.get([storageKey], (res) => {
                    const store = res[storageKey] || {};
                    delete store[key];
                    chrome.storage.local.set({ [storageKey]: store });
                });
            }
        }
        if (event.data.type === 'NEXUS_STORAGE_CLEAR') {
            const { appId = 'default_app' } = event.data;
            if (typeof chrome !== 'undefined' && chrome.storage?.local) {
                const storageKey = `nexus_sandbox_${appId}`;
                chrome.storage.local.remove([storageKey]);
            }
        }

        // 4. Cross-Origin Fetch Bridge
        if (event.data.type === 'NEXUS_FETCH_REQUEST') {
            const { requestId, url, options = {} } = event.data;
            try {
                const res = await fetch(url, options);
                const contentType = res.headers.get('content-type') || '';
                let resData;
                if (contentType.includes('application/json')) {
                    resData = await res.json();
                } else {
                    resData = await res.text();
                }

                event.source?.postMessage({
                    type: 'NEXUS_FETCH_RESPONSE',
                    requestId: requestId,
                    success: true,
                    status: res.status,
                    statusText: res.statusText,
                    data: resData
                }, '*');
            } catch (err) {
                event.source?.postMessage({
                    type: 'NEXUS_FETCH_RESPONSE',
                    requestId: requestId,
                    success: false,
                    error: err.message || 'Network error'
                }, '*');
            }
        }

        // 5. File Download Bridge
        if (event.data.type === 'NEXUS_DOWNLOAD_REQUEST') {
            const { filename = 'download.txt', data = '', mimeType = 'text/plain' } = event.data;
            try {
                const blob = data instanceof Blob ? data : new Blob([data], { type: mimeType });
                const blobUrl = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = blobUrl;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
            } catch (err) {
                console.warn('[Sandbox Download Bridge Error]', err);
            }
        }

        // 6. Speech Synthesis Bridge (Parent Execution)
        if (event.data.type === 'NEXUS_TTS_SPEAK' && event.data.text) {
            const { id, text, lang = 'zh-CN', rate = 0.85, pitch = 1.0, volume = 1.0, voiceName } = event.data;
            if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
                if (window.speechSynthesis.paused) {
                    window.speechSynthesis.resume();
                }

                const utterance = new SpeechSynthesisUtterance(text);
                utterance.lang = lang;
                utterance.rate = rate;
                utterance.pitch = pitch;
                utterance.volume = volume;

                const chosenVoice = findOptimalVoice(lang, voiceName);
                if (chosenVoice) {
                    utterance.voice = chosenVoice;
                }

                utterance.onstart = () => {
                    try {
                        event.source?.postMessage({
                            type: 'NEXUS_TTS_EVENT',
                            id: id,
                            eventType: 'start'
                        }, '*');
                    } catch (_) {}
                };

                utterance.onend = () => {
                    activeTTSUtterances.delete(id);
                    try {
                        event.source?.postMessage({
                            type: 'NEXUS_TTS_EVENT',
                            id: id,
                            eventType: 'end'
                        }, '*');
                    } catch (_) {}
                };

                utterance.onerror = (err) => {
                    activeTTSUtterances.delete(id);
                    try {
                        event.source?.postMessage({
                            type: 'NEXUS_TTS_EVENT',
                            id: id,
                            eventType: 'error',
                            extra: { error: err?.error || 'speech_error' }
                        }, '*');
                    } catch (_) {}
                };

                activeTTSUtterances.set(id, utterance);
                window.speechSynthesis.speak(utterance);
            }
        }

        // 7. Cancel / Pause / Resume Speech Synthesis
        if (event.data.type === 'NEXUS_TTS_CANCEL') {
            if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
                activeTTSUtterances.clear();
                window.speechSynthesis.cancel();
            }
        }
        if (event.data.type === 'NEXUS_TTS_PAUSE') {
            if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
                window.speechSynthesis.pause();
            }
        }
        if (event.data.type === 'NEXUS_TTS_RESUME') {
            if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
                window.speechSynthesis.resume();
            }
        }

        // 8. AI Streaming Bridge (Nexus Engine)
        if (event.data.type === 'NEXUS_AI_STREAM_REQUEST') {
            const { requestId, prompt, model, systemPrompt, temperature, maxTokens, imageBase64 } = event.data;
            if (typeof chrome !== 'undefined' && chrome.runtime?.connect) {
                try {
                    const port = chrome.runtime.connect({ name: 'nexus-chat-stream' });
                    const sessionId = 'sandbox_' + requestId;
                    activeAIPorts.set(requestId, { port, sessionId });

                    port.onMessage.addListener((msg) => {
                        if (msg.error) {
                            event.source?.postMessage({ type: 'NEXUS_AI_STREAM_ERROR', requestId, error: msg.error }, '*');
                            activeAIPorts.delete(requestId);
                            try { port.disconnect(); } catch (_) {}
                            return;
                        }
                        if (msg.action === 'chunk' && msg.chunk) {
                            event.source?.postMessage({ type: 'NEXUS_AI_STREAM_CHUNK', requestId, chunk: msg.chunk }, '*');
                        }
                        if (msg.action === 'done') {
                            event.source?.postMessage({ type: 'NEXUS_AI_STREAM_DONE', requestId }, '*');
                            activeAIPorts.delete(requestId);
                            try { port.disconnect(); } catch (_) {}
                        }
                    });

                    port.postMessage({
                        action: 'chat_stream',
                        sessionId: sessionId,
                        question: prompt,
                        messages: [{ role: 'user', content: prompt }],
                        systemOverride: systemPrompt || undefined,
                        imageData: imageBase64 || null,
                        requestOptions: {
                            tabModel: model || undefined,
                            temperature: temperature ?? 0.7,
                            maxTokens: maxTokens ?? 4096
                        }
                    });
                } catch (err) {
                    event.source?.postMessage({ type: 'NEXUS_AI_STREAM_ERROR', requestId, error: err.message }, '*');
                }
            } else {
                event.source?.postMessage({ type: 'NEXUS_AI_STREAM_ERROR', requestId, error: 'Extension runtime unavailable' }, '*');
            }
        }

        // 9. AI Generation Bridge (Non-Streaming)
        if (event.data.type === 'NEXUS_AI_GENERATE_REQUEST') {
            const { requestId, prompt, model, systemPrompt, temperature, maxTokens, imageBase64 } = event.data;
            if (typeof chrome !== 'undefined' && chrome.runtime?.connect) {
                try {
                    const port = chrome.runtime.connect({ name: 'nexus-chat-stream' });
                    const sessionId = 'sandbox_' + requestId;
                    activeAIPorts.set(requestId, { port, sessionId });
                    let fullText = '';

                    port.onMessage.addListener((msg) => {
                        if (msg.error) {
                            event.source?.postMessage({ type: 'NEXUS_AI_GENERATE_RESPONSE', requestId, success: false, error: msg.error }, '*');
                            activeAIPorts.delete(requestId);
                            try { port.disconnect(); } catch (_) {}
                            return;
                        }
                        if (msg.action === 'chunk' && msg.chunk) {
                            fullText += msg.chunk;
                        }
                        if (msg.action === 'done') {
                            let cleanResult = fullText.replace(/<(?:think|thought)>[\s\S]*?(?:<\/(?:think|thought)>|$)/gi, '').trim();
                            event.source?.postMessage({ type: 'NEXUS_AI_GENERATE_RESPONSE', requestId, success: true, result: cleanResult }, '*');
                            activeAIPorts.delete(requestId);
                            try { port.disconnect(); } catch (_) {}
                        }
                    });

                    port.postMessage({
                        action: 'chat_stream',
                        sessionId: sessionId,
                        question: prompt,
                        messages: [{ role: 'user', content: prompt }],
                        systemOverride: systemPrompt || undefined,
                        imageData: imageBase64 || null,
                        requestOptions: {
                            tabModel: model || undefined,
                            temperature: temperature ?? 0.7,
                            maxTokens: maxTokens ?? 4096
                        }
                    });
                } catch (err) {
                    event.source?.postMessage({ type: 'NEXUS_AI_GENERATE_RESPONSE', requestId, success: false, error: err.message }, '*');
                }
            } else {
                event.source?.postMessage({ type: 'NEXUS_AI_GENERATE_RESPONSE', requestId, success: false, error: 'Extension runtime unavailable' }, '*');
            }
        }

        // 10. AI Abort Request
        if (event.data.type === 'NEXUS_AI_ABORT_REQUEST') {
            const { requestId } = event.data;
            const active = activeAIPorts.get(requestId);
            if (active) {
                try {
                    active.port.postMessage({ action: 'stop_chat', sessionId: active.sessionId });
                    active.port.disconnect();
                } catch (_) {}
                activeAIPorts.delete(requestId);
            }
        }

        // 11. Browser Context Queries
        if (event.data.type === 'NEXUS_BROWSER_GET_SELECTED_TEXT') {
            const { queryId } = event.data;
            try {
                if (typeof chrome !== 'undefined' && chrome.tabs && chrome.scripting) {
                    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
                    if (activeTab?.id) {
                        const results = await chrome.scripting.executeScript({
                            target: { tabId: activeTab.id },
                            func: () => window.getSelection()?.toString() || ''
                        });
                        const text = results?.[0]?.result || '';
                        event.source?.postMessage({ type: 'NEXUS_BROWSER_QUERY_RESPONSE', queryId, result: text }, '*');
                        return;
                    }
                }
            } catch (_) {}
            event.source?.postMessage({ type: 'NEXUS_BROWSER_QUERY_RESPONSE', queryId, result: '' }, '*');
        }

        if (event.data.type === 'NEXUS_BROWSER_GET_PAGE_CONTENT') {
            const { queryId } = event.data;
            try {
                if (typeof chrome !== 'undefined' && chrome.tabs && chrome.scripting) {
                    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
                    if (activeTab?.id) {
                        const results = await chrome.scripting.executeScript({
                            target: { tabId: activeTab.id },
                            func: () => ({
                                title: document.title || '',
                                text: (document.body?.innerText || '').slice(0, 10000)
                            })
                        });
                        const data = results?.[0]?.result || { title: '', text: '' };
                        event.source?.postMessage({ type: 'NEXUS_BROWSER_QUERY_RESPONSE', queryId, result: data }, '*');
                        return;
                    }
                }
            } catch (_) {}
            event.source?.postMessage({ type: 'NEXUS_BROWSER_QUERY_RESPONSE', queryId, result: { title: '', text: '' } }, '*');
        }

        if (event.data.type === 'NEXUS_BROWSER_OPEN_TAB' && event.data.url) {
            if (typeof chrome !== 'undefined' && chrome.tabs) {
                chrome.tabs.create({ url: event.data.url, active: event.data.active ?? true });
            } else {
                window.open(event.data.url, '_blank');
            }
        }

        // 12. Clipboard & App Prompt Bridges
        if (event.data.type === 'NEXUS_CLIPBOARD_WRITE' && event.data.text) {
            if (navigator?.clipboard?.writeText) {
                navigator.clipboard.writeText(event.data.text).catch(() => {});
            }
        }

        if (event.data.type === 'NEXUS_APP_PROMPT' && event.data.prompt) {
            const chatInput = document.getElementById('chat-input') || document.querySelector('.nexus-chat-input');
            if (chatInput) {
                chatInput.value = event.data.prompt;
                chatInput.dispatchEvent(new Event('input', { bubbles: true }));
                chatInput.focus();
            }
        }

        // 13. Error Telemetry
        if (event.data.type === 'NEXUS_WIDGET_ERROR') {
            console.warn('[Sandbox Widget Error]', event.data.message || event.data);
        }
    });
}
