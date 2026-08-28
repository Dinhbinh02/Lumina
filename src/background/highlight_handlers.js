import { NexusAnnotationDB } from '../db/highlight_db.js';

export function initHighlightHandlers() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'load_highlights') {
            NexusAnnotationDB.get(request.url).then(highlights => {
                sendResponse({ success: true, highlights: highlights || [] });
            }).catch(err => {
                console.error('[Nexus BG] load_highlights error:', err);
                sendResponse({ success: false, error: err.message });
            });
            return true;
        }

        if (request.action === 'save_highlight') {
            NexusAnnotationDB.get(request.url).then(async (highlights) => {
                const list = highlights || [];
                list.push(request.highlight);
                await NexusAnnotationDB.put(request.url, list);
                sendResponse({ success: true });
            }).catch(err => {
                console.error('[Nexus BG] save_highlight error:', err);
                sendResponse({ success: false, error: err.message });
            });
            return true;
        }

        if (request.action === 'undo_last_highlight') {
            NexusAnnotationDB.get(request.url).then(async (highlights) => {
                const list = highlights || [];
                if (list.length === 0) {
                    sendResponse({ success: true, lastHighlight: null });
                    return;
                }
                const lastHighlight = list.pop();
                await NexusAnnotationDB.put(request.url, list);
                sendResponse({ success: true, lastHighlight });
            }).catch(err => {
                console.error('[Nexus BG] undo_last_highlight error:', err);
                sendResponse({ success: false, error: err.message });
            });
            return true;
        }

        if (request.action === 'remove_highlights') {
            NexusAnnotationDB.get(request.url).then(async (highlights) => {
                const list = highlights || [];
                const idsStr = request.ids.map(id => id.toString());
                const filtered = list.filter(h => !idsStr.includes(h[0].toString()));
                await NexusAnnotationDB.put(request.url, filtered);
                sendResponse({ success: true });
            }).catch(err => {
                console.error('[Nexus BG] remove_highlights error:', err);
                sendResponse({ success: false, error: err.message });
            });
            return true;
        }

        if (request.action === 'update_highlight_color') {
            NexusAnnotationDB.get(request.url).then(async (highlights) => {
                const list = highlights || [];
                const highlight = list.find(h => h[0].toString() === request.id.toString());
                if (highlight) {
                    highlight[1] = request.color;
                    await NexusAnnotationDB.put(request.url, list);
                }
                sendResponse({ success: true });
            }).catch(err => {
                console.error('[Nexus BG] update_highlight_color error:', err);
                sendResponse({ success: false, error: err.message });
            });
            return true;
        }

        if (request.action === 'update_highlight_comment') {
            NexusAnnotationDB.get(request.url).then(async (highlights) => {
                const list = highlights || [];
                const highlight = list.find(h => h[0].toString() === request.id.toString());
                if (highlight) {
                    highlight[8] = request.comment;
                    await NexusAnnotationDB.put(request.url, list);
                }
                sendResponse({ success: true });
            }).catch(err => {
                console.error('[Nexus BG] update_highlight_comment error:', err);
                sendResponse({ success: false, error: err.message });
            });
            return true;
        }

        if ((request.action === 'nexus_session_updated' ||
            request.action === 'nexus_sessions_index_updated' ||
            request.action === 'nexus_sessions_deleted') && !request.isBroadcast) {
            request.isBroadcast = true;
            chrome.runtime.sendMessage(request).catch(() => { });
        }
    });
}
