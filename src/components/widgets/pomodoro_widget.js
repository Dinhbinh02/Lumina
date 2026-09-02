import { audioNotifier } from './audio_notifier.js';

export class NexusPomodoroWidget {
    constructor(containerEl, props = {}) {
        this.containerEl = containerEl;
        this.workMins = Math.max(1, parseInt(props.work || props.minutes, 10) || 25);
        this.breakMins = Math.max(1, parseInt(props.break, 10) || 5);
        this.longBreakMins = Math.max(1, parseInt(props.longBreak, 10) || 15);
        this.label = props.label || props.title || 'Pomodoro Focus';

        this.currentMode = 'work'; // 'work' | 'break' | 'long_break'
        this.sessionCount = 1; // 1 to 4
        this.totalDurationSeconds = this.workMins * 60;
        this.remainingSeconds = this.totalDurationSeconds;

        this.intervalId = null;
        this.isRunning = false;

        this.render();
        this.bindEvents();
    }

    _formatTime(totalSecs) {
        const m = Math.floor(totalSecs / 60);
        const s = totalSecs % 60;
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
            lines.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" class="nexus-pomo-tick" />`);
        }
        return lines.join('');
    }

    render() {
        const timeStr = this._formatTime(this.remainingSeconds);
        const ringOffset = this._calcRingOffset();
        const isFocus = this.currentMode === 'work';
        const ringColor = isFocus ? '#f97316' : '#10b981';
        const currentMins = isFocus ? this.workMins : this.breakMins;

        this.containerEl.innerHTML = `
            <div class="nexus-widget">
                <div class="nexus-sol-pomo-card is-mode-${this.currentMode}">
                    <!-- Left Column: Controls, Mode switch, Timer -->
                    <div class="nexus-sol-pomo-left">
                        <!-- Mode Tabs & Custom Minute Input -->
                        <div class="nexus-pomo-top-bar">
                            <div class="nexus-pomo-mode-tabs">
                                <button type="button" class="nexus-pomo-tab ${isFocus ? 'is-active' : ''}" data-set-mode="work">Focus</button>
                                <button type="button" class="nexus-pomo-tab ${!isFocus ? 'is-active' : ''}" data-set-mode="break">Break</button>
                            </div>

                            <!-- Custom Inline Editable Minute Input -->
                            <div class="nexus-pomo-custom-input-box" title="Click to customize duration">
                                <input type="number" min="1" max="180" class="nexus-pomo-inline-input" value="${currentMins}" data-input-duration />
                                <span class="nexus-pomo-input-unit">min</span>
                            </div>
                        </div>

                        <!-- Big Digital Digits -->
                        <div class="nexus-sol-pomo-time" data-time-display>${timeStr}</div>

                        <!-- Session Dots & Info -->
                        <div class="nexus-pomo-meta-row">
                            <div class="nexus-pomo-dots">
                                ${[1, 2, 3, 4].map(idx => `
                                    <span class="nexus-pomo-dot ${idx <= this.sessionCount ? 'is-active' : ''} ${idx === this.sessionCount && isFocus ? 'is-current' : ''}"></span>
                                `).join('')}
                            </div>
                            <span class="nexus-pomo-cycle-label">Session ${this.sessionCount}/4</span>
                        </div>

                        <!-- Action Buttons -->
                        <div class="nexus-sol-pomo-controls">
                            <button type="button" class="nexus-pomo-btn-main ${this.isRunning ? 'is-running' : ''}" data-action="toggle">
                                <svg class="icon-play" viewBox="0 0 24 24" width="13" height="13" fill="currentColor" style="${this.isRunning ? 'display:none;' : ''}">
                                    <polygon points="6 3 20 12 6 21 6 3"></polygon>
                                </svg>
                                <svg class="icon-pause" viewBox="0 0 24 24" width="13" height="13" fill="currentColor" style="${this.isRunning ? '' : 'display:none;'}">
                                    <rect x="6" y="4" width="4" height="16" rx="1"></rect>
                                    <rect x="14" y="4" width="4" height="16" rx="1"></rect>
                                </svg>
                                <span data-btn-label>${this.isRunning ? 'Pause' : 'Start'}</span>
                            </button>
                            <button type="button" class="nexus-pomo-btn-ghost" data-action="skip" title="Skip to next phase">
                                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <polygon points="5 4 15 12 5 20 5 4"></polygon>
                                    <line x1="19" y1="5" x2="19" y2="19"></line>
                                </svg>
                                <span>Skip</span>
                            </button>
                            <button type="button" class="nexus-pomo-btn-ghost" data-action="reset" title="Reset session">
                                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
                                    <path d="M3 3v5h5"></path>
                                </svg>
                                <span>Reset</span>
                            </button>
                        </div>
                    </div>

                    <!-- Right Column: Precision Swiss Dial + Live SVG Progress Ring -->
                    <div class="nexus-sol-pomo-right">
                        <svg class="nexus-sol-pomo-dial" viewBox="0 0 88 88" width="88" height="88">
                            <!-- Background Dial Face -->
                            <circle cx="44" cy="44" r="41" class="nexus-pomo-dial-bg" />
                            <!-- 12 Precision Tick Marks -->
                            ${this._generateTicks()}
                            <!-- Background Track Circle -->
                            <circle cx="44" cy="44" r="35" class="nexus-pomo-track" />
                            <!-- Active Progress Ring -->
                            <circle cx="44" cy="44" r="35" class="nexus-pomo-progress-ring" data-progress-ring
                                style="stroke-dasharray: 219.91; stroke-dashoffset: ${ringOffset}; stroke: ${ringColor};" />
                            
                            <!-- Center Lucide Professional Icon -->
                            <g class="nexus-pomo-center-icon">
                                ${isFocus ? `
                                    <!-- Official Lucide Target Bullseye -->
                                    <g transform="translate(32, 32)" stroke="${ringColor}" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                                        <circle cx="12" cy="12" r="10"></circle>
                                        <circle cx="12" cy="12" r="6"></circle>
                                        <circle cx="12" cy="12" r="2" fill="${ringColor}"></circle>
                                    </g>
                                ` : `
                                    <!-- Official Lucide Coffee Cup with Steam Trails -->
                                    <g transform="translate(32, 32)" stroke="${ringColor}" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                                        <path d="M17 8h1a4 4 0 1 1 0 8h-1"></path>
                                        <path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"></path>
                                        <line x1="6" x2="6" y1="2" y2="4"></line>
                                        <line x1="10" x2="10" y1="2" y2="4"></line>
                                        <line x1="14" x2="14" y1="2" y2="4"></line>
                                    </g>
                                `}
                            </g>
                        </svg>
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

            const skipBtn = e.target.closest('[data-action="skip"]');
            if (skipBtn) {
                this.skipPhase();
                return;
            }

            const resetBtn = e.target.closest('[data-action="reset"]');
            if (resetBtn) {
                this.reset();
                return;
            }

            const modeTab = e.target.closest('[data-set-mode]');
            if (modeTab) {
                const targetMode = modeTab.getAttribute('data-set-mode');
                if (targetMode !== this.currentMode) {
                    this.currentMode = targetMode;
                    this.totalDurationSeconds = (this.currentMode === 'work' ? this.workMins : this.breakMins) * 60;
                    this.remainingSeconds = this.totalDurationSeconds;
                    this.pause();
                    this.render();
                }
                return;
            }
        });

        // Handle inline custom minutes input
        this.containerEl.addEventListener('change', (e) => {
            const inputEl = e.target.closest('[data-input-duration]');
            if (inputEl) {
                let mins = parseInt(inputEl.value, 10);
                if (isNaN(mins) || mins < 1) mins = 1;
                if (mins > 180) mins = 180;
                inputEl.value = mins;

                if (this.currentMode === 'work') {
                    this.workMins = mins;
                } else {
                    this.breakMins = mins;
                }
                this.totalDurationSeconds = mins * 60;
                this.remainingSeconds = this.totalDurationSeconds;
                this.pause();
                this.render();
            }
        });

        this.containerEl.addEventListener('keydown', (e) => {
            const inputEl = e.target.closest('[data-input-duration]');
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
            this._switchMode();
        }
        this.isRunning = true;
        this._updateUIState();

        this.intervalId = setInterval(() => {
            if (this.remainingSeconds > 0) {
                this.remainingSeconds--;
                this._updateDisplay();
                if (this.remainingSeconds === 0) {
                    this._onPhaseComplete();
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
        this.totalDurationSeconds = (this.currentMode === 'work' ? this.workMins : this.breakMins) * 60;
        this.remainingSeconds = this.totalDurationSeconds;
        this.render();
    }

    skipPhase() {
        this.pause();
        this._switchMode();
        this.render();
    }

    _switchMode() {
        if (this.currentMode === 'work') {
            if (this.sessionCount >= 4) {
                this.currentMode = 'long_break';
                this.totalDurationSeconds = this.longBreakMins * 60;
            } else {
                this.currentMode = 'break';
                this.totalDurationSeconds = this.breakMins * 60;
            }
        } else {
            if (this.currentMode === 'long_break') {
                this.sessionCount = 1;
            } else {
                this.sessionCount++;
            }
            this.currentMode = 'work';
            this.totalDurationSeconds = this.workMins * 60;
        }
        this.remainingSeconds = this.totalDurationSeconds;
    }

    _onPhaseComplete() {
        this.pause();
        audioNotifier.playSuccessChime();
        this._switchMode();
        this.render();
    }

    _updateDisplay() {
        const timeEl = this.containerEl.querySelector('[data-time-display]');
        const ringEl = this.containerEl.querySelector('[data-progress-ring]');

        if (timeEl) {
            timeEl.textContent = this._formatTime(this.remainingSeconds);
        }
        if (ringEl) {
            ringEl.style.strokeDashoffset = this._calcRingOffset();
        }
    }

    _updateUIState() {
        const playIcon = this.containerEl.querySelector('.icon-play');
        const pauseIcon = this.containerEl.querySelector('.icon-pause');
        const btnLabel = this.containerEl.querySelector('[data-btn-label]');
        const mainBtn = this.containerEl.querySelector('.nexus-pomo-btn-main');

        if (playIcon) playIcon.style.display = this.isRunning ? 'none' : '';
        if (pauseIcon) pauseIcon.style.display = this.isRunning ? '' : 'none';
        if (btnLabel) btnLabel.textContent = this.isRunning ? 'Pause' : 'Start';
        if (mainBtn) mainBtn.classList.toggle('is-running', this.isRunning);
    }
}
