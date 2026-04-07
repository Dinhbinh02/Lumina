/**
 * anki_manager.js
 * Comprehensive management for Decks, Note Types, Fields, and Card Layouts.
 */

(function() {
    const anki = window.anki || new AnkiClient();

    // UI References
    const deckList = document.getElementById('deckList');
    const modelList = document.getElementById('modelList');
    const modelDiveEmpty = document.getElementById('modelDiveEmpty');
    const modelDiveContent = document.getElementById('modelDiveContent');
    const modelFieldsList = document.getElementById('modelFieldsList');
    const modelTemplatesList = document.getElementById('modelTemplatesList');
    const cardTemplateEditor = document.getElementById('cardTemplateEditor');
    
    // Editors
    const templateFrontEditor = document.getElementById('templateFrontEditor');
    const templateBackEditor = document.getElementById('templateBackEditor');
    const templateCssEditor = document.getElementById('templateCssEditor');
    const saveModelChangesBtn = document.getElementById('saveModelChangesBtn');
    const previewModelNoteBtn = document.getElementById('previewModelNoteBtn');

    // Preview Modal Refs
    const cardPreviewModal = document.getElementById('cardPreviewModal');
    const ankiCardContent = document.getElementById('ankiCardContent');
    const ankiPreviewStyle = document.getElementById('ankiPreviewStyle');
    const previewToggles = document.querySelectorAll('.preview-toggle-wrap .toggle-btn');

    // State
    const MANAGER_STATE = {
        selectedModelName: null,
        selectedTemplateName: null,
        templates: [], // HTML templates for selected model
        styling: "", // CSS for selected model
        fields: [] // Fields for selected model
    };

    async function initManager() {
        await loadDecksList();
        await loadModelsList();
        setupEventListeners();
    }

    // --- Decks ---
    async function loadDecksList() {
        try {
            const decks = await anki.invoke('deckNames');
            decks.sort();
            deckList.innerHTML = '';
            
            decks.forEach(fullPath => {
                const parts = fullPath.split('::');
                const level = parts.length - 1;
                const displayName = parts[parts.length - 1];

                const li = document.createElement('li');
                li.className = 'setup-item deck-item';
                li.style.paddingLeft = `${12 + (level * 20)}px`;
                li.dataset.deck = fullPath;
                li.draggable = true;

                li.innerHTML = `
                    <div class="deck-info" style="display: flex; align-items: center; gap: 8px; flex: 1; pointer-events: none;">
                         <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="opacity: 0.5;">
                            <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2v11z"/>
                         </svg>
                         <span>${displayName}</span>
                    </div>
                `;

                li.onclick = () => { /* Select Logic if needed */ };

                setupDeckDragAndDrop(li);
                deckList.appendChild(li);
            });
        } catch (e) { console.error(e); }
    }

    function setupDeckDragAndDrop(el) {
        el.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', el.dataset.deck);
            el.classList.add('dragging');
        });

        el.addEventListener('dragend', () => {
            el.classList.remove('dragging');
            deckList.querySelectorAll('.drag-over').forEach(item => item.classList.remove('drag-over'));
        });

        el.addEventListener('dragover', (e) => {
            e.preventDefault();
            const target = e.target.closest('.deck-item');
            if (target && target !== el) {
                target.classList.add('drag-over');
            }
        });

        el.addEventListener('dragleave', (e) => {
            const target = e.target.closest('.deck-item');
            if (target) {
                target.classList.remove('drag-over');
            }
        });

        el.addEventListener('drop', async (e) => {
            e.preventDefault();
            const draggedName = e.dataTransfer.getData('text/plain');
            const targetEl = e.target.closest('.deck-item');
            const targetName = targetEl ? targetEl.dataset.deck : null;

            if (!targetName || draggedName === targetName) return;

            // Logic like Anki: Rename dragged deck to be a sub-deck of target
            // e.g., Drag "Vocab" into "English" -> "English::Vocab"
            const parts = draggedName.split('::');
            const baseName = parts[parts.length - 1];
            const newName = `${targetName}::${baseName}`;

            try {
                await anki.invoke('changeDeckName', { oldName: draggedName, newName: newName });
                loadDecksList();
            } catch (err) {
                alert("Failed to move deck: " + err);
            }
        });
    }

    // --- Note Types (Models) ---
    async function loadModelsList() {
        try {
            const models = await anki.invoke('modelNames');
            modelList.innerHTML = models.map(m => `
                <li class="setup-item ${MANAGER_STATE.selectedModelName === m ? 'selected' : ''}" data-model="${m}">
                    <span>${m}</span>
                </li>
            `).join('');

            modelList.querySelectorAll('.setup-item').forEach(item => {
                const name = item.dataset.model;
                item.onclick = (e) => {
                    selectModel(name);
                };
            });
        } catch (e) { console.error(e); }
    }


    async function selectModel(name) {
        MANAGER_STATE.selectedModelName = name;
        MANAGER_STATE.selectedTemplateName = null;
        
        // Update UI
        modelList.querySelectorAll('.setup-item').forEach(i => i.classList.toggle('selected', i.dataset.model === name));
        modelDiveEmpty.classList.add('hidden');
        modelDiveContent.classList.remove('hidden');

        await loadModelDetails(name);
    }

    async function loadModelDetails(name) {
        try {
            // Load Fields
            MANAGER_STATE.fields = await anki.invoke('modelFieldNames', { modelName: name });
            renderFields();

            // Load Templates (Card Types)
            MANAGER_STATE.templates = await anki.invoke('modelTemplates', { modelName: name });
            MANAGER_STATE.styling = await anki.invoke('modelStyling', { modelName: name });
            
            renderTemplates();
            
            // Auto-select first template
            if (Object.keys(MANAGER_STATE.templates).length > 0) {
                selectCardTemplate(Object.keys(MANAGER_STATE.templates)[0]);
            }
        } catch (e) { console.error(e); }
    }

    function renderFields() {
        modelFieldsList.innerHTML = MANAGER_STATE.fields.map(f => `
            <div class="field-pill">
                <span>${f}</span>
            </div>
        `).join('');
    }

    function renderTemplates() {
        const names = Object.keys(MANAGER_STATE.templates);
        modelTemplatesList.innerHTML = names.map(name => `
            <div class="template-card ${MANAGER_STATE.selectedTemplateName === name ? 'active' : ''}" data-name="${name}">
                ${name}
            </div>
        `).join('');

        modelTemplatesList.querySelectorAll('.template-card').forEach(card => {
            card.onclick = () => selectCardTemplate(card.dataset.name);
        });
    }

    function selectCardTemplate(name) {
        MANAGER_STATE.selectedTemplateName = name;
        modelTemplatesList.querySelectorAll('.template-card').forEach(c => c.classList.toggle('active', c.dataset.name === name));
        
        const htmlPair = MANAGER_STATE.templates[name];
        templateFrontEditor.value = htmlPair.Front;
        templateBackEditor.value = htmlPair.Back;
        templateCssEditor.value = MANAGER_STATE.styling.css;
    }

    function setupEventListeners() {
        // Sub-nav switching (Front/Back/CSS)
        const subNavItems = document.querySelectorAll('.sub-nav-item');
        subNavItems.forEach(btn => {
            btn.onclick = () => {
                subNavItems.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                const view = btn.dataset.view;
                templateFrontEditor.classList.toggle('hidden', view !== 'front');
                templateBackEditor.classList.toggle('hidden', view !== 'back');
                templateCssEditor.classList.toggle('hidden', view !== 'styling');
            };
        });

        // Preview Note
        previewModelNoteBtn.onclick = () => openCardPreview();

        // Close Preview by clicking outside
        cardPreviewModal.onclick = (e) => {
            if (e.target === cardPreviewModal) {
                cardPreviewModal.classList.add('hidden');
            }
        };

        // Toggle Front/Back in Preview
        previewToggles.forEach(btn => {
            btn.onclick = () => {
                previewToggles.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                renderPreviewCurrentSide();
            };
        });

        // Save Changes
        saveModelChangesBtn.onclick = async () => {
            if (!MANAGER_STATE.selectedModelName || !MANAGER_STATE.selectedTemplateName) return;
            
            saveModelChangesBtn.disabled = true;
            saveModelChangesBtn.textContent = 'Saving...';
            
            try {
                // 1. Update Templates
                const updatedTemplates = {
                    [MANAGER_STATE.selectedTemplateName]: {
                        Front: templateFrontEditor.value,
                        Back: templateBackEditor.value
                    }
                };
                await anki.invoke('updateModelTemplates', {
                    model: {
                        name: MANAGER_STATE.selectedModelName,
                        templates: updatedTemplates
                    }
                });

                // 2. Update Styling
                await anki.invoke('updateModelStyling', {
                    model: {
                        name: MANAGER_STATE.selectedModelName,
                        css: templateCssEditor.value
                    }
                });

                alert('Note Type changes saved successfully!');
                // Refresh local state
                await loadModelDetails(MANAGER_STATE.selectedModelName);
            } catch (e) {
                alert('Save failed: ' + e);
            } finally {
                saveModelChangesBtn.disabled = false;
                saveModelChangesBtn.textContent = 'Save Changes';
            }
        };

        // Create New Deck
        document.getElementById('createNewDeckBtn').onclick = async () => {
            const name = prompt("Enter new Deck name:");
            if (name) {
                await anki.invoke('createDeck', { deck: name });
                loadDecksList();
            }
        };

        // Note Type creation (Simplified as Anki-Connect model creation is complex)
        document.getElementById('createNewModelBtn').onclick = () => {
            alert("To create a new Note Type, please use Anki Desktop's 'Manage Note Types' for best results.");
        };
    }

    // --- Preview Detailed Logic ---
    let CURRENT_PREVIEW_DATA = {
        side: 'front', // 'front' or 'back'
        fields: {}
    };

    async function openCardPreview() {
        if (!MANAGER_STATE.selectedModelName) return;
        
        ankiCardContent.innerHTML = 'Loading preview...';
        cardPreviewModal.classList.remove('hidden');

        try {
            // Pick a note to preview
            const noteIds = await anki.invoke('findNotes', { query: `note:"${MANAGER_STATE.selectedModelName}"` });
            let fieldMap = {};

            if (noteIds && noteIds.length > 0) {
                const notes = await anki.getNotesInfo([noteIds[0]]);
                if (notes[0]) {
                    Object.entries(notes[0].fields).forEach(([k, v]) => {
                        fieldMap[k] = v.value;
                    });
                }
            } else {
                // Mock data if no notes exist
                MANAGER_STATE.fields.forEach(f => {
                    fieldMap[f] = `(Sample ${f})`;
                });
            }

            CURRENT_PREVIEW_DATA.fields = fieldMap;
            ankiPreviewStyle.textContent = templateCssEditor.value;
            renderPreviewCurrentSide();
        } catch (e) {
            ankiCardContent.innerHTML = `<div style="color:red">Preview Error: ${e}</div>`;
        }
    }

    function renderPreviewCurrentSide() {
        const activeBtn = document.querySelector('.preview-toggle-wrap .toggle-btn.active');
        const side = activeBtn ? activeBtn.dataset.side : 'front';
        
        const template = side === 'front' ? templateFrontEditor.value : templateBackEditor.value;
        let html = template;

        // Process field replacements
        Object.entries(CURRENT_PREVIEW_DATA.fields).forEach(([name, val]) => {
            // 1. Handle replacements inside attributes (strip ALL tags)
            // Matches: id="{{Value}}", src="...{{Value}}...", etc.
            const attrRegex = new RegExp(`(=\\s*["'])([^"']*?){{\\s*${name}\\s*}}([^"']*?)(["'])`, 'g');
            const plainValue = val.replace(/<[^>]*>/g, '').trim();
            html = html.replace(attrRegex, `$1$2${plainValue}$3$4`);

            // 2. Handle normal replacements (strip only outer P tags to match Anki's clean look)
            const normalRegex = new RegExp(`{{\\s*${name}\\s*}}`, 'g');
            const cleanVal = val.replace(/^<p>/i, '').replace(/<\/p>$/i, '').trim();
            html = html.replace(normalRegex, cleanVal);
        });

        // Handle FrontSide special tag for Back template
        if (side === 'back') {
            const frontHtml = renderProcessedTemplate('front');
            html = html.replace(/{{FrontSide}}/g, frontHtml);
        }

        ankiCardContent.innerHTML = html;
    }

    function renderProcessedTemplate(side) {
        const tmpl = side === 'front' ? templateFrontEditor.value : templateBackEditor.value;
        let res = tmpl;
        Object.entries(CURRENT_PREVIEW_DATA.fields).forEach(([name, val]) => {
            // Apply similar logic here for nested FrontSide processing
            const attrRegex = new RegExp(`(=\\s*["'])([^"']*?){{\\s*${name}\\s*}}([^"']*?)(["'])`, 'g');
            const plainValue = val.replace(/<[^>]*>/g, '').trim();
            res = res.replace(attrRegex, `$1$2${plainValue}$3$4`);

            const normalRegex = new RegExp(`{{\\s*${name}\\s*}}`, 'g');
            const cleanVal = val.replace(/^<p>/i, '').replace(/<\/p>$/i, '').trim();
            res = res.replace(normalRegex, cleanVal);
        });
        return res;
    }

    // Expose init
    window.initAnkiManager = initManager;
})();
