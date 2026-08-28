export function initStorageCleanup() {
    chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' }).catch(() => { });

    chrome.storage.local.get(null, (allData) => {
        if (chrome.runtime.lastError) return;
        const ankiLegacyKeys = new Set([
            'nexusTemplatesV3', 'nexusBatchHistoryV3', 'lastUsedGenAIModel',
            'lastUsedBatchSize', 'lastUsedDeck', 'lastUsedTemplateId', 'ankiQuickNoteContent', 'attachments'
        ]);
        const keysToRemove = Object.keys(allData).filter(key => 
            key.includes('_inst_') || 
            key.startsWith('highlights_') || 
            key.startsWith('rot_') || 
            ankiLegacyKeys.has(key)
        );
        if (keysToRemove.length > 0) {
            chrome.storage.local.remove(keysToRemove, () => {});
        }
    });

    if (typeof NexusImageCacheDB !== 'undefined' && NexusImageCacheDB.cleanupExpired) {
        NexusImageCacheDB.cleanupExpired().catch(err => console.error('[Nexus BG] Failed to clean up IndexedDB image cache:', err));
    }
    if (typeof NexusAudioCacheDB !== 'undefined' && NexusAudioCacheDB.cleanupExpired) {
        NexusAudioCacheDB.cleanupExpired().catch(err => console.error('[Nexus BG] Failed to clean up IndexedDB audio cache:', err));
    }
}
