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
