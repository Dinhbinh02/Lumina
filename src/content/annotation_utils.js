export const NexusAnnotation = {
    highlightsMap: new Map(),
    highlightObjects: new Map(),
    styleElement: null,

    isNexusAndNotAnswer(range) {
        if (typeof window !== 'undefined' && window.location.href.includes('nexus.html')) {
            if (!range) return true;
            let container = range.commonAncestorContainer;
            if (container.nodeType !== Node.ELEMENT_NODE) {
                container = container.parentNode;
            }
            if (!container || !container.closest('.nexus-chat-answer')) {
                return true;
            }
        }
        return false;
    },

    highlight(range, color = '#FFFB78', id = null) {
        if (!range || range.collapsed) return null;
        if (this.isNexusAndNotAnswer(range)) return null;
        const highlightId = id || Date.now().toString();
        const rangeToHighlight = range.cloneRange();
        this.applyHighlight(rangeToHighlight, color, highlightId);
        return highlightId;
    },

    injectHighlightCSS(color) {
        if (!this.styleElement) {
            this.styleElement = document.createElement('style');
            this.styleElement.id = 'nexus-highlight-styles';
            (document.head || document.documentElement).appendChild(this.styleElement);
        }
        if (color) {
            const cleanColor = color.toLowerCase().replace('#', '');
            const styleRule = `::highlight(nexus-hl-${cleanColor}) { background-color: ${color} !important; color: black !important; }\n`;
            if (!this.styleElement.textContent.includes(`nexus-hl-${cleanColor}`)) {
                this.styleElement.textContent += styleRule;
            }
        }
    },

    applyHighlight(range, color, highlightId = null) {
        if (!range || range.collapsed || !window.Highlight || !CSS.highlights) return;
        if (this.isNexusAndNotAnswer(range)) return;
        this.injectHighlightCSS(color);
        if (color) {
            const normalizedColor = color.toLowerCase();
            let highlightObj = this.highlightObjects.get(normalizedColor);
            if (!highlightObj) {
                highlightObj = new Highlight();
                this.highlightObjects.set(normalizedColor, highlightObj);
                const cleanColor = normalizedColor.replace('#', '');
                CSS.highlights.set(`nexus-hl-${cleanColor}`, highlightObj);
            }
            highlightObj.add(range);
        }
        if (highlightId) {
            const existing = this.highlightsMap.get(highlightId) || {};
            this.highlightsMap.set(highlightId, {
                range,
                color: color ? color.toLowerCase() : existing.color
            });
        }
    },

    getHighlightAtCoords(x, y) {
        for (const [id, data] of this.highlightsMap.entries()) {
            if (!data.range) continue;
            const rects = data.range.getClientRects();
            for (const rect of rects) {
                if (x >= rect.left - 4 && x <= rect.right + 4 && y >= rect.top - 5 && y <= rect.bottom + 5) {
                    return { id, color: data.color, range: data.range };
                }
            }
        }
        return null;
    },

    clearAllHighlights() {
        if (window.Highlight && CSS.highlights) {
            for (const highlightObj of this.highlightObjects.values()) {
                highlightObj.clear();
            }
        }
        this.highlightsMap.clear();
    },

    removeHighlightsByIds(ids) {
        if (!ids || ids.length === 0) return;
        ids.forEach(id => {
            const data = this.highlightsMap.get(id);
            if (data) {
                if (data.color) {
                    const highlightObj = this.highlightObjects.get(data.color);
                    if (highlightObj) highlightObj.delete(data.range);
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
                const cleanColor = newColorNormalized.replace('#', '');
                CSS.highlights.set(`nexus-hl-${cleanColor}`, newHighlightObj);
                this.injectHighlightCSS(newColorNormalized);
            }
            newHighlightObj.add(data.range);
            data.color = newColorNormalized;
        }
    },

    undoLastHighlight() {
        if (this.highlightsMap.size === 0) return;
        const lastKey = Array.from(this.highlightsMap.keys()).pop();
        if (lastKey) {
            this.removeHighlightById(lastKey);
        }
    },

    loadHighlights() {},
    saveHighlight() {}
};

if (typeof window !== 'undefined') {
    window.NexusAnnotation = NexusAnnotation;
}
if (typeof globalThis !== 'undefined') {
    globalThis.NexusAnnotation = NexusAnnotation;
}
