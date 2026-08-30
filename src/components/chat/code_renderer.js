import { buildYoutubeEmbedUrl } from './media_embed.js';

export function initCodeAndMediaRenderer() {
    if (typeof marked === 'undefined') return;
    marked.use({
        renderer: {
            code(token) {
                const { lang, text } = token;
                if (lang === 'chartjs') {
                    const escapedVal = text
                        .replace(/&/g, '&amp;')
                        .replace(/"/g, '&quot;');
                    return `<div class="nexus-d2-wrapper nexus-chartjs-wrapper is-loading" data-chartjs-config="${escapedVal}"><div class="nexus-media-skeleton nexus-d2-skeleton"></div></div>`;
                }
                if (lang === 'd2') {
                    const escaped = text
                        .replace(/&/g, '&amp;')
                        .replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;');
                    return `<div class="nexus-d2-wrapper is-loading"><pre class="nexus-d2-source" style="display:none !important;">${escaped}</pre><div class="nexus-media-skeleton nexus-d2-skeleton"></div></div>`;
                }
                const escapedText = text
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;');
                let langLabel = 'Code';
                if (lang) {
                    const rawLang = lang.toLowerCase();
                    if (rawLang === 'js' || rawLang === 'javascript') langLabel = 'JavaScript';
                    else if (rawLang === 'ts' || rawLang === 'typescript') langLabel = 'TypeScript';
                    else if (rawLang === 'html') langLabel = 'HTML';
                    else if (rawLang === 'css') langLabel = 'CSS';
                    else if (rawLang === 'py' || rawLang === 'python') langLabel = 'Python';
                    else if (rawLang === 'json') langLabel = 'JSON';
                    else if (rawLang === 'go' || rawLang === 'golang') langLabel = 'Go';
                    else if (rawLang === 'rs' || rawLang === 'rust') langLabel = 'Rust';
                    else if (rawLang === 'sh' || rawLang === 'bash' || rawLang === 'shell') langLabel = 'Bash';
                    else if (rawLang === 'cpp' || rawLang === 'c++') langLabel = 'C++';
                    else if (rawLang === 'cs' || rawLang === 'csharp') langLabel = 'C#';
                    else langLabel = lang.charAt(0).toUpperCase() + lang.slice(1);
                }
                const COPY_SVG = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
                const DOWNLOAD_SVG = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`;
                return `<div class="nexus-code-block-wrap">
                    <div class="nexus-code-header">
                        <span class="nexus-code-lang">${langLabel}</span>
                        <div class="nexus-code-actions">
                            <button class="nexus-code-download-btn disabled" disabled title="Streaming code...">${DOWNLOAD_SVG}</button>
                            <button class="nexus-code-copy-btn disabled" disabled title="Streaming code...">${COPY_SVG}</button>
                        </div>
                    </div>
                    <pre><code class="${lang ? `language-${lang}` : ''}">${escapedText}</code></pre>
                </div>`;
            },
            image(token) {
                const { href, title, text } = token;
                if (href && (href.startsWith('youtube://') || href.includes('youtube.com/') || href.includes('youtu.be/'))) {
                    if (href.startsWith('youtube://search?q=')) {
                        const query = href.substring('youtube://search?q='.length);
                        return `<div class="nexus-youtube-wrapper nexus-youtube-dynamic is-loading" data-query="${query}" data-original-href="${href}" data-text="${text || ''}"><div class="nexus-media-skeleton"></div></div>`;
                    }
                    const embedUrl = buildYoutubeEmbedUrl(href);
                    if (embedUrl) {
                        return `<div class="nexus-youtube-wrapper"><iframe width="100%" height="315" src="${embedUrl}" title="${text || 'YouTube video player'}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen class="nexus-youtube-iframe"></iframe></div>`;
                    }
                }
                if (href && href.startsWith('image-search://')) {
                    const [searchUrl] = href.split('#');
                    const query = searchUrl.replace('image-search://', '');
                    const cleanQuery = decodeURIComponent(query).replace(/\+/g, ' ');
                    return `<div class="nexus-image-wrapper is-loading"><div class="nexus-media-skeleton"></div><img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 600'%3E%3C/svg%3E" data-query="${encodeURIComponent(cleanQuery)}" data-original-href="${href}" alt="${text || 'diagram'}" class="nexus-async-image nexus-clickable-image" />${text ? `<div class="nexus-image-caption">${text}</div>` : ''}</div>`;
                }
                return false;
            },
            link(token) {
                const { href, text } = token;
                if (href && (href.startsWith('youtube://') || href.includes('youtube.com/') || href.includes('youtu.be/'))) {
                    if (href.startsWith('youtube://search?q=')) {
                        const query = href.substring('youtube://search?q='.length);
                        return `<div class="nexus-youtube-wrapper nexus-youtube-dynamic is-loading" data-query="${query}" data-original-href="${href}" data-text="${text || ''}"><div class="nexus-media-skeleton"></div></div>`;
                    }
                    const embedUrl = buildYoutubeEmbedUrl(href);
                    if (embedUrl) {
                        return `<div class="nexus-youtube-wrapper"><iframe width="100%" height="315" src="${embedUrl}" title="${text || 'YouTube video player'}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen class="nexus-youtube-iframe"></iframe></div>`;
                    }
                }
                return false;
            }
        }
    });
}

if (typeof marked !== 'undefined') {
    initCodeAndMediaRenderer();
}
