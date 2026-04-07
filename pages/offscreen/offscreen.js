import { EdgeTTS } from '../../lib/edge-tts/edge-tts.js';

let currentAudio = null;
let currentAudioResolve = null; // Resolve callback for the active playSound promise

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // 1. New Handler: Edge TTS
    if (request.action === 'offscreen_playEdgeTTS') {
        playEdgeTTS(request.text, request.voice, request.speed)
            .then(() => sendResponse({ success: true }))
            .catch(err => {
                console.error('EdgeTTS Error:', err);
                sendResponse({ error: err.message });
            });
        return true;
    }

    // 2. Legacy Handler: Play Audio URL (Oxford/Google fallback)
    if (request.action === 'offscreen_playAudio') {
        playAudio(request.url, request.speed)
            .then(() => sendResponse({ success: true }))
            .catch(err => sendResponse({ error: err.message }));
        return true;
    }

    // 3. Legacy Handler: Play Base64 Data
    if (request.action === 'offscreen_playBase64') {
        console.log('[Offscreen] playBase64', { size: request.data?.length, speed: request.speed });
        playBase64(request.data, request.speed)
            .then(() => sendResponse({ success: true }))
            .catch(err => sendResponse({ error: err.message }));
        return true;
    }

    // Stop Handlers
    if (request.action === 'offscreen_stopAudio' || request.action === 'offscreen_stopGoogleAudio') {
        stopCurrentAudio(); // also resolves any hanging playSound promise
        sendResponse({ success: true });
        return false;
    }
});

async function playEdgeTTS(text, voice = 'en-US-AriaNeural', speed = 1.0) {
    stopCurrentAudio();

    try {
        const tts = new EdgeTTS();

        let rateStr = '0%';
        if (speed !== 1.0) {
            // Convert speed (0.5 to 2.0) to percentage string
            // 1.0 -> 0%
            // 2.0 -> +100%
            // 0.5 -> -50%
            const percentage = Math.round((speed - 1.0) * 100);
            rateStr = (percentage >= 0 ? '+' : '') + percentage + '%';
        }

        await tts.synthesize(text, voice, {
            rate: rateStr,
            pitch: '+0Hz',
            volume: '100%'
        });

        const audioData = tts.getAudioData();
        const audioBlob = new Blob([audioData], { type: 'audio/mp3' });
        const audioUrl = URL.createObjectURL(audioBlob);

        await playSound(audioUrl);

    } catch (e) {
        throw e;
    }
}

async function playAudio(url, speed) {
    stopCurrentAudio();
    await playSound(url, speed);
}

async function playBase64(data, speed) {
    stopCurrentAudio();
    await playSound(data, speed);
}

function stopCurrentAudio() {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
    }
    // Resolve any hanging playSound promise so callers aren't stuck forever
    // (paused audio never fires onended, which would leave the promise pending)
    if (currentAudioResolve) {
        currentAudioResolve();
        currentAudioResolve = null;
    }
}

function playSound(url, speed = 1.0) {
    return new Promise((resolve, reject) => {
        const audio = new Audio(url);
        audio.playbackRate = speed;
        currentAudio = audio;
        currentAudioResolve = resolve; // track so stopCurrentAudio can resolve it

        audio.onended = () => {
            currentAudio = null;
            currentAudioResolve = null;
            resolve();
        };

        audio.onerror = (e) => {
            currentAudio = null;
            currentAudioResolve = null;
            reject(new Error('Audio playback failed'));
        };

        audio.play().catch(reject);
    });
}
