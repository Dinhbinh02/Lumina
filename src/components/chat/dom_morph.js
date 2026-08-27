export function morphDOM(container, newHTML) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<body>${newHTML}</body>`, 'text/html');
    const newRoot = doc.body;

    function isSameNode(node1, node2) {
        if (node1.nodeType !== node2.nodeType) return false;
        if (node1.nodeType === Node.TEXT_NODE) return node1.nodeValue === node2.nodeValue;
        if (node1.nodeType === Node.ELEMENT_NODE) {
            return node1.tagName === node2.tagName && node1.getAttribute('data-index') === node2.getAttribute('data-index');
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
        if (!isSameNode(oldChild, newChild)) {
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
