import { NexusChatDB } from './chat_db.js';
import { NexusAttachmentDB } from './attachment_db.js';
import { escapeHTMLAttr, createObjectUrlFromDataUrl, resolveImagePreviewSrc, reconstructGroups } from './chat_render_utils.js';
import { CanvasService } from '../components/canvas/canvas_service.js';
export { escapeHTMLAttr, createObjectUrlFromDataUrl, resolveImagePreviewSrc, reconstructGroups };




export const ChatHistoryManager = {
    STORAGE_KEY: 'nexus_chat_sessions',
    LEGACY_KEY: 'chat_history',
    TEMP_POPUP_KEY: 'nexus_popup_sessions',
    MAX_HISTORIES: 999,
    RETENTION_DAYS: 180,
    currentSessionId: null,
    generateSessionId() {
        return `${Date.now()}_${Math.random().toString(36).substr(2, 7)}`;
    },
    async saveCurrentChat(historyEl = null, optionalSessionId = null, sparkId = null, force = false, extraSettings = null, suppressBroadcast = false) {
        if (!historyEl && typeof currentPopup !== 'undefined' && currentPopup) {
            historyEl = currentPopup.querySelector('.nexus-chat-history');
        }
        if (!historyEl) return;
        const now = Date.now();
        if (!force && this._lastSaveTime && (now - this._lastSaveTime < 500)) {
            if (this._saveTimeout) clearTimeout(this._saveTimeout);
            this._saveTimeout = setTimeout(() => this.saveCurrentChat(historyEl, optionalSessionId, sparkId, force, extraSettings, suppressBroadcast), 500);
            return;
        }
        this._lastSaveTime = now;
        if (this._saveTimeout) clearTimeout(this._saveTimeout);
        if (optionalSessionId && historyEl.dataset.sessionId && historyEl.dataset.sessionId !== optionalSessionId) {
            return;
        }
        const history = historyEl;
        if (!history || history.children.length === 0) return;
        const messages = this.extractMessages(history);
        if (messages.length === 0) {
            return;
        }
        let activeSessionId = optionalSessionId || (history && history.dataset && history.dataset.sessionId) || this.currentSessionId;
        if (!activeSessionId) {
            activeSessionId = this.generateSessionId();
        }
        this.currentSessionId = activeSessionId;
        if (history && !history.dataset.sessionId) {
            history.dataset.sessionId = activeSessionId;
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
            
            await NexusChatDB.putMessages(activeSessionId, optimizedMessages);
            
            const existingSession = await NexusChatDB.getSession(activeSessionId) || {};
            const isRenamed = existingSession.isRenamed || false;
            const autoNamed = existingSession.autoNamed || false;
            const finalTitle = (isRenamed || autoNamed) ? existingSession.title : title;
            const questions = messages
                .map((m, idx) => ({ ...m, originalIndex: idx }))
                .filter(m => m.type === 'question')
                .map(m => {
                    const nextAnswer = messages.slice(m.originalIndex + 1).find(msg => msg.type === 'answer');
                    const answerSummary = nextAnswer ? String(nextAnswer.content || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 100) : '';
                    const rawText = String(m.content || '');
                    const truncatedText = rawText.length > 500 ? rawText.substring(0, 500) + '...' : rawText;
                    return {
                        text: truncatedText,
                        index: m.originalIndex,
                        snippet: answerSummary,
                        timestamp: m.timestamp
                    };
                });
            let fullSearchText = questions.map(q => q.text).join(' ').replace(/\s+/g, ' ');
            if (fullSearchText.length > 2000) {
                fullSearchText = fullSearchText.substring(0, 2000);
            }
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
                thinkingLevel: (extraSettings && extraSettings.thinkingLevel) || existingSession.thinkingLevel || null,
                archived: existingSession.archived || false
            };
            
            await NexusChatDB.putSession(sessionMeta);

            if (sparkId) {
                const finalModel = (extraSettings && extraSettings.selectedModel) || existingSession.selectedModel || null;
                const finalThinking = (extraSettings && extraSettings.thinkingLevel) || existingSession.thinkingLevel || null;
                if (finalModel || finalThinking) {
                    const settingsRes = await chrome.storage.local.get(['nexus_spark_last_settings']);
                    const sparkSettings = settingsRes.nexus_spark_last_settings || {};
                    sparkSettings[sparkId] = {
                        selectedModel: finalModel,
                        thinkingLevel: finalThinking
                    };
                    await chrome.storage.local.set({ nexus_spark_last_settings: sparkSettings });
                }
            }
            
            if (typeof window !== 'undefined') {
                window._localSavedSessions = window._localSavedSessions || {};
                window._localSavedSessions[activeSessionId] = Date.now();
            }
            
            const senderInstanceId = (typeof window !== 'undefined' && window._nexusWindowInstanceId) ? window._nexusWindowInstanceId : null;
            if (!suppressBroadcast) {
                chrome.runtime.sendMessage({ action: 'nexus_session_updated', sessionId: activeSessionId, source: 'local_save', senderInstanceId }).catch(() => {});
            }
            chrome.runtime.sendMessage({ action: 'nexus_sessions_index_updated', senderInstanceId }).catch(() => {});
        } catch (error) {
            console.error('Failed to save chat history:', error);
        }
    },
    
    createCompletedStepperHTML(query, sourcesCount) {
        const checkIcon = '<svg class="nexus-step-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>';
        return `
            <div class="nexus-completed-step">
                ${checkIcon}
                <span class="nexus-step-text">Searched for: <strong>"${query}"</strong> (${sourcesCount} sources)</span>
            </div>
        `;
    },

    extractMessages(historyElement) {
        const messages = [];
        for (const child of historyElement.children) {
            if (!child.classList.contains('nexus-entry')) continue;
            const entryType = child.dataset.entryType;
            const fromCache = child.dataset.fromCache === 'true';
            const timestamp = parseInt(child.dataset.timestamp) || Date.now();
            const questionEl = child.querySelector('.nexus-chat-question');
            const versionsContainer = child.querySelector('.nexus-answer-versions');
            const answerEl = child.querySelector('.nexus-chat-answer');
            if (questionEl) {
                let serializedImages = Array.isArray(questionEl._nexusImages) ? questionEl._nexusImages :
                    (Array.isArray(child._nexusImages) ? child._nexusImages : null);
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
                    content: questionEl.getAttribute('data-raw-text') || questionEl.textContent.trim(),
                    files: serializedImages,
                    timestamp,
                    metadata: { fromCache }
                });
            }
            if (versionsContainer) {
                const versions = Array.from(versionsContainer.querySelectorAll('.nexus-answer-version'));
                const activeVersion = versionsContainer.querySelector('.nexus-answer-version.active');
                const activeIndex = activeVersion ? parseInt(activeVersion.dataset.versionIndex) || 0 : 0;
                const versionContents = versions.map(v => {
                    const ans = v.querySelector('.nexus-chat-answer');
                    return ans ? (ans.getAttribute('data-raw-text') || ans.innerHTML) : '';
                });
                const versionModifiers = versions.map((v) => v.dataset.modifierLabel || 'Normal');
                const activeAnswerEl = activeVersion ? activeVersion.querySelector('.nexus-chat-answer') : (versions[0] ? versions[0].querySelector('.nexus-chat-answer') : null);
                const webSearchData = activeAnswerEl?.dataset.webSearch ? JSON.parse(activeAnswerEl.dataset.webSearch) : null;
                messages.push({
                    type: 'answer',
                    content: versionContents[activeIndex] || versionContents[0] || '',
                    versions: versionContents,
                    versionModifiers: versionModifiers,
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
        const allEntries = Array.from(historyElement.querySelectorAll('.nexus-entry'));
        if (allEntries.length === 0) return 'New Chat';
        for (let i = allEntries.length - 1; i >= 0; i--) {
            const entry = allEntries[i];
            const questionEl = entry.querySelector('.nexus-chat-question');
            if (questionEl) {
                return questionEl.getAttribute('data-raw-text') || questionEl.textContent.trim();
            }
        }
        return 'New Chat';
    },
    async loadChat(sessionId) {
        try {
            const chatMeta = await NexusChatDB.getSession(sessionId);
            if (chatMeta) {
                this.currentSessionId = sessionId;
                const messages = await NexusChatDB.getMessages(sessionId) || [];
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
        const history = historyContainer || currentPopup.querySelector('.nexus-chat-history');
        if (!history) return;
        
        const globalObj = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {});
        if (globalObj.NexusActiveBlobUrls && globalObj.NexusActiveBlobUrls.length > 0) {
            globalObj.NexusActiveBlobUrls.forEach(url => {
                try {
                    URL.revokeObjectURL(url);
                } catch (e) {}
            });
            globalObj.NexusActiveBlobUrls = [];
        }
        
        const restoreId = Math.random().toString(36).substr(2, 9);
        history.__activeRestoreId = restoreId;
        
        history.innerHTML = '';
        if (chatData.context) currentContext = chatData.context;
        
        let sparksMap = {};
        if (chatData.sparkId) {
            try {
                const sparksRes = await chrome.storage.local.get(['nexus_sparks']);
                sparksMap = sparksRes.nexus_sparks || {};
            } catch (e) {
                console.error('Failed to load sparks in restoreChat', e);
            }
        }
        
        const processPromises = [];
        
        if (typeof document !== 'undefined' && !document.getElementById('nexus-lazy-load-styles')) {
            const style = document.createElement('style');
            style.id = 'nexus-lazy-load-styles';
            style.textContent = `
                .nexus-load-more-history {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 8px 12px;
                    margin: 8px auto;
                    height: 32px;
                    color: var(--nexus-sidebar-text-muted);
                    font-size: 11px;
                    cursor: pointer;
                    user-select: none;
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
                const msg = (item && typeof item === 'object' && item.msg) ? item.msg : item;
                if (!msg || typeof msg !== 'object') {
                    i++;
                    continue;
                }
                const msgIdx = (item && typeof item === 'object' && item.originalIndex !== undefined) ? item.originalIndex : i;


                if (msg.type === 'question') {
                    const entryDiv = document.createElement('div');
                    entryDiv.className = 'nexus-entry';
                    entryDiv.dataset.entryId = msg.metadata?.entryId || ('entry-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9));
                    entryDiv.dataset.entryType = msg.metadata?.entryType || 'qa';
                    if (msg.timestamp) entryDiv.dataset.timestamp = String(msg.timestamp);

                    const questionDiv = document.createElement('div');
                    questionDiv.className = 'nexus-chat-question';
                    questionDiv.dataset.messageIndex = msgIdx;
                    questionDiv.dataset.entryType = entryDiv.dataset.entryType;
                    questionDiv.setAttribute('data-raw-text', msg.content);
                    if (msg.files) questionDiv.dataset.files = JSON.stringify(msg.files);

                    const visibleImages = Array.isArray(msg.files)
                        ? msg.files.filter((imgItem) => {
                            if (typeof imgItem === 'string') return true;
                            if (!imgItem || typeof imgItem !== 'object') return false;
                            return !imgItem.hiddenInPreview && !imgItem.parentAttachmentId;
                        })
                        : [];

                    if (visibleImages.length > 0) {
                        questionDiv._nexusImages = visibleImages;
                        entryDiv._nexusImages = visibleImages;
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
                        filesDiv.className = 'nexus-chat-question-files';
                        visibleImages.forEach(item => {
                            const isImage = item.isImage || (item.mimeType && item.mimeType.startsWith('image/'));
                            const rawSrc = item.objectUrl || item.dataUrl || item.previewUrl || (item.mimeType && item.data ? `data:${item.mimeType};base64,${item.data}` : '');
                            const src = isImage ? (rawSrc.startsWith('data:') || rawSrc.startsWith('blob:') ? rawSrc : (typeof NexusChatUI !== 'undefined' ? NexusChatUI._resolveImagePreviewSrc(item, rawSrc) : rawSrc)) : rawSrc;
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
                                    if (typeof NexusChatUI !== 'undefined') {
                                        NexusChatUI.showImagePreview(img.src, img.alt);
                                    }
                                });
                                filesDiv.appendChild(img);
                            } else {
                                const fileName = item.name || 'File';
                                const displayName = typeof NexusChatUI !== 'undefined' ? NexusChatUI.getDisplayFileName(fileName) : fileName;
                                const category = typeof NexusChatUI !== 'undefined' ? NexusChatUI.inferFileCategory(item) : 'other';
                                const icon = typeof NexusChatUI !== 'undefined' ? NexusChatUI.getFileIconByCategory(category) : '📄';
                                const typeLabel = typeof NexusChatUI !== 'undefined' ? NexusChatUI.getFileTypeLabel(item) : '';
                                const fileChip = document.createElement('div');
                                fileChip.className = 'nexus-preview-item is-file nexus-question-file-chip';
                                if (item.attachmentId) {
                                    fileChip.dataset.attachmentId = item.attachmentId;
                                }
                                fileChip.title = fileName;
                                fileChip.innerHTML = `<div class="nexus-file-preview-info"><span class="nexus-file-name">${displayName || fileName}</span><div class="nexus-file-meta-row"><span class="nexus-file-icon-inline file-${category}">${icon}</span><span class="nexus-file-size-tag">${typeLabel}</span></div></div>`;
                                filesDiv.appendChild(fileChip);
                            }
                        });
                        entryDiv.appendChild(filesDiv);

                        visibleImages.forEach(imgItem => {
                            if (imgItem && imgItem.attachmentId) {
                                NexusAttachmentDB.get(imgItem.attachmentId).then(async (blob) => {
                                    if (blob) {
                                        const dataUrl = await NexusAttachmentDB.blobToDataURL(blob);
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
                        questionDiv.innerHTML = `<div class="nexus-question-content">${tagContent} ${taglessText}</div>`;
                    } else {
                        questionDiv.innerHTML = `<div class="nexus-question-content">${cleanMsgContent}</div>`;
                    }

                    const row = document.createElement('div');
                    row.className = 'nexus-question-row';
                    row.appendChild(questionDiv);
                    entryDiv.appendChild(row);

                    if (typeof NexusChatUI !== 'undefined' && typeof NexusChatUI.injectQuestionActions === 'function') {
                        NexusChatUI.injectQuestionActions(questionDiv);
                    }

                    const nextItem = i + 1 < group.length ? group[i + 1] : null;
                    const nextMsg = (nextItem && typeof nextItem === 'object' && nextItem.msg) ? nextItem.msg : nextItem;
                    if (nextMsg && nextMsg.type === 'answer') {
                        const answerMsg = nextMsg;

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
                            versionsContainer.className = 'nexus-answer-versions';
                            const activeIndex = (typeof answerMsg.activeVersionIndex === 'number' && answerMsg.activeVersionIndex >= 0 && answerMsg.activeVersionIndex < answerMsg.versions.length)
                                ? answerMsg.activeVersionIndex
                                : (answerMsg.versions.length - 1);
                            answerMsg.versions.forEach((versionContent, idx) => {
                                const versionDiv = document.createElement('div');
                                versionDiv.className = 'nexus-answer-version' + (idx === activeIndex ? ' active' : '');
                                versionDiv.dataset.versionIndex = idx.toString();
                                versionDiv.dataset.modifierLabel = (answerMsg.versionModifiers && answerMsg.versionModifiers[idx]) ? answerMsg.versionModifiers[idx] : 'Normal';
                                const answerDiv = document.createElement('div');
                                answerDiv.className = 'nexus-chat-answer';
                                answerDiv.setAttribute('data-raw-text', versionContent);
                                const displayContent = versionContent.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').trim();
                                const isLmdxComponent = /^<(?:Sequence|Step|Timeline|TimelineEvent|GenerateWidget|ElicitationsGroup|Elicitation|FollowUp|Carousel|Image|WritingBlock|Option|Comparison|Aspect|Metrics|Metric|BentoGrid|BentoItem)/i.test(displayContent.trim());
                                const isRawHtml = displayContent.trim().startsWith('<') && !displayContent.trim().startsWith('<div class="nexus-canvas-card"') && !isLmdxComponent && /<\/[a-z0-9]+>$/i.test(displayContent.trim());

                                if (isRawHtml) {
                                    answerDiv.innerHTML = displayContent;
                                } else if (typeof marked !== 'undefined') {
                                    let content = displayContent;
                                    let html = marked.parse(content);
                                    if (answerMsg.metadata?.webSearch?.sources) {
                                        const sources = answerMsg.metadata.webSearch.sources;
                                        html = html.replace(/\[(\d+)\]/g, (match, num) => {
                                            const sIdx = parseInt(num) - 1;
                                            if (sources[sIdx]) return `<a href="${sources[sIdx].link}" target="_blank" rel="noopener noreferrer" class="nexus-citation">${num}</a>`;
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
                                if (typeof NexusChatUI !== 'undefined') {
                                    processPromises.push(NexusChatUI.processContainer(answerDiv));
                                }
                                if (chatData.sparkId && sparksMap[chatData.sparkId]) {
                                    const spark = sparksMap[chatData.sparkId];
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
                                    answerDiv.insertBefore(headerDiv, answerDiv.firstChild);
                                }
                                versionDiv.appendChild(answerDiv);
                                versionsContainer.appendChild(versionDiv);
                            });

                            entryDiv.appendChild(versionsContainer);
                        } else {
                            const answerDiv = document.createElement('div');
                            answerDiv.className = 'nexus-chat-answer';
                            answerDiv.setAttribute('data-raw-text', answerMsg.content);
                            const timeStr = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                            let displayContent = answerMsg.content.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').trim();
                            displayContent = CanvasService.cleanCanvasTagsFromMarkdown(displayContent, timeStr);
                            const isLmdxComponent = /^<(?:Sequence|Step|Timeline|TimelineEvent|GenerateWidget|ElicitationsGroup|Elicitation|FollowUp|Carousel|Image|WritingBlock|Option|Comparison|Aspect|Metrics|Metric|BentoGrid|BentoItem)/i.test(displayContent.trim());
                            const isRawHtml = displayContent.trim().startsWith('<') && !displayContent.trim().startsWith('<div class="nexus-canvas-card"') && !isLmdxComponent && /<\/[a-z0-9]+>$/i.test(displayContent.trim());

                            if (isRawHtml) {
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
                                        if (sources[sIdx]) return `<a href="${sources[sIdx].link}" target="_blank" rel="noopener noreferrer" class="nexus-citation">${num}</a>`;
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
                            if (typeof NexusChatUI !== 'undefined') {
                                processPromises.push(NexusChatUI.processContainer(answerDiv));
                            }
                            if (chatData.sparkId && sparksMap[chatData.sparkId]) {
                                const spark = sparksMap[chatData.sparkId];
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
                    entryDiv.className = 'nexus-entry';
                    entryDiv.dataset.entryId = msg.metadata?.entryId || ('entry-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9));
                    entryDiv.dataset.entryType = msg.metadata?.entryType || 'qa';
                    if (msg.metadata?.webSearch) {
                        const stepperHTML = this.createCompletedStepperHTML(msg.metadata.webSearch.query, msg.metadata.webSearch.sourcesCount);
                        const stepperContainer = document.createElement('div');
                        stepperContainer.innerHTML = stepperHTML.trim();
                        entryDiv.appendChild(stepperContainer.firstChild);
                    }
                    const answerDiv = document.createElement('div');
                    answerDiv.className = 'nexus-chat-answer';
                    answerDiv.setAttribute('data-raw-text', msg.content);
                    const timeStr = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                    let displayContent = msg.content.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').trim();
                    displayContent = CanvasService.cleanCanvasTagsFromMarkdown(displayContent, timeStr);
                    const isLmdxComponent = /^<(?:Sequence|Step|Timeline|TimelineEvent|GenerateWidget|ElicitationsGroup|Elicitation|FollowUp|Carousel|Image|WritingBlock|Option|Comparison|Aspect|Metrics|Metric|BentoGrid|BentoItem)/i.test(displayContent.trim());
                    const isRawHtml = displayContent.trim().startsWith('<') && !displayContent.trim().startsWith('<div class="nexus-canvas-card"') && !isLmdxComponent && /<\/[a-z0-9]+>$/i.test(displayContent.trim());

                    if (isRawHtml) {
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
                    if (typeof NexusChatUI !== 'undefined') {
                        processPromises.push(NexusChatUI.processContainer(answerDiv));
                    }
                    if (chatData.sparkId && sparksMap[chatData.sparkId]) {
                        const spark = sparksMap[chatData.sparkId];
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
                        answerDiv.insertBefore(headerDiv, answerDiv.firstChild);
                    }
                    entryDiv.appendChild(answerDiv);
                    targetContainer.appendChild(entryDiv);
                }
                i++;
            }
        };

        const qaGroups = reconstructGroups(chatData.messages);
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
            
            historyContainer.__remainingSessionId = chatData.sessionId;
            historyContainer.__loadedGroupsCount = initialPageSize;
            
            const loadMoreDiv = document.createElement('div');
            loadMoreDiv.className = 'nexus-load-more-history';
            loadMoreDiv.innerHTML = `
                <svg class="nexus-load-more-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width: 14px; height: 14px; animation: spin 0.8s linear infinite;"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
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
                const spinner = loadMoreDiv.querySelector('.nexus-load-more-spinner');
                if (spinner) spinner.style.display = 'block';
                
                const loadedCount = historyContainer.__loadedGroupsCount || 10;
                const allMessages = await NexusChatDB.getMessages(historyContainer.__remainingSessionId).catch(() => []);
                const allGroups = reconstructGroups(allMessages);
                const remaining = allGroups.slice(0, -loadedCount);
                
                if (remaining.length === 0) {
                    loadMoreDiv.remove();
                    return;
                }
                
                const chunkSize = 15;
                const chunk = remaining.slice(-chunkSize);
                historyContainer.__loadedGroupsCount = loadedCount + chunk.length;
                
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
                
                loadMoreDiv.dataset.loading = 'false';
                
                if (remaining.length <= chunk.length) {
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

        const hasEntries = history.querySelector('.nexus-entry');
        const regenBtn = document.getElementById('nexus-regenerate-btn') ||
            document.querySelector('.nexus-regenerate-btn');

        if (processPromises.length > 0) {
            if (historyContainer) {
                historyContainer.__processingPromises = processPromises;
            }
            await Promise.all(processPromises);
        }

        if (regenBtn) {
            regenBtn.style.display = hasEntries ? 'flex' : 'none';
        }

        const wsContainers = history.querySelectorAll('.nexus-websource-container');
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
        return await NexusChatDB.getAllSessions();
    },
    async getSession(sessionId) {
        if (!sessionId) return null;
        return await NexusChatDB.getSession(sessionId);
    },
    async deleteSessionWithAttachments(sessionId) {
        try {
            const messages = await NexusChatDB.getMessages(sessionId);
            if (Array.isArray(messages)) {
                for (const msg of messages) {
                    const files = msg.files || msg.images;
                    if (Array.isArray(files)) {
                        for (const file of files) {
                            if (file && file.attachmentId) {
                                try {
                                    await NexusAttachmentDB.delete(file.attachmentId);
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
        await NexusChatDB.deleteSession(sessionId);
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
            chrome.runtime.sendMessage({ action: 'nexus_sessions_deleted', deletedIds: [sessionId] }).catch(() => {});
            chrome.runtime.sendMessage({ action: 'nexus_sessions_index_updated' }).catch(() => {});
            if (typeof NexusSync !== 'undefined' && typeof NexusSync.triggerDebouncedSync === 'function') {
                NexusSync.triggerDebouncedSync();
            }
            return true;
        } catch (error) {
            console.error('Failed to delete chat history:', error);
            return false;
        }
    },
    async renameChat(sessionId, newTitle) {
        try {
            const meta = await NexusChatDB.getSession(sessionId);
            if (meta) {
                meta.title = newTitle;
                meta.isRenamed = true;
                meta.updatedAt = Date.now();
                await NexusChatDB.putSession(meta);
                chrome.runtime.sendMessage({ action: 'nexus_sessions_index_updated' }).catch(() => {});
                if (typeof NexusSync !== 'undefined' && typeof NexusSync.triggerDebouncedSync === 'function') {
                    NexusSync.triggerDebouncedSync();
                }
                return true;
            }
            return false;
        } catch (error) {
            console.error('Failed to rename chat history:', error);
            return false;
        }
    },
    async updateSessionModelAndThinking(sessionId, selectedModel, thinkingLevel) {
        if (!sessionId || sessionId === 'null') return false;
        try {
            const meta = await NexusChatDB.getSession(sessionId);
            if (meta) {
                if (selectedModel !== undefined) meta.selectedModel = selectedModel;
                if (thinkingLevel !== undefined) meta.thinkingLevel = thinkingLevel;
                await NexusChatDB.putSession(meta);
                return true;
            }
            return false;
        } catch (error) {
            console.error('Failed to update session model and thinking level:', error);
            return false;
        }
    },
    async getStorageUsage() {
        try {
            return await NexusChatDB.getStorageUsage();
        } catch (error) {
            console.error('Error calculating chat storage:', error);
            return 0;
        }
    },
    async clearAllHistory() {
        try {
            const sessions = await NexusChatDB.getAllSessions(true);
            for (const sessionId of Object.keys(sessions)) {
                const session = sessions[sessionId];
                if (session && session.archived) {
                    continue;
                }
                await this.deleteSessionWithAttachments(sessionId);
            }
            chrome.runtime.sendMessage({ action: 'nexus_sessions_index_updated' }).catch(() => {});
            if (typeof NexusSync !== 'undefined' && typeof NexusSync.triggerDebouncedSync === 'function') {
                NexusSync.triggerDebouncedSync();
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
        return;
    },
    async cleanupHistoryByAge() {
        try {
            const settings = await chrome.storage.local.get(['historyRetentionMonths']);
            const months = settings.historyRetentionMonths !== undefined ? parseFloat(settings.historyRetentionMonths) : 3;
            if (months === 0) return;
            const retentionMs = months * 30 * 24 * 60 * 60 * 1000;
            const cutoffTime = Date.now() - retentionMs;
            
            const sessions = await NexusChatDB.getAllSessions();
            const deletedSessionIds = [];
            for (const [id, session] of Object.entries(sessions)) {
                const sessionTime = session.updatedAt || session.createdAt || 0;
                if (sessionTime < cutoffTime) {
                    deletedSessionIds.push(id);
                    await this.deleteSessionWithAttachments(id);
                }
            }
            if (deletedSessionIds.length > 0) {
                chrome.runtime.sendMessage({ action: 'cleanup_opfs_files' });
                chrome.runtime.sendMessage({ action: 'nexus_sessions_index_updated' }).catch(() => {});
                if (typeof NexusSync !== 'undefined' && typeof NexusSync.triggerDebouncedSync === 'function') {
                    NexusSync.triggerDebouncedSync();
                }
            }
        } catch (error) {
            console.error('[Nexus History] Error cleaning up history by age:', error);
        }
    },

    async getSessionMessages(sessionId) {
        return await NexusChatDB.getMessages(sessionId) || [];
    },

    async saveSessionMessages(sessionId, messages) {
        const result = await NexusChatDB.putMessages(sessionId, messages);
        if (typeof NexusAttachmentDB !== 'undefined' && NexusAttachmentDB.getAllMetadata) {
            (async () => {
                try {
                    const activeIds = new Set();
                    if (Array.isArray(messages)) {
                        for (const msg of messages) {
                            const files = msg.files || msg.images;
                            if (Array.isArray(files)) {
                                for (const file of files) {
                                    if (file && file.attachmentId) {
                                        activeIds.add(file.attachmentId);
                                    }
                                }
                            }
                        }
                    }
                    const metadata = await NexusAttachmentDB.getAllMetadata();
                    const sessionPrefix = `${sessionId}_`;
                    for (const item of metadata) {
                        if (item && item.key && item.key.startsWith(sessionPrefix)) {
                            if (!activeIds.has(item.key)) {
                                await NexusAttachmentDB.delete(item.key).catch(() => {});
                            }
                        }
                    }
                } catch (err) {
                    console.error('[Auto Cleanup] Failed to clean up orphaned attachments:', err);
                }
            })();
        }
        return result;
    }
};

export const NexusChatHistory = ChatHistoryManager;

if (typeof window !== 'undefined') {
    if (window.location.protocol === 'chrome-extension:') {
        ChatHistoryManager.cleanupHistoryByAge();
    }
    window.ChatHistoryManager = ChatHistoryManager;
    window.NexusChatHistory = NexusChatHistory;
}
if (typeof globalThis !== 'undefined') {
    globalThis.ChatHistoryManager = ChatHistoryManager;
    globalThis.NexusChatHistory = NexusChatHistory;
}
