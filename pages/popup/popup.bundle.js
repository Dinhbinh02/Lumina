(() => {
  // src/popup/index.js
  document.addEventListener("DOMContentLoaded", () => {
    chrome.storage.local.get(["theme", "contrast", "accentColor", "globalDefaults", "fontWeight"], (items) => {
      const themeVal = items.theme || items.globalDefaults && items.globalDefaults.theme || "auto";
      const contrastVal = items.contrast || items.globalDefaults && items.globalDefaults.contrast || "auto";
      const accentVal = items.accentColor || items.globalDefaults && items.globalDefaults.accentColor || "default";
      const fontWeightVal = items.fontWeight || "400";
      const mode = themeVal === "auto" ? window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light" : themeVal;
      document.body.setAttribute("data-theme", mode);
      document.body.setAttribute("data-accent", accentVal);
      document.body.setAttribute("data-contrast", contrastVal);
      document.documentElement.style.setProperty("--lumina-weight-base", fontWeightVal);
    });
    const btnOptions = document.getElementById("btn-options");
    const btnTab = document.getElementById("btn-tab");
    const btnWindow = document.getElementById("btn-window");
    const btnSidepanel = document.getElementById("btn-sidepanel");
    if (btnOptions) {
      btnOptions.addEventListener("click", () => {
        if (chrome.runtime.openOptionsPage) {
          chrome.runtime.openOptionsPage();
        } else {
          window.open(chrome.runtime.getURL("pages/lumina/lumina.html?settings=1"));
        }
        window.close();
      });
    }
    if (btnTab) {
      btnTab.addEventListener("click", () => {
        const url = chrome.runtime.getURL("pages/lumina/lumina.html");
        chrome.tabs.create({ url });
        window.close();
      });
    }
    if (btnWindow) {
      btnWindow.addEventListener("click", () => {
        const url = chrome.runtime.getURL("pages/lumina/lumina.html");
        chrome.windows.create({
          url,
          type: "popup",
          width: 900,
          height: 650
        });
        window.close();
      });
    }
    if (btnSidepanel) {
      btnSidepanel.addEventListener("click", async () => {
        try {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tab && chrome.sidePanel && chrome.sidePanel.open) {
            await chrome.sidePanel.open({ tabId: tab.id });
          } else {
            chrome.runtime.sendMessage({ action: "open_sidepanel" });
          }
        } catch (err) {
          chrome.runtime.sendMessage({ action: "open_sidepanel" });
        }
        window.close();
      });
    }
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab || !tab.url) return;
      try {
        const url = new URL(tab.url);
        if (url.protocol !== "http:" && url.protocol !== "https:") {
          const toggle2 = document.getElementById("site-toggle");
          if (toggle2) toggle2.disabled = true;
          const siteName2 = document.getElementById("site-name");
          if (siteName2) siteName2.textContent = "Not supported";
          return;
        }
        const currentHostname = url.hostname;
        const siteName = document.getElementById("site-name");
        if (siteName) siteName.textContent = currentHostname;
        chrome.storage.local.get(["disabledDomains"], (items) => {
          const disabledDomains = items.disabledDomains || [];
          const isEnabled = !disabledDomains.includes(currentHostname);
          const toggle2 = document.getElementById("site-toggle");
          if (toggle2) toggle2.checked = isEnabled;
        });
        const toggle = document.getElementById("site-toggle");
        if (toggle) {
          toggle.addEventListener("change", () => {
            const isEnabled = toggle.checked;
            chrome.storage.local.get(["disabledDomains"], (items) => {
              let disabledDomains = items.disabledDomains || [];
              if (isEnabled) {
                disabledDomains = disabledDomains.filter((domain) => domain !== currentHostname);
              } else {
                if (!disabledDomains.includes(currentHostname)) {
                  disabledDomains.push(currentHostname);
                }
              }
              chrome.storage.local.set({ disabledDomains }, () => {
                chrome.tabs.sendMessage(tab.id, {
                  action: "toggle_extension_state",
                  isEnabled
                }).catch(() => {
                });
              });
            });
          });
        }
      } catch (e) {
      }
    });
  });
})();
