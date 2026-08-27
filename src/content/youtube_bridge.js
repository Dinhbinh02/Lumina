import { YoutubeUtils } from '../helpers/youtube_utils.js';

export class YouTubeButtonManager {
    constructor() {
        this.button = null;
        this.copyButton = null;
        this.intervalId = null;
        this.currentVideoId = null;
        this.injectStyles();
        this.setupGlobalListener();
    }
    injectStyles() {
        if (document.getElementById('lumina-yt-styles')) return;
        const style = document.createElement('style');
        style.id = 'lumina-yt-styles';
        style.textContent = `
            button[aria-label="Ask"] .ytSpecButtonShapeNextIcon,
            button[title="Ask"] .ytSpecButtonShapeNextIcon,
            #lumina-yt-ask-btn .ytSpecButtonShapeNextIcon {
                display: none !important;
            }
            button[aria-label="Download"] .ytSpecButtonShapeNextIcon,
            button[title="Download"] .ytSpecButtonShapeNextIcon,
            #lumina-yt-copy-transcript-btn .ytSpecButtonShapeNextIcon {
                display: none !important;
            }
            
            button[aria-label="Ask"] .ytSpecButtonShapeNextButtonTextContent,
            button[title="Ask"] .ytSpecButtonShapeNextButtonTextContent,
            #lumina-yt-ask-btn .ytSpecButtonShapeNextButtonTextContent {
                font-size: 0 !important;
                display: inline-flex !important;
                align-items: center !important;
                height: 100% !important;
                vertical-align: middle !important;
            }
            button[aria-label="Ask"] .ytSpecButtonShapeNextButtonTextContent::before,
            button[title="Ask"] .ytSpecButtonShapeNextButtonTextContent::before,
            #lumina-yt-ask-btn .ytSpecButtonShapeNextButtonTextContent::before {
                content: "Ask Lumina" !important;
                font-size: 14px !important;
                display: inline-block !important;
                vertical-align: middle !important;
            }

            button[aria-label="Download"] .ytSpecButtonShapeNextButtonTextContent,
            button[title="Download"] .ytSpecButtonShapeNextButtonTextContent,
            #lumina-yt-copy-transcript-btn .ytSpecButtonShapeNextButtonTextContent {
                font-size: 0 !important;
                display: inline-flex !important;
                align-items: center !important;
                height: 100% !important;
                vertical-align: middle !important;
            }
            button[aria-label="Download"] .ytSpecButtonShapeNextButtonTextContent::before,
            button[title="Download"] .ytSpecButtonShapeNextButtonTextContent::before,
            #lumina-yt-copy-transcript-btn .ytSpecButtonShapeNextButtonTextContent::before {
                content: "Copy Transcript" !important;
                font-size: 14px !important;
                display: inline-block !important;
                vertical-align: middle !important;
            }

            #lumina-yt-copy-transcript-btn.is-fetching .ytSpecButtonShapeNextButtonTextContent::before {
                content: "Fetching..." !important;
            }
            #lumina-yt-copy-transcript-btn.is-copied .ytSpecButtonShapeNextButtonTextContent::before {
                content: "Copied!" !important;
            }
            #lumina-yt-copy-transcript-btn.is-error .ytSpecButtonShapeNextButtonTextContent::before {
                content: "Error!" !important;
            }
            #lumina-yt-copy-transcript-btn.is-not-found .ytSpecButtonShapeNextButtonTextContent::before {
                content: "No Transcript!" !important;
            }
        `;
        document.head.appendChild(style);
    }
    setupGlobalListener() {
        window.addEventListener('click', async (e) => {
            if (!window.location.hostname.includes('youtube.com')) return;
            
            const askBtn = e.target.closest('button[aria-label="Ask"], button[title="Ask"], #lumina-yt-ask-btn');
            if (askBtn) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                this.handleAction();
                return;
            }

            const copyBtn = e.target.closest('button[aria-label="Download"], button[title="Download"], #lumina-yt-copy-transcript-btn');
            if (copyBtn) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                this.handleCopyTranscript();
            }
        }, true);
    }
    init() {
        const videoId = this.getVideoId();
        if (!videoId) {
            this.removeButton();
            return;
        }
        this.currentVideoId = videoId;
        
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
        this.intervalId = setInterval(() => {
            this.injectButton();
        }, 1000);
        
        this.injectButton();
    }
    getVideoId() {
        const url = new URL(window.location.href);
        return url.searchParams.get('v') || (url.pathname.startsWith('/shorts/') ? url.pathname.split('/')[2] : null);
    }
    injectButton() {
        const nativeBtn = document.querySelector('button[aria-label="Ask"], button[title="Ask"]');
        if (nativeBtn && nativeBtn.id !== 'lumina-yt-ask-btn') {
            nativeBtn.id = 'lumina-yt-ask-btn';
            this.button = nativeBtn;
        }

        const downloadBtn = document.querySelector('button[aria-label="Download"], button[title="Download"]');
        if (downloadBtn && downloadBtn.id !== 'lumina-yt-copy-transcript-btn') {
            downloadBtn.id = 'lumina-yt-copy-transcript-btn';
            this.copyButton = downloadBtn;
        }
    }
    async handleCopyTranscript() {
        const btn = document.getElementById('lumina-yt-copy-transcript-btn');
        if (!btn) return;

        btn.classList.remove('is-copied', 'is-error', 'is-not-found');
        btn.classList.add('is-fetching');

        try {
            const transcript = await YoutubeUtils.fetchTranscript(window.location.href);
            btn.classList.remove('is-fetching');
            if (transcript) {
                await navigator.clipboard.writeText(transcript);
                btn.classList.add('is-copied');
            } else {
                btn.classList.add('is-not-found');
            }
        } catch (err) {
            console.error('[Lumina YT] Failed to copy transcript:', err);
            btn.classList.remove('is-fetching');
            btn.classList.add('is-error');
        }

        setTimeout(() => {
            const currentBtn = document.getElementById('lumina-yt-copy-transcript-btn');
            if (currentBtn) {
                currentBtn.classList.remove('is-fetching', 'is-copied', 'is-error', 'is-not-found');
            }
        }, 2000);
    }
    async handleAction() {
        const triggerInfo = {
            action: 'youtube_ask',
            timestamp: Date.now(),
            videoId: this.currentVideoId,
            url: window.location.href,
            title: document.title.replace(' - YouTube', '')
        };
        try {
            chrome.runtime.sendMessage({
                action: 'ensure_sidepanel_open',
                youtubeTrigger: triggerInfo
            });
        } catch (err) {
            console.error('[Lumina] Failed to open side panel:', err);
        }
    }
    removeButton() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.button = null;
        this.copyButton = null;
    }
}
