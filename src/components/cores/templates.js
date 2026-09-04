export class NexusTemplates {
    static escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    static modelItem(displayName, model) {
        const name = displayName || model;
        return `<span class="model-name">${NexusTemplates.escapeHtml(name)}</span>`;
    }

    static thinkingDots() {
        return `
            <span class="sparks-typing-dot"></span>
            <span class="sparks-typing-dot"></span>
            <span class="sparks-typing-dot"></span>
        `;
    }

    static sidebarContextMenu(items) {
        return items.map(item => {
            if (item.type === 'header') {
                return `<div class="sidebar-ctx-item sidebar-ctx-header-name" style="pointer-events:none;font-weight:600;font-size:12px;color:var(--nexus-sidebar-text-muted, #757575);padding-bottom:2px;">${NexusTemplates.escapeHtml(item.label)}</div>`;
            }
            if (item.type === 'divider') {
                return `<div class="sidebar-ctx-divider"></div>`;
            }
            const dangerClass = item.danger ? ' sidebar-ctx-item--danger' : '';
            return `
                <div class="sidebar-ctx-item${dangerClass}" data-action="${NexusTemplates.escapeHtml(item.action)}">
                    ${item.icon || ''}
                    <span>${NexusTemplates.escapeHtml(item.label)}</span>
                </div>
            `;
        }).join('');
    }
}

const loadedScripts = new Set();
export function loadScript(src) {
    if (loadedScripts.has(src)) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.onload = () => {
            loadedScripts.add(src);
            resolve();
        };
        s.onerror = (err) => reject(err);
        document.body.appendChild(s);
    });
}

export function loadCSS(href) {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`link[href="${href}"]`)) {
            resolve();
            return;
        }
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        link.onload = () => resolve();
        link.onerror = (err) => reject(err);
        document.head.appendChild(link);
    });
}

export async function ensureKatexLoaded() {
    if (typeof renderMathInElement !== 'undefined') return;
    try {
        await loadCSS('../../lib/katex/katex.min.css');
        await loadScript('../../lib/katex/katex.min.js');
        await loadScript('../../lib/katex/auto-render.min.js');
    } catch (e) {
        console.error('Failed to lazy load KaTeX', e);
    }
}

export async function ensureChartLoaded() {
    if (typeof Chart !== 'undefined') return;
    try {
        await loadScript('../../lib/chart.min.js');
    } catch (e) {
        console.error('Failed to lazy load Chart.js', e);
    }
}

export async function ensurePdfjsLoaded() {
    if (typeof pdfjsLib !== 'undefined') return;
    try {
        await loadScript('../../lib/pdf.min.js');
    } catch (e) {
        console.error('Failed to lazy load PDF.js', e);
    }
}

export async function ensureHighlightLoaded() {
    if (typeof hljs !== 'undefined') return;
    try {
        await loadScript('../../lib/highlight.min.js');
    } catch (e) {
        console.error('Failed to lazy load Highlight.js', e);
    }
}

export async function ensureMarkedLoaded() {
    if (typeof marked !== 'undefined') {
        if (typeof initMarkdownMath === 'function') initMarkdownMath();
        if (typeof initCodeAndMediaRenderer === 'function') initCodeAndMediaRenderer();
        if (typeof initLmdxComponentsParser === 'function') initLmdxComponentsParser();
        return;
    }
    try {
        await loadScript('../../lib/marked.min.js');
        if (typeof initMarkdownMath === 'function') initMarkdownMath();
        if (typeof initCodeAndMediaRenderer === 'function') initCodeAndMediaRenderer();
        if (typeof initLmdxComponentsParser === 'function') initLmdxComponentsParser();
    } catch (e) {
        console.error('Failed to lazy load Marked', e);
    }
}

if (typeof window !== 'undefined') {
    window.NexusTemplates = NexusTemplates;
    window.ensureKatexLoaded = ensureKatexLoaded;
    window.ensureChartLoaded = ensureChartLoaded;
    window.ensurePdfjsLoaded = ensurePdfjsLoaded;
    window.ensureHighlightLoaded = ensureHighlightLoaded;
    window.ensureMarkedLoaded = ensureMarkedLoaded;
}
