function escapeHTMLAttr(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function createObjectUrlFromDataUrl(dataUrl) {
    if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return null;
    const commaIdx = dataUrl.indexOf(',');
    if (commaIdx === -1) return null;
    const header = dataUrl.slice(0, commaIdx);
    const base64 = dataUrl.slice(commaIdx + 1);
    const mimeMatch = header.match(/^data:([^;]+);base64$/i);
    if (!mimeMatch) return null;
    try {
        const mimeType = mimeMatch[1];
        const binary = atob(base64);
        const array = [];
        for (let i = 0; i < binary.length; i++) {
            array.push(binary.charCodeAt(i));
        }
        const blob = new Blob([new Uint8Array(array)], { type: mimeType });
        return URL.createObjectURL(blob);
    } catch (e) {
        console.error('Failed to create object URL from data URL:', e);
        return null;
    }
}

function resolveImagePreviewSrc(item, src) {
    if (!src || typeof src !== 'string') return src;
    if (!src.startsWith('data:image/')) return src;
    if (item && typeof item === 'object' && item._luminaBlobUrl) {
        return item._luminaBlobUrl;
    }
    const blobUrl = createObjectUrlFromDataUrl(src);
    if (blobUrl && item && typeof item === 'object') {
        item._luminaBlobUrl = blobUrl;
    }
    return blobUrl || src;
}

const ChatHistoryManager = {
    STORAGE_KEY: 'lumina_chat_sessions',
    LEGACY_KEY: 'chat_history',
    TEMP_POPUP_KEY: 'lumina_popup_sessions',
    MAX_HISTORIES: 999,
    RETENTION_DAYS: 180,
    currentSessionId: null,
    generateSessionId() {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    },
    async saveCurrentChat(historyEl = null, optionalSessionId = null, sparkId = null, force = false, extraSettings = null) {
        if (!historyEl && typeof currentPopup !== 'undefined' && currentPopup) {
            historyEl = currentPopup.querySelector('.lumina-chat-history');
        }
        if (!historyEl) return;
        const now = Date.now();
        if (!force && this._lastSaveTime && (now - this._lastSaveTime < 500)) {
            if (this._saveTimeout) clearTimeout(this._saveTimeout);
            this._saveTimeout = setTimeout(() => this.saveCurrentChat(historyEl, optionalSessionId, sparkId, force, extraSettings), 500);
            return;
        }
        this._lastSaveTime = now;
        if (this._saveTimeout) clearTimeout(this._saveTimeout);
        if (optionalSessionId && historyEl.dataset.sessionId && historyEl.dataset.sessionId !== optionalSessionId) {
            console.log('[Lumina Chat History] Discarding save due to session ID mismatch', {
                expected: optionalSessionId,
                current: historyEl.dataset.sessionId
            });
            return;
        }
        const history = historyEl;
        if (!history || history.children.length === 0) return;
        const messages = this.extractMessages(history);
        if (messages.length === 0) {
            return;
        }
        let activeSessionId = optionalSessionId || this.currentSessionId;
        if (!activeSessionId) {
            activeSessionId = this.generateSessionId();
            if (!optionalSessionId) this.currentSessionId = activeSessionId;
        }
        const title = this.generateChatTitle(history);
        const timestamp = Date.now();
        try {
            const optimizedMessages = messages.map(msg => {
                if (msg.type === 'question') {
                    const cleanItem = (item) => {
                        if (typeof item === 'object' && item && (item.attachmentId || item.fileUri)) {
                            const newItem = { ...item };
                            if (newItem.dataUrl) newItem.dataUrl = null;
                            if (newItem.previewUrl && newItem.previewUrl.startsWith('data:')) newItem.previewUrl = null;
                            if (newItem.data) newItem.data = null;
                            return newItem;
                        }
                        return item;
                    };
                    return {
                        ...msg,
                        files: Array.isArray(msg.files || msg.images) ? (msg.files || msg.images).map(cleanItem) : (msg.files || msg.images)
                    };
                }
                return msg;
            });
            
            await LuminaChatDB.putMessages(activeSessionId, optimizedMessages);
            
            const existingSession = await LuminaChatDB.getSession(activeSessionId) || {};
            const isRenamed = existingSession.isRenamed || false;
            const autoNamed = existingSession.autoNamed || false;
            const finalTitle = (isRenamed || autoNamed) ? existingSession.title : title;
            const questions = messages
                .map((m, idx) => ({ ...m, originalIndex: idx }))
                .filter(m => m.type === 'question')
                .map(m => {
                    const nextAnswer = messages.slice(m.originalIndex + 1).find(msg => msg.type === 'answer');
                    const answerSummary = nextAnswer ? String(nextAnswer.content || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 100) : '';
                    return {
                        text: String(m.content || ''),
                        index: m.originalIndex,
                        snippet: answerSummary,
                        timestamp: m.timestamp
                    };
                });
            const fullSearchText = questions.map(q => q.text).join(' ').replace(/\s+/g, ' ');
            const latestAnswer = [...messages].reverse().find(m => m.type === 'answer');
            const contentForSnippet = latestAnswer ? String(latestAnswer.content || '') : (messages[0] ? String(messages[0].content || '') : 'No messages');
            const snippet = contentForSnippet.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 100);
            const latestTimestamp = messages.length > 0 ? messages[messages.length - 1].timestamp : timestamp;
            
            const sessionMeta = {
                id: activeSessionId,
                title: finalTitle,
                isRenamed: isRenamed,
                autoNamed: existingSession.autoNamed || false,
                sparkId: sparkId || existingSession.sparkId || null,
                searchIndex: fullSearchText,
                questions: questions,
                snippet: snippet,
                context: (typeof currentContext !== 'undefined' ? currentContext : '') || '',
                pinned: existingSession.pinned !== undefined ? existingSession.pinned : (existingSession.isPinned !== undefined ? existingSession.isPinned : (typeof isPinned !== 'undefined' ? isPinned : false)),
                isPinned: existingSession.pinned !== undefined ? existingSession.pinned : (existingSession.isPinned !== undefined ? existingSession.isPinned : (typeof isPinned !== 'undefined' ? isPinned : false)),
                position: (existingSession.pinned || existingSession.isPinned || (typeof isPinned !== 'undefined' && isPinned)) && typeof currentPopup !== 'undefined' && currentPopup ? {
                    left: currentPopup.style.left,
                    top: currentPopup.style.top
                } : null,
                createdAt: existingSession.createdAt || timestamp,
                updatedAt: (force || !existingSession.updatedAt || latestTimestamp > existingSession.updatedAt) ? timestamp : existingSession.updatedAt,
                hasContent: true,
                selectedModel: (extraSettings && extraSettings.selectedModel) || existingSession.selectedModel || null,
                thinkingLevel: (extraSettings && extraSettings.thinkingLevel) || existingSession.thinkingLevel || null
            };
            
            await LuminaChatDB.putSession(sessionMeta);

            if (sparkId) {
                const finalModel = (extraSettings && extraSettings.selectedModel) || existingSession.selectedModel || null;
                const finalThinking = (extraSettings && extraSettings.thinkingLevel) || existingSession.thinkingLevel || null;
                if (finalModel || finalThinking) {
                    const settingsRes = await chrome.storage.local.get(['lumina_spark_last_settings']);
                    const sparkSettings = settingsRes.lumina_spark_last_settings || {};
                    sparkSettings[sparkId] = {
                        selectedModel: finalModel,
                        thinkingLevel: finalThinking
                    };
                    await chrome.storage.local.set({ lumina_spark_last_settings: sparkSettings });
                }
            }
            
            const allSessions = await LuminaChatDB.getAllSessions();
            let sortedIds = Object.keys(allSessions)
                .sort((a, b) => (allSessions[b].updatedAt || 0) - (allSessions[a].updatedAt || 0));
            if (sortedIds.length > this.MAX_HISTORIES) {
                const deletedIds = sortedIds.slice(this.MAX_HISTORIES);
                for (const id of deletedIds) {
                    await this.deleteSessionWithAttachments(id);
                }
            }
            
            chrome.runtime.sendMessage({ action: 'lumina_session_updated', sessionId: activeSessionId }).catch(() => {});
            chrome.runtime.sendMessage({ action: 'lumina_sessions_index_updated' }).catch(() => {});
        } catch (error) {
            console.error('Failed to save chat history:', error);
        }
    },
    
    createCompletedStepperHTML(query, sourcesCount) {
        const checkIcon = '<svg class="lumina-step-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>';
        return `
            <div class="lumina-completed-step">
                ${checkIcon}
                <span class="lumina-step-text">Searched for: <strong>"${query}"</strong> (${sourcesCount} sources)</span>
            </div>
        `;
    },

    extractMessages(historyElement) {
        const messages = [];
        for (const child of historyElement.children) {
            if (!child.classList.contains('lumina-entry')) continue;
            const entryType = child.dataset.entryType;
            const fromCache = child.dataset.fromCache === 'true';
            const timestamp = parseInt(child.dataset.timestamp) || Date.now();
            const questionEl = child.querySelector('.lumina-chat-question');
            const versionsContainer = child.querySelector('.lumina-answer-versions');
            const answerEl = child.querySelector('.lumina-chat-answer');
            if (questionEl) {
                let serializedImages = Array.isArray(questionEl._luminaImages) ? questionEl._luminaImages :
                    (Array.isArray(child._luminaImages) ? child._luminaImages : null);
                if (!serializedImages && questionEl.dataset.images) {
                    try {
                        const parsedImages = JSON.parse(questionEl.dataset.images);
                        if (Array.isArray(parsedImages)) {
                            serializedImages = parsedImages;
                        } else if (parsedImages && Array.isArray(parsedImages.files)) {
                            serializedImages = parsedImages.files;
                        } else {
                            serializedImages = null;
                        }
                    } catch (_) {
                        serializedImages = null;
                    }
                }
                messages.push({
                    type: 'question',
                    content: questionEl.dataset.rawText || questionEl.textContent.trim(),
                    files: serializedImages,
                    timestamp,
                    metadata: { fromCache }
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
                    metadata: { fromCache, webSearch: webSearchData }
                });
            } else if (answerEl) {
                const webSearchData = answerEl.dataset.webSearch ? JSON.parse(answerEl.dataset.webSearch) : null;
                messages.push({
                    type: 'answer',
                    content: answerEl.getAttribute('data-raw-text') || answerEl.innerHTML,
                    timestamp,
                    metadata: { fromCache, webSearch: webSearchData }
                });
            }
        }
        return messages;
    },
    generateChatTitle(historyElement) {
        const allEntries = Array.from(historyElement.querySelectorAll('.lumina-entry'));
        if (allEntries.length === 0) return 'New Chat';
        for (let i = allEntries.length - 1; i >= 0; i--) {
            const entry = allEntries[i];
            const questionEl = entry.querySelector('.lumina-chat-question');
            if (questionEl) {
                return questionEl.dataset.rawText || questionEl.textContent.trim();
            }
        }
        return 'New Chat';
    },
    async loadChat(sessionId) {
        try {
            const chatMeta = await LuminaChatDB.getSession(sessionId);
            if (chatMeta) {
                this.currentSessionId = sessionId;
                const messages = await LuminaChatDB.getMessages(sessionId) || [];
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
    async restoreChat(chatData, historyContainer = null, targetIndex = null) {
        if (!historyContainer && typeof currentPopup === 'undefined') return;
        if (!historyContainer && !currentPopup) {
            showChatPopup('');
            overridePopupAnimation(currentPopup);
        }
        const history = historyContainer || currentPopup.querySelector('.lumina-chat-history');
        if (!history) return;
        
        const restoreId = Math.random().toString(36).substr(2, 9);
        history.__activeRestoreId = restoreId;
        
        history.innerHTML = '';
        if (chatData.context) currentContext = chatData.context;
        
        let sparksMap = {};
        if (chatData.sparkId) {
            try {
                const sparksRes = await chrome.storage.local.get(['lumina_sparks']);
                sparksMap = sparksRes.lumina_sparks || {};
            } catch (e) {
                console.error('Failed to load sparks in restoreChat', e);
            }
        }
        
        const processPromises = [];
        
        if (typeof document !== 'undefined' && !document.getElementById('lumina-lazy-load-styles')) {
            const style = document.createElement('style');
            style.id = 'lumina-lazy-load-styles';
            style.textContent = `
                .lumina-load-more-history {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 8px 14px;
                    margin: 12px auto;
                    max-width: 220px;
                    background: rgba(255, 255, 255, 0.04);
                    border: 1px dashed rgba(255, 255, 255, 0.15);
                    border-radius: 16px;
                    color: var(--lumina-sidebar-text-muted);
                    font-size: 11px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    user-select: none;
                }
                .lumina-load-more-history:hover {
                    background: rgba(255, 255, 255, 0.08);
                    border-color: rgba(255, 255, 255, 0.3);
                    color: var(--lumina-text-primary);
                }
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `;
            document.head.appendChild(style);
        }

        const renderGroup = async (group, targetContainer) => {
            if (history.__activeRestoreId !== restoreId) return;
            let i = 0;
            while (i < group.length) {
                if (history.__activeRestoreId !== restoreId) return;
                const item = group[i];
                const msg = item.msg;
                const msgIdx = item.originalIndex;

                if (msg.type === 'question') {
                    const entryDiv = document.createElement('div');
                    entryDiv.className = 'lumina-entry';
                    entryDiv.dataset.entryId = msg.metadata?.entryId || ('entry-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9));
                    entryDiv.dataset.entryType = msg.metadata?.entryType || 'qa';
                    if (msg.timestamp) entryDiv.dataset.timestamp = String(msg.timestamp);

                    const questionDiv = document.createElement('div');
                    questionDiv.className = 'lumina-chat-question';
                    questionDiv.dataset.messageIndex = msgIdx;
                    questionDiv.dataset.entryType = entryDiv.dataset.entryType;
                    questionDiv.dataset.rawText = msg.content;
                    if (msg.files) questionDiv.dataset.files = JSON.stringify(msg.files);

                    const visibleImages = Array.isArray(msg.files)
                        ? msg.files.filter((imgItem) => {
                            if (typeof imgItem === 'string') return true;
                            if (!imgItem || typeof imgItem !== 'object') return false;
                            return !imgItem.hiddenInPreview && !imgItem.parentAttachmentId;
                        })
                        : [];

                    if (visibleImages.length > 0) {
                        questionDiv._luminaImages = visibleImages;
                        entryDiv._luminaImages = visibleImages;
                        questionDiv.dataset.images = JSON.stringify({
                            compact: true,
                            count: visibleImages.length,
                            files: visibleImages.map((imgItem, imgIdx) => {
                                if (typeof imgItem === 'string') {
                                    return {
                                        name: `Image ${imgIdx + 1}`,
                                        mimeType: 'image/*',
                                        isImage: true,
                                        dataLength: imgItem.length,
                                        dataUrl: imgItem
                                    };
                                }
                                return {
                                    name: imgItem?.name || `File ${imgIdx + 1}`,
                                    mimeType: imgItem?.mimeType || '',
                                    isImage: !!imgItem?.isImage || (imgItem?.mimeType || '').startsWith('image/'),
                                    fileUri: imgItem?.fileUri || '',
                                    dataLength: (imgItem?.dataUrl || imgItem?.data || '').length,
                                    dataUrl: imgItem?.dataUrl || imgItem?.previewUrl || (imgItem?.mimeType && imgItem?.data ? `data:${imgItem.mimeType};base64,${imgItem.data}` : ''),
                                    attachmentId: imgItem?.attachmentId || null
                                };
                            })
                        });

                        const filesDiv = document.createElement('div');
                        filesDiv.className = 'lumina-chat-question-files';
                        visibleImages.forEach(item => {
                            const isImage = item.isImage || (item.mimeType && item.mimeType.startsWith('image/'));
                            const rawSrc = item.objectUrl || item.dataUrl || item.previewUrl || (item.mimeType && item.data ? `data:${item.mimeType};base64,${item.data}` : '');
                            const src = isImage ? (rawSrc.startsWith('data:') || rawSrc.startsWith('blob:') ? rawSrc : (typeof LuminaChatUI !== 'undefined' ? LuminaChatUI._resolveImagePreviewSrc(item, rawSrc) : rawSrc)) : rawSrc;
                            if (isImage) {
                                const img = document.createElement('img');
                                img.src = src;
                                if (item.attachmentId) {
                                    img.dataset.attachmentId = item.attachmentId;
                                }
                                if (item.name) img.alt = item.name;
                                img.className = 'lumina-clickable-image';
                                img.addEventListener('click', (e) => {
                                    e.stopPropagation();
                                    if (typeof LuminaChatUI !== 'undefined') {
                                        LuminaChatUI.showImagePreview(img.src, img.alt);
                                    }
                                });
                                filesDiv.appendChild(img);
                            } else {
                                const fileName = item.name || 'File';
                                const displayName = typeof LuminaChatUI !== 'undefined' ? LuminaChatUI.getDisplayFileName(fileName) : fileName;
                                const category = typeof LuminaChatUI !== 'undefined' ? LuminaChatUI.inferFileCategory(item) : 'other';
                                const icon = typeof LuminaChatUI !== 'undefined' ? LuminaChatUI.getFileIconByCategory(category) : '📄';
                                const typeLabel = typeof LuminaChatUI !== 'undefined' ? LuminaChatUI.getFileTypeLabel(item) : '';
                                const fileChip = document.createElement('div');
                                fileChip.className = 'lumina-preview-item is-file lumina-question-file-chip';
                                fileChip.title = fileName;
                                fileChip.innerHTML = `<div class="lumina-file-preview-info"><span class="lumina-file-name">${displayName || fileName}</span><div class="lumina-file-meta-row"><span class="lumina-file-icon-inline file-${category}">${icon}</span><span class="lumina-file-size-tag">${typeLabel}</span></div></div>`;
                                filesDiv.appendChild(fileChip);
                            }
                        });
                        entryDiv.appendChild(filesDiv);

                        visibleImages.forEach(imgItem => {
                            if (imgItem && imgItem.attachmentId) {
                                LuminaAttachmentDB.get(imgItem.attachmentId).then(async (blob) => {
                                    if (blob) {
                                        const dataUrl = await LuminaAttachmentDB.blobToDataURL(blob);
                                        const imgEl = entryDiv.querySelector(`[data-attachment-id="${imgItem.attachmentId}"]`);
                                        if (imgEl && dataUrl) {
                                            imgEl.src = dataUrl;
                                        }
                                    }
                                }).catch(err => console.error('Failed to hydrate attachment preview in restoreChat', err));
                            }
                        });
                    }

                    let cleanMsgContent = (msg.content || '').trim();
                    if (cleanMsgContent.startsWith('[Context:')) {
                        const closeBracketIdx = cleanMsgContent.indexOf(']');
                        const contextText = cleanMsgContent.substring(9, closeBracketIdx).trim();
                        const taglessText = cleanMsgContent.substring(closeBracketIdx + 1).trim();
                        const tagContent = contextText ? `"${contextText}"` : "";
                        questionDiv.innerHTML = `<div class="lumina-question-content">${tagContent} ${taglessText}</div>`;
                    } else {
                        questionDiv.innerHTML = `<div class="lumina-question-content">${cleanMsgContent}</div>`;
                    }

                    const row = document.createElement('div');
                    row.className = 'lumina-question-row';
                    row.appendChild(questionDiv);
                    entryDiv.appendChild(row);

                    if (typeof LuminaChatUI !== 'undefined' && typeof LuminaChatUI.injectQuestionActions === 'function') {
                        LuminaChatUI.injectQuestionActions(questionDiv);
                    }

                    if (i + 1 < group.length && group[i + 1].msg.type === 'answer') {
                        const answerMsg = group[i + 1].msg;
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
                                answerDiv.setAttribute('data-raw-text', versionContent);
                                const displayContent = versionContent.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').trim();
                                if (displayContent.trim().startsWith('<')) {
                                    answerDiv.innerHTML = displayContent;
                                } else if (typeof marked !== 'undefined') {
                                    let content = displayContent;
                                    let html = marked.parse(content);
                                    if (answerMsg.metadata?.webSearch?.sources) {
                                        const sources = answerMsg.metadata.webSearch.sources;
                                        html = html.replace(/\[(\d+)\]/g, (match, num) => {
                                            const sIdx = parseInt(num) - 1;
                                            if (sources[sIdx]) return `<a href="${sources[sIdx].link}" target="_blank" rel="noopener noreferrer" class="lumina-citation">${num}</a>`;
                                            return match;
                                        });
                                    }
                                    answerDiv.innerHTML = html;
                                } else {
                                    answerDiv.textContent = displayContent;
                                }
                                answerDiv.querySelectorAll('a').forEach(link => {
                                    link.target = '_blank';
                                    link.rel = 'noopener noreferrer';
                                });
                                if (typeof LuminaChatUI !== 'undefined') {
                                    processPromises.push(LuminaChatUI.processContainer(answerDiv));
                                }
                                if (chatData.sparkId && sparksMap[chatData.sparkId]) {
                                    const spark = sparksMap[chatData.sparkId];
                                    const headerDiv = document.createElement('div');
                                    headerDiv.className = 'lumina-spark-message-header';
                                    const nameSpan = document.createElement('span');
                                    nameSpan.className = 'lumina-spark-name';
                                    nameSpan.textContent = spark.name;
                                    const sepSpan = document.createElement('span');
                                    sepSpan.className = 'lumina-spark-separator';
                                    sepSpan.textContent = ' • ';
                                    const typeSpan = document.createElement('span');
                                    typeSpan.className = 'lumina-spark-type';
                                    typeSpan.textContent = 'Custom Spark';
                                    headerDiv.appendChild(nameSpan);
                                    headerDiv.appendChild(sepSpan);
                                    headerDiv.appendChild(typeSpan);
                                    answerDiv.insertBefore(headerDiv, answerDiv.firstChild);
                                }
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
                            answerDiv.setAttribute('data-raw-text', answerMsg.content);
                            let displayContent = answerMsg.content.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').trim();
                            displayContent = displayContent.replace(/<lumina-canvas-create\s+name="([^"]+)"\s+type="([^"]+)">[\s\S]*?(?:<\/lumina-canvas-create>|$)/gi, (match, name, type) => {
                                const timeStr = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                                const displayType = type.replace('code/', '').toUpperCase();
                                return `<div class="lumina-canvas-card" data-canvas-name="${name.replace(/"/g, '&quot;')}" data-canvas-type="${type}">
      <div class="lumina-canvas-card-left">
        <div class="lumina-canvas-card-info">
          <div class="lumina-canvas-card-title">${name}</div>
          <div class="lumina-canvas-card-meta">${displayType} • ${timeStr}</div>
        </div>
      </div>
    </div>`;
                            });
                            displayContent = displayContent.replace(/<lumina-canvas-update\s+name="([^"]+)">[\s\S]*?(?:<\/lumina-canvas-update>|$)/gi, (match, name) => {
                                return `*🔄 Canvas Updated: **${name}***`;
                            });
                            displayContent = displayContent.replace(/<lumina-canvas-comment\s+name="([^"]+)">[\s\S]*?(?:<\/lumina-canvas-comment>|$)/gi, (match, name) => {
                                return `*💬 Canvas Comment Added: **${name}***`;
                            });
                            if (displayContent.trim().startsWith('<') && !displayContent.trim().startsWith('<div class="lumina-canvas-card"')) {
                                answerDiv.innerHTML = displayContent;
                            } else if (typeof marked !== 'undefined') {
                                let content = displayContent;
                                content = content.replace(/!\[([^\]]*)\]\((image-search:\/\/[^)]*)\)/g, (match, alt, url) => {
                                    return `![${alt}](${url.replace(/ /g, '%20')})`;
                                });
                                let html = marked.parse(content);
                                if (answerMsg.metadata?.webSearch?.sources) {
                                    const sources = answerMsg.metadata.webSearch.sources;
                                    html = html.replace(/\[(\d+)\]/g, (match, num) => {
                                        const sIdx = parseInt(num) - 1;
                                        if (sources[sIdx]) return `<a href="${sources[sIdx].link}" target="_blank" rel="noopener noreferrer" class="lumina-citation">${num}</a>`;
                                        return match;
                                    });
                                }
                                answerDiv.innerHTML = html;
                            } else {
                                answerDiv.textContent = displayContent;
                            }
                            answerDiv.querySelectorAll('a').forEach(link => {
                                link.target = '_blank';
                                link.rel = 'noopener noreferrer';
                            });
                            if (typeof LuminaChatUI !== 'undefined') {
                                processPromises.push(LuminaChatUI.processContainer(answerDiv));
                            }
                            if (chatData.sparkId && sparksMap[chatData.sparkId]) {
                                const spark = sparksMap[chatData.sparkId];
                                const headerDiv = document.createElement('div');
                                headerDiv.className = 'lumina-spark-message-header';
                                const nameSpan = document.createElement('span');
                                nameSpan.className = 'lumina-spark-name';
                                nameSpan.textContent = spark.name;
                                const sepSpan = document.createElement('span');
                                sepSpan.className = 'lumina-spark-separator';
                                sepSpan.textContent = ' • ';
                                const typeSpan = document.createElement('span');
                                typeSpan.className = 'lumina-spark-type';
                                typeSpan.textContent = 'Custom Spark';
                                headerDiv.appendChild(nameSpan);
                                headerDiv.appendChild(sepSpan);
                                headerDiv.appendChild(typeSpan);
                                answerDiv.insertBefore(headerDiv, answerDiv.firstChild);
                            }
                            entryDiv.appendChild(answerDiv);
                        }
                        i++;
                    }
                    targetContainer.appendChild(entryDiv);
                    if (typeof attachQuestionListeners === 'function') attachQuestionListeners(questionDiv.querySelector('[contenteditable]'));
                } else if (msg.type === 'answer') {
                    const entryDiv = document.createElement('div');
                    entryDiv.className = 'lumina-entry';
                    entryDiv.dataset.entryId = msg.metadata?.entryId || ('entry-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9));
                    entryDiv.dataset.entryType = msg.metadata?.entryType || 'qa';
                    if (msg.metadata?.webSearch) {
                        const stepperHTML = this.createCompletedStepperHTML(msg.metadata.webSearch.query, msg.metadata.webSearch.sourcesCount);
                        const stepperContainer = document.createElement('div');
                        stepperContainer.innerHTML = stepperHTML.trim();
                        entryDiv.appendChild(stepperContainer.firstChild);
                    }
                    const answerDiv = document.createElement('div');
                    answerDiv.className = 'lumina-chat-answer';
                    answerDiv.setAttribute('data-raw-text', msg.content);
                    let displayContent = msg.content.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').trim();
                    displayContent = displayContent.replace(/<lumina-canvas-create\s+name="([^"]+)"\s+type="([^"]+)">[\s\S]*?(?:<\/lumina-canvas-create>|$)/gi, (match, name, type) => {
                        const timeStr = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                        const displayType = type.replace('code/', '').toUpperCase();
                        return `<div class="lumina-canvas-card" data-canvas-name="${name.replace(/"/g, '&quot;')}" data-canvas-type="${type}">
      <div class="lumina-canvas-card-left">
        <div class="lumina-canvas-card-info">
          <div class="lumina-canvas-card-title">${name}</div>
          <div class="lumina-canvas-card-meta">${displayType} • ${timeStr}</div>
        </div>
      </div>
    </div>`;
                    });
                    displayContent = displayContent.replace(/<lumina-canvas-update\s+name="([^"]+)">[\s\S]*?(?:<\/lumina-canvas-update>|$)/gi, (match, name) => {
                        return `*🔄 Canvas Updated: **${name}***`;
                    });
                    displayContent = displayContent.replace(/<lumina-canvas-comment\s+name="([^"]+)">[\s\S]*?(?:<\/lumina-canvas-comment>|$)/gi, (match, name) => {
                        return `*💬 Canvas Comment Added: **${name}***`;
                    });
                    if (displayContent.trim().startsWith('<') && !displayContent.trim().startsWith('<div class="lumina-canvas-card"')) {
                        answerDiv.innerHTML = displayContent;
                    } else if (typeof marked !== 'undefined') {
                        let c = displayContent;
                        c = c.replace(/!\[([^\]]*)\]\((image-search:\/\/[^)]*)\)/g, (match, alt, url) => {
                            return `![${alt}](${url.replace(/ /g, '%20')})`;
                        });
                        answerDiv.innerHTML = marked.parse(c);
                    } else {
                        answerDiv.textContent = displayContent;
                    }
                    answerDiv.querySelectorAll('a').forEach(link => {
                        link.target = '_blank';
                        link.rel = 'noopener noreferrer';
                    });
                    if (typeof LuminaChatUI !== 'undefined') {
                        processPromises.push(LuminaChatUI.processContainer(answerDiv));
                    }
                    if (chatData.sparkId && sparksMap[chatData.sparkId]) {
                        const spark = sparksMap[chatData.sparkId];
                        const headerDiv = document.createElement('div');
                        headerDiv.className = 'lumina-spark-message-header';
                        const nameSpan = document.createElement('span');
                        nameSpan.className = 'lumina-spark-name';
                        nameSpan.textContent = spark.name;
                        const sepSpan = document.createElement('span');
                        sepSpan.className = 'lumina-spark-separator';
                        sepSpan.textContent = ' • ';
                        const typeSpan = document.createElement('span');
                        typeSpan.className = 'lumina-spark-type';
                        typeSpan.textContent = 'Custom Spark';
                        headerDiv.appendChild(nameSpan);
                        headerDiv.appendChild(sepSpan);
                        headerDiv.appendChild(typeSpan);
                        answerDiv.insertBefore(headerDiv, answerDiv.firstChild);
                    }
                    entryDiv.appendChild(answerDiv);
                    targetContainer.appendChild(entryDiv);
                }
                i++;
            }
        };

        const qaGroups = [];
        let index = 0;
        while (index < chatData.messages.length) {
            const group = [];
            const msg = chatData.messages[index];
            if (msg.type === 'context' && index + 1 < chatData.messages.length) {
                if (chatData.messages[index + 1].type === 'question') {
                    group.push({ msg: chatData.messages[index], originalIndex: index });
                    index++;
                }
            }
            group.push({ msg: chatData.messages[index], originalIndex: index });
            index++;
            if (index < chatData.messages.length && chatData.messages[index].type === 'answer') {
                group.push({ msg: chatData.messages[index], originalIndex: index });
                index++;
            }
            qaGroups.push(group);
        }

        const bypassPagination = targetIndex !== null || qaGroups.length <= 10;

        if (bypassPagination) {
            for (const group of qaGroups) {
                if (history.__activeRestoreId !== restoreId) return;
                await renderGroup(group, history);
            }
        } else {
            const initialPageSize = 10;
            const initialGroups = qaGroups.slice(-initialPageSize);
            const remainingGroups = qaGroups.slice(0, -initialPageSize);
            
            historyContainer.__remainingGroups = remainingGroups;
            
            const loadMoreDiv = document.createElement('div');
            loadMoreDiv.className = 'lumina-load-more-history';
            loadMoreDiv.innerHTML = `
                <svg class="lumina-load-more-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width: 12px; height: 12px; margin-right: 6px; display: none; animation: spin 1s linear infinite;"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
                <span>Load older messages (${remainingGroups.length} remaining)</span>
            `;
            if (history.__activeRestoreId !== restoreId) return;
            history.appendChild(loadMoreDiv);
            
            for (const group of initialGroups) {
                if (history.__activeRestoreId !== restoreId) return;
                await renderGroup(group, history);
            }

            const loadNextChunk = async () => {
                if (loadMoreDiv.dataset.loading === 'true') return;
                loadMoreDiv.dataset.loading = 'true';
                const spinner = loadMoreDiv.querySelector('.lumina-load-more-spinner');
                if (spinner) spinner.style.display = 'block';
                
                const remaining = historyContainer.__remainingGroups || [];
                if (remaining.length === 0) {
                    loadMoreDiv.remove();
                    return;
                }
                
                const chunkSize = 15;
                const chunk = remaining.slice(-chunkSize);
                historyContainer.__remainingGroups = remaining.slice(0, -chunkSize);
                
                const oldScrollHeight = historyContainer.scrollHeight;
                const oldScrollTop = historyContainer.scrollTop;
                
                const fragment = document.createDocumentFragment();
                for (const group of chunk) {
                    await renderGroup(group, fragment);
                }
                
                if (loadMoreDiv.nextSibling) {
                    history.insertBefore(fragment, loadMoreDiv.nextSibling);
                } else {
                    history.appendChild(fragment);
                }
                
                const newScrollHeight = historyContainer.scrollHeight;
                historyContainer.scrollTop = (newScrollHeight - oldScrollHeight) + oldScrollTop;
                
                if (spinner) spinner.style.display = 'none';
                loadMoreDiv.dataset.loading = 'false';
                
                const textSpan = loadMoreDiv.querySelector('span');
                if (textSpan) {
                    textSpan.textContent = `Load older messages (${historyContainer.__remainingGroups.length} remaining)`;
                }
                
                if (historyContainer.__remainingGroups.length === 0) {
                    loadMoreObserver.disconnect();
                    loadMoreDiv.remove();
                }
            };

            const loadMoreObserver = new IntersectionObserver(async (entries) => {
                if (entries[0].isIntersecting) {
                    await loadNextChunk();
                }
            }, { root: historyContainer, threshold: 0.1 });
            
            loadMoreObserver.observe(loadMoreDiv);
            loadMoreDiv.addEventListener('click', loadNextChunk);
        }

        const hasEntries = history.querySelector('.lumina-entry');
        const regenBtn = document.getElementById('lumina-regenerate-btn') ||
            document.querySelector('.lumina-regenerate-btn');

        if (processPromises.length > 0) {
            if (historyContainer) {
                historyContainer.__processingPromises = processPromises;
            }
            await Promise.all(processPromises);
        }

        if (regenBtn) {
            regenBtn.style.display = hasEntries ? 'flex' : 'none';
        }

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
    async getAllHistories() {
        return await LuminaChatDB.getAllSessions();
    },
    async deleteSessionWithAttachments(sessionId) {
        try {
            const messages = await LuminaChatDB.getMessages(sessionId);
            if (Array.isArray(messages)) {
                for (const msg of messages) {
                    const files = msg.files || msg.images;
                    if (Array.isArray(files)) {
                        for (const file of files) {
                            if (file && file.attachmentId) {
                                try {
                                    await LuminaAttachmentDB.delete(file.attachmentId);
                                } catch (e) {
                                    console.error('Failed to delete attachment from DB:', file.attachmentId, e);
                                }
                            }
                        }
                    }
                }
            }
        } catch (e) {
            console.error('Error fetching messages for attachment cleanup:', e);
        }
        await LuminaChatDB.deleteSession(sessionId);
    },
    async deleteChat(sessionId) {
        try {
            await this.deleteSessionWithAttachments(sessionId);
            chrome.runtime.sendMessage({ action: 'get_stored_files' }, (response) => {
                if (response && response.success && Array.isArray(response.files)) {
                    const sessionFiles = response.files.filter(f => f.sessionId === sessionId);
                    sessionFiles.forEach(sf => {
                        chrome.runtime.sendMessage({ action: 'delete_stored_file', fileName: sf.rawName });
                    });
                }
            });
            chrome.runtime.sendMessage({ action: 'lumina_sessions_deleted', deletedIds: [sessionId] }).catch(() => {});
            chrome.runtime.sendMessage({ action: 'lumina_sessions_index_updated' }).catch(() => {});
            return true;
        } catch (error) {
            console.error('Failed to delete chat history:', error);
            return false;
        }
    },
    async renameChat(sessionId, newTitle) {
        try {
            const meta = await LuminaChatDB.getSession(sessionId);
            if (meta) {
                meta.title = newTitle;
                meta.isRenamed = true;
                meta.updatedAt = Date.now();
                await LuminaChatDB.putSession(meta);
                chrome.runtime.sendMessage({ action: 'lumina_sessions_index_updated' }).catch(() => {});
                return true;
            }
            return false;
        } catch (error) {
            console.error('Failed to rename chat history:', error);
            return false;
        }
    },
    async duplicateChat(sessionId) {
        try {
            const sourceMeta = await LuminaChatDB.getSession(sessionId);
            if (sourceMeta) {
                const newSessionId = this.generateSessionId();
                const messages = await LuminaChatDB.getMessages(sessionId) || [];
                await LuminaChatDB.putMessages(newSessionId, messages);
                const timestamp = Date.now();
                const newMeta = {
                    ...sourceMeta,
                    id: newSessionId,
                    title: sourceMeta.title + ' (Copy)',
                    createdAt: timestamp,
                    updatedAt: timestamp
                };
                await LuminaChatDB.putSession(newMeta);
                chrome.runtime.sendMessage({ action: 'lumina_sessions_index_updated' }).catch(() => {});
                return newSessionId;
            }
            return null;
        } catch (error) {
            console.error('Failed to duplicate chat history:', error);
            return null;
        }
    },
    async getStorageUsage() {
        try {
            return await LuminaChatDB.getStorageUsage();
        } catch (error) {
            console.error('Error calculating chat storage:', error);
            return 0;
        }
    },
    async clearAllHistory() {
        try {
            await LuminaChatDB.clearAll();
            chrome.runtime.sendMessage({ action: 'get_stored_files' }, (response) => {
                if (response && response.success && Array.isArray(response.files)) {
                    response.files.forEach(sf => {
                        chrome.runtime.sendMessage({ action: 'delete_stored_file', fileName: sf.rawName });
                    });
                }
            });
            if (typeof LuminaAttachmentDB !== 'undefined' && LuminaAttachmentDB.clear) {
                await LuminaAttachmentDB.clear().catch(err => console.error('Failed to clear LuminaAttachmentDB', err));
            }
            chrome.runtime.sendMessage({ action: 'lumina_sessions_index_updated' }).catch(() => {});
            return true;
        } catch (error) {
            console.error('Failed to clear chat history:', error);
            return false;
        }
    },
    startNewSession() {
        this.currentSessionId = this.generateSessionId();
    },
    async migrateIfNeeded() {
        return;
    },
    async cleanupHistoryByAge() {
        try {
            const settings = await chrome.storage.local.get(['historyRetentionMonths']);
            const months = settings.historyRetentionMonths !== undefined ? parseFloat(settings.historyRetentionMonths) : 3;
            if (months === 0) return;
            const retentionMs = months * 30 * 24 * 60 * 60 * 1000;
            const cutoffTime = Date.now() - retentionMs;
            
            const sessions = await LuminaChatDB.getAllSessions();
            const deletedSessionIds = [];
            for (const [id, session] of Object.entries(sessions)) {
                const sessionTime = session.updatedAt || session.createdAt || 0;
                if (sessionTime < cutoffTime) {
                    deletedSessionIds.push(id);
                    await this.deleteSessionWithAttachments(id);
                }
            }
            if (deletedSessionIds.length > 0) {
                console.log(`[Lumina History] Retention policy (${months} months) reached. Deleting ${deletedSessionIds.length} old chat sessions from DB:`, deletedSessionIds);
                chrome.runtime.sendMessage({ action: 'cleanup_opfs_files' });
                chrome.runtime.sendMessage({ action: 'lumina_sessions_index_updated' }).catch(() => {});
            }
        } catch (error) {
            console.error('[Lumina History] Error cleaning up history by age:', error);
        }
    },

    async getSessionMessages(sessionId) {
        return await LuminaChatDB.getMessages(sessionId) || [];
    },

    async saveSessionMessages(sessionId, messages) {
        return await LuminaChatDB.putMessages(sessionId, messages);
    }
};

if (typeof window !== 'undefined' && window.location.protocol === 'chrome-extension:') {
    ChatHistoryManager.cleanupHistoryByAge();
}

if (typeof window !== 'undefined') {
    window.ChatHistoryManager = ChatHistoryManager;
}
