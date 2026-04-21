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
    async saveCurrentChat(historyEl = null, optionalSessionId = null) {
        if (!historyEl && typeof currentPopup !== 'undefined' && currentPopup) {
            historyEl = currentPopup.querySelector('.lumina-chat-history');
        }
        if (!historyEl) return;

        // Anti-flicker/performance debounce — prevent rapid storage writes
        const now = Date.now();
        if (this._lastSaveTime && (now - this._lastSaveTime < 500)) {
            if (this._saveTimeout) clearTimeout(this._saveTimeout);
            this._saveTimeout = setTimeout(() => this.saveCurrentChat(historyEl, optionalSessionId), 500);
            return;
        }
        this._lastSaveTime = now;
        if (this._saveTimeout) clearTimeout(this._saveTimeout);

        const history = historyEl;
        if (!history || history.children.length === 0) return;

        // Extract messages first to check if there are any chat messages
        const messages = this.extractMessages(history);

        if (messages.length === 0) {
            return;
        }

        // Generate session ID if not exists
        let activeSessionId = optionalSessionId || this.currentSessionId;
        if (!activeSessionId) {
            activeSessionId = this.generateSessionId();
            if (!optionalSessionId) this.currentSessionId = activeSessionId; // Only update global if not passed locally
        }

        // Generate metadata
        const title = this.generateChatTitle(history);
        const timestamp = Date.now();

        try {
            // 1. Save HEAVY content to its own unique key
            const sessionKey = `lumina_session_${activeSessionId}`;
            await chrome.storage.local.set({ [sessionKey]: messages });

            // 2. Update LIGHTWEIGHT index
            const result = await chrome.storage.local.get([this.STORAGE_KEY]);
            let sessions = result[this.STORAGE_KEY] || {};

            // Check if explicitly renamed
            const existingSession = sessions[activeSessionId] || {};
            const isRenamed = existingSession.isRenamed || false;
            const finalTitle = isRenamed ? existingSession.title : title;

            // Extract individual questions and translations for entry-level search
            const questions = messages
                .map((m, idx) => ({ ...m, originalIndex: idx }))
                .filter(m => m.type === 'question' || m.type === 'translation')
                .map(m => {
                    if (m.type === 'translation') {
                        return {
                            text: `Translate: ${m.content.source || ''}`,
                            index: m.originalIndex,
                            snippet: String(m.content.target || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 100),
                            timestamp: m.timestamp
                        };
                    }

                    // Standard Question
                    // Find the very next message that is an answer to this question
                    const nextAnswer = messages.slice(m.originalIndex + 1).find(msg => msg.type === 'answer');
                    // Truncate to 100 chars to avoid bloating the lightweight index
                    const answerSummary = nextAnswer ? String(nextAnswer.content || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 100) : '';

                    return {
                        text: String(m.content || ''),
                        index: m.originalIndex,
                        snippet: answerSummary, // Store short answer preview
                        timestamp: m.timestamp
                    };
                });

            const fullSearchText = questions.map(q => q.text).join(' ').replace(/\s+/g, ' ');

            // Snippet should be the latest answer for a better preview (stripped of HTML and truncated)
            const latestAnswer = [...messages].reverse().find(m => m.type === 'answer');
            const contentForSnippet = latestAnswer ? String(latestAnswer.content || '') : (messages[0] ? String(messages[0].content || '') : 'No messages');
            const snippet = contentForSnippet.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 100);

            const latestTimestamp = messages.length > 0 ? messages[messages.length - 1].timestamp : timestamp;

            // We store everything EXCEPT messages in the index
            sessions[activeSessionId] = {
                id: activeSessionId,
                title: finalTitle,
                isRenamed: isRenamed,
                searchIndex: fullSearchText, // Limit removed, only questions saved
                questions: questions, // For granular entry-level search
                snippet: snippet, // For visual preview
                context: (typeof currentContext !== 'undefined' ? currentContext : '') || '',
                isPinned: typeof isPinned !== 'undefined' ? isPinned : false,
                position: (typeof isPinned !== 'undefined' && isPinned) && typeof currentPopup !== 'undefined' && currentPopup ? {
                    left: currentPopup.style.left,
                    top: currentPopup.style.top
                } : null,
                createdAt: existingSession.createdAt || timestamp,
                updatedAt: latestTimestamp,
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
        const allEntries = Array.from(historyElement.querySelectorAll('.lumina-dict-entry'));
        if (allEntries.length === 0) return 'New Chat';
        
        // Find the LATEST entry that has a question or translation to use as title
        for (let i = allEntries.length - 1; i >= 0; i--) {
            const entry = allEntries[i];
            
            // Check for translation
            const translationSource = entry.querySelector('.lumina-translation-source');
            if (translationSource) {
                return translationSource.dataset.copyText || translationSource.textContent.trim();
            }

            // Check for standard question
            const questionEl = entry.querySelector('.lumina-chat-question');
            if (questionEl) {
                return questionEl.dataset.rawText || questionEl.textContent.trim();
            }
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
    async restoreChat(chatData, historyContainer = null) {
        if (!historyContainer && typeof currentPopup === 'undefined') return;

        if (!historyContainer && !currentPopup) {
            showChatPopup('');
            overridePopupAnimation(currentPopup);
        }

        const history = historyContainer || currentPopup.querySelector('.lumina-chat-history');
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
                if (msg.timestamp) entryDiv.dataset.timestamp = String(msg.timestamp);

                const questionDiv = document.createElement('div');
                questionDiv.className = 'lumina-chat-question';
                questionDiv.dataset.messageIndex = i;
                questionDiv.dataset.entryType = entryDiv.dataset.entryType;
                questionDiv.dataset.rawText = msg.content;
                if (msg.files) questionDiv.dataset.files = JSON.stringify(msg.files);
                const cleanMsgContent = msg.content.replace(/[("'\[]*\$Container[)"'\]]*\s*/gi, '').trim();
                const hasTag = cleanMsgContent.startsWith('$ContextTag');
                const contextMatch = msg.content.match(/^SelectedText: "([\s\S]*?)"(?:\n\n|$)/);
                const contextText = contextMatch ? contextMatch[1] : '';

                if (hasTag) {
                    const taglessText = cleanMsgContent.replace('$ContextTag', '').trim();
                    const tagContent = contextText ? `"${contextText}"` : "";
                    questionDiv.innerHTML = `<div class="lumina-question-content">${tagContent} ${taglessText}</div>`;
                } else {
                    questionDiv.innerHTML = `<div class="lumina-question-content">${cleanMsgContent}</div>`;
                }
                const row = document.createElement('div');
                row.className = 'lumina-question-row';
                row.appendChild(questionDiv);
                entryDiv.appendChild(row);

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

            if (msg.type === 'translation') {
                const entryDiv = document.createElement('div');
                entryDiv.className = 'lumina-dict-entry';
                entryDiv.dataset.entryType = msg.metadata?.entryType || msg.type;
                if (msg.timestamp) entryDiv.dataset.timestamp = String(msg.timestamp);

                if (msg.html) {
                    entryDiv.innerHTML = msg.html;
                } else if (msg.type === 'translation') {
                    const sourceText = msg.content?.source || '';
                    const targetText = msg.content?.target || '';
                    entryDiv.innerHTML = `
                        <div class="lumina-question-row">
                            <div class="lumina-chat-question translation-question" data-message-index="${i}" data-raw-text="${sourceText.replace(/"/g, '&quot;')}">Translate</div>
                        </div>
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
                }

                if (!entryDiv.querySelector('.lumina-dict-separator')) {
                    const sep = document.createElement('div');
                    sep.className = 'lumina-dict-separator';
                    entryDiv.appendChild(sep);
                }

                history.appendChild(entryDiv);
                if (msg.type === 'translation' && typeof LuminaChatUI !== 'undefined') {
                    requestAnimationFrame(() => LuminaChatUI._setupTranslationHighlight(entryDiv));
                    LuminaChatUI.balanceTranslationCard(entryDiv);
                }
                i++;
                continue;
            }
            i++;
        }

        const hasEntries = history.querySelector('.lumina-dict-entry');
        const regenBtn = document.getElementById('lumina-regenerate-btn') ||
            document.querySelector('.lumina-regenerate-btn');

        if (regenBtn) {
            regenBtn.style.display = hasEntries ? 'flex' : 'none';
        }

        // Scrolling and margin adjustment is handled by the calling environment (e.g. spotlight.js syncTabUI)
        // after the chat is restored.

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

    // Rename a chat session
    async renameChat(sessionId, newTitle) {
        try {
            const result = await chrome.storage.local.get([this.STORAGE_KEY]);
            let sessions = result[this.STORAGE_KEY] || {};
            if (sessions[sessionId]) {
                sessions[sessionId].title = newTitle;
                sessions[sessionId].isRenamed = true;
                sessions[sessionId].updatedAt = Date.now();
                await chrome.storage.local.set({ [this.STORAGE_KEY]: sessions });
                return true;
            }
            return false;
        } catch (error) {
            console.error('Failed to rename chat history:', error);
            return false;
        }
    },

    // Duplicate a chat session
    async duplicateChat(sessionId) {
        try {
            const result = await chrome.storage.local.get([this.STORAGE_KEY]);
            let sessions = result[this.STORAGE_KEY] || {};
            if (sessions[sessionId]) {
                const newSessionId = this.generateSessionId();
                const sourceMeta = sessions[sessionId];

                const sessionKey = `lumina_session_${sessionId}`;
                const contentResult = await chrome.storage.local.get([sessionKey]);
                const messages = contentResult[sessionKey] || sourceMeta.messages || [];

                const newSessionKey = `lumina_session_${newSessionId}`;
                await chrome.storage.local.set({ [newSessionKey]: messages });

                const timestamp = Date.now();
                sessions[newSessionId] = {
                    ...sourceMeta,
                    id: newSessionId,
                    title: sourceMeta.title + ' (Copy)',
                    createdAt: timestamp,
                    updatedAt: timestamp
                };

                await chrome.storage.local.set({ [this.STORAGE_KEY]: sessions });
                return newSessionId;
            }
            return null;
        } catch (error) {
            console.error('Failed to duplicate chat history:', error);
            return null;
        }
    },

    // Get current storage usage in bytes (Only for Chat History & Spotlight Tabs)
    async getStorageUsage() {
        try {
            const allStorage = await chrome.storage.local.get(null);
            let totalBytes = 0;

            Object.keys(allStorage).forEach(key => {
                // Only count keys that are cleared by clearAllHistory
                const isChatKey = key === this.STORAGE_KEY ||
                                  key.startsWith('lumina_session_') ||
                                  key.startsWith('spotlight_history_') ||
                                  key === 'spotlight_tabs' ||
                                  key === 'spotlight_tab_counter';

                if (isChatKey) {
                    // Approximate size by stringifying the value
                    const valueStr = JSON.stringify(allStorage[key]);
                    totalBytes += valueStr.length % 2 === 0 ? valueStr.length * 2 : valueStr.length * 2; // UTF-16 approx
                }
            });

            return totalBytes;
        } catch (error) {
            console.error('Error calculating chat storage:', error);
            return 0;
        }
    },

    // Clear all history
    async clearAllHistory() {
        try {
            // Get all keys to find and remove partitioned session content
            const allStorage = await chrome.storage.local.get(null);
            const keysToDelete = Object.keys(allStorage).filter(key =>
                key === this.STORAGE_KEY ||
                key.startsWith('lumina_session_') ||
                key.startsWith('spotlight_history_') ||
                key === 'spotlight_tabs' ||
                key === 'spotlight_tab_counter'
            );

            if (keysToDelete.length > 0) {
                await chrome.storage.local.remove(keysToDelete);
            } else {
                // Fallback: at least clear the main index
                await chrome.storage.local.set({ [this.STORAGE_KEY]: {} });
            }

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
