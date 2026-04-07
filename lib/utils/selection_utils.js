/**
 * Lumina Selection Utilities
 * Handles the "Ask" selection button and input popup.
 */

window.LuminaSelection = {
    btn: null,
    inputPopup: null,
    inputField: null,
    text: '',
    context: '',
    range: null,
    onSubmit: null,
    onHide: null,
    shadowRoot: null,
    originalOverflow: '',

    async init(options = {}) {
        if (!document.body) {
            await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve));
        }

        this.shadowRoot = options.shadowRoot;
        if (!this.shadowRoot) {
            this.shadowRoot = document.body || document.documentElement;
        }
        
        this.onSubmit = options.onSubmit;
        this.onHide = options.onHide;

        // 1. Cleanup existing
        this.cleanup();

        // 2. Create Selection Button
        this.btn = document.createElement('div');
        this.btn.id = 'lumina-ask-selection-btn';
        this.btn.style.pointerEvents = 'auto';
        this.btn.innerHTML = `
            <div class="lumina-dict-launcher-part">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
            </div>
            <div class="lumina-ask-part">
                Ask
            </div>
        `;

        // 3. Create Input Popup
        this.inputPopup = document.createElement('div');
        this.inputPopup.id = 'lumina-ask-input-popup';
        this.inputPopup.style.pointerEvents = 'auto';
        this.inputPopup.innerHTML = `
            <div class="lumina-dict-launcher-part">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
            </div>
            <div class="lumina-ask-input-wrapper">
                <span class="lumina-selected-text-tag" title="selected text">SelectedText</span>
                <textarea class="lumina-ask-input-field" placeholder="Ask anything... (Enter to send)"></textarea>
            </div>
        `;
        this.inputField = this.inputPopup.querySelector('.lumina-ask-input-field');

        // Button Listeners
        this.btn.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
        this.btn.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation();
            const dictPart = e.target.closest('.lumina-dict-launcher-part');
            if (dictPart) {
                if (this.onSubmit) this.onSubmit(`Define: ${this.text}`, this.text, true);
                this.hide();
            } else {
                this.showInput();
            }
        });

        // Input Listeners
        this.inputField.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const query = this.inputField.value.trim();
                if (query || this.text) {
                    const fullQuestion = `SelectedText: "${this.text}"\n\n${query}`;
                    const displayQuestion = query ? `Ask: ${query}` : `Ask: "${this.text}"`;
                    if (this.onSubmit) this.onSubmit(fullQuestion, displayQuestion, false);
                    this.hide();
                }
            } else if (e.key === 'Escape') {
                this.hide();
            }
        });

        this.inputField.addEventListener('input', () => {
            this.inputField.style.height = '14px'; // Base height
            this.inputField.style.height = (this.inputField.scrollHeight) + 'px';
        });

        this.inputPopup.addEventListener('mousedown', (e) => e.stopPropagation());

        this.shadowRoot.appendChild(this.btn);
        this.shadowRoot.appendChild(this.inputPopup);

        // Scroll Tracking
        window.addEventListener('scroll', () => {
            if (this.btn && this.btn.style.display === 'flex') {
                this.updatePosition(this.btn);
            }
        }, { passive: true });
    },

    cleanup() {
        if (this.shadowRoot) {
            this.shadowRoot.querySelectorAll('#lumina-ask-selection-btn, #lumina-ask-input-popup').forEach(el => el.remove());
        }
    },

    updatePosition(element = this.btn) {
        if (!element || !this.range) return;

        const firstLineRect = this.getSelectionFirstLineRect(this.range);
        if (!firstLineRect || firstLineRect.width === 0) {
            this.hide();
            return;
        }

        const top = firstLineRect.top;
        const left = firstLineRect.left;
        const btnWidth = element.offsetWidth;
        const btnHeight = element.offsetHeight || 34;
        const margin = 5;

        let finalTop = top - btnHeight - margin;
        let finalLeft = left;

        if (finalTop < 10) {
            const rect = this.range.getBoundingClientRect();
            finalTop = rect.bottom + margin;
        }

        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        if (finalLeft < 10) finalLeft = 10;
        if (finalLeft + btnWidth > viewportWidth - 10) finalLeft = Math.max(10, viewportWidth - btnWidth - 10);

        if (finalTop < 10) finalTop = 10;
        if (finalTop + btnHeight > viewportHeight - 10) finalTop = Math.max(10, viewportHeight - btnHeight - 10);

        element.style.left = finalLeft + 'px';
        element.style.top = finalTop + 'px';
    },

    show(x, y, text, range) {
        if (!this.btn) return;
        this.text = text;
        this.range = range;
        this.btn.style.display = 'flex';
        this.btn.style.visibility = 'visible';
        this.updatePosition(this.btn);
    },

    showInput() {
        if (!this.inputPopup || !this.btn) return;

        const rect = this.btn.getBoundingClientRect();
        
        this.btn.style.display = 'none';
        this.btn.style.visibility = 'hidden';
        this.inputPopup.style.display = 'flex';
        this.inputPopup.style.visibility = 'visible';

        if (this.inputField) {
            this.inputField.value = '';
            this.inputField.style.height = '14px';
            setTimeout(() => this.inputField.focus(), 10);
        }

        this.updatePosition(this.inputPopup);
        this.setScrollLock(true);
    },

    hide() {
        if (this.btn) {
            this.btn.style.display = 'none';
            this.btn.style.visibility = 'hidden';
        }
        if (this.inputPopup) {
            this.inputPopup.style.display = 'none';
            this.inputPopup.style.visibility = 'hidden';
        }
        this.text = '';
        this.range = null;
        this.setScrollLock(false);
        if (this.onHide) this.onHide();
    },

    setScrollLock(lock) {
        if (lock) {
            this.originalOverflow = document.body.style.overflow;
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = this.originalOverflow;
        }
    },

    getSelectionFirstLineRect(range) {
        const rects = range.getClientRects();
        if (rects.length > 0) {
            let firstRect = rects[0];
            for (let i = 0; i < rects.length; i++) {
                if (rects[i].width > 1) {
                    firstRect = rects[i];
                    break;
                }
            }
            return firstRect;
        }
        return range.getBoundingClientRect();
    },

    getDeepActiveElement(root = document) {
        let active = root.activeElement;
        while (active && active.shadowRoot) {
            active = active.shadowRoot.activeElement;
        }
        return active;
    },

    isInsideEditable() {
        const sel = window.getSelection();
        try {
            if (sel && sel.rangeCount > 0 && sel.toString().trim().length > 0) {
                let node = sel.anchorNode;
                while (node && node !== document.documentElement) {
                    if (node.nodeType === 1) {
                        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(node.tagName) ||
                            node.isContentEditable || node.contentEditable === 'true' ||
                            node.getAttribute('contenteditable') === 'true' ||
                            node.getAttribute('role') === 'textbox'
                        ) return true;
                    }
                    node = node.parentNode || (node.host && node.host.nodeType === 1 ? node.host : null);
                }
            }
        } catch (e) { return false; }

        const active = this.getDeepActiveElement();
        return active && (
            ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName) ||
            active.isContentEditable ||
            active.getAttribute('contenteditable') === 'true' ||
            active.getAttribute('role') === 'textbox'
        );
    }
};
