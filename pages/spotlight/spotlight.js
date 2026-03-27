// DOM Elements
const container = document.querySelector('.lumina-chat-container');
const fileInput = document.getElementById('file-input');

// Forward wheel events from the margin area of the chat container to the active scroll child
function bindContainerWheelForward(containerEl) {
    if (!containerEl || containerEl.__luminaWheelBound) return;
    containerEl.__luminaWheelBound = true;
    let cachedScrollable = null;

    // Stop wheel events from bubbling out of the scroll content — this prevents the
    // passive:false container listener below from running during normal scroll, which
    // would otherwise force the browser to wait for JS before every scroll frame.
    function attachScrollContentBlocker(scrollable) {
        if (!scrollable || scrollable.__luminaWheelStop) return;
        scrollable.__luminaWheelStop = true;
        scrollable.addEventListener('wheel', (e) => { e.stopPropagation(); }, { passive: true });
    }

    // Margin-only handler — only fires when wheel originates outside .lumina-chat-scroll-content
    containerEl.addEventListener('wheel', (e) => {
        // Cache and refresh only when null or hidden
        if (!cachedScrollable || cachedScrollable.style.display === 'none') {
            cachedScrollable = containerEl.querySelector('.lumina-chat-scroll-content:not([style*="display: none"])');
            if (cachedScrollable) attachScrollContentBlocker(cachedScrollable);
        }
        if (!cachedScrollable) return;
        e.preventDefault();
        // Normalize deltaMode: 0=pixels, 1=lines(~16px), 2=page
        let delta = e.deltaY;
        if (e.deltaMode === 1) delta *= 16;
        else if (e.deltaMode === 2) delta *= cachedScrollable.clientHeight;
        cachedScrollable.scrollBy({ top: delta, behavior: 'instant' });
    }, { passive: false });

    // Eagerly attach stopper if scroll content already exists
    const existing = containerEl.querySelector('.lumina-chat-scroll-content');
    if (existing) attachScrollContentBlocker(existing);
}

// Detect whether we're running as a standalone web app
const isWebApp = new URLSearchParams(window.location.search).get('webapp') === '1';

// Tab Management
let tabs = [];
let tabGroups = []; // Array of { id: 'group-x', tabIds: ['tab-1', 'tab-2'], ratio: 50 }
let activeGroupIndex = -1;
let activeTabIndex = -1; // Derived from active group
let tabCounter = 1;

// Initialize shared UI
let chatUI = null; // Will point to primary active tab's chatUI
let sharedInputUI = null; // Primary input bar UI instance
let sharedInputUISecondary = null; // Secondary input bar UI instance for split view
let chatUISecondary = null; // Will point to secondary active tab's chatUI
let hoveredPane = 'primary'; // Tracks which pane the mouse is currently over

// Helper: Get the input element for the currently hovered pane
function getHoveredInputEl() {
    if (isSplitMode && hoveredPane === 'secondary' && sharedInputUISecondary?.inputEl) {
        return sharedInputUISecondary.inputEl;
    }
    return sharedInputUI?.inputEl;
}

let isSplitMode = false; // Derived from active group
let secondaryActiveTabIndex = -1; // Derived from active group
let resizerDragging = false;
let sidebarTargetTabId = null; // Tab ID that triggered sidebar open via double-click
let splitHoverTimer = null;
let splitHoverTargetIndex = -1;
let isApplyingSplit = false;

let port = null;
let shortcuts = {};
let questionMappings = [];
let askSelectionPopupEnabled = false;

// Ask Selection (Spotlight internal)
let spotlightAskBtn = null;
let spotlightAskInputDiv = null;
let spotlightAskSelectionText = '';
let spotlightAskSelectionRange = null;
let spotlightAskSourcePane = 'primary'; // 'primary' | 'secondary'
let spotlightDictLauncherBtn = null;
let groupCounter = 1;

// Track whether the last key pressed was a modifier that was pressed alone (no combo)
let modifierKeyPressedAlone = false;

const GROUP_COLORS = [
    '#4285f4', // Blue
    '#34a853', // Green
    '#fbbc05', // Yellow
    '#ea4335', // Red
    '#a142f4', // Purple
    '#24c1e0', // Cyan
    '#ff6d01', // Orange
    '#ff33b5'  // Pink
];

// Helper: Convert file to data URL
function fileToDataURL(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsDataURL(file);
    });
}

// Helper: Apply font size
function applyFontSize(size) {
    if (!size) return;
    document.body.style.setProperty('font-size', size + 'px', 'important');
}

/**
 * Checks if the current selection or the active element is inside an editable context.
 * This prevents global shortcuts from firing while the user is typing or selecting text in inputs.
 */
function isSelectionInsideEditable() {
    const sel = window.getSelection();
    // 1. Check selection nodes
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

    // 2. Check focused element
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
            // Use sentinel to restore exact bottom even if margins reflow on reload
            tab.scrollTop = 9999999;
            tab.scrollAnchorIndex = null;
            tab.scrollAnchorOffset = null;
            // User is at bottom — allow auto-scroll again
            tab.userScrolledUp = false;
            if (tab.chatUIInstance) tab.chatUIInstance.disableAutoScroll = false;
        } else {
            tab.scrollTop = scrollTop;
            // User has scrolled up — lock auto-scroll for this tab
            tab.userScrolledUp = true;
            if (tab.chatUIInstance) tab.chatUIInstance.disableAutoScroll = true;
        }
        const entries = tab.historyEl.querySelectorAll('.lumina-dict-entry');
        if (entries.length > 0) {
            if (nearBottom) {
                // Skip anchor when we want bottom restore
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

function restoreScrollPosition(tab) {
    if (!tab || !tab.historyEl) return;
    const entries = tab.historyEl.querySelectorAll('.lumina-dict-entry');
    if (entries.length === 0) return;

    if (tab.scrollAnchorIndex != null && tab.scrollAnchorIndex < entries.length) {
        const anchor = entries[tab.scrollAnchorIndex];
        const offset = tab.scrollAnchorOffset || 0;
        tab.historyEl.scrollTop = anchor.offsetTop + offset;
        return;
    }

    if (tab.scrollTop != null && tab.scrollTop !== -1) {
        tab.historyEl.scrollTop = tab.scrollTop;
    }
}

function scheduleScrollRestore(tab) {
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            restoreScrollPosition(tab);
            setTimeout(() => {
                restoreScrollPosition(tab);
            }, 50);
        });
    });
}

/**
 * Normalizes tab IDs and history element IDs to be sequential (1, 2, 3...)
 * This makes the DOM cleaner as requested by the user.
 */
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

    // Update tabIds in tabGroups to match the new IDs
    tabGroups.forEach(group => {
        if (group.tabIds) {
            group.tabIds = group.tabIds.map(oldId => idMap[oldId] || oldId);
        }
    });

    // Reset counter to current length so next new tab is N+1
    tabCounter = tabs.length;

    renderTabs();
    saveTabsState();
}

async function initTabs() {
    // 1. Ensure history elements are clean on reload
    const tabsBar = document.getElementById('tabs-bar');
    if (tabsBar) tabsBar.style.display = 'flex';

    // Remove ALL existing history containers from DOM to avoid accumulation across reloads
    const primaryContainer = document.querySelector('#pane-primary .lumina-chat-container') || container;
    const secondaryContainer = document.querySelector('#pane-secondary .lumina-chat-container');
    [primaryContainer, secondaryContainer].forEach(c => {
        if (!c) return;
        c.querySelectorAll('.lumina-chat-scroll-content').forEach(el => el.remove());
    });

    // Create a fresh initial history container
    const initialHistory = document.createElement('div');
    initialHistory.id = 'chat-history';
    initialHistory.className = 'lumina-chat-scroll-content';
    initialHistory.style.display = 'none';
    primaryContainer.appendChild(initialHistory);

    try {
        // Load from storage
        const data = await chrome.storage.local.get([
            'spotlight_tabs',
            'spotlight_tab_counter',
            'spotlight_tab_groups',
            'spotlight_active_group_index',
            'spotlight_group_counter',
            'spotlight_active_tab_index',
            'spotlight_is_split_mode',
            'spotlight_secondary_tab_index',
            'spotlight_split_ratio'
        ]);

        if (data.spotlight_group_counter) {
            groupCounter = data.spotlight_group_counter;
        }

        if (data.spotlight_tabs && data.spotlight_tabs.length > 0) {
            tabs = []; // Clear existing for re-population

            // Load all tabs first to establish metadata
            for (let i = 0; i < data.spotlight_tabs.length; i++) {
                const meta = data.spotlight_tabs[i];
                let historyEl;

                // Create or reuse history container
                if (i === 0 && initialHistory) {
                    historyEl = initialHistory;
                } else {
                    historyEl = document.createElement('div');
                    historyEl.className = 'lumina-chat-scroll-content';
                    // In init, we can't be sure about container since it might be pane-primary
                    const primaryContainer = document.querySelector('#pane-primary .lumina-chat-container') || container;
                    primaryContainer.appendChild(historyEl);
                }

                // Keep it hidden initially
                historyEl.style.display = 'none';

                const tab = {
                    id: meta.id,
                    title: meta.title || 'New Tab',
                    sessionId: meta.sessionId,
                    scrollTop: 9999999,        // Always start at the bottom on reload (same as opening from history)
                    scrollAnchorIndex: null,
                    scrollAnchorOffset: null,
                    historyEl: historyEl,
                    chatUIInstance: new LuminaChatUI(container, {
                        isSpotlight: true,
                        skipInputSetup: true,
                        onSubmit: (text, images, extra) => handleSubmit(text, images, extra, tab)
                    })
                };
                tab.chatUIInstance.historyEl = historyEl;
                bindHistoryScroll(tab);
                tabs.push(tab);
            }

            // Determine groups
            if (data.spotlight_tab_groups && data.spotlight_tab_groups.length > 0) {
                tabGroups = data.spotlight_tab_groups;
                tabGroups.forEach(g => {
                    g.tabIds = g.tabIds.filter(id => tabs.some(t => t.id === id));
                });
                tabGroups = tabGroups.filter(g => g.tabIds.length > 0);
                activeGroupIndex = data.spotlight_active_group_index || 0;
            } else {
                // Migration from old flat array + split variables
                tabGroups = [];
                let skipSecondary = false;

                if (data.spotlight_is_split_mode && data.spotlight_secondary_tab_index != null) {
                    const t1 = tabs[data.spotlight_active_tab_index];
                    const t2 = tabs[data.spotlight_secondary_tab_index];
                    if (t1 && t2 && t1 !== t2) {
                        tabGroups.push({
                            id: `group-migrated-split`,
                            tabIds: [t1.id, t2.id],
                            ratio: data.spotlight_split_ratio || 50
                        });
                        skipSecondary = true;
                    }
                }

                tabs.forEach((t, i) => {
                    if (skipSecondary && (i === data.spotlight_active_tab_index || i === data.spotlight_secondary_tab_index)) {
                        return;
                    }
                    tabGroups.push({ id: `group-${groupCounter++}`, tabIds: [t.id] });
                });

                activeGroupIndex = 0;
            }

            // Prune tabs not referenced by any group — remove orphaned DOM elements too
            const referencedTabIds = new Set(tabGroups.flatMap(g => g.tabIds));
            tabs = tabs.filter(t => {
                if (referencedTabIds.has(t.id)) return true;
                if (t.historyEl) t.historyEl.remove();
                return false;
            });

            // Normalize AFTER both tabs and tabGroups are loaded so IDs stay in sync
            normalizeTabs();

            if (tabGroups.length === 0) {
                createTab(true);
            } else {
                activeGroupIndex = -1; // Force switch logic
                const savedIndex = data.spotlight_active_group_index || 0;
                switchGroup(Math.min(Math.max(0, savedIndex), tabGroups.length - 1));
            }

        } else {
            // No saved state, start fresh
            createTab(true);
        }
    } catch (e) {
        console.error('[Spotlight] initTabs failed:', e);
        // Fallback
        if (tabs.length === 0) createTab(true);
    }

    // Bind wheel-forwarding so margin clicks also scroll
    const primaryC = document.querySelector('#pane-primary .lumina-chat-container') || container;
    const secondaryC = document.querySelector('#pane-secondary .lumina-chat-container');
    bindContainerWheelForward(primaryC);
    if (secondaryC) bindContainerWheelForward(secondaryC);

    // Bind Tab Bar Events
    const newTabBtn = document.getElementById('new-tab-btn');
    if (newTabBtn) {
        // Remove existing to avoid double bind
        const newBtn = newTabBtn.cloneNode(true);
        newTabBtn.parentNode.replaceChild(newBtn, newTabBtn);
        newBtn.addEventListener('click', () => createTab());
    }

    // Bind Shortcuts
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
                // Find which pane the mouse is currently hovering over
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
        if ((e.metaKey || e.ctrlKey) && !isNaN(parseInt(e.key))) {
            // Disable tab switching via number keys in web app mode to avoid browser shortcut conflict
            if (isWebApp) return;
            const index = parseInt(e.key) - 1;
            if (index >= 0 && index < 9) {
                e.preventDefault();
                if (index < tabGroups.length) {
                    switchGroup(index);
                }
            }
        }
    }, true);
}





function createTab(switchToIt = true) {
    tabCounter++;
    const newTabId = `tab-${tabCounter}`;

    const newHistory = document.createElement('div');
    newHistory.className = 'lumina-chat-scroll-content';
    newHistory.id = `chat-history-${newTabId}`;
    newHistory.style.display = 'none';

    // Default container (might move on switchTab)
    const primaryContainer = document.querySelector('#pane-primary .lumina-chat-container') || container;
    primaryContainer.appendChild(newHistory);

    const newTab = {
        id: newTabId,
        title: 'New Tab',
        historyEl: newHistory,
        chatUIInstance: null,
        scrollTop: -1,
        sessionId: 'session_' + Date.now() + Math.random().toString(36).substr(2, 5),
        selectedModel: null
    };

    newTab.chatUIInstance = new LuminaChatUI(container, {
        isSpotlight: true,
        skipInputSetup: true,
        onSubmit: (text, images, extra) => handleSubmit(text, images, extra, newTab)
    });
    newTab.chatUIInstance.historyEl = newHistory;
    bindHistoryScroll(newTab);

    chrome.storage.local.get(['lastUsedModel'], (data) => {
        if (data.lastUsedModel && data.lastUsedModel.model) {
            // Only set if user hasn't already changed the model (guard against overwrite).
            if (!newTab.selectedModel) {
                newTab.selectedModel = { ...data.lastUsedModel };
            }
            if (newTab.chatUIInstance && !newTab.chatUIInstance.activeTabModel) {
                newTab.chatUIInstance.activeTabModel = { ...data.lastUsedModel };
            }
        }
    });

    tabs.push(newTab);

    // Create group for the new tab
    tabGroups.push({ id: `group-${groupCounter++}`, tabIds: [newTab.id], ratio: 50 });

    normalizeTabs();

    if (switchToIt) {
        switchGroup(tabGroups.length - 1);
    }
}

function duplicateTab(index) {
    if (index < 0 || index >= tabs.length) return;
    const sourceTab = tabs[index];

    tabCounter++;
    const newTabId = `tab-${tabCounter}`;

    const newHistory = document.createElement('div');
    newHistory.className = 'lumina-chat-scroll-content';
    newHistory.id = `chat-history-${newTabId}`;
    newHistory.style.display = 'none';
    const primaryContainer = document.querySelector('#pane-primary .lumina-chat-container') || container;
    primaryContainer.appendChild(newHistory);

    const newTab = {
        id: newTabId,
        title: sourceTab.title,
        historyEl: newHistory,
        chatUIInstance: new LuminaChatUI(container, {
            isSpotlight: true,
            skipInputSetup: true,
            onSubmit: (text, images, extra) => handleSubmit(text, images, extra, newTab)
        }),
        scrollTop: 9999999,
        sessionId: sourceTab.sessionId, // Share same session so messages sync between panes
        selectedModel: sourceTab.selectedModel ? { ...sourceTab.selectedModel } : null
    };
    newTab.chatUIInstance.historyEl = newHistory;
    bindHistoryScroll(newTab);

    // Copy current content for instant display (shared sessionId, no storage copy needed)
    newHistory.innerHTML = sourceTab.historyEl.innerHTML;
    newTab.chatUIInstance.clearEntryMargins();

    if (streamingTab && streamingTab.id === sourceTab.id) {
        const entries = newHistory.querySelectorAll('.lumina-dict-entry');
        if (entries.length > 0) {
            const lastEntry = entries[entries.length - 1];
            newTab.chatUIInstance.currentEntryDiv = lastEntry;
            newTab.chatUIInstance.currentAnswerDiv = lastEntry.querySelector('.lumina-chat-answer');
        }
    }

    // Insert next to source in tabs array
    tabs.splice(index + 1, 0, newTab);

    // Add new tab to a temporary group so applySplit can find it
    const sourceGroupIndex = tabGroups.findIndex(g => g.tabIds.includes(sourceTab.id));
    const tempGroup = { id: `group-${groupCounter++}`, tabIds: [newTab.id], ratio: 50 };
    if (sourceGroupIndex >= 0) {
        tabGroups.splice(sourceGroupIndex + 1, 0, tempGroup);
        const sourceGroup = tabGroups[sourceGroupIndex];

        // If duplicating the secondary pane, swap it to primary pane before applying split
        if (sourceGroup.tabIds.length >= 2 && sourceGroup.tabIds[1] === sourceTab.id) {
            const tab0 = tabs.find(t => t.id === sourceGroup.tabIds[0]);
            const tab1 = sourceTab;

            // Save live input states before swap
            if (tab0 && sharedInputUI?.getInputState) tab0.inputState = sharedInputUI.getInputState();
            if (tab1 && sharedInputUISecondary?.getInputState) tab1.inputStateSecondary = sharedInputUISecondary.getInputState();

            // Swap tab IDs
            [sourceGroup.tabIds[0], sourceGroup.tabIds[1]] = [sourceGroup.tabIds[1], sourceGroup.tabIds[0]];
            sourceGroup.ratio = 100 - (sourceGroup.ratio || 50);

            // Remap input states
            if (tab1) tab1.inputState = tab1.inputStateSecondary;
            if (tab0) tab0.inputStateSecondary = tab0.inputState;
        }
    } else {
        tabGroups.push(tempGroup);
    }

    // Merge duplicated tab into the source tab's group (split/group view)
    applySplit(sourceTab.id, newTab.id);
    normalizeTabs();
}

function switchGroup(groupIndex) {
    if (groupIndex < 0 || groupIndex >= tabGroups.length) return;

    // Save live input states before switching away from current group
    if (activeGroupIndex >= 0 && activeGroupIndex < tabGroups.length) {
        const oldGroup = tabGroups[activeGroupIndex];
        const oldPrimary = tabs.find(t => t.id === oldGroup.tabIds[0]);
        const oldSecondary = oldGroup.tabIds.length > 1 ? tabs.find(t => t.id === oldGroup.tabIds[1]) : null;

        if (oldPrimary && sharedInputUI?.getInputState) oldPrimary.inputState = sharedInputUI.getInputState();
        if (oldSecondary && sharedInputUISecondary?.getInputState) oldSecondary.inputStateSecondary = sharedInputUISecondary.getInputState();
    }

    // Hide all existing
    tabs.forEach(t => {
        if (t.historyEl) t.historyEl.style.display = 'none';
    });

    activeGroupIndex = groupIndex;
    const group = tabGroups[groupIndex];

    // Identify tabs in the group
    const primaryTab = tabs.find(t => t.id === group.tabIds[0]);
    const secondaryTab = group.tabIds.length > 1 ? tabs.find(t => t.id === group.tabIds[1]) : null;

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

        // Mount primary
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
        syncTabUI(primaryTab);

        // Mount secondary
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
        syncTabUI(secondaryTab, true);

    } else {
        secondaryActiveTabIndex = -1;

        if (divider) divider.style.display = 'none';
        if (secondaryPane) secondaryPane.style.display = 'none';
        primaryPane.style.flex = '1';

        // Mount primary
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
        syncTabUI(primaryTab);
    }

    renderTabs();
    saveTabsState();
}

function syncTabUI(tab, isSecondary = false) {
    if (!tab || !tab.historyEl) return;

    if (tab.scrollTop !== -1) {
        tab.historyEl.scrollTop = tab.scrollTop;
    }

    const allEntries = tab.historyEl.querySelectorAll('.lumina-dict-entry');
    if (allEntries.length > 0) {
        const lastEntry = allEntries[allEntries.length - 1];
        requestAnimationFrame(() => {
            const isLatestEntryMode = (tab.scrollTop > 999999 || tab.scrollTop === -1) && !tab.userScrolledUp;
            tab.chatUIInstance.adjustEntryMargin(lastEntry, isLatestEntryMode ? 'auto' : 'none');
            if (isLatestEntryMode) {
                tab.chatUIInstance.scrollToBottom();
            }
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

    scheduleScrollRestore(tab);
}

function applySplit(primaryTabId, secondaryTabId, ratio = 50) {
    isApplyingSplit = true;

    // Find groups containing these tabs
    const group1Idx = tabGroups.findIndex(g => g.tabIds.includes(primaryTabId));
    let group2Idx = tabGroups.findIndex(g => g.tabIds.includes(secondaryTabId));

    if (group1Idx === -1 || group2Idx === -1) return;

    // If they are in the same group already, handle reordering? Not necessary right now.
    if (group1Idx === group2Idx) {
        // Just rearrange inside the group
        const g = tabGroups[group1Idx];
        if (g.tabIds[0] !== primaryTabId) {
            g.tabIds.reverse();
        }
        switchGroup(group1Idx);
        isApplyingSplit = false;
        return;
    }

    // Dissolve secondary group, merge secondary tab into primary group
    const g1 = tabGroups[group1Idx];
    const g2 = tabGroups[group2Idx];

    g2.tabIds = g2.tabIds.filter(id => id !== secondaryTabId);

    // If g1 already had 2 tabs, close the old secondary tab instead of expelling it
    if (g1.tabIds.length >= 2) {
        const expelledTabId = g1.tabIds[1];
        g1.tabIds = [g1.tabIds[0]];

        // Remove old tab from global tabs array and DOM
        const tabIndex = tabs.findIndex(t => t.id === expelledTabId);
        if (tabIndex !== -1) {
            const tabToRemove = tabs[tabIndex];
            tabs.splice(tabIndex, 1);
            if (tabToRemove.historyEl) tabToRemove.historyEl.remove();
        }
    }

    // Merge
    g1.tabIds.push(secondaryTabId);
    g1.ratio = ratio;

    // Clean up empty groups
    if (g2.tabIds.length === 0) {
        const idxToRemove = tabGroups.findIndex(g => g.id === g2.id);
        if (idxToRemove !== -1) tabGroups.splice(idxToRemove, 1);
    }

    // Re-evaluate group1Index since splice might have shifted it
    const newG1Idx = tabGroups.findIndex(g => g.id === g1.id);

    switchGroup(newG1Idx);
    isApplyingSplit = false;
    saveTabsState();
}

function deactivateSplit() {
    if (activeGroupIndex < 0 || activeGroupIndex >= tabGroups.length) return;
    const group = tabGroups[activeGroupIndex];
    if (group.tabIds.length < 2) return;

    // Split the group into two individual groups
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

        // Detect double-click: two mousedowns within 400ms with minimal movement
        if (timeSinceLast < 400 && moveSinceLast < 5) {
            lastMouseDownTime = 0; // Reset so triple-click doesn't re-trigger
            if (!isSplitMode) return;
            const group = tabGroups[activeGroupIndex];
            if (!group || group.tabIds.length < 2) return;

            const tab0 = tabs.find(t => t.id === group.tabIds[0]); // current primary
            const tab1 = tabs.find(t => t.id === group.tabIds[1]); // current secondary

            // Save live input states before swap
            if (tab0 && sharedInputUI?.getInputState) tab0.inputState = sharedInputUI.getInputState();
            if (tab1 && sharedInputUISecondary?.getInputState) tab1.inputStateSecondary = sharedInputUISecondary.getInputState();

            // Swap tab IDs (tab1 becomes primary, tab0 becomes secondary)
            [group.tabIds[0], group.tabIds[1]] = [group.tabIds[1], group.tabIds[0]];

            // Invert ratio so each pane keeps its visual width
            group.ratio = 100 - (group.ratio || 50);

            // Remap input states to the correct slot for new positions:
            // tab1 is now primary → switchGroup reads tab1.inputState, so promote from inputStateSecondary
            // tab0 is now secondary → switchGroup reads tab0.inputStateSecondary, so demote from inputState
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
        const SNAP_ZONE = 2; // percent

        const onMouseMove = (moveEvent) => {
            if (!resizerDragging) return;
            const containerWidth = document.getElementById('spotlight-main-area').clientWidth;
            let ratio = (moveEvent.pageX / containerWidth) * 100;
            ratio = Math.max(20, Math.min(80, ratio)); // Min 20% width for each

            // Snap to center
            if (Math.abs(ratio - SNAP_CENTER) <= SNAP_ZONE) {
                ratio = SNAP_CENTER;
                divider.classList.add('snapped');
            } else {
                divider.classList.remove('snapped');
            }

            primaryPane.style.flex = ratio;
            secondaryPane.style.flex = (100 - ratio);

            // Save ratio to current group
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

    // Find group
    const groupIdx = tabGroups.findIndex(g => g.tabIds.includes(tabId));
    if (groupIdx !== -1) {
        const group = tabGroups[groupIdx];
        group.tabIds = group.tabIds.filter(id => id !== tabId);

        if (group.tabIds.length === 0) {
            // Group became empty -> remove group
            tabGroups.splice(groupIdx, 1);
            if (activeGroupIndex >= tabGroups.length) {
                activeGroupIndex = Math.max(0, tabGroups.length - 1);
            } else if (activeGroupIndex > groupIdx) {
                activeGroupIndex--;
            }
        } else if (activeGroupIndex === groupIdx) {
            // Group still has tabs (was split mode, now single)
            // Just let switchGroup redraw it as single
        }
    }

    // Remove from absolute array and DOM
    tabs.splice(tabIndex, 1);
    if (tabToRemove.historyEl) tabToRemove.historyEl.remove();

    // Re-normalize IDs so tabs are always sequential (tab-1, tab-2, ...)
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
}

function closeGroup(groupIndex) {
    if (groupIndex < 0 || groupIndex >= tabGroups.length) return;
    const group = tabGroups[groupIndex];
    // Copy tabIds since closeTab modifies the arrays
    const idsToClose = [...group.tabIds];

    idsToClose.forEach(id => closeTab(id));
}

function updateTabTitle(chatUIInstance, title) {
    // Find tab by chatUI instance
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
        scrollTop: tab.historyEl ? tab.historyEl.scrollTop : (tab.scrollTop || -1),
        scrollAnchorIndex: tab.scrollAnchorIndex,
        scrollAnchorOffset: tab.scrollAnchorOffset
    }));

    chrome.storage.local.set({
        spotlight_tabs: tabsMetadata,
        spotlight_tab_counter: tabs.length, // Always save actual count, not incremented counter
        spotlight_tab_groups: tabGroups,
        spotlight_active_group_index: activeGroupIndex,
        spotlight_group_counter: groupCounter
    });
}

let isDragging = false;
let startX = 0;
let draggedElement = null;
let initialRects = [];
let totalDeltaX = 0;
let groupPreviewTargetIndex = -1; // Index of tab that would be grouped with dragged tab

function getGroupColor(sessionId, tabIndex) {
    // 1. SPLIT MODE: Active and Secondary tabs share a special blue group
    if (isSplitMode) {
        if (tabIndex === activeTabIndex || tabIndex === secondaryActiveTabIndex) {
            return '#0056D2'; // Split group color
        }
    }

    // 2. Already grouped by sessionId (existing logic)
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
        // The container acts as the 'tab' aesthetically
        groupEl.className = `spotlight-tab ${isActive ? 'active' : ''} ${isSplitGroup ? 'is-split' : ''}`;
        groupEl.dataset.groupIndex = groupIndex;

        // Render sub-tabs inside this group
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
                // Last sub-tab of an inactive split group → close the whole group
                if (isSplitGroup && !isActive && subIdx === group.tabIds.length - 1) {
                    closeGroup(groupIndex);
                } else {
                    closeTab(tabId);
                }
            };

            subTabEl.appendChild(titleSpan);
            subTabEl.appendChild(closeBtn);

            // Sub-tab interaction
            let subTabClickTimer = null;
            subTabEl.onmousedown = (e) => {
                if (e.target.closest('.spotlight-tab-close')) return;
                if (e.button !== 0) return;

                let isInactiveTab = false;

                if (groupIndex === activeGroupIndex) {
                    // Double click opens sidebar
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
                    // Mark as inactive tab, will switch when drag starts
                    isInactiveTab = true;
                }

                // Always allow drag
                isDragging = false;
                initialDraggedIndex = groupIndex;
                startX = e.pageX;
                draggedElement = groupEl;

                const onMouseMove = (moveEvent) => {
                    if (Math.abs(moveEvent.pageX - startX) > 5) {
                        if (!isDragging) {
                            // If this is an inactive tab, switch now before drag starts
                            if (isInactiveTab) {
                                switchGroup(groupIndex);
                                // Re-query draggedElement after switchGroup changes DOM
                                const list = document.getElementById('tabs-list');
                                draggedElement = list.querySelector(`[data-group-index="${groupIndex}"]`);
                            }

                            isDragging = true;
                            draggedElement.classList.add('dragging-smooth');
                            draggedElement.style.zIndex = '1000';

                            const allGroups = Array.from(list.querySelectorAll('.spotlight-tab'));
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
                        // Simple click on inactive tab — switch to it
                        switchGroup(groupIndex);
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

    const tabsBar = document.getElementById('tabs-bar');
    if (tabsBar) {
        if (tabGroups.length < 1) {
            tabsBar.style.display = 'none';
        } else {
            tabsBar.style.display = 'flex';
        }
    }
}

function handleMouseMove(e) {
    if (!isDragging || !draggedElement || initialDraggedIndex === -1) return;

    totalDeltaX = e.pageX - startX;
    draggedElement.style.transform = `translateX(${totalDeltaX}px)`;

    const list = document.getElementById('tabs-list');
    const groupEls = Array.from(list.querySelectorAll('.spotlight-tab'));
    const draggedWidth = initialRects[initialDraggedIndex].width;
    const draggedGroup = tabGroups[initialDraggedIndex];

    const currentLeftEdge = initialRects[initialDraggedIndex].left + totalDeltaX;
    const currentRightEdge = currentLeftEdge + draggedWidth;
    const draggedCenterX = currentLeftEdge + draggedWidth / 2;

    // --- GROUP MERGE PREVIEW DETECTION ---
    // Activate when the leading edge of the dragged tab is between 1/3 and 2/3 of the target tab
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
                // Leading edge is left edge of dragged tab
                if (currentLeftEdge > oneThird && currentLeftEdge <= twoThird) {
                    newGroupPreviewTarget = idx;
                }
            } else {
                // Leading edge is right edge of dragged tab
                if (currentRightEdge >= oneThird && currentRightEdge < twoThird) {
                    newGroupPreviewTarget = idx;
                }
            }
        });
    }

    // Update preview state
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

    // While in group preview mode: suppress reorder shifts so nothing jumps around
    if (groupPreviewTargetIndex !== -1) {
        groupEls.forEach((el, idx) => {
            if (idx !== initialDraggedIndex) el.style.transform = '';
        });
        return;
    }

    // --- NORMAL REORDER LOGIC ---
    groupEls.forEach((el, idx) => {
        if (idx === initialDraggedIndex) return;

        const elRect = initialRects[idx];
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

    // --- GROUP MERGE: released while preview was active ---
    if (groupPreviewTargetIndex !== -1) {
        const targetGroup = tabGroups[groupPreviewTargetIndex];
        const draggedGroup = tabGroups[initialDraggedIndex];

        if (targetGroup && draggedGroup && targetGroup.tabIds.length === 1 && draggedGroup.tabIds.length === 1) {
            const primaryTabId = targetGroup.tabIds[0];
            const secondaryTabId = draggedGroup.tabIds[0];

            // Cleanup visual state
            groupEls.forEach(el => {
                el.style.transform = '';
                el.style.zIndex = '';
                el.classList.remove('dragging-smooth', 'group-merge-preview', 'drop-target-split');
            });
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

    // --- NORMAL REORDER ---
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

    // Cleanup
    groupEls.forEach(el => {
        el.style.transform = '';
        el.style.zIndex = '';
        el.classList.remove('dragging-smooth', 'group-merge-preview', 'drop-target-split');
    });

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


// ─── Spotlight Ask-Selection ───────────────────────────────────────────────

function initSpotlightAskSelection() {
    // Create input popup
    spotlightAskInputDiv = document.createElement('div');
    spotlightAskInputDiv.id = 'lumina-ask-input-popup';

    const input = document.createElement('textarea');
    input.placeholder = 'Ask anything...';
    input.className = 'lumina-ask-input-field';
    input.rows = 1;

    // Auto-resize handler
    input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = (input.scrollHeight) + 'px';
    });

    input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            const val = input.value.trim();
            if (val && spotlightAskSelectionText) {
                const finalQuery = `${val}\n"${spotlightAskSelectionText}"`;
                hideSpotlightAskPopup();
                // Route to the pane the selection came from
                const targetTabIdx = (spotlightAskSourcePane === 'secondary' && isSplitMode)
                    ? secondaryActiveTabIndex
                    : activeTabIndex;
                const targetTab = tabs[targetTabIdx];
                handleSubmit(finalQuery, [], {}, targetTab || null);
            }
        }
        if (e.key === 'Escape') hideSpotlightAskPopup();
    });
    input.addEventListener('keyup', (e) => e.stopPropagation());
    input.addEventListener('keypress', (e) => e.stopPropagation());

    spotlightAskInputDiv.appendChild(input);
    document.body.appendChild(spotlightAskInputDiv);

    // Create button
    spotlightAskBtn = document.createElement('div');
    spotlightAskBtn.id = 'lumina-ask-selection-btn';
    spotlightAskBtn.innerHTML = `
        <div class="lumina-dict-launcher-part">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
        </div>
        <div class="lumina-ask-part">
            Ask
        </div>
    `;
    
    // Wire the sub-element to the global variable for mousedown checks
    spotlightDictLauncherBtn = spotlightAskBtn.querySelector('.lumina-dict-launcher-part');

    spotlightAskBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const dictPart = e.target.closest('.lumina-dict-launcher-part');
        const askPart = e.target.closest('.lumina-ask-part');

        if (dictPart) {
            const word = spotlightAskSelectionText;
            const x = parseInt(spotlightAskBtn.style.left);
            const y = parseInt(spotlightAskBtn.style.top) + 42; // slightly more offset
            showSpotlightDictionaryPopup(word, x, y);
            hideSpotlightAskPopup();
        } else if (askPart || e.target === spotlightAskBtn) {
            showSpotlightAskInput();
        }
    });
    document.body.appendChild(spotlightAskBtn);

    // Show button on text selection inside chat scroll areas
    document.addEventListener('mouseup', (e) => {
        if (spotlightAskBtn && spotlightAskBtn.contains(e.target)) return;
        if (spotlightAskInputDiv && spotlightAskInputDiv.contains(e.target)) return;

        if (window.mouseupTimer) clearTimeout(window.mouseupTimer);
        window.mouseupTimer = setTimeout(() => {
            const sel = window.getSelection();
            const text = sel ? sel.toString().trim() : '';

            if (!text) {
                if (!spotlightAskInputDiv || spotlightAskInputDiv.style.display !== 'flex') {
                    hideSpotlightAskPopup();
                    hideSpotlightDictLauncher();
                }
                return;
            }

            // Hide existing input if new selection starts
            if (spotlightAskInputDiv && spotlightAskInputDiv.style.display === 'flex') {
                hideSpotlightAskPopup();
            }

            const range = sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
            if (!range) return;

            // Detect which pane the selection is in (for Ask routing)
            const commonNode = range.commonAncestorContainer;
            const secondaryPane = document.getElementById('pane-secondary');
            spotlightAskSourcePane = (isSplitMode && secondaryPane && secondaryPane.contains(commonNode))
                ? 'secondary'
                : 'primary';

            spotlightAskSelectionText = text;
            spotlightAskSelectionRange = range.cloneRange();

            // Position button above selection
            const rects = range.getClientRects();
            if (!rects.length) return;

            const firstRect = rects[0];
            const margin = 5;

            // Show the combined unified toolbar
            spotlightAskBtn.style.display = 'flex';
            spotlightAskBtn.style.visibility = 'hidden';
            const btnW = spotlightAskBtn.offsetWidth;
            const btnH = spotlightAskBtn.offsetHeight || 36;
            spotlightAskBtn.style.visibility = 'visible';

            let top = firstRect.top - btnH - margin;
            let left = firstRect.left;
            if (top < 10) top = firstRect.bottom + margin;
            const vw = window.innerWidth;
            if (left + btnW > vw - 10) left = Math.max(10, vw - btnW - 10);
            if (left < 10) left = 10;

            spotlightAskBtn.style.left = left + 'px';
            spotlightAskBtn.style.top = top + 'px';

            // Start tracking scroll
            startSpotlightAskScrollTracking();
        }, 80); // Increased delay for stability
    }, true);
}

function showSpotlightAskInput() {
    if (!spotlightAskBtn || !spotlightAskInputDiv) return;

    const btnRect = spotlightAskBtn.getBoundingClientRect();
    const targetWidth = 260;
    const windowWidth = window.innerWidth;
    let finalLeft = btnRect.left;
    if (finalLeft + targetWidth > windowWidth - 10) finalLeft = Math.max(10, windowWidth - targetWidth - 10);

    spotlightAskInputDiv.style.width = targetWidth + 'px';
    spotlightAskInputDiv.style.left = finalLeft + 'px';
    spotlightAskInputDiv.style.top = btnRect.top + 'px';
    spotlightAskInputDiv.style.display = 'flex';
    spotlightAskBtn.style.display = 'none';

    const input = spotlightAskInputDiv.querySelector('.lumina-ask-input-field');
    if (input) {
        input.value = '';
        setTimeout(() => input.focus(), 10);
    }

    // Ensure tracking is active
    startSpotlightAskScrollTracking();
}

function hideSpotlightAskPopup() {
    if (spotlightAskBtn) spotlightAskBtn.style.display = 'none';
    if (spotlightAskInputDiv) spotlightAskInputDiv.style.display = 'none';
    stopSpotlightAskScrollTracking();
    spotlightAskSelectionText = '';
    spotlightAskSelectionRange = null;
}

// Scroll tracking for Spotlight Ask popup
let spotlightAskScrollHandler = null;

function startSpotlightAskScrollTracking() {
    if (spotlightAskScrollHandler) return;

    spotlightAskScrollHandler = () => {
        requestAnimationFrame(updateSpotlightAskPosition);
    };

    // Use capture to catch scroll events from chat history area
    window.addEventListener('scroll', spotlightAskScrollHandler, { passive: true, capture: true });
    window.addEventListener('resize', spotlightAskScrollHandler, { passive: true });
}

function stopSpotlightAskScrollTracking() {
    if (spotlightAskScrollHandler) {
        window.removeEventListener('scroll', spotlightAskScrollHandler, { capture: true });
        window.removeEventListener('resize', spotlightAskScrollHandler);
        spotlightAskScrollHandler = null;
    }
}

function updateSpotlightAskPosition() {
    if (!spotlightAskSelectionRange) return;

    const btnVisible = spotlightAskBtn && spotlightAskBtn.style.display === 'flex';
    const inputVisible = spotlightAskInputDiv && spotlightAskInputDiv.style.display === 'flex';

    if (!btnVisible && !inputVisible) {
        stopSpotlightAskScrollTracking();
        return;
    }

    const rects = spotlightAskSelectionRange.getClientRects();
    if (!rects.length) return;

    const firstRect = rects[0];
    const margin = 5;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    if (btnVisible) {
        const btnHeight = 34;
        let top = firstRect.top - btnHeight - margin;
        let left = firstRect.left;
        if (top < 10) top = firstRect.bottom + margin;
        const btnWidth = spotlightAskBtn.offsetWidth;
        if (left + btnWidth > viewportWidth - 10) left = Math.max(10, viewportWidth - btnWidth - 10);
        if (left < 10) left = 10;
        spotlightAskBtn.style.left = left + 'px';
        spotlightAskBtn.style.top = top + 'px';
    }

    if (inputVisible) {
        const inputHeight = 34;
        const inputWidth = spotlightAskInputDiv.offsetWidth || 260;
        let top = firstRect.top - inputHeight - margin;
        let left = firstRect.left;
        if (top < 10) top = firstRect.bottom + margin;
        if (left + inputWidth > viewportWidth - 10) left = Math.max(10, viewportWidth - inputWidth - 10);
        if (left < 10) left = 10;
        spotlightAskInputDiv.style.left = left + 'px';
        spotlightAskInputDiv.style.top = top + 'px';
    }
}

// ────────────────────────────────────────────────────────────────────────────

// Initialize
async function init() {
    console.log('[Spotlight Debug] init() starting');
    // Immediate: Initialize search selection UI so listeners work regardless of tab loading
    initSpotlightAskSelection();

    // 1. Inject shared input bar HTML FIRST so LuminaChatUI can find it
    const inputAreaPrimary = document.getElementById('input-area-primary');
    const inputAreaSecondary = document.getElementById('input-area-secondary');

    if (inputAreaPrimary) {
        inputAreaPrimary.innerHTML = LuminaChatUI.getChatInputHTML(true); // autofocus=true
        sharedInputUI = new LuminaChatUI(inputAreaPrimary, {
            isSpotlight: true,
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
            onSubmit: (text, images, extra) => {
                const activeTab = tabs[secondaryActiveTabIndex];
                if (activeTab) handleSubmit(text, images, extra, activeTab);
            }
        });
    }

    // Initialize resizer
    setupResizer();

    // 2. Init Tabs (this will create LuminaChatUI instances which now find the input)
    await initTabs();

    // 3. Ensure we have at least one tab and it's initialized correctly
    if (tabs.length === 0) {
        createTab();
    } else {
        // Initialize global chatUI to the active tab's instance
        if (tabs[activeTabIndex]) {
            chatUI = tabs[activeTabIndex].chatUIInstance;
            if (sharedInputUI) {
                sharedInputUI.historyEl = tabs[activeTabIndex].historyEl;
            }
        }
    }

    setupPort();

    // Setup regenerate/stop button click handler (matches popup behavior)
    setupRegenerateButtons();

    // Load shortcuts, mappings and settings
    chrome.storage.local.get(['shortcuts', 'globalDefaults', 'questionMappings', 'askSelectionPopupEnabled'], (items) => {
        shortcuts = items.shortcuts || {};
        questionMappings = items.questionMappings || [];
        askSelectionPopupEnabled = items.askSelectionPopupEnabled ?? false;
        if (items.globalDefaults && items.globalDefaults.fontSize) {
            applyFontSize(items.globalDefaults.fontSize);
        }
        setupGlobalListeners();
    });

    // Listen for settings changes
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local') {
            if (changes.shortcuts) shortcuts = changes.shortcuts.newValue || {};
            if (changes.questionMappings) questionMappings = changes.questionMappings.newValue || [];
            if (changes.askSelectionPopupEnabled) {
                askSelectionPopupEnabled = changes.askSelectionPopupEnabled.newValue ?? false;
                if (!askSelectionPopupEnabled) hideSpotlightAskPopup();
            }
            if (changes.globalDefaults && changes.globalDefaults.newValue && changes.globalDefaults.newValue.fontSize) {
                applyFontSize(changes.globalDefaults.newValue.fontSize);
            }
        }
    });

    // Listen for tab-local model selection events from the model dropdown
    // (fired by LuminaChatUI._setupModelSelector via CustomEvent 'lumina:spotlight-model-change')
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
            // CRITICAL: Update global lastUsedModel so new tabs/reloads use this choice
            chrome.storage.local.set({ lastUsedModel: activeTab.selectedModel });
        }
    });

    // Initialize sidebar
    setupSidebar();

    // Initialize ask-selection button for text selected inside spotlight

    // Listen for live preview from options
    // Listen for live preview from options and system commands
    chrome.runtime.onMessage.addListener((request) => {
        if (request.action === 'settings_updated') {
            // Prefer draft fontSize, then global default
            const size = request.settings.fontSize || (request.settings.globalDefaults?.fontSize);
            if (size) applyFontSize(size);
        } else if (request.action === 'clear_selection') {
            // Clear any text selection
            window.getSelection().removeAllRanges();
            // Re-focus the input
            ensureFocus();
        } else if (request.action === 'new_chat') {
            resetChat();
        }
    });


    // Helper: Ensure focus (retries for reliability)
    function ensureFocus() {
        const targetInput = getHoveredInputEl();
        if (!targetInput) return;

        // Check if sidebar is active
        const sidebar = document.getElementById('spotlight-sidebar');
        if (sidebar && sidebar.classList.contains('active')) return;

        const setCursorToEnd = (el) => {
            try {
                el.focus();
                // Move cursor to end
                const len = el.value.length;
                el.setSelectionRange(len, len);
            } catch (e) {
                // Ignore potential errors if element is detached
            }
        };

        // Immediate
        setCursorToEnd(targetInput);

        // Short delays to handle window animation/restoration
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

    // Auto-focus on load
    ensureFocus();

    // Auto-focus when window regains focus
    window.addEventListener('focus', () => {
        const selection = window.getSelection().toString().trim();
        // Prevent auto-filling if selection looks like internal CSS variables (bug fix)
        if (selection && (selection.includes('--lumina-') || selection.includes('var(--lumina'))) {
            window.getSelection().removeAllRanges();
            ensureFocus();
            return;
        }

        // If no text is selected inside the spotlight window, force focus to input
        if (!selection) {
            ensureFocus();
        }
    });

    // Save scroll position for active tab periodically
    setInterval(() => {
        if (tabs[activeTabIndex]) {
            const currentScroll = tabs[activeTabIndex].historyEl.scrollTop;
            if (tabs[activeTabIndex].scrollTop !== currentScroll) {
                tabs[activeTabIndex].scrollTop = currentScroll;
                saveTabsState();
            }
        }
    }, 5000);
}

// Setup connection to background
function setupPort() {
    try {
        port = chrome.runtime.connect({ name: 'lumina-chat-stream' });

        port.onMessage.addListener((msg) => {
            // Determine affected tabs (all tabs sharing the streaming session)
            let affectedTabs = [];
            if (streamingTab && streamingTab.sessionId) {
                affectedTabs = tabs.filter(t => t.sessionId === streamingTab.sessionId);
            } else if (chatUI) {
                affectedTabs = [tabs[activeTabIndex]];
            }

            if (msg.error) {
                affectedTabs.forEach(tab => {
                    const targetUI = tab.chatUIInstance;
                    targetUI.removeLoading();
                    targetUI.removeSearching();
                    targetUI.appendError(msg.error);
                    targetUI.currentAnswerDiv = null;
                    targetUI.hideStopButton();
                });
                streamingTab = null;
                return;
            }

            // Handle web search status updates
            if (msg.action === 'web_search_status') {
                affectedTabs.forEach(tab => {
                    tab.chatUIInstance.handleWebSearchStatus(msg);
                });
                return;
            }

            if (msg.action === 'youtube_status') {
                affectedTabs.forEach(tab => {
                    tab.chatUIInstance.handleYoutubeStatus(msg);
                });
                return;
            }

            // Handle streaming chunks
            if (msg.action === 'chunk' && msg.chunk) {
                affectedTabs.forEach(tab => {
                    // Only scroll the tab that submitted — other shared-session tabs scroll independently
                    const skipScroll = tab.id !== streamingTab?.id;
                    tab.chatUIInstance.appendChunk(msg.chunk, skipScroll);
                });
            }

            // Handle stream completion
            if (msg.action === 'done') {
                // done message received — finishAnswer called below
                affectedTabs.forEach(tab => {
                    const targetUI = tab.chatUIInstance;
                    const answerDiv = targetUI.currentAnswerDiv;
                    const isRegen = !!targetUI._regenScrollLocked;
                    // Skip margin recalc + scroll when regenerating (min-height is cleaned up in done handler)
                    const skipScroll = isRegen || tab.id !== streamingTab?.id;
                    const skipMargin = isRegen;
                    targetUI.finishAnswer(skipMargin, skipScroll);

                    // ── Restore locked scroll after finishAnswer ──────────────────────────────
                    if (isRegen && targetUI._regenScrollContainer) {
                        const lockedContainer = targetUI._regenScrollContainer;
                        requestAnimationFrame(() => {
                            requestAnimationFrame(() => {
                                // Re-enable scroll anchoring
                                lockedContainer.style.overflowAnchor = '';
                                // Clean up lock state — min-height stays on entry until next
                                // question clears it via clearEntryMargins()
                                targetUI._regenScrollLocked = false;
                                targetUI._regenScrollContainer = null;
                                targetUI._regenScrollPosition = null;
                                // Re-evaluate auto-scroll: if user is near bottom, re-enable
                                const sh = lockedContainer.scrollHeight;
                                const vh = lockedContainer.clientHeight;
                                const pos = lockedContainer.scrollTop;
                                const nearBottom = sh - (pos + vh) <= 20;
                                targetUI.disableAutoScroll = !nearBottom;
                            });
                        });
                    }
                    // ─────────────────────────────────────────────────────────────────────────

                    requestAnimationFrame(() => {
                        targetUI.hideStopButton();
                        if (answerDiv) {
                            const entry = answerDiv.closest('.lumina-dict-entry');
                            if (entry) {
                                const nav = entry.querySelector('.lumina-answer-nav');
                                if (nav) nav.style.display = 'flex';

                                // Update cache if it was a translation regeneration
                                if (targetUI._regenEntryType === 'translation' && targetUI._regenSourceText) {
                                    const latestTranslation = answerDiv.textContent.trim();
                                    chrome.runtime.sendMessage({
                                        action: 'update_translation_cache',
                                        text: targetUI._regenSourceText,
                                        translation: latestTranslation,
                                        targetLang: 'vi' // Default or detected?
                                    });
                                }
                            }
                        }
                    });
                });

                // Clear streaming tab
                streamingTab = null;
            }
        });

        port.onDisconnect.addListener(() => {
            // Disconnected from background
            port = null; // Mark as invalid immediately to force reconnection on next use

            // Clean up any pending regen scroll lock
            if (streamingTab && streamingTab.sessionId) {
                const affectedTabs = tabs.filter(t => t.sessionId === streamingTab.sessionId);
                affectedTabs.forEach(t => {
                    const tUI = t.chatUIInstance;
                    t.chatUIInstance.hideStopButton();
                    if (tUI._regenScrollLocked && tUI._regenScrollContainer) {
                        tUI._regenScrollContainer.scrollTop = tUI._regenScrollPosition;
                        tUI._regenScrollContainer.style.overflowAnchor = '';
                        tUI._regenScrollLocked = false;
                        tUI._regenScrollContainer = null;
                        tUI._regenScrollPosition = null;
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
        });

    } catch (e) {
        console.error('[Spotlight] Failed to setup port:', e);
        port = null;
    }
}

// Handle message submission (called by LuminaChatUI)
let streamingTab = null; // Track which tab initiated the request

async function handleSubmit(text, images, extra = {}, targetTab = null) {
    // If targetTab is provided, use it (Split Mode). Otherwise use activeTabIndex
    const currentTab = targetTab || tabs[activeTabIndex];
    if (!currentTab) return;

    // Use the tab's specific chatUI instance
    const targetChatUI = currentTab.chatUIInstance;

    // Refresh global chatUI if this is the active primary tab
    if (currentTab === tabs[activeTabIndex]) {
        chatUI = targetChatUI;
    }

    // Reset scroll lock so new entry always animates into view
    currentTab.userScrolledUp = false;
    if (targetChatUI) targetChatUI.disableAutoScroll = false;

    // Keyword command prefixes (colon optional): "Translate", "Proofread", "Google AI" ...
    const translateMatch = text && text.match(/^translate:?\s*([\s\S]*)/i);
    const proofreadMatch = !translateMatch && text && text.match(/^proofread:?\s*([\s\S]*)/i);

    if (translateMatch) {
        text = translateMatch[1].trim();
        extra = { ...extra, mode: 'translate' };
    } else if (proofreadMatch) {
        text = proofreadMatch[1].trim();
        extra = { ...extra, mode: 'proofread' };
    }

    // Update Tab Title to reflect current question - Sync across all tabs in this session
    if (currentTab) {
        const rawText = text || (images.length > 0 ? 'Video/Image Analysis' : 'Chat');
        const newTitle = rawText.length > 20 ? rawText.substring(0, 20) + '...' : rawText;

        // Sync title across all tabs in this session
        tabs.forEach(t => {
            if (t.sessionId === currentTab.sessionId) {
                t.title = newTitle;
            }
        });

        renderTabs();
        saveTabsState();
    }

    // Track streaming session
    streamingTab = currentTab;

    // Support tool modes from extra (for dropdown tools)
    if (extra.mode === 'translate') {
        await targetChatUI.handleTranslation(text);
        return;
    }

    if (extra.mode === 'websource') {
        // Apply to all sync tabs
        tabs.filter(t => t.sessionId === currentTab.sessionId).forEach(t => {
            t.chatUIInstance.openWebSource(extra.source, text);
        });
        return;
    }

    // Regular chat flow
    const conversationHistory = targetChatUI.gatherMessages();

    // Determine streaming action
    let streamAction = 'chat_stream';
    if (extra.mode === 'proofread') {
        streamAction = 'proofread';
    }

    // UI Updates - Sync across all tabs in this session
    const syncTabs = tabs.filter(t => t.sessionId === currentTab.sessionId);

    syncTabs.forEach(t => {
        // Only scroll the tab that actually submitted — the other shared-session tab scrolls independently
        const skipMargin = t !== currentTab;

        const qDiv = t.chatUIInstance.appendQuestion(text, images, {
            editable: true,
            skipMargin: skipMargin,
            entryType: extra.mode || 'qa'
        });
        if (qDiv) {
            const editable = qDiv.querySelector('[contenteditable]');
            if (editable) attachQuestionListeners(editable);
        }
        t.chatUIInstance.showLoading();
    });

    // Prepare message
    // Primary source: tab's stored selectedModel.
    // Fallback: sharedInputUI.activeTabModel (set synchronously on click, always up-to-date).
    let tabModel = currentTab?.selectedModel;
    if (!tabModel) {
        const isSecondaryTab = isSplitMode && currentTab === tabs[secondaryActiveTabIndex];
        const fallbackUI = isSecondaryTab ? sharedInputUISecondary : sharedInputUI;
        if (fallbackUI?.activeTabModel?.model) {
            tabModel = fallbackUI.activeTabModel;
        }
    }


    const message = {
        action: streamAction,
        messages: conversationHistory,
        initialContext: '',
        question: text || 'Describe these images',
        imageData: images.length > 0 ? images : null,
        isSpotlight: true,
        hasTranscriptForVideoId: currentTab?.chatUI?.getTranscriptVideoId ? currentTab.chatUI.getTranscriptVideoId() : null,
        options: extra,
        requestOptions: {
            ...(tabModel ? { tabModel: { providerId: tabModel.providerId, model: tabModel.model } } : {})
        }
    };

    // Update global last used model for persistence
    if (tabModel) {
        chrome.storage.local.set({ lastUsedModel: tabModel });
    }

    // Send to background
    const sendMessage = () => {
        if (!port) setupPort();
        if (!port) throw new Error("Could not establish connection");
        port.postMessage(message);

        // Show stop button on all sync tabs
        syncTabs.forEach(t => {
            t.chatUIInstance.showStopButton(() => {
                if (port) {
                    port.disconnect();
                    port = null;
                }
                syncTabs.forEach(st => st.chatUIInstance.removeLoading());
            });
        });
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



// Handle translation requests - use shared LuminaChatUI method
async function handleTranslation(text) {
    await chatUI.handleTranslation(text);

}

// Global keyboard listeners (not handled by LuminaChatUI)
function setupGlobalListeners() {
    // Track which pane the mouse is hovering over to route keystrokes correctly
    const panePrimary = document.getElementById('pane-primary');
    const paneSecondary = document.getElementById('pane-secondary');

    // Helper: transfer focus to the correct input when entering a pane.
    // Only fires if the user is not mid-drag (no mouse button held) and there is no
    // active text selection — otherwise we'd interrupt a cross-pane drag-select.
    function transferFocusOnPaneEnter(inputEl, e) {
        if (!inputEl) return;
        if (!isSplitMode) return;
        if (e.buttons !== 0) return; // dragging (e.g. text selection in progress)
        const selection = window.getSelection();
        if (selection && selection.toString().trim().length > 0) return; // text selected
        const sidebar = document.getElementById('spotlight-sidebar');
        if (sidebar && sidebar.classList.contains('active')) return;
        inputEl.focus();
    }

    if (panePrimary) {
        panePrimary.addEventListener('mouseenter', (e) => {
            hoveredPane = 'primary';
            transferFocusOnPaneEnter(sharedInputUI?.inputEl, e);
        });
    }
    if (paneSecondary) {
        paneSecondary.addEventListener('mouseenter', (e) => {
            hoveredPane = 'secondary';
            transferFocusOnPaneEnter(sharedInputUISecondary?.inputEl, e);
        });
    }

    // Also update hoveredPane when an input is directly focused (e.g. click after reload
    // before any mouseenter has fired). This prevents the keydown handler from mis-routing
    // keystrokes back to the primary input when secondary was focused via direct click.
    if (sharedInputUI?.inputEl) {
        sharedInputUI.inputEl.addEventListener('focus', () => { hoveredPane = 'primary'; });
    }
    if (sharedInputUISecondary?.inputEl) {
        sharedInputUISecondary.inputEl.addEventListener('focus', () => { hoveredPane = 'secondary'; });
    }

    document.addEventListener('keydown', (event) => {
        // Track modifier-only presses
        if (['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) {
            modifierKeyPressedAlone = true;
        } else {
            modifierKeyPressedAlone = false;
        }

        // Check for configurable resetChat shortcut
        const resetShortcut = shortcuts.resetChat;
        if (resetShortcut) {
            const matchCode = event.code === resetShortcut.code;
            const matchCtrl = !!resetShortcut.ctrlKey === event.ctrlKey;
            const matchAlt = !!resetShortcut.altKey === event.altKey;
            const matchShift = !!resetShortcut.shiftKey === event.shiftKey;
            const matchMeta = !!resetShortcut.metaKey === event.metaKey;

            if (matchCode && matchCtrl && matchAlt && matchShift && matchMeta) {
                event.preventDefault();
                resetChat();
                return;
            }
        }

        // Backtick shortcut to edit last question
        if (event.key === '`') {
            const activeTab = tabs[activeTabIndex];
            if (activeTab && activeTab.historyEl) {
                // Entries are stored in elements with class .lumina-dict-entry
                const entries = activeTab.historyEl.querySelectorAll('.lumina-dict-entry');
                if (entries.length > 0) {
                    const lastEntry = entries[entries.length - 1];
                    // Also find elements without the exact attribute check (from history) but exclude files container
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
                        const sel = window.getSelection();
                        sel.removeAllRanges();
                        sel.addRange(range);

                        // Scroll using the same logic as new entries
                        if (activeTab.chatUIInstance) {
                            activeTab.chatUIInstance.adjustEntryMargin(lastEntry, 'auto');
                        }
                        return;
                    }
                }
            }
        }

        const activeElement = document.activeElement;
        const selection = window.getSelection().toString().trim();
        const inputEl = getHoveredInputEl();

        // Ignore Space key when no selection
        if (event.key === ' ' && !selection) return;

        // Handle selection + Enter (Search selected text)
        if (selection && event.key === 'Enter' && !isSelectionInsideEditable()) {
            event.preventDefault();
            handleSubmit(selection, []);
            window.getSelection().removeAllRanges();
            return;
        }

        // Auto-focus input for typing
        const isEditing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(activeElement.tagName) || activeElement.isContentEditable;

        // Bypass standard browser/system shortcuts (only pure Ctrl/Cmd + key, not Ctrl+Shift combinations)
        if ((event.ctrlKey || event.metaKey) && !event.shiftKey && ['r', 't', 'n', 'w', 'l', 'f', 'p', 's', 'c', 'x', 'z', 'y'].includes(event.key.toLowerCase())) {
            return;
        }

        // Play Audio shortcut — works with or without selection (no selection = stop)
        if (matchesShortcut(event, 'audio', shortcuts)) {
            if (isSelectionInsideEditable()) return;
            event.preventDefault();
            event.stopPropagation();
            if (selection) {
                stopSpotlightAudio();
                _spotlightAudioAborted = false;
                playSpotlightAudio(selection);
            } else {
                stopSpotlightAudio();
            }
            return;
        }

        // === SELECTION-BASED SHORTCUTS ===
        if (selection && !isSelectionInsideEditable()) {

            // Ask Lumina shortcut — show inline ask-input above the selection
            if (matchesShortcut(event, 'askLumina', shortcuts)) {
                event.preventDefault();
                event.stopPropagation();

                const sel = window.getSelection();
                const range = sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
                if (range && spotlightAskBtn && spotlightAskInputDiv) {
                    // Save selection state
                    spotlightAskSelectionText = selection;
                    spotlightAskSelectionRange = range.cloneRange();

                    // Detect source pane
                    const commonNode = range.commonAncestorContainer;
                    const secondaryPane = document.getElementById('pane-secondary');
                    spotlightAskSourcePane = (isSplitMode && secondaryPane && secondaryPane.contains(commonNode))
                        ? 'secondary' : 'primary';

                    // Position button above the selection (same logic as mouseup handler)
                    const rects = range.getClientRects();
                    if (rects.length) {
                        const firstRect = rects[0];
                        const btnHeight = 34;
                        const margin = 5;
                        let top = firstRect.top - btnHeight - margin;
                        let left = firstRect.left;

                        if (top < 10) top = firstRect.bottom + margin;

                        spotlightAskBtn.style.visibility = 'hidden';
                        spotlightAskBtn.style.display = 'flex';
                        const btnWidth = spotlightAskBtn.offsetWidth;
                        spotlightAskBtn.style.visibility = '';

                        const vw = window.innerWidth;
                        if (left + btnWidth > vw - 10) left = Math.max(10, vw - btnWidth - 10);
                        if (left < 10) left = 10;

                        spotlightAskBtn.style.left = left + 'px';
                        spotlightAskBtn.style.top = top + 'px';
                    }

                    // Immediately open the input (skip the button-click step)
                    showSpotlightAskInput();
                    window.getSelection().removeAllRanges();
                }
                return;
            }

            // Translate shortcut
            if (matchesShortcut(event, 'translate', shortcuts)) {

                event.preventDefault();
                event.stopPropagation();
                handleTranslation(selection);
                window.getSelection().removeAllRanges();
                hideSpotlightAskPopup();
                return;
            }


            // Image Lookup shortcut
            if (matchesShortcut(event, 'image', shortcuts)) {
                event.preventDefault();
                event.stopPropagation();
                handleSubmit(`Find images for: "${selection}"`, []);
                window.getSelection().removeAllRanges();
                hideSpotlightAskPopup();
                return;
            }

            // Custom Mappings
            if (questionMappings && questionMappings.length > 0) {
                for (const mapping of questionMappings) {
                    // Skip invalid mappings
                    if (!mapping.prompt) continue;

                    let isMatch = false;

                    // Support new format with modifiers (keyData)
                    if (mapping.keyData) {
                        isMatch = isShortcutMatch(event, mapping.keyData);
                    }
                    // Support legacy format (simple string key)
                    else if (mapping.key) {
                        const keyLower = mapping.key.toLowerCase();
                        const eventKey = event.key.toLowerCase();
                        // Assume no modifiers for legacy simple keys
                        isMatch = (eventKey === keyLower && !event.ctrlKey && !event.metaKey && !event.altKey);
                    }

                    if (isMatch) {
                        event.preventDefault();
                        event.stopPropagation();

                        // Build full question with variable replacement
                        let fullQuestion;
                        if (mapping.prompt.includes('$SelectedText') || mapping.prompt.includes('$Sentence') || mapping.prompt.includes('$Paragraph') || mapping.prompt.includes('$Container')) {
                            fullQuestion = mapping.prompt
                                .replace(/\$SelectedText/gi, selection.trim())
                                .replace(/\$Sentence/gi, selection.trim())
                                .replace(/\$Paragraph/gi, selection.trim())
                                .replace(/\$Container/gi, selection.trim());
                        } else {
                            fullQuestion = `${mapping.prompt} "${selection.trim()}"`;
                        }

                        handleSubmit(fullQuestion, []);
                        window.getSelection().removeAllRanges();
                        hideSpotlightAskPopup();
                        return;
                    }
                }
            }
        }

        // Auto-focus and allow Paste (Ctrl+V) to target the input
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') {
            // Don't hijack if user is focusing on another input/editable
            const activeEl = document.activeElement;
            if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) {
                return;
            }

            // Don't hijack if sidebar is active
            const sidebar = document.getElementById('spotlight-sidebar');
            if (sidebar && sidebar.classList.contains('active')) return;

            if (inputEl) inputEl.focus();
            return;
        }

        // Focus and Select All (Ctrl+A) to target the input
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
            // Don't hijack if user is focusing on another input (like sidebar search)
            const activeEl = document.activeElement;
            if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) {
                return;
            }

            // Don't hijack if sidebar is active
            const sidebar = document.getElementById('spotlight-sidebar');
            if (sidebar && sidebar.classList.contains('active')) return;

            event.preventDefault();
            if (inputEl) {
                inputEl.focus();
                inputEl.select();
            }
            return;
        }

        // Ignore pure modifier keys
        if (['Control', 'Shift', 'Alt', 'Meta', 'Tab', 'CapsLock'].includes(event.key)) return;

        // In split mode, if a different pane's input currently has focus, we must redirect
        // keystrokes to the hovered pane's input instead of letting them fall into the
        // already-focused (wrong) input.
        const isWrongPaneFocused = isSplitMode && inputEl && activeElement !== inputEl &&
            (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA' || activeElement.isContentEditable);

        // If user has text selected inside spotlight, allow shortcuts to work
        if ((!isEditing || isWrongPaneFocused) && inputEl) {
            // Check if sidebar is active
            const sidebar = document.getElementById('spotlight-sidebar');
            if (sidebar && sidebar.classList.contains('active')) return;

            // Check if there's any text selected
            if (selection) {
                // Selection exists - allow shortcuts to work, don't auto-focus
                return;
            }

            event.stopPropagation();
            event.stopImmediatePropagation();

            inputEl.focus();

            if (inputEl.setSelectionRange) {
                const len = inputEl.value.length;
                inputEl.setSelectionRange(len, len);
            }

            if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
                event.preventDefault();
                const val = inputEl.value;
                inputEl.value = val + event.key;
                inputEl.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }
    }, true);

    // Keyup handler: fires lone-modifier shortcuts (e.g. ShiftRight alone → audio playback)
    document.addEventListener('keyup', (event) => {
        if (!['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) return;
        if (!modifierKeyPressedAlone) return;

        // Check all configured shortcuts that are lone-modifier type
        const shortcutActions = Object.keys(shortcuts);
        for (const action of shortcutActions) {
            const sc = shortcuts[action];
            if (!sc || !['Control', 'Alt', 'Shift', 'Meta'].includes(sc.key)) continue;
            if (isShortcutMatch(event, sc)) {
                event.preventDefault();
                // Dispatch the shortcut action
                if (action === 'audio') {
                    const selection = window.getSelection().toString().trim();
                    if (selection) {
                        stopSpotlightAudio();
                        _spotlightAudioAborted = false;
                        playSpotlightAudio(selection);
                    } else {
                        stopSpotlightAudio();
                    }
                } else if (action === 'image') {
                    const selection = window.getSelection().toString().trim();
                    if (selection) {
                        handleSubmit(`Find images for: "${selection}"`, []);
                        window.getSelection().removeAllRanges();
                        hideSpotlightAskPopup();
                    }
                } else if (action === 'luminaChat') {
                    // handled by content.js
                } else if (action === 'askLumina') {
                    const sel = window.getSelection();
                    const text = sel.toString().trim();
                    const range = sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
                    if (text && range && spotlightAskBtn && spotlightAskInputDiv) {
                        spotlightAskSelectionText = text;
                        spotlightAskSelectionRange = range.cloneRange();

                        const commonNode = range.commonAncestorContainer;
                        const secondaryPane = document.getElementById('pane-secondary');
                        spotlightAskSourcePane = (isSplitMode && secondaryPane && secondaryPane.contains(commonNode))
                            ? 'secondary' : 'primary';

                        const rects = range.getClientRects();
                        if (rects.length) {
                            const firstRect = rects[0];
                            let top = firstRect.top - 45;
                            let left = firstRect.left;
                            if (top < 10) top = firstRect.bottom + 5;
                            spotlightAskBtn.style.visibility = 'hidden';
                            spotlightAskBtn.style.display = 'flex';
                            const bw = spotlightAskBtn.offsetWidth;
                            spotlightAskBtn.style.visibility = '';
                            const vw = window.innerWidth;
                            if (left + bw > vw - 10) left = Math.max(10, vw - bw - 10);
                            if (left < 10) left = 10;
                            spotlightAskBtn.style.left = left + 'px';
                            spotlightAskBtn.style.top = top + 'px';
                        }

                        showSpotlightAskInput();
                        window.getSelection().removeAllRanges();
                        hideSpotlightAskPopup();
                    }
                } else if (action === 'resetChat') {
                    resetChat();
                }
                break;
            }
        }
    }, true);

    // Reset chat with configured mouse shortcut (if any)
    document.addEventListener('mousedown', (event) => {
        const resetShortcut = shortcuts.resetChat;
        if (!resetShortcut) return;

        if (isShortcutMatch(event, resetShortcut)) {
            event.preventDefault();
            resetChat();
        }
    });
}

// Reset chat
function resetChat() {
    // Determine which pane to reset based on hover state
    const isSecondaryTarget = isSplitMode && hoveredPane === 'secondary';

    if (isSecondaryTarget) {
        // Reset secondary pane


        if (chatUISecondary) {
            chatUISecondary.clearHistory();
            if (chatUISecondary.inputEl) {
                chatUISecondary.inputEl.value = '';
                chatUISecondary.inputEl.style.height = 'auto';
                chatUISecondary.inputEl.focus();
            }
        }

        if (secondaryActiveTabIndex !== -1) {
            const secondaryTab = tabs[secondaryActiveTabIndex];
            if (secondaryTab) {
                const newSessionId = 'session_' + Date.now() + Math.random().toString(36).substr(2, 5);
                secondaryTab.title = 'New Tab';
                secondaryTab.sessionId = newSessionId;
                secondaryTab.scrollTop = -1;
            }
        }

        renderTabs();
        saveTabsState();

        // Hide regenerate button for secondary pane
        const paneSecondaryEl = document.getElementById('pane-secondary');
        const regenBtnSec = paneSecondaryEl?.querySelector('#lumina-regenerate-btn');
        if (regenBtnSec) regenBtnSec.style.display = 'none';

    } else {
        // Reset primary pane


        chatUI.clearHistory();
        if (chatUI.inputEl) {
            chatUI.inputEl.value = '';
            chatUI.inputEl.style.height = 'auto';
            chatUI.inputEl.focus();
        }

        // Reset current tab metadata to 'New Tab' state
        if (activeTabIndex !== -1) {
            const activeTab = tabs[activeTabIndex];
            const newSessionId = 'session_' + Date.now() + Math.random().toString(36).substr(2, 5);

            activeTab.title = 'New Tab';
            activeTab.sessionId = newSessionId;
            activeTab.scrollTop = -1;


            // Refresh UI and save state
            renderTabs();
            saveTabsState();

        }

        // Hide regenerate button for new chat
        const regenBtn = document.getElementById('lumina-regenerate-btn');
        if (regenBtn) regenBtn.style.display = 'none';
    }
}

// Setup regenerate/stop button click handler
function setupRegenerateButtons() {
    const buttons = document.querySelectorAll('#lumina-regenerate-btn');
    buttons.forEach(btn => {
        // Clone to remove old listeners if re-calling
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);

        newBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            const isSecondary = newBtn.closest('#pane-secondary') !== null;
            const targetUI = isSecondary ? chatUISecondary : chatUI;

            if (newBtn.classList.contains('loading')) {
                if (targetUI && targetUI._stopCallback) targetUI._stopCallback();
                if (targetUI) targetUI.hideStopButton();
            } else {
                triggerRegenerate(targetUI);
            }
        });
    });
}

// Start
document.addEventListener('DOMContentLoaded', init);

window.addEventListener('beforeunload', () => {
    if (activeTabIndex >= 0) {
        const activeTab = tabs[activeTabIndex];
        if (activeTab && activeTab.historyEl) {
            activeTab.scrollTop = activeTab.historyEl.scrollTop;
        }
    }
    saveTabsState();
});

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

// Smart copy: extract only visible text, skip UI elements
document.addEventListener('copy', (e) => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);
    const fragment = range.cloneContents();

    // Extract visible text only
    function getVisibleText(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            return node.textContent;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return '';

        const el = node;
        const tag = el.tagName.toLowerCase();

        // Skip common UI elements
        if (['button', 'svg', 'mat-icon', 'script', 'style', 'noscript'].includes(tag)) {
            return '';
        }

        // Skip elements with aria-hidden
        if (el.getAttribute('aria-hidden') === 'true') {
            return '';
        }

        // Skip icon fonts (common classes)
        const className = el.className?.toString() || '';
        if (/\b(icon|material-icons|google-symbols|fa-|glyphicon)\b/i.test(className)) {
            return '';
        }

        // Recurse into children
        let text = '';
        for (const child of el.childNodes) {
            text += getVisibleText(child);
        }

        // Add newline based on display type
        if (['div', 'p', 'br', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) {
            text = '\n' + text + '\n';
        }

        return text;
    }

    let extracted = getVisibleText(fragment);

    // Clean up
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

// =============== REGENERATE FUNCTIONALITY ===============

function triggerRegenerate(targetUI = null) {
    const tUI = targetUI || chatUI;
    const history = tUI?.historyEl;
    if (!history) return;

    // Find the very last entry
    const lastEntry = history.lastElementChild;
    if (!lastEntry || !lastEntry.classList.contains('lumina-dict-entry')) return;

    const entryType = lastEntry.dataset.entryType;
    let originalQuestion = null;

    // Priority 1: Translation/Dictionary specific extraction based on entryType
    if (entryType === 'translation') {
        const transSource = lastEntry.querySelector('.lumina-translation-source .lumina-translation-text');
        if (transSource) {
            const sourceText = transSource.textContent.trim();
            originalQuestion = `Translate this text: "${sourceText}"`;

            // Store for cache update later
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

    handleRegenerate(lastEntry, originalQuestion, tUI);
}

async function handleRegenerate(entryElement, questionText, targetUI = null) {
    const tUI = targetUI || chatUI;

    // ── Viewport setup ────────────────────────────────────────────────────────
    const _sc = tUI ? tUI.getScrollContainer() : null;
    // Calculate scroll target from previous entry's separator BEFORE any DOM changes
    let _regenTargetScroll = null;
    if (_sc) {
        const allEntries = _sc.querySelectorAll('.lumina-dict-entry');
        const currentIndex = Array.from(allEntries).indexOf(entryElement);
        if (currentIndex > 0) {
            const previousEntry = allEntries[currentIndex - 1];
            const containerRect = _sc.getBoundingClientRect();
            const prevRect = previousEntry.getBoundingClientRect();
            _regenTargetScroll = (prevRect.bottom - containerRect.top) + _sc.scrollTop;
        } else {
            _regenTargetScroll = 0;
        }
    }
    // Disable browser scroll-anchoring so DOM mutations don't silently adjust scrollTop
    if (_sc) _sc.style.overflowAnchor = 'none';
    // Disable chatUI auto-scroll during streaming
    if (tUI) tUI.disableAutoScroll = true;
    // Stash on tUI so the 'done' handler can restore after finishAnswer
    if (tUI) {
        tUI._regenScrollContainer = _sc;
        tUI._regenScrollLocked = true;
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Remove all subsequent entries below this one
    let nextEntry = entryElement.nextSibling;
    while (nextEntry) {
        const toRemove = nextEntry;
        nextEntry = nextEntry.nextSibling;
        toRemove.remove();
    }

    // 1. Structural Setup
    // versionsContainer already exists if we're here
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

    versionsContainer.appendChild(newVersion);

    // Hide others
    currentVersions.forEach(v => v.classList.remove('active'));

    versionsContainer.appendChild(newVersion);

    // 3. Update or Create Nav (always inside entryElement)
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

    // Always move nav to the end (after all versions) and hide during generation

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

    // Separators removed (Gemini-style layout uses margins)
    let separator = null;

    // 4.5. Track current entry
    if (tUI) {
        tUI.currentEntryDiv = entryElement;
    }

    if (_sc) {
        const container = document.querySelector('.lumina-chat-container') || document.body;
        const inputWrapper = document.querySelector('.lumina-chat-input-wrapper');
        const allE = Array.from(_sc.querySelectorAll('.lumina-dict-entry'));
        const idx = allE.indexOf(entryElement);

        if (LuminaChatUI.applyViewportMinHeight(entryElement, container, inputWrapper, idx)) {
            _sc.querySelectorAll('.lumina-dict-entry').forEach(e => {
                if (e !== entryElement) e.style.removeProperty('min-height');
            });
        }
        if (_regenTargetScroll !== null) {
            _sc.scrollTop = _regenTargetScroll;
        }
    }

    // 5. Show Loading inside the new version
    const loadingId = 'lumina-regen-loading-' + Date.now();
    const loadingDiv = document.createElement('div');
    loadingDiv.id = loadingId;
    loadingDiv.innerHTML = tUI ? tUI.getLoadingHTML() : '<div class="lumina-thinking-shimmer">Thinking</div>';

    if (isTranslationEntry) {
        // Wrap loading in translation-block structure for correct padding
        const wrapper = document.createElement('div');
        wrapper.className = 'lumina-translation-block';
        wrapper.appendChild(loadingDiv);
        newVersion.appendChild(wrapper);
    } else {
        newVersion.appendChild(loadingDiv);
    }

    // 6. Trigger Generation via port
    // Find matching tab for the target UI
    const targetTab = tabs.find(t => t.chatUIInstance === tUI);
    streamingTab = targetTab || tabs[activeTabIndex];

    if (!port) {
        setupPort();
    }

    if (tUI && port) {
        // Setup UI state for streaming to receiving container
        // If translation, we might need to find the answer div inside the new translation block later,
        // but ChatUI.appendChunk will create it if missing inside the .active version.
        tUI.currentAnswerDiv = null;
        tUI.loadingDiv = document.getElementById(loadingId);

        // Prepare message
        // Exclude the current regenerating entry (both Q and A) from history
        let history = tUI.gatherMessages();

        // Remove the last Q/A pair (the entry being regenerated)
        // The question we're regenerating for should not be in context
        if (history.length >= 2) {
            const lastMsg = history[history.length - 1];
            const secondLastMsg = history[history.length - 2];

            // Check if it's a Q/A pair matching our question
            if (secondLastMsg.role === 'user' && secondLastMsg.text === questionText) {
                // Remove both the answer and question
                history.pop(); // Remove answer
                history.pop(); // Remove question
            } else if (lastMsg.role === 'user' && lastMsg.text === questionText) {
                // Only question, no answer yet
                history.pop();
            }
        } else if (history.length === 1 && history[0].text === questionText) {
            history.pop();
        }

        const message = {
            action: 'chat_stream',
            messages: history,
            initialContext: '',
            question: questionText,
            isSpotlight: true,
            hasTranscriptForVideoId: tUI.getTranscriptVideoId ? tUI.getTranscriptVideoId() : null
        };

        try {
            port.postMessage(message);
            // Show stop button with abort callback
            tUI.showStopButton(() => {
                if (port) {
                    port.disconnect();
                    port = null;
                }
                const loadingEl = document.getElementById(loadingId);
                if (loadingEl) loadingEl.remove();
            });
        } catch (e) {
            setupPort();
            port.postMessage(message);
            // Show stop button with abort callback
            tUI.showStopButton(() => {
                if (port) {
                    port.disconnect();
                    port = null;
                }
                const loadingEl = document.getElementById(loadingId);
                if (loadingEl) loadingEl.remove();
            });
        }
    }
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

// Helper: Check if event matches a shortcut definition
function isShortcutMatch(event, shortcut) {
    if (!shortcut) return false;

    // Lone modifier key shortcut (e.g. ShiftRight alone)
    const isLoneModifierShortcut = ['Control', 'Alt', 'Shift', 'Meta'].includes(shortcut.key);

    if (isLoneModifierShortcut) {
        // Match: keyup event, key matches, and modifier was pressed alone (no combo)
        if (event.type !== 'keyup') return false;
        if (event.key !== shortcut.key) return false;
        // Only enforce side if the code is side-specific (ends with Left/Right).
        // Generic codes like 'Shift' (both-sides shortcut) match either side.
        const isSideSpecific = shortcut.code && (shortcut.code.endsWith('Left') || shortcut.code.endsWith('Right'));
        if (isSideSpecific && shortcut.code !== event.code) return false;
        // Must have been pressed alone (tracked by modifierKeyPressedAlone)
        return modifierKeyPressedAlone;
    }

    // Key or mouse match: check code/key or mouse button
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

    // Exact modifier match: allow Cmd as Ctrl when Ctrl is expected
    const wantsCtrl = !!shortcut.ctrlKey;
    const wantsMeta = !!shortcut.metaKey;

    const ctrlMatch = wantsCtrl
        ? (event.ctrlKey || (!wantsMeta && event.metaKey))
        : !event.ctrlKey;
    const shiftMatch = !!shortcut.shiftKey === event.shiftKey;
    const altMatch = !!shortcut.altKey === event.altKey;
    const metaMatch = wantsMeta ? event.metaKey : (!event.metaKey || wantsCtrl);

    // Reject extra modifiers for simple shortcuts
    if (!shortcut.ctrlKey && !shortcut.shiftKey && !shortcut.altKey && !shortcut.metaKey) {
        if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return false;
    }

    return ctrlMatch && shiftMatch && altMatch && metaMatch;
}

// Helper: Match named shortcut
function matchesShortcut(event, actionName, shortcuts) {
    const DEFAULT_SHORTCUTS = {
        regenerate: { code: 'KeyR', key: 'r' },
        translate: { code: 'KeyT', key: 't' },
        image: { code: 'KeyI', key: 'i' },
        audio: { code: 'ShiftLeft', key: 'Shift', shiftKey: true }
    };

    const shortcut = shortcuts?.[actionName] || DEFAULT_SHORTCUTS[actionName];
    return isShortcutMatch(event, shortcut);
}

// Audio Helper for Spotlight — delegates all fetch logic to unified fetchAudio in background.js
async function playSpotlightAudio(text) {
    if (!text) return;

    const normalizedText = text.trim();

    let speed = 1.0;
    try {
        const data = await chrome.storage.local.get(['audioSpeed']);
        speed = data.audioSpeed || 1.0;
    } catch (e) { }

    // 1. Check persistent cache first
    try {
        const cached = await chrome.runtime.sendMessage({ action: 'getAudioCache', text: normalizedText });
        if (cached && cached.success && cached.data) {
            const chunks = Array.isArray(cached.data) ? cached.data : [cached.data];
            for (const chunk of chunks) await playBase64Audio(chunk, speed);
            return;
        }
    } catch (e) { /* cache miss */ }

    // 2. Fetch via unified background logic (Oxford priority for 1-2 words, Google otherwise)
    try {
        const result = await chrome.runtime.sendMessage({ action: 'fetchAudio', text: normalizedText, speed });
        if (!result || !result.chunks || result.chunks.length === 0) return;

        for (const chunk of result.chunks) await playBase64Audio(chunk, speed);

        chrome.runtime.sendMessage({ action: 'setAudioCache', text: normalizedText, type: result.type, data: result.chunks }).catch(() => { });
    } catch (err) {
        console.error('[Spotlight] Play audio failed:', err);
    }
}

// Shared AudioContext for spotlight — used only for silence detection, not playback
let _spotlightAudioCtx = null;
function getSpotlightAudioCtx() {
    if (!_spotlightAudioCtx || _spotlightAudioCtx.state === 'closed') {
        _spotlightAudioCtx = new AudioContext();
    }
    return _spotlightAudioCtx;
}

// Track the currently playing Audio element so it can be stopped
let _spotlightCurrentAudio = null;
let _spotlightAudioAborted = false;

function stopSpotlightAudio() {
    _spotlightAudioAborted = true;
    if (_spotlightCurrentAudio) {
        _spotlightCurrentAudio.pause();
        _spotlightCurrentAudio = null;
    }
}

// Play base64 audio with leading-silence trimming.
// Detects silence via Web Audio API, plays via native HTML Audio (no distortion).
function playBase64Audio(base64Data, speed = 1.0) {
    return new Promise(async (resolve, reject) => {
        if (_spotlightAudioAborted) { resolve(); return; }
        try {
            const parts = base64Data.split(',');
            const byteString = atob(parts[1]);
            const byteArray = new Uint8Array(byteString.length);
            for (let i = 0; i < byteString.length; i++) byteArray[i] = byteString.charCodeAt(i);

            // Detect silence offset using Web Audio API (detection only, not playback)
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
            } catch (e) { /* detection failed, play from start */ }

            if (_spotlightAudioAborted) { resolve(); return; }

            // Play via native HTML Audio (preserves original quality)
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
            // Last-resort fallback
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

function attachQuestionListeners(element) {
    // Note: Event delegation is now used for both mousedown and keydown globally to handle dynamically loaded questions
}

// Global event delegation for submitting edited questions
document.addEventListener('keydown', (e) => {
    // Check if the target is an editable chat question
    const editable = e.target.closest('.lumina-chat-question div[contenteditable="true"]');
    if (editable && e.target === editable) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            const newText = editable.textContent.trim();
            if (newText) {
                editable.blur();
                const entry = editable.closest('.lumina-dict-entry');
                if (entry) {
                    handleRegenerate(entry, newText);
                }
            }
        }
    }
});

// Global event delegation for focusing questions
document.addEventListener('mousedown', (e) => {
    // Check if click was inside a question container
    const container = e.target.closest('.lumina-chat-question');
    if (container) {
        // If they didn't click directly on the text area
        if (!e.target.closest('div[contenteditable="true"]')) {
            const editable = container.querySelector('div[contenteditable="true"]');
            if (editable) {

                e.preventDefault();
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




/**
 * Ported Dictionary Launcher for Spotlight
 */
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
    // Port of the dictionary popup logic or message background to handle it
    // For now, we can use the existing chatUI if it supports it, 
    // but typically spotlight logic is different.
    // I'll implement a basic iframe popup for dictionary.

    // Check if there's an existing popup
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

// Add global listener for mousedown to hide both in Spotlight
window.addEventListener('mousedown', (e) => {
    // Clear any pending mouseup show commands to prevent race conditions
    if (window.mouseupTimer) {
        clearTimeout(window.mouseupTimer);
    }

    const path = e.composedPath();
    const isInsideAskBtn = spotlightAskBtn && path.some(el => el === spotlightAskBtn || el.id === 'lumina-ask-selection-btn');
    const isInsideAskInput = spotlightAskInputDiv && path.some(el => el === spotlightAskInputDiv || el.id === 'lumina-ask-input-popup');
    const isInsideDictLauncher = spotlightDictLauncherBtn && path.some(el => el === spotlightDictLauncherBtn || (el.classList && el.classList.contains && el.classList.contains('lumina-dict-launcher-part')));
    const isInsideDictPopup = document.getElementById('lumina-spotlight-dict-popup')?.contains(e.target) || 
                              path.some(el => (el.id === 'lumina-spotlight-dict-popup') || (el.classList && el.classList.contains && el.classList.contains('lumina-mode-dictionary')));

    if (!isInsideAskBtn && !isInsideAskInput) {
        hideSpotlightAskPopup();
    }
    
    if (!isInsideDictLauncher && !isInsideDictPopup) {
        document.getElementById('lumina-spotlight-dict-popup')?.remove();
    }
}, true);
