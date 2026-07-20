
window.LuminaDictionaryPopup = {
    instance: null,
    currentWord: '',
    currentSource: 'dictionary',
    resultsCache: new Map(),
    ongoingRequests: new Set(),
    isManualSelection: false,
    getFallbackSource(source) {
        return null;
    },
    async show(word, options = {}) {
        if (this.instance) {
            this.instance.remove();
        }
        if (this.currentWord !== word) {
            this.currentWord = word;
        }
        let initialSource = options.source || 'dictionary';
        if (initialSource === 'freedict' || initialSource === 'ai' || initialSource === 'cambridge' || initialSource === 'oxford') {
            initialSource = 'dictionary';
        }
        const saved = await chrome.storage.local.get(['preferredDictSource']);
        if (saved.preferredDictSource && saved.preferredDictSource !== 'freedict' && saved.preferredDictSource !== 'ai') {
            initialSource = saved.preferredDictSource;
        }
        if (initialSource === 'cambridge' || initialSource === 'oxford') {
            initialSource = 'dictionary';
        }
        this.currentSource = initialSource;
        this.isManualSelection = false;
        if (!this.messageListenerAdded) {
            chrome.runtime.onMessage.addListener((msg) => {
                if (msg.action === 'background_log') {
                    console.log(`%c[BG Bridge]%c ${msg.message}`, "color: #ff9800; font-weight: bold;", "color: inherit;");
                }
            });
            this.messageListenerAdded = true;
        }
        const dimensions = await chrome.storage.local.get(['dictPopupWidth', 'dictPopupHeight']);
        const width = dimensions.dictPopupWidth || 420;
        const height = dimensions.dictPopupHeight || 460;
        const popup = document.createElement('div');
        popup.id = 'lumina-dictionary-popup';
        popup.className = 'lumina-dictionary-popup';
        let x = options.x || (window.innerWidth / 2 - width / 2);
        let y = options.y || (window.innerHeight / 2 - height / 2);
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
                        <div class="lumina-loading-spinner"></div>
                    </div>
                </div>
            </div>
            <div class="lumina-dict-footer" style="${this.currentSource === 'translate' ? 'display: none !important;' : ''}">
                <div class="lumina-dict-tabs">
                    <button class="lumina-dict-tab-btn ${this.currentSource === 'dictionary' ? 'active' : ''}" data-source="dictionary">Dictionary</button>
                    <button class="lumina-dict-tab-btn ${this.currentSource === 'images' ? 'active' : ''}" data-source="images">Images</button>
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
        this.fetchData(this.currentSource);
    },
    switchSource(source) {
        if (!this.instance || source === this.currentSource) return;
        const tabs = this.instance.querySelectorAll('.lumina-dict-tab-btn');
        const targetTab = Array.from(tabs).find(t => t.dataset.source === source);
        if (!targetTab) return;
        tabs.forEach(t => t.classList.remove('active'));
        targetTab.classList.add('active');
        this.currentSource = source;
        if (source !== 'images' && source !== 'translate') {
            chrome.storage.local.set({ preferredDictSource: source });
        }
        this.fetchData(source);
    },
    setupEvents() {
        if (!this.instance) return;
        const tabs = this.instance.querySelectorAll('.lumina-dict-tab-btn');
        tabs.forEach(tab => {
            tab.onclick = () => {
                this.isManualSelection = true;
                this.switchSource(tab.dataset.source);
            };
        });
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
                <div class="lumina-loading-spinner"></div>
            </div>
        `;
    },
    async fetchData(source = this.currentSource) {
        const cacheKey = `${this.currentWord}_${source}`;
        const now = Date.now();
        const cached = this.resultsCache.get(cacheKey);
        if (cached && (now - cached.timestamp < 3600000)) {
            console.log(`[Lumina Dict] Cache hit for ${cacheKey}`);
            if (source === this.currentSource) {
                if (source === 'images') this.renderImages(cached.data);
                else if (source === 'translate') this.renderTranslation(cached.data);
                else this.renderData(cached.data);
            }
            return;
        }
        const requestKey = `${this.currentWord}_${source}`;
        if (this.ongoingRequests.has(requestKey)) return;
        this.ongoingRequests.add(requestKey);
        if (source === this.currentSource) {
            this.showLoading(source);
        }
        try {
            if (source === 'images') {
                const images = await searchGoogleImages(this.currentWord);
                this.resultsCache.set(cacheKey, { data: images, timestamp: Date.now() });
                if (source === this.currentSource) this.renderImages(images);
                return;
            }
            const actionMap = {
                'dictionary': 'fetch_dictionary',
                'translate': 'translate'
            };
            const action = actionMap[source];
            let payload;
            if (source === 'translate') {
                payload = { action, text: this.currentWord, targetLang: 'vi' };
            } else {
                payload = { action, word: this.currentWord };
            }
            const response = await new Promise((resolve) => {
                chrome.runtime.sendMessage(payload, (res) => {
                    if (chrome.runtime.lastError) {
                        resolve({ success: false, error: chrome.runtime.lastError.message });
                    } else {
                        resolve(res);
                    }
                });
            });
            if (response && !response.error) {
                if (source === 'translate') {
                    this.resultsCache.set(cacheKey, { data: response, timestamp: Date.now() });
                    if (source === this.currentSource) this.renderTranslation(response);
                    return;
                }
                const finalData = response.data ? FreeDictParser.parse(response.data) : null;
                if (finalData) {
                    this.resultsCache.set(cacheKey, { data: finalData, timestamp: Date.now() });
                    if (source === this.currentSource) this.renderData(finalData);
                }
                if (!finalData || !finalData.entries || finalData.entries.length === 0) {
                    if (source === this.currentSource) {
                        const emptyData = finalData || { word: this.currentWord, entries: [] };
                        this.renderData(emptyData);
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
            if (fallbackSource && source === this.currentSource) {
                console.log(`[Lumina Dict] Source ${source} failed/blocked. Trying fallback: ${fallbackSource}`);
                this.switchSource(fallbackSource);
                return;
            }
            if (source === this.currentSource) {
                const scrollArea = this.instance.querySelector('.lumina-dict-scroll-area');
                if (scrollArea) {
                    let title = "Fetch Failed";
                    let desc = err.message;
                    let icon = "⚠️";
                    if (isForbidden) {
                        title = "Access Restricted";
                        desc = `The connection to ${source} was blocked. Please try another network.`;
                        icon = "🚫";
                    }
                    scrollArea.innerHTML = `
                        <div class="lumina-dict-status-container status-error">
                            <div class="lumina-dict-status-card">
                                <div class="lumina-dict-status-icon">${icon}</div>
                                <div class="lumina-dict-status-title">${title}</div>
                                <div class="lumina-dict-status-desc">${desc}</div>
                            </div>
                        </div>
                    `;
                }
            }
        } finally {
            this.ongoingRequests.delete(requestKey);
        }
    },
    renderImages(images) {
        if (!this.instance) return;
        const scrollArea = this.instance.querySelector('.lumina-dict-scroll-area');
        if (!images || images.length === 0) {
            scrollArea.innerHTML = `
                <div class="lumina-dict-status-container status-empty">
                    <div class="lumina-dict-status-card">
                        <div class="lumina-dict-status-icon">📸</div>
                        <div class="lumina-dict-status-title">No Results Found</div>
                    </div>
                </div>
            `;
            return;
        }
        const displayImages = images.slice(0, 4);
        scrollArea.innerHTML = `
            <div class="lumina-dict-images-grid">
                ${displayImages.map(img => `
                    <div class="lumina-dict-image-card">
                        <div class="lumina-loading-spinner"></div>
                        <img src="${img}" loading="lazy">
                    </div>
                `).join('')}
            </div>
        `;
        const cards = scrollArea.querySelectorAll('.lumina-dict-image-card');
        cards.forEach(card => {
            const img = card.querySelector('img');
            const spinner = card.querySelector('.lumina-loading-spinner');
            if (img) {
                img.onload = () => {
                    if (spinner) spinner.style.setProperty('display', 'none', 'important');
                };
                img.onerror = () => {
                    card.style.setProperty('display', 'none', 'important');
                };
                img.onclick = () => {
                    window.open(img.src, '_blank');
                };
            }
        });
    },
    renderTranslation(data) {
        if (!this.instance) return;
        const scrollArea = this.instance.querySelector('.lumina-dict-scroll-area');
        if (!scrollArea) return;
        const escapeHTML = (str) => {
            if (!str) return '';
            return str
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        };
        const safeOriginal = (data.original || this.currentWord || '').replace(/"/g, '&quot;');
        const safeTranslation = (data.translation || '').replace(/"/g, '&quot;');
        let sourceHTML = escapeHTML(data.original || this.currentWord || '');
        let targetHTML = escapeHTML(data.translation || '');
        const isPreSplit = data.sentences && Array.isArray(data.sentences);
        if (isPreSplit) {
            sourceHTML = data.sentences.map((s, idx) => `<span class="lumina-trans-sentence" data-idx="${idx}">${escapeHTML(s.src || '')}</span>`).join(' ');
            targetHTML = data.sentences.map((s, idx) => `<span class="lumina-trans-sentence" data-idx="${idx}">${escapeHTML(s.tgt || '')}</span>`).join(' ');
        }
        scrollArea.innerHTML = `
            <div class="lumina-dict-content-wrapper lumina-dict-translation-wrapper" style="padding: 12px;">
                <div class="lumina-translation-container" style="margin: 0; width: 100%;">
                    <div class="lumina-translation-card" ${isPreSplit ? 'data-is-pre-split="true"' : ''}>
                        <!-- Source Block (left) -->
                        <div class="lumina-translation-block" style="padding: 0 8px 0 0;">
                            <div class="lumina-translation-source" data-copy-text="${safeOriginal}">
                                <div class="lumina-translation-text">${sourceHTML}</div>
                            </div>
                        </div>
                        <!-- Vertical Divider -->
                        <div class="lumina-translation-divider"></div>
                        <!-- Target Block (right) -->
                        <div class="lumina-translation-block" style="padding: 0 0 0 8px;">
                            <div class="lumina-translation-target" data-copy-text="${safeTranslation}">
                                <div class="lumina-translation-text">${targetHTML}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        const cardContainer = scrollArea.querySelector('.lumina-translation-card');
        if (cardContainer && typeof LuminaChatUI !== 'undefined') {
            LuminaChatUI._setupTranslationHighlight(cardContainer);
            LuminaChatUI.balanceTranslationCard(cardContainer);
        }
    },
    renderData(data) {
        if (!this.instance) return;
        const scrollArea = this.instance.querySelector('.lumina-dict-scroll-area');
        if (!data || !data.entries || data.entries.length === 0) {
            scrollArea.innerHTML = `
                <div class="lumina-dict-status-container status-empty">
                    <div class="lumina-dict-status-card">
                        <div class="lumina-dict-status-icon">🔍</div>
                        <div class="lumina-dict-status-title">No Results Found</div>
                        <div class="lumina-dict-status-desc">Try checking spelling or choose another source.</div>
                    </div>
                </div>
            `;
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
    shortenPOS(pos) {
        if (!pos) return '';
        const map = {
            'noun': 'n.',
            'verb': 'v.',
            'adjective': 'adj.',
            'adverb': 'adv.',
            'preposition': 'prep.',
            'prepositional phrase': 'prep. phr.',
            'conjunction': 'conj.',
            'pronoun': 'pron.',
            'interjection': 'interj.',
            'phrasal verb': 'phr. v.',
            'idiom': 'idm.',
            'idiomatic expression': 'idm. expr.',
            'exclamation': 'excl.',
            'determiner': 'det.',
            'number': 'num.'
        };
        let lower = pos.toLowerCase().trim();
        if (lower.includes('(')) {
            lower = lower.split('(')[0].trim();
        }
        return map[lower] || lower;
    },
    getSpeakerSVG(color = 'currentColor') {
        return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="${color}" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`;
    },
    setupAudioListeners(container) {
        const audioBtns = container.querySelectorAll('.lumina-dict-popup-audio');
        
        let _audioCtx = null;
        const getAudioCtx = () => {
            if (!_audioCtx || _audioCtx.state === 'closed') {
                _audioCtx = new AudioContext();
            }
            return _audioCtx;
        };

        let currentAudio = null;
        let audioAborted = false;

        const playBase64Audio = (base64Data, speed = 1.0) => {
            return new Promise(async (resolve, reject) => {
                if (audioAborted) { resolve(); return; }
                try {
                    const parts = base64Data.split(',');
                    const byteString = atob(parts[1]);
                    const byteArray = new Uint8Array(byteString.length);
                    for (let i = 0; i < byteString.length; i++) byteArray[i] = byteString.charCodeAt(i);
                    let silenceOffset = 0;
                    try {
                        const ctx = getAudioCtx();
                        const audioBuffer = await ctx.decodeAudioData(byteArray.buffer.slice(0));
                        const channelData = audioBuffer.getChannelData(0);
                        const THRESHOLD = 0.005;
                        for (let i = 0; i < channelData.length; i++) {
                            if (Math.abs(channelData[i]) > THRESHOLD) {
                                silenceOffset = i / audioBuffer.sampleRate;
                                break;
                            }
                        }
                    } catch (e) { }
                    if (audioAborted) { resolve(); return; }
                    const mime = parts[0].split(':')[1].split(';')[0];
                    const blob = new Blob([byteArray], { type: mime });
                    const blobUrl = URL.createObjectURL(blob);
                    const audio = new Audio(blobUrl);
                    audio.playbackRate = speed;
                    if (silenceOffset > 0) audio.currentTime = silenceOffset;
                    currentAudio = audio;
                    audio.onended = () => { currentAudio = null; URL.revokeObjectURL(blobUrl); resolve(); };
                    audio.onerror = (e) => { currentAudio = null; URL.revokeObjectURL(blobUrl); reject(e); };
                    audio.play().catch(reject);
                } catch (e) {
                    try {
                        const audio = new Audio(base64Data);
                        audio.playbackRate = speed;
                        currentAudio = audio;
                        audio.onended = () => { currentAudio = null; resolve(); };
                        audio.onerror = (err) => { currentAudio = null; reject(err); };
                        audio.play().catch(reject);
                    } catch (err) {
                        reject(err);
                    }
                }
            });
        };

        const playWordAudio = async (wordText, originalUrl, language) => {
            if (!wordText) return;
            const normalizedText = wordText.trim();
            audioAborted = false;
            if (currentAudio) {
                currentAudio.pause();
                currentAudio = null;
            }
            let speed = 1.1;
            try {
                const data = await chrome.storage.local.get(['audioSpeed']);
                speed = data.audioSpeed || 1.1;
            } catch (e) { }

            // 1. Check cache first
            try {
                const cached = await chrome.runtime.sendMessage({ action: 'getAudioCache', text: normalizedText });
                if (cached && cached.success && cached.data) {
                    const chunks = Array.isArray(cached.data) ? cached.data : [cached.data];
                    for (const chunk of chunks) await playBase64Audio(chunk, speed);
                    return;
                }
            } catch (e) { }

            // 2. Fetch via background
            try {
                let result = null;
                if (originalUrl) {
                    try {
                        result = await chrome.runtime.sendMessage({ action: 'fetchAudioBase64', url: originalUrl });
                        if (result && result.success && result.data) {
                            result = { type: 'oxford', chunks: [result.data] };
                        } else {
                            result = null;
                        }
                    } catch (e) {
                        result = null;
                    }
                }

                if (!result) {
                    result = await chrome.runtime.sendMessage({ action: 'fetchAudio', text: normalizedText, speed, lang: language });
                }

                if (!result || !result.chunks || result.chunks.length === 0) return;
                
                // Play
                for (const chunk of result.chunks) await playBase64Audio(chunk, speed);
                
                // Cache
                chrome.runtime.sendMessage({ action: 'setAudioCache', text: normalizedText, type: result.type, data: result.chunks }).catch(() => { });
            } catch (err) {
                console.error('[Popup Audio] Play audio failed:', err);
            }
        };

        audioBtns.forEach(btn => {
            btn.onclick = async (e) => {
                e.stopPropagation();
                const { url, text, lang } = btn.dataset;
                playWordAudio(text, url, lang);
            };
        });
    },
    buildEntryHTML(entry, word) {
        const totalDefinitions = (entry.senses || []).reduce((acc, s) => acc + (s.definitions?.length || 0), 0);
        let senseMeaningIndex = 1;
        return `
            <div class="lumina-dict-popup-meta">
                <div class="lumina-dict-header-row">
                    <span class="lumina-dict-popup-title">${entry.word || word}</span>
                    ${entry.pos ? `<span class="lumina-dict-popup-pos">${this.shortenPOS(entry.pos)}</span>` : ''}
                </div>
                <div class="lumina-dict-popup-prons">
                    ${(entry.uk?.ipa || entry.uk?.audio) ? `
                        <div class="lumina-dict-pron-group uk">
                            <span class="lumina-dict-lang">UK</span>
                            <button class="lumina-dict-popup-audio"
                                data-text="${entry.word || word}" data-lang="en-GB"
                                ${entry.uk?.audio ? `data-url="${entry.uk.audio}"` : ''}>
                                ${this.getSpeakerSVG()}
                            </button>
                            ${entry.uk?.ipa ? `<span class="lumina-dict-ipa">/${entry.uk.ipa.replace(/^\/|\/$/g, '')}/</span>` : ''}
                        </div>
                    ` : ''}
                    ${(entry.us?.ipa || entry.us?.audio) ? `
                        <div class="lumina-dict-pron-group us">
                            <span class="lumina-dict-lang">US</span>
                            <button class="lumina-dict-popup-audio"
                                data-text="${entry.word || word}" data-lang="en-US"
                                ${entry.us?.audio ? `data-url="${entry.us.audio}"` : ''}>
                                ${this.getSpeakerSVG()}
                            </button>
                            ${entry.us?.ipa ? `<span class="lumina-dict-ipa">/${entry.us.ipa.replace(/^\/|\/$/g, '')}/</span>` : ''}
                        </div>
                    ` : ''}
                </div>
            </div>
            <div class="lumina-dict-popup-senses">
                ${(entry.senses || []).map(sense => {
                    let senseMeaningIndex = 1;
                    return `
                        <div class="lumina-dict-popup-sense">
                            ${sense.indicator ? `<div class="lumina-dict-sense-indicator">${sense.indicator}</div>` : ''}
                            ${(sense.definitions || []).map(def => {
                                const html = `
                                    <div class="lumina-dict-popup-meaning">
                                        <div class="lumina-dict-meaning-header">
                                            ${sense.definitions.length > 1 ? `<span class="lumina-dict-meaning-number">${senseMeaningIndex}.</span>` : ''}
                                            <span class="lumina-dict-meaning-text">${def.meaning}</span>
                                        </div>
                                        ${def.examples && def.examples.length > 0 ? `
                                            <div class="lumina-dict-popup-examples">
                                                ${def.examples.map(ex => {
                                                    const escaped = (entry.word || word || '').replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                                                    const regex = new RegExp(`(${escaped}(?:ing|ed|s|es|d)?)`, 'gi');
                                                    const highlighted = ex.replace(regex, '<strong>$1</strong>');
                                                    return `<div class="lumina-dict-popup-example">${highlighted}</div>`;
                                                }).join('')}
                                            </div>
                                        ` : ''}
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
    },
};