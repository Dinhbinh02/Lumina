(() => {
  // src/shared/constants.js
  var LUMINA_DEFAULTS = {
    provider: "groq",
    groqModel: "llama3-8b-8192",
    geminiModel: "gemini-2.5-flash-lite",
    openrouterModel: "openai/gpt-4o-mini",
    responseLanguage: "en",
    disabledDomains: [],
    maxContextTokens: null,
    readWebpage: true,
    reasoningMode: false
  };
  var LUMINA_PROVIDERS = {
    groq: {
      link: "https://console.groq.com/keys",
      modelsUrl: "https://api.groq.com/openai/v1/models",
      defaultModel: "llama3-8b-8192"
    },
    gemini: {
      link: "https://aistudio.google.com/app/apikey",
      modelsUrl: "https://generativelanguage.googleapis.com/v1beta/models",
      defaultModel: "gemini-2.0-flash-exp"
    },
    openrouter: {
      link: "https://openrouter.ai/keys",
      modelsUrl: "https://openrouter.ai/api/v1/models",
      defaultModel: "openai/gpt-4o-mini"
    },
    cerebras: {
      link: "https://cloud.cerebras.ai/platform",
      modelsUrl: "https://api.cerebras.ai/v1/models",
      defaultModel: "llama3.1-8b"
    },
    mistral: {
      link: "https://console.mistral.ai/api-keys",
      modelsUrl: "https://api.mistral.ai/v1/models",
      defaultModel: "mistral-small-latest"
    }
  };
  var LUMINA_DEFAULT_SHORTCUTS = {
    luminaChat: { key: "Space", modifiers: ["Alt"] },
    askLumina: { key: "L", modifiers: ["Alt"] },
    audio: { key: "Shift", modifiers: [] },
    translate: { key: "T", modifiers: ["Alt"] },
    micToggle: { key: "M", modifiers: ["Alt"] },
    translateInput: { key: "E", modifiers: ["Alt"] },
    retry: { key: "R", modifiers: ["Alt"] },
    annotationShortcuts: [
      { key: "h", code: "KeyH", color: "#FFFB78" }
    ]
  };
  function escapeHtml(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function getTodayString() {
    const now = /* @__PURE__ */ new Date();
    return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
  }
  function getKeysArray(keyStr) {
    if (!keyStr) return [];
    return keyStr.split(",").map((k) => k.trim()).filter((k) => k.length > 0);
  }
  var SUPPORTED_MIME_TYPES = /* @__PURE__ */ new Set([
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/heic",
    "image/heif",
    "image/gif",
    "video/mp4",
    "video/mpeg",
    "video/mov",
    "video/quicktime",
    "video/avi",
    "video/x-flv",
    "video/flv",
    "video/mpg",
    "video/webm",
    "video/wmv",
    "video/3gpp",
    "audio/wav",
    "audio/mp3",
    "audio/aiff",
    "audio/aac",
    "audio/ogg",
    "audio/flac",
    "audio/mpeg",
    "audio/m4a",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain",
    "text/html",
    "text/css",
    "text/javascript",
    "text/csv",
    "text/tsv",
    "text/tab-separated-values",
    "text/markdown",
    "text/x-python",
    "text/x-java",
    "text/x-c",
    "text/x-cpp",
    "text/x-shellscript",
    "application/json",
    "application/xml"
  ]);
  var MIME_ALIASES = {
    "application/javascript": "text/javascript",
    "text/x-python-script": "text/x-python",
    "application/x-javascript": "text/javascript"
  };
  var WEB_SOURCE_SELECTION_STORAGE_PREFIX = "lumina_web_selection_";
  function isWebPageUrl(url) {
    return typeof url === "string" && (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("chrome-extension://") && url.includes("?sid="));
  }
  if (typeof globalThis !== "undefined") {
    globalThis.LUMINA_DEFAULTS = LUMINA_DEFAULTS;
    globalThis.LUMINA_PROVIDERS = LUMINA_PROVIDERS;
    globalThis.LUMINA_DEFAULT_SHORTCUTS = LUMINA_DEFAULT_SHORTCUTS;
    globalThis.SUPPORTED_MIME_TYPES = SUPPORTED_MIME_TYPES;
    globalThis.MIME_ALIASES = MIME_ALIASES;
    globalThis.WEB_SOURCE_SELECTION_STORAGE_PREFIX = WEB_SOURCE_SELECTION_STORAGE_PREFIX;
    globalThis.isWebPageUrl = isWebPageUrl;
    globalThis.escapeHtml = escapeHtml;
    globalThis.getTodayString = getTodayString;
    globalThis.getKeysArray = getKeysArray;
  }

  // src/content/event_cleanup.js
  var EventCleanupManager = class {
    constructor() {
      this.listeners = /* @__PURE__ */ new WeakMap();
    }
    addEventListener(element, event, listener, options = false) {
      if (!element || !event || !listener) return;
      element.addEventListener(event, listener, options);
      if (!this.listeners.has(element)) {
        this.listeners.set(element, /* @__PURE__ */ new Map());
      }
      const elementListeners = this.listeners.get(element);
      if (!elementListeners.has(event)) {
        elementListeners.set(event, /* @__PURE__ */ new Set());
      }
      elementListeners.get(event).add({ listener, options });
    }
    removeEventListener(element, event, listener, options = false) {
      if (!element || !event || !listener) return;
      element.removeEventListener(event, listener, options);
      const elementListeners = this.listeners.get(element);
      if (elementListeners && elementListeners.has(event)) {
        const eventListeners = elementListeners.get(event);
        for (const item of eventListeners) {
          if (item.listener === listener) {
            eventListeners.delete(item);
            break;
          }
        }
      }
    }
    cleanupElement(element) {
      if (!element) return;
      const elementListeners = this.listeners.get(element);
      if (!elementListeners) return;
      for (const [event, listeners] of elementListeners) {
        for (const { listener, options } of listeners) {
          element.removeEventListener(event, listener, options);
        }
      }
      this.listeners.delete(element);
    }
    cleanupTree(container) {
      if (!container) return;
      this.cleanupElement(container);
      const allElements = container.querySelectorAll("*");
      allElements.forEach((element) => this.cleanupElement(element));
    }
  };

  // src/content/shadow_host.js
  var ShadowHostManager = class {
    constructor() {
      this.luminaHost = null;
      this.luminaShadowRoot = null;
      this.dictPlusObserver = null;
      this.cachedTheme = null;
      this.cachedAccent = null;
      this.cachedContrast = null;
    }
    init() {
      if (this.luminaHost || document.getElementById("lumina-host") || document.getElementById("lumina-shadow-host")) {
        this.luminaHost = document.getElementById("lumina-host") || document.getElementById("lumina-shadow-host");
        this.luminaShadowRoot = this.luminaHost ? this.luminaHost.shadowRoot : null;
        return { host: this.luminaHost, shadowRoot: this.luminaShadowRoot };
      }
      this.luminaHost = document.createElement("div");
      this.luminaHost.id = "lumina-shadow-host";
      this.luminaHost.style.cssText = "position: fixed; top: 0; left: 0; width: 0; height: 30px; z-index: 2147483647; pointer-events: none; border: none; padding: 0; margin: 0; overflow: visible;";
      this.luminaShadowRoot = this.luminaHost.attachShadow({ mode: "open" });
      (document.documentElement || document.body).appendChild(this.luminaHost);
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = chrome.runtime.getURL("assets/styles/styles.css");
      this.luminaShadowRoot.appendChild(link);
      const katexLink = document.createElement("link");
      katexLink.rel = "stylesheet";
      katexLink.href = chrome.runtime.getURL("lib/vendor/katex/katex.min.css");
      this.luminaShadowRoot.appendChild(katexLink);
      this.applyAskSelectionStyles();
      this.initThemeObserver();
      this.updateTheme();
      return { host: this.luminaHost, shadowRoot: this.luminaShadowRoot };
    }
    applyAskSelectionStyles() {
      chrome.storage.local.get(["fontSize", "fontSizeByDomain", "globalDefaults"], (items) => {
        const currentDomain = window.location.hostname;
        let baseFontSize = 13;
        if (items.fontSizeByDomain && items.fontSizeByDomain[currentDomain]) {
          baseFontSize = items.fontSizeByDomain[currentDomain];
        } else if (items.globalDefaults && items.globalDefaults.fontSize) {
          baseFontSize = items.globalDefaults.fontSize;
        } else if (items.fontSize) {
          baseFontSize = items.fontSize;
        }
        if (this.luminaHost) {
          this.luminaHost.style.setProperty("font-size", baseFontSize + "px", "important");
        }
        document.documentElement.style.setProperty("--lumina-fontSize", baseFontSize + "px", "important");
      });
    }
    updateTheme() {
      const applyThemeSettings = (theme, accent, contrast) => {
        const preferredTheme = theme === "auto" ? window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light" : theme;
        const isDark = preferredTheme === "dark";
        if (this.luminaHost) {
          if (isDark) {
            this.luminaHost.setAttribute("data-theme", "dark");
          } else {
            this.luminaHost.removeAttribute("data-theme");
          }
          this.luminaHost.setAttribute("data-accent", accent || "default");
          this.luminaHost.setAttribute("data-contrast", contrast || "auto");
        }
        const overlays = this.luminaShadowRoot ? this.luminaShadowRoot.querySelectorAll(".lumina-overlay") : [];
        overlays.forEach((el) => {
          if (isDark) {
            el.setAttribute("data-theme", "dark");
          } else {
            el.removeAttribute("data-theme");
          }
          el.setAttribute("data-accent", accent || "default");
          el.setAttribute("data-contrast", contrast || "auto");
        });
      };
      if (this.cachedTheme !== null && this.cachedAccent !== null && this.cachedContrast !== null) {
        applyThemeSettings(this.cachedTheme, this.cachedAccent, this.cachedContrast);
        return;
      }
      chrome.storage.local.get(["theme", "contrast", "accentColor", "globalDefaults"], (data) => {
        this.cachedTheme = data.theme || data.globalDefaults && data.globalDefaults.theme || "light";
        this.cachedContrast = data.contrast || data.globalDefaults && data.globalDefaults.contrast || "auto";
        this.cachedAccent = data.accentColor || data.globalDefaults && data.globalDefaults.accentColor || "default";
        applyThemeSettings(this.cachedTheme, this.cachedAccent, this.cachedContrast);
      });
    }
    initThemeObserver() {
      if (this.dictPlusObserver || !this.luminaShadowRoot) return;
      let debounceTimer = null;
      this.dictPlusObserver = new MutationObserver((mutations) => {
        const hasTopLevelChange = mutations.some(
          (m) => m.type === "childList" && m.addedNodes.length && m.target === this.luminaShadowRoot
        );
        if (!hasTopLevelChange) return;
        if (debounceTimer) return;
        debounceTimer = setTimeout(() => {
          debounceTimer = null;
          this.updateTheme();
        }, 200);
      });
      this.dictPlusObserver.observe(this.luminaShadowRoot, { childList: true, subtree: true });
    }
  };

  // src/helpers/youtube_utils.js
  var YoutubeUtils = {
    isYouTubeVideo(url) {
      if (!url) return false;
      try {
        const urlObj = new URL(url);
        const isShorts = urlObj.pathname.startsWith("/shorts/");
        const isWatch = urlObj.pathname === "/watch" && urlObj.searchParams.has("v");
        const isMobile = urlObj.hostname === "youtu.be" && urlObj.pathname.length > 1;
        return urlObj.hostname.includes("youtube.com") && (isWatch || isShorts) || isMobile;
      } catch (e) {
        return false;
      }
    },
    getVideoId(url) {
      if (!url) return null;
      try {
        const urlObj = new URL(url);
        if (urlObj.hostname.includes("youtube.com")) {
          if (urlObj.pathname.startsWith("/shorts/")) {
            return urlObj.pathname.split("/")[2].split(/[?#]/)[0];
          }
          return urlObj.searchParams.get("v");
        } else if (urlObj.hostname.includes("youtu.be")) {
          return urlObj.pathname.slice(1);
        }
      } catch (e) {
      }
      return null;
    },
    async fetchTranscript(url) {
      const videoId = this.getVideoId(url);
      if (!videoId) return null;
      try {
        let metadata = this._extractDataFromDOM();
        if (!metadata) {
          metadata = await this._fetchVideoPageData(url);
        }
        if (!metadata) return null;
        let transcriptData = await this._tryTimedText(metadata.ytData);
        if (!transcriptData || transcriptData.length === 0) {
          transcriptData = await this._getTranscriptFromData(metadata.ytData, videoId);
        }
        if (!transcriptData || transcriptData.length === 0) return null;
        return this._normalizeTranscript(transcriptData);
      } catch (e) {
        console.error("[Lumina] Transcript extraction failed:", e);
        return null;
      }
    },
    _extractJSON(html, prefix) {
      const index = html.indexOf(prefix);
      if (index === -1) return null;
      const startIndex = html.indexOf("{", index + prefix.length);
      if (startIndex === -1) return null;
      let braceCount = 0;
      let insideString = false;
      let escape = false;
      for (let i = startIndex; i < html.length; i++) {
        const char = html[i];
        if (escape) {
          escape = false;
          continue;
        }
        if (char === "\\") {
          escape = true;
          continue;
        }
        if (char === '"' || char === "'") {
          insideString = !insideString;
          continue;
        }
        if (!insideString) {
          if (char === "{") {
            braceCount++;
          } else if (char === "}") {
            braceCount--;
            if (braceCount === 0) {
              const jsonStr = html.slice(startIndex, i + 1);
              return this._safeParse(jsonStr);
            }
          }
        }
      }
      return null;
    },
    _extractDataFromDOM() {
      if (typeof document === "undefined") return null;
      const scripts = document.getElementsByTagName("script");
      for (let i = scripts.length - 1; i >= 0; i--) {
        const content = scripts[i].textContent;
        if (!content) continue;
        if (content.includes("ytInitialPlayerResponse")) {
          const data = this._extractJSON(content, "ytInitialPlayerResponse");
          if (data) return { ytData: data, isShorts: false };
        }
        if (content.includes("ytInitialData")) {
          const data = this._extractJSON(content, "ytInitialData");
          if (data) return { ytData: data, isShorts: true };
        }
      }
      return null;
    },
    async _fetchVideoPageData(url) {
      try {
        const html = await fetch(url).then((res) => res.text());
        const playerResponse = this._extractJSON(html, "ytInitialPlayerResponse");
        const initialData = this._extractJSON(html, "ytInitialData");
        if (!playerResponse && !initialData) return null;
        return {
          ytData: playerResponse || initialData,
          isShorts: !playerResponse
        };
      } catch (e) {
        return null;
      }
    },
    _safeParse(jsonStr) {
      try {
        return JSON.parse(jsonStr);
      } catch (e) {
        try {
          return new Function(`return ${jsonStr}`)();
        } catch (e2) {
          return null;
        }
      }
    },
    async _getTranscriptFromData(ytData, videoId) {
      try {
        let params = ytData?.engagementPanels?.find(
          (p) => p.engagementPanelSectionListRenderer?.content?.continuationItemRenderer?.continuationEndpoint?.getTranscriptEndpoint
        )?.engagementPanelSectionListRenderer?.content?.continuationItemRenderer?.continuationEndpoint?.getTranscriptEndpoint?.params;
        if (!params) {
          params = ytData?.engagementPanels?.find((p) => p.panelIdentifier === "engagement-panel-transcript")?.engagementPanelSectionListRenderer?.content?.transcriptRenderer?.params;
        }
        if (params) {
          const visitorData = ytData.responseContext?.webResponseContextExtensionData?.ytConfigData?.visitorData;
          const body = {
            context: {
              client: {
                hl: "en",
                visitorData,
                clientName: "WEB",
                clientVersion: "2." + (/* @__PURE__ */ new Date()).toISOString().split("T")[0].replace(/-/g, "") + ".01.00"
              }
            },
            params
          };
          const res = await fetch("https://www.youtube.com/youtubei/v1/get_transcript", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
          });
          if (res.ok) {
            const json = await res.json();
            const segments = json.actions?.[0]?.updateEngagementPanelAction?.content?.transcriptRenderer?.body?.transcriptBodyRenderer?.cueGroupRenderer?.cues || json.actions?.[0]?.updateEngagementPanelAction?.content?.transcriptRenderer?.content?.transcriptSearchPanelRenderer?.body?.transcriptSegmentListRenderer?.initialSegments;
            if (segments) return segments;
          }
        }
      } catch (e) {
      }
      return await this._tryTimedText(ytData);
    },
    async _tryTimedText(ytData) {
      const captions = ytData?.captions?.playerCaptionsTracklistRenderer;
      const captionTracks = captions?.captionTracks;
      if (!captionTracks || !captionTracks[0]?.baseUrl) return null;
      const track = captionTracks.find((t) => t.languageCode === "en" && t.kind !== "asr") || captionTracks.find((t) => t.languageCode === "en") || captionTracks[0];
      const res = await fetch(`${track.baseUrl}&fmt=json3`);
      if (res.ok) {
        const data = await res.json();
        return data.events?.filter((e) => e.segs);
      }
      return null;
    },
    _normalizeTranscript(segments) {
      return segments.map((s) => {
        if (s.transcriptSegmentRenderer) {
          return s.transcriptSegmentRenderer.snippet?.runs?.map((r) => r.text).join("") || "";
        }
        if (s.transcriptCueRenderer) {
          return s.transcriptCueRenderer.cue?.simpleText || "";
        }
        if (s.segs) {
          return s.segs.map((seg) => seg.utf8).join("");
        }
        return "";
      }).join(" ").replace(/\s+/g, " ").trim();
    }
  };
  if (typeof window !== "undefined") {
    window.YoutubeUtils = YoutubeUtils;
  }
  if (typeof globalThis !== "undefined") {
    globalThis.YoutubeUtils = YoutubeUtils;
  }

  // src/content/youtube_bridge.js
  var YouTubeButtonManager = class {
    constructor() {
      this.button = null;
      this.copyButton = null;
      this.intervalId = null;
      this.currentVideoId = null;
      this.injectStyles();
      this.setupGlobalListener();
    }
    injectStyles() {
      if (document.getElementById("lumina-yt-styles")) return;
      const style = document.createElement("style");
      style.id = "lumina-yt-styles";
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
      window.addEventListener("click", async (e) => {
        if (!window.location.hostname.includes("youtube.com")) return;
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
      }, 1e3);
      this.injectButton();
    }
    getVideoId() {
      const url = new URL(window.location.href);
      return url.searchParams.get("v") || (url.pathname.startsWith("/shorts/") ? url.pathname.split("/")[2] : null);
    }
    injectButton() {
      const nativeBtn = document.querySelector('button[aria-label="Ask"], button[title="Ask"]');
      if (nativeBtn && nativeBtn.id !== "lumina-yt-ask-btn") {
        nativeBtn.id = "lumina-yt-ask-btn";
        this.button = nativeBtn;
      }
      const downloadBtn = document.querySelector('button[aria-label="Download"], button[title="Download"]');
      if (downloadBtn && downloadBtn.id !== "lumina-yt-copy-transcript-btn") {
        downloadBtn.id = "lumina-yt-copy-transcript-btn";
        this.copyButton = downloadBtn;
      }
    }
    async handleCopyTranscript() {
      const btn = document.getElementById("lumina-yt-copy-transcript-btn");
      if (!btn) return;
      btn.classList.remove("is-copied", "is-error", "is-not-found");
      btn.classList.add("is-fetching");
      try {
        const transcript = await YoutubeUtils.fetchTranscript(window.location.href);
        btn.classList.remove("is-fetching");
        if (transcript) {
          await navigator.clipboard.writeText(transcript);
          btn.classList.add("is-copied");
        } else {
          btn.classList.add("is-not-found");
        }
      } catch (err) {
        console.error("[Lumina YT] Failed to copy transcript:", err);
        btn.classList.remove("is-fetching");
        btn.classList.add("is-error");
      }
      setTimeout(() => {
        const currentBtn = document.getElementById("lumina-yt-copy-transcript-btn");
        if (currentBtn) {
          currentBtn.classList.remove("is-fetching", "is-copied", "is-error", "is-not-found");
        }
      }, 2e3);
    }
    async handleAction() {
      const triggerInfo = {
        action: "youtube_ask",
        timestamp: Date.now(),
        videoId: this.currentVideoId,
        url: window.location.href,
        title: document.title.replace(" - YouTube", "")
      };
      try {
        chrome.runtime.sendMessage({
          action: "ensure_sidepanel_open",
          youtubeTrigger: triggerInfo
        });
      } catch (err) {
        console.error("[Lumina] Failed to open side panel:", err);
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
  };

  // src/core/ai/token_utils.js
  var LuminaToken = {
    count: function(text) {
      if (!text) return 0;
      return Math.ceil(text.length / 2.5);
    },
    truncate: function(text, maxTokens) {
      if (!text || maxTokens <= 0) return "";
      return text.substring(0, Math.floor(maxTokens * 2.5));
    }
  };
  if (typeof globalThis !== "undefined") {
    globalThis.LuminaToken = LuminaToken;
  }

  // src/content/page_reader.js
  var lastExtractedContent = null;
  var lastExtractedUrl = "";
  var lastExtractionTime = 0;
  function getVisibleText(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent;
    }
    if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
      let text2 = "";
      for (const child of node.childNodes) {
        text2 += getVisibleText(child);
      }
      return text2;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const el = node;
    if (el.isConnected) {
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
        return "";
      }
    } else {
      if (el.style.display === "none" || el.style.visibility === "hidden" || el.style.opacity === "0") {
        return "";
      }
    }
    const tag = el.tagName.toLowerCase();
    if (["button", "svg", "mat-icon", "script", "style", "noscript", "img"].includes(tag)) {
      return "";
    }
    const classStr = typeof el.className === "string" ? el.className.toLowerCase() : "";
    if (el.getAttribute("role") === "button" || classStr.includes("btn") || classStr.includes("button") || el.classList.contains("lumina-dict-play-btn")) {
      return "";
    }
    if (tag === "a" && (el.classList.contains("btn") || el.classList.contains("button") || el.className.includes("btn "))) {
      return "";
    }
    if (el.getAttribute("aria-hidden") === "true") {
      return "";
    }
    const classNameStr = typeof el.className === "string" ? el.className : el.className?.baseVal || "";
    if (/\b(icon|material-icons|google-symbols|fa-|glyphicon|lumina-translation-divider|lumina-trans-actions)\b/i.test(classNameStr)) {
      return "";
    }
    let text = "";
    for (const child of el.childNodes) {
      text += getVisibleText(child);
    }
    if (["div", "p", "br", "li", "h1", "h2", "h3", "h4", "h5", "h6", "tr"].includes(tag)) {
      text = "\n" + text + "\n";
    }
    return text;
  }
  function getActiveSelection(preferShadow = false, luminaShadowRoot = null) {
    if (preferShadow && luminaShadowRoot) {
      try {
        const shadowSel = luminaShadowRoot.getSelection ? luminaShadowRoot.getSelection() : null;
        if (shadowSel && shadowSel.rangeCount > 0 && shadowSel.toString().trim() !== "") {
          return shadowSel;
        }
      } catch (e) {
      }
    }
    let sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && sel.toString().trim() !== "") {
      return sel;
    }
    try {
      let active = document.activeElement;
      while (active && active.shadowRoot) {
        const shadowSel = active.shadowRoot.getSelection ? active.shadowRoot.getSelection() : null;
        if (shadowSel && shadowSel.rangeCount > 0 && shadowSel.toString().trim() !== "") {
          return shadowSel;
        }
        active = active.shadowRoot.activeElement;
      }
    } catch (e) {
    }
    if (!preferShadow && luminaShadowRoot) {
      try {
        const shadowSel = luminaShadowRoot.getSelection ? luminaShadowRoot.getSelection() : null;
        if (shadowSel && shadowSel.rangeCount > 0 && shadowSel.toString().trim() !== "") {
          return shadowSel;
        }
      } catch (e) {
      }
    }
    return sel;
  }
  function getSmartSelectionText(luminaShadowRoot = null) {
    const sel = getActiveSelection(false, luminaShadowRoot);
    if (!sel || sel.rangeCount === 0) return "";
    const range = sel.getRangeAt(0);
    const fragment = range.cloneContents();
    let extracted = getVisibleText(fragment);
    extracted = extracted.replace(/\n{3,}/g, "\n\n").replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").trim();
    if (!extracted && sel.toString().trim()) {
      extracted = sel.toString().trim();
    }
    return extracted;
  }
  function getSentenceContext(luminaShadowRoot = null) {
    const sel = getActiveSelection(false, luminaShadowRoot);
    if (!sel || sel.rangeCount === 0) return "";
    const range = sel.getRangeAt(0);
    let node = range.startContainer;
    if (!node) return "";
    const blockTags = ["P", "DIV", "LI", "H1", "H2", "H3", "H4", "H5", "H6", "ARTICLE", "SECTION", "TR", "TD"];
    let parent = node.nodeType === 3 ? node.parentNode : node;
    while (parent) {
      if (parent.nodeType === 11 && parent.host) {
        parent = parent.host;
        continue;
      }
      if (parent.tagName && blockTags.includes(parent.tagName)) {
        if (parent.id === "lumina-host" || parent.id === "lumina-shadow-host") {
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
    if (!selectionText) return "";
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
  function getParagraphContext(luminaShadowRoot = null) {
    const sel = getActiveSelection(false, luminaShadowRoot);
    if (!sel || sel.rangeCount === 0) return "";
    const range = sel.getRangeAt(0);
    let node = range.startContainer;
    if (!node) return "";
    const blockTags = ["P", "DIV", "LI", "H1", "H2", "H3", "H4", "H5", "H6", "ARTICLE", "SECTION", "TR", "TD"];
    let parent = node.nodeType === 3 ? node.parentNode : node;
    while (parent) {
      if (parent.nodeType === 11 && parent.host) {
        parent = parent.host;
        continue;
      }
      if (parent.tagName && blockTags.includes(parent.tagName)) {
        if (parent.id === "lumina-host" || parent.id === "lumina-shadow-host") {
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
  async function extractMainContent(doc = document, forceRefresh = false) {
    const url = window.location.href;
    const now = Date.now();
    if (!forceRefresh && lastExtractedContent && lastExtractedUrl === url && now - lastExtractionTime < 2e3) {
      return lastExtractedContent;
    }
    const isPossiblyEmptySPA = () => {
      const text = (doc.body ? doc.body.innerText : "") || "";
      const hasAppRoot = doc.querySelector("#root") || doc.querySelector("#app") || doc.querySelector('div[id*="app"]');
      const isVite = doc.querySelector('script[type="module"]');
      const hasSpinner = doc.querySelector(".spoke-spinner") || doc.querySelector(".ant-spin") || doc.querySelector(".loading-spinner");
      const hasLMS = doc.querySelector(".lms-container") || doc.querySelector(".dol-content") || doc.querySelector('[class*="passage"]');
      const isEducationSite = url.includes("dolenglish") || url.includes("ielts") || url.includes("education");
      const minThreshold = isEducationSite ? 1e3 : 600;
      return text.length < minThreshold && (hasAppRoot || isVite || hasLMS) || hasSpinner;
    };
    const shouldDelay = !forceRefresh && isPossiblyEmptySPA();
    if (shouldDelay) {
      await new Promise((r) => setTimeout(r, 1500));
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
        await new Promise((r) => setTimeout(r, 1e3));
      }
      retries++;
    }
    lastExtractedContent = finalOutput;
    lastExtractedUrl = url;
    lastExtractionTime = Date.now();
    return finalOutput;
  }
  async function performExtraction(doc, url) {
    const isYouTube = typeof YoutubeUtils !== "undefined" && YoutubeUtils.isYouTubeVideo(url);
    let youtubeTranscript = "";
    if (isYouTube) {
      youtubeTranscript = await YoutubeUtils.fetchTranscript(url);
    }
    let result = {
      url,
      title: document.title,
      content: ""
    };
    try {
      const TurndownCls = typeof TurndownService !== "undefined" ? TurndownService : null;
      let turndownService = null;
      if (TurndownCls) {
        turndownService = new TurndownCls({
          headingStyle: "atx",
          codeBlockStyle: "fenced"
        });
        turndownService.remove(["script", "style", "noscript", "iframe", "svg", "button", "audio", "video", "canvas", "map", "area", 'img[alt*="logo" i]']);
      }
      const normalize = (s) => (s || "").toLowerCase().replace(/\s+/g, " ").trim();
      let finalMarkdown = `[Context Source: ${document.title}]
URL: ${url}

`;
      let normalizedCaptured = "";
      const MIN_TEXT_LENGTH = 50;
      const SCRAP_TAGS = [
        "script",
        "style",
        "nav",
        "footer",
        "header",
        "noscript",
        "aside",
        "svg",
        "button",
        "audio",
        "video",
        ".menu",
        ".sidebar",
        ".navbar",
        ".header",
        ".footer",
        '[class*="header" i]',
        '[class*="footer" i]',
        '[class*="nav" i]',
        '[class*="menu" i]',
        '[class*="sidebar" i]',
        '[class*="feedback" i]',
        '[class*="upgrade" i]',
        '[class*="timer" i]',
        '[class*="modal" i]',
        '[class*="user-nav" i]',
        '[class*="promo" i]',
        '[class*="ads" i]',
        '[class*="banner" i]',
        '[class*="social" i]',
        '[class*="related" i]',
        '[class*="breadcrumb" i]',
        '[class*="auth" i]',
        '[class*="login" i]',
        '[class*="account" i]',
        '[class*="profile" i]',
        '[class*="expire" i]',
        '[class*="notification" i]',
        '[class*="contact" i]',
        '[class*="hotline" i]',
        '[class*="address" i]',
        '[class*="popup" i]',
        '[class*="overlay" i]',
        '[class*="tooltip" i]',
        '[class*="download" i]',
        '[class*="comment" i]',
        '[class*="review" i]',
        '[class*="share" i]',
        '[class*="cookie" i]',
        '[class*="gdpr" i]',
        '[class*="logo" i]',
        '[class*="topbar" i]',
        '[class*="fixed" i]',
        '[class*="section-header" i]',
        "#feedback-modal",
        ".lumina-ignore",
        '[role="navigation"]',
        '[role="contentinfo"]',
        ".dol-breadcrumb",
        ".breadcrumb-container",
        ".landing-header",
        ".footer-nested-links",
        ".socialButtonGroup",
        ".referral-share-banner",
        "#__NEXT_DATA__",
        ".rowLink",
        ".nav-item",
        ".LandingHeader__Main-sc-vzeq2b-0",
        ".LandingLayout__Main-sc-1plzfds-0",
        ".TopbarNavList__Main-sc-tbxqf6-1"
      ];
      const findCandidates = (root) => {
        const HIGH_LEVEL_WRAPPERS = ["html", "body", "#__next", "#app-root", ".app-wrapper", ".app-container", ".main-wrapper", ".layout-wrapper"];
        let found = Array.from(root.querySelectorAll('article, main, section, [class*="content"], [id*="content"], [class*="article"], [class*="main"], [class*="reading"], [class*="passage"], [class*="question"], [class*="exercise"], [class*="practice"], [id*="reading"], [id*="passage"], div, p'));
        found = found.filter((el) => {
          const isWrapper = HIGH_LEVEL_WRAPPERS.some((sel) => el.matches(sel));
          if (isWrapper) return false;
          if (el.parentElement && (el.parentElement.tagName === "BODY" || el.parentElement.id === "__next")) {
            if (!el.matches("article, main, section")) return false;
          }
          return true;
        });
        const all = root.querySelectorAll("*");
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
      candidates.forEach((el) => {
        if (!el || !el.isConnected) return;
        if (el.closest(SCRAP_TAGS.join(","))) return;
        const text = (el.innerText || el.textContent || "").trim();
        if (text.length < MIN_TEXT_LENGTH) return;
        const linkCount = el.querySelectorAll("a").length;
        if (linkCount > 2 && text.length / linkCount < 50) return;
        const normText = normalize(text);
        const startFingerprint = normText.slice(0, 150);
        if (startFingerprint && normalizedCaptured.includes(startFingerprint)) return;
        if (normText.length > 200 && normalizedCaptured.includes(normText.substring(50, 200))) return;
        const html = el.innerHTML || "";
        const density = text.length / (html.length + 1);
        const isEducationBlock = el.matches('[class*="question"], [class*="reading"], [class*="passage"], [class*="exercise"], [class*="practice"]');
        if (text.split("\n").length < 3 && linkCount > 1 && !isEducationBlock) return;
        if (density > 0.05 || el.matches('article, main, p, [class*="content"]') || isEducationBlock) {
          const blockMarkdown = turndownService ? turndownService.turndown(html).trim() : text;
          if (blockMarkdown && blockMarkdown.length > 20) {
            segmentsCount++;
            finalMarkdown += `

--- [Segment ${segmentsCount}] ---

` + blockMarkdown;
            normalizedCaptured += " " + normText;
          }
        }
      });
      if (youtubeTranscript) {
        finalMarkdown += "\n\n--- [Video Transcript] ---\n\n" + youtubeTranscript;
      }
      result.content = segmentsCount > 0 ? finalMarkdown : `[Fallback Page Text]:
${doc.body ? doc.body.innerText : ""}`;
      return result;
    } catch (error) {
      console.error("[Lumina] Content extraction failed:", error);
      result.content = `[Extraction Error]: ${error.message}`;
    }
    lastExtractedContent = result;
    lastExtractedUrl = url;
    return result;
  }
  function luminaEstimateTokens(text) {
    if (!text) return 0;
    if (typeof LuminaToken !== "undefined") {
      return LuminaToken.count(text);
    }
    return Math.ceil(text.length / 4);
  }
  if (typeof window !== "undefined") {
    window.luminaExtractMainContent = extractMainContent;
    window.luminaEstimateTokens = luminaEstimateTokens;
  }

  // src/content/audio_player.js
  var currentAudioEl = null;
  var audioAborted = false;
  var audioDebounceTimer = null;
  var CHUNK_GAP_MS = 50;
  var audioCache = {
    text: null,
    type: null,
    data: null
  };
  var _contentAudioCtx = null;
  function getContentAudioCtx() {
    if (!_contentAudioCtx || _contentAudioCtx.state === "closed") {
      _contentAudioCtx = new AudioContext();
    }
    return _contentAudioCtx;
  }
  async function detectSilenceOffset(byteArray) {
    try {
      const ctx = getContentAudioCtx();
      const audioBuffer = await ctx.decodeAudioData(byteArray.buffer.slice(0));
      const channelData = audioBuffer.getChannelData(0);
      const THRESHOLD = 5e-3;
      for (let i = 0; i < channelData.length; i++) {
        if (Math.abs(channelData[i]) > THRESHOLD) {
          return i / audioBuffer.sampleRate;
        }
      }
      return 0;
    } catch (e) {
      return 0;
    }
  }
  function playBase64Locally(base64, speed = 1) {
    return new Promise(async (resolve) => {
      if (audioAborted) {
        resolve();
        return;
      }
      let blobUrl = null;
      try {
        if (base64.startsWith("data:")) {
          const parts = base64.split(",");
          const mime = parts[0].split(":")[1].split(";")[0];
          const byteString = atob(parts[1]);
          const byteArray = new Uint8Array(byteString.length);
          for (let i = 0; i < byteString.length; i++) byteArray[i] = byteString.charCodeAt(i);
          const silenceOffset = await detectSilenceOffset(byteArray);
          const blob = new Blob([byteArray], { type: mime });
          blobUrl = URL.createObjectURL(blob);
          if (audioAborted) {
            URL.revokeObjectURL(blobUrl);
            resolve();
            return;
          }
          const audio2 = new Audio(blobUrl);
          audio2.playbackRate = speed;
          if (silenceOffset > 0) audio2.currentTime = silenceOffset;
          currentAudioEl = audio2;
          const cleanup2 = () => {
            currentAudioEl = null;
            if (blobUrl) URL.revokeObjectURL(blobUrl);
          };
          audio2.onended = () => {
            cleanup2();
            resolve();
          };
          audio2.onerror = () => {
            cleanup2();
            resolve();
          };
          audio2.play().catch(() => {
            cleanup2();
            resolve();
          });
          return;
        }
      } catch (e) {
      }
      const audio = new Audio(blobUrl || base64);
      audio.playbackRate = speed;
      currentAudioEl = audio;
      const cleanup = () => {
        currentAudioEl = null;
        if (blobUrl) URL.revokeObjectURL(blobUrl);
      };
      audio.onended = () => {
        cleanup();
        resolve();
      };
      audio.onerror = () => {
        cleanup();
        resolve();
      };
      audio.play().catch(() => {
        cleanup();
        resolve();
      });
    });
  }
  async function playChunksSequentially(chunks, speed) {
    for (let i = 0; i < chunks.length; i++) {
      if (audioAborted) break;
      await playBase64Locally(chunks[i], speed);
      if (!audioAborted && i < chunks.length - 1) {
        await new Promise((r) => setTimeout(r, CHUNK_GAP_MS));
      }
    }
  }
  async function playCombinedAudio(text, forcedLang = null) {
    if (!text) return;
    if (audioDebounceTimer) {
      clearTimeout(audioDebounceTimer);
      audioDebounceTimer = null;
    }
    audioAborted = true;
    if (currentAudioEl) {
      currentAudioEl.pause();
      currentAudioEl = null;
    }
    audioAborted = false;
    const normalizedText = text.trim();
    const cacheKey = forcedLang ? `${normalizedText}_${forcedLang}` : normalizedText;
    try {
      const storageData = await chrome.storage.local.get(["audioSpeed"]);
      const speed = storageData.audioSpeed || 1.1;
      if (audioCache.text === cacheKey && audioCache.data) {
        const chunks = Array.isArray(audioCache.data) ? audioCache.data : [audioCache.data];
        await playChunksSequentially(chunks, speed);
        return;
      }
      try {
        const cached = await chrome.runtime.sendMessage({ action: "getAudioCache", text: cacheKey });
        if (cached && cached.success && cached.data) {
          const chunks = Array.isArray(cached.data) ? cached.data : [cached.data];
          audioCache = { text: cacheKey, type: cached.type, data: cached.data };
          await playChunksSequentially(chunks, speed);
          return;
        }
      } catch (e) {
      }
      const result = await chrome.runtime.sendMessage({ action: "fetchAudio", text: normalizedText, speed, lang: forcedLang });
      if (!result || !result.chunks || result.chunks.length === 0) return;
      audioCache = { text: cacheKey, type: result.type, data: result.chunks };
      await playChunksSequentially(result.chunks, speed);
      chrome.runtime.sendMessage({ action: "setAudioCache", text: cacheKey, type: result.type, data: result.chunks }).catch(() => {
      });
    } catch (e) {
    }
  }
  function stopAudio() {
    audioAborted = true;
    if (currentAudioEl) {
      currentAudioEl.pause();
      currentAudioEl = null;
    }
  }
  if (typeof window !== "undefined") {
    window.LuminaPlayAudio = playCombinedAudio;
    window.LuminaStopAudio = stopAudio;
  }

  // src/helpers/annotation_utils.js
  var LuminaAnnotation = {
    highlightsMap: /* @__PURE__ */ new Map(),
    highlightObjects: /* @__PURE__ */ new Map(),
    styleElement: null,
    serializeRange(range) {
      if (!range) return null;
      const getPath = (node) => {
        const path = [];
        let curr = node;
        while (curr && curr !== document.body) {
          let index = 0;
          let sibling = curr.previousSibling;
          while (sibling) {
            index++;
            sibling = sibling.previousSibling;
          }
          path.push(index);
          curr = curr.parentNode;
        }
        return path;
      };
      return {
        startPath: getPath(range.startContainer),
        startOffset: range.startOffset,
        endPath: getPath(range.endContainer),
        endOffset: range.endOffset,
        text: range.toString()
      };
    },
    deserializeRange(data) {
      if (!data || !data.startPath || !data.endPath) return null;
      const getNode = (path) => {
        let node = document.body;
        for (let i = path.length - 1; i >= 0; i--) {
          if (!node || !node.childNodes[path[i]]) return null;
          node = node.childNodes[path[i]];
        }
        return node;
      };
      const startNode = getNode(data.startPath);
      const endNode = getNode(data.endPath);
      if (!startNode || !endNode) return null;
      const getLength = (node) => {
        if (!node) return 0;
        if (node.nodeType === Node.TEXT_NODE || node.nodeType === Node.COMMENT_NODE) {
          return node.length;
        }
        return node.childNodes ? node.childNodes.length : 0;
      };
      if (data.startOffset > getLength(startNode) || data.endOffset > getLength(endNode)) {
        return null;
      }
      const range = document.createRange();
      try {
        range.setStart(startNode, data.startOffset);
        range.setEnd(endNode, data.endOffset);
        return range;
      } catch (e) {
        console.warn("[Lumina] Range recovery failed:", e);
        return null;
      }
    },
    serializeHighlight(h) {
      if (!h || !h.rangeData) return null;
      return [
        h.id,
        h.color || "",
        h.rangeData.startPath.join("/"),
        h.rangeData.startOffset,
        h.rangeData.endPath.join("/"),
        h.rangeData.endOffset,
        h.rangeData.text || "",
        h.timestamp || Date.now(),
        h.comment || ""
      ];
    },
    deserializeHighlight(arr) {
      if (!Array.isArray(arr) || arr.length < 6) return null;
      return {
        id: arr[0],
        color: arr[1] || null,
        rangeData: {
          startPath: arr[2].split("/").map(Number),
          startOffset: arr[3],
          endPath: arr[4].split("/").map(Number),
          endOffset: arr[5],
          text: arr[6] || ""
        },
        timestamp: arr[7] || Date.now(),
        comment: arr[8] || ""
      };
    },
    isLuminaAndNotAnswer(range) {
      if (typeof window !== "undefined" && window.location.href.includes("lumina.html")) {
        if (!range) return true;
        let container = range.commonAncestorContainer;
        if (container.nodeType !== Node.ELEMENT_NODE) {
          container = container.parentNode;
        }
        if (!container || !container.closest(".lumina-chat-answer")) {
          return true;
        }
      }
      return false;
    },
    highlight(range, color = "#FFFB78", id = null, comment = "") {
      if (!range || range.collapsed) return null;
      if (this.isLuminaAndNotAnswer(range)) return null;
      const highlightId = id || Date.now().toString();
      const rangeToHighlight = range.cloneRange();
      this.saveHighlight(rangeToHighlight, color, highlightId, comment);
      this.applyHighlight(rangeToHighlight, color, highlightId, comment);
      return highlightId;
    },
    injectHighlightCSS(color) {
      if (!this.styleElement) {
        this.styleElement = document.createElement("style");
        this.styleElement.id = "lumina-highlight-styles";
        (document.head || document.documentElement).appendChild(this.styleElement);
      }
      if (color) {
        const cleanColor = color.toLowerCase().replace("#", "");
        const styleRule = `::highlight(lumina-hl-${cleanColor}) { background-color: ${color} !important; color: black !important; }
`;
        if (!this.styleElement.textContent.includes(`lumina-hl-${cleanColor}`)) {
          this.styleElement.textContent += styleRule;
        }
      }
      const commentRule = `::highlight(lumina-comment-underline) { text-decoration-line: underline !important; text-decoration-style: dashed !important; text-decoration-color: #9ca3af !important; text-decoration-thickness: 1.5px !important; }
`;
      if (!this.styleElement.textContent.includes("lumina-comment-underline")) {
        this.styleElement.textContent += commentRule;
      }
    },
    applyHighlight(range, color, highlightId = null, comment = "") {
      if (!range || range.collapsed || !window.Highlight || !CSS.highlights) return;
      if (this.isLuminaAndNotAnswer(range)) return;
      this.injectHighlightCSS(color);
      if (color) {
        const normalizedColor = color.toLowerCase();
        let highlightObj = this.highlightObjects.get(normalizedColor);
        if (!highlightObj) {
          highlightObj = new Highlight();
          this.highlightObjects.set(normalizedColor, highlightObj);
          const cleanColor = normalizedColor.replace("#", "");
          CSS.highlights.set(`lumina-hl-${cleanColor}`, highlightObj);
        }
        highlightObj.add(range);
      }
      if (comment && comment.trim()) {
        let commentObj = this.highlightObjects.get("comment-underline");
        if (!commentObj) {
          commentObj = new Highlight();
          this.highlightObjects.set("comment-underline", commentObj);
          CSS.highlights.set("lumina-comment-underline", commentObj);
        }
        commentObj.add(range);
      }
      if (highlightId) {
        const existing = this.highlightsMap.get(highlightId) || {};
        this.highlightsMap.set(highlightId, {
          range,
          color: color ? color.toLowerCase() : existing.color,
          comment: comment !== void 0 ? comment : existing.comment || ""
        });
      }
    },
    getHighlightAtCoords(x, y) {
      for (const [id, data] of this.highlightsMap.entries()) {
        if (!data.range) continue;
        const rects = data.range.getClientRects();
        for (const rect of rects) {
          if (x >= rect.left - 4 && x <= rect.right + 4 && y >= rect.top - 5 && y <= rect.bottom + 5) {
            return { id, color: data.color, comment: data.comment, range: data.range };
          }
        }
      }
      return null;
    },
    getStorageKey(rangeOrNode = null) {
      const url = window.location.href.split("#")[0].split("?")[0];
      if (url.startsWith("chrome-extension://")) {
        let tabId = null;
        const scope = window.LuminaSelectionScope;
        if (rangeOrNode && scope) {
          const node = rangeOrNode instanceof Range ? rangeOrNode.startContainer : rangeOrNode;
          let curr = node;
          const tabsList = scope.getTabs();
          while (curr && curr !== document.documentElement) {
            if (curr.nodeType === 1 && tabsList) {
              const tab = tabsList.find((t) => t.historyEl === curr);
              if (tab) {
                if (tab.sessionId) {
                  return `highlights_lumina_session_${tab.sessionId}`;
                }
                tabId = tab.id;
                break;
              }
            }
            curr = curr.parentNode || (curr.host && curr.host.nodeType === 1 ? curr.host : null);
          }
        }
        if (!tabId && scope) {
          const tabsList = scope.getTabs();
          const activeIdx = scope.getActiveTabIndex();
          if (tabsList && typeof activeIdx !== "undefined" && tabsList[activeIdx]) {
            const tab = tabsList[activeIdx];
            if (tab.sessionId) {
              return `highlights_lumina_session_${tab.sessionId}`;
            }
            tabId = tab.id;
          }
        }
        return tabId ? `highlights_lumina_tab_${tabId}` : `highlights_lumina`;
      }
      return `highlights_${url}`;
    },
    clearAllHighlights() {
      if (window.Highlight && CSS.highlights) {
        for (const [color, highlightObj] of this.highlightObjects.entries()) {
          highlightObj.clear();
        }
      }
      this.highlightsMap.clear();
      this.unrestoredHighlights = [];
      if (this.retryObserver) {
        this.retryObserver.disconnect();
        this.retryObserver = null;
      }
    },
    saveHighlight(range, color, id, comment = "") {
      if (this.isLuminaAndNotAnswer(range)) return;
      const storageKey = this.getStorageKey(range);
      const hData = {
        id,
        color,
        comment,
        rangeData: this.serializeRange(range),
        timestamp: Date.now()
      };
      const flatHighlight = this.serializeHighlight(hData);
      chrome.runtime.sendMessage({
        action: "save_highlight",
        url: storageKey,
        highlight: flatHighlight
      });
    },
    addComment(range, commentText, color = null, id = null) {
      if (!range || range.collapsed) return null;
      if (this.isLuminaAndNotAnswer(range)) return null;
      const highlightId = id || Date.now().toString();
      const rangeToHighlight = range.cloneRange();
      this.saveHighlight(rangeToHighlight, color, highlightId, commentText);
      this.applyHighlight(rangeToHighlight, color, highlightId, commentText);
      return highlightId;
    },
    setupRetryObserver() {
      if (this.retryObserver) return;
      this.retryObserver = new MutationObserver(() => {
        if (!this.unrestoredHighlights || this.unrestoredHighlights.length === 0) {
          this.retryObserver.disconnect();
          this.retryObserver = null;
          return;
        }
        const stillUnrestored = [];
        this.unrestoredHighlights.forEach((h) => {
          const range = this.deserializeRange(h.rangeData);
          if (range) {
            this.applyHighlight(range, h.color, h.id, h.comment);
          } else {
            stillUnrestored.push(h);
          }
        });
        this.unrestoredHighlights = stillUnrestored;
      });
      this.retryObserver.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true
      });
      setTimeout(() => {
        if (this.retryObserver) {
          this.retryObserver.disconnect();
          this.retryObserver = null;
        }
      }, 15e3);
    },
    loadHighlights(tabId = null) {
      let storageKey = null;
      if (tabId && window.LuminaSelectionScope) {
        const tabsList = window.LuminaSelectionScope.getTabs();
        const tab = tabsList && tabsList.find((t) => t.id === tabId);
        if (tab && tab.sessionId) {
          storageKey = `highlights_lumina_session_${tab.sessionId}`;
        }
      }
      if (!storageKey) {
        storageKey = tabId ? `highlights_lumina_tab_${tabId}` : this.getStorageKey();
      }
      chrome.runtime.sendMessage({
        action: "load_highlights",
        url: storageKey
      }, (response) => {
        if (chrome.runtime.lastError || !response || !response.success) {
          return;
        }
        const flatHighlights = response.highlights || [];
        const highlights = flatHighlights.map((h) => this.deserializeHighlight(h)).filter(Boolean);
        this.unrestoredHighlights = this.unrestoredHighlights || [];
        highlights.forEach((h) => {
          const range = this.deserializeRange(h.rangeData);
          if (range) {
            this.applyHighlight(range, h.color, h.id, h.comment);
          } else {
            if (!this.unrestoredHighlights.some((item) => item.id === h.id)) {
              this.unrestoredHighlights.push(h);
            }
          }
        });
        if (this.unrestoredHighlights.length > 0) {
          this.setupRetryObserver();
        }
        this.setupOrphanedObserver();
      });
    },
    checkOrphanedHighlights() {
      const orphanedIds = [];
      for (const [id, data] of this.highlightsMap.entries()) {
        if (data.range) {
          const sc = data.range.startContainer;
          const ec = data.range.endContainer;
          if (!sc || !ec || !sc.isConnected || !ec.isConnected || document.body && (!document.body.contains(sc) || !document.body.contains(ec))) {
            orphanedIds.push(id);
          }
        }
      }
      if (orphanedIds.length > 0) {
        this.removeHighlightsByIds(orphanedIds);
      }
    },
    setupOrphanedObserver() {
      if (typeof window === "undefined") return;
      if (this.orphanedObserver) return;
      this.orphanedObserver = new MutationObserver(() => {
        this.checkOrphanedHighlights();
      });
      const targetNode = document.body || document.documentElement;
      if (targetNode) {
        this.orphanedObserver.observe(targetNode, {
          childList: true,
          subtree: true
        });
      }
    },
    undoLastHighlight() {
      const storageKey = this.getStorageKey();
      chrome.runtime.sendMessage({
        action: "undo_last_highlight",
        url: storageKey
      }, (response) => {
        if (chrome.runtime.lastError || !response || !response.success || !response.lastHighlight) return;
        const lastHighlight = this.deserializeHighlight(response.lastHighlight);
        if (lastHighlight) {
          this.removeHighlightById(lastHighlight.id);
        }
      });
    },
    removeHighlightsByIds(ids) {
      if (!ids || ids.length === 0) return;
      const idsStr = ids.map((id) => id.toString());
      const keysToUpdate = /* @__PURE__ */ new Set();
      ids.forEach((id) => {
        const data = this.highlightsMap.get(id);
        keysToUpdate.add(this.getStorageKey(data ? data.range : null));
      });
      keysToUpdate.forEach((storageKey) => {
        chrome.runtime.sendMessage({
          action: "remove_highlights",
          url: storageKey,
          ids: idsStr
        });
      });
      if (this.unrestoredHighlights) {
        this.unrestoredHighlights = this.unrestoredHighlights.filter((h) => !idsStr.includes(h.id.toString()));
      }
      ids.forEach((id) => {
        const data = this.highlightsMap.get(id);
        if (data) {
          if (data.color) {
            const highlightObj = this.highlightObjects.get(data.color);
            if (highlightObj) highlightObj.delete(data.range);
          }
          if (data.comment) {
            const commentObj = this.highlightObjects.get("comment-underline");
            if (commentObj) commentObj.delete(data.range);
          }
          this.highlightsMap.delete(id);
        }
      });
    },
    removeHighlightById(id) {
      if (!id) return;
      this.removeHighlightsByIds([id]);
    },
    updateHighlightColor(id, newColor) {
      if (!id || !newColor) return;
      const data = this.highlightsMap.get(id);
      const storageKey = this.getStorageKey(data ? data.range : null);
      chrome.runtime.sendMessage({
        action: "update_highlight_color",
        url: storageKey,
        id,
        color: newColor
      });
      if (data) {
        const oldColor = data.color;
        const newColorNormalized = newColor.toLowerCase();
        if (oldColor) {
          const oldHighlightObj = this.highlightObjects.get(oldColor);
          if (oldHighlightObj) oldHighlightObj.delete(data.range);
        }
        let newHighlightObj = this.highlightObjects.get(newColorNormalized);
        if (!newHighlightObj) {
          newHighlightObj = new Highlight();
          this.highlightObjects.set(newColorNormalized, newHighlightObj);
          const cleanColor = newColorNormalized.replace("#", "");
          CSS.highlights.set(`lumina-hl-${cleanColor}`, newHighlightObj);
          this.injectHighlightCSS(newColorNormalized);
        }
        newHighlightObj.add(data.range);
        data.color = newColorNormalized;
      }
    },
    updateHighlightComment(id, newComment) {
      if (!id) return;
      const data = this.highlightsMap.get(id);
      const storageKey = this.getStorageKey(data ? data.range : null);
      chrome.runtime.sendMessage({
        action: "update_highlight_comment",
        url: storageKey,
        id,
        comment: newComment || ""
      });
      if (data) {
        const commentObj = this.highlightObjects.get("comment-underline");
        if (newComment && newComment.trim()) {
          if (commentObj) commentObj.add(data.range);
          else {
            const newCommentObj = new Highlight();
            this.highlightObjects.set("comment-underline", newCommentObj);
            CSS.highlights.set("lumina-comment-underline", newCommentObj);
            newCommentObj.add(data.range);
            this.injectHighlightCSS();
          }
        } else {
          if (commentObj) commentObj.delete(data.range);
        }
        data.comment = newComment || "";
      }
    }
  };
  if (typeof window !== "undefined") {
    window.LuminaAnnotation = LuminaAnnotation;
  }
  if (typeof globalThis !== "undefined") {
    globalThis.LuminaAnnotation = LuminaAnnotation;
  }

  // src/helpers/selection_utils.js
  var LuminaSelection = {
    btn: null,
    inputPopup: null,
    inputField: null,
    text: "",
    context: "",
    range: null,
    onSubmit: null,
    onHide: null,
    onTranslate: null,
    shadowRoot: null,
    originalOverflow: "",
    tooltip: null,
    inputBackdrop: null,
    _selectionScrollTargets: null,
    _selectionScrollHandler: null,
    currentAnnotationId: null,
    annotationMode: false,
    currentHighlightColor: "#FFFB78",
    showExtraColors: false,
    ANNOTATION_COLORS: ["#FFFB78", "#ffcc80", "#f48fb1", "#ce93d8", "#90caf9"],
    sendRuntimeMessageSafely(message) {
      try {
        if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.id) return false;
        chrome.runtime.sendMessage(message, () => {
          const lastError = chrome.runtime.lastError;
          if (lastError) {
            console.warn("[Lumina] runtime message dropped:", lastError.message);
          }
        });
        return true;
      } catch (error) {
        console.warn("[Lumina] runtime context unavailable:", error?.message || error);
        return false;
      }
    },
    hasIntersection(r1, r2) {
      try {
        if (r1.compareBoundaryPoints(Range.END_TO_START, r2) >= 0) return false;
        if (r1.compareBoundaryPoints(Range.START_TO_END, r2) <= 0) return false;
        return true;
      } catch (e) {
        return false;
      }
    },
    getHighlightsInSelection(selectedRange) {
      const annotationEngine = window.LuminaAnnotation || LuminaAnnotation;
      if (!selectedRange || !annotationEngine) return [];
      const intersectingHighlights = [];
      for (const [id, data] of annotationEngine.highlightsMap.entries()) {
        if (this.hasIntersection(selectedRange, data.range)) {
          intersectingHighlights.push(id);
        }
      }
      return intersectingHighlights;
    },
    renderDefaultActionBar() {
      if (!this.btn) return;
      let html = "";
      if (this.annotationMode) {
        html += `
                <div class="lumina-color-swatch lumina-clear-highlight" title="Clear Annotation" style="display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; padding: 0;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </div>
                <div class="lumina-action-item lumina-action-comment" title="Edit/Add Comment">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 16px; height: 16px; display: block;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                </div>
            `;
        this.ANNOTATION_COLORS.forEach((color) => {
          const isActive = color.toLowerCase() === (this.currentHighlightColor || "").toLowerCase();
          html += `
                    <div class="lumina-action-item lumina-action-highlight-btn ${isActive ? "active" : ""}" data-color="${color}" title="Change Color">
                        <div class="lumina-action-highlight-color-preview" style="background-color: ${color}; border: ${isActive ? "2px solid var(--lumina-ui-primary, #6366f1)" : "1px solid rgba(0,0,0,0.15)"};"></div>
                    </div>
                `;
        });
      } else {
        const intersectingIds = this.getHighlightsInSelection(this.range);
        if (intersectingIds.length > 0) {
          html += `
                    <div class="lumina-color-swatch lumina-clear-highlight" title="Clear All Highlights in Selection" style="display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; padding: 0;">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </div>
                `;
        }
        html += `
                <div class="lumina-action-item lumina-action-dict" title="Dictionary">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 16px; height: 16px; display: block;"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                </div>
                <div class="lumina-action-item lumina-action-comment" title="Add Comment">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 16px; height: 16px; display: block; opacity: 0.85;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                </div>
            `;
        html += `
                <div class="lumina-action-item lumina-action-highlight-btn" data-color="${this.currentHighlightColor}" title="Highlight text">
                    <div class="lumina-action-highlight-color-preview" style="background-color: ${this.currentHighlightColor};"></div>
                </div>
            `;
        const remainingColors = this.ANNOTATION_COLORS.filter((c) => c.toLowerCase() !== this.currentHighlightColor.toLowerCase());
        if (this.showExtraColors) {
          remainingColors.forEach((color) => {
            html += `
                        <div class="lumina-action-item lumina-action-highlight-btn extra-color" data-color="${color}" title="Highlight text">
                            <div class="lumina-action-highlight-color-preview" style="background-color: ${color};"></div>
                        </div>
                    `;
          });
        } else {
          html += `
                    <div class="lumina-action-item lumina-action-expand-colors" title="More colors">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px; display: block; opacity: 0.7;"><polyline points="9 18 15 12 9 6"></polyline></svg>
                    </div>
                `;
        }
      }
      this.btn.innerHTML = html;
    },
    async init(options = {}) {
      if (!document.body) {
        await new Promise((resolve) => document.addEventListener("DOMContentLoaded", resolve));
      }
      this.shadowRoot = options.shadowRoot;
      if (!this.shadowRoot) {
        this.shadowRoot = document.body || document.documentElement;
      }
      this.onSubmit = options.onSubmit;
      this.onHide = options.onHide;
      this.onTranslate = options.onTranslate;
      this.onCommentAdded = options.onCommentAdded;
      this.cleanup();
      this.btn = document.createElement("div");
      this.btn.id = "lumina-action-bar";
      this.btn.style.cssText = "pointer-events: auto; display: none; visibility: hidden;";
      this.renderDefaultActionBar();
      this.inputPopup = document.createElement("div");
      this.inputPopup.id = "lumina-ask-input-popup";
      this.inputPopup.style.cssText = "pointer-events: auto; display: none; visibility: hidden;";
      this.inputPopup.innerHTML = `
            <div class="lumina-ask-input-wrapper">
                <textarea class="lumina-ask-input-field" placeholder="Add a comment..."></textarea>
            </div>
        `;
      this.inputField = this.inputPopup.querySelector(".lumina-ask-input-field");
      this.hoverTooltip = document.createElement("div");
      this.hoverTooltip.id = "lumina-comment-hover-tooltip";
      this.hoverTooltip.style.cssText = "pointer-events: auto; display: none; visibility: hidden; position: fixed; z-index: 2147483647;";
      this.shadowRoot.appendChild(this.hoverTooltip);
      const markInteracting = () => {
        this.isInteractingWithActionBar = true;
        if (this._interactingTimer) clearTimeout(this._interactingTimer);
        this._interactingTimer = setTimeout(() => {
          this.isInteractingWithActionBar = false;
        }, 400);
      };
      this.btn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        markInteracting();
      });
      this.btn.addEventListener("mouseup", (e) => {
        e.preventDefault();
        e.stopPropagation();
        markInteracting();
      });
      this.btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        markInteracting();
        const dictBtn = e.target.closest(".lumina-action-dict");
        const commentBtn = e.target.closest(".lumina-action-comment");
        const expandBtn = e.target.closest(".lumina-action-expand-colors");
        const highlightBtn = e.target.closest(".lumina-action-highlight-btn");
        const clearHighlightBtn = e.target.closest(".lumina-clear-highlight");
        const annotationEngine = window.LuminaAnnotation || LuminaAnnotation;
        if (expandBtn) {
          this.showExtraColors = true;
          this.renderDefaultActionBar();
          this.updatePosition(this.btn);
          return;
        }
        if (clearHighlightBtn) {
          if (annotationEngine) {
            if (this.annotationMode && this.currentAnnotationId) {
              annotationEngine.removeHighlightById(this.currentAnnotationId);
            } else {
              const intersectingIds = this.getHighlightsInSelection(this.range);
              annotationEngine.removeHighlightsByIds(intersectingIds);
              const selection = window.getSelection();
              if (selection) selection.removeAllRanges();
            }
          }
          this.hide();
          return;
        }
        if (highlightBtn) {
          const color = highlightBtn.dataset.color;
          this.currentHighlightColor = color;
          this.showExtraColors = false;
          if (this.annotationMode) {
            if (annotationEngine && this.currentAnnotationId) {
              annotationEngine.updateHighlightColor(this.currentAnnotationId, color);
            }
          } else {
            if (annotationEngine) {
              annotationEngine.highlight(this.range, color);
            }
            const selection = window.getSelection();
            if (selection) selection.removeAllRanges();
          }
          this.hide();
          return;
        }
        if (dictBtn) {
          if (this.onSubmit) this.onSubmit(`Define: ${this.text}`, this.text, true, this.sourceEntry, this.range, false, false);
          const selection = window.getSelection();
          if (selection) selection.removeAllRanges();
          this.hide();
          return;
        }
        if (commentBtn) {
          this.showCommentInput();
          return;
        }
      });
      const handleSaveComment = () => {
        const commentText = this.inputField.value.trim();
        const annotationEngine = window.LuminaAnnotation || LuminaAnnotation;
        if (commentText) {
          if (this.annotationMode && this.currentAnnotationId) {
            if (annotationEngine) {
              annotationEngine.updateHighlightComment(this.currentAnnotationId, commentText);
            }
          } else {
            if (annotationEngine && this.range) {
              annotationEngine.addComment(this.range, commentText, null);
            }
            const selection = window.getSelection();
            if (selection) selection.removeAllRanges();
          }
        }
        this.hide();
      };
      this.inputField.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          handleSaveComment();
        } else if (e.key === "Escape") {
          this.hide();
        }
      });
      this.inputPopup.addEventListener("mousedown", (e) => e.stopPropagation());
      this.shadowRoot.appendChild(this.btn);
      this.shadowRoot.appendChild(this.inputPopup);
      document.addEventListener("mousemove", (e) => {
        if (this.inputPopup && this.inputPopup.style.display === "flex") return;
        if (this.btn && this.btn.style.display === "flex") return;
        const targetEl = document.elementFromPoint(e.clientX, e.clientY);
        if (targetEl && (targetEl.closest(".lumina-chat-input-container") || targetEl.closest(".topbar") || targetEl.closest(".header") || targetEl.closest(".lumina-header") || targetEl.closest("#lumina-action-bar"))) {
          if (this.hoverTooltip && this.hoverTooltip.style.display === "block") {
            this.hideHoverTooltip();
          }
          return;
        }
        const annotationEngine = window.LuminaAnnotation || LuminaAnnotation;
        const hData = annotationEngine ? annotationEngine.getHighlightAtCoords(e.clientX, e.clientY) : null;
        if (hData && hData.comment) {
          if (this._hoverHideTimer) {
            clearTimeout(this._hoverHideTimer);
            this._hoverHideTimer = null;
          }
          if (this.currentHoveredAnnotationId === hData.id && this.hoverTooltip && this.hoverTooltip.style.display === "block") {
            return;
          }
          this.showHoverCommentTooltip(e.clientX, e.clientY, hData);
        } else {
          if (this.hoverTooltip && this.hoverTooltip.style.display === "block") {
            if (!this._hoverHideTimer) {
              this._hoverHideTimer = setTimeout(() => {
                this.hideHoverTooltip();
                this._hoverHideTimer = null;
              }, 150);
            }
          }
        }
      }, { passive: true });
      const handleScroll = (e) => {
        if (this.btn && this.btn.style.display === "flex") {
          this.updatePosition(this.btn);
        }
        if (this.hoverTooltip && (this.hoverTooltip.style.display === "block" || this.hoverTooltip.style.visibility === "visible")) {
          this.hideHoverTooltip();
        }
      };
      window.addEventListener("scroll", handleScroll, { passive: true, capture: true });
      document.addEventListener("scroll", handleScroll, { passive: true, capture: true });
    },
    hideHoverTooltip() {
      if (this._hoverHideTimer) {
        clearTimeout(this._hoverHideTimer);
        this._hoverHideTimer = null;
      }
      this.currentHoveredAnnotationId = null;
      if (this.hoverTooltip) {
        this.hoverTooltip.style.display = "none";
        this.hoverTooltip.style.visibility = "hidden";
      }
    },
    showHoverCommentTooltip(x, y, hData) {
      if (!this.hoverTooltip || !hData || !hData.comment) return;
      this.currentHoveredAnnotationId = hData.id;
      this.hoverTooltip.innerHTML = `
            <div class="lumina-comment-tooltip-card">
                <span class="lumina-comment-tooltip-text">${this.escapeHtml(hData.comment)}</span>
            </div>
        `;
      this.hoverTooltip.style.display = "block";
      this.hoverTooltip.style.visibility = "visible";
      const cardHeight = this.hoverTooltip.offsetHeight || 30;
      const cardWidth = this.hoverTooltip.offsetWidth || 160;
      let startRect = null;
      if (hData.range) {
        const rects = hData.range.getClientRects();
        startRect = rects.length > 0 ? rects[0] : hData.range.getBoundingClientRect();
      }
      if (startRect) {
        const inputContainer = document.querySelector(".lumina-chat-input-container");
        const inputTop = inputContainer ? inputContainer.getBoundingClientRect().top : window.innerHeight - 100;
        const topBar = document.querySelector(".topbar, .header, .lumina-header");
        const headerBottom = topBar ? topBar.getBoundingClientRect().bottom : 50;
        if (startRect.bottom < headerBottom || startRect.top > inputTop) {
          this.hideHoverTooltip();
          return;
        }
      }
      let left = startRect ? startRect.left : x;
      let top = startRect ? startRect.top - cardHeight - 2 : y - cardHeight - 2;
      if (top < 10 && startRect) {
        top = startRect.bottom + 2;
      }
      if (left + cardWidth > window.innerWidth - 10) left = Math.max(10, window.innerWidth - cardWidth - 10);
      if (left < 10) left = 10;
      if (top < 10) top = 10;
      this.hoverTooltip.style.left = left + "px";
      this.hoverTooltip.style.top = top + "px";
    },
    cleanup() {
      this.setScrollLock(false);
      this._unbindSelectionScrollTracking();
      if (this.shadowRoot) {
        this.shadowRoot.querySelectorAll("#lumina-action-bar, #lumina-ask-input-popup, .lumina-overlay-backdrop").forEach((el) => el.remove());
      }
    },
    updatePosition(element = this.btn) {
      if (!element) return;
      let rect = null;
      if (this.useMousePosition && this.anchorCoords) {
        rect = {
          top: this.anchorCoords.y,
          bottom: this.anchorCoords.y,
          left: this.anchorCoords.x,
          right: this.anchorCoords.x,
          width: 0,
          height: 0
        };
      } else if (this.isInsideEditable()) {
        if (this.mouseCoords) {
          rect = {
            top: this.mouseCoords.y,
            bottom: this.mouseCoords.y,
            left: this.mouseCoords.x,
            right: this.mouseCoords.x,
            width: 0,
            height: 0
          };
        } else {
          const active = this.getDeepActiveElement();
          if (active) {
            rect = active.getBoundingClientRect();
          }
        }
      } else {
        if (!this.range) return;
        const firstLineRect = this.getSelectionFirstLineRect(this.range);
        if (firstLineRect && firstLineRect.width > 0) {
          rect = firstLineRect;
        } else {
          rect = this.range.getBoundingClientRect();
        }
      }
      if (!rect) {
        this.hide();
        return;
      }
      const top = rect.top;
      const left = rect.left;
      const btnWidth = element.offsetWidth;
      const btnHeight = element.offsetHeight || 34;
      const margin = 5;
      let finalTop = top - btnHeight - margin;
      let finalLeft = left;
      if (finalTop < 10) {
        finalTop = rect.bottom + margin;
      }
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      if (finalLeft < 10) finalLeft = 10;
      if (finalLeft + btnWidth > viewportWidth - 10) finalLeft = Math.max(10, viewportWidth - btnWidth - 10);
      if (finalTop < 10) finalTop = 10;
      if (finalTop + btnHeight > viewportHeight - 10) finalTop = Math.max(10, viewportHeight - btnHeight - 10);
      element.style.left = finalLeft + "px";
      element.style.top = finalTop + "px";
    },
    show(x, y, text, range, useMousePosition = false) {
      if (!this.btn) return;
      this.text = text;
      this.range = range;
      this.useMousePosition = useMousePosition;
      if (x !== void 0 && y !== void 0 && x !== 0 && y !== 0) {
        this.mouseCoords = { x, y };
      }
      if (this.useMousePosition && this.mouseCoords) {
        this.anchorCoords = { ...this.mouseCoords };
      } else {
        this.anchorCoords = null;
      }
      this.sourceEntry = null;
      if (range && range.startContainer) {
        const node = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
        this.sourceEntry = node ? node.closest(".lumina-entry") : null;
      }
      this.annotationMode = false;
      this.showExtraColors = false;
      this.renderDefaultActionBar();
      this.btn.style.display = "flex";
      this.btn.style.visibility = "visible";
      this.updatePosition(this.btn);
      this._bindSelectionScrollTracking();
    },
    showCommentInput() {
      if (!this.inputPopup || !this.btn) return;
      this.btn.style.display = "none";
      this.btn.style.visibility = "hidden";
      this.inputPopup.style.display = "flex";
      this.inputPopup.style.visibility = "visible";
      if (this.inputField) {
        let existingComment = "";
        const annotationEngine = window.LuminaAnnotation || LuminaAnnotation;
        if (this.annotationMode && this.currentAnnotationId && annotationEngine) {
          const data = annotationEngine.highlightsMap.get(this.currentAnnotationId);
          if (data) existingComment = data.comment || "";
        }
        this.inputField.value = existingComment;
        this.inputField.setAttribute("placeholder", "Add a comment...");
        setTimeout(() => {
          this.inputField.focus();
        }, 10);
      }
      this.updatePosition(this.inputPopup);
      this._bindSelectionScrollTracking();
      this.setScrollLock(true);
    },
    escapeHtml(str) {
      return (str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    },
    showAnnotationMenu(targetElOrRange, id, currentColor) {
      if (!this.btn || !targetElOrRange) return;
      this.currentAnnotationId = id;
      this.annotationMode = true;
      this.currentHighlightColor = currentColor || "#FFFB78";
      this.showExtraColors = false;
      if (targetElOrRange instanceof Range) {
        this.range = targetElOrRange;
      } else {
        const range = document.createRange();
        range.selectNodeContents(targetElOrRange);
        this.range = range;
      }
      this.useMousePosition = false;
      this.anchorCoords = null;
      this.renderDefaultActionBar();
      this.btn.style.display = "flex";
      this.btn.style.visibility = "visible";
      this.updatePosition();
    },
    resetActionBar() {
      if (!this.btn) return;
      this.annotationMode = false;
      this.currentAnnotationId = null;
      this.renderDefaultActionBar();
    },
    hide() {
      if (this.btn) {
        this.btn.style.display = "none";
        this.btn.style.visibility = "hidden";
        if (this.annotationMode) {
          this.resetActionBar();
        }
      }
      if (this.inputPopup) {
        this.inputPopup.style.display = "none";
        this.inputPopup.style.visibility = "hidden";
      }
      this.text = "";
      this.range = null;
      this.useMousePosition = false;
      this.anchorCoords = null;
      this._unbindSelectionScrollTracking();
      this.setScrollLock(false);
      if (this.onHide) this.onHide();
    },
    setScrollLock(lock) {
      const isSpotlight = document.body.classList.contains("lumina-page") || window.location.pathname.includes("lumina.html");
      if (isSpotlight) return;
      if (lock) {
        if (!this.inputBackdrop) {
          this.inputBackdrop = document.createElement("div");
          this.inputBackdrop.className = "lumina-overlay-backdrop";
          this.inputBackdrop.style.zIndex = "2147483646";
          this.inputBackdrop.addEventListener("wheel", (e) => e.preventDefault(), { passive: false });
          this.inputBackdrop.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });
          this.inputBackdrop.addEventListener("click", () => this.hide());
          this.shadowRoot.appendChild(this.inputBackdrop);
        }
        this.inputBackdrop.style.display = "block";
        this.originalOverflowBody = document.body.style.overflow;
        this.originalOverflowHtml = document.documentElement.style.overflow;
        document.body.style.overflow = "hidden";
        document.documentElement.style.overflow = "hidden";
        document.querySelectorAll(".lumina-chat-scroll-content").forEach((el) => {
          el.style.overflow = "hidden";
        });
        this._scrollPreventer = (e) => {
          if (e.target.closest(".lumina-ask-input-field") || e.target.closest(".lumina-tooltip")) {
            return;
          }
          e.preventDefault();
        };
        window.addEventListener("wheel", this._scrollPreventer, { passive: false });
        window.addEventListener("touchmove", this._scrollPreventer, { passive: false });
      } else {
        document.body.style.overflow = this.originalOverflowBody || "";
        document.documentElement.style.overflow = this.originalOverflowHtml || "";
        document.querySelectorAll(".lumina-chat-scroll-content").forEach((el) => {
          el.style.overflow = "auto";
        });
        if (this._scrollPreventer) {
          window.removeEventListener("wheel", this._scrollPreventer);
          window.removeEventListener("touchmove", this._scrollPreventer);
          this._scrollPreventer = null;
        }
        if (this.inputBackdrop) {
          this.inputBackdrop.style.display = "none";
        }
      }
    },
    getSelectionFirstLineRect(range) {
      const rects = range.getClientRects();
      if (rects.length > 0) {
        let firstRect = rects[0];
        for (let i = 0; i < rects.length; i++) {
          if (rects[i].width > 1) {
            firstRect = rects[i];
            break;
          }
        }
        return firstRect;
      }
      return range.getBoundingClientRect();
    },
    getDeepActiveElement(root = document) {
      if (typeof LuminaChatUI !== "undefined" && typeof LuminaChatUI.getDeepActiveElement === "function") {
        return LuminaChatUI.getDeepActiveElement(root);
      }
      let active = root.activeElement;
      while (active && active.shadowRoot) {
        active = active.shadowRoot.activeElement;
      }
      return active;
    },
    _isScrollableElement(element) {
      if (!element || element === document.body || element === document.documentElement) {
        return false;
      }
      try {
        const style = window.getComputedStyle(element);
        return ["auto", "scroll", "overlay"].includes(style.overflowY) || ["auto", "scroll", "overlay"].includes(style.overflowX);
      } catch (error) {
        return false;
      }
    },
    _getSelectionScrollTargets(range) {
      const targets = /* @__PURE__ */ new Set([window]);
      const addAncestors = (node) => {
        let current = node;
        while (current) {
          if (current.nodeType === 1 && this._isScrollableElement(current)) {
            targets.add(current);
          }
          current = current.parentNode || (current.host && current.host.nodeType === 1 ? current.host : null);
        }
      };
      if (range && range.commonAncestorContainer) {
        addAncestors(range.commonAncestorContainer);
      }
      const scrollingElement = document.scrollingElement || document.documentElement || document.body;
      if (scrollingElement) targets.add(scrollingElement);
      return Array.from(targets);
    },
    _unbindSelectionScrollTracking() {
      if (!this._selectionScrollTargets || !this._selectionScrollHandler) return;
      for (const target of this._selectionScrollTargets) {
        try {
          target.removeEventListener("scroll", this._selectionScrollHandler);
        } catch (error) {
        }
      }
      this._selectionScrollTargets = null;
      this._selectionScrollHandler = null;
    },
    _bindSelectionScrollTracking() {
      this._unbindSelectionScrollTracking();
      const targets = this._getSelectionScrollTargets(this.range);
      if (!targets.length) return;
      this._selectionScrollTargets = targets;
      this._selectionScrollHandler = () => {
        if (this.btn && this.btn.style.display === "flex") {
          this.updatePosition(this.btn);
        }
        if (this.inputPopup && this.inputPopup.style.display === "flex") {
          this.updatePosition(this.inputPopup);
        }
      };
      for (const target of targets) {
        target.addEventListener("scroll", this._selectionScrollHandler, { passive: true });
      }
    },
    isInsideEditable() {
      const active = this.getDeepActiveElement();
      if (active && (["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName) || active.isContentEditable || active.getAttribute("contenteditable") === "true" || active.getAttribute("role") === "textbox")) return true;
      const sel = window.getSelection();
      try {
        if (sel && sel.rangeCount > 0) {
          let node = sel.anchorNode;
          while (node && node !== document.documentElement) {
            if (node.nodeType === 1) {
              if (["INPUT", "TEXTAREA", "SELECT"].includes(node.tagName) || node.isContentEditable || node.contentEditable === "true" || node.getAttribute("contenteditable") === "true" || node.getAttribute("role") === "textbox") return true;
            }
            node = node.parentNode || (node.host && node.host.nodeType === 1 ? node.host : null);
          }
        }
      } catch (e) {
      }
      return false;
    },
    getSelectionRelativeOffsets(container) {
      try {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
        const range = selection.getRangeAt(0);
        if (!container.contains(range.startContainer) || !container.contains(range.endContainer)) {
          return null;
        }
        const getOffset = (targetNode, targetOffset) => {
          let offset = 0;
          const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
          while (walker.nextNode()) {
            const node = walker.currentNode;
            if (node === targetNode) {
              return offset + targetOffset;
            }
            offset += node.textContent.length;
            if (offset > 1e4) break;
          }
          return offset;
        };
        return {
          start: getOffset(range.startContainer, range.startOffset),
          end: getOffset(range.endContainer, range.endOffset)
        };
      } catch (e) {
        return null;
      }
    },
    restoreSelectionFromOffsets(container, offsets) {
      if (!offsets) return;
      try {
        const selection = window.getSelection();
        const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
        let currentOffset = 0;
        let startNode, startOffset, endNode, endOffset;
        while (walker.nextNode()) {
          const node = walker.currentNode;
          const len = node.textContent.length;
          if (!startNode && currentOffset + len >= offsets.start) {
            startNode = node;
            startOffset = offsets.start - currentOffset;
          }
          if (!endNode && currentOffset + len >= offsets.end) {
            endNode = node;
            endOffset = offsets.end - currentOffset;
          }
          if (startNode && endNode) break;
          currentOffset += len;
          if (currentOffset > 1e4) break;
        }
        if (startNode && endNode) {
          const range = document.createRange();
          range.setStart(startNode, startOffset);
          range.setEnd(endNode, endOffset);
          selection.removeAllRanges();
          selection.addRange(range);
        }
      } catch (e) {
      }
    }
  };
  if (typeof window !== "undefined") {
    window.LuminaSelection = LuminaSelection;
  }
  if (typeof globalThis !== "undefined") {
    globalThis.LuminaSelection = LuminaSelection;
  }

  // src/helpers/freedict_parser.js
  var FreeDictParser = {
    parse: function(apiData) {
      if (!apiData) return { word: "", entries: [] };
      if (apiData && Array.isArray(apiData.entries)) return apiData;
      const result = {
        word: "",
        entries: []
      };
      if (!Array.isArray(apiData) || apiData.length === 0) {
        return result;
      }
      result.word = apiData[0].word || "";
      const getLemma = (w) => {
        if (!w) return "";
        if (w.endsWith("ss")) return w;
        if (w.endsWith("ies")) return w.slice(0, -3) + "y";
        if (w.endsWith("es")) {
          const base = w.slice(0, -2);
          if (base.endsWith("sh") || base.endsWith("ch") || base.endsWith("x") || base.endsWith("s") || base.endsWith("z")) {
            return base;
          }
          return w.slice(0, -1);
        }
        if (w.endsWith("s") && !w.endsWith("us") && !w.endsWith("is") && !w.endsWith("as")) {
          return w.slice(0, -1);
        }
        return w;
      };
      const getAmericanSpelling = (w) => {
        if (!w) return "";
        return w.replace(/isation/gi, "ization").replace(/isations/gi, "izations").replace(/ise\b/gi, "ize").replace(/ises\b/gi, "izes").replace(/ised\b/gi, "ized").replace(/ising\b/gi, "izing").replace(/yse\b/gi, "yze").replace(/yses\b/gi, "yzes").replace(/ysed\b/gi, "yzed").replace(/ysing\b/gi, "yzing");
      };
      apiData.forEach((item) => {
        const wordLower = (item.word || result.word || "").toLowerCase().trim();
        const lemma = getLemma(wordLower);
        const audioLemma = getAmericanSpelling(lemma);
        let ukIPA = "";
        let usIPA = "";
        let ukAudio = `https://ssl.gstatic.com/dictionary/static/sounds/oxford/${encodeURIComponent(audioLemma)}--_gb_1.mp3`;
        let usAudio = `https://ssl.gstatic.com/dictionary/static/sounds/oxford/${encodeURIComponent(audioLemma)}--_us_1.mp3`;
        const phonetics = item.phonetics || [];
        const ukPhonetic = phonetics.find(
          (p) => p.audio && (p.audio.includes("-uk") || p.audio.includes("-au") || p.audio.includes("uk_pron")) || p.text && (p.text.includes("uk") || p.text.includes("br"))
        );
        if (ukPhonetic) {
          ukIPA = ukPhonetic.text || "";
        }
        const usPhonetic = phonetics.find(
          (p) => p.audio && (p.audio.includes("-us") || p.audio.includes("-ca") || p.audio.includes("us_pron")) || p.text && (p.text.includes("us") || p.text.includes("am"))
        );
        if (usPhonetic) {
          usIPA = usPhonetic.text || "";
        }
        if (!ukIPA || !usIPA) {
          const texts = phonetics.filter((p) => p.text).map((p) => p.text);
          if (texts.length > 0) {
            if (!ukIPA) ukIPA = texts[0];
            if (!usIPA) usIPA = texts[1] || texts[0];
          } else if (item.phonetic) {
            if (!ukIPA) ukIPA = item.phonetic;
            if (!usIPA) usIPA = item.phonetic;
          }
        }
        const cleanIPA = (ipa) => ipa ? ipa.replace(/^\/|\/$/g, "") : "";
        ukIPA = cleanIPA(ukIPA);
        usIPA = cleanIPA(usIPA);
        const formatAudio = (url) => {
          if (!url) return "";
          if (url.startsWith("//")) return "https:" + url;
          return url;
        };
        ukAudio = formatAudio(ukAudio);
        usAudio = formatAudio(usAudio);
        const meanings = item.meanings || [];
        meanings.forEach((meaning) => {
          const pos = meaning.partOfSpeech || "";
          const senseData = {
            indicator: "",
            definitions: []
          };
          const defs = meaning.definitions || [];
          defs.forEach((def) => {
            const meaningText = def.definition || "";
            const examples = def.example ? [def.example] : [];
            if (meaningText) {
              senseData.definitions.push({
                meaning: meaningText,
                translation: "",
                examples
              });
            }
          });
          if (senseData.definitions.length > 0) {
            result.entries.push({
              word: item.word || result.word,
              pos,
              uk: { ipa: ukIPA, audio: ukAudio },
              us: { ipa: usIPA, audio: usAudio },
              senses: [senseData]
            });
          }
        });
      });
      return result;
    }
  };
  if (typeof window !== "undefined") {
    window.FreeDictParser = FreeDictParser;
  }
  if (typeof globalThis !== "undefined") {
    globalThis.FreeDictParser = FreeDictParser;
  }

  // src/components/dictionary/dictionary_popup.js
  var LuminaDictionaryPopup = {
    instance: null,
    currentWord: "",
    currentSource: "dictionary",
    resultsCache: /* @__PURE__ */ new Map(),
    ongoingRequests: /* @__PURE__ */ new Set(),
    isManualSelection: false,
    getFallbackSource(source) {
      return null;
    },
    async show(word, options = {}) {
      if (this.instance) {
        this.instance.remove();
      }
      if (this.currentWord !== word) {
        this.currentWord = word;
      }
      let initialSource = options.source || "dictionary";
      if (initialSource === "freedict" || initialSource === "ai" || initialSource === "cambridge" || initialSource === "oxford") {
        initialSource = "dictionary";
      }
      const saved = await chrome.storage.local.get(["preferredDictSource"]);
      if (saved.preferredDictSource && saved.preferredDictSource !== "freedict" && saved.preferredDictSource !== "ai") {
        initialSource = saved.preferredDictSource;
      }
      if (initialSource === "cambridge" || initialSource === "oxford") {
        initialSource = "dictionary";
      }
      this.currentSource = initialSource;
      this.isManualSelection = false;
      if (!this.messageListenerAdded) {
        chrome.runtime.onMessage.addListener((msg) => {
          if (msg.action === "background_log") {
            console.log(`%c[BG Bridge]%c ${msg.message}`, "color: #ff9800; font-weight: bold;", "color: inherit;");
          }
        });
        this.messageListenerAdded = true;
      }
      const dimensions = await chrome.storage.local.get(["dictPopupWidth", "dictPopupHeight"]);
      const width = dimensions.dictPopupWidth || 420;
      const height = dimensions.dictPopupHeight || 460;
      const popup = document.createElement("div");
      popup.id = "lumina-dictionary-popup";
      popup.className = "lumina-dictionary-popup";
      let x = options.x || window.innerWidth / 2 - width / 2;
      let y = options.y || window.innerHeight / 2 - height / 2;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      if (x + width > viewportWidth - 10) x = viewportWidth - width - 10;
      if (x < 10) x = 10;
      if (y + height > viewportHeight - 10) y = viewportHeight - height - 10;
      if (y < 10) y = 10;
      popup.style.left = `${x}px`;
      popup.style.top = `${y}px`;
      popup.style.width = `${width}px`;
      popup.style.height = `${height}px`;
      popup.innerHTML = `
            <div class="lumina-dict-body">
                <div class="lumina-dict-scroll-area">
                    <div class="lumina-dict-loading-state">
                        <div class="lumina-loading-spinner"></div>
                    </div>
                </div>
            </div>
            <div class="lumina-dict-footer" style="${this.currentSource === "translate" ? "display: none !important;" : ""}">
                <div class="lumina-dict-tabs">
                    <button class="lumina-dict-tab-btn ${this.currentSource === "dictionary" ? "active" : ""}" data-source="dictionary">Dictionary</button>
                    <button class="lumina-dict-tab-btn ${this.currentSource === "images" ? "active" : ""}" data-source="images">Images</button>
                </div>
            </div>
            <div class="lumina-dict-resizer-right"></div>
            <div class="lumina-dict-resizer-bottom"></div>
            <div class="lumina-dict-resizer-corner"></div>
        `;
      const shadowHost = document.getElementById("lumina-shadow-host");
      if (shadowHost && shadowHost.shadowRoot) {
        shadowHost.shadowRoot.appendChild(popup);
      } else {
        document.body.appendChild(popup);
      }
      this.instance = popup;
      this.setupEvents();
      this.fetchData(this.currentSource);
    },
    switchSource(source) {
      if (!this.instance || source === this.currentSource) return;
      const tabs = this.instance.querySelectorAll(".lumina-dict-tab-btn");
      const targetTab = Array.from(tabs).find((t) => t.dataset.source === source);
      if (!targetTab) return;
      tabs.forEach((t) => t.classList.remove("active"));
      targetTab.classList.add("active");
      this.currentSource = source;
      if (source !== "images" && source !== "translate") {
        chrome.storage.local.set({ preferredDictSource: source });
      }
      this.fetchData(source);
    },
    setupEvents() {
      if (!this.instance) return;
      const tabs = this.instance.querySelectorAll(".lumina-dict-tab-btn");
      tabs.forEach((tab) => {
        tab.onclick = () => {
          this.isManualSelection = true;
          this.switchSource(tab.dataset.source);
        };
      });
      const cornerResizer = this.instance.querySelector(".lumina-dict-resizer-corner");
      const rightResizer = this.instance.querySelector(".lumina-dict-resizer-right");
      const bottomResizer = this.instance.querySelector(".lumina-dict-resizer-bottom");
      let isResizing = false;
      let resizingMode = null;
      let startX, startY, startW, startH;
      const startResize = (e, mode) => {
        isResizing = true;
        resizingMode = mode;
        startX = e.clientX;
        startY = e.clientY;
        startW = this.instance.offsetWidth;
        startH = this.instance.offsetHeight;
        this.instance.classList.add("is-resizing");
        e.preventDefault();
        e.stopPropagation();
      };
      if (cornerResizer) cornerResizer.onmousedown = (e) => startResize(e, "corner");
      if (rightResizer) rightResizer.onmousedown = (e) => startResize(e, "right");
      if (bottomResizer) bottomResizer.onmousedown = (e) => startResize(e, "bottom");
      const moveHandler = (e) => {
        if (isResizing) {
          const dw = e.clientX - startX;
          const dh = e.clientY - startY;
          if (resizingMode === "right" || resizingMode === "corner") {
            this.instance.style.width = `${Math.max(300, startW + dw)}px`;
          }
          if (resizingMode === "bottom" || resizingMode === "corner") {
            this.instance.style.height = `${Math.max(250, startH + dh)}px`;
          }
          if (window._dictResizeTimer) clearTimeout(window._dictResizeTimer);
          window._dictResizeTimer = setTimeout(() => {
            chrome.storage.local.set({
              dictPopupWidth: parseInt(this.instance.style.width),
              dictPopupHeight: parseInt(this.instance.style.height)
            });
          }, 500);
        }
      };
      const upHandler = () => {
        if (isResizing) {
          isResizing = false;
          this.instance.classList.remove("is-resizing");
        }
      };
      const outsideClickHandler = (e) => {
        if (!this.instance) return;
        const path = e.composedPath();
        const isInside = path.some(
          (el) => el === this.instance || el.id === "lumina-dictionary-popup" || el.id === "lumina-shadow-host" || el.classList && el.classList.contains && el.classList.contains("lumina-dictionary-popup")
        );
        if (!isInside) {
          this.hide();
        }
      };
      window.addEventListener("mousemove", moveHandler);
      window.addEventListener("mouseup", upHandler);
      window.addEventListener("mousedown", outsideClickHandler, true);
      this.instance._cleanup = () => {
        window.removeEventListener("mousemove", moveHandler);
        window.removeEventListener("mouseup", upHandler);
        window.removeEventListener("mousedown", outsideClickHandler, true);
      };
    },
    hide() {
      if (this.instance) {
        if (this.instance._cleanup) this.instance._cleanup();
        this.instance.remove();
        this.instance = null;
      }
    },
    showLoading(source) {
      if (!this.instance) return;
      const scrollArea = this.instance.querySelector(".lumina-dict-scroll-area");
      if (!scrollArea) return;
      scrollArea.innerHTML = `
            <div class="lumina-dict-loading-state">
                <div class="lumina-loading-spinner"></div>
            </div>
        `;
    },
    async fetchData(source = this.currentSource) {
      const cacheKey = `${this.currentWord}_${source}`;
      const now = Date.now();
      const cached = this.resultsCache.get(cacheKey);
      if (cached && now - cached.timestamp < 36e5) {
        if (source === this.currentSource) {
          if (source === "images") this.renderImages(cached.data);
          else if (source === "translate") this.renderTranslation(cached.data);
          else this.renderData(cached.data);
        }
        return;
      }
      const requestKey = `${this.currentWord}_${source}`;
      if (this.ongoingRequests.has(requestKey)) return;
      this.ongoingRequests.add(requestKey);
      if (source === this.currentSource) {
        this.showLoading(source);
      }
      try {
        if (source === "images") {
          const images = typeof searchGoogleImages === "function" ? await searchGoogleImages(this.currentWord) : [];
          this.resultsCache.set(cacheKey, { data: images, timestamp: Date.now() });
          if (source === this.currentSource) this.renderImages(images);
          return;
        }
        const actionMap = {
          "dictionary": "fetch_dictionary",
          "translate": "translate"
        };
        const action = actionMap[source];
        let payload;
        if (source === "translate") {
          payload = { action, text: this.currentWord, targetLang: "vi" };
        } else {
          payload = { action, word: this.currentWord };
        }
        const response = await new Promise((resolve) => {
          chrome.runtime.sendMessage(payload, (res) => {
            if (chrome.runtime.lastError) {
              resolve({ success: false, error: chrome.runtime.lastError.message });
            } else {
              resolve(res);
            }
          });
        });
        if (response && !response.error) {
          if (source === "translate") {
            this.resultsCache.set(cacheKey, { data: response, timestamp: Date.now() });
            if (source === this.currentSource) this.renderTranslation(response);
            return;
          }
          const parser = window.FreeDictParser || FreeDictParser;
          const finalData = response.data ? parser.parse(response.data) : null;
          if (finalData) {
            this.resultsCache.set(cacheKey, { data: finalData, timestamp: Date.now() });
            if (source === this.currentSource) this.renderData(finalData);
          }
          if (!finalData || !finalData.entries || finalData.entries.length === 0) {
            if (source === this.currentSource) {
              const emptyData = finalData || { word: this.currentWord, entries: [] };
              this.renderData(emptyData);
            }
          }
        } else {
          throw new Error(response?.error || "Failed to fetch");
        }
      } catch (err) {
        console.error(`[Lumina Dict] Error in fetchData(${source}):`, err);
        const errMessage = String(err?.message || err || "");
        const isForbidden = /\b403\b|HTTP Status 403|Forbidden/i.test(errMessage);
        const fallbackSource = isForbidden ? this.getFallbackSource(source) : null;
        if (fallbackSource && source === this.currentSource) {
          this.switchSource(fallbackSource);
          return;
        }
        if (source === this.currentSource) {
          const scrollArea = this.instance.querySelector(".lumina-dict-scroll-area");
          if (scrollArea) {
            let title = "Fetch Failed";
            let desc = err.message;
            let icon = "\u26A0\uFE0F";
            if (isForbidden) {
              title = "Access Restricted";
              desc = `The connection to ${source} was blocked. Please try another network.`;
              icon = "\u{1F6AB}";
            }
            scrollArea.innerHTML = `
                        <div class="lumina-dict-status-container status-error">
                            <div class="lumina-dict-status-card">
                                <div class="lumina-dict-status-icon">${icon}</div>
                                <div class="lumina-dict-status-title">${title}</div>
                                <div class="lumina-dict-status-desc">${desc}</div>
                            </div>
                        </div>
                    `;
          }
        }
      } finally {
        this.ongoingRequests.delete(requestKey);
      }
    },
    renderImages(images) {
      if (!this.instance) return;
      const scrollArea = this.instance.querySelector(".lumina-dict-scroll-area");
      if (!images || images.length === 0) {
        scrollArea.innerHTML = `
                <div class="lumina-dict-status-container status-empty">
                    <div class="lumina-dict-status-card">
                        <div class="lumina-dict-status-icon">\u{1F4F8}</div>
                        <div class="lumina-dict-status-title">No Results Found</div>
                    </div>
                </div>
            `;
        return;
      }
      const displayImages = images.slice(0, 4);
      scrollArea.innerHTML = `
            <div class="lumina-dict-images-grid">
                ${displayImages.map((img) => `
                    <div class="lumina-dict-image-card">
                        <div class="lumina-loading-spinner"></div>
                        <img src="${img}" loading="lazy">
                    </div>
                `).join("")}
            </div>
        `;
      const cards = scrollArea.querySelectorAll(".lumina-dict-image-card");
      cards.forEach((card) => {
        const img = card.querySelector("img");
        const spinner = card.querySelector(".lumina-loading-spinner");
        if (img) {
          img.onload = () => {
            if (spinner) spinner.style.setProperty("display", "none", "important");
          };
          img.onerror = () => {
            card.style.setProperty("display", "none", "important");
          };
          img.onclick = () => {
            window.open(img.src, "_blank");
          };
        }
      });
    },
    renderTranslation(data) {
      if (!this.instance) return;
      const scrollArea = this.instance.querySelector(".lumina-dict-scroll-area");
      if (!scrollArea) return;
      const escapeHTML = (str) => {
        if (!str) return "";
        return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
      };
      const safeOriginal = (data.original || this.currentWord || "").replace(/"/g, "&quot;");
      const safeTranslation = (data.translation || "").replace(/"/g, "&quot;");
      let sourceHTML = escapeHTML(data.original || this.currentWord || "");
      let targetHTML = escapeHTML(data.translation || "");
      const isPreSplit = data.sentences && Array.isArray(data.sentences);
      if (isPreSplit) {
        sourceHTML = data.sentences.map((s, idx) => `<span class="lumina-trans-sentence" data-idx="${idx}">${escapeHTML(s.src || "")}</span>`).join(" ");
        targetHTML = data.sentences.map((s, idx) => `<span class="lumina-trans-sentence" data-idx="${idx}">${escapeHTML(s.tgt || "")}</span>`).join(" ");
      }
      scrollArea.innerHTML = `
            <div class="lumina-dict-content-wrapper lumina-dict-translation-wrapper" style="padding: 12px;">
                <div class="lumina-translation-container" style="margin: 0; width: 100%;">
                    <div class="lumina-translation-card" ${isPreSplit ? 'data-is-pre-split="true"' : ""}>
                        <div class="lumina-translation-block" style="padding: 0 8px 0 0;">
                            <div class="lumina-translation-source" data-copy-text="${safeOriginal}">
                                <div class="lumina-translation-text">${sourceHTML}</div>
                            </div>
                        </div>
                        <div class="lumina-translation-divider"></div>
                        <div class="lumina-translation-block" style="padding: 0 0 0 8px;">
                            <div class="lumina-translation-target" data-copy-text="${safeTranslation}">
                                <div class="lumina-translation-text">${targetHTML}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
      const cardContainer = scrollArea.querySelector(".lumina-translation-card");
      if (cardContainer && typeof LuminaChatUI !== "undefined") {
        LuminaChatUI._setupTranslationHighlight(cardContainer);
        LuminaChatUI.balanceTranslationCard(cardContainer);
      }
    },
    renderData(data) {
      if (!this.instance) return;
      const scrollArea = this.instance.querySelector(".lumina-dict-scroll-area");
      if (!data || !data.entries || data.entries.length === 0) {
        scrollArea.innerHTML = `
                <div class="lumina-dict-status-container status-empty">
                    <div class="lumina-dict-status-card">
                        <div class="lumina-dict-status-icon">\u{1F50D}</div>
                        <div class="lumina-dict-status-title">No Results Found</div>
                        <div class="lumina-dict-status-desc">Try checking spelling or choose another source.</div>
                    </div>
                </div>
            `;
        return;
      }
      scrollArea.innerHTML = `<div class="lumina-dict-content-wrapper"></div>`;
      const wrapper = scrollArea.querySelector(".lumina-dict-content-wrapper");
      data.entries.forEach((entry) => {
        const entryEl = document.createElement("div");
        entryEl.className = "lumina-dict-popup-item";
        entryEl.innerHTML = this.buildEntryHTML(entry, data.word);
        wrapper.appendChild(entryEl);
      });
      this.setupAudioListeners(scrollArea);
    },
    shortenPOS(pos) {
      if (!pos) return "";
      const map = {
        "noun": "n.",
        "verb": "v.",
        "adjective": "adj.",
        "adverb": "adv.",
        "preposition": "prep.",
        "prepositional phrase": "prep. phr.",
        "conjunction": "conj.",
        "pronoun": "pron.",
        "interjection": "interj.",
        "phrasal verb": "phr. v.",
        "idiom": "idm.",
        "idiomatic expression": "idm. expr.",
        "exclamation": "excl.",
        "determiner": "det.",
        "number": "num."
      };
      let lower = pos.toLowerCase().trim();
      if (lower.includes("(")) {
        lower = lower.split("(")[0].trim();
      }
      return map[lower] || lower;
    },
    getSpeakerSVG(color = "currentColor") {
      return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="${color}" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`;
    },
    setupAudioListeners(container) {
      const audioBtns = container.querySelectorAll(".lumina-dict-popup-audio");
      let _audioCtx = null;
      const getAudioCtx = () => {
        if (!_audioCtx || _audioCtx.state === "closed") {
          _audioCtx = new AudioContext();
        }
        return _audioCtx;
      };
      let currentAudio = null;
      let audioAborted2 = false;
      const playBase64Audio = (base64Data, speed = 1) => {
        return new Promise(async (resolve, reject) => {
          if (audioAborted2) {
            resolve();
            return;
          }
          try {
            const parts = base64Data.split(",");
            const byteString = atob(parts[1]);
            const byteArray = new Uint8Array(byteString.length);
            for (let i = 0; i < byteString.length; i++) byteArray[i] = byteString.charCodeAt(i);
            let silenceOffset = 0;
            try {
              const ctx = getAudioCtx();
              const audioBuffer = await ctx.decodeAudioData(byteArray.buffer.slice(0));
              const channelData = audioBuffer.getChannelData(0);
              const THRESHOLD = 5e-3;
              for (let i = 0; i < channelData.length; i++) {
                if (Math.abs(channelData[i]) > THRESHOLD) {
                  silenceOffset = i / audioBuffer.sampleRate;
                  break;
                }
              }
            } catch (e) {
            }
            if (audioAborted2) {
              resolve();
              return;
            }
            const mime = parts[0].split(":")[1].split(";")[0];
            const blob = new Blob([byteArray], { type: mime });
            const blobUrl = URL.createObjectURL(blob);
            const audio = new Audio(blobUrl);
            audio.playbackRate = speed;
            if (silenceOffset > 0) audio.currentTime = silenceOffset;
            currentAudio = audio;
            audio.onended = () => {
              currentAudio = null;
              URL.revokeObjectURL(blobUrl);
              resolve();
            };
            audio.onerror = (e) => {
              currentAudio = null;
              URL.revokeObjectURL(blobUrl);
              reject(e);
            };
            audio.play().catch(reject);
          } catch (e) {
            try {
              const audio = new Audio(base64Data);
              audio.playbackRate = speed;
              currentAudio = audio;
              audio.onended = () => {
                currentAudio = null;
                resolve();
              };
              audio.onerror = (err) => {
                currentAudio = null;
                reject(err);
              };
              audio.play().catch(reject);
            } catch (err) {
              reject(err);
            }
          }
        });
      };
      const playWordAudio = async (wordText, originalUrl, language) => {
        if (!wordText) return;
        const normalizedText = wordText.trim();
        audioAborted2 = false;
        if (currentAudio) {
          currentAudio.pause();
          currentAudio = null;
        }
        let speed = 1.1;
        try {
          const data = await chrome.storage.local.get(["audioSpeed"]);
          speed = data.audioSpeed || 1.1;
        } catch (e) {
        }
        try {
          const cached = await chrome.runtime.sendMessage({ action: "getAudioCache", text: normalizedText });
          if (cached && cached.success && cached.data) {
            const chunks = Array.isArray(cached.data) ? cached.data : [cached.data];
            for (const chunk of chunks) await playBase64Audio(chunk, speed);
            return;
          }
        } catch (e) {
        }
        try {
          let result = null;
          if (originalUrl) {
            try {
              result = await chrome.runtime.sendMessage({ action: "fetchAudioBase64", url: originalUrl });
              if (result && result.success && result.data) {
                result = { type: "oxford", chunks: [result.data] };
              } else {
                result = null;
              }
            } catch (e) {
              result = null;
            }
          }
          if (!result) {
            result = await chrome.runtime.sendMessage({ action: "fetchAudio", text: normalizedText, speed, lang: language });
          }
          if (!result || !result.chunks || result.chunks.length === 0) return;
          for (const chunk of result.chunks) await playBase64Audio(chunk, speed);
          chrome.runtime.sendMessage({ action: "setAudioCache", text: normalizedText, type: result.type, data: result.chunks }).catch(() => {
          });
        } catch (err) {
          console.error("[Popup Audio] Play audio failed:", err);
        }
      };
      audioBtns.forEach((btn) => {
        btn.onclick = async (e) => {
          e.stopPropagation();
          const { url, text, lang } = btn.dataset;
          playWordAudio(text, url, lang);
        };
      });
    },
    buildEntryHTML(entry, word) {
      let senseMeaningIndex = 1;
      return `
            <div class="lumina-dict-popup-meta">
                <div class="lumina-dict-header-row">
                    <span class="lumina-dict-popup-title">${entry.word || word}</span>
                    ${entry.pos ? `<span class="lumina-dict-popup-pos">${this.shortenPOS(entry.pos)}</span>` : ""}
                </div>
                <div class="lumina-dict-popup-prons">
                    ${entry.uk?.ipa || entry.uk?.audio ? `
                        <div class="lumina-dict-pron-group uk">
                            <span class="lumina-dict-lang">UK</span>
                            <button class="lumina-dict-popup-audio"
                                data-text="${entry.word || word}" data-lang="en-GB"
                                ${entry.uk?.audio ? `data-url="${entry.uk.audio}"` : ""}>
                                ${this.getSpeakerSVG()}
                            </button>
                            ${entry.uk?.ipa ? `<span class="lumina-dict-ipa">/${entry.uk.ipa.replace(/^\/|\/$/g, "")}/</span>` : ""}
                        </div>
                    ` : ""}
                    ${entry.us?.ipa || entry.us?.audio ? `
                        <div class="lumina-dict-pron-group us">
                            <span class="lumina-dict-lang">US</span>
                            <button class="lumina-dict-popup-audio"
                                data-text="${entry.word || word}" data-lang="en-US"
                                ${entry.us?.audio ? `data-url="${entry.us.audio}"` : ""}>
                                ${this.getSpeakerSVG()}
                            </button>
                            ${entry.us?.ipa ? `<span class="lumina-dict-ipa">/${entry.us.ipa.replace(/^\/|\/$/g, "")}/</span>` : ""}
                        </div>
                    ` : ""}
                </div>
            </div>
            <div class="lumina-dict-popup-senses">
                ${(entry.senses || []).map((sense) => {
        return `
                        <div class="lumina-dict-popup-sense">
                            ${sense.indicator ? `<div class="lumina-dict-sense-indicator">${sense.indicator}</div>` : ""}
                            ${(sense.definitions || []).map((def) => {
          const html = `
                                    <div class="lumina-dict-popup-meaning">
                                        <div class="lumina-dict-meaning-header">
                                            ${sense.definitions.length > 1 ? `<span class="lumina-dict-meaning-number">${senseMeaningIndex}.</span>` : ""}
                                            <span class="lumina-dict-meaning-text">${def.meaning}</span>
                                        </div>
                                        ${def.examples && def.examples.length > 0 ? `
                                            <div class="lumina-dict-popup-examples">
                                                ${def.examples.map((ex) => {
            const escaped = (entry.word || word || "").replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
            const regex = new RegExp(`(${escaped}(?:ing|ed|s|es|d)?)`, "gi");
            const highlighted = ex.replace(regex, "<strong>$1</strong>");
            return `<div class="lumina-dict-popup-example">${highlighted}</div>`;
          }).join("")}
                                            </div>
                                        ` : ""}
                                    </div>
                                `;
          senseMeaningIndex++;
          return html;
        }).join("")}
                        </div>
                    `;
      }).join("")}
            </div>
        `;
    }
  };
  if (typeof window !== "undefined") {
    window.LuminaDictionaryPopup = LuminaDictionaryPopup;
  }
  if (typeof globalThis !== "undefined") {
    globalThis.LuminaDictionaryPopup = LuminaDictionaryPopup;
  }

  // src/content/index.js
  (() => {
    window.katexLoaded = true;
    const eventCleanup = new EventCleanupManager();
    const shadowManager = new ShadowHostManager();
    const { host: luminaHost, shadowRoot: luminaShadowRoot } = shadowManager.init();
    let currentCachedZoom = 1;
    function updateCachedZoom(callback) {
      if (!chrome.runtime || !chrome.runtime.id) {
        if (callback) callback(getPageZoom());
        return;
      }
      try {
        chrome.runtime.sendMessage({ action: "get_zoom" }, (zoom) => {
          if (chrome.runtime.lastError) {
            if (callback) callback(getPageZoom());
            return;
          }
          if (typeof zoom === "number") {
            currentCachedZoom = zoom;
          }
          if (callback) callback(currentCachedZoom);
        });
      } catch (e) {
        if (callback) callback(getPageZoom());
      }
    }
    updateCachedZoom();
    window.addEventListener("resize", () => {
      updateCachedZoom(() => {
        if (window.LuminaSelection) {
          LuminaSelection.hide();
        }
      });
    });
    function getPageZoom() {
      if (currentCachedZoom && currentCachedZoom !== 1) return currentCachedZoom;
      const dpr = window.devicePixelRatio || 1;
      const isMac = /mac/i.test(navigator.platform);
      if (isMac) {
        const baseDpr = Math.round(dpr) || 1;
        return dpr / baseDpr;
      }
      return 1;
    }
    let readWebpageEnabled = false;
    let askSelectionPopupEnabled = false;
    let currentRange = null;
    let currentText = "";
    let isExtensionDisabled = false;
    function isRuntimeAvailable() {
      return typeof chrome !== "undefined" && !!chrome.runtime && !!chrome.runtime.id;
    }
    function safeRuntimeSendMessage(message, callback) {
      if (!isRuntimeAvailable()) return false;
      try {
        chrome.runtime.sendMessage(message, callback);
        return true;
      } catch (error) {
        return false;
      }
    }
    function triggerSidePanelQuery(query, displayQuery = null, mode = "qa", range = null, shouldHighlight = true) {
      if (shouldHighlight && window.LuminaAnnotation) {
        const finalRange = range || (window.getSelection().rangeCount > 0 ? window.getSelection().getRangeAt(0) : null);
        if (finalRange && !finalRange.collapsed) {
          const color = "#FFFB78";
          window.LuminaAnnotation.highlight(finalRange, color);
          const selection = window.getSelection();
          if (selection) selection.removeAllRanges();
        }
      }
      safeRuntimeSendMessage({
        action: "open_sidepanel_with_query",
        query,
        displayQuery: displayQuery || query,
        mode
      });
    }
    if (window.LuminaSelection) {
      LuminaSelection.init({
        shadowRoot: luminaShadowRoot,
        onSubmit: (query, displayQuery, isDictionary, sourceEntry, range, isTranslate, isAudio) => {
          if (isAudio) {
            playCombinedAudio(displayQuery);
            return;
          }
          if (isTranslate) {
            triggerSidePanelQuery(query, displayQuery, "translate", range);
            return;
          }
          if (isDictionary) {
            const selection = window.getSelection();
            const text = selection.toString().trim() || displayQuery;
            if (text) {
              const rangeToUse = range || (selection.rangeCount > 0 ? selection.getRangeAt(0) : null);
              const rect = rangeToUse ? rangeToUse.getBoundingClientRect() : { left: window.innerWidth / 2, bottom: window.innerHeight / 2 };
              LuminaDictionaryPopup.show(text, {
                x: rect.left,
                y: rect.bottom + 5,
                source: "dictionary"
              });
              return;
            }
          }
          triggerSidePanelQuery(query, displayQuery, isDictionary ? "dictionary" : "qa", range);
        }
      });
    }
    let lastMouseX = 0;
    let lastMouseY = 0;
    window.addEventListener("mousemove", (e) => {
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
      if (window.LuminaSelection) {
        LuminaSelection.mouseCoords = { x: e.clientX, y: e.clientY };
      }
    }, { passive: true });
    window.addEventListener("mouseup", (e) => {
      if (isExtensionDisabled) return;
      if (window.LuminaSelection && LuminaSelection.isInteractingWithActionBar) return;
      const path = e.composedPath();
      const isInsideShadow = path.some((el) => el.id === "lumina-shadow-host" || el.tagName && el.tagName.toLowerCase() === "lumina-shadow-host");
      if (isInsideShadow) return;
      if (askSelectionPopupEnabled) {
        const sel = window.getSelection();
        const selText = sel ? sel.toString().trim() : "";
        if (selText.length > 0) {
          e.stopPropagation();
        }
      }
      const activeElement = window.LuminaSelection ? LuminaSelection.getDeepActiveElement() : document.activeElement;
      const isInput = activeElement && (activeElement.tagName === "INPUT" || activeElement.tagName === "TEXTAREA");
      setTimeout(() => {
        let text = "";
        let range = null;
        if (isInput) {
          const start = activeElement.selectionStart;
          const end = activeElement.selectionEnd;
          if (start !== void 0 && end !== void 0 && start !== end) {
            text = activeElement.value.substring(start, end).trim();
          }
          range = null;
        } else {
          const finalSelection = window.getSelection();
          text = finalSelection.toString().trim();
          range = finalSelection.rangeCount > 0 ? finalSelection.getRangeAt(0) : null;
        }
        if (!askSelectionPopupEnabled || text.length === 0) {
          const isHighlight = e.target.closest(".lumina-highlight") || window.LuminaAnnotation && LuminaAnnotation.getHighlightAtCoords(e.clientX, e.clientY);
          if (window.LuminaSelection && !isHighlight) LuminaSelection.hide();
          return;
        }
        if (text.length > 0 && (range || isInput) && window.LuminaSelection) {
          if (e.clientX && e.clientY) {
            LuminaSelection.mouseCoords = { x: e.clientX, y: e.clientY };
          }
          LuminaSelection.show(e.clientX, e.clientY, text, range);
        } else if (!isInsideShadow) {
          const isHighlight = e.target.closest(".lumina-highlight");
          if (window.LuminaSelection && !isHighlight) LuminaSelection.hide();
        }
      }, 50);
    }, true);
    window.addEventListener("mousedown", (e) => {
      const path = e.composedPath();
      const isInsideAskBtn = path.some((el) => el.id === "lumina-action-bar" || el.id === "lumina-ask-input-popup" || window.LuminaSelection && el === LuminaSelection.btn);
      const isHighlight = window.LuminaAnnotation && LuminaAnnotation.getHighlightAtCoords(e.clientX, e.clientY);
      if (!isInsideAskBtn && !isHighlight) {
        if (window.LuminaSelection) LuminaSelection.hide();
      }
    }, true);
    chrome.storage.local.get(["readWebpage", "askSelectionPopupEnabled"], (result) => {
      readWebpageEnabled = result.readWebpage ?? false;
      askSelectionPopupEnabled = result.askSelectionPopupEnabled ?? false;
      if (window.LuminaAnnotation) {
        LuminaAnnotation.loadHighlights();
      }
    });
    let lastUrl = window.location.href;
    setInterval(() => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        if (window.LuminaAnnotation) {
          LuminaAnnotation.clearAllHighlights();
          LuminaAnnotation.loadHighlights();
        }
      }
    }, 500);
    const DEFAULT_SHORTCUTS = LUMINA_DEFAULT_SHORTCUTS || {};
    let shortcuts = { ...DEFAULT_SHORTCUTS };
    let questionMappings = [];
    chrome.storage.local.get(["shortcuts", "annotationShortcuts", "questionMappings", "disabledDomains"], (items) => {
      if (items.shortcuts) Object.assign(shortcuts, items.shortcuts);
      if (items.annotationShortcuts) shortcuts.annotationShortcuts = items.annotationShortcuts;
      if (items.questionMappings) questionMappings = items.questionMappings;
      const disabledDomains = items.disabledDomains || [];
      if (disabledDomains.includes(window.location.hostname)) {
        isExtensionDisabled = true;
      }
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (!chrome.runtime || !chrome.runtime.id) return;
      if (area === "local") {
        if (changes.readWebpage) readWebpageEnabled = changes.readWebpage.newValue ?? false;
        if (changes.askSelectionPopupEnabled) {
          askSelectionPopupEnabled = changes.askSelectionPopupEnabled.newValue ?? false;
          if (!askSelectionPopupEnabled && window.LuminaSelection) LuminaSelection.hide();
        }
        if (changes.questionMappings) questionMappings = changes.questionMappings.newValue || [];
        if (changes.shortcuts) Object.assign(shortcuts, changes.shortcuts.newValue || DEFAULT_SHORTCUTS);
        if (changes.annotationShortcuts) shortcuts.annotationShortcuts = changes.annotationShortcuts.newValue || [];
        if (changes.fontSize || changes.fontSizeByDomain || changes.globalDefaults) {
          shadowManager.applyAskSelectionStyles();
        }
        if (changes.theme || changes.contrast || changes.accentColor || changes.globalDefaults) {
          shadowManager.updateTheme();
        }
      }
    });
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (!chrome.runtime || !chrome.runtime.id) return;
      if (request.action === "toggle_extension_state") {
        isExtensionDisabled = !request.isEnabled;
        if (isExtensionDisabled && window.LuminaSelection) {
          LuminaSelection.hide();
        }
      } else if (request.action === "get_page_content") {
        extractMainContent().then((result) => {
          sendResponse({ text: result.content || "" });
        }).catch((err) => {
          sendResponse({ text: document.body ? document.body.innerText : "" });
        });
        return true;
      }
    });
    const ytButtonManager = new YouTubeButtonManager();
    document.addEventListener("yt-navigate-finish", () => {
      if (window.location.hostname.includes("youtube.com")) {
        ytButtonManager.init();
      }
    });
    if (window.location.hostname.includes("youtube.com")) {
      setTimeout(() => ytButtonManager.init(), 1e3);
    }
    document.addEventListener("click", (e) => {
      if (isExtensionDisabled) return;
      const path = e.composedPath();
      const isInsideLumina = path.some((el) => el.id === "lumina-action-bar" || el.id === "lumina-ask-input-popup" || el.id === "lumina-shadow-host" || el.id === "lumina-comment-hover-tooltip" || el.tagName && el.tagName.toLowerCase() === "lumina-shadow-host");
      if (isInsideLumina || window.LuminaSelection && LuminaSelection.isInteractingWithActionBar) return;
      if (window.LuminaAnnotation) {
        const hData = LuminaAnnotation.getHighlightAtCoords(e.clientX, e.clientY);
        if (hData) {
          e.preventDefault();
          e.stopPropagation();
          if (window.LuminaSelection) {
            LuminaSelection.showAnnotationMenu(hData.range, hData.id, hData.color);
          }
        }
      }
    }, true);
    let modifierKeyPressedAlone = true;
    function getSelectedTextForAudio() {
      let text = "";
      const activeElement = window.LuminaSelection ? LuminaSelection.getDeepActiveElement() : document.activeElement;
      const isInput = activeElement && (activeElement.tagName === "INPUT" || activeElement.tagName === "TEXTAREA");
      if (isInput) {
        const start = activeElement.selectionStart;
        const end = activeElement.selectionEnd;
        if (start !== void 0 && end !== void 0 && start !== end) {
          text = activeElement.value.substring(start, end).trim();
        }
      }
      if (!text) {
        const selection = getActiveSelection();
        text = getSmartSelectionText() || (selection ? selection.toString().trim() : "");
      }
      return text;
    }
    function isShortcutMatch(event, shortcut) {
      if (!shortcut) return false;
      if (shortcut.modifiers && Array.isArray(shortcut.modifiers)) {
        const hasCtrl = shortcut.modifiers.includes("Ctrl") || shortcut.modifiers.includes("Control");
        const hasAlt = shortcut.modifiers.includes("Alt");
        const hasShift = shortcut.modifiers.includes("Shift");
        const hasMeta = shortcut.modifiers.includes("Meta") || shortcut.modifiers.includes("Cmd") || shortcut.modifiers.includes("Command");
        if (hasCtrl !== event.ctrlKey) return false;
        if (hasAlt !== event.altKey) return false;
        if (hasShift !== event.shiftKey) return false;
        if (hasMeta !== event.metaKey) return false;
        if (shortcut.key === "Shift" || shortcut.key === "Control" || shortcut.key === "Alt" || shortcut.key === "Meta") {
          return event.key === shortcut.key;
        }
        if (shortcut.code && event.code === shortcut.code) return true;
        return (event.key || "").toLowerCase() === (shortcut.key || "").toLowerCase();
      }
      const ctrlMatch = !!shortcut.ctrlKey === event.ctrlKey;
      const altMatch = !!shortcut.altKey === event.altKey;
      const shiftMatch = !!shortcut.shiftKey === event.shiftKey;
      const metaMatch = !!shortcut.metaKey === event.metaKey;
      if (!ctrlMatch || !altMatch || !shiftMatch || !metaMatch) return false;
      if (shortcut.code && event.code === shortcut.code) return true;
      if (shortcut.key && (event.key || "").toLowerCase() === (shortcut.key || "").toLowerCase()) return true;
      return false;
    }
    function matchesShortcut(event, action) {
      const shortcut = shortcuts[action];
      if (!shortcut) return false;
      const isModifierKey = shortcut.key === "Shift" || shortcut.key === "Control" || shortcut.key === "Alt" || shortcut.key === "Meta";
      if (isModifierKey && (!shortcut.modifiers || shortcut.modifiers.length === 0)) {
        if (event.type !== "keyup" || event.key !== shortcut.key || !modifierKeyPressedAlone) return false;
        const isSideSpecific = shortcut.code && (shortcut.code.endsWith("Left") || shortcut.code.endsWith("Right"));
        if (isSideSpecific && shortcut.code !== event.code) return false;
        return true;
      }
      if (event.type === "keyup") return false;
      return isShortcutMatch(event, shortcut);
    }
    function matchesAnnotationShortcut(event, shortcut) {
      if (!shortcut) return false;
      const target = shortcut.keyData || shortcut;
      return isShortcutMatch(event, target);
    }
    document.addEventListener("keydown", (event) => {
      if (event.key === "Shift" || event.key === "Control" || event.key === "Alt" || event.key === "Meta") {
        modifierKeyPressedAlone = true;
      } else {
        if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) {
          modifierKeyPressedAlone = false;
        }
      }
      if (isExtensionDisabled) return;
      const audioShortcut = shortcuts["audio"];
      const isModifierOnlyAudio = audioShortcut && ["Shift", "Control", "Alt", "Meta"].includes(audioShortcut.key) && (!audioShortcut.modifiers || audioShortcut.modifiers.length === 0);
      if (!isModifierOnlyAudio && matchesShortcut(event, "audio")) {
        if (window.LuminaSelection && LuminaSelection.isInsideEditable()) return;
        const text = getSelectedTextForAudio();
        event.preventDefault();
        event.stopPropagation();
        if (text) {
          playCombinedAudio(text);
        } else {
          stopAudio();
        }
        return;
      }
      if (matchesShortcut(event, "askLumina")) {
        const selection = window.getSelection();
        const text = selection ? selection.toString().trim() : "";
        const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
        if (text.length > 0 && range && window.LuminaSelection) {
          event.preventDefault();
          event.stopPropagation();
          LuminaSelection.show(0, 0, text, range);
          LuminaSelection.showInput();
          return;
        }
      }
      if (matchesShortcut(event, "translate")) {
        if (window.LuminaSelection && LuminaSelection.isInsideEditable()) return;
        const selection = window.getSelection();
        const text = selection ? selection.toString().trim() : "";
        if (text.length > 0) {
          event.preventDefault();
          event.stopPropagation();
          const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
          if (window.LuminaSelection) LuminaSelection.hide();
          triggerSidePanelQuery(text, text, "translate", range);
          return;
        }
      }
      if (matchesShortcut(event, "micToggle")) {
        event.preventDefault();
        event.stopPropagation();
        chrome.storage.local.set({ pendingMicToggle: Date.now() });
        safeRuntimeSendMessage({ action: "open_sidepanel" });
        return;
      }
      if (matchesShortcut(event, "luminaChat")) {
        event.preventDefault();
        event.stopPropagation();
        safeRuntimeSendMessage({ action: "open_sidepanel" });
        return;
      }
      const annotationShortcutsList = shortcuts["annotationShortcuts"] || [];
      for (const shortcut of annotationShortcutsList) {
        if (shortcut.enabled === false) continue;
        if (matchesAnnotationShortcut(event, shortcut)) {
          if (window.LuminaSelection && LuminaSelection.isInsideEditable()) continue;
          const selection = window.getSelection();
          const text = selection ? selection.toString().trim() : "";
          if (text.length > 0 && selection.rangeCount > 0) {
            event.preventDefault();
            event.stopPropagation();
            const range = selection.getRangeAt(0);
            const color = shortcut.color || "#FFFB78";
            if (window.LuminaAnnotation) {
              window.LuminaAnnotation.highlight(range, color);
            }
            if (selection) selection.removeAllRanges();
            if (window.LuminaSelection) LuminaSelection.hide();
            return;
          }
        }
      }
      if (questionMappings && questionMappings.length > 0) {
        if (window.LuminaSelection && !LuminaSelection.isInsideEditable()) {
          const selection = window.getSelection();
          const text = selection ? selection.toString().trim() : "";
          if (text) {
            const mapping = questionMappings.find((m) => {
              let config = m.keyData;
              if (!config && m.key) {
                config = { key: m.key, code: "Key" + m.key.toUpperCase() };
                if (event.ctrlKey || event.metaKey || event.altKey) return false;
              }
              if (!config) return false;
              return isShortcutMatch(event, config);
            });
            if (mapping) {
              event.preventDefault();
              event.stopPropagation();
              let displayQuestion = mapping.prompt;
              let fullQuestion = mapping.prompt;
              if (mapping.prompt.includes("$SelectedText") || mapping.prompt.includes("SelectedText")) {
                displayQuestion = mapping.prompt.replace(/\$SelectedText|SelectedText/gi, text).replace(/\$Sentence/gi, () => getSentenceContext()).replace(/\$Paragraph/gi, () => getParagraphContext()).trim();
                fullQuestion = displayQuestion;
              } else {
                fullQuestion = `"${text}" ${mapping.prompt}`;
                displayQuestion = fullQuestion;
              }
              const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
              const shouldHighlight = mapping.highlight !== false && mapping.enableHighlight !== false;
              triggerSidePanelQuery(fullQuestion, displayQuestion, "qa", range, shouldHighlight);
              if (window.LuminaSelection) LuminaSelection.hide();
              return;
            }
          }
        }
      }
    }, true);
    document.addEventListener("keyup", (event) => {
      if (isExtensionDisabled) return;
      if (matchesShortcut(event, "audio")) {
        if (window.LuminaSelection && LuminaSelection.isInsideEditable()) return;
        const text = getSelectedTextForAudio();
        event.preventDefault();
        event.stopPropagation();
        if (text) {
          playCombinedAudio(text);
        } else {
          stopAudio();
        }
      }
    }, true);
  })();
})();
