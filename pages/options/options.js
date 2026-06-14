// Redirect to full tab if loaded inside a popup container
if (chrome.extension.getViews({ type: "popup" }).includes(window) || window.innerWidth < 400) {
  chrome.tabs.create({ url: chrome.runtime.getURL('pages/options/options.html') });
  window.close();
}

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
  let listenersAttached = false;

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


      if (targetTab && targetTab.url && targetTab.url.startsWith('chrome-extension://')) {
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


  function getProviderLogoSvg(id) {
    const norm = (id || '').toLowerCase();

    // OpenAI SVG
    if (norm.includes('openai')) {
      return `<svg fill="#000000" fill-rule="evenodd" height="32" style="flex:none;line-height:1" viewBox="0 0 24 24" width="32" xmlns="http://www.w3.org/2000/svg"><title>OpenAI</title><path d="M9.205 8.658v-2.26c0-.19.072-.333.238-.428l4.543-2.616c.619-.357 1.356-.523 2.117-.523 2.854 0 4.662 2.212 4.662 4.566 0 .167 0 .357-.024.547l-4.71-2.759a.797.797 0 00-.856 0l-5.97 3.473zm10.609 8.8V12.06c0-.333-.143-.57-.429-.737l-5.97-3.473 1.95-1.118a.433.433 0 01.476 0l4.543 2.617c1.309.76 2.189 2.378 2.189 3.948 0 1.808-1.07 3.473-2.76 4.163zM7.802 12.703l-1.95-1.142c-.167-.095-.239-.238-.239-.428V5.899c0-2.545 1.95-4.472 4.591-4.472 1 0 1.927.333 2.712.928L8.23 5.067c-.285.166-.428.404-.428.737v6.898zM12 15.128l-2.795-1.57v-3.33L12 8.658l2.795 1.57v3.33L12 15.128zm1.796 7.23c-1 0-1.927-.332-2.712-.927l4.686-2.712c.285-.166.428-.404.428-.737v-6.898l1.974 1.142c.167.095.238.238.238.428v5.233c0 2.545-1.974 4.472-4.614 4.472zm-5.637-5.303l-4.544-2.617c-1.308-.761-2.188-2.378-2.188-3.948A4.482 4.482 0 014.21 6.327v5.423c0 .333.143.571.428.738l5.947 3.449-1.95 1.118a.432.432 0 01-.476 0zm-.262 3.9c-2.688 0-4.662-2.021-4.662-4.519 0-.19.024-.38.047-.57l4.686 2.71c.286.167.571.167.856 0l5.97-3.448v2.26c0 .19-.07.333-.237.428l-4.543 2.616c-.619.357-1.356.523-2.117.523zm5.899 2.83a5.947 5.947 0 005.827-4.756C22.287 18.339 24 15.84 24 13.296c0-1.665-.713-3.282-1.998-4.448.119-.5.19-.999.19-1.498 0-3.401-2.759-5.947-5.946-5.947-.642 0-1.26.095-1.88.31A5.962 5.962 0 0010.205 0a5.947 5.947 0 00-5.827 4.757C1.713 5.447 0 7.945 0 10.49c0 1.666.713 3.283 1.998 4.448-.119.5-.19 1-.19 1.499 0 3.401 2.759 5.946 5.946 5.946.642 0 1.26-.095 1.88-.309a5.96 5.96 0 004.162 1.713z"></path></svg>`;
    }
    // Anthropic / Claude SVG
    if (norm.includes('anthropic') || norm.includes('claude')) {
      return `<svg height="32" style="flex:none;line-height:1" viewBox="0 0 24 24" width="32" xmlns="http://www.w3.org/2000/svg"><title>Claude</title><path d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z" fill="#D97757" fill-rule="nonzero"></path></svg>`;
    }
    // Gemini SVG
    if (norm.includes('gemini')) {
      return `<svg height="32" style="flex:none;line-height:1" viewBox="0 0 24 24" width="32" xmlns="http://www.w3.org/2000/svg"><title>Gemini</title><path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" fill="#3186FF"></path><path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" fill="url(#lobe-icons-gemini-0-_R_0_)"></path><path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" fill="url(#lobe-icons-gemini-1-_R_0_)"></path><path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" fill="url(#lobe-icons-gemini-2-_R_0_)"></path><defs><linearGradient gradientUnits="userSpaceOnUse" id="lobe-icons-gemini-0-_R_0_" x1="7" x2="11" y1="15.5" y2="12"><stop stop-color="#08B962"></stop><stop offset="1" stop-color="#08B962" stop-opacity="0"></stop></linearGradient><linearGradient gradientUnits="userSpaceOnUse" id="lobe-icons-gemini-1-_R_0_" x1="8" x2="11.5" y1="5.5" y2="11"><stop stop-color="#F94543"></stop><stop offset="1" stop-color="#F94543" stop-opacity="0"></stop></linearGradient><linearGradient gradientUnits="userSpaceOnUse" id="lobe-icons-gemini-2-_R_0_" x1="3.5" x2="17.5" y1="13.5" y2="12"><stop stop-color="#FABC12"></stop><stop offset=".46" stop-color="#FABC12" stop-opacity="0"></stop></linearGradient></defs></svg>`;
    }
    // DeepSeek SVG
    if (norm.includes('deepseek')) {
      return `<svg height="32" style="flex:none;line-height:1" viewBox="0 0 24 24" width="32" xmlns="http://www.w3.org/2000/svg"><title>DeepSeek</title><path d="M23.748 4.482c-.254-.124-.364.113-.512.234-.051.039-.094.09-.137.136-.372.397-.806.657-1.373.626-.829-.046-1.537.214-2.163.848-.133-.782-.575-1.248-1.247-1.548-.352-.156-.708-.311-.955-.65-.172-.241-.219-.51-.305-.774-.055-.16-.11-.323-.293-.35-.2-.031-.278.136-.356.276-.313.572-.434 1.202-.422 1.84.027 1.436.633 2.58 1.838 3.393.137.093.172.187.129.323-.082.28-.18.552-.266.833-.055.179-.137.217-.329.14a5.526 5.526 0 01-1.736-1.18c-.857-.828-1.631-1.742-2.597-2.458a11.365 11.365 0 00-.689-.471c-.985-.957.13-1.743.388-1.836.27-.098.093-.432-.779-.428-.872.004-1.67.295-2.687.684a3.055 3.055 0 01-.465.137 9.597 9.597 0 00-2.883-.102c-1.885.21-3.39 1.102-4.497 2.623C.082 8.606-.231 10.684.152 12.85c.403 2.284 1.569 4.175 3.36 5.653 1.858 1.533 3.997 2.284 6.438 2.14 1.482-.085 3.133-.284 4.994-1.86.47.234.962.327 1.78.397.63.059 1.236-.03 1.705-.128.735-.156.684-.837.419-.961-2.155-1.004-1.682-.595-2.113-.926 1.096-1.296 2.746-2.642 3.392-7.003.05-.347.007-.565 0-.845-.004-.17.035-.237.23-.256a4.173 4.173 0 001.545-.475c1.396-.763 1.96-2.015 2.093-3.517.02-.23-.004-.467-.247-.588zM11.581 18c-2.089-1.642-3.102-2.183-3.52-2.16-.392.024-.321.471-.235.763.09.288.207.486.371.739.114.167.192.416-.113.603-.673.416-1.842-.14-1.897-.167-1.361-.802-2.5-1.86-3.301-3.307-.774-1.393-1.224-2.887-1.298-4.482-.02-.386.093-.522.477-.592a4.696 4.696 0 011.529-.039c2.132.312 3.946 1.265 5.468 2.774.868.86 1.525 1.887 2.202 2.891.72 1.066 1.494 2.082 2.48 2.914.348.292.625.514.891.677-.802.09-2.14.11-3.054-.614zm1-6.44a.306.306 0 01.415-.287.302.302 0 01.2.288.306.306 0 01-.31.307.303.303 0 01-.304-.308zm3.11 1.596c-.2.081-.399.151-.59.16a1.245 1.245 0 01-.798-.254c-.274-.23-.47-.358-.552-.758a1.73 1.73 0 01.016-.588c.07-.327-.008-.537-.239-.727-.187-.156-.426-.199-.688-.199a.559.559 0 01-.254-.078c-.11-.054-.2-.19-.114-.358.028-.054.16-.186.192-.21.356-.202.767-.136 1.146.016.352.144.618.408 1.001.782.391.451.462.576.685.914.176.265.336.537.445.848.067.195-.019.354-.25.452z" fill="#4D6BFE"></path></svg>`;
    }
    // Groq SVG
    if (norm.includes('groq')) {
      return `<svg fill="#f55036" fill-rule="evenodd" height="32" style="flex:none;line-height:1" viewBox="0 0 24 24" width="32" xmlns="http://www.w3.org/2000/svg"><title>Groq</title><path d="M12.036 2c-3.853-.035-7 3-7.036 6.781-.035 3.782 3.055 6.872 6.908 6.907h2.42v-2.566h-2.292c-2.407.028-4.38-1.866-4.408-4.23-.029-2.362 1.901-4.298 4.308-4.326h.1c2.407 0 4.358 1.915 4.365 4.278v6.305c0 2.342-1.944 4.25-4.323 4.279a4.375 4.375 0 01-3.033-1.252l-1.851 1.818A7 7 0 0012.029 22h.092c3.803-.056 6.858-3.083 6.879-6.816v-6.5C18.907 4.963 15.817 2 12.036 2z"></path></svg>`;
    }
    // OpenRouter SVG
    if (norm.includes('openrouter')) {
      return `<svg fill="#4f46e5" fill-rule="evenodd" height="32" style="flex:none;line-height:1" viewBox="0 0 24 24" width="32" xmlns="http://www.w3.org/2000/svg"><title>OpenRouter</title><path d="M16.804 1.957l7.22 4.105v.087L16.73 10.21l.017-2.117-.821-.03c-1.059-.028-1.611.002-2.268.11-1.064.175-2.038.577-3.147 1.352L8.345 11.03c-.284.195-.495.336-.68.455l-.515.322-.397.234.385.23.53.338c.476.314 1.17.796 2.701 1.866 1.11.775 2.083 1.177 3.147 1.352l.3.045c.694.091 1.375.094 2.825.033l.022-2.159 7.22 4.105v.087L16.589 22l.014-1.862-.635.022c-1.386.042-2.137.002-3.138-.162-1.694-.28-3.26-.926-4.881-2.059l-2.158-1.5a21.997 21.997 0 00-.755-.498l-.467-.28a55.927 55.927 0 00-.76-.43C2.908 14.73.563 14.116 0 14.116V9.888l.14.004c.564-.007 2.91-.622 3.809-1.124l1.016-.58.438-.274c.428-.28 1.072-.726 2.686-1.853 1.621-1.133 3.186-1.78 4.881-2.059 1.152-.19 1.974-.213 3.814-.138l.02-1.907z"></path></svg>`;
    }
    // Cerebras SVG
    if (norm.includes('cerebras')) {
      return `<svg fill="currentColor" height="32" style="flex:none;line-height:1" viewBox="0 0 24 24" width="32" xmlns="http://www.w3.org/2000/svg"><title>Cerebras</title><path clip-rule="evenodd" d="M14.121 2.701a9.299 9.299 0 000 18.598V22.7c-5.91 0-10.7-4.791-10.7-10.701S8.21 1.299 14.12 1.299V2.7zm4.752 3.677A7.353 7.353 0 109.42 17.643l-.901 1.074a8.754 8.754 0 01-1.08-12.334 8.755 8.755 0 0112.335-1.08l-.901 1.075zm-2.255.844a5.407 5.407 0 00-5.048 9.563l-.656 1.24a6.81 6.81 0 016.358-12.043l-.654 1.24zM14.12 8.539a3.46 3.46 0 100 6.922v1.402a4.863 4.863 0 010-9.726v1.402z" fill="#F15A29" fill-rule="evenodd"></path><path d="M15.407 10.836a2.24 2.24 0 00-.51-.409 1.084 1.084 0 00-.544-.152c-.255 0-.483.047-.684.14a1.58 1.58 0 00-.84.912c-.074.203-.11.416-.11.631 0 .218.036.43.11.631a1.594 1.594 0 00.84.913c.2.093.43.14.684.14.216 0 .417-.046.602-.135.188-.09.35-.225.475-.392l.928 1.006c-.14.14-.3.261-.482.363a3.367 3.367 0 01-1.083.38c-.17.026-.317.04-.44.04a3.315 3.315 0 01-1.182-.21 2.825 2.825 0 01-.961-.597 2.816 2.816 0 01-.644-.929 2.987 2.987 0 01-.238-1.21c0-.444.08-.847.238-1.21.15-.35.368-.666.643-.929.278-.261.605-.464.962-.596a3.315 3.315 0 011.182-.21c.355 0 .712.068 1.072.204.361.138.685.36.944.649l-.962.97z"></path></svg>`;
    }
    // Mistral SVG
    if (norm.includes('mistral')) {
      return `<svg height="32" style="flex:none;line-height:1" viewBox="0 0 24 24" width="32" xmlns="http://www.w3.org/2000/svg"><title>Mistral</title><path d="M3.428 3.4h3.429v3.428H3.428V3.4zm13.714 0h3.43v3.428h-3.43V3.4z" fill="gold"></path><path d="M3.428 6.828h6.857v3.429H3.429V6.828zm10.286 0h6.857v3.429h-6.857V6.828z" fill="#FFAF00"></path><path d="M3.428 10.258h17.144v3.428H3.428v-3.428z" fill="#FF8205"></path><path d="M3.428 13.686h3.429v3.428H3.428v-3.428zm6.858 0h3.429v3.428h-3.429v-3.428zm6.856 0h3.43v3.428h-3.43v-3.428z" fill="#FA500F"></path><path d="M0 17.114h10.286v3.429H0v-3.429zm13.714 0H24v3.429H13.714v-3.429z" fill="#E10500"></path></svg>`;
    }
    // Together AI SVG
    if (norm.includes('together')) {
      return `<svg height="32" style="flex:none;line-height:1" viewBox="0 0 24 24" width="32" xmlns="http://www.w3.org/2000/svg"><title>together.ai</title><path d="M23.197 4.503A6 6 0 0015 2.307a5.973 5.973 0 00-2.995 4.933l5.996.008v.515h-5.996c.039.937.298 1.87.8 2.74a6 6 0 1010.39-6z" fill="#EF2CC1"></path><path d="M.805 4.5A6 6 0 003 12.697a5.972 5.972 0 005.77.127L5.779 7.627l.446-.257 2.997 5.192A6 6 0 10.804 4.5z" fill="#CAAEF5"></path><path d="M12 23.894a6 6 0 005.999-6c0-2.13-1.1-3.996-2.775-5.06l-3.005 5.189-.444-.258 2.997-5.192A6 6 0 1012 23.894z" fill="#FC4C02"></path></svg>`;
    }
    // Cohere SVG
    if (norm.includes('cohere')) {
      return `<svg height="32" style="flex:none;line-height:1" viewBox="0 0 24 24" width="32" xmlns="http://www.w3.org/2000/svg"><title>Cohere</title><path clip-rule="evenodd" d="M8.128 14.099c.592 0 1.77-.033 3.398-.703 1.897-.781 5.672-2.2 8.395-3.656 1.905-1.018 2.74-2.366 2.74-4.18A4.56 4.56 0 0018.1 1H7.549A6.55 6.55 0 001 7.55c0 3.617 2.745 6.549 7.128 6.549z" fill="#39594D" fill-rule="evenodd"></path><path clip-rule="evenodd" d="M9.912 18.61a4.387 4.387 0 012.705-4.052l3.323-1.38c3.361-1.394 7.06 1.076 7.06 4.715a5.104 5.104 0 01-5.105 5.104l-3.597-.001a4.386 4.386 0 01-4.386-4.387z" fill="#D18EE2" fill-rule="evenodd"></path><path d="M4.776 14.962A3.775 3.775 0 001 18.738v.489a3.776 3.776 0 007.551 0v-.49a3.775 3.775 0 00-3.775-3.775z" fill="#FF7759"></path></svg>`;
    }
    // Grok SVG
    if (norm.includes('grok')) {
      return `<svg fill="#15181a" fill-rule="evenodd" height="32" style="flex:none;line-height:1" viewBox="0 0 24 24" width="32" xmlns="http://www.w3.org/2000/svg"><title>Grok</title><path d="M9.27 15.29l7.978-5.897c.391-.29.95-.177 1.137.272.98 2.369.542 5.215-1.41 7.169-1.951 1.954-4.667 2.382-7.149 1.406l-2.711 1.257c3.889 2.661 8.611 2.003 11.562-.953 2.341-2.344 3.066-5.539 2.388-8.42l.006.007c-.983-4.232.242-5.924 2.75-9.383.06-.082.12-.164.179-.248l-3.301 3.305v-.01L9.267 15.292M7.623 16.723c-2.792-2.67-2.31-6.801.071-9.184 1.761-1.763 4.647-2.483 7.166-1.425l2.705-1.25a7.808 7.808 0 00-1.829-1A8.975 8.975 0 005.984 5.83c-2.533 2.536-3.33 6.436-1.962 9.764 1.022 2.487-.653 4.246-2.34 6.022-.599.63-1.199 1.259-1.682 1.925l7.62-6.815"></path></svg>`;
    }
    if (norm.includes('ollama')) {
      return `<svg fill="#000000" fill-rule="evenodd" height="32" style="flex:none;line-height:1" viewBox="0 0 24 24" width="32" xmlns="http://www.w3.org/2000/svg"><title>Ollama</title><path d="M7.905 1.09c.216.085.411.225.588.41.295.306.544.744.734 1.263.191.522.315 1.1.362 1.68a5.054 5.054 0 012.049-.636l.051-.004c.87-.07 1.73.087 2.48.474.101.053.2.11.297.17.05-.569.172-1.134.36-1.644.19-.52.439-.957.733-1.264a1.67 1.67 0 01.589-.41c.257-.1.53-.118.796-.042.401.114.745.368 1.016.737.248.337.434.769.561 1.287.23.934.27 2.163.115 3.645l.053.04.026.019c.757.576 1.284 1.397 1.563 2.35.435 1.487.216 3.155-.534 4.088l-.018.021.002.003c.417.762.67 1.567.724 2.4l.002.03c.064 1.065-.2 2.137-.814 3.19l-.007.01.01.024c.472 1.157.62 2.322.438 3.486l-.006.039a.651.651 0 01-.747.536.648.648 0 01-.54-.742c.167-1.033.01-2.069-.48-3.123a.643.643 0 01.04-.617l.004-.006c.604-.924.854-1.83.8-2.72-.046-.779-.325-1.544-.8-2.273a.644.644 0 01.18-.886l.009-.006c.243-.159.467-.565.58-1.12a4.229 4.229 0 00-.095-1.974c-.205-.7-.58-1.284-1.105-1.683-.595-.454-1.383-.673-2.38-.61a.653.653 0 01-.632-.371c-.314-.665-.772-1.141-1.343-1.436a3.288 3.288 0 00-1.772-.332c-1.245.099-2.343.801-2.67 1.686a.652.652 0 01-.61.425c-1.067.002-1.893.252-2.497.703-.522.39-.878.935-1.066 1.588a4.07 4.07 0 00-.068 1.886c.112.558.331 1.02.582 1.269l.008.007c.212.207.257.53.109.785-.36.622-.629 1.549-.673 2.44-.05 1.018.186 1.902.719 2.536l.016.019a.643.643 0 01.095.69c-.576 1.236-.753 2.252-.562 3.052a.652.652 0 01-1.269.298c-.243-1.018-.078-2.184.473-3.498l.014-.035-.008-.012a4.339 4.339 0 01-.598-1.309l-.005-.019a5.764 5.764 0 01-.177-1.785c.044-.91.278-1.842.622-2.59l.012-.026-.002-.002c-.293-.418-.51-.953-.63-1.545l-.005-.024a5.352 5.352 0 01.093-2.49c.262-.915.777-1.701 1.536-2.269.06-.045.123-.09.186-.132-.159-1.493-.119-2.73.112-3.67.127-.518.314-.95.562-1.287.27-.368.614-.622 1.015-.737.266-.076.54-.059.797.042zm4.116 9.09c.936 0 1.8.313 2.446.855.63.527 1.005 1.235 1.005 1.94 0 .888-.406 1.58-1.133 2.022-.62.375-1.451.557-2.403.557-1.009 0-1.871-.259-2.493-.734-.617-.47-.963-1.13-.963-1.845 0-.707.398-1.417 1.056-1.946.668-.537 1.55-.849 2.485-.849zm0 .896a3.07 3.07 0 00-1.916.65c-.461.37-.722.835-.722 1.25 0 .428.21.829.61 1.134.455.347 1.124.548 1.943.548.799 0 1.473-.147 1.932-.426.463-.28.7-.686.7-1.257 0-.423-.246-.89-.683-1.256-.484-.405-1.14-.643-1.864-.643zm.662 1.21l.004.004c.12.151.095.37-.056.49l-.292.23v.446a.375.375 0 01-.376.373.375.375 0 01-.376-.373v-.46l-.271-.218a.347.347 0 01-.052-.49.353.353 0 01.494-.051l.215.172.22-.174a.353.353 0 01.49.051zm-5.04-1.919c.478 0 .867.39.867.871a.87.87 0 01-.868.871.87.87 0 01-.867-.87.87.87 0 01.867-.872zm8.706 0c.48 0 .868.39.868.871a.87.87 0 01-.868.871.87.87 0 01-.867-.87.87.87 0 01.867-.872zM7.44 2.3l-.003.002a.659.659 0 00-.285.238l-.005.006c-.138.189-.258.467-.348.832-.17.692-.216 1.631-.124 2.782.43-.128.899-.208 1.404-.237l.01-.001.019-.034c.046-.082.095-.161.148-.239.123-.771.022-1.692-.253-2.444-.134-.364-.297-.65-.453-.813a.628.628 0 00-.107-.09L7.44 2.3zm9.174.04l-.002.001a.628.628 0 00-.107.09c-.156.163-.32.45-.453.814-.29.794-.387 1.776-.23 2.572l.058.097.008.014h.03a5.184 5.184 0 011.466.212c.086-1.124.038-2.043-.128-2.722-.09-.365-.21-.643-.349-.832l-.004-.006a.659.659 0 00-.285-.239h-.004z"></path></svg>`;
    }

    // Default custom icon
    return `<svg viewBox='0 0 24 24' width='32' height='32' style='color: #8b5cf6;' fill='none' stroke='currentColor' stroke-width='2.5'><rect x='2' y='2' width='20' height='20' rx='4'></rect><path d='M12 6v12M6 12h12'></path></svg>`;
  }

  function renderProviders() {
    if (!providerListEl) return;

    const originalParent = providerListEl.parentElement;
    if (originalParent && providerForm) {
      originalParent.appendChild(providerForm);
    }

    providerListEl.innerHTML = '';

    providers.forEach(p => {
      const isDefault = p.id.endsWith('-default');
      const badge = isDefault ? 'default' : 'custom';
      const badgeClass = isDefault ? 'provider-item-badge-default' : 'provider-item-badge-custom';

      const template = document.getElementById('providerItemTemplate');
      const clone = template.content.cloneNode(true);
      const item = clone.querySelector('.provider-item');

      item.dataset.id = p.id;
      item.querySelector('.provider-item-name').textContent = p.name;

      const endpointEl = item.querySelector('.provider-item-endpoint');
      if (endpointEl) {
        endpointEl.textContent = p.endpoint;
      }

      // Inject logo SVG
      const logoContainer = item.querySelector('.m3-provider-logo-container');
      if (logoContainer) {
        logoContainer.innerHTML = getProviderLogoSvg(p.id);
      }

      const statusBadge = item.querySelector('.provider-badge');
      if (statusBadge) {
        const hasKey = p.apiKey && p.apiKey.trim().length > 0;
        statusBadge.textContent = hasKey ? 'Active' : 'Configure';
        statusBadge.className = 'm3-provider-status-badge ' + (hasKey ? 'active' : 'inactive');
      }

      const cardContent = item.querySelector('.provider-item-content');
      if (cardContent) {
        cardContent.addEventListener('click', () => editProvider(p.id));
      }

      const deleteBtn = item.querySelector('.provider-delete-btn');
      if (deleteBtn) {
        if (isDefault) {
          deleteBtn.remove();
        } else {
          deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteProvider(p.id);
          });
        }
      }

      const editBtn = item.querySelector('.provider-edit-btn');
      if (editBtn) {
        editBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          editProvider(p.id);
        });
      }

      providerListEl.appendChild(clone);
    });
  } function populateProviderDropdowns() {

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

    const formContainer = document.getElementById('providerFormContainer');
    if (formContainer) {
      formContainer.appendChild(providerForm);
      formContainer.style.display = 'block';
      providerForm.classList.remove('hidden');
      setTimeout(() => {
        formContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 50);
    }

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

    const formContainer = document.getElementById('providerFormContainer');
    if (formContainer) {
      formContainer.appendChild(providerForm);
      formContainer.style.display = 'block';
      providerForm.classList.remove('hidden');
      setTimeout(() => {
        formContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 50);
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
    providerListEl.querySelectorAll('.provider-item').forEach(el => el.classList.remove('editing-active'));

    const formContainer = document.getElementById('providerFormContainer');
    if (formContainer) {
      formContainer.style.display = 'none';
    }

    const originalParent = providerListEl.parentElement;
    if (originalParent) originalParent.appendChild(providerForm);

    providerForm.classList.add('hidden');
    addProviderBtn.classList.remove('hidden');
  }

  async function initializeProviders() {
    const result = await chrome.storage.local.get(['providers']);

    const defaultProviders = [
      {
        id: 'openai-default',
        name: 'OpenAI',
        type: 'openai',
        endpoint: 'https://api.openai.com/v1/chat/completions',
        apiKey: ''
      },
      {
        id: 'anthropic-default',
        name: 'Anthropic',
        type: 'openai',
        endpoint: 'https://api.anthropic.com/v1/chat/completions',
        apiKey: ''
      },
      {
        id: 'gemini-default',
        name: 'Gemini',
        type: 'gemini',
        endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
        apiKey: ''
      },
      {
        id: 'deepseek-default',
        name: 'DeepSeek',
        type: 'openai',
        endpoint: 'https://api.deepseek.com/v1/chat/completions',
        apiKey: ''
      },
      {
        id: 'groq-default',
        name: 'Groq',
        type: 'openai',
        endpoint: 'https://api.groq.com/v1/chat/completions',
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
        id: 'together-default',
        name: 'Together AI',
        type: 'openai',
        endpoint: 'https://api.together.xyz/v1/chat/completions',
        apiKey: ''
      },
      {
        id: 'cohere-default',
        name: 'Cohere',
        type: 'openai',
        endpoint: 'https://api.cohere.ai/v1/chat/completions',
        apiKey: ''
      },
      {
        id: 'grok-default',
        name: 'Grok',
        type: 'openai',
        endpoint: 'https://api.x.ai/v1/chat/completions',
        apiKey: ''
      },
      {
        id: 'ollama-default',
        name: 'Ollama',
        type: 'openai',
        endpoint: 'http://localhost:11434/v1/chat/completions',
        apiKey: ''
      }
    ];

    let currentProviders = Array.isArray(result.providers) ? result.providers.filter(p => p.id !== 'perplexity-default') : [];

    if (currentProviders.length === 0) {
      currentProviders = defaultProviders;
    } else {
      defaultProviders.forEach((def) => {
        if (!currentProviders.some(p => p.id === def.id)) {
          currentProviders.push(def);
        }
      });
    }

    // Automatically migrate legacy Gemini OpenAI provider to native Gemini provider
    currentProviders.forEach(p => {
      if (p.id === 'gemini-default' && p.type === 'openai') {
        p.type = 'gemini';
        p.endpoint = 'https://generativelanguage.googleapis.com/v1beta/models';
      }
    });

    const order = defaultProviders.map(p => p.id);
    currentProviders.sort((a, b) => {
      const idxA = order.indexOf(a.id);
      const idxB = order.indexOf(b.id);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.name.localeCompare(b.name);
    });

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


  function loadAllSettings() {
    initializeProviders().then(() => {
      renderProviders();
      populateProviderDropdowns();
      populateChainDropdowns();
    });

    chrome.storage.local.get(['globalDefaults', 'modelChains', 'advancedParamsByModel', 'provider', 'model', 'fontSize', 'popupWidth', 'popupHeight', 'responseLanguage', 'disabledDomains', 'theme', 'memoryThreshold', 'compactionSize', 'questionMappings', 'autoHideInputEnabled', 'deepLApiKey', 'temperature', 'topP', 'customParams', 'dictProvider', 'dictModel', 'audioSpeed', 'autoAudio', 'googleClientId', 'githubClientId', 'displayMode', 'dictLanguage', 'translateInputEngine', 'translateEngine', 'historyRetentionMonths', 'enableWebSearch'], (items) => {

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
        audioSpeedInput.value = (items.audioSpeed || 1.1).toFixed(2);
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

    const inputEngine = items.translateInputEngine || 'google';
    const inputEngineRadio = document.querySelector(`input[name="translateInputEngine"][value="${inputEngine}"]`);
    if (inputEngineRadio) inputEngineRadio.checked = true;

    const engine = items.translateEngine || 'google';
    const engineRadio = document.querySelector(`input[name="translateEngine"][value="${engine}"]`);
    if (engineRadio) engineRadio.checked = true;







    const autoHideInputEnabledCheckbox = document.getElementById('autoHideInputEnabled');
    if (autoHideInputEnabledCheckbox) {
      autoHideInputEnabledCheckbox.checked = items.autoHideInputEnabled !== undefined ? items.autoHideInputEnabled : false;
      autoHideInputEnabledCheckbox.addEventListener('change', saveOptions);
    }

    const historyRetentionInput = document.getElementById('options-history-retention-input');
    const historyRetentionMenu = document.getElementById('options-history-retention-menu');
    const retentionOptions = [
      { label: '1 Month', value: '1' },
      { label: '3 Months', value: '3' },
      { label: '6 Months', value: '6' },
      { label: '12 Months', value: '12' },
      { label: 'Forever', value: '0' }
    ];

    if (historyRetentionInput && historyRetentionMenu) {
      const savedVal = items.historyRetentionMonths !== undefined ? items.historyRetentionMonths : 3;
      const matchingOpt = retentionOptions.find(opt => parseInt(opt.value, 10) === parseInt(savedVal, 10));
      historyRetentionInput.value = matchingOpt ? matchingOpt.label : '3 Months';
      historyRetentionInput.dataset.value = matchingOpt ? matchingOpt.value : '3';

      historyRetentionInput.addEventListener('click', (e) => {
        e.stopPropagation();
        const isVisible = historyRetentionMenu.style.display === 'block';
        historyRetentionMenu.style.display = isVisible ? 'none' : 'block';

        if (!isVisible) {
          historyRetentionMenu.innerHTML = retentionOptions.map(opt =>
            `<div class="dropdown-item" data-value="${opt.value}">${opt.label}</div>`
          ).join('');

          historyRetentionMenu.querySelectorAll('.dropdown-item').forEach(item => {
            item.addEventListener('click', async (evt) => {
              evt.stopPropagation();
              historyRetentionInput.value = item.textContent;
              historyRetentionInput.dataset.value = item.dataset.value;
              historyRetentionMenu.style.display = 'none';

              saveOptions();
              if (typeof ChatHistoryManager !== 'undefined' && ChatHistoryManager.cleanupHistoryByAge) {
                await ChatHistoryManager.cleanupHistoryByAge();
                if (typeof updateOptionsStorageUsage === 'function') {
                  updateOptionsStorageUsage();
                }
              }
            });
          });
        }
      });

      document.addEventListener('click', (e) => {
        if (!historyRetentionInput.contains(e.target) && !historyRetentionMenu.contains(e.target)) {
          historyRetentionMenu.style.display = 'none';
        }
      });
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
    listenersAttached = true;
  });
}

loadAllSettings();


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
      const toggleInput = row.querySelector('.annotation-shortcut-toggle');

      if (keyInput) {
        try {
          const keyStr = keyInput.dataset.key;
          const keyData = (keyStr && keyStr !== '') ? JSON.parse(keyStr) : null;

          annotationShortcutsExport.push({
            ...keyData,
            color: activeSwatch ? activeSwatch.dataset.color : '#FFFB78',
            enabled: toggleInput ? toggleInput.checked : true
          });
        } catch (e) {
          console.error('Error parsing annotation key data', e);
        }
      }
    });

    const audioSpeed = parseFloat(audioSpeedInput ? audioSpeedInput.value : 1.1);


    chrome.storage.local.get(['globalDefaults', 'fontSizeByDomain'], (existing) => {
      let globalDefaults = existing.globalDefaults || {};
      let fontSizeByDomain = existing.fontSizeByDomain || {};


      globalDefaults.fontSize = parseFloat(fontSize);
      globalDefaults.theme = theme;


      const questionMappingsExport = [];
      document.querySelectorAll('.mapping-item').forEach((row) => {
        const keyInput = row.querySelector('.mapping-key-input');
        const promptInput = row.querySelector('.mapping-prompt');
        const toggleInput = row.querySelector('.mapping-highlight-toggle');
        const prompt = promptInput ? (promptInput.innerText || promptInput.textContent).trim() : '';

        if (keyInput) {
          try {
            const keyStr = keyInput.dataset.key;
            const keyData = (keyStr && keyStr !== '') ? JSON.parse(keyStr) : null;
            const enableHighlight = toggleInput ? toggleInput.checked : true;

            questionMappingsExport.push({ keyData, prompt, enableHighlight });
          } catch (e) {
            console.error('Error parsing key data', e);

            const enableHighlight = toggleInput ? toggleInput.checked : true;
            questionMappingsExport.push({ keyData: null, prompt, enableHighlight });
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
        translateInputEngine: document.querySelector('input[name="translateInputEngine"]:checked')?.value || 'google',
        translateEngine: document.querySelector('input[name="translateEngine"]:checked')?.value || 'google',
        theme: theme,
        shortcuts: shortcuts,
        annotationShortcuts: annotationShortcutsExport,
        autoHideInputEnabled: document.getElementById('autoHideInputEnabled')?.checked || false,
        audioSpeed: audioSpeed,
        enableWebSearch: true,
        memoryThreshold: parseInt(document.getElementById('memoryThreshold')?.value, 10) || 14,
        maxTokens: document.getElementById('maxTokens')?.value || null,
        historyRetentionMonths: parseInt(document.getElementById('options-history-retention-input')?.dataset.value, 10) !== undefined ? parseInt(document.getElementById('options-history-retention-input')?.dataset.value, 10) : 3
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
            }).catch(() => { });


            chrome.tabs.sendMessage(tab.id, {
              action: 'settings_updated',
              settings: {
                fontSize: fontSize,
                fontSizeByDomain: fontSizeByDomain,
                globalDefaults: globalDefaults,
                theme: theme,
              }
            }).catch(() => { });
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

  document.querySelectorAll('input[name="translateInputEngine"]').forEach(radio => {
    radio.addEventListener('change', saveOptions);
  });

  document.querySelectorAll('input[name="translateEngine"]').forEach(radio => {
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


      let response;
      if (provider.type === 'gemini') {
        const baseUrl = provider.endpoint.includes('/models')
          ? provider.endpoint.split('/models')[0] + '/models'
          : 'https://generativelanguage.googleapis.com/v1beta/models';
        const url = firstKey ? `${baseUrl}?key=${firstKey}` : baseUrl;
        response = await fetch(url);
      } else {
        let modelsUrl = normalizeOpenAICompatibleEndpoint(provider.endpoint, '/models');
        if (provider.type === 'groq' || provider.endpoint.includes('groq.com')) {
          modelsUrl = 'https://api.groq.com/openai/v1/models';
        }
        response = await fetch(modelsUrl, {
          headers: firstKey ? { 'Authorization': `Bearer ${firstKey}` } : {}
        });
      }

      if (response.ok) {
        const data = await response.json();
        if (provider.type === 'gemini') {
          if (data.models) {
            models = data.models.map(m => m.name.replace('models/', ''));
          }
        } else {
          if (data.data) {
            models = data.data.map(m => m.id);
          }
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
    translateInput: { code: 'KeyE', key: 'e', display: 'E', altKey: true },
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

  function renderMappingRow(keyDataOrSimpleKey = null, prompt = '', enableHighlight = null) {
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
    const toggleInput = div.querySelector('.mapping-highlight-toggle');
    const deleteBtn = div.querySelector('.mapping-delete-btn');

    if (keyData) {
      renderShortcutDisplay(keyDisplay, keyData);
    }

    let isTranslation = false;
    if (prompt) {
      const promptLower = prompt.toLowerCase();
      isTranslation =
        promptLower.includes('dịch') ||
        promptLower.includes('translate') ||
        promptLower.includes('vietnamese') ||
        promptLower.includes('tiếng việt') ||
        promptLower.includes('chuyển ngữ') ||
        (promptLower.includes('nghĩa') && (promptLower.includes('việt') || promptLower.includes('viet')));
    }

    if (toggleInput) {
      toggleInput.checked = (enableHighlight !== null && enableHighlight !== undefined) ? (enableHighlight !== false) : !isTranslation;
      toggleInput.addEventListener('change', saveOptions);
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
        renderMappingRow(data, m.prompt, m.enableHighlight);
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
    const toggleInput = div.querySelector('.annotation-shortcut-toggle');
    const deleteBtn = div.querySelector('.annotation-remove-btn');

    if (toggleInput) {
      toggleInput.checked = data ? (data.enabled !== false) : true;
      toggleInput.addEventListener('change', saveOptions);
    }



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
      const defaultAudioSpeed = 1.1;


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
  const syncBtn = document.getElementById('syncBtn');
  const syncStatus = document.getElementById('syncStatus');
  const syncCard = document.getElementById('sync-card');

  function updateAuthUI(isAuthenticated, user) {
    if (isAuthenticated && user) {
      if (authLoggedOut) authLoggedOut.classList.add('hidden');
      if (authLoggedIn) authLoggedIn.classList.remove('hidden');
      if (userAvatar) userAvatar.src = user.picture;
      if (userName) userName.textContent = user.name;
      if (userEmail) userEmail.textContent = user.email;

      LuminaSync.getLastSyncTime().then(time => {
        if (syncStatus && time !== 'Never') {
          syncStatus.textContent = `Last synced: ${time}`;
          syncStatus.style.color = 'var(--text-secondary)';
        }
      });

      if (syncCard) {
        syncCard.style.opacity = '1';
        syncCard.style.pointerEvents = 'auto';
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


  const syncSetupOverlay = document.getElementById('sync-setup-overlay');
  const inputSyncCredentials = document.getElementById('input-sync-credentials');
  const btnUploadSyncJson = document.getElementById('btn-upload-sync-json');
  const btnCancelSyncSetup = document.getElementById('btn-cancel-sync-setup');

  async function loginGoogle() {
    try {
      googleLoginBtn.disabled = true;
      const originalHTML = googleLoginBtn.innerHTML;
      googleLoginBtn.innerHTML = '';
      const template = document.getElementById('signingInStateTemplate');
      googleLoginBtn.appendChild(template.content.cloneNode(true));
      const user = await LuminaAuth.login();
      updateStatus('Signed in successfully', 'success');
      googleLoginBtn.innerHTML = originalHTML;
      
      // Auto sync immediately on login to pull remote data
      try {
        await LuminaSync.syncData();
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      } catch (syncErr) {
        console.error('Initial sync failed:', syncErr);
        updateStatus('Initial sync failed: ' + syncErr.message, 'error');
      }
    } catch (e) {
      console.error(e);
      updateStatus('Sign in failed: ' + e.message, 'error');
      // Always show setup overlay on failure to allow re-uploading file
      syncSetupOverlay.classList.remove("is-hidden");
      googleLoginBtn.innerHTML = 'Sign in with Google';
    } finally {
      googleLoginBtn.disabled = false;
    }
  }

  if (googleLoginBtn) {
    googleLoginBtn.addEventListener('click', loginGoogle);
  }

  if (btnCancelSyncSetup) {
    btnCancelSyncSetup.addEventListener("click", () => {
      syncSetupOverlay.classList.add("is-hidden");
    });
  }

  if (btnUploadSyncJson) {
    btnUploadSyncJson.addEventListener("click", () => {
      inputSyncCredentials.click();
    });
  }

  if (inputSyncCredentials) {
    inputSyncCredentials.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const text = evt.target.result;
          const data = JSON.parse(text);
          const config = data.web || data.installed;
          if (!config || !config.client_id || !config.client_secret) {
            throw new Error("Invalid credentials JSON format. Missing client_id or client_secret.");
          }
          await chrome.storage.local.set({
            client_id: config.client_id,
            client_secret: config.client_secret
          });
          syncSetupOverlay.classList.add("is-hidden");
          updateStatus("Credentials configured successfully!", "success");
          loginGoogle();
        } catch (err) {
          console.error("Error reading credentials file:", err);
          updateStatus(`Configuration failed: ${err.message}`, "error");
        }
      };
      reader.readAsText(file);
      e.target.value = "";
    });
  }

  if (googleLogoutBtn) {
    googleLogoutBtn.addEventListener('click', async () => {
      await LuminaAuth.logout();
      updateStatus('Signed out', 'info');
    });
  }

  if (syncBtn) {
    syncBtn.addEventListener('click', async () => {
      syncBtn.disabled = true;
      try {
        await LuminaSync.syncUp();
        updateStatus('Settings synchronized successfully', 'success');
        setTimeout(() => {
          loadAllSettings();
        }, 1000);
      } catch (e) {
        updateStatus('Sync failed: ' + e.message, 'error');
      } finally {
        syncBtn.disabled = false;
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

  async function updateOptionsStorageUsage() {
    const storageText = document.getElementById('options-storage-usage-text');
    if (!storageText) return;
    const bytes = await ChatHistoryManager.getStorageUsage();
    const mb = (bytes / (1024 * 1024)).toFixed(1);
    storageText.textContent = `${mb} MB`;
  }

  async function renderStoredFilesList() {
    const listContainer = document.getElementById('options-stored-files-list');
    if (!listContainer) return;

    chrome.runtime.sendMessage({ action: 'get_stored_files' }, (response) => {
      if (!response || !response.success || !Array.isArray(response.files)) {
        listContainer.innerHTML = `<p class="m3-body-medium text-secondary italic">Failed to load attachments.</p>`;
        return;
      }

      const files = response.files;
      if (files.length === 0) {
        listContainer.innerHTML = `<p class="m3-body-medium text-secondary italic">No attachments stored locally.</p>`;
        return;
      }

      listContainer.innerHTML = files.map(file => {
        const sizeKB = (file.size / 1024).toFixed(1);
        const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
        const displaySize = file.size > 1024 * 1024 ? `${sizeMB} MB` : `${sizeKB} KB`;
        const modifiedDate = new Date(file.lastModified).toLocaleDateString();

        return `
          <div class="m3-stored-file-item" style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: rgba(0,0,0,0.04); border-radius: 8px; border: 1px solid rgba(0,0,0,0.08);">
            <div style="display: flex; flex-direction: column; gap: 2px; overflow: hidden; margin-right: 12px;">
              <span class="m3-body-medium" style="font-weight: 500; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;" title="${file.displayName}">${file.displayName}</span>
              <span class="m3-body-small text-secondary">Size: ${displaySize} | Updated: ${modifiedDate}</span>
            </div>
            <button type="button" class="m3-btn m3-btn-text text-error delete-stored-file-btn" data-raw-name="${file.rawName}" style="padding: 4px 8px; min-width: auto; height: auto;">
              Delete
            </button>
          </div>
        `;
      }).join('');

      // Add click listeners to delete buttons
      listContainer.querySelectorAll('.delete-stored-file-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const rawName = btn.dataset.rawName;
          if (confirm('Are you sure you want to delete this cached file locally?')) {
            chrome.runtime.sendMessage({ action: 'delete_stored_file', fileName: rawName }, (delRes) => {
              if (delRes && delRes.success) {
                renderStoredFilesList();
              } else {
                alert('Failed to delete file.');
              }
            });
          }
        });
      });
    });
  }

  const optionsDeleteAllBtn = document.getElementById('options-delete-all-btn');
  if (optionsDeleteAllBtn) {
    optionsDeleteAllBtn.addEventListener('click', async () => {
      if (!confirm('Are you sure you want to delete all chat history? This action cannot be undone.')) {
        return;
      }
      optionsDeleteAllBtn.disabled = true;
      optionsDeleteAllBtn.textContent = 'Deleting...';
      try {
        await ChatHistoryManager.clearAllHistory();
        await updateOptionsStorageUsage();
        await renderStoredFilesList();
        alert('All chat history deleted successfully.');
      } catch (err) {
        console.error('Delete all failed:', err);
        alert('Failed to delete history: ' + err.message);
      } finally {
        optionsDeleteAllBtn.disabled = false;
        optionsDeleteAllBtn.textContent = 'Delete All Chats';
      }
    });
  }

  updateOptionsStorageUsage();
  renderStoredFilesList();
});

