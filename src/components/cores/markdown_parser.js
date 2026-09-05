export function completeIncompleteMarkdown(rawText) {
    if (!rawText || typeof rawText !== 'string') return '';
    let text = rawText;

    const fenceMatches = text.match(/```/g);
    if (fenceMatches && fenceMatches.length % 2 !== 0) {
        text += '\n```';
    }

    const blockMathMatches = text.match(/\$\$/g);
    if (blockMathMatches && blockMathMatches.length % 2 !== 0) {
        text += '\n$$';
    }

    const inlineCodeMatches = text.replace(/```[\s\S]*?```/g, '').match(/`/g);
    if (inlineCodeMatches && inlineCodeMatches.length % 2 !== 0) {
        text += '`';
    }

    const boldMatches = text.replace(/```[\s\S]*?```/g, '').match(/\*\*/g);
    if (boldMatches && boldMatches.length % 2 !== 0) {
        text += '**';
    }

    const strikeMatches = text.replace(/```[\s\S]*?```/g, '').match(/~~/g);
    if (strikeMatches && strikeMatches.length % 2 !== 0) {
        text += '~~';
    }

    const unclosedLink = text.match(/\[([^\]]*)$/);
    if (unclosedLink) {
        text = text.slice(0, unclosedLink.index) + unclosedLink[1];
    } else {
        const unclosedHref = text.match(/(\[[^\]]+\])\(([^\)]*)$/);
        if (unclosedHref) {
            text += ')';
        }
    }

    const streamingTags = [
        'Step',
        'Sequence',
        'TimelineEvent',
        'Timeline',
        'Elicitation',
        'ElicitationsGroup',
        'FollowUp',
        'GenerateApp',
        'PatchApp',
        'GenerateWidget',
        'PatchWidget',
        'Carousel',
        'Option',
        'WritingBlock',
        'Aspect',
        'Comparison',
        'Metric',
        'Metrics',
        'BentoItem',
        'BentoGrid'
    ];

    for (const tag of streamingTags) {
        const openRegex = new RegExp(`<${tag}(?:\\s+[^>]*)?>`, 'gi');
        const closeRegex = new RegExp(`<\/${tag}>`, 'gi');
        const openCount = (text.match(openRegex) || []).length;
        const closeCount = (text.match(closeRegex) || []).length;
        if (openCount > closeCount) {
            text += `</${tag}>`.repeat(openCount - closeCount);
        }
    }

    return text;
}

export function streamSafeParse(rawText) {
    if (!rawText) return '';
    const completed = completeIncompleteMarkdown(rawText);
    if (typeof marked !== 'undefined' && typeof marked.parse === 'function') {
        return marked.parse(completed);
    }
    return completed;
}

export function renderKaTeXFormula(rawMath, isDisplay = false) {
    if (!rawMath || typeof katex === 'undefined' || typeof katex.renderToString !== 'function') return '';
    let math = rawMath;
    if (!isDisplay && /\\(?:frac|dfrac|cfrac|sum|int|prod|lim|begin)\b/.test(math) && !/\\displaystyle\b/.test(math)) {
        math = '\\displaystyle ' + math;
    }
    return katex.renderToString(math, { displayMode: isDisplay, throwOnError: false, strict: 'ignore' });
}

export function initMarkdownMath() {
    if (typeof marked === 'undefined' || typeof marked.use !== 'function') return;
    marked.use({
        extensions: [
            {
                name: 'inlineMath',
                level: 'inline',
                start(src) { return src.indexOf('$'); },
                tokenizer(src) {
                    const doubleMatch = src.match(/^\$\$((?:[^\$]|\\.)+?)\$\$/);
                    if (doubleMatch) {
                        return {
                            type: 'inlineMath',
                            raw: doubleMatch[0],
                            text: doubleMatch[1],
                            display: false
                        };
                    }
                    const match = src.match(/^\$((?:[^\$\\\n]|\\.)+?)\$/);
                    if (match) {
                        const content = match[1];
                        if (/^\s|\s$/.test(content)) return;
                        if (/^\d+(?:[.,]\d+)?$/.test(content)) return;

                        if (/\s/.test(content)) {
                            const hasMathSymbol = /[\\^_\=+\-*\/<>≤≥≠≈±∞%()[\]{},;:|~'!√π]/.test(content);
                            const hasMathKeywords = /\b(sin|cos|tan|cot|sec|csc|log|ln|exp|lim|sum|int|prod|det|dim|ker|max|min|arg|deg|gcd|hom|inf|sup)\b/i.test(content);
                            const hasAlphanumericMix = /\b[a-zA-Z]\d|\d[a-zA-Z]\b/.test(content);
                            if (!hasMathSymbol && !hasMathKeywords && !hasAlphanumericMix) return;
                        }
                        return {
                            type: 'inlineMath',
                            raw: match[0],
                            text: content,
                            display: false
                        };
                    }
                },
                renderer(token) {
                    if (typeof katex !== 'undefined' && katex.renderToString) {
                        try {
                            return renderKaTeXFormula(token.text, token.display || false);
                        } catch (_) {
                            return token.raw;
                        }
                    }
                    return `<span class="nexus-math-inline-placeholder" data-math="${encodeURIComponent(token.text)}">${token.raw}</span>`;
                }
            },
            {
                name: 'blockMath',
                level: 'block',
                start(src) { return src.indexOf('$$'); },
                tokenizer(src) {
                    const match = src.match(/^\$\$\n?([\s\S]+?)\n?\$\$/);
                    if (match) {
                        return {
                            type: 'blockMath',
                            raw: match[0],
                            text: match[1]
                        };
                    }
                },
                renderer(token) {
                    if (typeof katex !== 'undefined' && katex.renderToString) {
                        try {
                            return renderKaTeXFormula(token.text, true);
                        } catch (_) {
                            return token.raw;
                        }
                    }
                    return `<div class="nexus-math-block-placeholder" data-math="${encodeURIComponent(token.text)}">${token.raw}</div>`;
                }
            }
        ]
    });
}

export function initCodeAndMediaRenderer() {
    if (typeof marked === 'undefined' || typeof marked.use !== 'function') return;
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
                            <button class="nexus-code-download-btn" title="Download Code">${DOWNLOAD_SVG}</button>
                            <button class="nexus-code-copy-btn" title="Copy Code">${COPY_SVG}</button>
                        </div>
                    </div>
                    <pre><code class="${lang ? `language-${lang}` : ''}">${escapedText}</code></pre>
                </div>`;
            },
            image(token) {
                const { href, title, text } = token;
                if (href && href.startsWith('image-search://')) {
                    const [searchUrl] = href.split('#');
                    const query = searchUrl.replace('image-search://', '');
                    const cleanQuery = decodeURIComponent(query).replace(/\+/g, ' ');
                    return `<div class="nexus-image-wrapper is-loading"><div class="nexus-media-skeleton"></div><img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 600'%3E%3C/svg%3E" data-query="${encodeURIComponent(cleanQuery)}" data-original-href="${href}" alt="${text || 'diagram'}" class="nexus-async-image nexus-clickable-image" />${text ? `<div class="nexus-image-caption">${text}</div>` : ''}</div>`;
                }
                return false;
            },
            link(token) {
                const { href, title, text } = token;
                const titleAttr = title ? ` title="${title}"` : '';
                return `<a href="${href}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
            },
            table(token) {
                const { header, rows } = token;
                const ths = header.map(cell => `<th${cell.align ? ` align="${cell.align}"` : ''}>${this.parser.parseInline(cell.tokens)}</th>`).join('');
                const trs = rows.map(row => {
                    const tds = row.map(cell => `<td${cell.align ? ` align="${cell.align}"` : ''}>${this.parser.parseInline(cell.tokens)}</td>`).join('');
                    return `<tr>${tds}</tr>`;
                }).join('');
                return `<div class="nexus-table-wrap"><table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table></div>`;
            }
        }
    });
}

export function initMarkdownParser() {
    initMarkdownMath();
    initCodeAndMediaRenderer();
}

if (typeof marked !== 'undefined') {
    initMarkdownParser();
}
