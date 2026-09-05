import { WidgetRunner } from '../../components/widgets/widget_runner.js';
import { NexusToast, NexusTooltip, NexusMenu } from '../../components/ui/index.js';

window._nexusWindowInstanceId = window._nexusWindowInstanceId || 'win_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
window.WidgetRunner = WidgetRunner;
window.NexusToast = NexusToast;
window.NexusMenu = NexusMenu;
window.NexusTooltip = NexusTooltip;

try {
    NexusTooltip.init();
} catch (_) { }

function bindContainerWheelForward(containerEl) {
    if (!containerEl || containerEl.__nexusWheelBound) return;
    containerEl.__nexusWheelBound = true;
    let cachedScrollable = null;
    function attachScrollContentBlocker(scrollable) {
        if (!scrollable || scrollable.__nexusWheelStop) return;
        scrollable.__nexusWheelStop = true;
        scrollable.addEventListener('wheel', (e) => { e.stopPropagation(); }, { passive: true });
    }
    containerEl.addEventListener('wheel', (e) => {
        if (!cachedScrollable || cachedScrollable.style.display === 'none') {
            cachedScrollable = containerEl.querySelector('.nexus-chat-scroll-content:not([style*="display: none"])');
            if (cachedScrollable) attachScrollContentBlocker(cachedScrollable);
        }
        if (!cachedScrollable) return;
        e.preventDefault();
        let delta = e.deltaY;
        if (e.deltaMode === 1) delta *= 16;
        else if (e.deltaMode === 2) delta *= cachedScrollable.clientHeight;
        cachedScrollable.scrollBy({ top: delta, behavior: 'instant' });
    }, { passive: false });
    const existing = containerEl.querySelector('.nexus-chat-scroll-content');
    if (existing) attachScrollContentBlocker(existing);
}

let isWebApp = new URLSearchParams(window.location.search).get('webapp') === '1';
const isSidePanel = new URLSearchParams(window.location.search).get('sidepanel') === '1';
if (isSidePanel) {
    document.body.classList.add('is-sidepanel');
}

let isPopStateNavigating = false;

function updateUrlSessionId(ignoredSessionId) {
    const urlParams = new URLSearchParams(window.location.search);
    const primaryTab = (typeof tabs !== 'undefined' && typeof activeTabIndex !== 'undefined') ? tabs[activeTabIndex] : null;
    const sidVal = (primaryTab && primaryTab.sessionId) ? primaryTab.sessionId : '';
    const sparkIdVal = (primaryTab && primaryTab.sparkId) ? primaryTab.sparkId : '';

    if (urlParams.has('session_id')) {
        urlParams.delete('session_id');
    }
    let changed = false;
    const currentUrlSid = urlParams.get('sid') || '';
    if (currentUrlSid !== sidVal) {
        if (!sidVal) {
            urlParams.delete('sid');
        } else {
            urlParams.set('sid', sidVal);
        }
        changed = true;
    }

    const currentSparkId = urlParams.get('sparkId') || '';
    if (currentSparkId !== sparkIdVal) {
        if (!sparkIdVal) {
            urlParams.delete('sparkId');
        } else {
            urlParams.set('sparkId', sparkIdVal);
        }
        changed = true;
    }

    if (changed) {
        const newUrl = window.location.pathname + (urlParams.toString() ? '?' + urlParams.toString() : '');
        if (isPopStateNavigating) {
            window.history.replaceState({ path: newUrl, sid: sidVal, sparkId: sparkIdVal }, '', newUrl);
        } else {
            window.history.pushState({ path: newUrl, sid: sidVal, sparkId: sparkIdVal }, '', newUrl);
        }
    }
}

window.addEventListener('popstate', async (e) => {
    isPopStateNavigating = true;
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const targetSid = urlParams.get('sid') || '';
        const activeTab = (typeof tabs !== 'undefined' && typeof activeTabIndex !== 'undefined') ? tabs[activeTabIndex] : null;
        const currentSid = activeTab ? (activeTab.sessionId || '') : '';

        if (targetSid !== currentSid) {
            if (targetSid) {
                const messages = await ChatHistoryManager.getSessionMessages(targetSid);
                const allSessions = await ChatHistoryManager.getAllHistories();
                const meta = allSessions[targetSid] || { id: targetSid };
                if (typeof window.loadHistoryIntoNewTab === 'function') {
                    await window.loadHistoryIntoNewTab(messages, meta, targetSid);
                }
            } else {
                if (activeTab) {
                    activeTab.sessionId = null;
                    if (activeTab.historyEl) {
                        activeTab.historyEl.removeAttribute('data-session-id');
                        activeTab.historyEl.innerHTML = '';
                    }
                    updateWelcomeScreenState('primary');
                    renderRecentChatsSidebar();
                    renderTabs();
                }
            }
        }
    } catch (err) {
        console.error('Error handling popstate navigation:', err);
    } finally {
        isPopStateNavigating = false;
    }
});

const instanceId = (() => {
    let instId = sessionStorage.getItem('nexus_nexus_instance_id');
    if (!instId) {
        instId = 'inst_' + Date.now() + Math.random().toString(36).substr(2, 5);
        sessionStorage.setItem('nexus_nexus_instance_id', instId);
    }
    return instId;
})();

const STORAGE_PREFIX = isSidePanel ? 'sidepanel' : 'nexus';

const GLOBAL_KEYS = {
    tabs: `${STORAGE_PREFIX}_tabs`,
    tabCounter: `${STORAGE_PREFIX}_tab_counter`,
    activeTabIndex: `${STORAGE_PREFIX}_active_tab_index`
};

const KEYS = {
    tabs: `${STORAGE_PREFIX}_tabs_${instanceId}`,
    tabCounter: `${STORAGE_PREFIX}_tab_counter_${instanceId}`,
    activeTabIndex: `${STORAGE_PREFIX}_active_tab_index_${instanceId}`
};

let tabs = [];
let sessionSettings = {};
let sparksCache = {};
let activeTabIndex = -1;
let tabCounter = 1;

window.NexusSelectionScope = {
    getTabs: () => tabs,
    getActiveTabIndex: () => activeTabIndex,
    getSharedInputUI: () => sharedInputUI,
    resetChat: () => { if (typeof resetChat === 'function') resetChat(); },
    renderRecentChatsSidebar: () => { if (typeof renderRecentChatsSidebar === 'function') renderRecentChatsSidebar(); }
};

const pageContextCache = new Map();

let chatUI = null;
let sharedInputUI = null;

function getHoveredInputEl() {
    const appsStudioInput = document.querySelector('.apps-studio-left-pane .nexus-chat-input') || document.getElementById('apps-studio-prompt-input');
    if (appsStudioInput && !appsStudioInput.disabled && appsStudioInput.offsetParent !== null) {
        return appsStudioInput;
    }
    const sparkInput = document.querySelector('.sparks-editor-preview .nexus-chat-input') || document.getElementById('sparks-preview-input');
    if (sparkInput && !sparkInput.disabled && sparkInput.offsetParent !== null) {
        return sparkInput;
    }
    return sharedInputUI?.inputEl;
}

window.getActiveNexusTab = function () {
    return (typeof tabs !== 'undefined' && activeTabIndex >= 0) ? tabs[activeTabIndex] : null;
};

window.getSharedInputUI = function () {
    return typeof sharedInputUI !== 'undefined' ? sharedInputUI : null;
};

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

let groupCounter = 1;
let isInitializing = false;
let handledQueryIds = new Set();
let myWindowId = null;
let shouldStartNewChat = false;

let modifierKeyPressedAlone = false;
let lastSubmitTime = 0;
let lastSubmitText = "";
let readWebpageEnabled = false;

function applyFontSize(size) {
    if (typeof NexusChatUI !== 'undefined' && typeof NexusChatUI.applyFontSize === 'function') {
        NexusChatUI.applyFontSize(null, size);
    } else {
        document.body.style.setProperty('font-size', size + 'px', 'important');
        document.documentElement.style.setProperty('--nexus-fontSize', size + 'px', 'important');
    }

    // Broadcast font size change live to all widget sandboxes
    const iframes = document.querySelectorAll('.nexus-widget-iframe');
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    iframes.forEach(iframe => {
        if (iframe.contentWindow) {
            iframe.contentWindow.postMessage({
                type: 'NEXUS_WIDGET_THEME_UPDATE',
                isDark,
                fontSize: size
            }, '*');
        }
    });
}

const WEB_SOURCE_SELECTION_STORAGE_PREFIX = 'nexus_web_source_selection_';

const currentBrowserTabTokens = new Map();

function getNexusTabIdForPane(container) {
    return activeTabIndex >= 0 && tabs[activeTabIndex] ? tabs[activeTabIndex].id : null;
}

function getWebSelectionScopeKey(nexusTabId) {
    if (nexusTabId == null || !currentBrowserTab) return null;
    return `${String(nexusTabId)}_${String(currentBrowserTab.tabId)}`;
}

function getCurrentNexusTabId() {
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
        console.warn('[Nexus] Failed to read web selection from localStorage:', error);
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

function getWebSelectionForScope(nexusTabId) {
    const scopeKey = getWebSelectionScopeKey(nexusTabId);
    if (!scopeKey) return [];
    webSourceSelectionsByPageTabId[scopeKey] = readWebSelectionFromStorage(scopeKey);
    return webSourceSelectionsByPageTabId[scopeKey] || [];
}

function saveWebSelectionForScope(nexusTabId, selection) {
    const scopeKey = getWebSelectionScopeKey(nexusTabId);
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
        refreshWebSourceTokens(nexusTabId, normalizedSelection);
    }
}

async function ensureContentScriptsInjected(tabId) {
    try {
        const checkResults = await chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: () => typeof window.nexusExtractMainContent === 'function'
        }).catch(() => null);
        const isAlreadyInjected = checkResults && checkResults[0] && checkResults[0].result === true;
        if (!isAlreadyInjected) {
            console.log(`[Nexus] Re-injecting content scripts into tab ${tabId}...`);
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
        console.warn(`[Nexus] Failed to inject content scripts into tab ${tabId}:`, e);
    }
}

async function fetchFreshWebContent(tabId) {
    const tabInfo = await chrome.tabs.get(parseInt(tabId)).catch(() => null);
    if (!tabInfo) return null;
    if (typeof tabInfo.url === 'string' && tabInfo.url.startsWith('chrome-extension://') && tabInfo.url.includes('?sid=')) {
        try {
            const urlObj = new URL(tabInfo.url);
            const sid = urlObj.searchParams.get('sid');
            if (sid) {
                let messages = await ChatHistoryManager.getSessionMessages(sid);
                if (messages && messages.length > 0) {
                    const qMessages = messages.filter(m => m.type === 'question');
                    const limitCount = 10;
                    if (qMessages.length > limitCount) {
                        const targetQuestion = qMessages[qMessages.length - limitCount];
                        const startIndex = messages.indexOf(targetQuestion);
                        if (startIndex !== -1) {
                            messages = messages.slice(startIndex);
                        }
                    }
                    return messages.map(msg => {
                        const role = msg.type === 'question' ? 'User' : 'Assistant';
                        const text = typeof msg.content === 'string' ? msg.content : '';
                        const cleanText = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
                        return `${role}: ${cleanText}`;
                    }).join('\n\n');
                }
            }
        } catch (e) {
            console.error('[Nexus WebSource] Failed to fetch Nexus tab content:', e);
        }
        return null;
    }
    if (tabInfo.status !== 'complete') return null;
    await ensureContentScriptsInjected(parseInt(tabId));
    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId: parseInt(tabId), allFrames: true },
            func: () => typeof window.nexusExtractMainContent === 'function'
                ? window.nexusExtractMainContent(document, true) : null
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
        console.warn(`[Nexus WebSource] executeScript failed for tab ${tabId}:`, e);
        return null;
    }
}

async function refreshWebSourceTokens(nexusTabId, selection) {
    if (!selection || selection.length === 0) return;
    let updated = false;
    for (const source of selection) {
        try {
            const text = await fetchFreshWebContent(source.tabId);
            if (!text || text.length < 200) continue;
            const count = (typeof NexusToken !== 'undefined') ? NexusToken.count(text) : Math.ceil(text.length / 4);
            if (count < 10) continue;
            if (source.tokens !== count) {
                source.tokens = count;
                updated = true;
            }
        } catch (e) {
            console.warn(`[Nexus WebSource] Token refresh failed for tab ${source.tabId}:`, e);
            if (!source.tokens) source.tokens = 0;
        }
    }
    if (updated) {
        if (nexusTabId) {
            const scopeKey = getWebSelectionScopeKey(nexusTabId);
            if (scopeKey) {
                webSourceSelectionsByPageTabId[scopeKey] = selection;
                writeWebSelectionToStorage(scopeKey, selection);
            }
        }
        updateWebChips();
    }
}

function saveCurrentWebSelection(nexusTabId = null) {
    const targetTabId = nexusTabId || (activeTabIndex >= 0 && tabs[activeTabIndex] ? tabs[activeTabIndex].id : null);
    if (!targetTabId) return;
    const scopedSelection = getWebSelectionForScope(targetTabId);
    saveWebSelectionForScope(targetTabId, scopedSelection);
}

function loadCurrentWebSelection(nexusTabId = null) {
    const targetTabId = nexusTabId || (activeTabIndex >= 0 && tabs[activeTabIndex] ? tabs[activeTabIndex].id : null);
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
        const nexusTabId = storageKey.slice(WEB_SOURCE_SELECTION_STORAGE_PREFIX.length);
        const selection = readWebSelectionFromStorage(nexusTabId);
        const matches = selection.filter(s => String(s.tabId) === stringTabId);
        if (matches.length > 0) {
            refreshWebSourceTokens(nexusTabId, matches);
        }
    });
    if (currentBrowserTab && String(currentBrowserTab.tabId) === stringTabId) {
        (async () => {
            const text = await fetchFreshWebContent(stringTabId);
            if (text) {
                const count = (typeof NexusToken !== 'undefined') ? NexusToken.count(text) : Math.ceil(text.length / 4);
                currentBrowserTabTokens.set(stringTabId, count);
                updateWebChips();
            } else {
                currentBrowserTabTokens.delete(stringTabId);
                updateWebChips();
            }
        })();
    }
}

function bindHistoryScroll(tab) {
    if (!tab || !tab.historyEl || tab.historyEl.__nexusScrollBound) return;
    tab.historyEl.__nexusScrollBound = true;
    let saveTimer = null;
    tab.historyEl.addEventListener('nexus:history-changed', (e) => {
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
        const entries = tab.historyEl.querySelectorAll('.nexus-entry');
        if (entries.length > 0) {
            if (nearBottom) {
                if (saveTimer) clearTimeout(saveTimer);
                saveTimer = setTimeout(() => {
                    saveTabsState(false, false);
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
            saveTabsState(false, false);
        }, 200);
    }, { passive: true });
}

let topbarProgressTimer1 = null;
let topbarProgressTimer2 = null;

function showTopbarLoading() {
    const bar = document.getElementById('topbar-progress');
    if (!bar) return;

    if (topbarProgressTimer1) clearTimeout(topbarProgressTimer1);
    if (topbarProgressTimer2) clearTimeout(topbarProgressTimer2);
    topbarProgressTimer1 = null;
    topbarProgressTimer2 = null;

    const isActive = bar.classList.contains('active');
    if (!isActive) {
        bar.style.transition = 'none';
        bar.style.transform = 'scaleX(0)';
        bar.classList.add('active');
        bar.offsetHeight;
    }
    bar.style.transition = 'transform 0.4s cubic-bezier(0.1, 0.8, 0.3, 1), opacity 0.2s ease';
    bar.style.transform = 'scaleX(0.85)';
}

function hideTopbarLoading() {
    const bar = document.getElementById('topbar-progress');
    if (!bar) return;

    if (topbarProgressTimer1) clearTimeout(topbarProgressTimer1);
    if (topbarProgressTimer2) clearTimeout(topbarProgressTimer2);

    bar.style.transition = 'transform 0.15s ease, opacity 0.15s ease';
    bar.style.transform = 'scaleX(1)';
    topbarProgressTimer1 = setTimeout(() => {
        bar.classList.remove('active');
        topbarProgressTimer2 = setTimeout(() => {
            bar.style.transform = 'scaleX(0)';
        }, 150);
    }, 150);
}

function restoreScrollPosition(tab) {
    if (!tab || !tab.historyEl) return;
    const entries = tab.historyEl.querySelectorAll('.nexus-entry');
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
        const baseTarget = NexusChatUI.calculateInitialScrollTarget(anchor, tab.historyEl);
        tab.historyEl.scrollTop = baseTarget + (tab.scrollAnchorOffset || 0);
    }
}

function restoreLatestScrollPosition(tab) {
    if (!tab || !tab.historyEl) return;
    const entries = tab.historyEl.querySelectorAll('.nexus-entry');
    if (entries.length === 0) return;
    const latestEntry = entries[entries.length - 1];
    if (tab.chatUIInstance && typeof tab.chatUIInstance.updateEntryMinHeight === 'function') {
        tab.chatUIInstance.updateEntryMinHeight(latestEntry);
        tab.chatUIInstance.adjustEntryMargin(latestEntry, 'immediate');
    }
    const targetScrollTop = NexusChatUI.calculateInitialScrollTarget(latestEntry, tab.historyEl);
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
    setTimeout(performRestore, 20);
}

async function handleRemoteSync(changes, areaName) {
    if (areaName !== 'local') return;
    if (changes[KEYS.tabs]) {
        const newTabsMeta = changes[KEYS.tabs] ? changes[KEYS.tabs].newValue : null;
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
            if (currentTabIds !== nextTabIds || metadataChanged) {
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
                        historyEl.className = 'nexus-chat-scroll-content';
                        historyEl.style.display = 'none';
                        const primaryContainer = document.querySelector('.nexus-chat-container');
                        if (primaryContainer) primaryContainer.appendChild(historyEl);
                        const newTab = {
                            id: meta.id,
                            title: meta.title || 'New Tab',
                            sessionId: meta.sessionId,
                            sparkId: meta.sparkId || null,
                            historyEl: historyEl,
                            chatUIInstance: new NexusChatUI(primaryContainer, {
                                isNexus: true,
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
                const counterData = await chrome.storage.local.get([KEYS.tabCounter]);
                if (counterData[KEYS.tabCounter]) tabCounter = counterData[KEYS.tabCounter];
                let resolvedActiveIndex = activeTabIndex;
                if (currentActiveSessionId) {
                    const targetIdx = tabs.findIndex(t => t.sessionId === currentActiveSessionId);
                    if (targetIdx !== -1) {
                        resolvedActiveIndex = targetIdx;
                    }
                }
                if (resolvedActiveIndex < 0 || resolvedActiveIndex >= tabs.length) {
                    resolvedActiveIndex = 0;
                }
                renderTabs();
                if (typeof renderSidebarTabs === 'function') renderSidebarTabs();
                if (activeTabIndex !== resolvedActiveIndex) {
                    switchTab(resolvedActiveIndex, true);
                }
                syncSessionsWithBackground();
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
    if (!tab) return;
    if (tab.isHistoryLoaded) return;
    if (tab.isLoadingHistory) {
        return tab.loadingPromise;
    }
    tab.isLoadingHistory = true;
    tab.loadingPromise = (async () => {
        if (tab.sessionId) {
            showTopbarLoading('primary');
            if (tab.historyEl) {
                tab.historyEl.style.opacity = '0';
                tab.historyEl.style.transition = 'none';
            }
            try {
                const messages = await ChatHistoryManager.getSessionMessages(tab.sessionId);
                if (messages) {
                    const sessions = await ChatHistoryManager.getAllHistories();
                    const meta = sessions[tab.sessionId] || {};
                    const resolved = await window.NexusModelHelper.resolveSessionSettings(tab.sessionId, meta.selectedModel, meta.thinkingLevel);
                    tab.selectedModel = resolved.selectedModel;
                    tab.thinkingLevel = resolved.thinkingLevel;
                    if (resolved.selectedModel) {
                        await window.NexusModelHelper.saveModelSelection(resolved.selectedModel, tab.sessionId, resolved.thinkingLevel);
                    }
                    if (tab.chatUIInstance) {
                        tab.chatUIInstance.activeTabModel = resolved.selectedModel ? { ...resolved.selectedModel } : null;
                        tab.chatUIInstance.thinkingLevel = resolved.thinkingLevel || null;
                    }
                    if (sharedInputUI && tab === tabs[activeTabIndex]) {
                        sharedInputUI.attachTab(tab);
                    }
                    const chatData = {
                        ...meta,
                        messages: messages,
                        sessionId: tab.sessionId,
                        timestamp: meta.createdAt || meta.updatedAt
                    };
                    await ChatHistoryManager.restoreChat(chatData, tab.historyEl);
                    normalizeRestoredHistory(tab.historyEl);
                    const allEntries = tab.historyEl.querySelectorAll('.nexus-entry');
                    if (allEntries.length > 0 && tab.chatUIInstance) {
                        const lastEntry = allEntries[allEntries.length - 1];
                        tab.chatUIInstance.updateEntryMinHeight(lastEntry);
                        tab.chatUIInstance.adjustEntryMargin(lastEntry, 'immediate');
                    }
                    scheduleScrollRestore(tab);
                    if (window.NexusAnnotation) {
                        NexusAnnotation.loadHighlights(tab.id);
                    }
                }
            } catch (e) {
                console.error('Failed to load tab history from JSON:', e);
            } finally {
                tab.isLoadingHistory = false;
                tab.isHistoryLoaded = true;
                tab.loadingPromise = null;
                hideTopbarLoading('primary');
                if (typeof updateWelcomeScreenState === 'function') {
                    updateWelcomeScreenState('primary');
                }
            }
        } else {
            tab.isHistoryLoaded = true;
            tab.isLoadingHistory = false;
            tab.loadingPromise = null;
            if (tab.sparkId && typeof renderSparkWelcomeScreen === 'function') {
                await renderSparkWelcomeScreen(tab);
            }
        }
    })();
    return tab.loadingPromise;
}

async function initTabs() {
    const topBar = document.getElementById('nexus-topbar');
    if (topBar) {
        topBar.style.removeProperty('display');
    }
    const mainContainer = document.querySelector('.nexus-chat-container');
    if (mainContainer) {
        mainContainer.querySelectorAll('.nexus-chat-scroll-content').forEach(el => el.remove());
    }
    tabs = [];
    const initialHistory = document.createElement('div');
    initialHistory.id = 'chat-history';
    initialHistory.className = 'nexus-chat-scroll-content';
    initialHistory.style.display = 'none';
    if (mainContainer) mainContainer.appendChild(initialHistory);
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
                    GLOBAL_KEYS.tabCounter
                ]);
                if (globalData[GLOBAL_KEYS.tabs] && globalData[GLOBAL_KEYS.tabs].length > 0) {
                    const toSet = {
                        [KEYS.tabs]: globalData[GLOBAL_KEYS.tabs],
                        [KEYS.activeTabIndex]: globalData[GLOBAL_KEYS.activeTabIndex] ?? 0,
                        [KEYS.tabCounter]: globalData[GLOBAL_KEYS.tabCounter] ?? 1
                    };
                    await chrome.storage.local.set(toSet);
                }
            } catch (e) {
                console.warn('[Nexus] Failed to copy global keys to namespace keys:', e);
            }
        }
        const data = await chrome.storage.local.get([
            KEYS.tabs,
            KEYS.activeTabIndex,
            'nexus_session_settings',
            'nexus_sparks',
            'lumina_sparks',
            'sparks'
        ]);
        sessionSettings = data.nexus_session_settings || {};
        sparksCache = data.nexus_sparks || data.lumina_sparks || data.sparks || {};
        const urlParams = new URLSearchParams(window.location.search);
        const sidParam = urlParams.get('sid') || urlParams.get('session_id');
        const urlSessionIds = sidParam ? sidParam.split(',') : [];
        const urlSessionId = urlSessionIds[0] || null;
        let savedTab = null;
        if (data[KEYS.tabs] && data[KEYS.tabs].length > 0) {
            const activeIdx = data[KEYS.activeTabIndex] || 0;
            savedTab = data[KEYS.tabs][activeIdx] || data[KEYS.tabs][0];
        }
        let sessionId = shouldStartNewChat ? null : (urlSessionId || (isWebApp ? null : (savedTab?.sessionId || null)));
        let tabTitle = 'Chat';
        let meta = {};
        if (sessionId) {
            const sessions = await ChatHistoryManager.getAllHistories();
            meta = sessions[sessionId] || {};
            tabTitle = meta.title || 'Chat';
        }
        const resolved = await window.NexusModelHelper.resolveSessionSettings(sessionId, meta.selectedModel || savedTab?.selectedModel || null, meta.thinkingLevel || savedTab?.thinkingLevel || null);
        let activeModel = resolved.selectedModel;
        let activeThinking = resolved.thinkingLevel;
        if (activeModel) {
            await window.NexusModelHelper.saveModelSelection(activeModel, sessionId, activeThinking);
        }
        const singleTab = {
            id: 'tab-1',
            title: tabTitle,
            sessionId: sessionId,
            sparkId: shouldStartNewChat ? null : (urlSessionId ? (meta.sparkId || null) : (urlParams.get('sparkId') || (isWebApp ? null : (savedTab?.sparkId || null)))),
            scrollTop: savedTab?.scrollTop ?? -1,
            scrollAnchorIndex: savedTab?.scrollAnchorIndex ?? null,
            scrollAnchorOffset: savedTab?.scrollAnchorOffset ?? null,
            isAtBottom: savedTab?.isAtBottom ?? true,
            restoreLatestOnOpen: true,
            historyEl: initialHistory,
            selectedModel: activeModel,
            thinkingLevel: activeThinking,
            chatUIInstance: new NexusChatUI(mainContainer, {
                isNexus: true,
                skipInputSetup: true,
                onSubmit: (text, images, extra) => handleSubmit(text, images, extra, singleTab)
            }),
            isHistoryLoaded: false
        };
        singleTab.chatUIInstance.historyEl = initialHistory;
        singleTab.chatUIInstance.activeTabModel = singleTab.selectedModel ? { ...singleTab.selectedModel } : null;
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
    } catch (e) {
        console.error('[Nexus] initTabs failed:', e);
    }
    const primaryC = document.querySelector('.nexus-chat-container');
    bindContainerWheelForward(primaryC);
    const newTabBtn = document.getElementById('new-tab-btn');
    if (newTabBtn) {
        const newBtn = newTabBtn.cloneNode(true);
        newTabBtn.parentNode.replaceChild(newBtn, newTabBtn);
        newBtn.addEventListener('click', () => createTab());
    }
    const topbarNewChatBtn = document.getElementById('topbar-new-chat-btn');
    if (topbarNewChatBtn) {
        topbarNewChatBtn.addEventListener('click', () => resetChat());
    }
    const topbarMoreBtn = document.getElementById('topbar-more-btn');
    if (topbarMoreBtn) {
        topbarMoreBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            renderDropdownMenu(topbarMoreBtn);
        });
    }
    updateTopbarMenuVisibility();
    window.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
            e.preventDefault();
            if (typeof NexusSync !== 'undefined' && typeof NexusSync.syncData === 'function') {
                NexusSync.syncData(false).catch(err => {
                    console.error('[Nexus] Manual sync via shortcut failed:', err);
                });
            }
            return;
        }
        if ((e.metaKey || e.ctrlKey) && e.key === 't') {
            e.preventDefault();
            createTab();
            return;
        }
        if ((e.metaKey || e.ctrlKey) && e.key === 'w') {
            e.preventDefault();
            if (activeTabIndex >= 0 && tabs[activeTabIndex]) {
                closeTab(tabs[activeTabIndex].id);
            }
            return;
        }
        if ((e.metaKey || e.ctrlKey) && (e.key === 'n' || e.key.toLowerCase() === 'o')) {
            e.preventDefault();
            resetChat();
            return;
        }
    }, true);
    updatePaneBlankState();
}

function createTab(switchToIt = true) {
    resetChat();
}

function switchTab(targetIndex, skipScrollRestore = false) {
    if (targetIndex < 0 || targetIndex >= tabs.length) return;
    const currentTab = tabs[activeTabIndex];
    if (currentTab && sharedInputUI) {
        sharedInputUI.saveTabState(currentTab);
    }
    tabs.forEach(t => {
        if (t.historyEl) t.historyEl.style.display = 'none';
    });
    activeTabIndex = targetIndex;
    const activeTab = tabs[activeTabIndex];
    ensureTabHistoryLoaded(activeTab);
    const mainContainer = document.querySelector('.nexus-chat-container');
    if (activeTab.historyEl && mainContainer && !mainContainer.contains(activeTab.historyEl)) {
        mainContainer.appendChild(activeTab.historyEl);
    }
    if (activeTab.historyEl) activeTab.historyEl.style.display = 'block';
    chatUI = activeTab.chatUIInstance;
    if (chatUI) chatUI.inputPaneEl = document.getElementById('input-area');
    const sidKey = activeTab.sessionId || 'null';
    const savedSettings = sessionSettings[sidKey] || {};
    activeTab.selectedModel = activeTab.selectedModel || savedSettings.selectedModel || null;
    activeTab.thinkingLevel = activeTab.thinkingLevel || savedSettings.thinkingLevel || null;
    if (sharedInputUI) {
        sharedInputUI.attachTab(activeTab);
    }
    updateInputPlaceholder();
    syncTabUI(activeTab, false, skipScrollRestore);
    loadCurrentWebSelection(activeTab?.id || null);
    updateWebChips();
    if (typeof window.updateModelSelector === 'function') {
        window.updateModelSelector();
    }
    renderTabs();
    saveTabsState();
    if (activeTab && activeTab.sessionId) {
        updateUrlSessionId(activeTab.sessionId);
    }
    if (window.NexusAnnotation) {
        NexusAnnotation.clearAllHighlights();
        NexusAnnotation.loadHighlights(activeTab.id);
    }
}

function syncTabUI(tab, skipScrollRestore = false) {
    if (!tab || !tab.historyEl) return;
    if (tab.scrollTop !== -1) {
        tab.historyEl.scrollTop = tab.scrollTop;
    }
    const allEntries = tab.historyEl.querySelectorAll('.nexus-entry');
    if (allEntries.length > 0) {
        const lastEntry = allEntries[allEntries.length - 1];
        requestAnimationFrame(() => {
            if (tab.chatUIInstance && typeof tab.chatUIInstance.adjustEntryMargin === 'function') {
                tab.chatUIInstance.adjustEntryMargin(lastEntry, 'none');
            }
        });
    }
    const regenBtn = document.getElementById('nexus-regenerate-btn');
    if (regenBtn) {
        const hasEntry = tab.historyEl.querySelector('.nexus-entry, .nexus-translation-card');
        regenBtn.style.display = hasEntry ? 'flex' : 'none';
    }
    if (!skipScrollRestore) {
        scheduleScrollRestore(tab);
    }
}

function closeTab(tabId) {
    const tabIndex = tabs.findIndex(t => t.id === tabId);
    if (tabIndex === -1) return;
    const tabToRemove = tabs[tabIndex];
    tabs.splice(tabIndex, 1);
    if (tabToRemove.historyEl) tabToRemove.historyEl.remove();
    if (tabToRemove.sessionId) {
        chrome.storage.local.remove([`nexus_history_${tabToRemove.sessionId}`]);
    }
    const storageKeys = Object.keys(localStorage).filter(key =>
        key.startsWith(`${WEB_SOURCE_SELECTION_STORAGE_PREFIX}${tabId}_`)
    );
    storageKeys.forEach(key => localStorage.removeItem(key));
    tabs.forEach((t, i) => {
        t.id = `tab-${i + 1}`;
        if (t.historyEl) t.historyEl.id = `chat-history-tab-${i + 1}`;
    });
    tabCounter = tabs.length;
    if (tabs.length === 0) {
        createTab();
    } else {
        const nextIndex = Math.min(tabIndex, tabs.length - 1);
        switchTab(nextIndex);
    }
    saveTabsState();
}

function saveTabsState(forceSaveChat = false, saveHistory = true) {
    const tabsMetadata = tabs.map(tab => {
        const model = tab.selectedModel || sharedInputUI?.activeTabModel || tab.chatUIInstance?.activeTabModel || null;
        const thinking = tab.thinkingLevel || sharedInputUI?.thinkingLevel || tab.chatUIInstance?.thinkingLevel || null;
        tab.selectedModel = model;
        tab.thinkingLevel = thinking;
        if (tab.chatUIInstance) {
            tab.chatUIInstance.activeTabModel = model ? { ...model } : null;
            tab.chatUIInstance.thinkingLevel = thinking || null;
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
            selectedModel: model,
            thinkingLevel: thinking
        };
    });
    chrome.storage.local.set({
        [KEYS.tabs]: tabsMetadata,
        [KEYS.tabCounter]: tabCounter,
        [KEYS.activeTabIndex]: activeTabIndex,
        [GLOBAL_KEYS.tabs]: tabsMetadata,
        [GLOBAL_KEYS.tabCounter]: tabCounter,
        [GLOBAL_KEYS.activeTabIndex]: activeTabIndex
    });
    window._localSavedSessions = window._localSavedSessions || {};
    const activeTab = (activeTabIndex >= 0 ? tabs[activeTabIndex] : null);
    const isStreaming = !!(streamingTab && streamingTab.sessionId);
    const savedSessionIds = new Set();
    if (saveHistory && activeTab && activeTab.sessionId && activeTab.historyEl) {
        savedSessionIds.add(activeTab.sessionId);
        window._localSavedSessions[activeTab.sessionId] = Date.now();
        window._lastSavingHistoryEl = activeTab.historyEl;
        const suppressBroadcast = isStreaming && streamingTab.sessionId === activeTab.sessionId;
        if (typeof ChatHistoryManager !== 'undefined') {
            ChatHistoryManager.saveCurrentChat(activeTab.historyEl, activeTab.sessionId, activeTab.sparkId, forceSaveChat, {
                selectedModel: activeTab.selectedModel,
                thinkingLevel: activeTab.thinkingLevel
            }, suppressBroadcast);
        }
    }
    tabs.forEach(tab => {
        if (tab !== activeTab && tab.sessionId && tab.historyEl) {
            if (savedSessionIds.has(tab.sessionId)) {
                return;
            }
            savedSessionIds.add(tab.sessionId);
            window._localSavedSessions[tab.sessionId] = Date.now();
            const suppressBroadcast = isStreaming && streamingTab.sessionId === tab.sessionId;
            if (typeof ChatHistoryManager !== 'undefined') {
                ChatHistoryManager.saveCurrentChat(tab.historyEl, tab.sessionId, tab.sparkId, forceSaveChat, {
                    selectedModel: tab.selectedModel,
                    thinkingLevel: tab.thinkingLevel
                }, suppressBroadcast);
            }
        }
    });
}

function normalizeRestoredHistory(historyEl) {
    if (!historyEl) return;
    const entries = Array.from(historyEl.querySelectorAll('.nexus-entry'));
    entries.forEach((entry, idx) => {
        const isPastEntry = idx < entries.length - 1;
        const nextUserQuestion = isPastEntry && entries[idx + 1] ? (entries[idx + 1].querySelector('.nexus-chat-question')?.getAttribute('data-raw-text') || '').trim() : '';

        entry.querySelectorAll('.nexus-action-chip, .nexus-followup-btn').forEach(chip => {
            if (isPastEntry) {
                chip.disabled = true;
                chip.classList.add('is-disabled');
                const chipQuery = (chip.getAttribute('data-query') || '').trim();
                if (nextUserQuestion && chipQuery && (nextUserQuestion === chipQuery || nextUserQuestion.includes(chipQuery) || chipQuery.includes(nextUserQuestion))) {
                    chip.classList.add('is-clicked');
                }
            }
        });

        if (entry.__normalized) return;
        entry.__normalized = true;
        entry.style.removeProperty('min-height');
        let questionEl = entry.querySelector('.nexus-chat-question') || entry.querySelector('[data-entry-type]');
        if (!questionEl) return;
        const row = questionEl.closest('.nexus-question-row');
        const entryType = entry.dataset.entryType || 'qa';
        const pinBtn = row ? row.querySelector('.nexus-question-pin-btn') : null;
        const wasPinned = questionEl.classList.contains('is-pinned-question') ||
            (pinBtn && (pinBtn.classList.contains('is-active') || pinBtn.getAttribute('aria-pressed') === 'true'));
        if (pinBtn) pinBtn.remove();
        const rawText = questionEl.getAttribute('data-raw-text') || questionEl.textContent.trim();
        questionEl.className = `nexus-chat-question${entryType !== 'qa' ? ` ${entryType}-question` : ''}`;
        questionEl.dataset.entryType = entryType;
        questionEl.removeAttribute('contenteditable');
        questionEl.classList.remove('is-editing');
        if (wasPinned) {
            questionEl.classList.add('is-pinned-question');
        }
        const existingToolbar = questionEl.querySelector('.nexus-question-edit-toolbar, .nexus-answer-edit-toolbar');
        if (existingToolbar) existingToolbar.remove();
        const contentDiv = document.createElement('div');
        contentDiv.className = 'nexus-question-content';
        contentDiv.innerHTML = rawText
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\n/g, '<br>');
        questionEl.innerHTML = '';
        questionEl.appendChild(contentDiv);
        if (row) row.classList.remove('nexus-question-row-editing');
        if (pinBtn) {
            pinBtn.classList.toggle('is-active', !!wasPinned);
            pinBtn.setAttribute('aria-pressed', wasPinned ? 'true' : 'false');
            pinBtn.style.display = '';
        }
        if (typeof NexusChatUI !== 'undefined' && typeof NexusChatUI.injectQuestionActions === 'function') {
            NexusChatUI.injectQuestionActions(questionEl);
        }
        const nav = entry.querySelector('.nexus-answer-nav');
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
            if (parsedImages && Array.isArray(parsedImages.files) && parsedImages.files.length > 0) {
                parsedImages.files.forEach(file => {
                    if (file && file.attachmentId) {
                        const p = NexusAttachmentDB.get(file.attachmentId).then(async (blob) => {
                            if (blob) {
                                if (file.isImage) {
                                    const objectUrl = URL.createObjectURL(blob);
                                    const img = entry.querySelector(`img[data-attachment-id="${file.attachmentId}"]`);
                                    if (img) {
                                        img.src = objectUrl;
                                        img.onclick = (e) => {
                                            e.stopPropagation();
                                            const tab = (typeof tabs !== 'undefined' && typeof activeTabIndex !== 'undefined') ? tabs[activeTabIndex] : null;
                                            if (tab && tab.chatUIInstance) {
                                                tab.chatUIInstance.showImagePreview(objectUrl, img.alt);
                                            }
                                        };
                                    }
                                }
                                const dataUrl = await NexusAttachmentDB.blobToDataURL(blob);
                                if (dataUrl) {
                                    file.dataUrl = dataUrl;
                                }
                            }
                            hydratedFiles.push(file);
                        }).catch(err => {
                            console.error('Failed to hydrate attachment', file.attachmentId, err);
                            hydratedFiles.push(file);
                        });
                        promises.push(p);
                    } else {
                        hydratedFiles.push(file);
                    }
                });
            } else {
                const imgs = entry.querySelectorAll('img[data-attachment-id]');
                imgs.forEach(img => {
                    const attachmentId = img.dataset.attachmentId;
                    if (attachmentId) {
                        const p = NexusAttachmentDB.get(attachmentId).then(async (blob) => {
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
                                const dataUrl = await NexusAttachmentDB.blobToDataURL(blob);
                                if (dataUrl) {
                                    const fileObj = {
                                        name: img.alt || 'Image',
                                        mimeType: blob.type,
                                        isImage: true,
                                        dataUrl: dataUrl,
                                        attachmentId: attachmentId
                                    };
                                    hydratedFiles.push(fileObj);
                                }
                            }
                        }).catch(err => {
                            console.error('Failed to hydrate attachment', attachmentId, err);
                        });
                        promises.push(p);
                    }
                });
            }
            if (promises.length > 0) {
                Promise.all(promises).then(() => {
                    if (hydratedFiles.length > 0) {
                        questionEl._nexusImages = hydratedFiles;
                        entry._nexusImages = hydratedFiles;
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

function renderTabs() {
    const list = document.getElementById('tabs-list');
    if (!list) return;
    const newTabBtn = document.getElementById('new-tab-btn');
    list.innerHTML = '';
    tabs.forEach((tab, index) => {
        const tabEl = document.createElement('div');
        const isActive = index === activeTabIndex;
        tabEl.className = `nexus-tab ${isActive ? 'active' : ''}`;
        tabEl.dataset.tabIndex = index;
        tabEl.dataset.tabId = tab.id;
        const subTabEl = document.createElement('div');
        subTabEl.className = 'nexus-tab-sub';
        subTabEl.dataset.tabId = tab.id;

        const titleSpan = document.createElement('span');
        titleSpan.className = 'nexus-tab-title';
        titleSpan.textContent = tab.title;

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'nexus-tab-close';
        closeBtn.title = 'Close tab';
        closeBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12" />
            </svg>
        `;
        closeBtn.onclick = (e) => {
            e.stopPropagation();
            closeTab(tab.id);
        };

        subTabEl.onmousedown = (e) => {
            if (e.target.closest('.nexus-tab-close')) return;
            if (e.button !== 0) return;
            if (index !== activeTabIndex) {
                switchTab(index);
            }
        };

        subTabEl.appendChild(titleSpan);
        subTabEl.appendChild(closeBtn);
        tabEl.appendChild(subTabEl);
        list.appendChild(tabEl);
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
    const groupEls = Array.from(list.querySelectorAll('.nexus-tab'));
    const newTabBtn = document.getElementById('new-tab-btn');
    if (newTabBtn) groupEls.push(newTabBtn);
    const draggedWidth = initialRects[initialDraggedIndex].width;
    const currentLeftEdge = initialRects[initialDraggedIndex].left + totalDeltaX;
    const currentRightEdge = currentLeftEdge + draggedWidth;
    let newGroupPreviewTarget = -1;
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
    const groupEls = Array.from(list.querySelectorAll('.nexus-tab'));
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
        const [movedTab] = tabs.splice(initialDraggedIndex, 1);
        tabs.splice(targetIndex, 0, movedTab);
        if (activeTabIndex === initialDraggedIndex) {
            activeTabIndex = targetIndex;
        } else if (activeTabIndex > initialDraggedIndex && activeTabIndex <= targetIndex) {
            activeTabIndex--;
        } else if (activeTabIndex < initialDraggedIndex && activeTabIndex >= targetIndex) {
            activeTabIndex++;
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

function initAskSelection() {
    let lastMouseX = 0;
    let lastMouseY = 0;
    document.addEventListener('mousemove', (e) => {
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        if (window.NexusSelection) {
            NexusSelection.mouseCoords = { x: e.clientX, y: e.clientY };
        }
    }, { passive: true });
    if (window.NexusSelection) {
        NexusSelection.init({
            shadowRoot: null,
            onSubmit: (query, displayQuery, sourceEntry, range, isTranslate, isAudio) => {
                if (isAudio) {
                    playTTSAudio(displayQuery);
                    return;
                }
                if (isTranslate) {
                    const targetTab = tabs[activeTabIndex];
                    handleSubmit(query, [], { mode: 'translate' }, targetTab || null, displayQuery);
                    return;
                }
                if (window.NexusAnnotation && range) {
                    window.NexusAnnotation.highlight(range);
                }
                const targetTab = tabs[activeTabIndex];
                handleSubmit(query, [], { mode: 'qa' }, targetTab || null, displayQuery);
            },
            onTranslate: (text) => {
                const targetTab = tabs[activeTabIndex];
                handleSubmit(text, [], { mode: 'translate' }, targetTab || null, text);
            }
        });
    }
    document.addEventListener('mouseup', (e) => {
        if (window.NexusSelection && NexusSelection.isInteractingWithActionBar) return;
        const path = e.composedPath();
        const isInsideNexus = path.some(el => el.id === 'nexus-action-bar' || el.id === 'nexus-shadow-host' || (el.tagName && el.tagName.toLowerCase() === 'nexus-shadow-host'));
        if (isInsideNexus) return;
        setTimeout(() => {
            const targetEl = (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA'))
                ? e.target
                : (e.target && e.target.closest ? e.target.closest('input, textarea') : null);
            const activeElement = targetEl || (window.NexusSelection && NexusSelection.isInsideEditable() ? NexusSelection.getDeepActiveElement() : null);
            const isTextareaOrInput = activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA');

            if (isTextareaOrInput) {
                if (window.NexusSelection) NexusSelection.hide();
                return;
            }

            const sel = window.getSelection();
            const text = sel ? sel.toString().trim() : '';
            const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
            if (!range || text.length === 0) {
                const isHighlight = e.target.closest('.nexus-highlight') || (window.NexusAnnotation && NexusAnnotation.getHighlightAtCoords(e.clientX, e.clientY));
                if (window.NexusSelection && !isHighlight) NexusSelection.hide();
                return;
            }
            const commonNode = range.commonAncestorContainer;
            const isInsideAnswer = commonNode && (
                (commonNode.nodeType === 1 && commonNode.closest('.nexus-chat-answer')) ||
                (commonNode.parentNode && commonNode.parentNode.closest('.nexus-chat-answer'))
            );

            if (!isInsideAnswer) {
                const isHighlight = e.target.closest('.nexus-highlight') || (window.NexusAnnotation && NexusAnnotation.getHighlightAtCoords(e.clientX, e.clientY));
                if (window.NexusSelection && !isHighlight) NexusSelection.hide();
                return;
            }

            if (!askSelectionPopupEnabled || text.length === 0) {
                const isHighlight = e.target.closest('.nexus-highlight') || (window.NexusAnnotation && NexusAnnotation.getHighlightAtCoords(e.clientX, e.clientY));
                if (window.NexusSelection && !isHighlight) NexusSelection.hide();
                return;
            }

            if (window.NexusSelection) {
                NexusSelection.show(e.clientX, e.clientY, text, range);
            }
        }, 10);
    });
    document.addEventListener('keyup', (e) => {
        const selectionKeys = ['Shift', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
        if (!selectionKeys.includes(e.key)) return;

        setTimeout(() => {
            const activeElement = (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA'))
                ? document.activeElement
                : (window.NexusSelection && NexusSelection.isInsideEditable() ? NexusSelection.getDeepActiveElement() : null);
            const isTextareaOrInput = activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA');

            if (isTextareaOrInput) return;

            const sel = window.getSelection();
            const text = sel ? sel.toString().trim() : '';
            const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
            if (!range || text.length === 0) return;

            const commonNode = range.commonAncestorContainer;
            const isInsideAnswer = commonNode && (
                (commonNode.nodeType === 1 && commonNode.closest('.nexus-chat-answer')) ||
                (commonNode.parentNode && commonNode.parentNode.closest('.nexus-chat-answer'))
            );
            if (!isInsideAnswer) return;

            if (!askSelectionPopupEnabled) return;

            if (window.NexusSelection) {
                if (NexusSelection.btn && NexusSelection.btn.style.display === 'flex') {
                    NexusSelection.show(undefined, undefined, text, range, false);
                } else {
                    NexusSelection.show(lastMouseX, lastMouseY, text, range, true);
                }
            }
        }, 10);
    });
    document.addEventListener('click', (e) => {
        const path = e.composedPath();
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
    return typeof url === 'string' && (
        url.startsWith('http://') || 
        url.startsWith('https://') || 
        (url.startsWith('chrome-extension://') && url.includes('?sid='))
    );
}

function syncCurrentBrowserTab() {
    const queryOptions = isSidePanel ? { active: true, currentWindow: true } : { active: true, lastFocusedWindow: true };
    const handleTabResult = (activeTab) => {
        saveCurrentWebSelection();
        if (activeTab && typeof activeTab.url === 'string' && activeTab.url.startsWith('chrome-extension://')) {
            if (activeTab.url.includes('?sid=')) {
                currentBrowserTab = {
                    tabId: activeTab.id,
                    title: activeTab.title || 'Nexus Chat',
                    url: activeTab.url,
                    favIconUrl: activeTab.favIconUrl
                };
                loadCurrentWebSelection();
                updateWebChips();
                refreshWebSourceTokensForTab(activeTab.id);
                if (webTabPickerEl) {
                    refreshWebTabPicker();
                }
                return;
            }
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

function openWebTabPicker(anchorEl, nexusTabId = null) {
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
        const activeNexusTabId = nexusTabId || getCurrentNexusTabId();
        const selectedSources = activeNexusTabId ? getWebSelectionForScope(activeNexusTabId) : [];
        const selectedIds = new Set(selectedSources.map((source) => source.tabId));
        const picker = document.createElement('div');
        picker.className = 'nexus-web-tab-picker';
        const header = document.createElement('div');
        header.className = 'nexus-web-tab-picker-header';
        header.textContent = 'Select tabs';
        picker.appendChild(header);
        const list = document.createElement('div');
        list.className = 'nexus-web-tab-picker-list';
        if (availableTabs.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'nexus-web-tab-picker-empty';
            empty.textContent = 'No readable web tabs available';
            list.appendChild(empty);
        } else {
            availableTabs.forEach((tab) => {
                const row = document.createElement('label');
                row.className = 'nexus-web-tab-picker-item';
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.className = 'nexus-web-tab-picker-checkbox';
                checkbox.value = String(tab.tabId);
                checkbox.checked = selectedIds.has(tab.tabId);
                checkbox.addEventListener('change', () => {
                    const selectedSet = new Set(
                        Array.from(list.querySelectorAll('.nexus-web-tab-picker-checkbox:checked')).map((item) => Number(item.value))
                    );
                    const nextSelection = availableTabs
                        .filter((item) => selectedSet.has(item.tabId))
                        .map((item) => ({
                            tabId: item.tabId,
                            title: item.title,
                            url: item.url
                        }));
                    if (activeNexusTabId) {
                        saveWebSelectionForScope(activeNexusTabId, nextSelection);
                        const primaryTabId = getCurrentNexusTabId();
                        if (String(activeNexusTabId) === String(primaryTabId)) {
                            pinnedWebSources = nextSelection.map((item) => ({ ...item }));
                        }
                    }
                    updateWebChips();
                });
                const textWrap = document.createElement('div');
                textWrap.className = 'nexus-web-tab-picker-item-text';
                const titleEl = document.createElement('div');
                titleEl.className = 'nexus-web-tab-picker-item-title';
                titleEl.textContent = tab.title;
                const urlEl = document.createElement('div');
                urlEl.className = 'nexus-web-tab-picker-item-url';
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
        actions.className = 'nexus-web-tab-picker-actions';
        const clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'nexus-web-tab-picker-btn is-ghost';
        clearBtn.textContent = 'Clear';
        clearBtn.addEventListener('click', () => {
            if (activeNexusTabId) {
                saveWebSelectionForScope(activeNexusTabId, []);
                const primaryTabId = getCurrentNexusTabId();
                if (String(activeNexusTabId) === String(primaryTabId)) {
                    pinnedWebSources = [];
                }
            }
            list.querySelectorAll('.nexus-web-tab-picker-checkbox').forEach((checkbox) => {
                checkbox.checked = false;
            });
            updateWebChips();
            closeWebTabPicker();
        });
        const selectAllBtn = document.createElement('button');
        selectAllBtn.type = 'button';
        selectAllBtn.className = 'nexus-web-tab-picker-btn is-primary';
        selectAllBtn.textContent = 'Select All';
        selectAllBtn.addEventListener('click', () => {
            const checkboxList = list.querySelectorAll('.nexus-web-tab-picker-checkbox');
            checkboxList.forEach((checkbox) => {
                checkbox.checked = true;
            });
            const nextSelection = availableTabs.map((item) => ({
                tabId: item.tabId,
                title: item.title,
                url: item.url
            }));
            if (activeNexusTabId) {
                saveWebSelectionForScope(activeNexusTabId, nextSelection);
                const primaryTabId = getCurrentNexusTabId();
                if (String(activeNexusTabId) === String(primaryTabId)) {
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
        const wrapper = anchorEl.closest('.nexus-chat-input-wrapper') || anchorEl.closest('.nexus-input-container');
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
    if (url.startsWith('chrome-extension://')) {
        return 'Nexus';
    }
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

function createWebChipElement(source, selectedSources, nexusTabId) {
    const hasMultipleTabs = source.isSummary;
    const isGhost = source.isGhost;
    const chip = document.createElement('div');
    chip.className = `nexus-web-chip ${source.isActive ? 'is-active' : ''} ${isGhost ? 'is-ghost' : ''}`;
    const titleSpan = document.createElement('span');
    titleSpan.className = 'chip-title';
    chip.appendChild(titleSpan);

    if (source.isSummary) {
        const totalTokens = selectedSources.reduce((sum, s) => sum + (parseInt(s.tokens) || 0), 0);
        chip.dataset.tokens = totalTokens;
    } else {
        chip.dataset.tokens = parseInt(source.tokens) || 0;
    }
    if (!hasMultipleTabs) {
        let favIconUrl = source.favIconUrl;
        if (source.url && source.url.startsWith('chrome-extension://')) {
            favIconUrl = chrome.runtime.getURL('assets/icons/icon16.png');
        } else if (!favIconUrl && source.url) {
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
            chip.insertBefore(faviconImg, chip.firstChild);
        }
    }
    let displayName = source.displayTitle;
    if (!displayName && !hasMultipleTabs && source.url) {
        displayName = getDomainDisplayName(source.url);
    }
    titleSpan.textContent = displayName || (hasMultipleTabs ? source.title : formatHeadTailTitle(source.title || 'Untitled'));
    chip.addEventListener('click', (event) => {
        event.stopPropagation();
        const container = chip.closest('.nexus-web-chips');
        if (container) container.dataset.muteTooltips = 'true';
        if (window.NexusChatUI && typeof NexusChatUI.prototype._hideTagTooltip === 'function') {
            try { NexusChatUI.prototype._hideTagTooltip(); } catch (e) { }
        }
        if (source.isSummary) {
            saveWebSelectionForScope(nexusTabId, []);
            const activeId = activeTabIndex >= 0 && tabs[activeTabIndex] ? tabs[activeTabIndex].id : null;
            if (String(nexusTabId) === String(activeId)) {
                pinnedWebSources = [];
            }
            updateWebChips();
            return;
        }
        if (isGhost) {
            toggleWebSourcePin(source, true, nexusTabId);
        } else {
            toggleWebSourcePin(source, null, nexusTabId);
        }
    });
    return chip;
}

function updateWebChips() {
    if (window.NexusChatUI && typeof NexusChatUI.prototype._hideTagTooltip === 'function') {
        try { NexusChatUI.prototype._hideTagTooltip(); } catch (e) { }
    }
    const containers = document.querySelectorAll('.nexus-web-chips');
    containers.forEach(container => {
        const nexusTabId = getNexusTabIdForPane(container);
        if (!nexusTabId) {
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
        const selectedSources = getWebSelectionForScope(nexusTabId);
        const onValidWebPage = currentBrowserTab && isWebPageUrl(currentBrowserTab.url);
        let newFingerprint = '';
        if (onValidWebPage) {
            const currentTabId = String(currentBrowserTab.tabId);
            const isCurrentPinned = selectedSources.some(s => String(s.tabId) === currentTabId);
            const tokens = currentBrowserTabTokens.get(currentTabId) || 0;
            newFingerprint = `${currentTabId}|${isCurrentPinned ? 'active' : 'ghost'}|${tokens}|${currentBrowserTab.title || ''}`;
        }
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
                container.appendChild(createWebChipElement(activeData, selectedSources, nexusTabId));
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
                container.appendChild(createWebChipElement(ghostData, selectedSources, nexusTabId));
            }
        }
    });
    scheduleVisibleTabsMinHeightReflow();
}

function scheduleVisibleTabsMinHeightReflow() {
    const chatLayout = document.getElementById('chat-layout');
    if (chatLayout && (chatLayout.style.display === 'none' || window.getComputedStyle(chatLayout).display === 'none')) {
        return;
    }
    if (minHeightReflowRaf) {
        cancelAnimationFrame(minHeightReflowRaf);
        minHeightReflowRaf = null;
    }
    minHeightReflowRaf = requestAnimationFrame(() => {
        minHeightReflowRaf = null;
        const visibleTabIndexes = [activeTabIndex];
        visibleTabIndexes.forEach((index) => {
            const tab = tabs[index];
            if (!tab?.historyEl || typeof tab.chatUIInstance?.setInitialEntryHeight !== 'function') return;
            const allEntries = tab.historyEl.querySelectorAll('.nexus-entry');
            if (!allEntries.length) return;
            const latestEntry = allEntries[allEntries.length - 1];
            tab.chatUIInstance.setInitialEntryHeight(latestEntry, true);
        });
    });
}

function toggleWebSourcePin(source, forceState = null, nexusTabId = null) {
    if (!source || !isWebPageUrl(source.url)) return;
    const targetNexusTabId = nexusTabId || getCurrentNexusTabId();
    if (!targetNexusTabId) return;
    const currentSelection = getWebSelectionForScope(targetNexusTabId);
    const idx = currentSelection.findIndex(p => String(p.tabId) === String(source.tabId));
    if (idx > -1) {
        if (forceState === true) {
            currentSelection[idx] = {
                tabId: source.tabId,
                title: source.title || currentSelection[idx].title || 'Untitled',
                url: source.url || currentSelection[idx].url
            };
            saveWebSelectionForScope(targetNexusTabId, currentSelection);
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
    saveWebSelectionForScope(targetNexusTabId, currentSelection);
    const activeTabId = activeTabIndex >= 0 && tabs[activeTabIndex] ? tabs[activeTabIndex].id : null;
    if (String(targetNexusTabId) === String(activeTabId)) {
        pinnedWebSources = currentSelection.map((item) => ({ ...item }));
    }
    updateWebChips();
}

async function init() {
    if (isInitializing) return;
    isInitializing = true;
    await new Promise((resolve) => {
        if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.getCurrent) {
            chrome.tabs.getCurrent((tab) => {
                if (tab && tab.id) {
                    const storedTabId = sessionStorage.getItem('nexus_tab_id');
                    if (storedTabId && storedTabId !== String(tab.id)) {
                        const newInstId = 'inst_' + Date.now() + Math.random().toString(36).substr(2, 5);
                        sessionStorage.setItem('nexus_nexus_instance_id', newInstId);
                        KEYS.tabs = `${STORAGE_PREFIX}_tabs_${newInstId}`;
                        KEYS.tabCounter = `${STORAGE_PREFIX}_tab_counter_${newInstId}`;
                        KEYS.activeTabIndex = `${STORAGE_PREFIX}_active_tab_index_${newInstId}`;
                        KEYS.tabGroups = `${STORAGE_PREFIX}_tab_groups_${newInstId}`;
                        KEYS.activeGroupIndex = `${STORAGE_PREFIX}_active_group_index_${newInstId}`;
                        KEYS.groupCounter = `${STORAGE_PREFIX}_group_counter_${newInstId}`;
                    }
                    sessionStorage.setItem('nexus_tab_id', String(tab.id));
                    resolve();
                } else if (chrome.windows && chrome.windows.getCurrent) {
                    chrome.windows.getCurrent((win) => {
                        if (win && win.id) {
                            myWindowId = win.id;
                            const storedWinId = sessionStorage.getItem('nexus_window_id');
                            if (storedWinId && storedWinId !== String(win.id)) {
                                const newInstId = 'inst_' + Date.now() + Math.random().toString(36).substr(2, 5);
                                sessionStorage.setItem('nexus_nexus_instance_id', newInstId);
                                KEYS.tabs = `${STORAGE_PREFIX}_tabs_${newInstId}`;
                                KEYS.tabCounter = `${STORAGE_PREFIX}_tab_counter_${newInstId}`;
                                KEYS.activeTabIndex = `${STORAGE_PREFIX}_active_tab_index_${newInstId}`;
                                KEYS.tabGroups = `${STORAGE_PREFIX}_tab_groups_${newInstId}`;
                                KEYS.activeGroupIndex = `${STORAGE_PREFIX}_active_group_index_${newInstId}`;
                                KEYS.groupCounter = `${STORAGE_PREFIX}_group_counter_${newInstId}`;
                            }
                            sessionStorage.setItem('nexus_window_id', String(win.id));
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
    if (window.NexusSelection?.hide) {
        try {
            window.NexusSelection.hide();
        } catch (e) {
            console.warn('[Nexus] Failed to hide stale selection popup:', e);
        }
    }
    document.querySelectorAll('.nexus-overlay-backdrop').forEach(el => el.remove());
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
    document.querySelectorAll('.nexus-chat-scroll-content').forEach(el => {
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
        document.querySelectorAll('.nexus-chat-scroll-content').forEach(el => {
            if (!el.__observedForScrollbar) {
                el.__observedForScrollbar = true;
                observer.observe(el);
                const hasScroll = el.scrollHeight > el.clientHeight;
                el.classList.toggle('has-scrollbar', hasScroll);
            }
        });
    });
    mutationObserver.observe(document.body, { childList: true, subtree: true });
    document.querySelectorAll('.nexus-chat-scroll-content').forEach(el => {
        if (!el.__observedForScrollbar) {
            el.__observedForScrollbar = true;
            observer.observe(el);
            const hasScroll = el.scrollHeight > el.clientHeight;
            el.classList.toggle('has-scrollbar', hasScroll);
        }
    });
    initAskSelection();
    const inputArea = document.getElementById('input-area');
    if (inputArea) {
        inputArea.innerHTML = NexusChatUI.getChatInputHTML(true);
        sharedInputUI = new NexusChatUI(inputArea, {
            isNexus: true,
            isPrimaryInput: true,
            alwaysExpanded: true,
            onSubmit: (text, images, extra) => {
                const activeTab = tabs[activeTabIndex];
                if (activeTab) handleSubmit(text, images, extra, activeTab);
            }
        });
        window.sharedInputUI = sharedInputUI;
        window.tabs = tabs;
        window.getActiveTabIndex = () => activeTabIndex;
        window.getActiveTab = () => tabs[activeTabIndex];
    }
    shouldStartNewChat = false;
    try {
        const win = await new Promise((resolve) => chrome.windows.getCurrent(resolve));
        if (win && win.id) {
            myWindowId = win.id;
            const key = `pending_sidepanel_query_${win.id}`;
            const storageData = await chrome.storage.local.get([key, 'nexusWindowId']);
            if (storageData[key] && storageData[key].createNewChat) {
                shouldStartNewChat = true;
            }
            if (!isSidePanel && win.id !== storageData.nexusWindowId) {
                isWebApp = true;
            }
        }
    } catch (e) {
        console.error('[Nexus] Failed to check pending query before initTabs:', e);
    }
    await initTabs();
    if (tabs.length === 0) {
        createTab();
    } else {
        if (tabs[activeTabIndex]) {
            chatUI = tabs[activeTabIndex].chatUIInstance;
            if (sharedInputUI) {
                sharedInputUI.attachTab(tabs[activeTabIndex]);
            }
        }
    }
    initModelSelector('primary');
    updateInputPlaceholder();
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
    setupPort();
    setupRegenerateButtons();
    chrome.storage.local.get(['fontSize', 'shortcuts', 'annotationShortcuts', 'globalDefaults', 'questionMappings', 'askSelectionPopupEnabled', 'readWebpage', 'advancedParamsByModel', 'pendingMicToggle', 'theme', 'contrast', 'accentColor', 'fontFamily', 'fontWeight'], (items) => {
        if (items.readWebpage !== undefined) readWebpageEnabled = !!items.readWebpage;
        shortcuts = items.shortcuts || {};
        if (shortcuts.undefined !== undefined) {
            delete shortcuts.undefined;
            chrome.storage.local.set({ shortcuts: shortcuts });
        }
        annotationShortcuts = items.annotationShortcuts || [];
        questionMappings = items.questionMappings || [];
        askSelectionPopupEnabled = items.askSelectionPopupEnabled ?? false;
        advancedParamsByModel = items.advancedParamsByModel || {};
        const themeVal = items.theme || (items.globalDefaults && items.globalDefaults.theme) || 'auto';
        const contrastVal = items.contrast || (items.globalDefaults && items.globalDefaults.contrast) || 'auto';
        const accentVal = items.accentColor || (items.globalDefaults && items.globalDefaults.accentColor) || 'default';
        const fontFamilyVal = items.fontFamily || 'default';
        const fontWeightVal = items.fontWeight || '400';
        let mode = themeVal === 'auto' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : themeVal;
        if (typeof chrome !== 'undefined' && chrome.extension && chrome.extension.inIncognitoContext) {
            mode = 'dark';
        }
        document.body.setAttribute('data-theme', mode);
        document.body.setAttribute('data-accent', accentVal);
        document.body.setAttribute('data-contrast', contrastVal);
        document.body.className = document.body.className.replace(/\bnexus-font-\S+/g, '');
        document.body.classList.add(`nexus-font-${fontFamilyVal}`);
        document.documentElement.style.setProperty('--nexus-weight-base', fontWeightVal);
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
            if (changes.fontFamily) {
                const fontFamilyVal = changes.fontFamily.newValue || 'default';
                document.body.className = document.body.className.replace(/\bnexus-font-\S+/g, '');
                document.body.classList.add(`nexus-font-${fontFamilyVal}`);
            }
            if (changes.fontWeight) {
                const fontWeightVal = changes.fontWeight.newValue || '400';
                document.documentElement.style.setProperty('--nexus-weight-base', fontWeightVal);
            }
            if (changes.shortcuts) shortcuts = changes.shortcuts.newValue || {};
            if (changes.annotationShortcuts) annotationShortcuts = changes.annotationShortcuts.newValue || [];
            if (changes.questionMappings) questionMappings = changes.questionMappings.newValue || [];
            if (changes.askSelectionPopupEnabled) {
                askSelectionPopupEnabled = changes.askSelectionPopupEnabled.newValue ?? false;
                if (!askSelectionPopupEnabled && window.NexusSelection) NexusSelection.hide();
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
            console.log('[Nexus] Skipping stale pending query:', queryId);
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
    document.addEventListener('nexus:model-change', (e) => {
        const activeTab = tabs[activeTabIndex];
        if (activeTab && e.detail) {
            if (e.detail.model) {
                activeTab.selectedModel = { model: e.detail.model, providerId: e.detail.providerId };
            }
            if (e.detail.thinkingLevel !== undefined) {
                activeTab.thinkingLevel = e.detail.thinkingLevel;
            }
            if (activeTab.chatUIInstance) {
                if (activeTab.selectedModel) activeTab.chatUIInstance.activeTabModel = { ...activeTab.selectedModel };
                if (activeTab.thinkingLevel) activeTab.chatUIInstance.thinkingLevel = activeTab.thinkingLevel;
            }
            if (sharedInputUI) {
                if (activeTab.selectedModel) sharedInputUI.activeTabModel = { ...activeTab.selectedModel };
                if (activeTab.thinkingLevel) sharedInputUI.thinkingLevel = activeTab.thinkingLevel;
            }
            const sidKey = activeTab.sessionId || 'null';
            sessionSettings[sidKey] = {
                ...(sessionSettings[sidKey] || {}),
                ...(activeTab.selectedModel ? { selectedModel: activeTab.selectedModel } : {}),
                ...(activeTab.thinkingLevel ? { thinkingLevel: activeTab.thinkingLevel } : {})
            };
            chrome.storage.local.set({ 
                nexus_session_settings: sessionSettings,
                ...(activeTab.selectedModel ? { lastUsedModel: activeTab.selectedModel } : {}),
                ...(activeTab.thinkingLevel ? { lastUsedThinkingLevel: activeTab.thinkingLevel } : {})
            });
            if (typeof saveTabsState === 'function') {
                saveTabsState();
            }
        }
    });
    chrome.runtime.onMessage.addListener((request) => {
        if (request.action === 'nexus_session_updated') {
            const sid = request.sessionId;
            if (request.senderInstanceId && request.senderInstanceId === window._nexusWindowInstanceId) {
                return;
            }
            const affected = tabs.filter(t => t.sessionId === sid);
            if (affected.length > 0) {
                const isRecentLocalSave = window._localSavedSessions?.[sid] && (Date.now() - window._localSavedSessions[sid] < 3000);
                if (!isRecentLocalSave) {
                    const isGeneratingLocally = (
                        (sharedInputUI && sharedInputUI.isGenerating && streamingTab && streamingTab.sessionId === sid)
                    );
                    if (!isGeneratingLocally) {
                        Promise.all([
                            NexusChatDB.getMessages(sid),
                            NexusChatDB.getSession(sid)
                        ]).then(([messages, meta]) => {
                            if (messages) {
                                const chatData = {
                                    ...meta,
                                    messages: messages,
                                    sessionId: sid,
                                    timestamp: meta?.createdAt || meta?.updatedAt
                                };
                                 affected.forEach(async (tab) => {
                                     if (tab.historyEl) {
                                        const lastMsg = messages[messages.length - 1];
                                        if (!lastMsg || lastMsg.type === 'question') return;

                                        const currentEntries = Array.from(tab.historyEl.querySelectorAll('.nexus-entry'));
                                        const expectedQuestions = messages.filter(m => m.type === 'question');

                                        // 1. In-place update: If the number of questions matches, update the existing entry without wiping the DOM
                                        if (currentEntries.length > 0 && currentEntries.length === expectedQuestions.length) {
                                            const lastEntry = currentEntries[currentEntries.length - 1];
                                            const lastMsgAnswer = messages.filter(m => m.type === 'answer').pop();
                                            if (lastEntry && lastMsgAnswer) {
                                                let ansDiv = lastEntry.querySelector('.nexus-chat-answer');
                                                if (ansDiv) {
                                                    const rawContent = lastMsgAnswer.content || '';
                                                    const displayContent = rawContent.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').trim();
                                                    if (ansDiv.getAttribute('data-raw-text') !== rawContent) {
                                                        ansDiv.setAttribute('data-raw-text', rawContent);
                                                        if (typeof marked !== 'undefined') {
                                                            ansDiv.innerHTML = marked.parse(displayContent);
                                                        } else {
                                                            ansDiv.textContent = displayContent;
                                                        }
                                                        if (window.NexusChatUI && typeof window.NexusChatUI.processContainer === 'function') {
                                                            window.NexusChatUI.processContainer(ansDiv);
                                                        }
                                                    }
                                                    return;
                                                }
                                            }
                                        }
                                        // 2. Full restore for new entries — non-Stream Owner: no scroll manipulation
                                        const savedScrollTop = tab.historyEl.scrollTop;

                                        await ChatHistoryManager.restoreChat(chatData, tab.historyEl);
                                        normalizeRestoredHistory(tab.historyEl);
                                        if (tab.chatUIInstance) tab.chatUIInstance.syncStateFromDOM();

                                        const newEntries = tab.historyEl.querySelectorAll('.nexus-entry');
                                        const lastEntry = newEntries[newEntries.length - 1];
                                        if (lastEntry && tab.chatUIInstance) {
                                            tab.chatUIInstance.updateEntryMinHeight(lastEntry);
                                            tab.chatUIInstance.adjustEntryMargin(lastEntry, 'immediate');
                                        }

                                        tab.historyEl.scrollTop = savedScrollTop;
                                    }
                                });
                            }
                        });
                    }
                }
            }
        } else if (request.action === 'nexus_sessions_deleted') {
            const deletedIds = request.deletedIds || [];
            if (deletedIds.length > 0) {
                let updated = false;
                tabs.forEach((tab, index) => {
                    if (tab.sessionId && deletedIds.includes(tab.sessionId)) {
                        const isActive = (index === activeTabIndex);
                        if (isActive) {
                            if (sharedInputUI && sharedInputUI.isGenerating) {
                                console.log('[Nexus] Suppressing resetChat on active generation for tab:', tab.sessionId);
                            } else {
                                resetChat();
                                updated = true;
                            }
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
        } else if (request.action === 'nexus_sessions_index_updated') {
            if (typeof renderRecentChatsSidebar === 'function') {
                renderRecentChatsSidebar();
            }
            if (typeof NexusChatDB !== 'undefined' && Array.isArray(tabs)) {
                let tabsUpdated = false;
                Promise.all(tabs.map(async (tab) => {
                    if (tab && tab.sessionId) {
                        const meta = await NexusChatDB.getSession(tab.sessionId).catch(() => null);
                        if (meta && (meta.isRenamed || meta.autoNamed) && meta.title && tab.title !== meta.title) {
                            tab.title = meta.title;
                            tabsUpdated = true;
                        }
                    }
                })).then(() => {
                    if (tabsUpdated) {
                        renderTabs();
                        if (typeof renderSidebarTabs === 'function') renderSidebarTabs();
                    }
                });
            }
        } else if (request.action === 'nexus_notes_updated') {
            if (typeof nexusNotesPanelInstance !== 'undefined' && nexusNotesPanelInstance) {
                if (typeof nexusNotesPanelInstance.renderCollections === 'function') nexusNotesPanelInstance.renderCollections();
                if (typeof nexusNotesPanelInstance.renderNotesList === 'function') nexusNotesPanelInstance.renderNotesList();
            }
        } else if (request.action === 'nexus_tts_updated') {
            if (typeof nexusTTSPanelInstance !== 'undefined' && nexusTTSPanelInstance) {
                if (typeof nexusTTSPanelInstance.loadRecordings === 'function') nexusTTSPanelInstance.loadRecordings();
            }
        } else if (request.action === 'nexus_apps_updated') {
            if (typeof nexusAppsPanelInstance !== 'undefined' && nexusAppsPanelInstance) {
                nexusAppsPanelInstance.loadCustomApps().then(() => {
                    if (typeof nexusAppsPanelInstance.renderCatalog === 'function') nexusAppsPanelInstance.renderCatalog();
                    if (nexusAppsPanelInstance.currentApp && nexusAppsPanelInstance.customApps[nexusAppsPanelInstance.currentApp.id]) {
                        nexusAppsPanelInstance.currentApp = nexusAppsPanelInstance.customApps[nexusAppsPanelInstance.currentApp.id];
                        if (typeof nexusAppsPanelInstance.renderChatMessages === 'function') nexusAppsPanelInstance.renderChatMessages();
                        if (typeof nexusAppsPanelInstance.refreshStudioPreview === 'function') nexusAppsPanelInstance.refreshStudioPreview();
                    }
                });
            }
        } else if (request.action === 'settings_updated') {
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
                    console.log('[Nexus] Ignoring duplicate query via message:', queryId);
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
        } else if (request.action === 'nexus_active_session_changed') {
            if (isSidePanel) {
                chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabsList) => {
                    const activeTab = tabsList && tabsList[0];
                    if (activeTab && typeof activeTab.url === 'string' && activeTab.url.startsWith('chrome-extension://')) {
                        let newUrl = activeTab.url;
                        try {
                            const urlObj = new URL(activeTab.url);
                            urlObj.searchParams.set('sid', request.sessionId);
                            newUrl = urlObj.toString();
                        } catch (e) {}
                        currentBrowserTab = {
                            tabId: activeTab.id,
                            title: 'Nexus',
                            url: newUrl,
                            favIconUrl: activeTab.favIconUrl
                        };
                        loadCurrentWebSelection();
                        updateWebChips();
                        refreshWebSourceTokensForTab(activeTab.id);
                        if (webTabPickerEl) {
                            refreshWebTabPicker();
                        }
                    }
                });
            }
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
                const port = chrome.runtime.connect({ name: 'nexus-sidepanel' });
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
        const sidebar = document.getElementById('nexus-sidebar');
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
            const sidebar = document.getElementById('nexus-sidebar');
            const el = getHoveredInputEl();
            if (el && (!sidebar || !sidebar.classList.contains('active'))) setCursorToEnd(el);
        }, 50);
        setTimeout(() => {
            const sidebar = document.getElementById('nexus-sidebar');
            const el = getHoveredInputEl();
            if (el && (!sidebar || !sidebar.classList.contains('active'))) setCursorToEnd(el);
        }, 150);
    }
    ensureFocus();
    window.addEventListener('focus', () => {
        const selection = window.getSelection().toString().trim();
        if (selection && (selection.includes('--nexus-') || selection.includes('var(--nexus'))) {
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
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('settings') === '1' || urlParams.get('section')) {
        setTimeout(() => {
            if (typeof NexusSettingsModal !== 'undefined') {
                NexusSettingsModal.show();
                const section = urlParams.get('section');
                if (section) {
                    NexusSettingsModal.switchSection(section);
                }
            }
        }, 300);
    }
}

function initSidebar() {
    const sidebar = document.getElementById('nexus-sidebar');
    const toggleBtn = document.getElementById('sidebar-toggle-btn');
    const closeBtn = document.getElementById('sidebar-close-btn');
    const newChatBtn = document.getElementById('sidebar-new-chat-btn');
    const settingsBtn = document.getElementById('sidebar-settings-btn');
    const searchBtn = document.getElementById('sidebar-search-btn');
    let backdrop = document.querySelector('.sidebar-backdrop');
    if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.className = 'sidebar-backdrop';
        document.body.appendChild(backdrop);
    }
    const isCollapsed = localStorage.getItem('nexus_sidebar_collapsed') === 'true';
    if (isCollapsed && sidebar && !isSidePanel) {
        sidebar.classList.add('sidebar-collapsed');
    }
    const initStyle = document.getElementById('sidebar-init-style');
    if (initStyle) {
        initStyle.remove();
    }
    const toggleBtns = document.querySelectorAll('.sidebar-toggle-btn');
    if (toggleBtns.length > 0 && sidebar) {
        toggleBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (isSidePanel || window.innerWidth <= 768) {
                    if (sidebar.classList.contains('active')) {
                        closeMobileSidebar();
                    } else {
                        openMobileSidebar();
                    }
                } else {
                    sidebar.classList.toggle('sidebar-collapsed');
                    localStorage.setItem('nexus_sidebar_collapsed', sidebar.classList.contains('sidebar-collapsed'));
                }
            });
        });
    }
    if (sidebar) {
        sidebar.addEventListener('click', (e) => {
            if (isSidePanel || window.innerWidth <= 768) return;
            const clickedInteractive = e.target.closest('button, a, .recent-chat-item, .sidebar-spark-item, .sidebar-brand, .user-profile, input, select');
            if (!clickedInteractive) {
                if (sidebar.classList.contains('sidebar-collapsed')) {
                    sidebar.classList.remove('sidebar-collapsed');
                    localStorage.setItem('nexus_sidebar_collapsed', 'false');
                }
            }
        });
    }
    const openMobileSidebar = () => {
        if (sidebar && !sidebar.classList.contains('active')) {
            sidebar.classList.add('active');
            if (backdrop) backdrop.classList.add('active');
            document.body.classList.add('sidebar-open');
        }
    };
    const closeMobileSidebar = () => {
        if (sidebar) sidebar.classList.remove('active');
        if (backdrop) backdrop.classList.remove('active');
        document.body.classList.remove('sidebar-open');
    };

    const mobileMediaQuery = window.matchMedia('(max-width: 768px)');
    const handleMobileBreakpoint = (e) => {
        if (e.matches) {
            openMobileSidebar();
        } else {
            closeMobileSidebar();
        }
    };
    if (typeof mobileMediaQuery.addEventListener === 'function') {
        mobileMediaQuery.addEventListener('change', handleMobileBreakpoint);
    } else if (typeof mobileMediaQuery.addListener === 'function') {
        mobileMediaQuery.addListener(handleMobileBreakpoint);
    }
    if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (isSidePanel || window.innerWidth <= 768) {
                closeMobileSidebar();
            } else {
                sidebar.classList.add('sidebar-collapsed');
                localStorage.setItem('nexus_sidebar_collapsed', 'true');
            }
        });
    }
    if (backdrop) {
        backdrop.addEventListener('click', closeMobileSidebar);
    }
    if (newChatBtn) {
        newChatBtn.addEventListener('click', () => {
            if (typeof window.notesClosePage === 'function') window.notesClosePage();
            resetChat(null);
            closeMobileSidebar();
        });
    }
    const notesBtn = document.getElementById('sidebar-notes-btn');
    if (notesBtn) {
        notesBtn.addEventListener('click', () => {
            if (typeof window.sparksClosePage === 'function') window.sparksClosePage();
            if (typeof window.notesOpenPage === 'function') window.notesOpenPage();
            closeMobileSidebar();
        });
    }
    const ttsBtn = document.getElementById('sidebar-tts-btn');
    if (ttsBtn) {
        ttsBtn.addEventListener('click', () => {
            if (typeof window.ttsOpenPage === 'function') {
                window.ttsOpenPage();
            } else if (typeof viewManager !== 'undefined') {
                viewManager.switchView('tts');
            }
            closeMobileSidebar();
        });
    }
    const appsBtn = document.getElementById('sidebar-apps-btn');
    if (appsBtn) {
        appsBtn.addEventListener('click', () => {
            if (typeof window.appsOpenPage === 'function') {
                window.appsOpenPage();
            } else if (typeof viewManager !== 'undefined') {
                viewManager.switchView('apps');
            }
            closeMobileSidebar();
        });
    }
    const brandBtn = document.querySelector('.sidebar-brand');
    if (brandBtn) {
        brandBtn.style.cursor = 'pointer';
        brandBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (typeof window.notesClosePage === 'function') {
                window.notesClosePage();
            }
            if (typeof sparksClosePage === 'function') {
                sparksClosePage();
            }
            if (typeof window.appsClosePage === 'function') {
                window.appsClosePage();
            }
            resetChat();
            closeMobileSidebar();
        });
    }
    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            if (typeof NexusSettingsModal !== 'undefined') {
                NexusSettingsModal.show();
            } else {
                chrome.runtime.openOptionsPage();
            }
            closeMobileSidebar();
        });
    }
    if (searchBtn) {
        searchBtn.addEventListener('click', () => {
            if (typeof NexusSearchModal !== 'undefined') {
                NexusSearchModal.show();
            }
            closeMobileSidebar();
        });
    }
    const userProfileEl = document.querySelector('.user-profile');
    if (userProfileEl) {
        userProfileEl.style.cursor = 'pointer';
        userProfileEl.addEventListener('click', (e) => {
            e.stopPropagation();
            const isAuth = typeof NexusAuth !== 'undefined' && NexusAuth.isAuthenticated;
            const currentName = (isAuth && NexusAuth.user) ? (NexusAuth.user.name || "User") : "Nexus User";

            NexusMenu.show({
                anchor: userProfileEl,
                placement: 'top-start',
                items: [
                    {
                        label: currentName,
                        icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/></svg>`,
                        disabled: true
                    },
                    { divider: true },
                    {
                        label: 'Sync now',
                        icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>`,
                        action: () => {
                            if (typeof NexusSync !== 'undefined') {
                                NexusSync.syncUp().catch(err => console.error("Sync failed:", err));
                            }
                        }
                    },
                    {
                        label: isAuth ? 'Sign out' : 'Sign in',
                        danger: isAuth,
                        icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>`,
                        action: () => {
                            if (typeof NexusAuth !== 'undefined') {
                                if (NexusAuth.isAuthenticated) {
                                    NexusAuth.logout();
                                } else {
                                    NexusAuth.login();
                                }
                            }
                        }
                    }
                ]
            });
        });
    }
    renderRecentChatsSidebar();
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local') {
            if (changes[ChatHistoryManager.STORAGE_KEY]) {
                renderRecentChatsSidebar();
            }
            if (changes.nexus_sparks) {
                sparksCache = changes.nexus_sparks.newValue || {};
                updateInputPlaceholder();
            }
            if (changes.nexus_session_settings) {
                sessionSettings = changes.nexus_session_settings.newValue || {};
                const activeTab = (activeTabIndex >= 0 && tabs[activeTabIndex]) ? tabs[activeTabIndex] : null;
                if (activeTab) {
                    const sidKey = activeTab.sessionId || 'null';
                    if (sidKey !== 'null') {
                        const saved = sessionSettings[sidKey] || {};
                        if (saved.selectedModel && JSON.stringify(activeTab.selectedModel) !== JSON.stringify(saved.selectedModel)) {
                            activeTab.selectedModel = saved.selectedModel;
                            if (sharedInputUI) {
                                sharedInputUI.activeTabModel = { ...saved.selectedModel };
                            }
                            chrome.storage.local.get(['advancedParamsByModel'], (res) => {
                                const advParams = res.advancedParamsByModel || {};
                                const modelObj = saved.selectedModel;
                                const compositeKey = modelObj.providerId ? `${modelObj.providerId}:${modelObj.model}` : modelObj.model;
                                const modelParams = (modelObj.providerId && advParams[compositeKey]) ? advParams[compositeKey] : (!modelObj.providerId ? (advParams[modelObj.model] || {}) : {});
                                const defaultThinking = window.NexusModelHelper.getDefaultThinking(modelObj.model, modelObj.providerId);
                                const newThinkingLevel = modelParams.thinkingLevel || defaultThinking;
                                activeTab.thinkingLevel = newThinkingLevel;
                                if (activeTab.chatUIInstance) {
                                    activeTab.chatUIInstance.thinkingLevel = newThinkingLevel;
                                }
                                if (sharedInputUI) {
                                    sharedInputUI.thinkingLevel = newThinkingLevel;
                                    if (typeof sharedInputUI.refreshReasoningSelector === 'function') sharedInputUI.refreshReasoningSelector();
                                }
                                if (typeof saveTabsState === 'function') {
                                    saveTabsState();
                                }
                                if (sharedInputUI && typeof sharedInputUI.refreshModelSelector === 'function') {
                                    sharedInputUI.refreshModelSelector();
                                }
                                if (typeof window.updateModelSelector === 'function') {
                                    window.updateModelSelector();
                                }
                            });
                        }
                    }
                }
            }
        }
    });
}

function updateRecentChatsActiveState() {
    if (typeof NexusViewManager !== 'undefined' && NexusViewManager.currentView !== 'chat') {
        document.querySelectorAll('#sidebar-recent-chats .recent-chat-item, #sidebar-archived-chats .recent-chat-item').forEach(item => {
            item.classList.remove('active');
        });
        document.getElementById('sidebar-new-chat-btn')?.classList.remove('active');
        return;
    }

    const activeTab = (typeof tabs !== 'undefined' && activeTabIndex >= 0) ? tabs[activeTabIndex] : null;
    const activeSessionId = activeTab ? activeTab.sessionId : null;

    document.querySelectorAll('#sidebar-recent-chats .recent-chat-item, #sidebar-archived-chats .recent-chat-item').forEach(item => {
        const sid = item.dataset.sessionId;
        if (activeSessionId && sid === activeSessionId) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });

    document.getElementById('sidebar-new-chat-btn')?.classList.remove('active');
}

function updateSidebarSparksActiveState() {
    document.querySelectorAll('#sidebar-sparks-list .sidebar-spark-item.active').forEach(item => {
        item.classList.remove('active');
    });
}
window.updateSidebarSparksActiveState = updateSidebarSparksActiveState;

let recentChatsLimit = 30;
async function renderRecentChatsSidebar() {
    const listContainer = document.getElementById('sidebar-recent-chats');
    if (!listContainer) return;
    const sessions = await ChatHistoryManager.getAllHistories();
    const historyData = Object.values(sessions)
        .sort((a, b) => {
            const aPinned = !!a.pinned;
            const bPinned = !!b.pinned;
            if (aPinned !== bPinned) {
                return aPinned ? -1 : 1;
            }
            return b.updatedAt - a.updatedAt;
        });

    const recentData = historyData.filter(s => !s.archived);
    const archivedData = historyData.filter(s => !!s.archived);

    const sparksRes = await chrome.storage.local.get(['nexus_sparks']);
    const sparksMap = sparksRes.nexus_sparks || {};
    let html = '';
    
    const currentView = window.NexusViewManager?.currentView || document.querySelector('.nexus-main-content')?.getAttribute('data-active-view') || 'chat';
    const isChatView = currentView === 'chat';
    const activeTab = tabs[activeTabIndex];
    const activeSessionId = (isChatView && activeTab) ? activeTab.sessionId : null;

    if (recentData.length === 0) {
        html = '<div style="padding: 8px 12px; font-size: 12px; color: var(--nexus-sidebar-text-muted); text-align: center;">No recent chats</div>';
    } else {

        let activeIndex = -1;
        if (activeSessionId) {
            activeIndex = recentData.findIndex(s => s.id === activeSessionId);
        }
        if (activeIndex >= recentChatsLimit) {
            recentChatsLimit = Math.ceil((activeIndex + 1) / 30) * 30;
        }

        recentData.slice(0, recentChatsLimit).forEach(session => {
            let displayTitle = session.title;
            if (!session.isRenamed && !session.autoNamed && session.questions && session.questions.length > 0) {
                displayTitle = session.questions[session.questions.length - 1].text || "Untitled Chat";
            }
            if (!displayTitle) displayTitle = "Untitled Chat";
            let timeStr = '';
            const ts = session.updatedAt || session.createdAt;
            if (ts) {
                const d = new Date(ts);
                const today = new Date();
                const isToday = d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
                const timeOnly = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const dateOnly = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
                timeStr = isToday ? timeOnly : `${dateOnly}`;
            }
            let iconHTML = '';
            const isNamingClass = (window.namingSessionIds && window.namingSessionIds.has(session.id)) ? ' is-naming' : '';
            const isActive = session.id === activeSessionId ? ' active' : '';
            const pinHTML = session.pinned ? `
                <span class="recent-chat-item__pin-icon" title="Pinned">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 4h5a1 1 0 0 1 1 1v5.5c0 1.3 1.8 2.1 1.8 3.5a1.2 1.2 0 0 1-1.2 1.2H7.9a1.2 1.2 0 0 1-1.2-1.2c0-1.4 1.8-2.2 1.8-3.5V5a1 1 0 0 1 1-1Z"/><path d="M12 15.2v6.3"/></svg>
                </span>
            ` : '';
            const timeHTML = timeStr ? `<span class="recent-chat-item__time">${timeStr}</span>` : '';
            html += `
                <div class="recent-chat-item${isActive}${isNamingClass}" data-session-id="${session.id}" data-spark-id="${session.sparkId || ''}" data-title="${escapeHtml(displayTitle)}">
                    ${iconHTML}
                    <span class="recent-chat-item__title">${escapeHtml(displayTitle)}</span>
                    ${timeHTML}
                    ${pinHTML}
                    <button class="recent-chat-item__menu-btn" data-session-id="${session.id}" title="More options" tabindex="-1">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
                    </button>
                </div>
            `;
        });
        if (window.namingSessionIds && window.namingSessionIds.size > 0) {
            const storedIds = new Set(recentData.map(s => s.id));
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
    
    const savedScrollTop = listContainer.scrollTop;
    if (listContainer.innerHTML !== html) {
        listContainer.innerHTML = html;
        if (savedScrollTop) {
            listContainer.scrollTop = savedScrollTop;
            requestAnimationFrame(() => {
                listContainer.scrollTop = savedScrollTop;
            });
        }
    }

    const archiveSectionEl = document.getElementById('sidebar-archive-section');
    const archivedContainer = document.getElementById('sidebar-archived-chats');
    if (archiveSectionEl && archivedContainer) {
        if (archivedData.length > 0) {
            archiveSectionEl.style.display = 'block';
            let archiveHtml = '';
            archivedData.forEach(session => {
                let displayTitle = session.title;
                if (!session.isRenamed && !session.autoNamed && session.questions && session.questions.length > 0) {
                    displayTitle = session.questions[session.questions.length - 1].text || "Untitled Chat";
                }
                if (!displayTitle) displayTitle = "Untitled Chat";
                let timeStr = '';
                const ts = session.updatedAt || session.createdAt;
                if (ts) {
                    const d = new Date(ts);
                    const today = new Date();
                    const isToday = d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
                    const timeOnly = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    const dateOnly = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
                    timeStr = isToday ? timeOnly : `${dateOnly}`;
                }
                let iconHTML = '';
                const isNamingClass = (window.namingSessionIds && window.namingSessionIds.has(session.id)) ? ' is-naming' : '';
                const isActive = session.id === activeSessionId ? ' active' : '';
                const pinHTML = session.pinned ? `
                    <span class="recent-chat-item__pin-icon" title="Pinned">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 4h5a1 1 0 0 1 1 1v5.5c0 1.3 1.8 2.1 1.8 3.5a1.2 1.2 0 0 1-1.2 1.2H7.9a1.2 1.2 0 0 1-1.2-1.2c0-1.4 1.8-2.2 1.8-3.5V5a1 1 0 0 1 1-1Z"/><path d="M12 15.2v6.3"/></svg>
                    </span>
                ` : '';
                const timeHTML = timeStr ? `<span class="recent-chat-item__time">${timeStr}</span>` : '';
                archiveHtml += `
                    <div class="recent-chat-item${isActive}${isNamingClass}" data-session-id="${session.id}" data-spark-id="${session.sparkId || ''}" data-title="${escapeHtml(displayTitle)}">
                        ${iconHTML}
                        <span class="recent-chat-item__title">${escapeHtml(displayTitle)}</span>
                        ${timeHTML}
                        ${pinHTML}
                        <button class="recent-chat-item__menu-btn" data-session-id="${session.id}" title="More options" tabindex="-1">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
                        </button>
                    </div>
                `;
            });
            if (archivedContainer.innerHTML !== archiveHtml) {
                archivedContainer.innerHTML = archiveHtml;
            }
        } else {
            archiveSectionEl.style.display = 'none';
            if (archivedContainer.innerHTML !== '') {
                archivedContainer.innerHTML = '';
            }
        }
    }

    const attachScroll = (el) => {
        if (!el || el.__scrollListenerAttached) return;
        el.__scrollListenerAttached = true;
        el.addEventListener('scroll', () => {
            const threshold = 150;
            const position = el.scrollTop + el.clientHeight;
            const height = el.scrollHeight;
            if (height - position < threshold) {
                if (recentChatsLimit < recentData.length && !window.__loadingMoreRecentChats) {
                    window.__loadingMoreRecentChats = true;
                    recentChatsLimit += 30;
                    renderRecentChatsSidebar().then(() => {
                        window.__loadingMoreRecentChats = false;
                    }).catch(() => {
                        window.__loadingMoreRecentChats = false;
                    });
                }
            }
        });
    };

    attachScroll(listContainer.closest('.sidebar-scrollable-wrapper'));
    attachScroll(listContainer.closest('.sidebar-scrollable-content'));
    attachScroll(listContainer.closest('.nexus-sidebar'));

    const containers = [listContainer];
    if (archivedContainer) containers.push(archivedContainer);

    containers.forEach(container => {
        container.querySelectorAll('.recent-chat-item__menu-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const sid = btn.dataset.sessionId;
                const parentItem = btn.closest('.recent-chat-item');
                if (!sid) return;

                document.querySelectorAll('.recent-chat-item.ctx-active').forEach(el => el.classList.remove('ctx-active'));
                if (parentItem) parentItem.classList.add('ctx-active');

                const session = await NexusChatDB.getSession(sid);
                const isPinned = !!session?.pinned;
                const isArchived = !!session?.archived;

                NexusMenu.show({
                    anchor: btn,
                    placement: 'bottom-end',
                    items: [
                        {
                            label: isPinned ? 'Unpin' : 'Pin',
                            icon: isPinned 
                                ? `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="2" y1="2" x2="22" y2="22"></line><path d="M12 6.5 15 9.5l-1.5 1.5"></path><path d="m9 12-4.5 4.5 2 2 1-1 4-4"></path><line x1="7.5" y1="16.5" x2="3" y2="21"></line></svg>`
                                : `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m15 4.5 4.5 4.5-2 2-1-1-4.5 4.5 1 1-2 2-4.5-4.5 2-2 1 1 4.5-4.5-1-1 2-2Z"></path><line x1="8" y1="16" x2="3" y2="21"></line></svg>`,
                            action: async () => {
                                if (session) {
                                    if (!isPinned) {
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
                                    session.updatedAt = Date.now();
                                    await NexusChatDB.putSession(session);
                                    chrome.runtime.sendMessage({ action: 'nexus_sessions_index_updated' }).catch(() => {});
                                    if (typeof NexusSync !== 'undefined' && typeof NexusSync.triggerDebouncedSync === 'function') {
                                        NexusSync.triggerDebouncedSync();
                                    }
                                    if (session.isRenamed) {
                                        const activeTab = tabs[activeTabIndex];
                                        if (activeTab && activeTab.sessionId === sid) {
                                            activeTab.title = session.title;
                                            renderTabs();
                                        }
                                    }
                                    renderRecentChatsSidebar();
                                }
                            }
                        },
                        {
                            label: 'Rename',
                            icon: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path><path d="m15 5 4 4"></path></svg>`,
                            action: async () => {
                                const currentSession = await NexusChatDB.getSession(sid);
                                const oldTitle = currentSession ? currentSession.title : 'Untitled Chat';
                                const newTitle = await window.showCustomPopup({
                                    title: 'Rename Chat',
                                    body: '',
                                    isInput: true,
                                    defaultValue: oldTitle,
                                    confirmLabel: 'Rename'
                                });
                                if (newTitle && newTitle.trim()) {
                                    await ChatHistoryManager.renameChat(sid, newTitle.trim());
                                    const activeTab = tabs[activeTabIndex];
                                    if (activeTab && activeTab.sessionId === sid) {
                                        activeTab.title = newTitle.trim();
                                        renderTabs();
                                    }
                                    renderRecentChatsSidebar();
                                }
                            }
                        },
                        {
                            label: 'Generate title',
                            icon: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7V4h10v3"></path><path d="M9 4v16"></path><path d="M6 20h6"></path><path d="m19 10 .8 1.8a.5.5 0 0 0 .4.4l1.8.8-1.8.8a.5.5 0 0 0-.4.4L19 16l-.8-1.8a.5.5 0 0 0-.4-.4l-1.8-.8 1.8-.8a.5.5 0 0 0 .4-.4Z"></path></svg>`,
                            action: async () => {
                                const history = await ChatHistoryManager.getHistory(sid);
                                const fullText = (history || []).map(h => `${h.role}: ${h.text}`).join('\n\n');
                                if (!fullText.trim()) {
                                    if (typeof NexusToast !== 'undefined') NexusToast.show('No chat content to generate title.', 'info');
                                    return;
                                }
                                const currentModel = tabs[activeTabIndex]?.selectedModel || sharedInputUI?.activeTabModel || { model: 'gemini-2.5-flash', providerId: 'google' };
                                const chatItemEl = document.querySelector(`.recent-chat-item[data-session-id="${sid}"]`);
                                if (chatItemEl) chatItemEl.classList.add('is-naming');
                                if (typeof NexusToast !== 'undefined') NexusToast.show('✨ Generating chat title...', 'info');

                                chrome.runtime.sendMessage({
                                    action: 'generate_chat_title',
                                    modelObj: currentModel,
                                    question: fullText,
                                    images: null,
                                    files: null,
                                    history: []
                                }, async (res) => {
                                    if (chatItemEl) chatItemEl.classList.remove('is-naming');
                                    if (res && res.success && res.title) {
                                        const newTitle = res.title.trim();
                                        await ChatHistoryManager.renameChat(sid, newTitle);
                                        const updatedSession = await NexusChatDB.getSession(sid);
                                        if (updatedSession) {
                                            updatedSession.autoNamed = true;
                                            updatedSession.isRenamed = true;
                                            updatedSession.updatedAt = Date.now();
                                            await NexusChatDB.putSession(updatedSession);
                                            if (typeof NexusSync !== 'undefined' && typeof NexusSync.triggerDebouncedSync === 'function') {
                                                NexusSync.triggerDebouncedSync();
                                            }
                                        }
                                        if (typeof NexusToast !== 'undefined') NexusToast.show(`Title updated: "${newTitle}"`, 'success');
                                        renderRecentChatsSidebar();
                                        renderTabs();
                                    } else {
                                        if (typeof NexusToast !== 'undefined') NexusToast.show('Failed to generate title: ' + (res?.error || 'Unknown error'), 'error');
                                    }
                                });
                            }
                        },
                        {
                            label: isArchived ? 'Unarchive' : 'Archive',
                            icon: isArchived
                                ? `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="5" x="2" y="3" rx="1.5"></rect><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"></path><path d="m10 15 2-2 2 2"></path><path d="M12 13v4"></path></svg>`
                                : `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="5" x="2" y="3" rx="1.5"></rect><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"></path><path d="M10 12h4"></path></svg>`,
                            action: async () => {
                                const meta = await NexusChatDB.getSession(sid);
                                if (meta) {
                                    if (isArchived) {
                                        meta.archived = false;
                                        meta.updatedAt = Date.now();
                                        await NexusChatDB.putSession(meta);
                                        chrome.runtime.sendMessage({ action: 'nexus_sessions_index_updated' }).catch(() => {});
                                        if (typeof NexusSync !== 'undefined' && typeof NexusSync.triggerDebouncedSync === 'function') {
                                            NexusSync.triggerDebouncedSync();
                                        }
                                        renderRecentChatsSidebar();
                                    } else {
                                        let currentTitle = meta.title || 'Untitled Chat';
                                        if (!meta.isRenamed && !meta.autoNamed && meta.questions && meta.questions.length > 0) {
                                            currentTitle = meta.questions[meta.questions.length - 1].text || currentTitle;
                                        }
                                        const newTitle = await window.showCustomPopup({
                                            title: 'Archive Chat',
                                            body: 'Rename this chat to archive:',
                                            isInput: true,
                                            defaultValue: currentTitle,
                                            confirmLabel: 'Archive'
                                        });
                                        if (newTitle === null) return;
                                        meta.archived = true;
                                        if (newTitle.trim()) {
                                            meta.title = newTitle.trim();
                                            meta.isRenamed = true;
                                        }
                                        meta.updatedAt = Date.now();
                                        await NexusChatDB.putSession(meta);
                                        chrome.runtime.sendMessage({ action: 'nexus_sessions_index_updated' }).catch(() => {});
                                        if (typeof NexusSync !== 'undefined' && typeof NexusSync.triggerDebouncedSync === 'function') {
                                            NexusSync.triggerDebouncedSync();
                                        }
                                        renderRecentChatsSidebar();
                                    }
                                }
                            }
                        },
                        {
                            label: 'Delete',
                            icon: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`,
                            action: async () => {
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
                                            resetChat();
                                        }
                                    });
                                }
                            }
                        }
                    ],
                    onClose: () => {
                        if (parentItem) parentItem.classList.remove('ctx-active');
                    }
                });
            });
        });

        container.querySelectorAll('.recent-chat-item').forEach(item => {
            item.addEventListener('click', async (e) => {
                if (e.target.closest('.recent-chat-item__menu-btn')) return;
                const sid = item.dataset.sessionId;
                if (typeof window.NexusViewManager !== 'undefined') {
                    window.NexusViewManager.switchView('chat', { sid });
                } else if (typeof NexusViewManager !== 'undefined') {
                    NexusViewManager.switchView('chat', { sid });
                }
                document.querySelectorAll('.recent-chat-item.active').forEach(el => el.classList.remove('active'));
                document.querySelectorAll('#sidebar-sparks-list .sidebar-spark-item.active').forEach(el => el.classList.remove('active'));
                item.classList.add('active');

                const activeTab = (typeof tabs !== 'undefined' && activeTabIndex >= 0) ? tabs[activeTabIndex] : null;
                if (activeTab) {
                    activeTab.sessionId = sid;
                    activeTab.isLoadingHistory = true;
                    if (activeTab.historyEl) activeTab.historyEl.innerHTML = '';
                }
                if (chatUI && chatUI.historyEl) {
                    chatUI.historyEl.innerHTML = '';
                }

                const chatLayout = document.getElementById('chat-layout');
                if (chatLayout) {
                    chatLayout.classList.remove('new-chat-homepage');
                    chatLayout.querySelector('.nexus-homepage-welcome')?.remove();
                }

                if (window.NexusViewManager) {
                    window.NexusViewManager.switchView('chat', { sid });
                }

                const messages = await ChatHistoryManager.getSessionMessages(sid);
                const allSessions = await ChatHistoryManager.getAllHistories();
                const meta = allSessions[sid] || sessions[sid] || { id: sid };
                await window.loadHistoryIntoNewTab(messages, meta, sid);
                const sidebar = document.getElementById('nexus-sidebar');
                const backdrop = document.querySelector('.sidebar-backdrop');
                if (sidebar) sidebar.classList.remove('active');
                if (backdrop) backdrop.classList.remove('active');
                document.body.classList.remove('sidebar-open');
            });
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
        port = chrome.runtime.connect({ name: 'nexus-chat-stream' });
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
                console.error('[Nexus Stream] error', {
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
                streamingTab = null;
                return;
            }
            if (msg.action === 'web_search_status') {
                if (streamingTab && (!msg.sessionId || streamingTab.sessionId === msg.sessionId)) {
                    affectedTabs.forEach(tab => {
                        tab.chatUIInstance.handleWebSearchStatus(msg);
                    });
                }
                return;
            }
            if (msg.action === 'chunk' && msg.chunk) {
                if (streamingTab && (!msg.sessionId || streamingTab.sessionId === msg.sessionId)) {
                    affectedTabs.forEach(tab => {
                        tab.chatUIInstance.appendChunk(msg.chunk, tab.id !== streamingTab?.id);
                    });
                }
            }
            if (msg.action === 'done') {
                const sid = msg.sessionId || (streamingTab?.sessionId);
                if (streamingTab && (!msg.sessionId || streamingTab.sessionId === msg.sessionId)) {
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
                            if (answerDiv) {
                                const entry = answerDiv.closest('.nexus-entry');
                                if (entry) {
                                    const nav = entry.querySelector('.nexus-answer-nav');
                                    if (nav) nav.style.display = 'flex';
                                    if (targetUI._regenEntryType === 'translation' && targetUI._regenSourceText) {
                                        const latestTranslation = answerDiv.textContent.trim();
                                        chrome.runtime.sendMessage({
                                            action: 'update_translation_cache',
                                            text: targetUI._regenSourceText,
                                            translation: latestTranslation,
                                            targetLang: 'vi'
                                        }).catch(() => {});
                                    }
                                }
                            }
                        });
                    });
                    (async () => {
                        streamingTab = null;
                        streamDebugState = null;
                        await saveTabsState(true, true);
                        if (typeof NexusSync !== 'undefined') {
                            NexusSync.syncUp(true).catch(err => console.error('[Nexus] Post-answer sync failed:', err));
                        }
                    })();
                }
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
        console.error('[Nexus] Failed to setup port:', e);
        port = null;
    }
}

let streamingTab = null;
let streamDebugState = null;

async function handleSubmit(text, images, extra = {}, targetTab = null, displayQuery = null) {
    const currentTab = targetTab || tabs[activeTabIndex];
    if (!currentTab) return;
    if (!currentTab.sessionId) {
        const newSessionId = Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        currentTab.sessionId = newSessionId;
        currentTab.isHistoryLoaded = true;
        currentTab.isLoadingHistory = false;
        if (currentTab.historyEl) {
            currentTab.historyEl.dataset.sessionId = newSessionId;
        }
        if (chatUI && chatUI.historyEl) {
            chatUI.historyEl.dataset.sessionId = newSessionId;
        }
        updateUrlSessionId(newSessionId);
        const currentModel = currentTab.selectedModel;
        const currentThinking = currentTab.thinkingLevel;
        chrome.storage.local.get(['nexus_session_settings'], (res) => {
            const settings = res.nexus_session_settings || {};
            settings[newSessionId] = {
                selectedModel: currentModel,
                thinkingLevel: currentThinking
            };
            chrome.storage.local.set({ 
                nexus_session_settings: settings,
                ...(currentModel ? { lastUsedModel: currentModel } : {}),
                ...(currentThinking ? { lastUsedThinkingLevel: currentThinking } : {})
            });
        });
    }
    const now = Date.now();
    const isVeryClose = lastSubmitTime && (now - lastSubmitTime < 250);
    const isDuplicateText = lastSubmitTime && (now - lastSubmitTime < 1000) && lastSubmitText === text;
    if (isVeryClose || isDuplicateText) {
        console.warn('[Nexus] Rapid submission suppressed:', { text, diff: now - lastSubmitTime });
        return;
    }
    lastSubmitTime = now;
    lastSubmitText = text;
    const targetChatUI = currentTab.chatUIInstance;
    if (currentTab === tabs[activeTabIndex]) {
        chatUI = targetChatUI;
    }
    const isRegen = extra.isRegenerate || (extra.isRecheck && extra.isRegenerate);
    if (!isRegen) {
        currentTab.userScrolledUp = false;
        if (targetChatUI) targetChatUI.disableAutoScroll = false;
    }
    const _activeInputUI = sharedInputUI;
    if (_activeInputUI) _activeInputUI.isGenerating = true;
    const translateMatch = text && text.match(/^translate:?\s*([\s\S]*)/i);
    if (translateMatch) {
        text = translateMatch[1].trim();
        extra = { ...extra, mode: 'translate' };
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
        streamingTab = currentTab;
        saveTabsState();
    }
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
            const lastEntry = targetChatUI.historyEl.querySelector('.nexus-entry:last-child');
            untilEntryId = lastEntry ? lastEntry.dataset.entryId : null;
        }
    }
    const activeInputUI = sharedInputUI;
    const conversationHistory = targetChatUI.gatherMessages(untilEntryId, false, currentTab?.thinkingLevel || activeInputUI?.thinkingLevel || 'none');
    let apiText = text;
    if (extra.isRegenerate && !text) {
        const targetEntry = untilEntryId ? targetChatUI.historyEl.querySelector(`.nexus-entry[data-entry-id="${untilEntryId}"]`) : null;
        if (targetEntry) {
            const questionEl = targetEntry.querySelector('.nexus-chat-question');
            if (questionEl) {
                text = questionEl.getAttribute('data-raw-text') || questionEl.textContent.trim();
                apiText = text;
            }
        }
    }
    let streamAction = 'chat_stream';
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
            updateWelcomeScreenState();
        } else {
            if (t !== currentTab) {
                t.historyEl.innerHTML = currentTab.historyEl.innerHTML;
                ui._setupHistoryDelegation(t.historyEl);
                ui.initListeners(t.historyEl);
                ui.syncStateFromDOM();
            }
            const targetEntry = untilEntryId ? ui.historyEl.querySelector(`.nexus-entry[data-entry-id="${untilEntryId}"]`) : ui.historyEl.lastElementChild;
            if (targetEntry) {
                if (!extra.isRegenerate) {
                    ui.clearAnswer(targetEntry);
                    ui.showLoading(targetEntry, skipMargin);
                }
            }
        }
    });
    saveTabsState(true);
    if (typeof renderRecentChatsSidebar === 'function') {
        setTimeout(renderRecentChatsSidebar, 0);
    }
    let pageContext = "";
    const isStandaloneWindow = !isSidePanel && !isWebApp;
    const shouldReadPage = isStandaloneWindow ? false : ((extra.readPage !== undefined) ? extra.readPage : readWebpageEnabled);
    let tabModel = currentTab?.selectedModel;
    if (!tabModel) {
        const fallbackUI = sharedInputUI;
        if (fallbackUI?.activeTabModel?.model) {
            tabModel = fallbackUI.activeTabModel;
        }
    }
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
                if (pageContextCache.has(cacheKey)) {
                    return pageContextCache.get(cacheKey);
                }

                if (typeof source.url === 'string' && source.url.startsWith('chrome-extension://') && source.url.includes('?sid=')) {
                    try {
                        const urlObj = new URL(source.url);
                        const sid = urlObj.searchParams.get('sid');
                        if (sid) {
                            let messages = await ChatHistoryManager.getSessionMessages(sid);
                            if (messages && messages.length > 0) {
                                const qMessages = messages.filter(m => m.type === 'question');
                                const limitCount = 10;
                                if (qMessages.length > limitCount) {
                                    const targetQuestion = qMessages[qMessages.length - limitCount];
                                    const startIndex = messages.indexOf(targetQuestion);
                                    if (startIndex !== -1) {
                                        messages = messages.slice(startIndex);
                                    }
                                }
                                const formattedChat = messages.map(msg => {
                                    const role = msg.type === 'question' ? 'User' : 'Assistant';
                                    const text = typeof msg.content === 'string' ? msg.content : '';
                                    const cleanText = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
                                    return `${role}: ${cleanText}`;
                                }).join('\n\n');
                                const ctxList = [{
                                    content: formattedChat,
                                    url: source.url,
                                    title: source.title || 'Nexus Chat'
                                }];
                                pageContextCache.set(cacheKey, ctxList);
                                return ctxList;
                            }
                        }
                    } catch (e) {
                        console.error('[Nexus] Failed to read Nexus tab:', e);
                    }
                    return [];
                }
                try {
                    const tabResults = await chrome.scripting.executeScript({
                        target: { tabId: source.tabId, allFrames: true },
                        func: () => {
                            return typeof window.nexusExtractMainContent === 'function'
                                ? window.nexusExtractMainContent(document, true)
                                : null;
                        }
                    });
                    const ctxList = tabResults ? tabResults.map(tr => tr.result).filter(Boolean) : [];
                    pageContextCache.set(cacheKey, ctxList);
                    return ctxList;
                } catch (e) {
                    console.warn(`[Nexus] Could not read tab ${source.tabId}:`, e);
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
            console.error("[Nexus] Failed to read pinned tabs:", err);
        }
    }
    const chatWidth = currentTab?.historyEl?.clientWidth || window.innerWidth;
    const currentSurface = (chatWidth < 550) ? 'sidepanel' : 'desktop';
    const message = {
        action: streamAction,
        sessionId: currentTab?.sessionId,
        messages: conversationHistory,
        initialContext: pageContext,
        question: apiText || 'Describe these images',
        imageData: images.length > 0 ? images : null,
        hasTranscriptForVideoId: currentTab?.chatUIInstance?.getTranscriptVideoId ? currentTab.chatUIInstance.getTranscriptVideoId() : null,
        options: {
            ...extra,
            surface: currentSurface
        },
        requestOptions: {
            ...extra,
            surface: currentSurface,
            ...(tabModel ? { tabModel: { providerId: tabModel.providerId, model: tabModel.model } } : {}),
            ...(currentTab?.thinkingLevel ? { thinkingLevel: currentTab.thinkingLevel } : {}),
            ...((extra.maxTokens !== undefined && extra.maxTokens !== null && extra.maxTokens !== '')
                ? { maxTokens: Number(extra.maxTokens) }
                : {})
        }
    };
    if (currentTab && currentTab.sparkId) {
        const sparksRes = await chrome.storage.local.get(['nexus_sparks']);
        const sparks = sparksRes.nexus_sparks || {};
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
        chrome.storage.local.set({ 
            lastUsedModel: tabModel,
            ...(currentTab?.thinkingLevel ? { lastUsedThinkingLevel: currentTab.thinkingLevel } : {})
        });
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
            console.error('[Nexus] Retry failed:', retryE);
            targetChatUI.removeLoading();
            targetChatUI.appendError('Connection failed.');
        }
    }
    if (
        !extra.isRegenerate &&
        !extra.isRecheck &&
        extra.mode !== 'translate' &&
        extra.mode !== 'websource' &&
        currentTab?.sessionId
    ) {
        const nameText = apiText || text;
        if (nameText && nameText.trim()) {
            ChatHistoryManager.getAllHistories().then((sessions) => {
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
    const target = shortcut.keyData || shortcut;
    const ctrlMatch = !!target.ctrlKey === event.ctrlKey;
    const altMatch = !!target.altKey === event.altKey;
    const shiftMatch = !!target.shiftKey === event.shiftKey;
    const metaMatch = !!target.metaKey === event.metaKey;
    const keyMatch = (target.code && event.code === target.code) ||
        (event.key && event.key.toLowerCase() === (target.key || "").toLowerCase());
    const isMatched = ctrlMatch && altMatch && shiftMatch && metaMatch && keyMatch;
    return isMatched;
}

function setupGlobalListeners() {
    if (sharedInputUI?.inputEl) {
        sharedInputUI.inputEl.addEventListener('focus', () => {
            updateInputPlaceholder();
            if (typeof window.updateModelSelector === 'function') {
                window.updateModelSelector();
            }
        });
    }
    document.addEventListener('keydown', (event) => {
        if (document.querySelector('.recording')) return;
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
            if (window.NexusSelection && NexusSelection.isInsideEditable()) return;
            const activeElement = document.activeElement;
            const isInput = activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA' || activeElement.isContentEditable);
            if (!isInput) {
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
                if (window.NexusAnnotation) NexusAnnotation.undoLastHighlight();
                return;
            }
        }
        const searchOverlay = document.getElementById('nexus-search-overlay');
        if (searchOverlay && searchOverlay.style.display === 'flex') {
            const searchInput = document.getElementById('nexus-search-input');
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
                if (activeEl.__nexusTranslating) return;
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
                    activeEl.__nexusTranslating = true;
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
                    let styleEl = document.getElementById('nexus-pulse-style');
                    if (!styleEl) {
                        styleEl = document.createElement('style');
                        styleEl.id = 'nexus-pulse-style';
                        document.head.appendChild(styleEl);
                    }
                    activeEl.classList.add('nexus-pulse-active');
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
                          .nexus-pulse-active::selection {
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
                            activeEl.classList.remove('nexus-pulse-active');
                            if (styleEl) styleEl.textContent = '';
                            setTimeout(() => {
                                activeEl.style.pointerEvents = originalPointerEvents;
                                activeEl.__nexusTranslating = false;
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
                        activeEl.classList.remove('nexus-pulse-active');
                        if (styleEl) styleEl.textContent = '';
                        setTimeout(() => {
                            activeEl.style.pointerEvents = originalPointerEvents;
                            activeEl.__nexusTranslating = false;
                        }, 600);
                        console.error('[Nexus] translateInput failed:', err);
                    }
                }
                return;
            }
        }
        const shortcutActions = Object.keys(shortcuts);
        for (const action of shortcutActions) {
            if (action === 'undefined' || !action) continue;
            const shortcut = shortcuts[action];
            if (!shortcut) continue;
            const isMatch = isShortcutMatchImmediate(event, shortcut);
            if (!isMatch) continue;
            if (isEditing) {
                // If focus is in TipTap or rich text editor, do not intercept native editing shortcuts (Cmd+B, Cmd+I, Cmd+U, etc.)
                const isRichTextEditor = activeElement && activeElement.closest('.tiptap, .ProseMirror, .tiptap-editor-container');
                if (isRichTextEditor && (event.metaKey || event.ctrlKey)) {
                    const isRichTextShortcut = ['b', 'i', 'u', 'z', 'y', 'x', 'c', 'v'].includes((event.key || '').toLowerCase());
                    if (isRichTextShortcut) continue;
                }
                const hasModifier = event.ctrlKey || event.altKey || event.metaKey;
                const isOverridingShortcut = action === 'micToggle' || action === 'audio';
                if (!hasModifier && !isOverridingShortcut) continue;
            }
            if ((action === 'translate' || action === 'askNexus' || action === 'audio') && !selection) {
                if (action === 'audio' && _nexusCurrentAudio) {
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
            if (window.NexusSelection && !NexusSelection.isInsideEditable()) {
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
                        const displayQuestion = mapping.prompt
                            .replace(/\$SelectedText|SelectedText/gi, selection)
                            .replace(/\$Sentence/gi, selection)
                            .replace(/\$Paragraph/gi, selection)
                            .trim();
                        const fullQuestion = displayQuestion;
                        const targetTab = tabs[activeTabIndex];
                        const sel = window.getSelection();
                        const range = sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
                        const shouldHighlight = (mapping.highlight !== false) && (mapping.enableHighlight !== false);
                        if (shouldHighlight && window.NexusAnnotation && range) {
                            window.NexusAnnotation.highlight(range);
                        }
                        handleSubmit(fullQuestion, [], { mode: 'qa' }, targetTab || null, displayQuestion);
                        window.getSelection().removeAllRanges();
                        if (window.NexusSelection) NexusSelection.hide();
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
                const targetChatUI = chatUI;
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
            const sidebar = document.getElementById('nexus-history-sidebar');
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
            const sidebar = document.getElementById('nexus-history-sidebar');
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
            if (window.NexusSelection && NexusSelection.isInsideEditable()) return;
            event.preventDefault();
            event.stopPropagation();
            if (selection) {
                stopTTSAudio();
                _nexusAudioAborted = false;
                playTTSAudio(selection);
            } else {
                const sel = window.getSelection();
                const range = sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
                if (range && window.NexusSelection) {
                    NexusSelection.show(0, 0, selection, range);
                    NexusSelection.showInput();
                    window.getSelection().removeAllRanges();
                    return;
                }
                stopTTSAudio();
            }
            return;
        }
        if (selection && (window.NexusSelection && !NexusSelection.isInsideEditable())) {
            if (matchesShortcut(event, 'askNexus', shortcuts)) {
                event.preventDefault();
                event.stopPropagation();
                const sel = window.getSelection();
                const range = sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
                if (range && window.NexusSelection) {
                    const text = selection;
                    NexusSelection.show(0, 0, text, range);
                    NexusSelection.showInput();
                    window.getSelection().removeAllRanges();
                    return;
                }
            }
            if (matchesShortcut(event, 'translate', shortcuts)) {
                event.preventDefault();
                event.stopPropagation();
                handleTranslation(selection);
                window.getSelection().removeAllRanges();
                if (window.NexusSelection) NexusSelection.hide();
                return;
            }
        }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') {
            const activeEl = document.activeElement;
            if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) {
                return;
            }
            const sidebar = document.getElementById('nexus-history-sidebar');
            if (sidebar && sidebar.classList.contains('open')) return;
            if (inputEl) inputEl.focus();
            return;
        }
        for (const shortcut of annotationShortcuts) {
            if (shortcut.enabled === false) continue;
            const matched = matchesAnnotationShortcut(event, shortcut);
            if (matched) {
                if (window.NexusSelection && NexusSelection.isInsideEditable()) {
                    continue;
                }
                const sel = window.getSelection();
                const text = sel ? sel.toString().trim() : '';
                if (text.length > 0 && sel.rangeCount > 0) {
                    event.preventDefault();
                    event.stopPropagation();
                    event.stopImmediatePropagation();
                    const range = sel.getRangeAt(0);
                    const highlightId = 'lh_' + Date.now();
                    const color = shortcut.color || '#ffeb3b';
                    if (window.NexusAnnotation) {
                        NexusAnnotation.saveHighlight(range, color, highlightId);
                        NexusAnnotation.applyHighlight(range, color, highlightId);
                    }
                    window.getSelection().removeAllRanges();
                    if (window.NexusSelection) NexusSelection.hide();
                    return;
                }
            }
        }
        if (['Control', 'Shift', 'Alt', 'Meta', 'Tab', 'CapsLock', 'Escape'].includes(event.key)) return;
        if (!isEditing && inputEl) {
            const sidebar = document.getElementById('nexus-history-sidebar');
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

async function resetChat() {
    if (typeof window.notesClosePage === 'function') window.notesClosePage();
    if (typeof window.sparksClosePage === 'function') window.sparksClosePage();
    stopTTSAudio();

    const activeTab = (activeTabIndex >= 0 && tabs[activeTabIndex]) ? tabs[activeTabIndex] : null;
    const curSid = activeTab?.sessionId || new URLSearchParams(window.location?.search || '').get('sid') || null;

    let currentModel = activeTab?.selectedModel || sharedInputUI?.activeTabModel || null;
    let currentThinking = activeTab?.thinkingLevel || sharedInputUI?.thinkingLevel || null;

    if ((!currentModel || !currentThinking) && curSid) {
        const resolved = await window.NexusModelHelper.resolveSessionSettings(curSid);
        if (!currentModel) currentModel = resolved.selectedModel;
        if (!currentThinking) currentThinking = resolved.thinkingLevel;
    }

    if (activeTab) {
        if (port && activeTab.sessionId) {
            port.postMessage({ action: 'stop_chat', sessionId: activeTab.sessionId });
        }

        activeTab.title = 'New Tab';
        activeTab.sessionId = null;
        activeTab.selectedModel = currentModel;
        activeTab.thinkingLevel = currentThinking;
        activeTab.isHistoryLoaded = false;
        if (activeTab.historyEl) {
            activeTab.historyEl.removeAttribute('data-session-id');
        }
        activeTab.sparkId = null;
        if (activeTab.chatUIInstance) activeTab.chatUIInstance.sparkId = null;
        activeTab.scrollTop = -1;
        updateUrlSessionId(null);

        if (typeof sidebarSparksRenderList === 'function') {
            sidebarSparksRenderList();
        }
    }

    if (currentModel) {
        await window.NexusModelHelper?.saveModelSelection?.(currentModel, null);
        if (currentThinking) {
            await window.NexusModelHelper?.saveThinkingSelection?.(currentThinking, null, currentModel);
        }
    }

    if (sharedInputUI) {
        if (activeTab?.historyEl) sharedInputUI.historyEl = activeTab.historyEl;
        sharedInputUI.activeTabModel = currentModel ? { ...currentModel } : null;
        sharedInputUI.thinkingLevel = currentThinking || null;
        if (typeof sharedInputUI.refreshModelSelector === 'function') sharedInputUI.refreshModelSelector();
        if (typeof sharedInputUI.refreshReasoningSelector === 'function') sharedInputUI.refreshReasoningSelector();
    }
    if (chatUI) {
        chatUI.clearHistory();
        chatUI.activeTabModel = currentModel ? { ...currentModel } : null;
        chatUI.thinkingLevel = currentThinking || null;
        if (chatUI.inputEl) {
            chatUI.inputEl.value = '';
            chatUI.inputEl.style.height = 'auto';
            chatUI.inputEl.focus();
        }
    }
    if (typeof window.updateModelSelector === 'function') {
        window.updateModelSelector();
    }
    updateWelcomeScreenState('primary');
    updatePaneBlankState();
    if (typeof renderTabs === 'function') renderTabs();
    saveTabsState();
    if (typeof updateRecentChatsActiveState === 'function') {
        updateRecentChatsActiveState();
    }
    if (typeof updateTopbarSparkTitle === 'function') {
        updateTopbarSparkTitle();
    }
    updateWelcomeScreenState('primary');
    updateInputPlaceholder();
    const regenBtn = document.getElementById('nexus-regenerate-btn');
    if (regenBtn) regenBtn.style.display = 'none';
}

function setupRegenerateButtons() {
    const buttons = document.querySelectorAll('#nexus-regenerate-btn');
    buttons.forEach(btn => {
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        newBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (newBtn.classList.contains('loading')) {
                if (chatUI && chatUI.onStop) chatUI.onStop();
                if (chatUI) chatUI.hideStopButton();
            } else {
                triggerRegenerate(chatUI);
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
            const entries = activeTab.historyEl.querySelectorAll('.nexus-entry');
            const lastEntry = entries[entries.length - 1];
            if (lastEntry) {
                activeTab.chatUIInstance.updateEntryMinHeight(lastEntry);
                activeTab.chatUIInstance.adjustEntryMargin(lastEntry, 'immediate');
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
    function sanitizeHtmlFragment(frag) {
        const temp = document.createElement('div');
        temp.appendChild(frag.cloneNode(true));
        temp.querySelectorAll('*').forEach(el => {
            el.removeAttribute('data-images');
            el.removeAttribute('data-files');
            el.removeAttribute('data-raw-text');
            if (el.tagName === 'IMG' && el.src && el.src.startsWith('data:')) {
                if (el.src.length > 500 * 1024) {
                    el.removeAttribute('src');
                }
            }
        });
        return temp.innerHTML;
    }
    let extracted = getVisibleText(fragment);
    extracted = extracted
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]+/g, ' ')
        .replace(/ ?\n ?/g, '\n')
        .trim();
    const original = sel.toString().trim();
    const finalPlain = (extracted && extracted !== original) ? extracted : original;
    const sanitizedHtml = sanitizeHtmlFragment(fragment);
    e.preventDefault();
    e.clipboardData.setData('text/plain', finalPlain);
    e.clipboardData.setData('text/html', sanitizedHtml);
}, true);

function triggerRegenerate(targetUI = null) {
    const tUI = targetUI || chatUI;
    const history = tUI?.historyEl;
    if (!history) return;
    const lastEntry = history.lastElementChild;
    if (!lastEntry || !lastEntry.classList.contains('nexus-entry')) return;
    if (tUI) tUI.regenerateEntry(lastEntry);
}

function showAnswerVersion(entryElement, direction) {
    const versions = Array.from(entryElement.querySelectorAll('.nexus-answer-version'));
    const activeIndex = versions.findIndex(v => v.classList.contains('active'));
    if (activeIndex === -1) return;
    let newIndex = activeIndex;
    if (direction === 'prev') newIndex = Math.max(0, activeIndex - 1);
    if (direction === 'next') newIndex = Math.min(versions.length - 1, activeIndex + 1);
    if (newIndex !== activeIndex) {
        versions[activeIndex].classList.remove('active');
        versions[newIndex].classList.add('active');
        updateVersionNav(entryElement, newIndex, versions.length);
        const answers = entryElement.querySelectorAll('.nexus-chat-answer');
        answers.forEach(ans => {
            if (typeof NexusChatUI !== 'undefined') {
                NexusChatUI.updateVersionNavInActions(ans);
            }
        });
        entryElement.scrollIntoView({ behavior: 'instant', block: 'start' });
        const historyEl = entryElement.closest('.nexus-chat-history');
        const sid = historyEl?.dataset?.sessionId || null;
        if (historyEl && typeof ChatHistoryManager !== 'undefined') {
            ChatHistoryManager.saveCurrentChat(historyEl, sid);
        }
    }
}

function updateVersionNav(entryElement, activeIndex, totalCount) {
    const versionsContainer = entryElement.querySelector('.nexus-answer-versions');
    const versions = versionsContainer ? Array.from(versionsContainer.querySelectorAll('.nexus-answer-version')) : [];
    const activeVersion = versions[activeIndex];
    const modifierLabel = activeVersion?.dataset.modifierLabel || 'Normal';
    const navs = entryElement.querySelectorAll('.nexus-answer-nav');
    navs.forEach(nav => {
        let tag = nav.querySelector('.nexus-answer-version-tag');
        if (!tag) {
            tag = document.createElement('span');
            tag.className = 'nexus-answer-version-tag';
            nav.insertBefore(tag, nav.firstChild);
        }
        if (modifierLabel && modifierLabel !== 'Normal') {
            tag.textContent = modifierLabel;
            tag.style.display = 'inline-flex';
        } else {
            tag.style.display = 'none';
        }
        const counter = nav.querySelector('.nexus-answer-nav-counter');
        const prevBtn = nav.querySelector('.nav-prev');
        const nextBtn = nav.querySelector('.nav-next');
        if (counter) counter.textContent = `${activeIndex + 1} / ${totalCount}`;
        if (prevBtn) prevBtn.disabled = activeIndex === 0;
        if (nextBtn) nextBtn.disabled = activeIndex === totalCount - 1;
    });
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
    const ctrlMatch = wantsCtrl ? event.ctrlKey : !event.ctrlKey;
    const metaMatch = wantsMeta ? event.metaKey : !event.metaKey;
    const shiftMatch = !!shortcut.shiftKey === event.shiftKey;
    const altMatch = !!shortcut.altKey === event.altKey;
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
            stopTTSAudio();
            _nexusAudioAborted = false;
            playTTSAudio(selection);
        } else {
            stopTTSAudio();
        }
    } else if (action === 'nexusChat') {
    } else if (action === 'askNexus') {
        const sel = window.getSelection();
        const text = sel ? sel.toString().trim() : '';
        const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
        if (!text || !range || !window.NexusSelection) return;
        NexusSelection.show(0, 0, text, range);
        NexusSelection.showInput();
        sel.removeAllRanges();
    } else if (action === 'resetChat') {
        resetChat();
    } else if (action === 'retry') {
        if (chatUI) {
            triggerRegenerate(chatUI);
        }
    } else if (action === 'micToggle') {
        const micBtn = document.querySelector('#mic-btn');
        if (micBtn) micBtn.click();
    } else if (action === 'cycleModels') {
        cycleActiveModel();
    }
}

function cycleActiveModel() {
    const currentActiveTab = tabs[activeTabIndex];
    if (!currentActiveTab) return;
    chrome.storage.local.get(['providers', 'models'], async (data) => {
        const chain = window.NexusModelHelper.buildModelChain(data);
        if (chain.length <= 1) return;
        let currentModel = currentActiveTab.selectedModel?.model;
        let currentProviderId = currentActiveTab.selectedModel?.providerId;
        let currentIndex = chain.findIndex(item => item.model === currentModel && item.providerId === currentProviderId);
        const nextIndex = (currentIndex + 1) % chain.length;
        const nextItem = chain[nextIndex];
        currentActiveTab.selectedModel = { model: nextItem.model, providerId: nextItem.providerId };
        if (currentActiveTab.chatUIInstance) {
            currentActiveTab.chatUIInstance.activeTabModel = { ...currentActiveTab.selectedModel };
        }
        if (sharedInputUI) {
            sharedInputUI.activeTabModel = { ...currentActiveTab.selectedModel };
        }
        const label = document.getElementById('model-label') 
            || document.querySelector('.nexus-current-model') 
            || document.getElementById('topbar-model-label');
        if (label) {
            label.textContent = nextItem.displayName || nextItem.model;
        }
        const res = await window.NexusModelHelper.saveModelSelection(nextItem, currentActiveTab.sessionId);
        if (res) {
            currentActiveTab.thinkingLevel = res.thinkingLevel;
            if (currentActiveTab.chatUIInstance) {
                currentActiveTab.chatUIInstance.thinkingLevel = res.thinkingLevel;
            }
            if (sharedInputUI) {
                sharedInputUI.thinkingLevel = res.thinkingLevel;
                if (typeof sharedInputUI.refreshReasoningSelector === 'function') {
                    sharedInputUI.refreshReasoningSelector();
                }
            }
        }
        if (typeof window.updateModelSelector === 'function') {
            window.updateModelSelector();
        }
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

async function playTTSAudio(text) {
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
        console.error('[Nexus] Play audio failed:', err);
    }
}

let _nexusAudioCtx = null;
function getTTSAudioCtx() {
    if (!_nexusAudioCtx || _nexusAudioCtx.state === 'closed') {
        _nexusAudioCtx = new AudioContext();
    }
    return _nexusAudioCtx;
}

let _nexusCurrentAudio = null;
let _nexusAudioAborted = false;

function stopTTSAudio() {
    _nexusAudioAborted = true;
    if (_nexusCurrentAudio) {
        _nexusCurrentAudio.pause();
        _nexusCurrentAudio = null;
    }
}

function playBase64Audio(base64Data, speed = 1.0) {
    return new Promise(async (resolve, reject) => {
        if (_nexusAudioAborted) { resolve(); return; }
        try {
            const parts = base64Data.split(',');
            const byteString = atob(parts[1]);
            const byteArray = new Uint8Array(byteString.length);
            for (let i = 0; i < byteString.length; i++) byteArray[i] = byteString.charCodeAt(i);
            let silenceOffset = 0;
            try {
                const ctx = getTTSAudioCtx();
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
            if (_nexusAudioAborted) { resolve(); return; }
            const mime = parts[0].split(':')[1].split(';')[0];
            const blob = new Blob([byteArray], { type: mime });
            const blobUrl = URL.createObjectURL(blob);
            const audio = new Audio(blobUrl);
            audio.playbackRate = speed;
            if (silenceOffset > 0) audio.currentTime = silenceOffset;
            _nexusCurrentAudio = audio;
            audio.onended = () => { _nexusCurrentAudio = null; URL.revokeObjectURL(blobUrl); resolve(); };
            audio.onerror = (e) => { _nexusCurrentAudio = null; URL.revokeObjectURL(blobUrl); reject(e); };
            audio.play().catch(reject);
        } catch (e) {
            try {
                const audio = new Audio(base64Data);
                audio.playbackRate = speed;
                _nexusCurrentAudio = audio;
                audio.onended = () => { _nexusCurrentAudio = null; resolve(); };
                audio.onerror = (err) => { _nexusCurrentAudio = null; reject(err); };
                audio.play().catch(reject);
            } catch (e2) { reject(e2); }
        }
    });
}

window.addEventListener('mousedown', (e) => {
    if (window.mouseupTimer) {
        clearTimeout(window.mouseupTimer);
    }
    const path = e.composedPath();
    const isInsideAskBtn = path.some(el => el.id === 'nexus-action-bar');
    const isInsideAskInput = path.some(el => el.id === 'nexus-ask-input-popup');
    if (!isInsideAskBtn && !isInsideAskInput) {
        if (window.NexusSelection) NexusSelection.hide();
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
        if (changes.nexus_sparks) {
            if (typeof sidebarSparksRenderList === 'function') {
                sidebarSparksRenderList();
            }
            if (typeof sparksRenderList === 'function') {
                sparksRenderList();
            }
        }
    }
});

window.loadHistoryIntoNewTab = async function (messages, meta, historySessionId, targetIndex = null) {
    if (typeof window.notesClosePage === 'function') window.notesClosePage();
    if (typeof window.sparksClosePage === 'function') window.sparksClosePage();
    if (tabs.length === 0) return;
    const targetIdx = activeTabIndex;
    const activeTab = tabs[targetIdx];
    if (!activeTab) return;
    if (activeTab.historyEl) {
        activeTab.historyEl.innerHTML = '';
    }
    if (chatUI && chatUI.historyEl) {
        chatUI.historyEl.innerHTML = '';
    }
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
    const resolved = await window.NexusModelHelper.resolveSessionSettings(historySessionId, meta.selectedModel, meta.thinkingLevel);
    activeTab.selectedModel = resolved.selectedModel;
    activeTab.thinkingLevel = resolved.thinkingLevel;
    activeTab.sparkId = meta.sparkId || null;
    if (activeTab.chatUIInstance) {
        activeTab.chatUIInstance.sparkId = activeTab.sparkId;
        activeTab.chatUIInstance.activeTabModel = resolved.selectedModel ? { ...resolved.selectedModel } : null;
        activeTab.chatUIInstance.thinkingLevel = resolved.thinkingLevel || null;
    }
    if (resolved.selectedModel) {
        await window.NexusModelHelper.saveModelSelection(resolved.selectedModel, historySessionId, resolved.thinkingLevel);
    }
    if (activeTab.historyEl) {
        activeTab.historyEl.dataset.sessionId = historySessionId;
    }
    const targetInputUI = sharedInputUI;
    if (targetInputUI) {
        targetInputUI.historyEl = activeTab.historyEl;
        targetInputUI.activeTabModel = activeTab.selectedModel ? { ...activeTab.selectedModel } : null;
        targetInputUI.thinkingLevel = activeTab.thinkingLevel || null;
        if (typeof targetInputUI.refreshModelSelector === 'function') targetInputUI.refreshModelSelector();
        if (typeof targetInputUI.refreshReasoningSelector === 'function') targetInputUI.refreshReasoningSelector();
        targetInputUI.restoreInputState(activeTab.inputState || null);
    }
    updateInputPlaceholder();
    if (typeof window.updateModelSelector === 'function') {
        window.updateModelSelector();
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
        showTopbarLoading('primary');
        activeTab.historyEl.style.opacity = '0';
        activeTab.historyEl.style.transition = 'none';
        activeTab.historyEl.innerHTML = '';
        await ChatHistoryManager.restoreChat(chatData, activeTab.historyEl);
        normalizeRestoredHistory(activeTab.historyEl);
        activeTab.isHistoryLoaded = true;
        activeTab.isLoadingHistory = false;
        updateWelcomeScreenState('primary');
        renderTabs();
        saveTabsState(false, false);
        if (typeof updateTopbarSparkTitle === 'function') {
            updateTopbarSparkTitle();
        }
        syncTabUI(activeTab, false, true);
        if (window.NexusAnnotation) {
            NexusAnnotation.clearAllHighlights();
            const pTab = tabs[activeTabIndex];
            if (pTab) NexusAnnotation.loadHighlights(pTab.id);
        }
        if (targetIndex !== null && messages && messages[targetIndex]) {
            setTimeout(() => {
                const targetNode = activeTab.historyEl.querySelector(`.nexus-chat-question[data-message-index="${targetIndex}"]`);
                if (targetNode) {
                    const targetEntry = targetNode.closest('.nexus-entry');
                    if (targetEntry) {
                        const targetScrollTop = NexusChatUI.calculateInitialScrollTarget(targetEntry, activeTab.historyEl);
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
                hideTopbarLoading('primary');
            }, 60);
        } else {
            const performRestore = async () => {
                if (activeTab.historyEl.__processingPromises) {
                    try {
                        await Promise.all(activeTab.historyEl.__processingPromises);
                    } catch (e) { }
                    activeTab.historyEl.__processingPromises = null;
                }
                const entries = activeTab.historyEl.querySelectorAll('.nexus-entry');
                if (entries.length > 0) {
                    const latestEntry = entries[entries.length - 1];
                    if (activeTab.chatUIInstance && typeof activeTab.chatUIInstance.updateEntryMinHeight === 'function') {
                        activeTab.chatUIInstance.updateEntryMinHeight(latestEntry);
                        activeTab.chatUIInstance.adjustEntryMargin(latestEntry, 'immediate');
                    }
                    const targetScrollTop = NexusChatUI.calculateInitialScrollTarget(latestEntry, activeTab.historyEl);
                    activeTab.historyEl.scrollTop = targetScrollTop;
                    activeTab.scrollTop = targetScrollTop;
                } else {
                    activeTab.historyEl.scrollTop = activeTab.historyEl.scrollHeight;
                    activeTab.scrollTop = -1;
                }
                activeTab.historyEl.style.opacity = '1';
                activeTab.historyEl.style.transition = '';
                hideTopbarLoading('primary');
            };
            performRestore();
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

async function renderDropdownMenu(anchor) {
    const targetAnchor = anchor || document.getElementById('topbar-more-btn');
    if (!targetAnchor) return;
    const activeTab = tabs[activeTabIndex];
    const sessionId = activeTab?.sessionId || null;
    if (!sessionId) {
        if (typeof updateTopbarMenuVisibility === 'function') updateTopbarMenuVisibility();
        return;
    }
    const sessionMeta = await NexusChatDB.getSession(sessionId);
    const isPinned = sessionMeta?.pinned || false;
    const isArchived = sessionMeta?.archived || false;

    NexusMenu.show({
        anchor: targetAnchor,
        placement: 'bottom-end',
        items: [
            {
                label: isPinned ? 'Unpin' : 'Pin',
                icon: isPinned 
                    ? `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="2" y1="2" x2="22" y2="22"></line><path d="M12 6.5 15 9.5l-1.5 1.5"></path><path d="m9 12-4.5 4.5 2 2 1-1 4-4"></path><line x1="7.5" y1="16.5" x2="3" y2="21"></line></svg>`
                    : `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m15 4.5 4.5 4.5-2 2-1-1-4.5 4.5 1 1-2 2-4.5-4.5 2-2 1 1 4.5-4.5-1-1 2-2Z"></path><line x1="8" y1="16" x2="3" y2="21"></line></svg>`,
                action: async () => {
                    const session = await NexusChatDB.getSession(sessionId);
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
                        session.updatedAt = Date.now();
                        await NexusChatDB.putSession(session);
                        chrome.runtime.sendMessage({ action: 'nexus_sessions_index_updated' }).catch(() => {});
                        if (typeof NexusSync !== 'undefined' && typeof NexusSync.triggerDebouncedSync === 'function') {
                            NexusSync.triggerDebouncedSync();
                        }
                        if (session.isRenamed) {
                            const currentActiveTab = tabs[activeTabIndex];
                            if (currentActiveTab && currentActiveTab.sessionId === sessionId) {
                                currentActiveTab.title = session.title;
                                renderTabs();
                            }
                        }
                        renderRecentChatsSidebar();
                    }
                }
            },
            {
                label: isArchived ? 'Unarchive' : 'Archive',
                icon: isArchived
                    ? `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="5" x="2" y="3" rx="1.5"></rect><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"></path><path d="m10 15 2-2 2 2"></path><path d="M12 13v4"></path></svg>`
                    : `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="5" x="2" y="3" rx="1.5"></rect><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"></path><path d="M10 12h4"></path></svg>`,
                action: async () => {
                    if (sessionMeta) {
                        if (isArchived) {
                            sessionMeta.archived = false;
                            sessionMeta.updatedAt = Date.now();
                            await NexusChatDB.putSession(sessionMeta);
                            chrome.runtime.sendMessage({ action: 'nexus_sessions_index_updated' }).catch(() => {});
                            if (typeof NexusSync !== 'undefined' && typeof NexusSync.triggerDebouncedSync === 'function') {
                                NexusSync.triggerDebouncedSync();
                            }
                            renderRecentChatsSidebar();
                        } else {
                            let currentTitle = sessionMeta.title || 'Untitled Chat';
                            if (!sessionMeta.isRenamed && !sessionMeta.autoNamed && sessionMeta.questions && sessionMeta.questions.length > 0) {
                                currentTitle = sessionMeta.questions[sessionMeta.questions.length - 1].text || currentTitle;
                            }
                            const newTitle = await window.showCustomPopup({
                                title: 'Archive Chat',
                                body: 'Rename this chat to archive:',
                                isInput: true,
                                defaultValue: currentTitle,
                                confirmLabel: 'Archive'
                            });
                            if (newTitle !== null) {
                                if (newTitle.trim()) {
                                    sessionMeta.title = newTitle.trim();
                                    sessionMeta.isRenamed = true;
                                }
                                sessionMeta.archived = true;
                                sessionMeta.updatedAt = Date.now();
                                await NexusChatDB.putSession(sessionMeta);
                                chrome.runtime.sendMessage({ action: 'nexus_sessions_index_updated' }).catch(() => {});
                                if (typeof NexusSync !== 'undefined' && typeof NexusSync.triggerDebouncedSync === 'function') {
                                    NexusSync.triggerDebouncedSync();
                                }
                                renderRecentChatsSidebar();
                            }
                        }
                    }
                }
            },
            {
                label: 'Rename',
                icon: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path><path d="m15 5 4 4"></path></svg>`,
                action: async () => {
                    let currentTitle = sessionMeta?.title || 'Untitled Chat';
                    if (!sessionMeta?.isRenamed && !sessionMeta?.autoNamed && sessionMeta?.questions && sessionMeta?.questions.length > 0) {
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
                        const activeTab = tabs[activeTabIndex];
                        if (activeTab && activeTab.sessionId === sessionId) {
                            activeTab.title = newTitle.trim();
                            renderTabs();
                        }
                        renderRecentChatsSidebar();
                    }
                }
            },
            {
                label: 'Copy Chat',
                icon: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect width="13" height="13" x="8" y="8" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></svg>`,
                action: async () => {
                    let fullText = '';
                    const messages = typeof ChatHistoryManager !== 'undefined' ? await ChatHistoryManager.getSessionMessages(sessionId) : null;
                    if (messages && messages.length > 0) {
                        let blocks = [];
                        let currentBlock = [];
                        messages.forEach(msg => {
                            const role = msg.type === 'question' ? 'User' : 'Model';
                            const text = msg.content || msg.text || '';
                            if (role === 'User') {
                                if (currentBlock.length > 0) {
                                    blocks.push(currentBlock.join('\n\n'));
                                    currentBlock = [];
                                }
                                currentBlock.push(`User:\n${text}`);
                            } else {
                                currentBlock.push(`Model:\n${text}`);
                            }
                        });
                        if (currentBlock.length > 0) {
                            blocks.push(currentBlock.join('\n\n'));
                        }
                        fullText = blocks.join('\n\n---\n\n');
                    } else {
                        const session = await NexusChatDB.getSession(sessionId);
                        if (session && session.questions && session.questions.length > 0) {
                            fullText = session.questions.map(q => {
                                let text = `User:\n${q.text || ''}`;
                                if (q.answers) {
                                    const answerList = Array.isArray(q.answers) ? q.answers : Object.values(q.answers);
                                    const selectedAns = q.selectedVersionId 
                                        ? (q.answers[q.selectedVersionId] || answerList.find(a => a && a.text))
                                        : answerList.find(a => a && a.text);
                                    if (selectedAns && selectedAns.text) {
                                        text += `\n\nModel:\n${selectedAns.text}`;
                                    }
                                }
                                return text;
                            }).filter(Boolean).join('\n\n---\n\n');
                        }
                    }
                    if (!fullText) {
                        if (typeof NexusToast !== 'undefined') NexusToast.show('No chat content to copy.', 'info');
                        return;
                    }
                    try {
                        await navigator.clipboard.writeText(fullText);
                        if (typeof NexusToast !== 'undefined') NexusToast.show('Copied entire chat to clipboard!', 'success');
                    } catch (err) {
                        console.error('Failed to copy chat:', err);
                        if (typeof NexusToast !== 'undefined') NexusToast.show('Failed to copy chat.', 'error');
                    }
                }
            },
            {
                label: 'Delete',
                icon: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`,
                action: async () => {
                    const confirmed = await window.showCustomPopup({
                        title: 'Delete Chat',
                        body: 'Are you sure you want to delete this chat? This action cannot be undone.',
                        confirmLabel: 'Delete',
                        isDanger: true
                    });
                    if (confirmed) {
                        await ChatHistoryManager.deleteChat(sessionId);
                        tabs.forEach((tab) => {
                            if (tab.sessionId === sessionId) {
                                resetChat();
                            }
                        });
                    }
                }
            }
        ]
    });
}

function initModelSelector() {
    window.updateModelSelector = () => {
        const activeTab = (typeof tabs !== 'undefined' && typeof activeTabIndex !== 'undefined') ? tabs[activeTabIndex] : null;
        if (activeTab?.chatUIInstance?.refreshModelSelector) {
            activeTab.chatUIInstance.refreshModelSelector();
        }
        if (activeTab?.chatUIInstance?.refreshReasoningSelector) {
            activeTab.chatUIInstance.refreshReasoningSelector();
        }
        if (sharedInputUI?.refreshModelSelector) {
            sharedInputUI.refreshModelSelector();
        }
        if (sharedInputUI?.refreshReasoningSelector) {
            sharedInputUI.refreshReasoningSelector();
        }
        updateTopbarSparkTitle();
    };
    window.updateTopbarModelSelector = window.updateModelSelector;
    window.updateModelSelector();
}

function updateTopbarSparkTitle() {
    const topbar = document.getElementById('nexus-topbar');
    if (!topbar) return;
    const activeTab = (typeof tabs !== 'undefined' && typeof activeTabIndex !== 'undefined') ? tabs[activeTabIndex] : null;
    let titleEl = topbar.querySelector('.topbar-spark-title');
    if (activeTab && activeTab.sparkId && sparksCache[activeTab.sparkId]) {
        const spark = sparksCache[activeTab.sparkId];
        if (!titleEl) {
            titleEl = document.createElement('span');
            titleEl.className = 'topbar-spark-title';
            topbar.appendChild(titleEl);
        }
        titleEl.textContent = spark.name || '';
        titleEl.style.display = 'block';
    } else if (titleEl) {
        titleEl.style.display = 'none';
    }
}

window.updateTopbarSparkTitle = updateTopbarSparkTitle;

function updateInputPlaceholder() {
    const activeTab = tabs[activeTabIndex];
    if (!activeTab) return;
    if (!sharedInputUI || !sharedInputUI.inputEl) return;
    if (activeTab.sparkId && sparksCache[activeTab.sparkId]) {
        const spark = sparksCache[activeTab.sparkId];
        sharedInputUI.inputEl.placeholder = `Ask ${spark.name}...`;
    } else {
        sharedInputUI.inputEl.placeholder = 'Ask anything...';
    }
}
window.updateInputPlaceholder = updateInputPlaceholder;

function updateSidebarUserProfile(isAuthenticated, user) {
    const avatarEl = document.querySelector('.user-profile .user-avatar');
    const nameEl = document.querySelector('.user-profile .user-name');
    const lastSyncEl = document.getElementById('user-last-sync');
    const profileEl = document.querySelector('.user-profile');
    const loginBtn = document.getElementById('sidebar-login-btn');

    if (isAuthenticated && user) {
        try {
            localStorage.setItem('nexus_cached_user', JSON.stringify({ name: user.name, picture: user.picture }));
        } catch (e) {}
        if (profileEl) {
            profileEl.style.display = 'flex';
            profileEl.style.visibility = 'visible';
        }
        if (loginBtn) loginBtn.style.display = 'none';
        if (nameEl) nameEl.textContent = user.name || "User";
        if (avatarEl) {
            if (user.picture) {
                avatarEl.innerHTML = `<img src="${user.picture}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%; display: block;" />`;
            } else {
                const initials = (user.name || "U").split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();
                avatarEl.textContent = initials;
            }
        }
    } else {
        try {
            localStorage.removeItem('nexus_cached_user');
        } catch (e) {}
        if (profileEl) profileEl.style.display = 'none';
        if (loginBtn) {
            loginBtn.style.display = 'flex';
            loginBtn.onclick = async () => {
                try {
                    loginBtn.disabled = true;
                    const textEl = loginBtn.querySelector('.gsi-material-button-contents');
                    if (textEl) textEl.textContent = 'Signing in...';
                    if (typeof NexusAuth !== 'undefined' && typeof NexusAuth.login === 'function') {
                        await NexusAuth.login();
                    }
                } catch (e) {
                    console.error('Sign in failed:', e);
                    alert('Sign in failed: ' + e.message);
                    loginBtn.disabled = false;
                    const textEl = loginBtn.querySelector('.gsi-material-button-contents');
                    if (textEl) textEl.textContent = 'Sign in with Google';
                }
            };
        }
    }

    if (isAuthenticated && lastSyncEl && typeof NexusSync !== 'undefined') {
        const updateSyncDisplay = (status, lastSyncTime) => {
            if (lastSyncTime) {
                const timeStr = new Date(lastSyncTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                lastSyncEl.textContent = `Last synced: ${timeStr}`;
            } else {
                NexusSync.getLastSyncTime().then(time => {
                    if (time && time !== 'Never') {
                        const parsedDate = new Date(time);
                        const timeStr = isNaN(parsedDate.getTime()) ? time : parsedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        lastSyncEl.textContent = `Last synced: ${timeStr}`;
                    } else {
                        lastSyncEl.textContent = 'Not synced';
                    }
                }).catch(() => {
                    lastSyncEl.textContent = '';
                });
            }
        };
        updateSyncDisplay();
        if (!window.__nexusUserLastSyncListenerBound) {
            window.__nexusUserLastSyncListenerBound = true;
            NexusSync.addListener((status, lastSync) => {
                updateSyncDisplay(status, lastSync);
                if (status === 'Synced just now' || status === 'Synced' || lastSync) {
                    if (typeof renderRecentChatsSidebar === 'function') {
                        renderRecentChatsSidebar();
                    }
                }
            });
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
                chrome.storage.onChanged.addListener((changes, area) => {
                    if (area === 'local' && changes.last_sync_time) {
                        updateSyncDisplay(null, changes.last_sync_time.newValue);
                        if (typeof renderRecentChatsSidebar === 'function') {
                            renderRecentChatsSidebar();
                        }
                    }
                });
            }
        }
    }
}

if (typeof NexusAuth !== 'undefined') {
    NexusAuth.addListener(updateSidebarUserProfile);
    updateSidebarUserProfile(NexusAuth.isAuthenticated, NexusAuth.user);
}

function getDynamicWelcomeTitle() {
    const now = new Date();
    const hour = now.getHours();
    let nameSuffix = '';
    if (typeof NexusAuth !== 'undefined' && NexusAuth.isAuthenticated && NexusAuth.user && NexusAuth.user.name) {
        const fullName = NexusAuth.user.name;
        if (fullName) {
            nameSuffix = `, ${fullName}`;
        }
    }
    let options = [];
    if (hour >= 5 && hour < 8) {
        options = [
            `Good morning, early bird${nameSuffix}!`,
            `Morning${nameSuffix}! Starting early?`,
            `Good morning! Ready for a fresh start?`,
            `Rise and shine${nameSuffix}!`,
            `Early start today! What's on your mind?`
        ];
    } else if (hour >= 8 && hour < 12) {
        options = [
            `Good morning${nameSuffix}!`,
            `Morning${nameSuffix}! Ready for today?`,
            `Good morning! What's next?`,
            `Ready to conquer the morning?`,
            `Have a productive morning${nameSuffix}!`
        ];
    } else if (hour >= 12 && hour < 17) {
        options = [
            `Good afternoon${nameSuffix}!`,
            `Hello${nameSuffix}! What's next?`,
            `Afternoon! How can I help?`,
            `Hope your afternoon is going well!`,
            `Afternoon focus mode!`
        ];
    } else if (hour >= 17 && hour < 22) {
        options = [
            `Good evening${nameSuffix}!`,
            `Evening! Let's chat!`,
            `Good evening! What's next?`,
            `Evening${nameSuffix}! Gearing up?`,
            `Hope you had a great day!`
        ];
    } else if (hour >= 22 && hour < 24) {
        options = [
            `Working late${nameSuffix}?`,
            `Good evening! Burning the midnight oil?`,
            `Late night thoughts? Let's chat!`,
            `Quiet hours focus mode!`,
            `Still going strong${nameSuffix}?`
        ];
    } else {
        options = [
            `Night owl mode${nameSuffix}!`,
            `Still awake? What's on your mind?`,
            `Midnight inspiration?`,
            `Night mode activated!`,
            `Shh, the world is asleep!`
        ];
    }
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
}

function updateTopbarMenuVisibility() {
    const menuContainer = document.querySelector('.topbar-menu-container, .topbar__menu-container');
    if (!menuContainer) return;
    const targetTab = (typeof tabs !== 'undefined' && typeof activeTabIndex !== 'undefined' && activeTabIndex >= 0) ? tabs[activeTabIndex] : null;
    const historyEl = targetTab ? targetTab.historyEl : document.getElementById('chat-history');
    const hasEntries = historyEl && historyEl.querySelector('.nexus-entry, .nexus-translation-card, .nexus-chat-question, .nexus-chat-answer') !== null;
    const hasActiveSession = !!(targetTab && targetTab.sessionId && (hasEntries || targetTab.isHistoryLoaded));
    menuContainer.style.display = hasActiveSession ? '' : 'none';
}

function updateWelcomeScreenState() {
    const layout = document.getElementById('chat-layout');
    if (!layout) return;
    const targetTab = activeTabIndex >= 0 ? tabs[activeTabIndex] : null;
    const historyEl = targetTab ? targetTab.historyEl : document.getElementById('chat-history');
    if (!historyEl) return;
    if (targetTab && targetTab.sessionId && (!targetTab.isHistoryLoaded || targetTab.isLoadingHistory)) {
        updatePaneBlankState();
        updateTopbarMenuVisibility();
        return;
    }
    const isSpark = targetTab && targetTab.sparkId;
    const hasEntries = historyEl.querySelector('.nexus-entry, .nexus-translation-card, .nexus-chat-question, .nexus-chat-answer') !== null;
    const chatContainer = layout.querySelector('.nexus-chat-container');
    if (!chatContainer) return;
    let welcomeEl = chatContainer.querySelector('.nexus-homepage-welcome');
    if (!hasEntries && !isSpark) {
        layout.classList.add('new-chat-homepage');
        if (!welcomeEl) {
            welcomeEl = document.createElement('div');
            welcomeEl.className = 'nexus-homepage-welcome';
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
    updateTopbarMenuVisibility();
}

if (typeof window !== 'undefined') {
    window.updateWelcomeScreenState = updateWelcomeScreenState;
    window.updateTopbarMenuVisibility = updateTopbarMenuVisibility;
    window.renderTabs = renderTabs;
    window.saveTabsState = saveTabsState;
    if (typeof updateUrlSessionId === 'function') window.updateUrlSessionId = updateUrlSessionId;
    if (typeof updateInputPlaceholder === 'function') window.updateInputPlaceholder = updateInputPlaceholder;
    if (typeof resetChat === 'function') window.resetChat = resetChat;
    if (typeof renderRecentChatsSidebar === 'function') window.renderRecentChatsSidebar = renderRecentChatsSidebar;
}

if (typeof NexusSync !== 'undefined') {
    NexusSync.addListener((status) => {
        const wrapper = document.getElementById('user-avatar-wrapper');
        if (wrapper) {
            wrapper.classList.toggle('is-syncing', status === 'Syncing...');
        }
    });
}

// Listen for sync status broadcasts from the Service Worker
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((request) => {
        if (request.action === 'nexus_sync_status') {
            const wrapper = document.getElementById('user-avatar-wrapper');
            if (wrapper) {
                if (request.status === 'syncing') {
                    wrapper.classList.add('is-syncing');
                } else if (request.status === 'done' || request.status === 'failure') {
                    setTimeout(() => {
                        wrapper.classList.remove('is-syncing');
                    }, 400);
                }
            }
            if (typeof NexusSync !== 'undefined') {
                if (request.status === 'done') {
                    NexusSync.notifyListeners('Synced just now', request.timestamp);
                } else if (request.status === 'failure') {
                    NexusSync.notifyListeners('Sync failure', null);
                }
            }
        }
    });
}

// Auto-pull when returning to tab after being away for >= 5 minutes
let lastTabActiveTime = Date.now();
const IDLE_SYNC_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

function checkSyncOnTabReturn() {
    if (document.visibilityState === 'visible') {
        const now = Date.now();
        const awayDuration = now - lastTabActiveTime;
        lastTabActiveTime = now;
        if (awayDuration >= IDLE_SYNC_THRESHOLD_MS) {
            if (typeof NexusSync !== 'undefined' && typeof NexusAuth !== 'undefined' && NexusAuth.isAuthenticated) {
                NexusSync.checkAutoSync(false);
            }
        }
    } else {
        lastTabActiveTime = Date.now();
    }
}

document.addEventListener('visibilitychange', checkSyncOnTabReturn);
window.addEventListener('focus', checkSyncOnTabReturn);

window.showCustomPopup = function (options) {
    if (window.NexusModal && typeof window.NexusModal.showCustomPopup === 'function') {
        return window.NexusModal.showCustomPopup(options);
    }
    const { title, body, isInput = false, defaultValue = '', placeholder = '', confirmLabel = 'Confirm', isDanger = false } = options || {};
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'nexus-modal-overlay';
        let inputHtml = '';
        if (isInput) {
            inputHtml = `<input type="text" class="nexus-modal-input" placeholder="${placeholder}" value="${(defaultValue || '').replace(/"/g, '&quot;')}">`;
        }
        const primaryBtnClass = isDanger ? 'nexus-modal-btn-danger' : 'nexus-modal-btn-primary';
        const bodyHtml = body ? `<div class="nexus-modal-body">${body}</div>` : '';
        overlay.innerHTML = `
            <div class="nexus-modal-box">
                <div class="nexus-modal-header">
                    <h3 class="nexus-modal-title">${title || ''}</h3>
                    <button type="button" class="nexus-modal-close-btn" title="Close" aria-label="Close">
                        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
                ${bodyHtml}
                ${inputHtml}
                <div class="nexus-modal-actions">
                    <button type="button" class="nexus-modal-btn btn-cancel">Cancel</button>
                    <button type="button" class="nexus-modal-btn ${primaryBtnClass} btn-confirm">${confirmLabel}</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add('active'));
        const inputEl = overlay.querySelector('.nexus-modal-input');
        const closeBtn = overlay.querySelector('.nexus-modal-close-btn');
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
            overlay.querySelector('.btn-confirm')?.focus();
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
        overlay.querySelector('.btn-confirm')?.addEventListener('click', confirm);
        overlay.querySelector('.btn-cancel')?.addEventListener('click', cancel);
        closeBtn?.addEventListener('click', cancel);
        overlay.addEventListener('mousedown', (e) => {
            if (e.target === overlay) cancel();
        });
    });
};

window.namingSessionIds = new Set();

function startConcurrentAutoNaming(sessionId, modelObj, questionText, images, history) {
    if (!sessionId || !questionText) return;
    if (!window.namingSessionIds) window.namingSessionIds = new Set();
    if (window.namingSessionIds.has(sessionId)) return;
    window.namingSessionIds.add(sessionId);
    console.log('[AutoNaming] Starting title generation for:', sessionId, questionText);
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
            console.log('[AutoNaming] Generated title successfully:', cleanTitle);
            if (typeof tabs !== 'undefined') {
                tabs.forEach(t => {
                    if (t.sessionId === sessionId) t.title = cleanTitle;
                });
                if (typeof renderTabs === 'function') renderTabs();
            }
            const tryWriteTitle = async (attemptsLeft) => {
                const session = await NexusChatDB.getSession(sessionId);
                console.log('[AutoNaming] tryWriteTitle check:', { sessionId, sessionExists: !!session, attemptsLeft });
                if (session) {
                    session.title = cleanTitle;
                    session.autoNamed = true;
                    await NexusChatDB.putSession(session);
                    console.log('[AutoNaming] Successfully wrote title to DB for:', sessionId);
                    chrome.runtime.sendMessage({ action: 'nexus_sessions_index_updated' }).catch(() => {});
                } else if (attemptsLeft > 0) {
                    setTimeout(() => tryWriteTitle(attemptsLeft - 1), 400);
                } else {
                    console.warn('[AutoNaming] Failed to write title after all attempts (session not found in DB)');
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

(function () {
    let sidebarTooltipEl = null;
    function showSidebarTooltip(e) {
        const item = e.target.closest('.recent-chat-item');
        if (!item) return;
        const titleEl = item.querySelector('.recent-chat-item__title');
        if (!titleEl) return;
        const isTruncated = titleEl.scrollWidth > titleEl.clientWidth;
        if (!isTruncated) return;
        const titleText = item.getAttribute('data-title') || titleEl.textContent;
        if (!titleText) return;
        if (!sidebarTooltipEl) {
            sidebarTooltipEl = document.createElement('div');
            sidebarTooltipEl.className = 'nexus-sidebar-tooltip';
            document.body.appendChild(sidebarTooltipEl);
        }
        sidebarTooltipEl.textContent = titleText;
        const itemRect = item.getBoundingClientRect();
        const left = itemRect.right + 10;
        sidebarTooltipEl.style.left = `${left}px`;
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
    document.addEventListener('click', (e) => {

        const actionBtn = e.target.closest('.nexus-action-chip, .nexus-followup-btn');
        if (actionBtn) {
            const query = actionBtn.getAttribute('data-query');
            if (query && !actionBtn.disabled && !actionBtn.classList.contains('is-clicked')) {
                actionBtn.classList.add('is-clicked');
                const parentGroup = actionBtn.closest('.nexus-elicitations-wrapper') || actionBtn.closest('.nexus-followup-container');
                if (parentGroup) {
                    parentGroup.querySelectorAll('.nexus-action-chip, .nexus-followup-btn').forEach(btn => {
                        btn.disabled = true;
                        btn.classList.add('is-disabled');
                    });
                }
                const activeTab = tabs[activeTabIndex];
                if (activeTab && typeof handleSubmit === 'function') {
                    handleSubmit(query, [], {}, activeTab);
                }
            }
            return;
        }

        const widgetReloadBtn = e.target.closest('.nexus-widget-btn-reload');
        if (widgetReloadBtn) {
            const wrapper = widgetReloadBtn.closest('.nexus-widget-wrapper');
            if (wrapper && typeof WidgetRunner !== 'undefined') {
                WidgetRunner.reloadWidget(wrapper);
            }
            return;
        }

        const widgetExpandBtn = e.target.closest('.nexus-widget-btn-expand');
        if (widgetExpandBtn) {
            const wrapper = widgetExpandBtn.closest('.nexus-widget-wrapper');
            if (wrapper) {
                wrapper.classList.toggle('is-expanded');
            }
            return;
        }

        const carouselPrevBtn = e.target.closest('.nexus-carousel-prev');
        if (carouselPrevBtn) {
            const container = carouselPrevBtn.closest('.nexus-carousel-container');
            const track = container?.querySelector('.nexus-carousel-track');
            if (track) {
                track.scrollBy({ left: -292, behavior: 'smooth' });
            }
            return;
        }

        const carouselNextBtn = e.target.closest('.nexus-carousel-next');
        if (carouselNextBtn) {
            const container = carouselNextBtn.closest('.nexus-carousel-container');
            const track = container?.querySelector('.nexus-carousel-track');
            if (track) {
                track.scrollBy({ left: 292, behavior: 'smooth' });
            }
            return;
        }

        // Writing Block: Tab Switcher
        const writingTab = e.target.closest('.nexus-writing-tab');
        if (writingTab) {
            const block = writingTab.closest('.nexus-writing-block');
            if (block) {
                const optIndex = writingTab.getAttribute('data-opt-index');
                block.querySelectorAll('.nexus-writing-tab').forEach(t => t.classList.toggle('is-active', t === writingTab));
                block.querySelectorAll('.nexus-writing-pane').forEach(p => {
                    p.classList.toggle('is-active', p.getAttribute('data-opt-index') === optIndex);
                });
            }
            return;
        }

        // Writing Block: Copy Subject
        const writingSubjCopyBtn = e.target.closest('.nexus-writing-copy-subject-btn');
        if (writingSubjCopyBtn) {
            const textToCopy = writingSubjCopyBtn.getAttribute('data-copy');
            if (textToCopy && navigator.clipboard) {
                navigator.clipboard.writeText(textToCopy);
                writingSubjCopyBtn.classList.add('is-copied');
                setTimeout(() => writingSubjCopyBtn.classList.remove('is-copied'), 1500);
            }
            return;
        }

        // Writing Block: Copy Content
        const writingCopyBtn = e.target.closest('.nexus-writing-btn-copy');
        if (writingCopyBtn) {
            const block = writingCopyBtn.closest('.nexus-writing-block');
            const activePane = block ? block.querySelector('.nexus-writing-pane.is-active') : null;
            if (activePane) {
                const contentEl = activePane.querySelector('.nexus-writing-content');
                const rawContent = activePane.getAttribute('data-raw-content') ? decodeURIComponent(activePane.getAttribute('data-raw-content')) : (contentEl ? contentEl.innerText : '');
                if (rawContent && navigator.clipboard) {
                    navigator.clipboard.writeText(rawContent);
                    const span = writingCopyBtn.querySelector('span');
                    if (span) {
                        const oldText = span.textContent;
                        span.textContent = 'Copied!';
                        setTimeout(() => { span.textContent = oldText; }, 1500);
                    }
                }
            }
            return;
        }

        const carouselDot = e.target.closest('.nexus-carousel-dot');
        if (carouselDot) {
            const container = carouselDot.closest('.nexus-carousel-container');
            const track = container?.querySelector('.nexus-carousel-track');
            const idx = parseInt(carouselDot.getAttribute('data-index') || '0', 10);
            if (track) {
                track.scrollTo({ left: idx * 292, behavior: 'smooth' });
                container.querySelectorAll('.nexus-carousel-dot').forEach((dot, dIdx) => {
                    dot.classList.toggle('is-active', dIdx === idx);
                });
            }
            return;
        }
    });

})();

