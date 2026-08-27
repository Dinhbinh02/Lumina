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

export function initMarkdownMath() {
    if (typeof marked === 'undefined' || typeof marked.use !== 'function') return;
    marked.use({
        extensions: [
            {
                name: 'inlineMath',
                level: 'inline',
                start(src) { return src.indexOf('$'); },
                tokenizer(src) {
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
                        } catch (_) {
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
                            return katex.renderToString(token.text, { displayMode: true, throwOnError: false, strict: 'ignore' });
                        } catch (_) {
                            return token.raw;
                        }
                    }
                    return `<div class="lumina-math-block-placeholder" data-math="${encodeURIComponent(token.text)}">${token.raw}</div>`;
                }
            }
        ]
    });
}
