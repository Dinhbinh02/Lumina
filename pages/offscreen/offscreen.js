
let currentAudio = null;
let currentAudioResolve = null;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'offscreen_ping') {
        sendResponse({ success: true });
        return false;
    }
    if (request.action === 'offscreen_playEdgeTTS') {
        playEdgeTTS(request.text, request.voice, request.speed)
            .then(() => sendResponse({ success: true }))
            .catch(err => {
                console.error('EdgeTTS Error:', err);
                sendResponse({ error: err.message });
            });
        return true;
    }
    if (request.action === 'offscreen_playAudio') {
        playAudio(request.url, request.speed)
            .then(() => sendResponse({ success: true }))
            .catch(err => sendResponse({ error: err.message }));
        return true;
    }
    if (request.action === 'offscreen_playBase64') {
        console.log('[Offscreen] playBase64', { size: request.data?.length, speed: request.speed });
        playBase64(request.data, request.speed)
            .then(() => sendResponse({ success: true }))
            .catch(err => sendResponse({ error: err.message }));
        return true;
    }
    if (request.action === 'offscreen_stopAudio' || request.action === 'offscreen_stopGoogleAudio') {
        stopCurrentAudio();
        sendResponse({ success: true });
        return false;
    }
});

async function playEdgeTTS(text, voice = 'en-US-AriaNeural', speed = 1.0) {
    stopCurrentAudio();
    throw new Error('EdgeTTS not available (dependency missing)');
}

async function playAudio(url, speed) {
    stopCurrentAudio();
    await playSound(url, speed);
}

async function playBase64(data, speed) {
    stopCurrentAudio();
    await playSound(data, speed);
}

let audioCtx = null;
let audioSource = null;

function trimAudioBufferSilence(audioBuffer, threshold = 0.002) {
    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    let firstSoundIndex = audioBuffer.length;
    for (let c = 0; c < numChannels; c++) {
        const channelData = audioBuffer.getChannelData(c);
        for (let i = 0; i < channelData.length; i++) {
            if (Math.abs(channelData[i]) > threshold) {
                if (i < firstSoundIndex) {
                    firstSoundIndex = i;
                }
                break;
            }
        }
    }
    if (firstSoundIndex >= audioBuffer.length || firstSoundIndex === 0) {
        return audioBuffer;
    }
    const trimmedLength = audioBuffer.length - firstSoundIndex;
    const trimmedBuffer = (audioCtx || new (window.AudioContext || window.webkitAudioContext)()).createBuffer(numChannels, trimmedLength, sampleRate);
    for (let c = 0; c < numChannels; c++) {
        const channelData = audioBuffer.getChannelData(c);
        const trimmedChannelData = trimmedBuffer.getChannelData(c);
        for (let i = 0; i < trimmedLength; i++) {
            trimmedChannelData[i] = channelData[firstSoundIndex + i];
        }
    }
    return trimmedBuffer;
}

function stopCurrentAudio() {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
    }
    if (audioSource) {
        try {
            audioSource.stop();
        } catch (e) {}
        audioSource = null;
    }
    if (currentAudioResolve) {
        currentAudioResolve();
        currentAudioResolve = null;
    }
}

function playSound(url, speed = 1.0) {
    return new Promise(async (resolve, reject) => {
        currentAudioResolve = resolve;
        try {
            if (!audioCtx) {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (audioCtx.state === 'suspended') {
                await audioCtx.resume();
            }
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            let audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
            audioBuffer = trimAudioBufferSilence(audioBuffer);
            const source = audioCtx.createBufferSource();
            source.buffer = audioBuffer;
            source.playbackRate.value = speed;
            source.connect(audioCtx.destination);
            audioSource = source;
            source.onended = () => {
                if (audioSource === source) {
                    audioSource = null;
                    currentAudioResolve = null;
                    resolve();
                }
            };
            source.start(0);
        } catch (err) {
            audioSource = null;
            currentAudioResolve = null;
            reject(err);
        }
    });
}
