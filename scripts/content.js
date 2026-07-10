(() => {
    let fontStyleElement = null;
    function injectFonts() {
        if (fontStyleElement || document.getElementById('lumina-fonts')) return;
        const fontCss = `@import url('https://fonts.googleapis.com/css2?family=Google+Sans+Code:ital,wght@0,300..800;1,300..800&family=Montserrat:ital,wght@0,100..900;1,100..900&family=Roboto:ital,wght@0,100..900;1,100..900&family=Source+Code+Pro:ital,wght@0,200..900;1,200..900&display=swap');`;
        fontStyleElement = document.createElement('style');
        fontStyleElement.id = 'lumina-fonts';
        fontStyleElement.textContent = fontCss;
        if (document.head) {
            document.head.appendChild(fontStyleElement);
        } else {
            const headObserver = new MutationObserver(() => {
                if (document.head) {
                    if (!document.getElementById('lumina-fonts')) {
                        document.head.appendChild(fontStyleElement);
                    }
                    headObserver.disconnect();
                }
            });
            headObserver.observe(document.documentElement, { childList: true });
        }
    }
    function removeFonts() {
        if (fontStyleElement) {
            fontStyleElement.remove();
            fontStyleElement = null;
        }
    }
    injectFonts();
    window.katexLoaded = true;
    class EventCleanupManager {
        constructor() {
            this.listeners = new WeakMap();
        }
        addEventListener(element, event, listener, options = false) {
            if (!element || !event || !listener) return;
            element.addEventListener(event, listener, options);
            if (!this.listeners.has(element)) {
                this.listeners.set(element, new Map());
            }
            const elementListeners = this.listeners.get(element);
            if (!elementListeners.has(event)) {
                elementListeners.set(event, new Set());
            }
            elementListeners.get(event).add({ listener, options });
        }
        removeEventListener(element, event, listener, options = false) {
            if (!element || !event || !listener) return;
            element.removeEventListener(event, listener, options);
            const elementListeners = this.listeners.get(element);
            if (elementListeners && elementListeners.has(event)) {
                const eventListeners = elementListeners.get(event);
                for (const item of eventListeners) {
                    if (item.listener === listener) {
                        eventListeners.delete(item);
                        break;
                    }
                }
            }
        }
        cleanupElement(element) {
            if (!element) return;
            const elementListeners = this.listeners.get(element);
            if (!elementListeners) return;
            for (const [event, listeners] of elementListeners) {
                for (const { listener, options } of listeners) {
                    element.removeEventListener(event, listener, options);
                }
            }
            this.listeners.delete(element);
        }
        cleanupTree(container) {
            if (!container) return;
            this.cleanupElement(container);
            const allElements = container.querySelectorAll('*');
            allElements.forEach(element => this.cleanupElement(element));
        }
    }
    const eventCleanup = new EventCleanupManager();
    let currentCachedZoom = 1;
    function updateCachedZoom(callback) {
        if (!chrome.runtime || !chrome.runtime.id) {
            if (callback) callback(getPageZoom());
            return;
        }
        try {
            chrome.runtime.sendMessage({ action: 'get_zoom' }, (zoom) => {
                if (chrome.runtime.lastError) {
                    if (callback) callback(getPageZoom());
                    return;
                }
                if (typeof zoom === 'number') {
                    currentCachedZoom = zoom;
                }
                if (callback) callback(currentCachedZoom);
            });
        } catch (e) {
            if (callback) callback(getPageZoom());
        }
    }
    updateCachedZoom();
    window.addEventListener('resize', () => {
        updateCachedZoom(() => {
            if (luminaShadowRoot) {
                const spotlight = luminaShadowRoot.querySelector('.lumina-spotlight-overlay');
                if (spotlight && typeof applyPopupStyles === 'function') {
                    applyPopupStyles(spotlight, true);
                }
            }
            if (window.LuminaSelection) {
                LuminaSelection.hide();
            }
        });
    });
    function getPageZoom() {
        if (currentCachedZoom && currentCachedZoom !== 1) return currentCachedZoom;
        const dpr = window.devicePixelRatio || 1;
        const isMac = /mac/i.test(navigator.platform);
        if (isMac) {
            const baseDpr = Math.round(dpr) || 1;
            return dpr / baseDpr;
        }
        return 1;
    }
    let readWebpageEnabled = false;
    let askSelectionPopupEnabled = false;
    let askSelectionText = '';
    let askSelectionContext = '';
    let currentRange = null;
    let currentText = "";
    let currentSpeed = 1.0;
    let isExtensionDisabled = false;
    let luminaHost = null;
    let luminaShadowRoot = null;
    function isRuntimeAvailable() {
        return typeof chrome !== 'undefined' && !!chrome.runtime && !!chrome.runtime.id;
    }
    function safeRuntimeSendMessage(message, callback) {
        if (!isRuntimeAvailable()) return false;
        try {
            chrome.runtime.sendMessage(message, callback);
            return true;
        } catch (error) {
            const messageText = String(error?.message || error || '');
            if (!messageText.includes('Extension context invalidated')) {
                console.warn('[Lumina content] sendMessage failed:', error);
            }
            return false;
        }
    }
    function isSidePanelOpen() {
        return new Promise((resolve) => {
            const sent = safeRuntimeSendMessage({ action: 'check_sidepanel_status' }, (response) => {
                if (chrome.runtime?.lastError) {
                    resolve(false);
                    return;
                }
                resolve(!!(response && response.open));
            });
            if (!sent) resolve(false);
        });
    }
    function triggerSidePanelQuery(query, displayQuery = null, mode = 'qa', range = null, shouldHighlight = true) {
        if (shouldHighlight && window.LuminaAnnotation) {
            const finalRange = range || (window.getSelection().rangeCount > 0 ? window.getSelection().getRangeAt(0) : null);
            if (finalRange && !finalRange.collapsed) {
                const color = '#FFFB78';
                window.LuminaAnnotation.highlight(finalRange, color);
                const selection = window.getSelection();
                if (selection) selection.removeAllRanges();
            }
        }
        safeRuntimeSendMessage({
            action: 'open_sidepanel_with_query',
            query: query,
            displayQuery: displayQuery || query,
            mode: mode
        });
    }
    function initShadowDOM() {
        if (luminaHost || document.getElementById('lumina-host') || document.getElementById('lumina-shadow-host')) return;
        luminaHost = document.createElement('div');
        luminaHost.id = 'lumina-shadow-host';
        luminaHost.style.cssText = 'position: fixed; top: 0; left: 0; width: 0; height: 30px; z-index: 2147483647; pointer-events: none; border: none; padding: 0; margin: 0; overflow: visible;';
        applyAskSelectionStyles();
        luminaShadowRoot = luminaHost.attachShadow({ mode: 'open' });
        document.documentElement.appendChild(luminaHost);
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = chrome.runtime.getURL('assets/styles/styles.css');
        luminaShadowRoot.appendChild(link);
        if (window.LuminaSelection) {
            LuminaSelection.init({
                shadowRoot: luminaShadowRoot,
                onSubmit: (query, displayQuery, isDictionary, sourceEntry, range, isTranslate, isAudio) => {
                    if (isAudio) {
                        playCombinedAudio(displayQuery);
                        return;
                    }
                    if (isTranslate) {
                        triggerSidePanelQuery(query, displayQuery, 'translate', range);
                        return;
                    }
                    if (isDictionary) {
                        const selection = window.getSelection();
                        const text = selection.toString().trim() || displayQuery;
                        if (text) {
                            const rangeToUse = range || (selection.rangeCount > 0 ? selection.getRangeAt(0) : null);
                            const rect = rangeToUse ? rangeToUse.getBoundingClientRect() : { left: window.innerWidth / 2, bottom: window.innerHeight / 2 };
                            LuminaDictionaryPopup.show(text, {
                                x: rect.left,
                                y: rect.bottom + 5,
                                source: 'cambridge'
                            });
                            return;
                        }
                    }
                    triggerSidePanelQuery(query, displayQuery, isDictionary ? 'dictionary' : 'qa', range);
                }
            });
        }
        const katexLink = document.createElement('link');
        katexLink.rel = 'stylesheet';
        katexLink.href = chrome.runtime.getURL('lib/katex/katex.min.css');
        luminaShadowRoot.appendChild(katexLink);
        window.luminaStylesLoaded = new Promise((resolve) => {
            link.addEventListener('load', () => {
                resolve();
            });
        });
        (document.documentElement || document.body).appendChild(luminaHost);
        initThemeObserver();
    }
    function preprocessMathContent(text) {
        let processed = text.replace(/(\\\[)([\s\S]*?)(\\\])/g, (match, start, content, end) => {
            let safeContent = content.replace(/%/g, '\\\\%');
            return `\\\\[${safeContent}\\\\]`;
        });
        processed = processed.replace(/(\\\()([\s\S]*?)(\\\))/g, (match, start, content, end) => {
            let safeContent = content.replace(/%/g, '\\\\%');
            return `\\\\(${safeContent}\\\\)`;
        });
        processed = processed.replace(/(\$\$)([\s\S]*?)(\$\$)/g, (match, start, content, end) => {
            let safeContent = content.replace(/%/g, '\\\\%');
            return `$$${safeContent}$$`;
        });
        return processed;
    }
    window.addEventListener('mouseup', (e) => {
        if (isExtensionDisabled) return;
        const path = e.composedPath();
        const isInsideShadow = path.some(el => el.id === 'lumina-shadow-host');
        if (isInsideShadow) return;
        if (askSelectionPopupEnabled) {
            const sel = window.getSelection();
            const selText = sel ? sel.toString().trim() : '';
            if (selText.length > 0) {
                e.stopPropagation();
            }
        }
        const activeElement = window.LuminaSelection ? LuminaSelection.getDeepActiveElement() : document.activeElement;
        const isInput = activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA');
        setTimeout(() => {
            if (window.LuminaSelection) {
                if (isInput) {
                    LuminaSelection.expandInputToWordBoundaries(activeElement);
                } else {
                    LuminaSelection.expandToWordBoundaries();
                }
            }
            let text = '';
            let range = null;
            if (isInput) {
                const start = activeElement.selectionStart;
                const end = activeElement.selectionEnd;
                if (start !== undefined && end !== undefined && start !== end) {
                    text = activeElement.value.substring(start, end).trim();
                }
                range = null;
            } else {
                const finalSelection = window.getSelection();
                text = finalSelection.toString().trim();
                range = finalSelection.rangeCount > 0 ? finalSelection.getRangeAt(0) : null;
            }
            if (!askSelectionPopupEnabled || text.length === 0) {
                const isHighlight = e.target.closest('.lumina-highlight') || (window.LuminaAnnotation && LuminaAnnotation.getHighlightAtCoords(e.clientX, e.clientY));
                if (window.LuminaSelection && !isHighlight) LuminaSelection.hide();
                return;
            }
            if (text.length > 0 && (range || isInput) && window.LuminaSelection) {
                if (e.clientX && e.clientY) {
                    LuminaSelection.mouseCoords = { x: e.clientX, y: e.clientY };
                }
                LuminaSelection.show(e.clientX, e.clientY, text, range);
            } else if (!isInsideShadow) {
                const isHighlight = e.target.closest('.lumina-highlight');
                if (window.LuminaSelection && !isHighlight) LuminaSelection.hide();
            }
        }, 50);
    }, true);
    window.addEventListener('mousedown', (e) => {
        const path = e.composedPath();
        const isInsideAskBtn = path.some(el => (el.id === 'lumina-action-bar') || (el.id === 'lumina-ask-input-popup') || (window.LuminaSelection && el === LuminaSelection.btn));
        const isHighlight = window.LuminaAnnotation && LuminaAnnotation.getHighlightAtCoords(e.clientX, e.clientY);
        if (!isInsideAskBtn && !isHighlight) {
            if (window.LuminaSelection) LuminaSelection.hide();
        }
    }, true);
    chrome.storage.local.get(['readWebpage', 'askSelectionPopupEnabled'], (result) => {
        readWebpageEnabled = result.readWebpage ?? false;
        askSelectionPopupEnabled = result.askSelectionPopupEnabled ?? false;
        if (window.LuminaAnnotation) {
            LuminaAnnotation.loadHighlights();
        } else {
            const checkSelection = setInterval(() => {
                if (window.LuminaSelection) {
                    if (window.LuminaAnnotation) LuminaAnnotation.loadHighlights();
                    clearInterval(checkSelection);
                }
            }, 100);
            setTimeout(() => clearInterval(checkSelection), 5000);
        }
    });
    let lastUrl = window.location.href;
    setInterval(() => {
        if (window.location.href !== lastUrl) {
            lastUrl = window.location.href;
            if (window.LuminaAnnotation) {
                LuminaAnnotation.clearAllHighlights();
                LuminaAnnotation.loadHighlights();
            }
        }
    }, 500);
    chrome.storage.onChanged.addListener((changes, area) => {
        if (!chrome.runtime || !chrome.runtime.id) return;
        if (area === 'local') {
            if (changes.readWebpage) {
                readWebpageEnabled = changes.readWebpage.newValue ?? false;
            }
            if (changes.askSelectionPopupEnabled) {
                askSelectionPopupEnabled = changes.askSelectionPopupEnabled.newValue ?? false;
                if (!askSelectionPopupEnabled && window.LuminaSelection) LuminaSelection.hide();
            }
            if (changes.questionMappings) questionMappings = changes.questionMappings.newValue || [];
            if (changes.shortcuts) {
                Object.assign(shortcuts, changes.shortcuts.newValue || LUMINA_DEFAULT_SHORTCUTS);
            }
            if (changes.annotationShortcuts) {
                shortcuts.annotationShortcuts = changes.annotationShortcuts.newValue || [];
            }
            if (changes.fontSize || changes.fontSizeByDomain || changes.globalDefaults) {
                applyAskSelectionStyles();
            }
            const hasThemeChange = changes.theme ||
                                   changes.contrast ||
                                   changes.accentColor ||
                                   (changes.globalDefaults && changes.globalDefaults.newValue && (
                                       changes.globalDefaults.newValue.theme !== changes.globalDefaults.oldValue?.theme ||
                                       changes.globalDefaults.newValue.contrast !== changes.globalDefaults.oldValue?.contrast ||
                                       changes.globalDefaults.newValue.accentColor !== changes.globalDefaults.oldValue?.accentColor
                                   ));
            if (hasThemeChange) {
                cachedTheme = null;
                cachedContrast = null;
                cachedAccent = null;
                if (typeof updateTheme === 'function') updateTheme();
            }
        }
    });
    chrome.storage.local.get(['disabledDomains'], (items) => {
        const disabledDomains = items.disabledDomains || [];
        if (disabledDomains.includes(window.location.hostname)) {
            isExtensionDisabled = true;
            removeFonts();
        }
    });
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (!chrome.runtime || !chrome.runtime.id) return;
        if (request.action === 'toggle_extension_state') {
            isExtensionDisabled = !request.isEnabled;
            if (isExtensionDisabled) {
                removeFonts();
                if (window.LuminaSelection) LuminaSelection.hide();
            } else {
                injectFonts();
            }
        } else if (request.action === 'get_page_content') {
            extractMainContent().then(result => {
                sendResponse({ text: result.content || '' });
            }).catch(err => {
                console.error('[Lumina] extractMainContent failed:', err);
                sendResponse({ text: document.body.innerText || '' });
            });
            return true;
        }
        if (request.action === 'shortcuts_updated') {
            Object.assign(shortcuts, request.shortcuts);
        }
        if (request.action === 'settings_updated') {
            const settings = request.settings;
            if (settings.theme) {
                updateTheme();
            }
        }
        if (request.action === 'loadChatHistory') {
            const sessionId = request.sessionId;
            if (sessionId) {
                ChatHistoryManager.loadChat(sessionId).then(success => {
                    if (success) {
                    } else {
                        console.error('Failed to load chat history');
                    }
                });
            }
        }
        if (request.action === 'getGPSLocation') {
            if (!navigator.geolocation) {
                sendResponse({ error: 'Geolocation not supported' });
                return true;
            }
            navigator.geolocation.getCurrentPosition(
                async (position) => {
                    const lat = position.coords.latitude;
                    const lon = position.coords.longitude;
                    try {
                        const response = await fetch(
                            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=16&addressdetails=1&accept-language=en`,
                            { headers: { 'User-Agent': 'Lumina-Extension/1.0' } }
                        );
                        if (response.ok) {
                            const data = await response.json();
                            const address = data.address || {};
                            const cityNameMap = {
                                'Hà Nội': 'Hanoi',
                                'Thành phố Hồ Chí Minh': 'Ho Chi Minh City',
                                'Hồ Chí Minh': 'Ho Chi Minh City',
                                'Đà Nẵng': 'Da Nang',
                                'Hải Phòng': 'Hai Phong',
                                'Cần Thơ': 'Can Tho',
                                'Nha Trang': 'Nha Trang',
                                'Huế': 'Hue',
                                'Việt Nam': 'Vietnam'
                            };
                            const normalize = (name) => cityNameMap[name] || name;
                            const parts = [];
                            if (address.suburb) parts.push(normalize(address.suburb));
                            else if (address.neighbourhood) parts.push(normalize(address.neighbourhood));
                            else if (address.quarter) parts.push(normalize(address.quarter));
                            else if (address.city_district) parts.push(normalize(address.city_district));
                            if (address.city) parts.push(normalize(address.city));
                            else if (address.town) parts.push(normalize(address.town));
                            else if (address.village) parts.push(normalize(address.village));
                            if (address.country) parts.push(normalize(address.country));
                            const locationInfo = {
                                district: address.suburb || address.neighbourhood || address.city_district || '',
                                city: address.city || address.town || address.village || '',
                                region: address.state || address.region || '',
                                country: address.country || '',
                                latitude: lat,
                                longitude: lon,
                                formatted: parts.join(', '),
                                isGPS: true
                            };
                            await chrome.storage.local.set({
                                locationCache: locationInfo,
                                gpsEnabled: true
                            });
                            sendResponse({ location: locationInfo });
                        } else {
                            sendResponse({ error: 'Geocoding failed' });
                        }
                    } catch (err) {
                        console.error('[Lumina] Geocode error:', err);
                        sendResponse({ error: 'Geocoding failed' });
                    }
                },
                (error) => {
                    console.error('[Lumina] GPS error:', error);
                    const messages = {
                        1: 'Permission denied',
                        2: 'Position unavailable',
                        3: 'Request timeout'
                    };
                    sendResponse({ error: messages[error.code] || 'Location failed' });
                },
                { timeout: 10000, maximumAge: 0, enableHighAccuracy: true }
            );
            return true;
        }
    });
    const DEFAULT_SHORTCUTS = LUMINA_DEFAULT_SHORTCUTS;
    let shortcuts = { ...DEFAULT_SHORTCUTS };
    let questionMappings = [];
    chrome.storage.local.get(['shortcuts', 'annotationShortcuts'], (items) => {
        if (items.shortcuts) {
            Object.assign(shortcuts, items.shortcuts);
        }
        if (items.annotationShortcuts) {
            shortcuts.annotationShortcuts = items.annotationShortcuts;
        }
    });
    chrome.storage.local.get(['questionMappings'], (items) => {
        if (items.questionMappings) {
            questionMappings = items.questionMappings;
        }
    });
    let popupSearchQuery = '';
    const POPUP_HISTORY_BATCH_SIZE = 30;
    const popupHistoryState = new WeakMap();
    let modifierKeyPressedAlone = true;
    function matchesShortcut(event, action) {
        const shortcut = shortcuts[action];
        if (!shortcut) return false;
        if (shortcut.key === 'Shift' || shortcut.key === 'Control' || shortcut.key === 'Alt' || shortcut.key === 'Meta') {
            if (event.type !== 'keyup' || event.key !== shortcut.key || !modifierKeyPressedAlone) return false;
            const isSideSpecific = shortcut.code && (shortcut.code.endsWith('Left') || shortcut.code.endsWith('Right'));
            if (isSideSpecific && shortcut.code !== event.code) return false;
            return true;
        }
        if (!!shortcut.ctrlKey !== event.ctrlKey) return false;
        if (!!shortcut.altKey !== event.altKey) return false;
        if (!!shortcut.shiftKey !== event.shiftKey) return false;
        if (!!shortcut.metaKey !== event.metaKey) return false;
        if (event.type === 'mousedown' || event.type === 'mouseup' || event.type === 'click') {
            const buttonCode = 'Mouse' + event.button;
            return shortcut.code === buttonCode || shortcut.key === buttonCode;
        } else {
            if (shortcut.code) return event.code === shortcut.code;
            return event.key.toLowerCase() === shortcut.key.toLowerCase();
        }
    }
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Shift' || event.key === 'Control' || event.key === 'Alt' || event.key === 'Meta') {
            modifierKeyPressedAlone = true;
        } else {
            if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) {
                modifierKeyPressedAlone = false;
            }
        }
        const active = (typeof LuminaChatUI !== 'undefined' && typeof LuminaChatUI.getDeepActiveElement === 'function')
            ? LuminaChatUI.getDeepActiveElement()
            : document.activeElement;
        const isLuminaInput = active && (
            active.closest('.lumina-dict-popup') ||
            active.closest('#lumina-ask-input-popup') ||
            active.closest('.lumina-ask-input-container') ||
            active.classList.contains('lumina-ask-input-field') ||
            active.classList.contains('lumina-chat-input')
        );
        if (isLuminaInput) {
            if (matchesShortcut(event, 'translateInput')) {
                return;
            }
            if (event.key === 'Enter' || event.key === 'Escape' || event.key === 'Tab') {
                return;
            }
            event.stopPropagation();
            event.stopImmediatePropagation();
        }
    }, true);
    ['keyup', 'keypress'].forEach(type => {
        document.addEventListener(type, (e) => {
            const active = window.LuminaSelection ? LuminaSelection.getDeepActiveElement() : document.activeElement;
            const isLuminaInput = active && (
                active.closest('.lumina-dict-popup') ||
                active.closest('#lumina-ask-input-popup') ||
                active.closest('.lumina-ask-input-container') ||
                active.classList.contains('lumina-ask-input-field') ||
                active.classList.contains('lumina-chat-input')
            );
            if (isLuminaInput) {
                if (matchesShortcut(e, 'translateInput')) {
                    return;
                }
                if (e.key === 'Enter' || e.key === 'Escape' || e.key === 'Tab') {
                    return;
                }
                e.stopPropagation();
                e.stopImmediatePropagation();
            }
        }, true);
    });
    document.addEventListener('keyup', async (event) => {
        if (isExtensionDisabled) return;
        if (matchesShortcut(event, 'audio')) {
            if (event.__luminaAudioHandled) return;
            event.__luminaAudioHandled = true;
            let text = '';
            const active = window.LuminaSelection ? LuminaSelection.getDeepActiveElement() : document.activeElement;
            if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
                const start = active.selectionStart;
                const end = active.selectionEnd;
                if (start !== undefined && end !== undefined && start !== end) {
                    text = active.value.substring(start, end).trim();
                }
            }
            if (!text) {
                const selection = getActiveSelection();
                text = getSmartSelectionText() || selection.toString().trim();
            }
            if (text) {
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
                playCombinedAudio(text);
                return;
            } else {
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
                stopAudio();
                return;
            }
        }
        const luminaChatShortcut = shortcuts['luminaChat'];
        const isLoneModifierLuminaChat = luminaChatShortcut && ['Shift', 'Control', 'Alt', 'Meta'].includes(luminaChatShortcut.key);
        if (isLoneModifierLuminaChat && matchesShortcut(event, 'luminaChat')) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            safeRuntimeSendMessage({ action: 'open_sidepanel' });
            return;
        }
    });
    async function resetChatFunc(popup) {
        if (!popup) return;
        const history = popup.querySelector('.lumina-chat-history');
        if (history) history.innerHTML = '';
        const regenBtn = popup.querySelector('#lumina-regenerate-btn');
        if (regenBtn) regenBtn.style.display = 'none';
        const summaryEl = popup.querySelector('#lumina-chat-summary');
        if (summaryEl) summaryEl.textContent = '';
        currentContext = "";
        ChatHistoryManager.startNewSession();
        const input = popup.querySelector('.lumina-chat-input');
        if (input) input.focus();
    }
    document.addEventListener('keydown', async (event) => {
        if (isExtensionDisabled) return;
        const pairs = { '(': ')', '{': '}', '[': ']' };
        if (pairs[event.key]) {
            const activeEl = (typeof LuminaChatUI !== 'undefined' && typeof LuminaChatUI.getDeepActiveElement === 'function')
                ? LuminaChatUI.getDeepActiveElement()
                : document.activeElement;
            const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable);
            if (isInput) {
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
                const openChar = event.key;
                const closeChar = pairs[openChar];
                if (activeEl.isContentEditable) {
                    const sel = window.getSelection();
                    if (sel && sel.rangeCount > 0) {
                        const selectedText = sel.toString();
                        document.execCommand('insertText', false, openChar + selectedText + closeChar);
                        const range = sel.getRangeAt(0);
                        if (range.startContainer.nodeType === 3) {
                            const newOffset = Math.max(0, range.startOffset - 1);
                            range.setStart(range.startContainer, newOffset);
                            range.collapse(true);
                            sel.removeAllRanges();
                            sel.addRange(range);
                        }
                        activeEl.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                } else {
                    const start = activeEl.selectionStart;
                    const end = activeEl.selectionEnd;
                    const val = activeEl.value;
                    const before = val.substring(0, start);
                    const selectedText = val.substring(start, end);
                    const after = val.substring(end);
                    activeEl.value = before + openChar + selectedText + closeChar + after;
                    activeEl.focus();
                    const newCursor = start + 1 + selectedText.length;
                    activeEl.setSelectionRange(newCursor, newCursor);
                    activeEl.dispatchEvent(new Event('input', { bubbles: true }));
                }
                return;
            }
        }
        if (matchesShortcut(event, 'translateInput')) {
            const activeElement = (typeof LuminaChatUI !== 'undefined' && typeof LuminaChatUI.getDeepActiveElement === 'function')
                ? LuminaChatUI.getDeepActiveElement()
                : document.activeElement;
            const isInput = activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA' || activeElement.isContentEditable);
            if (isInput) {
                if (activeElement.__luminaTranslating) return;
                let textToTranslate = '';
                let hasSelection = false;
                let selectionStart = 0;
                let selectionEnd = 0;
                let paragraphNode = null;
                if (activeElement.isContentEditable) {
                    const sel = window.getSelection();
                    if (sel && sel.rangeCount > 0) {
                        const range = sel.getRangeAt(0);
                        if (activeElement.contains(range.commonAncestorContainer)) {
                            hasSelection = !sel.isCollapsed && sel.toString().trim().length > 0;
                            if (hasSelection) {
                                textToTranslate = sel.toString();
                            } else {
                                let node = range.startContainer;
                                const blockTags = ['P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'ARTICLE', 'SECTION', 'TR', 'TD'];
                                let parent = node.nodeType === 3 ? node.parentNode : node;
                                while (parent && parent !== activeElement) {
                                    if (parent.tagName && blockTags.includes(parent.tagName)) {
                                        break;
                                    }
                                    parent = parent.parentNode;
                                }
                                paragraphNode = (parent && parent !== activeElement) ? parent : activeElement;
                                textToTranslate = paragraphNode.innerText || paragraphNode.textContent || '';
                            }
                        }
                    }
                } else {
                    selectionStart = activeElement.selectionStart;
                    selectionEnd = activeElement.selectionEnd;
                    hasSelection = selectionStart !== selectionEnd;
                    if (hasSelection) {
                        textToTranslate = activeElement.value.substring(selectionStart, selectionEnd);
                    } else {
                        if (activeElement.tagName === 'INPUT') {
                            textToTranslate = activeElement.value || '';
                            selectionStart = 0;
                            selectionEnd = textToTranslate.length;
                        } else {
                            const val = activeElement.value || '';
                            const cursor = activeElement.selectionStart;
                            const startIdx = val.lastIndexOf('\n', cursor - 1) + 1;
                            let endIdx = val.indexOf('\n', cursor);
                            if (endIdx === -1) endIdx = val.length;
                            textToTranslate = val.substring(startIdx, endIdx);
                            selectionStart = startIdx;
                            selectionEnd = endIdx;
                        }
                    }
                }
                textToTranslate = textToTranslate.trim();
                if (textToTranslate.length > 0) {
                    event.preventDefault();
                    event.stopPropagation();
                    event.stopImmediatePropagation();
                    activeElement.__luminaTranslating = true;
                    let targetEl = activeElement;
                    if (activeElement.isContentEditable) {
                        if (hasSelection) {
                            const sel = window.getSelection();
                            if (sel && sel.rangeCount > 0) {
                                const range = sel.getRangeAt(0);
                                let commonNode = range.commonAncestorContainer;
                                targetEl = commonNode.nodeType === 3 ? commonNode.parentNode : commonNode;
                            }
                        } else if (paragraphNode) {
                            targetEl = paragraphNode;
                            activeElement.focus();
                            const sel = window.getSelection();
                            const range = document.createRange();
                            range.selectNodeContents(paragraphNode);
                            sel.removeAllRanges();
                            sel.addRange(range);
                        }
                    } else {
                        activeElement.focus();
                        activeElement.setSelectionRange(selectionStart, selectionEnd);
                    }
                    const originalPointerEvents = activeElement.style.pointerEvents || '';
                    activeElement.style.pointerEvents = 'none';
                    const defaultColorStyle = window.getComputedStyle(activeElement).color || 'rgb(0,0,0)';
                    const rgbMatch = defaultColorStyle.match(/\d+/g);
                    const defaultRGB = rgbMatch ? rgbMatch.slice(0, 3).map(Number) : [0, 0, 0];
                    let styleEl = document.getElementById('lumina-pulse-style');
                    if (!styleEl) {
                        styleEl = document.createElement('style');
                        styleEl.id = 'lumina-pulse-style';
                        document.head.appendChild(styleEl);
                    }
                    activeElement.classList.add('lumina-pulse-active');
                    let isPulsing = true;
                    const startTime = Date.now();
                    function smoothPulse() {
                        if (!isPulsing) return;
                        const elapsed = Date.now() - startTime;
                        const pulseFactor = 0.5 + 0.5 * Math.sin(elapsed * 0.005);
                        const r = Math.round(defaultRGB[0] + (26 - defaultRGB[0]) * pulseFactor);
                        const g = Math.round(defaultRGB[1] + (115 - defaultRGB[1]) * pulseFactor);
                        const b = Math.round(defaultRGB[2] + (232 - defaultRGB[2]) * pulseFactor);
                        styleEl.textContent = `
                          .lumina-pulse-active::selection {
                            background-color: transparent !important;
                            color: rgb(${r}, ${g}, ${b}) !important;
                          }
                        `;
                        requestAnimationFrame(smoothPulse);
                    }
                    requestAnimationFrame(smoothPulse);
                    try {
                        chrome.runtime.sendMessage({
                            action: 'translate_input_text',
                            text: textToTranslate
                        }, (response) => {
                            isPulsing = false;
                            activeElement.classList.remove('lumina-pulse-active');
                            if (styleEl) styleEl.textContent = '';
                            setTimeout(() => {
                                activeElement.style.pointerEvents = originalPointerEvents;
                                activeElement.__luminaTranslating = false;
                            }, 600);
                            if (response && response.translatedText) {
                                if (activeElement.isContentEditable) {
                                    const cleanedText = response.translatedText.replace(/\n\n/g, '\n');
                                    if (hasSelection) {
                                        document.execCommand('insertText', false, cleanedText);
                                        activeElement.dispatchEvent(new Event('input', { bubbles: true }));
                                    } else {
                                        if (paragraphNode) {
                                            activeElement.focus();
                                            const sel = window.getSelection();
                                            const range = document.createRange();
                                            range.selectNodeContents(paragraphNode);
                                            sel.removeAllRanges();
                                            sel.addRange(range);
                                            document.execCommand('insertText', false, cleanedText);
                                            activeElement.dispatchEvent(new Event('input', { bubbles: true }));
                                        }
                                    }
                                } else {
                                    const val = activeElement.value || '';
                                    const before = val.substring(0, selectionStart);
                                    const after = val.substring(selectionEnd);
                                    activeElement.value = before + response.translatedText + after;
                                    activeElement.focus();
                                    const newCursorPos = selectionStart + response.translatedText.length;
                                    activeElement.setSelectionRange(newCursorPos, newCursorPos);
                                    activeElement.dispatchEvent(new Event('input', { bubbles: true }));
                                }
                            }
                        });
                    } catch (err) {
                        isPulsing = false;
                        activeElement.classList.remove('lumina-pulse-active');
                        if (styleEl) styleEl.textContent = '';
                        setTimeout(() => {
                            activeElement.style.pointerEvents = originalPointerEvents;
                            activeElement.__luminaTranslating = false;
                        }, 600);
                        console.error('[Lumina] Send message for translateInput failed:', err);
                    }
                }
                return;
            }
        }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
            if (window.LuminaSelection && LuminaSelection.isInsideEditable()) return;
            const activeElement = typeof LuminaChatUI !== 'undefined' ? LuminaChatUI.getDeepActiveElement() : document.activeElement;
            const isInput = activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA' || activeElement.isContentEditable);
            if (!isInput) {
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
                if (window.LuminaAnnotation) LuminaAnnotation.undoLastHighlight();
                return;
            }
        }
        if ((event.ctrlKey || event.metaKey) && !event.shiftKey && ['r', 't', 'n', 'w', 'l', 'f', 'p', 's', 'c', 'x', 'y'].includes(event.key.toLowerCase())) {
            return;
        }
        if (questionMappings && questionMappings.length > 0) {
            if (window.LuminaSelection && !LuminaSelection.isInsideEditable()) {
                const selection = window.getSelection();
                const text = selection.toString();
                if (text && text.trim().length > 0) {
                    const mapping = questionMappings.find(m => {
                        let config = m.keyData;
                        if (!config && m.key) {
                            config = { key: m.key, code: 'Key' + m.key.toUpperCase() };
                            if (event.ctrlKey || event.metaKey || event.altKey) return false;
                        }
                        if (!config) return false;
                        if (!!config.ctrlKey !== event.ctrlKey) return false;
                        if (!!config.altKey !== event.altKey) return false;
                        if (!!config.shiftKey !== event.shiftKey) return false;
                        if (!!config.metaKey !== event.metaKey) return false;
                        if (config.key === 'Shift' || config.key === 'Control' || config.key === 'Alt' || config.key === 'Meta') {
                            return event.key === config.key;
                        }
                        return event.key.toLowerCase() === config.key.toLowerCase() || event.code === config.code;
                    });
                    if (mapping) {
                        event.preventDefault();
                        event.stopPropagation();
                        event.stopImmediatePropagation();
                        if (selection.rangeCount > 0) {
                            currentRange = selection.getRangeAt(0).cloneRange();
                        }
                        popupDirection = null;
                        const hasVariables = /\$(SelectedText|Sentence|Paragraph)|"SelectedText"/i.test(mapping.prompt);
                        const normalize = (s) => s.replace(/\s+/g, ' ').trim();
                        const cleanSelection = normalize(text);
                        let fullQuestion = mapping.prompt;
                        let displayQuestion = mapping.prompt;
                        if (hasVariables) {
                            fullQuestion = fullQuestion
                                .replace(/\$SelectedText|SelectedText/gi, text.trim())
                                .replace(/\$Sentence/gi, () => getSentenceContext())
                                .replace(/\$Paragraph/gi, () => getParagraphContext());
                            displayQuestion = mapping.prompt
                                .replace(/\$SelectedText|SelectedText/gi, text.trim())
                                .replace(/\$Sentence/gi, () => getSentenceContext())
                                .replace(/\$Paragraph/gi, () => getParagraphContext())
                                .trim();
                        } else {
                            fullQuestion = `"${text.trim()}" ${mapping.prompt}`;
                            displayQuestion = fullQuestion;
                        }
                        const shouldHighlight = (mapping.highlight !== false) && (mapping.enableHighlight !== false);
                        triggerSidePanelQuery(fullQuestion, displayQuestion, 'qa', currentRange, shouldHighlight);
                        if (window.LuminaSelection) LuminaSelection.hide();
                        return;
                    }
                }
            }
        }
        if (window.LuminaSelection && LuminaSelection.isInsideEditable()) {
            if (!matchesShortcut(event, 'audio')) {
                return;
            }
        }
        if (window.LuminaSelection && LuminaSelection.btn && LuminaSelection.btn.style.display === 'flex') {
            if (['luminaChat', 'audio', 'translate'].some(action => matchesShortcut(event, action))) {
                LuminaSelection.hide();
            }
        }
        if (matchesShortcut(event, 'luminaChat')) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            safeRuntimeSendMessage({ action: 'open_sidepanel' });
            return;
        }
        if (matchesShortcut(event, 'micToggle')) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            chrome.storage.local.set({ pendingMicToggle: Date.now() });
            safeRuntimeSendMessage({ action: 'open_sidepanel' });
            return;
        }
        if (matchesShortcut(event, 'askLumina')) {
            const selection = window.getSelection();
            const text = selection.toString().trim();
            const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
            if (text.length > 0 && range && window.LuminaSelection) {
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
                LuminaSelection.show(0, 0, text, range);
                LuminaSelection.showInput();
                return;
            }
        }
        const audioShortcut = shortcuts['audio'];
        const isModifierOnlyAudioShortcut = audioShortcut && ['Shift', 'Control', 'Alt', 'Meta'].includes(audioShortcut.key);
        if (!isModifierOnlyAudioShortcut && matchesShortcut(event, 'audio')) {
            if (event.__luminaAudioHandled) return;
            event.__luminaAudioHandled = true;
            let text = '';
            const activeElement = typeof LuminaChatUI !== 'undefined' ? LuminaChatUI.getDeepActiveElement() : document.activeElement;
            const isInput = activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA');
            if (isInput) {
                const start = activeElement.selectionStart;
                const end = activeElement.selectionEnd;
                if (start !== undefined && end !== undefined && start !== end) {
                    text = activeElement.value.substring(start, end).trim();
                }
            }
            if (!text) {
                const selection = getActiveSelection();
                text = getSmartSelectionText() || selection.toString().trim();
            }
            const isInputOrEditable = activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA' || activeElement.isContentEditable);
            if (isInputOrEditable && text.length === 0) {
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
                stopAudio();
                return;
            }
            if (text) {
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
                playCombinedAudio(text);
                return;
            } else {
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
                stopAudio();
                return;
            }
        }
        const annotationShortcuts = shortcuts['annotationShortcuts'] || [];
        for (const shortcut of annotationShortcuts) {
            if (shortcut.enabled === false) continue;
            if (matchesAnnotationShortcut(event, shortcut)) {
                if (window.LuminaSelection && LuminaSelection.isInsideEditable()) continue;
                const selection = window.getSelection();
                const text = selection.toString().trim();
                if (text.length > 0 && selection.rangeCount > 0) {
                    event.preventDefault();
                    event.stopPropagation();
                    event.stopImmediatePropagation();
                    const range = selection.getRangeAt(0);
                    const highlightId = 'lh_' + Date.now();
                    const color = shortcut.color || '#ffeb3b';
                    LuminaAnnotation.saveHighlight(range, color, highlightId);
                    LuminaAnnotation.applyHighlight(range, color, highlightId);
                    window.getSelection().removeAllRanges();
                    if (window.LuminaSelection) LuminaSelection.hide();
                    return;
                }
            }
        }
        if (matchesShortcut(event, 'translate')) {
            if (window.LuminaSelection && LuminaSelection.isInsideEditable()) return;
            const selection = window.getSelection();
            const text = selection.toString().trim();
            if (text.length > 0) {
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
                currentText = text;
                if (selection.rangeCount > 0) {
                    currentRange = selection.getRangeAt(0).cloneRange();
                }
                popupDirection = null;
                window.getSelection().removeAllRanges();
                if (window.LuminaSelection) LuminaSelection.hide();
                safeRuntimeSendMessage({
                    action: 'open_sidepanel_with_query',
                    query: `translate: ${text}`
                });
                return;
            }
        }
    }, true);
    function matchesAnnotationShortcut(event, shortcut) {
        if (!shortcut) return false;
        const ctrlMatch = !!shortcut.ctrlKey === event.ctrlKey;
        const altMatch = !!shortcut.altKey === event.altKey;
        const shiftMatch = !!shortcut.shiftKey === event.shiftKey;
        const metaMatch = !!shortcut.metaKey === event.metaKey;
        const keyMatch = (shortcut.code && event.code === shortcut.code) ||
                         (event.key && event.key.toLowerCase() === (shortcut.key || "").toLowerCase());
        return ctrlMatch && altMatch && shiftMatch && metaMatch && keyMatch;
    }
    function formatTextLikeOriginal(original, target) {
        if (!target) return target;
        const trimmedOriginal = original.trim();
        if (trimmedOriginal.length === 0) return target;
        let finalResult = target.trim();
        const firstChar = trimmedOriginal.charAt(0);
        const isOriginalCapitalized = firstChar === firstChar.toUpperCase() && firstChar !== firstChar.toLowerCase();
        const hasTrailingDot = trimmedOriginal.endsWith('.');
        if (!hasTrailingDot && finalResult.endsWith('.')) {
            finalResult = finalResult.slice(0, -1);
        } else if (hasTrailingDot && !finalResult.endsWith('.')) {
            finalResult += '.';
        }
        if (finalResult.length > 0) {
            const firstCharResult = finalResult.charAt(0);
            if (isOriginalCapitalized) {
                finalResult = firstCharResult.toUpperCase() + finalResult.slice(1);
            } else {
                finalResult = firstCharResult.toLowerCase() + finalResult.slice(1);
            }
        }
        return finalResult;
    }
    let currentAudioEl = null;
    let audioAborted = false;
    let audioDebounceTimer = null;
    const CHUNK_GAP_MS = 50;
    let audioCache = {
        text: null,
        type: null,
        data: null
    };
    async function playCombinedAudio(text) {
        if (!text) return;
        if (audioDebounceTimer) { clearTimeout(audioDebounceTimer); audioDebounceTimer = null; }
        audioAborted = true;
        if (currentAudioEl) { currentAudioEl.pause(); currentAudioEl = null; }
        audioAborted = false;
        const normalizedText = text.trim();
        try {
            const storageData = await chrome.storage.local.get(['audioSpeed']);
            const speed = storageData.audioSpeed || 1.1;
            if (audioCache.text === normalizedText && audioCache.data) {
                const chunks = Array.isArray(audioCache.data) ? audioCache.data : [audioCache.data];
                await playChunksSequentially(chunks, speed);
                return;
            }
            try {
                const cached = await chrome.runtime.sendMessage({ action: 'getAudioCache', text: normalizedText });
                if (cached && cached.success && cached.data) {
                    const chunks = Array.isArray(cached.data) ? cached.data : [cached.data];
                    audioCache = { text: normalizedText, type: cached.type, data: cached.data };
                    await playChunksSequentially(chunks, speed);
                    return;
                }
            } catch (e) {  }
            const result = await chrome.runtime.sendMessage({ action: 'fetchAudio', text: normalizedText, speed });
            if (!result || !result.chunks || result.chunks.length === 0) return;
            audioCache = { text: normalizedText, type: result.type, data: result.chunks };
            await playChunksSequentially(result.chunks, speed);
            chrome.runtime.sendMessage({ action: 'setAudioCache', text: normalizedText, type: result.type, data: result.chunks }).catch(() => { });
        } catch (e) {  }
    }
    async function playChunksSequentially(chunks, speed) {
        for (let i = 0; i < chunks.length; i++) {
            if (audioAborted) break;
            await playBase64Locally(chunks[i], speed);
            if (!audioAborted && i < chunks.length - 1) {
                await new Promise(r => setTimeout(r, CHUNK_GAP_MS));
            }
        }
    }
    function stopAudio() {
        audioAborted = true;
        if (currentAudioEl) { currentAudioEl.pause(); currentAudioEl = null; }
    }
    let _contentAudioCtx = null;
    function getContentAudioCtx() {
        if (!_contentAudioCtx || _contentAudioCtx.state === 'closed') {
            _contentAudioCtx = new AudioContext();
        }
        return _contentAudioCtx;
    }
    async function detectSilenceOffset(byteArray) {
        try {
            const ctx = getContentAudioCtx();
            const audioBuffer = await ctx.decodeAudioData(byteArray.buffer.slice(0));
            const channelData = audioBuffer.getChannelData(0);
            const THRESHOLD = 0.005;
            for (let i = 0; i < channelData.length; i++) {
                if (Math.abs(channelData[i]) > THRESHOLD) {
                    return i / audioBuffer.sampleRate;
                }
            }
            return 0;
        } catch (e) {
            return 0;
        }
    }
    function playBase64Locally(base64, speed = 1.0) {
        return new Promise(async (resolve) => {
            if (audioAborted) { resolve(); return; }
            let blobUrl = null;
            try {
                if (base64.startsWith('data:')) {
                    const parts = base64.split(',');
                    const mime = parts[0].split(':')[1].split(';')[0];
                    const byteString = atob(parts[1]);
                    const byteArray = new Uint8Array(byteString.length);
                    for (let i = 0; i < byteString.length; i++) byteArray[i] = byteString.charCodeAt(i);
                    const silenceOffset = await detectSilenceOffset(byteArray);
                    const blob = new Blob([byteArray], { type: mime });
                    blobUrl = URL.createObjectURL(blob);
                    if (audioAborted) { URL.revokeObjectURL(blobUrl); resolve(); return; }
                    const audio = new Audio(blobUrl);
                    audio.playbackRate = speed;
                    if (silenceOffset > 0) audio.currentTime = silenceOffset;
                    currentAudioEl = audio;
                    const cleanup = () => { currentAudioEl = null; if (blobUrl) URL.revokeObjectURL(blobUrl); };
                    audio.onended = () => { cleanup(); resolve(); };
                    audio.onerror = () => { cleanup(); resolve(); };
                    audio.play().catch(() => { cleanup(); resolve(); });
                    return;
                }
            } catch (e) {  }
            const audio = new Audio(blobUrl || base64);
            audio.playbackRate = speed;
            currentAudioEl = audio;
            const cleanup = () => { currentAudioEl = null; if (blobUrl) URL.revokeObjectURL(blobUrl); };
            audio.onended = () => { cleanup(); resolve(); };
            audio.onerror = () => { cleanup(); resolve(); };
            audio.play().catch(() => { cleanup(); resolve(); });
        });
    }
    function playOxfordAudio(text, speed) {
        return new Promise((resolve, reject) => {
            if (!text) {
                reject('No text');
                return;
            }
            const str = text.trim().toLowerCase();
            const audioUrl = `https://ssl.gstatic.com/dictionary/static/sounds/oxford/${str}--_gb_1.mp3`;
            chrome.runtime.sendMessage({
                action: 'playAudio',
                url: audioUrl,
                speed: speed
            })
                .then(response => {
                    if (response && response.success) {
                        resolve();
                    } else {
                        reject(response?.error || 'Unknown error');
                    }
                })
                .catch(err => {
                    reject(err.message);
                });
        });
    }
    function extractContextParagraph(selection) {
        let context = "";
        try {
            const range = selection.getRangeAt(0);
            let node = range.commonAncestorContainer;
            while (node && node.nodeType !== Node.ELEMENT_NODE) {
                node = node.parentNode;
            }
            while (node && !['P', 'DIV', 'ARTICLE', 'SECTION', 'BLOCKQUOTE', 'LI'].includes(node.tagName)) {
                node = node.parentNode;
            }
            if (node) {
                context = node.textContent.trim();
            }
            if (!context || context.length < 50) {
                const fullText = selection.anchorNode.textContent || "";
                const selectedText = selection.toString();
                const index = fullText.indexOf(selectedText);
                if (index !== -1) {
                    const start = Math.max(0, index - 200);
                    const end = Math.min(fullText.length, index + selectedText.length + 200);
                    context = fullText.substring(start, end).trim();
                    if (start > 0 && !context.startsWith('.')) {
                        context = context.substring(context.indexOf('. ') + 2);
                    }
                    const firstSentence = context.indexOf('. ');
                    if (firstSentence > 0) {
                        context = context.substring(firstSentence + 2);
                    }
                }
            }
            if (context.length > 500) {
                context = context.substring(0, 500) + '...';
            }
        } catch (e) {
            console.error('Error extracting context:', e);
            context = selection.toString();
        }
        return context;
    }
    function setupContextElement(element, fullText) {
        if (!fullText) {
            element.style.display = 'none';
            return;
        }
        const removeBtn = document.createElement('div');
        removeBtn.className = 'lumina-context-remove';
        removeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12"><path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
        removeBtn.title = 'Remove context';
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const parentEntry = element.closest('.lumina-entry');
            if (parentEntry) {
                parentEntry.remove();
            } else {
                element.remove();
            }
        });
        element.appendChild(removeBtn);
        const maxLength = 120;
        element.dataset.fullText = fullText;
        if (fullText.length > maxLength) {
            textSpan.textContent = fullText.substring(0, maxLength) + '...';
            element.classList.add('lumina-context-collapsed');
            element.title = "Click to expand";
            element.addEventListener('click', function expand(e) {
                if (e.target.closest('.lumina-context-remove')) return;
                textSpan.textContent = this.dataset.fullText;
                this.classList.remove('lumina-context-collapsed');
                this.removeAttribute('title');
                this.removeEventListener('click', expand);
            });
        } else {
            textSpan.textContent = fullText;
        }
        element.insertBefore(textSpan, removeBtn);
    }
    function appendContextEntry(contextParagraph) {
    }
    let lastPopupState = null;
    let popupDirection = null;
    let isTicking = false;
    function applyAskSelectionStyles() {
        chrome.storage.local.get(['fontSize', 'fontSizeByDomain', 'globalDefaults'], (items) => {
            const currentDomain = window.location.hostname;
            let baseFontSize = 13;
            if (items.fontSizeByDomain && items.fontSizeByDomain[currentDomain]) {
                baseFontSize = items.fontSizeByDomain[currentDomain];
            } else if (items.globalDefaults && items.globalDefaults.fontSize) {
                baseFontSize = items.globalDefaults.fontSize;
            } else if (items.fontSize) {
                baseFontSize = items.fontSize;
            }
            if (typeof LuminaChatUI !== 'undefined' && typeof LuminaChatUI.applyFontSize === 'function') {
                LuminaChatUI.applyFontSize(luminaHost, baseFontSize);
            } else {
                if (luminaHost) {
                    luminaHost.style.setProperty('font-size', baseFontSize + 'px', 'important');
                }
                document.documentElement.style.setProperty('--lumina-fontSize', baseFontSize + 'px', 'important');
            }
        });
    }
    var cachedTheme = null;
    var cachedAccent = null;
    var cachedContrast = null;
    function updateTheme() {
        const applyThemeSettings = (theme, accent, contrast) => {
            const preferredTheme = theme === 'auto'
                ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
                : theme;
            const isDark = preferredTheme === 'dark';
            if (luminaHost) {
                if (isDark) {
                    luminaHost.setAttribute('data-theme', 'dark');
                } else {
                    luminaHost.removeAttribute('data-theme');
                }
                luminaHost.setAttribute('data-accent', accent || 'default');
                luminaHost.setAttribute('data-contrast', contrast || 'auto');
            }
            const overlays = luminaShadowRoot ? luminaShadowRoot.querySelectorAll('.lumina-spotlight-overlay') : [];
            overlays.forEach(el => {
                if (isDark) {
                    el.setAttribute('data-theme', 'dark');
                } else {
                    el.removeAttribute('data-theme');
                }
                el.setAttribute('data-accent', accent || 'default');
                el.setAttribute('data-contrast', contrast || 'auto');
            });
        };
        if (cachedTheme !== null && cachedAccent !== null && cachedContrast !== null) {
            applyThemeSettings(cachedTheme, cachedAccent, cachedContrast);
            return;
        }
        chrome.storage.local.get(['theme', 'contrast', 'accentColor', 'globalDefaults'], (data) => {
            cachedTheme = data.theme || (data.globalDefaults && data.globalDefaults.theme) || 'light';
            cachedContrast = data.contrast || (data.globalDefaults && data.globalDefaults.contrast) || 'auto';
            cachedAccent = data.accentColor || (data.globalDefaults && data.globalDefaults.accentColor) || 'default';
            applyThemeSettings(cachedTheme, cachedAccent, cachedContrast);
        });
    }
    let dictPlusObserver = null;
    function initThemeObserver() {
        if (dictPlusObserver) return;
        if (!luminaShadowRoot) return;
        let _themeDebounceTimer = null;
        dictPlusObserver = new MutationObserver((mutations) => {
            const hasTopLevelChange = mutations.some(m =>
                m.type === 'childList' && m.addedNodes.length &&
                m.target === luminaShadowRoot
            );
            if (!hasTopLevelChange) return;
            if (_themeDebounceTimer) return;
            _themeDebounceTimer = setTimeout(() => {
                _themeDebounceTimer = null;
                updateTheme();
            }, 200);
        });
        dictPlusObserver.observe(luminaShadowRoot, { childList: true, subtree: true });
    }
    document.addEventListener('mousedown', (e) => {
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.button === 0) {
            const focused = document.activeElement;
            if (focused && (focused.tagName === 'INPUT' || focused.tagName === 'TEXTAREA' || focused.isContentEditable)) {
                e.preventDefault();
                const enterEvent = new KeyboardEvent('keydown', {
                    key: 'Enter',
                    code: 'Enter',
                    keyCode: 13,
                    which: 13,
                    bubbles: true,
                    cancelable: true
                });
                focused.dispatchEvent(enterEvent);
            }
        }
    }, true);
    function getVisibleText(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            return node.textContent;
        }
        if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
            let text = '';
            for (const child of node.childNodes) {
                text += getVisibleText(child);
            }
            return text;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return '';
        const el = node;
        if (el.isConnected) {
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
                return '';
            }
        } else {
            if (el.style.display === 'none' || el.style.visibility === 'hidden' || el.style.opacity === '0') {
                return '';
            }
        }
        const tag = el.tagName.toLowerCase();
        if (['button', 'svg', 'mat-icon', 'script', 'style', 'noscript', 'img'].includes(tag)) {
            return '';
        }
        const classStr = typeof el.className === 'string' ? el.className.toLowerCase() : '';
        if (el.getAttribute('role') === 'button' ||
            classStr.includes('btn') ||
            classStr.includes('button') ||
            el.classList.contains('lumina-dict-play-btn')) {
            return '';
        }
        if (tag === 'a' && (
            el.classList.contains('btn') ||
            el.classList.contains('button') ||
            el.className.includes('btn ')
        )) {
            return '';
        }
        if (el.getAttribute('aria-hidden') === 'true') {
            return '';
        }
        const classNameStr = typeof el.className === 'string' ? el.className : (el.className?.baseVal || '');
        if (/\b(icon|material-icons|google-symbols|fa-|glyphicon|lumina-translation-divider|lumina-trans-actions)\b/i.test(classNameStr)) {
            return '';
        }
        let text = '';
        for (const child of el.childNodes) {
            text += getVisibleText(child);
        }
        if (['div', 'p', 'br', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'tr'].includes(tag)) {
            text = '\n' + text + '\n';
        }
        return text;
    }
    function getActiveSelection(preferShadow = false) {
        if (preferShadow) {
            if (typeof luminaShadowRoot !== 'undefined' && luminaShadowRoot) {
                try {
                    const shadowSel = (luminaShadowRoot.getSelection) ? luminaShadowRoot.getSelection() : null;
                    if (shadowSel && shadowSel.rangeCount > 0 && shadowSel.toString().trim() !== '') {
                        return shadowSel;
                    }
                } catch (e) { }
            }
        }
        let sel = window.getSelection();
        if (sel && sel.rangeCount > 0 && sel.toString().trim() !== '') {
            return sel;
        }
        try {
            let active = document.activeElement;
            while (active && active.shadowRoot) {
                const shadowSel = active.shadowRoot.getSelection ? active.shadowRoot.getSelection() : null;
                if (shadowSel && shadowSel.rangeCount > 0 && shadowSel.toString().trim() !== '') {
                    return shadowSel;
                }
                active = active.shadowRoot.activeElement;
            }
        } catch (e) { }
        if (!preferShadow) {
            if (typeof luminaShadowRoot !== 'undefined' && luminaShadowRoot) {
                try {
                    const shadowSel = luminaShadowRoot.getSelection ? luminaShadowRoot.getSelection() : null;
                    if (shadowSel && shadowSel.rangeCount > 0 && shadowSel.toString().trim() !== '') {
                        return shadowSel;
                    }
                } catch (e) { }
            }
        }
        return sel;
    }
    function getSmartSelectionText() {
        const sel = getActiveSelection();
        if (!sel || sel.rangeCount === 0) return '';
        const range = sel.getRangeAt(0);
        const fragment = range.cloneContents();
        let extracted = getVisibleText(fragment);
        extracted = extracted
            .replace(/\n{3,}/g, '\n\n')
            .replace(/[ \t]+/g, ' ')
            .replace(/ ?\n ?/g, '\n')
            .trim();
        if (!extracted && sel.toString().trim()) {
            extracted = sel.toString().trim();
        }
        return extracted;
    }
    function sanitizeDictionaryQuery(text) {
        if (!text) return '';
        return text.toString().trim().replace(/^[^a-zA-Z0-9'"]+|[^a-zA-Z0-9'"]+$/g, '');
    }
    function getSentenceContext() {
        const sel = getActiveSelection();
        if (!sel || sel.rangeCount === 0) return '';
        const range = sel.getRangeAt(0);
        let node = range.startContainer;
        if (!node) return '';
        const blockTags = ['P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'ARTICLE', 'SECTION', 'TR', 'TD'];
        let parent = node.nodeType === 3 ? node.parentNode : node;
        while (parent) {
            if (parent.nodeType === 11 && parent.host) {
                parent = parent.host;
                continue;
            }
            if (parent.tagName && blockTags.includes(parent.tagName)) {
                if (parent.id === 'lumina-host') {
                    parent = parent.parentNode || parent.host;
                    continue;
                }
                break;
            }
            parent = parent.parentNode || parent.host;
        }
        if (!parent) return sel.toString().trim();
        const text = parent.innerText || parent.textContent;
        const selectionText = sel.toString();
        if (!selectionText) return '';
        const preSelectionRange = range.cloneRange();
        preSelectionRange.selectNodeContents(parent);
        preSelectionRange.setEnd(range.startContainer, range.startOffset);
        const index = preSelectionRange.toString().length;
        const before = text.substring(0, index);
        const after = text.substring(index + selectionText.length);
        const lastTerminatorIndex = before.lastIndexOf('.');
        const markers = before.match(/.*[.!?](?:\s|$)/);
        const start = markers ? markers[0].length : 0;
        const nextMarkers = after.match(/.*?[.!?](?:\s|$)/);
        const end = nextMarkers ? index + selectionText.length + nextMarkers[0].length : text.length;
        return text.substring(start, end).trim();
    }
    function getParagraphContext() {
        const sel = getActiveSelection();
        if (!sel || sel.rangeCount === 0) return '';
        const range = sel.getRangeAt(0);
        let node = range.startContainer;
        if (!node) return '';
        const blockTags = ['P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'ARTICLE', 'SECTION', 'TR', 'TD'];
        let parent = node.nodeType === 3 ? node.parentNode : node;
        while (parent) {
            if (parent.nodeType === 11 && parent.host) {
                parent = parent.host;
                continue;
            }
            if (parent.tagName && blockTags.includes(parent.tagName)) {
                if (parent.id === 'lumina-host') {
                    parent = parent.parentNode || parent.host;
                    continue;
                }
                break;
            }
            parent = parent.parentNode || parent.host;
        }
        if (!parent) return sel.toString().trim();
        return (parent.innerText || parent.textContent).trim();
    }
    function getSmartClimbedContext() {
        const sel = getActiveSelection();
        if (!sel || sel.rangeCount === 0) return '';
        const range = sel.getRangeAt(0);
        let node = range.startContainer;
        if (!node) return '';
        const bigContainers = ['DIV', 'SECTION', 'ARTICLE', 'MAIN', 'ASIDE', 'BODY'];
        let current = node.nodeType === 3 ? node.parentNode : node;
        while (current) {
            if (current.nodeType === 11 && current.host) {
                current = current.host;
                continue;
            }
            if (current.tagName && bigContainers.includes(current.tagName)) {
                if (current.id === 'lumina-host') {
                    current = current.parentNode || current.host;
                    continue;
                }
                break;
            }
            current = current.parentNode || current.host;
        }
        if (!current) return '';
        return (current.innerText || current.textContent).trim();
    }
    document.addEventListener('copy', (e) => {
        if (isExtensionDisabled) return;
        try {
            const activeElement = typeof LuminaChatUI !== 'undefined' ? LuminaChatUI.getDeepActiveElement() : document.activeElement;
            const isEditing = activeElement && (['INPUT', 'TEXTAREA', 'SELECT'].includes(activeElement.tagName) || activeElement.isContentEditable);
            if (isEditing) return;
            const sel = window.getSelection();
            if (!sel || sel.rangeCount === 0) return;
            const smartText = getSmartSelectionText();
            const original = sel.toString();
            const trimmedOriginal = original.trim();
            let finalText = trimmedOriginal;
            if (smartText && smartText !== trimmedOriginal) {
                finalText = smartText.trim();
            }
            if (finalText !== original) {
                e.preventDefault();
                e.clipboardData.setData('text/plain', finalText);
            }
        } catch (err) {
        }
    }, true);
    let youtubeTranscriptCache = {
        videoId: null,
        transcript: null,
        status: 'idle'
    };
    let lastExtractedContent = null;
    let lastExtractedUrl = "";
    let lastExtractionTime = 0;
    async function extractMainContent(doc = document, forceRefresh = false) {
        const url = window.location.href;
        const now = Date.now();
        if (!forceRefresh && lastExtractedContent && lastExtractedUrl === url && (now - lastExtractionTime < 2000)) {
            return lastExtractedContent;
        }
        const isPossiblyEmptySPA = () => {
            const text = (doc.body ? doc.body.innerText : "") || "";
            const hasAppRoot = doc.querySelector('#root') || doc.querySelector('#app') || doc.querySelector('div[id*="app"]');
            const isVite = doc.querySelector('script[type="module"]');
            const hasSpinner = doc.querySelector('.spoke-spinner') || doc.querySelector('.ant-spin') || doc.querySelector('.loading-spinner');
            const hasLMS = doc.querySelector('.lms-container') || doc.querySelector('.dol-content') || doc.querySelector('[class*="passage"]');
            const isEducationSite = url.includes('dolenglish') || url.includes('ielts') || url.includes('education');
            const minThreshold = isEducationSite ? 1000 : 600;
            return (text.length < minThreshold && (hasAppRoot || isVite || hasLMS)) || hasSpinner;
        };
        const shouldDelay = !forceRefresh && isPossiblyEmptySPA();
        if (shouldDelay) {
            await new Promise(r => setTimeout(r, 1500));
        }
        let retries = 0;
        const maxRetries = forceRefresh ? 0 : 2;
        let finalOutput = null;
        while (retries <= maxRetries) {
            finalOutput = await performExtraction(doc, url);
            if (finalOutput && finalOutput.content && finalOutput.content.length > 500) {
                break;
            }
            if (retries < maxRetries) {
                await new Promise(r => setTimeout(r, 1000));
            }
            retries++;
        }
        lastExtractedContent = finalOutput;
        lastExtractedUrl = url;
        lastExtractionTime = Date.now();
        return finalOutput;
    }
    async function performExtraction(doc, url) {
        const isYouTube = typeof YoutubeUtils !== 'undefined' && YoutubeUtils.isYouTubeVideo(url);
        let youtubeTranscript = "";
        if (isYouTube) {
            youtubeTranscript = await YoutubeUtils.fetchTranscript(url);
        }
        let result = {
            url: url,
            title: document.title,
            content: ""
        };
        try {
            const turndownService = new TurndownService({
                headingStyle: 'atx',
                codeBlockStyle: 'fenced'
            });
            const normalize = (s) => (s || "").toLowerCase().replace(/\s+/g, ' ').trim();
            let finalMarkdown = `[Context Source: ${document.title}]\nURL: ${url}\n\n`;
            let normalizedCaptured = "";
            const MIN_TEXT_LENGTH = 50;
            const SCRAP_TAGS = [
                'script', 'style', 'nav', 'footer', 'header', 'noscript', 'aside', 'svg', 'button', 'audio', 'video',
                '.menu', '.sidebar', '.navbar', '.header', '.footer', '[class*="header" i]', '[class*="footer" i]',
                '[class*="nav" i]', '[class*="menu" i]', '[class*="sidebar" i]', '[class*="feedback" i]',
                '[class*="upgrade" i]', '[class*="timer" i]', '[class*="modal" i]', '[class*="user-nav" i]',
                '[class*="promo" i]', '[class*="ads" i]', '[class*="banner" i]', '[class*="social" i]',
                '[class*="related" i]', '[class*="breadcrumb" i]', '[class*="auth" i]', '[class*="login" i]',
                '[class*="account" i]', '[class*="profile" i]', '[class*="expire" i]', '[class*="notification" i]',
                '[class*="contact" i]', '[class*="hotline" i]', '[class*="address" i]', '[class*="popup" i]',
                '[class*="overlay" i]', '[class*="tooltip" i]', '[class*="download" i]', '[class*="comment" i]',
                '[class*="review" i]', '[class*="share" i]', '[class*="cookie" i]', '[class*="gdpr" i]',
                '[class*="logo" i]', '[class*="topbar" i]', '[class*="fixed" i]', '[class*="section-header" i]',
                '#feedback-modal', '.lumina-ignore', '[role="navigation"]', '[role="contentinfo"]',
                '.dol-breadcrumb', '.breadcrumb-container', '.landing-header', '.footer-nested-links',
                '.socialButtonGroup', '.referral-share-banner', '#__NEXT_DATA__', '.rowLink', '.nav-item',
                '.LandingHeader__Main-sc-vzeq2b-0', '.LandingLayout__Main-sc-1plzfds-0', '.TopbarNavList__Main-sc-tbxqf6-1'
            ];
            turndownService.remove(['script', 'style', 'noscript', 'iframe', 'svg', 'button', 'audio', 'video', 'canvas', 'map', 'area', 'img[alt*="logo" i]']);
            const findCandidates = (root) => {
                const HIGH_LEVEL_WRAPPERS = ['html', 'body', '#__next', '#app-root', '.app-wrapper', '.app-container', '.main-wrapper', '.layout-wrapper'];
                let found = Array.from(root.querySelectorAll('article, main, section, [class*="content"], [id*="content"], [class*="article"], [class*="main"], [class*="reading"], [class*="passage"], [class*="question"], [class*="exercise"], [class*="practice"], [id*="reading"], [id*="passage"], div, p'));
                found = found.filter(el => {
                    const isWrapper = HIGH_LEVEL_WRAPPERS.some(sel => el.matches(sel));
                    if (isWrapper) return false;
                    if (el.parentElement && (el.parentElement.tagName === 'BODY' || el.parentElement.id === '__next')) {
                        if (!el.matches('article, main, section')) return false;
                    }
                    return true;
                });
                const all = root.querySelectorAll('*');
                for (const el of all) {
                    if (el.shadowRoot) {
                        found = found.concat(findCandidates(el.shadowRoot));
                    }
                }
                return found;
            };
            const candidates = findCandidates(doc);
            candidates.sort((a, b) => {
                const aIsPrimary = a.matches('article, main, [class*="article"], [id*="article"], [class*="reading"], [class*="passage"], [class*="question"]');
                const bIsPrimary = b.matches('article, main, [class*="article"], [id*="article"], [class*="reading"], [class*="passage"], [class*="question"]');
                if (aIsPrimary && !bIsPrimary) return -1;
                if (!aIsPrimary && bIsPrimary) return 1;
                return (b.innerText?.length || 0) - (a.innerText?.length || 0);
            });
            let segmentsCount = 0;
            candidates.forEach(el => {
                if (!el || !el.isConnected) return;
                if (el.closest(SCRAP_TAGS.join(','))) return;
                const text = (el.innerText || el.textContent || "").trim();
                if (text.length < MIN_TEXT_LENGTH) return;
                const linkCount = el.querySelectorAll('a').length;
                if (linkCount > 2 && text.length / linkCount < 50) return;
                const normText = normalize(text);
                const startFingerprint = normText.slice(0, 150);
                if (startFingerprint && normalizedCaptured.includes(startFingerprint)) return;
                if (normText.length > 200 && normalizedCaptured.includes(normText.substring(50, 200))) return;
                const html = el.innerHTML || "";
                const density = text.length / (html.length + 1);
                const isEducationBlock = el.matches('[class*="question"], [class*="reading"], [class*="passage"], [class*="exercise"], [class*="practice"]');
                if (text.split('\n').length < 3 && linkCount > 1 && !isEducationBlock) return;
                if (density > 0.05 || el.matches('article, main, p, [class*="content"]') || isEducationBlock) {
                    const blockMarkdown = turndownService.turndown(html).trim();
                    if (blockMarkdown && blockMarkdown.length > 20) {
                        segmentsCount++;
                        finalMarkdown += `\n\n--- [Segment ${segmentsCount}] ---\n\n` + blockMarkdown;
                        normalizedCaptured += " " + normText;
                    }
                }
            });
            if (youtubeTranscript) {
                finalMarkdown += "\n\n--- [Video Transcript] ---\n\n" + youtubeTranscript;
            }
            result.content = segmentsCount > 0 ? finalMarkdown : `[Fallback Page Text]:\n${doc.body.innerText}`;
            return result;
        } catch (error) {
            console.error('[Lumina] Content extraction failed:', error);
            result.content = `[Extraction Error]: ${error.message}`;
        }
        lastExtractedContent = result;
        lastExtractedUrl = url;
        return result;
    }
    function luminaEstimateTokens(text) {
        if (!text) return 0;
        if (typeof LuminaToken !== 'undefined') {
            return LuminaToken.count(text);
        }
        return Math.ceil(text.length / 4);
    }
    window.luminaExtractMainContent = extractMainContent;
    window.luminaEstimateTokens = luminaEstimateTokens;
    class YouTubeButtonManager {
        constructor() {
            this.injected = false;
            this.button = null;
            this.observer = null;
            this.currentVideoId = null;
            this.injectStyles();
        }
        injectStyles() {
            if (document.getElementById('lumina-yt-styles')) return;
            const style = document.createElement('style');
            style.id = 'lumina-yt-styles';
            style.textContent = `
                #title.ytd-watch-metadata {
                    display: grid !important;
                    grid-template-columns: 1fr auto !important;
                    align-items: center !important;
                    gap: 8px !important;
                    width: 100% !important;
                }
                .lumina-yt-title-left {
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    min-width: 0;
                    overflow: hidden;
                }
                .lumina-yt-title-left h1,
                .lumina-yt-title-left yt-formatted-string {
                    white-space: nowrap !important;
                    overflow: hidden !important;
                    text-overflow: ellipsis !important;
                    display: block !important;
                }
                .lumina-yt-ask-btn {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    padding: 0 16px;
                    height: 36px;
                    border-radius: 18px;
                    font-family: "Roboto", "Arial", sans-serif;
                    font-size: 14px;
                    font-weight: 500;
                    cursor: pointer;
                    border: none;
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                    position: relative;
                    overflow: hidden;
                    white-space: nowrap;
                    flex-shrink: 0;
                    z-index: 10;
                }
                /* Ready State - Solid Blue */
                .lumina-yt-ask-btn.is-ready {
                    background: #065fd4;
                    color: white;
                }
                .lumina-yt-ask-btn.is-ready:hover {
                    filter: brightness(1.1);
                }
                /* Loading State - Shimmer */
                .lumina-yt-ask-btn.is-loading {
                    background: #f2f2f2;
                    color: #606060;
                    cursor: wait;
                    pointer-events: none;
                }
                .lumina-yt-ask-btn.is-loading::after {
                    content: "";
                    position: absolute;
                    top: 0;
                    right: 0;
                    bottom: 0;
                    left: 0;
                    transform: translateX(-100%);
                    background: linear-gradient(
                        90deg,
                        rgba(255, 255, 255, 0) 0%,
                        rgba(255, 255, 255, 0.6) 50%,
                        rgba(255, 255, 255, 0) 100%
                    );
                    animation: lumina-shimmer 1.5s infinite;
                }
                @keyframes lumina-shimmer {
                    100% {
                        transform: translateX(100%);
                    }
                }
                .lumina-yt-ask-btn .lumina-icon {
                    width: 18px;
                    height: 18px;
                    margin-right: 8px;
                    fill: currentColor;
                }
                html[dark] .lumina-yt-ask-btn.is-loading {
                    background: #272727;
                    color: #aaa;
                }
                html[dark] .lumina-yt-ask-btn.is-loading::after {
                    background: linear-gradient(
                        90deg,
                        rgba(255, 255, 255, 0) 0%,
                        rgba(255, 255, 255, 0.1) 50%,
                        rgba(255, 255, 255, 0) 100%
                    );
                }
            `;
            document.head.appendChild(style);
        }
        async init() {
            const videoId = this.getVideoId();
            if (!videoId) {
                this.removeButton();
                return;
            }
            this.currentVideoId = videoId;
            this.injectButton();
            this.updateState('loading');
            try {
                const transcript = await YoutubeUtils.fetchTranscript(window.location.href);
                if (transcript && this.currentVideoId === videoId) {
                    this.updateState('ready');
                } else if (this.currentVideoId === videoId) {
                    this.updateState('ready');
                }
            } catch (err) {
                if (this.currentVideoId === videoId) {
                    this.updateState('ready');
                }
            }
        }
        getVideoId() {
            const url = new URL(window.location.href);
            return url.searchParams.get('v') || (url.pathname.startsWith('/shorts/') ? url.pathname.split('/')[2] : null);
        }
        injectButton() {
            const titleContainer = document.querySelector('#title.ytd-watch-metadata');
            if (!titleContainer) {
                if (!this.retryCount) this.retryCount = 0;
                if (this.retryCount < 10) {
                    this.retryCount++;
                    setTimeout(() => this.injectButton(), 500);
                }
                return;
            }
            let leftContainer = titleContainer.querySelector('.lumina-yt-title-left');
            if (!leftContainer) {
                leftContainer = document.createElement('div');
                leftContainer.className = 'lumina-yt-title-left';
                titleContainer.appendChild(leftContainer);
            }
            const children = Array.from(titleContainer.childNodes);
            let needsMove = false;
            children.forEach(child => {
                const isOurContainer = child === leftContainer;
                const isOurButton = child.id === 'lumina-yt-ask-btn' || (child.classList && child.classList.contains('lumina-yt-ask-btn'));
                if (!isOurContainer && !isOurButton) {
                    leftContainer.appendChild(child);
                    needsMove = true;
                }
            });
            if (leftContainer) {
                leftContainer.removeAttribute?.('title');
                leftContainer.querySelectorAll?.('[title]').forEach(el => el.removeAttribute('title'));
            }
            if (document.getElementById('lumina-yt-ask-btn')) {
                if (needsMove) {
                    titleContainer.appendChild(document.getElementById('lumina-yt-ask-btn'));
                }
                return;
            }
            const btn = document.createElement('button');
            btn.id = 'lumina-yt-ask-btn';
            btn.className = 'lumina-yt-ask-btn is-loading';
            btn.innerHTML = `<span class="lumina-text">Fetching...</span>`;
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.handleAction();
            });
            titleContainer.appendChild(btn);
            this.button = btn;
            if (!this.observer) {
                this.observer = new MutationObserver((mutations) => {
                    if (!document.getElementById('lumina-yt-ask-btn')) {
                        this.injectButton();
                    }
                });
                this.observer.observe(titleContainer, { childList: true });
            }
        }
        updateState(state) {
            const btn = document.getElementById('lumina-yt-ask-btn');
            if (!btn) return;
            const text = btn.querySelector('.lumina-text');
            if (state === 'loading') {
                btn.className = 'lumina-yt-ask-btn is-loading';
                text.textContent = 'Fetching...';
            } else {
                btn.className = 'lumina-yt-ask-btn is-ready';
                text.textContent = 'Ask Lumina';
            }
        }
        async handleAction() {
            const triggerInfo = {
                action: 'youtube_ask',
                timestamp: Date.now(),
                videoId: this.currentVideoId,
                url: window.location.href,
                title: document.title.replace(' - YouTube', '')
            };
            try {
                chrome.runtime.sendMessage({
                    action: 'ensure_sidepanel_open',
                    youtubeTrigger: triggerInfo
                });
            } catch (err) {
                console.error('[Lumina] Failed to open side panel:', err);
            }
        }
        removeButton() {
            const btn = document.getElementById('lumina-yt-ask-btn');
            if (btn) btn.remove();
            if (this.observer) {
                this.observer.disconnect();
                this.observer = null;
            }
        }
    }
    const ytButtonManager = new YouTubeButtonManager();
    document.addEventListener('yt-navigate-finish', () => {
        if (window.location.hostname.includes('youtube.com')) {
            ytButtonManager.init();
        }
    });
    if (window.location.hostname.includes('youtube.com') && window.location.pathname.startsWith('/watch')) {
        setTimeout(() => ytButtonManager.init(), 1000);
    } else if (window.location.hostname.includes('youtube.com') && window.location.pathname.startsWith('/shorts')) {
        setTimeout(() => ytButtonManager.init(), 1000);
    }
    document.addEventListener('click', (e) => {
        if (isExtensionDisabled) return;
        if (window.LuminaAnnotation) {
            const hData = LuminaAnnotation.getHighlightAtCoords(e.clientX, e.clientY);
            if (hData) {
                e.preventDefault();
                e.stopPropagation();
                if (window.LuminaSelection) {
                    LuminaSelection.showAnnotationMenu(hData.range, hData.id, hData.color);
                }
            }
        }
    }, true);
    initShadowDOM();
    let syncTimeout = null;
    let lastContentHash = "";
    const contentObserver = new MutationObserver((mutations) => {
        const isStructuralChange = mutations.some(m => m.type === 'childList');
        if (!isStructuralChange) return;
        if (syncTimeout) clearTimeout(syncTimeout);
        syncTimeout = setTimeout(() => {
            try {
                const currentText = (document.body ? document.body.innerText.slice(0, 1000) : "") +
                                   (document.body ? document.body.innerText.slice(-1000) : "");
                if (currentText !== lastContentHash) {
                    lastContentHash = currentText;
                    chrome.runtime.sendMessage({ type: 'LUMINA_CONTENT_UPDATED' }).catch(() => {});
                }
            } catch (e) {
            }
        }, 5000);
    });
    if (document.body) {
        contentObserver.observe(document.body, { childList: true, subtree: true });
    }
})();
