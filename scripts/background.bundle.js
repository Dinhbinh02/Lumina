// src/background/storage_cleanup.js
function initStorageCleanup() {
  chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS" }).catch(() => {
  });
  chrome.storage.local.get(null, (allData) => {
    if (chrome.runtime.lastError) return;
    const ankiLegacyKeys = /* @__PURE__ */ new Set([
      "luminaTemplatesV3",
      "luminaBatchHistoryV3",
      "lastUsedGenAIModel",
      "lastUsedBatchSize",
      "lastUsedDeck",
      "lastUsedTemplateId",
      "ankiQuickNoteContent",
      "attachments"
    ]);
    const keysToRemove = Object.keys(allData).filter(
      (key) => key.includes("_inst_") || key.startsWith("highlights_") || key.startsWith("rot_") || ankiLegacyKeys.has(key)
    );
    if (keysToRemove.length > 0) {
      chrome.storage.local.remove(keysToRemove, () => {
      });
    }
  });
  if (typeof LuminaImageCacheDB !== "undefined" && LuminaImageCacheDB.cleanupExpired) {
    LuminaImageCacheDB.cleanupExpired().catch((err) => console.error("[Lumina BG] Failed to clean up IndexedDB image cache:", err));
  }
  if (typeof LuminaAudioCacheDB !== "undefined" && LuminaAudioCacheDB.cleanupExpired) {
    LuminaAudioCacheDB.cleanupExpired().catch((err) => console.error("[Lumina BG] Failed to clean up IndexedDB audio cache:", err));
  }
}

// src/background/sidepanel_manager.js
var sidePanelPorts = /* @__PURE__ */ new Map();
var sessionOpenWindows = /* @__PURE__ */ new Set();
function updateOpenSidePanelsSession() {
  chrome.storage.session.set({ open_sidepanel_windows: Array.from(sessionOpenWindows) }).catch(() => {
  });
}
function toggleSidePanel(windowId) {
  if (!windowId) return;
  const isCurrentlyOpen = sidePanelPorts.has(windowId) || sessionOpenWindows.has(windowId);
  if (isCurrentlyOpen) {
    sessionOpenWindows.delete(windowId);
    sidePanelPorts.delete(windowId);
    updateOpenSidePanelsSession();
    if (chrome.sidePanel.close) {
      chrome.sidePanel.close({ windowId }).catch(() => {
      });
    } else {
      chrome.sidePanel.setOptions({ windowId, enabled: false }, () => {
        chrome.sidePanel.setOptions({
          windowId,
          enabled: true,
          path: "pages/lumina/lumina.html?sidepanel=1"
        });
      });
    }
  } else {
    sessionOpenWindows.add(windowId);
    sidePanelPorts.set(windowId, null);
    updateOpenSidePanelsSession();
    chrome.sidePanel.open({ windowId }).catch(() => {
      sessionOpenWindows.delete(windowId);
      sidePanelPorts.delete(windowId);
      updateOpenSidePanelsSession();
    });
  }
}
async function ensureSidePanelOpen(windowId) {
  if (!windowId) return;
  const isCurrentlyOpen = sidePanelPorts.has(windowId) || sessionOpenWindows.has(windowId);
  if (!isCurrentlyOpen) {
    sessionOpenWindows.add(windowId);
    sidePanelPorts.set(windowId, null);
    updateOpenSidePanelsSession();
    chrome.sidePanel.open({ windowId }).catch(() => {
      sessionOpenWindows.delete(windowId);
      sidePanelPorts.delete(windowId);
      updateOpenSidePanelsSession();
    });
  }
}
function updateDisplayMode(mode) {
  if (!chrome.sidePanel) return;
  chrome.sidePanel.setOptions({
    path: "pages/lumina/lumina.html?sidepanel=1",
    enabled: true
  });
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(console.error);
  chrome.action.setPopup({ popup: "pages/popup/popup.html" });
}
function initSidePanelManager() {
  chrome.storage.session.get(["open_sidepanel_windows"], (result) => {
    if (result.open_sidepanel_windows) {
      sessionOpenWindows = new Set(result.open_sidepanel_windows);
      sessionOpenWindows.forEach((wid) => {
        if (!sidePanelPorts.has(wid)) sidePanelPorts.set(wid, null);
      });
    }
  });
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name === "lumina-sidepanel") {
      let connectedWindowId = null;
      port.onMessage.addListener((msg) => {
        if (msg.action === "closing" && msg.windowId) {
          sessionOpenWindows.delete(msg.windowId);
          sidePanelPorts.delete(msg.windowId);
          updateOpenSidePanelsSession();
        } else if (msg.windowId) {
          connectedWindowId = msg.windowId;
          sidePanelPorts.set(connectedWindowId, port);
          sessionOpenWindows.add(connectedWindowId);
          updateOpenSidePanelsSession();
        }
      });
      port.onDisconnect.addListener(() => {
        if (connectedWindowId) {
          sidePanelPorts.delete(connectedWindowId);
        }
      });
    }
  });
  chrome.windows.onRemoved.addListener((windowId) => {
    if (sessionOpenWindows.has(windowId)) {
      sessionOpenWindows.delete(windowId);
      sidePanelPorts.delete(windowId);
      updateOpenSidePanelsSession();
    }
  });
  if (chrome.sidePanel && chrome.sidePanel.onClosed) {
    chrome.sidePanel.onClosed.addListener((closeInfo) => {
      if (closeInfo && closeInfo.windowId) {
        sessionOpenWindows.delete(closeInfo.windowId);
        sidePanelPorts.delete(closeInfo.windowId);
        updateOpenSidePanelsSession();
      }
    });
  }
  chrome.tabs.onRemoved.addListener((tabId) => {
    chrome.storage.local.get(["lumina_tab_sessions"], (result) => {
      const tabSessions = result.lumina_tab_sessions || {};
      if (tabSessions[tabId]) {
        delete tabSessions[tabId];
        chrome.storage.local.set({ lumina_tab_sessions: tabSessions });
      }
    });
  });
  chrome.storage.local.get(["displayMode"], (result) => {
    updateDisplayMode(result.displayMode || "popup");
  });
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === "local" && changes.displayMode) {
      updateDisplayMode(changes.displayMode.newValue || "popup");
    }
  });
}

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

// src/db/attachment_db.js
var LuminaAttachmentDB2 = {
  DB_NAME: "LuminaAttachmentDB",
  DB_VERSION: 1,
  STORE_NAME: "attachments",
  _db: null,
  init() {
    return new Promise((resolve, reject) => {
      if (this._db) return resolve(this._db);
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          db.createObjectStore(this.STORE_NAME);
        }
      };
      request.onsuccess = (e) => {
        this._db = e.target.result;
        this._db.onclose = () => {
          this._db = null;
        };
        this._db.onversionchange = () => {
          if (this._db) {
            this._db.close();
            this._db = null;
          }
        };
        resolve(this._db);
      };
      request.onerror = (e) => reject(e.target.error);
    });
  },
  async put(key, blob) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE_NAME, "readwrite");
      const store = tx.objectStore(this.STORE_NAME);
      const request = store.put(blob, key);
      request.onsuccess = () => resolve(true);
      request.onerror = (e) => reject(e.target.error);
    });
  },
  async get(key) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE_NAME, "readonly");
      const store = tx.objectStore(this.STORE_NAME);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = (e) => reject(e.target.error);
    });
  },
  async delete(key) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE_NAME, "readwrite");
      const store = tx.objectStore(this.STORE_NAME);
      const request = store.delete(key);
      request.onsuccess = () => resolve(true);
      request.onerror = (e) => reject(e.target.error);
    });
  },
  async clear() {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE_NAME, "readwrite");
      const store = tx.objectStore(this.STORE_NAME);
      const request = store.clear();
      request.onsuccess = () => resolve(true);
      request.onerror = (e) => reject(e.target.error);
    });
  },
  async getAll(maxSize = 2 * 1024 * 1024) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE_NAME, "readonly");
      const store = tx.objectStore(this.STORE_NAME);
      const request = store.openCursor();
      const results = {};
      const conversionPromises = [];
      request.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          const key = cursor.key;
          const blob = cursor.value;
          if (blob instanceof Blob) {
            if (blob.size <= maxSize) {
              const p = this.blobToDataURL(blob).then((dataUrl) => {
                if (dataUrl) results[key] = dataUrl;
              });
              conversionPromises.push(p);
            }
          }
          cursor.continue();
        } else {
          Promise.all(conversionPromises).then(() => {
            resolve(results);
          }).catch(reject);
        }
      };
      request.onerror = (e) => reject(e.target.error);
    });
  },
  async getAllMetadata() {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE_NAME, "readonly");
      const store = tx.objectStore(this.STORE_NAME);
      const request = store.openCursor();
      const results = [];
      request.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          const key = cursor.key;
          const blob = cursor.value;
          if (blob instanceof Blob) {
            results.push({
              key,
              size: blob.size,
              type: blob.type
            });
          }
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      request.onerror = (e) => reject(e.target.error);
    });
  },
  dataURLtoBlob(dataUrl) {
    if (!dataUrl || typeof dataUrl !== "string") return null;
    try {
      const commaIdx = dataUrl.indexOf(",");
      if (commaIdx === -1) return null;
      const header = dataUrl.substring(0, commaIdx);
      const base64Data = dataUrl.substring(commaIdx + 1);
      const mimeMatch = header.match(/:(.*?);/);
      const mime = mimeMatch ? mimeMatch[1] : "image/png";
      const bstr = atob(base64Data);
      const len = bstr.length;
      const u8arr = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        u8arr[i] = bstr.charCodeAt(i);
      }
      return new Blob([u8arr], { type: mime });
    } catch (e) {
      console.error("Failed to convert dataURL to Blob", e);
      return null;
    }
  },
  async dataURLtoBlobAsync(dataUrl) {
    if (!dataUrl || typeof dataUrl !== "string") return null;
    try {
      const res = await fetch(dataUrl);
      return await res.blob();
    } catch (e) {
      return this.dataURLtoBlob(dataUrl);
    }
  },
  blobToDataURL(blob) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  },
  async cleanupStorage(maxTotalBytes = 250 * 1024 * 1024) {
    const metadataList = await this.getAllMetadata();
    let totalBytes = metadataList.reduce((acc, item) => acc + item.size, 0);
    if (totalBytes <= maxTotalBytes) return { freed: 0, remaining: totalBytes };
    let freedBytes = 0;
    for (const item of metadataList) {
      if (totalBytes <= maxTotalBytes) break;
      await this.delete(item.key).catch(() => {
      });
      freedBytes += item.size;
      totalBytes -= item.size;
    }
    return { freed: freedBytes, remaining: totalBytes };
  }
};
var LuminaImageCacheDB2 = {
  DB_NAME: "LuminaImageCacheDB",
  DB_VERSION: 1,
  STORE_NAME: "image_queries",
  _db: null,
  init() {
    return new Promise((resolve, reject) => {
      if (this._db) return resolve(this._db);
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          db.createObjectStore(this.STORE_NAME);
        }
      };
      request.onsuccess = (e) => {
        this._db = e.target.result;
        this._db.onclose = () => {
          this._db = null;
        };
        this._db.onversionchange = () => {
          if (this._db) {
            this._db.close();
            this._db = null;
          }
        };
        resolve(this._db);
      };
      request.onerror = (e) => reject(e.target.error);
    });
  },
  async put(key, value) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE_NAME, "readwrite");
      const store = tx.objectStore(this.STORE_NAME);
      const request = store.put({ value, timestamp: Date.now() }, key);
      request.onsuccess = () => resolve(true);
      request.onerror = (e) => reject(e.target.error);
    });
  },
  async get(key) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE_NAME, "readonly");
      const store = tx.objectStore(this.STORE_NAME);
      const request = store.get(key);
      request.onsuccess = () => {
        const res = request.result;
        if (res) {
          if (Date.now() - res.timestamp > 24 * 60 * 60 * 1e3) {
            this.delete(key).catch(() => {
            });
            resolve(null);
          } else {
            resolve(res.value);
          }
        } else {
          resolve(null);
        }
      };
      request.onerror = (e) => reject(e.target.error);
    });
  },
  async delete(key) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE_NAME, "readwrite");
      const store = tx.objectStore(this.STORE_NAME);
      const request = store.delete(key);
      request.onsuccess = () => resolve(true);
      request.onerror = (e) => reject(e.target.error);
    });
  },
  async clear() {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE_NAME, "readwrite");
      const store = tx.objectStore(this.STORE_NAME);
      const request = store.clear();
      request.onsuccess = () => resolve(true);
      request.onerror = (e) => reject(e.target.error);
    });
  },
  async cleanupExpired() {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE_NAME, "readwrite");
      const store = tx.objectStore(this.STORE_NAME);
      const request = store.openCursor();
      const now = Date.now();
      request.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          if (now - cursor.value.timestamp > 24 * 60 * 60 * 1e3) {
            cursor.delete();
          }
          cursor.continue();
        } else {
          resolve(true);
        }
      };
      request.onerror = (e) => reject(e.target.error);
    });
  },
  async getStorageUsage() {
    const db = await this.init();
    let totalBytes = 0;
    return new Promise((resolve) => {
      const tx = db.transaction(this.STORE_NAME, "readonly");
      const store = tx.objectStore(this.STORE_NAME);
      const request = store.openCursor();
      request.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          const keyStr = JSON.stringify(cursor.key);
          const valStr = JSON.stringify(cursor.value);
          totalBytes += (keyStr.length + valStr.length) * 2;
          cursor.continue();
        } else {
          resolve(totalBytes);
        }
      };
      request.onerror = () => resolve(0);
    });
  }
};
var LuminaAudioCacheDB2 = {
  DB_NAME: "LuminaAudioCacheDB",
  DB_VERSION: 1,
  STORE_NAME: "audio_entries",
  _db: null,
  init() {
    return new Promise((resolve, reject) => {
      if (this._db) return resolve(this._db);
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          db.createObjectStore(this.STORE_NAME);
        }
      };
      request.onsuccess = (e) => {
        this._db = e.target.result;
        this._db.onclose = () => {
          this._db = null;
        };
        this._db.onversionchange = () => {
          if (this._db) {
            this._db.close();
            this._db = null;
          }
        };
        resolve(this._db);
      };
      request.onerror = (e) => reject(e.target.error);
    });
  },
  async put(key, entry) {
    const db = await this.init();
    let dbValue = { ...entry };
    if (entry && entry.data && Array.isArray(entry.data)) {
      dbValue.data = await Promise.all(entry.data.map(async (base64) => {
        if (typeof base64 !== "string" || !base64.startsWith("data:")) return base64;
        return await LuminaAttachmentDB2.dataURLtoBlobAsync(base64) || base64;
      }));
    }
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE_NAME, "readwrite");
      const store = tx.objectStore(this.STORE_NAME);
      const request = store.put({ value: dbValue, timestamp: Date.now() }, key);
      request.onsuccess = () => resolve(true);
      request.onerror = (e) => reject(e.target.error);
    });
  },
  async get(key) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE_NAME, "readonly");
      const store = tx.objectStore(this.STORE_NAME);
      const request = store.get(key);
      request.onsuccess = async () => {
        const res = request.result;
        if (res) {
          if (Date.now() - res.timestamp > 24 * 60 * 60 * 1e3) {
            this.delete(key).catch(() => {
            });
            resolve(null);
          } else {
            const entry = { ...res.value };
            if (entry && entry.data && Array.isArray(entry.data)) {
              try {
                const base64Promises = entry.data.map(async (item) => {
                  if (item instanceof Blob) {
                    return await LuminaAttachmentDB2.blobToDataURL(item);
                  }
                  return item;
                });
                entry.data = (await Promise.all(base64Promises)).filter(Boolean);
              } catch (err) {
                console.error("Failed to deserialize Blobs in audio cache get:", err);
              }
            }
            resolve(entry);
          }
        } else {
          resolve(null);
        }
      };
      request.onerror = (e) => reject(e.target.error);
    });
  },
  async delete(key) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE_NAME, "readwrite");
      const store = tx.objectStore(this.STORE_NAME);
      const request = store.delete(key);
      request.onsuccess = () => resolve(true);
      request.onerror = (e) => reject(e.target.error);
    });
  },
  async clear() {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE_NAME, "readwrite");
      const store = tx.objectStore(this.STORE_NAME);
      const request = store.clear();
      request.onsuccess = () => resolve(true);
      request.onerror = (e) => reject(e.target.error);
    });
  },
  async cleanupExpired() {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE_NAME, "readwrite");
      const store = tx.objectStore(this.STORE_NAME);
      const request = store.openCursor();
      const now = Date.now();
      request.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          if (now - cursor.value.timestamp > 24 * 60 * 60 * 1e3) {
            cursor.delete();
          }
          cursor.continue();
        } else {
          resolve(true);
        }
      };
      request.onerror = (e) => reject(e.target.error);
    });
  },
  async getStorageUsage() {
    const db = await this.init();
    let totalBytes = 0;
    return new Promise((resolve) => {
      const tx = db.transaction(this.STORE_NAME, "readonly");
      const store = tx.objectStore(this.STORE_NAME);
      const request = store.openCursor();
      request.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          const keyStr = JSON.stringify(cursor.key);
          totalBytes += keyStr.length * 2;
          const val = cursor.value;
          if (val) {
            if (val.value && val.value.data && Array.isArray(val.value.data)) {
              val.value.data.forEach((item) => {
                if (item instanceof Blob) {
                  totalBytes += item.size;
                } else if (typeof item === "string") {
                  totalBytes += item.length * 2;
                }
              });
              const copy = { ...val };
              delete copy.value.data;
              totalBytes += JSON.stringify(copy).length * 2;
            } else {
              totalBytes += JSON.stringify(val).length * 2;
            }
          }
          cursor.continue();
        } else {
          resolve(totalBytes);
        }
      };
      request.onerror = () => resolve(0);
    });
  }
};
if (typeof globalThis !== "undefined") {
  globalThis.LuminaAttachmentDB = LuminaAttachmentDB2;
  globalThis.LuminaImageCacheDB = LuminaImageCacheDB2;
  globalThis.LuminaAudioCacheDB = LuminaAudioCacheDB2;
}

// src/background/media_processor.js
function detectMediaType(item) {
  if (!item) return null;
  if (typeof item === "string") {
    const v = item.toLowerCase();
    if (v.startsWith("data:video/")) return "video";
    if (v.startsWith("data:application/pdf")) return "pdf";
    if (v.startsWith("data:image/")) return "image";
    if (/\.(mp4|mov|webm|mkv)(\?|$)/i.test(v)) return "video";
    if (/\.pdf(\?|$)/i.test(v)) return "pdf";
    return "image";
  }
  if (typeof item === "object") {
    const mimeType = (item.mimeType || "").toLowerCase();
    const dataUrl = (item.dataUrl || "").toLowerCase();
    const previewUrl = (item.previewUrl || "").toLowerCase();
    if (mimeType.startsWith("video/") || dataUrl.startsWith("data:video/")) return "video";
    if (mimeType === "application/pdf" || dataUrl.startsWith("data:application/pdf")) return "pdf";
    if (mimeType.startsWith("image/") || dataUrl.startsWith("data:image/")) return "image";
    if (/\.(mp4|mov|webm|mkv)(\?|$)/i.test(dataUrl) || /\.(mp4|mov|webm|mkv)(\?|$)/i.test(previewUrl)) return "video";
    if (/\.pdf(\?|$)/i.test(dataUrl) || /\.pdf(\?|$)/i.test(previewUrl)) return "pdf";
    return "image";
  }
  return null;
}
async function readOpfsFileAsBase64(fileUri, fileName) {
  try {
    const urlParts = fileUri.replace("local-db://", "").split("/");
    if (urlParts.length >= 3) {
      const sessionId = urlParts[0];
      const attachmentId = urlParts[1];
      const name = urlParts.slice(2).join("/");
      const key = `${sessionId}_${attachmentId}_${name}`;
      const blob = await LuminaAttachmentDB2.get(key);
      if (blob) {
        const dataUrl = await LuminaAttachmentDB2.blobToDataURL(blob);
        if (dataUrl) {
          return dataUrl.split(",")[1];
        }
      }
    }
  } catch (e) {
    console.error(`[Lumina DB Read] Failed to read ${fileName}:`, e);
  }
  return null;
}
function normalizeMimeType2(mimeType) {
  const mt = String(mimeType || "").toLowerCase().trim();
  return MIME_ALIASES[mt] || mt;
}
function isSupportedAttachmentMime(mimeType) {
  const mt = normalizeMimeType2(mimeType);
  return !!mt && SUPPORTED_MIME_TYPES.has(mt);
}
function isTextAttachmentMime2(mimeType) {
  const mt = normalizeMimeType2(mimeType);
  return mt.startsWith("text/") || mt === "application/json" || mt === "application/xml";
}
function getBase64FromAttachment2(item) {
  if (!item || typeof item !== "object") return "";
  if (item.data) return item.data;
  if (item.dataUrl) {
    const matches = item.dataUrl.match(/^data:([^;]+);base64,(.+)$/i);
    if (matches) return matches[2];
  }
  return "";
}
function decodeBase64Utf82(base64) {
  if (!base64) return "";
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder("utf-8").decode(bytes);
  } catch (_) {
    return "";
  }
}
function filterParentAttachments(attachments) {
  if (!attachments || !Array.isArray(attachments)) return [];
  const parentIds = /* @__PURE__ */ new Set();
  for (const item of attachments) {
    if (item && typeof item === "object" && item.parentAttachmentId) {
      parentIds.add(item.parentAttachmentId);
    }
  }
  return attachments.filter((item) => {
    if (item && typeof item === "object" && item.attachmentId && parentIds.has(item.attachmentId)) {
      return false;
    }
    return true;
  });
}
async function processAttachments(attachments) {
  const parts = [];
  const unsupported = [];
  if (!attachments || !Array.isArray(attachments)) return { parts, unsupported };
  const filteredAttachments = filterParentAttachments(attachments);
  for (const item of filteredAttachments) {
    if (typeof item === "string") {
      if (item.startsWith("data:text/")) {
        const matches = item.match(/^data:([^;]+);base64,(.+)$/i);
        const decoded = matches ? decodeBase64Utf82(matches[2]) : "";
        if (decoded) parts.push({ type: "text", text: `[Attached text file]
${decoded}` });
      } else if (item.startsWith("data:")) {
        const matches = item.match(/^data:([^;]+);base64,(.+)$/i);
        if (matches) {
          const mime = normalizeMimeType2(matches[1]);
          if (mime.startsWith("image/")) {
            parts.push({ type: "image_url", image_url: { url: item, detail: "auto" } });
          } else {
            unsupported.push({ name: "Attached file", mimeType: mime });
          }
        }
      } else {
        parts.push({ type: "image_url", image_url: { url: item, detail: "auto" } });
      }
    } else if (typeof item === "object") {
      const mimeType = normalizeMimeType2(item.mimeType || "");
      const itemName = item.name || "Unnamed file";
      if (mimeType && !isSupportedAttachmentMime(mimeType)) {
        unsupported.push({ name: itemName, mimeType });
        continue;
      }
      if (isTextAttachmentMime2(mimeType)) {
        const textContent = decodeBase64Utf82(getBase64FromAttachment2(item));
        if (textContent) parts.push({ type: "text", text: `[Attached file: ${itemName} (${mimeType})]
${textContent}` });
        continue;
      }
      if (mimeType.startsWith("audio/")) {
        let base64Data = item.data;
        if (!base64Data && item.fileUri && item.fileUri.startsWith("local-db://")) {
          base64Data = await readOpfsFileAsBase64(item.fileUri, itemName);
        }
        if (!base64Data && item.dataUrl) {
          const matches = item.dataUrl.match(/^data:(.+?);base64,(.+)$/);
          if (matches) base64Data = matches[2];
        }
        if (base64Data) {
          let format = mimeType.split("/")[1] || "wav";
          if (format === "mpeg") format = "mp3";
          parts.push({ type: "input_audio", input_audio: { data: base64Data, format } });
        }
      } else if (mimeType.startsWith("image/")) {
        let url = item.dataUrl || item.previewUrl;
        if (!url && item.fileUri) {
          if (item.fileUri.startsWith("local-db://")) {
            const b64Data = await readOpfsFileAsBase64(item.fileUri, itemName);
            if (b64Data) {
              url = `data:${mimeType};base64,${b64Data}`;
            } else if (item.dataUrl && item.dataUrl.startsWith("data:")) {
              url = item.dataUrl;
            }
          } else {
            url = item.fileUri;
          }
        }
        if (!url && mimeType && item.data) url = `data:${mimeType};base64,${item.data}`;
        if (url) {
          parts.push({ type: "image_url", image_url: { url, detail: item.detail || "auto" } });
        } else {
          unsupported.push({ name: itemName, mimeType });
        }
      } else {
        unsupported.push({ name: itemName, mimeType });
      }
    }
  }
  return { parts, unsupported };
}
async function processAttachmentsForGemini(attachments) {
  const parts = [];
  const unsupported = [];
  if (!attachments || !Array.isArray(attachments)) return { parts, unsupported };
  const filteredAttachments = filterParentAttachments(attachments);
  for (const item of filteredAttachments) {
    if (typeof item === "string") {
      if (item.startsWith("data:text/")) {
        const matches = item.match(/^data:([^;]+);base64,(.+)$/i);
        const decoded = matches ? decodeBase64Utf82(matches[2]) : "";
        if (decoded) parts.push({ text: `[Attached text file]
${decoded}` });
      } else if (item.startsWith("data:")) {
        const matches = item.match(/^data:([^;]+);base64,(.+)$/i);
        if (matches) {
          const mime = normalizeMimeType2(matches[1]);
          unsupported.push({ name: "Inline file", mimeType: mime });
        }
      }
    } else if (typeof item === "object") {
      const mimeType = normalizeMimeType2(item.mimeType || "");
      const itemName = item.name || "Unnamed file";
      if (mimeType && !isSupportedAttachmentMime(mimeType)) {
        unsupported.push({ name: itemName, mimeType });
        continue;
      }
      if (isTextAttachmentMime2(mimeType)) {
        const textContent = decodeBase64Utf82(getBase64FromAttachment2(item));
        if (textContent) parts.push({ text: `[Attached file: ${itemName} (${mimeType})]
${textContent}` });
        continue;
      }
      if (item.fileUri) {
        if (item.fileUri.startsWith("local-db://")) {
          const b64Data = await readOpfsFileAsBase64(item.fileUri, itemName);
          if (b64Data) {
            parts.push({
              inlineData: {
                data: b64Data,
                mimeType
              }
            });
          } else if (item.dataUrl && item.dataUrl.startsWith("data:")) {
            const matches = item.dataUrl.match(/^data:([^;]+);base64,(.+)$/i);
            if (matches) {
              parts.push({
                inlineData: {
                  data: matches[2],
                  mimeType
                }
              });
            }
          }
        }
      } else if (item.data) {
        parts.push({
          inlineData: {
            data: item.data,
            mimeType
          }
        });
      } else if (item.dataUrl && item.dataUrl.startsWith("data:")) {
        const matches = item.dataUrl.match(/^data:([^;]+);base64,(.+)$/i);
        if (matches) {
          parts.push({
            inlineData: {
              data: matches[2],
              mimeType
            }
          });
        }
      }
    }
  }
  return { parts, unsupported };
}

// src/background/audio_fetcher.js
function getLemma(w) {
  if (!w) return "";
  const word = w.toLowerCase().trim();
  if (word.endsWith("ss")) return word;
  if (word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (word.endsWith("es")) {
    const base = word.slice(0, -2);
    if (base.endsWith("sh") || base.endsWith("ch") || base.endsWith("x") || base.endsWith("s") || base.endsWith("z")) {
      return base;
    }
    return word.slice(0, -1);
  }
  if (word.endsWith("s") && !word.endsWith("us") && !word.endsWith("is") && !word.endsWith("as")) {
    return word.slice(0, -1);
  }
  return word;
}
function getAmericanSpelling(w) {
  if (!w) return "";
  return w.replace(/isation/gi, "ization").replace(/isations/gi, "izations").replace(/ise\b/gi, "ize").replace(/ises\b/gi, "izes").replace(/ised\b/gi, "ized").replace(/ising\b/gi, "izing").replace(/yse\b/gi, "yze").replace(/yses\b/gi, "yzes").replace(/ysed\b/gi, "yzed").replace(/ysing\b/gi, "yzing");
}
async function stopGoogleAudioOffscreen() {
  if (await chrome.offscreen.hasDocument()) {
    return await chrome.runtime.sendMessage({
      action: "offscreen_stopGoogleAudio"
    }).catch(() => {
    });
  }
}
async function fetchAudio(text, speed = 1, forcedLang = null) {
  if (!text) return { type: null, chunks: [] };
  let normalizedText = text.trim();
  normalizedText = normalizedText.replace(/_/g, " ");
  const acronymsToSpellOut = ["id", "url", "ip", "io", "os", "ui", "db", "api", "ssl", "tls", "dto", "dao"];
  acronymsToSpellOut.forEach((acronym) => {
    const regex = new RegExp(`\\b${acronym}\\b`, "gi");
    normalizedText = normalizedText.replace(regex, acronym.toUpperCase().split("").join(" "));
  });
  const wordCount = normalizedText.split(/\s+/).length;
  const detectLanguage = (t) => {
    let counts = { vietnamese: 0, chinese: 0, japanese: 0, korean: 0, cyrillic: 0, latin: 0 };
    const vietnameseRegex = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/gi;
    for (const char of t) {
      const code = char.charCodeAt(0);
      if (code >= 19968 && code <= 40959) counts.chinese++;
      else if (code >= 12352 && code <= 12543) counts.japanese++;
      else if (code >= 44032 && code <= 55215) counts.korean++;
      else if (code >= 1024 && code <= 1279) counts.cyrillic++;
      else if (code >= 65 && code <= 122 || code >= 192 && code <= 255) counts.latin++;
    }
    const vietnameseMatches = t.match(vietnameseRegex);
    if (vietnameseMatches) counts.vietnamese = vietnameseMatches.length;
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    if (total === 0) return "en-GB";
    const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    const langMap = { chinese: "zh-CN", japanese: "ja", korean: "ko", cyrillic: "ru", latin: "en-GB", vietnamese: "vi" };
    if (dominant[0] === "latin" && counts.vietnamese > 0 && counts.vietnamese / counts.latin > 0.15) return "vi";
    return langMap[dominant[0]] || "en-GB";
  };
  const lang = forcedLang || detectLanguage(normalizedText);
  const fetchToBase64 = async (url, opts = {}) => {
    const response = await fetch(url, opts);
    if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status });
    const contentType = response.headers.get("Content-Type");
    if (contentType && !contentType.includes("audio") && !contentType.includes("mpeg")) throw new Error("Invalid content type");
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength < 100) throw new Error("Empty audio");
    const base64 = btoa(new Uint8Array(arrayBuffer).reduce((d, byte) => d + String.fromCharCode(byte), ""));
    return `data:audio/mpeg;base64,${base64}`;
  };
  const stripListPrefix = (q) => q.replace(/^\s*(?:[a-zA-Z\d]{1,2}\)|[a-zA-Z\d]{1,2}\.|[•\-–—])\s+/, "").trim();
  const googleUrl = (q) => {
    const cleaned = stripListPrefix(q);
    return `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(cleaned)}&tl=${lang}&total=1&idx=0&textlen=${cleaned.length}&client=gtx&prev=input&ttsspeed=${speed}`;
  };
  const MAX_CHUNK_CHARS = 200;
  const splitIntoChunks = (text2) => {
    const sentences = text2.match(/[^.?!]+[.?!]+/g) || [];
    const lastSentenceEnd = sentences.reduce((acc, s) => acc + s.length, 0);
    if (lastSentenceEnd < text2.length) sentences.push(text2.slice(lastSentenceEnd).trim());
    const level1 = sentences.map((s) => s.trim()).filter((s) => s.replace(/[.?!,;:]/g, "").trim().length >= 2);
    const base = level1.length >= 2 ? level1 : [text2];
    const level2 = [];
    for (const chunk of base) {
      if (chunk.length <= MAX_CHUNK_CHARS) {
        level2.push(chunk);
        continue;
      }
      const clauses = chunk.split(/(?<=[,;–—])\s+/);
      if (clauses.length >= 2) {
        let current = "";
        for (const clause of clauses) {
          if (current && (current + " " + clause).length > MAX_CHUNK_CHARS) {
            level2.push(current.trim());
            current = clause;
          } else {
            current = current ? current + " " + clause : clause;
          }
        }
        if (current.trim()) level2.push(current.trim());
      } else {
        level2.push(chunk);
      }
    }
    const WORDS_PER_CHUNK = 25;
    const final = [];
    for (const chunk of level2) {
      if (chunk.length <= MAX_CHUNK_CHARS) {
        final.push(chunk);
        continue;
      }
      const words = chunk.split(/\s+/);
      for (let i = 0; i < words.length; i += WORDS_PER_CHUNK) {
        final.push(words.slice(i, i + WORDS_PER_CHUNK).join(" "));
      }
    }
    return final.filter(Boolean);
  };
  const fetchGoogle = async () => {
    try {
      const data = await fetchToBase64(googleUrl(normalizedText), { referrerPolicy: "no-referrer" });
      return [data];
    } catch (e) {
      if (e.status !== 400) return [];
    }
    const chunks = splitIntoChunks(normalizedText);
    const results = new Array(chunks.length).fill(null);
    await Promise.all(chunks.map(async (chunk, i) => {
      try {
        results[i] = await fetchToBase64(googleUrl(chunk), { referrerPolicy: "no-referrer" });
      } catch (e) {
        results[i] = null;
      }
    }));
    return results.filter(Boolean);
  };
  if (wordCount <= 2) {
    const audioText = getAmericanSpelling(normalizedText);
    const oxfordUrl = `https://ssl.gstatic.com/dictionary/static/sounds/oxford/${audioText.toLowerCase()}--_gb_1.mp3`;
    const oxfordPromise = fetchToBase64(oxfordUrl).catch(() => null);
    const googlePromise = fetchGoogle();
    const oxfordData = await oxfordPromise;
    if (oxfordData) {
      return { type: "oxford", chunks: [oxfordData] };
    }
    const googleChunks2 = await googlePromise;
    return { type: "google", chunks: googleChunks2 };
  }
  const googleChunks = await fetchGoogle();
  return { type: "google", chunks: googleChunks };
}

// src/db/highlight_db.js
var LuminaAnnotationDB2 = {
  DB_NAME: "LuminaHighlightDB",
  DB_VERSION: 1,
  STORE_NAME: "highlights",
  _db: null,
  init() {
    return new Promise((resolve, reject) => {
      if (this._db) return resolve(this._db);
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          db.createObjectStore(this.STORE_NAME);
        }
      };
      request.onsuccess = (e) => {
        this._db = e.target.result;
        this._db.onclose = () => {
          this._db = null;
        };
        this._db.onversionchange = () => {
          if (this._db) {
            this._db.close();
            this._db = null;
          }
        };
        resolve(this._db);
      };
      request.onerror = (e) => reject(e.target.error);
    });
  },
  async put(key, highlightsArray) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE_NAME, "readwrite");
      const store = tx.objectStore(this.STORE_NAME);
      const request = store.put(highlightsArray, key);
      request.onsuccess = () => resolve(true);
      request.onerror = (e) => reject(e.target.error);
    });
  },
  async get(key) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE_NAME, "readonly");
      const store = tx.objectStore(this.STORE_NAME);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = (e) => reject(e.target.error);
    });
  },
  async delete(key) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE_NAME, "readwrite");
      const store = tx.objectStore(this.STORE_NAME);
      const request = store.delete(key);
      request.onsuccess = () => resolve(true);
      request.onerror = (e) => reject(e.target.error);
    });
  },
  async getAllKeys() {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE_NAME, "readonly");
      const store = tx.objectStore(this.STORE_NAME);
      const request = store.getAllKeys();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = (e) => reject(e.target.error);
    });
  },
  async getAll() {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE_NAME, "readonly");
      const store = tx.objectStore(this.STORE_NAME);
      const keysReq = store.getAllKeys();
      const valsReq = store.getAll();
      tx.oncomplete = () => {
        const keys = keysReq.result || [];
        const vals = valsReq.result || [];
        const results = {};
        for (let i = 0; i < keys.length; i++) {
          results[keys[i]] = vals[i];
        }
        resolve(results);
      };
      tx.onerror = (e) => reject(e.target.error);
    });
  }
};
var LuminaHighlightDB = LuminaAnnotationDB2;
if (typeof globalThis !== "undefined") {
  globalThis.LuminaAnnotationDB = LuminaAnnotationDB2;
  globalThis.LuminaHighlightDB = LuminaHighlightDB;
}

// src/background/highlight_handlers.js
function initHighlightHandlers() {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "load_highlights") {
      LuminaAnnotationDB2.get(request.url).then((highlights) => {
        sendResponse({ success: true, highlights: highlights || [] });
      }).catch((err) => {
        console.error("[Lumina BG] load_highlights error:", err);
        sendResponse({ success: false, error: err.message });
      });
      return true;
    }
    if (request.action === "save_highlight") {
      LuminaAnnotationDB2.get(request.url).then(async (highlights) => {
        const list = highlights || [];
        list.push(request.highlight);
        await LuminaAnnotationDB2.put(request.url, list);
        sendResponse({ success: true });
      }).catch((err) => {
        console.error("[Lumina BG] save_highlight error:", err);
        sendResponse({ success: false, error: err.message });
      });
      return true;
    }
    if (request.action === "undo_last_highlight") {
      LuminaAnnotationDB2.get(request.url).then(async (highlights) => {
        const list = highlights || [];
        if (list.length === 0) {
          sendResponse({ success: true, lastHighlight: null });
          return;
        }
        const lastHighlight = list.pop();
        await LuminaAnnotationDB2.put(request.url, list);
        sendResponse({ success: true, lastHighlight });
      }).catch((err) => {
        console.error("[Lumina BG] undo_last_highlight error:", err);
        sendResponse({ success: false, error: err.message });
      });
      return true;
    }
    if (request.action === "remove_highlights") {
      LuminaAnnotationDB2.get(request.url).then(async (highlights) => {
        const list = highlights || [];
        const idsStr = request.ids.map((id) => id.toString());
        const filtered = list.filter((h) => !idsStr.includes(h[0].toString()));
        await LuminaAnnotationDB2.put(request.url, filtered);
        sendResponse({ success: true });
      }).catch((err) => {
        console.error("[Lumina BG] remove_highlights error:", err);
        sendResponse({ success: false, error: err.message });
      });
      return true;
    }
    if (request.action === "update_highlight_color") {
      LuminaAnnotationDB2.get(request.url).then(async (highlights) => {
        const list = highlights || [];
        const highlight = list.find((h) => h[0].toString() === request.id.toString());
        if (highlight) {
          highlight[1] = request.color;
          await LuminaAnnotationDB2.put(request.url, list);
        }
        sendResponse({ success: true });
      }).catch((err) => {
        console.error("[Lumina BG] update_highlight_color error:", err);
        sendResponse({ success: false, error: err.message });
      });
      return true;
    }
    if (request.action === "update_highlight_comment") {
      LuminaAnnotationDB2.get(request.url).then(async (highlights) => {
        const list = highlights || [];
        const highlight = list.find((h) => h[0].toString() === request.id.toString());
        if (highlight) {
          highlight[8] = request.comment;
          await LuminaAnnotationDB2.put(request.url, list);
        }
        sendResponse({ success: true });
      }).catch((err) => {
        console.error("[Lumina BG] update_highlight_comment error:", err);
        sendResponse({ success: false, error: err.message });
      });
      return true;
    }
    if ((request.action === "lumina_session_updated" || request.action === "lumina_sessions_index_updated" || request.action === "lumina_sessions_deleted") && !request.isBroadcast) {
      request.isBroadcast = true;
      chrome.runtime.sendMessage(request).catch(() => {
      });
    }
  });
}

// src/core/auth/crypto_utils.js
async function compressData(string) {
  const byteArray = new TextEncoder().encode(string);
  const stream = new CompressionStream("gzip");
  const writer = stream.writable.getWriter();
  writer.write(byteArray);
  writer.close();
  const response = new Response(stream.readable);
  return await response.arrayBuffer();
}
async function decompressData(arrayBuffer) {
  const stream = new DecompressionStream("gzip");
  const writer = stream.writable.getWriter();
  writer.write(new Uint8Array(arrayBuffer));
  writer.close();
  const response = new Response(stream.readable);
  const buffer = await response.arrayBuffer();
  return new TextDecoder().decode(buffer);
}
var isExcludedKey = (k) => [
  "google_oauth_token",
  "google_oauth_token_time",
  "google_user_info",
  "last_sync_time",
  "last_sync_hash",
  "last_sync_md5",
  "last_sync_size",
  "last_cloud_stats",
  "drive_uploaded_blobs",
  "drive_backup_file_id",
  "settings_last_updated",
  "optionsLastSection",
  "optionsLastScroll",
  "optionsScrollPositions",
  "sidepanel_active_tab_index",
  "sidepanel_active_group_index",
  "sidepanel_secondary_tab_index",
  "sidepanel_is_split_mode",
  "sidepanel_split_ratio",
  "lumina_active_tab_index",
  "lumina_active_group_index",
  "lumina_secondary_tab_index",
  "lumina_is_split_mode",
  "lumina_split_ratio",
  "luminaWindowId",
  "pendingMicToggle",
  "luminaTemplatesV3",
  "luminaBatchHistoryV3",
  "lastUsedGenAIModel",
  "lastUsedBatchSize",
  "lastUsedDeck",
  "lastUsedTemplateId",
  "ankiQuickNoteContent",
  "attachments"
].includes(k) || k.includes("_inst_") || k.startsWith("pending_sidepanel_query_") || k.startsWith("rot_") || k === "audio_cache" || k.startsWith("lumina_img_cache_") || k.startsWith("lumina_img_query_") || k.startsWith("spotlight_history_") || k.startsWith("yt_transcript_");

// src/core/auth/google_auth.js
var WEB_OAUTH_CONFIG = {
  clientId: "824888142961-mlpoj5jeqbo1lv2d61mho7cnnde9aicv.apps.googleusercontent.com",
  scopes: [
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/drive.appdata"
  ]
};
function launchGoogleWebAuthFlow(interactive) {
  return new Promise((resolve, reject) => {
    const redirectUri = chrome.identity.getRedirectURL();
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(WEB_OAUTH_CONFIG.clientId)}&response_type=token&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(WEB_OAUTH_CONFIG.scopes.join(" "))}`;
    chrome.identity.launchWebAuthFlow({
      url: authUrl,
      interactive
    }, (redirectUrl) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (redirectUrl) {
        try {
          const url = new URL(redirectUrl);
          const hashParams = new URLSearchParams(url.hash.substring(1));
          const token = hashParams.get("access_token");
          if (token) {
            chrome.storage.local.set({
              google_oauth_token: token,
              google_oauth_token_time: Date.now()
            });
            resolve(token);
          } else {
            reject(new Error("No access token found in redirect URL"));
          }
        } catch (err) {
          reject(err);
        }
      } else {
        reject(new Error("Authentication flow cancelled or failed"));
      }
    });
  });
}
var AuthService = class {
  constructor() {
    this.user = null;
    this.listeners = [];
    this.isAuthenticated = false;
    this.isInitialized = false;
    this.init();
    const isBackground = typeof window === "undefined";
    if (isBackground && typeof chrome !== "undefined" && chrome.alarms) {
      chrome.alarms.get("tokenRefresh", (alarm) => {
        if (!alarm) {
          chrome.alarms.create("tokenRefresh", { periodInMinutes: 45 });
        }
      });
      chrome.alarms.onAlarm.addListener((alarm) => {
        if (alarm.name === "tokenRefresh") {
          this._refreshTokenIfNeeded();
        }
      });
    }
  }
  async init() {
    try {
      const data = await chrome.storage.local.get(["google_user_info"]);
      if (data.google_user_info) {
        this.user = data.google_user_info;
        this.isAuthenticated = true;
      }
    } catch (e) {
      console.warn("[Auth] Init failed:", e);
    }
    this.isInitialized = true;
    this.notifyListeners(this.isAuthenticated, this.user);
    if (this.isAuthenticated && typeof window !== "undefined") {
      setTimeout(() => {
        if (typeof LuminaSync !== "undefined") {
          LuminaSync.checkAutoSync(true);
        }
      }, 100);
    }
  }
  async _refreshTokenIfNeeded() {
    if (!this.isAuthenticated) return;
    try {
      const token = await this.getAuthToken(false, true);
      if (token) {
        console.log("[Auth] Token refreshed successfully");
      }
    } catch (e) {
      console.log("[Auth] Token refresh failed:", e.message);
    }
  }
  async checkAuthStatus() {
    try {
      const token = await this.getAuthToken(false);
      if (token) {
        await this.fetchUserInfo(token);
      }
    } catch (e) {
      console.log("[Auth] Check status failed:", e.message);
    }
  }
  async getAuthToken(interactive = false, forceRefresh = false) {
    const isChrome = typeof chrome !== "undefined" && /Chrome/i.test(navigator.userAgent) && !/Edg/i.test(navigator.userAgent) && !/OPR/i.test(navigator.userAgent) && !(navigator.brave && typeof navigator.brave.isBrave === "function");
    if (!isChrome) {
      if (forceRefresh) {
        this._cachedToken = null;
        await chrome.storage.local.remove(["google_oauth_token", "google_oauth_token_time"]);
      } else if (this._cachedToken) {
        return this._cachedToken;
      } else {
        try {
          const storageData = await chrome.storage.local.get(["google_oauth_token", "google_oauth_token_time"]);
          if (storageData && storageData.google_oauth_token && storageData.google_oauth_token_time) {
            const ageMs = Date.now() - storageData.google_oauth_token_time;
            if (ageMs < 3e6) {
              this._cachedToken = storageData.google_oauth_token;
              return this._cachedToken;
            }
          }
        } catch (e) {
        }
      }
      const token = await launchGoogleWebAuthFlow(interactive);
      this._cachedToken = token;
      return token;
    }
    return new Promise((resolve, reject) => {
      if (typeof chrome === "undefined" || !chrome.identity || !chrome.identity.getAuthToken) {
        reject(new Error("Chrome Identity API is not available"));
        return;
      }
      const attemptNativeAuth = () => {
        chrome.identity.getAuthToken({ interactive }, (token) => {
          if (chrome.runtime.lastError) {
            const errMsg = chrome.runtime.lastError.message;
            if (errMsg.includes("not supported") || errMsg.includes("not available")) {
              launchGoogleWebAuthFlow(interactive).then((t) => {
                this._cachedToken = t;
                resolve(t);
              }).catch(reject);
            } else {
              reject(new Error(errMsg));
            }
          } else if (token) {
            resolve(token);
          } else {
            reject(new Error("Failed to retrieve authentication token"));
          }
        });
      };
      if (forceRefresh) {
        chrome.identity.getAuthToken({ interactive: false }, (token) => {
          if (token) {
            chrome.identity.removeCachedAuthToken({ token }, () => {
              attemptNativeAuth();
            });
          } else {
            attemptNativeAuth();
          }
        });
      } else {
        attemptNativeAuth();
      }
    });
  }
  async login() {
    try {
      const token = await this.getAuthToken(true);
      await this.fetchUserInfo(token);
      if (typeof LuminaSync !== "undefined") {
        await LuminaSync.pullFromCloud(true).catch((e) => console.warn("[Auth] Post-login pull error:", e));
      }
      return this.user;
    } catch (error) {
      console.error("Login failed:", error);
      throw error;
    }
  }
  async logout() {
    try {
      const token = this._cachedToken || (await chrome.storage.local.get(["google_oauth_token"])).google_oauth_token || await this.getAuthToken(false).catch(() => null);
      this._cachedToken = null;
      if (token) {
        const url = "https://accounts.google.com/o/oauth2/revoke?token=" + token;
        await fetch(url);
        try {
          chrome.identity.removeCachedAuthToken({ token }, () => {
          });
        } catch (e) {
        }
      }
    } catch (e) {
    }
    await chrome.storage.local.remove([
      "google_oauth_token",
      "google_oauth_token_time",
      "google_user_info"
    ]);
    chrome.alarms.clear("tokenRefresh");
    chrome.alarms.clear("luminaAutoSync");
    this.user = null;
    this.isAuthenticated = false;
    this.notifyListeners();
  }
  async fetchUserInfo(token, isRetry = false) {
    try {
      const response = await fetch("https://www.googleapis.com/oauth2/v1/userinfo?alt=json", {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      if (!response.ok) {
        if (response.status === 401) {
          await chrome.storage.local.remove(["google_oauth_token", "google_oauth_token_time"]);
          if (!isRetry) {
            const newToken = await this.getAuthToken(false, true);
            if (newToken && newToken !== token) {
              return await this.fetchUserInfo(newToken, true);
            }
          }
        }
        throw new Error("Failed to fetch user info: " + response.status);
      }
      const data = await response.json();
      this.user = {
        id: data.id,
        email: data.email,
        name: data.name,
        picture: data.picture
      };
      const wasAuth = this.isAuthenticated;
      this.isAuthenticated = true;
      chrome.storage.local.set({ google_user_info: this.user });
      if (!wasAuth) {
        this.notifyListeners();
      }
    } catch (e) {
      console.error("Fetch user info error:", e);
      throw e;
    }
  }
  addListener(callback) {
    this.listeners.push(callback);
  }
  removeListener(callback) {
    this.listeners = this.listeners.filter((l) => l !== callback);
  }
  notifyListeners() {
    this.listeners.forEach((cb) => cb(this.isAuthenticated, this.user));
  }
};
var LuminaAuth = new AuthService();
if (typeof window !== "undefined") {
  window.LuminaAuth = LuminaAuth;
}

// src/core/auth/drive_sync.js
var SyncManager = class {
  _isPageContext() {
    return typeof window !== "undefined";
  }
  _delegateSyncToBackground(action = "lumina_drive_sync", params = {}) {
    this.notifyListeners("Syncing...", null);
    const wrapper = typeof document !== "undefined" ? document.getElementById("user-avatar-wrapper") : null;
    if (wrapper) wrapper.classList.add("is-syncing");
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ action, ...params }, (res) => {
          if (chrome.runtime.lastError) {
            console.warn("[Sync] SW delegate failed:", chrome.runtime.lastError.message);
            if (wrapper) wrapper.classList.remove("is-syncing");
            this.notifyListeners("Sync failure", null);
          } else {
            setTimeout(() => {
              if (wrapper) wrapper.classList.remove("is-syncing");
              this.notifyListeners("Synced just now", Date.now());
            }, 500);
          }
          resolve(res);
        });
      } catch (e) {
        console.warn("[Sync] SW delegate error:", e);
        if (wrapper) wrapper.classList.remove("is-syncing");
        this.notifyListeners("Sync failure", null);
        resolve(null);
      }
    });
  }
  constructor(authService) {
    this.authService = authService || new AuthService();
    this.FILENAME = "lumina_backup.json";
    this.listeners = [];
    this.isSyncing = false;
    const isBackground = typeof window === "undefined";
    if (isBackground && typeof chrome !== "undefined") {
      if (chrome.runtime && chrome.runtime.onStartup) {
        chrome.runtime.onStartup.addListener(() => {
          this.checkAutoSync(true);
        });
      }
    } else if (typeof window !== "undefined") {
      setTimeout(() => {
        this.checkAutoSync(true);
      }, 200);
    }
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local") return;
        if (this.isSyncing) return;
        const keys = Object.keys(changes);
        const excludedKeys = [
          "google_oauth_token",
          "google_oauth_token_time",
          "google_user_info",
          "lumina_cached_user",
          "last_sync_time",
          "last_sync_hash",
          "last_sync_md5",
          "last_sync_size",
          "last_cloud_stats",
          "drive_uploaded_blobs",
          "drive_backup_file_id",
          "settings_last_updated",
          "optionsLastSection",
          "optionsLastScroll",
          "optionsScrollPositions",
          "sidepanel_active_tab_index",
          "sidepanel_active_group_index",
          "lumina_active_tab_index",
          "lumina_active_group_index"
        ];
        const hasSettingsKeys = keys.some(
          (k) => !k.startsWith("lumina_session_") && !k.startsWith("google_") && !excludedKeys.includes(k)
        );
        if (hasSettingsKeys) {
          chrome.storage.local.set({ settings_last_updated: Date.now() });
        }
      });
    }
  }
  triggerDebouncedSync(delayMs = 1e3) {
    if (!this.authService.isAuthenticated) return;
    if (this._isPageContext()) {
      try {
        chrome.runtime.sendMessage({ action: "lumina_drive_sync_debounced", delayMs }).catch(() => {
        });
      } catch (e) {
      }
      return;
    }
    if (this._debounceTimer) clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => {
      this._debounceTimer = null;
      this.pushToCloud().catch((err) => console.error("[Sync] Debounced push failed:", err));
    }, delayMs);
  }
  addListener(callback) {
    this.listeners.push(callback);
  }
  notifyListeners(status, lastSync) {
    this.listeners.forEach((cb) => cb(status, lastSync));
  }
  async checkAutoSync(forceCheck = false) {
    if (!this.authService.isAuthenticated) return;
    if (this._isPageContext()) {
      await this._delegateSyncToBackground("lumina_drive_sync", { isAuto: true });
      return;
    }
    try {
      await this.pullFromCloud(forceCheck);
    } catch (e) {
      console.error("[Sync] Auto-sync pull failed:", e);
    }
  }
  async getLastSyncTime() {
    const result = await chrome.storage.local.get(["last_sync_time"]);
    return result.last_sync_time ? new Date(result.last_sync_time).toLocaleString() : "Never";
  }
  async getToken(interactive = false) {
    return await this.authService.getAuthToken(interactive);
  }
  async syncUp(isAuto = false) {
    if (this._isPageContext()) return await this._delegateSyncToBackground("lumina_drive_sync", { isAuto: false, forcePush: true });
    return await this.pushToCloud();
  }
  async syncDown() {
    if (this._isPageContext()) return await this._delegateSyncToBackground("lumina_drive_sync", { isAuto: true, forcePull: true });
    return await this.pullFromCloud(true);
  }
  async downloadBackup(token, fileId) {
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (response.status === 401 || response.status === 403) throw new Error("UNAUTHORIZED");
    if (!response.ok) throw new Error("Download failed");
    const buffer = await response.arrayBuffer();
    const arr = new Uint8Array(buffer);
    if (arr.length >= 2 && arr[0] === 31 && arr[1] === 139) {
      const jsonStr2 = await decompressData(buffer);
      return JSON.parse(jsonStr2);
    }
    const jsonStr = new TextDecoder().decode(buffer);
    return JSON.parse(jsonStr);
  }
  async listAppDataFiles(token) {
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent("'appDataFolder' in parents and trashed = false")}&spaces=appDataFolder&orderBy=${encodeURIComponent("modifiedTime desc")}&fields=files(id, name, md5Checksum, modifiedTime, size)&pageSize=1000`;
    const response = await fetch(url, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (response.status === 401 || response.status === 403) throw new Error("UNAUTHORIZED");
    if (!response.ok) throw new Error("Failed to list appData files");
    const data = await response.json();
    return data.files || [];
  }
  async uploadBlobFile(token, filename, blob, existingFileId = null) {
    const mimeType = blob && blob.type ? blob.type : "application/octet-stream";
    const metadata = {
      name: filename,
      ...existingFileId ? {} : { parents: ["appDataFolder"] }
    };
    const form = new FormData();
    form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
    form.append("file", blob, filename);
    const url = existingFileId ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart&fields=id,name,md5Checksum,size` : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,md5Checksum,size`;
    const response = await fetch(url, {
      method: existingFileId ? "PATCH" : "POST",
      headers: { "Authorization": `Bearer ${token}` },
      body: form
    });
    if (response.status === 401 || response.status === 403) throw new Error("UNAUTHORIZED");
    if (!response.ok) throw new Error(`Failed to upload blob ${filename}`);
    return await response.json();
  }
  async downloadBlobFile(token, fileId) {
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (response.status === 401 || response.status === 403) throw new Error("UNAUTHORIZED");
    if (!response.ok) throw new Error(`Failed to download blob ${fileId}`);
    return await response.blob();
  }
  async deleteDriveFile(token, fileId) {
    try {
      const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` }
      });
      return response.ok;
    } catch (e) {
      console.warn(`[Sync] Failed to delete drive file ${fileId}:`, e);
      return false;
    }
  }
  async createBackupFile(token, content) {
    const metadata = {
      name: this.FILENAME,
      parents: ["appDataFolder"]
    };
    const compressed = await compressData(content);
    const form = new FormData();
    form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
    form.append("file", new Blob([compressed], { type: "application/octet-stream" }));
    const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,md5Checksum,size", {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}` },
      body: form
    });
    if (response.status === 401 || response.status === 403) throw new Error("UNAUTHORIZED");
    if (!response.ok) throw new Error("Failed to create file");
    return await response.json();
  }
  async updateBackupFile(token, fileId, content) {
    const metadata = {
      name: this.FILENAME
    };
    const compressed = await compressData(content);
    const form = new FormData();
    form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
    form.append("file", new Blob([compressed], { type: "application/octet-stream" }));
    const response = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart&fields=id,name,md5Checksum,size`, {
      method: "PATCH",
      headers: { "Authorization": `Bearer ${token}` },
      body: form
    });
    if (response.status === 401 || response.status === 403) throw new Error("UNAUTHORIZED");
    if (!response.ok) throw new Error("Failed to update file");
    return await response.json();
  }
  async getFileMetadata(token, fileId) {
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,md5Checksum,modifiedTime,size`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (response.status === 401 || response.status === 403) throw new Error("UNAUTHORIZED");
    if (!response.ok) return null;
    return await response.json();
  }
  async getOrFindBackupFile(token, forceRefresh = false) {
    let activeToken = token;
    let driveFiles = [];
    try {
      driveFiles = await this.listAppDataFiles(activeToken);
    } catch (err) {
      if (err.message === "UNAUTHORIZED") {
        await chrome.storage.local.remove(["google_oauth_token", "google_oauth_token_time"]);
        activeToken = await this.authService.getAuthToken(false, true);
        driveFiles = await this.listAppDataFiles(activeToken);
      } else {
        throw err;
      }
    }
    const backupFiles = (driveFiles || []).filter((f) => f.name === this.FILENAME);
    if (backupFiles.length === 0) {
      this.cachedBackupFileId = null;
      await chrome.storage.local.remove(["drive_backup_file_id"]).catch(() => {
      });
      return { token: activeToken, remoteFile: null, fileId: null, driveFiles };
    }
    const primaryFile = backupFiles[0];
    const fileId = primaryFile.id;
    this.cachedBackupFileId = fileId;
    chrome.storage.local.set({ drive_backup_file_id: fileId }).catch(() => {
    });
    if (backupFiles.length > 1) {
      const duplicates = backupFiles.slice(1);
      for (const dup of duplicates) {
        this.deleteDriveFile(activeToken, dup.id).catch(() => {
        });
      }
    }
    return { token: activeToken, remoteFile: primaryFile, fileId, driveFiles };
  }
  async gatherLocalData() {
    const localData = await chrome.storage.local.get(null);
    if (typeof NotesManager !== "undefined") {
      try {
        localData.lumina_notes_collections = typeof NotesManager.getAllCollectionsRaw === "function" ? await NotesManager.getAllCollectionsRaw() : await NotesManager.getCollections(true);
        localData.lumina_notes_items = typeof NotesManager.getAllNotesRaw === "function" ? await NotesManager.getAllNotesRaw() : await NotesManager.getNotes(null, true);
      } catch (err) {
        console.error("[Sync] Failed to gather notes for sync:", err);
      }
    }
    if (typeof TTSDB !== "undefined") {
      try {
        const recordings = typeof TTSDB.getAllRecordingsRaw === "function" ? await TTSDB.getAllRecordingsRaw() : await TTSDB.getAllRecordings(true);
        localData.lumina_tts_recordings = recordings.map((rec) => {
          const { audioBlob, ...meta } = rec;
          return meta;
        });
      } catch (err) {
        console.error("[Sync] Failed to gather TTS recordings for sync:", err);
      }
    }
    if (typeof LuminaAnnotationDB !== "undefined") {
      try {
        const highlights = await LuminaAnnotationDB.getAll();
        Object.assign(localData, highlights);
      } catch (err) {
        console.error("[Sync] Failed to load highlights from IndexedDB:", err);
      }
    }
    if (typeof LuminaChatDB !== "undefined") {
      try {
        const sessions = typeof LuminaChatDB.getAllSessionsRaw === "function" ? await LuminaChatDB.getAllSessionsRaw() : await LuminaChatDB.getAllSessions(true);
        const sessionsObj = {};
        for (const s of Object.values(sessions)) {
          if (s && s.id) {
            sessionsObj[s.id] = s;
            if (!s.isDeleted) {
              localData[`lumina_session_${s.id}`] = await LuminaChatDB.getMessages(s.id).catch(() => []);
            }
          }
        }
        localData.lumina_chat_sessions = sessionsObj;
      } catch (err) {
        console.error("[Sync] Failed to load chats from IndexedDB:", err);
      }
    }
    return localData;
  }
  async pullFromCloud(force = false) {
    if (this._isPageContext()) {
      return await this._delegateSyncToBackground("lumina_drive_sync", { isAuto: true, forcePull: force });
    }
    if (this.isSyncing) return;
    this.isSyncing = true;
    this.notifyListeners("Syncing...", null);
    try {
      try {
        chrome.runtime.sendMessage({ action: "lumina_sync_status", status: "syncing" }).catch(() => {
        });
      } catch (e) {
      }
      const initialToken = await this.getToken(!force);
      if (!initialToken) throw new Error("Not authenticated");
      const localSync = await chrome.storage.local.get(["last_sync_md5"]);
      const { token, remoteFile, fileId, driveFiles } = await this.getOrFindBackupFile(initialToken, force);
      if (!remoteFile || !fileId) {
        this.notifyListeners("No cloud data", null);
        try {
          chrome.runtime.sendMessage({ action: "lumina_sync_status", status: "done", timestamp: Date.now() }).catch(() => {
          });
        } catch (e) {
        }
        return null;
      }
      if (!force && remoteFile.md5Checksum && localSync.last_sync_md5 && remoteFile.md5Checksum === localSync.last_sync_md5) {
        const now2 = Date.now();
        this.notifyListeners("Synced just now", now2);
        try {
          chrome.runtime.sendMessage({ action: "lumina_sync_status", status: "done", timestamp: now2 }).catch(() => {
          });
        } catch (e) {
        }
        return now2;
      }
      const remoteBackup = await this.downloadBackup(token, fileId);
      if (!remoteBackup || !remoteBackup.data) {
        this.notifyListeners("No cloud data", null);
        try {
          chrome.runtime.sendMessage({ action: "lumina_sync_status", status: "done", timestamp: Date.now() }).catch(() => {
          });
        } catch (e) {
        }
        return null;
      }
      const remoteData = remoteBackup.data;
      delete remoteData.attachments;
      const currentLocal = await chrome.storage.local.get(null);
      const keysToRemove = [];
      for (const key of Object.keys(currentLocal)) {
        if (isExcludedKey(key)) continue;
        if (key.startsWith("lumina_session_") || key === "lumina_chat_sessions") continue;
        if (key.startsWith("highlights_")) continue;
        if (!(key in remoteData)) {
          keysToRemove.push(key);
        }
      }
      if (keysToRemove.length > 0) {
        await chrome.storage.local.remove(keysToRemove);
      }
      const storageToSet = {};
      for (const [k, v] of Object.entries(remoteData)) {
        if (isExcludedKey(k)) continue;
        if (k.startsWith("lumina_session_") || k === "lumina_chat_sessions") continue;
        if (k.startsWith("highlights_")) continue;
        storageToSet[k] = v;
      }
      if (Object.keys(storageToSet).length > 0) {
        await chrome.storage.local.set(storageToSet);
      }
      if (typeof LuminaAnnotationDB !== "undefined") {
        const currentHighlights = await LuminaAnnotationDB.getAll().catch(() => ({}));
        for (const key of Object.keys(currentHighlights)) {
          if (!(key in remoteData)) {
            await LuminaAnnotationDB.delete(key).catch(() => {
            });
          }
        }
        for (const [k, v] of Object.entries(remoteData)) {
          if (k.startsWith("highlights_")) {
            await LuminaAnnotationDB.put(k, v).catch(() => {
            });
          }
        }
      }
      const remoteSessions = remoteData.lumina_chat_sessions || {};
      const activeAttachmentIds = /* @__PURE__ */ new Set();
      if (typeof LuminaChatDB !== "undefined") {
        try {
          const currentSessions = await LuminaChatDB.getAllSessions().catch(() => ({}));
          for (const s of Object.values(currentSessions)) {
            if (s && s.id && !remoteSessions[s.id]) {
              await LuminaChatDB.deleteSession(s.id).catch(() => {
              });
            }
          }
          for (const [sid, sessionMeta] of Object.entries(remoteSessions)) {
            await LuminaChatDB.putSession(sessionMeta).catch(() => {
            });
            if (sessionMeta && sessionMeta.isDeleted) {
              await LuminaChatDB.deleteSession(sid).catch(() => {
              });
            } else {
              const sessionKey = `lumina_session_${sid}`;
              const messages = remoteData[sessionKey];
              if (Array.isArray(messages)) {
                await LuminaChatDB.putMessages(sid, messages).catch(() => {
                });
                for (const msg of messages) {
                  if (msg && Array.isArray(msg.images)) {
                    for (const img of msg.images) {
                      if (img && typeof img === "object" && img.attachmentId) {
                        activeAttachmentIds.add(img.attachmentId);
                      }
                    }
                  }
                }
              }
            }
          }
        } catch (err) {
          console.error("[Sync] Failed to apply chats from cloud:", err);
        }
      }
      if (typeof NotesManager !== "undefined") {
        try {
          const remoteCollections = remoteData.lumina_notes_collections;
          const remoteNotes = remoteData.lumina_notes_items;
          const db = await NotesManager.getDB();
          if (Array.isArray(remoteCollections)) {
            const remoteColIds = new Set(remoteCollections.map((c) => c && c.id).filter(Boolean));
            const currentCols = await NotesManager.getCollections().catch(() => []);
            const txCol = db.transaction(NotesManager.STORE_COLLECTIONS, "readwrite");
            const storeCol = txCol.objectStore(NotesManager.STORE_COLLECTIONS);
            for (const c of currentCols) {
              if (c && c.id && !remoteColIds.has(c.id)) {
                storeCol.delete(c.id);
              }
            }
            for (const col of remoteCollections) {
              if (col && col.id) storeCol.put(col);
            }
          }
          if (Array.isArray(remoteNotes)) {
            const remoteNoteIds = new Set(remoteNotes.map((n) => n && n.id).filter(Boolean));
            const currentNotes = await NotesManager.getNotes().catch(() => []);
            const txNote = db.transaction(NotesManager.STORE_NOTES, "readwrite");
            const storeNote = txNote.objectStore(NotesManager.STORE_NOTES);
            for (const n of currentNotes) {
              if (n && n.id && !remoteNoteIds.has(n.id)) {
                storeNote.delete(n.id);
              }
            }
            for (const note of remoteNotes) {
              if (note && note.id) storeNote.put(note);
            }
          }
        } catch (err) {
          console.error("[Sync] Failed to apply notes from cloud:", err);
        }
      }
      const activeTtsRecMap = /* @__PURE__ */ new Map();
      let ttsUpdated = false;
      if (typeof TTSDB !== "undefined" && Array.isArray(remoteData.lumina_tts_recordings)) {
        try {
          const remoteRecs = remoteData.lumina_tts_recordings;
          const remoteRecIds = new Set(remoteRecs.map((r) => r && r.id).filter(Boolean));
          const currentRecs = await TTSDB.getAllRecordings().catch(() => []);
          const currentMap = new Map(currentRecs.map((r) => [r.id, r]));
          for (const r of currentRecs) {
            if (r && r.id && !remoteRecIds.has(r.id)) {
              await TTSDB.deleteRecording(r.id).catch(() => {
              });
              ttsUpdated = true;
            }
          }
          for (const recMeta of remoteRecs) {
            if (recMeta && recMeta.id) {
              if (!recMeta.isDeleted) activeTtsRecMap.set(recMeta.id, recMeta);
              const localRec = currentMap.get(recMeta.id);
              await TTSDB.saveRecording({
                ...recMeta,
                audioBlob: localRec ? localRec.audioBlob : null
              }).catch(() => {
              });
              ttsUpdated = true;
            }
          }
        } catch (err) {
          console.error("[Sync] Failed to apply TTS records from cloud:", err);
        }
      }
      let actualDriveFiles = driveFiles;
      if (!actualDriveFiles && (activeAttachmentIds.size > 0 || activeTtsRecMap.size > 0)) {
        actualDriveFiles = await this.listAppDataFiles(token).catch(() => []);
      }
      const driveFileMap = new Map((actualDriveFiles || []).map((f) => [f.name, f]));
      if (typeof LuminaAttachmentDB !== "undefined" && LuminaAttachmentDB.init) {
        const db = await LuminaAttachmentDB.init();
        for (const [filename, fileObj] of driveFileMap.entries()) {
          if (filename.startsWith("att_") && filename.endsWith(".bin")) {
            const key = filename.slice(4, -4);
            if (activeAttachmentIds.has(key)) {
              const exists = await LuminaAttachmentDB.get(key).catch(() => null);
              if (!exists) {
                try {
                  const downloadedBlob = await this.downloadBlobFile(token, fileObj.id);
                  if (downloadedBlob) {
                    await LuminaAttachmentDB.put(key, downloadedBlob);
                  }
                } catch (err) {
                  console.warn(`[Sync] Failed to download attachment ${key}:`, err);
                }
              }
            }
          }
        }
        try {
          const metadata = await LuminaAttachmentDB.getAllMetadata();
          for (const item of metadata) {
            if (!activeAttachmentIds.has(item.key)) {
              await LuminaAttachmentDB.delete(item.key);
            }
          }
        } catch (cleanupErr) {
        }
      }
      if (typeof TTSDB !== "undefined") {
        let ttsAudioDownloaded = false;
        const currentRecs = await TTSDB.getAllRecordings().catch(() => []);
        const localRecMap = new Map(currentRecs.map((r) => [r.id, r]));
        for (const [filename, fileObj] of driveFileMap.entries()) {
          if (filename.startsWith("tts_") && filename.endsWith(".bin")) {
            const id = filename.slice(4, -4);
            const localRec = localRecMap.get(id);
            if (activeTtsRecMap.has(id) && localRec && !localRec.audioBlob) {
              try {
                const downloadedBlob = await this.downloadBlobFile(token, fileObj.id);
                if (downloadedBlob) {
                  localRec.audioBlob = downloadedBlob;
                  await TTSDB.saveRecording(localRec);
                  ttsAudioDownloaded = true;
                }
              } catch (err) {
                console.warn(`[Sync] Failed to download TTS audio ${id}:`, err);
              }
            }
          }
        }
        if (ttsAudioDownloaded) ttsUpdated = true;
      }
      const now = Date.now();
      const cloudStats = {
        chatsCount: Object.values(remoteSessions).filter((s) => s && !s.isDeleted).length,
        notesCount: Array.isArray(remoteData.lumina_notes_items) ? remoteData.lumina_notes_items.filter((n) => n && !n.isDeleted).length : 0,
        collectionsCount: Array.isArray(remoteData.lumina_notes_collections) ? remoteData.lumina_notes_collections.length : 0,
        highlightsCount: Object.keys(remoteData).filter((k) => k.startsWith("highlights_")).length,
        ttsCount: Array.isArray(remoteData.lumina_tts_recordings) ? remoteData.lumina_tts_recordings.filter((r) => r && !r.isDeleted).length : 0,
        attachmentsCount: activeAttachmentIds.size
      };
      await chrome.storage.local.set({
        last_sync_time: now,
        last_sync_md5: remoteFile ? remoteFile.md5Checksum : null,
        last_sync_size: remoteFile ? remoteFile.size : null,
        last_cloud_stats: cloudStats
      });
      if (typeof globalThis !== "undefined") globalThis._lastDriveSyncAt = now;
      try {
        chrome.runtime.sendMessage({ action: "lumina_sessions_index_updated" }).catch(() => {
        });
        chrome.runtime.sendMessage({ action: "lumina_notes_updated" }).catch(() => {
        });
        chrome.runtime.sendMessage({ action: "lumina_highlights_updated" }).catch(() => {
        });
        if (ttsUpdated) {
          chrome.runtime.sendMessage({ action: "lumina_tts_updated" }).catch(() => {
          });
        }
        chrome.runtime.sendMessage({ action: "lumina_sync_status", status: "done", timestamp: now }).catch(() => {
        });
      } catch (e) {
      }
      this.notifyListeners("Synced just now", now);
      return now;
    } catch (error) {
      console.error("[Sync] pullFromCloud error:", error);
      this.notifyListeners("Sync failure", null);
      try {
        chrome.runtime.sendMessage({ action: "lumina_sync_status", status: "failure" }).catch(() => {
        });
      } catch (e) {
      }
      throw error;
    } finally {
      this.isSyncing = false;
    }
  }
  async pushToCloud() {
    if (this._isPageContext()) {
      return await this._delegateSyncToBackground("lumina_drive_sync", { isAuto: false, forcePush: true });
    }
    if (this.isSyncing) return;
    this.isSyncing = true;
    try {
      const initialToken = await this.getToken(true);
      if (!initialToken) throw new Error("Not authenticated");
      let { token, fileId, driveFiles } = await this.getOrFindBackupFile(initialToken, false);
      const localData = await this.gatherLocalData();
      this.notifyListeners("Syncing...", null);
      try {
        chrome.runtime.sendMessage({ action: "lumina_sync_status", status: "syncing" }).catch(() => {
        });
      } catch (e) {
      }
      const dataToUpload = { ...localData };
      const payload = {
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        version: chrome.runtime.getManifest().version,
        data: dataToUpload
      };
      let uploadRes;
      try {
        uploadRes = fileId ? await this.updateBackupFile(token, fileId, JSON.stringify(payload)) : await this.createBackupFile(token, JSON.stringify(payload));
      } catch (err) {
        if (fileId) {
          const refreshed = await this.getOrFindBackupFile(token, true);
          token = refreshed.token;
          fileId = refreshed.fileId;
          uploadRes = fileId ? await this.updateBackupFile(token, fileId, JSON.stringify(payload)) : await this.createBackupFile(token, JSON.stringify(payload));
        } else {
          throw err;
        }
      }
      if (uploadRes && uploadRes.id) {
        this.cachedBackupFileId = uploadRes.id;
        chrome.storage.local.set({ drive_backup_file_id: uploadRes.id }).catch(() => {
        });
      }
      const newUploadedMd5 = uploadRes && typeof uploadRes === "object" ? uploadRes.md5Checksum : uploadRes;
      const newUploadedSize = uploadRes && typeof uploadRes === "object" ? uploadRes.size : null;
      const storedBlobs = await chrome.storage.local.get(["drive_uploaded_blobs"]);
      const uploadedBlobSet = new Set(storedBlobs.drive_uploaded_blobs || []);
      let hasNewBlobs = false;
      if (typeof LuminaAttachmentDB !== "undefined" && LuminaAttachmentDB.init) {
        const db = await LuminaAttachmentDB.init();
        const localAttachments = await new Promise((resolve) => {
          const tx = db.transaction(LuminaAttachmentDB.STORE_NAME, "readonly");
          const store = tx.objectStore(LuminaAttachmentDB.STORE_NAME);
          const req = store.openCursor();
          const map = /* @__PURE__ */ new Map();
          req.onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) {
              if (cursor.value instanceof Blob) map.set(cursor.key, cursor.value);
              cursor.continue();
            } else resolve(map);
          };
          req.onerror = () => resolve(map);
        });
        for (const [key, blob] of localAttachments.entries()) {
          const filename = `att_${key}.bin`;
          if (!uploadedBlobSet.has(filename) && blob) {
            try {
              await this.uploadBlobFile(token, filename, blob);
              uploadedBlobSet.add(filename);
              hasNewBlobs = true;
            } catch (err) {
              console.warn(`[Sync] Failed to upload attachment ${key}:`, err);
            }
          }
        }
      }
      if (typeof TTSDB !== "undefined") {
        const currentRecs = await TTSDB.getAllRecordings().catch(() => []);
        for (const rec of currentRecs) {
          if (rec && rec.id && rec.audioBlob instanceof Blob) {
            const filename = `tts_${rec.id}.bin`;
            if (!uploadedBlobSet.has(filename)) {
              try {
                await this.uploadBlobFile(token, filename, rec.audioBlob);
                uploadedBlobSet.add(filename);
                hasNewBlobs = true;
              } catch (err) {
                console.warn(`[Sync] Failed to upload TTS audio ${rec.id}:`, err);
              }
            }
          }
        }
      }
      if (hasNewBlobs || !storedBlobs.drive_uploaded_blobs) {
        await chrome.storage.local.set({ drive_uploaded_blobs: Array.from(uploadedBlobSet) });
      }
      const now = Date.now();
      const cloudStats = {
        chatsCount: Object.values(localData.lumina_chat_sessions || {}).filter((s) => s && !s.isDeleted).length,
        notesCount: Array.isArray(localData.lumina_notes_items) ? localData.lumina_notes_items.filter((n) => n && !n.isDeleted).length : 0,
        collectionsCount: Array.isArray(localData.lumina_notes_collections) ? localData.lumina_notes_collections.length : 0,
        highlightsCount: Object.keys(localData).filter((k) => k.startsWith("highlights_")).length,
        ttsCount: Array.isArray(localData.lumina_tts_recordings) ? localData.lumina_tts_recordings.filter((r) => r && !r.isDeleted).length : 0,
        attachmentsCount: Array.from(uploadedBlobSet).filter((n) => n.startsWith("att_") || n.startsWith("blob_att_")).length
      };
      await chrome.storage.local.set({
        last_sync_time: now,
        last_sync_md5: newUploadedMd5,
        last_sync_size: newUploadedSize,
        last_cloud_stats: cloudStats
      });
      if (typeof globalThis !== "undefined") globalThis._lastDriveSyncAt = now;
      this.notifyListeners("Synced just now", now);
      try {
        chrome.runtime.sendMessage({ action: "lumina_sync_status", status: "done", timestamp: now }).catch(() => {
        });
      } catch (e) {
      }
      return now;
    } catch (error) {
      console.error("[Sync] pushToCloud error:", error);
      this.notifyListeners("Sync failure", null);
      try {
        chrome.runtime.sendMessage({ action: "lumina_sync_status", status: "failure" }).catch(() => {
        });
      } catch (e) {
      }
      throw error;
    } finally {
      this.isSyncing = false;
    }
  }
  async cleanDriveDuplicates() {
    if (this._isPageContext()) {
      return await this._delegateSyncToBackground("lumina_clean_drive_duplicates");
    }
    const token = await this.getToken(true);
    if (!token) return { success: false, error: "Not authenticated" };
    const allFiles = await this.listAppDataFiles(token);
    if (!Array.isArray(allFiles) || allFiles.length === 0) return { success: true, deletedCount: 0 };
    const fileMap = /* @__PURE__ */ new Map();
    for (const file of allFiles) {
      if (!fileMap.has(file.name)) {
        fileMap.set(file.name, []);
      }
      fileMap.get(file.name).push(file);
    }
    let deletedCount = 0;
    for (const [name, files] of fileMap.entries()) {
      if (files.length > 1) {
        files.sort((a, b) => new Date(b.modifiedTime || 0) - new Date(a.modifiedTime || 0));
        const toDelete = files.slice(1);
        for (const f of toDelete) {
          await this.deleteDriveFile(token, f.id);
          deletedCount++;
        }
      }
    }
    const uniqueBlobNames = Array.from(fileMap.keys()).filter((n) => n.endsWith(".bin"));
    await chrome.storage.local.set({ drive_uploaded_blobs: uniqueBlobNames });
    return { success: true, deletedCount };
  }
  async showDriveFiles() {
    const token = await this.getToken(true);
    if (!token) return [];
    const files = await this.listAppDataFiles(token);
    return files;
  }
  async cleanOrphanedDriveBlobs() {
    const token = await this.getToken(true);
    if (!token) return { success: false, error: "Not authenticated" };
    const allFiles = await this.listAppDataFiles(token);
    if (!Array.isArray(allFiles) || allFiles.length === 0) return { success: true, deletedCount: 0 };
    const activeAttachmentKeys = /* @__PURE__ */ new Set();
    if (typeof LuminaChatDB !== "undefined") {
      try {
        const sessions = await LuminaChatDB.getAllSessions(true).catch(() => ({}));
        for (const sid of Object.keys(sessions)) {
          const msgs = await LuminaChatDB.getMessages(sid).catch(() => []);
          for (const m of msgs) {
            if (Array.isArray(m.files)) {
              for (const f of m.files) {
                if (f && f.attachmentId) activeAttachmentKeys.add(String(f.attachmentId));
              }
            }
          }
        }
      } catch (e) {
      }
    }
    const activeTtsIds = /* @__PURE__ */ new Set();
    if (typeof TTSDB !== "undefined") {
      try {
        const recs = await TTSDB.getAllRecordings().catch(() => []);
        for (const r of recs) {
          if (r && r.id && !r.isDeleted) activeTtsIds.add(String(r.id));
        }
      } catch (e) {
      }
    }
    let deletedCount = 0;
    for (const file of allFiles) {
      const name = file.name;
      let isOrphan = false;
      if (name.startsWith("att_") && name.endsWith(".bin")) {
        const key = name.slice(4, -4);
        if (!activeAttachmentKeys.has(key)) isOrphan = true;
      } else if (name.startsWith("blob_att_")) {
        isOrphan = true;
        for (const key of activeAttachmentKeys) {
          if (name.includes(key)) {
            isOrphan = false;
            break;
          }
        }
      } else if (name.startsWith("tts_") && name.endsWith(".bin")) {
        const id = name.slice(4, -4);
        if (!activeTtsIds.has(id)) isOrphan = true;
      } else if (name.startsWith("blob_tts_")) {
        isOrphan = true;
        for (const id of activeTtsIds) {
          if (name.includes(id)) {
            isOrphan = false;
            break;
          }
        }
      }
      if (isOrphan) {
        await this.deleteDriveFile(token, file.id);
        deletedCount++;
      }
    }
    const remainingFiles = await this.listAppDataFiles(token);
    const uniqueBlobNames = (remainingFiles || []).map((f) => f.name).filter((n) => n.endsWith(".bin"));
    await chrome.storage.local.set({ drive_uploaded_blobs: uniqueBlobNames });
    return { success: true, deletedCount };
  }
  async downloadBackupFileToComputer() {
    const token = await this.getToken(true);
    if (!token) throw new Error("Not authenticated");
    const files = await this.listAppDataFiles(token);
    const remoteFile = files.find((f) => f.name === this.FILENAME);
    if (!remoteFile) throw new Error("lumina_backup.json not found on Google Drive");
    const data = await this.downloadBackup(token, remoteFile.id);
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lumina_backup_${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return data;
  }
  async syncData(isAuto = false) {
    if (isAuto) {
      return await this.pullFromCloud(false);
    } else {
      return await this.pushToCloud();
    }
  }
};
var LuminaSync2 = new SyncManager(LuminaAuth);
if (typeof window !== "undefined") {
  window.LuminaSync = LuminaSync2;
}

// src/background/sync_handlers.js
function initSyncHandlers() {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "lumina_drive_sync") {
      const isAuto = !!request.isAuto;
      const forcePush = !!request.forcePush;
      const forcePull = !!request.forcePull;
      try {
        chrome.runtime.sendMessage({ action: "lumina_sync_status", status: "syncing" }).catch(() => {
        });
      } catch (e) {
      }
      const syncPromise = forcePush ? LuminaSync2.pushToCloud() : forcePull || isAuto ? LuminaSync2.pullFromCloud(forcePull) : LuminaSync2.syncData(isAuto);
      syncPromise.then((result) => {
        globalThis._lastDriveSyncAt = Date.now();
        try {
          chrome.runtime.sendMessage({ action: "lumina_sync_status", status: "done", timestamp: Date.now() }).catch(() => {
          });
        } catch (e) {
        }
        sendResponse({ success: true, result });
      }).catch((err) => {
        try {
          chrome.runtime.sendMessage({ action: "lumina_sync_status", status: "failure" }).catch(() => {
          });
        } catch (e) {
        }
        sendResponse({ success: false, error: err.message });
      });
      return true;
    }
    if (request.action === "lumina_drive_sync_debounced") {
      LuminaSync2.triggerDebouncedSync(request.delayMs || 1e3);
      sendResponse({ success: true });
      return true;
    }
    if (request.action === "lumina_clean_drive_duplicates") {
      LuminaSync2.cleanDriveDuplicates().then((res) => sendResponse(res)).catch((err) => sendResponse({ success: false, error: err.message }));
      return true;
    }
  });
}

// src/background/chat_stream_service.js
var sessionPorts = /* @__PURE__ */ new Map();
var sessionControllers = /* @__PURE__ */ new Map();
function broadcastToSession(sessionId, message) {
  if (!sessionId) return;
  const ports = sessionPorts.get(sessionId);
  if (ports && ports.size > 0) {
    ports.forEach((port) => {
      try {
        port.postMessage(message);
      } catch (_) {
        ports.delete(port);
      }
    });
  }
}
async function incrementModelUsage(modelId) {
  if (!modelId) return;
  try {
    const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    const data = await chrome.storage.local.get(["dailyModelStats"]);
    let stats = data.dailyModelStats || { date: today, counts: {} };
    if (stats.date !== today) {
      stats.date = today;
      stats.counts = {};
    }
    if (!stats.counts[modelId]) {
      stats.counts[modelId] = 0;
    }
    stats.counts[modelId]++;
    await chrome.storage.local.set({
      dailyModelStats: stats,
      lastUsedModelId: modelId
    });
  } catch (e) {
    console.error("Error incrementing usage:", e);
  }
}
function normalizeOpenAICompatibleEndpoint(endpoint, targetPath) {
  if (typeof endpoint !== "string") return endpoint;
  let trimmed = endpoint.trim().replace(/\/+$/, "");
  if (!trimmed) return trimmed;
  if (trimmed.includes("api.groq.com") && !trimmed.includes("/openai")) {
    trimmed = trimmed.replace("/v1", "/openai/v1");
  }
  const knownSuffixes = ["/chat/completions", "/models", "/audio/transcriptions"];
  for (const suffix of knownSuffixes) {
    if (trimmed.endsWith(suffix)) {
      return trimmed.slice(0, -suffix.length) + targetPath;
    }
  }
  if (trimmed.endsWith("/v1") || trimmed.endsWith("/v1beta/openai") || trimmed.endsWith("/openai/v1")) {
    return `${trimmed}${targetPath}`;
  }
  return `${trimmed}${targetPath}`;
}
function optimizeContextString(text) {
  if (!text || typeof text !== "string") return "";
  return text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").replace(/--- \[Segment \d+\] ---/g, "").replace(/\[Context Source:.*?\]/g, "").replace(/URL: https?:\/\/\S+/g, "").trim();
}
function buildChatSystemInstruction(reasoningMode = false) {
  let userTimeZone = "UTC";
  try {
    userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch (e) {
  }
  const currentTime = (/* @__PURE__ */ new Date()).toLocaleString("en-US", { timeZone: userTimeZone });
  const currentYear = (/* @__PURE__ */ new Date()).getFullYear();
  let instruction = `You are a helpful and adaptive AI assistant. Note: current year is ${currentYear}.
[Language Rule]
- Respond in the language of the user's query. If the query consists of a single word, term, or phrase in English but the preceding conversation history is in another language, respond in that language.
[Response Quality & Formatting]
- Specifics Over Generalities: Replace vague claims with concrete details or numbers where applicable (e.g., write "150 min/week of moderate cardio reduces cardiovascular risk by 30-40%" instead of "Exercise has many benefits").
- Fluctuate Layout Naturally: Avoid rigid, repetitive formatting. Match your layout naturally to the content without forcing unnecessary walls of headers or bullet points for every turn.
- Define technical terms inline on first use if the query uses simple language (e.g., "lipolysis (breaking down fat)").
[Follow-Up Rules]
- Closed/Definitive tasks (facts, math, translations, code, JSON, direct questions): Generate a complete, self-contained response. DO NOT add trailing follow-up questions or menus at the end.
- Broad/Ambiguous/Advice queries: Answer directly first, then optionally ask a single relevant follow-up question to guide the user.
[Coding Guidelines & Code Block Gating]
- Write clean, clear, modular, and extremely easy-to-understand code.
- NEVER include comments inside the code block (no inline comments, no descriptive documentation comments, no commented-out code). Keep the code clean, self-explanatory, and completely comment-free.
- Use backticks (\`) or code blocks (\`\`\`) ONLY for actual programming source code (JavaScript, CSS, HTML, Python, etc.) or terminal/database commands.
- STRICTLY FORBIDDEN: Do NOT use backticks or code blocks for:
  - English/Vietnamese grammar formulas, templates, or sentence patterns (e.g. write **S + V + from A to B** instead of \`S + V + from A to B\`).
  - Regular prose, essays, quotes, vocabulary terms, or example sentences (e.g. write *The company's profits plummeted* instead of \`The company's profits plummeted\`).
  - Quotes or blockquotes (>): NEVER wrap quoted text, essay examples, or sentences inside backticks or code blocks. Use standard text, bold, or italics inside blockquotes.
  - Mathematical equations (use LaTeX instead).
[LaTeX Rules]
Use LaTeX ONLY for formal/complex math or science (equations, formulas, complex variables) where plain text is insufficient. Enclose with $inline$ or $$display$$. NEVER render LaTeX in a code block unless the user explicitly requests it.
Strictly Avoid LaTeX for: simple formatting (use Markdown instead), non-technical contexts and regular prose (resumes, letters, essays, cooking, weather, etc.), or simple units/numbers (render **180\xB0C** or **10%** as plain text, not LaTeX).
[Response Guiding Principles]
Provide clear, natural, and well-structured responses. Use formatting tools (headings, bullet points, bolding, tables) only when appropriate to enhance readability, without forcing a rigid structure or unnecessary length. Adapt your layout naturally to the context and style preferences.
[Diagram Syntax \u2014 Chart.js]
- A single response CAN contain multiple Chart.js charts if multiple aspects of the topic benefit from visual explanation.
- Use Chart.js JSON config (chartjs code blocks) for all statistical charts and data visualizations: bar charts, line charts, pie/doughnut charts, scatter plots, radar charts, etc.
- EVERY chart MUST ALWAYS have a clear, descriptive title to make it self-explanatory.
Chart.js Chart Rule:
- Format code blocks EXACTLY with \`chartjs\` language identifier.
- The content MUST be a valid JSON object following Chart.js v3 API structure.
- ALWAYS include a descriptive title in options.plugins.title.
- Use vibrant, beautiful color palettes for datasets. Suggested palette: ["#6366f1","#06b6d4","#10b981","#f59e0b","#ef4444","#8b5cf6","#ec4899"].
- Do NOT include any JavaScript functions (callbacks) \u2014 pure JSON only.
- Example (Bar Chart):
\`\`\`chartjs
{
  "type": "bar",
  "data": {
    "labels": ["Q1", "Q2", "Q3", "Q4"],
    "datasets": [
      {
        "label": "Revenue ($M)",
        "data": [12.5, 18.3, 15.7, 22.1],
        "backgroundColor": ["#6366f1","#06b6d4","#10b981","#f59e0b"]
      }
    ]
  },
  "options": {
    "plugins": {
      "title": { "display": true, "text": "Quarterly Revenue 2024" },
      "legend": { "display": true }
    },
    "scales": {
      "y": { "beginAtZero": true }
    }
  }
}
\`\`\`
- Example (Line Chart):
\`\`\`chartjs
{
  "type": "line",
  "data": {
    "labels": ["Jan","Feb","Mar","Apr","May","Jun"],
    "datasets": [
      {
        "label": "Users",
        "data": [1200, 1900, 1700, 2400, 2200, 3100],
        "borderColor": "#6366f1",
        "backgroundColor": "rgba(99,102,241,0.15)",
        "fill": true,
        "tension": 0.4
      }
    ]
  },
  "options": {
    "plugins": {
      "title": { "display": true, "text": "Monthly Active Users" }
    },
    "scales": {
      "y": { "beginAtZero": true }
    }
  }
}
\`\`\`

[YouTube]
\`![Title](youtube://id)\` or \`![Title](youtube://search?q=query_keywords)\`.
[Lumina Canvas (Document Workspace)]
The Lumina Canvas is a side-by-side workspace next to the conversation. Use it ONLY for long documents or full code files (HTML, JS, React, etc.) that the user wants to write, iterate on, or preview.
To interact with the Canvas, you MUST wrap your commands in the following XML tags:
1. Create Canvas Document:
<lumina-canvas-create name="Document Name" type="code/html">
...content here...
</lumina-canvas-create>
(Use type: "document" for text, or "code/javascript", "code/html", "code/react", "code/css", etc. for code files. React and HTML types can be previewed live).
2. Update Canvas Document:
<lumina-canvas-update name="Document Name">
<pattern>regex_pattern</pattern>
<replacement>replacement_text</replacement>
</lumina-canvas-update>
(Always write code updates using a single update with ".*" for the pattern to replace the entire content).
3. Comment Canvas Document:
<lumina-canvas-comment name="Document Name">
<pattern>regex_pattern</pattern>
<comment>suggestion</comment>
</lumina-canvas-comment>
[Context & Personalization Privacy]
- When using user context or preferences, blend them in seamlessly. NEVER preface responses with artificial meta-phrases like "Based on your info," "Given your profile," or "Since you mentioned."
- Treat user data as factual and invisible. Do not reference system tags/sources. Never infer or include sensitive personal details (health conditions, origin, religion, financial status, etc.) unless explicitly requested.`;
  return instruction;
}
function buildProofreadSystemPrompt(responseLanguage = "auto") {
  let languageInstruction = "Refine/translate ALL input into polished, native-level English fluency.";
  if (responseLanguage && responseLanguage !== "auto") {
    languageInstruction = `Refine/translate ALL input into polished, native-level ${responseLanguage} fluency.`;
  }
  return `[Role]: Elite professional editor.
[Task]: Refine text inside <text> into sophisticated, natural fluency.
[Rules]:
1. Output ONLY the refined text. No headers, chat, or explanations.
2. Maintain original meaning and formatting.
${languageInstruction}`;
}
function cleanThinkingBlocks(text) {
  if (!text || typeof text !== "string") return text || "";
  return text.replace(/<(think|thought|reasoning|details)>[\s\S]*?<\/(think|thought|reasoning|details)>/gi, "").replace(/^<(think|thought|reasoning|details)>[\s\S]*/gi, "").trim();
}
async function buildApiPayload(msgs, currentQ, sysPrompt, activeKey, params) {
  const { model, endpoint, providerType, temperature, topP, parsedCustomParams, normalizedThinkingLevel, isGemini25Model, reasoningMode, imageData, maxTokens = null, isStreaming = true, cachedContent = null } = params;
  const isGemini = providerType === "gemini" || typeof endpoint === "string" && endpoint.includes("generativelanguage.googleapis.com");
  if (isGemini) {
    const geminiContents = [];
    for (const msg of msgs) {
      const attachments = msg.files || msg.images;
      const role = msg.role === "model" || msg.role === "assistant" ? "model" : "user";
      const cleanText = cleanThinkingBlocks(msg.text || "");
      if (attachments && attachments.length > 0) {
        const parts = [];
        if (!cachedContent) {
          const processed = await processAttachmentsForGemini(attachments);
          parts.push(...processed.parts);
          if (processed.unsupported.length > 0) {
            parts.push({ text: "[Note] Skipped unsupported attachments: " + processed.unsupported.map((i) => i.name).join(", ") });
          }
        }
        if (cleanText) parts.push({ text: cleanText });
        if (parts.length === 0) parts.push({ text: "" });
        geminiContents.push({ role, parts });
      } else {
        geminiContents.push({ role, parts: [{ text: cleanText }] });
      }
    }
    if (imageData && imageData.length > 0) {
      const parts = [];
      if (!cachedContent) {
        const currentAttachments = Array.isArray(imageData) ? imageData : [imageData];
        const processed = await processAttachmentsForGemini(currentAttachments);
        parts.push(...processed.parts);
        if (processed.unsupported.length > 0) {
          parts.push({ text: "[Note] Skipped unsupported attachments: " + processed.unsupported.map((i) => i.name).join(", ") });
        }
      }
      if (currentQ) parts.push({ text: currentQ });
      if (parts.length === 0) parts.push({ text: "" });
      geminiContents.push({ role: "user", parts });
    } else {
      geminiContents.push({ role: "user", parts: [{ text: currentQ || "" }] });
    }
    const maxOutputTokensVal = Number.isFinite(maxTokens) && maxTokens > 0 ? parseInt(maxTokens, 10) : 8192;
    const generationConfig = {
      maxOutputTokens: maxOutputTokensVal,
      ...parsedCustomParams
    };
    const isGemini3 = /gemini-[3-9]/i.test(model);
    const isGemma = /gemma/i.test(model);
    if (!isGemini3) {
      generationConfig.temperature = temperature;
      generationConfig.topP = topP;
    }
    if (params.disableThinking) {
      delete generationConfig.thinkingConfig;
    } else {
      let level = normalizedThinkingLevel || "medium";
      if (isGemma) {
        const gemmaLevel = level === "high" || level === "medium" ? "high" : "minimal";
        generationConfig.thinkingConfig = {
          includeThoughts: true,
          thinkingLevel: gemmaLevel
        };
      } else if (isGemini3) {
        const validLevels = ["minimal", "low", "medium", "high"];
        const targetLevel = validLevels.includes(level) ? level : level === "none" ? "minimal" : "medium";
        generationConfig.thinkingConfig = {
          includeThoughts: true,
          thinkingLevel: targetLevel
        };
      } else {
        let budget = -1;
        if (level === "none" || level === "minimal") {
          budget = 0;
        } else if (level === "low") {
          budget = 1024;
        } else if (level === "medium") {
          budget = -1;
        } else if (level === "high") {
          budget = 4096;
        }
        generationConfig.thinkingConfig = {
          includeThoughts: budget > 0 || budget === -1,
          thinkingBudget: budget
        };
      }
    }
    const geminiBody = {
      contents: geminiContents,
      generationConfig,
      ...sysPrompt ? {
        system_instruction: {
          parts: [{ text: sysPrompt }]
        }
      } : {},
      ...cachedContent ? { cachedContent } : {}
    };
    const method = isStreaming ? "streamGenerateContent" : "generateContent";
    let baseEndpoint = endpoint.replace(/\/$/, "").replace(/\/openai\/chat\/completions$/, "").replace(/\/chat\/completions$/, "").replace(/\/openai$/, "").replace(/\/models$/, "");
    let urlModel = model;
    if (!urlModel.startsWith("models/")) {
      urlModel = "models/" + urlModel;
    }
    const url = `${baseEndpoint}/${urlModel}:${method}${isStreaming ? "?alt=sse" : ""}`;
    return { url, body: geminiBody };
  }
  const openaiMessages = [{ role: "system", content: sysPrompt }];
  if (typeof LuminaToken !== "undefined") {
    const sysTokens = LuminaToken.count(sysPrompt || "");
    const historyTokens = msgs.reduce((acc, m) => acc + LuminaToken.count(m.text || ""), 0);
    const inputTokens = LuminaToken.count(currentQ || "");
    let attachmentTokens = 0;
    const allAttachments = [...imageData || []];
    msgs.forEach((m) => {
      if (m.files || m.images) allAttachments.push(...m.files || m.images);
    });
    allAttachments.forEach((att) => {
      const mime = normalizeMimeType(att.mimeType || "");
      if (isTextAttachmentMime(mime)) {
        attachmentTokens += LuminaToken.count(decodeBase64Utf8(getBase64FromAttachment(att)));
      } else {
        attachmentTokens += 765;
      }
    });
  }
  for (const msg of msgs) {
    const attachments = msg.files || msg.images;
    const cleanText = cleanThinkingBlocks(msg.text || "");
    if (attachments && attachments.length > 0) {
      const parts = [];
      if (cleanText) parts.push({ type: "text", text: cleanText });
      const processed = await processAttachments(attachments);
      parts.push(...processed.parts);
      if (processed.unsupported.length > 0) {
        parts.push({ type: "text", text: `[Note] Skipped unsupported attachments: ${processed.unsupported.map((i) => i.name).join(", ")}` });
      }
      openaiMessages.push({ role: msg.role === "model" || msg.role === "assistant" ? "assistant" : "user", content: parts });
    } else {
      openaiMessages.push({ role: msg.role === "model" || msg.role === "assistant" ? "assistant" : "user", content: cleanText });
    }
  }
  if (imageData && imageData.length > 0) {
    const parts = [{ type: "text", text: currentQ }];
    const currentAttachments = Array.isArray(imageData) ? imageData : [imageData];
    const processed = await processAttachments(currentAttachments);
    parts.push(...processed.parts);
    openaiMessages.push({ role: "user", content: parts });
  } else {
    openaiMessages.push({ role: "user", content: currentQ });
  }
  const openaiBody = {
    model,
    messages: openaiMessages,
    temperature,
    top_p: topP,
    stream: isStreaming,
    ...isStreaming ? { stream_options: { include_usage: true } } : {},
    ...parsedCustomParams
  };
  const hasCustomTokenLimit = Object.prototype.hasOwnProperty.call(openaiBody, "max_tokens") || Object.prototype.hasOwnProperty.call(openaiBody, "max_completion_tokens") || Object.prototype.hasOwnProperty.call(openaiBody, "max_output_tokens");
  if (!hasCustomTokenLimit) {
    if (Number.isFinite(maxTokens) && maxTokens > 0) {
      openaiBody.max_tokens = maxTokens;
    } else {
      openaiBody.max_tokens = 8192;
    }
  }
  if (normalizedThinkingLevel) {
    const effortMap = { none: "none", minimal: "low", low: "low", medium: "medium", high: "high" };
    if (effortMap[normalizedThinkingLevel]) {
      openaiBody.reasoning_effort = effortMap[normalizedThinkingLevel];
    }
  }
  return { url: normalizeOpenAICompatibleEndpoint(endpoint, "/chat/completions"), body: openaiBody };
}
async function getModelChain(type = "text", preferredModel = null) {
  const data = await chrome.storage.local.get(["models", "providers", "provider", "model", "lastUsedModel", "dictProvider", "dictModel"]);
  let chain = [];
  const storedModels = data.models || [];
  if (storedModels.length > 0) {
    chain = [...storedModels];
  } else if (type === "dictionary" && data.dictProvider && data.dictModel) {
    chain = [{ providerId: data.dictProvider, model: data.dictModel }];
  } else {
    chain = [{ providerId: data.provider, model: data.model }];
  }
  const activeModel = preferredModel || (type === "text" ? data.lastUsedModel : null);
  if (activeModel && activeModel.model) {
    let actPId = activeModel.providerId;
    const actModel = activeModel.model;
    if (!actPId || !data.providers?.some((p) => p.id === actPId)) {
      const matchingChainItem = storedModels.find((item) => item.model === actModel);
      if (matchingChainItem) {
        actPId = matchingChainItem.providerId;
      } else {
        const matchingProvider = data.providers?.find((p) => p.defaultModel === actModel);
        if (matchingProvider) {
          actPId = matchingProvider.id;
        }
      }
    }
    const idx = chain.findIndex((item) => item.providerId === actPId && item.model === actModel);
    if (idx > 0) {
      const preferred = chain.splice(idx, 1)[0];
      chain.unshift(preferred);
    } else if (idx === -1 && actModel) {
      const matchingChainItem = data.modelChains?.text?.find((item) => item.model === actModel);
      chain.unshift({
        providerId: actPId || "",
        model: actModel,
        maxTokens: activeModel.maxTokens || matchingChainItem?.maxTokens || 8192
      });
    }
  }
  const hydratedChain = chain.map((config) => {
    const provider = data.providers?.find((p) => p.id === config.providerId);
    if (!provider) return null;
    return {
      ...config,
      providerType: provider.type,
      apiKey: provider.apiKey,
      endpoint: provider.endpoint,
      defaultModel: provider.defaultModel
    };
  }).filter((item) => item !== null);
  return hydratedChain;
}
function getKeysArray2(keyStr) {
  if (!keyStr) return [];
  return keyStr.split(",").map((k) => k.trim()).filter((k) => k.length > 0);
}
function getTodayString2() {
  const now = /* @__PURE__ */ new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}
async function fetchWithRotation(keys, requestFn, options = {}) {
  if (!keys || keys.length === 0) {
    return requestFn("");
  }
  const groupKey = "rot_" + keys.join(",").substring(0, 32).replace(/[^a-zA-Z0-9]/g, "");
  const today = getTodayString2();
  if (typeof options.keyIndex === "number" && options.keyIndex >= 0 && options.keyIndex < keys.length) {
    return await requestFn(keys[options.keyIndex]);
  }
  let activeIndex = 0;
  try {
    const data = await chrome.storage.local.get([groupKey]);
    const state = data[groupKey];
    if (state && state.date === today) activeIndex = state.index;
  } catch (e) {
  }
  const isRateLimitOrTooLarge = async (response) => {
    if (response.status === 429 || response.status === 503) return true;
    if (response.status === 400 || response.status === 413) {
      try {
        const clone = response.clone();
        const text = await clone.text();
        if (/Request too large|tokens per minute|TPM|context_length_exceeded/i.test(text)) {
          return true;
        }
      } catch (e) {
      }
    }
    return false;
  };
  for (let attempts = 0; attempts < keys.length; attempts++) {
    const currentIndex = (activeIndex + attempts) % keys.length;
    const currentKey = keys[currentIndex];
    try {
      const response = await requestFn(currentKey);
      if (await isRateLimitOrTooLarge(response)) {
        console.warn(`[Lumina] Key ${currentIndex} hit rate limit or request-too-large. Rotating to next key.`);
      } else {
        chrome.storage.local.set({
          [groupKey]: { index: currentIndex, date: today }
        });
        return response;
      }
    } catch (err) {
      const errName = err?.name || "";
      const errMsg = err?.message || "";
      if (errName === "AbortError" || errMsg.includes("aborted") || errMsg === "signal is aborted without reason") {
        throw err;
      }
      const isOffline = typeof navigator !== "undefined" && navigator.onLine === false;
      const isFetchFailed = errName === "TypeError" || errMsg.includes("Failed to fetch") || errMsg.includes("fetch failed") || errMsg.includes("network") || errMsg.includes("net::ERR");
      if (isOffline || isFetchFailed) {
        const netErr = new Error("Network error: Failed to connect to the AI provider. Please check your internet connection.");
        netErr.name = "NetworkError";
        throw netErr;
      }
      console.error(`[Lumina] Request failed with key ${currentIndex}:`, err);
    }
  }
  throw new Error("All API keys failed or were rate limited in this cycle.");
}
var CACHE_EXPIRATION_MS = 1 * 24 * 60 * 60 * 1e3;
async function executeChatRequest(config, messages, initialContext, question, port, imageData = null, isSpotlight = false, globalSettings = {}, requestOptions = {}, action = "chat_stream", systemOverride = null, sessionId = null) {
  const { model, providerType: currentProvider, endpoint, apiKey, defaultModel } = config;
  const streamLogPrefix = `[Lumina BG][${action}]`;
  const advancedParamsByModel = globalSettings.advancedParamsByModel || {};
  const providerId = config.providerId;
  const compositeKey = providerId ? `${providerId}:${model}` : model;
  const modelParams = providerId && advancedParamsByModel[compositeKey] ? advancedParamsByModel[compositeKey] : !providerId ? advancedParamsByModel[model] || {} : {};
  const temperature = requestOptions.temperature ?? modelParams.temperature ?? 1;
  const topP = modelParams.topP ?? 1;
  const maxTokens = requestOptions.maxTokens ?? config.maxTokens ?? null;
  const thinkingLevel = requestOptions.thinkingLevel ?? modelParams.thinkingLevel ?? null;
  const customParams = modelParams.customParams || {};
  const responseLanguage = globalSettings.responseLanguage;
  let parsedCustomParams = {};
  if (customParams) {
    if (typeof customParams === "object") {
      parsedCustomParams = customParams;
    } else if (typeof customParams === "string") {
      try {
        parsedCustomParams = JSON.parse(customParams);
      } catch (e) {
      }
    }
  }
  const hasFiles = imageData && (Array.isArray(imageData) && imageData.length > 0);
  const normalizedModelName = (model || "").toLowerCase();
  const isGemini25Model = /gemini-2\.5/i.test(normalizedModelName);
  const normalizedThinkingLevel = typeof thinkingLevel === "string" ? thinkingLevel.trim().toLowerCase() : "";
  if (model) {
    incrementModelUsage(model);
  }
  if (!apiKey && !endpoint.includes("localhost") && !endpoint.includes("127.0.0.1")) {
    throw new Error(`No API Key for provider type: ${currentProvider}`);
  }
  const keys = getKeysArray2(apiKey);
  const reasoningMode = !!globalSettings.reasoningMode;
  let systemInstruction = systemOverride || buildChatSystemInstruction(reasoningMode);
  if (action === "proofread") {
    systemInstruction = systemOverride || buildProofreadSystemPrompt(responseLanguage);
  }
  try {
    if (!systemOverride) {
      const userMemoryAddition = await UserMemory.getSystemPromptAddition();
      if (userMemoryAddition) {
        systemInstruction += userMemoryAddition;
      }
    }
  } catch (e) {
    console.error("[Lumina] Failed to load user memory:", e);
  }
  let currentMessages = [...messages];
  let augmentedQuestion = question;
  if (action === "proofread") {
    if (!requestOptions.isRegenerate && !requestOptions.isRecheck) {
      currentMessages = [];
    }
    if (!systemOverride) {
      augmentedQuestion = `Correct/refine this text:
<text>${question}</text>`;
    }
  }
  if (initialContext && initialContext.trim().length > 0) {
    let processedContext = optimizeContextString(initialContext);
    augmentedQuestion = `### User Instruction:
${augmentedQuestion}

---

### Webpage Source Content:
(Note: This content is provided solely for factual lookup. Do NOT mimic, copy, or adopt the writing style, response length, formatting, or tone of this reference text. Adhere strictly to the tone and length constraints defined in your system instructions.)

${processedContext}`;
  }
  const payloadParams = {
    model,
    endpoint,
    providerType: currentProvider,
    temperature,
    topP,
    maxTokens,
    parsedCustomParams,
    normalizedThinkingLevel,
    isGemini25Model,
    reasoningMode,
    imageData,
    cachedContent: null
  };
  let controller = null;
  if (sessionId) {
    if (sessionControllers.has(sessionId)) {
      try {
        console.log(`[Lumina BG] Aborting session ${sessionId} due to duplicate/re-submission`);
        sessionControllers.get(sessionId).abort();
      } catch (e) {
      }
    }
    controller = new AbortController();
    sessionControllers.set(sessionId, controller);
  }
  let requestedUrl = endpoint;
  let response;
  for (let retry = 0; retry < 4; retry++) {
    try {
      response = await fetchWithRotation(keys, async (key) => {
        const payload = await buildApiPayload(currentMessages, augmentedQuestion, systemInstruction, key, payloadParams);
        if (payload && payload.body) {
          const body = payload.body;
          if (Number.isFinite(payloadParams.maxTokens) && payloadParams.maxTokens > 0) {
            if (body.max_tokens !== void 0) body.max_tokens = payloadParams.maxTokens;
            if (body.max_completion_tokens !== void 0) body.max_completion_tokens = payloadParams.maxTokens;
            if (body.max_output_tokens !== void 0) body.max_output_tokens = payloadParams.maxTokens;
          }
        }
        requestedUrl = payload.url;
        const headers = { "Content-Type": "application/json" };
        if (key) {
          const isGemini = currentProvider === "gemini" || typeof endpoint === "string" && endpoint.includes("generativelanguage.googleapis.com");
          if (isGemini) {
            headers["x-goog-api-key"] = key;
          } else {
            headers["Authorization"] = `Bearer ${key}`;
          }
        }
        return fetch(payload.url, {
          method: "POST",
          headers,
          body: JSON.stringify(payload.body),
          signal: controller ? controller.signal : null
        });
      }, requestOptions);
      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch (e) {
          errorData = { raw: errorText };
        }
        console.error("[Lumina] API Error:", {
          endpoint: requestedUrl,
          status: response.status,
          statusText: response.statusText,
          errorData
        });
        const errMsg = typeof errorData?.error?.message === "string" && errorData.error.message.trim() || typeof errorData?.message === "string" && errorData.message.trim() || typeof errorText === "string" && errorText.trim() || "";
        const fallbackMsg = `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""} from ${requestedUrl}${errorText ? `: ${errorText.slice(0, 300)}` : ""}`;
        const isTpmRateLimit = response.status === 429 || /Request too large|tokens per minute|TPM|rate_limit_exceeded|context_length_exceeded/i.test(errMsg);
        if (isTpmRateLimit && retry < 3) {
          const limitMatch = errMsg.match(/Limit\s+(\d+)/i);
          const requestedMatch = errMsg.match(/Requested\s+(\d+)/i);
          let diff = 1e3;
          if (limitMatch && requestedMatch) {
            const limit = parseInt(limitMatch[1], 10);
            const requested = parseInt(requestedMatch[1], 10);
            if (requested > limit) {
              diff = requested - limit + 150;
            }
          }
          const currentMaxTokens = payloadParams.maxTokens || 4096;
          let newMaxTokens = currentMaxTokens;
          if (diff > 0) {
            const maxReducible = currentMaxTokens - 1024;
            if (maxReducible > 0) {
              const reduction = Math.min(diff, maxReducible);
              newMaxTokens = currentMaxTokens - reduction;
              diff -= reduction;
              payloadParams.maxTokens = newMaxTokens;
              console.warn(`[Lumina] Dynamic token reduction: Changing max_tokens from ${currentMaxTokens} to ${newMaxTokens}. Remaining diff: ${diff}`);
            }
          }
          if (diff > 0 && currentMessages.length > 2) {
            let tokensRemoved = 0;
            let pairsRemoved = 0;
            while (diff > tokensRemoved && currentMessages.length > 2) {
              const msg1 = currentMessages[0];
              const msg2 = currentMessages[1];
              const t1 = msg1 ? LuminaToken.count(JSON.stringify(msg1)) : 0;
              const t2 = msg2 ? LuminaToken.count(JSON.stringify(msg2)) : 0;
              tokensRemoved += t1 + t2;
              currentMessages.splice(0, 2);
              pairsRemoved++;
            }
            console.warn(`[Lumina] Prompt too large. Removed ${pairsRemoved} message pair(s) to free up ~${tokensRemoved} tokens. Remaining diff: ${diff - tokensRemoved}`);
          }
          continue;
        }
        if (response.status === 429 || /Request too large|tokens per minute|TPM|context_length_exceeded/i.test(errMsg)) {
          throw new Error("RATE_LIMIT_EXHAUSTED");
        }
        throw new Error(errMsg || fallbackMsg || "Failed to fetch from AI provider");
      }
      break;
    } catch (e) {
      if (retry < 3 && (e.message === "RATE_LIMIT_EXHAUSTED" || e.message === "Failed to fetch")) {
        if (currentMessages.length > 2) {
          console.warn(`[Lumina] Request failed. Retrying with cropped history...`);
          currentMessages.splice(0, 2);
          continue;
        }
      }
      throw e;
    }
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let emittedChunks = 0;
  let isInReasoning = false;
  const collectDeltasFromPayload = (payloadStr, textDeltas) => {
    if (!payloadStr) return false;
    const trimmedPayload = payloadStr.trim();
    if (!trimmedPayload) return false;
    if (trimmedPayload === "[DONE]" || trimmedPayload.includes("[DONE]")) {
      return true;
    }
    try {
      const parsed = JSON.parse(trimmedPayload);
      const choice = parsed.choices?.[0] || parsed.candidates?.[0] || {};
      const delta = choice.delta || {};
      let content = "";
      let reasoning = "";
      if (choice.content?.parts) {
        for (const part of choice.content.parts) {
          if (part.thought === true) {
            reasoning += part.text || "";
          } else {
            content += part.text || "";
          }
        }
      } else {
        content = delta.content || "";
        if (Array.isArray(content)) {
          content = content.map((part) => {
            if (typeof part === "string") return part;
            if (part && typeof part.text === "string") return part.text;
            if (part && typeof part.content === "string") return part.content;
            return "";
          }).join("");
        }
        if (!content && typeof choice.message?.content === "string") {
          content = choice.message.content;
        }
        reasoning = delta.reasoning || delta.reasoning_content || delta.reasoningContent || "";
        if (Array.isArray(reasoning)) {
          reasoning = reasoning.map((part) => {
            if (typeof part === "string") return part;
            if (part && typeof part.text === "string") return part.text;
            if (part && typeof part.content === "string") return part.content;
            return "";
          }).join("");
        }
      }
      if (typeof reasoning === "string" && reasoning.length > 0) {
        if (!isInReasoning) {
          textDeltas.push("<think>");
          isInReasoning = true;
        }
        textDeltas.push(reasoning);
      }
      if (typeof content === "string" && content.length > 0) {
        if (isInReasoning) {
          textDeltas.push("</think>");
          isInReasoning = false;
        }
        textDeltas.push(content);
      }
      return true;
    } catch (e) {
      return false;
    }
  };
  const processSSEEvent = (rawEvent, textDeltas) => {
    if (!rawEvent) return;
    const lines = rawEvent.split(/\r?\n/);
    const dataLines = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(":") || trimmed.startsWith("event:")) continue;
      if (!trimmed.startsWith("data:")) continue;
      dataLines.push(trimmed.slice(5).trimStart());
    }
    if (dataLines.length === 0) return;
    const combinedPayload = dataLines.join("\n").trim();
    const parsedCombined = collectDeltasFromPayload(combinedPayload, textDeltas);
    if (!parsedCombined && dataLines.length > 1) {
      dataLines.forEach((payloadLine) => {
        collectDeltasFromPayload(payloadLine, textDeltas);
      });
    }
  };
  const emitChunk = (text) => {
    if (text.length > 0) {
      emittedChunks += 1;
      const chunkMsg = { action: "chunk", chunk: text, sessionId };
      if (sessionId) broadcastToSession(sessionId, chunkMsg);
      else port.postMessage(chunkMsg);
    }
  };
  let nonSseBuffer = "";
  const detectAndExtractJsonError = (str) => {
    if (!str || typeof str !== "string") return null;
    const trimmed = str.trim();
    if (!trimmed) return null;
    if (trimmed.includes('"error"') && (trimmed.includes("{") || trimmed.startsWith("{"))) {
      const firstBrace = trimmed.indexOf("{");
      const lastBrace = trimmed.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        const potentialJson = trimmed.slice(firstBrace, lastBrace + 1);
        try {
          const parsed = JSON.parse(potentialJson);
          if (parsed && parsed.error) {
            return parsed.error.message || parsed.error.status || "AI Service Error";
          }
        } catch (e) {
          const msgMatch = trimmed.match(/"message"\s*:\s*"([^"]+)"/);
          if (msgMatch && msgMatch[1]) {
            return msgMatch[1];
          }
        }
      }
    }
    return null;
  };
  let keepAliveInterval = setInterval(() => {
    try {
      chrome.runtime.getPlatformInfo(() => {
      });
    } catch (e) {
      console.error("[Lumina] Keep-alive error:", e);
    }
  }, 5e3);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        const flushChunk = decoder.decode();
        if (flushChunk) {
          buffer += flushChunk;
        }
        const tailDeltas = [];
        if (buffer && buffer.length > 0) {
          const lines2 = buffer.split("\n");
          for (const line of lines2) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith(":") || trimmed.startsWith("event:")) continue;
            if (trimmed.startsWith("data:")) {
              processSSEEvent(line, tailDeltas);
            } else {
              nonSseBuffer += (nonSseBuffer ? "\n" : "") + line;
            }
          }
        }
        const errorMsg = detectAndExtractJsonError(nonSseBuffer) || detectAndExtractJsonError(buffer);
        if (errorMsg) {
          throw new Error(errorMsg);
        }
        for (const text of tailDeltas) {
          emitChunk(text);
        }
        break;
      }
      const chunk = decoder.decode(value, { stream: true });
      const textDeltas = [];
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(":") || trimmed.startsWith("event:")) continue;
        if (trimmed.startsWith("data:")) {
          processSSEEvent(line, textDeltas);
        } else {
          nonSseBuffer += (nonSseBuffer ? "\n" : "") + line;
          const errorMsg = detectAndExtractJsonError(nonSseBuffer);
          if (errorMsg) {
            throw new Error(errorMsg);
          }
        }
      }
      for (const text of textDeltas) {
        emitChunk(text);
      }
    }
  } finally {
    clearInterval(keepAliveInterval);
  }
  if (isInReasoning) {
    const thinkEndMsg = { action: "chunk", chunk: "</think>", sessionId };
    if (sessionId) broadcastToSession(sessionId, thinkEndMsg);
    else port.postMessage(thinkEndMsg);
    isInReasoning = false;
  }
}
async function handleChatStream(messages, initialContext, question, port, imageData = null, isSpotlight = false, requestOptions = {}, hasTranscriptForVideoId = null, action = "chat_stream", systemOverride = null, sessionId = null) {
  try {
    try {
      let activeUrl = port?.sender?.tab?.url;
      let activeTabId = port?.sender?.tab?.id;
      if (!activeUrl) {
        const queryOptions = isSpotlight ? { active: true } : { active: true, currentWindow: true };
        const tabs = await chrome.tabs.query(queryOptions);
        if (tabs && tabs.length > 0) {
          activeUrl = tabs[0].url;
          activeTabId = tabs[0].id;
          if (isSpotlight && activeUrl && activeUrl.includes(chrome.runtime.id)) {
            const allActive = await chrome.tabs.query({ active: true });
            const realTab = allActive.find((t) => t.url && !t.url.includes(chrome.runtime.id));
            if (realTab) {
              activeUrl = realTab.url;
              activeTabId = realTab.id;
            }
          }
        }
      }
    } catch (e) {
      console.warn("[Lumina] Optional context extraction failed:", e);
    }
    const globalSettings = await chrome.storage.local.get(["responseLanguage", "advancedParamsByModel"]);
    let chain = await getModelChain("text", requestOptions.tabModel);
    const cleanMessages = (messages || []).map((m) => {
      if (typeof m.content === "string") {
        let cleaned = m.content.replace(/(image-search:\/\/[^)#\s]+)#[^)\s]+/g, "$1");
        return { ...m, content: cleaned.trim() };
      }
      return m;
    });
    if (!chain || chain.length === 0) {
      const errorMsg = { error: "No valid AI models configured. Please check Options." };
      if (sessionId) broadcastToSession(sessionId, errorMsg);
      else port.postMessage(errorMsg);
      return;
    }
    for (let i = 0; i < chain.length; i++) {
      const config = chain[i];
      try {
        const isLast = i === chain.length - 1;
        await executeChatRequest(config, cleanMessages, initialContext, question, port, imageData, isSpotlight, globalSettings, requestOptions, action, systemOverride, sessionId);
        return;
      } catch (e) {
        if (e.name === "AbortError" || e.message?.includes("aborted") || e.message === "signal is aborted without reason") {
          console.log(`[Lumina] Request aborted by user at index ${i} (${config.model})`);
          return;
        }
        if (e.message === "RATE_LIMIT_EXHAUSTED") {
          console.warn(`[Lumina] Model ${config.model} hit RATE LIMIT. Falling back to next...`);
          if (i < chain.length - 1) {
            try {
              const statusMsg = {
                action: "status_update",
                text: `Rate limit hit on ${config.model}. Switching to backup model...`,
                sessionId
              };
              if (sessionId) broadcastToSession(sessionId, statusMsg);
              else port.postMessage(statusMsg);
            } catch (err) {
            }
            continue;
          }
        }
        console.error(`[Lumina] Chat Chain failed at index ${i} (${config.model}):`, e);
        const errorMsg = { error: e.message || "AI Request Failed" };
        if (sessionId) broadcastToSession(sessionId, errorMsg);
        else port.postMessage(errorMsg);
        return;
      }
    }
  } catch (err) {
    console.error("[Lumina] Fatal Chat Error:", err);
    const errorMsg = { error: err.message };
    if (sessionId) broadcastToSession(sessionId, errorMsg);
    else port.postMessage(errorMsg);
  }
}
function initChatStreamService() {
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name === "lumina-chat-stream") {
      const registeredSessions = /* @__PURE__ */ new Set();
      port.onDisconnect.addListener(() => {
        for (const sid of registeredSessions) {
          if (sessionPorts.has(sid)) {
            sessionPorts.get(sid).delete(port);
            if (sessionPorts.get(sid).size === 0) {
              sessionPorts.delete(sid);
            }
          }
        }
      });
      port.onMessage.addListener(async (msg) => {
        if (msg.action === "ping") {
          try {
            chrome.runtime.getPlatformInfo(() => {
            });
          } catch (e) {
          }
          return;
        }
        if (msg.action === "register_sessions" && Array.isArray(msg.sessionIds)) {
          msg.sessionIds.forEach((sid) => {
            registeredSessions.add(sid);
            if (!sessionPorts.has(sid)) sessionPorts.set(sid, /* @__PURE__ */ new Set());
            sessionPorts.get(sid).add(port);
          });
          return;
        }
        if (msg.action === "stop_chat" && msg.sessionId) {
          const controller = sessionControllers.get(msg.sessionId);
          if (controller) {
            console.log(`[Lumina BG] Aborting session ${msg.sessionId} due to stop_chat message`);
            controller.abort();
            sessionControllers.delete(msg.sessionId);
          }
          broadcastToSession(msg.sessionId, { action: "done", sessionId: msg.sessionId });
          return;
        }
        if (msg.sessionId && !registeredSessions.has(msg.sessionId)) {
          registeredSessions.add(msg.sessionId);
          if (!sessionPorts.has(msg.sessionId)) sessionPorts.set(msg.sessionId, /* @__PURE__ */ new Set());
          sessionPorts.get(msg.sessionId).add(port);
        }
        if (msg.action === "chat_stream" || msg.action === "proofread" || msg.action === "dict_stream") {
          try {
            let question = msg.question;
            let initialContext = msg.initialContext;
            let systemMsg = null;
            if (msg.action === "dict_stream" && msg.word) {
              question = `Dictionary entry for: ${msg.word}`;
              systemMsg = `You are a professional lexicographer. Provide a concise dictionary entry for the word: "${msg.word}".
                            Use the structure of Cambridge/Oxford dictionaries but focus on SIMPLICITY and BREVITY.
                            Format your response in MARKDOWN with:
                            - **Word** in large bold.
                            - *UK /.../* and *US /.../* for phonetics.
                            - __[Part of Speech]__ (e.g. __[noun]__).
                            - Clear meanings: ONE short, easy-to-understand sentence max.
                            - Vietnamese translations in parentheses.
                            - 1-2 example sentences in italics.
                            Avoid long technical explanations. Be very concise.`;
            }
            const finalSystemOverride = msg.options && msg.options.systemOverride || msg.systemOverride || systemMsg;
            await handleChatStream(
              msg.messages,
              initialContext,
              question,
              port,
              msg.imageData,
              msg.isSpotlight || false,
              msg.requestOptions || {},
              msg.hasTranscriptForVideoId || null,
              msg.options && msg.options.mode || msg.action,
              finalSystemOverride,
              msg.sessionId
            );
          } catch (e) {
            console.error("[Lumina BG][stream] request error", {
              action: msg.action,
              error: e?.message || String(e)
            });
            port.postMessage({ action: "chunk", chunk: `*Error: ${e.message}*` });
          } finally {
            const doneMsg = { action: "done", sessionId: msg.sessionId };
            if (msg.sessionId) broadcastToSession(msg.sessionId, doneMsg);
            else port.postMessage(doneMsg);
          }
        }
      });
    }
  });
}

// src/background/index.js
initStorageCleanup();
initSidePanelManager();
initHighlightHandlers();
initSyncHandlers();
initChatStreamService();
export {
  broadcastToSession,
  detectMediaType,
  ensureSidePanelOpen,
  fetchAudio,
  getAmericanSpelling,
  getLemma,
  initChatStreamService,
  initHighlightHandlers,
  initSidePanelManager,
  initStorageCleanup,
  initSyncHandlers,
  processAttachments,
  processAttachmentsForGemini,
  readOpfsFileAsBase64,
  stopGoogleAudioOffscreen,
  toggleSidePanel
};
