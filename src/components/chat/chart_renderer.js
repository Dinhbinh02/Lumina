export function renderChartJSWrapper(wrapper) {
    const configAttr = wrapper.getAttribute('data-chartjs-config');
    if (!configAttr) {
        wrapper.classList.remove('is-loading');
        return;
    }
    if (wrapper.getAttribute('data-last-rendered-source') === configAttr) return;
    const chatAnswer = wrapper.closest('.lumina-chat-answer');
    if (chatAnswer && chatAnswer.classList.contains('streaming')) return;
    const rawConfig = configAttr
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
    let config;
    try {
        config = JSON.parse(rawConfig);
    } catch (_) {
        return;
    }
    wrapper.setAttribute('data-last-rendered-source', configAttr);
    requestAnimationFrame(() => {
        try {
            if (typeof Chart === 'undefined') {
                if (typeof window.ensureChartLoaded === 'function') {
                    window.ensureChartLoaded().then(() => {
                        renderChartJSWrapper(wrapper);
                    }).catch(() => {
                        wrapper.removeAttribute('data-last-rendered-source');
                        setTimeout(() => renderChartJSWrapper(wrapper), 300);
                    });
                }
                return;
            }
            const isDark = document.documentElement.getAttribute('data-theme') === 'dark' ||
                document.body.getAttribute('data-theme') === 'dark';
            const textColor = isDark ? '#e8eaed' : '#1c1c1e';
            const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
            const bgColor = isDark ? '#1e2130' : '#ffffff';
            config.options = config.options || {};
            config.options.plugins = config.options.plugins || {};
            config.options.animation = config.options.animation !== false
                ? { duration: 600, easing: 'easeOutQuart' }
                : false;
            config.options.responsive = true;
            config.options.maintainAspectRatio = true;

            let canvas = wrapper.querySelector('canvas');
            if (!canvas) {
                wrapper.innerHTML = '';
                canvas = document.createElement('canvas');
                wrapper.appendChild(canvas);
            }
            wrapper.classList.remove('is-loading');
            const ctx = canvas.getContext('2d');
            if (wrapper._chartInstance) {
                wrapper._chartInstance.destroy();
            }
            wrapper._chartInstance = new Chart(ctx, config);
        } catch (e) {
            wrapper.classList.remove('is-loading');
        }
    });
}

if (typeof window !== 'undefined') {
    window._renderChartJSWrapper = renderChartJSWrapper;
}
