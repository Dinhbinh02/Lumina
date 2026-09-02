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
        'nexus-canvas-create',
        'nexus-canvas-update',
        'nexus-canvas-comment',
        'Step',
        'Sequence',
        'TimelineEvent',
        'Timeline',
        'Elicitation',
        'ElicitationsGroup',
        'FollowUp',
        'GenerateWidget',
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

    const textMatches = [];
    const placeholderMath = math.replace(/\\text\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, (m, txt) => {
        const id = `TXPH${textMatches.length}END`;
        textMatches.push({ id, txt });
        return `\\text{${id}}`;
    });

    let rendered = katex.renderToString(placeholderMath, { displayMode: isDisplay, throwOnError: false, strict: 'ignore' });

    for (const item of textMatches) {
        const safeText = item.txt
            .replace(/\\([%$&_#{}\\])/g, '$1')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/ /g, '&nbsp;');
        rendered = rendered.replaceAll(item.id, safeText);
    }
    return rendered;
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

if (typeof marked !== 'undefined') {
    initMarkdownMath();
}
