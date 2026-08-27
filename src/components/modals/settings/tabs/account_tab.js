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
      } catch (err) {
        syncNowBtn.disabled = false;
        syncNowBtn.textContent = 'Sync Now';
      }
    });
  }
}
