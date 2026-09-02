export class NexusStopwatchWidget {
    constructor(containerEl, props = {}) {
        this.containerEl = containerEl;
        this.label = 'Stopwatch';

        this.elapsedMs = 0;
        this.startTime = 0;
        this.intervalId = null;
        this.isRunning = false;
        this.laps = []; // Array of { id, lapTimeMs, totalTimeMs }

        this.render();
        this.bindEvents();
    }

    _formatTime(totalMs) {
        const ms = Math.floor((totalMs % 1000) / 10);
        const totalSecs = Math.floor(totalMs / 1000);
        const m = Math.floor(totalSecs / 60);
        const s = totalSecs % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
    }

    _calcHandAngle() {
        const totalSecs = (this.elapsedMs / 1000) % 60;
        return (totalSecs / 60) * 360;
    }

    _generateTicks() {
        const lines = [];
        const cx = 44, cy = 44;
        for (let i = 0; i < 12; i++) {
            const angle = (i * 30 - 90) * (Math.PI / 180);
            const r1 = 30;
            const r2 = 33;
            const x1 = cx + r1 * Math.cos(angle);
            const y1 = cy + r1 * Math.sin(angle);
            const x2 = cx + r2 * Math.cos(angle);
            const y2 = cy + r2 * Math.sin(angle);
            lines.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" class="nexus-stopwatch-tick" />`);
        }
        return lines.join('');
    }

    render() {
        const timeStr = this._formatTime(this.elapsedMs);

        this.containerEl.innerHTML = `
            <div class="nexus-widget">
                <div class="nexus-sol-stopwatch-card">
                    <!-- Top Bar: Title & Laps Pill -->
                    <div class="nexus-stopwatch-top-bar">
                        <div class="nexus-widget-title-badge">
                            <span class="nexus-widget-status-dot ${this.isRunning ? 'is-running-emerald' : ''}"></span>
                            <span class="nexus-widget-title-text">${this.label}</span>
                        </div>
                        <span class="nexus-stopwatch-laps-pill" data-lap-counter>${this.laps.length} Laps</span>
                    </div>

                    <!-- Big Digital Digits -->
                    <div class="nexus-sol-stopwatch-time" data-time-display>${timeStr}</div>

                    <!-- Controls -->
                    <div class="nexus-sol-stopwatch-controls">
                        <button type="button" class="nexus-stopwatch-btn-main ${this.isRunning ? 'is-running' : ''}" data-action="toggle">
                            <svg class="icon-play" viewBox="0 0 24 24" width="13" height="13" fill="currentColor" style="${this.isRunning ? 'display:none;' : ''}">
                                <polygon points="6 3 20 12 6 21 6 3"></polygon>
                            </svg>
                            <svg class="icon-pause" viewBox="0 0 24 24" width="13" height="13" fill="currentColor" style="${this.isRunning ? '' : 'display:none;'}">
                                <rect x="6" y="4" width="4" height="16" rx="1"></rect>
                                <rect x="14" y="4" width="4" height="16" rx="1"></rect>
                            </svg>
                            <span data-btn-label>${this.isRunning ? 'Stop' : 'Start'}</span>
                        </button>
                        <button type="button" class="nexus-stopwatch-btn-ghost" data-action="lap" ${!this.isRunning && this.elapsedMs === 0 ? 'disabled' : ''} title="Record Lap">
                            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
                                <line x1="4" y1="22" x2="4" y2="15"></line>
                            </svg>
                            <span>Lap</span>
                        </button>
                        <button type="button" class="nexus-stopwatch-btn-ghost" data-action="reset" title="Reset stopwatch">
                            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
                                <path d="M3 3v5h5"></path>
                            </svg>
                            <span>Reset</span>
                        </button>
                    </div>

                    <!-- Laps Scroll Table -->
                    <div class="nexus-sol-stopwatch-laps" data-laps-wrapper style="${this.laps.length > 0 ? '' : 'display:none;'}">
                        <div class="nexus-sol-laps-header">
                            <span>Lap</span>
                            <span>Split</span>
                            <span>Total</span>
                        </div>
                        <div class="nexus-sol-laps-list" data-laps-list>
                            ${this._renderLapsHtml()}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    bindEvents() {
        this.containerEl.addEventListener('click', (e) => {
            const toggleBtn = e.target.closest('[data-action="toggle"]');
            if (toggleBtn) {
                this.toggle();
                return;
            }

            const lapBtn = e.target.closest('[data-action="lap"]');
            if (lapBtn && !lapBtn.disabled) {
                this.recordLap();
                return;
            }

            const resetBtn = e.target.closest('[data-action="reset"]');
            if (resetBtn) {
                this.reset();
                return;
            }
        });
    }

    toggle() {
        if (this.isRunning) {
            this.stop();
        } else {
            this.start();
        }
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.startTime = performance.now() - this.elapsedMs;
        this._updateUIState();

        this.intervalId = setInterval(() => {
            this.elapsedMs = performance.now() - this.startTime;
            this._updateDisplay();
        }, 30);
    }

    stop() {
        if (!this.isRunning) return;
        this.isRunning = false;
        clearInterval(this.intervalId);
        this.intervalId = null;
        this._updateUIState();
    }

    reset() {
        this.stop();
        this.elapsedMs = 0;
        this.laps = [];
        this.render();
    }

    recordLap() {
        const lastLapTotal = this.laps.length > 0 ? this.laps[0].totalTimeMs : 0;
        const currentLapTime = this.elapsedMs - lastLapTotal;

        const newLap = {
            id: this.laps.length + 1,
            lapTimeMs: currentLapTime,
            totalTimeMs: this.elapsedMs
        };

        this.laps.unshift(newLap); // Newest on top
        this._updateLapsUI();
    }

    _renderLapsHtml() {
        if (this.laps.length === 0) return '';

        let fastestLapId = null;
        let slowestLapId = null;

        if (this.laps.length >= 2) {
            let minTime = Infinity;
            let maxTime = -Infinity;
            this.laps.forEach(lap => {
                if (lap.lapTimeMs < minTime) {
                    minTime = lap.lapTimeMs;
                    fastestLapId = lap.id;
                }
                if (lap.lapTimeMs > maxTime) {
                    maxTime = lap.lapTimeMs;
                    slowestLapId = lap.id;
                }
            });
        }

        return this.laps.map(lap => {
            let badgeClass = '';
            let badgeText = '';

            if (lap.id === fastestLapId) {
                badgeClass = 'is-fastest';
                badgeText = 'Fastest';
            } else if (lap.id === slowestLapId) {
                badgeClass = 'is-slowest';
                badgeText = 'Slowest';
            }

            return `
                <div class="nexus-sol-lap-row ${badgeClass}">
                    <span class="lap-num">
                        #${lap.id}
                        ${badgeText ? `<span class="lap-indicator ${badgeClass}">${badgeText}</span>` : ''}
                    </span>
                    <span class="lap-split">${this._formatTime(lap.lapTimeMs)}</span>
                    <span class="lap-total">${this._formatTime(lap.totalTimeMs)}</span>
                </div>
            `;
        }).join('');
    }

    _updateDisplay() {
        const timeEl = this.containerEl.querySelector('[data-time-display]');
        if (timeEl) {
            timeEl.textContent = this._formatTime(this.elapsedMs);
        }
    }

    _updateUIState() {
        const playIcon = this.containerEl.querySelector('.icon-play');
        const pauseIcon = this.containerEl.querySelector('.icon-pause');
        const btnLabel = this.containerEl.querySelector('[data-btn-label]');
        const mainBtn = this.containerEl.querySelector('.nexus-stopwatch-btn-main');
        const lapBtn = this.containerEl.querySelector('[data-action="lap"]');
        const statusDot = this.containerEl.querySelector('.nexus-widget-status-dot') || this.containerEl.querySelector('.nexus-timer-status-dot');

        if (playIcon) playIcon.style.display = this.isRunning ? 'none' : '';
        if (pauseIcon) pauseIcon.style.display = this.isRunning ? '' : 'none';
        if (btnLabel) btnLabel.textContent = this.isRunning ? 'Stop' : 'Start';
        if (mainBtn) mainBtn.classList.toggle('is-running', this.isRunning);
        if (statusDot) statusDot.classList.toggle('is-running-emerald', this.isRunning);

        if (lapBtn) {
            lapBtn.disabled = !this.isRunning && this.elapsedMs === 0;
        }
    }

    _updateLapsUI() {
        const wrapperEl = this.containerEl.querySelector('[data-laps-wrapper]');
        const listEl = this.containerEl.querySelector('[data-laps-list]');
        const counterEl = this.containerEl.querySelector('[data-lap-counter]');

        if (wrapperEl) wrapperEl.style.display = this.laps.length > 0 ? '' : 'none';
        if (listEl) listEl.innerHTML = this._renderLapsHtml();
        if (counterEl) counterEl.textContent = `${this.laps.length} Laps`;
    }
}
