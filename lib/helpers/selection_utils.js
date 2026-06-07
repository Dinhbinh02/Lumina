window.LuminaSelection = {
    btn: null,
    inputPopup: null,
    inputField: null,
    text: '',
    context: '',
    range: null,
    onSubmit: null,
    onHide: null,
    onTranslate: null,
    shadowRoot: null,
    originalOverflow: '',
    commentMode: false,
    tooltip: null,
    inputBackdrop: null,
    _selectionScrollTargets: null,
    _selectionScrollHandler: null,
    currentAnnotationId: null,
    annotationMode: false,
    ANNOTATION_COLORS: ['#FFFB78', '#FFDE70', '#92ffaa', '#D1FF61', '#FFCAD7', '#B2D7FF'],

    expandToWordBoundaries() {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;

        const range = selection.getRangeAt(0);
        let originalText = selection.toString();

        let startNode = range.startContainer;
        let startOffset = range.startOffset;
        let endNode = range.endContainer;
        let endOffset = range.endOffset;

        
        if (startNode.nodeType !== Node.TEXT_NODE || endNode.nodeType !== Node.TEXT_NODE) return;

        
        
        
        
        while (originalText.length > 0 && /\s/.test(originalText[0])) {
            startOffset++;
            originalText = originalText.slice(1);
        }
        while (originalText.length > 0 && /\s/.test(originalText[originalText.length - 1])) {
            endOffset--;
            originalText = originalText.slice(0, -1);
        }

        if (originalText.length === 0) return;

        const startText = startNode.textContent;
        const endText = endNode.textContent;

        
        
        const isWordChar = (c) => /[a-zA-Z0-9\u00C0-\u1EF9]/.test(c);

        const startsWithWordChar = isWordChar(originalText[0]);
        const endsWithWordChar = isWordChar(originalText[originalText.length - 1]);

        
        while (startOffset > 0) {
            const prevChar = startText[startOffset - 1];
            if (/\s/.test(prevChar)) break; 

            if (startsWithWordChar) {
                
                if (!isWordChar(prevChar)) break;
            }
            
            startOffset--;
        }

        
        while (endOffset < endText.length) {
            const nextChar = endText[endOffset];
            if (/\s/.test(nextChar)) break; 

            if (endsWithWordChar) {
                
                if (!isWordChar(nextChar)) break;
            }
            
            endOffset++;
        }

        
        while (endOffset > startOffset && /\s/.test(endText[endOffset - 1])) {
            endOffset--;
        }
        while (startOffset < endOffset && /\s/.test(startText[startOffset])) {
            startOffset++;
        }

        try {
            const newRange = document.createRange();
            newRange.setStart(startNode, startOffset);
            newRange.setEnd(endNode, endOffset);

            selection.removeAllRanges();
            selection.addRange(newRange);

            
            this.range = newRange;
            this.text = selection.toString().trim();
        } catch (e) {
            console.error('[Lumina] expandToWordBoundaries failed:', e);
        }
    },

    expandInputToWordBoundaries(inputEl) {
        if (!inputEl) return;
        const value = inputEl.value;
        let start = inputEl.selectionStart;
        let end = inputEl.selectionEnd;
        if (start === undefined || end === undefined || start === end) return;

        // Trim leading and trailing whitespace
        while (start < end && /\s/.test(value[start])) {
            start++;
        }
        while (end > start && /\s/.test(value[end - 1])) {
            end--;
        }

        if (start === end) return;

        const isWordChar = (c) => /[a-zA-Z0-9\u00C0-\u1EF9]/.test(c);

        const startsWithWordChar = isWordChar(value[start]);
        const endsWithWordChar = isWordChar(value[end - 1]);

        // Expand start backwards
        while (start > 0) {
            const prevChar = value[start - 1];
            if (/\s/.test(prevChar)) break;
            if (startsWithWordChar && !isWordChar(prevChar)) break;
            start--;
        }

        // Expand end forwards
        while (end < value.length) {
            const nextChar = value[end];
            if (/\s/.test(nextChar)) break;
            if (endsWithWordChar && !isWordChar(nextChar)) break;
            end++;
        }

        try {
            inputEl.setSelectionRange(start, end);
            this.text = value.substring(start, end).trim();
            this.range = null;
        } catch (e) {
            console.error('[Lumina] expandInputToWordBoundaries failed:', e);
        }
    },

    sendRuntimeMessageSafely(message) {
        try {
            if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) return false;
            chrome.runtime.sendMessage(message, () => {
                const lastError = chrome.runtime.lastError;
                if (lastError) {
                    console.warn('[Lumina] runtime message dropped:', lastError.message);
                }
            });
            return true;
        } catch (error) {
            console.warn('[Lumina] runtime context unavailable:', error?.message || error);
            return false;
        }
    },

    async init(options = {}) {
        if (!document.body) {
            await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve));
        }

        this.shadowRoot = options.shadowRoot;
        if (!this.shadowRoot) {
            this.shadowRoot = document.body || document.documentElement;
        }

        this.onSubmit = options.onSubmit;
        this.onHide = options.onHide;
        this.onTranslate = options.onTranslate;
        this.onCommentAdded = options.onCommentAdded;

        
        this.cleanup();

        
        this.btn = document.createElement('div');
        this.btn.id = 'lumina-action-bar';
        this.btn.style.cssText = 'pointer-events: auto; display: none; visibility: hidden;';
        const translateLogoSrc = (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.getURL === 'function')
            ? chrome.runtime.getURL('assets/icons/lumina/Google_Translate_logo.svg.png')
            : 'assets/icons/lumina/Google_Translate_logo.svg.png';

        this.btn.innerHTML = `
            <div class="lumina-action-item lumina-action-audio" title="Speak">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width: 16px !important; height: 16px !important;"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>
            </div>
            <div class="lumina-action-item lumina-action-translate" title="Translate">
                <img class="lumina-translate-logo" src="${translateLogoSrc}" alt="" aria-hidden="true" />
            </div>
            <div class="lumina-action-item lumina-action-ask">
                <span>Ask</span>
            </div>
        `;

        
        this.inputPopup = document.createElement('div');
        this.inputPopup.id = 'lumina-ask-input-popup';
        this.inputPopup.style.cssText = 'pointer-events: auto; display: none; visibility: hidden;';
        this.inputPopup.innerHTML = `
            <div class="lumina-ask-input-wrapper">
                <div class="lumina-ask-input-field" contenteditable="true" data-placeholder="Ask anything..."><span class="lumina-selected-text-tag" contenteditable="false">SelectedText</span></div>
                <div class="lumina-tooltip"></div>
            </div>
        `;
        this.inputField = this.inputPopup.querySelector('.lumina-ask-input-field');
        let tooltip = this.inputPopup.querySelector('.lumina-tooltip');

        


        
        this.btn.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
        this.btn.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation();

            
            if (this.annotationMode) {
                const swatch = e.target.closest('.lumina-color-swatch');
                const clearBtn = e.target.closest('.lumina-clear-highlight');
                if (clearBtn) {
                    if (window.LuminaAnnotation) {
                        window.LuminaAnnotation.removeHighlightById(this.currentAnnotationId);
                    }
                    this.hide();
                } else if (swatch) {
                    const color = swatch.dataset.color;
                    if (window.LuminaAnnotation) {
                        window.LuminaAnnotation.updateHighlightColor(this.currentAnnotationId, color);
                    }
                    this.hide();
                }
                return;
            }

            const audioBtn = e.target.closest('.lumina-action-audio');
            const translateBtn = e.target.closest('.lumina-action-translate');
            const commentBtn = e.target.closest('.lumina-action-comment');
            const askBtn = e.target.closest('.lumina-action-ask');

            if (audioBtn) {
                if (this.onSubmit) this.onSubmit(null, this.text, false, null, null, false, true);
            } else if (translateBtn) {
                if (this.onSubmit) this.onSubmit(`Translate: ${this.text}`, this.text, false, this.sourceEntry, this.range, true);
                const selection = window.getSelection();
                if (selection) selection.removeAllRanges();
                this.hide();
            } else if (commentBtn) {
                if (this.onSubmit) this.onSubmit(`Define: ${this.text}`, this.text, true, this.sourceEntry);
                const selection = window.getSelection();
                if (selection) selection.removeAllRanges();
                this.hide();
            } else if (commentBtn) {
                this.showInput();
            } else if (askBtn) {
                this.showInput();
            } else {
                
                this.showInput();
            }
        });

        
        this.inputField.addEventListener('keydown', (e) => {
            const isSelectAll = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a';

            if (isSelectAll) {
                e.preventDefault();
                const selection = window.getSelection();
                const range = document.createRange();
                range.selectNodeContents(this.inputField);
                selection.removeAllRanges();
                selection.addRange(range);
                return;
            }

            if (e.key === 'Backspace' || e.key === 'Delete') {
                const selection = window.getSelection();
                if (selection.rangeCount > 0) {
                    const range = selection.getRangeAt(0);
                    const tag = this.inputField.querySelector('.lumina-selected-text-tag');

                    if (tag) {
                        
                        
                        if (!range.collapsed && range.intersectsNode(tag)) {
                            e.preventDefault();
                            
                            const nodes = Array.from(this.inputField.childNodes);
                            nodes.forEach(node => {
                                if (node.nodeType === Node.TEXT_NODE) {
                                    node.remove();
                                } else if (node.nodeType === Node.ELEMENT_NODE && node.getAttribute('contenteditable') !== 'false') {
                                    
                                    node.remove();
                                }
                            });
                            
                            const endNode = document.createTextNode('\u00A0');
                            this.inputField.appendChild(endNode);

                            
                            const selection = window.getSelection();
                            const newRange = document.createRange();
                            newRange.setStart(endNode, 1);
                            newRange.collapse(true);
                            selection.removeAllRanges();
                            selection.addRange(newRange);
                            return;
                        }

                        if (range.collapsed && range.intersectsNode(tag)) {
                            e.preventDefault();
                            return;
                        }
                        if (range.collapsed) {
                            const preRange = range.cloneRange();
                            preRange.setStart(this.inputField, 0);
                            preRange.setEnd(range.startContainer, range.startOffset);

                            const contents = preRange.cloneContents();
                            const hasTag = contents.querySelector('[contenteditable="false"]');

                            contents.querySelectorAll('[contenteditable="false"]').forEach(el => el.remove());
                            const textBefore = contents.textContent.replace(/\u00A0/g, ' ').trim();

                            if (hasTag && textBefore === '') {
                                e.preventDefault();
                                return;
                            }
                        }
                    }
                }
            }

            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                
                const textClone = this.inputField.cloneNode(true);
                textClone.querySelectorAll('[contenteditable="false"]').forEach(el => el.remove());
                const query = textClone.textContent.trim();

                if (this.commentMode) {
                    if (query) {
                        this.handleCommentSubmit(query);
                    }
                    this.hide();
                    return;
                }

                if (query || this.text) {
                    const fullQuestion = query ? `"${this.text}" ${query}` : `"${this.text}"`;
                    if (this.onSubmit) this.onSubmit(fullQuestion, fullQuestion, false, this.sourceEntry, this.range);

                    const selection = window.getSelection();
                    if (selection) selection.removeAllRanges();

                    this.hide();
                }
            } else if (e.key === 'Escape') {
                this.hide();
            } else if (e.key === 'Delete') {
                
                const selection = window.getSelection();
                if (selection.rangeCount > 0 && selection.isCollapsed) {
                    const range = selection.getRangeAt(0);
                    const postRange = range.cloneRange();
                    postRange.setStart(range.startContainer, range.startOffset);
                    postRange.setEnd(this.inputField, this.inputField.childNodes.length);

                    const contents = postRange.cloneContents();
                    if (contents.querySelector('[contenteditable="false"]')) {
                        
                        contents.querySelectorAll('[contenteditable="false"]').forEach(el => el.remove());
                        if (contents.textContent.trim() === '') {
                            e.preventDefault();
                            return;
                        }
                    }
                }
            }
        });

        this.inputField.addEventListener('cut', (e) => {
            const selection = window.getSelection();
            if (selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                const tag = this.inputField.querySelector('.lumina-selected-text-tag');
                if (tag && range.intersectsNode(tag)) {
                    e.preventDefault();
                }
            }
        });

        
        tooltip = this.inputPopup.querySelector('.lumina-tooltip');

        if (tooltip && this.inputField) {
            this.inputField.addEventListener('click', (e) => {
                const tagEl = e.target.closest('.lumina-selected-text-tag');
                if (!tagEl || !this.text) return;

                e.preventDefault();
                e.stopPropagation();

                
                if (tooltip.style.display === 'block') {
                    tooltip.style.display = 'none';
                    tooltip.style.visibility = 'hidden';
                    return;
                }

                tooltip.textContent = this.text;
                tooltip.style.display = 'block';
                tooltip.style.visibility = 'visible';
                tooltip.style.opacity = '1';
                tooltip.style.left = '0'; 

                requestAnimationFrame(() => {
                    const tagRect = tagEl.getBoundingClientRect();
                    const tooltipWidth = tooltip.offsetWidth;
                    const tooltipHeight = tooltip.offsetHeight;
                    const viewportPadding = 10;

                    tooltip.style.maxWidth = `${Math.max(220, Math.min(420, window.innerWidth - 24))}px`;
                    tooltip.style.maxHeight = '240px';

                    let topPosition = tagRect.top - tooltipHeight - 12;
                    if (topPosition < viewportPadding) {
                        topPosition = tagRect.bottom + 12;
                    }

                    const centeredLeft = tagRect.left + (tagRect.width / 2) - (tooltipWidth / 2);
                    const clampedLeft = Math.max(viewportPadding, Math.min(centeredLeft, window.innerWidth - tooltipWidth - viewportPadding));

                    tooltip.style.left = `${clampedLeft}px`;
                    tooltip.style.top = `${topPosition}px`;
                });
            });

            
            document.addEventListener('mousedown', (e) => {
                if (!e.target.closest('.lumina-selected-text-tag')) {
                    tooltip.style.display = 'none';
                    tooltip.style.visibility = 'hidden';
                }
            }, true);
        }

        this.inputPopup.addEventListener('mousedown', (e) => e.stopPropagation());

        this.shadowRoot.appendChild(this.btn);
        this.shadowRoot.appendChild(this.inputPopup);


        
        window.addEventListener('scroll', () => {
            if (this.btn && this.btn.style.display === 'flex') {
                this.updatePosition(this.btn);
            }
        }, { passive: true });
    },

    handleCommentSubmit(commentText) {
        if (!this.range) return;

        try {
            
            
            const targetSelector = '.lumina-can-comment, .lumina-proofread-editable, .lumina-chat-answer';
            const common = this.range.commonAncestorContainer;
            const container = common.nodeType === 1 ? common : common.parentNode;
            let entryAnswer = container.closest(targetSelector);

            
            
            if (!entryAnswer) {
                const startNode = this.range.startContainer;
                const startEl = startNode.nodeType === 1 ? startNode : startNode.parentNode;
                entryAnswer = startEl.closest(targetSelector);
            }

            if (!entryAnswer) {
                console.warn('[Lumina] Selection target not found (tried ancestor and start node).');
                return;
            }

            
            if (!entryAnswer.contains(this.range.startContainer) || !entryAnswer.contains(this.range.endContainer)) {
                
                let target = entryAnswer.querySelector('.lumina-answer-content') || entryAnswer;

                
                
                const pTags = target.querySelectorAll('p');
                if (pTags.length === 1) {
                    target = pTags[0];
                }

                const newRange = document.createRange();
                newRange.selectNodeContents(target);
                this.range = newRange;
            }

            
            const span = document.createElement('span');
            span.className = 'lumina-comment-highlight';
            span.dataset.comment = commentText;

            try {
                
                this.range.surroundContents(span);
            } catch (e) {
                
                
                
                span.appendChild(this.range.extractContents());
                this.range.insertNode(span);
            }

            
            if (this.onCommentAdded) {
                const entry = span.closest('.lumina-dict-entry');
                this.onCommentAdded(span, entry, commentText);
            }
        } catch (err) {
            console.error('[Lumina] Error in handleCommentSubmit:', err);
        }
    },

    cleanup() {
        this.setScrollLock(false);
        this._unbindSelectionScrollTracking();
        if (this.shadowRoot) {
            this.shadowRoot.querySelectorAll('#lumina-action-bar, #lumina-ask-input-popup, .lumina-overlay-backdrop').forEach(el => el.remove());
        }
        const existingTooltip = document.querySelector('.lumina-comment-tooltip');
        if (existingTooltip) existingTooltip.remove();
    },

    updatePosition(element = this.btn) {
        if (!element) return;

        let rect = null;
        if (this.isInsideEditable()) {
            if (this.mouseCoords) {
                rect = {
                    top: this.mouseCoords.y,
                    bottom: this.mouseCoords.y,
                    left: this.mouseCoords.x,
                    right: this.mouseCoords.x,
                    width: 0,
                    height: 0
                };
            } else {
                const active = this.getDeepActiveElement();
                if (active) {
                    rect = active.getBoundingClientRect();
                }
            }
        } else {
            if (!this.range) return;
            const firstLineRect = this.getSelectionFirstLineRect(this.range);
            if (firstLineRect && firstLineRect.width > 0) {
                rect = firstLineRect;
            } else {
                rect = this.range.getBoundingClientRect();
            }
        }

        if (!rect) {
            this.hide();
            return;
        }

        const top = rect.top;
        const left = rect.left;
        const btnWidth = element.offsetWidth;
        const btnHeight = element.offsetHeight || 34;
        const margin = 5;

        let finalTop = top - btnHeight - margin;
        let finalLeft = left;

        if (finalTop < 10) {
            finalTop = rect.bottom + margin;
        }

        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        if (finalLeft < 10) finalLeft = 10;
        if (finalLeft + btnWidth > viewportWidth - 10) finalLeft = Math.max(10, viewportWidth - btnWidth - 10);

        if (finalTop < 10) finalTop = 10;
        if (finalTop + btnHeight > viewportHeight - 10) finalTop = Math.max(10, viewportHeight - btnHeight - 10);

        element.style.left = finalLeft + 'px';
        element.style.top = finalTop + 'px';
    },

    show(x, y, text, range) {
        if (!this.btn) return;
        this.text = text;
        this.range = range;

        
        this.commentMode = false;
        let node = range.startContainer;
        let proofreadNode = null;
        while (node && node !== document.documentElement) {
            if (node.nodeType === 1 && node.classList.contains('lumina-proofread-editable')) {
                proofreadNode = node;
                break;
            }
            node = node.parentNode || (node.host && node.host.nodeType === 1 ? node.host : null);
        }

        if (proofreadNode) {
            
            const entry = proofreadNode.closest('.lumina-dict-entry');
            if (entry) {
                const container = entry.closest('.lumina-chat-scroll-content') ||
                    entry.closest('.lumina-chat-history') ||
                    document.body;
                const allEntries = container.querySelectorAll('.lumina-dict-entry');
                if (allEntries.length > 0 && allEntries[allEntries.length - 1] === entry) {
                    this.commentMode = true;
                }
            }
        }

        
        this.sourceEntry = null;
        if (range && range.startContainer) {
            const node = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
            this.sourceEntry = node ? node.closest('.lumina-dict-entry') : null;
        }

        if (this.commentMode) {
            this.btn.classList.add('lumina-comment-mode');
        } else {
            this.btn.classList.remove('lumina-comment-mode');
        }

        this.btn.style.display = 'flex';
        this.btn.style.visibility = 'visible';
        this.updatePosition(this.btn);
        this._bindSelectionScrollTracking();
    },

    showInput() {
        if (!this.inputPopup || !this.btn) return;

        this.btn.style.display = 'none';
        this.btn.style.visibility = 'hidden';
        this.inputPopup.style.display = 'flex';
        this.inputPopup.style.visibility = 'visible';

        if (this.inputField) {
            
            this.inputField.innerHTML = '';

            
            

            
            if (this.commentMode) {
                this.inputField.setAttribute('title', 'Add a comment...');
            } else {
                this.inputField.removeAttribute('title');
            }

            
            setTimeout(() => {
                this.inputField.focus();
                const selection = window.getSelection();
                const range = document.createRange();
                range.selectNodeContents(this.inputField);
                range.collapse(false);
                selection.removeAllRanges();
                selection.addRange(range);
            }, 10);
        }

        this.updatePosition(this.inputPopup);
        this._bindSelectionScrollTracking();
        this.setScrollLock(true);
    },

    showAnnotationMenu(targetElOrRange, id, currentColor) {
        if (!this.btn || !targetElOrRange) return;
        this.currentAnnotationId = id;
        this.annotationMode = true;

        if (targetElOrRange instanceof Range) {
            this.range = targetElOrRange;
        } else {
            const range = document.createRange();
            range.selectNodeContents(targetElOrRange);
            this.range = range;
        }

        
        let paletteHtml = `
            <div class="lumina-color-swatch lumina-clear-highlight" title="Clear Highlight">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </div>
        `;

        this.ANNOTATION_COLORS.forEach(color => {
            const isActive = color.toLowerCase() === (currentColor || '').toLowerCase();
            paletteHtml += `
                <div class="lumina-color-swatch ${isActive ? 'active' : ''}" 
                     style="background-color: ${color}" 
                     data-color="${color}" 
                     title="Change Color">
                </div>
            `;
        });

        this.btn.innerHTML = paletteHtml;
        this.btn.style.display = 'flex';
        this.btn.style.visibility = 'visible';
        this.updatePosition();
    },

    resetActionBar() {
        if (!this.btn) return;
        this.annotationMode = false;
        this.currentAnnotationId = null;

        const translateLogoSrc = (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.getURL === 'function')
            ? chrome.runtime.getURL('assets/icons/lumina/Google_Translate_logo.svg.png')
            : 'assets/icons/lumina/Google_Translate_logo.svg.png';

        this.btn.innerHTML = `
            <div class="lumina-action-item lumina-action-audio" title="Speak">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width: 16px !important; height: 16px !important;"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>
            </div>
            <div class="lumina-action-item lumina-action-translate" title="Translate">
                <img class="lumina-translate-logo" src="${translateLogoSrc}" alt="" aria-hidden="true" />
            </div>
            <div class="lumina-action-item lumina-action-ask">
                <span>Ask</span>
            </div>
        `;
    },

    hide() {
        if (this.btn) {
            this.btn.style.display = 'none';
            this.btn.style.visibility = 'hidden';
            if (this.annotationMode) {
                this.resetActionBar();
            }
        }
        if (this.inputPopup) {
            this.inputPopup.style.display = 'none';
            this.inputPopup.style.visibility = 'hidden';
        }
        this.text = '';
        this.range = null;
        this._unbindSelectionScrollTracking();
        this.setScrollLock(false);
        if (this.onHide) this.onHide();
    },

    setScrollLock(lock) {
        if (lock) {
            if (!this.inputBackdrop) {
                this.inputBackdrop = document.createElement('div');
                this.inputBackdrop.className = 'lumina-overlay-backdrop';
                this.inputBackdrop.style.zIndex = '2147483646';
                this.inputBackdrop.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
                this.inputBackdrop.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
                this.inputBackdrop.addEventListener('click', () => this.hide());
                this.shadowRoot.appendChild(this.inputBackdrop);
            }

            this.inputBackdrop.style.display = 'block';

            this.originalOverflowBody = document.body.style.overflow;
            this.originalOverflowHtml = document.documentElement.style.overflow;

            document.body.style.overflow = 'hidden';
            document.documentElement.style.overflow = 'hidden';

            
            document.querySelectorAll('.lumina-chat-scroll-content').forEach(el => {
                el.style.overflow = 'hidden';
            });

            
            this._scrollPreventer = (e) => {
                
                if (e.target.closest('.lumina-ask-input-field') || e.target.closest('.lumina-tooltip')) {
                    return;
                }
                e.preventDefault();
            };
            window.addEventListener('wheel', this._scrollPreventer, { passive: false });
            window.addEventListener('touchmove', this._scrollPreventer, { passive: false });
        } else {
            document.body.style.overflow = this.originalOverflowBody || '';
            document.documentElement.style.overflow = this.originalOverflowHtml || '';

            document.querySelectorAll('.lumina-chat-scroll-content').forEach(el => {
                el.style.overflow = 'auto'; 
            });

            if (this._scrollPreventer) {
                window.removeEventListener('wheel', this._scrollPreventer);
                window.removeEventListener('touchmove', this._scrollPreventer);
                this._scrollPreventer = null;
            }

            if (this.inputBackdrop) {
                this.inputBackdrop.style.display = 'none';
            }
        }
    },

    getSelectionFirstLineRect(range) {
        const rects = range.getClientRects();
        if (rects.length > 0) {
            let firstRect = rects[0];
            for (let i = 0; i < rects.length; i++) {
                if (rects[i].width > 1) {
                    firstRect = rects[i];
                    break;
                }
            }
            return firstRect;
        }
        return range.getBoundingClientRect();
    },

    getDeepActiveElement(root = document) {
        if (typeof LuminaChatUI !== 'undefined' && typeof LuminaChatUI.getDeepActiveElement === 'function') {
            return LuminaChatUI.getDeepActiveElement(root);
        }
        let active = root.activeElement;
        while (active && active.shadowRoot) {
            active = active.shadowRoot.activeElement;
        }
        return active;
    },

    _isScrollableElement(element) {
        if (!element || element === document.body || element === document.documentElement) {
            return false;
        }

        try {
            const style = window.getComputedStyle(element);
            return ['auto', 'scroll', 'overlay'].includes(style.overflowY) || ['auto', 'scroll', 'overlay'].includes(style.overflowX);
        } catch (error) {
            return false;
        }
    },

    _getSelectionScrollTargets(range) {
        const targets = new Set([window]);

        const addAncestors = (node) => {
            let current = node;
            while (current) {
                if (current.nodeType === 1 && this._isScrollableElement(current)) {
                    targets.add(current);
                }
                current = current.parentNode || (current.host && current.host.nodeType === 1 ? current.host : null);
            }
        };

        if (range && range.commonAncestorContainer) {
            addAncestors(range.commonAncestorContainer);
        }

        const scrollingElement = document.scrollingElement || document.documentElement || document.body;
        if (scrollingElement) targets.add(scrollingElement);

        return Array.from(targets);
    },

    _unbindSelectionScrollTracking() {
        if (!this._selectionScrollTargets || !this._selectionScrollHandler) return;

        for (const target of this._selectionScrollTargets) {
            try {
                target.removeEventListener('scroll', this._selectionScrollHandler);
            } catch (error) { }
        }

        this._selectionScrollTargets = null;
        this._selectionScrollHandler = null;
    },

    _bindSelectionScrollTracking() {
        this._unbindSelectionScrollTracking();

        const targets = this._getSelectionScrollTargets(this.range);
        if (!targets.length) return;

        this._selectionScrollTargets = targets;
        this._selectionScrollHandler = () => {
            if (this.btn && this.btn.style.display === 'flex') {
                this.updatePosition(this.btn);
            }
            if (this.inputPopup && this.inputPopup.style.display === 'flex') {
                this.updatePosition(this.inputPopup);
            }
        };

        for (const target of targets) {
            target.addEventListener('scroll', this._selectionScrollHandler, { passive: true });
        }
    },

    isInsideEditable() {
        const sel = window.getSelection();
        try {
            if (sel && sel.rangeCount > 0 && sel.toString().trim().length > 0) {
                let node = sel.anchorNode;
                while (node && node !== document.documentElement) {
                    if (node.nodeType === 1) {
                        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(node.tagName) ||
                            node.isContentEditable || node.contentEditable === 'true' ||
                            node.getAttribute('contenteditable') === 'true' ||
                            node.getAttribute('role') === 'textbox'
                        ) return true;
                    }
                    node = node.parentNode || (node.host && node.host.nodeType === 1 ? node.host : null);
                }
            }
        } catch (e) { return false; }

        const active = this.getDeepActiveElement();
        return active && (
            ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName) ||
            active.isContentEditable ||
            active.getAttribute('contenteditable') === 'true' ||
            active.getAttribute('role') === 'textbox'
        );
    },

    getSelectionRelativeOffsets(container) {
        try {
            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;

            const range = selection.getRangeAt(0);
            if (!container.contains(range.startContainer) || !container.contains(range.endContainer)) {
                return null;
            }

            const getOffset = (targetNode, targetOffset) => {
                let offset = 0;
                const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
                while (walker.nextNode()) {
                    const node = walker.currentNode;
                    if (node === targetNode) {
                        return offset + targetOffset;
                    }
                    offset += node.textContent.length;
                    if (offset > 10000) break; 
                }
                return offset;
            };

            return {
                start: getOffset(range.startContainer, range.startOffset),
                end: getOffset(range.endContainer, range.endOffset)
            };
        } catch (e) {
            return null;
        }
    },

    restoreSelectionFromOffsets(container, offsets) {
        if (!offsets) return;
        try {
            const selection = window.getSelection();
            const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
            let currentOffset = 0;
            let startNode, startOffset, endNode, endOffset;

            while (walker.nextNode()) {
                const node = walker.currentNode;
                const len = node.textContent.length;

                if (!startNode && currentOffset + len >= offsets.start) {
                    startNode = node;
                    startOffset = offsets.start - currentOffset;
                }
                if (!endNode && currentOffset + len >= offsets.end) {
                    endNode = node;
                    endOffset = offsets.end - currentOffset;
                }

                if (startNode && endNode) break;
                currentOffset += len;
                if (currentOffset > 10000) break; 
            }

            if (startNode && endNode) {
                const range = document.createRange();
                range.setStart(startNode, startOffset);
                range.setEnd(endNode, endOffset);
                selection.removeAllRanges();
                selection.addRange(range);
            }
        } catch (e) {
            
        }
    }
};
