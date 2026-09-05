import { WEB_SOURCE_SELECTION_STORAGE_PREFIX, isWebPageUrl } from '../../../utils/constants.js';
import { NexusToken } from '../../../utils/token_utils.js';
import { ChatHistoryManager } from '../../../db/chat_history.js';

export const webSourceSelectionsByPageTabId = {};
export const currentBrowserTabTokens = new Map();

export function getWebSelectionScopeKey(nexusTabId, currentBrowserTab) {
    if (nexusTabId == null || !currentBrowserTab) return null;
    return `${String(nexusTabId)}_${String(currentBrowserTab.tabId)}`;
}

export function getWebSelectionStorageKey(key) {
    return `${WEB_SOURCE_SELECTION_STORAGE_PREFIX || 'nexus_web_selection_'}${String(key)}`;
}

export function readWebSelectionFromStorage(scopeKey) {
    try {
        const rawValue = localStorage.getItem(getWebSelectionStorageKey(scopeKey));
        if (!rawValue) return [];
        const parsedValue = JSON.parse(rawValue);
        return Array.isArray(parsedValue)
            ? parsedValue.filter((source) => source && (!isWebPageUrl || isWebPageUrl(source.url))).map((source) => ({
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

export function writeWebSelectionToStorage(scopeKey, selection) {
    const key = getWebSelectionStorageKey(scopeKey);
    const validSelection = (selection || []).filter((source) => source && (!isWebPageUrl || isWebPageUrl(source.url)));
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

export function deleteWebSelectionFromStorage(scopeKey) {
    const key = getWebSelectionStorageKey(scopeKey);
    localStorage.removeItem(key);
}

export function getWebSelectionForScope(nexusTabId, currentBrowserTab) {
    const scopeKey = getWebSelectionScopeKey(nexusTabId, currentBrowserTab);
    if (!scopeKey) return [];
    webSourceSelectionsByPageTabId[scopeKey] = readWebSelectionFromStorage(scopeKey);
    return webSourceSelectionsByPageTabId[scopeKey] || [];
}

export function saveWebSelectionForScope(nexusTabId, selection, currentBrowserTab) {
    const scopeKey = getWebSelectionScopeKey(nexusTabId, currentBrowserTab);
    if (!scopeKey) return;
    const normalizedSelection = (selection || []).filter((source) => source && (!isWebPageUrl || isWebPageUrl(source.url))).map((source) => ({
        tabId: source.tabId,
        title: source.title,
        url: source.url,
        tokens: source.tokens || 0
    }));
    webSourceSelectionsByPageTabId[scopeKey] = normalizedSelection;
    writeWebSelectionToStorage(scopeKey, normalizedSelection);
    if (normalizedSelection.length > 0) {
        refreshWebSourceTokens(nexusTabId, normalizedSelection, currentBrowserTab);
    }
}

export async function ensureContentScriptsInjected(tabId) {
    try {
        const checkResults = await chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: () => typeof window.nexusExtractMainContent === 'function'
        }).catch(() => null);
        const isAlreadyInjected = checkResults && checkResults[0] && checkResults[0].result === true;
        if (!isAlreadyInjected) {
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

export async function fetchFreshWebContent(tabId) {
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

export async function refreshWebSourceTokens(nexusTabId, selection, currentBrowserTab) {
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
    if (updated && nexusTabId) {
        const scopeKey = getWebSelectionScopeKey(nexusTabId, currentBrowserTab);
        if (scopeKey) {
            writeWebSelectionToStorage(scopeKey, selection);
        }
    }
}
