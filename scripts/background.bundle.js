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

// src/background/index.js
initStorageCleanup();
initSidePanelManager();
initHighlightHandlers();
initSyncHandlers();
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
  initSyncHandlers,
  processAttachments,
  processAttachmentsForGemini,
  readOpfsFileAsBase64,
  stopGoogleAudioOffscreen,
  toggleSidePanel
};
