import { audioNotifier } from './audio_notifier.js';

export class NexusTimerWidget {
    constructor(containerEl, props = {}) {
        this.containerEl = containerEl;
        const initialMinutes = Math.max(0, parseInt(props.minutes, 10) || 0);
        const initialSeconds = Math.max(0, parseInt(props.seconds, 10) || 0);
        this.totalDurationSeconds = (initialMinutes * 60) + initialSeconds;
        if (this.totalDurationSeconds <= 0) this.totalDurationSeconds = 3 * 60; // Default 3 mins

        this.remainingSeconds = this.totalDurationSeconds;
        this.label = 'Timer';
        this.intervalId = null;
        this.isRunning = false;

        this.render();
        this.bindEvents();
    }

    _formatTime(totalSecs) {
        const h = Math.floor(totalSecs / 3600);
        const m = Math.floor((totalSecs % 3600) / 60);
        const s = totalSecs % 60;

        if (h > 0) {
            return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        }
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }

    _calcRingOffset() {
        // Circumference for r=35: 2 * Math.PI * 35 ≈ 219.91
        const circumference = 219.91;
        if (this.totalDurationSeconds <= 0) return 0;
        const fraction = this.remainingSeconds / this.totalDurationSeconds;
        return circumference * (1 - fraction);
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
            lines.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" class="nexus-timer-tick" />`);
        }
        return lines.join('');
    }

    render() {
        const timeStr = this._formatTime(this.remainingSeconds);
        const percent = this.totalDurationSeconds > 0 ? (this.remainingSeconds / this.totalDurationSeconds) * 100 : 0;
        const displayMins = Math.max(1, Math.round(this.totalDurationSeconds / 60));

        this.containerEl.innerHTML = `
            <div class="nexus-widget">
                <div class="nexus-sol-timer-card">
                    <!-- Top Bar: Title & Inline Minute Edit -->
                    <div class="nexus-timer-top-bar">
                        <div class="nexus-widget-title-badge">
                            <span class="nexus-widget-status-dot ${this.isRunning ? 'is-running' : ''}"></span>
                            <span class="nexus-widget-title-text">${this._escapeHtml(this.label)}</span>
                        </div>

                        <!-- Custom Inline Editable Duration Input -->
                        <div class="nexus-pomo-custom-input-box" title="Click to customize duration">
                            <input type="number" min="1" max="180" class="nexus-pomo-inline-input" value="${displayMins}" data-input-timer-mins />
                            <span class="nexus-pomo-input-unit">min</span>
                        </div>
                    </div>

                    <!-- Big Digital Digits -->
                    <div class="nexus-sol-timer-time" data-time-display>${timeStr}</div>

                    <!-- Slim Linear Progress Bar -->
                    <div class="nexus-timer-linear-progress-track">
                        <div class="nexus-timer-linear-progress-fill" data-progress-fill style="width: ${percent}%;"></div>
                    </div>

                    <!-- Controls & Quick Add Chips -->
                    <div class="nexus-sol-timer-controls">
                        <div class="nexus-sol-timer-actions-left">
                            <button type="button" class="nexus-timer-btn-main ${this.isRunning ? 'is-running' : ''}" data-action="toggle">
                                <svg class="icon-play" viewBox="0 0 24 24" width="13" height="13" fill="currentColor" style="${this.isRunning ? 'display:none;' : ''}">
                                    <polygon points="6 3 20 12 6 21 6 3"></polygon>
                                </svg>
                                <svg class="icon-pause" viewBox="0 0 24 24" width="13" height="13" fill="currentColor" style="${this.isRunning ? '' : 'display:none;'}">
                                    <rect x="6" y="4" width="4" height="16" rx="1"></rect>
                                    <rect x="14" y="4" width="4" height="16" rx="1"></rect>
                                </svg>
                                <span data-btn-label>${this.isRunning ? 'Pause' : 'Start'}</span>
                            </button>
                            <button type="button" class="nexus-timer-btn-ghost" data-action="reset" title="Reset timer">
                                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
                                    <path d="M3 3v5h5"></path>
                                </svg>
                                <span>Reset</span>
                            </button>
                        </div>
                        <div class="nexus-sol-timer-chips-right">
                            <button type="button" class="nexus-timer-chip-btn" data-add-sec="60">+1m</button>
                            <button type="button" class="nexus-timer-chip-btn" data-add-sec="300">+5m</button>
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

            const resetBtn = e.target.closest('[data-action="reset"]');
            if (resetBtn) {
                this.reset();
                return;
            }

            const presetBtn = e.target.closest('[data-add-sec]');
            if (presetBtn) {
                const addSecs = parseInt(presetBtn.dataset.addSec, 10) || 0;
                this.addTime(addSecs);
                return;
            }
        });

        // Inline custom duration change
        this.containerEl.addEventListener('change', (e) => {
            const inputEl = e.target.closest('[data-input-timer-mins]');
            if (inputEl) {
                let mins = parseInt(inputEl.value, 10);
                if (isNaN(mins) || mins < 1) mins = 1;
                if (mins > 180) mins = 180;
                inputEl.value = mins;

                this.totalDurationSeconds = mins * 60;
                this.remainingSeconds = this.totalDurationSeconds;
                this.pause();
                this.render();
            }
        });

        this.containerEl.addEventListener('keydown', (e) => {
            const inputEl = e.target.closest('[data-input-timer-mins]');
            if (inputEl && e.key === 'Enter') {
                inputEl.blur();
            }
        });
    }

    toggle() {
        if (this.isRunning) {
            this.pause();
        } else {
            this.start();
        }
    }

    start() {
        if (this.isRunning) return;
        if (this.remainingSeconds <= 0) {
            this.remainingSeconds = this.totalDurationSeconds;
        }
        this.isRunning = true;
        this._updateUIState();

        this.intervalId = setInterval(() => {
            if (this.remainingSeconds > 0) {
                this.remainingSeconds--;
                this._updateDisplay();
                if (this.remainingSeconds === 0) {
                    this._onFinish();
                }
            }
        }, 1000);
    }

    pause() {
        if (!this.isRunning) return;
        this.isRunning = false;
        clearInterval(this.intervalId);
        this.intervalId = null;
        this._updateUIState();
    }

    reset() {
        this.pause();
        this.remainingSeconds = this.totalDurationSeconds;
        this._updateDisplay();
        this._updateUIState();
    }

    addTime(seconds) {
        this.remainingSeconds += seconds;
        this.totalDurationSeconds = Math.max(this.totalDurationSeconds, this.remainingSeconds);
        const inputEl = this.containerEl.querySelector('[data-input-timer-mins]');
        if (inputEl) {
            inputEl.value = Math.max(1, Math.ceil(this.remainingSeconds / 60));
        }
        this._updateDisplay();
    }

    _onFinish() {
        this.pause();
        audioNotifier.playSuccessChime();
        this._updateDisplay();
    }

    _updateDisplay() {
        const timeEl = this.containerEl.querySelector('[data-time-display]');
        const fillEl = this.containerEl.querySelector('[data-progress-fill]');

        if (timeEl) {
            timeEl.textContent = this._formatTime(this.remainingSeconds);
        }
        if (fillEl) {
            const percent = this.totalDurationSeconds > 0 ? (this.remainingSeconds / this.totalDurationSeconds) * 100 : 0;
            fillEl.style.width = `${percent}%`;
        }
    }

    _updateUIState() {
        const playIcon = this.containerEl.querySelector('.icon-play');
        const pauseIcon = this.containerEl.querySelector('.icon-pause');
        const btnLabel = this.containerEl.querySelector('[data-btn-label]');
        const mainBtn = this.containerEl.querySelector('.nexus-timer-btn-main');
        const statusDot = this.containerEl.querySelector('.nexus-widget-status-dot') || this.containerEl.querySelector('.nexus-timer-status-dot');

        if (playIcon) playIcon.style.display = this.isRunning ? 'none' : '';
        if (pauseIcon) pauseIcon.style.display = this.isRunning ? '' : 'none';
        if (btnLabel) btnLabel.textContent = this.isRunning ? 'Pause' : 'Start';
        if (mainBtn) mainBtn.classList.toggle('is-running', this.isRunning);
        if (statusDot) statusDot.classList.toggle('is-running', this.isRunning);
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
