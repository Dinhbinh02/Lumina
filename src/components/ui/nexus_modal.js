/**
 * NexusModal - Global Unified Modal & Confirmation Dialog System
 * Standardized popup/dialog matching Nexus design tokens.
 * Features:
 * - confirm({ title, description, body, files, confirmLabel, cancelLabel, isDanger, confirmIcon })
 * - prompt({ title, defaultValue, placeholder, confirmLabel, isDanger })
 * - showCustomPopup({ ... }) for backwards compatibility
 * - Global availability via ES Module and window.NexusModal / window.showCustomPopup
 */

export class NexusModal {
    /**
     * Show a confirmation modal
     * @param {Object} options
     * @param {string} options.title
     * @param {string} [options.description]
     * @param {string} [options.body]
     * @param {Array<{name: string, additions?: number, deletions?: number}>} [options.files]
     * @param {string} [options.confirmLabel='Confirm']
     * @param {string} [options.cancelLabel='Cancel']
     * @param {boolean} [options.isDanger=false]
     * @param {string} [options.confirmIcon]
     * @returns {Promise<boolean>}
     */
    static confirm({
        title = 'Confirmation',
        description = '',
        body = '',
        files = null,
        confirmLabel = 'Confirm',
        cancelLabel = 'Cancel',
        isDanger = false,
        confirmIcon = ''
    } = {}) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'nexus-modal-overlay';

            let filesHtml = '';
            if (Array.isArray(files) && files.length > 0) {
                const fileItems = files.map(f => {
                    let iconClass = 'html';
                    let iconText = '&lt;/&gt;';
                    if (f.name && f.name.endsWith('.js')) {
                        iconClass = 'js';
                        iconText = 'JS';
                    } else if (f.name && f.name.endsWith('.css')) {
                        iconClass = 'css';
                        iconText = '{ }';
                    }
                    return `
                        <div class="nexus-modal-diff-item">
                            <span class="nexus-modal-file-icon ${iconClass}">${iconText}</span>
                            <span class="nexus-modal-filename">${NexusModal.escapeHtml(f.name)}</span>
                            <div class="nexus-modal-diff-stats">
                                <span class="nexus-modal-stat-add">+${f.additions || 0}</span>
                                <span class="nexus-modal-stat-del">-${f.deletions || 0}</span>
                            </div>
                        </div>
                    `;
                }).join('');
                filesHtml = `<div class="nexus-modal-diff-list">${fileItems}</div>`;
            }

            const primaryBtnClass = isDanger ? 'nexus-modal-btn-danger' : 'nexus-modal-btn-primary';
            const descHtml = description ? `<p class="nexus-modal-desc">${description}</p>` : '';
            const bodyHtml = body ? `<div class="nexus-modal-body">${body}</div>` : '';

            overlay.innerHTML = `
                <div class="nexus-modal-box">
                    <div class="nexus-modal-header">
                        <h3 class="nexus-modal-title">${NexusModal.escapeHtml(title)}</h3>
                        <button type="button" class="nexus-modal-close-btn" title="Close" aria-label="Close">
                            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    </div>
                    ${descHtml}
                    ${bodyHtml}
                    ${filesHtml}
                    <div class="nexus-modal-actions">
                        <button type="button" class="nexus-modal-btn btn-cancel">${NexusModal.escapeHtml(cancelLabel)}</button>
                        <button type="button" class="nexus-modal-btn ${primaryBtnClass} btn-confirm">
                            <span>${NexusModal.escapeHtml(confirmLabel)}</span>
                            ${confirmIcon ? confirmIcon : ''}
                        </button>
                    </div>
                </div>
            `;

            document.body.appendChild(overlay);
            requestAnimationFrame(() => overlay.classList.add('active'));

            const confirmBtn = overlay.querySelector('.btn-confirm');
            const cancelBtn = overlay.querySelector('.btn-cancel');
            const closeBtn = overlay.querySelector('.nexus-modal-close-btn');

            if (confirmBtn) confirmBtn.focus();

            const closePopup = (confirmed) => {
                overlay.classList.remove('active');
                overlay.style.pointerEvents = 'none';
                document.removeEventListener('keydown', keydownHandler);
                setTimeout(() => overlay.remove(), 200);
                resolve(confirmed);
            };

            const keydownHandler = (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    closePopup(true);
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    closePopup(false);
                }
            };

            document.addEventListener('keydown', keydownHandler);
            confirmBtn?.addEventListener('click', () => closePopup(true));
            cancelBtn?.addEventListener('click', () => closePopup(false));
            closeBtn?.addEventListener('click', () => closePopup(false));
            overlay.addEventListener('mousedown', (e) => {
                if (e.target === overlay) closePopup(false);
            });
        });
    }

    /**
     * Show a custom text input prompt modal
     */
    static prompt({
        title = 'Enter Value',
        defaultValue = '',
        placeholder = '',
        confirmLabel = 'Save',
        cancelLabel = 'Cancel',
        isDanger = false
    } = {}) {
        return NexusModal.showCustomPopup({
            title,
            isInput: true,
            defaultValue,
            placeholder,
            confirmLabel,
            cancelLabel,
            isDanger
        });
    }

    /**
     * Universal custom popup compatible with existing window.showCustomPopup API
     */
    static showCustomPopup({
        title = '',
        body = '',
        isInput = false,
        defaultValue = '',
        placeholder = '',
        confirmLabel = 'Confirm',
        cancelLabel = 'Cancel',
        isDanger = false
    } = {}) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'nexus-modal-overlay';
            let inputHtml = '';
            if (isInput) {
                inputHtml = `<input type="text" class="nexus-modal-input" placeholder="${NexusModal.escapeHtml(placeholder)}" value="${NexusModal.escapeHtml(defaultValue)}">`;
            }
            const primaryBtnClass = isDanger ? 'nexus-modal-btn-danger' : 'nexus-modal-btn-primary';
            const bodyHtml = body ? `<div class="nexus-modal-body">${body}</div>` : '';
            overlay.innerHTML = `
                <div class="nexus-modal-box">
                    <div class="nexus-modal-header">
                        <h3 class="nexus-modal-title">${NexusModal.escapeHtml(title)}</h3>
                        <button type="button" class="nexus-modal-close-btn" title="Close" aria-label="Close">
                            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    </div>
                    ${bodyHtml}
                    ${inputHtml}
                    <div class="nexus-modal-actions">
                        <button type="button" class="nexus-modal-btn btn-cancel">${NexusModal.escapeHtml(cancelLabel)}</button>
                        <button type="button" class="nexus-modal-btn ${primaryBtnClass} btn-confirm">${NexusModal.escapeHtml(confirmLabel)}</button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);
            requestAnimationFrame(() => overlay.classList.add('active'));

            const inputEl = overlay.querySelector('.nexus-modal-input');
            const confirmBtn = overlay.querySelector('.btn-confirm');
            const cancelBtn = overlay.querySelector('.btn-cancel');
            const closeBtn = overlay.querySelector('.nexus-modal-close-btn');

            if (inputEl) {
                inputEl.focus();
                inputEl.select();
                inputEl.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        confirm();
                    } else if (e.key === 'Escape') {
                        cancel();
                    }
                });
            } else {
                confirmBtn?.focus();
            }

            const closePopup = () => {
                overlay.classList.remove('active');
                overlay.style.pointerEvents = 'none';
                setTimeout(() => overlay.remove(), 200);
            };

            const confirm = () => {
                const value = inputEl ? inputEl.value : true;
                closePopup();
                resolve(value);
            };

            const cancel = () => {
                closePopup();
                resolve(null);
            };

            confirmBtn?.addEventListener('click', confirm);
            cancelBtn?.addEventListener('click', cancel);
            closeBtn?.addEventListener('click', cancel);
            overlay.addEventListener('mousedown', (e) => {
                if (e.target === overlay) cancel();
            });
        });
    }

    static escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
}

if (typeof window !== 'undefined') {
    window.NexusModal = NexusModal;
    window.showCustomPopup = NexusModal.showCustomPopup;
}
