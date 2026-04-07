/**
 * Utility script for fetching YouTube transcripts via an external reliable service.
 * Implements persistent storage using chrome.storage.local with a 50-video rotation.
 */

const YoutubeUtils = {
    API_BASE: 'https://transcript.andreszenteno.com',
    MAX_CACHE_SIZE: 50,

    isYouTubeVideo: function (url) {
        return url?.includes('youtube.com/watch?v=');
    },

    getVideoId: function (url) {
        try {
            return new URL(url).searchParams.get('v');
        } catch (e) { return null; }
    },

    /**
     * Helper to get transcript from persistent storage.
     */
    getCachedTranscript: async function (videoId) {
        const key = `yt_transcript_${videoId}`;
        const data = await chrome.storage.local.get([key]);
        return data[key] || null;
    },

    /**
     * Main entry point to fetch transcript using lynote.ai
     */
    fetchTranscript: async function (videoId) {
        // 1. Check persistent cache first
        const cached = await this.getCachedTranscript(videoId);
        if (cached) {
            console.log(`[Lumina Youtube] Using persistent cache for ${videoId}`);
            return cached;
        }

        console.log(`[Lumina Youtube] Fetching API transcript for ${videoId} via lynote.ai`);

        const videoUrl = encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`);
        const lynoteUrl = `https://lynote.ai/api/youtube-service/youtube/youtubeVideoTranscriptInfo/getYouTubeTranScriptMessage?videoUrl=${videoUrl}`;

        const doFetch = async (isRetry = false) => {
            let cookiesData = await chrome.storage.local.get(['lynoteCookies']);
            let lynoteCookies = cookiesData.lynoteCookies;

            // Generate if none or if we are forcing a retry
            if (!lynoteCookies || isRetry) {
                const generateRandomHex = (length) => Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join('');
                lynoteCookies = {
                    anonymousId: `anon_${generateRandomHex(32)}`,
                    deviceId: `device_web_${generateRandomHex(32)}`
                };
                await chrome.storage.local.set({ lynoteCookies });
            }

            // Ensure cookies are correctly set in the browser
            if (typeof chrome !== 'undefined' && chrome.cookies && chrome.cookies.set) {
                await new Promise(resolve => chrome.cookies.set({ url: "https://lynote.ai", name: "anonymousId", value: lynoteCookies.anonymousId, path: "/" }, resolve));
                await new Promise(resolve => chrome.cookies.set({ url: "https://lynote.ai", name: "deviceId", value: lynoteCookies.deviceId, path: "/" }, resolve));
            }

            const res = await fetch(lynoteUrl, {
                method: 'GET',
                credentials: 'include',
                headers: { 'Accept': 'application/json, text/plain, */*' }
            });

            if (res.ok) {
                const payload = await res.json();
                if (payload.code === 200 && payload.data) {
                    return payload;
                } else if (!isRetry && payload.code !== 200) {
                    // Rate limit or error, let's retry with new cookie
                    console.log(`[Lumina Youtube] Lynote limit reached or error (code: ${payload.code}), retrying with new cookies...`);
                    return doFetch(true);
                } else {
                    console.error(`[Lumina Youtube] Failed fetch from lynote.ai, payload code: ${payload.code}`);
                }
            } else {
                console.error(`[Lumina Youtube] Failed fetch from lynote.ai, status: ${res.status}`);
            }
            return null;
        };

        try {
            const payload = await doFetch();

            if (payload && payload.code === 200 && payload.data) {
                const data = payload.data;
                const title = data.youtubeVideoBaseInfoDto?.title || videoId;

                let transcriptText = "";
                if (data.detailDtoList && data.detailDtoList.length > 0) {
                    data.detailDtoList.forEach(item => {
                        transcriptText += `[${item.startTimeText}] ${item.text}\n`;
                    });
                } else if (data.content) {
                    transcriptText = data.content;
                }

                if (transcriptText.trim()) {
                    console.log(`[Lumina Youtube] Transcript extracted successfully from lynote.ai`);
                    return await this.saveToPersistentCache(videoId, title, transcriptText.trim());
                }
            }
            return null;
        } catch (error) {
            console.error(`[Lumina Youtube] Fetch error:`, error);
            return null;
        }
    },

    /**
     * Saves transcript to chrome.storage.local and manages the 50-video rotation.
     */
    saveToPersistentCache: async function (videoId, title, transcript) {
        if (!transcript) return null;

        const transcriptKey = `yt_transcript_${videoId}`;
        const result = `[YouTube Video Transcript: ${title || 'Unknown'}]\n\n${transcript}`;

        // Get current tracking list
        const { yt_cache_tracker = [] } = await chrome.storage.local.get(['yt_cache_tracker']);

        // Remove existing entry for this video if it exists to refresh its position
        let newTracker = yt_cache_tracker.filter(id => id !== videoId);

        // Manage rotation (LRU - Least Recently Used)
        if (newTracker.length >= this.MAX_CACHE_SIZE) {
            const oldestId = newTracker.shift(); // Remove oldest
            await chrome.storage.local.remove([`yt_transcript_${oldestId}`]);
        }

        // Add current to the end
        newTracker.push(videoId);

        // Save everything
        await chrome.storage.local.set({
            [transcriptKey]: result,
            'yt_cache_tracker': newTracker
        });

        return result;
    }
};
