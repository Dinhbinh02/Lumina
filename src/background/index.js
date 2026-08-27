import { initStorageCleanup } from './storage_cleanup.js';
import { initSidePanelManager, toggleSidePanel, ensureSidePanelOpen } from './sidepanel_manager.js';
import { detectMediaType, processAttachments, processAttachmentsForGemini, readOpfsFileAsBase64 } from './media_processor.js';
import { fetchAudio, stopGoogleAudioOffscreen, getLemma, getAmericanSpelling, initAudioHandlers } from './audio_fetcher.js';
import { initHighlightHandlers } from './highlight_handlers.js';
import { initSyncHandlers } from './sync_handlers.js';
import { initChatStreamService, broadcastToSession } from './chat_stream_service.js';

export {
    initStorageCleanup,
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
    initHighlightHandlers,
    initSyncHandlers,
    initChatStreamService,
    initAudioHandlers
};

initStorageCleanup();
initSidePanelManager();
initHighlightHandlers();
initSyncHandlers();
initChatStreamService();
initAudioHandlers();
