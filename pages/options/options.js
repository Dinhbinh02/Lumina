document.addEventListener('DOMContentLoaded', () => {
  const applyTheme = (theme) => {
    let mode = theme;
    if (theme === 'auto') {
      mode = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', mode);
  };


  chrome.storage.local.get(['theme'], (result) => {
    applyTheme(result.theme || 'auto');
  });

  // Global state for model lists
  let availableModels = [];
  let availableVoiceModels = [];
  let availableDictModels = [];

  // Sidebar Navigation Logic
  const sidebarNavItems = document.querySelectorAll('.sidebar-nav-item');
  const contentSections = document.querySelectorAll('.content-section');
  let currentActiveSectionId = null;
  let isInitialLoad = true; // Flag to prevent scroll overrides during startup

  function switchSection(sectionId, restoreScroll = false) {
    if (currentActiveSectionId === sectionId) return;

    // Show selected section
    const targetSection = document.getElementById(sectionId);
    if (!targetSection) {
      console.warn(`Section not found: ${sectionId}`);
      return;
    }

    // Hide all sections
    contentSections.forEach(section => {
      section.classList.remove('active');
    });

    // Remove active state from all nav items
    sidebarNavItems.forEach(item => {
      item.classList.remove('active');
    });

    targetSection.classList.add('active');
    currentActiveSectionId = sectionId;

    // Highlight active nav item
    const activeNavItem = document.querySelector(`[data-section="${sectionId}"]`);
    if (activeNavItem) {
      activeNavItem.classList.add('active');
    }

    // Scroll content area
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
      if (!restoreScroll) {
        mainContent.scrollTop = 0;
      }
    }

    // Persist active section
    chrome.storage.local.set({ optionsLastSection: sectionId });
  }

  // Save scroll position with debounce
  const mainContent = document.querySelector('.main-content');
  let scrollSaveTimer = null;
  if (mainContent) {
    mainContent.addEventListener('scroll', () => {
      // Don't save if we're in the middle of a section switch or initial load
      if (isInitialLoad) return;

      clearTimeout(scrollSaveTimer);
      scrollSaveTimer = setTimeout(() => {
        // We now store scroll position PER section to be more robust
        if (currentActiveSectionId) {
          chrome.storage.local.get(['optionsScrollPositions'], (result) => {
            const positions = result.optionsScrollPositions || {};
            positions[currentActiveSectionId] = mainContent.scrollTop;
            chrome.storage.local.set({
              optionsScrollPositions: positions,
              optionsLastScroll: mainContent.scrollTop // Keep global one for compatibility
            });
          });
        }
      }, 150);
    });
  }

  // Add click listeners to sidebar navigation items
  sidebarNavItems.forEach(item => {
    item.addEventListener('click', () => {
      const sectionId = item.getAttribute('data-section');
      if (sectionId) {
        switchSection(sectionId);
      }
    });
  });

  // Function to perform the actual restoration once content is ready
  function restoreLastSessionState() {
    chrome.storage.local.get(['optionsLastSection', 'optionsLastScroll', 'optionsScrollPositions'], (saved) => {
      const lastSection = saved.optionsLastSection || 'general';
      const positions = saved.optionsScrollPositions || {};
      const lastScroll = positions[lastSection] !== undefined ? positions[lastSection] : (saved.optionsLastScroll || 0);

      const targetSection = document.getElementById(lastSection);
      if (targetSection) {
        switchSection(lastSection, true);

        // Restore scroll after layout stabilizes
        const mc = document.querySelector('.main-content');
        if (mc && lastScroll > 0) {
          // Attempt multiple times as content might expand gradually
          const applyScroll = () => {
            if (mc.scrollTop !== lastScroll) {
              mc.scrollTop = lastScroll;
            }
          };

          // Immediate restore
          applyScroll();

          // Double RAF to ensure browser has painted the dynamic content
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              applyScroll();
              // One more attempt after short delays for heavy sections (like web sources)
              setTimeout(applyScroll, 50);
              setTimeout(applyScroll, 200);
              setTimeout(applyScroll, 500);
              setTimeout(applyScroll, 1000);
            });
          });
        }
      }
    });
  }

  // Run initial restore (will be called again after async data loads to ensure accuracy)
  restoreLastSessionState();

  // --- Anki Management Logic ---
  const checkAnkiConnBtn = document.getElementById('checkAnkiConnBtn');
  const openAnkiMgtBtn = document.getElementById('openAnkiMgtBtn');
  const addToAnkiBtn = document.getElementById('addToAnkiBtn');
  const ankiQuickNote = document.getElementById('ankiQuickNote');

  const clearAnkiNoteBtn = document.getElementById('clearAnkiNoteBtn');

  // Load saved note on startup
  chrome.storage.local.get(['ankiQuickNoteContent'], (result) => {
    if (ankiQuickNote) {
      if (result.ankiQuickNoteContent) {
        ankiQuickNote.value = result.ankiQuickNoteContent;
      }
      // Update count badge after setting value
      if (typeof updateQuickNoteCount === 'function') {
        updateQuickNoteCount();
      }
    }
  });

  // Auto-save note on input
  if (ankiQuickNote) {
    const ankiQuickNoteCountEl = document.getElementById('ankiQuickNoteCount');

    function computeQuickNoteCount(text) {
      if (!text) return 0;
      const parts = text.split(/[,\n]+/).map(s => s.trim()).filter(Boolean);
      return parts.length;
    }

    function updateQuickNoteCount() {
      if (!ankiQuickNoteCountEl || !ankiQuickNote) return;
      const n = computeQuickNoteCount(ankiQuickNote.value);
      ankiQuickNoteCountEl.textContent = n + (n === 1 ? ' card' : ' cards');
    }

    ankiQuickNote.addEventListener('input', () => {
      chrome.storage.local.set({ ankiQuickNoteContent: ankiQuickNote.value });
      updateQuickNoteCount();
    });
    // initialize count on load
    updateQuickNoteCount();

    // --- Automatic Paste Handling for Anki Management ---
    document.addEventListener('paste', (e) => {
      // If we're typing in ANOTHER input/textarea (like API keys), don't hijack the paste
      if (e.target.tagName === 'INPUT' || (e.target.tagName === 'TEXTAREA' && e.target !== ankiQuickNote)) {
        return;
      }

      const text = (e.clipboardData || window.clipboardData).getData('text');
      if (!text) return;

      // Automatically switch to Anki Management if not already there
      const activeSection = document.querySelector('.content-section.active');
      if (activeSection && activeSection.id !== 'anki-management') {
        if (typeof switchSection === 'function') {
          switchSection('anki-management');
        }
      }

      e.preventDefault();

      const currentValue = ankiQuickNote.value;
      const needsLeadingNewline = (currentValue && !currentValue.endsWith('\n'));
      const textToInsert = (needsLeadingNewline ? '\n' : '') + text + '\n';

      // 1. Place cursor at the absolute end
      ankiQuickNote.focus();
      const len = ankiQuickNote.value.length;
      ankiQuickNote.setSelectionRange(len, len);

      // 2. Use execCommand to insert text — this preserves the UNDO stack (Ctrl/Cmd+Z)
      // and automatically triggers the 'input' event which saves to storage.
      document.execCommand('insertText', false, textToInsert);
    });
  }

  if (clearAnkiNoteBtn) {
    clearAnkiNoteBtn.addEventListener('click', () => {
      if (ankiQuickNote) {
        ankiQuickNote.value = '';
        chrome.storage.local.set({ ankiQuickNoteContent: '' });
        const ankiQuickNoteCountEl = document.getElementById('ankiQuickNoteCount');
        if (ankiQuickNoteCountEl) ankiQuickNoteCountEl.textContent = '0 cards';
      }
    });
  }

  if (checkAnkiConnBtn) {
    checkAnkiConnBtn.addEventListener('click', async () => {
      checkAnkiConnBtn.textContent = 'Checking...';
      try {
        const response = await fetch('http://127.0.0.1:8765', {
          method: 'POST',
          body: JSON.stringify({ action: 'version', version: 6 })
        });
        const result = await response.json();
        if (result.result) {
          checkAnkiConnBtn.textContent = '✅ Connected';
          checkAnkiConnBtn.style.color = '#28a745';
        } else {
          throw new Error('Invalid response');
        }
      } catch (e) {
        checkAnkiConnBtn.textContent = '❌ Failed to connect';
        checkAnkiConnBtn.style.color = '#dc3545';
      }
      setTimeout(() => {
        checkAnkiConnBtn.textContent = 'Check Connection';
        checkAnkiConnBtn.style.color = '';
      }, 3000);
    });
  }

  if (openAnkiMgtBtn) {
    openAnkiMgtBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: 'pages/anki/anki.html' });
    });
  }

  if (addToAnkiBtn) {
    addToAnkiBtn.addEventListener('click', () => {
      const words = ankiQuickNote.value.trim();
      if (!words) {
        alert('Please enter some words first.');
        return;
      }
      // Store in localStorage for anki.html to pick up
      localStorage.setItem('lumina_pending_words', words);
      // Open Anki Management on Generator tab
      chrome.tabs.create({ url: 'pages/anki/anki.html?tab=generator' });
    });
  }

  // Open Web App (now opens Sidepanel)
  const openSpotlightWebAppBtn = document.getElementById('openSpotlightWebAppBtn');
  if (openSpotlightWebAppBtn) {
    openSpotlightWebAppBtn.addEventListener('click', () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0] && chrome.sidePanel && typeof chrome.sidePanel.open === 'function') {
          chrome.sidePanel.open({ tabId: tabs[0].id });
        } else {
          // Fallback to standalone web app if sidepanel open is not supported
          chrome.tabs.create({ url: chrome.runtime.getURL('pages/spotlight/spotlight.html') + '?webapp=1' });
        }
      });
    });
  }

  // Open Lumina Play
  const openLuminaPlayBtn = document.getElementById('openLuminaPlayBtn');
  if (openLuminaPlayBtn) {
    openLuminaPlayBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: 'https://lumina-play.vercel.app/' });
    });
  }

  // Utilities
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Initialize: show first section by default (already has active class in HTML)

  const providerSelect = document.getElementById('provider');
  const modelInput = document.getElementById('model');
  const modelList = document.getElementById('modelList');


  // Define mappings elements globally for scope access
  const mappingsList = document.getElementById('questionMappingsList');
  const addMappingBtn = document.getElementById('addMappingBtn');
  const voiceProviderInput = document.getElementById('voiceProvider');
  const voiceProviderList = document.getElementById('voiceProviderList');
  const voiceModelInput = document.getElementById('voiceModel');
  const voiceModelList = document.getElementById('voiceModelList');

  const dictProviderInput = document.getElementById('dictProvider');
  const dictProviderList = document.getElementById('dictProviderList');
  const dictModelInput = document.getElementById('dictModel');
  const dictModelList = document.getElementById('dictModelList');


  const fontSizeInput = document.getElementById('fontSize');
  const decreaseFontSizeBtn = document.getElementById('decreaseFontSize');
  const increaseFontSizeBtn = document.getElementById('increaseFontSize');
  const askSelectionPopupBtn = document.getElementById('askSelectionPopupBtn');
  let isAskSelectionPopupEnabled = true;
  const statusDiv = document.getElementById('status');
  const siteToggle = document.getElementById('siteToggle');
  const siteToggleLabel = document.getElementById('siteToggleLabel');
  const deepLApiKeyInput = document.getElementById('deepLApiKey');
  const temperatureInput = document.getElementById('temperature');
  const temperatureValue = document.getElementById('temperatureValue');
  const topPInput = document.getElementById('topP');
  const topPValue = document.getElementById('topPValue');
  const customParamsList = document.getElementById('customParamsList');
  const addCustomParamBtn = document.getElementById('addCustomParamBtn');
  const audioSpeedInput = document.getElementById('audioSpeed');
  const audioSpeedValue = document.getElementById('audioSpeedValue');
  const autoAudioCheckbox = document.getElementById('autoAudio');
  const googleClientIdInput = document.getElementById('googleClientId');
  const githubClientIdInput = document.getElementById('githubClientId');


  // Provider Management elements
  const providerListEl = document.getElementById('providerList');
  const addProviderBtn = document.getElementById('addProviderBtn');
  const providerForm = document.getElementById('providerForm');
  const providerFormId = document.getElementById('providerFormId');
  const providerFormName = document.getElementById('providerFormName');
  const providerFormType = document.getElementById('providerFormType');
  const providerFormEndpoint = document.getElementById('providerFormEndpoint');
  const providerFormApiKey = document.getElementById('providerFormApiKey');
  const cancelProviderBtn = document.getElementById('cancelProviderBtn');
  const saveProviderBtn = document.getElementById('saveProviderBtn');




  // Audio Speed Listener
  if (audioSpeedInput) {
    audioSpeedInput.addEventListener('change', () => {
      saveOptions();
    });
    audioSpeedInput.addEventListener('input', () => {
      let value = audioSpeedInput.value.replace(',', '.');
      if (value.includes('.')) {
        const parts = value.split('.');
        if (parts[1].length > 2) {
          audioSpeedInput.value = parts[0] + '.' + parts[1].slice(0, 2);
        }
      }
      // Just save on every input for numbers
      debounce(saveOptions, 500)();
    });

    audioSpeedInput.addEventListener('blur', () => {
      let rawValue = audioSpeedInput.value.replace(',', '.');
      let val = parseFloat(rawValue);

      if (isNaN(val) || rawValue === '') {
        audioSpeedInput.value = '1.00';
      } else {
        if (val < 0.5) val = 0.5;
        if (val > 3.0) val = 3.0;
        audioSpeedInput.value = val.toFixed(2);
      }
      saveOptions();
    });
  }

  if (autoAudioCheckbox) {
    autoAudioCheckbox.addEventListener('change', saveOptions);
  }
  // -----------------------------------------
  let providers = [];

  let currentHostname = '';
  const isMac = navigator.userAgent.toUpperCase().includes('MAC');

  // Function to apply domain-specific settings (overrides global defaults)
  function applyDomainSpecificSettings() {
    // We want the tab that was active BEFORE/UNDERNEATH the options page
    // If we're a popup or a dialog, {active: true, currentWindow: true} works.
    // If we're in a full tab, we might need to look at other tabs.
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      let targetTab = (tabs && tabs.length > 0) ? tabs[0] : null;

      // Heuristic: If the "active" tab is ourselves, try to find a real website
      if (targetTab && targetTab.url.startsWith('chrome-extension://')) {
        chrome.tabs.query({ lastFocusedWindow: true }, (allTabs) => {
          // Find the first tab that isn't an extension or internal page
          const realTab = allTabs.find(t => t.url && !t.url.startsWith('chrome-extension://') && !t.url.startsWith('chrome://'));
          if (realTab) {
            setupHostnameSettings(realTab.url);
          } else {
            // Revert labels to "Default" if no specific site found
            // Labels removed in HTML as per user request
          }
        });
      } else if (targetTab && targetTab.url) {
        setupHostnameSettings(targetTab.url);
      }
    });
  }

  function setupHostnameSettings(urlStr) {
    try {
      const url = new URL(urlStr);
      currentHostname = url.hostname;

      chrome.storage.local.get(['disabledDomains'], (items) => {
        const disabledDomains = items.disabledDomains || [];
        const isEnabled = !disabledDomains.includes(currentHostname);

        siteToggle.checked = isEnabled;
        siteToggleLabel.textContent = currentHostname;
      });
    } catch (e) {
      siteToggle.disabled = true;
      siteToggleLabel.textContent = 'Not available';
    }
  }

  // Trigger hostname detection immediately
  applyDomainSpecificSettings();

  siteToggle.addEventListener('change', () => {
    if (!currentHostname) return;

    const isEnabled = siteToggle.checked;
    siteToggleLabel.textContent = currentHostname;

    chrome.storage.local.get(['disabledDomains'], (items) => {
      let disabledDomains = items.disabledDomains || [];

      if (isEnabled) {
        // Remove from disabled list
        disabledDomains = disabledDomains.filter(domain => domain !== currentHostname);
      } else {
        // Add to disabled list
        if (!disabledDomains.includes(currentHostname)) {
          disabledDomains.push(currentHostname);
        }
      }

      chrome.storage.local.set({ disabledDomains: disabledDomains }, () => {
        // Notify content script
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs && tabs.length > 0) {
            chrome.tabs.sendMessage(tabs[0].id, {
              action: 'toggle_extension_state',
              isEnabled: isEnabled
            });
          }
        });
      });
    });
  });

  // Helper functions
  function updateStatus(message, type = 'info') {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
    statusDiv.style.display = 'block';
    setTimeout(() => {
      statusDiv.style.display = 'none';
    }, 3000);
  }

  const PROVIDERS = LUMINA_PROVIDERS;

  // Render provider list
  function renderProviders() {
    if (!providerListEl) return;

    // Move form back to original container before clearing innerHTML
    // to prevent the element from being destroyed
    const originalParent = providerListEl.parentElement;
    if (originalParent && providerForm) {
      originalParent.appendChild(providerForm);
    }

    providerListEl.innerHTML = '';

    providers.forEach(p => {
      const isDefault = p.id === 'groq-default' || p.id === 'gemini-default' || p.id === 'cerebras-default' || p.id === 'mistral-default' || p.id === 'openrouter-default';
      const badge = isDefault ? 'default' : 'custom';
      const badgeClass = isDefault ? 'provider-item-badge-default' : 'provider-item-badge-custom';

      const template = document.getElementById('providerItemTemplate');
      const clone = template.content.cloneNode(true);
      const item = clone.querySelector('.provider-item');

      item.dataset.id = p.id;
      item.querySelector('.provider-item-name').textContent = p.name;
      item.querySelector('.provider-item-endpoint').textContent = p.endpoint;

      const badgeEl = item.querySelector('.provider-badge');
      badgeEl.textContent = badge;
      badgeEl.classList.add(badgeClass);

      item.querySelector('.provider-edit-btn').addEventListener('click', () => editProvider(p.id));

      const deleteBtn = item.querySelector('.provider-delete-btn');
      if (isDefault) {
        deleteBtn.remove();
      } else {
        deleteBtn.addEventListener('click', () => deleteProvider(p.id));
      }

      providerListEl.appendChild(clone);
    });
  }

  // Populate provider dropdowns (Text AI, Vision AI)
  function populateProviderDropdowns() {
    // Text AI provider dropdown
    if (providerSelect) {
      const currentVal = providerSelect.value;
      providerSelect.innerHTML = '';
      providers.forEach(p => {
        providerSelect.innerHTML += `<option value="${p.id}">${escapeHtml(p.name)}</option>`;
      });
      if (currentVal && providers.find(p => p.id === currentVal)) {
        providerSelect.value = currentVal;
      } else if (providers.length > 0) {
        providerSelect.value = providers[0].id;
      }
    }

  }

  // Show add provider form
  function showAddProviderForm() {
    providerFormId.value = '';
    providerFormName.value = '';
    providerFormType.value = 'openai';
    providerFormEndpoint.value = '';
    providerFormApiKey.value = '';

    // Hide Get API Key link for new provider
    const apiKeyLink = document.getElementById('providerApiKeyLink');
    if (apiKeyLink) apiKeyLink.classList.add('hidden');

    // Move form back to original container if it was inside an item
    const originalParent = providerListEl.parentElement;
    if (originalParent) originalParent.appendChild(providerForm);

    providerForm.classList.remove('hidden');
    addProviderBtn.classList.add('hidden');
    providerFormName.focus();
  }

  // Edit provider
  function editProvider(id) {
    const provider = providers.find(p => p.id === id);
    if (!provider) return;

    providerFormId.value = provider.id;
    providerFormName.value = provider.name;
    providerFormType.value = provider.type;
    providerFormEndpoint.value = provider.endpoint;
    providerFormApiKey.value = provider.apiKey || '';

    // Show Get API Key link if it's a default provider
    const apiKeyLink = document.getElementById('providerApiKeyLink');
    if (apiKeyLink) {
      let linkUrl = null;

      // Check default IDs or partial matches
      if (id === 'groq-default' && PROVIDERS.groq) linkUrl = PROVIDERS.groq.link;
      else if (id === 'gemini-default' && PROVIDERS.gemini) linkUrl = PROVIDERS.gemini.link;
      else if (id.includes('openrouter') && PROVIDERS.openrouter) linkUrl = PROVIDERS.openrouter.link;
      else if (id === 'cerebras-default' && PROVIDERS.cerebras) linkUrl = PROVIDERS.cerebras.link;
      else if (id === 'mistral-default' && PROVIDERS.mistral) linkUrl = PROVIDERS.mistral.link;

      if (linkUrl) {
        apiKeyLink.href = linkUrl;
        apiKeyLink.classList.remove('hidden');
      } else {
        apiKeyLink.classList.add('hidden');
      }
    }

    // Inline editing logic: move form into the item
    const item = providerListEl.querySelector(`.provider-item[data-id="${id}"]`);
    if (item) {
      // Hide all other item contents to avoid clutter (optional, but requested/implied)
      providerListEl.querySelectorAll('.provider-item-content').forEach(c => c.classList.remove('hidden'));

      const content = item.querySelector('.provider-item-content');
      const formContainer = item.querySelector('.provider-item-form-container');

      if (content && formContainer) {
        content.classList.add('hidden');
        formContainer.appendChild(providerForm);
        providerForm.classList.remove('hidden');
      }
    }

    addProviderBtn.classList.add('hidden');
    providerFormName.focus();
  }

  // Save provider (add or update)
  function saveProvider() {
    const id = providerFormId.value || Date.now().toString();
    const name = providerFormName.value.trim();
    const type = providerFormType.value;
    const endpoint = providerFormEndpoint.value.trim();
    const apiKey = providerFormApiKey.value.trim();

    if (!name || !endpoint) {
      alert('Please fill in Name and Endpoint URL');
      return;
    }

    const existingIndex = providers.findIndex(p => p.id === id);
    const providerData = { id, name, type, endpoint, apiKey };

    if (existingIndex >= 0) {
      providers[existingIndex] = providerData;
    } else {
      providers.push(providerData);
    }

    // Save to storage
    chrome.storage.local.set({ providers }, () => {
      renderProviders();
      populateProviderDropdowns();
      hideProviderForm();
    });
  }

  // Delete provider
  function deleteProvider(id) {
    // Prevent deleting default providers
    if (id === 'groq-default' || id === 'gemini-default' || id === 'cerebras-default' || id === 'mistral-default' || id === 'openrouter-default') {
      alert('Cannot delete default providers. You can edit them to change API keys.');
      return;
    }

    if (!confirm('Delete this provider?')) return;

    providers = providers.filter(p => p.id !== id);
    chrome.storage.local.set({ providers }, () => {
      renderProviders();
      populateProviderDropdowns();
    });
  }

  // Hide provider form
  function hideProviderForm() {
    // Show all item contents and reset form placeholders
    providerListEl.querySelectorAll('.provider-item-content').forEach(c => c.classList.remove('hidden'));

    // Move form back to original container
    const originalParent = providerListEl.parentElement;
    if (originalParent) originalParent.appendChild(providerForm);

    providerForm.classList.add('hidden');
    addProviderBtn.classList.remove('hidden');
  }

  async function initializeProviders() {
    const result = await chrome.storage.local.get(['providers']);

    const defaultProviders = [
      {
        id: 'cerebras-default',
        name: 'Cerebras',
        type: 'openai',
        endpoint: 'https://api.cerebras.ai/v1/chat/completions',
        apiKey: ''
      },
      {
        id: 'mistral-default',
        name: 'Mistral',
        type: 'openai',
        endpoint: 'https://api.mistral.ai/v1/chat/completions',
        apiKey: ''
      },
      {
        id: 'gemini-default',
        name: 'Gemini',
        type: 'openai',
        endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
        apiKey: ''
      },
      {
        id: 'openrouter-default',
        name: 'OpenRouter',
        type: 'openai',
        endpoint: 'https://openrouter.ai/api/v1/chat/completions',
        apiKey: ''
      },
      {
        id: 'groq-default',
        name: 'Groq',
        type: 'openai',
        endpoint: 'https://api.groq.com/openai/v1/chat/completions',
        apiKey: ''
      }
    ];

    let currentProviders = Array.isArray(result.providers) ? result.providers : [];

    if (currentProviders.length === 0) {
      currentProviders = defaultProviders;
    } else {
      defaultProviders.forEach((def) => {
        if (!currentProviders.some(p => p.id === def.id)) {
          currentProviders.push(def);
        }
      });
    }

    currentProviders.sort((a, b) => a.name.localeCompare(b.name));
    providers = currentProviders;
    await chrome.storage.local.set({ providers: currentProviders });
  }

  // Get provider by ID
  function getProviderById(id) {
    return providers.find(p => p.id === id);
  }

  // Provider Management event listeners
  if (addProviderBtn) {
    addProviderBtn.addEventListener('click', showAddProviderForm);
  }
  if (cancelProviderBtn) {
    cancelProviderBtn.addEventListener('click', hideProviderForm);
  }
  if (saveProviderBtn) {
    saveProviderBtn.addEventListener('click', saveProvider);
  }

  // Check API Keys functionality
  const checkApiKeysBtn = document.getElementById('checkApiKeysBtn');
  const apiKeyResults = document.getElementById('apiKeyResults');
  const apiKeyResultsList = document.getElementById('apiKeyResultsList');

  if (checkApiKeysBtn) {
    checkApiKeysBtn.addEventListener('click', async () => {
      checkApiKeysBtn.disabled = true;
      checkApiKeysBtn.textContent = '⏳ Checking...';
      apiKeyResults.classList.remove('hidden');
      apiKeyResultsList.innerHTML = '<div style="color: var(--text-secondary); font-size: 12px;">Checking all providers...</div>';

      const results = [];

      for (const provider of providers) {
        if (!provider.apiKey || provider.apiKey.trim() === '') {
          results.push({
            name: provider.name,
            status: 'skip',
            message: 'No API key configured'
          });
          continue;
        }

        try {
          const keys = provider.apiKey.split(',').map(k => k.trim()).filter(k => k);
          let anyKeyWorks = false;
          let failedKeys = [];

          for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            // Show first 8 and last 4 chars of key for identification
            const keyDisplay = key.length > 16 ? `${key.substring(0, 8)}...${key.substring(key.length - 4)}` : key;

            try {
              let testUrl, headers;

              if (provider.type === 'gemini') {
                // Gemini uses query param for auth
                const baseUrl = provider.endpoint.includes('/models')
                  ? provider.endpoint.split('/models')[0] + '/models'
                  : 'https://generativelanguage.googleapis.com/v1beta/models';
                testUrl = `${baseUrl}?key=${key}`;
                headers = {};
              } else {
                // OpenAI-compatible uses Bearer token
                testUrl = normalizeOpenAICompatibleEndpoint(provider.endpoint, '/models');
                headers = { 'Authorization': `Bearer ${key}` };
              }

              const response = await fetch(testUrl, {
                method: 'GET',
                headers: headers
              });

              if (response.ok) {
                anyKeyWorks = true;
              } else {
                const errorText = await response.text();
                failedKeys.push({ key: keyDisplay, fullKey: key, status: response.status, error: errorText.substring(0, 100) });
              }
            } catch (e) {
              failedKeys.push({ key: keyDisplay, fullKey: key, status: 'error', error: e.message });
            }
          }

          if (anyKeyWorks && failedKeys.length === 0) {
            results.push({ name: provider.name, status: 'ok', message: 'All keys working' });
          } else if (anyKeyWorks && failedKeys.length > 0) {
            results.push({
              name: provider.name,
              status: 'partial',
              message: `${keys.length - failedKeys.length}/${keys.length} keys working`,
              failedKeys
            });
          } else {
            results.push({
              name: provider.name,
              status: 'error',
              message: 'All keys failed',
              failedKeys
            });
          }
        } catch (e) {
          results.push({ name: provider.name, status: 'error', message: e.message });
        }
      }

      // Render results
      apiKeyResultsList.innerHTML = '';
      results.forEach(r => {
        const itemTemplate = document.getElementById('apiKeyResultItemTemplate');
        const itemClone = itemTemplate.content.cloneNode(true);
        const itemDiv = itemClone.querySelector('.api-key-result-item');

        let color, icon;
        if (r.status === 'ok') { color = '#34C759'; icon = '✅'; }
        else if (r.status === 'partial') { color = '#FF9500'; icon = '⚠️'; }
        else if (r.status === 'skip') { color = '#8E8E93'; icon = '⏭️'; }
        else { color = '#FF3B30'; icon = '❌'; }

        itemDiv.style.borderLeft = `3px solid ${color}`;
        itemDiv.style.background = 'var(--surface-bg)';
        itemDiv.style.padding = '8px 12px';
        itemDiv.style.borderRadius = '8px';

        itemDiv.querySelector('.api-key-result-icon').textContent = icon;
        itemDiv.querySelector('.api-key-result-name').textContent = r.name;
        const statusEl = itemDiv.querySelector('.api-key-result-status');
        statusEl.textContent = r.message;
        statusEl.style.color = color;

        if (r.failedKeys && r.failedKeys.length > 0) {
          const failedList = itemDiv.querySelector('.api-key-result-failed-info');
          r.failedKeys.forEach(fk => {
            const failedTemplate = document.getElementById('failedKeyInfoTemplate');
            const failedClone = failedTemplate.content.cloneNode(true);
            failedClone.querySelector('.failed-key-name').textContent = fk.key;
            failedClone.querySelector('.failed-key-status').textContent = fk.status;
            failedList.appendChild(failedClone);
          });
        }

        apiKeyResultsList.appendChild(itemClone);
      });

      checkApiKeysBtn.disabled = false;
      checkApiKeysBtn.textContent = '🔍 Check API Keys';
    });
  }

  let textChain = [];
  let currentlyConfiguringModel = null;
  let currentlyConfiguringProvider = null;
  let advancedParamsByModel = {};
  let isSelectingModel = false; // Flag to prevent blur from hiding dropdown during selection

  const textChainListEl = document.getElementById('textChainList');
  const textChainProviderInput = document.getElementById('textChainProvider');
  const textChainProviderList = document.getElementById('textChainProviderList');
  const textChainModelInput = document.getElementById('textChainModel');

  const textChainModelList = document.getElementById('textChainModelList');

  // Provider dropdown for text chain (custom dropdown)
  if (textChainProviderInput && textChainProviderList) {
    // Initially disable model input until provider is selected
    if (textChainModelInput) {
      textChainModelInput.disabled = true;
      textChainModelInput.placeholder = 'Select provider first...';
    }

    textChainProviderInput.addEventListener('click', () => {
      // Toggle dropdown visibility
      const isVisible = textChainProviderList.style.display === 'block';
      textChainProviderList.style.display = isVisible ? 'none' : 'block';

      if (!isVisible) {
        // Render provider list
        textChainProviderList.innerHTML = providers.map(p =>
          `<div class="dropdown-item" data-value="${p.id}">${escapeHtml(p.name)}</div>`
        ).join('');

        // Add click listeners to items
        textChainProviderList.querySelectorAll('.dropdown-item').forEach(item => {
          item.addEventListener('click', () => {
            textChainProviderInput.value = item.textContent;
            textChainProviderInput.dataset.providerId = item.dataset.value;
            textChainProviderList.style.display = 'none';

            // Enable model input
            if (textChainModelInput) {
              textChainModelInput.disabled = false;
              textChainModelInput.placeholder = 'Type or select model...';
            }

            // Fetch models for the selected provider
            const prov = getProviderById(item.dataset.value);
            if (prov) fetchModelsForProvider(prov, {
              targetListId: 'textChainModelList',
              targetInputId: 'textChainModel'
            });
          });
        });
      }
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!textChainProviderInput.contains(e.target) && !textChainProviderList.contains(e.target)) {
        textChainProviderList.style.display = 'none';
      }
    });
  }

  // Add focus listeners to fetch models
  if (textChainModelInput) {
    textChainModelInput.addEventListener('focus', () => {
      const providerId = textChainProviderInput?.dataset?.providerId;
      const prov = providerId ? getProviderById(providerId) : null;
      if (prov) {
        fetchModelsForProvider(prov, {
          selectedModel: textChainModelInput.value,
          targetListId: 'textChainModelList',
          targetInputId: 'textChainModel'
        });
      }
      if (textChainModelList) textChainModelList.style.display = 'block';
    });
    textChainModelInput.addEventListener('input', () => {
      const query = textChainModelInput.value.toLowerCase();
      const filtered = availableModels.filter(m => m.toLowerCase().includes(query));
      renderDropdown(filtered, textChainModelInput, textChainModelList);
      if (textChainModelList) textChainModelList.style.display = 'block';
    });
    textChainModelInput.addEventListener('blur', () => {
      setTimeout(() => {
        if (!isSelectingModel && textChainModelList) {
          textChainModelList.style.display = 'none';
        }
      }, 200);
    });

    textChainModelInput.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;

      e.preventDefault();
      e.stopPropagation();

      if (textChainModelList) {
        textChainModelList.style.display = 'none';
      }

      addToChain();
    });
  }

  // Vision Chain Provider (custom dropdown)


  function renderChainList() {
    const listEl = textChainListEl;
    const chain = textChain;

    if (!listEl) return;

    if (!chain || chain.length === 0) {
      listEl.innerHTML = '';
      const template = document.getElementById('emptyListStateTemplate');
      const clone = template.content.cloneNode(true);
      const emptyDiv = clone.querySelector('.chain-empty-state');
      if (emptyDiv) {
        emptyDiv.textContent = `No models added. Add one above.`;
      }
      listEl.appendChild(clone);
      return;
    }

    listEl.innerHTML = '';

    chain.forEach((item, index) => {
      const provider = providers.find(p => p.id === item.providerId);
      const providerName = provider ? provider.name : 'Unknown Provider';
      const isSelected = currentlyConfiguringModel === item.model && currentlyConfiguringProvider === item.providerId;

      const template = document.getElementById('chainItemTemplate');
      const clone = template.content.cloneNode(true);
      const chainItem = clone.querySelector('.chain-item');

      chainItem.dataset.index = index;
      chainItem.dataset.type = 'text';
      chainItem.dataset.model = item.model;
      chainItem.dataset.provider = item.providerId;


      chainItem.querySelector('.chain-number').textContent = index + 1;
      chainItem.querySelector('.chain-model-name').textContent = item.model;
      chainItem.querySelector('.chain-provider-name').textContent = providerName;

      const configureBtn = chainItem.querySelector('.configure');
      if (isSelected) configureBtn.classList.add('active');
      configureBtn.addEventListener('click', () => configureModelParams(item.model, item.providerId));

      const removeBtn = chainItem.querySelector('.remove');
      removeBtn.addEventListener('click', () => removeChainItem('text', index));

      if (isSelected) {
        // Get saved params for this model
        const modelKey = `${item.providerId}:${item.model}`;
        const savedParams = advancedParamsByModel[modelKey] || {};
        const temp = savedParams.temperature !== undefined ? savedParams.temperature : 1;
        const topP = savedParams.topP !== undefined ? savedParams.topP : 1;
        const maxTokensValue = savedParams.maxTokens !== undefined ? savedParams.maxTokens : "";
        const maxTokensDisplay = savedParams.maxTokens !== undefined ? savedParams.maxTokens : "Not Set";
        const customParams = savedParams.customParams || {};

        const paramsTemplate = document.getElementById('chainParamsTemplate');
        const paramsClone = paramsTemplate.content.cloneNode(true);
        const paramsPanel = paramsClone.querySelector('.chain-params-panel');

        // Setup sliders and values
        const tempSlider = paramsPanel.querySelector('.param-temperature');
        tempSlider.value = temp;
        paramsPanel.querySelector('.temp-value').textContent = temp;
        tempSlider.addEventListener('input', (e) => {
          paramsPanel.querySelector('.temp-value').textContent = e.target.value;
        });
        tempSlider.addEventListener('change', (e) => {
          saveInlineParam(item.providerId, item.model, 'temperature', parseFloat(e.target.value));
        });

        const topPSlider = paramsPanel.querySelector('.param-topp');
        topPSlider.value = topP;
        paramsPanel.querySelector('.topp-value').textContent = topP;
        topPSlider.addEventListener('input', (e) => {
          paramsPanel.querySelector('.topp-value').textContent = e.target.value;
        });
        topPSlider.addEventListener('change', (e) => {
          saveInlineParam(item.providerId, item.model, 'topP', parseFloat(e.target.value));
        });

        // Tokens setting removed

        const thinkingSelect = paramsPanel.querySelector('.param-thinking-level');
        thinkingSelect.value = savedParams.thinkingLevel || 'none';
        paramsPanel.querySelector('.thinking-level-value').textContent = (savedParams.thinkingLevel === 'none' || !savedParams.thinkingLevel) ? 'None' : savedParams.thinkingLevel;
        thinkingSelect.addEventListener('change', (e) => {
          const val = e.target.value;
          paramsPanel.querySelector('.thinking-level-value').textContent = val === 'none' ? 'None' : val;
          saveInlineParam(item.providerId, item.model, 'thinkingLevel', val === 'none' ? undefined : val);
        });

        const customParamsList = paramsPanel.querySelector('.custom-params-list');
        Object.entries(customParams).forEach(([k, v]) => {
          addCustomParamRow(customParamsList, item.model, item.providerId, k, v);
        });

        paramsPanel.querySelector('.add-custom-param').addEventListener('click', () => {
          addCustomParamRow(customParamsList, item.model, item.providerId);
        });

        chainItem.querySelector('.chain-item-params-container').appendChild(paramsClone);
      }

      listEl.appendChild(clone);
    });
  }

  function addCustomParamRow(listEl, modelName, providerId, key = '', value = '') {
    const template = document.getElementById('customParamRowTemplate');
    const clone = template.content.cloneNode(true);
    const row = clone.querySelector('.custom-param-row');

    const kInput = row.querySelector('.custom-param-key');
    const vInput = row.querySelector('.custom-param-value');

    kInput.value = key;
    vInput.value = typeof value === 'object' ? JSON.stringify(value) : String(value);

    const save = () => {
      const customParams = {};
      listEl.querySelectorAll('.custom-param-row').forEach(r => {
        const k = r.querySelector('.custom-param-key').value.trim();
        const v = r.querySelector('.custom-param-value').value.trim();
        if (k) {
          let pVal = v;
          if (v === 'true') pVal = true;
          else if (v === 'false') pVal = false;
          else if (!isNaN(v) && v !== '') pVal = parseFloat(v);
          else if (v.startsWith('{') || v.startsWith('[')) {
            try { pVal = JSON.parse(v); } catch (e) { }
          }
          customParams[k] = pVal;
        }
      });
      saveInlineParam(providerId, modelName, 'customParams', customParams);
    };

    kInput.addEventListener('blur', save);
    vInput.addEventListener('blur', save);
    row.querySelector('.remove-custom-param').addEventListener('click', () => {
      row.remove();
      save();
    });

    listEl.appendChild(clone);
  }

  function configureModelParams(modelName, providerId) {
    if (!modelName) return;

    if (currentlyConfiguringModel === modelName && currentlyConfiguringProvider === providerId) {
      currentlyConfiguringModel = null;
      currentlyConfiguringProvider = null;
    } else {
      currentlyConfiguringModel = modelName;
      currentlyConfiguringProvider = providerId;
    }

    renderChainList();
  }

  function addToChain() {
    const providerInput = textChainProviderInput;
    const modelInput = textChainModelInput;

    const providerId = providerInput?.dataset?.providerId;
    const model = modelInput.value.trim();

    if (!providerId) {
      alert('Please select a provider.');
      return;
    }
    if (!model) {
      alert('Please enter or select a model.');
      return;
    }

    const newItem = { providerId, model };

    textChain.unshift(newItem); // Add to beginning
    renderChainList();
    saveModelChains();
    // Clear inputs and disable model
    modelInput.value = '';
    modelInput.disabled = true;
    modelInput.placeholder = 'Select provider first...';
    if (providerInput) {
      providerInput.value = '';
      delete providerInput.dataset.providerId;
    }
  }

  function removeChainItem(type, index) {
    textChain.splice(index, 1);
    renderChainList();
    saveModelChains();
  }

  function saveModelChains() {
    const chains = {
      text: textChain
    };

    // Backward compatibility: Update legacy single-model fields with the first item in textChain
    const legacyUpdate = {};
    if (textChain.length > 0) {
      legacyUpdate.provider = textChain[0].providerId;
      legacyUpdate.model = textChain[0].model;
    }

    chrome.storage.local.set({
      modelChains: chains,
      ...legacyUpdate
    }, () => {
    });
  }

  function configureModelParams(modelName, providerId) {
    if (!modelName) return;

    // Toggle: if already selected, deselect
    if (currentlyConfiguringModel === modelName && currentlyConfiguringProvider === providerId) {
      currentlyConfiguringModel = null;
      currentlyConfiguringProvider = null;
    } else {
      currentlyConfiguringModel = modelName;
      currentlyConfiguringProvider = providerId;
    }

    // Update UI selection (this will show/hide the params panel)
    renderChainList();
  }

  function setupInlineParamListeners() {
    // No longer needed as listeners are attached during clone
  }

  function saveInlineParam(providerId, modelName, paramName, value) {
    const modelKey = `${providerId}:${modelName}`;
    if (!advancedParamsByModel[modelKey]) {
      advancedParamsByModel[modelKey] = {};
    }
    advancedParamsByModel[modelKey][paramName] = value;
    // Save to storage
    chrome.storage.local.set({ advancedParamsByModel });
  }

  // Delegation for remove and configure buttons
  [textChainListEl].forEach(el => {
    if (el) {
      el.addEventListener('click', (e) => {
        const btn = e.target.closest('.chain-btn');
        if (btn) {
          const action = btn.dataset.action;
          if (action === 'remove') {
            const type = btn.dataset.type;
            const index = parseInt(btn.dataset.index, 10);
            removeChainItem(type, index);
          } else if (action === 'configure') {
            const model = btn.dataset.model;
            const provider = btn.dataset.provider;
            configureModelParams(model, provider);
          }
        }
      });
    }
  });

  // Populate dropdowns for Chain UI
  function populateChainDropdowns() {
    // Text chain provider - custom dropdown (no default selection)
    // The dropdown is populated dynamically on click, so no initialization needed here
    // Just ensure input is cleared
    if (textChainProviderInput) {
      textChainProviderInput.value = '';
      delete textChainProviderInput.dataset.providerId;
    }

  }

  // Initialize providers and populate dropdowns
  initializeProviders().then(() => {
    renderProviders();
    populateProviderDropdowns();
    populateChainDropdowns(); // Populate chain dropdowns too
  });

  // Load options from storage
  chrome.storage.local.get(['globalDefaults', 'modelChains', 'advancedParamsByModel', 'provider', 'voiceProvider', 'voiceModel', 'model', 'fontSize', 'popupWidth', 'popupHeight', 'responseLanguage', 'disabledDomains', 'theme', 'memoryThreshold', 'compactionSize', 'questionMappings', 'askSelectionPopupEnabled', 'autoHideInputEnabled', 'deepLApiKey', 'temperature', 'topP', 'customParams', 'dictProvider', 'dictModel', 'audioSpeed', 'autoAudio', 'googleClientId', 'githubClientId', 'displayMode'], (items) => {
    // Wait for providers to be loaded
    setTimeout(() => {
      // --- Load Advanced Params ---
      if (items.advancedParamsByModel) {
        advancedParamsByModel = items.advancedParamsByModel;
      }

      // --- Load Model Chains ---
      if (items.modelChains) {
        textChain = items.modelChains.text || [];
      }

      renderChainList();




      // Initialize SortableJS
      if (typeof Sortable !== 'undefined') {
        const createSortable = (el) => {
          if (!el) return;
          new Sortable(el, {
            animation: 150,
            handle: '.chain-item', // Drag whole item
            ghostClass: 'chain-item-ghost',
            onEnd: function (evt) {
              // Update array order after drag
              const chain = textChain;
              const item = chain.splice(evt.oldIndex, 1)[0];
              chain.splice(evt.newIndex, 0, item);

              // Re-render to update numbers
              renderChainList();
              saveModelChains();
            }
          });
        };
        createSortable(document.getElementById('textChainList'));
      }


      // Voice provider - custom dropdown (for options UI)
      if (items.voiceProvider && voiceProviderInput) {
        const prov = getProviderById(items.voiceProvider);
        if (prov) {
          voiceProviderInput.value = prov.name;
          voiceProviderInput.dataset.providerId = items.voiceProvider;
          // Enable model input
          if (voiceModelInput) {
            voiceModelInput.disabled = false;
            voiceModelInput.placeholder = 'Type or select model...';
          }
        }
      }
      if (items.voiceModel && voiceModelInput) {
        voiceModelInput.value = items.voiceModel;
      }

      // Dictionary provider - custom dropdown (for options UI)
      if (items.dictProvider && dictProviderInput) {
        const prov = getProviderById(items.dictProvider);
        if (prov) {
          dictProviderInput.value = prov.name;
          dictProviderInput.dataset.providerId = items.dictProvider;
          // Enable model input
          if (dictModelInput) {
            dictModelInput.disabled = false;
            dictModelInput.placeholder = 'Type or select model...';
          }
        }
      }
      if (items.dictModel && dictModelInput) {
        dictModelInput.value = items.dictModel;
      }

      if (audioSpeedInput) {
        audioSpeedInput.value = (items.audioSpeed || 1.0).toFixed(2);
      }

      // Final attempt to restore scroll position after all dynamic content is rendered
      if (typeof restoreLastSessionState === 'function') {
        setTimeout(restoreLastSessionState, 300);
        // After this final attempt, we can safely allow scroll saving
        setTimeout(() => { isInitialLoad = false; }, 1500);
      }
    }, 200);


    if (items.deepLApiKey && deepLApiKeyInput) deepLApiKeyInput.value = items.deepLApiKey;

    if (items.googleClientId && googleClientIdInput) googleClientIdInput.value = items.googleClientId;
    if (items.githubClientId && githubClientIdInput) {
      githubClientIdInput.value = items.githubClientId;
      localStorage.setItem('gh_client_id', items.githubClientId);
    }


    // Global Defaults
    const globalDefaults = items.globalDefaults || {};
    const defaultFontSize = globalDefaults.fontSize || items.fontSize || 13;

    // Font Size - start with global default (domain-specific applied later)
    fontSizeInput.value = defaultFontSize;

    // Load Response Language
    const savedLanguage = items.responseLanguage || 'vi';
    const langRadio = document.querySelector(`input[name="responseLanguage"][value="${savedLanguage}"]`);
    if (langRadio) langRadio.checked = true;

    // Load Selection Popup setting
    isAskSelectionPopupEnabled = items.askSelectionPopupEnabled !== undefined ? items.askSelectionPopupEnabled : true;
    updateAskSelectionPopupBtnUI();

    // Load Read webpage setting


    // Load Auto-hide Input setting
    const autoHideInputEnabledCheckbox = document.getElementById('autoHideInputEnabled');
    if (autoHideInputEnabledCheckbox) {
      autoHideInputEnabledCheckbox.checked = items.autoHideInputEnabled !== undefined ? items.autoHideInputEnabled : false;
      autoHideInputEnabledCheckbox.addEventListener('change', saveOptions);
    }

    // Load temperature and topP
    if (items.temperature !== undefined) {
      temperatureInput.value = items.temperature;
      temperatureValue.textContent = items.temperature.toFixed(1);
    }
    // Advanced params are loaded per-model after model loads (see setTimeout above)
    setTimeout(() => {
      if (window.loadAdvancedParamsForModel) {
        window.loadAdvancedParamsForModel();
      } else {
        loadAdvancedParamsForModel();
      }
    }, 200);

    // Load Theme

    const savedTheme = items.theme || (items.globalDefaults && items.globalDefaults.theme) || 'light';
    const themeRadio = document.querySelector(`input[name="theme"][value="${savedTheme}"]`);
    if (themeRadio) themeRadio.checked = true;
    applyTheme(savedTheme);


    const memThreshInput = document.getElementById('memoryThreshold');
    const compSizeInput = document.getElementById('compactionSize');
    const memThreshVal = document.getElementById('memoryThresholdValue');
    const compSizeVal = document.getElementById('compactionSizeValue');
    const maxTokensInput = document.getElementById('maxTokens');
    const maxTokensVal = document.getElementById('maxTokensValue');

    const memoryThreshold = items.memoryThreshold || 14;
    const compactionSize = items.compactionSize || 10;
    const maxTokens = items.maxTokens !== undefined ? items.maxTokens : null;

    if (memThreshInput) {
      memThreshInput.value = memoryThreshold;
      memThreshVal.textContent = `${memoryThreshold} entries`;

      const handleMemThreshChange = (e) => {
        const val = parseInt(e.target.value, 10);
        memThreshVal.textContent = `${val} entries`;

        // Enforce Threshold >= Compaction Size
        const currentCompSize = parseInt(compSizeInput.value, 10);
        if (val < currentCompSize) {
          compSizeInput.value = val;
          compSizeVal.textContent = `${val} entries`;
        }

        saveOptions();
      };

      memThreshInput.addEventListener('input', handleMemThreshChange);
      memThreshInput.addEventListener('change', handleMemThreshChange);
    }

    if (compSizeInput) {
      compSizeInput.value = compactionSize;
      compSizeVal.textContent = `${compactionSize} entries`;

      const handleCompSizeChange = (e) => {
        let val = parseInt(e.target.value, 10);

        // Enforce Compaction Size <= Threshold
        const currentThreshold = parseInt(memThreshInput.value, 10);
        if (val > currentThreshold) {
          val = currentThreshold;
          e.target.value = val; // Snap back
        }

        compSizeVal.textContent = `${val} entries`;
        saveOptions();
      };

      compSizeInput.addEventListener('input', handleCompSizeChange);
      compSizeInput.addEventListener('change', handleCompSizeChange);
    }


    if (maxTokensInput) {
      if (maxTokens === null || maxTokens === undefined || maxTokens === '') {
        maxTokensInput.value = '';
        maxTokensVal.textContent = 'No limit';
      } else {
        maxTokensInput.value = maxTokens;
        maxTokensVal.textContent = `${maxTokens} tokens`;
      }

      const handleMaxTokensChange = (e) => {
        const val = e.target.value.trim();
        maxTokensVal.textContent = val ? `${val} tokens` : 'No limit';
        saveOptions();
      };

      maxTokensInput.addEventListener('input', handleMaxTokensChange);
      maxTokensInput.addEventListener('change', handleMaxTokensChange);
    }

    // Load Question Mappings
    if (typeof loadQuestionMappings === 'function') {
      loadQuestionMappings(items);
    }

    // Mark settings as loaded - initial load will happen at end of file
    window._dictPlusSettingsLoaded = true;

    // Ensure domain-specific settings are applied after main settings load
    if (typeof applyDomainSpecificSettings === 'function') {
      applyDomainSpecificSettings();
    }
  });

  // Auto-save function
  function saveOptions() {
    if (!window._dictPlusSettingsLoaded) return;
    const provider = providerSelect ? providerSelect.value : '';  // Legacy
    const model = modelInput ? modelInput.value : '';             // Legacy
    const fontSize = fontSizeInput ? fontSizeInput.value : '13';
    const responseLanguage = document.querySelector('input[name="responseLanguage"]:checked')?.value || 'vi';
    const theme = document.querySelector('input[name="theme"]:checked')?.value || 'auto';

    applyTheme(theme);

    // Collect shortcuts
    const shortcuts = {};
    document.querySelectorAll('.shortcut-input').forEach(input => {
      const action = input.dataset.action;
      if (!action) return; // Skip non-global shortcuts like custom source triggers

      const keyData = input.dataset.key ? JSON.parse(input.dataset.key) : null;
      shortcuts[action] = keyData;
    });

    const audioSpeed = parseFloat(audioSpeedInput ? audioSpeedInput.value : 1.0);

    // First get existing settings to update them
    chrome.storage.local.get(['globalDefaults', 'fontSizeByDomain'], (existing) => {
      let globalDefaults = existing.globalDefaults || {};
      let fontSizeByDomain = existing.fontSizeByDomain || {};
      
      // Update global defaults
      globalDefaults.fontSize = parseFloat(fontSize);
      globalDefaults.theme = theme;

      // Collect Question Mappings
      const questionMappingsExport = [];
      document.querySelectorAll('.mapping-item').forEach((row) => {
        const keyInput = row.querySelector('.mapping-key-input');
        const promptInput = row.querySelector('.mapping-prompt');
        const prompt = promptInput ? (promptInput.innerText || promptInput.textContent).trim() : '';

        if (keyInput) {
          try {
            const keyStr = keyInput.dataset.key;
            const keyData = (keyStr && keyStr !== '') ? JSON.parse(keyStr) : null;
            // Save the row even if key/prompt are empty so the row persists on reload
            questionMappingsExport.push({ keyData, prompt });
          } catch (e) {
            console.error('Error parsing key data', e);
            // Fallback: save row even if key is malformed (shouldn't happen)
            questionMappingsExport.push({ keyData: null, prompt });
          }
        }
      });

      const settings = {
        provider: provider,
        model: model,
        voiceProvider: voiceProviderInput?.dataset?.providerId || '',
        voiceModel: voiceModelInput ? voiceModelInput.value : '',
        dictProvider: dictProviderInput?.dataset?.providerId || '',
        dictModel: dictModelInput ? dictModelInput.value : '',
        questionMappings: questionMappingsExport,
        fontSize: fontSize, // Global default
        globalDefaults: globalDefaults,
        compactionSize: parseInt(document.getElementById('compactionSize')?.value, 10) || 10,
        responseLanguage: responseLanguage,
        theme: theme,
        shortcuts: shortcuts,
        askSelectionPopupEnabled: isAskSelectionPopupEnabled,
        autoHideInputEnabled: document.getElementById('autoHideInputEnabled')?.checked || false,
        audioSpeed: audioSpeed,
        memoryThreshold: parseInt(document.getElementById('memoryThreshold')?.value, 10) || 14,
        maxTokens: document.getElementById('maxTokens')?.value || null
      };




      // Save OAuth Client IDs
      if (googleClientIdInput) settings.googleClientId = googleClientIdInput.value;
      if (githubClientIdInput) {
        const ghId = githubClientIdInput.value;
        settings.githubClientId = ghId;
        // Sync to localStorage for Lumina Play pages
        localStorage.setItem('gh_client_id', ghId);
      }

      chrome.storage.local.set(settings, () => {
        // Sync critical settings to localStorage for synchronous access
        try {
          // Popup dimensions sync removed
        } catch (e) {
          console.warn('Failed to sync to localStorage:', e);
        }

        // Notify all tabs about changes
        chrome.tabs.query({}, (tabs) => {
          tabs.forEach(tab => {
            // Only send to tabs with http/https URLs or Lumina extension pages
            const isLuminaPage = tab.url && tab.url.startsWith(chrome.runtime.getURL(''));
            if (!tab.id || !tab.url || (!tab.url.startsWith('http://') && !tab.url.startsWith('https://') && !isLuminaPage)) {
              return;
            }

            // Send shortcuts update
            chrome.tabs.sendMessage(tab.id, {
              action: 'shortcuts_updated',
              shortcuts: shortcuts
            }).catch(() => { /* Tab might not have content script */ });

            // Send visual settings update for live preview
            chrome.tabs.sendMessage(tab.id, {
              action: 'settings_updated',
              settings: {
                fontSize: fontSize,
                fontSizeByDomain: fontSizeByDomain,
                globalDefaults: globalDefaults,
                theme: theme,
              }
            }).catch(() => { /* Tab might not have content script */ });
          });
        });
      });
    });
  }
  // Add auto-save listeners to all inputs
  const inputs = [
    providerSelect, modelInput,

    deepLApiKeyInput,
    fontSizeInput,
  ].filter(Boolean); // Filter out nulls explicitly

  function updateAskSelectionPopupBtnUI() {
    if (!askSelectionPopupBtn) return;
    if (isAskSelectionPopupEnabled) {
      askSelectionPopupBtn.textContent = 'Enabled';
      askSelectionPopupBtn.style.color = '#fff';
      askSelectionPopupBtn.style.background = '#28a745'; // Green for enabled
      askSelectionPopupBtn.style.borderColor = '#28a745';
      askSelectionPopupBtn.style.boxShadow = 'none';
      askSelectionPopupBtn.style.fontWeight = '600';
    } else {
      askSelectionPopupBtn.textContent = 'Disabled';
      askSelectionPopupBtn.style.color = 'var(--text-secondary)';
      askSelectionPopupBtn.style.background = 'var(--card-bg)';
      askSelectionPopupBtn.style.borderColor = 'var(--border-color)';
      askSelectionPopupBtn.style.boxShadow = 'none';
      askSelectionPopupBtn.style.fontWeight = '520';
    }
  }

  if (askSelectionPopupBtn) {
    askSelectionPopupBtn.addEventListener('click', () => {
      isAskSelectionPopupEnabled = !isAskSelectionPopupEnabled;
      updateAskSelectionPopupBtnUI();
      saveOptions();
    });
  }


  inputs.forEach(input => {
    if (input) { // Double check
      input.addEventListener('change', saveOptions);
      if (input.type === 'text' || input.type === 'number' || input.type === 'password') {
        input.addEventListener('input', debounce(saveOptions, 500));
      } else {
        input.addEventListener('input', saveOptions);
      }
    }
  });

  // Debounce helper
  function debounce(func, wait) {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  // Translation Provider Logic

  // Add auto-save listeners for radio buttons
  document.querySelectorAll('input[name="theme"]').forEach(radio => {
    radio.addEventListener('change', saveOptions);
  });

  document.querySelectorAll('input[name="responseLanguage"]').forEach(radio => {
    radio.addEventListener('change', saveOptions);
  });


  if (providerSelect) {
    providerSelect.addEventListener('change', () => {
      const providerId = providerSelect.value;
      saveOptions();

      // Fetch models for the selected provider
      const provider = getProviderById(providerId);
      if (provider) {
        fetchModelsForProvider(provider, {
          selectedModel: modelInput.value
        });
      } else {
        availableModels = [];
        renderDropdown([], modelInput, modelList);
      }
    });
  }

  // Custom Dropdown Logic (Generic)
  function setupDropdown(input, list, getModels) {
    if (!input || !list) return; // Prevent crash if elements missing

    input.addEventListener('focus', () => {
      if (input.value && !availableModels.includes(input.value)) {
        // Maybe they typed something custom?
      }
      renderDropdown(getModels(), input, list);
      list.classList.add('show');
    });

    input.addEventListener('input', () => {
      const filter = input.value.toLowerCase();
      const filtered = getModels().filter(m => m.toLowerCase().includes(filter));
      renderDropdown(filtered, input, list);
      list.classList.add('show');
    });

    document.addEventListener('click', (e) => {
      if (!input.contains(e.target) && !list.contains(e.target)) {
        list.classList.remove('show');
      }
    });
  }

  setupDropdown(modelInput, modelList, () => availableModels);
  setupDropdown(voiceModelInput, voiceModelList, () => availableVoiceModels);
  setupDropdown(dictModelInput, dictModelList, () => availableDictModels);

  function renderDropdown(models, inputElement, listElement) {
    listElement.innerHTML = '';
    if (models.length === 0) {
      const div = document.createElement('div');
      div.className = 'dropdown-item';
      div.textContent = 'No models found';
      div.style.color = 'var(--text-secondary)';
      div.style.cursor = 'default';
      listElement.appendChild(div);
      return;
    }

    models.forEach(model => {
      const div = document.createElement('div');
      div.className = 'dropdown-item';
      if (model === inputElement.value) {
        div.classList.add('selected');
      }
      div.textContent = model;
      // Use mousedown instead of click to ensure selection happens before input blur
      div.addEventListener('mousedown', (e) => {
        e.preventDefault(); // Prevent input from losing focus immediately
        e.stopPropagation(); // Stop event bubbling
        isSelectingModel = true; // Set flag to prevent blur from hiding dropdown

        const oldModel = inputElement.value;
        const modelToSave = currentlyConfiguringModel || oldModel;

        // Save current params for OLD model/Context before switching
        if (modelToSave && window.saveAdvancedParamsForCurrentModel) {
          window.saveAdvancedParamsForCurrentModel(modelToSave);
        }

        inputElement.value = model;
        listElement.style.display = 'none'; // Force hide
        listElement.classList.remove('show');

        // Reset chain configuration mode if we are switching the main model
        if (inputElement.id === 'model' && currentlyConfiguringModel) {
          currentlyConfiguringModel = null;
          currentlyConfiguringProvider = null;
          // Refresh chain lists to remove highlight
          if (typeof renderChainList === 'function') {
            renderChainList();
          }
        }

        // Dispatch event FIRST to load new model's params
        document.dispatchEvent(new CustomEvent('modelChanged'));
        // Then save general options (without advanced params)
        saveOptions();

        // Auto-add for Chain UI (Model Management)
        if (inputElement.id === 'textChainModel') {
          addToChain();
        }

        // Reset flag after a short delay
        setTimeout(() => {
          isSelectingModel = false;
        }, 50);
      });
      listElement.appendChild(div);
    });
  }


  // Voice provider custom dropdown
  if (voiceProviderInput && voiceProviderList) {
    // Initially disable model input until provider is selected
    if (voiceModelInput && !voiceProviderInput.dataset.providerId) {
      voiceModelInput.disabled = true;
      voiceModelInput.placeholder = 'Select provider first...';
    }

    voiceProviderInput.addEventListener('click', () => {
      const isVisible = voiceProviderList.style.display === 'block';
      voiceProviderList.style.display = isVisible ? 'none' : 'block';

      if (!isVisible) {
        voiceProviderList.innerHTML = providers.map(p =>
          `<div class="dropdown-item" data-value="${p.id}">${escapeHtml(p.name)}</div>`
        ).join('');

        voiceProviderList.querySelectorAll('.dropdown-item').forEach(item => {
          item.addEventListener('click', () => {
            voiceProviderInput.value = item.textContent;
            voiceProviderInput.dataset.providerId = item.dataset.value;
            voiceProviderList.style.display = 'none';

            // Enable model input
            if (voiceModelInput) {
              voiceModelInput.disabled = false;
              voiceModelInput.placeholder = 'Type or select model...';
            }

            saveOptions();
            const provider = getProviderById(item.dataset.value);
            if (provider) {
              fetchModelsForProvider(provider, {
                isVoice: true
              });
            }
          });
        });
      }
    });

    document.addEventListener('click', (e) => {
      if (!voiceProviderInput.contains(e.target) && !voiceProviderList.contains(e.target)) {
        voiceProviderList.style.display = 'none';
      }
    });
  }

  // Voice model input listeners
  if (voiceModelInput) {
    voiceModelInput.addEventListener('change', () => {
      saveOptions();
    });

    voiceModelInput.addEventListener('focus', () => {
      const providerId = voiceProviderInput?.dataset?.providerId;
      const provider = providerId ? getProviderById(providerId) : null;
      if (provider) {
        // Refresh list on focus
        fetchModelsForProvider(provider, {
          selectedModel: voiceModelInput.value,
          isVoice: true
        });
      }
      if (voiceModelList) voiceModelList.style.display = 'block';
    });

    voiceModelInput.addEventListener('input', () => {
      const query = voiceModelInput.value.toLowerCase();
      const filtered = availableVoiceModels.filter(m => m.toLowerCase().includes(query));
      renderDropdown(filtered, voiceModelInput, voiceModelList);
      if (voiceModelList) voiceModelList.style.display = 'block';
    });

    voiceModelInput.addEventListener('blur', () => {
      setTimeout(() => {
        if (!isSelectingModel && voiceModelList) voiceModelList.style.display = 'none';
      }, 200);
    });
  }

  // Dictionary provider custom dropdown
  if (dictProviderInput && dictProviderList) {
    // Initially disable model input until provider is selected
    if (dictModelInput && !dictProviderInput.dataset.providerId) {
      dictModelInput.disabled = true;
      dictModelInput.placeholder = 'Select provider first...';
    }

    dictProviderInput.addEventListener('click', () => {
      const isVisible = dictProviderList.style.display === 'block';
      dictProviderList.style.display = isVisible ? 'none' : 'block';

      if (!isVisible) {
        dictProviderList.innerHTML = providers.map(p =>
          `<div class="dropdown-item" data-value="${p.id}">${escapeHtml(p.name)}</div>`
        ).join('');

        dictProviderList.querySelectorAll('.dropdown-item').forEach(item => {
          item.addEventListener('click', () => {
            dictProviderInput.value = item.textContent;
            dictProviderInput.dataset.providerId = item.dataset.value;
            dictProviderList.style.display = 'none';

            // Enable model input
            if (dictModelInput) {
              dictModelInput.disabled = false;
              dictModelInput.placeholder = 'Type or select model...';
            }

            saveOptions();
            const provider = getProviderById(item.dataset.value);
            if (provider) {
              fetchModelsForProvider(provider, {
                isDict: true
              });
            }
          });
        });
      }
    });

    document.addEventListener('click', (e) => {
      if (!dictProviderInput.contains(e.target) && !dictProviderList.contains(e.target)) {
        dictProviderList.style.display = 'none';
      }
    });
  }

  // Dictionary model input listeners
  if (dictModelInput) {
    dictModelInput.addEventListener('change', () => {
      saveOptions();
    });

    dictModelInput.addEventListener('focus', () => {
      const providerId = dictProviderInput?.dataset?.providerId;
      const provider = providerId ? getProviderById(providerId) : null;
      if (provider) {
        // Refresh list on focus
        fetchModelsForProvider(provider, {
          selectedModel: dictModelInput.value,
          isDict: true
        });
      }
      if (dictModelList) dictModelList.style.display = 'block';
    });

    dictModelInput.addEventListener('input', () => {
      const query = dictModelInput.value.toLowerCase();
      // Use the appropriate model cache based on context
      const modelsToFilter = availableDictModels || [];
      const filtered = modelsToFilter.filter(m => m.toLowerCase().includes(query));
      renderDropdown(filtered, dictModelInput, dictModelList);
      if (dictModelList) dictModelList.style.display = 'block';
    });

    dictModelInput.addEventListener('blur', () => {
      setTimeout(() => {
        if (!isSelectingModel && dictModelList) dictModelList.style.display = 'none';;
      }, 200);
    });
  }

  function normalizeOpenAICompatibleEndpoint(endpoint, targetPath) {
    if (typeof endpoint !== 'string') return endpoint;

    const trimmed = endpoint.trim().replace(/\/+$/, '');
    if (!trimmed) return trimmed;

    const knownSuffixes = ['/chat/completions', '/models', '/audio/transcriptions'];
    for (const suffix of knownSuffixes) {
      if (trimmed.endsWith(suffix)) {
        return trimmed.slice(0, -suffix.length) + targetPath;
      }
    }

    if (trimmed.endsWith('/v1') || trimmed.endsWith('/v1beta/openai') || trimmed.endsWith('/openai/v1')) {
      return `${trimmed}${targetPath}`;
    }

    return `${trimmed}${targetPath}`;
  }

  // Fetch models for a dynamic provider
  async function fetchModelsForProvider(provider, options = {}) {
    if (!provider) return;

    // Destructure options with defaults
    const {
      selectedModel = '',
      isVision = false,
      isVoice = false,
      isTrans = false,
      isDict = false,
      targetListId = null,
      targetInputId = null,
      customTarget = false
    } = options;

    // Determine target elements
    let listId = targetListId;
    let inputId = targetInputId;

    if (!listId) {
      if (isDict) listId = 'dictModelList';
      else if (isVoice) listId = 'voiceModelList';
      else listId = 'modelList';
    }
    if (!inputId) {
      if (isDict) inputId = 'dictModel';
      else if (isVoice) inputId = 'voiceModel';
      else inputId = 'model';
    }

    try {
      const firstKey = provider.apiKey ? provider.apiKey.split(',')[0].trim() : '';
      let models = [];

      console.log('[Lumina Options] Fetching models for provider:', provider.name, 'type:', provider.type, 'endpoint:', provider.endpoint, 'hasKey:', !!firstKey);

      // OpenAI-compatible API
      let modelsUrl = normalizeOpenAICompatibleEndpoint(provider.endpoint, '/models');

      // Adjust for Groq specifically
      if (provider.type === 'groq' || provider.endpoint.includes('groq.com')) {
        modelsUrl = 'https://api.groq.com/openai/v1/models';
      }

      const response = await fetch(modelsUrl, {
        headers: firstKey ? { 'Authorization': `Bearer ${firstKey}` } : {}
      });

      if (response.ok) {
        const data = await response.json();
        if (data.data) {
          models = data.data.map(m => m.id);
        }
      }

      // Filter for voice models if isVoice is true - REMOVED FILTER to show ALL models
      if (isVoice) {

        // Just fallback if empty and it's specific provider
        if (models.length === 0) {
          if (provider.type === 'groq' || provider.endpoint.includes('groq.com')) models.push('whisper-large-v3');
          if (provider.type === 'openai' || provider.endpoint.includes('openai.com')) models.push('whisper-1');
        }
      }

      // Update global arrays
      if (isDict) {
        availableDictModels = models;
      } else if (isVoice) {
        availableVoiceModels = models;
      } else {
        availableModels = models;
      }

      console.log('[Lumina Options] Fetched', models.length, 'models for', provider.name, ':', models.slice(0, 5), '...');

      const inputEl = document.getElementById(inputId);
      const listEl = document.getElementById(listId);
      renderModelDropdown(listEl, inputEl, models);

      // Show dropdown if input is currently focused
      if (inputEl && document.activeElement === inputEl && listEl) {
        listEl.style.display = 'block';
      }

      // Preserve selection
      if (inputEl && selectedModel) {
        inputEl.value = selectedModel;
      }
    } catch (e) {
      console.warn('Failed to fetch models:', e);
      // Fallback
      const inputEl = document.getElementById(inputId);
      const listEl = document.getElementById(listId);
      renderModelDropdown(listEl, inputEl, []);
    }
  }

  function renderModelDropdown(list, input, models) {
    if (!list || !models) return;
    list.innerHTML = '';

    models.forEach(m => {
      const div = document.createElement('div');
      // Inline styles to match existing dropdown items if class is missing
      div.className = 'dropdown-item';
      div.style.padding = '8px 12px';
      div.style.cursor = 'pointer';
      div.style.fontSize = '13px';
      div.style.color = 'var(--text-primary)';
      div.style.borderBottom = '1px solid var(--border-color)';

      div.addEventListener('mouseenter', () => div.style.background = 'var(--sidebar-hover)');
      div.addEventListener('mouseleave', () => div.style.background = 'transparent');

      div.textContent = m;
      div.addEventListener('mousedown', () => {
        input.value = m;
        list.style.display = 'none';

        // Auto-add for Chain UI (Model Management)
        if (input.id === 'textChainModel') {
          addToChain();
        }

        // Notify that model changed (for saving)
        document.dispatchEvent(new CustomEvent('modelChanged'));
        saveOptions();
      });
      list.appendChild(div);
    });

    if (!input.hasAttribute('data-dropdown-initialized')) {
      input.setAttribute('data-dropdown-initialized', 'true');

      input.addEventListener('focus', () => {
        if (list.children.length > 0) list.style.display = 'block';
      });

      input.addEventListener('blur', () => {
        setTimeout(() => list.style.display = 'none', 200);
      });

      input.addEventListener('input', () => {
        const filter = input.value.toLowerCase();
        Array.from(list.children).forEach(child => {
          const text = child.textContent.toLowerCase();
          child.style.display = text.includes(filter) ? 'block' : 'none';
        });
        list.style.display = 'block';
      });
    }
  }

  async function fetchModels(provider, apiKey, selectedModel) {
    try {
      // Use the first key for fetching models if multiple are provided
      const firstKey = apiKey.split(',')[0].trim();
      let models = [];
      if (provider === 'groq') {
        const response = await fetch(PROVIDERS.groq.modelsUrl, {
          headers: { 'Authorization': `Bearer ${firstKey}` }
        });
        if (response.ok) {
          const data = await response.json();
          models = data.data.map(m => m.id);
        }
      } else if (provider === 'gemini') {
        const response = await fetch(`${PROVIDERS.gemini.modelsUrl}?key=${firstKey}`);
        if (response.ok) {
          const data = await response.json();
          if (data.models) {
            models = data.models.map(m => m.name.replace('models/', ''));
          }
        }
      } else if (provider === 'openrouter') {
        const response = await fetch(PROVIDERS.openrouter.modelsUrl, {
          headers: { 'Authorization': `Bearer ${firstKey}` }
        });
        if (response.ok) {
          const data = await response.json();
          if (data.data) {
            models = data.data.map(m => m.id);
          }
        }
      }

      availableModels = models;

      // If we have models, render them (but don't show unless focused)
    } catch (e) {
      console.error('Failed to fetch models', e);
      availableModels = [];
    }
  }

  // Temperature and Top P sliders
  if (temperatureInput) {
    temperatureInput.addEventListener('input', () => {
      temperatureValue.textContent = parseFloat(temperatureInput.value).toFixed(1);
      const targetModel = currentlyConfiguringModel || modelInput?.value?.trim();
      if (targetModel) saveAdvancedParamsForCurrentModel(targetModel);
    });
  }

  if (topPInput) {
    topPInput.addEventListener('input', () => {
      topPValue.textContent = parseFloat(topPInput.value).toFixed(2);
      const targetModel = currentlyConfiguringModel || modelInput?.value?.trim();
      if (targetModel) saveAdvancedParamsForCurrentModel(targetModel);
    });
  }

  // Custom Params with validation
  function addCustomParamRow(key = '', value = '') {
    if (!customParamsList) return;
    const template = document.getElementById('customParamRowTemplate');
    const clone = template.content.cloneNode(true);
    const row = clone.querySelector('.custom-param-row');

    const keyInput = row.querySelector('.custom-param-key');
    const valueInput = row.querySelector('.custom-param-value');
    const removeBtn = row.querySelector('.remove-param-btn');

    keyInput.value = key;
    valueInput.value = value;

    removeBtn.addEventListener('click', () => {
      row.remove();
      const targetModel = currentlyConfiguringModel || modelInput?.value?.trim();
      if (targetModel) saveAdvancedParamsForCurrentModel(targetModel);
    });

    customParamsList.appendChild(clone);
  }

  function getCustomParamsJSON() {
    if (!customParamsList) return ''; // Guard against null element
    const rows = customParamsList.querySelectorAll('.custom-param-row');
    const params = {};
    rows.forEach(row => {
      const key = row.querySelector('.custom-param-key')?.value?.trim();
      let value = row.querySelector('.custom-param-value')?.value?.trim();
      if (key) {
        // Try to parse as number, boolean, or JSON object
        if (value === 'true') value = true;
        else if (value === 'false') value = false;
        else if (!isNaN(value) && value !== '') value = Number(value);
        else if (value.startsWith('{') || value.startsWith('[')) {
          try { value = JSON.parse(value); } catch (e) { }
        }
        params[key] = value;
      }
    });
    return Object.keys(params).length > 0 ? JSON.stringify(params) : '';
  }

  if (addCustomParamBtn) {
    addCustomParamBtn.addEventListener('click', () => {
      addCustomParamRow();
    });
  }

  if (customParamsList) {
    customParamsList.addEventListener('click', (e) => {
      if (e.target.classList.contains('remove-param-btn')) {
        e.target.closest('.custom-param-row').remove();
        const targetModel = currentlyConfiguringModel || modelInput?.value?.trim();
        if (targetModel) saveAdvancedParamsForCurrentModel(targetModel);
      }
    });

    customParamsList.addEventListener('input', debounce(() => {
      const targetModel = currentlyConfiguringModel || modelInput?.value?.trim();
      if (targetModel) saveAdvancedParamsForCurrentModel(targetModel);
    }, 500));

    // Also save immediately when an input loses focus, to prevent lost changes on quick exit
    customParamsList.addEventListener('focusout', (e) => {
      if (e.target.tagName === 'INPUT') {
        const targetModel = currentlyConfiguringModel || modelInput?.value?.trim();
        if (targetModel) saveAdvancedParamsForCurrentModel(targetModel);
      }
    });
  }

  // Per-model advanced params functions
  window.saveAdvancedParamsForCurrentModel = function (modelName) {
    if (!modelName) return;

    let provider = currentlyConfiguringProvider;
    if (!provider && !currentlyConfiguringModel) {
      provider = providerSelect?.value;
    }

    const storageKey = provider ? `${provider}:${modelName}` : modelName;

    const params = {
      temperature: parseFloat(temperatureInput?.value) || 1.0,
      topP: parseFloat(topPInput?.value) || 1.0,
      customParams: getCustomParamsJSON()
    };

    chrome.storage.local.get(['advancedParamsByModel'], (result) => {
      const allParams = result.advancedParamsByModel || {};
      allParams[storageKey] = params;
      chrome.storage.local.set({ advancedParamsByModel: allParams });
    });
  };

  function saveAdvancedParamsForModel() {
    const model = currentlyConfiguringModel || modelInput?.value?.trim();
    if (!model) return;

    // Determine provider for key generation
    let provider = currentlyConfiguringProvider;
    if (!provider && !currentlyConfiguringModel) {
      // Fallback to main selector if not configuring a specific chain item
      provider = providerSelect?.value;
    }

    // Create composite key if provider is known, otherwise fallback to model name (legacy)
    const storageKey = provider ? `${provider}:${model}` : model;

    const params = {
      temperature: parseFloat(temperatureInput?.value) || 1.0,
      topP: parseFloat(topPInput?.value) || 1.0,
      customParams: getCustomParamsJSON()
    };

    chrome.storage.local.get(['advancedParamsByModel'], (result) => {
      const allParams = result.advancedParamsByModel || {};
      allParams[storageKey] = params;
      // Also save legacy key for backward compatibility if needed? 
      chrome.storage.local.set({ advancedParamsByModel: allParams });
    });
  }

  function loadAdvancedParamsForModel(modelOverride, providerOverride) {
    // Determine which model to load:
    const model = (typeof modelOverride === 'string' && modelOverride)
      ? modelOverride
      : (currentlyConfiguringModel || modelInput?.value?.trim());

    if (!model) return;

    // Determine provider
    let provider = providerOverride || currentlyConfiguringProvider;
    if (!provider && !currentlyConfiguringModel) {
      provider = providerSelect?.value;
    }

    const storageKey = provider ? `${provider}:${model}` : model;

    chrome.storage.local.get(['advancedParamsByModel'], (result) => {
      const allParams = result.advancedParamsByModel || {};
      // Try new key, then fallback to legacy key (just model name)
      const params = allParams[storageKey] || allParams[model] || { temperature: 1.0, topP: 1.0, customParams: '' };

      // Update UI
      temperatureInput.value = params.temperature;
      temperatureValue.textContent = params.temperature.toFixed(1);
      topPInput.value = params.topP;
      topPValue.textContent = params.topP.toFixed(2);

      // Clear and load custom params
      customParamsList.innerHTML = '';
      if (params.customParams) {
        try {
          const parsed = JSON.parse(params.customParams);
          Object.entries(parsed).forEach(([key, value]) => {
            const displayValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
            addCustomParamRow(key, displayValue);
          });
        } catch (e) { }
      }
    });
  }

  // Load params when model changes
  document.addEventListener('modelChanged', loadAdvancedParamsForModel);
  if (modelInput) {
    modelInput.addEventListener('blur', debounce(loadAdvancedParamsForModel, 300));
  }

  // Save settings
  function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = 'status ' + type;
    statusDiv.style.display = 'block';
  }
  // Stepper Logic
  function setupStepperButton(btn, delta) {
    let timeoutId = null;
    let intervalId = null;
    let speed = 150; // Initial speed (ms)

    const updateValue = () => {
      let val = parseFloat(fontSizeInput.value) || 13;
      let newVal = val + delta;
      // Clamp value
      if (newVal >= 10 && newVal <= 30) {
        fontSizeInput.value = newVal;
        saveOptions();
      }
    };

    const startRepeating = () => {
      updateValue(); // Immediate update

      // Initial delay before repeating
      timeoutId = setTimeout(() => {
        // Start repeating loop
        const loop = () => {
          updateValue();
          // Accelerate: reduce delay by 10% each step, min 30ms
          speed = Math.max(30, speed * 0.9);
          intervalId = setTimeout(loop, speed);
        };
        loop();
      }, 500);
    };

    const stopRepeating = () => {
      clearTimeout(timeoutId);
      clearTimeout(intervalId);
      speed = 150; // Reset speed
    };

    btn.addEventListener('mousedown', startRepeating);
    btn.addEventListener('mouseup', stopRepeating);
    btn.addEventListener('mouseleave', stopRepeating);
  }

  setupStepperButton(decreaseFontSizeBtn, -0.5);
  setupStepperButton(increaseFontSizeBtn, 0.5);

  // Auto-save for Theme radio buttons
  document.querySelectorAll('input[name="theme"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const selectedTheme = document.querySelector('input[name="theme"]:checked')?.value || 'auto';
      applyTheme(selectedTheme);
      saveOptions();
    });
  });

  // Auto-save for Response Language radio buttons
  document.querySelectorAll('input[name="responseLanguage"]').forEach(radio => {
    radio.addEventListener('change', saveOptions);
  });



  const DEFAULT_SHORTCUTS = {
    image: { code: 'KeyI', key: 'i', display: 'I' },
    proofread: { code: 'KeyC', key: 'c', display: 'C' },
    luminaChat: { code: 'Backquote', key: '`', display: '`' },
    audio: { code: 'ShiftLeft', key: 'Shift', display: isMac ? '⇧L' : 'ShiftL', shiftKey: true },
    resetChat: { code: 'Mouse0', key: 'Mouse0', display: 'Left', metaKey: true, shiftKey: true },
    regenerate: { code: 'KeyR', key: 'r', display: 'R' }
  };

  let currentRecordingInput = null;
  let recordingPressedCodes = new Set(); // track codes held during recording
  let recordingHadInput = false;    // true once a key/mouse shortcut is actually saved
  let suppressNextShortcutClick = null;

  // Format key display name
  function getKeyDisplay(event) {
    // Check if it's a mouse event structure (has button property and internal type we set)
    if (event.code && event.code.startsWith('Mouse')) {
      const map = {
        'Mouse0': 'Left',
        'Mouse1': 'Middle',
        'Mouse2': 'Right',
        'Mouse3': 'Back',
        'Mouse4': 'Forward'
      };
      return map[event.code] || event.code;
    }

    let key = event.key;
    const code = event.code;

    // Fix for Windows Alt/Ctrl/Win combos causing "Dead" or "Unidentified"
    if (key === 'Unidentified' && (code === 'Space' || event.keyCode === 32)) {
      key = 'Space';
    }

    // We prefer the physical key character (KeyA -> A) when modifiers are active
    if (!key || key === 'Unidentified' || key === 'Dead' || ((event.altKey || event.ctrlKey || event.metaKey) && code && (code.startsWith('Key') || code.startsWith('Digit')))) {
      if (code && code.startsWith('Key')) {
        key = code.slice(3);
      } else if (code && code.startsWith('Digit')) {
        key = code.slice(5);
      } else if (code === 'Space') {
        key = 'Space';
      } else {
        // Fallback to code mapping for symbols if key fails
        const codeMap = {
          'Comma': ',', 'Period': '.', 'Slash': '/', 'Backslash': '\\',
          'BracketLeft': '[', 'BracketRight': ']', 'Quote': "'", 'Semicolon': ';',
          'Minus': '-', 'Equal': '=', 'Backquote': '`'
        };
        if (codeMap[code]) key = codeMap[code];
        else if (code && !code.startsWith('Control') && !code.startsWith('Alt') && !code.startsWith('Shift') && !code.startsWith('Meta')) {
          // Last resort: use code
          key = code;
        }
      }
    }

    // Special keys
    const specialKeys = {
      ' ': 'Space',
      'Escape': 'Esc',
      'ArrowUp': '↑',
      'ArrowDown': '↓',
      'ArrowLeft': '←',
      'ArrowRight': '→',
      'Backspace': '⌫',
      'Delete': 'Del',
      'Enter': '↵',
      'Tab': 'Tab',
      '`': '`',
      '-': '-',
      '=': '=',
      '[': '[',
      ']': ']',
      '\\': '\\',
      ';': ';',
      "'": "'",
      ',': ',',
      '.': '.',
      '/': '/'
    };

    if (specialKeys[key]) return specialKeys[key];

    // Handle modifiers display — distinguish Left vs Right via code
    if (key === 'Control' || key === 'Shift' || key === 'Alt' || key === 'Meta') {
      const side = code === 'ShiftRight' || code === 'ControlRight' || code === 'AltRight' || code === 'MetaRight' ? 'R' : (
        code === 'ShiftLeft' || code === 'ControlLeft' || code === 'AltLeft' || code === 'MetaLeft' ? 'L' : '');
      if (key === 'Control') return (isMac ? '⌃' : 'Ctrl') + side;
      if (key === 'Alt') return (isMac ? '⌥' : 'Alt') + side;
      if (key === 'Shift') return (isMac ? '⇧' : 'Shift') + side;
      if (key === 'Meta') return (isMac ? '⌘' : 'Win') + side;
    }

    if (key && key.length === 1) return key.toUpperCase();
    return key || 'Unknown';
  }

  function normalizeShortcutForOS(keyData) {
    if (!keyData || isMac || !keyData.metaKey) return keyData;

    const normalized = {
      ...keyData,
      metaKey: false,
      altKey: true
    };

    if (normalized.key === 'Meta') {
      normalized.key = 'Alt';
    }

    if (normalized.code && normalized.code.startsWith('Meta')) {
      normalized.code = 'AltLeft';
    }

    normalized.display = getKeyDisplay({
      key: normalized.key,
      code: normalized.code,
      ctrlKey: normalized.ctrlKey,
      altKey: normalized.altKey,
      shiftKey: normalized.shiftKey,
      metaKey: normalized.metaKey
    });

    return normalized;
  }

  // Render shortcut display
  function renderShortcutDisplay(inputEl, keyData) {
    if (!inputEl.dataset.debugId) {
      inputEl.dataset.debugId = 'input_' + Math.random().toString(36).substr(2, 9);
    }

    inputEl.innerHTML = '';

    if (!keyData) {
      const template = document.getElementById('shortcutNoneTemplate');
      inputEl.appendChild(template.content.cloneNode(true));
      inputEl.dataset.key = '';
      return;
    }

    const normalizedKeyData = normalizeShortcutForOS(keyData);
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;

    const addPart = (text) => {
      const template = document.getElementById('shortcutKeySegmentTemplate');
      const clone = template.content.cloneNode(true);
      const span = clone.querySelector('.shortcut-key');
      span.textContent = text;
      inputEl.appendChild(clone);
    };

    if (normalizedKeyData.ctrlKey && normalizedKeyData.key !== 'Control') addPart(isMac ? '⌃' : 'Ctrl');
    if (normalizedKeyData.altKey && normalizedKeyData.key !== 'Alt') addPart(isMac ? '⌥' : 'Alt');
    if (normalizedKeyData.shiftKey && normalizedKeyData.key !== 'Shift') addPart(isMac ? '⇧' : 'Shift');
    if (normalizedKeyData.metaKey && normalizedKeyData.key !== 'Meta') addPart(isMac ? '⌘' : 'Win');

    let display = normalizedKeyData.display;
    if (normalizedKeyData.key === ' ' || normalizedKeyData.code === 'Space') display = 'Space';
    addPart(display);

    inputEl.dataset.key = JSON.stringify(normalizedKeyData);
  }

  // Start recording
  function startRecording(inputEl) {
    if (currentRecordingInput) {
      stopRecording(currentRecordingInput, false);
    }

    currentRecordingInput = inputEl;
    recordingHadInput = false;
    recordingPressedCodes.clear();
    inputEl.classList.add('recording');
    inputEl.innerHTML = '';
    const template = document.getElementById('shortcutRecordingTemplate');
    inputEl.appendChild(template.content.cloneNode(true));
  }

  // Stop recording
  function stopRecording(inputEl, restoreOriginal = true) {
    inputEl.classList.remove('recording');

    if (restoreOriginal && inputEl.dataset.key) {
      // Restore from data attr if valid JSON
      try {
        const keyData = JSON.parse(inputEl.dataset.key);
        renderShortcutDisplay(inputEl, keyData);
      } catch (e) {
        renderShortcutDisplay(inputEl, null);
      }
    } else if (restoreOriginal && !inputEl.dataset.key) {
      renderShortcutDisplay(inputEl, null);
    }

    if (currentRecordingInput === inputEl) {
      currentRecordingInput = null;
    }
  }

  function recordMouseShortcut(inputEl, button, modifiers = {}) {
    const code = 'Mouse' + button;

    const keyData = {
      code: code,
      key: code,
      display: getKeyDisplay({ code: code }),
      ctrlKey: !!modifiers.ctrlKey,
      altKey: !!modifiers.altKey,
      shiftKey: !!modifiers.shiftKey,
      metaKey: !!modifiers.metaKey
    };

    renderShortcutDisplay(inputEl, keyData);
    recordingHadInput = true;
    suppressNextShortcutClick = inputEl;
    setTimeout(() => {
      if (suppressNextShortcutClick === inputEl) {
        suppressNextShortcutClick = null;
      }
    }, 0);

    stopRecording(inputEl, false);
    saveOptions();
  }

  // Show live preview of modifiers being pressed
  function showModifierPreview(e) {
    if (!currentRecordingInput) return;

    // Use standard symbols for live preview
    if (hasModifiers) {
      // already added segments
    } else {
      currentRecordingInput.innerHTML = '';
      const template = document.getElementById('shortcutRecordingTemplate');
      currentRecordingInput.appendChild(template.content.cloneNode(true));
    }
  }

  // Initialize shortcut inputs
  document.querySelectorAll('.shortcut-input').forEach(input => {
    const action = input.dataset.action;
    const defaultKey = (typeof LUMINA_DEFAULT_SHORTCUTS !== 'undefined') ? LUMINA_DEFAULT_SHORTCUTS[action] : null;

    // Wrap input in a container for relative positioning
    if (!input.parentElement.classList.contains('shortcut-input-container')) {
      const container = document.createElement('div');
      container.className = 'shortcut-input-container';
      container.style.position = 'relative';
      container.style.display = 'flex';
      container.style.alignItems = 'center';
      container.style.gap = '8px';
      if (action) {
        container.style.marginLeft = 'auto'; // Align to right only global shortcuts
      }

      input.parentElement.insertBefore(container, input);
      container.appendChild(input);
    }

    // Set default
    if (defaultKey) {
      renderShortcutDisplay(input, defaultKey);
    }

    // Click to start recording
    input.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation(); // Stop bubbling

      if (suppressNextShortcutClick === input) {
        suppressNextShortcutClick = null;
        return;
      }

      startRecording(input);
    });

    input.addEventListener('contextmenu', (e) => {
      if (currentRecordingInput === input) {
        e.preventDefault();
      }
    });

    // Focus also starts recording, BUT we debounce/check if it's already active to avoid fighting with click
    input.addEventListener('focus', (e) => {
      // If we just clicked, click handler takes precedence
      if (currentRecordingInput !== input) {
        startRecording(input);
      }
    });

    // Blur stops recording
    input.addEventListener('blur', (e) => {
      // Only stop if we are not clicking another part of the extension UI
      setTimeout(() => {
        if (currentRecordingInput === input) {
          if (!recordingHadInput) {
            // Nothing was recorded — reset shortcut to None
            renderShortcutDisplay(input, null);
            input.dataset.key = '';
            stopRecording(input, false);

            // Only auto-save global shortcuts or mapping rows
            // Web sources (sourceFormShortcut) must be saved via their form button
            if (input.dataset.action || input.classList.contains('mapping-key-input')) {
              saveOptions();
            }
          } else {
            stopRecording(input, true);
          }
        }
      }, 100);
    });
  });

  // Mouse down listener for recording mouse buttons
  document.addEventListener('mousedown', (e) => {
    if (!currentRecordingInput) return;

    const shortcutTarget = e.target.classList.contains('shortcut-input')
      ? e.target
      : e.target.closest?.('.shortcut-input');

    // If clicking a different shortcut input, let that input's own click handler manage it.
    if (shortcutTarget && shortcutTarget !== currentRecordingInput) return;

    // Prevent default actions (like losing focus or context menu)
    e.preventDefault();
    e.stopPropagation();

    if (shortcutTarget !== currentRecordingInput) {
      if (e.button !== 0) {
        return;
      }

      const input = currentRecordingInput;
      // Left click outside = cancel and reset shortcut to None
      renderShortcutDisplay(input, null);
      input.dataset.key = '';
      recordingHadInput = false;
      stopRecording(input, false);

      if (input.dataset.action || input.classList.contains('mapping-key-input')) {
        saveOptions();
      }
      return;
    }

    // Mouse buttons on the active shortcut input are recorded as shortcuts.
    recordMouseShortcut(currentRecordingInput, e.button, e);
  }, true);

  // Keyboard events
  document.addEventListener('keydown', (e) => {
    if (!currentRecordingInput) return;

    e.preventDefault();
    e.stopPropagation();

    recordingPressedCodes.add(e.code);

    // Check if it's a modifier key
    const isModifier = ['Control', 'Alt', 'Shift', 'Meta'].includes(e.key);

    // Detect both-sides: if user presses both Left + Right of the same modifier,
    // use the generic code (e.g. 'Shift') instead of a side-specific one.
    let code = e.code;
    if (isModifier) {
      const MODIFIER_PAIRS = {
        'Shift': ['ShiftLeft', 'ShiftRight'],
        'Control': ['ControlLeft', 'ControlRight'],
        'Alt': ['AltLeft', 'AltRight'],
        'Meta': ['MetaLeft', 'MetaRight'],
      };
      const pair = MODIFIER_PAIRS[e.key];
      if (pair && recordingPressedCodes.has(pair[0]) && recordingPressedCodes.has(pair[1])) {
        code = e.key; // generic — no side
      }
    }

    const keyData = {
      code: code,
      key: e.key,
      display: getKeyDisplay({ key: e.key, code: code, ctrlKey: e.ctrlKey, altKey: e.altKey, shiftKey: e.shiftKey, metaKey: e.metaKey }),
      ctrlKey: e.ctrlKey,
      altKey: e.altKey,
      shiftKey: e.shiftKey,
      metaKey: e.metaKey
    };

    // If it's a modifier key, we update the preview but we DO NOT finish recording yet

    if (isModifier) {
      // Just show preview/update current data but don't finish
      renderShortcutDisplay(currentRecordingInput, keyData);
      // We don't blur immediately for modifiers
    } else {
      // Non-modifier key pressed: Finish recording
      renderShortcutDisplay(currentRecordingInput, keyData);
      recordingHadInput = true;
      const input = currentRecordingInput;
      input.classList.remove('recording');
      input.blur();
      currentRecordingInput = null;

      if (input.dataset.action || input.classList.contains('mapping-key-input')) {
        saveOptions();
      }
    }
  }, true); // Use capture phase

  // Global keyup handler 
  document.addEventListener('keyup', (e) => {
    recordingPressedCodes.delete(e.code);

    if (!currentRecordingInput) return;

    const isModifier = ['Control', 'Alt', 'Shift', 'Meta'].includes(e.key);

    // If we release a modifier key, and that modifier was arguably the *only* thing pressed...
    if (isModifier) {
      // We check if the currently displayed/stored key matches this modifier.
      recordingHadInput = true;
      const input = currentRecordingInput;
      input.classList.remove('recording');
      input.blur();
      currentRecordingInput = null;

      if (input.dataset.action || input.classList.contains('mapping-key-input')) {
        saveOptions();
      }
    }
  }, true);

  // Load saved shortcuts
  chrome.storage.local.get(['shortcuts'], (items) => {
    const savedShortcuts = items.shortcuts || {};

    document.querySelectorAll('.shortcut-input').forEach(input => {
      const action = input.dataset.action;

      // Skip if this is a mapping input (no action attribute)
      if (!action) return;

      if (action in savedShortcuts) {
        renderShortcutDisplay(input, savedShortcuts[action]);
      }
    });
  });

  // Listen for storage changes
  chrome.storage.onChanged.addListener((changes, areaName) => {
    // Reload chat history if it changes
    if (areaName === 'local' && changes.chat_history && typeof loadChatHistory === 'function') {
      loadChatHistory();
    }
  });

  function initMentionForInput(inputEl) {
    const wrapper = inputEl.closest('.mapping-prompt-wrapper');
    if (!wrapper) return;

    let popup = wrapper.querySelector('.lumina-mention-popup');
    if (!popup) {
      popup = document.createElement('div');
      popup.className = 'lumina-mention-popup';
      wrapper.appendChild(popup);
    }

    let selectedIndex = 0;
    const options = [{ name: 'SelectedText' }];

    const hidePopup = () => {
      popup.classList.remove('active');
    };

    const renderPopup = (matches) => {
      popup.innerHTML = '';
      matches.forEach((item, idx) => {
        const div = document.createElement('div');
        div.className = `lumina-mention-item ${idx === selectedIndex ? 'selected' : ''}`;
        div.innerHTML = `<span>${item.name}</span>`;
        div.onclick = (e) => {
          e.stopPropagation();
          selectItem(item);
        };
        popup.appendChild(div);
      });
      popup.classList.add('active');
      popup.dataset.matches = JSON.stringify(matches);
    };

    const selectItem = (item) => {
      const selection = window.getSelection();
      if (!selection.rangeCount) return;
      
      const range = selection.getRangeAt(0);
      let textNode = range.startContainer;
      
      // If cursor is at the end of a tag or in empty div
      if (textNode.nodeType !== Node.TEXT_NODE) {
        // Find the last text node or create one if empty
        if (textNode.childNodes.length === 0) {
          textNode.appendChild(document.createTextNode(''));
          textNode = textNode.firstChild;
        } else {
          // Find the at trigger manually if needed, but usually we are in text
          return hidePopup();
        }
      }

      const val = textNode.textContent || '';
      const offset = range.startOffset;
      const textBefore = val.substring(0, offset);
      const lastAt = textBefore.lastIndexOf('@');
      
      if (lastAt !== -1) {
        range.setStart(textNode, lastAt);
        range.setEnd(textNode, offset);
        range.deleteContents();
        
        const tag = document.createElement('span');
        tag.className = 'lumina-mention-tag';
        tag.textContent = item.name;
        tag.contentEditable = 'false';
        
        range.insertNode(tag);
        
        const nextNode = document.createTextNode(' ');
        tag.after(nextNode);
        
        range.setStartAfter(nextNode);
        range.setEndAfter(nextNode);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      
      hidePopup();
      inputEl.focus();
      if (typeof saveOptions === 'function') saveOptions();
    };

    inputEl.addEventListener('input', (e) => {
      const selection = window.getSelection();
      if (!selection.rangeCount) return hidePopup();
      const range = selection.getRangeAt(0);
      const textNode = range.startContainer;
      
      if (textNode.nodeType !== Node.TEXT_NODE) {
        return hidePopup();
      }
      
      const val = textNode.textContent || '';
      const offset = range.startOffset;
      const textBefore = val.substring(0, offset);
      const lastAt = textBefore.lastIndexOf('@');

      if (lastAt !== -1) {
        const query = textBefore.substring(lastAt + 1).toLowerCase();
        if (!query.includes(' ')) {
          const matches = options.filter(o => o.name.toLowerCase().includes(query));
          if (matches.length > 0) {
            selectedIndex = 0;
            renderPopup(matches);
            return;
          }
        }
      }
      hidePopup();
    });

    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !popup.classList.contains('active')) {
        e.preventDefault(); // Prevent newlines in mapping prompt
        return;
      }

      if (!popup.classList.contains('active')) return;
      const matches = JSON.parse(popup.dataset.matches || '[]');

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedIndex = (selectedIndex + 1) % matches.length;
        renderPopup(matches);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedIndex = (selectedIndex - 1 + matches.length) % matches.length;
        renderPopup(matches);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (matches[selectedIndex]) selectItem(matches[selectedIndex]);
      } else if (e.key === 'Escape') {
        hidePopup();
      }
    });

    document.addEventListener('click', (e) => {
      if (!wrapper.contains(e.target)) {
        hidePopup();
      }
    });
  }

  function refreshMappingNumbers() {
    const mappingsList = document.getElementById('questionMappingsList');
    if (!mappingsList) return;
    mappingsList.querySelectorAll('.mapping-item').forEach((item, index) => {
      const numberEl = item.querySelector('.mapping-number');
      if (numberEl) numberEl.textContent = index + 1;
    });
  }

  function renderMappingRow(keyDataOrSimpleKey = null, prompt = '') {
    const mappingsList = document.getElementById('questionMappingsList');
    if (!mappingsList) return;

    // Support both old {key: "Q"} and new {keyData: {...}}
    let keyData = null;
    if (keyDataOrSimpleKey) {
      if (typeof keyDataOrSimpleKey === 'string') {
        keyData = { key: keyDataOrSimpleKey };
      } else {
        keyData = keyDataOrSimpleKey;
      }
    }

    const template = document.getElementById('mappingRowTemplate');
    const clone = template.content.cloneNode(true);
    const div = clone.querySelector('.mapping-item');

    const keyDisplay = div.querySelector('.mapping-key-input');
    const promptInput = div.querySelector('.mapping-prompt');
    const deleteBtn = div.querySelector('.mapping-delete-btn');

    if (keyData) {
      renderShortcutDisplay(keyDisplay, keyData);
    }
    if (prompt) {
      // Convert "SelectedText" string to tags visually
      const parts = prompt.split('SelectedText');
      promptInput.innerHTML = '';
      parts.forEach((part, i) => {
        if (part) promptInput.appendChild(document.createTextNode(part));
        if (i < parts.length - 1) {
          const tag = document.createElement('span');
          tag.className = 'lumina-mention-tag';
          tag.textContent = 'SelectedText';
          tag.contentEditable = 'false';
          promptInput.appendChild(tag);
        }
      });
    }

    keyDisplay.addEventListener('click', () => {
      startRecording(keyDisplay);
    });

    promptInput.addEventListener('input', saveOptions);
    initMentionForInput(promptInput);

    deleteBtn.addEventListener('click', () => {
      div.remove();
      refreshMappingNumbers();
      saveOptions();
    });

    mappingsList.appendChild(div);
    refreshMappingNumbers();
  }


  // Load Question Mappings (Moved logic here to use the updated render function)
  function loadQuestionMappings(items) {
    const savedMappings = items.questionMappings || [];
    const mappingsList = document.getElementById('questionMappingsList');
    if (mappingsList) {
      mappingsList.innerHTML = '';
      savedMappings.forEach(m => {
        // Support both old {key: "Q"} and new {keyData: {...}}
        const data = m.keyData || m.key;
        renderMappingRow(data, m.prompt);
      });
      refreshMappingNumbers();
    }
  }

  // Hook into storage load (we need to recall this or update the original call site)

  if (addMappingBtn) {
    addMappingBtn.addEventListener('click', () => {
      renderMappingRow();
      saveOptions(); // Trigger save so the new row is persisted immediately
    });
  }




  // Listen for changes
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      // Refresh facts list when memory changes
      if (changes.user_memory) {
        renderUserFacts();
        updateMemoryStats();
      }
    }
  });

  const userFactsList = document.getElementById('userFactsList');
  const newFactInput = document.getElementById('newFactInput');
  const addFactBtn = document.getElementById('addFactBtn');

  // Render facts list
  async function renderUserFacts() {
    if (!userFactsList) return;

    const memory = await UserMemory.load();
    const facts = memory.facts || [];

    userFactsList.innerHTML = '';

    if (facts.length === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'chain-empty-state';
      emptyDiv.textContent = 'No instructions yet. Add new instruction above.';
      userFactsList.appendChild(emptyDiv);
      return;
    }

    facts.forEach((fact, index) => {
      const template = document.getElementById('userFactItemTemplate');
      const clone = template.content.cloneNode(true);
      const item = clone.querySelector('.fact-item');

      item.querySelector('.fact-index').textContent = index + 1;
      const input = item.querySelector('.fact-text');
      input.value = fact;

      input.addEventListener('blur', async () => {
        const newVal = input.value.trim();
        if (newVal === '') {
          await UserMemory.removeFact(index);
          renderUserFacts();
        } else if (newVal !== facts[index]) {
          await UserMemory.updateFact(index, newVal);
          renderUserFacts();
        }
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          input.blur();
        }
      });

      item.querySelector('.fact-remove-btn').addEventListener('click', async () => {
        await UserMemory.removeFact(index);
        renderUserFacts();
      });

      userFactsList.appendChild(clone);
    });
  }

  // Add new fact
  if (newFactInput) {
    newFactInput.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const fact = newFactInput.value.trim();
        if (fact) {
          await UserMemory.addFact(fact);
          newFactInput.value = '';
          renderUserFacts();
        }
      }
    });
  }

  // Set Global Defaults / Apply to All Pages Button
  const setGlobalDefaultsBtn = document.getElementById('setGlobalDefaultsBtn');
  const resetSettingsBtn = document.getElementById('resetSettingsBtn');

  if (setGlobalDefaultsBtn) {
    setGlobalDefaultsBtn.addEventListener('click', () => {
    const fontSize = parseFloat(fontSizeInput.value) || 13;
    const theme = document.querySelector('input[name="theme"]:checked')?.value || 'light';

    const defaults = {
      fontSize: fontSize,
      theme: theme
    };

    chrome.storage.local.set({
      globalDefaults: defaults,
      fontSizeByDomain: {},
      theme: theme,
      fontSize: fontSize
    }, () => {
      // Show feedback
      const originalHTML = setGlobalDefaultsBtn.innerHTML;
      setGlobalDefaultsBtn.innerHTML = '';
      const template = document.getElementById('appliedStateTemplate');
      if (template) {
        setGlobalDefaultsBtn.appendChild(template.content.cloneNode(true));
      }
      setGlobalDefaultsBtn.classList.add('btn-applied');

      // ... Broadcast logic ...
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach((tab) => {
          const isLuminaPage = tab.url && tab.url.startsWith(chrome.runtime.getURL(''));
          if (tab.url && (tab.url.startsWith('http') || tab.url.startsWith('https') || isLuminaPage) && tab.id) {
            chrome.tabs.sendMessage(tab.id, {
              action: 'settings_updated',
              settings: {
                globalDefaults: defaults,
                fontSize: fontSize,
                theme: theme,
                fontSizeByDomain: {}
              }
            }).catch(() => { }); // Ignore errors
          }
        });
      });

        setTimeout(() => {
          setGlobalDefaultsBtn.innerHTML = originalHTML;
          setGlobalDefaultsBtn.classList.remove('btn-applied');
        }, 1500);
      });
    });
  }

  if (resetSettingsBtn) {
    resetSettingsBtn.addEventListener('click', () => {
      const defaultFontSize = 13;
      const defaultTheme = 'light';
      const defaultAudioSpeed = 1.0;

      // Update UI Inputs
      if (fontSizeInput) fontSizeInput.value = defaultFontSize;
      if (audioSpeedInput) audioSpeedInput.value = defaultAudioSpeed;

      const radio = document.querySelector(`input[name="theme"][value="${defaultTheme}"]`);
      if (radio) radio.checked = true;

      // Apply theme immediately
      applyTheme(defaultTheme);

      // Save to storage (resetting both global and domain-specific for these values)
      chrome.storage.local.set({
        fontSize: defaultFontSize,
        theme: defaultTheme,
        audioSpeed: defaultAudioSpeed,
        fontSizeByDomain: {},
        globalDefaults: {
          fontSize: defaultFontSize,
          theme: defaultTheme,
          audioSpeed: defaultAudioSpeed
        }
      }, () => {
        // Show feedback
        updateStatus('Settings reset to system defaults', 'success');

        // Broadcast update
        chrome.tabs.query({}, (tabs) => {
          tabs.forEach((tab) => {
            if (tab.id) {
              chrome.tabs.sendMessage(tab.id, {
                action: 'settings_updated',
                settings: {
                  fontSize: defaultFontSize,
                  theme: defaultTheme,
                  fontSizeByDomain: {}
                }
              }).catch(() => { });
            }
          });
        });
      });
    });
  }


  // Initial render - Defer execution to prioritize main UI
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => {
      renderUserFacts();
    });
  } else {
    setTimeout(() => {
      renderUserFacts();
    }, 200);
  }


  // --- Auth & Sync Logic ---
  const googleLoginBtn = document.getElementById('googleLoginBtn');
  const googleLogoutBtn = document.getElementById('googleLogoutBtn');
  const authLoggedOut = document.getElementById('auth-logged-out');
  const authLoggedIn = document.getElementById('auth-logged-in');
  const userAvatar = document.getElementById('userAvatar');
  const userName = document.getElementById('userName');
  const userEmail = document.getElementById('userEmail');
  const syncCard = document.getElementById('syncCard');
  const syncUpBtn = document.getElementById('syncUpBtn');
  const syncDownBtn = document.getElementById('syncDownBtn');
  const syncStatus = document.getElementById('syncStatus');

  function updateAuthUI(isAuthenticated, user) {
    if (isAuthenticated && user) {
      if (authLoggedOut) authLoggedOut.classList.add('hidden');
      if (authLoggedIn) authLoggedIn.classList.remove('hidden');
      if (userAvatar) userAvatar.src = user.picture;
      if (userName) userName.textContent = user.name;
      if (userEmail) userEmail.textContent = user.email;

      // Enable Sync Card
      if (syncCard) {
        syncCard.style.opacity = '1';
        syncCard.style.pointerEvents = 'auto';

        // Always fetch last sync time when authenticated
        LuminaSync.getLastSyncTime().then(time => {
          if (syncStatus && time !== 'Never') {
            syncStatus.textContent = `Last synced: ${time}`;
            syncStatus.style.color = 'var(--text-secondary)';
          }
        });
      }
    } else {
      if (authLoggedOut) authLoggedOut.classList.remove('hidden');
      if (authLoggedIn) authLoggedIn.classList.add('hidden');

      // Disable Sync Card
      if (syncCard) {
        syncCard.style.opacity = '0.5';
        syncCard.style.pointerEvents = 'none';
      }
    }
  }

  // Bind Listeners
  if (googleLoginBtn) {
    googleLoginBtn.addEventListener('click', async () => {
      try {
        googleLoginBtn.disabled = true;
        const originalHTML = googleLoginBtn.innerHTML;
        googleLoginBtn.innerHTML = '';
        const template = document.getElementById('signingInStateTemplate');
        googleLoginBtn.appendChild(template.content.cloneNode(true));

        const user = await LuminaAuth.login();
        updateStatus('Signed in successfully', 'success');

        // Restore HTML (though it might be hidden now)
        googleLoginBtn.innerHTML = originalHTML;
      } catch (e) {
        console.error(e);
        updateStatus('Sign in failed: ' + e.message, 'error');
        googleLoginBtn.innerHTML = 'Sign in with Google'; // Fallback
      } finally {
        googleLoginBtn.disabled = false;
      }
    });
  }

  if (googleLogoutBtn) {
    googleLogoutBtn.addEventListener('click', async () => {
      await LuminaAuth.logout();
      updateStatus('Signed out', 'info');
    });
  }

  if (syncUpBtn) {
    syncUpBtn.addEventListener('click', async () => {
      syncUpBtn.disabled = true;
      try {
        await LuminaSync.syncUp();
        // UI updates handled by listener
      } catch (e) {
        // Error logging handled by listener/catch block in SyncManager
      } finally {
        syncUpBtn.disabled = false;
      }
    });
  }

  if (syncDownBtn) {
    syncDownBtn.addEventListener('click', async () => {
      if (!confirm('This will overwrite your current settings with data from the cloud. Continue?')) return;

      syncDownBtn.disabled = true;
      try {
        const result = await LuminaSync.syncDown();
        if (result) {
          setTimeout(() => location.reload(), 1000);
        }
      } catch (e) {
        // Error handled by listener
      } finally {
        syncDownBtn.disabled = false;
      }
    });
  }

  // Handle Sync Updates
  LuminaSync.addListener((status, timestamp) => {
    if (syncStatus) {
      if (timestamp) {
        const timeStr = new Date(timestamp).toLocaleString();
        syncStatus.textContent = `Last synced: ${timeStr}`;
        syncStatus.style.color = 'var(--text-secondary)';
      } else {
        syncStatus.textContent = status;
        if (status.includes('failed') || status.includes('No backup')) {
          syncStatus.style.color = '#dc3545';
        } else {
          syncStatus.style.color = 'var(--text-secondary)';
        }
      }
    }
  });

  // Initialize Listener
  LuminaAuth.addListener(updateAuthUI);

  // Initial check
  if (LuminaAuth.isAuthenticated) {
    updateAuthUI(true, LuminaAuth.user);
    // Show initial sync time
    LuminaSync.getLastSyncTime().then(time => {
      if (syncStatus && time !== 'Never') {
        syncStatus.textContent = `Last synced: ${time}`;
      }
    });
  }

  // --- Manual Backup Logic ---
  const exportSettingsBtn = document.getElementById('exportSettingsBtn');
  const importSettingsBtn = document.getElementById('importSettingsBtn');
  const importSettingsFile = document.getElementById('importSettingsFile');

  if (exportSettingsBtn) {
    exportSettingsBtn.addEventListener('click', async () => {
      try {
        const data = await chrome.storage.local.get(null);
        const exportObj = {
          timestamp: new Date().toISOString(),
          version: chrome.runtime.getManifest().version,
          data: data
        };

        const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `lumina_backup_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        updateStatus('Backup file exported', 'success');
      } catch (e) {
        console.error(e);
        updateStatus('Export failed: ' + e.message, 'error');
      }
    });
  }

  if (importSettingsBtn && importSettingsFile) {
    importSettingsBtn.addEventListener('click', () => {
      importSettingsFile.click();
    });

    importSettingsFile.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      if (!confirm('This will overwrite current settings with the backup file. Continue?')) {
        importSettingsFile.value = ''; // Reset
        return;
      }

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const content = JSON.parse(event.target.result);

          // Validate structure (check for 'data' key or assume flat)
          let dataToRestore = content;
          if (content.data && content.timestamp) {
            dataToRestore = content.data; // New structure
          }

          await chrome.storage.local.clear();
          await chrome.storage.local.set(dataToRestore);

          updateStatus('Settings restored successfully', 'success');
          setTimeout(() => location.reload(), 1000);
        } catch (err) {
          console.error(err);
          alert('Invalid backup file');
        } finally {
          importSettingsFile.value = '';
        }
      };
      reader.readAsText(file);
    });
  }

  // Handle URL parameters (e.g., section navigation or mic permission request)
  const urlParams = new URLSearchParams(window.location.search);
  const sectionParam = urlParams.get('section');
  if (sectionParam) {
    switchSection(sectionParam);
  }

  if (urlParams.get('requestMic') === '1') {
    console.log('[Options] Requesting mic permission via URL parameter');
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        console.log('[Options] Mic permission granted');
        stream.getTracks().forEach(track => track.stop());
      })
      .catch(err => {
        console.error('[Options] Mic permission denied:', err);
      });
  }
});

