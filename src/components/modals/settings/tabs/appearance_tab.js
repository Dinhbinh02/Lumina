export function bindAppearanceTab(modal) {
  const themeBtns = document.querySelectorAll('.lumina-theme-option-btn');
  themeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const theme = btn.getAttribute('data-theme');
      themeBtns.forEach(b => b.classList.toggle('active', b === btn));
      chrome.storage.local.set({ theme });
      document.documentElement.setAttribute('data-theme', theme);
      document.body.setAttribute('data-theme', theme);
    });
  });

  const contrastSelect = document.getElementById('lumina-settings-contrast');
  if (contrastSelect) {
    contrastSelect.addEventListener('change', (e) => {
      const contrast = e.target.value;
      chrome.storage.local.set({ contrast });
      if (contrast === 'high') {
        document.documentElement.setAttribute('data-contrast', 'high');
      } else {
        document.documentElement.removeAttribute('data-contrast');
      }
    });
  }

  const accentBtns = document.querySelectorAll('.lumina-accent-color-btn');
  accentBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const accent = btn.getAttribute('data-accent');
      accentBtns.forEach(b => b.classList.toggle('active', b === btn));
      chrome.storage.local.set({ accentColor: accent });
      document.documentElement.setAttribute('data-accent', accent);
    });
  });

  const fontFamilySelect = document.getElementById('lumina-settings-font-family');
  if (fontFamilySelect) {
    fontFamilySelect.addEventListener('change', (e) => {
      const fontFamily = e.target.value;
      chrome.storage.local.set({ fontFamily });
      document.documentElement.style.setProperty('--lumina-font-family', fontFamily);
    });
  }
}
