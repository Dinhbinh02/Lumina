class LuminaChatUI {
    constructor(container, options = {}) {
        this.container = container;
        this.options = {
            isSpotlight: options.isSpotlight || false,
            alwaysExpanded: options.alwaysExpanded || false,
            onSubmit: options.onSubmit || null,
            ...options
        };
        this.historyEl = container.querySelector('.lumina-chat-history') ||
            container.querySelector('.lumina-chat-scroll-content');
        this.inputEl = container.querySelector('.lumina-chat-input') ||
            (this.options.isSpotlight && !this.options.isPrimaryInput ? null : (document.querySelector('.lumina-chat-input') || document.querySelector('#chat-input')));
        this.imagePreviewEl = container.querySelector('.lumina-image-preview-container') ||
            container.querySelector('#image-preview') ||
            document.querySelector('.lumina-image-preview-container');
        this.fileInputEl = container.querySelector('input[type="file"]') ||
            container.querySelector('#file-input') ||
            document.querySelector('#file-input');
        this.currentEntryDiv = null;
        this.loadingDiv = null;
        this.searchingDiv = null;
        this.currentAnswerDiv = null;
        this.disableAutoScroll = false;
        this.disableStreamAutoFollow = true;
        this.attachedFiles = [];
        this.selectedImages = [];
        this.inputPaneEl = null;
        this.webSearchSources = [];
        this._lastActiveEntry = null;
        if (this.inputEl && !this.options.skipInputSetup) {
            this.setupInputBar();
            this._setupMentions();
        }
        this.memoryTimers = new Map();
        this._setupMemoryManager();
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
        this._initContextMenu();
        this._setupHistoryDelegation();
        // Automatically setup listeners if history element is available in constructor
        if (this.historyEl) this.initListeners(this.historyEl);
    }
    initListeners(container) {
        if (!container || container._luminaListenersAttached) return;
        container._luminaListenersAttached = true;

        // 1. Keydown Delegation (Enter to re-submit + Tag Protection)
        container.addEventListener('keydown', (e) => {
            const editable = e.target.closest('.lumina-chat-question div[contenteditable="true"]');
            if (editable && e.target === editable) {
                const isSelectAll = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a';
                const tag = editable.querySelector('.lumina-selected-text-tag');

                if (isSelectAll && tag) {
                    e.preventDefault();
                    const selection = window.getSelection();
                    const range = document.createRange();
                    let startNode = tag.nextSibling;
                    if (!startNode) {
                        startNode = document.createTextNode('');
                        editable.appendChild(startNode);
                    }
                    range.setStart(startNode, 0);
                    range.setEnd(editable, editable.childNodes.length);
                    selection.removeAllRanges();
                    selection.addRange(range);
                    return;
                }

                if ((e.key === 'Backspace' || e.key === 'Delete') && tag) {
                    const selection = window.getSelection();
                    if (selection.rangeCount > 0) {
                        const range = selection.getRangeAt(0);
                        if (range.intersectsNode(tag)) {
                            e.preventDefault();
                            return;
                        }
                        if (range.collapsed) {
                            const preRange = range.cloneRange();
                            preRange.selectNodeContents(editable);
                            preRange.setEnd(range.startContainer, range.startOffset);
                            if (preRange.toString().trim() === '' && preRange.cloneContents().querySelector('.lumina-selected-text-tag')) {
                                e.preventDefault();
                                return;
                            }
                        }
                    }
                }

                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    const newText = editable.innerText.trim();
                    if (newText) {
                        editable.blur();
                        this._handleQuestionRecheck(newText, editable);
                    }
                }
            }
        });

        // 3. Tooltip Delegation for Tags
        container.addEventListener('mouseover', (e) => {
            const tag = e.target.closest('.lumina-selected-text-tag');
            if (tag) {
                // Forceively remove any native title that might persist from legacy rendering
                tag.removeAttribute('title');

                const questionDiv = tag.closest('.lumina-chat-question');
                const isInputField = tag.closest('.lumina-ask-input-field') || tag.closest('.lumina-chat-input');

                let context = "";
                if (questionDiv) {
                    const rawText = questionDiv.dataset.rawText || "";
                    context = this._extractContext(rawText);
                } else if (isInputField) {
                    // For the input field, the tag text itself contains the "selected text"
                    context = tag.textContent.replace(/^"|"$/g, '');
                }

                if (context) this._showTagTooltip(tag, context);
            }
        });

        container.addEventListener('mouseout', (e) => {
            const tag = e.target.closest('.lumina-selected-text-tag');
            if (tag) this._hideTagTooltip();
        });

        // 4. Mousedown Delegation (Focus Question bubble area)
        container.addEventListener('mousedown', (e) => {
            const questionBubble = e.target.closest('.lumina-chat-question');
            if (questionBubble) {
                // If they didn't click directly on the text area, focus it manually
                if (!e.target.closest('div[contenteditable="true"]')) {
                    const editable = questionBubble.querySelector('div[contenteditable="true"]');
                    if (editable) {
                        e.preventDefault();
                        editable.focus();

                        // Move cursor to the end
                        setTimeout(() => {
                            if (typeof window.getSelection !== "undefined" && typeof document.createRange !== "undefined") {
                                const range = document.createRange();
                                range.selectNodeContents(editable);
                                range.collapse(false);
                                const sel = window.getSelection();
                                sel.removeAllRanges();
                                sel.addRange(range);
                            }
                        }, 0);
                    }
                }
            }
        });

        // 3. Input Delegation (Stop propagation to avoid triggering global shortcuts)
        container.addEventListener('input', (e) => {
            const editable = e.target.closest('.lumina-chat-question div[contenteditable="true"]');
            if (editable) e.stopPropagation();
        });
    }
    _setupHistoryDelegation() {
        if (!this.historyEl) return;
        this.historyEl.addEventListener('click', (e) => {
            const clickableImg = e.target.closest('.lumina-clickable-image');
            if (clickableImg && clickableImg.src) {
                e.stopPropagation();
                this.showImagePreview(clickableImg.src);
            }
        });
    }
    _setupMemoryManager() {
        this.memoryObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const container = entry.target;
                const iframe = container.querySelector('iframe');
                if (!iframe) return;
                if (entry.isIntersecting) {
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
                            container.classList.remove('is-lazy-unloaded', 'is-hibernating', 'is-lazily-unloaded');
                        }
                    }
                } else {
                    if (!container.classList.contains('is-lazy-unloaded') && !this.memoryTimers.has(container)) {
                        const timerId = setTimeout(() => {
                            const currentSrc = iframe.src || container.dataset.sourceUrl;
                            if (currentSrc && currentSrc !== 'about:blank') {
                                container.dataset.savedSrc = currentSrc;
                                iframe.src = 'about:blank';
                                container.classList.add('is-lazy-unloaded');
                            }
                            this.memoryTimers.delete(container);
                        }, 30000);
                        this.memoryTimers.set(container, timerId);
                    }
                }
            });
        }, {
            rootMargin: '200px'
        });
    }
    getScrollContainer() {
        if (!this.historyEl) return null;
        let scrollContainer = this.historyEl;
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

    static getFileTypeLabel(item) {
        const name = String(item?.name || '').toLowerCase();
        if (name.endsWith('.docx')) return 'DOCX';
        if (name.endsWith('.doc')) return 'DOC';
        if (name.endsWith('.xlsx')) return 'XLSX';
        if (name.endsWith('.xls')) return 'XLS';
        if (name.endsWith('.csv')) return 'CSV';
        if (name.endsWith('.pptx')) return 'PPTX';
        if (name.endsWith('.ppt')) return 'PPT';
        if (name.endsWith('.pdf')) return 'PDF';
        if (name.endsWith('.txt')) return 'TXT';
        if (name.endsWith('.md')) return 'MD';
        if (name.endsWith('.json')) return 'JSON';
        if (name.endsWith('.js')) return 'JS';
        if (name.endsWith('.ts')) return 'TS';
        if (name.endsWith('.py')) return 'PY';

        const mime = String(item?.mimeType || '').toLowerCase();
        if (mime.includes('wordprocessingml.document')) return 'DOCX';
        if (mime.includes('spreadsheetml.sheet')) return 'XLSX';
        if (mime.includes('presentationml.presentation')) return 'PPTX';
        if (mime.includes('pdf')) return 'PDF';
        if (mime.includes('json')) return 'JSON';
        if (mime.startsWith('audio/')) return mime.split('/')[1]?.toUpperCase() || 'AUDIO';
        if (mime.startsWith('video/')) return mime.split('/')[1]?.toUpperCase() || 'VIDEO';
        return (mime.split('/')[1] || 'FILE').toUpperCase();
    }

    static getDisplayFileName(fileName) {
        const safeName = String(fileName || 'File');
        const rawExt = safeName.includes('.') ? safeName.split('.').pop() : '';
        const ext = String(rawExt || '').toLowerCase();
        const dotExt = ext ? `.${ext}` : '';
        if (dotExt && safeName.toLowerCase().endsWith(dotExt)) {
            return safeName.slice(0, -(dotExt.length));
        }
        return safeName;
    }

    static inferFileCategory(fileOrExt, mimeType = '') {
        let ext = '';
        let mime = String(mimeType || '').toLowerCase();

        if (fileOrExt && typeof fileOrExt === 'object') {
            const name = String(fileOrExt.name || '').toLowerCase();
            ext = name.includes('.') ? name.split('.').pop() : '';
            mime = String(fileOrExt.mimeType || mime || '').toLowerCase();
        } else {
            ext = String(fileOrExt || '').toLowerCase();
        }

        const major = mime.split('/')[0];
        if (major === 'audio') return 'audio';
        if (major === 'video') return 'video';
        if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
        if (["doc", "docx", "odt", "rtf"].includes(ext)) return 'doc';
        if (["xls", "xlsx", "csv", "ods", "tsv"].includes(ext)) return 'sheet';
        if (["ppt", "pptx", "odp", "key"].includes(ext)) return 'slides';
        if (["zip", "rar", "7z", "tar", "gz", "bz2", "xz"].includes(ext)) return 'archive';
        if (["js", "ts", "jsx", "tsx", "json", "xml", "html", "css", "py", "java", "c", "cpp", "h", "rs", "go", "php", "md", "yaml", "yml", "sql", "sh"].includes(ext)) return 'code';
        if (["txt", "log", "text"].includes(ext) || major === 'text') return 'text';
        return 'file';
    }

    static getFileIconByCategory(category) {
        if (category === 'audio') return '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M12 3v9.28c-.47-.17-.97-.28-1.5-.28C8.01 12 6 14.01 6 16.5S8.01 21 10.5 21c2.31 0 4.2-1.75 4.45-4H15V6h4V3h-7z"/></svg>';
        if (category === 'video') return '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>';
        if (category === 'pdf') return '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M20 2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM9.5 13H8V7h2.4a1.8 1.8 0 0 1 0 3.6H9.5V13zm.9-3.8c.4 0 .7-.3.7-.7s-.3-.7-.7-.7h-.9v1.4h.9zM13 13V7h2.1c1.5 0 2.6 1.1 2.6 3s-1.1 3-2.6 3H13zm1.5-1.3h.6c.7 0 1.2-.5 1.2-1.7s-.5-1.7-1.2-1.7h-.6v3.4z"/></svg>';
        if (category === 'doc') return '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M6 2h8l5 5v15a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm7 1.5V8h4.5L13 3.5zM7 11h10v1.5H7V11zm0 3h10v1.5H7V14zm0 3h7v1.5H7V17z"/></svg>';
        if (category === 'sheet') return '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M6 2h9l5 5v15a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm8 1.5V8h4.5L14 3.5zM7 11h10v8H7v-8zm1.5 1.5v1.5H11v-1.5H8.5zm4 0v1.5H15v-1.5h-2.5zm-4 3v1.5H11v-1.5H8.5zm4 0v1.5H15v-1.5h-2.5z"/></svg>';
        if (category === 'slides') return '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M4 4a2 2 0 0 1 2-2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4zm9 0v4h4l-4-4zM7 11h10v2H7v-2zm0 4h7v2H7v-2z"/></svg>';
        if (category === 'archive') return '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M20 6h-3.2l-1-2H8.2l-1 2H4a2 2 0 0 0-2 2v2h20V8a2 2 0 0 0-2-2zm-7 1h-2v1h2V7zm9 5H2v8a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-8zm-11 2h2v4h-2v-4z"/></svg>';
        if (category === 'code') return '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M8.7 16.6L4.1 12l4.6-4.6L7.3 6 1.3 12l6 6 1.4-1.4zm6.6 0l4.6-4.6-4.6-4.6L16.7 6l6 6-6 6-1.4-1.4z"/></svg>';
        if (category === 'text') return '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm1 7V3.5L20.5 9H15zM8 12h8v1.5H8V12zm0 3h8v1.5H8V15zm0 3h6v1.5H8V18z"/></svg>';
        return '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>';
    }
    _isNearBottom(threshold = 120) {
        const scrollContainer = this.getScrollContainer();
        if (!scrollContainer) return false;
        const distanceToBottom = scrollContainer.scrollHeight - scrollContainer.scrollTop - scrollContainer.clientHeight;
        return distanceToBottom < threshold;
    }
    _snapToBottomIfNeeded(shouldSnap) {
        return;
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
    appendQuestion(text, images = [], options = {}) {
        const { entryType = 'qa', editable = false, skipMargin = false, displayText: displayTextOverride } = options;
        const visibleImages = Array.isArray(images)
            ? images.filter((item) => {
                if (typeof item === 'string') return true;
                if (!item || typeof item !== 'object') return false;
                return !item.hiddenInPreview && !item.parentAttachmentId;
            })
            : [];
        this.currentEntryDiv = document.createElement('div');
        this.currentEntryDiv.className = 'lumina-dict-entry lumina-fade-in';
        this.currentEntryDiv.dataset.entryType = entryType;

        // Create separate attachments container above the text bubble
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
                        img.className = 'lumina-clickable-image';
                        img.addEventListener('click', (e) => {
                            e.stopPropagation();
                            this.showImagePreview(src);
                        });
                        filesDiv.appendChild(img);
                    } else {
                        const fileName = item.name || 'File';
                        const displayName = LuminaChatUI.getDisplayFileName(fileName);
                        const category = LuminaChatUI.inferFileCategory(item);
                        const icon = LuminaChatUI.getFileIconByCategory(category);
                        const typeLabel = LuminaChatUI.getFileTypeLabel(item);

                        const fileChip = document.createElement('div');
                        fileChip.className = 'lumina-image-preview-item is-file lumina-question-file-chip';
                        fileChip.title = fileName;
                        fileChip.innerHTML = `<div class="lumina-file-preview-info"><span class="lumina-file-name">${this.escapeHTMLAttr(displayName || fileName)}</span><div class="lumina-file-meta-row"><span class="lumina-file-icon-inline file-${category}">${icon}</span><span class="lumina-file-size-tag">${this.escapeHTMLAttr(typeLabel)}</span></div></div>`;
                        filesDiv.appendChild(fileChip);
                    }
                } else if (typeof item === 'string') {
                    const src = this._resolveImagePreviewSrc(null, item);
                    const img = document.createElement('img');
                    img.src = src;
                    img.className = 'lumina-clickable-image';
                    img.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.showImagePreview(src);
                    });
                    filesDiv.appendChild(img);
                }
            });
            this.currentEntryDiv.appendChild(filesDiv);
        }

        const questionDiv = document.createElement('div');
        questionDiv.className = `lumina-chat-question ${entryType}-question`;
        questionDiv.dataset.entryType = entryType;

        if (visibleImages.length > 0) {
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

        if (text) {
            let displayText = displayTextOverride || text.replace(/[("'\[]*\$Container[)"'\]]*\s*/gi, '').trim();

            // Detect either the modern protocol tag or legacy context prefix
            const isModernTag = displayText.startsWith('$ContextTag');
            const isLegacyTag = displayText.startsWith('SelectedText:');
            const hasContextTag = isModernTag || isLegacyTag;

            if (hasContextTag) {
                if (isModernTag) {
                    displayText = displayText.replace('$ContextTag', '').trim();
                } else {
                    // Strip the legacy context metadata part: SelectedText: "..." \n\n
                    displayText = displayText.replace(/^SelectedText: "[^"]*"\s+/, '').trim();
                }
            }

            // Store original RAW text for persistence and potential re-submission
            questionDiv.dataset.rawText = text;
            this.currentEntryDiv.dataset.timestamp = String(Date.now());

            if (editable) {
                const editableDiv = document.createElement('div');
                editableDiv.setAttribute('contenteditable', 'true');

                if (hasContextTag) {
                    const tagSpan = document.createElement('span');
                    tagSpan.className = 'lumina-selected-text-tag';
                    tagSpan.textContent = 'SelectedText';
                    tagSpan.contentEditable = 'false';
                    tagSpan.style.marginRight = '4px';
                    tagSpan.style.display = 'inline-block';
                    tagSpan.style.verticalAlign = 'baseline';
                    editableDiv.appendChild(tagSpan);

                    const textNode = document.createTextNode(displayText);
                    editableDiv.appendChild(textNode);
                } else {
                    editableDiv.textContent = displayText;
                }

                questionDiv.appendChild(editableDiv);
            } else {
                const textSpan = document.createElement('span');
                if (hasContextTag) {
                    const tagSpan = document.createElement('span');
                    tagSpan.className = 'lumina-selected-text-tag';
                    tagSpan.textContent = 'SelectedText';
                    tagSpan.style.marginRight = '4px';
                    tagSpan.style.display = 'inline-block';
                    tagSpan.style.verticalAlign = 'baseline';
                    textSpan.appendChild(tagSpan);

                    const textContent = document.createTextNode(displayText);
                    textSpan.appendChild(textContent);
                } else {
                    textSpan.innerHTML = displayText
                        .replace(/&/g, '&amp;')
                        .replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;')
                        .replace(/\n/g, '<br>');
                }
                questionDiv.appendChild(textSpan);
            }
        }
        const scrollContainer = this.getScrollContainer();
        const preAppendScroll = scrollContainer ? scrollContainer.scrollTop : 0;
        this.currentEntryDiv.appendChild(questionDiv);
        const separator = document.createElement('div');
        separator.className = 'lumina-dict-separator';
        this.currentEntryDiv.appendChild(separator);
        this.historyEl.appendChild(this.currentEntryDiv);
        if (!skipMargin) {
            this.disableAutoScroll = false;
            requestAnimationFrame(() => {
                this.setInitialEntryHeight(this.currentEntryDiv, false, preAppendScroll, true);
            });
        } else {
            this.clearEntryMargins(this.currentEntryDiv);
        }
        return questionDiv;
    }
    createAnswerDiv() {
        if (this.currentEntryDiv) {
            const activeVersion = this.currentEntryDiv.querySelector('.lumina-answer-version.active');
            if (activeVersion) {
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
        if (this.currentEntryDiv && this.currentEntryDiv.dataset.entryType === 'proofread') {
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
    appendChunk(chunk, skipScroll = false) {
        this.removeSearching();
        this.removeLoading();
        if (!this.currentAnswerDiv) {
            this.currentAnswerDiv = this.createAnswerDiv();
        }
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
        let displayText = newText.replace(/\{"tool"\s*:\s*"search_web"\s*,\s*"args"\s*:\s*\{[^}]+\}\s*\}/g, '');
        const isProofreadAnswer = answerDiv.classList.contains('lumina-proofread-editable');
        if (isProofreadAnswer) {
            displayText = displayText.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').trim();
            const existing = answerDiv.querySelector('.lumina-thinking-container');
            if (existing) existing.remove();
        }
        if (this.webSearchSources && this.webSearchSources.length > 0) {
            displayText = displayText.replace(/\n\s*(?:Sources|Citations|References)\s*(?::)?\s*\n[\s\S]*$/i, '');
        }
        const thinkMatch = displayText.match(/<think>([\s\S]*?)(?:<\/think>|$)/i);
        if (thinkMatch) {
            thinkingContent = thinkMatch[1].trim();
            isThinkingComplete = displayText.includes('</think>');
            actualAnswer = displayText.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').trim();
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
        if (thinkMatch) {
            isThinkingComplete = displayText.includes('</think>');
        }
        let answerContentDiv = answerDiv.querySelector('.lumina-answer-content');
        if (!answerContentDiv) {
            answerContentDiv = document.createElement('div');
            answerContentDiv.className = 'lumina-answer-content';
            answerDiv.appendChild(answerContentDiv);
        }
        if (actualAnswer.trim().startsWith('<')) {
            answerContentDiv.innerHTML = actualAnswer;
        } else if (typeof marked !== 'undefined') {
            let content = actualAnswer.replace(/([a-zà-ỹ])(\d)/g, '$1 $2').replace(/(\d)([a-zà-ỹ])/g, '$1 $2');
            let htmlContent = marked.parse(content);
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
        if (!skipScroll && !this.disableStreamAutoFollow && !this._scrollThrottled) {
            this._scrollThrottled = true;
            setTimeout(() => { this._scrollThrottled = false; }, 100);
            this.scrollToBottom();
        }
        if (preserveScrollTop !== null && scrollContainer) {
            scrollContainer.scrollTop = preserveScrollTop;
        }
    }
    finishAnswer(skipMargin = false, skipScroll = false) {
        this._renderPending = false;
        this._scrollThrottled = false;
        const answerDivSnapshot = this.currentAnswerDiv;
        const sourcesSnapshot = Array.isArray(this.webSearchSources) ? [...this.webSearchSources] : [];
        const rawText = answerDivSnapshot ? (answerDivSnapshot.getAttribute('data-raw-text') || '') : '';
        const isProofreadEntry = this.currentEntryDiv?.dataset?.entryType === 'proofread';
        const shouldStickBottom = !this.disableStreamAutoFollow && !skipScroll && this._isNearBottom();
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
                    await LuminaChatUI.processContainer(answerDivSnapshot);
                } catch (e) {
                    console.error('[Lumina] post-answer processing error:', e);
                } finally {
                    this.webSearchSources = previousSources;
                    this._snapToBottomIfNeeded(shouldStickBottom);
                }
            }, 380);
        } else if (sourcesSnapshot.length > 0 && !skipScroll && !this.disableStreamAutoFollow) {
            requestAnimationFrame(() => this.scrollToBottom());
        }
        this.currentAnswerDiv = null;
        this.webSearchSources = [];
        this.hideStopButton();
    }
    static calculateInitialScrollTarget(entry, scrollContainer, historyEl) {
        if (!entry || !scrollContainer || !historyEl) return 0;
        const allEntries = historyEl.querySelectorAll('.lumina-dict-entry');
        const currentIndex = Array.from(allEntries).indexOf(entry);
        if (currentIndex <= 0) return 0;
        const previousEntry = allEntries[currentIndex - 1];
        const containerRect = scrollContainer.getBoundingClientRect();
        const prevRect = previousEntry.getBoundingClientRect();
        let marginOffset = 0;
        const separator = previousEntry.querySelector('.lumina-dict-separator');
        if (separator) {
            marginOffset = parseFloat(window.getComputedStyle(separator).marginBottom) || 0;
        }
        return (prevRect.bottom - containerRect.top) + scrollContainer.scrollTop - marginOffset;
    }
    static getViewportStats(container, inputWrapper) {
        const containerHeight = container.clientHeight || container.offsetHeight;
        const inputHeight = inputWrapper ? (inputWrapper.offsetHeight || 0) : 0;

        const isSpotlight = container.classList.contains('spotlight-pane') ||
            document.querySelector('.spotlight-main-area') !== null;

        return {
            containerHeight,
            inputHeight,
            viewportHeight: isSpotlight ? containerHeight : Math.max(0, containerHeight - inputHeight)
        };
    }
    static applyViewportMinHeight(entry, container, inputWrapper) {
        if (!entry || !container) return;
        const { viewportHeight } = this.getViewportStats(container, inputWrapper);
        if (viewportHeight > 0) {
            const scrollContainer = entry.closest('.lumina-chat-scroll-content') ||
                container.querySelector('.lumina-chat-scroll-content');

            let paddingOffset = 20;
            if (scrollContainer) {
                const style = window.getComputedStyle(scrollContainer);
                const pt = parseFloat(style.paddingTop) || 0;
                const pb = parseFloat(style.paddingBottom) || 0;
                paddingOffset = pt + pb;
            }

            entry.style.setProperty('min-height', (viewportHeight - paddingOffset) + 'px', 'important');
            return true;
        }
        return false;
    }
    adjustEntryMargin(entry, behavior = 'none') {
    }
    clearEntryMargins(excludeEntry = null) {
        if (!this.historyEl) return;
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
    _extractContext(rawText) {
        if (!rawText) return '';
        // Support both SelectedText: "..." and $ContextTag formats
        const match = rawText.match(/^SelectedText: "([\s\S]*?)"(?:\n\n|$)/);
        return match ? match[1] : '';
    }

    _showTagTooltip(target, text) {
        if (!this.sharedTooltip) {
            this.sharedTooltip = document.createElement('div');
            this.sharedTooltip.id = 'lumina-chat-tag-tooltip';
            this.sharedTooltip.className = 'lumina-ask-tooltip';
            this.sharedTooltip.style.position = 'fixed';
            this.sharedTooltip.style.zIndex = '2147483647'; // Max z-index
            this.sharedTooltip.style.pointerEvents = 'none';
            this.sharedTooltip.style.display = 'none';
            this.sharedTooltip.style.animation = 'none'; // Avoid jumpy positioning

            // Hardcode core styles for resilience (where styles.css is not injected)
            Object.assign(this.sharedTooltip.style, {
                padding: '8px 12px',
                borderRadius: '8px',
                fontSize: '13px',
                lineHeight: '1.4',
                color: '#ffffff',
                backgroundColor: 'rgba(28, 28, 30, 0.95)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                boxShadow: 'none',
                whiteSpace: 'normal',
                wordBreak: 'break-word',
                boxSizing: 'border-box',
                transition: 'opacity 0.2s ease'
            });

            document.body.appendChild(this.sharedTooltip);
        }

        this.sharedTooltip.textContent = text;

        // Essential layout properties
        const viewportPadding = 12;
        this.sharedTooltip.style.maxWidth = `${Math.max(220, Math.min(420, window.innerWidth - (viewportPadding * 2)))}px`;
        this.sharedTooltip.style.maxHeight = '240px';
        this.sharedTooltip.style.overflowY = 'auto';
        this.sharedTooltip.style.overflowX = 'hidden';

        this.sharedTooltip.style.display = 'block';
        this.sharedTooltip.style.visibility = 'hidden'; // Hide during measurement
        this.sharedTooltip.style.opacity = '0';

        // Wait for next frame to ensure the tooltip is rendered so we can measure its height/width correctly
        requestAnimationFrame(() => {
            const rect = target.getBoundingClientRect();
            const tooltipWidth = this.sharedTooltip.offsetWidth;
            const tooltipHeight = this.sharedTooltip.offsetHeight;
            const tagWidth = rect.width;

            let topPosition = rect.top - tooltipHeight - 12;

            // If it hits the top beyond view, show below (Old logic behavior)
            if (topPosition < viewportPadding) {
                topPosition = rect.bottom + 12;
            }

            const centeredLeft = rect.left + (tagWidth / 2) - (tooltipWidth / 2);
            const clampedLeft = Math.max(viewportPadding, Math.min(centeredLeft, window.innerWidth - tooltipWidth - viewportPadding));

            this.sharedTooltip.style.left = `${clampedLeft}px`;
            this.sharedTooltip.style.top = `${topPosition}px`;
            this.sharedTooltip.style.visibility = 'visible';
            this.sharedTooltip.style.opacity = '1';
        });
    }

    _hideTagTooltip() {
        if (this.sharedTooltip) {
            this.sharedTooltip.style.display = 'none';
            this.sharedTooltip.style.opacity = '0';
        }
    }

    _handleQuestionRecheck(userInput, editable) {
        const questionDiv = editable.closest('.lumina-chat-question');
        const entry = editable.closest('.lumina-dict-entry');
        if (!entry) return;

        // Strip the literal "SelectedText" badge text if it leaked into innerText
        const userTextOnly = userInput.replace(/^SelectedText\s*/, '').trim();

        const rawText = (questionDiv && questionDiv.dataset.rawText) || userInput;
        let finalFullQuestion = userTextOnly;

        // Reconstruct the full submission string ensuring context is preserved
        if (rawText.includes('$ContextTag')) {
            finalFullQuestion = `$ContextTag ${userTextOnly}`;
        } else if (rawText.startsWith('SelectedText:')) {
            const contextMatch = rawText.match(/^SelectedText: "[^"]*"\s+/);
            if (contextMatch) {
                finalFullQuestion = contextMatch[0] + userTextOnly;
            }
        }

        // Set the active entry so streaming appends here
        this.currentEntryDiv = entry;
        this.currentAnswerDiv = null;

        // Remove subsequents
        let next = entry.nextElementSibling;
        while (next) {
            const toRemove = next;
            next = next.nextElementSibling;
            toRemove.remove();
        }

        // Remove old answer/separators/steppers
        entry.querySelectorAll('.lumina-chat-answer, .lumina-dict-separator, .lumina-web-search').forEach(el => el.remove());

        // Re-calculate margins (reset)
        this.setInitialEntryHeight(entry, true);

        // Append new loading
        this.showLoading();

        // Submit to callback with the reconstructed question
        if (this.options.onSubmit) {
            this.options.onSubmit(finalFullQuestion, [], { isRecheck: true });
        }
    }

    setInitialEntryHeight(entry, skipScroll = false, preAppendScroll = 0, forceScroll = false) {
        if (!entry || !this.container) return;
        const scrollContainer = this.getScrollContainer();
        if (!scrollContainer) return;
        const container = this.container.querySelector('.lumina-chat-container') || this.container;
        const inputWrapper = this.container.querySelector('.lumina-chat-input-wrapper') || document.body.querySelector('.lumina-chat-input-wrapper');
        const allEntries = this.historyEl.querySelectorAll('.lumina-dict-entry');
        const currentIndex = Array.from(allEntries).indexOf(entry);
        if (LuminaChatUI.applyViewportMinHeight(entry, container, inputWrapper)) {
            this.clearEntryMargins(entry);
            if (!skipScroll && (!this.disableAutoScroll || forceScroll)) {
                const targetScrollTop = LuminaChatUI.calculateInitialScrollTarget(entry, scrollContainer, this.historyEl);
                const { viewportHeight } = LuminaChatUI.getViewportStats(container, inputWrapper);
                const maxScroll = scrollContainer.scrollHeight - viewportHeight;
                scrollContainer.scrollTop = Math.min(targetScrollTop, maxScroll);
            }
        } else {
            setTimeout(() => this.setInitialEntryHeight(entry, skipScroll), 80);
        }
    }
    appendError(text) {
        const div = document.createElement('div');
        div.className = 'lumina-chat-answer';
        div.style.color = 'var(--lumina-error)';
        div.textContent = text;
        if (this.currentEntryDiv) {
            const separator = this.currentEntryDiv.querySelector('.lumina-dict-separator');
            if (separator) {
                this.currentEntryDiv.insertBefore(div, separator);
            } else {
                this.currentEntryDiv.appendChild(div);
                const newSep = document.createElement('div');
                newSep.className = 'lumina-dict-separator';
                this.currentEntryDiv.appendChild(newSep);
            }
            this.adjustEntryMargin(this.currentEntryDiv, 'none');
        } else {
            this.historyEl.appendChild(div);
        }
        this.scrollToBottom();
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
        requestAnimationFrame(() => this.scrollToBottom(true));
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
        this.scrollToBottom(true);
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
                this.showLoading();
            }
        }
    }
    async addFile(file) {
        if (!file) return false;

        if (this._isDocxFile(file)) {
            const sourceAttachmentId = this._createAttachmentId();
            const rawDocx = await this._prepareRawFileAttachment(file);

            if (rawDocx) {
                rawDocx.attachmentId = sourceAttachmentId;
                this._addPreparedFile(rawDocx);
            }

            try {
                const derivedFiles = await this._extractDocxAsAttachments(file);
                derivedFiles.forEach((prepared, idx) => {
                    prepared.attachmentId = `${sourceAttachmentId}:derived:${idx + 1}`;
                    prepared.parentAttachmentId = sourceAttachmentId;
                    prepared.hiddenInPreview = true;
                    this._addPreparedFile(prepared);
                });
            } catch (error) {
                console.warn('[Lumina] DOCX extraction failed; keeping raw DOCX attach:', error);
            }

            if (rawDocx) {
                this.renderFilePreviews();
                this._updateContainerState();
                return true;
            }
        }

        if (this._isXlsxFile(file)) {
            const sourceAttachmentId = this._createAttachmentId();
            const rawXlsx = await this._prepareRawFileAttachment(file);

            if (rawXlsx) {
                rawXlsx.attachmentId = sourceAttachmentId;
                this._addPreparedFile(rawXlsx);
            }

            try {
                const derivedFiles = await this._extractXlsxAsAttachments(file);
                derivedFiles.forEach((prepared, idx) => {
                    prepared.attachmentId = `${sourceAttachmentId}:derived:${idx + 1}`;
                    prepared.parentAttachmentId = sourceAttachmentId;
                    prepared.hiddenInPreview = true;
                    this._addPreparedFile(prepared);
                });
            } catch (error) {
                console.warn('[Lumina] XLSX extraction failed; keeping raw XLSX attach:', error);
            }

            if (rawXlsx) {
                this.renderFilePreviews();
                this._updateContainerState();
                return true;
            }
        }

        try {
            let derivedFiles = [];

            if (derivedFiles.length > 0) {
                derivedFiles.forEach((prepared) => this._addPreparedFile(prepared));
                this.renderFilePreviews();
                this._updateContainerState();
                return true;
            }
        } catch (error) {
            console.warn('[Lumina] Office parsing failed, falling back to raw file attach:', error);
        }

        return await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                const dataUrl = e.target.result;
                const mimeType = file.type;
                const isImage = mimeType.startsWith('image/');
                const isVideo = mimeType.startsWith('video/');
                const isAudio = mimeType.startsWith('audio/');
                const isPDF = mimeType === 'application/pdf';

                let fileObj = {
                    mimeType: mimeType,
                    name: file.name,
                    isImage: isImage,
                    isVideo: isVideo,
                    isAudio: isAudio,
                    isPDF: isPDF,
                    dataUrl: dataUrl
                };
                if (isImage) {
                    fileObj.previewUrl = this._createObjectUrl(file);
                }
                this._addPreparedFile(fileObj);
                this.renderFilePreviews();
                this._updateContainerState();
                resolve(true);
            };
            reader.onerror = () => resolve(false);
            reader.readAsDataURL(file);
        });
    }

    _createAttachmentId() {
        return `att-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    }

    async _readFileAsDataUrl(file) {
        return await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result || '');
            reader.onerror = () => resolve('');
            reader.readAsDataURL(file);
        });
    }

    async _prepareRawFileAttachment(file) {
        const dataUrl = await this._readFileAsDataUrl(file);
        if (!dataUrl) return null;

        const mimeType = file.type;
        const isImage = mimeType.startsWith('image/');
        const isVideo = mimeType.startsWith('video/');
        const isAudio = mimeType.startsWith('audio/');
        const isPDF = mimeType === 'application/pdf';
        const fileObj = {
            mimeType,
            name: file.name,
            isImage,
            isVideo,
            isAudio,
            isPDF,
            dataUrl
        };
        if (isImage) fileObj.previewUrl = this._createObjectUrl(file);
        return fileObj;
    }

    _addPreparedFile(fileObj) {
        if (!fileObj || typeof fileObj !== 'object') return;
        if (fileObj.isImage && !fileObj.previewUrl && fileObj.dataUrl) {
            fileObj.previewUrl = this._resolveImagePreviewSrc(fileObj, fileObj.dataUrl);
        }
        this.attachedFiles.push(fileObj);
        if (fileObj.dataUrl) this.selectedImages.push(fileObj.dataUrl);
    }

    _syncSelectedImagesFromAttachments() {
        this.selectedImages = this.attachedFiles
            .map((file) => file?.dataUrl)
            .filter((dataUrl) => typeof dataUrl === 'string' && dataUrl.length > 0);
    }

    _isXlsxFile(file) {
        const name = (file?.name || '').toLowerCase();
        const mime = (file?.type || '').toLowerCase();
        return mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || name.endsWith('.xlsx');
    }

    _isDocxFile(file) {
        const name = (file?.name || '').toLowerCase();
        const mime = (file?.type || '').toLowerCase();
        return mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || name.endsWith('.docx');
    }

    async _extractXlsxAsAttachments(file) {
        const entries = await this._readZipEntries(await file.arrayBuffer());
        const workbookXml = this._decodeUtf8(entries['xl/workbook.xml']);
        if (!workbookXml) return [];

        const workbookRelsXml = this._decodeUtf8(entries['xl/_rels/workbook.xml.rels']);
        const sharedStringsXml = this._decodeUtf8(entries['xl/sharedStrings.xml']);
        const sharedStrings = this._parseSharedStrings(sharedStringsXml);
        const sheetPathByRelId = this._parseWorkbookRelationships(workbookRelsXml);

        const parser = new DOMParser();
        const workbookDoc = parser.parseFromString(workbookXml, 'application/xml');
        const sheetNodes = Array.from(workbookDoc.getElementsByTagName('sheet'));
        const baseName = (file.name || 'workbook').replace(/\.[^.]+$/, '');
        const attachments = [];

        sheetNodes.forEach((sheetNode, idx) => {
            const relId = sheetNode.getAttribute('r:id');
            const targetPath = relId ? sheetPathByRelId[relId] : '';
            const fallbackPath = `xl/worksheets/sheet${idx + 1}.xml`;
            const sheetPath = targetPath && entries[targetPath] ? targetPath : fallbackPath;
            const sheetXml = this._decodeUtf8(entries[sheetPath]);
            if (!sheetXml) return;

            const sheetName = sheetNode.getAttribute('name') || `Sheet${idx + 1}`;
            const csv = this._sheetXmlToCsv(sheetXml, sharedStrings);
            if (!csv) return;

            const csvName = `${baseName} - ${sheetName}.csv`.replace(/[\\/:*?"<>|]/g, '_');
            const dataUrl = this._textToDataUrl(csv, 'text/csv');
            const base64Data = dataUrl.split(',')[1] || '';

            attachments.push({
                mimeType: 'text/csv',
                name: csvName,
                isImage: false,
                dataUrl,
                data: base64Data
            });
        });

        return attachments;
    }

    async _extractDocxAsAttachments(file) {
        const entries = await this._readZipEntries(await file.arrayBuffer());
        const docXml = this._decodeUtf8(entries['word/document.xml']);
        const baseName = (file.name || 'document').replace(/\.[^.]+$/, '');
        const attachments = [];

        if (docXml) {
            const text = this._docxXmlToText(docXml);
            if (text.trim()) {
                const dataUrl = this._textToDataUrl(text, 'text/plain');
                attachments.push({
                    mimeType: 'text/plain',
                    name: `${baseName}.txt`,
                    isImage: false,
                    dataUrl,
                    data: dataUrl.split(',')[1] || ''
                });
            }
        }

        Object.keys(entries).forEach((path) => {
            if (!path.startsWith('word/media/')) return;
            const mimeType = this._mimeFromExtension(path);
            if (!mimeType || !mimeType.startsWith('image/')) return;

            const bytes = entries[path];
            const dataUrl = this._bytesToDataUrl(bytes, mimeType);
            const fileName = path.split('/').pop() || 'image';
            attachments.push({
                mimeType,
                name: `${baseName} - ${fileName}`,
                isImage: true,
                dataUrl,
                data: dataUrl.split(',')[1] || '',
                previewUrl: this._resolveImagePreviewSrc(null, dataUrl)
            });
        });

        return attachments;
    }

    _parseWorkbookRelationships(xml) {
        if (!xml) return {};
        const parser = new DOMParser();
        const doc = parser.parseFromString(xml, 'application/xml');
        const relNodes = Array.from(doc.getElementsByTagName('Relationship'));
        const out = {};
        relNodes.forEach((node) => {
            const id = node.getAttribute('Id');
            const target = node.getAttribute('Target') || '';
            if (!id || !target) return;
            const normalized = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
            out[id] = normalized.replace(/\\/g, '/');
        });
        return out;
    }

    _parseSharedStrings(xml) {
        if (!xml) return [];
        const parser = new DOMParser();
        const doc = parser.parseFromString(xml, 'application/xml');
        const siNodes = Array.from(doc.getElementsByTagName('si'));
        return siNodes.map((si) => {
            const tNodes = Array.from(si.getElementsByTagName('t'));
            return tNodes.map((t) => t.textContent || '').join('');
        });
    }

    _sheetXmlToCsv(sheetXml, sharedStrings) {
        if (!sheetXml) return '';
        const parser = new DOMParser();
        const doc = parser.parseFromString(sheetXml, 'application/xml');
        const rowNodes = Array.from(doc.getElementsByTagName('row'));
        const lines = [];

        rowNodes.forEach((rowNode) => {
            const cellNodes = Array.from(rowNode.getElementsByTagName('c'));
            const rowValues = [];

            cellNodes.forEach((cell) => {
                const ref = cell.getAttribute('r') || '';
                const t = (cell.getAttribute('t') || '').toLowerCase();
                const vNode = cell.getElementsByTagName('v')[0];
                const isNode = cell.getElementsByTagName('is')[0];

                let value = '';
                if (t === 's' && vNode) {
                    const idx = parseInt(vNode.textContent || '0', 10);
                    value = Number.isFinite(idx) ? (sharedStrings[idx] || '') : '';
                } else if (t === 'inlineStr' && isNode) {
                    value = Array.from(isNode.getElementsByTagName('t')).map((n) => n.textContent || '').join('');
                } else if (vNode) {
                    value = vNode.textContent || '';
                }

                const colIdx = this._columnRefToIndex(ref);
                rowValues[colIdx] = this._escapeCsv(value);
            });

            let last = rowValues.length - 1;
            while (last >= 0 && (rowValues[last] === undefined || rowValues[last] === '')) last -= 1;
            if (last < 0) {
                lines.push('');
            } else {
                lines.push(rowValues.slice(0, last + 1).map((v) => v || '').join(','));
            }
        });

        return lines.join('\n');
    }

    _columnRefToIndex(ref) {
        const match = String(ref || '').match(/[A-Z]+/i);
        if (!match) return 0;
        const letters = match[0].toUpperCase();
        let idx = 0;
        for (let i = 0; i < letters.length; i++) {
            idx = idx * 26 + (letters.charCodeAt(i) - 64);
        }
        return Math.max(0, idx - 1);
    }

    _escapeCsv(value) {
        const raw = String(value == null ? '' : value);
        if (/[",\n\r]/.test(raw)) {
            return `"${raw.replace(/"/g, '""')}"`;
        }
        return raw;
    }

    _docxXmlToText(xml) {
        if (!xml) return '';
        const parser = new DOMParser();
        const doc = parser.parseFromString(xml, 'application/xml');
        const paragraphs = Array.from(doc.getElementsByTagName('w:p'));
        const out = [];
        paragraphs.forEach((p) => {
            const text = Array.from(p.getElementsByTagName('w:t')).map((n) => n.textContent || '').join('');
            out.push(text);
        });
        return out.join('\n').replace(/\n{3,}/g, '\n\n');
    }

    async _readZipEntries(arrayBuffer) {
        const bytes = new Uint8Array(arrayBuffer);
        const view = new DataView(arrayBuffer);
        const eocdOffset = this._findEocdOffset(view);
        if (eocdOffset < 0) throw new Error('Invalid ZIP: EOCD not found');

        const centralDirSize = view.getUint32(eocdOffset + 12, true);
        const centralDirOffset = view.getUint32(eocdOffset + 16, true);
        const entries = {};

        let ptr = centralDirOffset;
        const end = centralDirOffset + centralDirSize;

        while (ptr + 46 <= end && view.getUint32(ptr, true) === 0x02014b50) {
            const compression = view.getUint16(ptr + 10, true);
            const compressedSize = view.getUint32(ptr + 20, true);
            const nameLen = view.getUint16(ptr + 28, true);
            const extraLen = view.getUint16(ptr + 30, true);
            const commentLen = view.getUint16(ptr + 32, true);
            const localHeaderOffset = view.getUint32(ptr + 42, true);

            const nameBytes = bytes.slice(ptr + 46, ptr + 46 + nameLen);
            const fileName = new TextDecoder('utf-8').decode(nameBytes).replace(/\\/g, '/');

            if (view.getUint32(localHeaderOffset, true) !== 0x04034b50) {
                ptr += 46 + nameLen + extraLen + commentLen;
                continue;
            }

            const localNameLen = view.getUint16(localHeaderOffset + 26, true);
            const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
            const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
            const compressedBytes = bytes.slice(dataStart, dataStart + compressedSize);

            if (compression === 0) {
                entries[fileName] = new Uint8Array(compressedBytes);
            } else if (compression === 8) {
                entries[fileName] = await this._inflateRaw(compressedBytes);
            }

            ptr += 46 + nameLen + extraLen + commentLen;
        }

        return entries;
    }

    _findEocdOffset(view) {
        const min = Math.max(0, view.byteLength - 0xffff - 22);
        for (let i = view.byteLength - 22; i >= min; i--) {
            if (view.getUint32(i, true) === 0x06054b50) return i;
        }
        return -1;
    }

    async _inflateRaw(compressedBytes) {
        if (typeof DecompressionStream === 'undefined') {
            throw new Error('DecompressionStream is not available');
        }
        const stream = new Blob([compressedBytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        const out = await new Response(stream).arrayBuffer();
        return new Uint8Array(out);
    }

    _decodeUtf8(bytes) {
        if (!bytes) return '';
        try {
            return new TextDecoder('utf-8').decode(bytes);
        } catch (_) {
            return '';
        }
    }

    _bytesToBase64(bytes) {
        let binary = '';
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
            const chunk = bytes.subarray(i, i + chunkSize);
            binary += String.fromCharCode(...chunk);
        }
        return btoa(binary);
    }

    _bytesToDataUrl(bytes, mimeType) {
        return `data:${mimeType};base64,${this._bytesToBase64(bytes)}`;
    }

    _textToDataUrl(text, mimeType) {
        const bytes = new TextEncoder().encode(text || '');
        return this._bytesToDataUrl(bytes, mimeType || 'text/plain');
    }

    _mimeFromExtension(path) {
        const ext = (String(path || '').split('.').pop() || '').toLowerCase();
        const map = {
            png: 'image/png',
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            gif: 'image/gif',
            webp: 'image/webp',
            bmp: 'image/bmp',
            tif: 'image/tiff',
            tiff: 'image/tiff',
            heic: 'image/heic',
            heif: 'image/heif'
        };
        return map[ext] || '';
    }
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
        if (!file) return;

        const groupId = file.parentAttachmentId || file.attachmentId || null;
        if (groupId) {
            const kept = [];
            this.attachedFiles.forEach((item) => {
                const isGroupRoot = item?.attachmentId === groupId;
                const isGroupChild = item?.parentAttachmentId === groupId;
                if (isGroupRoot || isGroupChild) {
                    this._revokeObjectUrl(item?.previewUrl);
                    return;
                }
                kept.push(item);
            });
            this.attachedFiles = kept;
        } else {
            this._revokeObjectUrl(file?.previewUrl);
            this.attachedFiles.splice(index, 1);
        }

        this._syncSelectedImagesFromAttachments();
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
        const visibleEntries = this.attachedFiles
            .map((file, index) => ({ file, index }))
            .filter(({ file }) => !file?.hiddenInPreview);

        if (visibleEntries.length === 0) {
            this.imagePreviewEl.innerHTML = '';
            return;
        }
        const listDiv = document.createElement('div');
        listDiv.className = 'lumina-image-list';
        visibleEntries.forEach(({ file, index }) => {
            const itemDiv = document.createElement('div');
            itemDiv.className = `lumina-image-preview-item ${!file.isImage ? 'is-file' : ''}`;
            itemDiv.title = file.name;
            let content = '';
            if (file.isImage) {
                content = `<img src="${file.previewUrl || file.dataUrl}" alt="${file.name}">`;
            } else {
                const fileName = file.name || 'File';
                const rawExt = fileName.includes('.') ? fileName.split('.').pop() : '';
                const ext = (rawExt || '').toLowerCase();
                const category = LuminaChatUI.inferFileCategory(ext, file.mimeType || '');
                const icon = LuminaChatUI.getFileIconByCategory(category);
                const displayName = LuminaChatUI.getDisplayFileName(fileName);
                const typeLabel = LuminaChatUI.getFileTypeLabel(file);
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
    _smoothScrollTo(targetScrollTop, _durationUnused = 1250) {
        const scrollContainer = this.getScrollContainer();
        if (!scrollContainer) return;
        if (this._scrollAnimationId) {
            cancelAnimationFrame(this._scrollAnimationId);
            this._scrollAnimationId = null;
        }
        scrollContainer.scrollTop = targetScrollTop;
        if (this._pendingMarginEntry) {
            this.adjustEntryMargin(this._pendingMarginEntry, 'none');
            this._pendingMarginEntry = null;
        }
    }
    scrollToBottom(force = false) {
        if (!force && (this.disableAutoScroll || this.disableStreamAutoFollow)) return;
        const scrollContainer = this.getScrollContainer();
        if (scrollContainer) {
            scrollContainer.scrollTop = scrollContainer.scrollHeight;
        }
    }
    static scrollToBottom(scrollContainer, targetElement = null) {
        if (!scrollContainer) return;
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
    }
    static scrollToElement(targetElement, scrollContainer) {
        return;
    }
    clearHistory() {
        if (this.historyEl) {
            this.historyEl.innerHTML = '';
        }
        this.currentEntryDiv = null;
        this.currentAnswerDiv = null;
        this.clearImages();
    }
    escapeHTMLAttr(str) {
        if (!str) return '';
        return str.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    static balanceTranslationCard(entry) {
        if (!entry) return;
        const card = entry.querySelector('.lumina-translation-card');
        if (!card) return;

        const sourceBlock = card.querySelector(':scope > .lumina-translation-block') || card.querySelector('.lumina-translation-block');
        let activeVersionBlock = card.querySelector('.lumina-answer-version.active .lumina-translation-block');

        // Fallback for non-versioned layouts (simple row format)
        if (!activeVersionBlock) {
            const blocks = card.querySelectorAll(':scope > .lumina-translation-block, .lumina-translation-block');
            if (blocks.length >= 2) {
                activeVersionBlock = blocks[blocks.length - 1];
            }
        }

        if (!sourceBlock || !activeVersionBlock) return;
        const left = sourceBlock;
        const right = activeVersionBlock;
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
            return left.offsetHeight;
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
    appendPartialTranslation(text) {
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
        const scrollContainer = this.getScrollContainer();
        const preAppendScroll = scrollContainer ? scrollContainer.scrollTop : 0;
        this.historyEl.appendChild(div);

        this.disableAutoScroll = false;
        requestAnimationFrame(() => {
            this.setInitialEntryHeight(div, false, preAppendScroll, true);
        });
        return div;
    }
    updatePartialTranslation(element, data) {
        if (!element) return;
        if (typeof data === 'string') {
            data = { translation: data, type: 'sentence' };
        }
        if (!data.original) {
            const sourceDiv = element.querySelector('.lumina-translation-source');
            if (sourceDiv) {
                data.original = sourceDiv.getAttribute('data-copy-text') || sourceDiv.textContent.trim();
            }
        }
        const safeOriginal = this.escapeHTMLAttr(data.original || '');
        const safeTranslation = this.escapeHTMLAttr(data.translation || '');
        element.__translationHighlightDone = false;
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
        const separator = document.createElement('div');
        separator.className = 'lumina-dict-separator';
        element.appendChild(separator);
        delete element.dataset.partial;
        this.adjustEntryMargin(element);
        requestAnimationFrame(() => LuminaChatUI._setupTranslationHighlight(element));
        LuminaChatUI.balanceTranslationCard(element);
        const regenBtn = this.container.querySelector('#lumina-regenerate-btn') ||
            this.container.querySelector('.lumina-regenerate-btn') ||
            document.getElementById('lumina-regenerate-btn') ||
            document.querySelector('.lumina-regenerate-btn');
        if (regenBtn) {
            regenBtn.style.display = 'flex';
        }

        if (!this.disableStreamAutoFollow) {
            requestAnimationFrame(() => this.scrollToBottom());
        }
    }

    /**
     * Handle Dictionary Lookup
     */
    async handleDictionary(word) {
        const entryDiv = this.appendPartialDictionary(word);

        try {
            // First try English-Vietnamese
            let response = await chrome.runtime.sendMessage({ action: 'fetch_cambridge_en_vi', word: word });

            // If fails or no results, try English-English
            if (!response || !response.success || response.error) {
                response = await chrome.runtime.sendMessage({ action: 'fetch_cambridge', word: word });
            }

            if (response && response.success && response.html) {
                const parsed = CambridgeParser.parse(response.html);
                if (parsed && parsed.entries && parsed.entries.length > 0) {
                    this.updatePartialDictionary(entryDiv, parsed);
                } else {
                    // Fallback to AI lookup if Cambridge returns nothing
                    this.updatePartialDictionary(entryDiv, { word: word, error: 'No dictionary entry found. Trying AI...' });
                    this.handleAIDictionary(word, entryDiv);
                }
            } else {
                throw new Error(response?.error || 'Failed to fetch dictionary');
            }
        } catch (err) {
            console.error('[Lumina] Dictionary lookup failed:', err);
            this.updatePartialDictionary(entryDiv, { word: word, error: err.message });
        }
    }

    async handleAIDictionary(word, existingEntry = null) {
        let entryDiv = existingEntry;
        if (!entryDiv) {
            entryDiv = this.appendPartialDictionary(word);
        }

        try {
            const response = await chrome.runtime.sendMessage({ action: 'fetch_ai_dict', word: word });
            if (response && response.success && response.data) {
                this.updatePartialDictionary(entryDiv, response.data);
            } else {
                throw new Error(response?.error || 'AI Lookup failed');
            }
        } catch (err) {
            this.updatePartialDictionary(entryDiv, { word: word, error: 'Dictionary unavailable: ' + err.message });
        }
    }

    appendPartialDictionary(word) {
        this.clearEntryMargins();
        const div = document.createElement('div');
        div.className = 'lumina-dict-entry lumina-fade-in';
        div.dataset.entryType = 'lookup';
        div.dataset.partial = 'true';
        div.dataset.word = word;

        div.innerHTML = `
            <div class="lumina-chat-question lookup-question">Define: ${word}</div>
            <div class="lumina-chat-answer">
                <div class="lumina-dict-loading">
                    ${this.getLoadingHTML()}
                </div>
            </div>
            <div class="lumina-dict-separator"></div>
        `;

        const scrollContainer = this.getScrollContainer();
        const preAppendScroll = scrollContainer ? scrollContainer.scrollTop : 0;
        this.historyEl.appendChild(div);

        this.disableAutoScroll = false;
        requestAnimationFrame(() => {
            this.setInitialEntryHeight(div, false, preAppendScroll, true);
        });
        return div;
    }

    updatePartialDictionary(element, data) {
        if (!element) return;

        const answerEl = element.querySelector('.lumina-chat-answer');
        if (!answerEl) return;

        if (data.error && !data.entries) {
            answerEl.innerHTML = `<div class="lumina-error-message">${data.error}</div>`;
        } else {
            answerEl.innerHTML = this.renderDictionaryEntry(data);
            // Re-attach audio listeners
            answerEl.querySelectorAll('.lumina-dict-audio-btn').forEach(btn => {
                btn.onclick = () => this.playAudio(btn.dataset.url);
            });
        }

        delete element.dataset.partial;
        this.adjustEntryMargin(element);

        if (!this.disableStreamAutoFollow) {
            requestAnimationFrame(() => this.scrollToBottom());
        }
    }

    renderDictionaryEntry(data) {
        if (!data || !data.entries || data.entries.length === 0) {
            return `<div class="lumina-error-message">No entries found for "${data.word}"</div>`;
        }

        let html = `
            <div class="lumina-dict-card">
                <div class="lumina-dict-header">
                    <span class="lumina-dict-word">${data.word}</span>
                </div>
        `;

        data.entries.forEach(entry => {
            html += `
                <div class="lumina-dict-item">
                    <div class="lumina-dict-meta">
                        ${entry.pos ? `<span class="lumina-dict-pos">${entry.pos}</span>` : ''}
                        ${entry.uk?.ipa ? `
                            <span class="lumina-dict-ipa-group">
                                <span class="lumina-dict-region">UK</span>
                                <span class="lumina-dict-ipa">/${entry.uk.ipa}/</span>
                                ${entry.uk.audio ? `<button class="lumina-dict-audio-btn" data-url="${entry.uk.audio}" title="Play UK Audio">
                                    <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M12 3v9.28c-.47-.17-.97-.28-1.5-.28C8.01 12 6 14.01 6 16.5S8.01 21 10.5 21c2.31 0 4.2-1.75 4.45-4H15V6h4V3h-7z"/></svg>
                                </button>` : ''}
                            </span>
                        ` : ''}
                        ${entry.us?.ipa ? `
                            <span class="lumina-dict-ipa-group">
                                <span class="lumina-dict-region">US</span>
                                <span class="lumina-dict-ipa">/${entry.us.ipa}/</span>
                                ${entry.us.audio ? `<button class="lumina-dict-audio-btn" data-url="${entry.us.audio}" title="Play US Audio">
                                    <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M12 3v9.28c-.47-.17-.97-.28-1.5-.28C8.01 12 6 14.01 6 16.5S8.01 21 10.5 21c2.31 0 4.2-1.75 4.45-4H15V6h4V3h-7z"/></svg>
                                </button>` : ''}
                            </span>
                        ` : ''}
                    </div>
                    <div class="lumina-dict-senses">
            `;

            entry.senses.forEach(sense => {
                html += `<div class="lumina-dict-sense">`;
                if (sense.indicator) {
                    html += `<div class="lumina-dict-indicator">${sense.indicator}</div>`;
                }

                sense.definitions.forEach(def => {
                    html += `
                        <div class="lumina-dict-def-block">
                            <div class="lumina-dict-meaning-text">${def.meaning}</div>
                            ${def.translation ? `<div class="lumina-dict-translation">${def.translation}</div>` : ''}
                            ${def.examples && def.examples.length > 0 ? `
                                <div class="lumina-dict-example">"${def.examples[0]}"</div>
                            ` : ''}
                        </div>
                    `;
                });
                html += `</div>`;
            });

            html += `
                    </div>
                </div>
            `;
        });

        html += `</div>`;
        return html;
    }

    async playAudio(url) {
        if (!url) return;
        try {
            const audio = new Audio(url);
            await audio.play();
        } catch (err) {
            console.error('[Lumina] Failed to play audio:', err);
        }
    }

    static _setupTranslationHighlight(element) {
        if (!element || element.__translationHighlightDone) return;
        const sourceTextEl = element.querySelector('.lumina-translation-source .lumina-translation-text');
        const targetTextEl = element.querySelector('.lumina-translation-target .lumina-translation-text');
        if (!sourceTextEl || !targetTextEl) return;
        const splitSentences = (text) => {
            const initialParts = [];
            const re = /[\s\S]*?[.!?。！？]+(?:\s+|$|(?=[A-Z]))/g;
            let match;
            let lastIndex = 0;
            while ((match = re.exec(text)) !== null) {
                initialParts.push(match[0]);
                lastIndex = re.lastIndex;
            }
            if (lastIndex < text.length) {
                const remaining = text.slice(lastIndex);
                if (remaining) initialParts.push(remaining);
            }
            if (initialParts.length <= 1) return initialParts.length ? initialParts : [text];
            const finalParts = [];
            for (let i = 0; i < initialParts.length; i++) {
                const part = initialParts[i];
                const trimmed = part.trim();
                const isBullet = trimmed.length <= 3 && /^[A-Za-z0-9][\.\)]?$/i.test(trimmed);
                const endsWithAbbr = /(?:^|\s)(?:St|Dr|Mr|Mrs|Ms|Prof|Inc|Ltd|Co|Approx|Vs|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.$/i.test(trimmed);
                const endsWithInitial = /(?:^|\s)[A-Z]\.$/.test(trimmed);
                if ((isBullet || endsWithAbbr || endsWithInitial) && i < initialParts.length - 1) {
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
                .join('');
        };
        wrapSentences(sourceTextEl, sourceSentences);
        wrapSentences(targetTextEl, targetSentences);
        const sourceSpans = Array.from(sourceTextEl.querySelectorAll('.lumina-trans-sentence'));
        const targetSpans = Array.from(targetTextEl.querySelectorAll('.lumina-trans-sentence'));
        const allSpans = [...sourceSpans, ...targetSpans];
        const maxIdx = Math.max(sourceSentences.length, targetSentences.length) - 1;
        const clampIdx = (idx, arr) =>
            maxIdx === 0 ? 0 : Math.round((idx / maxIdx) * (arr.length - 1));
        const clearAll = () => allSpans.forEach(s => s.classList.remove('hovered'));
        const handleHover = (e, index, spans, mirrors) => {
            const target = e.target.closest('.lumina-trans-sentence');
            if (target) {
                const idx = parseInt(target.dataset.idx);
                clearAll();
                const currentSpans = spans.filter(s => parseInt(s.dataset.idx) === idx);
                currentSpans.forEach(s => s.classList.add('hovered'));
                const mirrorIdx = clampIdx(idx, mirrors);
                const mirrorSpans = mirrors.filter(s => parseInt(s.dataset.idx) === mirrorIdx);
                mirrorSpans.forEach(s => s.classList.add('hovered'));
            }
        };
        sourceTextEl.addEventListener('mouseover', (e) => handleHover(e, null, sourceSpans, targetSpans));
        targetTextEl.addEventListener('mouseover', (e) => handleHover(e, null, targetSpans, sourceSpans));
        sourceTextEl.addEventListener('mouseleave', clearAll);
        targetTextEl.addEventListener('mouseleave', clearAll);
        element.__translationHighlightDone = true;
    }
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
    collectComments(contextEntry = null) {
        if (!this.historyEl) return { instructions: '', draft: '' };

        let entries = Array.from(this.historyEl.querySelectorAll('.lumina-dict-entry'));
        if (contextEntry) {
            const idx = entries.indexOf(contextEntry);
            if (idx !== -1) {
                entries = entries.slice(0, idx);
            }
        }
        entries.reverse();

        let collected = [];
        let draft = '';
        
        // Find most recent draft
        for (const entry of entries) {
            const answerEl = entry.querySelector('.lumina-chat-answer');
            if (answerEl) {
                draft = answerEl.getAttribute('data-raw-text') || answerEl.textContent.trim();
                
                // If this entry has highlights, collect them and we are done
                const highlights = entry.querySelectorAll('.lumina-comment-highlight');
                if (highlights.length > 0) {
                    highlights.forEach(span => {
                        const text = span.textContent.trim();
                        const comment = span.dataset.comment;
                        if (text && comment) {
                            collected.push(`* Change "${text}" because: ${comment}`);
                        }
                    });
                }
                break; // Found the draft and potentially its highlights
            }
        }

        return {
            instructions: collected.join('\n'),
            draft: draft
        };
    }

    gatherMessages() {
        const messages = [];
        const entries = this.historyEl.querySelectorAll('.lumina-dict-entry');
        const allTranscriptContainers = this.historyEl.querySelectorAll('.lumina-youtube-transcript-container');
        const latestTranscriptContainer = allTranscriptContainers.length > 0 ? allTranscriptContainers[allTranscriptContainers.length - 1] : null;
        entries.forEach(entry => {
            const entryType = entry.dataset.entryType || 'qa';

            // Special handling for Translation entries (Dual Pane)
            if (entryType === 'translation') {
                const sourceEl = entry.querySelector('.lumina-translation-source');
                const targetEl = entry.querySelector('.lumina-translation-target');
                if (sourceEl && targetEl) {
                    const sourceText = sourceEl.getAttribute('data-copy-text') || sourceEl.textContent.trim();
                    const targetText = targetEl.getAttribute('data-copy-text') || targetEl.textContent.trim();
                    if (sourceText) {
                        messages.push({ role: 'user', text: `Translate: ${sourceText}` });
                    }
                    if (targetText && !targetText.includes('lumina-loading')) {
                        messages.push({ role: 'model', text: targetText });
                    }
                }
                return;
            }

            // Standard QA or other entries
            const questionEl = entry.querySelector('.lumina-chat-question');
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

                questionText = questionText.replace(/\[Current Webpage Context\][\s\S]*?---[\s\n]*/g, '');
                questionText = questionText.replace(/\[Context from current page\]:[\s\S]*?\[Instruction\]:[\s\n]*/g, '');
                questionText = questionText.trim();
                
                // Process @Comment trigger in history
                if (questionText.indexOf('@Comment') !== -1 || questionText.indexOf('@comment') !== -1) {
                    const result = this.collectComments(entry);
                    if (result.instructions || result.draft) {
                        const combinedFeedback = questionText.replace(/@Comment/gi, '').trim();
                        let prompt = `[Iteration Instruction]: Apply the following feedback to the draft below.\n\n[DRAFT]:\n${result.draft}\n`;
                        if (combinedFeedback) prompt += `\n[GLOBAL INSTRUCTION]:\n${combinedFeedback}\n`;
                        if (result.instructions) prompt += `\n[SPECIFIC COMMENTS]:\n${result.instructions}\n`;
                        prompt += `\nOutput only the revised text.`;
                        questionText = prompt;
                    }
                }


                if (entryType === 'proofread' && questionText === 'Proofread') {
                    const originalEl = entry.querySelector('.lumina-proofread-original');
                    if (originalEl) questionText = `Proofread: ${originalEl.textContent.trim()}`;
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
    getTranscriptVideoId() {
        if (!this.historyEl) return null;
        const transcriptContainers = this.historyEl.querySelectorAll('.lumina-youtube-transcript-container');
        if (transcriptContainers && transcriptContainers.length > 0) {
            const latestContainer = transcriptContainers[transcriptContainers.length - 1];
            return latestContainer.dataset.videoId || null;
        }
        return null;
    }
    static getChatInputHTML(autofocus = false) {
        return `
          <div class="lumina-chat-input-wrapper">
            <div class="lumina-web-chips-container" id="web-chips-container"></div>
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
                    <textarea id="${autofocus ? 'chat-input' : 'chat-input-secondary'}" class="lumina-chat-input" placeholder="Ask anything..." rows="1"></textarea>

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
                        <button class="lumina-stop-btn" id="lumina-stop-btn" style="display: none;">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
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
        this.isProofreadMode = this.isProofreadMode || false;
        this.isTranslateMode = this.isTranslateMode || false;
        const getModes = () => ({ pr: this.isProofreadMode, tr: this.isTranslateMode });
        const setProofread = (v) => { this.isProofreadMode = v; };
        const setTranslate = (v) => { this.isTranslateMode = v; };
        const history = queryInPopup('.lumina-chat-history') || queryInPopup('.lumina-chat-scroll-content');
        const inputWrapper = queryInPopup('.lumina-chat-input-wrapper');

        if (inputWrapper) {
            inputWrapper.addEventListener('mousedown', (e) => {
                // Ignore clicks on buttons, links, the input itself, or dropdowns
                const interactiveSelector = 'button, textarea, a, .lumina-model-dropdown, .lumina-tools-dropdown, .lumina-mention-popup';
                const isInteractive = e.target.closest(interactiveSelector);

                if (!isInteractive) {
                    e.preventDefault();
                    input.focus();

                    // Move cursor to the end
                    const len = input.value.length;
                    input.setSelectionRange(len, len);

                    // Ensure the input is expanded if needed
                    if (typeof this._checkExpand === 'function') this._checkExpand();
                }
            });
        }
        // Regenerate button was removed from input bar per user request.

        this.readWebpageEnabled = false;
        this.currentPageTitle = "Current Page";

        // Synchronize with global "Read webpage" setting
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.get(['readWebpage', 'advancedParamsByModel'], (data) => {
                if (data.readWebpage !== undefined) {
                    this.readWebpageEnabled = !!data.readWebpage;
                }
                if (data.advancedParamsByModel) {
                    this.advancedParamsByModel = data.advancedParamsByModel;
                }
            });

            chrome.storage.onChanged.addListener((changes, area) => {
                if (area === 'local') {
                    if (changes.readWebpage) {
                        this.readWebpageEnabled = !!changes.readWebpage.newValue;
                    }
                    if (changes.advancedParamsByModel) {
                        this.advancedParamsByModel = changes.advancedParamsByModel.newValue;
                    }
                }
            });
        }

        this.refreshReadPageTitle = () => {
            if (typeof chrome !== 'undefined' && chrome.tabs) {
                chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
                    if (tabs && tabs[0]) {
                        this.currentPageTitle = tabs[0].title || "Current Page";
                    }
                });
            } else if (typeof document !== 'undefined' && document.title && document.title !== 'Lumina') {
                this.currentPageTitle = document.title;
            }
        };

        this.refreshReadPageTitle();
        setInterval(() => this.refreshReadPageTitle(), 5000);
        let shadowMeasurer = popup.querySelector('.lumina-shadow-measurer');
        const checkExpand = () => {
            if (!inputBar) return;
            const { pr, tr } = getModes();
            if (pr || this._pendingWebSource || input.value.includes('\n')) {
                inputBar.classList.add('expanded');
                requestAnimationFrame(() => {
                    input.style.height = 'auto';
                    input.style.height = input.scrollHeight + 'px';
                });
                return;
            }
            if (!shadowMeasurer) {
                shadowMeasurer = document.createElement('div');
                shadowMeasurer.className = 'lumina-shadow-measurer';
                Object.assign(shadowMeasurer.style, { position: 'absolute', visibility: 'hidden', pointerEvents: 'none', display: 'block', left: '-9999px', top: '0', width: 'auto', border: 'none', margin: '0', minHeight: '0', maxHeight: 'none' });
                popup.appendChild(shadowMeasurer);
            }
            const currentStyle = window.getComputedStyle(input);
            ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'padding', 'boxSizing', 'whiteSpace', 'wordBreak'].forEach(prop => {
                shadowMeasurer.style[prop] = currentStyle[prop];
            });
            const inputContainer = queryInPopup('.lumina-input-container');
            if (!inputContainer) return;
            const containerWidth = inputContainer.clientWidth;
            if (containerWidth <= 0) return;
            const actualInputWidth = input.clientWidth;
            shadowMeasurer.style.width = (actualInputWidth > 0 ? actualInputWidth : Math.max(containerWidth - 100, 50)) + 'px';
            shadowMeasurer.textContent = 'M';
            shadowMeasurer.dataset.baseHeight = shadowMeasurer.scrollHeight;
            shadowMeasurer.textContent = '';
            const isAnyToolActive = pr || tr;
            let textCollidesWithSelector = false;
            const modelSelectorEl = queryInPopup('.lumina-model-selector') || queryInPopup('#model-selector');
            if (modelSelectorEl) {
                const toolsWrapperEl = queryInPopup('.lumina-actions-dropdown-wrapper') || queryInPopup('#tools-wrapper');
                const trailingGroupEl = queryInPopup('.lumina-trailing-group');
                const controlsWidth = (toolsWrapperEl ? toolsWrapperEl.offsetWidth : 0)
                    + (modelSelectorEl ? modelSelectorEl.offsetWidth : 0)
                    + (trailingGroupEl ? trailingGroupEl.offsetWidth : 0)
                    + 28;
                const stableAvailableWidth = Math.max(containerWidth - controlsWidth, 40);
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
                const isCurrentlyExpanded = inputBar.classList.contains('expanded');
                const expandThreshold = stableAvailableWidth - 8;
                const collapseThreshold = stableAvailableWidth - 36;
                if (!isCurrentlyExpanded) {
                    textCollidesWithSelector = singleLineWidth >= expandThreshold;
                } else {
                    textCollidesWithSelector = singleLineWidth >= collapseThreshold;
                }
            }
            const isCurrentlyExpanded = inputBar.classList.contains('expanded');
            let finalExpandState;
            if (isCurrentlyExpanded) {
                const hasText = input.value.trim().length > 0;
                finalExpandState = hasText || isAnyToolActive || textCollidesWithSelector;
            } else {
                const baseHeight = parseFloat(shadowMeasurer.dataset.baseHeight) || 30;
                finalExpandState = (input.scrollHeight > baseHeight + 4) || isAnyToolActive || textCollidesWithSelector;
            }
            if (this.options.alwaysExpanded || finalExpandState) {
                inputBar.classList.add('expanded');
            } else {
                inputBar.classList.remove('expanded');
            }
            input.style.removeProperty('height');
        };
        const debouncedCheckExpand = (immediate = false) => {
            checkExpand();
        };
        this._checkExpand = checkExpand;
        if (typeof ResizeObserver !== 'undefined') {
            const resizeTarget = queryInPopup('.lumina-input-container') || inputBar;
            if (resizeTarget) {
                const ro = new ResizeObserver(() => debouncedCheckExpand());
                ro.observe(resizeTarget);
                this._inputResizeObserver = ro;
            }
        }
        input.addEventListener('focus', () => { this._updateContainerState(); debouncedCheckExpand(true); });
        input.addEventListener('blur', () => { setTimeout(() => { this._updateContainerState(); }, 100); setTimeout(() => debouncedCheckExpand(true), 100); });
        input.addEventListener('input', () => {
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
            debouncedCheckExpand();
            this._updateContainerState();
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
        input.addEventListener('keydown', async (e) => {
            const isMentionActive = this.container.querySelector('.lumina-mention-popup.active');
            if (e.key === 'Enter' && !e.shiftKey && !e.defaultPrevented && !isMentionActive) {
                e.preventDefault();
                const text = input.value.trim();
                if (!text && this.selectedImages.length === 0) return;

                const inputContainer = queryInPopup('.lumina-input-container');
                if (inputContainer) {
                    inputContainer.classList.remove('lumina-sending');
                    void inputContainer.offsetWidth; // trigger reflow
                    inputContainer.classList.add('lumina-sending');
                    setTimeout(() => inputContainer.classList.remove('lumina-sending'), 900);
                }

                // Ensure history interaction listeners are active if not already
                if (this.historyEl && !this.historyEl._luminaListenersAttached) {
                    this.initListeners(this.historyEl);
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
        const toolsWrapper = queryInPopup('#tools-wrapper') || queryInPopup('.lumina-actions-dropdown-wrapper');
        const toolsToggle = queryInPopup('#tools-toggle') || queryInPopup('.lumina-plus-toggle');
        const toolsDropdown = queryInPopup('#tools-dropdown') || queryInPopup('.lumina-tools-dropdown');
        if (toolsWrapper && toolsToggle && !toolsToggle.dataset.setupDone) {
            toolsToggle.dataset.setupDone = 'true';
            const toggleTools = (show) => {
                const modelDropdown = queryInPopup('.lumina-model-dropdown');
                const modelWasActive = modelDropdown && modelDropdown.classList.contains('active');
                if (modelDropdown) modelDropdown.classList.remove('active');
                const isActive = toolsWrapper.classList.contains('active') || (toolsDropdown && toolsDropdown.classList.contains('active'));
                if (show === undefined) {
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
            popup.querySelectorAll('.lumina-tool-item').forEach(el => el.classList.remove('active'));
            checkExpand();
        };
        this._removeActiveModes = removeActiveModes;
        const setupTool = (sel, toggleSel, modeSetter, placeholder) => {
            const item = queryInPopup(sel);
            if (item) item.addEventListener('click', (e) => {
                e.stopPropagation(); removeActiveModes(); modeSetter();
                item.classList.add('active');
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
            this.fileInputEl.accept = "*/*";
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

        // In Spotlight page, prevent browser navigation when dropping files anywhere.
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
    getInputState() {
        return {
            text: this.inputEl ? this.inputEl.value : '',
            isProofreadMode: this.isProofreadMode || false,
            isTranslateMode: this.isTranslateMode || false,
            placeholder: this.inputEl ? this.inputEl.placeholder : 'Ask anything...'
        };
    }
    restoreInputState(state) {
        if (!this.inputEl) return;
        const queryInPopup = (selector) => this.container.querySelector(selector) || document.querySelector(selector);
        if (this._removeActiveModes) this._removeActiveModes();
        if (!state) {
            this.inputEl.value = '';
            this.inputEl.style.height = 'auto';
            this.inputEl.placeholder = 'Ask anything...';
            if (this._checkExpand) this._checkExpand();
            this._updateContainerState();
            return;
        }
        if (state.text !== undefined) {
            this.inputEl.value = state.text;
            this.inputEl.style.height = 'auto';
            this.inputEl.style.height = this.inputEl.scrollHeight + 'px';
        }
        this.inputEl.placeholder = state.placeholder || 'Ask anything...';
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
        if (this._checkExpand) this._checkExpand();
        this._updateContainerState();
    }
    _setupMentions() {
        if (!document.getElementById('lumina-mention-styles')) {
            const style = document.createElement('style');
            style.id = 'lumina-mention-styles';
            style.textContent = `
                .lumina-mention-popup {
                    position: absolute;
                    bottom: 100%;
                    left: 0;
                    width: 160px;
                    background-color: var(--lumina-bg-primary);
                    border: 1px solid var(--lumina-border);
                    border-radius: 12px;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
                    z-index: 10000;
                    display: none;
                    flex-direction: column;
                    padding: 4px;
                    margin-bottom: 8px;
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
                    border-radius: 8px;
                    font-size: 13px;
                    font-weight: 500;
                    color: var(--lumina-text-primary);
                    transition: all 0.1s ease;
                    border: none;
                    background: transparent;
                    width: calc(100% - 8px);
                    margin: 0 4px;
                    text-align: left;
                }
                .lumina-mention-item.selected, .lumina-mention-item:hover {
                    background: var(--lumina-primary-bg-light, rgba(0, 122, 255, 0.1)) !important;
                    color: var(--lumina-primary, #007aff) !important;
                    outline: 2px solid var(--lumina-primary);
                    outline-offset: -2px;
                }
                .lumina-mention-item span:first-child {
                    font-size: 14px;
                    display: flex;
                    align-items: center;
                }
            `;
            document.head.appendChild(style);
        }
        const wrapper = this.inputEl.parentElement;
        if (!wrapper) return;
        const computed = window.getComputedStyle(wrapper);
        if (computed.position === 'static') wrapper.style.position = 'relative';
        
        let popup = wrapper.querySelector('.lumina-mention-popup');
        if (!popup) {
            popup = document.createElement('div');
            popup.className = 'lumina-mention-popup';
            wrapper.appendChild(popup);
        }
        
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
                    selectItem(p);
                });
                popup.appendChild(el);
            });
            popup.classList.add('active');
        };
        
        const selectItem = (v) => {
            const val = this.inputEl.value;
            const trigger = popup.dataset.trigger || '$';
            const lastTrigger = val.lastIndexOf(trigger);
            if (lastTrigger !== -1) {
                const before = val.substring(0, lastTrigger);
                const after = val.substring(this.inputEl.selectionEnd);
                this.inputEl.value = before + trigger + v.name + ' ' + after;
                
                // Set cursor position after inserted text
                const newPos = before.length + trigger.length + v.name.length + 1;
                this.inputEl.setSelectionRange(newPos, newPos);
            }
            hidePopup();
            this.inputEl.focus();
            
            // Trigger input event to handle mode detection
            this.inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        };
        
        this.inputEl.addEventListener('input', (e) => {
            const val = this.inputEl.value;
            const cursorPos = this.inputEl.selectionStart;
            const textBeforeCursor = val.slice(0, cursorPos);
            
            // Check for triggers: $ or @
            const dollarIndex = textBeforeCursor.lastIndexOf('$');
            const atIndex = textBeforeCursor.lastIndexOf('@');
            
            // Use the closer trigger
            const lastTriggerIndex = Math.max(dollarIndex, atIndex);
            if (lastTriggerIndex !== -1) {
                const trigger = val[lastTriggerIndex];
                const charBefore = lastTriggerIndex > 0 ? val[lastTriggerIndex - 1] : ' ';
                
                if (charBefore === ' ' || charBefore === '\n' || charBefore === '>') {
                    const query = textBeforeCursor.substring(lastTriggerIndex + 1).toLowerCase();
                    if (!query.includes(' ')) {
                        let options = [];
                        if (trigger === '$') {
                            options = [
                                { name: 'SelectedText', icon: '📝' },
                                { name: 'Sentence', icon: '📝' },
                                { name: 'Paragraph', icon: '📝' },
                                { name: 'Container', icon: '📦' }
                            ];
                        } else if (trigger === '@') {
                            options = [
                                { name: 'Comment', icon: '💬' }
                            ];
                        }
                        
                        const matches = options.filter(v => v.name.toLowerCase().includes(query));
                        if (matches.length > 0) {
                            selectedIndex = 0;
                            popup.dataset.trigger = trigger;
                            popup.dataset.type = trigger === '$' ? 'variable' : 'command';
                            popup.dataset.matches = JSON.stringify(matches);
                            renderPopup(matches);
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
                e.stopPropagation();
                selectedIndex = (selectedIndex + 1) % matches.length;
                renderPopup(matches);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                e.stopPropagation();
                selectedIndex = (selectedIndex - 1 + matches.length) % matches.length;
                renderPopup(matches);
            } else if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                e.stopPropagation();
                selectItem(matches[selectedIndex]);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                hidePopup();
            }
        }, { capture: true });
        
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
        const self = this;
        const render = (data) => {
            const chain = data.modelChains?.text || [];
            let currentModel = self.activeTabModel?.model;
            let currentProviderId = self.activeTabModel?.providerId;
            const lastUsed = data.lastUsedModel;
            if (!currentModel && lastUsed && lastUsed.model) {
                currentModel = lastUsed.model;
                currentProviderId = lastUsed.providerId;
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
                    self.activeTabModel = { model: item.model, providerId: item.providerId };
                    chrome.storage.local.set({ lastUsedModel: self.activeTabModel });
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
        const selectorWrapper = selector;
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
    _getMaxTokens() {
        let maxTokens = null;
        const modelLabel = this.container ? this.container.querySelector('.lumina-current-model') : null;
        const currentModel = modelLabel ? modelLabel.textContent : (this.options.isSpotlight ? 'gpt-4o' : '');

        if (this.advancedParamsByModel && currentModel) {
            for (const key in this.advancedParamsByModel) {
                if (key.endsWith(`:${currentModel}`)) {
                    const params = this.advancedParamsByModel[key];
                    if (params.maxTokens !== undefined && params.maxTokens !== "" && params.maxTokens !== null) {
                        maxTokens = params.maxTokens;
                        break;
                    }
                }
            }
        }
        return maxTokens;
    }

    _handleSubmit() {
        const text = this.inputEl.value.trim();
        if (!text && this.attachedFiles.length === 0) return;
        const inputContainer = this.container ? this.container.querySelector('.lumina-input-container') : null;
        if (inputContainer) {
            inputContainer.classList.remove('lumina-sending');
            void inputContainer.offsetWidth;
            inputContainer.classList.add('lumina-sending');
            setTimeout(() => inputContainer.classList.remove('lumina-sending'), 900);
        }

        const readPage = !!this.readWebpageEnabled;
        const pageTitle = this.currentPageTitle || "Current Page";
        const maxTokens = this._getMaxTokens();

        if (this.options.onSubmit) {
            const submitFiles = this.attachedFiles.map(file => ({ ...file }));
            this.options.onSubmit(text, submitFiles, { readPage, pageTitle, maxTokens });
        }
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
    showStopButton(onStop = null) {
        let stopBtn = null;
        if (this.container) {
            stopBtn = this.container.querySelector('#lumina-stop-btn') || this.container.querySelector('.lumina-stop-btn');
        }
        if (!stopBtn && this.inputPaneEl) {
            stopBtn = this.inputPaneEl.querySelector('#lumina-stop-btn') || this.inputPaneEl.querySelector('.lumina-stop-btn');
        }
        if (!stopBtn && typeof document !== 'undefined') {
            stopBtn = document.getElementById('lumina-stop-btn') || document.querySelector('.lumina-stop-btn');
        }
        if (stopBtn) {
            stopBtn.style.display = 'flex';
            if (!stopBtn.dataset.listenerAdded) {
                stopBtn.dataset.listenerAdded = 'true';
                stopBtn.addEventListener('click', () => {
                    if (this._stopCallback) this._stopCallback();
                    this.hideStopButton();
                });
            }
            this._stopCallback = onStop;
        }
    }
    hideStopButton() {
        let stopBtn = null;
        if (this.container) {
            stopBtn = this.container.querySelector('#lumina-stop-btn') || this.container.querySelector('.lumina-stop-btn');
        }
        if (!stopBtn && this.inputPaneEl) {
            stopBtn = this.inputPaneEl.querySelector('#lumina-stop-btn') || this.inputPaneEl.querySelector('.lumina-stop-btn');
        }
        if (stopBtn) {
            stopBtn.style.display = 'none';
        }
        this._stopCallback = null;
    }

    _initContextMenu() {
        if (!this.container) return;

        // Clean up previous context menu if any
        const existing = document.querySelector('.lumina-context-menu');
        if (existing) existing.remove();

        this.contextMenu = document.createElement('div');
        this.contextMenu.className = 'lumina-context-menu';
        this.contextMenu.innerHTML = `
            <button class="lumina-context-menu-item" data-action="copy">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                Copy
            </button>
            <button class="lumina-context-menu-item" data-action="copy-md">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M4 12h16M4 17h16"></path></svg>
                Copy Markdown
            </button>
            <div class="lumina-context-menu-separator"></div>
            <button class="lumina-context-menu-item" data-action="edit">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                Edit
            </button>
            <button class="lumina-context-menu-item" data-action="regenerate">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6"></path><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
                Regenerate
            </button>
        `;
        document.body.appendChild(this.contextMenu);

        // Right click listener
        this.container.addEventListener('contextmenu', (e) => {
            const answer = e.target.closest('.lumina-chat-answer');
            if (answer) {
                e.preventDefault();
                this._showContextMenu(e.pageX, e.pageY, answer);
            } else {
                this._hideContextMenu();
            }
        });

        // Click out to close
        document.addEventListener('click', (e) => {
            if (!this.contextMenu.contains(e.target)) {
                this._hideContextMenu();
            }
        });

        // Context menu actions
        this.contextMenu.addEventListener('click', (e) => {
            const item = e.target.closest('.lumina-context-menu-item');
            if (!item) return;

            const action = item.dataset.action;
            const targetAnswer = this.contextMenu.__targetAnswer;
            if (!targetAnswer) return;

            this._handleContextMenuAction(action, targetAnswer);
            this._hideContextMenu();
        });
    }

    _showContextMenu(x, y, targetAnswer) {
        if (!this.contextMenu) return;
        this.contextMenu.__targetAnswer = targetAnswer;
        this.contextMenu.style.display = 'flex';

        // Positioning
        const menuWidth = this.contextMenu.offsetWidth || 180;
        const menuHeight = this.contextMenu.offsetHeight || 150;
        const padding = 10;

        let left = x;
        let top = y;

        if (x + menuWidth > window.innerWidth - padding) {
            left = x - menuWidth;
        }
        if (y + menuHeight > window.innerHeight - padding) {
            top = y - menuHeight;
        }

        this.contextMenu.style.left = `${left}px`;
        this.contextMenu.style.top = `${top}px`;
    }

    _hideContextMenu() {
        if (this.contextMenu) {
            this.contextMenu.style.display = 'none';
        }
    }

    async _handleContextMenuAction(action, answer) {
        const entry = answer.closest('.lumina-dict-entry');
        if (!entry) return;

        const rawText = answer.dataset.rawText || answer.innerText || "";

        switch (action) {
            case 'copy':
                // Plain text copy (strip markdown tags and think tags)
                let plain = rawText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
                // Basic markdown strip for "plain" text
                plain = plain.replace(/(\*\*|__|`|#|>|\[.*?\]\(.*?\))/g, '');
                navigator.clipboard.writeText(plain);
                break;
            case 'copy-md':
                // Raw markdown copy
                navigator.clipboard.writeText(rawText);
                break;
            case 'edit': {
                this.enterAnswerEditMode(answer);
                break;
            }
            case 'regenerate': {
                const questionDiv = entry.querySelector('.lumina-chat-question');
                if (questionDiv) {
                    const rawQuestion = questionDiv.dataset.rawText || questionDiv.innerText;
                    if (rawQuestion && this.inputEl) {
                        this.inputEl.value = rawQuestion;
                        // Trigger Enter key on input to resubmit
                        const enterEv = new KeyboardEvent('keydown', {
                            key: 'Enter',
                            code: 'Enter',
                            keyCode: 13,
                            which: 13,
                            bubbles: true
                        });
                        this.inputEl.dispatchEvent(enterEv);
                    }
                }
                break;
            }
        }
    }

    enterAnswerEditMode(answerDiv) {
        if (!answerDiv || answerDiv.classList.contains('lumina-answer-editing')) return;

        // Ensure parent is not editable so buttons are interactive
        answerDiv.contentEditable = 'false';

        let contentDiv = answerDiv.querySelector('.lumina-answer-content');
        if (!contentDiv) {
            // Create a wrapper for content if it's currently flat inside the answerDiv
            const originalHTML = answerDiv.innerHTML;
            answerDiv.innerHTML = '';
            contentDiv = document.createElement('div');
            contentDiv.className = 'lumina-answer-content';
            contentDiv.innerHTML = originalHTML;
            answerDiv.appendChild(contentDiv);
        }

        const originalRaw = answerDiv.dataset.rawText || contentDiv.innerText;
        answerDiv.__originalHTML = contentDiv.innerHTML;
        answerDiv.__originalRaw = originalRaw;

        // Always show raw markdown for editing
        contentDiv.textContent = originalRaw;

        answerDiv.classList.add('lumina-answer-editing');
        contentDiv.contentEditable = 'true';
        contentDiv.focus();

        // Inject toolbar as a sibling to contentDiv, NOT as a child of an editable element
        const toolbar = document.createElement('div');
        toolbar.className = 'lumina-answer-edit-toolbar';
        toolbar.contentEditable = 'false';
        toolbar.innerHTML = `
            <button class="lumina-edit-btn lumina-edit-cancel" title="Cancel">Cancel</button>
            <button class="lumina-edit-btn lumina-edit-save" title="Save">Save</button>
        `;

        // Essential: prevent focus stealing
        toolbar.onmousedown = (e) => e.preventDefault();

        toolbar.querySelector('.lumina-edit-cancel').onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.exitAnswerEditMode(answerDiv, false);
        };

        toolbar.querySelector('.lumina-edit-save').onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.exitAnswerEditMode(answerDiv, true);
        };

        answerDiv.appendChild(toolbar);

        // Bind Esc/Ctrl+Enter
        const keyHandler = (e) => {
            if (e.key === 'Escape') {
                this.exitAnswerEditMode(answerDiv, false);
                contentDiv.removeEventListener('keydown', keyHandler);
            } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                this.exitAnswerEditMode(answerDiv, true);
                contentDiv.removeEventListener('keydown', keyHandler);
            }
        };
        contentDiv.addEventListener('keydown', keyHandler);
    }

    exitAnswerEditMode(answerDiv, save = false) {
        if (!answerDiv || !answerDiv.classList.contains('lumina-answer-editing')) return;

        const contentDiv = answerDiv.querySelector('.lumina-answer-content') || answerDiv;
        const toolbar = answerDiv.querySelector('.lumina-answer-edit-toolbar');

        if (save) {
            const newText = contentDiv.innerText.trim();
            answerDiv.dataset.rawText = newText;
            // Trigger re-render to apply syntax highlighting/markdown
            answerDiv.__lastRenderedText = ''; // Force re-render
            this._doRender(answerDiv, true);

            // Persist to history if needed (Placeholder for history update)
            console.log('[Lumina] Answer saved:', newText);
        } else {
            // Restore original
            contentDiv.innerHTML = answerDiv.__originalHTML;
            answerDiv.dataset.rawText = answerDiv.__originalRaw;
        }

        answerDiv.classList.remove('lumina-answer-editing');
        contentDiv.contentEditable = 'false';
        if (toolbar) toolbar.remove();

        delete answerDiv.__originalHTML;
        delete answerDiv.__originalRaw;
    }
    static async processContainer(container) {
        if (!container || container.__luminaProcessed) return;
        container.__luminaProcessed = true;
        const yieldToMain = () => new Promise(resolve => {
            if (typeof window !== 'undefined' && window.requestIdleCallback) {
                window.requestIdleCallback(() => resolve(), { timeout: 30 });
            } else {
                setTimeout(resolve, 1);
            }
        });
        if (typeof hljs !== 'undefined') {
            const blocks = Array.from(container.querySelectorAll('pre code'));
            for (const block of blocks) {
                await yieldToMain();
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
        if (typeof renderMathInElement !== 'undefined') {
            const textContent = container.textContent;
            if (textContent.includes('$') || textContent.includes('\\(') || textContent.includes('\\[') || textContent.includes('\\begin')) {
                try {
                    await yieldToMain();
                    renderMathInElement(container, {
                        delimiters: [
                            { left: '$$', right: '$$', display: true },
                            { left: '$', right: '$', display: false },
                            { left: '\\(', right: '\\)', display: false },
                            { left: '\\[', right: '\\]', display: true }
                        ],
                        throwOnError: false
                    });
                } catch (e) { }
            }
        }
        await yieldToMain();
        container.querySelectorAll('a').forEach(link => {
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
        });
        await LuminaChatUI.injectCopyButtons(container);
        await yieldToMain();
        container.querySelectorAll('.lumina-thinking-container').forEach(c => {
            const header = c.querySelector('.lumina-thinking-header');
            if (header && !header.__thinkingToggleBound) {
                header.__thinkingToggleBound = true;
                header.addEventListener('click', () => c.classList.toggle('collapsed'));
            }
        });
        await yieldToMain();

        // RE-INITIALIZE Translation Highlights
        container.querySelectorAll('.lumina-translation-card').forEach(card => {
            const entry = card.closest('.lumina-dict-entry');
            if (entry && !entry.__translationHighlightDone) {
                LuminaChatUI._setupTranslationHighlight(entry);
                LuminaChatUI.balanceTranslationCard(entry);
                entry.__translationHighlightDone = true;
            }
        });
        await yieldToMain();
    }
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
                    } catch (_) { }
                }
            });
            wrapper.appendChild(btn);
        }
    }
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

    showImagePreview(src) {
        // Remove any existing preview
        const existing = document.querySelector('.lumina-preview-container.fixed-preview');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.className = 'lumina-preview-container fixed-preview';

        const content = document.createElement('div');
        content.className = 'lumina-preview-content';

        const img = document.createElement('img');
        img.src = src;
        img.alt = 'Image Preview';
        img.addEventListener('click', (e) => e.stopPropagation());

        const closeBtn = document.createElement('button');
        closeBtn.className = 'lumina-preview-close';
        closeBtn.innerHTML = `
            <svg viewBox="0 0 24 24" width="20" height="20">
                <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
        `;

        const close = () => {
            overlay.classList.remove('active');
            setTimeout(() => overlay.remove(), 250);
            document.removeEventListener('keydown', escHandler);
        };

        const escHandler = (e) => {
            if (e.key === 'Escape') close();
        };

        overlay.addEventListener('click', close);
        closeBtn.addEventListener('click', close);
        document.addEventListener('keydown', escHandler);

        content.appendChild(img);
        overlay.appendChild(closeBtn);
        overlay.appendChild(content);
        document.body.appendChild(overlay);

        // Trigger reflow for animation
        requestAnimationFrame(() => {
            overlay.classList.add('active');
        });
    }
}
/**
 * Extracts high-quality text content from a document by removing noise
 * (nav, footer, ads) and targeting main article areas.
 * Shared between Sidepanel (content.js) and Spotlight (spotlight.js).
 */
function extractMainContent(doc = document) {
    const docClone = doc.cloneNode(true);

    // 1. Remove obvious noise and Lumina's own UI
    const selectorsToRemove = [
        'nav', 'footer', 'header', 'aside', 'script', 'style',
        'iframe', 'noscript', 'form', 'svg', 'canvas',
        '.ads', '#sidebar', '.sidebar', '.menu', '.navigation',
        '.footer', '.header', '.ad-box', '.social-share', '.comments',
        '[id^="lumina-"]', '[class^="lumina-"]'
    ];

    selectorsToRemove.forEach(s => {
        docClone.querySelectorAll(s).forEach(el => el.remove());
    });

    // 2. Try to find main content areas
    const mainSelectors = ['article', 'main', '[role="main"]', '.post-content', '.article-content', '.entry-content'];
    let contentEl = null;

    for (const s of mainSelectors) {
        const el = docClone.querySelector(s);
        if (el && el.innerText.trim().length > 200) {
            contentEl = el;
            break;
        }
    }

    // 3. Fallback: use body if No clear main area or main area is too small
    if (!contentEl) contentEl = docClone.body;

    // 4. Return cleaned text
    let text = contentEl.innerText || contentEl.textContent || "";

    // Final cleanup of excessive whitespace
    text = text
        .replace(/[ \t]+/g, ' ')       // collapse horizontal whitespace
        .replace(/\n\s*\n/g, '\n\n')   // collapse multiple newlines
        .trim();

    return {
        url: window.location.href,
        title: document.title,
        content: text
    };
}

/**
 * Heuristic for token estimation (Vietnamese/General)
 * 1 token ≈ 3 characters (conservative)
 */
function luminaEstimateTokens(text) {
    if (!text) return 0;
    return Math.ceil(text.length / 3);
}

/**
 * Truncates an array of chat messages backwards (newest to oldest), ensuring that
 * conversational pairs (user + model) are kept together. Drops oldest messages
 * when the history budget (maxTokens) is exceeded.
 * @param {Array} messages - Array of messages { role, content/text }
 * @param {number|null} maxTokens - Maximum allowed tokens (null = no limit)
 * @returns {Array} - Truncated message array.
 */
function luminaTruncateHistoryWindow(messages, maxTokens) {
    if (maxTokens === null || maxTokens < 0) return [...messages];

    const estimateFn = typeof window.luminaEstimateTokens === 'function'
        ? window.luminaEstimateTokens
        : (t => Math.ceil((t || '').length / 3));

    const result = [];
    let currentTokens = 0;

    for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        let pairTokens = estimateFn(msg.text || msg.content || '');
        const pair = [msg];

        // If this is a model message, and the previous one is user, group them
        if (msg.role === 'model' && i > 0 && messages[i - 1].role === 'user') {
            const userMsg = messages[i - 1];
            pairTokens += estimateFn(userMsg.text || userMsg.content || '');
            pair.unshift(userMsg);
            i--; // Skip the user message
        }

        if (currentTokens + pairTokens > maxTokens) {
            break; // Exceeds budget, drop this pair and everything older
        }

        result.unshift(...pair);
        currentTokens += pairTokens;
    }

    return result;
}

// Global Exports
if (typeof window !== 'undefined') {
    window.LuminaChatUI = LuminaChatUI;
    window.luminaExtractMainContent = extractMainContent;
    window.luminaEstimateTokens = luminaEstimateTokens;
    window.luminaTruncateHistoryWindow = luminaTruncateHistoryWindow;
}
