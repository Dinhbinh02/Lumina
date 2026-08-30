/**
 * CanvasService — Centralized manager for Nexus Canvas lifecycle,
 * document state, parser, and UI card rendering.
 */

export const CanvasService = {
    currentDoc: {
        name: '',
        type: '',
        content: '',
        comments: []
    },

    // Regex constants
    CREATE_REGEX: /<nexus-canvas-create\s+name="([^"]+)"\s+type="([^"]+)">([\s\S]*?)(?:<\/nexus-canvas-create>|$)/i,
    UPDATE_REGEX: /<nexus-canvas-update\s+name="([^"]+)">([\s\S]*?)(?:<\/nexus-canvas-update>|$)/i,
    UPDATE_GLOBAL_REGEX: /<nexus-canvas-update\s+name="([^"]+)">([\s\S]*?)<\/nexus-canvas-update>/gi,
    COMMENT_REGEX: /<nexus-canvas-comment\s+name="([^"]+)">([\s\S]*?)(?:<\/nexus-canvas-comment>|$)/gi,

    getTypeLabel(type) {
        if (!type) return 'DOCUMENT';
        const clean = type.toLowerCase().replace('code/', '');
        if (clean === 'javascript' || clean === 'js') return 'JS';
        if (clean === 'typescript' || clean === 'ts') return 'TS';
        if (clean === 'html') return 'HTML';
        if (clean === 'css') return 'CSS';
        if (clean === 'react' || clean === 'jsx') return 'REACT';
        if (clean === 'python' || clean === 'py') return 'PYTHON';
        return clean.toUpperCase();
    },

    getTypeColorClass(type) {
        const clean = (type || '').toLowerCase().replace('code/', '');
        if (clean === 'html') return 'badge-html';
        if (clean === 'javascript' || clean === 'js') return 'badge-js';
        if (clean === 'react' || clean === 'jsx') return 'badge-react';
        if (clean === 'css') return 'badge-css';
        if (clean === 'python' || clean === 'py') return 'badge-py';
        return 'badge-doc';
    },

    renderCardHtml(name, type, timeStr = '') {
        const escapedName = (name || 'Untitled Document').replace(/"/g, '&quot;');
        const displayType = this.getTypeLabel(type);
        const badgeClass = this.getTypeColorClass(type);
        const metaText = timeStr ? `${displayType} • ${timeStr}` : displayType;

        return `<div class="nexus-canvas-card ${badgeClass}" data-canvas-name="${escapedName}" data-canvas-type="${type || 'document'}">
      <div class="nexus-canvas-card-left">
        <div class="nexus-canvas-card-icon">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <polyline points="10 9 9 9 8 9"></polyline>
          </svg>
        </div>
        <div class="nexus-canvas-card-info">
          <div class="nexus-canvas-card-title">${name || 'Untitled Document'}</div>
          <div class="nexus-canvas-card-meta">${metaText}</div>
        </div>
      </div>
      <div class="nexus-canvas-card-right">
        <button class="nexus-canvas-card-btn" title="Open Canvas">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </button>
      </div>
    </div>`;
    },

    cleanCanvasTagsFromMarkdown(rawContent, timeStr = '') {
        if (!rawContent || typeof rawContent !== 'string') return '';
        let displayContent = rawContent;

        displayContent = displayContent.replace(this.CREATE_REGEX, (match, name, type) => {
            return this.renderCardHtml(name, type, timeStr);
        });

        displayContent = displayContent.replace(this.UPDATE_GLOBAL_REGEX, () => '');
        displayContent = displayContent.replace(this.COMMENT_REGEX, () => '');

        return displayContent;
    },

    showCanvas() {
        const paneSecondary = document.getElementById('pane-secondary');
        if (paneSecondary) {
            paneSecondary.classList.add('canvas-active');
        }
    },

    hideCanvas() {
        const paneSecondary = document.getElementById('pane-secondary');
        if (paneSecondary) {
            paneSecondary.classList.remove('canvas-active');
        }
    },

    setDocument(name, type, content) {
        this.currentDoc.name = name;
        this.currentDoc.type = type;
        this.currentDoc.content = content;

        const titleInput = document.getElementById('nexus-canvas-title');
        const typeBadge = document.getElementById('nexus-canvas-type-badge');
        const editorTextarea = document.getElementById('nexus-canvas-editor');
        const documentView = document.getElementById('nexus-canvas-document');
        const codeTabBtn = document.getElementById('nexus-canvas-tab-code');
        const previewTabBtn = document.getElementById('nexus-canvas-tab-preview');
        const container = document.querySelector('.nexus-canvas-container');

        if (titleInput) titleInput.value = name;
        if (typeBadge) {
            typeBadge.textContent = this.getTypeLabel(type);
            typeBadge.className = `nexus-canvas-badge ${this.getTypeColorClass(type)}`;
        }
        if (editorTextarea) {
            editorTextarea.value = content;
        }

        this.syncHighlighting(content);

        if (documentView) {
            if (window.ensureMarkedLoaded) {
                window.ensureMarkedLoaded().then(() => {
                    if (typeof marked !== 'undefined') {
                        documentView.innerHTML = marked.parse(content);
                    } else {
                        documentView.textContent = content;
                    }
                }).catch(() => {
                    documentView.textContent = content;
                });
            } else {
                documentView.textContent = content;
            }
        }

        if (container) {
            if (type === 'document') {
                container.classList.add('type-document');
            } else {
                container.classList.remove('type-document');
            }
        }

        if (codeTabBtn) {
            codeTabBtn.textContent = (type === 'document') ? 'Edit' : 'Code';
            codeTabBtn.style.display = 'block';
        }

        if (previewTabBtn) {
            if (type === 'document' || type === 'code/html' || type === 'code/react' || (type && type.includes('html'))) {
                previewTabBtn.textContent = 'Preview';
                previewTabBtn.style.display = 'block';
            } else {
                previewTabBtn.style.display = 'none';
            }
        }

        this.switchTab('code');
        this.updatePreview();
    },

    applyUpdate(name, pattern, replacement, isFinal = false) {
        let currentContent = this.currentDoc.content;
        let newContent = currentContent;

        if (pattern === '.*') {
            newContent = replacement;
        } else {
            try {
                const regex = new RegExp(pattern, 'g');
                newContent = currentContent.replace(regex, replacement);
            } catch (e) {
                console.error('[Nexus Canvas] Regex error:', e);
            }
        }

        this.currentDoc.content = newContent;
        const editorTextarea = document.getElementById('nexus-canvas-editor');
        if (editorTextarea) {
            editorTextarea.value = newContent;
        }

        this.syncHighlighting(newContent);

        const documentView = document.getElementById('nexus-canvas-document');
        if (documentView && this.currentDoc.type === 'document') {
            if (window.ensureMarkedLoaded) {
                window.ensureMarkedLoaded().then(() => {
                    if (typeof marked !== 'undefined') {
                        documentView.innerHTML = marked.parse(newContent);
                    } else {
                        documentView.textContent = newContent;
                    }
                }).catch(() => {
                    documentView.textContent = newContent;
                });
            } else {
                documentView.textContent = newContent;
            }
        }

        if (isFinal) {
            this.updatePreview();
        }
    },

    updatePreview() {
        const previewFrame = document.getElementById('nexus-canvas-preview-frame');
        if (!previewFrame) return;

        let content = this.currentDoc.content;
        if (this.currentDoc.type === 'code/react') {
            content = `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8" />
                    <title>React Preview</title>
                    <script src="https://unpkg.com/react@18/umd/react.development.js" crossorigin></script>
                    <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js" crossorigin></script>
                    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
                    <script src="https://cdn.tailwindcss.com"></script>
                    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
                </head>
                <body class="bg-gray-50 text-gray-900 p-4">
                    <div id="root"></div>
                    <script type="text/babel">
                        ${content.replace(/export default/g, 'const App = ')}
                        const root = ReactDOM.createRoot(document.getElementById('root'));
                        root.render(<App />);
                    </script>
                </body>
                </html>
            `;
        }

        try {
            const doc = previewFrame.contentDocument || previewFrame.contentWindow.document;
            doc.open();
            doc.write(content);
            doc.close();
        } catch (e) {
            console.error('[Nexus Canvas] Preview error:', e);
        }
    },

    switchTab(tabId) {
        const codeTabBtn = document.getElementById('nexus-canvas-tab-code');
        const previewTabBtn = document.getElementById('nexus-canvas-tab-preview');
        const codePanel = document.getElementById('nexus-canvas-code-panel');
        const documentPanel = document.getElementById('nexus-canvas-document-panel');
        const previewPanel = document.getElementById('nexus-canvas-preview-panel');

        if (codePanel) codePanel.classList.remove('active');
        if (documentPanel) documentPanel.classList.remove('active');
        if (previewPanel) previewPanel.classList.remove('active');
        if (codeTabBtn) codeTabBtn.classList.remove('active');
        if (previewTabBtn) previewTabBtn.classList.remove('active');

        if (tabId === 'code') {
            if (codeTabBtn) codeTabBtn.classList.add('active');
            if (codePanel) codePanel.classList.add('active');
        } else if (tabId === 'preview') {
            if (previewTabBtn) previewTabBtn.classList.add('active');
            if (this.currentDoc.type === 'document') {
                if (documentPanel) documentPanel.classList.add('active');
                const documentView = document.getElementById('nexus-canvas-document');
                if (documentView && window.ensureMarkedLoaded) {
                    window.ensureMarkedLoaded().then(() => {
                        if (typeof marked !== 'undefined') {
                            documentView.innerHTML = marked.parse(this.currentDoc.content);
                        } else {
                            documentView.textContent = this.currentDoc.content;
                        }
                    }).catch(() => {
                        documentView.textContent = this.currentDoc.content;
                    });
                }
            } else {
                if (previewPanel) previewPanel.classList.add('active');
                this.updatePreview();
            }
        }
    },

    syncHighlighting(code) {
        const codeEl = document.getElementById('nexus-canvas-highlight-code');
        if (codeEl) {
            const escaped = (code || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
            codeEl.innerHTML = escaped.endsWith('\n') ? escaped + ' ' : escaped;
            if (window.ensureHighlightLoaded) {
                window.ensureHighlightLoaded().then(() => {
                    if (typeof hljs !== 'undefined') {
                        let lang = (this.currentDoc.type || 'javascript').replace('code/', '');
                        if (lang === 'react') lang = 'jsx';
                        codeEl.className = lang;
                        hljs.highlightElement(codeEl);
                    }
                });
            }
        }
    },

    handleStream(text) {
        const createMatch = text.match(this.CREATE_REGEX);
        if (createMatch) {
            const name = createMatch[1];
            const type = createMatch[2];
            const content = createMatch[3];
            this.showCanvas();
            this.setDocument(name, type, content);
            return;
        }

        const updateMatch = text.match(this.UPDATE_REGEX);
        if (updateMatch) {
            const name = updateMatch[1];
            const body = updateMatch[2];
            const patternMatch = body.match(/<pattern>([\s\S]*?)<\/pattern>/i);
            const replacementMatch = body.match(/<replacement>([\s\S]*?)(?:<\/replacement>|$)/i);
            if (patternMatch && replacementMatch) {
                this.applyUpdate(name, patternMatch[1], replacementMatch[2], false);
            }
        }
    },

    handleDone(text) {
        let match;
        const updateRegex = new RegExp(this.UPDATE_GLOBAL_REGEX);
        while ((match = updateRegex.exec(text)) !== null) {
            const name = match[1];
            const body = match[2];
            const patternMatch = body.match(/<pattern>([\s\S]*?)<\/pattern>/i);
            const replacementMatch = body.match(/<replacement>([\s\S]*?)<\/replacement>/i);
            if (patternMatch && replacementMatch) {
                this.applyUpdate(name, patternMatch[1], replacementMatch[2], true);
            }
        }
    },

    init(tabsGetter, activeTabIdxGetter) {
        const closeBtn = document.getElementById('nexus-canvas-btn-close');
        if (closeBtn) {
            closeBtn.onclick = () => this.hideCanvas();
        }
        const codeTabBtn = document.getElementById('nexus-canvas-tab-code');
        if (codeTabBtn) {
            codeTabBtn.onclick = () => this.switchTab('code');
        }
        const previewTabBtn = document.getElementById('nexus-canvas-tab-preview');
        if (previewTabBtn) {
            previewTabBtn.onclick = () => this.switchTab('preview');
        }

        const saveLocalDoc = () => {
            const tabs = typeof tabsGetter === 'function' ? tabsGetter() : (window.tabs || []);
            const activeTabIndex = typeof activeTabIdxGetter === 'function' ? activeTabIdxGetter() : (window.activeTabIndex || 0);
            const activeTab = tabs[activeTabIndex];
            const sessionId = activeTab ? activeTab.sessionId : 'global';
            const key = `nexus-canvas-${sessionId}-${this.currentDoc.name}`;
            localStorage.setItem(key, JSON.stringify({
                name: this.currentDoc.name,
                type: this.currentDoc.type,
                content: this.currentDoc.content
            }));
        };

        const titleInput = document.getElementById('nexus-canvas-title');
        if (titleInput) {
            titleInput.oninput = () => {
                const oldName = this.currentDoc.name;
                const newName = titleInput.value;
                this.currentDoc.name = newName;
                const tabs = typeof tabsGetter === 'function' ? tabsGetter() : (window.tabs || []);
                const activeTabIndex = typeof activeTabIdxGetter === 'function' ? activeTabIdxGetter() : (window.activeTabIndex || 0);
                const activeTab = tabs[activeTabIndex];
                const sessionId = activeTab ? activeTab.sessionId : 'global';
                localStorage.removeItem(`nexus-canvas-${sessionId}-${oldName}`);
                saveLocalDoc();
            };
        }

        const textarea = document.getElementById('nexus-canvas-editor');
        const pre = document.getElementById('nexus-canvas-highlight-block');
        if (textarea && pre) {
            textarea.onscroll = () => {
                pre.scrollTop = textarea.scrollTop;
                pre.scrollLeft = textarea.scrollLeft;
            };
            textarea.oninput = () => {
                const code = textarea.value;
                this.currentDoc.content = code;
                this.syncHighlighting(code);
                this.updatePreview();
                saveLocalDoc();
            };
        }
    },

    loadVersionFromCard(card, tabsGetter, activeTabIdxGetter) {
        const cardTitle = card.querySelector('.nexus-canvas-card-title')?.textContent || '';
        if (!cardTitle) return;

        const tabs = typeof tabsGetter === 'function' ? tabsGetter() : (window.tabs || []);
        const activeTabIndex = typeof activeTabIdxGetter === 'function' ? activeTabIdxGetter() : (window.activeTabIndex || 0);
        const activeTab = tabs[activeTabIndex];
        const sessionId = activeTab ? activeTab.sessionId : 'global';

        const localSaved = localStorage.getItem(`nexus-canvas-${sessionId}-${cardTitle}`);
        if (localSaved) {
            try {
                const parsed = JSON.parse(localSaved);
                this.showCanvas();
                this.setDocument(parsed.name, parsed.type, parsed.content);
                return;
            } catch (e) {
                console.error('[Nexus Canvas] Error loading local saved doc:', e);
            }
        }

        const chatHistory = document.getElementById('chat-history') || document.getElementById('chat-history-secondary');
        if (!chatHistory) return;

        const allAnswers = Array.from(chatHistory.querySelectorAll('.nexus-chat-answer'));
        let docName = '';
        let docType = '';
        let docContent = '';

        allAnswers.forEach(ans => {
            const rawText = ans.getAttribute('data-raw-text') || '';
            const createRegex = new RegExp(this.CREATE_REGEX, 'gi');
            let createMatch;
            while ((createMatch = createRegex.exec(rawText)) !== null) {
                if (createMatch[1] === cardTitle) {
                    docName = createMatch[1];
                    docType = createMatch[2];
                    docContent = createMatch[3];
                }
            }

            const updateRegex = new RegExp(this.UPDATE_GLOBAL_REGEX, 'gi');
            let updateMatch;
            while ((updateMatch = updateRegex.exec(rawText)) !== null) {
                if (updateMatch[1] === cardTitle) {
                    const name = updateMatch[1];
                    const body = updateMatch[2];
                    const patternMatch = body.match(/<pattern>([\s\S]*?)<\/pattern>/i);
                    const replacementMatch = body.match(/<replacement>([\s\S]*?)<\/replacement>/i);
                    if (patternMatch && replacementMatch) {
                        const pattern = patternMatch[1];
                        const replacement = replacementMatch[2];
                        if (pattern === '.*') {
                            docContent = replacement;
                        } else {
                            try {
                                const regex = new RegExp(pattern, 'g');
                                docContent = docContent.replace(regex, replacement);
                            } catch (_) { }
                        }
                    }
                }
            }
        });

        if (docName) {
            this.showCanvas();
            this.setDocument(docName, docType, docContent);
        }
    }
};

