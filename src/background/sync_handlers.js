import { LuminaSync } from '../core/auth/drive_sync.js';

export function initSyncHandlers() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'lumina_drive_sync') {
            const isAuto = !!request.isAuto;
            const forcePush = !!request.forcePush;
            const forcePull = !!request.forcePull;

            try {
                chrome.runtime.sendMessage({ action: 'lumina_sync_status', status: 'syncing' }).catch(() => { });
            } catch (e) { }

            const syncPromise = forcePush
                ? LuminaSync.pushToCloud()
                : (forcePull || isAuto)
                    ? LuminaSync.pullFromCloud(forcePull)
                    : LuminaSync.syncData(isAuto);

            syncPromise
                .then(result => {
                    globalThis._lastDriveSyncAt = Date.now();
                    try {
                        chrome.runtime.sendMessage({ action: 'lumina_sync_status', status: 'done', timestamp: Date.now() }).catch(() => { });
                    } catch (e) { }
                    sendResponse({ success: true, result });
                })
                .catch(err => {
                    try {
                        chrome.runtime.sendMessage({ action: 'lumina_sync_status', status: 'failure' }).catch(() => { });
                    } catch (e) { }
                    sendResponse({ success: false, error: err.message });
                });

            return true;
        }

        if (request.action === 'lumina_drive_sync_debounced') {
            LuminaSync.triggerDebouncedSync(request.delayMs || 1000);
            sendResponse({ success: true });
            return true;
        }

        if (request.action === 'lumina_clean_drive_duplicates') {
            LuminaSync.cleanDriveDuplicates()
                .then(res => sendResponse(res))
                .catch(err => sendResponse({ success: false, error: err.message }));
            return true;
        }
    });
}
