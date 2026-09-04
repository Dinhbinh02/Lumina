import { WidgetRunner } from '../widgets/widget_runner.js';

export function initLmdxComponentsParser() {
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
                    // Shielding: Hide incomplete raw XML during streaming
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
                    const messageHtml = token.message ? `<div class="nexus-chips-header">${token.message}</div>` : '';
                    const chipRegex = /<Elicitation\s+label="([^"]*)"\s+query="([^"]*)"\s*\/?>/gi;
                    let chipsHtml = '';
                    let match;
                    while ((match = chipRegex.exec(token.body)) !== null) {
                        const label = match[1] || '';
                        const query = match[2] || '';
                        const escapedQuery = query.replace(/"/g, '&quot;');
                        chipsHtml += `<button type="button" class="nexus-action-chip" data-query="${escapedQuery}"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg><span>${label}</span></button>`;
                    }
                    return chipsHtml ? `<div class="nexus-elicitations-wrapper">${messageHtml}<div class="nexus-action-chips-grid">${chipsHtml}</div></div>` : '';
                }
            },

            // 2. <FollowUp> (Single 1-Click Action)
            {
                name: 'followUp',
                level: 'block',
                start(src) { return src.indexOf('<FollowUp'); },
                tokenizer(src) {
                    const match = src.match(/^<FollowUp\s+([^>]*?)\s*\/?>/i);
                    if (match) {
                        const attrs = match[1];
                        const labelMatch = attrs.match(/\blabel="([^"]*)"/i);
                        const buttonMatch = attrs.match(/\b(?:button|action)="([^"]*)"/i);
                        const queryMatch = attrs.match(/\bquery="([^"]*)"/i);
                        return {
                            type: 'followUp',
                            raw: match[0],
                            label: labelMatch ? labelMatch[1] : '',
                            button: buttonMatch ? buttonMatch[1] : '',
                            query: queryMatch ? queryMatch[1] : '',
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
                    const escapedQuery = (token.query || '').replace(/"/g, '&quot;');
                    const isVietnamese = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(token.label);
                    const defaultBtnText = isVietnamese ? 'Tiếp tục' : 'Yes, Please';
                    const buttonText = token.button || defaultBtnText;
                    return `<div class="nexus-followup-container"><div class="nexus-followup-card"><div class="nexus-followup-label">${token.label}</div><button type="button" class="nexus-followup-btn" data-query="${escapedQuery}"><span>${buttonText}</span><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg></button></div></div>`;
                }
            },

            // 3. <Sequence> & <Step> (Step-by-step Procedures)
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
                        const attrs = match[1] || '';
                        let rawContent = (match[2] || '').trim();
                        rawContent = rawContent.replace(/<Step[\s\S]*$/i, '').trim();

                        const titleMatch = attrs.match(/\btitle="([^"]*)"/i);
                        const subtitleMatch = attrs.match(/\bsubtitle="([^"]*)"/i);
                        const title = titleMatch ? titleMatch[1] : `Step ${stepNum}`;
                        const subtitle = subtitleMatch ? `<span class="nexus-step-subtitle">${subtitleMatch[1]}</span>` : '';

                        const content = rawContent ? marked.parse(rawContent) : '';
                        const numStr = stepNum < 10 ? `0${stepNum}` : `${stepNum}`;
                        stepsHtml += `<div class="nexus-step-card"><div class="nexus-step-header"><div class="nexus-step-badge">${numStr}</div><div class="nexus-step-title-wrap"><span class="nexus-step-title">${title}</span>${subtitle}</div></div><div class="nexus-step-content">${content}</div></div>`;
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
                        const attrs = match[1] || '';
                        let rawContent = (match[2] || '').trim();
                        rawContent = rawContent.replace(/<TimelineEvent[\s\S]*$/i, '').trim();

                        const titleMatch = attrs.match(/\btitle="([^"]*)"/i);
                        const timeMatch = attrs.match(/\b(?:time|date)="([^"]*)"/i);
                        const title = titleMatch ? titleMatch[1] : 'Event';
                        const time = timeMatch ? timeMatch[1] : '';

                        const content = rawContent ? marked.parse(rawContent) : '';
                        eventsHtml += `<div class="nexus-timeline-item"><div class="nexus-timeline-marker"></div><div class="nexus-timeline-content"><div class="nexus-timeline-time">${time}</div><div class="nexus-timeline-title">${title}</div><div class="nexus-timeline-body">${content}</div></div></div>`;
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
                        const attrs = completeMatch[1] || '';
                        const heightMatch = attrs.match(/\bheight="([^"]*)"/i);
                        const titleMatch = attrs.match(/\btitle="([^"]*)"/i);
                        return {
                            type: 'generateWidget',
                            raw: completeMatch[0],
                            height: heightMatch ? heightMatch[1] : '380px',
                            title: titleMatch ? titleMatch[1] : 'Interactive App',
                            body: completeMatch[2] || '',
                            isComplete: true
                        };
                    }
                    const partialMatch = src.match(/^<(?:GenerateApp|GenerateWidget)([^>]*)>([\s\S]*)$/i);
                    if (partialMatch) {
                        const attrs = partialMatch[1] || '';
                        const heightMatch = attrs.match(/\bheight="([^"]*)"/i);
                        const titleMatch = attrs.match(/\btitle="([^"]*)"/i);
                        return {
                            type: 'generateWidget',
                            raw: partialMatch[0],
                            height: heightMatch ? heightMatch[1] : '380px',
                            title: titleMatch ? titleMatch[1] : 'Interactive App',
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
                    const safeTitle = (token.title || 'Interactive Widget')
                        .replace(/&/g, '&amp;')
                        .replace(/"/g, '&quot;')
                        .replace(/'/g, '&#39;')
                        .replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;');
                    const safeHeight = token.height || '380px';
                    if (!token.isComplete) {
                        return `<div class="nexus-widget-wrapper nexus-widget-loading" style="min-height: 200px;">
                            <div class="nexus-widget-header">
                                <div class="nexus-widget-header-left">
                                    <span class="nexus-widget-title">${safeTitle}</span>
                                </div>
                                <div class="nexus-widget-header-right">
                                    <div class="nexus-widget-blueprint-badge">
                                        <span class="nexus-blueprint-dot"></span>
                                        <span>BUILDING</span>
                                    </div>
                                </div>
                            </div>
                            <div class="nexus-widget-blueprint-body">
                                <div class="nexus-blueprint-scanline"></div>
                                <div class="nexus-blueprint-terminal">
                                    <span class="nexus-blueprint-prompt">&gt; compiling sandbox runtime</span>
                                    <span class="nexus-blueprint-cursor">_</span>
                                </div>
                            </div>
                        </div>`;
                    }
                    if (typeof WidgetRunner !== 'undefined') {
                        return WidgetRunner.renderWidgetCard(token.body, token.height, token.title);
                    }
                    return `<div class="nexus-widget-placeholder">[Interactive Widget: ${safeTitle}]</div>`;
                }
            },

            // 5b. <Widget> (Built-in Native Widgets: Timer, Pomodoro, Stopwatch, etc.)
            {
                name: 'builtinWidget',
                level: 'block',
                start(src) { return src.indexOf('<Widget'); },
                tokenizer(src) {
                    const completeMatch = src.match(/^\s*<Widget([^>]*?)(?:\s*\/>|>([\s\S]*?)<\/Widget>)/i);
                    if (completeMatch) {
                        const attrsString = completeMatch[1] || '';
                        const props = {};
                        const attrRegex = /(\w[\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
                        let attrMatch;
                        while ((attrMatch = attrRegex.exec(attrsString)) !== null) {
                            props[attrMatch[1]] = attrMatch[2] !== undefined ? attrMatch[2] : attrMatch[3];
                        }
                        const name = (props.name || 'widget').toLowerCase();
                        return {
                            type: 'builtinWidget',
                            raw: completeMatch[0],
                            name,
                            props,
                            isComplete: true
                        };
                    }
                    // Shielding: Hide incomplete raw XML during streaming
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

            // 6. <Carousel> & <Image> (Image Gallery Slider)
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
                    const imgRegex = /<Image\s+(?:src="([^"]*)")?(?:\s+query="([^"]*)")?(?:\s+alt="([^"]*)")?(?:\s+caption="([^"]*)")?\s*\/?>/gi;
                    let itemsHtml = '';
                    let dotsHtml = '';
                    let count = 0;
                    let match;
                    while ((match = imgRegex.exec(token.body)) !== null) {
                        const rawSrc = match[1] || '';
                        const query = match[2] || '';
                        const alt = (match[3] || 'Image').replace(/"/g, '&quot;');
                        const caption = match[4] || '';

                        let finalSrc = rawSrc;
                        if (!finalSrc && query) {
                            finalSrc = `image-search://${encodeURIComponent(query)}`;
                        }

                        const isDynamic = finalSrc.startsWith('image-search://');
                        const imgTag = isDynamic
                            ? `<img class="nexus-dynamic-image" data-query="${finalSrc.replace('image-search://', '')}" alt="${alt}" loading="lazy" />`
                            : `<img src="${finalSrc}" alt="${alt}" loading="lazy" />`;

                        const captionHtml = caption ? `<div class="nexus-carousel-caption">${caption}</div>` : '';
                        itemsHtml += `<div class="nexus-carousel-item"><div class="nexus-carousel-img-wrap">${imgTag}</div>${captionHtml}</div>`;
                        dotsHtml += `<span class="nexus-carousel-dot ${count === 0 ? 'is-active' : ''}" data-index="${count}"></span>`;
                        count++;
                    }

                    if (count === 0) return '';

                    return `<div class="nexus-carousel-container">
            <button type="button" class="nexus-carousel-nav nexus-carousel-prev" aria-label="Previous image">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </button>
            <div class="nexus-carousel-track">${itemsHtml}</div>
            <button type="button" class="nexus-carousel-nav nexus-carousel-next" aria-label="Next image">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </button>
            <div class="nexus-carousel-dots">${dotsHtml}</div>
          </div>`;
                }
            },

            // 7. <WritingBlock> & <Option> (Drafting & Writing Artifacts with Multi-Options)
            {
                name: 'writingBlock',
                level: 'block',
                start(src) { return src.search(/<WritingBlock/i); },
                tokenizer(src) {
                    const completeMatch = src.match(/^\s*<WritingBlock([^>]*)>([\s\S]*?)<\/WritingBlock>/i);
                    if (completeMatch) {
                        const attrs = completeMatch[1] || '';
                        const variantMatch = attrs.match(/\bvariant="([^"]*)"/i);
                        const titleMatch = attrs.match(/\btitle="([^"]*)"/i);
                        return {
                            type: 'writingBlock',
                            raw: completeMatch[0],
                            variant: (variantMatch ? variantMatch[1] : 'document').toLowerCase(),
                            title: titleMatch ? titleMatch[1] : 'Draft',
                            body: completeMatch[2] || '',
                            isComplete: true
                        };
                    }
                    const partialMatch = src.match(/^\s*<WritingBlock([^>]*)>([\s\S]*)$/i);
                    if (partialMatch) {
                        const attrs = partialMatch[1] || '';
                        const variantMatch = attrs.match(/\bvariant="([^"]*)"/i);
                        const titleMatch = attrs.match(/\btitle="([^"]*)"/i);
                        return {
                            type: 'writingBlock',
                            raw: partialMatch[0],
                            variant: (variantMatch ? variantMatch[1] : 'document').toLowerCase(),
                            title: titleMatch ? titleMatch[1] : 'Draft',
                            body: partialMatch[2] || '',
                            isComplete: false
                        };
                    }
                    const tagShieldMatch = src.match(/^\s*<WritingBlock[^>]*$/i);
                    if (tagShieldMatch) {
                        const attrs = tagShieldMatch[0] || '';
                        const variantMatch = attrs.match(/\bvariant="([^"]*)"/i);
                        const titleMatch = attrs.match(/\btitle="([^"]*)"/i);
                        return {
                            type: 'writingBlock',
                            raw: tagShieldMatch[0],
                            variant: (variantMatch ? variantMatch[1] : 'document').toLowerCase(),
                            title: titleMatch ? titleMatch[1] : 'Draft',
                            body: '',
                            isComplete: false
                        };
                    }
                },
                renderer(token) {
                    const safeTitle = (token.title || 'Draft')
                        .replace(/&/g, '&amp;')
                        .replace(/"/g, '&quot;')
                        .replace(/'/g, '&#39;')
                        .replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;');
                    const variant = token.variant || 'document';
                    
                    const variantMeta = {
                        email: { label: 'EMAIL', icon: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>' },
                        social_post: { label: 'SOCIAL POST', icon: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>' },
                        chat_message: { label: 'CHAT / DM', icon: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>' },
                        document: { label: 'DOCUMENT', icon: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>' }
                    }[variant] || { label: 'WRITING', icon: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>' };

                    const optionRegex = /<Option([^>]*)>([\s\S]*?)(?:<\/Option>|$)/gi;
                    const options = [];
                    let match;
                    while ((match = optionRegex.exec(token.body)) !== null) {
                        const optAttrs = match[1] || '';
                        let optBody = (match[2] || '').trim();
                        optBody = optBody.replace(/<Option[\s\S]*$/i, '').trim();

                        const optTitleMatch = optAttrs.match(/\btitle="([^"]*)"/i);
                        const optSubjMatch = optAttrs.match(/\bsubject="([^"]*)"/i);
                        options.push({
                            title: optTitleMatch ? optTitleMatch[1] : `Option ${options.length + 1}`,
                            subject: optSubjMatch ? optSubjMatch[1] : '',
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
                            options.map((opt, i) => `<button type="button" class="nexus-writing-tab ${i === 0 ? 'is-active' : ''}" data-opt-index="${i}"><span>${opt.title}</span></button>`).join('') +
                            `</div>`;
                    }

                    let panesHtml = '';
                    options.forEach((opt, i) => {
                        const parsedContent = opt.content ? marked.parse(opt.content) : '';
                        const subjectHtml = opt.subject ? `
                            <div class="nexus-writing-subject-row">
                                <span class="nexus-subject-label">Subject:</span>
                                <span class="nexus-subject-text">${opt.subject}</span>
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
                                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                    <span>Copy</span>
                                </button>
                                <button type="button" class="nexus-writing-action-btn nexus-writing-btn-canvas" title="Mở trong Canvas">
                                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>
                                    <span>Canvas</span>
                                </button>
                            </div>
                        </div>
                        <div class="nexus-writing-body">
                            ${panesHtml}
                        </div>
                    </div>`;
                }
            },

            // 8. <Comparison> & <Aspect> (Side-by-Side Multi-Dimensional Comparisons)
            {
                name: 'comparisonBlock',
                level: 'block',
                start(src) { return src.search(/<Comparison/i); },
                tokenizer(src) {
                    const completeMatch = src.match(/^\s*<Comparison([^>]*)>([\s\S]*?)<\/Comparison>/i);
                    if (completeMatch) {
                        const attrs = completeMatch[1] || '';
                        const titleMatch = attrs.match(/\btitle="([^"]*)"/i);
                        const leftMatch = attrs.match(/\b(?:leftName|left)="([^"]*)"/i);
                        const rightMatch = attrs.match(/\b(?:rightName|right)="([^"]*)"/i);
                        return {
                            type: 'comparisonBlock',
                            raw: completeMatch[0],
                            title: titleMatch ? titleMatch[1] : 'Comparison',
                            leftName: leftMatch ? leftMatch[1] : 'Option A',
                            rightName: rightMatch ? rightMatch[1] : 'Option B',
                            body: completeMatch[2] || '',
                            isComplete: true
                        };
                    }
                    const partialMatch = src.match(/^\s*<Comparison([^>]*)>([\s\S]*)$/i);
                    if (partialMatch) {
                        const attrs = partialMatch[1] || '';
                        const titleMatch = attrs.match(/\btitle="([^"]*)"/i);
                        const leftMatch = attrs.match(/\b(?:leftName|left)="([^"]*)"/i);
                        const rightMatch = attrs.match(/\b(?:rightName|right)="([^"]*)"/i);
                        return {
                            type: 'comparisonBlock',
                            raw: partialMatch[0],
                            title: titleMatch ? titleMatch[1] : 'Comparison',
                            leftName: leftMatch ? leftMatch[1] : 'Option A',
                            rightName: rightMatch ? rightMatch[1] : 'Option B',
                            body: partialMatch[2] || '',
                            isComplete: false
                        };
                    }
                    const tagShieldMatch = src.match(/^\s*<Comparison[^>]*$/i);
                    if (tagShieldMatch) {
                        const attrs = tagShieldMatch[0] || '';
                        const titleMatch = attrs.match(/\btitle="([^"]*)"/i);
                        const leftMatch = attrs.match(/\b(?:leftName|left)="([^"]*)"/i);
                        const rightMatch = attrs.match(/\b(?:rightName|right)="([^"]*)"/i);
                        return {
                            type: 'comparisonBlock',
                            raw: tagShieldMatch[0],
                            title: titleMatch ? titleMatch[1] : 'Comparison',
                            leftName: leftMatch ? leftMatch[1] : 'Option A',
                            rightName: rightMatch ? rightMatch[1] : 'Option B',
                            body: '',
                            isComplete: false
                        };
                    }
                },
                renderer(token) {
                    const safeTitle = (token.title || 'Comparison')
                        .replace(/&/g, '&amp;')
                        .replace(/"/g, '&quot;')
                        .replace(/'/g, '&#39;')
                        .replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;');
                    const safeLeft = (token.leftName || 'Option A')
                        .replace(/&/g, '&amp;')
                        .replace(/"/g, '&quot;')
                        .replace(/'/g, '&#39;');
                    const safeRight = (token.rightName || 'Option B')
                        .replace(/&/g, '&amp;')
                        .replace(/"/g, '&quot;')
                        .replace(/'/g, '&#39;');

                    const cleanBody = (token.body || '').replace(/<\/?Comparison\b[^>]*>/gi, '').trim();
                    const aspectRegex = /<Aspect\b((?:[^"'\/>]|"[^"]*"|'[^']*')*?)(?:\s*\/>|>([\s\S]*?)<\/Aspect>|>([\s\S]*?)(?=<Aspect\b|<\/Comparison>|$))/gi;
                    let rowsHtml = '';
                    let match;
                    while ((match = aspectRegex.exec(cleanBody)) !== null) {
                        const attrs = match[1] || '';
                        const nameMatch = attrs.match(/\b(?:name|label)="([^"]*)"/i);
                        const leftMatch = attrs.match(/\bleft="([^"]*)"/i);
                        const rightMatch = attrs.match(/\bright="([^"]*)"/i);
                        const winnerMatch = attrs.match(/\bwinner="([^"]*)"/i);
                        const leftWinnerMatch = attrs.match(/\bleftWinner="true"/i);
                        const rightWinnerMatch = attrs.match(/\brightWinner="true"/i);

                        const aspectName = nameMatch ? nameMatch[1] : 'Criteria';
                        let leftContent = leftMatch ? leftMatch[1] : '';
                        let rightContent = rightMatch ? rightMatch[1] : '';

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

                        let winner = (winnerMatch ? winnerMatch[1] : '').toLowerCase();
                        if (!winner) {
                            if (leftWinnerMatch) winner = 'left';
                            else if (rightWinnerMatch) winner = 'right';
                        }
                        const leftClass = winner === 'left' ? 'is-winner' : (winner === 'right' ? 'is-subdued' : '');
                        const rightClass = winner === 'right' ? 'is-winner' : (winner === 'left' ? 'is-subdued' : '');

                        rowsHtml += `
                        <div class="nexus-comparison-row">
                            <div class="nexus-aspect-label">${aspectName}</div>
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
                                <span class="nexus-comparison-icon">
                                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
                                </span>
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

            // 9. <Metrics> & <Metric> (Key Statistics, Complexity & Benchmark Grids)
            {
                name: 'metricsBlock',
                level: 'block',
                start(src) { return src.search(/<Metrics/i); },
                tokenizer(src) {
                    const completeMatch = src.match(/^\s*<Metrics([^>]*)>([\s\S]*?)<\/Metrics>/i);
                    if (completeMatch) {
                        const attrs = completeMatch[1] || '';
                        const titleMatch = attrs.match(/\btitle="([^"]*)"/i);
                        return {
                            type: 'metricsBlock',
                            raw: completeMatch[0],
                            title: titleMatch ? titleMatch[1] : 'Key Metrics',
                            body: completeMatch[2] || '',
                            isComplete: true
                        };
                    }
                    const partialMatch = src.match(/^\s*<Metrics([^>]*)>([\s\S]*)$/i);
                    if (partialMatch) {
                        const attrs = partialMatch[1] || '';
                        const titleMatch = attrs.match(/\btitle="([^"]*)"/i);
                        return {
                            type: 'metricsBlock',
                            raw: partialMatch[0],
                            title: titleMatch ? titleMatch[1] : 'Key Metrics',
                            body: partialMatch[2] || '',
                            isComplete: false
                        };
                    }
                    const tagShieldMatch = src.match(/^\s*<Metrics[^>]*$/i);
                    if (tagShieldMatch) {
                        const attrs = tagShieldMatch[0] || '';
                        const titleMatch = attrs.match(/\btitle="([^"]*)"/i);
                        return {
                            type: 'metricsBlock',
                            raw: tagShieldMatch[0],
                            title: titleMatch ? titleMatch[1] : 'Key Metrics',
                            body: '',
                            isComplete: false
                        };
                    }
                },
                renderer(token) {
                    const safeTitle = (token.title || 'Key Metrics')
                        .replace(/&/g, '&amp;')
                        .replace(/"/g, '&quot;')
                        .replace(/'/g, '&#39;')
                        .replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;');

                    const cleanBody = (token.body || '').replace(/<\/?Metrics\b[^>]*>/gi, '').trim();
                    const metricRegex = /<Metric\b((?:[^"'\/>]|"[^"]*"|'[^']*')*?)(?:\s*\/>|>([\s\S]*?)<\/Metric>|>([\s\S]*?)(?=<Metric\b|<\/Metrics>|$))/gi;
                    let itemsHtml = '';
                    let match;
                    while ((match = metricRegex.exec(cleanBody)) !== null) {
                        const attrs = match[1] || '';
                        const labelMatch = attrs.match(/\blabel="([^"]*)"/i);
                        const valueMatch = attrs.match(/\bvalue="([^"]*)"/i);
                        const statusMatch = attrs.match(/\bstatus="([^"]*)"/i);
                        const hintMatch = attrs.match(/\bhint="([^"]*)"/i);

                        const label = labelMatch ? labelMatch[1] : 'Metric';
                        let value = valueMatch ? valueMatch[1] : (match[2] || match[3] || '').trim();

                        if (!labelMatch && !valueMatch && !value && !hintMatch) continue;

                        // Format math symbols & superscripts cleanly
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
                        
                        const status = (statusMatch ? statusMatch[1] : 'neutral').toLowerCase();
                        const hint = hintMatch ? `<div class="nexus-metric-hint">${hintMatch[1]}</div>` : '';

                        itemsHtml += `
                        <div class="nexus-metric-card" data-status="${status}">
                            <div class="nexus-metric-label">${label}</div>
                            <div class="nexus-metric-value">${value}</div>
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

            // 10. <BentoGrid> & <BentoItem> (Asymmetric Bento Box Feature Layouts)
            {
                name: 'bentoGridBlock',
                level: 'block',
                start(src) { return src.search(/<BentoGrid/i); },
                tokenizer(src) {
                    const completeMatch = src.match(/^\s*<BentoGrid([^>]*)>([\s\S]*?)<\/BentoGrid>/i);
                    if (completeMatch) {
                        const attrs = completeMatch[1] || '';
                        const titleMatch = attrs.match(/\btitle="([^"]*)"/i);
                        return {
                            type: 'bentoGridBlock',
                            raw: completeMatch[0],
                            title: titleMatch ? titleMatch[1] : '',
                            body: completeMatch[2] || '',
                            isComplete: true
                        };
                    }
                    const partialMatch = src.match(/^\s*<BentoGrid([^>]*)>([\s\S]*)$/i);
                    if (partialMatch) {
                        const attrs = partialMatch[1] || '';
                        const titleMatch = attrs.match(/\btitle="([^"]*)"/i);
                        return {
                            type: 'bentoGridBlock',
                            raw: partialMatch[0],
                            title: titleMatch ? titleMatch[1] : '',
                            body: partialMatch[2] || '',
                            isComplete: false
                        };
                    }
                    const tagShieldMatch = src.match(/^\s*<BentoGrid[^>]*$/i);
                    if (tagShieldMatch) {
                        const attrs = tagShieldMatch[0] || '';
                        const titleMatch = attrs.match(/\btitle="([^"]*)"/i);
                        return {
                            type: 'bentoGridBlock',
                            raw: tagShieldMatch[0],
                            title: titleMatch ? titleMatch[1] : '',
                            body: '',
                            isComplete: false
                        };
                    }
                },
                renderer(token) {
                    const safeTitle = token.title ? token.title
                        .replace(/&/g, '&amp;')
                        .replace(/"/g, '&quot;')
                        .replace(/'/g, '&#39;')
                        .replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;') : '';

                    const getBentoIconSvg = (name) => {
                        switch ((name || '').toLowerCase()) {
                            case 'sparkles':
                            case 'star':
                                return '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"></path></svg>';
                            case 'zap':
                            case 'lightning':
                            case 'fast':
                                return '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>';
                            case 'shield':
                            case 'security':
                            case 'lock':
                                return '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>';
                            case 'layers':
                            case 'architecture':
                            case 'stack':
                                return '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>';
                            case 'cpu':
                            case 'engine':
                            case 'chip':
                                return '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"></rect><rect x="9" y="9" width="6" height="6"></rect><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3"></path></svg>';
                            case 'code':
                            case 'terminal':
                            case 'dev':
                                return '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>';
                            case 'rocket':
                            case 'launch':
                                return '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"></path><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"></path></svg>';
                            case 'chart':
                            case 'analytics':
                            case 'trending':
                                return '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>';
                            case 'globe':
                            case 'cloud':
                            case 'web':
                                return '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>';
                            default:
                                return '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>';
                        }
                    };

                    const cleanBody = (token.body || '').replace(/<\/?BentoGrid\b[^>]*>/gi, '').trim();
                    const bentoRegex = /<BentoItem\b((?:[^"'\/>]|"[^"]*"|'[^']*')*?)(?:\s*\/>|>([\s\S]*?)<\/BentoItem>|>([\s\S]*?)(?=<BentoItem\b|<\/BentoGrid>|$))/gi;
                    const items = [];
                    let match;
                    while ((match = bentoRegex.exec(cleanBody)) !== null) {
                        const attrs = match[1] || '';
                        const titleMatch = attrs.match(/\btitle="([^"]*)"/i);
                        const spanMatch = attrs.match(/\bspan="([^"]*)"/i);
                        const tagMatch = attrs.match(/\btag="([^"]*)"/i);
                        const iconMatch = attrs.match(/\bicon="([^"]*)"/i);

                        const itemTitle = titleMatch ? titleMatch[1] : 'Feature';
                        const requestedSpan = spanMatch && spanMatch[1] === '2' ? 2 : 1;
                        const rawContent = (match[2] || match[3] || '').trim();

                        items.push({
                            title: itemTitle,
                            span: requestedSpan,
                            tag: tagMatch ? tagMatch[1] : '',
                            icon: iconMatch ? iconMatch[1] : '',
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
                        const tagHtml = it.tag ? `<span class="nexus-bento-tag">${it.tag}</span>` : '';
                        const iconSvg = getBentoIconSvg(it.icon);
                        const parsedContent = it.content ? marked.parse(it.content) : '';

                        itemsHtml += `
                        <div class="nexus-bento-item span-${it.span}">
                            <div class="nexus-bento-item-header">
                                <div class="nexus-bento-item-icon">${iconSvg}</div>
                                ${tagHtml}
                            </div>
                            <div class="nexus-bento-item-title">${it.title}</div>
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

if (typeof marked !== 'undefined') {
    initLmdxComponentsParser();
}
