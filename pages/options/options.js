document.addEventListener('DOMContentLoaded', () => {
  // --- Fast Theme Load ---
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
  // -------------------------

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

  // Open Web App
  const openSpotlightWebAppBtn = document.getElementById('openSpotlightWebAppBtn');
  if (openSpotlightWebAppBtn) {
    openSpotlightWebAppBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('pages/spotlight/spotlight.html') + '?webapp=1' });
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
  const visionProviderSelect = document.getElementById('visionProvider');

  // Define mappings elements globally for scope access
  const mappingsList = document.getElementById('questionMappingsList');
  const addMappingBtn = document.getElementById('addMappingBtn');
  const visionModelInput = document.getElementById('visionModel');
  const visionModelList = document.getElementById('visionModelList');
  const voiceProviderInput = document.getElementById('voiceProvider');
  const voiceProviderList = document.getElementById('voiceProviderList');
  const voiceModelInput = document.getElementById('voiceModel');
  const voiceModelList = document.getElementById('voiceModelList');
  const googleApiKeyInput = document.getElementById('googleApiKey');
  const googleCxInput = document.getElementById('googleCx');
  const fontSizeInput = document.getElementById('fontSize');
  const decreaseFontSizeBtn = document.getElementById('decreaseFontSize');
  const increaseFontSizeBtn = document.getElementById('increaseFontSize');
  const popupWidthInput = document.getElementById('popupWidth');
  const widthValue = document.getElementById('widthValue');
  const popupHeightInput = document.getElementById('popupHeight');
  const heightValue = document.getElementById('heightValue');
  const askSelectionPopupBtn = document.getElementById('askSelectionPopupBtn');
  let isAskSelectionPopupEnabled = false;
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

  // Translation Provider Elements
  const transProviderRadios = document.getElementsByName('transProvider');
  const deeplConfig = document.getElementById('deeplConfig');
  const aiTranslationConfig = document.getElementById('aiTranslationConfig');
  const transModelProviderInput = document.getElementById('transModelProvider');
  const transModelProviderList = document.getElementById('transModelProviderList');
  const transModelInput = document.getElementById('transModelInput');
  const transModelList = document.getElementById('transModelList');

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

      chrome.storage.local.get(['disabledDomains', 'fontSizeByDomain', 'popupDimensionsByDomain'], (items) => {
        const disabledDomains = items.disabledDomains || [];
        const isEnabled = !disabledDomains.includes(currentHostname);

        siteToggle.checked = isEnabled;
        siteToggleLabel.textContent = currentHostname;

        // Labels removed in HTML as per user request

        // Apply domain-specific values (overwriting whatever the global load set)
        const fontSizeByDomain = items.fontSizeByDomain || {};
        if (fontSizeByDomain[currentHostname]) {
          fontSizeInput.value = fontSizeByDomain[currentHostname];
        }

        const popupDimensionsByDomain = items.popupDimensionsByDomain || {};
        if (popupDimensionsByDomain[currentHostname]) {
          const dims = popupDimensionsByDomain[currentHostname];
          if (dims.width) {
            popupWidthInput.value = dims.width;
            widthValue.textContent = dims.width + 'px';
          }
          if (dims.height) {
            popupHeightInput.value = dims.height;
            heightValue.textContent = dims.height + 'px';
          }
        }
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

  // Use shared PROVIDERS constant from libs/constants.js
  const PROVIDERS = LUMINA_PROVIDERS;

  // Render provider list
  function renderProviders() {
    if (!providerListEl) return;

    if (providers.length === 0) {
      providerListEl.innerHTML = '<div class="provider-empty">No providers added yet. Add one above to get started.</div>';
      return;
    }

    providerListEl.innerHTML = providers.map(p => {
      const isDefault = p.id === 'groq-default' || p.id === 'gemini-default' || p.id === 'cerebras-default' || p.id === 'mistral-default';
      const badge = isDefault ? 'default' : 'custom';
      const badgeClass = isDefault ? 'provider-item-badge-default' : 'provider-item-badge-custom';
      const deleteBtn = isDefault
        ? ''
        : `<button class="provider-delete-btn" data-id="${p.id}">Delete</button>`;

      return `
      <div class="provider-item" data-id="${p.id}">
        <div class="provider-item-info">
          <div class="provider-item-name">${escapeHtml(p.name)}</div>
          <div class="provider-item-endpoint">${escapeHtml(p.endpoint)}</div>
        </div>
        <span class="${badgeClass}">${badge}</span>
        <div class="provider-item-actions">
          <button class="provider-edit-btn" data-id="${p.id}">Edit</button>
          ${deleteBtn}
        </div>
      </div>
      `;
    }).join('');

    // Add event listeners
    providerListEl.querySelectorAll('.provider-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => editProvider(btn.dataset.id));
    });
    providerListEl.querySelectorAll('.provider-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => deleteProvider(btn.dataset.id));
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

    // Vision AI provider dropdown
    if (visionProviderSelect) {
      const currentVal = visionProviderSelect.value;
      visionProviderSelect.innerHTML = '<option value="">Same as Text AI</option>';
      providers.forEach(p => {
        visionProviderSelect.innerHTML += `<option value="${p.id}">${escapeHtml(p.name)}</option>`;
      });
      if (currentVal && providers.find(p => p.id === currentVal)) {
        visionProviderSelect.value = currentVal;
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
    if (apiKeyLink) apiKeyLink.style.display = 'none';

    providerForm.style.display = 'block';
    addProviderBtn.style.display = 'none';
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
        apiKeyLink.style.display = 'inline-block';
      } else {
        apiKeyLink.style.display = 'none';
      }
    }

    providerForm.style.display = 'block';
    addProviderBtn.style.display = 'none';
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
    if (id === 'groq-default' || id === 'gemini-default') {
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
    providerForm.style.display = 'none';
    addProviderBtn.style.display = 'block';
  }






  // Migrate old settings to new provider system OR create default providers
  async function migrateOldSettings() {
    const oldSettings = await chrome.storage.local.get([
      'providers', 'groqApiKey', 'geminiApiKey', 'openrouterApiKey'
    ]);

    // If providers already exist, use them
    if (oldSettings.providers && oldSettings.providers.length > 0) {
      providers = oldSettings.providers;

      // Auto-add Cerebras if missing
      if (!providers.some(p => p.id === 'cerebras-default')) {
        providers.push({
          id: 'cerebras-default',
          name: 'Cerebras',
          type: 'openai',
          endpoint: 'https://api.cerebras.ai/v1/chat/completions',
          apiKey: ''
        });
      }

      // Auto-add Mistral if missing
      if (!providers.some(p => p.id === 'mistral-default')) {
        providers.push({
          id: 'mistral-default',
          name: 'Mistral',
          type: 'openai',
          endpoint: 'https://api.mistral.ai/v1/chat/completions',
          apiKey: ''
        });
      }

      // Sort providers A-Z
      providers.sort((a, b) => a.name.localeCompare(b.name));

      await chrome.storage.local.set({ providers });
      return;
    }

    // Default providers - Groq and Gemini (users just need to add API keys)
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
        type: 'gemini',
        endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
        apiKey: oldSettings.geminiApiKey || ''
      },
      {
        id: 'groq-default',
        name: 'Groq',
        type: 'openai',
        endpoint: 'https://api.groq.com/openai/v1/chat/completions',
        apiKey: oldSettings.groqApiKey || ''
      }
    ];

    // Add OpenRouter only if user had a key before
    if (oldSettings.openrouterApiKey) {
      defaultProviders.push({
        id: 'openrouter-migrated',
        name: 'OpenRouter',
        type: 'openai',
        endpoint: 'https://openrouter.ai/api/v1/chat/completions',
        apiKey: oldSettings.openrouterApiKey
      });
    }

    providers = defaultProviders;
    await chrome.storage.local.set({ providers: defaultProviders });
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
      apiKeyResults.style.display = 'block';
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
                testUrl = provider.endpoint.replace('/chat/completions', '/models');
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
      apiKeyResultsList.innerHTML = results.map(r => {
        let color, icon;
        if (r.status === 'ok') { color = '#34C759'; icon = '✅'; }
        else if (r.status === 'partial') { color = '#FF9500'; icon = '⚠️'; }
        else if (r.status === 'skip') { color = '#8E8E93'; icon = '⏭️'; }
        else { color = '#FF3B30'; icon = '❌'; }

        let failedInfo = '';
        if (r.failedKeys && r.failedKeys.length > 0) {
          failedInfo = r.failedKeys.map(fk =>
            `<div style="font-size: 11px; color: #FF3B30; margin-left: 20px; font-family: monospace;">• <code style="background: rgba(255,59,48,0.1); padding: 2px 6px; border-radius: 4px;">${fk.key}</code> → ${fk.status}</div>`
          ).join('');
        }

        return `
          <div style="padding: 8px 12px; background: var(--surface-bg); border-radius: 8px; border-left: 3px solid ${color};">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-weight: 520;">${icon} ${r.name}</span>
              <span style="font-size: 12px; color: ${color};">${r.message}</span>
            </div>
            ${failedInfo}
          </div>
        `;
      }).join('');

      checkApiKeysBtn.disabled = false;
      checkApiKeysBtn.textContent = '🔍 Check API Keys';
    });
  }

  let textChain = [];
  let visionChain = [];
  let currentlyConfiguringModel = null;
  let currentlyConfiguringProvider = null;
  let advancedParamsByModel = {};
  let isSelectingModel = false; // Flag to prevent blur from hiding dropdown during selection

  const textChainListEl = document.getElementById('textChainList');
  const visionChainListEl = document.getElementById('visionChainList');
  const addTextChainBtn = document.getElementById('addTextChainBtn');
  const addVisionChainBtn = document.getElementById('addVisionChainBtn');
  const textChainProviderInput = document.getElementById('textChainProvider');
  const textChainProviderList = document.getElementById('textChainProviderList');
  const textChainModelInput = document.getElementById('textChainModel');
  const visionChainProviderSelect = document.getElementById('visionChainProvider');
  const visionChainModelInput = document.getElementById('visionChainModel');

  const textChainModelList = document.getElementById('textChainModelList');
  const visionChainModelList = document.getElementById('visionChainModelList');

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
            if (prov) fetchModelsForProvider(prov, '', false, false, false, 'textChainModelList', 'textChainModel');
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
      if (prov) fetchModelsForProvider(prov, textChainModelInput.value, false, false, false, 'textChainModelList', 'textChainModel');
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
  }

  // Vision Chain Provider (custom dropdown)
  const visionChainProviderInput = document.getElementById('visionChainProvider');
  const visionChainProviderList = document.getElementById('visionChainProviderList');

  if (visionChainProviderInput && visionChainProviderList) {
    // Initially disable model input until provider is selected
    if (visionChainModelInput) {
      visionChainModelInput.disabled = true;
      visionChainModelInput.placeholder = 'Select provider first...';
    }

    visionChainProviderInput.addEventListener('click', () => {
      const isVisible = visionChainProviderList.style.display === 'block';
      visionChainProviderList.style.display = isVisible ? 'none' : 'block';

      if (!isVisible) {
        visionChainProviderList.innerHTML = providers.map(p =>
          `<div class="dropdown-item" data-value="${p.id}">${escapeHtml(p.name)}</div>`
        ).join('');

        visionChainProviderList.querySelectorAll('.dropdown-item').forEach(item => {
          item.addEventListener('click', () => {
            visionChainProviderInput.value = item.textContent;
            visionChainProviderInput.dataset.providerId = item.dataset.value;
            visionChainProviderList.style.display = 'none';

            // Enable model input
            if (visionChainModelInput) {
              visionChainModelInput.disabled = false;
              visionChainModelInput.placeholder = 'Type or select model...';
            }

            const prov = getProviderById(item.dataset.value);
            if (prov) fetchModelsForProvider(prov, '', true, false, false, 'visionChainModelList', 'visionChainModel');
          });
        });
      }
    });

    document.addEventListener('click', (e) => {
      if (!visionChainProviderInput.contains(e.target) && !visionChainProviderList.contains(e.target)) {
        visionChainProviderList.style.display = 'none';
      }
    });
  }

  if (visionChainModelInput) {
    visionChainModelInput.addEventListener('focus', () => {
      const providerId = visionChainProviderInput?.dataset?.providerId;
      const prov = providerId ? getProviderById(providerId) : null;
      if (prov) fetchModelsForProvider(prov, visionChainModelInput.value, true, false, false, 'visionChainModelList', 'visionChainModel');
      if (visionChainModelList) visionChainModelList.style.display = 'block';
    });
    visionChainModelInput.addEventListener('input', () => {
      const query = visionChainModelInput.value.toLowerCase();
      const filtered = availableVisionModels.filter(m => m.toLowerCase().includes(query));
      renderDropdown(filtered, visionChainModelInput, visionChainModelList);
      if (visionChainModelList) visionChainModelList.style.display = 'block';
    });
    visionChainModelInput.addEventListener('blur', () => {
      setTimeout(() => {
        if (!isSelectingModel && visionChainModelList) visionChainModelList.style.display = 'none';
      }, 200);
    });
  }

  function renderChainList(type) {
    const listEl = type === 'text' ? textChainListEl : visionChainListEl;
    const chain = type === 'text' ? textChain : visionChain;

    if (!listEl) return;

    if (!chain || chain.length === 0) {
      listEl.innerHTML = `<div class="chain-empty-state">No models added. ${type === 'text' ? 'Add one below.' : 'Add one below.'}</div>`;
      return;
    }

    listEl.innerHTML = chain.map((item, index) => {
      const provider = providers.find(p => p.id === item.providerId);
      const providerName = provider ? provider.name : 'Unknown Provider';
      const isSelected = currentlyConfiguringModel === item.model && currentlyConfiguringProvider === item.providerId;
      const activeClass = isSelected ? 'border-color: var(--primary-color); background: var(--sidebar-hover);' : '';

      // Get saved params for this model
      const modelKey = `${item.providerId}:${item.model}`;
      const savedParams = advancedParamsByModel[modelKey] || {};
      const temp = savedParams.temperature !== undefined ? savedParams.temperature : 1;
      const topP = savedParams.topP !== undefined ? savedParams.topP : 1;
      const customParams = savedParams.customParams || {};

      // Inline params panel HTML (only shown when selected)
      const paramsPanel = isSelected ? `
        <div class="chain-params-panel" style="width: 100%; box-sizing: border-box; margin-top: 12px; padding: 12px; background: var(--element-bg); border-radius: 12px; border: 1px solid var(--border-color);">
          <div class="form-group" style="margin-bottom: 12px;">
            <label style="display: flex; justify-content: space-between; font-size: 12px;">
              Temperature
              <span class="temp-value" style="color: var(--text-secondary);">${temp}</span>
            </label>
            <input type="range" class="param-temperature" data-model="${escapeHtml(item.model)}" data-provider="${item.providerId}" min="0" max="2" step="0.1" value="${temp}"
              style="width: 100%; accent-color: var(--primary-color);">
          </div>
          <div class="form-group" style="margin-bottom: 12px;">
            <label style="display: flex; justify-content: space-between; font-size: 12px;">
              Top P
              <span class="topp-value" style="color: var(--text-secondary);">${topP}</span>
            </label>
            <input type="range" class="param-topp" data-model="${escapeHtml(item.model)}" data-provider="${item.providerId}" min="0" max="1" step="0.05" value="${topP}"
              style="width: 100%; accent-color: var(--primary-color);">
          </div>
          <div class="form-group" style="margin-bottom: 0;">
            <label style="display: flex; justify-content: space-between; align-items: center; font-size: 12px;">
              Custom Parameters
              <button type="button" class="btn-secondary add-custom-param" data-model="${escapeHtml(item.model)}" data-provider="${item.providerId}"
                style="padding: 2px 8px; font-size: 10px;">+ Add</button>
            </label>
            <div class="custom-params-list" data-model="${escapeHtml(item.model)}" data-provider="${item.providerId}" style="margin-top: 8px;">
              ${Object.entries(customParams).map(([key, value]) => `
                <div style="display: flex; gap: 8px; margin-bottom: 4px; align-items: center;">
                  <input type="text" class="custom-param-key" value="${escapeHtml(key)}" placeholder="Key" style="flex: 1; padding: 6px 8px; font-size: 11px; background: var(--element-bg); border: 1px solid var(--border-color); border-radius: 4px;">
                  <input type="text" class="custom-param-value" value="${escapeHtml(typeof value === 'object' ? JSON.stringify(value) : String(value))}" placeholder="Value" style="flex: 1; padding: 6px 8px; font-size: 11px; background: var(--element-bg); border: 1px solid var(--border-color); border-radius: 4px;">
                  <button type="button" class="remove-custom-param" style="padding: 4px 8px; font-size: 10px; background: var(--border-color); border: none; border-radius: 4px; cursor: pointer;">×</button>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      ` : '';

      return `
          <div class="chain-item" data-index="${index}" data-type="${type}" data-model="${escapeHtml(item.model)}" data-provider="${item.providerId}" style="display: flex; flex-direction: column; ${activeClass}">
             <div class="chain-item-header" style="display: flex; align-items: center; gap: 10px; width: 100%;">
               <div class="chain-number">${index + 1}</div>
               <div class="chain-info" style="flex: 1;">
                  <div class="chain-model-name">${escapeHtml(item.model)}</div>
                  <div class="chain-provider-name">${escapeHtml(providerName)}</div>
               </div>
               <div class="chain-controls" style="margin-left: auto;">
                  <button class="chain-btn configure ${isSelected ? 'active' : ''}" data-action="configure" data-model="${escapeHtml(item.model)}" data-provider="${item.providerId}" title="Configure Parameters">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                  </button>
                  <button class="chain-btn remove" data-action="remove" data-type="${type}" data-index="${index}" title="Remove">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                  </button>
               </div>
             </div>
             ${paramsPanel}
          </div>
          `;
    }).join('');
  }

  function addToChain(type) {
    const providerInput = type === 'text' ? textChainProviderInput : visionChainProviderInput;
    const modelInput = type === 'text' ? textChainModelInput : visionChainModelInput;

    // For both text and vision chain, use dataset.providerId
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

    if (type === 'text') {
      textChain.unshift(newItem); // Add to beginning
      renderChainList('text');
      saveModelChains();
      // Clear inputs and disable model
      modelInput.value = '';
      modelInput.disabled = true;
      modelInput.placeholder = 'Select provider first...';
      if (providerInput) {
        providerInput.value = '';
        delete providerInput.dataset.providerId;
      }
    } else {
      visionChain.unshift(newItem); // Add to beginning
      renderChainList('vision');
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
  }

  function removeChainItem(type, index) {
    if (type === 'text') {
      textChain.splice(index, 1);
      renderChainList('text');
    } else {
      visionChain.splice(index, 1);
      renderChainList('vision');
    }
    saveModelChains();
  }

  function saveModelChains() {
    const chains = {
      text: textChain,
      vision: visionChain
    };

    // Backward compatibility: Update legacy single-model fields with the first item in textChain
    const legacyUpdate = {};
    if (textChain.length > 0) {
      legacyUpdate.provider = textChain[0].providerId;
      legacyUpdate.model = textChain[0].model;
    }
    if (visionChain.length > 0) {
      legacyUpdate.visionProvider = visionChain[0].providerId;
      legacyUpdate.visionModel = visionChain[0].model;
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
    renderChainList('text');
    renderChainList('vision');

    // Setup inline param listeners after render
    setupInlineParamListeners();
  }

  // Setup event listeners for inline params panel
  function setupInlineParamListeners() {
    // Temperature sliders
    document.querySelectorAll('.param-temperature').forEach(slider => {
      slider.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        const panel = e.target.closest('.chain-params-panel');
        panel.querySelector('.temp-value').textContent = value;
      });
      slider.addEventListener('change', (e) => {
        const model = e.target.dataset.model;
        const provider = e.target.dataset.provider;
        const value = parseFloat(e.target.value);
        saveInlineParam(provider, model, 'temperature', value);
      });
    });

    // Top P sliders
    document.querySelectorAll('.param-topp').forEach(slider => {
      slider.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        const panel = e.target.closest('.chain-params-panel');
        panel.querySelector('.topp-value').textContent = value;
      });
      slider.addEventListener('change', (e) => {
        const model = e.target.dataset.model;
        const provider = e.target.dataset.provider;
        const value = parseFloat(e.target.value);
        saveInlineParam(provider, model, 'topP', value);
      });
    });

    // Add custom param buttons
    document.querySelectorAll('.add-custom-param').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const model = e.target.dataset.model;
        const provider = e.target.dataset.provider;
        const list = document.querySelector(`.custom-params-list[data-model="${model}"][data-provider="${provider}"]`);
        if (list) {
          const row = document.createElement('div');
          row.style.cssText = 'display: flex; gap: 8px; margin-bottom: 4px; align-items: center;';
          row.innerHTML = `
            <input type="text" class="custom-param-key" placeholder="Key" style="flex: 1; padding: 6px 8px; font-size: 11px; background: var(--element-bg); border: 1px solid var(--border-color); border-radius: 4px;">
            <input type="text" class="custom-param-value" placeholder="Value" style="flex: 1; padding: 6px 8px; font-size: 11px; background: var(--element-bg); border: 1px solid var(--border-color); border-radius: 4px;">
            <button type="button" class="remove-custom-param" style="padding: 4px 8px; font-size: 10px; background: var(--border-color); border: none; border-radius: 4px; cursor: pointer;">×</button>
          `;
          list.appendChild(row);
          setupCustomParamRowListeners(row, provider, model);
        }
      });
    });

    // Setup listeners for existing custom param rows
    document.querySelectorAll('.custom-params-list').forEach(list => {
      const model = list.dataset.model;
      const provider = list.dataset.provider;
      list.querySelectorAll('div').forEach(row => {
        setupCustomParamRowListeners(row, provider, model);
      });
    });
  }

  function setupCustomParamRowListeners(row, provider, model) {
    const keyInput = row.querySelector('.custom-param-key');
    const valueInput = row.querySelector('.custom-param-value');
    const removeBtn = row.querySelector('.remove-custom-param');
    const list = row.closest('.custom-params-list'); // Cache list reference before row could be removed

    const saveCustomParams = () => {
      if (!list) return; // Safety check
      const customParams = {};
      list.querySelectorAll('div').forEach(r => {
        const k = r.querySelector('.custom-param-key')?.value?.trim();
        const v = r.querySelector('.custom-param-value')?.value?.trim();
        if (k) {
          // Try to parse as number, boolean, or JSON object
          let parsedValue = v;
          if (v === 'true') parsedValue = true;
          else if (v === 'false') parsedValue = false;
          else if (!isNaN(v) && v !== '') parsedValue = parseFloat(v);
          else if (v.startsWith('{') || v.startsWith('[')) {
            try { parsedValue = JSON.parse(v); } catch (e) { }
          }
          customParams[k] = parsedValue;
        }
      });
      saveInlineParam(provider, model, 'customParams', customParams);
    };

    if (keyInput) {
      keyInput.addEventListener('blur', saveCustomParams);
      keyInput.addEventListener('focusout', saveCustomParams); // Add extra safety for blur bypass
    }
    if (valueInput) {
      valueInput.addEventListener('blur', saveCustomParams);
      valueInput.addEventListener('focusout', saveCustomParams);
    }
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        row.remove();
        saveCustomParams();
      });
    }
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

  // Event Listeners
  if (addTextChainBtn) {
    addTextChainBtn.addEventListener('click', () => addToChain('text'));
  }
  if (addVisionChainBtn) {
    addVisionChainBtn.addEventListener('click', () => addToChain('vision'));
  }

  // Delegation for remove and configure buttons
  [textChainListEl, visionChainListEl].forEach(el => {
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

    // Vision chain provider - custom dropdown (no default selection)
    if (visionChainProviderInput) {
      visionChainProviderInput.value = '';
      delete visionChainProviderInput.dataset.providerId;
    }
  }

  // Initialize providers and populate dropdowns
  migrateOldSettings().then(() => {
    renderProviders();
    populateProviderDropdowns();
    populateChainDropdowns(); // Populate chain dropdowns too
  });

  // Load saved settings
  chrome.storage.local.get(['globalDefaults', 'modelChains', 'advancedParamsByModel', 'provider', 'visionProvider', 'voiceProvider', 'voiceModel', 'model', 'visionModel', 'googleApiKey', 'googleCx', 'fontSize', 'popupWidth', 'popupHeight', 'responseLanguage', 'disabledDomains', 'theme', 'memoryThreshold', 'compactionSize', 'maxContextTokens', 'questionMappings', 'askSelectionPopupEnabled', 'autoHideInputEnabled', 'deepLApiKey', 'temperature', 'topP', 'customParams', 'transProvider', 'transModelProvider', 'transModel', 'audioSpeed', 'autoAudio', 'googleClientId', 'githubClientId'], (items) => {
    // Wait for providers to be loaded
    setTimeout(() => {
      // --- Load Advanced Params ---
      if (items.advancedParamsByModel) {
        advancedParamsByModel = items.advancedParamsByModel;
      }

      // --- Load Model Chains ---
      if (items.modelChains) {
        textChain = items.modelChains.text || [];
        visionChain = items.modelChains.vision || [];
      }

      // Migration: If empty, use legacy
      let migrated = false;
      if (textChain.length === 0 && items.provider && items.model) {
        textChain.push({ providerId: items.provider, model: items.model });
        migrated = true;
      }
      if (visionChain.length === 0 && items.visionProvider && items.visionModel) {
        visionChain.push({ providerId: items.visionProvider, model: items.visionModel });
        migrated = true;
      }

      renderChainList('text');
      renderChainList('vision');




      // Initialize SortableJS
      if (typeof Sortable !== 'undefined') {
        const createSortable = (el, type) => {
          if (!el) return;
          new Sortable(el, {
            animation: 150,
            handle: '.chain-item', // Drag whole item
            ghostClass: 'chain-item-ghost',
            onEnd: function (evt) {
              // Update array order after drag
              const chain = type === 'text' ? textChain : visionChain;
              const item = chain.splice(evt.oldIndex, 1)[0];
              chain.splice(evt.newIndex, 0, item);

              // Re-render to update numbers
              renderChainList(type);
              saveModelChains();
            }
          });
        };
        createSortable(document.getElementById('textChainList'), 'text');
        createSortable(document.getElementById('visionChainList'), 'vision');
      }

      if (migrated) {
        // Persist migration immediately so updateModelUsageStats can see it
        saveModelChains();
        // Also update usage stats now that we have data
        setTimeout(updateModelUsageStats, 100);
      } else {
        // Just update stats
        updateModelUsageStats();
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

    if (items.googleApiKey) googleApiKeyInput.value = items.googleApiKey;
    if (items.googleCx) googleCxInput.value = items.googleCx;
    if (items.deepLApiKey && deepLApiKeyInput) deepLApiKeyInput.value = items.deepLApiKey;

    if (items.googleClientId && googleClientIdInput) googleClientIdInput.value = items.googleClientId;
    if (items.githubClientId && githubClientIdInput) {
        githubClientIdInput.value = items.githubClientId;
        localStorage.setItem('gh_client_id', items.githubClientId);
    }

    // Load Translation Provider
    const savedTransProvider = items.transProvider || 'ai';
    const transRadio = document.querySelector(`input[name="transProvider"][value="${savedTransProvider}"]`);
    if (transRadio) transRadio.checked = true;
    updateTransProviderUI(savedTransProvider);

    // Load Translation Model (for AI)
    if (items.transModelProvider && transModelProviderInput) {
      const prov = getProviderById(items.transModelProvider);
      if (prov) {
        transModelProviderInput.value = prov.name;
        transModelProviderInput.dataset.providerId = items.transModelProvider;
        if (transModelInput) {
          transModelInput.disabled = false;
          transModelInput.placeholder = 'Type or select model...';
        }
      }
    }
    if (items.transModel && transModelInput) {
      transModelInput.value = items.transModel;
    }

    // Global Defaults
    const globalDefaults = items.globalDefaults || {};
    const defaultFontSize = globalDefaults.fontSize || items.fontSize || 13;
    const defaultWidth = globalDefaults.width || items.popupWidth || 500;
    const defaultHeight = globalDefaults.height || items.popupHeight || 500;

    // Font Size - start with global default (domain-specific applied later)
    fontSizeInput.value = defaultFontSize;

    // Popup Dimensions - start with global defaults (domain-specific applied later)
    popupWidthInput.value = defaultWidth;
    widthValue.textContent = defaultWidth + 'px';
    popupHeightInput.value = defaultHeight;
    heightValue.textContent = defaultHeight + 'px';

    // Load Response Language
    const savedLanguage = items.responseLanguage || 'vi';
    const langRadio = document.querySelector(`input[name="responseLanguage"][value="${savedLanguage}"]`);
    if (langRadio) langRadio.checked = true;

    // Load Selection Popup setting
    if (items.askSelectionPopupEnabled !== undefined) {
      isAskSelectionPopupEnabled = items.askSelectionPopupEnabled;
    }
    updateAskSelectionPopupBtnUI();

    // Load Auto-hide Input setting
    const autoHideInputEnabledCheckbox = document.getElementById('autoHideInputEnabled');

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

    // Load Memory Settings
    const memoryThreshold = items.memoryThreshold || 14;
    const compactionSize = items.compactionSize || 10;

    const memThreshInput = document.getElementById('memoryThreshold');
    const compSizeInput = document.getElementById('compactionSize');
    const memThreshVal = document.getElementById('memoryThresholdValue');
    const compSizeVal = document.getElementById('compactionSizeValue');

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

    const maxTokens = items.maxContextTokens || 10000;
    const maxTokensInput = document.getElementById('maxContextTokens');
    const maxTokensVal = document.getElementById('maxContextTokensValue');

    if (maxTokensInput) {
      maxTokensInput.value = maxTokens;
      maxTokensVal.textContent = `${maxTokens} tokens`;

      const handleMaxTokensChange = (e) => {
        maxTokensVal.textContent = `${e.target.value} tokens`;
        saveOptions();
      };

      maxTokensInput.addEventListener('input', handleMaxTokensChange);
      maxTokensInput.addEventListener('change', handleMaxTokensChange);
    }

    // Load Question Mappings
    const savedMappings = items.questionMappings || [];
    // mappingsList is global

    if (mappingsList) {
      mappingsList.innerHTML = '';
      savedMappings.forEach((m, index) => {
        // Handle both legacy (m.key string) and new (m.keyData object) formats
        const k = m.keyData || m.key;

        renderMappingRow(k, m.prompt);
      });
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
    const provider = providerSelect ? providerSelect.value : '';  // Legacy
    const model = modelInput ? modelInput.value : '';             // Legacy
    const visionProvider = visionProviderSelect ? visionProviderSelect.value : ''; // Legacy
    const visionModel = visionModelInput ? visionModelInput.value : '';           // Legacy
    const fontSize = fontSizeInput ? fontSizeInput.value : '13';
    const popupWidth = popupWidthInput ? popupWidthInput.value : '360';
    const popupHeight = popupHeightInput ? popupHeightInput.value : '400';
    const responseLanguage = document.querySelector('input[name="responseLanguage"]:checked')?.value || 'vi';
    const theme = document.querySelector('input[name="theme"]:checked')?.value || 'auto';
    const transProvider = document.querySelector('input[name="transProvider"]:checked')?.value || 'ai';

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

    // First get existing fontSizeByDomain, popupDimensionsByDomain, and globalDefaults to update them
    chrome.storage.local.get(['fontSizeByDomain', 'popupDimensionsByDomain', 'globalDefaults'], (existing) => {
      let fontSizeByDomain = existing.fontSizeByDomain || {};
      let popupDimensionsByDomain = existing.popupDimensionsByDomain || {};
      let globalDefaults = existing.globalDefaults || {};

      // Always save font size per-domain
      if (currentHostname) {
        fontSizeByDomain[currentHostname] = parseFloat(fontSize);

        // Always save popup dimensions per-domain
        popupDimensionsByDomain[currentHostname] = {
          width: parseInt(popupWidth),
          height: parseInt(popupHeight)
        };
      }

      // Collect Question Mappings
      const questionMappings = [];
      document.querySelectorAll('.mapping-row').forEach((row, index) => {
        const keyInput = row.querySelector('.mapping-key-input');
        const prompt = row.querySelector('.mapping-prompt').value.trim();

        // Allow saving clearing to None (empty keyData)
        if (keyInput && prompt) {
          try {
            const keyData = keyInput.dataset.key ? JSON.parse(keyInput.dataset.key) : null;
            questionMappings.push({ keyData, prompt });
          } catch (e) { console.error('Error parsing key data', e); }
        }
      });

      const settings = {
        provider: provider,  // Provider ID
        model: model,        // Model name
        visionProvider: visionProvider,  // Provider ID (or empty for same as text)
        visionModel: visionModel,
        voiceProvider: voiceProviderInput?.dataset?.providerId || '',
        voiceModel: voiceModelInput ? voiceModelInput.value : '',
        questionMappings: questionMappings,
        fontSize: fontSize, // Global default
        fontSizeByDomain: fontSizeByDomain,
        popupDimensionsByDomain: popupDimensionsByDomain,
        globalDefaults: globalDefaults,
        popupWidth: popupWidth,
        popupHeight: popupHeight,
        memoryThreshold: parseInt(document.getElementById('memoryThreshold')?.value, 10) || 14,
        compactionSize: parseInt(document.getElementById('compactionSize')?.value, 10) || 10,
        maxContextTokens: parseInt(document.getElementById('maxContextTokens')?.value, 10) || 10000,
        responseLanguage: responseLanguage,
        theme: theme,
        shortcuts: shortcuts,
        askSelectionPopupEnabled: isAskSelectionPopupEnabled,
        transProvider: transProvider,
        transModelProvider: transModelProviderInput?.dataset?.providerId || '',
        transModel: transModelInput ? transModelInput.value : '',
        audioSpeed: audioSpeed
      };

      // Save Google API credentials for image search
      settings.googleApiKey = googleApiKeyInput.value;
      settings.googleCx = googleCxInput.value;

      // Save DeepL API key for translation
      if (deepLApiKeyInput) {
        settings.deepLApiKey = deepLApiKeyInput.value;
      }

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
          localStorage.setItem('lumina_popupWidth', popupWidth);
          localStorage.setItem('lumina_popupHeight', popupHeight);
        } catch (e) {
          console.warn('Failed to sync to localStorage:', e);
        }

        // Notify all tabs about changes
        chrome.tabs.query({}, (tabs) => {
          tabs.forEach(tab => {
            // Only send to tabs with http/https URLs where content script runs
            if (!tab.id || !tab.url || (!tab.url.startsWith('http://') && !tab.url.startsWith('https://'))) {
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
                popupDimensionsByDomain: popupDimensionsByDomain,
                globalDefaults: globalDefaults,
                popupWidth: popupWidth,
                popupHeight: popupHeight,
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
    visionProviderSelect, visionModelInput,
    googleApiKeyInput, googleCxInput,
    deepLApiKeyInput,
    fontSizeInput,
    popupWidthInput, popupHeightInput,
  ].filter(Boolean); // Filter out nulls explicitly

  function updateAskSelectionPopupBtnUI() {
    if (!askSelectionPopupBtn) return;
    if (isAskSelectionPopupEnabled) {
      askSelectionPopupBtn.textContent = 'Show';
      askSelectionPopupBtn.style.color = 'var(--text-primary)';
      askSelectionPopupBtn.style.background = 'var(--element-bg)';
      askSelectionPopupBtn.style.borderColor = 'var(--border-color)';
      askSelectionPopupBtn.style.boxShadow = 'none';
      askSelectionPopupBtn.style.fontWeight = '600';
    } else {
      askSelectionPopupBtn.textContent = 'Hide';
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
  function updateTransProviderUI(provider) {
    if (deeplConfig) {
      deeplConfig.style.display = provider === 'deepl' ? 'block' : 'none';
    }
    if (aiTranslationConfig) {
      aiTranslationConfig.style.display = provider === 'ai' ? 'block' : 'none';
    }
  }

  if (transProviderRadios) {
    transProviderRadios.forEach(radio => {
      radio.addEventListener('change', (e) => {
        updateTransProviderUI(e.target.value);
        saveOptions();
      });
    });
  }

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
        fetchModelsForProvider(provider, modelInput.value);
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
  setupDropdown(visionModelInput, visionModelList, () => {
    // If vision provider is set and different, use vision models
    const visionProvider = visionProviderSelect ? visionProviderSelect.value : '';
    return visionProvider ? availableVisionModels : availableModels;
  });
  setupDropdown(voiceModelInput, voiceModelList, () => availableVoiceModels);

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
            renderChainList('text');
            renderChainList('vision');
          }
        }

        // Dispatch event FIRST to load new model's params
        document.dispatchEvent(new CustomEvent('modelChanged'));
        // Then save general options (without advanced params)
        saveOptions();

        // Reset flag after a short delay
        setTimeout(() => {
          isSelectingModel = false;
        }, 50);
      });
      listElement.appendChild(div);
    });
  }

  // Vision provider change listener
  if (visionProviderSelect) {
    visionProviderSelect.addEventListener('change', () => {
      const providerId = visionProviderSelect.value;
      saveOptions();

      // Fetch models for the selected vision provider
      const provider = getProviderById(providerId);
      if (provider) {
        fetchModelsForProvider(provider, visionModelInput.value, true);
      } else {
        availableVisionModels = [];
        renderDropdown([], visionModelInput, visionModelList);
      }
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
              fetchModelsForProvider(provider, '', false, true);
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
        fetchModelsForProvider(provider, voiceModelInput.value, false, true);
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

  // Translation Model provider custom dropdown
  if (transModelProviderInput && transModelProviderList) {
    // Initially disable model input until provider is selected
    if (transModelInput && !transModelProviderInput.dataset.providerId) {
      transModelInput.disabled = true;
      transModelInput.placeholder = 'Select provider first...';
    }

    transModelProviderInput.addEventListener('click', () => {
      const isVisible = transModelProviderList.style.display === 'block';
      transModelProviderList.style.display = isVisible ? 'none' : 'block';

      if (!isVisible) {
        transModelProviderList.innerHTML = providers.map(p =>
          `<div class="dropdown-item" data-value="${p.id}">${escapeHtml(p.name)}</div>`
        ).join('');

        transModelProviderList.querySelectorAll('.dropdown-item').forEach(item => {
          item.addEventListener('click', () => {
            transModelProviderInput.value = item.textContent;
            transModelProviderInput.dataset.providerId = item.dataset.value;
            transModelProviderList.style.display = 'none';

            // Enable model input
            if (transModelInput) {
              transModelInput.disabled = false;
              transModelInput.placeholder = 'Type or select model...';
            }

            saveOptions();
            const provider = getProviderById(item.dataset.value);
            if (provider) {
              fetchModelsForProvider(provider, '', false, false, true);
            }
          });
        });
      }
    });

    document.addEventListener('click', (e) => {
      if (!transModelProviderInput.contains(e.target) && !transModelProviderList.contains(e.target)) {
        transModelProviderList.style.display = 'none';
      }
    });
  }

  // Translation model input listeners
  if (transModelInput) {
    transModelInput.addEventListener('change', () => {
      saveOptions();
    });

    transModelInput.addEventListener('focus', () => {
      const providerId = transModelProviderInput?.dataset?.providerId;
      const provider = providerId ? getProviderById(providerId) : null;
      if (provider) {
        // Refresh list on focus
        fetchModelsForProvider(provider, transModelInput.value, false, false, true);
      }
      if (transModelList) transModelList.style.display = 'block';
    });

    transModelInput.addEventListener('input', () => {
      const query = transModelInput.value.toLowerCase();
      const filtered = availableTransModels.filter(m => m.toLowerCase().includes(query));
      renderDropdown(filtered, transModelInput, transModelList);
      if (transModelList) transModelList.style.display = 'block';
    });

    transModelInput.addEventListener('blur', () => {
      setTimeout(() => {
        if (!isSelectingModel && transModelList) transModelList.style.display = 'none';
      }, 200);
    });
  }

  let availableModels = [];
  let availableVisionModels = [];
  let availableVoiceModels = [];
  let availableTransModels = [];

  // Fetch models for a dynamic provider
  async function fetchModelsForProvider(provider, selectedModel, isVision = false, isVoice = false, isTrans = false, targetListId = null, targetInputId = null) {
    if (!provider) return;

    // Determine target elements
    let listId = targetListId;
    let inputId = targetInputId;
    if (!listId) {
      if (isTrans) listId = 'transModelList';
      else if (isVoice) listId = 'voiceModelList';
      else if (isVision) listId = 'visionModelList';
      else listId = 'modelList';
    }
    if (!inputId) {
      if (isTrans) inputId = 'transModelInput';
      else if (isVoice) inputId = 'voiceModel';
      else if (isVision) inputId = 'visionModel';
      else inputId = 'model';
    }

    try {
      const firstKey = provider.apiKey ? provider.apiKey.split(',')[0].trim() : '';
      let models = [];

      console.log('[Lumina Options] Fetching models for provider:', provider.name, 'type:', provider.type, 'endpoint:', provider.endpoint, 'hasKey:', !!firstKey);

      if (provider.type === 'gemini') {
        const baseUrl = provider.endpoint.includes('/models')
          ? provider.endpoint.split('/models')[0] + '/models'
          : 'https://generativelanguage.googleapis.com/v1beta/models';
        const response = await fetch(`${baseUrl}?key=${firstKey}`);
        if (response.ok) {
          const data = await response.json();
          if (data.models) {
            models = data.models.map(m => m.name.replace('models/', ''));
          }
        }
      } else {
        // OpenAI-compatible API
        let modelsUrl = provider.endpoint.replace('/chat/completions', '/models');

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
      if (isTrans) {
        availableTransModels = models;
      } else if (isVoice) {
        availableVoiceModels = models;
      } else if (isVision) {
        availableVisionModels = models;
      } else {
        availableModels = models;
      }

      console.log('[Lumina Options] Fetched', models.length, 'models for', provider.name, ':', models.slice(0, 5), '...');

      const inputEl = document.getElementById(inputId);
      const listEl = document.getElementById(listId);
      renderDropdown(models, inputEl, listEl);

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
      renderDropdown([], inputEl, listEl);
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

  async function fetchVisionModels(provider, apiKey, selectedModel) {
    try {
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

      availableVisionModels = models;
    } catch (e) {
      console.error('Failed to fetch vision models', e);
      availableVisionModels = [];
    }
  }

  if (popupWidthInput) {
    popupWidthInput.addEventListener('input', () => {
      widthValue.textContent = popupWidthInput.value + 'px';
      saveOptions();
    });
  }

  if (popupHeightInput) {
    popupHeightInput.addEventListener('input', () => {
      heightValue.textContent = popupHeightInput.value + 'px';
      saveOptions();
    });
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
    if (!customParamsList) return; // Guard against null element
    const row = document.createElement('div');
    row.className = 'custom-param-row';
    row.style.cssText = 'display: flex; gap: 8px; margin-bottom: 8px; align-items: center;';
    row.innerHTML = `
      <input type="text" class="custom-param-key" placeholder="key" value="${key}" style="flex: 1; font-size: 12px;">
      <span style="color: var(--text-secondary);">=</span>
      <input type="text" class="custom-param-value" placeholder="value" value="${value}" style="flex: 1; font-size: 12px;">
      <button type="button" class="remove-param-btn" style="padding: 4px 8px; font-size: 11px; background: var(--error-color, #f44336); color: white; border: none; border-radius: 4px; cursor: pointer;">×</button>
    `;
    customParamsList.appendChild(row);
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
    // Add unique ID for debugging
    if (!inputEl.dataset.debugId) {
      inputEl.dataset.debugId = 'input_' + Math.random().toString(36).substr(2, 9);
    }

    if (!keyData) {
      inputEl.innerHTML = '<span style="color: var(--text-secondary); font-style: italic;">None</span>';
      inputEl.dataset.key = '';
      return;
    }

    const normalizedKeyData = normalizeShortcutForOS(keyData);

    const parts = [];

    // If the main key IS a modifier, we don't want to show it in the modifier list separately

    const isModifierKey = ['Control', 'Alt', 'Shift', 'Meta'].includes(normalizedKeyData.key);

    // Only show modifier symbols if they are NOT the main key being pressed
    // Use display as-is from keyData (already set by getKeyDisplay, which includes L/R distinction)
    let display = normalizedKeyData.display;

    // Override display for Space key (show "Space" instead of blank)
    if (normalizedKeyData.key === ' ' || normalizedKeyData.code === 'Space') display = 'Space';

    // Remove + at the end if it exists (for safety, though logic above shouldn't add it if main key is modifier)

    if (normalizedKeyData.ctrlKey && normalizedKeyData.key !== 'Control') parts.push(isMac ? '<span class="shortcut-key">⌃</span>' : '<span class="shortcut-key">Ctrl</span>');
    if (normalizedKeyData.altKey && normalizedKeyData.key !== 'Alt') parts.push(isMac ? '<span class="shortcut-key">⌥</span>' : '<span class="shortcut-key">Alt</span>');
    if (normalizedKeyData.shiftKey && normalizedKeyData.key !== 'Shift') parts.push(isMac ? '<span class="shortcut-key">⇧</span>' : '<span class="shortcut-key">Shift</span>');
    if (normalizedKeyData.metaKey && normalizedKeyData.key !== 'Meta') parts.push(isMac ? '<span class="shortcut-key">⌘</span>' : '<span class="shortcut-key">Win</span>');

    parts.push(`<span class="shortcut-key">${display}</span>`);

    inputEl.innerHTML = parts.join('');
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
    inputEl.innerHTML = '<span style="color: var(--primary-color); font-weight: 520;">Press a key...</span>';
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

  // Show live preview of modifiers being pressed
  function showModifierPreview(e) {
    if (!currentRecordingInput) return;

    // Use standard symbols for live preview
    const parts = [];
    if (e.ctrlKey) parts.push(isMac ? '<span class="shortcut-key">⌃</span>' : '<span class="shortcut-key">Ctrl</span>');
    if (e.altKey) parts.push(isMac ? '<span class="shortcut-key">⌥</span>' : '<span class="shortcut-key">Alt</span>');
    if (e.shiftKey) parts.push(isMac ? '<span class="shortcut-key">⇧</span>' : '<span class="shortcut-key">Shift</span>');
    if (e.metaKey) parts.push(isMac ? '<span class="shortcut-key">⌘</span>' : '<span class="shortcut-key">Win</span>');

    // If only modifiers are pressed, show them. 

    if (parts.length > 0) {
      currentRecordingInput.innerHTML = parts.join('');
    } else {
      currentRecordingInput.innerHTML = '<span style="color: var(--primary-color); font-weight: 520;">Press a key...</span>';
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

      startRecording(input);
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

    // If clicking on a shortcut input, let its own click handler manage recording
    if (e.target.classList.contains('shortcut-input') || e.target.closest?.('.shortcut-input')) return;

    // Prevent default actions (like losing focus or context menu)
    e.preventDefault();
    e.stopPropagation();

    if (e.button === 0) {
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

    // Other mouse buttons: record as shortcut
    const code = 'Mouse' + e.button;

    const keyData = {
      code: code,
      key: code,
      display: getKeyDisplay({ code: code }),
      ctrlKey: e.ctrlKey,
      altKey: e.altKey,
      shiftKey: e.shiftKey,
      metaKey: e.metaKey
    };

    renderShortcutDisplay(currentRecordingInput, keyData);
    recordingHadInput = true;

    // Finish recording
    stopRecording(currentRecordingInput, false);
    saveOptions();
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

  function renderMappingRow(keyDataOrSimpleKey = null, prompt = '') {
    if (!mappingsList) return;

    const div = document.createElement('div');
    div.className = 'mapping-row';

    // Handle legacy simple key (string) vs new object
    let keyData = null;
    if (keyDataOrSimpleKey) {
      if (typeof keyDataOrSimpleKey === 'string') {
        // Migration for simple string keys
        const k = keyDataOrSimpleKey.toUpperCase();
        keyData = { key: k, code: 'Key' + k, display: k };
      } else {
        // Clone the object to prevent reference sharing
        keyData = JSON.parse(JSON.stringify(keyDataOrSimpleKey));
      }
    }

    div.innerHTML = `
          <div class="shortcut-input mapping-key-input" tabindex="0" style="width: 60px; margin-right: 8px;"></div>
          <div style="flex: 1; position: relative;">
            <input type="text" class="mapping-prompt" placeholder="Prompt (e.g. Explain this:)">
            <div class="mapping-suggestions dropdown-list"></div>
          </div>
          <button class="mapping-delete" title="Remove">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
      `;

    const input = div.querySelector('.mapping-key-input');
    const promptInput = div.querySelector('.mapping-prompt');
    const deleteBtn = div.querySelector('.mapping-delete');

    // Set value explicitly to handle special characters/quotes
    if (prompt) {
      promptInput.value = prompt;
    }

    // Initialize display
    renderShortcutDisplay(input, keyData);

    // Add recording listeners (copied from init loop)
    input.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      startRecording(input);
    });
    input.addEventListener('focus', () => {
      startRecording(input);
    });
    input.addEventListener('blur', () => {
      setTimeout(() => {
        if (currentRecordingInput === input) {
          if (!recordingHadInput) {
            renderShortcutDisplay(input, null);
            saveOptions();
            stopRecording(input, false);
          } else {
            stopRecording(input, true);
          }
        }
      }, 100);
    });

    const suggestionsEl = div.querySelector('.mapping-suggestions');
    const variables = ['$SelectedText', '$Sentence', '$Paragraph', '$PageTitle', '$URL'];

    promptInput.addEventListener('input', () => {
      saveOptions();
      updateSuggestions();
    });

    promptInput.addEventListener('click', updateSuggestions);

    // Hide suggestions on blur (delayed to allow clicks)
    promptInput.addEventListener('blur', () => {
      setTimeout(() => { suggestionsEl.style.display = 'none'; }, 200);
    });

    let selectedIndex = -1;
    promptInput.addEventListener('keydown', (e) => {
      if (suggestionsEl.style.display === 'block') {
        const items = suggestionsEl.querySelectorAll('.dropdown-item');
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          selectedIndex = (selectedIndex + 1) % items.length;
          updateSelection(items);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          selectedIndex = (selectedIndex - 1 + items.length) % items.length;
          updateSelection(items);
        } else if (e.key === 'Enter' && selectedIndex !== -1) {
          e.preventDefault();
          items[selectedIndex].click();
        } else if (e.key === 'Escape') {
          suggestionsEl.style.display = 'none';
        }
      }
    });

    function updateSelection(items) {
      items.forEach((item, idx) => {
        item.style.background = (idx === selectedIndex) ? 'var(--sidebar-hover)' : 'transparent';
      });
    }

    function updateSuggestions() {
      const val = promptInput.value;
      const pos = promptInput.selectionStart;
      const before = val.substring(0, pos);

      // Find the start of the current variable trigger (last $)
      const dollarIndex = before.lastIndexOf('$');

      if (dollarIndex !== -1) {
        // Check if there's a space between $ and cursor
        const search = before.substring(dollarIndex + 1);
        if (search.includes(' ')) {
          suggestionsEl.style.display = 'none';
          return;
        }

        const filtered = variables.filter(v =>
          v.toLowerCase().startsWith('$' + search.toLowerCase())
        );

        if (filtered.length > 0) {
          selectedIndex = -1; // Reset selection index
          suggestionsEl.innerHTML = filtered.map(v => `
            <div class="dropdown-item" style="padding: 8px 12px; font-size: 13px; font-family: monospace;">${v}</div>
          `).join('');
          suggestionsEl.style.display = 'block';

          // Click handler for suggestion items
          suggestionsEl.querySelectorAll('.dropdown-item').forEach((item, idx) => {
            item.onclick = (e) => {
              e.stopPropagation();
              const selectedVar = filtered[idx];
              const after = val.substring(pos);
              const newVal = val.substring(0, dollarIndex) + selectedVar + after;
              promptInput.value = newVal;
              promptInput.focus();
              const newPos = dollarIndex + selectedVar.length;
              promptInput.setSelectionRange(newPos, newPos);
              suggestionsEl.style.display = 'none';
              saveOptions();
            };
          });
        } else {
          suggestionsEl.style.display = 'none';
        }
      } else {
        suggestionsEl.style.display = 'none';
      }
    }

    deleteBtn.addEventListener('click', () => {
      div.remove();
      saveOptions();
    });

    mappingsList.appendChild(div);
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
    }
  }

  // Hook into storage load (we need to recall this or update the original call site)

  if (addMappingBtn) {
    addMappingBtn.addEventListener('click', () => {
      renderMappingRow();
    });
  }



  // --- Model Usage Counter Logic ---
  async function updateModelUsageStats() {
    // Re-query elements in case they weren't ready earlier (though they should be)
    const usageFooter = document.getElementById('modelUsageFooter');
    const usageName = document.getElementById('modelUsageName');
    const usageCount = document.getElementById('modelUsageCount');

    if (!usageFooter || !usageCount) {
      console.warn('Lumina: Model usage footer elements not found in DOM');
      return;
    }

    try {
      const data = await chrome.storage.local.get(['dailyModelStats', 'model', 'modelChains', 'lastUsedModelId']);
      let activeModelId = data.lastUsedModelId;

      // 1. Fallback: Try to get the first model from the text chain
      if (!activeModelId && data.modelChains && data.modelChains.text && data.modelChains.text.length > 0) {
        activeModelId = data.modelChains.text[0].model;
      }

      // 2. Fallback to legacy single model if chain is empty
      if (!activeModelId) {
        activeModelId = data.model;
      }

      // If still no model, hide
      if (!activeModelId) {
        usageFooter.style.display = 'none';
        return;
      }

      // Show footer (use flex to match layout)
      usageFooter.style.display = 'flex';

      const today = new Date().toISOString().split('T')[0];
      const stats = data.dailyModelStats;

      let count = 0;
      if (stats && stats.date === today && stats.counts) {
        count = stats.counts[activeModelId] || 0;
      }

      if (usageName) usageName.textContent = activeModelId;
      usageCount.textContent = `${count} requests today`;
    } catch (e) {
      console.error('[Lumina] Error updating usage stats:', e);
    }
  }

  // Initial update
  updateModelUsageStats();

  // Listen for changes
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      if (changes.dailyModelStats || changes.model || changes.provider || changes.modelChains || changes.lastUsedModelId) {
        updateModelUsageStats();
      }
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

    if (facts.length === 0) {
      userFactsList.innerHTML = `
        <div style="text-align: center; padding: 20px; color: var(--text-secondary); font-size: 13px;">
          No instructions yet. Add new instruction below.
        </div>
      `;
      return;
    }

    userFactsList.innerHTML = facts.map((fact, index) => `
      <div class="fact-item" data-index="${index}" style="
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 12px;
        background: var(--input-bg);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-sm);
        margin-bottom: 8px;
        transition: all 0.2s ease;
      ">
        <span style="color: var(--primary-color); font-weight: 600; width: 20px; flex-shrink: 0; font-size: 12px;">${index + 1}</span>
        <input type="text" class="fact-text" value="${escapeHtml(fact)}" style="
          flex: 1;
          border: none;
          background: transparent;
          font-size: 13px;
          color: var(--text-primary);
          outline: none;
          padding: 4px;
          box-shadow: none;
        ">
        <button class="fact-remove-btn" data-index="${index}" style="
          width: 24px;
          height: 24px;
          border: 1px solid var(--border-color);
          background: transparent;
          border-radius: 4px;
          cursor: pointer;
          color: var(--text-secondary);
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
          padding: 0;
        " title="Remove instruction">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    `).join('');

    // Add event listeners for edit and remove
    userFactsList.querySelectorAll('.fact-text').forEach(input => {
      input.addEventListener('blur', async () => {
        const index = parseInt(input.closest('.fact-item').dataset.index);
        const newValue = input.value.trim();
        if (newValue) {
          await UserMemory.updateFact(index, newValue);
        }
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          input.blur();
        }
      });
    });

    userFactsList.querySelectorAll('.fact-remove-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const index = parseInt(btn.dataset.index);
        await UserMemory.removeFact(index);
        renderUserFacts();
      });
    });
  }

  // Add new fact
  if (addFactBtn && newFactInput) {
    addFactBtn.addEventListener('click', async () => {
      const fact = newFactInput.value.trim();
      if (fact) {
        await UserMemory.addFact(fact);
        newFactInput.value = '';
        renderUserFacts();
      }
    });

    newFactInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addFactBtn.click();
      }
    });
  }

  // Set Global Defaults / Apply to All Pages Button
  const setGlobalDefaultsBtn = document.getElementById('setGlobalDefaultsBtn');
  const resetSettingsBtn = document.getElementById('resetSettingsBtn');

  if (setGlobalDefaultsBtn) {
    setGlobalDefaultsBtn.addEventListener('click', () => {
      const fontSize = parseFloat(fontSizeInput.value) || 14;
      const width = parseInt(popupWidthInput.value) || 500;
      const height = parseInt(popupHeightInput.value) || 420;
      const theme = document.querySelector('input[name="theme"]:checked')?.value || 'light';

      const defaults = {
        fontSize: fontSize,
        width: width,
        height: height,
        theme: theme
      };

      chrome.storage.local.set({
        globalDefaults: defaults,
        fontSizeByDomain: {},
        popupDimensionsByDomain: {},
        theme: theme,
        fontSize: fontSize,
        popupWidth: width,
        popupHeight: height
      }, () => {
        // Show feedback
        const originalText = setGlobalDefaultsBtn.innerHTML;
        const checkIcon = `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="14" height="14" style="margin-right:6px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>`;
        
        setGlobalDefaultsBtn.innerHTML = `${checkIcon}Applied!`;

        // Style: feedback colors
        setGlobalDefaultsBtn.style.backgroundColor = 'rgba(16, 185, 129, 0.2)';
        setGlobalDefaultsBtn.style.borderColor = '#10B981';
        setGlobalDefaultsBtn.style.color = '#000';


        // Broadcast update to all tabs
        chrome.tabs.query({}, (tabs) => {
          tabs.forEach((tab) => {
            if (tab.url && (tab.url.startsWith('http') || tab.url.startsWith('https')) && tab.id) {
              chrome.tabs.sendMessage(tab.id, {
                action: 'settings_updated',
                settings: {
                  globalDefaults: defaults,
                  popupWidth: width,
                  popupHeight: height,
                  fontSize: fontSize,
                  theme: theme,
                  fontSizeByDomain: {},
                  popupDimensionsByDomain: {}
                }
              }).catch(() => { }); // Ignore errors
            }
          });
        });

        setTimeout(() => {
          setGlobalDefaultsBtn.innerHTML = originalText;
          setGlobalDefaultsBtn.style.backgroundColor = '';
          setGlobalDefaultsBtn.style.borderColor = '';
          setGlobalDefaultsBtn.style.color = '';
        }, 1500);
      });
    });
  }

  if (resetSettingsBtn) {
    resetSettingsBtn.addEventListener('click', () => {
      const defaultFontSize = 14;
      const defaultWidth = 500;
      const defaultHeight = 420;
      const defaultTheme = 'light';
      const defaultAudioSpeed = 1.0;

      // Update UI Inputs
      if (fontSizeInput) fontSizeInput.value = defaultFontSize;
      if (popupWidthInput) {
        popupWidthInput.value = defaultWidth;
        if (widthValue) widthValue.textContent = defaultWidth + 'px';
      }
      if (popupHeightInput) {
        popupHeightInput.value = defaultHeight;
        if (heightValue) heightValue.textContent = defaultHeight + 'px';
      }
      if (audioSpeedInput) audioSpeedInput.value = defaultAudioSpeed;
      
      const radio = document.querySelector(`input[name="theme"][value="${defaultTheme}"]`);
      if (radio) radio.checked = true;

      // Apply theme immediately
      applyTheme(defaultTheme);

      // Save to storage (resetting both global and domain-specific for these values)
      chrome.storage.local.set({
        fontSize: defaultFontSize,
        popupWidth: defaultWidth,
        popupHeight: defaultHeight,
        theme: defaultTheme,
        audioSpeed: defaultAudioSpeed,
        fontSizeByDomain: {},
        popupDimensionsByDomain: {},
        globalDefaults: {
          fontSize: defaultFontSize,
          width: defaultWidth,
          height: defaultHeight,
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
                  popupWidth: defaultWidth,
                  popupHeight: defaultHeight,
                  theme: defaultTheme,
                  fontSizeByDomain: {},
                  popupDimensionsByDomain: {}
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
      if (authLoggedOut) authLoggedOut.style.display = 'none';
      if (authLoggedIn) authLoggedIn.style.display = 'block';
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
      if (authLoggedOut) authLoggedOut.style.display = 'block';
      if (authLoggedIn) authLoggedIn.style.display = 'none';

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
        // Save original HTML
        const originalHTML = googleLoginBtn.innerHTML;
        googleLoginBtn.innerHTML = 'Signing in...';

        const user = await LuminaAuth.login();
        updateStatus('Signed in successfully', 'success');

        // Restore HTML (though it might be hidden now)
        googleLoginBtn.innerHTML = originalHTML;
      } catch (e) {
        console.error(e);
        alert('Sign in failed: ' + e.message);
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

});

