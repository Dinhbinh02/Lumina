export function initMarkdownMath() {
    if (typeof marked === 'undefined') return;
    marked.use({
        extensions: [
            {
                name: 'inlineMath',
                level: 'inline',
                start(src) { return src.indexOf('$'); },
                tokenizer(src, tokens) {
                    const match = src.match(/^\$((?:[^\$\\\n]|\\.)+?)\$/);
                    if (match) {
                        const content = match[1];
                        if (/^\s|\s$/.test(content)) return;
                        if (/\s/.test(content)) {
                            const hasMathSymbol = /[\\^_\=+\-*\/<>≤≥≠≈±∞%]/.test(content);
                            if (!hasMathSymbol) return;
                        } else {
                            if (/^\d+(?:[.,]\d+)?$/.test(content)) return;
                        }
                        return {
                            type: 'inlineMath',
                            raw: match[0],
                            text: content
                        };
                    }
                },
                renderer(token) {
                    if (typeof katex !== 'undefined' && katex.renderToString) {
                        try {
                            const math = (token.text || '').replace(/\\frac\{/g, '\\dfrac{');
                            return katex.renderToString(math, { displayMode: false, throwOnError: false, strict: 'ignore' });
                        } catch (e) {
                            return token.raw;
                        }
                    }
                    return `<span class="lumina-math-inline-placeholder" data-math="${encodeURIComponent(token.text)}">${token.raw}</span>`;
                }
            },
            {
                name: 'blockMath',
                level: 'block',
                start(src) { return src.indexOf('$$'); },
                tokenizer(src, tokens) {
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
                            return katex.renderToString(token.text, { displayMode: true, throwOnError: false, strict: 'ignore' });
                        } catch (e) {
                            return token.raw;
                        }
                    }
                    return `<div class="lumina-math-block-placeholder" data-math="${encodeURIComponent(token.text)}">${token.raw}</div>`;
                }
            }
        ]
    });
}
