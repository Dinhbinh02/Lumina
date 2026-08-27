export class EventCleanupManager {
    constructor() {
        this.listeners = new WeakMap();
    }
    addEventListener(element, event, listener, options = false) {
        if (!element || !event || !listener) return;
        element.addEventListener(event, listener, options);
        if (!this.listeners.has(element)) {
            this.listeners.set(element, new Map());
        }
        const elementListeners = this.listeners.get(element);
        if (!elementListeners.has(event)) {
            elementListeners.set(event, new Set());
        }
        elementListeners.get(event).add({ listener, options });
    }
    removeEventListener(element, event, listener, options = false) {
        if (!element || !event || !listener) return;
        element.removeEventListener(event, listener, options);
        const elementListeners = this.listeners.get(element);
        if (elementListeners && elementListeners.has(event)) {
            const eventListeners = elementListeners.get(event);
            for (const item of eventListeners) {
                if (item.listener === listener) {
                    eventListeners.delete(item);
                    break;
                }
            }
        }
    }
    cleanupElement(element) {
        if (!element) return;
        const elementListeners = this.listeners.get(element);
        if (!elementListeners) return;
        for (const [event, listeners] of elementListeners) {
            for (const { listener, options } of listeners) {
                element.removeEventListener(event, listener, options);
            }
        }
        this.listeners.delete(element);
    }
    cleanupTree(container) {
        if (!container) return;
        this.cleanupElement(container);
        const allElements = container.querySelectorAll('*');
        allElements.forEach(element => this.cleanupElement(element));
    }
}
