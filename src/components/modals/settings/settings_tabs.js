export function bindGeneralTab(modal) {
  const fontSizeSelect = document.getElementById('nexus-settings-font-size');
  if (fontSizeSelect) {
    fontSizeSelect.addEventListener('change', (e) => {
      document.documentElement.style.setProperty('--nexus-fontSize', e.target.value);
      chrome.storage.local.set({ fontSize: e.target.value });
    });
  }

  const responseLangSelect = document.getElementById('nexus-settings-response-lang');
  if (responseLangSelect) {
    responseLangSelect.addEventListener('change', (e) => {
      chrome.storage.local.set({ defaultResponseLanguage: e.target.value });
    });
  }

  const historyRetentionSelect = document.getElementById('nexus-settings-history-retention');
  if (historyRetentionSelect) {
    historyRetentionSelect.addEventListener('change', (e) => {
      chrome.storage.local.set({ historyRetentionDays: parseInt(e.target.value, 10) || 30 });
    });
  }
}

export function bindAppearanceTab(modal) {
  const themeRadios = document.querySelectorAll('input[name="nexus-theme"]');
  themeRadios.forEach((radio) => {
    radio.addEventListener('change', (e) => {
      const theme = e.target.value;
      document.documentElement.setAttribute('data-theme', theme);
      chrome.storage.local.set({ theme });
    });
  });

  const highContrastToggle = document.getElementById('nexus-settings-high-contrast');
  if (highContrastToggle) {
    highContrastToggle.addEventListener('change', (e) => {
      document.documentElement.classList.toggle('high-contrast', e.target.checked);
      chrome.storage.local.set({ highContrast: e.target.checked });
    });
  }

  const accentColorPickers = document.querySelectorAll('.nexus-accent-color-btn');
  accentColorPickers.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const accent = e.currentTarget.dataset.accent;
      if (accent) {
        document.documentElement.setAttribute('data-accent', accent);
        chrome.storage.local.set({ accentColor: accent });
      }
    });
  });

  const fontFamilySelect = document.getElementById('nexus-settings-font-family');
  if (fontFamilySelect) {
    fontFamilySelect.addEventListener('change', (e) => {
      document.documentElement.style.setProperty('--nexus-font-family', e.target.value);
      chrome.storage.local.set({ fontFamily: e.target.value });
    });
  }
}

export function bindPersonalizationTab(modal) {
  const toneSelect = document.getElementById('nexus-settings-ai-tone');
  if (toneSelect) {
    toneSelect.addEventListener('change', (e) => {
      chrome.storage.local.set({ aiTone: e.target.value });
    });
  }

  const customInstructionsArea = document.getElementById('nexus-settings-custom-instructions');
  if (customInstructionsArea) {
    customInstructionsArea.addEventListener('input', (e) => {
      chrome.storage.local.set({ customInstructions: e.target.value });
    });
  }

  const clearFactsBtn = document.getElementById('nexus-clear-user-facts-btn');
  if (clearFactsBtn) {
    clearFactsBtn.addEventListener('click', async () => {
      if (confirm('Clear all learned user facts and memory?')) {
        chrome.storage.local.remove(['nexus_user_facts'], () => {
          alert('User memory cleared successfully.');
        });
      }
    });
  }
}

export function bindKeyboardTab(modal) {
  const resetShortcutsBtn = document.getElementById('nexus-reset-shortcuts-btn');
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
  const syncNowBtn = document.getElementById('nexus-drive-sync-now-btn');
  if (syncNowBtn) {
    syncNowBtn.addEventListener('click', async () => {
      syncNowBtn.disabled = true;
      syncNowBtn.textContent = 'Syncing...';
      try {
        if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
          chrome.runtime.sendMessage({ action: 'nexus_drive_sync' }, (res) => {
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
