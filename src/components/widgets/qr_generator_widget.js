import qrcode from 'qrcode-generator';

export class NexusQrGeneratorWidget {
    constructor(containerEl, props = {}) {
        this.containerEl = containerEl;
        this.label = 'QR Code';
        this.text = props.text || props.url || props.data || 'https://github.com';

        this.render();
        this.bindEvents();
        this.drawQr();
    }

    render() {
        this.containerEl.innerHTML = `
            <div class="nexus-widget">
                <div class="nexus-sol-qr-card">
                    <!-- Top Bar: Universal Title Badge -->
                    <div class="nexus-qr-top-bar">
                        <div class="nexus-widget-title-badge">
                            <span class="nexus-widget-status-dot is-running-emerald"></span>
                            <span class="nexus-widget-title-text">${this.label}</span>
                        </div>
                    </div>

                    <!-- Main Row: QR Canvas on Left, Controls & Input on Right -->
                    <div class="nexus-sol-qr-row">
                        <!-- High Quality White QR Code Canvas Card -->
                        <div class="nexus-sol-qr-canvas-box">
                            <canvas width="90" height="90" class="nexus-sol-qr-canvas" data-qr-canvas></canvas>
                        </div>

                        <!-- Right Column: Input & Action Buttons -->
                        <div class="nexus-sol-qr-right">
                            <div class="nexus-sol-qr-input-wrap">
                                <input type="text" class="nexus-sol-qr-input" value="${this._escapeHtml(this.text)}" placeholder="Enter URL or text..." data-qr-input />
                            </div>

                            <div class="nexus-sol-qr-actions">
                                <button type="button" class="nexus-sol-qr-btn is-primary" data-action="download" title="Download QR PNG Image">
                                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                        <polyline points="7 10 12 15 17 10"></polyline>
                                        <line x1="12" y1="15" x2="12" y2="3"></line>
                                    </svg>
                                    <span>Download</span>
                                </button>
                                <button type="button" class="nexus-sol-qr-btn is-ghost" data-action="copy" title="Copy QR Code Image to Clipboard">
                                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                                    </svg>
                                    <span data-copy-label>Copy</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    drawQr() {
        const canvas = this.containerEl.querySelector('[data-qr-canvas]');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const content = this.text || 'https://nexus.ai';

        try {
            // TypeNumber 0 (auto-detect version), ErrorCorrection Level 'M' (15%)
            const qr = qrcode(0, 'M');
            qr.addData(content);
            qr.make();

            const moduleCount = qr.getModuleCount();
            const canvasWidth = canvas.width;
            const canvasHeight = canvas.height;
            const padding = 4;
            const cellSize = (canvasWidth - padding * 2) / moduleCount;

            // Crisp pure white background
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvasWidth, canvasHeight);

            // Draw standard black QR code modules
            ctx.fillStyle = '#000000';
            for (let r = 0; r < moduleCount; r++) {
                for (let c = 0; c < moduleCount; c++) {
                    if (qr.isDark(r, c)) {
                        const x = padding + c * cellSize;
                        const y = padding + r * cellSize;
                        ctx.fillRect(Math.round(x), Math.round(y), Math.ceil(cellSize), Math.ceil(cellSize));
                    }
                }
            }
        } catch (e) {
            console.error('[Nexus QR Widget] Error generating QR code:', e);
        }
    }

    bindEvents() {
        this.containerEl.addEventListener('input', (e) => {
            const inputEl = e.target.closest('[data-qr-input]');
            if (inputEl) {
                this.text = inputEl.value;
                this.drawQr();
            }
        });

        this.containerEl.addEventListener('click', (e) => {
            const downloadBtn = e.target.closest('[data-action="download"]');
            if (downloadBtn) {
                const canvas = this.containerEl.querySelector('[data-qr-canvas]');
                if (!canvas) return;
                const link = document.createElement('a');
                link.download = 'nexus-qr-code.png';
                link.href = canvas.toDataURL('image/png');
                link.click();
                return;
            }

            const copyBtn = e.target.closest('[data-action="copy"]');
            if (copyBtn) {
                const canvas = this.containerEl.querySelector('[data-qr-canvas]');
                const showSuccess = () => {
                    const labelEl = this.containerEl.querySelector('[data-copy-label]');
                    if (labelEl) {
                        labelEl.textContent = 'Copied!';
                        setTimeout(() => {
                            labelEl.textContent = 'Copy';
                        }, 2000);
                    }
                };

                if (canvas && canvas.toBlob && window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
                    canvas.toBlob((blob) => {
                        if (blob) {
                            const item = new ClipboardItem({ 'image/png': blob });
                            navigator.clipboard.write([item]).then(showSuccess).catch(() => {
                                navigator.clipboard.writeText(this.text).then(showSuccess);
                            });
                        } else {
                            navigator.clipboard.writeText(this.text).then(showSuccess);
                        }
                    }, 'image/png');
                } else {
                    navigator.clipboard.writeText(this.text).then(showSuccess);
                }
            }
        });
    }

    _escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
}
