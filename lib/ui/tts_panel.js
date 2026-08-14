/**
 * TTSPanel - UI Controller for Lumina TTS Studio
 * Manages Single/Multi-speaker views, Director's Notes controls,
 * audio tag insertions, speech generation, and playback.
 */
class TTSPanel {
    constructor() {
        this.currentMode = 'single'; // 'single' | 'multi'
        this.audioElement = new Audio();
        this.currentAudioBlob = null;
        this.isPlaying = false;
        this.isGenerating = false;

        this.initDOMElements();
        this.bindEvents();
        this.populateVoiceSelects();
    }

    initDOMElements() {
        this.page = document.getElementById('tts-page');
        this.sidebarToggleBtn = document.getElementById('tts-sidebar-toggle-btn');
        this.modeBtns = document.querySelectorAll('.tts-mode-btn');
        this.scriptInput = document.getElementById('tts-script-input');
        this.tagChips = document.querySelectorAll('.tts-tag-chip');
        this.presetChips = document.querySelectorAll('.tts-preset-chip');

        // Director's Notes elements
        this.voice1Select = document.getElementById('tts-voice-1-select');
        this.voice2Select = document.getElementById('tts-voice-2-select');
        this.voice2Group = document.getElementById('tts-voice-2-group');
        this.styleInput = document.getElementById('tts-style-input');
        this.paceInput = document.getElementById('tts-pace-input');
        this.accentInput = document.getElementById('tts-accent-input');
        this.speaker1Input = document.getElementById('tts-speaker-1-name');
        this.speaker2Input = document.getElementById('tts-speaker-2-name');
        this.speakerNamesGroup = document.getElementById('tts-speaker-names-group');

        // Action & Player elements
        this.generateBtn = document.getElementById('tts-generate-btn');
        this.generateBtnText = document.getElementById('tts-generate-btn-text');
        this.generateSpinner = document.getElementById('tts-generate-spinner');
        this.statusText = document.getElementById('tts-status-text');

        this.playerContainer = document.getElementById('tts-player-container');
        this.playPauseBtn = document.getElementById('tts-play-pause-btn');
        this.playIcon = document.getElementById('tts-play-icon');
        this.pauseIcon = document.getElementById('tts-pause-icon');
        this.progressBar = document.getElementById('tts-progress-bar');
        this.currentTimeEl = document.getElementById('tts-current-time');
        this.durationTimeEl = document.getElementById('tts-duration-time');
        this.speedBtn = document.getElementById('tts-speed-btn');
        this.downloadBtn = document.getElementById('tts-download-btn');
    }

    bindEvents() {
        // Toggle Sidebar
        if (this.sidebarToggleBtn) {
            this.sidebarToggleBtn.addEventListener('click', () => {
                if (typeof window.toggleSidebar === 'function') {
                    window.toggleSidebar();
                } else if (typeof toggleSidebar === 'function') {
                    toggleSidebar();
                }
            });
        }

        // Mode Switching (Single / Multi-Speaker)
        this.modeBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const mode = btn.dataset.mode;
                this.setMode(mode);
            });
        });

        // Quick Tag Inserters
        this.tagChips.forEach(chip => {
            chip.addEventListener('click', () => {
                const tag = chip.dataset.tag;
                this.insertTagAtCursor(tag);
            });
        });

        // Sample Presets
        this.presetChips.forEach(chip => {
            chip.addEventListener('click', () => {
                const presetKey = chip.dataset.preset;
                this.applyPreset(presetKey);
            });
        });

        // Suggestion chips for Style, Pace, Accent
        document.querySelectorAll('.tts-suggestion-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const targetId = chip.dataset.target;
                const value = chip.dataset.val;
                const targetEl = document.getElementById(targetId);
                if (targetEl) {
                    targetEl.value = value;
                }
            });
        });

        // Generate button
        if (this.generateBtn) {
            this.generateBtn.addEventListener('click', () => this.handleGenerate());
        }

        // Player Controls
        if (this.playPauseBtn) {
            this.playPauseBtn.addEventListener('click', () => this.togglePlayPause());
        }

        if (this.progressBar) {
            this.progressBar.addEventListener('input', (e) => {
                if (this.audioElement.duration) {
                    const targetTime = (e.target.value / 100) * this.audioElement.duration;
                    this.audioElement.currentTime = targetTime;
                }
            });
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

        if (this.downloadBtn) {
            this.downloadBtn.addEventListener('click', () => {
                if (this.currentAudioBlob) {
                    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                    TTSManager.downloadWav(this.currentAudioBlob, `lumina-speech-${timestamp}.wav`);
                }
            });
        }

        // Audio element events
        this.audioElement.addEventListener('timeupdate', () => {
            if (!this.audioElement.duration) return;
            const progress = (this.audioElement.currentTime / this.audioElement.duration) * 100;
            if (this.progressBar) this.progressBar.value = progress;
            if (this.currentTimeEl) this.currentTimeEl.textContent = this.formatTime(this.audioElement.currentTime);
        });

        this.audioElement.addEventListener('loadedmetadata', () => {
            if (this.durationTimeEl) this.durationTimeEl.textContent = this.formatTime(this.audioElement.duration);
        });

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
    }

    populateVoiceSelects() {
        const voices = TTSManager.VOICES;
        const createOptions = (selectedName) => {
            return voices.map(v => {
                const isSelected = v.name === selectedName ? 'selected' : '';
                return `<option value="${v.name}" ${isSelected}>${v.name} (${v.gender}, ${v.tone}) - ${v.description}</option>`;
            }).join('');
        };

        if (this.voice1Select) this.voice1Select.innerHTML = createOptions('Kore');
        if (this.voice2Select) this.voice2Select.innerHTML = createOptions('Puck');
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
            if (this.voice2Group) this.voice2Group.style.display = 'flex';
            if (this.speakerNamesGroup) this.speakerNamesGroup.style.display = 'flex';
        } else {
            if (this.voice2Group) this.voice2Group.style.display = 'none';
            if (this.speakerNamesGroup) this.speakerNamesGroup.style.display = 'none';
        }
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
                if (this.voice1Select) this.voice1Select.value = 'Kore';
                if (this.voice2Select) this.voice2Select.value = 'Puck';
                if (this.styleInput) this.styleInput.value = 'Engaging tech podcast hosts sharing cutting-edge AI insights with genuine enthusiasm.';
                if (this.paceInput) this.paceInput.value = 'Natural conversational rhythm with fluid banter.';
                if (this.accentInput) this.accentInput.value = 'Standard English';
                this.scriptInput.value = `Joe: [excitedly] Welcome back to the show, everyone! Jane, did you see the new speech synthesis update today?
Jane: [laughs] I certainly did Joe! [amazed] The natural emotional inflections and control tags are genuinely impressive.
Joe: Exactly. It completely changes how we produce audiobooks and podcasts!`;
                break;

            case 'story':
                this.setMode('single');
                if (this.voice1Select) this.voice1Select.value = 'Enceladus';
                if (this.styleInput) this.styleInput.value = 'Mysterious, atmospheric storyteller around a crackling campfire.';
                if (this.paceInput) this.paceInput.value = 'Slow, dramatic pauses and whispered intimacy.';
                if (this.accentInput) this.accentInput.value = 'British London';
                this.scriptInput.value = `[whispers] Listen closely... [short pause]
The old grandfather clock in the hallway struck midnight, its hollow chimes echoing through the empty corridors.
[gasp] Then, from behind the sealed oak door, a quiet footsteps sounded...`;
                break;

            case 'news':
                this.setMode('single');
                if (this.voice1Select) this.voice1Select.value = 'Charon';
                if (this.styleInput) this.styleInput.value = 'Authoritative, clear and professional morning news anchor.';
                if (this.paceInput) this.paceInput.value = 'Steady, well-articulated and informative cadence.';
                if (this.accentInput) this.accentInput.value = 'Standard English';
                this.scriptInput.value = `Good morning. Here are the top headlines for today.
Markets reached historic highs this morning following breakthroughs in artificial intelligence technology and renewable energy adoption.`;
                break;

            case 'influencer':
                this.setMode('single');
                if (this.voice1Select) this.voice1Select.value = 'Zephyr';
                if (this.styleInput) this.styleInput.value = 'High-energy, charismatic tech influencer with contagious optimism.';
                if (this.paceInput) this.paceInput.value = 'Fast-paced, vibrant with punchy consonants.';
                if (this.accentInput) this.accentInput.value = 'American Casual';
                this.scriptInput.value = `[excitedly] What is up, everyone! You will NOT believe what just dropped today!
[laughs] Drop a like, subscribe, and let's dive right into the demo!`;
                break;
        }
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
            const voice1 = this.voice1Select ? this.voice1Select.value : 'Kore';
            const voice2 = this.voice2Select ? this.voice2Select.value : 'Puck';
            const speaker1 = this.speaker1Input ? this.speaker1Input.value : 'Speaker 1';
            const speaker2 = this.speaker2Input ? this.speaker2Input.value : 'Speaker 2';
            const style = this.styleInput ? this.styleInput.value : '';
            const pace = this.paceInput ? this.paceInput.value : '';
            const accent = this.accentInput ? this.accentInput.value : '';

            const result = await TTSManager.generateSpeech({
                mode: this.currentMode,
                script: script,
                voice: voice1,
                voice2: voice2,
                speaker1: speaker1,
                speaker2: speaker2,
                style: style,
                pace: pace,
                accent: accent
            });

            this.currentAudioBlob = result.blob;
            this.audioElement.src = result.audioUrl;
            this.audioElement.load();

            if (this.playerContainer) {
                this.playerContainer.style.display = 'flex';
            }

            this.showStatus(`Speech generated successfully (${result.durationSeconds.toFixed(1)}s)`, false);

            // Auto play the generated audio
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
            this.generateBtnText.textContent = loading ? 'Generating...' : 'Generate Speech';
        }
    }

    showStatus(msg, isError = false) {
        if (this.statusText) {
            this.statusText.textContent = msg;
            this.statusText.style.color = isError ? '#ef4444' : 'var(--lumina-text-secondary, #64748b)';
        }
    }

    formatTime(seconds) {
        if (isNaN(seconds) || seconds < 0) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }
}

if (typeof window !== 'undefined') {
    window.TTSPanel = TTSPanel;
}
