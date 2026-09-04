import { NexusToken } from '../utils/token_utils.js';

let lastExtractedContent = null;
let lastExtractedUrl = "";
let lastExtractionTime = 0;

export function getVisibleText(node) {
    if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent;
    }
    if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
        let text = '';
        for (const child of node.childNodes) {
            text += getVisibleText(child);
        }
        return text;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const el = node;
    if (el.isConnected) {
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
            return '';
        }
    } else {
        if (el.style.display === 'none' || el.style.visibility === 'hidden' || el.style.opacity === '0') {
            return '';
        }
    }
    const tag = el.tagName.toLowerCase();
    if (['button', 'svg', 'mat-icon', 'script', 'style', 'noscript', 'img'].includes(tag)) {
        return '';
    }
    const classStr = typeof el.className === 'string' ? el.className.toLowerCase() : '';
    if (el.getAttribute('role') === 'button' ||
        classStr.includes('btn') ||
        classStr.includes('button')) {
        return '';
    }
    if (tag === 'a' && (
        el.classList.contains('btn') ||
        el.classList.contains('button') ||
        el.className.includes('btn ')
    )) {
        return '';
    }
    if (el.getAttribute('aria-hidden') === 'true') {
        return '';
    }
    const classNameStr = typeof el.className === 'string' ? el.className : (el.className?.baseVal || '');
    if (/\b(icon|material-icons|google-symbols|fa-|glyphicon|nexus-translation-divider|nexus-trans-actions)\b/i.test(classNameStr)) {
        return '';
    }
    let text = '';
    for (const child of el.childNodes) {
        text += getVisibleText(child);
    }
    if (['div', 'p', 'br', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'tr'].includes(tag)) {
        text = '\n' + text + '\n';
    }
    return text;
}

export function getActiveSelection(preferShadow = false, nexusShadowRoot = null) {
    if (preferShadow && nexusShadowRoot) {
        try {
            const shadowSel = (nexusShadowRoot.getSelection) ? nexusShadowRoot.getSelection() : null;
            if (shadowSel && shadowSel.rangeCount > 0 && shadowSel.toString().trim() !== '') {
                return shadowSel;
            }
        } catch (e) { }
    }
    let sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && sel.toString().trim() !== '') {
        return sel;
    }
    try {
        let active = document.activeElement;
        while (active && active.shadowRoot) {
            const shadowSel = active.shadowRoot.getSelection ? active.shadowRoot.getSelection() : null;
            if (shadowSel && shadowSel.rangeCount > 0 && shadowSel.toString().trim() !== '') {
                return shadowSel;
            }
            active = active.shadowRoot.activeElement;
        }
    } catch (e) { }
    if (!preferShadow && nexusShadowRoot) {
        try {
            const shadowSel = nexusShadowRoot.getSelection ? nexusShadowRoot.getSelection() : null;
            if (shadowSel && shadowSel.rangeCount > 0 && shadowSel.toString().trim() !== '') {
                return shadowSel;
            }
        } catch (e) { }
    }
    return sel;
}

export function getSmartSelectionText(nexusShadowRoot = null) {
    const sel = getActiveSelection(false, nexusShadowRoot);
    if (!sel || sel.rangeCount === 0) return '';
    const range = sel.getRangeAt(0);
    const fragment = range.cloneContents();
    let extracted = getVisibleText(fragment);
    extracted = extracted
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]+/g, ' ')
        .replace(/ ?\n ?/g, '\n')
        .trim();
    if (!extracted && sel.toString().trim()) {
        extracted = sel.toString().trim();
    }
    return extracted;
}

export function getSentenceContext(nexusShadowRoot = null) {
    const sel = getActiveSelection(false, nexusShadowRoot);
    if (!sel || sel.rangeCount === 0) return '';
    const range = sel.getRangeAt(0);
    let node = range.startContainer;
    if (!node) return '';
    const blockTags = ['P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'ARTICLE', 'SECTION', 'TR', 'TD'];
    let parent = node.nodeType === 3 ? node.parentNode : node;
    while (parent) {
        if (parent.nodeType === 11 && parent.host) {
            parent = parent.host;
            continue;
        }
        if (parent.tagName && blockTags.includes(parent.tagName)) {
            if (parent.id === 'nexus-host' || parent.id === 'nexus-shadow-host') {
                parent = parent.parentNode || parent.host;
                continue;
            }
            break;
        }
        parent = parent.parentNode || parent.host;
    }
    if (!parent) return sel.toString().trim();
    const text = parent.innerText || parent.textContent;
    const selectionText = sel.toString();
    if (!selectionText) return '';
    const preSelectionRange = range.cloneRange();
    preSelectionRange.selectNodeContents(parent);
    preSelectionRange.setEnd(range.startContainer, range.startOffset);
    const index = preSelectionRange.toString().length;
    const before = text.substring(0, index);
    const after = text.substring(index + selectionText.length);
    const markers = before.match(/.*[.!?](?:\s|$)/);
    const start = markers ? markers[0].length : 0;
    const nextMarkers = after.match(/.*?[.!?](?:\s|$)/);
    const end = nextMarkers ? index + selectionText.length + nextMarkers[0].length : text.length;
    return text.substring(start, end).trim();
}

export function getParagraphContext(nexusShadowRoot = null) {
    const sel = getActiveSelection(false, nexusShadowRoot);
    if (!sel || sel.rangeCount === 0) return '';
    const range = sel.getRangeAt(0);
    let node = range.startContainer;
    if (!node) return '';
    const blockTags = ['P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'ARTICLE', 'SECTION', 'TR', 'TD'];
    let parent = node.nodeType === 3 ? node.parentNode : node;
    while (parent) {
        if (parent.nodeType === 11 && parent.host) {
            parent = parent.host;
            continue;
        }
        if (parent.tagName && blockTags.includes(parent.tagName)) {
            if (parent.id === 'nexus-host' || parent.id === 'nexus-shadow-host') {
                parent = parent.parentNode || parent.host;
                continue;
            }
            break;
        }
        parent = parent.parentNode || parent.host;
    }
    if (!parent) return sel.toString().trim();
    return (parent.innerText || parent.textContent).trim();
}

export async function extractMainContent(doc = document, forceRefresh = false) {
    const url = window.location.href;
    const now = Date.now();
    if (!forceRefresh && lastExtractedContent && lastExtractedUrl === url && (now - lastExtractionTime < 2000)) {
        return lastExtractedContent;
    }
    const isPossiblyEmptySPA = () => {
        const text = (doc.body ? doc.body.innerText : "") || "";
        const hasAppRoot = doc.querySelector('#root') || doc.querySelector('#app') || doc.querySelector('div[id*="app"]');
        const isVite = doc.querySelector('script[type="module"]');
        const hasSpinner = doc.querySelector('.spoke-spinner') || doc.querySelector('.ant-spin') || doc.querySelector('.loading-spinner');
        const hasLMS = doc.querySelector('.lms-container') || doc.querySelector('.dol-content') || doc.querySelector('[class*="passage"]');
        const isEducationSite = url.includes('dolenglish') || url.includes('ielts') || url.includes('education');
        const minThreshold = isEducationSite ? 1000 : 600;
        return (text.length < minThreshold && (hasAppRoot || isVite || hasLMS)) || hasSpinner;
    };
    const shouldDelay = !forceRefresh && isPossiblyEmptySPA();
    if (shouldDelay) {
        await new Promise(r => setTimeout(r, 1500));
    }
    let retries = 0;
    const maxRetries = forceRefresh ? 0 : 2;
    let finalOutput = null;
    while (retries <= maxRetries) {
        finalOutput = await performExtraction(doc, url);
        if (finalOutput && finalOutput.content && finalOutput.content.length > 500) {
            break;
        }
        if (retries < maxRetries) {
            await new Promise(r => setTimeout(r, 1000));
        }
        retries++;
    }
    lastExtractedContent = finalOutput;
    lastExtractedUrl = url;
    lastExtractionTime = Date.now();
    return finalOutput;
}

export async function performExtraction(doc, url) {
    let result = {
        url: url,
        title: document.title,
        content: ""
    };
    try {
        const TurndownCls = typeof TurndownService !== 'undefined' ? TurndownService : null;
        let turndownService = null;
        if (TurndownCls) {
            turndownService = new TurndownCls({
                headingStyle: 'atx',
                codeBlockStyle: 'fenced'
            });
            turndownService.remove(['script', 'style', 'noscript', 'iframe', 'svg', 'button', 'audio', 'video', 'canvas', 'map', 'area', 'img[alt*="logo" i]']);
        }
        const normalize = (s) => (s || "").toLowerCase().replace(/\s+/g, ' ').trim();
        let finalMarkdown = `[Context Source: ${document.title}]\nURL: ${url}\n\n`;
        let normalizedCaptured = "";
        const MIN_TEXT_LENGTH = 50;
        const SCRAP_TAGS = [
            'script', 'style', 'nav', 'footer', 'header', 'noscript', 'aside', 'svg', 'button', 'audio', 'video',
            '.menu', '.sidebar', '.navbar', '.header', '.footer', '[class*="header" i]', '[class*="footer" i]',
            '[class*="nav" i]', '[class*="menu" i]', '[class*="sidebar" i]', '[class*="feedback" i]',
            '[class*="upgrade" i]', '[class*="timer" i]', '[class*="modal" i]', '[class*="user-nav" i]',
            '[class*="promo" i]', '[class*="ads" i]', '[class*="banner" i]', '[class*="social" i]',
            '[class*="related" i]', '[class*="breadcrumb" i]', '[class*="auth" i]', '[class*="login" i]',
            '[class*="account" i]', '[class*="profile" i]', '[class*="expire" i]', '[class*="notification" i]',
            '[class*="contact" i]', '[class*="hotline" i]', '[class*="address" i]', '[class*="popup" i]',
            '[class*="overlay" i]', '[class*="tooltip" i]', '[class*="download" i]', '[class*="comment" i]',
            '[class*="review" i]', '[class*="share" i]', '[class*="cookie" i]', '[class*="gdpr" i]',
            '[class*="logo" i]', '[class*="topbar" i]', '[class*="fixed" i]', '[class*="section-header" i]',
            '#feedback-modal', '.nexus-ignore', '[role="navigation"]', '[role="contentinfo"]',
            '.dol-breadcrumb', '.breadcrumb-container', '.landing-header', '.footer-nested-links',
            '.socialButtonGroup', '.referral-share-banner', '#__NEXT_DATA__', '.rowLink', '.nav-item',
            '.LandingHeader__Main-sc-vzeq2b-0', '.LandingLayout__Main-sc-1plzfds-0', '.TopbarNavList__Main-sc-tbxqf6-1'
        ];
        const findCandidates = (root) => {
            const HIGH_LEVEL_WRAPPERS = ['html', 'body', '#__next', '#app-root', '.app-wrapper', '.app-container', '.main-wrapper', '.layout-wrapper'];
            let found = Array.from(root.querySelectorAll('article, main, section, [class*="content"], [id*="content"], [class*="article"], [class*="main"], [class*="reading"], [class*="passage"], [class*="question"], [class*="exercise"], [class*="practice"], [id*="reading"], [id*="passage"], div, p'));
            found = found.filter(el => {
                const isWrapper = HIGH_LEVEL_WRAPPERS.some(sel => el.matches(sel));
                if (isWrapper) return false;
                if (el.parentElement && (el.parentElement.tagName === 'BODY' || el.parentElement.id === '__next')) {
                    if (!el.matches('article, main, section')) return false;
                }
                return true;
            });
            const all = root.querySelectorAll('*');
            for (const el of all) {
                if (el.shadowRoot) {
                    found = found.concat(findCandidates(el.shadowRoot));
                }
            }
            return found;
        };
        const candidates = findCandidates(doc);
        candidates.sort((a, b) => {
            const aIsPrimary = a.matches('article, main, [class*="article"], [id*="article"], [class*="reading"], [class*="passage"], [class*="question"]');
            const bIsPrimary = b.matches('article, main, [class*="article"], [id*="article"], [class*="reading"], [class*="passage"], [class*="question"]');
            if (aIsPrimary && !bIsPrimary) return -1;
            if (!aIsPrimary && bIsPrimary) return 1;
            return (b.innerText?.length || 0) - (a.innerText?.length || 0);
        });
        let segmentsCount = 0;
        candidates.forEach(el => {
            if (!el || !el.isConnected) return;
            if (el.closest(SCRAP_TAGS.join(','))) return;
            const text = (el.innerText || el.textContent || "").trim();
            if (text.length < MIN_TEXT_LENGTH) return;
            const linkCount = el.querySelectorAll('a').length;
            if (linkCount > 2 && text.length / linkCount < 50) return;
            const normText = normalize(text);
            const startFingerprint = normText.slice(0, 150);
            if (startFingerprint && normalizedCaptured.includes(startFingerprint)) return;
            if (normText.length > 200 && normalizedCaptured.includes(normText.substring(50, 200))) return;
            const html = el.innerHTML || "";
            const density = text.length / (html.length + 1);
            const isEducationBlock = el.matches('[class*="question"], [class*="reading"], [class*="passage"], [class*="exercise"], [class*="practice"]');
            if (text.split('\n').length < 3 && linkCount > 1 && !isEducationBlock) return;
            if (density > 0.05 || el.matches('article, main, p, [class*="content"]') || isEducationBlock) {
                const blockMarkdown = turndownService ? turndownService.turndown(html).trim() : text;
                if (blockMarkdown && blockMarkdown.length > 20) {
                    segmentsCount++;
                    finalMarkdown += `\n\n--- [Segment ${segmentsCount}] ---\n\n` + blockMarkdown;
                    normalizedCaptured += " " + normText;
                }
            }
        });
        result.content = segmentsCount > 0 ? finalMarkdown : `[Fallback Page Text]:\n${doc.body ? doc.body.innerText : ''}`;
        return result;
    } catch (error) {
        console.error('[Nexus] Content extraction failed:', error);
        result.content = `[Extraction Error]: ${error.message}`;
    }
    lastExtractedContent = result;
    lastExtractedUrl = url;
    return result;
}

export function nexusEstimateTokens(text) {
    if (!text) return 0;
    if (typeof NexusToken !== 'undefined') {
        return NexusToken.count(text);
    }
    return Math.ceil(text.length / 4);
}

if (typeof window !== 'undefined') {
    window.nexusExtractMainContent = extractMainContent;
    window.nexusEstimateTokens = nexusEstimateTokens;
}
