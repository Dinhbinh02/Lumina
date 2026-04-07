/**
 * Lumina Dictionary Popup
 * Floating, resizable dictionary interface.
 */

window.LuminaDictionaryPopup = {
    instance: null,
    currentWord: '',
    currentSource: 'cambridge', // 'cambridge', 'oxford', 'ai'

    async show(word, options = {}) {
        if (this.instance) {
            this.instance.remove();
        }

        this.currentWord = word;
        this.currentSource = options.source || 'cambridge';

        // --- Bridge Listener (for Background logs) ---
        chrome.runtime.onMessage.addListener((msg) => {
            if (msg.action === 'background_log') {
                console.log(`%c[BG Bridge]%c ${msg.message}`, "color: #ff9800; font-weight: bold;", "color: inherit;");
            }
        });

        // Load saved dimensions
        const saved = await chrome.storage.local.get(['dictPopupWidth', 'dictPopupHeight']);
        const width = saved.dictPopupWidth || 420;
        const height = saved.dictPopupHeight || 460;

        // Lock scroll on background
        const scrollContainer = document.querySelector('.lumina-chat-scroll-content') || document.body;
        if (scrollContainer) {
            scrollContainer.style.setProperty('overflow', 'hidden', 'important');
        }

        const popup = document.createElement('div');
        popup.id = 'lumina-dictionary-popup';
        popup.className = 'lumina-dictionary-popup lumina-fade-in';
        
        // Calculate position
        let x = options.x || (window.innerWidth / 2 - width / 2);
        let y = options.y || (window.innerHeight / 2 - height / 2);
        
        // Boundary checks
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        // Ensure it's within right edge (10px margin)
        if (x + width > viewportWidth - 10) {
            x = viewportWidth - width - 10;
        }
        if (x < 10) x = 10;

        // Ensure it's within bottom edge (10px margin)
        if (y + height > viewportHeight - 10) {
            y = viewportHeight - height - 10;
        }
        if (y < 10) y = 10;

        popup.style.left = `${x}px`;
        popup.style.top = `${y}px`;
        popup.style.width = `${width}px`;
        popup.style.height = `${height}px`;

        popup.innerHTML = `
            <div class="lumina-dict-body">
                <div class="lumina-dict-scroll-area">
                    <div class="lumina-dict-loading-state">
                        <div class="lumina-loading-spinner smaller"></div>
                        <span>Searching...</span>
                    </div>
                </div>
            </div>
            <div class="lumina-dict-footer">
                <div class="lumina-dict-tabs">
                    <button class="lumina-dict-tab-btn active" data-source="cambridge">Cambridge</button>
                    <button class="lumina-dict-tab-btn" data-source="oxford">Oxford</button>
                    <button class="lumina-dict-tab-btn" data-source="ai">AI Define</button>
                </div>
            </div>
            <div class="lumina-dict-resizer-right"></div>
            <div class="lumina-dict-resizer-bottom"></div>
            <div class="lumina-dict-resizer-corner"></div>
        `;

        const shadowHost = document.getElementById('lumina-shadow-host');
        if (shadowHost && shadowHost.shadowRoot) {
            shadowHost.shadowRoot.appendChild(popup);
        } else {
            document.body.appendChild(popup);
        }

        this.instance = popup;
        this.setupEvents();
        this.fetchData();
    },

    setupEvents() {
        if (!this.instance) return;

        // Tabs
        const tabs = this.instance.querySelectorAll('.lumina-dict-tab-btn');
        tabs.forEach(tab => {
            tab.onclick = () => {
                const source = tab.dataset.source;
                if (source === this.currentSource) return;
                
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.currentSource = source;
                this.fetchData();
            };
        });

        // Resizable
        const cornerResizer = this.instance.querySelector('.lumina-dict-resizer-corner');
        const rightResizer = this.instance.querySelector('.lumina-dict-resizer-right');
        const bottomResizer = this.instance.querySelector('.lumina-dict-resizer-bottom');
        
        let isResizing = false;
        let resizingMode = null; // 'right', 'bottom', 'corner'
        let startX, startY, startW, startH;

        const startResize = (e, mode) => {
            isResizing = true;
            resizingMode = mode;
            startX = e.clientX;
            startY = e.clientY;
            startW = this.instance.offsetWidth;
            startH = this.instance.offsetHeight;
            this.instance.classList.add('is-resizing');
            e.preventDefault();
            e.stopPropagation();
        };

        cornerResizer.onmousedown = (e) => startResize(e, 'corner');
        rightResizer.onmousedown = (e) => startResize(e, 'right');
        bottomResizer.onmousedown = (e) => startResize(e, 'bottom');

        const moveHandler = (e) => {
            if (isResizing) {
                const dw = e.clientX - startX;
                const dh = e.clientY - startY;
                
                if (resizingMode === 'right' || resizingMode === 'corner') {
                    const newWidth = Math.max(300, startW + dw);
                    this.instance.style.width = `${newWidth}px`;
                }
                
                if (resizingMode === 'bottom' || resizingMode === 'corner') {
                    const newHeight = Math.max(250, startH + dh);
                    this.instance.style.height = `${newHeight}px`;
                }
                
                // Debounced save
                if (window._dictResizeTimer) clearTimeout(window._dictResizeTimer);
                window._dictResizeTimer = setTimeout(() => {
                    chrome.storage.local.set({
                        dictPopupWidth: parseInt(this.instance.style.width),
                        dictPopupHeight: parseInt(this.instance.style.height)
                    });
                }, 500);
            }
        };

        const upHandler = () => {
            if (isResizing) {
                isResizing = false;
                resizingMode = null;
                this.instance.classList.remove('is-resizing');
            }
        };

        const outsideClickHandler = (e) => {
            if (!this.instance) return;
            const path = e.composedPath();
            const isInside = path.some(el => el === this.instance);
            // Also ignore clicks on the launch buttons
            const isLauncher = path.some(el => el.classList && el.classList.contains && el.classList.contains('lumina-dict-launcher-part'));
            if (!isInside && !isLauncher) {
                this.hide();
            }
        };

        window.addEventListener('mousemove', moveHandler);
        window.addEventListener('mouseup', upHandler);
        window.addEventListener('mousedown', outsideClickHandler, true); // Capture phase for instant detection
        
        // Clean up on remove
        this.instance._cleanup = () => {
            window.removeEventListener('mousemove', moveHandler);
            window.removeEventListener('mouseup', upHandler);
            window.removeEventListener('mousedown', outsideClickHandler, true);
        };
    },

    hide() {
        if (this.instance) {
            // Restore scroll
            const scrollContainer = document.querySelector('.lumina-chat-scroll-content') || document.body;
            if (scrollContainer) {
                scrollContainer.style.removeProperty('overflow');
            }

            if (this.instance._cleanup) this.instance._cleanup();
            this.instance.remove();
            this.instance = null;
        }
    },

    async fetchData() {
        const scrollArea = this.instance.querySelector('.lumina-dict-scroll-area');
        scrollArea.innerHTML = `
            <div class="lumina-dict-loading-state">
                <div class="lumina-loading-spinner smaller"></div>
                <span>Searching ${this.currentSource}...</span>
            </div>
        `;

        try {
            const actionMap = {
                'cambridge': 'fetch_cambridge',
                'oxford': 'fetch_oxford',
                'ai': 'fetch_ai_dict'
            };

            const action = actionMap[this.currentSource];
            console.log(`[Lumina Dict] Sending ${action} for:`, this.currentWord);
            
            const response = await new Promise((resolve) => {
                chrome.runtime.sendMessage({ action: action, word: this.currentWord }, (res) => {
                    if (chrome.runtime.lastError) {
                        console.error('[Lumina Dict] runtime.lastError:', chrome.runtime.lastError.message);
                        resolve({ success: false, error: chrome.runtime.lastError.message });
                    } else {
                        resolve(res);
                    }
                });
            });

            console.log(`[Lumina Dict] Received response for ${action}:`, response);

            if (!response) {
                throw new Error('No response from background (received undefined). Check Service Worker console.');
            }

            if (response && response.success) {
                console.log(`[Lumina Dict] Success! Data received for ${action}.`);
                if (this.currentSource === 'ai') {
                    this.renderData(response.data);
                } else if (response.html) {
                    if (this.currentSource === 'oxford') {
                        console.log('[Lumina Dict] Parsing Oxford HTML...');
                        const parsed = OxfordParser.parse(response.html);
                        if (parsed && parsed.entries && parsed.entries.length > 0) {
                            this.renderData(parsed);
                            
                            // Sequential fetch for related entries
                            if (parsed.relatedUrls && parsed.relatedUrls.length > 0) {
                                for (const url of parsed.relatedUrls) {
                                    try {
                                        const addResp = await chrome.runtime.sendMessage({ action: 'fetch_oxford_url', url });
                                        if (addResp.success) {
                                            const extraData = OxfordParser.parse(addResp.html);
                                            if (extraData && extraData.entries.length > 0) {
                                                this.appendData(extraData);
                                            }
                                        }
                                    } catch (e) {
                                        console.warn('[Lumina] Failed to fetch related entry:', url, e);
                                    }
                                }
                            }
                        } else {
                            scrollArea.innerHTML = `<div class="lumina-dict-empty">No results found for "${this.currentWord}" in Oxford.</div>`;
                        }
                    } else {
                        const parsed = CambridgeParser.parse(response.html);
                        if (parsed && parsed.entries && parsed.entries.length > 0) {
                            this.renderData(parsed);
                        } else {
                            scrollArea.innerHTML = `<div class="lumina-dict-empty">No results found for "${this.currentWord}" in this dictionary.</div>`;
                        }
                    }
                }
            } else {
                const errorMsg = response && response.error ? response.error : 'No response from background';
                console.error(`[Lumina Dict] Background task failed:`, response);
                throw new Error(errorMsg);
            }
        } catch (err) {
            console.error('[Lumina Dict] Critical Error in fetchData:', err);
            const scrollArea = this.instance.querySelector('.lumina-dict-scroll-area');
            if (scrollArea) {
                scrollArea.innerHTML = `
                    <div class="lumina-dict-error">
                        <div class="lumina-dict-error-header">Error: ${err.message}</div>
                        <div class="lumina-dict-error-hint">Check your console (F12) for more details.</div>
                    </div>
                `;
            }
        }
    },

    appendData(data) {
        const scrollArea = this.instance.querySelector('.lumina-dict-scroll-area');
        const wrapper = scrollArea.querySelector('.lumina-dict-content-wrapper');
        if (!wrapper) return;

        data.entries.forEach(entry => {
            const entryEl = document.createElement('div');
            entryEl.className = 'lumina-dict-popup-item';
            entryEl.innerHTML = this.buildEntryHTML(entry, data.word);
            wrapper.appendChild(entryEl);
            
            // Re-setup audio listeners for the new entries
            this.setupAudioListeners(entryEl);
        });
    },

    renderData(data) {
        const scrollArea = this.instance.querySelector('.lumina-dict-scroll-area');
        scrollArea.innerHTML = `<div class="lumina-dict-content-wrapper"></div>`;
        const wrapper = scrollArea.querySelector('.lumina-dict-content-wrapper');

        data.entries.forEach(entry => {
            const entryEl = document.createElement('div');
            entryEl.className = 'lumina-dict-popup-item';
            entryEl.innerHTML = this.buildEntryHTML(entry, data.word);
            wrapper.appendChild(entryEl);
        });

        this.setupAudioListeners(scrollArea);
    },

    getSpeakerSVG(color = 'currentColor') {
        return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`;
    },

    setupAudioListeners(container) {
        const audioBtns = container.querySelectorAll('.lumina-dict-popup-audio');
        audioBtns.forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const url = btn.dataset.url;
                if (!url) return;
                
                // Use background script to play audio to handle CORS and persistence
                chrome.runtime.sendMessage({ 
                    action: 'playAudio', 
                    url: url 
                }).catch(err => console.warn('[Lumina] Audio play failed:', err));
            };
        });
    },

    buildEntryHTML(entry, word) {
        let globalMeaningIndex = 1;
        const totalDefinitions = entry.senses.reduce((acc, s) => acc + s.definitions.length, 0);

        return `
            <div class="lumina-dict-popup-meta">
                <div class="lumina-dict-header-row">
                    <span class="lumina-dict-popup-title">${word}</span>
                    ${entry.pos ? `<span class="lumina-dict-popup-pos">${entry.pos}</span>` : ''}
                </div>
                
                <div class="lumina-dict-popup-prons">
                    ${entry.uk?.ipa || entry.uk?.audio ? `
                        <div class="lumina-dict-pron-group uk">
                            <span class="lumina-dict-lang">UK</span>
                            ${entry.uk?.audio ? `
                                <button class="lumina-dict-popup-audio" data-url="${entry.uk.audio}" title="UK Pronunciation" data-lang="uk">
                                    ${this.getSpeakerSVG()}
                                </button>
                            ` : ''}
                            ${entry.uk?.ipa ? `<span class="lumina-dict-ipa">/${entry.uk.ipa}/</span>` : ''}
                        </div>
                    ` : ''}
                    ${entry.us?.ipa || entry.us?.audio ? `
                        <div class="lumina-dict-pron-group us">
                            <span class="lumina-dict-lang">US</span>
                            ${entry.us?.audio ? `
                                <button class="lumina-dict-popup-audio" data-url="${entry.us.audio}" title="US Pronunciation" data-lang="us">
                                    ${this.getSpeakerSVG()}
                                </button>
                            ` : ''}
                            ${entry.us?.ipa ? `<span class="lumina-dict-ipa">/${entry.us.ipa}/</span>` : ''}
                        </div>
                    ` : ''}
                </div>
            </div>

            <div class="lumina-dict-popup-senses">
                ${entry.senses.map(sense => {
                    let senseMeaningIndex = 1;
                    const showNumber = sense.definitions.length > 1;
                    
                    return `
                        <div class="lumina-dict-popup-sense">
                            ${sense.indicator ? `<div class="lumina-dict-sense-indicator">${sense.indicator}</div>` : ''}
                            ${sense.definitions.map(def => {
                                const html = `
                                    <div class="lumina-dict-popup-meaning">
                                        <div class="lumina-dict-meaning-header">
                                            ${showNumber ? `<span class="lumina-dict-meaning-number">${senseMeaningIndex}.</span>` : ''}
                                            <span class="lumina-dict-meaning-text">${def.meaning}</span>
                                        </div>
                                        ${def.translation ? `<div class="lumina-dict-meaning-translation">${def.translation}</div>` : ''}
                                    </div>
                                `;
                                senseMeaningIndex++;
                                return html;
                            }).join('')}
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }
};
