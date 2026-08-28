export const MESSAGE_TYPES = {
    OPEN_NEXUS: 'OPEN_NEXUS',
    TOGGLE_SIDE_PANEL: 'TOGGLE_SIDE_PANEL',
    GET_AUTH_TOKEN: 'GET_AUTH_TOKEN',
    FETCH_URL: 'FETCH_URL',
    TTS_PLAY: 'TTS_PLAY',
    TTS_STOP: 'TTS_STOP',
    EXTRACT_PAGE_CONTENT: 'EXTRACT_PAGE_CONTENT',
    GET_SELECTION: 'GET_SELECTION',
    ADD_ANNOTATION: 'ADD_ANNOTATION',
    OFFSCREEN_START_AUDIO: 'OFFSCREEN_START_AUDIO',
    OFFSCREEN_STOP_AUDIO: 'OFFSCREEN_STOP_AUDIO'
};

export async function sendRuntimeMessage(type, payload = {}) {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
        return { success: false, error: 'chrome.runtime is not available' };
    }
    return new Promise((resolve) => {
        try {
            chrome.runtime.sendMessage({ type, payload, timestamp: Date.now() }, (response) => {
                if (chrome.runtime.lastError) {
                    resolve({ success: false, error: chrome.runtime.lastError.message });
                } else {
                    resolve({ success: true, data: response });
                }
            });
        } catch (err) {
            resolve({ success: false, error: err.message });
        }
    });
}

export async function sendTabMessage(tabId, type, payload = {}) {
    if (typeof chrome === 'undefined' || !chrome.tabs || !chrome.tabs.sendMessage) {
        return { success: false, error: 'chrome.tabs is not available' };
    }
    return new Promise((resolve) => {
        try {
            chrome.tabs.sendMessage(tabId, { type, payload, timestamp: Date.now() }, (response) => {
                if (chrome.runtime.lastError) {
                    resolve({ success: false, error: chrome.runtime.lastError.message });
                } else {
                    resolve({ success: true, data: response });
                }
            });
        } catch (err) {
            resolve({ success: false, error: err.message });
        }
    });
}

export function registerMessageListener(handlers) {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.onMessage) {
        return () => {};
    }
    const listener = (message, sender, sendResponse) => {
        if (!message || !message.type) return;
        const handler = handlers[message.type];
        if (typeof handler === 'function') {
            const result = handler(message.payload, sender);
            if (result instanceof Promise) {
                result.then(sendResponse).catch((err) => sendResponse({ error: err.message }));
                return true;
            }
            sendResponse(result);
        }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
}
