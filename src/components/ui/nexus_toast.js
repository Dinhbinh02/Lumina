/**
 * Nexus Toast Notification System
 * Sleek, compact toast notifications with support for success, error, info, and warning.
 * Features:
 * - Stacked top-right or bottom-right positioning
 * - Auto-dismiss timer with pause on hover
 * - Close button and micro-animation
 * - Global accessibility: window.NexusToast and ESModule export
 */

export class NexusToast {
    static _container = null;
    static _toasts = new Set();

    static _getContainer() {
        if (!NexusToast._container || !document.body.contains(NexusToast._container)) {
            NexusToast._container = document.createElement('div');
            NexusToast._container.className = 'nexus-toast-container';
            document.body.appendChild(NexusToast._container);
        }
        return NexusToast._container;
    }

    /**
     * Show a toast message
     * @param {string} message - Text or message to display
     * @param {'success'|'error'|'info'|'warning'} [type='info']
     * @param {number} [duration=3500] - Duration in ms
     * @returns {HTMLElement}
     */
    static show(message, type = 'info', duration = 3500) {
        if (!message) return null;

        const container = NexusToast._getContainer();
        const toastEl = document.createElement('div');
        toastEl.className = `nexus-toast is-${type}`;
        toastEl.setAttribute('role', 'alert');

        let iconSvg = '';
        if (type === 'success') {
            iconSvg = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;
        } else if (type === 'error') {
            iconSvg = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
        } else if (type === 'warning') {
            iconSvg = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
        } else {
            iconSvg = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
        }

        toastEl.innerHTML = `
            <span class="nexus-toast-icon">${iconSvg}</span>
            <span class="nexus-toast-message">${message}</span>
            <button class="nexus-toast-close" title="Dismiss">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
        `;

        let timer = null;
        let remaining = duration;
        let start = Date.now();

        const dismiss = () => {
            if (!NexusToast._toasts.has(toastEl)) return;
            NexusToast._toasts.delete(toastEl);
            toastEl.classList.remove('is-visible');
            toastEl.classList.add('is-hiding');
            setTimeout(() => {
                toastEl.remove();
                if (NexusToast._toasts.size === 0 && NexusToast._container) {
                    NexusToast._container.remove();
                    NexusToast._container = null;
                }
            }, 200);
        };

        const startTimer = () => {
            if (duration > 0) {
                start = Date.now();
                timer = setTimeout(dismiss, remaining);
            }
        };

        const pauseTimer = () => {
            if (timer) {
                clearTimeout(timer);
                remaining -= Date.now() - start;
            }
        };

        toastEl.querySelector('.nexus-toast-close').addEventListener('click', (e) => {
            e.stopPropagation();
            if (timer) clearTimeout(timer);
            dismiss();
        });

        toastEl.addEventListener('mouseenter', pauseTimer);
        toastEl.addEventListener('mouseleave', startTimer);

        container.appendChild(toastEl);
        NexusToast._toasts.add(toastEl);

        // Animate in
        requestAnimationFrame(() => toastEl.classList.add('is-visible'));
        startTimer();

        return toastEl;
    }

    static success(msg, duration) { return NexusToast.show(msg, 'success', duration); }
    static error(msg, duration) { return NexusToast.show(msg, 'error', duration); }
    static info(msg, duration) { return NexusToast.show(msg, 'info', duration); }
    static warning(msg, duration) { return NexusToast.show(msg, 'warning', duration); }
}

// Global attachment for compatibility with existing inline calls
if (typeof window !== 'undefined') {
    window.NexusToast = NexusToast;
}
