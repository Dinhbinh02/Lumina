window.LuminaAnnotation = {
    highlightsMap: new Map(), 
    highlightObjects: new Map(), 
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

        const range = document.createRange();
        try {
            range.setStart(startNode, data.startOffset);
            range.setEnd(endNode, data.endOffset);
            return range;
        } catch (e) {
            console.warn('[Lumina] Range recovery failed:', e);
            return null;
        }
    },

    highlight(range, color = '#FFFB78', id = null) {
        if (!range || range.collapsed) return null;
        const highlightId = id || Date.now().toString();

        const rangeToHighlight = range.cloneRange();
        this.saveHighlight(rangeToHighlight, color, highlightId);
        this.applyHighlight(rangeToHighlight, color, highlightId);

        return highlightId;
    },

    injectHighlightCSS(color) {
        if (!this.styleElement) {
            this.styleElement = document.createElement('style');
            this.styleElement.id = 'lumina-highlight-styles';
            (document.head || document.documentElement).appendChild(this.styleElement);
        }
        const cleanColor = color.toLowerCase().replace('#', '');
        const styleRule = `::highlight(lumina-hl-${cleanColor}) { background-color: ${color} !important; color: black !important; }\n`;
        if (!this.styleElement.textContent.includes(`lumina-hl-${cleanColor}`)) {
            this.styleElement.textContent += styleRule;
        }
    },

    applyHighlight(range, color, highlightId = null) {
        if (!range || range.collapsed || !window.Highlight || !CSS.highlights) return;

        const normalizedColor = color.toLowerCase();
        let highlightObj = this.highlightObjects.get(normalizedColor);
        if (!highlightObj) {
            highlightObj = new Highlight();
            this.highlightObjects.set(normalizedColor, highlightObj);
            const cleanColor = normalizedColor.replace('#', '');
            CSS.highlights.set(`lumina-hl-${cleanColor}`, highlightObj);
            this.injectHighlightCSS(normalizedColor);
        }

        highlightObj.add(range);
        if (highlightId) {
            this.highlightsMap.set(highlightId, { range, color: normalizedColor });
        }
    },

    getHighlightAtCoords(x, y) {
        for (const [id, data] of this.highlightsMap.entries()) {
            const rects = data.range.getClientRects();
            for (const rect of rects) {
                if (x >= rect.left - 2 && x <= rect.right + 2 && y >= rect.top - 2 && y <= rect.bottom + 2) {
                    return { id, color: data.color, range: data.range };
                }
            }
        }
        return null;
    },

    getStorageKey(rangeOrNode = null) {
        const url = window.location.href.split('#')[0].split('?')[0];
        if (url.startsWith('chrome-extension://')) {
            let tabId = null;
            const scope = window.LuminaSelectionScope;
            if (rangeOrNode && scope) {
                const node = (rangeOrNode instanceof Range) ? rangeOrNode.startContainer : rangeOrNode;
                let curr = node;
                const tabsList = scope.getTabs();
                while (curr && curr !== document.documentElement) {
                    if (curr.nodeType === 1 && tabsList) {
                        const tab = tabsList.find(t => t.historyEl === curr);
                        if (tab) {
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
                if (tabsList && typeof activeIdx !== 'undefined' && tabsList[activeIdx]) {
                    tabId = tabsList[activeIdx].id;
                }
            }
            return tabId ? `highlights_spotlight_tab_${tabId}` : `highlights_spotlight`;
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

    saveHighlight(range, color, id) {
        const storageKey = this.getStorageKey(range);

        const hData = {
            id,
            color,
            rangeData: this.serializeRange(range),
            timestamp: Date.now()
        };

        chrome.storage.local.get([storageKey], (data) => {
            const highlights = data[storageKey] || [];
            highlights.push(hData);
            chrome.storage.local.set({ [storageKey]: highlights });
        });
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
            this.unrestoredHighlights.forEach(h => {
                const range = this.deserializeRange(h.rangeData);
                if (range) {
                    this.applyHighlight(range, h.color, h.id);
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
        }, 15000);
    },

    loadHighlights(tabId = null) {
        const storageKey = tabId ? `highlights_spotlight_tab_${tabId}` : this.getStorageKey();
        chrome.storage.local.get([storageKey], (data) => {
            const highlights = data[storageKey] || [];
            this.unrestoredHighlights = this.unrestoredHighlights || [];

            highlights.forEach(h => {
                const range = this.deserializeRange(h.rangeData);
                if (range) {
                    this.applyHighlight(range, h.color, h.id);
                } else {
                    if (!this.unrestoredHighlights.some(item => item.id === h.id)) {
                        this.unrestoredHighlights.push(h);
                    }
                }
            });

            if (this.unrestoredHighlights.length > 0) {
                this.setupRetryObserver();
            }
        });
    },

    undoLastHighlight() {
        const storageKey = this.getStorageKey();

        chrome.storage.local.get([storageKey], (data) => {
            const highlights = data[storageKey] || [];
            if (highlights.length === 0) return;

            const lastHighlight = highlights.pop();
            this.removeHighlightById(lastHighlight.id);
            chrome.storage.local.set({ [storageKey]: highlights });
        });
    },

    removeHighlightsByIds(ids) {
        if (!ids || ids.length === 0) return;
        const idsStr = ids.map(id => id.toString());

        const keysToUpdate = new Set();
        ids.forEach(id => {
            const data = this.highlightsMap.get(id);
            keysToUpdate.add(this.getStorageKey(data ? data.range : null));
        });

        keysToUpdate.forEach(storageKey => {
            chrome.storage.local.get([storageKey], (storageData) => {
                const highlights = storageData[storageKey] || [];
                const filtered = highlights.filter(h => !idsStr.includes(h.id.toString()));
                chrome.storage.local.set({ [storageKey]: filtered });
            });
        });

        if (this.unrestoredHighlights) {
            this.unrestoredHighlights = this.unrestoredHighlights.filter(h => !idsStr.includes(h.id.toString()));
        }

        ids.forEach(id => {
            const data = this.highlightsMap.get(id);
            if (data) {
                const highlightObj = this.highlightObjects.get(data.color);
                if (highlightObj) {
                    highlightObj.delete(data.range);
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

        chrome.storage.local.get([storageKey], (storageData) => {
            const highlights = storageData[storageKey] || [];
            const highlight = highlights.find(h => h.id.toString() === id.toString());
            if (highlight) {
                highlight.color = newColor;
                chrome.storage.local.set({ [storageKey]: highlights });
            }
        });

        if (data) {
            const oldColor = data.color;
            const newColorNormalized = newColor.toLowerCase();

            const oldHighlightObj = this.highlightObjects.get(oldColor);
            if (oldHighlightObj) {
                oldHighlightObj.delete(data.range);
            }

            let newHighlightObj = this.highlightObjects.get(newColorNormalized);
            if (!newHighlightObj) {
                newHighlightObj = new Highlight();
                this.highlightObjects.set(newColorNormalized, newHighlightObj);
                const cleanColor = newColorNormalized.replace('#', '');
                CSS.highlights.set(`lumina-hl-${cleanColor}`, newHighlightObj);
                this.injectHighlightCSS(newColorNormalized);
            }
            newHighlightObj.add(data.range);
            data.color = newColorNormalized;
        }
    }
};
