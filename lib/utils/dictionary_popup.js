/**
 * Lumina Dictionary Popup
 * Floating, resizable dictionary interface.
 */

window.LuminaDictionaryPopup = {
    instance: null,
    currentWord: '',
    currentSource: 'cambridge',
    resultsCache: new Map(),
    ongoingRequests: new Set(),

    getFallbackSource(source) {
        const sources = ['cambridge', 'oxford', 'ai'];
        const currentIndex = sources.indexOf(source);
        if (currentIndex === -1) return null;
        return sources[currentIndex + 1] || null;
    },

    async show(word, options = {}) {
        if (this.instance) {
            this.instance.remove();
        }

        // Reset state for new word
        if (this.currentWord !== word) {
            this.currentWord = word;
        }

        this.currentSource = options.source || 'cambridge';

        // --- Bridge Listener (for Background logs) ---
        if (!this.messageListenerAdded) {
            chrome.runtime.onMessage.addListener((msg) => {
                if (msg.action === 'background_log') {
                    console.log(`%c[BG Bridge]%c ${msg.message}`, "color: #ff9800; font-weight: bold;", "color: inherit;");
                }
            });
            this.messageListenerAdded = true;
        }

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

        if (x + width > viewportWidth - 10) x = viewportWidth - width - 10;
        if (x < 10) x = 10;
        if (y + height > viewportHeight - 10) y = viewportHeight - height - 10;
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
                        <span>Initializing...</span>
                    </div>
                </div>
            </div>
            <div class="lumina-dict-footer">
                <div class="lumina-dict-tabs">
                    <button class="lumina-dict-tab-btn ${this.currentSource === 'cambridge' ? 'active' : ''}" data-source="cambridge">Cambridge</button>
                    <button class="lumina-dict-tab-btn ${this.currentSource === 'oxford' ? 'active' : ''}" data-source="oxford">Oxford</button>
                    <button class="lumina-dict-tab-btn ${this.currentSource === 'ai' ? 'active' : ''}" data-source="ai">AI Define</button>
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

        // --- NEW: Load ALL tabs simultaneously ---
        const sources = ['cambridge', 'oxford', 'ai'];
        sources.forEach(source => {
            this.fetchData(source);
        });
    },

    switchSource(source) {
        if (!this.instance || source === this.currentSource) return;

        const tabs = this.instance.querySelectorAll('.lumina-dict-tab-btn');
        const targetTab = Array.from(tabs).find(t => t.dataset.source === source);
        if (!targetTab) return;

        tabs.forEach(t => t.classList.remove('active'));
        targetTab.classList.add('active');
        this.currentSource = source;

        // If already in cache (fetched by parallel logic), render immediately
        const cacheKey = `${this.currentWord}_${source}`;
        const cached = this.resultsCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp < 3600000)) {
            this.renderData(cached.data);
        } else {
            this.showLoading(source);
            this.fetchData(source);
        }
    },

    setupEvents() {
        if (!this.instance) return;

        // Tabs
        const tabs = this.instance.querySelectorAll('.lumina-dict-tab-btn');
        tabs.forEach(tab => {
            tab.onclick = () => {
                this.switchSource(tab.dataset.source);
            };
        });

        // Resizable logic ...
        const cornerResizer = this.instance.querySelector('.lumina-dict-resizer-corner');
        const rightResizer = this.instance.querySelector('.lumina-dict-resizer-right');
        const bottomResizer = this.instance.querySelector('.lumina-dict-resizer-bottom');

        let isResizing = false;
        let resizingMode = null;
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
                    this.instance.style.width = `${Math.max(300, startW + dw)}px`;
                }
                if (resizingMode === 'bottom' || resizingMode === 'corner') {
                    this.instance.style.height = `${Math.max(250, startH + dh)}px`;
                }
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
                this.instance.classList.remove('is-resizing');
            }
        };

        const outsideClickHandler = (e) => {
            if (!this.instance) return;
            const path = e.composedPath();
            
            // On web pages, everything is inside #lumina-shadow-host.
            // In Spotlight, we check for identity or ID.
            const isInside = path.some(el => 
                el === this.instance || 
                (el.id === 'lumina-dictionary-popup') ||
                (el.id === 'lumina-shadow-host') ||
                (el.classList && el.classList.contains && el.classList.contains('lumina-dictionary-popup'))
            );
            
            if (!isInside) {
                this.hide();
            }
        };

        window.addEventListener('mousemove', moveHandler);
        window.addEventListener('mouseup', upHandler);
        window.addEventListener('mousedown', outsideClickHandler, true);

        this.instance._cleanup = () => {
            window.removeEventListener('mousemove', moveHandler);
            window.removeEventListener('mouseup', upHandler);
            window.removeEventListener('mousedown', outsideClickHandler, true);
        };
    },

    hide() {
        if (this.instance) {
            const scrollContainer = document.querySelector('.lumina-chat-scroll-content') || document.body;
            if (scrollContainer) scrollContainer.style.removeProperty('overflow');
            if (this.instance._cleanup) this.instance._cleanup();
            this.instance.remove();
            this.instance = null;
        }
    },

    showLoading(source) {
        if (!this.instance) return;
        const scrollArea = this.instance.querySelector('.lumina-dict-scroll-area');
        if (!scrollArea) return;
        scrollArea.innerHTML = `
            <div class="lumina-dict-loading-state">
                <div class="lumina-loading-spinner smaller"></div>
                <span>Searching ${source}...</span>
            </div>
        `;
    },

    async fetchData(source = this.currentSource) {
        const cacheKey = `${this.currentWord}_${source}`;
        const now = Date.now();

        // 1. Check cache
        const cached = this.resultsCache.get(cacheKey);
        if (cached && (now - cached.timestamp < 3600000)) {
            console.log(`[Lumina Dict] Cache hit for ${cacheKey}`);
            if (source === this.currentSource) this.renderData(cached.data);
            return;
        }

        // 2. Prevent duplicate fetches
        const requestKey = `${this.currentWord}_${source}`;
        if (this.ongoingRequests.has(requestKey)) return;
        this.ongoingRequests.add(requestKey);

        // 3. Update UI if it's the active source
        if (source === this.currentSource) {
            this.showLoading(source);
        }

        try {
            const actionMap = {
                'cambridge': 'fetch_cambridge',
                'oxford': 'fetch_oxford',
                'ai': 'fetch_ai_dict'
            };

            const action = actionMap[source];
            const response = await new Promise((resolve) => {
                chrome.runtime.sendMessage({ action: action, word: this.currentWord }, (res) => {
                    if (chrome.runtime.lastError) {
                        resolve({ success: false, error: chrome.runtime.lastError.message });
                    } else {
                        resolve(res);
                    }
                });
            });

            if (response && response.success) {
                const finalData = response.data || (response.html ? (source === 'oxford' ? OxfordParser.parse(response.html) : CambridgeParser.parse(response.html)) : null);

                // Initial cache and render
                if (finalData) {
                    this.resultsCache.set(cacheKey, { data: finalData, timestamp: Date.now() });
                    if (source === this.currentSource) this.renderData(finalData);
                }

                // Additional fetch for Oxford related entries (incremental & parallel)
                if (source === 'oxford' && finalData && finalData.relatedUrls?.length > 0) {
                    const fetchPromises = finalData.relatedUrls.map(async (url) => {
                        try {
                            const addResp = await chrome.runtime.sendMessage({ action: 'fetch_oxford_url', url });
                            if (addResp.success) {
                                const extra = OxfordParser.parse(addResp.html);
                                if (extra?.entries?.length > 0) {
                                    finalData.entries.push(...extra.entries);
                                    this.resultsCache.set(cacheKey, { data: finalData, timestamp: Date.now() });
                                    if (source === this.currentSource) this.renderData(finalData);
                                    return true;
                                }
                            }
                        } catch (e) { console.warn('[Lumina Dict] Oxford parallel fetch error:', e); }
                        return false;
                    });

                    // After all parallel attempts, if we still have no entries, trigger the fallback
                    Promise.all(fetchPromises).then((results) => {
                        if (finalData.entries.length === 0 && source === this.currentSource) {
                            console.log('[Lumina Dict] Oxford parallel fetches finished with no results, falling back.');
                            this.renderData(finalData || { word: this.currentWord, entries: [] });
                            this.switchSource('ai');
                        }
                    });
                }

                // Final check for empty results for other sources or non-extra Oxford cases
                const hasSubtasks = source === 'oxford' && (finalData?.relatedUrls?.length > 0);
                if (!hasSubtasks && (!finalData || finalData.entries?.length === 0)) {
                    const emptyData = finalData || { word: this.currentWord, entries: [] };
                    this.resultsCache.set(cacheKey, { data: emptyData, timestamp: Date.now() });
                    if (source === this.currentSource) {
                        this.renderData(emptyData);
                        if (source === 'cambridge') this.switchSource('oxford');
                        else if (source === 'oxford') this.switchSource('ai');
                    }
                }
            } else {
                throw new Error(response?.error || 'Failed to fetch');
            }
        } catch (err) {
            console.error(`[Lumina Dict] Error in fetchData(${source}):`, err);

            const errMessage = String(err?.message || err || '');
            const isForbidden = /\b403\b|HTTP Status 403|Forbidden/i.test(errMessage);
            const fallbackSource = isForbidden ? this.getFallbackSource(source) : null;

            if (isForbidden && fallbackSource) {
                if (source === this.currentSource) {
                    this.switchSource(fallbackSource);
                }
                return;
            }

            if (source === this.currentSource) {
                const scrollArea = this.instance.querySelector('.lumina-dict-scroll-area');
                scrollArea.innerHTML = `<div class="lumina-dict-error">Error: ${err.message}</div>`;
            }
        } finally {
            this.ongoingRequests.delete(requestKey);
        }
    },

    renderData(data) {
        if (!this.instance) return;
        const scrollArea = this.instance.querySelector('.lumina-dict-scroll-area');
        
        if (!data || !data.entries || data.entries.length === 0) {
            scrollArea.innerHTML = `<div class="lumina-dict-empty">No results found for "${data?.word || this.currentWord}" in ${this.currentSource}.</div>`;
            return;
        }

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
            btn.onclick = async (e) => {
                e.stopPropagation();
                const { url, text, lang } = btn.dataset;
                
                if (url) {
                    chrome.runtime.sendMessage({ action: 'playAudio', url: url }).catch(err => console.warn(err));
                } else if (text && lang) {
                    // Trigger Google TTS via fetchAudio + playBase64Audio
                    try {
                        const settings = await new Promise(resolve => chrome.storage.local.get(['audioSpeed'], resolve));
                        const speed = settings.audioSpeed || 1.0;
                        
                        chrome.runtime.sendMessage({ action: 'fetchAudio', text, lang, speed }, (res) => {
                            if (res && res.chunks && res.chunks.length > 0) {
                                chrome.runtime.sendMessage({ action: 'playBase64Audio', base64: res.chunks[0], speed });
                            }
                        });
                    } catch (err) {
                        console.warn('[Lumina Dict] Audio error:', err);
                    }
                }
            };
        });
    },

    buildEntryHTML(entry, word) {
        const totalDefinitions = entry.senses.reduce((acc, s) => acc + s.definitions.length, 0);
        let senseMeaningIndex = 1;
        
        return `
            <div class="lumina-dict-popup-meta">
                <div class="lumina-dict-header-row">
                    <span class="lumina-dict-popup-title">${entry.word || word}</span>
                    ${entry.pos ? `<span class="lumina-dict-popup-pos">${entry.pos}</span>` : ''}
                </div>
                <div class="lumina-dict-popup-prons">
                    ${(this.currentSource === 'ai' || entry.uk?.ipa || entry.uk?.audio) ? `
                        <div class="lumina-dict-pron-group uk">
                            <span class="lumina-dict-lang">UK</span>
                            <button class="lumina-dict-popup-audio" 
                                ${entry.uk?.audio ? `data-url="${entry.uk.audio}"` : `data-text="${entry.word || word}" data-lang="en-GB"`}>
                                ${this.getSpeakerSVG()}
                            </button>
                            ${entry.uk?.ipa ? `<span class="lumina-dict-ipa">/${entry.uk.ipa.replace(/^\/|\/$/g, '')}/</span>` : ''}
                        </div>
                    ` : ''}
                    ${(this.currentSource === 'ai' || entry.us?.ipa || entry.us?.audio) ? `
                        <div class="lumina-dict-pron-group us">
                            <span class="lumina-dict-lang">US</span>
                            <button class="lumina-dict-popup-audio" 
                                ${entry.us?.audio ? `data-url="${entry.us.audio}"` : `data-text="${entry.word || word}" data-lang="en-US"`}>
                                ${this.getSpeakerSVG()}
                            </button>
                            ${entry.us?.ipa ? `<span class="lumina-dict-ipa">/${entry.us.ipa.replace(/^\/|\/$/g, '')}/</span>` : ''}
                        </div>
                    ` : ''}
                </div>
            </div>
            <div class="lumina-dict-popup-senses">
                ${entry.senses.map(sense => {
            let senseMeaningIndex = 1;
            return `
                    <div class="lumina-dict-popup-sense">
                        ${sense.indicator ? `<div class="lumina-dict-sense-indicator">${sense.indicator}</div>` : ''}
                        ${sense.definitions.map(def => {
                const html = `
                                <div class="lumina-dict-popup-meaning">
                                    <div class="lumina-dict-meaning-header">
                                        ${sense.definitions.length > 1 ? `<span class="lumina-dict-meaning-number">${senseMeaningIndex}.</span>` : ''}
                                        <span class="lumina-dict-meaning-text">${def.meaning}</span>
                                    </div>
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
