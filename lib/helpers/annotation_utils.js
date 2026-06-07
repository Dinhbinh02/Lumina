window.LuminaAnnotation = {
    highlightsMap: new Map(), // id -> { range, color }
    highlightObjects: new Map(), // color -> Highlight object
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

    saveHighlight(range, color, id) {
        const url = window.location.href.split('#')[0].split('?')[0];
        const storageKey = `highlights_${url}`;

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

    loadHighlights() {
        const url = window.location.href.split('#')[0].split('?')[0];
        const storageKey = `highlights_${url}`;
        chrome.storage.local.get([storageKey], (data) => {
            const highlights = data[storageKey] || [];
            highlights.forEach(h => {
                const range = this.deserializeRange(h.rangeData);
                if (range) {
                    this.applyHighlight(range, h.color, h.id);
                }
            });
        });
    },

    undoLastHighlight() {
        const url = window.location.href.split('#')[0].split('?')[0];
        const storageKey = `highlights_${url}`;

        chrome.storage.local.get([storageKey], (data) => {
            const highlights = data[storageKey] || [];
            if (highlights.length === 0) return;

            const lastHighlight = highlights.pop();
            this.removeHighlightById(lastHighlight.id);
            chrome.storage.local.set({ [storageKey]: highlights });
        });
    },

    removeHighlightById(id) {
        if (!id) return;

        const url = window.location.href.split('#')[0].split('?')[0];
        const storageKey = `highlights_${url}`;
        chrome.storage.local.get([storageKey], (data) => {
            const highlights = data[storageKey] || [];
            const filtered = highlights.filter(h => h.id !== id);
            chrome.storage.local.set({ [storageKey]: filtered });
        });

        const data = this.highlightsMap.get(id);
        if (data) {
            const highlightObj = this.highlightObjects.get(data.color);
            if (highlightObj) {
                highlightObj.delete(data.range);
            }
            this.highlightsMap.delete(id);
        }
    },

    updateHighlightColor(id, newColor) {
        if (!id || !newColor) return;

        const url = window.location.href.split('#')[0].split('?')[0];
        const storageKey = `highlights_${url}`;
        chrome.storage.local.get([storageKey], (data) => {
            const highlights = data[storageKey] || [];
            const highlight = highlights.find(h => h.id === id);
            if (highlight) {
                highlight.color = newColor;
                chrome.storage.local.set({ [storageKey]: highlights });
            }
        });

        const data = this.highlightsMap.get(id);
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
