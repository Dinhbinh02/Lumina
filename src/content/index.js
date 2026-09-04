import { NEXUS_DEFAULT_SHORTCUTS } from '../utils/constants.js';
import { EventCleanupManager } from './event_cleanup.js';
import { ShadowHostManager } from './shadow_host.js';
import { extractMainContent, nexusEstimateTokens, getActiveSelection, getSmartSelectionText, getSentenceContext, getParagraphContext } from './page_reader.js';
import { playCombinedAudio, stopAudio } from './audio_player.js';
import { NexusAnnotation } from './annotation_utils.js';
import { NexusSelection } from './selection_utils.js';

(() => {
    window.katexLoaded = true;
    const eventCleanup = new EventCleanupManager();
    const shadowManager = new ShadowHostManager();
    const { host: nexusHost, shadowRoot: nexusShadowRoot } = shadowManager.init();

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
            if (window.NexusSelection) {
                NexusSelection.hide();
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
        if (shouldHighlight && window.NexusAnnotation) {
            const finalRange = range || (window.getSelection().rangeCount > 0 ? window.getSelection().getRangeAt(0) : null);
            if (finalRange && !finalRange.collapsed) {
                const color = '#FFFB78';
                window.NexusAnnotation.highlight(finalRange, color);
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

    if (window.NexusSelection) {
        NexusSelection.init({
            shadowRoot: nexusShadowRoot,
            onSubmit: (query, displayQuery, sourceEntry, range, isTranslate, isAudio) => {
                if (isAudio) {
                    playCombinedAudio(displayQuery);
                    return;
                }
                if (isTranslate) {
                    triggerSidePanelQuery(query, displayQuery, 'translate', range);
                    return;
                }
                triggerSidePanelQuery(query, displayQuery, 'qa', range);
            }
        });
    }

    let lastMouseX = 0;
    let lastMouseY = 0;
    window.addEventListener('mousemove', (e) => {
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        if (window.NexusSelection) {
            NexusSelection.mouseCoords = { x: e.clientX, y: e.clientY };
        }
    }, { passive: true });

    window.addEventListener('mouseup', (e) => {
        if (isExtensionDisabled) return;
        if (window.NexusSelection && NexusSelection.isInteractingWithActionBar) return;
        const path = e.composedPath();
        const isInsideShadow = path.some(el => el.id === 'nexus-shadow-host' || (el.tagName && el.tagName.toLowerCase() === 'nexus-shadow-host'));
        if (isInsideShadow) return;
        if (askSelectionPopupEnabled) {
            const sel = window.getSelection();
            const selText = sel ? sel.toString().trim() : '';
            if (selText.length > 0) {
                e.stopPropagation();
            }
        }
        const activeElement = window.NexusSelection ? NexusSelection.getDeepActiveElement() : document.activeElement;
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
                const isHighlight = e.target.closest('.nexus-highlight') || (window.NexusAnnotation && NexusAnnotation.getHighlightAtCoords(e.clientX, e.clientY));
                if (window.NexusSelection && !isHighlight) NexusSelection.hide();
                return;
            }
            if (text.length > 0 && (range || isInput) && window.NexusSelection) {
                if (e.clientX && e.clientY) {
                    NexusSelection.mouseCoords = { x: e.clientX, y: e.clientY };
                }
                NexusSelection.show(e.clientX, e.clientY, text, range);
            } else if (!isInsideShadow) {
                const isHighlight = e.target.closest('.nexus-highlight');
                if (window.NexusSelection && !isHighlight) NexusSelection.hide();
            }
        }, 50);
    }, true);

    window.addEventListener('mousedown', (e) => {
        const path = e.composedPath();
        const isInsideAskBtn = path.some(el => (el.id === 'nexus-action-bar') || (el.id === 'nexus-ask-input-popup') || (window.NexusSelection && el === NexusSelection.btn));
        const isHighlight = window.NexusAnnotation && NexusAnnotation.getHighlightAtCoords(e.clientX, e.clientY);
        if (!isInsideAskBtn && !isHighlight) {
            if (window.NexusSelection) NexusSelection.hide();
        }
    }, true);

    chrome.storage.local.get(['readWebpage', 'askSelectionPopupEnabled'], (result) => {
        readWebpageEnabled = result.readWebpage ?? false;
        askSelectionPopupEnabled = result.askSelectionPopupEnabled ?? false;
        if (window.NexusAnnotation) {
            NexusAnnotation.loadHighlights();
        }
    });

    let lastUrl = window.location.href;
    setInterval(() => {
        if (window.location.href !== lastUrl) {
            lastUrl = window.location.href;
            if (window.NexusAnnotation) {
                NexusAnnotation.clearAllHighlights();
                NexusAnnotation.loadHighlights();
            }
        }
    }, 500);

    const DEFAULT_SHORTCUTS = NEXUS_DEFAULT_SHORTCUTS || {};
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
                if (!askSelectionPopupEnabled && window.NexusSelection) NexusSelection.hide();
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
            if (isExtensionDisabled && window.NexusSelection) {
                NexusSelection.hide();
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


    document.addEventListener('click', (e) => {
        if (isExtensionDisabled) return;
        const isInsideNexus = path.some(el => el.id === 'nexus-action-bar' || el.id === 'nexus-shadow-host' || (el.tagName && el.tagName.toLowerCase() === 'nexus-shadow-host'));
        if (isInsideNexus || (window.NexusSelection && NexusSelection.isInteractingWithActionBar)) return;

        if (window.NexusAnnotation) {
            const hData = NexusAnnotation.getHighlightAtCoords(e.clientX, e.clientY);
            if (hData) {
                e.preventDefault();
                e.stopPropagation();
                if (window.NexusSelection) {
                    NexusSelection.showAnnotationMenu(hData.range, hData.id, hData.color);
                }
            }
        }
    }, true);

    let modifierKeyPressedAlone = true;

    function getSelectedTextForAudio() {
        let text = '';
        const activeElement = window.NexusSelection ? NexusSelection.getDeepActiveElement() : document.activeElement;
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
            if (window.NexusSelection && NexusSelection.isInsideEditable()) return;
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

        if (matchesShortcut(event, 'askNexus')) {
            const selection = window.getSelection();
            const text = selection ? selection.toString().trim() : '';
            const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
            if (text.length > 0 && range && window.NexusSelection) {
                event.preventDefault();
                event.stopPropagation();
                NexusSelection.show(0, 0, text, range);
                NexusSelection.showInput();
                return;
            }
        }

        if (matchesShortcut(event, 'translate')) {
            if (window.NexusSelection && NexusSelection.isInsideEditable()) return;
            const selection = window.getSelection();
            const text = selection ? selection.toString().trim() : '';
            if (text.length > 0) {
                event.preventDefault();
                event.stopPropagation();
                const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
                if (window.NexusSelection) NexusSelection.hide();
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

        if (matchesShortcut(event, 'nexusChat')) {
            event.preventDefault();
            event.stopPropagation();
            safeRuntimeSendMessage({ action: 'open_sidepanel' });
            return;
        }

        const annotationShortcutsList = shortcuts['annotationShortcuts'] || [];
        for (const shortcut of annotationShortcutsList) {
            if (shortcut.enabled === false) continue;
            if (matchesAnnotationShortcut(event, shortcut)) {
                if (window.NexusSelection && NexusSelection.isInsideEditable()) continue;
                const selection = window.getSelection();
                const text = selection ? selection.toString().trim() : '';
                if (text.length > 0 && selection.rangeCount > 0) {
                    event.preventDefault();
                    event.stopPropagation();
                    const range = selection.getRangeAt(0);
                    const color = shortcut.color || '#FFFB78';
                    if (window.NexusAnnotation) {
                        window.NexusAnnotation.highlight(range, color);
                    }
                    if (selection) selection.removeAllRanges();
                    if (window.NexusSelection) NexusSelection.hide();
                    return;
                }
            }
        }

        if (questionMappings && questionMappings.length > 0) {
            if (window.NexusSelection && !NexusSelection.isInsideEditable()) {
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
                        if (window.NexusSelection) NexusSelection.hide();
                        return;
                    }
                }
            }
        }
    }, true);

    document.addEventListener('keyup', (event) => {
        if (isExtensionDisabled) return;
        if (matchesShortcut(event, 'audio')) {
            if (window.NexusSelection && NexusSelection.isInsideEditable()) return;
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
