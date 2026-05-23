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

  
  let availableModels = [];
  let availableDictModels = [];

  
  const sidebarNavItems = document.querySelectorAll('.sidebar-nav-item');
  const contentSections = document.querySelectorAll('.content-section');
  let currentActiveSectionId = null;
  let isInitialLoad = true; 

  function switchSection(sectionId, restoreScroll = false) {
    if (currentActiveSectionId === sectionId) return;

    
    const targetSection = document.getElementById(sectionId);
    if (!targetSection) {
      console.warn(`Section not found: ${sectionId}`);
      return;
    }

    
    contentSections.forEach(section => {
      section.classList.remove('active');
    });

    
    sidebarNavItems.forEach(item => {
      item.classList.remove('active');
    });

    targetSection.classList.add('active');
    currentActiveSectionId = sectionId;

    
    const activeNavItem = document.querySelector(`[data-section="${sectionId}"]`);
    if (activeNavItem) {
      activeNavItem.classList.add('active');
    }

    
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
      if (!restoreScroll) {
        mainContent.scrollTop = 0;
      }
    }

    
    chrome.storage.local.set({ optionsLastSection: sectionId });
  }

  
  const mainContent = document.querySelector('.main-content');
  let scrollSaveTimer = null;
  if (mainContent) {
    mainContent.addEventListener('scroll', () => {
      
      if (isInitialLoad) return;

      clearTimeout(scrollSaveTimer);
      scrollSaveTimer = setTimeout(() => {
        
        if (currentActiveSectionId) {
          chrome.storage.local.get(['optionsScrollPositions'], (result) => {
            const positions = result.optionsScrollPositions || {};
            positions[currentActiveSectionId] = mainContent.scrollTop;
            chrome.storage.local.set({
              optionsScrollPositions: positions,
              optionsLastScroll: mainContent.scrollTop 
            });
          });
        }
      }, 150);
    });
  }

  
  sidebarNavItems.forEach(item => {
    item.addEventListener('click', () => {
      const sectionId = item.getAttribute('data-section');
      if (sectionId) {
        switchSection(sectionId);
      }
    });
  });

  
  function restoreLastSessionState() {
    chrome.storage.local.get(['optionsLastSection', 'optionsLastScroll', 'optionsScrollPositions'], (saved) => {
      const lastSection = saved.optionsLastSection || 'general';
      const positions = saved.optionsScrollPositions || {};
      const lastScroll = positions[lastSection] !== undefined ? positions[lastSection] : (saved.optionsLastScroll || 0);

      const targetSection = document.getElementById(lastSection);
      if (targetSection) {
        switchSection(lastSection, true);

        
        const mc = document.querySelector('.main-content');
        if (mc && lastScroll > 0) {
          
          const applyScroll = () => {
            if (mc.scrollTop !== lastScroll) {
              mc.scrollTop = lastScroll;
            }
          };

          
          applyScroll();

          
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              applyScroll();
              
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

  
  restoreLastSessionState();

  
  const configShortcutBtn = document.getElementById('configShortcutBtn');
  if (configShortcutBtn) {
    configShortcutBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
    });
  }

  
  const checkAnkiConnBtn = document.getElementById('checkAnkiConnBtn');
  const openAnkiMgtBtn = document.getElementById('openAnkiMgtBtn');
  const addToAnkiBtn = document.getElementById('addToAnkiBtn');
  const ankiQuickNote = document.getElementById('ankiQuickNote');

  const clearAnkiNoteBtn = document.getElementById('clearAnkiNoteBtn');

  
  chrome.storage.local.get(['ankiQuickNoteContent'], (result) => {
    if (ankiQuickNote) {
      if (result.ankiQuickNoteContent) {
        ankiQuickNote.value = result.ankiQuickNoteContent;
      }
      
      if (typeof updateQuickNoteCount === 'function') {
        updateQuickNoteCount();
      }
    }
  });

  
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
    
    updateQuickNoteCount();

    
    document.addEventListener('paste', (e) => {
      
      if (e.target.tagName === 'INPUT' || (e.target.tagName === 'TEXTAREA' && e.target !== ankiQuickNote)) {
        return;
      }

      const text = (e.clipboardData || window.clipboardData).getData('text');
      if (!text) return;

      
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

      
      ankiQuickNote.focus();
      const len = ankiQuickNote.value.length;
      ankiQuickNote.setSelectionRange(len, len);

      
      
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
      
      localStorage.setItem('lumina_pending_words', words);
      
      chrome.tabs.create({ url: 'pages/anki/anki.html?tab=generator' });
    });
  }

  
  const openSpotlightWebAppBtn = document.getElementById('openSpotlightWebAppBtn');
  if (openSpotlightWebAppBtn) {
    openSpotlightWebAppBtn.addEventListener('click', () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0] && chrome.sidePanel && typeof chrome.sidePanel.open === 'function') {
          chrome.sidePanel.open({ tabId: tabs[0].id });
        } else {
          
          chrome.tabs.create({ url: chrome.runtime.getURL('pages/spotlight/spotlight.html') + '?webapp=1' });
        }
      });
    });
  }



  
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  

  const providerSelect = document.getElementById('provider');
  const modelInput = document.getElementById('model');
  const modelList = document.getElementById('modelList');


  
  const mappingsList = document.getElementById('questionMappingsList');
  const addMappingBtn = document.getElementById('addMappingBtn');

  const dictProviderInput = document.getElementById('dictProvider');
  const dictProviderList = document.getElementById('dictProviderList');
  const dictModelInput = document.getElementById('dictModel');
  const dictModelList = document.getElementById('dictModelList');


  const fontSizeInput = document.getElementById('fontSize');
  const decreaseFontSizeBtn = document.getElementById('decreaseFontSize');
  const increaseFontSizeBtn = document.getElementById('increaseFontSize');
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
  
  let providers = [];

  let currentHostname = '';
  const isMac = navigator.userAgent.toUpperCase().includes('MAC');

  
  function applyDomainSpecificSettings() {
    
    
    
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      let targetTab = (tabs && tabs.length > 0) ? tabs[0] : null;

      
      if (targetTab && targetTab.url.startsWith('chrome-extension://')) {
        chrome.tabs.query({ lastFocusedWindow: true }, (allTabs) => {
          
          const realTab = allTabs.find(t => t.url && !t.url.startsWith('chrome-extension://') && !t.url.startsWith('chrome://'));
          if (realTab) {
            setupHostnameSettings(realTab.url);
          } else {
            
            
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

  
  applyDomainSpecificSettings();

  siteToggle.addEventListener('change', () => {
    if (!currentHostname) return;

    const isEnabled = siteToggle.checked;
    siteToggleLabel.textContent = currentHostname;

    chrome.storage.local.get(['disabledDomains'], (items) => {
      let disabledDomains = items.disabledDomains || [];

      if (isEnabled) {
        
        disabledDomains = disabledDomains.filter(domain => domain !== currentHostname);
      } else {
        
        if (!disabledDomains.includes(currentHostname)) {
          disabledDomains.push(currentHostname);
        }
      }

      chrome.storage.local.set({ disabledDomains: disabledDomains }, () => {
        
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

  
  function updateStatus(message, type = 'info') {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
    statusDiv.style.display = 'block';
    setTimeout(() => {
      statusDiv.style.display = 'none';
    }, 3000);
  }

  const PROVIDERS = LUMINA_PROVIDERS;

  
  function renderProviders() {
    if (!providerListEl) return;

    
    
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

  
  function populateProviderDropdowns() {
    
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

  
  function showAddProviderForm() {
    providerFormId.value = '';
    providerFormName.value = '';
    providerFormType.value = 'openai';
    providerFormEndpoint.value = '';
    providerFormApiKey.value = '';

    
    const apiKeyLink = document.getElementById('providerApiKeyLink');
    if (apiKeyLink) apiKeyLink.classList.add('hidden');

    
    const originalParent = providerListEl.parentElement;
    if (originalParent) originalParent.appendChild(providerForm);

    providerForm.classList.remove('hidden');
    addProviderBtn.classList.add('hidden');
    providerFormName.focus();
  }

  
  function editProvider(id) {
    const provider = providers.find(p => p.id === id);
    if (!provider) return;

    providerFormId.value = provider.id;
    providerFormName.value = provider.name;
    providerFormType.value = provider.type;
    providerFormEndpoint.value = provider.endpoint;
    providerFormApiKey.value = provider.apiKey || '';

    
    const apiKeyLink = document.getElementById('providerApiKeyLink');
    if (apiKeyLink) {
      let linkUrl = null;

      
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

    
    const item = providerListEl.querySelector(`.provider-item[data-id="${id}"]`);
    if (item) {
      
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

    
    chrome.storage.local.set({ providers }, () => {
      renderProviders();
      populateProviderDropdowns();
      hideProviderForm();
    });
  }

  
  function deleteProvider(id) {
    
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

  
  function hideProviderForm() {
    
    providerListEl.querySelectorAll('.provider-item-content').forEach(c => c.classList.remove('hidden'));

    
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

  
  function getProviderById(id) {
    return providers.find(p => p.id === id);
  }

  
  if (addProviderBtn) {
    addProviderBtn.addEventListener('click', showAddProviderForm);
  }
  if (cancelProviderBtn) {
    cancelProviderBtn.addEventListener('click', hideProviderForm);
  }
  if (saveProviderBtn) {
    saveProviderBtn.addEventListener('click', saveProvider);
  }

  
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
            
            const keyDisplay = key.length > 16 ? `${key.substring(0, 8)}...${key.substring(key.length - 4)}` : key;

            try {
              let testUrl, headers;

              if (provider.type === 'gemini') {
                
                const baseUrl = provider.endpoint.includes('/models')
                  ? provider.endpoint.split('/models')[0] + '/models'
                  : 'https://generativelanguage.googleapis.com/v1beta/models';
                testUrl = `${baseUrl}?key=${key}`;
                headers = {};
              } else {
                
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
  let isSelectingModel = false; 

  const textChainListEl = document.getElementById('textChainList');
  const textChainProviderInput = document.getElementById('textChainProvider');
  const textChainProviderList = document.getElementById('textChainProviderList');
  const textChainModelInput = document.getElementById('textChainModel');

  const textChainModelList = document.getElementById('textChainModelList');

  
  if (textChainProviderInput && textChainProviderList) {
    
    if (textChainModelInput) {
      textChainModelInput.disabled = true;
      textChainModelInput.placeholder = 'Select provider first...';
    }

    textChainProviderInput.addEventListener('click', () => {
      
      const isVisible = textChainProviderList.style.display === 'block';
      textChainProviderList.style.display = isVisible ? 'none' : 'block';

      if (!isVisible) {
        
        textChainProviderList.innerHTML = providers.map(p =>
          `<div class="dropdown-item" data-value="${p.id}">${escapeHtml(p.name)}</div>`
        ).join('');

        
        textChainProviderList.querySelectorAll('.dropdown-item').forEach(item => {
          item.addEventListener('click', () => {
            textChainProviderInput.value = item.textContent;
            textChainProviderInput.dataset.providerId = item.dataset.value;
            textChainProviderList.style.display = 'none';

            
            if (textChainModelInput) {
              textChainModelInput.disabled = false;
              textChainModelInput.placeholder = 'Type or select model...';
            }

            
            const prov = getProviderById(item.dataset.value);
            if (prov) fetchModelsForProvider(prov, {
              targetListId: 'textChainModelList',
              targetInputId: 'textChainModel'
            });
          });
        });
      }
    });

    
    document.addEventListener('click', (e) => {
      if (!textChainProviderInput.contains(e.target) && !textChainProviderList.contains(e.target)) {
        textChainProviderList.style.display = 'none';
      }
    });
  }

  
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

    textChain.unshift(newItem); 
    renderChainList();
    saveModelChains();
    
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

    
    if (currentlyConfiguringModel === modelName && currentlyConfiguringProvider === providerId) {
      currentlyConfiguringModel = null;
      currentlyConfiguringProvider = null;
    } else {
      currentlyConfiguringModel = modelName;
      currentlyConfiguringProvider = providerId;
    }

    
    renderChainList();
  }

  function setupInlineParamListeners() {
    
  }

  function saveInlineParam(providerId, modelName, paramName, value) {
    const modelKey = `${providerId}:${modelName}`;
    if (!advancedParamsByModel[modelKey]) {
      advancedParamsByModel[modelKey] = {};
    }
    advancedParamsByModel[modelKey][paramName] = value;
    
    chrome.storage.local.set({ advancedParamsByModel });
  }

  
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

  
  function populateChainDropdowns() {
    
    
    
    if (textChainProviderInput) {
      textChainProviderInput.value = '';
      delete textChainProviderInput.dataset.providerId;
    }

  }

  
  initializeProviders().then(() => {
    renderProviders();
    populateProviderDropdowns();
    populateChainDropdowns(); 
  });

  
  chrome.storage.local.get(['globalDefaults', 'modelChains', 'advancedParamsByModel', 'provider', 'model', 'fontSize', 'popupWidth', 'popupHeight', 'responseLanguage', 'disabledDomains', 'theme', 'memoryThreshold', 'compactionSize', 'questionMappings', 'autoHideInputEnabled', 'deepLApiKey', 'temperature', 'topP', 'customParams', 'dictProvider', 'dictModel', 'audioSpeed', 'autoAudio', 'googleClientId', 'githubClientId', 'displayMode', 'dictLanguage'], (items) => {
    
    setTimeout(() => {
      
      if (items.advancedParamsByModel) {
        advancedParamsByModel = items.advancedParamsByModel;
      }

      
      if (items.modelChains) {
        textChain = items.modelChains.text || [];
      }

      renderChainList();




      
      if (typeof Sortable !== 'undefined') {
        const createSortable = (el) => {
          if (!el) return;
          new Sortable(el, {
            animation: 150,
            handle: '.chain-item', 
            ghostClass: 'chain-item-ghost',
            onEnd: function (evt) {
              
              const chain = textChain;
              const item = chain.splice(evt.oldIndex, 1)[0];
              chain.splice(evt.newIndex, 0, item);

              
              renderChainList();
              saveModelChains();
            }
          });
        };
        createSortable(document.getElementById('textChainList'));
      }



      
      if (items.dictProvider && dictProviderInput) {
        const prov = getProviderById(items.dictProvider);
        if (prov) {
          dictProviderInput.value = prov.name;
          dictProviderInput.dataset.providerId = items.dictProvider;
          
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

      
      if (typeof restoreLastSessionState === 'function') {
        setTimeout(restoreLastSessionState, 300);
        
        setTimeout(() => { isInitialLoad = false; }, 1500);
      }
    }, 200);


    if (items.deepLApiKey && deepLApiKeyInput) deepLApiKeyInput.value = items.deepLApiKey;

    if (items.googleClientId && googleClientIdInput) googleClientIdInput.value = items.googleClientId;
    if (items.githubClientId && githubClientIdInput) {
      githubClientIdInput.value = items.githubClientId;
      localStorage.setItem('gh_client_id', items.githubClientId);
    }


    
    const globalDefaults = items.globalDefaults || {};
    const defaultFontSize = globalDefaults.fontSize || items.fontSize || 13;

    
    fontSizeInput.value = defaultFontSize;

    
    const savedLanguage = items.responseLanguage || 'vi';
    const langRadio = document.querySelector(`input[name="responseLanguage"][value="${savedLanguage}"]`);
    if (langRadio) langRadio.checked = true;

    
    const dictLang = items.dictLanguage || 'en';
    const dictLangRadio = document.querySelector(`input[name="dictLanguage"][value="${dictLang}"]`);
    if (dictLangRadio) dictLangRadio.checked = true;


    



    
    const autoHideInputEnabledCheckbox = document.getElementById('autoHideInputEnabled');
    if (autoHideInputEnabledCheckbox) {
      autoHideInputEnabledCheckbox.checked = items.autoHideInputEnabled !== undefined ? items.autoHideInputEnabled : false;
      autoHideInputEnabledCheckbox.addEventListener('change', saveOptions);
    }

    
    if (items.temperature !== undefined) {
      temperatureInput.value = items.temperature;
      temperatureValue.textContent = items.temperature.toFixed(1);
    }
    
    setTimeout(() => {
      if (window.loadAdvancedParamsForModel) {
        window.loadAdvancedParamsForModel();
      } else {
        loadAdvancedParamsForModel();
      }
    }, 200);

    

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

        
        const currentThreshold = parseInt(memThreshInput.value, 10);
        if (val > currentThreshold) {
          val = currentThreshold;
          e.target.value = val; 
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

    
    if (typeof loadQuestionMappings === 'function') {
      loadQuestionMappings(items);
    }

    
    window._dictPlusSettingsLoaded = true;

    
    if (typeof applyDomainSpecificSettings === 'function') {
      applyDomainSpecificSettings();
    }
  });

  
  function saveOptions() {
    if (!window._dictPlusSettingsLoaded) return;
    const provider = providerSelect ? providerSelect.value : '';  
    const model = modelInput ? modelInput.value : '';             
    const fontSize = fontSizeInput ? fontSizeInput.value : '13';
    const responseLanguage = document.querySelector('input[name="responseLanguage"]:checked')?.value || 'vi';
    const theme = document.querySelector('input[name="theme"]:checked')?.value || 'auto';

    applyTheme(theme);

    
    const shortcuts = {};
    document.querySelectorAll('.shortcut-input').forEach(input => {
      const action = input.dataset.action;
      if (!action) return; 

      const keyData = input.dataset.key ? JSON.parse(input.dataset.key) : null;
      shortcuts[action] = keyData;
    });

    
    const annotationShortcutsExport = [];
    document.querySelectorAll('.annotation-shortcut-row').forEach((row) => {
      const activeSwatch = row.querySelector('.color-swatch.active');
      const keyInput = row.querySelector('.annotation-shortcut-input');

      if (keyInput) {
        try {
          const keyStr = keyInput.dataset.key;
          const keyData = (keyStr && keyStr !== '') ? JSON.parse(keyStr) : null;
          
          annotationShortcutsExport.push({
            ...keyData,
            color: activeSwatch ? activeSwatch.dataset.color : '#FFFB78'
          });
        } catch (e) {
          console.error('Error parsing annotation key data', e);
        }
      }
    });

    const audioSpeed = parseFloat(audioSpeedInput ? audioSpeedInput.value : 1.0);

    
    chrome.storage.local.get(['globalDefaults', 'fontSizeByDomain'], (existing) => {
      let globalDefaults = existing.globalDefaults || {};
      let fontSizeByDomain = existing.fontSizeByDomain || {};

      
      globalDefaults.fontSize = parseFloat(fontSize);
      globalDefaults.theme = theme;

      
      const questionMappingsExport = [];
      document.querySelectorAll('.mapping-item').forEach((row) => {
        const keyInput = row.querySelector('.mapping-key-input');
        const promptInput = row.querySelector('.mapping-prompt');
        const prompt = promptInput ? (promptInput.innerText || promptInput.textContent).trim() : '';

        if (keyInput) {
          try {
            const keyStr = keyInput.dataset.key;
            const keyData = (keyStr && keyStr !== '') ? JSON.parse(keyStr) : null;
            
            questionMappingsExport.push({ keyData, prompt });
          } catch (e) {
            console.error('Error parsing key data', e);
            
            questionMappingsExport.push({ keyData: null, prompt });
          }
        }
      });

      const settings = {
        provider: provider,
        model: model,
        dictProvider: dictProviderInput?.dataset?.providerId || '',
        dictModel: dictModelInput ? dictModelInput.value : '',
        questionMappings: questionMappingsExport,
        fontSize: fontSize, 
        globalDefaults: globalDefaults,
        compactionSize: parseInt(document.getElementById('compactionSize')?.value, 10) || 10,
        responseLanguage: responseLanguage,
        dictLanguage: document.querySelector('input[name="dictLanguage"]:checked')?.value || 'en',
        theme: theme,
        shortcuts: shortcuts,
        annotationShortcuts: annotationShortcutsExport,
        autoHideInputEnabled: document.getElementById('autoHideInputEnabled')?.checked || false,
        audioSpeed: audioSpeed,
        memoryThreshold: parseInt(document.getElementById('memoryThreshold')?.value, 10) || 14,
        maxTokens: document.getElementById('maxTokens')?.value || null
      };




      
      if (googleClientIdInput) settings.googleClientId = googleClientIdInput.value;
      if (githubClientIdInput) {
        const ghId = githubClientIdInput.value;
        settings.githubClientId = ghId;
        
        localStorage.setItem('gh_client_id', ghId);
      }

      chrome.storage.local.set(settings, () => {
        
        try {
          
        } catch (e) {
          console.warn('Failed to sync to localStorage:', e);
        }

        
        chrome.tabs.query({}, (tabs) => {
          tabs.forEach(tab => {
            
            const isLuminaPage = tab.url && tab.url.startsWith(chrome.runtime.getURL(''));
            if (!tab.id || !tab.url || (!tab.url.startsWith('http://') && !tab.url.startsWith('https://') && !isLuminaPage)) {
              return;
            }

            
            chrome.tabs.sendMessage(tab.id, {
              action: 'shortcuts_updated',
              shortcuts: shortcuts
            }).catch(() => {  });

            
            chrome.tabs.sendMessage(tab.id, {
              action: 'settings_updated',
              settings: {
                fontSize: fontSize,
                fontSizeByDomain: fontSizeByDomain,
                globalDefaults: globalDefaults,
                theme: theme,
              }
            }).catch(() => {  });
          });
        });
      });
    });
  }
  
  const inputs = [
    providerSelect, modelInput,

    deepLApiKeyInput,
    fontSizeInput,
  ].filter(Boolean); 

  inputs.forEach(input => {
    if (input) { 
      input.addEventListener('change', saveOptions);
      if (input.type === 'text' || input.type === 'number' || input.type === 'password') {
        input.addEventListener('input', debounce(saveOptions, 500));
      } else {
        input.addEventListener('input', saveOptions);
      }
    }
  });

  
  function debounce(func, wait) {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  

  
  document.querySelectorAll('input[name="theme"]').forEach(radio => {
    radio.addEventListener('change', saveOptions);
  });

  document.querySelectorAll('input[name="responseLanguage"]').forEach(radio => {
    radio.addEventListener('change', saveOptions);
  });

  document.querySelectorAll('input[name="dictLanguage"]').forEach(radio => {
    radio.addEventListener('change', saveOptions);
  });


  if (providerSelect) {
    providerSelect.addEventListener('change', () => {
      const providerId = providerSelect.value;
      saveOptions();

      
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

  
  function setupDropdown(input, list, getModels) {
    if (!input || !list) return; 

    input.addEventListener('focus', () => {
      if (input.value && !availableModels.includes(input.value)) {
        
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
      
      div.addEventListener('mousedown', (e) => {
        e.preventDefault(); 
        e.stopPropagation(); 
        isSelectingModel = true; 

        const oldModel = inputElement.value;
        const modelToSave = currentlyConfiguringModel || oldModel;

        
        if (modelToSave && window.saveAdvancedParamsForCurrentModel) {
          window.saveAdvancedParamsForCurrentModel(modelToSave);
        }

        inputElement.value = model;
        listElement.style.display = 'none'; 
        listElement.classList.remove('show');

        
        if (inputElement.id === 'model' && currentlyConfiguringModel) {
          currentlyConfiguringModel = null;
          currentlyConfiguringProvider = null;
          
          if (typeof renderChainList === 'function') {
            renderChainList();
          }
        }

        
        document.dispatchEvent(new CustomEvent('modelChanged'));
        
        saveOptions();

        
        if (inputElement.id === 'textChainModel') {
          addToChain();
        }

        
        setTimeout(() => {
          isSelectingModel = false;
        }, 50);
      });
      listElement.appendChild(div);
    });
  }


  

  
  if (dictProviderInput && dictProviderList) {
    
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

  
  if (dictModelInput) {
    dictModelInput.addEventListener('change', () => {
      saveOptions();
    });

    dictModelInput.addEventListener('focus', () => {
      const providerId = dictProviderInput?.dataset?.providerId;
      const provider = providerId ? getProviderById(providerId) : null;
      if (provider) {
        
        fetchModelsForProvider(provider, {
          selectedModel: dictModelInput.value,
          isDict: true
        });
      }
      if (dictModelList) dictModelList.style.display = 'block';
    });

    dictModelInput.addEventListener('input', () => {
      const query = dictModelInput.value.toLowerCase();
      
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

  
  async function fetchModelsForProvider(provider, options = {}) {
    if (!provider) return;

    
    const {
      selectedModel = '',
      isVision = false,
      isTrans = false,
      isDict = false,
      targetListId = null,
      targetInputId = null,
      customTarget = false
    } = options;

    
    let listId = targetListId;
    let inputId = targetInputId;

    if (!listId) {
      if (isDict) listId = 'dictModelList';
      else listId = 'modelList';
    }
    if (!inputId) {
      if (isDict) inputId = 'dictModel';
      else inputId = 'model';
    }

    try {
      const firstKey = provider.apiKey ? provider.apiKey.split(',')[0].trim() : '';
      let models = [];

      console.log('[Lumina Options] Fetching models for provider:', provider.name, 'type:', provider.type, 'endpoint:', provider.endpoint, 'hasKey:', !!firstKey);

      
      let modelsUrl = normalizeOpenAICompatibleEndpoint(provider.endpoint, '/models');

      
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


      
      if (isDict) {
        availableDictModels = models;
      } else {
        availableModels = models;
      }

      console.log('[Lumina Options] Fetched', models.length, 'models for', provider.name, ':', models.slice(0, 5), '...');

      const inputEl = document.getElementById(inputId);
      const listEl = document.getElementById(listId);
      renderModelDropdown(listEl, inputEl, models);

      
      if (inputEl && document.activeElement === inputEl && listEl) {
        listEl.style.display = 'block';
      }

      
      if (inputEl && selectedModel) {
        inputEl.value = selectedModel;
      }
    } catch (e) {
      console.warn('Failed to fetch models:', e);
      
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

        
        if (input.id === 'textChainModel') {
          addToChain();
        }

        
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

      
    } catch (e) {
      console.error('Failed to fetch models', e);
      availableModels = [];
    }
  }

  
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
    if (!customParamsList) return ''; 
    const rows = customParamsList.querySelectorAll('.custom-param-row');
    const params = {};
    rows.forEach(row => {
      const key = row.querySelector('.custom-param-key')?.value?.trim();
      let value = row.querySelector('.custom-param-value')?.value?.trim();
      if (key) {
        
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

    
    customParamsList.addEventListener('focusout', (e) => {
      if (e.target.tagName === 'INPUT') {
        const targetModel = currentlyConfiguringModel || modelInput?.value?.trim();
        if (targetModel) saveAdvancedParamsForCurrentModel(targetModel);
      }
    });
  }

  
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

    
    let provider = currentlyConfiguringProvider;
    if (!provider && !currentlyConfiguringModel) {
      
      provider = providerSelect?.value;
    }

    
    const storageKey = provider ? `${provider}:${model}` : model;

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
  }

  function loadAdvancedParamsForModel(modelOverride, providerOverride) {
    
    const model = (typeof modelOverride === 'string' && modelOverride)
      ? modelOverride
      : (currentlyConfiguringModel || modelInput?.value?.trim());

    if (!model) return;

    
    let provider = providerOverride || currentlyConfiguringProvider;
    if (!provider && !currentlyConfiguringModel) {
      provider = providerSelect?.value;
    }

    const storageKey = provider ? `${provider}:${model}` : model;

    chrome.storage.local.get(['advancedParamsByModel'], (result) => {
      const allParams = result.advancedParamsByModel || {};
      
      const params = allParams[storageKey] || allParams[model] || { temperature: 1.0, topP: 1.0, customParams: '' };

      
      temperatureInput.value = params.temperature;
      temperatureValue.textContent = params.temperature.toFixed(1);
      topPInput.value = params.topP;
      topPValue.textContent = params.topP.toFixed(2);

      
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

  
  document.addEventListener('modelChanged', loadAdvancedParamsForModel);
  if (modelInput) {
    modelInput.addEventListener('blur', debounce(loadAdvancedParamsForModel, 300));
  }

  
  function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = 'status ' + type;
    statusDiv.style.display = 'block';
  }
  
  function setupStepperButton(btn, delta) {
    let timeoutId = null;
    let intervalId = null;
    let speed = 150; 

    const updateValue = () => {
      let val = parseFloat(fontSizeInput.value) || 13;
      let newVal = val + delta;
      
      if (newVal >= 10 && newVal <= 30) {
        fontSizeInput.value = newVal;
        saveOptions();
      }
    };

    const startRepeating = () => {
      updateValue(); 

      
      timeoutId = setTimeout(() => {
        
        const loop = () => {
          updateValue();
          
          speed = Math.max(30, speed * 0.9);
          intervalId = setTimeout(loop, speed);
        };
        loop();
      }, 500);
    };

    const stopRepeating = () => {
      clearTimeout(timeoutId);
      clearTimeout(intervalId);
      speed = 150; 
    };

    btn.addEventListener('mousedown', startRepeating);
    btn.addEventListener('mouseup', stopRepeating);
    btn.addEventListener('mouseleave', stopRepeating);
  }

  setupStepperButton(decreaseFontSizeBtn, -0.5);
  setupStepperButton(increaseFontSizeBtn, 0.5);

  
  document.querySelectorAll('input[name="theme"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const selectedTheme = document.querySelector('input[name="theme"]:checked')?.value || 'auto';
      applyTheme(selectedTheme);
      saveOptions();
    });
  });

  
  document.querySelectorAll('input[name="responseLanguage"]').forEach(radio => {
    radio.addEventListener('change', saveOptions);
  });



  const DEFAULT_SHORTCUTS = {
    image: { code: 'KeyI', key: 'i', display: 'I' },
    proofread: { code: 'KeyC', key: 'c', display: 'C' },
    luminaChat: { code: 'Backquote', key: '`', display: '`' },
    audio: { code: 'ShiftLeft', key: 'Shift', display: isMac ? '⇧L' : 'ShiftL', shiftKey: true },
    resetChat: { code: 'Mouse0', key: 'Mouse0', display: 'Left', metaKey: true, shiftKey: true },
    regenerate: { code: 'KeyR', key: 'r', display: 'R' },
    annotationShortcuts: [
      { key: 'h', code: 'KeyH', color: '#FFFB78', display: 'H' }
    ]
  };

  let currentRecordingInput = null;
  let recordingPressedCodes = new Set(); 
  let recordingHadInput = false;    
  let suppressNextShortcutClick = null;

  
  function getKeyDisplay(event) {
    
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

    
    if (key === 'Unidentified' && (code === 'Space' || event.keyCode === 32)) {
      key = 'Space';
    }

    
    if (!key || key === 'Unidentified' || key === 'Dead' || ((event.altKey || event.ctrlKey || event.metaKey) && code && (code.startsWith('Key') || code.startsWith('Digit')))) {
      if (code && code.startsWith('Key')) {
        key = code.slice(3);
      } else if (code && code.startsWith('Digit')) {
        key = code.slice(5);
      } else if (code === 'Space') {
        key = 'Space';
      } else {
        
        const codeMap = {
          'Comma': ',', 'Period': '.', 'Slash': '/', 'Backslash': '\\',
          'BracketLeft': '[', 'BracketRight': ']', 'Quote': "'", 'Semicolon': ';',
          'Minus': '-', 'Equal': '=', 'Backquote': '`'
        };
        if (codeMap[code]) key = codeMap[code];
        else if (code && !code.startsWith('Control') && !code.startsWith('Alt') && !code.startsWith('Shift') && !code.startsWith('Meta')) {
          
          key = code;
        }
      }
    }

    
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

  
  function stopRecording(inputEl, restoreOriginal = true) {
    inputEl.classList.remove('recording');

    if (restoreOriginal && inputEl.dataset.key) {
      
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

  
  function showModifierPreview(e) {
    if (!currentRecordingInput) return;

    
    if (hasModifiers) {
      
    } else {
      currentRecordingInput.innerHTML = '';
      const template = document.getElementById('shortcutRecordingTemplate');
      currentRecordingInput.appendChild(template.content.cloneNode(true));
    }
  }

  function setupShortcutInput(input) {
    const action = input.dataset.action;
    const defaultKey = (typeof LUMINA_DEFAULT_SHORTCUTS !== 'undefined') ? LUMINA_DEFAULT_SHORTCUTS[action] : null;

    
    if (!input.parentElement.classList.contains('shortcut-input-container')) {
      const container = document.createElement('div');
      container.className = 'shortcut-input-container';
      container.style.position = 'relative';
      container.style.display = 'flex';
      container.style.alignItems = 'center';
      container.style.gap = '8px';
      if (action) {
        container.style.marginLeft = 'auto'; 
      }

      input.parentElement.insertBefore(container, input);
      container.appendChild(input);
    }

    
    if (defaultKey) {
      renderShortcutDisplay(input, defaultKey);
    }

    
    input.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation(); 

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

    
    input.addEventListener('focus', (e) => {
      
      if (currentRecordingInput !== input) {
        startRecording(input);
      }
    });

    
    input.addEventListener('blur', (e) => {
      
      setTimeout(() => {
        if (currentRecordingInput === input) {
          if (!recordingHadInput) {
            
            renderShortcutDisplay(input, null);
            input.dataset.key = '';
            stopRecording(input, false);

            
            if (input.dataset.action || 
                input.classList.contains('mapping-key-input') || 
                input.classList.contains('annotation-shortcut-input')) {
              saveOptions();
            }
          } else {
            stopRecording(input, true);
          }
        }
      }, 100);
    });
  }

  
  document.querySelectorAll('.shortcut-input').forEach(input => {
    setupShortcutInput(input);
  });

  
  document.addEventListener('mousedown', (e) => {
    if (!currentRecordingInput) return;

    const shortcutTarget = e.target.classList.contains('shortcut-input')
      ? e.target
      : e.target.closest?.('.shortcut-input');

    
    if (shortcutTarget && shortcutTarget !== currentRecordingInput) return;

    
    e.preventDefault();
    e.stopPropagation();

    if (shortcutTarget !== currentRecordingInput) {
      if (e.button !== 0) {
        return;
      }

      const input = currentRecordingInput;
      
      renderShortcutDisplay(input, null);
      input.dataset.key = '';
      recordingHadInput = false;
      stopRecording(input, false);

      if (input.dataset.action || input.classList.contains('mapping-key-input') || input.classList.contains('annotation-shortcut-input')) {
        saveOptions();
      }
      return;
    }

    
    recordMouseShortcut(currentRecordingInput, e.button, e);
  }, true);

  
  document.addEventListener('keydown', (e) => {
    if (!currentRecordingInput) return;

    e.preventDefault();
    e.stopPropagation();

    recordingPressedCodes.add(e.code);

    
    const isModifier = ['Control', 'Alt', 'Shift', 'Meta'].includes(e.key);

    
    
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
        code = e.key; 
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

    

    if (isModifier) {
      
      renderShortcutDisplay(currentRecordingInput, keyData);
      
    } else {
      
      renderShortcutDisplay(currentRecordingInput, keyData);
      recordingHadInput = true;
      const input = currentRecordingInput;
      input.classList.remove('recording');
      input.blur();
      currentRecordingInput = null;

      if (input.dataset.action || 
          input.classList.contains('mapping-key-input') || 
          input.classList.contains('annotation-shortcut-input')) {
        saveOptions();
      }
    }
  }, true); 

  
  document.addEventListener('keyup', (e) => {
    recordingPressedCodes.delete(e.code);

    if (!currentRecordingInput) return;

    const isModifier = ['Control', 'Alt', 'Shift', 'Meta'].includes(e.key);

    
    if (isModifier) {
      
      recordingHadInput = true;
      const input = currentRecordingInput;
      input.classList.remove('recording');
      input.blur();
      currentRecordingInput = null;

      if (input.dataset.action || input.classList.contains('mapping-key-input') || input.classList.contains('annotation-shortcut-input')) {
        saveOptions();
      }
    }
  }, true);

  
  chrome.storage.local.get(['shortcuts', 'annotationShortcuts'], (items) => {
    const savedShortcuts = items.shortcuts || {};
    const savedAnnotations = items.annotationShortcuts || DEFAULT_SHORTCUTS.annotationShortcuts || [];

    document.querySelectorAll('.shortcut-input').forEach(input => {
      const action = input.dataset.action;

      
      if (!action || input.classList.contains('annotation-shortcut-input')) return;

      if (action in savedShortcuts) {
        renderShortcutDisplay(input, savedShortcuts[action]);
      }
    });

    loadAnnotationShortcuts(savedAnnotations);
  });

  
  chrome.storage.onChanged.addListener((changes, areaName) => {
    
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

      
      if (textNode.nodeType !== Node.TEXT_NODE) {
        
        if (textNode.childNodes.length === 0) {
          textNode.appendChild(document.createTextNode(''));
          textNode = textNode.firstChild;
        } else {
          
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
        e.preventDefault(); 
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


  
  function loadQuestionMappings(items) {
    const savedMappings = items.questionMappings || [];
    const mappingsList = document.getElementById('questionMappingsList');
    if (mappingsList) {
      mappingsList.innerHTML = '';
      savedMappings.forEach(m => {
        
        const data = m.keyData || m.key;
        renderMappingRow(data, m.prompt);
      });
      refreshMappingNumbers();
    }
  }

  

  if (addMappingBtn) {
    addMappingBtn.addEventListener('click', () => {
      renderMappingRow();
      saveOptions(); 
    });
  }



  
  const ANNOTATION_COLORS = ['#FFFB78', '#FFDE70', '#92ffaa', '#D1FF61', '#FFCAD7', '#B2D7FF'];

  function loadAnnotationShortcuts(annotations) {
    const list = document.getElementById('annotationShortcutsList');
    if (!list) return;

    list.innerHTML = '';
    const items = annotations || [];
    items.forEach(a => {
      renderAnnotationShortcutRow(a);
    });
  }

  function renderAnnotationShortcutRow(data = null) {
    const list = document.getElementById('annotationShortcutsList');
    if (!list) return;

    const template = document.getElementById('annotationShortcutTemplate');
    if (!template) return;

    const clone = template.content.cloneNode(true);
    const div = clone.querySelector('.annotation-shortcut-row');

    const palette = div.querySelector('.annotation-color-palette');
    const keyInput = div.querySelector('.annotation-shortcut-input');
    const deleteBtn = div.querySelector('.annotation-remove-btn');

    
    const currentColor = data && data.color ? data.color : ANNOTATION_COLORS[0];

    
    ANNOTATION_COLORS.forEach(color => {
      const swatch = document.createElement('div');
      swatch.className = 'color-swatch';
      if (color.toLowerCase() === currentColor.toLowerCase()) {
        swatch.classList.add('active');
      }
      swatch.style.backgroundColor = color;
      swatch.dataset.color = color;
      
      swatch.addEventListener('click', () => {
        div.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
        swatch.classList.add('active');
        saveOptions();
      });
      
      palette.appendChild(swatch);
    });

    if (data) {
      
      if (data.key || data.code) {
        renderShortcutDisplay(keyInput, data);
      } else {
        renderShortcutDisplay(keyInput, null);
      }
    }

    
    setupShortcutInput(keyInput);

    deleteBtn.addEventListener('click', () => {
      div.remove();
      saveOptions();
    });

    list.appendChild(div);
  }

  const addAnnotationShortcutBtn = document.getElementById('addAnnotationShortcutBtn');
  if (addAnnotationShortcutBtn) {
    addAnnotationShortcutBtn.addEventListener('click', () => {
      renderAnnotationShortcutRow();
      
    });
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      
      if (changes.user_memory) {
        renderUserFacts();
        updateMemoryStats();
      }
    }
  });

  const userFactsList = document.getElementById('userFactsList');
  const newFactInput = document.getElementById('newFactInput');
  const addFactBtn = document.getElementById('addFactBtn');

  
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
        
        const originalHTML = setGlobalDefaultsBtn.innerHTML;
        setGlobalDefaultsBtn.innerHTML = '';
        const template = document.getElementById('appliedStateTemplate');
        if (template) {
          setGlobalDefaultsBtn.appendChild(template.content.cloneNode(true));
        }
        setGlobalDefaultsBtn.classList.add('btn-applied');

        
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
              }).catch(() => { }); 
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

      
      if (fontSizeInput) fontSizeInput.value = defaultFontSize;
      if (audioSpeedInput) audioSpeedInput.value = defaultAudioSpeed;

      const radio = document.querySelector(`input[name="theme"][value="${defaultTheme}"]`);
      if (radio) radio.checked = true;

      
      applyTheme(defaultTheme);

      
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
        
        updateStatus('Settings reset to system defaults', 'success');

        
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


  
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => {
      renderUserFacts();
    });
  } else {
    setTimeout(() => {
      renderUserFacts();
    }, 200);
  }


  
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

      
      if (syncCard) {
        syncCard.style.opacity = '1';
        syncCard.style.pointerEvents = 'auto';

        
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

      
      if (syncCard) {
        syncCard.style.opacity = '0.5';
        syncCard.style.pointerEvents = 'none';
      }
    }
  }

  
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

        
        googleLoginBtn.innerHTML = originalHTML;
      } catch (e) {
        console.error(e);
        updateStatus('Sign in failed: ' + e.message, 'error');
        googleLoginBtn.innerHTML = 'Sign in with Google'; 
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
        
      } catch (e) {
        
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
        
      } finally {
        syncDownBtn.disabled = false;
      }
    });
  }

  
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

  
  LuminaAuth.addListener(updateAuthUI);

  
  if (LuminaAuth.isAuthenticated) {
    updateAuthUI(true, LuminaAuth.user);
    
    LuminaSync.getLastSyncTime().then(time => {
      if (syncStatus && time !== 'Never') {
        syncStatus.textContent = `Last synced: ${time}`;
      }
    });
  }

  
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
        importSettingsFile.value = ''; 
        return;
      }

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const content = JSON.parse(event.target.result);

          
          let dataToRestore = content;
          if (content.data && content.timestamp) {
            dataToRestore = content.data; 
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

