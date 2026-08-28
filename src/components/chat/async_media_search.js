export async function searchGoogleImages(query) {
    return new Promise((resolve) => {
        if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return resolve([]);
        chrome.runtime.sendMessage({ action: 'fetch_images', keyword: query }, (res) => {
            if (chrome.runtime.lastError) {
                console.warn('[Nexus] fetch_images error:', chrome.runtime.lastError.message);
                resolve([]);
            } else if (res && res.success && res.images) {
                resolve(res.images);
            } else {
                resolve([]);
            }
        });
    });
}

export async function searchYoutubeVideo(query) {
    try {
        const searchUrl = `https://html.duckduckgo.com/html/?q=site:youtube.com+${encodeURIComponent(query)}`;
        const res = await fetch(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        if (!res.ok) throw new Error('Failed to fetch DDG search results');
        const text = await res.text();
        const matches = text.match(/uddg=([^&"']+)/g);
        if (matches) {
            for (const match of matches) {
                const decodedUrl = decodeURIComponent(match.substring(5));
                if (decodedUrl.includes('youtube.com/watch') || decodedUrl.includes('youtu.be/')) {
                    let id = '';
                    if (decodedUrl.includes('youtube.com/watch')) {
                        try {
                            const urlObj = new URL(decodedUrl);
                            id = urlObj.searchParams.get('v') || '';
                        } catch (e) {
                            const vMatch = decodedUrl.match(/[?&]v=([^&#]+)/);
                            if (vMatch) id = vMatch[1];
                        }
                    } else {
                        id = decodedUrl.split('/').pop() || '';
                    }
                    if (id) {
                        return {
                            id,
                            url: `https://www.youtube.com/watch?v=${id}`,
                            embedUrl: `https://www.youtube.com/embed/${id}`
                        };
                    }
                }
            }
        }
    } catch (e) {
        console.warn('[Nexus] searchYoutubeVideo failed:', e);
    }
    return null;
}
