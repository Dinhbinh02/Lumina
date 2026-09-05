/**
 * media_loader.js - Dynamic asynchronous media & image processor for Nexus
 * Handles background image search, caching, skeleton resolution, and fallback URLs.
 */

const nexusResolvedImagesCache = new Map();

/**
 * Searches Google Images via background service worker
 * @param {string} query - Keyword to search
 * @returns {Promise<string[]>} List of image URLs
 */
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

/**
 * Scans a DOM node for pending async image placeholders (.nexus-async-image)
 * and resolves them with real image URLs from Google Images search.
 * @param {HTMLElement} rootNode - Container element or image element to process
 */
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
    window.processNexusDynamicImageElements = processNexusDynamicImageElements;
}
