export class NexusChatInput {
    static getHTML(options = {}) {
        const {
            idPrefix = '',
            placeholder = 'Ask anything...',
            modelLabel = 'Lite',
            showUpload = true,
            showModel = true,
            showMic = true,
            showWebChips = false,
            disabled = false
        } = options;

        const disabledAttr = disabled ? 'disabled="true"' : '';
        const disabledStyle = disabled ? 'cursor: not-allowed; opacity: 0.5;' : '';

        return `
            <div class="nexus-chat-input-wrapper" id="${idPrefix}input-wrapper">
                <div class="nexus-input-meta-container" id="${idPrefix}input-meta-container" style="${showWebChips ? 'display: flex;' : 'display: none;'}">
                    ${showWebChips ? `<div class="nexus-web-chips" id="${idPrefix}web-chips-group"></div>` : ''}
                    <div class="nexus-redirect-group" id="${idPrefix}redirect-chips-group"></div>
                </div>
                <div class="nexus-input-container">
                    <div class="nexus-file-preview-container nexus-image-preview-container" id="${idPrefix}file-preview"></div>
                    <div class="nexus-input-bar" id="${idPrefix}input-bar">
                        <div class="nexus-left-actions">
                            ${showUpload ? `
                                <button type="button" class="nexus-upload-btn" id="${idPrefix}upload-btn" title="Upload File" ${disabledAttr} style="${disabledStyle}">
                                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                                        <line x1="12" y1="5" x2="12" y2="19"></line>
                                        <line x1="5" y1="12" x2="19" y2="12"></line>
                                    </svg>
                                </button>
                            ` : ''}
                            ${showModel ? `
                                <div class="nexus-model-selector" id="${idPrefix}model-selector">
                                    <button type="button" class="nexus-model-btn" id="${idPrefix}model-btn" ${disabledAttr} style="${disabledStyle}">
                                        <span class="nexus-current-model" id="${idPrefix}model-label">${modelLabel}</span>
                                        <svg class="nexus-chevron" viewBox="0 0 24 24" width="14" height="14" fill="none" style="opacity: 0.85;">
                                            <path d="M18 15l-6-6-6 6" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"></path>
                                        </svg>
                                    </button>
                                </div>
                            ` : ''}
                        </div>
                        <textarea id="${idPrefix}chat-input" class="nexus-chat-input" placeholder="${placeholder}" rows="1" ${disabledAttr}></textarea>
                        <div class="nexus-trailing-group">
                            ${showMic ? `
                                <button type="button" class="nexus-mic-btn" id="${idPrefix}mic-btn" title="Voice Input" ${disabledAttr} style="${disabledStyle}">
                                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                        <rect x="9" y="4" width="6" height="10" rx="3"></rect>
                                        <path d="M5 12a7 7 0 0 0 14 0"></path>
                                        <line x1="12" y1="19" x2="12" y2="22"></line>
                                    </svg>
                                </button>
                            ` : ''}
                            <button type="button" class="nexus-action-btn send" id="${idPrefix}action-btn" title="Send" disabled="true">
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                                    <line x1="12" y1="19" x2="12" y2="5"></line>
                                    <polyline points="5 12 12 5 19 12"></polyline>
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
                <div class="nexus-hover-trigger"></div>
            </div>
        `;
    }

    static bindAutoGrow(textareaEl) {
        if (!textareaEl) return;
        textareaEl.style.removeProperty('height');
    }
}
