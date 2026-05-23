

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

function stopCurrentAudio() {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
    }
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
        currentAudioResolve = resolve;

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
