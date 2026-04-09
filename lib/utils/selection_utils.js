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

        // 1. Cleanup existing
        this.cleanup();

        // 2. Create Selection Button
        this.btn = document.createElement('div');
        this.btn.id = 'lumina-ask-selection-btn';
        this.btn.style.cssText = 'pointer-events: auto; display: none; visibility: hidden;';
        this.btn.innerHTML = `
            <div class="lumina-dict-launcher-part" title="Define in Dictionary">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" shape-rendering="geometricPrecision"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>
            </div>
            <div class="lumina-translate-launcher-part" title="Translate with Google">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8l6 6"></path><path d="M4 14l6-6 2-3"></path><path d="M2 5h12"></path><path d="M7 2h1"></path><path d="M22 22l-5-10-5 10"></path><path d="M14 18h6"></path></svg>
            </div>
            <div class="lumina-comment-part">Add Comment</div>
            <div class="lumina-ask-part">Ask Lumina</div>
        `;

        // 3. Create Input Popup
        this.inputPopup = document.createElement('div');
        this.inputPopup.id = 'lumina-ask-input-popup';
        this.inputPopup.style.cssText = 'pointer-events: auto; display: none; visibility: hidden;';
        this.inputPopup.innerHTML = `
            <div class="lumina-ask-input-wrapper">
                <div class="lumina-ask-input-field" contenteditable="true"><span class="lumina-selected-text-tag" contenteditable="false">SelectedText</span>&nbsp;</div>
                <div class="lumina-ask-tooltip"></div>
            </div>
        `;
        this.inputField = this.inputPopup.querySelector('.lumina-ask-input-field');
        let tooltip = this.inputPopup.querySelector('.lumina-ask-tooltip');

        // Create global tooltip for highlights
        if (!document.querySelector('.lumina-comment-tooltip')) {
            this.tooltip = document.createElement('div');
            this.tooltip.className = 'lumina-comment-tooltip';
            document.body.appendChild(this.tooltip);
        } else {
            this.tooltip = document.querySelector('.lumina-comment-tooltip');
        }

        // Global hover listener for highlight spans
        document.addEventListener('mouseover', (e) => {
            const highlight = e.target.closest('.lumina-comment-highlight');
            if (highlight && highlight.dataset.comment) {
                this.tooltip.textContent = highlight.dataset.comment;
                this.tooltip.style.opacity = '1';
                this.tooltip.style.visibility = 'visible';

                const rect = highlight.getBoundingClientRect();
                this.tooltip.style.left = rect.left + 'px';
                this.tooltip.style.top = (rect.bottom + 8) + 'px';
            }
        });

        document.addEventListener('mouseout', (e) => {
            if (e.target.closest('.lumina-comment-highlight')) {
                this.tooltip.style.opacity = '0';
                this.tooltip.style.visibility = 'hidden';
            }
        });


        // Button Listeners
        this.btn.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
        this.btn.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation();
            const dictPart = e.target.closest('.lumina-dict-launcher-part');
            const translatePart = e.target.closest('.lumina-translate-launcher-part');
            const commentPart = e.target.closest('.lumina-comment-launcher-part') || e.target.closest('.lumina-comment-part');

            if (dictPart) {
                if (this.onSubmit) this.onSubmit(`Define: ${this.text}`, this.text, true);
                this.hide();
            } else if (translatePart) {
                if (this.onTranslate) {
                    this.onTranslate(this.text);
                } else {
                    chrome.runtime.sendMessage({
                        action: 'open_sidepanel_with_query',
                        query: `translate: ${this.text}`,
                        displayQuery: `Translate: ${this.text}`,
                        mode: 'translate'
                    });
                }
                this.hide();
            } else if (commentPart) {
                this.showInput();
            } else {
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
        tooltip = this.inputPopup.querySelector('.lumina-ask-tooltip');

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
            // Apply Highlight
            const span = document.createElement('span');
            span.className = 'lumina-comment-highlight';
            span.dataset.comment = commentText;

            // SurroundContents can fail if the range splits nodes in complex ways.
            // For a more robust approach in proofread (mostly text), it works if range is within one container.
            this.range.surroundContents(span);

            // Update main chat input (more robust targeting)
            const chatInput = document.getElementById('chat-input') || 
                              document.querySelector('.lumina-chat-input') || 
                              document.querySelector('.lumina-ask-input-field');
                              
            if (chatInput) {
                const isContentEditable = chatInput.contentEditable === 'true' || chatInput.classList.contains('lumina-ask-input-field');
                const tag = '@comments';
                
                if (isContentEditable) {
                    const currentHtml = chatInput.innerHTML;
                    if (!currentHtml.includes(tag)) {
                        // For contenteditable, we can append a nicely formatted tag or just text
                        if (chatInput.innerText.trim() === '') {
                             chatInput.innerHTML = `<span class="lumina-selected-text-tag" contenteditable="false">${tag}</span>&nbsp;`;
                        } else {
                             chatInput.innerHTML += ` <span class="lumina-selected-text-tag" contenteditable="false">${tag}</span>&nbsp;`;
                        }
                    }
                } else {
                    const currentVal = chatInput.value.trim();
                    if (!currentVal.includes(tag)) {
                        chatInput.value = currentVal ? `${currentVal} ${tag}` : tag;
                    }
                }
                
                // Trigger input event to expand textarea if necessary
                chatInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
        } catch (e) {
            console.error('Failed to apply comment highlight:', e);
        }
    },

    cleanup() {
        if (this.shadowRoot) {
            this.shadowRoot.querySelectorAll('#lumina-ask-selection-btn, #lumina-ask-input-popup').forEach(el => el.remove());
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
        while (node && node !== document.documentElement) {
            if (node.nodeType === 1 && node.classList.contains('lumina-proofread-editable')) {
                this.commentMode = true;
                break;
            }
            node = node.parentNode || (node.host && node.host.nodeType === 1 ? node.host : null);
        }

        if (this.commentMode) {
            this.btn.classList.add('lumina-comment-mode');
        } else {
            this.btn.classList.remove('lumina-comment-mode');
        }

        this.btn.style.display = 'flex';
        this.btn.style.visibility = 'visible';
        this.updatePosition(this.btn);
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

            const tag = document.createElement('span');
            tag.className = 'lumina-selected-text-tag';
            tag.setAttribute('contenteditable', 'false');
            
            // Middle truncation logic: Start + ... + End with Quotes
            let displayContent = this.text;
            if (this.text && this.text.length > 18) {
                const start = this.text.substring(0, 7).trim();
                const end = this.text.substring(this.text.length - 5).trim();
                displayContent = `${start}...${end}`;
            }
            tag.textContent = `"${displayContent}"`;

            const space = document.createElement('span');
            space.setAttribute('contenteditable', 'false');
            space.innerHTML = '&nbsp;';

            this.inputField.appendChild(tag);
            this.inputField.appendChild(space);

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
        this.setScrollLock(true);
    },

    hide() {
        if (this.btn) {
            this.btn.style.display = 'none';
            this.btn.style.visibility = 'hidden';
        }
        if (this.inputPopup) {
            this.inputPopup.style.display = 'none';
            this.inputPopup.style.visibility = 'hidden';
        }
        this.text = '';
        this.range = null;
        this.setScrollLock(false);
        if (this.onHide) this.onHide();
    },

    setScrollLock(lock) {
        if (lock) {
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
                if (e.target.closest('.lumina-ask-input-field') || e.target.closest('.lumina-ask-tooltip')) {
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
        let active = root.activeElement;
        while (active && active.shadowRoot) {
            active = active.shadowRoot.activeElement;
        }
        return active;
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
