const scheduledContainers = new WeakMap();

export function morphDOM(container, newHTML) {
    if (!container) return;
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<body>${newHTML}</body>`, 'text/html');
    const newRoot = doc.body;

    function isSameNodeType(node1, node2) {
        if (node1.nodeType !== node2.nodeType) return false;
        if (node1.nodeType === Node.TEXT_NODE) return true;
        if (node1.nodeType === Node.ELEMENT_NODE) {
            return node1.tagName === node2.tagName;
        }
        return false;
    }

    function patch(parent, oldChild, newChild) {
        if (!oldChild && newChild) {
            parent.appendChild(newChild.cloneNode(true));
            return;
        }
        if (oldChild && !newChild) {
            parent.removeChild(oldChild);
            return;
        }
        if (!isSameNodeType(oldChild, newChild)) {
            parent.replaceChild(newChild.cloneNode(true), oldChild);
            return;
        }
        if (oldChild.nodeType === Node.TEXT_NODE) {
            if (oldChild.nodeValue !== newChild.nodeValue) {
                oldChild.nodeValue = newChild.nodeValue;
            }
            return;
        }
        if (oldChild.nodeType === Node.ELEMENT_NODE) {
            if (oldChild.tagName === 'CANVAS' || oldChild.classList?.contains('nexus-interactive-frozen')) {
                return;
            }
            // Protect already mounted and running widget iframes, but allow loading skeletons to be replaced
            if (oldChild.classList?.contains('nexus-widget-wrapper') && !oldChild.classList?.contains('nexus-widget-loading') && newChild.classList?.contains('nexus-widget-wrapper')) {
                return;
            }

            for (let i = 0; i < newChild.attributes.length; i++) {
                const attr = newChild.attributes[i];
                if (oldChild.getAttribute(attr.name) !== attr.value) {
                    oldChild.setAttribute(attr.name, attr.value);
                }
            }
            for (let i = oldChild.attributes.length - 1; i >= 0; i--) {
                const attr = oldChild.attributes[i];
                if (!newChild.hasAttribute(attr.name)) {
                    oldChild.removeAttribute(attr.name);
                }
            }

            const oldChildren = Array.from(oldChild.childNodes);
            const newChildren = Array.from(newChild.childNodes);
            const maxLen = Math.max(oldChildren.length, newChildren.length);
            for (let i = 0; i < maxLen; i++) {
                patch(oldChild, oldChildren[i], newChildren[i]);
            }
        }
    }

    const oldChildren = Array.from(container.childNodes);
    const newChildren = Array.from(newRoot.childNodes);
    const maxLen = Math.max(oldChildren.length, newChildren.length);
    for (let i = 0; i < maxLen; i++) {
        patch(container, oldChildren[i], newChildren[i]);
    }
}

export function scheduleMorphDOM(container, newHTML) {
    if (!container) return;
    if (scheduledContainers.has(container)) {
        scheduledContainers.set(container, newHTML);
        return;
    }
    scheduledContainers.set(container, newHTML);
    requestAnimationFrame(() => {
        const latestHTML = scheduledContainers.get(container);
        scheduledContainers.delete(container);
        if (typeof latestHTML === 'string') {
            morphDOM(container, latestHTML);
        }
    });
}

if (typeof window !== 'undefined') {
    window.morphDOM = morphDOM;
    window.scheduleMorphDOM = scheduleMorphDOM;
}
