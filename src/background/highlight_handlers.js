import { LuminaAnnotationDB } from '../db/highlight_db.js';

export function initHighlightHandlers() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'load_highlights') {
            LuminaAnnotationDB.get(request.url).then(highlights => {
                sendResponse({ success: true, highlights: highlights || [] });
            }).catch(err => {
                console.error('[Lumina BG] load_highlights error:', err);
                sendResponse({ success: false, error: err.message });
            });
            return true;
        }

        if (request.action === 'save_highlight') {
            LuminaAnnotationDB.get(request.url).then(async (highlights) => {
                const list = highlights || [];
                list.push(request.highlight);
                await LuminaAnnotationDB.put(request.url, list);
                sendResponse({ success: true });
            }).catch(err => {
                console.error('[Lumina BG] save_highlight error:', err);
                sendResponse({ success: false, error: err.message });
            });
            return true;
        }

        if (request.action === 'undo_last_highlight') {
            LuminaAnnotationDB.get(request.url).then(async (highlights) => {
                const list = highlights || [];
                if (list.length === 0) {
                    sendResponse({ success: true, lastHighlight: null });
                    return;
                }
                const lastHighlight = list.pop();
                await LuminaAnnotationDB.put(request.url, list);
                sendResponse({ success: true, lastHighlight });
            }).catch(err => {
                console.error('[Lumina BG] undo_last_highlight error:', err);
                sendResponse({ success: false, error: err.message });
            });
            return true;
        }

        if (request.action === 'remove_highlights') {
            LuminaAnnotationDB.get(request.url).then(async (highlights) => {
                const list = highlights || [];
                const idsStr = request.ids.map(id => id.toString());
                const filtered = list.filter(h => !idsStr.includes(h[0].toString()));
                await LuminaAnnotationDB.put(request.url, filtered);
                sendResponse({ success: true });
            }).catch(err => {
                console.error('[Lumina BG] remove_highlights error:', err);
                sendResponse({ success: false, error: err.message });
            });
            return true;
        }

        if (request.action === 'update_highlight_color') {
            LuminaAnnotationDB.get(request.url).then(async (highlights) => {
                const list = highlights || [];
                const highlight = list.find(h => h[0].toString() === request.id.toString());
                if (highlight) {
                    highlight[1] = request.color;
                    await LuminaAnnotationDB.put(request.url, list);
                }
                sendResponse({ success: true });
            }).catch(err => {
                console.error('[Lumina BG] update_highlight_color error:', err);
                sendResponse({ success: false, error: err.message });
            });
            return true;
        }

        if (request.action === 'update_highlight_comment') {
            LuminaAnnotationDB.get(request.url).then(async (highlights) => {
                const list = highlights || [];
                const highlight = list.find(h => h[0].toString() === request.id.toString());
                if (highlight) {
                    highlight[8] = request.comment;
                    await LuminaAnnotationDB.put(request.url, list);
                }
                sendResponse({ success: true });
            }).catch(err => {
                console.error('[Lumina BG] update_highlight_comment error:', err);
                sendResponse({ success: false, error: err.message });
            });
            return true;
        }

        if ((request.action === 'lumina_session_updated' ||
            request.action === 'lumina_sessions_index_updated' ||
            request.action === 'lumina_sessions_deleted') && !request.isBroadcast) {
            request.isBroadcast = true;
            chrome.runtime.sendMessage(request).catch(() => { });
        }
    });
}
