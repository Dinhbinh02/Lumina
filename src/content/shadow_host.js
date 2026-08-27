export class ShadowHostManager {
    constructor() {
        this.luminaHost = null;
        this.luminaShadowRoot = null;
        this.dictPlusObserver = null;
        this.cachedTheme = null;
        this.cachedAccent = null;
        this.cachedContrast = null;
    }

    init() {
        if (this.luminaHost || document.getElementById('lumina-host') || document.getElementById('lumina-shadow-host')) {
            this.luminaHost = document.getElementById('lumina-host') || document.getElementById('lumina-shadow-host');
            this.luminaShadowRoot = this.luminaHost ? this.luminaHost.shadowRoot : null;
            return { host: this.luminaHost, shadowRoot: this.luminaShadowRoot };
        }
        this.luminaHost = document.createElement('div');
        this.luminaHost.id = 'lumina-shadow-host';
        this.luminaHost.style.cssText = 'position: fixed; top: 0; left: 0; width: 0; height: 30px; z-index: 2147483647; pointer-events: none; border: none; padding: 0; margin: 0; overflow: visible;';
        
        this.luminaShadowRoot = this.luminaHost.attachShadow({ mode: 'open' });
        (document.documentElement || document.body).appendChild(this.luminaHost);

        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = chrome.runtime.getURL('assets/styles/styles.css');
        this.luminaShadowRoot.appendChild(link);

        const katexLink = document.createElement('link');
        katexLink.rel = 'stylesheet';
        katexLink.href = chrome.runtime.getURL('lib/vendor/katex/katex.min.css');
        this.luminaShadowRoot.appendChild(katexLink);

        this.applyAskSelectionStyles();
        this.initThemeObserver();
        this.updateTheme();

        return { host: this.luminaHost, shadowRoot: this.luminaShadowRoot };
    }

    applyAskSelectionStyles() {
        chrome.storage.local.get(['fontSize', 'fontSizeByDomain', 'globalDefaults'], (items) => {
            const currentDomain = window.location.hostname;
            let baseFontSize = 13;
            if (items.fontSizeByDomain && items.fontSizeByDomain[currentDomain]) {
                baseFontSize = items.fontSizeByDomain[currentDomain];
            } else if (items.globalDefaults && items.globalDefaults.fontSize) {
                baseFontSize = items.globalDefaults.fontSize;
            } else if (items.fontSize) {
                baseFontSize = items.fontSize;
            }
            if (this.luminaHost) {
                this.luminaHost.style.setProperty('font-size', baseFontSize + 'px', 'important');
            }
            document.documentElement.style.setProperty('--lumina-fontSize', baseFontSize + 'px', 'important');
        });
    }

    updateTheme() {
        const applyThemeSettings = (theme, accent, contrast) => {
            const preferredTheme = theme === 'auto'
                ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
                : theme;
            const isDark = preferredTheme === 'dark';
            if (this.luminaHost) {
                if (isDark) {
                    this.luminaHost.setAttribute('data-theme', 'dark');
                } else {
                    this.luminaHost.removeAttribute('data-theme');
                }
                this.luminaHost.setAttribute('data-accent', accent || 'default');
                this.luminaHost.setAttribute('data-contrast', contrast || 'auto');
            }
            const overlays = this.luminaShadowRoot ? this.luminaShadowRoot.querySelectorAll('.lumina-overlay') : [];
            overlays.forEach(el => {
                if (isDark) {
                    el.setAttribute('data-theme', 'dark');
                } else {
                    el.removeAttribute('data-theme');
                }
                el.setAttribute('data-accent', accent || 'default');
                el.setAttribute('data-contrast', contrast || 'auto');
            });
        };
        if (this.cachedTheme !== null && this.cachedAccent !== null && this.cachedContrast !== null) {
            applyThemeSettings(this.cachedTheme, this.cachedAccent, this.cachedContrast);
            return;
        }
        chrome.storage.local.get(['theme', 'contrast', 'accentColor', 'globalDefaults'], (data) => {
            this.cachedTheme = data.theme || (data.globalDefaults && data.globalDefaults.theme) || 'light';
            this.cachedContrast = data.contrast || (data.globalDefaults && data.globalDefaults.contrast) || 'auto';
            this.cachedAccent = data.accentColor || (data.globalDefaults && data.globalDefaults.accentColor) || 'default';
            applyThemeSettings(this.cachedTheme, this.cachedAccent, this.cachedContrast);
        });
    }

    initThemeObserver() {
        if (this.dictPlusObserver || !this.luminaShadowRoot) return;
        let debounceTimer = null;
        this.dictPlusObserver = new MutationObserver((mutations) => {
            const hasTopLevelChange = mutations.some(m =>
                m.type === 'childList' && m.addedNodes.length &&
                m.target === this.luminaShadowRoot
            );
            if (!hasTopLevelChange) return;
            if (debounceTimer) return;
            debounceTimer = setTimeout(() => {
                debounceTimer = null;
                this.updateTheme();
            }, 200);
        });
        this.dictPlusObserver.observe(this.luminaShadowRoot, { childList: true, subtree: true });
    }
}
