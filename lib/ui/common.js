function morphDOM(container, newHTML) {
    const parser = new DOMParser();
    const newDoc = parser.parseFromString(newHTML, 'text/html');
    const newBody = newDoc.body;

    function syncChildren(oldParent, newParent) {
        const oldChildren = Array.from(oldParent.childNodes);
        const newChildren = Array.from(newParent.childNodes);
        
        const alignedOldChildren = newChildren.map(newChild => {
            if (newChild.nodeType !== Node.ELEMENT_NODE) {
                const matchIdx = oldChildren.findIndex(o => o.nodeType === newChild.nodeType);
                if (matchIdx !== -1) {
                    return oldChildren.splice(matchIdx, 1)[0];
                }
                return null;
            }

            if (newChild.classList && newChild.classList.contains('lumina-image-wrapper')) {
                const newImgTag = newChild.querySelector('img');
                const href = newImgTag ? newImgTag.getAttribute('data-original-href') : null;
                if (href) {
                    const matchIdx = oldChildren.findIndex(o => {
                        if (!o.classList || !o.classList.contains('lumina-image-wrapper')) return false;
                        const oImg = o.querySelector('img');
                        return oImg && oImg.getAttribute('data-original-href') === href;
                    });
                    if (matchIdx !== -1) {
                        return oldChildren.splice(matchIdx, 1)[0];
                    }
                }
            }

            const matchIdx = oldChildren.findIndex(o => o.tagName === newChild.tagName && o.nodeType === newChild.nodeType);
            if (matchIdx !== -1) {
                return oldChildren.splice(matchIdx, 1)[0];
            }
            return null;
        });

        const copyBtns = oldChildren.filter(o => o.classList && o.classList.contains('lumina-code-copy-btn'));
        
        oldChildren.forEach(o => {
            if (!o.classList || !o.classList.contains('lumina-code-copy-btn')) {
                o.remove();
            }
        });

        alignedOldChildren.forEach((alignedChild, idx) => {
            const currentChild = oldParent.childNodes[idx];
            if (!alignedChild) {
                const newImported = oldParent.ownerDocument.importNode(newChildren[idx], true);
                if (currentChild) {
                    oldParent.insertBefore(newImported, currentChild);
                } else {
                    oldParent.appendChild(newImported);
                }
            } else {
                if (currentChild !== alignedChild) {
                    if (currentChild) {
                        oldParent.insertBefore(alignedChild, currentChild);
                    } else {
                        oldParent.appendChild(alignedChild);
                    }
                }
                syncNodes(alignedChild, newChildren[idx]);
            }
        });

        if (copyBtns.length > 0 && oldParent.tagName === 'PRE') {
            copyBtns.forEach(btn => {
                if (oldParent.lastChild !== btn) {
                    oldParent.appendChild(btn);
                }
            });
        }
    }

    function syncNodes(oldNode, newNode) {
        if (oldNode.nodeType === Node.TEXT_NODE && newNode.nodeType === Node.TEXT_NODE) {
            if (oldNode.textContent !== newNode.textContent) {
                oldNode.textContent = newNode.textContent;
            }
            return;
        }

        if (oldNode.nodeType !== newNode.nodeType || oldNode.tagName !== newNode.tagName) {
            oldNode.parentNode.replaceChild(oldNode.ownerDocument.importNode(newNode, true), oldNode);
            return;
        }

        const oldAttrs = oldNode.attributes;
        const newAttrs = newNode.attributes;
        
        if (oldAttrs) {
            for (let i = oldAttrs.length - 1; i >= 0; i--) {
                const attr = oldAttrs[i].name;
                if (attr === 'style' && oldNode.classList && 
                    (oldNode.classList.contains('lumina-media-skeleton') || oldNode.classList.contains('lumina-async-image') || oldNode.classList.contains('lumina-youtube-dynamic'))) {
                    continue;
                }
                if (!newNode.hasAttribute(attr)) {
                    oldNode.removeAttribute(attr);
                }
            }
        }
        if (newAttrs) {
            for (let i = 0; i < newAttrs.length; i++) {
                const attr = newAttrs[i].name;
                const val = newAttrs[i].value;
                
                if (oldNode.tagName === 'IMG' && attr === 'src') {
                    const isNewPlaceholder = val.startsWith('data:image/svg+xml');
                    const isOldReal = oldNode.src && !oldNode.src.startsWith('data:image/svg+xml');
                    if (isNewPlaceholder && isOldReal) {
                        continue;
                    }
                }

                if (oldNode.tagName === 'IMG' && attr === 'class') {
                    const newClasses = val.split(' ');
                    const oldClasses = Array.from(oldNode.classList);
                    oldClasses.forEach(c => {
                        if (c.startsWith('is-loading') || c === 'copied' || c === 'btn-applied') {
                            if (!newClasses.includes(c)) newClasses.push(c);
                        }
                    });
                    oldNode.setAttribute('class', newClasses.join(' '));
                    continue;
                }

                if (oldNode.classList && oldNode.classList.contains('lumina-image-wrapper') && attr === 'class') {
                    const newClasses = val.split(' ');
                    if (!oldNode.classList.contains('is-loading')) {
                        const idx = newClasses.indexOf('is-loading');
                        if (idx !== -1) newClasses.splice(idx, 1);
                    }
                    oldNode.setAttribute('class', newClasses.join(' '));
                    continue;
                }

                if (oldNode.getAttribute(attr) !== val) {
                    oldNode.setAttribute(attr, val);
                }
            }
        }

        syncChildren(oldNode, newNode);
    }

    syncChildren(container, newBody);
}

function buildYoutubeEmbedUrl(href) {
    if (href.startsWith('youtube://search')) return '';
    let id = '';
    let isPlaylist = false;
    if (href.startsWith('youtube://')) {
        id = href.replace('youtube://', '');
        if (id.startsWith('list_')) {
            id = id.replace('list_', '');
            isPlaylist = true;
        }
    } else if (href.includes('youtube.com/playlist')) {
        try {
            const urlParams = new URLSearchParams(new URL(href).search);
            id = urlParams.get('list') || '';
            isPlaylist = true;
        } catch (e) {}
    } else if (href.includes('youtube.com/watch')) {
        try {
            const url = new URL(href);
            const urlParams = new URLSearchParams(url.search);
            const listId = urlParams.get('list');
            const videoId = urlParams.get('v');
            if (listId && !videoId) {
                id = listId;
                isPlaylist = true;
            } else {
                id = videoId || '';
            }
        } catch (e) {}
    } else if (href.includes('youtu.be/')) {
        id = href.split('/').pop() || '';
    }

    if (!id) return '';
    if (isPlaylist) {
        return `https://www.youtube.com/embed/videoseries?list=${id}&origin=https://www.youtube.com`;
    }
    return `https://www.youtube.com/embed/${id}?origin=https://www.youtube.com`;
}

if (typeof marked !== 'undefined') {
    marked.use({
        renderer: {
            image(token) {
                const { href, title, text } = token;
                if (href && (href.startsWith('youtube://') || href.includes('youtube.com/') || href.includes('youtu.be/'))) {
                    if (href.startsWith('youtube://search?q=')) {
                        const query = href.substring('youtube://search?q='.length);
                        return `<div class="lumina-youtube-wrapper lumina-youtube-dynamic is-loading" data-query="${query}" data-original-href="${href}" data-text="${text || ''}"><div class="lumina-media-skeleton"></div></div>`;
                    }
                    const embedUrl = buildYoutubeEmbedUrl(href);
                    if (embedUrl) {
                        return `<div class="lumina-youtube-wrapper"><iframe width="100%" height="315" src="${embedUrl}" title="${text || 'YouTube video player'}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen class="lumina-youtube-iframe"></iframe></div>`;
                    }
                }
                if (href && href.startsWith('image-search://')) {
                    const [searchUrl] = href.split('#');
                    const query = searchUrl.replace('image-search://', '');
                    const cleanQuery = decodeURIComponent(query).replace(/\+/g, ' ');
                    return `<div class="lumina-image-wrapper is-loading"><div class="lumina-media-skeleton"></div><img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 600'%3E%3C/svg%3E" data-query="${encodeURIComponent(cleanQuery)}" data-original-href="${href}" alt="${text || 'diagram'}" class="lumina-async-image lumina-clickable-image" />${text ? `<div class="lumina-image-caption">${text}</div>` : ''}</div>`;
                }
                return false;
            },
            link(token) {
                const { href, text } = token;
                if (href && (href.startsWith('youtube://') || href.includes('youtube.com/') || href.includes('youtu.be/'))) {
                    if (href.startsWith('youtube://search?q=')) {
                        const query = href.substring('youtube://search?q='.length);
                        return `<div class="lumina-youtube-wrapper lumina-youtube-dynamic is-loading" data-query="${query}" data-original-href="${href}" data-text="${text || ''}"><div class="lumina-media-skeleton"></div></div>`;
                    }
                    const embedUrl = buildYoutubeEmbedUrl(href);
                    if (embedUrl) {
                        return `<div class="lumina-youtube-wrapper"><iframe width="100%" height="315" src="${embedUrl}" title="${text || 'YouTube video player'}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen class="lumina-youtube-iframe"></iframe></div>`;
                    }
                }
                return false;
            }
        }
    });
}


// Global capturing event listeners for async image loading to comply with strict extension CSP
document.addEventListener('load', (event) => {
    const target = event.target;
    if (target && target.tagName === 'IMG' && target.classList.contains('lumina-async-image') && !target.src.startsWith('data:')) {
        target.style.opacity = '1';
        const wrapper = target.closest('.lumina-image-wrapper');
        if (wrapper) {
            wrapper.classList.remove('is-loading');
            const skeleton = wrapper.querySelector('.lumina-media-skeleton');
            if (skeleton) skeleton.style.display = 'none';
        }
    }
}, true);

document.addEventListener('error', (event) => {
    const target = event.target;
    if (target && target.tagName === 'IMG' && target.classList.contains('lumina-async-image') && !target.src.startsWith('data:')) {
        let fallbackUrls = [];
        try {
            if (target.dataset.fallbackUrls) {
                fallbackUrls = JSON.parse(target.dataset.fallbackUrls);
            }
        } catch (e) { }

        if (fallbackUrls && fallbackUrls.length > 0) {
            const nextUrl = fallbackUrls.shift();
            target.dataset.fallbackUrls = JSON.stringify(fallbackUrls);
            target.src = nextUrl;
        } else {
            const wrapper = target.closest('.lumina-image-wrapper');
            if (wrapper) {
                wrapper.classList.remove('is-loading');
                const skeleton = wrapper.querySelector('.lumina-media-skeleton');
                if (skeleton) {
                    skeleton.textContent = 'Failed to load image';
                    skeleton.style.background = '#fee2e2';
                    skeleton.style.color = '#ef4444';
                    skeleton.style.display = 'flex';
                    skeleton.style.animation = 'none';
                }
            }
            target.style.display = 'none';
        }
    }
}, true);



async function searchGoogleImages(query) {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'fetch_images', keyword: query }, (res) => {
            if (chrome.runtime.lastError) {
                console.warn('[Lumina] fetch_images error:', chrome.runtime.lastError.message);
                resolve([]);
            } else if (res && res.success && res.images) {
                resolve(res.images);
            } else {
                resolve([]);
            }
        });
    });
}


// Helper to search YouTube videos keylessly using DuckDuckGo
async function searchYoutubeVideo(query) {
    try {
        const searchUrl = `https://html.duckduckgo.com/html/?q=site:youtube.com+${encodeURIComponent(query)}`;
        const res = await fetch(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        if (!res.ok) throw new Error('Failed to fetch DDG HTML search results');
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
                        id = id.split('&')[0].split('?')[0];
                        return id;
                    }
                }
            }
        }
        
        const rawWatchMatch = text.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
        if (rawWatchMatch) {
            return rawWatchMatch[1];
        }
    } catch (e) {
        console.warn('[Lumina] YouTube search error:', e);
    }
    return null;
}

const luminaResolvedYoutubeCache = new Map();

function processLuminaDynamicYoutubeElements(rootNode) {
    if (!rootNode) return;
    const yts = [];
    if (rootNode.classList && rootNode.classList.contains('lumina-youtube-dynamic') && !rootNode.classList.contains('is-loading-started')) {
        yts.push(rootNode);
    }
    if (rootNode.querySelectorAll) {
        const found = rootNode.querySelectorAll('.lumina-youtube-dynamic:not(.is-loading-started)');
        found.forEach(y => yts.push(y));
    }

    yts.forEach(async (yt) => {
        yt.classList.add('is-loading-started');
        const rawQuery = yt.getAttribute('data-query') || '';
        const cleanQuery = decodeURIComponent(rawQuery).replace(/\+/g, ' ');
        if (!cleanQuery) return;

        let resolvePromise;
        if (luminaResolvedYoutubeCache.has(cleanQuery)) {
            resolvePromise = luminaResolvedYoutubeCache.get(cleanQuery);
        } else {
            resolvePromise = searchYoutubeVideo(cleanQuery);
            luminaResolvedYoutubeCache.set(cleanQuery, resolvePromise);
        }

        try {
            const videoId = await resolvePromise;
            if (videoId) {
                const embedUrl = `https://www.youtube.com/embed/${videoId}?origin=https://www.youtube.com`;
                const text = yt.getAttribute('data-text') || 'YouTube video player';
                yt.innerHTML = `<iframe width="100%" height="315" src="${embedUrl}" title="${text}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen class="lumina-youtube-iframe"></iframe>`;
                yt.classList.remove('is-loading');

                const answerDiv = yt.closest('.lumina-chat-answer');
                if (answerDiv) {
                    const originalHref = yt.getAttribute('data-original-href');
                    const rawText = answerDiv.getAttribute('data-raw-text') || '';
                    if (rawText.includes(originalHref)) {
                        const newHref = `youtube://${videoId}`;
                        const newRawText = rawText.replaceAll(originalHref, newHref);
                        answerDiv.setAttribute('data-raw-text', newRawText);
                        yt.setAttribute('data-original-href', newHref);

                        const historyEl = yt.closest('.lumina-chat-history') ||
                            yt.closest('.lumina-chat-scroll-content') ||
                            (typeof currentPopup !== 'undefined' && currentPopup ? currentPopup.querySelector('.lumina-chat-history') : null);
                        if (historyEl && typeof ChatHistoryManager !== 'undefined') {
                            const sessionId = historyEl.dataset.sessionId || ChatHistoryManager.currentSessionId;
                            ChatHistoryManager.saveCurrentChat(historyEl, sessionId);
                        }
                    }
                }
            } else {
                yt.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--lumina-text-secondary); background: var(--lumina-ui-bg-light); border-radius: 12px; font-family: var(--lumina-font-family); font-size: 13px;">Không tìm thấy video phù hợp trên YouTube cho từ khóa "${cleanQuery}"</div>`;
                yt.classList.remove('is-loading');
            }
        } catch (e) {
            console.error('[Lumina YT Resolve] Error:', e);
            yt.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--lumina-text-secondary); background: var(--lumina-ui-bg-light); border-radius: 12px; font-family: var(--lumina-font-family); font-size: 13px;">Lỗi tải video YouTube</div>`;
            yt.classList.remove('is-loading');
        }
    });
}

// Cache of pending and completed image search queries to prevent duplicate network calls during answer streaming
const luminaResolvedImagesCache = new Map();

function processLuminaDynamicImageElements(rootNode) {
    if (!rootNode) return;
    const found = [];
    if (rootNode.classList && rootNode.classList.contains('lumina-async-image')) {
        found.push(rootNode);
    }
    if (rootNode.querySelectorAll) {
        rootNode.querySelectorAll('.lumina-async-image').forEach(i => found.push(i));
    }

    const imgs = found.filter(img => {
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

        // Check in-memory cache
        if (luminaResolvedImagesCache.has(cleanQuery)) {
            try {
                const cachedResult = await luminaResolvedImagesCache.get(cleanQuery);
                if (cachedResult && cachedResult.fallbackUrls) {
                    img.dataset.fallbackUrls = JSON.stringify(cachedResult.fallbackUrls);
                }
                img.src = cachedResult ? cachedResult.url : '';
            } catch (err) {
                img.src = '';
                const wrapper = img.closest('.lumina-image-wrapper');
                if (wrapper) {
                    wrapper.classList.remove('is-loading');
                    const skeleton = wrapper.querySelector('.lumina-media-skeleton');
                    if (skeleton) {
                        skeleton.textContent = 'Failed to load image';
                        skeleton.style.background = '#fee2e2';
                        skeleton.style.color = '#ef4444';
                        skeleton.style.display = 'flex';
                        skeleton.style.animation = 'none';
                    }
                }
                img.style.display = 'none';
            }
            return;
        }

        // Check persistent cache in chrome.storage.local
        let cachedResult = null;
        try {
            const storageKey = `lumina_img_query_${encodeURIComponent(cleanQuery)}`;
            const storageData = await chrome.storage.local.get([storageKey]);
            if (storageData && storageData[storageKey]) {
                cachedResult = storageData[storageKey];
            }
        } catch (e) {
            console.warn('[Lumina] Failed to read persistent image cache:', e);
        }

        if (cachedResult) {
            try {
                if (cachedResult.fallbackUrls) {
                    img.dataset.fallbackUrls = JSON.stringify(cachedResult.fallbackUrls);
                }
                img.src = cachedResult.url || '';
                luminaResolvedImagesCache.set(cleanQuery, Promise.resolve(cachedResult));
            } catch (err) {
                img.src = '';
                const wrapper = img.closest('.lumina-image-wrapper');
                if (wrapper) {
                    wrapper.classList.remove('is-loading');
                    const skeleton = wrapper.querySelector('.lumina-media-skeleton');
                    if (skeleton) {
                        skeleton.textContent = 'Failed to load image';
                        skeleton.style.background = '#fee2e2';
                        skeleton.style.color = '#ef4444';
                        skeleton.style.display = 'flex';
                        skeleton.style.animation = 'none';
                    }
                }
                img.style.display = 'none';
            }
            return;
        }

        const loadPromise = (async () => {
            try {
                const urls = await searchGoogleImages(cleanQuery);
                if (urls && urls.length > 0) {
                    const result = { url: urls[0], fallbackUrls: urls.slice(1, 4) };
                    // Save to persistent storage cache
                    const storageKey = `lumina_img_query_${encodeURIComponent(cleanQuery)}`;
                    chrome.storage.local.set({ [storageKey]: result }).catch(() => {});
                    return result;
                }
            } catch (err) {
                console.warn('[Lumina] Google Image search error:', err);
            }
            throw new Error('Google Image search failed');
        })();

        luminaResolvedImagesCache.set(cleanQuery, loadPromise);

        try {
            const result = await loadPromise;
            if (result && result.fallbackUrls) {
                img.dataset.fallbackUrls = JSON.stringify(result.fallbackUrls);
            }
            img.src = result ? result.url : '';
        } catch (err) {
            img.src = '';
            const wrapper = img.closest('.lumina-image-wrapper');
            if (wrapper) {
                wrapper.classList.remove('is-loading');
                const skeleton = wrapper.querySelector('.lumina-media-skeleton');
                if (skeleton) {
                    skeleton.textContent = 'Failed to load image';
                    skeleton.style.background = '#fee2e2';
                    skeleton.style.color = '#ef4444';
                    skeleton.style.display = 'flex';
                    skeleton.style.animation = 'none';
                }
            }
            img.style.display = 'none';
        }
    });
}

// MutationObserver to safely intercept, fetch and inspect redirect paths for newly rendered images
const luminaImageObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
            if (node.nodeType !== Node.ELEMENT_NODE) continue;

            processLuminaDynamicImageElements(node);
            processLuminaDynamicYoutubeElements(node);
        }
    }
});
luminaImageObserver.observe(document.documentElement, { childList: true, subtree: true });

// Check immediately on load for pre-existing dynamic YouTube embeds and async images
processLuminaDynamicImageElements(document.body);
processLuminaDynamicYoutubeElements(document.body);

class LuminaChatUI {
    static getDeepActiveElement() {
        let el = document.activeElement;
        while (el && el.shadowRoot && el.shadowRoot.activeElement) {
            el = el.shadowRoot.activeElement;
        }
        return el;
    }

    static injectQuestionActions(questionDiv) {
        if (!questionDiv) return;
        const row = questionDiv.closest('.lumina-question-row');
        if (!row) return;

        // Remove existing actions row
        const existing = row.querySelector('.lumina-question-actions-row');
        if (existing) existing.remove();

        const actionsRow = document.createElement('div');
        actionsRow.className = 'lumina-actions lumina-question-actions-row';
        actionsRow.innerHTML = `
            <button class="lumina-answer-action-btn btn-undo" title="Undo">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>
            </button>
            <button class="lumina-answer-action-btn btn-copy" title="Copy">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            </button>
            <button class="lumina-answer-action-btn btn-edit" title="Edit">
                <span class="lumina-svg-icon lumina-icon-file-edit" aria-hidden="true"></span>
            </button>
        `;

        const getChatUI = () => {
            const histEl = questionDiv.closest('.lumina-chat-history, .lumina-chat-scroll-content');
            return histEl?.__uiInstance || window.ui || (window.currentPopup?.__uiInstance);
        };

        actionsRow.querySelector('.btn-undo').onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const entry = questionDiv.closest('.lumina-dict-entry');
            const chatUI = getChatUI();
            if (chatUI) chatUI._undoEditAndTruncate(entry, 'question', questionDiv, null);
        };

        actionsRow.querySelector('.btn-copy').onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const text = questionDiv.dataset.rawText || questionDiv.textContent;
            navigator.clipboard.writeText(text);
            const btn = actionsRow.querySelector('.btn-copy');
            const originalHTML = btn.innerHTML;
            btn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
            setTimeout(() => { btn.innerHTML = originalHTML; }, 2000);
        };

        actionsRow.querySelector('.btn-edit').onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const chatUI = getChatUI();
            if (chatUI) chatUI.enterQuestionEditMode(questionDiv);
        };

        row.appendChild(actionsRow);
    }

    constructor(container, options = {}) {
        this.container = container;
        this.options = {
            isSpotlight: options.isSpotlight || false,
            alwaysExpanded: options.alwaysExpanded || false,
            onSubmit: options.onSubmit || null,
            ...options
        };
        this.systemTokens = 150;
        this.historyEl = container.querySelector('.lumina-chat-history') ||
            container.querySelector('.lumina-chat-scroll-content');
        if (this.historyEl) {
            this.historyEl.__uiInstance = this;
        }
        this.inputEl = container.querySelector('.lumina-chat-input') ||
            (this.options.isSpotlight && !this.options.isPrimaryInput ? null : (document.querySelector('.lumina-chat-input') || document.querySelector('#chat-input')));
        this.filePreviewEl = container.querySelector('.lumina-file-preview-container') ||
            container.querySelector('.lumina-image-preview-container') ||
            container.querySelector('#image-preview') ||
            document.querySelector('.lumina-file-preview-container') ||
            document.querySelector('.lumina-image-preview-container');
        this.fileInputEl = container.querySelector('input[type="file"]') ||
            container.querySelector('#file-input') ||
            document.querySelector('#file-input');
        this.currentEntryDiv = null;
        this.loadingDiv = null;
        this.searchingDiv = null;
        this.currentAnswerDiv = null;
        this.disableAutoScroll = false;
        this.disableStreamAutoFollow = true;
        this.attachedFiles = [];
        this.selectedImages = [];
        this.inputPaneEl = null;
        this.webSearchSources = [];
        this._lastActiveEntry = null;
        this._streamRenderPaused = false;
        this._streamRenderSelectionActive = false;
        this._pendingRenderSkipScroll = false;
        this._pinnedQuestionEl = null;
        this._pinnedQuestionChipEl = null;
        this._pinnedQuestionScrollContainer = null;
        this._pinnedQuestionScrollRaf = null;
        this._historyDelegationEl = null;
        this._historyDelegationClickHandler = null;
        if (this.inputEl && !this.options.skipInputSetup) {
            this.setupInputBar();
            this._setupMentions();
            this._throttledUpdateTokenCount();
        }
        this.memoryTimers = new Map();
        this._setupMemoryManager();
        if (this.container) {
            let scrollingTimeout = null;
            this.container.addEventListener('wheel', (e) => {
                let target = e.target;
                while (target && target !== this.container) {
                    if (target.classList.contains('lumina-chat-scroll-content') ||
                        target.classList.contains('lumina-chat-history')) {
                        if (scrollingTimeout) clearTimeout(scrollingTimeout);
                        if (!target.classList.contains('lumina-is-scrolling')) {
                            target.classList.add('lumina-is-scrolling');
                        }
                        scrollingTimeout = setTimeout(() => {
                            target.classList.remove('lumina-is-scrolling');
                            scrollingTimeout = null;
                        }, 200);
                        break;
                    }
                    target = target.parentElement;
                }
            }, { passive: true });
        }
        this._setupAutoScrollGuard();
        this._setupSelectionRenderGuard();
        this._initContextMenu();
        this._setupHistoryDelegation();

        if (this.historyEl) this.initListeners(this.historyEl);

        this.tokenLimit = null;
        this.isGenerating = false;
        this.onStop = null;
        if (this.inputEl && !this.options.skipInputSetup) {
            this._updateActionBtnState();
        }
    }
    syncStateFromDOM() {
        if (!this.historyEl) return;
        const entries = this.historyEl.querySelectorAll('.lumina-dict-entry');
        if (entries.length > 0) {
            const lastEntry = entries[entries.length - 1];
            this.currentEntryDiv = lastEntry;
            this.loadingDiv = lastEntry.querySelector('.lumina-loading-wrapper');
            this.searchingDiv = lastEntry.querySelector('.lumina-loading-wrapper') || lastEntry.querySelector('.lumina-searching-indicator');


            const answerDiv = lastEntry.querySelector('.lumina-chat-answer') || lastEntry.querySelector('.lumina-answer-versions');
            this.currentAnswerDiv = answerDiv;
        } else {
            this.currentEntryDiv = null;
            this.loadingDiv = null;
            this.searchingDiv = null;
            this.currentAnswerDiv = null;
        }
    }
    initListeners(container) {
        if (!container) return;


        this.historyEl = container;
        this._setupHistoryDelegation(container);

        if (container._luminaListenersAttached) return;
        container._luminaListenersAttached = true;





        container.addEventListener('keydown', (e) => {
            const editable = e.target.closest('.lumina-chat-question div[contenteditable="true"]');
            if (editable && e.target === editable) {
                const isSelectAll = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a';
                const tag = editable.querySelector('.lumina-selected-text-tag');

                if (isSelectAll && tag) {
                    e.preventDefault();
                    const selection = window.getSelection();
                    const range = document.createRange();
                    let startNode = tag.nextSibling;
                    if (!startNode) {
                        startNode = document.createTextNode('');
                        editable.appendChild(startNode);
                    }
                    range.setStart(startNode, 0);
                    range.setEnd(editable, editable.childNodes.length);
                    selection.removeAllRanges();
                    selection.addRange(range);
                    return;
                }

                if ((e.key === 'Backspace' || e.key === 'Delete') && tag) {
                    const selection = window.getSelection();
                    if (selection.rangeCount > 0) {
                        const range = selection.getRangeAt(0);
                        if (range.intersectsNode(tag)) {
                            e.preventDefault();
                            return;
                        }
                        if (range.collapsed) {
                            const preRange = range.cloneRange();
                            preRange.selectNodeContents(editable);
                            preRange.setEnd(range.startContainer, range.startOffset);
                            if (preRange.toString().trim() === '' && preRange.cloneContents().querySelector('.lumina-selected-text-tag')) {
                                e.preventDefault();
                                return;
                            }
                        }
                    }
                }

                if (e.key === 'Enter' && !e.shiftKey && !(e.ctrlKey || e.metaKey)) {

                    if (editable.closest('.is-editing')) return;

                    e.preventDefault();
                    e.stopImmediatePropagation();
                    const newText = editable.innerText.trim();
                    if (newText) {
                        editable.blur();
                        this._handleQuestionRecheck(newText, editable);
                    }
                }
            }
        });


        container.addEventListener('mouseover', (e) => {
            const tag = e.target.closest('.lumina-selected-text-tag');
            const commentHighlight = e.target.closest('.lumina-comment-highlight');

            if (tag) {

                tag.removeAttribute('title');

                const questionDiv = tag.closest('.lumina-chat-question');
                const isInputField = tag.closest('.lumina-ask-input-field') || tag.closest('.lumina-chat-input');

                let context = "";
                if (questionDiv) {
                    const rawText = questionDiv.dataset.rawText || "";
                    context = this._extractContext(rawText);
                } else if (isInputField) {

                    context = tag.textContent.replace(/^"|"$/g, '');
                }

                if (context) this._showTagTooltip(tag, context);
            } else if (commentHighlight) {
                const comment = commentHighlight.dataset.comment;
                if (comment) this._showTagTooltip(commentHighlight, comment);
            }
        });

        container.addEventListener('mouseout', (e) => {
            const tagOrComment = e.target.closest('.lumina-selected-text-tag, .lumina-comment-highlight');
            if (tagOrComment) this._hideTagTooltip();
        });


        container.addEventListener('mousedown', (e) => {
            const bubble = e.target.closest('.lumina-chat-question, .lumina-chat-answer');
            if (bubble) {
                if (e.target.closest('.lumina-question-pin-btn')) return;

                const editable = bubble.querySelector('[contenteditable="true"]');
                if (editable) {


                    if (!e.target.closest('.lumina-edit-btn, a, button, [contenteditable="true"]')) {
                        e.preventDefault();
                        this._focusEditableAtEnd(editable);
                    }
                    return;
                }

                if (bubble.classList.contains('lumina-chat-question') && !bubble.classList.contains('lumina-question-editing')) {
                    e.preventDefault();
                    this.enterQuestionEditMode(bubble);
                }
            }
        });


        container.addEventListener('input', (e) => {
            const editable = e.target.closest('.lumina-chat-question div[contenteditable="true"]');
            if (editable) e.stopPropagation();
        });
    }
    _setupHistoryDelegation(historyEl = this.historyEl) {
        if (!historyEl) return;

        if (!this._historyDelegationClickHandler) {
            this._historyDelegationClickHandler = (e) => {
                const actionBtn = e.target.closest('.lumina-answer-action-btn');
                if (actionBtn) {
                    const answerDiv = actionBtn.closest('.lumina-chat-answer');
                    if (answerDiv) {
                        e.preventDefault();
                        e.stopPropagation();
                        const action = actionBtn.dataset.action;
                        this._handleAnswerAction(action, actionBtn, answerDiv);
                        return;
                    }
                }

                const clickableImg = e.target.closest('.lumina-clickable-image');
                if (clickableImg && clickableImg.src) {
                    e.stopPropagation();
                    this.showImagePreview(clickableImg.src, clickableImg.alt || clickableImg.getAttribute('alt'));
                }
            };
        }

        if (this._historyDelegationEl && this._historyDelegationEl !== historyEl) {
            this._historyDelegationEl.removeEventListener('click', this._historyDelegationClickHandler);
        }

        if (this._historyDelegationEl !== historyEl) {
            historyEl.addEventListener('click', this._historyDelegationClickHandler);
            this._historyDelegationEl = historyEl;
        }

        this.historyEl = historyEl;
    }

    _setupMemoryManager() {
        this.memoryObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const container = entry.target;
                const iframe = container.querySelector('iframe');
                if (!iframe) return;
                if (entry.isIntersecting) {
                    if (this.memoryTimers.has(container)) {
                        clearTimeout(this.memoryTimers.get(container));
                        this.memoryTimers.delete(container);
                    }
                    if (container.classList.contains('is-lazy-unloaded') ||
                        container.classList.contains('is-hibernating') ||
                        container.classList.contains('is-lazily-unloaded')) {
                        const savedSrc = container.dataset.savedSrc || container.dataset.lazySrc || container.dataset.sourceUrl;
                        if (savedSrc && savedSrc !== 'about:blank') {
                            container.classList.add('is-loading');
                            iframe.src = savedSrc;
                            container.classList.remove('is-lazy-unloaded', 'is-hibernating', 'is-lazily-unloaded');
                        }
                    }
                } else {
                    if (!container.classList.contains('is-lazy-unloaded') && !this.memoryTimers.has(container)) {
                        const timerId = setTimeout(() => {
                            const currentSrc = iframe.src || container.dataset.sourceUrl;
                            if (currentSrc && currentSrc !== 'about:blank') {
                                container.dataset.savedSrc = currentSrc;
                                iframe.src = 'about:blank';
                                container.classList.add('is-lazy-unloaded');
                            }
                            this.memoryTimers.delete(container);
                        }, 30000);
                        this.memoryTimers.set(container, timerId);
                    }
                }
            });
        }, {
            rootMargin: '200px'
        });
    }
    getScrollContainer() {
        if (!this.historyEl) return null;
        let scrollContainer = this.historyEl;
        if (window.getComputedStyle(scrollContainer).overflowY === 'visible' && scrollContainer.parentElement) {
            scrollContainer = scrollContainer.parentElement;
        }
        return scrollContainer;
    }
    _scheduleLowPriority(task, timeout = 300) {
        if (typeof task !== 'function') return;
        if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
            window.requestIdleCallback(() => task(), { timeout });
            return;
        }
        setTimeout(task, 24);
    }

    static getFileTypeLabel(item) {
        const name = String(item?.name || '').toLowerCase();
        if (name.endsWith('.docx')) return 'DOCX';
        if (name.endsWith('.doc')) return 'DOC';
        if (name.endsWith('.xlsx')) return 'XLSX';
        if (name.endsWith('.xls')) return 'XLS';
        if (name.endsWith('.csv')) return 'CSV';
        if (name.endsWith('.pptx')) return 'PPTX';
        if (name.endsWith('.ppt')) return 'PPT';
        if (name.endsWith('.pdf')) return 'PDF';
        if (name.endsWith('.txt')) return 'TXT';
        if (name.endsWith('.md')) return 'MD';
        if (name.endsWith('.json')) return 'JSON';
        if (name.endsWith('.js')) return 'JS';
        if (name.endsWith('.ts')) return 'TS';
        if (name.endsWith('.py')) return 'PY';

        const mime = String(item?.mimeType || '').toLowerCase();
        if (mime.includes('wordprocessingml.document')) return 'DOCX';
        if (mime.includes('spreadsheetml.sheet')) return 'XLSX';
        if (mime.includes('presentationml.presentation')) return 'PPTX';
        if (mime.includes('pdf')) return 'PDF';
        if (mime.includes('json')) return 'JSON';
        if (mime.startsWith('audio/')) return mime.split('/')[1]?.toUpperCase() || 'AUDIO';
        if (mime.startsWith('video/')) return mime.split('/')[1]?.toUpperCase() || 'VIDEO';
        return (mime.split('/')[1] || 'FILE').toUpperCase();
    }

    static getDisplayFileName(fileName) {
        const safeName = String(fileName || 'File');
        const rawExt = safeName.includes('.') ? safeName.split('.').pop() : '';
        const ext = String(rawExt || '').toLowerCase();
        const dotExt = ext ? `.${ext}` : '';
        if (dotExt && safeName.toLowerCase().endsWith(dotExt)) {
            return safeName.slice(0, -(dotExt.length));
        }
        return safeName;
    }

    static inferFileCategory(fileOrExt, mimeType = '') {
        let ext = '';
        let mime = String(mimeType || '').toLowerCase();

        if (fileOrExt && typeof fileOrExt === 'object') {
            const name = String(fileOrExt.name || '').toLowerCase();
            ext = name.includes('.') ? name.split('.').pop() : '';
            mime = String(fileOrExt.mimeType || mime || '').toLowerCase();
        } else {
            ext = String(fileOrExt || '').toLowerCase();
        }

        const major = mime.split('/')[0];
        if (major === 'audio') return 'audio';
        if (major === 'video') return 'video';
        if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
        if (["doc", "docx", "odt", "rtf"].includes(ext)) return 'doc';
        if (["xls", "xlsx", "csv", "ods", "tsv"].includes(ext)) return 'sheet';
        if (["ppt", "pptx", "odp", "key"].includes(ext)) return 'slides';
        if (["zip", "rar", "7z", "tar", "gz", "bz2", "xz"].includes(ext)) return 'archive';
        if (["js", "ts", "jsx", "tsx", "json", "xml", "html", "css", "py", "java", "c", "cpp", "h", "rs", "go", "php", "md", "yaml", "yml", "sql", "sh"].includes(ext)) return 'code';
        if (["txt", "log", "text"].includes(ext) || major === 'text') return 'text';
        return 'file';
    }

    static getFileIconByCategory(category) {
        if (category === 'audio') return '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M12 3v9.28c-.47-.17-.97-.28-1.5-.28C8.01 12 6 14.01 6 16.5S8.01 21 10.5 21c2.31 0 4.2-1.75 4.45-4H15V6h4V3h-7z"/></svg>';
        if (category === 'video') return '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>';
        if (category === 'pdf') return '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M20 2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM9.5 13H8V7h2.4a1.8 1.8 0 0 1 0 3.6H9.5V13zm.9-3.8c.4 0 .7-.3.7-.7s-.3-.7-.7-.7h-.9v1.4h.9zM13 13V7h2.1c1.5 0 2.6 1.1 2.6 3s-1.1 3-2.6 3H13zm1.5-1.3h.6c.7 0 1.2-.5 1.2-1.7s-.5-1.7-1.2-1.7h-.6v3.4z"/></svg>';
        if (category === 'doc') return '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M6 2h8l5 5v15a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm7 1.5V8h4.5L13 3.5zM7 11h10v1.5H7V11zm0 3h10v1.5H7V14zm0 3h7v1.5H7V17z"/></svg>';
        if (category === 'sheet') return '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M6 2h9l5 5v15a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm8 1.5V8h4.5L14 3.5zM7 11h10v8H7v-8zm1.5 1.5v1.5H11v-1.5H8.5zm4 0v1.5H15v-1.5h-2.5zm-4 3v1.5H11v-1.5H8.5zm4 0v1.5H15v-1.5h-2.5z"/></svg>';
        if (category === 'slides') return '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M4 4a2 2 0 0 1 2-2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4zm9 0v4h4l-4-4zM7 11h10v2H7v-2zm0 4h7v2H7v-2z"/></svg>';
        if (category === 'archive') return '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M20 6h-3.2l-1-2H8.2l-1 2H4a2 2 0 0 0-2 2v2h20V8a2 2 0 0 0-2-2zm-7 1h-2v1h2V7zm9 5H2v8a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-8zm-11 2h2v4h-2v-4z"/></svg>';
        if (category === 'code') return '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M8.7 16.6L4.1 12l4.6-4.6L7.3 6 1.3 12l6 6 1.4-1.4zm6.6 0l4.6-4.6-4.6-4.6L16.7 6l6 6-6 6-1.4-1.4z"/></svg>';
        if (category === 'text') return '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm1 7V3.5L20.5 9H15zM8 12h8v1.5H8V12zm0 3h8v1.5H8V15zm0 3h6v1.5H8V18z"/></svg>';
        return '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>';
    }
    _isNearBottom(threshold = 120) {
        const scrollContainer = this.getScrollContainer();
        if (!scrollContainer) return false;
        const distanceToBottom = scrollContainer.scrollHeight - scrollContainer.scrollTop - scrollContainer.clientHeight;
        return distanceToBottom < threshold;
    }
    _snapToBottomIfNeeded(shouldSnap) {
        return;
    }
    _setupAutoScrollGuard() {
        const bind = () => {
            const scrollContainer = this.getScrollContainer();
            if (!scrollContainer) return;
            if (this._autoScrollGuardContainer === scrollContainer) return;
            if (this._autoScrollGuardContainer && this._autoScrollGuardHandler) {
                this._autoScrollGuardContainer.removeEventListener('scroll', this._autoScrollGuardHandler);
            }
            this._autoScrollGuardContainer = scrollContainer;
            this._autoScrollGuardHandler = () => {
                if (this._suspendAutoScrollGuard) return;
                this.disableAutoScroll = !this._isNearBottom(72);
            };
            scrollContainer.addEventListener('scroll', this._autoScrollGuardHandler, { passive: true });
            this._autoScrollGuardHandler();
        };
        bind();
        requestAnimationFrame(bind);
    }

    _setupSelectionRenderGuard() {
        if (this._selectionRenderGuardAttached) return;
        this._selectionRenderGuardAttached = true;

        this._selectionPointerDownHandler = (e) => {
            const answer = e.target?.closest?.('.lumina-chat-answer');
            if (!answer || answer !== this.currentAnswerDiv) return;
            this._streamRenderSelectionActive = true;
            this._streamRenderPaused = true;
        };

        this._selectionPointerUpHandler = () => {
            if (!this._streamRenderSelectionActive) return;
            this._streamRenderSelectionActive = false;
            this._streamRenderPaused = false;

            if (this.currentAnswerDiv && this._renderPending) {
                this._flushPendingStreamRender();
            }
        };

        document.addEventListener('mousedown', this._selectionPointerDownHandler, true);
        document.addEventListener('pointerdown', this._selectionPointerDownHandler, true);
        document.addEventListener('touchstart', this._selectionPointerDownHandler, true);
        document.addEventListener('mouseup', this._selectionPointerUpHandler, true);
        document.addEventListener('pointerup', this._selectionPointerUpHandler, true);
        document.addEventListener('touchend', this._selectionPointerUpHandler, true);
    }

    _flushPendingStreamRender() {
        if (!this.currentAnswerDiv) return;

        const answerDiv = this.currentAnswerDiv;
        const skipScroll = this._pendingRenderSkipScroll;
        this._pendingRenderSkipScroll = false;
        this._renderPending = false;
        this._doRender(answerDiv, skipScroll);
    }

    _getWebChipsGroup() {
        return this.container?.querySelector('#web-chips-group') || document.getElementById('web-chips-group');
    }

    _getRedirectChipsGroup() {
        return this.container?.querySelector('#redirect-chips-group') || document.getElementById('redirect-chips-group');
    }

    _ensureQuestionRow(questionDiv) {
        if (!questionDiv) return null;
        const existingRow = questionDiv.closest('.lumina-question-row');
        if (existingRow) return existingRow;

        const parent = questionDiv.parentElement;
        if (!parent) return null;

        const row = document.createElement('div');
        row.className = 'lumina-question-row';
        parent.insertBefore(row, questionDiv);
        row.appendChild(questionDiv);
        return row;
    }

    _updateInputMetaVisibility() {
        const metaContainer = this.container?.querySelector('#input-meta-container') || document.getElementById('input-meta-container');
        if (!metaContainer) return;

        const isSidePanel = new URLSearchParams(window.location.search).get('sidepanel') === '1';
        if (!isSidePanel) {
            metaContainer.style.display = 'none';
            return;
        }

        const webGroup = this._getWebChipsGroup();
        const hasWebChips = webGroup && webGroup.children.length > 0;

        if (!hasWebChips) {
            metaContainer.style.display = 'none';
        } else {
            metaContainer.style.display = 'flex';
        }
    }
    appendQuestion(text, images = [], options = {}) {
        const welcome = this.historyEl.querySelector('.spark-welcome');
        if (welcome) {
            welcome.remove();
        }
        this._clearCommentInteractions();
        const { entryType = 'qa', editable = false, skipMargin = false, displayText: displayTextOverride } = options;
        const visibleImages = Array.isArray(images)
            ? images.filter((item) => {
                if (typeof item === 'string') return true;
                if (!item || typeof item !== 'object') return false;
                return !item.hiddenInPreview && !item.parentAttachmentId;
            })
            : [];
        this.currentAnswerDiv = null;
        this.currentEntryDiv = document.createElement('div');
        this.currentEntryDiv.className = 'lumina-dict-entry lumina-fade-in';
        this.currentEntryDiv.dataset.entryType = entryType;
        this.currentEntryDiv.dataset.entryId = 'entry-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);


        if (visibleImages.length > 0) {
            const filesDiv = document.createElement('div');
            filesDiv.className = 'lumina-chat-question-files';
            visibleImages.forEach(item => {
                if (typeof item === 'object') {
                    const isImage = item.isImage || (item.mimeType && item.mimeType.startsWith('image/'));
                    const rawSrc = item.dataUrl || item.previewUrl || (item.mimeType && item.data ? `data:${item.mimeType};base64,${item.data}` : '');
                    const src = isImage ? (rawSrc.startsWith('data:') ? rawSrc : this._resolveImagePreviewSrc(item, rawSrc)) : rawSrc;
                    if (isImage) {
                        const img = document.createElement('img');
                        img.src = src;
                        if (item.name) img.alt = item.name;
                        img.className = 'lumina-clickable-image';
                        img.addEventListener('click', (e) => {
                            e.stopPropagation();
                            this.showImagePreview(src, img.alt);
                        });
                        filesDiv.appendChild(img);
                    } else {
                        const fileName = item.name || 'File';
                        const displayName = LuminaChatUI.getDisplayFileName(fileName);
                        const category = LuminaChatUI.inferFileCategory(item);
                        const icon = LuminaChatUI.getFileIconByCategory(category);
                        const typeLabel = LuminaChatUI.getFileTypeLabel(item);

                        const fileChip = document.createElement('div');
                        fileChip.className = 'lumina-file-preview-item lumina-image-preview-item is-file lumina-question-file-chip';
                        fileChip.title = fileName;
                        fileChip.innerHTML = `<div class="lumina-file-preview-info"><span class="lumina-file-name">${this.escapeHTMLAttr(displayName || fileName)}</span><div class="lumina-file-meta-row"><span class="lumina-file-icon-inline file-${category}">${icon}</span><span class="lumina-file-size-tag">${this.escapeHTMLAttr(typeLabel)}</span></div></div>`;
                        filesDiv.appendChild(fileChip);
                    }
                } else if (typeof item === 'string') {
                    const src = item.startsWith('data:') ? item : this._resolveImagePreviewSrc(null, item);
                    const img = document.createElement('img');
                    img.src = src;
                    img.className = 'lumina-clickable-image';
                    img.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.showImagePreview(src, img.alt);
                    });
                    filesDiv.appendChild(img);
                }
            });
            this.currentEntryDiv.appendChild(filesDiv);
        }

        const questionDiv = document.createElement('div');
        questionDiv.className = `lumina-chat-question ${entryType}-question`;
        questionDiv.dataset.entryType = entryType;

        if (visibleImages.length > 0) {

            questionDiv._luminaImages = visibleImages;
            this.currentEntryDiv._luminaImages = visibleImages;
            questionDiv.dataset.images = JSON.stringify({
                compact: true,
                count: visibleImages.length,
                files: visibleImages.map((item, index) => {
                    if (typeof item === 'string') {
                        return {
                            name: `Image ${index + 1}`,
                            mimeType: 'image/*',
                            isImage: true,
                            dataLength: item.length
                        };
                    }
                    return {
                        name: item?.name || `File ${index + 1}`,
                        mimeType: item?.mimeType || '',
                        isImage: !!item?.isImage || (item?.mimeType || '').startsWith('image/'),
                        fileUri: item?.fileUri || '',
                        dataLength: (item?.dataUrl || item?.data || '').length
                    };
                })
            });
        }

        if (text) {
            let displayText = displayTextOverride || text.replace(/[("'\[]*\$Container[)"'\]]*\s*/gi, '').trim();


            const isModernTag = displayText.startsWith('$ContextTag');
            const isLegacyTag = displayText.startsWith('SelectedText:');
            const hasContextTag = isModernTag || isLegacyTag;

            if (hasContextTag) {
                if (isModernTag) {
                    displayText = displayText.replace('$ContextTag', '').trim();
                } else {

                    displayText = displayText.replace(/^SelectedText: "[^"]*"\s+/, '').trim();
                }
            }


            questionDiv.dataset.rawText = text;
            this.currentEntryDiv.dataset.timestamp = String(Date.now());

            const contentDiv = document.createElement('div');
            contentDiv.className = 'lumina-question-content';

            contentDiv.innerHTML = displayText
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/\n/g, '<br>');

            questionDiv.appendChild(contentDiv);
        }

        const scrollContainer = this.getScrollContainer();
        const preAppendScroll = scrollContainer ? scrollContainer.scrollTop : 0;

        const row = document.createElement('div');
        row.className = 'lumina-question-row';
        row.appendChild(questionDiv);
        this.currentEntryDiv.appendChild(row);
        const separator = document.createElement('div');
        separator.className = 'lumina-dict-separator';
        this.currentEntryDiv.appendChild(separator);
        this.historyEl.appendChild(this.currentEntryDiv);
        this._throttledUpdateTokenCount();
        if (!skipMargin) {
            this.disableAutoScroll = false;
            requestAnimationFrame(() => {
                this.setInitialEntryHeight(this.currentEntryDiv, false, preAppendScroll, true);
            });
        } else {
            this.clearEntryMargins(this.currentEntryDiv);
        }
        LuminaChatUI.injectQuestionActions(questionDiv);
        return questionDiv;
    }
    createAnswerDiv() {
        if (this.currentEntryDiv && !this.historyEl.contains(this.currentEntryDiv)) {
            this.syncStateFromDOM();
        }
        this._clearCommentInteractions();

        const applyProofreadStyles = (div) => {

            div.classList.add('lumina-can-comment');

            if (this.currentEntryDiv && this.currentEntryDiv.dataset.entryType === 'proofread') {
                div.spellcheck = false;
                div.style.outline = 'none';
                div.style.borderRadius = '8px';
                div.style.backgroundColor = 'var(--lumina-bg-secondary)';
                div.classList.add('lumina-proofread-editable');
            }
        };

        if (this.currentEntryDiv) {
            const activeVersion = this.currentEntryDiv.querySelector('.lumina-answer-version.active');
            if (activeVersion) {
                let innerDiv = activeVersion.querySelector('.lumina-chat-answer');
                if (!innerDiv) {
                    innerDiv = document.createElement('div');
                    innerDiv.className = 'lumina-chat-answer lumina-fade-in';
                    activeVersion.appendChild(innerDiv);
                }
                applyProofreadStyles(innerDiv);
                return innerDiv;
            }
        }
        const div = document.createElement('div');
        div.className = 'lumina-chat-answer lumina-fade-in';
        applyProofreadStyles(div);
        if (this.currentEntryDiv) {
            const existingAnswer = this.currentEntryDiv.querySelector('.lumina-chat-answer');
            const existingSep = this.currentEntryDiv.querySelector(':scope > .lumina-dict-separator');
            if (existingAnswer) {
                this.currentEntryDiv.insertBefore(div, existingAnswer.nextSibling);
            } else if (existingSep) {
                this.currentEntryDiv.insertBefore(div, existingSep);
            } else {
                this.currentEntryDiv.appendChild(div);
            }
        } else {
            this.currentEntryDiv = document.createElement('div');
            this.currentEntryDiv.className = 'lumina-dict-entry';
            this.currentEntryDiv.appendChild(div);
            this.historyEl.appendChild(this.currentEntryDiv);
        }
        this.currentAnswerDiv = div;
        if (!this.disableStreamAutoFollow) {
            this.scrollToBottom();
        }
        return div;
    }
    appendChunk(chunk, skipScroll = false) {
        if (!this.currentAnswerDiv) {
            this.currentAnswerDiv = this.createAnswerDiv();
        }
        const currentText = this.currentAnswerDiv.getAttribute('data-raw-text') || '';
        const newText = currentText + chunk;
        this.currentAnswerDiv.setAttribute('data-raw-text', newText);
        this._throttledUpdateTokenCount();
        let answerContentDiv = this.currentAnswerDiv.querySelector('.lumina-answer-content');
        if (!answerContentDiv) {
            answerContentDiv = document.createElement('div');
            answerContentDiv.className = 'lumina-answer-content';
            this.currentAnswerDiv.appendChild(answerContentDiv);
            answerContentDiv.__isRich = false;
        }



        if (!answerContentDiv.__isRich) {
            let fastText = newText.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').trim();
            if (fastText) {
                if (typeof marked !== 'undefined') {
                    const htmlContent = marked.parse(fastText) || '...';
                    if (answerContentDiv.childNodes.length === 0) {
                        answerContentDiv.innerHTML = htmlContent;
                    } else {
                        if (this.loadingDiv && answerContentDiv.contains(this.loadingDiv)) {
                            this.loadingDiv.remove();
                            this.loadingDiv = null;
                        }
                        morphDOM(answerContentDiv, htmlContent);
                    }
                } else {
                    if (this.loadingDiv && answerContentDiv.contains(this.loadingDiv)) {
                        this.loadingDiv.remove();
                        this.loadingDiv = null;
                    }
                    if (fastText.length < 1000) {
                        answerContentDiv.textContent = fastText;
                    } else {
                        answerContentDiv.textContent = fastText.substring(0, 1000) + "...";
                    }
                }
            }
        }



        if (!this._renderPending) {
            this._renderPending = true;
            this._pendingRenderSkipScroll = this._pendingRenderSkipScroll || skipScroll;



            const targetDiv = this.currentAnswerDiv;

            setTimeout(() => {
                if (targetDiv) {
                    this._renderPending = false;
                    if (this._streamRenderPaused) return;

                    const shouldSkipScroll = this._pendingRenderSkipScroll;
                    this._pendingRenderSkipScroll = false;
                    this._doRender(targetDiv, shouldSkipScroll);
                } else {
                    this._renderPending = false;
                    this._pendingRenderSkipScroll = false;
                }
            }, 80);
        }
    }
    _doRender(answerDiv, skipScroll = false, isFinished = false) {
        let actualAnswer = '';
        let thinkingContent = '';
        let isThinkingComplete = false;
        const scrollContainer = this.getScrollContainer();
        const preserveScrollTop = (!skipScroll && this.disableAutoScroll && scrollContainer)
            ? scrollContainer.scrollTop
            : null;
        const newText = answerDiv.getAttribute('data-raw-text') || '';
        if (answerDiv.__lastRenderedText === newText && !isFinished) return;
        answerDiv.__lastRenderedText = newText;
        let displayText = newText.replace(/\{"tool"\s*:\s*"search_web"\s*,\s*"args"\s*:\s*\{[^}]+\}\s*\}/g, '');
        const isProofreadAnswer = answerDiv.classList.contains('lumina-proofread-editable');
        if (isProofreadAnswer) {
            displayText = displayText.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').trim();
            const existing = answerDiv.querySelector('.lumina-thinking-steps');
            if (existing) existing.remove();
        }
        if (this.webSearchSources && this.webSearchSources.length > 0) {
            displayText = displayText.replace(/\n\s*(?:Sources|Citations|References)\s*(?::)?\s*\n[\s\S]*$/i, '');
        }
        const lastThinkStart = displayText.lastIndexOf('<think>');
        const lastThinkEnd = displayText.lastIndexOf('</think>');
        const thinkMatch = lastThinkStart !== -1;

        if (thinkMatch) {
            isThinkingComplete = lastThinkEnd > lastThinkStart;
            thinkingContent = displayText.substring(lastThinkStart + 7, isThinkingComplete ? lastThinkEnd : displayText.length).trim();
            actualAnswer = displayText.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').trim();
            const hasToolCall = newText.includes('"tool"') || newText.includes('search_web');
            if (isFinished && !actualAnswer && thinkingContent && isThinkingComplete && !hasToolCall) {
                actualAnswer = thinkingContent;
                thinkingContent = '';
            }
            // When thinking is complete → hide loading indicator
            if (isThinkingComplete) {
                const existingSteps = answerDiv.querySelector('.lumina-thinking-steps');
                if (existingSteps) existingSteps.remove();
                this.removeLoading();
                this.removeSearching();
            } else if (!isThinkingComplete) {
                // Extract the last header (bold or ATX style) from thinking content as status text
                const headingMatches = thinkingContent.match(/(?:\*\*([^*\r\n]+)\*\*|^(?:#{1,6})\s+([^\r\n]+))/gm);
                const lastHeading = headingMatches
                    ? headingMatches[headingMatches.length - 1].replace(/[*#]/g, '').trim()
                    : 'Thinking';

                const statusWrapper = this.loadingDiv || this.searchingDiv;
                if (statusWrapper) {
                    this.updateStatusText(statusWrapper, lastHeading);
                } else {
                    this.showLoading();
                    this.updateStatusText(this.loadingDiv, lastHeading);
                }
            }
        } else {
            actualAnswer = displayText.trim();
        }
        if (/^<t?h?i?n?k?>?$/i.test(actualAnswer)) {
            actualAnswer = '';
        }
        if (thinkMatch) {
            isThinkingComplete = lastThinkEnd > lastThinkStart;
        }
        let answerContentDiv = answerDiv.querySelector('.lumina-answer-content');
        if (!answerContentDiv) {
            answerContentDiv = document.createElement('div');
            answerContentDiv.className = 'lumina-answer-content';
            answerDiv.appendChild(answerContentDiv);
        }
        if (actualAnswer.trim() || isThinkingComplete) {
            if (actualAnswer.trim().startsWith('<')) {
                const offsets = window.LuminaSelection?.getSelectionRelativeOffsets?.(answerContentDiv);
                if (answerContentDiv.childNodes.length === 0) {
                    answerContentDiv.innerHTML = actualAnswer;
                } else {
                    morphDOM(answerContentDiv, actualAnswer);
                }
                if (offsets) window.LuminaSelection?.restoreSelectionFromOffsets?.(answerContentDiv, offsets);
            } else if (typeof marked !== 'undefined') {
                let content = actualAnswer;
                let htmlContent = marked.parse(content);
                if (this.webSearchSources.length > 0) {
                    htmlContent = htmlContent.replace(/\[(\d+)\]/g, (match, num) => {
                        const sourceIndex = parseInt(num) - 1;
                        const source = this.webSearchSources[sourceIndex];
                        if (source) {
                            return `<a href="${source.link}" target="_blank" rel="noopener noreferrer" class="lumina-citation">${num}</a>`;
                        }
                        return match;
                    });
                }


                const offsets = window.LuminaSelection?.getSelectionRelativeOffsets?.(answerContentDiv);
                if (answerContentDiv.childNodes.length === 0) {
                    answerContentDiv.innerHTML = htmlContent;
                } else {
                    morphDOM(answerContentDiv, htmlContent);
                }
                if (offsets) window.LuminaSelection?.restoreSelectionFromOffsets?.(answerContentDiv, offsets);

                answerContentDiv.__isRich = true;
            } else {
                answerContentDiv.textContent = actualAnswer;
                answerContentDiv.__isRich = false;
            }
        }
        if (!skipScroll && !this.disableStreamAutoFollow && !this._scrollThrottled) {
            this._scrollThrottled = true;
            setTimeout(() => { this._scrollThrottled = false; }, 100);
            this.scrollToBottom();
        }
        if (preserveScrollTop !== null && scrollContainer) {
            scrollContainer.scrollTop = preserveScrollTop;
        }
    }
    finishAnswer(skipMargin = false, skipScroll = false) {
        this.removeLoading();
        this.removeSearching();
        this._flushPendingStreamRender();
        this._renderPending = false;
        this._scrollThrottled = false;
        this._streamRenderPaused = false;
        this._streamRenderSelectionActive = false;
        this._pendingRenderSkipScroll = false;
        const answerDivSnapshot = this.currentAnswerDiv;
        const sourcesSnapshot = Array.isArray(this.webSearchSources) ? [...this.webSearchSources] : [];
        const rawText = answerDivSnapshot ? (answerDivSnapshot.getAttribute('data-raw-text') || '') : '';
        const isProofreadEntry = this.currentEntryDiv?.dataset?.entryType === 'proofread';
        const shouldStickBottom = !this.disableStreamAutoFollow && !skipScroll && this._isNearBottom();
        if (answerDivSnapshot) {
            this._scheduleLowPriority(async () => {
                if (!answerDivSnapshot.isConnected) return;
                const previousSources = this.webSearchSources;
                this.webSearchSources = sourcesSnapshot;
                try {
                    if (rawText.trim()) {
                        this._doRender(answerDivSnapshot, true, true);
                    }
                    if (sourcesSnapshot.length > 0) {
                        answerDivSnapshot.dataset.webSearch = JSON.stringify({
                            sourcesCount: sourcesSnapshot.length
                        });
                        if (!answerDivSnapshot.querySelector('.lumina-sources')) {
                            const sourcesDiv = document.createElement('div');
                            sourcesDiv.className = 'lumina-sources';
                            sourcesDiv.innerHTML = `
                                <div class="lumina-sources-title">Sources</div>
                                <div class="lumina-sources-list">
                                    ${sourcesSnapshot.map((source, idx) => `
                                        <a href="${source.link}" target="_blank" rel="noopener noreferrer" class="lumina-source-item">
                                            <span class="lumina-source-num">${idx + 1}</span>
                                            <div class="lumina-source-info">
                                                <div class="lumina-source-name">${source.title || 'Source'}</div>
                                                <div class="lumina-source-domain">${source.displayLink || new URL(source.link).hostname}</div>
                                            </div>
                                        </a>
                                    `).join('')}
                                </div>
                            `;
                            answerDivSnapshot.appendChild(sourcesDiv);
                        }
                    }
                    await LuminaChatUI.processContainer(answerDivSnapshot);
                } catch (e) {
                    console.error('[Lumina] post-answer processing error:', e);
                } finally {
                    this.webSearchSources = previousSources;
                    this._snapToBottomIfNeeded(shouldStickBottom);
                }
            }, 380);
        } else if (sourcesSnapshot.length > 0 && !skipScroll && !this.disableStreamAutoFollow) {
            requestAnimationFrame(() => this.scrollToBottom());
        }
        this.currentAnswerDiv = null;
        this.webSearchSources = [];
        this.hideStopButton();
        this._throttledUpdateTokenCount();
    }
    static calculateInitialScrollTarget(entry, scrollContainer) {
        if (!entry || !scrollContainer) return 0;

        // entry.offsetTop is the distance from the top of the scrollable content area 
        // to the entry's top edge (assuming scrollContainer has position:relative).
        // Setting scrollTop = entry.offsetTop would put the entry exactly at the container's top edge (Image 1).
        // We want a small gap for aesthetics (Image 2), so we subtract a buffer.
        const targetScrollTop = entry.offsetTop - 10;
        return Math.max(0, targetScrollTop);
    }
    static getViewportStats(container, inputWrapper) {
        const containerHeight = container.clientHeight || container.offsetHeight;
        const inputHeight = inputWrapper ? (inputWrapper.offsetHeight || 0) : 0;

        const isSpotlight = document.body.classList.contains('lumina-spotlight-page');

        return {
            containerHeight,
            inputHeight,
            viewportHeight: isSpotlight ? containerHeight : Math.max(0, containerHeight - inputHeight)
        };
    }
    static applyViewportMinHeight(entry, container, inputWrapper) {
        if (!entry || !container) return;
        const { viewportHeight } = this.getViewportStats(container, inputWrapper);
        if (viewportHeight > 0) {
            const scrollContainer = entry.closest('.lumina-chat-scroll-content') ||
                container.querySelector('.lumina-chat-scroll-content');

            let paddingOffset = 20;
            if (scrollContainer) {
                const style = window.getComputedStyle(scrollContainer);
                const pt = parseFloat(style.paddingTop) || 0;
                const pb = parseFloat(style.paddingBottom) || 0;
                paddingOffset = pt + pb;
            }

            entry.style.setProperty('min-height', (viewportHeight - paddingOffset) + 'px', 'important');
            return true;
        }
        console.warn('[LuminaChatUI] applyViewportMinHeight failed: viewportHeight is 0');
        return false;
    }
    adjustEntryMargin(entry, behavior = 'none') {
        if (!entry) return;

        const run = () => {
            const container = this.container.querySelector('.lumina-chat-container') || this.container;
            const inputWrapper = this.container.querySelector('.lumina-chat-input-wrapper') || document.body.querySelector('.lumina-chat-input-wrapper');
            LuminaChatUI.applyViewportMinHeight(entry, container, inputWrapper);
            this._marginTimer = null;
        };

        // For Spotlight or when 'none' is explicitly passed as behavior in sensitive contexts,
        // we might want immediate application to avoid scroll jumping.
        const isSpotlight = this.options.isSpotlight;
        if (behavior === 'immediate' || (isSpotlight && behavior === 'none')) {
            if (this._marginTimer) {
                clearTimeout(this._marginTimer);
                this._marginTimer = null;
            }
            run();
        } else {
            if (this._marginTimer) clearTimeout(this._marginTimer);
            this._marginTimer = setTimeout(run, 50);
        }
    }
    clearEntryMargins(excludeEntry = null) {
        if (!this.historyEl) return;

        if (this._lastActiveEntry && this._lastActiveEntry !== excludeEntry) {
            try {
                this._lastActiveEntry.style.removeProperty('min-height');
            } catch (e) { }
        }

        const allEntries = this.historyEl.querySelectorAll('.lumina-dict-entry');
        allEntries.forEach(e => {
            if (e !== excludeEntry) {
                e.style.removeProperty('min-height');
            }
        });

        this._lastActiveEntry = (excludeEntry && excludeEntry.classList.contains('lumina-dict-entry')) ? excludeEntry : null;
    }
    _extractContext(rawText) {
        if (!rawText) return '';
        // Support both SelectedText: "..." and $ContextTag formats
        const match = rawText.match(/^SelectedText: "([\s\S]*?)"(?:\n\n|$)/);
        return match ? match[1] : '';
    }

    _showTagTooltip(target, content, isHtml = false) {
        if (!this.sharedTooltip) {
            this.sharedTooltip = document.createElement('div');
            this.sharedTooltip.id = 'lumina-chat-tag-tooltip';
            this.sharedTooltip.className = 'lumina-tooltip';
            this.sharedTooltip.style.position = 'fixed';
            this.sharedTooltip.style.zIndex = '2147483647'; // Max z-index
            this.sharedTooltip.style.pointerEvents = 'none';
            this.sharedTooltip.style.display = 'none';
            this.sharedTooltip.style.animation = 'none'; // Avoid jumpy positioning

            // Hardcode core styles for resilience (where styles.css is not injected)
            Object.assign(this.sharedTooltip.style, {
                padding: '10px 14px',
                borderRadius: '10px',
                fontSize: '13px',
                lineHeight: '1.5',
                color: '#ffffff',
                backgroundColor: 'rgba(28, 28, 30, 0.98)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
                whiteSpace: 'normal',
                wordBreak: 'break-word',
                boxSizing: 'border-box',
                transition: 'opacity 0.2s ease'
            });

            document.body.appendChild(this.sharedTooltip);
        }

        if (isHtml) {
            this.sharedTooltip.innerHTML = content;
        } else {
            this.sharedTooltip.textContent = content;
        }

        // Essential layout properties
        const viewportPadding = 12;
        this.sharedTooltip.style.maxWidth = `${Math.max(220, Math.min(420, window.innerWidth - (viewportPadding * 2)))}px`;
        this.sharedTooltip.style.maxHeight = '240px';
        this.sharedTooltip.style.overflowY = 'auto';
        this.sharedTooltip.style.overflowX = 'hidden';

        this.sharedTooltip.style.display = 'block';
        this.sharedTooltip.style.visibility = 'hidden'; // Hide during measurement
        this.sharedTooltip.style.opacity = '0';

        // Wait for next frame to ensure the tooltip is rendered so we can measure its height/width correctly
        requestAnimationFrame(() => {
            const rect = target.getBoundingClientRect();
            const tooltipWidth = this.sharedTooltip.offsetWidth;
            const tooltipHeight = this.sharedTooltip.offsetHeight;
            const tagWidth = rect.width;

            let topPosition = rect.top - tooltipHeight - 12;

            // If it hits the top beyond view, show below (Old logic behavior)
            if (topPosition < viewportPadding) {
                topPosition = rect.bottom + 12;
            }

            const centeredLeft = rect.left + (tagWidth / 2) - (tooltipWidth / 2);
            const clampedLeft = Math.max(viewportPadding, Math.min(centeredLeft, window.innerWidth - tooltipWidth - viewportPadding));

            this.sharedTooltip.style.left = `${clampedLeft}px`;
            this.sharedTooltip.style.top = `${topPosition}px`;
            this.sharedTooltip.style.visibility = 'visible';
            this.sharedTooltip.style.opacity = '1';
        });
    }

    _hideTagTooltip() {
        if (this.sharedTooltip) {
            this.sharedTooltip.style.display = 'none';
            this.sharedTooltip.style.opacity = '0';
        }
    }


    setInitialEntryHeight(entry, skipScroll = false, preAppendScroll = 0, forceScroll = false) {
        if (!entry || !this.container) return;
        const scrollContainer = this.getScrollContainer();
        if (!scrollContainer) return;
        const container = this.container.querySelector('.lumina-chat-container') || this.container;
        const inputWrapper = this.container.querySelector('.lumina-chat-input-wrapper') || document.body.querySelector('.lumina-chat-input-wrapper');
        const allEntries = this.historyEl.querySelectorAll('.lumina-dict-entry');
        const currentIndex = Array.from(allEntries).indexOf(entry);
        if (LuminaChatUI.applyViewportMinHeight(entry, container, inputWrapper)) {
            this.clearEntryMargins(entry);
            if (!skipScroll && (!this.disableAutoScroll || forceScroll)) {
                const targetScrollTop = LuminaChatUI.calculateInitialScrollTarget(entry, scrollContainer, this.historyEl);
                const { viewportHeight } = LuminaChatUI.getViewportStats(container, inputWrapper);
                const maxScroll = scrollContainer.scrollHeight - viewportHeight;
                scrollContainer.scrollTop = Math.min(targetScrollTop, maxScroll);
            }
        } else {
            setTimeout(() => this.setInitialEntryHeight(entry, skipScroll), 80);
        }
    }
    appendError(text) {
        this.removeLoading();
        this.removeSearching();

        const isStopped = text && (text.includes('BodyStreamBuffer') || text.includes('aborted'));
        if (isStopped) {
            const entry = this.currentEntryDiv || this.historyEl.lastElementChild;
            if (entry && entry.querySelector('.lumina-chat-answer.is-stopped')) {
                return;
            }
        }
        
        let targetDiv = this.currentAnswerDiv;
        let isNewDiv = false;

        if (!targetDiv) {
            targetDiv = document.createElement('div');
            targetDiv.className = 'lumina-chat-answer';
            isNewDiv = true;
        }

        let answerContentDiv = targetDiv.querySelector('.lumina-answer-content');
        if (!answerContentDiv) {
            answerContentDiv = document.createElement('div');
            answerContentDiv.className = 'lumina-answer-content';
            targetDiv.appendChild(answerContentDiv);
        }

        const errorDiv = document.createElement('div');
        if (isStopped) {
            targetDiv.classList.add('is-stopped');
            errorDiv.className = 'lumina-error-message';
            errorDiv.textContent = 'You stopped this response';
            errorDiv.style.opacity = '0.6';
            errorDiv.style.fontSize = '0.9em';
            errorDiv.style.marginTop = '8px';
        } else {
            errorDiv.className = 'lumina-error-message';
            errorDiv.style.setProperty('color', 'var(--lumina-error)', 'important');
            errorDiv.style.marginTop = '8px';
            errorDiv.textContent = text;
        }
        answerContentDiv.appendChild(errorDiv);

        if (isNewDiv) {
            if (this.currentEntryDiv) {
                const separator = this.currentEntryDiv.querySelector('.lumina-dict-separator');
                if (separator) {
                    this.currentEntryDiv.insertBefore(targetDiv, separator);
                } else {
                    this.currentEntryDiv.appendChild(targetDiv);
                    const newSep = document.createElement('div');
                    newSep.className = 'lumina-dict-separator';
                    this.currentEntryDiv.appendChild(newSep);
                }
                this.adjustEntryMargin(this.currentEntryDiv, 'none');
            } else {
                this.historyEl.appendChild(targetDiv);
            }
        }

        LuminaChatUI.injectAnswerActions(targetDiv);
        this.scrollToBottom();
        this.currentAnswerDiv = null;
    }
    updateStatusText(statusWrapper, text) {
        if (!statusWrapper) return;
        const textSpan = statusWrapper.querySelector('.lumina-status-text');
        if (!textSpan) return;
        if (textSpan.textContent === text) return;

        if (!textSpan.textContent) {
            textSpan.textContent = text;
            return;
        }

        textSpan.style.transition = 'opacity 0.2s cubic-bezier(0.2, 0.8, 0.2, 1), transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)';
        textSpan.style.opacity = '0';
        textSpan.style.transform = 'translateY(-4px)';
        
        setTimeout(() => {
            textSpan.textContent = text;
            textSpan.style.transform = 'translateY(4px)';
            void textSpan.offsetHeight;
            textSpan.style.opacity = '1';
            textSpan.style.transform = 'translateY(0)';
        }, 150);
    }
    getLoadingHTML() {
        return `<div class="lumina-thinking"><div class="lumina-dots-loader"><span></span><span></span><span></span></div><span class="lumina-status-text"></span></div>`;
    }
    getTranslationSkeletonHTML() {
        // Initial placeholder, will be refined in appendPartialTranslation
        return `
            <div class="lumina-translation-skeleton">
                <div class="lumina-skeleton-line long"></div>
                <div class="lumina-skeleton-line long"></div>
                <div class="lumina-skeleton-line medium"></div>
            </div>
        `;
    }
    showLoading(entryDiv = null) {
        if (this.loadingDiv) this.removeLoading();
        
        if (entryDiv) {
            this.currentEntryDiv = entryDiv;
        }
        if (!this.currentAnswerDiv) {
            this.currentAnswerDiv = this.createAnswerDiv();
        }
        let answerContentDiv = this.currentAnswerDiv.querySelector('.lumina-answer-content');
        if (!answerContentDiv) {
            answerContentDiv = document.createElement('div');
            answerContentDiv.className = 'lumina-answer-content';
            this.currentAnswerDiv.appendChild(answerContentDiv);
        }

        this.loadingDiv = document.createElement('div');
        this.loadingDiv.className = 'lumina-loading-wrapper';
        this.loadingDiv.innerHTML = this.getLoadingHTML();

        answerContentDiv.appendChild(this.loadingDiv);
        requestAnimationFrame(() => this.scrollToBottom(true));
    }
    removeLoading() {
        if (this.loadingDiv) {
            this.loadingDiv.remove();
            this.loadingDiv = null;
        }

        if (this.historyEl) {
            const extraLoading = this.historyEl.querySelectorAll('.lumina-loading-wrapper');
            extraLoading.forEach(el => el.remove());
        }
    }
    clearAnswer(entryDiv) {
        if (!entryDiv) return;

        const answers = entryDiv.querySelectorAll('.lumina-chat-answer, .lumina-answer-versions, .lumina-answer-nav');
        answers.forEach(el => el.remove());

        const loading = entryDiv.querySelectorAll('.lumina-loading-wrapper');
        loading.forEach(el => el.remove());

        const searching = entryDiv.querySelectorAll('.lumina-searching-indicator');
        searching.forEach(el => el.remove());

        this.currentAnswerDiv = null;
    }
    showSearching(query) {
        const text = query ? `Searching for ${query}` : 'Searching';

        // Reuse the loadingDiv or existing searching indicator to keep dots in same position
        const statusWrapper = this.loadingDiv || this.searchingDiv;
        if (statusWrapper) {
            const thinkingEl = statusWrapper.querySelector('.lumina-thinking');
            if (thinkingEl) {
                let textSpan = thinkingEl.querySelector('.lumina-status-text');
                if (!textSpan) {
                    textSpan = document.createElement('span');
                    textSpan.className = 'lumina-status-text';
                    thinkingEl.appendChild(textSpan);
                }
                this.updateStatusText(statusWrapper, text);
                this.searchingDiv = statusWrapper;
                this.loadingDiv = null;
                return;
            }
        }

        // Fallback: create new searching indicator (using same structure to avoid jumps)
        this.removeSearching();
        
        if (!this.currentAnswerDiv) {
            this.currentAnswerDiv = this.createAnswerDiv();
        }
        let answerContentDiv = this.currentAnswerDiv.querySelector('.lumina-answer-content');
        if (!answerContentDiv) {
            answerContentDiv = document.createElement('div');
            answerContentDiv.className = 'lumina-answer-content';
            this.currentAnswerDiv.appendChild(answerContentDiv);
        }

        this.searchingDiv = document.createElement('div');
        this.searchingDiv.className = 'lumina-loading-wrapper';
        this.searchingDiv.innerHTML = `<div class="lumina-thinking"><div class="lumina-dots-loader"><span></span><span></span><span></span></div><span class="lumina-status-text">${text}</span></div>`;
        
        answerContentDiv.appendChild(this.searchingDiv);
        this.scrollToBottom(true);
    }
    removeSearching() {
        if (this.searchingDiv) {
            this.searchingDiv.remove();
            this.searchingDiv = null;
        }

        if (this.historyEl) {
            const extraSearching = this.historyEl.querySelectorAll('.lumina-loading-wrapper, .lumina-searching-indicator');
            extraSearching.forEach(el => el.remove());
        }
    }

    _clearCommentInteractions() {
        if (!this.historyEl) return;


        const buttons = this.historyEl.querySelectorAll('.lumina-send-comment-btn');
        buttons.forEach(btn => btn.remove());



    }
    handleWebSearchStatus(msg) {
        if (msg.hideProgress) {
            this.removeLoading();
            this.removeSearching();
            if (msg.sources) this.webSearchSources = msg.sources;
            return;
        }
        if (msg.status === 'searching') {
            this.showSearching(msg.query);
        } else if (msg.status === 'analyzing' || msg.status === 'completed') {
            if (msg.sources) this.webSearchSources = msg.sources;
            this.removeSearching();
            this.removeLoading();
        } else if (msg.status === 'error') {
            this.removeSearching();
            this.removeLoading();
        }
    }
    async addFile(file) {
        if (!file) return false;

        if (this._isDocxFile(file)) {
            const sourceAttachmentId = this._createAttachmentId();
            const rawDocx = await this._prepareRawFileAttachment(file);

            if (rawDocx) {
                rawDocx.attachmentId = sourceAttachmentId;
                this._addPreparedFile(rawDocx);
            }

            try {
                const derivedFiles = await this._extractDocxAsAttachments(file);
                derivedFiles.forEach((prepared, idx) => {
                    prepared.attachmentId = `${sourceAttachmentId}:derived:${idx + 1}`;
                    prepared.parentAttachmentId = sourceAttachmentId;
                    prepared.hiddenInPreview = true;
                    this._addPreparedFile(prepared);
                });
            } catch (error) {
                console.warn('[Lumina] DOCX extraction failed; keeping raw DOCX attach:', error);
            }

            if (rawDocx) {
                this.renderFilePreviews();
                this._updateContainerState();
                return true;
            }
        }

        if (this._isXlsxFile(file)) {
            const sourceAttachmentId = this._createAttachmentId();
            const rawXlsx = await this._prepareRawFileAttachment(file);

            if (rawXlsx) {
                rawXlsx.attachmentId = sourceAttachmentId;
                this._addPreparedFile(rawXlsx);
            }

            try {
                const derivedFiles = await this._extractXlsxAsAttachments(file);
                derivedFiles.forEach((prepared, idx) => {
                    prepared.attachmentId = `${sourceAttachmentId}:derived:${idx + 1}`;
                    prepared.parentAttachmentId = sourceAttachmentId;
                    prepared.hiddenInPreview = true;
                    this._addPreparedFile(prepared);
                });
            } catch (error) {
                console.warn('[Lumina] XLSX extraction failed; keeping raw XLSX attach:', error);
            }

            if (rawXlsx) {
                this.renderFilePreviews();
                this._updateContainerState();
                return true;
            }
        }

        try {
            let derivedFiles = [];

            if (derivedFiles.length > 0) {
                derivedFiles.forEach((prepared) => this._addPreparedFile(prepared));
                this.renderFilePreviews();
                this._updateContainerState();
                return true;
            }
        } catch (error) {
            console.warn('[Lumina] Office parsing failed, falling back to raw file attach:', error);
        }

        return await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                const dataUrl = e.target.result;
                const mimeType = file.type;
                const isImage = mimeType.startsWith('image/');
                const isVideo = mimeType.startsWith('video/');
                const isAudio = mimeType.startsWith('audio/');
                const isPDF = mimeType === 'application/pdf';

                let fileObj = {
                    mimeType: mimeType,
                    name: file.name,
                    isImage: isImage,
                    isVideo: isVideo,
                    isAudio: isAudio,
                    isPDF: isPDF,
                    dataUrl: dataUrl
                };
                if (isImage) {
                    fileObj.previewUrl = this._createObjectUrl(file);
                }
                this._addPreparedFile(fileObj);
                this.renderFilePreviews();
                this._updateContainerState();
                resolve(true);
            };
            reader.onerror = () => resolve(false);
            reader.readAsDataURL(file);
        });
    }

    _createAttachmentId() {
        return `att-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    }

    async _readFileAsDataUrl(file) {
        return await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result || '');
            reader.onerror = () => resolve('');
            reader.readAsDataURL(file);
        });
    }

    async _prepareRawFileAttachment(file) {
        const dataUrl = await this._readFileAsDataUrl(file);
        if (!dataUrl) return null;

        const mimeType = file.type;
        const isImage = mimeType.startsWith('image/');
        const isVideo = mimeType.startsWith('video/');
        const isAudio = mimeType.startsWith('audio/');
        const isPDF = mimeType === 'application/pdf';
        const fileObj = {
            mimeType,
            name: file.name,
            isImage,
            isVideo,
            isAudio,
            isPDF,
            dataUrl
        };
        if (isImage) fileObj.previewUrl = this._createObjectUrl(file);
        return fileObj;
    }

    _compressImage(dataUrl, maxWidth = 1024, maxHeight = 1024, quality = 0.7) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                let width = img.width;
                let height = img.height;
                if (width > maxWidth || height > maxHeight) {
                    if (width > height) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    } else {
                        width = Math.round((width * maxHeight) / height);
                        height = maxHeight;
                    }
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = () => {
                resolve(dataUrl);
            };
            img.src = dataUrl;
        });
    }

    _addPreparedFile(fileObj) {
        if (!fileObj || typeof fileObj !== 'object') return;
        if (fileObj.isImage && !fileObj.previewUrl && fileObj.dataUrl) {
            fileObj.previewUrl = this._resolveImagePreviewSrc(fileObj, fileObj.dataUrl);
        }
        if (!fileObj.attachmentId) {
            fileObj.attachmentId = this._createAttachmentId();
        }
        this.attachedFiles.push(fileObj);
        if (fileObj.dataUrl) this.selectedImages.push(fileObj.dataUrl);

        if (fileObj.isImage || fileObj.isVideo || fileObj.isAudio || fileObj.isPDF) {
            fileObj.status = 'uploading';

            const startUpload = (dataUrl) => {
                fileObj.dataUrl = dataUrl;
                if (fileObj.isImage) {
                    fileObj.previewUrl = dataUrl;
                }
                this._syncSelectedImagesFromAttachments();

                const base64Data = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
                const finalMimeType = dataUrl.includes(',') ? dataUrl.split(';')[0].split(':')[1] : fileObj.mimeType;
                fileObj.mimeType = finalMimeType;

                chrome.runtime.sendMessage({
                    action: 'upload_gemini_file',
                    fileData: base64Data,
                    fileName: fileObj.name,
                    mimeType: finalMimeType,
                    providerId: this.activeTabModel?.providerId
                }, (response) => {
                    if (chrome.runtime.lastError || !response || !response.success) {
                        const errMsg = chrome.runtime.lastError?.message || response?.error || 'Unknown error';
                        console.error('[Lumina] File upload failed:', errMsg);
                        this.attachedFiles = this.attachedFiles.filter(f => f.attachmentId !== fileObj.attachmentId);
                        this._syncSelectedImagesFromAttachments();
                        this.renderFilePreviews();
                        this._updateContainerState();
                        alert(`Failed to upload ${fileObj.name} to Gemini: ${errMsg}`);
                    } else {
                        fileObj.status = 'done';
                        fileObj.fileUri = response.file.uri;
                        fileObj.googleName = response.file.name;
                        this.renderFilePreviews();
                        this._updateContainerState();
                    }
                });
            };

            if (fileObj.isImage && fileObj.dataUrl) {
                this._compressImage(fileObj.dataUrl).then(compressedUrl => {
                    startUpload(compressedUrl);
                });
            } else {
                startUpload(fileObj.dataUrl);
            }
        }
    }

    _syncSelectedImagesFromAttachments() {
        this.selectedImages = this.attachedFiles
            .map((file) => file?.dataUrl)
            .filter((dataUrl) => typeof dataUrl === 'string' && dataUrl.length > 0);
    }

    _isXlsxFile(file) {
        const name = (file?.name || '').toLowerCase();
        const mime = (file?.type || '').toLowerCase();
        return mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || name.endsWith('.xlsx');
    }

    _isDocxFile(file) {
        const name = (file?.name || '').toLowerCase();
        const mime = (file?.type || '').toLowerCase();
        return mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || name.endsWith('.docx');
    }

    async _extractXlsxAsAttachments(file) {
        const entries = await this._readZipEntries(await file.arrayBuffer());
        const workbookXml = this._decodeUtf8(entries['xl/workbook.xml']);
        if (!workbookXml) return [];

        const workbookRelsXml = this._decodeUtf8(entries['xl/_rels/workbook.xml.rels']);
        const sharedStringsXml = this._decodeUtf8(entries['xl/sharedStrings.xml']);
        const sharedStrings = this._parseSharedStrings(sharedStringsXml);
        const sheetPathByRelId = this._parseWorkbookRelationships(workbookRelsXml);

        const parser = new DOMParser();
        const workbookDoc = parser.parseFromString(workbookXml, 'application/xml');
        const sheetNodes = Array.from(workbookDoc.getElementsByTagName('sheet'));
        const baseName = (file.name || 'workbook').replace(/\.[^.]+$/, '');
        const attachments = [];

        sheetNodes.forEach((sheetNode, idx) => {
            const relId = sheetNode.getAttribute('r:id');
            const targetPath = relId ? sheetPathByRelId[relId] : '';
            const fallbackPath = `xl/worksheets/sheet${idx + 1}.xml`;
            const sheetPath = targetPath && entries[targetPath] ? targetPath : fallbackPath;
            const sheetXml = this._decodeUtf8(entries[sheetPath]);
            if (!sheetXml) return;

            const sheetName = sheetNode.getAttribute('name') || `Sheet${idx + 1}`;
            const csv = this._sheetXmlToCsv(sheetXml, sharedStrings);
            if (!csv) return;

            const csvName = `${baseName} - ${sheetName}.csv`.replace(/[\\/:*?"<>|]/g, '_');
            const dataUrl = this._textToDataUrl(csv, 'text/csv');
            const base64Data = dataUrl.split(',')[1] || '';

            attachments.push({
                mimeType: 'text/csv',
                name: csvName,
                isImage: false,
                dataUrl,
                data: base64Data
            });
        });

        return attachments;
    }

    async _extractDocxAsAttachments(file) {
        const entries = await this._readZipEntries(await file.arrayBuffer());
        const docXml = this._decodeUtf8(entries['word/document.xml']);
        const baseName = (file.name || 'document').replace(/\.[^.]+$/, '');
        const attachments = [];

        if (docXml) {
            const text = this._docxXmlToText(docXml);
            if (text.trim()) {
                const dataUrl = this._textToDataUrl(text, 'text/plain');
                attachments.push({
                    mimeType: 'text/plain',
                    name: `${baseName}.txt`,
                    isImage: false,
                    dataUrl,
                    data: dataUrl.split(',')[1] || ''
                });
            }
        }

        Object.keys(entries).forEach((path) => {
            if (!path.startsWith('word/media/')) return;
            const mimeType = this._mimeFromExtension(path);
            if (!mimeType || !mimeType.startsWith('image/')) return;

            const bytes = entries[path];
            const dataUrl = this._bytesToDataUrl(bytes, mimeType);
            const fileName = path.split('/').pop() || 'image';
            attachments.push({
                mimeType,
                name: `${baseName} - ${fileName}`,
                isImage: true,
                dataUrl,
                data: dataUrl.split(',')[1] || '',
                previewUrl: this._resolveImagePreviewSrc(null, dataUrl)
            });
        });

        return attachments;
    }

    _parseWorkbookRelationships(xml) {
        if (!xml) return {};
        const parser = new DOMParser();
        const doc = parser.parseFromString(xml, 'application/xml');
        const relNodes = Array.from(doc.getElementsByTagName('Relationship'));
        const out = {};
        relNodes.forEach((node) => {
            const id = node.getAttribute('Id');
            const target = node.getAttribute('Target') || '';
            if (!id || !target) return;
            const normalized = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
            out[id] = normalized.replace(/\\/g, '/');
        });
        return out;
    }

    _parseSharedStrings(xml) {
        if (!xml) return [];
        const parser = new DOMParser();
        const doc = parser.parseFromString(xml, 'application/xml');
        const siNodes = Array.from(doc.getElementsByTagName('si'));
        return siNodes.map((si) => {
            const tNodes = Array.from(si.getElementsByTagName('t'));
            return tNodes.map((t) => t.textContent || '').join('');
        });
    }

    _sheetXmlToCsv(sheetXml, sharedStrings) {
        if (!sheetXml) return '';
        const parser = new DOMParser();
        const doc = parser.parseFromString(sheetXml, 'application/xml');
        const rowNodes = Array.from(doc.getElementsByTagName('row'));
        const lines = [];

        rowNodes.forEach((rowNode) => {
            const cellNodes = Array.from(rowNode.getElementsByTagName('c'));
            const rowValues = [];

            cellNodes.forEach((cell) => {
                const ref = cell.getAttribute('r') || '';
                const t = (cell.getAttribute('t') || '').toLowerCase();
                const vNode = cell.getElementsByTagName('v')[0];
                const isNode = cell.getElementsByTagName('is')[0];

                let value = '';
                if (t === 's' && vNode) {
                    const idx = parseInt(vNode.textContent || '0', 10);
                    value = Number.isFinite(idx) ? (sharedStrings[idx] || '') : '';
                } else if (t === 'inlineStr' && isNode) {
                    value = Array.from(isNode.getElementsByTagName('t')).map((n) => n.textContent || '').join('');
                } else if (vNode) {
                    value = vNode.textContent || '';
                }

                const colIdx = this._columnRefToIndex(ref);
                rowValues[colIdx] = this._escapeCsv(value);
            });

            let last = rowValues.length - 1;
            while (last >= 0 && (rowValues[last] === undefined || rowValues[last] === '')) last -= 1;
            if (last < 0) {
                lines.push('');
            } else {
                lines.push(rowValues.slice(0, last + 1).map((v) => v || '').join(','));
            }
        });

        return lines.join('\n');
    }

    _columnRefToIndex(ref) {
        const match = String(ref || '').match(/[A-Z]+/i);
        if (!match) return 0;
        const letters = match[0].toUpperCase();
        let idx = 0;
        for (let i = 0; i < letters.length; i++) {
            idx = idx * 26 + (letters.charCodeAt(i) - 64);
        }
        return Math.max(0, idx - 1);
    }

    _escapeCsv(value) {
        const raw = String(value == null ? '' : value);
        if (/[",\n\r]/.test(raw)) {
            return `"${raw.replace(/"/g, '""')}"`;
        }
        return raw;
    }

    _docxXmlToText(xml) {
        if (!xml) return '';
        const parser = new DOMParser();
        const doc = parser.parseFromString(xml, 'application/xml');
        const paragraphs = Array.from(doc.getElementsByTagName('w:p'));
        const out = [];
        paragraphs.forEach((p) => {
            const text = Array.from(p.getElementsByTagName('w:t')).map((n) => n.textContent || '').join('');
            out.push(text);
        });
        return out.join('\n').replace(/\n{3,}/g, '\n\n');
    }

    async _readZipEntries(arrayBuffer) {
        const bytes = new Uint8Array(arrayBuffer);
        const view = new DataView(arrayBuffer);
        const eocdOffset = this._findEocdOffset(view);
        if (eocdOffset < 0) throw new Error('Invalid ZIP: EOCD not found');

        const centralDirSize = view.getUint32(eocdOffset + 12, true);
        const centralDirOffset = view.getUint32(eocdOffset + 16, true);
        const entries = {};

        let ptr = centralDirOffset;
        const end = centralDirOffset + centralDirSize;

        while (ptr + 46 <= end && view.getUint32(ptr, true) === 0x02014b50) {
            const compression = view.getUint16(ptr + 10, true);
            const compressedSize = view.getUint32(ptr + 20, true);
            const nameLen = view.getUint16(ptr + 28, true);
            const extraLen = view.getUint16(ptr + 30, true);
            const commentLen = view.getUint16(ptr + 32, true);
            const localHeaderOffset = view.getUint32(ptr + 42, true);

            const nameBytes = bytes.slice(ptr + 46, ptr + 46 + nameLen);
            const fileName = new TextDecoder('utf-8').decode(nameBytes).replace(/\\/g, '/');

            if (view.getUint32(localHeaderOffset, true) !== 0x04034b50) {
                ptr += 46 + nameLen + extraLen + commentLen;
                continue;
            }

            const localNameLen = view.getUint16(localHeaderOffset + 26, true);
            const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
            const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
            const compressedBytes = bytes.slice(dataStart, dataStart + compressedSize);

            if (compression === 0) {
                entries[fileName] = new Uint8Array(compressedBytes);
            } else if (compression === 8) {
                entries[fileName] = await this._inflateRaw(compressedBytes);
            }

            ptr += 46 + nameLen + extraLen + commentLen;
        }

        return entries;
    }

    _findEocdOffset(view) {
        const min = Math.max(0, view.byteLength - 0xffff - 22);
        for (let i = view.byteLength - 22; i >= min; i--) {
            if (view.getUint32(i, true) === 0x06054b50) return i;
        }
        return -1;
    }

    async _inflateRaw(compressedBytes) {
        if (typeof DecompressionStream === 'undefined') {
            throw new Error('DecompressionStream is not available');
        }
        const stream = new Blob([compressedBytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        const out = await new Response(stream).arrayBuffer();
        return new Uint8Array(out);
    }

    _decodeUtf8(bytes) {
        if (!bytes) return '';
        try {
            return new TextDecoder('utf-8').decode(bytes);
        } catch (_) {
            return '';
        }
    }

    _bytesToBase64(bytes) {
        let binary = '';
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
            const chunk = bytes.subarray(i, i + chunkSize);
            binary += String.fromCharCode(...chunk);
        }
        return btoa(binary);
    }

    _bytesToDataUrl(bytes, mimeType) {
        return `data:${mimeType};base64,${this._bytesToBase64(bytes)}`;
    }

    _textToDataUrl(text, mimeType) {
        const bytes = new TextEncoder().encode(text || '');
        return this._bytesToDataUrl(bytes, mimeType || 'text/plain');
    }

    _mimeFromExtension(path) {
        const ext = (String(path || '').split('.').pop() || '').toLowerCase();
        const map = {
            png: 'image/png',
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            gif: 'image/gif',
            webp: 'image/webp',
            bmp: 'image/bmp',
            tif: 'image/tiff',
            tiff: 'image/tiff',
            heic: 'image/heic',
            heif: 'image/heif'
        };
        return map[ext] || '';
    }
    addImage(dataUrl) {
        const previewUrl = this._resolveImagePreviewSrc(null, dataUrl);
        const fileObj = {
            mimeType: 'image/png',
            name: 'Pasted Image',
            isImage: true,
            dataUrl: dataUrl,
            previewUrl: previewUrl
        };
        this._addPreparedFile(fileObj);
        this.renderFilePreviews();
    }
    removeFile(index) {
        const file = this.attachedFiles[index];
        if (!file) return;

        if (file.attachmentId && file.status === 'uploading') {
            chrome.runtime.sendMessage({ action: 'abort_gemini_upload', attachmentId: file.attachmentId });
        }

        const groupId = file.parentAttachmentId || file.attachmentId || null;
        if (groupId) {
            const kept = [];
            this.attachedFiles.forEach((item) => {
                const isGroupRoot = item?.attachmentId === groupId;
                const isGroupChild = item?.parentAttachmentId === groupId;
                if (isGroupRoot || isGroupChild) {
                    this._revokeObjectUrl(item?.previewUrl);
                    return;
                }
                kept.push(item);
            });
            this.attachedFiles = kept;
        } else {
            this._revokeObjectUrl(file?.previewUrl);
            this.attachedFiles.splice(index, 1);
        }

        this._syncSelectedImagesFromAttachments();
        this.renderFilePreviews();
        this._updateContainerState();
    }
    clearImages() {
        this.attachedFiles.forEach(file => this._revokeObjectUrl(file?.previewUrl));
        this.attachedFiles = [];
        this.selectedImages = [];
        this.renderFilePreviews();
        this._updateContainerState();
    }
    renderFilePreviews() {
        this._throttledUpdateTokenCount();
        if (!this.filePreviewEl) return;
        const visibleEntries = this.attachedFiles
            .map((file, index) => ({ file, index }))
            .filter(({ file }) => !file?.hiddenInPreview);

        if (visibleEntries.length === 0) {
            this.filePreviewEl.innerHTML = '';
            return;
        }
        const listDiv = document.createElement('div');
        listDiv.className = 'lumina-file-list lumina-image-list';
        visibleEntries.forEach(({ file, index }) => {
            const itemDiv = document.createElement('div');
            itemDiv.className = `lumina-file-preview-item lumina-image-preview-item ${!file.isImage ? 'is-file' : ''} ${file.status === 'uploading' ? 'is-uploading' : ''}`;
            itemDiv.title = file.name;
            let content = '';
            if (file.isImage) {
                content = `<img src="${file.previewUrl || file.dataUrl}" alt="${file.name}">`;
            } else {
                const fileName = file.name || 'File';
                const rawExt = fileName.includes('.') ? fileName.split('.').pop() : '';
                const ext = (rawExt || '').toLowerCase();
                const category = LuminaChatUI.inferFileCategory(ext, file.mimeType || '');
                const icon = LuminaChatUI.getFileIconByCategory(category);
                const displayName = LuminaChatUI.getDisplayFileName(fileName);
                const typeLabel = LuminaChatUI.getFileTypeLabel(file);
                content = `<div class="lumina-file-preview-info"><span class="lumina-file-name">${this.escapeHTMLAttr(displayName || fileName)}</span><div class="lumina-file-meta-row"><span class="lumina-file-icon-inline file-${category}">${icon}</span><span class="lumina-file-size-tag">${this.escapeHTMLAttr(typeLabel)}</span></div></div>`;
            }
            itemDiv.innerHTML = content;
            const removeBtn = document.createElement('div');
            removeBtn.className = 'lumina-file-remove lumina-image-remove';
            removeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
            removeBtn.onclick = () => this.removeFile(index);
            itemDiv.appendChild(removeBtn);
            listDiv.appendChild(itemDiv);
        });
        this.filePreviewEl.innerHTML = '';
        this.filePreviewEl.appendChild(listDiv);
    }
    _smoothScrollTo(targetScrollTop, _durationUnused = 1250) {
        const scrollContainer = this.getScrollContainer();
        if (!scrollContainer) return;
        if (this._scrollAnimationId) {
            cancelAnimationFrame(this._scrollAnimationId);
            this._scrollAnimationId = null;
        }
        scrollContainer.scrollTop = targetScrollTop;
        if (this._pendingMarginEntry) {
            this.adjustEntryMargin(this._pendingMarginEntry, 'none');
            this._pendingMarginEntry = null;
        }
    }
    scrollToBottom(force = false) {
        if (!force && (this.disableAutoScroll || this.disableStreamAutoFollow)) return;
        const scrollContainer = this.getScrollContainer();
        if (scrollContainer) {
            scrollContainer.scrollTop = scrollContainer.scrollHeight;
        }
    }
    static scrollToBottom(scrollContainer, targetElement = null) {
        if (!scrollContainer) return;
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
    }
    static scrollToElement(targetElement, scrollContainer) {
        return;
    }
    clearHistory() {
        if (this.historyEl) {
            this.historyEl.innerHTML = '';
        }
        this.currentEntryDiv = null;
        this.currentAnswerDiv = null;
        this.clearImages();
        this._updateActionBtnState();
    }
    escapeHTMLAttr(str) {
        if (!str) return '';
        return str.replace(/"/g, '&quot;').replace(/                    /g, ' ').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    escapeHTML(str) {
        if (!str) return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
    static balanceTranslationCard(entry, animate = true) {
        if (!entry) return;
        const card = entry.querySelector('.lumina-translation-card');
        if (!card) return;

        const sourceBlock = card.querySelector(':scope > .lumina-translation-block') || card.querySelector('.lumina-translation-block');
        let activeVersionBlock = card.querySelector('.lumina-answer-version.active .lumina-translation-block');


        if (!activeVersionBlock) {
            const blocks = card.querySelectorAll(':scope > .lumina-translation-block, .lumina-translation-block');
            if (blocks.length >= 2) {
                activeVersionBlock = blocks[blocks.length - 1];
            }
        }

        if (!sourceBlock || !activeVersionBlock) return;
        const left = sourceBlock;
        const right = activeVersionBlock;
        const getStats = (el) => {
            const inner = el.querySelector('.lumina-translation-text');
            if (!inner) return { lines: 0, height: 0 };
            const style = window.getComputedStyle(inner);
            const lh = parseFloat(style.lineHeight) || 26.4;
            const h = inner.scrollHeight;
            return { lines: Math.ceil((h - 1) / lh), height: h };
        };
        const applyWidth = (leftRatio, animate = true) => {
            const val = Math.max(25, Math.min(75, leftRatio));
            left.style.transition = animate ? 'width 0.4s cubic-bezier(0.16, 1, 0.3, 1)' : 'none';
            right.style.transition = animate ? 'width 0.4s cubic-bezier(0.16, 1, 0.3, 1)' : 'none';
            left.style.flex = 'none';
            left.style.width = `${val.toFixed(2)}%`;
            right.style.flex = 'none';
            right.style.width = `${(100 - val).toFixed(2)}%`;
            return left.offsetHeight;
        };
        requestAnimationFrame(() => {
            applyWidth(50, false);
            const s1 = getStats(left);
            const s2 = getStats(right);
            if (s1.lines === 0 || s2.lines === 0) return;
            let low = 25, high = 75;
            let bestWidth = 50;
            let minDiff = Math.abs(s1.lines - s2.lines);
            let minTotalLines = s1.lines + s2.lines;
            for (let i = 0; i < 10; i++) {
                let mid = (low + high) / 2;
                applyWidth(mid, false);
                const ns1 = getStats(left);
                const ns2 = getStats(right);
                const currentDiff = Math.abs(ns1.lines - ns2.lines);
                const currentTotal = ns1.lines + ns2.lines;
                const isBetter = (currentDiff < minDiff) ||
                    (currentDiff === minDiff && currentTotal < minTotalLines) ||
                    (currentDiff === minDiff && currentTotal === minTotalLines && Math.abs(mid - 50) < Math.abs(bestWidth - 50));
                if (isBetter) {
                    minDiff = currentDiff;
                    minTotalLines = currentTotal;
                    bestWidth = mid;
                }
                if (ns1.lines > ns2.lines) low = mid;
                else high = mid;
            }
            applyWidth(bestWidth, animate);
        });
    }
    appendPartialTranslation(text) {
        this._clearCommentInteractions();
        this.clearEntryMargins();
        const safeText = this.escapeHTMLAttr(text);
        const div = document.createElement('div');
        div.className = 'lumina-dict-entry lumina-fade-in';
        div.dataset.entryType = 'translation';
        div.dataset.partial = 'true';
        div.innerHTML = `
            <div class="lumina-chat-question translation-question">Translate</div>
            <div class="lumina-translation-container">
                <div class="lumina-translation-card">
                    <!-- Source Block (left) -->
                    <div class="lumina-translation-block">
                        <div class="lumina-translation-source" data-copy-text="${safeText}">
                            <div class="lumina-translation-text">${text}</div>
                        </div>
                    </div>
                    <!-- Vertical Divider -->
                    <div class="lumina-translation-divider"></div>
                    <!-- Target Block (right) -->
                    <div class="lumina-translation-block">
                        <div class="lumina-translation-target">
                            ${this.getTranslationSkeletonHTML()}
                        </div>
                    </div>
                </div>
            </div>
        `;
        const scrollContainer = this.getScrollContainer();
        const preAppendScroll = scrollContainer ? scrollContainer.scrollTop : 0;
        this.historyEl.appendChild(div);
        this.scrollToBottom();


        requestAnimationFrame(() => {
            const sourceText = div.querySelector('.lumina-translation-text');
            const targetContainer = div.querySelector('.lumina-translation-target');
            if (sourceText && targetContainer) {
                const styles = window.getComputedStyle(sourceText);
                const lineHeight = parseFloat(styles.lineHeight) || 20;
                const height = sourceText.offsetHeight;
                const exactLines = Math.max(Math.round(height / lineHeight), 1);

                let linesHTML = '';
                for (let i = 0; i < exactLines; i++) {
                    const type = (i === exactLines - 1) ? 'medium' : 'long';
                    linesHTML += `<div class="lumina-skeleton-line ${type}"></div>`;
                }
                targetContainer.innerHTML = `<div class="lumina-translation-skeleton">${linesHTML}</div>`;
            }
            this.setInitialEntryHeight(div, false, preAppendScroll, true);
        });
        return div;
    }
    updatePartialTranslation(element, data) {
        if (!element) return;
        if (typeof data === 'string') {
            data = { translation: data, type: 'sentence' };
        }
        if (!data.original) {
            const sourceDiv = element.querySelector('.lumina-translation-source');
            if (sourceDiv) {
                data.original = sourceDiv.getAttribute('data-copy-text') || sourceDiv.textContent.trim();
            }
        }
        const safeOriginal = this.escapeHTMLAttr(data.original || '');
        const safeTranslation = this.escapeHTMLAttr(data.translation || '');
        element.__translationHighlightDone = false;
        
        let sourceHTML = data.original || '';
        let targetHTML = data.translation || '';
        
        if (data.sentences && Array.isArray(data.sentences)) {
            element.dataset.isPreSplit = 'true';
            sourceHTML = data.sentences.map((s, idx) => `<span class="lumina-trans-sentence" data-idx="${idx}">${this.escapeHTML(s.src || '')}</span>`).join(' ');
            targetHTML = data.sentences.map((s, idx) => `<span class="lumina-trans-sentence" data-idx="${idx}">${this.escapeHTML(s.tgt || '')}</span>`).join(' ');
        } else {
            delete element.dataset.isPreSplit;
        }

        element.innerHTML = `
            <div class="lumina-chat-question translation-question">Translate</div>
            <div class="lumina-translation-container">
                <div class="lumina-translation-card">
                    <!-- Source Block (left) -->
                    <div class="lumina-translation-block">
                        <div class="lumina-translation-source" data-copy-text="${safeOriginal}">
                            <div class="lumina-translation-text">${sourceHTML}</div>
                        </div>
                    </div>
                    <!-- Vertical Divider -->
                    <div class="lumina-translation-divider"></div>
                    <!-- Target Block (right) -->
                    <div class="lumina-translation-block">
                        <div class="lumina-translation-target" data-copy-text="${safeTranslation}">
                            <div class="lumina-translation-text">${targetHTML}</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        const separator = document.createElement('div');
        separator.className = 'lumina-dict-separator';
        element.appendChild(separator);
        delete element.dataset.partial;
        this.adjustEntryMargin(element);
        this._throttledUpdateTokenCount();
        requestAnimationFrame(() => LuminaChatUI._setupTranslationHighlight(element));
        LuminaChatUI.balanceTranslationCard(element);
        const regenBtn = this.container.querySelector('#lumina-regenerate-btn') ||
            this.container.querySelector('.lumina-regenerate-btn') ||
            document.getElementById('lumina-regenerate-btn') ||
            document.querySelector('.lumina-regenerate-btn');
        if (regenBtn) {
            regenBtn.style.display = 'flex';
        }

        if (!this.disableStreamAutoFollow) {
            requestAnimationFrame(() => this.scrollToBottom());
        }
    }


    async handleDictionary(word) {
        const entryDiv = this.appendPartialDictionary(word);

        try {

            let response = await chrome.runtime.sendMessage({ action: 'fetch_cambridge_en_vi', word: word });


            if (!response || !response.success || response.error) {
                response = await chrome.runtime.sendMessage({ action: 'fetch_cambridge', word: word });
            }

            if (response && response.success && response.html) {
                const parsed = CambridgeParser.parse(response.html);
                if (parsed && parsed.entries && parsed.entries.length > 0) {
                    this.updatePartialDictionary(entryDiv, parsed);
                } else {

                    this.updatePartialDictionary(entryDiv, { word: word, error: 'No dictionary entry found. Trying AI...' });
                    this.handleAIDictionary(word, entryDiv);
                }
            } else {
                throw new Error(response?.error || 'Failed to fetch dictionary');
            }
        } catch (err) {
            console.error('[Lumina] Dictionary lookup failed:', err);
            this.updatePartialDictionary(entryDiv, { word: word, error: err.message });
        }
    }

    async handleAIDictionary(word, existingEntry = null) {
        let entryDiv = existingEntry;
        if (!entryDiv) {
            entryDiv = this.appendPartialDictionary(word);
        }

        try {
            const response = await chrome.runtime.sendMessage({ action: 'fetch_ai_dict', word: word });
            if (response && response.success && response.data) {
                this.updatePartialDictionary(entryDiv, response.data);
            } else {
                throw new Error(response?.error || 'AI Lookup failed');
            }
        } catch (err) {
            this.updatePartialDictionary(entryDiv, { word: word, error: 'Dictionary unavailable: ' + err.message });
        }
    }

    appendPartialDictionary(word) {
        this._clearCommentInteractions();
        this.clearEntryMargins();
        const div = document.createElement('div');
        div.className = 'lumina-dict-entry lumina-fade-in';
        div.dataset.entryType = 'lookup';
        div.dataset.partial = 'true';
        div.dataset.word = word;

        div.innerHTML = `
            <div class="lumina-chat-question lookup-question">Define: ${word}</div>
            <div class="lumina-chat-answer">
                <div class="lumina-dict-loading">
                    ${this.getLoadingHTML()}
                </div>
            </div>
            <div class="lumina-dict-separator"></div>
        `;
        const scrollContainer = this.getScrollContainer();
        const preAppendScroll = scrollContainer ? scrollContainer.scrollTop : 0;
        this.historyEl.appendChild(div);

        this.disableAutoScroll = false;
        requestAnimationFrame(() => {
            this.setInitialEntryHeight(div, false, preAppendScroll, true);
        });
        return div;
    }

    updatePartialDictionary(element, data) {
        if (!element) return;

        const answerEl = element.querySelector('.lumina-chat-answer');
        if (!answerEl) return;

        if (data.error && !data.entries) {

            if (data.error.includes('BodyStreamBuffer') || data.error.includes('aborted')) {
                answerEl.innerHTML = `<div class="lumina-error-message is-stopped">You stopped this response</div>`;
            } else {
                answerEl.innerHTML = `<div class="lumina-error-message" style="color: var(--lumina-error) !important;">${data.error}</div>`;
            }
        } else {
            answerEl.innerHTML = this.renderDictionaryEntry(data);

            answerEl.querySelectorAll('.lumina-dict-audio-btn').forEach(btn => {
                btn.onclick = () => this.playAudio(btn.dataset.url);
            });
        }

        delete element.dataset.partial;
        this.adjustEntryMargin(element);

        if (!this.disableStreamAutoFollow) {
            requestAnimationFrame(() => this.scrollToBottom());
        }
    }

    renderDictionaryEntry(data) {
        if (!data || !data.entries || data.entries.length === 0) {
            return `<div class="lumina-error-message">No entries found for "${data.word}"</div>`;
        }

        let html = `
            <div class="lumina-dict-card">
                <div class="lumina-dict-header">
                    <span class="lumina-dict-word">${data.word}</span>
                </div>
        `;

        data.entries.forEach(entry => {
            html += `
                <div class="lumina-dict-item">
                    <div class="lumina-dict-meta">
                        ${entry.pos ? `<span class="lumina-dict-pos">${entry.pos}</span>` : ''}
                        ${entry.uk?.ipa ? `
                            <span class="lumina-dict-ipa-group">
                                <span class="lumina-dict-region">UK</span>
                                <span class="lumina-dict-ipa">/${entry.uk.ipa}/</span>
                                ${entry.uk.audio ? `<button class="lumina-dict-audio-btn" data-url="${entry.uk.audio}" title="Play UK Audio">
                                    <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M12 3v9.28c-.47-.17-.97-.28-1.5-.28C8.01 12 6 14.01 6 16.5S8.01 21 10.5 21c2.31 0 4.2-1.75 4.45-4H15V6h4V3h-7z"/></svg>
                                </button>` : ''}
                            </span>
                        ` : ''}
                        ${entry.us?.ipa ? `
                            <span class="lumina-dict-ipa-group">
                                <span class="lumina-dict-region">US</span>
                                <span class="lumina-dict-ipa">/${entry.us.ipa}/</span>
                                ${entry.us.audio ? `<button class="lumina-dict-audio-btn" data-url="${entry.us.audio}" title="Play US Audio">
                                    <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M12 3v9.28c-.47-.17-.97-.28-1.5-.28C8.01 12 6 14.01 6 16.5S8.01 21 10.5 21c2.31 0 4.2-1.75 4.45-4H15V6h4V3h-7z"/></svg>
                                </button>` : ''}
                            </span>
                        ` : ''}
                    </div>
                    <div class="lumina-dict-senses">
            `;

            entry.senses.forEach(sense => {
                html += `<div class="lumina-dict-sense">`;
                if (sense.indicator) {
                    html += `<div class="lumina-dict-indicator">${sense.indicator}</div>`;
                }

                sense.definitions.forEach(def => {
                    html += `
                        <div class="lumina-dict-def-block">
                            <div class="lumina-dict-meaning-text">${def.meaning}</div>
                            ${def.translation ? `<div class="lumina-dict-translation">${def.translation}</div>` : ''}
                            ${def.examples && def.examples.length > 0 ? `
                                <div class="lumina-dict-example">"${def.examples[0]}"</div>
                            ` : ''}
                        </div>
                    `;
                });
                html += `</div>`;
            });

            html += `
                    </div>
                </div>
            `;
        });

        html += `</div>`;
        return html;
    }

    async playAudio(url) {
        if (!url) return;
        try {
            const audio = new Audio(url);
            await audio.play();
        } catch (err) {
            console.error('[Lumina] Failed to play audio:', err);
        }
    }

    static _setupTranslationHighlight(element) {
        if (!element || element.__translationHighlightDone) return;
        const sourceTextEl = element.querySelector('.lumina-translation-source .lumina-translation-text');
        const targetTextEl = element.querySelector('.lumina-translation-target .lumina-translation-text');
        if (!sourceTextEl || !targetTextEl) return;
        
        const card = element.classList.contains('lumina-translation-card') ? element : element.querySelector('.lumina-translation-card');
        const isPreSplit = card?.dataset.isPreSplit === 'true' || element.dataset.isPreSplit === 'true';
        
        let sourceSpans = [];
        let targetSpans = [];
        let totalSentencesCount = 0;
        
        if (isPreSplit) {
            sourceSpans = Array.from(sourceTextEl.querySelectorAll('.lumina-trans-sentence'));
            targetSpans = Array.from(targetTextEl.querySelectorAll('.lumina-trans-sentence'));
            totalSentencesCount = Math.max(sourceSpans.length, targetSpans.length);
        } else {
            const splitSentences = (text) => {
                if (!text) return [];

                text = text.replace(/([a-zà-ỹ])([.!?。！？]+)([A-ZÀ-Ỹ])/g, '$1$2 $3');

                let initialParts = [];
                if (typeof Intl !== 'undefined' && Intl.Segmenter) {
                    // Use browser's built-in intelligent sentence segmenter
                    const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
                    const segments = segmenter.segment(text);
                    for (const { segment } of segments) {
                        initialParts.push(segment);
                    }
                } else {
                    // Fallback to improved regex that also treats newlines as boundaries
                    const re = /[\s\S]*?(?:[.!?。！？]+(?:\s+|$|(?=[A-Z]))|\n+|$)/g;
                    let match;
                    let lastIndex = 0;
                    while ((match = re.exec(text)) !== null) {
                        const m = match[0];
                        if (!m && re.lastIndex === lastIndex) {
                            re.lastIndex++;
                            continue;
                        }
                        initialParts.push(m);
                        lastIndex = re.lastIndex;
                        if (lastIndex >= text.length) break;
                    }
                }

                if (initialParts.length <= 1) return initialParts.length ? initialParts : [text];

                const finalParts = [];
                for (let i = 0; i < initialParts.length; i++) {
                    const part = initialParts[i];
                    const trimmed = part.trim();
                    if (!trimmed) continue;

                    // Existing logic to merge bullets (e.g., "A.", "1.") and common abbreviations
                    const isBullet = trimmed.length <= 3 && /^[A-Za-z0-9][\.\)]?$/i.test(trimmed);
                    const endsWithAbbr = /(?:^|\s|\()(?:St|Dr|Mr|Mrs|Ms|Prof|Inc|Ltd|Co|Approx|Vs|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec|e\.g|i\.e|viz|cf|etc)\.$/i.test(trimmed);
                    const endsWithInitial = /(?:^|\s)[A-Z]\.$/.test(trimmed);

                    if ((isBullet || endsWithAbbr || endsWithInitial) && i < initialParts.length - 1) {
                        initialParts[i + 1] = part + initialParts[i + 1];
                    } else {
                        finalParts.push(part);
                    }
                }
                return finalParts.length ? finalParts : initialParts;
            };
            const sourceSentences = splitSentences(sourceTextEl.textContent);
            const targetSentences = splitSentences(targetTextEl.textContent);
            const wrapSentences = (el, sentences) => {
                el.innerHTML = sentences
                    .map((s, i) => `<span class="lumina-trans-sentence" data-idx="${i}">${s}</span>`)
                    .join('');
            };
            wrapSentences(sourceTextEl, sourceSentences);
            wrapSentences(targetTextEl, targetSentences);
            sourceSpans = Array.from(sourceTextEl.querySelectorAll('.lumina-trans-sentence'));
            targetSpans = Array.from(targetTextEl.querySelectorAll('.lumina-trans-sentence'));
            totalSentencesCount = Math.max(sourceSentences.length, targetSentences.length);
        }
        
        const allSpans = [...sourceSpans, ...targetSpans];
        const maxIdx = totalSentencesCount - 1;
        const clampIdx = (idx, arr) =>
            maxIdx === 0 ? 0 : Math.round((idx / maxIdx) * (arr.length - 1));
        const clearAll = () => allSpans.forEach(s => s.classList.remove('hovered'));
        const handleHover = (e, index, spans, mirrors) => {
            const target = e.target.closest('.lumina-trans-sentence');
            if (target) {
                const idx = parseInt(target.dataset.idx);
                clearAll();
                const currentSpans = spans.filter(s => parseInt(s.dataset.idx) === idx);
                currentSpans.forEach(s => s.classList.add('hovered'));
                
                let mirrorSpans = [];
                if (isPreSplit) {
                    mirrorSpans = mirrors.filter(s => parseInt(s.dataset.idx) === idx);
                } else {
                    const mirrorIdx = clampIdx(idx, mirrors);
                    mirrorSpans = mirrors.filter(s => parseInt(s.dataset.idx) === mirrorIdx);
                }
                mirrorSpans.forEach(s => s.classList.add('hovered'));
            }
        };
        sourceTextEl.addEventListener('mouseover', (e) => handleHover(e, null, sourceSpans, targetSpans));
        sourceTextEl.addEventListener('mouseleave', clearAll);
        targetTextEl.addEventListener('mouseover', (e) => handleHover(e, null, targetSpans, sourceSpans));
        targetTextEl.addEventListener('mouseleave', clearAll);
        element.__translationHighlightDone = true;
    }
    async handleTranslation(text) {
        const entryDiv = this.appendPartialTranslation(text);
        let aborted = false;
        this.showStopButton(() => {
            aborted = true;
            if (entryDiv) entryDiv.remove();
            this.hideStopButton();
        });
        try {
            const response = await chrome.runtime.sendMessage({ action: 'translate', text: text });
            if (aborted) return;
            if (response.error) {
                this.updatePartialTranslation(entryDiv, { translation: 'Error: ' + response.error, type: 'sentence' });
            } else {
                this.updatePartialTranslation(entryDiv, response);
            }
        } catch (err) {
            if (aborted) return;
            this.updatePartialTranslation(entryDiv, { translation: 'Error: ' + err.message, type: 'sentence' });
        } finally {
            if (!aborted) this.hideStopButton();
        }
    }
    collectComments(entry) {
        if (!entry) return { instructions: '', draft: '' };

        const answerEl = entry.querySelector('.lumina-chat-answer');
        if (!answerEl) return { instructions: '', draft: '' };

        const highlights = answerEl.querySelectorAll('.lumina-comment-highlight');
        if (highlights.length === 0) return { instructions: '', draft: '' };

        let instructions = '';
        highlights.forEach((h, index) => {
            const text = h.textContent.trim();
            const comment = h.dataset.comment || '';
            if (comment) {
                instructions += `[Part ${index + 1}]: "${text}"\n[Comment]: ${comment}\n\n`;
            }
        });

        const draft = answerEl.textContent.trim();
        return { instructions, draft };
    }

    gatherMessages(untilEntryId = null, ignoreLimit = false) {
        let messages = [];
        const entries = this.historyEl.querySelectorAll('.lumina-dict-entry');
        for (const entry of entries) {
            const entryType = entry.dataset.entryType || 'qa';
            const isProofreadEntry = entryType === 'proofread';
            const isTargetEntry = untilEntryId && entry.dataset.entryId === untilEntryId;

            if (isTargetEntry) break;

            if (entryType === 'translation') {
                const sourceEl = entry.querySelector('.lumina-translation-source');
                const targetEl = entry.querySelector('.lumina-translation-target');
                if (sourceEl && targetEl) {
                    const sourceText = sourceEl.getAttribute('data-copy-text') || sourceEl.textContent.trim();
                    const targetText = targetEl.getAttribute('data-copy-text') || targetEl.textContent.trim();
                    if (sourceText) {
                        messages.push({ role: 'user', text: `Translate: ${sourceText}` });
                    }
                    if (targetText && !targetText.includes('lumina-loading')) {
                        messages.push({ role: 'model', text: targetText });
                    }
                }
                if (isTargetEntry) break;
                continue;
            }


            const questionEl = entry.querySelector('.lumina-chat-question');
            let answerEl = null;

            const versionsContainer = entry.querySelector('.lumina-answer-versions');
            if (versionsContainer) {
                const activeVersion = versionsContainer.querySelector('.lumina-answer-version.active');
                if (activeVersion) {
                    answerEl = activeVersion.querySelector('.lumina-chat-answer');
                }
            } else {
                answerEl = entry.querySelector('.lumina-chat-answer');
            }

            if (questionEl) {
                let questionText = questionEl.dataset.rawText || questionEl.textContent.trim();


                questionText = questionText.replace(/\[USER INSTRUCTION\]:\s*/g, '');


                questionText = questionText.replace(/\n\n---\n\n\[REFERENCE CONTEXT - Webpage Content.*?\]:[\s\S]*$/g, '');
                questionText = questionText.replace(/\n\n---\n\n\[Web Context Snippets\]:[\s\S]*$/g, '');
                questionText = questionText.replace(/\n\n---\n\n\[Background Context\]:[\s\S]*$/g, '');


                questionText = questionText.replace(/\[Current Webpage Context\][\s\S]*?---[\s\n]*/g, '');
                questionText = questionText.replace(/\[Context from current page\]:[\s\S]*?\[Instruction\]:[\s\n]*/g, '');
                questionText = questionText.trim();


                if (questionText.indexOf('@Comment') !== -1 || questionText.indexOf('@comment') !== -1) {
                    const result = this.collectComments(entry);
                    if (result.instructions || result.draft) {
                        const combinedFeedback = questionText.replace(/@Comment/gi, '').trim();
                        let prompt = `[Iteration Instruction]: Apply the following feedback to the draft below.\n\n[DRAFT]:\n${result.draft}\n`;
                        if (combinedFeedback) prompt += `\n[GLOBAL INSTRUCTION]:\n${combinedFeedback}\n`;
                        if (result.instructions) prompt += `\n[SPECIFIC COMMENTS]:\n${result.instructions}\n`;
                        prompt += `\nOutput only the revised text.`;
                        questionText = prompt;
                    }
                }


                if (entryType === 'proofread' && questionText === 'Proofread') {
                    const originalEl = entry.querySelector('.lumina-proofread-original');
                    if (originalEl) questionText = `Proofread: ${originalEl.textContent.trim()}`;
                }


                let images = Array.isArray(questionEl._luminaImages) ? questionEl._luminaImages :
                    (Array.isArray(entry._luminaImages) ? entry._luminaImages : []);
                if (!images.length && questionEl.dataset.images) {
                    try {
                        const parsed = JSON.parse(questionEl.dataset.images);
                        if (Array.isArray(parsed)) {
                            images = parsed;
                        } else if (parsed && Array.isArray(parsed.files)) {
                            images = parsed.files;
                        }
                    } catch (_) {
                        images = [];
                    }
                }

                if (isProofreadEntry) {
                    let proofreadAnswerText = '';
                    if (answerEl) {
                        const editableContent = answerEl.classList.contains('lumina-answer-editing')
                            ? (answerEl.querySelector('.lumina-answer-content') || answerEl)
                            : answerEl;
                        proofreadAnswerText = answerEl.getAttribute('data-raw-text') || (editableContent.innerText || editableContent.textContent || '').trim();
                    }

                    const result = this.collectComments(entry);
                    let finalUserText = `[Proofread Entry]\nOriginal:\n${questionText}\n\nRevised:\n${proofreadAnswerText}`;
                    if (result.instructions) {
                        finalUserText += `\n\n[USER FEEDBACK/COMMENTS ON REVISED VERSION]:\n${result.instructions}`;
                    }

                    messages.push({
                        role: 'user',
                        text: finalUserText,
                        files: images
                    });
                    if (isTargetEntry) break;
                    continue;
                }

                messages.push({
                    role: 'user',
                    text: questionText,
                    files: images
                });
            }
            if (answerEl && !isProofreadEntry) {
                const answerText = answerEl.classList.contains('lumina-answer-editing')
                    ? ((answerEl.querySelector('.lumina-answer-content') || answerEl).innerText || (answerEl.querySelector('.lumina-answer-content') || answerEl).textContent || '').trim()
                    : (answerEl.getAttribute('data-raw-text') || answerEl.textContent.trim());
                if (answerText) {
                    messages.push({
                        role: 'model',
                        text: answerText
                    });
                }
            }
            if (isTargetEntry) break;
        }
        if (!ignoreLimit && this.tokenLimit && this.tokenLimit > 0) {
            const inputEl = this.container ? this.container.querySelector('.lumina-chat-input') : null;
            const inputText = inputEl ? inputEl.value : '';
            const inputTokens = (typeof LuminaToken !== 'undefined') ? LuminaToken.count(inputText) : Math.ceil(inputText.length / 2);

            let attachmentTokens = 0;
            if (this.attachedFiles && this.attachedFiles.length > 0) {
                this.attachedFiles.forEach(file => {
                    if (file.dataUrl && (file.mimeType?.startsWith('text/') || file.dataUrl.startsWith('data:text/'))) {
                        const matches = file.dataUrl.match(/^data:([^;]+);base64,(.+)$/i);
                        if (matches) {
                            try {
                                const decoded = this._decodeBase64Utf8(matches[2]);
                                attachmentTokens += (typeof LuminaToken !== 'undefined') ? LuminaToken.count(decoded) : Math.ceil(decoded.length / 2);
                            } catch (e) { }
                        }
                    } else if (file.isImage || file.mimeType?.startsWith('image/')) {
                        attachmentTokens += 765;
                    }
                });
            }

            let contextTokens = 0;
            const webChipsGroup = this.container ? this.container.querySelector('#web-chips-group') : null;
            if (webChipsGroup) {
                const activeChips = webChipsGroup.querySelectorAll('.lumina-web-chip.is-active');
                activeChips.forEach(chip => {
                    const tokens = parseInt(chip.dataset.tokens || '0');
                    if (tokens > 0) contextTokens += tokens;
                    else if (chip.classList.contains('is-active')) contextTokens += 4000;
                });
            }

            const systemTokens = this.systemTokens || 150;
            const budget = this.tokenLimit - inputTokens - attachmentTokens - contextTokens - systemTokens;

            if (budget > 0) {
                let currentHistoryTokens = 0;
                let messagesKept = 0;
                const slicedMessages = [];

                for (let i = messages.length - 1; i >= 0; i--) {
                    const m = messages[i];
                    const mTokens = (typeof LuminaToken !== 'undefined') ? LuminaToken.count(m.text || '') : Math.ceil((m.text || '').length / 2);
                    if (currentHistoryTokens + mTokens <= budget) {
                        slicedMessages.unshift(m);
                        currentHistoryTokens += mTokens;
                        messagesKept++;
                    } else {

                        break;
                    }
                }
                messages = slicedMessages;
            } else {

                messages = [];
            }
        }

        return messages;
    }

    _throttledUpdateTokenCount() {
        if (this._tokenUpdateTimer) return;
        this._tokenUpdateTimer = setTimeout(() => {
            this._updateTokenCount();
            this._tokenUpdateTimer = null;
        }, 400);
    }

    _updateTokenCount() {
        if (!this.container) return;
        const counter = this.container.querySelector('#token-counter');
        if (!counter) return;

        const inputEl = this.container.querySelector('.lumina-chat-input');
        const inputText = inputEl ? inputEl.value : '';
        const inputTokens = (typeof LuminaToken !== 'undefined') ? LuminaToken.count(inputText) : Math.ceil(inputText.length / 2.5);


        let historyTokens = 0;
        let fullHistoryTokens = 0;
        if (this.historyEl) {
            const msgs = this.gatherMessages();
            msgs.forEach(m => {
                historyTokens += (typeof LuminaToken !== 'undefined') ? LuminaToken.count(m.text || '') : Math.ceil((m.text || '').length / 2.5);
            });

            if (this.tokenLimit) {
                const fullMsgs = this.gatherMessages(null, true);
                fullMsgs.forEach(m => {
                    fullHistoryTokens += (typeof LuminaToken !== 'undefined') ? LuminaToken.count(m.text || '') : Math.ceil((m.text || '').length / 2.5);
                });
            } else {
                fullHistoryTokens = historyTokens;
            }
        }


        let attachmentTokens = 0;
        if (this.attachedFiles && this.attachedFiles.length > 0) {
            this.attachedFiles.forEach(file => {
                if (file.dataUrl && (file.mimeType?.startsWith('text/') || file.dataUrl.startsWith('data:text/'))) {
                    const matches = file.dataUrl.match(/^data:([^;]+);base64,(.+)$/i);
                    if (matches) {
                        try {
                            const decoded = this._decodeBase64Utf8(matches[2]);
                            attachmentTokens += (typeof LuminaToken !== 'undefined') ? LuminaToken.count(decoded) : Math.ceil(decoded.length / 2.5);
                        } catch (e) { }
                    }
                } else if (file.isImage || file.mimeType?.startsWith('image/')) {

                    attachmentTokens += 765;
                }
            });
        }



        let contextTokens = 0;
        const webChipsGroup = this.container.querySelector('#web-chips-group');
        if (webChipsGroup) {
            const activeChips = webChipsGroup.querySelectorAll('.lumina-web-chip.is-active');
            activeChips.forEach(chip => {
                const tokens = parseInt(chip.dataset.tokens || '0');
                if (tokens > 0) {
                    contextTokens += tokens;
                }
            });
        }

        const systemTokens = this.systemTokens || 150;
        const total = inputTokens + historyTokens + attachmentTokens + contextTokens + systemTokens;

        const totalEl = counter.querySelector('.lumina-token-total');
        const inputTokensEl = counter.querySelector('.lumina-token-input');
        const historyTokensEl = counter.querySelector('.lumina-token-history');
        const contextTokensEl = counter.querySelector('.lumina-token-context');
        const systemTokensEl = counter.querySelector('.lumina-token-system');
        const totalFullEl = counter.querySelector('.lumina-token-total-full');

        if (totalEl) totalEl.textContent = this._formatTokenCount(total);
        if (inputTokensEl) inputTokensEl.textContent = (inputTokens + attachmentTokens).toLocaleString();

        if (historyTokensEl) {
            historyTokensEl.textContent = historyTokens.toLocaleString();
            if (fullHistoryTokens > historyTokens) {
                historyTokensEl.classList.add('is-truncated');
                historyTokensEl.title = `History truncated from ${fullHistoryTokens.toLocaleString()} tokens to fit limit`;
                historyTokensEl.style.color = '#ff9500';
                historyTokensEl.style.textDecoration = 'underline dotted';
                historyTokensEl.style.cursor = 'help';
            } else {
                historyTokensEl.classList.remove('is-truncated');
                historyTokensEl.title = '';
                historyTokensEl.style.removeProperty('color');
                historyTokensEl.style.removeProperty('text-decoration');
                historyTokensEl.style.removeProperty('cursor');
            }
        }

        if (contextTokensEl) contextTokensEl.textContent = contextTokens > 0 ? `~${contextTokens.toLocaleString()}` : '0';
        if (systemTokensEl) systemTokensEl.textContent = `~${systemTokens}`;
        if (totalFullEl) totalFullEl.textContent = total.toLocaleString();

        counter.classList.toggle('is-active', total > 0);
    }

    _updateTokenLimitFromModel() {
        if (!this.modelTokenLimits) return;
        const currentModel = this.activeTabModel?.model;
        if (currentModel) {
            const limit = this.modelTokenLimits[currentModel];
            this.tokenLimit = limit || null;

            const queryInPopup = (selector) => this.container.querySelector(selector) || document.querySelector(selector);
            const input = queryInPopup('.lumina-token-limit-input');
            if (input) {
                input.value = limit || '';
            }
            this._throttledUpdateTokenCount();
        }
    }

    async refreshSystemTokens() {
        try {
            const settings = await chrome.storage.local.get(['reasoningMode', 'responseLanguage']);
            const response = await chrome.runtime.sendMessage({
                action: 'get_system_tokens',
                reasoningMode: settings.reasoningMode || false,
                isProofread: this.isProofreadMode || false,
                language: settings.responseLanguage || 'auto'
            });
            if (response && response.tokens) {
                this.systemTokens = response.tokens;
                this._throttledUpdateTokenCount();
            }
        } catch (e) {
            console.warn('[Lumina UI] Failed to refresh system tokens:', e);
        }
    }

    _formatTokenCount(count) {
        if (count >= 1000000) return (count / 1000000).toFixed(1) + 'M';
        if (count >= 1000) return (count / 1000).toFixed(1) + 'K';
        return count.toString();
    }

    _decodeBase64Utf8(base64) {
        if (!base64) return '';
        try {
            const binary = atob(base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            return new TextDecoder('utf-8').decode(bytes);
        } catch (_) { return ''; }
    }

    static getChatInputHTML(autofocus = false) {
        return `
          <div class="lumina-chat-input-wrapper">
            <div class="lumina-input-meta-container" id="input-meta-container">
                <div class="lumina-web-chips-group" id="web-chips-group"></div>
                <div class="lumina-redirect-group" id="redirect-chips-group"></div>
            </div>
            <div class="lumina-input-container">
                <div class="lumina-file-preview-container lumina-image-preview-container"></div>
                <div class="lumina-input-bar" id="input-bar">
                    <div class="lumina-left-actions">
                         <button class="lumina-upload-btn" id="upload-btn" title="Upload File">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                         </button>
                         <div class="lumina-token-counter" id="token-counter">
                            <span class="lumina-token-total">0</span>
                            <div class="lumina-token-details" id="token-details">
                                <div class="lumina-token-detail-item">
                                    <span class="detail-label">Context</span>
                                    <span class="detail-value lumina-token-context">0</span>
                                </div>
                                <div class="lumina-token-detail-item">
                                    <span class="detail-label">History</span>
                                    <span class="detail-value lumina-token-history">0</span>
                                </div>
                                <div class="lumina-token-divider"></div>
                                <div class="lumina-token-detail-item">
                                    <span class="detail-label">Limit</span>
                                    <input type="number" class="lumina-token-limit-input" placeholder="" min="0">
                                </div>
                            </div>
                         </div>
                    </div>
                    <textarea id="${autofocus ? 'chat-input' : 'chat-input-secondary'}" class="lumina-chat-input" placeholder="Ask anything..." rows="1"></textarea>
 
                    <div class="lumina-trailing-group">
                        <div class="lumina-model-selector" id="model-selector">
                            <button class="lumina-model-btn" id="model-btn">
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" style="opacity: 0.6;"><path d="M18 9l-6 6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" transform="rotate(180 12 12)"/></svg>
                                <span class="lumina-current-model" id="model-label">Loading...</span>
                            </button>
                            <div class="lumina-model-dropdown" id="model-dropdown"></div>
                        </div>
                        <div class="lumina-reasoning-selector" id="reasoning-selector">
                            <button class="lumina-reasoning-btn" id="reasoning-btn">
                                <span class="lumina-current-reasoning" id="reasoning-label">None</span>
                            </button>
                            <div class="lumina-reasoning-dropdown" id="reasoning-dropdown"></div>
                        </div>
                        <button class="lumina-mic-btn" id="mic-btn">
                        </button>
                    </div>
                </div>
            </div>
            <div class="lumina-hover-trigger"></div>
          </div>`;
    }
    setupInputBar() {
        if (!this.inputEl) return;
        const popup = this.container;
        const input = this.inputEl;
        const queryInPopup = (selector) => popup.querySelector(selector) || document.querySelector(selector);
        const inputBar = queryInPopup('.lumina-input-bar') || queryInPopup('#input-bar');
        this.isProofreadMode = this.isProofreadMode || false;
        this.isTranslateMode = this.isTranslateMode || false;
        const getModes = () => ({ pr: this.isProofreadMode, tr: this.isTranslateMode });
        const setProofread = (v) => { this.isProofreadMode = v; };
        const setTranslate = (v) => { this.isTranslateMode = v; };
        const history = queryInPopup('.lumina-chat-history') || queryInPopup('.lumina-chat-scroll-content');


        this.refreshSystemTokens();


        chrome.storage.onChanged.addListener((changes) => {
            if (changes.reasoningMode || changes.responseLanguage) {
                this.refreshSystemTokens();
            }
        });
        if (history) {
            const historyObserver = new MutationObserver(() => this._throttledUpdateTokenCount());
            historyObserver.observe(history, { childList: true, subtree: true });
        }
        const webChips = queryInPopup('#web-chips-group');
        if (webChips) {
            const chipsObserver = new MutationObserver(() => this._throttledUpdateTokenCount());
            chipsObserver.observe(webChips, { childList: true });
        }
        const inputWrapper = queryInPopup('.lumina-chat-input-wrapper');

        if (inputWrapper) {
            inputWrapper.addEventListener('mousedown', (e) => {

                const interactiveSelector = 'button, textarea, input, a, .lumina-model-dropdown, .lumina-tools-dropdown, .lumina-mention-popup';
                const isInteractive = e.target.closest(interactiveSelector);

                if (!isInteractive) {
                    e.preventDefault();
                    input.focus();


                    const len = input.value.length;
                    input.setSelectionRange(len, len);


                    if (typeof this._checkExpand === 'function') this._checkExpand();
                }
            });
        }


        this.readWebpageEnabled = false;
        this.currentPageTitle = "Current Page";


        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.get(['readWebpage', 'advancedParamsByModel', 'modelTokenLimits'], (data) => {
                if (data.readWebpage !== undefined) {
                    this.readWebpageEnabled = !!data.readWebpage;
                }
                if (data.advancedParamsByModel) {
                    this.advancedParamsByModel = data.advancedParamsByModel;
                }
                this.modelTokenLimits = data.modelTokenLimits || {};
                this._updateTokenLimitFromModel();
            });

            chrome.storage.onChanged.addListener((changes, area) => {
                if (area === 'local') {
                    if (changes.readWebpage) {
                        this.readWebpageEnabled = !!changes.readWebpage.newValue;
                    }
                    if (changes.advancedParamsByModel) {
                        this.advancedParamsByModel = changes.advancedParamsByModel.newValue;
                    }
                    if (changes.modelTokenLimits) {
                        this.modelTokenLimits = changes.modelTokenLimits.newValue || {};
                        this._updateTokenLimitFromModel();
                    }
                }
            });
        }

        const tokenCounter = queryInPopup('#token-counter');
        if (tokenCounter) {
            tokenCounter.addEventListener('click', (e) => {
                e.stopPropagation();
                const isNowExpanding = !tokenCounter.classList.contains('is-expanded');
                if (isNowExpanding) {
                    const toolsDropdown = queryInPopup('.lumina-tools-dropdown');
                    if (toolsDropdown) toolsDropdown.classList.remove('active');
                    const toolsWrapper = queryInPopup('#tools-wrapper') || queryInPopup('.lumina-actions-dropdown-wrapper');
                    if (toolsWrapper) toolsWrapper.classList.remove('active');
                    const modelDropdown = queryInPopup('.lumina-model-dropdown');
                    if (modelDropdown) modelDropdown.classList.remove('active');
                    const reasoningDropdown = queryInPopup('.lumina-reasoning-dropdown');
                    if (reasoningDropdown) reasoningDropdown.classList.remove('active');
                }
                tokenCounter.classList.toggle('is-expanded');
            });

            document.addEventListener('click', () => {
                tokenCounter.classList.remove('is-expanded');
            });


            const tokenDetails = queryInPopup('.lumina-token-details');
            if (tokenDetails) {
                tokenDetails.addEventListener('click', (e) => e.stopPropagation());
            }
        }

        const tokenLimitInput = queryInPopup('.lumina-token-limit-input');
        if (tokenLimitInput) {
            tokenLimitInput.addEventListener('input', () => {
                const val = parseInt(tokenLimitInput.value);
                const limit = isNaN(val) || val <= 0 ? null : val;
                this.tokenLimit = limit;

                const currentModel = this.activeTabModel?.model;
                if (currentModel) {
                    this.modelTokenLimits = this.modelTokenLimits || {};
                    if (limit === null) delete this.modelTokenLimits[currentModel];
                    else this.modelTokenLimits[currentModel] = limit;

                    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                        chrome.storage.local.set({ modelTokenLimits: this.modelTokenLimits });
                    }
                }
                this._throttledUpdateTokenCount();
            });
        }

        this.refreshReadPageTitle = () => {
            if (typeof chrome !== 'undefined' && chrome.tabs) {
                chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
                    if (tabs && tabs[0]) {
                        this.currentPageTitle = tabs[0].title || "Current Page";
                    }
                });
            } else if (typeof document !== 'undefined' && document.title && document.title !== 'Lumina') {
                this.currentPageTitle = document.title;
            }
        };

        this.refreshReadPageTitle();
        setInterval(() => this.refreshReadPageTitle(), 5000);
        const checkExpand = () => {

            input.style.removeProperty('height');
        };
        const debouncedCheckExpand = (immediate = false) => {
            checkExpand();
        };
        this._checkExpand = checkExpand;
        if (typeof ResizeObserver !== 'undefined') {
            const resizeTarget = queryInPopup('.lumina-input-container') || inputBar;
            if (resizeTarget) {
                const ro = new ResizeObserver(() => {
                    requestAnimationFrame(() => debouncedCheckExpand());
                });
                ro.observe(resizeTarget);
                this._inputResizeObserver = ro;
            }
        }
        input.addEventListener('focus', () => { this._updateContainerState(); debouncedCheckExpand(true); });
        input.addEventListener('blur', () => { setTimeout(() => { this._updateContainerState(); }, 100); setTimeout(() => debouncedCheckExpand(true), 100); });
        input.addEventListener('input', () => {
            const val = input.value;
            const translateKw = val.match(/^translate:?\s+/i);
            const proofreadKw = !translateKw && val.match(/^proofread:?\s+/i);

            if (translateKw) {
                if (getModes().tr) {
                    removeActiveModes();
                    input.placeholder = 'Ask anything...';
                    input.value = val.slice(translateKw[0].length);
                } else {
                    removeActiveModes();
                    setTranslate(true);
                    const toolItem = queryInPopup('[data-action="translate"]');
                    if (toolItem) toolItem.classList.add('active');

                    if (toolsToggle) {
                        const label = toolsToggle.querySelector('.tool-label');
                        if (label) label.textContent = 'Translate';
                        toolsToggle.classList.add('active');
                        toolsToggle.classList.add('active-translate');
                    }

                    const toggle = queryInPopup('#translate-toggle') || queryInPopup('.lumina-translate-toggle');
                    if (toggle) { toggle.style.display = 'flex'; toggle.classList.add('active'); }
                    input.placeholder = 'Enter text to translate...';
                    input.value = val.slice(translateKw[0].length);
                    if (toolsWrapper) toolsWrapper.classList.remove('active');
                    if (toolsDropdown) toolsDropdown.classList.remove('active');
                }
            } else if (proofreadKw) {
                if (getModes().pr) {
                    removeActiveModes();
                    input.placeholder = 'Ask anything...';
                    input.value = val.slice(proofreadKw[0].length);
                } else {
                    removeActiveModes();
                    setProofread(true);
                    const toolItem = queryInPopup('[data-action="proofread"]');
                    if (toolItem) toolItem.classList.add('active');

                    if (toolsToggle) {
                        const label = toolsToggle.querySelector('.tool-label');
                        if (label) label.textContent = 'Proofread';
                        toolsToggle.classList.add('active');
                        toolsToggle.classList.add('active-proofread');
                    }

                    const toggle = queryInPopup('#proofread-toggle') || queryInPopup('.lumina-proofread-toggle');
                    if (toggle) { toggle.style.display = 'flex'; toggle.classList.add('active'); }
                    input.placeholder = 'Enter text to proofread...';
                    input.value = val.slice(proofreadKw[0].length);
                    if (toolsWrapper) toolsWrapper.classList.remove('active');
                    if (toolsDropdown) toolsDropdown.classList.remove('active');
                }
            } else if (!this._pendingWebSource && this._cachedSources && this._cachedSources.length) {
                for (const source of this._cachedSources) {
                    const escaped = source.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const sourceKw = val.match(new RegExp(`^${escaped}:?\\s+`, 'i'));
                    if (sourceKw) {
                        removeActiveModes();
                        this._pendingWebSource = source;
                        const websourceToggle = queryInPopup('#websource-toggle') || queryInPopup('.lumina-websource-toggle');
                        if (websourceToggle) {
                            const label = websourceToggle.querySelector('.tool-label');
                            if (label) label.textContent = source.name;
                            websourceToggle.style.display = 'flex';
                            websourceToggle.classList.add('active');
                        }
                        if (toolsWrapper) toolsWrapper.classList.remove('active');
                        if (toolsDropdown) toolsDropdown.classList.remove('active');
                        input.placeholder = `Type text to search in ${source.name}...`;
                        input.value = val.slice(sourceKw[0].length);
                        break;
                    }
                }
            }
            debouncedCheckExpand();
            this._updateContainerState();
            this._updateActionBtnState();
            this._throttledUpdateTokenCount();
        });
        input.addEventListener('keydown', async (e) => {
            const isMentionActive = this.container.querySelector('.lumina-mention-popup.active');
            if (e.key === 'Enter' && !e.shiftKey && !e.defaultPrevented && !isMentionActive) {
                e.preventDefault();
                const text = input.value.trim();
                if (!text && this.selectedImages.length === 0) return;

                const inputContainer = queryInPopup('.lumina-input-container');
                if (inputContainer) {
                    inputContainer.classList.remove('lumina-sending');
                    void inputContainer.offsetWidth;
                    inputContainer.classList.add('lumina-sending');
                    setTimeout(() => inputContainer.classList.remove('lumina-sending'), 900);
                }


                if (this.historyEl && !this.historyEl._luminaListenersAttached) {
                    this.initListeners(this.historyEl);
                }

                const { pr, tr } = getModes();
                if (pr) {
                    if (this.options.onSubmit) this.options.onSubmit(text, [], { mode: 'proofread' });
                    else this.handleProofreadSubmit(text);
                } else if (tr) {
                    if (this.options.onSubmit) this.options.onSubmit(text, [], { mode: 'translate' });
                    else this.handleTranslation(text);
                } else if (this._pendingWebSource) {
                    if (this.options.onSubmit && this.options.isSpotlight) {
                        this.options.onSubmit(text, [], { mode: 'websource', source: this._pendingWebSource });
                    } else {
                        this.openWebSource(this._pendingWebSource, text);
                    }
                    removeActiveModes();
                } else {
                    this._handleSubmit();
                }
                input.value = '';
                input.style.height = 'auto';
                checkExpand();
            }
        });
        input.addEventListener('paste', async (e) => {
            const items = e.clipboardData.items;
            for (const item of items) {
                if (item.type.startsWith('image/')) {
                    e.preventDefault();
                    const dataUrl = await this._fileToDataURL(item.getAsFile());
                    this.addImage(dataUrl);
                }
            }
            this._updateContainerState();
        });
        const toolsWrapper = queryInPopup('#tools-wrapper') || queryInPopup('.lumina-actions-dropdown-wrapper');
        const toolsToggle = queryInPopup('#tools-toggle') || queryInPopup('.lumina-plus-toggle');
        const toolsDropdown = queryInPopup('#tools-dropdown') || queryInPopup('.lumina-tools-dropdown');
        if (toolsWrapper && toolsToggle && !toolsToggle.dataset.setupDone) {
            toolsToggle.dataset.setupDone = 'true';
            const toggleTools = (show) => {
                const modelDropdown = queryInPopup('.lumina-model-dropdown');
                const modelWasActive = modelDropdown && modelDropdown.classList.contains('active');
                if (modelDropdown) modelDropdown.classList.remove('active');
                const tokenCounter = queryInPopup('#token-counter');
                if (tokenCounter) tokenCounter.classList.remove('is-expanded');
                const isActive = toolsWrapper.classList.contains('active') || (toolsDropdown && toolsDropdown.classList.contains('active'));
                if (show === undefined) {
                    if (modelWasActive) {
                        show = true;
                    } else {
                        show = !isActive;
                    }
                }
                if (show) {
                    toolsWrapper.classList.add('active');
                    if (toolsDropdown) toolsDropdown.classList.add('active');
                } else {
                    toolsWrapper.classList.remove('active');
                    if (toolsDropdown) toolsDropdown.classList.remove('active');
                }
            };
            toolsToggle.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (toolsToggle.classList.contains('active')) {
                    removeActiveModes();
                    toggleTools(false);
                } else {
                    toggleTools();
                }
            });
            window.addEventListener('click', (e) => {
                if ((toolsWrapper.classList.contains('active') || (toolsDropdown && toolsDropdown.classList.contains('active'))) && !toolsWrapper.contains(e.target)) {
                    toggleTools(false);
                }
            });
        }
        const removeActiveModes = () => {
            setProofread(false); setTranslate(false);
            this._pendingWebSource = null;
            if (toolsToggle) {
                const label = toolsToggle.querySelector('.tool-label');
                if (label) label.textContent = 'Tools';
                toolsToggle.classList.remove('active');
                toolsToggle.classList.remove('active-proofread');
                toolsToggle.classList.remove('active-translate');
            }
            ['#proofread-toggle', '#translate-toggle', '.lumina-proofread-toggle', '.lumina-translate-toggle'].forEach(sel => {
                const el = queryInPopup(sel); if (el) { el.style.display = 'none'; el.classList.remove('active'); }
            });
            popup.querySelectorAll('.lumina-tool-item').forEach(el => el.classList.remove('active'));
            checkExpand();
        };
        this._removeActiveModes = removeActiveModes;
        const setupTool = (sel, toggleSel, modename, modeSetter, placeholder) => {
            const item = queryInPopup(sel);
            if (item) item.addEventListener('click', (e) => {
                e.stopPropagation(); removeActiveModes(); modeSetter();
                item.classList.add('active');


                const activeToolsToggle = queryInPopup('#tools-toggle') || queryInPopup('.lumina-plus-toggle');
                if (activeToolsToggle) {
                    const label = activeToolsToggle.querySelector('.tool-label');
                    if (label) label.textContent = modename;
                    activeToolsToggle.classList.add('active');

                    const lowerMode = modename.toLowerCase();
                    if (lowerMode.includes('proofread')) {
                        activeToolsToggle.classList.add('active-proofread');
                    } else if (lowerMode.includes('translate')) {
                        activeToolsToggle.classList.add('active-translate');
                    }
                }
                input.placeholder = placeholder; input.focus();
                if (toolsWrapper) toolsWrapper.classList.remove('active');
                if (toolsDropdown) toolsDropdown.classList.remove('active');
                checkExpand();
            });
        };
        setupTool('[data-action="proofread"]', '#proofread-toggle', 'Proofread', () => { setProofread(true); }, 'Enter text to proofread...');
        setupTool('[data-action="translate"]', '#translate-toggle', 'Translate', () => { setTranslate(true); }, 'Enter text to translate...');
        ['#proofread-toggle', '#translate-toggle', '.lumina-proofread-toggle', '.lumina-translate-toggle'].forEach(sel => {
            const toggle = queryInPopup(sel);
            if (toggle) toggle.addEventListener('click', (e) => {
                e.preventDefault(); e.stopPropagation(); removeActiveModes();
                input.placeholder = 'Ask anything...'; input.focus(); checkExpand();
            });
        });
        this._setupModelSelector(popup);
        const uploadBtn = queryInPopup('#upload-btn');
        if (uploadBtn && this.fileInputEl) {
            uploadBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.fileInputEl.click();
            });
        }
        if (this.fileInputEl && !this.fileInputEl._luminaSetup) {
            this.fileInputEl._luminaSetup = true;
            this.fileInputEl.addEventListener('change', async (e) => {
                for (const file of e.target.files) this.addFile(file);
                this.fileInputEl.value = '';
            });
        }


        const dropTarget = this.options.isSpotlight ? document.body : popup;
        this._setupFileDragDrop(dropTarget, input);
        const micBtn = queryInPopup('#mic-btn') || queryInPopup('.lumina-mic-btn');
        if (micBtn) this._setupMicButton(micBtn, input);
        const reasoningSelector = queryInPopup('.lumina-reasoning-selector');
        if (reasoningSelector) this._setupReasoningSelector(popup);
    }

    _setupFileDragDrop(dropZone, input) {
        if (!dropZone || dropZone.dataset.luminaDropSetup === 'true') return;
        dropZone.dataset.luminaDropSetup = 'true';

        let dragDepth = 0;
        const hasFiles = (dt) => !!dt && Array.from(dt.types || []).includes('Files');
        const inputContainer = this.container ? this.container.querySelector('.lumina-input-container') : null;
        const setDragState = (active) => {
            dropZone.classList.toggle('lumina-drag-over', active);
            if (inputContainer) {
                inputContainer.classList.toggle('lumina-drag-over', active);
                if (!active) inputContainer.classList.remove('lumina-drag-hover-direct');
            }
        };

        dropZone.addEventListener('dragenter', (e) => {
            if (!hasFiles(e.dataTransfer)) return;
            e.preventDefault();
            e.stopPropagation();
            dragDepth += 1;
            setDragState(true);
        });

        dropZone.addEventListener('dragover', (e) => {
            if (!hasFiles(e.dataTransfer)) return;
            e.preventDefault();
            e.stopPropagation();
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
            setDragState(true);
        });

        dropZone.addEventListener('dragleave', (e) => {
            if (!hasFiles(e.dataTransfer)) return;
            e.preventDefault();
            e.stopPropagation();
            dragDepth = Math.max(0, dragDepth - 1);
            if (dragDepth === 0) setDragState(false);
        });

        dropZone.addEventListener('drop', async (e) => {
            if (!hasFiles(e.dataTransfer)) return;
            e.preventDefault();
            e.stopPropagation();
            dragDepth = 0;
            setDragState(false);
            if (inputContainer) inputContainer.classList.remove('lumina-drag-hover-direct');

            const files = Array.from(e.dataTransfer.files || []);
            if (!files.length) return;

            await this._handleDroppedFiles(files, input);
        });

        if (inputContainer) {
            let containerDragDepth = 0;
            inputContainer.addEventListener('dragenter', (e) => {
                if (!hasFiles(e.dataTransfer)) return;
                containerDragDepth += 1;
                inputContainer.classList.add('lumina-drag-hover-direct');
            });
            inputContainer.addEventListener('dragover', (e) => {
                if (!hasFiles(e.dataTransfer)) return;
                inputContainer.classList.add('lumina-drag-hover-direct');
            });
            inputContainer.addEventListener('dragleave', (e) => {
                if (!hasFiles(e.dataTransfer)) return;
                containerDragDepth = Math.max(0, containerDragDepth - 1);
                if (containerDragDepth === 0) {
                    inputContainer.classList.remove('lumina-drag-hover-direct');
                }
            });
        }


        if (this.options.isSpotlight && !window.__luminaSpotlightDropGuardInstalled) {
            const globalDropGuard = (e) => {
                if (!hasFiles(e.dataTransfer)) return;
                e.preventDefault();
            };
            window.addEventListener('dragover', globalDropGuard);
            window.addEventListener('drop', globalDropGuard);
            window.__luminaSpotlightDropGuardInstalled = true;
        }
    }

    async _handleDroppedFiles(files, input) {
        if (!Array.isArray(files) || files.length === 0) return;
        for (let i = 0; i < files.length; i++) {
            await this.addFile(files[i]);
            if ((i + 1) % 2 === 0) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }
        this._updateContainerState();
        if (input && typeof input.focus === 'function') input.focus();
    }
    getInputState() {
        return {
            text: this.inputEl ? this.inputEl.value : '',
            isProofreadMode: this.isProofreadMode || false,
            isTranslateMode: this.isTranslateMode || false,
            placeholder: this.inputEl ? this.inputEl.placeholder : 'Ask anything...'
        };
    }
    restoreInputState(state) {
        if (!this.inputEl) return;
        const queryInPopup = (selector) => this.container.querySelector(selector) || document.querySelector(selector);
        if (this._removeActiveModes) this._removeActiveModes();
        if (!state) {
            this.inputEl.value = '';
            this.inputEl.style.height = 'auto';
            this.inputEl.placeholder = 'Ask anything...';
            if (this._checkExpand) this._checkExpand();
            this._updateContainerState();
            this._updateActionBtnState();
            return;
        }
        if (state.text !== undefined) {
            this.inputEl.value = state.text;
            this.inputEl.style.height = 'auto';
            this.inputEl.style.height = this.inputEl.scrollHeight + 'px';
        }
        this.inputEl.placeholder = state.placeholder || 'Ask anything...';
        if (state.isProofreadMode) {
            this.isProofreadMode = true;
            const toggle = queryInPopup('#proofread-toggle') || queryInPopup('.lumina-proofread-toggle');
            if (toggle) { toggle.style.display = 'flex'; toggle.classList.add('active'); }
            const toolItem = queryInPopup('[data-action="proofread"]');
            if (toolItem) toolItem.classList.add('active');
        } else if (state.isTranslateMode) {
            this.isTranslateMode = true;
            const toggle = queryInPopup('#translate-toggle') || queryInPopup('.lumina-translate-toggle');
            if (toggle) { toggle.style.display = 'flex'; toggle.classList.add('active'); }
            const toolItem = queryInPopup('[data-action="translate"]');
            if (toolItem) toolItem.classList.add('active');
        }
        if (this._checkExpand) this._checkExpand();
        this._updateContainerState();
        this._updateActionBtnState();
    }
    _setupMentions() {
        if (!document.getElementById('lumina-mention-styles')) {
            const style = document.createElement('style');
            style.id = 'lumina-mention-styles';
            style.textContent = `
                .lumina-mention-popup {
                    position: absolute;
                    bottom: 100%;
                    left: 0;
                    width: 160px;
                    background-color: var(--lumina-bg-primary);
                    border: 1px solid var(--lumina-border);
                    border-radius: 12px;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
                    z-index: 10000;
                    display: none;
                    flex-direction: column;
                    padding: 4px;
                    margin-bottom: 8px;
                }
                .lumina-mention-popup.active {
                    display: flex;
                }
                .lumina-mention-item {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 0 12px;
                    cursor: pointer;
                    border-radius: 8px;
                    font-size: 13px;
                    font-weight: 500;
                    color: var(--lumina-text-primary);
                    transition: all 0.1s ease;
                    border: none;
                    background: transparent;
                    width: calc(100% - 8px);
                    margin: 0 4px;
                    text-align: left;
                }
                .lumina-mention-item.selected, .lumina-mention-item:hover {
                    background: var(--lumina-primary-bg-light, rgba(0, 122, 255, 0.1)) !important;
                    color: var(--lumina-primary, #007aff) !important;
                    outline: 2px solid var(--lumina-primary);
                    outline-offset: -2px;
                }
                .lumina-mention-item span:first-child {
                    font-size: 14px;
                    display: flex;
                    align-items: center;
                }
            `;
            document.head.appendChild(style);
        }
        const wrapper = this.inputEl.parentElement;
        if (!wrapper) return;
        const computed = window.getComputedStyle(wrapper);
        if (computed.position === 'static') wrapper.style.position = 'relative';

        let popup = wrapper.querySelector('.lumina-mention-popup');
        if (!popup) {
            popup = document.createElement('div');
            popup.className = 'lumina-mention-popup';
            wrapper.appendChild(popup);
        }

        let selectedIndex = 0;
        const hidePopup = () => {
            popup.classList.remove('active');
            selectedIndex = 0;
        };

        const renderPopup = (list, type = 'variable') => {
            popup.innerHTML = '';
            list.forEach((p, idx) => {
                const el = document.createElement('div');
                el.className = `lumina-mention-item ${idx === selectedIndex ? 'selected' : ''}`;
                const icon = p.icon;
                const name = p.name;
                el.innerHTML = `<span>${icon}</span> <span>${this.escapeHTMLAttr(name)}</span>`;
                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    selectItem(p);
                });
                popup.appendChild(el);
            });
            popup.classList.add('active');
        };

        const selectItem = (v) => {
            const val = this.inputEl.value;
            const trigger = popup.dataset.trigger || '$';
            const lastTrigger = val.lastIndexOf(trigger);
            if (lastTrigger !== -1) {
                const before = val.substring(0, lastTrigger);
                const after = val.substring(this.inputEl.selectionEnd);
                this.inputEl.value = before + trigger + v.name + ' ' + after;


                const newPos = before.length + trigger.length + v.name.length + 1;
                this.inputEl.setSelectionRange(newPos, newPos);
            }
            hidePopup();
            this.inputEl.focus();


            this.inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        };

        this.inputEl.addEventListener('input', (e) => {
            const val = this.inputEl.value;
            const cursorPos = this.inputEl.selectionStart;
            const textBeforeCursor = val.slice(0, cursorPos);


            const dollarIndex = textBeforeCursor.lastIndexOf('$');
            const atIndex = textBeforeCursor.lastIndexOf('@');


            const lastTriggerIndex = Math.max(dollarIndex, atIndex);
            if (lastTriggerIndex !== -1) {
                const trigger = val[lastTriggerIndex];
                const charBefore = lastTriggerIndex > 0 ? val[lastTriggerIndex - 1] : ' ';

                if (charBefore === ' ' || charBefore === '\n' || charBefore === '>') {
                    const query = textBeforeCursor.substring(lastTriggerIndex + 1).toLowerCase();
                    if (!query.includes(' ')) {
                        let options = [];
                        if (trigger === '$') {
                            options = [
                                { name: 'SelectedText', icon: '📝' },
                                { name: 'Sentence', icon: '📝' },
                                { name: 'Paragraph', icon: '📝' },
                                { name: 'Container', icon: '📦' }
                            ];
                        } else if (trigger === '@') {
                            options = [
                                { name: 'Comment', icon: '💬' }
                            ];
                        }

                        const matches = options.filter(v => v.name.toLowerCase().includes(query));
                        if (matches.length > 0) {
                            selectedIndex = 0;
                            popup.dataset.trigger = trigger;
                            popup.dataset.type = trigger === '$' ? 'variable' : 'command';
                            popup.dataset.matches = JSON.stringify(matches);
                            renderPopup(matches);
                            return;
                        }
                    }
                }
            }
            hidePopup();
        });

        this.inputEl.addEventListener('keydown', (e) => {
            if (!popup.classList.contains('active')) return;
            const matches = JSON.parse(popup.dataset.matches || '[]');
            if (matches.length === 0) return;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                e.stopPropagation();
                selectedIndex = (selectedIndex + 1) % matches.length;
                renderPopup(matches);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                e.stopPropagation();
                selectedIndex = (selectedIndex - 1 + matches.length) % matches.length;
                renderPopup(matches);
            } else if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                e.stopPropagation();
                selectItem(matches[selectedIndex]);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                hidePopup();
            }
        }, { capture: true });

        document.addEventListener('click', (e) => {
            if (!popup.contains(e.target) && e.target !== this.inputEl) {
                hidePopup();
            }
        });
    }
    _updateContainerState() {
        const queryInPopup = (selector) => this.container.querySelector(selector) || document.querySelector(selector);
        const container = queryInPopup('.lumina-input-container');
        if (container) {
            if (this.inputEl && (this.inputEl.value.trim().length > 0 || this.selectedImages.length > 0)) container.classList.add('has-content');
            else container.classList.remove('has-content');
            if (document.activeElement === this.inputEl) container.classList.add('focused');
            else container.classList.remove('focused');
        }
    }
    _setupModelSelector(popup) {
        const selector = popup.querySelector('.lumina-model-selector');
        if (!selector) return;
        const btn = selector.querySelector('.lumina-model-btn'), label = selector.querySelector('.lumina-current-model'), dropdown = selector.querySelector('.lumina-model-dropdown');
        if (!btn || !dropdown) return;
        const self = this;
        const render = (data) => {
            const chain = data.modelChains?.text || [];
            let currentModel = self.activeTabModel?.model;
            let currentProviderId = self.activeTabModel?.providerId;
            const lastUsed = data.lastUsedModel;
            if (!currentModel && lastUsed && lastUsed.model) {
                currentModel = lastUsed.model;
                currentProviderId = lastUsed.providerId;
                if (!self.activeTabModel) self.activeTabModel = { model: currentModel, providerId: currentProviderId };
            }
            if (!currentModel && chain.length > 0) {
                currentModel = chain[0].model;
                currentProviderId = chain[0].providerId;
                if (!self.activeTabModel) self.activeTabModel = { model: currentModel, providerId: currentProviderId };
            }
            if (currentModel && label) label.textContent = currentModel;
            dropdown.innerHTML = '';
            if (chain.length === 0) { dropdown.innerHTML = '<div style="padding:8px;font-size:11px;">No models</div>'; return; }
            const header = document.createElement('div');
            header.style.cssText = 'padding:8px 12px; font-size:11px; font-weight:500; color:var(--lumina-text-secondary); text-transform:uppercase; letter-spacing:0.02em;';
            header.textContent = 'MODELS';
            dropdown.appendChild(header);
            chain.forEach((item) => {
                const el = document.createElement('button');
                const isActive = item.model === currentModel && item.providerId === currentProviderId;
                el.className = `lumina-model-item ${isActive ? 'active' : ''}`;
                el.innerHTML = `<div class="model-info"><span class="model-name">${item.model}</span></div>`;
                el.onclick = (e) => {
                    e.stopPropagation();
                    if (label) label.textContent = item.model;
                    dropdown.classList.remove('active');
                    dropdown.querySelectorAll('.lumina-model-item').forEach(b => b.classList.remove('active'));
                    el.classList.add('active');
                    self.activeTabModel = { model: item.model, providerId: item.providerId };
                    chrome.storage.local.set({ lastUsedModel: self.activeTabModel });

                    const sid = self.historyEl?.dataset?.sessionId || null;
                    const sidKey = sid || 'null';
                    chrome.storage.local.get(['lumina_session_settings', 'advancedParamsByModel'], (res) => {
                        const settings = res.lumina_session_settings || {};
                        if (!settings[sidKey]) settings[sidKey] = {};
                        settings[sidKey].selectedModel = self.activeTabModel;

                        // Load and sync thinkingLevel for the new model
                        const advancedParamsByModel = res.advancedParamsByModel || {};
                        const compositeKey = item.providerId ? `${item.providerId}:${item.model}` : item.model;
                        const modelParams = advancedParamsByModel[compositeKey] || advancedParamsByModel[item.model] || {};

                        const isGemini = (item.providerId && item.providerId.toLowerCase().includes('gemini')) || 
                                         (item.model && item.model.toLowerCase().includes('gemini'));
                        const isGemma4 = /gemma-4/i.test(item.model);
                        const defaultThinking = isGemma4 ? 'minimal' : (isGemini ? 'minimal' : 'none');
                        const newThinkingLevel = modelParams.thinkingLevel || defaultThinking;

                        self.thinkingLevel = newThinkingLevel;
                        settings[sidKey].thinkingLevel = newThinkingLevel;

                        chrome.storage.local.set({ lumina_session_settings: settings }, () => {
                            if (typeof self.refreshReasoningSelector === 'function') {
                                self.refreshReasoningSelector();
                            }
                        });
                    });

                    self._updateTokenLimitFromModel();

                    selector.dispatchEvent(new CustomEvent('lumina:spotlight-model-change', {
                        bubbles: true,
                        detail: { model: item.model, providerId: item.providerId }
                    }));
                };
                dropdown.appendChild(el);
            });
        };
        const fetchAndRender = () => {
            const sid = self.historyEl?.dataset?.sessionId || null;
            const sidKey = sid || 'null';
            chrome.storage.local.get(['providers', 'modelChains', 'lastUsedModel', 'lumina_session_settings'], (data) => {
                const settings = data.lumina_session_settings || {};
                const saved = settings[sidKey] || {};
                if (saved.selectedModel) {
                    self.activeTabModel = saved.selectedModel;
                }
                render(data);
            });
        };
        fetchAndRender();
        this.refreshModelSelector = fetchAndRender;
        const selectorWrapper = selector;
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (dropdown.classList.contains('active')) {
                dropdown.classList.remove('active');
            } else {
                const toolsDropdown = popup.querySelector('.lumina-tools-dropdown');
                if (toolsDropdown) toolsDropdown.classList.remove('active');
                const tokenCounter = popup.querySelector('#token-counter');
                if (tokenCounter) tokenCounter.classList.remove('is-expanded');
                if (!dropdown.classList.contains('active')) fetchAndRender();
                dropdown.classList.add('active');
            }
        });
        document.addEventListener('click', (e) => {
            if (!selector.contains(e.target) && dropdown.classList.contains('active')) {
                dropdown.classList.remove('active');
            }
        });
    }
    _setupReasoningSelector(popup) {
        const selector = popup.querySelector('.lumina-reasoning-selector');
        if (!selector) return;
        const btn = selector.querySelector('.lumina-reasoning-btn');
        const label = selector.querySelector('.lumina-current-reasoning');
        const dropdown = selector.querySelector('.lumina-reasoning-dropdown');
        if (!btn || !dropdown) return;

        const self = this;
        const render = (data) => {
            const currentModel = self.activeTabModel?.model;
            const currentProviderId = self.activeTabModel?.providerId;
            if (!currentModel) {
                if (label) label.textContent = 'None';
                dropdown.innerHTML = '';
                return;
            }

            const providers = data.providers || [];
            const provider = providers.find(p => p.id === currentProviderId);
            const isGemini = (provider ? (provider.type === 'gemini') : false) ||
                (currentModel && currentModel.toLowerCase().includes('gemini')) ||
                (currentProviderId && currentProviderId.toLowerCase().includes('gemini'));

            const isGemma4 = /gemma-4/i.test(currentModel);
            const isGemma = /gemma/i.test(currentModel) && !isGemma4;

            const advancedParamsByModel = data.advancedParamsByModel || {};
            const compositeKey = currentProviderId ? `${currentProviderId}:${currentModel}` : currentModel;
            const modelParams = advancedParamsByModel[compositeKey] || advancedParamsByModel[currentModel] || {};
            
            let thinkingLevel = self.thinkingLevel || modelParams.thinkingLevel || (isGemma4 ? 'minimal' : (isGemini ? 'minimal' : 'none'));
            if (isGemma4) {
                if (thinkingLevel !== 'high') {
                    thinkingLevel = 'minimal';
                }
            } else if (isGemini && thinkingLevel === 'none') {
                thinkingLevel = 'minimal';
            } else if (!isGemini && !isGemma4 && thinkingLevel === 'minimal') {
                thinkingLevel = 'none';
            }

            if (self.thinkingLevel !== thinkingLevel) {
                self.thinkingLevel = thinkingLevel;
                const sid = self.historyEl?.dataset?.sessionId || null;
                const sidKey = sid || 'null';
                chrome.storage.local.get(['lumina_session_settings'], (res) => {
                    const settings = res.lumina_session_settings || {};
                    if (!settings[sidKey]) settings[sidKey] = {};
                    settings[sidKey].thinkingLevel = thinkingLevel;
                    chrome.storage.local.set({ lumina_session_settings: settings });
                });
            }

            const titleMap = {
                'minimal': 'Minimal',
                'low': 'Low',
                'medium': 'Standard',
                'high': 'Extended',
                'none': 'None'
            };

            if (label) {
                label.textContent = titleMap[thinkingLevel] || 'None';
            }

            dropdown.innerHTML = '';

            let options = [];
            if (isGemma4) {
                options = [
                    { value: 'minimal', title: 'Minimal', desc: 'Minimal thinking, very fast' },
                    { value: 'high', title: 'Extended', desc: 'Complex problem solving' }
                ];
            } else if (isGemma) {
                options = [
                    { value: 'none', title: 'None', desc: 'Thinking is not supported' }
                ];
            } else if (isGemini) {
                options = [
                    { value: 'minimal', title: 'Minimal', desc: 'Minimal thinking, very fast' },
                    { value: 'low', title: 'Low', desc: 'Short thinking, fast response' },
                    { value: 'medium', title: 'Standard', desc: 'Best for most questions' },
                    { value: 'high', title: 'Extended', desc: 'Complex problem solving' }
                ];
            } else {
                options = [
                    { value: 'none', title: 'None', desc: 'No reasoning, fastest response' },
                    { value: 'low', title: 'Low', desc: 'Quick reasoning, low latency' },
                    { value: 'medium', title: 'Standard', desc: 'Best for most questions' },
                    { value: 'high', title: 'Extended', desc: 'Complex problem solving' }
                ];
            }

            options.forEach((opt) => {
                const el = document.createElement('button');
                const isActive = thinkingLevel === opt.value;
                el.className = `lumina-reasoning-item ${isActive ? 'active' : ''}`;
                el.innerHTML = `
                    <span class="reasoning-checkmark">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="checkmark-icon"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    </span>
                    <div class="reasoning-info">
                        <span class="reasoning-title">${opt.title}</span>
                        <span class="reasoning-desc">${opt.desc}</span>
                    </div>
                `;
                el.onclick = (e) => {
                    e.stopPropagation();
                    if (label) label.textContent = titleMap[opt.value] || 'None';
                    dropdown.classList.remove('active');
                    dropdown.querySelectorAll('.lumina-reasoning-item').forEach(b => b.classList.remove('active'));
                    el.classList.add('active');

                    self.thinkingLevel = opt.value;

                    const sid = self.historyEl?.dataset?.sessionId || null;
                    const sidKey = sid || 'null';
                    chrome.storage.local.get(['lumina_session_settings'], (res) => {
                        const settings = res.lumina_session_settings || {};
                        if (!settings[sidKey]) settings[sidKey] = {};
                        settings[sidKey].thinkingLevel = opt.value;
                        chrome.storage.local.set({ lumina_session_settings: settings });
                    });

                    const key = compositeKey;
                    if (!advancedParamsByModel[key]) advancedParamsByModel[key] = {};
                    if (opt.value === 'none' || opt.value === 'off') {
                        delete advancedParamsByModel[key].thinkingLevel;
                    } else {
                        advancedParamsByModel[key].thinkingLevel = opt.value;
                    }



                    chrome.storage.local.set({ advancedParamsByModel }, () => {
                        if (typeof self.refreshSystemTokens === 'function') {
                            self.refreshSystemTokens();
                        }
                    });
                };
                dropdown.appendChild(el);
            });
        };

        const fetchAndRenderReasoning = () => {
            const sid = self.historyEl?.dataset?.sessionId || null;
            const sidKey = sid || 'null';
            chrome.storage.local.get(['providers', 'advancedParamsByModel'], (data) => {
                const modelObj = self.activeTabModel;
                if (modelObj) {
                    const compositeKey = modelObj.providerId ? `${modelObj.providerId}:${modelObj.model}` : modelObj.model;
                    const advancedParamsByModel = data.advancedParamsByModel || {};
                    const modelParams = advancedParamsByModel[compositeKey] || advancedParamsByModel[modelObj.model] || {};

                    const isGemini = (modelObj.providerId && modelObj.providerId.toLowerCase().includes('gemini')) || 
                                     (modelObj.model && modelObj.model.toLowerCase().includes('gemini'));
                    const isGemma4 = /gemma-4/i.test(modelObj.model);
                    const defaultThinking = isGemma4 ? 'minimal' : (isGemini ? 'minimal' : 'none');

                    self.thinkingLevel = modelParams.thinkingLevel || defaultThinking;
                }
                render(data);
            });
        };

        this.refreshReasoningSelector = fetchAndRenderReasoning;

        fetchAndRenderReasoning();

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (dropdown.classList.contains('active')) {
                dropdown.classList.remove('active');
            } else {
                const toolsDropdown = popup.querySelector('.lumina-tools-dropdown');
                if (toolsDropdown) toolsDropdown.classList.remove('active');
                const modelDropdown = popup.querySelector('.lumina-model-dropdown');
                if (modelDropdown) modelDropdown.classList.remove('active');
                const tokenCounter = popup.querySelector('#token-counter');
                if (tokenCounter) tokenCounter.classList.remove('is-expanded');

                fetchAndRenderReasoning();
                dropdown.classList.add('active');
            }
        });

        popup.addEventListener('lumina:spotlight-model-change', () => {
            fetchAndRenderReasoning();
        });

        document.addEventListener('click', (e) => {
            if (!selector.contains(e.target) && dropdown.classList.contains('active')) {
                dropdown.classList.remove('active');
            }
        });
    }
    _setupMicButton(btn, input) {
        let isRecording = false;
        let recognition = null;
        let originalInputText = '';
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (!SpeechRecognition) {
            btn.addEventListener('click', (e) => {
                e.preventDefault(); e.stopPropagation();
                if (btn.classList.contains('send') || btn.classList.contains('pause')) {
                    if (this.isGenerating) {
                        if (this.onStop) this.onStop();
                        this.isGenerating = false;
                        this._updateActionBtnState();
                    } else {
                        const text = input.value.trim();
                        if (text || this.attachedFiles.length > 0) {
                            this._handleSubmit();
                        }
                    }
                    return;
                }
                alert('Your browser does not support Speech Recognition.');
            });
            return;
        }

        btn.addEventListener('click', async (e) => {
            e.preventDefault(); e.stopPropagation();
            if (btn.classList.contains('send') || btn.classList.contains('pause')) {
                if (this.isGenerating) {
                    if (this.onStop) this.onStop();
                    this.isGenerating = false;
                    this._updateActionBtnState();
                } else {
                    const text = input.value.trim();
                    if (text || this.attachedFiles.length > 0) {
                        this._handleSubmit();
                    }
                }
                return;
            }

            if (isRecording) {
                if (recognition) recognition.stop();
                return;
            }

            try {

                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                stream.getTracks().forEach(t => t.stop());

                recognition = new SpeechRecognition();
                recognition.continuous = true;
                recognition.interimResults = true;


                originalInputText = '';
                input.value = '';

                recognition.onstart = () => {
                    isRecording = true;
                    btn.classList.add('recording');
                    input.placeholder = 'Listening...';
                };

                recognition.onresult = (event) => {
                    let interimTranscript = '';
                    let finalTranscript = '';

                    for (let i = event.resultIndex; i < event.results.length; ++i) {
                        if (event.results[i].isFinal) {
                            finalTranscript += event.results[i][0].transcript;
                        } else {
                            interimTranscript += event.results[i][0].transcript;
                        }
                    }

                    if (finalTranscript) {
                        let textToAdd = finalTranscript.trim();

                        if (!originalInputText || /[.!?]\s*$/.test(originalInputText)) {
                            textToAdd = textToAdd.charAt(0).toUpperCase() + textToAdd.slice(1);
                        }
                        originalInputText += originalInputText ? ' ' + textToAdd : textToAdd;
                    }


                    let currentText = originalInputText;
                    if (interimTranscript) {
                        currentText += (currentText ? ' ' : '') + interimTranscript.trim();
                    }

                    input.value = currentText;
                    input.style.height = 'auto';
                    input.style.height = input.scrollHeight + 'px';
                    this._updateContainerState();
                };

                recognition.onerror = (event) => {
                    console.error('Speech recognition error', event.error);
                    if (event.error === 'not-allowed') {
                        if (confirm('Lumina cần quyền truy cập Microphone để nhận diện giọng nói.\n\nDo hạn chế của trình duyệt, bạn cần cấp quyền này ở tab cài đặt. Mở trang cài đặt ngay?')) {
                            chrome.runtime.sendMessage({ action: 'open_options', section: 'general', requestMic: true });
                        }
                    }
                };

                recognition.onend = () => {
                    isRecording = false;
                    btn.classList.remove('recording');
                    input.placeholder = 'Ask anything...';
                    input.focus();
                };

                recognition.start();
            } catch (err) {
                console.error(err);
                if (err.name === 'NotAllowedError' || err.name === 'PermissionDismissedError') {
                    if (confirm('Lumina cần quyền truy cập Microphone để nhận diện giọng nói.\n\nDo hạn chế của trình duyệt, bạn cần cấp quyền này ở tab cài đặt. Mở trang cài đặt ngay?')) {
                        chrome.runtime.sendMessage({ action: 'open_options', section: 'general', requestMic: true });
                    }
                } else {
                    alert('Không thể truy cập Microphone: ' + err.message);
                }
            }
        });
    }
    _getMaxTokens() {
        let maxTokens = null;
        const modelLabel = this.container ? this.container.querySelector('.lumina-current-model') : null;
        const currentModel = modelLabel ? modelLabel.textContent : (this.options.isSpotlight ? 'gpt-4o' : '');

        if (this.advancedParamsByModel && currentModel) {
            for (const key in this.advancedParamsByModel) {
                if (key.endsWith(`:${currentModel}`)) {
                    const params = this.advancedParamsByModel[key];
                    if (params.maxTokens !== undefined && params.maxTokens !== "" && params.maxTokens !== null) {
                        maxTokens = params.maxTokens;
                        break;
                    }
                }
            }
        }
        return maxTokens;
    }

    _handleSubmit(isRegenerate = false, entryId = null) {
        const text = isRegenerate ? '' : this.inputEl.value.trim();
        if (!text && !isRegenerate && this.attachedFiles.length === 0) return;
        if (this.attachedFiles.some(f => f.status === 'uploading')) {
            console.warn('[Lumina] Cannot submit: files are still uploading');
            return;
        }

        this.isGenerating = true;
        this._updateActionBtnState();

        const inputContainer = this.container ? this.container.querySelector('.lumina-input-container') : null;
        if (inputContainer) {
            inputContainer.classList.remove('lumina-sending');
            void inputContainer.offsetWidth;
            inputContainer.classList.add('lumina-sending');
            setTimeout(() => inputContainer.classList.remove('lumina-sending'), 900);
        }

        const readPage = !!this.readWebpageEnabled;
        const pageTitle = this.currentPageTitle || "Current Page";
        const maxTokens = this._getMaxTokens();

        if (this.options.onSubmit) {
            const submitFiles = this.attachedFiles.map(file => ({ ...file }));
            this.options.onSubmit(text, submitFiles, { readPage, pageTitle, maxTokens, isRegenerate, entryId });
        }

        if (!isRegenerate) {
            this.inputEl.value = '';
            this.inputEl.style.height = 'auto';
            this.clearImages();
        }
    }

    _updateActionBtnState() {
        if (!this.container) return;
        const micBtn = this.container.querySelector('#mic-btn') || document.querySelector('#mic-btn');
        if (!micBtn) return;

        const val = this.inputEl ? this.inputEl.value.trim() : '';

        if (this.isGenerating) {
            micBtn.className = 'lumina-action-btn active pause';
            micBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"></rect></svg>`;
            micBtn.title = "Pause";
        } else if (val || this.attachedFiles.length > 0) {
            micBtn.className = 'lumina-action-btn active send';
            micBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>`;
            micBtn.title = "Send";
        } else {
            micBtn.className = 'lumina-mic-btn';
            micBtn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>`;
            micBtn.title = "Voice Input";
        }
    }
    _fileToDataURL(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.readAsDataURL(file);
        });
    }

    _resolveImagePreviewSrc(item, src) {
        if (!src || typeof src !== 'string') return src;
        if (!src.startsWith('data:image/')) return src;

        if (item && typeof item === 'object' && item._luminaBlobUrl) {
            return item._luminaBlobUrl;
        }

        const blobUrl = this._createObjectUrlFromDataUrl(src);
        if (blobUrl && item && typeof item === 'object') {
            item._luminaBlobUrl = blobUrl;
        }
        return blobUrl || src;
    }

    _createObjectUrlFromDataUrl(dataUrl) {
        if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return null;
        const commaIdx = dataUrl.indexOf(',');
        if (commaIdx === -1) return null;

        const header = dataUrl.slice(0, commaIdx);
        const base64 = dataUrl.slice(commaIdx + 1);
        const mimeMatch = header.match(/^data:([^;]+);base64$/i);
        if (!mimeMatch) return null;

        try {
            const binary = atob(base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
            }
            const blob = new Blob([bytes], { type: mimeMatch[1] || 'application/octet-stream' });
            return this._createObjectUrl(blob);
        } catch (error) {
            console.warn('Failed to build preview blob URL:', error);
            return null;
        }
    }

    _createObjectUrl(blobOrFile) {
        if (!blobOrFile || !URL?.createObjectURL) return null;
        const objectUrl = URL.createObjectURL(blobOrFile);
        if (!this._luminaPreviewObjectUrls) this._luminaPreviewObjectUrls = new Set();
        this._luminaPreviewObjectUrls.add(objectUrl);
        return objectUrl;
    }

    _revokeObjectUrl(url) {
        if (!url || typeof url !== 'string' || !url.startsWith('blob:') || !URL?.revokeObjectURL) return;
        try {
            URL.revokeObjectURL(url);
        } catch (_) {

        }
        if (this._luminaPreviewObjectUrls) this._luminaPreviewObjectUrls.delete(url);
    }
    showStopButton(onStop = null) {
        this.isGenerating = true;
        this.onStop = onStop;
        this._updateActionBtnState();


        let stopBtn = null;
        if (this.container) {
            stopBtn = this.container.querySelector('#lumina-stop-btn') || this.container.querySelector('.lumina-stop-btn');
        }
        if (!stopBtn && typeof document !== 'undefined') {
            stopBtn = document.getElementById('lumina-stop-btn') || document.querySelector('.lumina-stop-btn');
        }
        if (stopBtn) {
            stopBtn.style.display = 'flex';
            if (!stopBtn.dataset.listenerAdded) {
                stopBtn.dataset.listenerAdded = 'true';
                stopBtn.addEventListener('click', () => {
                    if (this.onStop) this.onStop();
                    this.hideStopButton();
                });
            }
        }
    }
    hideStopButton() {
        this.isGenerating = false;
        this.onStop = null;
        this._updateActionBtnState();


        let stopBtn = null;
        if (this.container) {
            stopBtn = this.container.querySelector('#lumina-stop-btn') || this.container.querySelector('.lumina-stop-btn');
        }
        if (stopBtn) {
            stopBtn.style.display = 'none';
        }
    }

    _initContextMenu() {
        if (!this.container) return;


        const existing = document.querySelector('.lumina-context-menu');
        if (existing) existing.remove();

        this.contextMenu = document.createElement('div');
        this.contextMenu.className = 'lumina-context-menu';
        this.contextMenu.innerHTML = `
            <button class="lumina-context-menu-item" data-action="copy">
                <span class="lumina-svg-icon lumina-icon-copy" aria-hidden="true"></span>
                Copy
            </button>
            <button class="lumina-context-menu-item" data-action="regenerate">
                <span class="lumina-svg-icon lumina-icon-refresh" aria-hidden="true"></span>
                Regenerate
            </button>
        `;
        document.body.appendChild(this.contextMenu);





        document.addEventListener('click', (e) => {
            if (!this.contextMenu.contains(e.target)) {
                this._hideContextMenu();
            }
        });


        this.contextMenu.addEventListener('click', (e) => {
            const item = e.target.closest('.lumina-context-menu-item');
            if (!item) return;

            const action = item.dataset.action;
            const targetAnswer = this.contextMenu.__targetAnswer;
            if (!targetAnswer) return;

            this._handleContextMenuAction(action, targetAnswer);
            this._hideContextMenu();
        });
    }

    _showContextMenu(x, y, targetAnswer) {
        if (!this.contextMenu) return;
        this.contextMenu.__targetAnswer = targetAnswer;

        if (!this.contextMenuBackdrop) {
            this.contextMenuBackdrop = document.createElement('div');
            this.contextMenuBackdrop.className = 'lumina-overlay-backdrop';
            this.contextMenuBackdrop.style.zIndex = '99999';
            this.contextMenuBackdrop.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
            this.contextMenuBackdrop.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
            this.contextMenuBackdrop.addEventListener('click', () => this._hideContextMenu());
            document.body.appendChild(this.contextMenuBackdrop);
        }

        this.contextMenuBackdrop.style.display = 'block';

        this._contextMenuOriginalOverflowBody = document.body.style.overflow;
        this._contextMenuOriginalOverflowHtml = document.documentElement.style.overflow;
        document.body.style.overflow = 'hidden';
        document.documentElement.style.overflow = 'hidden';

        this.contextMenu.style.display = 'flex';


        const menuWidth = this.contextMenu.offsetWidth || 180;
        const menuHeight = this.contextMenu.offsetHeight || 150;
        const padding = 10;

        let left = x;
        let top = y;

        if (x + menuWidth > window.innerWidth - padding) {
            left = x - menuWidth;
        }
        if (y + menuHeight > window.innerHeight - padding) {
            top = y - menuHeight;
        }

        this.contextMenu.style.left = `${left}px`;
        this.contextMenu.style.top = `${top}px`;
    }

    _hideContextMenu() {
        if (this.contextMenu) {
            this.contextMenu.style.display = 'none';
        }

        if (this.contextMenuBackdrop) {
            this.contextMenuBackdrop.style.display = 'none';
        }

        if (this._contextMenuOriginalOverflowBody !== undefined) {
            document.body.style.overflow = this._contextMenuOriginalOverflowBody || '';
            document.documentElement.style.overflow = this._contextMenuOriginalOverflowHtml || '';
            this._contextMenuOriginalOverflowBody = undefined;
            this._contextMenuOriginalOverflowHtml = undefined;
        }
    }

    async _handleContextMenuAction(action, answer) {
        const entry = answer.closest('.lumina-dict-entry');
        if (!entry) return;

        const rawText = answer.dataset.rawText || answer.innerText || "";

        switch (action) {
            case 'copy':

                let plain = rawText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

                plain = plain.replace(/(\*\*|__|`|#|>|\[.*?\]\(.*?\))/g, '');
                navigator.clipboard.writeText(plain);
                break;
            case 'copy-md':

                navigator.clipboard.writeText(rawText);
                break;
            case 'edit': {
                this.enterAnswerEditMode(answer);
                break;
            }
            case 'regenerate': {
                this.regenerateEntry(entry);
                break;
            }
        }
    }

    _handleAnswerAction(action, buttonEl, answerDiv) {
        if (action === 'copy') {
            this._handleContextMenuAction('copy', answerDiv);
            const originalHTML = buttonEl.innerHTML;
            buttonEl.classList.add('is-active');
            buttonEl.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
            setTimeout(() => {
                buttonEl.classList.remove('is-active');
                buttonEl.innerHTML = originalHTML;
            }, 1000);
        } else if (action === 'regenerate') {
            this._handleContextMenuAction('regenerate', answerDiv);
        } else if (action === 'edit') {
            this._handleContextMenuAction('edit', answerDiv);
        } else if (action === 'more') {
            this._showMoreOptionsDropdown(buttonEl, answerDiv);
        }
    }

    _showMoreOptionsDropdown(buttonEl, answerDiv) {
        if (!this.contextMenu) return;
        this.contextMenu.__targetAnswer = answerDiv;

        this.contextMenu.innerHTML = `
            <button class="lumina-context-menu-item" data-action="edit">
                <span class="lumina-svg-icon lumina-icon-file-edit" aria-hidden="true"></span>
                Edit
            </button>
        `;

        const rect = buttonEl.getBoundingClientRect();
        const dropdownWidth = 140;
        let left = rect.left + window.scrollX + rect.width - dropdownWidth;
        let top = rect.bottom + window.scrollY + 6;
        if (left < 10) left = 10;
        this.contextMenu.style.left = `${left}px`;
        this.contextMenu.style.top = `${top}px`;
        this.contextMenu.style.display = 'block';
        this.contextMenu.classList.add('visible');
    }

    _handleQuestionRecheck(userInput, editable, isRegenerate = false) {
        const questionDiv = editable.closest('.lumina-chat-question');
        const entry = editable.closest('.lumina-dict-entry');
        if (!entry) return;

        entry.dataset.timestamp = Date.now().toString();

        const userTextOnly = userInput.replace(/^SelectedText\s*/, '').trim();

        const rawText = (questionDiv && questionDiv.dataset.rawText) || userInput;
        let finalFullQuestion = userTextOnly;


        if (rawText.includes('$ContextTag')) {
            finalFullQuestion = `$ContextTag ${userTextOnly}`;
        } else if (rawText.startsWith('SelectedText:')) {
            const contextMatch = rawText.match(/^SelectedText: "[^"]*"\s+/);
            if (contextMatch) {
                finalFullQuestion = contextMatch[0] + userTextOnly;
            }
        }


        this.currentEntryDiv = entry;
        this.currentAnswerDiv = null;


        let next = entry.nextElementSibling;
        while (next) {
            const toRemove = next;
            next = next.nextElementSibling;
            toRemove.remove();
        }


        entry.querySelectorAll('.lumina-chat-answer, .lumina-web-search').forEach(el => el.remove());


        this.setInitialEntryHeight(entry, true);


        this.showLoading();


        if (typeof this.options.onSubmit === 'function') {
            const entryId = entry.dataset.entryId;
            const entryType = entry.dataset.entryType || 'chat';
            this.options.onSubmit(finalFullQuestion, [], {
                isRecheck: true,
                isRegenerate,
                entryId,
                mode: entryType
            });
        }
    }

    _focusEditableAtEnd(el) {
        if (!el) return;
        el.focus();
        requestAnimationFrame(() => {
            try {
                const selection = window.getSelection();
                const range = document.createRange();
                range.selectNodeContents(el);
                range.collapse(false);
                selection.removeAllRanges();
                selection.addRange(range);
            } catch (_) { }
        });
    }

    regenerateEntry(entry) {
        if (!entry) return;

        const questionDiv = entry.querySelector('.lumina-chat-question');
        if (!questionDiv) return;

        const questionContent = questionDiv.querySelector('.lumina-question-content')
            || questionDiv.querySelector('div[contenteditable="true"]')
            || questionDiv;
        const rawQuestion = questionDiv.dataset.rawText || questionContent.innerText || questionContent.textContent || '';
        if (!rawQuestion.trim()) return;

        this._handleQuestionRecheck(rawQuestion.trim(), questionContent, true);
    }

    enterQuestionEditMode(questionDiv) {
        if (!questionDiv || questionDiv.classList.contains('lumina-question-editing')) return;

        this._hideContextMenu();
        this.cancelAllQuestionEdits();

        const row = questionDiv.closest('.lumina-question-row');
        let contentDiv = questionDiv.querySelector('.lumina-question-content') || questionDiv.querySelector('div[contenteditable="true"]');
        if (!contentDiv) {
            const originalHTML = questionDiv.innerHTML;
            questionDiv.innerHTML = '';
            contentDiv = document.createElement('div');
            contentDiv.className = 'lumina-question-content';
            contentDiv.innerHTML = originalHTML;
            questionDiv.appendChild(contentDiv);
        }
        if (!contentDiv) return;

        questionDiv.__originalHTML = contentDiv.innerHTML;
        questionDiv.__originalRaw = questionDiv.dataset.rawText || contentDiv.innerText || '';
        questionDiv.__questionEditOriginalClassName = contentDiv.className;

        questionDiv.classList.add('is-editing', 'lumina-question-editing');
        if (row) row.classList.add('lumina-question-row-editing');

        contentDiv.className = 'lumina-answer-content';
        contentDiv.contentEditable = 'plaintext-only';
        contentDiv.spellcheck = false;

        const toolbar = document.createElement('div');
        toolbar.className = 'lumina-answer-edit-toolbar lumina-question-edit-toolbar';
        toolbar.contentEditable = 'false';
        toolbar.innerHTML = `
            <button class="lumina-edit-btn lumina-edit-cancel" title="Cancel">Cancel</button>
            <button class="lumina-edit-btn lumina-edit-save" title="Send">Send</button>
        `;
        toolbar.onmousedown = (e) => e.preventDefault();

        toolbar.querySelector('.lumina-edit-cancel').onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.exitQuestionEditMode(questionDiv, false);
        };

        toolbar.querySelector('.lumina-edit-save').onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.exitQuestionEditMode(questionDiv, true);
        };

        if (row) {
            row.appendChild(toolbar);
        } else {
            questionDiv.appendChild(toolbar);
        }
        questionDiv.__questionEditToolbar = toolbar;
        questionDiv.__questionEditContentDiv = contentDiv;

        this._focusEditableAtEnd(contentDiv);

        const keyHandler = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                this.exitQuestionEditMode(questionDiv, false);
                contentDiv.removeEventListener('keydown', keyHandler);
            } else if (e.key === 'Enter' && !e.shiftKey) {


                e.preventDefault();
                this.exitQuestionEditMode(questionDiv, true);
                contentDiv.removeEventListener('keydown', keyHandler);
            }
        };
        contentDiv.addEventListener('keydown', keyHandler);
        questionDiv.__questionEditKeyHandler = keyHandler;


        setTimeout(() => {
            if (!questionDiv.classList.contains('lumina-question-editing')) return;
            const outsideClickListener = (e) => {

                if (!questionDiv.contains(e.target)) {
                    this.exitQuestionEditMode(questionDiv, false);
                }
            };
            document.addEventListener('mousedown', outsideClickListener);
            questionDiv.__outsideClickListener = outsideClickListener;
        }, 10);
    }

    _undoEditAndTruncate(entry, mode, questionDiv, answerDiv) {
        if (!entry) return;


        let next = entry.nextElementSibling;
        while (next) {
            const toRemove = next;
            next = next.nextElementSibling;
            toRemove.remove();
        }


        const prevEntry = entry.previousElementSibling;
        this.currentEntryDiv = prevEntry;
        if (prevEntry) {
            this.currentAnswerDiv = prevEntry.querySelector('.lumina-chat-answer') ||
                prevEntry.querySelector('.lumina-answer-versions');
        } else {
            this.currentAnswerDiv = null;
        }


        entry.remove();


        this._updateActionBtnState();

        if (prevEntry) {
            this.clearEntryMargins(prevEntry);
            this.adjustEntryMargin(prevEntry, 'immediate');
            const scrollContainer = this.getScrollContainer();
            if (scrollContainer) {
                const containerRect = scrollContainer.getBoundingClientRect();
                const elementRect = prevEntry.getBoundingClientRect();
                const targetScrollTop = scrollContainer.scrollTop + (elementRect.top - containerRect.top);
                scrollContainer.scrollTop = Math.max(0, targetScrollTop);
                
                const activeTab = window.tabs ? window.tabs.find(t => t.historyEl === scrollContainer) : null;
                if (activeTab) {
                    activeTab.scrollTop = targetScrollTop;
                    activeTab.isAtBottom = false;
                    activeTab.userScrolledUp = true;
                }
            }
        }

        if (this.historyEl) {
            this.historyEl.dispatchEvent(new CustomEvent('lumina:history-changed', {
                bubbles: true,
                detail: { force: true }
            }));
        }
    }

    exitQuestionEditMode(questionDiv, save = false) {
        if (!questionDiv || !questionDiv.classList.contains('lumina-question-editing')) return;


        if (questionDiv.__outsideClickListener) {
            document.removeEventListener('mousedown', questionDiv.__outsideClickListener);
            delete questionDiv.__outsideClickListener;
        }

        const contentDiv = questionDiv.__questionEditContentDiv || questionDiv.querySelector('.lumina-question-content') || questionDiv.querySelector('div[contenteditable="true"]') || questionDiv;
        const toolbar = questionDiv.__questionEditToolbar || questionDiv.querySelector('.lumina-question-edit-toolbar');
        const row = questionDiv.closest('.lumina-question-row');
        const originalHTML = questionDiv.__originalHTML;
        const originalRaw = questionDiv.__originalRaw || '';

        if (contentDiv && questionDiv.__questionEditKeyHandler) {
            contentDiv.removeEventListener('keydown', questionDiv.__questionEditKeyHandler);
        }

        if (save) {
            const newText = (contentDiv?.innerText || contentDiv?.textContent || '').trim();
            questionDiv.dataset.rawText = newText;
            if (contentDiv) {

                contentDiv.innerText = newText;
                if (typeof questionDiv.__questionEditOriginalClassName === 'string') {
                    contentDiv.className = questionDiv.__questionEditOriginalClassName;
                }
            }
            questionDiv.classList.remove('is-editing', 'lumina-question-editing');
            if (row) row.classList.remove('lumina-question-row-editing');
            if (toolbar) toolbar.remove();
            if (contentDiv) contentDiv.contentEditable = 'false';

            const isRegenerate = (newText === originalRaw);
            this._handleQuestionRecheck(newText, contentDiv || questionDiv, isRegenerate);
            LuminaChatUI.injectQuestionActions(questionDiv);
        } else {
            if (contentDiv && typeof originalHTML === 'string') {
                contentDiv.innerHTML = originalHTML;
            }
            if (contentDiv && typeof questionDiv.__questionEditOriginalClassName === 'string') {
                contentDiv.className = questionDiv.__questionEditOriginalClassName;
            }
            questionDiv.dataset.rawText = originalRaw;
            questionDiv.classList.remove('is-editing', 'lumina-question-editing');
            if (row) row.classList.remove('lumina-question-row-editing');
            if (contentDiv) contentDiv.contentEditable = 'false';
            if (toolbar) toolbar.remove();
            LuminaChatUI.injectQuestionActions(questionDiv);
        }

        delete questionDiv.__originalHTML;
        delete questionDiv.__originalRaw;
        delete questionDiv.__questionEditOriginalClassName;
        delete questionDiv.__questionEditToolbar;
        delete questionDiv.__questionEditContentDiv;
        delete questionDiv.__questionEditKeyHandler;
    }

    cancelAllQuestionEdits() {
        if (!this.historyEl) return;
        const editingQuestions = Array.from(this.historyEl.querySelectorAll('.lumina-chat-question.lumina-question-editing'));
        editingQuestions.forEach((questionDiv) => {
            this.exitQuestionEditMode(questionDiv, false);
        });
    }

    enterAnswerEditMode(answerDiv) {
        if (!answerDiv || answerDiv.classList.contains('lumina-answer-editing')) return;

        this._hideContextMenu();


        answerDiv.contentEditable = 'false';

        let contentDiv = answerDiv.querySelector('.lumina-answer-content');
        if (!contentDiv) {

            const originalHTML = answerDiv.innerHTML;
            answerDiv.innerHTML = '';
            contentDiv = document.createElement('div');
            contentDiv.className = 'lumina-answer-content';
            contentDiv.innerHTML = originalHTML;
            answerDiv.appendChild(contentDiv);
        }

        const originalRaw = answerDiv.dataset.rawText || contentDiv.innerText;
        answerDiv.__originalHTML = contentDiv.innerHTML;
        answerDiv.__originalRaw = originalRaw;


        contentDiv.innerHTML = answerDiv.__originalHTML;

        answerDiv.classList.add('is-editing', 'lumina-answer-editing');
        contentDiv.contentEditable = 'plaintext-only';

        this._focusEditableAtEnd(contentDiv);


        const toolbar = document.createElement('div');
        toolbar.className = 'lumina-answer-edit-toolbar';
        toolbar.contentEditable = 'false';
        toolbar.innerHTML = `
            <button class="lumina-edit-btn lumina-edit-undo" title="Undo">Undo</button>
            <div class="lumina-edit-toolbar-spacer"></div>
            <button class="lumina-edit-btn lumina-edit-cancel" title="Cancel">Cancel</button>
            <button class="lumina-edit-btn lumina-edit-save" title="Save">Save</button>
        `;


        toolbar.onmousedown = (e) => e.preventDefault();


        toolbar.querySelector('.lumina-edit-undo').onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const entry = answerDiv.closest('.lumina-dict-entry');
            this._undoEditAndTruncate(entry, 'answer', null, answerDiv);
        };

        toolbar.querySelector('.lumina-edit-cancel').onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.exitAnswerEditMode(answerDiv, false);
        };

        toolbar.querySelector('.lumina-edit-save').onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.exitAnswerEditMode(answerDiv, true);
        };

        answerDiv.appendChild(toolbar);

        const entry = answerDiv.closest('.lumina-dict-entry');
        if (entry) {
            requestAnimationFrame(() => {
                const scrollContainer = this.getScrollContainer();
                if (!scrollContainer) return;
                const paddingTop = parseFloat(window.getComputedStyle(scrollContainer).paddingTop) || 0;
                this._scrollElementToTop(entry, paddingTop);
            });
        }


        const keyHandler = (e) => {
            if (e.key === 'Escape') {
                this.exitAnswerEditMode(answerDiv, false);
                contentDiv.removeEventListener('keydown', keyHandler);
            } else if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.exitAnswerEditMode(answerDiv, true);
                contentDiv.removeEventListener('keydown', keyHandler);
            }
        };
        contentDiv.addEventListener('keydown', keyHandler);


        setTimeout(() => {
            if (!answerDiv.classList.contains('lumina-answer-editing')) return;
            const outsideClickListener = (e) => {
                if (!answerDiv.contains(e.target)) {
                    this.exitAnswerEditMode(answerDiv, false);
                }
            };
            document.addEventListener('mousedown', outsideClickListener);
            answerDiv.__outsideClickListener = outsideClickListener;
        }, 10);
    }

    exitAnswerEditMode(answerDiv, save = false) {
        if (!answerDiv || !answerDiv.classList.contains('lumina-answer-editing')) return;


        if (answerDiv.__outsideClickListener) {
            document.removeEventListener('mousedown', answerDiv.__outsideClickListener);
            delete answerDiv.__outsideClickListener;
        }

        const contentDiv = answerDiv.querySelector('.lumina-answer-content') || answerDiv;
        const toolbar = answerDiv.querySelector('.lumina-answer-edit-toolbar');

        if (save) {
            const newText = contentDiv.innerText.trim();
            answerDiv.dataset.rawText = newText;

            answerDiv.__lastRenderedText = '';
            this._doRender(answerDiv, true);

            console.log('[Lumina] Answer saved:', newText);

            const entry = answerDiv.closest('.lumina-dict-entry');
            if (entry) {
                entry.dataset.timestamp = Date.now().toString();
            }

            if (this.historyEl) {
                this.historyEl.dispatchEvent(new CustomEvent('lumina:history-changed', {
                    bubbles: true,
                    detail: { force: true }
                }));
            }
        } else {

            contentDiv.innerHTML = answerDiv.__originalHTML;
            answerDiv.dataset.rawText = answerDiv.__originalRaw;
        }

        answerDiv.classList.remove('is-editing', 'lumina-answer-editing');
        contentDiv.contentEditable = 'false';
        if (toolbar) toolbar.remove();

        delete answerDiv.__originalHTML;
        delete answerDiv.__originalRaw;
    }

    cancelAllAnswerEdits() {
        if (!this.historyEl) return;
        const editingAnswers = Array.from(this.historyEl.querySelectorAll('.lumina-chat-answer.lumina-answer-editing'));
        editingAnswers.forEach((answerDiv) => {
            this.exitAnswerEditMode(answerDiv, false);
        });
    }

    serializeHistoryHTML() {
        if (!this.historyEl) return '';

        const editingAnswers = Array.from(this.historyEl.querySelectorAll('.lumina-chat-answer.lumina-answer-editing'));
        const editingQuestions = Array.from(this.historyEl.querySelectorAll('.lumina-chat-question.lumina-question-editing'));
        if (editingAnswers.length === 0 && editingQuestions.length === 0) {
            return this.historyEl.innerHTML;
        }

        const clonedHistory = this.historyEl.cloneNode(true);
        const liveAnswers = Array.from(this.historyEl.querySelectorAll('.lumina-chat-answer'));
        const clonedAnswers = Array.from(clonedHistory.querySelectorAll('.lumina-chat-answer'));
        const liveQuestions = Array.from(this.historyEl.querySelectorAll('.lumina-chat-question'));
        const clonedQuestions = Array.from(clonedHistory.querySelectorAll('.lumina-chat-question'));

        editingAnswers.forEach((liveAnswer) => {
            const answerIndex = liveAnswers.indexOf(liveAnswer);
            const clonedAnswer = answerIndex >= 0 ? clonedAnswers[answerIndex] : null;
            if (!clonedAnswer) return;

            const clonedContent = clonedAnswer.querySelector('.lumina-answer-content') || clonedAnswer;
            if (typeof liveAnswer.__originalHTML === 'string') {
                clonedContent.innerHTML = liveAnswer.__originalHTML;
            }

            clonedAnswer.classList.remove('lumina-answer-editing');
            clonedAnswer.contentEditable = 'false';
            clonedContent.contentEditable = 'false';

            const clonedToolbar = clonedAnswer.querySelector('.lumina-answer-edit-toolbar');
            if (clonedToolbar) clonedToolbar.remove();
        });

        editingQuestions.forEach((liveQuestion) => {
            const questionIndex = liveQuestions.indexOf(liveQuestion);
            const clonedQuestion = questionIndex >= 0 ? clonedQuestions[questionIndex] : null;
            if (!clonedQuestion) return;

            const clonedRow = clonedQuestion.closest('.lumina-question-row');
            const clonedContent = clonedQuestion.querySelector('.lumina-question-content')
                || clonedQuestion.querySelector('div[contenteditable="true"]')
                || clonedQuestion;

            if (typeof liveQuestion.__originalHTML === 'string') {
                clonedContent.innerHTML = liveQuestion.__originalHTML;
            } else if (typeof liveQuestion.dataset?.rawText === 'string') {
                clonedContent.textContent = liveQuestion.dataset.rawText;
            }

            clonedQuestion.classList.remove('lumina-question-editing', 'lumina-answer-editing');
            if (clonedRow) clonedRow.classList.remove('lumina-question-row-editing');
            clonedContent.contentEditable = 'false';

            const clonedToolbar = clonedQuestion.querySelector('.lumina-question-edit-toolbar');
            if (clonedToolbar) clonedToolbar.remove();
        });


        clonedHistory.querySelectorAll('.lumina-dict-entry').forEach(entry => {
            entry.style.removeProperty('min-height');
        });

        return clonedHistory.innerHTML;
    }
    static async processContainer(container) {
        if (!container || container.__luminaProcessed) return;
        container.__luminaProcessed = true;
        const yieldToMain = () => new Promise(resolve => {
            if (typeof window !== 'undefined' && window.requestIdleCallback) {
                window.requestIdleCallback(() => resolve(), { timeout: 30 });
            } else {
                setTimeout(resolve, 1);
            }
        });
        if (typeof hljs !== 'undefined') {
            const blocks = Array.from(container.querySelectorAll('pre code'));
            for (const block of blocks) {
                await yieldToMain();
                try {
                    if (!block.__hljs_done) {
                        if (hljs.highlightElement) hljs.highlightElement(block);
                        else if (hljs.highlightBlock) hljs.highlightBlock(block);
                        block.__hljs_done = true;
                    }
                } catch (e) { }
            }
        }
        await yieldToMain();
        if (typeof renderMathInElement !== 'undefined') {
            const textContent = container.textContent;
            if (textContent.includes('$') || textContent.includes('\\(') || textContent.includes('\\[') || textContent.includes('\\begin')) {
                try {
                    await yieldToMain();
                    renderMathInElement(container, {
                        delimiters: [
                            { left: '$$', right: '$$', display: true },
                            { left: '\\[', right: '\\]', display: true },
                            { left: '$', right: '$', display: false },
                            { left: '\\(', right: '\\)', display: false }
                        ],
                        throwOnError: false
                    });
                } catch (e) { }
            }
        }
        await yieldToMain();
        container.querySelectorAll('a').forEach(link => {
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
        });
        await LuminaChatUI.injectCopyButtons(container);
        await yieldToMain();
        container.querySelectorAll('.lumina-thinking-container').forEach(c => {
            const header = c.querySelector('.lumina-thinking-header');
            if (header && !header.__thinkingToggleBound) {
                header.__thinkingToggleBound = true;
                header.addEventListener('click', () => c.classList.toggle('collapsed'));
            }
        });
        await yieldToMain();


        container.querySelectorAll('.lumina-translation-card').forEach(card => {
            const entry = card.closest('.lumina-dict-entry');
            if (entry && !entry.__translationHighlightDone) {
                LuminaChatUI._setupTranslationHighlight(entry);
                LuminaChatUI.balanceTranslationCard(entry, false);
                entry.__translationHighlightDone = true;
            }
        });
        await yieldToMain();

        let answerEls = Array.from(container.querySelectorAll('.lumina-chat-answer'));
        if (container.classList.contains('lumina-chat-answer')) {
            answerEls.push(container);
        }
        for (const ans of answerEls) {
            LuminaChatUI.injectAnswerActions(ans);
        }
        await yieldToMain();

        // Trigger async image processing
        processLuminaDynamicImageElements(container);
    }
    static async injectCopyButtons(container) {
        if (!container) return;
        LuminaChatUI.wrapTables(container);
        const yieldToMain = () => new Promise(resolve => setTimeout(resolve, 10));
        const COPY_SVG = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
        const CHECK_SVG = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
        const preBlocks = Array.from(container.querySelectorAll('pre'));
        for (const pre of preBlocks) {
            await yieldToMain();
            let wrapper = pre.parentElement && pre.parentElement.classList.contains('lumina-code-block-wrap')
                ? pre.parentElement
                : null;
            if (!wrapper) {
                wrapper = document.createElement('div');
                wrapper.className = 'lumina-code-block-wrap';
                pre.parentNode.insertBefore(wrapper, pre);
                wrapper.appendChild(pre);
            }
            pre.querySelectorAll('.lumina-code-copy-btn').forEach(old => old.remove());
            wrapper.querySelectorAll('.lumina-code-copy-btn').forEach(old => old.remove());
            const btn = document.createElement('button');
            btn.className = 'lumina-code-copy-btn';
            btn.innerHTML = COPY_SVG;
            const showSuccess = () => {
                btn.classList.add('copied');
                btn.innerHTML = CHECK_SVG;
                setTimeout(() => {
                    btn.classList.remove('copied');
                    btn.innerHTML = COPY_SVG;
                }, 2000);
            };
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const codeEl = pre.querySelector('code');
                const text = (codeEl ? codeEl.innerText : pre.innerText).trim();
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(text)
                        .then(showSuccess)
                        .catch(() => execCommandFallback(text));
                } else {
                    execCommandFallback(text);
                }
                function execCommandFallback(t) {
                    try {
                        const ta = document.createElement('textarea');
                        ta.value = t;
                        ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none;';
                        document.body.appendChild(ta);
                        ta.focus();
                        ta.select();
                        const ok = document.execCommand('copy');
                        ta.remove();
                        if (ok) showSuccess();
                    } catch (_) { }
                }
            });
            wrapper.appendChild(btn);
        }
    }
    static injectAnswerActions(answerDiv) {
        if (!answerDiv || answerDiv.querySelector('.lumina-actions')) return;

        const entry = answerDiv.closest('.lumina-dict-entry');
        if (entry) {
            const type = entry.dataset.entryType;
            if (type && type !== 'qa' && type !== 'chat') {
                return;
            }
        }

        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'lumina-actions';
        actionsDiv.innerHTML = `
            <button class="lumina-answer-action-btn" data-action="regenerate" title="Regenerate">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
            </button>
            <button class="lumina-answer-action-btn" data-action="copy" title="Copy">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            </button>
            <button class="lumina-answer-action-btn" data-action="edit" title="Edit">
                <span class="lumina-svg-icon lumina-icon-file-edit" aria-hidden="true"></span>
            </button>
        `;
        answerDiv.appendChild(actionsDiv);
    }
    static wrapTables(container) {
        if (!container) return;
        container.querySelectorAll('table').forEach(table => {
            if (table.parentElement && table.parentElement.classList.contains('lumina-table-wrap')) {
                return;
            }
            const wrapper = document.createElement('div');
            wrapper.className = 'lumina-table-wrap';
            table.parentNode.insertBefore(wrapper, table);
            wrapper.appendChild(table);
        });
    }

    showImagePreview(src, alt = '') {
        const existing = document.querySelector('.lumina-preview-container.fixed-preview');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.className = 'lumina-preview-container fixed-preview';

        const controls = document.createElement('div');
        controls.className = 'lumina-preview-controls-bar';
        controls.innerHTML = `
            <button class="lumina-preview-btn zoom-out-btn" title="Zoom Out">
                <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>
            </button>
            <span class="lumina-preview-scale">100%</span>
            <button class="lumina-preview-btn zoom-in-btn" title="Zoom In">
                <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>
            </button>
            <button class="lumina-preview-btn reset-btn" title="Reset Zoom">
                <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
            </button>
            <button class="lumina-preview-btn close-btn" title="Close (Esc)">
                <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
        `;

        const content = document.createElement('div');
        content.className = 'lumina-preview-content';

        const img = document.createElement('img');
        img.src = src;
        img.alt = 'Image Preview';
        img.className = 'lumina-preview-img';

        content.appendChild(img);
        overlay.appendChild(controls);
        overlay.appendChild(content);

        if (alt && alt !== 'diagram' && alt !== 'Image Preview') {
            const caption = document.createElement('div');
            caption.className = 'lumina-preview-caption';
            caption.addEventListener('click', (e) => e.stopPropagation());
            
            let captionText = alt;
            let sourceDomain = '';
            try {
                if (src && !src.startsWith('data:')) {
                    const urlObj = new URL(src);
                    sourceDomain = urlObj.hostname;
                }
            } catch (e) {}

            if (sourceDomain) {
                if (!captionText.endsWith('.')) {
                    captionText += '.';
                }
                captionText += ` Source: ${sourceDomain}`;
            }

            caption.textContent = captionText;
            overlay.appendChild(caption);
        }

        document.body.appendChild(overlay);

        let scale = 1;
        let isDragging = false;
        let startX = 0, startY = 0;
        let translateX = 0, translateY = 0;

        const updateTransform = () => {
            img.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
            const scalePct = overlay.querySelector('.lumina-preview-scale');
            if (scalePct) {
                scalePct.textContent = `${Math.round(scale * 100)}%`;
            }
            img.classList.toggle('zoomed', scale !== 1);
        };

        const zoom = (factor, centerX, centerY) => {
            const newScale = Math.min(Math.max(scale * factor, 0.15), 8);
            if (newScale === scale) return;

            if (centerX !== undefined && centerY !== undefined) {
                const rect = img.getBoundingClientRect();
                const mouseX = centerX - rect.left - rect.width / 2;
                const mouseY = centerY - rect.top - rect.height / 2;
                translateX -= mouseX * (newScale / scale - 1);
                translateY -= mouseY * (newScale / scale - 1);
            }
            scale = newScale;
            updateTransform();
        };

        const reset = () => {
            scale = 1;
            translateX = 0;
            translateY = 0;
            updateTransform();
        };

        overlay.querySelector('.zoom-in-btn').onclick = (e) => { e.stopPropagation(); zoom(1.25); };
        overlay.querySelector('.zoom-out-btn').onclick = (e) => { e.stopPropagation(); zoom(0.8); };
        overlay.querySelector('.reset-btn').onclick = (e) => { e.stopPropagation(); reset(); };

        content.addEventListener('wheel', (e) => {
            e.preventDefault();
            let delta = e.deltaY;
            let sensitivity = 0.005;
            if (e.ctrlKey) {
                // Trackpad pinch-to-zoom is faster with higher sensitivity
                sensitivity = 0.012;
            } else {
                // Regular mouse wheel
                sensitivity = 0.005;
            }
            // Clamp delta to prevent sudden huge zoom jumps
            delta = Math.max(-100, Math.min(100, delta));
            
            const factor = Math.exp(-delta * sensitivity);
            zoom(factor, e.clientX, e.clientY);
        }, { passive: false });

        img.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            if (scale > 1.1) {
                reset();
            } else {
                scale = 1.25;
                const rect = img.getBoundingClientRect();
                translateX = -(e.clientX - rect.left - rect.width / 2) * 0.25;
                translateY = -(e.clientY - rect.top - rect.height / 2) * 0.25;
                updateTransform();
            }
        });

        img.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            isDragging = true;
            img.classList.add('dragging');
            startX = e.clientX - translateX;
            startY = e.clientY - translateY;
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            translateX = e.clientX - startX;
            translateY = e.clientY - startY;
            updateTransform();
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
            img.classList.remove('dragging');
        });

        const close = () => {
            overlay.classList.remove('active');
            setTimeout(() => overlay.remove(), 250);
            document.removeEventListener('keydown', escHandler);
        };

        const escHandler = (e) => {
            if (e.key === 'Escape') close();
        };

        overlay.querySelector('.close-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            close();
        });
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay || e.target === content) {
                close();
            }
        });
        document.addEventListener('keydown', escHandler);

        requestAnimationFrame(() => {
            overlay.classList.add('active');
        });
    }
}

function extractMainContent(doc = document) {
    const docClone = doc.cloneNode(true);


    const selectorsToRemove = [
        'nav', 'footer', 'header', 'aside', 'script', 'style',
        'iframe', 'noscript', 'form', 'svg', 'canvas',
        '.ads', '#sidebar', '.sidebar', '.menu', '.navigation',
        '.footer', '.header', '.ad-box', '.social-share', '.comments',
        '[id^="lumina-"]', '[class^="lumina-"]'
    ];

    selectorsToRemove.forEach(s => {
        docClone.querySelectorAll(s).forEach(el => el.remove());
    });


    const mainSelectors = ['article', 'main', '[role="main"]', '.post-content', '.article-content', '.entry-content'];
    let contentEl = null;

    for (const s of mainSelectors) {
        const el = docClone.querySelector(s);
        if (el && el.innerText.trim().length > 200) {
            contentEl = el;
            break;
        }
    }


    if (!contentEl) contentEl = docClone.body;


    let text = contentEl.innerText || contentEl.textContent || "";


    text = text
        .replace(/[ \t]+/g, ' ')
        .replace(/\n\s*\n/g, '\n\n')
        .trim();

    return {
        url: window.location.href,
        title: document.title,
        content: text
    };
}


function luminaEstimateTokens(text) {
    if (!text) return 0;
    return Math.ceil(text.length / 3);
}


function luminaTruncateHistoryWindow(messages, maxTokens) {
    if (maxTokens === null || maxTokens < 0) return [...messages];

    const estimateFn = typeof window.luminaEstimateTokens === 'function'
        ? window.luminaEstimateTokens
        : (t => Math.ceil((t || '').length / 3));

    const result = [];
    let currentTokens = 0;

    for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        let pairTokens = estimateFn(msg.text || msg.content || '');
        const pair = [msg];


        if (msg.role === 'model' && i > 0 && messages[i - 1].role === 'user') {
            const userMsg = messages[i - 1];
            pairTokens += estimateFn(userMsg.text || userMsg.content || '');
            pair.unshift(userMsg);
            i--;
        }

        if (currentTokens + pairTokens > maxTokens) {
            break;
        }

        result.unshift(...pair);
        currentTokens += pairTokens;
    }

    return result;
}


if (typeof window !== 'undefined') {
    window.LuminaChatUI = LuminaChatUI;
    window.luminaExtractMainContent = extractMainContent;
    window.luminaEstimateTokens = luminaEstimateTokens;
    window.luminaTruncateHistoryWindow = luminaTruncateHistoryWindow;
}
