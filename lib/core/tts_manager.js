/**
 * TTSManager - Core service for Gemini 3.1 Flash Text-to-Speech Generation
 * Handles Single & Multi-speaker audio synthesis, Director's Notes prompt generation,
 * raw PCM to WAV conversion, and audio playback.
 */
class TTSManager {
    static MODEL = 'gemini-3.1-flash-tts-preview';
    static API_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

    // 30 Gemini Output Voices with their characteristics
    static VOICES = [
        { name: 'Kore', gender: 'Female', tone: 'Firm', description: 'Firm, confident & authoritative' },
        { name: 'Puck', gender: 'Male', tone: 'Upbeat', description: 'Upbeat, energetic & lively' },
        { name: 'Zephyr', gender: 'Female', tone: 'Bright', description: 'Bright, crisp & engaging' },
        { name: 'Fenrir', gender: 'Male', tone: 'Excitable', description: 'Excitable, dynamic & spirited' },
        { name: 'Leda', gender: 'Female', tone: 'Youthful', description: 'Youthful, fresh & pleasant' },
        { name: 'Aoede', gender: 'Female', tone: 'Breezy', description: 'Breezy, natural & relaxed' },
        { name: 'Enceladus', gender: 'Male', tone: 'Breathy', description: 'Breathy, deep & expressive' },
        { name: 'Algieba', gender: 'Male', tone: 'Smooth', description: 'Smooth, polished & calm' },
        { name: 'Despina', gender: 'Female', tone: 'Smooth', description: 'Smooth, elegant & melodious' },
        { name: 'Orus', gender: 'Male', tone: 'Firm', description: 'Firm, steady & commanding' },
        { name: 'Charon', gender: 'Male', tone: 'Informative', description: 'Informative, balanced & clear' },
        { name: 'Callirrhoe', gender: 'Female', tone: 'Easy-going', description: 'Easy-going, friendly & casual' },
        { name: 'Autonoe', gender: 'Female', tone: 'Bright', description: 'Bright, clear & vibrant' },
        { name: 'Iapetus', gender: 'Male', tone: 'Clear', description: 'Clear, articulated & neutral' },
        { name: 'Umbriel', gender: 'Male', tone: 'Easy-going', description: 'Easy-going, conversational & mild' },
        { name: 'Erinome', gender: 'Female', tone: 'Clear', description: 'Clear, crisp & articulate' },
        { name: 'Algenib', gender: 'Male', tone: 'Gravelly', description: 'Gravelly, textured & mature' },
        { name: 'Rasalgethi', gender: 'Male', tone: 'Informative', description: 'Informative, documentary-style' },
        { name: 'Laomedeia', gender: 'Female', tone: 'Upbeat', description: 'Upbeat, cheerful & positive' },
        { name: 'Achernar', gender: 'Female', tone: 'Soft', description: 'Soft, gentle & comforting' },
        { name: 'Alnilam', gender: 'Male', tone: 'Firm', description: 'Firm, grounded & resonant' },
        { name: 'Schedar', gender: 'Male', tone: 'Even', description: 'Even, steady & measured' },
        { name: 'Gacrux', gender: 'Male', tone: 'Mature', description: 'Mature, seasoned & warm' },
        { name: 'Pulcherrima', gender: 'Female', tone: 'Forward', description: 'Forward, direct & expressive' },
        { name: 'Achird', gender: 'Male', tone: 'Friendly', description: 'Friendly, warm & approachable' },
        { name: 'Zubenelgenubi', gender: 'Male', tone: 'Casual', description: 'Casual, relaxed & informal' },
        { name: 'Vindemiatrix', gender: 'Female', tone: 'Gentle', description: 'Gentle, soft & soothing' },
        { name: 'Sadachbia', gender: 'Female', tone: 'Lively', description: 'Lively, animated & enthusiastic' },
        { name: 'Sadaltager', gender: 'Male', tone: 'Knowledgeable', description: 'Knowledgeable, educational & wise' },
        { name: 'Sulafat', gender: 'Female', tone: 'Warm', description: 'Warm, empathetic & welcoming' }
    ];

    /**
     * Get all configured Gemini API keys from storage, providers, ProfileManager, or localStorage
     */
    static async getAllApiKeys() {
        const keysSet = new Set();

        // 1. Primary: chrome.storage.local (used by Lumina Settings Modal)
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            try {
                const res = await new Promise(resolve => chrome.storage.local.get(null, resolve));
                if (res) {
                    if (res.geminiApiKey && typeof res.geminiApiKey === 'string') {
                        res.geminiApiKey.split(',').forEach(k => {
                            const trimmed = k.trim();
                            if (trimmed) keysSet.add(trimmed);
                        });
                    }

                    const providers = res.providers || [];
                    if (Array.isArray(providers)) {
                        providers.forEach(p => {
                            const isGemini = p.id === 'gemini' || p.id === 'gemini-default' || p.type === 'gemini' ||
                                            (typeof p.endpoint === 'string' && p.endpoint.includes('generativelanguage.googleapis.com')) ||
                                            (p.name?.toLowerCase().includes('gemini') || p.id?.toLowerCase().includes('gemini'));
                            if (isGemini && p.apiKey && typeof p.apiKey === 'string') {
                                p.apiKey.split(',').forEach(k => {
                                    const trimmed = k.trim();
                                    if (trimmed) keysSet.add(trimmed);
                                });
                            }
                        });
                    }
                }
            } catch (err) {
                console.warn('Error reading from chrome.storage.local:', err);
            }
        }

        // 2. ProfileManager if available
        if (typeof ProfileManager !== 'undefined' && typeof ProfileManager.getApiKey === 'function') {
            try {
                const key = ProfileManager.getApiKey();
                if (key && typeof key === 'string') {
                    key.split(',').forEach(k => {
                        const trimmed = k.trim();
                        if (trimmed) keysSet.add(trimmed);
                    });
                }
            } catch (_) {}
        }

        // 3. Fallback to localStorage / window cache
        ['lumina_gemini_api_key', 'gemini_api_key', 'geminiApiKey'].forEach(storageKey => {
            const val = localStorage.getItem(storageKey);
            if (val && typeof val === 'string') {
                val.split(',').forEach(k => {
                    const trimmed = k.trim();
                    if (trimmed) keysSet.add(trimmed);
                });
            }
        });

        if (window.__luminaGeminiApiKey) {
            window.__luminaGeminiApiKey.split(',').forEach(k => {
                const trimmed = k.trim();
                if (trimmed) keysSet.add(trimmed);
            });
        }

        return Array.from(keysSet);
    }

    /**
     * Get today string for rotation key tracking
     */
    static getTodayString() {
        const now = new Date();
        return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
    }

    /**
     * Fetch with automatic key rotation and retry across multiple keys
     */
    static async fetchWithRotation(keys, requestFn) {
        if (!keys || keys.length === 0) {
            throw new Error('Gemini API key not found. Please configure your API key in Settings.');
        }

        const groupKey = 'rot_gemini_tts_' + keys.join(',').substring(0, 32).replace(/[^a-zA-Z0-9]/g, '');
        const today = this.getTodayString();
        let activeIndex = 0;

        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            try {
                const rotData = await new Promise(resolve => chrome.storage.local.get([groupKey], resolve));
                const state = rotData?.[groupKey];
                if (state && state.date === today && state.index >= 0 && state.index < keys.length) {
                    activeIndex = state.index;
                }
            } catch (_) {}
        }

        let lastError = null;

        for (let attempts = 0; attempts < keys.length; attempts++) {
            const currentIndex = (activeIndex + attempts) % keys.length;
            const currentKey = keys[currentIndex];

            try {
                const result = await requestFn(currentKey);

                // Save working key index
                if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                    try {
                        await chrome.storage.local.set({
                            [groupKey]: { date: today, index: currentIndex }
                        });
                    } catch (_) {}
                }

                return result;
            } catch (err) {
                lastError = err;
                console.warn(`[TTS] Key index ${currentIndex} failed: ${err.message}. Rotating to next key if available...`);

                // If error is prompt validation / empty input (not API key / rate limit / network), don't keep rotating
                if (err.message && (err.message.includes('Please enter text') || err.message.includes('prompt classifier'))) {
                    throw err;
                }
            }
        }

        throw lastError || new Error('All Gemini API keys failed.');
    }

    /**
     * Build prompt with Director's Notes (Style, Pace, Accent) & Transcript
     */
    static buildPrompt({ mode, script, style, pace, accent, speaker1Name = 'Speaker 1', speaker2Name = 'Speaker 2' }) {
        const hasNotes = Boolean((style && style.trim()) || (pace && pace.trim()) || (accent && accent.trim()));

        if (!hasNotes) {
            if (mode === 'multi') {
                return `TTS the following conversation between ${speaker1Name} and ${speaker2Name}:\n${script}`;
            }
            return script;
        }

        let prompt = '';
        prompt += `### DIRECTOR'S NOTES\n`;
        if (style && style.trim()) prompt += `Style: ${style.trim()}\n`;
        if (pace && pace.trim()) prompt += `Pacing: ${pace.trim()}\n`;
        if (accent && accent.trim()) prompt += `Accent: ${accent.trim()}\n`;
        prompt += `\n### TRANSCRIPT\n${script}`;

        return prompt;
    }

    /**
     * Generate speech from Gemini TTS API (with automatic key rotation)
     */
    static async generateSpeech({
        mode = 'single', // 'single' | 'multi'
        script = '',
        voice = 'Kore',
        voice2 = 'Puck',
        speaker1 = 'Speaker 1',
        speaker2 = 'Speaker 2',
        style = '',
        pace = '',
        accent = '',
        apiKey = ''
    }) {
        if (!script || !script.trim()) {
            throw new Error('Please enter text or transcript to generate speech.');
        }

        let keys = [];
        if (apiKey && apiKey.trim()) {
            keys = apiKey.split(',').map(k => k.trim()).filter(Boolean);
        } else {
            keys = await this.getAllApiKeys();
        }

        if (keys.length === 0) {
            throw new Error('Gemini API key not found. Please configure your API key in Settings.');
        }

        const promptText = this.buildPrompt({
            mode,
            script,
            style,
            pace,
            accent,
            speaker1Name: speaker1,
            speaker2Name: speaker2
        });

        let speechConfig = {};

        if (mode === 'multi') {
            speechConfig = {
                multiSpeakerVoiceConfig: {
                    speakerVoiceConfigs: [
                        {
                            speaker: speaker1.trim() || 'Speaker 1',
                            voiceConfig: {
                                prebuiltVoiceConfig: { voiceName: voice }
                            }
                        },
                        {
                            speaker: speaker2.trim() || 'Speaker 2',
                            voiceConfig: {
                                prebuiltVoiceConfig: { voiceName: voice2 }
                            }
                        }
                    ]
                }
            };
        } else {
            speechConfig = {
                voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: voice }
                }
            };
        }

        const payload = {
            contents: [
                {
                    parts: [
                        { text: promptText }
                    ]
                }
            ],
            generationConfig: {
                responseModalities: ['AUDIO'],
                speechConfig: speechConfig
            },
            model: this.MODEL
        };

        return await this.fetchWithRotation(keys, async (currentKey) => {
            const url = `${this.API_ENDPOINT}/${this.MODEL}:generateContent?key=${encodeURIComponent(currentKey)}`;

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                let errorMsg = `Server returned error (${response.status})`;
                try {
                    const errData = await response.json();
                    if (errData?.error?.message) {
                        errorMsg = errData.error.message;
                    }
                } catch (_) {}
                throw new Error(errorMsg);
            }

            const resData = await response.json();
            const candidate = resData.candidates?.[0];
            if (!candidate) {
                throw new Error('No candidate returned from Gemini TTS.');
            }

            const part = candidate.content?.parts?.[0];
            const base64Audio = part?.inlineData?.data;

            if (!base64Audio) {
                // Check if model returned text instead (false rejection/retry)
                if (part?.text) {
                    throw new Error(`The model returned text instead of audio: "${part.text.substring(0, 100)}...". Please try again.`);
                }
                throw new Error('No audio data received in response.');
            }

            // Convert base64 PCM 24kHz 16-bit Mono into playable WAV Blob
            const pcmBytes = this.base64ToUint8Array(base64Audio);
            const wavBlob = this.pcmToWav(pcmBytes, 1, 24000, 16);
            const audioUrl = URL.createObjectURL(wavBlob);

            return {
                blob: wavBlob,
                audioUrl: audioUrl,
                sampleRate: 24000,
                durationSeconds: pcmBytes.length / (24000 * 2)
            };
        });
    }

    /**
     * Convert Base64 string to Uint8Array
     */
    static base64ToUint8Array(base64) {
        const binaryString = window.atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
    }

    /**
     * Convert raw PCM (16-bit LE, 24kHz mono) to standard RIFF WAV Blob
     */
    static pcmToWav(pcmData, numChannels = 1, sampleRate = 24000, bitsPerSample = 16) {
        const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
        const blockAlign = (numChannels * bitsPerSample) / 8;
        const dataLength = pcmData.length;
        const bufferLength = 44 + dataLength;
        const buffer = new ArrayBuffer(bufferLength);
        const view = new DataView(buffer);

        // Helper to write ASCII strings
        const writeString = (offset, string) => {
            for (let i = 0; i < string.length; i++) {
                view.setUint8(offset + i, string.charCodeAt(i));
            }
        };

        // RIFF header
        writeString(0, 'RIFF');
        view.setUint32(4, 36 + dataLength, true); // File size - 8
        writeString(8, 'WAVE');

        // "fmt " sub-chunk
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
        view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, byteRate, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, bitsPerSample, true);

        // "data" sub-chunk
        writeString(36, 'data');
        view.setUint32(40, dataLength, true);

        // Copy raw PCM samples
        const uint8View = new Uint8Array(buffer, 44);
        uint8View.set(pcmData);

        return new Blob([buffer], { type: 'audio/wav' });
    }

    /**
     * Trigger browser download for WAV file
     */
    static downloadWav(blob, filename = 'speech.wav') {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
    }
}

if (typeof window !== 'undefined') {
    window.TTSManager = TTSManager;
}
