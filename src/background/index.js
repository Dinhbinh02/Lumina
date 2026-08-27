import { initStorageCleanup } from './storage_cleanup.js';
import { initSidePanelManager, toggleSidePanel, ensureSidePanelOpen, broadcastToSession } from './sidepanel_manager.js';
import { detectMediaType, processAttachments, processAttachmentsForGemini, readOpfsFileAsBase64 } from './media_processor.js';
import { fetchAudio, stopGoogleAudioOffscreen, getLemma, getAmericanSpelling } from './audio_fetcher.js';
import { initHighlightHandlers } from './highlight_handlers.js';

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
    initHighlightHandlers
};

initStorageCleanup();
initSidePanelManager();
initHighlightHandlers();
