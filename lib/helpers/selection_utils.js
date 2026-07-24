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
    tooltip: null,
    inputBackdrop: null,
    _selectionScrollTargets: null,
    _selectionScrollHandler: null,
    currentAnnotationId: null,
    annotationMode: false,
    currentHighlightColor: '#FFFB78',
    showExtraColors: false,
    ANNOTATION_COLORS: ['#FFFB78', '#ffcc80', '#f48fb1', '#ce93d8', '#90caf9'],
    isWordChar(c) {
        return /[a-zA-Z0-9\u00C0-\u1EF9]/.test(c);
    },
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
        const startsWithWordChar = this.isWordChar(originalText[0]);
        const endsWithWordChar = this.isWordChar(originalText[originalText.length - 1]);
        while (startOffset > 0) {
            const prevChar = startText[startOffset - 1];
            if (/\s/.test(prevChar)) break;
            if (startsWithWordChar) {
                if (!this.isWordChar(prevChar)) break;
            }
            startOffset--;
        }
        while (endOffset < endText.length) {
            const nextChar = endText[endOffset];
            if (/\s/.test(nextChar)) break;
            if (endsWithWordChar) {
                if (!this.isWordChar(nextChar)) break;
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
        while (start < end && /\s/.test(value[start])) {
            start++;
        }
        while (end > start && /\s/.test(value[end - 1])) {
            end--;
        }
        if (start === end) return;
        const startsWithWordChar = this.isWordChar(value[start]);
        const endsWithWordChar = this.isWordChar(value[end - 1]);
        while (start > 0) {
            const prevChar = value[start - 1];
            if (/\s/.test(prevChar)) break;
            if (startsWithWordChar && !this.isWordChar(prevChar)) break;
            start--;
        }
        while (end < value.length) {
            const nextChar = value[end];
            if (/\s/.test(nextChar)) break;
            if (endsWithWordChar && !this.isWordChar(nextChar)) break;
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
    hasIntersection(r1, r2) {
        try {
            if (r1.compareBoundaryPoints(Range.END_TO_START, r2) >= 0) return false;
            if (r1.compareBoundaryPoints(Range.START_TO_END, r2) <= 0) return false;
            return true;
        } catch (e) {
            return false;
        }
    },
    getHighlightsInSelection(selectedRange) {
        if (!selectedRange || !window.LuminaAnnotation) return [];
        const intersectingHighlights = [];
        for (const [id, data] of window.LuminaAnnotation.highlightsMap.entries()) {
            if (this.hasIntersection(selectedRange, data.range)) {
                intersectingHighlights.push(id);
            }
        }
        return intersectingHighlights;
    },
    renderDefaultActionBar() {
        if (!this.btn) return;
        const dictIconSrc = (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.getURL === 'function')
            ? chrome.runtime.getURL('assets/icons/favicon.ico')
            : 'assets/icons/favicon.ico';
        let html = '';
        if (this.annotationMode) {
            html += `
                <div class="lumina-color-swatch lumina-clear-highlight" title="Clear Annotation" style="display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; padding: 0;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </div>
                <div class="lumina-action-item lumina-action-comment" title="Edit/Add Comment">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 16px; height: 16px; display: block;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                </div>
            `;
            this.ANNOTATION_COLORS.forEach(color => {
                const isActive = color.toLowerCase() === (this.currentHighlightColor || '').toLowerCase();
                html += `
                    <div class="lumina-action-item lumina-action-highlight-btn ${isActive ? 'active' : ''}" data-color="${color}" title="Change Color">
                        <div class="lumina-action-highlight-color-preview" style="background-color: ${color}; border: ${isActive ? '2px solid var(--lumina-ui-primary, #6366f1)' : '1px solid rgba(0,0,0,0.15)'};"></div>
                    </div>
                `;
            });
        } else {
            const intersectingIds = this.getHighlightsInSelection(this.range);
            if (intersectingIds.length > 0) {
                html += `
                    <div class="lumina-color-swatch lumina-clear-highlight" title="Clear All Highlights in Selection" style="display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; padding: 0;">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </div>
                `;
            }
            html += `
                <div class="lumina-action-item lumina-action-dict" title="Dictionary">
                    <img class="lumina-dict-logo" src="${dictIconSrc}" alt="" aria-hidden="true" style="width: 16px; height: 16px; display: block;" />
                </div>
                <div class="lumina-action-item lumina-action-comment" title="Add Comment">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 16px; height: 16px; display: block; opacity: 0.85;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                </div>
            `;
            html += `
                <div class="lumina-action-item lumina-action-highlight-btn" data-color="${this.currentHighlightColor}" title="Highlight text">
                    <div class="lumina-action-highlight-color-preview" style="background-color: ${this.currentHighlightColor};"></div>
                </div>
            `;
            const remainingColors = this.ANNOTATION_COLORS.filter(c => c.toLowerCase() !== this.currentHighlightColor.toLowerCase());
            if (this.showExtraColors) {
                remainingColors.forEach(color => {
                    html += `
                        <div class="lumina-action-item lumina-action-highlight-btn extra-color" data-color="${color}" title="Highlight text">
                            <div class="lumina-action-highlight-color-preview" style="background-color: ${color};"></div>
                        </div>
                    `;
                });
            } else {
                html += `
                    <div class="lumina-action-item lumina-action-expand-colors" title="More colors">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px; display: block; opacity: 0.7;"><polyline points="9 18 15 12 9 6"></polyline></svg>
                    </div>
                `;
            }
        }
        this.btn.innerHTML = html;
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
        this.renderDefaultActionBar();
        this.inputPopup = document.createElement('div');
        this.inputPopup.id = 'lumina-ask-input-popup';
        this.inputPopup.style.cssText = 'pointer-events: auto; display: none; visibility: hidden;';
        this.inputPopup.innerHTML = `
            <div class="lumina-ask-input-wrapper">
                <textarea class="lumina-ask-input-field" placeholder="Add a comment..."></textarea>
            </div>
        `;
        this.inputField = this.inputPopup.querySelector('.lumina-ask-input-field');

        // Hover tooltip for comments
        this.hoverTooltip = document.createElement('div');
        this.hoverTooltip.id = 'lumina-comment-hover-tooltip';
        this.hoverTooltip.style.cssText = 'pointer-events: auto; display: none; visibility: hidden; position: fixed; z-index: 2147483647;';
        this.shadowRoot.appendChild(this.hoverTooltip);

        const markInteracting = () => {
            this.isInteractingWithActionBar = true;
            if (this._interactingTimer) clearTimeout(this._interactingTimer);
            this._interactingTimer = setTimeout(() => {
                this.isInteractingWithActionBar = false;
            }, 400);
        };

        this.btn.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); markInteracting(); });
        this.btn.addEventListener('mouseup', (e) => { e.preventDefault(); e.stopPropagation(); markInteracting(); });
        this.btn.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation();
            markInteracting();
            const dictBtn = e.target.closest('.lumina-action-dict');
            const commentBtn = e.target.closest('.lumina-action-comment');
            const expandBtn = e.target.closest('.lumina-action-expand-colors');
            const highlightBtn = e.target.closest('.lumina-action-highlight-btn');
            const clearHighlightBtn = e.target.closest('.lumina-clear-highlight');
            if (expandBtn) {
                this.showExtraColors = true;
                this.renderDefaultActionBar();
                this.updatePosition(this.btn);
                return;
            }
            if (clearHighlightBtn) {
                if (window.LuminaAnnotation) {
                    if (this.annotationMode && this.currentAnnotationId) {
                        window.LuminaAnnotation.removeHighlightById(this.currentAnnotationId);
                    } else {
                        const intersectingIds = this.getHighlightsInSelection(this.range);
                        window.LuminaAnnotation.removeHighlightsByIds(intersectingIds);
                        const selection = window.getSelection();
                        if (selection) selection.removeAllRanges();
                    }
                }
                this.hide();
                return;
            }
            if (highlightBtn) {
                const color = highlightBtn.dataset.color;
                this.currentHighlightColor = color;
                this.showExtraColors = false;
                if (this.annotationMode) {
                    if (window.LuminaAnnotation && this.currentAnnotationId) {
                        window.LuminaAnnotation.updateHighlightColor(this.currentAnnotationId, color);
                    }
                } else {
                    if (window.LuminaAnnotation) {
                        window.LuminaAnnotation.highlight(this.range, color);
                    }
                    const selection = window.getSelection();
                    if (selection) selection.removeAllRanges();
                }
                this.hide();
                return;
            }
            if (dictBtn) {
                if (this.onSubmit) this.onSubmit(`Define: ${this.text}`, this.text, true, this.sourceEntry, this.range, false, false);
                const selection = window.getSelection();
                if (selection) selection.removeAllRanges();
                this.hide();
                return;
            }
            if (commentBtn) {
                this.showCommentInput();
                return;
            }
        });

        const handleSaveComment = () => {
            const commentText = this.inputField.value.trim();
            if (commentText) {
                if (this.annotationMode && this.currentAnnotationId) {
                    if (window.LuminaAnnotation) {
                        window.LuminaAnnotation.updateHighlightComment(this.currentAnnotationId, commentText);
                    }
                } else {
                    if (window.LuminaAnnotation && this.range) {
                        window.LuminaAnnotation.addComment(this.range, commentText, null);
                    }
                    const selection = window.getSelection();
                    if (selection) selection.removeAllRanges();
                }
            }
            this.hide();
        };

        this.inputField.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSaveComment();
            } else if (e.key === 'Escape') {
                this.hide();
            }
        });
        this.inputPopup.addEventListener('mousedown', (e) => e.stopPropagation());
        this.shadowRoot.appendChild(this.btn);
        this.shadowRoot.appendChild(this.inputPopup);

        // Track hover over commented text
        document.addEventListener('mousemove', (e) => {
            if (this.inputPopup && this.inputPopup.style.display === 'flex') return;
            if (this.btn && this.btn.style.display === 'flex') return;

            const hData = window.LuminaAnnotation ? window.LuminaAnnotation.getHighlightAtCoords(e.clientX, e.clientY) : null;
            if (hData && hData.comment) {
                if (this.currentHoveredAnnotationId === hData.id && this.hoverTooltip && this.hoverTooltip.style.display === 'block') {
                    return; // Already showing this comment, prevent flickering
                }
                this.showHoverCommentTooltip(e.clientX, e.clientY, hData);
            } else {
                if (this.hoverTooltip && this.hoverTooltip.style.display === 'block') {
                    this.hideHoverTooltip();
                }
            }
        }, { passive: true });

        window.addEventListener('scroll', () => {
            if (this.btn && this.btn.style.display === 'flex') {
                this.updatePosition(this.btn);
            }
        }, { passive: true });
    },
    hideHoverTooltip() {
        this.currentHoveredAnnotationId = null;
        if (this.hoverTooltip) {
            this.hoverTooltip.style.display = 'none';
            this.hoverTooltip.style.visibility = 'hidden';
        }
    },
    showHoverCommentTooltip(x, y, hData) {
        if (!this.hoverTooltip || !hData || !hData.comment) return;
        this.currentHoveredAnnotationId = hData.id;
        this.hoverTooltip.innerHTML = `
            <div class="lumina-comment-tooltip-card">
                <span class="lumina-comment-tooltip-text">${this.escapeHtml(hData.comment)}</span>
            </div>
        `;

        this.hoverTooltip.style.display = 'block';
        this.hoverTooltip.style.visibility = 'visible';

        const cardHeight = this.hoverTooltip.offsetHeight || 30;
        const cardWidth = this.hoverTooltip.offsetWidth || 160;

        // Anchor at the START (top-left) of the selected text range
        let startRect = null;
        if (hData.range) {
            const rects = hData.range.getClientRects();
            startRect = rects.length > 0 ? rects[0] : hData.range.getBoundingClientRect();
        }

        let left = startRect ? startRect.left : x;
        let top = startRect ? startRect.top - cardHeight - 2 : y - cardHeight - 2;

        // Fallback below start line if top is offscreen
        if (top < 10 && startRect) {
            top = startRect.bottom + 2;
        }

        if (left + cardWidth > window.innerWidth - 10) left = Math.max(10, window.innerWidth - cardWidth - 10);
        if (left < 10) left = 10;
        if (top < 10) top = 10;

        this.hoverTooltip.style.left = left + 'px';
        this.hoverTooltip.style.top = top + 'px';
    },
    cleanup() {
        this.setScrollLock(false);
        this._unbindSelectionScrollTracking();
        if (this.shadowRoot) {
            this.shadowRoot.querySelectorAll('#lumina-action-bar, #lumina-ask-input-popup, .lumina-overlay-backdrop').forEach(el => el.remove());
        }
    },
    updatePosition(element = this.btn) {
        if (!element) return;
        let rect = null;
        if (this.useMousePosition && this.anchorCoords) {
            rect = {
                top: this.anchorCoords.y,
                bottom: this.anchorCoords.y,
                left: this.anchorCoords.x,
                right: this.anchorCoords.x,
                width: 0,
                height: 0
            };
        } else if (this.isInsideEditable()) {
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
    show(x, y, text, range, useMousePosition = false) {
        if (!this.btn) return;
        this.text = text;
        this.range = range;
        this.useMousePosition = useMousePosition;
        if (x !== undefined && y !== undefined && x !== 0 && y !== 0) {
            this.mouseCoords = { x, y };
        }
        if (this.useMousePosition && this.mouseCoords) {
            this.anchorCoords = { ...this.mouseCoords };
        } else {
            this.anchorCoords = null;
        }
        this.sourceEntry = null;
        if (range && range.startContainer) {
            const node = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
            this.sourceEntry = node ? node.closest('.lumina-entry') : null;
        }
        this.annotationMode = false;
        this.showExtraColors = false;
        this.renderDefaultActionBar();
        this.btn.style.display = 'flex';
        this.btn.style.visibility = 'visible';
        this.updatePosition(this.btn);
        this._bindSelectionScrollTracking();
    },
    showCommentInput() {
        if (!this.inputPopup || !this.btn) return;
        this.btn.style.display = 'none';
        this.btn.style.visibility = 'hidden';
        this.inputPopup.style.display = 'flex';
        this.inputPopup.style.visibility = 'visible';
        if (this.inputField) {
            let existingComment = '';
            if (this.annotationMode && this.currentAnnotationId && window.LuminaAnnotation) {
                const data = window.LuminaAnnotation.highlightsMap.get(this.currentAnnotationId);
                if (data) existingComment = data.comment || '';
            }
            this.inputField.value = existingComment;
            this.inputField.setAttribute('placeholder', 'Add a comment...');
            setTimeout(() => {
                this.inputField.focus();
            }, 10);
        }
        this.updatePosition(this.inputPopup);
        this._bindSelectionScrollTracking();
        this.setScrollLock(true);
    },
    escapeHtml(str) {
        return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    },
    showAnnotationMenu(targetElOrRange, id, currentColor) {
        if (!this.btn || !targetElOrRange) return;
        this.currentAnnotationId = id;
        this.annotationMode = true;
        this.currentHighlightColor = currentColor || '#FFFB78';
        this.showExtraColors = false;
        if (targetElOrRange instanceof Range) {
            this.range = targetElOrRange;
        } else {
            const range = document.createRange();
            range.selectNodeContents(targetElOrRange);
            this.range = range;
        }
        this.useMousePosition = false;
        this.anchorCoords = null;
        this.renderDefaultActionBar();
        this.btn.style.display = 'flex';
        this.btn.style.visibility = 'visible';
        this.updatePosition();
    },
    resetActionBar() {
        if (!this.btn) return;
        this.annotationMode = false;
        this.currentAnnotationId = null;
        this.renderDefaultActionBar();
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
        this.useMousePosition = false;
        this.anchorCoords = null;
        this._unbindSelectionScrollTracking();
        this.setScrollLock(false);
        if (this.onHide) this.onHide();
    },
    setScrollLock(lock) {
        const isSpotlight = document.body.classList.contains('lumina-page') || window.location.pathname.includes('lumina.html');
        if (isSpotlight) return;
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
        const active = this.getDeepActiveElement();
        if (active && (
            ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName) ||
            active.isContentEditable ||
            active.getAttribute('contenteditable') === 'true' ||
            active.getAttribute('role') === 'textbox'
        )) return true;
        const sel = window.getSelection();
        try {
            if (sel && sel.rangeCount > 0) {
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
        } catch (e) { }
        return false;
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
