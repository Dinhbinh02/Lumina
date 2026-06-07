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

    // Domain enable/disable toggle logic
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        if (!tab || !tab.url) return;

        try {
            const url = new URL(tab.url);
            // Only show toggle for http/https sites
            if (url.protocol !== 'http:' && url.protocol !== 'https:') {
                document.getElementById('site-toggle').disabled = true;
                document.getElementById('site-name').textContent = 'Not supported';
                return;
            }

            const currentHostname = url.hostname;
            document.getElementById('site-name').textContent = currentHostname;

            chrome.storage.local.get(['disabledDomains'], (items) => {
                const disabledDomains = items.disabledDomains || [];
                const isEnabled = !disabledDomains.includes(currentHostname);
                document.getElementById('site-toggle').checked = isEnabled;
            });

            // Listen to toggle change
            document.getElementById('site-toggle').addEventListener('change', () => {
                const isEnabled = document.getElementById('site-toggle').checked;
                chrome.storage.local.get(['disabledDomains'], (items) => {
                    let disabledDomains = items.disabledDomains || [];
                    if (isEnabled) {
                        disabledDomains = disabledDomains.filter(domain => domain !== currentHostname);
                    } else {
                        if (!disabledDomains.includes(currentHostname)) {
                            disabledDomains.push(currentHostname);
                        }
                    }

                    chrome.storage.local.set({ disabledDomains }, () => {
                        // Send message to the tab to update state instantly
                        chrome.tabs.sendMessage(tab.id, {
                            action: 'toggle_extension_state',
                            isEnabled: isEnabled
                        }).catch(() => {});
                    });
                });
            });
        } catch (e) {
            console.error('[Lumina Popup] Failed to initialize domain toggle:', e);
        }
    });
});
