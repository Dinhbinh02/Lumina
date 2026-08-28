export function bindContainerWheelForward(containerEl) {
    if (!containerEl || containerEl.__nexusWheelBound) return;
    containerEl.__nexusWheelBound = true;
    let cachedScrollable = null;
    function attachScrollContentBlocker(scrollable) {
        if (!scrollable || scrollable.__nexusWheelStop) return;
        scrollable.__nexusWheelStop = true;
        scrollable.addEventListener('wheel', (e) => { e.stopPropagation(); }, { passive: true });
    }
    containerEl.addEventListener('wheel', (e) => {
        if (!cachedScrollable || cachedScrollable.style.display === 'none') {
            cachedScrollable = containerEl.querySelector('.nexus-chat-scroll-content:not([style*="display: none"])');
            if (cachedScrollable) attachScrollContentBlocker(cachedScrollable);
        }
        if (!cachedScrollable) return;
        e.preventDefault();
        let delta = e.deltaY;
        if (e.deltaMode === 1) delta *= 16;
        else if (e.deltaMode === 2) delta *= cachedScrollable.clientHeight;
        cachedScrollable.scrollBy({ top: delta, behavior: 'instant' });
    }, { passive: false });
    const existing = containerEl.querySelector('.nexus-chat-scroll-content');
    if (existing) attachScrollContentBlocker(existing);
}

let topbarProgressTimer1 = null;
let topbarProgressTimer2 = null;

export function showTopbarLoading() {
    const bar = document.getElementById('topbar-progress');
    if (!bar) return;

    if (topbarProgressTimer1) clearTimeout(topbarProgressTimer1);
    if (topbarProgressTimer2) clearTimeout(topbarProgressTimer2);
    topbarProgressTimer1 = null;
    topbarProgressTimer2 = null;

    const isActive = bar.classList.contains('active');
    if (!isActive) {
        bar.style.transition = 'none';
        bar.style.transform = 'scaleX(0)';
        bar.classList.add('active');
        bar.offsetHeight;
    }
    bar.style.transition = 'transform 0.4s cubic-bezier(0.1, 0.8, 0.3, 1), opacity 0.2s ease';
    bar.style.transform = 'scaleX(0.85)';
}

export function hideTopbarLoading() {
    const bar = document.getElementById('topbar-progress');
    if (!bar) return;

    if (topbarProgressTimer1) clearTimeout(topbarProgressTimer1);
    if (topbarProgressTimer2) clearTimeout(topbarProgressTimer2);

    bar.style.transition = 'transform 0.15s ease, opacity 0.15s ease';
    bar.style.transform = 'scaleX(1)';
    topbarProgressTimer1 = setTimeout(() => {
        bar.classList.remove('active');
        topbarProgressTimer2 = setTimeout(() => {
            bar.style.transform = 'scaleX(0)';
        }, 150);
    }, 150);
}

export function restoreScrollPosition(tab) {
    if (!tab || !tab.historyEl) return;
    const entries = tab.historyEl.querySelectorAll('.nexus-entry');
    if (entries.length === 0) return;
    if (tab.scrollTop != null && tab.scrollTop !== -1) {
        tab.historyEl.scrollTop = tab.scrollTop;
        return;
    }
    if (tab.isAtBottom) {
        tab.historyEl.scrollTop = tab.historyEl.scrollHeight;
        return;
    }
    if (tab.scrollAnchorIndex != null && tab.scrollAnchorIndex < entries.length) {
        const anchor = entries[tab.scrollAnchorIndex];
        const baseTarget = window.NexusChatUI ? window.NexusChatUI.calculateInitialScrollTarget(anchor, tab.historyEl) : 0;
        tab.historyEl.scrollTop = baseTarget + (tab.scrollAnchorOffset || 0);
    }
}

export function restoreLatestScrollPosition(tab) {
    if (!tab || !tab.historyEl) return;
    const entries = tab.historyEl.querySelectorAll('.nexus-entry');
    if (entries.length === 0) return;
    const latestEntry = entries[entries.length - 1];
    if (tab.chatUIInstance && typeof tab.chatUIInstance.updateEntryMinHeight === 'function') {
        tab.chatUIInstance.updateEntryMinHeight(latestEntry);
        tab.chatUIInstance.adjustEntryMargin(latestEntry, 'immediate');
    }
    const targetScrollTop = window.NexusChatUI ? window.NexusChatUI.calculateInitialScrollTarget(latestEntry, tab.historyEl) : 0;
    tab.historyEl.scrollTop = targetScrollTop;
    tab.scrollTop = targetScrollTop;
}
