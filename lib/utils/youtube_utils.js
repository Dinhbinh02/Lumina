/**
 * Utility for YouTube interactions, specifically transcript fetching.
 * Simplified to rely on DOM-based extraction for reliability.
 */
const YoutubeUtils = {
    /**
     * Checks if a URL is a YouTube video.
     */
    isYouTubeVideo(url) {
        if (!url) return false;
        try {
            const urlObj = new URL(url);
            return (urlObj.hostname.includes('youtube.com') && urlObj.pathname === '/watch' && urlObj.searchParams.has('v')) ||
                (urlObj.hostname.includes('youtu.be') && urlObj.pathname.length > 1);
        } catch (e) {
            return false;
        }
    },

    /**
     * Extracts video ID from YouTube URL.
     */
    getVideoId(url) {
        if (!url) return null;
        try {
            const urlObj = new URL(url);
            if (urlObj.hostname.includes('youtube.com')) {
                return urlObj.searchParams.get('v');
            } else if (urlObj.hostname.includes('youtu.be')) {
                return urlObj.pathname.slice(1);
            }
        } catch (e) {
            return null;
        }
        return null;
    },

    /**
     * Tries to find transcript text directly from the rendered YouTube DOM.
     * This is useful if the user has already clicked "Show transcript".
     */
    getTranscriptFromDOM() {
        try {
            // Support both new "Modern" and "Legacy" transcript formats
            const selectors = [
                'transcript-segment-view-model',    // New modern layout
                'ytd-transcript-segment-renderer'   // Older layout
            ];
            
            let segments = [];
            for (const selector of selectors) {
                const found = document.querySelectorAll(selector);
                if (found.length > 0) {
                    segments = Array.from(found);
                    break;
                }
            }
            
            if (segments.length === 0) return null;

            const text = segments.map(seg => {
                // Try multiple text locations within the segment
                const textEl = seg.querySelector('.segment-text') || 
                               seg.querySelector('.yt-core-attributed-string') || 
                               seg.querySelector('span.ytAttributedStringHost') ||
                               seg;
                return textEl.textContent.trim();
            }).join(' ');

            if (text.length > 0) {
                return text.replace(/\s+/g, ' ').trim();
            }
            return null;
        } catch (e) {
            console.error('[Lumina] Error extracting transcript from DOM:', e);
            return null;
        }
    },

    /**
     * Legacy fetch logic. Replaced by getTranscriptFromDOM strategy.
     */
    async fetchTranscript(videoId) {
        // API-based fetching is removed to ensure reliability and avoid CORS/blocking issues
        return null;
    }
};

// Export to window for content script usage
if (typeof window !== 'undefined') {
    window.YoutubeUtils = YoutubeUtils;
}
