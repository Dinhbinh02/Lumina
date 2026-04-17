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

        // 1. Cleanup existing
        this.cleanup();

        // 2. Create Action Bar
        this.btn = document.createElement('div');
        this.btn.id = 'lumina-action-bar';
        this.btn.style.cssText = 'pointer-events: auto; display: none; visibility: hidden;';
        const dictionaryLogoSrc = (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.getURL === 'function')
            ? chrome.runtime.getURL('assets/icons/lumina/cambridge.svg')
            : 'assets/icons/lumina/cambridge.svg';
        
        this.btn.innerHTML = `
            <div class="lumina-action-item lumina-action-highlight" title="Highlight Selection">
                <div class="lumina-highlight-icon-circle"></div>
            </div>
            <div class="lumina-action-item lumina-action-dict" title="Define in Dictionary">
                <img class="lumina-dictionary-logo" src="${dictionaryLogoSrc}" alt="" aria-hidden="true" />
            </div>
            <div class="lumina-action-item lumina-action-ask">
                <span>Ask</span>
            </div>
        `;

        // 3. Create Input Popup
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

        // Tooltip listeners removed - now handled by LuminaCommon in common.js


        // Action Bar Listeners
        this.btn.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
        this.btn.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation();
            
            // Handle Annotation Palette clicks
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

            const highlightBtn = e.target.closest('.lumina-action-highlight');
            const dictBtn = e.target.closest('.lumina-action-dict');
            const commentBtn = e.target.closest('.lumina-action-comment');
            const askBtn = e.target.closest('.lumina-action-ask');

            if (highlightBtn) {
                if (window.LuminaAnnotation && this.range) {
                    const color = '#FFFB78'; // Default yellow
                    const id = Date.now().toString();
                    window.LuminaAnnotation.applyHighlight(this.range, color, id);
                    window.LuminaAnnotation.saveHighlight(this.range, color, id);
                }
                this.hide();
            } else if (dictBtn) {
                if (this.onSubmit) this.onSubmit(`Define: ${this.text}`, this.text, true);
                this.hide();
            } else if (commentBtn) {
                this.showInput();
            } else if (askBtn) {
                this.showInput();
            } else {
                // Fallback for clicking the bar itself
                this.showInput();
            }
        });

        // Input Listeners
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
                        // Improved protection: If a range is selected and contains the tag, 
                        // we manually clear the editable text but keep the tag.
                        if (!range.collapsed && range.intersectsNode(tag)) {
                            e.preventDefault();
                            // Clear all text nodes in the field but keep elements
                            const nodes = Array.from(this.inputField.childNodes);
                            nodes.forEach(node => {
                                if (node.nodeType === Node.TEXT_NODE) {
                                    node.remove();
                                } else if (node.nodeType === Node.ELEMENT_NODE && node.getAttribute('contenteditable') !== 'false') {
                                    // Also remove any editable elements that might have been created (e.g. <br>)
                                    node.remove();
                                }
                            });
                            // Ensure there's a text node at the end for the cursor to land on
                            const endNode = document.createTextNode('\u00A0');
                            this.inputField.appendChild(endNode);

                            // Put cursor at the end of the new node, collapsed
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
                // Get text only (excluding all non-editable prefixes)
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
                    if (this.onSubmit) this.onSubmit(fullQuestion, fullQuestion, false);
                    this.hide();
                }
            } else if (e.key === 'Escape') {
                this.hide();
            } else if (e.key === 'Delete') {
                // Forward delete protection
                const selection = window.getSelection();
                if (selection.rangeCount > 0 && selection.isCollapsed) {
                    const range = selection.getRangeAt(0);
                    const postRange = range.cloneRange();
                    postRange.setStart(range.startContainer, range.startOffset);
                    postRange.setEnd(this.inputField, this.inputField.childNodes.length);
                    
                    const contents = postRange.cloneContents();
                    if (contents.querySelector('[contenteditable="false"]')) {
                        // Check if there's ONLY protected content after the cursor
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

        // Custom Tooltip Logic - Use delegation on the input field for high reliability with dynamic content
        tooltip = this.inputPopup.querySelector('.lumina-tooltip');

        if (tooltip && this.inputField) {
            this.inputField.addEventListener('click', (e) => {
                const tagEl = e.target.closest('.lumina-selected-text-tag');
                if (!tagEl || !this.text) return;

                e.preventDefault();
                e.stopPropagation();

                // Toggle logic
                if (tooltip.style.display === 'block') {
                    tooltip.style.display = 'none';
                    tooltip.style.visibility = 'hidden';
                    return;
                }

                tooltip.textContent = this.text;
                tooltip.style.display = 'block';
                tooltip.style.visibility = 'visible';
                tooltip.style.opacity = '1';
                tooltip.style.left = '0'; // Reset for measurement

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

            // Hide when clicking outside
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


        // Scroll Tracking
        window.addEventListener('scroll', () => {
            if (this.btn && this.btn.style.display === 'flex') {
                this.updatePosition(this.btn);
            }
        }, { passive: true });
    },

    handleCommentSubmit(commentText) {
        if (!this.range) return;

        try {
            // 1. Validation: Ensure the range is contained within a commentable answer
            // We check for both modern and legacy classes for backward compatibility
            const targetSelector = '.lumina-can-comment, .lumina-proofread-editable, .lumina-chat-answer';
            const common = this.range.commonAncestorContainer;
            const container = common.nodeType === 1 ? common : common.parentNode;
            let entryAnswer = container.closest(targetSelector);
            
            // Triple-click / Leaky selection fallback: 
            // If the common ancestor is too broad, look at where the selection started
            if (!entryAnswer) {
                const startNode = this.range.startContainer;
                const startEl = startNode.nodeType === 1 ? startNode : startNode.parentNode;
                entryAnswer = startEl.closest(targetSelector);
            }

            if (!entryAnswer) {
                console.warn('[Lumina] Selection target not found (tried ancestor and start node).');
                return;
            }

            // Snapping: If boundaries leak outside (common with triple-clicks), snap them to the answer container
            if (!entryAnswer.contains(this.range.startContainer) || !entryAnswer.contains(this.range.endContainer)) {
                // Determine the best sub-element to wrap for a "clean" highlight
                let target = entryAnswer.querySelector('.lumina-answer-content') || entryAnswer;
                
                // If there's exactly one <p> (common for simple answers), target its content 
                // to avoid wrapping the <p> block itself in a <span>.
                const pTags = target.querySelectorAll('p');
                if (pTags.length === 1) {
                    target = pTags[0];
                }

                const newRange = document.createRange();
                newRange.selectNodeContents(target);
                this.range = newRange;
            }

            // 2. Highlighting approach
            const span = document.createElement('span');
            span.className = 'lumina-comment-highlight';
            span.dataset.comment = commentText;

            try {
                // Try the standard way first
                this.range.surroundContents(span);
            } catch (e) {
                // If surroundContents fails (due to tags), use extractContents ONLY since we've now 
                // verified the range is strictly within the internal answer content.
                // This will not "eat" questions or other entries.
                span.appendChild(this.range.extractContents());
                this.range.insertNode(span);
            }

            // Signal that a comment was added
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
        if (!element || !this.range) return;

        const firstLineRect = this.getSelectionFirstLineRect(this.range);
        if (!firstLineRect || firstLineRect.width === 0) {
            this.hide();
            return;
        }

        const top = firstLineRect.top;
        const left = firstLineRect.left;
        const btnWidth = element.offsetWidth;
        const btnHeight = element.offsetHeight || 34;
        const margin = 5;

        let finalTop = top - btnHeight - margin;
        let finalLeft = left;

        if (finalTop < 10) {
            const rect = this.range.getBoundingClientRect();
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

        // Detect Comment Mode
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
            // Only allow comment mode for the LATEST entry in the conversation
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
            // Clear and rebuild to avoid whitespace issues
            this.inputField.innerHTML = '';

            // Selection tag removed per user request to declutter the UI.
            // The full text is still stored in this.text and will be sent on submit.

            // Adjust placeholder/title if in comment mode
            if (this.commentMode) {
                this.inputField.setAttribute('title', 'Add a comment...');
            } else {
                this.inputField.removeAttribute('title');
            }

            // Put cursor at the end
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

    showAnnotationMenu(targetEl, id, currentColor) {
        if (!this.btn || !targetEl) return;
        this.currentAnnotationId = id;
        this.annotationMode = true;

        // Create a range for the target element to position the bar
        const range = document.createRange();
        range.selectNodeContents(targetEl);
        this.range = range;

        // Change bar content to palette
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

        const dictionaryLogoSrc = (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.getURL === 'function')
            ? chrome.runtime.getURL('assets/icons/lumina/cambridge.svg')
            : 'assets/icons/lumina/cambridge.svg';
        
        this.btn.innerHTML = `
            <div class="lumina-action-item lumina-action-highlight" title="Highlight Selection">
                <div class="lumina-highlight-icon-circle"></div>
            </div>
            <div class="lumina-action-item lumina-action-dict" title="Define in Dictionary">
                <img class="lumina-dictionary-logo" src="${dictionaryLogoSrc}" alt="" aria-hidden="true" />
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

            // Also block scroll on any Lumina chat containers if present
            document.querySelectorAll('.lumina-chat-scroll-content').forEach(el => {
                el.style.overflow = 'hidden';
            });

            // Preventive measure for touch/wheel
            this._scrollPreventer = (e) => {
                // Allow scrolling WITHIN the input field or its own tooltips if needed
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
                el.style.overflow = 'auto'; // Or whatever it was
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
    }
};
