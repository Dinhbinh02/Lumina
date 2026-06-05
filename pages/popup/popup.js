document.addEventListener('DOMContentLoaded', () => {
    const btnOptions = document.getElementById('btn-options');
    const btnTab = document.getElementById('btn-tab');
    const btnWindow = document.getElementById('btn-window');
    const btnSidepanel = document.getElementById('btn-sidepanel');

    // Open options page
    btnOptions.addEventListener('click', () => {
        if (chrome.runtime.openOptionsPage) {
            chrome.runtime.openOptionsPage();
        } else {
            window.open(chrome.runtime.getURL('pages/options/options.html'));
        }
        window.close();
    });

    // Open as new tab
    btnTab.addEventListener('click', () => {
        const url = chrome.runtime.getURL('pages/spotlight/spotlight.html?webapp=1');
        chrome.tabs.create({ url });
        window.close();
    });

    // Open as window
    btnWindow.addEventListener('click', () => {
        const url = chrome.runtime.getURL('pages/spotlight/spotlight.html?webapp=1');
        chrome.windows.create({
            url: url,
            type: 'popup',
            width: 900,
            height: 650
        });
        window.close();
    });

    // Open as sidepanel
    btnSidepanel.addEventListener('click', async () => {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab && chrome.sidePanel && chrome.sidePanel.open) {
                await chrome.sidePanel.open({ tabId: tab.id });
            } else {
                // Fallback to sending message to background
                chrome.runtime.sendMessage({ action: 'open_sidepanel' });
            }
        } catch (err) {
            console.error('[Lumina Popup] Failed to open side panel:', err);
            // Fallback message
            chrome.runtime.sendMessage({ action: 'open_sidepanel' });
        }
        window.close();
    });
});
