/**
 * YoutubeUtils - Completely using high-performance logic from the reference extension.
 * Replaces all legacy DOM-scraping with Direct API interaction.
 */
const YoutubeUtils = {
    /**
     * Checks if a URL is a YouTube video or Shorts.
     */
    isYouTubeVideo(url) {
        if (!url) return false;
        try {
            const urlObj = new URL(url);
            const isShorts = urlObj.pathname.startsWith('/shorts/');
            const isWatch = urlObj.pathname === '/watch' && urlObj.searchParams.has('v');
            const isMobile = urlObj.hostname === 'youtu.be' && urlObj.pathname.length > 1;
            return (urlObj.hostname.includes('youtube.com') && (isWatch || isShorts)) || isMobile;
        } catch (e) { return false; }
    },

    /**
     * Extracts video ID from any YouTube URL format.
     */
    getVideoId(url) {
        if (!url) return null;
        try {
            const urlObj = new URL(url);
            if (urlObj.hostname.includes('youtube.com')) {
                if (urlObj.pathname.startsWith('/shorts/')) {
                    return urlObj.pathname.split('/')[2].split(/[?#]/)[0];
                }
                return urlObj.searchParams.get('v');
            } else if (urlObj.hostname.includes('youtu.be')) {
                return urlObj.pathname.slice(1);
            }
        } catch (e) { }
        return null;
    },

    /**
     * The main entry point to fetch transcript.
     * Prioritizes local DOM data (0 network cost) before falling back to API.
     */
    async fetchTranscript(url) {
        const videoId = this.getVideoId(url);
        if (!videoId) return null;

        try {
            // 1. Try to extract data directly from DOM (Language Reactor approach)
            // This is nearly instantaneous and costs 0 bandwidth.
            let metadata = this._extractDataFromDOM();
            
            // 2. Fallback to network fetch only if not in content script or DOM missing
            if (!metadata) {
                console.log('[Lumina] Local data not found, falling back to fetch...');
                metadata = await this._fetchVideoPageData(url);
            }

            if (!metadata) return null;
            
            // 3. Attempt to fetch via InnerTube API (Modern & accurate)
            const transcriptData = await this._getTranscriptFromData(metadata.ytData, videoId);
            
            if (!transcriptData || transcriptData.length === 0) return null;

            // 4. Normalize multiple data formats into a single text block
            return this._normalizeTranscript(transcriptData);

        } catch (e) {
            console.error('[Lumina] Transcript extraction failed:', e);
            return null;
        }
    },

    /**
     * PRIVATE: Scans the active page for YouTube's initial data blobs.
     * This avoids a secondary network request if running in content script.
     */
    _extractDataFromDOM() {
        if (typeof document === 'undefined') return null;
        
        const scripts = document.getElementsByTagName('script');
        // Search backwards as metadata is often near the end or middle
        for (let i = scripts.length - 1; i >= 0; i--) {
            const content = scripts[i].textContent;
            if (!content) continue;

            // Prioritize player response (contains captions)
            if (content.includes('ytInitialPlayerResponse')) {
                const match = content.match(/ytInitialPlayerResponse\s*=\s*({.+?});/);
                if (match) {
                    const data = this._safeParse(match[1]);
                    if (data) return { ytData: data, isShorts: false };
                }
            }
            
            // Secondary: Initial data (contains transcript panel info)
            if (content.includes('ytInitialData')) {
                const match = content.match(/ytInitialData\s*=\s*({.+?});/);
                if (match) {
                    const data = this._safeParse(match[1]);
                    if (data) return { ytData: data, isShorts: true };
                }
            }
        }
        return null;
    },

    /**
     * PRIVATE: Fetches the data if DOM extraction is not possible.
     */
    async _fetchVideoPageData(url) {
        try {
            const html = await fetch(url).then(res => res.text());
            const extract = (name) => {
                const patterns = [
                    new RegExp(`${name}\\s*=\\s*({.+?});`),
                    new RegExp(`window\\["${name}"\\]\\s*=\\s*({.+?});`),
                    new RegExp(`${name}\\s*=\\s*({.+?})(?:var|let|const|$)`, 's')
                ];
                for (const pattern of patterns) {
                    const match = html.match(pattern);
                    if (match && match[1]) {
                        const data = this._safeParse(match[1]);
                        if (data) return data;
                    }
                }
                return null;
            };

            const playerResponse = extract('ytInitialPlayerResponse');
            const initialData = extract('ytInitialData');

            if (!playerResponse && !initialData) return null;

            return {
                ytData: playerResponse || initialData,
                isShorts: !playerResponse
            };
        } catch (e) { return null; }
    },

    /**
     * PRIVATE: Safe JSON parser for YouTube's often-messy embedded JSON.
     */
    _safeParse(jsonStr) {
        try {
            return JSON.parse(jsonStr);
        } catch (e) {
            // Fallback for cases where standard parse fails due to escaped chars
            try {
                return (new Function(`return ${jsonStr}`))();
            } catch (e2) { return null; }
        }
    },

    /**
     * PRIVATE: Orchestrates API calls based on available data.
     */
    async _getTranscriptFromData(ytData, videoId) {
        try {
            // Priority 1: InnerTube get_transcript endpoint
            let params = ytData?.engagementPanels?.find(p => 
                p.engagementPanelSectionListRenderer?.content?.continuationItemRenderer?.continuationEndpoint?.getTranscriptEndpoint
            )?.engagementPanelSectionListRenderer?.content?.continuationItemRenderer?.continuationEndpoint?.getTranscriptEndpoint?.params;

            // Fallback for Shorts or different UI versions
            if (!params) {
                params = ytData?.engagementPanels?.find(p => p.panelIdentifier === 'engagement-panel-transcript')
                    ?.engagementPanelSectionListRenderer?.content?.transcriptRenderer?.params;
            }

            if (params) {
                const visitorData = ytData.responseContext?.webResponseContextExtensionData?.ytConfigData?.visitorData;
                const body = {
                    context: {
                        client: {
                            hl: "en",
                            visitorData: visitorData,
                            clientName: "WEB",
                            clientVersion: "2." + new Date().toISOString().split('T')[0].replace(/-/g, '') + ".01.00"
                        }
                    },
                    params: params
                };

                const res = await fetch("https://www.youtube.com/youtubei/v1/get_transcript", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body)
                });

                if (res.ok) {
                    const json = await res.json();
                    const segments = json.actions?.[0]?.updateEngagementPanelAction?.content?.transcriptRenderer?.body?.transcriptBodyRenderer?.cueGroupRenderer?.cues
                        || json.actions?.[0]?.updateEngagementPanelAction?.content?.transcriptRenderer?.content?.transcriptSearchPanelRenderer?.body?.transcriptSegmentListRenderer?.initialSegments;
                    
                    if (segments) return segments;
                }
            }
        } catch (e) { }

        // Priority 2: Standalone TimedText API (High reliability)
        return await this._tryTimedText(ytData);
    },

    /**
     * PRIVATE: Fetches from the legacy TimedText endpoint using JSON3 format.
     */
    async _tryTimedText(ytData) {
        const captions = ytData?.captions?.playerCaptionsTracklistRenderer;
        const captionTracks = captions?.captionTracks;
        if (!captionTracks || !captionTracks[0]?.baseUrl) return null;

        // Use the first available track, prioritize English or manual if possible
        const track = captionTracks.find(t => t.languageCode === 'en' && t.kind !== 'asr') 
                   || captionTracks.find(t => t.languageCode === 'en')
                   || captionTracks[0];

        const res = await fetch(`${track.baseUrl}&fmt=json3`);
        if (res.ok) {
            const data = await res.json();
            return data.events?.filter(e => e.segs);
        }
        return null;
    },

    /**
     * PRIVATE: Converts raw API segments into a clean text string.
     */
    _normalizeTranscript(segments) {
        return segments.map(s => {
            // InnerTube format
            if (s.transcriptSegmentRenderer) {
                return s.transcriptSegmentRenderer.snippet?.runs?.map(r => r.text).join('') || '';
            }
            // InnerTube Cue format
            if (s.transcriptCueRenderer) {
                return s.transcriptCueRenderer.cue?.simpleText || '';
            }
            // TimedText format
            if (s.segs) {
                return s.segs.map(seg => seg.utf8).join('');
            }
            return '';
        }).join(' ').replace(/\s+/g, ' ').trim();
    }
};

// Export to context
if (typeof window !== 'undefined') { window.YoutubeUtils = YoutubeUtils; }
