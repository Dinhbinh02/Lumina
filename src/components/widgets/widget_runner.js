import { widgetRegistry } from './widget_registry.js';

/**
 * WidgetRunner — Manages generation, sandboxing, and lifecycle for
 * Interactive Sandbox Widgets (<GenerateWidget>) & Built-in Widgets (<Widget>) in Nexus.
 */

export const WidgetRunner = {
    DEFAULT_HEIGHT: '380px',

    /**
     * Applies SEARCH / REPLACE patch blocks to existing code (Aider/Cursor/Codex standard).
     * Format:
     * <<<<<<< SEARCH
     * exact code to match
     * =======
     * updated replacement code
     * >>>>>>> REPLACE
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
            return generateAppMatch[1].trim();
        }

        const codeBlockMatch = clean.match(/```(?:html|xml)?\s*\n([\s\S]*?)\n```/i);
        if (codeBlockMatch) {
            const codeContent = codeBlockMatch[1].trim();
            if (codeContent.includes('<') && (codeContent.includes('</div>') || codeContent.includes('</html>') || codeContent.includes('</script>') || codeContent.includes('</style>'))) {
                return codeContent;
            }
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

        // Check if rawCode is already a full HTML document
        if (/<html[\s\S]*<\/html>/i.test(rawCode) || /<!DOCTYPE html>/i.test(rawCode)) {
            return rawCode;
        }

        // Otherwise wrap code snippet in modern responsive container
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
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: var(--bg-color);
      color: var(--text-color);
      padding: 16px;
      line-height: 1.5;
      font-size: 14px;
      overflow-x: hidden;
    }
    input, select, button, textarea {
      font-family: inherit;
      font-size: inherit;
    }
    input[type="range"] {
      cursor: pointer;
      accent-color: var(--accent-color);
    }
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
          sandbox="allow-scripts allow-forms"
          src="${sandboxUrl}"
          data-widget-raw="${encodedCode}"
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

        // 1. Mount built-in widgets (<Widget name="..." />)
        if (typeof widgetRegistry !== 'undefined') {
            widgetRegistry.mountAllInContainer(containerEl);
        }

        // 2. Hydrate sandbox iframe widgets (<GenerateWidget>)
        const wrappers = containerEl.querySelectorAll('.nexus-widget-wrapper:not([data-hydrated])');

        wrappers.forEach(wrapper => {
            wrapper.setAttribute('data-hydrated', 'true');

            // Bind Reload button
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

            // Bind Expand button
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
            if (rawEncoded && iframe.contentWindow) {
                const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
                iframe.contentWindow.postMessage({
                    type: 'NEXUS_WIDGET_RENDER',
                    code: decodeURIComponent(rawEncoded),
                    isDark
                }, '*');
            }
        }
    }
};

// Global listener: Handle sandbox iframe lifecycle (ready announcement & auto-resize)
if (typeof window !== 'undefined' && !window.__nexusWidgetSandboxListenerBound) {
    window.__nexusWidgetSandboxListenerBound = true;
    window.addEventListener('message', (event) => {
        if (!event.data) return;

        // 1. Sandbox ready -> deliver code
        if (event.data.type === 'NEXUS_WIDGET_READY') {
            const iframes = document.querySelectorAll('.nexus-widget-iframe');
            const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            const fontSize = getComputedStyle(document.documentElement).getPropertyValue('--nexus-fontSize') || '14px';
            iframes.forEach(iframe => {
                if (iframe.contentWindow === event.source) {
                    const rawEncoded = iframe.getAttribute('data-widget-raw');
                    if (rawEncoded) {
                        const rawCode = decodeURIComponent(rawEncoded);
                        iframe.contentWindow.postMessage({
                            type: 'NEXUS_WIDGET_RENDER',
                            code: rawCode,
                            isDark,
                            fontSize: fontSize.trim()
                        }, '*');
                    }
                }
            });
        }

        // 2. Sandbox content size changed -> auto-fit frame container seamlessly
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
    });
}
