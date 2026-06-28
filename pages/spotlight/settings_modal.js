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

    // Enable auto-expanding height on all textareas in the settings overlay
    this.overlay.querySelectorAll('textarea').forEach(textarea => {
      this.enableAutoExpandTextarea(textarea);
    });

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
      'historyRetentionMonths', 'shortcuts'
    ];
    chrome.storage.local.get(keys, (items) => {
      this.providers = (items.providers || this.getDefaultProviders()).filter(p => p.id !== 'grok-default' && p.id !== 'grok');
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

      const toneInput = document.getElementById('lumina-settings-base-tone-input');
      if (toneInput) {
        const toneVal = items.baseTone || 'default';
        toneInput.dataset.value = toneVal;
        const toneMenu = document.getElementById('lumina-settings-base-tone-menu');
        const matchedDiv = toneMenu?.querySelector(`div[data-val="${toneVal}"]`);
        toneInput.value = matchedDiv ? matchedDiv.textContent : 'Default';
        this.adjustInputWidthToContent(toneInput);
      }
      document.getElementById('lumina-settings-char-warm').value = items.charWarm || 3;
      document.getElementById('lumina-settings-char-enthusiastic').value = items.charEnthusiastic || 3;
      document.getElementById('lumina-settings-char-headers').value = items.charHeaders || 3;
      document.getElementById('lumina-settings-char-emoji').value = items.charEmoji || 3;

      document.getElementById('lumina-settings-about-nickname').value = items.aboutNickname || '';
      document.getElementById('lumina-settings-about-occupation').value = items.aboutOccupation || '';
      const interestsTextarea = document.getElementById('lumina-settings-about-interests');
      if (interestsTextarea) {
        interestsTextarea.value = items.aboutInterests || '';
        interestsTextarea.dispatchEvent(new Event('input'));
      }

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
        { label: '1 Week', value: '0.25' },
        { label: '2 Weeks', value: '0.5' },
        { label: '1 Month', value: '1' },
        { label: '2 Months', value: '2' },
        { label: '3 Months', value: '3' },
        { label: '6 Months', value: '6' },
        { label: '1 Year', value: '12' },
        { label: 'Keep forever', value: '0' }
      ].find(o => Math.abs(parseFloat(o.value) - parseFloat(savedRet)) < 0.01);
      if (retentionInput && matchingOpt) {
        retentionInput.value = matchingOpt.label;
        retentionInput.dataset.value = matchingOpt.value;
      }

      this.updateStorageUsage();
    });
  }

  static saveOptions() {
    const getVal = (id, fallback = '') => document.getElementById(id)?.value || fallback;
    const getChecked = (id) => document.getElementById(id)?.checked || false;
    const getInt = (id, fallback = 3) => {
      const el = document.getElementById(id);
      return el ? parseInt(el.value, 10) : fallback;
    };

    const settings = {
      theme: getVal('lumina-settings-theme', 'auto'),
      contrast: getVal('lumina-settings-contrast', 'auto'),
      accentColor: getVal('lumina-settings-accent', 'default'),
      language: getVal('lumina-settings-language', 'auto'),
      dictationEnabled: document.getElementById('lumina-settings-dictation-toggle') ? getChecked('lumina-settings-dictation-toggle') : true,
      spokenLanguage: getVal('lumina-settings-spoken-lang', 'auto'),
      voice: getVal('lumina-settings-voice-select', 'sol'),
      separateVoiceEnabled: getChecked('lumina-settings-separate-voice'),
      baseTone: document.getElementById('lumina-settings-base-tone-input')?.dataset.value || 'default',
      charWarm: getInt('lumina-settings-char-warm', 3),
      charEnthusiastic: getInt('lumina-settings-char-enthusiastic', 3),
      charHeaders: getInt('lumina-settings-char-headers', 3),
      charEmoji: getInt('lumina-settings-char-emoji', 3),
      aboutNickname: getVal('lumina-settings-about-nickname').trim(),
      aboutOccupation: getVal('lumina-settings-about-occupation').trim(),
      aboutInterests: getVal('lumina-settings-about-interests').trim(),
      dictLanguage: document.querySelector('input[name="lumina-dictLanguage"]:checked')?.value || 'en',
      translateInputEngine: document.querySelector('input[name="lumina-translateInputEngine"]:checked')?.value || 'google',
      translateEngine: document.querySelector('input[name="lumina-translateEngine"]:checked')?.value || 'google',
      dictProvider: getVal('lumina-dict-provider'),
      dictModel: getVal('lumina-dict-model'),
      historyRetentionMonths: parseFloat(document.getElementById('lumina-history-retention-input')?.dataset.value || '3')
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
    const cancelBtn = document.getElementById('lumina-cancel-provider-btn');
    const saveBtn = document.getElementById('lumina-save-provider-btn');
    const checkKeysBtn = document.getElementById('lumina-check-apikeys-btn');
    const resetBtn = document.getElementById('lumina-reset-provider-btn');
    const closePopupBtn = document.getElementById('lumina-provider-popup-close-btn');
    const popupOverlay = document.getElementById('lumina-provider-popup-overlay');

    if (cancelBtn) cancelBtn.addEventListener('click', () => this.hideProviderForm());
    if (saveBtn) saveBtn.addEventListener('click', () => this.saveProvider());
    if (resetBtn) resetBtn.addEventListener('click', () => this.resetProvider());
    if (closePopupBtn) closePopupBtn.addEventListener('click', () => this.hideProviderForm());
    if (popupOverlay) {
      popupOverlay.addEventListener('click', (e) => {
        if (e.target === popupOverlay) this.hideProviderForm();
      });
    }
    if (checkKeysBtn) checkKeysBtn.addEventListener('click', () => this.checkApiKeys());

    // Model Popup bindings
    const cancelModelBtn = document.getElementById('lumina-cancel-model-btn');
    const saveModelBtn = document.getElementById('lumina-save-model-btn');
    const closeModelPopupBtn = document.getElementById('lumina-model-popup-close-btn');
    const modelPopupOverlay = document.getElementById('lumina-model-popup-overlay');

    if (cancelModelBtn) cancelModelBtn.addEventListener('click', () => this.hideModelForm());
    if (saveModelBtn) saveModelBtn.addEventListener('click', () => this.addModelToChain());
    if (closeModelPopupBtn) closeModelPopupBtn.addEventListener('click', () => this.hideModelForm());
    if (modelPopupOverlay) {
      modelPopupOverlay.addEventListener('click', (e) => {
        if (e.target === modelPopupOverlay) this.hideModelForm();
      });
    }

    document.querySelectorAll('input[name="lumina-dictLanguage"]').forEach(r => r.addEventListener('change', () => this.saveOptions()));
    document.querySelectorAll('input[name="lumina-translateInputEngine"]').forEach(r => r.addEventListener('change', () => this.saveOptions()));
    document.querySelectorAll('input[name="lumina-translateEngine"]').forEach(r => r.addEventListener('change', () => this.saveOptions()));

    this.setupDropdownInputs('lumina-dict-provider', 'lumina-dict-provider-list');
    this.setupDropdownInputs('lumina-dict-model', 'lumina-dict-model-list');
    this.setupDropdownInputs('lumina-text-chain-provider', 'lumina-text-chain-provider-list');
    this.setupDropdownInputs('lumina-text-chain-model', 'lumina-text-chain-model-list');
  }

  static getDefaultProviders() {
    return [
      { id: 'openai-default', name: 'OpenAI', type: 'openai', endpoint: 'https://api.openai.com/v1/chat/completions', apiKey: '' },
      { id: 'gemini-default', name: 'Gemini', type: 'gemini', endpoint: 'https://generativelanguage.googleapis.com/v1beta/models', apiKey: '' },
      { id: 'deepseek-default', name: 'DeepSeek', type: 'openai', endpoint: 'https://api.deepseek.com/v1', apiKey: '' }
    ];
  }

  static getProviderLogoSvg(id) {
    const norm = (id || '').toLowerCase();
    if (norm.includes('openai')) {
      return `<svg fill="currentColor" fill-rule="evenodd" height="24" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg"><title>OpenAI</title><path d="M9.205 8.658v-2.26c0-.19.072-.333.238-.428l4.543-2.616c.619-.357 1.356-.523 2.117-.523 2.854 0 4.662 2.212 4.662 4.566 0 .167 0 .357-.024.547l-4.71-2.759a.797.797 0 00-.856 0l-5.97 3.473zm10.609 8.8V12.06c0-.333-.143-.57-.429-.737l-5.97-3.473 1.95-1.118a.433.433 0 01.476 0l4.543 2.617c1.309.76 2.189 2.378 2.189 3.948 0 1.808-1.07 3.473-2.76 4.163zM7.802 12.703l-1.95-1.142c-.167-.095-.239-.238-.239-.428V5.899c0-2.545 1.95-4.472 4.591-4.472 1 0 1.927.333 2.712.928L8.23 5.067c-.285.166-.428.404-.428.737v6.898zM12 15.128l-2.795-1.57v-3.33L12 8.658l2.795 1.57v3.33L12 15.128zm1.796 7.23c-1 0-1.927-.332-2.712-.927l4.686-2.712c.285-.166.428-.404.428-.737v-6.898l1.974 1.142c.167.095.238.238.238.428v5.233c0 2.545-1.974 4.472-4.614 4.472zm-5.637-5.303l-4.544-2.617c-1.308-.761-2.188-2.378-2.188-3.948A4.482 4.482 0 014.21 6.327v5.423c0 .333.143.571.428.738l5.947 3.449-1.95 1.118a.432.432 0 01-.476 0zm-.262 3.9c-2.688 0-4.662-2.021-4.662-4.519 0-.19.024-.38.047-.57l4.686 2.71c.286.167.571.167.856 0l5.97-3.448v2.26c0 .19-.07.333-.237.428l-4.543 2.616c-.619.357-1.356.523-2.117.523zm5.899 2.83a5.947 5.947 0 005.827-4.756C22.287 18.339 24 15.84 24 13.296c0-1.665-.713-3.282-1.998-4.448.119-.5.19-.999.19-1.498 0-3.401-2.759-5.947-5.946-5.947-.642 0-1.26.095-1.88.31A5.962 5.962 0 0010.205 0a5.947 5.947 0 00-5.827 4.757C1.713 5.447 0 7.945 0 10.49c0 1.666.713 3.283 1.998 4.448-.119.5-.19 1-.19 1.499 0 3.401 2.759 5.946 5.946 5.946.642 0 1.26-.095 1.88-.309a5.96 5.96 0 004.162 1.713z"></path></svg>`;
    }
    if (norm.includes('anthropic') || norm.includes('claude')) {
      return `<svg height="24" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg"><title>Claude</title><path d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z" fill="#D97757" fill-rule="nonzero"></path></svg>`;
    }
    if (norm.includes('gemini')) {
      return `<svg height="24" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg"><title>Gemini</title><path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" fill="#3186FF"></path><path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" fill="url(#lobe-icons-gemini-0-_R_0_)"></path><path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" fill="url(#lobe-icons-gemini-1-_R_0_)"></path><path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" fill="url(#lobe-icons-gemini-2-_R_0_)"></path><defs><linearGradient gradientUnits="userSpaceOnUse" id="lobe-icons-gemini-0-_R_0_" x1="7" x2="11" y1="15.5" y2="12"><stop stop-color="#08B962"></stop><stop offset="1" stop-color="#08B962" stop-opacity="0"></stop></linearGradient><linearGradient gradientUnits="userSpaceOnUse" id="lobe-icons-gemini-1-_R_0_" x1="8" x2="11.5" y1="5.5" y2="11"><stop stop-color="#F94543"></stop><stop offset="1" stop-color="#F94543" stop-opacity="0"></stop></linearGradient><linearGradient gradientUnits="userSpaceOnUse" id="lobe-icons-gemini-2-_R_0_" x1="3.5" x2="17.5" y1="13.5" y2="12"><stop stop-color="#FABC12"></stop><stop offset=".46" stop-color="#FABC12" stop-opacity="0"></stop></linearGradient></defs></svg>`;
    }
    if (norm.includes('deepseek')) {
      return `<svg height="24" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg"><title>DeepSeek</title><path d="M23.748 4.482c-.254-.124-.364.113-.512.234-.051.039-.094.09-.137.136-.372.397-.806.657-1.373.626-.829-.046-1.537.214-2.163.848-.133-.782-.575-1.248-1.247-1.548-.352-.156-.708-.311-.955-.65-.172-.241-.219-.51-.305-.774-.055-.16-.11-.323-.293-.35-.2-.031-.278.136-.356.276-.313.572-.434 1.202-.422 1.84.027 1.436.633 2.58 1.838 3.393.137.093.172.187.129.323-.082.28-.18.552-.266.833-.055.179-.137.217-.329.14a5.526 5.526 0 01-1.736-1.18c-.857-.828-1.631-1.742-2.597-2.458a11.365 11.365 0 00-.689-.471c-.985-.957.13-1.743.388-1.836.27-.098.093-.432-.779-.428-.872.004-1.67.295-2.687.684a3.055 3.055 0 01-.465.137 9.597 9.597 0 00-2.883-.102c-1.885.21-3.39 1.102-4.497 2.623C.082 8.606-.231 10.684.152 12.85c.403 2.284 1.569 4.175 3.36 5.653 1.858 1.533 3.997 2.284 6.438 2.14 1.482-.085 3.133-.284 4.994-1.86.47.234.962.327 1.78.397.63.059 1.236-.03 1.705-.128.735-.156.684-.837.419-.961-2.155-1.004-1.682-.595-2.113-.926 1.096-1.296 2.746-2.642 3.392-7.003.05-.347.007-.565 0-.845-.004-.17.035-.237.23-.256a4.173 4.173 0 001.545-.475c1.396-.763 1.96-2.015 2.093-3.517.02-.23-.004-.467-.247-.588zM11.581 18c-2.089-1.642-3.102-2.183-3.52-2.16-.392.024-.321.471-.235.763.09.288.207.486.371.739.114.167.192.416-.113.603-.673.416-1.842-.14-1.897-.167-1.361-.802-2.5-1.86-3.301-3.307-.774-1.393-1.224-2.887-1.298-4.482-.02-.386.093-.522.477-.592a4.696 4.696 0 011.529-.039c2.132.312 3.946 1.265 5.468 2.774.868.86 1.525 1.887 2.202 2.891.72 1.066 1.494 2.082 2.48 2.914.348.292.625.514.891.677-.802.09-2.14.11-3.054-.614zm1-6.44a.306.306 0 01.415-.287.302.302 0 01.2.288.306.306 0 01-.31.307.303.303 0 01-.304-.308zm3.11 1.596c-.2.081-.399.151-.59.16a1.245 1.245 0 01-.798-.254c-.274-.23-.47-.358-.552-.758a1.73 1.73 0 01.016-.588c.07-.327-.008-.537-.239-.727-.187-.156-.426-.199-.688-.199a.559.559 0 01-.254-.078c-.11-.054-.2-.19-.114-.358.028-.054.16-.186.192-.21.356-.202.767-.136 1.146.016.352.144.618.408 1.001.782.391.451.462.576.685.914.176.265.336.537.445.848.067.195-.019.354-.25.452z" fill="#4D6BFE"></path></svg>`;
    }
    if (norm.includes('groq')) {
      return `<svg fill="#f55036" fill-rule="evenodd" height="24" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg"><title>Groq</title><path d="M12.036 2c-3.853-.035-7 3-7.036 6.781-.035 3.782 3.055 6.872 6.908 6.907h2.42v-2.566h-2.292c-2.407.028-4.38-1.866-4.408-4.23-.029-2.362 1.901-4.298 4.308-4.326h.1c2.407 0 4.358 1.915 4.365 4.278v6.305c0 2.342-1.944 4.25-4.323 4.279a4.375 4.375 0 01-3.033-1.252l-1.851 1.818A7 7 0 0012.029 22h.092c3.803-.056 6.858-3.083 6.879-6.816v-6.5C18.907 4.963 15.817 2 12.036 2z"></path></svg>`;
    }
    if (norm.includes('openrouter')) {
      return `<svg fill="#4f46e5" fill-rule="evenodd" height="24" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg"><title>OpenRouter</title><path d="M16.804 1.957l7.22 4.105v.087L16.73 10.21l.017-2.117-.821-.03c-1.059-.028-1.611.002-2.268.11-1.064.175-2.038.577-3.147 1.352L8.345 11.03c-.284.195-.495.336-.68.455l-.515.322-.397.234.385.23.53.338c.476.314 1.17.796 2.701 1.866 1.11.775 2.083 1.177 3.147 1.352l.3.045c.694.091 1.375.094 2.825.033l.022-2.159 7.22 4.105v.087L16.589 22l.014-1.862-.635.022c-1.386.042-2.137.002-3.138-.162-1.694-.28-3.26-.926-4.881-2.059l-2.158-1.5a21.997 21.997 0 00-.755-.498l-.467-.28a55.927 55.927 0 00-.76-.43C2.908 14.73.563 14.116 0 14.116V9.888l.14.004c.564-.007 2.91-.622 3.809-1.124l1.016-.58.438-.274c.428-.28 1.072-.726 2.686-1.853 1.621-1.133 3.186-1.78 4.881-2.059 1.152-.19 1.974-.213 3.814-.138l.02-1.907z"></path></svg>`;
    }
    if (norm.includes('cerebras')) {
      return `<svg fill="currentColor" height="24" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg"><title>Cerebras</title><path clip-rule="evenodd" d="M14.121 2.701a9.299 9.299 0 000 18.598V22.7c-5.91 0-10.7-4.791-10.7-10.701S8.21 1.299 14.12 1.299V2.7zm4.752 3.677A7.353 7.353 0 109.42 17.643l-.901 1.074a8.754 8.754 0 01-1.08-12.334 8.755 8.755 0 0112.335-1.08l-.901 1.075zm-2.255.844a5.407 5.407 0 00-5.048 9.563l-.656 1.24a6.81 6.81 0 016.358-12.043l-.654 1.24zM14.12 8.539a3.46 3.46 0 100 6.922v1.402a4.863 4.863 0 010-9.726v1.402z" fill="#F15A29" fill-rule="evenodd"></path><path d="M15.407 10.836a2.24 2.24 0 00-.51-.409 1.084 1.084 0 00-.544-.152c-.255 0-.483.047-.684.14a1.58 1.58 0 00-.84.912c-.074.203-.11.416-.11.631 0 .218.036.43.11.631a1.594 1.594 0 00.84.913c.2.093.43.14.684.14.216 0 .417-.046.602-.135.188-.09.35-.225.475-.392l.928 1.006c-.14.14-.3.261-.482.363a3.367 3.367 0 01-1.083.38c-.17.026-.317.04-.44.04a3.315 3.315 0 01-1.182-.21 2.825 2.825 0 01-.961-.597 2.816 2.816 0 01-.644-.929 2.987 2.987 0 01-.238-1.21c0-.444.08-.847.238-1.21.15-.35.368-.666.643-.929.278-.261.605-.464.962-.596a3.315 3.315 0 011.182-.21c.355 0 .712.068 1.072.204.361.138.685.36.944.649l-.962.97z"></path></svg>`;
    }
    if (norm.includes('mistral')) {
      return `<svg height="24" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg"><title>Mistral</title><path d="M3.428 3.4h3.429v3.428H3.428V3.4zm13.714 0h3.43v3.428h-3.43V3.4z" fill="gold"></path><path d="M3.428 6.828h6.857v3.429H3.429V6.828zm10.286 0h6.857v3.429h-6.857V6.828z" fill="#FFAF00"></path><path d="M3.428 10.258h17.144v3.428H3.428v-3.428z" fill="#FF8205"></path><path d="M3.428 13.686h3.429v3.428H3.428v-3.428zm6.858 0h3.429v3.428h-3.429v-3.428zm6.856 0h3.43v3.428h-3.43v-3.428z" fill="#FA500F"></path><path d="M0 17.114h10.286v3.429H0v-3.429zm13.714 0H24v3.429H13.714v-3.429z" fill="#E10500"></path></svg>`;
    }
    if (norm.includes('together')) {
      return `<svg height="24" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg"><title>together.ai</title><path d="M23.197 4.503A6 6 0 0015 2.307a5.973 5.973 0 00-2.995 4.933l5.996.008v.515h-5.996c.039.937.298 1.87.8 2.74a6 6 0 1010.39-6z" fill="#EF2CC1"></path><path d="M.805 4.5A6 6 0 003 12.697a5.972 5.972 0 005.77.127L5.779 7.627l.446-.257 2.997 5.192A6 6 0 10.804 4.5z" fill="#CAAEF5"></path><path d="M12 23.894a6 6 0 005.999-6c0-2.13-1.1-3.996-2.775-5.06l-3.005 5.189-.444-.258 2.997-5.192A6 6 0 1012 23.894z" fill="#FC4C02"></path></svg>`;
    }
    if (norm.includes('cohere')) {
      return `<svg height="24" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg"><title>Cohere</title><path clip-rule="evenodd" d="M8.128 14.099c.592 0 1.77-.033 3.398-.703 1.897-.781 5.672-2.2 8.395-3.656 1.905-1.018 2.74-2.366 2.74-4.18A4.56 4.56 0 0018.1 1H7.549A6.55 6.55 0 001 7.55c0 3.617 2.745 6.549 7.128 6.549z" fill="#39594D" fill-rule="evenodd"></path><path clip-rule="evenodd" d="M9.912 18.61a4.387 4.387 0 012.705-4.052l3.323-1.38c3.361-1.394 7.06 1.076 7.06 4.715a5.104 5.104 0 01-5.105 5.104l-3.597-.001a4.386 4.386 0 01-4.386-4.387z" fill="#D18EE2" fill-rule="evenodd"></path><path d="M4.776 14.962A3.775 3.775 0 001 18.738v.489a3.776 3.776 0 007.551 0v-.49a3.775 3.775 0 00-3.775-3.775z" fill="#FF7759"></path></svg>`;
    }
    if (norm.includes('grok')) {
      return `<svg fill="#15181a" fill-rule="evenodd" height="24" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg"><title>Grok</title><path d="M9.27 15.29l7.978-5.897c.391-.29.95-.177 1.137.272.98 2.369.542 5.215-1.41 7.169-1.951 1.954-4.667 2.382-7.149 1.406l-2.711 1.257c3.889 2.661 8.611 2.003 11.562-.953 2.341-2.344 3.066-5.539 2.388-8.42l.006.007c-.983-4.232.242-5.924 2.75-9.383.06-.082.12-.164.179-.248l-3.301 3.305v-.01L9.267 15.292M7.623 16.723c-2.792-2.67-2.31-6.801.071-9.184 1.761-1.763 4.647-2.483 7.166-1.425l2.705-1.25a7.808 7.808 0 00-1.829-1A8.975 8.975 0 005.984 5.83c-2.533 2.536-3.33 6.436-1.962 9.764 1.022 2.487-.653 4.246-2.34 6.022-.599.63-1.199 1.259-1.682 1.925l7.62-6.815"></path></svg>`;
    }
    if (norm.includes('ollama')) {
      return `<svg fill="#000000" fill-rule="evenodd" height="24" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg"><title>Ollama</title><path d="M7.905 1.09c.216.085.411.225.588.41.295.306.544.744.734 1.263.191.522.315 1.1.362 1.68a5.054 5.054 0 012.049-.636l.051-.004c.87-.07 1.73.087 2.48.474.101.053.2.11.297.17.05-.569.172-1.134.36-1.644.19-.52.439-.957.733-1.264a1.67 1.67 0 01.589-.41c.257-.1.53-.118.796-.042.401.114.745.368 1.016.737.248.337.434.769.561 1.287.23.934.27 2.163.115 3.645l.053.04.026.019c.757.576 1.284 1.397 1.563 2.35.435 1.487.216 3.155-.534 4.088l-.018.021.002.003c.417.762.67 1.567.724 2.4l.002.03c.064 1.065-.2 2.137-.814 3.19l-.007.01.01.024c.472 1.157.62 2.322.438 3.486l-.006.039a.651.651 0 01-.747.536.648.648 0 01-.54-.742c.167-1.033.01-2.069-.48-3.123a.643.643 0 01.04-.617l.004-.006c.604-.924.854-1.83.8-2.72-.046-.779-.325-1.544-.8-2.273a.644.644 0 01.18-.886l.009-.006c.243-.159.467-.565.58-1.12a4.229 4.229 0 00-.095-1.974c-.205-.7-.58-1.284-1.105-1.683-.595-.454-1.383-.673-2.38-.61a.653.653 0 01-.632-.371c-.314-.665-.772-1.141-1.343-1.436a3.288 3.288 0 00-1.772-.332c-1.245.099-2.343.801-2.67 1.686a.652.652 0 01-.61.425c-1.067.002-1.893.252-2.497.703-.522.39-.878.935-1.066 1.588a4.07 4.07 0 00-.068 1.886c.112.558.331 1.02.582 1.269l.008.007c.212.207.257.53.109.785-.36.622-.629 1.549-.673 2.44-.05 1.018.186 1.902.719 2.536l.016.019a.643.643 0 01.095.69c-.576 1.236-.753 2.252-.562 3.052a.652.652 0 01-1.269.298c-.243-1.018-.078-2.184.473-3.498l.014-.035-.008-.012a4.339 4.339 0 01-.598-1.309l-.005-.019a5.764 5.764 0 01-.177-1.785c.044-.91.278-1.842.622-2.59l.012-.026-.002-.002c-.293-.418-.51-.953-.63-1.545l-.005-.024a5.352 5.352 0 01.093-2.49c.262-.915.777-1.701 1.536-2.269.06-.045.123-.09.186-.132-.159-1.493-.119-2.73.112-3.67.127-.518.314-.95.562-1.287.27-.368.614-.622 1.015-.737.266-.076.54-.059.797.042zm4.116 9.09c.936 0 1.8.313 2.446.855.63.527 1.005 1.235 1.005 1.94 0 .888-.406 1.58-1.133 2.022-.62.375-1.451.557-2.403.557-1.009 0-1.871-.259-2.493-.734-.617-.47-.963-1.13-.963-1.845 0-.707.398-1.417 1.056-1.946.668-.537 1.55-.849 2.485-.849zm0 .896a3.07 3.07 0 00-1.916.65c-.461.37-.722.835-.722 1.25 0 .428.21.829.61 1.134.455.347 1.124.548 1.943.548.799 0 1.473-.147 1.932-.426.463-.28.7-.686.7-1.257 0-.423-.246-.89-.683-1.256-.484-.405-1.14-.643-1.864-.643zm.662 1.21l.004.004c.12.151.095.37-.056.49l-.292.23v.446a.375.375 0 01-.376.373.375.375 0 01-.376-.373v-.46l-.271-.218a.347.347 0 01-.052-.49.353.353 0 01.494-.051l.215.172.22-.174a.353.353 0 01.49.051zm-5.04-1.919c.478 0 .867.39.867.871a.87.87 0 01-.868.871.87.87 0 01-.867-.87.87.87 0 01.867-.872zm8.706 0c.48 0 .868.39.868.871a.87.87 0 01-.868.871.87.87 0 01-.867-.87.87.87 0 01.867-.872zM7.44 2.3l-.003.002a.659.659 0 00-.285.238l-.005.006c-.138.189-.258.467-.348.832-.17.692-.216 1.631-.124 2.782.43-.128.899-.208 1.404-.237l.01-.001.019-.034c.046-.082.095-.161.148-.239.123-.771.022-1.692-.253-2.444-.134-.364-.297-.65-.453-.813a.628.628 0 00-.107-.09L7.44 2.3zm9.174.04l-.002.001a.628.628 0 00-.107.09c-.156.163-.32.45-.453.814-.29.794-.387 1.776-.23 2.572l.058.097.008.014h.03a5.184 5.184 0 011.466.212c.086-1.124.038-2.043-.128-2.722-.09-.365-.21-.643-.349-.832l-.004-.006a.659.659 0 00-.285-.239h-.004z"></path></svg>`;
    }
    return `<svg viewBox='0 0 24 24' width='24' height='24' style='color: #8b5cf6;' fill='none' stroke='currentColor' stroke-width='2.5'><rect x='2' y='2' width='20' height='20' rx='4'></rect><path d='M12 6v12M6 12h12'></path></svg>`;
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

      const logoContainer = card.querySelector('.provider-logo-container');
      if (logoContainer) {
        logoContainer.innerHTML = this.getProviderLogoSvg(p.id);
      }

      const badge = card.querySelector('.provider-badge');
      const hasKey = p.apiKey && p.apiKey.trim().length > 0;
      badge.textContent = hasKey ? 'Active' : 'Configure';
      badge.className = 'provider-badge ' + (hasKey ? 'active' : 'inactive');

      card.addEventListener('click', () => this.editProvider(p.id));
      list.appendChild(clone);
    });

    // Append Add Provider Card
    const addCard = document.createElement('div');
    addCard.className = 'lumina-settings-provider-card provider-item add-provider-card';
    addCard.id = 'lumina-add-provider-btn';
    addCard.innerHTML = `
      <div class="provider-item-content add-mode">
        <div class="provider-logo-container">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </div>
        <span class="provider-title font-semibold">Add Provider</span>
      </div>
    `;
    addCard.addEventListener('click', () => this.showProviderForm());
    list.appendChild(addCard);
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

    const retentionMenu = document.getElementById('lumina-history-retention-menu');
    if (retentionMenu) {
      const opts = [
        { label: '1 Week', value: '0.25' },
        { label: '2 Weeks', value: '0.5' },
        { label: '1 Month', value: '1' },
        { label: '2 Months', value: '2' },
        { label: '3 Months', value: '3' },
        { label: '6 Months', value: '6' },
        { label: '1 Year', value: '12' },
        { label: 'Forever', value: '0' }
      ];
      retentionMenu.innerHTML = opts.map(o => `<div data-val="${o.value}">${o.label}</div>`).join('');
    }
  }

  static setupDropdownInputs(inputId, menuId) {
    const input = document.getElementById(inputId);
    const menu = document.getElementById(menuId);
    if (!input || !menu) return;

    input.addEventListener('click', (e) => {
      e.stopPropagation();
      const isCurrentlyOpen = menu.style.display === 'block';

      // Close all other dropdown menus in the DOM first
      document.querySelectorAll('.lumina-settings-dropdown-menu').forEach(m => {
        m.style.display = 'none';
      });

      menu.style.display = isCurrentlyOpen ? 'none' : 'block';
    });

    document.addEventListener('click', (e) => {
      const wrapper = input.closest('.lumina-settings-dropdown-wrapper');
      if (wrapper && !wrapper.contains(e.target)) {
        menu.style.display = 'none';
      }
    });

    // Support search filtering for model field
    if (inputId === 'lumina-text-chain-model') {
      input.addEventListener('input', () => {
        const query = input.value.toLowerCase().trim();
        const items = menu.querySelectorAll('div');
        let hasVisible = false;
        items.forEach(item => {
          const text = item.textContent.toLowerCase();
          if (text.includes(query)) {
            item.style.display = 'block';
            hasVisible = true;
          } else {
            item.style.display = 'none';
          }
        });
        menu.style.display = 'block'; // Keep menu open while typing
      });
    }

    menu.addEventListener('click', (e) => {
      if (e.target.tagName === 'DIV') {
        input.value = e.target.textContent;
        input.dataset.value = e.target.dataset.val || e.target.textContent;
        menu.style.display = 'none';

        if (inputId === 'lumina-settings-base-tone-input') {
          this.adjustInputWidthToContent(input);
        }

        // Only save options for settings dropdowns, not temporary modal inputs
        if (inputId.startsWith('lumina-dict-') || inputId === 'lumina-history-retention-input' || inputId === 'lumina-settings-base-tone-input') {
          this.saveOptions();
        }

        if (inputId === 'lumina-text-chain-provider') {
          const modelInput = document.getElementById('lumina-text-chain-model');
          if (modelInput) {
            modelInput.value = '';
            modelInput.dataset.value = '';
          }
          this.loadModelsForProvider(input.dataset.value);
          this.updateModelPopupFieldsState();
        }
      }
    });
  }
  static adjustInputWidthToContent(input) {
    if (!input) return;
    const wrapper = input.closest('.lumina-settings-dropdown-wrapper');
    if (!wrapper) return;
    const tempSpan = document.createElement('span');
    tempSpan.style.visibility = 'hidden';
    tempSpan.style.position = 'absolute';
    tempSpan.style.whiteSpace = 'pre';
    tempSpan.style.fontFamily = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    tempSpan.style.fontSize = '13px';
    tempSpan.style.fontWeight = '400';
    tempSpan.textContent = input.value || 'Default';
    document.body.appendChild(tempSpan);
    const width = tempSpan.getBoundingClientRect().width;
    document.body.removeChild(tempSpan);
    const exactWidth = Math.max(width + 38, 100);
    wrapper.style.width = exactWidth + 'px';
    input.style.width = '100%';
  }

  static enableAutoExpandTextarea(el) {
    if (!el) return;
    const adjust = () => {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 250) + 'px';
    };
    el.addEventListener('input', adjust);
  }
  static async loadModelsForProvider(providerId) {
    const menu = document.getElementById('lumina-text-chain-model-list');
    if (!menu) return;
    menu.innerHTML = '<div style="padding: 10px; font-size:12.5px; color:var(--lumina-text-secondary);">Loading models...</div>';

    const provider = this.providers.find(p => p.id === providerId);
    if (!provider) {
      menu.innerHTML = '<div style="padding: 10px; font-size:12.5px; color:var(--lumina-text-secondary);">No provider selected</div>';
      return;
    }

    try {
      const firstKey = provider.apiKey ? provider.apiKey.split(',')[0].trim() : '';
      let models = [];
      let response;

      const isGemini = provider.type === 'gemini' || (typeof provider.endpoint === 'string' && provider.endpoint.includes('generativelanguage.googleapis.com'));

      if (isGemini) {
        let baseUrl = provider.endpoint || 'https://generativelanguage.googleapis.com/v1beta/models';
        baseUrl = baseUrl.replace(/\/+$/, '');
        if (baseUrl.includes('/chat/completions')) {
          baseUrl = baseUrl.replace('/chat/completions', '/models');
        } else if (!baseUrl.endsWith('/models')) {
          baseUrl = baseUrl + '/models';
        }
        const url = firstKey ? `${baseUrl}?key=${firstKey}` : baseUrl;
        response = await fetch(url);
      } else {
        let modelsUrl = provider.endpoint.trim().replace(/\/+$/, '');
        const suffixes = ['/chat/completions', '/models', '/audio/transcriptions'];
        let matched = false;
        for (const suffix of suffixes) {
          if (modelsUrl.endsWith(suffix)) {
            modelsUrl = modelsUrl.slice(0, -suffix.length) + '/models';
            matched = true;
            break;
          }
        }
        if (!matched) {
          modelsUrl = modelsUrl + '/models';
        }

        if (provider.id.includes('groq') || modelsUrl.includes('groq.com')) {
          modelsUrl = 'https://api.groq.com/openai/v1/models';
        }

        response = await fetch(modelsUrl, {
          headers: firstKey ? { 'Authorization': `Bearer ${firstKey}` } : {}
        });
      }

      if (response && response.ok) {
        const data = await response.json();
        if (isGemini) {
          if (data.models) {
            models = data.models.map(m => m.name.replace('models/', ''));
          }
        } else {
          if (data.data) {
            models = data.data.map(m => m.id);
          }
        }
      }

      if (models.length === 0) {
        const fallbackOptions = {
          'openai-default': ['gpt-4o', 'gpt-4o-mini', 'o1-mini', 'o1-preview'],
          'gemini-default': ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-1.5-flash'],
          'deepseek-default': ['deepseek-chat', 'deepseek-reasoner']
        };
        models = fallbackOptions[providerId] || ['custom-model'];
      }

      menu.innerHTML = models.map(m => `<div data-val="${m}">${m}</div>`).join('');
    } catch (e) {
      console.error('Failed to fetch models in settings:', e);
      const fallbackOptions = {
        'openai-default': ['gpt-4o', 'gpt-4o-mini', 'o1-mini', 'o1-preview'],
        'gemini-default': ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-1.5-flash'],
        'deepseek-default': ['deepseek-chat', 'deepseek-reasoner']
      };
      const list = fallbackOptions[providerId] || ['custom-model'];
      menu.innerHTML = list.map(m => `<div data-val="${m}">${m}</div>`).join('');
    }
  }

  static showProviderForm() {
    const overlay = document.getElementById('lumina-provider-popup-overlay');
    if (overlay) overlay.style.display = 'flex';
    document.getElementById('lumina-provider-form-id').value = '';
    document.getElementById('lumina-provider-form-name').value = '';
    document.getElementById('lumina-provider-form-endpoint').value = '';
    document.getElementById('lumina-provider-form-apikey').value = '';

    const statusEl = document.getElementById('lumina-provider-popup-status');
    if (statusEl) {
      statusEl.innerHTML = '';
      statusEl.className = 'lumina-provider-popup-status hidden';
    }
  }

  static editProvider(id) {
    const p = this.providers.find(p => p.id === id);
    if (!p) return;

    const overlay = document.getElementById('lumina-provider-popup-overlay');
    if (overlay) overlay.style.display = 'flex';
    document.getElementById('lumina-provider-form-id').value = p.id;
    document.getElementById('lumina-provider-form-name').value = p.name;
    document.getElementById('lumina-provider-form-endpoint').value = p.endpoint;
    document.getElementById('lumina-provider-form-apikey').value = p.apiKey || '';

    const statusEl = document.getElementById('lumina-provider-popup-status');
    if (statusEl) {
      statusEl.innerHTML = '';
      statusEl.className = 'lumina-provider-popup-status hidden';
    }
  }

  static hideProviderForm() {
    const overlay = document.getElementById('lumina-provider-popup-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  static showModelForm(index = null) {
    const overlay = document.getElementById('lumina-model-popup-overlay');
    if (overlay) overlay.style.display = 'flex';

    const indexInput = document.getElementById('lumina-model-form-index');
    const providerInput = document.getElementById('lumina-text-chain-provider');
    const modelInput = document.getElementById('lumina-text-chain-model');
    const customNameInput = document.getElementById('lumina-text-chain-model-name-custom');

    if (index !== null && index >= 0) {
      const item = this.textChain[index];
      indexInput.value = index;

      const prov = this.providers.find(p => p.id === item.providerId);
      providerInput.value = prov ? prov.name : item.providerId;
      providerInput.dataset.value = item.providerId;

      modelInput.value = item.modelName;
      customNameInput.value = item.displayName || '';

      this.loadModelsForProvider(item.providerId);
    } else {
      indexInput.value = '';
      providerInput.value = '';
      providerInput.dataset.value = '';
      modelInput.value = '';
      customNameInput.value = '';
    }

    this.updateModelPopupFieldsState();
  }

  static updateModelPopupFieldsState() {
    const provider = document.getElementById('lumina-text-chain-provider').dataset.value;
    const modelInput = document.getElementById('lumina-text-chain-model');
    const customNameInput = document.getElementById('lumina-text-chain-model-name-custom');

    const shouldDisable = !provider;
    if (modelInput) {
      modelInput.disabled = shouldDisable;
      if (shouldDisable) {
        modelInput.style.opacity = '0.6';
        modelInput.style.cursor = 'not-allowed';
      } else {
        modelInput.style.opacity = '1';
        modelInput.style.cursor = 'pointer';
      }
    }
    if (customNameInput) {
      customNameInput.disabled = shouldDisable;
      if (shouldDisable) {
        customNameInput.style.opacity = '0.6';
        customNameInput.style.cursor = 'not-allowed';
      } else {
        customNameInput.style.opacity = '1';
        customNameInput.style.cursor = 'text';
      }
    }
  }

  static hideModelForm() {
    const overlay = document.getElementById('lumina-model-popup-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  static showMappingForm(index = null) {
    const overlay = document.getElementById('lumina-mapping-popup-overlay');
    if (overlay) overlay.style.display = 'flex';

    const indexInput = document.getElementById('lumina-mapping-form-index');
    const nameInput = document.getElementById('lumina-mapping-popup-name');
    const shortcutBox = document.getElementById('lumina-mapping-popup-shortcut');
    const promptInput = document.getElementById('lumina-mapping-popup-prompt');
    const highlightInput = document.getElementById('lumina-mapping-popup-highlight');


    if (index !== null && index >= 0) {
      const item = this.questionMappings[index];
      indexInput.value = index;
      nameInput.value = item.name || '';

      const keyData = item.keyData || (item.key ? { key: item.key, code: 'Key' + item.key.toUpperCase() } : null);
      this.renderShortcutDisplay(shortcutBox, keyData);

      this.deserializePrompt(item.prompt || '', promptInput);
      highlightInput.checked = (item.highlight !== false) && (item.enableHighlight !== false);
    } else {
      indexInput.value = '';
      nameInput.value = '';
      this.renderShortcutDisplay(shortcutBox, null);
      promptInput.innerHTML = '';
      highlightInput.checked = true;
    }
  }

  static hideMappingForm() {
    const overlay = document.getElementById('lumina-mapping-popup-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  static saveMapping() {
    const indexInput = document.getElementById('lumina-mapping-form-index');
    const nameInput = document.getElementById('lumina-mapping-popup-name');
    const shortcutBox = document.getElementById('lumina-mapping-popup-shortcut');
    const promptInput = document.getElementById('lumina-mapping-popup-prompt');
    const highlightInput = document.getElementById('lumina-mapping-popup-highlight');

    const name = nameInput.value.trim();
    const prompt = this.serializePrompt(promptInput).trim();
    if (!name || !prompt) {
      alert('Please fill in both Rule Name and Content fields.');
      return;
    }

    let keyData = null;
    if (shortcutBox.dataset.key) {
      try {
        keyData = JSON.parse(shortcutBox.dataset.key);
      } catch (e) {
        console.error(e);
      }
    }

    if (!keyData) {
      alert('Please record a shortcut.');
      return;
    }

    const mapping = {
      name: name,
      keyData: keyData,
      key: keyData.key,
      prompt: prompt,
      highlight: highlightInput.checked,
      enableHighlight: highlightInput.checked
    };

    const indexVal = indexInput.value;
    if (indexVal !== '') {
      const idx = parseInt(indexVal, 10);
      this.questionMappings[idx] = mapping;
    } else {
      this.questionMappings.push(mapping);
    }

    chrome.storage.local.set({ questionMappings: this.questionMappings }, () => {
      this.renderQuestionMappings();
      this.hideMappingForm();
    });
  }

  static serializePrompt(el) {
    let result = '';
    const childs = el.childNodes;
    for (let i = 0; i < childs.length; i++) {
      const node = childs[i];
      if (node.nodeType === Node.TEXT_NODE) {
        result += node.textContent;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.classList.contains('lumina-variable-tag')) {
          result += node.getAttribute('data-val') || node.textContent;
        } else if (node.tagName === 'BR') {
          result += '\n';
        } else {
          result += this.serializePrompt(node);
          if (node.tagName === 'DIV' || node.tagName === 'P') {
            result += '\n';
          }
        }
      }
    }
    return result;
  }

  static deserializePrompt(text, el) {
    el.innerHTML = '';
    if (!text) return;

    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    const html = escaped.replace(/(\$SelectedText|\$Sentence|\$Paragraph)/g, (match) => {
      return `<span class="lumina-variable-tag" contenteditable="false" data-val="${match}">${match}</span>`;
    });

    const formattedHtml = html.replace(/\n/g, '<br>');
    el.innerHTML = formattedHtml;
  }

  static resetProvider() {
    const id = document.getElementById('lumina-provider-form-id').value;
    if (!id) {
      document.getElementById('lumina-provider-form-name').value = '';
      document.getElementById('lumina-provider-form-endpoint').value = '';
      document.getElementById('lumina-provider-form-apikey').value = '';
      return;
    }

    const defaults = this.getDefaultProviders();
    const defaultProv = defaults.find(d => d.id === id);
    if (defaultProv) {
      document.getElementById('lumina-provider-form-name').value = defaultProv.name;
      document.getElementById('lumina-provider-form-endpoint').value = defaultProv.endpoint;
      document.getElementById('lumina-provider-form-apikey').value = '';
    } else {
      document.getElementById('lumina-provider-form-name').value = '';
      document.getElementById('lumina-provider-form-endpoint').value = '';
      document.getElementById('lumina-provider-form-apikey').value = '';
    }
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
    const name = document.getElementById('lumina-provider-form-name').value.trim();
    const endpoint = document.getElementById('lumina-provider-form-endpoint').value.trim();
    const apiKey = document.getElementById('lumina-provider-form-apikey').value.trim();

    if (!endpoint || !apiKey) {
      alert('Endpoint and API Key are required to check status.');
      return;
    }

    const statusEl = document.getElementById('lumina-provider-popup-status');
    if (!statusEl) return;

    statusEl.classList.remove('hidden');
    statusEl.className = 'lumina-provider-popup-status info';
    statusEl.innerHTML = '<div class="status-loading" style="font-weight: 500;">Checking API Keys...</div>';

    const checkBtn = document.getElementById('lumina-check-apikeys-btn');
    const originalText = checkBtn.textContent;
    checkBtn.textContent = 'Checking...';
    checkBtn.disabled = true;

    // Support comma-separated keys
    const keysList = apiKey.split(',').map(k => k.trim()).filter(Boolean);

    if (keysList.length === 0) {
      statusEl.className = 'lumina-provider-popup-status error';
      statusEl.innerHTML = '<strong>Error:</strong> No keys entered.';
      checkBtn.textContent = originalText;
      checkBtn.disabled = false;
      return;
    }

    let testUrlBase = endpoint.replace(/\/+$/, '');
    if (!testUrlBase.includes('/models') && !testUrlBase.includes('/chat/completions')) {
      testUrlBase = testUrlBase + '/models';
    } else if (testUrlBase.includes('/chat/completions')) {
      testUrlBase = testUrlBase.replace('/chat/completions', '/models');
    }

    const isGemini = testUrlBase.includes('generativelanguage.googleapis.com');

    // Run checks for all keys in parallel
    const checkPromises = keysList.map((key, index) => {
      let keyUrl = testUrlBase;
      const headers = { 'Content-Type': 'application/json' };

      if (isGemini) {
        keyUrl = keyUrl.includes('?') ? `${keyUrl}&key=${key}` : `${keyUrl}?key=${key}`;
      } else {
        headers['Authorization'] = `Bearer ${key}`;
      }

      const maskedKey = key.length > 12
        ? key.substring(0, 8) + '...' + key.substring(key.length - 4)
        : key.substring(0, Math.min(4, key.length)) + '...';

      return fetch(keyUrl, { method: 'GET', headers })
        .then(res => ({
          index,
          keyLabel: maskedKey,
          ok: res.ok,
          status: res.status
        }))
        .catch(err => ({
          index,
          keyLabel: maskedKey,
          ok: false,
          error: err.message
        }));
    });

    Promise.all(checkPromises).then(results => {
      checkBtn.textContent = originalText;
      checkBtn.disabled = false;

      const allOk = results.every(r => r.ok);
      statusEl.className = 'lumina-provider-popup-status ' + (allOk ? 'success' : results.some(r => r.ok) ? 'warning' : 'error');

      if (results.length === 1) {
        const res = results[0];
        if (res.ok) {
          statusEl.innerHTML = `<strong>Success:</strong> API Key is valid and active.`;
        } else {
          statusEl.innerHTML = `<strong>Error:</strong> API Key check failed${res.status ? ` (Status: ${res.status})` : `: ${res.error}`}.`;
        }
      } else {
        const okCount = results.filter(r => r.ok).length;
        let html = `<div class="status-summary" style="font-weight: 600;">Checked ${results.length} keys: ${okCount} valid, ${results.length - okCount} invalid</div>`;
        html += '<ul class="status-keys-list" style="margin-top: 6px; padding-left: 16px; list-style-type: disc;">';
        results.forEach(res => {
          html += `
            <li class="${res.ok ? 'key-ok' : 'key-fail'}" style="color: ${res.ok ? '#10b981' : '#ef4444'}; font-size: 12px; margin-top: 2px;">
              <span class="key-masked" style="font-family: monospace; font-size: 11.5px; color: var(--lumina-text-primary); font-weight: 500;">${res.keyLabel}</span>: 
              <strong>${res.ok ? 'VALID' : res.status ? `FAILED (${res.status})` : `FAILED (${res.error})`}</strong>
            </li>
          `;
        });
        html += '</ul>';
        statusEl.innerHTML = html;
      }
    });
  }

  static addModelToChain() {
    const indexStr = document.getElementById('lumina-model-form-index').value;
    const provider = document.getElementById('lumina-text-chain-provider').dataset.value;
    const model = document.getElementById('lumina-text-chain-model').value.trim();
    const customName = document.getElementById('lumina-text-chain-model-name-custom').value.trim();

    if (!provider || !model) {
      alert('Provider and Model are required.');
      return;
    }

    const item = {
      providerId: provider,
      modelName: model,
      model: model,
      displayName: customName || model
    };

    if (indexStr !== '') {
      const idx = parseInt(indexStr);
      if (idx >= 0 && idx < this.textChain.length) {
        this.textChain[idx] = item;
      }
    } else {
      this.textChain.unshift(item);
    }

    chrome.storage.local.set({ modelChains: { text: this.textChain } }, () => {
      this.renderChainList();
      this.hideModelForm();
    });
  }

  static renderChainList() {
    const list = document.getElementById('lumina-text-chain-list');
    if (!list) return;
    list.innerHTML = '';

    // Append Add Model Card first (at the top)
    const addCard = document.createElement('div');
    addCard.className = 'lumina-settings-chain-card chain-item add-model-card';
    addCard.id = 'lumina-open-add-model-btn';
    addCard.innerHTML = `
      <div class="add-mode">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
        <span class="font-semibold">Add Model</span>
      </div>
    `;
    addCard.addEventListener('click', () => this.showModelForm());
    list.appendChild(addCard);

    if (this.textChain.length === 0) {
      const emptyState = document.createElement('div');
      emptyState.className = 'lumina-settings-empty-state';
      emptyState.textContent = 'No models added yet. Click "Add Model" above to start.';
      list.appendChild(emptyState);
    } else {
      const temp = document.getElementById('lumina-chainItemTemplate');
      this.textChain.forEach((item, index) => {
        const clone = temp.content.cloneNode(true);
        clone.querySelector('.chain-number').textContent = index + 1;

        // Display model name (or custom name) in chain-title slot
        clone.querySelector('.chain-title').textContent = item.displayName || item.modelName;

        // Display human-readable provider name in chain-subtitle slot
        const prov = this.providers.find(p => p.id === item.providerId);
        const providerName = prov ? prov.name : item.providerId;
        clone.querySelector('.chain-subtitle').textContent = providerName;

        clone.querySelector('.edit').addEventListener('click', () => {
          this.showModelForm(index);
        });

        clone.querySelector('.remove').addEventListener('click', () => {
          this.textChain.splice(index, 1);
          chrome.storage.local.set({ modelChains: { text: this.textChain } }, () => this.renderChainList());
        });

        list.appendChild(clone);
      });
    }
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
    this.setupDropdownInputs('lumina-settings-base-tone-input', 'lumina-settings-base-tone-menu');

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

    const addInstructionBtn = document.getElementById('lumina-add-instruction-btn');
    if (addInstructionBtn) {
      addInstructionBtn.addEventListener('click', () => {
        this.showInstructionForm();
      });
    }

    // Instruction popup controls
    const cancelInstBtn = document.getElementById('lumina-cancel-instruction-popup-btn');
    const saveInstBtn = document.getElementById('lumina-save-instruction-popup-btn');
    const closeInstPopupBtn = document.getElementById('lumina-instruction-popup-close-btn');
    const instPopupOverlay = document.getElementById('lumina-instruction-popup-overlay');

    const contentInputEl = document.getElementById('lumina-instruction-popup-content');
    if (contentInputEl) {
      contentInputEl.addEventListener('input', () => {
        contentInputEl.style.height = 'auto';
        contentInputEl.style.height = Math.min(contentInputEl.scrollHeight, 250) + 'px';
      });
    }

    if (cancelInstBtn) cancelInstBtn.addEventListener('click', () => this.hideInstructionForm());
    if (saveInstBtn) saveInstBtn.addEventListener('click', () => this.saveInstructionPopup());
    if (closeInstPopupBtn) closeInstPopupBtn.addEventListener('click', () => this.hideInstructionForm());
    if (instPopupOverlay) {
      instPopupOverlay.addEventListener('click', (e) => {
        if (e.target === instPopupOverlay) this.hideInstructionForm();
      });
    }
  }

  static showInstructionForm(index = null) {
    const overlay = document.getElementById('lumina-instruction-popup-overlay');
    const titleEl = document.getElementById('lumina-instruction-popup-title');
    const indexInput = document.getElementById('lumina-instruction-popup-index');
    const contentInput = document.getElementById('lumina-instruction-popup-content');

    if (!overlay || !titleEl || !indexInput || !contentInput) return;

    if (index !== null && index >= 0 && index < this.userFacts.length) {
      titleEl.textContent = 'Edit Custom Instruction';
      indexInput.value = index;
      contentInput.value = this.userFacts[index];
    } else {
      titleEl.textContent = 'Add Custom Instruction';
      indexInput.value = '';
      contentInput.value = '';
    }

    overlay.style.display = 'flex';
    contentInput.style.height = 'auto';
    contentInput.style.height = Math.min(contentInput.scrollHeight, 250) + 'px';
    setTimeout(() => contentInput.focus(), 50);
  }

  static hideInstructionForm() {
    const overlay = document.getElementById('lumina-instruction-popup-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  static async saveInstructionPopup() {
    const indexInput = document.getElementById('lumina-instruction-popup-index');
    const contentInput = document.getElementById('lumina-instruction-popup-content');
    if (!indexInput || !contentInput) return;

    const val = contentInput.value.trim();
    if (!val) {
      alert('Instruction content is required.');
      return;
    }

    const indexVal = indexInput.value;
    if (indexVal !== '') {
      const idx = parseInt(indexVal, 10);
      const updatedFacts = await UserMemory.updateFact(idx, val);
      this.userFacts = updatedFacts;
    } else {
      const updatedFacts = await UserMemory.addFact(val);
      this.userFacts = updatedFacts;
    }

    this.renderUserFacts();
    this.hideInstructionForm();
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
      clone.querySelector('.fact-text').textContent = fact;
      
      clone.querySelector('.fact-edit-btn').addEventListener('click', () => {
        this.showInstructionForm(idx);
      });

      clone.querySelector('.fact-delete-btn').addEventListener('click', async () => {
        if (typeof window.showCustomPopup === 'function') {
          const confirmed = await window.showCustomPopup({
            title: 'Delete Instruction',
            body: 'Are you sure you want to delete this custom instruction?',
            confirmLabel: 'Delete',
            isDanger: true
          });
          if (confirmed) {
            const updatedFacts = await UserMemory.removeFact(idx);
            this.userFacts = updatedFacts;
            this.renderUserFacts();
          }
        } else {
          if (confirm('Are you sure you want to delete this custom instruction?')) {
            const updatedFacts = await UserMemory.removeFact(idx);
            this.userFacts = updatedFacts;
            this.renderUserFacts();
          }
        }
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

    const addMappingBtn = document.getElementById('lumina-add-mapping-btn');
    if (addMappingBtn) {
      addMappingBtn.addEventListener('click', () => {
        this.showMappingForm();
      });
    }

    const cancelMappingBtn = document.getElementById('lumina-cancel-mapping-btn');
    const saveMappingBtn = document.getElementById('lumina-save-mapping-btn');
    const closeMappingPopupBtn = document.getElementById('lumina-mapping-popup-close-btn');
    const mappingPopupOverlay = document.getElementById('lumina-mapping-popup-overlay');

    if (cancelMappingBtn) cancelMappingBtn.addEventListener('click', () => this.hideMappingForm());
    if (saveMappingBtn) saveMappingBtn.addEventListener('click', () => this.saveMapping());
    if (closeMappingPopupBtn) closeMappingPopupBtn.addEventListener('click', () => this.hideMappingForm());
    if (mappingPopupOverlay) {
      mappingPopupOverlay.addEventListener('click', (e) => {
        if (e.target === mappingPopupOverlay) this.hideMappingForm();
      });
    }

    const mappingPopupShortcut = document.getElementById('lumina-mapping-popup-shortcut');
    if (mappingPopupShortcut) {
      mappingPopupShortcut.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.justRecordedMouseClick) return;
        this.recordShortcut(mappingPopupShortcut);
      });
    }

    const referenceChipsContainer = document.getElementById('lumina-mapping-popup-reference-chips');
    if (referenceChipsContainer) {
      referenceChipsContainer.querySelectorAll('.lumina-reference-chip').forEach(chip => {
        chip.addEventListener('click', (e) => {
          e.preventDefault();
          const val = chip.getAttribute('data-val');
          if (!val) return;

          const promptInput = document.getElementById('lumina-mapping-popup-prompt');
          if (promptInput) {
            const selection = window.getSelection();
            if (selection.rangeCount > 0) {
              const range = selection.getRangeAt(0);
              if (promptInput.contains(range.commonAncestorContainer)) {
                const span = document.createElement('span');
                span.className = 'lumina-variable-tag';
                span.contentEditable = 'false';
                span.setAttribute('data-val', val);
                span.textContent = val;

                range.deleteContents();
                range.insertNode(span);

                range.setStartAfter(span);
                range.setEndAfter(span);
                selection.removeAllRanges();
                selection.addRange(range);
                return;
              }
            }

            const span = document.createElement('span');
            span.className = 'lumina-variable-tag';
            span.contentEditable = 'false';
            span.setAttribute('data-val', val);
            span.textContent = val;
            promptInput.appendChild(span);

            promptInput.focus();
            const range = document.createRange();
            range.selectNode(span);
            range.collapse(false);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
          }
        });
      });
    }

    const addAnnotationBtn = document.getElementById('lumina-add-annotation-shortcut-btn');
    if (addAnnotationBtn) {
      addAnnotationBtn.addEventListener('click', () => {
        this.showAnnotationForm();
      });
    }

    const cancelAnnotationBtn = document.getElementById('lumina-cancel-annotation-btn');
    const saveAnnotationBtn = document.getElementById('lumina-save-annotation-btn');
    const closeAnnotationPopupBtn = document.getElementById('lumina-annotation-popup-close-btn');
    const annotationPopupOverlay = document.getElementById('lumina-annotation-popup-overlay');

    if (cancelAnnotationBtn) cancelAnnotationBtn.addEventListener('click', () => this.hideAnnotationForm());
    if (saveAnnotationBtn) saveAnnotationBtn.addEventListener('click', () => this.saveAnnotation());
    if (closeAnnotationPopupBtn) closeAnnotationPopupBtn.addEventListener('click', () => this.hideAnnotationForm());
    if (annotationPopupOverlay) {
      annotationPopupOverlay.addEventListener('click', (e) => {
        if (e.target === annotationPopupOverlay) this.hideAnnotationForm();
      });
    }

    const annotationPopupShortcut = document.getElementById('lumina-annotation-popup-shortcut');
    if (annotationPopupShortcut) {
      annotationPopupShortcut.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.justRecordedMouseClick) return;
        this.recordShortcut(annotationPopupShortcut);
      });
    }

    this.bindShortcutRecorders();
  }

  static bindShortcutRecorders() {
    document.querySelectorAll('.lumina-settings-shortcut-box[data-action]').forEach(box => {
      box.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.justRecordedMouseClick) return;
        this.recordShortcut(box);
      });
    });
  }

  static renderShortcutDisplay(box, keyData) {
    box.innerHTML = '';
    if (!keyData) {
      box.textContent = 'None';
      box.dataset.key = '';
      return;
    }

    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const parts = [];

    const formatModifier = (key, code) => {
      let side = '';
      if (code && code.endsWith('Left')) side = 'L';
      else if (code && code.endsWith('Right')) side = 'R';

      if (key === 'Control') return isMac ? side + '⌃' : side + 'Ctrl';
      if (key === 'Alt') return isMac ? side + '⌥' : side + 'Alt';
      if (key === 'Shift') return isMac ? side + '⇧' : side + 'Shift';
      if (key === 'Meta') return isMac ? side + '⌘' : side + 'Win';
      return key;
    };

    if (keyData.modifierCodes && keyData.modifierCodes.length > 0) {
      if (keyData.ctrlKey && keyData.key !== 'Control') {
        const code = keyData.modifierCodes.find(c => c.startsWith('Control')) || 'ControlLeft';
        parts.push(formatModifier('Control', code));
      }
      if (keyData.altKey && keyData.key !== 'Alt') {
        const code = keyData.modifierCodes.find(c => c.startsWith('Alt')) || 'AltLeft';
        parts.push(formatModifier('Alt', code));
      }
      if (keyData.shiftKey && keyData.key !== 'Shift') {
        const code = keyData.modifierCodes.find(c => c.startsWith('Shift')) || 'ShiftLeft';
        parts.push(formatModifier('Shift', code));
      }
      if (keyData.metaKey && keyData.key !== 'Meta') {
        const code = keyData.modifierCodes.find(c => c.startsWith('Meta')) || 'MetaLeft';
        parts.push(formatModifier('Meta', code));
      }
    } else {
      if (keyData.ctrlKey && keyData.key !== 'Control') parts.push(isMac ? '⌃' : 'Ctrl');
      if (keyData.altKey && keyData.key !== 'Alt') parts.push(isMac ? '⌥' : 'Alt');
      if (keyData.shiftKey && keyData.key !== 'Shift') parts.push(isMac ? '⇧' : 'Shift');
      if (keyData.metaKey && keyData.key !== 'Meta') parts.push(isMac ? '⌘' : 'Win');
    }

    let display = keyData.display || keyData.key || 'Unknown';
    if (keyData.key === ' ' || keyData.code === 'Space') display = 'Space';
    if (keyData.code && keyData.code.startsWith('Mouse')) {
      const btn = keyData.code.replace('Mouse', '');
      if (btn === '0') display = 'Left';
      else if (btn === '1') display = 'Middle';
      else if (btn === '2') display = 'Right';
      else display = 'Click' + btn;
    }

    const isModifierKey = ['Control', 'Alt', 'Shift', 'Meta'].includes(keyData.key);
    if (isModifierKey) {
      display = formatModifier(keyData.key, keyData.code);
    }

    if (display.length === 1 && !isModifierKey) display = display.toUpperCase();
    parts.push(display);

    box.innerHTML = parts.map(p => `<span class="shortcut-key">${p}</span>`).join('');
    box.dataset.key = JSON.stringify(keyData);
  }

  static recordShortcut(box) {
    if (this.currentRecordingInput) {
      this.stopRecording(this.currentRecordingInput, false);
    }

    this.currentRecordingInput = box;
    this.recordingHadInput = false;
    this.recordingPressedCodes = new Set();
    box.classList.add('recording');
    box.innerHTML = '<span class="recording" style="font-size: 13px; color: var(--lumina-text-secondary);">Recording...</span>';

    const keydownHandler = (e) => {
      e.preventDefault();
      e.stopPropagation();

      this.recordingPressedCodes.add(e.code);

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
        if (pair && this.recordingPressedCodes.has(pair[0]) && this.recordingPressedCodes.has(pair[1])) {
          code = e.key;
        }
      }

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      let display = e.key;
      if (isModifier) {
        if (e.key === 'Control') display = isMac ? '⌃' : 'Ctrl';
        else if (e.key === 'Alt') display = isMac ? '⌥' : 'Alt';
        else if (e.key === 'Shift') display = isMac ? '⇧' : 'Shift';
        else if (e.key === 'Meta') display = isMac ? '⌘' : 'Win';
      }

      const modifierCodes = [];
      if (e.ctrlKey) {
        if (this.recordingPressedCodes.has('ControlLeft')) modifierCodes.push('ControlLeft');
        else if (this.recordingPressedCodes.has('ControlRight')) modifierCodes.push('ControlRight');
        else modifierCodes.push('ControlLeft');
      }
      if (e.altKey) {
        if (this.recordingPressedCodes.has('AltLeft')) modifierCodes.push('AltLeft');
        else if (this.recordingPressedCodes.has('AltRight')) modifierCodes.push('AltRight');
        else modifierCodes.push('AltLeft');
      }
      if (e.shiftKey) {
        if (this.recordingPressedCodes.has('ShiftLeft')) modifierCodes.push('ShiftLeft');
        else if (this.recordingPressedCodes.has('ShiftRight')) modifierCodes.push('ShiftRight');
        else modifierCodes.push('ShiftLeft');
      }
      if (e.metaKey) {
        if (this.recordingPressedCodes.has('MetaLeft')) modifierCodes.push('MetaLeft');
        else if (this.recordingPressedCodes.has('MetaRight')) modifierCodes.push('MetaRight');
        else modifierCodes.push('MetaLeft');
      }

      const keyData = {
        code: code,
        key: e.key,
        display: display,
        ctrlKey: e.ctrlKey,
        altKey: e.altKey,
        shiftKey: e.shiftKey,
        metaKey: e.metaKey,
        modifierCodes: modifierCodes
      };

      if (isModifier) {
        this.renderShortcutDisplay(box, keyData);
      } else {
        this.renderShortcutDisplay(box, keyData);
        this.recordingHadInput = true;
        this.stopRecording(box, false);
        this.saveCapturedShortcut(box.dataset.action, keyData);
      }
    };

    const keyupHandler = (e) => {
      this.recordingPressedCodes.delete(e.code);
      if (this.currentRecordingInput !== box) return;

      const isModifier = ['Control', 'Alt', 'Shift', 'Meta'].includes(e.key);
      if (isModifier) {
        this.recordingHadInput = true;
        this.stopRecording(box, false);

        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        let display = e.key;
        if (e.key === 'Control') display = isMac ? '⌃' : 'Ctrl';
        else if (e.key === 'Alt') display = isMac ? '⌥' : 'Alt';
        else if (e.key === 'Shift') display = isMac ? '⇧' : 'Shift';
        else if (e.key === 'Meta') display = isMac ? '⌘' : 'Win';

        const modifierCodes = [e.code];

        const keyData = {
          code: e.code,
          key: e.key,
          display: display,
          ctrlKey: e.ctrlKey,
          altKey: e.altKey,
          shiftKey: e.shiftKey,
          metaKey: e.metaKey,
          modifierCodes: modifierCodes
        };
        this.renderShortcutDisplay(box, keyData);
        this.saveCapturedShortcut(box.dataset.action, keyData);
      }
    };

    const mousedownHandler = (e) => {
      e.preventDefault();
      e.stopPropagation();

      const shortcutTarget = e.target.closest('.lumina-settings-shortcut-box');
      if (shortcutTarget !== box) {
        box.removeAttribute('data-key');
        delete box.dataset.key;
        this.renderShortcutDisplay(box, null);
        this.stopRecording(box, false);
        this.saveCapturedShortcut(box.dataset.action, null);
        return;
      }

      // Record mouse click
      const code = 'Mouse' + e.button;
      let display = 'Click';
      if (e.button === 0) display = 'LClick';
      else if (e.button === 1) display = 'MClick';
      else if (e.button === 2) display = 'RClick';

      const modifierCodes = [];
      if (e.ctrlKey) {
        if (this.recordingPressedCodes.has('ControlLeft')) modifierCodes.push('ControlLeft');
        else if (this.recordingPressedCodes.has('ControlRight')) modifierCodes.push('ControlRight');
        else modifierCodes.push('ControlLeft');
      }
      if (e.altKey) {
        if (this.recordingPressedCodes.has('AltLeft')) modifierCodes.push('AltLeft');
        else if (this.recordingPressedCodes.has('AltRight')) modifierCodes.push('AltRight');
        else modifierCodes.push('AltLeft');
      }
      if (e.shiftKey) {
        if (this.recordingPressedCodes.has('ShiftLeft')) modifierCodes.push('ShiftLeft');
        else if (this.recordingPressedCodes.has('ShiftRight')) modifierCodes.push('ShiftRight');
        else modifierCodes.push('ShiftLeft');
      }
      if (e.metaKey) {
        if (this.recordingPressedCodes.has('MetaLeft')) modifierCodes.push('MetaLeft');
        else if (this.recordingPressedCodes.has('MetaRight')) modifierCodes.push('MetaRight');
        else modifierCodes.push('MetaLeft');
      }

      const keyData = {
        code: code,
        key: code,
        display: display,
        ctrlKey: e.ctrlKey,
        altKey: e.altKey,
        shiftKey: e.shiftKey,
        metaKey: e.metaKey,
        modifierCodes: modifierCodes
      };

      this.renderShortcutDisplay(box, keyData);
      this.recordingHadInput = true;
      this.justRecordedMouseClick = true;
      setTimeout(() => {
        this.justRecordedMouseClick = false;
      }, 100);
      this.stopRecording(box, false);
      this.saveCapturedShortcut(box.dataset.action, keyData);
    };

    const contextmenuHandler = (e) => {
      e.preventDefault();
    };

    this.keydownHandlerRef = keydownHandler;
    this.keyupHandlerRef = keyupHandler;
    this.mousedownHandlerRef = mousedownHandler;
    this.contextmenuHandlerRef = contextmenuHandler;

    document.addEventListener('keydown', keydownHandler, true);
    document.addEventListener('keyup', keyupHandler, true);
    document.addEventListener('mousedown', mousedownHandler, true);
    document.addEventListener('contextmenu', contextmenuHandler, true);
  }

  static stopRecording(box, restoreOriginal = true) {
    box.classList.remove('recording');

    if (restoreOriginal) {
      if (box.dataset.key) {
        try {
          const keyData = JSON.parse(box.dataset.key);
          this.renderShortcutDisplay(box, keyData);
        } catch (e) {
          this.renderShortcutDisplay(box, null);
        }
      } else {
        this.renderShortcutDisplay(box, null);
      }
    }

    if (this.keydownHandlerRef) {
      document.removeEventListener('keydown', this.keydownHandlerRef, true);
      this.keydownHandlerRef = null;
    }
    if (this.keyupHandlerRef) {
      document.removeEventListener('keyup', this.keyupHandlerRef, true);
      this.keyupHandlerRef = null;
    }
    if (this.mousedownHandlerRef) {
      document.removeEventListener('mousedown', this.mousedownHandlerRef, true);
      this.mousedownHandlerRef = null;
    }
    if (this.contextmenuHandlerRef) {
      document.removeEventListener('contextmenu', this.contextmenuHandlerRef, true);
      this.contextmenuHandlerRef = null;
    }

    if (this.currentRecordingInput === box) {
      this.currentRecordingInput = null;
    }
  }

  static saveCapturedShortcut(action, keyData) {
    chrome.storage.local.get(['shortcuts'], (items) => {
      const list = items.shortcuts || {};
      list[action] = keyData;
      chrome.storage.local.set({ shortcuts: list });
    });
  }

  static loadShortcutsKeys(items) {
    const list = items.shortcuts || {};
    document.querySelectorAll('.lumina-settings-shortcut-box[data-action]').forEach(box => {
      const action = box.dataset.action;
      const val = list[action];
      if (val && typeof val === 'object') {
        this.renderShortcutDisplay(box, val);
      } else if (typeof val === 'string' && val !== 'None') {
        box.textContent = val;
      } else {
        this.renderShortcutDisplay(box, null);
      }
    });
  }

  static renderQuestionMappings() {
    const list = document.getElementById('lumina-question-mappings-list');
    if (!list) return;
    list.innerHTML = '';

    if (this.questionMappings.length === 0) {
      const emptyState = document.createElement('div');
      emptyState.className = 'lumina-settings-empty-state';
      emptyState.textContent = 'No custom mappings added yet.';
      list.appendChild(emptyState);
      return;
    }

    const temp = document.getElementById('lumina-mappingRowTemplate');
    this.questionMappings.forEach((mapping, idx) => {
      const clone = temp.content.cloneNode(true);
      const displayKey = mapping.keyData ? (mapping.keyData.metaKey ? '⌘' : '') +
        (mapping.keyData.ctrlKey ? 'Ctrl+' : '') +
        (mapping.keyData.altKey ? 'Alt+' : '') +
        (mapping.keyData.shiftKey ? 'Shift+' : '') +
        mapping.keyData.key.toUpperCase()
        : (mapping.key ? mapping.key.toUpperCase() : 'None');
      clone.querySelector('.mapping-number').textContent = displayKey;
      clone.querySelector('.mapping-name').textContent = mapping.name || `Mapping ${idx + 1}`;



      clone.querySelector('.mapping-edit-btn').addEventListener('click', () => {
        this.showMappingForm(idx);
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

  static showAnnotationForm(index = null) {
    const overlay = document.getElementById('lumina-annotation-popup-overlay');
    if (overlay) overlay.style.display = 'flex';

    const indexInput = document.getElementById('lumina-annotation-form-index');
    const shortcutBox = document.getElementById('lumina-annotation-popup-shortcut');
    const palette = document.getElementById('lumina-annotation-popup-color-palette');

    const colors = [
      '#fff59d', // Soft Yellow
      '#ffcc80', // Soft Orange
      '#ef9a9a', // Soft Red
      '#f48fb1', // Soft Pink
      '#ce93d8', // Soft Purple
      '#b39ddb', // Soft Lavender
      '#90caf9', // Soft Blue
      '#80deea', // Soft Cyan
      '#80cbc4', // Soft Teal
      '#a5d6a7', // Soft Green
      '#e6ee9c', // Soft Lime
      '#ffab91'  // Soft Coral
    ];
    let selectedColor = colors[0];

    const renderPalette = (activeColor) => {
      palette.innerHTML = colors.map(c => `
        <div class="swatch ${activeColor === c ? 'active' : ''}" style="background: ${c};" data-color="${c}"></div>
      `).join('');
    };

    palette.addEventListener('click', (e) => {
      const swatch = e.target.closest('.swatch');
      if (swatch) {
        selectedColor = swatch.dataset.color;
        palette.dataset.color = selectedColor;
        renderPalette(selectedColor);
      }
    });

    if (index !== null && index >= 0) {
      const item = this.annotationShortcuts[index];
      indexInput.value = index;
      selectedColor = item.color || colors[0];
      palette.dataset.color = selectedColor;
      renderPalette(selectedColor);

      const keyData = item.keyData || (item.key ? { key: item.key, code: 'Key' + item.key.toUpperCase() } : null);
      this.renderShortcutDisplay(shortcutBox, keyData);
    } else {
      indexInput.value = '';
      selectedColor = colors[0];
      palette.dataset.color = selectedColor;
      renderPalette(selectedColor);

      this.renderShortcutDisplay(shortcutBox, null);
    }
  }

  static hideAnnotationForm() {
    const overlay = document.getElementById('lumina-annotation-popup-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  static saveAnnotation() {
    const indexInput = document.getElementById('lumina-annotation-form-index');
    const shortcutBox = document.getElementById('lumina-annotation-popup-shortcut');
    const palette = document.getElementById('lumina-annotation-popup-color-palette');

    let keyData = null;
    if (shortcutBox.dataset.key) {
      try {
        keyData = JSON.parse(shortcutBox.dataset.key);
      } catch (e) {
        console.error(e);
      }
    }

    if (!keyData) {
      alert('Please record a shortcut.');
      return;
    }

    const color = palette.dataset.color || '#ffeb3b';

    const shortcutObj = {
      key: keyData.key,
      keyData: keyData,
      color: color,
      enabled: true
    };

    const indexVal = indexInput.value;
    if (indexVal !== '') {
      const idx = parseInt(indexVal, 10);
      this.annotationShortcuts[idx] = shortcutObj;
    } else {
      this.annotationShortcuts.push(shortcutObj);
    }

    chrome.storage.local.set({ annotationShortcuts: this.annotationShortcuts }, () => {
      this.renderAnnotationShortcuts();
      this.hideAnnotationForm();
    });
  }

  static renderAnnotationShortcuts() {
    const list = document.getElementById('lumina-annotation-shortcuts-list');
    if (!list) return;
    list.innerHTML = '';

    if (this.annotationShortcuts.length === 0) {
      const emptyState = document.createElement('div');
      emptyState.className = 'lumina-settings-empty-state';
      emptyState.textContent = 'No annotation shortcuts added yet.';
      list.appendChild(emptyState);
      return;
    }

    const temp = document.getElementById('lumina-annotationRowTemplate');
    this.annotationShortcuts.forEach((shortcut, idx) => {
      const clone = temp.content.cloneNode(true);
      const displayKey = shortcut.keyData ? (shortcut.keyData.metaKey ? '⌘' : '') +
        (shortcut.keyData.ctrlKey ? 'Ctrl+' : '') +
        (shortcut.keyData.altKey ? 'Alt+' : '') +
        (shortcut.keyData.shiftKey ? 'Shift+' : '') +
        shortcut.keyData.key.toUpperCase()
        : (shortcut.key ? shortcut.key.toUpperCase() : 'None');

      clone.querySelector('.annotation-number').textContent = displayKey;

      const preview = clone.querySelector('.annotation-color-preview');
      if (preview) preview.style.backgroundColor = shortcut.color;

      clone.querySelector('.annotation-shortcut-text').textContent = 'Highlight';

      clone.querySelector('.annotation-edit-btn').addEventListener('click', () => {
        this.showAnnotationForm(idx);
      });

      clone.querySelector('.annotation-delete-btn').addEventListener('click', () => {
        this.annotationShortcuts.splice(idx, 1);
        chrome.storage.local.set({ annotationShortcuts: this.annotationShortcuts }, () => this.renderAnnotationShortcuts());
      });

      list.appendChild(clone);
    });
  }

  static bindAccountTab() {
    // Google OAuth & Sync bindings
    const googleLoginBtn = document.getElementById('lumina-google-login-btn');
    if (googleLoginBtn) {
      googleLoginBtn.addEventListener('click', async () => {
        try {
          googleLoginBtn.disabled = true;
          const originalHTML = googleLoginBtn.innerHTML;
          googleLoginBtn.innerHTML = 'Signing In...';
          
          if (typeof LuminaAuth !== 'undefined') {
            await LuminaAuth.login();
            if (typeof LuminaSync !== 'undefined') {
              try {
                await LuminaSync.syncData();
              } catch (syncErr) {
                console.error('Initial sync failed:', syncErr);
              }
            }
          }
          googleLoginBtn.innerHTML = originalHTML;
        } catch (e) {
          console.error(e);
          alert('Sign in failed: ' + e.message);
          googleLoginBtn.innerHTML = 'Sign In';
        } finally {
          googleLoginBtn.disabled = false;
        }
      });
    }

    const googleLogoutBtn = document.getElementById('lumina-google-logout-btn');
    if (googleLogoutBtn) {
      googleLogoutBtn.addEventListener('click', async () => {
        if (typeof LuminaAuth !== 'undefined') {
          await LuminaAuth.logout();
        }
      });
    }

    const syncBtn = document.getElementById('lumina-sync-btn');
    if (syncBtn) {
      syncBtn.addEventListener('click', async () => {
        syncBtn.disabled = true;
        const originalHTML = syncBtn.innerHTML;
        syncBtn.innerHTML = 'Syncing...';
        try {
          if (typeof LuminaSync !== 'undefined') {
            await LuminaSync.syncUp();
            LuminaSettingsModal.updateStorageUsage();
          }
        } catch (e) {
          alert('Sync failed: ' + e.message);
        } finally {
          syncBtn.innerHTML = originalHTML;
          syncBtn.disabled = false;
        }
      });
    }

    const authLoggedOut = document.getElementById('lumina-auth-logged-out');
    const authLoggedIn = document.getElementById('lumina-auth-logged-in');
    const userAvatar = document.getElementById('lumina-user-avatar');
    const userName = document.getElementById('lumina-user-name');
    const userEmail = document.getElementById('lumina-user-email');
    const syncStatus = document.getElementById('lumina-sync-status');

    function updateAuthUI(isAuthenticated, user) {
      if (isAuthenticated && user) {
        if (authLoggedOut) authLoggedOut.classList.add('hidden');
        if (authLoggedIn) authLoggedIn.classList.remove('hidden');
        if (userAvatar) userAvatar.src = user.picture || '../../assets/icons/avatar.png';
        if (userName) userName.textContent = user.name || 'User Profile';
        if (userEmail) userEmail.textContent = user.email || '';
      } else {
        if (authLoggedOut) authLoggedOut.classList.remove('hidden');
        if (authLoggedIn) authLoggedIn.classList.add('hidden');
      }
    }

    if (typeof LuminaAuth !== 'undefined') {
      LuminaAuth.addListener(updateAuthUI);
      if (LuminaAuth.isAuthenticated) {
        updateAuthUI(true, LuminaAuth.user);
      }
    }

    if (typeof LuminaSync !== 'undefined') {
      LuminaSync.addListener((status, timestamp) => {
        if (syncStatus) {
          if (timestamp) {
            const timeStr = new Date(timestamp).toLocaleString();
            syncStatus.textContent = `Last synced: ${timeStr}`;
          } else {
            syncStatus.textContent = status;
          }
        }
      });

      if (typeof LuminaAuth !== 'undefined' && LuminaAuth.isAuthenticated) {
        LuminaSync.getLastSyncTime().then(time => {
          if (syncStatus && time !== 'Never') {
            syncStatus.textContent = `Last synced: ${time}`;
          }
        });
      }
    }

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

    document.getElementById('lumina-delete-all-btn').addEventListener('click', async () => {
      if (typeof window.showCustomPopup === 'function') {
        const confirmed = await window.showCustomPopup({
          title: 'Delete All History',
          body: 'Are you sure you want to delete your entire chat history? This action cannot be reversed.',
          confirmLabel: 'Delete',
          isDanger: true
        });
        if (confirmed) {
          if (typeof ChatHistoryManager !== 'undefined' && ChatHistoryManager.clearAllHistory) {
            await ChatHistoryManager.clearAllHistory();
            LuminaSettingsModal.updateStorageUsage();

            const scope = window.LuminaSelectionScope;
            if (scope) {
              scope.renderRecentChatsSidebar();
              scope.resetChat(false);
              scope.resetChat(true);
            }
          }
        }
      } else {
        if (confirm('Are you sure you want to delete your entire chat history? This action cannot be reversed.')) {
          if (typeof ChatHistoryManager !== 'undefined' && ChatHistoryManager.clearAllHistory) {
            await ChatHistoryManager.clearAllHistory();
            LuminaSettingsModal.updateStorageUsage();

            const scope = window.LuminaSelectionScope;
            if (scope) {
              scope.renderRecentChatsSidebar();
              scope.resetChat(false);
              scope.resetChat(true);
            }
          }
        }
      }
    });

    this.setupDropdownInputs('lumina-history-retention-input', 'lumina-history-retention-menu');
  }

  static updateStorageUsage() {
    const textEl = document.getElementById('lumina-storage-usage-text');
    if (!textEl) return;

    chrome.storage.local.get(null, (items) => {
      let dbSize = 0;
      let configSize = 0;

      const chatKeys = new Set();

      // Classify each key into DB vs Config (ignoring Anki keys)
      Object.keys(items).forEach(key => {
        const isAnkiKey = key.startsWith('rot_') || [
          'luminaTemplatesV3', 'luminaBatchHistoryV3', 'lastUsedGenAIModel',
          'lastUsedBatchSize', 'lastUsedDeck', 'lastUsedTemplateId', 'ankiQuickNoteContent'
        ].includes(key);
        if (isAnkiKey) return;

        const valueStr = JSON.stringify(items[key]);
        const sizeBytes = valueStr ? valueStr.length : 0;

        if (key === 'lumina_chat_sessions' || key.startsWith('lumina_session_') || key.startsWith('spotlight_history_')) {
          dbSize += sizeBytes;
          chatKeys.add(key);
        } else {
          configSize += sizeBytes;
        }
      });

      chrome.runtime.sendMessage({ action: 'get_stored_files' }, (response) => {
        let filesSize = 0;
        if (response && response.success && Array.isArray(response.files)) {
          filesSize = response.files.reduce((acc, f) => acc + (f.size || 0), 0);
        }

        const totalBytes = dbSize + filesSize + configSize;

        // Helper: format bytes
        const fmt = (bytes) => {
          if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
          if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
          return `${bytes} B`;
        };

        // Update total header
        textEl.textContent = fmt(totalBytes);

        // Update category list text
        const dbSizeEl = document.getElementById('lumina-storage-db-size');
        const filesSizeEl = document.getElementById('lumina-storage-files-size');
        const configSizeEl = document.getElementById('lumina-storage-config-size');
        if (dbSizeEl) dbSizeEl.textContent = fmt(dbSize);
        if (filesSizeEl) filesSizeEl.textContent = fmt(filesSize);
        if (configSizeEl) configSizeEl.textContent = fmt(configSize);

        // Animate macOS-style storage bar segments
        if (totalBytes > 0) {
          const dbPct = (dbSize / totalBytes * 100).toFixed(2);
          const filesPct = (filesSize / totalBytes * 100).toFixed(2);
          const configPct = (configSize / totalBytes * 100).toFixed(2);

          const barDb = document.getElementById('lumina-storage-bar-db');
          const barFiles = document.getElementById('lumina-storage-bar-files');
          const barConfig = document.getElementById('lumina-storage-bar-config');

          // Brief delay so transition animates on open
          requestAnimationFrame(() => {
            if (barDb) barDb.style.width = `${dbPct}%`;
            if (barFiles) barFiles.style.width = `${filesPct}%`;
            if (barConfig) barConfig.style.width = `${configPct}%`;
          });
        }

        // Build Top 10 largest chat sessions list
        const sessionsListEl = document.getElementById('lumina-storage-sessions-list');
        if (sessionsListEl) {
          const sessionsMetadata = items['lumina_chat_sessions'] || {};
          const sessionList = [];

          Object.keys(sessionsMetadata).forEach(sessionId => {
            const meta = sessionsMetadata[sessionId];
            if (!meta) return;

            const sessionMessages = items[`lumina_session_${sessionId}`];
            const messagesStr = sessionMessages ? JSON.stringify(sessionMessages) : '';
            const metaStr = JSON.stringify(meta);

            let sessionFilesSize = 0;
            if (response && response.success && Array.isArray(response.files)) {
              sessionFilesSize = response.files
                .filter(f => f.sessionId === sessionId)
                .reduce((acc, f) => acc + (f.size || 0), 0);
            }

            const totalSessionBytes = messagesStr.length + metaStr.length + sessionFilesSize;

            sessionList.push({
              id: sessionId,
              title: meta.title || 'Untitled Chat',
              timestamp: meta.timestamp || Date.now(),
              size: totalSessionBytes
            });
          });

          // Sort descending by size, take top 10
          sessionList.sort((a, b) => b.size - a.size);
          const top10 = sessionList.slice(0, 10);

          if (top10.length === 0) {
            sessionsListEl.innerHTML = '<p class="desc-small italic" style="padding: 12px; text-align: center; color: var(--lumina-text-muted);">No chat sessions found.</p>';
          } else {
            sessionsListEl.innerHTML = '';
            top10.forEach(session => {
              const itemEl = document.createElement('div');
              itemEl.className = 'lumina-storage-session-item';
              itemEl.dataset.sessionId = session.id;

              const formattedDate = new Date(session.timestamp).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              });

              const formattedSize = fmt(session.size);

              itemEl.innerHTML = `
                <div class="lumina-storage-session-info">
                  <span class="lumina-storage-session-title" title="${session.title}">${session.title}</span>
                  <span class="lumina-storage-session-date">${formattedDate}</span>
                </div>
                <div class="lumina-storage-session-right">
                  <span class="lumina-storage-session-size">${formattedSize}</span>
                  <button type="button" class="lumina-storage-session-delete" title="Delete Chat Thread">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="3 6 5 6 21 6"></polyline>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                      <line x1="10" y1="11" x2="10" y2="17"></line>
                      <line x1="14" y1="11" x2="14" y2="17"></line>
                    </svg>
                  </button>
                </div>
              `;

              const deleteBtn = itemEl.querySelector('.lumina-storage-session-delete');
              deleteBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (typeof window.showCustomPopup === 'function') {
                  const confirmed = await window.showCustomPopup({
                    title: 'Delete Chat',
                    body: `Are you sure you want to delete the chat thread "${session.title}"?`,
                    confirmLabel: 'Delete',
                    isDanger: true
                  });
                  if (confirmed) {
                    if (typeof ChatHistoryManager !== 'undefined' && ChatHistoryManager.deleteChat) {
                      await ChatHistoryManager.deleteChat(session.id);
                      LuminaSettingsModal.updateStorageUsage();

                      const scope = window.LuminaSelectionScope;
                      if (scope) {
                        scope.renderRecentChatsSidebar();
                        const tabsList = scope.getTabs();
                        const activeIdx = scope.getActiveTabIndex();
                        if (tabsList && activeIdx !== -1 && tabsList[activeIdx] && tabsList[activeIdx].sessionId === session.id) {
                          const isSecondary = tabsList[activeIdx].chatUIInstance && tabsList[activeIdx].chatUIInstance.historyEl && tabsList[activeIdx].chatUIInstance.historyEl.id === 'chat-history-secondary';
                          scope.resetChat(isSecondary);
                        }
                      }
                    }
                  }
                } else {
                  if (confirm(`Are you sure you want to delete the chat thread "${session.title}"?`)) {
                    if (typeof ChatHistoryManager !== 'undefined' && ChatHistoryManager.deleteChat) {
                      await ChatHistoryManager.deleteChat(session.id);
                      LuminaSettingsModal.updateStorageUsage();

                      const scope = window.LuminaSelectionScope;
                      if (scope) {
                        scope.renderRecentChatsSidebar();
                        const tabsList = scope.getTabs();
                        const activeIdx = scope.getActiveTabIndex();
                        if (tabsList && activeIdx !== -1 && tabsList[activeIdx] && tabsList[activeIdx].sessionId === session.id) {
                          const isSecondary = tabsList[activeIdx].chatUIInstance && tabsList[activeIdx].chatUIInstance.historyEl && tabsList[activeIdx].chatUIInstance.historyEl.id === 'chat-history-secondary';
                          scope.resetChat(isSecondary);
                        }
                      }
                    }
                  }
                }
              });

              sessionsListEl.appendChild(itemEl);
            });
          }
        }
      });
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  LuminaSettingsModal.init();
});
