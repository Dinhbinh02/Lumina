(() => {

    let fontStyleElement = null;

    function injectFonts() {
        // Check both local variable and DOM to prevent duplicates from multiple script runs
        if (fontStyleElement || document.getElementById('lumina-fonts')) return;

        // Use Google Fonts CDN for reliable cross-page loading
        const fontCss = `
@import url('https://fonts.googleapis.com/css2?family=Google+Sans+Code:ital,wght@0,300..800;1,300..800&family=Montserrat:ital,wght@0,100..900;1,100..900&family=Roboto:ital,wght@0,100..900;1,100..900&family=Source+Code+Pro:ital,wght@0,200..900;1,200..900&display=swap');
`;

        fontStyleElement = document.createElement('style');
        fontStyleElement.id = 'lumina-fonts';
        fontStyleElement.textContent = fontCss;

        // Ensure document.head exists before appending
        if (document.head) {
            document.head.appendChild(fontStyleElement);
        } else {
            // Wait for DOM to be ready
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

    // Inject fonts immediately when script loads
    injectFonts();

    // KaTeX is injected via manifest.json
    window.katexLoaded = true;

    // Event Cleanup Manager to prevent memory leaks
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

    // Returns the current browser zoom level relative to 100%.
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
    // Initial update and on every resize
    updateCachedZoom();
    window.addEventListener('resize', () => {
        updateCachedZoom(() => {
            // Update spotlight overlay if it exists
            if (luminaShadowRoot) {
                const spotlight = luminaShadowRoot.querySelector('.lumina-spotlight-overlay');
                if (spotlight && typeof applyPopupStyles === 'function') {
                    applyPopupStyles(spotlight, true);
                }
            }
            // Also update Ask Lumina elements
            if (window.LuminaSelection) {
                LuminaSelection.hide();
            }
        });
    });

    function getPageZoom() {
        // Priority 1: Use cached zoom from chrome.tabs.getZoom (most accurate)
        if (currentCachedZoom && currentCachedZoom !== 1) return currentCachedZoom;

        // Priority 2: Use DPR heuristic as immediate fallback (esp. for Mac users)
        const dpr = window.devicePixelRatio || 1;
        const isMac = /mac/i.test(navigator.platform);
        if (isMac) {
            // On Mac, base DPR is almost always 1 or 2.
            const baseDpr = Math.round(dpr) || 1;
            return dpr / baseDpr;
        }

        return 1;
    }

    let askSelectionPopupEnabled = false;
    let readWebpageEnabled = false;
    let askSelectionText = '';
    let askSelectionContext = '';
    let currentRange = null;
    let currentText = "";
    let currentSpeed = 1.0;

    let isExtensionDisabled = false;


    // Shadow DOM Variables
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

    /**
     * Triggers the side panel with a specific query.
     * Replaces the old floating popup logic.
     */
    function triggerSidePanelQuery(query, displayQuery = null, mode = 'qa') {
        safeRuntimeSendMessage({
            action: 'open_sidepanel_with_query',
            query: query,
            displayQuery: displayQuery || query,
            mode: mode
        });
    }

    function initShadowDOM() {
        // Check DOM first to prevent duplicates (especially with manifest.json + dynamic registration)
        if (luminaHost || document.getElementById('lumina-host') || document.getElementById('lumina-shadow-host')) return;

        // 1. Shadow root creation
        luminaHost = document.createElement('div');
        luminaHost.id = 'lumina-shadow-host';
        luminaHost.style.cssText = 'position: fixed; top: 0; left: 0; width: 0; height: 30px; z-index: 2147483647; pointer-events: none; border: none; padding: 0; margin: 0; overflow: visible;';

        // Set initial font-size from storage
        applyAskSelectionStyles();

        luminaShadowRoot = luminaHost.attachShadow({ mode: 'open' });
        document.documentElement.appendChild(luminaHost);

        // 2. Add styles to shadow root
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = chrome.runtime.getURL('assets/styles/styles.css');
        luminaShadowRoot.appendChild(link);

        // 3. Initialize common UI utilities
        if (window.LuminaSelection) {
            LuminaSelection.init({
                shadowRoot: luminaShadowRoot,
                onSubmit: (query, displayQuery, isDictionary) => {
                    if (isDictionary) {
                        const selection = window.getSelection();
                        const text = selection.toString().trim();
                        if (text) {
                            // Show the floating popup instead of sending to chat
                            const range = selection.getRangeAt(0);
                            const rect = range.getBoundingClientRect();
                            LuminaDictionaryPopup.show(text, {
                                x: rect.left,
                                y: rect.bottom + 5,
                                source: 'cambridge'
                            });
                            return;
                        }
                    }
                    triggerSidePanelQuery(query, displayQuery, isDictionary ? 'dictionary' : 'qa');
                }
            });
        }

        const katexLink = document.createElement('link');
        katexLink.rel = 'stylesheet';
        katexLink.href = chrome.runtime.getURL('lib/katex/katex.min.css');
        luminaShadowRoot.appendChild(katexLink);

        // Mark that styles are loading
        window.luminaStylesLoaded = new Promise((resolve) => {
            link.addEventListener('load', () => {
                resolve();
            });
        });

        // Append to documentElement (html) to avoid body limitations on some sites
        (document.documentElement || document.body).appendChild(luminaHost);

        initThemeObserver();
    }



    function preprocessMathContent(text) {
        // 1. Handle Display Math \[ ... \]
        let processed = text.replace(/(\\\[)([\s\S]*?)(\\\])/g, (match, start, content, end) => {
            let safeContent = content.replace(/%/g, '\\\\%');
            return `\\\\[${safeContent}\\\\]`;
        });

        // 2. Handle Inline Math \( ... \)
        processed = processed.replace(/(\\\()([\s\S]*?)(\\\))/g, (match, start, content, end) => {
            let safeContent = content.replace(/%/g, '\\\\%');
            return `\\\\(${safeContent}\\\\)`;
        });

        // 3. Handle $$ ... $$
        processed = processed.replace(/(\$\$)([\s\S]*?)(\$\$)/g, (match, start, content, end) => {
            let safeContent = content.replace(/%/g, '\\\\%');
            return `$$${safeContent}$$`;
        });

        return processed;
    }


    // Listen for text selection
    document.addEventListener('mouseup', (e) => {
        if (isExtensionDisabled) return;

        const selection = window.getSelection();
        if (!selection) return;

        const path = e.composedPath();
        const isInsideShadow = path.some(el => el.id === 'lumina-shadow-host');
        if (isInsideShadow) return;

        setTimeout(() => {
            const finalSelection = window.getSelection();
            const text = finalSelection.toString().trim();
            const range = finalSelection.rangeCount > 0 ? finalSelection.getRangeAt(0) : null;

            if (askSelectionPopupEnabled && text.length > 0 && range && (window.LuminaSelection && !LuminaSelection.isInsideEditable())) {
                if (window.LuminaSelection) {
                    LuminaSelection.show(e.clientX, e.clientY, text, range);
                }
            } else if (!isInsideShadow) {
                if (window.LuminaSelection) LuminaSelection.hide();
            }
        }, 50);
    }, true);
    // Use CAPTURE phase to ensure we see the event even if the page stops propagation

    // Double-click is now handled via mouseup selection logic above

    window.addEventListener('mousedown', (e) => {
        const path = e.composedPath();
        const isInsideAskBtn = path.some(el => (el.id === 'lumina-ask-selection-btn') || (el.id === 'lumina-ask-input-popup') || (window.LuminaSelection && el === LuminaSelection.btn));

        if (!isInsideAskBtn) {
            if (window.LuminaSelection) LuminaSelection.hide();
        }
    }, true);

    // Load setting
    chrome.storage.local.get(['askSelectionPopupEnabled', 'readWebpage'], (result) => {
        askSelectionPopupEnabled = result.askSelectionPopupEnabled ?? true;
        readWebpageEnabled = result.readWebpage ?? false;
        // LuminaSelection is initialized in initShadowDOM; nothing extra needed here
    });

    // Listen for storage changes - Consolidated single listener to prevent background lag
    chrome.storage.onChanged.addListener((changes, area) => {
        if (!chrome.runtime || !chrome.runtime.id) return;
        // 1. Settings & Mappings (local)
        if (area === 'local') {
            if (changes.askSelectionPopupEnabled) {
                askSelectionPopupEnabled = changes.askSelectionPopupEnabled.newValue ?? false;
            }
            if (changes.readWebpage) {
                readWebpageEnabled = changes.readWebpage.newValue ?? false;
            }
            if (changes.questionMappings) questionMappings = changes.questionMappings.newValue || [];

            // Font size settings (compensated for page zoom)
            if (changes.fontSize || changes.fontSizeByDomain || changes.globalDefaults) {
                applyAskSelectionStyles();
            }

            // Theme sync
            if (changes.theme || (changes.globalDefaults && changes.globalDefaults.newValue && changes.globalDefaults.newValue.theme)) {
                if (typeof cachedTheme !== 'undefined') {
                    cachedTheme = null;
                    if (typeof updateTheme === 'function') updateTheme();
                }
            }
        }
    });

    // ChatHistoryManager is now loaded from libs/chat_history.js
    chrome.storage.local.get(['disabledDomains'], (items) => {
        const disabledDomains = items.disabledDomains || [];
        if (disabledDomains.includes(window.location.hostname)) {
            isExtensionDisabled = true;
            removeFonts(); // Remove fonts if domain is disabled
        }
        // Fonts are already injected at script load, no need to call injectFonts() here
    });

    // Listen for toggle messages
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
        }

        // Handle shortcuts update
        if (request.action === 'shortcuts_updated') {
            Object.assign(shortcuts, request.shortcuts);
        }

        // Handle live websource height/CSS update


        // Handle visual settings update
        if (request.action === 'settings_updated') {
            const settings = request.settings;
            // Apply theme change immediately
            if (settings.theme) {
                updateTheme();
            }
        }

        // Handle load chat history
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

        // Handle GPS location request from options page
        if (request.action === 'getGPSLocation') {
            if (!navigator.geolocation) {
                sendResponse({ error: 'Geolocation not supported' });
                return true;
            }

            navigator.geolocation.getCurrentPosition(
                async (position) => {
                    const lat = position.coords.latitude;
                    const lon = position.coords.longitude;

                    // Reverse geocode using Nominatim (zoom=16 for district level)
                    try {
                        const response = await fetch(
                            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=16&addressdetails=1&accept-language=en`,
                            { headers: { 'User-Agent': 'Lumina-Extension/1.0' } }
                        );

                        if (response.ok) {
                            const data = await response.json();
                            const address = data.address || {};

                            // Normalize Vietnamese city names to English
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

                            // Build detailed location string with district
                            const parts = [];

                            // Add district/suburb (this is the detailed part)
                            if (address.suburb) parts.push(normalize(address.suburb));
                            else if (address.neighbourhood) parts.push(normalize(address.neighbourhood));
                            else if (address.quarter) parts.push(normalize(address.quarter));
                            else if (address.city_district) parts.push(normalize(address.city_district));

                            // Add city
                            if (address.city) parts.push(normalize(address.city));
                            else if (address.town) parts.push(normalize(address.town));
                            else if (address.village) parts.push(normalize(address.village));

                            // Add country
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

                            // Save to storage (no timestamp - no expiry)
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

            return true; // Keep channel open for async
        }

        if (request.action === 'startDictationRecording') {
            startDictationRecording().then(sendResponse);
            return true; // Keep channel open for async
        }

        if (request.action === 'stopDictationRecording') {
            stopDictationRecording().then(sendResponse);
            return true; // Keep channel open for async
        }

        if (request.action === 'pasteDictationText') {
            pasteDictationText(request.text);
        }
    });

    // Use shared constant from libs/constants.js
    const DEFAULT_SHORTCUTS = LUMINA_DEFAULT_SHORTCUTS;

    let shortcuts = { ...DEFAULT_SHORTCUTS };
    let questionMappings = [];

    // Load saved shortcuts
    chrome.storage.local.get(['shortcuts'], (items) => {
        if (items.shortcuts) {
            Object.assign(shortcuts, items.shortcuts);
        }
    });

    // Load saved mappings
    chrome.storage.local.get(['questionMappings'], (items) => {
        if (items.questionMappings) {
            questionMappings = items.questionMappings;
        }
    });

    // --- Shared Chat History ---
    // Standardized keys and session management handled by ChatHistoryManager
    let popupSearchQuery = '';
    const POPUP_HISTORY_BATCH_SIZE = 30;
    const popupHistoryState = new WeakMap();

    // Track if another key was pressed while a modifier is held (for modifier-only shortcuts)
    let modifierKeyPressedAlone = true;

    // Helper function to check if an event matches a shortcut
    function matchesShortcut(event, action) {
        const shortcut = shortcuts[action];
        if (!shortcut) return false;

        if (shortcut.key === 'Shift' || shortcut.key === 'Control' || shortcut.key === 'Alt' || shortcut.key === 'Meta') {
            if (event.type !== 'keyup' || event.key !== shortcut.key || !modifierKeyPressedAlone) return false;
            // Only enforce side if the code is side-specific (ends with Left/Right).
            // Generic codes like 'Shift' (both-sides shortcut) match either side.
            const isSideSpecific = shortcut.code && (shortcut.code.endsWith('Left') || shortcut.code.endsWith('Right'));
            if (isSideSpecific && shortcut.code !== event.code) return false;
            return true;
        }

        if (!!shortcut.ctrlKey !== event.ctrlKey) return false;
        if (!!shortcut.altKey !== event.altKey) return false;
        if (!!shortcut.shiftKey !== event.shiftKey) return false;
        if (!!shortcut.metaKey !== event.metaKey) return false;

        // Check main key or mouse button
        if (event.type === 'mousedown' || event.type === 'mouseup' || event.type === 'click') {
            // Check mouse button
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

        // Protection for sites like YouTube: if focus is in Lumina, don't let shortcuts leak out
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
            // Don't block Enter, Escape or Tab - Lumina needs these for submission, closing, and navigation.
            // We let them bubble so other Lumina handlers (at document level) can see them.
            if (event.key === 'Enter' || event.key === 'Escape' || event.key === 'Tab') {
                return;
            }

            event.stopPropagation();
            event.stopImmediatePropagation();
        }
    }, true); // Use capture phase to run before other handlers

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

            if (window.LuminaSelection && LuminaSelection.isInsideEditable()) return;

            const selection = getActiveSelection();
            const text = getSmartSelectionText() || selection.toString().trim();

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

        // Lumina Chat (lone modifier shortcut variant — fires on keyup)
        const luminaChatShortcut = shortcuts['luminaChat'];
        const isLoneModifierLuminaChat = luminaChatShortcut && ['Shift', 'Control', 'Alt', 'Meta'].includes(luminaChatShortcut.key);
        if (isLoneModifierLuminaChat && matchesShortcut(event, 'luminaChat')) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();

            // Always use side panel
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

        if ((event.ctrlKey || event.metaKey) && !event.shiftKey && ['r', 't', 'n', 'w', 'l', 'f', 'p', 's', 'c', 'x', 'z', 'y'].includes(event.key.toLowerCase())) {
            return;
        }

        // Question Mappings (Text Selection + Key)
        if (questionMappings && questionMappings.length > 0) {
            if (window.LuminaSelection && !LuminaSelection.isInsideEditable()) {
                const selection = window.getSelection();
                // User requested to preserve spaces (e.g. indentation or specific formatting)
                const text = selection.toString();

                // Check if there is actual content (ignoring pure whitespace for trigger safety, 
                if (text && text.trim().length > 0) {
                    const mapping = questionMappings.find(m => {
                        // Support new keyData format or legacy simple key
                        let config = m.keyData;
                        if (!config && m.key) {
                            // Legacy fallback
                            config = { key: m.key, code: 'Key' + m.key.toUpperCase() };
                            // Legacy only supported simple keys, so no modifiers
                            if (event.ctrlKey || event.metaKey || event.altKey) return false;
                        }

                        if (!config) return false;

                        // Check match manually using similar logic to matchesShortcut
                        if (!!config.ctrlKey !== event.ctrlKey) return false;
                        if (!!config.altKey !== event.altKey) return false;
                        if (!!config.shiftKey !== event.shiftKey) return false;
                        if (!!config.metaKey !== event.metaKey) return false;

                        // Check main key
                        if (config.key === 'Shift' || config.key === 'Control' || config.key === 'Alt' || config.key === 'Meta') {
                            return event.key === config.key;
                        }

                        return event.key.toLowerCase() === config.key.toLowerCase() || event.code === config.code;
                    });

                    if (mapping) {
                        event.preventDefault();
                        event.stopPropagation();
                        event.stopImmediatePropagation();

                        // CRITICAL: Set range and reset direction BEFORE showing popup
                        // This ensures updatePopupPosition uses selection coordinates, not center.
                        if (selection.rangeCount > 0) {
                            currentRange = selection.getRangeAt(0).cloneRange();
                        }
                        popupDirection = null; // Re-evaluate above/below for fresh shortcut trigger

                        // Check if prompt implies translation
                        const promptLower = mapping.prompt.toLowerCase();
                        const hasVariables = /\$(SelectedText|Sentence|Paragraph|Container)|"SelectedText"/i.test(mapping.prompt);

                        const isTranslation =
                            promptLower.includes('dịch') ||
                            promptLower.includes('translate') ||
                            promptLower.includes('vietnamese') ||
                            promptLower.includes('tiếng việt') ||
                            promptLower.includes('chuyển ngữ') ||
                            (promptLower.includes('nghĩa') && (promptLower.includes('việt') || promptLower.includes('viet')));

                        // Extract text for replacement
                        const normalize = (s) => s.replace(/\s+/g, ' ').trim();
                        const cleanSelection = normalize(text);

                        // Construct questions with variable replacement
                        let fullQuestion = mapping.prompt;
                        let displayQuestion = mapping.prompt;

                        if (hasVariables) {
                            const containerContent = getSmartClimbedContext();
                            fullQuestion = fullQuestion
                                .replace(/\$SelectedText|"SelectedText"/gi, text.trim())
                                .replace(/\$Sentence/gi, () => getSentenceContext())
                                .replace(/\$Paragraph/gi, () => getParagraphContext())
                                .replace(/\$Container/gi, containerContent);
                            // Display version: omit $Container and surrounding punctuation/spaces
                            displayQuestion = mapping.prompt
                                .replace(/\$SelectedText|"SelectedText"/gi, text.trim())
                                .replace(/\$Sentence/gi, () => getSentenceContext())
                                .replace(/\$Paragraph/gi, () => getParagraphContext())
                                .replace(/[("'\[]*\$Container[)"'\]]*\s*/gi, '')
                                .trim();
                        } else {
                            // Fallback logic: place selection FIRST to match UI layout [SelectedText] [Input]
                            fullQuestion = `"${text.trim()}" ${mapping.prompt}`;
                            displayQuestion = fullQuestion;
                        }

                        // Always redirect to Side Panel
                        triggerSidePanelQuery(fullQuestion, displayQuestion);
                        window.getSelection().removeAllRanges();
                        if (window.LuminaSelection) LuminaSelection.hide();
                        return;
                    }
                }
            }
        }



        // If the ask-selection button is visible and a shortcut fires, hide it.
        if (window.LuminaSelection && LuminaSelection.isInsideEditable()) return;

        if (window.LuminaSelection && LuminaSelection.btn && LuminaSelection.btn.style.display === 'flex') {
            if (['luminaChat', 'audio', 'translate'].some(action => matchesShortcut(event, action))) {
                LuminaSelection.hide();
            }
        }

        // Lumina Chat
        if (matchesShortcut(event, 'luminaChat')) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();

            // Always open side panel
            safeRuntimeSendMessage({ action: 'open_sidepanel' });
            return;
        }


        // Ask Lumina Shortcut
        if (matchesShortcut(event, 'askLumina')) {
            const selection = window.getSelection();
            const text = selection.toString().trim();
            const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

            // Only trigger if text is selected
            if (text.length > 0 && range && window.LuminaSelection) {
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();

                LuminaSelection.show(0, 0, text, range);
                LuminaSelection.showInput();
                window.getSelection().removeAllRanges();
                return;
            }
        }

        // Play Audio Shortcut
        // Skip if this is a modifier-only shortcut (e.g. Shift alone) — those are handled in keyup to avoid double-firing
        const audioShortcut = shortcuts['audio'];
        const isModifierOnlyAudioShortcut = audioShortcut && ['Shift', 'Control', 'Alt', 'Meta'].includes(audioShortcut.key);
        if (!isModifierOnlyAudioShortcut && matchesShortcut(event, 'audio')) {
            if (event.__luminaAudioHandled) return;
            event.__luminaAudioHandled = true;

            if (isSelectionInsideEditable()) return;

            const selection = getActiveSelection();
            const text = getSmartSelectionText() || selection.toString().trim();

            const activeElement = typeof LuminaChatUI !== 'undefined' ? LuminaChatUI.getDeepActiveElement() : document.activeElement;
            // Don't trigger if typing in an input without text selected
            const isInput = activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA' || activeElement.isContentEditable);
            if (isInput && text.length === 0) return;

            // If there's selected text, always play/replay from beginning
            if (text) {
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
                playCombinedAudio(text);
                return;
            } else {
                // No text selected - stop any playing audio
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
                stopAudio();
                return;
            }
        }

        // NOTE: Audio shortcut for modifier-only keys (like Shift alone) is handled in keyup listener below





        // Translate - Always performs translation
        if (matchesShortcut(event, 'translate')) {
            if (window.LuminaSelection && LuminaSelection.isInsideEditable()) return;

            const selection = window.getSelection();
            const text = selection.toString().trim();

            if (text.length > 0) {
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
                currentText = text;

                // Capture range BEFORE clearing selection
                if (selection.rangeCount > 0) {
                    currentRange = selection.getRangeAt(0).cloneRange();
                }
                popupDirection = null; // Re-evaluate positioning for fresh trigger

                window.getSelection().removeAllRanges();
                if (window.LuminaSelection) LuminaSelection.hide();

                // Always open side panel for translation
                safeRuntimeSendMessage({
                    action: 'open_sidepanel_with_query',
                    query: `translate: ${text}`
                });
                return;
            }
        }
    }, true);

    function formatTextLikeOriginal(original, target) {
        if (!target) return target;
        const trimmedOriginal = original.trim();
        if (trimmedOriginal.length === 0) return target;

        let finalResult = target.trim();

        // Check capitalization of the first letter
        const firstChar = trimmedOriginal.charAt(0);
        const isOriginalCapitalized = firstChar === firstChar.toUpperCase() && firstChar !== firstChar.toLowerCase();

        // Check for trailing dot
        const hasTrailingDot = trimmedOriginal.endsWith('.');

        // 1. Handle Trailing Dot
        if (!hasTrailingDot && finalResult.endsWith('.')) {
            finalResult = finalResult.slice(0, -1);
        } else if (hasTrailingDot && !finalResult.endsWith('.')) {
            finalResult += '.';
        }

        // 2. Handle Capitalization
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

    // ----- Audio playback (plays locally in content script via new Audio()) -----
    // Uses unified fetchAudio in background.js — same logic as spotlight.
    // No offscreen document or port needed - avoids all shared-state race conditions

    let currentAudioEl = null;   // The currently playing Audio element
    let audioAborted = false;    // Set to true to abort the current playback chain
    let audioDebounceTimer = null;
    const CHUNK_GAP_MS = 50;     // Gap between consecutive chunks

    // Audio cache for instant replay (in-memory for current session)
    let audioCache = {
        text: null,
        type: null,  // 'oxford' or 'google'
        data: null   // single base64 string for oxford, array for google
    };

    // Combined Play - delegates all fetch logic to the unified fetchAudio in background.js
    async function playCombinedAudio(text) {
        if (!text) return;

        if (audioDebounceTimer) { clearTimeout(audioDebounceTimer); audioDebounceTimer = null; }

        // Abort and stop any current playback immediately
        audioAborted = true;
        if (currentAudioEl) { currentAudioEl.pause(); currentAudioEl = null; }
        audioAborted = false;

        const normalizedText = text.trim();

        try {
            const storageData = await chrome.storage.local.get(['audioSpeed']);
            const speed = storageData.audioSpeed || 1.0;

            // 1. Check in-memory cache
            if (audioCache.text === normalizedText && audioCache.data) {
                const chunks = Array.isArray(audioCache.data) ? audioCache.data : [audioCache.data];
                await playChunksSequentially(chunks, speed);
                return;
            }

            // 2. Check persistent cache
            try {
                const cached = await chrome.runtime.sendMessage({ action: 'getAudioCache', text: normalizedText });
                if (cached && cached.success && cached.data) {
                    const chunks = Array.isArray(cached.data) ? cached.data : [cached.data];
                    audioCache = { text: normalizedText, type: cached.type, data: cached.data };
                    await playChunksSequentially(chunks, speed);
                    return;
                }
            } catch (e) { /* cache miss */ }

            // 3. Fetch via unified background logic (Oxford priority for 1-2 words, Google otherwise)
            const result = await chrome.runtime.sendMessage({ action: 'fetchAudio', text: normalizedText, speed });
            if (!result || !result.chunks || result.chunks.length === 0) return;

            audioCache = { text: normalizedText, type: result.type, data: result.chunks };
            await playChunksSequentially(result.chunks, speed);
            chrome.runtime.sendMessage({ action: 'setAudioCache', text: normalizedText, type: result.type, data: result.chunks }).catch(() => { });
        } catch (e) { /* ignore */ }
    }

    // Play an array of base64 chunks sequentially with a small gap between them
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

    // Shared AudioContext — used only for silence detection, not for playback
    let _contentAudioCtx = null;
    function getContentAudioCtx() {
        if (!_contentAudioCtx || _contentAudioCtx.state === 'closed') {
            _contentAudioCtx = new AudioContext();
        }
        return _contentAudioCtx;
    }

    // Detect leading-silence offset (seconds) by decoding the buffer and scanning samples.
    // Returns 0 if detection fails.
    async function detectSilenceOffset(byteArray) {
        try {
            const ctx = getContentAudioCtx();
            // decodeAudioData transfers the buffer; pass a copy so the original is intact
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

    // Play a single base64 data URI via new Audio(), seeking past any leading silence.
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

                    // Detect silence offset before creating Blob URL
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
            } catch (e) { /* fall back below */ }

            // Fallback: play without silence trimming
            const audio = new Audio(blobUrl || base64);
            audio.playbackRate = speed;
            currentAudioEl = audio;
            const cleanup = () => { currentAudioEl = null; if (blobUrl) URL.revokeObjectURL(blobUrl); };
            audio.onended = () => { cleanup(); resolve(); };
            audio.onerror = () => { cleanup(); resolve(); };
            audio.play().catch(() => { cleanup(); resolve(); });
        });
    }

    // Oxford Audio (Helper)
    function playOxfordAudio(text, speed) {
        return new Promise((resolve, reject) => {
            if (!text) {
                reject('No text');
                return;
            }

            const str = text.trim().toLowerCase();
            const audioUrl = `https://ssl.gstatic.com/dictionary/static/sounds/oxford/${str}--_gb_1.mp3`;

            // Send to background -> Offscreen
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

    // --- Contextual Chat Helpers ---

    function extractContextParagraph(selection) {
        let context = "";

        try {
            const range = selection.getRangeAt(0);
            let node = range.commonAncestorContainer;

            // Find the parent block element (p, div, etc.)
            while (node && node.nodeType !== Node.ELEMENT_NODE) {
                node = node.parentNode;
            }

            while (node && !['P', 'DIV', 'ARTICLE', 'SECTION', 'BLOCKQUOTE', 'LI'].includes(node.tagName)) {
                node = node.parentNode;
            }

            if (node) {
                context = node.textContent.trim();
            }

            // If no context found or too short, try to get surrounding text
            if (!context || context.length < 50) {
                const fullText = selection.anchorNode.textContent || "";
                const selectedText = selection.toString();
                const index = fullText.indexOf(selectedText);

                if (index !== -1) {
                    // Get surrounding context (±200 chars)
                    const start = Math.max(0, index - 200);
                    const end = Math.min(fullText.length, index + selectedText.length + 200);
                    context = fullText.substring(start, end).trim();

                    // Clean up if we cut mid-sentence
                    if (start > 0 && !context.startsWith('.')) {
                        context = context.substring(context.indexOf('. ') + 2);
                    }
                    const firstSentence = context.indexOf('. ');
                    if (firstSentence > 0) {
                        context = context.substring(firstSentence + 2);
                    }
                }
            }

            // Limit context length
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

        // Add remove button
        const removeBtn = document.createElement('div');
        removeBtn.className = 'lumina-context-remove';
        removeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12"><path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
        removeBtn.title = 'Remove context';
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            // If context is standalone (pending), just remove it
            const parentEntry = element.closest('.lumina-dict-entry');
            if (parentEntry) {
                parentEntry.remove();
            } else {
                element.remove();
            }
        });
        element.appendChild(removeBtn);

        const maxLength = 120;

        // Always store full text in dataset for AI context extraction
        element.dataset.fullText = fullText;

        if (fullText.length > maxLength) {
            textSpan.textContent = fullText.substring(0, maxLength) + '...';
            element.classList.add('lumina-context-collapsed');
            element.title = "Click to expand";

            element.addEventListener('click', function expand(e) {
                // Don't expand if clicking on remove button
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
        // No-op
    }

    let lastPopupState = null;



    let popupDirection = null; // 'above' or 'below'

    // Update position on scroll and resize to keep popup next to text
    let isTicking = false;




    function applyAskSelectionStyles() {
        chrome.storage.local.get(['fontSize', 'fontSizeByDomain', 'globalDefaults'], (items) => {
            const currentDomain = window.location.hostname;
            let baseFontSize = 13; // Default

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
                // Fallback if common.js is not loaded for some reason
                if (luminaHost) {
                    luminaHost.style.setProperty('font-size', baseFontSize + 'px', 'important');
                }
                document.documentElement.style.setProperty('--lumina-fontSize', baseFontSize + 'px', 'important');
            }
        });
    }


    var cachedTheme = null;
    function updateTheme() {
        // Strategy: Cache theme to avoid repeated storage reads during streaming/scrolling
        const applyTheme = (theme) => {
            const preferredTheme = theme === 'auto'
                ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
                : theme;

            const isDark = preferredTheme === 'dark';
            if (luminaHost) isDark ? luminaHost.setAttribute('data-theme', 'dark') : luminaHost.removeAttribute('data-theme');

            const overlays = luminaShadowRoot ? luminaShadowRoot.querySelectorAll('.lumina-spotlight-overlay') : [];
            overlays.forEach(el => isDark ? el.setAttribute('data-theme', 'dark') : el.removeAttribute('data-theme'));
        };

        if (cachedTheme !== null) {
            applyTheme(cachedTheme);
            return;
        }

        chrome.storage.local.get(['theme', 'globalDefaults'], (data) => {
            cachedTheme = data.theme || (data.globalDefaults && data.globalDefaults.theme) || 'light';
            applyTheme(cachedTheme);
        });
    }

    // Clear theme cache when options change
    // (Theme sync already handled by consolidated storage listener aloft)

    // Watch for popup creation to apply theme immediately
    let dictPlusObserver = null;

    function initThemeObserver() {
        if (dictPlusObserver) return;
        if (!luminaShadowRoot) return;

        let _themeDebounceTimer = null;
        dictPlusObserver = new MutationObserver((mutations) => {
            // Only trigger on top-level childList changes (popup/bar added/removed),
            // not on every streaming innerHTML mutation deep in the tree.
            const hasTopLevelChange = mutations.some(m =>
                m.type === 'childList' && m.addedNodes.length &&
                m.target === luminaShadowRoot
            );
            if (!hasTopLevelChange) return;

            // Debounce: call updateTheme at most once per 200ms
            if (_themeDebounceTimer) return;
            _themeDebounceTimer = setTimeout(() => {
                _themeDebounceTimer = null;
                updateTheme();
            }, 200);
        });

        dictPlusObserver.observe(luminaShadowRoot, { childList: true, subtree: true });
    }

    // Ctrl/Cmd + Click = Enter (on focused element)
    document.addEventListener('mousedown', (e) => {
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.button === 0) {
            const focused = document.activeElement;
            if (focused && (focused.tagName === 'INPUT' || focused.tagName === 'TEXTAREA' || focused.isContentEditable)) {
                e.preventDefault(); // Prevent focus from changing
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
        // Handle DocumentFragment (nodeType 11)
        if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
            let text = '';
            for (const child of node.childNodes) {
                text += getVisibleText(child);
            }
            return text;
        }

        if (node.nodeType !== Node.ELEMENT_NODE) return '';

        const el = node;

        // Use computed style only if element is in document. 
        // For detached nodes (like in DocumentFragment), getComputedStyle is unreliable or empty.
        if (el.isConnected) {
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
                return '';
            }
        } else {
            // For detached nodes, we can only check inline styles. 
            // We assume it's visible unless explicitly hidden inline.
            if (el.style.display === 'none' || el.style.visibility === 'hidden' || el.style.opacity === '0') {
                return '';
            }
        }

        const tag = el.tagName.toLowerCase();

        // Skip common UI elements and functional buttons
        if (['button', 'svg', 'mat-icon', 'script', 'style', 'noscript', 'img'].includes(tag)) {
            return '';
        }

        // Explicit check for button roles or button classes
        const classStr = typeof el.className === 'string' ? el.className.toLowerCase() : '';

        if (el.getAttribute('role') === 'button' ||
            classStr.includes('btn') ||
            classStr.includes('button') ||
            el.classList.contains('lumina-dict-play-btn')) {
            return '';
        }

        // Check for links masquerading as buttons
        if (tag === 'a' && (
            el.classList.contains('btn') ||
            el.classList.contains('button') ||
            el.className.includes('btn ') // Fallback string check
        )) {
            return '';
        }

        // Skip elements with aria-hidden
        if (el.getAttribute('aria-hidden') === 'true') {
            return '';
        }

        // Skip icon fonts and specific excluded classes (like dividers)
        const classNameStr = typeof el.className === 'string' ? el.className : (el.className?.baseVal || '');
        if (/\b(icon|material-icons|google-symbols|fa-|glyphicon|lumina-translation-divider|lumina-trans-actions)\b/i.test(classNameStr)) {
            return '';
        }

        // Recurse into children
        let text = '';
        for (const child of el.childNodes) {
            text += getVisibleText(child);
        }

        // Add space/newline based on display type/tag
        if (['div', 'p', 'br', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'tr'].includes(tag)) {
            text = '\n' + text + '\n';
        }

        return text;
    }

    /**
     * Cross-Shadow DOM Selection Helper
     * Returns the active selection even if it's inside the Lumina Shadow DOM
     */
    function getActiveSelection(preferShadow = false) {
        if (preferShadow) {
            // Prioritize Lumina's own shadow root if requested
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

        // Recursively check Shadow DOM of active elements (common for components/iframes)
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
            // Check Lumina's own shadow root last if not prioritized
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

        // Clean up
        extracted = extracted
            .replace(/\n{3,}/g, '\n\n')  // Collapse multiple newlines
            .replace(/[ \t]+/g, ' ')      // Collapse spaces
            .replace(/ ?\n ?/g, '\n')     // Clean spaces around newlines
            .trim();

        // Fallback to basic selection string if smart extraction failed but selection exists
        if (!extracted && sel.toString().trim()) {
            extracted = sel.toString().trim();
        }

        return extracted;
    }

    /**
     * Sanitizes text selection for dictionary lookups by removing leading/trailing punctuation
     * and excess whitespace. Example: "take it for granted," -> "take it for granted"
     */
    function sanitizeDictionaryQuery(text) {
        if (!text) return '';
        // Trim and then remove non-alphanumeric trailing/leading characters
        // (keeping inner ones like '-'). Using unicode aware regex if possible, 
        // but basic punctuation check is safer for now.
        return text.toString().trim().replace(/^[^a-zA-Z0-9'"]+|[^a-zA-Z0-9'"]+$/g, '');
    }

    /**
     * Get the sentence containing the current selection
     */
    function getSentenceContext() {
        const sel = getActiveSelection();
        if (!sel || sel.rangeCount === 0) return '';

        const range = sel.getRangeAt(0);
        let node = range.startContainer;
        if (!node) return '';

        const blockTags = ['P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'ARTICLE', 'SECTION', 'TR', 'TD'];

        // Find a block-level parent, crossing shadow boundaries if needed
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

        // Robust way to find selection offset in parent
        const preSelectionRange = range.cloneRange();
        preSelectionRange.selectNodeContents(parent);
        preSelectionRange.setEnd(range.startContainer, range.startOffset);
        const index = preSelectionRange.toString().length;

        const before = text.substring(0, index);
        const after = text.substring(index + selectionText.length);

        // Find boundaries of the sentence
        const lastTerminatorIndex = before.lastIndexOf('.'); // Simple fallback
        // Use regex for more markers: . ! ?
        const markers = before.match(/.*[.!?](?:\s|$)/);
        const start = markers ? markers[0].length : 0;

        const nextMarkers = after.match(/.*?[.!?](?:\s|$)/);
        const end = nextMarkers ? index + selectionText.length + nextMarkers[0].length : text.length;

        return text.substring(start, end).trim();
    }

    /**
     * Get the paragraph (block) containing the current selection
     */
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

    /**
     * Get the nearest container (DIV) content
     */
    /**
     * Smart Context: Climbs up the DOM from selection to find the most meaningful container.
     * It will skip small blocks (P, LI) and keep climbing until it finds a DIV or similar substantial container.
     */
    function getSmartClimbedContext() {
        const sel = getActiveSelection();
        if (!sel || sel.rangeCount === 0) return '';

        const range = sel.getRangeAt(0);
        let node = range.startContainer;
        if (!node) return '';

        // Start looking for containers
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

    // Smart copy listener - always trim whitespace
    document.addEventListener('copy', (e) => {
        if (isExtensionDisabled) return;

        try {
            const activeElement = typeof LuminaChatUI !== 'undefined' ? LuminaChatUI.getDeepActiveElement() : document.activeElement;
            const isEditing = activeElement && (['INPUT', 'TEXTAREA', 'SELECT'].includes(activeElement.tagName) || activeElement.isContentEditable);

            // Don't apply smart copy when user is selecting text inside an input/textarea or other editing field
            if (isEditing) return;

            const sel = window.getSelection();
            if (!sel || sel.rangeCount === 0) return;

            const smartText = getSmartSelectionText();
            const original = sel.toString();
            const trimmedOriginal = original.trim();

            // Always use trimmed text; prefer smart text if different
            let finalText = trimmedOriginal;
            if (smartText && smartText !== trimmedOriginal) {
                finalText = smartText.trim();
            }

            // Only override if we're actually changing something
            if (finalText !== original) {
                e.preventDefault();
                e.clipboardData.setData('text/plain', finalText);
            }
        } catch (err) {
            // Silently fail to let default browser copy proceed
        }
    }, true);

    /**
     * YouTube Transcript Cache
     * Stores transcript text captured from the DOM panel to provide fast access
     * and persistence even if the panel is closed.
     */
    let youtubeTranscriptCache = {
        videoId: null,
        transcript: null,
        status: 'idle'
    };



    /**
     * Robust "Reader Mode" style extraction.
     * Identifies the main content by scoring containers based on text density,
     * class names, and relationship to other elements.
     */
    async function extractMainContent(doc = document) {
        const url = window.location.href;
        const isYouTube = typeof YoutubeUtils !== 'undefined' && YoutubeUtils.isYouTubeVideo(url);

        let youtubeTranscript = "";
        if (isYouTube) {
            const videoId = YoutubeUtils.getVideoId(url);
            if (videoId) {
                // EXCLUSIVE LOGIC: Use DOM or Cache (both coming from the panel)
                youtubeTranscript = YoutubeUtils.getTranscriptFromDOM();

                // If panel is visible but no text, wait a bit for YouTube to populate it
                if (!youtubeTranscript) {
                    const panel = document.querySelector('ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]');
                    if (panel && panel.offsetParent !== null) {
                        console.log('[Lumina] Transcript panel visible but empty, waiting for current content...');
                        await new Promise(r => setTimeout(r, 1500));
                        youtubeTranscript = YoutubeUtils.getTranscriptFromDOM();
                    }
                }

                // Fallback to cache if DOM scan failed (e.g. user closed panel)
                if (!youtubeTranscript && youtubeTranscriptCache.videoId === videoId) {
                    youtubeTranscript = youtubeTranscriptCache.transcript;
                }
            }
        }

        const docClone = doc.cloneNode(true);

        // 1. Remove obvious noise immediately
        const blacklistedSelectors = [
            'nav', 'footer', 'header', 'aside', 'script', 'style', 'noscript',
            'form', 'svg', 'canvas', '.ads', '.sidebar', '.menu', '.footer', '.header',
            '.ad-box', '.social-share', '.comments', '[id^="lumina-"]', '[class^="lumina-"]'
        ];
        
        // Specialized logic for SharePoint/Office Online to preserve viewer containers
        const isOfficeDoc = url.includes('sharepoint.com') || url.includes('office.com') || url.includes('officeapps.live.com');
        
        blacklistedSelectors.forEach(s => {
            docClone.querySelectorAll(s).forEach(el => {
                // Don't remove iframes on Office docs as they hold the content
                if (s === 'iframe' && isOfficeDoc) return;
                el.remove();
            });
        });

        // 2. Score potential main containers
        const candidates = [];
        const elements = docClone.querySelectorAll('div, article, section, main');

        elements.forEach(el => {
            const text = el.innerText.trim();
            if (text.length < 100) return;

            const links = el.querySelectorAll('a');
            let linkLength = 0;
            links.forEach(a => linkLength += a.innerText.length);
            const linkDensity = linkLength / text.length;
            if (linkDensity > 0.4) return;

            let score = Math.floor(text.length / 100);
            const weightString = (el.className + ' ' + el.id).toLowerCase();
            if (/(article|content|main|body|post|entry|text|story)/i.test(weightString)) score += 25;
            if (/(comment|sidebar|footer|header|nav|menu|share|meta|promo|ad|tags)/i.test(weightString)) score -= 50;

            candidates.push({ element: el, score: score });
        });

        // 3. Select best container or fallback
        candidates.sort((a, b) => b.score - a.score);
        let bestEl = candidates.length > 0 ? candidates[0].element : docClone.body;

        // Specialized check for Excel Online elements if standard scoring fails
        if (isOfficeDoc && (!candidates.length || candidates[0].score < 10)) {
            const excelContainer = docClone.querySelector('.ewa-grid-container, #WACViewPanel_Excel_MainElement, .WACViewPanel');
            if (excelContainer) bestEl = excelContainer;
        }

        bestEl.querySelectorAll('p, li, .ewa-rtc-content').forEach(sub => {
            const subText = sub.innerText.trim();
            if (subText.length < 5) {
                sub.remove();
                return;
            }
            const subLinks = sub.querySelectorAll('a');
            let slLen = 0;
            subLinks.forEach(a => slLen += a.innerText.length);
            if (slLen > subText.length * 0.5) sub.remove();
        });

        let finalText = bestEl.innerText || bestEl.textContent || "";
        finalText = finalText
            .replace(/[ \t]+/g, ' ')
            .replace(/\n\s*\n/g, '\n\n')
            .trim();

        finalText = `[Page Content]:\n${finalText}`;

        if (youtubeTranscript) {
            finalText = `${finalText}\n\n---\n\n[YouTube Video Transcript]:\n${youtubeTranscript}`;
        }

        return {
            url: url,
            title: document.title,
            content: finalText
        };
    }

    function luminaEstimateTokens(text) {
        if (!text) return 0;
        return Math.ceil(text.length / 3);
    }

    // Assign to window for external calling via executeScript
    window.luminaExtractMainContent = extractMainContent;
    window.luminaEstimateTokens = luminaEstimateTokens;

    initShadowDOM();

    // Initialize YouTube Background Fetcher
    // YouTube Interval Management
    let youtubeNavInterval = null;
    let youtubeCacheInterval = null;

    if (window.location.hostname.includes('youtube.com')) {
        document.addEventListener('yt-navigate-finish', () => {
            // Clear any existing intervals from previous video
            if (youtubeNavInterval) clearInterval(youtubeNavInterval);
            if (youtubeCacheInterval) clearInterval(youtubeCacheInterval);

            // Wait for DOM to stabilize after navigation before auto-opening
            setTimeout(() => {
                autoOpenYouTubeTranscript();
            }, 1000);
        });

        // Initial run
        autoOpenYouTubeTranscript();
    }

    /**
     * Automatically attempts to open the YouTube transcript panel.
     * YouTube requires the panel to be open to reliably reflect segments in the DOM.
     */
    async function autoOpenYouTubeTranscript() {
        if (!window.location.hostname.includes('youtube.com') || !window.location.pathname.includes('/watch')) return;

        const checkAndClick = () => {
            // 1. Check if already open and TRULY VISIBLE
            const panel = document.querySelector('ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]');
            const isVisible = panel &&
                panel.offsetParent !== null &&
                panel.getAttribute('visibility') === 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED';

            if (isVisible) {
                console.log('[Lumina] Transcript panel is already open and expanded.');
                return true;
            }

            // 2. Expand description if needed
            const expandBtn = document.querySelector('#expand, #description-inline-expander .tp-yt-paper-button#expand, ytd-text-inline-expander #expand');
            if (expandBtn && expandBtn.offsetParent !== null && (expandBtn.innerText.toLowerCase().includes('more') || expandBtn.innerText.toLowerCase().includes('thêm'))) {
                console.log('[Lumina] Expanding description to find transcript button...');
                expandBtn.click();
            }

            // 3. Find the "Show transcript" button
            const selectors = [
                'button[aria-label="Show transcript"]',
                'ytd-button-renderer[aria-label="Show transcript"] button',
                '.yt-spec-button-shape-next[aria-label="Show transcript"]',
                'ytd-video-description-transcript-section-renderer button'
            ];

            let btn = null;
            for (const sel of selectors) {
                btn = document.querySelector(sel);
                if (btn && btn.offsetParent !== null) break;
            }

            if (!btn) {
                const buttons = Array.from(document.querySelectorAll('button, ytd-button-renderer, tp-yt-paper-button'));
                btn = buttons.find(b => {
                    if (b.offsetParent === null) return false;
                    const txt = (b.innerText || b.textContent || '').toLowerCase();
                    return txt.includes('show transcript') ||
                        txt.includes('hiển thị bản ghi') ||
                        txt.includes('transcript');
                });
            }

            if (btn) {
                console.log('[Lumina] Found "Show transcript" button. Clicking...');
                btn.click();

                setTimeout(() => {
                    const collapseBtn = document.querySelector('ytd-text-inline-expander #collapse, #description-inline-expander #collapse, #collapse.ytd-text-inline-expander');
                    if (collapseBtn && collapseBtn.offsetParent !== null) {
                        console.log('[Lumina] Collapsing description...');
                        collapseBtn.click();
                    }
                }, 500);

                waitForSegmentsAndCache();
                return true;
            }
            return false;
        };

        if (checkAndClick()) return;

        let attempts = 0;
        const maxAttempts = 20;
        youtubeNavInterval = setInterval(() => {
            attempts++;
            if (checkAndClick() || attempts >= maxAttempts) {
                clearInterval(youtubeNavInterval);
                if (attempts < maxAttempts) {
                    waitForSegmentsAndCache();
                } else {
                    console.warn('[Lumina] Could not auto-open transcript (button not found or hidden)');
                }
            }
        }, 1000);

        async function waitForSegmentsAndCache() {
            const videoId = YoutubeUtils.getVideoId(window.location.href);
            if (!videoId) return;

            let cacheAttempts = 0;
            const maxCacheAttempts = 15;

            if (youtubeCacheInterval) clearInterval(youtubeCacheInterval);

            youtubeCacheInterval = setInterval(() => {
                cacheAttempts++;
                const transcript = YoutubeUtils.getTranscriptFromDOM();

                if (transcript && transcript.length > 0) {
                    if (youtubeTranscriptCache.videoId === videoId && youtubeTranscriptCache.transcript === transcript) {
                        clearInterval(youtubeCacheInterval);
                        return;
                    }

                    youtubeTranscriptCache.videoId = videoId;
                    youtubeTranscriptCache.transcript = transcript;
                    youtubeTranscriptCache.status = 'completed';

                    console.log(`[Lumina] Successfully captured transcript from DOM: ${transcript.length} chars`);
                    console.log(`[Lumina] Transcript Preview (first 1000 chars):\n%c${transcript.substring(0, 1000)}...`, "color: #4CAF50; font-weight: bold; font-style: italic;");

                    clearInterval(youtubeCacheInterval);
                } else if (cacheAttempts >= maxCacheAttempts) {
                    console.log('[Lumina] Timed out waiting for segments to populate in DOM panel.');
                    clearInterval(youtubeCacheInterval);
                }
            }, 1000);
        }
    }
})();


