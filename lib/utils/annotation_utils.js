window.LuminaAnnotation = {
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

    applyHighlight(range, color, highlightId = null) {
        if (!range || range.collapsed) return;

        if (range.startContainer === range.endContainer && range.startContainer.nodeType === Node.TEXT_NODE) {
            const span = document.createElement('span');
            span.className = 'lumina-highlight';
            span.style.backgroundColor = color;
            if (highlightId) span.dataset.highlightId = highlightId;
            
            try {
                range.surroundContents(span);
                return;
            } catch (e) {
                // Fallback to complex if surroundContents fails
            }
        }

        const fragment = range.extractContents();
        this._wrapTextNodesInFragment(fragment, color, highlightId);
        range.insertNode(fragment);
    },

    _wrapTextNodesInFragment(container, color, highlightId) {
        const nodes = [];
        const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
        let node;
        while (node = walker.nextNode()) {
            nodes.push(node);
        }

        nodes.forEach(textNode => {
            const span = document.createElement('span');
            span.className = 'lumina-highlight';
            span.style.backgroundColor = color;
            if (highlightId) span.dataset.highlightId = highlightId;
            
            textNode.parentNode.replaceChild(span, textNode);
            span.appendChild(textNode);
        });
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

        // 1. Remove from Storage
        const url = window.location.href.split('#')[0].split('?')[0];
        const storageKey = `highlights_${url}`;
        chrome.storage.local.get([storageKey], (data) => {
            const highlights = data[storageKey] || [];
            const filtered = highlights.filter(h => h.id !== id);
            chrome.storage.local.set({ [storageKey]: filtered });
        });

        // 2. Remove from DOM
        const segments = document.querySelectorAll(`.lumina-highlight[data-highlight-id="${id}"]`);
        segments.forEach(span => {
            const parent = span.parentNode;
            if (!parent) return;

            // Move all children out of the span
            while (span.firstChild) {
                parent.insertBefore(span.firstChild, span);
            }
            
            // Remove the now-empty span
            span.remove();
            
            // Merge adjacent text nodes
            if (parent) parent.normalize();
        });
    },

    updateHighlightColor(id, newColor) {
        if (!id || !newColor) return;
        
        // 1. Update UI
        const segments = document.querySelectorAll(`.lumina-highlight[data-highlight-id="${id}"]`);
        segments.forEach(span => {
            span.style.backgroundColor = newColor;
        });

        // 2. Update Storage
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
    }
};
