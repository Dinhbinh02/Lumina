export class ShadowHostManager {
    constructor() {
        this.nexusHost = null;
        this.nexusShadowRoot = null;
        this.dictPlusObserver = null;
        this.cachedTheme = null;
        this.cachedAccent = null;
        this.cachedContrast = null;
    }

    init() {
        if (this.nexusHost || document.getElementById('nexus-host') || document.getElementById('nexus-shadow-host')) {
            this.nexusHost = document.getElementById('nexus-host') || document.getElementById('nexus-shadow-host');
            this.nexusShadowRoot = this.nexusHost ? this.nexusHost.shadowRoot : null;
            return { host: this.nexusHost, shadowRoot: this.nexusShadowRoot };
        }
        this.nexusHost = document.createElement('div');
        this.nexusHost.id = 'nexus-shadow-host';
        this.nexusHost.style.cssText = 'position: fixed; top: 0; left: 0; width: 0; height: 30px; z-index: 2147483647; pointer-events: none; border: none; padding: 0; margin: 0; overflow: visible;';
        
        this.nexusShadowRoot = this.nexusHost.attachShadow({ mode: 'open' });
        (document.documentElement || document.body).appendChild(this.nexusHost);

        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = chrome.runtime.getURL('assets/styles/styles.css');
        this.nexusShadowRoot.appendChild(link);

        const katexLink = document.createElement('link');
        katexLink.rel = 'stylesheet';
        katexLink.href = chrome.runtime.getURL('lib/vendor/katex/katex.min.css');
        this.nexusShadowRoot.appendChild(katexLink);

        this.applyAskSelectionStyles();
        this.initThemeObserver();
        this.updateTheme();

        return { host: this.nexusHost, shadowRoot: this.nexusShadowRoot };
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
            if (this.nexusHost) {
                this.nexusHost.style.setProperty('font-size', baseFontSize + 'px', 'important');
            }
            document.documentElement.style.setProperty('--nexus-fontSize', baseFontSize + 'px', 'important');
        });
    }

    updateTheme() {
        const applyThemeSettings = (theme, accent, contrast) => {
            const preferredTheme = theme === 'auto'
                ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
                : theme;
            const isDark = preferredTheme === 'dark';
            if (this.nexusHost) {
                if (isDark) {
                    this.nexusHost.setAttribute('data-theme', 'dark');
                } else {
                    this.nexusHost.removeAttribute('data-theme');
                }
                this.nexusHost.setAttribute('data-accent', accent || 'default');
                this.nexusHost.setAttribute('data-contrast', contrast || 'auto');
            }
            const overlays = this.nexusShadowRoot ? this.nexusShadowRoot.querySelectorAll('.nexus-overlay') : [];
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
        if (this.dictPlusObserver || !this.nexusShadowRoot) return;
        let debounceTimer = null;
        this.dictPlusObserver = new MutationObserver((mutations) => {
            const hasTopLevelChange = mutations.some(m =>
                m.type === 'childList' && m.addedNodes.length &&
                m.target === this.nexusShadowRoot
            );
            if (!hasTopLevelChange) return;
            if (debounceTimer) return;
            debounceTimer = setTimeout(() => {
                debounceTimer = null;
                this.updateTheme();
            }, 200);
        });
        this.dictPlusObserver.observe(this.nexusShadowRoot, { childList: true, subtree: true });
    }
}
