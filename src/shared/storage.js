export const StorageService = {
    async get(keys, area = 'sync') {
        const storageArea = (chrome?.storage && chrome.storage[area]) ? chrome.storage[area] : chrome?.storage?.local;
        if (!storageArea) return {};
        return new Promise((resolve) => {
            storageArea.get(keys, (items) => {
                if (chrome.runtime.lastError) {
                    chrome?.storage?.local?.get(keys, (localItems) => resolve(localItems || {}));
                } else {
                    resolve(items || {});
                }
            });
        });
    },

    async set(items, area = 'sync') {
        const storageArea = (chrome?.storage && chrome.storage[area]) ? chrome.storage[area] : chrome?.storage?.local;
        if (!storageArea) return false;
        return new Promise((resolve) => {
            storageArea.set(items, () => {
                if (chrome.runtime.lastError) {
                    chrome?.storage?.local?.set(items, () => resolve(true));
                } else {
                    resolve(true);
                }
            });
        });
    },

    async remove(keys, area = 'sync') {
        const storageArea = (chrome?.storage && chrome.storage[area]) ? chrome.storage[area] : chrome?.storage?.local;
        if (!storageArea) return false;
        return new Promise((resolve) => {
            storageArea.remove(keys, () => resolve(true));
        });
    },

    onChanged(callback) {
        if (!chrome?.storage?.onChanged) return () => {};
        chrome.storage.onChanged.addListener(callback);
        return () => chrome.storage.onChanged.removeListener(callback);
    }
};
