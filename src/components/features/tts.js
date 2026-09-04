import { TTSDB, TTSManager } from '../../db/tts_manager.js';

export function renderVoiceCardHTML(voice, isSelected = false) {
    const accent = voice.accent || 'US';
    const gender = voice.gender || 'neutral';
    const desc = voice.description || '';
    
    return `
        <div class="nexus-voice-card${isSelected ? ' selected' : ''}" data-voice-id="${voice.id}">
            <div class="nexus-voice-card-header">
                <span class="nexus-voice-name">${voice.name}</span>
                <span class="nexus-voice-badge">${accent.toUpperCase()}</span>
            </div>
            <div class="nexus-voice-card-body">
                <span class="nexus-voice-gender">${gender}</span>
                ${desc ? `<p class="nexus-voice-desc">${desc}</p>` : ''}
            </div>
        </div>
    `;
}

export function filterVoices(voices, { search = '', gender = 'all', accent = 'all' } = {}) {
    if (!Array.isArray(voices)) return [];
    return voices.filter(v => {
        if (gender !== 'all' && v.gender !== gender) return false;
        if (accent !== 'all' && v.accent !== accent) return false;
        if (search) {
            const query = search.toLowerCase();
            const matchName = v.name && v.name.toLowerCase().includes(query);
            const matchDesc = v.description && v.description.toLowerCase().includes(query);
            if (!matchName && !matchDesc) return false;
        }
        return true;
    });
}

export function getDefaultTTSPresets() {
    return [
        { id: 'preset_story', name: 'Storyteller', rate: 0.95, pitch: 1.0, voice: 'en-US-Neural2-F' },
        { id: 'preset_fast', name: 'Fast Review', rate: 1.35, pitch: 1.05, voice: 'en-US-Neural2-J' },
        { id: 'preset_news', name: 'News Broadcaster', rate: 1.05, pitch: 1.0, voice: 'en-US-Neural2-D' }
    ];
}

export class TTSPanel {
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
        this.isPracticeMode = false;
        this.currentActiveSentenceEnd = null;
        this.activeSpeakerTarget = '1';
        this.selectedVoice1 = 'Kore';
        this.selectedVoice2 = 'Puck';
        this.selectedStyle = '';
        this.selectedPace = '';
        this.selectedAccent = '';
        this.audioProfile = '';
        this.loadLastVoiceSettings();
        this.initDOMElements();
        this.bindEvents();
        this.renderDirectorDropdowns();
        this.renderVoiceFilterMenu();
        this.renderVoiceCards();
        this.renderCustomPresets();
    }
    loadLastVoiceSettings() {
        try {
            const raw = localStorage.getItem('nexus_tts_last_settings');
            if (raw) {
                const settings = JSON.parse(raw);
                if (settings.mode) this.currentMode = settings.mode;
                if (settings.voice1) this.selectedVoice1 = settings.voice1;
                if (settings.voice2) this.selectedVoice2 = settings.voice2;
                if (settings.style !== undefined) this.selectedStyle = settings.style;
                if (settings.pace !== undefined) this.selectedPace = settings.pace;
                if (settings.accent !== undefined) this.selectedAccent = settings.accent;
                if (settings.audioProfile !== undefined) this.audioProfile = settings.audioProfile;
            }
        } catch (_) {}
    }
    saveLastVoiceSettings() {
        try {
            const settings = {
                mode: this.currentMode,
                voice1: this.selectedVoice1,
                voice2: this.selectedVoice2,
                speaker1: this.speaker1Input ? this.speaker1Input.value : 'Joe',
                speaker2: this.speaker2Input ? this.speaker2Input.value : 'Jane',
                style: this.selectedStyle,
                pace: this.selectedPace,
                accent: this.selectedAccent,
                audioProfile: this.profileInput ? this.profileInput.value : this.audioProfile
            };
            localStorage.setItem('nexus_tts_last_settings', JSON.stringify(settings));
        } catch (_) {}
    }
    async init(recordingId = null) {
        this.initDOMElements();
        this.renderDirectorDropdowns();
        this.renderVoiceFilterMenu();
        this.renderVoiceCards();
        this.renderCustomPresets();
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
        this.customPresetsGrid = document.getElementById('tts-custom-presets-grid');
        this.savePresetBtn = document.getElementById('tts-save-preset-btn');
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
        this.editCurrentBtn = document.getElementById('tts-edit-current-btn');
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
        this.practiceModeBtn = document.getElementById('tts-practice-mode-btn');
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
                this.saveLastVoiceSettings();
            });
        });
        if (this.duplicateBtn) {
            this.duplicateBtn.addEventListener('click', () => this.duplicateCurrent());
        }
        if (this.editCurrentBtn) {
            this.editCurrentBtn.addEventListener('click', () => this.duplicateCurrent());
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
                this.saveLastVoiceSettings();
            });
        }
        if (this.speaker1Input) {
            this.speaker1Input.addEventListener('input', () => this.saveLastVoiceSettings());
        }
        if (this.speaker2Input) {
            this.speaker2Input.addEventListener('input', () => this.saveLastVoiceSettings());
        }
        if (this.savePresetBtn) {
            this.savePresetBtn.addEventListener('click', () => this.handleSaveAsPreset());
        }
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
        if (this.practiceModeBtn) {
            this.practiceModeBtn.addEventListener('click', () => {
                this.isPracticeMode = !this.isPracticeMode;
                this.practiceModeBtn.classList.toggle('active', this.isPracticeMode);
                if (this.isPracticeMode) {
                    this.showStatus('Practice Mode ON: Audio will pause after each sentence.', false);
                } else {
                    this.showStatus('Practice Mode OFF: Continuous playback.', false);
                }
            });
        }
        if (this.heroTitle) {
            this.heroTitle.addEventListener('change', async () => {
                if (this.currentRecordingId) {
                    const newTitle = this.heroTitle.value.trim() || 'Untitled Audio';
                    await TTSDB.updateRecordingTitle(this.currentRecordingId, newTitle);
                    await this.loadRecordings();
                    if (typeof NexusSync !== 'undefined' && typeof NexusSync.triggerDebouncedSync === 'function') {
                        NexusSync.triggerDebouncedSync();
                    }
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
            this.highlightActiveSentence(this.audioElement.currentTime);
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
                    this.saveLastVoiceSettings();
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
                    this.saveLastVoiceSettings();
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
                    this.saveLastVoiceSettings();
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
                <div style="padding: 16px; text-align: center; color: var(--nexus-text-muted, #94a3b8); font-size: 0.8rem;">
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
                this.saveLastVoiceSettings();
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
                if (typeof NexusSync !== 'undefined' && typeof NexusSync.triggerDebouncedSync === 'function') {
                    NexusSync.triggerDebouncedSync();
                }
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
    renderScriptViewer(script, mode, speaker1, speaker2, alignment = null) {
        if (!this.viewScriptBody) return;
        const text = script || '';
        this.currentAlignment = alignment;
        if (mode === 'multi') {
            const lines = text.split('\n');
            const html = lines.map(line => {
                const trimmed = line.trim();
                if (!trimmed) return '';
                const match = trimmed.match(/^([^:]+):\s*(.*)$/);
                if (match) {
                    const spk = this.escapeHtml(match[1].trim());
                    const rawContent = match[2];
                    const contentHtml = this.formatScriptWithSentences(rawContent, alignment);
                    return `<div class="tts-view-dialogue-line"><span class="tts-view-speaker-name">${spk}:</span>${contentHtml}</div>`;
                } else {
                    const contentHtml = this.formatScriptWithSentences(trimmed, alignment);
                    return `<div class="tts-view-dialogue-line">${contentHtml}</div>`;
                }
            }).filter(Boolean).join('');
            this.viewScriptBody.innerHTML = html || '<div class="tts-view-dialogue-line">No transcript content.</div>';
        } else {
            const contentHtml = this.formatScriptWithSentences(text, alignment);
            this.viewScriptBody.innerHTML = `<div class="tts-view-dialogue-line">${contentHtml}</div>`;
        }
        this.bindSentenceClickEvents();
    }
    formatScriptWithSentences(rawText, alignment = null) {
        if (!rawText) return '';
        let processedText = rawText
            .replace(/\b(p|a)\.m\./gi, '$1_m_dot_')
            .replace(/\b(e\.g|i\.e|vs|etc|mr|mrs|ms|dr|prof)\./gi, '$1_dot_')
            .replace(/(\d+)\.(\d+)/g, '$1_numdot_$2');
        const sentenceRegex = /[^.!?:\n]+[.!?:]+["'”’]?|[^.!?:\n]+$/g;
        const rawMatches = processedText.match(sentenceRegex) || [processedText];
        const sentences = rawMatches.map(s => {
            return s
                .replace(/_m_dot_/gi, '.m.')
                .replace(/_dot_/gi, '.')
                .replace(/_numdot_/g, '.')
                .trim();
        }).filter(Boolean);
        const segments = (alignment && Array.isArray(alignment.segments)) ? alignment.segments : [];
        const words = (alignment && Array.isArray(alignment.words)) ? alignment.words : [];
        // 1. Nếu có word timestamps chi tiết từ Groq: khớp chính xác từng từ của mỗi câu
        if (words.length > 0) {
            let wordCursor = 0;
            return sentences.map((sent, sIdx) => {
                const cleanWords = sent.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
                let start = 0;
                let end = 0;
                if (cleanWords.length > 0 && wordCursor < words.length) {
                    start = words[wordCursor].start || 0;
                    const lastWord = cleanWords[cleanWords.length - 1];
                    // Tìm từ kết thúc câu trong mảng words từ vị trí wordCursor trở đi
                    let foundEndIdx = -1;
                    const searchLimit = Math.min(words.length, wordCursor + cleanWords.length + 5);
                    for (let i = wordCursor; i < searchLimit; i++) {
                        const wClean = (words[i].word || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                        if (wClean === lastWord) {
                            foundEndIdx = i;
                        }
                    }
                    if (foundEndIdx !== -1) {
                        end = words[foundEndIdx].end || (start + 1);
                        wordCursor = foundEndIdx + 1;
                    } else {
                        const fallbackIdx = Math.min(words.length - 1, wordCursor + cleanWords.length - 1);
                        end = words[fallbackIdx].end || (start + 1.5);
                        wordCursor = fallbackIdx + 1;
                    }
                } else if (segments.length > 0) {
                    end = segments[segments.length - 1].end || 0;
                }
                // Với câu cuối cùng, lấy mốc kết thúc của từ cuối cùng hoặc audio duration
                if (sIdx === sentences.length - 1 && words.length > 0) {
                    end = Math.max(end, words[words.length - 1].end || end);
                }
                let escapedSent = this.escapeHtml(sent);
                escapedSent = escapedSent.replace(/\[(.*?)\]/g, '<span class="tts-view-tag">[$1]</span>');
                return `<span class="tts-sentence-segment" data-start="${start}" data-end="${end}" title="Click to play (${this.formatTime(start)})">${escapedSent}</span>`;
            }).join(' ');
        }
        // 2. Nếu có segments từ Groq
        if (segments.length > 0) {
            // Khi segments được chia thành nhiều đoạn
            if (segments.length > 1 && sentences.length === segments.length) {
                return sentences.map((sent, idx) => {
                    const seg = segments[idx];
                    const start = typeof seg.start === 'number' ? seg.start : 0;
                    const end = typeof seg.end === 'number' ? seg.end : (start + 1);
                    let escapedSent = this.escapeHtml(sent);
                    escapedSent = escapedSent.replace(/\[(.*?)\]/g, '<span class="tts-view-tag">[$1]</span>');
                    return `<span class="tts-sentence-segment" data-start="${start}" data-end="${end}" title="Click to play (${this.formatTime(start)})">${escapedSent}</span>`;
                }).join(' ');
            }
            // Nếu Groq chỉ trả về 1 segment bao trùm cả bài (0s -> 25s) hoặc số segments không khớp:
            // Phân bổ thời gian chính xác theo độ dài ký tự của từng câu
            const totalDuration = segments[segments.length - 1].end || 0;
            const totalChars = sentences.reduce((sum, s) => sum + s.length, 0) || 1;
            let currentAccumTime = 0;
            return sentences.map((sent, idx) => {
                const ratio = sent.length / totalChars;
                const start = currentAccumTime;
                const end = (idx === sentences.length - 1) ? totalDuration : (start + ratio * totalDuration);
                currentAccumTime = end;
                let escapedSent = this.escapeHtml(sent);
                escapedSent = escapedSent.replace(/\[(.*?)\]/g, '<span class="tts-view-tag">[$1]</span>');
                return `<span class="tts-sentence-segment" data-start="${start.toFixed(2)}" data-end="${end.toFixed(2)}" title="Click to play (${this.formatTime(start)})">${escapedSent}</span>`;
            }).join(' ');
        }
        // Fallback khi chưa có Groq alignment
        return sentences.map(sent => {
            let escapedSent = this.escapeHtml(sent);
            escapedSent = escapedSent.replace(/\[(.*?)\]/g, '<span class="tts-view-tag">[$1]</span>');
            return `<span class="tts-sentence-segment" data-start="0" data-end="0">${escapedSent}</span>`;
        }).join(' ');
    }
    bindSentenceClickEvents() {
        if (!this.viewScriptBody) return;
        this.viewScriptBody.querySelectorAll('.tts-sentence-segment').forEach(seg => {
            seg.addEventListener('click', (e) => {
                const startTime = parseFloat(seg.dataset.start || 0);
                const endTime = parseFloat(seg.dataset.end || 0);
                if (!isNaN(startTime) && this.audioElement) {
                    this.currentActiveSentenceEnd = endTime > startTime ? endTime : null;
                    this.audioElement.currentTime = Math.max(0, startTime);
                    this.audioElement.play().catch(() => {});
                    this.highlightActiveSentence(startTime);
                }
            });
        });
    }
    highlightActiveSentence(currentTime) {
        if (!this.viewScriptBody) return;
        const segments = this.viewScriptBody.querySelectorAll('.tts-sentence-segment');
        let currentActiveSeg = null;
        let matchedSegEl = null;
        segments.forEach(seg => {
            const start = parseFloat(seg.dataset.start || 0);
            const end = parseFloat(seg.dataset.end || 0);
            if (end > start) {
                // Kiểm tra nếu thời gian nằm trong segment (hoặc vừa chạm mốc kết thúc của segment trong practice mode)
                const isWithin = (currentTime >= start && currentTime < end);
                const isJustEnded = (this.isPracticeMode && Math.abs(currentTime - end) <= 0.25);
                if (isWithin || isJustEnded) {
                    seg.classList.add('active');
                    currentActiveSeg = { start, end };
                    matchedSegEl = seg;
                } else {
                    seg.classList.remove('active');
                }
            } else {
                seg.classList.remove('active');
            }
        });
        // Xử lý chế độ Practice Mode: Tự động dừng lại sau khi nói hết 1 câu
        if (this.isPracticeMode && this.isPlaying && this.audioElement && !this.audioElement.paused) {
            if (currentActiveSeg) {
                this.currentActiveSentenceEnd = currentActiveSeg.end;
            }
            if (this.currentActiveSentenceEnd && currentTime >= (this.currentActiveSentenceEnd - 0.05)) {
                this.audioElement.pause();
                // Đảm bảo segment vừa phát xong vẫn luôn giữ active sau khi pause
                if (matchedSegEl) {
                    matchedSegEl.classList.add('active');
                }
                this.currentActiveSentenceEnd = null;
            }
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
        this.renderScriptViewer(rec.script, rec.mode, rec.speaker1, rec.speaker2, rec.alignment);
        if (rec.audioBlob) {
            this.currentRecordingDuration = rec.durationSeconds || 0;
            if (this.durationTimeEl) {
                this.durationTimeEl.textContent = this.formatTime(this.currentRecordingDuration);
            }
            const url = URL.createObjectURL(rec.audioBlob);
            this.audioElement.src = url;
            this.audioElement.load();
            // Background Groq STT Auto-Alignment if not aligned yet
            if (!rec.alignment && typeof GroqAligner !== 'undefined') {
                this.triggerBackgroundGroqAlign(rec);
            }
        }
        this.showStatus('', false);
        this.renderRecordingsList();
        if (typeof NexusViewManager !== 'undefined' && typeof NexusViewManager.updateUrl === 'function') {
            NexusViewManager.updateUrl('tts', { recordingId: rec.id });
        }
        if (this.page) {
            this.page.classList.add('show-studio');
        }
    }
    async triggerBackgroundGroqAlign(rec) {
        if (!rec || !rec.audioBlob || rec._isAligning) return;
        rec._isAligning = true;
        try {
            const alignment = await GroqAligner.align(rec.audioBlob, rec.script);
            if (alignment && alignment.segments && alignment.segments.length > 0) {
                rec.alignment = alignment;
                await TTSDB.saveRecording(rec);
                if (this.currentRecordingId === rec.id) {
                    this.renderScriptViewer(rec.script, rec.mode, rec.speaker1, rec.speaker2, alignment);
                }
            }
        } catch (err) {
            console.warn('Groq STT alignment background task failed:', err);
        } finally {
            rec._isAligning = false;
        }
    }
    resetStudioForNew() {
        this.currentRecordingId = null;
        this.currentAudioBlob = null;
        this.currentWavBlob = null;
        this.audioElement.pause();
        this.audioElement.src = '';
        if (typeof NexusViewManager !== 'undefined' && typeof NexusViewManager.updateUrl === 'function') {
            NexusViewManager.updateUrl('tts', {});
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
        // Tải lại các lựa chọn giọng nói, tone, pace, style, accent cuối cùng mà người dùng đã chọn
        this.loadLastVoiceSettings();
        // Cập nhật mode buttons
        this.modeBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === this.currentMode);
        });
        this.updateModeUI();
        if (this.profileInput) this.profileInput.value = this.audioProfile || '';
        this.updateChipLabel(this.styleChip, this.styleChipLabel, 'Style', this.selectedStyle);
        this.updateChipLabel(this.paceChip, this.paceChipLabel, 'Pace', this.selectedPace);
        this.updateChipLabel(this.accentChip, this.accentChipLabel, 'Accent', this.selectedAccent);
        this.updateActiveVoiceHeaderLabel();
        this.renderDirectorDropdowns();
        this.renderVoiceCards();
        // Luôn đảm bảo nút Generate sẵn sàng cho bài mới
        this.updateGenerateButtonUI(false);
        this.renderRecordingsList();
        if (this.page) {
            this.page.classList.add('show-studio');
        }
    }
    duplicateCurrent() {
        const recId = this.currentRecordingId;
        if (!recId) return;
        TTSDB.getRecording(recId).then(rec => {
            if (!rec) return;
            // Dừng audio
            this.audioElement.pause();
            this.audioElement.src = '';
            // Chuyển giao diện sang Compose Editor
            if (this.modeSwitcher) this.modeSwitcher.style.display = 'flex';
            if (this.voicePickerWrapper) this.voicePickerWrapper.style.display = 'block';
            if (this.generateBtn) this.generateBtn.style.display = 'inline-flex';
            if (this.viewInfoBadge) this.viewInfoBadge.style.display = 'none';
            if (this.viewActions) this.viewActions.style.display = 'none';
            if (this.viewContainer) this.viewContainer.style.display = 'none';
            if (this.composeContainer) this.composeContainer.style.display = 'flex';
            // Nạp toàn bộ dữ liệu cấu hình của bản ghi
            this.currentMode = rec.mode || 'single';
            this.selectedVoice1 = rec.voice || 'Kore';
            this.selectedVoice2 = rec.voice2 || 'Puck';
            if (this.s1Badge) this.s1Badge.textContent = this.selectedVoice1;
            if (this.s2Badge) this.s2Badge.textContent = this.selectedVoice2;
            this.selectedStyle = rec.style || '';
            this.selectedPace = rec.pace || '';
            this.selectedAccent = rec.accent || '';
            this.audioProfile = rec.audioProfile || '';
            if (this.scriptInput) {
                this.scriptInput.value = rec.script || '';
                this.scriptInput.focus();
            }
            if (this.profileInput) this.profileInput.value = this.audioProfile;
            if (this.speaker1Input) this.speaker1Input.value = rec.speaker1 || 'Joe';
            if (this.speaker2Input) this.speaker2Input.value = rec.speaker2 || 'Jane';
            this.setMode(this.currentMode);
            this.updateChipLabel(this.styleChip, this.styleChipLabel, 'Style', this.selectedStyle);
            this.updateChipLabel(this.paceChip, this.paceChipLabel, 'Pace', this.selectedPace);
            this.updateChipLabel(this.accentChip, this.accentChipLabel, 'Accent', this.selectedAccent);
            this.updateActiveVoiceHeaderLabel();
            this.renderDirectorDropdowns();
            this.renderVoiceCards();
            this.saveLastVoiceSettings();
            if (this.page) {
                this.page.classList.add('show-studio');
            }
        });
    }
    async deleteRecording(id) {
        await TTSDB.deleteRecording(id);
        if (this.currentRecordingId === id) {
            this.resetStudioForNew();
        }
        await this.loadRecordings();
        if (typeof NexusSync !== 'undefined' && typeof NexusSync.triggerDebouncedSync === 'function') {
            NexusSync.triggerDebouncedSync();
        }
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
        this.saveLastVoiceSettings();
    }
    async getCustomPresets() {
        try {
            const raw = localStorage.getItem('nexus_tts_custom_presets');
            return raw ? JSON.parse(raw) : [];
        } catch (_) {
            return [];
        }
    }
    async saveCustomPresets(presets) {
        try {
            localStorage.setItem('nexus_tts_custom_presets', JSON.stringify(presets));
            this.renderCustomPresets();
        } catch (_) {}
    }
    async renderCustomPresets() {
        if (!this.customPresetsGrid) return;
        const presets = await this.getCustomPresets();
        if (presets.length === 0) {
            this.customPresetsGrid.style.display = 'none';
            this.customPresetsGrid.innerHTML = '';
            return;
        }
        this.customPresetsGrid.style.display = 'flex';
        this.customPresetsGrid.innerHTML = presets.map((p, idx) => `
            <div class="tts-custom-preset-chip" data-index="${idx}">
                <div class="tts-custom-preset-name" title="${this.escapeHtml(p.name)} (${p.mode === 'multi' ? `${p.voice1} & ${p.voice2}` : p.voice1})">
                    ⭐ ${this.escapeHtml(p.name)}
                </div>
                <button type="button" class="tts-custom-preset-delete" data-index="${idx}" title="Delete Preset">
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
        `).join('');
        this.customPresetsGrid.querySelectorAll('.tts-custom-preset-chip').forEach(chip => {
            chip.addEventListener('click', (e) => {
                if (e.target.closest('.tts-custom-preset-delete')) return;
                const idx = parseInt(chip.dataset.index, 10);
                this.applyCustomPreset(presets[idx]);
                if (this.page) {
                    this.page.classList.add('show-studio');
                }
            });
        });
        this.customPresetsGrid.querySelectorAll('.tts-custom-preset-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(btn.dataset.index, 10);
                this.deleteCustomPreset(idx);
            });
        });
    }
    async handleSaveAsPreset() {
        const defaultName = this.currentMode === 'multi' 
            ? `${this.selectedVoice1} & ${this.selectedVoice2} (${this.selectedStyle || 'Default'})`
            : `${this.selectedVoice1} (${this.selectedStyle || 'Preset'})`;
        const name = prompt('Enter a name for this preset:', defaultName);
        if (!name || !name.trim()) return;
        const newPreset = {
            id: 'preset_' + Date.now(),
            name: name.trim(),
            mode: this.currentMode,
            voice1: this.selectedVoice1,
            voice2: this.selectedVoice2,
            speaker1: this.speaker1Input ? this.speaker1Input.value : 'Joe',
            speaker2: this.speaker2Input ? this.speaker2Input.value : 'Jane',
            style: this.selectedStyle,
            pace: this.selectedPace,
            accent: this.selectedAccent,
            audioProfile: this.profileInput ? this.profileInput.value : this.audioProfile,
            createdAt: Date.now()
        };
        const presets = await this.getCustomPresets();
        presets.unshift(newPreset);
        await this.saveCustomPresets(presets);
        this.showStatus(`Preset "${name.trim()}" saved successfully!`, false);
    }
    applyCustomPreset(preset) {
        if (!preset) return;
        this.setMode(preset.mode || 'single');
        this.selectedVoice1 = preset.voice1 || 'Kore';
        this.selectedVoice2 = preset.voice2 || 'Puck';
        if (this.s1Badge) this.s1Badge.textContent = this.selectedVoice1;
        if (this.s2Badge) this.s2Badge.textContent = this.selectedVoice2;
        if (this.speaker1Input && preset.speaker1) this.speaker1Input.value = preset.speaker1;
        if (this.speaker2Input && preset.speaker2) this.speaker2Input.value = preset.speaker2;
        this.selectedStyle = preset.style || '';
        this.selectedPace = preset.pace || '';
        this.selectedAccent = preset.accent || '';
        this.audioProfile = preset.audioProfile || '';
        if (this.profileInput) this.profileInput.value = this.audioProfile;
        this.updateChipLabel(this.styleChip, this.styleChipLabel, 'Style', this.selectedStyle);
        this.updateChipLabel(this.paceChip, this.paceChipLabel, 'Pace', this.selectedPace);
        this.updateChipLabel(this.accentChip, this.accentChipLabel, 'Accent', this.selectedAccent);
        this.updateActiveVoiceHeaderLabel();
        this.renderDirectorDropdowns();
        this.renderVoiceCards();
        this.saveLastVoiceSettings();
        this.showStatus(`Applied preset: ${preset.name}`, false);
    }
    async deleteCustomPreset(idx) {
        const presets = await this.getCustomPresets();
        if (idx >= 0 && idx < presets.length) {
            const removed = presets.splice(idx, 1);
            await this.saveCustomPresets(presets);
            this.showStatus(`Deleted preset "${removed[0]?.name || ''}"`, false);
        }
    }
    async handleGenerate() {
        const script = this.scriptInput ? this.scriptInput.value.trim() : '';
        if (!script) {
            if (this.scriptInput) this.scriptInput.focus();
            return;
        }
        // Snapshot toàn bộ thông số cho task này
        const taskPayload = {
            mode: this.currentMode,
            script: script,
            voice1: this.selectedVoice1 || 'Kore',
            voice2: this.selectedVoice2 || 'Puck',
            speaker1: this.speaker1Input ? this.speaker1Input.value : 'Joe',
            speaker2: this.speaker2Input ? this.speaker2Input.value : 'Jane',
            audioProfile: this.profileInput ? this.profileInput.value : this.audioProfile,
            style: this.selectedStyle,
            pace: this.selectedPace,
            accent: this.selectedAccent
        };
        this.updateGenerateButtonUI(true);
        // Chạy task background hoàn toàn độc lập với view hiện tại
        (async () => {
            try {
                const result = await TTSManager.generateSpeech({
                    mode: taskPayload.mode,
                    script: taskPayload.script,
                    voice: taskPayload.voice1,
                    voice2: taskPayload.voice2,
                    speaker1: taskPayload.speaker1,
                    speaker2: taskPayload.speaker2,
                    audioProfile: taskPayload.audioProfile,
                    style: taskPayload.style,
                    pace: taskPayload.pace,
                    accent: taskPayload.accent
                });
                // Lưu bản ghi vào TTSDB IndexedDB ngay lập tức
                const savedItem = await TTSDB.saveRecording({
                    title: taskPayload.script.split('\n')[0].replace(/\[.*?\]/g, '').trim().slice(0, 45) || 'Audio Recording',
                    script: taskPayload.script,
                    mode: taskPayload.mode,
                    voice: taskPayload.voice1,
                    voice2: taskPayload.voice2,
                    speaker1: taskPayload.speaker1,
                    speaker2: taskPayload.speaker2,
                    audioProfile: taskPayload.audioProfile,
                    style: taskPayload.style,
                    pace: taskPayload.pace,
                    accent: taskPayload.accent,
                    durationSeconds: result.durationSeconds,
                    audioBlob: result.blob
                });
                if (typeof NexusSync !== 'undefined' && typeof NexusSync.triggerDebouncedSync === 'function') {
                    NexusSync.triggerDebouncedSync();
                }
                // Chạy Groq Whisper alignment ngầm
                if (typeof GroqAligner !== 'undefined') {
                    this.triggerBackgroundGroqAlign(savedItem);
                }
                // Cập nhật danh sách recordings trong RAM
                await this.loadRecordings();
                // Nếu người dùng đang ở compose và đang soạn bài khác (scriptInput có text hoặc đã gõ gì đó), không cướp màn hình
                const isWritingNew = this.composeContainer && this.composeContainer.style.display !== 'none' && this.scriptInput && this.scriptInput.value.trim().length > 0;
                if (!isWritingNew) {
                    await this.selectRecording(savedItem);
                    try {
                        await this.audioElement.play();
                    } catch (_) {}
                }
            } catch (error) {
                console.error('TTS background generation failed:', error);
            } finally {
                this.updateGenerateButtonUI(false);
            }
        })();
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
