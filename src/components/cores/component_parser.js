import { WidgetRunner } from '../widgets/widget_runner.js';

// ============================================================================
// 1. Shared Utilities & SVG Icon Registry
// ============================================================================

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function parseAttributes(attrString) {
    const props = {};
    if (!attrString) return props;
    const attrRegex = /([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
    let match;
    while ((match = attrRegex.exec(attrString)) !== null) {
        props[match[1]] = match[2] !== undefined ? match[2] : match[3];
    }
    return props;
}

const ICONS = {
    chevronRight: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>',
    copy: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>',
    comparison: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>',
    arrowPrev: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>',
    arrowNext: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>',
    email: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>',
    social: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>',
    chat: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>',
    document: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>',
    pen: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>',
    bento: {
        sparkles: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"></path></svg>',
        zap: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>',
        shield: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>',
        layers: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>',
        cpu: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"></rect><rect x="9" y="9" width="6" height="6"></rect><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3"></path></svg>',
        code: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>',
        rocket: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"></path><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"></path></svg>',
        chart: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>',
        globe: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>',
        default: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>'
    }
};

function getBentoIcon(name) {
    const key = (name || '').toLowerCase();
    return ICONS.bento[key] || ICONS.bento.default;
}

// ============================================================================
// 2. Component Extensions Definition
// ============================================================================

export function initComponentParser() {
    if (typeof marked === 'undefined' || typeof marked.use !== 'function') return;

    marked.use({
        extensions: [
            // 1. <ElicitationsGroup> & <Elicitation> (Action Chips)
            {
                name: 'elicitationsGroup',
                level: 'block',
                start(src) { return src.indexOf('<ElicitationsGroup'); },
                tokenizer(src) {
                    const completeMatch = src.match(/^<ElicitationsGroup(?:\s+message="([^"]*)")?>([\s\S]*?)<\/ElicitationsGroup>/i);
                    if (completeMatch) {
                        return {
                            type: 'elicitationsGroup',
                            raw: completeMatch[0],
                            message: completeMatch[1] || '',
                            body: completeMatch[2] || '',
                            isComplete: true
                        };
                    }
                    const partialMatch = src.match(/^<ElicitationsGroup[\s\S]*$/i);
                    if (partialMatch) {
                        return {
                            type: 'elicitationsGroup',
                            raw: partialMatch[0],
                            message: '',
                            body: '',
                            isComplete: false
                        };
                    }
                },
                renderer(token) {
                    if (!token.isComplete) return '';
                    const messageHtml = token.message ? `<div class="nexus-chips-header">${escapeHtml(token.message)}</div>` : '';
                    const chipRegex = /<Elicitation\s+label="([^"]*)"\s+query="([^"]*)"\s*\/?>/gi;
                    let chipsHtml = '';
                    let match;
                    while ((match = chipRegex.exec(token.body)) !== null) {
                        const label = match[1] || '';
                        const query = match[2] || '';
                        chipsHtml += `<button type="button" class="nexus-action-chip" data-query="${escapeHtml(query)}">${ICONS.chevronRight}<span>${escapeHtml(label)}</span></button>`;
                    }
                    return chipsHtml ? `<div class="nexus-elicitations-wrapper">${messageHtml}<div class="nexus-action-chips-grid">${chipsHtml}</div></div>` : '';
                }
            },

            // 2. <FollowUp> (Single 1-Click Action Card)
            {
                name: 'followUp',
                level: 'block',
                start(src) { return src.indexOf('<FollowUp'); },
                tokenizer(src) {
                    const match = src.match(/^<FollowUp\s+([^>]*?)\s*\/?>/i);
                    if (match) {
                        const props = parseAttributes(match[1]);
                        return {
                            type: 'followUp',
                            raw: match[0],
                            label: props.label || '',
                            button: props.button || props.action || '',
                            query: props.query || '',
                            isComplete: true
                        };
                    }
                    const partialMatch = src.match(/^<FollowUp[\s\S]*$/i);
                    if (partialMatch) {
                        return {
                            type: 'followUp',
                            raw: partialMatch[0],
                            label: '',
                            button: '',
                            query: '',
                            isComplete: false
                        };
                    }
                },
                renderer(token) {
                    if (!token.isComplete || !token.label || !token.query) return '';
                    const isVietnamese = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(token.label);
                    const defaultBtnText = isVietnamese ? 'Tiếp tục' : 'Yes, Please';
                    const buttonText = token.button || defaultBtnText;
                    return `<div class="nexus-followup-container"><div class="nexus-followup-card"><div class="nexus-followup-label">${escapeHtml(token.label)}</div><button type="button" class="nexus-followup-btn" data-query="${escapeHtml(token.query)}"><span>${escapeHtml(buttonText)}</span>${ICONS.chevronRight}</button></div></div>`;
                }
            },

            // 3. <Sequence> & <Step> (Step-by-step Procedures Flow)
            {
                name: 'sequenceBlock',
                level: 'block',
                start(src) { return src.indexOf('<Sequence'); },
                tokenizer(src) {
                    const closedMatch = src.match(/^<Sequence(?:\s*\/?>|>)([\s\S]*?)<\/Sequence>/i);
                    if (closedMatch) {
                        return {
                            type: 'sequenceBlock',
                            raw: closedMatch[0],
                            body: closedMatch[1] || ''
                        };
                    }
                    const streamingMatch = src.match(/^<Sequence(?:\s*\/?>|>)([\s\S]*)$/i);
                    if (streamingMatch) {
                        return {
                            type: 'sequenceBlock',
                            raw: streamingMatch[0],
                            body: streamingMatch[1] || ''
                        };
                    }
                    const tagShieldMatch = src.match(/^<Sequence[^>]*$/i);
                    if (tagShieldMatch) {
                        return {
                            type: 'sequenceBlock',
                            raw: tagShieldMatch[0],
                            body: ''
                        };
                    }
                },
                renderer(token) {
                    const stepRegex = /<Step([^>]*)>([\s\S]*?)(?:<\/Step>|$)/gi;
                    let stepsHtml = '';
                    let stepNum = 1;
                    let match;
                    while ((match = stepRegex.exec(token.body)) !== null) {
                        const props = parseAttributes(match[1]);
                        let rawContent = (match[2] || '').trim();
                        rawContent = rawContent.replace(/<Step[\s\S]*$/i, '').trim();

                        const title = props.title || `Step ${stepNum}`;
                        const subtitle = props.subtitle ? `<span class="nexus-step-subtitle">${escapeHtml(props.subtitle)}</span>` : '';
                        const content = rawContent ? marked.parse(rawContent) : '';
                        const numStr = stepNum < 10 ? `0${stepNum}` : `${stepNum}`;

                        stepsHtml += `<div class="nexus-step-card"><div class="nexus-step-header"><div class="nexus-step-badge">${numStr}</div><div class="nexus-step-title-wrap"><span class="nexus-step-title">${escapeHtml(title)}</span>${subtitle}</div></div><div class="nexus-step-content">${content}</div></div>`;
                        stepNum++;
                    }
                    return stepsHtml ? `<div class="nexus-sequence-flow">${stepsHtml}</div>` : '';
                }
            },

            // 4. <Timeline> & <TimelineEvent> (Chronological Timelines)
            {
                name: 'timelineBlock',
                level: 'block',
                start(src) { return src.indexOf('<Timeline'); },
                tokenizer(src) {
                    const closedMatch = src.match(/^<Timeline(?:\s*\/?>|>)([\s\S]*?)<\/Timeline>/i);
                    if (closedMatch) {
                        return {
                            type: 'timelineBlock',
                            raw: closedMatch[0],
                            body: closedMatch[1] || ''
                        };
                    }
                    const streamingMatch = src.match(/^<Timeline(?:\s*\/?>|>)([\s\S]*)$/i);
                    if (streamingMatch) {
                        return {
                            type: 'timelineBlock',
                            raw: streamingMatch[0],
                            body: streamingMatch[1] || ''
                        };
                    }
                    const tagShieldMatch = src.match(/^<Timeline[^>]*$/i);
                    if (tagShieldMatch) {
                        return {
                            type: 'timelineBlock',
                            raw: tagShieldMatch[0],
                            body: ''
                        };
                    }
                },
                renderer(token) {
                    const eventRegex = /<TimelineEvent([^>]*)>([\s\S]*?)(?:<\/TimelineEvent>|$)/gi;
                    let eventsHtml = '';
                    let match;
                    while ((match = eventRegex.exec(token.body)) !== null) {
                        const props = parseAttributes(match[1]);
                        let rawContent = (match[2] || '').trim();
                        rawContent = rawContent.replace(/<TimelineEvent[\s\S]*$/i, '').trim();

                        const title = props.title || 'Event';
                        const time = props.time || props.date || '';
                        const content = rawContent ? marked.parse(rawContent) : '';

                        eventsHtml += `<div class="nexus-timeline-item"><div class="nexus-timeline-marker"></div><div class="nexus-timeline-content"><div class="nexus-timeline-time">${escapeHtml(time)}</div><div class="nexus-timeline-title">${escapeHtml(title)}</div><div class="nexus-timeline-body">${content}</div></div></div>`;
                    }
                    return eventsHtml ? `<div class="nexus-timeline-track">${eventsHtml}</div>` : '';
                }
            },

            // 5. <GenerateApp> & <GenerateWidget> (Interactive Sandbox Apps / Widgets)
            {
                name: 'generateWidget',
                level: 'block',
                start(src) {
                    const i1 = src.indexOf('<GenerateApp');
                    const i2 = src.indexOf('<GenerateWidget');
                    if (i1 === -1) return i2;
                    if (i2 === -1) return i1;
                    return Math.min(i1, i2);
                },
                tokenizer(src) {
                    const completeMatch = src.match(/^<(?:GenerateApp|GenerateWidget)([^>]*)>([\s\S]*?)<\/(?:GenerateApp|GenerateWidget)>/i);
                    if (completeMatch) {
                        const props = parseAttributes(completeMatch[1]);
                        return {
                            type: 'generateWidget',
                            raw: completeMatch[0],
                            height: props.height || '380px',
                            title: props.title || 'Interactive App',
                            body: completeMatch[2] || '',
                            isComplete: true
                        };
                    }
                    const partialMatch = src.match(/^<(?:GenerateApp|GenerateWidget)([^>]*)>([\s\S]*)$/i);
                    if (partialMatch) {
                        const props = parseAttributes(partialMatch[1]);
                        return {
                            type: 'generateWidget',
                            raw: partialMatch[0],
                            height: props.height || '380px',
                            title: props.title || 'Interactive App',
                            body: partialMatch[2] || '',
                            isComplete: false
                        };
                    }
                    const tagShieldMatch = src.match(/^<(?:GenerateApp|GenerateWidget)[^>]*$/i);
                    if (tagShieldMatch) {
                        return {
                            type: 'generateWidget',
                            raw: tagShieldMatch[0],
                            height: '380px',
                            title: 'Loading App...',
                            body: '',
                            isComplete: false
                        };
                    }
                },
                renderer(token) {
                    const safeTitle = escapeHtml(token.title || 'Interactive App');
                    if (!token.isComplete) {
                        return `<div class="nexus-widget-wrapper nexus-widget-loading" style="min-height: 180px;">
                            <div class="nexus-widget-header">
                                <div class="nexus-widget-header-left">
                                    <span class="nexus-widget-title">${safeTitle}</span>
                                </div>
                            </div>
                            <div class="nexus-shimmer-skeleton nexus-widget-skeleton" style="min-height: 140px; margin: 0; border-radius: 0;"></div>
                        </div>`;
                    }
                    if (typeof WidgetRunner !== 'undefined') {
                        return WidgetRunner.renderWidgetCard(token.body, token.height, token.title);
                    }
                    return `<div class="nexus-widget-placeholder">[Interactive App: ${safeTitle}]</div>`;
                }
            },

            // 6. <Widget> (Built-in Native Widgets: Timer, Pomodoro, Stopwatch, etc.)
            {
                name: 'builtinWidget',
                level: 'block',
                start(src) { return src.indexOf('<Widget'); },
                tokenizer(src) {
                    const completeMatch = src.match(/^\s*<Widget([^>]*?)(?:\s*\/>|>([\s\S]*?)<\/Widget>)/i);
                    if (completeMatch) {
                        const props = parseAttributes(completeMatch[1]);
                        const name = (props.name || 'widget').toLowerCase();
                        return {
                            type: 'builtinWidget',
                            raw: completeMatch[0],
                            name,
                            props,
                            isComplete: true
                        };
                    }
                    const partialMatch = src.match(/^\s*<Widget[\s\S]*$/i);
                    if (partialMatch) {
                        return {
                            type: 'builtinWidget',
                            raw: partialMatch[0],
                            name: '',
                            props: {},
                            isComplete: false
                        };
                    }
                },
                renderer(token) {
                    if (!token.isComplete || !token.name) return '';
                    const safeName = token.name.replace(/[^a-zA-Z0-9_-]/g, '');
                    const encodedProps = encodeURIComponent(JSON.stringify(token.props || {}));
                    return `<div class="nexus-widget" data-nexus-widget-placeholder="true" data-widget-name="${safeName}" data-widget-props="${encodedProps}"></div>`;
                }
            },

            // 7. <Carousel> & <Image> (Image Gallery Slider)
            {
                name: 'carouselBlock',
                level: 'block',
                start(src) { return src.indexOf('<Carousel'); },
                tokenizer(src) {
                    const match = src.match(/^<Carousel>([\s\S]*?)(?:<\/Carousel>|$)/i);
                    if (match) {
                        return {
                            type: 'carouselBlock',
                            raw: match[0],
                            body: match[1] || ''
                        };
                    }
                },
                renderer(token) {
                    const imgRegex = /<Image\s+([^>]*?)\s*\/?>/gi;
                    let itemsHtml = '';
                    let dotsHtml = '';
                    let count = 0;
                    let match;
                    while ((match = imgRegex.exec(token.body)) !== null) {
                        const props = parseAttributes(match[1]);
                        const rawSrc = props.src || '';
                        const query = props.query || '';
                        const alt = escapeHtml(props.alt || 'Image');
                        const caption = props.caption || '';

                        let finalSrc = rawSrc;
                        if (!finalSrc && query) {
                            finalSrc = `image-search://${encodeURIComponent(query)}`;
                        }

                        const isDynamic = finalSrc.startsWith('image-search://');
                        const imgTag = isDynamic
                            ? `<img class="nexus-dynamic-image" data-query="${finalSrc.replace('image-search://', '')}" alt="${alt}" loading="lazy" />`
                            : `<img src="${finalSrc}" alt="${alt}" loading="lazy" />`;

                        const captionHtml = caption ? `<div class="nexus-carousel-caption">${escapeHtml(caption)}</div>` : '';
                        itemsHtml += `<div class="nexus-carousel-item"><div class="nexus-carousel-img-wrap">${imgTag}</div>${captionHtml}</div>`;
                        dotsHtml += `<span class="nexus-carousel-dot ${count === 0 ? 'is-active' : ''}" data-index="${count}"></span>`;
                        count++;
                    }

                    if (count === 0) return '';

                    return `<div class="nexus-carousel-container">
                        <button type="button" class="nexus-carousel-nav nexus-carousel-prev" aria-label="Previous image">${ICONS.arrowPrev}</button>
                        <div class="nexus-carousel-track">${itemsHtml}</div>
                        <button type="button" class="nexus-carousel-nav nexus-carousel-next" aria-label="Next image">${ICONS.arrowNext}</button>
                        <div class="nexus-carousel-dots">${dotsHtml}</div>
                    </div>`;
                }
            },

            // 8. <WritingBlock> & <Option> (Drafting & Writing Artifacts with Multi-Options)
            {
                name: 'writingBlock',
                level: 'block',
                start(src) { return src.search(/<WritingBlock/i); },
                tokenizer(src) {
                    const completeMatch = src.match(/^\s*<WritingBlock([^>]*)>([\s\S]*?)<\/WritingBlock>/i);
                    if (completeMatch) {
                        const props = parseAttributes(completeMatch[1]);
                        return {
                            type: 'writingBlock',
                            raw: completeMatch[0],
                            variant: (props.variant || 'document').toLowerCase(),
                            title: props.title || 'Draft',
                            body: completeMatch[2] || '',
                            isComplete: true
                        };
                    }
                    const partialMatch = src.match(/^\s*<WritingBlock([^>]*)>([\s\S]*)$/i);
                    if (partialMatch) {
                        const props = parseAttributes(partialMatch[1]);
                        return {
                            type: 'writingBlock',
                            raw: partialMatch[0],
                            variant: (props.variant || 'document').toLowerCase(),
                            title: props.title || 'Draft',
                            body: partialMatch[2] || '',
                            isComplete: false
                        };
                    }
                    const tagShieldMatch = src.match(/^\s*<WritingBlock[^>]*$/i);
                    if (tagShieldMatch) {
                        const props = parseAttributes(tagShieldMatch[0]);
                        return {
                            type: 'writingBlock',
                            raw: tagShieldMatch[0],
                            variant: (props.variant || 'document').toLowerCase(),
                            title: props.title || 'Draft',
                            body: '',
                            isComplete: false
                        };
                    }
                },
                renderer(token) {
                    const safeTitle = escapeHtml(token.title || 'Draft');
                    const variant = token.variant || 'document';
                    
                    const variantMeta = {
                        email: { label: 'EMAIL', icon: ICONS.email },
                        social_post: { label: 'SOCIAL POST', icon: ICONS.social },
                        chat_message: { label: 'CHAT / DM', icon: ICONS.chat },
                        document: { label: 'DOCUMENT', icon: ICONS.document }
                    }[variant] || { label: 'WRITING', icon: ICONS.pen };

                    const optionRegex = /<Option([^>]*)>([\s\S]*?)(?:<\/Option>|$)/gi;
                    const options = [];
                    let match;
                    while ((match = optionRegex.exec(token.body)) !== null) {
                        const optProps = parseAttributes(match[1]);
                        let optBody = (match[2] || '').trim();
                        optBody = optBody.replace(/<Option[\s\S]*$/i, '').trim();

                        options.push({
                            title: optProps.title || `Option ${options.length + 1}`,
                            subject: optProps.subject || '',
                            content: optBody
                        });
                    }

                    if (options.length === 0 && token.body.trim()) {
                        options.push({
                            title: 'Draft',
                            subject: '',
                            content: token.body.trim()
                        });
                    }

                    let tabsHtml = '';
                    if (options.length > 1) {
                        tabsHtml = `<div class="nexus-writing-segmented">` +
                            options.map((opt, i) => `<button type="button" class="nexus-writing-tab ${i === 0 ? 'is-active' : ''}" data-opt-index="${i}"><span>${escapeHtml(opt.title)}</span></button>`).join('') +
                            `</div>`;
                    }

                    let panesHtml = '';
                    options.forEach((opt, i) => {
                        const parsedContent = opt.content ? marked.parse(opt.content) : '';
                        const subjectHtml = opt.subject ? `
                            <div class="nexus-writing-subject-row">
                                <span class="nexus-subject-label">Subject:</span>
                                <span class="nexus-subject-text">${escapeHtml(opt.subject)}</span>
                            </div>` : '';
                        panesHtml += `
                            <div class="nexus-writing-pane ${i === 0 ? 'is-active' : ''}" data-opt-index="${i}" data-raw-content="${encodeURIComponent(opt.content)}">
                                ${subjectHtml}
                                <div class="nexus-writing-content">${parsedContent}</div>
                            </div>`;
                    });

                    return `
                    <div class="nexus-writing-block ${!token.isComplete ? 'is-streaming' : ''}" data-variant="${variant}">
                        <div class="nexus-writing-header">
                            <div class="nexus-writing-header-left">
                                <span class="nexus-writing-icon">${variantMeta.icon}</span>
                                <span class="nexus-writing-title">${safeTitle}</span>
                            </div>
                            <div class="nexus-writing-header-right">
                                ${tabsHtml}
                                <button type="button" class="nexus-writing-action-btn nexus-writing-btn-copy" title="Sao chép toàn bộ">
                                    ${ICONS.copy}
                                    <span>Copy</span>
                                </button>
                            </div>
                        </div>
                        <div class="nexus-writing-body">
                            ${panesHtml}
                        </div>
                    </div>`;
                }
            },

            // 9. <Comparison> & <Aspect> (Side-by-Side Multi-Dimensional Comparisons)
            {
                name: 'comparisonBlock',
                level: 'block',
                start(src) { return src.search(/<Comparison/i); },
                tokenizer(src) {
                    const completeMatch = src.match(/^\s*<Comparison([^>]*)>([\s\S]*?)<\/Comparison>/i);
                    if (completeMatch) {
                        const props = parseAttributes(completeMatch[1]);
                        return {
                            type: 'comparisonBlock',
                            raw: completeMatch[0],
                            title: props.title || 'Comparison',
                            leftName: props.leftName || props.left || 'Option A',
                            rightName: props.rightName || props.right || 'Option B',
                            body: completeMatch[2] || '',
                            isComplete: true
                        };
                    }
                    const partialMatch = src.match(/^\s*<Comparison([^>]*)>([\s\S]*)$/i);
                    if (partialMatch) {
                        const props = parseAttributes(partialMatch[1]);
                        return {
                            type: 'comparisonBlock',
                            raw: partialMatch[0],
                            title: props.title || 'Comparison',
                            leftName: props.leftName || props.left || 'Option A',
                            rightName: props.rightName || props.right || 'Option B',
                            body: partialMatch[2] || '',
                            isComplete: false
                        };
                    }
                    const tagShieldMatch = src.match(/^\s*<Comparison[^>]*$/i);
                    if (tagShieldMatch) {
                        const props = parseAttributes(tagShieldMatch[0]);
                        return {
                            type: 'comparisonBlock',
                            raw: tagShieldMatch[0],
                            title: props.title || 'Comparison',
                            leftName: props.leftName || props.left || 'Option A',
                            rightName: props.rightName || props.right || 'Option B',
                            body: '',
                            isComplete: false
                        };
                    }
                },
                renderer(token) {
                    const safeTitle = escapeHtml(token.title || 'Comparison');
                    const safeLeft = escapeHtml(token.leftName || 'Option A');
                    const safeRight = escapeHtml(token.rightName || 'Option B');

                    const cleanBody = (token.body || '').replace(/<\/?Comparison\b[^>]*>/gi, '').trim();
                    const aspectRegex = /<Aspect\b((?:[^"'\/>]|"[^"]*"|'[^']*')*?)(?:\s*\/>|>([\s\S]*?)<\/Aspect>|>([\s\S]*?)(?=<Aspect\b|<\/Comparison>|$))/gi;
                    let rowsHtml = '';
                    let match;
                    while ((match = aspectRegex.exec(cleanBody)) !== null) {
                        const props = parseAttributes(match[1]);
                        const aspectName = props.name || props.label || 'Criteria';
                        let leftContent = props.left || '';
                        let rightContent = props.right || '';

                        const rawBody = (match[2] || match[3] || '').trim();
                        if (!leftContent && !rightContent && rawBody) {
                            const leftChildMatch = rawBody.match(/<Left>([\s\S]*?)<\/Left>/i);
                            const rightChildMatch = rawBody.match(/<Right>([\s\S]*?)<\/Right>/i);
                            if (leftChildMatch || rightChildMatch) {
                                leftContent = leftChildMatch ? leftChildMatch[1].trim() : '';
                                rightContent = rightChildMatch ? rightChildMatch[1].trim() : '';
                            } else {
                                const parts = rawBody.split(/vs|\/|\|/i);
                                if (parts.length >= 2) {
                                    leftContent = parts[0].trim();
                                    rightContent = parts[1].trim();
                                } else {
                                    leftContent = rawBody;
                                }
                            }
                        }

                        let winner = (props.winner || '').toLowerCase();
                        if (!winner) {
                            if (props.leftWinner === 'true') winner = 'left';
                            else if (props.rightWinner === 'true') winner = 'right';
                        }
                        const leftClass = winner === 'left' ? 'is-winner' : (winner === 'right' ? 'is-subdued' : '');
                        const rightClass = winner === 'right' ? 'is-winner' : (winner === 'left' ? 'is-subdued' : '');

                        rowsHtml += `
                        <div class="nexus-comparison-row">
                            <div class="nexus-aspect-label">${escapeHtml(aspectName)}</div>
                            <div class="nexus-aspect-cols">
                                <div class="nexus-aspect-col nexus-aspect-left ${leftClass}">
                                    <div class="nexus-col-mobile-badge">${safeLeft}</div>
                                    <div class="nexus-aspect-text">${marked.parseInline(leftContent)}</div>
                                </div>
                                <div class="nexus-aspect-col nexus-aspect-right ${rightClass}">
                                    <div class="nexus-col-mobile-badge">${safeRight}</div>
                                    <div class="nexus-aspect-text">${marked.parseInline(rightContent)}</div>
                                </div>
                            </div>
                        </div>`;
                    }

                    return `
                    <div class="nexus-comparison-card">
                        <div class="nexus-comparison-header">
                            <div class="nexus-comparison-header-left">
                                <span class="nexus-comparison-icon">${ICONS.comparison}</span>
                                <span class="nexus-comparison-title">${safeTitle}</span>
                            </div>
                            <div class="nexus-comparison-entities">
                                <span class="nexus-comparison-badge badge-left">${safeLeft}</span>
                                <span class="nexus-comparison-vs">vs</span>
                                <span class="nexus-comparison-badge badge-right">${safeRight}</span>
                            </div>
                        </div>
                        <div class="nexus-comparison-table">
                            ${rowsHtml}
                        </div>
                    </div>`;
                }
            },

            // 10. <Metrics> & <Metric> (Key Statistics, Complexity & Benchmark Grids)
            {
                name: 'metricsBlock',
                level: 'block',
                start(src) { return src.search(/<Metrics/i); },
                tokenizer(src) {
                    const completeMatch = src.match(/^\s*<Metrics([^>]*)>([\s\S]*?)<\/Metrics>/i);
                    if (completeMatch) {
                        const props = parseAttributes(completeMatch[1]);
                        return {
                            type: 'metricsBlock',
                            raw: completeMatch[0],
                            title: props.title || 'Key Metrics',
                            body: completeMatch[2] || '',
                            isComplete: true
                        };
                    }
                    const partialMatch = src.match(/^\s*<Metrics([^>]*)>([\s\S]*)$/i);
                    if (partialMatch) {
                        const props = parseAttributes(partialMatch[1]);
                        return {
                            type: 'metricsBlock',
                            raw: partialMatch[0],
                            title: props.title || 'Key Metrics',
                            body: partialMatch[2] || '',
                            isComplete: false
                        };
                    }
                    const tagShieldMatch = src.match(/^\s*<Metrics[^>]*$/i);
                    if (tagShieldMatch) {
                        const props = parseAttributes(tagShieldMatch[0]);
                        return {
                            type: 'metricsBlock',
                            raw: tagShieldMatch[0],
                            title: props.title || 'Key Metrics',
                            body: '',
                            isComplete: false
                        };
                    }
                },
                renderer(token) {
                    const safeTitle = escapeHtml(token.title || 'Key Metrics');
                    const cleanBody = (token.body || '').replace(/<\/?Metrics\b[^>]*>/gi, '').trim();
                    const metricRegex = /<Metric\b((?:[^"'\/>]|"[^"]*"|'[^']*')*?)(?:\s*\/>|>([\s\S]*?)<\/Metric>|>([\s\S]*?)(?=<Metric\b|<\/Metrics>|$))/gi;
                    let itemsHtml = '';
                    let match;
                    while ((match = metricRegex.exec(cleanBody)) !== null) {
                        const props = parseAttributes(match[1]);
                        const label = props.label || 'Metric';
                        let value = props.value || (match[2] || match[3] || '').trim();

                        if (!props.label && !props.value && !value && !props.hint) continue;

                        // Clean math notations in metrics values
                        value = value
                            .replace(/\\log\b/g, 'log')
                            .replace(/\\Theta\b/g, 'Θ')
                            .replace(/\\Omega\b/g, 'Ω')
                            .replace(/\\approx\b/g, '≈')
                            .replace(/\\le\b/g, '≤')
                            .replace(/\\ge\b/g, '≥')
                            .replace(/\\cdot\b/g, '·')
                            .replace(/\\left\(/g, '(')
                            .replace(/\\right\)/g, ')')
                            .replace(/\^2\b/g, '²')
                            .replace(/\^3\b/g, '³')
                            .replace(/\^k\b/g, 'ᵏ')
                            .replace(/\^n\b/g, 'ⁿ')
                            .replace(/\^([0-9]+)/g, (m, p) => p.split('').map(d => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d] || d).join(''));
                        
                        const status = (props.status || 'neutral').toLowerCase();
                        const hint = props.hint ? `<div class="nexus-metric-hint">${escapeHtml(props.hint)}</div>` : '';

                        itemsHtml += `
                        <div class="nexus-metric-card" data-status="${escapeHtml(status)}">
                            <div class="nexus-metric-label">${escapeHtml(label)}</div>
                            <div class="nexus-metric-value">${escapeHtml(value)}</div>
                            ${hint}
                        </div>`;
                    }

                    return `
                    <div class="nexus-metrics-wrapper">
                        <div class="nexus-metrics-grid">
                            ${itemsHtml}
                        </div>
                    </div>`;
                }
            },

            // 11. <BentoGrid> & <BentoItem> (Asymmetric Bento Box Feature Layouts)
            {
                name: 'bentoGridBlock',
                level: 'block',
                start(src) { return src.search(/<BentoGrid/i); },
                tokenizer(src) {
                    const completeMatch = src.match(/^\s*<BentoGrid([^>]*)>([\s\S]*?)<\/BentoGrid>/i);
                    if (completeMatch) {
                        const props = parseAttributes(completeMatch[1]);
                        return {
                            type: 'bentoGridBlock',
                            raw: completeMatch[0],
                            title: props.title || '',
                            body: completeMatch[2] || '',
                            isComplete: true
                        };
                    }
                    const partialMatch = src.match(/^\s*<BentoGrid([^>]*)>([\s\S]*)$/i);
                    if (partialMatch) {
                        const props = parseAttributes(partialMatch[1]);
                        return {
                            type: 'bentoGridBlock',
                            raw: partialMatch[0],
                            title: props.title || '',
                            body: partialMatch[2] || '',
                            isComplete: false
                        };
                    }
                    const tagShieldMatch = src.match(/^\s*<BentoGrid[^>]*$/i);
                    if (tagShieldMatch) {
                        const props = parseAttributes(tagShieldMatch[0]);
                        return {
                            type: 'bentoGridBlock',
                            raw: tagShieldMatch[0],
                            title: props.title || '',
                            body: '',
                            isComplete: false
                        };
                    }
                },
                renderer(token) {
                    const cleanBody = (token.body || '').replace(/<\/?BentoGrid\b[^>]*>/gi, '').trim();
                    const bentoRegex = /<BentoItem\b((?:[^"'\/>]|"[^"]*"|'[^']*')*?)(?:\s*\/>|>([\s\S]*?)<\/BentoItem>|>([\s\S]*?)(?=<BentoItem\b|<\/BentoGrid>|$))/gi;
                    const items = [];
                    let match;
                    while ((match = bentoRegex.exec(cleanBody)) !== null) {
                        const props = parseAttributes(match[1]);
                        const itemTitle = props.title || 'Feature';
                        const requestedSpan = props.span === '2' ? 2 : 1;
                        const rawContent = (match[2] || match[3] || '').trim();

                        items.push({
                            title: itemTitle,
                            span: requestedSpan,
                            tag: props.tag || '',
                            icon: props.icon || '',
                            content: rawContent
                        });
                    }

                    // Auto-balance grid to avoid orphaned empty cells in 2-column layout
                    let colPos = 0;
                    for (let i = 0; i < items.length; i++) {
                        const it = items[i];
                        if (it.span === 2) {
                            colPos = 0;
                        } else {
                            colPos = (colPos + 1) % 2;
                        }
                    }
                    if (items.length > 0 && colPos === 1) {
                        items[items.length - 1].span = 2;
                    }

                    let itemsHtml = '';
                    items.forEach(it => {
                        const tagHtml = it.tag ? `<span class="nexus-bento-tag">${escapeHtml(it.tag)}</span>` : '';
                        const iconSvg = getBentoIcon(it.icon);
                        const parsedContent = it.content ? marked.parse(it.content) : '';

                        itemsHtml += `
                        <div class="nexus-bento-item span-${it.span}">
                            <div class="nexus-bento-item-header">
                                <div class="nexus-bento-item-icon">${iconSvg}</div>
                                ${tagHtml}
                            </div>
                            <div class="nexus-bento-item-title">${escapeHtml(it.title)}</div>
                            <div class="nexus-bento-item-desc">${parsedContent}</div>
                        </div>`;
                    });

                    return `
                    <div class="nexus-bento-container">
                        <div class="nexus-bento-grid">
                            ${itemsHtml}
                        </div>
                    </div>`;
                }
            }
        ]
    });
}

// Backwards compatibility aliases
export const initLmdxComponentsParser = initComponentParser;

if (typeof marked !== 'undefined') {
    initComponentParser();
}
