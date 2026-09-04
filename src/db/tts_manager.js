export class TTSDB {
    static DB_NAME = 'NexusTTSDB';
    static DB_VERSION = 1;
    static STORE_RECORDINGS = 'recordings';
    static _db = null;

    static async getDB() {
        if (TTSDB._db) return TTSDB._db;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(TTSDB.DB_NAME, TTSDB.DB_VERSION);

            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(TTSDB.STORE_RECORDINGS)) {
                    const store = db.createObjectStore(TTSDB.STORE_RECORDINGS, { keyPath: 'id' });
                    store.createIndex('createdAt', 'createdAt', { unique: false });
                    store.createIndex('starred', 'starred', { unique: false });
                    store.createIndex('mode', 'mode', { unique: false });
                }
            };

            request.onsuccess = (e) => {
                TTSDB._db = e.target.result;
                TTSDB._db.onclose = () => { TTSDB._db = null; };
                TTSDB._db.onversionchange = () => {
                    if (TTSDB._db) {
                        TTSDB._db.close();
                        TTSDB._db = null;
                    }
                };
                resolve(TTSDB._db);
            };

            request.onerror = (e) => reject(e.target.error);
        });
    }

    static async getAllRecordings(includeDeleted = false) {
        const db = await TTSDB.getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(TTSDB.STORE_RECORDINGS, 'readonly');
            const store = tx.objectStore(TTSDB.STORE_RECORDINGS);
            const index = store.index('createdAt');
            const request = index.getAll();
            request.onsuccess = () => {
                let list = (request.result || []).reverse();
                if (!includeDeleted) {
                    list = list.filter(r => r && !r.isDeleted);
                }
                resolve(list);
            };
            request.onerror = (e) => reject(e.target.error);
        });
    }

    static async getAllRecordingsRaw() {
        return TTSDB.getAllRecordings(true);
    }

    static async getRecording(id, includeDeleted = false) {
        if (!id) return null;
        const db = await TTSDB.getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(TTSDB.STORE_RECORDINGS, 'readonly');
            const store = tx.objectStore(TTSDB.STORE_RECORDINGS);
            const request = store.get(id);
            request.onsuccess = () => {
                const item = request.result || null;
                if (!item) return resolve(null);
                if (item.isDeleted && !includeDeleted) return resolve(null);
                resolve(item);
            };
            request.onerror = (e) => reject(e.target.error);
        });
    }

    static async saveRecording(recData) {
        const db = await TTSDB.getDB();
        const now = Date.now();
        const item = {
            id: recData.id || ('tts_' + now + '_' + Math.random().toString(36).substr(2, 6)),
            title: (recData.title || '').trim() || (recData.script ? recData.script.slice(0, 50).trim() + '...' : 'Untitled Audio'),
            script: recData.script || '',
            mode: recData.mode || 'single',
            voice: recData.voice || 'Kore',
            voice2: recData.voice2 || 'Puck',
            speaker1: recData.speaker1 || 'Joe',
            speaker2: recData.speaker2 || 'Jane',
            audioProfile: recData.audioProfile || '',
            style: recData.style || '',
            pace: recData.pace || '',
            accent: recData.accent || '',
            durationSeconds: recData.durationSeconds || 0,
            audioBlob: recData.audioBlob,
            alignment: recData.alignment || null,
            starred: recData.starred ? 1 : 0,
            isDeleted: !!recData.isDeleted,
            createdAt: recData.createdAt || now,
            updatedAt: recData.updatedAt || now
        };

        return new Promise((resolve, reject) => {
            const tx = db.transaction(TTSDB.STORE_RECORDINGS, 'readwrite');
            const store = tx.objectStore(TTSDB.STORE_RECORDINGS);
            const request = store.put(item);
            request.onsuccess = () => resolve(item);
            request.onerror = (e) => reject(e.target.error);
        });
    }

    static async toggleStar(id) {
        const item = await TTSDB.getRecording(id);
        if (!item) return null;
        item.starred = item.starred ? 0 : 1;
        item.updatedAt = Date.now();

        const db = await TTSDB.getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(TTSDB.STORE_RECORDINGS, 'readwrite');
            const store = tx.objectStore(TTSDB.STORE_RECORDINGS);
            const request = store.put(item);
            request.onsuccess = () => resolve(item);
            request.onerror = (e) => reject(e.target.error);
        });
    }

    static async updateRecordingTitle(id, newTitle) {
        const item = await TTSDB.getRecording(id);
        if (!item) return null;
        item.title = (newTitle || '').trim() || 'Untitled Audio';
        item.updatedAt = Date.now();

        const db = await TTSDB.getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(TTSDB.STORE_RECORDINGS, 'readwrite');
            const store = tx.objectStore(TTSDB.STORE_RECORDINGS);
            const request = store.put(item);
            request.onsuccess = () => resolve(item);
            request.onerror = (e) => reject(e.target.error);
        });
    }

    static async deleteRecording(id) {
        const db = await TTSDB.getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(TTSDB.STORE_RECORDINGS, 'readwrite');
            const store = tx.objectStore(TTSDB.STORE_RECORDINGS);
            const request = store.delete(id);
            request.onsuccess = () => resolve(true);
            request.onerror = (e) => reject(e.target.error);
        });
    }

    static async deleteRecordingHard(id) {
        return TTSDB.deleteRecording(id);
    }
}

export class TTSManager {
    static MODEL = 'gemini-3.1-flash-tts-preview';
    static API_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

    static VOICES = [
        { name: 'Achernar', tone: 'Soft', pitch: 'Higher pitch', gender: 'Female' },
        { name: 'Achird', tone: 'Friendly', pitch: 'Lower middle pitch', gender: 'Male' },
        { name: 'Algenib', tone: 'Gravelly', pitch: 'Lower pitch', gender: 'Male' },
        { name: 'Algieba', tone: 'Smooth', pitch: 'Lower pitch', gender: 'Male' },
        { name: 'Alnilam', tone: 'Firm', pitch: 'Lower middle pitch', gender: 'Male' },
        { name: 'Aoede', tone: 'Breezy', pitch: 'Middle pitch', gender: 'Female' },
        { name: 'Autonoe', tone: 'Bright', pitch: 'Middle pitch', gender: 'Female' },
        { name: 'Callirrhoe', tone: 'Easy-going', pitch: 'Middle pitch', gender: 'Female' },
        { name: 'Charon', tone: 'Informative', pitch: 'Lower pitch', gender: 'Male' },
        { name: 'Despina', tone: 'Smooth', pitch: 'Middle pitch', gender: 'Female' },
        { name: 'Enceladus', tone: 'Breathy', pitch: 'Lower pitch', gender: 'Male' },
        { name: 'Erinome', tone: 'Clear', pitch: 'Middle pitch', gender: 'Female' },
        { name: 'Fenrir', tone: 'Excitable', pitch: 'Lower middle pitch', gender: 'Male' },
        { name: 'Gacrux', tone: 'Mature', pitch: 'Middle pitch', gender: 'Male' },
        { name: 'Iapetus', tone: 'Clear', pitch: 'Lower middle pitch', gender: 'Male' },
        { name: 'Kore', tone: 'Firm', pitch: 'Middle pitch', gender: 'Female' },
        { name: 'Laomedeia', tone: 'Upbeat', pitch: 'Higher pitch', gender: 'Female' },
        { name: 'Leda', tone: 'Youthful', pitch: 'Higher pitch', gender: 'Female' },
        { name: 'Orus', tone: 'Firm', pitch: 'Lower middle pitch', gender: 'Male' },
        { name: 'Puck', tone: 'Upbeat', pitch: 'Middle pitch', gender: 'Male' },
        { name: 'Pulcherrima', tone: 'Forward', pitch: 'Middle pitch', gender: 'Female' },
        { name: 'Rasalgethi', tone: 'Informative', pitch: 'Middle pitch', gender: 'Male' },
        { name: 'Sadachbia', tone: 'Lively', pitch: 'Lower pitch', gender: 'Female' },
        { name: 'Sadaltager', tone: 'Knowledgeable', pitch: 'Middle pitch', gender: 'Male' },
        { name: 'Schedar', tone: 'Even', pitch: 'Lower middle pitch', gender: 'Male' },
        { name: 'Sulafat', tone: 'Warm', pitch: 'Middle pitch', gender: 'Female' },
        { name: 'Umbriel', tone: 'Easy-going', pitch: 'Lower middle pitch', gender: 'Male' },
        { name: 'Vindemiatrix', tone: 'Gentle', pitch: 'Middle pitch', gender: 'Female' },
        { name: 'Zephyr', tone: 'Bright', pitch: 'Higher pitch', gender: 'Female' },
        { name: 'Zubenelgenubi', tone: 'Casual', pitch: 'Lower middle pitch', gender: 'Male' }
    ];

    static VOICE_TRAITS = [
        'All', 'Soft', 'Friendly', 'Gravelly', 'Smooth', 'Firm', 'Breezy', 'Bright',
        'Easy-going', 'Informative', 'Breathy', 'Clear', 'Excitable', 'Mature',
        'Upbeat', 'Youthful', 'Forward', 'Lively', 'Knowledgeable', 'Even',
        'Warm', 'Gentle', 'Casual', 'Female', 'Male', 'Higher pitch',
        'Middle pitch', 'Lower middle pitch', 'Lower pitch'
    ];

    static STYLE_OPTIONS = [
        { label: 'Enthusiastic', value: 'Enthusiastic and energetic' },
        { label: 'Casual / Natural', value: 'Casual, relaxed, and conversational' },
        { label: 'Professional / Informative', value: 'Authoritative, clear, and informative' },
        { label: 'Storyteller / Suspense', value: 'Mysterious, cinematic, intimate storyteller' },
        { label: 'Cheerful / Upbeat', value: 'Bright, cheerful, and sunny with a vocal smile' },
        { label: 'Calm / Gentle', value: 'Soft, gentle, calm, and soothing' },
        { label: 'Tired / Bored', value: 'Slow, tired, and unenthusiastic' }
    ];

    static PACE_OPTIONS = [
        { label: 'Natural / Steady', value: 'Steady, conversational pace' },
        { label: 'Fast & Punchy', value: 'Fast-paced, rapid energetic delivery' },
        { label: 'Very Fast', value: 'Speak as fast as possible' },
        { label: 'Slow & Dramatic', value: 'Slow tempo with dramatic pauses' },
        { label: 'Very Slow', value: 'Very slow, measured delivery' }
    ];

    static ACCENT_OPTIONS = [
        { label: 'Standard English', value: 'Standard English' },
        { label: 'British (London)', value: 'British English accent as heard in London' },
        { label: 'British (Received Pronunciation)', value: 'Classic British RP accent' },
        { label: 'British (Scottish)', value: 'Scottish English accent' },
        { label: 'American (General)', value: 'General American accent' },
        { label: 'American (Southern)', value: 'Southern American drawl accent' },
        { label: 'American (New York)', value: 'New York American accent' },
        { label: 'Vietnamese (Native Natural)', value: 'Natural native Vietnamese accent' },
        { label: 'Vietnamese (Southern/Saigon)', value: 'Southern Vietnamese Saigon accent' },
        { label: 'Vietnamese (Northern/Hanoi)', value: 'Northern Vietnamese Hanoi accent' },
        { label: 'Australian', value: 'Australian English accent' },
        { label: 'Canadian', value: 'Canadian English accent' },
        { label: 'Irish', value: 'Irish English accent' },
        { label: 'Indian English', value: 'Indian English accent' },
        { label: 'Japanese Accent English', value: 'Japanese accented English' },
        { label: 'French Accent English', value: 'French accented English' },
        { label: 'German Accent English', value: 'German accented English' },
        { label: 'Spanish Accent English', value: 'Spanish accented English' }
    ];

    static async getAllApiKeys() {
        const keysSet = new Set();

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

        ['nexus_gemini_api_key', 'gemini_api_key', 'geminiApiKey'].forEach(storageKey => {
            const val = localStorage.getItem(storageKey);
            if (val && typeof val === 'string') {
                val.split(',').forEach(k => {
                    const trimmed = k.trim();
                    if (trimmed) keysSet.add(trimmed);
                });
            }
        });

        if (typeof window !== 'undefined' && window.__nexusGeminiApiKey) {
            window.__nexusGeminiApiKey.split(',').forEach(k => {
                const trimmed = k.trim();
                if (trimmed) keysSet.add(trimmed);
            });
        }

        return Array.from(keysSet);
    }

    static getTodayString() {
        const now = new Date();
        return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
    }

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
                console.warn(`[TTS] Key index ${currentIndex} failed: ${err.message}. Rotating to next key...`);

                if (err.message && (err.message.includes('Please enter text') || err.message.includes('prompt classifier'))) {
                    throw err;
                }
            }
        }

        throw lastError || new Error('All Gemini API keys failed.');
    }

    static buildPrompt({ mode, script, audioProfile, style, pace, accent, speaker1Name = 'Speaker 1', speaker2Name = 'Speaker 2' }) {
        let prompt = '';

        if (audioProfile && audioProfile.trim()) {
            prompt += `# AUDIO PROFILE\n${audioProfile.trim()}\n\n`;
        }

        const hasNotes = Boolean((style && style.trim()) || (pace && pace.trim()) || (accent && accent.trim()));
        if (hasNotes) {
            prompt += `### DIRECTOR'S NOTES\n`;
            if (style && style.trim()) prompt += `Style: ${style.trim()}\n`;
            if (pace && pace.trim()) prompt += `Pacing: ${pace.trim()}\n`;
            if (accent && accent.trim()) prompt += `Accent: ${accent.trim()}\n`;
            prompt += `\n`;
        }

        if (mode === 'multi') {
            if (!prompt) {
                return `TTS the following conversation between ${speaker1Name} and ${speaker2Name}:\n${script}`;
            }
            prompt += `#### TRANSCRIPT\nTTS the following conversation between ${speaker1Name} and ${speaker2Name}:\n${script}`;
        } else {
            if (!prompt) {
                return script;
            }
            prompt += `#### TRANSCRIPT\n${script}`;
        }

        return prompt;
    }

    static async generateSpeech({
        mode = 'single',
        script = '',
        voice = 'Kore',
        voice2 = 'Puck',
        speaker1 = 'Speaker 1',
        speaker2 = 'Speaker 2',
        audioProfile = '',
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
            audioProfile,
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

        const selectedModel = await this.getSelectedTtsModel();
        const modelName = selectedModel || this.MODEL;

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
            model: modelName
        };

        return await this.fetchWithRotation(keys, async (currentKey) => {
            const url = `${this.API_ENDPOINT}/${modelName}:generateContent?key=${encodeURIComponent(currentKey)}`;

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
                if (part?.text) {
                    throw new Error(`The model returned text instead of audio: "${part.text.substring(0, 100)}...". Please try again.`);
                }
                throw new Error('No audio data received in response.');
            }

            const pcmBytes = this.base64ToUint8Array(base64Audio);
            const durationSeconds = pcmBytes.length / (24000 * 2);
            const wavBlob = this.pcmToWav(pcmBytes, 1, 24000, 16);
            const audioUrl = URL.createObjectURL(wavBlob);

            return {
                blob: wavBlob,
                wavBlob: wavBlob,
                audioUrl: audioUrl,
                sampleRate: 24000,
                durationSeconds: durationSeconds
            };
        });
    }

    static base64ToUint8Array(base64) {
        const binaryString = window.atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
    }

    static async pcmToWebmBlob(pcmBytes, sampleRate = 24000) {
        const numSamples = pcmBytes.length / 2;
        const int16 = new Int16Array(pcmBytes.buffer, pcmBytes.byteOffset, numSamples);
        const float32 = new Float32Array(numSamples);
        for (let i = 0; i < numSamples; i++) {
            float32[i] = int16[i] / 32768.0;
        }

        const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate });
        const audioBuffer = audioCtx.createBuffer(1, numSamples, sampleRate);
        audioBuffer.copyToChannel(float32, 0);

        const dest = audioCtx.createMediaStreamDestination();
        const source = audioCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(dest);

        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
            ? 'audio/webm;codecs=opus'
            : (MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '');

        return new Promise((resolve, reject) => {
            try {
                const recorder = mimeType ? new MediaRecorder(dest.stream, { mimeType }) : new MediaRecorder(dest.stream);
                const chunks = [];

                recorder.ondataavailable = (e) => {
                    if (e.data && e.data.size > 0) chunks.push(e.data);
                };

                recorder.onstop = () => {
                    const finalBlob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
                    audioCtx.close().catch(() => {});
                    resolve(finalBlob);
                };

                recorder.onerror = (e) => {
                    audioCtx.close().catch(() => {});
                    reject(e.error || new Error('MediaRecorder error'));
                };

                recorder.start(10);
                source.start(0);

                const durationMs = (numSamples / sampleRate) * 1000;
                setTimeout(() => {
                    if (recorder.state !== 'inactive') {
                        recorder.stop();
                    }
                }, durationMs + 80);
            } catch (err) {
                audioCtx.close().catch(() => {});
                reject(err);
            }
        });
    }

    static pcmToWav(pcmData, numChannels = 1, sampleRate = 24000, bitsPerSample = 16) {
        const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
        const blockAlign = (numChannels * bitsPerSample) / 8;
        const dataLength = pcmData.length;
        const bufferLength = 44 + dataLength;
        const buffer = new ArrayBuffer(bufferLength);
        const view = new DataView(buffer);

        const writeString = (offset, string) => {
            for (let i = 0; i < string.length; i++) {
                view.setUint8(offset + i, string.charCodeAt(i));
            }
        };

        writeString(0, 'RIFF');
        view.setUint32(4, 36 + dataLength, true);
        writeString(8, 'WAVE');

        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, byteRate, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, bitsPerSample, true);

        writeString(36, 'data');
        view.setUint32(40, dataLength, true);

        const uint8View = new Uint8Array(buffer, 44);
        uint8View.set(pcmData);

        return new Blob([buffer], { type: 'audio/wav' });
    }

    static _sampleCache = new Map();

    static async previewVoiceSample(voiceName) {
        if (!this._sampleCache) {
            this._sampleCache = new Map();
        }

        if (this._sampleCache.has(voiceName)) {
            return this._sampleCache.get(voiceName);
        }

        try {
            const assetUrl = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL
                ? chrome.runtime.getURL(`assets/audio/samples/${voiceName}.mp3`)
                : `../../assets/audio/samples/${voiceName}.mp3`;

            const checkRes = await fetch(assetUrl, { method: 'HEAD' });
            if (checkRes.ok) {
                const resObj = { audioUrl: assetUrl };
                this._sampleCache.set(voiceName, resObj);
                return resObj;
            }
        } catch (_) {}

        const sampleText = `Hello, I'm ${voiceName}. How can I help you today?`;
        const result = await this.generateSpeech({
            script: sampleText,
            voice: voiceName,
            mode: 'single'
        });

        this._sampleCache.set(voiceName, result);
        return result;
    }

    static async getSelectedTtsModel() {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            try {
                const res = await new Promise(resolve => chrome.storage.local.get(['ttsModel'], resolve));
                if (res && res.ttsModel) return res.ttsModel;
            } catch (_) {}
        }
        return 'gemini-2.5-flash';
    }

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

    static downloadMp3(blob, filename = 'speech.mp3') {
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

export class GroqAligner {
    static async getGroqApiKey() {
        const keysSet = new Set();
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            try {
                const res = await new Promise(resolve => chrome.storage.local.get(null, resolve));
                if (res) {
                    if (res.groqApiKey && typeof res.groqApiKey === 'string') {
                        res.groqApiKey.split(',').forEach(k => {
                            const trimmed = k.trim();
                            if (trimmed) keysSet.add(trimmed);
                        });
                    }
                    const providers = res.providers || [];
                    if (Array.isArray(providers)) {
                        providers.forEach(p => {
                            const isGroq = p.id === 'groq' || p.id === 'groq-default' ||
                                (typeof p.endpoint === 'string' && p.endpoint.includes('groq.com')) ||
                                (p.name?.toLowerCase().includes('groq') || p.id?.toLowerCase().includes('groq'));
                            if (isGroq && p.apiKey && typeof p.apiKey === 'string') {
                                p.apiKey.split(',').forEach(k => {
                                    const trimmed = k.trim();
                                    if (trimmed) keysSet.add(trimmed);
                                });
                            }
                        });
                    }
                }
            } catch (_) {}
        }
        ['nexus_groq_api_key', 'groq_api_key', 'groqApiKey'].forEach(storageKey => {
            const val = localStorage.getItem(storageKey);
            if (val && typeof val === 'string') {
                val.split(',').forEach(k => {
                    const trimmed = k.trim();
                    if (trimmed) keysSet.add(trimmed);
                });
            }
        });
        const keys = Array.from(keysSet);
        return keys.length > 0 ? keys[0] : '';
    }

    static async getSelectedSttModel() {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            try {
                const res = await new Promise(resolve => chrome.storage.local.get(['sttModel'], resolve));
                if (res && res.sttModel) return res.sttModel;
            } catch (_) {}
        }
        return 'whisper-large-v3-turbo';
    }

    static async align(blob, originalScript = '') {
        try {
            const apiKey = await this.getGroqApiKey();
            if (!apiKey) {
                console.warn('[GroqAligner] No Groq API key found in settings. Skipping automatic transcription alignment.');
                return null;
            }

            const model = await this.getSelectedSttModel();
            const formData = new FormData();
            const audioFile = new File([blob], 'audio.mp3', { type: blob.type || 'audio/mp3' });
            formData.append('file', audioFile);
            formData.append('model', model);
            formData.append('response_format', 'verbose_json');
            formData.append('timestamp_granularities[]', 'segment');
            formData.append('timestamp_granularities[]', 'word');
            formData.append('language', 'en');

            const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`
                },
                body: formData
            });

            if (!response.ok) {
                const errText = await response.text();
                console.warn(`[GroqAligner] Groq STT failed (${response.status}):`, errText);
                return null;
            }

            const data = await response.json();
            const rawSegments = data.segments || [];
            const rawWords = data.words || [];

            const segments = rawSegments.map((s, idx) => ({
                id: idx,
                text: (s.text || '').trim(),
                start: typeof s.start === 'number' ? s.start : 0,
                end: typeof s.end === 'number' ? s.end : 0
            })).filter(s => s.text.length > 0);

            const words = rawWords.map(w => ({
                word: (w.word || '').trim(),
                start: typeof w.start === 'number' ? w.start : 0,
                end: typeof w.end === 'number' ? w.end : 0
            })).filter(w => w.word.length > 0);

            return {
                text: data.text || '',
                segments: segments,
                words: words
            };
        } catch (err) {
            console.warn('[GroqAligner] Error during Groq transcription:', err);
            return null;
        }
    }
}

if (typeof globalThis !== 'undefined') {
    globalThis.TTSDB = TTSDB;
    globalThis.TTSManager = TTSManager;
    globalThis.GroqAligner = GroqAligner;
}
