import { morphDOM, scheduleMorphDOM } from './dom_morph.js';
import { streamSafeParse, completeIncompleteMarkdown, initMarkdownMath } from './markdown_math.js';
import { renderChartJSWrapper, processNexusChartElements } from './chart_renderer.js';
import { processNexusDynamicImageElements, processNexusDynamicYoutubeElements } from './dynamic_media_processor.js';

export class NexusChatUI {

    static getDeepActiveElement() {
        let el = document.activeElement;
        while (el && el.shadowRoot && el.shadowRoot.activeElement) {
            el = el.shadowRoot.activeElement;
        }
        return el;
    }
    static injectQuestionActions(questionDiv) {
        if (!questionDiv) return;
        const row = questionDiv.closest('.nexus-question-row');
        if (!row) return;
        const existing = row.querySelector('.nexus-question-actions-row');
        if (existing) existing.remove();
        const actionsRow = document.createElement('div');
        actionsRow.className = 'nexus-actions nexus-question-actions-row';
        actionsRow.innerHTML = `
            <button class="nexus-answer-action-btn btn-undo" title="Undo">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>
            </button>
            <button class="nexus-answer-action-btn btn-copy" title="Copy">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            </button>
            <button class="nexus-answer-action-btn btn-edit" title="Edit">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
            </button>
        `;
        const getChatUI = () => {
            const histEl = questionDiv.closest('.nexus-chat-history, .nexus-chat-scroll-content');
            return histEl?.__uiInstance || window.ui || (window.currentPopup?.__uiInstance);
        };
        actionsRow.querySelector('.btn-undo').onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const entry = questionDiv.closest('.nexus-entry');
            const chatUI = getChatUI();
            if (chatUI) chatUI._undoEditAndTruncate(entry, 'question', questionDiv, null);
        };
        actionsRow.querySelector('.btn-copy').onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const text = questionDiv.getAttribute('data-raw-text') || questionDiv.textContent;
            navigator.clipboard.writeText(text);
            const btn = actionsRow.querySelector('.btn-copy');
            const originalHTML = btn.innerHTML;
            btn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
            setTimeout(() => { btn.innerHTML = originalHTML; }, 2000);
        };
        actionsRow.querySelector('.btn-edit').onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const chatUI = getChatUI();
            if (chatUI) chatUI.enterQuestionEditMode(questionDiv);
        };
        row.appendChild(actionsRow);
        NexusChatUI.checkQuestionOverflow(questionDiv);
    }
    static checkQuestionOverflow(questionDiv) {
        if (!questionDiv) return;
        const contentDiv = questionDiv.querySelector('.nexus-question-content');
        if (!contentDiv) return;
        if (contentDiv.scrollHeight === 0) {
            requestAnimationFrame(() => NexusChatUI.checkQuestionOverflow(questionDiv));
            return;
        }
        const hasOverflow = contentDiv.scrollHeight > contentDiv.clientHeight;
        if (hasOverflow) {
            questionDiv.classList.add('has-overflow');
            let btn = questionDiv.querySelector('.nexus-question-expand-btn');
            if (!btn) {
                btn = document.createElement('div');
                btn.className = 'nexus-question-expand-btn';
                btn.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
                questionDiv.appendChild(btn);
            }
        } else {
            questionDiv.classList.remove('has-overflow');
            const btn = questionDiv.querySelector('.nexus-question-expand-btn');
            if (btn) btn.remove();
        }
    }
    constructor(container, options = {}) {
        this.container = container;
        this.options = {
            isSpotlight: options.isSpotlight || false,
            alwaysExpanded: options.alwaysExpanded || false,
            onSubmit: options.onSubmit || null,
            ...options
        };
        this.systemTokens = 150;
        this.historyEl = container.querySelector('.nexus-chat-history') ||
            container.querySelector('.nexus-chat-scroll-content');
        if (this.historyEl) {
            this.historyEl.__uiInstance = this;
        }
        this.inputEl = container.querySelector('.nexus-chat-input') ||
            (this.options.isSpotlight && !this.options.isPrimaryInput ? null : (document.querySelector('.nexus-chat-input') || document.querySelector('#chat-input')));
        this.filePreviewEl = container.querySelector('.nexus-file-preview-container') ||
            container.querySelector('.nexus-image-preview-container') ||
            container.querySelector('#image-preview') ||
            document.querySelector('.nexus-file-preview-container') ||
            document.querySelector('.nexus-image-preview-container');
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
        this._pendingRenderSkipScroll = false;
        this._pinnedQuestionEl = null;

        this._pinnedQuestionChipEl = null;
        this._pinnedQuestionScrollContainer = null;
        this._pinnedQuestionScrollRaf = null;
        this._historyDelegationEl = null;
        this._historyDelegationClickHandler = null;
        if (this.inputEl && !this.options.skipInputSetup) {
            this.setupInputBar();
            this._throttledUpdateTokenCount();
        }
        this.memoryTimers = new Map();
        this._setupMemoryManager();
        if (this.container) {
            let scrollingTimeout = null;
            this.container.addEventListener('wheel', (e) => {
                let target = e.target;
                while (target && target !== this.container) {
                    if (target.classList.contains('nexus-chat-scroll-content') ||
                        target.classList.contains('nexus-chat-history')) {
                        if (scrollingTimeout) clearTimeout(scrollingTimeout);
                        if (!target.classList.contains('nexus-is-scrolling')) {
                            target.classList.add('nexus-is-scrolling');
                        }
                        scrollingTimeout = setTimeout(() => {
                            target.classList.remove('nexus-is-scrolling');
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
        if (this.historyEl) this.initListeners(this.historyEl);
        this.tokenLimit = null;
        this.isGenerating = false;
        this.onStop = null;
        if (this.inputEl && !this.options.skipInputSetup) {
            this._updateActionBtnState();
        }
    }
    syncStateFromDOM() {
        if (!this.historyEl) return;
        const entries = this.historyEl.querySelectorAll('.nexus-entry');
        if (entries.length > 0) {
            const lastEntry = entries[entries.length - 1];
            this.currentEntryDiv = lastEntry;
            this.loadingDiv = lastEntry.querySelector('.nexus-loading-wrapper');
            this.searchingDiv = lastEntry.querySelector('.nexus-loading-wrapper') || lastEntry.querySelector('.nexus-searching-indicator');
            const answerDiv = lastEntry.querySelector('.nexus-chat-answer') || lastEntry.querySelector('.nexus-answer-versions');
            this.currentAnswerDiv = answerDiv;
        } else {
            this.currentEntryDiv = null;
            this.loadingDiv = null;
            this.searchingDiv = null;
            this.currentAnswerDiv = null;
        }
    }
    initListeners(container) {
        if (!container) return;
        this.historyEl = container;
        this._setupHistoryDelegation(container);
        if (container._nexusListenersAttached) return;
        container._nexusListenersAttached = true;
        container.addEventListener('keydown', (e) => {
            const editable = e.target.closest('.nexus-chat-question div[contenteditable="true"]');
            if (editable && e.target === editable) {
                const isSelectAll = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a';
                const tag = editable.querySelector('.nexus-selected-text-tag');
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
                            if (preRange.toString().trim() === '' && preRange.cloneContents().querySelector('.nexus-selected-text-tag')) {
                                e.preventDefault();
                                return;
                            }
                        }
                    }
                }
                if (e.key === 'Enter' && !e.shiftKey && !(e.ctrlKey || e.metaKey)) {
                    if (editable.closest('.is-editing')) return;
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
        container.addEventListener('mouseover', (e) => {
            const tag = e.target.closest('.nexus-selected-text-tag');
            const commentHighlight = e.target.closest('.nexus-comment-highlight');
            if (tag) {
                tag.removeAttribute('title');
                const questionDiv = tag.closest('.nexus-chat-question');
                const isInputField = tag.closest('.nexus-ask-input-field') || tag.closest('.nexus-chat-input');
                let context = "";
                if (questionDiv) {
                    const rawText = questionDiv.getAttribute('data-raw-text') || "";
                    context = this._extractContext(rawText);
                } else if (isInputField) {
                    context = tag.textContent.replace(/^"|"$/g, '');
                }
                if (context) this._showTagTooltip(tag, context);
            } else if (commentHighlight) {
                const comment = commentHighlight.dataset.comment;
                if (comment) this._showTagTooltip(commentHighlight, comment);
            }
        });
        container.addEventListener('mouseout', (e) => {
            const tagOrComment = e.target.closest('.nexus-selected-text-tag, .nexus-comment-highlight');
            if (tagOrComment) this._hideTagTooltip();
        });
        container.addEventListener('mousedown', (e) => {
            const bubble = e.target.closest('.nexus-chat-question, .nexus-chat-answer');
            if (bubble) {
                if (e.target.closest('.nexus-question-pin-btn')) return;
                const expandBtn = e.target.closest('.nexus-question-expand-btn');
                if (expandBtn) {
                    e.preventDefault();
                    e.stopPropagation();
                    const isExpanded = bubble.classList.toggle('expanded');
                    const cDiv = bubble.querySelector('.nexus-question-content');
                    if (cDiv) {
                        cDiv.scrollTop = 0;
                        cDiv.scrollLeft = 0;
                    }
                    bubble.scrollTop = 0;
                    bubble.scrollLeft = 0;
                    expandBtn.innerHTML = isExpanded ?
                        `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>` :
                        `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
                    return;
                }
                const editable = bubble.querySelector('[contenteditable="true"]');
                if (editable) {
                    if (!e.target.closest('.nexus-edit-btn, a, button, [contenteditable="true"]')) {
                        e.preventDefault();
                        this._focusEditableAtEnd(editable);
                    }
                    return;
                }
            }
        });
        container.addEventListener('input', (e) => {
            const editable = e.target.closest('.nexus-chat-question div[contenteditable="true"]');
            if (editable) e.stopPropagation();
        });
    }
    _setupHistoryDelegation(historyEl = this.historyEl) {
        if (!historyEl) return;
        if (!this._historyDelegationClickHandler) {
            this._historyDelegationClickHandler = (e) => {
                const actionBtn = e.target.closest('.nexus-answer-action-btn');
                if (actionBtn) {
                    const answerDiv = actionBtn.closest('.nexus-chat-answer');
                    if (answerDiv) {
                        e.preventDefault();
                        e.stopPropagation();
                        const action = actionBtn.dataset.action;
                        this._handleAnswerAction(action, actionBtn, answerDiv);
                        return;
                    }
                }
                const clickableImg = e.target.closest('.nexus-clickable-image');
                if (clickableImg && clickableImg.src) {
                    e.stopPropagation();
                    this.showImagePreview(clickableImg.src, clickableImg.alt || clickableImg.getAttribute('alt'));
                }
                const fileChip = e.target.closest('.nexus-question-file-chip');
                if (fileChip) {
                    e.stopPropagation();
                    const entry = fileChip.closest('.nexus-entry');
                    if (entry && entry._nexusImages) {
                        const fileName = fileChip.title;
                        const fileObj = entry._nexusImages.find(f => f.name === fileName);
                        if (fileObj) {
                            this.showFilePreview(fileObj);
                        }
                    }
                }
                const showCodeBtn = e.target.closest('.nexus-show-code-btn');
                if (showCodeBtn) {
                    e.stopPropagation();
                    const wrapper = showCodeBtn.closest('.nexus-python-chart-wrapper');
                    if (wrapper) {
                        const codeDisplay = wrapper.querySelector('.nexus-python-code-display');
                        if (codeDisplay) {
                            const isHidden = codeDisplay.style.display === 'none' || codeDisplay.style.getPropertyValue('display') === 'none';
                            codeDisplay.style.setProperty('display', isHidden ? 'block' : 'none', isHidden ? '' : 'important');
                            showCodeBtn.textContent = isHidden ? 'Ẩn code Python <>' : 'Xem code Python <>';
                        }
                    }
                }
                const d2Wrapper = e.target.closest('.nexus-d2-wrapper.nexus-d2-rendered');
                if (d2Wrapper) {
                    e.stopPropagation();
                    const svgEl = d2Wrapper.querySelector('svg');
                    if (svgEl) {
                        const clonedSvg = svgEl.cloneNode(true);
                        if (!clonedSvg.getAttribute('xmlns')) {
                            clonedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
                        }
                        if (!clonedSvg.getAttribute('viewBox') && svgEl.getAttribute('viewBox')) {
                            clonedSvg.setAttribute('viewBox', svgEl.getAttribute('viewBox'));
                        } else if (!clonedSvg.getAttribute('viewBox')) {
                            const bbox = svgEl.getBoundingClientRect();
                            clonedSvg.setAttribute('viewBox', `0 0 ${bbox.width || 800} ${bbox.height || 600}`);
                        }
                        clonedSvg.removeAttribute('width');
                        clonedSvg.removeAttribute('height');
                        const svgStr = new XMLSerializer().serializeToString(clonedSvg);
                        const dataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr);
                        const sourceEl = d2Wrapper.querySelector('.nexus-d2-source, script[type="text/d2"]');
                        const rawDef = sourceEl ? sourceEl.textContent : (d2Wrapper.getAttribute('data-d2') || '');
                        let caption = 'Diagram';
                        const lines = rawDef.split('\n');
                        for (let line of lines) {
                            line = line.trim();
                            const match = line.match(/^title\s*:\s*(?:"([^"]+)"|'([^']+)'|([^{\s]+))/i);
                            if (match) {
                                caption = match[1] || match[2] || match[3];
                                break;
                            }
                        }
                        this.showImagePreview(dataUrl, caption);
                    }
                }
            };
        }
        if (this._historyDelegationEl && this._historyDelegationEl !== historyEl) {
            this._historyDelegationEl.removeEventListener('click', this._historyDelegationClickHandler);
        }
        if (this._historyDelegationEl !== historyEl) {
            historyEl.addEventListener('click', this._historyDelegationClickHandler);
            this._historyDelegationEl = historyEl;
        }
        this.historyEl = historyEl;
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
        if (name.endsWith('.tsv')) return 'TSV';
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
        if (mime.includes('csv')) return 'CSV';
        if (mime.includes('tab-separated-values')) return 'TSV';
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
                if (this._regenScrollLocked && this._regenScrollContainer) {
                    const currentTop = this._regenScrollContainer.scrollTop;
                    const expectedTop = this._regenScrollPosition || 0;
                    if (Math.abs(currentTop - expectedTop) > 60) {
                        this._regenScrollLocked = false;
                        this._regenScrollContainer = null;
                        this._regenScrollPosition = null;
                    }
                }
            };
            scrollContainer.addEventListener('scroll', this._autoScrollGuardHandler, { passive: true });
            this._autoScrollGuardHandler();
        };
        bind();
        requestAnimationFrame(bind);
    }
    _flushPendingStreamRender() {

        if (!this.currentAnswerDiv) return;
        const answerDiv = this.currentAnswerDiv;
        const skipScroll = this._pendingRenderSkipScroll;
        this._pendingRenderSkipScroll = false;
        this._renderPending = false;
        this._doRender(answerDiv, skipScroll);
    }
    _getWebChipsGroup() {
        return this.container?.querySelector('#web-chips-group') || document.getElementById('web-chips-group');
    }
    _getRedirectChipsGroup() {
        return this.container?.querySelector('#redirect-chips-group') || document.getElementById('redirect-chips-group');
    }
    _ensureQuestionRow(questionDiv) {
        if (!questionDiv) return null;
        const existingRow = questionDiv.closest('.nexus-question-row');
        if (existingRow) return existingRow;
        const parent = questionDiv.parentElement;
        if (!parent) return null;
        const row = document.createElement('div');
        row.className = 'nexus-question-row';
        parent.insertBefore(row, questionDiv);
        row.appendChild(questionDiv);
        return row;
    }
    _updateInputMetaVisibility() {
        const metaContainer = this.container?.querySelector('#input-meta-container') || document.getElementById('input-meta-container');
        if (!metaContainer) return;
        const isSidePanel = new URLSearchParams(window.location.search).get('sidepanel') === '1';
        if (!isSidePanel) {
            metaContainer.style.display = 'none';
            return;
        }
        const webGroup = this._getWebChipsGroup();
        const hasWebChips = webGroup && webGroup.children.length > 0;
        if (!hasWebChips) {
            metaContainer.style.display = 'none';
        } else {
            metaContainer.style.display = 'flex';
        }
    }
    appendQuestion(text, images = [], options = {}) {
        const layout = this.historyEl.closest('.nexus-chat-layout, #chat-layout');
        const welcome = (layout || this.historyEl.parentNode || this.historyEl).querySelector('.spark-welcome, .nexus-homepage-welcome');
        if (welcome) {
            welcome.remove();
        }
        if (layout) {
            layout.classList.remove('new-chat-homepage');
        }
        this._clearCommentInteractions();
        const { entryType = 'qa', editable = false, skipMargin = false, displayText: displayTextOverride } = options;
        const visibleImages = Array.isArray(images)
            ? images.filter((item) => {
                if (typeof item === 'string') return true;
                if (!item || typeof item !== 'object') return false;
                return !item.hiddenInPreview && !item.parentAttachmentId;
            }).map((item, index) => {
                if (typeof item === 'string') {
                    const sessionId = this.historyEl?.dataset?.sessionId || (typeof ChatHistoryManager !== 'undefined' && ChatHistoryManager.currentSessionId) || 'temp_session';
                    const attachmentId = 'img_' + Date.now() + '_' + index + '_' + Math.random().toString(36).substr(2, 5);
                    const dbKey = `${sessionId}_${attachmentId}_Image.png`;
                    const blob = NexusAttachmentDB.dataURLtoBlob(item);
                    let objectUrl = item;
                    if (blob) {
                        NexusAttachmentDB.put(dbKey, blob);
                        objectUrl = URL.createObjectURL(blob);
                    }
                    const obj = {
                        name: `Image ${index + 1}.png`,
                        mimeType: 'image/png',
                        isImage: true,
                        dataUrl: item,
                        previewUrl: objectUrl,
                        attachmentId: dbKey,
                        objectUrl: objectUrl,
                        fileUri: `local-db://${sessionId}/${attachmentId}/Image.png`
                    };
                    return obj;
                }
                const sessionId = this.historyEl?.dataset?.sessionId || (typeof ChatHistoryManager !== 'undefined' && ChatHistoryManager.currentSessionId) || 'temp_session';
                if (item.fileUri && item.fileUri.startsWith('local-db://')) {
                    const urlParts = item.fileUri.replace('local-db://', '').split('/');
                    if (urlParts.length >= 3) {
                        const sId = urlParts[0];
                        const attachmentId = urlParts[1];
                        const name = urlParts.slice(2).join('/');
                        const dbKey = `${sId}_${attachmentId}_${name}`;
                        item.attachmentId = dbKey;
                    }
                } else {
                    let rawAttId = item.attachmentId;
                    if (!rawAttId) {
                        rawAttId = 'file_att_' + Date.now() + '_' + index + '_' + Math.random().toString(36).substr(2, 5);
                    }
                    let fileName = item.name || 'Pasted Image.png';
                    if (item.isImage && item.dataUrl && item.dataUrl.startsWith('data:') && item.dataUrl.length > 120 * 1024) {
                        fileName = fileName.replace(/\.[a-zA-Z0-9]+$/, '') + '.webp';
                    }
                    const dbKey = `${sessionId}_${rawAttId}_${fileName}`;
                    item.fileUri = `local-db://${sessionId}/${rawAttId}/${fileName}`;
                    item.attachmentId = dbKey;
                }
                if (item.dataUrl && item.dataUrl.startsWith('data:')) {
                    const blob = NexusAttachmentDB.dataURLtoBlob(item.dataUrl);
                    if (blob && item.isImage) {
                        item.objectUrl = URL.createObjectURL(blob);
                    }
                    const storeBlob = async () => {
                        let dataUrlToUse = item.dataUrl;
                        if (item.isImage && dataUrlToUse.length > 120 * 1024) {
                            dataUrlToUse = await NexusFileProcessor.compressImage(dataUrlToUse, 2048, 2048, 0.9);
                            const compressedBlob = NexusAttachmentDB.dataURLtoBlob(dataUrlToUse);
                            if (compressedBlob) {
                                if (item.objectUrl) URL.revokeObjectURL(item.objectUrl);
                                item.objectUrl = URL.createObjectURL(compressedBlob);
                                const imgInDom = this.currentEntryDiv?.querySelector(`img[data-attachment-id="${item.attachmentId}"]`);
                                if (imgInDom) imgInDom.src = item.objectUrl;
                                item.mimeType = 'image/webp';
                                await NexusAttachmentDB.put(item.attachmentId, compressedBlob);
                            }
                        } else if (blob) {
                            await NexusAttachmentDB.put(item.attachmentId, blob);
                        }
                    };
                    storeBlob();
                }
                return item;
            })
            : [];
        this.currentAnswerDiv = null;
        this.currentEntryDiv = document.createElement('div');
        this.currentEntryDiv.className = 'nexus-entry';
        this.currentEntryDiv.dataset.entryType = entryType;
        this.currentEntryDiv.dataset.entryId = 'entry-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
        if (visibleImages.length > 0) {
            const filesDiv = document.createElement('div');
            filesDiv.className = 'nexus-chat-question-files';
            visibleImages.forEach(item => {
                const isImage = item.isImage || (item.mimeType && item.mimeType.startsWith('image/'));
                const rawSrc = item.objectUrl || item.dataUrl || item.previewUrl || (item.mimeType && item.data ? `data:${item.mimeType};base64,${item.data}` : '');
                const src = isImage ? (rawSrc.startsWith('data:') || rawSrc.startsWith('blob:') ? rawSrc : this._resolveImagePreviewSrc(item, rawSrc)) : rawSrc;
                if (isImage) {
                    const img = document.createElement('img');
                    img.src = src;
                    if (item.attachmentId) {
                        img.dataset.attachmentId = item.attachmentId;
                    }
                    if (item.name) img.alt = item.name;
                    img.className = 'nexus-clickable-image';
                    img.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.showImagePreview(img.src, img.alt);
                    });
                    filesDiv.appendChild(img);
                } else {
                    const fileName = item.name || 'File';
                    const displayName = NexusChatUI.getDisplayFileName(fileName);
                    const category = NexusChatUI.inferFileCategory(item);
                    const icon = NexusChatUI.getFileIconByCategory(category);
                    const typeLabel = NexusChatUI.getFileTypeLabel(item);
                    const fileChip = document.createElement('div');
                    fileChip.className = 'nexus-preview-item is-file nexus-question-file-chip';
                    if (item.attachmentId) {
                        fileChip.dataset.attachmentId = item.attachmentId;
                    }
                    fileChip.title = fileName;
                    fileChip.innerHTML = `<div class="nexus-file-preview-info"><span class="nexus-file-name">${this.escapeHTMLAttr(displayName || fileName)}</span><div class="nexus-file-meta-row"><span class="nexus-file-icon-inline file-${category}">${icon}</span><span class="nexus-file-size-tag">${this.escapeHTMLAttr(typeLabel)}</span></div></div>`;
                    filesDiv.appendChild(fileChip);
                }
            });
            this.currentEntryDiv.appendChild(filesDiv);
        }
        const questionDiv = document.createElement('div');
        questionDiv.className = `nexus-chat-question${entryType !== 'qa' ? ` ${entryType}-question` : ''}`;
        questionDiv.dataset.entryType = entryType;
        if (visibleImages.length > 0) {
            questionDiv._nexusImages = visibleImages;
            this.currentEntryDiv._nexusImages = visibleImages;
            questionDiv.dataset.images = JSON.stringify({
                compact: true,
                count: visibleImages.length,
                files: visibleImages.map((item, index) => {
                    if (typeof item === 'string') {
                        return {
                            name: `Image ${index + 1}`,
                            mimeType: 'image/*',
                            isImage: true,
                            dataLength: item.length,
                            dataUrl: item
                        };
                    }
                    return {
                        name: item?.name || `File ${index + 1}`,
                        mimeType: item?.mimeType || '',
                        isImage: !!item?.isImage || (item?.mimeType || '').startsWith('image/'),
                        fileUri: item?.fileUri || '',
                        dataLength: (item?.dataUrl || item?.data || '').length,
                        dataUrl: item?.dataUrl || item?.previewUrl || (item?.mimeType && item?.data ? `data:${item.mimeType};base64,${item.data}` : ''),
                        attachmentId: item?.attachmentId || null
                    };
                })
            });
        }
        if (text) {
            let displayText = displayTextOverride || text.trim();
            const isModernTag = displayText.startsWith('$ContextTag');
            const isLegacyTag = displayText.startsWith('SelectedText:');
            const hasContextTag = isModernTag || isLegacyTag;
            if (hasContextTag) {
                if (isModernTag) {
                    displayText = displayText.replace('$ContextTag', '').trim();
                } else {
                    displayText = displayText.replace(/^SelectedText: "[^"]*"\s+/, '').trim();
                }
            }
            questionDiv.setAttribute('data-raw-text', text);
            this.currentEntryDiv.dataset.timestamp = String(Date.now());
            const contentDiv = document.createElement('div');
            contentDiv.className = 'nexus-question-content';
            contentDiv.innerHTML = displayText
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/\n/g, '<br>');
            questionDiv.appendChild(contentDiv);
        }
        const scrollContainer = this.getScrollContainer();
        const preAppendScroll = scrollContainer ? scrollContainer.scrollTop : 0;
        const row = document.createElement('div');
        row.className = 'nexus-question-row';
        row.appendChild(questionDiv);
        this.currentEntryDiv.appendChild(row);
        this.historyEl.appendChild(this.currentEntryDiv);
        this._throttledUpdateTokenCount();
        if (!skipMargin) {
            this.disableAutoScroll = false;
            requestAnimationFrame(() => {
                this.setInitialEntryHeight(this.currentEntryDiv, false, preAppendScroll, true);
            });
        } else {
            requestAnimationFrame(() => {
                this.setInitialEntryHeight(this.currentEntryDiv, true, preAppendScroll, false);
            });
        }
        NexusChatUI.injectQuestionActions(questionDiv);
        return questionDiv;
    }
    createAnswerDiv() {
        if (this.currentEntryDiv && !this.historyEl.contains(this.currentEntryDiv)) {
            this.syncStateFromDOM();
        }
        this._clearCommentInteractions();
        const applyProofreadStyles = (div) => {
            div.classList.add('nexus-can-comment');
            if (this.currentEntryDiv && this.currentEntryDiv.dataset.entryType === 'proofread') {
                div.spellcheck = false;
                div.style.outline = 'none';
                div.style.borderRadius = '8px';
                div.style.backgroundColor = 'var(--nexus-bg-secondary)';
                div.classList.add('nexus-proofread-editable');
            }
        };
        if (this.currentEntryDiv) {
            const activeVersion = this.currentEntryDiv.querySelector('.nexus-answer-version.active');
            if (activeVersion) {
                let innerDiv = activeVersion.querySelector('.nexus-chat-answer');
                if (!innerDiv) {
                    innerDiv = document.createElement('div');
                    innerDiv.className = 'nexus-chat-answer';
                    activeVersion.appendChild(innerDiv);
                }
                applyProofreadStyles(innerDiv);
                return innerDiv;
            }
        }
        const div = document.createElement('div');
        div.className = 'nexus-chat-answer';
        applyProofreadStyles(div);
        if (this.currentEntryDiv) {
            const existingAnswer = this.currentEntryDiv.querySelector('.nexus-chat-answer');
            if (existingAnswer) {
                this.currentEntryDiv.insertBefore(div, existingAnswer.nextSibling);
            } else {
                this.currentEntryDiv.appendChild(div);
            }
        } else {
            this.currentEntryDiv = document.createElement('div');
            this.currentEntryDiv.className = 'nexus-entry';
            this.currentEntryDiv.appendChild(div);
            this.historyEl.appendChild(this.currentEntryDiv);
        }
        this.currentAnswerDiv = div;
        if (!this.disableStreamAutoFollow) {
            this.scrollToBottom();
        }
        if (this.sparkId) {
            const sparkId = this.sparkId;
            chrome.storage.local.get(['nexus_sparks']).then(res => {
                const sparks = res.nexus_sparks || {};
                const spark = sparks[sparkId];
                if (spark && spark.name) {
                    if (!div.querySelector('.nexus-spark-message-header')) {
                        const headerDiv = document.createElement('div');
                        headerDiv.className = 'nexus-spark-message-header';
                        const nameSpan = document.createElement('span');
                        nameSpan.className = 'nexus-spark-name';
                        nameSpan.textContent = spark.name;
                        const sepSpan = document.createElement('span');
                        sepSpan.className = 'nexus-spark-separator';
                        sepSpan.textContent = ' • ';
                        const typeSpan = document.createElement('span');
                        typeSpan.className = 'nexus-spark-type';
                        typeSpan.textContent = 'Custom Spark';
                        headerDiv.appendChild(nameSpan);
                        headerDiv.appendChild(sepSpan);
                        headerDiv.appendChild(typeSpan);
                        div.insertBefore(headerDiv, div.firstChild);
                    }
                }
            }).catch(err => console.error(err));
        }
        return div;
    }
    appendChunk(chunk, skipScroll = false) {
        if (!this.currentAnswerDiv) {
            this.currentAnswerDiv = this.createAnswerDiv();
        }
        const currentText = this.currentAnswerDiv.getAttribute('data-raw-text') || '';
        const newText = currentText + chunk;
        this.currentAnswerDiv.setAttribute('data-raw-text', newText);
        if (typeof window !== 'undefined' && window.NexusCanvas) {
            window.NexusCanvas.handleStream(newText);
        }
        this._throttledUpdateTokenCount();
        let answerContentDiv = this.currentAnswerDiv.querySelector('.nexus-answer-content');
        if (!answerContentDiv) {
            answerContentDiv = document.createElement('div');
            answerContentDiv.className = 'nexus-answer-content';
            this.currentAnswerDiv.appendChild(answerContentDiv);
            answerContentDiv.__isRich = false;
        }
        if (!answerContentDiv.__isRich) {
            let fastText = newText.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').trim();
            if (fastText) {
                if (typeof marked !== 'undefined') {
                    const htmlContent = marked.parse(fastText) || '...';
                    if (answerContentDiv.childNodes.length === 0) {
                        answerContentDiv.innerHTML = htmlContent;
                    } else {
                        if (this.loadingDiv && answerContentDiv.contains(this.loadingDiv)) {
                            this.loadingDiv.remove();
                            this.loadingDiv = null;
                        }
                        morphDOM(answerContentDiv, htmlContent);
                    }
                } else {
                    if (this.loadingDiv && answerContentDiv.contains(this.loadingDiv)) {
                        this.loadingDiv.remove();
                        this.loadingDiv = null;
                    }
                    if (fastText.length < 1000) {
                        answerContentDiv.textContent = fastText;
                    } else {
                        answerContentDiv.textContent = fastText.substring(0, 1000) + "...";
                    }
                }
            }
        }
        if (!this._renderPending) {
            this._renderPending = true;
            this._pendingRenderSkipScroll = this._pendingRenderSkipScroll || skipScroll;
            const targetDiv = this.currentAnswerDiv;
            setTimeout(() => {
                if (targetDiv) {
                    this._renderPending = false;
                    const shouldSkipScroll = this._pendingRenderSkipScroll;
                    this._pendingRenderSkipScroll = false;
                    this._doRender(targetDiv, shouldSkipScroll);
                } else {
                    this._renderPending = false;
                    this._pendingRenderSkipScroll = false;
                }
            }, 80);

        }
    }
    _doRender(answerDiv, skipScroll = false, isFinished = false) {
        let actualAnswer = '';
        let thinkingContent = '';
        let isThinkingComplete = false;
        const scrollContainer = this.getScrollContainer();
        const preserveScrollTop = (skipScroll || this.disableAutoScroll || this._regenScrollLocked) && scrollContainer
            ? (this._regenScrollLocked && this._regenScrollPosition != null ? this._regenScrollPosition : scrollContainer.scrollTop)
            : null;
        const newText = answerDiv.getAttribute('data-raw-text') || '';
        if (answerDiv.__lastRenderedText === newText && !isFinished) return;
        answerDiv.__lastRenderedText = newText;
        let displayText = newText;
        displayText = displayText.replace(/<nexus-canvas-create\s+name="([^"]+)"\s+type="([^"]+)">[\s\S]*?(?:<\/nexus-canvas-create>|$)/gi, (match, name, type) => {
            const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const displayType = type.replace('code/', '').toUpperCase();
            return `<div class="nexus-canvas-card" data-canvas-name="${name.replace(/"/g, '&quot;')}" data-canvas-type="${type}">
  <div class="nexus-canvas-card-left">
    <div class="nexus-canvas-card-info">
      <div class="nexus-canvas-card-title">${name}</div>
      <div class="nexus-canvas-card-meta">${displayType} • ${timeStr}</div>
    </div>
  </div>
</div>`;
        });
        displayText = displayText.replace(/<nexus-canvas-update\s+name="([^"]+)">[\s\S]*?(?:<\/nexus-canvas-update>|$)/gi, (match, name) => {
            return `*🔄 Canvas Updated: **${name}***`;
        });
        displayText = displayText.replace(/<nexus-canvas-comment\s+name="([^"]+)">[\s\S]*?(?:<\/nexus-canvas-comment>|$)/gi, (match, name) => {
            return `*💬 Canvas Comment Added: **${name}***`;
        });
        const isProofreadAnswer = answerDiv.classList.contains('nexus-proofread-editable');
        if (isProofreadAnswer) {
            displayText = displayText.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').trim();
            const existing = answerDiv.querySelector('.nexus-thinking-steps');
            if (existing) existing.remove();
        }
        if (this.webSearchSources && this.webSearchSources.length > 0) {
            displayText = displayText.replace(/\n\s*(?:Sources|Citations|References)\s*(?::)?\s*\n[\s\S]*$/i, '');
        }
        const lastThinkStart = displayText.lastIndexOf('<think>');
        const lastThinkEnd = displayText.lastIndexOf('</think>');
        const thinkMatch = lastThinkStart !== -1;

        if (thinkMatch) {
            isThinkingComplete = lastThinkEnd > lastThinkStart;
            thinkingContent = displayText.substring(lastThinkStart + 7, isThinkingComplete ? lastThinkEnd : displayText.length).trim();
            actualAnswer = displayText.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').trim();
            const hasToolCall = newText.includes('"tool"');
            if (isFinished && !actualAnswer && thinkingContent && !hasToolCall) {
                actualAnswer = thinkingContent;
                thinkingContent = '';
                isThinkingComplete = true;
            }
            if (isThinkingComplete) {
                const headingMatches = thinkingContent.match(/(?:\*\*([^*\r\n]+)\*\*|^(?:#{1,6})\s+([^\r\n]+))/gm);
                const lastHeading = headingMatches
                    ? headingMatches[headingMatches.length - 1].replace(/[*#]/g, '').trim()
                    : null;
                if (lastHeading) {
                    const statusWrapper = this.loadingDiv || this.searchingDiv;
                    if (statusWrapper) {
                        this.updateStatusText(statusWrapper, lastHeading);
                    }
                }
                const existingSteps = answerDiv.querySelector('.nexus-thinking-steps');
                if (existingSteps) existingSteps.remove();
                this.removeLoading();
                this.removeSearching();
            } else if (!isThinkingComplete) {
                const headingMatches = thinkingContent.match(/(?:\*\*([^*\r\n]+)\*\*|^(?:#{1,6})\s+([^\r\n]+))/gm);
                const lastHeading = headingMatches
                    ? headingMatches[headingMatches.length - 1].replace(/[*#]/g, '').trim()
                    : 'Thinking';
                const statusWrapper = this.loadingDiv || this.searchingDiv;
                if (statusWrapper) {
                    this.updateStatusText(statusWrapper, lastHeading);
                } else {
                    this.showLoading();
                    this.updateStatusText(this.loadingDiv, lastHeading);
                }
            }
        } else {
            actualAnswer = displayText.trim();
        }
        if (/^<t?h?i?n?k?>?$/i.test(actualAnswer)) {
            actualAnswer = '';
        }
        if (thinkMatch) {
            isThinkingComplete = lastThinkEnd > lastThinkStart;
        }
        let answerContentDiv = answerDiv.querySelector('.nexus-answer-content');
        if (!answerContentDiv) {
            answerContentDiv = document.createElement('div');
            answerContentDiv.className = 'nexus-answer-content';
            answerDiv.appendChild(answerContentDiv);
        }
        if (actualAnswer.trim() || isThinkingComplete) {
            if (actualAnswer.trim().startsWith('<') && !actualAnswer.trim().startsWith('<div class="nexus-canvas-card"')) {
                const offsets = window.NexusSelection?.getSelectionRelativeOffsets?.(answerContentDiv);
                if (answerContentDiv.childNodes.length === 0) {
                    answerContentDiv.innerHTML = actualAnswer;
                } else {
                    morphDOM(answerContentDiv, actualAnswer);
                }
                if (offsets) window.NexusSelection?.restoreSelectionFromOffsets?.(answerContentDiv, offsets);
            } else if (typeof marked !== 'undefined') {
                let content = actualAnswer;
                content = content.replace(/!\[([^\]]*)\]\((image-search:\/\/[^)]*)\)/g, (match, alt, url) => {
                    return `![${alt}](${url.replace(/ /g, '%20')})`;
                });
                let htmlContent = marked.parse(content);
                if (this.webSearchSources.length > 0) {
                    htmlContent = htmlContent.replace(/\[(\d+)\]/g, (match, num) => {
                        const sourceIndex = parseInt(num) - 1;
                        const source = this.webSearchSources[sourceIndex];
                        if (source) {
                            return `<a href="${source.link}" target="_blank" rel="noopener noreferrer" class="nexus-citation">${num}</a>`;
                        }
                        return match;
                    });
                }
                const offsets = window.NexusSelection?.getSelectionRelativeOffsets?.(answerContentDiv);
                if (answerContentDiv.childNodes.length === 0) {
                    answerContentDiv.innerHTML = htmlContent;
                } else {
                    morphDOM(answerContentDiv, htmlContent);
                }
                if (offsets) window.NexusSelection?.restoreSelectionFromOffsets?.(answerContentDiv, offsets);
                answerContentDiv.__isRich = true;
            } else {
                answerContentDiv.textContent = actualAnswer;
                answerContentDiv.__isRich = false;
            }
        } else {
            Array.from(answerContentDiv.childNodes).forEach(node => {
                if (node !== this.loadingDiv && node !== this.searchingDiv) {
                    node.remove();
                }
            });
        }
        if (!skipScroll && !this.disableStreamAutoFollow && !this._scrollThrottled && !this._regenScrollLocked) {
            this._scrollThrottled = true;
            setTimeout(() => { this._scrollThrottled = false; }, 100);
            this.scrollToBottom();
        }
        if (preserveScrollTop !== null && scrollContainer) {
            scrollContainer.scrollTop = preserveScrollTop;
        }
    }
    finishAnswer(skipMargin = false, skipScroll = false) {
        this.removeLoading();
        this.removeSearching();
        this._flushPendingStreamRender();
        this._renderPending = false;
        this._scrollThrottled = false;
        this._pendingRenderSkipScroll = false;
        this._regenScrollLocked = false;
        this._regenScrollContainer = null;
        this._regenScrollPosition = null;
        const answerDivSnapshot = this.currentAnswerDiv;

        const sourcesSnapshot = Array.isArray(this.webSearchSources) ? [...this.webSearchSources] : [];
        const rawText = answerDivSnapshot ? (answerDivSnapshot.getAttribute('data-raw-text') || '') : '';
        if (typeof window !== 'undefined' && window.NexusCanvas) {
            window.NexusCanvas.handleDone(rawText);
        }
        const isProofreadEntry = this.currentEntryDiv?.dataset?.entryType === 'proofread';
        const shouldStickBottom = !this.disableStreamAutoFollow && !skipScroll && this._isNearBottom();
        if (answerDivSnapshot) {
            this._scheduleLowPriority(async () => {
                if (!answerDivSnapshot.isConnected) return;
                const previousSources = this.webSearchSources;
                this.webSearchSources = sourcesSnapshot;
                const scrollContainer = this.getScrollContainer();
                const savedScrollTop = scrollContainer && !shouldStickBottom ? scrollContainer.scrollTop : null;
                if (scrollContainer && !shouldStickBottom) {
                    scrollContainer.style.overflowAnchor = 'none';
                }
                try {
                    if (rawText.trim()) {
                        this._doRender(answerDivSnapshot, true, true);
                    }
                    if (sourcesSnapshot.length > 0) {
                        answerDivSnapshot.dataset.webSearch = JSON.stringify({
                            sourcesCount: sourcesSnapshot.length
                        });
                        if (!answerDivSnapshot.querySelector('.nexus-sources')) {
                            const sourcesDiv = document.createElement('div');
                            sourcesDiv.className = 'nexus-sources';
                            sourcesDiv.innerHTML = `
                                <div class="nexus-sources-title">Sources</div>
                                <div class="nexus-sources-list">
                                    ${sourcesSnapshot.map((source, idx) => `
                                        <a href="${source.link}" target="_blank" rel="noopener noreferrer" class="nexus-source-item">
                                            <span class="nexus-source-num">${idx + 1}</span>
                                            <div class="nexus-source-info">
                                                <div class="nexus-source-name">${source.title || 'Source'}</div>
                                                <div class="nexus-source-domain">${source.displayLink || new URL(source.link).hostname}</div>
                                            </div>
                                        </a>
                                    `).join('')}
                                </div>
                            `;
                            answerDivSnapshot.appendChild(sourcesDiv);
                        }
                    }
                    await NexusChatUI.processContainer(answerDivSnapshot);
                } catch (e) {
                    console.error('[Nexus] post-answer processing error:', e);
                } finally {
                    this.webSearchSources = previousSources;
                    if (scrollContainer && !shouldStickBottom) {
                        scrollContainer.style.overflowAnchor = '';
                        if (savedScrollTop !== null) {
                            scrollContainer.scrollTop = savedScrollTop;
                        }
                    } else {
                        this._snapToBottomIfNeeded(shouldStickBottom);
                    }
                }
            }, 380);
        } else if (sourcesSnapshot.length > 0 && !skipScroll && !this.disableStreamAutoFollow) {
            requestAnimationFrame(() => this.scrollToBottom());
        }
        this.currentAnswerDiv = null;
        this.webSearchSources = [];
        this.hideStopButton();
        this._throttledUpdateTokenCount();
    }
    static calculateInitialScrollTarget(entry, scrollContainer) {
        if (!entry || !scrollContainer) return 0;
        const targetScrollTop = entry.offsetTop - 10;
        return Math.max(0, targetScrollTop);
    }
    static getViewportStats(container, inputWrapper) {
        const containerHeight = container.clientHeight || container.offsetHeight;
        const inputHeight = inputWrapper ? (inputWrapper.offsetHeight || 0) : 0;
        const isSpotlight = document.body.classList.contains('nexus-page');
        return {
            containerHeight,
            inputHeight,
            viewportHeight: isSpotlight ? containerHeight : Math.max(0, containerHeight - inputHeight)
        };
    }
    static applyViewportMinHeight(entry, container, inputWrapper) {
        if (!entry || !container) return false;
        // If container is hidden or detached (e.g. user switched view to notes/sparks), skip silently
        if (container.offsetParent === null && (window.getComputedStyle(container).display === 'none' || !document.body.contains(container))) {
            return false;
        }
        const { viewportHeight } = this.getViewportStats(container, inputWrapper);
        if (viewportHeight > 0) {
            let marginBottom = 0;
            const entryStyle = window.getComputedStyle(entry);
            if (entryStyle) {
                marginBottom = parseFloat(entryStyle.marginBottom) || 0;
            }
            entry.style.setProperty('min-height', (viewportHeight - marginBottom - 10) + 'px', 'important');
            return true;
        }
        return false;
    }
    adjustEntryMargin(entry, behavior = 'none') {
        if (!entry) return;
        const run = () => {
            const container = this.container.querySelector('.nexus-chat-container') || this.container;
            const inputWrapper = this.container.querySelector('.nexus-chat-input-wrapper') || document.body.querySelector('.nexus-chat-input-wrapper');
            NexusChatUI.applyViewportMinHeight(entry, container, inputWrapper);
            this._marginTimer = null;
        };
        const isSpotlight = this.options.isSpotlight;
        if (behavior === 'immediate' || (isSpotlight && behavior === 'none')) {
            if (this._marginTimer) {
                clearTimeout(this._marginTimer);
                this._marginTimer = null;
            }
            run();
        } else {
            if (this._marginTimer) clearTimeout(this._marginTimer);
            this._marginTimer = setTimeout(run, 50);
        }
    }
    updateEntryMinHeight(excludeEntry = null) {
        if (!this.historyEl) return;
        if (this._lastActiveEntry && this._lastActiveEntry !== excludeEntry) {
            try {
                this._lastActiveEntry.style.removeProperty('min-height');
            } catch (e) { }
        }
        const allEntries = this.historyEl.querySelectorAll('.nexus-entry');
        allEntries.forEach(e => {
            if (e !== excludeEntry) {
                e.style.removeProperty('min-height');
            }
        });
        this._lastActiveEntry = (excludeEntry && excludeEntry.classList.contains('nexus-entry')) ? excludeEntry : null;
    }
    _extractContext(rawText) {
        if (!rawText) return '';
        const match = rawText.match(/^SelectedText: "([\s\S]*?)"(?:\n\n|$)/);
        return match ? match[1] : '';
    }
    _showTagTooltip(target, content, isHtml = false) {
        if (!this.sharedTooltip) {
            this.sharedTooltip = document.createElement('div');
            this.sharedTooltip.id = 'nexus-chat-tag-tooltip';
            this.sharedTooltip.className = 'nexus-tooltip';
            this.sharedTooltip.style.position = 'fixed';
            this.sharedTooltip.style.zIndex = '2147483647';
            this.sharedTooltip.style.pointerEvents = 'none';
            this.sharedTooltip.style.display = 'none';
            this.sharedTooltip.style.animation = 'none';
            Object.assign(this.sharedTooltip.style, {
                padding: '10px 14px',
                borderRadius: '10px',
                fontSize: '13px',
                lineHeight: '1.5',
                color: '#ffffff',
                backgroundColor: 'rgba(28, 28, 30, 0.98)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
                whiteSpace: 'normal',
                wordBreak: 'break-word',
                boxSizing: 'border-box',
                transition: 'opacity 0.2s ease'
            });
            document.body.appendChild(this.sharedTooltip);
        }
        if (isHtml) {
            this.sharedTooltip.innerHTML = content;
        } else {
            this.sharedTooltip.textContent = content;
        }
        const viewportPadding = 12;
        this.sharedTooltip.style.maxWidth = `${Math.max(220, Math.min(420, window.innerWidth - (viewportPadding * 2)))}px`;
        this.sharedTooltip.style.maxHeight = '240px';
        this.sharedTooltip.style.overflowY = 'auto';
        this.sharedTooltip.style.overflowX = 'hidden';
        this.sharedTooltip.style.display = 'block';
        this.sharedTooltip.style.visibility = 'hidden';
        this.sharedTooltip.style.opacity = '0';
        requestAnimationFrame(() => {
            const rect = target.getBoundingClientRect();
            const tooltipWidth = this.sharedTooltip.offsetWidth;
            const tooltipHeight = this.sharedTooltip.offsetHeight;
            const tagWidth = rect.width;
            let topPosition = rect.top - tooltipHeight - 12;
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
    setInitialEntryHeight(entry, skipScroll = false, preAppendScroll = 0, forceScroll = false, retryCount = 0) {
        if (!entry || !this.container) return;
        const scrollContainer = this.getScrollContainer();
        if (!scrollContainer) return;
        const container = this.container.querySelector('.nexus-chat-container') || this.container;
        if (container.offsetParent === null && (window.getComputedStyle(container).display === 'none' || !document.body.contains(container))) {
            return;
        }
        const inputWrapper = this.container.querySelector('.nexus-chat-input-wrapper') || document.body.querySelector('.nexus-chat-input-wrapper');
        if (NexusChatUI.applyViewportMinHeight(entry, container, inputWrapper)) {
            this.updateEntryMinHeight(entry);
            if (!skipScroll && (!this.disableAutoScroll || forceScroll)) {
                const targetScrollTop = NexusChatUI.calculateInitialScrollTarget(entry, scrollContainer, this.historyEl);
                const { viewportHeight } = NexusChatUI.getViewportStats(container, inputWrapper);
                const maxScroll = scrollContainer.scrollHeight - viewportHeight;
                const finalScrollTop = Math.min(targetScrollTop, maxScroll);
                scrollContainer.scrollTop = finalScrollTop;
                if (this._regenScrollLocked) {
                    this._regenScrollPosition = finalScrollTop;
                }
            }
        } else if (retryCount < 2) {
            setTimeout(() => this.setInitialEntryHeight(entry, skipScroll, preAppendScroll, forceScroll, retryCount + 1), 80);
        }
    }
    appendError(text) {
        this.removeLoading();
        this.removeSearching();
        const isStopped = text && (text.includes('BodyStreamBuffer') || text.includes('aborted'));
        if (isStopped) {
            const entry = this.currentEntryDiv || this.historyEl.lastElementChild;
            if (entry && entry.querySelector('.nexus-chat-answer.is-stopped')) {
                return;
            }
        }
        let targetDiv = this.currentAnswerDiv;
        let isNewDiv = false;
        if (!targetDiv) {
            targetDiv = document.createElement('div');
            targetDiv.className = 'nexus-chat-answer';
            isNewDiv = true;
        }
        let answerContentDiv = targetDiv.querySelector('.nexus-answer-content');
        if (!answerContentDiv) {
            answerContentDiv = document.createElement('div');
            answerContentDiv.className = 'nexus-answer-content';
            targetDiv.appendChild(answerContentDiv);
        }
        const errorDiv = document.createElement('div');
        if (isStopped) {
            targetDiv.classList.add('is-stopped');
            errorDiv.className = 'nexus-error-message';
            errorDiv.textContent = 'You stopped this response';
            errorDiv.style.opacity = '0.6';
            errorDiv.style.fontSize = '0.9em';
            errorDiv.style.marginTop = '8px';
        } else {
            errorDiv.className = 'nexus-error-message';
            errorDiv.style.setProperty('color', 'var(--nexus-error)', 'important');
            errorDiv.style.marginTop = '8px';
            errorDiv.textContent = text;
        }
        answerContentDiv.appendChild(errorDiv);
        if (isNewDiv) {
            if (this.currentEntryDiv) {
                this.currentEntryDiv.appendChild(targetDiv);
                this.adjustEntryMargin(this.currentEntryDiv, 'none');
            } else {
                this.historyEl.appendChild(targetDiv);
            }
        }
        NexusChatUI.injectAnswerActions(targetDiv);
        this.scrollToBottom();
        this.currentAnswerDiv = null;
    }
    updateStatusText(statusWrapper, text) {
        if (!statusWrapper) return;
        const textSpan = statusWrapper.querySelector('.nexus-status-text');
        if (!textSpan) return;
        if (textSpan.textContent === text) return;
        textSpan.textContent = text;
    }
    getLoadingHTML() {
        return `<div class="nexus-thinking"><div class="nexus-dots-loader"><span></span><span></span><span></span></div><span class="nexus-status-text"></span></div>`;
    }
    getTranslationSkeletonHTML() {
        return `
            <div class="nexus-translation-skeleton">
                <div class="nexus-skeleton-line long"></div>
                <div class="nexus-skeleton-line long"></div>
                <div class="nexus-skeleton-line medium"></div>
            </div>
        `;
    }
    showLoading(entryDiv = null, skipScroll = false) {
        if (this.loadingDiv) this.removeLoading();
        if (entryDiv) {
            this.currentEntryDiv = entryDiv;
        }
        if (!this.currentAnswerDiv) {
            this.currentAnswerDiv = this.createAnswerDiv();
        }
        let answerContentDiv = this.currentAnswerDiv.querySelector('.nexus-answer-content');
        if (!answerContentDiv) {
            answerContentDiv = document.createElement('div');
            answerContentDiv.className = 'nexus-answer-content';
            this.currentAnswerDiv.appendChild(answerContentDiv);
        }
        this.loadingDiv = document.createElement('div');
        this.loadingDiv.className = 'nexus-loading-wrapper';
        this.loadingDiv.innerHTML = this.getLoadingHTML();
        answerContentDiv.appendChild(this.loadingDiv);
        if (!skipScroll) {
            requestAnimationFrame(() => this.scrollToBottom(true));
        }
    }
    removeLoading() {
        if (this.loadingDiv) {
            this.loadingDiv.remove();
            this.loadingDiv = null;
        }
        if (this.historyEl) {
            const extraLoading = this.historyEl.querySelectorAll('.nexus-loading-wrapper');
            extraLoading.forEach(el => el.remove());
        }
    }
    clearAnswer(entryDiv) {
        if (!entryDiv) return;
        const answers = entryDiv.querySelectorAll('.nexus-chat-answer, .nexus-answer-versions, .nexus-answer-nav');
        answers.forEach(el => el.remove());
        const loading = entryDiv.querySelectorAll('.nexus-loading-wrapper');
        loading.forEach(el => el.remove());
        const searching = entryDiv.querySelectorAll('.nexus-searching-indicator');
        searching.forEach(el => el.remove());
        this.currentAnswerDiv = null;
    }
    showSearching(query) {
        const text = query ? `Searching for ${query}` : 'Searching';
        const statusWrapper = this.loadingDiv || this.searchingDiv;
        if (statusWrapper) {
            const thinkingEl = statusWrapper.querySelector('.nexus-thinking');
            if (thinkingEl) {
                let textSpan = thinkingEl.querySelector('.nexus-status-text');
                if (!textSpan) {
                    textSpan = document.createElement('span');
                    textSpan.className = 'nexus-status-text';
                    thinkingEl.appendChild(textSpan);
                }
                this.updateStatusText(statusWrapper, text);
                this.searchingDiv = statusWrapper;
                this.loadingDiv = null;
                return;
            }
        }
        this.removeSearching();
        if (!this.currentAnswerDiv) {
            this.currentAnswerDiv = this.createAnswerDiv();
        }
        let answerContentDiv = this.currentAnswerDiv.querySelector('.nexus-answer-content');
        if (!answerContentDiv) {
            answerContentDiv = document.createElement('div');
            answerContentDiv.className = 'nexus-answer-content';
            this.currentAnswerDiv.appendChild(answerContentDiv);
        }
        this.searchingDiv = document.createElement('div');
        this.searchingDiv.className = 'nexus-loading-wrapper';
        this.searchingDiv.innerHTML = `<div class="nexus-thinking"><div class="nexus-dots-loader"><span></span><span></span><span></span></div><span class="nexus-status-text">${text}</span></div>`;
        answerContentDiv.appendChild(this.searchingDiv);
        this.scrollToBottom(true);
    }
    removeSearching() {
        if (this.searchingDiv) {
            this.searchingDiv.remove();
            this.searchingDiv = null;
        }
        if (this.historyEl) {
            const extraSearching = this.historyEl.querySelectorAll('.nexus-loading-wrapper, .nexus-searching-indicator');
            extraSearching.forEach(el => el.remove());
        }
    }
    _clearCommentInteractions() {
        if (!this.historyEl) return;
        const buttons = this.historyEl.querySelectorAll('.nexus-send-comment-btn');
        buttons.forEach(btn => btn.remove());
    }
    handleWebSearchStatus(msg) {
        if (msg.hideProgress) {
            this.removeLoading();
            this.removeSearching();
            if (msg.sources) this.webSearchSources = msg.sources;
            return;
        }
        if (msg.status === 'searching') {
            this.showSearching(msg.query);
        } else if (msg.status === 'analyzing' || msg.status === 'completed') {
            if (msg.sources) this.webSearchSources = msg.sources;
            this.removeSearching();
            this.removeLoading();
        } else if (msg.status === 'error') {
            this.removeSearching();
            this.removeLoading();
        }
    }
    async addFile(file) {
        if (!file) return false;
        if (NexusFileProcessor.isPdfFile(file)) {
            const sourceAttachmentId = NexusFileProcessor.createAttachmentId();
            const placeholder = {
                attachmentId: sourceAttachmentId,
                name: file.name,
                mimeType: file.type || 'application/pdf',
                isImage: false,
                isVideo: false,
                isAudio: false,
                isPDF: false,
                status: 'uploading',
                dataUrl: ''
            };
            this._addPreparedFile(placeholder);
            this.renderFilePreviews();
            this._updateContainerState();
            setTimeout(async () => {
                try {
                    const rawPdf = await NexusFileProcessor.prepareRawFileAttachment(file, (f) => this._createObjectUrl(f));
                    if (rawPdf) {
                        rawPdf.attachmentId = sourceAttachmentId;
                        rawPdf.isPDF = false;
                        const idx = this.attachedFiles.findIndex(f => f.attachmentId === sourceAttachmentId);
                        if (idx !== -1) {
                            this.attachedFiles[idx] = rawPdf;
                        }
                    }
                    const derivedFiles = await NexusFileProcessor.extractPdfAsAttachments(file);
                    derivedFiles.forEach((prepared, idx) => {
                        prepared.attachmentId = `${sourceAttachmentId}:derived:${idx + 1}`;
                        prepared.parentAttachmentId = sourceAttachmentId;
                        prepared.hiddenInPreview = true;
                        this._addPreparedFile(prepared);
                    });
                    const idx = this.attachedFiles.findIndex(f => f.attachmentId === sourceAttachmentId);
                    if (idx !== -1) {
                        delete this.attachedFiles[idx].status;
                    }
                } catch (error) {
                    console.warn('[Nexus] PDF extraction failed; keeping raw PDF attach:', error);
                    const idx = this.attachedFiles.findIndex(f => f.attachmentId === sourceAttachmentId);
                    if (idx !== -1) {
                        delete this.attachedFiles[idx].status;
                    }
                } finally {
                    this.renderFilePreviews();
                    this._updateContainerState();
                }
            }, 50);
            return true;
        }
        if (NexusFileProcessor.isDocxFile(file)) {
            const sourceAttachmentId = NexusFileProcessor.createAttachmentId();
            const placeholder = {
                attachmentId: sourceAttachmentId,
                name: file.name,
                mimeType: file.type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                isImage: false,
                isVideo: false,
                isAudio: false,
                isPDF: false,
                status: 'uploading',
                dataUrl: ''
            };
            this._addPreparedFile(placeholder);
            this.renderFilePreviews();
            this._updateContainerState();
            setTimeout(async () => {
                try {
                    const rawDocx = await NexusFileProcessor.prepareRawFileAttachment(file, (f) => this._createObjectUrl(f));
                    if (rawDocx) {
                        rawDocx.attachmentId = sourceAttachmentId;
                        const idx = this.attachedFiles.findIndex(f => f.attachmentId === sourceAttachmentId);
                        if (idx !== -1) {
                            this.attachedFiles[idx] = rawDocx;
                        }
                    }
                    const derivedFiles = await NexusFileProcessor.extractDocxAsAttachments(file);
                    derivedFiles.forEach((prepared, idx) => {
                        prepared.attachmentId = `${sourceAttachmentId}:derived:${idx + 1}`;
                        prepared.parentAttachmentId = sourceAttachmentId;
                        prepared.hiddenInPreview = true;
                        this._addPreparedFile(prepared);
                    });
                } catch (error) {
                    console.warn('[Nexus] DOCX extraction failed; keeping raw DOCX attach:', error);
                    const idx = this.attachedFiles.findIndex(f => f.attachmentId === sourceAttachmentId);
                    if (idx !== -1) {
                        delete this.attachedFiles[idx].status;
                    }
                } finally {
                    this.renderFilePreviews();
                    this._updateContainerState();
                }
            }, 50);
            return true;
        }
        if (NexusFileProcessor.isXlsxFile(file)) {
            const sourceAttachmentId = NexusFileProcessor.createAttachmentId();
            const placeholder = {
                attachmentId: sourceAttachmentId,
                name: file.name,
                mimeType: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                isImage: false,
                isVideo: false,
                isAudio: false,
                isPDF: false,
                status: 'uploading',
                dataUrl: ''
            };
            this._addPreparedFile(placeholder);
            this.renderFilePreviews();
            this._updateContainerState();
            setTimeout(async () => {
                try {
                    const rawXlsx = await NexusFileProcessor.prepareRawFileAttachment(file, (f) => this._createObjectUrl(f));
                    if (rawXlsx) {
                        rawXlsx.attachmentId = sourceAttachmentId;
                        const idx = this.attachedFiles.findIndex(f => f.attachmentId === sourceAttachmentId);
                        if (idx !== -1) {
                            this.attachedFiles[idx] = rawXlsx;
                        }
                    }
                    const derivedFiles = await NexusFileProcessor.extractXlsxAsAttachments(file);
                    derivedFiles.forEach((prepared, idx) => {
                        prepared.attachmentId = `${sourceAttachmentId}:derived:${idx + 1}`;
                        prepared.parentAttachmentId = sourceAttachmentId;
                        prepared.hiddenInPreview = true;
                        this._addPreparedFile(prepared);
                    });
                } catch (error) {
                    console.warn('[Nexus] XLSX extraction failed; keeping raw XLSX attach:', error);
                    const idx = this.attachedFiles.findIndex(f => f.attachmentId === sourceAttachmentId);
                    if (idx !== -1) {
                        delete this.attachedFiles[idx].status;
                    }
                } finally {
                    this.renderFilePreviews();
                    this._updateContainerState();
                }
            }, 50);
            return true;
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
            console.warn('[Nexus] Office parsing failed, falling back to raw file attach:', error);
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
    _addPreparedFile(fileObj) {
        if (!fileObj || typeof fileObj !== 'object') return;
        
        if (!fileObj.attachmentId) {
            fileObj.attachmentId = NexusFileProcessor.createAttachmentId();
        }
        
        const isCompressing = fileObj.isImage && fileObj.dataUrl && fileObj.dataUrl.length > 120 * 1024;
        fileObj.status = isCompressing ? 'compressing' : 'done';
        
        if (fileObj.isImage && !fileObj.previewUrl && fileObj.dataUrl) {
            fileObj.previewUrl = NexusFileProcessor.resolveImagePreviewSrc(fileObj, fileObj.dataUrl);
        }
        if (fileObj.isImage && fileObj.dataUrl && !fileObj.previewUrl) {
            fileObj.previewUrl = fileObj.dataUrl;
        }
        
        this.attachedFiles.push(fileObj);
        if (fileObj.dataUrl) this.selectedImages.push(fileObj.dataUrl);
        
        this._syncSelectedImagesFromAttachments();
        this.renderFilePreviews();
        this._updateContainerState();
        
        if (isCompressing) {
            (async () => {
                try {
                    const compressedDataUrl = await NexusFileProcessor.compressImage(fileObj.dataUrl, 2048, 2048, 0.9);
                    fileObj.dataUrl = compressedDataUrl;
                    fileObj.mimeType = 'image/webp';
                    fileObj.name = (fileObj.name || 'Pasted Image.png').replace(/\.[a-zA-Z0-9]+$/, '') + '.webp';
                    if (fileObj.previewUrl && fileObj.previewUrl.startsWith('blob:')) {
                        this._revokeObjectUrl(fileObj.previewUrl);
                    }
                    fileObj.previewUrl = NexusFileProcessor.resolveImagePreviewSrc(fileObj, fileObj.dataUrl);
                } catch (err) {
                    console.error('[Immediate Compress] Failed to compress image:', err);
                }
                fileObj.status = 'done';
                this._syncSelectedImagesFromAttachments();
                this.renderFilePreviews();
                this._updateContainerState();
            })();
        }
    }
    _syncSelectedImagesFromAttachments() {
        this.selectedImages = this.attachedFiles
            .map((file) => file?.dataUrl)
            .filter((dataUrl) => typeof dataUrl === 'string' && dataUrl.length > 0);
    }
    addImage(dataUrl) {
        const previewUrl = this._resolveImagePreviewSrc(null, dataUrl);
        const fileObj = {
            mimeType: 'image/png',
            name: 'Pasted Image',
            isImage: true,
            dataUrl: dataUrl,
            previewUrl: previewUrl
        };
        this._addPreparedFile(fileObj);
        this.renderFilePreviews();
    }
    getAttachmentDbKey(fileObj) {
        if (!fileObj) return '';
        if (fileObj.fileUri && fileObj.fileUri.startsWith('local-db://')) {
            const urlParts = fileObj.fileUri.replace('local-db://', '').split('/');
            if (urlParts.length >= 3) {
                const sessionId = urlParts[0];
                const attachmentId = urlParts[1];
                const name = urlParts.slice(2).join('/');
                return `${sessionId}_${attachmentId}_${name}`;
            }
        }
        const sessionId = this.currentSessionId || 'temp_session';
        const attachmentId = fileObj.attachmentId;
        const fileName = fileObj.name;
        return `${sessionId}_${attachmentId}_${fileName}`;
    }
    removeFile(index) {
        const file = this.attachedFiles[index];
        if (!file) return;
        if (file.attachmentId && file.status === 'uploading') {
            chrome.runtime.sendMessage({ action: 'abort_gemini_upload', attachmentId: file.attachmentId });
        }
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
        this.attachedFiles.forEach(file => {
            this._revokeObjectUrl(file?.previewUrl);
        });
        this.attachedFiles = [];
        this.selectedImages = [];
        this.renderFilePreviews();
        this._updateContainerState();
    }
    renderFilePreviews() {
        this._throttledUpdateTokenCount();
        if (!this.filePreviewEl) return;
        const visibleEntries = this.attachedFiles
            .map((file, index) => ({ file, index }))
            .filter(({ file }) => !file?.hiddenInPreview);
        if (visibleEntries.length === 0) {
            this.filePreviewEl.innerHTML = '';
            return;
        }
        const listDiv = document.createElement('div');
        listDiv.className = 'nexus-file-list nexus-image-list';
        visibleEntries.forEach(({ file, index }) => {
            const itemDiv = document.createElement('div');
            itemDiv.className = `nexus-preview-item ${file.isImage ? 'is-image' : 'is-file'} ${file.status === 'uploading' || file.status === 'compressing' ? 'is-uploading' : ''}`;
            itemDiv.title = file.name;
            let content = '';
            if (file.isImage) {
                content = `<img src="${file.previewUrl || file.dataUrl}" alt="${file.name}">`;
            } else {
                const fileName = file.name || 'File';
                const rawExt = fileName.includes('.') ? fileName.split('.').pop() : '';
                const ext = (rawExt || '').toLowerCase();
                const category = NexusChatUI.inferFileCategory(ext, file.mimeType || '');
                const icon = NexusChatUI.getFileIconByCategory(category);
                const displayName = NexusChatUI.getDisplayFileName(fileName);
                const typeLabel = NexusChatUI.getFileTypeLabel(file);
                content = `<div class="nexus-file-preview-info"><span class="nexus-file-name">${this.escapeHTMLAttr(displayName || fileName)}</span><div class="nexus-file-meta-row"><span class="nexus-file-icon-inline file-${category}">${icon}</span><span class="nexus-file-size-tag">${this.escapeHTMLAttr(typeLabel)}</span></div></div>`;
            }
            itemDiv.innerHTML = content;
            itemDiv.onclick = () => {
                this.showFilePreview(file);
            };
            const removeBtn = document.createElement('div');
            removeBtn.className = 'nexus-file-remove nexus-image-remove';
            removeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
            removeBtn.onclick = (e) => {
                e.stopPropagation();
                this.removeFile(index);
            };
            itemDiv.appendChild(removeBtn);
            listDiv.appendChild(itemDiv);
        });
        this.filePreviewEl.innerHTML = '';
        this.filePreviewEl.appendChild(listDiv);
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
        this._updateActionBtnState();
    }
    escapeHTMLAttr(str) {
        if (!str) return '';
        return str.replace(/"/g, '&quot;').replace(/                    /g, ' ').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    escapeHTML(str) {
        if (!str) return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
    static balanceTranslationCard(entry, animate = true) {
        // Deleted
    }
    appendPartialTranslation(text) {
        this._clearCommentInteractions();
        this.updateEntryMinHeight();
        const safeText = this.escapeHTMLAttr(text);
        const div = document.createElement('div');
        div.className = 'nexus-entry';
        div.dataset.entryType = 'translation';
        div.dataset.partial = 'true';
        div.innerHTML = `
            <div class="nexus-chat-question translation-question">Translate</div>
            <div class="nexus-translation-container">
                <div class="nexus-translation-card">
                    <!-- Source Block (left) -->
                    <div class="nexus-translation-block">
                        <div class="nexus-translation-source" data-copy-text="${safeText}">
                            <div class="nexus-translation-text">${text}</div>
                        </div>
                    </div>
                    <!-- Vertical Divider -->
                    <div class="nexus-translation-divider"></div>
                    <!-- Target Block (right) -->
                    <div class="nexus-translation-block">
                        <div class="nexus-translation-target">
                            ${this.getTranslationSkeletonHTML()}
                        </div>
                    </div>
                </div>
            </div>
        `;
        const scrollContainer = this.getScrollContainer();
        const preAppendScroll = scrollContainer ? scrollContainer.scrollTop : 0;
        this.historyEl.appendChild(div);
        this.scrollToBottom();
        requestAnimationFrame(() => {
            const sourceText = div.querySelector('.nexus-translation-text');
            const targetContainer = div.querySelector('.nexus-translation-target');
            if (sourceText && targetContainer) {
                const styles = window.getComputedStyle(sourceText);
                const lineHeight = parseFloat(styles.lineHeight) || 20;
                const height = sourceText.offsetHeight;
                const exactLines = Math.max(Math.round(height / lineHeight), 1);
                let linesHTML = '';
                for (let i = 0; i < exactLines; i++) {
                    const type = (i === exactLines - 1) ? 'medium' : 'long';
                    linesHTML += `<div class="nexus-skeleton-line ${type}"></div>`;
                }
                targetContainer.innerHTML = `<div class="nexus-translation-skeleton">${linesHTML}</div>`;
            }
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
            const sourceDiv = element.querySelector('.nexus-translation-source');
            if (sourceDiv) {
                data.original = sourceDiv.getAttribute('data-copy-text') || sourceDiv.textContent.trim();
            }
        }
        const safeOriginal = this.escapeHTMLAttr(data.original || '');
        const safeTranslation = this.escapeHTMLAttr(data.translation || '');
        element.__translationHighlightDone = false;
        let sourceHTML = data.original || '';
        let targetHTML = data.translation || '';
        if (data.sentences && Array.isArray(data.sentences)) {
            element.dataset.isPreSplit = 'true';
            sourceHTML = data.sentences.map((s, idx) => `<span class="nexus-trans-sentence" data-idx="${idx}">${this.escapeHTML(s.src || '')}</span>`).join(' ');
            targetHTML = data.sentences.map((s, idx) => `<span class="nexus-trans-sentence" data-idx="${idx}">${this.escapeHTML(s.tgt || '')}</span>`).join(' ');
        } else {
            delete element.dataset.isPreSplit;
        }
        element.innerHTML = `
            <div class="nexus-chat-question translation-question">Translate</div>
            <div class="nexus-translation-container">
                <div class="nexus-translation-card">
                    <!-- Source Block (left) -->
                    <div class="nexus-translation-block">
                        <div class="nexus-translation-source" data-copy-text="${safeOriginal}">
                            <div class="nexus-translation-text">${sourceHTML}</div>
                        </div>
                    </div>
                    <!-- Vertical Divider -->
                    <div class="nexus-translation-divider"></div>
                    <!-- Target Block (right) -->
                    <div class="nexus-translation-block">
                        <div class="nexus-translation-target" data-copy-text="${safeTranslation}">
                            <div class="nexus-translation-text">${targetHTML}</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        delete element.dataset.partial;
        this.adjustEntryMargin(element);
        this._throttledUpdateTokenCount();
        requestAnimationFrame(() => NexusChatUI._setupTranslationHighlight(element));
        NexusChatUI.balanceTranslationCard(element);
        const regenBtn = this.container.querySelector('#nexus-regenerate-btn') ||
            this.container.querySelector('.nexus-regenerate-btn') ||
            document.getElementById('nexus-regenerate-btn') ||
            document.querySelector('.nexus-regenerate-btn');
        if (regenBtn) {
            regenBtn.style.display = 'flex';
        }
        if (!this.disableStreamAutoFollow) {
            requestAnimationFrame(() => this.scrollToBottom());
        }
    }

    async handleDictionary(word) {
        const entryDiv = this.appendPartialDictionary(word);
        try {
            const response = await chrome.runtime.sendMessage({ action: 'fetch_dictionary', word: word });
            if (response && response.success && response.data) {
                const parsed = FreeDictParser.parse(response.data);
                if (parsed && parsed.entries && parsed.entries.length > 0) {
                    this.updatePartialDictionary(entryDiv, parsed);
                } else {
                    this.updatePartialDictionary(entryDiv, { word: word, error: 'No dictionary entry found. Trying AI...' });
                    this.handleAIDictionary(word, entryDiv);
                }
            } else {
                throw new Error(response?.error || 'Failed to fetch dictionary');
            }
        } catch (err) {
            console.error('[Nexus] Dictionary lookup failed:', err);
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
        this._clearCommentInteractions();
        this.updateEntryMinHeight();
        const div = document.createElement('div');
        div.className = 'nexus-entry';
        div.dataset.entryType = 'lookup';
        div.dataset.partial = 'true';
        div.dataset.word = word;
        div.innerHTML = `
            <div class="nexus-chat-question lookup-question">Define: ${word}</div>
            <div class="nexus-chat-answer">
                <div class="nexus-dict-loading">
                    ${this.getLoadingHTML()}
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

    updatePartialDictionary(element, data) {
        if (!element) return;
        const answerEl = element.querySelector('.nexus-chat-answer');
        if (!answerEl) return;
        if (data.error && !data.entries) {
            if (data.error.includes('BodyStreamBuffer') || data.error.includes('aborted')) {
                answerEl.innerHTML = `<div class="nexus-error-message is-stopped">You stopped this response</div>`;
            } else {
                answerEl.innerHTML = `<div class="nexus-error-message" style="color: var(--nexus-error) !important;">${data.error}</div>`;
            }
        } else {
            answerEl.innerHTML = this.renderDictionaryEntry(data);
            answerEl.querySelectorAll('.nexus-dict-audio-btn').forEach(btn => {
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
            return `<div class="nexus-error-message">No entries found for "${data.word}"</div>`;
        }
        let html = `
            <div class="nexus-dict-card">
                <div class="nexus-dict-header">
                    <span class="nexus-dict-word">${data.word}</span>
                </div>
        `;
        data.entries.forEach(entry => {
            html += `
                <div class="nexus-dict-item">
                    <div class="nexus-dict-meta">
                        ${entry.pos ? `<span class="nexus-dict-pos">${entry.pos}</span>` : ''}
                        ${entry.uk?.ipa ? `
                            <span class="nexus-dict-ipa-group">
                                <span class="nexus-dict-region">UK</span>
                                <span class="nexus-dict-ipa">/${entry.uk.ipa}/</span>
                                ${entry.uk.audio ? `<button class="nexus-dict-audio-btn" data-url="${entry.uk.audio}" title="Play UK Audio">
                                    <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M12 3v9.28c-.47-.17-.97-.28-1.5-.28C8.01 12 6 14.01 6 16.5S8.01 21 10.5 21c2.31 0 4.2-1.75 4.45-4H15V6h4V3h-7z"/></svg>
                                </button>` : ''}
                            </span>
                        ` : ''}
                        ${entry.us?.ipa ? `
                            <span class="nexus-dict-ipa-group">
                                <span class="nexus-dict-region">US</span>
                                <span class="nexus-dict-ipa">/${entry.us.ipa}/</span>
                                ${entry.us.audio ? `<button class="nexus-dict-audio-btn" data-url="${entry.us.audio}" title="Play US Audio">
                                    <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M12 3v9.28c-.47-.17-.97-.28-1.5-.28C8.01 12 6 14.01 6 16.5S8.01 21 10.5 21c2.31 0 4.2-1.75 4.45-4H15V6h4V3h-7z"/></svg>
                                </button>` : ''}
                            </span>
                        ` : ''}
                    </div>
                    <div class="nexus-dict-senses">
            `;
            entry.senses.forEach(sense => {
                html += `<div class="nexus-dict-sense">`;
                if (sense.indicator) {
                    html += `<div class="nexus-dict-indicator">${sense.indicator}</div>`;
                }
                sense.definitions.forEach(def => {
                    html += `
                        <div class="nexus-dict-def-block">
                            <div class="nexus-dict-meaning-text">${def.meaning}</div>
                            ${def.translation ? `<div class="nexus-dict-translation">${def.translation}</div>` : ''}
                            ${def.examples && def.examples.length > 0 ? (() => {
                            const ex = def.examples[0];
                            const escaped = (entry.word || data.word || '').replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                            const regex = new RegExp(`(${escaped}(?:ing|ed|s|es|d)?)`, 'gi');
                            const highlighted = ex.replace(regex, '<strong>$1</strong>');
                            return `<div class="nexus-dict-example">"${highlighted}"</div>`;
                        })() : ''}
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
            console.error('[Nexus] Failed to play audio:', err);
        }
    }
    static _setupTranslationHighlight(element) {
        // Deleted
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
    collectComments(entry) {
        if (!entry) return { instructions: '', draft: '' };
        const answerEl = entry.querySelector('.nexus-chat-answer');
        if (!answerEl) return { instructions: '', draft: '' };
        const highlights = answerEl.querySelectorAll('.nexus-comment-highlight');
        if (highlights.length === 0) return { instructions: '', draft: '' };
        let instructions = '';
        highlights.forEach((h, index) => {
            const text = h.textContent.trim();
            const comment = h.dataset.comment || '';
            if (comment) {
                instructions += `[Part ${index + 1}]: "${text}"\n[Comment]: ${comment}\n\n`;
            }
        });
        const draft = answerEl.textContent.trim();
        return { instructions, draft };
    }
    gatherMessages(untilEntryId = null, ignoreLimit = false, targetThinkingLevel = 'none') {
        let messages = [];
        const entries = this.historyEl.querySelectorAll('.nexus-entry');
        for (const entry of entries) {
            const entryType = entry.dataset.entryType || 'qa';
            const isTargetEntry = untilEntryId && entry.dataset.entryId === untilEntryId;
            if (isTargetEntry) break;
            const questionEl = entry.querySelector('.nexus-chat-question');
            let answerEl = null;
            const versionsContainer = entry.querySelector('.nexus-answer-versions');
            if (versionsContainer) {
                const activeVersion = versionsContainer.querySelector('.nexus-answer-version.active');
                if (activeVersion) {
                    answerEl = activeVersion.querySelector('.nexus-chat-answer');
                }
            } else {
                answerEl = entry.querySelector('.nexus-chat-answer');
            }
            if (questionEl) {
                let questionText = questionEl.getAttribute('data-raw-text') || questionEl.textContent.trim();
                questionText = questionText.replace(/\[USER INSTRUCTION\]:\s*/g, '');
                questionText = questionText.replace(/\n\n---\n\n\[REFERENCE CONTEXT - Webpage Content.*?\]:[\s\S]*$/g, '');
                questionText = questionText.replace(/\n\n---\n\n\[Web Context Snippets\]:[\s\S]*$/g, '');
                questionText = questionText.replace(/\n\n---\n\n\[Background Context\]:[\s\S]*$/g, '');
                questionText = questionText.replace(/\[Current Webpage Context\][\s\S]*?---[\s\n]*/g, '');
                questionText = questionText.replace(/\[Context from current page\]:[\s\S]*?\[Instruction\]:[\s\n]*/g, '');
                questionText = questionText.trim();
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
                let images = Array.isArray(questionEl._nexusImages) ? questionEl._nexusImages :
                    (Array.isArray(entry._nexusImages) ? entry._nexusImages : []);
                if (!images.length && questionEl.dataset.images) {
                    try {
                        const parsed = JSON.parse(questionEl.dataset.images);
                        if (Array.isArray(parsed)) {
                            images = parsed;
                        } else if (parsed && Array.isArray(parsed.files)) {
                            images = parsed.files;
                        }
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
                let answerText = answerEl.classList.contains('nexus-answer-editing')
                    ? ((answerEl.querySelector('.nexus-answer-content') || answerEl).innerText || (answerEl.querySelector('.nexus-answer-content') || answerEl).textContent || '').trim()
                    : (answerEl.getAttribute('data-raw-text') || answerEl.textContent.trim());
                if (answerText) {
                    const normLevel = (typeof targetThinkingLevel === 'string' ? targetThinkingLevel.trim().toLowerCase() : 'none');
                    if (normLevel === 'none' || normLevel === 'minimal' || normLevel === '') {
                        answerText = answerText.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').trim();
                    }
                    messages.push({
                        role: 'model',
                        text: answerText
                    });
                }
            }
            if (isTargetEntry) break;
        }
        if (!ignoreLimit && this.tokenLimit && this.tokenLimit > 0) {
            const inputEl = this.container ? this.container.querySelector('.nexus-chat-input') : null;
            const inputText = inputEl ? inputEl.value : '';
            const inputTokens = (typeof NexusToken !== 'undefined') ? NexusToken.count(inputText) : Math.ceil(inputText.length / 2);
            let attachmentTokens = 0;
            if (this.attachedFiles && this.attachedFiles.length > 0) {
                this.attachedFiles.forEach(file => {
                    if (file.dataUrl && (file.mimeType?.startsWith('text/') || file.dataUrl.startsWith('data:text/'))) {
                        const matches = file.dataUrl.match(/^data:([^;]+);base64,(.+)$/i);
                        if (matches) {
                            try {
                                const decoded = this._decodeBase64Utf8(matches[2]);
                                attachmentTokens += (typeof NexusToken !== 'undefined') ? NexusToken.count(decoded) : Math.ceil(decoded.length / 2);
                            } catch (e) { }
                        }
                    } else if (file.isImage || file.mimeType?.startsWith('image/')) {
                        attachmentTokens += 765;
                    }
                });
            }
            let contextTokens = 0;
            const webChipsGroup = this.container ? this.container.querySelector('#web-chips-group') : null;
            if (webChipsGroup) {
                const activeChips = webChipsGroup.querySelectorAll('.nexus-web-chip.is-active');
                activeChips.forEach(chip => {
                    const tokens = parseInt(chip.dataset.tokens || '0');
                    if (tokens > 0) contextTokens += tokens;
                    else if (chip.classList.contains('is-active')) contextTokens += 4000;
                });
            }
            const systemTokens = this.systemTokens || 150;
            const budget = this.tokenLimit - inputTokens - attachmentTokens - contextTokens - systemTokens;
            if (budget > 0) {
                let currentHistoryTokens = 0;
                let messagesKept = 0;
                const slicedMessages = [];
                for (let i = messages.length - 1; i >= 0; i--) {
                    const m = messages[i];
                    const mTokens = (typeof NexusToken !== 'undefined') ? NexusToken.count(m.text || '') : Math.ceil((m.text || '').length / 2);
                    if (currentHistoryTokens + mTokens <= budget) {
                        slicedMessages.unshift(m);
                        currentHistoryTokens += mTokens;
                        messagesKept++;
                    } else {
                        break;
                    }
                }
                messages = slicedMessages;
            } else {
                messages = [];
            }
        }
        return messages;
    }
    _throttledUpdateTokenCount() {
    }
    _updateTokenCount() {
    }
    _updateTokenLimitFromModel() {
    }
    async refreshSystemTokens() {
    }
    _formatTokenCount(count) {
        if (count >= 1000000) return (count / 1000000).toFixed(1) + 'M';
        if (count >= 1000) return (count / 1000).toFixed(1) + 'K';
        return count.toString();
    }
    _decodeBase64Utf8(base64) {
        if (!base64) return '';
        try {
            const binary = atob(base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            return new TextDecoder('utf-8').decode(bytes);
        } catch (_) { return ''; }
    }
    static getChatInputHTML(autofocus = false) {
        const isSidePanel = typeof document !== 'undefined' && (document.body.classList.contains('is-sidepanel') || new URLSearchParams(window.location.search).get('sidepanel') === '1');
        return `
          <div class="nexus-chat-input-wrapper">
            <div class="nexus-input-meta-container" id="input-meta-container">
                ${isSidePanel ? '' : '<div class="nexus-web-chips" id="web-chips-group"></div>'}
                <div class="nexus-redirect-group" id="redirect-chips-group"></div>
            </div>
            <div class="nexus-input-container">
                <div class="nexus-file-preview-container nexus-image-preview-container"></div>
                <div class="nexus-input-bar" id="input-bar">
                    <div class="nexus-left-actions">
                         <button class="nexus-upload-btn" id="upload-btn" title="Upload File">
                            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                         </button>
                         <div class="nexus-model-selector" id="model-selector">
                             <button class="nexus-model-btn" id="model-btn">
                                 <span class="nexus-current-model" id="model-label">Loading...</span>
                                 <svg class="nexus-chevron" viewBox="0 0 24 24" width="14" height="14" fill="none" style="opacity: 0.85;"><path d="M18 15l-6-6-6 6" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
                             </button>
                             <div class="nexus-model-dropdown" id="model-dropdown"></div>
                         </div>
                         ${isSidePanel ? '<div class="nexus-web-chips" id="web-chips-group"></div>' : ''}
                    </div>
                    <textarea id="chat-input" class="nexus-chat-input" placeholder="Ask anything..." rows="1"></textarea>
                    <div class="nexus-trailing-group">
                        <button class="nexus-mic-btn" id="mic-btn" title="Voice Input">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="4" width="6" height="10" rx="3"></rect><path d="M5 12a7 7 0 0 0 14 0"></path><line x1="12" y1="19" x2="12" y2="22"></line></svg>
                        </button>
                        <button class="nexus-action-btn send" id="action-btn" title="Send" disabled>
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>
                        </button>
                    </div>
                </div>
            </div>
            <div class="nexus-hover-trigger"></div>
          </div>`;
    }
    setupInputBar() {
        if (!this.inputEl) return;
        const popup = this.container;
        const input = this.inputEl;

        input.addEventListener('paste', async (e) => {
            const text = e.clipboardData?.getData('text');
            if (!text) return;

            const isTable = text.includes('\t') && (text.includes('\n') || text.includes('\r'));
            const isLongText = text.length > 10000 || (text.split(/\r?\n/).length > 50 && text.length > 2000);

            if ((isTable || isLongText) && typeof NexusFileProcessor !== 'undefined') {
                e.preventDefault();
                const filename = isTable ? 'Pasted table.tsv' : 'Pasted text.txt';
                const mimeType = isTable ? 'text/tab-separated-values' : 'text/plain';
                const file = new File([text], filename, { type: mimeType });
                await this.addFile(file);
            }
        });
        const queryInPopup = (selector) => popup.querySelector(selector) || document.querySelector(selector);
        const inputBar = queryInPopup('.nexus-input-bar') || queryInPopup('#input-bar');
        this.isProofreadMode = this.isProofreadMode || false;
        this.isTranslateMode = this.isTranslateMode || false;
        const getModes = () => ({ pr: this.isProofreadMode, tr: this.isTranslateMode });
        const setProofread = (v) => { this.isProofreadMode = v; };
        const setTranslate = (v) => { this.isTranslateMode = v; };
        const history = queryInPopup('.nexus-chat-history') || queryInPopup('.nexus-chat-scroll-content');
        this.refreshSystemTokens();
        chrome.storage.onChanged.addListener((changes) => {
            if (changes.reasoningMode || changes.responseLanguage) {
                this.refreshSystemTokens();
            }
        });
        if (history) {
            const historyObserver = new MutationObserver(() => this._throttledUpdateTokenCount());
            historyObserver.observe(history, { childList: true, subtree: true });
        }
        const webChips = queryInPopup('#web-chips-group');
        if (webChips) {
            const chipsObserver = new MutationObserver(() => this._throttledUpdateTokenCount());
            chipsObserver.observe(webChips, { childList: true });
        }
        const inputWrapper = queryInPopup('.nexus-chat-input-wrapper');
        if (inputWrapper) {
            inputWrapper.addEventListener('mousedown', (e) => {
                const interactiveSelector = 'button, textarea, input, a, .nexus-model-dropdown, .nexus-tools-dropdown, .nexus-mention-popup';
                const isInteractive = e.target.closest(interactiveSelector);
                if (!isInteractive) {
                    e.preventDefault();
                    input.focus();
                    const len = input.value.length;
                    input.setSelectionRange(len, len);
                    if (typeof this._checkExpand === 'function') this._checkExpand();
                }
            });
        }
        this.readWebpageEnabled = false;
        this.currentPageTitle = "Current Page";
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.get(['readWebpage', 'advancedParamsByModel', 'modelTokenLimits'], (data) => {
                if (data.readWebpage !== undefined) {
                    this.readWebpageEnabled = !!data.readWebpage;
                }
                if (data.advancedParamsByModel) {
                    this.advancedParamsByModel = data.advancedParamsByModel;
                }
                this.modelTokenLimits = data.modelTokenLimits || {};
                this._updateTokenLimitFromModel();
            });
            chrome.storage.onChanged.addListener((changes, area) => {
                if (area === 'local') {
                    if (changes.readWebpage) {
                        this.readWebpageEnabled = !!changes.readWebpage.newValue;
                    }
                    if (changes.advancedParamsByModel) {
                        this.advancedParamsByModel = changes.advancedParamsByModel.newValue;
                    }
                    if (changes.modelTokenLimits) {
                        this.modelTokenLimits = changes.modelTokenLimits.newValue || {};
                        this._updateTokenLimitFromModel();
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
            } else if (typeof document !== 'undefined' && document.title && document.title !== 'Nexus') {
                this.currentPageTitle = document.title;
            }
        };
        this.refreshReadPageTitle();
        setInterval(() => this.refreshReadPageTitle(), 5000);
        const checkExpand = () => {
            input.style.removeProperty('height');
        };
        const debouncedCheckExpand = (immediate = false) => {
            checkExpand();
        };
        this._checkExpand = checkExpand;
        if (typeof ResizeObserver !== 'undefined') {
            const resizeTarget = queryInPopup('.nexus-input-container') || inputBar;
            if (resizeTarget) {
                const ro = new ResizeObserver(() => {
                    requestAnimationFrame(() => debouncedCheckExpand());
                });
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
            if (translateKw) {
                if (getModes().tr) {
                    removeActiveModes();
                    input.placeholder = 'Ask anything...';
                    input.value = val.slice(translateKw[0].length);
                } else {
                    removeActiveModes();
                    setTranslate(true);
                    const toolItem = queryInPopup('[data-action="translate"]');
                    if (toolItem) toolItem.classList.add('active');
                    if (toolsToggle) {
                        const label = toolsToggle.querySelector('.tool-label');
                        if (label) label.textContent = 'Translate';
                        toolsToggle.classList.add('active');
                        toolsToggle.classList.add('active-translate');
                    }
                    const toggle = queryInPopup('#translate-toggle') || queryInPopup('.nexus-translate-toggle');
                    if (toggle) { toggle.style.display = 'flex'; toggle.classList.add('active'); }
                    input.placeholder = 'Enter text to translate...';
                    input.value = val.slice(translateKw[0].length);
                    if (toolsWrapper) toolsWrapper.classList.remove('active');
                    if (toolsDropdown) toolsDropdown.classList.remove('active');
                }
            } else if (proofreadKw) {
                if (getModes().pr) {
                    removeActiveModes();
                    input.placeholder = 'Ask anything...';
                    input.value = val.slice(proofreadKw[0].length);
                } else {
                    removeActiveModes();
                    setProofread(true);
                    const toolItem = queryInPopup('[data-action="proofread"]');
                    if (toolItem) toolItem.classList.add('active');
                    if (toolsToggle) {
                        const label = toolsToggle.querySelector('.tool-label');
                        if (label) label.textContent = 'Proofread';
                        toolsToggle.classList.add('active');
                        toolsToggle.classList.add('active-proofread');
                    }
                    const toggle = queryInPopup('#proofread-toggle') || queryInPopup('.nexus-proofread-toggle');
                    if (toggle) { toggle.style.display = 'flex'; toggle.classList.add('active'); }
                    input.placeholder = 'Enter text to proofread...';
                    input.value = val.slice(proofreadKw[0].length);
                    if (toolsWrapper) toolsWrapper.classList.remove('active');
                    if (toolsDropdown) toolsDropdown.classList.remove('active');
                }
            } else if (!this._pendingWebSource && this._cachedSources && this._cachedSources.length) {
                for (const source of this._cachedSources) {
                    const escaped = source.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const sourceKw = val.match(new RegExp(`^${escaped}:?\\s+`, 'i'));
                    if (sourceKw) {
                        removeActiveModes();
                        this._pendingWebSource = source;
                        const websourceToggle = queryInPopup('#websource-toggle') || queryInPopup('.nexus-websource-toggle');
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
            this._updateActionBtnState();
            this._throttledUpdateTokenCount();
        });
        input.addEventListener('keydown', async (e) => {
            const isMentionActive = this.container.querySelector('.nexus-mention-popup.active');
            if (e.key === 'Enter' && !e.shiftKey && !e.defaultPrevented && !isMentionActive) {
                e.preventDefault();
                const text = input.value.trim();
                if (!text && this.selectedImages.length === 0) return;
                const inputContainer = queryInPopup('.nexus-input-container');
                if (inputContainer) {
                    inputContainer.classList.remove('nexus-sending');
                    void inputContainer.offsetWidth;
                    inputContainer.classList.add('nexus-sending');
                    setTimeout(() => inputContainer.classList.remove('nexus-sending'), 900);
                }
                if (this.historyEl && !this.historyEl._nexusListenersAttached) {
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
                    const rawDataUrl = await this._fileToDataURL(item.getAsFile());
                    this.addImage(rawDataUrl);
                }
            }
            this._updateContainerState();
        });
        const toolsWrapper = queryInPopup('#tools-wrapper') || queryInPopup('.nexus-actions-dropdown-wrapper');
        const toolsToggle = queryInPopup('#tools-toggle') || queryInPopup('.nexus-plus-toggle');
        const toolsDropdown = queryInPopup('#tools-dropdown') || queryInPopup('.nexus-tools-dropdown');
        if (toolsWrapper && toolsToggle && !toolsToggle.dataset.setupDone) {
            toolsToggle.dataset.setupDone = 'true';
            const toggleTools = (show) => {
                const modelDropdown = queryInPopup('.nexus-model-dropdown');
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
                if (toolsToggle.classList.contains('active')) {
                    removeActiveModes();
                    toggleTools(false);
                } else {
                    toggleTools();
                }
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
            if (toolsToggle) {
                const label = toolsToggle.querySelector('.tool-label');
                if (label) label.textContent = 'Tools';
                toolsToggle.classList.remove('active');
                toolsToggle.classList.remove('active-proofread');
                toolsToggle.classList.remove('active-translate');
            }
            ['#proofread-toggle', '#translate-toggle', '.nexus-proofread-toggle', '.nexus-translate-toggle'].forEach(sel => {
                const el = queryInPopup(sel); if (el) { el.style.display = 'none'; el.classList.remove('active'); }
            });
            popup.querySelectorAll('.nexus-tool-item').forEach(el => el.classList.remove('active'));
            checkExpand();
        };
        this._removeActiveModes = removeActiveModes;
        const setupTool = (sel, toggleSel, modename, modeSetter, placeholder) => {
            const item = queryInPopup(sel);
            if (item) item.addEventListener('click', (e) => {
                e.stopPropagation(); removeActiveModes(); modeSetter();
                item.classList.add('active');
                const activeToolsToggle = queryInPopup('#tools-toggle') || queryInPopup('.nexus-plus-toggle');
                if (activeToolsToggle) {
                    const label = activeToolsToggle.querySelector('.tool-label');
                    if (label) label.textContent = modename;
                    activeToolsToggle.classList.add('active');
                    const lowerMode = modename.toLowerCase();
                    if (lowerMode.includes('proofread')) {
                        activeToolsToggle.classList.add('active-proofread');
                    } else if (lowerMode.includes('translate')) {
                        activeToolsToggle.classList.add('active-translate');
                    }
                }
                input.placeholder = placeholder; input.focus();
                if (toolsWrapper) toolsWrapper.classList.remove('active');
                if (toolsDropdown) toolsDropdown.classList.remove('active');
                checkExpand();
            });
        };
        setupTool('[data-action="proofread"]', '#proofread-toggle', 'Proofread', () => { setProofread(true); }, 'Enter text to proofread...');
        setupTool('[data-action="translate"]', '#translate-toggle', 'Translate', () => { setTranslate(true); }, 'Enter text to translate...');
        ['#proofread-toggle', '#translate-toggle', '.nexus-proofread-toggle', '.nexus-translate-toggle'].forEach(sel => {
            const toggle = queryInPopup(sel);
            if (toggle) toggle.addEventListener('click', (e) => {
                e.preventDefault(); e.stopPropagation(); removeActiveModes();
                input.placeholder = 'Ask anything...'; input.focus(); checkExpand();
            });
        });
        this._setupModelSelector(popup);
        const uploadBtn = queryInPopup('#upload-btn');
        if (uploadBtn && this.fileInputEl) {
            uploadBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.fileInputEl.click();
            });
        }
        if (this.fileInputEl && !this.fileInputEl._nexusSetup) {
            this.fileInputEl._nexusSetup = true;
            this.fileInputEl.addEventListener('change', async (e) => {
                for (const file of e.target.files) this.addFile(file);
                this.fileInputEl.value = '';
            });
        }
        const dropTarget = this.options.isSpotlight ? document.body : popup;
        this._setupFileDragDrop(dropTarget, input);
        const micBtn = queryInPopup('#mic-btn') || queryInPopup('.nexus-mic-btn');
        if (micBtn) this._setupMicButton(micBtn, input);
        const actionBtn = queryInPopup('#action-btn') || queryInPopup('.nexus-action-btn');
        if (actionBtn) this._setupActionButton(actionBtn, input);
        this._updateActionBtnState();
    }
    _setupFileDragDrop(dropZone, input) {
        if (!dropZone || dropZone.dataset.nexusDropSetup === 'true') return;
        dropZone.dataset.nexusDropSetup = 'true';
        let dragDepth = 0;
        const hasFiles = (dt) => !!dt && Array.from(dt.types || []).includes('Files');
        const inputContainer = this.container ? this.container.querySelector('.nexus-input-container') : null;
        const setDragState = (active) => {
            dropZone.classList.toggle('nexus-drag-over', active);
            if (inputContainer) {
                inputContainer.classList.toggle('nexus-drag-over', active);
                if (!active) inputContainer.classList.remove('nexus-drag-hover-direct');
            }
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
            if (inputContainer) inputContainer.classList.remove('nexus-drag-hover-direct');
            const files = Array.from(e.dataTransfer.files || []);
            if (!files.length) return;
            await this._handleDroppedFiles(files, input);
        });
        if (inputContainer) {
            let containerDragDepth = 0;
            inputContainer.addEventListener('dragenter', (e) => {
                if (!hasFiles(e.dataTransfer)) return;
                containerDragDepth += 1;
                inputContainer.classList.add('nexus-drag-hover-direct');
            });
            inputContainer.addEventListener('dragover', (e) => {
                if (!hasFiles(e.dataTransfer)) return;
                inputContainer.classList.add('nexus-drag-hover-direct');
            });
            inputContainer.addEventListener('dragleave', (e) => {
                if (!hasFiles(e.dataTransfer)) return;
                containerDragDepth = Math.max(0, containerDragDepth - 1);
                if (containerDragDepth === 0) {
                    inputContainer.classList.remove('nexus-drag-hover-direct');
                }
            });
        }
        if (this.options.isSpotlight && !window.__nexusSpotlightDropGuardInstalled) {
            const globalDropGuard = (e) => {
                if (!hasFiles(e.dataTransfer)) return;
                e.preventDefault();
            };
            window.addEventListener('dragover', globalDropGuard);
            window.addEventListener('drop', globalDropGuard);
            window.__nexusSpotlightDropGuardInstalled = true;
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
            this._updateActionBtnState();
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
            const toggle = queryInPopup('#proofread-toggle') || queryInPopup('.nexus-proofread-toggle');
            if (toggle) { toggle.style.display = 'flex'; toggle.classList.add('active'); }
            const toolItem = queryInPopup('[data-action="proofread"]');
            if (toolItem) toolItem.classList.add('active');
        } else if (state.isTranslateMode) {
            this.isTranslateMode = true;
            const toggle = queryInPopup('#translate-toggle') || queryInPopup('.nexus-translate-toggle');
            if (toggle) { toggle.style.display = 'flex'; toggle.classList.add('active'); }
            const toolItem = queryInPopup('[data-action="translate"]');
            if (toolItem) toolItem.classList.add('active');
        }
        if (this._checkExpand) this._checkExpand();
        this._updateContainerState();
        this._updateActionBtnState();
    }
    _setupMentions() { }
    _updateContainerState() {
        const queryInPopup = (selector) => this.container.querySelector(selector) || document.querySelector(selector);
        const container = queryInPopup('.nexus-input-container');
        if (container) {
            if (this.inputEl && (this.inputEl.value.trim().length > 0 || this.selectedImages.length > 0)) container.classList.add('has-content');
            else container.classList.remove('has-content');
            if (document.activeElement === this.inputEl) container.classList.add('focused');
            else container.classList.remove('focused');
        }
    }
    _setupModelSelector(popup) {
        const selector = popup.querySelector('.nexus-model-selector');
        if (!selector) return;
        const btn = selector.querySelector('.nexus-model-btn'), label = selector.querySelector('.nexus-current-model'), dropdown = selector.querySelector('.nexus-model-dropdown');
        if (!btn || !dropdown) return;
        const self = this;
        if (typeof window.getPromptApiNamespace === 'undefined') {
            window.getPromptApiNamespace = function () {
                console.log("[Prompt API Debug] checking namespaces...");
                if (typeof chrome !== 'undefined' && chrome.ai && chrome.ai.languageModel) {
                    console.log("[Prompt API Debug] Found chrome.ai.languageModel");
                    return chrome.ai.languageModel;
                }
                if (typeof chrome !== 'undefined' && chrome.aiLanguageModel) {
                    console.log("[Prompt API Debug] Found chrome.aiLanguageModel");
                    return chrome.aiLanguageModel;
                }
                if (typeof chrome !== 'undefined' && chrome.aiOriginTrial && chrome.aiOriginTrial.languageModel) {
                    console.log("[Prompt API Debug] Found chrome.aiOriginTrial.languageModel");
                    return chrome.aiOriginTrial.languageModel;
                }
                if (typeof ai !== 'undefined' && ai.languageModel) {
                    console.log("[Prompt API Debug] Found ai.languageModel");
                    return ai.languageModel;
                }
                if (typeof self !== 'undefined' && self.ai && self.ai.languageModel) {
                    console.log("[Prompt API Debug] Found self.ai.languageModel");
                    return self.ai.languageModel;
                }
                console.log("[Prompt API Debug] No modern Prompt API namespace found.");
                return null;
            };
        }
        if (typeof window.getPromptApiSupport === 'undefined') {
            window.getPromptApiSupport = async function () {
                return { supported: false, status: 'no', reason: 'Disabled' };
            };
        }
        const render = (data) => {
            const promptSupport = data.promptSupport || { supported: false, status: 'no', reason: 'Prompt API not checked' };
            const chain = window.NexusModelHelper.buildModelChain(data, promptSupport);
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
            const activeChainItem = chain.find(c => c.model === currentModel && c.providerId === currentProviderId) || chain.find(c => c.model === currentModel);
            const activeDisplayName = activeChainItem?.displayName || activeChainItem?.name || currentModel;
            if (activeDisplayName && label) label.textContent = activeDisplayName;
            dropdown.innerHTML = '';
            if (chain.length === 0) { dropdown.innerHTML = '<div style="padding:8px;font-size:11px;color:var(--nexus-text-secondary);">No models</div>'; return; }
            chain.forEach((item) => {
                const el = document.createElement('button');
                const isActive = item.model === currentModel && item.providerId === currentProviderId;
                const displayName = item.displayName || item.name || item.model;
                el.className = `nexus-model-item ${isActive ? 'active' : ''}`;
                el.innerHTML = `<div class="model-info"><span class="model-name">${displayName}</span></div>`;
                el.onclick = (e) => {
                    e.stopPropagation();
                    if (label) label.textContent = displayName;
                    dropdown.classList.remove('active');
                    dropdown.querySelectorAll('.nexus-model-item').forEach(b => b.classList.remove('active'));
                    el.classList.add('active');
                    self.activeTabModel = { model: item.model, providerId: item.providerId };
                    chrome.storage.local.set({ lastUsedModel: self.activeTabModel });
                    const sid = self.historyEl?.dataset?.sessionId || null;
                    const sidKey = sid || 'null';
                    chrome.storage.local.get(['nexus_session_settings', 'advancedParamsByModel'], (res) => {
                        const settings = res.nexus_session_settings || {};
                        if (!settings[sidKey]) settings[sidKey] = {};
                        settings[sidKey].selectedModel = self.activeTabModel;
                        const advancedParamsByModel = res.advancedParamsByModel || {};
                        const compositeKey = item.providerId ? `${item.providerId}:${item.model}` : item.model;
                        const modelParams = (item.providerId && advancedParamsByModel[compositeKey]) ? advancedParamsByModel[compositeKey] : (!item.providerId ? (advancedParamsByModel[item.model] || {}) : {});
                        const defaultThinking = window.NexusModelHelper.getDefaultThinking(item.model, item.providerId);
                        const newThinkingLevel = modelParams.thinkingLevel || defaultThinking;
                        self.thinkingLevel = newThinkingLevel;
                        settings[sidKey].thinkingLevel = newThinkingLevel;
                        chrome.storage.local.set({ nexus_session_settings: settings }, () => {
                            if (typeof window.NexusChatHistory?.updateSessionModelAndThinking === 'function' && sid) {
                                window.NexusChatHistory.updateSessionModelAndThinking(sid, self.activeTabModel, newThinkingLevel);
                            }
                            if (typeof self.refreshReasoningSelector === 'function') {
                                self.refreshReasoningSelector();
                            }
                        });
                    });
                    self._updateTokenLimitFromModel();
                    selector.dispatchEvent(new CustomEvent('nexus:model-change', {
                        bubbles: true,
                        detail: { model: item.model, providerId: item.providerId }
                    }));
                };
                dropdown.appendChild(el);
            });
            const divider = document.createElement('div');
            divider.className = 'nexus-model-divider';
            dropdown.appendChild(divider);
            const thinkingItem = document.createElement('div');
            thinkingItem.className = 'nexus-model-item nexus-thinking-parent-item';
            thinkingItem.style.position = 'relative';
            thinkingItem.style.display = 'flex';
            thinkingItem.style.alignItems = 'center';
            thinkingItem.style.justifyContent = 'space-between';
            thinkingItem.style.cursor = 'pointer';
            const currentLevel = self.thinkingLevel || 'none';
            const titleMap = {
                'minimal': 'Minimal',
                'low': 'Low',
                'medium': 'Standard',
                'high': 'Extended',
                'none': 'None'
            };
            thinkingItem.innerHTML = `
                <div class="model-info">
                    <span class="model-name">Thinking level</span>
                    <span class="model-desc">${titleMap[currentLevel] || 'None'}</span>
                </div>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.6;"><polyline points="9 18 15 12 9 6"></polyline></svg>
            `;
            const submenu = document.createElement('div');
            submenu.className = 'nexus-thinking-submenu';
            const options = window.NexusModelHelper.getThinkingOptions(currentModel, currentProviderId, data.providers);
            options.forEach((opt) => {
                const optEl = document.createElement('button');
                const isActive = currentLevel === opt.value;
                optEl.className = `nexus-thinking-opt-item ${isActive ? 'active' : ''}`;
                const checkmarkIcon = isActive ? `
                    <span class="reasoning-checkmark">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    </span>
                ` : `
                    <span class="reasoning-checkmark"></span>
                `;
                optEl.innerHTML = `
                    ${checkmarkIcon}
                    <div class="reasoning-info">
                        <span class="reasoning-title">${opt.title}</span>
                        <span class="reasoning-desc">${opt.desc}</span>
                    </div>
                `;
                optEl.onclick = (e) => {
                    e.stopPropagation();
                    self.thinkingLevel = opt.value;
                    const sid = self.historyEl?.dataset?.sessionId || null;
                    const sidKey = sid || 'null';
                    chrome.storage.local.get(['nexus_session_settings'], (res) => {
                        const settings = res.nexus_session_settings || {};
                        if (!settings[sidKey]) settings[sidKey] = {};
                        settings[sidKey].thinkingLevel = opt.value;
                        chrome.storage.local.set({ nexus_session_settings: settings, lastUsedThinkingLevel: opt.value }, () => {
                            if (typeof window.NexusChatHistory?.updateSessionModelAndThinking === 'function' && sid) {
                                window.NexusChatHistory.updateSessionModelAndThinking(sid, undefined, opt.value);
                            }
                            if (typeof self.refreshSystemTokens === 'function') {
                                self.refreshSystemTokens();
                            }
                            dropdown.classList.remove('active');
                            if (typeof self.refreshReasoningSelector === 'function') {
                                self.refreshReasoningSelector();
                            }
                        });
                    });
                };
                submenu.appendChild(optEl);
            });
            thinkingItem.appendChild(submenu);
            dropdown.appendChild(thinkingItem);
        };
        const fetchAndRender = () => {
            const sid = self.historyEl?.dataset?.sessionId || null;
            const sidKey = sid || 'null';
            chrome.storage.local.get(['providers', 'models', 'modelChains', 'lastUsedModel', 'nexus_session_settings', 'advancedParamsByModel'], async (data) => {
                const support = await window.getPromptApiSupport();
                data.promptSupport = support;
                const settings = data.nexus_session_settings || {};
                const saved = settings[sidKey] || {};
                if (!self.activeTabModel && saved.selectedModel) {
                    self.activeTabModel = { ...saved.selectedModel };
                }
                const modelObj = self.activeTabModel;
                if (modelObj) {
                    const compositeKey = modelObj.providerId ? `${modelObj.providerId}:${modelObj.model}` : modelObj.model;
                    const advancedParamsByModel = data.advancedParamsByModel || {};
                    const modelParams = (modelObj.providerId && advancedParamsByModel[compositeKey]) ? advancedParamsByModel[compositeKey] : (!modelObj.providerId ? (advancedParamsByModel[modelObj.model] || {}) : {});
                    const defaultThinking = window.NexusModelHelper.getDefaultThinking(modelObj.model, modelObj.providerId);
                    self.thinkingLevel = saved.thinkingLevel || modelParams.thinkingLevel || defaultThinking;
                }
                render(data);
                self._updateActionBtnState();
            });
        };
        fetchAndRender();
        this.refreshModelSelector = fetchAndRender;
        this.refreshReasoningSelector = fetchAndRender;
        const selectorWrapper = selector;
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (dropdown.classList.contains('active')) {
                dropdown.classList.remove('active');
            } else {
                const toolsDropdown = popup.querySelector('.nexus-tools-dropdown');
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
        let isRecording = false;
        let recognition = null;
        let originalInputText = '';
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            btn.addEventListener('click', (e) => {
                e.preventDefault(); e.stopPropagation();
                alert('Your browser does not support Speech Recognition.');
            });
            return;
        }
        btn.addEventListener('click', async (e) => {
            e.preventDefault(); e.stopPropagation();
            if (isRecording) {
                if (recognition) recognition.stop();
                return;
            }
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                stream.getTracks().forEach(t => t.stop());
                recognition = new SpeechRecognition();
                recognition.continuous = true;
                recognition.interimResults = true;
                originalInputText = '';
                input.value = '';
                recognition.onstart = () => {
                    isRecording = true;
                    btn.classList.add('recording');
                    input.placeholder = 'Listening...';
                };
                recognition.onresult = (event) => {
                    let interimTranscript = '';
                    let finalTranscript = '';
                    for (let i = event.resultIndex; i < event.results.length; ++i) {
                        if (event.results[i].isFinal) {
                            finalTranscript += event.results[i][0].transcript;
                        } else {
                            interimTranscript += event.results[i][0].transcript;
                        }
                    }
                    if (finalTranscript) {
                        let textToAdd = finalTranscript.trim();
                        if (!originalInputText || /[.!?]\s*$/.test(originalInputText)) {
                            textToAdd = textToAdd.charAt(0).toUpperCase() + textToAdd.slice(1);
                        }
                        originalInputText += originalInputText ? ' ' + textToAdd : textToAdd;
                    }
                    let currentText = originalInputText;
                    if (interimTranscript) {
                        currentText += (currentText ? ' ' : '') + interimTranscript.trim();
                    }
                    input.value = currentText;
                    input.style.height = 'auto';
                    input.style.height = input.scrollHeight + 'px';
                    this._updateContainerState();
                };
                recognition.onerror = (event) => {
                    console.error('Speech recognition error', event.error);
                    if (event.error === 'not-allowed') {
                        if (confirm('Nexus cần quyền truy cập Microphone để nhận diện giọng nói.\n\nDo hạn chế của trình duyệt, bạn cần cấp quyền này ở tab cài đặt. Mở trang cài đặt ngay?')) {
                            chrome.runtime.sendMessage({ action: 'open_options', section: 'general', requestMic: true });
                        }
                    }
                };
                recognition.onend = () => {
                    isRecording = false;
                    btn.classList.remove('recording');
                    input.placeholder = 'Ask anything...';
                    input.focus();
                };
                recognition.start();
            } catch (err) {
                console.error(err);
                if (err.name === 'NotAllowedError' || err.name === 'PermissionDismissedError') {
                    if (confirm('Nexus cần quyền truy cập Microphone để nhận diện giọng nói.\n\nDo hạn chế của trình duyệt, bạn cần cấp quyền này ở tab cài đặt. Mở trang cài đặt ngay?')) {
                        chrome.runtime.sendMessage({ action: 'open_options', section: 'general', requestMic: true });
                    }
                } else {
                    alert('Không thể truy cập Microphone: ' + err.message);
                }
            }
        });
    }
    _setupActionButton(btn, input) {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (this.isGenerating) {
                if (this.onStop) this.onStop();
                this.hideStopButton();
            } else {
                const val = input.value.trim();
                if (val || (this.attachedFiles && this.attachedFiles.length > 0)) {
                    this._handleSubmit();
                }
            }
        });
    }
    _getMaxTokens() {
        let maxTokens = null;
        const modelLabel = this.container ? this.container.querySelector('.nexus-current-model') : null;
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
    _handleSubmit(isRegenerate = false, entryId = null) {
        const text = isRegenerate ? '' : this.inputEl.value.trim();
        if (!text && !isRegenerate) return;
        if (this.attachedFiles.some(f => f.status === 'uploading' || f.status === 'compressing')) {
            console.warn('[Nexus] Cannot submit: files are still processing');
            return;
        }
        this.isGenerating = true;
        this._updateActionBtnState();
        const inputContainer = this.container ? this.container.querySelector('.nexus-input-container') : null;
        if (inputContainer) {
            inputContainer.classList.remove('nexus-sending');
            void inputContainer.offsetWidth;
            inputContainer.classList.add('nexus-sending');
            setTimeout(() => inputContainer.classList.remove('nexus-sending'), 900);
        }
        const readPage = !!this.readWebpageEnabled;
        const pageTitle = this.currentPageTitle || "Current Page";
        const maxTokens = this._getMaxTokens();
        if (this.options.onSubmit) {
            const submitFiles = this.attachedFiles.map(file => ({ ...file }));
            this.options.onSubmit(text, submitFiles, { readPage, pageTitle, maxTokens, isRegenerate, entryId });
        }
        if (!isRegenerate) {
            this.inputEl.value = '';
            this.inputEl.style.height = 'auto';
            this.clearImages();
        }
    }
    _updateActionBtnState() {
        if (!this.container) return;
        const actionBtn = this.container.querySelector('#action-btn') || document.querySelector('#action-btn');
        if (!actionBtn) return;
        const val = this.inputEl ? this.inputEl.value.trim() : '';
        if (this.isGenerating) {
            actionBtn.className = 'nexus-action-btn active pause';
            actionBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"></rect></svg>`;
            actionBtn.title = "Pause";
            actionBtn.removeAttribute('disabled');
        } else if (val) {
            actionBtn.className = 'nexus-action-btn active send';
            actionBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>`;
            actionBtn.title = "Send";
            actionBtn.removeAttribute('disabled');
        } else {
            actionBtn.className = 'nexus-action-btn send';
            actionBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>`;
            actionBtn.title = "Send";
            actionBtn.setAttribute('disabled', 'true');
        }
    }
    _isDocxFile(file) {
        return typeof NexusFileProcessor !== 'undefined' && NexusFileProcessor.isDocxFile ? NexusFileProcessor.isDocxFile(file) : (file?.name || '').toLowerCase().endsWith('.docx');
    }
    _isXlsxFile(file) {
        return typeof NexusFileProcessor !== 'undefined' && NexusFileProcessor.isXlsxFile ? NexusFileProcessor.isXlsxFile(file) : (file?.name || '').toLowerCase().endsWith('.xlsx');
    }
    _fileToDataURL(file) {
        return NexusFileProcessor.fileToDataURL(file);
    }
    static _resolveImagePreviewSrc(item, src) {
        return NexusFileProcessor.resolveImagePreviewSrc(item, src);
    }
    static _createObjectUrlFromDataUrl(dataUrl) {
        return NexusFileProcessor.createObjectUrlFromDataUrl(dataUrl);
    }
    _resolveImagePreviewSrc(item, src) {
        return NexusFileProcessor.resolveImagePreviewSrc(item, src);
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
        if (!this._nexusPreviewObjectUrls) this._nexusPreviewObjectUrls = new Set();
        this._nexusPreviewObjectUrls.add(objectUrl);
        return objectUrl;
    }
    _revokeObjectUrl(url) {
        if (!url || typeof url !== 'string' || !url.startsWith('blob:') || !URL?.revokeObjectURL) return;
        try {
            URL.revokeObjectURL(url);
        } catch (_) {
        }
        if (this._nexusPreviewObjectUrls) this._nexusPreviewObjectUrls.delete(url);
    }
    showStopButton(onStop = null) {
        this.isGenerating = true;
        this.onStop = onStop;
        this._updateActionBtnState();
        let stopBtn = null;
        if (this.container) {
            stopBtn = this.container.querySelector('#nexus-stop-btn') || this.container.querySelector('.nexus-stop-btn');
        }
        if (!stopBtn && typeof document !== 'undefined') {
            stopBtn = document.getElementById('nexus-stop-btn') || document.querySelector('.nexus-stop-btn');
        }
        if (stopBtn) {
            stopBtn.style.display = 'flex';
            if (!stopBtn.dataset.listenerAdded) {
                stopBtn.dataset.listenerAdded = 'true';
                stopBtn.addEventListener('click', () => {
                    if (this.onStop) this.onStop();
                    this.hideStopButton();
                });
            }
        }
    }
    hideStopButton() {
        this.isGenerating = false;
        this.onStop = null;
        this._updateActionBtnState();
        let stopBtn = null;
        if (this.container) {
            stopBtn = this.container.querySelector('#nexus-stop-btn') || this.container.querySelector('.nexus-stop-btn');
        }
        if (stopBtn) {
            stopBtn.style.display = 'none';
        }
    }
    _initContextMenu() {
        if (!this.container) return;
        const existing = document.querySelector('.nexus-context-menu');
        if (existing) existing.remove();
        this.contextMenu = document.createElement('div');
        this.contextMenu.className = 'nexus-context-menu';
        this.contextMenu.innerHTML = `
            <button class="nexus-context-menu-item" data-action="copy">
                <span class="nexus-svg-icon nexus-icon-copy" aria-hidden="true"></span>
                Copy
            </button>
            <button class="nexus-context-menu-item" data-action="regenerate">
                <span class="nexus-svg-icon nexus-icon-refresh" aria-hidden="true"></span>
                Regenerate
            </button>
        `;
        document.body.appendChild(this.contextMenu);
        document.addEventListener('click', (e) => {
            if (!this.contextMenu.contains(e.target)) {
                this._hideContextMenu();
            }
        });
        this.contextMenu.addEventListener('click', (e) => {
            const item = e.target.closest('.nexus-context-menu-item');
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
        if (!this.contextMenuBackdrop) {
            this.contextMenuBackdrop = document.createElement('div');
            this.contextMenuBackdrop.className = 'nexus-overlay-backdrop';
            this.contextMenuBackdrop.style.zIndex = '99999';
            this.contextMenuBackdrop.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
            this.contextMenuBackdrop.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
            this.contextMenuBackdrop.addEventListener('click', () => this._hideContextMenu());
            document.body.appendChild(this.contextMenuBackdrop);
        }
        this.contextMenuBackdrop.style.display = 'block';
        this._contextMenuOriginalOverflowBody = document.body.style.overflow;
        this._contextMenuOriginalOverflowHtml = document.documentElement.style.overflow;
        document.body.style.overflow = 'hidden';
        document.documentElement.style.overflow = 'hidden';
        this.contextMenu.style.display = 'flex';
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
        if (this.contextMenuBackdrop) {
            this.contextMenuBackdrop.style.display = 'none';
        }
        if (this._contextMenuOriginalOverflowBody !== undefined) {
            document.body.style.overflow = this._contextMenuOriginalOverflowBody || '';
            document.documentElement.style.overflow = this._contextMenuOriginalOverflowHtml || '';
            this._contextMenuOriginalOverflowBody = undefined;
            this._contextMenuOriginalOverflowHtml = undefined;
        }
    }
    async _handleContextMenuAction(action, answer) {
        const entry = answer.closest('.nexus-entry');
        if (!entry) return;
        const rawText = answer.getAttribute('data-raw-text') || answer.innerText || "";
        switch (action) {
            case 'copy': {
                let plain = rawText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
                const clone = answer.cloneNode(true);
                clone.querySelectorAll('.nexus-actions, .nexus-answer-versions, .nexus-answer-nav, .nexus-thinking-steps, .nexus-thinking').forEach(el => el.remove());
                
                // Clean up KaTeX math rendering to avoid duplicated math symbols in rich text copy
                clone.querySelectorAll('.katex').forEach(katexEl => {
                    const annotation = katexEl.querySelector('annotation');
                    if (annotation) {
                        const tex = annotation.textContent.trim();
                        const isDisplay = katexEl.closest('.katex-display') !== null;
                        const replacement = isDisplay ? `$$${tex}$$` : `$${tex}$`;
                        const textNode = document.createTextNode(replacement);
                        katexEl.parentNode.replaceChild(textNode, katexEl);
                    }
                });
                clone.querySelectorAll('.katex-display').forEach(displayEl => {
                    const parent = displayEl.parentNode;
                    if (parent) {
                        while (displayEl.firstChild) {
                            parent.insertBefore(displayEl.firstChild, displayEl);
                        }
                        displayEl.remove();
                    }
                });
                clone.querySelectorAll('table').forEach(table => {
                    table.setAttribute('border', '1');
                    table.style.border = '1px solid #cccccc';
                    table.style.borderCollapse = 'collapse';
                    table.style.margin = '12px 0';
                    table.style.width = '100%';
                });
                clone.querySelectorAll('th').forEach(th => {
                    th.style.border = '1px solid #cccccc';
                    th.style.padding = '8px 12px';
                    th.style.backgroundColor = '#f3f4f6';
                    th.style.fontWeight = 'bold';
                    th.style.color = '#333333';
                });
                clone.querySelectorAll('td').forEach(td => {
                    td.style.border = '1px solid #cccccc';
                    td.style.padding = '8px 12px';
                    td.style.color = '#333333';
                });
                clone.querySelectorAll('code').forEach(code => {
                    code.style.color = '#1f2937';
                    code.style.backgroundColor = 'rgba(0, 0, 0, 0.06)';
                    code.style.padding = '2px 6px';
                    code.style.borderRadius = '6px';
                    code.style.fontFamily = "'Google Sans Code', 'Source Code Pro', Consolas, Monaco, monospace";
                    code.style.fontSize = '0.95em';
                    code.style.fontWeight = '500';
                    code.innerHTML = code.innerHTML.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                });
                clone.querySelectorAll('pre').forEach(pre => {
                    pre.style.backgroundColor = '#f3f4f6';
                    pre.style.padding = '12px';
                    pre.style.borderRadius = '6px';
                    pre.style.border = '1px solid #e5e7eb';
                    pre.style.overflowX = 'auto';
                    pre.style.margin = '12px 0';
                    const codeEl = pre.querySelector('code');
                    if (codeEl) {
                        codeEl.style.color = '#333333';
                        codeEl.style.backgroundColor = 'transparent';
                        codeEl.style.padding = '0';
                        codeEl.style.borderRadius = '0';
                    }
                });
                const htmlContent = clone.innerHTML.trim();
                try {
                    const textBlob = new Blob([plain], { type: 'text/plain' });
                    const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
                    const clipboardItem = new ClipboardItem({
                        'text/plain': textBlob,
                        'text/html': htmlBlob
                    });
                    await navigator.clipboard.write([clipboardItem]);
                } catch (err) {
                    navigator.clipboard.writeText(plain);
                }
                break;
            }
            case 'copy-md': {
                navigator.clipboard.writeText(rawText);
                break;
            }
            case 'edit': {
                this.enterAnswerEditMode(answer);
                break;
            }
            case 'regenerate': {
                this.regenerateEntry(entry);
                break;
            }
        }
    }
    _handleAnswerAction(action, buttonEl, answerDiv) {
        if (action === 'copy') {
            this._handleContextMenuAction('copy', answerDiv);
            const originalHTML = buttonEl.innerHTML;
            buttonEl.classList.add('is-active');
            buttonEl.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
            setTimeout(() => {
                buttonEl.classList.remove('is-active');
                buttonEl.innerHTML = originalHTML;
            }, 1000);
        } else if (action === 'regenerate') {
            this._handleContextMenuAction('regenerate', answerDiv);
        } else if (action === 'edit') {
            this._handleContextMenuAction('edit', answerDiv);
        } else if (action === 'more') {
            this._showMoreOptionsDropdown(buttonEl, answerDiv);
        }
    }
    _showMoreOptionsDropdown(buttonEl, answerDiv) {
        if (!this.contextMenu) return;
        this.contextMenu.__targetAnswer = answerDiv;
        this.contextMenu.innerHTML = `
            <button class="nexus-context-menu-item" data-action="edit">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                Edit
            </button>
        `;
        const rect = buttonEl.getBoundingClientRect();
        const dropdownWidth = 140;
        let left = rect.left + window.scrollX + rect.width - dropdownWidth;
        let top = rect.bottom + window.scrollY + 6;
        if (left < 10) left = 10;
        this.contextMenu.style.left = `${left}px`;
        this.contextMenu.style.top = `${top}px`;
        this.contextMenu.style.display = 'block';
        this.contextMenu.classList.add('visible');
    }
    _handleQuestionRecheck(userInput, editable, isRegenerate = false) {
        const questionDiv = editable.closest('.nexus-chat-question');
        const entry = editable.closest('.nexus-entry');
        if (!entry) return;
        entry.dataset.timestamp = Date.now().toString();
        const userTextOnly = userInput.replace(/^SelectedText\s*/, '').trim();
        const rawText = (questionDiv && questionDiv.getAttribute('data-raw-text')) || userInput;
        let finalFullQuestion = userTextOnly;
        if (rawText.includes('$ContextTag')) {
            finalFullQuestion = `$ContextTag ${userTextOnly}`;
        } else if (rawText.startsWith('SelectedText:')) {
            const contextMatch = rawText.match(/^SelectedText: "[^"]*"\s+/);
            if (contextMatch) {
                finalFullQuestion = contextMatch[0] + userTextOnly;
            }
        }
        this.currentEntryDiv = entry;
        this.currentAnswerDiv = null;
        const entryId = entry.dataset.entryId;
        if (typeof window.tabs !== 'undefined' && this.historyEl) {
            const currentTab = window.tabs.find(t => t.historyEl === this.historyEl);
            if (currentTab) {
                const otherTabs = window.tabs.filter(t => t !== currentTab && t.sessionId === currentTab.sessionId && t.historyEl);
                otherTabs.forEach(ot => {
                    const otherEntry = ot.historyEl.querySelector(`.nexus-entry[data-entry-id="${entryId}"]`);
                    if (otherEntry && ot.chatUIInstance) {
                        let next = otherEntry.nextElementSibling;
                        while (next) {
                            const toRemove = next;
                            next = next.nextElementSibling;
                            toRemove.remove();
                        }
                        otherEntry.querySelectorAll('.nexus-chat-answer, .nexus-web-search').forEach(el => el.remove());
                        ot.chatUIInstance.currentEntryDiv = otherEntry;
                        ot.chatUIInstance.currentAnswerDiv = null;
                    }
                });
            }
        }
        let next = entry.nextElementSibling;
        while (next) {
            const toRemove = next;
            next = next.nextElementSibling;
            toRemove.remove();
        }
        entry.querySelectorAll('.nexus-chat-answer, .nexus-web-search').forEach(el => el.remove());
        const scrollContainer = this.getScrollContainer();
        if (isRegenerate) {
            this._regenScrollLocked = true;
            this._regenScrollContainer = scrollContainer;
            if (scrollContainer) {
                this._regenScrollPosition = scrollContainer.scrollTop;
            }
        } else {
            this._regenScrollLocked = false;
            this._regenScrollContainer = null;
            this._regenScrollPosition = null;
        }
        this.setInitialEntryHeight(entry, false, 0, true);
        this.showLoading(null, isRegenerate);
        if (typeof this.options.onSubmit === 'function') {
            const entryId = entry.dataset.entryId;
            const entryType = entry.dataset.entryType || 'chat';
            let originalImages = [];
            if (questionDiv && Array.isArray(questionDiv._nexusImages)) {
                originalImages = questionDiv._nexusImages;
            } else if (entry && Array.isArray(entry._nexusImages)) {
                originalImages = entry._nexusImages;
            } else if (questionDiv && questionDiv.dataset.images) {
                try {
                    const parsed = JSON.parse(questionDiv.dataset.images);
                    if (Array.isArray(parsed)) {
                        originalImages = parsed;
                    } else if (parsed && Array.isArray(parsed.files)) {
                        originalImages = parsed.files;
                    }
                } catch (_) { }
            }
            this.options.onSubmit(finalFullQuestion, originalImages, {
                isRecheck: true,
                isRegenerate,
                entryId,
                mode: entryType
            });
        }
    }
    _focusEditableAtEnd(el) {
        if (!el) return;
        const setCaret = () => {
            try {
                el.focus();
                const selection = window.getSelection();
                const range = document.createRange();
                range.selectNodeContents(el);
                range.collapse(false);
                selection.removeAllRanges();
                selection.addRange(range);

                el.scrollTop = el.scrollHeight;
                const parentDiv = el.closest('.nexus-chat-question');
                if (parentDiv) {
                    parentDiv.scrollTop = parentDiv.scrollHeight;
                }
            } catch (_) { }
        };
        setCaret();
        requestAnimationFrame(setCaret);
        setTimeout(setCaret, 30);
        setTimeout(setCaret, 100);
    }
    regenerateEntry(entry) {
        if (!entry) return;
        const questionDiv = entry.querySelector('.nexus-chat-question');
        if (!questionDiv) return;
        const questionContent = questionDiv.querySelector('.nexus-question-content')
            || questionDiv.querySelector('div[contenteditable="true"]')
            || questionDiv;
        const rawQuestion = questionDiv.getAttribute('data-raw-text') || questionContent.innerText || questionContent.textContent || '';
        if (!rawQuestion.trim()) return;
        this._handleQuestionRecheck(rawQuestion.trim(), questionContent, true);
    }
    enterQuestionEditMode(questionDiv) {
        if (!questionDiv || questionDiv.classList.contains('nexus-question-editing')) return;
        this._hideContextMenu();
        this.cancelAllQuestionEdits();
        const row = questionDiv.closest('.nexus-question-row');
        let contentDiv = questionDiv.querySelector('.nexus-question-content') || questionDiv.querySelector('div[contenteditable="true"]');
        if (!contentDiv) {
            const originalHTML = questionDiv.innerHTML;
            questionDiv.innerHTML = '';
            contentDiv = document.createElement('div');
            contentDiv.className = 'nexus-question-content';
            contentDiv.innerHTML = originalHTML;
            questionDiv.appendChild(contentDiv);
        }
        if (!contentDiv) return;
        questionDiv.__originalHTML = contentDiv.innerHTML;
        questionDiv.__originalRaw = questionDiv.getAttribute('data-raw-text') || contentDiv.innerText || '';
        questionDiv.__questionEditOriginalClassName = contentDiv.className;
        questionDiv.classList.add('is-editing', 'nexus-question-editing');
        questionDiv.classList.remove('has-overflow', 'expanded');
        const expandBtn = questionDiv.querySelector('.nexus-question-expand-btn');
        if (expandBtn) expandBtn.remove();
        if (row) row.classList.add('nexus-question-row-editing');
        contentDiv.className = 'nexus-answer-content';
        contentDiv.contentEditable = 'plaintext-only';
        contentDiv.spellcheck = false;
        const toolbar = document.createElement('div');
        toolbar.className = 'nexus-edit-toolbar nexus-question-edit-toolbar';
        toolbar.contentEditable = 'false';
        toolbar.innerHTML = `
            <button class="nexus-edit-btn nexus-edit-cancel" title="Cancel">Cancel</button>
            <button class="nexus-edit-btn nexus-edit-save" title="Update" disabled>Update</button>
        `;
        toolbar.onmousedown = (e) => e.preventDefault();
        const saveBtn = toolbar.querySelector('.nexus-edit-save');
        const cancelBtn = toolbar.querySelector('.nexus-edit-cancel');
        cancelBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.exitQuestionEditMode(questionDiv, false);
        };
        saveBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!saveBtn.disabled) {
                this.exitQuestionEditMode(questionDiv, true);
            }
        };

        const normalizeText = (t) => t.replace(/\n$/, '');
        const updateSaveBtnState = () => {
            const currentText = normalizeText(contentDiv.innerText || contentDiv.textContent || '');
            const originalText = normalizeText(questionDiv.__originalRaw || '');
            const isEmpty = currentText.trim() === '';
            const unchanged = currentText === originalText;
            if (saveBtn) {
                saveBtn.disabled = isEmpty || unchanged;
            }
        };
        contentDiv.addEventListener('input', updateSaveBtnState);
        contentDiv.addEventListener('keyup', updateSaveBtnState);
        questionDiv.__questionEditInputHandler = updateSaveBtnState;

        if (row) {
            row.appendChild(toolbar);
        } else {
            questionDiv.appendChild(toolbar);
        }
        questionDiv.__questionEditToolbar = toolbar;
        questionDiv.__questionEditContentDiv = contentDiv;
        this._focusEditableAtEnd(contentDiv);
        const keyHandler = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                this.exitQuestionEditMode(questionDiv, false);
                contentDiv.removeEventListener('keydown', keyHandler);
            } else if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (saveBtn && !saveBtn.disabled) {
                    this.exitQuestionEditMode(questionDiv, true);
                    contentDiv.removeEventListener('keydown', keyHandler);
                }
            }
        };
        contentDiv.addEventListener('keydown', keyHandler);
        questionDiv.__questionEditKeyHandler = keyHandler;

        const questionClickListener = (e) => {
            if (toolbar && toolbar.contains(e.target)) return;
            if (contentDiv && (contentDiv === e.target || contentDiv.contains(e.target))) return;
            this._focusEditableAtEnd(contentDiv);
        };
        questionDiv.addEventListener('click', questionClickListener);
        questionDiv.__questionEditClickListener = questionClickListener;
    }
    _undoEditAndTruncate(entry, mode, questionDiv, answerDiv) {
        if (!entry) return;
        const entryId = entry.dataset.entryId;

        if (typeof window.tabs !== 'undefined' && this.historyEl) {
            const currentTab = window.tabs.find(t => t.historyEl === this.historyEl);
            if (currentTab) {
                const otherTabs = window.tabs.filter(t => t !== currentTab && t.sessionId === currentTab.sessionId && t.historyEl);
                otherTabs.forEach(ot => {
                    const otherEntry = ot.historyEl.querySelector(`.nexus-entry[data-entry-id="${entryId}"]`);
                    if (otherEntry && ot.chatUIInstance) {
                        let next = otherEntry.nextElementSibling;
                        while (next) {
                            const toRemove = next;
                            next = next.nextElementSibling;
                            toRemove.remove();
                        }
                        const otPrevEntry = otherEntry.previousElementSibling;
                        ot.chatUIInstance.currentEntryDiv = otPrevEntry;
                        if (otPrevEntry) {
                            ot.chatUIInstance.currentAnswerDiv = otPrevEntry.querySelector('.nexus-chat-answer') ||
                                otPrevEntry.querySelector('.nexus-answer-versions');
                        } else {
                            ot.chatUIInstance.currentAnswerDiv = null;
                        }
                        otherEntry.remove();
                        ot.chatUIInstance._updateActionBtnState();
                        if (otPrevEntry) {
                            ot.chatUIInstance.updateEntryMinHeight(otPrevEntry);
                            ot.chatUIInstance.adjustEntryMargin(otPrevEntry, 'immediate');
                        }
                    }
                });
            }
        }
        let next = entry.nextElementSibling;
        while (next) {
            const toRemove = next;
            next = next.nextElementSibling;
            toRemove.remove();
        }
        const prevEntry = entry.previousElementSibling;
        this.currentEntryDiv = prevEntry;
        if (prevEntry) {
            this.currentAnswerDiv = prevEntry.querySelector('.nexus-chat-answer') ||
                prevEntry.querySelector('.nexus-answer-versions');
        } else {
            this.currentAnswerDiv = null;
        }
        entry.remove();
        this._updateActionBtnState();
        if (prevEntry) {
            this.updateEntryMinHeight(prevEntry);
            this.adjustEntryMargin(prevEntry, 'immediate');
            const scrollContainer = this.getScrollContainer();
            if (scrollContainer) {
                const containerRect = scrollContainer.getBoundingClientRect();
                const elementRect = prevEntry.getBoundingClientRect();
                const targetScrollTop = scrollContainer.scrollTop + (elementRect.top - containerRect.top);
                scrollContainer.scrollTop = Math.max(0, targetScrollTop);
                const activeTab = window.tabs ? window.tabs.find(t => t.historyEl === scrollContainer) : null;
                if (activeTab) {
                    activeTab.scrollTop = targetScrollTop;
                    activeTab.isAtBottom = false;
                    activeTab.userScrolledUp = true;
                }
            }
        }
        if (this.historyEl) {
            this.historyEl.dispatchEvent(new CustomEvent('nexus:history-changed', {
                bubbles: true,
                detail: { force: true }
            }));
        }
    }
    exitQuestionEditMode(questionDiv, save = false) {
        if (!questionDiv || !questionDiv.classList.contains('nexus-question-editing')) return;
        if (questionDiv.__outsideClickListener) {
            document.removeEventListener('mousedown', questionDiv.__outsideClickListener);
            delete questionDiv.__outsideClickListener;
        }
        const contentDiv = questionDiv.__questionEditContentDiv || questionDiv.querySelector('.nexus-question-content') || questionDiv.querySelector('div[contenteditable="true"]') || questionDiv;
        const toolbar = questionDiv.__questionEditToolbar || questionDiv.querySelector('.nexus-question-edit-toolbar');
        const row = questionDiv.closest('.nexus-question-row');
        const originalHTML = questionDiv.__originalHTML;
        const originalRaw = questionDiv.__originalRaw || '';
        if (questionDiv.__questionEditClickListener) {
            questionDiv.removeEventListener('click', questionDiv.__questionEditClickListener);
        }
        if (contentDiv && questionDiv.__questionEditKeyHandler) {
            contentDiv.removeEventListener('keydown', questionDiv.__questionEditKeyHandler);
        }
        if (contentDiv && questionDiv.__questionEditInputHandler) {
            contentDiv.removeEventListener('input', questionDiv.__questionEditInputHandler);
            contentDiv.removeEventListener('keyup', questionDiv.__questionEditInputHandler);
        }
        if (save) {
            const newText = (contentDiv?.innerText || contentDiv?.textContent || '').trim();
            questionDiv.setAttribute('data-raw-text', newText);
            if (contentDiv) {
                contentDiv.innerText = newText;
                if (typeof questionDiv.__questionEditOriginalClassName === 'string') {
                    contentDiv.className = questionDiv.__questionEditOriginalClassName;
                }
                contentDiv.scrollTop = 0;
                contentDiv.scrollLeft = 0;
            }
            if (questionDiv) {
                questionDiv.scrollTop = 0;
                questionDiv.scrollLeft = 0;
            }
            questionDiv.classList.remove('is-editing', 'nexus-question-editing');
            if (row) row.classList.remove('nexus-question-row-editing');
            if (toolbar) toolbar.remove();
            if (contentDiv) contentDiv.contentEditable = 'false';
            const isRegenerate = (newText === originalRaw);
            this._handleQuestionRecheck(newText, contentDiv || questionDiv, isRegenerate);
            NexusChatUI.injectQuestionActions(questionDiv);
            NexusChatUI.checkQuestionOverflow(questionDiv);
        } else {
            if (contentDiv && typeof originalHTML === 'string') {
                contentDiv.innerHTML = originalHTML;
            }
            if (contentDiv && typeof questionDiv.__questionEditOriginalClassName === 'string') {
                contentDiv.className = questionDiv.__questionEditOriginalClassName;
            }
            if (contentDiv) {
                contentDiv.scrollTop = 0;
                contentDiv.scrollLeft = 0;
            }
            if (questionDiv) {
                questionDiv.scrollTop = 0;
                questionDiv.scrollLeft = 0;
            }
            questionDiv.setAttribute('data-raw-text', originalRaw);
            questionDiv.classList.remove('is-editing', 'nexus-question-editing');
            if (row) row.classList.remove('nexus-question-row-editing');
            if (contentDiv) contentDiv.contentEditable = 'false';
            if (toolbar) toolbar.remove();
            NexusChatUI.injectQuestionActions(questionDiv);
            NexusChatUI.checkQuestionOverflow(questionDiv);
        }
        delete questionDiv.__originalHTML;
        delete questionDiv.__originalRaw;
        delete questionDiv.__questionEditOriginalClassName;
        delete questionDiv.__questionEditToolbar;
        delete questionDiv.__questionEditContentDiv;
        delete questionDiv.__questionEditKeyHandler;
        delete questionDiv.__questionEditInputHandler;
        delete questionDiv.__questionEditClickListener;
    }
    cancelAllQuestionEdits() {
        if (!this.historyEl) return;
        const editingQuestions = Array.from(this.historyEl.querySelectorAll('.nexus-chat-question.nexus-question-editing'));
        editingQuestions.forEach((questionDiv) => {
            this.exitQuestionEditMode(questionDiv, false);
        });
    }
    enterAnswerEditMode(answerDiv) {
        if (!answerDiv || answerDiv.classList.contains('nexus-answer-editing')) return;
        this._hideContextMenu();
        answerDiv.contentEditable = 'false';
        let contentDiv = answerDiv.querySelector('.nexus-answer-content');
        if (!contentDiv) {
            const originalHTML = answerDiv.innerHTML;
            answerDiv.innerHTML = '';
            contentDiv = document.createElement('div');
            contentDiv.className = 'nexus-answer-content';
            contentDiv.innerHTML = originalHTML;
            answerDiv.appendChild(contentDiv);
        }
        const originalRaw = answerDiv.getAttribute('data-raw-text') || contentDiv.innerText;
        answerDiv.__originalHTML = contentDiv.innerHTML;
        answerDiv.__originalRaw = originalRaw;
        contentDiv.innerHTML = answerDiv.__originalHTML;
        answerDiv.classList.add('is-editing', 'nexus-answer-editing');
        contentDiv.contentEditable = 'plaintext-only';
        this._focusEditableAtEnd(contentDiv);
        const toolbar = document.createElement('div');
        toolbar.className = 'nexus-edit-toolbar nexus-answer-edit-toolbar';
        toolbar.contentEditable = 'false';
        toolbar.innerHTML = `
            <button class="nexus-edit-btn nexus-edit-undo" title="Undo">Undo</button>
            <div class="nexus-edit-toolbar-spacer"></div>
            <button class="nexus-edit-btn nexus-edit-cancel" title="Cancel">Cancel</button>
            <button class="nexus-edit-btn nexus-edit-save" title="Save">Save</button>
        `;
        toolbar.onmousedown = (e) => e.preventDefault();
        toolbar.querySelector('.nexus-edit-undo').onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const entry = answerDiv.closest('.nexus-entry');
            this._undoEditAndTruncate(entry, 'answer', null, answerDiv);
        };
        toolbar.querySelector('.nexus-edit-cancel').onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.exitAnswerEditMode(answerDiv, false);
        };
        toolbar.querySelector('.nexus-edit-save').onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.exitAnswerEditMode(answerDiv, true);
        };
        answerDiv.appendChild(toolbar);
        const entry = answerDiv.closest('.nexus-entry');
        if (entry) {
            requestAnimationFrame(() => {
                const scrollContainer = this.getScrollContainer();
                if (!scrollContainer) return;
                const paddingTop = parseFloat(window.getComputedStyle(scrollContainer).paddingTop) || 0;
                this._scrollElementToTop(entry, paddingTop);
            });
        }
        const keyHandler = (e) => {
            if (e.key === 'Escape') {
                this.exitAnswerEditMode(answerDiv, false);
                contentDiv.removeEventListener('keydown', keyHandler);
            } else if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.exitAnswerEditMode(answerDiv, true);
                contentDiv.removeEventListener('keydown', keyHandler);
            }
        };
        contentDiv.addEventListener('keydown', keyHandler);
        setTimeout(() => {
            if (!answerDiv.classList.contains('nexus-answer-editing')) return;
            const outsideClickListener = (e) => {
                if (!answerDiv.contains(e.target)) {
                    this.exitAnswerEditMode(answerDiv, false);
                }
            };
            document.addEventListener('mousedown', outsideClickListener);
            answerDiv.__outsideClickListener = outsideClickListener;
        }, 10);
    }
    exitAnswerEditMode(answerDiv, save = false) {
        if (!answerDiv || !answerDiv.classList.contains('nexus-answer-editing')) return;
        if (answerDiv.__outsideClickListener) {
            document.removeEventListener('mousedown', answerDiv.__outsideClickListener);
            delete answerDiv.__outsideClickListener;
        }
        const contentDiv = answerDiv.querySelector('.nexus-answer-content') || answerDiv;
        const toolbar = answerDiv.querySelector('.nexus-answer-edit-toolbar');
        if (save) {
            const newText = contentDiv.innerText.trim();
            answerDiv.setAttribute('data-raw-text', newText);
            answerDiv.__lastRenderedText = '';
            this._doRender(answerDiv, true);
            console.log('[Nexus] Answer saved:', newText);
            const entry = answerDiv.closest('.nexus-entry');
            if (entry) {
                entry.dataset.timestamp = Date.now().toString();
            }
            if (this.historyEl) {
                this.historyEl.dispatchEvent(new CustomEvent('nexus:history-changed', {
                    bubbles: true,
                    detail: { force: true }
                }));
            }
        } else {
            contentDiv.innerHTML = answerDiv.__originalHTML;
            answerDiv.setAttribute('data-raw-text', answerDiv.__originalRaw);
        }
        answerDiv.classList.remove('is-editing', 'nexus-answer-editing');
        contentDiv.contentEditable = 'false';
        if (toolbar) toolbar.remove();
        delete answerDiv.__originalHTML;
        delete answerDiv.__originalRaw;
    }
    cancelAllAnswerEdits() {
        if (!this.historyEl) return;
        const editingAnswers = Array.from(this.historyEl.querySelectorAll('.nexus-chat-answer.nexus-answer-editing'));
        editingAnswers.forEach((answerDiv) => {
            this.exitAnswerEditMode(answerDiv, false);
        });
    }
    serializeHistoryHTML() {
        if (!this.historyEl) return '';
        const clonedHistory = this.historyEl.cloneNode(true);
        const liveAnswers = Array.from(this.historyEl.querySelectorAll('.nexus-chat-answer'));
        const clonedAnswers = Array.from(clonedHistory.querySelectorAll('.nexus-chat-answer'));
        const liveQuestions = Array.from(this.historyEl.querySelectorAll('.nexus-chat-question'));
        const clonedQuestions = Array.from(clonedHistory.querySelectorAll('.nexus-chat-question'));
        const editingAnswers = Array.from(this.historyEl.querySelectorAll('.nexus-chat-answer.nexus-answer-editing'));
        editingAnswers.forEach((liveAnswer) => {
            const answerIndex = liveAnswers.indexOf(liveAnswer);
            const clonedAnswer = answerIndex >= 0 ? clonedAnswers[answerIndex] : null;
            if (!clonedAnswer) return;
            const clonedContent = clonedAnswer.querySelector('.nexus-answer-content') || clonedAnswer;
            if (typeof liveAnswer.__originalHTML === 'string') {
                clonedContent.innerHTML = liveAnswer.__originalHTML;
            }
            clonedAnswer.classList.remove('nexus-answer-editing');
            clonedAnswer.contentEditable = 'false';
            clonedContent.contentEditable = 'false';
            const clonedToolbar = clonedAnswer.querySelector('.nexus-answer-edit-toolbar');
            if (clonedToolbar) clonedToolbar.remove();
        });
        const editingQuestions = Array.from(this.historyEl.querySelectorAll('.nexus-chat-question.nexus-question-editing'));
        editingQuestions.forEach((liveQuestion) => {
            const questionIndex = liveQuestions.indexOf(liveQuestion);
            const clonedQuestion = questionIndex >= 0 ? clonedQuestions[questionIndex] : null;
            if (!clonedQuestion) return;
            const clonedRow = clonedQuestion.closest('.nexus-question-row');
            const clonedContent = clonedQuestion.querySelector('.nexus-question-content')
                || clonedQuestion.querySelector('div[contenteditable="true"]')
                || clonedQuestion;
            if (typeof liveQuestion.__originalHTML === 'string') {
                clonedContent.innerHTML = liveQuestion.__originalHTML;
            } else if (typeof liveQuestion.getAttribute('data-raw-text') === 'string') {
                clonedContent.textContent = liveQuestion.getAttribute('data-raw-text');
            }
            clonedQuestion.classList.remove('nexus-question-editing', 'nexus-answer-editing');
            if (clonedRow) clonedRow.classList.remove('nexus-question-row-editing');
            clonedContent.contentEditable = 'false';
            const clonedToolbar = clonedQuestion.querySelector('.nexus-question-edit-toolbar');
            if (clonedToolbar) clonedToolbar.remove();
        });
        clonedHistory.querySelectorAll('.nexus-entry').forEach(entry => {
            entry.style.removeProperty('min-height');
        });
        clonedHistory.querySelectorAll('.nexus-actions').forEach(el => el.remove());
        clonedHistory.querySelectorAll('.nexus-code-copy-btn').forEach(el => el.remove());
        clonedHistory.querySelectorAll('img').forEach(img => {
            if (img.dataset.attachmentId) {
                img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
            }
        });
        clonedHistory.querySelectorAll('[data-images]').forEach(el => {
            try {
                const parsed = JSON.parse(el.dataset.images);
                if (parsed && Array.isArray(parsed.files)) {
                    parsed.files.forEach(file => {
                        if (file.attachmentId || file.fileUri) {
                            file.dataUrl = null;
                            if (file.previewUrl && file.previewUrl.startsWith('data:')) file.previewUrl = null;
                            if (file.data) file.data = null;
                        }
                    });
                    el.dataset.images = JSON.stringify(parsed);
                }
            } catch (e) {
                console.error('Failed to strip data-images in serialization', e);
            }
        });
        return clonedHistory.innerHTML;
    }
    static async processContainer(container) {
        if (!container || container.__nexusProcessed) return;
        container.__nexusProcessed = true;
        const yieldToMain = () => new Promise(resolve => {
            if (typeof window !== 'undefined' && window.requestIdleCallback) {
                window.requestIdleCallback(() => resolve(), { timeout: 30 });
            } else {
                setTimeout(resolve, 1);
            }
        });
        if (typeof window.ensureHighlightLoaded === 'function') {
            await window.ensureHighlightLoaded();
        }
        if (typeof hljs !== 'undefined') {
            const blocks = Array.from(container.querySelectorAll('pre code'));
            for (const block of blocks) {
                await yieldToMain();
                try {
                    if (!block.__hljs_done) {
                        // Prevent highlighting ASCII art/diagrams falsely labeled as CSS (lacking curly braces)
                        let langClass = Array.from(block.classList).find(c => c.startsWith('language-'));
                        if (langClass) {
                            const lang = langClass.replace('language-', '').toLowerCase();
                            const text = block.textContent;
                            if (['css', 'less', 'scss'].includes(lang) && !text.includes('{') && !text.includes('}')) {
                                block.classList.remove(langClass);
                                block.classList.add('language-plaintext');
                                block.classList.remove('hljs');
                            }
                        }
                        if (hljs.highlightElement) hljs.highlightElement(block);
                        else if (hljs.highlightBlock) hljs.highlightBlock(block);
                        block.__hljs_done = true;
                    }
                } catch (e) { }
            }
        }
        const hasPlaceholders = container.querySelector('.nexus-math-inline-placeholder, .nexus-math-block-placeholder');
        const htmlContent = container.innerHTML;
        if (hasPlaceholders || htmlContent.includes('\\(') || htmlContent.includes('\\[') || htmlContent.includes('\\begin')) {
            try {
                await window.ensureKatexLoaded();
                if (typeof katex !== 'undefined') {
                    await yieldToMain();
                    container.querySelectorAll('.nexus-math-inline-placeholder').forEach(el => {
                        const math = decodeURIComponent(el.getAttribute('data-math') || '').replace(/\\frac\{/g, '\\dfrac{');
                        try {
                            const html = katex.renderToString(math, { displayMode: false, throwOnError: false, strict: 'ignore' });
                            el.outerHTML = html;
                        } catch (err) {
                            el.replaceWith(document.createTextNode(el.textContent));
                        }
                    });
                    container.querySelectorAll('.nexus-math-block-placeholder').forEach(el => {
                        const math = decodeURIComponent(el.getAttribute('data-math') || '');
                        try {
                            const html = katex.renderToString(math, { displayMode: true, throwOnError: false, strict: 'ignore' });
                            el.outerHTML = html;
                        } catch (err) {
                            el.replaceWith(document.createTextNode(el.textContent));
                        }
                    });
                    if (typeof renderMathInElement !== 'undefined') {
                        renderMathInElement(container, {
                            delimiters: [
                                { left: '$$', right: '$$', display: true },
                                { left: '\\[', right: '\\]', display: true },
                                { left: '\\(', right: '\\)', display: false }
                            ],
                            throwOnError: false,
                            strict: 'ignore'
                        });
                    }
                }
            } catch (e) { }
        }
        await yieldToMain();
        container.querySelectorAll('a').forEach(link => {
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
        });
        await NexusChatUI.injectCopyButtons(container);
        await yieldToMain();
        container.querySelectorAll('.nexus-thinking-container').forEach(c => {
            const header = c.querySelector('.nexus-thinking-header');
            if (header && !header.__thinkingToggleBound) {
                header.__thinkingToggleBound = true;
                header.addEventListener('click', () => c.classList.toggle('collapsed'));
            }
        });
        await yieldToMain();
        container.querySelectorAll('.nexus-translation-card').forEach(card => {
            const entry = card.closest('.nexus-entry');
            if (entry && !entry.__translationHighlightDone) {
                NexusChatUI._setupTranslationHighlight(entry);
                NexusChatUI.balanceTranslationCard(entry, false);
                entry.__translationHighlightDone = true;
            }
        });
        await yieldToMain();
        let answerEls = Array.from(container.querySelectorAll('.nexus-chat-answer'));
        if (container.classList.contains('nexus-chat-answer')) {
            answerEls.push(container);
        }
        for (const ans of answerEls) {
            NexusChatUI.injectAnswerActions(ans);
        }
        await yieldToMain();
        processNexusDynamicImageElements(container);
        processNexusDynamicYoutubeElements(container);
        processNexusChartElements(container);
    }
    static async injectCopyButtons(container) {
        if (!container) return;
        NexusChatUI.wrapTables(container);
        const yieldToMain = () => new Promise(resolve => setTimeout(resolve, 10));
        const COPY_SVG = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
        const CHECK_SVG = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
        const preBlocks = Array.from(container.querySelectorAll('pre'));
        for (const pre of preBlocks) {
            if (pre.classList.contains('nexus-d2-source') || pre.style.display === 'none') {
                continue;
            }
            await yieldToMain();
            let wrapper = pre.parentElement && pre.parentElement.classList.contains('nexus-code-block-wrap')
                ? pre.parentElement
                : null;
            if (!wrapper) {
                wrapper = document.createElement('div');
                wrapper.className = 'nexus-code-block-wrap';
                pre.parentNode.insertBefore(wrapper, pre);
                wrapper.appendChild(pre);
            }
            pre.querySelectorAll('.nexus-code-copy-btn').forEach(old => old.remove());
            wrapper.querySelectorAll('.nexus-code-copy-btn').forEach(old => old.remove());
            wrapper.querySelectorAll('.nexus-code-header').forEach(old => old.remove());
            let lang = 'Code';
            const codeEl = pre.querySelector('code');
            if (codeEl) {
                const classes = Array.from(codeEl.classList);
                const langClass = classes.find(c => c.startsWith('language-') || c.startsWith('lang-'));
                if (langClass) {
                    const rawLang = langClass.replace(/^(language-|lang-)/, '');
                    if (rawLang === 'js' || rawLang === 'javascript') lang = 'JavaScript';
                    else if (rawLang === 'ts' || rawLang === 'typescript') lang = 'TypeScript';
                    else if (rawLang === 'html') lang = 'HTML';
                    else if (rawLang === 'css') lang = 'CSS';
                    else if (rawLang === 'py' || rawLang === 'python') lang = 'Python';
                    else if (rawLang === 'json') lang = 'JSON';
                    else if (rawLang === 'go' || rawLang === 'golang') lang = 'Go';
                    else if (rawLang === 'rs' || rawLang === 'rust') lang = 'Rust';
                    else if (rawLang === 'sh' || rawLang === 'bash' || rawLang === 'shell') lang = 'Bash';
                    else if (rawLang === 'cpp' || rawLang === 'c++') lang = 'C++';
                    else if (rawLang === 'cs' || rawLang === 'csharp') lang = 'C#';
                    else if (rawLang) lang = rawLang.charAt(0).toUpperCase() + rawLang.slice(1);
                }
            }
            const header = document.createElement('div');
            header.className = 'nexus-code-header';
            const langLabel = document.createElement('span');
            langLabel.className = 'nexus-code-lang';
            langLabel.textContent = lang;
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'nexus-code-actions';
            const downloadBtn = document.createElement('button');
            downloadBtn.className = 'nexus-code-download-btn';
            downloadBtn.title = 'Download Code';
            downloadBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`;
            downloadBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const codeText = (codeEl ? codeEl.innerText : pre.innerText).trim();
                const blob = new Blob([codeText], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                let ext = 'txt';
                const cleanLang = lang.toLowerCase();
                if (cleanLang === 'javascript') ext = 'js';
                else if (cleanLang === 'typescript') ext = 'ts';
                else if (cleanLang === 'python') ext = 'py';
                else if (cleanLang === 'html') ext = 'html';
                else if (cleanLang === 'css') ext = 'css';
                else if (cleanLang === 'json') ext = 'json';
                else if (cleanLang === 'go') ext = 'go';
                else if (cleanLang === 'rust') ext = 'rs';
                else if (cleanLang === 'bash') ext = 'sh';
                else if (cleanLang === 'c++') ext = 'cpp';
                else if (cleanLang === 'c#') ext = 'cs';
                a.download = `code_${Date.now()}.${ext}`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            });
            const btn = document.createElement('button');
            btn.className = 'nexus-code-copy-btn';
            btn.title = 'Copy Code';
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
            actionsDiv.appendChild(downloadBtn);
            actionsDiv.appendChild(btn);
            header.appendChild(langLabel);
            header.appendChild(actionsDiv);
            wrapper.insertBefore(header, pre);
        }
    }
    static injectAnswerActions(answerDiv) {
        if (!answerDiv || answerDiv.querySelector('.nexus-actions')) return;
        const entry = answerDiv.closest('.nexus-entry');
        if (entry) {
            const type = entry.dataset.entryType;
            if (type && type !== 'qa' && type !== 'chat') {
                return;
            }
        }
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'nexus-actions';
        actionsDiv.innerHTML = `
            <button class="nexus-answer-action-btn" data-action="regenerate" title="Regenerate">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
            </button>
            <button class="nexus-answer-action-btn" data-action="copy" title="Copy">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            </button>
            <button class="nexus-answer-action-btn" data-action="edit" title="Edit">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
            </button>
        `;
        answerDiv.appendChild(actionsDiv);
    }
    static wrapTables(container) {
        if (!container) return;
        container.querySelectorAll('table').forEach(table => {
            if (table.parentElement && table.parentElement.classList.contains('nexus-table-wrap')) {
                return;
            }
            const wrapper = document.createElement('div');
            wrapper.className = 'nexus-table-wrap';
            table.parentNode.insertBefore(wrapper, table);
            wrapper.appendChild(table);
        });
    }
    _decodeDataUrlText(dataUrl) {
        if (!dataUrl) return '';
        try {
            const parts = dataUrl.split(',');
            if (parts.length < 2) return '';
            const base64 = parts[1];
            const binaryString = atob(base64);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            return new TextDecoder('utf-8').decode(bytes);
        } catch (e) {
            console.error('Failed to decode dataUrl', e);
            return '';
        }
    }
    showFilePreview(fileOrUrl, name = '') {
        let fileObj = {};
        if (typeof fileOrUrl === 'string') {
            const isImg = fileOrUrl.startsWith('data:image/') || /\.(png|jpg|jpeg|webp|gif|svg)/i.test(fileOrUrl);
            fileObj = {
                isImage: isImg,
                isPDF: fileOrUrl.toLowerCase().endsWith('.pdf') || fileOrUrl.startsWith('data:application/pdf'),
                dataUrl: fileOrUrl,
                previewUrl: fileOrUrl,
                name: name
            };
        } else {
            fileObj = fileOrUrl;
            if (fileObj) {
                const lowerName = (fileObj.name || '').toLowerCase();
                if (!fileObj.isPDF && (lowerName.endsWith('.pdf') || fileObj.mimeType === 'application/pdf')) {
                    fileObj.isPDF = true;
                }
                if (!fileObj.isImage && (lowerName.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i) || fileObj.mimeType?.startsWith('image/'))) {
                    fileObj.isImage = true;
                }
                if (!fileObj.isVideo && (lowerName.match(/\.(mp4|webm|ogg|mov)$/i) || fileObj.mimeType?.startsWith('video/'))) {
                    fileObj.isVideo = true;
                }
                if (!fileObj.isAudio && (lowerName.match(/\.(mp3|wav|ogg|aac|m4a)$/i) || fileObj.mimeType?.startsWith('audio/'))) {
                    fileObj.isAudio = true;
                }
            }
        }


        const existing = document.querySelector('.nexus-preview-container.fixed-preview');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.className = 'nexus-preview-container fixed-preview';

        const controls = document.createElement('div');
        controls.className = 'nexus-preview-controls-bar';

        const content = document.createElement('div');
        content.className = 'nexus-preview-content';

        let windowBody = content;
        let header = null;

        if (fileObj.isImage) {
            controls.innerHTML = `
                <button class="nexus-preview-btn zoom-out-btn" title="Zoom Out">
                    <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>
                </button>
                <span class="nexus-preview-scale">100%</span>
                <button class="nexus-preview-btn zoom-in-btn" title="Zoom In">
                    <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>
                </button>
                <button class="nexus-preview-btn close-btn" title="Close (Esc)">
                    <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            `;
            overlay.appendChild(controls);
            overlay.appendChild(content);
        } else {
            const previewWindow = document.createElement('div');

            let typeClass = 'is-fallback';
            if (fileObj.isPDF || this._isDocxFile(fileObj) || this._isXlsxFile(fileObj) || (fileObj.name && (fileObj.mimeType?.startsWith('text/') || /\.(json|js|jsx|ts|tsx|py|html|css|md|txt|csv|xml|sh|ini|bat|yml|yaml)/i.test(fileObj.name)))) {
                typeClass = 'is-document';
            } else if (fileObj.isVideo) {
                typeClass = 'is-video';
            } else if (fileObj.isAudio) {
                typeClass = 'is-audio';
            }
            previewWindow.className = `nexus-preview-window ${typeClass}`;

            const closeBtn = document.createElement('button');
            closeBtn.className = 'nexus-preview-window-close';
            closeBtn.title = 'Close (Esc)';
            closeBtn.innerHTML = `
                <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2.2" fill="none"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            `;

            windowBody = document.createElement('div');
            windowBody.className = 'nexus-preview-window-body';

            previewWindow.appendChild(closeBtn);
            previewWindow.appendChild(windowBody);
            content.appendChild(previewWindow);
            overlay.appendChild(content);
        }

        const close = () => {
            overlay.classList.remove('active');
            setTimeout(() => {
                const video = content.querySelector('video');
                if (video) video.src = '';
                const audio = content.querySelector('audio');
                if (audio) audio.src = '';
                overlay.remove();
            }, 250);
            document.removeEventListener('keydown', escHandler);
        };
        const escHandler = (e) => {
            if (e.key === 'Escape') close();
        };
        document.addEventListener('keydown', escHandler);

        if (fileObj.isImage) {
            const img = document.createElement('img');
            img.alt = fileObj.name || 'Image Preview';
            img.className = 'nexus-preview-img';

            let baseWidth = 0;
            let baseHeight = 0;

            const initSize = () => {
                if (baseWidth && baseHeight) return;
                baseWidth = img.offsetWidth || img.naturalWidth;
                baseHeight = img.offsetHeight || img.naturalHeight;
                if (baseWidth && baseHeight) {
                    img.style.maxWidth = 'none';
                    img.style.maxHeight = 'none';
                    updateTransform();
                }
            };

            img.onload = initSize;
            img.src = fileObj.previewUrl || fileObj.dataUrl;
            content.appendChild(img);

            if (img.complete) {
                setTimeout(initSize, 0);
            }

            let captionText = fileObj.name;
            if (captionText && captionText !== 'diagram' && captionText !== 'Image Preview') {
                const caption = document.createElement('div');
                caption.className = 'nexus-preview-caption';
                caption.addEventListener('click', (e) => e.stopPropagation());
                let sourceDomain = '';
                try {
                    const src = fileObj.previewUrl || fileObj.dataUrl;
                    if (src && !src.startsWith('data:')) {
                        const urlObj = new URL(src);
                        sourceDomain = urlObj.hostname;
                    }
                } catch (e) { }
                if (sourceDomain) {
                    if (!captionText.endsWith('.')) captionText += '.';
                    captionText += ` Source: ${sourceDomain}`;
                }
                caption.textContent = captionText;
                overlay.appendChild(caption);
            }

            let scale = 1;
            let isDragging = false;
            let startX = 0, startY = 0;
            let translateX = 0, translateY = 0;
            const srcKey = fileObj.previewUrl || fileObj.dataUrl;
            if (window._nexusPreviewStates && window._nexusPreviewStates[srcKey]) {
                scale = window._nexusPreviewStates[srcKey].scale || 1;
                translateX = window._nexusPreviewStates[srcKey].translateX || 0;
                translateY = window._nexusPreviewStates[srcKey].translateY || 0;
            }
            const updateTransform = () => {
                if (baseWidth && baseHeight) {
                    img.style.width = `${baseWidth * scale}px`;
                    img.style.height = `${baseHeight * scale}px`;
                }
                img.style.transform = `translate(${translateX}px, ${translateY}px)`;
                const scalePct = overlay.querySelector('.nexus-preview-scale');
                if (scalePct) scalePct.textContent = `${Math.round(scale * 100)}%`;
                img.classList.toggle('zoomed', scale !== 1);
                if (!window._nexusPreviewStates) window._nexusPreviewStates = {};
                window._nexusPreviewStates[srcKey] = { scale, translateX, translateY };
            };
            updateTransform();
            const zoom = (factor, centerX, centerY) => {
                const newScale = Math.min(Math.max(scale * factor, 0.15), 8);
                if (newScale === scale) return;
                if (centerX !== undefined && centerY !== undefined) {
                    const rect = img.getBoundingClientRect();
                    const mouseX = centerX - rect.left - rect.width / 2;
                    const mouseY = centerY - rect.top - rect.height / 2;
                    translateX -= mouseX * (newScale / scale - 1);
                    translateY -= mouseY * (newScale / scale - 1);
                }
                scale = newScale;
                updateTransform();
            };
            const reset = () => {
                img.style.transition = 'transform 0.2s cubic-bezier(0.25, 0.8, 0.25, 1), width 0.2s cubic-bezier(0.25, 0.8, 0.25, 1), height 0.2s cubic-bezier(0.25, 0.8, 0.25, 1)';
                scale = 1; translateX = 0; translateY = 0;
                updateTransform();
                setTimeout(() => { img.style.transition = ''; }, 200);
            };
            overlay.querySelector('.zoom-in-btn').onclick = (e) => { e.stopPropagation(); zoom(1.25); };
            overlay.querySelector('.zoom-out-btn').onclick = (e) => { e.stopPropagation(); zoom(0.8); };
            content.addEventListener('wheel', (e) => {
                e.preventDefault();
                const sensitivity = e.ctrlKey ? 0.012 : 0.005;
                const delta = Math.max(-100, Math.min(100, e.deltaY));
                zoom(Math.exp(-delta * sensitivity), e.clientX, e.clientY);
            }, { passive: false });
            img.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                if (scale > 1.1) {
                    reset();
                } else {
                    scale = 1.25;
                    const rect = img.getBoundingClientRect();
                    translateX = -(e.clientX - rect.left - rect.width / 2) * 0.25;
                    translateY = -(e.clientY - rect.top - rect.height / 2) * 0.25;
                    updateTransform();
                }
            });
            img.addEventListener('mousedown', (e) => {
                if (e.button !== 0) return;
                e.stopPropagation();
                isDragging = true;
                img.classList.add('dragging');
                startX = e.clientX - translateX;
                startY = e.clientY - translateY;
                e.preventDefault();
            });
            document.addEventListener('mousemove', (e) => {
                if (!isDragging) return;
                translateX = e.clientX - startX;
                translateY = e.clientY - startY;
                updateTransform();
            });
            document.addEventListener('mouseup', () => {
                isDragging = false;
                img.classList.remove('dragging');
            });
        }
        else if (fileObj.isPDF) {
            const pdfContainer = document.createElement('div');
            pdfContainer.className = 'nexus-preview-pdf-container';
            windowBody.appendChild(pdfContainer);

            const renderPdf = async () => {
                try {
                    if (typeof pdfjsLib === 'undefined') {
                        throw new Error('PDF library (pdfjsLib) not loaded');
                    }
                    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
                        pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/vendor/pdf.worker.min.js');
                    }
                    const response = await fetch(fileObj.dataUrl);
                    const arrayBuffer = await response.arrayBuffer();
                    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

                    const counter = document.createElement('div');
                    counter.className = 'nexus-preview-pdf-counter-wrapper';
                    counter.innerHTML = `
                        <span class="pdf-page-indicator">1 / ${pdf.numPages}</span>
                        <span class="pdf-counter-divider">|</span>
                        <button class="pdf-zoom-btn zoom-out" title="Zoom Out">-</button>
                        <span class="pdf-zoom-percent">100%</span>
                        <button class="pdf-zoom-btn zoom-in" title="Zoom In">+</button>
                    `;
                    windowBody.appendChild(counter);

                    const zoomOutBtn = counter.querySelector('.zoom-out');
                    const zoomInBtn = counter.querySelector('.zoom-in');
                    const zoomPercentText = counter.querySelector('.pdf-zoom-percent');
                    let zoomPercent = 100;

                    const updateZoom = () => {
                        const pages = pdfContainer.querySelectorAll('.nexus-preview-pdf-page');
                        pages.forEach(page => {
                            page.style.width = `${zoomPercent}%`;
                            page.style.maxWidth = 'none';
                        });
                        zoomPercentText.textContent = `${zoomPercent}%`;
                    };

                    zoomOutBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (zoomPercent > 50) {
                            zoomPercent -= 25;
                            updateZoom();
                        }
                    });

                    zoomInBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (zoomPercent < 200) {
                            zoomPercent += 25;
                            updateZoom();
                        }
                    });

                    pdfContainer.addEventListener('dblclick', (e) => {
                        if (e.target.classList.contains('nexus-preview-pdf-page')) {
                            zoomPercent = zoomPercent === 100 ? 150 : 100;
                            updateZoom();
                        }
                    });

                    pdfContainer.addEventListener('scroll', () => {
                        const pages = pdfContainer.querySelectorAll('.nexus-preview-pdf-page');
                        let currentPage = 1;
                        let minDiff = Infinity;
                        const containerRect = pdfContainer.getBoundingClientRect();
                        pages.forEach((page, index) => {
                            const rect = page.getBoundingClientRect();
                            const diff = Math.abs(rect.top - containerRect.top);
                            if (diff < minDiff) {
                                minDiff = diff;
                                currentPage = index + 1;
                            }
                        });
                        const indicator = counter.querySelector('.pdf-page-indicator');
                        if (indicator) {
                            indicator.textContent = `${currentPage} / ${pdf.numPages}`;
                        }
                    }, { passive: true });

                    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                        const page = await pdf.getPage(pageNum);
                        const viewport = page.getViewport({ scale: 1.5 });
                        const canvas = document.createElement('canvas');
                        canvas.className = 'nexus-preview-pdf-page';
                        canvas.height = viewport.height;
                        canvas.width = viewport.width;
                        pdfContainer.appendChild(canvas);

                        const ctx = canvas.getContext('2d');
                        await page.render({ canvasContext: ctx, viewport }).promise;
                    }
                } catch (e) {
                    console.error('[Nexus] PDF Preview render error:', e);
                    pdfContainer.innerHTML = `<div style="color:red; padding:20px; text-align:center;">Failed to load PDF preview: ${e.message}</div>`;
                }
            };
            renderPdf();
        }
        else if (fileObj.isVideo) {
            const video = document.createElement('video');
            video.className = 'nexus-preview-video';
            video.src = fileObj.dataUrl;
            video.controls = true;
            video.autoplay = true;
            windowBody.appendChild(video);
        }
        else if (fileObj.isAudio) {
            const audioWrapper = document.createElement('div');
            audioWrapper.className = 'nexus-preview-audio-wrapper';
            audioWrapper.innerHTML = `
                <div class="nexus-preview-audio-art">
                    <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
                </div>
                <div class="nexus-preview-audio-info">
                    <div class="nexus-preview-audio-title">${this.escapeHTMLAttr(fileObj.name || 'Audio Track')}</div>
                    <div class="nexus-preview-audio-artist">Nexus Media Player</div>
                </div>
            `;
            const audio = document.createElement('audio');
            audio.className = 'nexus-preview-audio';
            audio.src = fileObj.dataUrl;
            audio.controls = true;
            audio.autoplay = true;
            audioWrapper.appendChild(audio);
            windowBody.appendChild(audioWrapper);
        } else if (fileObj.name && (fileObj.mimeType?.startsWith('text/') || /\.(json|js|jsx|ts|tsx|py|html|css|md|txt|csv|tsv|xml|sh|ini|bat|yml|yaml)/i.test(fileObj.name))) {
            const lowerName = fileObj.name.toLowerCase();
            const isCSV = lowerName.endsWith('.csv') || fileObj.mimeType === 'text/csv';
            const isTSV = lowerName.endsWith('.tsv') || fileObj.mimeType === 'text/tab-separated-values';

            if (isCSV || isTSV) {
                const textContent = this._decodeDataUrlText(fileObj.dataUrl);

                // Parse CSV/TSV respecting double quotes and nested newlines
                const rows = [];
                let currentRow = [];
                let currentCell = '';
                let inQuotes = false;
                const delimiter = isTSV ? '\t' : ',';

                for (let i = 0; i < textContent.length; i++) {
                    const char = textContent[i];
                    const nextChar = textContent[i + 1];

                    if (inQuotes) {
                        if (char === '"') {
                            if (nextChar === '"') {
                                currentCell += '"';
                                i++;
                            } else {
                                inQuotes = false;
                            }
                        } else {
                            currentCell += char;
                        }
                    } else {
                        if (char === '"') {
                            inQuotes = true;
                        } else if (char === delimiter) {
                            currentRow.push(currentCell);
                            currentCell = '';
                        } else if (char === '\r' || char === '\n') {
                            currentRow.push(currentCell);
                            currentCell = '';
                            if (currentRow.length > 0 || currentRow.some(c => c.trim().length > 0)) {
                                rows.push(currentRow);
                            }
                            currentRow = [];
                            if (char === '\r' && nextChar === '\n') {
                                i++;
                            }
                        } else {
                            currentCell += char;
                        }
                    }
                }
                if (currentCell || currentRow.length > 0) {
                    currentRow.push(currentCell);
                    if (currentRow.some(c => c.trim().length > 0)) {
                        rows.push(currentRow);
                    }
                }

                const tableContainer = document.createElement('div');
                tableContainer.className = 'nexus-preview-sheets-container';

                const tableEl = document.createElement('table');
                tableEl.className = 'nexus-preview-sheets-table';

                rows.forEach((row, rowIndex) => {
                    const tr = document.createElement('tr');
                    row.forEach(cell => {
                        const cellEl = document.createElement(rowIndex === 0 ? 'th' : 'td');
                        cellEl.textContent = cell.trim();
                        tr.appendChild(cellEl);
                    });
                    tableEl.appendChild(tr);
                });

                tableContainer.appendChild(tableEl);
                windowBody.appendChild(tableContainer);
                windowBody.classList.add('is-sheets-layout');
            } else {
                const textContainer = document.createElement('div');
                textContainer.className = 'nexus-preview-text-container';

                const codeEl = document.createElement('code');
                codeEl.style.cssText = 'white-space:pre-wrap; display:block;';
                const preEl = document.createElement('pre');
                preEl.appendChild(codeEl);
                textContainer.appendChild(preEl);
                windowBody.appendChild(textContainer);

                windowBody.classList.add('is-text-layout');

                const textContent = this._decodeDataUrlText(fileObj.dataUrl);
                codeEl.textContent = textContent;

                if (typeof hljs !== 'undefined') {
                    try {
                        const extension = fileObj.name.split('.').pop().toLowerCase();
                        if (extension && hljs.getLanguage(extension)) {
                            codeEl.className = `language-${extension}`;
                        }
                        hljs.highlightElement(codeEl);
                    } catch (e) {
                        console.warn('[Nexus] Syntax highlighting error:', e);
                    }
                }
            }
        }
        else if (this._isDocxFile(fileObj) || this._isXlsxFile(fileObj)) {
            const derived = this.attachedFiles ? this.attachedFiles.filter(f => f.parentAttachmentId === fileObj.attachmentId) : [];

            const docContainer = document.createElement('div');
            docContainer.className = 'nexus-preview-docx-xlsx-container';
            windowBody.appendChild(docContainer);

            windowBody.classList.add('is-text-layout');

            if (derived.length === 0) {
                docContainer.innerHTML = `<div style="padding:20px; text-align:center; opacity:0.8;">No text could be extracted or file is still processing.</div>`;
            } else {
                derived.forEach(d => {
                    const sheetTitle = document.createElement('h4');
                    sheetTitle.className = 'nexus-preview-sheet-title';
                    sheetTitle.textContent = d.name || '';
                    docContainer.appendChild(sheetTitle);

                    const txt = this._decodeDataUrlText(d.dataUrl);
                    const pre = document.createElement('pre');
                    pre.className = 'nexus-preview-pre';
                    const code = document.createElement('code');
                    code.textContent = txt;

                    if (d.name && d.name.endsWith('.csv') && typeof hljs !== 'undefined') {
                        code.className = 'language-csv';
                        try { hljs.highlightElement(code); } catch (e) { }
                    } else if (typeof hljs !== 'undefined') {
                        code.className = 'language-plaintext';
                        try { hljs.highlightElement(code); } catch (e) { }
                    }
                    pre.appendChild(code);
                    docContainer.appendChild(pre);
                });
            }
        }
        else {
            windowBody.className = 'nexus-preview-window-body is-fallback-layout';

            const ext = (fileObj.name || '').split('.').pop().toLowerCase();
            const category = typeof NexusChatUI !== 'undefined' ? NexusChatUI.inferFileCategory(ext, fileObj.mimeType || '') : 'file';
            const iconSymbol = typeof NexusChatUI !== 'undefined' ? NexusChatUI.getFileIconByCategory(category) : '📎';
            const sizeLabel = typeof NexusChatUI !== 'undefined' ? NexusChatUI.getFileTypeLabel(fileObj) : (fileObj.mimeType || 'Unknown Type');

            windowBody.innerHTML = `
                <div class="nexus-preview-fallback-icon file-${category}">
                    ${iconSymbol}
                </div>
                <div class="nexus-preview-fallback-name">${this.escapeHTMLAttr(fileObj.name || 'Unknown File')}</div>
                <div class="nexus-preview-fallback-meta">${this.escapeHTMLAttr(sizeLabel)}</div>
                <div class="nexus-preview-fallback-desc">This file type cannot be previewed visually, but it will be attached and sent to the assistant.</div>
            `;
        }

        const closeBtn = fileObj.isImage ? overlay.querySelector('.close-btn') : overlay.querySelector('.nexus-preview-window-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                close();
            });
        }

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay || e.target === content) {
                close();
            }
        });

        document.body.appendChild(overlay);
        requestAnimationFrame(() => {
            overlay.classList.add('active');
        });
    }
    showImagePreview(src, alt = '') {
        this.showFilePreview({
            isImage: true,
            dataUrl: src,
            previewUrl: src,
            name: alt
        });
    }
}
function extractMainContent(doc = document) {
    const docClone = doc.cloneNode(true);
    const selectorsToRemove = [
        'nav', 'footer', 'header', 'aside', 'script', 'style',
        'iframe', 'noscript', 'form', 'svg', 'canvas',
        '.ads', '#sidebar', '.sidebar', '.menu', '.navigation',
        '.footer', '.header', '.ad-box', '.social-share', '.comments',
        '[id^="nexus-"]', '[class^="nexus-"]'
    ];
    selectorsToRemove.forEach(s => {
        docClone.querySelectorAll(s).forEach(el => el.remove());
    });
    const mainSelectors = ['article', 'main', '[role="main"]', '.post-content', '.article-content', '.entry-content'];
    let contentEl = null;
    for (const s of mainSelectors) {
        const el = docClone.querySelector(s);
        if (el && el.innerText.trim().length > 200) {
            contentEl = el;
            break;
        }
    }
    if (!contentEl) contentEl = docClone.body;
    let text = contentEl.innerText || contentEl.textContent || "";
    text = text
        .replace(/[ \t]+/g, ' ')
        .replace(/\n\s*\n/g, '\n\n')
        .trim();
    return {
        url: window.location.href,
        title: document.title,
        content: text
    };
}
function nexusEstimateTokens(text) {
    if (!text) return 0;
    return Math.ceil(text.length / 3);
}
function nexusTruncateHistoryWindow(messages, maxTokens) {
    if (maxTokens === null || maxTokens < 0) return [...messages];
    const estimateFn = typeof window.nexusEstimateTokens === 'function'
        ? window.nexusEstimateTokens
        : (t => Math.ceil((t || '').length / 3));
    const result = [];
    let currentTokens = 0;
    for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        let pairTokens = estimateFn(msg.text || msg.content || '');
        const pair = [msg];
        if (msg.role === 'model' && i > 0 && messages[i - 1].role === 'user') {
            const userMsg = messages[i - 1];
            pairTokens += estimateFn(userMsg.text || userMsg.content || '');
            pair.unshift(userMsg);
            i--;
        }
        if (currentTokens + pairTokens > maxTokens) {
            break;
        }
        result.unshift(...pair);
        currentTokens += pairTokens;
    }
    return result;
}

if (typeof window !== "undefined") {
    window.NexusChatUI = NexusChatUI;
}
