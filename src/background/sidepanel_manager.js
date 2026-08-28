export const sidePanelPorts = new Map();
export let sessionOpenWindows = new Set();
export const sessionPorts = new Map();
export const sessionControllers = new Map();
export const activeUploads = new Map();

export function broadcastToSession(sessionId, message) {
    if (!sessionId) return;
    const ports = sessionPorts.get(sessionId);
    if (!ports) return;
    for (const port of ports) {
        try {
            port.postMessage(message);
        } catch (e) {
            console.warn('[Nexus BG] Failed to broadcast to session port:', e);
            ports.delete(port);
        }
    }
}

export function updateOpenSidePanelsSession() {
    chrome.storage.session.set({ open_sidepanel_windows: Array.from(sessionOpenWindows) }).catch(() => { });
}

export function toggleSidePanel(windowId) {
    if (!windowId) return;
    const isCurrentlyOpen = sidePanelPorts.has(windowId) || sessionOpenWindows.has(windowId);
    if (isCurrentlyOpen) {
        sessionOpenWindows.delete(windowId);
        sidePanelPorts.delete(windowId);
        updateOpenSidePanelsSession();
        if (chrome.sidePanel.close) {
            chrome.sidePanel.close({ windowId }).catch(() => { });
        } else {
            chrome.sidePanel.setOptions({ windowId, enabled: false }, () => {
                chrome.sidePanel.setOptions({
                    windowId,
                    enabled: true,
                    path: 'pages/nexus/nexus.html?sidepanel=1'
                });
            });
        }
    } else {
        sessionOpenWindows.add(windowId);
        sidePanelPorts.set(windowId, null);
        updateOpenSidePanelsSession();
        chrome.sidePanel.open({ windowId }).catch(() => {
            sessionOpenWindows.delete(windowId);
            sidePanelPorts.delete(windowId);
            updateOpenSidePanelsSession();
        });
    }
}

export async function ensureSidePanelOpen(windowId) {
    if (!windowId) return;
    const isCurrentlyOpen = sidePanelPorts.has(windowId) || sessionOpenWindows.has(windowId);
    if (!isCurrentlyOpen) {
        sessionOpenWindows.add(windowId);
        sidePanelPorts.set(windowId, null);
        updateOpenSidePanelsSession();
        chrome.sidePanel.open({ windowId }).catch(() => {
            sessionOpenWindows.delete(windowId);
            sidePanelPorts.delete(windowId);
            updateOpenSidePanelsSession();
        });
    }
}

export function updateDisplayMode(mode) {
    if (!chrome.sidePanel) return;
    chrome.sidePanel.setOptions({
        path: 'pages/nexus/nexus.html?sidepanel=1',
        enabled: true
    });
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(console.error);
    chrome.action.setPopup({ popup: 'pages/popup/popup.html' });
}

export function initSidePanelManager() {
    chrome.storage.session.get(['open_sidepanel_windows'], (result) => {
        if (result.open_sidepanel_windows) {
            sessionOpenWindows = new Set(result.open_sidepanel_windows);
            sessionOpenWindows.forEach(wid => {
                if (!sidePanelPorts.has(wid)) sidePanelPorts.set(wid, null);
            });
        }
    });

    chrome.runtime.onConnect.addListener((port) => {
        if (port.name === 'nexus-sidepanel') {
            let connectedWindowId = null;
            port.onMessage.addListener((msg) => {
                if (msg.action === 'closing' && msg.windowId) {
                    sessionOpenWindows.delete(msg.windowId);
                    sidePanelPorts.delete(msg.windowId);
                    updateOpenSidePanelsSession();
                } else if (msg.windowId) {
                    connectedWindowId = msg.windowId;
                    sidePanelPorts.set(connectedWindowId, port);
                    sessionOpenWindows.add(connectedWindowId);
                    updateOpenSidePanelsSession();
                }
            });
            port.onDisconnect.addListener(() => {
                if (connectedWindowId) {
                    sidePanelPorts.delete(connectedWindowId);
                }
            });
        }
    });

    chrome.windows.onRemoved.addListener((windowId) => {
        if (sessionOpenWindows.has(windowId)) {
            sessionOpenWindows.delete(windowId);
            sidePanelPorts.delete(windowId);
            updateOpenSidePanelsSession();
        }
    });

    if (chrome.sidePanel && chrome.sidePanel.onClosed) {
        chrome.sidePanel.onClosed.addListener((closeInfo) => {
            if (closeInfo && closeInfo.windowId) {
                sessionOpenWindows.delete(closeInfo.windowId);
                sidePanelPorts.delete(closeInfo.windowId);
                updateOpenSidePanelsSession();
            }
        });
    }

    chrome.tabs.onRemoved.addListener((tabId) => {
        chrome.storage.local.get(['nexus_tab_sessions'], result => {
            const tabSessions = result.nexus_tab_sessions || {};
            if (tabSessions[tabId]) {
                delete tabSessions[tabId];
                chrome.storage.local.set({ nexus_tab_sessions: tabSessions });
            }
        });
    });

    chrome.storage.local.get(['displayMode'], (result) => {
        updateDisplayMode(result.displayMode || 'popup');
    });

    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && changes.displayMode) {
            updateDisplayMode(changes.displayMode.newValue || 'popup');
        }
    });

    if (chrome.commands && chrome.commands.onCommand) {
        chrome.commands.onCommand.addListener((command, tab) => {
            if (command === 'toggle-side-panel' || command === 'open-nexus-chat') {
                if (tab && tab.windowId) {
                    toggleSidePanel(tab.windowId);
                } else {
                    chrome.windows.getCurrent({ populate: false }, (currentWindow) => {
                        if (currentWindow && currentWindow.id) {
                            toggleSidePanel(currentWindow.id);
                        }
                    });
                }
            } else if (command === 'new-chat') {
                chrome.runtime.sendMessage({ action: 'new_chat' }).catch(() => { });
                if (tab && tab.windowId) {
                    ensureSidePanelOpen(tab.windowId);
                } else {
                    chrome.windows.getCurrent({ populate: false }, (currentWindow) => {
                        if (currentWindow && currentWindow.id) {
                            ensureSidePanelOpen(currentWindow.id);
                        }
                    });
                }
            }
        });
    }

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (!request || !request.action) return false;
        if (request.action === 'open_sidepanel' || request.action === 'toggle_sidepanel') {
            const windowId = sender.tab ? sender.tab.windowId : (request.windowId || null);
            if (windowId) {
                if (request.action === 'open_sidepanel') {
                    ensureSidePanelOpen(windowId);
                } else {
                    toggleSidePanel(windowId);
                }
                sendResponse({ success: true });
            } else {
                chrome.windows.getCurrent({ populate: false }, (currentWindow) => {
                    if (currentWindow && currentWindow.id) {
                        if (request.action === 'open_sidepanel') {
                            ensureSidePanelOpen(currentWindow.id);
                        } else {
                            toggleSidePanel(currentWindow.id);
                        }
                        sendResponse({ success: true });
                    }
                });
            }
            return true;
        }

        if (request.action === 'open_sidepanel_with_query') {
            const windowIdQuery = sender.tab ? sender.tab.windowId : (request.windowId || null);
            if (windowIdQuery) {
                const queryId = Date.now() + '-' + Math.random().toString(36).substring(2, 9);
                const isInternal = sender.tab && sender.tab.url && sender.tab.url.includes('/pages/nexus/nexus.html');
                const sourceTab = (sender.tab && !isInternal) ? {
                    tabId: sender.tab.id,
                    title: sender.tab.title,
                    url: sender.tab.url
                } : null;
                const isCurrentlyOpen = sidePanelPorts.has(windowIdQuery);
                const queryData = {
                    query: request.query,
                    displayQuery: request.displayQuery,
                    queryId,
                    mode: request.mode,
                    sourceTab: sourceTab,
                    isInternal: isInternal,
                    createNewChat: !isCurrentlyOpen,
                    timestamp: Date.now()
                };
                chrome.storage.local.set({ [`pending_sidepanel_query_${windowIdQuery}`]: queryData }, () => {
                    ensureSidePanelOpen(windowIdQuery);
                    if (sidePanelPorts.has(windowIdQuery)) {
                        chrome.runtime.sendMessage({ action: 'ask_sidepanel', windowId: windowIdQuery, ...queryData }).catch(() => { });
                    }
                });
            }
            sendResponse({ success: true });
            return true;
        }
    });
}
