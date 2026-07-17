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
    serializeHighlight(h) {
        if (!h || !h.rangeData) return null;
        return [
            h.id,
            h.color,
            h.rangeData.startPath.join('/'),
            h.rangeData.startOffset,
            h.rangeData.endPath.join('/'),
            h.rangeData.endOffset,
            h.rangeData.text || '',
            h.timestamp || Date.now()
        ];
    },
    deserializeHighlight(arr) {
        if (!Array.isArray(arr) || arr.length < 6) return null;
        return {
            id: arr[0],
            color: arr[1],
            rangeData: {
                startPath: arr[2].split('/').map(Number),
                startOffset: arr[3],
                endPath: arr[4].split('/').map(Number),
                endOffset: arr[5],
                text: arr[6] || ''
            },
            timestamp: arr[7] || Date.now()
        };
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
    saveHighlight(range, color, id) {
        const storageKey = this.getStorageKey(range);
        const hData = {
            id,
            color,
            rangeData: this.serializeRange(range),
            timestamp: Date.now()
        };
        const flatHighlight = this.serializeHighlight(hData);
        chrome.runtime.sendMessage({
            action: 'save_highlight',
            url: storageKey,
            highlight: flatHighlight
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
        const storageKey = tabId ? `highlights_lumina_tab_${tabId}` : this.getStorageKey();
        chrome.runtime.sendMessage({
            action: 'load_highlights',
            url: storageKey
        }, (response) => {
            if (chrome.runtime.lastError || !response || !response.success) {
                console.warn('[Lumina] Failed to load highlights:', chrome.runtime.lastError || response);
                return;
            }
            const flatHighlights = response.highlights || [];
            const highlights = flatHighlights.map(h => this.deserializeHighlight(h)).filter(Boolean);
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
        chrome.runtime.sendMessage({
            action: 'undo_last_highlight',
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
        const idsStr = ids.map(id => id.toString());
        const keysToUpdate = new Set();
        ids.forEach(id => {
            const data = this.highlightsMap.get(id);
            keysToUpdate.add(this.getStorageKey(data ? data.range : null));
        });
        keysToUpdate.forEach(storageKey => {
            chrome.runtime.sendMessage({
                action: 'remove_highlights',
                url: storageKey,
                ids: idsStr
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
        chrome.runtime.sendMessage({
            action: 'update_highlight_color',
            url: storageKey,
            id: id,
            color: newColor
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
