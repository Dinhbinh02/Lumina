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
var sessionPorts = /* @__PURE__ */ new Map();
function broadcastToSession(sessionId, message) {
  if (!sessionId) return;
  const ports = sessionPorts.get(sessionId);
  if (!ports) return;
  for (const port of ports) {
    try {
      port.postMessage(message);
    } catch (e) {
      console.warn("[Lumina BG] Failed to broadcast to session port:", e);
      ports.delete(port);
    }
  }
}
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
var LuminaAttachmentDB = {
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
        return await LuminaAttachmentDB.dataURLtoBlobAsync(base64) || base64;
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
                    return await LuminaAttachmentDB.blobToDataURL(item);
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
  globalThis.LuminaAttachmentDB = LuminaAttachmentDB;
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
      const blob = await LuminaAttachmentDB.get(key);
      if (blob) {
        const dataUrl = await LuminaAttachmentDB.blobToDataURL(blob);
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
function normalizeMimeType(mimeType) {
  const mt = String(mimeType || "").toLowerCase().trim();
  return MIME_ALIASES[mt] || mt;
}
function isSupportedAttachmentMime(mimeType) {
  const mt = normalizeMimeType(mimeType);
  return !!mt && SUPPORTED_MIME_TYPES.has(mt);
}
function isTextAttachmentMime(mimeType) {
  const mt = normalizeMimeType(mimeType);
  return mt.startsWith("text/") || mt === "application/json" || mt === "application/xml";
}
function getBase64FromAttachment(item) {
  if (!item || typeof item !== "object") return "";
  if (item.data) return item.data;
  if (item.dataUrl) {
    const matches = item.dataUrl.match(/^data:([^;]+);base64,(.+)$/i);
    if (matches) return matches[2];
  }
  return "";
}
function decodeBase64Utf8(base64) {
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
        const decoded = matches ? decodeBase64Utf8(matches[2]) : "";
        if (decoded) parts.push({ type: "text", text: `[Attached text file]
${decoded}` });
      } else if (item.startsWith("data:")) {
        const matches = item.match(/^data:([^;]+);base64,(.+)$/i);
        if (matches) {
          const mime = normalizeMimeType(matches[1]);
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
      const mimeType = normalizeMimeType(item.mimeType || "");
      const itemName = item.name || "Unnamed file";
      if (mimeType && !isSupportedAttachmentMime(mimeType)) {
        unsupported.push({ name: itemName, mimeType });
        continue;
      }
      if (isTextAttachmentMime(mimeType)) {
        const textContent = decodeBase64Utf8(getBase64FromAttachment(item));
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
        const decoded = matches ? decodeBase64Utf8(matches[2]) : "";
        if (decoded) parts.push({ text: `[Attached text file]
${decoded}` });
      } else if (item.startsWith("data:")) {
        const matches = item.match(/^data:([^;]+);base64,(.+)$/i);
        if (matches) {
          const mime = normalizeMimeType(matches[1]);
          unsupported.push({ name: "Inline file", mimeType: mime });
        }
      }
    } else if (typeof item === "object") {
      const mimeType = normalizeMimeType(item.mimeType || "");
      const itemName = item.name || "Unnamed file";
      if (mimeType && !isSupportedAttachmentMime(mimeType)) {
        unsupported.push({ name: itemName, mimeType });
        continue;
      }
      if (isTextAttachmentMime(mimeType)) {
        const textContent = decodeBase64Utf8(getBase64FromAttachment(item));
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
var LuminaAnnotationDB = {
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
var LuminaHighlightDB = LuminaAnnotationDB;
if (typeof globalThis !== "undefined") {
  globalThis.LuminaAnnotationDB = LuminaAnnotationDB;
  globalThis.LuminaHighlightDB = LuminaHighlightDB;
}

// src/background/highlight_handlers.js
function initHighlightHandlers() {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "load_highlights") {
      LuminaAnnotationDB.get(request.url).then((highlights) => {
        sendResponse({ success: true, highlights: highlights || [] });
      }).catch((err) => {
        console.error("[Lumina BG] load_highlights error:", err);
        sendResponse({ success: false, error: err.message });
      });
      return true;
    }
    if (request.action === "save_highlight") {
      LuminaAnnotationDB.get(request.url).then(async (highlights) => {
        const list = highlights || [];
        list.push(request.highlight);
        await LuminaAnnotationDB.put(request.url, list);
        sendResponse({ success: true });
      }).catch((err) => {
        console.error("[Lumina BG] save_highlight error:", err);
        sendResponse({ success: false, error: err.message });
      });
      return true;
    }
    if (request.action === "undo_last_highlight") {
      LuminaAnnotationDB.get(request.url).then(async (highlights) => {
        const list = highlights || [];
        if (list.length === 0) {
          sendResponse({ success: true, lastHighlight: null });
          return;
        }
        const lastHighlight = list.pop();
        await LuminaAnnotationDB.put(request.url, list);
        sendResponse({ success: true, lastHighlight });
      }).catch((err) => {
        console.error("[Lumina BG] undo_last_highlight error:", err);
        sendResponse({ success: false, error: err.message });
      });
      return true;
    }
    if (request.action === "remove_highlights") {
      LuminaAnnotationDB.get(request.url).then(async (highlights) => {
        const list = highlights || [];
        const idsStr = request.ids.map((id) => id.toString());
        const filtered = list.filter((h) => !idsStr.includes(h[0].toString()));
        await LuminaAnnotationDB.put(request.url, filtered);
        sendResponse({ success: true });
      }).catch((err) => {
        console.error("[Lumina BG] remove_highlights error:", err);
        sendResponse({ success: false, error: err.message });
      });
      return true;
    }
    if (request.action === "update_highlight_color") {
      LuminaAnnotationDB.get(request.url).then(async (highlights) => {
        const list = highlights || [];
        const highlight = list.find((h) => h[0].toString() === request.id.toString());
        if (highlight) {
          highlight[1] = request.color;
          await LuminaAnnotationDB.put(request.url, list);
        }
        sendResponse({ success: true });
      }).catch((err) => {
        console.error("[Lumina BG] update_highlight_color error:", err);
        sendResponse({ success: false, error: err.message });
      });
      return true;
    }
    if (request.action === "update_highlight_comment") {
      LuminaAnnotationDB.get(request.url).then(async (highlights) => {
        const list = highlights || [];
        const highlight = list.find((h) => h[0].toString() === request.id.toString());
        if (highlight) {
          highlight[8] = request.comment;
          await LuminaAnnotationDB.put(request.url, list);
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

// src/background/index.js
initStorageCleanup();
initSidePanelManager();
initHighlightHandlers();
export {
  broadcastToSession,
  detectMediaType,
  ensureSidePanelOpen,
  fetchAudio,
  getAmericanSpelling,
  getLemma,
  initHighlightHandlers,
  initSidePanelManager,
  initStorageCleanup,
  processAttachments,
  processAttachmentsForGemini,
  readOpfsFileAsBase64,
  stopGoogleAudioOffscreen,
  toggleSidePanel
};
