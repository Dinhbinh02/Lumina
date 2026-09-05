import { NexusImageCacheDB, NexusAudioCacheDB } from '../db/attachment_db.js';
import { initSidePanelManager, toggleSidePanel, ensureSidePanelOpen } from './sidepanel_service.js';
import { detectMediaType, processAttachments, processAttachmentsForGemini, readOpfsFileAsBase64 } from './attachment_processor.js';
import { fetchAudio, stopGoogleAudioOffscreen, getLemma, getAmericanSpelling, initAudioHandlers } from './tts_service.js';
import { initSyncHandlers } from './sync_service.js';
import { initChatStreamService, broadcastToSession } from './chat_service.js';

export {
    initSidePanelManager,
    toggleSidePanel,
    ensureSidePanelOpen,
    broadcastToSession,
    detectMediaType,
    processAttachments,
    processAttachmentsForGemini,
    readOpfsFileAsBase64,
    fetchAudio,
    stopGoogleAudioOffscreen,
    getLemma,
    getAmericanSpelling,
    initSyncHandlers,
    initChatStreamService,
    initAudioHandlers
};

initSidePanelManager();
initSyncHandlers();
initChatStreamService();
initAudioHandlers();

// Cache cleanup for expired attachments & audio
NexusImageCacheDB.cleanupExpired().catch(() => {});
NexusAudioCacheDB.cleanupExpired().catch(() => {});

