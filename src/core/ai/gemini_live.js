export class GeminiLiveClient {
    constructor(options = {}) {
        this.apiKey = options.apiKey || '';
        this.modelName = options.modelName || 'gemini-3.1-flash-live-preview';
        this.voiceName = options.voiceName || 'Puck';
        this.ws = null;

        this.inputAudioCtx = null;
        this.outputAudioCtx = null;
        this.mediaStream = null;
        this.audioProcessor = null;

        this.audioQueue = [];
        this.isPlaying = false;
        this.scheduledTime = 0;
        this.activeSources = [];

        this.isVisionEnabled = false;
        this.visionTimer = null;

        this.isManualDisconnect = false;
        this.isReconnecting = false;

        this.onStatusChange = options.onStatusChange || (() => {});
        this.onTranscript = options.onTranscript || (() => {});
        this.onVolumeWave = options.onVolumeWave || (() => {});
        this.onError = options.onError || (() => {});
    }

    async connect() {
        if (!this.apiKey) {
            this.onError('API Key is missing. Please set your Gemini API Key in Lumina Settings.');
            return false;
        }

        this.isManualDisconnect = false;
        const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${this.apiKey}`;
        this.onStatusChange('connecting', 'Connecting to Gemini Live...');

        try {
            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                this.onStatusChange('connected', 'Connected. Sending setup...');
                this._sendSetupPayload();
                if (!this.mediaStream) {
                    this._initMicrophone();
                }
            };

            this.ws.onmessage = (event) => {
                this._handleServerMessage(event.data);
            };

            this.ws.onerror = (err) => {
                console.error('[Gemini Live WSS Error]', err);
                this.onError('WebSocket connection error.');
                this.onStatusChange('error', 'Connection error');
            };

            this.ws.onclose = (ev) => {
                if ((ev.code === 1008 || ev.code === 1006) && !this.isManualDisconnect) {
                    this.onStatusChange('connecting', 'Auto-reconnecting session...');
                    this._reconnectGracefully();
                    return;
                }
                this.onStatusChange('disconnected', 'Disconnected');
                this.disconnect(false);
            };

            return true;
        } catch (e) {
            console.error('[Gemini Live Connect Exception]', e);
            this.onError(e.message);
            return false;
        }
    }

    _sendSetupPayload() {
        const setupMessage = {
            setup: {
                model: `models/${this.modelName}`,
                generationConfig: {
                    responseModalities: ['AUDIO'],
                    speechConfig: {
                        voiceConfig: {
                            prebuiltVoiceConfig: {
                                voiceName: this.voiceName
                            }
                        }
                    }
                },
                outputAudioTranscription: {},
                inputAudioTranscription: {}
            }
        };

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(setupMessage));
            this.onStatusChange('listening', 'Listening...');
        }
    }

    async _initMicrophone() {
        try {
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    sampleRate: 16000,
                    echoCancellation: true,
                    noiseSuppression: true
                }
            });

            this.inputAudioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
            const source = this.inputAudioCtx.createMediaStreamSource(this.mediaStream);

            const processAudioData = (inputData) => {
                if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

                let sum = 0;
                for (let i = 0; i < inputData.length; i++) {
                    sum += inputData[i] * inputData[i];
                }
                const rms = Math.sqrt(sum / inputData.length);
                this.onVolumeWave(rms);

                const pcm16 = new Int16Array(inputData.length);
                for (let i = 0; i < inputData.length; i++) {
                    const s = Math.max(-1, Math.min(1, inputData[i]));
                    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                }

                const bytes = new Uint8Array(pcm16.buffer);
                let binary = '';
                for (let i = 0; i < bytes.byteLength; i++) {
                    binary += String.fromCharCode(bytes[i]);
                }
                const base64Audio = btoa(binary);

                const realtimeMsg = {
                    realtimeInput: {
                        audio: {
                            data: base64Audio,
                            mimeType: 'audio/pcm;rate=16000'
                        }
                    }
                };
                this.ws.send(JSON.stringify(realtimeMsg));
            };

            let useWorklet = false;
            if (this.inputAudioCtx.audioWorklet) {
                try {
                    let workletUrl = 'lib/core/pcm_processor.js';
                    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
                        workletUrl = chrome.runtime.getURL('lib/core/pcm_processor.js');
                    }
                    await this.inputAudioCtx.audioWorklet.addModule(workletUrl);

                    this.audioWorkletNode = new AudioWorkletNode(this.inputAudioCtx, 'pcm-worklet-processor');
                    this.audioWorkletNode.port.onmessage = (e) => {
                        processAudioData(e.data);
                    };
                    source.connect(this.audioWorkletNode);
                    this.audioWorkletNode.connect(this.inputAudioCtx.destination);
                    useWorklet = true;
                } catch (e) {
                    console.warn('[Gemini Live AudioWorklet Fallback to ScriptProcessor]', e);
                }
            }

            if (!useWorklet) {
                this.audioProcessor = this.inputAudioCtx.createScriptProcessor(512, 1, 1);
                source.connect(this.audioProcessor);
                this.audioProcessor.connect(this.inputAudioCtx.destination);
                this.audioProcessor.onaudioprocess = (e) => {
                    processAudioData(e.inputBuffer.getChannelData(0));
                };
            }
        } catch (err) {
            console.error('[Gemini Live Mic Access Error]', err);
            this.onError('Microphone access denied or unequipped: ' + err.message);
        }
    }

    async _handleServerMessage(rawData) {
        try {
            let textData = rawData;
            if (rawData instanceof Blob) {
                textData = await rawData.text();
            } else if (rawData instanceof ArrayBuffer) {
                textData = new TextDecoder().decode(rawData);
            }
            const msg = JSON.parse(textData);

            if (msg.goAway) {
                this.onStatusChange('connecting', 'Renewing session...');
                this._reconnectGracefully();
                return;
            }

            if (msg.serverContent) {
                const sc = msg.serverContent;

                if (sc.interrupted) {
                    this._stopAudioPlayback();
                    this.onStatusChange('listening', 'Listening...');
                }

                if (sc.modelTurn && sc.modelTurn.parts) {
                    for (const part of sc.modelTurn.parts) {
                        if (part.inlineData && part.inlineData.data) {
                            this.onStatusChange('speaking', 'Gemini is speaking...');
                            this._playPcm24kChunk(part.inlineData.data);
                        }
                    }
                }

                if (sc.inputTranscription && sc.inputTranscription.text) {
                    this.onTranscript('user', sc.inputTranscription.text);
                }
                if (sc.outputTranscription && sc.outputTranscription.text) {
                    this.onTranscript('gemini', sc.outputTranscription.text);
                }

                if (sc.turnComplete) {
                    this.onStatusChange('listening', 'Listening...');
                }
            }
        } catch (err) {
            console.error('[Gemini Live Parse Error]', err, rawData);
        }
    }

    _playPcm24kChunk(base64Data) {
        if (!this.outputAudioCtx) {
            this.outputAudioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
            this.scheduledTime = this.outputAudioCtx.currentTime;
        }

        if (this.outputAudioCtx.state === 'suspended') {
            this.outputAudioCtx.resume();
        }

        const binaryStr = atob(base64Data);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
        }
        const int16Array = new Int16Array(bytes.buffer);

        const float32Array = new Float32Array(int16Array.length);
        for (let i = 0; i < int16Array.length; i++) {
            float32Array[i] = int16Array[i] / 32768.0;
        }

        const buffer = this.outputAudioCtx.createBuffer(1, float32Array.length, 24000);
        buffer.getChannelData(0).set(float32Array);

        const source = this.outputAudioCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(this.outputAudioCtx.destination);

        const now = this.outputAudioCtx.currentTime;
        if (this.scheduledTime < now) {
            this.scheduledTime = now;
        }

        source.start(this.scheduledTime);
        this.scheduledTime += buffer.duration;
        this.activeSources.push(source);

        source.onended = () => {
            const idx = this.activeSources.indexOf(source);
            if (idx !== -1) this.activeSources.splice(idx, 1);
            if (this.activeSources.length === 0) {
                this.onStatusChange('listening', 'Listening...');
            }
        };
    }

    _stopAudioPlayback() {
        for (const src of this.activeSources) {
            try {
                src.stop();
            } catch (e) {}
        }
        this.activeSources = [];
        if (this.outputAudioCtx) {
            this.scheduledTime = this.outputAudioCtx.currentTime;
        }
    }

    sendTextMessage(text) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const msg = {
                realtimeInput: {
                    text: text
                }
            };
            this.ws.send(JSON.stringify(msg));
        }
    }

    toggleVision(enable) {
        this.isVisionEnabled = enable;
        if (enable) {
            this._startVisionStreaming();
        } else {
            this._stopVisionStreaming();
        }
    }

    _startVisionStreaming() {
        this._stopVisionStreaming();
        this.visionTimer = setInterval(async () => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
            try {
                const canvas = document.createElement('canvas');
                canvas.width = 640;
                canvas.height = 360;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#111';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = '#4285f4';
                ctx.font = 'bold 24px sans-serif';
                ctx.fillText('Lumina Live Vision', 30, 60);

                const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
                const base64Jpg = dataUrl.split(',')[1];

                const msg = {
                    realtimeInput: {
                        video: {
                            data: base64Jpg,
                            mimeType: 'image/jpeg'
                        }
                    }
                };
                this.ws.send(JSON.stringify(msg));
            } catch (e) {
                console.error('[Gemini Live Vision Error]', e);
            }
        }, 1000);
    }

    _stopVisionStreaming() {
        if (this.visionTimer) {
            clearInterval(this.visionTimer);
            this.visionTimer = null;
        }
    }

    async _reconnectGracefully() {
        if (this.isReconnecting) return;
        this.isReconnecting = true;

        if (this.ws) {
            try {
                this.ws.onopen = null;
                this.ws.onmessage = null;
                this.ws.onerror = null;
                this.ws.onclose = null;
                if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
                    this.ws.close();
                }
            } catch (e) {}
            this.ws = null;
        }

        setTimeout(async () => {
            this.isReconnecting = false;
            if (!this.isManualDisconnect) {
                await this.connect();
            }
        }, 300);
    }

    disconnect(isManual = true) {
        if (isManual) {
            this.isManualDisconnect = true;
        }
        this._stopVisionStreaming();
        this._stopAudioPlayback();

        if (this.audioWorkletNode) {
            try { this.audioWorkletNode.disconnect(); } catch (e) {}
            this.audioWorkletNode = null;
        }
        if (this.audioProcessor) {
            try { this.audioProcessor.disconnect(); } catch (e) {}
            this.audioProcessor = null;
        }
        if (this.inputAudioCtx) {
            try { this.inputAudioCtx.close(); } catch (e) {}
            this.inputAudioCtx = null;
        }
        if (this.outputAudioCtx) {
            try { this.outputAudioCtx.close(); } catch (e) {}
            this.outputAudioCtx = null;
        }
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }
        if (this.ws) {
            try {
                this.ws.onopen = null;
                this.ws.onmessage = null;
                this.ws.onerror = null;
                this.ws.onclose = null;
                if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
                    this.ws.close();
                }
            } catch (e) {}
            this.ws = null;
        }
        this.onStatusChange('disconnected', 'Disconnected');
    }
}

if (typeof globalThis !== 'undefined') {
    globalThis.GeminiLiveClient = GeminiLiveClient;
}
