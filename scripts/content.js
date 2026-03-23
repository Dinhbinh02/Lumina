if (window.LUMINA_INITIALIZED) {
    throw new Error("Lumina already initialized on this page.");
}
window.LUMINA_INITIALIZED = true;

let fontStyleElement = null;

function injectFonts() {
    if (fontStyleElement) return; // Already injected

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
        document.addEventListener('DOMContentLoaded', () => {
            if (document.head && fontStyleElement && !fontStyleElement.parentNode) {
                document.head.appendChild(fontStyleElement);
            }
        });
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
// Initial update and on every resize (which triggers on zoom change)
updateCachedZoom();
window.addEventListener('resize', () => {
    updateCachedZoom(() => {
        // Re-apply zoom compensation for current popup if it exists
        if (currentPopup && typeof applyPopupStyles === 'function') {
            applyPopupStyles(currentPopup);
        }
        // Also update spotlight overlay if it exists
        if (luminaShadowRoot) {
            const spotlight = luminaShadowRoot.querySelector('.lumina-spotlight-overlay');
            if (spotlight && typeof applyPopupStyles === 'function') {
                applyPopupStyles(spotlight, true);
            }
        }
        // Also update Ask Lumina elements
        if (typeof applyAskSelectionStyles === 'function') {
            applyAskSelectionStyles();
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


let currentPopup = null;
let askSelectionPopupBtn = null;
let askSelectionInputDiv = null;
let askSelectionPopupEnabled = false;
let askSelectionText = ''; // Store selected text when button is clicked
let askSelectionContext = ''; // Store surrounding context when button is clicked
let savedSpotlightPos = null;
// Load saved spotlight position
chrome.storage.local.get('spotlightPosition', (data) => {
    if (data.spotlightPosition) {
        savedSpotlightPos = data.spotlightPosition;
    }
});
let currentRange = null;
let currentText = ""; // Store current text for audio
let currentSpeed = 1.0; // Default audio speed
let isChatMode = false; // Track if we are in chat mode

// Utility: Capitalize the first letter of a string, skipping leading non-letter characters
function capitalizeText(text) {
    if (!text) return text;
    // Find the first letter (including Unicode letters for Vietnamese)
    try {
        return text.replace(/^[^a-zA-Z\d\p{L}]*([\p{L}])/u, (match, p1) => {
            return match.replace(p1, p1.toUpperCase());
        });
    } catch (e) {
        // Fallback for older environments or if regex fails
        return text.charAt(0).toUpperCase() + text.slice(1);
    }
}
let isPinned = false; // Track if popup is pinned
let isDragging = false; // Track if popup is being dragged
let isExtensionDisabled = false; // Track if extension is disabled for this site
let isMinimized = false; // Track if popup is minimized
let restoreBar = null; // Reference to the restore bar element
let minimizedPosition = null; // Store position before minimizing


// Shadow DOM Variables
let luminaHost = null;
let luminaShadowRoot = null;

function initShadowDOM() {
    if (luminaHost) return;

    luminaHost = document.createElement('div');
    luminaHost.id = 'lumina-host';
    // Host is fixed covering 0x0 but acts as container. 
    // pointer-events: none ensures it doesn't block page interactions.
    // Children needs pointer-events: auto.
    luminaHost.style.cssText = 'position: fixed; top: 0; left: 0; width: 0; height: 30px; z-index: 2147483647; pointer-events: none; border: none; padding: 0; margin: 0; font-family: sans-serif; font-size: 16px; line-height: normal; color: black;';

    luminaShadowRoot = luminaHost.attachShadow({ mode: 'open' });

    // Inject Styles
    const styleLink = document.createElement('link');
    styleLink.rel = 'stylesheet';
    styleLink.href = chrome.runtime.getURL('assets/styles/styles.css');
    luminaShadowRoot.appendChild(styleLink);

    const katexLink = document.createElement('link');
    katexLink.rel = 'stylesheet';
    katexLink.href = chrome.runtime.getURL('lib/katex/katex.min.css');
    luminaShadowRoot.appendChild(katexLink);

    // Mark that styles are loading
    window.luminaStylesLoaded = new Promise((resolve) => {
        styleLink.addEventListener('load', () => {
            resolve();
        });
    });

    // Append to documentElement (html) to avoid body limitations on some sites
    (document.documentElement || document.body).appendChild(luminaHost);

    initThemeObserver();
}

/**
 * Helper to get the active element, traversing Shadow DOMs
 */
function getDeepActiveElement(root = document) {
    let active = root.activeElement;
    while (active && active.shadowRoot) {
        active = active.shadowRoot.activeElement;
    }
    return active;
}

/**
 * Checks if the current selection or the active element is inside an editable context.
 * Useful for preventing shortcuts from firing while typing.
 */
function isSelectionInsideEditable() {
    const sel = window.getSelection();
    // 1. If there's a selection, check if the selected text nodes are inside an editable element
    try {
        if (sel && sel.rangeCount > 0 && sel.toString().trim().length > 0) {
            let node = sel.anchorNode;
            while (node && node !== document.documentElement) {
                if (node.nodeType === 1) {
                    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(node.tagName) ||
                        node.contentEditable === 'true' ||
                        node.getAttribute('contenteditable') === 'true' ||
                        node.getAttribute('role') === 'textbox' ||
                        node.classList.contains('mce-content-body') || // TinyMCE
                        node.classList.contains('ql-editor') // Quill
                    ) {
                        return true;
                    }
                }
                node = node.parentNode || (node.host && node.host.nodeType === 1 ? node.host : null);
            }
            return false; // Selection exists and is NOT in an editable container
        }
    } catch (e) {
        // Selection range might be invalid if nodes were removed
        return false;
    }

    // 2. Fallback/No Selection: if focus is in an editable area
    const active = getDeepActiveElement();
    if (active && (
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName) ||
        active.isContentEditable ||
        active.getAttribute('contenteditable') === 'true' ||
        active.getAttribute('role') === 'textbox' ||
        active.classList.contains('mce-content-body') ||
        active.classList.contains('ql-editor')
    )) {
        return true;
    }

    return false;
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

    // Fast check: Is there even a collapsed cursor or selection?
    const selection = getActiveSelection();
    if (!selection || (selection.isCollapsed && !currentPopup)) return;

    // CRITICAL: Save composedPath() BEFORE setTimeout - it gets cleared in async!
    const path = e.composedPath();
    const target = e.target;
    const clientX = e.clientX;
    const clientY = e.clientY;

    // Debounce to allow selection to complete
    setTimeout(() => {
        if (isExtensionDisabled) return;

        const isInsidePopup = currentPopup && path.some(el => el === currentPopup);
        const selectedText = selection.toString().trim();

        // Fast selection check first (toString is O(1) in Chrome)
        if (!selectedText && !isInsidePopup) {
            if (askSelectionInputDiv && askSelectionInputDiv.style.display === 'flex') {
                hideAskSelectionPopup();
            }
            return;
        }

        const isInsideAskBtn = askSelectionPopupBtn && path.some(el => el === askSelectionPopupBtn);
        const isInsideAskInput = askSelectionInputDiv && path.some(el => {
            try { return el === askSelectionInputDiv || (askSelectionInputDiv.contains && askSelectionInputDiv.contains(el)); } catch (e) { return false; }
        });

        if (isInsideAskBtn) return;

        // Hide existing input if new selection starts anywhere outside
        if (selectedText.length > 0 && askSelectionInputDiv && askSelectionInputDiv.style.display === 'flex' && !isInsideAskInput) {
            hideAskSelectionPopup();
        }

        // ── In-popup selection: show Ask Lumina button for text selected inside chat history ──
        if (isInsidePopup && askSelectionPopupEnabled) {
            console.log('[Lumina Debug] mouseup inside popup detected');
            if (askSelectionPopupBtn && !isInsideAskInput) {
                const selection = getActiveSelection(true); // Prioritize Shadow DOM selection
                const selectedText = selection ? selection.toString().trim() : '';
                console.log('[Lumina Debug] selection in popup text length:', selectedText.length);
                if (selectedText && selection.rangeCount > 0 && !isSelectionInsideEditable()) {
                    const range = selection.getRangeAt(0);
                    const scrollEl = currentPopup && currentPopup.querySelector('.lumina-chat-scroll-content');
                    console.log('[Lumina Debug] scrollEl found:', !!scrollEl);
                    if (scrollEl) {
                        let node = range.commonAncestorContainer;
                        let inScroll = false;
                        try { 
                            inScroll = scrollEl.contains(node) || node.contains(scrollEl); 
                        } catch (_) { }
                        console.log('[Lumina Debug] inScroll:', inScroll, 'nodeTagName:', node.tagName || 'TEXT', 'nodeType:', node.nodeType);
                        if (inScroll || isChatMode) { // Fallback to isChatMode if we're sure we're in popup
                            askSelectionText = selectedText;
                            askSelectionContext = '';
                            const rects = range.getClientRects();
                            console.log('[Lumina Debug] range rects count:', rects.length);
                            if (rects.length > 0) {
                                currentRange = range.cloneRange();
                                const margin = 5;
                                askSelectionPopupBtn.style.display = 'flex';
                                askSelectionPopupBtn.style.visibility = 'hidden';
                                const btnW = askSelectionPopupBtn.offsetWidth;
                                const btnH = askSelectionPopupBtn.offsetHeight || 36;
                                askSelectionPopupBtn.style.visibility = 'visible';
                                let top = rects[0].top - btnH - margin;
                                let left = rects[0].left;
                                if (top < 10) top = rects[0].bottom + margin;
                                const vw = window.innerWidth;
                                if (left + btnW > vw - 10) left = Math.max(10, vw - btnW - 10);
                                if (left < 10) left = 10;
                                askSelectionPopupBtn.style.left = left + 'px';
                                askSelectionPopupBtn.style.top = top + 'px';
                                console.log('[Lumina Debug] Positioned button in popup:', top, left);

                                startAskPopupScrollTracking();
                            }
                            return;
                        }
                    }
                }
            }
            return;
        }

        const text = getSmartSelectionText();

        const activesel = getActiveSelection();
        const selAnchor = (activesel && activesel.rangeCount > 0) ? activesel.getRangeAt(0).commonAncestorContainer : null;
        const isSelectionInsidePopup = selAnchor && luminaShadowRoot && (() => { try { return luminaShadowRoot.contains(selAnchor); } catch (e) { return false; } })();

        if (text.length > 0 && !isSelectionInsidePopup && !isSelectionInsideEditable()) {
            if (askSelectionPopupEnabled) showAskSelectionPopup(clientX, clientY);
        } else {
            const isAskInputCurrentlyVisible = askSelectionInputDiv && askSelectionInputDiv.style.display === 'flex';
            if (isAskInputCurrentlyVisible) {
                const isClickInsideAskInput = isInsideAskInput || (askSelectionInputDiv && askSelectionInputDiv.contains && askSelectionInputDiv.contains(target));
                if (!isClickInsideAskInput) {
                    hideAskSelectionPopup();
                }
            } else if (askSelectionPopupBtn && askSelectionPopupBtn.style.display !== 'none') {
                hideAskSelectionPopup();
            }
        }
    }, 10);
}, true); // Use CAPTURE phase to ensure we see the event even if the page stops propagation

// Hide when clicking outside
document.addEventListener('mousedown', (e) => {
    const path = e.composedPath();
    const isInsideAskBtn = askSelectionPopupBtn && path.some(el => el === askSelectionPopupBtn);
    const isInsideAskInput = askSelectionInputDiv && path.some(el => el === askSelectionInputDiv);
    const clickTarget = e.target;

    const isInsideAskBtnOrChild = isInsideAskBtn || (askSelectionPopupBtn && askSelectionPopupBtn.contains && askSelectionPopupBtn.contains(clickTarget));
    const isInsideAskInputOrChild = isInsideAskInput || (askSelectionInputDiv && askSelectionInputDiv.contains && askSelectionInputDiv.contains(clickTarget));

    const isInPathOfAskInput = askSelectionInputDiv && path.some(el => {
        try {
            return el === askSelectionInputDiv || (askSelectionInputDiv.contains && askSelectionInputDiv.contains(el));
        } catch (e) {
            return false;
        }
    });

    const shouldReallyHideAskPopup = !isInsideAskBtnOrChild && !isInsideAskInputOrChild && !isInPathOfAskInput;

    if (shouldReallyHideAskPopup) {
        hideAskSelectionPopup();
    }
});

// Load setting
chrome.storage.local.get(['askSelectionPopupEnabled'], (result) => {
    askSelectionPopupEnabled = result.askSelectionPopupEnabled ?? false;
    // Always initialise the ask button so it works inside the chat popup too
    initAskSelectionPopup();
});

// Listen for setting changes
// Listen for storage changes - Consolidated single listener to prevent background lag
chrome.storage.onChanged.addListener((changes, area) => {
    // 1. Settings & Mappings (local)
    if (area === 'local') {
        if (changes.askSelectionPopupEnabled) {
            askSelectionPopupEnabled = changes.askSelectionPopupEnabled.newValue ?? false;
            if (askSelectionPopupEnabled && !askSelectionPopupBtn) {
                initAskSelectionPopup();
            } else if (!askSelectionPopupEnabled && askSelectionPopupBtn) {
                hideAskSelectionPopup();
            }
        }
        if (changes.questionMappings) questionMappings = changes.questionMappings.newValue || [];
        if (changes.customSources) customSources = changes.customSources.newValue || [];
        
        // Font size settings (compensated for page zoom)
        if (changes.fontSize || changes.fontSizeByDomain || changes.globalDefaults) {
             chrome.storage.local.get(['fontSize', 'fontSizeByDomain', 'globalDefaults'], (items) => {
                const currentDomain = window.location.hostname;
                let fontSize = 13;
                if (items.fontSizeByDomain && items.fontSizeByDomain[currentDomain]) {
                    fontSize = items.fontSizeByDomain[currentDomain];
                } else {
                    const baseSize = items.globalDefaults?.fontSize || items.fontSize || 13;
                    fontSize = baseSize / (typeof getPageZoom === 'function' ? getPageZoom() : 1);
                }
                
                document.documentElement.style.setProperty('--lumina-fontSize', fontSize + 'px', 'important');
                if (currentPopup) currentPopup.style.setProperty('font-size', fontSize + 'px', 'important');
                if (askSelectionPopupBtn) askSelectionPopupBtn.style.setProperty('font-size', fontSize + 'px', 'important');
                if (askSelectionInputDiv) askSelectionInputDiv.style.setProperty('font-size', fontSize + 'px', 'important');
            });
        }

        // Theme sync
        if (changes.theme || (changes.globalDefaults && changes.globalDefaults.newValue && changes.globalDefaults.newValue.theme)) {
            if (typeof cachedTheme !== 'undefined') {
                cachedTheme = null;
                if (typeof updateTheme === 'function') updateTheme();
            }
        }
    }
    
    // 2. Popup UI & Constraints (sync/local)
    if (currentPopup) {
        if (changes.fontSize) {
            const fs = (changes.fontSize.newValue || 13) / (typeof getPageZoom === 'function' ? getPageZoom() : 1);
            currentPopup.style.setProperty('font-size', fs + 'px', 'important');
        }
        if (changes.popupWidth) {
            const w = changes.popupWidth.newValue + 'px';
            currentPopup.style.setProperty('width', w, 'important');
            currentPopup.style.setProperty('min-width', w, 'important');
            currentPopup.style.setProperty('max-width', w, 'important');
        }
        if (changes.popupHeight) {
            const h = changes.popupHeight.newValue + 'px';
            currentPopup.style.setProperty('height', h, 'important');
            currentPopup.style.setProperty('min-height', h, 'important');
            currentPopup.style.setProperty('max-height', h, 'important');
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
    if (request.action === 'toggle_extension_state') {
        isExtensionDisabled = !request.isEnabled;
        if (isExtensionDisabled) {
            removePopup();
            removeFonts();
        } else {
            injectFonts();
        }
    }

    // Handle shortcuts update
    if (request.action === 'shortcuts_updated') {
        Object.assign(shortcuts, request.shortcuts);
    }

    // Handle live websource height/CSS update
    if (request.action === 'update_websource') {
        const src = request.source;
        if (!src || !luminaShadowRoot) return;
        const containers = luminaShadowRoot.querySelectorAll(`.lumina-websource-container[data-source-id="${src.id}"]`);
        containers.forEach(container => {
            // Update height
            const heightPct = Math.min(100, Math.max(20, src.height || 80));
            container.dataset.sourceHeightPct = String(heightPct);
            const scrollContainer = container.closest('.lumina-messages-container') ||
                container.closest('.lumina-chat-container') ||
                container.parentElement;
            const containerH = scrollContainer ? (scrollContainer.clientHeight || scrollContainer.offsetHeight) : 0;
            const newH = containerH > 0 ? Math.round(containerH * heightPct / 100) : Math.round(400 * heightPct / 100);
            container.style.height = newH + 'px';

            // Update custom CSS via background script (for cross-origin iframes)
            if (src.css) {
                const frameUrl = container.dataset.sourceUrl;
                if (frameUrl) {
                    chrome.runtime.sendMessage({
                        action: 'inject_iframe_css',
                        css: src.css,
                        frameUrl
                    }).catch(() => { });
                }
            }

            // Re-apply selector isolation if set
            if (src.selector) {
                const frameUrl = container.dataset.sourceUrl;
                if (frameUrl) {
                    chrome.runtime.sendMessage({
                        action: 'inject_iframe_selector',
                        selector: src.selector,
                        frameUrl
                    }).catch(() => { });
                }
            }

            // Re-apply zoom
            const frameUrl = container.dataset.sourceUrl;
            if (frameUrl) {
                chrome.runtime.sendMessage({
                    action: 'inject_iframe_zoom',
                    zoom: src.zoom || 100,
                    frameUrl
                }).catch(() => { });
            }
        });
        return;
    }

    // Handle visual settings update - apply to current popup immediately
    if (request.action === 'settings_updated') {
        const settings = request.settings;

        // Apply font size to popup (only domain-specific)
        const currentDomain = window.location.hostname;
        let fontSize = 13; // Default

        if (settings.fontSize) {
            fontSize = parseFloat(settings.fontSize) / getPageZoom();
        } else if (settings.globalDefaults && settings.globalDefaults.fontSize) {
            // Global default is at 100% zoom — compensate for current zoom so it looks the same
            fontSize = settings.globalDefaults.fontSize / getPageZoom();
        }

        if (settings.fontSizeByDomain && settings.fontSizeByDomain[currentDomain]) {
            // Domain-specific: user set it explicitly, use as-is
            fontSize = parseFloat(settings.fontSizeByDomain[currentDomain]);
        }
        // No global fallback - use default 13px if no domain-specific setting

        if (currentPopup) {
            currentPopup.style.setProperty('font-size', fontSize + 'px', 'important');
        }

        // Apply font size to spotlight overlay (if exists)
        if (fontSize) {
            const spotlightOverlay = luminaShadowRoot ? luminaShadowRoot.querySelector('.lumina-spotlight-overlay') : null;
            if (spotlightOverlay) {
                spotlightOverlay.style.setProperty('font-size', fontSize + 'px', 'important');
            }
        }

        // Apply font size to Ask Lumina elements
        if (typeof applyAskSelectionStyles === 'function') {
            applyAskSelectionStyles();
        }

        // Apply popup dimensions (only to popup, not spotlight) - domain-specific
        if (currentPopup) {
            let width = 500; // Default
            let height = 500; // Default

            // Global defaults are at 100% zoom — divide by zoom so popup looks the same size
            const zoom = getPageZoom();
            if (settings.globalDefaults) {
                if (settings.globalDefaults.width) width = Math.round(settings.globalDefaults.width / zoom);
                if (settings.globalDefaults.height) height = Math.round(settings.globalDefaults.height / zoom);
            }

            // Use direct values if provided (e.g. from Save as Default) — also compensate
            if (settings.popupWidth) width = Math.round(settings.popupWidth / zoom);
            if (settings.popupHeight) height = Math.round(settings.popupHeight / zoom);

            // Domain-specific overrides: user set them explicitly, use as-is
            if (settings.popupDimensionsByDomain && settings.popupDimensionsByDomain[currentDomain]) {
                const domainDims = settings.popupDimensionsByDomain[currentDomain];
                width = domainDims.width || width;
                height = domainDims.height || height;
            }

            const w = width + 'px';
            currentPopup.style.setProperty('width', w, 'important');
            currentPopup.style.setProperty('min-width', w, 'important');
            currentPopup.style.setProperty('max-width', w, 'important');

            const h = height + 'px';
            currentPopup.style.setProperty('height', h, 'important');
            currentPopup.style.setProperty('min-height', '200px', 'important');
            currentPopup.style.setProperty('max-height', h, 'important');

            // Update position after size changes
            updatePopupPosition();
        }

        // Apply theme change immediately
        if (settings.theme && currentPopup) {
            let effectiveTheme = settings.theme;
            if (effectiveTheme === 'auto') {
                effectiveTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
            }
            currentPopup.setAttribute('data-theme', effectiveTheme);
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

// Load saved shortcuts
chrome.storage.local.get(['shortcuts'], (items) => {
    if (items.shortcuts) {
        Object.assign(shortcuts, items.shortcuts);
    }
});

let questionMappings = [];
let customSources = [];

// Load saved mappings and sources
chrome.storage.local.get(['questionMappings', 'customSources'], (items) => {
    if (items.questionMappings) {
        questionMappings = items.questionMappings;
    }
    if (items.customSources) {
        customSources = items.customSources;
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
    const active = getDeepActiveElement();
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
        const active = getDeepActiveElement();
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

        if (isSelectionInsideEditable()) return;

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

        // Handle toggle/restore logic
        if (isMinimized) {
            restorePopup(false);
            setTimeout(() => {
                const chatInput = currentPopup.querySelector('.lumina-chat-input');
                if (chatInput) { chatInput.style.height = ''; chatInput.focus(); }
            }, 100);
            return;
        }

        if (currentPopup && currentPopup.isConnected) {
            minimizePopup();
            return;
        }

        showSpotlight();
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

    if (isMouseOverPopup && currentPopup) {
        // Backtick shortcut to edit last question
        if (event.key === '`') {
            const chatUI = currentPopup._luminaChatUI;
            const historyEl = chatUI ? chatUI.historyEl : currentPopup.querySelector('.lumina-chat-history');
            if (historyEl) {
                const entries = historyEl.querySelectorAll('.lumina-dict-entry');
                if (entries.length > 0) {
                    const lastEntry = entries[entries.length - 1];
                    const questionEl = lastEntry.querySelector('.lumina-chat-question > div[contenteditable="true"]') ||
                        lastEntry.querySelector('.lumina-chat-question > span') ||
                        lastEntry.querySelector('.lumina-chat-question > *:not(.lumina-chat-question-files)');

                    if (questionEl) {
                        event.preventDefault();
                        if (!questionEl.hasAttribute('contenteditable')) {
                            questionEl.setAttribute('contenteditable', 'true');
                        }
                        questionEl.focus();

                        // Set cursor to the end
                        const range = document.createRange();
                        range.selectNodeContents(questionEl);
                        range.collapse(false);
                        const sel = (luminaShadowRoot && luminaShadowRoot.getSelection) ? luminaShadowRoot.getSelection() : window.getSelection();
                        sel.removeAllRanges();
                        sel.addRange(range);
                        return;
                    }
                }
            }
        }

        const inputElement = currentPopup.querySelector('.lumina-chat-input');
        if (inputElement) {
            const activeElement = getDeepActiveElement();
            const isEditing = activeElement && (['INPUT', 'TEXTAREA', 'SELECT'].includes(activeElement.tagName) || activeElement.isContentEditable);

            if (isEditing) return;

            const isEditingInPopup = false;

            if (!isEditingInPopup) {
                if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') {
                    inputElement.focus();
                    return;
                }

                if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
                    event.preventDefault();
                    inputElement.focus();
                    inputElement.select();
                    return;
                }

                if (event.ctrlKey || event.metaKey || event.altKey) {
                    return;
                }

                if (event.key.length !== 1) return;

                let hasSelection = false;
                let selectionInPopup = false;

                const windowSelection = window.getSelection();
                const windowSelectionText = windowSelection ? windowSelection.toString().trim() : '';

                if (windowSelection && windowSelectionText.length > 0) {
                    hasSelection = true;
                    const anchorNode = windowSelection.anchorNode;
                    const focusNode = windowSelection.focusNode;

                    const inPopupDOM = (anchorNode && currentPopup.contains(anchorNode)) ||
                        (focusNode && currentPopup.contains(focusNode));
                    const inShadowRoot = luminaShadowRoot && (
                        (anchorNode && luminaShadowRoot.contains(anchorNode)) ||
                        (focusNode && luminaShadowRoot.contains(focusNode))
                    );

                    const anchorRoot = anchorNode?.getRootNode();
                    const focusRoot = focusNode?.getRootNode();
                    const inAnyShadowRoot = (anchorRoot && anchorRoot.nodeType === 11) || // DOCUMENT_FRAGMENT_NODE = shadow root
                        (focusRoot && focusRoot.nodeType === 11);

                    let inShadowRootSelection = false;
                    if (luminaShadowRoot && luminaShadowRoot.getSelection) {
                        const shadowSel = luminaShadowRoot.getSelection();
                        if (shadowSel && shadowSel.toString().trim().length > 0) {
                            inShadowRootSelection = shadowSel.toString().trim() === windowSelectionText;
                        }
                    }

                    selectionInPopup = inPopupDOM || inShadowRoot || inAnyShadowRoot || inShadowRootSelection;
                }

                if (!hasSelection && luminaShadowRoot && luminaShadowRoot.getSelection) {
                    const shadowSelection = luminaShadowRoot.getSelection();
                    const shadowSelectionText = shadowSelection ? shadowSelection.toString().trim() : '';

                    if (shadowSelection && shadowSelectionText.length > 0) {
                        hasSelection = true;
                        selectionInPopup = true;
                    }
                }

                if (!selectionInPopup) {
                    const isSimpleKey = event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;

                    if (isSimpleKey) {
                        event.preventDefault();

                        const inputWrapper = currentPopup.querySelector('.lumina-chat-input-wrapper');
                        if (inputWrapper && inputWrapper.classList.contains('lumina-input-hidden')) {
                            inputWrapper.classList.remove('lumina-input-hidden');
                        }

                        inputElement.focus();

                        if (inputElement.setSelectionRange) {
                            const len = inputElement.value.length;
                            inputElement.setSelectionRange(len, len);
                        }

                        // Manually insert the character since focus() alone drops it
                        const val = inputElement.value;
                        inputElement.value = val + event.key;

                        // Dispatch input event for listeners (auto-resize etc)
                        inputElement.dispatchEvent(new Event('input', { bubbles: true }));

                        return;
                    }

                } else {
                    // Selection exists in popup, skip auto-focus
                }
            }
        }
    }

    // Question Mappings (Text Selection + Key)
    if (questionMappings && questionMappings.length > 0) {
        if (!isSelectionInsideEditable()) {
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
                    const hasVariables = /\$(SelectedText|Sentence|Paragraph|Container)/i.test(mapping.prompt);

                    const isTranslation =
                        promptLower.includes('dịch') ||
                        promptLower.includes('translate') ||
                        promptLower.includes('vietnamese') ||
                        promptLower.includes('tiếng việt') ||
                        promptLower.includes('chuyển ngữ') ||
                        (promptLower.includes('nghĩa') && (promptLower.includes('việt') || promptLower.includes('viet')));

                    if (isTranslation) {
                        // Create popup if needed
                        if (!currentPopup) {
                            showChatPopup(text);
                        }
                        window.getSelection().removeAllRanges();
                        hideAskSelectionPopup();

                        if (isMinimized) {
                            restorePopup(false);
                        }

                        // Use direct translation API
                        let targetLang = 'vi';
                        if (promptLower.includes('english') || promptLower.includes('tiếng anh') || promptLower.includes(' to en')) {
                            targetLang = 'en';
                        }

                        // Show "Translating..." placeholder
                        const loadingId = appendChatLoading();
                        let aborted = false;
                        showStopButton(() => {
                            aborted = true;
                            removeElementById(loadingId);
                            hideStopButton();
                        });

                        // Send to background
                        chrome.runtime.sendMessage({
                            action: 'translate',
                            text: text,
                            targetLang: targetLang
                        }, (response) => {
                            if (aborted) return;
                            removeElementById(loadingId);
                            hideStopButton();

                            if (chrome.runtime.lastError) {
                                console.error('Translation failed:', chrome.runtime.lastError);
                                return;
                            }

                            if (response.error) {
                                console.error('Translation error:', response.error);
                                return;
                            }

                            // Display Result
                            if (response.translation) {
                                const history = currentPopup.querySelector('.lumina-chat-history');
                                if (history) {
                                    // Create Header (Question)
                                    const entryDiv = document.createElement('div');
                                    entryDiv.className = 'lumina-dict-entry';
                                    entryDiv.dataset.entryType = 'translation';

                                    const questionDiv = document.createElement('div');
                                    questionDiv.className = 'lumina-chat-question';
                                    questionDiv.dataset.entryType = 'translation';
                                    // Display version: strip $Container (don't expand it in the bubble)
                                    const displayPrompt = hasVariables ?
                                        mapping.prompt.replace(/\$SelectedText/gi, text.trim())
                                            .replace(/\$Sentence/gi, () => getSentenceContext())
                                            .replace(/\$Paragraph/gi, () => getParagraphContext())
                                            .replace(/[("'\[]*\$Container[)"'\]]*\s*/gi, '')
                                            .trim()
                                        : `${mapping.prompt} "${text.trim()}"`;

                                    const textDiv = document.createElement('div');
                                    textDiv.setAttribute('contenteditable', 'true');
                                    textDiv.textContent = displayPrompt;
                                    questionDiv.appendChild(textDiv);
                                    entryDiv.appendChild(questionDiv);

                                    // Answer
                                    const answerDiv = document.createElement('div');
                                    answerDiv.className = 'lumina-chat-answer lumina-fade-in';
                                    // Add explicit source indicator
                                    answerDiv.innerHTML = `${response.translation} <div style="font-size: 0.8em; color: var(--text-secondary); margin-top: 4px; text-align: right;">(via Google Translate)</div>`;
                                    entryDiv.appendChild(answerDiv);

                                    history.appendChild(entryDiv);

                                    // Set min-height and scroll (Gemini-style)
                                    requestAnimationFrame(() => setInitialEntryHeight(entryDiv));

                                    // Save history
                                    ChatHistoryManager.saveCurrentChat();
                                }
                            }
                        });

                    }

                    // Set global state for positioning
                    currentText = text;

                    // Construct question with variable replacement
                    let fullQuestion = mapping.prompt;
                    let displayQuestion = mapping.prompt;

                    if (hasVariables) {
                        const containerContent = getSmartClimbedContext();
                        fullQuestion = fullQuestion
                            .replace(/\$SelectedText/gi, text.trim())
                            .replace(/\$Sentence/gi, () => getSentenceContext())
                            .replace(/\$Paragraph/gi, () => getParagraphContext())
                            .replace(/\$Container/gi, containerContent);
                        // Display version: omit $Container and surrounding punctuation/spaces
                        displayQuestion = mapping.prompt
                            .replace(/\$SelectedText/gi, text.trim())
                            .replace(/\$Sentence/gi, () => getSentenceContext())
                            .replace(/\$Paragraph/gi, () => getParagraphContext())
                            .replace(/[("'\[]*\$Container[)"'\]]*\s*/gi, '')
                            .trim();
                    } else {
                        // Fallback to old behavior if no variables
                        fullQuestion = `${mapping.prompt} "${text}"`;
                        displayQuestion = fullQuestion;
                    }

                    // Create popup if needed
                    if (!currentPopup) {
                        showChatPopup(text);
                    }
                    window.getSelection().removeAllRanges();
                    hideAskSelectionPopup();

                    if (isMinimized) {
                        restorePopup(false);
                    }

                    // Append entry and auto-send
                    appendQAChatEntry(fullQuestion, displayQuestion);
                    return;
                }
            }
        }
    }

    // Web Source Shortcuts (Trigger iframe with selected text)
    if (customSources && customSources.length > 0) {
        if (!isSelectionInsideEditable()) {
            const selection = window.getSelection();
            const text = selection.toString().trim();

            if (text && text.length > 0) {
                const source = customSources.find(s => {
                    if (!s.shortcut) return false;
                    const config = s.shortcut;

                    if (!!config.ctrlKey !== event.ctrlKey) return false;
                    if (!!config.altKey !== event.altKey) return false;
                    if (!!config.shiftKey !== event.shiftKey) return false;
                    if (!!config.metaKey !== event.metaKey) return false;

                    if (config.key === 'Shift' || config.key === 'Control' || config.key === 'Alt' || config.key === 'Meta') {
                        return event.key === config.key;
                    }

                    return event.key.toLowerCase() === config.key.toLowerCase() || event.code === config.code;
                });

                if (source) {
                    event.preventDefault();
                    event.stopPropagation();
                    event.stopImmediatePropagation();

                    // Create/Show popup
                    if (text && text.length > 0) {
                        const selection = getActiveSelection();
                        if (selection && selection.rangeCount > 0) {
                            currentRange = selection.getRangeAt(0);
                        }
                    }

                    if (!currentPopup) {
                        showChatPopup(text);
                    } else if (isMinimized) {
                        restorePopup(!isPinned);
                    } else {
                        updatePopupPosition();
                    }

                    // Trigger the web source using the chat UI class
                    if (typeof LuminaChatUI !== 'undefined') {
                        const ui = new LuminaChatUI(currentPopup);
                        ui.openWebSource(source, text);
                        window.getSelection().removeAllRanges();
                        hideAskSelectionPopup();
                    }
                    return;
                }
            }
        }
    }

    // If the ask-selection button is visible and a shortcut other than askLumina fires,
    // hide the button so it doesn't overlap the popup that is about to open.
    if (askSelectionPopupBtn && askSelectionPopupBtn.style.display === 'flex') {
        if (['luminaChat', 'audio', 'image', 'translate'].some(action => matchesShortcut(event, action))) {
            hideAskSelectionPopup();
        }
    }

    // Lumina Chat
    if (matchesShortcut(event, 'luminaChat')) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        // If popup is minimized (in restore bar), restore it and focus input
        if (isMinimized) {
            restorePopup(false);
            // Focus input after restore animation
            setTimeout(() => {
                const chatInput = currentPopup?.querySelector('.lumina-chat-input');
                if (chatInput) {
                    chatInput.style.height = '';
                    chatInput.focus();
                }
            }, 100);
            return;
        }

        // If popup is already open (not minimized), minimize it (toggle behavior)
        if (currentPopup && currentPopup.isConnected) {
            minimizePopup();
            return;
        }

        showSpotlight();
        return;
    }


    // Ask Lumina Shortcut
    if (matchesShortcut(event, 'askLumina')) {
        if (isSelectionInsideEditable()) return;
        const selection = window.getSelection();
        const text = selection.toString().trim();

        // Only trigger if text is selected
        if (text.length > 0) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();

            // Save selection for later use
            askSelectionText = text;
            if (selection.rangeCount > 0) {
                currentRange = selection.getRangeAt(0).cloneRange();
            }

            // If button isn't shown yet, show it first then trigger input
            if (!askSelectionPopupBtn || askSelectionPopupBtn.style.display !== 'flex') {
                // Get position from selection
                const range = selection.getRangeAt(0);
                const rect = range.getBoundingClientRect();
                showAskSelectionPopup(rect.left + rect.width / 2, rect.top);
            }

            // Directly show input
            showAskInput();
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

        const activeElement = getDeepActiveElement() || document.activeElement;
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

    // Image Lookup
    if (matchesShortcut(event, 'image')) {
        if (isSelectionInsideEditable()) return;

        const selection = window.getSelection();
        const text = selection.toString().trim();

        if (text.length > 0) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();

            // If popup exists (chat or dict), append to it
            if (currentPopup) {
                // Update range to new selection so popup follows it on scroll
                const selection = getActiveSelection();
                if (selection && selection.rangeCount > 0) {
                    currentRange = selection.getRangeAt(0);
                }

                // If minimized, restore first and wait
                if (isMinimized) {
                    restorePopup(!isPinned);
                    await new Promise(resolve => setTimeout(resolve, 400));
                } else {
                    updatePopupPosition();
                }
                // Determine where to append based on mode
                const loadingId = isChatMode ? appendChatLoading() : appendLoading();

                try {
                    const response = await chrome.runtime.sendMessage({ action: 'smart_image_lookup', text: text });
                    removeElementById(loadingId);
                    if (response && response.error) {
                        if (isChatMode) appendChatEntry('answer', 'Error: ' + response.error);
                        else appendError(response.error);
                    } else if (response && response.results) {
                        appendImageResult(response.results, response.query || text);
                    }
                } catch (err) {
                    removeElementById(loadingId);
                    if (isChatMode) appendChatEntry('answer', 'Error: ' + err.message);
                    else appendError(err.message);
                }
                window.getSelection().removeAllRanges();
                hideAskSelectionPopup();
            } else {
                // No popup, create standard dict popup
                currentText = text;
                currentRange = selection.getRangeAt(0);
                showLoadingPopup();

                try {
                    const response = await chrome.runtime.sendMessage({ action: 'smart_image_lookup', text: text });
                    if (response && response.error) {
                        showError(response.error);
                    } else if (response && response.results) {
                        renderImagePopup(response.results, response.query || text);
                    }
                } catch (err) {
                    showError(err.message);
                }
                window.getSelection().removeAllRanges();
                hideAskSelectionPopup();
            }
            return;
        }
    }



    // Translate - Always performs translation
    if (matchesShortcut(event, 'translate')) {
        if (isSelectionInsideEditable()) return;

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
            hideAskSelectionPopup();

            const handleTranslation = async (partialEntry) => {
                let aborted = false;
                showStopButton(() => {
                    aborted = true;
                    if (partialEntry) partialEntry.remove();
                    hideStopButton();
                });
                try {
                    const response = await chrome.runtime.sendMessage({ action: 'translate', text: text });
                    if (aborted) return;
                    if (response.error) {
                        if (partialEntry) partialEntry.remove();
                        appendError(response.error);
                    } else {
                        updatePartialTranslation(partialEntry, response);
                    }
                } catch (err) {
                    if (aborted) return;
                    if (partialEntry) partialEntry.remove();
                    appendError(err.message);
                } finally {
                    if (!aborted) hideStopButton();
                }
            };

            if (currentPopup) {
                // Restore if minimized
                if (isMinimized) {
                    restorePopup(!isPinned);
                } else {
                    updatePopupPosition();
                }
                const partialEntry = appendPartialTranslation(text);
                handleTranslation(partialEntry);
            } else {
                // Create new popup
                showChatPopup(text);
                const partialEntry = renderPartialTranslationPopup(text);
                handleTranslation(partialEntry);
            }
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
                    const firstSentence = context.indexOf('. ');
                    if (firstSentence > 0) {
                        context = context.substring(firstSentence + 2);
                    }
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

function showContextualChatPopup(contextParagraph, question, isFromSpotlight = false, startRect = null, imageData = null, actionType = 'chat') {
    // Skip initial positioning if we have startRect (will animate from Spotlight position)
    const popup = createPopupElement(!!startRect);
    popup.classList.add('lumina-with-input');

    // Add proofread mode class for follow-up detection
    if (actionType === 'proofread') {
        popup.classList.add('lumina-mode-proofread');
    }

    if (isFromSpotlight) {
        // We handle animation via JS transition below, so no CSS class here

    }

    let imagesHTML = '';
    let questionClass = 'lumina-chat-question lumina-fade-in';
    let questionDataAttr = '';

    if (actionType === 'proofread') {
        questionClass += ' proofread-question';
        questionDataAttr = ' data-type="proofread"';
    }

    let questionTextHTML = ''; // Will be set safely via textContent
    let dataImagesAttr = '';

    if (imageData && (Array.isArray(imageData) ? imageData.length > 0 : true)) {
        const images = Array.isArray(imageData) ? imageData : [imageData];
        dataImagesAttr = ` data-images='${JSON.stringify(images).replace(/'/g, "&apos;")}'`;
        imagesHTML = '<div class="lumina-chat-question-files">';
        images.forEach(item => {
            // Check if item is object (new format) or string (legacy)
            if (typeof item === 'object' && item.mimeType) {
                const isImage = item.mimeType.startsWith('image/');
                const src = item.previewUrl || `data:${item.mimeType};base64,${item.data}`;
                if (isImage) {
                    imagesHTML += `<img src="${src}" alt="${item.name || 'Attached image'}" data-filetype="image">`;
                } else {
                    // Render icon for non-image files
                    let icon = '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>';
                    if (item.mimeType.startsWith('audio/')) icon = '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M12 3v9.28c-.47-.17-.97-.28-1.5-.28C8.01 12 6 14.01 6 16.5S8.01 21 10.5 21c2.31 0 4.2-1.75 4.45-4H15V6h4V3h-7z"/></svg>';
                    if (item.mimeType.startsWith('video/')) icon = '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>';
                    if (item.mimeType === 'application/pdf') icon = '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M20 2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8.5 7.5c0 .83-.67 1.5-1.5 1.5H9v2H7.5V7H10c.83 0 1.5.67 1.5 1.5v1zm5 2c0 .83-.67 1.5-1.5 1.5h-2.5V7H15c.83 0 1.5.67 1.5 1.5v3zm4-3H19v1h1.5V11H19v2h-1.5V7h3v1.5zM9 9.5h1v-1H9v1zM4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm10 5.5h1v-3h-1v3z"/></svg>';
                    const name = item.name || 'File';
                    imagesHTML += `<div class="lumina-file-chip" data-filetype="${item.mimeType}" data-src="${src}" title="${name}">${icon}<span>${name}</span></div>`;
                }
            } else {
                // Legacy: string is a data URL for image
                imagesHTML += `<img src="${item}" alt="Attached image" data-filetype="image">`;
            }
        });
        imagesHTML += '</div>';
    }

    // Determine entry type
    let entryType = 'qa'; // Default to qa
    if (actionType === 'proofread') {
        entryType = 'proofread';
    } else if (imageData && (Array.isArray(imageData) ? imageData.length > 0 : true)) {
        entryType = 'image-chat';
    } else if (contextParagraph && contextParagraph.trim().length > 0) {
        entryType = 'context-chat';
    }

    popup.innerHTML = `
    <div class="lumina-chat-container lumina-fade-in">
      <div class="lumina-chat-scroll-content">
        <div class="lumina-chat-history">
            <div class="lumina-dict-entry" data-entry-type="${entryType}">
                ${imagesHTML}
                <div class="${questionClass}"${dataImagesAttr}${questionDataAttr} data-entry-type="${entryType}">${questionTextHTML}</div>
            </div>
        </div>
      </div>
      ${getChatInputHTML(false)}
    </div>
  `;

    const questionDiv = popup.querySelector('.lumina-chat-question');
    const textDiv = document.createElement('div');
    textDiv.setAttribute('contenteditable', 'true');
    // Strip $Container and other internal variables from display
    const displayText = question.replace(/[("'\[]*\$Container[)"'\]]*\s*/gi, '').trim();
    textDiv.textContent = displayText;
    questionDiv.appendChild(textDiv);

    attachQuestionListeners(questionDiv);
    attachChatInputListeners(popup, ""); // No context passed

    if (startRect) {
        // Smooth Transition from Spotlight
        popup.style.setProperty('transition', 'none', 'important');
        popup.style.setProperty('animation', 'none', 'important');
        popup.style.setProperty('position', 'fixed', 'important');
        popup.style.setProperty('top', `${startRect.top}px`, 'important');
        popup.style.setProperty('left', `${startRect.left}px`, 'important');
        popup.style.setProperty('width', `${startRect.width}px`, 'important');
        popup.style.setProperty('height', `${startRect.height}px`, 'important');
        popup.style.setProperty('min-width', `${startRect.width}px`, 'important');
        popup.style.setProperty('max-width', `${startRect.width}px`, 'important');
        popup.style.setProperty('min-height', `${startRect.height}px`, 'important');
        popup.style.setProperty('max-height', `${startRect.height}px`, 'important');
        popup.style.setProperty('transform', 'none', 'important');
        popup.style.setProperty('opacity', '1', 'important');
        popup.style.setProperty('border-radius', '24px', 'important');

        // Force reflow
        popup.offsetHeight;

        // 2. Animate to Final State - load dimensions from storage
        chrome.storage.local.get(['popupWidth', 'popupHeight'], (items) => {
            const finalWidth = items.popupWidth || 500;
            const finalHeight = items.popupHeight || 360;

            // Calculate center position in px (not %) for smooth animation
            const centerTop = (window.innerHeight - finalHeight) / 2;
            const centerLeft = (window.innerWidth - finalWidth) / 2;

            requestAnimationFrame(() => {
                // Match minimize animation for consistency
                popup.style.transition = 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)';

                // Set final dimensions from storage with !important
                const w = finalWidth + 'px';
                const h = finalHeight + 'px';
                popup.style.setProperty('width', w, 'important');
                popup.style.setProperty('min-width', w, 'important');
                popup.style.setProperty('max-width', w, 'important');
                popup.style.setProperty('height', h, 'important');
                popup.style.setProperty('min-height', h, 'important');
                popup.style.setProperty('max-height', h, 'important');
                popup.style.borderRadius = '';

                // Set Final Position (Center) using px for smooth animation
                popup.style.top = `${centerTop}px`;
                popup.style.left = `${centerLeft}px`;
                popup.style.transform = 'none';
            });

            // After animation ends, reset transition for future interactions
            popup.addEventListener('transitionend', function handler() {
                popup.style.transition = '';
                popup.removeEventListener('transitionend', handler);
            }, { once: true });
        });
    } else {
        updatePopupPosition();
    }

    addWindowControls(popup);

    // Auto-submit (without adding question again)
    setTimeout(async () => {
        lastQuestion = question;
        currentContext = contextParagraph || "";

        const loadingId = appendChatLoading();

        // Build context data for first message
        const contextData = {
            messages: [],
            initialContext: contextParagraph || ""
        };

        if (actionType === 'proofread') {
            await handleProofreadChatAction(question, loadingId);
        } else {
            await streamChatResponse(contextData, question, loadingId, imageData);
        }
    }, 100);
}

// Append only context to existing popup (no auto-question)
function appendContextEntry(contextParagraph) {
    // No-op
}

// Show standardized Chat Popup (renamed/purported from showContextOnlyPopup)


// Standard QA Entry Append (Replaces appendContextualChatEntry)
function appendQAChatEntry(question, displayQuestion) {
    if (!currentPopup) return;

    // Clear dynamic margins from previous entries when starting new Q&A
    clearEntryMargins();

    const history = currentPopup.querySelector('.lumina-chat-history');
    if (!history) return;

    // Build display text: use provided displayQuestion, else strip $Container content from question
    // $Container gets expanded before reaching here, so we strip it via a heuristic:
    // remove anything wrapped in parens/quotes that was substituted from $Container.
    // The cleanest approach is for callers to pass displayQuestion explicitly.
    const uiText = (displayQuestion !== undefined) ? displayQuestion : question;

    // Create entry container
    const entryDiv = document.createElement('div');
    entryDiv.className = 'lumina-dict-entry';
    entryDiv.dataset.entryType = 'qa';
    const questionDiv = document.createElement('div');
    questionDiv.className = 'lumina-chat-question lumina-fade-in';
    const textDiv = document.createElement('div');
    textDiv.setAttribute('contenteditable', 'true');
    // Strip $Container and other internal variables from display
    const cleanedUIText = uiText.replace(/[("'\[]*\$Container[)"'\]]*\s*/gi, '').trim();
    textDiv.textContent = cleanedUIText;
    questionDiv.appendChild(textDiv);
    entryDiv.appendChild(questionDiv);

    // Add separator at the end
    const separator = document.createElement('div');
    separator.className = 'lumina-dict-separator';
    entryDiv.appendChild(separator);

    // Removed contextDiv logic

    history.appendChild(entryDiv);

    attachQuestionListeners(textDiv);
    requestAnimationFrame(() => setInitialEntryHeight(entryDiv));

    // Auto-submit
    setTimeout(async () => {
        lastQuestion = question;
        // Ensure no lingering context
        currentContext = "";

        const loadingId = appendChatLoading();
        // Gather context will return empty or standard memory
        const contextData = gatherFullContext();

        await streamChatResponse(contextData, question, loadingId, null);
    }, 100);
}

let lastPopupState = null;

document.addEventListener('mousedown', (event) => {
    if (isExtensionDisabled) return;

    // If pinned or minimized, do not close on click outside
    if (isPinned || isMinimized) return;

    // Ignore clicks on restore bar (using composedPath for Shadow DOM)
    const path = event.composedPath();
    if (path.some(el => el.classList && el.classList.contains('lumina-restore-bar'))) return;

    // Check if click is inside the popup using composedPath() (handles Shadow DOM)
    const isInsidePopup = path.some(el => el === currentPopup);
    const isInsideHost = path.includes(luminaHost); // Check if click is on the host itself (rare but possible if pointer-events allow)

    // Ignore clicks when history popup is open (it handles its own close logic)
    const historyOverlay = luminaShadowRoot ? luminaShadowRoot.querySelector('.lumina-spotlight-overlay') : null;
    if (historyOverlay) return;

    if (currentPopup && !isInsidePopup) {
        // Also check if we clicked on the selection button
        if (askSelectionPopupBtn && path.includes(askSelectionPopupBtn)) return;
        if (askSelectionInputDiv && path.includes(askSelectionInputDiv)) return;

        // Close popup when clicking outside (chat history replaces minimize feature)
        minimizePopup();
    }
});

let popupDirection = null; // 'above' or 'below'

// Update position on scroll and resize to keep popup next to text
let isTicking = false;

function onScrollOrResize(e) {
    if (isPinned || isMinimized || !currentPopup || currentPopup.style.display === 'none') {
        if (!currentPopup) stopPopupTracking();
        return;
    }

    // For scroll events, check if it originated inside the popup itself
    if (e && e.type === 'scroll' && e.target && (currentPopup.contains(e.target) || (e.target.classList && e.target.classList.contains('lumina-dict-popup')))) {
        return;
    }

    if (!isTicking) {
        window.requestAnimationFrame(() => {
            // Re-check visibility inside the frame to avoid redundant position calculations
            if (currentPopup && !isMinimized && !isPinned && currentPopup.style.display !== 'none') {
                updatePopupPosition();
            }
            isTicking = false;
        });
        isTicking = true;
    }
}

let lastViewportWidth = 0;
let lastViewportHeight = 0;
let isTrackingPopup = false;
function startPopupTracking() {
    if (isTrackingPopup) return;
    isTrackingPopup = true;
    window.addEventListener('scroll', onScrollOrResize, { passive: true, capture: true });
    window.addEventListener('resize', onScrollOrResize, { passive: true });
}

function stopPopupTracking() {
    if (!isTrackingPopup) return;
    isTrackingPopup = false;
    window.removeEventListener('scroll', onScrollOrResize, { capture: true });
    window.removeEventListener('resize', onScrollOrResize);
}

// Global listeners removed - now managed via startPopupTracking / stopPopupTracking

function removePopup(showLauncher = true) {
    // Cleanup restore bar if exists
    if (restoreBar) {
        restoreBar.remove();
        restoreBar = null;
    }

    // Save session before removing
    if (typeof ChatHistoryManager !== 'undefined') ChatHistoryManager.saveCurrentChat();

    if (currentPopup) {
        // Save state before removing
        lastPopupState = {
            // Memory optimization: Don't save giant HTML string to RAM if avoidable
            // html: currentPopup.innerHTML, 
            classList: [...currentPopup.classList],
            range: currentRange,
            text: currentText,
            isChatMode: isChatMode,
            direction: popupDirection
        };

        // CRITICAL: Cleanup all event listeners to prevent memory leaks
        eventCleanup.cleanupTree(currentPopup);

        currentPopup.remove();
        currentPopup = null;
        currentRange = null;
        currentText = "";
        isChatMode = false;
        popupDirection = null; // Reset direction
        isPinned = false;
        isMinimized = false;
        minimizedPosition = null;
    }

    if (showLauncher !== false && !document.getElementById('popup-sidebar')) {
        chrome.storage.local.get(['disableExtension'], (result) => {
            if (!result.disableExtension && !isExtensionDisabled) {
                // Ensure the restore bar appears if the popup was removed
                isMinimized = true;
                stopPopupTracking(); // Stop scroll tracking when entering restore bar mode
                createRestoreBar();
            }
        });
    }
}

let isMouseOverPopup = false;

function createPopupElement(skipInitialPosition = false) {
    // Ensure existing popup is removed before creating a new one
    if (currentPopup) {
        removePopup(false);
    }
    if (restoreBar) {
        restoreBar.remove();
        restoreBar = null;
    }
    isMinimized = false;
    // Always use the standard popup class
    const popup = document.createElement('div');
    popup.className = 'lumina-dict-popup';
    // Static styles (transition, opacity, zoom) are defined in CSS

    // Track mouse over state for auto-focus
    popup.addEventListener('mouseenter', () => {
        // console.log('MouseEnter Popup'); 
        isMouseOverPopup = true;
    });
    popup.addEventListener('mouseleave', () => {
        // console.log('MouseLeave Popup'); 
        isMouseOverPopup = false;
    });

    // Note: Scroll isolation is handled by CSS overscroll-behavior: none

    initShadowDOM();
    luminaShadowRoot.appendChild(popup);

    // Create a dedicated drag handle at the very top (30px height)
    if (!popup.querySelector('.lumina-drag-handle')) {
        const dragHandle = document.createElement('div');
        dragHandle.className = 'lumina-drag-handle';
        popup.appendChild(dragHandle); // Put it at the front (high z-index)
    }

    currentPopup = popup;

    // --- Dynamic Positioning: stay on screen as content grows ---
    const resizeObserver = new ResizeObserver(() => {
        // Only re-position if we're not dragging and not pinned
        if (!isDragging && !isPinned && currentPopup) {
            updatePopupPosition();
        }
    });
    resizeObserver.observe(popup);

    // ── Ask Lumina button: hide stale button when starting a new drag-selection ──
    popup.addEventListener('mousedown', () => {
        // Hide any visible ask button when user starts a new selection drag
        // (but not if the input is open — that would lose the in-progress query)
        if (!askSelectionInputDiv || askSelectionInputDiv.style.display !== 'flex') {
            hideAskSelectionPopup();
        }
    });

    // ── Ask Lumina button: show on text selection inside popup ──
    popup.addEventListener('mouseup', (e) => {
        const upX = e.clientX;
        const upY = e.clientY;
        // Small delay to let the browser finalise the selection
        setTimeout(() => {
            if (!askSelectionPopupEnabled || !askSelectionPopupBtn) return;

            // Use shadowRoot.getSelection() for correct text inside shadow DOM
            const shadowRoot = popup.getRootNode();
            const selection = (shadowRoot && typeof shadowRoot.getSelection === 'function')
                ? shadowRoot.getSelection()
                : window.getSelection();

            const selectedText = selection ? selection.toString().trim() : '';
            if (!selectedText || isSelectionInsideEditable()) {
                if (!askSelectionInputDiv || askSelectionInputDiv.style.display !== 'flex') {
                    hideAskSelectionPopup();
                }
                return;
            }

            askSelectionText = selectedText;
            askSelectionContext = '';

            // Position button above the START of the selected text (not the mouse release point)
            askSelectionPopupBtn.style.display = 'flex';
            askSelectionPopupBtn.style.visibility = 'hidden';
            const btnW = askSelectionPopupBtn.offsetWidth;
            const btnH = askSelectionPopupBtn.offsetHeight || 36;
            askSelectionPopupBtn.style.visibility = 'visible';

            const margin = 6;
            let finalTop, finalLeft;

            // Try to get the selection range rects for accurate above-text positioning
            const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
            const rects = range ? range.getClientRects() : null;
            if (rects && rects.length > 0) {
                // Find the topmost line of the selection
                let topY = rects[0].top;
                let leftX = rects[0].left;
                for (let i = 1; i < rects.length; i++) {
                    if (rects[i].top < topY) {
                        topY = rects[i].top;
                        leftX = rects[i].left;
                    }
                }
                finalTop = topY - btnH - margin;
                finalLeft = leftX;
                if (finalTop < 10) finalTop = topY + (rects[0].height || 20) + margin;
            } else {
                // Fallback to mouse release position
                finalTop = upY - btnH - margin;
                finalLeft = upX - Math.round(btnW / 2);
                if (finalTop < 10) finalTop = upY + margin;
            }

            const vw = window.innerWidth;
            if (finalLeft + btnW > vw - 10) finalLeft = Math.max(10, vw - btnW - 10);
            if (finalLeft < 10) finalLeft = 10;
            // Move to end of shadow root so it renders above all siblings
            if (luminaShadowRoot) luminaShadowRoot.appendChild(askSelectionPopupBtn);
            askSelectionPopupBtn.style.left = finalLeft + 'px';
            askSelectionPopupBtn.style.top = finalTop + 'px';

            // One-shot listener: hide button when user clicks anywhere outside it
            const onOutsideClick = (ev) => {
                if (askSelectionPopupBtn && askSelectionPopupBtn.contains(ev.target)) return;
                if (askSelectionInputDiv && askSelectionInputDiv.contains(ev.target)) return;
                // Check composed path for shadow DOM elements
                const evPath = ev.composedPath ? ev.composedPath() : [];
                if (evPath.includes(askSelectionPopupBtn) || evPath.includes(askSelectionInputDiv)) return;
                hideAskSelectionPopup();
                document.removeEventListener('mousedown', onOutsideClick, true);
            };
            document.addEventListener('mousedown', onOutsideClick, true);
        }, 10);
    });

    // Ensure interactions work inside shadow host
    popup.style.pointerEvents = 'auto';

    // Apply font size and dimensions setting
    applyPopupStyles(popup, skipInitialPosition);

    // Set position immediately upon creation (will be refined after storage load)
    if (!skipInitialPosition) {
        // Start scroll tracking for new popup
        startPopupTracking();
        updatePopupPosition();
        // Show popup
        popup.style.opacity = '1';
        // Final clamp: use real rendered bounds after the popup is visible
        requestAnimationFrame(() => clampPopupToViewport(popup));
    }

    makeDraggable(popup);

    return popup;
}

function applyPopupStyles(popup, skipInitialPosition = false) {
    if (!popup) return;
    chrome.storage.local.get(['fontSize', 'fontSizeByDomain', 'popupWidth', 'popupHeight', 'popupDimensionsByDomain', 'globalDefaults'], (items) => {
        const currentDomain = window.location.hostname;
        const zoom = getPageZoom();
        let baseFontSize = 13; // Default base

        // Check domain-specific font size first, then global defaults
        if (items.fontSizeByDomain && items.fontSizeByDomain[currentDomain]) {
            baseFontSize = items.fontSizeByDomain[currentDomain];
        } else if (items.globalDefaults && items.globalDefaults.fontSize) {
            baseFontSize = items.globalDefaults.fontSize;
        }

        // Always divide by zoom to maintain physical size
        const fontSize = baseFontSize / zoom;
        popup.style.setProperty('font-size', fontSize + 'px', 'important');

        // Only set dimensions if not skipping (Spotlight animation manages its own dimensions)
        if (!skipInitialPosition) {
            let width = 500; // Default
            let height = 500; // Default

            // Base width from global defaults
            if (items.globalDefaults) {
                if (items.globalDefaults.width) width = items.globalDefaults.width;
                if (items.globalDefaults.height) height = items.globalDefaults.height;
            }

            // Domain-specific overrides (also in "Physical at 100% zoom" units)
            if (items.popupDimensionsByDomain && items.popupDimensionsByDomain[currentDomain]) {
                const domainDims = items.popupDimensionsByDomain[currentDomain];
                width = domainDims.width || width;
                height = domainDims.height || height;
            }

            // De-normalize to current zoom: PhysicalPixels / Zoom = CSSPixels
            const finalWidth = Math.round(width / zoom);
            const finalHeight = Math.round(height / zoom);

            const w = finalWidth + 'px';
            popup.style.setProperty('width', w, 'important');
            popup.style.setProperty('min-width', w, 'important');
            popup.style.setProperty('max-width', w, 'important');

            const h = finalHeight + 'px';
            popup.style.setProperty('height', h, 'important');
            popup.style.setProperty('min-height', '200px', 'important');
            popup.style.setProperty('max-height', h, 'important');

            // Re-update position to account for size change
            updatePopupPosition();
        }
    });
}

function applyAskSelectionStyles() {
    if (!askSelectionPopupBtn && !askSelectionInputDiv) return;
    chrome.storage.local.get(['fontSize', 'fontSizeByDomain', 'globalDefaults'], (items) => {
        const currentDomain = window.location.hostname;
        const zoom = getPageZoom();
        let baseFontSize = 13; // Default

        if (items.fontSizeByDomain && items.fontSizeByDomain[currentDomain]) {
            baseFontSize = items.fontSizeByDomain[currentDomain];
        } else if (items.globalDefaults && items.globalDefaults.fontSize) {
            baseFontSize = items.globalDefaults.fontSize;
        } else if (items.fontSize) {
            baseFontSize = items.fontSize;
        }

        const fontSize = baseFontSize / zoom;
        if (askSelectionPopupBtn) {
            askSelectionPopupBtn.style.setProperty('font-size', fontSize + 'px', 'important');
        }
        if (askSelectionInputDiv) {
            askSelectionInputDiv.style.setProperty('font-size', fontSize + 'px', 'important');
        }
    });
}


// Clamp popup so it stays fully within the viewport.
// Uses getBoundingClientRect() so it works correctly even when the page
// applies CSS zoom or transform to body/html (which skew offsetWidth values).
function clampPopupToViewport(popup) {
    if (!popup || !popup.isConnected) return;
    if (isPinned) return;

    const margin = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const r = popup.getBoundingClientRect();

    // Current top/left from inline style (what we set in updatePopupPosition)
    let top = parseFloat(popup.style.top) || 0;
    let left = parseFloat(popup.style.left) || 0;

    // Calculate overflow and shift
    const overflowRight = r.right - (vw - margin);
    const overflowBottom = r.bottom - (vh - margin);
    const overflowLeft = margin - r.left;
    const overflowTop = margin - r.top;

    if (overflowRight > 0) left -= overflowRight;
    if (overflowBottom > 0) top -= overflowBottom;
    if (overflowLeft > 0) left += overflowLeft;
    if (overflowTop > 0) top += overflowTop;

    popup.style.setProperty('left', left + 'px', 'important');
    popup.style.setProperty('top', top + 'px', 'important');
}

function updatePopupPosition() {
    if (!currentPopup || isPinned) return;

    // Use current scroll container/viewport stats
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const margin = 12;

    // 1. READ phase (Group all layout-triggering reads here)
    let popupWidth = currentPopup.offsetWidth;
    let popupHeight = currentPopup.offsetHeight;

    // Fallback if hidden or newly created
    if (!popupWidth) {
        popupWidth = parseInt(localStorage.getItem('lumina_popupWidth'), 10) || 380;
    }
    if (!popupHeight) {
        popupHeight = 400;
    }

    let rect = null;
    if (currentRange) {
        try {
            rect = currentRange.getBoundingClientRect();
        } catch (e) {
            rect = null;
        }
    }

    // 2. CALCULATION phase (Logic only, no DOM updates)
    let targetTop, targetLeft;

    if (rect) {
        const gap = 10;

        // Vertical Logic: Decide 'above' or 'below'
        if (!popupDirection) {
            const spaceAbove = rect.top;
            const spaceBelow = viewportHeight - rect.bottom;
            const requiredSpace = popupHeight + gap + margin;

            if (spaceBelow >= requiredSpace) {
                popupDirection = 'below';
            } else if (spaceAbove >= requiredSpace) {
                popupDirection = 'above';
            } else {
                popupDirection = spaceBelow >= spaceAbove ? 'below' : 'above';
            }
        }

        // Horizontal Logic: Try to align with the left of the selection
        targetLeft = rect.left;

        if (popupDirection === 'below') {
            targetTop = rect.bottom + gap;
        } else {
            targetTop = rect.top - popupHeight - gap;
        }
    }
    else {
        if (savedSpotlightPos) {
            targetTop = savedSpotlightPos.top;
            targetLeft = savedSpotlightPos.left;
        } else {
            targetTop = (viewportHeight - popupHeight) / 2;
            targetLeft = (viewportWidth - popupWidth) / 2;
        }
    }

    // Horizontal Clamping (Left/Right)
    if (targetLeft + popupWidth > viewportWidth - margin) {
        targetLeft = viewportWidth - popupWidth - margin;
    }
    if (targetLeft < margin) targetLeft = margin;

    // Vertical Clamping (Top/Bottom)
    if (targetTop + popupHeight > viewportHeight - margin) {
        targetTop = viewportHeight - popupHeight - margin;
    }
    if (targetTop < margin) targetTop = margin;

    // 3. WRITE phase (Group all DOM updates here)
    if (lastViewportWidth !== viewportWidth || lastViewportHeight !== viewportHeight) {
        currentPopup.style.maxWidth = `${viewportWidth - margin * 2}px`;
        currentPopup.style.maxHeight = `${viewportHeight - margin * 2}px`;
        lastViewportWidth = viewportWidth;
        lastViewportHeight = viewportHeight;
    }

    currentPopup.style.setProperty('top', `${targetTop}px`, 'important');
    currentPopup.style.setProperty('left', `${targetLeft}px`, 'important');
    currentPopup.style.setProperty('bottom', 'auto', 'important');
    currentPopup.style.setProperty('right', 'auto', 'important');
    currentPopup.style.setProperty('transform', 'none', 'important');
}

function getLoadingHTML() {
    return `<div class="lumina-thinking-shimmer">Thinking</div>`;
}

function showLoadingPopup() {
    const popup = createPopupElement();
    popup.innerHTML = getPopupShellHTML(getLoadingHTML(), false);

    // Override default pop-in animation with simple fade
    overridePopupAnimation(popup);

    // Attach standard UI listeners
    attachPopupSidebarListeners(popup);
    addWindowControls(popup);
}

// Helper function to override popup animation with fade
function overridePopupAnimation(popup) {
    if (!popup) return;

    popup.style.animation = 'none';
    popup.style.opacity = '0';
    popup.style.transform = 'none';

    setTimeout(() => {
        popup.style.transition = 'opacity 0.2s ease';
        popup.style.opacity = '1';
    }, 10);
}

/**
 * Adjusts the margin-bottom of the given entry so that its separator 
 * aligns with the top of the scroll container, hiding previous entries.
 * Call this when an entry is complete (has separator).
 * Note: clearEntryMargins() should be called when a new entry STARTS.
 */

// Helper function for smooth animated scroll
function smoothScrollTo(container, targetScrollTop, _unusedDuration = 1250) {
    if (container._scrollAnimationId) {
        cancelAnimationFrame(container._scrollAnimationId);
        container._scrollAnimationId = null;
    }

    container.scrollTop = targetScrollTop;

    // Execute any deferred margin adjustments immediately
    if (container._pendingMarginEntry) {
        adjustEntryMargin(container._pendingMarginEntry, 'none');
        container._pendingMarginEntry = null;
    }
}

/**
 * No-op: layout is now handled by min-height on the active entry (Gemini-style).
 * min-height is cleared from old entries when a new entry starts via clearEntryMargins().
 */
function adjustEntryMargin(entry, behavior = 'none') {
    // intentionally empty
}

/**
 * Set min-height on the new entry so it fills the viewport (Gemini-style).
 * Clears min-height from all previous entries so they collapse to natural height.
 * Scrolls to align the previous entry's separator at the top of the viewport.
 *
 * @param {HTMLElement} entry - The new entry element
 * @param {boolean} smooth - Unused (kept for call-site compatibility)
 */
function setInitialEntryHeight(entry, smooth = false) {
    if (!currentPopup || !entry) return;

    const scrollContainer = currentPopup.querySelector('.lumina-chat-scroll-content') || currentPopup;
    if (!scrollContainer) return;

    // Calculate scroll target BEFORE any DOM changes so rects are still accurate
    let targetScrollTop = null;
    const allEntries = scrollContainer.querySelectorAll('.lumina-dict-entry');
    const currentIndex = Array.from(allEntries).indexOf(entry);

    if (currentIndex > 0) {
        const previousEntry = allEntries[currentIndex - 1];
        const containerRect = scrollContainer.getBoundingClientRect();
        const prevRect = previousEntry.getBoundingClientRect();
        targetScrollTop = (prevRect.bottom - containerRect.top) + scrollContainer.scrollTop;
    }

    // Set min-height so the entry fills the viewport; clear it from all others.
    // Subtract separator's margin-bottom so it doesn't extend beyond the viewport.
    // The first entry gets an extra 10px to feel less cramped on initial open.
    const viewportHeight = scrollContainer.clientHeight || scrollContainer.offsetHeight;
    if (viewportHeight > 0) {
        // Fixed 10px buffer instead of reading separator margins
        entry.style.setProperty('min-height', (viewportHeight - 10) + 'px', 'important');
        clearEntryMargins(entry);

        // Scroll synchronously — no setTimeout, everything in one paint frame
        if (targetScrollTop !== null) {
            const maxScroll = scrollContainer.scrollHeight - viewportHeight;
            scrollContainer.scrollTop = Math.min(targetScrollTop, maxScroll);
        } else {
            scrollContainer.scrollTop = 0;
        }
    } else {
        // Popup dimensions not yet applied (async storage callback) — retry after layout settles
        setTimeout(() => setInitialEntryHeight(entry, smooth), 80);
    }
}

/**
 * Remove min-height from all entries except the current one.
 * Called when a new entry starts so older entries collapse to their natural height.
 * @param {HTMLElement} excludeEntry - The new/current entry to keep
 */
function clearEntryMargins(excludeEntry = null) {
    if (!currentPopup) return;
    const scrollContainer = currentPopup.querySelector('.lumina-chat-scroll-content') || currentPopup;
    if (!scrollContainer) return;

    const allEntries = scrollContainer.querySelectorAll('.lumina-dict-entry');
    allEntries.forEach(e => {
        if (e !== excludeEntry) {
            e.style.removeProperty('min-height');
        }
    });
}

function alignEntryToPreviousSeparatorTop(popup, entry) {
    if (!popup || !entry) return;

    const scrollContainer = popup.querySelector('.lumina-chat-scroll-content') ||
        popup.querySelector('.lumina-chat-history') ||
        popup;
    if (!scrollContainer) return;

    let previousEntry = entry.previousElementSibling;
    while (previousEntry && !previousEntry.classList.contains('lumina-dict-entry')) {
        previousEntry = previousEntry.previousElementSibling;
    }

    if (!previousEntry) {
        scrollContainer.scrollTop = 0;
        return;
    }

    const separator = previousEntry.querySelector('.lumina-dict-separator');
    if (!separator) {
        scrollContainer.scrollTop = 0;
        return;
    }

    const containerRect = scrollContainer.getBoundingClientRect();
    const separatorRect = separator.getBoundingClientRect();
    const rawTarget = separatorRect.top - containerRect.top + scrollContainer.scrollTop;
    const maxScroll = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);

    scrollContainer.scrollTop = Math.min(Math.max(0, rawTarget), maxScroll);
}

function scrollToElement(targetElement) {
    if (!currentPopup) return;



    const scrollContainer = currentPopup.querySelector('.lumina-chat-scroll-content') || currentPopup;
    if (!scrollContainer) return;

    const historyEl = scrollContainer.querySelector('.lumina-chat-history') || scrollContainer;
    const entries = historyEl.querySelectorAll('.lumina-dict-entry');

    // Skip scroll for first entry
    if (entries.length <= 1) return;

    if (!targetElement) {
        // No target - find the last entry
        if (entries.length > 0) {
            targetElement = entries[entries.length - 1];
        } else {
            return;
        }
    }

    // Find the current entry this target belongs to
    const currentEntry = targetElement.closest('.lumina-dict-entry') || targetElement;

    // Find the PREVIOUS entry's separator (our target position)
    let previousEntry = currentEntry.previousElementSibling;

    // Skip non-entry elements (like standalone loading divs)
    while (previousEntry && !previousEntry.classList.contains('lumina-dict-entry')) {
        previousEntry = previousEntry.previousElementSibling;
    }

    // Get the separator of the previous entry
    let previousSeparator = null;
    if (previousEntry) {
        previousSeparator = previousEntry.querySelector('.lumina-dict-separator');
    }

    const containerHeight = scrollContainer.clientHeight;
    const maxScroll = scrollContainer.scrollHeight - containerHeight;

    // Track ongoing animation to prevent conflicts (store on scrollContainer)
    if (scrollContainer._scrollAnimationId) {
        cancelAnimationFrame(scrollContainer._scrollAnimationId);
        scrollContainer._scrollAnimationId = null;
    }

    if (previousSeparator) {
        // Use getBoundingClientRect for shadow DOM compatibility
        const containerRect = scrollContainer.getBoundingClientRect();
        const separatorRect = previousSeparator.getBoundingClientRect();

        // Calculate relative position: separator top - container top + current scroll
        const separatorOffset = separatorRect.top - containerRect.top + scrollContainer.scrollTop;
        const targetScrollTop = Math.min(separatorOffset, maxScroll);



        // Only scroll down, never up
        if (targetScrollTop > scrollContainer.scrollTop) {
            smoothScrollTo(scrollContainer, targetScrollTop);
        } else {

        }
    } else {
        // No previous entry - scroll to show the target at bottom
        const containerRect = scrollContainer.getBoundingClientRect();
        const targetRect = targetElement.getBoundingClientRect();

        // Calculate relative position
        const targetOffset = targetRect.top - containerRect.top + scrollContainer.scrollTop;
        const targetHeight = targetElement.offsetHeight;
        const idealScrollTop = targetOffset + targetHeight - containerHeight;



        if (idealScrollTop > scrollContainer.scrollTop) {
            smoothScrollTo(scrollContainer, Math.min(Math.max(0, idealScrollTop), maxScroll));
        } else {

        }
    }
}

/**
 * Performant scroll to bottom for the chat container.
 * Uses requestAnimationFrame to prevent layout thrashing and ensures 
 * updates are synced with the browser's refresh rate.
 */
function scrollToBottom() {
    if (!currentPopup) return;
    const scrollContainer = currentPopup.querySelector('.lumina-chat-scroll-content') || currentPopup;
    if (!scrollContainer) return;

    // Use requestAnimationFrame to avoid "khựng" (jank)
    requestAnimationFrame(() => {
        const targetScroll = scrollContainer.scrollHeight - scrollContainer.clientHeight;
        if (targetScroll > scrollContainer.scrollTop) {
            scrollContainer.scrollTop = targetScroll;
        }
    });
}


function appendLoading() {
    if (!currentPopup) {
        console.error('[Lumina Debug] currentPopup is null, cannot append loading');
        return null;
    }

    // Clear dynamic margins from previous entries when loading starts
    clearEntryMargins();

    const id = 'lumina-loading-' + Date.now();
    const div = document.createElement('div');
    div.id = id;
    div.className = 'lumina-dict-entry lumina-loading-wrapper';

    const container = currentPopup.querySelector('.lumina-chat-history') || currentPopup;

    div.innerHTML = getLoadingHTML();
    container.appendChild(div);
    scrollToElement(div);
    return id;
}

function removeElementById(id) {
    // Try shadow root first (for elements like loading indicators in chat)
    let el = luminaShadowRoot ? luminaShadowRoot.getElementById(id) : null;

    // Fallback to document if not found in shadow root
    if (!el) {
        el = document.getElementById(id);
    }

    if (el) {
        // Check if this is a loading/thinking element
        if (id && id.includes('lumina-chat-loading')) {
        }
        el.remove();
    }
}

function showError(message) {
    if (currentPopup) {
        currentPopup.innerHTML = getPopupShellHTML(`<div class="lumina-dict-error lumina-fade-in">Error: ${message}</div>`, false);
        attachPopupSidebarListeners(currentPopup);
        updatePopupPosition();
        addWindowControls(currentPopup);
    }
}


function appendError(message) {
    if (!currentPopup) return;
    const div = document.createElement('div');
    div.className = 'lumina-dict-entry lumina-fade-in';

    const container = currentPopup.querySelector('.lumina-chat-history') || currentPopup;

    div.innerHTML = `<div class="lumina-dict-error">Error: ${message}</div><div class="lumina-dict-separator"></div>`;
    container.appendChild(div);
    scrollToElement(div);
}

function generateEntryHTML(data) {
    let html = '';

    // Clean original text if present (remove "1.", "a.", etc. and surrounding quotes)
    let cleanedOriginal = "";
    if (data.original) {
        cleanedOriginal = data.original.trim().replace(/^(\d+|[a-zA-Z])[\.\)]\s*/, '').replace(/^["']|["']$/g, '');
    }

    const textToPlay = data.word || cleanedOriginal || "";
    const safeText = textToPlay.replace(/"/g, '&quot;');

    if (data.type === 'word') {
        html += `
      <div class="lumina-dict-header">
        <div style="display: flex;">
            <div style="display: flex; flex-direction: column;">
                <span class="lumina-dict-word">${data.word}</span>
                <span class="lumina-dict-ipa">${data.ipa || ''}</span>
            </div>
            <div class="lumina-audio-btn-container">
                <button class="lumina-audio-btn" data-play-text="${safeText}">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
                </button>
            </div>
        </div>
      </div>
      <div class="lumina-dict-meanings">
    `;

        if (data.meanings && Array.isArray(data.meanings)) {
            data.meanings.forEach(m => {
                html += `
          <div class="lumina-dict-meaning-item">
            <span class="lumina-dict-pos">${m.partOfSpeech || ''}</span>
            <span class="lumina-dict-meaning-text">${m.meaning.charAt(0).toUpperCase() + m.meaning.slice(1)}</span>
            ${m.example ? `<div class="lumina-dict-example">${m.example}</div>` : ''}
          </div>
        `;
            });
        }

        // Section for Related Words (Synonyms & Antonyms)
        html += '<div class="lumina-dict-related-section">';

        if (data.synonyms && data.synonyms.length > 0) {
            const chips = data.synonyms.map(s => `<span class="lumina-dict-synonym-item">${s}</span>`).join('');
            html += `
                    <div class="lumina-dict-related-row">
                        <div class="lumina-dict-related-label">
                            <span class="lumina-dict-related-icon">≈</span> Synonyms
                        </div>
                        <div class="lumina-dict-related-list">${chips}</div>
                    </div>
                `;
        }

        if (data.antonyms && data.antonyms.length > 0) {
            const chips = data.antonyms.map(a => `<span class="lumina-dict-antonym-item">${a}</span>`).join('');
            html += `
                    <div class="lumina-dict-related-row">
                        <div class="lumina-dict-related-label">
                            <span class="lumina-dict-related-icon">≠</span> Antonyms
                        </div>
                        <div class="lumina-dict-related-list">${chips}</div>
                    </div>
                `;
        }

        if (data.collocations && data.collocations.length > 0) {
            const chips = data.collocations.map(c => `<span class="lumina-dict-collocation-item">${c}</span>`).join('');
            html += `
                    <div class="lumina-dict-related-row">
                        <div class="lumina-dict-related-label">
                            <span class="lumina-dict-related-icon">🔗</span> Collocations
                        </div>
                        <div class="lumina-dict-related-list">${chips}</div>
                    </div>
                `;
        }

        html += `</div>`;

        html += `</div>`;
    } else if (data.type === 'sentence') {
        const safeOriginal = data.original ? data.original.replace(/"/g, '&quot;') : '';
        const safeTranslation = data.translation ? data.translation.replace(/"/g, '&quot;') : '';

        // Generate Insights HTML if available
        let insightsHTML = '';
        if (data.insights) {
            insightsHTML += '<div class="lumina-translation-insights">';
            if (data.insights.nuance) {
                insightsHTML += `
                    <div class="lumina-insight-row">
                        <span class="lumina-insight-label">Nuance:</span>
                        <div class="lumina-insight-content">${data.insights.nuance}</div>
                    </div>
                `;
            }
            if (data.insights.keyTerms && data.insights.keyTerms.length > 0) {
                const termsHTML = data.insights.keyTerms.map(t =>
                    `<div style="margin-top:4px;"><strong>${t.term}</strong>: ${t.meaning}</div>`
                ).join('');

                insightsHTML += `
                     <div class="lumina-insight-row">
                        <span class="lumina-insight-label">Key Terms:</span>
                        <div class="lumina-insight-content" style="flex-direction:column; align-items:flex-start;">
                            ${termsHTML}
                        </div>
                    </div>
                `;
            }
            insightsHTML += '</div>';
        }

        html += `
         <div class="lumina-chat-question translation-question">Translate</div>
         <div class="lumina-translation-container">
          <div class="lumina-translation-card">
            <!-- Source Block -->
            <div class="lumina-translation-block">
              <div class="lumina-translation-source" data-copy-text="${safeOriginal}">
                  <div class="lumina-translation-text">${data.original}</div>
              </div>
            </div>
          
            <!-- Divider -->
            <div class="lumina-translation-divider"></div>
          
            <!-- Target Block -->
            <div class="lumina-translation-block">
              <div class="lumina-translation-target" data-copy-text="${safeTranslation}">
                  <div class="lumina-translation-text">${data.translation}</div>
              </div>
            </div>
          </div>
          <!-- Insights -->
          ${insightsHTML}
         </div>
        `;
    } else {
        html += `<div class="lumina-dict-error">Unknown response format</div>`;
    }
    return html;
}

function attachPlayButtonListeners(containerElement) {
    // Play buttons
    const playBtns = containerElement.querySelectorAll('.lumina-dict-play-btn, .lumina-audio-btn, .lumina-trans-btn[data-play-text]');
    playBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const playText = btn.getAttribute('data-play-text');
            if (!playText) return;

            // If same text is playing, toggle pause/resume
            // This logic is now handled by stopAudio() and playCombinedAudio()
            // which will stop previous audio before playing new.
            // For simple play/stop, we just call playCombinedAudio.
            playCombinedAudio(playText);
        });
    });

    // Copy buttons
    const copyBtns = containerElement.querySelectorAll('.lumina-trans-btn[data-copy-text]');
    copyBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const textToCopy = btn.getAttribute('data-copy-text');
            if (textToCopy) {
                navigator.clipboard.writeText(textToCopy).then(() => {
                    const originalText = btn.innerHTML;
                    btn.innerHTML = '✓';
                    setTimeout(() => btn.innerHTML = originalText, 1000);
                });
            }
        });
    });
}

/**
 * Helper to generate the standard structural HTML for popups
 * including the history sidebar and menu buttons.
 */
function getPopupShellHTML(historyContent = '', autofocusInput = false) {
    return `
    <div class="lumina-popup-sidebar" id="popup-sidebar">
        <div class="lumina-popup-sidebar-header">
            <span>Chat History</span>
            <button class="lumina-popup-sidebar-close" id="popup-sidebar-close">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                </svg>
            </button>
        </div>
        <div class="lumina-popup-sidebar-search">
            <svg class="lumina-popup-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
            </svg>
            <input type="text" id="popup-sidebar-search" placeholder="Search questions..." />
            <button class="lumina-popup-search-clear" id="popup-sidebar-search-clear" style="display: none;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
            </button>
        </div>
        <div class="lumina-popup-sidebar-content" id="popup-history-list">
        </div>
        <div class="lumina-popup-sidebar-footer">
            <button class="lumina-popup-new-chat-btn" id="popup-new-chat-btn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 5v14M5 12h14" />
                </svg>
                New Chat
            </button>
        </div>
    </div>

    <div class="lumina-popup-sidebar-overlay" id="popup-sidebar-overlay"></div>

    <div class="lumina-chat-container lumina-fade-in">
      <!-- Sidebar Toggle Handle -->
      <button class="lumina-popup-menu-btn" id="popup-menu-btn"></button>

      <div class="lumina-chat-scroll-content">
        <div class="lumina-chat-history">${historyContent}</div>
      </div>
      ${getChatInputHTML(autofocusInput)}
    </div>
    `;
}

function renderPopup(data) {
    if (!currentPopup) return;

    currentPopup.classList.add('lumina-with-input');
    const contextText = data.word || data.original || "";
    const entryType = data.type === 'word' ? 'lookup' : 'translation';

    currentPopup.innerHTML = getPopupShellHTML(`
        <div class="lumina-dict-entry" data-entry-type="${entryType}">
            ${generateEntryHTML(data)}
            <div class="lumina-dict-separator"></div>
        </div>
    `, false);

    const dictEntry = currentPopup.querySelector('.lumina-dict-entry');
    attachPlayButtonListeners(dictEntry);
    attachSynonymListeners(dictEntry);
    attachOriginalTextListeners(dictEntry);

    // Attach listener for translation question
    const transQuestion = dictEntry.querySelector('.translation-question div[contenteditable]');
    if (transQuestion) attachQuestionListeners(transQuestion);

    attachChatInputListeners(currentPopup, contextText);
    attachPopupSidebarListeners(currentPopup);
    updatePopupPosition();
    addWindowControls(currentPopup);
}

// Render popup with partial translation (question + audio, loading for answer)
function renderPartialTranslationPopup(text) {
    if (!currentPopup) return null;

    currentPopup.classList.add('lumina-with-input');
    const safeText = text.replace(/"/g, '&quot;');

    currentPopup.innerHTML = getPopupShellHTML(`
        <div class="lumina-dict-entry" data-entry-type="translation" data-partial="true">
             <div class="lumina-chat-question translation-question">Translate</div>
             <div class="lumina-translation-container">
               <div class="lumina-translation-card">
                 <!-- Source Block -->
                 <div class="lumina-translation-block">
                   <div class="lumina-translation-source" data-copy-text="${safeText}">
                       <div class="lumina-translation-text">${text}</div>
                   </div>
                 </div>
               
                 <!-- Divider -->
                 <div class="lumina-translation-divider"></div>
               
                 <!-- Target Block -->
                 <div class="lumina-translation-block">
                   <div class="lumina-translation-target">
                       ${getLoadingHTML()}
                   </div>
                 </div>
               </div>
             </div>
        </div>
    `, false);

    const dictEntry = currentPopup.querySelector('.lumina-dict-entry');
    attachPlayButtonListeners(dictEntry);

    attachChatInputListeners(currentPopup, text);
    attachPopupSidebarListeners(currentPopup);
    updatePopupPosition();
    addWindowControls(currentPopup);
    return dictEntry;
}

function appendResult(data) {
    if (!currentPopup) return;

    if (!currentPopup) return;

    const container = currentPopup.querySelector('.lumina-chat-history') || currentPopup;

    const div = document.createElement('div');
    div.className = 'lumina-dict-entry lumina-fade-in';
    div.dataset.entryType = data.type === 'word' ? 'lookup' : 'translation';
    if (data.fromCache) div.dataset.fromCache = 'true';
    div.innerHTML = generateEntryHTML(data);

    // Add separator at the end of entry
    const separator = document.createElement('div');
    separator.className = 'lumina-dict-separator';
    div.appendChild(separator);

    container.appendChild(div);

    // Apply initial height and smooth scroll (duration defined in smoothScrollTo)
    setInitialEntryHeight(div, true);

    attachPlayButtonListeners(div);
    attachSynonymListeners(div);
    attachOriginalTextListeners(div);

    // Attach listener for translation question
    const transQuestion = div.querySelector('.translation-question div[contenteditable]');
    if (transQuestion) attachQuestionListeners(transQuestion);

    // Persist lookup/translation entries immediately
    if (typeof ChatHistoryManager !== 'undefined') {
        ChatHistoryManager.saveCurrentChat().catch(err =>
            console.error('[History] Failed to save lookup/translation entry:', err)
        );
    }
}

// Append partial translation entry (now uses comparison card structure with loading)
function appendPartialTranslation(text) {
    if (!currentPopup) return null;

    if (!currentPopup) return null;

    const container = currentPopup.querySelector('.lumina-chat-history') || currentPopup;
    const safeText = text.replace(/"/g, '&quot;');
    const cleanedOriginal = text.replace(/^(\d+|[a-zA-Z])[\.\)]\s*/, '').replace(/^["']|["']$/g, '');

    const div = document.createElement('div');
    div.className = 'lumina-dict-entry lumina-fade-in';
    div.dataset.entryType = 'translation';
    div.dataset.partial = 'true'; // Mark as partial for later update

    // "Empty" card structure with loading spinner in translation block
    div.innerHTML = `
         <div class="lumina-chat-question translation-question">Translate</div>
         <div class="lumina-translation-container">
           <div class="lumina-translation-card">
             <!-- Source Block -->
             <div class="lumina-translation-block">
               <div class="lumina-translation-source" data-copy-text="${safeText}">
                   <div class="lumina-translation-text">${text}</div>
               </div>
             </div>
           
             <!-- Divider -->
             <div class="lumina-translation-divider"></div>
           
             <!-- Target Block -->
             <div class="lumina-translation-block">
               <div class="lumina-translation-target">
                   ${getLoadingHTML()}
               </div>
             </div>
           </div>
         </div>
         <div class="lumina-dict-separator"></div>
    `;

    container.appendChild(div);
    attachPlayButtonListeners(div);

    // Apply initial height and smooth scroll (duration defined in smoothScrollTo)
    setInitialEntryHeight(div, true);
    return div; // Return element for later update
}

// Update partial translation entry with actual translation
function updatePartialTranslation(element, resultData) {
    if (!element) return;

    // If we received just a string (legacy/direct call), wrap it
    let data;
    if (typeof resultData === 'string') {
        data = { translation: resultData, type: 'sentence' };
    } else {
        data = resultData;
    }

    // If we lack "original", grab it from the DOM or element if possible, 
    if (!data.original) {
        // Try to recover original text from existing DOM if not in response
        const sourceDiv = element.querySelector('.lumina-translation-source');
        if (sourceDiv) {
            data.original = sourceDiv.getAttribute('data-copy-text') || sourceDiv.textContent.trim();
        }
    }

    element.innerHTML = generateEntryHTML(data);

    // Attach listeners to new elements
    attachPlayButtonListeners(element);

    // Add separator at the end if not exists
    if (!element.querySelector('.lumina-dict-separator')) {
        const separator = document.createElement('div');
        separator.className = 'lumina-dict-separator';
        element.appendChild(separator);
    }

    // Set min-height and scroll position (Gemini-style)
    requestAnimationFrame(() => setInitialEntryHeight(element));

    delete element.dataset.partial; // Remove partial flag

    // Set up sentence-level hover highlight (Google Translate style)
    if (typeof LuminaChatUI !== 'undefined') {
        requestAnimationFrame(() => LuminaChatUI._setupTranslationHighlight(element));
        // Balance the layout (equalize heights)
        LuminaChatUI.balanceTranslationCard(element);
    }

    // Scroll after translation completes
    // (min-height already set when partial entry was created; setInitialEntryHeight re-applies after DOM update)
    requestAnimationFrame(() => setInitialEntryHeight(element));

    // Save to permanent history
    if (typeof ChatHistoryManager !== 'undefined') {
        ChatHistoryManager.saveCurrentChat().catch(err =>
            console.error('[History] Failed to save translation:', err)
        );
    }
}

// Handle translation command from chat input
async function handleTranslationCommand(text) {
    if (!currentPopup) return;

    // Clear margins from previous entries
    clearEntryMargins();

    const partialEntry = appendPartialTranslation(text);
    let aborted = false;
    showStopButton(() => {
        aborted = true;
        if (partialEntry) partialEntry.remove();
        hideStopButton();
    });

    try {
        const response = await chrome.runtime.sendMessage({ action: 'translate', text: text });
        if (aborted) return;
        if (response.error) {
            if (partialEntry) partialEntry.remove();
            appendError(response.error);
        } else {
            if (response.type === 'sentence' && response.showAudio === false) {
                response.translation = formatTextLikeOriginal(text, response.translation);
            }
            updatePartialTranslation(partialEntry, response);
        }
    } catch (err) {
        if (aborted) return;
        if (partialEntry) partialEntry.remove();
        appendError(err.message);
    } finally {
        if (!aborted) hideStopButton();
    }
}

function attachSynonymListeners(containerElement) {
    const synonymBtns = containerElement.querySelectorAll('.lumina-dict-synonym-item, .lumina-dict-antonym-item');
    synonymBtns.forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const text = btn.textContent.trim();
            if (!text) return;

            currentText = text;

            // Append loading state
            const loadingId = appendLoading();

            try {
                const response = await chrome.runtime.sendMessage({ action: 'lookup', text: text });
                removeElementById(loadingId);
                if (response.error) {
                    appendError(response.error);
                } else {
                    appendResult(response);
                }
            } catch (err) {
                removeElementById(loadingId);
                appendError(err.message);
            }
        });
    });
}

function attachOriginalTextListeners(containerElement) {
    // Logic removed as per user request
}

// --- Chat Functions ---

function cleanContextText(text) {
    return text.trim().replace(/^(\d+|[a-zA-Z])[\.\)]\s*/, '').replace(/^["']|["']$/g, '');
}

function getChatInputHTML(autofocus = false) {
    // Use shared HTML from LuminaChatUI
    return LuminaChatUI.getChatInputHTML(autofocus);
}

function attachChatInputListeners(popup, contextText, onSubmit = null) {
    const input = popup.querySelector('.lumina-chat-input');
    if (!input) return;

    // Manual focus to avoid 'Autofocus processing was blocked' warning
    setTimeout(() => {
        if (input && document.contains(popup)) {
            input.focus();
        }
    }, 50);

    // Use shared LuminaChatUI for all input area logic (unification)
    const chatUI = new LuminaChatUI(popup, {
        onSubmit: async (text, files, extra) => {
            // Check for mode from UI instance or keyword matches (keyword matches are now handled by chat_ui.js)
            const mode = extra.mode || (chatUI.isTranslateMode ? 'translate' : (chatUI.isProofreadMode ? 'proofread' : 'qa'));

            if (mode === 'translate') {
                if (text) await handleTranslationCommand(text);
            } else if (mode === 'proofread') {
                await handleProofreadToggleSubmit(text);
            } else if (onSubmit) {
                await onSubmit(text, files);
            } else {
                await handleChatSubmit(text, contextText, files, null, extra);
            }
        }
    });
    // Store on popup so restore paths can call setInitialEntryHeight via the class method
    popup._luminaChatUI = chatUI;

    // Handle existing logic for keyboard-only focus
    let hideInputTimeout = null;
    input.addEventListener('focus', () => {
        if (hideInputTimeout) { clearTimeout(hideInputTimeout); hideInputTimeout = null; }
    });
















    input.addEventListener('keyup', (e) => e.stopPropagation());
    input.addEventListener('keypress', (e) => e.stopPropagation());
}

function showChatPopup(contextText = '') {
    isChatMode = true;
    const popup = createPopupElement();
    popup.classList.add('lumina-mode-chat');

    const cleanedContext = cleanContextText(contextText);

    popup.innerHTML = getPopupShellHTML('', true);

    attachChatInputListeners(popup, contextText);
    updatePopupPosition();
    addWindowControls(popup);
    attachPopupSidebarListeners(popup);

    // Session management: always start a fresh session in a new tab/popup
    if (typeof ChatHistoryManager !== 'undefined') {
        ChatHistoryManager.startNewSession();
    }
}

// --- Popup Sidebar Functions ---
function attachPopupSidebarListeners(popup) {
    const menuBtn = popup.querySelector('#popup-menu-btn');
    const sidebar = popup.querySelector('#popup-sidebar');
    const overlay = popup.querySelector('#popup-sidebar-overlay');
    const closeBtn = popup.querySelector('#popup-sidebar-close');
    const newChatBtn = popup.querySelector('#popup-new-chat-btn');
    const searchInput = popup.querySelector('#popup-sidebar-search');
    const clearBtn = popup.querySelector('#popup-sidebar-search-clear');

    if (!menuBtn || !sidebar || !overlay) return;

    menuBtn.addEventListener('click', () => openPopupSidebar(popup));
    closeBtn?.addEventListener('click', () => closePopupSidebar(popup));
    overlay.addEventListener('click', () => closePopupSidebar(popup));

    newChatBtn?.addEventListener('click', () => {
        popupSearchQuery = '';
        startNewPopupChat(popup);
        closePopupSidebar(popup);
    });

    if (searchInput) {
        searchInput.addEventListener('input', () => {
            const val = searchInput.value;
            if (clearBtn) clearBtn.style.display = val ? 'flex' : 'none';
            popupSearchQuery = val;
            loadPopupChatHistory(popup, val);
        });
    }

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (searchInput) {
                searchInput.value = '';
                searchInput.focus();
            }
            clearBtn.style.display = 'none';
            popupSearchQuery = '';
            loadPopupChatHistory(popup, '');
        });
    }
}

function openPopupSidebar(popup) {
    const sidebar = popup.querySelector('#popup-sidebar');
    const overlay = popup.querySelector('#popup-sidebar-overlay');
    const searchInput = popup.querySelector('#popup-sidebar-search');
    const clearBtn = popup.querySelector('#popup-sidebar-search-clear');

    sidebar?.classList.add('active');
    overlay?.classList.add('active');

    if (searchInput) searchInput.value = popupSearchQuery;
    if (clearBtn) clearBtn.style.display = popupSearchQuery ? 'flex' : 'none';

    loadPopupChatHistory(popup, popupSearchQuery);
}

function closePopupSidebar(popup) {
    const sidebar = popup.querySelector('#popup-sidebar');
    const overlay = popup.querySelector('#popup-sidebar-overlay');

    sidebar?.classList.remove('active');
    overlay?.classList.remove('active');
}

async function loadPopupChatHistory(popup, searchQuery = '') {
    const historyList = popup.querySelector('#popup-history-list');
    if (!historyList) return;

    const state = getPopupHistoryState(popup);
    state.query = searchQuery;
    attachPopupHistoryClick(popup, historyList);
    attachPopupHistoryLazyLoad(popup, historyList);

    try {
        const historyKey = (typeof ChatHistoryManager !== 'undefined') ? ChatHistoryManager.STORAGE_KEY : 'lumina_chat_sessions';
        const data = await chrome.storage.local.get([historyKey]);
        const sessions = data[historyKey] || {};

        let sessionArray = Object.entries(sessions)
            .map(([id, session]) => {
                // Optimization: Don't keep heavy message objects in RAM just for the list view
                // We only need id, title, and updatedAt for the history sidebar
                return {
                    id: id,
                    title: session.title || 'New Chat',
                    updatedAt: session.updatedAt || session.createdAt || 0,
                    // Keep messages only if searching, or remove them to save RAM
                    _hasKeyword: searchQuery ? (session.messages || []).some(msg =>
                        msg.type === 'question' &&
                        msg.content.toLowerCase().includes(searchQuery.toLowerCase())
                    ) : true
                };
            })
            .filter(s => s._hasKeyword)
            .sort((a, b) => b.updatedAt - a.updatedAt);

        state.items = sessionArray;
        renderPopupHistory(popup, historyList, true);
    } catch (e) {
        console.error('[Popup] Failed to load chat history:', e);
        historyList.innerHTML = '<div class="lumina-popup-history-empty">Failed to load history</div>';
    }
}

function getPopupHistoryState(popup) {
    if (!popupHistoryState.has(popup)) {
        popupHistoryState.set(popup, { items: [], rendered: 0, query: '' });
    }
    return popupHistoryState.get(popup);
}

function attachPopupHistoryClick(popup, historyList) {
    if (historyList.__luminaHistoryClickBound) return;
    historyList.__luminaHistoryClickBound = true;
    historyList.addEventListener('click', (e) => {
        const item = e.target.closest('.lumina-popup-history-item');
        if (!item) return;
        const sessionId = item.dataset.sessionId;
        const currentId = (typeof ChatHistoryManager !== 'undefined') ? ChatHistoryManager.currentSessionId : null;
        const state = getPopupHistoryState(popup);
        if (sessionId !== currentId || state.query) {
            switchPopupSession(popup, sessionId, state.query);
        } else {
            // Same session, no query — scroll to show the newest (last) entry
            const chatHistory = popup.querySelector('.lumina-chat-history');
            if (chatHistory) {
                const allEntries = chatHistory.querySelectorAll('.lumina-dict-entry');
                if (allEntries.length > 0) {
                    const lastEntry = allEntries[allEntries.length - 1];
                    requestAnimationFrame(() => alignEntryToPreviousSeparatorTop(popup, lastEntry));
                }
            }
        }
        closePopupSidebar(popup);
    });
}

function attachPopupHistoryLazyLoad(popup, historyList) {
    if (historyList.__luminaHistoryLazyBound) return;
    historyList.__luminaHistoryLazyBound = true;
    historyList.addEventListener('scroll', () => {
        const state = getPopupHistoryState(popup);
        if (state.query) return;
        const nearBottom = historyList.scrollTop + historyList.clientHeight >= historyList.scrollHeight - 120;
        if (nearBottom) renderPopupHistory(popup, historyList, false);
    });
}

function renderPopupHistory(popup, historyList, reset) {
    const state = getPopupHistoryState(popup);
    if (reset) {
        state.rendered = 0;
        historyList.scrollTop = 0;
        historyList.innerHTML = '';
    }

    if (!state.items || state.items.length === 0) {
        historyList.innerHTML = `
            <div class="lumina-popup-history-empty">
                <p>${state.query ? 'No results found' : 'No chat history yet'}</p>
                <p style="margin-top: 8px; font-size: 11px;">${state.query ? 'Try a different search term' : 'Your conversations will appear here'}</p>
            </div>
        `;
        return;
    }

    const shouldRenderAll = !!state.query;
    const nextCount = shouldRenderAll
        ? state.items.length
        : Math.min(state.rendered + POPUP_HISTORY_BATCH_SIZE, state.items.length);

    const slice = state.items.slice(state.rendered, nextCount);
    const html = slice.map(session => {
        const currentId = (typeof ChatHistoryManager !== 'undefined') ? ChatHistoryManager.currentSessionId : null;
        const isActive = session.id === currentId;
        const date = session.updatedAt ? formatPopupDate(session.updatedAt) : 'Unknown';
        const title = (session.title || 'New Chat').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

        return `
            <div class="lumina-popup-history-item ${isActive ? 'active' : ''}" data-session-id="${session.id}">
                <div class="lumina-popup-history-title">${title}</div>
                <div class="lumina-popup-history-date">${date}</div>
            </div>
        `;
    }).join('');

    historyList.insertAdjacentHTML('beforeend', html);
    state.rendered = nextCount;
}

async function switchPopupSession(popup, sessionId, searchQuery = null) {
    try {
        if (typeof ChatHistoryManager !== 'undefined') await ChatHistoryManager.saveCurrentChat();

        const historyKey = (typeof ChatHistoryManager !== 'undefined') ? ChatHistoryManager.STORAGE_KEY : 'lumina_chat_sessions';
        const data = await chrome.storage.local.get([historyKey]);
        const sessions = data[historyKey] || {};
        const session = sessions[sessionId];

        if (session && session.messages) {
            if (typeof ChatHistoryManager !== 'undefined') ChatHistoryManager.currentSessionId = sessionId;

            const chatHistory = popup.querySelector('.lumina-chat-history');
            if (chatHistory) {
                chatHistory.innerHTML = '';

                let i = 0;
                while (i < session.messages.length) {
                    const msg = session.messages[i];

                    if (msg.type === 'question') {
                        const entryDiv = document.createElement('div');
                        entryDiv.className = 'lumina-dict-entry';
                        entryDiv.dataset.entryType = msg.metadata?.entryType || 'qa';

                        const questionDiv = document.createElement('div');
                        questionDiv.className = 'lumina-chat-question';
                        const textDiv = document.createElement('div');
                        textDiv.setAttribute('contenteditable', 'true');
                        // Strip internal variables during history restore
                        const restoredContent = msg.content.replace(/[("'\[]*\$Container[)"'\]]*\s*/gi, '').trim();
                        textDiv.textContent = restoredContent;
                        questionDiv.appendChild(textDiv);
                        entryDiv.appendChild(questionDiv);

                        i++;

                        if (i < session.messages.length && session.messages[i].type === 'answer') {
                            const answerMsg = session.messages[i];
                            const answerDiv = document.createElement('div');
                            answerDiv.className = 'lumina-chat-answer';
                            let answerContent = answerMsg.content;

                            if (answerContent.trim().startsWith('<')) {
                                answerDiv.innerHTML = answerContent;
                            } else if (typeof marked !== 'undefined') {
                                answerDiv.innerHTML = marked.parse(answerContent);
                            } else {
                                answerDiv.textContent = answerContent;
                            }

                            answerDiv.querySelectorAll('a').forEach(link => {
                                link.target = '_blank';
                                link.rel = 'noopener noreferrer';
                            });
                            entryDiv.appendChild(answerDiv);
                            i++;
                        }

                        const separator = document.createElement('div');
                        separator.className = 'lumina-dict-separator';
                        entryDiv.appendChild(separator);

                        chatHistory.appendChild(entryDiv);
                        if (typeof attachQuestionListeners === 'function') {
                            attachQuestionListeners(questionDiv.querySelector('[contenteditable]'));
                        }
                        continue;
                    }
                    i++;
                }

                // Set min-height on last entry + scroll to correct position.
                // For search results, scroll to matching entry; otherwise use setInitialEntryHeight
                // which sets min-height AND scrolls so the previous separator is at top.
                const allEntries = chatHistory.querySelectorAll('.lumina-dict-entry');
                if (allEntries.length > 0) {
                    const lastEntry = allEntries[allEntries.length - 1];
                    const tUI = popup._luminaChatUI;

                    if (searchQuery) {
                        // Set min-height on last entry without scroll (scroll handled below)
                        if (tUI) requestAnimationFrame(() => tUI.setInitialEntryHeight(lastEntry));
                        else requestAnimationFrame(() => setInitialEntryHeight(lastEntry));

                        const query = searchQuery.toLowerCase();
                        for (const entry of allEntries) {
                            const q = entry.querySelector('.lumina-chat-question');
                            if (q && q.textContent.toLowerCase().includes(query)) {
                                q.style.animation = 'lumina-highlight 1s ease';
                                const prevEntry = entry.previousElementSibling;
                                if (prevEntry && prevEntry.classList.contains('lumina-dict-entry')) {
                                    const separator = prevEntry.querySelector('.lumina-dict-separator');
                                    if (separator) separator.scrollIntoView({ behavior: 'auto', block: 'start' });
                                } else {
                                    chatHistory.scrollTop = 0;
                                }
                                break;
                            }
                        }
                    } else {
                        // setInitialEntryHeight handles both min-height and scroll
                        if (tUI) {
                            requestAnimationFrame(() => {
                                tUI.setInitialEntryHeight(lastEntry);
                                requestAnimationFrame(() => alignEntryToPreviousSeparatorTop(popup, lastEntry));
                            });
                        } else {
                            requestAnimationFrame(() => {
                                setInitialEntryHeight(lastEntry);
                                requestAnimationFrame(() => alignEntryToPreviousSeparatorTop(popup, lastEntry));
                            });
                        }
                    }
                }
            }
        }
    } catch (e) {
        console.error('[Popup] Failed to switch session:', e);
    }
}

function startNewPopupChat(popup) {
    if (typeof ChatHistoryManager !== 'undefined') ChatHistoryManager.startNewSession();
    const chatHistory = popup.querySelector('.lumina-chat-history');
    if (chatHistory) chatHistory.innerHTML = '';
    const input = popup.querySelector('#chat-input');
    if (input) input.focus();
}

// Redundant savePopupSession removed in favor of ChatHistoryManager.saveCurrentChat()

function formatPopupDate(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// (Auto-save periodically removed as it causes background lag on multi-tab setups.
// ChatHistoryManager.saveCurrentChat() is already called on interaction events).

async function handleChatSubmit(question, context, fileData = null, entryType = null, options = {}) {
    lastQuestion = question;

    // Ensure hidden summary element exists
    if (!currentPopup.querySelector('#lumina-chat-summary')) {
        const sumDiv = document.createElement('div');
        sumDiv.id = 'lumina-chat-summary';
        sumDiv.style.display = 'none';
        currentPopup.appendChild(sumDiv);
    }

    // Gather conversation history
    const contextData = gatherFullContext();
    currentContext = contextData.initialContext;

    // Determine entry type if not provided
    if (!entryType) {
        const hasFiles = fileData && (Array.isArray(fileData) ? fileData.length > 0 : true);
        entryType = hasFiles ? 'file-chat' : 'qa';
    }

    // Append User Question (with file preview if present)
    appendChatEntry('question', question, fileData, entryType);

    // Append Loading
    const loadingId = appendChatLoading();

    // Prepare Prompt with File Summary Instruction
    let promptToSend = question;

    // If initialContext contains pending context (not just summary), prepend it to question
    if (contextData.initialContext && contextData.initialContext.includes('[Selected Text Context]')) {
        promptToSend = contextData.initialContext + '\n\n[Question]: ' + question;
    }

    if (fileData && (Array.isArray(fileData) ? fileData.length > 0 : true)) {
        const fileCount = Array.isArray(fileData) ? fileData.length : 1;
        const noun = fileCount > 1 ? "files" : "file";
        const adj = fileCount > 1 ? "these" : "this";
        promptToSend += `\n\n[System: Please analyze ${adj} attached ${noun}. Additionally, verify your understanding by providing a concise summary of the ${noun} content inside <file_summary> tags (e.g. <file_summary>This file covers...</file_summary>) at the end of your response. This is required for long-term context retention.]`;
    }

    // Pass structured data to stream function
    await streamChatResponse(contextData, promptToSend, loadingId, fileData, options);
}

function gatherFullContext(cutoffElement = null) {
    if (!currentPopup) return { messages: [], initialContext: "" };

    const MAX_ATTACHMENT_DEPTH = 3; // Keep full files for last 3 turns only

    let history = currentPopup.querySelector('.lumina-chat-history');
    // Fallback: Check for ID or scroll content directly if class is missing (handles user reported edge case)
    if (!history) history = currentPopup.querySelector('#chat-history');
    if (!history) {
        const scrollContent = currentPopup.querySelector('.lumina-chat-scroll-content');
        if (scrollContent && scrollContent.querySelector('.lumina-dict-entry')) {
            history = scrollContent;
        }
    }

    const summaryEl = currentPopup.querySelector('#lumina-chat-summary');

    if (!history) return { messages: [], initialContext: "" };

    // Group elements into entries
    const entries = [];
    let currentEntry = { elements: [] };

    for (const child of history.children) {
        if (cutoffElement && child === cutoffElement) {
            currentEntry.elements.push(child);
            break;
        }
        if (child.classList.contains('lumina-dict-separator')) {
            if (currentEntry.elements.length > 0) entries.push(currentEntry);
            currentEntry = { elements: [] };
            continue;
        }
        if (child.classList.contains('lumina-dict-entry')) {
            if (currentEntry.elements.length > 0) entries.push(currentEntry);
            entries.push({ elements: [child], isContainer: true });
            currentEntry = { elements: [] };
            continue;
        }
        currentEntry.elements.push(child);
    }
    if (currentEntry.elements.length > 0) entries.push(currentEntry);

    // 1. Extract raw data from all entries (Oldest -> Newest)
    const rawMessages = [];

    // Find the very last transcript container in the chat to only include the latest one
    const allTranscriptContainers = history.querySelectorAll('.lumina-youtube-transcript-container');
    const latestTranscriptContainer = allTranscriptContainers.length > 0 ? allTranscriptContainers[allTranscriptContainers.length - 1] : null;

    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];

        // Check for cached entry exclusion: Skip if it's cached and NOT the very first entry
        if (i > 0 && entry.isContainer && entry.elements.length > 0) {
            const container = entry.elements[0];
            if (container.classList.contains('lumina-dict-entry') && container.dataset.fromCache === 'true') {
                continue; // Skip cached entry
            }
        }
        let userContent = "";
        let modelContent = "";
        let fileData = null;

        for (const el of entry.elements) {
            // Handle dict-entry container
            if (el.classList.contains('lumina-dict-entry') || entry.isContainer) {
                const container = el.classList.contains('lumina-dict-entry') ? el : entry.elements[0];
                const explicitType = container.dataset.entryType;

                // Image/File lookup
                if (explicitType === 'image-lookup' || explicitType === 'file-lookup') {
                    const query = container.querySelector('.lumina-dict-word')?.textContent?.trim() ||
                        container.querySelector('.lumina-image-query')?.textContent?.trim();
                    userContent = `Display files/images of "${query || 'query'}"`;
                    modelContent = `[Files/Images of "${query || 'query'}" are displayed]`;
                    continue;
                }

                // Dictionary/Translation/Proofread logic...
                const wordEl = container.querySelector('.lumina-dict-word');
                if (wordEl) {
                    userContent = `Look up: "${wordEl.textContent.trim()}"`;
                    const meanings = Array.from(container.querySelectorAll('.lumina-dict-meaning-text'))
                        .map(m => m.textContent.trim()).join('; ');
                    modelContent = meanings || "Dictionary result.";
                }

                // Translation Card Logic
                const transSource = container.querySelector('.lumina-translation-source .lumina-translation-text');
                if (transSource) {
                    userContent = `Translate: "${transSource.textContent.trim()}"`;

                    let transTargetEl = null;
                    // Strict check for active version first to avoid grabbing hidden versions
                    const activeVersion = container.querySelector('.lumina-answer-version.active');
                    if (activeVersion) {
                        transTargetEl = activeVersion.querySelector('.lumina-translation-text');
                    } else {
                        // Standard structure (no versions yet)
                        transTargetEl = container.querySelector('.lumina-translation-target .lumina-translation-text');
                    }

                    modelContent = transTargetEl ? transTargetEl.textContent.trim() : "Translation result.";
                }

                // Nested Q&A (including contextual entries)
                const nestedQuestion = container.querySelector('.lumina-chat-question');

                // Versioning Support: Check for active version first
                let nestedAnswer = null;
                const activeVersion = container.querySelector('.lumina-answer-version.active');
                if (activeVersion) {
                    nestedAnswer = activeVersion.querySelector('.lumina-chat-answer');
                } else {
                    // Fallback to standard structure
                    nestedAnswer = container.querySelector('.lumina-chat-answer');
                }

                const nestedContext = container.querySelector('.lumina-chat-context');

                if (nestedQuestion) {
                    let questionText = nestedQuestion.textContent.trim();

                    if (nestedContext) {
                        // Priority: data-full-text (collapsed state) > textContent (expanded state)
                        const ctxText = nestedContext.dataset.fullText || nestedContext.textContent.trim();
                        if (ctxText) {
                            questionText = `[Selected Text Context]: "${ctxText}"\n\n[Question]: ${questionText}`;
                        }
                    }

                    // Only append the LATEST transcript in the chat to avoid token overflow
                    const transcriptContainer = container.querySelector('.lumina-youtube-transcript-container');
                    if (transcriptContainer && transcriptContainer === latestTranscriptContainer) {
                        const transcriptContent = transcriptContainer.querySelector('.lumina-youtube-transcript-content');
                        if (transcriptContent) {
                            questionText = `[Video Transcript Context]:\n"${transcriptContent.textContent.trim()}"\n\n[Question]: ${questionText}`;
                        }
                    }

                    userContent = questionText;

                    if (nestedQuestion.dataset.files) {
                        try { fileData = JSON.parse(nestedQuestion.dataset.files); } catch (e) { console.error('Parse files error:', e); }
                    } else if (nestedQuestion.dataset.images) {
                        try {
                            fileData = JSON.parse(nestedQuestion.dataset.images).map(img => ({
                                mimeType: 'image/jpeg', data: img.split(',')[1], isImage: true
                            }));
                        } catch (e) { console.error('Parse images error:', e); }
                    }
                }
                if (nestedAnswer) modelContent = nestedAnswer.textContent.trim();
            }

            // Standalone Q&A
            if (el.classList.contains('lumina-chat-question')) {
                userContent = el.textContent.trim();
                // Check standalone files
                if (el.dataset.files) {
                    try { fileData = JSON.parse(el.dataset.files); } catch (e) { }
                } else if (el.dataset.images) {
                    try {
                        fileData = JSON.parse(el.dataset.images).map(img => ({
                            mimeType: 'image/jpeg', data: img.split(',')[1], isImage: true
                        }));
                    } catch (e) { }
                }
            }
            if (el.classList.contains('lumina-chat-answer')) {
                // Skip if this answer is inside a non-active version
                const versionParent = el.closest('.lumina-answer-version');
                if (versionParent && !versionParent.classList.contains('active')) {
                    continue;
                }
                modelContent = el.textContent.trim();
            }
        }

        if (userContent || modelContent) {
            rawMessages.push({ userContent, modelContent, fileData });
        }
    }

    // 2. Sliding Window & Smart Pruning (Process backwards: Newest -> Oldest)
    const processedMessages = [];
    let currentTokenCount = 0;

    // Estimate: 4 chars ~ 1 token. Base overhead ~ 50 tokens.

    for (let i = rawMessages.length - 1; i >= 0; i--) {
        const item = rawMessages[i];
        let msgTokens = 0;

        const userMsg = {
            role: 'user',
            text: item.userContent,
            files: []
        };

        // Always keep files/images - no pruning
        if (item.fileData && item.fileData.length > 0) {
            userMsg.files = item.fileData;
        }

        msgTokens += (userMsg.text.length / 4);

        // Remove file_summary tags from model content to save space if needed, 
        let modelText = item.modelContent;
        if (modelText) {
            // Optional: strip summary block from history to avoid duplication

            msgTokens += (modelText.length / 4);
            processedMessages.unshift({ role: 'model', text: modelText });
        }

        // No more token limit - send full context
        processedMessages.unshift(userMsg);

        currentTokenCount += msgTokens;
    }

    // Get compaction summary if exists (for long conversations)
    let summaryContext = "";
    if (summaryEl && summaryEl.textContent.trim()) {
        summaryContext = `[Previous Conversation Summary]: ${summaryEl.textContent.trim()}`;
    }

    // Check for pending standalone context (not yet wrapped in entry)
    const lastChild = history.lastElementChild;
    const isPendingContext = lastChild && lastChild.classList.contains('lumina-chat-context') && !lastChild.closest('.lumina-dict-entry');

    if (isPendingContext) {
        // Extract context text to include in initialContext
        const ctxText = lastChild.dataset.fullText || lastChild.querySelector('.lumina-context-text')?.textContent?.trim() || "";
        if (ctxText && summaryContext) {
            summaryContext += `\n\n[Selected Text Context]: "${ctxText}"`;
        } else if (ctxText) {
            summaryContext = `[Selected Text Context]: "${ctxText}"`;
        }
    }

    // Extract the videoId of the latest transcript displayed in the history
    let hasTranscriptForVideoId = null;
    const transcriptContainers = history.querySelectorAll('.lumina-youtube-transcript-container');
    if (transcriptContainers && transcriptContainers.length > 0) {
        const latestContainer = transcriptContainers[transcriptContainers.length - 1];
        if (latestContainer.dataset.videoId) {
            hasTranscriptForVideoId = latestContainer.dataset.videoId;
        }
    }

    // Debug logging: Show full context being sent to AI
    // console.log("Final Context Token Size:", currentTokenCount);
    // console.table(processedMessages);

    return { messages: processedMessages, initialContext: summaryContext, hasTranscriptForVideoId };
}

function appendChatEntry(type, text, fileData = null, entryType = 'qa') {
    if (!currentPopup) return;

    const history = currentPopup.querySelector('.lumina-chat-history');

    if (type === 'question') {

        // Check if there's a pending context (context without entry wrapper)
        const lastChild = history.lastElementChild;
        const isPendingContext = lastChild &&
            lastChild.classList.contains('lumina-chat-context') &&
            !lastChild.closest('.lumina-dict-entry');

        if (isPendingContext) {
            // Wrap the pending context + new question in an entry
            const entry = document.createElement('div');
            entry.className = 'lumina-dict-entry';
            entry.dataset.entryType = 'contextual-qa';

            // Move the context into the entry
            entry.appendChild(lastChild);

            // Add question
            const questionDiv = document.createElement('div');
            questionDiv.className = 'lumina-chat-question';
            questionDiv.dataset.entryType = 'contextual-qa';
            if (fileData && (Array.isArray(fileData) ? fileData.length > 0 : true)) {
                questionDiv.dataset.files = JSON.stringify(Array.isArray(fileData) ? fileData : [fileData]);
            }

            const textDiv = document.createElement('div');
            textDiv.contentEditable = "true";
            textDiv.textContent = text.charAt(0).toUpperCase() + text.slice(1);
            questionDiv.appendChild(textDiv);

            entry.appendChild(questionDiv);

            // Add separator at the end
            const separator = document.createElement('div');
            separator.className = 'lumina-dict-separator';
            entry.appendChild(separator);

            history.appendChild(entry);

            attachQuestionListeners(textDiv);
            if (currentPopup._luminaChatUI) {
                requestAnimationFrame(() => currentPopup._luminaChatUI.setInitialEntryHeight(entry));
            } else {
                requestAnimationFrame(() => setInitialEntryHeight(entry));
            }
            return;
        }

        // Normal question (no pending context)
        const entry = document.createElement('div');
        entry.className = 'lumina-dict-entry';
        entry.dataset.entryType = entryType;

        // Render Attached Files
        if (fileData && (Array.isArray(fileData) ? fileData.length > 0 : true)) {
            const files = Array.isArray(fileData) ? fileData : [fileData];
            const fileContainer = document.createElement('div');
            fileContainer.className = 'lumina-chat-question-files';

            files.forEach(file => {
                // Reconstruct or use previewUrl if local
                const isImage = file.isImage || file.mimeType.startsWith('image/');
                const src = file.previewUrl || `data:${file.mimeType};base64,${file.data}`;

                if (isImage) {
                    const img = document.createElement('img');
                    img.src = src;
                    img.alt = file.name || "Attached image";
                    img.className = 'lumina-chat-attached-image';
                    fileContainer.appendChild(img);
                } else {
                    // Render Generic File Icon
                    const fileItem = document.createElement('div');
                    fileItem.className = 'lumina-chat-attached-file';

                    let iconSVG = '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>';
                    if (file.mimeType.startsWith('audio/')) iconSVG = '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M12 3v9.28c-.47-.17-.97-.28-1.5-.28C8.01 12 6 14.01 6 16.5S8.01 21 10.5 21c2.31 0 4.2-1.75 4.45-4H15V6h4V3h-7z"/></svg>';
                    if (file.mimeType.startsWith('video/')) iconSVG = '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>';
                    if (file.mimeType === 'application/pdf') iconSVG = '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M20 2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8.5 7.5c0 .83-.67 1.5-1.5 1.5H9v2H7.5V7H10c.83 0 1.5.67 1.5 1.5v1zm5 2c0 .83-.67 1.5-1.5 1.5h-2.5V7H15c.83 0 1.5.67 1.5 1.5v3zm4-3H19v1h1.5V11H19v2h-1.5V7h3v1.5zM9 9.5h1v-1H9v1zM4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm10 5.5h1v-3h-1v3z"/></svg>';

                    fileItem.innerHTML = `${iconSVG}<span>${file.name || 'File'}</span>`;
                    fileContainer.appendChild(fileItem);
                }
            });

            entry.appendChild(fileContainer);
        }

        // Create question div
        const questionDiv = document.createElement('div');
        questionDiv.className = 'lumina-chat-question';
        questionDiv.dataset.entryType = entryType;
        questionDiv.dataset.type = entryType; // For CSS targeting (.proofread-question, etc)
        if (fileData && (Array.isArray(fileData) ? fileData.length > 0 : true)) {
            questionDiv.dataset.files = JSON.stringify(Array.isArray(fileData) ? fileData : [fileData]);
        } else if (fileData) {
            // Legacy/Fallback for just string (shouldn't happen with new logic but safe)
        }

        const textDiv = document.createElement('div');
        textDiv.contentEditable = "true";
        // User requested to remove auto-capitalization
        textDiv.textContent = text;
        questionDiv.appendChild(textDiv);

        entry.appendChild(questionDiv);

        // Add separator at the end
        const separator = document.createElement('div');
        separator.className = 'lumina-dict-separator';
        entry.appendChild(separator);

        history.appendChild(entry);

        attachQuestionListeners(textDiv);
        if (currentPopup._luminaChatUI) {
            requestAnimationFrame(() => currentPopup._luminaChatUI.setInitialEntryHeight(entry));
        } else {
            requestAnimationFrame(() => setInitialEntryHeight(entry));
        }
    } else {
        // Find the last entry to append answer to
        let lastEntry = getLastHistoryDictEntry(history);

        // If no entry exists or the last entry already has an answer, create a new one
        if (!lastEntry || lastEntry.querySelector('.lumina-chat-answer')) {
            lastEntry = document.createElement('div');
            lastEntry.className = 'lumina-dict-entry';
            lastEntry.dataset.entryType = entryType;
            history.appendChild(lastEntry);

            // Add separator at the end for new entries
            const separator = document.createElement('div');
            separator.className = 'lumina-dict-separator';
            lastEntry.appendChild(separator);
        }

        const answerDiv = document.createElement('div');
        answerDiv.className = 'lumina-chat-answer';

        // Use marked to parse Markdown
        if (typeof marked !== 'undefined') {
            // Filter out tool call JSON before rendering
            const displayText = text.replace(/\{"tool"\s*:\s*"search_web"\s*,\s*"args"\s*:\s*\{[^}]+\}\s*\}/g, '');
            // Preprocess Math LaTeX (escape delimiters and %)
            const safeText = preprocessMathContent(displayText);
            const capitalizedOutput = capitalizeText(safeText);
            answerDiv.innerHTML = marked.parse(capitalizedOutput);
            // Make all links open in new tab
            answerDiv.querySelectorAll('a').forEach(link => {
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
            });
            // Apply syntax highlighting to code blocks
            if (typeof hljs !== 'undefined') {
                answerDiv.querySelectorAll('pre code').forEach(block => {
                    hljs.highlightElement(block);
                });
            }
        } else {
            answerDiv.textContent = capitalizeText(text);
        }

        // Render LaTeX if available
        if (window.renderMathInElement) {
            window.renderMathInElement(answerDiv, {
                delimiters: [
                    { left: '$$', right: '$$', display: true },
                    { left: '\\(', right: '\\)', display: false },
                    { left: '\\[', right: '\\]', display: true }
                ],
                throwOnError: false
            });
        }

        const existingSep = lastEntry.querySelector(':scope > .lumina-dict-separator');
        if (existingSep) {
            lastEntry.insertBefore(answerDiv, existingSep);
        } else {
            lastEntry.appendChild(answerDiv);
            const separator = document.createElement('div');
            separator.className = 'lumina-dict-separator';
            lastEntry.appendChild(separator);
        }

        // Adjust margin so this entry's separator aligns with container top
        adjustEntryMargin(lastEntry);

        scrollToElement(answerDiv);

        // Auto-save chat history after adding entry
        ChatHistoryManager.saveCurrentChat().catch(err =>
            console.error('Failed to auto-save chat:', err)
        );
    }
}

function getLastHistoryDictEntry(historyEl) {
    if (!historyEl) return null;
    let el = historyEl.lastElementChild;
    while (el && !el.classList.contains('lumina-dict-entry')) {
        el = el.previousElementSibling;
    }
    return el;
}

function attachQuestionListeners(element) {
    // Note: We now handle container clicks, inputs, and keydowns globally via document event listeners
}

// Global keydown listener for chat questions to handle Enter submissions
document.addEventListener('keydown', (e) => {
    // Check if the target is an editable chat question using composedPath for Shadow DOM compatibility
    const target = (e.composedPath && e.composedPath()[0]) || e.target;
    if (!target) return;
    const editable = target.closest ? target.closest('.lumina-chat-question div[contenteditable="true"]') : null;

    if (editable) {
        if (e.key === 'Enter') {
            // HARD STOP: Prevent any other listeners (like the main chat focus one) from seeing this Enter
            e.stopImmediatePropagation();

            if (!e.shiftKey) {
                e.preventDefault();
                const newQuestion = editable.textContent.trim();
                if (newQuestion) {
                    editable.blur();
                    handleQuestionRecheck(newQuestion, editable);
                }
            } else {
                // Let Shift+Enter work naturally for newline in contenteditable
                // stopImmediatePropagation ensures it doesn't leak to the main chat input
            }
        }
    }
}, true); // Use capture phase to intercept before bubbling focus-theft listeners

// Global input listener for chat questions
document.addEventListener('input', (e) => {
    const editable = e.target.closest('.lumina-chat-question div[contenteditable="true"]');
    if (editable && e.target === editable) {
        e.stopPropagation();
    }
});

// Global mousedown listener for chat questions to focus editable text reliably
document.addEventListener('mousedown', (e) => {
    // Check if click was inside a question container
    const container = e.target.closest('.lumina-chat-question');
    if (container) {
        // If they didn't click directly on the text area
        if (!e.target.closest('div[contenteditable="true"]')) {
            const editable = container.querySelector('div[contenteditable="true"]');
            if (editable) {
                e.preventDefault(); // Prevents browser from losing focus
                editable.focus();

                setTimeout(() => {
                    if (typeof window.getSelection !== "undefined" && typeof document.createRange !== "undefined") {
                        const range = document.createRange();
                        range.selectNodeContents(editable);
                        range.collapse(false);
                        const sel = window.getSelection();
                        sel.removeAllRanges();
                        sel.addRange(range);
                    }
                }, 0);
            }
        }
    }
});

async function handleQuestionRecheck(question, questionDiv) {
    // 1. Remove subsequents
    const entryParent = questionDiv.closest('.lumina-dict-entry');
    if (entryParent) {
        // Remove all subsequent entries (conversations after this one)
        let nextEntry = entryParent.nextSibling;
        while (nextEntry) {
            const toRemove = nextEntry;
            nextEntry = nextEntry.nextSibling;
            toRemove.remove();
        }

        // Remove the old answer from this entry
        const oldAnswer = entryParent.querySelector('.lumina-chat-answer');
        if (oldAnswer) oldAnswer.remove();

        // Remove any existing separators (to prevent accumulation or misplacement)
        const oldSeparators = entryParent.querySelectorAll('.lumina-dict-separator');
        oldSeparators.forEach(sep => sep.remove());

        // Remove any existing web search steppers
        const oldSteppers = entryParent.querySelectorAll('.lumina-web-search');
        oldSteppers.forEach(step => step.remove());

        // Apply initial margin and scroll behavior
        requestAnimationFrame(() => {
            setInitialEntryHeight(entryParent, true);
        });
    } else {
        // Fallback for non-nested structure
        let next = questionDiv.nextSibling;
        while (next) {
            const toRemove = next;
            next = next.nextSibling;
            toRemove.remove();
        }
    }

    // Check if this is a proofread question
    if (questionDiv.dataset.type === 'proofread' || questionDiv.classList.contains('proofread-question')) {
        const loadingId = appendChatLoading();
        await handleProofreadChatAction(question, loadingId);
        return;
    }

    // 2. Gather context UP TO this question
    const contextData = gatherFullContext(questionDiv);
    currentContext = contextData.initialContext;
    lastQuestion = question;

    // 3. Append Loading (will be the next sibling now)
    const loadingId = appendChatLoading();

    // Get files from this question if any
    let fileData = null;
    if (questionDiv.dataset.files) {
        try {
            fileData = JSON.parse(questionDiv.dataset.files);
        } catch (e) { }
    } else if (questionDiv.dataset.images) {
        // Legacy fallback
        try {
            const imgs = JSON.parse(questionDiv.dataset.images);
            fileData = imgs.map(img => ({
                mimeType: 'image/jpeg',
                data: img.split(',')[1],
                isImage: true
            }));
        } catch (e) { }
    }

    await streamChatResponse(contextData, question, loadingId, fileData);
}

function streamChatResponse(contextData, question, loadingId, fileData = null, options = {}) {
    return new Promise((resolve, reject) => {
        const port = chrome.runtime.connect({ name: 'lumina-chat-stream' });
        let answerDiv = null;
        let fullAnswer = "";
        let updateThrottled = false;
        let pendingChunkUpdate = false;
        let webSearchSources = []; // Store sources for citations
        let webSearchStepperDiv = null; // Reference to stepper UI
        let isTranslationRegenerate = false; // Flag for translation/lookup entry regeneration
        let autoFollow = false;
        let streamScrollContainer = null;
        let streamScrollHandler = null;

        const getStreamScrollContainer = () => {
            if (!currentPopup) return null;
            return currentPopup.querySelector('.lumina-chat-scroll-content') ||
                currentPopup.querySelector('.lumina-chat-history') ||
                currentPopup;
        };

        const updateAutoFollow = () => {
            autoFollow = false;
        };

        const bindStreamScrollGuard = () => {
            const sc = getStreamScrollContainer();
            if (!sc) return;
            if (streamScrollContainer === sc) return;

            if (streamScrollContainer && streamScrollHandler) {
                streamScrollContainer.removeEventListener('scroll', streamScrollHandler);
            }

            streamScrollContainer = sc;
            streamScrollHandler = () => updateAutoFollow();
            streamScrollContainer.addEventListener('scroll', streamScrollHandler, { passive: true });
            updateAutoFollow();
        };

        const unbindStreamScrollGuard = () => {
            if (streamScrollContainer && streamScrollHandler) {
                streamScrollContainer.removeEventListener('scroll', streamScrollHandler);
            }
            streamScrollContainer = null;
            streamScrollHandler = null;
        };

        const renderChunkUI = () => {
            if (!currentPopup) return;

            const chunkScrollContainer = getStreamScrollContainer();
            const preservedScrollTop = (!autoFollow && chunkScrollContainer)
                ? chunkScrollContainer.scrollTop
                : null;

            if (webSearchStepperDiv) {
                webSearchStepperDiv.remove();
                webSearchStepperDiv = null;
            }

            // Remove loading and create answerDiv on first chunk
            if (!answerDiv) {
                const root = luminaShadowRoot || document;
                const loadingEl = root.getElementById(loadingId);
                const versionContainer = loadingEl ? loadingEl.closest('.lumina-answer-version') : null;
                const entryElement = loadingEl ? loadingEl.closest('.lumina-dict-entry') : null;
                const entryType = entryElement ? entryElement.dataset.entryType : null;

                let existingBlock = null;
                if (loadingEl && loadingEl.parentElement.classList.contains('lumina-translation-block')) {
                    existingBlock = loadingEl.parentElement;
                }

                removeElementById(loadingId);

                if (versionContainer && (entryType === 'translation' || entryType === 'lookup')) {
                    isTranslationRegenerate = true;
                    let blockDiv;
                    if (existingBlock) {
                        blockDiv = existingBlock;
                        blockDiv.innerHTML = '';
                    } else {
                        blockDiv = document.createElement('div');
                        blockDiv.className = 'lumina-translation-block';
                        versionContainer.appendChild(blockDiv);
                    }
                    blockDiv.innerHTML = `<div class="lumina-translation-target"><div class="lumina-translation-text"></div></div>`;
                    answerDiv = blockDiv.querySelector('.lumina-translation-text');
                } else {
                    answerDiv = document.createElement('div');
                    answerDiv.className = 'lumina-chat-answer lumina-fade-in';
                    if (options.isContentEditable) {
                        answerDiv.contentEditable = 'true';
                        answerDiv.spellcheck = false;
                        answerDiv.style.outline = 'none';
                        answerDiv.style.borderRadius = '8px';
                        answerDiv.style.backgroundColor = 'var(--lumina-bg-secondary)';
                    }

                    if (versionContainer) {
                        versionContainer.appendChild(answerDiv);
                    } else {
                        const history = currentPopup.querySelector('.lumina-chat-history');
                        let lastEntry = getLastHistoryDictEntry(history);
                        if (lastEntry) {
                            // Ensure answer is BEFORE separator if finalizeStream/onDisconnect ran early
                            const existingSep = lastEntry.querySelector('.lumina-dict-separator');
                            if (existingSep) {
                                lastEntry.insertBefore(answerDiv, existingSep);
                            } else {
                                lastEntry.appendChild(answerDiv);
                            }
                        } else {
                            history.appendChild(answerDiv);
                        }
                    }
                }
            }

            if (answerDiv) answerDiv.setAttribute('data-raw-text', fullAnswer);

            if (typeof marked !== 'undefined') {
                let displayAnswer = fullAnswer.replace(/\{"tool"\s*:\s*"search_web"\s*,\s*"args"\s*:\s*\{[^}]+\}\s*\}/g, '');
                try {
                    displayAnswer = displayAnswer.replace(/([\p{L}])(\d)/gu, '$1 $2').replace(/(\d)([\p{L}])/gu, '$1 $2');
                } catch (e) {
                    displayAnswer = displayAnswer.replace(/([a-zA-Z\u00C0-\u024F\u1E00-\u1EFF])(\d)/g, '$1 $2').replace(/(\d)([a-zA-Z\u00C0-\u024F\u1E00-\u1EFF])/g, '$1 $2');
                }

                let thinkingContent = '';
                let actualAnswer = displayAnswer;
                const thinkMatch = displayAnswer.match(/<think>([\s\S]*?)(<\/think>|$)/i);

                if (thinkMatch) {
                    thinkingContent = thinkMatch[1].trim();
                    const isThinkingComplete = thinkMatch[2] === '</think>';
                    actualAnswer = displayAnswer.replace(/<think>[\s\S]*?(<\/think>|$)/gi, '').trim();
                    if (!actualAnswer && thinkingContent && isThinkingComplete) {
                        actualAnswer = thinkingContent;
                        thinkingContent = '';
                    }

                    if (thinkingContent) {
                        let thinkingContainer = answerDiv.querySelector('.lumina-thinking-container');
                        if (!thinkingContainer) {
                            thinkingContainer = document.createElement('div');
                            thinkingContainer.className = 'lumina-thinking-container thinking collapsed';
                            thinkingContainer.innerHTML = `<div class="lumina-thinking-header"><div class="lumina-thinking-icon"><svg viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg></div><span class="lumina-thinking-label">Model Thoughts</span></div><div class="lumina-thinking-content"></div>`;
                            answerDiv.insertBefore(thinkingContainer, answerDiv.firstChild);
                            thinkingContainer.querySelector('.lumina-thinking-header').addEventListener('click', () => thinkingContainer.classList.toggle('collapsed'));
                            setTimeout(() => thinkingContainer.classList.add('appeared'), 350);
                        }
                        thinkingContainer.querySelector('.lumina-thinking-content').textContent = thinkingContent;
                        if (isThinkingComplete) thinkingContainer.classList.remove('thinking');
                    }
                }

                const safeAnswer = preprocessMathContent(actualAnswer);
                let htmlContent = marked.parse(capitalizeText(safeAnswer));

                if (webSearchSources.length > 0) {
                    htmlContent = htmlContent.replace(/\[(\d+)\]/g, (match, num) => {
                        const source = webSearchSources[parseInt(num) - 1];
                        if (source) {
                            const escapedTitle = (source.title || 'Source').replace(/"/g, '&quot;');
                            const escapedSnippet = (source.snippet || '').replace(/"/g, '&quot;');
                            const escapedUrl = source.displayLink || source.link;
                            return `<a href="${source.link}" target="_blank" rel="noopener noreferrer" class="lumina-citation" data-source="${num}" data-title="${escapedTitle}" data-url="${escapedUrl}" data-snippet="${escapedSnippet}">${num}</a>`;
                        }
                        return match;
                    });
                }

                if (isTranslationRegenerate) {
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = htmlContent;
                    answerDiv.textContent = tempDiv.textContent.trim();
                } else {
                    let answerContentDiv = answerDiv.querySelector('.lumina-answer-content');
                    if (!answerContentDiv) {
                        answerContentDiv = document.createElement('div');
                        answerContentDiv.className = 'lumina-answer-content';
                        answerDiv.appendChild(answerContentDiv);
                    }
                    answerContentDiv.innerHTML = htmlContent;
                    answerContentDiv.querySelectorAll('a:not(.lumina-citation)').forEach(link => {
                        link.target = '_blank';
                        link.rel = 'noopener noreferrer';
                    });
                }
            } else {
                if (isTranslationRegenerate) {
                    answerDiv.textContent = capitalizeText(fullAnswer).trim();
                } else {
                    let answerContentDiv = answerDiv.querySelector('.lumina-answer-content');
                    if (!answerContentDiv) {
                        answerContentDiv = document.createElement('div');
                        answerContentDiv.className = 'lumina-answer-content';
                        answerDiv.appendChild(answerContentDiv);
                    }
                    answerContentDiv.textContent = capitalizeText(fullAnswer);
                }
            }

            if (preservedScrollTop !== null && chunkScrollContainer) {
                chunkScrollContainer.scrollTop = preservedScrollTop;
            } else if (autoFollow) {
                scrollToBottom();
            }

            updateThrottled = false;
            if (pendingChunkUpdate) {
                pendingChunkUpdate = false;
                requestAnimationFrame(renderChunkUI);
            }
        };

        const maybeScrollToElement = (element, force = false) => {
            if (!element) return;
            if (force || autoFollow) scrollToElement(element);
        };

        const scheduleLowPriority = (task, timeout = 320) => {
            if (typeof task !== 'function') return;
            if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
                window.requestIdleCallback(() => task(), { timeout });
                return;
            }
            setTimeout(task, 24);
        };

        const showNavContainer = () => {
            if (answerDiv) {
                const nav = answerDiv.closest('.lumina-dict-entry')?.querySelector('.lumina-answer-nav');
                if (nav) nav.style.display = 'flex';
            } else {
                // If answerDiv wasn't created yet (stopped early), find it via loadingId parent
                const root = luminaShadowRoot || document;
                const loadingEl = root.getElementById(loadingId);
                const nav = loadingEl?.closest('.lumina-dict-entry')?.querySelector('.lumina-answer-nav');
                if (nav) nav.style.display = 'flex';
            }
        };


        // Send structured conversation data
        const safeOptions = options || {};
        port.postMessage({
            action: safeOptions.action || 'chat_stream',
            messages: contextData.messages || [],
            initialContext: contextData.initialContext || "",
            hasTranscriptForVideoId: contextData.hasTranscriptForVideoId || null,
            question: question,
            imageData: (Array.isArray(fileData) && fileData.length > 0) ? fileData : null
        });

        // Show stop button with abort callback
        showStopButton(() => {
            port.disconnect();
            removeElementById(loadingId);
        });

        bindStreamScrollGuard();

        port.onMessage.addListener((msg) => {
            bindStreamScrollGuard();

            if (msg.error) {
                // Check if loading element is inside a version container (regenerate case)
                const root = luminaShadowRoot || document;
                const loadingEl = root.getElementById(loadingId);
                const versionContainer = loadingEl ? loadingEl.closest('.lumina-answer-version') : null;

                removeElementById(loadingId);
                if (!answerDiv) {
                    answerDiv = document.createElement('div');
                    answerDiv.className = 'lumina-chat-answer lumina-fade-in';

                    if (versionContainer) {
                        versionContainer.appendChild(answerDiv);
                    } else {
                        const history = currentPopup.querySelector('.lumina-chat-history');
                        let lastEntry = getLastHistoryDictEntry(history);
                        if (lastEntry) {
                            lastEntry.appendChild(answerDiv);
                        } else {
                            history.appendChild(answerDiv);
                        }
                    }
                }
                answerDiv.textContent = 'Error: ' + msg.error;
                maybeScrollToElement(answerDiv, true);
                port.disconnect();
                hideStopButton();
                unbindStreamScrollGuard();
                resolve();
                return;
            }

            // Handle web search status updates
            if (msg.action === 'web_search_status') {
                // Remove loading on first status
                removeElementById(loadingId);

                // If hideProgress flag is set (Gemini 1-step), just store sources without showing indicator
                if (msg.hideProgress) {
                    if (msg.sources) {
                        webSearchSources = msg.sources;
                    }
                    return;
                }

                const history = currentPopup.querySelector('.lumina-chat-history');
                let lastEntry = getLastHistoryDictEntry(history);

                if (msg.status === 'searching') {
                    // Create simple searching indicator (like "thinking...")
                    if (!webSearchStepperDiv) {
                        webSearchStepperDiv = document.createElement('div');
                        webSearchStepperDiv.className = 'lumina-searching-indicator';
                        webSearchStepperDiv.innerHTML = `<span>Searching...</span>`;
                        // Insert after question
                        if (lastEntry) {
                            const questionDiv = lastEntry.querySelector('.lumina-chat-question');
                            if (questionDiv) {
                                questionDiv.after(webSearchStepperDiv);
                            } else {
                                lastEntry.appendChild(webSearchStepperDiv);
                            }
                        } else {
                            history.appendChild(webSearchStepperDiv);
                        }
                    }
                    maybeScrollToElement(webSearchStepperDiv);
                } else if (msg.status === 'analyzing' || msg.status === 'completed') {
                    // Store sources
                    if (msg.sources) {
                        webSearchSources = msg.sources;
                    }
                    // Remove the searching indicator when results arrive
                    if (webSearchStepperDiv) {
                        webSearchStepperDiv.remove();
                        webSearchStepperDiv = null;
                    }
                } else if (msg.status === 'error') {
                    // Show error briefly then remove
                    if (webSearchStepperDiv) {
                        webSearchStepperDiv.innerHTML = `<span style="color: #FF3B30;">Search failed</span>`;
                        setTimeout(() => {
                            if (webSearchStepperDiv) {
                                webSearchStepperDiv.remove();
                                webSearchStepperDiv = null;
                            }
                        }, 2000);
                    }
                }
                return;
            }

            // Handle YouTube transcript status updates
            if (msg.action === 'youtube_status') {
                removeElementById(loadingId);
                const history = currentPopup.querySelector('.lumina-chat-history');
                let lastEntry = getLastHistoryDictEntry(history);

                if (msg.status === 'fetching') {
                    if (document.getElementById('lumina-youtube-fetching')) return;
                    const fetchingDiv = document.createElement('div');
                    fetchingDiv.id = 'lumina-youtube-fetching';
                    fetchingDiv.className = 'lumina-loading-wrapper';
                    fetchingDiv.innerHTML = `<div class="lumina-fetching-shimmer">Fetching</div>`;

                    if (lastEntry) {
                        const questionDiv = lastEntry.querySelector('.lumina-chat-question');
                        if (questionDiv) {
                            questionDiv.after(fetchingDiv);
                        } else {
                            lastEntry.appendChild(fetchingDiv);
                        }
                    } else {
                        history.appendChild(fetchingDiv);
                    }
                    maybeScrollToElement(fetchingDiv);
                } else if (msg.status === 'ready') {
                    removeElementById('lumina-youtube-fetching');
                    if (msg.transcript) {
                        // Check if a transcript container already exists in the last entry (e.g. on regenerate)
                        if (lastEntry) {
                            const existingContainer = lastEntry.querySelector('.lumina-youtube-transcript-container');
                            if (existingContainer) {
                                existingContainer.remove();
                            }
                        }

                        const container = document.createElement('div');
                        container.className = 'lumina-thinking-container lumina-youtube-transcript-container collapsed appeared';
                        container.dataset.videoId = msg.videoId || '';
                        container.innerHTML = `
                            <div class="lumina-thinking-header">
                                <div class="lumina-thinking-icon">
                                    <svg viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z" fill="currentColor"></path></svg>
                                </div>
                                <span class="lumina-thinking-label">YouTube Transcript</span>
                            </div>
                            <div class="lumina-thinking-content lumina-youtube-transcript-content">${msg.transcript}</div>
                        `;

                        // Toggle collapse/expand — pure CSS-driven like lumina-thinking-container
                        const header = container.querySelector('.lumina-thinking-header');
                        header.addEventListener('click', () => {
                            container.classList.toggle('collapsed');
                        });

                        if (lastEntry) {
                            const questionDiv = lastEntry.querySelector('.lumina-chat-question');
                            if (questionDiv) {
                                questionDiv.after(container);
                            } else {
                                lastEntry.appendChild(container);
                            }
                        } else {
                            history.appendChild(container);
                        }

                        // Re-show main loading indicator (Thinking...)
                        loadingId = appendChatLoading();
                    }
                }
                return;
            }


            if (msg.action === 'chunk') {
                fullAnswer += msg.chunk;

                if (updateThrottled) {
                    pendingChunkUpdate = true;
                    return;
                }

                updateThrottled = true;
                requestAnimationFrame(renderChunkUI);
            } else if (msg.action === 'done') {
                const finalizeStream = () => {
                    const history = currentPopup.querySelector('.lumina-chat-history');
                    const lastEntry = getLastHistoryDictEntry(history);

                    if (lastEntry && !lastEntry.querySelector('.lumina-dict-separator')) {
                        // Skip if inside version container (handled by version UI)
                        const isVersion = lastEntry.querySelector('.lumina-answer-versions');
                        if (!isVersion) {
                            const separator = document.createElement('div');
                            separator.className = 'lumina-dict-separator';
                            lastEntry.appendChild(separator);
                            adjustEntryMargin(lastEntry);
                        }
                    }

                    // Save chat history after response completes
                    if (typeof ChatHistoryManager !== 'undefined') {
                        scheduleLowPriority(() => {
                            ChatHistoryManager.saveCurrentChat().catch(err =>
                                console.error('Failed to save chat after streaming:', err)
                            );
                        }, 500);
                    }

                    port.disconnect();
                    hideStopButton();
                    showNavContainer();

                    // Update cache if it was a translation regeneration
                    if (isTranslationRegenerate && options.sourceText) {
                        const latestTranslation = answerDiv.textContent.trim();
                        chrome.runtime.sendMessage({
                            action: 'update_translation_cache',
                            text: options.sourceText,
                            translation: latestTranslation,
                            targetLang: 'vi' // Default or detected?
                        });
                    }

                    unbindStreamScrollGuard();
                    resolve();
                };

                const doneScrollContainer = getStreamScrollContainer();
                const preservedDoneScrollTop = (!autoFollow && doneScrollContainer)
                    ? doneScrollContainer.scrollTop
                    : null;

                // Add sources list if we have web search sources
                if (answerDiv && webSearchSources.length > 0) {
                    const sourcesDiv = document.createElement('div');
                    sourcesDiv.className = 'lumina-sources';
                    sourcesDiv.innerHTML = `
                        <div class="lumina-sources-title">Sources</div>
                        <div class="lumina-sources-list">
                            ${webSearchSources.map((source, idx) => `
                                <a href="${source.link}" target="_blank" rel="noopener noreferrer" class="lumina-source-item">
                                    <span class="lumina-source-num">${idx + 1}</span>
                                    <div class="lumina-source-info">
                                        <div class="lumina-source-name">${source.title || 'Source'}</div>
                                        <div class="lumina-source-domain">${source.displayLink || new URL(source.link).hostname}</div>
                                    </div>
                                    <svg class="lumina-source-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M7 17L17 7M17 7H7M17 7V17"/>
                                    </svg>
                                </a>
                            `).join('')}
                        </div>
                    `;
                    answerDiv.appendChild(sourcesDiv);
                }

                if (preservedDoneScrollTop !== null && doneScrollContainer) {
                    doneScrollContainer.scrollTop = preservedDoneScrollTop;
                }

                // Run heavy post-processing after stream ends (low-priority)
                if (answerDiv) {
                    const answerSnapshot = answerDiv;
                    scheduleLowPriority(() => {
                        if (!answerSnapshot || !answerSnapshot.isConnected) return;
                        if (typeof LuminaChatUI !== 'undefined' && typeof LuminaChatUI.processContainer === 'function') {
                            LuminaChatUI.processContainer(answerSnapshot);
                            return;
                        }
                        if (typeof hljs !== 'undefined') {
                            answerSnapshot.querySelectorAll('pre code').forEach(block => {
                                try { hljs.highlightElement(block); } catch (e) { }
                            });
                        }
                        if (window.renderMathInElement) {
                            try {
                                window.renderMathInElement(answerSnapshot, {
                                    delimiters: [
                                        { left: '$$', right: '$$', display: true },
                                        { left: '\\(', right: '\\)', display: false },
                                        { left: '\\[', right: '\\]', display: true }
                                    ],
                                    throwOnError: false
                                });
                            } catch (e) { }
                        }
                    }, 260);
                }

                requestAnimationFrame(finalizeStream);
            }
        });

        port.onDisconnect.addListener(() => {
            if (chrome.runtime.lastError) {
                removeElementById(loadingId);
                if (!answerDiv) {
                    answerDiv = document.createElement('div');
                    answerDiv.className = 'lumina-chat-answer lumina-fade-in';
                    const history = currentPopup.querySelector('.lumina-chat-history');
                    let lastEntry = getLastHistoryDictEntry(history);
                    if (lastEntry) {
                        const existingSep = lastEntry.querySelector('.lumina-dict-separator');
                        if (existingSep) {
                            lastEntry.insertBefore(answerDiv, existingSep);
                        } else {
                            lastEntry.appendChild(answerDiv);
                        }
                    } else {
                        history.appendChild(answerDiv);
                    }
                }
                answerDiv.textContent = 'Error: ' + chrome.runtime.lastError.message;
                maybeScrollToElement(answerDiv, true);
            }

            // Centralized cleanup but skip if already resolved by 'done'
            // Check if finalizeStream has already been called (indicated by hideStopButton or similar)
            hideStopButton();
            showNavContainer();
            unbindStreamScrollGuard();

            // Ensure separator even on unexpected disconnects
            const history = currentPopup.querySelector('.lumina-chat-history');
            const lastEntry = getLastHistoryDictEntry(history);
            if (lastEntry && !lastEntry.querySelector('.lumina-dict-separator')) {
                const isVersion = lastEntry.querySelector('.lumina-answer-versions');
                if (!isVersion) {
                    const separator = document.createElement('div');
                    separator.className = 'lumina-dict-separator';
                    lastEntry.appendChild(separator);
                    adjustEntryMargin(lastEntry);
                }
            }

            resolve();
        });
    });
}

function appendChatSeparator() {
    // Legacy function - separators are now added at the end of each entry
    if (isChatMode) return;
    if (!currentPopup) return;

    const history = currentPopup.querySelector('.lumina-chat-history');
    if (history) {
        const sep = document.createElement('div');
        sep.className = 'lumina-dict-separator';
        history.appendChild(sep);
        scrollToElement(sep);
    }
}

// Stop button state management
let currentStopCallback = null;

/**
 * Show stop button (called when streaming starts)
 * @param {Function} onStop - Callback to invoke when stop button is clicked
 */
function showStopButton(onStop = null) {
    if (!currentPopup) return;

    const micBtn = currentPopup.querySelector('#mic-btn') || currentPopup.querySelector('.lumina-mic-btn');
    const regenBtn = currentPopup.querySelector('#lumina-regenerate-btn') || currentPopup.querySelector('.lumina-regenerate-btn');

    // Mic button stays visible now

    if (regenBtn) {
        regenBtn.style.display = 'flex'; // Make visible when generation starts
        regenBtn.classList.add('loading');
        regenBtn.title = 'Stop Generating';
        // Pause Icon
        regenBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>`;

        currentStopCallback = onStop;
    }
}

/**
 * Hide stop button (called when streaming ends)
 */
function hideStopButton() {
    if (!currentPopup) return;

    const micBtn = currentPopup.querySelector('#mic-btn') || currentPopup.querySelector('.lumina-mic-btn');
    const regenBtn = currentPopup.querySelector('#lumina-regenerate-btn') || currentPopup.querySelector('.lumina-regenerate-btn');

    // Mic button stays visible now

    if (regenBtn) {
        regenBtn.style.display = 'flex'; // Ensure stay visible
        regenBtn.classList.remove('loading');
        regenBtn.title = 'Regenerate';
        // Regenerate Icon
        regenBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>`;
    }

    currentStopCallback = null;
}

function appendChatLoading() {
    if (!currentPopup) {
        return null;
    }

    const history = currentPopup.querySelector('.lumina-chat-history');
    if (!history) {
        return null;
    }

    // Clear min-height from all previous entries, but keep it on the current (last) entry
    const currentEntry = getLastHistoryDictEntry(history);
    clearEntryMargins(currentEntry);

    const id = 'lumina-chat-loading-' + Date.now();
    const div = document.createElement('div');
    div.id = id;
    div.innerHTML = getLoadingHTML();

    let targetParent = history;

    // Check if we are currently regenerating (a version container is active without an answer inside it)
    const lastEntry = getLastHistoryDictEntry(history);
    if (lastEntry) {
        const activeVersion = lastEntry.querySelector('.lumina-answer-version.active');
        if (activeVersion) {
            // If there's no answer inside it yet, we place the loading there
            if (!activeVersion.querySelector('.lumina-chat-answer')) {
                const transBlock = activeVersion.querySelector('.lumina-translation-block');
                targetParent = transBlock || activeVersion;
            }
        } else {
            // Normal new question: append loading inside the current entry (not as a sibling),
            // so it appears right below the question even when the entry has min-height set.
            targetParent = lastEntry;
        }
    }

    const existingSep = targetParent.querySelector(':scope > .lumina-dict-separator');
    if (existingSep) {
        targetParent.insertBefore(div, existingSep);
    } else {
        targetParent.appendChild(div);
    }
    // scrollToElement(div); // REMOVED: Loading indicator is not a proper entry, causes incorrect scroll

    return id;
}

function appendImageResult(images, text) {
    if (!currentPopup) return;

    // Clear dynamic margins from previous entries when starting new image result
    clearEntryMargins();

    // Use new structure with lumina-image-card
    const html = `
        <div class="lumina-image-card">
            <div class="lumina-image-query">${text}</div>
            ${generateImageHTML(images)}
        </div>
    `;

    let targetElement = null;

    if (isChatMode) {
        const historyContainer = currentPopup.querySelector('.lumina-chat-history');
        if (historyContainer) {
            const div = document.createElement('div');
            // Use lumina-dict-entry for consistency with renderImagePopup
            div.className = 'lumina-dict-entry lumina-fade-in';
            div.dataset.entryType = 'image-lookup';
            div.innerHTML = html;

            // Add separator at the end
            const separator = document.createElement('div');
            separator.className = 'lumina-dict-separator';
            div.appendChild(separator);

            historyContainer.appendChild(div);
            targetElement = div;

            // Attach click listeners for image preview
            attachImageClickListeners(div);
        }
    } else {
        const div = document.createElement('div');
        div.className = 'lumina-dict-entry lumina-fade-in';
        div.dataset.entryType = 'image-lookup';
        div.innerHTML = html;

        // Add separator at the end
        const separator = document.createElement('div');
        separator.className = 'lumina-dict-separator';
        div.appendChild(separator);

        const container = currentPopup.querySelector('.lumina-chat-history') || currentPopup;
        container.appendChild(div);
        targetElement = div;

        // Attach click listeners for image preview
        attachImageClickListeners(div);
    }
    requestAnimationFrame(() => setInitialEntryHeight(targetElement));

    // Persist image lookup immediately
    if (typeof ChatHistoryManager !== 'undefined') {
        ChatHistoryManager.saveCurrentChat().catch(err =>
            console.error('[History] Failed to save image lookup:', err)
        );
    }
}

// Helper function to attach click listeners for image preview
function attachImageClickListeners(container) {
    const images = container.querySelectorAll('.lumina-image-item');
    images.forEach(img => {
        img.addEventListener('click', (e) => {
            e.stopPropagation();
            const fullUrl = img.dataset.fullUrl || img.src;
            // Pass img.src (thumbnail) as placeholder
            showFilePreview(fullUrl, 'image', img.src);
        });
    });
}

function renderImagePopup(images, text) {
    if (!currentPopup) return;

    currentPopup.classList.add('lumina-with-input');

    currentPopup.innerHTML = getPopupShellHTML(`
        <div class="lumina-dict-entry" data-entry-type="image-lookup">
            <div class="lumina-image-card">
                <div class="lumina-image-query">${text}</div>
                ${generateImageHTML(images)}
            </div>
            <div class="lumina-dict-separator"></div>
        </div>
    `, false);

    // Attach click listeners for image preview
    attachImageClickListeners(currentPopup);

    attachChatInputListeners(currentPopup, text);
    attachPopupSidebarListeners(currentPopup);
    updatePopupPosition();
    addWindowControls(currentPopup);
}

function generateImageHTML(images) {
    if (!images || images.length === 0) {
        return `<div class="lumina-image-container">
            <p style="color: var(--lumina-text-secondary); font-size: 0.9em; padding: 8px 0; margin: 0;">No images found</p>
        </div>`;
    }

    let html = '<div class="lumina-image-container">';
    images.forEach(img => {
        const full = img.link;
        const thumb = img.thumbnail;
        const displaySrc = full || thumb || img;
        const fullSrc = full || thumb || img;
        const title = (img.title || 'Image result').replace(/"/g, '&quot;');

        // Smart error handling: Fallback to thumbnail if full image fails, otherwise hide
        let errorHandler = "this.style.display='none';";
        if (full && thumb && full !== thumb) {
            errorHandler = `this.onerror=null; this.src='${thumb}';`;
        }

        html += `<img src="${displaySrc}" class="lumina-image-item" alt="${title}" title="${title}" data-full-url="${fullSrc}" onerror="${errorHandler}">`;
    });
    html += '</div>';
    return html;
}

function retryLastQuestion() {
    if (!lastQuestion || !currentContext || !currentPopup) return;

    const history = currentPopup.querySelector('.lumina-chat-history');
    if (!history) return;

    // Find the last question element
    const questions = history.querySelectorAll('.lumina-chat-question');
    if (questions.length === 0) return;

    const lastQEl = questions[questions.length - 1];

    // Remove everything from the last question onwards
    let next = lastQEl.nextSibling;
    while (next) {
        const toRemove = next;
        next = next.nextSibling;
        toRemove.remove();
    }
    lastQEl.remove();

    // Resubmit the question
    handleChatSubmit(lastQuestion, currentContext);
}

// --- Spotlight Functions ---

function showSpotlight() {
    // If popup already exists, just focus its input
    if (currentPopup) {
        const existingInput = currentPopup.querySelector('.lumina-chat-input');
        if (existingInput) {
            existingInput.focus();
        }
        return;
    }

    // Show full chat popup with empty context
    showChatPopup('');

    // Focus the input after popup is created
    setTimeout(() => {
        if (currentPopup) {
            const input = currentPopup.querySelector('.lumina-chat-input');
            if (input) {
                // Reset height to default before focus to prevent stale scrollHeight issues
                input.style.height = '';
                input.focus();
            }


        }
    }, 50);
}

function removeSpotlight() {
    const overlay = luminaShadowRoot ? luminaShadowRoot.querySelector('.lumina-spotlight-overlay') : null;
    if (overlay) {
        overlay.style.opacity = '0';
        setTimeout(() => {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        }, 200);
    }
}

function handleSpotlightSubmit(text, imageData = null) {
    const overlay = luminaShadowRoot ? luminaShadowRoot.querySelector('.lumina-spotlight-overlay') : null;
    const input = overlay ? overlay.querySelector('.lumina-chat-input') : null;
    let startRect = null;
    if (input) {
        startRect = input.getBoundingClientRect();
    }

    removeSpotlight();

    // Open Popup in Center Mode (General Chat)
    currentRange = null; // Ensure updatePopupPosition centers it
    showContextualChatPopup(null, text, true, startRect, imageData, 'chat');
}

function showProofreadSpotlight(initialText = "") {
    if (luminaShadowRoot && luminaShadowRoot.querySelector('.lumina-spotlight-overlay')) return;

    // Remove existing popup if any
    removePopup();

    chrome.storage.local.get(['popupWidth', 'fontSizeByDomain'], (items) => {
        const width = (items.popupWidth || 380) - 32;
        const currentDomain = window.location.hostname;
        // Use domain-specific font size or default 13px
        const fontSize = (items.fontSizeByDomain && items.fontSizeByDomain[currentDomain])
            ? items.fontSizeByDomain[currentDomain]
            : 13;

        const overlay = document.createElement('div');
        overlay.className = 'lumina-spotlight-overlay';
        overlay.style.setProperty('font-size', (fontSize / getPageZoom()) + 'px', 'important');

        // Use shared input HTML
        overlay.innerHTML = `
            <div class="lumina-spotlight-wrapper" style="width: ${width}px;">
                ${getChatInputHTML(true)}
            </div>
        `;

        initShadowDOM();
        luminaShadowRoot.appendChild(overlay);
        overlay.style.pointerEvents = 'auto';

        const wrapper = overlay.querySelector('.lumina-chat-input-wrapper');
        if (wrapper) {
            wrapper.style.position = 'static';
            wrapper.style.padding = '0';
        }

        const container = overlay.querySelector('.lumina-spotlight-wrapper');
        const input = container.querySelector('.lumina-chat-input');

        if (input) {
            input.placeholder = "Enter text to proofread...";
            if (initialText) {
                // Bug fix: prevent CSS variables from being dumped into input
                if (initialText.includes('--lumina-') && initialText.includes(':root')) {
                    input.value = '';
                } else {
                    input.value = initialText;
                    // Adjust height
                    setTimeout(() => {
                        input.style.height = 'auto';
                        input.style.height = (input.scrollHeight) + 'px';
                    }, 0);
                }
            }
        }

        // Custom submit handler
        const onSubmit = async (text, imageData) => {
            handleProofreadSpotlightSubmit(text);
        };

        attachChatInputListeners(container, null, onSubmit);

        // Auto-submit if there's initial text
        if (initialText && initialText.trim().length > 0) {
            setTimeout(() => {
                handleProofreadSpotlightSubmit(initialText);
            }, 100);
        }

        // Close on click outside
        overlay.addEventListener('click', (e) => {
            e.stopPropagation();
            if (e.target === overlay) {
                removeSpotlight();
            }
        });

        // Prevent ALL events from bubbling to page
        overlay.addEventListener('keydown', (e) => { e.stopPropagation(); });
        overlay.addEventListener('keyup', (e) => { e.stopPropagation(); });
        overlay.addEventListener('keypress', (e) => { e.stopPropagation(); });
        overlay.addEventListener('input', (e) => { e.stopPropagation(); });
        overlay.addEventListener('mousedown', (e) => { e.stopPropagation(); });
        overlay.addEventListener('mouseup', (e) => { e.stopPropagation(); });

        // Handle Escape
        if (input) {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    removeSpotlight();
                    return;
                }
                e.stopPropagation();
            });

            // Auto focus input
            setTimeout(() => {
                input.focus();
                if (initialText) {
                    input.select(); // Select all text for easy replacement
                }
            }, 50);
        }
    });
}

function handleProofreadSpotlightSubmit(text) {
    const overlay = document.querySelector('.lumina-spotlight-overlay');
    const input = overlay ? overlay.querySelector('.lumina-chat-input') : null;
    let startRect = null;
    if (input) {
        startRect = input.getBoundingClientRect();
    }

    removeSpotlight();

    currentRange = null;
    // Pass 'proofread' as actionType
    showContextualChatPopup(null, text, true, startRect, null, 'proofread');
}

// Handle proofread from toggle button (chat mode with proofread toggle enabled)
async function handleProofreadToggleSubmit(text) {
    if (!currentPopup) return;
    const history = currentPopup.querySelector('.lumina-chat-history');
    if (!history) return;

    // Clear margins from previous entries
    clearEntryMargins();

    // 1. Append User Question (styled as normal question but tagged as proofread)
    appendChatEntry('question', text, null, 'proofread');

    // 2. Append Loading
    const loadingId = appendChatLoading();

    // 3. For proofread, send ONLY the text — no conversation history.
    //    Including prior messages confuses the model and causes it to answer
    //    as a regular chat instead of proofreading.
    const contextData = { messages: [], initialContext: "" };

    // 4. Trigger streaming with proofread action
    try {
        await streamChatResponse(contextData, text, loadingId, null, {
            action: 'proofread',
            isContentEditable: true
        });

        // Save history
        if (typeof ChatHistoryManager !== 'undefined') {
            await ChatHistoryManager.saveCurrentChat();
        }
    } catch (err) {
        console.error('[Lumina] Streaming proofread failed:', err);
        const loadingEl = document.getElementById(loadingId);
        if (loadingEl) {
            loadingEl.innerHTML = `<div class="lumina-chat-answer" style="color:var(--lumina-error)">Error: ${err.message}</div>`;
        }
    }
}





async function handleProofreadChatAction(text, loadingId) {
    const contextData = gatherFullContext();
    try {
        await streamChatResponse(contextData, text, loadingId, null, {
            action: 'proofread',
            isContentEditable: true
        });

        if (typeof ChatHistoryManager !== 'undefined') {
            await ChatHistoryManager.saveCurrentChat();
        }
    } catch (err) {
        console.error('[Lumina] Streaming proofread action failed:', err);
        const loadingEl = document.getElementById(loadingId);
        if (loadingEl) {
            loadingEl.innerHTML = `<div class="lumina-chat-answer" style="color:var(--lumina-error)">Error: ${err.message}</div>`;
        }
    }
}

// Handle proofread follow-up (instruction to modify previous proofread result)
async function handleProofreadFollowUp(instruction) {
    if (!currentPopup) return;

    const history = currentPopup.querySelector('.lumina-chat-history');
    if (!history) return;

    // Find the last assistant answer (which should be the one to modify)
    const answers = history.querySelectorAll('.lumina-chat-answer');
    if (answers.length === 0) {
        handleProofreadSpotlightSubmit(instruction);
        return;
    }

    // append as new turn
    appendChatEntry('question', instruction, null, 'proofread');
    const loadingId = appendChatLoading();
    const contextData = gatherFullContext();

    try {
        await streamChatResponse(contextData, instruction, loadingId, null, {
            action: 'proofread',
            isContentEditable: true
        });

        if (typeof ChatHistoryManager !== 'undefined') {
            await ChatHistoryManager.saveCurrentChat();
        }
    } catch (err) {
        console.error('[Lumina] Streaming proofread follow-up failed:', err);
        const loadingEl = document.getElementById(loadingId);
        if (loadingEl) {
            loadingEl.innerHTML = `<div class="lumina-chat-answer" style="color:var(--lumina-error)">Error: ${err.message}</div>`;
        }
    }
}


function addWindowControls(popup) {
    if (!popup) return;

    // Ensure DRAG HANDLE exists (might have been wiped by innerHTML)
    if (!popup.querySelector('.lumina-drag-handle')) {
        const dragHandle = document.createElement('div');
        dragHandle.className = 'lumina-drag-handle';
        popup.appendChild(dragHandle);
    }

    // Check if controls already exist
    if (popup.querySelector('.lumina-window-controls')) return;

    // Scroll behavior logic removed - input now always visible

    const controls = document.createElement('div');
    controls.className = 'lumina-window-controls';
    controls.innerHTML = `
        <div class="lumina-window-btn lumina-btn-close">
            <svg viewBox="0 0 24 24"><path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </div>
    `;
    popup.appendChild(controls);

    const closeBtn = controls.querySelector('.lumina-btn-close');
    closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        removePopup();
    });

    // Note: minimize and new buttons removed per design request

    // Regenerate button — wired via event delegation on the popup so it still works
    // after the popup content is replaced (e.g. history restore).
    popup.addEventListener('click', (e) => {
        const btn = e.target.closest('#lumina-regenerate-btn, .lumina-regenerate-btn');
        if (!btn) return;
        // Only handle if not acting as a stop button
        if (btn.dataset.mode === 'stop') return;
        e.stopPropagation();
        triggerRegenerate();
    });

    // Shortcut: Click inside popup to reset (if matches shortcut)
    popup.addEventListener('mousedown', async (e) => {
        if (matchesShortcut(e, 'resetChat')) {
            // Prevent default click actions if it was a meaningful shortcut action
            e.preventDefault();
            e.stopPropagation();
            await resetChatFunc(popup);
        }
    });

    // Add resize handles for all 8 directions (sides + corners)
    const directions = ['n', 'e', 's', 'w', 'ne', 'se', 'sw', 'nw'];

    if (!popup.querySelector('.lumina-resize-handle')) {
        directions.forEach(dir => {
            const handle = document.createElement('div');
            handle.className = `lumina-resize-handle lumina-resize-${dir}`;
            handle.dataset.dir = dir;
            popup.appendChild(handle);

            handle.addEventListener('mousedown', function initResize(e) {
                e.preventDefault();
                e.stopPropagation();
                let isResizing = true;
                let currentDir = e.target.dataset.dir;
                let startX = e.clientX, startY = e.clientY;
                const rect = popup.getBoundingClientRect();
                let startWidth = rect.width, startHeight = rect.height;
                let startTop = rect.top, startLeft = rect.left;

                popup.style.transition = 'none';
                popup.style.transform = 'none';
                popup.classList.remove('lumina-popup-expand');
                popup.style.setProperty('top', startTop + 'px', 'important');
                popup.style.setProperty('left', startLeft + 'px', 'important');
                popup.style.bottom = 'auto';
                popup.style.right = 'auto';

                function handleResize(ev) {
                    if (!isResizing) return;
                    const deltaX = ev.clientX - startX;
                    const deltaY = ev.clientY - startY;
                    const MIN_W = 200, MIN_H = 200;
                    const MAX_W = Math.min(800, window.innerWidth - 40);
                    const MAX_H = Math.min(800, window.innerHeight - 40);
                    let w = startWidth, h = startHeight, t = startTop, l = startLeft;
                    if (currentDir.includes('e')) w = Math.min(Math.max(startWidth + deltaX, MIN_W), MAX_W);
                    else if (currentDir.includes('w')) {
                        w = Math.min(Math.max(startWidth - deltaX, MIN_W), MAX_W);
                        l = startLeft + (startWidth - w);
                    }
                    if (currentDir.includes('s')) h = Math.min(Math.max(startHeight + deltaY, MIN_H), MAX_H);
                    else if (currentDir.includes('n')) {
                        h = Math.min(Math.max(startHeight - deltaY, MIN_H), MAX_H);
                        t = startTop + (startHeight - h);
                    }
                    popup.style.setProperty('width', w + 'px', 'important');
                    popup.style.setProperty('height', h + 'px', 'important');
                    popup.style.setProperty('min-width', w + 'px', 'important');
                    popup.style.setProperty('max-width', w + 'px', 'important');
                    popup.style.setProperty('min-height', h + 'px', 'important');
                    popup.style.setProperty('max-height', h + 'px', 'important');
                    popup.style.setProperty('left', l + 'px', 'important');
                    popup.style.setProperty('top', t + 'px', 'important');
                }
                function stopResize() {
                    isResizing = false;
                    popup.style.transition = '';
                    document.removeEventListener('mousemove', handleResize);
                    document.removeEventListener('mouseup', stopResize);
                    const zoom = getPageZoom();
                    chrome.storage.local.get(['popupDimensionsByDomain'], (items) => {
                        const dims = items.popupDimensionsByDomain || {};
                        dims[window.location.hostname] = { width: Math.round(popup.offsetWidth * zoom), height: Math.round(popup.offsetHeight * zoom) };
                        chrome.storage.local.set({ popupDimensionsByDomain: dims });
                    });
                }
                document.addEventListener('mousemove', handleResize);
                document.addEventListener('mouseup', stopResize);
            });
        });
    }

    if (popup._hasPopupListeners) return;
    popup._hasPopupListeners = true;

    popup.addEventListener('click', (e) => {
        const btn = e.target.closest('#lumina-regenerate-btn, .lumina-regenerate-btn');
        if (!btn || btn.dataset.mode === 'stop') return;
        e.stopPropagation();
        triggerRegenerate();
    });

    popup.addEventListener('mousedown', async (e) => {
        if (matchesShortcut(e, 'resetChat')) {
            e.preventDefault(); e.stopPropagation();
            await resetChatFunc(popup);
        }
    });
}

function minimizePopup() {
    if (!currentPopup || isMinimized) return;

    // Store current position so we can restore to same spot
    const rect = currentPopup.getBoundingClientRect();
    minimizedPosition = {
        top: rect.top,
        left: rect.left,
        height: rect.height,
        width: rect.width
    };

    // Hide popup instantly — no transition
    currentPopup.style.setProperty('transition', 'none', 'important');
    currentPopup.style.setProperty('opacity', '0', 'important');
    currentPopup.style.setProperty('pointer-events', 'none', 'important');
    currentPopup.style.setProperty('visibility', 'hidden', 'important');

    isMinimized = true;
    stopPopupTracking(); // Stop updating position when minimized

    // Show restore bar
    createRestoreBar();
}

function createRestoreBar() {
    if (isExtensionDisabled) return;
    // Remove existing bar if any
    if (restoreBar) {
        restoreBar.remove();
    }

    restoreBar = document.createElement('div');
    restoreBar.className = 'lumina-restore-bar';
    restoreBar.style.pointerEvents = 'auto';

    initShadowDOM();
    luminaShadowRoot.appendChild(restoreBar);

    // Click to restore
    restoreBar.addEventListener('click', () => restorePopup(false));
}

function restorePopup(toNewPosition = false) {
    // If no popup exists, create it (happens when clicking restore bar on page load)
    if (!currentPopup) {
        if (restoreBar) {
            restoreBar.remove();
            restoreBar = null;
        }

        showChatPopup('');

        isMinimized = false;
        startPopupTracking(); // Start position tracking again
        return;
    }

    if (!isMinimized) return;

    // Remove restore bar instantly
    if (restoreBar) {
        restoreBar.remove();
        restoreBar = null;
    }

    // No transition
    currentPopup.style.setProperty('transition', 'none', 'important');

    // Set position FIRST (before making visible to avoid flash at old position)
    if (toNewPosition) {
        popupDirection = null; // Reset to allow re-calculation based on new space
        updatePopupPosition();
    } else if (minimizedPosition) {
        currentPopup.style.setProperty('top', minimizedPosition.top + 'px', 'important');
        currentPopup.style.setProperty('left', minimizedPosition.left + 'px', 'important');
        currentPopup.style.setProperty('transform', 'none', 'important');
        currentPopup.style.setProperty('bottom', 'auto', 'important');
    }

    // Now reveal — position is already correct, no flash
    currentPopup.style.setProperty('opacity', '1', 'important');
    currentPopup.style.setProperty('pointer-events', 'auto', 'important');
    currentPopup.style.setProperty('visibility', 'visible', 'important');

    isMinimized = false;
    minimizedPosition = null;
    startPopupTracking(); // Resume position tracking after restoration

    // Focus chat input and place cursor at end
    requestAnimationFrame(() => {
        const chatInput = currentPopup.querySelector('textarea.lumina-chat-input');
        if (chatInput) {
            chatInput.focus();
            const len = chatInput.value.length;
            chatInput.setSelectionRange(len, len);
        }
    });
}


function makeDraggable(popup) {
    if (!popup || popup._hasDragListeners) return;
    popup._hasDragListeners = true;

    // Drag-related state local to the popup instance
    let dragStartX, dragStartY, initialLeft, initialTop;
    let lastMouseX, lastMouseY, lastMoveTime;
    let velocityX = 0, velocityY = 0;
    let lastHandleState = null;

    document.addEventListener('mousemove', (e) => {
        if (isDragging) return;
        if (!popup.isConnected) return;

        const rect = popup.getBoundingClientRect();
        const yOffset = e.clientY - rect.top;
        const xInside = e.clientX >= rect.left && e.clientX <= rect.right;
        const inTopArea = yOffset >= 0 && yOffset <= 30 && xInside;

        const handle = popup.querySelector('.lumina-drag-handle');
        if (!handle) return;

        if (!inTopArea) {
            if (handle.style.pointerEvents !== 'none') {
                handle.style.pointerEvents = 'none';
                lastHandleState = null;
            }
            return;
        }

        handle.style.pointerEvents = 'none';
        const elementUnder = document.elementFromPoint(e.clientX, e.clientY);

        let shouldActivate = true;
        if (elementUnder) {
            const cur = window.getComputedStyle(elementUnder).cursor;
            const isInteractive = elementUnder.tagName === 'BUTTON' ||
                elementUnder.tagName === 'INPUT' ||
                elementUnder.tagName === 'TEXTAREA' ||
                !!elementUnder.closest('.lumina-window-btn');
            if (cur === 'text' || isInteractive) shouldActivate = false;
        }

        if (shouldActivate !== lastHandleState) {
            lastHandleState = shouldActivate;
        }
        handle.style.pointerEvents = shouldActivate ? 'auto' : 'none';
    });

    popup.addEventListener('mousedown', (e) => {
        const rect = popup.getBoundingClientRect();
        const isTopArea = (e.clientY - rect.top) <= 30;
        const isInteractive = e.target.tagName === 'BUTTON' ||
            e.target.tagName === 'INPUT' ||
            e.target.tagName === 'TEXTAREA' ||
            e.target.closest('.lumina-window-btn');
        const targetCursor = window.getComputedStyle(e.target).cursor;

        if (isTopArea && !isInteractive && targetCursor !== 'text') {
            isDragging = true;
            dragStartX = e.clientX;
            dragStartY = e.clientY;
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;
            lastMoveTime = performance.now();
            velocityX = 0;
            velocityY = 0;
            initialLeft = rect.left;
            initialTop = rect.top;

            popup.style.transform = 'none';
            popup.style.setProperty('left', initialLeft + 'px', 'important');
            popup.style.setProperty('top', initialTop + 'px', 'important');
            popup.style.bottom = 'auto';
            popup.style.right = 'auto';
            popup.style.transition = 'none';
            e.preventDefault();
        }
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging || !popup.isConnected) return;

        const now = performance.now();
        const dt = now - lastMoveTime;
        if (dt > 0) {
            velocityX = (e.clientX - lastMouseX) / dt * 16;
            velocityY = (e.clientY - lastMouseY) / dt * 16;
        }
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        lastMoveTime = now;

        const dx = e.clientX - dragStartX;
        const dy = e.clientY - dragStartY;
        popup.style.setProperty('left', (initialLeft + dx) + 'px', 'important');
        popup.style.setProperty('top', (initialTop + dy) + 'px', 'important');
    });

    document.addEventListener('mouseup', () => {
        if (isDragging && popup.isConnected) {
            isDragging = false;
            const rect = popup.getBoundingClientRect();
            const windowWidth = document.documentElement.clientWidth;
            const windowHeight = document.documentElement.clientHeight;
            const margin = 5;

            let targetLeft = rect.left;
            let targetTop = rect.top;
            let needsBounce = false;

            if (rect.left < margin) { targetLeft = margin; needsBounce = true; }
            else if (rect.right > windowWidth - margin) { targetLeft = windowWidth - rect.width - margin; needsBounce = true; }
            if (rect.top < margin) { targetTop = margin; needsBounce = true; }
            else if (rect.bottom > windowHeight - margin) { targetTop = windowHeight - rect.height - margin; needsBounce = true; }

            if (needsBounce) {
                const stiffness = 0.06, damping = 0.75;
                let posX = rect.left, posY = rect.top;
                let velX = velocityX * 0.5, velY = velocityY * 0.5;

                function springStep() {
                    const forceX = (targetLeft - posX) * stiffness;
                    const forceY = (targetTop - posY) * stiffness;
                    velX = (velX + forceX) * damping;
                    velY = (velY + forceY) * damping;
                    posX += velX; posY += velY;
                    popup.style.setProperty('left', posX + 'px', 'important');
                    popup.style.setProperty('top', posY + 'px', 'important');
                    if (Math.abs(targetLeft - posX) < 0.5 && Math.abs(targetTop - posY) < 0.5 && Math.sqrt(velX * velX + velY * velY) < 0.5) {
                        popup.style.setProperty('left', targetLeft + 'px', 'important');
                        popup.style.setProperty('top', targetTop + 'px', 'important');
                    } else { requestAnimationFrame(springStep); }
                }
                popup.style.transition = 'none';
                requestAnimationFrame(springStep);
            }

            if (!isPinned) {
                isPinned = true;
                popup.classList.add('lumina-pinned');
            }
            savedSpotlightPos = { top: targetTop, left: targetLeft };
            chrome.storage.local.set({ spotlightPosition: savedSpotlightPos });
        }
    });
}

// Ensure popup stays within viewport when window is resized
window.addEventListener('resize', () => {
    if (!currentPopup) return;

    const rect = currentPopup.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const margin = 5;

    let newLeft = rect.left;
    let newTop = rect.top;
    let needsUpdate = false;

    // Clamp to right edge
    if (rect.left + rect.width > viewportWidth - margin) {
        newLeft = Math.max(margin, viewportWidth - rect.width - margin);
        needsUpdate = true;
    }
    // Clamp to left edge
    if (rect.left < margin) {
        newLeft = margin;
        needsUpdate = true;
    }
    // Clamp to bottom edge
    if (rect.top + rect.height > viewportHeight - margin) {
        newTop = Math.max(margin, viewportHeight - rect.height - margin);
        needsUpdate = true;
    }
    // Clamp to top edge
    if (rect.top < margin) {
        newTop = margin;
        needsUpdate = true;
    }

    if (needsUpdate) {
        currentPopup.style.transform = 'none';
        currentPopup.style.left = newLeft + 'px';
        currentPopup.style.top = newTop + 'px';

        // Update saved position if in spotlight mode
        if (!currentRange) {
            savedSpotlightPos = { top: newTop, left: newLeft };
            chrome.storage.local.set({ spotlightPosition: savedSpotlightPos });
        }
    }
});

function showFilePreview(fileSrc, fileType = 'image', placeholderSrc = null) {
    if (!currentPopup) return;

    // Check if viewer already exists
    const existingViewer = currentPopup.querySelector('.lumina-preview-container');
    if (existingViewer) {
        existingViewer.remove();
        currentPopup.classList.remove('lumina-viewing-preview');
    }

    const viewer = document.createElement('div');
    viewer.className = 'lumina-preview-container';

    viewer.addEventListener('click', (e) => {
        if (e.target === viewer || e.target.classList.contains('lumina-preview-content')) {
            viewer.classList.remove('active');
            setTimeout(() => {
                viewer.remove();
                currentPopup.classList.remove('lumina-viewing-preview');
            }, 200);
        }
    });

    const closeBtn = document.createElement('button');
    closeBtn.className = 'lumina-preview-close';
    closeBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="24" height="24">
            <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
        </svg>
    `;
    closeBtn.addEventListener('click', () => {
        viewer.classList.remove('active');
        setTimeout(() => {
            viewer.remove();
            currentPopup.classList.remove('lumina-viewing-preview');
        }, 200);
    });

    const content = document.createElement('div');
    content.className = 'lumina-preview-content';

    // Handle different file types
    if (fileType.startsWith('image/') || fileType === 'image') {
        const img = document.createElement('img');
        img.style.maxWidth = '100%';
        img.style.maxHeight = '100%';
        img.style.objectFit = 'contain';
        img.style.transition = 'transform 0.15s ease-out';
        img.style.cursor = 'zoom-in';
        img.style.userSelect = 'none';
        img.draggable = false;

        if (placeholderSrc) {
            img.src = placeholderSrc;
            img.style.filter = 'blur(10px)';
            const fullImg = new Image();
            fullImg.src = fileSrc;
            fullImg.onload = () => {
                img.src = fileSrc;
                img.style.filter = 'none';
            };
        } else {
            img.src = fileSrc;
        }

        img.alt = 'Preview';

        // Zoom state
        let scale = 1;
        let originX = 50, originY = 50; // percentage
        let isPanning = false;
        let panStartX = 0, panStartY = 0;
        let currentX = 0, currentY = 0;

        const updateTransform = (smooth = true) => {
            img.style.transition = smooth ? 'transform 0.15s ease-out' : 'none';
            img.style.transformOrigin = `${originX}% ${originY}%`;
            img.style.transform = `scale(${scale}) translate(${currentX}px, ${currentY}px)`;
        };

        const resetZoom = () => {
            scale = 1;
            currentX = 0;
            currentY = 0;
            originX = 50;
            originY = 50;
            img.style.cursor = 'zoom-in';
            updateTransform();
        };

        // Get cursor position relative to image as percentage
        const getCursorPercent = (e) => {
            const rect = img.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 100;
            const y = ((e.clientY - rect.top) / rect.height) * 100;
            return { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) };
        };

        // Double-click to zoom in/out at cursor position
        let lastClickTime = 0;
        img.addEventListener('click', (e) => {
            if (isPanning) return;
            e.stopPropagation();

            const now = Date.now();
            const isDoubleClick = (now - lastClickTime) < 300;
            lastClickTime = now;

            if (!isDoubleClick) return;

            if (scale === 1) {
                // Zoom in to 2.5x at cursor position
                const pos = getCursorPercent(e);
                originX = pos.x;
                originY = pos.y;
                scale = 2.5;
                currentX = 0;
                currentY = 0;
                img.style.cursor = 'grab';
            } else {
                // Zoom out
                resetZoom();
            }
            updateTransform();
        });

        // Wheel zoom (pinch or scroll)
        content.addEventListener('wheel', (e) => {
            e.preventDefault();
            e.stopPropagation();

            const pos = getCursorPercent(e);

            // Calculate zoom (slower speed: 1.5% per scroll)
            const zoomFactor = e.deltaY > 0 ? 0.985 : 1.015;
            const newScale = Math.min(5, Math.max(1, scale * zoomFactor));

            if (newScale !== scale) {
                // Update origin to cursor position when starting to zoom
                if (scale === 1) {
                    originX = pos.x;
                    originY = pos.y;
                    currentX = 0;
                    currentY = 0;
                }

                scale = newScale;

                if (scale <= 1) {
                    resetZoom();
                } else {
                    img.style.cursor = 'grab';
                    updateTransform(false);
                }
            }
        }, { passive: false });

        // Pan functionality when zoomed
        img.addEventListener('mousedown', (e) => {
            if (scale <= 1) return;
            e.preventDefault();
            isPanning = false;
            panStartX = e.clientX - currentX;
            panStartY = e.clientY - currentY;
            img.style.cursor = 'grabbing';
            img.style.transition = 'none';

            const onMouseMove = (moveEvent) => {
                isPanning = true;
                // Apply 0.5x damping for slower pan
                const deltaX = (moveEvent.clientX - panStartX) * 0.5;
                const deltaY = (moveEvent.clientY - panStartY) * 0.5;
                currentX = deltaX;
                currentY = deltaY;
                img.style.transform = `scale(${scale}) translate(${currentX}px, ${currentY}px)`;
            };

            const onMouseUp = () => {
                img.style.cursor = scale > 1 ? 'grab' : 'zoom-in';
                img.style.transition = 'transform 0.15s ease-out';
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
                setTimeout(() => { isPanning = false; }, 50);
            };

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });

        // Reset on escape key
        const onKeyDown = (e) => {
            if (e.key === 'Escape' && scale > 1) {
                resetZoom();
            }
        };
        document.addEventListener('keydown', onKeyDown);

        // Cleanup on close
        closeBtn.addEventListener('click', () => {
            document.removeEventListener('keydown', onKeyDown);
        });

        content.appendChild(img);
    } else {
        // For non-image files, use iframe or appropriate viewer
        const iframe = document.createElement('iframe');
        iframe.src = fileSrc;
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.border = 'none';
        content.appendChild(iframe);
    }

    viewer.appendChild(closeBtn);
    viewer.appendChild(content);

    // Append to popup instead of body to keep it inside the popup
    currentPopup.appendChild(viewer);
    currentPopup.classList.add('lumina-viewing-preview');
    requestAnimationFrame(() => viewer.classList.add('active'));
}

function triggerRegenerate() {
    if (!currentPopup) return;

    const history = currentPopup.querySelector('.lumina-chat-history');
    if (!history) return;

    // Find the very last entry
    const lastEntry = history.lastElementChild;
    if (!lastEntry || !lastEntry.classList.contains('lumina-dict-entry')) return;

    const entryType = lastEntry.dataset.entryType;
    let originalQuestion = null;

    let originalQuestionMetadata = {};
    // Priority 1: Translation/Dictionary specific extraction based on entryType
    if (entryType === 'translation') {
        const transSource = lastEntry.querySelector('.lumina-translation-source .lumina-translation-text');
        if (transSource) {
            const sourceText = transSource.textContent.trim();
            originalQuestion = `Translate this text: "${sourceText}"`;
            // Metadata for cache update
            originalQuestionMetadata = { entryType, sourceText };
        }
    } else if (entryType === 'lookup' || entryType === 'entry') {
        const wordEl = lastEntry.querySelector('.lumina-dict-word');
        if (wordEl) {
            const word = wordEl.textContent.trim();
            originalQuestion = `Look up and explain the meaning of: "${word}"`;
        }
    }

    // Priority 2: Q&A, Proofread, Contextual-QA (has question element)
    if (!originalQuestion) {
        const questionEl = lastEntry.querySelector('.lumina-chat-question');
        if (questionEl) {
            originalQuestion = questionEl.textContent.trim();

            // For contextual-qa, include the context
            const contextEl = lastEntry.querySelector('.lumina-chat-context');
            if (contextEl) {
                const ctxText = contextEl.dataset.fullText || contextEl.textContent.trim();
                if (ctxText) {
                    originalQuestion = `[Selected Text Context]: "${ctxText}"\n\n[Question]: ${originalQuestion}`;
                }
            }
        }
    }


    if (!originalQuestion) return;

    handleRegenerate(lastEntry, originalQuestion, originalQuestionMetadata);
}

async function handleRegenerate(entryElement, questionText, options = {}) {
    const _sc = currentPopup?.querySelector('.lumina-chat-scroll-content') || currentPopup;

    // Calculate scroll target from previous entry's separator BEFORE any DOM changes
    let _regenTargetScroll = null;
    if (_sc) {
        const allEntries = _sc.querySelectorAll('.lumina-dict-entry');
        const currentIndex = Array.from(allEntries).indexOf(entryElement);
        if (currentIndex > 0) {
            const prevSeparator = allEntries[currentIndex - 1].querySelector('.lumina-dict-separator');
            if (prevSeparator) {
                const containerRect = _sc.getBoundingClientRect();
                const sepRect = prevSeparator.getBoundingClientRect();
                _regenTargetScroll = sepRect.top - containerRect.top + _sc.scrollTop;
            }
        } else {
            _regenTargetScroll = 0;
        }
    }
    if (_sc) _sc.style.overflowAnchor = 'none';

    // Remove all subsequent entries below this one
    let nextEntry = entryElement.nextSibling;
    while (nextEntry) {
        const toRemove = nextEntry;
        nextEntry = nextEntry.nextSibling;
        toRemove.remove();
    }

    // Remove ALL existing separators before we restructure
    const existingSeparators = entryElement.querySelectorAll('.lumina-dict-separator');
    existingSeparators.forEach(sep => sep.remove());

    // 1. Structural Setup
    let versionsContainer = entryElement.querySelector('.lumina-answer-versions');
    const entryType = entryElement.dataset.entryType;
    const isTranslationEntry = entryType === 'translation' || entryType === 'lookup';

    // If not, migrate existing answer to version system
    if (!versionsContainer) {
        versionsContainer = document.createElement('div');
        versionsContainer.className = 'lumina-answer-versions';

        // Move existing answer into Version 0
        const version0 = document.createElement('div');
        version0.className = 'lumina-answer-version';
        version0.dataset.versionIndex = '0';

        if (isTranslationEntry) {
            // For translation: Clone Target Block content into Version 0
            const targetBlock = entryElement.querySelector('.lumina-translation-card .lumina-translation-block:last-of-type');
            if (targetBlock) {
                const clonedBlock = targetBlock.cloneNode(true);
                clonedBlock.classList.remove('lumina-hidden'); // Ensure cloned is visible
                version0.appendChild(clonedBlock);
                // Replace Target Block with versions container (inside the card)
                targetBlock.replaceWith(versionsContainer);
            } else {
                // Fallback: append to translation card
                const translationCard = entryElement.querySelector('.lumina-translation-card');
                if (translationCard) {
                    translationCard.appendChild(versionsContainer);
                } else {
                    entryElement.appendChild(versionsContainer);
                }
            }
        } else {
            // For chat: Move existing answer
            const existingAnswer = entryElement.querySelector('.lumina-chat-answer');
            if (existingAnswer) {
                existingAnswer.replaceWith(versionsContainer);
                version0.appendChild(existingAnswer);
            } else {
                entryElement.appendChild(versionsContainer);
            }
        }
        versionsContainer.appendChild(version0);
    }

    // 2. Create NEW Version Container
    const currentVersions = versionsContainer.querySelectorAll('.lumina-answer-version');
    const newIndex = currentVersions.length;

    // Create new version wrapper
    const newVersion = document.createElement('div');
    newVersion.className = 'lumina-answer-version active';
    newVersion.dataset.versionIndex = newIndex.toString();

    // Hide others
    currentVersions.forEach(v => v.classList.remove('active'));

    versionsContainer.appendChild(newVersion);

    // 3. Update or Create Nav (always inside versionsContainer at the end)
    let navContainer = entryElement.querySelector('.lumina-answer-nav');
    if (!navContainer) {
        navContainer = document.createElement('div');
        navContainer.className = 'lumina-answer-nav';
        navContainer.innerHTML = `
            <button class="lumina-answer-nav-btn nav-prev" disabled>
                <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
            </button>
            <span class="lumina-answer-nav-counter">1 / 1</span>
            <button class="lumina-answer-nav-btn nav-next" disabled>
                <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
            </button>
        `;

        // Attach listeners
        const prevBtn = navContainer.querySelector('.nav-prev');
        const nextBtn = navContainer.querySelector('.nav-next');

        prevBtn.addEventListener('click', () => showAnswerVersion(entryElement, 'prev'));
        nextBtn.addEventListener('click', () => showAnswerVersion(entryElement, 'next'));
    }

    if (isTranslationEntry) {
        const transContainer = entryElement.querySelector('.lumina-translation-container');
        if (transContainer) {
            transContainer.after(navContainer);
        } else {
            versionsContainer.appendChild(navContainer);
        }
    } else {
        versionsContainer.appendChild(navContainer);
    }
    navContainer.style.display = 'none';

    // Update Nav counter
    updateVersionNav(entryElement, newIndex, newIndex + 1);

    // 4. Add separator AFTER versionsContainer
    let separator = entryElement.querySelector('.lumina-dict-separator');
    if (!separator) {
        separator = document.createElement('div');
        separator.className = 'lumina-dict-separator';
        entryElement.appendChild(separator);
    }

    // 5. Set min-height = viewport (entry fills screen), clear from others, scroll to target
    if (_sc) {
        const viewportHeight = _sc.clientHeight || _sc.offsetHeight;
        if (viewportHeight > 0) {
            _sc.querySelectorAll('.lumina-dict-entry').forEach(e => {
                if (e !== entryElement) e.style.removeProperty('min-height');
            });
            const anySep = _sc.querySelector('.lumina-dict-separator');
            const sepMarginBottom = anySep ? (parseFloat(getComputedStyle(anySep).marginBottom) || 0) : 10;

            entryElement.style.setProperty('min-height', (viewportHeight - sepMarginBottom) + 'px', 'important');
        }
        if (_regenTargetScroll !== null) {
            _sc.scrollTop = _regenTargetScroll;
        }
        _sc.style.overflowAnchor = '';
    }

    // 6. Show Loading inside the new version
    const loadingId = 'lumina-regen-loading-' + Date.now();
    const loadingDiv = document.createElement('div');
    loadingDiv.id = loadingId;
    loadingDiv.innerHTML = getLoadingHTML();

    if (isTranslationEntry) {
        // Wrap loading in translation-block structure for correct padding
        const wrapper = document.createElement('div');
        wrapper.className = 'lumina-translation-block';
        wrapper.appendChild(loadingDiv);
        newVersion.appendChild(wrapper);
    } else {
        newVersion.appendChild(loadingDiv);
    }

    // 7. Trigger Generation
    const contextData = gatherFullContext();
    const promptToSend = questionText;

    await streamChatResponse(contextData, promptToSend, loadingId, null, options);
}

function showAnswerVersion(entryElement, direction) {
    const versions = Array.from(entryElement.querySelectorAll('.lumina-answer-version'));
    const activeIndex = versions.findIndex(v => v.classList.contains('active'));

    if (activeIndex === -1) return;

    let newIndex = activeIndex;
    if (direction === 'prev') newIndex = Math.max(0, activeIndex - 1);
    if (direction === 'next') newIndex = Math.min(versions.length - 1, activeIndex + 1);

    if (newIndex !== activeIndex) {
        versions[activeIndex].classList.remove('active');
        versions[newIndex].classList.add('active');

        updateVersionNav(entryElement, newIndex, versions.length);
    }
}

function updateVersionNav(entryElement, activeIndex, totalCount) {
    const nav = entryElement.querySelector('.lumina-answer-nav');
    if (!nav) return;

    const counter = nav.querySelector('.lumina-answer-nav-counter');
    const prevBtn = nav.querySelector('.nav-prev');
    const nextBtn = nav.querySelector('.nav-next');

    counter.textContent = `${activeIndex + 1} / ${totalCount}`;

    prevBtn.disabled = activeIndex === 0;
    nextBtn.disabled = activeIndex === totalCount - 1;
}

// Listen for image clicks
document.addEventListener('click', (e) => {
    if (isExtensionDisabled) return;

    const target = e.target;

    // Case 1: Chat history images
    if (target.tagName === 'IMG' && target.closest('.lumina-chat-question-files')) {
        showFilePreview(target.src, 'image');
        return;
    }

    // Case 1b: File chips in chat history (non-image files)
    const fileChip = target.closest('.lumina-file-chip');
    if (fileChip && fileChip.closest('.lumina-chat-question-files')) {
        const src = fileChip.dataset.src;
        const filetype = fileChip.dataset.filetype;
        if (filetype && filetype.startsWith('image/')) {
            showFilePreview(src, filetype);
        } else {
            // For non-images, open in new tab or show info
            window.open(src, '_blank');
        }
        return;
    }

    // Case 2: Preview images (uploading)
    if (target.tagName === 'IMG' && target.closest('.lumina-image-preview-item')) {
        showFilePreview(target.src, 'image');
    }
});

function applyThemeToPopup(popup, theme) {
    if (!popup) return;
    const validTheme = theme || 'auto';
    let mode = validTheme;
    if (validTheme === 'auto') {
        mode = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    popup.setAttribute('data-theme', mode);
}

let cachedTheme = null;
function updateTheme() {
    // Strategy: Cache theme to avoid repeated storage reads during streaming/scrolling
    const applyTheme = (theme) => {
        const preferredTheme = theme === 'auto'
            ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
            : theme;

        const isDark = preferredTheme === 'dark';
        if (luminaHost) isDark ? luminaHost.setAttribute('data-theme', 'dark') : luminaHost.removeAttribute('data-theme');
        if (currentPopup) isDark ? currentPopup.setAttribute('data-theme', 'dark') : currentPopup.removeAttribute('data-theme');
        if (askSelectionPopupBtn) isDark ? askSelectionPopupBtn.setAttribute('data-theme', 'dark') : askSelectionPopupBtn.removeAttribute('data-theme');

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
        const activeElement = getDeepActiveElement();
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

initShadowDOM();

async function initAskSelectionPopup() {
    // Wait for styles to be loaded in shadow root
    if (window.luminaStylesLoaded) {
        await window.luminaStylesLoaded;
    }

    // 2. Create Input Container
    askSelectionInputDiv = document.createElement('div');
    askSelectionInputDiv.id = 'lumina-ask-input-popup';
    // Styles are defined in CSS via #lumina-ask-input-popup

    const input = document.createElement('textarea');
    input.placeholder = 'Ask anything...';
    input.className = 'lumina-ask-input-field'; // Use CSS class
    input.rows = 1;

    // Auto-resize handler
    input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = (input.scrollHeight) + 'px';
    });

    // Note: Don't stop propagation - we need the document listener to detect clicks properly

    input.addEventListener('keydown', async (e) => {
        // Stop propagation to prevent site-level shortcuts from overriding input
        e.stopPropagation();
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            const val = input.value.trim();
            if (val && askSelectionText) {
                // UI: "$SelectedText" [Question]
                let displayQuery = `"${askSelectionText}" ${val}`;
                // Backend: "$SelectedText" [Question] ($Container)
                let finalQuery = displayQuery;

                // Use the pre-captured smart context
                const normalize = (s) => s.replace(/\s+/g, ' ').trim();
                const cleanSelection = normalize(askSelectionText);
                const cleanContext = askSelectionContext ? normalize(askSelectionContext) : '';

                if (cleanContext && cleanContext !== cleanSelection) {
                    finalQuery += ` (${askSelectionContext})`;
                }

                hideAskSelectionPopup();

                // Ensure popup exists
                if (!currentPopup) {
                    showChatPopup(askSelectionText);
                } else if (isMinimized) {
                    restorePopup(!isPinned);
                }

                // Use chat logic instead of lookup - pass displayQuery to hide the context from UI
                appendQAChatEntry(finalQuery, displayQuery);
            }
        }
        if (e.key === 'Escape') {
            hideAskSelectionPopup();
        }
    });

    input.addEventListener('keyup', (e) => e.stopPropagation());
    input.addEventListener('keypress', (e) => e.stopPropagation());

    askSelectionInputDiv.appendChild(input);
    askSelectionInputDiv.style.pointerEvents = 'auto'; // Enable interaction
    luminaShadowRoot.appendChild(askSelectionInputDiv);


    // 1. Create Button
    askSelectionPopupBtn = document.createElement('div');
    askSelectionPopupBtn.id = 'lumina-ask-selection-btn';
    askSelectionPopupBtn.style.pointerEvents = 'auto'; // Enable interaction
    askSelectionPopupBtn.innerHTML = `
        <span class="lumina-ask-btn-text">Ask Lumina</span>
    `;
    // Styles are defined in CSS via #lumina-ask-selection-btn

    // Apply User Font Size Setting (with zoom compensation)
    applyAskSelectionStyles();

    // Hover effects are handled by CSS :hover

    // Crucial: Prevent default on mousedown to stop Safari from clearing the text selection
    askSelectionPopupBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
    });

    askSelectionPopupBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showAskInput();
    });

    luminaShadowRoot.appendChild(askSelectionPopupBtn);
}

function showAskInput() {
    console.log('[Lumina Debug] showAskInput called');
    if (!askSelectionPopupBtn || !askSelectionInputDiv) {
        console.error('[Lumina Debug] Missing button or input div');
        return;
    }

    // Fallback: try to save selection if not already saved in showAskSelectionPopup
    if (!askSelectionText) {
        const selection = getActiveSelection(); // Use robust selection finder
        console.log('[Lumina Debug] No saved text, re-capturing. Selection:', selection ? 'found' : 'null');
        askSelectionText = getSmartSelectionText() || (selection ? selection.toString().trim() : '');
        askSelectionContext = getSmartClimbedContext();
        if (selection && selection.rangeCount > 0) {
            currentRange = selection.getRangeAt(0).cloneRange();
            console.log('[Lumina Debug] Recaptured range text:', askSelectionText);
        }
    }

    const btnRect = askSelectionPopupBtn.getBoundingClientRect();
    const targetWidth = 260;
    const windowWidth = window.innerWidth;
    let finalLeft = btnRect.left;
    if (finalLeft + targetWidth > windowWidth - 10) {
        finalLeft = Math.max(10, windowWidth - targetWidth - 10);
    }

    askSelectionInputDiv.style.width = targetWidth + 'px';
    askSelectionInputDiv.style.left = finalLeft + 'px';
    askSelectionInputDiv.style.top = btnRect.top + 'px';

    // Move to end of shadow root so it renders above all siblings
    if (luminaShadowRoot) {
        luminaShadowRoot.appendChild(askSelectionInputDiv);
    }
    askSelectionInputDiv.style.display = 'flex';
    askSelectionPopupBtn.style.display = 'none';

    console.log('[Lumina Debug] Final input position:', finalLeft, 'targetWidth:', targetWidth);

    const input = askSelectionInputDiv.querySelector('.lumina-ask-input-field');
    if (input) {
        input.value = '';
        setTimeout(() => {
            input.focus();
        }, 10);
    }

    startAskPopupScrollTracking();
}

function showAskSelectionPopup(x, y) {
    if (!askSelectionPopupBtn) return;

    // Use selection rect for better positioning "Above text"
    // IMPORTANT: use getActiveSelection() so we also capture shadow DOM selections
    const selection = getActiveSelection();
    let top = y;
    let left = x;

    // IMPORTANT: Save selection text NOW before it gets cleared by clicking the button
    askSelectionText = getSmartSelectionText() || (selection ? selection.toString().trim() : '');
    askSelectionContext = getSmartClimbedContext();

    // Also save range for popup positioning later
    if (selection && selection.rangeCount > 0) {
        currentRange = selection.getRangeAt(0).cloneRange();

        const range = selection.getRangeAt(0);
        const rects = range.getClientRects();

        if (rects.length > 0) {
            const firstRect = rects[0];
            const firstLineTop = firstRect.top;

            // Calculate union rect for the first line (handling nested spans/styles)
            let minLeft = firstRect.left;
            let maxRight = firstRect.right;

            // Check subsequent rects that are on the same visual line
            for (let i = 1; i < rects.length; i++) {
                // If top variance is small (< 4px), assume same line
                if (Math.abs(rects[i].top - firstLineTop) < 5) {
                    minLeft = Math.min(minLeft, rects[i].left);
                    maxRight = Math.max(maxRight, rects[i].right);
                } else {
                    // Stop once we hit a new line
                    break;
                }
            }

            const lineWidth = maxRight - minLeft;
            top = firstLineTop;
            left = minLeft; // Left edge of selection (left-aligned)
        }
    }

    // Measure button dimensions locally
    askSelectionPopupBtn.style.display = 'flex';
    askSelectionPopupBtn.style.visibility = 'hidden';
    const btnWidth = askSelectionPopupBtn.offsetWidth;
    const btnHeight = askSelectionPopupBtn.offsetHeight || 36;

    askSelectionPopupBtn.style.visibility = 'visible';

    const margin = 5;

    // Use the coordinates derived from the selection rect (rects[0]) if available
    // 'top' variable holds rect.top, 'left' variable holds rect.left + width/2

    // Position above, left-aligned with selection
    let finalTop = top - btnHeight - margin;
    let finalLeft = left; // Left-aligned

    // If too close to top edge, visible area check
    if (finalTop < 10) {
        const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
        if (range) {
            const rect = range.getBoundingClientRect();
            finalTop = rect.bottom + margin;
        } else {
            finalTop = y + margin;
        }
    }

    // Ensure horizontal and vertical visibility within viewport
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    if (finalLeft < 10) finalLeft = 10;
    if (finalLeft + btnWidth > viewportWidth - 10) finalLeft = Math.max(10, viewportWidth - btnWidth - 10);

    if (finalTop < 10) finalTop = 10;
    if (finalTop + btnHeight > viewportHeight - 10) finalTop = Math.max(10, viewportHeight - btnHeight - 10);

    // Move to end of shadow root so it renders above all siblings
    if (luminaShadowRoot) luminaShadowRoot.appendChild(askSelectionPopupBtn);
    askSelectionPopupBtn.style.left = finalLeft + 'px';
    askSelectionPopupBtn.style.top = finalTop + 'px';

    // Start tracking scroll
    startAskPopupScrollTracking();
}

// Scroll tracking for Ask popup
let askPopupScrollHandler = null;
let isAskPopupTicking = false;

let askPopupScrollTrackingRAF = null;

function startAskPopupScrollTracking() {
    console.log('[Lumina Debug] startAskPopupScrollTracking called');
    if (askPopupScrollTrackingRAF) {
        console.log('[Lumina Debug] already tracking');
        return; 
    }

    const tick = () => {
        const btnVisible = askSelectionPopupBtn && askSelectionPopupBtn.style.display === 'flex';
        const inputVisible = askSelectionInputDiv && askSelectionInputDiv.style.display === 'flex';
        
        if (!btnVisible && !inputVisible) {
            stopAskPopupScrollTracking();
            return;
        }

        updateAskPopupPosition();
        askPopupScrollTrackingRAF = requestAnimationFrame(tick);
    };

    askPopupScrollTrackingRAF = requestAnimationFrame(tick);
}

function stopAskPopupScrollTracking() {
    if (askPopupScrollTrackingRAF) {
        cancelAnimationFrame(askPopupScrollTrackingRAF);
        askPopupScrollTrackingRAF = null;
    }
}

function updateAskPopupPosition() {
    if (!currentRange) {
        // console.log('[Lumina Debug] No currentRange, stopping update');
        return;
    }

    // Check which element is visible
    const btnVisible = askSelectionPopupBtn && askSelectionPopupBtn.style.display === 'flex';
    const inputVisible = askSelectionInputDiv && askSelectionInputDiv.style.display === 'flex';

    if (!btnVisible && !inputVisible) {
        stopAskPopupScrollTracking();
        return;
    }

    // Get current rect from saved range
    // Safari bug: getBoundingClientRect on Range inside Shadow DOM often returns 0
    let rect = currentRange.getBoundingClientRect();
    let source = 'getBoundingClientRect';
    if (!rect || (rect.width === 0 && rect.height === 0)) {
        const rects = currentRange.getClientRects();
        if (rects && rects.length > 0) {
            rect = rects[0];
            source = 'getClientRects[0]';
        } else {
            // console.log('[Lumina Debug] Both measuring methods returned empty');
            return;
        }
    }

    // console.log('[Lumina Debug] Position Update:', source, 'rect.top:', rect.top, 'rect.left:', rect.left);

    // Additional check: if scrolled out of the .lumina-chat-scroll-content, we should hide it
    let isVisibleInScrollParent = true;
    if (currentPopup && luminaShadowRoot) {
        const scrollEl = currentPopup.querySelector('.lumina-chat-scroll-content');
        if (scrollEl) {
            const scrollRect = scrollEl.getBoundingClientRect();
            // If the rect is above or below the scroll area, hide it to prevent overlap
            if (rect.bottom < scrollRect.top || rect.top > scrollRect.bottom) {
                isVisibleInScrollParent = false;
            }
            // console.log('[Lumina Debug] scrollEl check:', isVisibleInScrollParent, 'scrollRect.top:', scrollRect.top, 'scrollRect.bottom:', scrollRect.bottom);
        }
    }

    const margin = 5;
    const top = rect.top;
    const left = rect.left;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    if (btnVisible && askSelectionPopupBtn) {
        if (!isVisibleInScrollParent) {
            askSelectionPopupBtn.style.opacity = '0';
            askSelectionPopupBtn.style.pointerEvents = 'none';
        } else {
            askSelectionPopupBtn.style.opacity = '1';
            askSelectionPopupBtn.style.pointerEvents = 'auto';
            const btnHeight = askSelectionPopupBtn.offsetHeight || 36;
            const btnWidth = askSelectionPopupBtn.offsetWidth || 100;
            let finalTop = top - btnHeight - margin;
            let finalLeft = left;

            // Bounds check
            if (finalTop < 10) finalTop = rect.bottom + margin;
            if (finalTop + btnHeight > viewportHeight - 10) finalTop = viewportHeight - btnHeight - 10;

            // Ensure horizontally and vertically visible
            if (finalLeft < 10) finalLeft = 10;
            if (finalLeft + btnWidth > viewportWidth - 10) finalLeft = viewportWidth - btnWidth - 10;

            askSelectionPopupBtn.style.left = finalLeft + 'px';
            askSelectionPopupBtn.style.top = finalTop + 'px';
            // console.log('[Lumina Debug] Set button pos:', finalLeft, finalTop);
        }
    }

    if (inputVisible && askSelectionInputDiv) {
        if (!isVisibleInScrollParent) {
            askSelectionInputDiv.style.opacity = '0';
            askSelectionInputDiv.style.pointerEvents = 'none';
        } else {
            askSelectionInputDiv.style.opacity = '1';
            askSelectionInputDiv.style.pointerEvents = 'auto';
            const inputHeight = askSelectionInputDiv.offsetHeight || 36;
            const inputWidth = askSelectionInputDiv.offsetWidth || 260;
            let finalTop = top - inputHeight - margin;
            let finalLeft = left;

            // Bounds check
            if (finalTop < 10) finalTop = rect.bottom + margin;
            if (finalTop + inputHeight > viewportHeight - 10) finalTop = viewportHeight - inputHeight - 10;

            if (finalLeft < 10) finalLeft = 10;
            if (finalLeft + inputWidth > viewportWidth - 10) finalLeft = viewportWidth - inputWidth - 10;

            askSelectionInputDiv.style.left = finalLeft + 'px';
            askSelectionInputDiv.style.top = finalTop + 'px';
        }
    }
}

function hideAskSelectionPopup() {
    if (askSelectionPopupBtn) askSelectionPopupBtn.style.display = 'none';
    if (askSelectionInputDiv) askSelectionInputDiv.style.display = 'none';
    stopAskPopupScrollTracking();
    askSelectionText = '';
    askSelectionContext = '';
}

// ============================================================================
// AGGRESSIVE FOCUS GUARD - Prevent host page from stealing focus
// ============================================================================
let lastOutsideClickTime = 0;
let focusGuardInterval = null;
let isMouseOverAskInput = false;
let wasAskInputFocused = false; // Track if ask input was recently focused

// wasAskInputFocused state is updated via event listeners in setupAskInputFocusTracking()
function setupAskInputFocusTracking() {
    if (!askSelectionInputDiv) return;
    const input = askSelectionInputDiv.querySelector('input');
    if (!input) return;

    input.addEventListener('focus', () => { wasAskInputFocused = true; });
    input.addEventListener('blur', () => { wasAskInputFocused = false; });
}

// Track mouse over ask input popup
function setupAskInputMouseTracking() {
    if (askSelectionInputDiv) {
        askSelectionInputDiv.addEventListener('mouseenter', () => { isMouseOverAskInput = true; });
        askSelectionInputDiv.addEventListener('mouseleave', () => { isMouseOverAskInput = false; });
        setupAskInputFocusTracking();
    }
}

// Track clicks outside extension to differentiate user intent vs programmatic stealing
document.addEventListener('mousedown', (e) => {
    const path = e.composedPath();
    const isExtensionClick = path.includes(luminaHost) ||
        (luminaShadowRoot && path.includes(luminaShadowRoot)) ||
        (askSelectionPopupBtn && path.includes(askSelectionPopupBtn)) ||
        (askSelectionInputDiv && path.includes(askSelectionInputDiv));

    if (!isExtensionClick) {
        lastOutsideClickTime = Date.now();
    }
}, true);

// Event-based focus reclaim (instant response)
window.addEventListener('focus', (e) => {
    const shouldProtectMainPopup = isMouseOverPopup && currentPopup;
    const shouldProtectAskInput = wasAskInputFocused; // Use tracked state

    // Exclude body/html from focus stealing checks to allow text selection
    if ((shouldProtectMainPopup || shouldProtectAskInput) && e.target !== window && e.target !== document && e.target !== document.body && e.target !== document.documentElement) {
        const path = e.composedPath();
        const isFocusInExtension = path.includes(luminaHost) || (luminaShadowRoot && path.includes(luminaShadowRoot));

        if (!isFocusInExtension) {
            const timeSinceClick = Date.now() - lastOutsideClickTime;

            if (timeSinceClick > 300) {
                let targetInput = null;

                if (shouldProtectAskInput && askSelectionInputDiv) {
                    targetInput = askSelectionInputDiv.querySelector('input');
                } else if (shouldProtectMainPopup) {
                    targetInput = currentPopup.querySelector('.lumina-chat-input');
                }

                if (targetInput && document.activeElement !== targetInput) {
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    e.preventDefault();
                    targetInput.focus();
                }
            }
        }
    }
}, true);

// Polling-based focus reclaim (catches what events miss)
function startFocusGuard() {
    if (focusGuardInterval) return;

    // Higher interval for background check to save battery/CPU
    focusGuardInterval = setInterval(() => {
        const shouldProtectMainPopup = isMouseOverPopup && currentPopup;
        const shouldProtectAskInput = wasAskInputFocused;

        if (shouldProtectMainPopup || shouldProtectAskInput) {
            const currentFocus = getDeepActiveElement();
            if (!currentFocus || currentFocus === document.body || currentFocus === document.documentElement || currentFocus === luminaHost) return;

            const isFocusedInExtension = luminaShadowRoot && luminaShadowRoot.contains(currentFocus);
            if (!isFocusedInExtension) {
                // Focus reclaim logic is currently disabled to prevent interference
            }
        }
    }, 500); // Check every 500ms
}

function stopFocusGuard() {
    if (focusGuardInterval) {
        clearInterval(focusGuardInterval);
        focusGuardInterval = null;
    }
}

// Start/stop guard based on popup state
const originalCreatePopup = createPopupElement;
window.createPopupElement = function (...args) {
    const result = originalCreatePopup.apply(this, args);
    startFocusGuard();
    return result;
};

const originalRemovePopup = removePopup;
window.removePopup = function (...args) {
    stopFocusGuard();
    return originalRemovePopup.apply(this, args);
};

// Start guard when ask input is shown
const originalShowAskInput = showAskInput;
window.showAskInput = function (...args) {
    const result = originalShowAskInput.apply(this, args);
    setupAskInputMouseTracking();
    startFocusGuard();
    return result;
};

// Initialize guard if popup already exists
if (currentPopup) {
    startFocusGuard();
}

// Setup ask input tracking if it exists
if (askSelectionInputDiv) {
    setupAskInputMouseTracking();
}

// Show restore bar by default on regular web pages
if (!document.getElementById('popup-sidebar')) {
    chrome.storage.local.get(['disableExtension', 'disabledDomains'], (result) => {
        const disabledForSite = (result.disabledDomains || []).includes(window.location.hostname);
        if (!result.disableExtension && !disabledForSite) {
            isMinimized = true;
            createRestoreBar();
        }
    });
}


// ============================================================================
// POPUP MODE INITIALIZATION (For popup.html)
// ============================================================================
// Check if running in popup window context
if (document.getElementById('popup-sidebar')) {

    // Initialize UI directly
    currentPopup = document.querySelector('.lumina-chat-container') || document.body;

    // Attach listeners
    attachPopupSidebarListeners(currentPopup);

    // Attach input listeners
    const input = document.getElementById('chat-input');
    if (input) {
        attachChatInputListeners(currentPopup, "", null);
        input.focus();
    }

    // Load history
    if (typeof loadPopupChatHistory === 'function') {
        loadPopupChatHistory(currentPopup);
    }

    // Add window controls
    addWindowControls(currentPopup);

    // Override createPopupElement to return currentPopup (prevent duplicates)
    window.createPopupElement = function () {
        return currentPopup;
    };

    window.removePopup = function () {
        // Do nothing in popup mode
        // console.log('[Lumina] removePopup called but ignored in popup mode');
    };

    // Apply settings
    chrome.storage.local.get(['fontSize', 'theme'], (items) => {
        if (items.fontSize) {
            document.documentElement.style.fontSize = items.fontSize + 'px';
        }
        if (items.theme) {
            let effectiveTheme = items.theme;
            if (effectiveTheme === 'auto') {
                effectiveTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
            }
            document.body.setAttribute('data-theme', effectiveTheme);
        }
    });
}
