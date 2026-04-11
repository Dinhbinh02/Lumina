/**
 * Lumina - Chat History Manager
 * Handles saving, loading, and managing chat histories
 */

const ChatHistoryManager = {
    STORAGE_KEY: 'lumina_chat_sessions',
    LEGACY_KEY: 'chat_history',
    TEMP_POPUP_KEY: 'lumina_popup_sessions',
    MAX_HISTORIES: 999,
    RETENTION_DAYS: 180,
    currentSessionId: null,

    // Generate unique session ID
    generateSessionId() {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    },

    // Save current chat to storage (debounced for performance)
    async saveCurrentChat() {
        if (!currentPopup) return;

        // Anti-flicker/performance debounce — prevent rapid storage writes
        const now = Date.now();
        if (this._lastSaveTime && (now - this._lastSaveTime < 500)) {
            if (this._saveTimeout) clearTimeout(this._saveTimeout);
            this._saveTimeout = setTimeout(() => this.saveCurrentChat(), 500);
            return;
        }
        this._lastSaveTime = now;
        if (this._saveTimeout) clearTimeout(this._saveTimeout);

        const history = currentPopup.querySelector('.lumina-chat-history');
        if (!history || history.children.length === 0) return;

        // Extract messages first to check if there are any chat messages
        const messages = this.extractMessages(history);

        if (messages.length === 0) {
            return;
        }

        // Generate session ID if not exists
        if (!this.currentSessionId) {
            this.currentSessionId = this.generateSessionId();
        }

        // Generate metadata
        const title = this.generateChatTitle(history);
        const timestamp = Date.now();

        try {
            // 1. Save HEAVY content to its own unique key
            const sessionKey = `lumina_session_${this.currentSessionId}`;
            await chrome.storage.local.set({ [sessionKey]: messages });

            // 2. Update LIGHTWEIGHT index
            const result = await chrome.storage.local.get([this.STORAGE_KEY]);
            let sessions = result[this.STORAGE_KEY] || {};

            // We store everything EXCEPT messages in the index
            sessions[this.currentSessionId] = {
                id: this.currentSessionId,
                title: title,
                searchIndex: messages.filter(m => m.type === 'question').map(m => m.content).join(' ').substring(0, 1000), // For searchable metadata
                context: (typeof currentContext !== 'undefined' ? currentContext : '') || '',
                isPinned: typeof isPinned !== 'undefined' ? isPinned : false,
                position: (typeof isPinned !== 'undefined' && isPinned) ? {
                    left: currentPopup.style.left,
                    top: currentPopup.style.top
                } : null,
                createdAt: sessions[this.currentSessionId]?.createdAt || timestamp,
                updatedAt: timestamp,
                hasContent: true // Marker for partitioned storage
            };

            // Limit and clean up
            let sortedIds = Object.keys(sessions)
                .sort((a, b) => (sessions[b].updatedAt || 0) - (sessions[a].updatedAt || 0));

            if (sortedIds.length > this.MAX_HISTORIES) {
                const deletedIds = sortedIds.slice(this.MAX_HISTORIES);
                deletedIds.forEach(id => delete sessions[id]);
                // Batch delete old session content keys
                const contentKeys = deletedIds.map(id => `lumina_session_${id}`);
                await chrome.storage.local.remove(contentKeys);
            }

            // Save the small index
            await chrome.storage.local.set({ [this.STORAGE_KEY]: sessions });

        } catch (error) {
            console.error('Failed to save chat history:', error);
        }
    },

    // Create completed stepper HTML for restored chats
    createCompletedStepperHTML(query, sourcesCount) {
        const checkIcon = '<svg class="lumina-step-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>';
        return `
            <div class="lumina-web-search">
                <div class="lumina-search-stepper">
                    <div class="lumina-search-step completed" data-step="searching">
                        <span class="lumina-step-icon">${checkIcon}</span>
                        <span class="lumina-step-label">Searching: <span class="lumina-step-query">"${query || 'web'}"</span></span>
                    </div>
                    <div class="lumina-search-step completed" data-step="analyzing">
                        <span class="lumina-step-icon">${checkIcon}</span>
                        <span class="lumina-step-label">Analyzed ${sourcesCount || 0} sources</span>
                    </div>
                </div>
            </div>
        `;
    },

    // Extract messages from DOM
    extractMessages(historyElement) {
        const messages = [];

        for (const child of historyElement.children) {
            if (!child.classList.contains('lumina-dict-entry')) continue;

            const entryType = child.dataset.entryType;
            const fromCache = child.dataset.fromCache === 'true';
            const timestamp = parseInt(child.dataset.timestamp) || Date.now();

            // 1. Check for specialized data-rich entries (Translation, Image Lookup)
            const translationCard = child.querySelector('.lumina-translation-card');
            const imageCard = child.querySelector('.lumina-image-card');

            if (translationCard) {
                const sourceEl = child.querySelector('.lumina-translation-source');
                const targetEl = child.querySelector('.lumina-translation-target');
                const sourceText = sourceEl?.dataset.copyText || sourceEl?.textContent?.trim() || '';
                const targetText = targetEl?.dataset.copyText || targetEl?.textContent?.trim() || '';

                messages.push({
                    type: 'translation',
                    content: { source: sourceText, target: targetText },
                    timestamp,
                    metadata: { entryType: entryType || 'translation', fromCache }
                });
                continue;
            }

            if (imageCard) {
                const queryEl = child.querySelector('.lumina-image-query');
                const images = Array.from(child.querySelectorAll('.lumina-image-item')).map(img => ({
                    src: img.getAttribute('src') || '',
                    fullUrl: img.dataset.fullUrl || img.getAttribute('src') || '',
                    title: img.title || ''
                }));

                messages.push({
                    type: 'image-lookup',
                    content: { query: queryEl?.textContent?.trim() || '', images },
                    timestamp,
                    metadata: { entryType: entryType || 'image-lookup', fromCache }
                });
                continue;
            }

            // 2. Standard Q&A - USE DATA ATTRIBUTES FOR PERFORMANCE
            const questionEl = child.querySelector('.lumina-chat-question');
            const versionsContainer = child.querySelector('.lumina-answer-versions');
            const answerEl = child.querySelector('.lumina-chat-answer');

            if (questionEl) {
                let serializedImages = Array.isArray(questionEl._luminaImages) ? questionEl._luminaImages :
                    (Array.isArray(child._luminaImages) ? child._luminaImages : null);
                if (!serializedImages && questionEl.dataset.images) {
                    try {
                        const parsedImages = JSON.parse(questionEl.dataset.images);
                        serializedImages = Array.isArray(parsedImages) ? parsedImages : null;
                    } catch (_) {
                        serializedImages = null;
                    }
                }
                messages.push({
                    type: 'question',
                    content: questionEl.dataset.rawText || questionEl.textContent.trim(),
                    files: questionEl.dataset.files ? JSON.parse(questionEl.dataset.files) : null,
                    images: serializedImages,
                    timestamp,
                    metadata: { entryType, fromCache }
                });
            }

            if (versionsContainer) {
                const versions = Array.from(versionsContainer.querySelectorAll('.lumina-answer-version'));
                const activeVersion = versionsContainer.querySelector('.lumina-answer-version.active');
                const activeIndex = activeVersion ? parseInt(activeVersion.dataset.versionIndex) || 0 : 0;

                const versionContents = versions.map(v => {
                    const ans = v.querySelector('.lumina-chat-answer');
                    return ans ? (ans.getAttribute('data-raw-text') || ans.innerHTML) : '';
                });

                const activeAnswerEl = activeVersion ? activeVersion.querySelector('.lumina-chat-answer') : (versions[0] ? versions[0].querySelector('.lumina-chat-answer') : null);
                const webSearchData = activeAnswerEl?.dataset.webSearch ? JSON.parse(activeAnswerEl.dataset.webSearch) : null;

                messages.push({
                    type: 'answer',
                    content: versionContents[activeIndex] || versionContents[0] || '',
                    versions: versionContents,
                    activeVersionIndex: activeIndex,
                    timestamp,
                    metadata: { entryType, fromCache, webSearch: webSearchData }
                });
            } else if (answerEl) {
                const webSearchData = answerEl.dataset.webSearch ? JSON.parse(answerEl.dataset.webSearch) : null;
                messages.push({
                    type: 'answer',
                    content: answerEl.getAttribute('data-raw-text') || answerEl.innerHTML,
                    timestamp,
                    metadata: { entryType, fromCache, webSearch: webSearchData }
                });
            }
        }
        return messages;
    },    // Generate chat title from DOM state (fast lookup)
    generateChatTitle(historyElement) {
        const firstEntry = historyElement.querySelector('.lumina-dict-entry');
        if (!firstEntry) return 'New Chat';

        const translationSource = firstEntry.querySelector('.lumina-translation-source');
        if (translationSource) {
            const text = translationSource.dataset.copyText || translationSource.textContent.trim();
            return text.length > 50 ? text.substring(0, 50) + '...' : text;
        }

        const questionEl = firstEntry.querySelector('.lumina-chat-question');
        if (questionEl) {
            const text = questionEl.dataset.rawText || questionEl.textContent.trim();
            return text.length > 50 ? text.substring(0, 50) + '...' : text;
        }

        const imageQuery = firstEntry.querySelector('.lumina-image-query');
        if (imageQuery) {
            const text = imageQuery.textContent.trim();
            return text.length > 50 ? text.substring(0, 50) + '...' : `Image: ${text}`;
        }

        return 'New Chat';
    },

    // Load chat by session ID
    async loadChat(sessionId) {
        try {
            const result = await chrome.storage.local.get([this.STORAGE_KEY]);
            const sessions = result[this.STORAGE_KEY] || {};
            const chatMeta = sessions[sessionId];

            if (chatMeta) {
                this.currentSessionId = sessionId;

                // Fetch full content from separate key or fallback to index for legacy
                const sessionKey = `lumina_session_${sessionId}`;
                const contentResult = await chrome.storage.local.get([sessionKey]);
                const messages = contentResult[sessionKey] || chatMeta.messages || [];

                const chatData = {
                    ...chatMeta,
                    messages: messages,
                    sessionId: sessionId,
                    timestamp: chatMeta.createdAt || chatMeta.updatedAt
                };

                await this.restoreChat(chatData);
                return true;
            }
            return false;
        } catch (error) {
            console.error('Failed to load chat history:', error);
            return false;
        }
    },

    // Restore chat to DOM
    async restoreChat(chatData) {
        if (!currentPopup) {
            showChatPopup('');
            overridePopupAnimation(currentPopup);
        }

        const history = currentPopup.querySelector('.lumina-chat-history');
        if (!history) return;
        history.innerHTML = '';

        if (chatData.context) currentContext = chatData.context;

        let i = 0;
        while (i < chatData.messages.length) {
            const msg = chatData.messages[i];

            if (msg.type === 'context' && i + 1 < chatData.messages.length) {
                if (chatData.messages[i + 1].type === 'question') {
                    i++;
                    continue;
                }
            }

            if (msg.type === 'question') {
                const entryDiv = document.createElement('div');
                entryDiv.className = 'lumina-dict-entry';
                entryDiv.dataset.entryType = msg.metadata?.entryType || 'qa';

                const questionDiv = document.createElement('div');
                questionDiv.className = 'lumina-chat-question';
                questionDiv.dataset.entryType = entryDiv.dataset.entryType;
                questionDiv.dataset.rawText = msg.content;
                if (msg.files) questionDiv.dataset.files = JSON.stringify(msg.files);
                const cleanMsgContent = msg.content.replace(/[("'\[]*\$Container[)"'\]]*\s*/gi, '').trim();
                const hasTag = cleanMsgContent.startsWith('$ContextTag');
                const contextMatch = msg.content.match(/^SelectedText: "([\s\S]*?)"(?:\n\n|$)/);
                const contextText = contextMatch ? contextMatch[1] : '';

                if (hasTag) {
                    const taglessText = cleanMsgContent.replace('$ContextTag', '').trim();
                    const tagContent = contextText ? `"${contextText}"` : "SelectedText";
                    questionDiv.innerHTML = `<div class="lumina-question-content"><span class="lumina-selected-text-tag" contenteditable="false">${tagContent}</span> ${taglessText}</div>`;
                } else {
                    questionDiv.innerHTML = `<div class="lumina-question-content">${cleanMsgContent}</div>`;
                }
                entryDiv.appendChild(questionDiv);

                i++;

                if (i < chatData.messages.length && chatData.messages[i].type === 'answer') {
                    const answerMsg = chatData.messages[i];
                    if (answerMsg.metadata?.webSearch) {
                        const stepperHTML = this.createCompletedStepperHTML(
                            answerMsg.metadata.webSearch.query,
                            answerMsg.metadata.webSearch.sourcesCount
                        );
                        const stepperContainer = document.createElement('div');
                        stepperContainer.innerHTML = stepperHTML.trim();
                        entryDiv.appendChild(stepperContainer.firstChild);
                    }

                    if (answerMsg.versions && answerMsg.versions.length > 1) {
                        const versionsContainer = document.createElement('div');
                        versionsContainer.className = 'lumina-answer-versions';
                        const activeIndex = answerMsg.versions.length - 1;

                        answerMsg.versions.forEach((versionContent, idx) => {
                            const versionDiv = document.createElement('div');
                            versionDiv.className = 'lumina-answer-version' + (idx === activeIndex ? ' active' : '');
                            versionDiv.dataset.versionIndex = idx.toString();
                            const answerDiv = document.createElement('div');
                            answerDiv.className = 'lumina-chat-answer';
                            if (versionContent.trim().startsWith('<')) {
                                answerDiv.innerHTML = versionContent;
                            } else if (typeof marked !== 'undefined') {
                                // Add spacing between letters and numbers for better readability
                                let content = versionContent.replace(/([a-zà-ỹ])(\d)/g, '$1 $2').replace(/(\d)([a-zà-ỹ])/g, '$1 $2');

                                // Process Markdown
                                let html = marked.parse(content);

                                // Convert [1], [2], etc. to citation badges
                                if (answerMsg.metadata?.webSearch?.sources) {
                                    const sources = answerMsg.metadata.webSearch.sources;
                                    html = html.replace(/\[(\d+)\]/g, (match, num) => {
                                        const idx = parseInt(num) - 1;
                                        if (sources[idx]) return `<a href="${sources[idx].link}" target="_blank" rel="noopener noreferrer" class="lumina-citation">${num}</a>`;
                                        return match;
                                    });
                                }

                                answerDiv.innerHTML = html;
                            } else {
                                answerDiv.textContent = versionContent;
                            }
                            answerDiv.querySelectorAll('a').forEach(link => {
                                link.target = '_blank';
                                link.rel = 'noopener noreferrer';
                            });
                            if (typeof LuminaChatUI !== 'undefined') LuminaChatUI.processContainer(answerDiv);
                            versionDiv.appendChild(answerDiv);
                            versionsContainer.appendChild(versionDiv);
                        });

                        const navContainer = document.createElement('div');
                        navContainer.className = 'lumina-answer-nav';
                        navContainer.innerHTML = `
                            <button class="lumina-answer-nav-btn nav-prev" ${activeIndex === 0 ? 'disabled' : ''}><svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg></button>
                            <span class="lumina-answer-nav-counter">${activeIndex + 1} / ${answerMsg.versions.length}</span>
                            <button class="lumina-answer-nav-btn nav-next" ${activeIndex === answerMsg.versions.length - 1 ? 'disabled' : ''}><svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg></button>
                        `;
                        versionsContainer.appendChild(navContainer);
                        if (typeof showAnswerVersion === 'function') {
                            navContainer.querySelector('.nav-prev').addEventListener('click', () => showAnswerVersion(entryDiv, 'prev'));
                            navContainer.querySelector('.nav-next').addEventListener('click', () => showAnswerVersion(entryDiv, 'next'));
                        }
                        entryDiv.appendChild(versionsContainer);
                    } else {
                        const answerDiv = document.createElement('div');
                        answerDiv.className = 'lumina-chat-answer';
                        if (answerMsg.content.trim().startsWith('<')) {
                            answerDiv.innerHTML = answerMsg.content;
                        } else if (typeof marked !== 'undefined') {
                            let content = answerMsg.content.replace(/([a-zà-ỹ])(\d)/g, '$1 $2').replace(/(\d)([a-zà-ỹ])/g, '$1 $2');

                            // Process Markdown
                            let html = marked.parse(content);

                            // Convert [1], [2], etc. to citation badges
                            if (answerMsg.metadata?.webSearch?.sources) {
                                const sources = answerMsg.metadata.webSearch.sources;
                                html = html.replace(/\[(\d+)\]/g, (match, num) => {
                                    const idx = parseInt(num) - 1;
                                    if (sources[idx]) return `<a href="${sources[idx].link}" target="_blank" rel="noopener noreferrer" class="lumina-citation">${num}</a>`;
                                    return match;
                                });
                            }
                            answerDiv.innerHTML = html;
                        } else {
                            answerDiv.textContent = answerMsg.content;
                        }
                        answerDiv.querySelectorAll('a').forEach(link => {
                            link.target = '_blank';
                            link.rel = 'noopener noreferrer';
                        });
                        if (typeof LuminaChatUI !== 'undefined') LuminaChatUI.processContainer(answerDiv);
                        entryDiv.appendChild(answerDiv);
                    }

                    const separator = document.createElement('div');
                    separator.className = 'lumina-dict-separator';
                    entryDiv.appendChild(separator);
                    i++;
                }

                history.appendChild(entryDiv);
                if (typeof attachQuestionListeners === 'function') attachQuestionListeners(questionDiv.querySelector('[contenteditable]'));
                continue;
            }

            if (msg.type === 'answer') {
                const entryDiv = document.createElement('div');
                entryDiv.className = 'lumina-dict-entry';
                entryDiv.dataset.entryType = msg.metadata?.entryType || 'qa';
                if (msg.metadata?.webSearch) {
                    const stepperHTML = this.createCompletedStepperHTML(msg.metadata.webSearch.query, msg.metadata.webSearch.sourcesCount);
                    const stepperContainer = document.createElement('div');
                    stepperContainer.innerHTML = stepperHTML.trim();
                    entryDiv.appendChild(stepperContainer.firstChild);
                }
                const answerDiv = document.createElement('div');
                answerDiv.className = 'lumina-chat-answer';
                if (msg.content.trim().startsWith('<')) {
                    answerDiv.innerHTML = msg.content;
                } else if (typeof marked !== 'undefined') {
                    let c = msg.content.replace(/([a-zà-ỹ])(\d)/g, '$1 $2').replace(/(\d)([a-zà-ỹ])/g, '$1 $2');
                    answerDiv.innerHTML = marked.parse(c);
                } else {
                    answerDiv.textContent = msg.content;
                }
                answerDiv.querySelectorAll('a').forEach(link => {
                    link.target = '_blank';
                    link.rel = 'noopener noreferrer';
                });
                if (typeof LuminaChatUI !== 'undefined') LuminaChatUI.processContainer(answerDiv);
                entryDiv.appendChild(answerDiv);
                const separator = document.createElement('div');
                separator.className = 'lumina-dict-separator';
                entryDiv.appendChild(separator);
                history.appendChild(entryDiv);
                i++;
                continue;
            }

            if (msg.type === 'translation' || msg.type === 'image-lookup') {
                const entryDiv = document.createElement('div');
                entryDiv.className = 'lumina-dict-entry';
                entryDiv.dataset.entryType = msg.metadata?.entryType || msg.type;

                if (msg.html) {
                    entryDiv.innerHTML = msg.html;
                } else if (msg.type === 'translation') {
                    const sourceText = msg.content?.source || '';
                    const targetText = msg.content?.target || '';
                    entryDiv.innerHTML = `
                        <div class="lumina-chat-question translation-question">Translate</div>
                        <div class="lumina-translation-container">
                            <div class="lumina-translation-card">
                                <div class="lumina-translation-block">
                                    <div class="lumina-translation-source" data-copy-text="${sourceText.replace(/"/g, '&quot;')}">
                                        <div class="lumina-translation-text"></div>
                                    </div>
                                </div>
                                <div class="lumina-translation-divider"></div>
                                <div class="lumina-translation-block">
                                    <div class="lumina-translation-target" data-copy-text="${targetText.replace(/"/g, '&quot;')}">
                                        <div class="lumina-translation-text"></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="lumina-dict-separator"></div>
                    `;
                    const sEl = entryDiv.querySelector('.lumina-translation-source .lumina-translation-text');
                    const tEl = entryDiv.querySelector('.lumina-translation-target .lumina-translation-text');
                    if (sEl) sEl.textContent = sourceText;
                    if (tEl) tEl.textContent = targetText;
                } else if (msg.type === 'image-lookup') {
                    const queryText = msg.content?.query || '';
                    const imageHtml = (msg.content?.images || []).map(img => `<img src="${img.src || img.fullUrl || ''}" class="lumina-image-item" alt="Image result" data-full-url="${img.fullUrl || img.src || ''}">`).join('');
                    entryDiv.innerHTML = `
                        <div class="lumina-image-card"><div class="lumina-image-query"></div><div class="lumina-image-container">${imageHtml}</div></div>
                        <div class="lumina-dict-separator"></div>
                    `;
                    const qEl = entryDiv.querySelector('.lumina-image-query');
                    if (qEl) qEl.textContent = queryText;
                }

                if (!entryDiv.querySelector('.lumina-dict-separator')) {
                    const sep = document.createElement('div');
                    sep.className = 'lumina-dict-separator';
                    entryDiv.appendChild(sep);
                }

                history.appendChild(entryDiv);
                if (msg.type === 'image-lookup' && typeof attachImageClickListeners === 'function') attachImageClickListeners(entryDiv);
                if (msg.type === 'translation' && typeof LuminaChatUI !== 'undefined') {
                    requestAnimationFrame(() => LuminaChatUI._setupTranslationHighlight(entryDiv));
                    LuminaChatUI.balanceTranslationCard(entryDiv);
                }
                i++;
                continue;
            }
            i++;
        }

        const regenBtn = currentPopup.querySelector('#lumina-regenerate-btn') ||
            currentPopup.querySelector('.lumina-regenerate-btn') ||
            document.getElementById('lumina-regenerate-btn') ||
            document.querySelector('.lumina-regenerate-btn');
        if (regenBtn) {
            const hasEntries = history.querySelector('.lumina-dict-entry');
            regenBtn.style.display = hasEntries ? 'flex' : 'none';
        }

        // Apply min-height to last entry so it fills the viewport (Gemini-style)
        const allRestoredEntries = history.querySelectorAll('.lumina-dict-entry');
        const lastRestoredEntry = allRestoredEntries.length > 0 ? allRestoredEntries[allRestoredEntries.length - 1] : null;
        if (lastRestoredEntry) {
            const tUI = currentPopup._luminaChatUI;
            if (tUI) {
                requestAnimationFrame(() => tUI.setInitialEntryHeight(lastRestoredEntry));
            } else if (typeof setInitialEntryHeight === 'function') {
                requestAnimationFrame(() => setInitialEntryHeight(lastRestoredEntry));
            }
        }

        // Lazy-load iframes: freeze all web source iframes, load one-by-one as they scroll into view
        const wsContainers = history.querySelectorAll('.lumina-websource-container');
        if (wsContainers.length > 0) {
            wsContainers.forEach(container => {
                const iframe = container.querySelector('iframe');
                if (!iframe) return;
                const realSrc = container.dataset.sourceUrl ||
                    (iframe.src && iframe.src !== 'about:blank' ? iframe.src : '') ||
                    container.dataset.savedSrc || '';
                if (!realSrc || realSrc === 'about:blank') return;
                container.dataset.lazySrc = realSrc;
                container.classList.add('is-lazy-unloaded');
                // Freeze: blank src so browser makes no request
                iframe.removeAttribute('src');
            });

            const lazyObserver = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (!entry.isIntersecting) return;
                    const container = entry.target;
                    if (!container.classList.contains('is-lazy-unloaded')) return;
                    const lazySrc = container.dataset.lazySrc;
                    if (!lazySrc) return;
                    const iframe = container.querySelector('iframe');
                    if (!iframe) return;

                    container.classList.remove('is-lazy-unloaded');
                    container.classList.add('is-loading');
                    iframe.onload = () => setTimeout(() => container.classList.remove('is-loading'), 600);
                    lazyObserver.unobserve(container);

                    // Re-inject CSS/zoom/selector if we know the source config
                    const sourceId = container.dataset.sourceId;
                    if (sourceId && typeof chrome !== 'undefined' && chrome.runtime) {
                        chrome.storage.local.get(['customSources'], (data) => {
                            const sources = data.customSources || [];
                            const source = sources.find(s => s.id === sourceId);
                            if (source && (source.css || source.selector || (source.zoom && source.zoom !== 100))) {
                                chrome.runtime.sendMessage({
                                    action: 'prepare_iframe_injection',
                                    frameUrl: lazySrc,
                                    css: source.css || '',
                                    selector: source.selector || '',
                                    zoom: source.zoom || 100
                                }).catch(() => { });
                            }
                            iframe.src = lazySrc;
                        });
                    } else {
                        iframe.src = lazySrc;
                    }
                });
            }, { rootMargin: '200px' });

            wsContainers.forEach(container => {
                if (container.classList.contains('is-lazy-unloaded')) {
                    lazyObserver.observe(container);
                }
            });
        }
    },

    // Get all chat histories
    async getAllHistories() {
        try {
            const result = await chrome.storage.local.get([this.STORAGE_KEY]);
            return result[this.STORAGE_KEY] || [];
        } catch (error) {
            console.error('Failed to get chat histories:', error);
            return [];
        }
    },

    // Delete chat history
    async deleteChat(sessionId) {
        try {
            const result = await chrome.storage.local.get([this.STORAGE_KEY]);
            let histories = result[this.STORAGE_KEY] || {};
            delete histories[sessionId];
            await chrome.storage.local.set({ [this.STORAGE_KEY]: histories });
            // Also delete content key
            await chrome.storage.local.remove([`lumina_session_${sessionId}`]);

            return true;
        } catch (error) {
            console.error('Failed to delete chat history:', error);
            return false;
        }
    },

    // Clear all history
    async clearAllHistory() {
        try {
            await chrome.storage.local.set({ [this.STORAGE_KEY]: {} });

            return true;
        } catch (error) {
            console.error('Failed to clear chat history:', error);
            return false;
        }
    },

    // Start new session
    startNewSession() {
        this.currentSessionId = this.generateSessionId();
    },

    // Migration logic
    async migrateIfNeeded() {
        try {
            const result = await chrome.storage.local.get([
                this.LEGACY_KEY,
                this.TEMP_POPUP_KEY,
                this.STORAGE_KEY
            ]);

            const legacyData = result[this.LEGACY_KEY];
            const tempPopupData = result[this.TEMP_POPUP_KEY];
            const currentData = result[this.STORAGE_KEY];

            let sessions = currentData && typeof currentData === 'object' ? { ...currentData } : {};
            let hasChanges = false;

            // 1. Migrate from legacy 'chat_history' (Array format)
            if (Array.isArray(legacyData) && legacyData.length > 0) {
                console.log('[History] Migrating', legacyData.length, 'legacy chats from chat_history...');
                legacyData.forEach(h => {
                    const id = h.sessionId || `session_${h.timestamp || Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
                    if (!sessions[id]) {
                        sessions[id] = {
                            id: id,
                            title: h.title || 'Migrated Chat',
                            messages: h.messages || [],
                            context: h.context || '',
                            isPinned: !!h.isPinned,
                            createdAt: h.timestamp || Date.now(),
                            updatedAt: h.timestamp || Date.now()
                        };
                        hasChanges = true;
                    }
                });
            }

            // 2. Migrate from temporary 'lumina_popup_sessions'
            if (tempPopupData && typeof tempPopupData === 'object' && Object.keys(tempPopupData).length > 0) {
                console.log('[History] Migrating chats from lumina_popup_sessions...');
                Object.entries(tempPopupData).forEach(([id, session]) => {
                    if (!sessions[id]) {
                        sessions[id] = session;
                        hasChanges = true;
                    }
                });
            }

            if (hasChanges) {
                await chrome.storage.local.set({ [this.STORAGE_KEY]: sessions });
                // Cleanup legacy keys
                await chrome.storage.local.remove([this.LEGACY_KEY, this.TEMP_POPUP_KEY]);
                console.log('[History] Migration complete. Total sessions:', Object.keys(sessions).length);
            }
        } catch (e) {
            console.error('[History] Migration error:', e);
        }
    }
};

// Auto-run migration
ChatHistoryManager.migrateIfNeeded();

// Export for content script context
if (typeof window !== 'undefined') {
    window.ChatHistoryManager = ChatHistoryManager;
}
