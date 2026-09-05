/**
 * dynamic_renderer.js - Universal Post-Render Dynamic Hydrator for Nexus
 * Unifies async image search/loading, Chart.js rendering, and interactive widget hydration.
 * Ensures consistent skeleton shimmer animations and error fallbacks across all dynamic blocks.
 */

import { WidgetRunner } from '../widgets/widget_runner.js';

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

        const applyResult = (result) => {
            const wrapper = img.closest('.nexus-image-wrapper');
            if (result && result.fallbackUrls) {
                img.dataset.fallbackUrls = JSON.stringify(result.fallbackUrls);
            }
            img.onload = () => {
                if (wrapper) wrapper.classList.remove('is-loading');
                img.style.opacity = '1';
            };
            img.onerror = () => {
                if (wrapper) wrapper.classList.remove('is-loading');
                img.style.display = 'none';
            };
            img.src = result ? result.url : '';
        };

        if (nexusResolvedImagesCache.has(cleanQuery)) {
            try {
                const cachedResult = await nexusResolvedImagesCache.get(cleanQuery);
                applyResult(cachedResult);
            } catch (err) {
                const wrapper = img.closest('.nexus-image-wrapper');
                if (wrapper) wrapper.classList.remove('is-loading');
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
            applyResult(result);
        } catch (err) {
            const wrapper = img.closest('.nexus-image-wrapper');
            if (wrapper) wrapper.classList.remove('is-loading');
            img.src = '';
            img.style.display = 'none';
        }
    });
}

/**
 * Renders a Chart.js canvas wrapper
 * @param {HTMLElement} wrapper - Wrapper element with data-chartjs-config
 */
export function renderChartJSWrapper(wrapper) {
    const configAttr = wrapper.getAttribute('data-chartjs-config');
    if (!configAttr) {
        wrapper.classList.remove('is-loading');
        return;
    }
    if (wrapper.getAttribute('data-last-rendered-source') === configAttr) return;
    const chatAnswer = wrapper.closest('.nexus-chat-answer');
    if (chatAnswer && chatAnswer.classList.contains('streaming')) return;
    const rawConfig = configAttr
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
    let config;
    try {
        config = JSON.parse(rawConfig);
    } catch (_) {
        return;
    }
    wrapper.setAttribute('data-last-rendered-source', configAttr);
    requestAnimationFrame(() => {
        try {
            if (typeof Chart === 'undefined') {
                if (typeof window.ensureChartLoaded === 'function') {
                    window.ensureChartLoaded().then(() => {
                        renderChartJSWrapper(wrapper);
                    }).catch(() => {
                        wrapper.removeAttribute('data-last-rendered-source');
                        setTimeout(() => renderChartJSWrapper(wrapper), 300);
                    });
                }
                return;
            }
            const isDark = document.documentElement.getAttribute('data-theme') === 'dark' ||
                document.body.getAttribute('data-theme') === 'dark';
            config.options = config.options || {};
            config.options.plugins = config.options.plugins || {};
            config.options.animation = config.options.animation !== false
                ? { duration: 600, easing: 'easeOutQuart' }
                : false;
            config.options.responsive = true;
            config.options.maintainAspectRatio = true;

            let canvas = wrapper.querySelector('canvas');
            if (!canvas) {
                wrapper.innerHTML = '';
                canvas = document.createElement('canvas');
                wrapper.appendChild(canvas);
            }
            wrapper.classList.remove('is-loading');
            const ctx = canvas.getContext('2d');
            if (wrapper._chartInstance) {
                wrapper._chartInstance.destroy();
            }
            wrapper._chartInstance = new Chart(ctx, config);
        } catch (e) {
            wrapper.classList.remove('is-loading');
        }
    });
}

/**
 * Processes all chart elements in a container
 * @param {HTMLElement} rootNode 
 */
export function processNexusChartElements(rootNode) {
    if (!rootNode) return;
    const wrappers = [];
    if (rootNode.classList && rootNode.classList.contains('nexus-chartjs-wrapper')) {
        wrappers.push(rootNode);
    }
    if (rootNode.querySelectorAll) {
        rootNode.querySelectorAll('.nexus-chartjs-wrapper').forEach(w => wrappers.push(w));
    }
    wrappers.forEach(w => renderChartJSWrapper(w));
}

/**
 * Universal Hydrator: Single entry point to hydrate all dynamic elements
 * (Images, Charts, Interactive Widgets) inside a rendered container.
 * @param {HTMLElement} container 
 */
export function hydrateDynamicContent(container) {
    if (!container) return;
    processNexusDynamicImageElements(container);
    processNexusChartElements(container);
    if (typeof WidgetRunner !== 'undefined' && typeof WidgetRunner.hydrateWidgets === 'function') {
        WidgetRunner.hydrateWidgets(container);
    }
}

export const DynamicRenderer = {
    searchGoogleImages,
    processImages: processNexusDynamicImageElements,
    renderChart: renderChartJSWrapper,
    processCharts: processNexusChartElements,
    hydrate: hydrateDynamicContent
};

if (typeof window !== 'undefined') {
    window.processNexusDynamicImageElements = processNexusDynamicImageElements;
    window._renderChartJSWrapper = renderChartJSWrapper;
    window.processNexusChartElements = processNexusChartElements;
    window.hydrateDynamicContent = hydrateDynamicContent;
    window.DynamicRenderer = DynamicRenderer;
}
