import { LUMINA_DEFAULT_SHORTCUTS } from '../shared/constants.js';
import { EventCleanupManager } from './event_cleanup.js';
import { ShadowHostManager } from './shadow_host.js';
import { YouTubeButtonManager } from './youtube_bridge.js';
import { extractMainContent, luminaEstimateTokens, getActiveSelection, getSmartSelectionText, getSentenceContext, getParagraphContext } from './page_reader.js';
import { playCombinedAudio, stopAudio } from './audio_player.js';
import { LuminaAnnotation } from '../helpers/annotation_utils.js';
import { LuminaSelection } from '../helpers/selection_utils.js';
import { LuminaDictionaryPopup } from '../components/dictionary/dictionary_popup.js';

(() => {
    window.katexLoaded = true;
    const eventCleanup = new EventCleanupManager();
    const shadowManager = new ShadowHostManager();
    const { host: luminaHost, shadowRoot: luminaShadowRoot } = shadowManager.init();

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
    let currentRange = null;
    let currentText = "";
    let isExtensionDisabled = false;

    function isRuntimeAvailable() {
        return typeof chrome !== 'undefined' && !!chrome.runtime && !!chrome.runtime.id;
    }
    function safeRuntimeSendMessage(message, callback) {
        if (!isRuntimeAvailable()) return false;
        try {
            chrome.runtime.sendMessage(message, callback);
            return true;
        } catch (error) {
            return false;
        }
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
                            source: 'dictionary'
                        });
                        return;
                    }
                }
                triggerSidePanelQuery(query, displayQuery, isDictionary ? 'dictionary' : 'qa', range);
            }
        });
    }

    let lastMouseX = 0;
    let lastMouseY = 0;
    window.addEventListener('mousemove', (e) => {
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        if (window.LuminaSelection) {
            LuminaSelection.mouseCoords = { x: e.clientX, y: e.clientY };
        }
    }, { passive: true });

    window.addEventListener('mouseup', (e) => {
        if (isExtensionDisabled) return;
        if (window.LuminaSelection && LuminaSelection.isInteractingWithActionBar) return;
        const path = e.composedPath();
        const isInsideShadow = path.some(el => el.id === 'lumina-shadow-host' || (el.tagName && el.tagName.toLowerCase() === 'lumina-shadow-host'));
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

    const DEFAULT_SHORTCUTS = LUMINA_DEFAULT_SHORTCUTS || {};
    let shortcuts = { ...DEFAULT_SHORTCUTS };
    let questionMappings = [];

    chrome.storage.local.get(['shortcuts', 'annotationShortcuts', 'questionMappings', 'disabledDomains'], (items) => {
        if (items.shortcuts) Object.assign(shortcuts, items.shortcuts);
        if (items.annotationShortcuts) shortcuts.annotationShortcuts = items.annotationShortcuts;
        if (items.questionMappings) questionMappings = items.questionMappings;
        const disabledDomains = items.disabledDomains || [];
        if (disabledDomains.includes(window.location.hostname)) {
            isExtensionDisabled = true;
        }
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (!chrome.runtime || !chrome.runtime.id) return;
        if (area === 'local') {
            if (changes.readWebpage) readWebpageEnabled = changes.readWebpage.newValue ?? false;
            if (changes.askSelectionPopupEnabled) {
                askSelectionPopupEnabled = changes.askSelectionPopupEnabled.newValue ?? false;
                if (!askSelectionPopupEnabled && window.LuminaSelection) LuminaSelection.hide();
            }
            if (changes.questionMappings) questionMappings = changes.questionMappings.newValue || [];
            if (changes.shortcuts) Object.assign(shortcuts, changes.shortcuts.newValue || DEFAULT_SHORTCUTS);
            if (changes.annotationShortcuts) shortcuts.annotationShortcuts = changes.annotationShortcuts.newValue || [];
            if (changes.fontSize || changes.fontSizeByDomain || changes.globalDefaults) {
                shadowManager.applyAskSelectionStyles();
            }
            if (changes.theme || changes.contrast || changes.accentColor || changes.globalDefaults) {
                shadowManager.updateTheme();
            }
        }
    });

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (!chrome.runtime || !chrome.runtime.id) return;
        if (request.action === 'toggle_extension_state') {
            isExtensionDisabled = !request.isEnabled;
            if (isExtensionDisabled && window.LuminaSelection) {
                LuminaSelection.hide();
            }
        } else if (request.action === 'get_page_content') {
            extractMainContent().then(result => {
                sendResponse({ text: result.content || '' });
            }).catch(err => {
                sendResponse({ text: document.body ? document.body.innerText : '' });
            });
            return true;
        }
    });

    const ytButtonManager = new YouTubeButtonManager();
    document.addEventListener('yt-navigate-finish', () => {
        if (window.location.hostname.includes('youtube.com')) {
            ytButtonManager.init();
        }
    });
    if (window.location.hostname.includes('youtube.com')) {
        setTimeout(() => ytButtonManager.init(), 1000);
    }

    document.addEventListener('click', (e) => {
        if (isExtensionDisabled) return;
        const path = e.composedPath();
        const isInsideLumina = path.some(el => el.id === 'lumina-action-bar' || el.id === 'lumina-ask-input-popup' || el.id === 'lumina-shadow-host' || el.id === 'lumina-comment-hover-tooltip' || (el.tagName && el.tagName.toLowerCase() === 'lumina-shadow-host'));
        if (isInsideLumina || (window.LuminaSelection && LuminaSelection.isInteractingWithActionBar)) return;

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

    let modifierKeyPressedAlone = true;

    function getSelectedTextForAudio() {
        let text = '';
        const activeElement = window.LuminaSelection ? LuminaSelection.getDeepActiveElement() : document.activeElement;
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
            text = getSmartSelectionText() || (selection ? selection.toString().trim() : '');
        }
        return text;
    }

    function isShortcutMatch(event, shortcut) {
        if (!shortcut) return false;

        if (shortcut.modifiers && Array.isArray(shortcut.modifiers)) {
            const hasCtrl = shortcut.modifiers.includes('Ctrl') || shortcut.modifiers.includes('Control');
            const hasAlt = shortcut.modifiers.includes('Alt');
            const hasShift = shortcut.modifiers.includes('Shift');
            const hasMeta = shortcut.modifiers.includes('Meta') || shortcut.modifiers.includes('Cmd') || shortcut.modifiers.includes('Command');

            if (hasCtrl !== event.ctrlKey) return false;
            if (hasAlt !== event.altKey) return false;
            if (hasShift !== event.shiftKey) return false;
            if (hasMeta !== event.metaKey) return false;

            if (shortcut.key === 'Shift' || shortcut.key === 'Control' || shortcut.key === 'Alt' || shortcut.key === 'Meta') {
                return event.key === shortcut.key;
            }
            if (shortcut.code && event.code === shortcut.code) return true;
            return (event.key || '').toLowerCase() === (shortcut.key || '').toLowerCase();
        }

        const ctrlMatch = !!shortcut.ctrlKey === event.ctrlKey;
        const altMatch = !!shortcut.altKey === event.altKey;
        const shiftMatch = !!shortcut.shiftKey === event.shiftKey;
        const metaMatch = !!shortcut.metaKey === event.metaKey;
        if (!ctrlMatch || !altMatch || !shiftMatch || !metaMatch) return false;

        if (shortcut.code && event.code === shortcut.code) return true;
        if (shortcut.key && (event.key || '').toLowerCase() === (shortcut.key || '').toLowerCase()) return true;
        return false;
    }

    function matchesShortcut(event, action) {
        const shortcut = shortcuts[action];
        if (!shortcut) return false;
        const isModifierKey = shortcut.key === 'Shift' || shortcut.key === 'Control' || shortcut.key === 'Alt' || shortcut.key === 'Meta';
        if (isModifierKey && (!shortcut.modifiers || shortcut.modifiers.length === 0)) {
            if (event.type !== 'keyup' || event.key !== shortcut.key || !modifierKeyPressedAlone) return false;
            const isSideSpecific = shortcut.code && (shortcut.code.endsWith('Left') || shortcut.code.endsWith('Right'));
            if (isSideSpecific && shortcut.code !== event.code) return false;
            return true;
        }
        if (event.type === 'keyup') return false;
        return isShortcutMatch(event, shortcut);
    }

    function matchesAnnotationShortcut(event, shortcut) {
        if (!shortcut) return false;
        const target = shortcut.keyData || shortcut;
        return isShortcutMatch(event, target);
    }

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Shift' || event.key === 'Control' || event.key === 'Alt' || event.key === 'Meta') {
            modifierKeyPressedAlone = true;
        } else {
            if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) {
                modifierKeyPressedAlone = false;
            }
        }
        if (isExtensionDisabled) return;

        const audioShortcut = shortcuts['audio'];
        const isModifierOnlyAudio = audioShortcut && ['Shift', 'Control', 'Alt', 'Meta'].includes(audioShortcut.key) && (!audioShortcut.modifiers || audioShortcut.modifiers.length === 0);

        if (!isModifierOnlyAudio && matchesShortcut(event, 'audio')) {
            if (window.LuminaSelection && LuminaSelection.isInsideEditable()) return;
            const text = getSelectedTextForAudio();
            event.preventDefault();
            event.stopPropagation();
            if (text) {
                playCombinedAudio(text);
            } else {
                stopAudio();
            }
            return;
        }

        if (matchesShortcut(event, 'askLumina')) {
            const selection = window.getSelection();
            const text = selection ? selection.toString().trim() : '';
            const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
            if (text.length > 0 && range && window.LuminaSelection) {
                event.preventDefault();
                event.stopPropagation();
                LuminaSelection.show(0, 0, text, range);
                LuminaSelection.showInput();
                return;
            }
        }

        if (matchesShortcut(event, 'translate')) {
            if (window.LuminaSelection && LuminaSelection.isInsideEditable()) return;
            const selection = window.getSelection();
            const text = selection ? selection.toString().trim() : '';
            if (text.length > 0) {
                event.preventDefault();
                event.stopPropagation();
                const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
                if (window.LuminaSelection) LuminaSelection.hide();
                triggerSidePanelQuery(text, text, 'translate', range);
                return;
            }
        }

        if (matchesShortcut(event, 'micToggle')) {
            event.preventDefault();
            event.stopPropagation();
            chrome.storage.local.set({ pendingMicToggle: Date.now() });
            safeRuntimeSendMessage({ action: 'open_sidepanel' });
            return;
        }

        if (matchesShortcut(event, 'luminaChat')) {
            event.preventDefault();
            event.stopPropagation();
            safeRuntimeSendMessage({ action: 'open_sidepanel' });
            return;
        }

        const annotationShortcutsList = shortcuts['annotationShortcuts'] || [];
        for (const shortcut of annotationShortcutsList) {
            if (shortcut.enabled === false) continue;
            if (matchesAnnotationShortcut(event, shortcut)) {
                if (window.LuminaSelection && LuminaSelection.isInsideEditable()) continue;
                const selection = window.getSelection();
                const text = selection ? selection.toString().trim() : '';
                if (text.length > 0 && selection.rangeCount > 0) {
                    event.preventDefault();
                    event.stopPropagation();
                    const range = selection.getRangeAt(0);
                    const color = shortcut.color || '#FFFB78';
                    if (window.LuminaAnnotation) {
                        window.LuminaAnnotation.highlight(range, color);
                    }
                    if (selection) selection.removeAllRanges();
                    if (window.LuminaSelection) LuminaSelection.hide();
                    return;
                }
            }
        }

        if (questionMappings && questionMappings.length > 0) {
            if (window.LuminaSelection && !LuminaSelection.isInsideEditable()) {
                const selection = window.getSelection();
                const text = selection ? selection.toString().trim() : '';
                if (text) {
                    const mapping = questionMappings.find(m => {
                        let config = m.keyData;
                        if (!config && m.key) {
                            config = { key: m.key, code: 'Key' + m.key.toUpperCase() };
                            if (event.ctrlKey || event.metaKey || event.altKey) return false;
                        }
                        if (!config) return false;
                        return isShortcutMatch(event, config);
                    });
                    if (mapping) {
                        event.preventDefault();
                        event.stopPropagation();
                        let displayQuestion = mapping.prompt;
                        let fullQuestion = mapping.prompt;
                        if (mapping.prompt.includes('$SelectedText') || mapping.prompt.includes('SelectedText')) {
                            displayQuestion = mapping.prompt
                                .replace(/\$SelectedText|SelectedText/gi, text)
                                .replace(/\$Sentence/gi, () => getSentenceContext())
                                .replace(/\$Paragraph/gi, () => getParagraphContext())
                                .trim();
                            fullQuestion = displayQuestion;
                        } else {
                            fullQuestion = `"${text}" ${mapping.prompt}`;
                            displayQuestion = fullQuestion;
                        }
                        const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
                        const shouldHighlight = (mapping.highlight !== false) && (mapping.enableHighlight !== false);
                        triggerSidePanelQuery(fullQuestion, displayQuestion, 'qa', range, shouldHighlight);
                        if (window.LuminaSelection) LuminaSelection.hide();
                        return;
                    }
                }
            }
        }
    }, true);

    document.addEventListener('keyup', (event) => {
        if (isExtensionDisabled) return;
        if (matchesShortcut(event, 'audio')) {
            if (window.LuminaSelection && LuminaSelection.isInsideEditable()) return;
            const text = getSelectedTextForAudio();
            event.preventDefault();
            event.stopPropagation();
            if (text) {
                playCombinedAudio(text);
            } else {
                stopAudio();
            }
        }
    }, true);
})();
