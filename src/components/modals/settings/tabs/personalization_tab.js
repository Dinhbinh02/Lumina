import { UserMemory } from '../../../../core/ai/memory.js';

export function bindPersonalizationTab(modal) {
  const toneBtns = document.querySelectorAll('.lumina-tone-btn');
  toneBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      toneBtns.forEach(b => b.classList.toggle('active', b === btn));
      chrome.storage.local.set({ baseTone: btn.getAttribute('data-tone') });
    });
  });

  ['aboutNickname', 'aboutOccupation', 'aboutInterests'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', () => {
        chrome.storage.local.set({ [id]: el.value });
      });
    }
  });

  const clearMemoryBtn = document.getElementById('lumina-clear-memory-btn');
  if (clearMemoryBtn) {
    clearMemoryBtn.addEventListener('click', async () => {
      if (confirm('Clear all learned user facts and memory?')) {
        await UserMemory.save({ facts: [] });
        modal.userFacts = [];
        modal.renderUserFacts();
      }
    });
  }
}
