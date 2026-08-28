import { NexusSync } from '../core/auth/drive_sync.js';
import '../db/chat_db.js';
import '../db/notes_manager.js';
import '../db/highlight_db.js';
import '../db/attachment_db.js';
import '../core/audio/tts_manager.js';

export function initSyncHandlers() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'nexus_drive_sync') {
            const isAuto = !!request.isAuto;
            const forcePush = !!request.forcePush;
            const forcePull = !!request.forcePull;

            try {
                chrome.runtime.sendMessage({ action: 'nexus_sync_status', status: 'syncing' }).catch(() => { });
            } catch (e) { }

            const syncPromise = forcePush
                ? NexusSync.pushToCloud()
                : (forcePull || isAuto)
                    ? NexusSync.pullFromCloud(forcePull)
                    : NexusSync.syncData(isAuto);

            syncPromise
                .then(result => {
                    globalThis._lastDriveSyncAt = Date.now();
                    try {
                        chrome.runtime.sendMessage({ action: 'nexus_sync_status', status: 'done', timestamp: Date.now() }).catch(() => { });
                    } catch (e) { }
                    sendResponse({ success: true, result });
                })
                .catch(err => {
                    try {
                        chrome.runtime.sendMessage({ action: 'nexus_sync_status', status: 'failure' }).catch(() => { });
                    } catch (e) { }
                    sendResponse({ success: false, error: err.message });
                });

            return true;
        }

        if (request.action === 'nexus_drive_sync_debounced') {
            NexusSync.triggerDebouncedSync(request.delayMs || 1000);
            sendResponse({ success: true });
            return true;
        }

        if (request.action === 'nexus_clean_drive_duplicates') {
            NexusSync.cleanDriveDuplicates()
                .then(res => sendResponse(res))
                .catch(err => sendResponse({ success: false, error: err.message }));
            return true;
        }

        if (request.action === 'nexus_purge_legacy_cloud') {
            NexusSync.purgeLegacyLuminaCloudData()
                .then(res => sendResponse(res))
                .catch(err => sendResponse({ success: false, error: err.message }));
            return true;
        }
    });
}
