(function() {
    const globalObj = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {});
    if (!globalObj.LuminaRawTextRegistry) {
        globalObj.LuminaRawTextRegistry = new WeakMap();
    }
    
    if (typeof Element !== 'undefined' && Element.prototype) {
        const originalSetAttribute = Element.prototype.setAttribute;
        const originalGetAttribute = Element.prototype.getAttribute;
        const originalRemoveAttribute = Element.prototype.removeAttribute;

        Element.prototype.setAttribute = function(name, value) {
            if (name === 'data-raw-text') {
                globalObj.LuminaRawTextRegistry.set(this, value);
                const truncated = typeof value === 'string' && value.length > 1000 ? value.substring(0, 1000) + '... (truncated in DOM)' : value;
                return originalSetAttribute.call(this, name, truncated);
            }
            return originalSetAttribute.call(this, name, value);
        };

        Element.prototype.getAttribute = function(name) {
            if (name === 'data-raw-text') {
                if (globalObj.LuminaRawTextRegistry.has(this)) {
                    return globalObj.LuminaRawTextRegistry.get(this);
                }
            }
            return originalGetAttribute.call(this, name);
        };

        Element.prototype.removeAttribute = function(name) {
            if (name === 'data-raw-text') {
                globalObj.LuminaRawTextRegistry.delete(this);
            }
            return originalRemoveAttribute.call(this, name);
        };
    }
})();

export function escapeHTMLAttr(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export function createObjectUrlFromDataUrl(dataUrl) {
    if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return null;
    const commaIdx = dataUrl.indexOf(',');
    if (commaIdx === -1) return null;
    const header = dataUrl.slice(0, commaIdx);
    const base64 = dataUrl.slice(commaIdx + 1);
    const mimeMatch = header.match(/^data:([^;]+);base64$/i);
    if (!mimeMatch) return null;
    try {
        const mimeType = mimeMatch[1];
        const binary = atob(base64);
        const array = [];
        for (let i = 0; i < binary.length; i++) {
            array.push(binary.charCodeAt(i));
        }
        const blob = new Blob([new Uint8Array(array)], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const globalObj = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {});
        globalObj.LuminaActiveBlobUrls = globalObj.LuminaActiveBlobUrls || [];
        globalObj.LuminaActiveBlobUrls.push(url);
        return url;
    } catch (e) {
        console.error('Failed to create object URL from data URL:', e);
        return null;
    }
}

export function resolveImagePreviewSrc(item, src) {
    if (!src || typeof src !== 'string') return src;
    if (!src.startsWith('data:image/')) return src;
    if (item && typeof item === 'object' && item._luminaBlobUrl) {
        return item._luminaBlobUrl;
    }
    const blobUrl = createObjectUrlFromDataUrl(src);
    if (blobUrl && item && typeof item === 'object') {
        item._luminaBlobUrl = blobUrl;
    }
    return blobUrl || src;
}

export function reconstructGroups(messages) {
    const qaGroups = [];
    let index = 0;
    const list = Array.isArray(messages) ? messages : [];
    while (index < list.length) {
        const group = [];
        const msg = list[index];
        if (msg && msg.type === 'context' && index + 1 < list.length) {
            if (list[index + 1] && list[index + 1].type === 'question') {
                group.push(msg);
                index++;
                group.push(list[index]);
                index++;
                while (index < list.length && list[index] && list[index].type !== 'context' && list[index].type !== 'question') {
                    group.push(list[index]);
                    index++;
                }
                qaGroups.push(group);
                continue;
            }
        }
        if (msg && msg.type === 'question') {
            group.push(msg);
            index++;
            while (index < list.length && list[index] && list[index].type !== 'context' && list[index].type !== 'question') {
                group.push(list[index]);
                index++;
            }
            qaGroups.push(group);
            continue;
        }
        group.push(msg);
        index++;
        qaGroups.push(group);
    }
    return qaGroups;
}
