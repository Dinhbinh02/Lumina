import { searchGoogleImages, searchYoutubeVideo } from './async_media_search.js';

const nexusResolvedYoutubeCache = new Map();
const nexusResolvedImagesCache = new Map();

export function processNexusDynamicYoutubeElements(rootNode) {
    if (!rootNode) return;
    const yts = [];
    if (rootNode.classList && rootNode.classList.contains('nexus-youtube-dynamic') && !rootNode.classList.contains('is-loading-started')) {
        yts.push(rootNode);
    }
    if (rootNode.querySelectorAll) {
        const found = rootNode.querySelectorAll('.nexus-youtube-dynamic:not(.is-loading-started)');
        found.forEach(y => yts.push(y));
    }
    yts.forEach(async (yt) => {
        yt.classList.add('is-loading-started');
        const rawQuery = yt.getAttribute('data-query') || '';
        const cleanQuery = decodeURIComponent(rawQuery).replace(/\+/g, ' ');
        if (!cleanQuery) return;
        let resolvePromise;
        if (nexusResolvedYoutubeCache.has(cleanQuery)) {
            resolvePromise = nexusResolvedYoutubeCache.get(cleanQuery);
        } else {
            resolvePromise = searchYoutubeVideo(cleanQuery);
            nexusResolvedYoutubeCache.set(cleanQuery, resolvePromise);
        }
        try {
            const videoData = await resolvePromise;
            const videoId = typeof videoData === 'object' && videoData ? videoData.id : videoData;
            if (videoId) {
                const embedUrl = `https://www.youtube.com/embed/${videoId}?origin=https://www.youtube.com`;
                const text = yt.getAttribute('data-text') || 'YouTube video player';
                yt.innerHTML = `<iframe width="100%" height="315" src="${embedUrl}" title="${text}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen class="nexus-youtube-iframe"></iframe>`;
                yt.classList.remove('is-loading');
                const answerDiv = yt.closest('.nexus-chat-answer');
                if (answerDiv) {
                    const originalHref = yt.getAttribute('data-original-href');
                    const rawText = answerDiv.getAttribute('data-raw-text') || '';
                    if (rawText.includes(originalHref)) {
                        const newHref = `youtube://${videoId}`;
                        const newRawText = rawText.replaceAll(originalHref, newHref);
                        answerDiv.setAttribute('data-raw-text', newRawText);
                        yt.setAttribute('data-original-href', newHref);
                    }
                }
            } else {
                yt.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--nexus-text-secondary); background: var(--nexus-ui-bg-light); border-radius: 12px; font-family: var(--nexus-font-family); font-size: 13px;">Không tìm thấy video phù hợp trên YouTube cho từ khóa "${cleanQuery}"</div>`;
                yt.classList.remove('is-loading');
            }
        } catch (e) {
            yt.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--nexus-text-secondary); background: var(--nexus-ui-bg-light); border-radius: 12px; font-family: var(--nexus-font-family); font-size: 13px;">Lỗi tải video YouTube</div>`;
            yt.classList.remove('is-loading');
        }
    });
}

export function processNexusDynamicImageElements(rootNode) {
    if (!rootNode) return;
    const found = [];
    if (rootNode.classList && rootNode.classList.contains('nexus-async-image')) {
        found.push(rootNode);
    }
    if (rootNode.querySelectorAll) {
        rootNode.querySelectorAll('.nexus-async-image').forEach(i => found.push(i));
    }
    const imgs = found.filter(img => {
        if (img.classList.contains('is-loading-started')) return false;
        const src = img.getAttribute('src') || '';
        return src.startsWith('data:image/svg+xml') || !src;
    });
    imgs.forEach(async (img) => {
        img.classList.add('is-loading-started');
        const rawQuery = img.getAttribute('data-query') || '';
        let cleanQuery = decodeURIComponent(rawQuery).replace(/\+/g, ' ');
        if (!cleanQuery) {
            const originalHref = img.getAttribute('data-original-href') || '';
            if (originalHref.startsWith('image-search://')) {
                const [searchUrl] = originalHref.split('#');
                const queryPart = searchUrl.replace('image-search://', '');
                cleanQuery = decodeURIComponent(queryPart).replace(/\+/g, ' ');
            }
        }
        if (!cleanQuery) return;
        if (nexusResolvedImagesCache.has(cleanQuery)) {
            try {
                const cachedResult = await nexusResolvedImagesCache.get(cleanQuery);
                if (cachedResult && cachedResult.fallbackUrls) {
                    img.dataset.fallbackUrls = JSON.stringify(cachedResult.fallbackUrls);
                }
                img.src = cachedResult ? cachedResult.url : '';
            } catch (err) {
                img.src = '';
                img.style.display = 'none';
            }
            return;
        }
        const loadPromise = (async () => {
            try {
                const urls = await searchGoogleImages(cleanQuery);
                if (urls && urls.length > 0) {
                    return { url: urls[0], fallbackUrls: urls.slice(1, 4) };
                }
            } catch (err) { }
            throw new Error('Google Image search failed');
        })();
        nexusResolvedImagesCache.set(cleanQuery, loadPromise);
        try {
            const result = await loadPromise;
            if (result && result.fallbackUrls) {
                img.dataset.fallbackUrls = JSON.stringify(result.fallbackUrls);
            }
            img.src = result ? result.url : '';
        } catch (err) {
            img.src = '';
            img.style.display = 'none';
        }
    });
}

if (typeof window !== 'undefined') {
    window.processNexusDynamicYoutubeElements = processNexusDynamicYoutubeElements;
    window.processNexusDynamicImageElements = processNexusDynamicImageElements;
}
