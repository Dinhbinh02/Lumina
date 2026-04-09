/**
 * Lumina - Shared Chat UI Library
 * Used by both content.js (Popup) and spotlight.js (Lumina Chat Window)
 * Provides unified UI rendering for chat interfaces.
 */

const LuminaSharedChatUI = (typeof window !== 'undefined' && window.LuminaChatUI)
    ? window.LuminaChatUI
    : null;

class LuminaChatUI {
    constructor(container, options = {}) {
        this.container = container;
        this.options = {
            isSpotlight: options.isSpotlight || false,
            onSubmit: options.onSubmit || null,
            ...options
        };

        // DOM References
        this.historyEl = container.querySelector('.lumina-chat-history') ||
            container.querySelector('.lumina-chat-scroll-content');
        // Input may be outside container (e.g., Spotlight layout with separated input-area)
        this.inputEl = container.querySelector('.lumina-chat-input') ||
            document.querySelector('.lumina-chat-input') ||
            document.querySelector('#chat-input');
        this.imagePreviewEl = container.querySelector('.lumina-image-preview-container') ||
            container.querySelector('#image-preview') ||
            document.querySelector('.lumina-image-preview-container');
        this.fileInputEl = container.querySelector('input[type="file"]') ||
            container.querySelector('#file-input') ||
            document.querySelector('#file-input');

        // State
        this.currentEntryDiv = null;
        this.loadingDiv = null;
        this.searchingDiv = null;
        this.currentAnswerDiv = null;
        this.disableAutoScroll = false;
        this.disableStreamAutoFollow = true;
        this.attachedFiles = []; // Array of { mimeType, data, name, isImage, previewUrl }
        this.selectedImages = []; // Backward compatibility
        // In Spotlight split mode, set this to the pane's input-area element so
        // showStopButton/hideStopButton find the correct #lumina-regenerate-btn.
        this.inputPaneEl = null;
        this.webSearchSources = [];
        this._lastActiveEntry = null; // Track the single active entry with min-height

        // Initialize
        if (this.inputEl && !this.options.skipInputSetup) {
            this.setupInputBar();
            this._setupMentions();
        }

        // Memory Management State (Stop idle iframes to save RAM)
        this.memoryTimers = new Map(); // container -> timeoutId
        this._setupMemoryManager();

        // Fix for Mac trackpad / mousewheel "jerk" over iframes (e.g. Google AI)
        // Uses delegation on container to handle dynamic history elements
        if (this.container) {
            let scrollingTimeout = null;
            this.container.addEventListener('wheel', (e) => {
                let target = e.target;
                while (target && target !== this.container) {
                    if (target.classList.contains('lumina-chat-scroll-content') ||
                        target.classList.contains('lumina-chat-history')) {

                        if (scrollingTimeout) clearTimeout(scrollingTimeout);
                        if (!target.classList.contains('lumina-is-scrolling')) {
                            target.classList.add('lumina-is-scrolling');
                        }
                        scrollingTimeout = setTimeout(() => {
                            target.classList.remove('lumina-is-scrolling');
                            scrollingTimeout = null;
                        }, 200);
                        break;
                    }
                    target = target.parentElement;
                }
            }, { passive: true });
        }

        this._setupAutoScrollGuard();
    }

    /**
     * Initialize IntersectionObserver for smart iframe loading/unloading
     */
    _setupMemoryManager() {
        this.memoryObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const container = entry.target;
                const iframe = container.querySelector('iframe');
                if (!iframe) return;

                if (entry.isIntersecting) {
                    // WAKE UP / LOAD
                    if (this.memoryTimers.has(container)) {
                        clearTimeout(this.memoryTimers.get(container));
                        this.memoryTimers.delete(container);
                    }

                    if (container.classList.contains('is-lazy-unloaded') ||
                        container.classList.contains('is-hibernating') ||
                        container.classList.contains('is-lazily-unloaded')) {

                        const savedSrc = container.dataset.savedSrc || container.dataset.lazySrc || container.dataset.sourceUrl;
                        if (savedSrc && savedSrc !== 'about:blank') {
                            container.classList.add('is-loading');
                            iframe.src = savedSrc;
                            // Clean up all possible state classes
                            container.classList.remove('is-lazy-unloaded', 'is-hibernating', 'is-lazily-unloaded');
                        }
                    }
                } else {
                    // STOP / UNLOAD (if out of view for 30 seconds)
                    if (!container.classList.contains('is-lazy-unloaded') && !this.memoryTimers.has(container)) {
                        const timerId = setTimeout(() => {
                            const currentSrc = iframe.src || container.dataset.sourceUrl;
                            if (currentSrc && currentSrc !== 'about:blank') {
                                container.dataset.savedSrc = currentSrc;
                                iframe.src = 'about:blank';
                                container.classList.add('is-lazy-unloaded');
                            }
                            this.memoryTimers.delete(container);
                        }, 30000); // 30 seconds idle delay
                        this.memoryTimers.set(container, timerId);
                    }
                }
            });
            // Memory Management: Load when near, unload when far
        }, {
            rootMargin: '200px' // Start loading 200px before it enters view
        });
    }

    /**
     * Helper to get the correct scroll container for the chat history
     */
    getScrollContainer() {
        if (!this.historyEl) return null;
        let scrollContainer = this.historyEl;
        // In Popup mode, historyEl might be visible while parent is the actual scrollable element
        if (window.getComputedStyle(scrollContainer).overflowY === 'visible' && scrollContainer.parentElement) {
            scrollContainer = scrollContainer.parentElement;
        }
        return scrollContainer;
    }

    _scheduleLowPriority(task, timeout = 300) {
        if (typeof task !== 'function') return;
        if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
            window.requestIdleCallback(() => task(), { timeout });
            return;
        }
        setTimeout(task, 24);
    }

    _isNearBottom(threshold = 120) {
        const scrollContainer = this.getScrollContainer();
        if (!scrollContainer) return false;
        const distanceToBottom = scrollContainer.scrollHeight - scrollContainer.scrollTop - scrollContainer.clientHeight;
        return distanceToBottom < threshold;
    }

    _snapToBottomIfNeeded(shouldSnap) {
        if (!shouldSnap) return;
        const scrollContainer = this.getScrollContainer();
        if (!scrollContainer) return;
        const targetScrollTop = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);
        if (targetScrollTop > scrollContainer.scrollTop) {
            scrollContainer.scrollTop = targetScrollTop;
        }
    }

    _setupAutoScrollGuard() {
        const bind = () => {
            const scrollContainer = this.getScrollContainer();
            if (!scrollContainer) return;
            if (this._autoScrollGuardContainer === scrollContainer) return;

            if (this._autoScrollGuardContainer && this._autoScrollGuardHandler) {
                this._autoScrollGuardContainer.removeEventListener('scroll', this._autoScrollGuardHandler);
            }

            this._autoScrollGuardContainer = scrollContainer;
            this._autoScrollGuardHandler = () => {
                if (this._suspendAutoScrollGuard) return;
                this.disableAutoScroll = !this._isNearBottom(72);
            };

            scrollContainer.addEventListener('scroll', this._autoScrollGuardHandler, { passive: true });
            this._autoScrollGuardHandler();
        };

        bind();
        requestAnimationFrame(bind);
    }

    /**
     * Append a question to the chat history
     * @param {string} text - Question text
     * @param {string[]} images - Array of data URLs for attached images
     * @param {Object} options - Additional options
     */
    appendQuestion(text, images = [], options = {}) {
        const { entryType = 'qa', editable = false, skipMargin = false } = options;
        const visibleImages = Array.isArray(images)
            ? images.filter((item) => {
                if (typeof item === 'string') return true;
                if (!item || typeof item !== 'object') return false;
                return !item.hiddenInPreview && !item.parentAttachmentId;
            })
            : [];
        const sharedHelpers = LuminaSharedChatUI && typeof LuminaSharedChatUI.getFileTypeLabel === 'function'
            ? LuminaSharedChatUI
            : null;
        const getFileTypeLabel = (item) => sharedHelpers
            ? sharedHelpers.getFileTypeLabel(item)
            : ((String(item?.mimeType || '').split('/')[1] || 'FILE').toUpperCase());
        const getFileCategory = (item) => sharedHelpers
            ? sharedHelpers.inferFileCategory(item)
            : ((String(item?.mimeType || '').startsWith('audio/') ? 'audio' : (String(item?.mimeType || '').startsWith('video/') ? 'video' : 'file')));
        const getFileIcon = (category) => sharedHelpers
            ? sharedHelpers.getFileIconByCategory(category)
            : '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>';
        const getDisplayName = (fileName) => sharedHelpers
            ? sharedHelpers.getDisplayFileName(fileName)
            : String(fileName || 'File').replace(/\.[^.]+$/, '');
        // Create entry container
        this.currentEntryDiv = document.createElement('div');
        this.currentEntryDiv.className = 'lumina-dict-entry lumina-fade-in';
        this.currentEntryDiv.dataset.entryType = entryType;

        // Create question div
        const questionDiv = document.createElement('div');
        questionDiv.className = `lumina-chat-question ${entryType}-question`;
        questionDiv.dataset.entryType = entryType;

        // Add images if any
        if (visibleImages.length > 0) {
            const filesDiv = document.createElement('div');
            filesDiv.className = 'lumina-chat-question-files';
            visibleImages.forEach(item => {
                if (typeof item === 'object') {
                    const isImage = item.isImage || (item.mimeType && item.mimeType.startsWith('image/'));
                    const rawSrc = item.dataUrl || item.previewUrl || (item.mimeType && item.data ? `data:${item.mimeType};base64,${item.data}` : '');
                    const src = isImage ? this._resolveImagePreviewSrc(item, rawSrc) : rawSrc;
                    if (isImage) {
                        const img = document.createElement('img');
                        img.src = src;
                        if (item.name) img.alt = item.name;
                        filesDiv.appendChild(img);
                    } else {
                        const fileName = item.name || 'File';
                        const displayName = getDisplayName(fileName);
                        const category = getFileCategory(item);
                        const icon = getFileIcon(category);
                        const typeLabel = getFileTypeLabel(item);

                        const fileChip = document.createElement('div');
                        fileChip.className = 'lumina-image-preview-item is-file lumina-question-file-chip';
                        fileChip.innerHTML = `<div class="lumina-file-preview-info"><span class="lumina-file-name">${this.escapeHTMLAttr(displayName || fileName)}</span><div class="lumina-file-meta-row"><span class="lumina-file-icon-inline file-${category}">${icon}</span><span class="lumina-file-size-tag">${this.escapeHTMLAttr(typeLabel)}</span></div></div>`;
                        filesDiv.appendChild(fileChip);
                    }
                } else if (typeof item === 'string') {
                    const src = this._resolveImagePreviewSrc(null, item);
                    const img = document.createElement('img');
                    img.src = src;
                    filesDiv.appendChild(img);
                }
            });
            questionDiv.appendChild(filesDiv);

            // Keep full media payload off HTML attributes to avoid giant data-* strings.
            questionDiv._luminaImages = visibleImages;
            this.currentEntryDiv._luminaImages = visibleImages;
            questionDiv.dataset.images = JSON.stringify({
                compact: true,
                count: visibleImages.length,
                files: visibleImages.map((item, index) => {
                    if (typeof item === 'string') {
                        return {
                            name: `Image ${index + 1}`,
                            mimeType: 'image/*',
                            isImage: true,
                            dataLength: item.length
                        };
                    }
                    return {
                        name: item?.name || `File ${index + 1}`,
                        mimeType: item?.mimeType || '',
                        isImage: !!item?.isImage || (item?.mimeType || '').startsWith('image/'),
                        dataLength: (item?.dataUrl || item?.data || '').length
                    };
                })
            });
        }

        // Add text
        if (text) {
            const displayText = options.displayText || text;
            
            // Clean up internal placeholders like $Container but leave quoted selection as is
            let cleanText = displayText
                .replace(/[("'\[]*\$Container[)"'\]]*/gi, '') // Remove container marker
                .replace(/\$ContextTag/gi, '')               // Remove special tags if any
                .replace(/^SelectedText:\s*"[\s\S]*?"(?:\n\n|$)/, '') // Remove legacy prefix
                .trim();

            if (cleanText === '' && text.includes('"')) {
                // If it was JUST a selection-based question with no additional query
                cleanText = text.trim();
            }

            // Store RAW text for fast serialization
            questionDiv.dataset.rawText = text;
            this.currentEntryDiv.dataset.timestamp = String(Date.now());

            const safeText = cleanText
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/\n/g, '<br>');

            if (editable) {
                const editableDiv = document.createElement('div');
                editableDiv.setAttribute('contenteditable', 'true');
                editableDiv.innerHTML = safeText;
                questionDiv.appendChild(editableDiv);
            } else {
                const textSpan = document.createElement('span');
                textSpan.innerHTML = safeText;
                questionDiv.appendChild(textSpan);
            }
        }

        // Capture current scroll position BEFORE appending to history
        // This is crucial to prevent browser-driven "jumps" when new content is added
        const scrollContainer = this.getScrollContainer();
        const preAppendScroll = scrollContainer ? scrollContainer.scrollTop : 0;

        this.currentEntryDiv.appendChild(questionDiv);

        // Add separator at the end
        const separator = document.createElement('div');
        separator.className = 'lumina-dict-separator';
        this.currentEntryDiv.appendChild(separator);

        this.historyEl.appendChild(this.currentEntryDiv);

        // Apply initial margin and scroll behavior (unless skipping)
        if (!skipMargin) {
            this.disableAutoScroll = false;
            requestAnimationFrame(() => {
                this.setInitialEntryHeight(this.currentEntryDiv, true, preAppendScroll);
            });
        } else {
            // Even when skipping scroll/animation (e.g. duplicate tab sharing session),
            // synchronously clear old margins so they don't accumulate across messages.
            this.clearEntryMargins(this.currentEntryDiv);
        }

        return questionDiv;
    }

    /**
     * Create an answer div inside the current entry
     * @returns {HTMLElement} The answer div
     */
    createAnswerDiv() {
        // Smart Handling for Versioned Entries (Regenerate flow)
        if (this.currentEntryDiv) {
            const activeVersion = this.currentEntryDiv.querySelector('.lumina-answer-version.active');
            if (activeVersion) {
                // If we are in a versioned entry, always output to the active version container
                // instead of appending a new answer block at the end of the entry.
                let innerDiv = activeVersion.querySelector('.lumina-chat-answer');
                if (!innerDiv) {
                    innerDiv = document.createElement('div');
                    innerDiv.className = 'lumina-chat-answer lumina-fade-in';
                    activeVersion.appendChild(innerDiv);
                }
                return innerDiv;
            }
        }

        const div = document.createElement('div');
        div.className = 'lumina-chat-answer lumina-fade-in';

        // Make proofread answers editable
        if (this.currentEntryDiv && this.currentEntryDiv.dataset.entryType === 'proofread') {
            div.contentEditable = 'true';
            div.spellcheck = false;
            div.style.outline = 'none';
            div.style.borderRadius = '8px';
            div.style.backgroundColor = 'var(--lumina-bg-secondary)';
            div.classList.add('lumina-proofread-editable');
        }

        if (this.currentEntryDiv) {
            const existingAnswer = this.currentEntryDiv.querySelector('.lumina-chat-answer');
            const existingSep = this.currentEntryDiv.querySelector(':scope > .lumina-dict-separator');

            if (existingAnswer) {
                this.currentEntryDiv.insertBefore(div, existingAnswer.nextSibling);
            } else if (existingSep) {
                this.currentEntryDiv.insertBefore(div, existingSep);
            } else {
                this.currentEntryDiv.appendChild(div);
            }
        } else {
            // Fallback: create new entry
            this.currentEntryDiv = document.createElement('div');
            this.currentEntryDiv.className = 'lumina-dict-entry';
            this.currentEntryDiv.appendChild(div);
            this.historyEl.appendChild(this.currentEntryDiv);
        }

        this.currentAnswerDiv = div;
        if (!this.disableStreamAutoFollow) {
            this.scrollToBottom();
        }
        return div;
    }

    /**
     * Append a chunk of text to the current answer
     * @param {string} chunk - The text chunk to append
     * @param {boolean} skipScroll - If true, skip auto-scrolling
     */
    appendChunk(chunk, skipScroll = false) {
        // Always try to remove loading indicator when receiving data
        this.removeSearching();
        this.removeLoading();

        if (!this.currentAnswerDiv) {
            this.currentAnswerDiv = this.createAnswerDiv();
        }

        // Accumulate raw text
        const currentText = this.currentAnswerDiv.getAttribute('data-raw-text') || '';
        const newText = currentText + chunk;
        this.currentAnswerDiv.setAttribute('data-raw-text', newText);

        let answerContentDiv = this.currentAnswerDiv.querySelector('.lumina-answer-content');
        if (!answerContentDiv) {
            answerContentDiv = document.createElement('div');
            answerContentDiv.className = 'lumina-answer-content';
            this.currentAnswerDiv.appendChild(answerContentDiv);
            answerContentDiv.__isRich = false;
        }

        // --- Render Strategy ---
        // For the very beginning of the response, we render immediately to avoid seeing raw markdown symbols.
        if (!answerContentDiv.__isRich) {
            if (newText.length < 200 && typeof marked !== 'undefined') {
                let fastText = newText.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '');
                answerContentDiv.innerHTML = marked.parse(fastText) || '...';
                // Note: we don't set __isRich = true here yet so the throttled path still runs to handle thinking container/sources
            } else {
                // Background fast-path for larger text (safeguard)
                if (newText.length < 1000) {
                    let fastText = newText.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '');
                    answerContentDiv.textContent = fastText || '...';
                } else {
                    answerContentDiv.textContent = newText.substring(0, 1000) + "...";
                }
            }
        }

        // --- Slow path: full markdown render, throttled to 80ms ---
        // Heavy (marked.parse + innerHTML) — runs infrequently enough to stay smooth.
        if (!this._renderPending) {
            this._renderPending = true;
            setTimeout(() => {
                this._renderPending = false;
                if (this.currentAnswerDiv) {
                    this._doRender(this.currentAnswerDiv, skipScroll);
                }
            }, 80);
        }
    }

    /**
     * Internal: render the accumulated text into the answer div.
     * Called at most every 60ms during streaming, and once more on finishAnswer.
     */
    _doRender(answerDiv, skipScroll = false) {
        let actualAnswer = '';
        let thinkingContent = '';
        let isThinkingComplete = false;

        const scrollContainer = this.getScrollContainer();
        const preserveScrollTop = (!skipScroll && this.disableAutoScroll && scrollContainer)
            ? scrollContainer.scrollTop
            : null;

        const newText = answerDiv.getAttribute('data-raw-text') || '';
        if (answerDiv.__lastRenderedText === newText) return;
        answerDiv.__lastRenderedText = newText;

        // Filter out tool call JSON and other noise in one pass via array join if multiple patterns needed
        let displayText = newText.replace(/\{"tool"\s*:\s*"search_web"\s*,\s*"args"\s*:\s*\{[^}]+\}\s*\}/g, '');

        // For proofread entries, strip <think>…</think> entirely — never show Model Thoughts
        const isProofreadAnswer = answerDiv.classList.contains('lumina-proofread-editable');
        if (isProofreadAnswer) {
            displayText = displayText.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').trim();
            // Also remove any already-created thinking container (e.g. created before entryType was set)
            const existing = answerDiv.querySelector('.lumina-thinking-container');
            if (existing) existing.remove();
        }

        // Filter out "Sources" block if we are handling them manually
        if (this.webSearchSources && this.webSearchSources.length > 0) {
            displayText = displayText.replace(/\n\s*(?:Sources|Citations|References)\s*(?::)?\s*\n[\s\S]*$/i, '');
        }

        // Performance note: avoid yielding during streaming render (60ms interval)
        // because it causes visual flickering and state out-of-sync.

        const thinkMatch = displayText.match(/<think>([\s\S]*?)(?:<\/think>|$)/i);

        if (thinkMatch) {
            thinkingContent = thinkMatch[1].trim();
            isThinkingComplete = displayText.includes('</think>');

            // Remove thinking section from actual answer
            actualAnswer = displayText.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').trim();

            // EDGE CASE: If model returns ALL content in reasoning field with no separate answer,
            // use thinking content as the actual answer (don't show thinking container)
            if (!actualAnswer && thinkingContent && isThinkingComplete) {
                actualAnswer = thinkingContent;
                thinkingContent = '';

                const existingThinkingContainer = answerDiv.querySelector('.lumina-thinking-container');
                if (existingThinkingContainer) {
                    existingThinkingContainer.remove();
                }
            }

            if (thinkingContent) {
                let thinkingContainer = answerDiv.querySelector('.lumina-thinking-container');
                if (!thinkingContainer) {
                    thinkingContainer = document.createElement('div');
                    thinkingContainer.className = 'lumina-thinking-container thinking collapsed';
                    thinkingContainer.innerHTML = `
                        <div class="lumina-thinking-header">
                            <div class="lumina-thinking-icon">
                                <svg viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg>
                            </div>
                            <span class="lumina-thinking-label">Model Thoughts</span>
                        </div>
                        <div class="lumina-thinking-content"></div>
                    `;
                    // Direct listener — event delegation on `document` doesn't work inside Shadow DOM
                    thinkingContainer.querySelector('.lumina-thinking-header').addEventListener('click', () => {
                        thinkingContainer.classList.toggle('collapsed');
                    });
                    answerDiv.insertBefore(thinkingContainer, answerDiv.firstChild);

                    setTimeout(() => {
                        thinkingContainer.classList.add('appeared');
                    }, 350);
                }

                const thinkingContentDiv = thinkingContainer.querySelector('.lumina-thinking-content');
                thinkingContentDiv.textContent = thinkingContent;

                if (isThinkingComplete) {
                    thinkingContainer.classList.remove('thinking');
                }
            }
        } else {
            actualAnswer = displayText.trim();
        }

        // isThinkingComplete is handled above within the thinkMatch block for precise removal of the .thinking class
        if (thinkMatch) {
            isThinkingComplete = displayText.includes('</think>');
        }

        // Get or create content container
        let answerContentDiv = answerDiv.querySelector('.lumina-answer-content');
        if (!answerContentDiv) {
            answerContentDiv = document.createElement('div');
            answerContentDiv.className = 'lumina-answer-content';
            answerDiv.appendChild(answerContentDiv);
        }

        // Render markdown (during streaming: skip hljs/KaTeX/copyButtons — done in finishAnswer)
        if (actualAnswer.trim().startsWith('<')) {
            answerContentDiv.innerHTML = actualAnswer;
        } else if (typeof marked !== 'undefined') {
            // Add spacing between letters and numbers for better CJK/Latin readability
            let content = actualAnswer.replace(/([a-zà-ỹ])(\d)/g, '$1 $2').replace(/(\d)([a-zà-ỹ])/g, '$1 $2');

            // Process Markdown
            let htmlContent = marked.parse(content);

            // Convert [1], [2], etc. to citation badges
            if (this.webSearchSources.length > 0) {
                htmlContent = htmlContent.replace(/\[(\d+)\]/g, (match, num) => {
                    const sourceIndex = parseInt(num) - 1;
                    const source = this.webSearchSources[sourceIndex];
                    if (source) {
                        return `<a href="${source.link}" target="_blank" rel="noopener noreferrer" class="lumina-citation">${num}</a>`;
                    }
                    return match;
                });
            }

            answerContentDiv.innerHTML = htmlContent;
            answerContentDiv.__isRich = true;
        } else {
            answerContentDiv.textContent = actualAnswer;
            answerContentDiv.__isRich = false;
        }

        // NOTE: hljs, KaTeX, injectCopyButtons, and link targeting are intentionally skipped during streaming.
        // They run once in finishAnswer() via processContainer() for correctness + performance.

        // Smart Auto-Scroll: throttled — at most every 100ms
        // scrollToBottom() handles the near-bottom check internally, no need to re-read layout properties here.
        if (!skipScroll && !this.disableStreamAutoFollow && !this._scrollThrottled) {
            this._scrollThrottled = true;
            setTimeout(() => { this._scrollThrottled = false; }, 100);
            this.scrollToBottom();
        }

        if (preserveScrollTop !== null && scrollContainer) {
            scrollContainer.scrollTop = preserveScrollTop;
        }
    }

    /**
     * Finish the current answer (add sources, etc.)
     * @param {boolean} skipMargin - If true, skip margin adjustment (used when restoring history)
     * @param {boolean} skipScroll - If true, skip auto-scrolling
     */
    finishAnswer(skipMargin = false, skipScroll = false) {
        // Cancel any pending throttled render
        this._renderPending = false;
        this._scrollThrottled = false;

        const answerDivSnapshot = this.currentAnswerDiv;
        const sourcesSnapshot = Array.isArray(this.webSearchSources) ? [...this.webSearchSources] : [];
        const rawText = answerDivSnapshot ? (answerDivSnapshot.getAttribute('data-raw-text') || '') : '';
        const isProofreadEntry = this.currentEntryDiv?.dataset?.entryType === 'proofread';
        const shouldStickBottom = !this.disableStreamAutoFollow && !skipScroll && this._isNearBottom();

        // Run a final full render to ensure the last chunk is shown correctly
        if (answerDivSnapshot) {
            this._scheduleLowPriority(async () => {
                if (!answerDivSnapshot.isConnected) return;

                const previousSources = this.webSearchSources;
                this.webSearchSources = sourcesSnapshot;

                try {
                    if (rawText.trim()) {
                        this._doRender(answerDivSnapshot, true);
                    }

                    if (sourcesSnapshot.length > 0) {
                        // Store metadata for fast O(1) serialization later
                        answerDivSnapshot.dataset.webSearch = JSON.stringify({
                            sourcesCount: sourcesSnapshot.length
                        });

                        if (!answerDivSnapshot.querySelector('.lumina-sources')) {
                            const sourcesDiv = document.createElement('div');
                            sourcesDiv.className = 'lumina-sources';
                            sourcesDiv.innerHTML = `
                                <div class="lumina-sources-title">Sources</div>
                                <div class="lumina-sources-list">
                                    ${sourcesSnapshot.map((source, idx) => `
                                        <a href="${source.link}" target="_blank" rel="noopener noreferrer" class="lumina-source-item">
                                            <span class="lumina-source-num">${idx + 1}</span>
                                            <div class="lumina-source-info">
                                                <div class="lumina-source-name">${source.title || 'Source'}</div>
                                                <div class="lumina-source-domain">${source.displayLink || new URL(source.link).hostname}</div>
                                            </div>
                                        </a>
                                    `).join('')}
                                </div>
                            `;
                            answerDivSnapshot.appendChild(sourcesDiv);
                        }
                    }

                    if (isProofreadEntry) {
                        const thinking = answerDivSnapshot.querySelector('.lumina-thinking-container');
                        if (thinking) thinking.remove();
                    }

                    await LuminaChatUI.processContainer(answerDivSnapshot);
                } catch (e) {
                    console.error('[Lumina] post-answer processing error:', e);
                } finally {
                    this.webSearchSources = previousSources;
                    this._snapToBottomIfNeeded(shouldStickBottom);
                }
            }, 380); // Increased delay for Windows responsiveness
        } else if (sourcesSnapshot.length > 0 && !skipScroll && !this.disableStreamAutoFollow) {
            requestAnimationFrame(() => this.scrollToBottom());
        }

        this.currentAnswerDiv = null;
        this.webSearchSources = [];

        // Always reset the regenerate button when answer finishes
        this.hideStopButton();
    }

    /**
     * Reusable logic to calculate the scroll target so the previous separator aligns at top.
     */
    static calculateInitialScrollTarget(entry, scrollContainer, historyEl) {
        if (!entry || !scrollContainer || !historyEl) return 0;
        const allEntries = historyEl.querySelectorAll('.lumina-dict-entry');
        const currentIndex = Array.from(allEntries).indexOf(entry);
        if (currentIndex <= 0) return 0;

        const previousEntry = allEntries[currentIndex - 1];
        const containerRect = scrollContainer.getBoundingClientRect();
        const prevRect = previousEntry.getBoundingClientRect();
        // Subtract 10px to account for the .lumina-dict-separator margin (10px 0)
        return (prevRect.bottom - containerRect.top) + scrollContainer.scrollTop - 10;
    }

    /**
     * Reusable logic to calculate and apply min-height to an entry so it fills the viewport.
     */
    static applyViewportMinHeight(entry, container, inputWrapper, currentIndex) {
        if (!entry || !container) return;

        const containerHeight = container.clientHeight || container.offsetHeight;
        const inputHeight = inputWrapper ? (inputWrapper.offsetHeight || 0) : 0;
        const viewportHeight = containerHeight - inputHeight;

        if (viewportHeight > 0) {
            const offset = currentIndex === 0 ? 10 : 20;
            entry.style.setProperty('min-height', (viewportHeight - offset) + 'px', 'important');
            return true;
        }
        return false;
    }

    /**
     * No-op: layout is now handled by min-height on the active entry (Gemini-style).
     * min-height is cleared from old entries when a new entry starts via clearEntryMargins().
     */
    adjustEntryMargin(entry, behavior = 'none') {
        // intentionally empty
    }

    /**
     * Remove min-height from all entries except the current one.
     * Called when a new entry starts so older entries collapse to their natural height.
     * @param {HTMLElement} excludeEntry - The new/current entry to keep
     */
    clearEntryMargins(excludeEntry = null) {
        if (!this.historyEl) return;

        // HIGH PERFORMANCE: Only clear the last known active entry
        if (this._lastActiveEntry && this._lastActiveEntry !== excludeEntry) {
            try {
                this._lastActiveEntry.style.removeProperty('min-height');
            } catch (e) { }
            this._lastActiveEntry = (excludeEntry && excludeEntry.classList.contains('lumina-dict-entry')) ? excludeEntry : null;
            return;
        }

        const allEntries = this.historyEl.querySelectorAll('.lumina-dict-entry');
        allEntries.forEach(e => {
            if (e !== excludeEntry) {
                e.style.removeProperty('min-height');
            }
        });
        this._lastActiveEntry = (excludeEntry && excludeEntry.classList.contains('lumina-dict-entry')) ? excludeEntry : null;
    }

    /**
     * Set min-height on the new entry so it fills the viewport (Gemini-style).
     * Clears min-height from all previous entries so they collapse to natural height.
     * Scrolls to align the previous entry's separator at the top of the viewport.
     *
     * @param {HTMLElement} entry - The new entry element
     * @param {boolean} skipScroll - If true, skip setting scrollTop
     */
    setInitialEntryHeight(entry, skipScroll = false) {
        if (!entry || !this.container) return;

        const scrollContainer = this.getScrollContainer();
        if (!scrollContainer) return;

        // Set min-height so the entry fills the viewport; clear it from all others.
        const container = this.container.querySelector('.lumina-chat-container') || this.container;
        const inputWrapper = this.container.querySelector('.lumina-chat-input-wrapper') || document.body.querySelector('.lumina-chat-input-wrapper');
        
        const allEntries = this.historyEl.querySelectorAll('.lumina-dict-entry');
        const currentIndex = Array.from(allEntries).indexOf(entry);

        if (LuminaChatUI.applyViewportMinHeight(entry, container, inputWrapper, currentIndex)) {
            // IMPORTANT: Clear other margins FIRST so we calculate the target on a stable layout
            this.clearEntryMargins(entry);

            // ONLY scroll if not skipped and not globally disabled
            if (!skipScroll && !this.disableAutoScroll) {
                // Calculate scroll target AFTER DOM changes for accuracy
                const targetScrollTop = LuminaChatUI.calculateInitialScrollTarget(entry, scrollContainer, this.historyEl);

                const containerHeight = container.clientHeight || container.offsetHeight;
                const inputHeight = inputWrapper ? (inputWrapper.offsetHeight || 0) : 0;
                const maxScroll = scrollContainer.scrollHeight - (containerHeight - inputHeight);
                scrollContainer.scrollTop = Math.min(targetScrollTop, maxScroll);
            }
        } else {
            // Container not yet sized (e.g. popup dimensions applied async) — retry
            setTimeout(() => this.setInitialEntryHeight(entry, skipScroll), 80);
        }
    }
    /**
     * Append an error message
     * @param {string} text - Error text
     */
    appendError(text) {
        const div = document.createElement('div');
        div.className = 'lumina-chat-answer';
        div.style.color = 'var(--lumina-error)';
        div.textContent = text;

        if (this.currentEntryDiv) {
            const existingSep = this.currentEntryDiv.querySelector(':scope > .lumina-dict-separator');
            if (existingSep) {
                this.currentEntryDiv.insertBefore(div, existingSep);
            } else {
                this.currentEntryDiv.appendChild(div);
                const separator = document.createElement('div');
                separator.className = 'lumina-dict-separator';
                this.currentEntryDiv.appendChild(separator);
            }
            this.adjustEntryMargin(this.currentEntryDiv, 'none');
        } else {
            this.historyEl.appendChild(div);
        }
        this.scrollToBottom();
    }

    _extractContext(rawText) {
        if (!rawText) return '';
        // Support formats:
        // 1. $ContextTag:"selection"
        // 2. SelectedText: "selection"
        // 3. "selection" at the beginning of the string
        let match = rawText.match(/\$ContextTag\s*:?\s*"([\s\S]*?)"/);
        if (match) return match[1];
        
        match = rawText.match(/^SelectedText\s*:?\s*"([\s\S]*?)"(?:\n\n|$)/);
        if (match) return match[1];

        match = rawText.match(/^"([\s\S]*?)"/);
        if (match) return match[1];
        
        return '';
    }

    getLoadingHTML() {
        return `<div class="lumina-thinking-shimmer">Thinking</div>`;
    }

    showLoading() {
        if (this.loadingDiv) return;

        this.loadingDiv = document.createElement('div');
        this.loadingDiv.className = 'lumina-loading-wrapper';
        this.loadingDiv.innerHTML = this.getLoadingHTML();

        if (this.currentEntryDiv) {
            const existingSep = this.currentEntryDiv.querySelector(':scope > .lumina-dict-separator');
            if (existingSep) {
                this.currentEntryDiv.insertBefore(this.loadingDiv, existingSep);
            } else {
                this.currentEntryDiv.appendChild(this.loadingDiv);
            }
        } else {
            this.historyEl.appendChild(this.loadingDiv);
        }
        this.scrollToBottom();
    }

    removeLoading() {
        if (this.loadingDiv) {
            this.loadingDiv.remove();
            this.loadingDiv = null;
        }
    }

    showSearching() {
        if (this.searchingDiv) return;

        this.searchingDiv = document.createElement('div');
        this.searchingDiv.className = 'lumina-searching-indicator';
        this.searchingDiv.innerHTML = '<span>Searching...</span>';

        if (this.currentEntryDiv) {
            // Insert after question div, but before separator
            const questionDiv = this.currentEntryDiv.querySelector('.lumina-chat-question');
            const existingSep = this.currentEntryDiv.querySelector(':scope > .lumina-dict-separator');
            if (questionDiv) {
                questionDiv.after(this.searchingDiv);
            } else if (existingSep) {
                this.currentEntryDiv.insertBefore(this.searchingDiv, existingSep);
            } else {
                this.currentEntryDiv.appendChild(this.searchingDiv);
            }
        } else {
            this.historyEl.appendChild(this.searchingDiv);
        }
        this.scrollToBottom();
    }

    removeSearching() {
        if (this.searchingDiv) {
            this.searchingDiv.remove();
            this.searchingDiv = null;
        }
    }

    handleWebSearchStatus(msg) {
        this.removeLoading();

        if (msg.hideProgress) {
            if (msg.sources) this.webSearchSources = msg.sources;
            return;
        }

        if (msg.status === 'searching') {
            this.showSearching();
        } else if (msg.status === 'analyzing' || msg.status === 'completed') {
            if (msg.sources) this.webSearchSources = msg.sources;
            this.removeSearching();
        } else if (msg.status === 'error') {
            this.removeSearching();
        }
    }

    handleYoutubeStatus(msg) {
        if (msg.status === 'fetching') {
            this.removeLoading();
            if (this.fetchingDiv) return;

            this.fetchingDiv = document.createElement('div');
            this.fetchingDiv.className = 'lumina-loading-wrapper';
            this.fetchingDiv.innerHTML = `<div class="lumina-fetching-shimmer">Fetching</div>`;

            if (this.currentEntryDiv) {
                // Insert after question div
                const questionDiv = this.currentEntryDiv.querySelector('.lumina-chat-question');
                if (questionDiv) {
                    questionDiv.after(this.fetchingDiv);
                } else {
                    this.currentEntryDiv.appendChild(this.fetchingDiv);
                }
            } else {
                this.historyEl.appendChild(this.fetchingDiv);
            }
            this.scrollToBottom();
        } else if (msg.status === 'ready') {
            if (this.fetchingDiv) {
                this.fetchingDiv.remove();
                this.fetchingDiv = null;
            }

            if (msg.transcript) {
                const container = document.createElement('div');
                container.className = 'lumina-thinking-container lumina-youtube-transcript-container collapsed appeared';
                container.dataset.videoId = msg.videoId || '';
                container.innerHTML = `
                    <div class="lumina-thinking-header">
                        <div class="lumina-thinking-icon">
                            <svg viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z" fill="currentColor"></path></svg>
                        </div>
                        <span class="lumina-thinking-label">YouTube Transcript</span>
                    </div>
                    <div class="lumina-thinking-content lumina-youtube-transcript-content">${msg.transcript}</div>
                `;

                // Toggle collapse/expand — pure CSS-driven like lumina-thinking-container
                const header = container.querySelector('.lumina-thinking-header');
                header.addEventListener('click', () => {
                    container.classList.toggle('collapsed');
                });

                if (this.currentEntryDiv) {
                    const questionDiv = this.currentEntryDiv.querySelector('.lumina-chat-question');
                    if (questionDiv) {
                        questionDiv.after(container);
                    } else {
                        this.currentEntryDiv.appendChild(container);
                    }
                } else {
                    this.historyEl.appendChild(container);
                }

                // Immediately show Thinking... after transcript container
                this.showLoading();
            }
        }
    }

    async addFile(file) {
        if (!file) return false;

        return await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                const dataUrl = e.target.result;
                const mimeType = file.type;
                const isImage = mimeType.startsWith('image/');

                let fileObj = {
                    mimeType: mimeType,
                    name: file.name,
                    isImage: isImage,
                    dataUrl: dataUrl
                };

                if (isImage) {
                    fileObj.previewUrl = this._createObjectUrl(file);
                }

                this.attachedFiles.push(fileObj);
                this.selectedImages.push(dataUrl); // compat
                this.renderFilePreviews();
                this._updateContainerState();
                resolve(true);
            };
            reader.onerror = () => resolve(false);
            reader.readAsDataURL(file);
        });
    }

    // Backward compatibility
    addImage(dataUrl) {
        const previewUrl = this._resolveImagePreviewSrc(null, dataUrl);
        this.attachedFiles.push({
            mimeType: 'image/png',
            name: 'Pasted Image',
            isImage: true,
            dataUrl: dataUrl,
            previewUrl: previewUrl
        });
        this.selectedImages.push(dataUrl);
        this.renderFilePreviews();
    }

    removeFile(index) {
        const file = this.attachedFiles[index];
        this._revokeObjectUrl(file?.previewUrl);
        this.attachedFiles.splice(index, 1);
        this.selectedImages.splice(index, 1);
        this.renderFilePreviews();
        this._updateContainerState();
    }

    clearImages() {
        this.attachedFiles.forEach(file => this._revokeObjectUrl(file?.previewUrl));
        this.attachedFiles = [];
        this.selectedImages = [];
        this.renderFilePreviews();
        this._updateContainerState();
    }

    renderFilePreviews() {
        if (!this.imagePreviewEl) return;
        if (this.attachedFiles.length === 0) {
            this.imagePreviewEl.innerHTML = '';
            return;
        }

        const listDiv = document.createElement('div');
        listDiv.className = 'lumina-image-list';
        const sharedHelpers = LuminaSharedChatUI && typeof LuminaSharedChatUI.getFileTypeLabel === 'function'
            ? LuminaSharedChatUI
            : null;
        const getFileCategory = (ext, mimeType) => sharedHelpers
            ? sharedHelpers.inferFileCategory(ext, mimeType)
            : ((String(mimeType || '').startsWith('audio/') ? 'audio' : (String(mimeType || '').startsWith('video/') ? 'video' : 'file')));
        const getFileIcon = (category) => sharedHelpers
            ? sharedHelpers.getFileIconByCategory(category)
            : '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>';
        const getDisplayName = (fileName) => sharedHelpers
            ? sharedHelpers.getDisplayFileName(fileName)
            : String(fileName || 'File').replace(/\.[^.]+$/, '');
        const getFileTypeLabel = (file) => sharedHelpers
            ? sharedHelpers.getFileTypeLabel(file)
            : ((String(file?.mimeType || '').split('/')[1] || 'FILE').toUpperCase());

        this.attachedFiles.forEach((file, index) => {
            const itemDiv = document.createElement('div');
            itemDiv.className = `lumina-image-preview-item ${!file.isImage ? 'is-file' : ''}`;

            let content = '';
            if (file.isImage) {
                content = `<img src="${file.previewUrl || file.dataUrl}" alt="${file.name}">`;
            } else {
                const fileName = file.name || 'File';
                const rawExt = fileName.includes('.') ? fileName.split('.').pop() : '';
                const ext = (rawExt || '').toLowerCase();
                const category = getFileCategory(ext, file.mimeType || '');
                const icon = getFileIcon(category);
                const displayName = getDisplayName(fileName);
                const typeLabel = getFileTypeLabel(file);

                content = `<div class="lumina-file-preview-info"><span class="lumina-file-name">${this.escapeHTMLAttr(displayName || fileName)}</span><div class="lumina-file-meta-row"><span class="lumina-file-icon-inline file-${category}">${icon}</span><span class="lumina-file-size-tag">${this.escapeHTMLAttr(typeLabel)}</span></div></div>`;
            }

            itemDiv.innerHTML = content;
            const removeBtn = document.createElement('div');
            removeBtn.className = 'lumina-image-remove';
            removeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12"><path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
            removeBtn.onclick = () => this.removeFile(index);
            itemDiv.appendChild(removeBtn);
            listDiv.appendChild(itemDiv);
        });

        this.imagePreviewEl.innerHTML = '';
        this.imagePreviewEl.appendChild(listDiv);
    }

    /**
     * Custom smooth scroll implementation to match Popup's speed and easing
     * @param {number} targetScrollTop - The target scrollTop position
     * @param {number} duration - Animation duration in ms (default 1250)
     */
    _smoothScrollTo(targetScrollTop, _durationUnused = 1250) {
        const scrollContainer = this.getScrollContainer();
        if (!scrollContainer) return;

        if (this._scrollAnimationId) {
            cancelAnimationFrame(this._scrollAnimationId);
            this._scrollAnimationId = null;
        }

        scrollContainer.scrollTop = targetScrollTop;

        // Execute any deferred margin adjustments immediately
        if (this._pendingMarginEntry) {
            this.adjustEntryMargin(this._pendingMarginEntry, 'none');
            this._pendingMarginEntry = null;
        }
    }

    /**
     * Smart scroll: scroll to bottom only if user is already near bottom or forced
     * @param {HTMLElement} targetElement - Optional target element (unused in simplified version but kept for signature compatibility)
     */
    scrollToBottom(targetElement = null) {
        if (this.disableAutoScroll) return;
        const scrollContainer = this.getScrollContainer();
        if (!scrollContainer) return;

        // With min-height layout, scrollHeight already reflects actual content height.
        // No need to subtract a phantom margin.
        const threshold = 100;
        const distanceToBottom = scrollContainer.scrollHeight - scrollContainer.scrollTop - scrollContainer.clientHeight;
        const isNearBottom = distanceToBottom < threshold;

        if (isNearBottom || scrollContainer.scrollHeight <= scrollContainer.clientHeight + 100) {
            const targetScrollTop = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);
            if (targetScrollTop > scrollContainer.scrollTop) {
                scrollContainer.scrollTop = targetScrollTop;
            }
        }
    }

    clearHistory() {
        if (this.historyEl) {
            this.historyEl.innerHTML = '';
        }
        this.currentEntryDiv = null;
        this.currentAnswerDiv = null;
        this.clearImages();
    }

    /**
     * Helper to escape HTML attributes
     * @param {string} str - String to escape
     * @returns {string} Escaped string
     */
    escapeHTMLAttr(str) {
        if (!str) return '';
        return str.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    /**
     * Balances source and target translation blocks to equalize their heights
     * @param {HTMLElement} entry - The entry containing a .lumina-translation-card
     */
    static balanceTranslationCard(entry) {
        if (!entry) return;
        const card = entry.querySelector('.lumina-translation-card');
        if (!card) return;

        const blocks = card.querySelectorAll('.lumina-translation-block');
        if (blocks.length !== 2) return;

        const left = blocks[0];
        const right = blocks[1];

        const getStats = (el) => {
            const inner = el.querySelector('.lumina-translation-text');
            if (!inner) return { lines: 0, height: 0 };
            const style = window.getComputedStyle(inner);
            const lh = parseFloat(style.lineHeight) || 26.4;
            const h = inner.scrollHeight;
            return { lines: Math.ceil((h - 1) / lh), height: h };
        };

        const applyWidth = (leftRatio, animate = true) => {
            const val = Math.max(25, Math.min(75, leftRatio));
            left.style.transition = animate ? 'width 0.4s cubic-bezier(0.16, 1, 0.3, 1)' : 'none';
            right.style.transition = animate ? 'width 0.4s cubic-bezier(0.16, 1, 0.3, 1)' : 'none';
            left.style.flex = 'none';
            left.style.width = `${val.toFixed(2)}%`;
            right.style.flex = 'none';
            right.style.width = `${(100 - val).toFixed(2)}%`;
            return left.offsetHeight; // Force reflow
        };

        requestAnimationFrame(() => {
            applyWidth(50, false);
            const s1 = getStats(left);
            const s2 = getStats(right);

            if (s1.lines === 0 || s2.lines === 0) return;

            let low = 25, high = 75;
            let bestWidth = 50;
            let minDiff = Math.abs(s1.lines - s2.lines);
            let minTotalLines = s1.lines + s2.lines;

            for (let i = 0; i < 10; i++) {
                let mid = (low + high) / 2;
                applyWidth(mid, false);

                const ns1 = getStats(left);
                const ns2 = getStats(right);
                const currentDiff = Math.abs(ns1.lines - ns2.lines);
                const currentTotal = ns1.lines + ns2.lines;

                const isBetter = (currentDiff < minDiff) ||
                    (currentDiff === minDiff && currentTotal < minTotalLines) ||
                    (currentDiff === minDiff && currentTotal === minTotalLines && Math.abs(mid - 50) < Math.abs(bestWidth - 50));

                if (isBetter) {
                    minDiff = currentDiff;
                    minTotalLines = currentTotal;
                    bestWidth = mid;
                }

                if (ns1.lines > ns2.lines) low = mid;
                else high = mid;
            }

            applyWidth(bestWidth, true);
        });
    }

    /**
     * Append a partial translation entry (source + loading indicator)
     * @param {string} text - Source text to translate
     * @returns {HTMLElement} The created entry element
     */
    appendPartialTranslation(text) {
        // Clear margins from previous entries before adding new one
        this.clearEntryMargins();

        const safeText = this.escapeHTMLAttr(text);

        const div = document.createElement('div');
        div.className = 'lumina-dict-entry lumina-fade-in';
        div.dataset.entryType = 'translation';
        div.dataset.partial = 'true';

        div.innerHTML = `
            <div class="lumina-chat-question translation-question">Translate</div>
            <div class="lumina-translation-container">
                <div class="lumina-translation-card">
                    <!-- Source Block (left) -->
                    <div class="lumina-translation-block">
                        <div class="lumina-translation-source" data-copy-text="${safeText}">
                            <div class="lumina-translation-text">${text}</div>
                        </div>
                    </div>

                    <!-- Vertical Divider -->
                    <div class="lumina-translation-divider"></div>

                    <!-- Target Block (right) -->
                    <div class="lumina-translation-block">
                        <div class="lumina-translation-target">
                            ${this.getLoadingHTML()}
                        </div>
                    </div>
                </div>
            </div>
        `;


        // Capture current scroll position BEFORE appending to history
        const scrollContainer = this.getScrollContainer();
        const preAppendScroll = scrollContainer ? scrollContainer.scrollTop : 0;

        this.historyEl.appendChild(div);

        // Set initial margin and scroll
        this.setInitialEntryHeight(div, false, preAppendScroll);

        return div;
    }

    /**
     * Update a partial translation entry with the result
     * @param {HTMLElement} element - The partial translation element
     * @param {Object|string} data - Translation result data
     */
    updatePartialTranslation(element, data) {
        if (!element) return;

        // Handle string or object response
        if (typeof data === 'string') {
            data = { translation: data, type: 'sentence' };
        }

        // Get original text from DOM if not in response
        if (!data.original) {
            const sourceDiv = element.querySelector('.lumina-translation-source');
            if (sourceDiv) {
                data.original = sourceDiv.getAttribute('data-copy-text') || sourceDiv.textContent.trim();
            }
        }

        const safeOriginal = this.escapeHTMLAttr(data.original || '');
        const safeTranslation = this.escapeHTMLAttr(data.translation || '');

        element.innerHTML = `
            <div class="lumina-chat-question translation-question">Translate</div>
            <div class="lumina-translation-container">
                <div class="lumina-translation-card">
                    <!-- Source Block (left) -->
                    <div class="lumina-translation-block">
                        <div class="lumina-translation-source" data-copy-text="${safeOriginal}">
                            <div class="lumina-translation-text">${data.original || ''}</div>
                        </div>
                    </div>

                    <!-- Vertical Divider -->
                    <div class="lumina-translation-divider"></div>

                    <!-- Target Block (right) -->
                    <div class="lumina-translation-block">
                        <div class="lumina-translation-target" data-copy-text="${safeTranslation}">
                            <div class="lumina-translation-text">${data.translation || ''}</div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Add separator
        const separator = document.createElement('div');
        separator.className = 'lumina-dict-separator';
        element.appendChild(separator);

        delete element.dataset.partial;

        // Apply margin adjustment for consistent spacing
        this.adjustEntryMargin(element);

        // Set up sentence-level hover highlight (Google Translate style)
        requestAnimationFrame(() => LuminaChatUI._setupTranslationHighlight(element));

        // Balance the layout (equalize heights)
        LuminaChatUI.balanceTranslationCard(element);

        // Show regenerate button after translation completes
        const regenBtn = this.container.querySelector('#lumina-regenerate-btn') ||
            this.container.querySelector('.lumina-regenerate-btn') ||
            document.getElementById('lumina-regenerate-btn') ||
            document.querySelector('.lumina-regenerate-btn');
        if (regenBtn) {
            regenBtn.style.display = 'flex';
        }
    }

    /**
     * Set up sentence-level hover highlighting on a completed translation entry.
     * Hovering a sentence on either side highlights the matching sentence on the other side.
     * @param {HTMLElement} element - The translation entry element
     */
    static _setupTranslationHighlight(element) {
        const sourceTextEl = element.querySelector('.lumina-translation-source .lumina-translation-text');
        const targetTextEl = element.querySelector('.lumina-translation-target .lumina-translation-text');
        if (!sourceTextEl || !targetTextEl) return;

        /**
         * Split text into sentences, preserving trailing punctuation.
         * Handles Latin (. ! ?) and CJK (。！？) sentence endings.
         */
        const splitSentences = (text) => {
            const initialParts = [];
            // Split on sentence-ending punctuation followed by whitespace, end of string, 
            // or an uppercase letter (handling missing spaces like "case.Take")
            // Use non-greedy match to handle internal dots like decimals (9.5%) 
            const re = /[\s\S]*?[.!?。！？]+(?:\s+|$|(?=[A-Z]))/g;
            let match;
            let lastIndex = 0;
            while ((match = re.exec(text)) !== null) {
                initialParts.push(match[0]);
                lastIndex = re.lastIndex;
            }
            // Any remaining text that didn't end with punctuation
            if (lastIndex < text.length) {
                const remaining = text.slice(lastIndex);
                if (remaining) initialParts.push(remaining);
            }

            if (initialParts.length <= 1) return initialParts.length ? initialParts : [text];

            // Merge parts that end with common abbreviations or initials (e.g. "St.", "Dr.", "John D.")
            const finalParts = [];
            for (let i = 0; i < initialParts.length; i++) {
                const part = initialParts[i];
                const trimmed = part.trim();

                // Case 1: The whole part is a bullet/index (e.g. "1.", "A.")
                const isBullet = trimmed.length <= 3 && /^[A-Za-z0-9][\.\)]?$/i.test(trimmed);

                // Case 2: The part ends with a known abbreviation
                const endsWithAbbr = /(?:^|\s)(?:St|Dr|Mr|Mrs|Ms|Prof|Inc|Ltd|Co|Approx|Vs|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.$/i.test(trimmed);

                // Case 3: The part ends with a single letter initial (e.g. "John D.")
                // Initials must be Uppercase and preceded by a space to avoid unicode boundary false positives
                const endsWithInitial = /(?:^|\s)[A-Z]\.$/.test(trimmed);

                if ((isBullet || endsWithAbbr || endsWithInitial) && i < initialParts.length - 1) {
                    // Merge current into next and continue
                    initialParts[i + 1] = part + initialParts[i + 1];
                } else {
                    if (trimmed) finalParts.push(part);
                }
            }

            return finalParts.length ? finalParts : initialParts;
        };

        const sourceSentences = splitSentences(sourceTextEl.textContent);
        const targetSentences = splitSentences(targetTextEl.textContent);

        const wrapSentences = (el, sentences) => {
            el.innerHTML = sentences
                .map((s, i) => `<span class="lumina-trans-sentence" data-idx="${i}">${s}</span>`)
                .join(' ');
        };

        wrapSentences(sourceTextEl, sourceSentences);
        wrapSentences(targetTextEl, targetSentences);

        const sourceSpans = Array.from(sourceTextEl.querySelectorAll('.lumina-trans-sentence'));
        const targetSpans = Array.from(targetTextEl.querySelectorAll('.lumina-trans-sentence'));
        const allSpans = [...sourceSpans, ...targetSpans];

        // Use max index to allow 1:N or N:1 mappings gracefully
        const maxIdx = Math.max(sourceSentences.length, targetSentences.length) - 1;
        const clampIdx = (idx, arr) =>
            maxIdx === 0 ? 0 : Math.round((idx / maxIdx) * (arr.length - 1));

        const clearAll = () => allSpans.forEach(s => s.classList.remove('hovered'));

        const handleHover = (e, index, spans, mirrors) => {
            const target = e.target.closest('.lumina-trans-sentence');
            if (target) {
                const idx = parseInt(target.dataset.idx);
                clearAll();

                // Highlight current
                const currentSpans = spans.filter(s => parseInt(s.dataset.idx) === idx);
                currentSpans.forEach(s => s.classList.add('hovered'));

                // Highlight mirror
                const mirrorIdx = clampIdx(idx, mirrors);
                const mirrorSpans = mirrors.filter(s => parseInt(s.dataset.idx) === mirrorIdx);
                mirrorSpans.forEach(s => s.classList.add('hovered'));
            }
        };

        sourceTextEl.addEventListener('mouseover', (e) => handleHover(e, null, sourceSpans, targetSpans));
        targetTextEl.addEventListener('mouseover', (e) => handleHover(e, null, targetSpans, sourceSpans));

        sourceTextEl.addEventListener('mouseleave', clearAll);
        targetTextEl.addEventListener('mouseleave', clearAll);
    }

    /**
     * Handle translation request
     * @param {string} text - Text to translate
     */
    async handleTranslation(text) {
        const entryDiv = this.appendPartialTranslation(text);

        let aborted = false;
        this.showStopButton(() => {
            aborted = true;
            if (entryDiv) entryDiv.remove();
            this.hideStopButton();
        });

        try {
            const response = await chrome.runtime.sendMessage({ action: 'translate', text: text });

            if (aborted) return;

            if (response.error) {
                this.updatePartialTranslation(entryDiv, { translation: 'Error: ' + response.error, type: 'sentence' });
            } else {
                this.updatePartialTranslation(entryDiv, response);
            }
        } catch (err) {
            if (aborted) return;
            this.updatePartialTranslation(entryDiv, { translation: 'Error: ' + err.message, type: 'sentence' });
        } finally {
            if (!aborted) this.hideStopButton();
        }
    }

    /**
     * Handle proofread submission - creates proper entry with yellow question styling
     * @param {string} text - Text to proofread
     */

    /**
     * Gather messages from DOM for API calls
     * @returns {Array} Messages array in OpenAI/Gemini format
     */
    collectComments(contextEntry = null) {
        if (!this.historyEl) return '';

        // If contextEntry is provided, search backwards starting from it
        // Otherwise search backwards from the end of history
        let entries = Array.from(this.historyEl.querySelectorAll('.lumina-dict-entry'));
        if (contextEntry) {
            const idx = entries.indexOf(contextEntry);
            if (idx !== -1) {
                entries = entries.slice(0, idx);
            }
        }
        entries.reverse();

        let collected = [];
        for (const entry of entries) {
            const highlights = entry.querySelectorAll('.lumina-comment-highlight');
            if (highlights.length > 0) {
                highlights.forEach(span => {
                    const text = span.textContent.trim();
                    const comment = span.dataset.comment;
                    if (text && comment) {
                        collected.push(`- "${text}": ${comment}`);
                    }
                });
                break; // Only take from the most recent one with comments
            }
        }

        if (collected.length === 0) return '';

        return `[USER COMMENTS ON PREVIOUS DRAFT]:\n${collected.join('\n')}\n\n`;
    }

    gatherMessages() {
        const messages = [];
        const entries = this.historyEl.querySelectorAll('.lumina-dict-entry');
        const allTranscriptContainers = this.historyEl.querySelectorAll('.lumina-youtube-transcript-container');
        const latestTranscriptContainer = allTranscriptContainers.length > 0 ? allTranscriptContainers[allTranscriptContainers.length - 1] : null;

        entries.forEach(entry => {
            const questionEl = entry.querySelector('.lumina-chat-question');

            // For answers, check if there are multiple versions and get only the active one
            let answerEl = null;
            const versionsContainer = entry.querySelector('.lumina-answer-versions');
            if (versionsContainer) {
                const activeVersion = versionsContainer.querySelector('.lumina-answer-version.active');
                if (activeVersion) {
                    answerEl = activeVersion.querySelector('.lumina-chat-answer');
                }
            } else {
                answerEl = entry.querySelector('.lumina-chat-answer');
            }

            if (questionEl) {
                let questionText = questionEl.dataset.rawText || questionEl.textContent.trim();

                // Process @comments trigger in history
                if (questionText.indexOf('@comments') !== -1) {
                    const collected = this.collectComments(entry);
                    if (collected) {
                        questionText = questionText.replace(/@comments/g, collected);
                    }
                }

                const transcriptContainer = entry.querySelector('.lumina-youtube-transcript-container');
                if (transcriptContainer && transcriptContainer === latestTranscriptContainer) {
                    const transcriptContent = transcriptContainer.querySelector('.lumina-youtube-transcript-content');
                    if (transcriptContent) {
                        questionText = `[Video Transcript Context]:\n"${transcriptContent.textContent.trim()}"\n\n[Question]: ${questionText}`;
                    }
                }

                let images = Array.isArray(questionEl._luminaImages) ? questionEl._luminaImages :
                    (Array.isArray(entry._luminaImages) ? entry._luminaImages : []);
                if (!images.length && questionEl.dataset.images) {
                    try {
                        const parsed = JSON.parse(questionEl.dataset.images);
                        if (Array.isArray(parsed)) images = parsed;
                    } catch (_) {
                        images = [];
                    }
                }
                messages.push({
                    role: 'user',
                    text: questionText,
                    files: images
                });
            }

            if (answerEl) {
                const answerText = answerEl.getAttribute('data-raw-text') || answerEl.textContent.trim();
                if (answerText) {
                    messages.push({
                        role: 'model',
                        text: answerText
                    });
                }
            }
        });

        return messages;
    }

    /**
     * Get the video ID of the latest transcript displayed in the history
     * @returns {string|null} Video ID
     */
    getTranscriptVideoId() {
        if (!this.historyEl) return null;
        const transcriptContainers = this.historyEl.querySelectorAll('.lumina-youtube-transcript-container');
        if (transcriptContainers && transcriptContainers.length > 0) {
            const latestContainer = transcriptContainers[transcriptContainers.length - 1];
            return latestContainer.dataset.videoId || null;
        }
        return null;
    }

    /**
     * Get the HTML structure for the chat input bar
     * @param {boolean} autofocus - Whether to autofocus the textarea
     * @returns {string} HTML string
     */
    static getChatInputHTML(autofocus = false) {
        return `
          <div class="lumina-chat-input-wrapper">
            <div class="lumina-input-container">
                <div class="lumina-image-preview-container"></div>
                <div class="lumina-input-bar" id="input-bar">
                    <div class="lumina-left-actions">
                        <div class="lumina-actions-dropdown-wrapper" id="tools-wrapper">
                             <button class="lumina-plus-toggle lumina-tools-toggle" id="tools-toggle">
                                <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
                             </button>
                             <div class="lumina-tools-dropdown" id="tools-dropdown">
                                 <div class="lumina-dropdown-header" style="padding: 8px 12px; font-size: 11px; font-weight: 700; color: var(--lumina-text-secondary); text-transform: uppercase; letter-spacing: 0.02em;">Tools</div>
                                     <button class="lumina-tool-item" data-action="proofread">
                                         <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15l2 2 4-4"/></svg>
                                         <span>Proofread</span>
                                     </button>
                                     <button class="lumina-tool-item" data-action="translate">
                                         <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8l6 6"/><path d="M4 14l6-6 2-3"/><path d="M2 5h12M7 2h1M22 22l-5-10-5 10M14 18h6"/></svg>
                                         <span>Translate</span>
                                     </button>
                             </div>
                        </div>
                        <button class="lumina-proofread-toggle" id="proofread-toggle" style="display: none;">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15l2 2 4-4"/></svg>
                            <span class="tool-label">Proofread</span>
                        </button>
                        <button class="lumina-translate-toggle" id="translate-toggle" style="display: none;">
                            <span class="tool-label">Translate</span>
                        </button>
                         <button class="lumina-websource-toggle" id="websource-toggle" style="display: none;">
                             <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
                             <span class="tool-label">Web Source</span>
                         </button>
                    </div>
                    <textarea id="chat-input" class="lumina-chat-input" placeholder="Ask anything..." rows="1"></textarea>
                    <div class="lumina-model-selector" id="model-selector">
                        <button class="lumina-model-btn" id="model-btn">
                            <span class="lumina-current-model" id="model-label">Loading...</span>
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" style="margin-left: auto; opacity: 0.6;"><path d="M18 9l-6 6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" transform="rotate(180 12 12)"/></svg>
                        </button>
                        <div class="lumina-model-dropdown" id="model-dropdown"></div>
                    </div>
                    <div class="lumina-trailing-group">
                        <button class="lumina-mic-btn" id="mic-btn">
                            <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5zm6 6c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
                        </button>
                        <button class="lumina-regenerate-btn" id="lumina-regenerate-btn" style="display: none;">
                            <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>
                        </button>
                    </div>
                </div>
            </div>
            <div class="lumina-hover-trigger"></div>
          </div>`;
    }

    setupInputBar() {
        if (!this.inputEl) return;
        const popup = this.container;
        const input = this.inputEl;
        const queryInPopup = (selector) => popup.querySelector(selector) || document.querySelector(selector);
        const inputBar = queryInPopup('.lumina-input-bar') || queryInPopup('#input-bar');

        // Expose mode state on instance so switchTab() can save/restore per-tab
        this.isProofreadMode = this.isProofreadMode || false;

        this.isTranslateMode = this.isTranslateMode || false;
        // Local aliases for closure capture (keep pointing at instance props via getter)
        const getModes = () => ({ pr: this.isProofreadMode, tr: this.isTranslateMode });
        const setProofread = (v) => { this.isProofreadMode = v; };

        const setTranslate = (v) => { this.isTranslateMode = v; };


        // Show regenerate button if history already has messages
        const history = queryInPopup('.lumina-chat-history') || queryInPopup('.lumina-chat-scroll-content');
        const regenBtn = queryInPopup('#lumina-regenerate-btn');
        if (history && history.children.length > 0 && regenBtn) {
            regenBtn.style.display = 'flex';
        }

        // Expand logic
        let shadowMeasurer = popup.querySelector('.lumina-shadow-measurer');
        const checkExpand = () => {
            if (!inputBar) return;
            const { pr, tr } = getModes();
            if (pr || this._pendingWebSource || input.value.includes('\n')) {
                inputBar.classList.add('expanded');
                // Still need to recalculate height for the expanded state
                requestAnimationFrame(() => {
                    input.style.height = 'auto';
                    input.style.height = input.scrollHeight + 'px';
                });
                return;
            }
            if (!shadowMeasurer) {
                shadowMeasurer = document.createElement('div');
                const style = window.getComputedStyle(input);
                shadowMeasurer.className = 'lumina-shadow-measurer';
                ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'padding', 'boxSizing', 'whiteSpace', 'wordBreak'].forEach(prop => {
                    shadowMeasurer.style[prop] = style[prop];
                });
                Object.assign(shadowMeasurer.style, { position: 'absolute', visibility: 'hidden', pointerEvents: 'none', display: 'block', left: '-9999px', top: '0', width: 'auto', border: 'none', margin: '0', minHeight: '0', maxHeight: 'none' });
                popup.appendChild(shadowMeasurer);
            }
            const inputContainer = queryInPopup('.lumina-input-container');
            if (!inputContainer) return;
            const containerWidth = inputContainer.clientWidth;
            if (containerWidth <= 0) return;

            // Use actual input width for more accurate wrap detection
            const actualInputWidth = input.clientWidth;
            shadowMeasurer.style.width = (actualInputWidth > 0 ? actualInputWidth : Math.max(containerWidth - 100, 50)) + 'px';

            if (!shadowMeasurer.dataset.baseHeight) {
                shadowMeasurer.textContent = 'M';
                shadowMeasurer.dataset.baseHeight = shadowMeasurer.scrollHeight;
            }
            const isAnyToolActive = pr || tr;

            // --- Collision detection: expand if text/placeholder reaches the model selector ---
            // Use a STABLE available width (containerWidth minus fixed controls) so the threshold
            // doesn't change when we toggle expanded/collapsed — prevents oscillation.
            let textCollidesWithSelector = false;
            const modelSelectorEl = queryInPopup('.lumina-model-selector') || queryInPopup('#model-selector');
            if (modelSelectorEl) {
                // Compute stable reference: containerWidth minus all fixed right-side controls
                const toolsWrapperEl = queryInPopup('.lumina-actions-dropdown-wrapper') || queryInPopup('#tools-wrapper');
                const trailingGroupEl = queryInPopup('.lumina-trailing-group');
                const controlsWidth = (toolsWrapperEl ? toolsWrapperEl.offsetWidth : 0)
                    + (modelSelectorEl ? modelSelectorEl.offsetWidth : 0)
                    + (trailingGroupEl ? trailingGroupEl.offsetWidth : 0)
                    + 28; // padding + gap allowance
                const stableAvailableWidth = Math.max(containerWidth - controlsWidth, 40);

                // Measure ONLY the actual typed value (not placeholder) for collision detection.
                // Placeholder collision is handled via CSS (wrapping + ellipsis), not expansion.
                const measureSingleLine = (text) => {
                    if (!text) return 0;
                    shadowMeasurer.style.whiteSpace = 'nowrap';
                    shadowMeasurer.style.width = 'auto';
                    shadowMeasurer.textContent = text;
                    const w = shadowMeasurer.scrollWidth;
                    shadowMeasurer.style.whiteSpace = '';
                    shadowMeasurer.style.width = (actualInputWidth > 0 ? actualInputWidth : Math.max(containerWidth - 100, 50)) + 'px';
                    return w;
                };
                const singleLineWidth = measureSingleLine(input.value);

                // Hysteresis: expand threshold (tight) vs collapse threshold (generous gap)
                // Prevents oscillation when text width ≈ available width.
                const isCurrentlyExpanded = inputBar.classList.contains('expanded');
                const expandThreshold = stableAvailableWidth - 8;   // expand when close to edge
                const collapseThreshold = stableAvailableWidth - 36; // collapse only when comfortably below
                if (!isCurrentlyExpanded) {
                    textCollidesWithSelector = singleLineWidth >= expandThreshold;

                } else {
                    // Stay expanded unless text is well clear of the selector
                    textCollidesWithSelector = singleLineWidth >= collapseThreshold;
                }
            }
            // ---------------------------------------------------------------------------------

            // DECIDE EXPANSION:
            const isCurrentlyExpanded = inputBar.classList.contains('expanded');
            let finalExpandState;

            if (isCurrentlyExpanded) {
                // Once expanded, STAY expanded until the input is cleared (user request)
                // This prevents the bar from flickering between 1 and 2 rows during edits.
                const hasText = input.value.trim().length > 0;
                finalExpandState = hasText || isAnyToolActive || textCollidesWithSelector;
            } else {
                // Normal expansion triggers (more than one line, tools active, or text collision)
                finalExpandState = (input.offsetHeight > 34) || isAnyToolActive || textCollidesWithSelector;
            }

            if (finalExpandState) {
                inputBar.classList.add('expanded');
            } else {
                inputBar.classList.remove('expanded');
            }

            // REMOVE JS inline heights: Let CSS (field-sizing) handle it from now on
            input.style.removeProperty('height');
        };

        // Instant response: No more debounces or requestAnimationFrames
        const debouncedCheckExpand = (immediate = false) => {
            checkExpand();
        };

        // Expose checkExpand so restoreInputState can trigger it
        this._checkExpand = checkExpand;

        // Re-run checkExpand whenever the input container is resized (e.g. pane drag).
        if (typeof ResizeObserver !== 'undefined') {
            const resizeTarget = queryInPopup('.lumina-input-container') || inputBar;
            if (resizeTarget) {
                const ro = new ResizeObserver(() => debouncedCheckExpand());
                ro.observe(resizeTarget);
                this._inputResizeObserver = ro;
            }
        }

        // Listeners
        input.addEventListener('focus', () => { this._updateContainerState(); debouncedCheckExpand(true); });
        input.addEventListener('blur', () => { setTimeout(() => { this._updateContainerState(); }, 100); setTimeout(() => debouncedCheckExpand(true), 100); });
        input.addEventListener('input', () => {
            // Keyword prefix trigger (colon optional): "Translate", "Proofread", "Google AI" ...
            const val = input.value;
            const translateKw = val.match(/^translate:?\s+/i);
            const proofreadKw = !translateKw && val.match(/^proofread:?\s+/i);

            if (translateKw && !getModes().tr) {
                removeActiveModes();
                setTranslate(true);
                const toolItem = queryInPopup('[data-action="translate"]');
                if (toolItem) toolItem.classList.add('active');
                const toggle = queryInPopup('#translate-toggle') || queryInPopup('.lumina-translate-toggle');
                if (toggle) { toggle.style.display = 'flex'; toggle.classList.add('active'); }
                input.placeholder = 'Enter text to translate...';
                input.value = val.slice(translateKw[0].length);
                if (toolsWrapper) toolsWrapper.classList.remove('active');
                if (toolsDropdown) toolsDropdown.classList.remove('active');
            } else if (proofreadKw && !getModes().pr) {
                removeActiveModes();
                setProofread(true);
                const toolItem = queryInPopup('[data-action="proofread"]');
                if (toolItem) toolItem.classList.add('active');
                const toggle = queryInPopup('#proofread-toggle') || queryInPopup('.lumina-proofread-toggle');
                if (toggle) { toggle.style.display = 'flex'; toggle.classList.add('active'); }
                input.placeholder = 'Enter text to proofread...';
                input.value = val.slice(proofreadKw[0].length);
                if (toolsWrapper) toolsWrapper.classList.remove('active');
                if (toolsDropdown) toolsDropdown.classList.remove('active');
            } else if (!this._pendingWebSource && this._cachedSources && this._cachedSources.length) {
                // Web source keyword trigger: type source name (+ optional colon + space)
                // e.g. "wikipedia ", "oxford: ", "Cambridge "
                for (const source of this._cachedSources) {
                    const escaped = source.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const sourceKw = val.match(new RegExp(`^${escaped}:?\\s+`, 'i'));
                    if (sourceKw) {
                        removeActiveModes();
                        this._pendingWebSource = source;
                        const websourceToggle = queryInPopup('#websource-toggle') || queryInPopup('.lumina-websource-toggle');
                        if (websourceToggle) {
                            const label = websourceToggle.querySelector('.tool-label');
                            if (label) label.textContent = source.name;
                            websourceToggle.style.display = 'flex';
                            websourceToggle.classList.add('active');
                        }
                        if (toolsWrapper) toolsWrapper.classList.remove('active');
                        if (toolsDropdown) toolsDropdown.classList.remove('active');
                        input.placeholder = `Type text to search in ${source.name}...`;
                        input.value = val.slice(sourceKw[0].length);
                        break;
                    }
                }
            }
            // Only reset height so checkExpand reads correct scrollHeight.
            // Do NOT set height here — checkExpand handles it via rAF so it
            // runs after the layout potentially switches from 1-row to 2-row.
            debouncedCheckExpand();
            this._updateContainerState();

            // Recalculate last entry margin in realtime as input grows (throttled)
            if (!this._marginThrottled) {
                this._marginThrottled = true;
                setTimeout(() => { this._marginThrottled = false; }, 150);

                let history = this.historyEl;
                if (!history && this.options.isSpotlight) {
                    history = document.querySelector('.lumina-chat-scroll-content[style*="display: block"]');
                }

                if (history) {
                    const lastEntry = history.querySelector('.lumina-dict-entry:last-child');
                    if (lastEntry) {
                        this.adjustEntryMargin(lastEntry, 'none');
                    }
                }
            }
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const text = input.value.trim();
                if (!text && this.selectedImages.length === 0) return;

                // Flash send effect on the input container
                const inputContainer = queryInPopup('.lumina-input-container');
                if (inputContainer) {
                    inputContainer.classList.remove('lumina-sending');
                    void inputContainer.offsetWidth;
                    inputContainer.classList.add('lumina-sending');
                    setTimeout(() => inputContainer.classList.remove('lumina-sending'), 900);
                }

                const { pr, tr } = getModes();
                if (pr) {
                    if (this.options.onSubmit) this.options.onSubmit(text, [], { mode: 'proofread' });
                    else this.handleProofreadSubmit(text);
                } else if (tr) {
                    if (this.options.onSubmit) this.options.onSubmit(text, [], { mode: 'translate' });
                    else this.handleTranslation(text);
                } else if (this._pendingWebSource) {
                    if (this.options.onSubmit && this.options.isSpotlight) {
                        this.options.onSubmit(text, [], { mode: 'websource', source: this._pendingWebSource });
                    } else {
                        this.openWebSource(this._pendingWebSource, text);
                    }
                    removeActiveModes();
                } else {
                    this._handleSubmit();
                }

                input.value = '';
                input.style.height = 'auto';
                checkExpand();
            }
        });

        input.addEventListener('paste', async (e) => {
            const items = e.clipboardData.items;
            for (const item of items) {
                if (item.type.startsWith('image/')) {
                    e.preventDefault();
                    const dataUrl = await this._fileToDataURL(item.getAsFile());
                    this.addImage(dataUrl);
                }
            }
            this._updateContainerState();
        });

        // Tools logic
        const toolsWrapper = queryInPopup('#tools-wrapper') || queryInPopup('.lumina-actions-dropdown-wrapper');
        const toolsToggle = queryInPopup('#tools-toggle') || queryInPopup('.lumina-plus-toggle');
        const toolsDropdown = queryInPopup('#tools-dropdown') || queryInPopup('.lumina-tools-dropdown');

        if (toolsWrapper && toolsToggle && !toolsToggle.dataset.setupDone) {
            toolsToggle.dataset.setupDone = 'true';

            const toggleTools = (show) => {
                const modelDropdown = queryInPopup('.lumina-model-dropdown');
                const modelWasActive = modelDropdown && modelDropdown.classList.contains('active');

                // Always close model dropdown when toggling tools
                if (modelDropdown) modelDropdown.classList.remove('active');

                const isActive = toolsWrapper.classList.contains('active') || (toolsDropdown && toolsDropdown.classList.contains('active'));
                if (show === undefined) {
                    // If model was active, force open tools
                    if (modelWasActive) {
                        show = true;
                    } else {
                        show = !isActive;
                    }
                }

                if (show) {
                    toolsWrapper.classList.add('active');
                    if (toolsDropdown) toolsDropdown.classList.add('active');
                } else {
                    toolsWrapper.classList.remove('active');
                    if (toolsDropdown) toolsDropdown.classList.remove('active');
                }
            };

            toolsToggle.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleTools();
            });

            window.addEventListener('click', (e) => {
                if ((toolsWrapper.classList.contains('active') || (toolsDropdown && toolsDropdown.classList.contains('active'))) && !toolsWrapper.contains(e.target)) {
                    toggleTools(false);
                }
            });
        }

        const removeActiveModes = () => {
            setProofread(false); setTranslate(false);
            this._pendingWebSource = null;

            ['#proofread-toggle', '#translate-toggle', '#websource-toggle', '.lumina-proofread-toggle', '.lumina-translate-toggle', '.lumina-websource-toggle'].forEach(sel => {
                const el = queryInPopup(sel); if (el) { el.style.display = 'none'; el.classList.remove('active'); }
            });

            // Clear active tool items
            popup.querySelectorAll('.lumina-tool-item').forEach(el => el.classList.remove('active'));

            checkExpand();
        };

        // Expose removeActiveModes so restoreInputState can call it
        this._removeActiveModes = removeActiveModes;

        const setupTool = (sel, toggleSel, modeSetter, placeholder) => {
            const item = queryInPopup(sel);
            if (item) item.addEventListener('click', (e) => {
                e.stopPropagation(); removeActiveModes(); modeSetter();
                item.classList.add('active'); // Set active tool item
                const toggle = queryInPopup(toggleSel) || queryInPopup(toggleSel.replace('#', '.lumina-'));
                if (toggle) { toggle.style.display = 'flex'; toggle.classList.add('active'); }
                input.placeholder = placeholder; input.focus();
                if (toolsWrapper) toolsWrapper.classList.remove('active');
                if (toolsDropdown) toolsDropdown.classList.remove('active');
                checkExpand();
            });
        };
        setupTool('[data-action="proofread"]', '#proofread-toggle', () => { setProofread(true); }, 'Enter text to proofread...');
        setupTool('[data-action="translate"]', '#translate-toggle', () => { setTranslate(true); }, 'Enter text to translate...');

        ['#proofread-toggle', '#translate-toggle', '#websource-toggle', '.lumina-proofread-toggle', '.lumina-translate-toggle', '.lumina-websource-toggle'].forEach(sel => {
            const toggle = queryInPopup(sel);
            if (toggle) toggle.addEventListener('click', (e) => {
                e.preventDefault(); e.stopPropagation(); removeActiveModes();
                input.placeholder = 'Ask anything...'; input.focus(); checkExpand();
            });
        });


        this._setupModelSelector(popup);
        const attachToggle = queryInPopup('#attach-toggle') || queryInPopup('.lumina-attach-toggle');
        if (attachToggle && this.fileInputEl) {
            this.fileInputEl.accept = '*/*';
            this.fileInputEl.multiple = true;
            attachToggle.addEventListener('click', (e) => { e.preventDefault(); this.fileInputEl.click(); });
            this.fileInputEl.addEventListener('change', async (e) => {
                for (const file of e.target.files) this.addFile(file);
                this.fileInputEl.value = '';
            });
        }

        const dropTarget = this.options.isSpotlight ? document.body : popup;
        this._setupFileDragDrop(dropTarget, input);

        const micBtn = queryInPopup('#mic-btn') || queryInPopup('.lumina-mic-btn');
        if (micBtn) this._setupMicButton(micBtn, input);
    }

    _setupFileDragDrop(dropZone, input) {
        if (!dropZone || dropZone.dataset.luminaDropSetup === 'true') return;
        dropZone.dataset.luminaDropSetup = 'true';

        let dragDepth = 0;
        const hasFiles = (dt) => !!dt && Array.from(dt.types || []).includes('Files');
        const inputContainer = this.container ? this.container.querySelector('.lumina-input-container') : null;
        const setDragState = (active) => {
            dropZone.classList.toggle('lumina-drag-over', active);
            if (inputContainer) inputContainer.classList.toggle('lumina-drag-over', active);
        };

        dropZone.addEventListener('dragenter', (e) => {
            if (!hasFiles(e.dataTransfer)) return;
            e.preventDefault();
            e.stopPropagation();
            dragDepth += 1;
            setDragState(true);
        });

        dropZone.addEventListener('dragover', (e) => {
            if (!hasFiles(e.dataTransfer)) return;
            e.preventDefault();
            e.stopPropagation();
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
            setDragState(true);
        });

        dropZone.addEventListener('dragleave', (e) => {
            if (!hasFiles(e.dataTransfer)) return;
            e.preventDefault();
            e.stopPropagation();
            dragDepth = Math.max(0, dragDepth - 1);
            if (dragDepth === 0) setDragState(false);
        });

        dropZone.addEventListener('drop', async (e) => {
            if (!hasFiles(e.dataTransfer)) return;
            e.preventDefault();
            e.stopPropagation();
            dragDepth = 0;
            setDragState(false);

            const files = Array.from(e.dataTransfer.files || []);
            if (!files.length) return;

            await this._handleDroppedFiles(files, input);
        });

        if (this.options.isSpotlight && !window.__luminaSpotlightDropGuardInstalled) {
            const globalDropGuard = (e) => {
                if (!hasFiles(e.dataTransfer)) return;
                e.preventDefault();
            };
            window.addEventListener('dragover', globalDropGuard);
            window.addEventListener('drop', globalDropGuard);
            window.__luminaSpotlightDropGuardInstalled = true;
        }
    }

    async _handleDroppedFiles(files, input) {
        if (!Array.isArray(files) || files.length === 0) return;
        for (let i = 0; i < files.length; i++) {
            await this.addFile(files[i]);
            if ((i + 1) % 2 === 0) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }
        this._updateContainerState();
        if (input && typeof input.focus === 'function') input.focus();
    }



    /**
     * Capture current input bar state for tab switching.
     * @returns {Object} Snapshot of current input state
     */
    getInputState() {
        return {
            text: this.inputEl ? this.inputEl.value : '',
            isProofreadMode: this.isProofreadMode || false,
            isTranslateMode: this.isTranslateMode || false,
            placeholder: this.inputEl ? this.inputEl.placeholder : 'Ask anything...'
        };
    }

    /**
     * Restore a previously saved input bar state (used by switchTab).
     * @param {Object} state - State snapshot from getInputState()
     */
    restoreInputState(state) {
        if (!this.inputEl) return;

        const queryInPopup = (selector) => this.container.querySelector(selector) || document.querySelector(selector);

        // 1. Always clear active modes first (ensures clean slate when switching tabs)
        if (this._removeActiveModes) this._removeActiveModes();

        // If no saved state (new/unvisited tab), just reset to clean state
        if (!state) {
            this.inputEl.value = '';
            this.inputEl.style.height = 'auto';
            this.inputEl.placeholder = 'Ask anything...';
            if (this._checkExpand) this._checkExpand();
            this._updateContainerState();
            return;
        }

        // 2. Restore text
        if (state.text !== undefined) {
            this.inputEl.value = state.text;
            this.inputEl.style.height = 'auto';
            this.inputEl.style.height = this.inputEl.scrollHeight + 'px';
        }

        // 3. Restore placeholder
        this.inputEl.placeholder = state.placeholder || 'Ask anything...';

        // 4. Restore mode
        if (state.isProofreadMode) {
            this.isProofreadMode = true;
            const toggle = queryInPopup('#proofread-toggle') || queryInPopup('.lumina-proofread-toggle');
            if (toggle) { toggle.style.display = 'flex'; toggle.classList.add('active'); }
            const toolItem = queryInPopup('[data-action="proofread"]');
            if (toolItem) toolItem.classList.add('active');
        } else if (state.isTranslateMode) {
            this.isTranslateMode = true;
            const toggle = queryInPopup('#translate-toggle') || queryInPopup('.lumina-translate-toggle');
            if (toggle) { toggle.style.display = 'flex'; toggle.classList.add('active'); }
            const toolItem = queryInPopup('[data-action="translate"]');
            if (toolItem) toolItem.classList.add('active');
        }


        // 6. Update expanded state
        if (this._checkExpand) this._checkExpand();
        this._updateContainerState();
    }

    _setupMentions() {
        // 1. Inject CSS
        if (!document.getElementById('lumina-mention-styles')) {
            const style = document.createElement('style');
            style.id = 'lumina-mention-styles';
            style.textContent = `
                .lumina-mention-popup {
                    position: absolute;
                    bottom: 100%;
                    left: 0;
                    width: 200px;
                    max-height: 150px;
                    overflow-y: auto;
                    background: var(--input-bg);
                    border: 1px solid var(--border-color);
                    border-radius: 8px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                    z-index: 10000;
                    display: none;
                    flex-direction: column;
                    padding: 4px;
                }
                .lumina-mention-popup.active {
                    display: flex;
                }
                .lumina-mention-item {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 6px 10px;
                    cursor: pointer;
                    border-radius: 6px;
                    font-size: 13px;
                    color: var(--text-primary);
                    transition: background 0.1s;
                }
                .lumina-mention-item:hover, .lumina-mention-item.selected {
                    background: var(--sidebar-hover);
                }
                .lumina-mention-item span:first-child {
                    font-size: 14px;
                }
            `;
            document.head.appendChild(style);
        }

        // 2. Create Popup
        const wrapper = this.inputEl.parentElement; // .lumina-input-bar usually
        if (!wrapper) return;

        // Ensure relative positioning for absolute popup
        const computed = window.getComputedStyle(wrapper);
        if (computed.position === 'static') wrapper.style.position = 'relative';

        let popup = wrapper.querySelector('.lumina-mention-popup');
        if (!popup) {
            popup = document.createElement('div');
            popup.className = 'lumina-mention-popup';
            wrapper.appendChild(popup);
        }

        // 3. Logic
        let selectedIndex = 0;

        const hidePopup = () => {
            popup.classList.remove('active');
            selectedIndex = 0;
        };

        const renderPopup = (list, type = 'variable') => {
            popup.innerHTML = '';
            list.forEach((p, idx) => {
                const el = document.createElement('div');
                el.className = `lumina-mention-item ${idx === selectedIndex ? 'selected' : ''}`;
                const icon = p.icon;
                const name = p.name;
                el.innerHTML = `<span>${icon}</span> <span>${this.escapeHTMLAttr(name)}</span>`;
                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    selectVariable(p);
                });
                popup.appendChild(el);
            });
            popup.classList.add('active');
        };

        const selectVariable = (v) => {
            const val = this.inputEl.value;
            const lastDollar = val.lastIndexOf('$');
            if (lastDollar !== -1) {
                const before = val.substring(0, lastDollar);
                const after = val.substring(this.inputEl.selectionEnd);
                this.inputEl.value = before + '$' + v.name + after;
            }
            hidePopup();
            this.inputEl.focus();
        };

        // Listeners
        this.inputEl.addEventListener('input', (e) => {
            const val = this.inputEl.value;
            const lastDollar = val.lastIndexOf('$');

            // Handle Variable Mentions ($)
            if (lastDollar !== -1) {
                const charBefore = lastDollar > 0 ? val[lastDollar - 1] : ' ';
                if (charBefore === ' ' || charBefore === '\n') {
                    const query = val.substring(lastDollar + 1).toLowerCase();
                    if (!query.includes(' ')) {
                        const variables = [
                            { name: 'SelectedText', icon: '📝' },
                            { name: 'Sentence', icon: '📝' },
                            { name: 'Paragraph', icon: '📝' },
                            { name: 'Container', icon: '📦' }
                        ];
                        const matches = variables.filter(v => v.name.toLowerCase().includes(query));
                        if (matches.length > 0) {
                            selectedIndex = 0;
                            renderPopup(matches, 'variable');
                            popup.dataset.matches = JSON.stringify(matches);
                            popup.dataset.type = 'variable';
                            return;
                        }
                    }
                }
            }

            hidePopup();
        });

        this.inputEl.addEventListener('keydown', (e) => {
            if (!popup.classList.contains('active')) return;

            const matches = JSON.parse(popup.dataset.matches || '[]');
            if (matches.length === 0) return;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                selectedIndex = (selectedIndex + 1) % matches.length;
                renderPopup(matches, popup.dataset.type);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                selectedIndex = (selectedIndex - 1 + matches.length) % matches.length;
                renderPopup(matches, popup.dataset.type);
            } else if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                selectVariable(matches[selectedIndex]);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                hidePopup();
            }
        });

        // Hide on click outside
        document.addEventListener('click', (e) => {
            if (!popup.contains(e.target) && e.target !== this.inputEl) {
                hidePopup();
            }
        });
    }

    _updateContainerState() {
        const queryInPopup = (selector) => this.container.querySelector(selector) || document.querySelector(selector);
        const container = queryInPopup('.lumina-input-container');
        if (container) {
            if (this.inputEl && (this.inputEl.value.trim().length > 0 || this.selectedImages.length > 0)) container.classList.add('has-content');
            else container.classList.remove('has-content');
            if (document.activeElement === this.inputEl) container.classList.add('focused');
            else container.classList.remove('focused');
        }
    }

    _setupModelSelector(popup) {
        const selector = popup.querySelector('.lumina-model-selector');
        if (!selector) return;
        const btn = selector.querySelector('.lumina-model-btn'), label = selector.querySelector('.lumina-current-model'), dropdown = selector.querySelector('.lumina-model-dropdown');
        if (!btn || !dropdown) return;

        // In Spotlight, model selection is tab-local. The active model is
        // stored on this instance (this.activeTabModel), initialized from lastUsedModel.
        // Changing here fires a custom event; spotlight.js handles per-tab storage.
        const self = this;

        const render = (data) => {
            const chain = data.modelChains?.text || [];

            // Determine active model: tab-local override > lastUsedModel > first in chain
            let currentModel = self.activeTabModel?.model;
            let currentProviderId = self.activeTabModel?.providerId;
            const lastUsed = data.lastUsedModel;
            if (!currentModel && lastUsed && lastUsed.model) {
                currentModel = lastUsed.model;
                currentProviderId = lastUsed.providerId;
                // Prime tab-local if not set yet
                if (!self.activeTabModel) self.activeTabModel = { model: currentModel, providerId: currentProviderId };
            }
            if (!currentModel && chain.length > 0) {
                currentModel = chain[0].model;
                currentProviderId = chain[0].providerId;
                if (!self.activeTabModel) self.activeTabModel = { model: currentModel, providerId: currentProviderId };
            }

            if (currentModel && label) label.textContent = currentModel;

            dropdown.innerHTML = '';
            if (chain.length === 0) { dropdown.innerHTML = '<div style="padding:8px;font-size:11px;">No models</div>'; return; }

            // Add header
            const header = document.createElement('div');
            header.style.cssText = 'padding:8px 12px; font-size:11px; font-weight:700; color:var(--lumina-text-secondary); text-transform:uppercase; letter-spacing:0.02em;';
            header.textContent = 'Model';
            dropdown.appendChild(header);

            chain.forEach((item) => {
                const el = document.createElement('button');
                const isActive = item.model === currentModel && item.providerId === currentProviderId;
                el.className = `lumina-model-item ${isActive ? 'active' : ''}`;
                el.innerHTML = `<div class="model-info"><span class="model-name">${item.model}</span></div>`;
                el.onclick = (e) => {
                    e.stopPropagation();
                    if (label) label.textContent = item.model;
                    dropdown.classList.remove('active');
                    dropdown.querySelectorAll('.lumina-model-item').forEach(b => b.classList.remove('active'));
                    el.classList.add('active');
                    // Store locally on this instance (tab-local, no storage write)
                    self.activeTabModel = { model: item.model, providerId: item.providerId };
                    // Persist globally so other tabs/popups see this as the new default
                    chrome.storage.local.set({ lastUsedModel: self.activeTabModel });
                    // Notify spotlight.js via custom event (tab-local, not global)
                    selector.dispatchEvent(new CustomEvent('lumina:spotlight-model-change', {
                        bubbles: true,
                        detail: { model: item.model, providerId: item.providerId }
                    }));
                };
                dropdown.appendChild(el);
            });
        };
        const fetchAndRender = () => chrome.storage.local.get(['providers', 'modelChains', 'lastUsedModel'], render);
        fetchAndRender();

        this.refreshModelSelector = fetchAndRender;


        // Hover Logic for Model Selector
        const selectorWrapper = selector;

        // Trigger on button click
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (dropdown.classList.contains('active')) {
                dropdown.classList.remove('active');
            } else {
                const toolsDropdown = popup.querySelector('.lumina-tools-dropdown');
                if (toolsDropdown) toolsDropdown.classList.remove('active');

                if (!dropdown.classList.contains('active')) fetchAndRender();
                dropdown.classList.add('active');
            }
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!selector.contains(e.target) && dropdown.classList.contains('active')) {
                dropdown.classList.remove('active');
            }
        });
    }

    _setupMicButton(btn, input) {
        let isRecording = false; let mr = null; let chunks = [];
        btn.addEventListener('click', async (e) => {
            e.preventDefault(); e.stopPropagation();
            if (isRecording) { if (mr) mr.stop(); return; }
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                mr = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm' });
                chunks = [];
                mr.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
                mr.onstop = () => {
                    stream.getTracks().forEach(t => t.stop());
                    btn.classList.remove('recording'); btn.classList.add('processing'); input.placeholder = 'Transcribing...';
                    const blob = new Blob(chunks, { type: mr.mimeType });
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        chrome.runtime.sendMessage({ action: 'transcribe_audio', audio: reader.result.split(',')[1], mimeType: blob.type }, (res) => {
                            btn.classList.remove('processing'); input.placeholder = 'Ask anything...';
                            if (res && res.text) { input.value += (input.value ? ' ' : '') + res.text; input.style.height = 'auto'; input.style.height = input.scrollHeight + 'px'; input.focus(); this._updateContainerState(); }
                        });
                    };
                    reader.readAsDataURL(blob); isRecording = false;
                };
                mr.start(); isRecording = true; btn.classList.add('recording'); input.placeholder = 'Recording...';
            } catch (err) { console.error(err); }
        });
    }

    _handleSubmit() {
        const text = this.inputEl.value.trim();
        if (!text && this.attachedFiles.length === 0) return;

        // Flash send effect on the input container
        const inputContainer = this.container ? this.container.querySelector('.lumina-input-container') : null;
        if (inputContainer) {
            inputContainer.classList.remove('lumina-sending');
            void inputContainer.offsetWidth;
            inputContainer.classList.add('lumina-sending');
            setTimeout(() => inputContainer.classList.remove('lumina-sending'), 900);
        }

        if (this.options.onSubmit) {
            const submitFiles = this.attachedFiles.map(file => ({ ...file }));
            this.options.onSubmit(text, submitFiles, {});
        }

        // Reset input
        this.inputEl.value = '';
        this.inputEl.style.height = 'auto';
        this.clearImages();
    }

    _fileToDataURL(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.readAsDataURL(file);
        });
    }

    _resolveImagePreviewSrc(item, src) {
        if (!src || typeof src !== 'string') return src;
        if (!src.startsWith('data:image/')) return src;

        if (item && typeof item === 'object' && item._luminaBlobUrl) {
            return item._luminaBlobUrl;
        }

        const blobUrl = this._createObjectUrlFromDataUrl(src);
        if (blobUrl && item && typeof item === 'object') {
            item._luminaBlobUrl = blobUrl;
        }
        return blobUrl || src;
    }

    _createObjectUrlFromDataUrl(dataUrl) {
        if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return null;
        const commaIdx = dataUrl.indexOf(',');
        if (commaIdx === -1) return null;

        const header = dataUrl.slice(0, commaIdx);
        const base64 = dataUrl.slice(commaIdx + 1);
        const mimeMatch = header.match(/^data:([^;]+);base64$/i);
        if (!mimeMatch) return null;

        try {
            const binary = atob(base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
            }
            const blob = new Blob([bytes], { type: mimeMatch[1] || 'application/octet-stream' });
            return this._createObjectUrl(blob);
        } catch (error) {
            console.warn('Failed to build preview blob URL:', error);
            return null;
        }
    }

    _createObjectUrl(blobOrFile) {
        if (!blobOrFile || !URL?.createObjectURL) return null;
        const objectUrl = URL.createObjectURL(blobOrFile);
        if (!this._luminaPreviewObjectUrls) this._luminaPreviewObjectUrls = new Set();
        this._luminaPreviewObjectUrls.add(objectUrl);
        return objectUrl;
    }

    _revokeObjectUrl(url) {
        if (!url || typeof url !== 'string' || !url.startsWith('blob:') || !URL?.revokeObjectURL) return;
        try {
            URL.revokeObjectURL(url);
        } catch (_) {
            // no-op
        }
        if (this._luminaPreviewObjectUrls) this._luminaPreviewObjectUrls.delete(url);
    }

    /**
     * Show stop button and hide mic button (called when streaming starts)
     * @param {Function} onStop - Callback to invoke when stop button is clicked
     */
    showStopButton(onStop = null) {
        let micBtn = null;
        let regenBtn = null;

        if (this.container) {
            micBtn = this.container.querySelector('#mic-btn') || this.container.querySelector('.lumina-mic-btn');
            regenBtn = this.container.querySelector('#lumina-regenerate-btn') || this.container.querySelector('.lumina-regenerate-btn');
        }

        // 1b. Try inputPaneEl (Spotlight split-mode: each pane has its own input area)
        if ((!micBtn || !regenBtn) && this.inputPaneEl) {
            if (!micBtn) micBtn = this.inputPaneEl.querySelector('#mic-btn') || this.inputPaneEl.querySelector('.lumina-mic-btn');
            if (!regenBtn) regenBtn = this.inputPaneEl.querySelector('#lumina-regenerate-btn') || this.inputPaneEl.querySelector('.lumina-regenerate-btn');
        }

        if ((!micBtn || !regenBtn) && typeof document !== 'undefined') {
            if (!micBtn) micBtn = document.getElementById('mic-btn') || document.querySelector('.lumina-mic-btn');
            if (!regenBtn) regenBtn = document.getElementById('lumina-regenerate-btn') || document.querySelector('.lumina-regenerate-btn');
        }

        if ((!micBtn || !regenBtn) && typeof window !== 'undefined' && window.parent && window.parent.document) {
            try {
                if (!micBtn) micBtn = window.parent.document.getElementById('mic-btn');
                if (!regenBtn) regenBtn = window.parent.document.getElementById('lumina-regenerate-btn');
            } catch (e) { /* Cross-origin blocked */ }
        }

        // Keep mic button visible
        if (micBtn) micBtn.style.display = 'flex';

        if (regenBtn) {
            regenBtn.classList.add('loading');
            regenBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>`;
            regenBtn.style.display = 'flex';

            // Store callback for abort
            this._stopCallback = onStop;
        }
    }

    /**
     * Hide stop button and reset regenerate button (called when streaming ends)
     */
    hideStopButton() {


        // Try multiple ways to find the button
        let regenBtn = null;

        // 1. Try container first
        if (this.container) {
            regenBtn = this.container.querySelector('#lumina-regenerate-btn') ||
                this.container.querySelector('.lumina-regenerate-btn');
        }

        // 1b. Try inputPaneEl (Spotlight split-mode: each pane has its own input area)
        if (!regenBtn && this.inputPaneEl) {
            regenBtn = this.inputPaneEl.querySelector('#lumina-regenerate-btn') ||
                this.inputPaneEl.querySelector('.lumina-regenerate-btn');
        }

        // 2. Fallback to document (for Spotlight where button is outside container)
        if (!regenBtn && typeof document !== 'undefined') {
            regenBtn = document.getElementById('lumina-regenerate-btn') ||
                document.querySelector('.lumina-regenerate-btn');
        }

        // 3. Try parent document if in iframe context
        if (!regenBtn && typeof window !== 'undefined' && window.parent && window.parent.document) {
            try {
                regenBtn = window.parent.document.getElementById('lumina-regenerate-btn');
            } catch (e) { /* Cross-origin blocked */ }
        }



        if (regenBtn) {
            regenBtn.classList.remove('loading');
            regenBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>`;

        } else {
        }
        this._stopCallback = null;
    }

    /**
     * Post-process a container after appending/loading an answer.
     * Handles highlighting, math, links, copy buttons, and Web Source revival.
     * Each expensive step is yielded to the main thread so input/selection stays
     * responsive during post-processing (especially important on Windows).
     * @param {HTMLElement} container
     */
    static async processContainer(container) {
        if (!container || container.__luminaProcessed) return;
        container.__luminaProcessed = true;

        // Optimized yield helper for cross-platform responsiveness (especially Windows)
        const yieldToMain = () => new Promise(resolve => {
            if (typeof window !== 'undefined' && window.requestIdleCallback) {
                // Tighter timeout for faster background work completion while staying responsive
                window.requestIdleCallback(() => resolve(), { timeout: 30 });
            } else {
                setTimeout(resolve, 1);
            }
        });

        // 1. Syntax highlighting — yield between each block
        if (typeof hljs !== 'undefined') {
            const blocks = Array.from(container.querySelectorAll('pre code'));
            for (const block of blocks) {
                await yieldToMain(); // Yield before EACH block for maximum fluidity
                try {
                    if (!block.__hljs_done) {
                        if (hljs.highlightElement) hljs.highlightElement(block);
                        else if (hljs.highlightBlock) hljs.highlightBlock(block);
                        block.__hljs_done = true;
                    }
                } catch (e) { }
            }
        }

        await yieldToMain();

        // 2. LaTeX rendering - ONLY if math delimiters are present (FAST CHECK)
        if (typeof renderMathInElement !== 'undefined') {
            const textContent = container.textContent;
            if (textContent.includes('$$') || textContent.includes('\\(') || textContent.includes('\\[') || textContent.includes('\\begin')) {
                try {
                    // Yield before potentially heavy math rendering
                    await yieldToMain();
                    renderMathInElement(container, {
                        delimiters: [
                            { left: '$$', right: '$$', display: true },
                            { left: '\\(', right: '\\)', display: false },
                            { left: '\\[', right: '\\]', display: true }
                        ],
                        throwOnError: false
                    });
                } catch (e) { }
            }
        }

        await yieldToMain();

        // 3. Ensure links open in new tab
        container.querySelectorAll('a').forEach(link => {
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
        });

        // 4. Inject copy buttons and wrap tables — now yielding
        await LuminaChatUI.injectCopyButtons(container);

        await yieldToMain();

        // 5. Re-attach thinking container toggle listeners
        container.querySelectorAll('.lumina-thinking-container').forEach(c => {
            const header = c.querySelector('.lumina-thinking-header');
            if (header && !header.__thinkingToggleBound) {
                header.__thinkingToggleBound = true;
                header.addEventListener('click', () => c.classList.toggle('collapsed'));
            }
        });

        await yieldToMain();


    }



    /**
     * Inject a copy button into every <pre> block inside the given container.
     * Yields between blocks to prevent UI lag.
     * @param {HTMLElement} container
     */
    static async injectCopyButtons(container) {
        if (!container) return;

        LuminaChatUI.wrapTables(container);

        const yieldToMain = () => new Promise(resolve => setTimeout(resolve, 10));
        const COPY_SVG = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>`;
        const CHECK_SVG = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`;

        const preBlocks = Array.from(container.querySelectorAll('pre'));
        for (const pre of preBlocks) {
            await yieldToMain();

            let wrapper = pre.parentElement && pre.parentElement.classList.contains('lumina-code-block-wrap')
                ? pre.parentElement
                : null;

            if (!wrapper) {
                wrapper = document.createElement('div');
                wrapper.className = 'lumina-code-block-wrap';
                pre.parentNode.insertBefore(wrapper, pre);
                wrapper.appendChild(pre);
            }

            // Remove any stale copy buttons
            pre.querySelectorAll('.lumina-code-copy-btn').forEach(old => old.remove());
            wrapper.querySelectorAll('.lumina-code-copy-btn').forEach(old => old.remove());

            const btn = document.createElement('button');
            btn.className = 'lumina-code-copy-btn';
            btn.innerHTML = COPY_SVG;

            const showSuccess = () => {
                btn.classList.add('copied');
                btn.innerHTML = CHECK_SVG;
                setTimeout(() => {
                    btn.classList.remove('copied');
                    btn.innerHTML = COPY_SVG;
                }, 2000);
            };

            btn.addEventListener('click', (e) => {
                e.stopPropagation();

                const codeEl = pre.querySelector('code');
                const text = (codeEl ? codeEl.innerText : pre.innerText).trim();

                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(text)
                        .then(showSuccess)
                        .catch(() => execCommandFallback(text));
                } else {
                    execCommandFallback(text);
                }

                function execCommandFallback(t) {
                    try {
                        const ta = document.createElement('textarea');
                        ta.value = t;
                        ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none;';
                        document.body.appendChild(ta);
                        ta.focus();
                        ta.select();
                        const ok = document.execCommand('copy');
                        ta.remove();
                        if (ok) showSuccess();
                    } catch (_) { /* silent fail */ }
                }
            });

            wrapper.appendChild(btn);
        }
    }

    /**
     * Wrap every table in a horizontal scroll container.
     * @param {HTMLElement} container
     */
    static wrapTables(container) {
        if (!container) return;

        container.querySelectorAll('table').forEach(table => {
            if (table.parentElement && table.parentElement.classList.contains('lumina-table-wrap')) {
                return;
            }

            const wrapper = document.createElement('div');
            wrapper.className = 'lumina-table-wrap';
            table.parentNode.insertBefore(wrapper, table);
            wrapper.appendChild(table);
        });
    }
}

if (typeof window !== 'undefined') {
    window.LuminaChatUI = LuminaChatUI;

}
