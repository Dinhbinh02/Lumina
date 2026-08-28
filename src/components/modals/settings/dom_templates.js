export const SETTINGS_TEMPLATES = {
  'nexus-providerItemTemplate': `
    <div class="nexus-settings-provider-card provider-item">
        <div class="provider-item-content">
            <div class="provider-logo-container"></div>
            <div class="provider-info">
                <span class="provider-title provider-item-name"></span>
                <span class="provider-badge"></span>
            </div>
        </div>
    </div>
  `,
  'nexus-chainItemTemplate': `
    <div class="nexus-settings-chain-card chain-item" draggable="true">
        <span class="chain-number"></span>
        <div class="chain-details">
            <span class="chain-title"></span>
            <span class="chain-subtitle"></span>
        </div>
        <div class="chain-actions">
            <button type="button" class="nexus-settings-icon-btn edit" title="Edit Model">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 20h9"></path>
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                </svg>
            </button>
            <button type="button" class="nexus-settings-icon-btn remove" title="Remove">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        </div>
    </div>
  `,
  'nexus-mappingRowTemplate': `
    <div class="nexus-settings-chain-card chain-item">
        <span class="chain-number mapping-number"></span>
        <div class="chain-details">
            <span class="chain-title mapping-name"></span>
        </div>
        <div class="chain-actions">
            <button type="button" class="nexus-settings-icon-btn edit mapping-edit-btn" title="Edit Mapping">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 20h9"></path>
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                </svg>
            </button>
            <button type="button" class="nexus-settings-icon-btn remove mapping-delete-btn" title="Delete Mapping">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        </div>
    </div>
  `,
  'nexus-userFactItemTemplate': `
    <div class="nexus-settings-chain-card chain-item">
        <span class="chain-number fact-index"></span>
        <div class="chain-details">
            <span class="chain-title fact-text"></span>
        </div>
        <div class="chain-actions">
            <button type="button" class="nexus-settings-icon-btn edit fact-edit-btn" title="Edit Instruction">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 20h9"></path>
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                </svg>
            </button>
            <button type="button" class="nexus-settings-icon-btn remove fact-delete-btn" title="Delete Instruction">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        </div>
    </div>
  `,
  'nexus-annotationRowTemplate': `
    <div class="nexus-settings-chain-card chain-item">
        <span class="chain-number annotation-number"></span>
        <div class="chain-details annotation-details">
            <div class="annotation-color-preview"></div>
            <span class="chain-title annotation-shortcut-text font-medium"></span>
        </div>
        <div class="chain-actions">
            <button type="button" class="nexus-settings-icon-btn edit annotation-edit-btn" title="Edit Highlight">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 20h9"></path>
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                </svg>
            </button>
            <button type="button" class="nexus-settings-icon-btn remove annotation-delete-btn" title="Delete Highlight">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        </div>
    </div>
  `
};

export function injectSettingsTemplates() {
  Object.entries(SETTINGS_TEMPLATES).forEach(([id, html]) => {
    if (!document.getElementById(id)) {
      const t = document.createElement('template');
      t.id = id;
      t.innerHTML = html.trim();
      document.body.appendChild(t);
    }
  });
}
