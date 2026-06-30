
function getPaneActiveModel(pane = 'primary') {
    const model = sessionStorage.getItem(`lumina_active_model_${pane}`);
    const providerId = sessionStorage.getItem(`lumina_active_provider_${pane}`);
    if (model) {
        return { model, providerId };
    }
    return null;
}

function setPaneActiveModel(pane = 'primary', modelObj) {
    if (modelObj && modelObj.model) {
        sessionStorage.setItem(`lumina_active_model_${pane}`, modelObj.model);
        if (modelObj.providerId) {
            sessionStorage.setItem(`lumina_active_provider_${pane}`, modelObj.providerId);
        } else {
            sessionStorage.removeItem(`lumina_active_provider_${pane}`);
        }
    } else {
        sessionStorage.removeItem(`lumina_active_model_${pane}`);
        sessionStorage.removeItem(`lumina_active_provider_${pane}`);
    }
}

function getPaneActiveThinking(pane = 'primary') {
    return sessionStorage.getItem(`lumina_active_thinking_${pane}`) || null;
}

function setPaneActiveThinking(pane = 'primary', level) {
    if (level) {
        sessionStorage.setItem(`lumina_active_thinking_${pane}`, level);
    } else {
        sessionStorage.removeItem(`lumina_active_thinking_${pane}`);
    }
}

const container = document.querySelector('.lumina-chat-container');
const fileInput = document.getElementById('file-input');


function bindContainerWheelForward(containerEl) {
    if (!containerEl || containerEl.__luminaWheelBound) return;
    containerEl.__luminaWheelBound = true;
    let cachedScrollable = null;




    function attachScrollContentBlocker(scrollable) {
        if (!scrollable || scrollable.__luminaWheelStop) return;
        scrollable.__luminaWheelStop = true;
        scrollable.addEventListener('wheel', (e) => { e.stopPropagation(); }, { passive: true });
    }


    containerEl.addEventListener('wheel', (e) => {

        if (!cachedScrollable || cachedScrollable.style.display === 'none') {
            cachedScrollable = containerEl.querySelector('.lumina-chat-scroll-content:not([style*="display: none"])');
            if (cachedScrollable) attachScrollContentBlocker(cachedScrollable);
        }
        if (!cachedScrollable) return;
        e.preventDefault();

        let delta = e.deltaY;
        if (e.deltaMode === 1) delta *= 16;
        else if (e.deltaMode === 2) delta *= cachedScrollable.clientHeight;
        cachedScrollable.scrollBy({ top: delta, behavior: 'instant' });
    }, { passive: false });


    const existing = containerEl.querySelector('.lumina-chat-scroll-content');
    if (existing) attachScrollContentBlocker(existing);
}


const isWebApp = new URLSearchParams(window.location.search).get('webapp') === '1';
const isSidePanel = new URLSearchParams(window.location.search).get('sidepanel') === '1';
if (isSidePanel) {
    document.body.classList.add('is-sidepanel');
}

function updateUrlSessionId(ignoredSessionId) {
    const urlParams = new URLSearchParams(window.location.search);

    // Determine the sids to write to the URL
    let sids = [];
    if (typeof isSplitMode !== 'undefined' && isSplitMode) {
        const primaryTab = (typeof tabs !== 'undefined' && typeof activeTabIndex !== 'undefined') ? tabs[activeTabIndex] : null;
        const secondaryTab = (typeof tabs !== 'undefined' && typeof secondaryActiveTabIndex !== 'undefined') ? tabs[secondaryActiveTabIndex] : null;
        if (primaryTab && primaryTab.sessionId) {
            sids.push(primaryTab.sessionId);
        } else {
            sids.push('');
        }
        if (secondaryTab && secondaryTab.sessionId) {
            sids.push(secondaryTab.sessionId);
        } else {
            sids.push('');
        }
    } else {
        const primaryTab = (typeof tabs !== 'undefined' && typeof activeTabIndex !== 'undefined') ? tabs[activeTabIndex] : null;
        if (primaryTab && primaryTab.sessionId) {
            sids.push(primaryTab.sessionId);
        }
    }

    if (sids.length === 2 && sids[0] === '' && sids[1] === '') {
        sids = [];
    }

    if (urlParams.has('session_id')) {
        urlParams.delete('session_id');
    }

    const sidVal = sids.join(',');
    if (!sidVal) {
        if (urlParams.has('sid')) {
            urlParams.delete('sid');
            const newUrl = window.location.pathname + (urlParams.toString() ? '?' + urlParams.toString() : '');
            window.history.replaceState({ path: newUrl }, '', newUrl);
        }
        return;
    }

    if (urlParams.get('sid') !== sidVal) {
        urlParams.set('sid', sidVal);
        const newUrl = window.location.pathname + '?' + urlParams.toString();
        window.history.replaceState({ path: newUrl }, '', newUrl);
    }
}

const instanceId = (() => {
    let instId = sessionStorage.getItem('lumina_spotlight_instance_id');
    if (!instId) {
        instId = 'inst_' + Date.now() + Math.random().toString(36).substr(2, 5);
        sessionStorage.setItem('lumina_spotlight_instance_id', instId);
    }
    return instId;
})();

const STORAGE_PREFIX = isSidePanel ? 'sidepanel' : 'spotlight';

const GLOBAL_KEYS = {
    tabs: `${STORAGE_PREFIX}_tabs`,
    tabCounter: `${STORAGE_PREFIX}_tab_counter`,
    activeTabIndex: `${STORAGE_PREFIX}_active_tab_index`,
    tabGroups: `${STORAGE_PREFIX}_tab_groups`,
    activeGroupIndex: `${STORAGE_PREFIX}_active_group_index`,
    groupCounter: `${STORAGE_PREFIX}_group_counter`,
    isSplitMode: `${STORAGE_PREFIX}_is_split_mode`,
    secondaryTabIndex: `${STORAGE_PREFIX}_secondary_tab_index`,
    splitRatio: `${STORAGE_PREFIX}_split_ratio`
};

const KEYS = {
    tabs: `${STORAGE_PREFIX}_tabs_${instanceId}`,
    tabCounter: `${STORAGE_PREFIX}_tab_counter_${instanceId}`,
    activeTabIndex: `${STORAGE_PREFIX}_active_tab_index_${instanceId}`,
    tabGroups: `${STORAGE_PREFIX}_tab_groups_${instanceId}`,
    activeGroupIndex: `${STORAGE_PREFIX}_active_group_index_${instanceId}`,
    groupCounter: `${STORAGE_PREFIX}_group_counter_${instanceId}`,
    isSplitMode: `${STORAGE_PREFIX}_is_split_mode_${instanceId}`,
    secondaryTabIndex: `${STORAGE_PREFIX}_secondary_tab_index_${instanceId}`,
    splitRatio: `${STORAGE_PREFIX}_split_ratio_${instanceId}`
};


let tabs = [];
let sessionSettings = {};
let sparksCache = {};
let tabGroups = [];
let activeGroupIndex = -1;
let activeTabIndex = -1;
let tabCounter = 1;

window.LuminaSelectionScope = {
    getTabs: () => tabs,
    getActiveTabIndex: () => activeTabIndex,
    resetChat: (isSecondary) => { if (typeof resetChat === 'function') resetChat(isSecondary); },
    renderRecentChatsSidebar: () => { if (typeof renderRecentChatsSidebar === 'function') renderRecentChatsSidebar(); }
};

// Cache nội dung trang web theo tabId+url, tránh fetch lại mỗi lần gửi
const pageContextCache = new Map(); // key: `${tabId}::${url}` => pageContext string


let chatUI = null;
let sharedInputUI = null;
let sharedInputUISecondary = null;
let chatUISecondary = null;
let hoveredPane = 'primary';


function getHoveredInputEl() {
    if (isSplitMode && hoveredPane === 'secondary' && sharedInputUISecondary?.inputEl) {
        return sharedInputUISecondary.inputEl;
    }
    return sharedInputUI?.inputEl;
}

function getShortcutTargetTab() {
    if (isSplitMode && hoveredPane === 'secondary' && secondaryActiveTabIndex >= 0) {
        return tabs[secondaryActiveTabIndex] || null;
    }
    return tabs[activeTabIndex] || null;
}



let isSplitMode = false;
let secondaryActiveTabIndex = -1;
let resizerDragging = false;
let sidebarTargetTabId = null;
let splitHoverTimer = null;
let splitHoverTargetIndex = -1;
let isApplyingSplit = false;

window.getActiveSpotlightTab = function () {
    const isSecondary = isSplitMode && hoveredPane === 'secondary';
    const targetIdx = isSecondary ? secondaryActiveTabIndex : activeTabIndex;
    return (typeof tabs !== 'undefined' && targetIdx >= 0) ? tabs[targetIdx] : null;
};

function updatePaneHighlight() {
    const panePrimary = document.getElementById('pane-primary');
    const paneSecondary = document.getElementById('pane-secondary');
    if (!panePrimary) return;

    if (isSplitMode) {
        if (hoveredPane === 'secondary') {
            panePrimary.classList.remove('active');
            paneSecondary?.classList.add('active');
            if (sharedInputUISecondary?.inputEl && document.activeElement !== sharedInputUISecondary.inputEl) {
                sharedInputUISecondary.inputEl.focus();
            }
        } else {
            paneSecondary?.classList.remove('active');
            panePrimary.classList.add('active');
            if (sharedInputUI?.inputEl && document.activeElement !== sharedInputUI.inputEl) {
                sharedInputUI.inputEl.focus();
            }
        }
    } else {
        paneSecondary?.classList.remove('active');
        panePrimary.classList.add('active');
    }
}

async function toggleSplitMode() {
    const splitContainer = document.getElementById('split-container');
    const paneSecondary = document.getElementById('pane-secondary');
    const resizer = document.getElementById('spotlight-resizer');
    const panePrimary = document.getElementById('pane-primary');
    if (!splitContainer) return;

    if (isSplitMode) {
        // Turn off split mode
        isSplitMode = false;
        secondaryActiveTabIndex = -1;
        chatUISecondary = null;

        splitContainer.classList.remove('split-mode');
        if (paneSecondary) paneSecondary.style.display = 'none';
        if (resizer) resizer.style.display = 'none';

        if (panePrimary) panePrimary.style.flex = '';
        if (paneSecondary) paneSecondary.style.flex = '';

        if (tabs.length > 1) {
            const secTab = tabs[1];
            if (secTab) {
                if (secTab.historyEl) {
                    secTab.historyEl.style.display = 'none';
                }
            }
            tabs = tabs.slice(0, 1);
        }

        const currentGroup = tabGroups[activeGroupIndex];
        if (currentGroup) {
            currentGroup.tabIds = currentGroup.tabIds.slice(0, 1);
            currentGroup.ratio = 100;
        }

        hoveredPane = 'primary';
        updatePaneHighlight();

        await chrome.storage.local.set({
            [KEYS.isSplitMode]: false,
            [GLOBAL_KEYS.isSplitMode]: false
        });
        saveTabsState();

        updateUrlSessionId(tabs[0]?.sessionId || null);
        updateRecentChatsActiveState();
        if (typeof sidebarSparksRenderList === 'function') {
            sidebarSparksRenderList();
        }
    } else {
        // Turn on split mode
        if (window.innerWidth < 900) {
            return;
        }

        isSplitMode = true;
        secondaryActiveTabIndex = 1;

        splitContainer.classList.add('split-mode');
        if (paneSecondary) paneSecondary.style.display = 'flex';
        if (resizer) resizer.style.display = 'flex';

        // Load custom ratio or default 50
        const storageData = await chrome.storage.local.get([KEYS.splitRatio]);
        const ratio = storageData[KEYS.splitRatio] || 50;
        if (panePrimary && paneSecondary) {
            panePrimary.style.flex = `${ratio}`;
            paneSecondary.style.flex = `${100 - ratio}`;
        }

        const secondaryContainer = document.querySelector('#pane-secondary .lumina-chat-container');
        if (secondaryContainer) {
            secondaryContainer.querySelectorAll('.lumina-chat-scroll-content').forEach(el => el.remove());
        }

        const initialHistorySecondary = document.createElement('div');
        initialHistorySecondary.id = 'chat-history-secondary';
        initialHistorySecondary.className = 'lumina-chat-scroll-content';
        initialHistorySecondary.style.display = 'block';
        if (secondaryContainer) secondaryContainer.appendChild(initialHistorySecondary);

        let modelObj = null;
        try {
            const modelData = await chrome.storage.local.get(['lastUsedModel']);
            if (modelData.lastUsedModel && modelData.lastUsedModel.model) {
                modelObj = { ...modelData.lastUsedModel };
            }
        } catch (e) { }

        const secondaryTab = {
            id: 'tab-secondary',
            title: 'Chat 2',
            sessionId: null,
            sparkId: null,
            scrollTop: -1,
            isAtBottom: true,
            restoreLatestOnOpen: true,
            historyEl: initialHistorySecondary,
            selectedModel: getPaneActiveModel('secondary') || modelObj,
            thinkingLevel: getPaneActiveThinking('secondary'),
            chatUIInstance: new LuminaChatUI(secondaryContainer || container, {
                isSpotlight: true,
                skipInputSetup: true,
                onSubmit: (text, images, extra) => handleSubmit(text, images, extra, secondaryTab)
            }),
            isHistoryLoaded: false
        };
        secondaryTab.chatUIInstance.historyEl = initialHistorySecondary;
        secondaryTab.chatUIInstance.initListeners(initialHistorySecondary);
        bindHistoryScroll(secondaryTab);

        if (tabs.length > 1) {
            tabs[1] = secondaryTab;
        } else {
            tabs.push(secondaryTab);
        }

        const currentGroup = tabGroups[activeGroupIndex];
        if (currentGroup) {
            if (!currentGroup.tabIds.includes(secondaryTab.id)) {
                currentGroup.tabIds.push(secondaryTab.id);
            }
            currentGroup.ratio = ratio;
        }

        chatUISecondary = secondaryTab.chatUIInstance;
        if (sharedInputUISecondary) {
            sharedInputUISecondary.historyEl = initialHistorySecondary;
            sharedInputUISecondary.restoreInputState(secondaryTab.inputStateSecondary || null);
            sharedInputUISecondary.activeTabModel = secondaryTab.selectedModel ? { ...secondaryTab.selectedModel } : null;
            sharedInputUISecondary.thinkingLevel = secondaryTab.thinkingLevel || null;
            if (typeof sharedInputUISecondary.refreshModelSelector === 'function') sharedInputUISecondary.refreshModelSelector();
            if (typeof sharedInputUISecondary.refreshReasoningSelector === 'function') sharedInputUISecondary.refreshReasoningSelector();
            sharedInputUISecondary._updateActionBtnState();
        }

        initTopbarModelSelector('secondary');

        hoveredPane = 'secondary';
        updatePaneHighlight();

        await chrome.storage.local.set({
            [KEYS.isSplitMode]: true,
            [GLOBAL_KEYS.isSplitMode]: true
        });
        saveTabsState();

        updateUrlSessionId(null);
        updateRecentChatsActiveState();
        if (typeof sidebarSparksRenderList === 'function') {
            sidebarSparksRenderList();
        }
        if (typeof LuminaSearchModal !== 'undefined' && typeof LuminaSearchModal.show === 'function') {
            LuminaSearchModal.show(true);
        }
    }
    updateWelcomeScreenState('primary');
    if (isSplitMode) {
        updateWelcomeScreenState('secondary');
    }
    updatePaneBlankState();
}

let port = null;
let shortcuts = {};
let annotationShortcuts = [];
let questionMappings = [];
let askSelectionPopupEnabled = false;
let advancedParamsByModel = {};
let pinnedWebSources = [];
let webSourceSelectionsByPageTabId = {};
let currentBrowserTab = null;
let webTabPickerEl = null;
let webTabPickerAnchorEl = null;
let webTabPickerOutsideHandler = null;
let webTabPickerKeyHandler = null;
let minHeightReflowRaf = null;


let spotlightAskSourcePane = 'primary';
let groupCounter = 1;
let isInitializing = false;
let handledQueryIds = new Set();
let myWindowId = null;
let shouldStartNewChat = false;


let modifierKeyPressedAlone = false;
let lastSubmitTime = 0;
let lastSubmitText = "";
let readWebpageEnabled = false;

const GROUP_COLORS = [
    '#4285f4',
    '#34a853',
    '#fbbc05',
    '#ea4335',
    '#a142f4',
    '#24c1e0',
    '#ff6d01',
    '#ff33b5'
];


function applyFontSize(size) {
    if (typeof LuminaChatUI !== 'undefined' && typeof LuminaChatUI.applyFontSize === 'function') {
        LuminaChatUI.applyFontSize(null, size);
    } else {
        document.body.style.setProperty('font-size', size + 'px', 'important');
        document.documentElement.style.setProperty('--lumina-fontSize', size + 'px', 'important');
    }
}

const WEB_SOURCE_SELECTION_STORAGE_PREFIX = 'lumina_web_source_selection_';

const currentBrowserTabTokens = new Map();

function getSpotlightTabIdForPane(container) {
    return activeTabIndex >= 0 && tabs[activeTabIndex] ? tabs[activeTabIndex].id : null;
}

function getWebSelectionScopeKey(spotlightTabId) {
    if (spotlightTabId == null || !currentBrowserTab) return null;
    return `${String(spotlightTabId)}_${String(currentBrowserTab.tabId)}`;
}


function getCurrentSpotlightTabId() {
    const tab = activeTabIndex >= 0 && tabs[activeTabIndex] ? tabs[activeTabIndex] : null;
    return tab ? tab.id : null;
}

function getWebSelectionStorageKey(key) {
    return `${WEB_SOURCE_SELECTION_STORAGE_PREFIX}${String(key)}`;
}

function readWebSelectionFromStorage(scopeKey) {
    try {
        const rawValue = localStorage.getItem(getWebSelectionStorageKey(scopeKey));
        if (!rawValue) return [];
        const parsedValue = JSON.parse(rawValue);
        return Array.isArray(parsedValue)
            ? parsedValue.filter((source) => source && isWebPageUrl(source.url)).map((source) => ({
                tabId: source.tabId,
                title: source.title,
                url: source.url,
                tokens: source.tokens || 0
            }))
            : [];
    } catch (error) {
        console.warn('[Spotlight] Failed to read web selection from localStorage:', error);
        return [];
    }
}

function writeWebSelectionToStorage(scopeKey, selection) {
    const key = getWebSelectionStorageKey(scopeKey);
    const validSelection = (selection || []).filter((source) => source && isWebPageUrl(source.url));

    if (validSelection.length > 0) {
        localStorage.setItem(key, JSON.stringify(validSelection.map((source) => ({
            tabId: source.tabId,
            title: source.title,
            url: source.url,
            tokens: source.tokens || 0
        }))));
    } else {
        localStorage.removeItem(key);
    }
}

function deleteWebSelectionFromStorage(scopeKey) {
    const key = getWebSelectionStorageKey(scopeKey);
    localStorage.removeItem(key);
}

function getWebSelectionForScope(spotlightTabId) {
    const scopeKey = getWebSelectionScopeKey(spotlightTabId);
    if (!scopeKey) return [];


    webSourceSelectionsByPageTabId[scopeKey] = readWebSelectionFromStorage(scopeKey);
    return webSourceSelectionsByPageTabId[scopeKey] || [];
}

function saveWebSelectionForScope(spotlightTabId, selection) {
    const scopeKey = getWebSelectionScopeKey(spotlightTabId);
    if (!scopeKey) return;

    const normalizedSelection = (selection || []).filter((source) => source && isWebPageUrl(source.url)).map((source) => ({
        tabId: source.tabId,
        title: source.title,
        url: source.url,
        tokens: source.tokens || 0
    }));

    webSourceSelectionsByPageTabId[scopeKey] = normalizedSelection;
    writeWebSelectionToStorage(scopeKey, normalizedSelection);


    if (normalizedSelection.length > 0) {
        refreshWebSourceTokens(spotlightTabId, normalizedSelection);
    }
}



async function ensureContentScriptsInjected(tabId) {
    try {
        const checkResults = await chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: () => typeof window.luminaExtractMainContent === 'function'
        }).catch(() => null);

        const isAlreadyInjected = checkResults && checkResults[0] && checkResults[0].result === true;
        if (!isAlreadyInjected) {
            console.log(`[Lumina] Re-injecting content scripts into tab ${tabId}...`);
            const manifest = chrome.runtime.getManifest();
            const contentScriptFiles = manifest.content_scripts?.[0]?.js || [];
            if (contentScriptFiles.length > 0) {
                await chrome.scripting.executeScript({
                    target: { tabId: tabId, allFrames: true },
                    files: contentScriptFiles
                });
            }
        }
    } catch (e) {
        console.warn(`[Lumina] Failed to inject content scripts into tab ${tabId}:`, e);
    }
}

async function fetchFreshWebContent(tabId) {
    const tabInfo = await chrome.tabs.get(parseInt(tabId)).catch(() => null);
    if (!tabInfo || tabInfo.status !== 'complete') return null;

    await ensureContentScriptsInjected(parseInt(tabId));

    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId: parseInt(tabId), allFrames: true },
            func: () => typeof window.luminaExtractMainContent === 'function'
                ? window.luminaExtractMainContent(document, true) : null
        });

        if (!results) return null;


        const texts = [];
        const cleanTextForCompare = (str) => {
            return str.replace(/\[Context Source:[^\]]+\]/g, '')
                .replace(/URL:[^\n]+/g, '')
                .replace(/--- \[Segment \d+\] ---/g, '')
                .replace(/[^a-zA-Z0-9]/g, '')
                .toLowerCase();
        };

        for (const r of results) {
            const ctx = r.result;
            if (!ctx || !ctx.content) continue;
            const text = ctx.content.trim();
            if (text.length < 100) continue;

            const cleanedNew = cleanTextForCompare(text);
            if (cleanedNew.length < 50) continue;

            const prefix = cleanedNew.substring(0, 200);
            let isDuplicate = false;
            for (const existing of texts) {
                if (cleanTextForCompare(existing).includes(prefix)) {
                    isDuplicate = true;
                    break;
                }
            }
            if (isDuplicate) continue;

            texts.push(text);
        }
        return texts.length > 0 ? texts.join('\n\n') : null;
    } catch (e) {
        console.warn(`[Lumina WebSource] executeScript failed for tab ${tabId}:`, e);
        return null;
    }
}


async function refreshWebSourceTokens(spotlightTabId, selection) {
    if (!selection || selection.length === 0) return;
    let updated = false;

    for (const source of selection) {
        try {
            const text = await fetchFreshWebContent(source.tabId);
            if (!text || text.length < 200) continue;

            const count = (typeof LuminaToken !== 'undefined') ? LuminaToken.count(text) : Math.ceil(text.length / 4);
            if (count < 10) continue;

            if (source.tokens !== count) {
                source.tokens = count;
                updated = true;
            }
        } catch (e) {
            console.warn(`[Lumina WebSource] Token refresh failed for tab ${source.tabId}:`, e);
            if (!source.tokens) source.tokens = 0;
        }
    }

    if (updated) {
        if (spotlightTabId) {
            const scopeKey = getWebSelectionScopeKey(spotlightTabId);
            if (scopeKey) {
                webSourceSelectionsByPageTabId[scopeKey] = selection;
                writeWebSelectionToStorage(scopeKey, selection);
            }
        }
        updateWebChips();
    }
}

function saveCurrentWebSelection(spotlightTabId = null) {
    const targetTabId = spotlightTabId || (activeTabIndex >= 0 && tabs[activeTabIndex] ? tabs[activeTabIndex].id : null);
    if (!targetTabId) return;

    const scopedSelection = getWebSelectionForScope(targetTabId);
    saveWebSelectionForScope(targetTabId, scopedSelection);
}

function loadCurrentWebSelection(spotlightTabId = null) {
    const targetTabId = spotlightTabId || (activeTabIndex >= 0 && tabs[activeTabIndex] ? tabs[activeTabIndex].id : null);
    if (!targetTabId) {
        pinnedWebSources = [];
        return;
    }

    const selection = getWebSelectionForScope(targetTabId);
    pinnedWebSources = selection.map((source) => ({
        tabId: source.tabId,
        title: source.title,
        url: source.url
    }));
}

function updateWebSelectionForTab(tabId, updater) {
    const stringTabId = String(tabId);


    const storageKeys = Object.keys(localStorage).filter((key) =>
        key.startsWith(WEB_SOURCE_SELECTION_STORAGE_PREFIX)
    );

    storageKeys.forEach((storageKey) => {
        const scopeKey = storageKey.slice(WEB_SOURCE_SELECTION_STORAGE_PREFIX.length);


        const selection = readWebSelectionFromStorage(scopeKey);


        let changed = false;
        const updatedSelection = selection.map((source) => {
            if (String(source.tabId) === stringTabId) {
                const updated = updater(source, stringTabId);
                if (updated !== source) {
                    changed = true;
                }
                return updated;
            }
            return source;
        }).filter(Boolean);

        if (changed) {
            webSourceSelectionsByPageTabId[scopeKey] = updatedSelection;
            writeWebSelectionToStorage(scopeKey, updatedSelection);
        }
    });

    updateWebChips();
}

function refreshWebSourceTokensForTab(tabId) {
    const stringTabId = String(tabId);


    const pinnedMatch = pinnedWebSources.find(s => String(s.tabId) === stringTabId);
    if (pinnedMatch) {
        const activeTabId = activeTabIndex >= 0 && tabs[activeTabIndex] ? tabs[activeTabIndex].id : null;
        if (activeTabId) {
            refreshWebSourceTokens(activeTabId, pinnedWebSources.filter(s => String(s.tabId) === stringTabId));
        }
    }



    const storageKeys = Object.keys(localStorage).filter((key) =>
        key.startsWith(WEB_SOURCE_SELECTION_STORAGE_PREFIX)
    );

    storageKeys.forEach((storageKey) => {
        const spotlightTabId = storageKey.slice(WEB_SOURCE_SELECTION_STORAGE_PREFIX.length);
        const selection = readWebSelectionFromStorage(spotlightTabId);
        const matches = selection.filter(s => String(s.tabId) === stringTabId);

        if (matches.length > 0) {
            refreshWebSourceTokens(spotlightTabId, matches);
        }
    });


    if (currentBrowserTab && String(currentBrowserTab.tabId) === stringTabId) {
        (async () => {
            const text = await fetchFreshWebContent(stringTabId);
            if (text) {
                const count = (typeof LuminaToken !== 'undefined') ? LuminaToken.count(text) : Math.ceil(text.length / 4);
                currentBrowserTabTokens.set(stringTabId, count);
                updateWebChips();
            } else {
                currentBrowserTabTokens.delete(stringTabId);
                updateWebChips();
            }
        })();
    }
}

function isSelectionInsideEditable() {
    const sel = window.getSelection();

    if (sel && sel.rangeCount > 0 && sel.toString().trim().length > 0) {
        let node = sel.anchorNode;
        while (node && node !== document.documentElement) {
            if (node.nodeType === 1) {
                if (['INPUT', 'TEXTAREA', 'SELECT'].includes(node.tagName) ||
                    node.isContentEditable ||
                    node.getAttribute('contenteditable') === 'true' ||
                    node.getAttribute('role') === 'textbox'
                ) {
                    return true;
                }
            }
            node = node.parentNode || (node.host && node.host.nodeType === 1 ? node.host : null);
        }
    }


    const active = document.activeElement;
    if (active && (
        ['INPUT', 'TEXTAREA', 'SELECT', 'CANVAS'].includes(active.tagName) ||
        active.isContentEditable ||
        active.getAttribute('contenteditable') === 'true' ||
        active.getAttribute('role') === 'textbox'
    )) {
        return true;
    }

    return false;
}

function bindHistoryScroll(tab) {
    if (!tab || !tab.historyEl || tab.historyEl.__luminaScrollBound) return;
    tab.historyEl.__luminaScrollBound = true;
    let saveTimer = null;

    tab.historyEl.addEventListener('lumina:history-changed', (e) => {
        const force = e.detail && e.detail.force;
        saveTabsState(force);
    });

    tab.historyEl.addEventListener('scroll', () => {
        const scrollTop = tab.historyEl.scrollTop;
        const viewHeight = tab.historyEl.clientHeight || tab.historyEl.offsetHeight || 0;
        const scrollHeight = tab.historyEl.scrollHeight || 0;
        const nearBottom = scrollHeight - (scrollTop + viewHeight) <= 20;

        if (nearBottom) {
            tab.scrollTop = scrollTop;
            tab.isAtBottom = true;
            tab.scrollAnchorIndex = null;
            tab.scrollAnchorOffset = null;

            tab.userScrolledUp = false;
            if (tab.chatUIInstance) tab.chatUIInstance.disableAutoScroll = false;
        } else {
            tab.scrollTop = scrollTop;
            tab.isAtBottom = false;

            tab.userScrolledUp = true;
            if (tab.chatUIInstance) tab.chatUIInstance.disableAutoScroll = true;
        }
        const entries = tab.historyEl.querySelectorAll('.lumina-dict-entry');
        if (entries.length > 0) {
            if (nearBottom) {

                if (saveTimer) clearTimeout(saveTimer);
                saveTimer = setTimeout(() => {
                    saveTabsState();
                }, 200);
                return;
            }
            let anchorIndex = 0;
            for (let i = 0; i < entries.length; i++) {
                const entry = entries[i];
                if (entry.offsetTop + entry.offsetHeight >= scrollTop) {
                    anchorIndex = i;
                    break;
                }
            }
            tab.scrollAnchorIndex = anchorIndex;
            tab.scrollAnchorOffset = scrollTop - entries[anchorIndex].offsetTop;
        }
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            saveTabsState();
        }, 200);
    }, { passive: true });
}

function showTopbarLoading(pane) {
    const barId = (pane === 'secondary') ? 'topbar-progress-secondary' : 'topbar-progress';
    const bar = document.getElementById(barId);
    if (bar) {
        bar.style.transition = 'none';
        bar.style.transform = 'scaleX(0)';
        bar.classList.add('active');
        // Force reflow
        bar.offsetHeight;
        bar.style.transition = 'transform 0.4s cubic-bezier(0.1, 0.8, 0.3, 1), opacity 0.2s ease';
        bar.style.transform = 'scaleX(0.85)';
    }
}

function hideTopbarLoading(pane) {
    const barId = (pane === 'secondary') ? 'topbar-progress-secondary' : 'topbar-progress';
    const bar = document.getElementById(barId);
    if (bar) {
        bar.style.transition = 'transform 0.15s ease, opacity 0.15s ease';
        bar.style.transform = 'scaleX(1)';
        setTimeout(() => {
            bar.classList.remove('active');
            setTimeout(() => {
                bar.style.transform = 'scaleX(0)';
            }, 150);
        }, 150);
    }
}

function restoreScrollPosition(tab) {
    if (!tab || !tab.historyEl) return;
    const entries = tab.historyEl.querySelectorAll('.lumina-dict-entry');
    if (entries.length === 0) return;

    if (tab.scrollTop != null && tab.scrollTop !== -1) {
        tab.historyEl.scrollTop = tab.scrollTop;
        return;
    }

    if (tab.isAtBottom) {
        tab.historyEl.scrollTop = tab.historyEl.scrollHeight;
        return;
    }

    if (tab.scrollAnchorIndex != null && tab.scrollAnchorIndex < entries.length) {
        const anchor = entries[tab.scrollAnchorIndex];

        const baseTarget = LuminaChatUI.calculateInitialScrollTarget(anchor, tab.historyEl);
        tab.historyEl.scrollTop = baseTarget + (tab.scrollAnchorOffset || 0);
    }
}

function restoreLatestScrollPosition(tab) {
    if (!tab || !tab.historyEl) return;
    const entries = tab.historyEl.querySelectorAll('.lumina-dict-entry');
    if (entries.length === 0) return;

    const latestEntry = entries[entries.length - 1];
    const targetScrollTop = LuminaChatUI.calculateInitialScrollTarget(latestEntry, tab.historyEl);

    tab.historyEl.scrollTop = targetScrollTop;
    tab.scrollTop = targetScrollTop;
}

function scheduleScrollRestore(tab) {
    const _ssrPane = (typeof secondaryTab !== 'undefined' && tab === secondaryTab) ? 'secondary' : 'primary';
    showTopbarLoading(_ssrPane);
    if (tab?.historyEl) {
        tab.historyEl.style.opacity = '0';
        tab.historyEl.style.transition = 'none';
    }
    const performRestore = async () => {
        if (tab?.historyEl?.__processingPromises) {
            try {
                await Promise.all(tab.historyEl.__processingPromises);
            } catch (e) { }
            tab.historyEl.__processingPromises = null;
        }
        if (tab?.restoreLatestOnOpen) {
            restoreLatestScrollPosition(tab);
            tab.restoreLatestOnOpen = false;
        } else {
            restoreScrollPosition(tab);
        }
        if (tab?.historyEl) {
            tab.historyEl.style.opacity = '1';
            tab.historyEl.style.transition = '';
        }
        hideTopbarLoading(_ssrPane);
    };
    setTimeout(performRestore, 40);
}


async function handleRemoteSync(changes, areaName) {
    if (areaName !== 'local') return;


    if (changes[KEYS.tabs] || changes[KEYS.tabGroups]) {
        const newTabsMeta = changes[KEYS.tabs] ? changes[KEYS.tabs].newValue : null;
        const newGroupsMeta = changes[KEYS.tabGroups] ? changes[KEYS.tabGroups].newValue : null;

        if (newTabsMeta) {
            const currentActiveTab = tabs[activeTabIndex];
            const currentActiveSessionId = currentActiveTab ? currentActiveTab.sessionId : null;


            const currentTabIds = tabs.map(t => t.id).join(',');
            const nextTabIds = newTabsMeta.map(t => t.id).join(',');

            const metadataChanged = newTabsMeta.some((meta, i) => {
                const t = tabs[i];
                if (!t) return true;
                return t.title !== meta.title || t.sessionId !== meta.sessionId || (t.sparkId || null) !== (meta.sparkId || null);
            });

            if (currentTabIds !== nextTabIds || metadataChanged || (newGroupsMeta && JSON.stringify(newGroupsMeta) !== JSON.stringify(tabGroups))) {


                const nextIds = new Set(newTabsMeta.map(m => m.id));
                tabs = tabs.filter(t => {
                    if (nextIds.has(t.id)) return true;
                    if (t.historyEl) t.historyEl.remove();
                    return false;
                });


                for (let i = 0; i < newTabsMeta.length; i++) {
                    const meta = newTabsMeta[i];
                    let existing = tabs.find(t => t.id === meta.id);

                    if (existing) {
                        const isCurrentActive = (activeTabIndex !== -1 && tabs[activeTabIndex] && tabs[activeTabIndex].id === existing.id);
                        const sessionChanged = !isCurrentActive && existing.sessionId !== meta.sessionId;
                        existing.title = meta.title;
                        const oldSparkId = existing.sparkId;
                        existing.sparkId = meta.sparkId || null;
                        if (existing.chatUIInstance) {
                            existing.chatUIInstance.sparkId = existing.sparkId;
                        }
                        if (!isCurrentActive) {
                            existing.sessionId = meta.sessionId;
                        }

                        if (isCurrentActive && oldSparkId !== existing.sparkId) {
                            if (existing.sparkId) {
                                if (typeof openSparkChat === 'function') {
                                    openSparkChat(existing.sparkId);
                                }
                            } else {
                                if (typeof resetChat === 'function') {
                                    resetChat();
                                }
                            }
                        }

                        if (sessionChanged) {
                            existing.isHistoryLoaded = false;
                            const isActive = (activeTabIndex !== -1 && tabs[activeTabIndex] && tabs[activeTabIndex].id === existing.id);
                            if (isActive) {
                                ensureTabHistoryLoaded(existing);
                            }
                        }
                    } else {
                        const historyEl = document.createElement('div');
                        historyEl.className = 'lumina-chat-scroll-content';
                        historyEl.style.display = 'none';
                        const primaryContainer = document.querySelector('.lumina-chat-container') || container;
                        primaryContainer.appendChild(historyEl);

                        const newTab = {
                            id: meta.id,
                            title: meta.title || 'New Tab',
                            sessionId: meta.sessionId,
                            sparkId: meta.sparkId || null,
                            historyEl: historyEl,
                            chatUIInstance: new LuminaChatUI(container, {
                                isSpotlight: true,
                                skipInputSetup: true,
                                onSubmit: (text, images, extra) => handleSubmit(text, images, extra, newTab)
                            }),
                            isHistoryLoaded: false
                        };
                        newTab.chatUIInstance.historyEl = historyEl;
                        newTab.chatUIInstance.sparkId = newTab.sparkId;
                        historyEl.dataset.sessionId = newTab.sessionId;
                        newTab.chatUIInstance.initListeners(historyEl);
                        bindHistoryScroll(newTab);
                        tabs.push(newTab);
                    }
                }


                tabs.sort((a, b) => {
                    const idxA = newTabsMeta.findIndex(m => m.id === a.id);
                    const idxB = newTabsMeta.findIndex(m => m.id === b.id);
                    return idxA - idxB;
                });

                if (newGroupsMeta) tabGroups = newGroupsMeta;


                const counterData = await chrome.storage.local.get([KEYS.tabCounter]);
                if (counterData[KEYS.tabCounter]) tabCounter = counterData[KEYS.tabCounter];

                // Calculate the new activeGroupIndex based on the active sessionId to prevent focus/tab resets
                let resolvedActiveGroupIndex = activeGroupIndex;
                if (currentActiveSessionId) {
                    const targetTab = tabs.find(t => t.sessionId === currentActiveSessionId);
                    if (targetTab) {
                        const idx = tabGroups.findIndex(g => g.tabIds.includes(targetTab.id));
                        if (idx !== -1) {
                            resolvedActiveGroupIndex = idx;
                        }
                    }
                }
                if (resolvedActiveGroupIndex === -1 || resolvedActiveGroupIndex >= tabGroups.length) {
                    resolvedActiveGroupIndex = 0;
                }

                renderTabs();
                if (typeof renderSidebarTabs === 'function') renderSidebarTabs();

                if (activeGroupIndex !== resolvedActiveGroupIndex) {
                    switchGroup(resolvedActiveGroupIndex, true);
                } else {
                    activeGroupIndex = resolvedActiveGroupIndex;
                    const group = tabGroups[activeGroupIndex];
                    if (group) {
                        const primaryTab = tabs.find(t => t.id === group.tabIds[0]);
                        activeTabIndex = tabs.indexOf(primaryTab);
                        const secondaryTab = group.tabIds.length > 1 ? tabs.find(t => t.id === group.tabIds[1]) : null;
                        if (secondaryTab) {
                            secondaryActiveTabIndex = tabs.indexOf(secondaryTab);
                        }
                    }
                }
                syncSessionsWithBackground();
            }
        }
    }


    for (const key in changes) {
        if (key.startsWith('lumina_session_')) {
            const sid = key.replace('lumina_session_', '');
            const lastLocalSave = window._localSavedSessions?.[sid];
            const isRecentLocalSave = lastLocalSave && (Date.now() - lastLocalSave < 1000);
            if (isRecentLocalSave) {
                continue;
            }

            const affected = tabs.filter(t => t.sessionId === sid);
            if (affected.length > 0) {
                const isGeneratingLocally = (
                    (sharedInputUI && sharedInputUI.isGenerating && streamingTab && streamingTab.sessionId === sid) ||
                    (sharedInputUISecondary && sharedInputUISecondary.isGenerating && streamingTab && streamingTab.sessionId === sid)
                );

                if (!isGeneratingLocally) {
                    const messages = changes[key].newValue;
                    if (messages && Array.isArray(messages)) {
                        chrome.storage.local.get([ChatHistoryManager.STORAGE_KEY]).then(result => {
                            const sessions = result[ChatHistoryManager.STORAGE_KEY] || {};
                            const meta = sessions[sid] || {};
                            const chatData = {
                                ...meta,
                                messages: messages,
                                sessionId: sid,
                                timestamp: meta.createdAt || meta.updatedAt
                            };

                            affected.forEach(async (tab) => {
                                if (isRecentLocalSave && window._lastSavingHistoryEl === tab.historyEl) {
                                    return;
                                }
                                if (tab.historyEl) {
                                    const savedScrollTop = tab.historyEl.scrollTop;
                                    await ChatHistoryManager.restoreChat(chatData, tab.historyEl);
                                    normalizeRestoredHistory(tab.historyEl);
                                    if (tab.chatUIInstance) tab.chatUIInstance.syncStateFromDOM();

                                    const entries = tab.historyEl.querySelectorAll('.lumina-dict-entry');
                                    const lastEntry = entries[entries.length - 1];
                                    if (lastEntry && tab.chatUIInstance) {
                                        tab.chatUIInstance.clearEntryMargins(lastEntry);
                                        tab.chatUIInstance.adjustEntryMargin(lastEntry, 'immediate');
                                    }

                                    tab.historyEl.scrollTop = savedScrollTop;
                                }
                            });
                        });
                    }
                }
            }
        }
    }


    if (changes['lumina_chat_sessions']) {
        const oldSessions = changes['lumina_chat_sessions'].oldValue || {};
        const newSessions = changes['lumina_chat_sessions'].newValue || {};


        const deletedIds = Object.keys(oldSessions).filter(id => !newSessions[id]);

        if (deletedIds.length > 0) {
            let updated = false;
            tabs.forEach((tab, index) => {
                if (tab.sessionId && deletedIds.includes(tab.sessionId)) {
                    const isSecondary = (typeof isSplitMode !== 'undefined' && isSplitMode && index === secondaryActiveTabIndex);
                    const isActive = (index === activeTabIndex);
                    if (isActive || isSecondary) {
                        resetChat(isSecondary);
                        updated = true;
                    } else {
                        tab.title = 'New Tab';
                        tab.sessionId = null;
                        tab.sparkId = null;
                        if (tab.chatUIInstance) tab.chatUIInstance.sparkId = null;
                        tab.isHistoryLoaded = false;
                        if (tab.historyEl) {
                            tab.historyEl.removeAttribute('data-session-id');
                            tab.historyEl.innerHTML = '';
                        }
                        updated = true;
                    }
                }
            });
            if (updated) {
                renderTabs();
                if (typeof renderSidebarTabs === 'function') renderSidebarTabs();
                saveTabsState();
            }
        }
    }
}

function normalizeTabs() {

    const idMap = {};
    tabs.forEach((tab, index) => {
        const newNum = index + 1;
        const newId = `tab-${newNum}`;
        const oldId = tab.id;

        idMap[oldId] = newId;
        tab.id = newId;

        if (tab.historyEl) {
            tab.historyEl.id = `chat-history-tab-${newNum}`;
        }
    });


    tabGroups.forEach(group => {
        if (group.tabIds) {
            group.tabIds = group.tabIds.map(oldId => idMap[oldId] || oldId);
        }
    });


    tabCounter = tabs.length;

    renderTabs();
    saveTabsState();
}

async function ensureTabHistoryLoaded(tab) {
    if (!tab || tab.isHistoryLoaded || tab.isLoadingHistory) return;
    if (tab.sessionId) {
        tab.isLoadingHistory = true;

        const isSecondary = (typeof secondaryActiveTabIndex !== 'undefined' && secondaryActiveTabIndex !== -1 && tabs[secondaryActiveTabIndex] && tabs[secondaryActiveTabIndex].id === tab.id) || tab.id === 'tab-secondary';
        const pane = isSecondary ? 'secondary' : 'primary';

        showTopbarLoading(pane);

        if (tab.historyEl) {
            tab.historyEl.style.opacity = '0';
            tab.historyEl.style.transition = 'none';
        }

        try {
            const contentKey = `lumina_session_${tab.sessionId}`;
            const contentData = await chrome.storage.local.get([contentKey]);
            const messages = contentData[contentKey];
            if (messages) {
                const result = await chrome.storage.local.get([ChatHistoryManager.STORAGE_KEY]);
                const sessions = result[ChatHistoryManager.STORAGE_KEY] || {};
                const meta = sessions[tab.sessionId] || {};
                const chatData = {
                    ...meta,
                    messages: messages,
                    sessionId: tab.sessionId,
                    timestamp: meta.createdAt || meta.updatedAt
                };

                await ChatHistoryManager.restoreChat(chatData, tab.historyEl);
                normalizeRestoredHistory(tab.historyEl);

                const allEntries = tab.historyEl.querySelectorAll('.lumina-dict-entry');
                if (allEntries.length > 0 && tab.chatUIInstance) {
                    const lastEntry = allEntries[allEntries.length - 1];
                    tab.chatUIInstance.clearEntryMargins(lastEntry);
                    tab.chatUIInstance.adjustEntryMargin(lastEntry, 'immediate');
                }

                scheduleScrollRestore(tab);
                if (window.LuminaAnnotation) {
                    LuminaAnnotation.loadHighlights(tab.id);
                }
            }
        } catch (e) {
            console.error('Failed to load tab history from JSON:', e);
        } finally {
            tab.isLoadingHistory = false;
            tab.isHistoryLoaded = true;
            hideTopbarLoading(pane);
            if (typeof updateWelcomeScreenState === 'function') {
                updateWelcomeScreenState(pane);
            }
        }
    } else {
        tab.isHistoryLoaded = true;
    }
}

async function initTabs() {
    const topBar = document.getElementById('spotlight-topbar');
    if (topBar) {
        topBar.style.display = 'flex';
    }

    const primaryContainer = document.querySelector('#pane-primary .lumina-chat-container');
    const secondaryContainer = document.querySelector('#pane-secondary .lumina-chat-container');

    if (primaryContainer) {
        primaryContainer.querySelectorAll('.lumina-chat-scroll-content').forEach(el => el.remove());
    }
    if (secondaryContainer) {
        secondaryContainer.querySelectorAll('.lumina-chat-scroll-content').forEach(el => el.remove());
    }

    tabs = [];

    const initialHistory = document.createElement('div');
    initialHistory.id = 'chat-history';
    initialHistory.className = 'lumina-chat-scroll-content';
    initialHistory.style.display = 'none';
    if (primaryContainer) primaryContainer.appendChild(initialHistory);

    const initialHistorySecondary = document.createElement('div');
    initialHistorySecondary.id = 'chat-history-secondary';
    initialHistorySecondary.className = 'lumina-chat-scroll-content';
    initialHistorySecondary.style.display = 'none';
    if (secondaryContainer) secondaryContainer.appendChild(initialHistorySecondary);

    try {
        let namespacedExists = false;
        try {
            const check = await chrome.storage.local.get([KEYS.tabs]);
            if (check[KEYS.tabs] && check[KEYS.tabs].length > 0) {
                namespacedExists = true;
            }
        } catch (e) { }

        if (!namespacedExists) {
            try {
                const globalData = await chrome.storage.local.get([
                    GLOBAL_KEYS.tabs,
                    GLOBAL_KEYS.activeTabIndex,
                    GLOBAL_KEYS.secondaryTabIndex,
                    GLOBAL_KEYS.isSplitMode,
                    GLOBAL_KEYS.splitRatio,
                    GLOBAL_KEYS.tabGroups,
                    GLOBAL_KEYS.activeGroupIndex,
                    GLOBAL_KEYS.tabCounter,
                    GLOBAL_KEYS.groupCounter
                ]);
                if (globalData[GLOBAL_KEYS.tabs] && globalData[GLOBAL_KEYS.tabs].length > 0) {
                    const toSet = {
                        [KEYS.tabs]: globalData[GLOBAL_KEYS.tabs],
                        [KEYS.activeTabIndex]: globalData[GLOBAL_KEYS.activeTabIndex] ?? 0,
                        [KEYS.secondaryTabIndex]: globalData[GLOBAL_KEYS.secondaryTabIndex] ?? -1,
                        [KEYS.isSplitMode]: globalData[GLOBAL_KEYS.isSplitMode] ?? false,
                        [KEYS.splitRatio]: globalData[GLOBAL_KEYS.splitRatio] ?? 50,
                        [KEYS.tabGroups]: globalData[GLOBAL_KEYS.tabGroups] || [{ id: 'group-1', tabIds: ['tab-1'], ratio: 100 }],
                        [KEYS.activeGroupIndex]: globalData[GLOBAL_KEYS.activeGroupIndex] ?? 0,
                        [KEYS.tabCounter]: globalData[GLOBAL_KEYS.tabCounter] ?? 1,
                        [KEYS.groupCounter]: globalData[GLOBAL_KEYS.groupCounter] ?? 1
                    };
                    await chrome.storage.local.set(toSet);
                }
            } catch (e) {
                console.warn('[Spotlight] Failed to copy global keys to namespace keys:', e);
            }
        }

        const data = await chrome.storage.local.get([
            KEYS.tabs,
            KEYS.activeTabIndex,
            KEYS.secondaryTabIndex,
            KEYS.isSplitMode,
            KEYS.splitRatio,
            'lumina_youtube_trigger',
            'lumina_session_settings',
            'lumina_sparks'
        ]);
        sessionSettings = data.lumina_session_settings || {};
        sparksCache = data.lumina_sparks || {};

        const urlParams = new URLSearchParams(window.location.search);
        const sidParam = urlParams.get('sid') || urlParams.get('session_id');
        const urlSessionIds = sidParam ? sidParam.split(',') : [];
        const urlSessionId = urlSessionIds[0] || null;
        const urlSecSessionId = urlSessionIds[1] || null;

        let savedTab = null;
        if (data[KEYS.tabs] && data[KEYS.tabs].length > 0) {
            const activeIdx = data[KEYS.activeTabIndex] || 0;
            savedTab = data[KEYS.tabs][activeIdx] || data[KEYS.tabs][0];
        }

        let sessionId = shouldStartNewChat ? null : (urlSessionId || savedTab?.sessionId || null);
        let tabTitle = 'Chat';
        let meta = {};

        if (sessionId) {
            const result = await chrome.storage.local.get([ChatHistoryManager.STORAGE_KEY]);
            const sessions = result[ChatHistoryManager.STORAGE_KEY] || {};
            meta = sessions[sessionId] || {};
            tabTitle = meta.title || 'Chat';
        }

        let activeModel = getPaneActiveModel('primary');
        let activeThinking = getPaneActiveThinking('primary');

        if (!activeModel) {
            activeModel = savedTab?.selectedModel || (sessionId ? (sessionSettings[sessionId]?.selectedModel || meta.selectedModel) : sessionSettings['null']?.selectedModel) || null;
            if (activeModel) {
                setPaneActiveModel('primary', activeModel);
            }
        }
        if (!activeThinking) {
            activeThinking = savedTab?.thinkingLevel || (sessionId ? (sessionSettings[sessionId]?.thinkingLevel || meta.thinkingLevel) : sessionSettings['null']?.thinkingLevel) || null;
            if (activeThinking) {
                setPaneActiveThinking('primary', activeThinking);
            }
        }

        const singleTab = {
            id: 'tab-1',
            title: tabTitle,
            sessionId: sessionId,
            sparkId: urlSessionId ? (meta.sparkId || null) : (savedTab?.sparkId || null),
            scrollTop: savedTab?.scrollTop ?? -1,
            scrollAnchorIndex: savedTab?.scrollAnchorIndex ?? null,
            scrollAnchorOffset: savedTab?.scrollAnchorOffset ?? null,
            isAtBottom: savedTab?.isAtBottom ?? true,
            restoreLatestOnOpen: true,
            historyEl: initialHistory,
            selectedModel: activeModel,
            thinkingLevel: activeThinking,
            chatUIInstance: new LuminaChatUI(container, {
                isSpotlight: true,
                skipInputSetup: true,
                onSubmit: (text, images, extra) => handleSubmit(text, images, extra, singleTab)
            }),
            isHistoryLoaded: false
        };
        singleTab.chatUIInstance.historyEl = initialHistory;
        singleTab.chatUIInstance.thinkingLevel = singleTab.thinkingLevel || null;
        singleTab.chatUIInstance.sparkId = singleTab.sparkId;
        if (singleTab.sessionId) {
            initialHistory.dataset.sessionId = singleTab.sessionId;
        } else {
            initialHistory.removeAttribute('data-session-id');
        }
        singleTab.chatUIInstance.initListeners(initialHistory);
        bindHistoryScroll(singleTab);
        tabs.push(singleTab);

        initialHistory.style.display = 'block';
        setTimeout(() => {
            ensureTabHistoryLoaded(singleTab);
        }, 0);

        activeTabIndex = 0;
        activeGroupIndex = 0;
        tabGroups = [{ id: 'group-1', tabIds: ['tab-1'], ratio: 100 }];

        // Check split mode
        let storedSplitMode = data[KEYS.isSplitMode] ?? false;
        let savedSecTab = null;
        if (data[KEYS.tabs] && data[KEYS.tabs].length > 1) {
            savedSecTab = data[KEYS.tabs][1];
        }
        let secSessionId = urlSecSessionId || savedSecTab?.sessionId || null;

        if (storedSplitMode && (!secSessionId || window.innerWidth < 900)) {
            storedSplitMode = false;
            chrome.storage.local.set({
                [KEYS.isSplitMode]: false,
                [GLOBAL_KEYS.isSplitMode]: false
            });
        }

        if (storedSplitMode) {
            isSplitMode = true;
            secondaryActiveTabIndex = 1;
            const splitContainer = document.getElementById('split-container');
            splitContainer?.classList.add('split-mode');
            const paneSecondary = document.getElementById('pane-secondary');
            const resizer = document.getElementById('spotlight-resizer');
            const panePrimary = document.getElementById('pane-primary');
            if (paneSecondary) paneSecondary.style.display = 'flex';
            if (resizer) resizer.style.display = 'flex';

            let ratio = data[KEYS.splitRatio] || 50;
            if (panePrimary && paneSecondary) {
                panePrimary.style.flex = `${ratio}`;
                paneSecondary.style.flex = `${100 - ratio}`;
            }
            let secTabTitle = savedSecTab?.title || 'Chat 2';
            let secMeta = {};

            if (secSessionId) {
                const result = await chrome.storage.local.get([ChatHistoryManager.STORAGE_KEY]);
                const sessions = result[ChatHistoryManager.STORAGE_KEY] || {};
                secMeta = sessions[secSessionId] || {};
                secTabTitle = secMeta.title || 'Chat 2';
            }

            let secActiveModel = getPaneActiveModel('secondary');
            let secActiveThinking = getPaneActiveThinking('secondary');

            if (!secActiveModel) {
                secActiveModel = savedSecTab?.selectedModel || (secSessionId ? (sessionSettings[secSessionId]?.selectedModel || secMeta.selectedModel) : sessionSettings['null']?.selectedModel) || null;
                if (secActiveModel) {
                    setPaneActiveModel('secondary', secActiveModel);
                }
            }
            if (!secActiveThinking) {
                secActiveThinking = savedSecTab?.thinkingLevel || (secSessionId ? (sessionSettings[secSessionId]?.thinkingLevel || secMeta.thinkingLevel) : sessionSettings['null']?.thinkingLevel) || null;
                if (secActiveThinking) {
                    setPaneActiveThinking('secondary', secActiveThinking);
                }
            }

            const secondaryTab = {
                id: 'tab-secondary',
                title: secTabTitle,
                sessionId: secSessionId,
                sparkId: savedSecTab?.sparkId || null,
                scrollTop: savedSecTab?.scrollTop ?? -1,
                scrollAnchorIndex: savedSecTab?.scrollAnchorIndex ?? null,
                scrollAnchorOffset: savedSecTab?.scrollAnchorOffset ?? null,
                isAtBottom: savedSecTab?.isAtBottom ?? true,
                restoreLatestOnOpen: true,
                historyEl: initialHistorySecondary,
                selectedModel: secActiveModel,
                thinkingLevel: secActiveThinking,
                chatUIInstance: new LuminaChatUI(secondaryContainer || container, {
                    isSpotlight: true,
                    skipInputSetup: true,
                    onSubmit: (text, images, extra) => handleSubmit(text, images, extra, secondaryTab)
                }),
                isHistoryLoaded: false
            };
            secondaryTab.chatUIInstance.historyEl = initialHistorySecondary;
            secondaryTab.chatUIInstance.thinkingLevel = secondaryTab.thinkingLevel || null;
            secondaryTab.chatUIInstance.sparkId = secondaryTab.sparkId;
            if (secondaryTab.sessionId) {
                initialHistorySecondary.dataset.sessionId = secondaryTab.sessionId;
            } else {
                initialHistorySecondary.removeAttribute('data-session-id');
            }
            secondaryTab.chatUIInstance.initListeners(initialHistorySecondary);
            bindHistoryScroll(secondaryTab);
            tabs.push(secondaryTab);
            chatUISecondary = secondaryTab.chatUIInstance;

            setTimeout(() => {
                initTopbarModelSelector('secondary');
            }, 0);

            initialHistorySecondary.style.display = 'block';
            setTimeout(() => {
                ensureTabHistoryLoaded(secondaryTab);
            }, 0);
        }

        const modelData = await chrome.storage.local.get(['lastUsedModel']);
        if (modelData.lastUsedModel && modelData.lastUsedModel.model) {
            if (!singleTab.selectedModel) singleTab.selectedModel = { ...modelData.lastUsedModel };
            singleTab.chatUIInstance.activeTabModel = { ...singleTab.selectedModel };

            if (storedSplitMode && tabs[1]) {
                if (!tabs[1].selectedModel) tabs[1].selectedModel = { ...modelData.lastUsedModel };
                tabs[1].chatUIInstance.activeTabModel = { ...tabs[1].selectedModel };
            }
        }

        if (data.lumina_youtube_trigger) {
            setTimeout(() => handleYouTubeTrigger(data.lumina_youtube_trigger), 100);
        }
    } catch (e) {
        console.error('[Spotlight] initTabs failed:', e);
    }


    const primaryC = document.querySelector('.lumina-chat-container') || container;
    bindContainerWheelForward(primaryC);


    const newTabBtn = document.getElementById('new-tab-btn');
    if (newTabBtn) {
        const newBtn = newTabBtn.cloneNode(true);
        newTabBtn.parentNode.replaceChild(newBtn, newTabBtn);
        newBtn.addEventListener('click', () => createTab());
    }

    const topbarNewChatBtn = document.getElementById('topbar-new-chat-btn');
    if (topbarNewChatBtn) {
        topbarNewChatBtn.addEventListener('click', () => resetChat(false));
    }

    const topbarNewChatBtnSec = document.getElementById('topbar-new-chat-btn-secondary');
    if (topbarNewChatBtnSec) {
        topbarNewChatBtnSec.addEventListener('click', () => resetChat(true));
    }

    const topbarMoreBtn = document.getElementById('topbar-more-btn');
    const topbarDropdown = document.getElementById('topbar-dropdown-menu');
    if (topbarMoreBtn && topbarDropdown) {
        topbarMoreBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = topbarDropdown.style.display === 'flex';
            if (isOpen) {
                topbarDropdown.style.display = 'none';
            } else {
                const secModelDropdown = document.getElementById('topbar-model-dropdown-secondary');
                const mainModelDropdown = document.getElementById('topbar-model-dropdown');
                const secMoreDropdown = document.getElementById('topbar-dropdown-menu-secondary');
                if (secModelDropdown) secModelDropdown.classList.remove('active');
                if (mainModelDropdown) mainModelDropdown.classList.remove('active');
                if (secMoreDropdown) secMoreDropdown.style.display = 'none';

                topbarDropdown.style.display = 'flex';
                topbarDropdown.classList.remove('expanded');
                renderDropdownMenu('primary');
            }
        });

        document.addEventListener('click', (e) => {
            if (!topbarDropdown.contains(e.target) && e.target !== topbarMoreBtn) {
                topbarDropdown.style.display = 'none';
            }
        });
    }

    const topbarMoreBtnSec = document.getElementById('topbar-more-btn-secondary');
    const topbarDropdownSec = document.getElementById('topbar-dropdown-menu-secondary');
    if (topbarMoreBtnSec && topbarDropdownSec) {
        topbarMoreBtnSec.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = topbarDropdownSec.style.display === 'flex';
            if (isOpen) {
                topbarDropdownSec.style.display = 'none';
            } else {
                const mainModelDropdown = document.getElementById('topbar-model-dropdown');
                const secModelDropdown = document.getElementById('topbar-model-dropdown-secondary');
                const mainMoreDropdown = document.getElementById('topbar-dropdown-menu');
                if (mainModelDropdown) mainModelDropdown.classList.remove('active');
                if (secModelDropdown) secModelDropdown.classList.remove('active');
                if (mainMoreDropdown) mainMoreDropdown.style.display = 'none';

                topbarDropdownSec.style.display = 'flex';
                topbarDropdownSec.classList.remove('expanded');
                renderDropdownMenu('secondary');
            }
        });

        document.addEventListener('click', (e) => {
            if (!topbarDropdownSec.contains(e.target) && e.target !== topbarMoreBtnSec) {
                topbarDropdownSec.style.display = 'none';
            }
        });
    }


    window.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 't') {
            e.preventDefault();
            createTab();
            return;
        }
        if ((e.metaKey || e.ctrlKey) && e.key === 'w') {
            e.preventDefault();
            closeGroup(activeGroupIndex);
            return;
        }
        if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            let targetIdx = activeTabIndex;
            try {

                const hoverEls = document.querySelectorAll(':hover');
                if (hoverEls.length > 0) {
                    const deepestHover = hoverEls[hoverEls.length - 1];
                    if (isSplitMode && deepestHover.closest('#pane-secondary') && typeof secondaryActiveTabIndex !== 'undefined') {
                        targetIdx = secondaryActiveTabIndex;
                    }
                }
            } catch (err) { }
            duplicateTab(targetIdx);
            return;
        }
        if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'o') {
            e.preventDefault();
            resetChat();
            return;
        }
        if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
            e.preventDefault();
            resetChat();
            return;
        }
    }, true);
    updatePaneBlankState();
}

function createTab(switchToIt = true) {
    const isSecondary = (typeof isSplitMode !== 'undefined' && isSplitMode && typeof hoveredPane !== 'undefined' && hoveredPane === 'secondary');
    resetChat(isSecondary);
}

function duplicateTab(index) {
    // No-op in single tab mode
}

function switchGroup(groupIndex, skipScrollRestore = false) {
    if (groupIndex < 0 || groupIndex >= tabGroups.length) return;

    const previousGroup = (activeGroupIndex >= 0 && activeGroupIndex < tabGroups.length) ? tabGroups[activeGroupIndex] : null;
    const previousPrimaryTab = previousGroup ? tabs.find(t => t.id === previousGroup.tabIds[0]) : null;
    const previousSecondaryTab = previousGroup && previousGroup.tabIds.length > 1
        ? tabs.find(t => t.id === previousGroup.tabIds[1])
        : null;


    if (activeGroupIndex >= 0 && activeGroupIndex < tabGroups.length) {
        const oldGroup = tabGroups[activeGroupIndex];
        const oldPrimary = tabs.find(t => t.id === oldGroup.tabIds[0]);
        const oldSecondary = oldGroup.tabIds.length > 1 ? tabs.find(t => t.id === oldGroup.tabIds[1]) : null;

        if (oldPrimary) {
            if (sharedInputUI?.getInputState) oldPrimary.inputState = sharedInputUI.getInputState();
            oldPrimary.selectedModel = sharedInputUI?.activeTabModel || oldPrimary.selectedModel || null;
            oldPrimary.thinkingLevel = sharedInputUI?.thinkingLevel || oldPrimary.thinkingLevel || null;
        }
        if (oldSecondary) {
            if (sharedInputUISecondary?.getInputState) oldSecondary.inputStateSecondary = sharedInputUISecondary.getInputState();
            oldSecondary.selectedModel = sharedInputUISecondary?.activeTabModel || oldSecondary.selectedModel || null;
            oldSecondary.thinkingLevel = sharedInputUISecondary?.thinkingLevel || oldSecondary.thinkingLevel || null;
        }
    }


    tabs.forEach(t => {
        if (t.historyEl) t.historyEl.style.display = 'none';
    });

    activeGroupIndex = groupIndex;
    const group = tabGroups[groupIndex];

    const primaryTab = tabs.find(t => t.id === group.tabIds[0]);
    const secondaryTab = group.tabIds.length > 1 ? tabs.find(t => t.id === group.tabIds[1]) : null;

    ensureTabHistoryLoaded(primaryTab);
    if (secondaryTab) {
        ensureTabHistoryLoaded(secondaryTab);
    }

    activeTabIndex = tabs.indexOf(primaryTab);

    isSplitMode = false;

    secondaryActiveTabIndex = -1;

    const primaryContainer = document.querySelector('.lumina-chat-container');
    primaryContainer.appendChild(primaryTab.historyEl);
    primaryTab.historyEl.style.display = 'block';

    chatUI = primaryTab.chatUIInstance;
    chatUI.inputPaneEl = document.getElementById('input-area');
    const sidKey = primaryTab.sessionId || 'null';
    const savedSettings = sessionSettings[sidKey] || {};
    primaryTab.selectedModel = primaryTab.selectedModel || savedSettings.selectedModel || null;
    primaryTab.thinkingLevel = primaryTab.thinkingLevel || savedSettings.thinkingLevel || null;
    setPaneActiveModel('primary', primaryTab.selectedModel);
    setPaneActiveThinking('primary', primaryTab.thinkingLevel);
    setPaneActiveModel('secondary', null);
    setPaneActiveThinking('secondary', null);
    if (sharedInputUI) {
        sharedInputUI.historyEl = primaryTab.historyEl;
        sharedInputUI.restoreInputState(primaryTab.inputState || null);
        sharedInputUI.activeTabModel = primaryTab.selectedModel ? { ...primaryTab.selectedModel } : null;
        sharedInputUI.thinkingLevel = primaryTab.thinkingLevel || null;
        if (typeof sharedInputUI.refreshModelSelector === 'function') sharedInputUI.refreshModelSelector();
        if (typeof sharedInputUI.refreshReasoningSelector === 'function') sharedInputUI.refreshReasoningSelector();
    }
    updateInputPlaceholder();
    syncTabUI(primaryTab, false, skipScrollRestore);


    loadCurrentWebSelection(primaryTab?.id || null);
    updateWebChips();

    if (typeof window.updateTopbarModelSelector === 'function') {
        window.updateTopbarModelSelector();
    }

    renderTabs();
    saveTabsState();
    if (primaryTab && primaryTab.sessionId) {
        updateUrlSessionId(primaryTab.sessionId);
    }

    if (window.LuminaAnnotation) {
        LuminaAnnotation.clearAllHighlights();
        LuminaAnnotation.loadHighlights(primaryTab.id);
        if (isSplitMode && secondaryTab) {
            LuminaAnnotation.loadHighlights(secondaryTab.id);
        }
    }
}

function activateSubTab(groupIndex, targetTabId) {
    if (groupIndex < 0 || groupIndex >= tabGroups.length) return;

    const group = tabGroups[groupIndex];
    if (!group || !Array.isArray(group.tabIds) || group.tabIds.length === 0) return;

    const targetIndex = group.tabIds.indexOf(targetTabId);
    if (targetIndex === -1) {
        switchGroup(groupIndex);
        return;
    }

    if (targetIndex > 0) {
        const [movedTabId] = group.tabIds.splice(targetIndex, 1);
        group.tabIds.unshift(movedTabId);
    }

    switchGroup(groupIndex);
}

function syncTabUI(tab, isSecondary = false, skipScrollRestore = false) {
    if (!tab || !tab.historyEl) return;

    if (tab.scrollTop !== -1) {
        tab.historyEl.scrollTop = tab.scrollTop;
    }

    const allEntries = tab.historyEl.querySelectorAll('.lumina-dict-entry');
    if (allEntries.length > 0) {
        const lastEntry = allEntries[allEntries.length - 1];
        requestAnimationFrame(() => {
            tab.chatUIInstance.adjustEntryMargin(lastEntry, 'none');
        });
    }

    const regenBtn = document.getElementById('lumina-regenerate-btn');
    if (regenBtn) {
        const hasEntry = tab.historyEl.querySelector('.lumina-dict-entry, .lumina-translation-card');
        regenBtn.style.display = hasEntry ? 'flex' : 'none';
    }

    if (!skipScrollRestore) {
        scheduleScrollRestore(tab);
    }
}

function applySplit(primaryTabId, secondaryTabId, ratio = 50) {
    isApplyingSplit = true;


    const group1Idx = tabGroups.findIndex(g => g.tabIds.includes(primaryTabId));
    let group2Idx = tabGroups.findIndex(g => g.tabIds.includes(secondaryTabId));

    if (group1Idx === -1 || group2Idx === -1) return;


    if (group1Idx === group2Idx) {

        const g = tabGroups[group1Idx];
        if (g.tabIds[0] !== primaryTabId) {
            g.tabIds.reverse();
        }
        switchGroup(group1Idx);
        isApplyingSplit = false;
        return;
    }


    const g1 = tabGroups[group1Idx];
    const g2 = tabGroups[group2Idx];

    g2.tabIds = g2.tabIds.filter(id => id !== secondaryTabId);


    if (g1.tabIds.length >= 2) {
        const expelledTabId = g1.tabIds[1];
        g1.tabIds = [g1.tabIds[0]];


        const tabIndex = tabs.findIndex(t => t.id === expelledTabId);
        if (tabIndex !== -1) {
            const tabToRemove = tabs[tabIndex];
            tabs.splice(tabIndex, 1);
            if (tabToRemove.historyEl) tabToRemove.historyEl.remove();
        }
    }


    g1.tabIds.push(secondaryTabId);
    g1.ratio = ratio;


    if (g2.tabIds.length === 0) {
        const idxToRemove = tabGroups.findIndex(g => g.id === g2.id);
        if (idxToRemove !== -1) tabGroups.splice(idxToRemove, 1);
    }


    const newG1Idx = tabGroups.findIndex(g => g.id === g1.id);

    switchGroup(newG1Idx);
    isApplyingSplit = false;
    saveTabsState();
}

function deactivateSplit() {
}

function setupResizer() {
    const resizer = document.getElementById('spotlight-resizer');
    const panePrimary = document.getElementById('pane-primary');
    const paneSecondary = document.getElementById('pane-secondary');
    const splitContainer = document.getElementById('split-container');
    if (!resizer || !panePrimary || !paneSecondary || !splitContainer) return;

    let isDragging = false;
    let animationFrameId = null;

    resizer.addEventListener('mousedown', (e) => {
        e.preventDefault();
        isDragging = true;
        resizerDragging = true;
        resizer.classList.add('dragging');
        document.body.style.cursor = 'col-resize';
        panePrimary.style.pointerEvents = 'none';
        paneSecondary.style.pointerEvents = 'none';
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;

        if (animationFrameId) return;

        animationFrameId = requestAnimationFrame(() => {
            animationFrameId = null;
            if (!isDragging) return;

            const containerRect = splitContainer.getBoundingClientRect();
            const paddingLeft = parseFloat(window.getComputedStyle(splitContainer).paddingLeft) || 0;
            const paddingRight = parseFloat(window.getComputedStyle(splitContainer).paddingRight) || 0;

            const relativeX = e.clientX - containerRect.left - paddingLeft;
            const availableWidth = containerRect.width - paddingLeft - paddingRight - resizer.offsetWidth;

            if (availableWidth <= 0) return;

            let percentage = (relativeX / availableWidth) * 100;
            if (percentage < 20) percentage = 20;
            if (percentage > 80) percentage = 80;

            // Auto-snap to center (50%) when close (between 47.5% and 52.5%)
            if (percentage >= 47.5 && percentage <= 52.5) {
                percentage = 50;
            }

            panePrimary.style.flex = `${percentage}`;
            paneSecondary.style.flex = `${100 - percentage}`;
        });
    });

    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            resizerDragging = false;
            resizer.classList.remove('dragging');
            document.body.style.cursor = '';
            panePrimary.style.pointerEvents = '';
            paneSecondary.style.pointerEvents = '';

            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
                animationFrameId = null;
            }

            const newRatio = parseFloat(panePrimary.style.flex) || 50;
            chrome.storage.local.set({
                [KEYS.splitRatio]: newRatio,
                [GLOBAL_KEYS.splitRatio]: newRatio
            });
        }
    });
}

function closeTab(tabId) {
    const tabIndex = tabs.findIndex(t => t.id === tabId);
    if (tabIndex === -1) return;

    const tabToRemove = tabs[tabIndex];


    const groupIdx = tabGroups.findIndex(g => g.tabIds.includes(tabId));
    if (groupIdx !== -1) {
        const group = tabGroups[groupIdx];
        group.tabIds = group.tabIds.filter(id => id !== tabId);

        if (group.tabIds.length === 0) {

            tabGroups.splice(groupIdx, 1);
            if (activeGroupIndex >= tabGroups.length) {
                activeGroupIndex = Math.max(0, tabGroups.length - 1);
            } else if (activeGroupIndex > groupIdx) {
                activeGroupIndex--;
            }
        } else if (activeGroupIndex === groupIdx) {


        }
    }


    tabs.splice(tabIndex, 1);
    if (tabToRemove.historyEl) tabToRemove.historyEl.remove();


    if (tabToRemove.sessionId) {
        chrome.storage.local.remove([`spotlight_history_${tabToRemove.sessionId}`]);
    }


    const storageKeys = Object.keys(localStorage).filter(key =>
        key.startsWith(`${WEB_SOURCE_SELECTION_STORAGE_PREFIX}${tabId}_`)
    );
    storageKeys.forEach(key => localStorage.removeItem(key));


    const idMap = {};
    tabs.forEach((t, i) => {
        const newId = `tab-${i + 1}`;
        idMap[t.id] = newId;
        t.id = newId;
        if (t.historyEl) t.historyEl.id = `chat-history-tab-${i + 1}`;
    });
    tabGroups.forEach(g => {
        if (g.tabIds) g.tabIds = g.tabIds.map(id => idMap[id] || id);
    });
    tabCounter = tabs.length;

    if (tabGroups.length === 0) {
        createTab();
    } else {
        switchGroup(activeGroupIndex);
    }
    saveTabsState();
}

function closeGroup(groupIndex) {
    if (groupIndex < 0 || groupIndex >= tabGroups.length) return;
    const group = tabGroups[groupIndex];

    const idsToClose = [...group.tabIds];

    idsToClose.forEach(id => closeTab(id));
}

function updateTabTitle(chatUIInstance, title) {

    const tab = tabs.find(t => t.chatUIInstance === chatUIInstance);
    if (tab) {
        tab.title = title;
        renderTabs();
        saveTabsState();
    }
}

function saveTabsState(forceSaveChat = false) {
    const tabsMetadata = tabs.map(tab => {
        if (tab.chatUIInstance) {
            tab.selectedModel = tab.chatUIInstance.activeTabModel || tab.selectedModel || null;
            tab.thinkingLevel = tab.chatUIInstance.thinkingLevel || tab.thinkingLevel || null;
        }
        return {
            id: tab.id,
            title: tab.title,
            sessionId: tab.sessionId,
            sparkId: tab.sparkId || null,
            scrollTop: tab.historyEl ? tab.historyEl.scrollTop : (tab.scrollTop ?? -1),
            scrollAnchorIndex: tab.scrollAnchorIndex,
            scrollAnchorOffset: tab.scrollAnchorOffset,
            isAtBottom: !!tab.isAtBottom,
            selectedModel: tab.selectedModel || null,
            thinkingLevel: tab.thinkingLevel || null
        };
    });

    chrome.storage.local.set({
        [KEYS.tabs]: tabsMetadata,
        [KEYS.tabCounter]: tabCounter,
        [KEYS.activeTabIndex]: activeTabIndex,
        [KEYS.tabGroups]: tabGroups,
        [KEYS.activeGroupIndex]: activeGroupIndex,
        [KEYS.groupCounter]: groupCounter,

        // Also write to global keys so new window sessions inherit this state
        [GLOBAL_KEYS.tabs]: tabsMetadata,
        [GLOBAL_KEYS.tabCounter]: tabCounter,
        [GLOBAL_KEYS.activeTabIndex]: activeTabIndex,
        [GLOBAL_KEYS.tabGroups]: tabGroups,
        [GLOBAL_KEYS.activeGroupIndex]: activeGroupIndex,
        [GLOBAL_KEYS.groupCounter]: groupCounter
    });


    window._localSavedSessions = window._localSavedSessions || {};
    const activeTab = (typeof isSplitMode !== 'undefined' && isSplitMode && typeof hoveredPane !== 'undefined' && hoveredPane === 'secondary')
        ? (secondaryActiveTabIndex >= 0 ? tabs[secondaryActiveTabIndex] : null)
        : (activeTabIndex >= 0 ? tabs[activeTabIndex] : null);

    const savedSessionIds = new Set();

    if (activeTab && activeTab.sessionId && activeTab.historyEl) {
        savedSessionIds.add(activeTab.sessionId);
        window._localSavedSessions[activeTab.sessionId] = Date.now();
        window._lastSavingHistoryEl = activeTab.historyEl;
        if (typeof ChatHistoryManager !== 'undefined') {
            ChatHistoryManager.saveCurrentChat(activeTab.historyEl, activeTab.sessionId, activeTab.sparkId, forceSaveChat, {
                selectedModel: activeTab.selectedModel,
                thinkingLevel: activeTab.thinkingLevel
            });
        }
    }

    tabs.forEach(tab => {
        if (tab !== activeTab && tab.sessionId && tab.historyEl) {
            if (savedSessionIds.has(tab.sessionId)) {
                return;
            }
            savedSessionIds.add(tab.sessionId);
            window._localSavedSessions[tab.sessionId] = Date.now();
            if (typeof ChatHistoryManager !== 'undefined') {
                ChatHistoryManager.saveCurrentChat(tab.historyEl, tab.sessionId, tab.sparkId, forceSaveChat, {
                    selectedModel: tab.selectedModel,
                    thinkingLevel: tab.thinkingLevel
                });
            }
        }
    });
}

function normalizeRestoredHistory(historyEl) {
    if (!historyEl) return;

    historyEl.querySelectorAll('.lumina-dict-entry').forEach(entry => {
        if (entry.__normalized) return;
        entry.__normalized = true;

        entry.style.removeProperty('min-height');

        let questionEl = entry.querySelector('.lumina-chat-question') || entry.querySelector('[data-entry-type]');
        if (!questionEl) return;

        const row = questionEl.closest('.lumina-question-row');
        const entryType = entry.dataset.entryType || 'qa';

        const pinBtn = row ? row.querySelector('.lumina-question-pin-btn') : null;
        const wasPinned = questionEl.classList.contains('is-pinned-question') ||
            (pinBtn && (pinBtn.classList.contains('is-active') || pinBtn.getAttribute('aria-pressed') === 'true'));
        if (pinBtn) pinBtn.remove();
        const rawText = questionEl.dataset.rawText || questionEl.textContent.trim();

        questionEl.className = `lumina-chat-question ${entryType}-question`;
        questionEl.dataset.entryType = entryType;
        questionEl.removeAttribute('contenteditable');
        questionEl.classList.remove('lumina-question-editing', 'lumina-answer-editing');
        if (wasPinned) {
            questionEl.classList.add('is-pinned-question');
        }

        const existingToolbar = questionEl.querySelector('.lumina-question-edit-toolbar, .lumina-answer-edit-toolbar');
        if (existingToolbar) existingToolbar.remove();

        const contentDiv = document.createElement('div');
        contentDiv.className = 'lumina-question-content';
        contentDiv.innerHTML = rawText
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\n/g, '<br>');

        questionEl.innerHTML = '';
        questionEl.appendChild(contentDiv);

        if (row) row.classList.remove('lumina-question-row-editing');
        if (pinBtn) {
            pinBtn.classList.toggle('is-active', !!wasPinned);
            pinBtn.setAttribute('aria-pressed', wasPinned ? 'true' : 'false');
            pinBtn.style.display = '';
        }

        // Re-inject question actions to attach event listeners
        if (typeof LuminaChatUI !== 'undefined' && typeof LuminaChatUI.injectQuestionActions === 'function') {
            LuminaChatUI.injectQuestionActions(questionEl);
        }

        // Re-attach version navigation button listeners
        const nav = entry.querySelector('.lumina-answer-nav');
        if (nav) {
            const prevBtn = nav.querySelector('.nav-prev');
            const nextBtn = nav.querySelector('.nav-next');
            if (prevBtn && nextBtn) {
                const newPrev = prevBtn.cloneNode(true);
                const newNext = nextBtn.cloneNode(true);
                prevBtn.parentNode.replaceChild(newPrev, prevBtn);
                nextBtn.parentNode.replaceChild(newNext, nextBtn);
                newPrev.addEventListener('click', (e) => {
                    e.preventDefault(); e.stopPropagation();
                    showAnswerVersion(entry, 'prev');
                });
                newNext.addEventListener('click', (e) => {
                    e.preventDefault(); e.stopPropagation();
                    showAnswerVersion(entry, 'next');
                });
            }
        }

        if (questionEl) {
            const imgs = entry.querySelectorAll('img[data-attachment-id]');
            let parsedImages = null;
            if (questionEl.dataset.images) {
                try {
                    parsedImages = JSON.parse(questionEl.dataset.images);
                } catch (e) {
                    console.error('Failed to parse dataset.images', e);
                }
            }

            const hydratedFiles = [];
            const promises = [];

            imgs.forEach(img => {
                const attachmentId = img.dataset.attachmentId;
                if (attachmentId) {
                    const p = LuminaAttachmentDB.get(attachmentId).then(async (blob) => {
                        if (blob) {
                            const objectUrl = URL.createObjectURL(blob);
                            img.src = objectUrl;
                            img.onclick = (e) => {
                                e.stopPropagation();
                                const tab = (typeof tabs !== 'undefined' && typeof activeTabIndex !== 'undefined') ? tabs[activeTabIndex] : null;
                                if (tab && tab.chatUIInstance) {
                                    tab.chatUIInstance.showImagePreview(objectUrl, img.alt);
                                }
                            };

                            const dataUrl = await LuminaAttachmentDB.blobToDataURL(blob);
                            if (dataUrl) {
                                let fileObj = null;
                                if (parsedImages && Array.isArray(parsedImages.files)) {
                                    fileObj = parsedImages.files.find(f => f.attachmentId === attachmentId);
                                }
                                if (fileObj) {
                                    fileObj.dataUrl = dataUrl;
                                } else {
                                    fileObj = {
                                        name: img.alt || 'Image',
                                        mimeType: blob.type,
                                        isImage: true,
                                        dataUrl: dataUrl,
                                        attachmentId: attachmentId
                                    };
                                }
                                hydratedFiles.push(fileObj);
                            }
                        }
                    }).catch(err => {
                        console.error('Failed to hydrate attachment', attachmentId, err);
                    });
                    promises.push(p);
                }
            });

            if (promises.length > 0) {
                Promise.all(promises).then(() => {
                    if (hydratedFiles.length > 0) {
                        questionEl._luminaImages = hydratedFiles;
                        entry._luminaImages = hydratedFiles;
                        questionEl.dataset.images = JSON.stringify({
                            compact: true,
                            count: hydratedFiles.length,
                            files: hydratedFiles
                        });
                    }
                });
            }
        }
    });
}

let isDragging = false;
let startX = 0;
let draggedElement = null;
let initialRects = [];
let totalDeltaX = 0;
let groupPreviewTargetIndex = -1;

function getGroupColor(sessionId, tabIndex) {

    if (isSplitMode) {
        if (tabIndex === activeTabIndex || tabIndex === secondaryActiveTabIndex) {
            return '#0056D2';
        }
    }


    const sessionCount = {};
    tabs.forEach(t => {
        sessionCount[t.sessionId] = (sessionCount[t.sessionId] || 0) + 1;
    });

    if (sessionCount[sessionId] <= 1) return null;

    const groupSessionIds = Object.keys(sessionCount)
        .filter(id => sessionCount[id] > 1)
        .sort((a, b) => {
            return tabs.findIndex(t => t.sessionId === a) - tabs.findIndex(t => t.sessionId === b);
        });

    const index = groupSessionIds.indexOf(sessionId);
    return GROUP_COLORS[index % GROUP_COLORS.length];
}

function renderTabs() {
    const list = document.getElementById('tabs-list');
    if (!list) return;

    const newTabBtn = document.getElementById('new-tab-btn');
    list.innerHTML = '';

    tabGroups.forEach((group, groupIndex) => {
        const groupEl = document.createElement('div');
        const isActive = groupIndex === activeGroupIndex;
        const isSplitGroup = group.tabIds.length > 1;

        groupEl.className = `spotlight-tab ${isActive ? 'active' : ''} ${isSplitGroup ? 'is-split' : ''}`;
        groupEl.dataset.groupIndex = groupIndex;


        group.tabIds.forEach((tabId, subIdx) => {
            const tab = tabs.find(t => t.id === tabId);
            if (!tab) return;

            const subTabEl = document.createElement('div');
            subTabEl.className = 'spotlight-tab-sub';
            subTabEl.dataset.tabId = tabId;

            const titleSpan = document.createElement('span');
            titleSpan.className = 'spotlight-tab-title';
            titleSpan.textContent = tab.title;

            const closeBtn = document.createElement('button');
            closeBtn.className = 'spotlight-tab-close';
            closeBtn.title = isSplitGroup && !isActive && subIdx === group.tabIds.length - 1
                ? 'Close group'
                : 'Close tab';
            closeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12" /></svg>';
            closeBtn.onclick = (e) => {
                e.stopPropagation();

                if (isSplitGroup && !isActive && subIdx === group.tabIds.length - 1) {
                    closeGroup(groupIndex);
                } else {
                    closeTab(tabId);
                }
            };

            subTabEl.appendChild(titleSpan);
            subTabEl.appendChild(closeBtn);


            let subTabClickTimer = null;
            subTabEl.onmousedown = (e) => {
                if (e.target.closest('.spotlight-tab-close')) return;
                if (e.button !== 0) return;

                let isInactiveTab = false;

                if (groupIndex === activeGroupIndex) {

                    if (subTabClickTimer) {
                        clearTimeout(subTabClickTimer);
                        subTabClickTimer = null;
                        sidebarTargetTabId = tabId;
                        openSidebar();
                        return;
                    } else {
                        subTabClickTimer = setTimeout(() => {
                            subTabClickTimer = null;
                        }, 300);
                    }
                } else {

                    isInactiveTab = true;
                }


                isDragging = false;
                initialDraggedIndex = groupIndex;
                startX = e.pageX;
                draggedElement = groupEl;

                const onMouseMove = (moveEvent) => {
                    if (Math.abs(moveEvent.pageX - startX) > 5) {
                        if (!isDragging) {

                            if (isInactiveTab) {
                                switchGroup(groupIndex);

                                const list = document.getElementById('tabs-list');
                                draggedElement = list.querySelector(`[data-group-index="${groupIndex}"]`);
                            }

                            isDragging = true;
                            draggedElement.classList.add('dragging-smooth');
                            draggedElement.style.zIndex = '1000';

                            const allGroups = Array.from(list.querySelectorAll('.spotlight-tab'));
                            const newTabBtn = document.getElementById('new-tab-btn');
                            if (newTabBtn) allGroups.push(newTabBtn);

                            initialRects = allGroups.map(el => el.getBoundingClientRect());

                            window.addEventListener('mousemove', handleMouseMove);
                            window.addEventListener('mouseup', onMouseUp);
                        }
                        handleMouseMove(moveEvent);
                    }
                };

                const onMouseUp = () => {
                    window.removeEventListener('mousemove', onMouseMove);
                    window.removeEventListener('mouseup', onMouseUp);
                    if (isDragging) {
                        handleMouseUp();
                    } else if (isInactiveTab) {

                        activateSubTab(groupIndex, tabId);
                    } else if (isSplitGroup) {

                        activateSubTab(groupIndex, tabId);
                    }
                };

                window.addEventListener('mousemove', onMouseMove);
                window.addEventListener('mouseup', onMouseUp);
            };

            groupEl.appendChild(subTabEl);
        });

        list.appendChild(groupEl);
    });

    if (newTabBtn) {
        list.appendChild(newTabBtn);
    }
    updateRecentChatsActiveState();
    if (typeof updateSidebarSparksActiveState === 'function') {
        updateSidebarSparksActiveState();
    }
}

function handleMouseMove(e) {
    if (!isDragging || !draggedElement || initialDraggedIndex === -1) return;

    totalDeltaX = e.pageX - startX;
    draggedElement.style.transform = `translateX(${totalDeltaX}px)`;

    const list = document.getElementById('tabs-list');
    const groupEls = Array.from(list.querySelectorAll('.spotlight-tab'));
    const newTabBtn = document.getElementById('new-tab-btn');
    if (newTabBtn) groupEls.push(newTabBtn);

    const draggedWidth = initialRects[initialDraggedIndex].width;
    const draggedGroup = tabGroups[initialDraggedIndex];

    const currentLeftEdge = initialRects[initialDraggedIndex].left + totalDeltaX;
    const currentRightEdge = currentLeftEdge + draggedWidth;
    const draggedCenterX = currentLeftEdge + draggedWidth / 2;



    let newGroupPreviewTarget = -1;
    if (draggedGroup && draggedGroup.tabIds.length === 1) {
        groupEls.forEach((el, idx) => {
            if (idx === initialDraggedIndex) return;
            const targetGroup = tabGroups[idx];
            if (!targetGroup || targetGroup.tabIds.length !== 1) return;
            const elRect = initialRects[idx];
            const oneThird = elRect.left + elRect.width / 3;
            const twoThird = elRect.left + elRect.width * 2 / 3;
            const comingFromRight = initialDraggedIndex > idx;
            if (comingFromRight) {

                if (currentLeftEdge > oneThird && currentLeftEdge <= twoThird) {
                    newGroupPreviewTarget = idx;
                }
            } else {

                if (currentRightEdge >= oneThird && currentRightEdge < twoThird) {
                    newGroupPreviewTarget = idx;
                }
            }
        });
    }


    if (newGroupPreviewTarget !== groupPreviewTargetIndex) {
        if (groupPreviewTargetIndex !== -1 && groupEls[groupPreviewTargetIndex]) {
            groupEls[groupPreviewTargetIndex].classList.remove('group-merge-preview');
        }
        draggedElement.classList.remove('group-merge-preview');
        groupPreviewTargetIndex = newGroupPreviewTarget;
        if (groupPreviewTargetIndex !== -1 && groupEls[groupPreviewTargetIndex]) {
            groupEls[groupPreviewTargetIndex].classList.add('group-merge-preview');
            draggedElement.classList.add('group-merge-preview');
        }
    }


    if (groupPreviewTargetIndex !== -1) {
        groupEls.forEach((el, idx) => {
            if (idx !== initialDraggedIndex) el.style.transform = '';
        });
        return;
    }


    groupEls.forEach((el, idx) => {
        if (idx === initialDraggedIndex) return;

        const elRect = initialRects[idx];


        if (el === newTabBtn) {
            const marginLeft = 4;
            const triggerLeft = elRect.left - marginLeft;
            if (currentRightEdge > triggerLeft) {
                const pushDistance = currentRightEdge - triggerLeft;
                el.style.transform = `translateX(${pushDistance}px)`;
            } else {
                el.style.transform = '';
            }
            return;
        }

        const elCenter = elRect.left + elRect.width / 2;

        if (initialDraggedIndex < idx && currentRightEdge > elCenter) {
            el.style.transform = `translateX(-${draggedWidth}px)`;
        } else if (initialDraggedIndex > idx && currentLeftEdge < elCenter) {
            el.style.transform = `translateX(${draggedWidth}px)`;
        } else {
            el.style.transform = '';
        }
    });
}

function handleMouseUp() {
    if (!isDragging || initialDraggedIndex === -1) return;

    isDragging = false;

    const list = document.getElementById('tabs-list');
    const groupEls = Array.from(list.querySelectorAll('.spotlight-tab'));


    if (groupPreviewTargetIndex !== -1) {
        const targetGroup = tabGroups[groupPreviewTargetIndex];
        const draggedGroup = tabGroups[initialDraggedIndex];

        if (targetGroup && draggedGroup && targetGroup.tabIds.length === 1 && draggedGroup.tabIds.length === 1) {
            const primaryTabId = targetGroup.tabIds[0];
            const secondaryTabId = draggedGroup.tabIds[0];


            groupEls.forEach(el => {
                el.style.transform = '';
                el.style.zIndex = '';
                el.classList.remove('dragging-smooth', 'group-merge-preview', 'drop-target-split');
            });
            const newTabBtn = document.getElementById('new-tab-btn');
            if (newTabBtn) {
                newTabBtn.style.transform = '';
            }
            groupPreviewTargetIndex = -1;
            clearTimeout(splitHoverTimer);
            splitHoverTargetIndex = -1;
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            initialDraggedIndex = -1;
            initialRects = [];
            totalDeltaX = 0;

            applySplit(primaryTabId, secondaryTabId);
            return;
        }
        groupPreviewTargetIndex = -1;
    }


    const draggedWidth = initialRects[initialDraggedIndex].width;
    const currentLeftEdge = initialRects[initialDraggedIndex].left + totalDeltaX;
    const currentRightEdge = currentLeftEdge + draggedWidth;

    let targetIndex = initialDraggedIndex;
    groupEls.forEach((el, idx) => {
        if (idx === initialDraggedIndex) return;
        const elRect = initialRects[idx];
        const elCenter = elRect.left + elRect.width / 2;

        if (initialDraggedIndex < idx && currentRightEdge > elCenter) {
            if (idx > targetIndex) targetIndex = idx;
        } else if (initialDraggedIndex > idx && currentLeftEdge < elCenter) {
            if (idx < targetIndex) targetIndex = idx;
        }
    });

    if (targetIndex !== initialDraggedIndex) {
        const [movedGroup] = tabGroups.splice(initialDraggedIndex, 1);
        tabGroups.splice(targetIndex, 0, movedGroup);

        if (activeGroupIndex === initialDraggedIndex) {
            activeGroupIndex = targetIndex;
        } else if (activeGroupIndex > initialDraggedIndex && activeGroupIndex <= targetIndex) {
            activeGroupIndex--;
        } else if (activeGroupIndex < initialDraggedIndex && activeGroupIndex >= targetIndex) {
            activeGroupIndex++;
        }
    }


    groupEls.forEach(el => {
        el.style.transform = '';
        el.style.zIndex = '';
        el.classList.remove('dragging-smooth', 'group-merge-preview', 'drop-target-split');
    });
    const newTabBtn = document.getElementById('new-tab-btn');
    if (newTabBtn) {
        newTabBtn.style.transform = '';
    }

    clearTimeout(splitHoverTimer);
    splitHoverTargetIndex = -1;

    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);

    initialDraggedIndex = -1;
    initialRects = [];
    totalDeltaX = 0;

    normalizeTabs();
    saveTabsState();
    renderTabs();
}




function initSpotlightAskSelection() {
    if (window.LuminaSelection) {
        LuminaSelection.init({
            shadowRoot: null,
            onSubmit: (query, displayQuery, isDictionary, sourceEntry, range, isTranslate, isAudio) => {
                if (isAudio) {
                    playSpotlightAudio(displayQuery);
                    return;
                }
                if (isTranslate) {
                    const targetTabIdx = (spotlightAskSourcePane === 'secondary' && isSplitMode)
                        ? secondaryActiveTabIndex
                        : activeTabIndex;
                    const targetTab = tabs[targetTabIdx];
                    handleSubmit(query, [], { mode: 'translate' }, targetTab || null, displayQuery);
                    return;
                }
                if (isDictionary) {
                    const selection = window.getSelection();
                    const text = selection.toString().trim() || displayQuery;
                    if (text) {
                        const finalRange = range || (selection.rangeCount > 0 ? selection.getRangeAt(0) : null);
                        const rect = finalRange ? finalRange.getBoundingClientRect() : { left: window.innerWidth / 2, bottom: window.innerHeight / 2 };
                        LuminaDictionaryPopup.show(text, {
                            x: rect.left,
                            y: rect.bottom + 5,
                            source: 'cambridge'
                        });
                        return;
                    }
                }


                if (window.LuminaAnnotation && range) {
                    window.LuminaAnnotation.highlight(range);
                }

                const targetTabIdx = (spotlightAskSourcePane === 'secondary' && isSplitMode)
                    ? secondaryActiveTabIndex
                    : activeTabIndex;
                const targetTab = tabs[targetTabIdx];



                handleSubmit(query, [], { mode: isDictionary ? 'dictionary' : 'qa' }, targetTab || null, displayQuery);
            },
            onTranslate: (text) => {
                const targetTabIdx = (spotlightAskSourcePane === 'secondary' && isSplitMode)
                    ? secondaryActiveTabIndex
                    : activeTabIndex;
                const targetTab = tabs[targetTabIdx];
                handleSubmit(text, [], { mode: 'translate' }, targetTab || null, text);
            },
            onCommentAdded: (span, entry, commentText) => {
                if (!entry) return;
                let btn = entry.querySelector('.lumina-send-comment-btn');
                if (!btn) {
                    btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'lumina-send-comment-btn';
                    btn.innerHTML = `
                        <span class="lumina-svg-icon lumina-icon-send" aria-hidden="true"></span>
                        <span>Send comment</span>
                    `;
                    entry.appendChild(btn);

                    btn.addEventListener('click', () => {
                        handleCommentSubmission(entry);
                    });
                }
            }
        });
    }

    document.addEventListener('mouseup', (e) => {
        const path = e.composedPath();
        const isInsideLumina = path.some(el => el.id === 'lumina-action-bar' || el.id === 'lumina-ask-input-popup');
        if (isInsideLumina) return;

        setTimeout(() => {
            if (window.LuminaSelection && !LuminaSelection.isInsideEditable()) {
                LuminaSelection.expandToWordBoundaries();
            }

            const sel = window.getSelection();
            const text = sel ? sel.toString().trim() : '';

            const range = sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
            if (!range) {
                const isHighlight = e.target.closest('.lumina-highlight') || (window.LuminaAnnotation && LuminaAnnotation.getHighlightAtCoords(e.clientX, e.clientY));
                if (window.LuminaSelection && !isHighlight) LuminaSelection.hide();
                return;
            }


            const isInsideProofread = range && (range.startContainer.parentElement.closest('.lumina-proofread-editable') || range.startContainer.closest?.('.lumina-proofread-editable'));
            if ((!askSelectionPopupEnabled && !isInsideProofread) || text.length === 0) {
                const isHighlight = e.target.closest('.lumina-highlight') || (window.LuminaAnnotation && LuminaAnnotation.getHighlightAtCoords(e.clientX, e.clientY));
                if (window.LuminaSelection && !isHighlight) LuminaSelection.hide();
                return;
            }


            const commonNode = range.commonAncestorContainer;
            const isInsideChat = commonNode && (
                (commonNode.nodeType === 1 && commonNode.closest('.lumina-chat-scroll-content')) ||
                (commonNode.parentNode && commonNode.parentNode.closest('.lumina-chat-scroll-content'))
            );
            if (!isInsideChat) {
                const isHighlight = e.target.closest('.lumina-highlight') || (window.LuminaAnnotation && LuminaAnnotation.getHighlightAtCoords(e.clientX, e.clientY));
                if (window.LuminaSelection && !isHighlight) LuminaSelection.hide();
                return;
            }

            const secondaryPane = document.getElementById('pane-secondary');
            spotlightAskSourcePane = (isSplitMode && secondaryPane && secondaryPane.contains(commonNode))
                ? 'secondary'
                : 'primary';

            if (window.LuminaSelection) {
                LuminaSelection.show(e.clientX, e.clientY, text, range);
            }
        }, 10);
    });

    document.addEventListener('click', (e) => {
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
}

function handleCommentSubmission(entry) {
    console.log('[Lumina DEBUG] handleCommentSubmission called', { entry });
    try {
        const highlights = entry.querySelectorAll('.lumina-comment-highlight');
        console.log('[Lumina DEBUG] Highlights found:', highlights.length);

        if (highlights.length === 0) {
            console.warn('[Lumina] No highlights found in entry for comment submission');
            return;
        }

        let constructedPrompt = "The user has provided feedback on the following parts of the text:\n\n";
        highlights.forEach((h, idx) => {
            const originalText = h.textContent.trim();
            const comment = h.dataset.comment;
            console.log(`[Lumina DEBUG] Highlight ${idx}: "${originalText}" -> "${comment}"`);
            constructedPrompt += `- Text: "${originalText}"\n  Comment: "${comment}"\n`;
        });
        constructedPrompt += "\nPlease revise the content accordingly.";


        let targetTabIdx = -1;
        const paneSecondary = document.getElementById('pane-secondary');
        const isInSecondary = paneSecondary && paneSecondary.contains(entry);

        if (isInSecondary && isSplitMode) {
            targetTabIdx = secondaryActiveTabIndex;
        } else {
            targetTabIdx = activeTabIndex;
        }

        let targetTab = (targetTabIdx >= 0) ? tabs[targetTabIdx] : null;


        if (!targetTab) {
            console.warn('[Lumina DEBUG] No targetTab found by index, searching tabs array...');
            targetTab = tabs.find(t => t && t.chatUIInstance) || null;
        }

        console.log('[Lumina DEBUG] Resolved targetTab:', targetTab ? targetTab.title : 'NULL');

        if (typeof handleSubmit === 'function') {
            console.log('[Lumina DEBUG] Calling handleSubmit...');
            handleSubmit(constructedPrompt, [], { mode: 'proofread' }, targetTab, "Sent comments")
                .then(() => console.log('[Lumina DEBUG] handleSubmit finished'))
                .catch(e => console.error('[Lumina DEBUG] handleSubmit error:', e));
        } else {
            console.error('[Lumina DEBUG] handleSubmit is NOT a function!');
        }


        const btn = entry.querySelector('.lumina-send-comment-btn');
        if (btn) btn.remove();

    } catch (err) {
        console.error('[Lumina] Error in handleCommentSubmission:', err);
    }
}



function setupWebSourceTracking() {

    syncCurrentBrowserTab();


    chrome.tabs.onActivated.addListener(() => {
        syncCurrentBrowserTab();
    });


    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        if (changeInfo.status === 'complete' || changeInfo.title || changeInfo.url) {


            if (tab.active) {
                syncCurrentBrowserTab();
            }

            updateWebSelectionForTab(tabId, (source, sourceTabId) => {
                if (String(source.tabId) !== sourceTabId) return source;
                return {
                    tabId: source.tabId,
                    title: tab.title || source.title,
                    url: tab.url || source.url
                };
            });

            updateWebChips();

            if (webTabPickerEl) {
                refreshWebTabPicker();
            }


            if (changeInfo.status === 'complete') {
                refreshWebSourceTokensForTab(tabId);
            }
        }
    });


    chrome.tabs.onRemoved.addListener((tabId) => {
        updateWebSelectionForTab(tabId, (source, sourceTabId) => {
            if (String(source.tabId) === sourceTabId) return null;
            return source;
        });


        pinnedWebSources = pinnedWebSources.filter((source) => String(source.tabId) !== String(tabId));


        syncCurrentBrowserTab();


        updateWebChips();
    });
}

function isWebPageUrl(url) {
    return typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'));
}

function syncCurrentBrowserTab() {
    const queryOptions = isSidePanel ? { active: true, currentWindow: true } : { active: true, lastFocusedWindow: true };

    const handleTabResult = (activeTab) => {
        saveCurrentWebSelection();

        if (activeTab && typeof activeTab.url === 'string' && activeTab.url.startsWith('chrome-extension://')) {
            chrome.windows.getAll({ populate: true }, (windows) => {
                const sortedWindows = windows
                    .filter(w => w.type === 'normal')
                    .sort((a, b) => b.id - a.id);

                const realTab = sortedWindows
                    .map(w => w.tabs.find(t => t.active))
                    .find(t => t && isWebPageUrl(t.url));
                if (realTab) {
                    currentBrowserTab = {
                        tabId: realTab.id,
                        title: realTab.title || 'Untitled',
                        url: realTab.url,
                        favIconUrl: realTab.favIconUrl
                    };
                    loadCurrentWebSelection();
                    updateWebChips();
                    refreshWebSourceTokensForTab(realTab.id);

                    if (webTabPickerEl) {
                        refreshWebTabPicker();
                    }
                }
            });
            return;
        }

        if (activeTab && isWebPageUrl(activeTab.url)) {
            currentBrowserTab = {
                tabId: activeTab.id,
                title: activeTab.title || 'Untitled',
                url: activeTab.url,
                favIconUrl: activeTab.favIconUrl
            };
            loadCurrentWebSelection();
            updateWebChips();
            refreshWebSourceTokensForTab(activeTab.id);
        } else {
            currentBrowserTab = null;
            pinnedWebSources = [];
            updateWebChips();
        }
        updateWebChips();
        if (webTabPickerEl) {
            refreshWebTabPicker();
        }
    };

    chrome.tabs.query(queryOptions, (tabs) => {
        const activeTab = tabs && tabs[0];
        if (!activeTab && isSidePanel) {
            chrome.tabs.query({ active: true, lastFocusedWindow: true }, (fallbackTabs) => {
                handleTabResult(fallbackTabs && fallbackTabs[0]);
            });
        } else {
            handleTabResult(activeTab);
        }
    });
}

function formatHeadTailTitle(text) {
    return (text || '').trim().replace(/\s+/g, ' ') || 'Untitled';
}

function closeWebTabPicker() {
    if (webTabPickerOutsideHandler) {
        document.removeEventListener('mousedown', webTabPickerOutsideHandler, true);
        webTabPickerOutsideHandler = null;
    }
    if (webTabPickerKeyHandler) {
        document.removeEventListener('keydown', webTabPickerKeyHandler, true);
        webTabPickerKeyHandler = null;
    }
    if (webTabPickerEl) {
        webTabPickerEl.remove();
        webTabPickerEl = null;
    }
    webTabPickerAnchorEl = null;
}

function refreshWebTabPicker() {
    const anchorEl = webTabPickerAnchorEl;
    if (!anchorEl) return;

    closeWebTabPicker();
    openWebTabPicker(anchorEl);
}


function openWebTabPicker(anchorEl, spotlightTabId = null) {
    if (!anchorEl) return;

    if (webTabPickerEl && webTabPickerAnchorEl === anchorEl) {
        closeWebTabPicker();
        return;
    }

    closeWebTabPicker();

    chrome.tabs.query({ windowType: 'normal' }, (tabs) => {
        const availableTabs = (tabs || [])
            .filter((tab) => tab && isWebPageUrl(tab.url))
            .map((tab) => ({
                tabId: tab.id,
                title: tab.title || 'Untitled',
                url: tab.url,
                isActive: !!tab.active
            }));

        const activeSpotlightTabId = spotlightTabId || getCurrentSpotlightTabId();
        const selectedSources = activeSpotlightTabId ? getWebSelectionForScope(activeSpotlightTabId) : [];
        const selectedIds = new Set(selectedSources.map((source) => source.tabId));

        const picker = document.createElement('div');
        picker.className = 'lumina-web-tab-picker';

        const header = document.createElement('div');
        header.className = 'lumina-web-tab-picker-header';
        header.textContent = 'Select tabs';
        picker.appendChild(header);

        const list = document.createElement('div');
        list.className = 'lumina-web-tab-picker-list';

        if (availableTabs.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'lumina-web-tab-picker-empty';
            empty.textContent = 'No readable web tabs available';
            list.appendChild(empty);
        } else {
            availableTabs.forEach((tab) => {
                const row = document.createElement('label');
                row.className = 'lumina-web-tab-picker-item';

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.className = 'lumina-web-tab-picker-checkbox';
                checkbox.value = String(tab.tabId);
                checkbox.checked = selectedIds.has(tab.tabId);
                checkbox.addEventListener('change', () => {
                    const selectedSet = new Set(
                        Array.from(list.querySelectorAll('.lumina-web-tab-picker-checkbox:checked')).map((item) => Number(item.value))
                    );

                    const nextSelection = availableTabs
                        .filter((item) => selectedSet.has(item.tabId))
                        .map((item) => ({
                            tabId: item.tabId,
                            title: item.title,
                            url: item.url
                        }));

                    if (activeSpotlightTabId) {
                        saveWebSelectionForScope(activeSpotlightTabId, nextSelection);


                        const primaryTabId = getCurrentSpotlightTabId();
                        if (String(activeSpotlightTabId) === String(primaryTabId)) {
                            pinnedWebSources = nextSelection.map((item) => ({ ...item }));
                        }
                    }
                    updateWebChips();
                });

                const textWrap = document.createElement('div');
                textWrap.className = 'lumina-web-tab-picker-item-text';

                const titleEl = document.createElement('div');
                titleEl.className = 'lumina-web-tab-picker-item-title';
                titleEl.textContent = tab.title;

                const urlEl = document.createElement('div');
                urlEl.className = 'lumina-web-tab-picker-item-url';
                urlEl.textContent = tab.url;

                textWrap.appendChild(titleEl);
                textWrap.appendChild(urlEl);

                row.appendChild(checkbox);
                row.appendChild(textWrap);
                list.appendChild(row);
            });
        }

        picker.appendChild(list);

        const actions = document.createElement('div');
        actions.className = 'lumina-web-tab-picker-actions';

        const clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'lumina-web-tab-picker-btn is-ghost';
        clearBtn.textContent = 'Clear';
        clearBtn.addEventListener('click', () => {
            if (activeSpotlightTabId) {
                saveWebSelectionForScope(activeSpotlightTabId, []);

                const primaryTabId = getCurrentSpotlightTabId();
                if (String(activeSpotlightTabId) === String(primaryTabId)) {
                    pinnedWebSources = [];
                }
            }
            list.querySelectorAll('.lumina-web-tab-picker-checkbox').forEach((checkbox) => {
                checkbox.checked = false;
            });
            updateWebChips();
            closeWebTabPicker();
        });

        const selectAllBtn = document.createElement('button');
        selectAllBtn.type = 'button';
        selectAllBtn.className = 'lumina-web-tab-picker-btn is-primary';
        selectAllBtn.textContent = 'Select All';
        selectAllBtn.addEventListener('click', () => {
            const checkboxList = list.querySelectorAll('.lumina-web-tab-picker-checkbox');
            checkboxList.forEach((checkbox) => {
                checkbox.checked = true;
            });

            const nextSelection = availableTabs.map((item) => ({
                tabId: item.tabId,
                title: item.title,
                url: item.url
            }));

            if (activeSpotlightTabId) {
                saveWebSelectionForScope(activeSpotlightTabId, nextSelection);

                const primaryTabId = getCurrentSpotlightTabId();
                if (String(activeSpotlightTabId) === String(primaryTabId)) {
                    pinnedWebSources = nextSelection.map((item) => ({ ...item }));
                }
            }
            updateWebChips();
        });

        actions.appendChild(clearBtn);
        actions.appendChild(selectAllBtn);
        picker.appendChild(actions);

        document.body.appendChild(picker);

        const rect = anchorEl.getBoundingClientRect();
        const wrapper = anchorEl.closest('.lumina-chat-input-wrapper') || anchorEl.closest('.lumina-input-container');
        const preferredWidth = Math.min(wrapper ? wrapper.getBoundingClientRect().width : rect.width, window.innerWidth - 20);
        picker.style.width = `${preferredWidth}px`;

        const pickerHeight = picker.offsetHeight;
        let left = Math.max(10, Math.min(rect.left, window.innerWidth - preferredWidth - 10));
        let top = rect.bottom + 8;
        if (top + pickerHeight > window.innerHeight - 12) {
            top = Math.max(12, rect.top - pickerHeight - 8);
        }

        picker.style.left = `${left}px`;
        picker.style.top = `${top}px`;

        webTabPickerEl = picker;
        webTabPickerAnchorEl = anchorEl;

        webTabPickerOutsideHandler = (event) => {
            if (!webTabPickerEl) return;
            if (webTabPickerEl.contains(event.target) || (webTabPickerAnchorEl && webTabPickerAnchorEl.contains(event.target))) return;
            closeWebTabPicker();
        };

        webTabPickerKeyHandler = (event) => {
            if (event.key === 'Escape') {
                closeWebTabPicker();
            }
        };

        setTimeout(() => {
            if (!webTabPickerEl) return;
            document.addEventListener('mousedown', webTabPickerOutsideHandler, true);
            document.addEventListener('keydown', webTabPickerKeyHandler, true);
        }, 0);
    });
}

function getDomainDisplayName(url) {
    if (!url) return '';
    try {
        let hostname = new URL(url).hostname;
        if (hostname.startsWith('www.')) {
            hostname = hostname.slice(4);
        }
        const parts = hostname.split('.');
        if (parts.length > 0) {
            const name = parts[0];
            return name.charAt(0).toUpperCase() + name.slice(1);
        }
        return hostname;
    } catch (e) {
        return '';
    }
}

function createWebChipElement(source, selectedSources, spotlightTabId) {
    const hasMultipleTabs = source.isSummary;
    const isGhost = source.isGhost;

    const chip = document.createElement('div');
    chip.className = `lumina-web-chip ${source.isActive ? 'is-active' : ''} ${isGhost ? 'is-ghost' : ''}`;
    chip.removeAttribute('title');

    if (source.isSummary) {
        const totalTokens = selectedSources.reduce((sum, s) => sum + (parseInt(s.tokens) || 0), 0);
        chip.dataset.tokens = totalTokens;
    } else {
        chip.dataset.tokens = parseInt(source.tokens) || 0;
    }

    if (!hasMultipleTabs) {
        let favIconUrl = source.favIconUrl;
        if (!favIconUrl && source.url) {
            try {
                const domain = new URL(source.url).hostname;
                favIconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
            } catch (e) { }
        }
        if (favIconUrl) {
            const faviconImg = document.createElement('img');
            faviconImg.src = favIconUrl;
            faviconImg.style.width = '14px';
            faviconImg.style.height = '14px';
            faviconImg.style.marginRight = '6px';
            faviconImg.style.borderRadius = '2px';
            faviconImg.style.flexShrink = '0';
            faviconImg.onerror = () => {
                faviconImg.style.display = 'none';
            };
            chip.appendChild(faviconImg);
        }
    }

    const titleSpan = document.createElement('span');
    let displayName = source.displayTitle;
    if (!displayName && !hasMultipleTabs && source.url) {
        displayName = getDomainDisplayName(source.url);
    }
    titleSpan.textContent = displayName || (hasMultipleTabs ? source.title : formatHeadTailTitle(source.title || 'Untitled'));
    chip.appendChild(titleSpan);

    chip.addEventListener('click', (event) => {
        event.stopPropagation();

        const container = chip.closest('.lumina-web-chips-group');
        if (container) container.dataset.muteTooltips = 'true';


        if (window.LuminaChatUI && typeof LuminaChatUI.prototype._hideTagTooltip === 'function') {
            try { LuminaChatUI.prototype._hideTagTooltip(); } catch (e) { }
        }

        if (source.isSummary) {

            saveWebSelectionForScope(spotlightTabId, []);


            const activeId = activeTabIndex >= 0 && tabs[activeTabIndex] ? tabs[activeTabIndex].id : null;
            if (String(spotlightTabId) === String(activeId)) {
                pinnedWebSources = [];
            }

            updateWebChips();
            return;
        }

        if (isGhost) {

            toggleWebSourcePin(source, true, spotlightTabId);
        } else {

            toggleWebSourcePin(source, null, spotlightTabId);
        }
    });

    return chip;
}

function updateWebChips() {
    if (window.LuminaChatUI && typeof LuminaChatUI.prototype._hideTagTooltip === 'function') {
        try { LuminaChatUI.prototype._hideTagTooltip(); } catch (e) { }
    }

    const containers = document.querySelectorAll('.lumina-web-chips-group');
    containers.forEach(container => {
        const spotlightTabId = getSpotlightTabIdForPane(container);
        if (!spotlightTabId) {
            container.style.display = 'none';
            return;
        }

        container.style.display = 'flex';

        if (!container.dataset.muteHandlerSet) {
            container.addEventListener('mouseleave', () => {
                container.dataset.muteTooltips = 'false';
            });
            container.dataset.muteHandlerSet = 'true';
        }

        const selectedSources = getWebSelectionForScope(spotlightTabId);
        const onValidWebPage = currentBrowserTab && isWebPageUrl(currentBrowserTab.url);

        // Tính fingerprint của state hiện tại
        let newFingerprint = '';
        if (onValidWebPage) {
            const currentTabId = String(currentBrowserTab.tabId);
            const isCurrentPinned = selectedSources.some(s => String(s.tabId) === currentTabId);
            const tokens = currentBrowserTabTokens.get(currentTabId) || 0;
            newFingerprint = `${currentTabId}|${isCurrentPinned ? 'active' : 'ghost'}|${tokens}|${currentBrowserTab.title || ''}`;
        }

        // Chỉ rebuild DOM khi state thực sự thay đổi
        if (container.dataset.chipFingerprint === newFingerprint) return;
        container.dataset.chipFingerprint = newFingerprint;

        container.innerHTML = '';

        if (onValidWebPage) {
            const currentTabId = String(currentBrowserTab.tabId);
            const isCurrentPinned = selectedSources.some(s => String(s.tabId) === currentTabId);
            const tokens = currentBrowserTabTokens.get(currentTabId) || 0;

            if (isCurrentPinned) {
                const activeData = {
                    tabId: currentBrowserTab.tabId,
                    title: currentBrowserTab.title,
                    url: currentBrowserTab.url,
                    favIconUrl: currentBrowserTab.favIconUrl,
                    isActive: true,
                    isGhost: false,
                    tokens
                };
                container.appendChild(createWebChipElement(activeData, selectedSources, spotlightTabId));
            } else {
                const ghostData = {
                    tabId: currentBrowserTab.tabId,
                    title: currentBrowserTab.title,
                    url: currentBrowserTab.url,
                    favIconUrl: currentBrowserTab.favIconUrl,
                    isActive: false,
                    isGhost: true,
                    tokens
                };
                container.appendChild(createWebChipElement(ghostData, selectedSources, spotlightTabId));
            }
        }
    });

    scheduleVisibleTabsMinHeightReflow();
}

function scheduleVisibleTabsMinHeightReflow() {
    if (minHeightReflowRaf) {
        cancelAnimationFrame(minHeightReflowRaf);
        minHeightReflowRaf = null;
    }

    minHeightReflowRaf = requestAnimationFrame(() => {
        minHeightReflowRaf = null;

        const visibleTabIndexes = [activeTabIndex];
        if (isSplitMode && secondaryActiveTabIndex >= 0) {
            visibleTabIndexes.push(secondaryActiveTabIndex);
        }

        visibleTabIndexes.forEach((index) => {
            const tab = tabs[index];
            if (!tab?.historyEl || typeof tab.chatUIInstance?.setInitialEntryHeight !== 'function') return;

            const allEntries = tab.historyEl.querySelectorAll('.lumina-dict-entry');
            if (!allEntries.length) return;

            const latestEntry = allEntries[allEntries.length - 1];

            tab.chatUIInstance.setInitialEntryHeight(latestEntry, true);
        });
    });
}

function toggleWebSourcePin(source, forceState = null, spotlightTabId = null) {
    if (!source || !isWebPageUrl(source.url)) return;

    const targetSpotlightTabId = spotlightTabId || getCurrentSpotlightTabId();
    if (!targetSpotlightTabId) return;

    const currentSelection = getWebSelectionForScope(targetSpotlightTabId);

    const idx = currentSelection.findIndex(p => String(p.tabId) === String(source.tabId));
    if (idx > -1) {
        if (forceState === true) {

            currentSelection[idx] = {
                tabId: source.tabId,
                title: source.title || currentSelection[idx].title || 'Untitled',
                url: source.url || currentSelection[idx].url
            };
            saveWebSelectionForScope(targetSpotlightTabId, currentSelection);
            updateWebChips();
            return;
        }

        currentSelection.splice(idx, 1);
    } else {
        if (forceState === false) return;

        currentSelection.push({
            tabId: source.tabId,
            title: source.title,
            url: source.url
        });
    }
    saveWebSelectionForScope(targetSpotlightTabId, currentSelection);


    const activeTabId = activeTabIndex >= 0 && tabs[activeTabIndex] ? tabs[activeTabIndex].id : null;
    if (String(targetSpotlightTabId) === String(activeTabId)) {
        pinnedWebSources = currentSelection.map((item) => ({ ...item }));
    }

    updateWebChips();
}




async function init() {
    if (isInitializing) return;
    isInitializing = true;

    // Verify and ensure unique instanceId per browser tab/window (detect duplicated tabs)
    await new Promise((resolve) => {
        if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.getCurrent) {
            chrome.tabs.getCurrent((tab) => {
                if (tab && tab.id) {
                    const storedTabId = sessionStorage.getItem('lumina_tab_id');
                    if (storedTabId && storedTabId !== String(tab.id)) {
                        const newInstId = 'inst_' + Date.now() + Math.random().toString(36).substr(2, 5);
                        sessionStorage.setItem('lumina_spotlight_instance_id', newInstId);

                        // Re-initialize KEYS properties based on the new instanceId
                        KEYS.tabs = `${STORAGE_PREFIX}_tabs_${newInstId}`;
                        KEYS.tabCounter = `${STORAGE_PREFIX}_tab_counter_${newInstId}`;
                        KEYS.activeTabIndex = `${STORAGE_PREFIX}_active_tab_index_${newInstId}`;
                        KEYS.tabGroups = `${STORAGE_PREFIX}_tab_groups_${newInstId}`;
                        KEYS.activeGroupIndex = `${STORAGE_PREFIX}_active_group_index_${newInstId}`;
                        KEYS.groupCounter = `${STORAGE_PREFIX}_group_counter_${newInstId}`;
                        KEYS.isSplitMode = `${STORAGE_PREFIX}_is_split_mode_${newInstId}`;
                        KEYS.secondaryTabIndex = `${STORAGE_PREFIX}_secondary_tab_index_${newInstId}`;
                        KEYS.splitRatio = `${STORAGE_PREFIX}_split_ratio_${newInstId}`;
                    }
                    sessionStorage.setItem('lumina_tab_id', String(tab.id));
                    resolve();
                } else if (chrome.windows && chrome.windows.getCurrent) {
                    chrome.windows.getCurrent((win) => {
                        if (win && win.id) {
                            myWindowId = win.id;
                            const storedWinId = sessionStorage.getItem('lumina_window_id');
                            if (storedWinId && storedWinId !== String(win.id)) {
                                const newInstId = 'inst_' + Date.now() + Math.random().toString(36).substr(2, 5);
                                sessionStorage.setItem('lumina_spotlight_instance_id', newInstId);

                                KEYS.tabs = `${STORAGE_PREFIX}_tabs_${newInstId}`;
                                KEYS.tabCounter = `${STORAGE_PREFIX}_tab_counter_${newInstId}`;
                                KEYS.activeTabIndex = `${STORAGE_PREFIX}_active_tab_index_${newInstId}`;
                                KEYS.tabGroups = `${STORAGE_PREFIX}_tab_groups_${newInstId}`;
                                KEYS.activeGroupIndex = `${STORAGE_PREFIX}_active_group_index_${newInstId}`;
                                KEYS.groupCounter = `${STORAGE_PREFIX}_group_counter_${newInstId}`;
                                KEYS.isSplitMode = `${STORAGE_PREFIX}_is_split_mode_${newInstId}`;
                                KEYS.secondaryTabIndex = `${STORAGE_PREFIX}_secondary_tab_index_${newInstId}`;
                                KEYS.splitRatio = `${STORAGE_PREFIX}_split_ratio_${newInstId}`;
                            }
                            sessionStorage.setItem('lumina_window_id', String(win.id));
                        }
                        resolve();
                    });
                } else {
                    resolve();
                }
            });
        } else {
            resolve();
        }
    });

    if (window.LuminaSelection?.hide) {
        try {
            window.LuminaSelection.hide();
        } catch (e) {
            console.warn('[Spotlight] Failed to hide stale selection popup:', e);
        }
    }
    document.querySelectorAll('.lumina-overlay-backdrop').forEach(el => el.remove());
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
    document.querySelectorAll('.lumina-chat-scroll-content').forEach(el => {
        if (el.style.overflow === 'hidden') {
            el.style.overflow = '';
        }
    });

    const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
            const el = entry.target;
            const hasScroll = el.scrollHeight > el.clientHeight;
            el.classList.toggle('has-scrollbar', hasScroll);
        }
    });
    const mutationObserver = new MutationObserver(() => {
        document.querySelectorAll('.lumina-chat-scroll-content').forEach(el => {
            if (!el.__observedForScrollbar) {
                el.__observedForScrollbar = true;
                observer.observe(el);
                const hasScroll = el.scrollHeight > el.clientHeight;
                el.classList.toggle('has-scrollbar', hasScroll);
            }
        });
    });
    mutationObserver.observe(document.body, { childList: true, subtree: true });
    document.querySelectorAll('.lumina-chat-scroll-content').forEach(el => {
        if (!el.__observedForScrollbar) {
            el.__observedForScrollbar = true;
            observer.observe(el);
            const hasScroll = el.scrollHeight > el.clientHeight;
            el.classList.toggle('has-scrollbar', hasScroll);
        }
    });


    initSpotlightAskSelection();


    const inputArea = document.getElementById('input-area');

    if (inputArea) {
        inputArea.innerHTML = LuminaChatUI.getChatInputHTML(true);
        sharedInputUI = new LuminaChatUI(inputArea, {
            isSpotlight: true,
            isPrimaryInput: true,
            alwaysExpanded: true,
            onSubmit: (text, images, extra) => {
                const activeTab = tabs[activeTabIndex];
                if (activeTab) handleSubmit(text, images, extra, activeTab);
            }
        });
    }

    const inputAreaSecondary = document.getElementById('input-area-secondary');
    if (inputAreaSecondary) {
        inputAreaSecondary.innerHTML = LuminaChatUI.getChatInputHTML(true);
        sharedInputUISecondary = new LuminaChatUI(inputAreaSecondary, {
            isSpotlight: true,
            isPrimaryInput: false,
            alwaysExpanded: true,
            onSubmit: (text, images, extra) => {
                if (typeof secondaryActiveTabIndex !== 'undefined' && secondaryActiveTabIndex >= 0) {
                    const secTab = tabs[secondaryActiveTabIndex];
                    if (secTab) handleSubmit(text, images, extra, secTab);
                }
            }
        });
    }

    setupResizer();

    shouldStartNewChat = false;
    try {
        const win = await new Promise((resolve) => chrome.windows.getCurrent(resolve));
        if (win && win.id) {
            myWindowId = win.id;
            const key = `pending_sidepanel_query_${win.id}`;
            const storageData = await chrome.storage.local.get([key]);
            if (storageData[key] && storageData[key].createNewChat) {
                shouldStartNewChat = true;
            }
        }
    } catch (e) {
        console.error('[Spotlight] Failed to check pending query before initTabs:', e);
    }

    await initTabs();


    if (tabs.length === 0) {
        createTab();
    } else {

        if (tabs[activeTabIndex]) {
            chatUI = tabs[activeTabIndex].chatUIInstance;
            if (sharedInputUI) {
                sharedInputUI.historyEl = tabs[activeTabIndex].historyEl;

                sharedInputUI._updateActionBtnState();
            }
        }
        if (isSplitMode && tabs[secondaryActiveTabIndex]) {
            chatUISecondary = tabs[secondaryActiveTabIndex].chatUIInstance;
            if (sharedInputUISecondary) {
                sharedInputUISecondary.historyEl = tabs[secondaryActiveTabIndex].historyEl;
                sharedInputUISecondary._updateActionBtnState();
            }
        }
    }

    // Initialize topbar model selectors
    initTopbarModelSelector('primary');
    if (isSplitMode) {
        initTopbarModelSelector('secondary');
    }
    updateInputPlaceholder();
    updatePaneHighlight();

    if (typeof tabs !== 'undefined') {
        tabs.forEach((tab) => {
            if (tab && tab.sparkId && !tab.sessionId) {
                if (typeof renderSparkWelcomeScreen === 'function') {
                    renderSparkWelcomeScreen(tab);
                }
            }
        });
    }

    updateWelcomeScreenState('primary');
    if (isSplitMode) {
        updateWelcomeScreenState('secondary');
    }

    // Wire up split screen toggles
    document.querySelectorAll('.split-toggle-btn').forEach(btn => {
        btn.addEventListener('click', toggleSplitMode);
    });

    // Setup click detection on the panes
    const panePrimary = document.getElementById('pane-primary');
    const paneSecondary = document.getElementById('pane-secondary');

    if (panePrimary) {
        const setPrimary = () => {
            if (isSplitMode && hoveredPane !== 'primary') {
                hoveredPane = 'primary';
                updatePaneHighlight();
                updateInputPlaceholder();
                updateRecentChatsActiveState();
                if (typeof window.updateTopbarModelSelector === 'function') {
                    window.updateTopbarModelSelector();
                }
            }
        };
        panePrimary.addEventListener('click', setPrimary, true);
    }

    if (paneSecondary) {
        const setSecondary = () => {
            if (isSplitMode && hoveredPane !== 'secondary') {
                hoveredPane = 'secondary';
                updatePaneHighlight();
                updateInputPlaceholder();
                updateRecentChatsActiveState();
                if (typeof window.updateTopbarModelSelectorSecondary === 'function') {
                    window.updateTopbarModelSelectorSecondary();
                }
            }
        };
        paneSecondary.addEventListener('click', setSecondary, true);
    }

    window.addEventListener('resize', () => {
        if (isSplitMode && window.innerWidth < 900) {
            toggleSplitMode();
        }
    });

    setupPort();

    // History loaded directly in initTabs if urlSessionId is present


    setupRegenerateButtons();


    chrome.storage.local.get(['fontSize', 'shortcuts', 'annotationShortcuts', 'globalDefaults', 'questionMappings', 'askSelectionPopupEnabled', 'readWebpage', 'advancedParamsByModel', 'pendingMicToggle'], (items) => {
        if (items.readWebpage !== undefined) readWebpageEnabled = !!items.readWebpage;
        shortcuts = items.shortcuts || {};
        annotationShortcuts = items.annotationShortcuts || [];
        questionMappings = items.questionMappings || [];
        askSelectionPopupEnabled = items.askSelectionPopupEnabled ?? false;
        advancedParamsByModel = items.advancedParamsByModel || {};
        const size = items.fontSize || (items.globalDefaults && items.globalDefaults.fontSize);
        if (size) {
            applyFontSize(size);
        }


        if (items.pendingMicToggle) {
            const diff = Date.now() - items.pendingMicToggle;
            if (diff < 5000) {
                chrome.storage.local.remove(['pendingMicToggle']);
                setTimeout(() => {
                    const micBtn = document.getElementById('mic-btn');
                    if (micBtn) micBtn.click();
                }, 400);
            } else {
                chrome.storage.local.remove(['pendingMicToggle']);
            }
        }

        setupGlobalListeners();
        setupWebSourceTracking();
        isInitializing = false;
    });


    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local') {

            const pendingKey = myWindowId ? `pending_sidepanel_query_${myWindowId}` : null;
            if (pendingKey && changes[pendingKey] && changes[pendingKey].newValue) {
                processPendingQuery(changes[pendingKey].newValue, pendingKey);
            }


            if (changes.shortcuts) shortcuts = changes.shortcuts.newValue || {};
            if (changes.annotationShortcuts) annotationShortcuts = changes.annotationShortcuts.newValue || [];
            if (changes.questionMappings) questionMappings = changes.questionMappings.newValue || [];
            if (changes.askSelectionPopupEnabled) {
                askSelectionPopupEnabled = changes.askSelectionPopupEnabled.newValue ?? false;
                if (!askSelectionPopupEnabled && window.LuminaSelection) LuminaSelection.hide();
            }
            if (changes.readWebpage) readWebpageEnabled = !!changes.readWebpage.newValue;
            if (changes.advancedParamsByModel) advancedParamsByModel = changes.advancedParamsByModel.newValue || {};


            if (changes.fontSize) {
                applyFontSize(changes.fontSize.newValue);
            } else if (changes.globalDefaults && changes.globalDefaults.newValue && changes.globalDefaults.newValue.fontSize) {
                applyFontSize(changes.globalDefaults.newValue.fontSize);
            }


            handleRemoteSync(changes, areaName);
        }
    });


    function processPendingQuery(data, storageKey) {
        if (!data) return;


        if (storageKey) {
            chrome.storage.local.remove([storageKey]);
        }

        const { query, displayQuery, queryId, mode, sourceTab, timestamp } = data;


        if (timestamp && (Date.now() - timestamp > 120000)) {
            console.log('[Spotlight] Skipping stale pending query:', queryId);
            return;
        }

        if (queryId && handledQueryIds.has(queryId)) {
            return;
        }

        const checkReady = async () => {
            const currentTab = tabs[activeTabIndex];
            if (currentTab && !isInitializing) {
                if (queryId) handledQueryIds.add(queryId);

                if (sourceTab) {
                    toggleWebSourcePin(sourceTab, true);
                }

                if (data.createNewChat) {
                    resetChat(false);
                }

                await ensureTabHistoryLoaded(currentTab);
                handleSubmit(query, [], { mode: mode || 'qa' }, currentTab, displayQuery);
            } else {
                setTimeout(checkReady, 50);
            }
        };
        checkReady();
    }



    document.addEventListener('lumina:spotlight-model-change', (e) => {
        const isSecondary = e.target.closest('#pane-secondary') !== null;
        const targetIndex = isSecondary ? secondaryActiveTabIndex : activeTabIndex;
        const targetSharedUI = isSecondary ? sharedInputUISecondary : sharedInputUI;

        const activeTab = tabs[targetIndex];
        if (activeTab && e.detail) {
            activeTab.selectedModel = { model: e.detail.model, providerId: e.detail.providerId };
            if (activeTab.chatUIInstance) {
                activeTab.chatUIInstance.activeTabModel = { ...activeTab.selectedModel };
            }
            if (targetSharedUI) {
                targetSharedUI.activeTabModel = { ...activeTab.selectedModel };
            }

            const sidKey = activeTab.sessionId || 'null';
            chrome.storage.local.get(['lumina_session_settings'], (res) => {
                const settings = res.lumina_session_settings || {};
                if (!settings[sidKey]) settings[sidKey] = {};
                settings[sidKey].selectedModel = activeTab.selectedModel;
                chrome.storage.local.set({ lumina_session_settings: settings });
            });

            chrome.storage.local.set({ lastUsedModel: activeTab.selectedModel });
        }
    });

    chrome.runtime.onMessage.addListener((request) => {
        if (request.action === 'settings_updated') {

            const size = request.settings.fontSize || (request.settings.globalDefaults?.fontSize);
            if (size) applyFontSize(size);
        } else if (request.action === 'clear_selection') {

            window.getSelection().removeAllRanges();

            ensureFocus();
        } else if (request.action === 'new_chat') {
            resetChat();
        } else if (request.action === 'ask_sidepanel') {
            const targetWinId = request.windowId;
            if (myWindowId === null || myWindowId === targetWinId) {
                const { query, displayQuery, queryId, mode, sourceTab } = request;
                if (queryId && handledQueryIds.has(queryId)) {
                    console.log('[Spotlight] Ignoring duplicate query via message:', queryId);
                    return;
                }
                if (queryId) handledQueryIds.add(queryId);

                if (sourceTab) {
                    toggleWebSourcePin(sourceTab, true);
                }

                const currentTab = tabs[activeTabIndex];
                if (currentTab) {
                    ensureTabHistoryLoaded(currentTab).then(() => {
                        handleSubmit(query, [], { mode: mode || 'qa' }, currentTab, displayQuery);
                    });
                }
            }
        } else if (request.action === 'pin_web_source') {
            chrome.windows.getCurrent((win) => {
                if (win.id === request.windowId && request.source) {
                    toggleWebSourcePin(request.source, true);
                }
            });
        }
    });


    chrome.windows.getCurrent(async (win) => {
        if (!win || !win.id) return;
        const key = `pending_sidepanel_query_${win.id}`;
        const storageData = await chrome.storage.local.get([key]);
        if (storageData[key]) {
            processPendingQuery(storageData[key], key);
        }
    });

    if (new URLSearchParams(window.location.search).has('sidepanel')) {
        chrome.windows.getCurrent((win) => {
            if (win && win.id) {
                myWindowId = win.id;
                const port = chrome.runtime.connect({ name: 'lumina-sidepanel' });
                port.postMessage({ windowId: win.id });
                port.onMessage.addListener((msg) => {
                    if (msg.action === 'content_updated') {
                        refreshWebSourceTokensForTab(msg.tabId);
                    }
                });
                window.addEventListener('pagehide', () => {
                    port.postMessage({ action: 'closing', windowId: win.id });
                });
            }
        });
    }


    function ensureFocus() {
        const targetInput = getHoveredInputEl();
        if (!targetInput) return;


        const sidebar = document.getElementById('lumina-sidebar');
        if (sidebar && sidebar.classList.contains('active')) return;

        const setCursorToEnd = (el) => {
            try {
                el.focus();

                const len = el.value.length;
                el.setSelectionRange(len, len);
            } catch (e) {

            }
        };


        setCursorToEnd(targetInput);


        setTimeout(() => {
            const sidebar = document.getElementById('lumina-sidebar');
            const el = getHoveredInputEl();
            if (el && (!sidebar || !sidebar.classList.contains('active'))) setCursorToEnd(el);
        }, 50);
        setTimeout(() => {
            const sidebar = document.getElementById('lumina-sidebar');
            const el = getHoveredInputEl();
            if (el && (!sidebar || !sidebar.classList.contains('active'))) setCursorToEnd(el);
        }, 150);
    }


    ensureFocus();


    window.addEventListener('focus', () => {
        const selection = window.getSelection().toString().trim();

        if (selection && (selection.includes('--lumina-') || selection.includes('var(--lumina'))) {
            window.getSelection().removeAllRanges();
            ensureFocus();
            return;
        }


        if (!selection) {
            ensureFocus();
        }
    });


    setInterval(() => {
        if (tabs[activeTabIndex]) {
            const currentScroll = tabs[activeTabIndex].historyEl.scrollTop;
            if (tabs[activeTabIndex].scrollTop !== currentScroll) {
                tabs[activeTabIndex].scrollTop = currentScroll;
                saveTabsState();
            }
        }
    }, 5000);


    const updateReadTitles = () => {
        if (typeof sharedInputUI?.refreshReadPageTitle === 'function') sharedInputUI.refreshReadPageTitle();
        if (typeof sharedInputUISecondary?.refreshReadPageTitle === 'function') sharedInputUISecondary.refreshReadPageTitle();
    };
    if (typeof chrome !== 'undefined' && chrome.tabs) {
        chrome.tabs.onActivated.addListener(updateReadTitles);
        chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
            if (changeInfo.status === 'complete' || changeInfo.title) {
                updateReadTitles();
            }
        });
    }

    initSidebar();

    // Auto-open settings if requested via URL params
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('settings') === '1' || urlParams.get('section')) {
        setTimeout(() => {
            if (typeof LuminaSettingsModal !== 'undefined') {
                LuminaSettingsModal.show();
                const section = urlParams.get('section');
                if (section) {
                    LuminaSettingsModal.switchSection(section);
                }
            }
        }, 300);
    }
}

function initSidebar() {
    const sidebar = document.getElementById('lumina-sidebar');
    const toggleBtn = document.getElementById('sidebar-toggle-btn');
    const closeBtn = document.getElementById('sidebar-close-btn');
    const newChatBtn = document.getElementById('sidebar-new-chat-btn');
    const settingsBtn = document.getElementById('sidebar-settings-btn');
    const searchBtn = document.getElementById('sidebar-search-btn');

    // Create backdrop for mobile sidebar overlay
    let backdrop = document.querySelector('.sidebar-backdrop');
    if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.className = 'sidebar-backdrop';
        document.body.appendChild(backdrop);
    }

    // Load collapsed state from localStorage
    const isCollapsed = localStorage.getItem('lumina_sidebar_collapsed') === 'true';
    if (isCollapsed && sidebar) {
        sidebar.classList.add('sidebar-collapsed');
    }

    // Toggle sidebar on desktop or mobile
    if (toggleBtn && sidebar) {
        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent trigger click on sidebar container
            if (window.innerWidth <= 900) {
                if (sidebar.classList.contains('active')) {
                    closeMobileSidebar();
                } else {
                    sidebar.classList.add('active');
                    backdrop.classList.add('active');
                    document.body.classList.add('sidebar-open');
                }
            } else {
                sidebar.classList.toggle('sidebar-collapsed');
                localStorage.setItem('lumina_sidebar_collapsed', sidebar.classList.contains('sidebar-collapsed'));
            }
        });
    }

    // Toggle sidebar collapse/expand when clicking on empty space
    if (sidebar) {
        sidebar.addEventListener('click', (e) => {
            if (window.innerWidth <= 900) return;
            const clickedInteractive = e.target.closest('button, a, .recent-chat-item, .sidebar-spark-item, .sidebar-brand, .user-profile, input, select');
            if (!clickedInteractive) {
                if (sidebar.classList.contains('sidebar-collapsed')) {
                    sidebar.classList.remove('sidebar-collapsed');
                    localStorage.setItem('lumina_sidebar_collapsed', 'false');
                } else {
                    sidebar.classList.add('sidebar-collapsed');
                    localStorage.setItem('lumina_sidebar_collapsed', 'true');
                }
            }
        });
    }

    // Close mobile sidebar on backdrop click
    const closeMobileSidebar = () => {
        if (sidebar) sidebar.classList.remove('active');
        if (backdrop) backdrop.classList.remove('active');
        document.body.classList.remove('sidebar-open');
    };

    if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (window.innerWidth <= 900) {
                closeMobileSidebar();
            } else {
                sidebar.classList.add('sidebar-collapsed');
                localStorage.setItem('lumina_sidebar_collapsed', 'true');
            }
        });
    }

    if (backdrop) {
        backdrop.addEventListener('click', closeMobileSidebar);
    }

    if (newChatBtn) {
        newChatBtn.addEventListener('click', () => {
            resetChat(null);
            closeMobileSidebar();
        });
    }

    const brandBtn = document.querySelector('.sidebar-brand');
    if (brandBtn) {
        brandBtn.style.cursor = 'pointer';
        brandBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (typeof sparksClosePage === 'function') {
                sparksClosePage();
            }
            resetChat();
            closeMobileSidebar();
        });
    }

    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            if (typeof LuminaSettingsModal !== 'undefined') {
                LuminaSettingsModal.show();
            } else {
                chrome.runtime.openOptionsPage();
            }
            closeMobileSidebar();
        });
    }

    if (searchBtn) {
        searchBtn.addEventListener('click', () => {
            if (typeof LuminaSearchModal !== 'undefined') {
                LuminaSearchModal.show();
            }
            closeMobileSidebar();
        });
    }

    const userProfileEl = document.querySelector('.user-profile');
    if (userProfileEl) {
        userProfileEl.style.cursor = 'pointer';
        userProfileEl.addEventListener('click', (e) => {
            e.stopPropagation();

            let ctxMenu = document.getElementById('user-profile-context-menu');
            if (!ctxMenu) {
                ctxMenu = document.createElement('div');
                ctxMenu.id = 'user-profile-context-menu';
                ctxMenu.className = 'sidebar-chat-context-menu';
                ctxMenu.style.display = 'none';

                const currentName = (typeof LuminaAuth !== 'undefined' && LuminaAuth.isAuthenticated && LuminaAuth.user) ? (LuminaAuth.user.name || "User") : "Lumina User";
                const isAuth = typeof LuminaAuth !== 'undefined' && LuminaAuth.isAuthenticated;

                ctxMenu.innerHTML = `
                    <div class="sidebar-ctx-item sidebar-ctx-header-name" style="pointer-events:none;font-weight:600;font-size:12px;color:var(--lumina-sidebar-text-muted, #757575);padding-bottom:2px;">
                        ${currentName}
                    </div>
                    <div class="sidebar-ctx-divider"></div>
                    <div class="sidebar-ctx-item" data-action="sync">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>
                        <span>Sync now</span>
                    </div>
                    <div class="sidebar-ctx-item sidebar-ctx-item--danger" data-action="logout">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>
                        <span>${isAuth ? 'Sign out' : 'Sign in'}</span>
                    </div>
                `;
                document.body.appendChild(ctxMenu);

                ctxMenu.querySelectorAll('.sidebar-ctx-item').forEach(item => {
                    item.addEventListener('click', async (e) => {
                        const action = item.dataset.action;
                        ctxMenu.style.display = 'none';
                        if (action === 'sync') {
                            if (typeof LuminaSync !== 'undefined') {
                                LuminaSync.syncUp().catch(err => console.error("Sync failed:", err));
                            }
                        } else if (action === 'logout') {
                            if (typeof LuminaAuth !== 'undefined') {
                                if (LuminaAuth.isAuthenticated) {
                                    LuminaAuth.logout();
                                } else {
                                    LuminaAuth.login();
                                }
                            }
                        }
                    });
                });
            }

            const isAuth = typeof LuminaAuth !== 'undefined' && LuminaAuth.isAuthenticated;
            const currentName = (isAuth && LuminaAuth.user) ? (LuminaAuth.user.name || "User") : "Lumina User";
            const nameHeader = ctxMenu.querySelector('.sidebar-ctx-header-name');
            if (nameHeader) {
                nameHeader.textContent = currentName;
            }
            const logoutSpan = ctxMenu.querySelector('[data-action="logout"] span');
            if (logoutSpan) {
                logoutSpan.textContent = isAuth ? 'Sign out' : 'Sign in';
            }

            const rect = userProfileEl.getBoundingClientRect();
            ctxMenu.style.display = 'block';
            let top = rect.top - ctxMenu.offsetHeight - 6;
            let left = rect.left;
            if (top < 4) top = 4;
            ctxMenu.style.top = top + 'px';
            ctxMenu.style.left = left + 'px';
        });
    }

    document.addEventListener('mousedown', (e) => {
        const userCtxMenu = document.getElementById('user-profile-context-menu');
        if (userCtxMenu && userCtxMenu.style.display !== 'none') {
            if (!userCtxMenu.contains(e.target) && !e.target.closest('.user-profile')) {
                userCtxMenu.style.display = 'none';
            }
        }
    });

    // Initial render of recent chats
    renderRecentChatsSidebar();

    // Listen to storage changes to keep recent chats synchronized
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local') {
            if (changes[ChatHistoryManager.STORAGE_KEY]) {
                renderRecentChatsSidebar();
            }
            if (changes.lumina_sparks) {
                sparksCache = changes.lumina_sparks.newValue || {};
                updateInputPlaceholder();
            }
            if (changes.lumina_session_settings) {
                sessionSettings = changes.lumina_session_settings.newValue || {};
                
                const tabsToUpdate = [];
                if (activeTabIndex >= 0 && tabs[activeTabIndex]) tabsToUpdate.push({ tab: tabs[activeTabIndex], isSec: false });
                if (typeof isSplitMode !== 'undefined' && isSplitMode && secondaryActiveTabIndex >= 0 && tabs[secondaryActiveTabIndex]) tabsToUpdate.push({ tab: tabs[secondaryActiveTabIndex], isSec: true });

                let changedAny = false;
                let promises = tabsToUpdate.map(({ tab, isSec }) => {
                    const sidKey = tab.sessionId || 'null';
                    if (sidKey !== 'null') {
                        const saved = sessionSettings[sidKey] || {};
                        const targetInputUI = isSec ? sharedInputUISecondary : sharedInputUI;
                        if (saved.selectedModel && JSON.stringify(tab.selectedModel) !== JSON.stringify(saved.selectedModel)) {
                            tab.selectedModel = saved.selectedModel;
                            if (targetInputUI) {
                                targetInputUI.activeTabModel = { ...saved.selectedModel };
                            }
                            changedAny = true;

                            return new Promise((resolve) => {
                                chrome.storage.local.get(['advancedParamsByModel'], (res) => {
                                    const advParams = res.advancedParamsByModel || {};
                                    const modelObj = saved.selectedModel;
                                    const compositeKey = modelObj.providerId ? `${modelObj.providerId}:${modelObj.model}` : modelObj.model;
                                    const modelParams = advParams[compositeKey] || advParams[modelObj.model] || {};

                                    const defaultThinking = window.LuminaModelHelper.getDefaultThinking(modelObj.model, modelObj.providerId);
                                    const newThinkingLevel = modelParams.thinkingLevel || defaultThinking;

                                    tab.thinkingLevel = newThinkingLevel;
                                    if (tab.chatUIInstance) {
                                        tab.chatUIInstance.thinkingLevel = newThinkingLevel;
                                    }
                                    if (targetInputUI) {
                                        targetInputUI.thinkingLevel = newThinkingLevel;
                                        if (typeof targetInputUI.refreshReasoningSelector === 'function') targetInputUI.refreshReasoningSelector();
                                    }
                                    resolve();
                                });
                            });
                        }
                    }
                    return Promise.resolve();
                });

                Promise.all(promises).then(() => {
                    if (changedAny) {
                        if (typeof saveTabsState === 'function') {
                            saveTabsState();
                        }
                        if (sharedInputUI && typeof sharedInputUI.refreshModelSelector === 'function') {
                            sharedInputUI.refreshModelSelector();
                        }
                        if (sharedInputUISecondary && typeof sharedInputUISecondary.refreshModelSelector === 'function') {
                            sharedInputUISecondary.refreshModelSelector();
                        }
                        if (typeof window.updateTopbarModelSelector === 'function') {
                            window.updateTopbarModelSelector();
                        }
                        if (typeof window.updateTopbarModelSelectorSecondary === 'function') {
                            window.updateTopbarModelSelectorSecondary();
                        }
                    }
                });
            }
        }
    });
}

function updateRecentChatsActiveState() {
    const isSec = (typeof isSplitMode !== 'undefined' && isSplitMode && typeof hoveredPane !== 'undefined' && hoveredPane === 'secondary');
    const targetIdx = isSec ? secondaryActiveTabIndex : activeTabIndex;
    const activeTab = (typeof tabs !== 'undefined' && targetIdx >= 0) ? tabs[targetIdx] : null;
    const activeSessionId = activeTab ? activeTab.sessionId : null;

    document.querySelectorAll('#sidebar-recent-chats .recent-chat-item').forEach(item => {
        const sid = item.dataset.sessionId;
        if (activeSessionId && sid === activeSessionId) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
}

function updateSidebarSparksActiveState() {
    document.querySelectorAll('#sidebar-sparks-list .sidebar-spark-item.active').forEach(item => {
        item.classList.remove('active');
    });
}
window.updateSidebarSparksActiveState = updateSidebarSparksActiveState;

async function renderRecentChatsSidebar() {
    const listContainer = document.getElementById('sidebar-recent-chats');
    if (!listContainer) return;

    const result = await chrome.storage.local.get([ChatHistoryManager.STORAGE_KEY]);
    const sessions = result[ChatHistoryManager.STORAGE_KEY] || {};
    const historyData = Object.values(sessions)
        .sort((a, b) => {
            const aPinned = !!a.pinned;
            const bPinned = !!b.pinned;
            if (aPinned !== bPinned) {
                return aPinned ? -1 : 1;
            }
            return b.updatedAt - a.updatedAt;
        });

    const sparksRes = await chrome.storage.local.get(['lumina_sparks']);
    const sparksMap = sparksRes.lumina_sparks || {};

    let html = '';
    if (historyData.length === 0) {
        html = '<div style="padding: 8px 12px; font-size: 12px; color: var(--lumina-sidebar-text-muted); text-align: center;">No recent chats</div>';
    } else {
        const activeTab = tabs[activeTabIndex];
        const activeSessionId = activeTab ? activeTab.sessionId : null;
        historyData.slice(0, 30).forEach(session => {
            let displayTitle = session.title;
            if (!session.isRenamed && !session.autoNamed && session.questions && session.questions.length > 0) {
                displayTitle = session.questions[session.questions.length - 1].text || "Untitled Chat";
            }
            if (!displayTitle) displayTitle = "Untitled Chat";

            let iconHTML = '';

            const isNamingClass = (window.namingSessionIds && window.namingSessionIds.has(session.id)) ? ' is-naming' : '';
            const isActive = session.id === activeSessionId ? ' active' : '';
            const pinHTML = session.pinned ? `
                <span class="recent-chat-item__pin-icon" title="Pinned">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4 H15 V9 C15 11 17 11 17 13 A1.5 1.5 0 0 1 15.5 14.5 H8.5 A1.5 1.5 0 0 1 7 13 C7 11 9 11 9 9 Z" /><path d="M12 14.5 V21" /></svg>
                </span>
            ` : '';

            html += `
                <div class="recent-chat-item${isActive}${isNamingClass}" data-session-id="${session.id}" data-spark-id="${session.sparkId || ''}" data-title="${escapeHtml(displayTitle)}">
                    ${iconHTML}
                    <span class="recent-chat-item__title">${escapeHtml(displayTitle)}</span>
                    ${pinHTML}
                    <button class="recent-chat-item__menu-btn" data-session-id="${session.id}" title="More options" tabindex="-1">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
                    </button>
                </div>
            `;
        });

        // Inject skeleton for any naming session not yet in storage
        if (window.namingSessionIds && window.namingSessionIds.size > 0) {
            const storedIds = new Set(historyData.map(s => s.id));
            window.namingSessionIds.forEach(namingSid => {
                if (!storedIds.has(namingSid)) {
                    const isActive = namingSid === activeSessionId ? ' active' : '';
                    html = `
                        <div class="recent-chat-item${isActive} is-naming" data-session-id="${namingSid}" data-spark-id="">
                            <span class="recent-chat-item__title"></span>
                            <button class="recent-chat-item__menu-btn" data-session-id="${namingSid}" title="More options" tabindex="-1">
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
                            </button>
                        </div>
                    ` + html;
                }
            });
        }
    }

    listContainer.innerHTML = html;

    // Ensure sidebar context menu exists
    let ctxMenu = document.getElementById('sidebar-chat-context-menu');
    if (!ctxMenu) {
        ctxMenu = document.createElement('div');
        ctxMenu.id = 'sidebar-chat-context-menu';
        ctxMenu.className = 'sidebar-chat-context-menu';
        ctxMenu.style.display = 'none';
        ctxMenu.innerHTML = `
            <div class="sidebar-ctx-item" data-action="pin">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4 H15 V9 C15 11 17 11 17 13 A1.5 1.5 0 0 1 15.5 14.5 H8.5 A1.5 1.5 0 0 1 7 13 C7 11 9 11 9 9 Z" /><path d="M12 14.5 V21" /></svg>
                <span>Pin</span>
            </div>
            <div class="sidebar-ctx-item" data-action="rename">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>
                <span>Rename</span>
            </div>
            <div class="sidebar-ctx-item" data-action="duplicate">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                <span>Duplicate</span>
            </div>
            <div class="sidebar-ctx-divider"></div>
            <div class="sidebar-ctx-item sidebar-ctx-item--danger" data-action="delete">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                <span>Delete</span>
            </div>
        `;
        document.body.appendChild(ctxMenu);

        // Close on outside click
        document.addEventListener('mousedown', (e) => {
            if (!ctxMenu.contains(e.target) && !e.target.closest('.recent-chat-item__menu-btn')) {
                ctxMenu.style.display = 'none';
                document.querySelectorAll('.recent-chat-item.ctx-active').forEach(el => el.classList.remove('ctx-active'));
            }
        });

        ctxMenu.querySelectorAll('.sidebar-ctx-item').forEach(item => {
            item.addEventListener('click', async (e) => {
                const action = item.dataset.action;
                const sid = ctxMenu.dataset.sessionId;
                ctxMenu.style.display = 'none';
                document.querySelectorAll('.recent-chat-item.ctx-active').forEach(el => el.classList.remove('ctx-active'));

                if (!sid) return;

                if (action === 'pin') {
                    const res = await chrome.storage.local.get([ChatHistoryManager.STORAGE_KEY]);
                    const store = res[ChatHistoryManager.STORAGE_KEY] || {};
                    const session = store[sid];
                    if (session) {
                        const currentlyPinned = !!session.pinned;
                        if (!currentlyPinned) {
                            let currentTitle = session.title || 'Untitled Chat';
                            if (!session.isRenamed && !session.autoNamed && session.questions && session.questions.length > 0) {
                                currentTitle = session.questions[session.questions.length - 1].text || currentTitle;
                            }
                            const newTitle = await window.showCustomPopup({
                                title: 'Pin this chat',
                                body: '',
                                isInput: true,
                                defaultValue: currentTitle,
                                confirmLabel: 'Pin'
                            });
                            if (newTitle === null) return;
                            session.pinned = true;
                            if (newTitle.trim()) {
                                session.title = newTitle.trim();
                                session.isRenamed = true;
                            }
                        } else {
                            session.pinned = false;
                        }
                        await chrome.storage.local.set({ [ChatHistoryManager.STORAGE_KEY]: store });
                        if (session.isRenamed) {
                            const activeTab = tabs[activeTabIndex];
                            if (activeTab && activeTab.sessionId === sid) {
                                activeTab.title = session.title;
                                renderTabs();
                            }
                        }
                        renderRecentChatsSidebar();
                    }
                } else if (action === 'rename') {
                    const res = await chrome.storage.local.get([ChatHistoryManager.STORAGE_KEY]);
                    const store = res[ChatHistoryManager.STORAGE_KEY] || {};
                    const meta = store[sid];
                    let currentTitle = meta?.title || 'Untitled Chat';
                    if (!meta?.isRenamed && !meta?.autoNamed && meta?.questions?.length > 0) {
                        currentTitle = meta.questions[meta.questions.length - 1].text || currentTitle;
                    }
                    const newTitle = await window.showCustomPopup({
                        title: 'Rename Chat',
                        body: 'Enter a new title for this conversation:',
                        isInput: true,
                        defaultValue: currentTitle,
                        confirmLabel: 'Rename'
                    });
                    if (newTitle && newTitle.trim() && newTitle.trim() !== currentTitle) {
                        await ChatHistoryManager.renameChat(sid, newTitle.trim());
                    }
                } else if (action === 'duplicate') {
                    await ChatHistoryManager.duplicateChat(sid);
                } else if (action === 'delete') {
                    const confirmed = await window.showCustomPopup({
                        title: 'Delete Chat',
                        body: 'Are you sure you want to delete this chat? This action cannot be undone.',
                        confirmLabel: 'Delete',
                        isDanger: true
                    });
                    if (confirmed) {
                        await ChatHistoryManager.deleteChat(sid);
                        tabs.forEach((tab, index) => {
                            if (tab.sessionId === sid) {
                                const isSecondary = (typeof isSplitMode !== 'undefined' && isSplitMode && index === secondaryActiveTabIndex);
                                resetChat(isSecondary);
                            }
                        });
                    }
                }
            });
        });
    }

    // Wire up 3-dot buttons
    listContainer.querySelectorAll('.recent-chat-item__menu-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const sid = btn.dataset.sessionId;
            const parentItem = btn.closest('.recent-chat-item');

            // Recheck pinned state for label and icon
            ctxMenu.dataset.sessionId = sid;
            const pinItem = ctxMenu.querySelector('[data-action="pin"]');
            if (pinItem) {
                chrome.storage.local.get([ChatHistoryManager.STORAGE_KEY]).then(res => {
                    const store = res[ChatHistoryManager.STORAGE_KEY] || {};
                    const isPinned = !!store[sid]?.pinned;
                    const textEl = pinItem.querySelector('span');
                    if (textEl) textEl.textContent = isPinned ? 'Unpin' : 'Pin';

                    const svgContainer = pinItem.querySelector('svg');
                    if (svgContainer) {
                        if (isPinned) {
                            svgContainer.setAttribute('stroke-width', '1.8');
                            svgContainer.innerHTML = `<path d="M9 4 H15 V10 C15 12 17 12 17 14 A2 2 0 0 1 15 16 H9 A2 2 0 0 1 7 14 C7 12 9 12 9 10 Z" /><path d="M12 16 V22" /><path d="M4 4 L20 20" />`;
                        } else {
                            svgContainer.setAttribute('stroke-width', '2.0');
                            svgContainer.innerHTML = `<path d="M9 4 H15 V9 C15 11 17 11 17 13 A1.5 1.5 0 0 1 15.5 14.5 H8.5 A1.5 1.5 0 0 1 7 13 C7 11 9 11 9 9 Z" /><path d="M12 14.5 V21" />`;
                        }
                    }
                });
            }

            // Highlight active item
            document.querySelectorAll('.recent-chat-item.ctx-active').forEach(el => el.classList.remove('ctx-active'));
            if (parentItem) parentItem.classList.add('ctx-active');

            // Position menu near button
            const rect = btn.getBoundingClientRect();
            ctxMenu.style.display = 'block';
            let top = rect.bottom + 4;
            let left = rect.right - ctxMenu.offsetWidth;
            if (left < 4) left = 4;
            if (top + ctxMenu.offsetHeight > window.innerHeight - 4) {
                top = rect.top - ctxMenu.offsetHeight - 4;
            }
            ctxMenu.style.top = top + 'px';
            ctxMenu.style.left = left + 'px';
        });
    });

    // Wire up click to load chat
    listContainer.querySelectorAll('.recent-chat-item').forEach(item => {
        item.addEventListener('click', async (e) => {
            if (e.target.closest('.recent-chat-item__menu-btn')) return;

            // Set active immediately to prevent lag/delay
            listContainer.querySelectorAll('.recent-chat-item.active').forEach(el => el.classList.remove('active'));
            document.querySelectorAll('#sidebar-sparks-list .sidebar-spark-item.active').forEach(el => el.classList.remove('active'));
            item.classList.add('active');

            const sid = item.dataset.sessionId;
            const contentKey = `lumina_session_${sid}`;
            const contentData = await chrome.storage.local.get([contentKey]);
            const messages = contentData[contentKey] || [];
            const meta = sessions[sid] || { id: sid };
            window.loadHistoryIntoNewTab(messages, meta, sid);
            // Close mobile sidebar after selecting a chat
            const sidebar = document.getElementById('lumina-sidebar');
            const backdrop = document.querySelector('.sidebar-backdrop');
            if (sidebar) sidebar.classList.remove('active');
            if (backdrop) backdrop.classList.remove('active');
            document.body.classList.remove('sidebar-open');
        });
    });
}


function syncSessionsWithBackground() {
    if (!port || tabs.length === 0) return;
    const sessionIds = [...new Set(tabs.map(t => t.sessionId).filter(Boolean))];
    if (sessionIds.length > 0) {
        port.postMessage({ action: 'register_sessions', sessionIds });
    }
}

function setupPort() {
    try {
        port = chrome.runtime.connect({ name: 'lumina-chat-stream' });


        syncSessionsWithBackground();

        port.onMessage.addListener((msg) => {

            let affectedTabs = [];


            if (msg.sessionId) {
                affectedTabs = tabs.filter(t => t.sessionId === msg.sessionId);
            } else if (streamingTab && streamingTab.sessionId) {
                affectedTabs = tabs.filter(t => t.sessionId === streamingTab.sessionId);
            } else if (chatUI) {
                affectedTabs = [tabs[activeTabIndex]];
            }

            if (msg.error) {
                console.error('[Lumina Stream] error', {
                    tabId: streamingTab?.id || null,
                    sessionId: streamingTab?.sessionId || null,
                    error: msg.error
                });
                affectedTabs.forEach(tab => {
                    const targetUI = tab.chatUIInstance;
                    targetUI.removeLoading();
                    targetUI.removeSearching();
                    targetUI.appendError(msg.error);
                    targetUI.currentAnswerDiv = null;
                });

                const _streamingIsSec = typeof isSplitMode !== 'undefined' && isSplitMode && streamingTab === tabs[secondaryActiveTabIndex];
                const _streamingInputUI = _streamingIsSec ? sharedInputUISecondary : sharedInputUI;
                if (_streamingInputUI) {
                    _streamingInputUI.isGenerating = false;
                    _streamingInputUI._updateActionBtnState();
                }
                streamingTab = null;
                return;
            }


            if (msg.action === 'web_search_status') {
                affectedTabs.forEach(tab => {
                    tab.chatUIInstance.handleWebSearchStatus(msg);
                });
                return;
            }




            if (msg.action === 'chunk' && msg.chunk) {
                affectedTabs.forEach(tab => {
                    tab.chatUIInstance.appendChunk(msg.chunk, tab.id !== streamingTab?.id);
                });
            }


            if (msg.action === 'done') {
                const sid = msg.sessionId || (streamingTab?.sessionId);


                affectedTabs.forEach(tab => {
                    const targetUI = tab.chatUIInstance;
                    const answerDiv = targetUI.currentAnswerDiv;
                    const isRegen = !!targetUI._regenScrollLocked;

                    const skipScroll = isRegen || tab.id !== streamingTab?.id;
                    const skipMargin = isRegen;
                    targetUI.finishAnswer(skipMargin, skipScroll);


                    if (isRegen && targetUI._regenScrollContainer) {
                        const lockedContainer = targetUI._regenScrollContainer;
                        requestAnimationFrame(() => {
                            requestAnimationFrame(() => {

                                lockedContainer.style.overflowAnchor = '';


                                targetUI._regenScrollLocked = false;
                                targetUI._regenScrollContainer = null;
                                targetUI._regenScrollPosition = null;

                                const sh = lockedContainer.scrollHeight;
                                const vh = lockedContainer.clientHeight;
                                const pos = lockedContainer.scrollTop;
                                const nearBottom = sh - (pos + vh) <= 20;
                                targetUI.disableAutoScroll = !nearBottom;
                            });
                        });
                    }


                    requestAnimationFrame(() => {
                        const _doneIsSec = typeof isSplitMode !== 'undefined' && isSplitMode && tab === tabs[secondaryActiveTabIndex];
                        const _doneInputUI = _doneIsSec ? sharedInputUISecondary : sharedInputUI;
                        if (_doneInputUI) {
                            _doneInputUI.isGenerating = false;
                            _doneInputUI._updateActionBtnState();
                        }
                        if (answerDiv) {
                            const entry = answerDiv.closest('.lumina-dict-entry');
                            if (entry) {
                                const nav = entry.querySelector('.lumina-answer-nav');
                                if (nav) nav.style.display = 'flex';


                                if (targetUI._regenEntryType === 'translation' && targetUI._regenSourceText) {
                                    const latestTranslation = answerDiv.textContent.trim();
                                    chrome.runtime.sendMessage({
                                        action: 'update_translation_cache',
                                        text: targetUI._regenSourceText,
                                        translation: latestTranslation,
                                        targetLang: 'vi'
                                    });
                                }
                            }
                        }
                    });
                });

                saveTabsState();

                streamingTab = null;
                streamDebugState = null;
            }
        });

        port.onDisconnect.addListener(() => {
            const lastError = chrome.runtime.lastError;

            if (streamingTab || (streamDebugState && streamDebugState.chunkCount > 0)) {

            } else {
            }

            port = null;


            if (streamingTab && streamingTab.sessionId) {
                const affectedTabs = tabs.filter(t => t.sessionId === streamingTab.sessionId);
                affectedTabs.forEach(t => {
                    const tUI = t.chatUIInstance;
                    if (tUI) {
                        tUI.hideStopButton();
                        if (tUI._regenScrollLocked && tUI._regenScrollContainer) {
                            tUI._regenScrollContainer.scrollTop = tUI._regenScrollPosition;
                            tUI._regenScrollContainer.style.overflowAnchor = '';
                            tUI._regenScrollLocked = false;
                            tUI._regenScrollContainer = null;
                            tUI._regenScrollPosition = null;
                        }
                    }
                });
            } else if (chatUI) {
                chatUI.hideStopButton();
                if (chatUI._regenScrollLocked && chatUI._regenScrollContainer) {
                    chatUI._regenScrollContainer.scrollTop = chatUI._regenScrollPosition;
                    chatUI._regenScrollContainer.style.overflowAnchor = '';
                    chatUI._regenScrollLocked = false;
                    chatUI._regenScrollContainer = null;
                    chatUI._regenScrollPosition = null;
                }
            }
            streamingTab = null;
            streamDebugState = null;
        });

    } catch (e) {
        console.error('[Spotlight] Failed to setup port:', e);
        port = null;
    }
}


let streamingTab = null;
let streamDebugState = null;

async function handleSubmit(text, images, extra = {}, targetTab = null, displayQuery = null) {
    const currentTab = targetTab || tabs[activeTabIndex];
    if (!currentTab) return;

    if (!currentTab.sessionId) {
        const newSessionId = 'session_' + Date.now() + Math.random().toString(36).substr(2, 5);
        currentTab.sessionId = newSessionId;
        currentTab.isHistoryLoaded = true;
        currentTab.isLoadingHistory = false;
        if (currentTab.historyEl) {
            currentTab.historyEl.dataset.sessionId = newSessionId;
        }
        const isSecondary = isSplitMode && currentTab === tabs[secondaryActiveTabIndex];
        const targetUI = isSecondary ? chatUISecondary : chatUI;
        if (targetUI && targetUI.historyEl) {
            targetUI.historyEl.dataset.sessionId = newSessionId;
        }
        updateUrlSessionId(newSessionId);

        // Copy settings of this new session to storage
        const currentModel = currentTab.selectedModel;
        const currentThinking = currentTab.thinkingLevel;
        chrome.storage.local.get(['lumina_session_settings'], (res) => {
            const settings = res.lumina_session_settings || {};
            settings[newSessionId] = {
                selectedModel: currentModel,
                thinkingLevel: currentThinking
            };
            chrome.storage.local.set({ lumina_session_settings: settings });
        });
    }


    const now = Date.now();
    const isVeryClose = lastSubmitTime && (now - lastSubmitTime < 250);
    const isDuplicateText = lastSubmitTime && (now - lastSubmitTime < 1000) && lastSubmitText === text;

    if (isVeryClose || isDuplicateText) {
        console.warn('[Lumina] Rapid submission suppressed:', { text, diff: now - lastSubmitTime });
        return;
    }
    lastSubmitTime = now;
    lastSubmitText = text;


    const targetChatUI = currentTab.chatUIInstance;


    if (currentTab === tabs[activeTabIndex]) {
        chatUI = targetChatUI;
    }


    currentTab.userScrolledUp = false;
    if (targetChatUI) targetChatUI.disableAutoScroll = false;

    const _isSecTab = typeof isSplitMode !== 'undefined' && isSplitMode && currentTab === tabs[secondaryActiveTabIndex];
    const _activeInputUI = _isSecTab ? sharedInputUISecondary : sharedInputUI;
    if (_activeInputUI) _activeInputUI.isGenerating = true;


    const translateMatch = text && text.match(/^translate:?\s*([\s\S]*)/i);
    const proofreadMatch = !translateMatch && text && text.match(/^proofread:?\s*([\s\S]*)/i);

    if (translateMatch) {
        text = translateMatch[1].trim();
        extra = { ...extra, mode: 'translate' };
    } else if (proofreadMatch) {
        text = proofreadMatch[1].trim();
        extra = { ...extra, mode: 'proofread' };
    }


    if (currentTab) {
        const rawText = displayQuery || text || (images.length > 0 ? 'Video/Image Analysis' : 'Chat');
        const newTitle = rawText.length > 20 ? rawText.substring(0, 20) + '...' : rawText;


        tabs.forEach(t => {
            if (t.sessionId === currentTab.sessionId) {
                t.title = newTitle;
            }
        });

        renderTabs();
        saveTabsState();
    }


    streamingTab = currentTab;
    streamDebugState = {
        tabId: currentTab.id,
        sessionId: currentTab.sessionId,
        startedAt: Date.now(),
        chunkCount: 0,
        lastChunkAt: null,
        textLength: text ? text.length : 0,
        displayLength: displayQuery ? displayQuery.length : 0,
        imageCount: images ? images.length : 0,
        mode: extra.mode || 'qa'
    };



    if (extra.mode === 'translate') {
        await targetChatUI.handleTranslation(text);
        if (_activeInputUI) {
            _activeInputUI.isGenerating = false;
            _activeInputUI._updateActionBtnState();
        }
        saveTabsState();
        return;
    }

    if (extra.mode === 'dictionary' || (text && text.match(/^Define: /i))) {
        const word = displayQuery || (text ? text.replace(/^Define: /i, '').trim() : '');
        if (word) {
            await targetChatUI.handleDictionary(word);
            if (_activeInputUI) {
                _activeInputUI.isGenerating = false;
                _activeInputUI._updateActionBtnState();
            }
            saveTabsState();
            return;
        }
    }

    if (extra.mode === 'websource') {

        tabs.filter(t => t.sessionId === currentTab.sessionId).forEach(t => {
            t.chatUIInstance.openWebSource(extra.source, text);
        });
        if (_activeInputUI) {
            _activeInputUI.isGenerating = false;
            _activeInputUI._updateActionBtnState();
        }
        return;
    }


    let untilEntryId = null;
    if (extra.isRecheck || extra.isRegenerate) {
        untilEntryId = extra.entryId;
        if (!untilEntryId) {

            const lastEntry = targetChatUI.historyEl.querySelector('.lumina-dict-entry:last-child');
            untilEntryId = lastEntry ? lastEntry.dataset.entryId : null;
        }
    }


    const isSecondaryTabForSubmit = typeof isSplitMode !== 'undefined' && isSplitMode && typeof secondaryActiveTabIndex !== 'undefined' && currentTab === tabs[secondaryActiveTabIndex];
    const activeInputUI = isSecondaryTabForSubmit ? sharedInputUISecondary : sharedInputUI;
    if (targetChatUI && activeInputUI) {
        targetChatUI.tokenLimit = activeInputUI.tokenLimit;
    }

    const conversationHistory = targetChatUI.gatherMessages(untilEntryId, false, currentTab?.thinkingLevel || activeInputUI?.thinkingLevel || 'none');

    let apiText = text;


    if (extra.isRegenerate && !text) {
        const targetEntry = untilEntryId ? targetChatUI.historyEl.querySelector(`.lumina-dict-entry[data-entry-id="${untilEntryId}"]`) : null;
        if (targetEntry) {
            const questionEl = targetEntry.querySelector('.lumina-chat-question');
            if (questionEl) {
                text = questionEl.dataset.rawText || questionEl.textContent.trim();
                apiText = text;
            }
        }
    }


    let streamAction = 'chat_stream';
    if (extra.mode === 'proofread') {
        streamAction = 'proofread';
    }


    const syncTabs = tabs.filter(t => t.sessionId === currentTab.sessionId);

    syncTabs.forEach(t => {

        const skipMargin = t !== currentTab;
        const ui = t.chatUIInstance;

        if (!extra.isRecheck && !extra.isRegenerate) {
            ui.appendQuestion(text, images, {
                editable: false,
                skipMargin: skipMargin,
                entryType: extra.mode || 'qa',
                displayText: displayQuery
            });
            ui.showLoading(null, skipMargin);
            const pane = (typeof isSplitMode !== 'undefined' && isSplitMode && typeof secondaryActiveTabIndex !== 'undefined' && secondaryActiveTabIndex >= 0 && t === tabs[secondaryActiveTabIndex]) ? 'secondary' : 'primary';
            updateWelcomeScreenState(pane);
        } else {

            if (t !== currentTab) {

                t.historyEl.innerHTML = currentTab.historyEl.innerHTML;
                ui._setupHistoryDelegation(t.historyEl);
                ui.initListeners(t.historyEl);
                ui.syncStateFromDOM();
            }


            const targetEntry = untilEntryId ? ui.historyEl.querySelector(`.lumina-dict-entry[data-entry-id="${untilEntryId}"]`) : ui.historyEl.lastElementChild;
            if (targetEntry) {
                ui.clearAnswer(targetEntry);
                ui.showLoading(targetEntry, skipMargin);
            }
        }
    });
    saveTabsState(true);
    // Refresh sidebar list so the new session (with skeleton) appears immediately
    if (typeof renderRecentChatsSidebar === 'function') {
        // Use a small defer so saveCurrentChat's async storage write can race ahead
        setTimeout(renderRecentChatsSidebar, 0);
    }

    let pageContext = "";
    const isSpotlightWindow = !isSidePanel && !isWebApp;

    const shouldReadPage = isSpotlightWindow ? false : ((extra.readPage !== undefined) ? extra.readPage : readWebpageEnabled);

    let tabModel = currentTab?.selectedModel;
    if (!tabModel) {
        const isSecondaryTab = isSplitMode && currentTab === tabs[secondaryActiveTabIndex];
        const fallbackUI = isSecondaryTab ? sharedInputUISecondary : sharedInputUI;
        if (fallbackUI?.activeTabModel?.model) {
            tabModel = fallbackUI.activeTabModel;
        }
    }

    // Xây dựng danh sách tab cần lấy nội dung (Chỉ kích hoạt khi ở isSidePanel)
    let webSourceScope = [];
    if (isSidePanel && currentBrowserTab && isWebPageUrl(currentBrowserTab.url)) {
        const selection = getWebSelectionForScope(currentTab.id);
        const isCurrentPinned = selection.some(s => String(s.tabId) === String(currentBrowserTab.tabId));
        if (isCurrentPinned) {
            webSourceScope = [
                { tabId: currentBrowserTab.tabId, url: currentBrowserTab.url, title: currentBrowserTab.title || 'Current Tab' }
            ];
        }
    }
    if (isSidePanel && shouldReadPage && currentBrowserTab && isWebPageUrl(currentBrowserTab.url)) {
        const alreadyPinned = webSourceScope.some(s => s.tabId === currentBrowserTab.tabId);
        if (!alreadyPinned) {
            webSourceScope = [
                ...webSourceScope,
                { tabId: currentBrowserTab.tabId, url: currentBrowserTab.url, title: currentBrowserTab.title || 'Current Tab' }
            ];
        }
    }

    if (webSourceScope.length > 0) {
        try {
            const results = await Promise.all(webSourceScope.map(async (source) => {
                const cacheKey = `${source.tabId}::${source.url}`;

                // Dùng cache nếu URL chưa đổi
                if (pageContextCache.has(cacheKey)) {
                    return pageContextCache.get(cacheKey); // mảng ctx objects
                }

                try {
                    const tabResults = await chrome.scripting.executeScript({
                        target: { tabId: source.tabId, allFrames: true },
                        func: () => {
                            return typeof window.luminaExtractMainContent === 'function'
                                ? window.luminaExtractMainContent(document, true)
                                : null;
                        }
                    });
                    const ctxList = tabResults ? tabResults.map(tr => tr.result).filter(Boolean) : [];
                    pageContextCache.set(cacheKey, ctxList);
                    return ctxList;
                } catch (e) {
                    console.warn(`[Spotlight] Could not read tab ${source.tabId}:`, e);
                }
                return [];
            }));

            const flatResults = results.flat().filter(r => r && r.content);

            const uniqueResults = [];
            const cleanTextForCompare = (str) => {
                return str.replace(/\[Context Source:[^\]]+\]/g, '')
                    .replace(/URL:[^\n]+/g, '')
                    .replace(/--- \[Segment \d+\] ---/g, '')
                    .replace(/[^a-zA-Z0-9]/g, '')
                    .toLowerCase();
            };
            flatResults.forEach(ctx => {
                const text = ctx.content.trim();
                if (text.length < 30) return;
                const cleanedNew = cleanTextForCompare(text);
                if (cleanedNew.length < 30) return;
                const prefix = cleanedNew.substring(0, 200);
                let isDuplicate = false;
                for (const existing of uniqueResults) {
                    if (cleanTextForCompare(existing.content).includes(prefix)) { isDuplicate = true; break; }
                }
                if (!isDuplicate) uniqueResults.push(ctx);
            });

            if (uniqueResults.length > 0) {
                const pieces = uniqueResults.map((ctx, index) => {
                    const header = uniqueResults.length === 1
                        ? `Active Webpage: ${ctx.title || 'Current Page'}`
                        : `Webpage Context Source ${index + 1}: ${ctx.title || 'Subframe Content'}`;
                    return `${header}\nURL: ${ctx.url}\n\n${ctx.content}`;
                });
                pageContext = pieces.join("\n\n---\n\n");

                const currentUrl = currentBrowserTab ? currentBrowserTab.url : "";
                if (currentTab && currentTab.lastContextUrl && currentTab.lastContextUrl !== currentUrl) {
                    const transitionMarker = `[SYSTEM NOTE: The user has navigated to a new page. Please prioritize the following context and ignore conflicting information from previous messages in this conversation.]`;
                    pageContext = transitionMarker + "\n\n" + pageContext;
                }
                if (currentTab) currentTab.lastContextUrl = currentUrl;
            }
        } catch (err) {
            console.error("[Spotlight] Failed to read pinned tabs:", err);
        }
    }


    const message = {
        action: streamAction,
        sessionId: currentTab?.sessionId,
        messages: conversationHistory,
        initialContext: pageContext,
        question: apiText || 'Describe these images',
        imageData: images.length > 0 ? images : null,
        isSpotlight: true,
        hasTranscriptForVideoId: currentTab?.chatUIInstance?.getTranscriptVideoId ? currentTab.chatUIInstance.getTranscriptVideoId() : null,
        options: extra,
        requestOptions: {
            ...extra,
            ...(tabModel ? { tabModel: { providerId: tabModel.providerId, model: tabModel.model } } : {}),
            ...(currentTab?.thinkingLevel ? { thinkingLevel: currentTab.thinkingLevel } : {}),
            ...((extra.maxTokens !== undefined && extra.maxTokens !== null && extra.maxTokens !== '')
                ? { maxTokens: Number(extra.maxTokens) }
                : {})
        }
    };

    if (currentTab && currentTab.sparkId) {
        const sparksRes = await chrome.storage.local.get(['lumina_sparks']);
        const sparks = sparksRes.lumina_sparks || {};
        const spark = sparks[currentTab.sparkId];
        if (spark) {
            let sys = spark.instructions || '';
            if (spark.knowledgeFiles && spark.knowledgeFiles.length > 0) {
                const fileContexts = spark.knowledgeFiles
                    .filter(f => typeof f.content === 'string' && !f.content.startsWith('data:'))
                    .map(f => `--- File: ${f.name} ---\n${f.content}`)
                    .join('\n\n');
                if (fileContexts) {
                    sys += `\n\n# Knowledge Files\n${fileContexts}`;
                }
            }
            if (sys) {
                message.systemOverride = sys;
            }
        }
    }


    if (tabModel) {
        chrome.storage.local.set({ lastUsedModel: tabModel });
    }


    const sendMessage = () => {
        if (!port) setupPort();
        if (!port) throw new Error("Could not establish connection");
        port.postMessage(message);

        const stopHandler = () => {
            if (port) {
                const sid = currentTab?.sessionId;
                if (sid) {
                    port.postMessage({ action: 'stop_chat', sessionId: sid });
                } else {

                    port.disconnect();
                    port = null;
                }
            }

            syncTabs.forEach(tab => {
                tab.chatUIInstance.removeLoading();
                if (tab.chatUIInstance.currentAnswerDiv) {
                    tab.chatUIInstance.appendError('aborted');
                }
            });
            if (_activeInputUI) {
                _activeInputUI.isGenerating = false;
                _activeInputUI._updateActionBtnState();
            }
        };

        if (_activeInputUI) {
            _activeInputUI.isGenerating = true;
            _activeInputUI.onStop = stopHandler;
            _activeInputUI._updateActionBtnState();
        }
    };

    try {
        sendMessage();
    } catch (e) {
        try {
            port = null;
            sendMessage();
        } catch (retryE) {
            console.error('[Spotlight] Retry failed:', retryE);
            targetChatUI.removeLoading();
            targetChatUI.appendError('Connection failed.');
        }
    }

    // Fire title generation CONCURRENTLY with the main chat request
    if (
        !extra.isRegenerate &&
        !extra.isRecheck &&
        extra.mode !== 'translate' &&
        extra.mode !== 'dictionary' &&
        extra.mode !== 'proofread' &&
        extra.mode !== 'websource' &&
        currentTab?.sessionId
    ) {
        const nameText = apiText || text;
        if (nameText && nameText.trim()) {
            chrome.storage.local.get([ChatHistoryManager.STORAGE_KEY], (result) => {
                const sessions = result[ChatHistoryManager.STORAGE_KEY] || {};
                const meta = sessions[currentTab.sessionId] || {};
                console.log("[AutoNaming Check]", { sessionId: currentTab.sessionId, autoNamed: meta.autoNamed, isRenamed: meta.isRenamed, exists: !!sessions[currentTab.sessionId] });
                if (!meta.autoNamed && !meta.isRenamed) {
                    startConcurrentAutoNaming(currentTab.sessionId, currentTab.selectedModel || tabModel, nameText.trim(), images, conversationHistory);
                }
            });
        }
    }
}


async function handleTranslation(text) {
    await chatUI.handleTranslation(text);

}


function matchesAnnotationShortcut(event, shortcut) {
    if (!shortcut) return false;
    const ctrlMatch = !!shortcut.ctrlKey === event.ctrlKey;
    const altMatch = !!shortcut.altKey === event.altKey;
    const shiftMatch = !!shortcut.shiftKey === event.shiftKey;
    const metaMatch = !!shortcut.metaKey === event.metaKey;

    const keyMatch = (shortcut.code && event.code === shortcut.code) ||
        (event.key && event.key.toLowerCase() === (shortcut.key || "").toLowerCase());

    const isMatched = ctrlMatch && altMatch && shiftMatch && metaMatch && keyMatch;

    return isMatched;
}

function setupGlobalListeners() {
    hoveredPane = 'primary';

    if (sharedInputUI?.inputEl) {
        sharedInputUI.inputEl.addEventListener('focus', () => {
            if (hoveredPane !== 'primary') {
                hoveredPane = 'primary';
                updatePaneHighlight();
                updateInputPlaceholder();
                if (typeof window.updateTopbarModelSelector === 'function') {
                    window.updateTopbarModelSelector();
                }
            }
        });
    }

    if (sharedInputUISecondary?.inputEl) {
        sharedInputUISecondary.inputEl.addEventListener('focus', () => {
            if (hoveredPane !== 'secondary') {
                hoveredPane = 'secondary';
                updatePaneHighlight();
                updateInputPlaceholder();
                if (typeof window.updateTopbarModelSelectorSecondary === 'function') {
                    window.updateTopbarModelSelectorSecondary();
                }
            }
        });
    }

    document.addEventListener('keydown', (event) => {
        if (document.querySelector('.recording')) return;
        const searchOverlay = document.getElementById('lumina-search-overlay');
        if (searchOverlay && searchOverlay.style.display === 'flex') {
            const searchInput = document.getElementById('lumina-search-input');
            if (searchInput && document.activeElement !== searchInput) {
                const selection = window.getSelection().toString().trim();
                const isTypeable = event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;

                if (selection && !isTypeable) {
                    return;
                }

                if (['Control', 'Shift', 'Alt', 'Meta', 'Tab', 'CapsLock', 'Escape'].includes(event.key)) return;

                if (!isTypeable) {
                    searchInput.focus();
                    return;
                }

                event.stopPropagation();
                event.stopImmediatePropagation();
                event.preventDefault();

                searchInput.focus();

                if (searchInput.setSelectionRange) {
                    const len = searchInput.value.length;
                    searchInput.setSelectionRange(len, len);
                }

                const val = searchInput.value;
                searchInput.value = val + event.key;
                searchInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
            return;
        }
        const pairs = { '(': ')', '{': '}', '[': ']' };
        if (pairs[event.key]) {
            const activeEl = document.activeElement;
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

        const activeElement = document.activeElement;
        const selection = window.getSelection().toString().trim();
        const isEditing = activeElement && (
            activeElement.tagName === 'INPUT' ||
            activeElement.tagName === 'TEXTAREA' ||
            activeElement.isContentEditable
        );


        if (['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) {
            modifierKeyPressedAlone = true;
        } else {
            modifierKeyPressedAlone = false;
        }


        if (matchesShortcut(event, 'translateInput', shortcuts)) {
            const activeEl = document.activeElement;
            const isEditingLocal = activeEl && (
                activeEl.tagName === 'INPUT' ||
                activeEl.tagName === 'TEXTAREA' ||
                activeEl.isContentEditable
            );

            if (isEditingLocal) {
                if (activeEl.__luminaTranslating) return;

                let textToTranslate = '';
                let hasSelection = false;
                let selectionStart = 0;
                let selectionEnd = 0;
                let paragraphNode = null;

                if (activeEl.isContentEditable) {
                    const sel = window.getSelection();
                    if (sel && sel.rangeCount > 0) {
                        const range = sel.getRangeAt(0);
                        if (activeEl.contains(range.commonAncestorContainer)) {
                            hasSelection = !sel.isCollapsed && sel.toString().trim().length > 0;
                            if (hasSelection) {
                                textToTranslate = sel.toString();
                            } else {
                                let node = range.startContainer;
                                const blockTags = ['P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'ARTICLE', 'SECTION', 'TR', 'TD'];
                                let parent = node.nodeType === 3 ? node.parentNode : node;
                                while (parent && parent !== activeEl) {
                                    if (parent.tagName && blockTags.includes(parent.tagName)) {
                                        break;
                                    }
                                    parent = parent.parentNode;
                                }
                                paragraphNode = (parent && parent !== activeEl) ? parent : activeEl;
                                textToTranslate = paragraphNode.innerText || paragraphNode.textContent || '';
                            }
                        }
                    }
                } else {
                    selectionStart = activeEl.selectionStart;
                    selectionEnd = activeEl.selectionEnd;
                    hasSelection = selectionStart !== selectionEnd;

                    if (hasSelection) {
                        textToTranslate = activeEl.value.substring(selectionStart, selectionEnd);
                    } else {
                        if (activeEl.tagName === 'INPUT') {
                            textToTranslate = activeEl.value || '';
                            selectionStart = 0;
                            selectionEnd = textToTranslate.length;
                        } else {
                            const val = activeEl.value || '';
                            const cursor = activeEl.selectionStart;
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

                    activeEl.__luminaTranslating = true;

                    let targetEl = activeEl;
                    if (activeEl.isContentEditable) {
                        if (hasSelection) {
                            const sel = window.getSelection();
                            if (sel && sel.rangeCount > 0) {
                                const range = sel.getRangeAt(0);
                                let commonNode = range.commonAncestorContainer;
                                targetEl = commonNode.nodeType === 3 ? commonNode.parentNode : commonNode;
                            }
                        } else if (paragraphNode) {
                            targetEl = paragraphNode;
                            activeEl.focus();
                            const sel = window.getSelection();
                            const range = document.createRange();
                            range.selectNodeContents(paragraphNode);
                            sel.removeAllRanges();
                            sel.addRange(range);
                        }
                    } else {
                        activeEl.focus();
                        activeEl.setSelectionRange(selectionStart, selectionEnd);
                    }

                    const originalPointerEvents = activeEl.style.pointerEvents || '';
                    activeEl.style.pointerEvents = 'none';

                    const defaultColorStyle = window.getComputedStyle(activeEl).color || 'rgb(0,0,0)';
                    const rgbMatch = defaultColorStyle.match(/\d+/g);
                    const defaultRGB = rgbMatch ? rgbMatch.slice(0, 3).map(Number) : [0, 0, 0];

                    let styleEl = document.getElementById('lumina-pulse-style');
                    if (!styleEl) {
                        styleEl = document.createElement('style');
                        styleEl.id = 'lumina-pulse-style';
                        document.head.appendChild(styleEl);
                    }
                    activeEl.classList.add('lumina-pulse-active');

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
                            activeEl.classList.remove('lumina-pulse-active');
                            if (styleEl) styleEl.textContent = '';

                            setTimeout(() => {
                                activeEl.style.pointerEvents = originalPointerEvents;
                                activeEl.__luminaTranslating = false;
                            }, 600);

                            if (response && response.translatedText) {
                                if (activeEl.isContentEditable) {
                                    const cleanedText = response.translatedText.replace(/\n\n/g, '\n');
                                    if (hasSelection) {
                                        document.execCommand('insertText', false, cleanedText);
                                        activeEl.dispatchEvent(new Event('input', { bubbles: true }));
                                    } else {
                                        if (paragraphNode) {
                                            activeEl.focus();
                                            const sel = window.getSelection();
                                            const range = document.createRange();
                                            range.selectNodeContents(paragraphNode);
                                            sel.removeAllRanges();
                                            sel.addRange(range);

                                            document.execCommand('insertText', false, cleanedText);
                                            activeEl.dispatchEvent(new Event('input', { bubbles: true }));
                                        }
                                    }
                                } else {
                                    const val = activeEl.value || '';
                                    const before = val.substring(0, selectionStart);
                                    const after = val.substring(selectionEnd);
                                    activeEl.value = before + response.translatedText + after;

                                    activeEl.focus();
                                    const newCursorPos = selectionStart + response.translatedText.length;
                                    activeEl.setSelectionRange(newCursorPos, newCursorPos);

                                    activeEl.dispatchEvent(new Event('input', { bubbles: true }));
                                }
                            }
                        });
                    } catch (err) {
                        isPulsing = false;
                        activeEl.classList.remove('lumina-pulse-active');
                        if (styleEl) styleEl.textContent = '';
                        setTimeout(() => {
                            activeEl.style.pointerEvents = originalPointerEvents;
                            activeEl.__luminaTranslating = false;
                        }, 600);
                        console.error('[Lumina Spotlight] translateInput failed:', err);
                    }
                }
                return;
            }
        }

        const shortcutActions = Object.keys(shortcuts);
        for (const action of shortcutActions) {
            const shortcut = shortcuts[action];
            if (!shortcut) continue;
            if (!isShortcutMatchImmediate(event, shortcut)) continue;



            if (isEditing) {
                const hasModifier = event.ctrlKey || event.altKey || event.metaKey;
                const isOverridingShortcut = action === 'micToggle' || action === 'audio';
                if (!hasModifier && !isOverridingShortcut) continue;
            }



            if ((action === 'translate' || action === 'askLumina' || action === 'audio') && !selection) {

                if (action === 'audio' && _spotlightCurrentAudio) {

                } else {
                    continue;
                }
            }

            event.preventDefault();
            event.stopPropagation();
            dispatchConfiguredShortcutAction(action);
            return;
        }


        if (selection && questionMappings && questionMappings.length > 0) {
            if (window.LuminaSelection && !LuminaSelection.isInsideEditable()) {
                for (const mapping of questionMappings) {
                    if (!mapping.prompt) continue;
                    let isMatch = false;
                    if (mapping.keyData) {
                        isMatch = isShortcutMatch(event, mapping.keyData);
                    } else if (mapping.key) {
                        const keyLower = mapping.key.toLowerCase();
                        const eventKey = event.key.toLowerCase();
                        isMatch = (eventKey === keyLower && !event.ctrlKey && !event.metaKey && !event.altKey);
                    }

                    if (isMatch) {
                        event.preventDefault();
                        event.stopPropagation();
                        event.stopImmediatePropagation();

                        let fullQuestion;
                        const hasVariables = /\$SelectedText|"SelectedText"|\$Sentence|\$Paragraph/i.test(mapping.prompt);
                        if (hasVariables) {
                            fullQuestion = mapping.prompt
                                .replace(/\$SelectedText|SelectedText/gi, selection)
                                .replace(/\$Sentence/gi, selection)
                                .replace(/\$Paragraph/gi, selection);
                        } else {
                            fullQuestion = `"${selection}" ${mapping.prompt}`;
                        }


                        const targetTabIdx = (spotlightAskSourcePane === 'secondary' && isSplitMode)
                            ? secondaryActiveTabIndex
                            : activeTabIndex;
                        const targetTab = tabs[targetTabIdx];


                        if (targetTab && targetTab.chatUIInstance) {
                            const sel = window.getSelection();
                            const range = sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
                            if (range && range.startContainer) {

                                if (window.LuminaAnnotation) {
                                    window.LuminaAnnotation.highlight(range);
                                }
                            }
                        }

                        handleSubmit(fullQuestion, [], {}, targetTab || null);
                        window.getSelection().removeAllRanges();
                        if (window.LuminaSelection) LuminaSelection.hide();
                        return;
                    }
                }
            }
        }

        const inputEl = getHoveredInputEl();


        if (event.key === ' ' && !selection) return;



        if (event.key === 'Enter') {
            const activeEl = document.activeElement;
            const isEditingLocal = activeEl && (
                activeEl.tagName === 'INPUT' ||
                activeEl.tagName === 'TEXTAREA' ||
                activeEl.isContentEditable
            );

            if (!isEditingLocal) {
                const targetInput = getHoveredInputEl();
                const targetChatUI = targetInput === sharedInputUISecondary?.inputEl ? chatUISecondary : chatUI;
                const hasInputText = !!targetInput && targetInput.value.trim().length > 0;

                if (hasInputText && targetChatUI && typeof targetChatUI._handleSubmit === 'function') {
                    event.preventDefault();
                    event.stopPropagation();
                    targetChatUI._handleSubmit();
                    return;
                }

                if (targetInput) {
                    event.preventDefault();
                    event.stopPropagation();
                    return;
                }
            }
        }


        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {

            const activeEl = document.activeElement;
            if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) {
                return;
            }


            const sidebar = document.getElementById('lumina-history-sidebar');
            if (sidebar && sidebar.classList.contains('open')) return;

            const inputEl = getHoveredInputEl();
            if (inputEl) {
                event.preventDefault();
                event.stopPropagation();
                inputEl.focus();
                inputEl.select();
            }
            return;
        }


        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') {
            const activeEl = document.activeElement;
            if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) {
                return;
            }


            const sidebar = document.getElementById('lumina-history-sidebar');
            if (sidebar && sidebar.classList.contains('open')) return;

            const inputEl = getHoveredInputEl();
            if (inputEl) {
                inputEl.focus();

                return;
            }
        }



        if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.length === 1) {
            return;
        }


        if (matchesShortcut(event, 'audio', shortcuts)) {
            if (window.LuminaSelection && LuminaSelection.isInsideEditable()) return;
            event.preventDefault();
            event.stopPropagation();
            if (selection) {
                stopSpotlightAudio();
                _spotlightAudioAborted = false;
                playSpotlightAudio(selection);
            } else {
                const sel = window.getSelection();
                const range = sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
                if (range && window.LuminaSelection) {

                    const commonNode = range.commonAncestorContainer;
                    const secondaryPane = document.getElementById('pane-secondary');
                    spotlightAskSourcePane = (isSplitMode && secondaryPane && secondaryPane.contains(commonNode))
                        ? 'secondary' : 'primary';

                    LuminaSelection.show(0, 0, selection, range);
                    LuminaSelection.showInput();
                    window.getSelection().removeAllRanges();
                    return;
                }
                stopSpotlightAudio();
            }
            return;
        }


        if (selection && (window.LuminaSelection && !LuminaSelection.isInsideEditable())) {


            if (matchesShortcut(event, 'askLumina', shortcuts)) {
                event.preventDefault();
                event.stopPropagation();

                const sel = window.getSelection();
                const range = sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
                if (range && window.LuminaSelection) {
                    const text = selection;


                    const commonNode = range.commonAncestorContainer;
                    const secondaryPane = document.getElementById('pane-secondary');
                    spotlightAskSourcePane = (isSplitMode && secondaryPane && secondaryPane.contains(commonNode))
                        ? 'secondary' : 'primary';

                    LuminaSelection.show(0, 0, text, range);
                    LuminaSelection.showInput();
                    window.getSelection().removeAllRanges();
                    return;
                }
            }


            if (matchesShortcut(event, 'translate', shortcuts)) {

                event.preventDefault();
                event.stopPropagation();
                handleTranslation(selection);
                window.getSelection().removeAllRanges();
                if (window.LuminaSelection) LuminaSelection.hide();
                return;
            }

        }


        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') {

            const activeEl = document.activeElement;
            if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) {
                return;
            }


            const sidebar = document.getElementById('lumina-history-sidebar');
            if (sidebar && sidebar.classList.contains('open')) return;

            if (inputEl) inputEl.focus();
            return;
        }


        // Check annotation shortcuts
        for (const shortcut of annotationShortcuts) {
            if (shortcut.enabled === false) continue;
            if (matchesAnnotationShortcut(event, shortcut)) {
                if (window.LuminaSelection && LuminaSelection.isInsideEditable()) continue;

                const sel = window.getSelection();
                const text = sel ? sel.toString().trim() : '';
                if (text.length > 0 && sel.rangeCount > 0) {
                    event.preventDefault();
                    event.stopPropagation();
                    event.stopImmediatePropagation();

                    const range = sel.getRangeAt(0);
                    const highlightId = 'lh_' + Date.now();
                    const color = shortcut.color || '#ffeb3b';

                    if (window.LuminaAnnotation) {
                        LuminaAnnotation.saveHighlight(range, color, highlightId);
                        LuminaAnnotation.applyHighlight(range, color, highlightId);
                    }

                    window.getSelection().removeAllRanges();
                    if (window.LuminaSelection) LuminaSelection.hide();
                    return;
                }
            }
        }

        if (['Control', 'Shift', 'Alt', 'Meta', 'Tab', 'CapsLock', 'Escape'].includes(event.key)) return;




        const isWrongPaneFocused = isSplitMode && inputEl &&
            (inputEl === sharedInputUI?.inputEl ? activeElement === sharedInputUISecondary?.inputEl : activeElement === sharedInputUI?.inputEl);


        if ((!isEditing || isWrongPaneFocused) && inputEl) {

            const sidebar = document.getElementById('lumina-history-sidebar');
            if (sidebar && sidebar.classList.contains('open')) return;



            const isTypeable = event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;

            if (selection && !isTypeable) {

                return;
            }



            if (!isTypeable) {
                inputEl.focus();
                return;
            }


            event.stopPropagation();
            event.stopImmediatePropagation();
            event.preventDefault();

            inputEl.focus();

            if (inputEl.setSelectionRange) {
                const len = inputEl.value.length;
                inputEl.setSelectionRange(len, len);
            }

            const val = inputEl.value;
            inputEl.value = val + event.key;
            inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }, true);


    document.addEventListener('mousedown', (event) => {


        const resetShortcut = shortcuts.resetChat;
        if (!resetShortcut) return;

        if (isShortcutMatch(event, resetShortcut)) {
            event.preventDefault();
            resetChat();
        }
    });
}


function resetChat(isSecondary = null) {
    if (isSecondary === null) {
        isSecondary = (typeof isSplitMode !== 'undefined' && isSplitMode && typeof hoveredPane !== 'undefined' && hoveredPane === 'secondary');
    }
    stopSpotlightAudio();

    const targetIdx = isSecondary ? secondaryActiveTabIndex : activeTabIndex;
    if (targetIdx !== -1) {
        const activeTab = tabs[targetIdx];

        if (activeTab) {
            if (port && activeTab.sessionId) {
                port.postMessage({ action: 'stop_chat', sessionId: activeTab.sessionId });
            }

            activeTab.title = 'New Tab';
            activeTab.sessionId = null;
            if (!activeTab.selectedModel) {
                const savedSettings = sessionSettings['null'] || {};
                activeTab.selectedModel = savedSettings.selectedModel || null;
                activeTab.thinkingLevel = savedSettings.thinkingLevel || null;
            }
            activeTab.isHistoryLoaded = false;
            if (activeTab.historyEl) {
                activeTab.historyEl.removeAttribute('data-session-id');
            }
            activeTab.sparkId = null;
            if (activeTab.chatUIInstance) activeTab.chatUIInstance.sparkId = null;
            activeTab.scrollTop = -1;
            if (!isSecondary) {
                updateUrlSessionId(null);
            }
            if (typeof sidebarSparksRenderList === 'function') {
                sidebarSparksRenderList();
            }
        }
    }

    const targetUI = isSecondary ? chatUISecondary : chatUI;
    if (targetUI) {
        targetUI.clearHistory();
        const activeTab = tabs[targetIdx];
        if (activeTab && activeTab.selectedModel) {
            targetUI.activeTabModel = { ...activeTab.selectedModel };
            targetUI.thinkingLevel = activeTab.thinkingLevel || null;
        } else {
            const savedSettings = sessionSettings['null'] || {};
            targetUI.activeTabModel = savedSettings.selectedModel ? { ...savedSettings.selectedModel } : null;
            targetUI.thinkingLevel = savedSettings.thinkingLevel || null;
        }
        if (typeof targetUI.refreshModelSelector === 'function') targetUI.refreshModelSelector();
        if (typeof targetUI.refreshReasoningSelector === 'function') targetUI.refreshReasoningSelector();
        if (targetUI.inputEl) {
            targetUI.inputEl.value = '';
            targetUI.inputEl.style.height = 'auto';
            targetUI.inputEl.focus();
        }
    }

    if (isSecondary) {
        if (typeof window.updateTopbarModelSelectorSecondary === 'function') {
            window.updateTopbarModelSelectorSecondary();
        }
    } else {
        if (typeof window.updateTopbarModelSelector === 'function') {
            window.updateTopbarModelSelector();
        }
    }

    renderTabs();
    saveTabsState();
    if (typeof updateRecentChatsActiveState === 'function') {
        updateRecentChatsActiveState();
    }
    if (typeof updateTopbarSparkTitle === 'function') {
        updateTopbarSparkTitle();
    }
    updateWelcomeScreenState(isSecondary ? 'secondary' : 'primary');
    updateInputPlaceholder();

    const regenBtn = document.getElementById('lumina-regenerate-btn');
    if (regenBtn) regenBtn.style.display = 'none';
}


function setupRegenerateButtons() {
    const buttons = document.querySelectorAll('#lumina-regenerate-btn');
    buttons.forEach(btn => {

        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);

        newBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            const isSecondary = newBtn.closest('#pane-secondary') !== null;
            const targetUI = isSecondary ? chatUISecondary : chatUI;

            if (newBtn.classList.contains('loading')) {
                if (targetUI && targetUI.onStop) targetUI.onStop();
                if (targetUI) targetUI.hideStopButton();
            } else {
                triggerRegenerate(targetUI);
            }
        });
    });
}


document.addEventListener('DOMContentLoaded', init);

window.addEventListener('beforeunload', () => {
    tabs.forEach((tab) => {
        tab.chatUIInstance?.cancelAllAnswerEdits?.();
    });
    if (activeTabIndex >= 0) {
        const activeTab = tabs[activeTabIndex];
        if (activeTab && activeTab.historyEl) {
            activeTab.scrollTop = activeTab.historyEl.scrollTop;
        }
    }
    saveTabsState();
});

window.addEventListener('focus', () => {
    if (typeof tabs !== 'undefined' && Array.isArray(tabs) && typeof activeTabIndex !== 'undefined' && activeTabIndex >= 0) {
        const activeTab = tabs[activeTabIndex];
        if (activeTab && activeTab.historyEl && activeTab.chatUIInstance) {
            const entries = activeTab.historyEl.querySelectorAll('.lumina-dict-entry');
            const lastEntry = entries[entries.length - 1];
            if (lastEntry) {
                activeTab.chatUIInstance.clearEntryMargins(lastEntry);
                activeTab.chatUIInstance.adjustEntryMargin(lastEntry, 'immediate');
            }
        }
        if (typeof isSplitMode !== 'undefined' && isSplitMode && typeof secondaryActiveTabIndex !== 'undefined' && secondaryActiveTabIndex >= 0) {
            const secTab = tabs[secondaryActiveTabIndex];
            if (secTab && secTab.historyEl && secTab.chatUIInstance) {
                const entries = secTab.historyEl.querySelectorAll('.lumina-dict-entry');
                const lastEntry = entries[entries.length - 1];
                if (lastEntry) {
                    secTab.chatUIInstance.clearEntryMargins(lastEntry);
                    secTab.chatUIInstance.adjustEntryMargin(lastEntry, 'immediate');
                }
            }
        }
    }
});


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


document.addEventListener('copy', (e) => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);
    const fragment = range.cloneContents();


    function getVisibleText(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            return node.textContent;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return '';

        const el = node;
        const tag = el.tagName.toLowerCase();


        if (['button', 'svg', 'mat-icon', 'script', 'style', 'noscript'].includes(tag)) {
            return '';
        }


        if (el.getAttribute('aria-hidden') === 'true') {
            return '';
        }


        const className = el.className?.toString() || '';
        if (/\b(icon|material-icons|google-symbols|fa-|glyphicon)\b/i.test(className)) {
            return '';
        }


        let text = '';
        for (const child of el.childNodes) {
            text += getVisibleText(child);
        }


        if (['div', 'p', 'br', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) {
            text = '\n' + text + '\n';
        }

        return text;
    }

    let extracted = getVisibleText(fragment);


    extracted = extracted
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]+/g, ' ')
        .replace(/ ?\n ?/g, '\n')
        .trim();

    const original = sel.toString().trim();

    if (extracted && extracted !== original) {
        e.preventDefault();
        e.clipboardData.setData('text/plain', extracted);
    } else if (extracted !== original) {
        e.preventDefault();
        e.clipboardData.setData('text/plain', original);
    }
}, true);



function triggerRegenerate(targetUI = null) {
    const tUI = targetUI || chatUI;
    const history = tUI?.historyEl;
    if (!history) return;


    const lastEntry = history.lastElementChild;
    if (!lastEntry || !lastEntry.classList.contains('lumina-dict-entry')) return;

    const entryType = lastEntry.dataset.entryType;
    let originalQuestion = null;


    if (entryType === 'translation') {
        const transSource = lastEntry.querySelector('.lumina-translation-source .lumina-translation-text');
        if (transSource) {
            const sourceText = transSource.textContent.trim();
            originalQuestion = `Translate this text: "${sourceText}"`;


            if (tUI) {
                tUI._regenSourceText = sourceText;
                tUI._regenEntryType = 'translation';
            }
        }
    } else if (entryType === 'lookup' || entryType === 'entry') {
        const wordEl = lastEntry.querySelector('.lumina-dict-word');
        if (wordEl) {
            const word = wordEl.textContent.trim();
            originalQuestion = `Look up and explain the meaning of: "${word}"`;
        }
    }


    if (!originalQuestion) {
        const questionEl = lastEntry.querySelector('.lumina-chat-question');
        if (questionEl) {
            originalQuestion = questionEl.textContent.trim();


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

    if (tUI) tUI._handleQuestionRecheck(lastEntry, originalQuestion);
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


function isShortcutMatch(event, shortcut) {
    if (!shortcut) return false;


    const isLoneModifierShortcut = ['Control', 'Alt', 'Shift', 'Meta'].includes(shortcut.key);

    if (isLoneModifierShortcut) {

        if (event.type !== 'keyup') return false;
        if (event.key !== shortcut.key) return false;


        const isSideSpecific = shortcut.code && (shortcut.code.endsWith('Left') || shortcut.code.endsWith('Right'));
        if (isSideSpecific && shortcut.code !== event.code) return false;

        return modifierKeyPressedAlone;
    }


    let keyMatch = false;
    if (event.type === 'mousedown' || event.type === 'mouseup' || event.type === 'click') {
        const buttonCode = 'Mouse' + event.button;
        keyMatch = (shortcut.code && shortcut.code === buttonCode) || shortcut.key === buttonCode;
    } else {
        const eventKey = (event.key || '').toLowerCase();
        const shortcutKey = (shortcut.key || '').toLowerCase();
        keyMatch = (shortcut.code && event.code === shortcut.code) || eventKey === shortcutKey;
    }

    if (!keyMatch) return false;


    const wantsCtrl = !!shortcut.ctrlKey;
    const wantsMeta = !!shortcut.metaKey;

    const ctrlMatch = wantsCtrl
        ? (event.ctrlKey || (!wantsMeta && event.metaKey))
        : !event.ctrlKey;
    const shiftMatch = !!shortcut.shiftKey === event.shiftKey;
    const altMatch = !!shortcut.altKey === event.altKey;
    const metaMatch = wantsMeta ? event.metaKey : (!event.metaKey || wantsCtrl);


    if (!shortcut.ctrlKey && !shortcut.shiftKey && !shortcut.altKey && !shortcut.metaKey) {
        if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return false;
    }

    return ctrlMatch && shiftMatch && altMatch && metaMatch;
}

function isShortcutMatchImmediate(event, shortcut) {
    if (!shortcut) return false;

    const isModifierShortcut = ['Control', 'Alt', 'Shift', 'Meta'].includes(shortcut.key);
    if (!isModifierShortcut) return isShortcutMatch(event, shortcut);

    if (event.type !== 'keydown' || event.repeat) return false;
    if (event.key !== shortcut.key) return false;

    const isSideSpecific = shortcut.code && (shortcut.code.endsWith('Left') || shortcut.code.endsWith('Right'));
    if (isSideSpecific && shortcut.code !== event.code) return false;

    return true;
}

function dispatchConfiguredShortcutAction(action) {
    if (action === 'audio') {
        const selection = window.getSelection().toString().trim();
        if (selection) {
            stopSpotlightAudio();
            _spotlightAudioAborted = false;
            playSpotlightAudio(selection);
        } else {
            stopSpotlightAudio();
        }
    } else if (action === 'luminaChat') {

    } else if (action === 'askLumina') {
        const sel = window.getSelection();
        const text = sel ? sel.toString().trim() : '';
        const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
        if (!text || !range || !window.LuminaSelection) return;

        const commonNode = range.commonAncestorContainer;
        const secondaryPane = document.getElementById('pane-secondary');
        spotlightAskSourcePane = (isSplitMode && secondaryPane && secondaryPane.contains(commonNode))
            ? 'secondary' : 'primary';

        LuminaSelection.show(0, 0, text, range);
        LuminaSelection.showInput();
        sel.removeAllRanges();
    } else if (action === 'resetChat') {
        resetChat();

    } else if (action === 'micToggle') {
        const targetPane = (hoveredPane === 'secondary' && isSplitMode) ? 'secondary' : 'primary';
        const inputArea = document.getElementById(`input-area-${targetPane}`);
        const micBtn = inputArea ? inputArea.querySelector('#mic-btn') : null;
        if (micBtn) micBtn.click();
    } else if (action === 'cycleModels') {
        cycleActiveModel();
    }
}

function cycleActiveModel() {
    const targetPane = (hoveredPane === 'secondary' && isSplitMode) ? 'secondary' : 'primary';
    const isSec = targetPane === 'secondary';
    const currentActiveTab = isSec ? tabs[secondaryActiveTabIndex] : tabs[activeTabIndex];
    if (!currentActiveTab) return;

    const otherTab = isSec
        ? (activeTabIndex >= 0 ? tabs[activeTabIndex] : null)
        : (typeof isSplitMode !== 'undefined' && isSplitMode && secondaryActiveTabIndex >= 0 ? tabs[secondaryActiveTabIndex] : null);

    chrome.storage.local.get(['providers', 'modelChains'], async (data) => {
        let promptSupport;
        if (typeof window.getPromptApiSupport === 'function') {
            promptSupport = await window.getPromptApiSupport();
        } else {
            promptSupport = { supported: false, status: 'no', reason: 'Prompt API not loaded' };
        }
        const chain = window.LuminaModelHelper.buildModelChain(data, promptSupport);
        if (chain.length <= 1) return;

        let currentModel = currentActiveTab.selectedModel?.model;
        let currentProviderId = currentActiveTab.selectedModel?.providerId;

        let currentIndex = chain.findIndex(item => item.model === currentModel && item.providerId === currentProviderId);

        const nextIndex = (currentIndex + 1) % chain.length;
        const nextItem = chain[nextIndex];

        const tabsToUpdate = [currentActiveTab];
        if (otherTab && otherTab.sessionId === currentActiveTab.sessionId) {
            tabsToUpdate.push(otherTab);
        }

        tabsToUpdate.forEach(tab => {
            const tabIsSec = (typeof isSplitMode !== 'undefined' && isSplitMode && tab === tabs[secondaryActiveTabIndex]);
            const targetSharedUI = tabIsSec ? sharedInputUISecondary : sharedInputUI;

            tab.selectedModel = { model: nextItem.model, providerId: nextItem.providerId };
            setPaneActiveModel(tabIsSec ? 'secondary' : 'primary', tab.selectedModel);

            if (tab.chatUIInstance) {
                tab.chatUIInstance.activeTabModel = { ...tab.selectedModel };
            }
            if (targetSharedUI) {
                targetSharedUI.activeTabModel = { ...tab.selectedModel };
            }

            const labelId = tabIsSec ? 'topbar-model-label-secondary' : 'topbar-model-label';
            const label = document.getElementById(labelId);
            if (label) {
                label.textContent = nextItem.displayName || nextItem.model;
            }
        });

        const sidKey = currentActiveTab.sessionId || 'null';
        chrome.storage.local.get(['lumina_session_settings', 'advancedParamsByModel'], (res) => {
            const settings = res.lumina_session_settings || {};
            if (!settings[sidKey]) settings[sidKey] = {};
            settings[sidKey].selectedModel = { model: nextItem.model, providerId: nextItem.providerId };

            const advancedParamsByModel = res.advancedParamsByModel || {};
            const compositeKey = nextItem.providerId ? `${nextItem.providerId}:${nextItem.model}` : nextItem.model;
            const modelParams = advancedParamsByModel[compositeKey] || advancedParamsByModel[nextItem.model] || {};

            const defaultThinking = window.LuminaModelHelper.getDefaultThinking(nextItem.model, nextItem.providerId);
            const newThinkingLevel = modelParams.thinkingLevel || defaultThinking;

            tabsToUpdate.forEach(tab => {
                const tabIsSec = (typeof isSplitMode !== 'undefined' && isSplitMode && tab === tabs[secondaryActiveTabIndex]);
                const targetSharedUI = tabIsSec ? sharedInputUISecondary : sharedInputUI;

                tab.thinkingLevel = newThinkingLevel;
                setPaneActiveThinking(tabIsSec ? 'secondary' : 'primary', newThinkingLevel);
                settings[sidKey].thinkingLevel = newThinkingLevel;

                if (tab.chatUIInstance) {
                    tab.chatUIInstance.thinkingLevel = newThinkingLevel;
                }
            });

            chrome.storage.local.set({
                lumina_session_settings: settings,
                lastUsedModel: { model: nextItem.model, providerId: nextItem.providerId }
            }, () => {
                tabsToUpdate.forEach(tab => {
                    const tabIsSec = (typeof isSplitMode !== 'undefined' && isSplitMode && tab === tabs[secondaryActiveTabIndex]);
                    const targetSharedUI = tabIsSec ? sharedInputUISecondary : sharedInputUI;
                    if (targetSharedUI && typeof targetSharedUI.refreshReasoningSelector === 'function') {
                        targetSharedUI.thinkingLevel = newThinkingLevel;
                        targetSharedUI.refreshReasoningSelector();
                    }
                });
                if (typeof window.updateTopbarModelSelector === 'function') {
                    window.updateTopbarModelSelector();
                }
                if (typeof window.updateTopbarModelSelectorSecondary === 'function') {
                    window.updateTopbarModelSelectorSecondary();
                }
            });
        });
    });
}


function matchesShortcut(event, actionName, shortcuts) {
    const DEFAULT_SHORTCUTS = {
        regenerate: { code: 'KeyR', key: 'r' },
        translate: { code: 'KeyT', key: 't' },

        audio: { code: 'ShiftLeft', key: 'Shift', shiftKey: true }
    };

    const shortcut = shortcuts?.[actionName] || DEFAULT_SHORTCUTS[actionName];
    return isShortcutMatch(event, shortcut);
}


async function playSpotlightAudio(text) {
    if (!text) return;

    const normalizedText = text.trim();

    let speed = 1.1;
    try {
        const data = await chrome.storage.local.get(['audioSpeed']);
        speed = data.audioSpeed || 1.1;
    } catch (e) { }

    try {
        const cached = await chrome.runtime.sendMessage({ action: 'getAudioCache', text: normalizedText });
        if (cached && cached.success && cached.data) {
            const chunks = Array.isArray(cached.data) ? cached.data : [cached.data];
            for (const chunk of chunks) await playBase64Audio(chunk, speed);
            return;
        }
    } catch (e) { }


    try {
        const result = await chrome.runtime.sendMessage({ action: 'fetchAudio', text: normalizedText, speed });
        if (!result || !result.chunks || result.chunks.length === 0) return;

        for (const chunk of result.chunks) await playBase64Audio(chunk, speed);

        chrome.runtime.sendMessage({ action: 'setAudioCache', text: normalizedText, type: result.type, data: result.chunks }).catch(() => { });
    } catch (err) {
        console.error('[Spotlight] Play audio failed:', err);
    }
}


let _spotlightAudioCtx = null;
function getSpotlightAudioCtx() {
    if (!_spotlightAudioCtx || _spotlightAudioCtx.state === 'closed') {
        _spotlightAudioCtx = new AudioContext();
    }
    return _spotlightAudioCtx;
}


let _spotlightCurrentAudio = null;
let _spotlightAudioAborted = false;

function stopSpotlightAudio() {
    _spotlightAudioAborted = true;
    if (_spotlightCurrentAudio) {
        _spotlightCurrentAudio.pause();
        _spotlightCurrentAudio = null;
    }
}



function playBase64Audio(base64Data, speed = 1.0) {
    return new Promise(async (resolve, reject) => {
        if (_spotlightAudioAborted) { resolve(); return; }
        try {
            const parts = base64Data.split(',');
            const byteString = atob(parts[1]);
            const byteArray = new Uint8Array(byteString.length);
            for (let i = 0; i < byteString.length; i++) byteArray[i] = byteString.charCodeAt(i);


            let silenceOffset = 0;
            try {
                const ctx = getSpotlightAudioCtx();
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

            if (_spotlightAudioAborted) { resolve(); return; }


            const mime = parts[0].split(':')[1].split(';')[0];
            const blob = new Blob([byteArray], { type: mime });
            const blobUrl = URL.createObjectURL(blob);
            const audio = new Audio(blobUrl);
            audio.playbackRate = speed;
            if (silenceOffset > 0) audio.currentTime = silenceOffset;
            _spotlightCurrentAudio = audio;
            audio.onended = () => { _spotlightCurrentAudio = null; URL.revokeObjectURL(blobUrl); resolve(); };
            audio.onerror = (e) => { _spotlightCurrentAudio = null; URL.revokeObjectURL(blobUrl); reject(e); };
            audio.play().catch(reject);
        } catch (e) {

            try {
                const audio = new Audio(base64Data);
                audio.playbackRate = speed;
                _spotlightCurrentAudio = audio;
                audio.onended = () => { _spotlightCurrentAudio = null; resolve(); };
                audio.onerror = (err) => { _spotlightCurrentAudio = null; reject(err); };
                audio.play().catch(reject);
            } catch (e2) { reject(e2); }
        }
    });
}







function initSpotlightDictLauncher() {
    if (!spotlightDictLauncherBtn) {
        spotlightDictLauncherBtn = document.createElement('div');
        spotlightDictLauncherBtn.className = 'lumina-dict-launcher';
        spotlightDictLauncherBtn.style.position = 'fixed';
        spotlightDictLauncherBtn.style.display = 'none';
        spotlightDictLauncherBtn.style.zIndex = '10001';
        document.body.appendChild(spotlightDictLauncherBtn);

        spotlightDictLauncherBtn.onclick = (e) => {
            e.stopPropagation();
            const word = spotlightDictLauncherBtn.dataset.word;
            console.log('[Spotlight Debug] Launcher clicked for word:', word);

            const x = parseInt(spotlightDictLauncherBtn.style.left);
            const y = parseInt(spotlightDictLauncherBtn.style.top) + 38;

            showSpotlightDictionaryPopup(word, x, y);
            hideSpotlightDictLauncher();
        };
    }

    spotlightDictLauncherBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>`;
}

function showSpotlightDictLauncher(x, y, word) {
    initSpotlightDictLauncher();
    spotlightDictLauncherBtn.dataset.word = word;
    spotlightDictLauncherBtn.style.left = x + 'px';
    spotlightDictLauncherBtn.style.top = y + 'px';
    spotlightDictLauncherBtn.style.display = 'flex';
    console.log('[Spotlight Debug] Showing Dict Launcher at:', x, y, 'word:', word);
}

function hideSpotlightDictLauncher() {
    if (spotlightDictLauncherBtn) spotlightDictLauncherBtn.style.display = 'none';
}

function showSpotlightDictionaryPopup(word, x, y) {
    console.log('[Spotlight Debug] Opening Dictionary Popup for:', word);






    const existing = document.getElementById('lumina-spotlight-dict-popup');
    if (existing) existing.remove();

    const popup = document.createElement('div');
    popup.id = 'lumina-spotlight-dict-popup';
    popup.className = 'lumina-dict-popup lumina-mode-dictionary';
    popup.style.position = 'fixed';
    popup.style.top = y + 'px';
    popup.style.left = x + 'px';
    popup.style.zIndex = '10002';
    popup.style.width = '420px';
    popup.style.height = '420px';
    popup.style.background = 'white';
    popup.style.borderRadius = '12px';
    popup.style.boxShadow = '0 10px 30px rgba(0,0,0,0.15)';
    popup.style.overflow = 'hidden';
    popup.style.border = '1px solid rgba(0,0,0,0.1)';

    popup.innerHTML = `
        <iframe src="https://dictionary.cambridge.org/dictionary/english/${encodeURIComponent(word)}" 
                style="width: 100%; height: 100%; border: none; background: white;"></iframe>
    `;

    document.body.appendChild(popup);
}


window.addEventListener('mousedown', (e) => {

    if (window.mouseupTimer) {
        clearTimeout(window.mouseupTimer);
    }

    const path = e.composedPath();
    const isInsideAskBtn = path.some(el => el.id === 'lumina-action-bar');
    const isInsideAskInput = path.some(el => el.id === 'lumina-ask-input-popup');
    const isInsideDictLauncher = path.some(el => el.classList && el.classList.contains && el.classList.contains('lumina-dict-launcher'));
    const isInsideDictPopup = document.getElementById('lumina-spotlight-dict-popup')?.contains(e.target) ||
        path.some(el => (el.id === 'lumina-spotlight-dict-popup') || (el.classList && el.classList.contains && el.classList.contains('lumina-mode-dictionary')));

    if (!isInsideAskBtn && !isInsideAskInput) {
        if (window.LuminaSelection) LuminaSelection.hide();
    }

    if (!isInsideDictLauncher && !isInsideDictPopup) {
        document.getElementById('lumina-spotlight-dict-popup')?.remove();
    }
}, true);


chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
        if (changes.readWebpage) {
            readWebpageEnabled = !!changes.readWebpage.newValue;
        }
        if (changes.askSelectionPopupEnabled) {
            askSelectionPopupEnabled = !!changes.askSelectionPopupEnabled.newValue;
        }
        if (changes.lumina_youtube_trigger && changes.lumina_youtube_trigger.newValue) {
            handleYouTubeTrigger(changes.lumina_youtube_trigger.newValue);
        }
        if (changes.lumina_sparks) {
            if (typeof sidebarSparksRenderList === 'function') {
                sidebarSparksRenderList();
            }
            if (typeof sparksRenderList === 'function') {
                sparksRenderList();
            }
        }
    }
});


async function handleYouTubeTrigger(triggerInfo) {
    console.log('[Spotlight YT] handleYouTubeTrigger calling with:', triggerInfo);
    if (!triggerInfo || triggerInfo.action !== 'youtube_ask') return;

    const activeTab = tabs && tabs[activeTabIndex];
    console.log('[Spotlight YT] activeTabIndex:', activeTabIndex, 'activeTab exists:', !!activeTab);

    if (!activeTab) {

        setTimeout(() => handleYouTubeTrigger(triggerInfo), 200);
        return;
    }


    const handleFoundTab = (ytTab) => {
        console.log('[Spotlight YT] Processing YouTube tab:', ytTab ? ytTab.id : 'NOT FOUND');

        if (ytTab) {
            currentBrowserTab = {
                tabId: ytTab.id,
                title: ytTab.title || 'Untitled',
                url: ytTab.url,
                favIconUrl: ytTab.favIconUrl
            };


            console.log('[Spotlight YT] Pinning to active tab:', activeTab.id);
            toggleWebSourcePin(currentBrowserTab, true, activeTab.id);


            chrome.storage.local.remove('lumina_youtube_trigger');
        } else {
            console.warn('[Spotlight YT] Could not find any corresponding YouTube tab.');
        }
    };

    if (triggerInfo.tabId) {
        console.log('[Spotlight YT] Using direct tabId from trigger:', triggerInfo.tabId);
        chrome.tabs.get(triggerInfo.tabId, (tab) => {
            if (chrome.runtime.lastError || !tab) {
                console.log('[Spotlight YT] Direct tabId lookup failed, falling back to query...');
                performTabQuery();
            } else {
                handleFoundTab(tab);
            }
        });
    } else {
        performTabQuery();
    }

    function performTabQuery() {
        console.log('[Spotlight YT] Querying tabs to find videoId:', triggerInfo.videoId);
        chrome.tabs.query({ currentWindow: false }, (tabs) => {
            const ytTab = tabs.find(t => {
                const url = t.url || '';
                if (triggerInfo.videoId) {
                    return url.includes(`v=${triggerInfo.videoId}`) || url.includes(`/shorts/${triggerInfo.videoId}`);
                }
                return url.includes('youtube.com/watch') || url.includes('youtube.com/shorts');
            });
            handleFoundTab(ytTab);
        });
    }
}


window.loadHistoryIntoNewTab = async function (messages, meta, historySessionId, targetIndex = null) {
    if (tabs.length === 0) return;

    const isSecondary = isSplitMode && hoveredPane === 'secondary';
    const targetIdx = isSecondary ? secondaryActiveTabIndex : activeTabIndex;
    const activeTab = tabs[targetIdx];
    if (!activeTab) return;

    activeTab.sessionId = historySessionId;
    updateUrlSessionId(historySessionId);
    updatePaneBlankState();

    let displayTitle = meta.title || "Restored Chat";
    if (!meta.isRenamed && !meta.autoNamed && messages && messages.length > 0) {
        for (let i = messages.length - 1; i >= 0; i--) {
            const m = messages[i];
            if (m.type === 'question') {
                displayTitle = m.content || displayTitle;
                break;
            } else if (m.type === 'translation') {
                displayTitle = m.content?.source || displayTitle;
                break;
            }
        }
    }
    activeTab.title = displayTitle;
    const sidKey = historySessionId || 'null';
    const savedSettings = sessionSettings[sidKey] || {};
    if (!activeTab.selectedModel) {
        activeTab.selectedModel = savedSettings.selectedModel || meta.selectedModel || null;
    }

    if (!activeTab.thinkingLevel) {
        // Load thinking level strictly from advancedParamsByModel
        const localData = await chrome.storage.local.get(['advancedParamsByModel']);
        const advParams = localData.advancedParamsByModel || {};
        const modelObj = activeTab.selectedModel;
        const compositeKey = modelObj ? (modelObj.providerId ? `${modelObj.providerId}:${modelObj.model}` : modelObj.model) : '';
        const modelParams = advParams[compositeKey] || advParams[modelObj?.model] || {};

        const defaultThinking = modelObj ? window.LuminaModelHelper.getDefaultThinking(modelObj.model, modelObj.providerId) : 'none';

        activeTab.thinkingLevel = modelParams.thinkingLevel || defaultThinking;
    }
    activeTab.sparkId = meta.sparkId || null;
    if (activeTab.chatUIInstance) activeTab.chatUIInstance.sparkId = activeTab.sparkId;

    // Save model and thinking level state to lumina_session_settings so selectors fetch them correctly
    try {
        const res = await chrome.storage.local.get(['lumina_session_settings']);
        const settings = res.lumina_session_settings || {};
        if (!settings[sidKey]) settings[sidKey] = {};
        if (activeTab.selectedModel) {
            settings[sidKey].selectedModel = activeTab.selectedModel;
        }
        if (activeTab.thinkingLevel) {
            settings[sidKey].thinkingLevel = activeTab.thinkingLevel;
        }
        await chrome.storage.local.set({ lumina_session_settings: settings });
        // Update local sessionSettings cache immediately so we don't have to wait for the storage listener
        sessionSettings = settings;
    } catch (e) {
        console.error('Failed to sync session settings', e);
    }

    const targetInputUI = isSecondary ? sharedInputUISecondary : sharedInputUI;
    if (targetInputUI) {
        targetInputUI.activeTabModel = activeTab.selectedModel ? { ...activeTab.selectedModel } : null;
        targetInputUI.thinkingLevel = activeTab.thinkingLevel || null;
        if (typeof targetInputUI.refreshModelSelector === 'function') targetInputUI.refreshModelSelector();
        if (typeof targetInputUI.refreshReasoningSelector === 'function') targetInputUI.refreshReasoningSelector();

        // Restore input state
        targetInputUI.restoreInputState(isSecondary ? activeTab.inputStateSecondary || null : activeTab.inputState || null);
    }

    updateInputPlaceholder();
    if (isSecondary) {
        if (typeof window.updateTopbarModelSelectorSecondary === 'function') {
            window.updateTopbarModelSelectorSecondary();
        }
    } else {
        if (typeof window.updateTopbarModelSelector === 'function') {
            window.updateTopbarModelSelector();
        }
    }
    if (typeof sidebarSparksRenderList === 'function') {
        sidebarSparksRenderList();
    }

    const chatData = {
        ...meta,
        messages: messages,
        sessionId: historySessionId,
        timestamp: meta.createdAt || meta.updatedAt
    };

    if (typeof ChatHistoryManager !== 'undefined' && typeof ChatHistoryManager.restoreChat === 'function') {
        showTopbarLoading(isSecondary ? 'secondary' : 'primary');
        if (activeTab.historyEl) {
            activeTab.historyEl.dataset.sessionId = historySessionId;
        }
        activeTab.historyEl.style.opacity = '0';
        activeTab.historyEl.style.transition = 'none';
        activeTab.historyEl.innerHTML = '';

        await ChatHistoryManager.restoreChat(chatData, activeTab.historyEl);

        normalizeRestoredHistory(activeTab.historyEl);
        activeTab.isHistoryLoaded = true;
        activeTab.isLoadingHistory = false;
        updateWelcomeScreenState(isSecondary ? 'secondary' : 'primary');
        renderTabs();
        saveTabsState();
        if (typeof updateTopbarSparkTitle === 'function') {
            updateTopbarSparkTitle();
        }

        syncTabUI(activeTab, isSecondary, true);

        if (targetIndex !== null && messages && messages[targetIndex]) {

            setTimeout(() => {
                const targetNode = activeTab.historyEl.querySelector(`.lumina-chat-question[data-message-index="${targetIndex}"]`);

                if (targetNode) {
                    const targetEntry = targetNode.closest('.lumina-dict-entry');
                    if (targetEntry) {

                        const targetScrollTop = LuminaChatUI.calculateInitialScrollTarget(targetEntry, activeTab.historyEl);


                        const maxScroll = Math.max(0, activeTab.historyEl.scrollHeight - activeTab.historyEl.clientHeight);
                        const finalScrollTop = Math.max(0, Math.min(targetScrollTop, maxScroll));

                        activeTab.historyEl.scrollTo({
                            top: finalScrollTop,
                            behavior: 'instant'
                        });


                        activeTab.scrollTop = finalScrollTop;
                        activeTab.isAtBottom = (finalScrollTop >= maxScroll - 10);


                        targetNode.style.transition = 'background-color 0.5s';
                        const originalBg = targetNode.style.backgroundColor;
                        targetNode.style.backgroundColor = 'rgba(0, 86, 210, 0.1)';
                        setTimeout(() => {
                            targetNode.style.backgroundColor = originalBg;
                        }, 1500);
                    }
                } else {
                    activeTab.historyEl.scrollTop = activeTab.historyEl.scrollHeight;
                    activeTab.scrollTop = -1;
                }
                activeTab.historyEl.style.opacity = '1';
                activeTab.historyEl.style.transition = '';
                hideTopbarLoading(isSecondary ? 'secondary' : 'primary');
            }, 60);
        } else {
            const performRestore = async () => {
                if (activeTab.historyEl.__processingPromises) {
                    try {
                        await Promise.all(activeTab.historyEl.__processingPromises);
                    } catch (e) { }
                    activeTab.historyEl.__processingPromises = null;
                }
                const entries = activeTab.historyEl.querySelectorAll('.lumina-dict-entry');
                if (entries.length > 0) {
                    const latestEntry = entries[entries.length - 1];
                    const targetScrollTop = LuminaChatUI.calculateInitialScrollTarget(latestEntry, activeTab.historyEl);
                    activeTab.historyEl.scrollTop = targetScrollTop;
                    activeTab.scrollTop = targetScrollTop;
                } else {
                    activeTab.historyEl.scrollTop = activeTab.historyEl.scrollHeight;
                    activeTab.scrollTop = -1;
                }
                activeTab.historyEl.style.opacity = '1';
                activeTab.historyEl.style.transition = '';
                hideTopbarLoading(isSecondary ? 'secondary' : 'primary');
            };
            setTimeout(performRestore, 40);
        }
    }
};

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

async function renderDropdownMenu(pane = 'primary') {
    const isSec = (pane === 'secondary');
    const dropdown = document.getElementById(isSec ? 'topbar-dropdown-menu-secondary' : 'topbar-dropdown-menu');
    if (!dropdown) return;

    const targetIdx = isSec ? secondaryActiveTabIndex : activeTabIndex;
    const activeTab = tabs[targetIdx];
    const sessionId = activeTab?.sessionId || null;

    let sessionMeta = null;
    if (sessionId) {
        const res = await chrome.storage.local.get([ChatHistoryManager.STORAGE_KEY]);
        const sessions = res[ChatHistoryManager.STORAGE_KEY] || {};
        sessionMeta = sessions[sessionId] || null;
    }

    const isPinned = sessionMeta?.pinned || false;
    const pinSVG = isPinned
        ? `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="item-icon"><path d="M9 4 H15 V10 C15 12 17 12 17 14 A2 2 0 0 1 15 16 H9 A2 2 0 0 1 7 14 C7 12 9 12 9 10 Z" /><path d="M12 16 V22" /><path d="M4 4 L20 20" /></svg>`
        : `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.0" stroke-linecap="round" stroke-linejoin="round" class="item-icon"><path d="M9 4 H15 V9 C15 11 17 11 17 13 A1.5 1.5 0 0 1 15.5 14.5 H8.5 A1.5 1.5 0 0 1 7 13 C7 11 9 11 9 9 Z" /><path d="M12 14.5 V21" /></svg>`;

    const html = `
        <div class="dropdown-section-title">This chat</div>
        <div class="dropdown-item action-item" id="dropdown-pin-btn">
            ${pinSVG}
            <span class="item-text">${isPinned ? 'Unpin' : 'Pin'}</span>
        </div>
        <div class="dropdown-item action-item" id="dropdown-rename-btn">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="item-icon"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>
            <span class="item-text">Rename</span>
        </div>
        <div class="dropdown-item action-item" id="dropdown-duplicate-btn">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="item-icon"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            <span class="item-text">Duplicate</span>
        </div>
        <div class="dropdown-divider"></div>
        <div class="dropdown-item action-item action-item--danger" id="dropdown-delete-btn">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="item-icon"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            <span class="item-text">Delete</span>
        </div>
    `;

    dropdown.innerHTML = html;

    const hide = () => { dropdown.style.display = 'none'; };

    // Pin / Unpin
    dropdown.querySelector('#dropdown-pin-btn')?.addEventListener('click', async () => {
        if (!sessionId) return;
        const res = await chrome.storage.local.get([ChatHistoryManager.STORAGE_KEY]);
        const store = res[ChatHistoryManager.STORAGE_KEY] || {};
        const session = store[sessionId];
        if (session) {
            const currentlyPinned = !!session.pinned;
            if (!currentlyPinned) {
                let currentTitle = session.title || 'Untitled Chat';
                if (!session.isRenamed && !session.autoNamed && session.questions && session.questions.length > 0) {
                    currentTitle = session.questions[session.questions.length - 1].text || currentTitle;
                }
                const newTitle = await window.showCustomPopup({
                    title: 'Pin this chat',
                    body: '',
                    isInput: true,
                    defaultValue: currentTitle,
                    confirmLabel: 'Pin'
                });
                if (newTitle === null) {
                    hide();
                    return;
                }
                session.pinned = true;
                if (newTitle.trim()) {
                    session.title = newTitle.trim();
                    session.isRenamed = true;
                }
            } else {
                session.pinned = false;
            }
            await chrome.storage.local.set({ [ChatHistoryManager.STORAGE_KEY]: store });
            if (session.isRenamed) {
                const currentActiveTab = tabs[targetIdx];
                if (currentActiveTab && currentActiveTab.sessionId === sessionId) {
                    currentActiveTab.title = session.title;
                    renderTabs();
                }
            }
            renderRecentChatsSidebar();
        }
        hide();
    });

    // Rename
    dropdown.querySelector('#dropdown-rename-btn')?.addEventListener('click', async () => {
        if (!sessionId || !sessionMeta) return;
        let currentTitle = sessionMeta.title || 'Untitled Chat';
        if (!sessionMeta.isRenamed && !sessionMeta.autoNamed && sessionMeta.questions && sessionMeta.questions.length > 0) {
            currentTitle = sessionMeta.questions[sessionMeta.questions.length - 1].text || currentTitle;
        }
        const newTitle = await window.showCustomPopup({
            title: 'Rename Chat',
            body: '',
            isInput: true,
            defaultValue: currentTitle,
            confirmLabel: 'Rename'
        });
        if (newTitle && newTitle.trim() && newTitle.trim() !== currentTitle) {
            await ChatHistoryManager.renameChat(sessionId, newTitle.trim());
        }
        hide();
    });

    // Duplicate
    dropdown.querySelector('#dropdown-duplicate-btn')?.addEventListener('click', async () => {
        if (!sessionId) return;
        await ChatHistoryManager.duplicateChat(sessionId);
        hide();
    });

    // Delete
    dropdown.querySelector('#dropdown-delete-btn')?.addEventListener('click', async () => {
        if (!sessionId) return;
        const confirmed = await window.showCustomPopup({
            title: 'Delete Chat',
            body: 'Are you sure you want to delete this chat? This action cannot be undone.',
            confirmLabel: 'Delete',
            isDanger: true
        });
        if (confirmed) {
            await ChatHistoryManager.deleteChat(sessionId);
            tabs.forEach((tab, index) => {
                if (tab.sessionId === sessionId) {
                    const isSecondary = (typeof isSplitMode !== 'undefined' && isSplitMode && index === secondaryActiveTabIndex);
                    resetChat(isSecondary);
                }
            });
        }
        hide();
    });

    // Open in New Tab
    dropdown.querySelector('#dropdown-continue-btn')?.addEventListener('click', () => {
        let url = chrome.runtime.getURL('pages/spotlight/spotlight.html') + '?webapp=1';
        if (sessionId) url += `&session_id=${sessionId}`;
        chrome.tabs.create({ url });
        hide();
    });

    dropdown.querySelector('#dropdown-settings-btn')?.addEventListener('click', () => {
        if (typeof LuminaSettingsModal !== 'undefined') {
            LuminaSettingsModal.show();
        } else {
            chrome.runtime.openOptionsPage();
        }
        hide();
    });
}

function initTopbarModelSelector(pane = 'primary') {
    const isSec = (pane === 'secondary');
    const selectorId = isSec ? 'topbar-model-selector-secondary' : 'topbar-model-selector';
    const btnId = isSec ? 'topbar-model-btn-secondary' : 'topbar-model-btn';
    const labelId = isSec ? 'topbar-model-label-secondary' : 'topbar-model-label';
    const dropdownId = isSec ? 'topbar-model-dropdown-secondary' : 'topbar-model-dropdown';

    const selector = document.getElementById(selectorId);
    if (!selector) return;
    const btn = document.getElementById(btnId);
    const label = document.getElementById(labelId);
    const dropdown = document.getElementById(dropdownId);
    if (!btn || !dropdown) return;

    if (btn.dataset.initializedModelSelector) {
        if (isSec) {
            if (window.updateTopbarModelSelectorSecondary) {
                window.updateTopbarModelSelectorSecondary();
            }
        } else {
            if (window.updateTopbarModelSelector) {
                window.updateTopbarModelSelector();
            }
        }
        return;
    }
    btn.dataset.initializedModelSelector = 'true';

    const render = (data) => {
        const promptSupport = data.promptSupport || { supported: false, status: 'no', reason: 'Prompt API not checked' };
        const chain = window.LuminaModelHelper.buildModelChain(data, promptSupport);

        // Find current model of active tab
        const activeTab = isSec
            ? tabs[secondaryActiveTabIndex]
            : tabs[activeTabIndex];
        let currentModel = activeTab?.selectedModel?.model;
        let currentProviderId = activeTab?.selectedModel?.providerId;

        const lastUsed = data.lastUsedModel;
        if (!currentModel && lastUsed && lastUsed.model) {
            currentModel = lastUsed.model;
            currentProviderId = lastUsed.providerId;
        }
        if (!currentModel && chain.length > 0) {
            currentModel = chain[0].model;
            currentProviderId = chain[0].providerId;
        }

        if (activeTab && currentModel) {
            activeTab.selectedModel = { model: currentModel, providerId: currentProviderId };
            const targetSharedUI = isSec ? sharedInputUISecondary : sharedInputUI;
            if (targetSharedUI) {
                targetSharedUI.activeTabModel = { ...activeTab.selectedModel };
                targetSharedUI.thinkingLevel = activeTab.thinkingLevel || null;
                if (typeof targetSharedUI.refreshReasoningSelector === 'function') {
                    targetSharedUI.refreshReasoningSelector();
                }
            }
        }

        const activeChainItem = chain.find(c => c.model === currentModel && c.providerId === currentProviderId);
        if (label) {
            if (activeChainItem) {
                label.textContent = activeChainItem.displayName || activeChainItem.model;
            } else {
                label.textContent = currentModel;
            }
        }

        dropdown.innerHTML = '';
        if (chain.length === 0) {
            dropdown.innerHTML = '<div style="padding:8px;font-size:11px;color:#70757a;">No models</div>';
            return;
        }

        chain.forEach((item) => {
            const el = document.createElement('button');
            const isActive = item.model === currentModel && item.providerId === currentProviderId;
            el.className = `lumina-model-item${isActive ? ' active' : ''}`;

            el.innerHTML = `<span class="model-name">${item.displayName || item.model}</span>`;

            el.onclick = (e) => {
                e.stopPropagation();
                if (label) label.textContent = item.displayName || item.model;
                dropdown.classList.remove('active');
                dropdown.querySelectorAll('.lumina-model-item').forEach(b => b.classList.remove('active'));
                el.classList.add('active');

                // Update active tab model and other tab if sharing session
                const currentActiveTab = isSec
                    ? tabs[secondaryActiveTabIndex]
                    : tabs[activeTabIndex];
                const otherTab = isSec
                    ? (activeTabIndex >= 0 ? tabs[activeTabIndex] : null)
                    : (typeof isSplitMode !== 'undefined' && isSplitMode && secondaryActiveTabIndex >= 0 ? tabs[secondaryActiveTabIndex] : null);

                const tabsToUpdate = [currentActiveTab];
                if (otherTab && otherTab.sessionId === currentActiveTab.sessionId) {
                    tabsToUpdate.push(otherTab);
                }

                tabsToUpdate.forEach(tab => {
                    const tabIsSec = (typeof isSplitMode !== 'undefined' && isSplitMode && tab === tabs[secondaryActiveTabIndex]);
                    const targetSharedUI = tabIsSec ? sharedInputUISecondary : sharedInputUI;

                    tab.selectedModel = { model: item.model, providerId: item.providerId };
                    setPaneActiveModel(tabIsSec ? 'secondary' : 'primary', tab.selectedModel);
                    if (tab.chatUIInstance) {
                        tab.chatUIInstance.activeTabModel = { ...tab.selectedModel };
                    }
                    if (targetSharedUI) {
                        targetSharedUI.activeTabModel = { ...tab.selectedModel };
                    }
                });

                if (currentActiveTab) {
                    const sidKey = currentActiveTab.sessionId || 'null';
                    chrome.storage.local.get(['lumina_session_settings', 'advancedParamsByModel'], (res) => {
                        const settings = res.lumina_session_settings || {};
                        if (!settings[sidKey]) settings[sidKey] = {};
                        settings[sidKey].selectedModel = { model: item.model, providerId: item.providerId };

                        // Load and sync thinkingLevel for the new model
                        const advancedParamsByModel = res.advancedParamsByModel || {};
                        const compositeKey = item.providerId ? `${item.providerId}:${item.model}` : item.model;
                        const modelParams = advancedParamsByModel[compositeKey] || advancedParamsByModel[item.model] || {};

                        const defaultThinking = window.LuminaModelHelper.getDefaultThinking(item.model, item.providerId);
                        const newThinkingLevel = modelParams.thinkingLevel || defaultThinking;

                        tabsToUpdate.forEach(tab => {
                            const tabIsSec = (typeof isSplitMode !== 'undefined' && isSplitMode && tab === tabs[secondaryActiveTabIndex]);
                            const targetSharedUI = tabIsSec ? sharedInputUISecondary : sharedInputUI;

                            tab.thinkingLevel = newThinkingLevel;
                            setPaneActiveThinking(tabIsSec ? 'secondary' : 'primary', newThinkingLevel);
                            settings[sidKey].thinkingLevel = newThinkingLevel;
                            if (tab.chatUIInstance) {
                                tab.chatUIInstance.thinkingLevel = newThinkingLevel;
                            }
                            if (targetSharedUI) {
                                targetSharedUI.thinkingLevel = newThinkingLevel;
                            }
                        });

                        chrome.storage.local.set({ lumina_session_settings: settings }, () => {
                            tabsToUpdate.forEach(tab => {
                                const tabIsSec = (typeof isSplitMode !== 'undefined' && isSplitMode && tab === tabs[secondaryActiveTabIndex]);
                                const targetSharedUI = tabIsSec ? sharedInputUISecondary : sharedInputUI;
                                if (targetSharedUI && typeof targetSharedUI.refreshReasoningSelector === 'function') {
                                    targetSharedUI.refreshReasoningSelector();
                                }
                            });
                            if (typeof saveTabsState === 'function') {
                                saveTabsState();
                            }
                            if (typeof window.updateTopbarModelSelector === 'function') {
                                window.updateTopbarModelSelector();
                            }
                            if (typeof window.updateTopbarModelSelectorSecondary === 'function') {
                                window.updateTopbarModelSelectorSecondary();
                            }
                        });
                    });
                }

                chrome.storage.local.set({ lastUsedModel: { model: item.model, providerId: item.providerId } });
            };
            dropdown.appendChild(el);
        });

        // Divider
        const divider = document.createElement('div');
        divider.className = 'lumina-model-divider';
        dropdown.appendChild(divider);

        // Thinking level item
        const thinkingItem = document.createElement('div');
        thinkingItem.className = 'lumina-model-item lumina-thinking-parent-item';
        thinkingItem.style.position = 'relative';
        thinkingItem.style.display = 'flex';
        thinkingItem.style.alignItems = 'center';
        thinkingItem.style.justifyContent = 'space-between';
        thinkingItem.style.cursor = 'pointer';

        const currentLevel = activeTab?.thinkingLevel || 'none';
        const titleMap = {
            'minimal': 'Minimal',
            'low': 'Low',
            'medium': 'Standard',
            'high': 'Extended',
            'none': 'None'
        };

        thinkingItem.innerHTML = `
            <div class="model-info" style="display:flex; flex-direction:column; gap:2px; flex:1;">
                <span class="model-name" style="font-size:13.5px; font-weight:500;">Thinking level</span>
                <span style="font-size:11px; color:var(--lumina-text-secondary);">${titleMap[currentLevel] || 'None'}</span>
            </div>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.6;"><polyline points="9 18 15 12 9 6"></polyline></svg>
        `;

        // Submenu
        const submenu = document.createElement('div');
        submenu.className = 'lumina-thinking-submenu';

        const options = window.LuminaModelHelper.getThinkingOptions(currentModel, currentProviderId, data.providers);

        options.forEach((opt) => {
            const optEl = document.createElement('button');
            const isActive = currentLevel === opt.value;
            optEl.className = `lumina-thinking-opt-item ${isActive ? 'active' : ''}`;

            const checkmarkIcon = isActive ? `
                <span class="reasoning-checkmark" style="display:flex; align-items:center; justify-content:center; width:16px; margin-right:8px; color:var(--lumina-primary);">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                </span>
            ` : `
                <span class="reasoning-checkmark" style="display:flex; align-items:center; justify-content:center; width:16px; margin-right:8px;"></span>
            `;

            optEl.innerHTML = `
                ${checkmarkIcon}
                <div class="reasoning-info" style="display:flex; flex-direction:column; text-align:left;">
                    <span class="reasoning-title" style="font-size:13px; font-weight:500;">${opt.title}</span>
                    <span class="reasoning-desc" style="font-size:11px; color:var(--lumina-text-secondary);">${opt.desc}</span>
                </div>
            `;

            optEl.onclick = (e) => {
                e.stopPropagation();

                const currentActiveTab = isSec
                    ? tabs[secondaryActiveTabIndex]
                    : tabs[activeTabIndex];
                const otherTab = isSec
                    ? (activeTabIndex >= 0 ? tabs[activeTabIndex] : null)
                    : (typeof isSplitMode !== 'undefined' && isSplitMode && secondaryActiveTabIndex >= 0 ? tabs[secondaryActiveTabIndex] : null);

                const tabsToUpdate = [currentActiveTab];
                if (otherTab && otherTab.sessionId === currentActiveTab.sessionId) {
                    tabsToUpdate.push(otherTab);
                }

                tabsToUpdate.forEach(tab => {
                    const tabIsSec = (typeof isSplitMode !== 'undefined' && isSplitMode && tab === tabs[secondaryActiveTabIndex]);
                    const targetSharedUI = tabIsSec ? sharedInputUISecondary : sharedInputUI;

                    tab.thinkingLevel = opt.value;
                    setPaneActiveThinking(tabIsSec ? 'secondary' : 'primary', opt.value);
                    if (tab.chatUIInstance) {
                        tab.chatUIInstance.thinkingLevel = opt.value;
                    }
                    if (targetSharedUI) {
                        targetSharedUI.thinkingLevel = opt.value;
                    }
                });

                if (currentActiveTab) {
                    const sidKey = currentActiveTab.sessionId || 'null';
                    chrome.storage.local.get(['lumina_session_settings', 'advancedParamsByModel'], (res) => {
                        const settings = res.lumina_session_settings || {};
                        if (!settings[sidKey]) settings[sidKey] = {};
                        settings[sidKey].thinkingLevel = opt.value;

                        const advancedParamsByModel = res.advancedParamsByModel || {};
                        const compositeKey = currentProviderId ? `${currentProviderId}:${currentModel}` : currentModel;
                        const key = compositeKey;
                        if (!advancedParamsByModel[key]) advancedParamsByModel[key] = {};
                        if (opt.value === 'none' || opt.value === 'off') {
                            delete advancedParamsByModel[key].thinkingLevel;
                        } else {
                            advancedParamsByModel[key].thinkingLevel = opt.value;
                        }

                        chrome.storage.local.set({ lumina_session_settings: settings, advancedParamsByModel }, () => {
                            tabsToUpdate.forEach(tab => {
                                const tabIsSec = (typeof isSplitMode !== 'undefined' && isSplitMode && tab === tabs[secondaryActiveTabIndex]);
                                const targetSharedUI = tabIsSec ? sharedInputUISecondary : sharedInputUI;
                                if (targetSharedUI && typeof targetSharedUI.refreshSystemTokens === 'function') {
                                    targetSharedUI.refreshSystemTokens();
                                }
                            });
                            dropdown.classList.remove('active');
                            if (typeof window.updateTopbarModelSelector === 'function') {
                                window.updateTopbarModelSelector();
                            }
                            if (typeof window.updateTopbarModelSelectorSecondary === 'function') {
                                window.updateTopbarModelSelectorSecondary();
                            }
                        });
                    });
                }
            };
            submenu.appendChild(optEl);
        });

        thinkingItem.appendChild(submenu);
        dropdown.appendChild(thinkingItem);
    };

    const fetchAndRender = () => {
        const activeTab = isSec
            ? tabs[secondaryActiveTabIndex]
            : tabs[activeTabIndex];
        const sidKey = activeTab?.sessionId || 'null';

        chrome.storage.local.get(['providers', 'modelChains', 'lastUsedModel', 'lumina_session_settings', 'advancedParamsByModel'], async (data) => {
            if (typeof window.getPromptApiSupport === 'function') {
                data.promptSupport = await window.getPromptApiSupport();
            } else {
                data.promptSupport = { supported: false, status: 'no', reason: 'Prompt API not loaded' };
            }
            const settings = data.lumina_session_settings || {};
            const saved = settings[sidKey] || {};
            if (activeTab && !activeTab.selectedModel && saved.selectedModel) {
                activeTab.selectedModel = saved.selectedModel;
            }
            if (activeTab) {
                const modelObj = activeTab.selectedModel;
                if (modelObj) {
                    const compositeKey = modelObj.providerId ? `${modelObj.providerId}:${modelObj.model}` : modelObj.model;
                    const advancedParamsByModel = data.advancedParamsByModel || {};
                    const modelParams = advancedParamsByModel[compositeKey] || advancedParamsByModel[modelObj.model] || {};

                    const defaultThinking = window.LuminaModelHelper.getDefaultThinking(modelObj.model, modelObj.providerId);

                    activeTab.thinkingLevel = saved.thinkingLevel || modelParams.thinkingLevel || defaultThinking;
                }
            }
            render(data);
            updateTopbarSparkTitle();
        });
    };

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (dropdown.classList.contains('active')) {
            dropdown.classList.remove('active');
        } else {
            // Close other dropdowns
            const moreDropdown = document.getElementById(isSec ? 'topbar-dropdown-menu-secondary' : 'topbar-dropdown-menu');
            if (moreDropdown) moreDropdown.style.display = 'none';
            fetchAndRender();
            dropdown.classList.add('active');
        }
    });

    document.addEventListener('click', (e) => {
        if (!selector.contains(e.target) && dropdown.classList.contains('active')) {
            dropdown.classList.remove('active');
        }
    });

    if (isSec) {
        window.updateTopbarModelSelectorSecondary = fetchAndRender;
    } else {
        window.updateTopbarModelSelector = fetchAndRender;
    }
    fetchAndRender();
}

function updateTopbarSparkTitle() {
    const selectorEl = document.getElementById('topbar-model-selector');
    if (selectorEl) selectorEl.style.display = 'block';
    const selectorElSec = document.getElementById('topbar-model-selector-secondary');
    if (selectorElSec) selectorElSec.style.display = 'block';
}

window.updateTopbarSparkTitle = updateTopbarSparkTitle;

function updateInputPlaceholder() {
    const activeTab = (isSplitMode && hoveredPane === 'secondary')
        ? tabs[secondaryActiveTabIndex]
        : tabs[activeTabIndex];
    if (!activeTab) return;

    const targetInputUI = (isSplitMode && hoveredPane === 'secondary') ? sharedInputUISecondary : sharedInputUI;
    if (!targetInputUI || !targetInputUI.inputEl) return;

    if (activeTab.sparkId && sparksCache[activeTab.sparkId]) {
        const spark = sparksCache[activeTab.sparkId];
        targetInputUI.inputEl.placeholder = `Ask ${spark.name}...`;
    } else {
        targetInputUI.inputEl.placeholder = 'Ask anything...';
    }
}
window.updateInputPlaceholder = updateInputPlaceholder;

function updateSidebarUserProfile(isAuthenticated, user) {
    const avatarEl = document.querySelector('.user-profile .user-avatar');
    const nameEl = document.querySelector('.user-profile .user-name');
    if (!avatarEl || !nameEl) return;

    if (isAuthenticated && user) {
        nameEl.textContent = user.name || "User";
        if (user.picture) {
            avatarEl.innerHTML = `<img src="${user.picture}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%; display: block;" />`;
        } else {
            const initials = (user.name || "U").split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();
            avatarEl.textContent = initials;
        }
    } else if (typeof LuminaAuth !== 'undefined' && LuminaAuth.isInitialized) {
        avatarEl.textContent = "LU";
        nameEl.textContent = "Lumina User";
    }

    const profileEl = document.querySelector('.user-profile');
    if (profileEl) {
        profileEl.style.visibility = 'visible';
    }
}

if (typeof LuminaAuth !== 'undefined') {
    LuminaAuth.addListener(updateSidebarUserProfile);
    updateSidebarUserProfile(LuminaAuth.isAuthenticated, LuminaAuth.user);
}

function getDynamicWelcomeTitle() {
    const now = new Date();
    const hour = now.getHours();

    let nameSuffix = '';
    if (typeof LuminaAuth !== 'undefined' && LuminaAuth.isAuthenticated && LuminaAuth.user && LuminaAuth.user.name) {
        const fullName = LuminaAuth.user.name;
        if (fullName) {
            nameSuffix = `, ${fullName}`;
        }
    }

    let options = [];
    if (hour >= 5 && hour < 8) {
        // Early Morning
        options = [
            `Good morning, early bird${nameSuffix}!`,
            `Morning${nameSuffix}! Starting early?`,
            `Good morning! Ready for a fresh start?`,
            `Rise and shine${nameSuffix}!`,
            `Early start today! What's on your mind?`
        ];
    } else if (hour >= 8 && hour < 12) {
        // Morning
        options = [
            `Good morning${nameSuffix}!`,
            `Morning${nameSuffix}! Ready for today?`,
            `Good morning! What's next?`,
            `Ready to conquer the morning?`,
            `Have a productive morning${nameSuffix}!`
        ];
    } else if (hour >= 12 && hour < 17) {
        // Afternoon
        options = [
            `Good afternoon${nameSuffix}!`,
            `Hello${nameSuffix}! What's next?`,
            `Afternoon! How can I help?`,
            `Hope your afternoon is going well!`,
            `Afternoon focus mode!`
        ];
    } else if (hour >= 17 && hour < 21) {
        // Evening
        options = [
            `Good evening${nameSuffix}!`,
            `Evening! Let's chat!`,
            `Good evening! What's next?`,
            `Evening${nameSuffix}! Gearing up?`,
            `Hope you had a great day!`
        ];
    } else if (hour >= 21 && hour < 24) {
        // Late Night
        options = [
            `Working late${nameSuffix}?`,
            `Good evening! Burning the midnight oil?`,
            `Late night thoughts? Let's chat!`,
            `Quiet hours focus mode!`,
            `Still going strong${nameSuffix}?`
        ];
    } else {
        // Midnight / Overnight (0 - 5)
        options = [
            `Night owl mode${nameSuffix}!`,
            `Still awake? What's on your mind?`,
            `Midnight inspiration?`,
            `Night mode activated!`,
            `Shh, the world is asleep!`
        ];
    }

    // Add general fallbacks
    options.push(
        `Where should we start?`,
        `What's on your mind?`,
        `How can I help?`,
        `Hello${nameSuffix}! Let's talk!`,
        `Ready to explore?`
    );

    const randomIndex = Math.floor(Math.random() * options.length);
    return options[randomIndex];
}

function updatePaneBlankState() {
    const paneSecondary = document.getElementById('pane-secondary');
    if (!paneSecondary) return;

    const secTab = (isSplitMode && secondaryActiveTabIndex >= 0) ? tabs[secondaryActiveTabIndex] : null;
    const searchOverlay = document.getElementById('lumina-search-overlay');
    const isSearchOpen = searchOverlay && searchOverlay.style.display !== 'none' && searchOverlay.classList.contains('in-pane');

    if (isSplitMode && secTab && !secTab.sessionId && isSearchOpen) {
        paneSecondary.classList.add('is-blank');
    } else {
        paneSecondary.classList.remove('is-blank');
    }
}

function updateWelcomeScreenState(pane = 'primary') {
    const isSec = (pane === 'secondary');
    const layout = document.getElementById(isSec ? 'chat-layout-secondary' : 'chat-layout');
    if (!layout) return;

    const targetTab = isSec
        ? (secondaryActiveTabIndex >= 0 ? tabs[secondaryActiveTabIndex] : null)
        : (activeTabIndex >= 0 ? tabs[activeTabIndex] : null);

    const historyEl = targetTab ? targetTab.historyEl : document.getElementById(isSec ? 'chat-history-secondary' : 'chat-history');
    if (!historyEl) return;

    const searchOverlay = document.getElementById('lumina-search-overlay');
    const isSearchOpen = searchOverlay && searchOverlay.style.display !== 'none' && searchOverlay.classList.contains('in-pane');

    if (isSec && targetTab && !targetTab.sessionId && isSearchOpen) {
        layout.classList.remove('new-chat-homepage');
        const chatContainer = layout.querySelector('.lumina-chat-container');
        if (chatContainer) {
            const welcomeEl = chatContainer.querySelector('.lumina-homepage-welcome');
            if (welcomeEl) welcomeEl.remove();
        }
        updatePaneBlankState();
        return;
    }

    if (targetTab && targetTab.sessionId && (!targetTab.isHistoryLoaded || targetTab.isLoadingHistory)) {
        updatePaneBlankState();
        return;
    }

    const isSpark = targetTab && targetTab.sparkId;
    const hasEntries = historyEl.querySelector('.lumina-dict-entry, .lumina-translation-card, .lumina-chat-question, .lumina-chat-answer') !== null;
    const chatContainer = layout.querySelector('.lumina-chat-container');
    if (!chatContainer) return;
    let welcomeEl = chatContainer.querySelector('.lumina-homepage-welcome');

    if (!hasEntries && !isSpark) {
        layout.classList.add('new-chat-homepage');
        if (!welcomeEl) {
            welcomeEl = document.createElement('div');
            welcomeEl.className = 'lumina-homepage-welcome';
            welcomeEl.innerHTML = `<div class="welcome-title">${escapeHtml(getDynamicWelcomeTitle())}</div>`;
            if (historyEl && historyEl.parentNode === chatContainer) {
                chatContainer.insertBefore(welcomeEl, historyEl);
            } else {
                chatContainer.appendChild(welcomeEl);
            }
        }
    } else {
        layout.classList.remove('new-chat-homepage');
        if (welcomeEl) {
            welcomeEl.remove();
        }
    }
    updatePaneBlankState();
}

if (typeof LuminaSync !== 'undefined') {
    LuminaSync.addListener((status) => {
        const wrapper = document.getElementById('user-avatar-wrapper');
        if (wrapper) {
            wrapper.classList.toggle('is-syncing', status === 'Syncing...');
        }
    });
}

window.showCustomPopup = function ({ title, body, isInput = false, defaultValue = '', placeholder = '', confirmLabel = 'Confirm', isDanger = false }) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'lumina-custom-popup-overlay';

        let inputHtml = '';
        if (isInput) {
            inputHtml = `<input type="text" class="lumina-custom-popup-input" placeholder="${placeholder}" value="${defaultValue.replace(/"/g, '&quot;')}">`;
        }

        const primaryBtnClass = isDanger ? 'lumina-custom-popup-btn-danger' : 'lumina-custom-popup-btn-primary';
        const bodyHtml = body ? `<div class="lumina-custom-popup-body">${body}</div>` : '';

        overlay.innerHTML = `
            <div class="lumina-custom-popup-box">
                <h3 class="lumina-custom-popup-title">${title}</h3>
                ${bodyHtml}
                ${inputHtml}
                <div class="lumina-custom-popup-actions">
                    <button class="lumina-custom-popup-btn btn-cancel">Cancel</button>
                    <button class="lumina-custom-popup-btn ${primaryBtnClass} btn-confirm">${confirmLabel}</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        requestAnimationFrame(() => overlay.classList.add('active'));

        const inputEl = overlay.querySelector('.lumina-custom-popup-input');
        if (inputEl) {
            inputEl.focus();
            inputEl.select();
            inputEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    confirm();
                } else if (e.key === 'Escape') {
                    cancel();
                }
            });
        } else {
            overlay.querySelector('.btn-confirm').focus();
        }

        const closePopup = () => {
            overlay.classList.remove('active');
            overlay.style.pointerEvents = 'none';
            setTimeout(() => overlay.remove(), 200);
        };

        const confirm = () => {
            const value = inputEl ? inputEl.value : true;
            closePopup();
            resolve(value);
        };

        const cancel = () => {
            closePopup();
            resolve(null);
        };

        overlay.querySelector('.btn-confirm').addEventListener('click', confirm);
        overlay.querySelector('.btn-cancel').addEventListener('click', cancel);
        overlay.addEventListener('mousedown', (e) => {
            if (e.target === overlay) cancel();
        });
    });
};

window.namingSessionIds = new Set();

/**
 * Fire chat title generation IN PARALLEL with the main AI request.
 * Shows skeleton on the sidebar item immediately; writes title to storage
 * once the session record appears (retries up to ~3 s).
 */
function startConcurrentAutoNaming(sessionId, modelObj, questionText, images, history) {
    if (!sessionId || !questionText) return;
    if (!window.namingSessionIds) window.namingSessionIds = new Set();
    if (window.namingSessionIds.has(sessionId)) return;

    window.namingSessionIds.add(sessionId);
    // Render sidebar immediately so the skeleton appears
    if (typeof renderRecentChatsSidebar === 'function') renderRecentChatsSidebar();

    chrome.runtime.sendMessage({
        action: 'generate_chat_title',
        modelObj: modelObj,
        question: questionText,
        images: images,
        history: history
    }, async (response) => {
        if (chrome.runtime.lastError) {
            console.warn('[AutoNaming] sendMessage error:', chrome.runtime.lastError.message);
            window.namingSessionIds.delete(sessionId);
            if (typeof renderRecentChatsSidebar === 'function') renderRecentChatsSidebar();
            return;
        }

        window.namingSessionIds.delete(sessionId);

        if (response && response.success && response.title) {
            const cleanTitle = response.title.trim();

            // Update in-memory tabs & tab bar — do NOT call saveTabsState() here
            // because its debounced saveCurrentChat would overwrite the title in storage
            if (typeof tabs !== 'undefined') {
                tabs.forEach(t => {
                    if (t.sessionId === sessionId) t.title = cleanTitle;
                });
                if (typeof renderTabs === 'function') renderTabs();
            }

            // Write title + autoNamed flag to storage atomically.
            // Retry if the session record hasn't been flushed yet (race on first message).
            const tryWriteTitle = async (attemptsLeft) => {
                const freshResult = await chrome.storage.local.get([ChatHistoryManager.STORAGE_KEY]);
                const freshSessions = freshResult[ChatHistoryManager.STORAGE_KEY] || {};
                if (freshSessions[sessionId]) {
                    freshSessions[sessionId].title = cleanTitle;
                    freshSessions[sessionId].autoNamed = true;
                    await chrome.storage.local.set({ [ChatHistoryManager.STORAGE_KEY]: freshSessions });
                    // Re-render after confirmed storage write
                    if (typeof renderRecentChatsSidebar === 'function') renderRecentChatsSidebar();
                } else if (attemptsLeft > 0) {
                    setTimeout(() => tryWriteTitle(attemptsLeft - 1), 400);
                } else {
                    // Exhausted retries — still render to clear the skeleton
                    if (typeof renderRecentChatsSidebar === 'function') renderRecentChatsSidebar();
                }
            };
            await tryWriteTitle(8);
        } else {
            console.warn('[AutoNaming] Title generation failed:', response?.error);
            if (typeof renderRecentChatsSidebar === 'function') renderRecentChatsSidebar();
        }
    });
}

// Sidebar Tooltip Implementation
(function () {
    let sidebarTooltipEl = null;

    function showSidebarTooltip(e) {
        const item = e.target.closest('.recent-chat-item');
        if (!item) return;

        const titleEl = item.querySelector('.recent-chat-item__title');
        if (!titleEl) return;

        // Only show if the title text is actually truncated
        const isTruncated = titleEl.scrollWidth > titleEl.clientWidth;
        if (!isTruncated) return;

        const titleText = item.getAttribute('data-title') || titleEl.textContent;
        if (!titleText) return;

        if (!sidebarTooltipEl) {
            sidebarTooltipEl = document.createElement('div');
            sidebarTooltipEl.className = 'lumina-sidebar-tooltip';
            document.body.appendChild(sidebarTooltipEl);
        }

        sidebarTooltipEl.textContent = titleText;

        const itemRect = item.getBoundingClientRect();

        // Position on the right side of the item
        const left = itemRect.right + 10;
        sidebarTooltipEl.style.left = `${left}px`;

        // Make it visible to calculate height
        sidebarTooltipEl.classList.add('visible');

        const actualHeight = sidebarTooltipEl.offsetHeight;
        const top = itemRect.top + (itemRect.height - actualHeight) / 2;
        sidebarTooltipEl.style.top = `${top}px`;
    }

    function hideSidebarTooltip(e) {
        if (sidebarTooltipEl) {
            sidebarTooltipEl.classList.remove('visible');
        }
    }

    // Use event delegation for dynamic elements
    document.addEventListener('mouseover', (e) => {
        if (e.target.closest('.recent-chat-item')) {
            showSidebarTooltip(e);
        }
    });

    document.addEventListener('mouseout', (e) => {
        if (e.target.closest('.recent-chat-item')) {
            hideSidebarTooltip(e);
        }
    });

    // ── Lumina Canvas Implementation ──────────────────────────────────
    window.LuminaCanvas = {
        currentDoc: {
            name: '',
            type: '',
            content: '',
            comments: []
        },

        handleStream(text) {
            // 1. Detect <lumina-canvas-create>
            const createRegex = /<lumina-canvas-create\s+name="([^"]+)"\s+type="([^"]+)">([\s\S]*?)(?:<\/lumina-canvas-create>|$)/i;
            const createMatch = text.match(createRegex);
            if (createMatch) {
                const name = createMatch[1];
                const type = createMatch[2];
                const content = createMatch[3];

                this.showCanvas();
                this.setDocument(name, type, content);
                return;
            }

            // 2. Detect <lumina-canvas-update>
            const updateRegex = /<lumina-canvas-update\s+name="([^"]+)">([\s\S]*?)(?:<\/lumina-canvas-update>|$)/i;
            const updateMatch = text.match(updateRegex);
            if (updateMatch) {
                const name = updateMatch[1];
                const body = updateMatch[2];

                const patternMatch = body.match(/<pattern>([\s\S]*?)<\/pattern>/i);
                const replacementMatch = body.match(/<replacement>([\s\S]*?)(?:<\/replacement>|$)/i);

                if (patternMatch && replacementMatch) {
                    const pattern = patternMatch[1];
                    const replacement = replacementMatch[2];
                    this.applyUpdate(name, pattern, replacement, false);
                }
            }
        },

        handleDone(text) {
            const updateRegex = /<lumina-canvas-update\s+name="([^"]+)">([\s\S]*?)<\/lumina-canvas-update>/gi;
            let match;
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

        showCanvas() {
            if (!isSplitMode) {
                toggleSplitMode();
            }
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
            if (isSplitMode) {
                toggleSplitMode();
            }
        },

        setDocument(name, type, content) {
            this.currentDoc.name = name;
            this.currentDoc.type = type;
            this.currentDoc.content = content;

            const titleInput = document.getElementById('lumina-canvas-title');
            const typeBadge = document.getElementById('lumina-canvas-type-badge');
            const editorTextarea = document.getElementById('lumina-canvas-editor');
            const documentView = document.getElementById('lumina-canvas-document');
            const codeTabBtn = document.getElementById('lumina-canvas-tab-code');
            const previewTabBtn = document.getElementById('lumina-canvas-tab-preview');
            const container = document.querySelector('.lumina-canvas-container');

            if (titleInput) titleInput.value = name;
            if (typeBadge) {
                typeBadge.textContent = type.replace('code/', '').toUpperCase();
            }
            if (editorTextarea) {
                editorTextarea.value = content;
            }
            this.syncHighlighting(content);
            if (documentView) {
                if (typeof marked !== 'undefined') {
                    documentView.innerHTML = marked.parse(content);
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
                if (type === 'document') {
                    codeTabBtn.textContent = 'Edit';
                } else {
                    codeTabBtn.textContent = 'Code';
                }
                codeTabBtn.style.display = 'block';
            }

            if (previewTabBtn) {
                if (type === 'document') {
                    previewTabBtn.textContent = 'Preview';
                    previewTabBtn.style.display = 'block';
                } else if (type === 'code/html' || type === 'code/react' || type.includes('html')) {
                    previewTabBtn.textContent = 'Preview';
                    previewTabBtn.style.display = 'block';
                } else {
                    previewTabBtn.style.display = 'none';
                }
            }

            this.switchTab('code');
            this.updatePreview();
        },

        applyUpdate(name, pattern, replacement, isFinal) {
            let currentContent = this.currentDoc.content;
            let newContent = currentContent;

            if (pattern === '.*') {
                newContent = replacement;
            } else {
                try {
                    const regex = new RegExp(pattern, 'g');
                    newContent = currentContent.replace(regex, replacement);
                } catch (e) {
                    console.error('[Lumina Canvas] Regex error:', e);
                }
            }

            this.currentDoc.content = newContent;

            const editorTextarea = document.getElementById('lumina-canvas-editor');
            if (editorTextarea) {
                editorTextarea.value = newContent;
            }
            this.syncHighlighting(newContent);

            const documentView = document.getElementById('lumina-canvas-document');
            if (documentView && this.currentDoc.type === 'document') {
                if (typeof marked !== 'undefined') {
                    documentView.innerHTML = marked.parse(newContent);
                } else {
                    documentView.textContent = newContent;
                }
            }

            if (isFinal) {
                this.updatePreview();
            }
        },

        updatePreview() {
            const previewFrame = document.getElementById('lumina-canvas-preview-frame');
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
                console.error('[Lumina Canvas] Preview injection error:', e);
            }
        },

        switchTab(tabId) {
            const codeTabBtn = document.getElementById('lumina-canvas-tab-code');
            const previewTabBtn = document.getElementById('lumina-canvas-tab-preview');
            const codePanel = document.getElementById('lumina-canvas-code-panel');
            const documentPanel = document.getElementById('lumina-canvas-document-panel');
            const previewPanel = document.getElementById('lumina-canvas-preview-panel');

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
                    const documentView = document.getElementById('lumina-canvas-document');
                    if (documentView && typeof marked !== 'undefined') {
                        documentView.innerHTML = marked.parse(this.currentDoc.content);
                    }
                } else {
                    if (previewPanel) previewPanel.classList.add('active');
                    this.updatePreview();
                }
            }
        },

        syncHighlighting(code) {
            const codeEl = document.getElementById('lumina-canvas-highlight-code');
            if (codeEl) {
                const escaped = code
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;');
                codeEl.innerHTML = escaped.endsWith('\n') ? escaped + ' ' : escaped;
                if (typeof hljs !== 'undefined') {
                    let lang = (this.currentDoc.type || 'javascript').replace('code/', '');
                    if (lang === 'react') lang = 'jsx';
                    codeEl.className = lang;
                    hljs.highlightElement(codeEl);
                }
            }
        },

        init() {
            const closeBtn = document.getElementById('lumina-canvas-btn-close');
            if (closeBtn) {
                closeBtn.onclick = () => this.hideCanvas();
            }

            const codeTabBtn = document.getElementById('lumina-canvas-tab-code');
            if (codeTabBtn) {
                codeTabBtn.onclick = () => this.switchTab('code');
            }

            const previewTabBtn = document.getElementById('lumina-canvas-tab-preview');
            if (previewTabBtn) {
                previewTabBtn.onclick = () => this.switchTab('preview');
            }

            const saveLocalDoc = () => {
                const activeTab = tabs[activeTabIndex];
                const sessionId = activeTab ? activeTab.sessionId : 'global';
                const key = `lumina-canvas-${sessionId}-${this.currentDoc.name}`;
                localStorage.setItem(key, JSON.stringify({
                    name: this.currentDoc.name,
                    type: this.currentDoc.type,
                    content: this.currentDoc.content
                }));
            };

            const titleInput = document.getElementById('lumina-canvas-title');
            if (titleInput) {
                titleInput.oninput = () => {
                    const oldName = this.currentDoc.name;
                    const newName = titleInput.value;
                    this.currentDoc.name = newName;

                    const activeTab = tabs[activeTabIndex];
                    const sessionId = activeTab ? activeTab.sessionId : 'global';
                    localStorage.removeItem(`lumina-canvas-${sessionId}-${oldName}`);
                    saveLocalDoc();
                };
            }

            const textarea = document.getElementById('lumina-canvas-editor');
            const pre = document.getElementById('lumina-canvas-highlight-block');
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

        loadVersionFromCard(card) {
            const cardTitle = card.querySelector('.lumina-canvas-card-title')?.textContent || '';
            if (!cardTitle) return;

            const activeTab = tabs[activeTabIndex];
            const sessionId = activeTab ? activeTab.sessionId : 'global';

            const localSaved = localStorage.getItem(`lumina-canvas-${sessionId}-${cardTitle}`);
            if (localSaved) {
                try {
                    const parsed = JSON.parse(localSaved);
                    this.showCanvas();
                    this.setDocument(parsed.name, parsed.type, parsed.content);
                    return;
                } catch (e) {
                    console.error('[Lumina Canvas] Error loading local saved doc:', e);
                }
            }

            const chatHistory = document.getElementById('chat-history') || document.getElementById('chat-history-secondary');
            if (!chatHistory) return;

            const allAnswers = Array.from(chatHistory.querySelectorAll('.lumina-chat-answer'));

            let docName = '';
            let docType = '';
            let docContent = '';

            allAnswers.forEach(ans => {
                const rawText = ans.getAttribute('data-raw-text') || '';

                const createRegex = /<lumina-canvas-create\s+name="([^"]+)"\s+type="([^"]+)">([\s\S]*?)<\/lumina-canvas-create>/gi;
                let createMatch;
                while ((createMatch = createRegex.exec(rawText)) !== null) {
                    if (createMatch[1] === cardTitle) {
                        docName = createMatch[1];
                        docType = createMatch[2];
                        docContent = createMatch[3];
                    }
                }

                const updateRegex = /<lumina-canvas-update\s+name="([^"]+)">([\s\S]*?)<\/lumina-canvas-update>/gi;
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
                                } catch (e) {
                                    console.error('[Lumina Canvas] Regex history parse error:', e);
                                }
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

    window.LuminaCanvas.init();

    document.addEventListener('click', (e) => {
        const card = e.target.closest('.lumina-canvas-card');
        if (card) {
            const paneSec = document.getElementById('pane-secondary');
            const isActive = paneSec && paneSec.classList.contains('canvas-active') && isSplitMode;
            if (isActive) {
                const currentTitleInput = document.getElementById('lumina-canvas-title');
                const cardTitle = card.querySelector('.lumina-canvas-card-title')?.textContent || '';
                if (currentTitleInput && currentTitleInput.value === cardTitle) {
                    window.LuminaCanvas.hideCanvas();
                    return;
                }
            }
            window.LuminaCanvas.loadVersionFromCard(card);
        }
    });
})();


