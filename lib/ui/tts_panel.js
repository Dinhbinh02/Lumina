/**
 * TTSPanel - UI Controller for Lumina TTS Studio (AI Studio Speaker Settings Architecture)
 * Manages Audio Profile, Director's Note (Style, Pace, Accent drop chips),
 * 30 AI Studio Voice Cards with traits, trait filter menu, audio preview samples, and 2-Pane history.
 */
class TTSPanel {
    constructor() {
        this.currentMode = 'single';
        this.audioElement = new Audio();
        this.sampleAudioElement = new Audio();
        this.currentRecordingId = null;
        this.currentAudioBlob = null;
        this.currentWavBlob = null;
        this.recordings = [];
        this.activeFilter = 'all';
        this.searchQuery = '';
        this.voiceSearchQuery = '';
        this.selectedVoiceTraits = new Set();
        this.isPlaying = false;
        this.isGenerating = false;
        this.activeSpeakerTarget = '1';

        this.selectedVoice1 = 'Kore';
        this.selectedVoice2 = 'Puck';
        this.selectedStyle = '';
        this.selectedPace = '';
        this.selectedAccent = '';
        this.audioProfile = '';

        this.initDOMElements();
        this.bindEvents();
        this.renderDirectorDropdowns();
        this.renderVoiceFilterMenu();
        this.renderVoiceCards();
    }

    async init(recordingId = null) {
        this.initDOMElements();
        this.renderDirectorDropdowns();
        this.renderVoiceFilterMenu();
        this.renderVoiceCards();
        await this.loadRecordings();
        if (recordingId) {
            await this.selectRecording(recordingId);
        }
    }

    initDOMElements() {
        this.page = document.getElementById('tts-page');
        this.sidebarToggleBtn = document.getElementById('tts-sidebar-toggle-btn');
        this.backBtn = document.getElementById('tts-back-btn');
        this.newAudioBtn = document.getElementById('tts-new-audio-btn');
        this.searchInput = document.getElementById('tts-search-input');
        this.recordingsListEl = document.getElementById('tts-recordings-list');
        this.countLabel = document.getElementById('tts-count-label');
        this.filterBtns = document.querySelectorAll('#tts-filter-controls .notes-sort-btn');
        this.presetQuickChips = document.querySelectorAll('.tts-preset-quick-chip');

        this.modeBtns = document.querySelectorAll('.tts-mode-btn');
        this.duplicateBtn = document.getElementById('tts-duplicate-btn');
        this.deleteCurrentBtn = document.getElementById('tts-delete-current-btn');

        this.viewContainer = document.getElementById('tts-view-container');
        this.composeContainer = document.getElementById('tts-compose-container');
        this.modeSwitcher = document.getElementById('tts-mode-switcher');
        this.viewInfoBadge = document.getElementById('tts-view-info-badge');
        this.viewBadgeVoice = document.getElementById('tts-view-badge-voice');
        this.viewBadgeMode = document.getElementById('tts-view-badge-mode');
        this.viewBadgeDate = document.getElementById('tts-view-badge-date');
        this.viewActions = document.getElementById('tts-view-actions');
        this.viewScriptBody = document.getElementById('tts-view-script-body');

        this.heroTitle = document.getElementById('tts-hero-title');
        this.downloadMp3Btn = document.getElementById('tts-download-mp3-btn');

        this.scriptInput = document.getElementById('tts-script-input');
        this.tagChips = document.querySelectorAll('.tts-tag-chip');

        this.voicePickerWrapper = document.getElementById('tts-voice-picker-wrapper');
        this.voicePickerPill = document.getElementById('tts-voice-picker-pill');
        this.voiceSettingsPopover = document.getElementById('tts-voice-settings-popover');
        this.activeVoiceLabel = document.getElementById('tts-active-voice-label');

        this.profileInput = document.getElementById('tts-profile-input');
        this.styleChip = document.getElementById('tts-style-chip');
        this.styleChipLabel = document.getElementById('tts-style-chip-label');
        this.styleDropdown = document.getElementById('tts-style-dropdown');

        this.paceChip = document.getElementById('tts-pace-chip');
        this.paceChipLabel = document.getElementById('tts-pace-chip-label');
        this.paceDropdown = document.getElementById('tts-pace-dropdown');

        this.accentChip = document.getElementById('tts-accent-chip');
        this.accentChipLabel = document.getElementById('tts-accent-chip-label');
        this.accentDropdown = document.getElementById('tts-accent-dropdown');

        this.speakerTabSwitch = document.getElementById('tts-speaker-tab-switch');
        this.speakerNamesGroup = document.getElementById('tts-speaker-names-group');
        this.speaker1Input = document.getElementById('tts-speaker-1-name');
        this.speaker2Input = document.getElementById('tts-speaker-2-name');
        this.speakerTabBtns = document.querySelectorAll('.tts-speaker-tab-btn');
        this.s1Badge = document.getElementById('tts-s1-badge');
        this.s2Badge = document.getElementById('tts-s2-badge');

        this.voiceSearchInput = document.getElementById('tts-voice-search-input');
        this.voiceFilterBtn = document.getElementById('tts-voice-filter-btn');
        this.voiceFilterMenu = document.getElementById('tts-voice-filter-menu');
        this.voiceCardsContainer = document.getElementById('tts-voice-cards-container');

        this.generateBtn = document.getElementById('tts-generate-btn');
        this.generateBtnText = document.getElementById('tts-generate-btn-text');
        this.generateSpinner = document.getElementById('tts-generate-spinner');
        this.statusText = document.getElementById('tts-status-text');

        this.playPauseBtn = document.getElementById('tts-play-pause-btn');
        this.rewind5sBtn = document.getElementById('tts-rewind-5s-btn');
        this.forward5sBtn = document.getElementById('tts-forward-5s-btn');
        this.playIcon = document.getElementById('tts-play-icon');
        this.pauseIcon = document.getElementById('tts-pause-icon');
        this.progressBar = document.getElementById('tts-progress-bar');
        this.currentTimeEl = document.getElementById('tts-current-time');
        this.durationTimeEl = document.getElementById('tts-duration-time');
        this.speedBtn = document.getElementById('tts-speed-btn');
    }

    bindEvents() {
        if (this.sidebarToggleBtn) {
            this.sidebarToggleBtn.addEventListener('click', () => {
                if (typeof window.toggleSidebar === 'function') {
                    window.toggleSidebar();
                } else if (typeof toggleSidebar === 'function') {
                    toggleSidebar();
                }
            });
        }

        if (this.backBtn) {
            this.backBtn.addEventListener('click', () => {
                if (this.page) {
                    this.page.classList.remove('show-studio');
                }
            });
        }

        if (this.newAudioBtn) {
            this.newAudioBtn.addEventListener('click', () => this.resetStudioForNew());
        }

        if (this.searchInput) {
            this.searchInput.addEventListener('input', (e) => {
                this.searchQuery = e.target.value.toLowerCase().trim();
                this.renderRecordingsList();
            });
        }

        this.filterBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.filterBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.activeFilter = btn.dataset.filter || 'all';
                this.renderRecordingsList();
            });
        });

        this.presetQuickChips.forEach(chip => {
            chip.addEventListener('click', () => {
                const presetKey = chip.dataset.preset;
                this.applyPreset(presetKey);
                if (this.page) {
                    this.page.classList.add('show-studio');
                }
            });
        });

        this.modeBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const mode = btn.dataset.mode;
                this.setMode(mode);
            });
        });

        if (this.duplicateBtn) {
            this.duplicateBtn.addEventListener('click', () => this.duplicateCurrent());
        }

        if (this.deleteCurrentBtn) {
            this.deleteCurrentBtn.addEventListener('click', () => {
                if (this.currentRecordingId) {
                    this.deleteRecording(this.currentRecordingId);
                }
            });
        }

        this.tagChips.forEach(chip => {
            chip.addEventListener('click', () => {
                const tag = chip.dataset.tag;
                this.insertTagAtCursor(tag);
            });
        });

        if (this.profileInput) {
            this.profileInput.addEventListener('input', (e) => {
                this.audioProfile = e.target.value;
            });
        }

        // Setup Voice Picker Pill Popover
        if (this.voicePickerPill && this.voiceSettingsPopover) {
            this.voicePickerPill.addEventListener('click', (e) => {
                e.stopPropagation();
                const isOpen = this.voiceSettingsPopover.classList.contains('show');
                document.querySelectorAll('.tts-attribute-dropdown, .tts-voice-filter-menu').forEach(d => d.classList.remove('show'));
                if (!isOpen) {
                    this.voiceSettingsPopover.classList.add('show');
                } else {
                    this.voiceSettingsPopover.classList.remove('show');
                }
            });
        }

        // Setup Dropdown toggle for Style, Pace, Accent chips
        this.setupDropdown(this.styleChip, this.styleDropdown);
        this.setupDropdown(this.paceChip, this.paceDropdown);
        this.setupDropdown(this.accentChip, this.accentDropdown);

        if (this.voiceFilterBtn && this.voiceFilterMenu) {
            this.voiceFilterBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const isOpen = this.voiceFilterMenu.classList.contains('show');
                document.querySelectorAll('.tts-attribute-dropdown, .tts-voice-filter-menu').forEach(d => d.classList.remove('show'));
                if (!isOpen) {
                    this.voiceFilterMenu.classList.add('show');
                    this.voiceFilterBtn.classList.add('active');
                } else {
                    this.voiceFilterBtn.classList.remove('active');
                }
            });
        }

        // Close dropdowns & popovers when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.tts-voice-picker-wrapper')) {
                if (this.voiceSettingsPopover) this.voiceSettingsPopover.classList.remove('show');
                if (this.voiceFilterMenu) this.voiceFilterMenu.classList.remove('show');
                if (this.voiceFilterBtn) this.voiceFilterBtn.classList.remove('active');
            }
            if (!e.target.closest('.tts-attribute-chip-wrapper')) {
                document.querySelectorAll('.tts-attribute-dropdown').forEach(d => d.classList.remove('show'));
            }
        });

        // Speaker tab switcher in multi-speaker mode
        this.speakerTabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.speakerTabBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.activeSpeakerTarget = btn.dataset.targetSpeaker || '1';
                this.renderVoiceCards();
            });
        });

        if (this.voiceSearchInput) {
            this.voiceSearchInput.addEventListener('input', (e) => {
                this.voiceSearchQuery = e.target.value.toLowerCase().trim();
                this.renderVoiceCards();
            });
        }

        if (this.generateBtn) {
            this.generateBtn.addEventListener('click', () => this.handleGenerate());
        }

        if (this.playPauseBtn) {
            this.playPauseBtn.addEventListener('click', () => this.togglePlayPause());
        }

        if (this.rewind5sBtn) {
            this.rewind5sBtn.addEventListener('click', () => {
                const newTime = Math.max(0, (this.audioElement.currentTime || 0) - 5);
                this.audioElement.currentTime = newTime;
                if (this.currentTimeEl) this.currentTimeEl.textContent = this.formatTime(newTime);
            });
        }

        if (this.forward5sBtn) {
            this.forward5sBtn.addEventListener('click', () => {
                const dur = (this.audioElement.duration && isFinite(this.audioElement.duration)) 
                    ? this.audioElement.duration 
                    : (this.currentRecordingDuration || 0);
                const newTime = dur > 0 
                    ? Math.min(dur, (this.audioElement.currentTime || 0) + 5)
                    : (this.audioElement.currentTime || 0) + 5;
                this.audioElement.currentTime = newTime;
                if (this.currentTimeEl) this.currentTimeEl.textContent = this.formatTime(newTime);
            });
        }

        if (this.progressBar) {
            const handleSeek = (e) => {
                const dur = (this.audioElement.duration && isFinite(this.audioElement.duration)) 
                    ? this.audioElement.duration 
                    : this.currentRecordingDuration;
                if (dur && dur > 0) {
                    const targetTime = (parseFloat(e.target.value) / 100) * dur;
                    this.audioElement.currentTime = targetTime;
                    if (this.currentTimeEl) this.currentTimeEl.textContent = this.formatTime(targetTime);
                }
            };
            this.progressBar.addEventListener('input', handleSeek);
            this.progressBar.addEventListener('change', handleSeek);
        }

        if (this.speedBtn) {
            const speeds = [1, 1.25, 1.5, 1.75, 2, 0.8];
            let speedIdx = 0;
            this.speedBtn.addEventListener('click', () => {
                speedIdx = (speedIdx + 1) % speeds.length;
                const speed = speeds[speedIdx];
                this.audioElement.playbackRate = speed;
                this.speedBtn.textContent = `${speed}x`;
            });
        }

        if (this.heroTitle) {
            this.heroTitle.addEventListener('change', async () => {
                if (this.currentRecordingId) {
                    const newTitle = this.heroTitle.value.trim() || 'Untitled Audio';
                    await TTSDB.updateRecordingTitle(this.currentRecordingId, newTitle);
                    await this.loadRecordings();
                }
            });
            this.heroTitle.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    this.heroTitle.blur();
                }
            });
        }

        if (this.downloadMp3Btn) {
            this.downloadMp3Btn.addEventListener('click', () => {
                if (this.currentAudioBlob) {
                    const title = (this.heroTitle ? this.heroTitle.value : 'audio')
                        .toLowerCase().replace(/[^a-z0-9]/gi, '-').slice(0, 30);
                    TTSManager.downloadMp3(this.currentAudioBlob, `${title || 'speech'}.mp3`);
                }
            });
        }

        if (this.downloadWavBtn) {
            this.downloadWavBtn.addEventListener('click', () => {
                const blob = this.currentWavBlob || this.currentAudioBlob;
                if (blob) {
                    const title = (this.heroTitle ? this.heroTitle.textContent : 'audio')
                        .toLowerCase().replace(/[^a-z0-9]/gi, '-').slice(0, 30);
                    TTSManager.downloadWav(blob, `${title || 'speech'}.wav`);
                }
            });
        }

        const updateAudioDuration = () => {
            const dur = this.audioElement.duration;
            if (dur && isFinite(dur) && !isNaN(dur) && dur > 0) {
                if (this.durationTimeEl) this.durationTimeEl.textContent = this.formatTime(dur);
            } else if (this.currentRecordingDuration) {
                if (this.durationTimeEl) this.durationTimeEl.textContent = this.formatTime(this.currentRecordingDuration);
            }
        };

        this.audioElement.addEventListener('timeupdate', () => {
            const dur = (this.audioElement.duration && isFinite(this.audioElement.duration)) 
                ? this.audioElement.duration 
                : this.currentRecordingDuration;

            if (dur && dur > 0) {
                const progress = (this.audioElement.currentTime / dur) * 100;
                if (this.progressBar) this.progressBar.value = Math.min(100, Math.max(0, progress));
                if (this.durationTimeEl && (!this.durationTimeEl.textContent || this.durationTimeEl.textContent === '0:00' || this.durationTimeEl.textContent.includes('NaN'))) {
                    this.durationTimeEl.textContent = this.formatTime(dur);
                }
            }
            if (this.currentTimeEl) this.currentTimeEl.textContent = this.formatTime(this.audioElement.currentTime);
        });

        this.audioElement.addEventListener('loadedmetadata', updateAudioDuration);
        this.audioElement.addEventListener('durationchange', updateAudioDuration);
        this.audioElement.addEventListener('canplay', updateAudioDuration);

        this.audioElement.addEventListener('ended', () => {
            this.isPlaying = false;
            this.updatePlayerUI();
        });

        this.audioElement.addEventListener('pause', () => {
            this.isPlaying = false;
            this.updatePlayerUI();
        });

        this.audioElement.addEventListener('play', () => {
            this.isPlaying = true;
            this.updatePlayerUI();
        });

        this.sampleAudioElement.addEventListener('ended', () => {
            document.querySelectorAll('.tts-voice-play-sample-btn').forEach(b => b.classList.remove('playing'));
        });
    }

    setupDropdown(chipEl, dropdownEl) {
        if (!chipEl || !dropdownEl) return;
        chipEl.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = dropdownEl.classList.contains('show');
            document.querySelectorAll('.tts-attribute-dropdown, .tts-voice-filter-menu').forEach(d => d.classList.remove('show'));
            if (!isOpen) {
                dropdownEl.classList.add('show');
            }
        });
    }

    renderDirectorDropdowns() {
        if (this.styleDropdown) {
            this.styleDropdown.innerHTML = `
                <div class="tts-dropdown-item ${!this.selectedStyle ? 'selected' : ''}" data-val="">None (Default)</div>
                ${TTSManager.STYLE_OPTIONS.map(opt => `
                    <div class="tts-dropdown-item ${this.selectedStyle === opt.value ? 'selected' : ''}" data-val="${this.escapeHtml(opt.value)}">${this.escapeHtml(opt.label)}</div>
                `).join('')}
            `;
            this.styleDropdown.querySelectorAll('.tts-dropdown-item').forEach(item => {
                item.addEventListener('click', () => {
                    this.selectedStyle = item.dataset.val;
                    this.updateChipLabel(this.styleChip, this.styleChipLabel, 'Style', this.selectedStyle);
                    this.styleDropdown.classList.remove('show');
                    this.renderDirectorDropdowns();
                });
            });
        }

        if (this.paceDropdown) {
            this.paceDropdown.innerHTML = `
                <div class="tts-dropdown-item ${!this.selectedPace ? 'selected' : ''}" data-val="">None (Default)</div>
                ${TTSManager.PACE_OPTIONS.map(opt => `
                    <div class="tts-dropdown-item ${this.selectedPace === opt.value ? 'selected' : ''}" data-val="${this.escapeHtml(opt.value)}">${this.escapeHtml(opt.label)}</div>
                `).join('')}
            `;
            this.paceDropdown.querySelectorAll('.tts-dropdown-item').forEach(item => {
                item.addEventListener('click', () => {
                    this.selectedPace = item.dataset.val;
                    this.updateChipLabel(this.paceChip, this.paceChipLabel, 'Pace', this.selectedPace);
                    this.paceDropdown.classList.remove('show');
                    this.renderDirectorDropdowns();
                });
            });
        }

        if (this.accentDropdown) {
            this.accentDropdown.innerHTML = `
                <div class="tts-dropdown-item ${!this.selectedAccent ? 'selected' : ''}" data-val="">None (Default)</div>
                ${TTSManager.ACCENT_OPTIONS.map(opt => `
                    <div class="tts-dropdown-item ${this.selectedAccent === opt.value ? 'selected' : ''}" data-val="${this.escapeHtml(opt.value)}">${this.escapeHtml(opt.label)}</div>
                `).join('')}
            `;
            this.accentDropdown.querySelectorAll('.tts-dropdown-item').forEach(item => {
                item.addEventListener('click', () => {
                    this.selectedAccent = item.dataset.val;
                    this.updateChipLabel(this.accentChip, this.accentChipLabel, 'Accent', this.selectedAccent);
                    this.accentDropdown.classList.remove('show');
                    this.renderDirectorDropdowns();
                });
            });
        }
    }

    renderVoiceFilterMenu() {
        if (!this.voiceFilterMenu) return;
        const availableTraits = TTSManager.VOICE_TRAITS.filter(t => t !== 'All');

        this.voiceFilterMenu.innerHTML = `
            <div class="tts-filter-menu-header">
                <span>Filter Traits (${this.selectedVoiceTraits.size})</span>
                ${this.selectedVoiceTraits.size > 0 ? '<button type="button" class="tts-filter-reset-btn" id="tts-filter-reset-btn">Clear all</button>' : ''}
            </div>
            ${availableTraits.map(trait => {
                const isChecked = this.selectedVoiceTraits.has(trait);
                return `
                    <label class="tts-filter-item-checkbox">
                        <input type="checkbox" data-trait="${trait}" ${isChecked ? 'checked' : ''} />
                        <span>${trait}</span>
                    </label>
                `;
            }).join('')}
        `;

        const resetBtn = this.voiceFilterMenu.querySelector('#tts-filter-reset-btn');
        if (resetBtn) {
            resetBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.selectedVoiceTraits.clear();
                if (this.voiceFilterBtn) this.voiceFilterBtn.classList.remove('active');
                this.renderVoiceFilterMenu();
                this.renderVoiceCards();
            });
        }

        this.voiceFilterMenu.querySelectorAll('input[type="checkbox"]').forEach(input => {
            input.addEventListener('change', (e) => {
                e.stopPropagation();
                const trait = input.dataset.trait;
                if (input.checked) {
                    this.selectedVoiceTraits.add(trait);
                } else {
                    this.selectedVoiceTraits.delete(trait);
                }

                if (this.voiceFilterBtn) {
                    if (this.selectedVoiceTraits.size > 0) {
                        this.voiceFilterBtn.classList.add('active');
                    } else {
                        this.voiceFilterBtn.classList.remove('active');
                    }
                }
                this.renderVoiceFilterMenu();
                this.renderVoiceCards();
            });
        });
    }

    updateChipLabel(chipEl, labelEl, defaultText, currentValue) {
        if (!chipEl || !labelEl) return;
        if (currentValue) {
            chipEl.classList.add('active-value');
            const foundLabel = this.findOptionLabel(defaultText, currentValue);
            labelEl.textContent = `${defaultText}: ${foundLabel}`;
        } else {
            chipEl.classList.remove('active-value');
            labelEl.textContent = defaultText;
        }
    }

    findOptionLabel(type, val) {
        let list = [];
        if (type === 'Style') list = TTSManager.STYLE_OPTIONS;
        else if (type === 'Pace') list = TTSManager.PACE_OPTIONS;
        else if (type === 'Accent') list = TTSManager.ACCENT_OPTIONS;
        const item = list.find(o => o.value === val);
        return item ? item.label : val.slice(0, 14);
    }

    renderVoiceCards() {
        if (!this.voiceCardsContainer) return;

        const currentSelected = this.activeSpeakerTarget === '2' ? this.selectedVoice2 : this.selectedVoice1;
        let voices = TTSManager.VOICES;

        if (this.selectedVoiceTraits.size > 0) {
            const traitsArr = Array.from(this.selectedVoiceTraits).map(t => t.toLowerCase());
            voices = voices.filter(v => {
                return traitsArr.every(trait =>
                    v.tone.toLowerCase().includes(trait) ||
                    v.pitch.toLowerCase().includes(trait) ||
                    v.gender.toLowerCase() === trait
                );
            });
        }

        if (this.voiceSearchQuery) {
            voices = voices.filter(v =>
                v.name.toLowerCase().includes(this.voiceSearchQuery) ||
                v.tone.toLowerCase().includes(this.voiceSearchQuery) ||
                v.pitch.toLowerCase().includes(this.voiceSearchQuery) ||
                v.gender.toLowerCase().includes(this.voiceSearchQuery)
            );
        }

        if (voices.length === 0) {
            this.voiceCardsContainer.innerHTML = `
                <div style="padding: 16px; text-align: center; color: var(--lumina-text-muted, #94a3b8); font-size: 0.8rem;">
                    No voices matching the selected filters.
                </div>
            `;
            return;
        }

        this.voiceCardsContainer.innerHTML = voices.map(v => {
            const isSelected = v.name === currentSelected;
            return `
                <div class="tts-voice-card ${isSelected ? 'selected' : ''}" data-voice-name="${v.name}">
                    <button type="button" class="tts-voice-card-content" aria-label="${v.name}">
                        <div class="tts-voice-row-primary">
                            <span class="tts-voice-name">${v.name}</span>
                            ${isSelected ? '<span class="tts-voice-current-badge">Current</span>' : ''}
                        </div>
                        <div class="tts-voice-traits">
                            <span class="tts-trait-chip">${v.tone}</span>
                            <span class="tts-trait-chip">${v.pitch}</span>
                            <span class="tts-trait-chip">${v.gender}</span>
                        </div>
                    </button>
                    <button type="button" class="tts-voice-play-sample-btn" data-voice-name="${v.name}" title="Play voice sample">
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
                            <polygon points="5 3 19 12 5 21 5 3"></polygon>
                        </svg>
                    </button>
                </div>
            `;
        }).join('');

        this.voiceCardsContainer.querySelectorAll('.tts-voice-card-content').forEach(card => {
            card.addEventListener('click', () => {
                const voiceName = card.closest('.tts-voice-card').dataset.voiceName;
                if (this.activeSpeakerTarget === '2') {
                    this.selectedVoice2 = voiceName;
                    if (this.s2Badge) this.s2Badge.textContent = voiceName;
                } else {
                    this.selectedVoice1 = voiceName;
                    if (this.s1Badge) this.s1Badge.textContent = voiceName;
                }
                this.updateActiveVoiceHeaderLabel();
                this.renderVoiceCards();
            });
        });

        this.voiceCardsContainer.querySelectorAll('.tts-voice-play-sample-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const voiceName = btn.dataset.voiceName;
                await this.playVoiceSample(voiceName, btn);
            });
        });
    }

    updateActiveVoiceHeaderLabel() {
        if (!this.activeVoiceLabel) return;
        if (this.currentMode === 'multi') {
            this.activeVoiceLabel.textContent = `Voice: ${this.selectedVoice1} & ${this.selectedVoice2}`;
        } else {
            this.activeVoiceLabel.textContent = `Voice: ${this.selectedVoice1}`;
        }
    }

    async playVoiceSample(voiceName, btnEl) {
        try {
            document.querySelectorAll('.tts-voice-play-sample-btn').forEach(b => b.classList.remove('playing'));
            btnEl.classList.add('playing');
            this.showStatus(`Loading sample for ${voiceName}...`, false);

            const result = await TTSManager.previewVoiceSample(voiceName);
            this.sampleAudioElement.src = result.audioUrl;
            this.sampleAudioElement.load();
            await this.sampleAudioElement.play();
            this.showStatus(`Playing sample for ${voiceName}`, false);
        } catch (err) {
            btnEl.classList.remove('playing');
            this.showStatus(`Could not preview ${voiceName}: ${err.message}`, true);
        }
    }

    async loadRecordings() {
        try {
            this.recordings = await TTSDB.getAllRecordings();
            this.renderRecordingsList();
        } catch (err) {
            console.error('Failed to load recordings from TTSDB:', err);
        }
    }

    renderRecordingsList() {
        if (!this.recordingsListEl) return;

        let filtered = this.recordings;
        if (this.activeFilter === 'starred') {
            filtered = filtered.filter(r => r.starred);
        }
        if (this.searchQuery) {
            filtered = filtered.filter(r =>
                (r.title && r.title.toLowerCase().includes(this.searchQuery)) ||
                (r.script && r.script.toLowerCase().includes(this.searchQuery)) ||
                (r.voice && r.voice.toLowerCase().includes(this.searchQuery))
            );
        }

        if (this.countLabel) {
            this.countLabel.textContent = `Recordings (${filtered.length})`;
        }

        if (filtered.length === 0) {
            this.recordingsListEl.innerHTML = `
                <div class="notes-list-empty">
                    <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity: 0.4; margin-bottom: 4px;">
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                    </svg>
                    <span>${this.searchQuery ? 'No audio matching search.' : 'No audio recordings yet.'}</span>
                </div>
            `;
            return;
        }

        this.recordingsListEl.innerHTML = filtered.map(rec => {
            const isActive = rec.id === this.currentRecordingId ? 'active' : '';
            const starColor = rec.starred ? '#f59e0b' : 'currentColor';
            const voiceLabel = rec.mode === 'multi' ? `${rec.voice} + ${rec.voice2}` : rec.voice;
            const timeAgo = this.formatRelativeTime(rec.createdAt);
            const durationStr = this.formatTime(rec.durationSeconds || 0);

            return `
                <div class="tts-recording-item ${isActive}" data-id="${rec.id}">
                    <div class="tts-rec-header">
                        <span class="tts-rec-title" title="${this.escapeHtml(rec.title)}">${this.escapeHtml(rec.title)}</span>
                        <div class="tts-rec-quick-actions">
                            <button type="button" class="notes-qa-btn tts-item-star-btn" data-id="${rec.id}" title="${rec.starred ? 'Unstar' : 'Star'}">
                                <svg viewBox="0 0 24 24" width="12" height="12" fill="${rec.starred ? '#f59e0b' : 'none'}" stroke="${starColor}" stroke-width="2">
                                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                                </svg>
                            </button>
                            <button type="button" class="notes-qa-btn tts-item-delete-btn" data-id="${rec.id}" title="Delete">
                                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                            </button>
                        </div>
                    </div>
                    <div class="tts-rec-snippet">${this.escapeHtml(rec.script || '')}</div>
                    <div class="tts-rec-meta">
                        <span class="tts-rec-voice-tag">${this.escapeHtml(voiceLabel)}</span>
                        <span class="tts-rec-duration">${durationStr}</span>
                        <span class="tts-rec-time">${timeAgo}</span>
                    </div>
                </div>
            `;
        }).join('');

        this.recordingsListEl.querySelectorAll('.tts-recording-item').forEach(el => {
            el.addEventListener('click', (e) => {
                if (e.target.closest('.tts-rec-quick-actions')) return;
                const id = el.dataset.id;
                this.selectRecording(id);
                if (this.page) {
                    this.page.classList.add('show-studio');
                }
            });
        });

        this.recordingsListEl.querySelectorAll('.tts-item-star-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                await TTSDB.toggleStar(id);
                await this.loadRecordings();
            });
        });

        this.recordingsListEl.querySelectorAll('.tts-item-delete-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                await this.deleteRecording(id);
            });
        });
    }

    renderScriptViewer(script, mode, speaker1, speaker2) {
        if (!this.viewScriptBody) return;
        const text = script || '';
        
        if (mode === 'multi') {
            const lines = text.split('\n');
            const html = lines.map(line => {
                const trimmed = line.trim();
                if (!trimmed) return '';
                
                const match = trimmed.match(/^([^:]+):\s*(.*)$/);
                if (match) {
                    const spk = this.escapeHtml(match[1].trim());
                    let content = this.escapeHtml(match[2]);
                    content = content.replace(/\[(.*?)\]/g, '<span class="tts-view-tag">[$1]</span>');
                    return `<div class="tts-view-dialogue-line"><span class="tts-view-speaker-name">${spk}:</span>${content}</div>`;
                } else {
                    let content = this.escapeHtml(trimmed);
                    content = content.replace(/\[(.*?)\]/g, '<span class="tts-view-tag">[$1]</span>');
                    return `<div class="tts-view-dialogue-line">${content}</div>`;
                }
            }).filter(Boolean).join('');
            this.viewScriptBody.innerHTML = html || '<div class="tts-view-dialogue-line">No transcript content.</div>';
        } else {
            let content = this.escapeHtml(text);
            content = content.replace(/\[(.*?)\]/g, '<span class="tts-view-tag">[$1]</span>');
            this.viewScriptBody.innerHTML = `<div class="tts-view-dialogue-line">${content}</div>`;
        }
    }

    async selectRecording(recOrId) {
        if (!recOrId) return;

        let rec = recOrId;
        if (typeof recOrId === 'string') {
            rec = await TTSDB.getRecording(recOrId);
        }
        if (!rec) return;

        this.currentRecordingId = rec.id;
        this.currentAudioBlob = rec.audioBlob || null;
        this.currentWavBlob = rec.audioBlob || null;
        this.currentMode = rec.mode || 'single';

        if (this.modeSwitcher) this.modeSwitcher.style.display = 'none';
        if (this.voicePickerWrapper) this.voicePickerWrapper.style.display = 'none';
        if (this.generateBtn) this.generateBtn.style.display = 'none';

        if (this.viewInfoBadge) this.viewInfoBadge.style.display = 'flex';
        if (this.viewActions) this.viewActions.style.display = 'flex';
        if (this.viewContainer) this.viewContainer.style.display = 'flex';
        if (this.composeContainer) this.composeContainer.style.display = 'none';

        if (this.viewBadgeVoice) {
            this.viewBadgeVoice.textContent = rec.mode === 'multi' ? `${rec.voice} & ${rec.voice2}` : (rec.voice || 'Achernar');
        }
        if (this.viewBadgeMode) {
            this.viewBadgeMode.textContent = rec.mode === 'multi' ? 'Multi-Speaker' : 'Single Speaker';
        }
        if (this.viewBadgeDate) {
            this.viewBadgeDate.textContent = this.formatRelativeTime(rec.createdAt);
        }

        if (this.heroTitle) this.heroTitle.value = rec.title || 'Untitled Audio';

        this.renderScriptViewer(rec.script, rec.mode, rec.speaker1, rec.speaker2);

        if (rec.audioBlob) {
            this.currentRecordingDuration = rec.durationSeconds || 0;
            if (this.durationTimeEl) {
                this.durationTimeEl.textContent = this.formatTime(this.currentRecordingDuration);
            }
            const url = URL.createObjectURL(rec.audioBlob);
            this.audioElement.src = url;
            this.audioElement.load();
        }

        this.showStatus('', false);
        this.renderRecordingsList();

        if (typeof LuminaViewManager !== 'undefined' && typeof LuminaViewManager.updateUrl === 'function') {
            LuminaViewManager.updateUrl('tts', { recordingId: rec.id });
        }

        if (this.page) {
            this.page.classList.add('show-studio');
        }
    }

    resetStudioForNew() {
        this.currentRecordingId = null;
        this.currentAudioBlob = null;
        this.currentWavBlob = null;
        this.audioElement.pause();
        this.audioElement.src = '';

        if (typeof LuminaViewManager !== 'undefined' && typeof LuminaViewManager.updateUrl === 'function') {
            LuminaViewManager.updateUrl('tts', {});
        }

        if (this.modeSwitcher) this.modeSwitcher.style.display = 'flex';
        if (this.voicePickerWrapper) this.voicePickerWrapper.style.display = 'block';
        if (this.generateBtn) this.generateBtn.style.display = 'inline-flex';

        if (this.viewInfoBadge) this.viewInfoBadge.style.display = 'none';
        if (this.viewActions) this.viewActions.style.display = 'none';
        if (this.viewContainer) this.viewContainer.style.display = 'none';
        if (this.composeContainer) this.composeContainer.style.display = 'flex';

        if (this.scriptInput) {
            this.scriptInput.value = '';
            this.scriptInput.focus();
        }
        if (this.profileInput) this.profileInput.value = '';
        this.audioProfile = '';
        this.selectedStyle = '';
        this.selectedPace = '';
        this.selectedAccent = '';

        this.updateChipLabel(this.styleChip, this.styleChipLabel, 'Style', '');
        this.updateChipLabel(this.paceChip, this.paceChipLabel, 'Pace', '');
        this.updateChipLabel(this.accentChip, this.accentChipLabel, 'Accent', '');
        this.updateActiveVoiceHeaderLabel();

        this.renderDirectorDropdowns();
        this.renderVoiceCards();

        this.showStatus('Ready to compose new audio speech.', false);
        this.renderRecordingsList();

        if (this.page) {
            this.page.classList.add('show-studio');
        }
    }

    duplicateCurrent() {
        if (!this.currentRecordingId) return;

        TTSDB.getRecording(this.currentRecordingId).then(rec => {
            if (!rec) return;
            this.resetStudioForNew();

            this.currentMode = rec.mode || 'single';
            this.modeBtns.forEach(btn => {
                btn.classList.toggle('active', btn.dataset.mode === this.currentMode);
            });
            this.updateModeUI();

            this.selectedVoice1 = rec.voice || 'Kore';
            this.selectedVoice2 = rec.voice2 || 'Puck';
            this.selectedStyle = rec.style || '';
            this.selectedPace = rec.pace || '';
            this.selectedAccent = rec.accent || '';
            this.audioProfile = rec.audioProfile || '';

            if (this.scriptInput) this.scriptInput.value = rec.script || '';
            if (this.profileInput) this.profileInput.value = rec.audioProfile || '';
            if (this.speaker1Input) this.speaker1Input.value = rec.speaker1 || 'Joe';
            if (this.speaker2Input) this.speaker2Input.value = rec.speaker2 || 'Jane';

            this.updateChipLabel(this.styleChip, this.styleChipLabel, 'Style', this.selectedStyle);
            this.updateChipLabel(this.paceChip, this.paceChipLabel, 'Pace', this.selectedPace);
            this.updateChipLabel(this.accentChip, this.accentChipLabel, 'Accent', this.selectedAccent);
            this.updateActiveVoiceHeaderLabel();

            this.renderDirectorDropdowns();
            this.renderVoiceCards();
            this.showStatus('Loaded as new editable draft.', false);
        });
    }

    async deleteRecording(id) {
        await TTSDB.deleteRecording(id);
        if (this.currentRecordingId === id) {
            this.resetStudioForNew();
        }
        await this.loadRecordings();
    }

    setMode(mode) {
        this.currentMode = mode;
        this.modeBtns.forEach(btn => {
            if (btn.dataset.mode === mode) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        if (mode === 'multi') {
            if (this.speakerTabSwitch) this.speakerTabSwitch.style.display = 'flex';
            if (this.speakerNamesGroup) this.speakerNamesGroup.style.display = 'grid';
        } else {
            if (this.speakerTabSwitch) this.speakerTabSwitch.style.display = 'none';
            if (this.speakerNamesGroup) this.speakerNamesGroup.style.display = 'none';
            this.activeSpeakerTarget = '1';
        }
        this.updateActiveVoiceHeaderLabel();
        this.renderVoiceCards();
    }

    insertTagAtCursor(tag) {
        if (!this.scriptInput) return;
        const input = this.scriptInput;
        const start = input.selectionStart || 0;
        const end = input.selectionEnd || 0;
        const text = input.value;
        const tagToInsert = `${tag} `;

        input.value = text.substring(0, start) + tagToInsert + text.substring(end);
        input.focus();
        input.selectionStart = input.selectionEnd = start + tagToInsert.length;
    }

    applyPreset(presetKey) {
        if (!this.scriptInput) return;

        switch (presetKey) {
            case 'podcast':
                this.setMode('multi');
                if (this.speaker1Input) this.speaker1Input.value = 'Joe';
                if (this.speaker2Input) this.speaker2Input.value = 'Jane';
                this.selectedVoice1 = 'Kore';
                this.selectedVoice2 = 'Puck';
                if (this.s1Badge) this.s1Badge.textContent = 'Kore';
                if (this.s2Badge) this.s2Badge.textContent = 'Puck';
                this.audioProfile = 'Engaging tech podcast hosts sharing cutting-edge AI insights with genuine enthusiasm.';
                this.selectedStyle = 'Enthusiastic and energetic';
                this.selectedPace = 'Steady, conversational pace';
                this.selectedAccent = 'Standard English';
                this.scriptInput.value = `Joe: [excitedly] Welcome back to the show, everyone! Jane, did you see the new speech synthesis update today?\nJane: [laughs] I certainly did Joe! [amazed] The natural emotional inflections and control tags are genuinely impressive.\nJoe: Exactly. It completely changes how we produce audiobooks and podcasts!`;
                break;

            case 'story':
                this.setMode('single');
                this.selectedVoice1 = 'Enceladus';
                if (this.s1Badge) this.s1Badge.textContent = 'Enceladus';
                this.audioProfile = 'Mysterious, atmospheric storyteller around a crackling campfire.';
                this.selectedStyle = 'Mysterious, cinematic, intimate storyteller';
                this.selectedPace = 'Slow tempo with dramatic pauses';
                this.selectedAccent = 'British English accent as heard in London';
                this.scriptInput.value = `[whispers] Listen closely... [short pause]\nThe old grandfather clock in the hallway struck midnight, its hollow chimes echoing through the empty corridors.\n[gasp] Then, from behind the sealed oak door, quiet footsteps sounded...`;
                break;

            case 'news':
                this.setMode('single');
                this.selectedVoice1 = 'Charon';
                if (this.s1Badge) this.s1Badge.textContent = 'Charon';
                this.audioProfile = 'Authoritative, clear and professional morning news anchor.';
                this.selectedStyle = 'Authoritative, clear, and informative';
                this.selectedPace = 'Steady, conversational pace';
                this.selectedAccent = 'Standard English';
                this.scriptInput.value = `Good morning. Here are the top headlines for today.\nMarkets reached historic highs this morning following breakthroughs in artificial intelligence technology and renewable energy adoption.`;
                break;

            case 'influencer':
                this.setMode('single');
                this.selectedVoice1 = 'Zephyr';
                if (this.s1Badge) this.s1Badge.textContent = 'Zephyr';
                this.audioProfile = 'High-energy, charismatic tech influencer with contagious optimism.';
                this.selectedStyle = 'Bright, cheerful, and sunny with a vocal smile';
                this.selectedPace = 'Fast-paced, rapid energetic delivery';
                this.selectedAccent = 'General American accent';
                this.scriptInput.value = `[excitedly] What is up, everyone! You will NOT believe what just dropped today!\n[laughs] Drop a like, subscribe, and let's dive right into the demo!`;
                break;
        }

        if (this.profileInput) this.profileInput.value = this.audioProfile;
        this.updateChipLabel(this.styleChip, this.styleChipLabel, 'Style', this.selectedStyle);
        this.updateChipLabel(this.paceChip, this.paceChipLabel, 'Pace', this.selectedPace);
        this.updateChipLabel(this.accentChip, this.accentChipLabel, 'Accent', this.selectedAccent);
        this.renderDirectorDropdowns();
        this.renderVoiceCards();
    }

    async handleGenerate() {
        if (this.isGenerating) return;

        const script = this.scriptInput ? this.scriptInput.value.trim() : '';
        if (!script) {
            this.showStatus('Please enter text or a transcript to generate speech.', true);
            if (this.scriptInput) this.scriptInput.focus();
            return;
        }

        this.isGenerating = true;
        this.updateGenerateButtonUI(true);
        this.showStatus('Synthesizing speech with Gemini 3.1 Flash TTS...', false);

        try {
            const voice1 = this.selectedVoice1 || 'Kore';
            const voice2 = this.selectedVoice2 || 'Puck';
            const speaker1 = this.speaker1Input ? this.speaker1Input.value : 'Joe';
            const speaker2 = this.speaker2Input ? this.speaker2Input.value : 'Jane';
            const audioProfile = this.profileInput ? this.profileInput.value : this.audioProfile;

            const result = await TTSManager.generateSpeech({
                mode: this.currentMode,
                script: script,
                voice: voice1,
                voice2: voice2,
                speaker1: speaker1,
                speaker2: speaker2,
                audioProfile: audioProfile,
                style: this.selectedStyle,
                pace: this.selectedPace,
                accent: this.selectedAccent
            });

            this.currentAudioBlob = result.blob;
            this.currentWavBlob = result.wavBlob;
            this.currentRecordingDuration = result.durationSeconds;
            this.audioElement.src = result.audioUrl;
            this.audioElement.load();
            if (this.durationTimeEl) {
                this.durationTimeEl.textContent = this.formatTime(result.durationSeconds);
            }

            const savedItem = await TTSDB.saveRecording({
                title: script.split('\n')[0].replace(/\[.*?\]/g, '').trim().slice(0, 45) || 'Audio Recording',
                script: script,
                mode: this.currentMode,
                voice: voice1,
                voice2: voice2,
                speaker1: speaker1,
                speaker2: speaker2,
                audioProfile: audioProfile,
                style: this.selectedStyle,
                pace: this.selectedPace,
                accent: this.selectedAccent,
                durationSeconds: result.durationSeconds,
                audioBlob: result.blob
            });

            this.currentRecordingId = savedItem.id;
            await this.loadRecordings();
            await this.selectRecording(savedItem);

            this.showStatus(`Speech generated & saved (${result.durationSeconds.toFixed(1)}s)`, false);

            try {
                await this.audioElement.play();
            } catch (_) {}

        } catch (error) {
            console.error('TTS generation failed:', error);
            this.showStatus(`Error: ${error.message || 'Failed to generate audio'}`, true);
        } finally {
            this.isGenerating = false;
            this.updateGenerateButtonUI(false);
        }
    }

    togglePlayPause() {
        if (!this.audioElement.src) return;
        if (this.audioElement.paused) {
            this.audioElement.play().catch(() => {});
        } else {
            this.audioElement.pause();
        }
    }

    updatePlayerUI() {
        if (this.playIcon && this.pauseIcon) {
            if (this.isPlaying) {
                this.playIcon.style.display = 'none';
                this.pauseIcon.style.display = 'block';
            } else {
                this.playIcon.style.display = 'block';
                this.pauseIcon.style.display = 'none';
            }
        }
    }

    updateGenerateButtonUI(loading) {
        if (this.generateBtn) {
            this.generateBtn.disabled = loading;
        }
        if (this.generateSpinner) {
            this.generateSpinner.style.display = loading ? 'inline-block' : 'none';
        }
        if (this.generateBtnText) {
            this.generateBtnText.textContent = loading ? 'Generating...' : 'Generate';
        }
    }

    showStatus(msg, isError = false) {
        if (this.statusText) {
            this.statusText.textContent = msg;
            this.statusText.className = 'tts-status-text';
            if (isError) {
                this.statusText.classList.add('error');
            } else if (msg) {
                this.statusText.classList.add('success');
            }
        }
    }

    formatTime(seconds) {
        if (isNaN(seconds) || seconds < 0) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }

    formatRelativeTime(timestamp) {
        if (!timestamp) return '';
        const now = Date.now();
        const diff = now - timestamp;
        const seconds = Math.floor(diff / 1000);
        if (seconds < 60) return 'Just now';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        if (days < 7) return `${days}d ago`;
        return new Date(timestamp).toLocaleDateString();
    }

    escapeHtml(str) {
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
    window.TTSPanel = TTSPanel;
}
