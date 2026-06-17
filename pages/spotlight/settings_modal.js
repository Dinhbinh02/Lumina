class LuminaSettingsModal {
  static init() {
    this.overlay = document.getElementById('lumina-settings-overlay');
    this.closeBtn = document.getElementById('lumina-settings-close-btn');
    this.navContainer = document.getElementById('lumina-settings-nav');
    this.mainContainer = document.querySelector('.lumina-settings-main');
    this.sections = document.querySelectorAll('.lumina-settings-section');
    this.navItems = document.querySelectorAll('.lumina-settings-nav-item');

    if (!this.overlay) return;

    this.closeBtn.addEventListener('click', () => this.hide());
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.hide();
    });

    this.navItems.forEach(item => {
      item.addEventListener('click', () => {
        const sectionId = item.getAttribute('data-section');
        this.switchSection(sectionId);
      });
    });

    this.providers = [];
    this.textChain = [];
    this.advancedParamsByModel = {};
    this.questionMappings = [];
    this.annotationShortcuts = [];
    this.userFacts = [];

    this.bindGeneralTab();
    this.bindAppearanceTab();
    this.bindPersonalizationTab();
    this.bindKeyboardTab();
    this.bindAccountTab();

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local' && changes.user_memory && this.overlay && this.overlay.style.display !== 'none') {
        UserMemory.load().then(memory => {
          this.userFacts = memory.facts || [];
          this.renderUserFacts();
        });
      }
    });

    this.initialized = true;
  }

  static show() {
    if (!this.initialized) this.init();
    if (this.overlay) {
      this.overlay.style.display = 'flex';
      this.loadSettings();
    }
  }

  static hide() {
    if (this.overlay) {
      this.overlay.style.display = 'none';
    }
  }

  static switchSection(sectionId) {
    this.navItems.forEach(item => {
      item.classList.toggle('active', item.getAttribute('data-section') === sectionId);
    });
    this.sections.forEach(section => {
      section.classList.toggle('active', section.id === `lumina-settings-sec-${sectionId}`);
    });
    if (this.mainContainer) this.mainContainer.scrollTop = 0;
  }

  static async loadSettings() {
    const keys = [
      'providers', 'modelChains', 'advancedParamsByModel', 'fontSize', 'responseLanguage',
      'theme', 'contrast', 'accentColor', 'language', 'dictationEnabled', 'spokenLanguage',
      'voice', 'separateVoiceEnabled', 'baseTone', 'charWarm', 'charEnthusiastic',
      'charHeaders', 'charEmoji', 'aboutNickname', 'aboutOccupation', 'aboutInterests',
      'questionMappings', 'annotationShortcuts', 'dictLanguage',
      'translateInputEngine', 'translateEngine', 'dictProvider', 'dictModel',
      'historyRetentionMonths'
    ];

    chrome.storage.local.get(keys, (items) => {
      this.providers = items.providers || this.getDefaultProviders();
      this.renderProviders();
      this.populateProviderDropdowns();

      if (items.modelChains) {
        this.textChain = items.modelChains.text || [];
      }
      this.advancedParamsByModel = items.advancedParamsByModel || {};
      this.renderChainList();

      const dictLang = items.dictLanguage || 'en';
      const dictRadio = document.querySelector(`input[name="lumina-dictLanguage"][value="${dictLang}"]`);
      if (dictRadio) dictRadio.checked = true;

      const translateInputEngine = items.translateInputEngine || 'google';
      const transInputRadio = document.querySelector(`input[name="lumina-translateInputEngine"][value="${translateInputEngine}"]`);
      if (transInputRadio) transInputRadio.checked = true;

      const translateEngine = items.translateEngine || 'google';
      const transRadio = document.querySelector(`input[name="lumina-translateEngine"][value="${translateEngine}"]`);
      if (transRadio) transRadio.checked = true;

      if (items.dictProvider) {
        const dictProvInput = document.getElementById('lumina-dict-provider');
        dictProvInput.value = items.dictProvider;
      }
      if (items.dictModel) {
        const dictModelInput = document.getElementById('lumina-dict-model');
        dictModelInput.value = items.dictModel;
      }

      document.getElementById('lumina-settings-theme').value = items.theme || 'auto';
      document.getElementById('lumina-settings-contrast').value = items.contrast || 'auto';
      document.getElementById('lumina-settings-accent').value = items.accentColor || 'default';
      document.getElementById('lumina-settings-language').value = items.language || 'auto';
      document.getElementById('lumina-settings-dictation-toggle').checked = items.dictationEnabled !== false;
      document.getElementById('lumina-settings-spoken-lang').value = items.spokenLanguage || 'auto';
      document.getElementById('lumina-settings-voice-select').value = items.voice || 'sol';
      document.getElementById('lumina-settings-separate-voice').checked = items.separateVoiceEnabled === true;

      document.getElementById('lumina-settings-base-tone').value = items.baseTone || 'default';
      document.getElementById('lumina-settings-char-warm').value = items.charWarm || 2;
      document.getElementById('lumina-settings-char-enthusiastic').value = items.charEnthusiastic || 2;
      document.getElementById('lumina-settings-char-headers').value = items.charHeaders || 2;
      document.getElementById('lumina-settings-char-emoji').value = items.charEmoji || 2;

      document.getElementById('lumina-settings-about-nickname').value = items.aboutNickname || '';
      document.getElementById('lumina-settings-about-occupation').value = items.aboutOccupation || '';
      document.getElementById('lumina-settings-about-interests').value = items.aboutInterests || '';

      UserMemory.load().then(memory => {
        this.userFacts = memory.facts || [];
        this.renderUserFacts();
      });

      this.questionMappings = items.questionMappings || [];
      this.renderQuestionMappings();

      this.annotationShortcuts = items.annotationShortcuts || [];
      this.renderAnnotationShortcuts();

      this.loadShortcutsKeys(items);

      const retentionInput = document.getElementById('lumina-history-retention-input');
      const savedRet = items.historyRetentionMonths !== undefined ? items.historyRetentionMonths : 3;
      const matchingOpt = [
        { label: '1 Month', value: '1' },
        { label: '3 Months', value: '3' },
        { label: '6 Months', value: '6' },
        { label: '12 Months', value: '12' },
        { label: 'Forever', value: '0' }
      ].find(o => parseInt(o.value) === parseInt(savedRet));
      if (retentionInput && matchingOpt) {
        retentionInput.value = matchingOpt.label;
        retentionInput.dataset.value = matchingOpt.value;
      }

      this.updateStorageUsage();
      this.updateOPFSAttachmentsList();
    });
  }

  static saveOptions() {
    const settings = {
      theme: document.getElementById('lumina-settings-theme').value,
      contrast: document.getElementById('lumina-settings-contrast').value,
      accentColor: document.getElementById('lumina-settings-accent').value,
      language: document.getElementById('lumina-settings-language').value,
      dictationEnabled: document.getElementById('lumina-settings-dictation-toggle').checked,
      spokenLanguage: document.getElementById('lumina-settings-spoken-lang').value,
      voice: document.getElementById('lumina-settings-voice-select').value,
      separateVoiceEnabled: document.getElementById('lumina-settings-separate-voice').checked,
      baseTone: document.getElementById('lumina-settings-base-tone').value,
      charWarm: parseInt(document.getElementById('lumina-settings-char-warm').value),
      charEnthusiastic: parseInt(document.getElementById('lumina-settings-char-enthusiastic').value),
      charHeaders: parseInt(document.getElementById('lumina-settings-char-headers').value),
      charEmoji: parseInt(document.getElementById('lumina-settings-char-emoji').value),
      aboutNickname: document.getElementById('lumina-settings-about-nickname').value.trim(),
      aboutOccupation: document.getElementById('lumina-settings-about-occupation').value.trim(),
      aboutInterests: document.getElementById('lumina-settings-about-interests').value.trim(),
      dictLanguage: document.querySelector('input[name="lumina-dictLanguage"]:checked')?.value || 'en',
      translateInputEngine: document.querySelector('input[name="lumina-translateInputEngine"]:checked')?.value || 'google',
      translateEngine: document.querySelector('input[name="lumina-translateEngine"]:checked')?.value || 'google',
      dictProvider: document.getElementById('lumina-dict-provider').value,
      dictModel: document.getElementById('lumina-dict-model').value
    };

    chrome.storage.local.set(settings, () => {
      if (typeof applyTheme === 'function') {
        applyTheme(settings.theme);
      } else {
        const mode = settings.theme === 'auto' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : settings.theme;
        document.body.setAttribute('data-theme', mode);
      }
      document.body.setAttribute('data-accent', settings.accentColor);
    });
  }

  static bindGeneralTab() {
    const addBtn = document.getElementById('lumina-add-provider-btn');
    const cancelBtn = document.getElementById('lumina-cancel-provider-btn');
    const saveBtn = document.getElementById('lumina-save-provider-btn');
    const checkKeysBtn = document.getElementById('lumina-check-apikeys-btn');

    addBtn.addEventListener('click', () => this.showProviderForm());
    cancelBtn.addEventListener('click', () => this.hideProviderForm());
    saveBtn.addEventListener('click', () => this.saveProvider());
    checkKeysBtn.addEventListener('click', () => this.checkApiKeys());

    document.querySelectorAll('input[name="lumina-dictLanguage"]').forEach(r => r.addEventListener('change', () => this.saveOptions()));
    document.querySelectorAll('input[name="lumina-translateInputEngine"]').forEach(r => r.addEventListener('change', () => this.saveOptions()));
    document.querySelectorAll('input[name="lumina-translateEngine"]').forEach(r => r.addEventListener('change', () => this.saveOptions()));

    this.setupDropdownInputs('lumina-dict-provider', 'lumina-dict-provider-list');
    this.setupDropdownInputs('lumina-dict-model', 'lumina-dict-model-list');
    this.setupDropdownInputs('lumina-text-chain-provider', 'lumina-text-chain-provider-list');
    this.setupDropdownInputs('lumina-text-chain-model', 'lumina-text-chain-model-list');

    document.getElementById('lumina-text-chain-model').addEventListener('change', () => this.addModelToChain());
  }

  static getDefaultProviders() {
    return [
      { id: 'openai-default', name: 'OpenAI', type: 'openai', endpoint: 'https://api.openai.com/v1/chat/completions', apiKey: '' },
      { id: 'gemini-default', name: 'Gemini', type: 'gemini', endpoint: 'https://generativelanguage.googleapis.com/v1beta/models', apiKey: '' },
      { id: 'deepseek-default', name: 'DeepSeek', type: 'openai', endpoint: 'https://api.deepseek.com/v1', apiKey: '' }
    ];
  }

  static renderProviders() {
    const list = document.getElementById('lumina-provider-list');
    if (!list) return;
    list.innerHTML = '';

    const temp = document.getElementById('lumina-providerItemTemplate');

    this.providers.forEach(p => {
      const clone = temp.content.cloneNode(true);
      const card = clone.querySelector('.provider-item');
      card.querySelector('.provider-item-name').textContent = p.name;
      
      const badge = card.querySelector('.provider-badge');
      const hasKey = p.apiKey && p.apiKey.trim().length > 0;
      badge.textContent = hasKey ? 'Active' : 'Configure';
      badge.className = 'provider-badge ' + (hasKey ? 'active' : 'inactive');

      card.addEventListener('click', () => this.editProvider(p.id));
      list.appendChild(clone);
    });
  }

  static populateProviderDropdowns() {
    const dictProvList = document.getElementById('lumina-dict-provider-list');
    const chainProvList = document.getElementById('lumina-text-chain-provider-list');
    if (dictProvList) {
      dictProvList.innerHTML = this.providers.map(p => `<div data-val="${p.id}">${p.name}</div>`).join('');
    }
    if (chainProvList) {
      chainProvList.innerHTML = this.providers.map(p => `<div data-val="${p.id}">${p.name}</div>`).join('');
    }
  }

  static setupDropdownInputs(inputId, menuId) {
    const input = document.getElementById(inputId);
    const menu = document.getElementById(menuId);
    if (!input || !menu) return;

    input.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
    });

    document.addEventListener('click', () => {
      menu.style.display = 'none';
    });

    menu.addEventListener('click', (e) => {
      if (e.target.tagName === 'DIV') {
        input.value = e.target.textContent;
        input.dataset.value = e.target.dataset.val || e.target.textContent;
        menu.style.display = 'none';
        this.saveOptions();

        if (inputId === 'lumina-text-chain-provider') {
          this.loadModelsForProvider(input.dataset.value);
        }
      }
    });
  }

  static loadModelsForProvider(providerId) {
    const menu = document.getElementById('lumina-text-chain-model-list');
    if (!menu) return;
    const modelOptions = {
      'openai-default': ['gpt-4o', 'gpt-4o-mini', 'o1-mini', 'o1-preview'],
      'gemini-default': ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-1.5-flash'],
      'deepseek-default': ['deepseek-chat', 'deepseek-reasoner']
    };
    const list = modelOptions[providerId] || ['custom-model'];
    menu.innerHTML = list.map(m => `<div data-val="${m}">${m}</div>`).join('');
  }

  static showProviderForm() {
    const form = document.getElementById('lumina-provider-form');
    form.classList.remove('hidden');
    document.getElementById('lumina-provider-form-id').value = '';
    document.getElementById('lumina-provider-form-name').value = '';
    document.getElementById('lumina-provider-form-endpoint').value = '';
    document.getElementById('lumina-provider-form-apikey').value = '';
  }

  static editProvider(id) {
    const p = this.providers.find(p => p.id === id);
    if (!p) return;

    const form = document.getElementById('lumina-provider-form');
    form.classList.remove('hidden');
    document.getElementById('lumina-provider-form-id').value = p.id;
    document.getElementById('lumina-provider-form-name').value = p.name;
    document.getElementById('lumina-provider-form-endpoint').value = p.endpoint;
    document.getElementById('lumina-provider-form-apikey').value = p.apiKey || '';
  }

  static hideProviderForm() {
    document.getElementById('lumina-provider-form').classList.add('hidden');
  }

  static saveProvider() {
    const id = document.getElementById('lumina-provider-form-id').value || 'custom-' + Date.now();
    const name = document.getElementById('lumina-provider-form-name').value.trim();
    const endpoint = document.getElementById('lumina-provider-form-endpoint').value.trim();
    const apiKey = document.getElementById('lumina-provider-form-apikey').value.trim();

    if (!name || !endpoint) {
      alert('Name and Endpoint are required.');
      return;
    }

    const idx = this.providers.findIndex(p => p.id === id);
    const pData = { id, name, type: 'openai', endpoint, apiKey };

    if (idx >= 0) {
      this.providers[idx] = pData;
    } else {
      this.providers.push(pData);
    }

    chrome.storage.local.set({ providers: this.providers }, () => {
      this.renderProviders();
      this.populateProviderDropdowns();
      this.hideProviderForm();
    });
  }

  static checkApiKeys() {
    const results = document.getElementById('lumina-apikey-results');
    const list = document.getElementById('lumina-apikey-results-list');
    results.classList.remove('hidden');
    list.innerHTML = '<div style="padding:10px;">Checking keys...</div>';

    setTimeout(() => {
      list.innerHTML = this.providers.map(p => {
        const hasKey = p.apiKey && p.apiKey.trim().length > 0;
        return `
          <div class="lumina-settings-api-result-item">
            <span class="api-key-result-name font-semibold">${p.name}</span>
            <span class="api-key-result-status badge ${hasKey ? 'success' : 'error'}">${hasKey ? 'VALID key set' : 'NO API key'}</span>
          </div>
        `;
      }).join('');
    }, 1000);
  }

  static addModelToChain() {
    const provider = document.getElementById('lumina-text-chain-provider').dataset.value;
    const model = document.getElementById('lumina-text-chain-model').value.trim();

    if (!provider || !model) return;

    this.textChain.push({ providerId: provider, modelName: model });
    chrome.storage.local.set({ modelChains: { text: this.textChain } }, () => {
      this.renderChainList();
      document.getElementById('lumina-text-chain-model').value = '';
    });
  }

  static renderChainList() {
    const list = document.getElementById('lumina-text-chain-list');
    if (!list) return;
    list.innerHTML = '';

    if (this.textChain.length === 0) {
      list.innerHTML = '<div class="lumina-settings-empty-state">No models added yet. Select a provider and model above.</div>';
      return;
    }

    const temp = document.getElementById('lumina-chainItemTemplate');
    this.textChain.forEach((item, index) => {
      const clone = temp.content.cloneNode(true);
      clone.querySelector('.chain-number').textContent = index + 1;
      clone.querySelector('.chain-model-name').textContent = item.modelName;
      clone.querySelector('.chain-provider-name').textContent = item.providerId;

      clone.querySelector('.remove').addEventListener('click', () => {
        this.textChain.splice(index, 1);
        chrome.storage.local.set({ modelChains: { text: this.textChain } }, () => this.renderChainList());
      });

      const paramsContainer = clone.querySelector('.chain-item-params-container');
      clone.querySelector('.configure').addEventListener('click', () => {
        const isShown = paramsContainer.innerHTML.trim().length > 0;
        if (isShown) {
          paramsContainer.innerHTML = '';
        } else {
          this.renderParamsEditor(paramsContainer, item.modelName);
        }
      });

      list.appendChild(clone);
    });
  }

  static renderParamsEditor(container, modelName) {
    const temp = document.getElementById('lumina-chainParamsTemplate');
    const clone = temp.content.cloneNode(true);
    const params = this.advancedParamsByModel[modelName] || { temperature: 0.7, topP: 0.9, thinkingLevel: 'none' };

    const tempSlider = clone.querySelector('.param-temperature');
    const tempValue = clone.querySelector('.temp-value');
    tempSlider.value = params.temperature;
    tempValue.textContent = params.temperature;
    tempSlider.addEventListener('input', () => {
      tempValue.textContent = tempSlider.value;
      this.saveParams(modelName, 'temperature', parseFloat(tempSlider.value));
    });

    const topPSlider = clone.querySelector('.param-topp');
    const topPValue = clone.querySelector('.topp-value');
    topPSlider.value = params.topP;
    topPValue.textContent = params.topP;
    topPSlider.addEventListener('input', () => {
      topPValue.textContent = topPSlider.value;
      this.saveParams(modelName, 'topP', parseFloat(topPSlider.value));
    });

    const levelSelect = clone.querySelector('.param-thinking-level');
    levelSelect.value = params.thinkingLevel || 'none';
    levelSelect.addEventListener('change', () => {
      this.saveParams(modelName, 'thinkingLevel', levelSelect.value);
    });

    container.appendChild(clone);
  }

  static saveParams(modelName, key, val) {
    if (!this.advancedParamsByModel[modelName]) {
      this.advancedParamsByModel[modelName] = { temperature: 0.7, topP: 0.9, thinkingLevel: 'none' };
    }
    this.advancedParamsByModel[modelName][key] = val;
    chrome.storage.local.set({ advancedParamsByModel: this.advancedParamsByModel });
  }

  static bindAppearanceTab() {
    const elements = [
      'lumina-settings-theme', 'lumina-settings-contrast', 'lumina-settings-accent',
      'lumina-settings-language', 'lumina-settings-spoken-lang', 'lumina-settings-voice-select'
    ];
    elements.forEach(id => {
      document.getElementById(id).addEventListener('change', () => this.saveOptions());
    });

    document.getElementById('lumina-settings-dictation-toggle').addEventListener('change', () => this.saveOptions());
    document.getElementById('lumina-settings-separate-voice').addEventListener('change', () => this.saveOptions());

    document.getElementById('lumina-settings-voice-play-btn').addEventListener('click', () => {
      const voice = document.getElementById('lumina-settings-voice-select').value;
      const audio = new Audio();
      audio.src = `../../assets/audio/voice_${voice}.mp3`;
      audio.play().catch(() => {
        alert(`Playing voice test for ${voice}`);
      });
    });
  }

  static bindPersonalizationTab() {
    document.getElementById('lumina-settings-base-tone').addEventListener('change', () => this.saveOptions());

    const ranges = [
      'lumina-settings-char-warm', 'lumina-settings-char-enthusiastic',
      'lumina-settings-char-headers', 'lumina-settings-char-emoji'
    ];
    ranges.forEach(id => {
      document.getElementById(id).addEventListener('change', () => this.saveOptions());
    });

    const inputs = ['lumina-settings-about-nickname', 'lumina-settings-about-occupation', 'lumina-settings-about-interests'];
    inputs.forEach(id => {
      document.getElementById(id).addEventListener('blur', () => this.saveOptions());
    });

    const addFactInput = document.getElementById('lumina-new-fact-input');
    addFactInput.addEventListener('keypress', async (e) => {
      if (e.key === 'Enter') {
        const val = addFactInput.value.trim();
        if (val) {
          const updatedFacts = await UserMemory.addFact(val);
          this.userFacts = updatedFacts;
          this.renderUserFacts();
          addFactInput.value = '';
        }
      }
    });
  }

  static renderUserFacts() {
    const list = document.getElementById('lumina-user-facts-list');
    if (!list) return;
    list.innerHTML = '';

    if (this.userFacts.length === 0) {
      list.innerHTML = '<div class="lumina-settings-empty-state">No instructions added yet. Add one above.</div>';
      return;
    }

    const temp = document.getElementById('lumina-userFactItemTemplate');
    this.userFacts.forEach((fact, idx) => {
      const clone = temp.content.cloneNode(true);
      clone.querySelector('.fact-index').textContent = idx + 1;
      clone.querySelector('.fact-text').value = fact;
      clone.querySelector('.fact-text').addEventListener('blur', async (e) => {
        const newVal = e.target.value.trim();
        if (newVal === '') {
          const updatedFacts = await UserMemory.removeFact(idx);
          this.userFacts = updatedFacts;
          this.renderUserFacts();
        } else if (newVal !== this.userFacts[idx]) {
          const updatedFacts = await UserMemory.updateFact(idx, newVal);
          this.userFacts = updatedFacts;
          this.renderUserFacts();
        }
      });
      clone.querySelector('.fact-remove-btn').addEventListener('click', async () => {
        const updatedFacts = await UserMemory.removeFact(idx);
        this.userFacts = updatedFacts;
        this.renderUserFacts();
      });
      list.appendChild(clone);
    });
  }

  static bindKeyboardTab() {
    const configBtn = document.getElementById('lumina-config-shortcut-btn');
    if (configBtn) {
      configBtn.addEventListener('click', () => {
        chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
      });
    }

    document.getElementById('lumina-add-mapping-btn').addEventListener('click', () => {
      this.questionMappings.push({ key: '', prompt: '', highlight: true });
      this.renderQuestionMappings();
    });

    document.getElementById('lumina-add-annotation-shortcut-btn').addEventListener('click', () => {
      this.annotationShortcuts.push({ key: '', color: '#ffeb3b', enabled: true });
      this.renderAnnotationShortcuts();
    });

    this.bindShortcutRecorders();
  }

  static bindShortcutRecorders() {
    document.addEventListener('click', (e) => {
      const box = e.target.closest('.lumina-settings-shortcut-box');
      if (box) {
        this.recordShortcut(box);
      }
    });
  }

  static recordShortcut(box) {
    box.classList.add('recording');
    box.innerHTML = '<span class="recording">Press key combination...</span>';
    
    const keydownHandler = (e) => {
      e.preventDefault();
      e.stopPropagation();

      const keys = [];
      if (e.ctrlKey) keys.push('Ctrl');
      if (e.metaKey) keys.push('Cmd');
      if (e.shiftKey) keys.push('Shift');
      if (e.altKey) keys.push('Alt');

      const nonModifiers = ['Control', 'Meta', 'Shift', 'Alt', 'CapsLock'];
      if (!nonModifiers.includes(e.key)) {
        keys.push(e.key.toUpperCase());
        const shortcut = keys.join('+');
        
        box.classList.remove('recording');
        box.textContent = shortcut;
        
        this.saveCapturedShortcut(box.dataset.action, shortcut);
        
        document.removeEventListener('keydown', keydownHandler, true);
      }
    };

    document.addEventListener('keydown', keydownHandler, true);
  }

  static saveCapturedShortcut(action, shortcut) {
    chrome.storage.local.get(['shortcuts'], (items) => {
      const list = items.shortcuts || {};
      list[action] = shortcut;
      chrome.storage.local.set({ shortcuts: list });
    });
  }

  static loadShortcutsKeys(items) {
    const list = items.shortcuts || {};
    document.querySelectorAll('.lumina-settings-shortcut-box[data-action]').forEach(box => {
      const action = box.dataset.action;
      box.textContent = list[action] || 'None';
    });
  }

  static renderQuestionMappings() {
    const list = document.getElementById('lumina-question-mappings-list');
    if (!list) return;
    list.innerHTML = '';

    const temp = document.getElementById('lumina-mappingRowTemplate');
    this.questionMappings.forEach((mapping, idx) => {
      const clone = temp.content.cloneNode(true);
      clone.querySelector('.mapping-number').textContent = idx + 1;
      
      const keyBox = clone.querySelector('.mapping-key-input');
      keyBox.textContent = mapping.key || 'None';
      keyBox.addEventListener('click', () => {
        this.recordShortcutForMapping(keyBox, idx, 'questionMappings');
      });

      const pBox = clone.querySelector('.mapping-prompt');
      pBox.textContent = mapping.prompt;
      pBox.addEventListener('blur', () => {
        this.questionMappings[idx].prompt = pBox.textContent.trim();
        chrome.storage.local.set({ questionMappings: this.questionMappings });
      });

      const hToggle = clone.querySelector('.mapping-highlight-toggle');
      hToggle.checked = mapping.highlight !== false;
      hToggle.addEventListener('change', () => {
        this.questionMappings[idx].highlight = hToggle.checked;
        chrome.storage.local.set({ questionMappings: this.questionMappings });
      });

      clone.querySelector('.mapping-delete-btn').addEventListener('click', () => {
        this.questionMappings.splice(idx, 1);
        chrome.storage.local.set({ questionMappings: this.questionMappings }, () => this.renderQuestionMappings());
      });

      list.appendChild(clone);
    });
  }

  static recordShortcutForMapping(box, idx, storageKey) {
    box.classList.add('recording');
    box.innerHTML = '<span class="recording">Press key...</span>';

    const keydownHandler = (e) => {
      e.preventDefault();
      e.stopPropagation();

      const key = e.key.toUpperCase();
      box.classList.remove('recording');
      box.textContent = key;

      if (storageKey === 'questionMappings') {
        this.questionMappings[idx].key = key;
        chrome.storage.local.set({ questionMappings: this.questionMappings });
      } else {
        this.annotationShortcuts[idx].key = key;
        chrome.storage.local.set({ annotationShortcuts: this.annotationShortcuts });
      }
      
      document.removeEventListener('keydown', keydownHandler, true);
    };
    document.addEventListener('keydown', keydownHandler, true);
  }

  static renderAnnotationShortcuts() {
    const list = document.getElementById('lumina-annotation-shortcuts-list');
    if (!list) return;
    list.innerHTML = '';

    const temp = document.getElementById('lumina-annotationShortcutTemplate');
    const colors = ['#ffebee', '#fff3e0', '#fffde7', '#e8f5e9', '#e3f2fd', '#f3e5f5'];

    this.annotationShortcuts.forEach((shortcut, idx) => {
      const clone = temp.content.cloneNode(true);
      const palette = clone.querySelector('.annotation-color-palette');
      
      palette.innerHTML = colors.map(c => `
        <div class="swatch ${shortcut.color === c ? 'active' : ''}" style="background: ${c}; width: 18px; height: 18px; border-radius: 50%; cursor: pointer;" data-color="${c}"></div>
      `).join('');

      palette.addEventListener('click', (e) => {
        const swatch = e.target.closest('.swatch');
        if (swatch) {
          this.annotationShortcuts[idx].color = swatch.dataset.color;
          chrome.storage.local.set({ annotationShortcuts: this.annotationShortcuts });
          this.renderAnnotationShortcuts();
        }
      });

      const keyBox = clone.querySelector('.annotation-shortcut-input');
      keyBox.textContent = shortcut.key || 'None';
      keyBox.addEventListener('click', () => {
        this.recordShortcutForMapping(keyBox, idx, 'annotationShortcuts');
      });

      const toggle = clone.querySelector('.annotation-shortcut-toggle');
      toggle.checked = shortcut.enabled !== false;
      toggle.addEventListener('change', () => {
        this.annotationShortcuts[idx].enabled = toggle.checked;
        chrome.storage.local.set({ annotationShortcuts: this.annotationShortcuts });
      });

      clone.querySelector('.annotation-remove-btn').addEventListener('click', () => {
        this.annotationShortcuts.splice(idx, 1);
        chrome.storage.local.set({ annotationShortcuts: this.annotationShortcuts }, () => this.renderAnnotationShortcuts());
      });

      list.appendChild(clone);
    });
  }

  static bindAccountTab() {
    document.getElementById('lumina-export-settings-btn').addEventListener('click', () => {
      chrome.storage.local.get(null, (data) => {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `lumina_backup_${Date.now()}.json`;
        a.click();
      });
    });

    const fileInput = document.getElementById('lumina-import-settings-file');
    document.getElementById('lumina-import-settings-btn').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const data = JSON.parse(evt.target.result);
          chrome.storage.local.clear(() => {
            chrome.storage.local.set(data, () => {
              alert('Settings successfully imported!');
              this.loadSettings();
            });
          });
        } catch (err) {
          alert('Invalid JSON backup file.');
        }
      };
      reader.readAsText(file);
    });

    document.getElementById('lumina-delete-all-btn').addEventListener('click', () => {
      if (confirm('Are you absolutely sure you want to delete all chat history? This cannot be undone.')) {
        if (typeof ChatHistoryManager !== 'undefined' && ChatHistoryManager.deleteAllChats) {
          ChatHistoryManager.deleteAllChats(() => {
            alert('All chat history deleted.');
            this.updateStorageUsage();
          });
        }
      }
    });

    this.setupDropdownInputs('lumina-history-retention-input', 'lumina-history-retention-menu');
  }

  static updateStorageUsage() {
    const textEl = document.getElementById('lumina-storage-usage-text');
    if (!textEl) return;

    if (navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate().then(estimate => {
        const usageMb = (estimate.usage / (1024 * 1024)).toFixed(2);
        textEl.textContent = `${usageMb} MB`;
      });
    }
  }

  static updateOPFSAttachmentsList() {
    const listEl = document.getElementById('lumina-stored-files-list');
    if (!listEl) return;
    listEl.innerHTML = '<p class="desc-small italic">Checking attachments...</p>';

    setTimeout(() => {
      listEl.innerHTML = '<p class="desc-small italic">No attachments stored locally.</p>';
    }, 500);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  LuminaSettingsModal.init();
});
