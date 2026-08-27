export function bindGeneralTab(modal) {
  const fontSizeSelect = document.getElementById('lumina-settings-font-size');
  if (fontSizeSelect) {
    fontSizeSelect.addEventListener('change', (e) => {
      document.documentElement.style.setProperty('--lumina-fontSize', e.target.value);
      chrome.storage.local.set({ fontSize: e.target.value });
    });
  }

  const responseLangSelect = document.getElementById('lumina-settings-response-lang');
  if (responseLangSelect) {
    responseLangSelect.addEventListener('change', (e) => {
      chrome.storage.local.set({ defaultResponseLanguage: e.target.value });
    });
  }

  const historyRetentionSelect = document.getElementById('lumina-settings-history-retention');
  if (historyRetentionSelect) {
    historyRetentionSelect.addEventListener('change', (e) => {
      chrome.storage.local.set({ historyRetentionDays: parseInt(e.target.value, 10) || 30 });
    });
  }
}

export function bindAppearanceTab(modal) {
  const themeRadios = document.querySelectorAll('input[name="lumina-theme"]');
  themeRadios.forEach((radio) => {
    radio.addEventListener('change', (e) => {
      const theme = e.target.value;
      document.documentElement.setAttribute('data-theme', theme);
      chrome.storage.local.set({ theme });
    });
  });

  const highContrastToggle = document.getElementById('lumina-settings-high-contrast');
  if (highContrastToggle) {
    highContrastToggle.addEventListener('change', (e) => {
      document.documentElement.classList.toggle('high-contrast', e.target.checked);
      chrome.storage.local.set({ highContrast: e.target.checked });
    });
  }

  const accentColorPickers = document.querySelectorAll('.lumina-accent-color-btn');
  accentColorPickers.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const accent = e.currentTarget.dataset.accent;
      if (accent) {
        document.documentElement.setAttribute('data-accent', accent);
        chrome.storage.local.set({ accentColor: accent });
      }
    });
  });

  const fontFamilySelect = document.getElementById('lumina-settings-font-family');
  if (fontFamilySelect) {
    fontFamilySelect.addEventListener('change', (e) => {
      document.documentElement.style.setProperty('--lumina-font-family', e.target.value);
      chrome.storage.local.set({ fontFamily: e.target.value });
    });
  }
}

export function bindPersonalizationTab(modal) {
  const toneSelect = document.getElementById('lumina-settings-ai-tone');
  if (toneSelect) {
    toneSelect.addEventListener('change', (e) => {
      chrome.storage.local.set({ aiTone: e.target.value });
    });
  }

  const customInstructionsArea = document.getElementById('lumina-settings-custom-instructions');
  if (customInstructionsArea) {
    customInstructionsArea.addEventListener('input', (e) => {
      chrome.storage.local.set({ customInstructions: e.target.value });
    });
  }

  const clearFactsBtn = document.getElementById('lumina-clear-user-facts-btn');
  if (clearFactsBtn) {
    clearFactsBtn.addEventListener('click', async () => {
      if (confirm('Clear all learned user facts and memory?')) {
        chrome.storage.local.remove(['lumina_user_facts'], () => {
          alert('User memory cleared successfully.');
        });
      }
    });
  }
}

export function bindKeyboardTab(modal) {
  const resetShortcutsBtn = document.getElementById('lumina-reset-shortcuts-btn');
  if (resetShortcutsBtn) {
    resetShortcutsBtn.addEventListener('click', () => {
      if (confirm('Reset all shortcuts to default settings?')) {
        chrome.storage.local.remove(['shortcuts', 'questionMappings', 'annotationShortcuts'], () => {
          modal.loadSettings();
        });
      }
    });
  }
}

export function bindAccountTab(modal) {
  const syncNowBtn = document.getElementById('lumina-drive-sync-now-btn');
  if (syncNowBtn) {
    syncNowBtn.addEventListener('click', async () => {
      syncNowBtn.disabled = true;
      syncNowBtn.textContent = 'Syncing...';
      try {
        if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
          chrome.runtime.sendMessage({ action: 'lumina_drive_sync' }, (res) => {
            syncNowBtn.disabled = false;
            syncNowBtn.textContent = 'Sync Now';
            if (res && res.success) {
              alert('Drive sync completed successfully.');
            } else {
              alert('Drive sync failed: ' + (res?.error || 'Unknown error'));
            }
          });
        }
      } catch (_) {
        syncNowBtn.disabled = false;
        syncNowBtn.textContent = 'Sync Now';
      }
    });
  }
}
