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
            const sessionKey = `lumina_session_${activeSessionId}`;
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
                        images: Array.isArray(msg.images) ? msg.images.map(cleanItem) : msg.images,
                        files: Array.isArray(msg.files) ? msg.files.map(cleanItem) : msg.files
                    };
                }
                return msg;
            });
            await chrome.storage.local.set({ [sessionKey]: optimizedMessages });
            const result = await chrome.storage.local.get([this.STORAGE_KEY]);
            let sessions = result[this.STORAGE_KEY] || {};
            const existingSession = sessions[activeSessionId] || {};
            const isRenamed = existingSession.isRenamed || false;
            const autoNamed = existingSession.autoNamed || false;
            const finalTitle = (isRenamed || autoNamed) ? existingSession.title : title;
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
            sessions[activeSessionId] = {
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
            let sortedIds = Object.keys(sessions)
                .sort((a, b) => (sessions[b].updatedAt || 0) - (sessions[a].updatedAt || 0));
            if (sortedIds.length > this.MAX_HISTORIES) {
                const deletedIds = sortedIds.slice(this.MAX_HISTORIES);
                deletedIds.forEach(id => delete sessions[id]);
                const contentKeys = [];
                deletedIds.forEach(id => {
                    contentKeys.push(`lumina_session_${id}`);
                    contentKeys.push(`lumina_history_${id}`);
                });
                await chrome.storage.local.remove(contentKeys);
            }
            await chrome.storage.local.set({ [this.STORAGE_KEY]: sessions });
        } catch (error) {
            console.error('Failed to save chat history:', error);
        }
    },
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
    extractMessages(historyElement) {
        const messages = [];
        for (const child of historyElement.children) {
            if (!child.classList.contains('lumina-entry')) continue;
            const entryType = child.dataset.entryType;
            const fromCache = child.dataset.fromCache === 'true';
            const timestamp = parseInt(child.dataset.timestamp) || Date.now();
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
                    html: child.innerHTML,
                    isPreSplit: child.dataset.isPreSplit === 'true',
                    timestamp,
                    metadata: { entryType: entryType || 'translation', fromCache }
                });
                continue;
            }
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
    },
    generateChatTitle(historyElement) {
        const allEntries = Array.from(historyElement.querySelectorAll('.lumina-entry'));
        if (allEntries.length === 0) return 'New Chat';
        for (let i = allEntries.length - 1; i >= 0; i--) {
            const entry = allEntries[i];
            const translationSource = entry.querySelector('.lumina-translation-source');
            if (translationSource) {
                return translationSource.dataset.copyText || translationSource.textContent.trim();
            }
            const questionEl = entry.querySelector('.lumina-chat-question');
            if (questionEl) {
                return questionEl.dataset.rawText || questionEl.textContent.trim();
            }
        }
        return 'New Chat';
    },
    async loadChat(sessionId) {
        try {
            const result = await chrome.storage.local.get([this.STORAGE_KEY]);
            const sessions = result[this.STORAGE_KEY] || {};
            const chatMeta = sessions[sessionId];
            if (chatMeta) {
                this.currentSessionId = sessionId;
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
                entryDiv.className = 'lumina-entry';
                entryDiv.dataset.entryId = msg.metadata?.entryId || ('entry-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9));
                entryDiv.dataset.entryType = msg.metadata?.entryType || 'qa';
                if (msg.timestamp) entryDiv.dataset.timestamp = String(msg.timestamp);
                const questionDiv = document.createElement('div');
                questionDiv.className = 'lumina-chat-question';
                questionDiv.dataset.messageIndex = i;
                questionDiv.dataset.entryType = entryDiv.dataset.entryType;
                questionDiv.dataset.rawText = msg.content;
                if (msg.files) questionDiv.dataset.files = JSON.stringify(msg.files);
                const visibleImages = Array.isArray(msg.images)
                    ? msg.images.filter((item) => {
                        if (typeof item === 'string') return true;
                        if (!item || typeof item !== 'object') return false;
                        return !item.hiddenInPreview && !item.parentAttachmentId;
                    })
                    : [];
                if (visibleImages.length > 0) {
                    questionDiv._luminaImages = visibleImages;
                    entryDiv._luminaImages = visibleImages;
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
                    const hydratePromises = [];
                    visibleImages.forEach(item => {
                        if (item && item.attachmentId) {
                            const p = LuminaAttachmentDB.get(item.attachmentId).then(async (blob) => {
                                if (blob) {
                                    const dataUrl = await LuminaAttachmentDB.blobToDataURL(blob);
                                    if (dataUrl) {
                                        item.dataUrl = dataUrl;
                                    }
                                }
                            }).catch(err => console.error('Failed to restore message image dataUrl', err));
                            hydratePromises.push(p);
                        }
                    });
                    if (hydratePromises.length > 0) {
                        Promise.all(hydratePromises).then(() => {
                            questionDiv.dataset.images = JSON.stringify({
                                compact: true,
                                count: visibleImages.length,
                                files: visibleImages
                            });
                        });
                    }
                    const filesDiv = document.createElement('div');
                    filesDiv.className = 'lumina-chat-question-files';
                    visibleImages.forEach(item => {
                        if (typeof item === 'object') {
                            const isImage = item.isImage || (item.mimeType && item.mimeType.startsWith('image/'));
                            const rawSrc = item.dataUrl || item.previewUrl || (item.mimeType && item.data ? `data:${item.mimeType};base64,${item.data}` : '');
                            const src = isImage ? (rawSrc.startsWith('data:') ? rawSrc : resolveImagePreviewSrc(item, rawSrc)) : rawSrc;
                            if (isImage) {
                                const img = document.createElement('img');
                                img.src = src;
                                if (item.attachmentId) {
                                    img.dataset.attachmentId = item.attachmentId;
                                    LuminaAttachmentDB.get(item.attachmentId).then(blob => {
                                        if (blob) {
                                            const objectUrl = URL.createObjectURL(blob);
                                            img.src = objectUrl;
                                            img.onclick = (e) => {
                                                e.stopPropagation();
                                                if (typeof LuminaChatUI !== 'undefined' && typeof activeTabIndex !== 'undefined' && typeof tabs !== 'undefined') {
                                                    const tab = tabs[activeTabIndex];
                                                    if (tab && tab.chatUIInstance) {
                                                        tab.chatUIInstance.showImagePreview(objectUrl, img.alt);
                                                    }
                                                }
                                            };
                                        }
                                    }).catch(err => {
                                        console.error('Failed to restore attachment', err);
                                    });
                                }
                                if (item.name) img.alt = item.name;
                                img.className = 'lumina-clickable-image';
                                filesDiv.appendChild(img);
                            } else {
                                const fileName = item.name || 'File';
                                const displayName = typeof LuminaChatUI !== 'undefined' ? LuminaChatUI.getDisplayFileName(fileName) : fileName;
                                const category = typeof LuminaChatUI !== 'undefined' ? LuminaChatUI.inferFileCategory(item) : 'file';
                                const icon = typeof LuminaChatUI !== 'undefined' ? LuminaChatUI.getFileIconByCategory(category) : '';
                                const typeLabel = typeof LuminaChatUI !== 'undefined' ? LuminaChatUI.getFileTypeLabel(item) : 'FILE';
                                const fileChip = document.createElement('div');
                                fileChip.className = 'lumina-preview-item is-file lumina-question-file-chip';
                                fileChip.title = fileName;
                                fileChip.innerHTML = `<div class="lumina-file-preview-info"><span class="lumina-file-name">${escapeHTMLAttr(displayName || fileName)}</span><div class="lumina-file-meta-row"><span class="lumina-file-icon-inline file-${category}">${icon}</span><span class="lumina-file-size-tag">${escapeHTMLAttr(typeLabel)}</span></div></div>`;
                                filesDiv.appendChild(fileChip);
                            }
                        } else if (typeof item === 'string') {
                            const src = item.startsWith('data:') ? item : resolveImagePreviewSrc(null, item);
                            const img = document.createElement('img');
                            img.src = src;
                            img.className = 'lumina-clickable-image';
                            filesDiv.appendChild(img);
                        }
                    });
                    entryDiv.appendChild(filesDiv);
                }
                const cleanMsgContent = msg.content.trim();
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
                if (typeof LuminaChatUI !== 'undefined' && typeof LuminaChatUI.injectQuestionActions === 'function') {
                    LuminaChatUI.injectQuestionActions(questionDiv);
                }
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
                                        const idx = parseInt(num) - 1;
                                        if (sources[idx]) return `<a href="${sources[idx].link}" target="_blank" rel="noopener noreferrer" class="lumina-citation">${num}</a>`;
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
                                    const idx = parseInt(num) - 1;
                                    if (sources[idx]) return `<a href="${sources[idx].link}" target="_blank" rel="noopener noreferrer" class="lumina-citation">${num}</a>`;
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
                history.appendChild(entryDiv);
                if (typeof attachQuestionListeners === 'function') attachQuestionListeners(questionDiv.querySelector('[contenteditable]'));
                continue;
            }
            if (msg.type === 'answer') {
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
                history.appendChild(entryDiv);
                i++;
                continue;
            }

            if (msg.type === 'translation') {
                const entryDiv = document.createElement('div');
                entryDiv.className = 'lumina-entry';
                entryDiv.dataset.entryId = msg.metadata?.entryId || ('entry-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9));
                entryDiv.dataset.entryType = msg.metadata?.entryType || msg.type;
                if (msg.timestamp) entryDiv.dataset.timestamp = String(msg.timestamp);
                if (msg.html) {
                    entryDiv.innerHTML = msg.html;
                    if (msg.isPreSplit) {
                        entryDiv.dataset.isPreSplit = 'true';
                    }
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
                    `;
                    const sEl = entryDiv.querySelector('.lumina-translation-source .lumina-translation-text');
                    const tEl = entryDiv.querySelector('.lumina-translation-target .lumina-translation-text');
                    if (sEl) sEl.textContent = sourceText;
                    if (tEl) tEl.textContent = targetText;
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
        try {
            const result = await chrome.storage.local.get([this.STORAGE_KEY]);
            return result[this.STORAGE_KEY] || [];
        } catch (error) {
            console.error('Failed to get chat histories:', error);
            return [];
        }
    },

    async deleteChat(sessionId) {
        try {
            const result = await chrome.storage.local.get([this.STORAGE_KEY]);
            let histories = result[this.STORAGE_KEY] || {};
            delete histories[sessionId];
            await chrome.storage.local.set({ [this.STORAGE_KEY]: histories });
            await chrome.storage.local.remove([`lumina_session_${sessionId}`, `lumina_history_${sessionId}`]);
            chrome.runtime.sendMessage({ action: 'get_stored_files' }, (response) => {
                if (response && response.success && Array.isArray(response.files)) {
                    const sessionFiles = response.files.filter(f => f.sessionId === sessionId);
                    sessionFiles.forEach(sf => {
                        chrome.runtime.sendMessage({ action: 'delete_stored_file', fileName: sf.rawName });
                    });
                }
            });
            return true;
        } catch (error) {
            console.error('Failed to delete chat history:', error);
            return false;
        }
    },

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

    async getStorageUsage() {
        try {
            const allStorage = await chrome.storage.local.get(null);
            let totalBytes = 0;
            Object.keys(allStorage).forEach(key => {
                const isChatKey = key === this.STORAGE_KEY ||
                    key.startsWith('lumina_session_') ||
                    key === 'lumina_tabs' ||
                    key === 'lumina_tab_counter';
                if (isChatKey) {
                    const valueStr = JSON.stringify(allStorage[key]);
                    totalBytes += valueStr.length % 2 === 0 ? valueStr.length * 2 : valueStr.length * 2;
                }
            });
            return totalBytes;
        } catch (error) {
            console.error('Error calculating chat storage:', error);
            return 0;
        }
    },

    async clearAllHistory() {
        try {
            const allStorage = await chrome.storage.local.get(null);
            const keysToDelete = Object.keys(allStorage).filter(key =>
                key === this.STORAGE_KEY ||
                key.startsWith('lumina_session_') ||
                key.startsWith('lumina_history_') ||
                key === 'lumina_tabs' ||
                key === 'lumina_tab_counter'
            );
            if (keysToDelete.length > 0) {
                await chrome.storage.local.remove(keysToDelete);
            } else {
                await chrome.storage.local.set({ [this.STORAGE_KEY]: {} });
            }
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
                await chrome.storage.local.remove([this.LEGACY_KEY, this.TEMP_POPUP_KEY]);
                console.log('[History] Migration complete. Total sessions:', Object.keys(sessions).length);
            }
        } catch (e) {
            console.error('[History] Migration error:', e);
        }
    },

    async cleanupHistoryByAge() {
        try {
            const settings = await chrome.storage.local.get(['historyRetentionMonths']);
            const months = settings.historyRetentionMonths !== undefined ? parseFloat(settings.historyRetentionMonths) : 3;
            if (months === 0) return;
            const retentionMs = months * 30 * 24 * 60 * 60 * 1000;
            const cutoffTime = Date.now() - retentionMs;
            const result = await chrome.storage.local.get([this.STORAGE_KEY]);
            let sessions = result[this.STORAGE_KEY] || {};
            const deletedSessionIds = [];
            Object.entries(sessions).forEach(([id, session]) => {
                const sessionTime = session.updatedAt || session.createdAt || 0;
                if (sessionTime < cutoffTime) {
                    deletedSessionIds.push(id);
                    delete sessions[id];
                }
            });
            if (deletedSessionIds.length > 0) {
                console.log(`[Lumina History] Retention policy (${months} months) reached. Deleting ${deletedSessionIds.length} old chat sessions:`, deletedSessionIds);
                await chrome.storage.local.set({ [this.STORAGE_KEY]: sessions });
                const sessionKeys = [];
                deletedSessionIds.forEach(id => {
                    sessionKeys.push(`lumina_session_${id}`);
                    sessionKeys.push(`lumina_history_${id}`);
                });
                await chrome.storage.local.remove(sessionKeys);
                chrome.runtime.sendMessage({ action: 'cleanup_opfs_files' });
            }
        } catch (error) {
            console.error('[Lumina History] Error cleaning up history by age:', error);
        }
    }
};

if (typeof window !== 'undefined' && window.location.protocol === 'chrome-extension:') {
    ChatHistoryManager.migrateIfNeeded().then(async () => {
        await ChatHistoryManager.cleanupHistoryByAge();
    });
}

if (typeof window !== 'undefined') {
    window.ChatHistoryManager = ChatHistoryManager;
}
