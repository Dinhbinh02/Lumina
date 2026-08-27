let currentAudioEl = null;
let audioAborted = false;
let audioDebounceTimer = null;
const CHUNK_GAP_MS = 50;
let audioCache = {
    text: null,
    type: null,
    data: null
};

let _contentAudioCtx = null;
function getContentAudioCtx() {
    if (!_contentAudioCtx || _contentAudioCtx.state === 'closed') {
        _contentAudioCtx = new AudioContext();
    }
    return _contentAudioCtx;
}

async function detectSilenceOffset(byteArray) {
    try {
        const ctx = getContentAudioCtx();
        const audioBuffer = await ctx.decodeAudioData(byteArray.buffer.slice(0));
        const channelData = audioBuffer.getChannelData(0);
        const THRESHOLD = 0.005;
        for (let i = 0; i < channelData.length; i++) {
            if (Math.abs(channelData[i]) > THRESHOLD) {
                return i / audioBuffer.sampleRate;
            }
        }
        return 0;
    } catch (e) {
        return 0;
    }
}

export function playBase64Locally(base64, speed = 1.0) {
    return new Promise(async (resolve) => {
        if (audioAborted) { resolve(); return; }
        let blobUrl = null;
        try {
            if (base64.startsWith('data:')) {
                const parts = base64.split(',');
                const mime = parts[0].split(':')[1].split(';')[0];
                const byteString = atob(parts[1]);
                const byteArray = new Uint8Array(byteString.length);
                for (let i = 0; i < byteString.length; i++) byteArray[i] = byteString.charCodeAt(i);
                const silenceOffset = await detectSilenceOffset(byteArray);
                const blob = new Blob([byteArray], { type: mime });
                blobUrl = URL.createObjectURL(blob);
                if (audioAborted) { URL.revokeObjectURL(blobUrl); resolve(); return; }
                const audio = new Audio(blobUrl);
                audio.playbackRate = speed;
                if (silenceOffset > 0) audio.currentTime = silenceOffset;
                currentAudioEl = audio;
                const cleanup = () => { currentAudioEl = null; if (blobUrl) URL.revokeObjectURL(blobUrl); };
                audio.onended = () => { cleanup(); resolve(); };
                audio.onerror = () => { cleanup(); resolve(); };
                audio.play().catch(() => { cleanup(); resolve(); });
                return;
            }
        } catch (e) { }
        const audio = new Audio(blobUrl || base64);
        audio.playbackRate = speed;
        currentAudioEl = audio;
        const cleanup = () => { currentAudioEl = null; if (blobUrl) URL.revokeObjectURL(blobUrl); };
        audio.onended = () => { cleanup(); resolve(); };
        audio.onerror = () => { cleanup(); resolve(); };
        audio.play().catch(() => { cleanup(); resolve(); });
    });
}

export async function playChunksSequentially(chunks, speed) {
    for (let i = 0; i < chunks.length; i++) {
        if (audioAborted) break;
        await playBase64Locally(chunks[i], speed);
        if (!audioAborted && i < chunks.length - 1) {
            await new Promise(r => setTimeout(r, CHUNK_GAP_MS));
        }
    }
}

export async function playCombinedAudio(text, forcedLang = null) {
    if (!text) return;
    if (audioDebounceTimer) { clearTimeout(audioDebounceTimer); audioDebounceTimer = null; }
    audioAborted = true;
    if (currentAudioEl) { currentAudioEl.pause(); currentAudioEl = null; }
    audioAborted = false;
    const normalizedText = text.trim();
    const cacheKey = forcedLang ? `${normalizedText}_${forcedLang}` : normalizedText;
    try {
        const storageData = await chrome.storage.local.get(['audioSpeed']);
        const speed = storageData.audioSpeed || 1.1;
        if (audioCache.text === cacheKey && audioCache.data) {
            const chunks = Array.isArray(audioCache.data) ? audioCache.data : [audioCache.data];
            await playChunksSequentially(chunks, speed);
            return;
        }
        try {
            const cached = await chrome.runtime.sendMessage({ action: 'getAudioCache', text: cacheKey });
            if (cached && cached.success && cached.data) {
                const chunks = Array.isArray(cached.data) ? cached.data : [cached.data];
                audioCache = { text: cacheKey, type: cached.type, data: cached.data };
                await playChunksSequentially(chunks, speed);
                return;
            }
        } catch (e) { }
        const result = await chrome.runtime.sendMessage({ action: 'fetchAudio', text: normalizedText, speed, lang: forcedLang });
        if (!result || !result.chunks || result.chunks.length === 0) return;
        audioCache = { text: cacheKey, type: result.type, data: result.chunks };
        await playChunksSequentially(result.chunks, speed);
        chrome.runtime.sendMessage({ action: 'setAudioCache', text: cacheKey, type: result.type, data: result.chunks }).catch(() => { });
    } catch (e) { }
}

export function stopAudio() {
    audioAborted = true;
    if (currentAudioEl) { currentAudioEl.pause(); currentAudioEl = null; }
}

if (typeof window !== 'undefined') {
    window.LuminaPlayAudio = playCombinedAudio;
    window.LuminaStopAudio = stopAudio;
}
