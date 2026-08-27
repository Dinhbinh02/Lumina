export function getLemma(w) {
    if (!w) return '';
    const word = w.toLowerCase().trim();
    if (word.endsWith('ss')) return word;
    if (word.endsWith('ies')) return word.slice(0, -3) + 'y';
    if (word.endsWith('es')) {
        const base = word.slice(0, -2);
        if (base.endsWith('sh') || base.endsWith('ch') || base.endsWith('x') || base.endsWith('s') || base.endsWith('z')) {
            return base;
        }
        return word.slice(0, -1);
    }
    if (word.endsWith('s') && !word.endsWith('us') && !word.endsWith('is') && !word.endsWith('as')) {
        return word.slice(0, -1);
    }
    return word;
}

export function getAmericanSpelling(w) {
    if (!w) return '';
    return w
        .replace(/isation/gi, 'ization')
        .replace(/isations/gi, 'izations')
        .replace(/ise\b/gi, 'ize')
        .replace(/ises\b/gi, 'izes')
        .replace(/ised\b/gi, 'ized')
        .replace(/ising\b/gi, 'izing')
        .replace(/yse\b/gi, 'yze')
        .replace(/yses\b/gi, 'yzes')
        .replace(/ysed\b/gi, 'yzed')
        .replace(/ysing\b/gi, 'yzing');
}

export async function stopGoogleAudioOffscreen() {
    if ((await chrome.offscreen.hasDocument())) {
        return await chrome.runtime.sendMessage({
            action: 'offscreen_stopGoogleAudio'
        }).catch(() => { });
    }
}

export async function fetchAudio(text, speed = 1.0, forcedLang = null) {
    if (!text) return { type: null, chunks: [] };
    let normalizedText = text.trim();
    normalizedText = normalizedText.replace(/_/g, ' ');
    const acronymsToSpellOut = ['id', 'url', 'ip', 'io', 'os', 'ui', 'db', 'api', 'ssl', 'tls', 'dto', 'dao'];
    acronymsToSpellOut.forEach(acronym => {
        const regex = new RegExp(`\\b${acronym}\\b`, 'gi');
        normalizedText = normalizedText.replace(regex, acronym.toUpperCase().split('').join(' '));
    });
    const wordCount = normalizedText.split(/\s+/).length;
    const detectLanguage = (t) => {
        let counts = { vietnamese: 0, chinese: 0, japanese: 0, korean: 0, cyrillic: 0, latin: 0 };
        const vietnameseRegex = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/gi;
        for (const char of t) {
            const code = char.charCodeAt(0);
            if (code >= 0x4E00 && code <= 0x9FFF) counts.chinese++;
            else if (code >= 0x3040 && code <= 0x30FF) counts.japanese++;
            else if (code >= 0xAC00 && code <= 0xD7AF) counts.korean++;
            else if (code >= 0x0400 && code <= 0x04FF) counts.cyrillic++;
            else if ((code >= 0x0041 && code <= 0x007A) || (code >= 0x00C0 && code <= 0x00FF)) counts.latin++;
        }
        const vietnameseMatches = t.match(vietnameseRegex);
        if (vietnameseMatches) counts.vietnamese = vietnameseMatches.length;
        const total = Object.values(counts).reduce((a, b) => a + b, 0);
        if (total === 0) return 'en-GB';
        const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
        const langMap = { chinese: 'zh-CN', japanese: 'ja', korean: 'ko', cyrillic: 'ru', latin: 'en-GB', vietnamese: 'vi' };
        if (dominant[0] === 'latin' && counts.vietnamese > 0 && counts.vietnamese / counts.latin > 0.15) return 'vi';
        return langMap[dominant[0]] || 'en-GB';
    };
    const lang = forcedLang || detectLanguage(normalizedText);
    const fetchToBase64 = async (url, opts = {}) => {
        const response = await fetch(url, opts);
        if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status });
        const contentType = response.headers.get('Content-Type');
        if (contentType && !contentType.includes('audio') && !contentType.includes('mpeg')) throw new Error('Invalid content type');
        const arrayBuffer = await response.arrayBuffer();
        if (arrayBuffer.byteLength < 100) throw new Error('Empty audio');
        const base64 = btoa(new Uint8Array(arrayBuffer).reduce((d, byte) => d + String.fromCharCode(byte), ''));
        return `data:audio/mpeg;base64,${base64}`;
    };
    const stripListPrefix = (q) =>
        q.replace(/^\s*(?:[a-zA-Z\d]{1,2}\)|[a-zA-Z\d]{1,2}\.|[•\-–—])\s+/, '').trim();
    const googleUrl = (q) => {
        const cleaned = stripListPrefix(q);
        return `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(cleaned)}&tl=${lang}&total=1&idx=0&textlen=${cleaned.length}&client=gtx&prev=input&ttsspeed=${speed}`;
    };
    const MAX_CHUNK_CHARS = 200;
    const splitIntoChunks = (text) => {
        const sentences = text.match(/[^.?!]+[.?!]+/g) || [];
        const lastSentenceEnd = sentences.reduce((acc, s) => acc + s.length, 0);
        if (lastSentenceEnd < text.length) sentences.push(text.slice(lastSentenceEnd).trim());
        const level1 = sentences.map(s => s.trim()).filter(s => s.replace(/[.?!,;:]/g, '').trim().length >= 2);
        const base = level1.length >= 2 ? level1 : [text];
        const level2 = [];
        for (const chunk of base) {
            if (chunk.length <= MAX_CHUNK_CHARS) { level2.push(chunk); continue; }
            const clauses = chunk.split(/(?<=[,;–—])\s+/);
            if (clauses.length >= 2) {
                let current = '';
                for (const clause of clauses) {
                    if (current && (current + ' ' + clause).length > MAX_CHUNK_CHARS) {
                        level2.push(current.trim());
                        current = clause;
                    } else {
                        current = current ? current + ' ' + clause : clause;
                    }
                }
                if (current.trim()) level2.push(current.trim());
            } else {
                level2.push(chunk);
            }
        }
        const WORDS_PER_CHUNK = 25;
        const final = [];
        for (const chunk of level2) {
            if (chunk.length <= MAX_CHUNK_CHARS) { final.push(chunk); continue; }
            const words = chunk.split(/\s+/);
            for (let i = 0; i < words.length; i += WORDS_PER_CHUNK) {
                final.push(words.slice(i, i + WORDS_PER_CHUNK).join(' '));
            }
        }
        return final.filter(Boolean);
    };
    const fetchGoogle = async () => {
        try {
            const data = await fetchToBase64(googleUrl(normalizedText), { referrerPolicy: 'no-referrer' });
            return [data];
        } catch (e) {
            if (e.status !== 400) return [];
        }
        const chunks = splitIntoChunks(normalizedText);
        const results = new Array(chunks.length).fill(null);
        await Promise.all(chunks.map(async (chunk, i) => {
            try { results[i] = await fetchToBase64(googleUrl(chunk), { referrerPolicy: 'no-referrer' }); }
            catch (e) { results[i] = null; }
        }));
        return results.filter(Boolean);
    };
    if (wordCount <= 2) {
        const audioText = getAmericanSpelling(normalizedText);
        const oxfordUrl = `https://ssl.gstatic.com/dictionary/static/sounds/oxford/${audioText.toLowerCase()}--_gb_1.mp3`;
        const oxfordPromise = fetchToBase64(oxfordUrl).catch(() => null);
        const googlePromise = fetchGoogle();
        const oxfordData = await oxfordPromise;
        if (oxfordData) {
            return { type: 'oxford', chunks: [oxfordData] };
        }
        const googleChunks = await googlePromise;
        return { type: 'google', chunks: googleChunks };
    }
    const googleChunks = await fetchGoogle();
    return { type: 'google', chunks: googleChunks };
}
