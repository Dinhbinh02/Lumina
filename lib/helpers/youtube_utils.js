
const YoutubeUtils = {
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
    async fetchTranscript(url) {
        const videoId = this.getVideoId(url);
        if (!videoId) return null;
        try {
            let metadata = this._extractDataFromDOM();
            if (!metadata) {
                console.log('[Lumina] Local data not found, falling back to fetch...');
                metadata = await this._fetchVideoPageData(url);
            }
            if (!metadata) return null;
            const transcriptData = await this._getTranscriptFromData(metadata.ytData, videoId);
            if (!transcriptData || transcriptData.length === 0) return null;
            return this._normalizeTranscript(transcriptData);
        } catch (e) {
            console.error('[Lumina] Transcript extraction failed:', e);
            return null;
        }
    },
    _extractDataFromDOM() {
        if (typeof document === 'undefined') return null;
        const scripts = document.getElementsByTagName('script');
        for (let i = scripts.length - 1; i >= 0; i--) {
            const content = scripts[i].textContent;
            if (!content) continue;
            if (content.includes('ytInitialPlayerResponse')) {
                const match = content.match(/ytInitialPlayerResponse\s*=\s*({.+?});/);
                if (match) {
                    const data = this._safeParse(match[1]);
                    if (data) return { ytData: data, isShorts: false };
                }
            }
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
    _safeParse(jsonStr) {
        try {
            return JSON.parse(jsonStr);
        } catch (e) {
            try {
                return (new Function(`return ${jsonStr}`))();
            } catch (e2) { return null; }
        }
    },
    async _getTranscriptFromData(ytData, videoId) {
        try {
            let params = ytData?.engagementPanels?.find(p =>
                p.engagementPanelSectionListRenderer?.content?.continuationItemRenderer?.continuationEndpoint?.getTranscriptEndpoint
            )?.engagementPanelSectionListRenderer?.content?.continuationItemRenderer?.continuationEndpoint?.getTranscriptEndpoint?.params;
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
        return await this._tryTimedText(ytData);
    },
    async _tryTimedText(ytData) {
        const captions = ytData?.captions?.playerCaptionsTracklistRenderer;
        const captionTracks = captions?.captionTracks;
        if (!captionTracks || !captionTracks[0]?.baseUrl) return null;
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
    _normalizeTranscript(segments) {
        return segments.map(s => {
            if (s.transcriptSegmentRenderer) {
                return s.transcriptSegmentRenderer.snippet?.runs?.map(r => r.text).join('') || '';
            }
            if (s.transcriptCueRenderer) {
                return s.transcriptCueRenderer.cue?.simpleText || '';
            }
            if (s.segs) {
                return s.segs.map(seg => seg.utf8).join('');
            }
            return '';
        }).join(' ').replace(/\s+/g, ' ').trim();
    }
};

if (typeof window !== 'undefined') { window.YoutubeUtils = YoutubeUtils; }
