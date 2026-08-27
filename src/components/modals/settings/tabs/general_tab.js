export function bindGeneralTab(modal) {
  const fontSizeSelect = document.getElementById('lumina-settings-font-size');
  if (fontSizeSelect) {
    fontSizeSelect.addEventListener('change', (e) => {
      chrome.storage.local.set({ fontSize: e.target.value });
      document.documentElement.style.setProperty('--lumina-fontSize', e.target.value);
    });
  }

  const responseLangSelect = document.getElementById('lumina-settings-response-lang');
  if (responseLangSelect) {
    responseLangSelect.addEventListener('change', (e) => {
      chrome.storage.local.set({ responseLanguage: e.target.value });
    });
  }

  const historyRetention = document.getElementById('lumina-settings-history-retention');
  if (historyRetention) {
    historyRetention.addEventListener('change', (e) => {
      chrome.storage.local.set({ historyRetentionMonths: parseInt(e.target.value, 10) });
    });
  }
}
