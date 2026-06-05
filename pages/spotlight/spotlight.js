
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

function updateUrlSessionId(sessionId) {
    if (!sessionId) return;
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('session_id') !== sessionId) {
        urlParams.set('session_id', sessionId);
        const newUrl = window.location.pathname + '?' + urlParams.toString();
        window.history.pushState({ path: newUrl }, '', newUrl);
    }
}

const STORAGE_PREFIX = isSidePanel ? 'sidepanel' : 'spotlight';
const KEYS = {
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


let tabs = [];
let tabGroups = []; 
let activeGroupIndex = -1;
let activeTabIndex = -1; 
let tabCounter = 1;

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

function redirectToPinnedQuestion() {
    const targetTab = getShortcutTargetTab();
    const targetUI = targetTab?.chatUIInstance;
    if (!targetUI) return;

    if (typeof targetUI.refreshPinnedQuestionState === 'function') {
        targetUI.refreshPinnedQuestionState();
    }

    if (typeof targetUI._scrollToPinnedQuestion === 'function') {
        targetUI._scrollToPinnedQuestion();
    }
}

let isSplitMode = false; 
let secondaryActiveTabIndex = -1; 
let resizerDragging = false;
let sidebarTargetTabId = null; 
let splitHoverTimer = null;
let splitHoverTargetIndex = -1;
let isApplyingSplit = false;

let port = null;
let shortcuts = {};
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
    if (!container) return null;

    const pane = container.closest('.spotlight-pane');
    if (pane && pane.id === 'pane-secondary') {
        return secondaryActiveTabIndex >= 0 && tabs[secondaryActiveTabIndex] ? tabs[secondaryActiveTabIndex].id : null;
    }

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



async function fetchFreshWebContent(tabId) {
    const tabInfo = await chrome.tabs.get(parseInt(tabId)).catch(() => null);
    if (!tabInfo || tabInfo.status !== 'complete') return null;

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

        
        const affectedTabs = spotlightTabId
            ? tabs.filter(t => t.id === spotlightTabId)
            : tabs;
        affectedTabs.forEach(t => {
            if (t.chatUIInstance) t.chatUIInstance._throttledUpdateTokenCount();
        });
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
                tabs.forEach(t => { if (t.chatUIInstance) t.chatUIInstance._throttledUpdateTokenCount(); });
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

function showTopbarLoading() {
    const bar = document.getElementById('topbar-progress');
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

function hideTopbarLoading() {
    const bar = document.getElementById('topbar-progress');
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
    showTopbarLoading();
    if (tab?.historyEl) {
        tab.historyEl.style.opacity = '0';
        tab.historyEl.style.transition = 'none';
    }
    const performRestore = async () => {
        if (tab?.historyEl?.__processingPromises) {
            try {
                await Promise.all(tab.historyEl.__processingPromises);
            } catch (e) {}
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
        hideTopbarLoading();
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
                return t.title !== meta.title || t.sessionId !== meta.sessionId;
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
                        const sessionChanged = existing.sessionId !== meta.sessionId;
                        existing.title = meta.title;
                        existing.sessionId = meta.sessionId;

                        if (sessionChanged) {
                            const historyKey = `spotlight_history_${meta.sessionId}`;
                            const historyData = await chrome.storage.local.get([historyKey]);
                            if (existing.rawHistoryHtml !== undefined && existing.rawHistoryHtml !== null) {
                                existing.rawHistoryHtml = historyData[historyKey] || '';
                            } else if (existing.historyEl) {
                                existing.historyEl.innerHTML = historyData[historyKey] || '';
                                normalizeRestoredHistory(existing.historyEl);
                                if (existing.chatUIInstance) existing.chatUIInstance.syncStateFromDOM();
                            }
                        }
                    } else {
                        const historyEl = document.createElement('div');
                        historyEl.className = 'lumina-chat-scroll-content';
                        historyEl.style.display = 'none';
                        const primaryContainer = document.querySelector('#pane-primary .lumina-chat-container') || container;
                        primaryContainer.appendChild(historyEl);

                        const historyKey = `spotlight_history_${meta.sessionId}`;
                        const historyData = await chrome.storage.local.get([historyKey]);
                        const historyHtml = historyData[historyKey] || '';

                        const newTab = {
                            id: meta.id,
                            title: meta.title || 'New Tab',
                            sessionId: meta.sessionId,
                            historyEl: historyEl,
                            chatUIInstance: new LuminaChatUI(container, {
                                isSpotlight: true,
                                skipInputSetup: true,
                                onSubmit: (text, images, extra) => handleSubmit(text, images, extra, newTab)
                            }),
                            rawHistoryHtml: historyHtml
                        };
                        newTab.chatUIInstance.historyEl = historyEl;
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
        if (key.startsWith('spotlight_history_')) {
            const sid = key.replace('spotlight_history_', '');

            
            const affected = tabs.filter(t => t.sessionId === sid);
            if (affected.length > 0) {
                
                const isGeneratingLocally = (sharedInputUI && sharedInputUI.isGenerating && streamingTab && streamingTab.sessionId === sid);

                if (!isGeneratingLocally) {
                    const newHtml = changes[key].newValue;
                    if (newHtml) {
                        affected.forEach(tab => {
                            if (tab.rawHistoryHtml !== undefined && tab.rawHistoryHtml !== null) {
                                tab.rawHistoryHtml = newHtml;
                                return;
                            }
                            if (tab.historyEl && tab.historyEl.innerHTML !== newHtml) {
                                
                                
                                const hasLocalMinHeight = tab.historyEl.querySelector('.lumina-dict-entry[style*="min-height"]');
                                if (hasLocalMinHeight && !newHtml.includes('min-height')) {
                                    return;
                                }

                                
                                const wasAtBottom = Math.abs(tab.historyEl.scrollHeight - tab.historyEl.scrollTop - tab.historyEl.clientHeight) < 30;
                                const savedScrollTop = tab.historyEl.scrollTop;

                                tab.historyEl.innerHTML = newHtml;
                                normalizeRestoredHistory(tab.historyEl);
                                if (tab.chatUIInstance) tab.chatUIInstance.syncStateFromDOM();

                                
                                const entries = tab.historyEl.querySelectorAll('.lumina-dict-entry');
                                const lastEntry = entries[entries.length - 1];
                                if (lastEntry && tab.chatUIInstance) {
                                    tab.chatUIInstance.clearEntryMargins(lastEntry);
                                    tab.chatUIInstance.adjustEntryMargin(lastEntry, 'immediate');
                                }

                                
                                if (!wasAtBottom) {
                                    tab.historyEl.scrollTop = savedScrollTop;
                                } else {
                                    
                                    requestAnimationFrame(() => {
                                        if (tab.historyEl) {
                                            tab.historyEl.scrollTop = tab.historyEl.scrollHeight;
                                        }
                                    });
                                }

                                
                                tab.historyEl.querySelectorAll('.lumina-chat-answer, .lumina-translation-container, .lumina-answer-versions').forEach(ans => {
                                    LuminaChatUI.processContainer(ans);
                                });

                                
                                tab.historyEl.querySelectorAll('.lumina-dict-entry[data-entry-type="translation"]').forEach(entry => {
                                    LuminaChatUI._setupTranslationHighlight(entry);
                                    LuminaChatUI.balanceTranslationCard(entry, false);
                                });
                            }
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
            const tabsToClose = tabs.filter(t => t.sessionId && deletedIds.includes(t.sessionId));

            if (tabsToClose.length > 0) {

                
                tabsToClose.forEach(tab => {
                    if (tab.historyEl) tab.historyEl.remove();
                    tabGroups.forEach(g => {
                        g.tabIds = g.tabIds.filter(id => id !== tab.id);
                    });
                });

                
                tabs = tabs.filter(t => !tabsToClose.includes(t));

                
                tabGroups = tabGroups.filter(g => g.tabIds.length > 0);

                if (tabs.length === 0) {
                    createTab();
                } else {
                    
                    const idMap = {};
                    tabs.forEach((t, i) => {
                        const newId = `tab-${i + 1}`;
                        idMap[t.id] = newId;
                        t.id = newId;
                        if (t.historyEl) t.historyEl.id = `chat-history-tab-${i + 1}`;
                    });
                    tabGroups.forEach(g => {
                        g.tabIds = g.tabIds.map(id => idMap[id] || id);
                    });
                    tabCounter = tabs.length;

                    
                    if (activeGroupIndex >= tabGroups.length) {
                        activeGroupIndex = Math.max(0, tabGroups.length - 1);
                    }

                    renderTabs();
                    if (typeof renderSidebarTabs === 'function') renderSidebarTabs();
                    switchGroup(activeGroupIndex);
                    saveTabsState();
                }
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

function ensureTabHistoryLoaded(tab) {
    if (tab && tab.rawHistoryHtml) {
        const historyEl = tab.historyEl;
        historyEl.innerHTML = tab.rawHistoryHtml;
        tab.rawHistoryHtml = null;
        normalizeRestoredHistory(historyEl);
        historyEl.__processingPromises = Array.from(
            historyEl.querySelectorAll('.lumina-chat-answer, .lumina-translation-container, .lumina-answer-versions')
        ).map(ans => LuminaChatUI.processContainer(ans));
        historyEl.querySelectorAll('.lumina-trans-sentence').forEach(s => s.classList.remove('hovered'));
        historyEl.querySelectorAll('.lumina-dict-entry[data-entry-type="translation"]').forEach(entry => {
            LuminaChatUI._setupTranslationHighlight(entry);
            LuminaChatUI.balanceTranslationCard(entry);
        });
    }
}

async function initTabs() {
    const topBar = document.getElementById('spotlight-topbar');
    if (topBar) {
        topBar.style.display = 'flex';
    }

    const primaryContainer = document.querySelector('#pane-primary .lumina-chat-container') || container;
    const secondaryContainer = document.querySelector('#pane-secondary .lumina-chat-container');
    [primaryContainer, secondaryContainer].forEach(c => {
        if (!c) return;
        c.querySelectorAll('.lumina-chat-scroll-content').forEach(el => el.remove());
    });

    tabs = [];

    const initialHistory = document.createElement('div');
    initialHistory.id = 'chat-history';
    initialHistory.className = 'lumina-chat-scroll-content';
    initialHistory.style.display = 'none';
    primaryContainer.appendChild(initialHistory);

    try {
        const data = await chrome.storage.local.get([
            KEYS.tabs,
            KEYS.activeTabIndex,
            'lumina_youtube_trigger'
        ]);

        const urlParams = new URLSearchParams(window.location.search);
        const urlSessionId = urlParams.get('session_id');

        let savedTab = null;
        if (data[KEYS.tabs] && data[KEYS.tabs].length > 0) {
            const activeIdx = data[KEYS.activeTabIndex] || 0;
            savedTab = data[KEYS.tabs][activeIdx] || data[KEYS.tabs][0];
        }

        let sessionId;
        let historyHtml = '';
        let tabTitle = 'Chat';

        if (urlSessionId) {
            sessionId = urlSessionId;
            const historyKey = `spotlight_history_${sessionId}`;
            const historyData = await chrome.storage.local.get([historyKey]);
            historyHtml = historyData[historyKey] || '';

            const result = await chrome.storage.local.get([ChatHistoryManager.STORAGE_KEY]);
            const sessions = result[ChatHistoryManager.STORAGE_KEY] || {};
            const meta = sessions[urlSessionId] || {};
            tabTitle = meta.title || 'Chat';

            if (!historyHtml) {
                const contentKey = `lumina_session_${urlSessionId}`;
                const contentData = await chrome.storage.local.get([contentKey]);
                const messages = contentData[contentKey];
                if (messages) {
                    const chatData = {
                        ...meta,
                        messages: messages,
                        sessionId: sessionId,
                        timestamp: meta.createdAt || meta.updatedAt
                    };
                    await ChatHistoryManager.restoreChat(chatData, initialHistory);
                    normalizeRestoredHistory(initialHistory);
                }
            }
        } else {
            sessionId = savedTab?.sessionId || ('session_' + Date.now() + Math.random().toString(36).substr(2, 5));
            const historyKey = `spotlight_history_${sessionId}`;
            const historyData = await chrome.storage.local.get([historyKey]);
            historyHtml = historyData[historyKey] || '';
            tabTitle = savedTab?.title || 'Chat';
        }

        const singleTab = {
            id: 'tab-1',
            title: tabTitle,
            sessionId: sessionId,
            scrollTop: savedTab?.scrollTop ?? -1,
            scrollAnchorIndex: savedTab?.scrollAnchorIndex ?? null,
            scrollAnchorOffset: savedTab?.scrollAnchorOffset ?? null,
            isAtBottom: savedTab?.isAtBottom ?? true,
            restoreLatestOnOpen: true,
            historyEl: initialHistory,
            chatUIInstance: new LuminaChatUI(container, {
                isSpotlight: true,
                skipInputSetup: true,
                onSubmit: (text, images, extra) => handleSubmit(text, images, extra, singleTab)
            }),
            rawHistoryHtml: historyHtml
        };
        singleTab.chatUIInstance.historyEl = initialHistory;
        initialHistory.dataset.sessionId = singleTab.sessionId;
        singleTab.chatUIInstance.initListeners(initialHistory);
        bindHistoryScroll(singleTab);
        tabs.push(singleTab);

        ensureTabHistoryLoaded(singleTab);
        initialHistory.style.display = 'block';

        activeTabIndex = 0;
        activeGroupIndex = 0;
        tabGroups = [{ id: 'group-1', tabIds: ['tab-1'], ratio: 100 }];

        scheduleScrollRestore(singleTab);

        const modelData = await chrome.storage.local.get(['lastUsedModel']);
        if (modelData.lastUsedModel && modelData.lastUsedModel.model) {
            singleTab.selectedModel = { ...modelData.lastUsedModel };
            if (singleTab.chatUIInstance) {
                singleTab.chatUIInstance.activeTabModel = { ...modelData.lastUsedModel };
            }
        }

        if (data.lumina_youtube_trigger) {
            setTimeout(() => handleYouTubeTrigger(data.lumina_youtube_trigger), 100);
        }
    } catch (e) {
        console.error('[Spotlight] initTabs failed:', e);
    }

    
    const primaryC = document.querySelector('#pane-primary .lumina-chat-container') || container;
    const secondaryC = document.querySelector('#pane-secondary .lumina-chat-container');
    bindContainerWheelForward(primaryC);
    if (secondaryC) bindContainerWheelForward(secondaryC);

    
    const newTabBtn = document.getElementById('new-tab-btn');
    if (newTabBtn) {
        const newBtn = newTabBtn.cloneNode(true);
        newTabBtn.parentNode.replaceChild(newBtn, newTabBtn);
        newBtn.addEventListener('click', () => createTab());
    }

    const topbarNewChatBtn = document.getElementById('topbar-new-chat-btn');
    if (topbarNewChatBtn) {
        topbarNewChatBtn.addEventListener('click', () => createTab());
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
                topbarDropdown.style.display = 'flex';
                topbarDropdown.classList.remove('expanded');
                renderDropdownMenu();
            }
        });

        document.addEventListener('click', (e) => {
            if (!topbarDropdown.contains(e.target) && e.target !== topbarMoreBtn) {
                topbarDropdown.style.display = 'none';
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
}

function createTab(switchToIt = true) {
    resetChat();
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

        if (oldPrimary && sharedInputUI?.getInputState) oldPrimary.inputState = sharedInputUI.getInputState();
        if (oldSecondary && sharedInputUISecondary?.getInputState) oldSecondary.inputStateSecondary = sharedInputUISecondary.getInputState();
    }

    previousPrimaryTab?.chatUIInstance?._detachPinnedQuestionChip?.();
    previousSecondaryTab?.chatUIInstance?._detachPinnedQuestionChip?.();

    
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

    isSplitMode = !!secondaryTab;

    const divider = document.getElementById('pane-divider');
    const secondaryPane = document.getElementById('pane-secondary');
    const primaryPane = document.getElementById('pane-primary');

    if (isSplitMode) {
        secondaryActiveTabIndex = tabs.indexOf(secondaryTab);

        if (divider) divider.style.display = 'block';
        if (secondaryPane) secondaryPane.style.display = 'flex';

        const ratio = group.ratio || 50;
        primaryPane.style.flex = ratio;
        secondaryPane.style.flex = (100 - ratio);

        
        const primaryContainer = document.querySelector('#pane-primary .lumina-chat-container');
        primaryContainer.appendChild(primaryTab.historyEl);
        primaryTab.historyEl.style.display = 'block';

        chatUI = primaryTab.chatUIInstance;
        chatUI.inputPaneEl = document.getElementById('input-area-primary');
        if (sharedInputUI) {
            sharedInputUI.historyEl = primaryTab.historyEl;
            sharedInputUI.restoreInputState(primaryTab.inputState || null);
            sharedInputUI.activeTabModel = primaryTab.selectedModel ? { ...primaryTab.selectedModel } : null;
            if (typeof sharedInputUI.refreshModelSelector === 'function') sharedInputUI.refreshModelSelector();
        }
        syncTabUI(primaryTab, false, skipScrollRestore);
        primaryTab.chatUIInstance?.refreshPinnedQuestionState?.();

        
        const secondaryContainer = document.querySelector('#pane-secondary .lumina-chat-container');
        secondaryContainer.appendChild(secondaryTab.historyEl);
        secondaryTab.historyEl.style.display = 'block';
        bindContainerWheelForward(secondaryContainer);

        chatUISecondary = secondaryTab.chatUIInstance;
        chatUISecondary.inputPaneEl = document.getElementById('input-area-secondary');
        if (sharedInputUISecondary) {
            sharedInputUISecondary.historyEl = secondaryTab.historyEl;
            sharedInputUISecondary.restoreInputState(secondaryTab.inputStateSecondary || null);
            sharedInputUISecondary.activeTabModel = secondaryTab.selectedModel ? { ...secondaryTab.selectedModel } : null;
            if (typeof sharedInputUISecondary.refreshModelSelector === 'function') sharedInputUISecondary.refreshModelSelector();
        }
        syncTabUI(secondaryTab, true, skipScrollRestore);
        secondaryTab.chatUIInstance?.refreshPinnedQuestionState?.();

    } else {
        secondaryActiveTabIndex = -1;

        if (divider) divider.style.display = 'none';
        if (secondaryPane) secondaryPane.style.display = 'none';
        primaryPane.style.flex = '1';

        
        const primaryContainer = document.querySelector('#pane-primary .lumina-chat-container');
        primaryContainer.appendChild(primaryTab.historyEl);
        primaryTab.historyEl.style.display = 'block';

        chatUI = primaryTab.chatUIInstance;
        chatUI.inputPaneEl = document.getElementById('input-area-primary');
        if (sharedInputUI) {
            sharedInputUI.historyEl = primaryTab.historyEl;
            sharedInputUI.restoreInputState(primaryTab.inputState || null);
            sharedInputUI.activeTabModel = primaryTab.selectedModel ? { ...primaryTab.selectedModel } : null;
            if (typeof sharedInputUI.refreshModelSelector === 'function') sharedInputUI.refreshModelSelector();
        }
        syncTabUI(primaryTab, false, skipScrollRestore);
        primaryTab.chatUIInstance?.refreshPinnedQuestionState?.();
    }

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

    if (!isSecondary) {
        const regenBtn = document.querySelector('#pane-primary #lumina-regenerate-btn') ||
            document.getElementById('lumina-regenerate-btn');
        if (regenBtn) {
            const hasEntry = tab.historyEl.querySelector('.lumina-dict-entry, .lumina-translation-card');
            regenBtn.style.display = hasEntry ? 'flex' : 'none';
        }
    } else {
        const regenBtn = document.querySelector('#pane-secondary #lumina-regenerate-btn');
        if (regenBtn) {
            const hasEntry = tab.historyEl.querySelector('.lumina-dict-entry, .lumina-translation-card');
            regenBtn.style.display = hasEntry ? 'flex' : 'none';
        }
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
    if (activeGroupIndex < 0 || activeGroupIndex >= tabGroups.length) return;
    const group = tabGroups[activeGroupIndex];
    if (group.tabIds.length < 2) return;

    
    const expelledTabId = group.tabIds[1];
    group.tabIds = [group.tabIds[0]];

    tabGroups.splice(activeGroupIndex + 1, 0, { id: `group-${groupCounter++}`, tabIds: [expelledTabId], ratio: 50 });

    switchGroup(activeGroupIndex);
    saveTabsState();
}

function setupResizer() {
    const divider = document.getElementById('pane-divider');
    const overlay = document.getElementById('resizing-overlay');
    const primaryPane = document.getElementById('pane-primary');
    const secondaryPane = document.getElementById('pane-secondary');

    if (!divider || !overlay) return;

    let lastMouseDownTime = 0;
    let lastMouseDownX = 0;

    divider.onmousedown = (e) => {
        const now = Date.now();
        const timeSinceLast = now - lastMouseDownTime;
        const moveSinceLast = Math.abs(e.clientX - lastMouseDownX);

        
        if (timeSinceLast < 400 && moveSinceLast < 5) {
            lastMouseDownTime = 0; 
            if (!isSplitMode) return;
            const group = tabGroups[activeGroupIndex];
            if (!group || group.tabIds.length < 2) return;

            const tab0 = tabs.find(t => t.id === group.tabIds[0]); 
            const tab1 = tabs.find(t => t.id === group.tabIds[1]); 

            
            if (tab0 && sharedInputUI?.getInputState) tab0.inputState = sharedInputUI.getInputState();
            if (tab1 && sharedInputUISecondary?.getInputState) tab1.inputStateSecondary = sharedInputUISecondary.getInputState();

            
            [group.tabIds[0], group.tabIds[1]] = [group.tabIds[1], group.tabIds[0]];

            
            group.ratio = 100 - (group.ratio || 50);

            
            
            
            if (tab0 && tab1) {
                const promoted = tab1.inputStateSecondary;
                const demoted = tab0.inputState;
                tab1.inputState = promoted;
                tab0.inputStateSecondary = demoted;
            }

            switchGroup(activeGroupIndex);
            saveTabsState();
            return;
        }

        lastMouseDownTime = now;
        lastMouseDownX = e.clientX;

        resizerDragging = true;
        divider.classList.add('dragging');
        overlay.style.display = 'block';

        const SNAP_CENTER = 50;
        const SNAP_ZONE = 2; 

        const onMouseMove = (moveEvent) => {
            if (!resizerDragging) return;
            const containerWidth = document.getElementById('spotlight-main-area').clientWidth;
            let ratio = (moveEvent.pageX / containerWidth) * 100;
            ratio = Math.max(20, Math.min(80, ratio)); 

            
            if (Math.abs(ratio - SNAP_CENTER) <= SNAP_ZONE) {
                ratio = SNAP_CENTER;
                divider.classList.add('snapped');
            } else {
                divider.classList.remove('snapped');
            }

            primaryPane.style.flex = ratio;
            secondaryPane.style.flex = (100 - ratio);

            
            if (activeGroupIndex >= 0 && activeGroupIndex < tabGroups.length) {
                tabGroups[activeGroupIndex].ratio = ratio;
            }
        };

        const onMouseUp = () => {
            resizerDragging = false;
            divider.classList.remove('dragging');
            divider.classList.remove('snapped');
            overlay.style.display = 'none';
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            saveTabsState();
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    };
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

function saveTabsState() {
    const tabsMetadata = tabs.map(tab => ({
        id: tab.id,
        title: tab.title,
        sessionId: tab.sessionId,
        scrollTop: tab.historyEl ? tab.historyEl.scrollTop : (tab.scrollTop ?? -1),
        scrollAnchorIndex: tab.scrollAnchorIndex,
        scrollAnchorOffset: tab.scrollAnchorOffset,
        isAtBottom: !!tab.isAtBottom
    }));

    chrome.storage.local.set({
        [KEYS.tabs]: tabsMetadata,
        [KEYS.tabCounter]: tabCounter, 
        [KEYS.activeTabIndex]: activeTabIndex, 
        [KEYS.tabGroups]: tabGroups,
        [KEYS.activeGroupIndex]: activeGroupIndex,
        [KEYS.groupCounter]: groupCounter
    });

    
    tabs.forEach(tab => {
        if (tab.sessionId) {
            if (tab.rawHistoryHtml) {
                return;
            }
            if (tab.historyEl) {
                const historyHTML = tab.chatUIInstance?.serializeHistoryHTML?.() || tab.historyEl.innerHTML;
                chrome.storage.local.set({ [`spotlight_history_${tab.sessionId}`]: historyHTML });
                if (typeof ChatHistoryManager !== 'undefined') {
                    ChatHistoryManager.saveCurrentChat(tab.historyEl, tab.sessionId);
                }
            }
        }
    });
}

function normalizeRestoredHistory(historyEl) {
    if (!historyEl) return;

    historyEl.querySelectorAll('.lumina-dict-entry').forEach(entry => {
        
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
            onSubmit: (query, displayQuery, isDictionary, sourceEntry, range, isTranslate) => {
                if (isDictionary || isTranslate) {
                    const selection = window.getSelection();
                    const text = selection.toString().trim() || displayQuery;
                    if (text) {
                        const finalRange = range || (selection.rangeCount > 0 ? selection.getRangeAt(0) : null);
                        const rect = finalRange ? finalRange.getBoundingClientRect() : { left: window.innerWidth / 2, bottom: window.innerHeight / 2 };
                        LuminaDictionaryPopup.show(text, {
                            x: rect.left,
                            y: rect.bottom + 5,
                            source: isTranslate ? 'translate' : 'cambridge'
                        });
                        if (isDictionary) {
                            playSpotlightAudio(text);
                        }
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

                
                if (sourceEntry && targetTab && targetTab.chatUIInstance) {
                    const questionDiv = sourceEntry.querySelector('.lumina-chat-question');
                    if (questionDiv) {
                        setTimeout(() => {
                            targetTab.chatUIInstance._setPinnedQuestion(questionDiv);
                        }, 50);
                    }
                }

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
                    const separator = entry.querySelector('.lumina-dict-separator');
                    if (separator) {
                        entry.insertBefore(btn, separator);
                    } else {
                        entry.appendChild(btn);
                    }

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
                if (window.LuminaSelection) LuminaSelection.hide();
                return;
            }

            
            const isInsideProofread = range && (range.startContainer.parentElement.closest('.lumina-proofread-editable') || range.startContainer.closest?.('.lumina-proofread-editable'));
            if ((!askSelectionPopupEnabled && !isInsideProofread) || text.length === 0) {
                if (window.LuminaSelection) LuminaSelection.hide();
                return;
            }

            
            const commonNode = range.commonAncestorContainer;
            const secondaryPane = document.getElementById('pane-secondary');
            spotlightAskSourcePane = (isSplitMode && secondaryPane && secondaryPane.contains(commonNode))
                ? 'secondary'
                : 'primary';

            if (window.LuminaSelection) {
                LuminaSelection.show(e.clientX, e.clientY, text, range);
            }
        }, 10);
    });
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

    chrome.tabs.query(queryOptions, (tabs) => {
        let activeTab = tabs[0];

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
                    
                    [chatUI, chatUISecondary].forEach(ui => {
                        if (ui && typeof ui._throttledUpdateTokenCount === 'function') ui._throttledUpdateTokenCount();
                    });
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
            
            [chatUI, chatUISecondary].forEach(ui => {
                if (ui && typeof ui._throttledUpdateTokenCount === 'function') ui._throttledUpdateTokenCount();
            });
        } else {
            currentBrowserTab = null;
            pinnedWebSources = [];
            updateWebChips();
            
            [chatUI, chatUISecondary].forEach(ui => {
                if (ui && typeof ui._throttledUpdateTokenCount === 'function') ui._throttledUpdateTokenCount();
            });
        }
        updateWebChips();
        if (webTabPickerEl) {
            refreshWebTabPicker();
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
            } catch (e) {}
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
    titleSpan.textContent = source.displayTitle || (hasMultipleTabs ? source.title : formatHeadTailTitle(source.title || 'Untitled'));
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

    
    initSpotlightAskSelection();

    
    const inputAreaPrimary = document.getElementById('input-area-primary');
    const inputAreaSecondary = document.getElementById('input-area-secondary');

    if (inputAreaPrimary) {
        inputAreaPrimary.innerHTML = LuminaChatUI.getChatInputHTML(true); 
        sharedInputUI = new LuminaChatUI(inputAreaPrimary, {
            isSpotlight: true,
            isPrimaryInput: true,
            alwaysExpanded: true,
            onSubmit: (text, images, extra) => {
                const activeTab = tabs[activeTabIndex];
                if (activeTab) handleSubmit(text, images, extra, activeTab);
            }
        });
    }

    if (inputAreaSecondary) {
        inputAreaSecondary.innerHTML = LuminaChatUI.getChatInputHTML(false);
        sharedInputUISecondary = new LuminaChatUI(inputAreaSecondary, {
            isSpotlight: true,
            isPrimaryInput: true, 
            alwaysExpanded: true,
            onSubmit: (text, images, extra) => {
                const activeTab = tabs[secondaryActiveTabIndex];
                if (activeTab) handleSubmit(text, images, extra, activeTab);
            }
        });
    }

    
    setupResizer();

    
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
    }

    // Initialize topbar model selector
    initTopbarModelSelector();

    setupPort();

    // History loaded directly in initTabs if urlSessionId is present

    
    setupRegenerateButtons();

    
    chrome.storage.local.get(['shortcuts', 'globalDefaults', 'questionMappings', 'askSelectionPopupEnabled', 'readWebpage', 'advancedParamsByModel', 'pendingMicToggle'], (items) => {
        if (items.readWebpage !== undefined) readWebpageEnabled = !!items.readWebpage;
        shortcuts = items.shortcuts || {};
        questionMappings = items.questionMappings || [];
        askSelectionPopupEnabled = items.askSelectionPopupEnabled ?? false;
        advancedParamsByModel = items.advancedParamsByModel || {};
        if (items.globalDefaults && items.globalDefaults.fontSize) {
            applyFontSize(items.globalDefaults.fontSize);
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
            
            chrome.windows.getCurrent((win) => {
                const pendingKey = win ? `pending_sidepanel_query_${win.id}` : null;
                if (pendingKey && changes[pendingKey] && changes[pendingKey].newValue) {
                    processPendingQuery(changes[pendingKey].newValue, pendingKey);
                }
            });

            
            if (changes.shortcuts) shortcuts = changes.shortcuts.newValue || {};
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

        const checkReady = () => {
            const currentTab = tabs[activeTabIndex];
            if (currentTab && !isInitializing) {
                if (queryId) handledQueryIds.add(queryId);

                
                if (sourceTab) {
                    toggleWebSourcePin(sourceTab, true);
                }

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
            if (targetSharedUI) {
                targetSharedUI.activeTabModel = { ...activeTab.selectedModel };
            }
            
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
            chrome.windows.getCurrent((win) => {
                if (win.id === request.windowId) {
                    const { query, displayQuery, queryId, mode, sourceTab } = request;
                    if (queryId && handledQueryIds.has(queryId)) {
                        console.log('[Spotlight] Ignoring duplicate query via message:', queryId);
                        return;
                    }
                    if (queryId) handledQueryIds.add(queryId);

                    
                    if (sourceTab) {
                        toggleWebSourcePin(sourceTab, true);
                    }

                    handleSubmit(query, [], { mode: mode || 'qa' }, tabs[activeTabIndex], displayQuery);
                }
            });
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

        
        const sidebar = document.getElementById('spotlight-sidebar');
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
            const sidebar = document.getElementById('spotlight-sidebar');
            const el = getHoveredInputEl();
            if (el && (!sidebar || !sidebar.classList.contains('active'))) setCursorToEnd(el);
        }, 50);
        setTimeout(() => {
            const sidebar = document.getElementById('spotlight-sidebar');
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

                if (sharedInputUI) {
                    sharedInputUI.isGenerating = false;
                    sharedInputUI._updateActionBtnState();
                }
                if (sharedInputUISecondary) {
                    sharedInputUISecondary.isGenerating = false;
                    sharedInputUISecondary._updateActionBtnState();
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
                    
                    tab.chatUIInstance.appendChunk(msg.chunk, false);
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
                        if (sharedInputUI) {
                            sharedInputUI.isGenerating = false;
                            sharedInputUI._updateActionBtnState();
                        }
                        if (sharedInputUISecondary) {
                            sharedInputUISecondary.isGenerating = false;
                            sharedInputUISecondary._updateActionBtnState();
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

    
    if (sharedInputUI) sharedInputUI.isGenerating = true;
    if (sharedInputUISecondary) sharedInputUISecondary.isGenerating = true;

    
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
        if (sharedInputUI) {
            sharedInputUI.isGenerating = false;
            sharedInputUI._updateActionBtnState();
        }
        if (sharedInputUISecondary) {
            sharedInputUISecondary.isGenerating = false;
            sharedInputUISecondary._updateActionBtnState();
        }
        saveTabsState();
        return;
    }

    if (extra.mode === 'dictionary' || (text && text.match(/^Define: /i))) {
        const word = displayQuery || (text ? text.replace(/^Define: /i, '').trim() : '');
        if (word) {
            await targetChatUI.handleDictionary(word);
            if (sharedInputUI) {
                sharedInputUI.isGenerating = false;
                sharedInputUI._updateActionBtnState();
            }
            if (sharedInputUISecondary) {
                sharedInputUISecondary.isGenerating = false;
                sharedInputUISecondary._updateActionBtnState();
            }
            saveTabsState();
            return;
        }
    }

    if (extra.mode === 'websource') {
        
        tabs.filter(t => t.sessionId === currentTab.sessionId).forEach(t => {
            t.chatUIInstance.openWebSource(extra.source, text);
        });
        if (sharedInputUI) {
            sharedInputUI.isGenerating = false;
            sharedInputUI._updateActionBtnState();
        }
        if (sharedInputUISecondary) {
            sharedInputUISecondary.isGenerating = false;
            sharedInputUISecondary._updateActionBtnState();
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

    const conversationHistory = targetChatUI.gatherMessages(untilEntryId);

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
            ui.showLoading();
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
                ui.showLoading(targetEntry);
            }
        }
    });
    saveTabsState();

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

    // Xây dựng danh sách tab cần lấy nội dung
    let webSourceScope = [];
    if (!isSpotlightWindow && currentBrowserTab && isWebPageUrl(currentBrowserTab.url)) {
        const selection = getWebSelectionForScope(currentTab.id);
        const isCurrentPinned = selection.some(s => String(s.tabId) === String(currentBrowserTab.tabId));
        if (isCurrentPinned) {
            webSourceScope = [
                { tabId: currentBrowserTab.tabId, url: currentBrowserTab.url, title: currentBrowserTab.title || 'Current Tab' }
            ];
        }
    }
    if (shouldReadPage && currentBrowserTab && isWebPageUrl(currentBrowserTab.url)) {
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
            ...((extra.maxTokens !== undefined && extra.maxTokens !== null && extra.maxTokens !== '')
                ? { maxTokens: Number(extra.maxTokens) }
                : {})
        }
    };

    
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
                tab.chatUIInstance.currentAnswerDiv = null;
            });
            if (sharedInputUI) {
                sharedInputUI.isGenerating = false;
                sharedInputUI._updateActionBtnState();
            }
            if (sharedInputUISecondary) {
                sharedInputUISecondary.isGenerating = false;
                sharedInputUISecondary._updateActionBtnState();
            }
        };

        if (sharedInputUI) {
            sharedInputUI.isGenerating = true;
            sharedInputUI.onStop = stopHandler;
            sharedInputUI._updateActionBtnState();
        }
        if (sharedInputUISecondary) {
            sharedInputUISecondary.isGenerating = true;
            sharedInputUISecondary.onStop = stopHandler;
            sharedInputUISecondary._updateActionBtnState();
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
}


async function handleTranslation(text) {
    await chatUI.handleTranslation(text);

}


function setupGlobalListeners() {
    
    const panePrimary = document.getElementById('pane-primary');
    const paneSecondary = document.getElementById('pane-secondary');

    
    
    
    function transferFocusOnPaneEnter(inputEl, e) {
        if (!inputEl) return;
        if (!isSplitMode) return;
        if (e.buttons !== 0) return; 
        const selection = window.getSelection();
        if (selection && selection.toString().trim().length > 0) return; 
        const sidebar = document.getElementById('spotlight-sidebar');
        if (sidebar && sidebar.classList.contains('active')) return;
        inputEl.focus();
    }

    if (panePrimary) {
        panePrimary.addEventListener('mouseenter', (e) => {
            const old = hoveredPane;
            hoveredPane = 'primary';
            transferFocusOnPaneEnter(sharedInputUI?.inputEl, e);
            if (old !== hoveredPane && typeof window.updateTopbarModelSelector === 'function') {
                window.updateTopbarModelSelector();
            }
        });
    }
    if (paneSecondary) {
        paneSecondary.addEventListener('mouseenter', (e) => {
            const old = hoveredPane;
            hoveredPane = 'secondary';
            transferFocusOnPaneEnter(sharedInputUISecondary?.inputEl, e);
            if (old !== hoveredPane && typeof window.updateTopbarModelSelector === 'function') {
                window.updateTopbarModelSelector();
            }
        });
    }

    
    
    
    if (sharedInputUI?.inputEl) {
        sharedInputUI.inputEl.addEventListener('focus', () => {
            const old = hoveredPane;
            hoveredPane = 'primary';
            if (old !== hoveredPane && typeof window.updateTopbarModelSelector === 'function') {
                window.updateTopbarModelSelector();
            }
        });
    }
    if (sharedInputUISecondary?.inputEl) {
        sharedInputUISecondary.inputEl.addEventListener('focus', () => {
            const old = hoveredPane;
            hoveredPane = 'secondary';
            if (old !== hoveredPane && typeof window.updateTopbarModelSelector === 'function') {
                window.updateTopbarModelSelector();
            }
        });
    }

    document.addEventListener('keydown', (event) => {
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
                        const hasVariables = /\$SelectedText|"SelectedText"|\$Sentence|\$Paragraph|\$Container/i.test(mapping.prompt);
                        if (hasVariables) {
                            fullQuestion = mapping.prompt
                                .replace(/\$SelectedText|SelectedText/gi, selection)
                                .replace(/\$Sentence/gi, selection)
                                .replace(/\$Paragraph/gi, selection)
                                .replace(/\$Container/gi, selection);
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

                                const node = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
                                const sourceEntry = node ? node.closest('.lumina-dict-entry') : null;
                                if (sourceEntry) {
                                    const questionDiv = sourceEntry.querySelector('.lumina-chat-question');
                                    if (questionDiv) {
                                        setTimeout(() => {
                                            targetTab.chatUIInstance._setPinnedQuestion(questionDiv);
                                        }, 50);
                                    }
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

        
        if (['Control', 'Shift', 'Alt', 'Meta', 'Tab', 'CapsLock', 'Escape'].includes(event.key)) return;

        
        
        
        const isWrongPaneFocused = isSplitMode && inputEl && activeElement !== inputEl &&
            (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA' || activeElement.isContentEditable);

        
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
        const redirectShortcut = shortcuts.redirect;
        if (redirectShortcut && isShortcutMatch(event, redirectShortcut)) {
            event.preventDefault();
            redirectToPinnedQuestion();
            return;
        }

        const resetShortcut = shortcuts.resetChat;
        if (!resetShortcut) return;

        if (isShortcutMatch(event, resetShortcut)) {
            event.preventDefault();
            resetChat();
        }
    });
}


function resetChat() {
    stopSpotlightAudio();

    
    const isSecondaryTarget = isSplitMode && hoveredPane === 'secondary';

    if (isSecondaryTarget) {
        if (secondaryActiveTabIndex !== -1) {
            const secondaryTab = tabs[secondaryActiveTabIndex];
            if (secondaryTab) {
                
                if (port && secondaryTab.sessionId) {
                    port.postMessage({ action: 'stop_chat', sessionId: secondaryTab.sessionId });
                }

                const newSessionId = 'session_' + Date.now() + Math.random().toString(36).substr(2, 5);
                secondaryTab.title = 'New Tab';
                secondaryTab.sessionId = newSessionId;
                secondaryTab.scrollTop = -1;
                updateUrlSessionId(newSessionId);
            }
        }

        if (chatUISecondary) {
            chatUISecondary.clearHistory();
            if (chatUISecondary.inputEl) {
                chatUISecondary.inputEl.value = '';
                chatUISecondary.inputEl.style.height = 'auto';
                chatUISecondary.inputEl.focus();
            }
        }

        renderTabs();
        saveTabsState();

        const paneSecondaryEl = document.getElementById('pane-secondary');
        const regenBtnSec = paneSecondaryEl?.querySelector('#lumina-regenerate-btn');
        if (regenBtnSec) regenBtnSec.style.display = 'none';

    } else {
        if (activeTabIndex !== -1) {
            const activeTab = tabs[activeTabIndex];

            if (activeTab) {
                if (port && activeTab.sessionId) {
                    port.postMessage({ action: 'stop_chat', sessionId: activeTab.sessionId });
                }

                const newSessionId = 'session_' + Date.now() + Math.random().toString(36).substr(2, 5);
                activeTab.title = 'New Tab';
                activeTab.sessionId = newSessionId;
                activeTab.scrollTop = -1;
                updateUrlSessionId(newSessionId);
            }
        }

        chatUI.clearHistory();
        if (chatUI.inputEl) {
            chatUI.inputEl.value = '';
            chatUI.inputEl.style.height = 'auto';
            chatUI.inputEl.focus();
        }

        renderTabs();
        saveTabsState();

        const regenBtn = document.getElementById('lumina-regenerate-btn');
        if (regenBtn) regenBtn.style.display = 'none';
    }
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
    } else if (action === 'redirect') {
        redirectToPinnedQuestion();
    } else if (action === 'micToggle') {
        const targetPane = (hoveredPane === 'secondary' && isSplitMode) ? 'secondary' : 'primary';
        const inputArea = document.getElementById(`input-area-${targetPane}`);
        const micBtn = inputArea ? inputArea.querySelector('#mic-btn') : null;
        if (micBtn) micBtn.click();
    }
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
    } catch (e) {  }

    
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
            } catch (e) {  }

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

    
    const activeTab = tabs[activeTabIndex];
    if (!activeTab) return;

    activeTab.sessionId = historySessionId;
    updateUrlSessionId(historySessionId);

    
    let displayTitle = meta.title || "Restored Chat";
    if (!meta.isRenamed && messages && messages.length > 0) {
        
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
    activeTab.selectedModel = null; 

    
    const chatData = {
        ...meta,
        messages: messages,
        sessionId: historySessionId,
        timestamp: meta.createdAt || meta.updatedAt
    };

    
    if (typeof ChatHistoryManager !== 'undefined' && typeof ChatHistoryManager.restoreChat === 'function') {
        showTopbarLoading();
        activeTab.historyEl.style.opacity = '0';
        activeTab.historyEl.style.transition = 'none';
        activeTab.historyEl.innerHTML = '';

        await ChatHistoryManager.restoreChat(chatData, activeTab.historyEl);

        
        normalizeRestoredHistory(activeTab.historyEl);
        console.log('[Spotlight] history restored, rendering active tab');
        renderTabs();
        saveTabsState();

        
        syncTabUI(activeTab, false, true);

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
                hideTopbarLoading();
            }, 60);
        } else {
            const performRestore = async () => {
                if (activeTab.historyEl.__processingPromises) {
                    try {
                        await Promise.all(activeTab.historyEl.__processingPromises);
                    } catch (e) {}
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
                hideTopbarLoading();
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

async function renderDropdownMenu() {
    const dropdown = document.getElementById('topbar-dropdown-menu');
    if (!dropdown) return;

    const result = await chrome.storage.local.get([ChatHistoryManager.STORAGE_KEY]);
    const sessions = result[ChatHistoryManager.STORAGE_KEY] || {};
    const historyData = Object.values(sessions).sort((a, b) => b.updatedAt - a.updatedAt);
    
    const isExpanded = dropdown.classList.contains('expanded');
    const displayLimit = isExpanded ? 15 : 5;
    const recentSessions = historyData.slice(0, displayLimit);

    let html = '';
    
    html += `<div class="dropdown-section-title">Recent Chats</div>`;
    html += `<div class="dropdown-chat-list">`;
    
    if (recentSessions.length === 0) {
        html += `<div class="dropdown-item empty-state">No recent chats</div>`;
    } else {
        recentSessions.forEach(session => {
            let displayTitle = session.title;
            if (!session.isRenamed && session.questions && session.questions.length > 0) {
                displayTitle = session.questions[session.questions.length - 1].text || "Untitled Chat";
            }
            if (!displayTitle) displayTitle = "Untitled Chat";
            
            if (displayTitle.length > 40) {
                displayTitle = displayTitle.substring(0, 37) + '...';
            }

            html += `
                <div class="dropdown-item chat-item" data-session-id="${session.id}">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="item-icon"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
                    <span class="item-text">${escapeHtml(displayTitle)}</span>
                </div>
            `;
        });
    }

    if (historyData.length > displayLimit && !isExpanded) {
        html += `
            <div class="dropdown-item more-item" id="dropdown-more-btn">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="item-icon"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg>
                <span class="item-text">More</span>
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="caret-icon"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </div>
        `;
    }

    html += `</div>`;
    html += `<div class="dropdown-divider"></div>`;

    html += `
        <div class="dropdown-item action-item" id="dropdown-continue-btn">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="item-icon"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
            <span class="item-text">Continue Chat in New Tab</span>
        </div>
        <div class="dropdown-item action-item" id="dropdown-settings-btn">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="item-icon"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
            <span class="item-text">Settings & Help</span>
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="caret-icon"><polyline points="9 18 15 12 9 6"></polyline></svg>
        </div>
    `;

    dropdown.innerHTML = html;

    dropdown.querySelectorAll('.chat-item').forEach(item => {
        item.addEventListener('click', async () => {
            const sid = item.dataset.sessionId;
            const contentKey = `lumina_session_${sid}`;
            const contentData = await chrome.storage.local.get([contentKey]);
            const messages = contentData[contentKey];
            const meta = sessions[sid];
            if (messages && meta) {
                window.loadHistoryIntoNewTab(messages, meta, sid);
            }
            dropdown.style.display = 'none';
        });
    });

    const moreBtn = dropdown.querySelector('.more-item');
    if (moreBtn) {
        moreBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.add('expanded');
            renderDropdownMenu();
        });
    }

    const continueBtn = dropdown.querySelector('#dropdown-continue-btn');
    if (continueBtn) {
        continueBtn.addEventListener('click', () => {
            const activeTab = tabs[activeTabIndex];
            let url = chrome.runtime.getURL('pages/spotlight/spotlight.html') + '?webapp=1';
            if (activeTab && activeTab.sessionId) {
                url += `&session_id=${activeTab.sessionId}`;
            }
            chrome.tabs.create({ url });
            dropdown.style.display = 'none';
        });
    }

    const settingsBtn = dropdown.querySelector('#dropdown-settings-btn');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            chrome.runtime.openOptionsPage();
            dropdown.style.display = 'none';
        });
    }
}

function initTopbarModelSelector() {
    const selector = document.getElementById('topbar-model-selector');
    if (!selector) return;
    const btn = document.getElementById('topbar-model-btn');
    const label = document.getElementById('topbar-model-label');
    const dropdown = document.getElementById('topbar-model-dropdown');
    if (!btn || !dropdown) return;

    const render = (data) => {
        const chain = data.modelChains?.text || [];
        
        // Find current model of active tab
        const activeTab = (isSplitMode && hoveredPane === 'secondary')
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
            const targetSharedUI = (isSplitMode && hoveredPane === 'secondary') ? sharedInputUISecondary : sharedInputUI;
            if (targetSharedUI) {
                targetSharedUI.activeTabModel = { ...activeTab.selectedModel };
            }
        }

        if (currentModel && label) {
            label.textContent = currentModel;
        }

        dropdown.innerHTML = '';
        if (chain.length === 0) {
            dropdown.innerHTML = '<div style="padding:8px;font-size:11px;color:#70757a;">No models</div>';
            return;
        }

        const header = document.createElement('div');
        header.style.cssText = 'padding:6px 12px; font-size:11px; font-weight:600; color:#70757a; text-transform:uppercase; letter-spacing:0.5px; font-family:\'Google Sans\', sans-serif;';
        header.textContent = 'MODELS';
        dropdown.appendChild(header);

        chain.forEach((item) => {
            const el = document.createElement('button');
            const isActive = item.model === currentModel && item.providerId === currentProviderId;
            el.className = `lumina-model-item${isActive ? ' active' : ''}`;
            el.innerHTML = `<span class="model-name">${item.model}</span>`;
            el.onclick = (e) => {
                e.stopPropagation();
                if (label) label.textContent = item.model;
                dropdown.classList.remove('active');
                dropdown.querySelectorAll('.lumina-model-item').forEach(b => b.classList.remove('active'));
                el.classList.add('active');

                // Update active tab model
                const currentActiveTab = (isSplitMode && hoveredPane === 'secondary')
                    ? tabs[secondaryActiveTabIndex]
                    : tabs[activeTabIndex];
                const targetSharedUI = (isSplitMode && hoveredPane === 'secondary') ? sharedInputUISecondary : sharedInputUI;

                if (currentActiveTab) {
                    currentActiveTab.selectedModel = { model: item.model, providerId: item.providerId };
                    if (targetSharedUI) {
                        targetSharedUI.activeTabModel = { ...currentActiveTab.selectedModel };
                        targetSharedUI._updateTokenLimitFromModel();
                    }
                }

                chrome.storage.local.set({ lastUsedModel: { model: item.model, providerId: item.providerId } });
            };
            dropdown.appendChild(el);
        });
    };

    const fetchAndRender = () => {
        chrome.storage.local.get(['providers', 'modelChains', 'lastUsedModel'], render);
    };

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (dropdown.classList.contains('active')) {
            dropdown.classList.remove('active');
        } else {
            // Close other dropdowns
            const moreDropdown = document.getElementById('topbar-dropdown-menu');
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

    window.updateTopbarModelSelector = fetchAndRender;
    fetchAndRender();
}
