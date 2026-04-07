/**
 * anki_generator.js
 * Logic for Tabbed Anki Generator (Templates Table & Batch UI)
 */

document.addEventListener('DOMContentLoaded', async () => {
    // Shared Anki Client (from anki.js)
    const anki = window.anki || new AnkiClient();

    // --- Tab: Templates (UI References) ---
    const templateTableBody = document.getElementById('templateTableBody');
    const templateSearch = document.getElementById('templateSearch');
    const createNewTemplateBtn = document.getElementById('createNewTemplateBtn');

    const templateEditor = document.getElementById('templateEditor');
    const templateEditorTitle = document.getElementById('templateEditorTitle');
    const cancelTemplateBtn = document.getElementById('cancelTemplateBtn');
    const editTemplateName = document.getElementById('editTemplateName');
    const editTemplateGlobalPrompt = document.getElementById('editTemplateGlobalPrompt');
    const editFieldsContainer = document.getElementById('editFieldsContainer');
    const addTemplateFieldBtn = document.getElementById('addTemplateFieldBtn');
    const addExamplePreviewBtn = document.getElementById('addExamplePreviewBtn');
    const examplePreviewsContainer = document.getElementById('examplePreviewsContainer');
    const saveTemplateBtn = document.getElementById('saveTemplateBtn');
    const deleteTemplateBtn = document.getElementById('deleteTemplateBtn');

    const noteTypeBtn = document.getElementById('note-type-btn');
    const noteTypeLabel = document.getElementById('note-type-label');
    const noteTypeDropdown = document.getElementById('note-type-dropdown');

    // --- Tab: Generator (UI References) ---
    const deckSelect = document.getElementById('deckSelect');
    const templateSelect = document.getElementById('templateSelect');
    const batchInput = document.getElementById('batchInput');
    const batchWordCount = document.getElementById('batchWordCount');
    const generateBatchBtn = document.getElementById('generateBatchBtn');
    const batchSizeInput = document.getElementById('batchSizeInput');

    const genModelBtn = document.getElementById('gen-model-btn');
    const genModelLabel = document.getElementById('gen-model-label');
    const genModelDropdown = document.getElementById('gen-model-dropdown');

    const previewContainer = document.getElementById('previewContainer');
    const genCardCountBadge = document.getElementById('genCardCountBadge');
    const historyTableBody = document.getElementById('historyTableBody');

    // --- Example Editor Modal (UI References) ---
    const exampleModal = document.getElementById('exampleModal');
    const exampleFieldsContainer = document.getElementById('exampleFieldsContainer');
    const saveExampleBtn = document.getElementById('saveExampleBtn');
    const regenerateExBtn = document.getElementById('regenerateExBtn');

    // --- Status Modal (UI References) ---
    const statusModal = document.getElementById('statusModal');
    const statusIcon = document.getElementById('statusIcon');
    const statusTitle = document.getElementById('statusTitle');
    const statusMessage = document.getElementById('statusMessage');
    const statusCloseBtn = document.getElementById('statusCloseBtn');
    const statusCopyBtn = document.getElementById('statusCopyBtn');

    // --- State ---
    const STATE = {
        templates: [],
        currentEditTemplate: null, // For side-editor
        batchHistory: [], // [{ id, words: [], cards: [], timestamp }]
        activeBatchId: null, // The batch currently being previewed
        genAIModel: 'Standard', // Default for generator
        genAIProviderId: '',
        decks: [],
        models: [],
        aiModelChains: [],
        isGenerating: false,
        existingWordsCache: new Map(), // Map<"modelName|deckName", Map<word, noteId>>
        isCacheLoading: false
    };

    // --- Initialization ---
    async function init() {
        await initData();
        setupEventListeners();
        setupAIModelSelector();
        checkPendingRegenerate();

        // Auto-reset quota once on init to clear any "Rate Limit vs quota" confusion from previous sessions
        chrome.runtime.sendMessage({ action: 'reset_exhausted_keys' });
    }

    function checkPendingRegenerate() {
        const pending = localStorage.getItem('regenerate_words');
        if (pending && batchInput) {
            batchInput.value = pending;
            batchInput.dispatchEvent(new Event('input'));
            localStorage.removeItem('regenerate_words');
        }
    }

    window.addEventListener('triggerRegenerate', (e) => {
        if (batchInput && e.detail?.words) {
            batchInput.value = e.detail.words;
            batchInput.dispatchEvent(new Event('input'));
            localStorage.removeItem('regenerate_words');
        }
    });

    async function initData() {
        await loadTemplates();
        await loadDecks();
        await loadProviders();
        await loadAIModelChains();
        await loadBatchHistory();
    }

    async function loadProviders() {
        const data = await chrome.storage.local.get(['providers']);
        STATE.providers = data.providers || [];
    }

    async function loadBatchHistory() {
        const data = await chrome.storage.local.get(['luminaBatchHistoryV3']);
        STATE.batchHistory = data.luminaBatchHistoryV3 || [];
        renderHistoryTable();
    }

    async function loadAIModelChains() {
        const data = await chrome.storage.local.get(['modelChains']);
        STATE.aiModelChains = data.modelChains?.text || [];
    }

    const ankiModelBtn = document.getElementById('anki-model-btn');
    const ankiModelLabel = document.getElementById('anki-model-label');
    const ankiModelDropdown = document.getElementById('anki-model-dropdown');

    function setupAIModelSelector() {
        // Selector 1: Template Editor (Anki Note Type)
        if (noteTypeBtn && noteTypeDropdown) {
            noteTypeBtn.onclick = (e) => {
                e.stopPropagation();
                closeAllDropdowns();
                noteTypeDropdown.classList.toggle('active');
            };
            renderNoteTypeDropdown();
        }

        // Selector 2: Template Editor (AI Model)
        if (ankiModelBtn && ankiModelDropdown) {
            ankiModelBtn.onclick = (e) => {
                e.stopPropagation();
                closeAllDropdowns();
                ankiModelDropdown.classList.toggle('active');
            };
            renderModelDropdown(ankiModelDropdown, ankiModelLabel, 'template');
        }

        // Selector 2: Batch Generator
        if (genModelBtn && genModelDropdown) {
            genModelBtn.onclick = (e) => {
                e.stopPropagation();
                closeAllDropdowns();
                genModelDropdown.classList.toggle('active');
            };

            // Load saved model preference or use first available
            chrome.storage.local.get(['lastUsedGenAIModel'], (res) => {
                const savedModel = res.lastUsedGenAIModel;
                if (savedModel && STATE.aiModelChains.some(item => item.model === savedModel.model && item.providerId === savedModel.providerId)) {
                    STATE.genAIModel = savedModel.model;
                    STATE.genAIProviderId = savedModel.providerId;
                    genModelLabel.textContent = savedModel.model;
                } else if (STATE.aiModelChains.length > 0) {
                    STATE.genAIModel = STATE.aiModelChains[0].model;
                    STATE.genAIProviderId = STATE.aiModelChains[0].providerId;
                    genModelLabel.textContent = STATE.aiModelChains[0].model;
                }
                renderModelDropdown(genModelDropdown, genModelLabel, 'generator');
            });
        }

        // Load saved batch size
        chrome.storage.local.get(['lastUsedBatchSize'], (res) => {
            if (res.lastUsedBatchSize && batchSizeInput) {
                batchSizeInput.value = res.lastUsedBatchSize;
            }
        });

        window.addEventListener('click', closeAllDropdowns);
    }

    /**
     * Shows a custom status modal instead of native alert
     */
    function showStatus(type, title, message, missingWords = null) {
        if (!statusModal) return;
        statusIcon.textContent = type === 'success' ? '✅' : (type === 'error' ? '❌' : '⚠️');
        statusTitle.textContent = title;
        statusMessage.textContent = message;

        if (missingWords && missingWords.length > 0) {
            statusCopyBtn.classList.remove('hidden');
            statusCopyBtn.onclick = () => {
                const text = missingWords.join(', ');
                navigator.clipboard.writeText(text).then(() => {
                    const originalText = statusCopyBtn.textContent;
                    statusCopyBtn.textContent = 'Copied!';
                    setTimeout(() => statusCopyBtn.textContent = originalText, 2000);
                });
            };
        } else {
            statusCopyBtn.classList.add('hidden');
        }

        statusModal.classList.remove('hidden');

        // Notify user if tab is hidden
        if (document.hidden && (type === 'success' || type === 'warning')) {
            if (!document.title.startsWith('● ')) {
                document.title = '● ' + document.title;
            }
        }
    }

    // Reset title when user returns
    window.addEventListener('focus', () => {
        if (document.title.startsWith('● ')) {
            document.title = document.title.replace('● ', '');
        }
    });

    if (statusCloseBtn) statusCloseBtn.onclick = () => statusModal.classList.add('hidden');
    if (statusModal) {
        statusModal.onclick = (e) => {
            if (e.target === statusModal) statusModal.classList.add('hidden');
        };
    }

    function closeAllDropdowns() {
        document.querySelectorAll('.lumina-model-dropdown').forEach(d => d.classList.remove('active'));
    }

    function sanitizeRichTextHTML(content = '') {
        if (!content) return '';

        const withoutComments = content
            .replace(/<!--[\s\S]*?-->/g, '')
            .replace(/&lt;!--[\s\S]*?--&gt;/g, '');

        const parser = new DOMParser();
        const doc = parser.parseFromString(`<div>${withoutComments}</div>`, 'text/html');
        const root = doc.body.firstElementChild;
        if (!root) return withoutComments;

        const isEmptyElement = (node) => {
            const hasMedia = node.querySelector('img, video, audio, iframe, canvas, svg, table, hr');
            if (hasMedia) return false;
            const html = (node.innerHTML || '')
                .replace(/<br\s*\/?>(\s*)/gi, '')
                .replace(/&nbsp;/gi, '')
                .replace(/[\u00A0\u200B\u200C\u200D\uFEFF\s]/g, '')
                .trim();
            return !html;
        };

        let changed = true;
        while (changed) {
            changed = false;
            root.querySelectorAll('p, div, span, b, i, u, strong, em, font').forEach((node) => {
                if (isEmptyElement(node)) {
                    node.remove();
                    changed = true;
                }
            });
        }

        while (root.lastElementChild && ['P', 'DIV'].includes(root.lastElementChild.tagName) && isEmptyElement(root.lastElementChild)) {
            root.lastElementChild.remove();
        }

        return root.innerHTML;
    }

    function renderNoteTypeDropdown() {
        if (!noteTypeDropdown) return;
        noteTypeDropdown.innerHTML = '';

        if (STATE.models.length === 0) {
            noteTypeDropdown.innerHTML = '<div style="padding:8px;font-size:0.6875em;color:#999;">No Anki Models found</div>';
            return;
        }

        STATE.models.forEach(modelName => {
            const btn = document.createElement('button');
            btn.className = 'lumina-model-item';
            if (STATE.currentEditTemplate?.model === modelName) btn.classList.add('active');

            btn.innerHTML = `<span class="model-name">${modelName}</span>`;
            btn.onclick = async (e) => {
                e.stopPropagation();
                if (STATE.currentEditTemplate) {
                    STATE.currentEditTemplate.model = modelName;
                    noteTypeLabel.textContent = modelName;

                    // Auto-sync fields with Anki Model fields
                    try {
                        const fieldNames = await anki.invoke('modelFieldNames', { modelName: modelName });
                        if (fieldNames && fieldNames.length > 0) {
                            // Preserve existing prompts if names match
                            const oldFields = [...STATE.currentEditTemplate.fields];
                            
                            // Build new fields list from Anki fields
                            let newFields = fieldNames.map(name => {
                                const existing = oldFields.find(f => f.name === name);
                                return existing || { name: name, prompt: '', example: '' };
                            });

                            // Ensure 'Input' field is present and at the end
                            const inputField = oldFields.find(f => f.name.toLowerCase() === 'input') || { name: 'Input', prompt: '', example: '' };
                            newFields = newFields.filter(f => f.name.toLowerCase() !== 'input');
                            newFields.push(inputField);

                            STATE.currentEditTemplate.fields = newFields;
                            renderEditFields();
                        }
                    } catch (err) {
                        console.error("Failed to fetch field names", err);
                    }

                    renderNoteTypeDropdown();
                }
                closeAllDropdowns();
            };
            noteTypeDropdown.appendChild(btn);
        });
    }

    function renderModelDropdown(dropdown, labelEl, type) {
        dropdown.innerHTML = '';
        if (STATE.aiModelChains.length === 0) {
            dropdown.innerHTML = '<div style="padding:8px;font-size:0.6875em;color:#999;">No AI models configured</div>';
            return;
        }

        STATE.aiModelChains.forEach(item => {
            const btn = document.createElement('button');
            btn.className = 'lumina-model-item';

            let isActive = false;
            if (type === 'template' && STATE.currentEditTemplate) {
                isActive = (STATE.currentEditTemplate.aiModel === item.model && STATE.currentEditTemplate.aiProviderId === item.providerId);
            } else if (type === 'generator') {
                isActive = (STATE.genAIModel === item.model && STATE.genAIProviderId === item.providerId);
            }

            if (isActive) btn.classList.add('active');

            btn.innerHTML = `<span class="model-name">${item.model}</span>`;
            btn.onclick = (e) => {
                e.stopPropagation();
                if (type === 'template' && STATE.currentEditTemplate) {
                    STATE.currentEditTemplate.aiModel = item.model;
                    STATE.currentEditTemplate.aiProviderId = item.providerId;
                } else if (type === 'generator') {
                    STATE.genAIModel = item.model;
                    STATE.genAIProviderId = item.providerId;
                    chrome.storage.local.set({ lastUsedGenAIModel: { model: item.model, providerId: item.providerId } });
                }
                labelEl.textContent = item.model;
                dropdown.classList.remove('active');
                renderModelDropdown(dropdown, labelEl, type);
            };
            dropdown.appendChild(btn);
        });
    }

    async function processBatch(words, tmpl, options = {}) {
                // Simple JSON repair: extract valid objects from a broken array string
                function tryRepairJSONArray(str) {
                    if (!str) return [];
                    
                    // 1. Basic cleanup
                    let cleaned = str.trim()
                        .replace(/^[^{[]+/, '') // Remove anything before first { or [
                        .replace(/[^}\]]+$/, ''); // Remove anything after last } or ]

                    // Helper: Handle bad control characters inside strings (newlines, tabs, etc)
                    const fixControlCharacters = (s) => {
                        // Replace real newlines, carriage returns, and tabs with escaped versions
                        // but only if they appear to be inside quotes (not perfect, but helpful)
                        // Actually, just escaping all control chars in the entire string is often safer for repair
                        return s.replace(/[\x00-\x1F\x7F-\x9F]/g, (match) => {
                            if (match === '\n') return '\\n';
                            if (match === '\r') return '\\r';
                            if (match === '\t') return '\\t';
                            return ''; // Strip others
                        });
                    };

                    // 2. Try to handle unescaped quotes inside values
                    const fixUnescapedQuotes = (s) => {
                        return s.replace(/([^\\])"(?![ \t]*[:,\}\]])/g, '$1\\"');
                    };

                    // 3. Remove trailing commas before } or ]
                    cleaned = cleaned.replace(/,[ \t\r\n]*([}\]])/g, '$1');

                    const tryParse = (s) => {
                        try { return JSON.parse(s); } catch (e) {
                            try { return JSON.parse(fixControlCharacters(s)); } catch (e2) {
                                try { return JSON.parse(fixUnescapedQuotes(s)); } catch (e3) {
                                    try { return JSON.parse(fixControlCharacters(fixUnescapedQuotes(s))); } catch (e4) {
                                        return null;
                                    }
                                }
                            }
                        }
                    };

                    const result = tryParse(cleaned);
                    if (result) return result;

                    // 4. Last resort: Extract individual objects {...}
                    const matches = cleaned.match(/\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\}/g);
                    if (matches && matches.length > 0) {
                        const repaired = [];
                        for (const m of matches) {
                            const obj = tryParse(m);
                            if (obj) repaired.push(obj);
                        }
                        return repaired;
                    }
                    return [];
                }
        // Helper to convert rich text/HTML field data to plain text for the prompt
        const toPromptText = (html) => {
            if (!html) return '';
            const d = document.createElement('div');
            // Remove comments and hidden characters
            d.innerHTML = html.replace(/<!--[\s\S]*?-->/g, '');
            
            // Use markers to preserve formatting boundaries without losing nested content
            d.querySelectorAll('b, strong').forEach(el => { el.prepend('__BS__'); el.append('__BE__'); });
            d.querySelectorAll('i, em').forEach(el => { el.prepend('__IS__'); el.append('__IE__'); });
            d.querySelectorAll('u').forEach(el => { el.prepend('__US__'); el.append('__UE__'); });
            
            d.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
            d.querySelectorAll('p, div').forEach(p => { 
                if (p.textContent.trim()) { p.prepend('\n'); p.append('\n'); }
            });

            let text = d.textContent;

            // Helper to wrap only non-empty lines in markers
            const wrapLines = (content, symbolS, symbolE) => {
                return content.split('\n').map(line => {
                    const trimmed = line.trim();
                    if (!trimmed) return line;
                    // Extract leading/trailing spaces to keep the markers tight around the text
                    const lead = line.match(/^\s*/)[0];
                    const trail = line.match(/\s*$/)[0];
                    return `${lead}${symbolS}${trimmed}${symbolE}${trail}`;
                }).join('\n');
            };

            // Replace boundaries with a line-aware wrapping logic
            const regex = /__([BIU])S__([\s\S]*?)__\1E__/g;
            while (text.match(regex)) {
                text = text.replace(regex, (match, type, content) => {
                    if (type === 'B') return wrapLines(content, '**', '**');
                    if (type === 'I') return wrapLines(content, '*', '*');
                    if (type === 'U') return wrapLines(content, '<u>', '</u>');
                    return content;
                });
            }

            return text.trim().replace(/\n{3,}/g, '\n\n');
        };

        const fieldsForAI = tmpl.fields.filter(f => f.name.toLowerCase() !== 'input');

        const fieldDefinitions = fieldsForAI.map(f => `### FIELD: ${f.name}\nPROMPT:\n${f.prompt}`).join('\n\n');

        const examplesText = (tmpl.examples || []).map((ex, i) => {
            const fieldVals = fieldsForAI.map(f => `${f.name}: ${toPromptText(ex.fieldData[f.name])}`).join('\n');
            return `EXAMPLE ${i + 1} (Word: ${ex.word}):\n${fieldVals}`;
        }).join('\n\n---\n\n');

        const prompt = `
            Task: Generate Anki flashcard content for a batch of words.
            Context: ${tmpl.globalPrompt || 'General learning'}
            Template Name: ${tmpl.name}
            
            STRUCTURE & FORMATTING RULES:
            - You MUST mirror the exact structure and visual style observed in the FEW-SHOT EXAMPLES.
            - RICH TEXT: Replicate the precise formatting patterns (bold, italics, underline) seen in the examples. 
            - MIRROR DISTRIBUTION: If a part of a block is plain text in the examples (like the second line in a header), it MUST be plain text in your output. Do NOT bold whole lines unless the corresponding lines in the example are bolded.
            - PRESERVE STRICT LINE BREAKS: Use double newlines (\n\n) between paragraphs exactly as the examples do.
            - LISTS: Each item starting with a letter (a., b., c.) must be on a NEW LINE as shown.
            - CONTENT ONLY: Do NOT include field names (like "Front:") inside field content.
            - Maintain exactly the same spacing, punctuation, and capitalization style as the examples.
            - IMPORTANT: Every object in the output MUST contain every field listed below.
            
            FIELD DEFINITIONS:
            ${fieldDefinitions}

            ${examplesText ? `FEW-SHOT EXAMPLES (Follow this EXACT format):\n${examplesText}\n\n` : ''}

            Input Words: ${words.join(', ')}

            JSON OUTPUT REQUIREMENT: 
            - Return ONLY a valid JSON array of objects, no extra text, no explanation, no markdown, no comments, no code fences. Strictly output a JSON array.
            - Do not include any explanations, comments, or markdown. Only output a JSON array.
            - Do not use any quotation marks inside field values except for valid JSON string delimiters.
            - Ensure every property is separated by a comma, and all string values are properly quoted. Do not omit or add extra commas or quotes. Double-check your JSON syntax for missing or extra commas or quotation marks before outputting.
            - Each object must correspond to one word.
            - Each object must have a "word" property and properties for EXACTLY these field names: ${fieldsForAI.map(f => f.name).join(', ')}.
            - CRITICAL: Do NOT skip any fields. Every field listed above MUST be included in the JSON.
        `;

        try {
            const currentModel = options.isPreview ? tmpl.aiModel : STATE.genAIModel;
            const currentProvider = options.isPreview ? tmpl.aiProviderId : STATE.genAIProviderId;

            const response = await chrome.runtime.sendMessage({
                action: 'ai_completion',
                prompt: prompt,
                model: currentModel || tmpl.aiModel,
                providerId: currentProvider || tmpl.aiProviderId,
                requestOptions: {
                    keyIndex: options.keyIndex
                }
            });
            if (response.error) {
                throw new Error(response.error);
            }

            let raw = (response.text || "").trim();
            // Remove code fences if present
            raw = raw.replace(/```json/g, '').replace(/```/g, '').trim();
            // Extract only the JSON array using regex (first [ ... ] block)
            const arrayMatch = raw.match(/\[([\s\S]*?)\]/);
            let jsonToParse = raw;
            if (arrayMatch) {
                jsonToParse = '[' + arrayMatch[1] + ']';
            }
            let results;
            try {
                results = JSON.parse(jsonToParse);
            } catch (e) {
                // Try to repair broken JSON array
                results = tryRepairJSONArray(jsonToParse);
                if (!results || !Array.isArray(results) || results.length === 0) {
                    throw e;
                }
            }

            if (results && Array.isArray(results)) {
                // IMPORTANT: We map over the ORIGINAL 'words' array to guarantee order and length.
                return words.map((targetWord, i) => {
                    const normalizedTarget = (targetWord || '').toLowerCase().trim();
                    
                    // Defensive matching:
                    const getValInsensitive = (obj, key) => {
                        if (!obj || typeof obj !== 'object') return null;
                        if (obj[key] !== undefined) return obj[key];
                        const lowerKey = key.toLowerCase();
                        const foundKey = Object.keys(obj).find(k => k.toLowerCase() === lowerKey);
                        return foundKey ? obj[foundKey] : null;
                    };

                    // 1. Try result at the same index
                    let res = results[i];
                    // 2. If index doesn't match word, look for it in the whole batch
                    const resWord = getValInsensitive(res, 'word');
                    if (!res || (resWord && resWord.toLowerCase().trim() !== normalizedTarget)) {
                        const found = results.find(r => {
                            const w = getValInsensitive(r, 'word');
                            return w && w.toLowerCase().trim() === normalizedTarget;
                        });
                        if (found) res = found;
                        else res = res || {}; 
                    }

                    // Respect plainText setting for each field
                    const fieldData = {};
                    tmpl.fields.forEach(f => {
                        let val = getValInsensitive(res, f.name) || '';
                        if (f.name.toLowerCase() === 'input') {
                            val = normalizedTarget;
                        } else if (f.plainText && typeof val === 'string') {
                            val = val.replace(/<[^>]*>/g, '').trim();
                        }
                        fieldData[f.name] = val;
                    });

                    return {
                        id: Math.random().toString(36).substr(2, 9),
                        word: normalizedTarget,
                        fieldData: fieldData,
                        selected: true
                    };
                });
            }
        } catch (e) {
            throw e; 
        }
    }

    async function loadDecks() {
        try {
            STATE.decks = await anki.invoke('deckNames');
            deckSelect.innerHTML = STATE.decks.map(d => `<option value="${d}">${d}</option>`).join('');

            // Restore last used deck
            chrome.storage.local.get(['lastUsedDeck'], (res) => {
                if (res.lastUsedDeck && STATE.decks.includes(res.lastUsedDeck)) {
                    deckSelect.value = res.lastUsedDeck;
                }
            });

            // Also load Note Types (Models)
            STATE.models = await anki.invoke('modelNames');
        } catch (e) {
            console.error("Failed to load decks/models", e);
            deckSelect.innerHTML = '<option value="" disabled>Error loading decks</option>';
        }
    }

    async function loadTemplates() {
        const res = await chrome.storage.local.get(['luminaTemplatesV3', 'lastUsedTemplateId']);
        STATE.templates = res.luminaTemplatesV3 || [getDefaultTemplate()];
        renderTemplatesTable();
        renderTemplateSelect();
        
        // Restore last used template
        if (res.lastUsedTemplateId && STATE.templates.some(t => t.id === res.lastUsedTemplateId)) {
            templateSelect.value = res.lastUsedTemplateId;
        }
    }

    function getDefaultTemplate() {
        return {
            id: 'default-tmpl',
            name: 'Default',
            description: 'Standard vocabulary template',
            globalPrompt: 'Help me learn new vocabulary with clear definitions and examples.',
            model: 'Basic',
            fields: [
                { name: 'Front', prompt: 'Target word/phrase', example: 'Apple' },
                { name: 'Back', prompt: 'Definition and IPA', example: 'Quả táo - /ˈæpl/' },
                { name: 'Input', prompt: '$userInput', example: '' }
            ],
            examples: [],
            created: Date.now(),
            modified: Date.now()
        };
    }

    // --- Templates Tab Logic ---
    function renderTemplatesTable() {
        const query = (templateSearch.value || '').toLowerCase();
        const filtered = STATE.templates.filter(t =>
            t.name.toLowerCase().includes(query) ||
            (t.description || '').toLowerCase().includes(query)
        );

        if (filtered.length === 0) {
            templateTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center">No templates found</td></tr>';
            return;
        }

        templateTableBody.innerHTML = filtered.map(t => `
            <tr data-tmpl-id="${t.id}">
                <td style="width: 15%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${t.name}</td>
                <td style="width: 40%; color: #666; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${t.globalPrompt || '-'}</td>
                <td style="width: 5%; text-align: center;">${t.fields.length}</td>
                <td style="width: 20%;">${formatDate(t.created)}</td>
                <td style="width: 20%;">${formatDate(t.modified)}</td>
            </tr>
        `).join('');
    }

    function openTemplateEditor(id = null) {
        if (!id) {
            // Create New
            STATE.currentEditTemplate = {
                id: 'tmpl-' + Date.now(),
                name: '',
                description: '',
                globalPrompt: '',
                model: STATE.models[0] || 'Basic',
                aiModel: STATE.aiModelChains[0]?.model || '',
                aiProviderId: STATE.aiModelChains[0]?.providerId || '',
                fields: [
                    { name: 'Front', prompt: '', example: '' },
                    { name: 'Back', prompt: '', example: '' }
                ],
                examples: [],
                created: Date.now(),
                modified: Date.now()
            };
            templateEditorTitle.textContent = 'Create Template';
            deleteTemplateBtn.classList.add('hidden');
        } else {
            // Edit Existing
            const found = STATE.templates.find(t => t.id === id);
            STATE.currentEditTemplate = JSON.parse(JSON.stringify(found));
            templateEditorTitle.textContent = 'Edit Template';
            deleteTemplateBtn.classList.remove('hidden');
        }

        editTemplateName.value = STATE.currentEditTemplate.name;
        editTemplateGlobalPrompt.value = STATE.currentEditTemplate.globalPrompt || '';

        // Note Type setup
        noteTypeLabel.textContent = STATE.currentEditTemplate.model || 'Basic';
        renderNoteTypeDropdown();

        // AI Model Setup
        const selectedAiModel = STATE.aiModelChains.find(m =>
            m.model === STATE.currentEditTemplate.aiModel &&
            m.providerId === STATE.currentEditTemplate.aiProviderId
        ) || STATE.aiModelChains[0];

        if (selectedAiModel) {
            STATE.currentEditTemplate.aiModel = selectedAiModel.model;
            STATE.currentEditTemplate.aiProviderId = selectedAiModel.providerId;
            ankiModelLabel.textContent = selectedAiModel.model;
        } else {
            ankiModelLabel.textContent = 'Select AI Model';
        }

        renderModelDropdown(ankiModelDropdown, ankiModelLabel, 'template');
        renderEditFields();
        renderExamplePreviews();
        templateEditor.classList.add('open');
    }

    function renderEditFields() {
        editFieldsContainer.innerHTML = '';
        STATE.currentEditTemplate.fields.forEach((field, index) => {
            const isProtected = index < 2; // Front/Back PROTECTED
            const isInput = field.name.toLowerCase() === 'input';

            const header = document.createElement('div');
            header.className = 'field-row-header';
            header.style.marginBottom = '8px';
            header.style.display = 'flex';
            header.style.alignItems = 'center';
            header.style.gap = '8px';
            header.innerHTML = `
                <input type="text" class="field-name-input" value="${field.name}" placeholder="Field Name" data-index="${index}" ${isProtected || isInput ? 'readonly' : ''}>
                <div style="display: flex; gap: 6px;">
                    ${!isProtected && !isInput ? `<button class="icon-btn-text danger delete-edit-field-btn" data-index="${index}">Delete</button>` : ''}
                </div>
            `;

            const setup = document.createElement('div');
            setup.className = 'setup-group';
            setup.style.marginBottom = '20px';
            if (isInput) {
                setup.innerHTML = `
                    <textarea class="field-prompt-input" readonly data-index="${index}">$userInput</textarea>
                    <div style="font-size:0.6875em; color:#888; margin-top:4px;">This field automatically uses the input word and cannot be edited.</div>
                `;
            } else {
                setup.innerHTML = `
                    <textarea class="field-prompt-input" placeholder="Rules for this field..." data-index="${index}">${field.prompt}</textarea>
                `;
            }

            editFieldsContainer.appendChild(header);
            editFieldsContainer.appendChild(setup);
        });

        // Bind name/prompt events
        editFieldsContainer.querySelectorAll('.field-name-input').forEach(el => {
            el.addEventListener('input', (e) => STATE.currentEditTemplate.fields[e.target.dataset.index].name = e.target.value);
        });
        editFieldsContainer.querySelectorAll('.field-prompt-input').forEach(el => {
            el.addEventListener('input', (e) => STATE.currentEditTemplate.fields[e.target.dataset.index].prompt = e.target.value);
        });
        editFieldsContainer.querySelectorAll('.delete-edit-field-btn').forEach(el => {
            el.addEventListener('click', (e) => {
                const idx = parseInt(e.target.closest('button').dataset.index);
                STATE.currentEditTemplate.fields.splice(idx, 1);
                renderEditFields();
            });
        });


    }

    function setupRichText(el, onChange) {
        if (!el) return;

        el.addEventListener('input', () => {
            if (onChange) onChange(el.innerHTML);
        });

        // 1. Keyboard Shortcuts & Formatting
        el.addEventListener('keydown', (e) => {
            // Shortcuts: Ctrl+B, Ctrl+I, Ctrl+U
            if (e.metaKey || e.ctrlKey) {
                if (e.key === 'b') { e.preventDefault(); document.execCommand('bold', false, null); }
                if (e.key === 'i') { e.preventDefault(); document.execCommand('italic', false, null); }
                if (e.key === 'u') { e.preventDefault(); document.execCommand('underline', false, null); }
            }

            // Bullet points: '-' followed by space at start of line
            if (e.key === ' ') {
                try {
                    const selection = window.getSelection();
                    if (selection.rangeCount > 0) {
                        const range = selection.getRangeAt(0);
                        const text = range.startContainer.textContent || '';
                        const offset = range.startOffset;

                        if (offset > 0 && text[offset - 1] === '-') {
                            const beforeDash = text.substring(0, offset - 1).trim();
                            if (beforeDash === '' || beforeDash.endsWith('\n')) {
                                e.preventDefault();
                                document.execCommand('delete', false, null);
                                document.execCommand('insertUnorderedList', false, null);
                            }
                        }
                    }
                } catch (err) {
                    // Ignore selection errors on vanished nodes
                }
            }
        });

        // 2. Paste Hygiene (Sanitization)
        el.addEventListener('paste', (e) => {
            e.preventDefault();
            const text = e.clipboardData.getData('text/plain');
            const html = e.clipboardData.getData('text/html');

            if (html) {
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');

                const sanitize = (body) => {
                    // Remove ALL comments robustly
                    const comments = [];
                    const iterator = doc.createNodeIterator(body, NodeFilter.SHOW_COMMENT, null, false);
                    let n;
                    while (n = iterator.nextNode()) comments.push(n);
                    comments.forEach(c => c.remove());

                    // Convert styles to semantic tags
                    body.querySelectorAll('*').forEach(el => {
                        const style = el.getAttribute('style') || '';
                        if (style.includes('font-weight:700') || style.includes('font-weight:bold') || style.includes('700')) {
                            const b = doc.createElement('b');
                            while (el.firstChild) b.appendChild(el.firstChild);
                            el.appendChild(b);
                        }
                        if (style.includes('font-style:italic') || style.includes('italic')) {
                            const i = doc.createElement('i');
                            while (el.firstChild) i.appendChild(el.firstChild);
                            el.appendChild(i);
                        }
                    });

                    // Remove all attributes
                    body.querySelectorAll('*').forEach(el => {
                        while (el.attributes.length > 0) el.removeAttribute(el.attributes[0].name);
                    });

                    const flatten = (node) => {
                        const children = Array.from(node.childNodes);
                        for (const child of children) {
                            if (child.nodeType === 1) {
                                const tag = child.tagName;
                                if (['SPAN', 'FONT', 'META', 'STYLE', 'LINK'].includes(tag)) {
                                    while (child.firstChild) node.insertBefore(child.firstChild, child);
                                    child.remove();
                                    flatten(node);
                                    return;
                                }
                                if (['B', 'I', 'U', 'STRONG', 'EM'].includes(tag)) {
                                    const hasBlock = Array.from(child.childNodes).some(n => n.nodeType === 1 && ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'UL', 'OL', 'LI'].includes(n.tagName));
                                    if (hasBlock) {
                                        while (child.firstChild) node.insertBefore(child.firstChild, child);
                                        child.remove();
                                        flatten(node);
                                        return;
                                    }
                                }
                                if (tag === 'DIV') {
                                    const p = doc.createElement('p');
                                    while (child.firstChild) p.appendChild(child.firstChild);
                                    node.replaceChild(p, child);
                                    flatten(p);
                                    continue;
                                }
                                flatten(child);
                            }
                        }
                    };
                    flatten(body);

                    const finalChildren = Array.from(body.childNodes);
                    let currentPara = null;
                    finalChildren.forEach(node => {
                        const isBlock = node.nodeType === 1 && ['P', 'H1', 'H2', 'H3', 'H4', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'TABLE', 'PRE', 'BR'].includes(node.tagName);
                        if (isBlock) {
                            currentPara = null;
                            if (node.tagName === 'BR') node.remove();
                        } else {
                            if (node.nodeType === 3 && !node.textContent.trim()) {
                                node.remove();
                                return;
                            }
                            if (!currentPara) {
                                currentPara = doc.createElement('p');
                                body.insertBefore(currentPara, node);
                            }
                            currentPara.appendChild(node);
                        }
                    });

                    let changed = true;
                    while (changed) {
                        changed = false;
                        body.querySelectorAll('p, b, i, u, strong, em, span').forEach(el => {
                            const content = el.innerHTML.replace(/&nbsp;|\s/g, '').trim();
                            if (!content || content === '<br>') {
                                el.remove();
                                changed = true;
                            }
                        });
                    }
                };

                sanitize(doc.body);
                document.execCommand('insertHTML', false, sanitizeRichTextHTML(doc.body.innerHTML));
            } else {
                document.execCommand('insertText', false, sanitizeRichTextHTML(text));
            }
        });
    }

    function renderExamplePreviews() {
        examplePreviewsContainer.innerHTML = '';
        const examples = STATE.currentEditTemplate.examples || [];

        examples.forEach((ex, idx) => {
            const card = document.createElement('div');
            card.className = 'example-preview-card';
            card.innerHTML = `
                <div class="example-header">
                    <div class="example-title">Example #${idx + 1}: ${ex.word || '(Sample Word)'}</div>
                    <div class="example-actions">
                        <button class="icon-btn-text edit-example-btn" data-index="${idx}">Edit</button>
                        <button class="icon-btn-text danger delete-example-btn" data-index="${idx}">Delete</button>
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" class="chevron-icon"><path d="M18 9l-6 6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    </div>
                </div>
                <div class="example-content">
                    ${STATE.currentEditTemplate.fields.map(field => `
                        <div class="example-field">
                            <div class="example-field-label">${field.name}</div>
                            <div class="rich-text">${renderMarkdown(ex.fieldData[field.name] || '')}</div>
                        </div>
                    `).join('')}
                </div>
            `;

            // Toggle expansion
            card.querySelector('.example-header').onclick = (e) => {
                if (e.target.closest('button')) return;
                card.classList.toggle('expanded');
                const chevron = card.querySelector('.chevron-icon');
                if (card.classList.contains('expanded')) {
                    chevron.style.transform = 'rotate(180deg)';
                } else {
                    chevron.style.transform = 'rotate(0deg)';
                }
            };

            // Edit button
            card.querySelector('.edit-example-btn').onclick = (e) => {
                e.stopPropagation();
                openExampleModal(idx);
            };

            // Delete button
            card.querySelector('.delete-example-btn').onclick = (e) => {
                e.stopPropagation();
                if (!confirm('Delete this example?')) return;
                STATE.currentEditTemplate.examples.splice(idx, 1);
                renderExamplePreviews();
            };

            examplePreviewsContainer.appendChild(card);
        });
    }

    async function openExampleModal(index = -1) {
        let draftExample;
        let isNew = index === -1;

        // Sub-function to render fields dynamically
        const renderFields = (example) => {
            exampleFieldsContainer.innerHTML = '';

            // Map template fields to example data
            STATE.currentEditTemplate.fields.forEach(field => {
                const group = document.createElement('div');
                group.className = 'modal-group';

                const isInput = field.name.toLowerCase() === 'input';
                const isPlain = !!field.plainText || isInput;

                let displayValue = example.fieldData[field.name] || '';
                if (isInput) {
                    displayValue = (example.word || '').toLowerCase().trim();
                } else if (isPlain) {
                    displayValue = displayValue.replace(/<[^>]*>/g, '').trim();
                } else {
                    // Luôn loại bỏ <p> rỗng trước khi render và không renderMarkdown ở đây
                    displayValue = sanitizeRichTextHTML(displayValue);
                }

                group.innerHTML = `
                    <div class="modal-group-header">
                        <label>${field.name}</label>
                        ${!isInput ? `
                        <div class="switch-group">
                            <span>Rich Text</span>
                            <label class="switch">
                                <input type="checkbox" class="modal-richtext-toggle" data-field="${field.name}" ${isPlain ? '' : 'checked'}>
                                <span class="slider"></span>
                            </label>
                        </div>
                        ` : ''}
                    </div>
                    <div class="field-editor-wrap" data-field="${field.name}">
                        ${isPlain
                        ? `<textarea class="plain-text-field edit-ex-field" data-field="${field.name}" ${isInput ? 'readonly placeholder="$userInput"' : ''}>${displayValue}</textarea>`
                        : `<div class="rich-text edit-ex-field" contenteditable="true" data-field="${field.name}">${renderMarkdown(displayValue)}</div>`
                    }
                    </div>
                `;
                exampleFieldsContainer.appendChild(group);

                if (isInput) return; // No listeners needed for read-only input

                // Re-render field when toggle changes
                const toggle = group.querySelector('.modal-richtext-toggle');
                toggle.onchange = (e) => {
                    const rich = e.target.checked;
                    const fieldConfig = STATE.currentEditTemplate.fields.find(f => f.name === field.name);
                    if (fieldConfig) fieldConfig.plainText = !rich;

                    const wrap = group.querySelector('.field-editor-wrap');
                    const oldInput = wrap.querySelector('.edit-ex-field');
                    const currentVal = oldInput.tagName === 'TEXTAREA' ? oldInput.value : oldInput.innerHTML;

                    if (rich) {
                        wrap.innerHTML = `<div class="rich-text edit-ex-field" contenteditable="true" data-field="${field.name}">${renderMarkdown(currentVal)}</div>`;
                        setupRichText(wrap.querySelector('.rich-text'), (val) => {
                            example.fieldData[field.name] = val;
                        });
                    } else {
                        const plain = currentVal.replace(/<[^>]*>/g, '').trim();
                        wrap.innerHTML = `<textarea class="plain-text-field edit-ex-field" data-field="${field.name}">${plain}</textarea>`;
                        wrap.querySelector('textarea').oninput = (ev) => {
                            example.fieldData[field.name] = ev.target.value;
                        };
                    }
                };

                // Initial link
                const fieldInput = group.querySelector('.edit-ex-field');
                if (!isPlain) {
                    setupRichText(fieldInput, (newContent) => {
                        example.fieldData[field.name] = newContent;
                    });
                } else {
                    fieldInput.oninput = (e) => {
                        example.fieldData[field.name] = e.target.value;
                    };
                }
                document.execCommand('defaultParagraphSeparator', false, 'p');
            });
        };

        if (isNew) {
            if ((STATE.currentEditTemplate.examples || []).length >= 3) return alert('Max 3 examples allowed.');

            // Sync latest Prompt/Rules from UI before generating
            STATE.currentEditTemplate.globalPrompt = editTemplateGlobalPrompt.value;

            const sampleWord = prompt("Enter a word to generate an example:", "Knowledge");
            if (!sampleWord) return;

            // Show a temporary loading bar in the container
            const loadingBar = document.createElement('div');
            loadingBar.className = 'example-preview-card loading';
            loadingBar.innerHTML = `<div style="display: flex; align-items: center; gap: 8px; font-size: 0.8125em; font-weight: 620;"><div class="spinner-small"></div> Generating example...</div>`;
            examplePreviewsContainer.appendChild(loadingBar);

            try {
                const res = await processBatch([sampleWord], STATE.currentEditTemplate, { isPreview: true });
                loadingBar.remove();
                if (res && res[0]) {
                    draftExample = res[0];
                    // Save immediately after generation to prevent loss
                    if (isNew) {
                        if (!STATE.currentEditTemplate.examples) STATE.currentEditTemplate.examples = [];
                        STATE.currentEditTemplate.examples.push(draftExample);
                        index = STATE.currentEditTemplate.examples.length - 1;
                        isNew = false;
                        renderExamplePreviews();
                    }
                } else {
                    return alert('Failed to generate example.');
                }
            } catch (e) {
                console.error(e);
                loadingBar.remove();
                return alert('Generate example failed.');
            }
        } else {
            // Clone the existing example to avoid direct mutation
            const original = STATE.currentEditTemplate.examples[index];
            draftExample = JSON.parse(JSON.stringify(original));
        }

        renderFields(draftExample);

        // Regenerate Logic
        regenerateExBtn.onclick = async () => {
            const inputEl = exampleFieldsContainer.querySelector('textarea[data-field="Input"], textarea[data-field="input"]');
            const word = inputEl ? inputEl.value.trim() : draftExample.word;
            if (!word) return alert('Enter a word first.');

            regenerateExBtn.disabled = true;
            regenerateExBtn.innerText = 'Regenerating...';

            try {
                const res = await processBatch([word], STATE.currentEditTemplate, { isPreview: true });
                if (res && res[0]) {
                    draftExample = res[0];
                    if (!isNew && index !== -1) {
                        STATE.currentEditTemplate.examples[index] = draftExample;
                        renderExamplePreviews();
                        chrome.storage.local.set({ luminaTemplatesV3: STATE.templates });
                    }
                    renderFields(draftExample);
                } else {
                    alert('Regenerate failed.');
                }
            } catch (e) {
                console.error(e);
                alert('Regenerate error.');
            } finally {
                regenerateExBtn.disabled = false;
                regenerateExBtn.innerText = 'Regenerate';
            }
        };

        saveExampleBtn.onclick = () => {
            const inputEl = exampleFieldsContainer.querySelector('textarea[data-field="Input"], textarea[data-field="input"]');
            if (inputEl) draftExample.word = inputEl.value.toLowerCase().trim();
            // Final sync for any unsaved changes in fields
            exampleFieldsContainer.querySelectorAll('.edit-ex-field').forEach(el => {
                const fieldName = el.dataset.field;
                if (el.tagName === 'TEXTAREA') {
                    draftExample.fieldData[fieldName] = el.value.trim();
                } else {
                    draftExample.fieldData[fieldName] = sanitizeRichTextHTML(el.innerHTML);
                }
            });

            if (!STATE.currentEditTemplate.examples) STATE.currentEditTemplate.examples = [];

            if (isNew) {
                STATE.currentEditTemplate.examples.push(draftExample);
            } else {
                STATE.currentEditTemplate.examples[index] = draftExample;
            }

            exampleModal.classList.add('hidden');
            renderExamplePreviews();
            // Automatically save to storage when saving example
            chrome.storage.local.set({ luminaTemplatesV3: STATE.templates });
        };

        exampleModal.classList.remove('hidden');
    }

    async function saveTemplate() {
        const name = editTemplateName.value.trim();
        if (!name) return alert('Please enter a template name.');

        templateEditor.classList.remove('open'); // Close panel immediately for better UX

        STATE.currentEditTemplate.name = name;
        STATE.currentEditTemplate.globalPrompt = editTemplateGlobalPrompt.value;
        // aiModel and aiProviderId are updated via dropdown selection
        STATE.currentEditTemplate.modified = Date.now();

        const index = STATE.templates.findIndex(t => t.id === STATE.currentEditTemplate.id);
        if (index > -1) {
            STATE.templates[index] = STATE.currentEditTemplate;
        } else {
            STATE.templates.push(STATE.currentEditTemplate);
        }

        await chrome.storage.local.set({ luminaTemplatesV3: STATE.templates });
        initData(); // Refresh both table and Generator dropdown without re-binding events
    }

    async function deleteTemplate() {
        if (!STATE.currentEditTemplate) return;
        if (!confirm(`Delete template "${STATE.currentEditTemplate.name}"?`)) return;

        STATE.templates = STATE.templates.filter(t => t.id !== STATE.currentEditTemplate.id);
        await chrome.storage.local.set({ luminaTemplatesV3: STATE.templates });
        templateEditor.classList.remove('open');
        init();
    }

    // --- Generator Tab Logic ---
    function renderTemplateSelect() {
        templateSelect.innerHTML = STATE.templates.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
    }

    async function handleGenerate() {
        if (STATE.isGenerating) {
            STATE.isGenerating = false;
            return;
        }

        const userInput = batchInput.value.trim();
        if (!userInput) return alert('Please enter some words.');

        const currentTmpl = STATE.templates.find(t => t.id === templateSelect.value);
        if (!currentTmpl) return alert('Please select a template.');

        // 1. Normalize words (lowercase and trimmed)
        const rawWords = userInput.split(/[,\n]/).map(s => s.trim()).filter(s => s);
        if (rawWords.length === 0) return;

        // Unique words in this request (case-insensitive)
        const uniqueWordsMap = new Map();
        rawWords.forEach(w => {
            const normalized = w.toLowerCase();
            if (!uniqueWordsMap.has(normalized)) uniqueWordsMap.set(normalized, w);
        });
        const wordsToGenerate = Array.from(uniqueWordsMap.keys());
        const wordsToGenerateSet = new Set(wordsToGenerate);

        // Button Loading State
        const originalBtnText = generateBatchBtn.innerHTML;
        STATE.isGenerating = true;
        generateBatchBtn.disabled = false; // Keep enabled so user can click to STOP
        
        const modelName = currentTmpl?.model || 'Basic';
        const cacheKey = `${modelName}`; // Global check for the Note Type across all decks

        const existingNoteIds = {}; // Map word -> noteId

        try {
            // Check if we need to load/refresh cache
            if (!STATE.existingWordsCache.has(cacheKey)) {
                generateBatchBtn.innerHTML = `<span class="spinner-small"></span> Initializing check...`;
                const startTime = Date.now();
                
                // 1. Fetch ALL note IDs for this model across ALL decks (fast)
                const query = `note:"${modelName}"`;
                const allIds = await anki.findNoteIds(query);
                
                const wordMap = new Map();
                if (allIds.length > 0) {
                    generateBatchBtn.innerHTML = `<span class="spinner-small"></span> Checking ${allIds.length} existing cards...`;
                    
                    // 2. Fetch info in large chunks to build cache
                    const INFO_CHUNK = 1000;
                    for (let i = 0; i < allIds.length; i += INFO_CHUNK) {
                        const chunk = allIds.slice(i, i + INFO_CHUNK);
                        const info = await anki.getNotesInfo(chunk);
                        info.forEach(n => {
                            const rawVal = (n.fields.Input?.value || n.fields.Front?.value || '').replace(/<[^>]*>/g, '');
                            const val = rawVal.trim().toLowerCase();
                            if (val) wordMap.set(val, n.noteId);
                        });
                    }
                }
                STATE.existingWordsCache.set(cacheKey, wordMap);
                console.log(`Duplicate cache built in ${Date.now() - startTime}ms for ${allIds.length} notes.`);
            }

            // 3. Instant check using cache
            const wordMap = STATE.existingWordsCache.get(cacheKey);
            wordsToGenerate.forEach(word => {
                if (wordMap.has(word)) {
                    existingNoteIds[word] = wordMap.get(word);
                }
            });

            const duplicateCount = Object.keys(existingNoteIds).length;
            if (duplicateCount > 0) {
                const msg = `Found ${duplicateCount} word(s) already in Anki. These cards will be UPDATED instead of created as new. Proceed?`;
                if (!confirm(msg)) {
                    generateBatchBtn.disabled = false;
                    generateBatchBtn.innerHTML = originalBtnText;
                    STATE.isGenerating = false;
                    return;
                }
            }

        } catch (e) {
            console.error("Duplicate check failed:", e);
            if (!confirm("Could not check for duplicates (Anki issue). Proceed with new cards only?")) {
                generateBatchBtn.disabled = false;
                generateBatchBtn.innerHTML = originalBtnText;
                STATE.isGenerating = false;
                return;
            }
        }

        generateBatchBtn.innerHTML = `<span class="spinner-small"></span> Generating...`;

        const words = wordsToGenerate;

        const batchId = Math.random().toString(36).substr(2, 6);
        const newBatch = {
            id: batchId,
            words: words,
            existingNoteIds: existingNoteIds, // Store for sync later
            cards: [],
            timestamp: Date.now(),
            deckName: deckSelect.value,
            templateId: currentTmpl.id
        };

        STATE.batchHistory.unshift(newBatch);
        if (STATE.batchHistory.length > 50) STATE.batchHistory.pop();
        STATE.activeBatchId = batchId;

        renderHistoryTable();
        renderPreview();

        try {
            const generationErrors = []; // Track diagnostic errors
            // Prepare Tasks (Batches of words)
            const batchSize = parseInt(batchSizeInput?.value) || 10;
            const tasks = [];
            for (let i = 0; i < words.length; i += batchSize) {
                tasks.push({
                    index: tasks.length,
                    words: words.slice(i, i + batchSize),
                    retries: 0
                });
            }

            // Prepare AI Keys
            const selectedProvider = STATE.providers.find(p => p.id === STATE.genAIProviderId);
            const keys = (selectedProvider?.apiKey || '').split(',').map(k => k.trim()).filter(k => k);

            // Cycle-based Sequential Rotation logic
            const groupKey = 'rot_' + keys.join(',').substring(0, 32).replace(/[^a-zA-Z0-9]/g, '');
            const today = `${new Date().getFullYear()}-${new Date().getMonth() + 1}-${new Date().getDate()}`;
            // 1. Get saved index
            const indexData = await chrome.storage.local.get([groupKey]);
            let currentKeyIndex = (indexData[groupKey] && indexData[groupKey].date === today) 
                ? indexData[groupKey].index 
                : 0;

            const jobResults = tasks.map(() => []);
            let activeTasksCount = 0;
            const taskQueue = [...tasks];
            
            let cycleStartTime = Date.now();
            let lastBatchStartTime = 0;
            let keysUsedInCycle = 0;
            const pendingTasks = [];

            while (taskQueue.length > 0) {
                if (!STATE.isGenerating) break;

                // 1. Cycle-level Wait: 15s between starting new cycles
                if (keysUsedInCycle >= keys.length) {
                    const elapsed = Date.now() - cycleStartTime;
                    const waitTime = Math.max(0, 15000 - elapsed);
                    if (waitTime > 0) {
                        let remainingMs = waitTime;
                        while (remainingMs > 0) {
                            if (!STATE.isGenerating) break;
                            const seconds = Math.ceil(remainingMs / 1000);
                            generateBatchBtn.innerHTML = `<span class="spinner-small"></span> Cycle Rest (${seconds}s)... (Click to Stop)`;
                            const step = Math.min(remainingMs, 1000);
                            await new Promise(r => setTimeout(r, step));
                            remainingMs -= step;
                        }
                    }
                    if (!STATE.isGenerating) break;
                    cycleStartTime = Date.now();
                    keysUsedInCycle = 0;
                }

                // 2. Staggered Start Logic
                // We start the task and create a "trigger" promise that resolves after 500ms 
                // OR immediately if the task fails.
                const task = taskQueue.shift();
                const keyIndex = currentKeyIndex;
                
                // Advance counters BEFORE starting to ensure next attempt (even if instant) uses next key
                currentKeyIndex = (currentKeyIndex + 1) % keys.length;
                keysUsedInCycle++;

                let resolveTrigger;
                const nextBatchTrigger = new Promise(r => resolveTrigger = r);
                const fuse = setTimeout(() => resolveTrigger(), 500);

                const taskPromise = (async () => {
                    if (!STATE.isGenerating) return;
                    try {
                        generateBatchBtn.innerHTML = `<span class="spinner-small"></span> Processing... (Key ${keyIndex + 1}) - Click to Stop`;
                        
                        const results = await processBatch(task.words, currentTmpl, { keyIndex: keyIndex });
                        
                        // If it succeeded early, we don't need to force-wait the trigger
                        clearTimeout(fuse);
                        resolveTrigger();

                        if (results) {
                            jobResults[task.index] = results;
                            newBatch.cards = jobResults.flat().filter(c => c);
                            renderPreview();
                            await saveBatchHistory();
                            chrome.storage.local.set({ [groupKey]: { index: keyIndex, date: today } });
                        }
                    } catch (err) {
                        const errorMsg = `Batch ${task.index} (Words: ${task.words.join(', ')}) failed on key ${keyIndex}: ${err.message}`;
                        console.error(errorMsg, err);
                        generationErrors.push(errorMsg);
                        
                        // Failure! Trigger next batch immediately (no 500ms wait)
                        clearTimeout(fuse);
                        resolveTrigger();

                        // Re-queue the task for another attempt, but only if it hasn't failed too many times
                        // For simplicity now, just unshift if keyIndex was low, but let's just log it.
                        taskQueue.unshift(task); 
                    }
                })();

                pendingTasks.push(taskPromise);

                // Wait for the trigger (500ms OR early error) before the next loop iteration
                await nextBatchTrigger;
                lastBatchStartTime = Date.now();
            }

            // 3. Final Wait: Make sure ALL pending batches are finished before showing Success alert
            await Promise.all(pendingTasks);

            // Final save after all tasks are done
            await saveBatchHistory();
            
            // Final count and summary
            const generatedWords = new Set(newBatch.cards.map(c => (c.word || '').toLowerCase().trim()));
            const missingWords = words.filter(w => !generatedWords.has(w.toLowerCase().trim()));

            if (missingWords.length > 0) {
                const missingText = missingWords.join(', ');
                
                // Try to copy BEFORE alert to avoid focus issues, with fallback
                const performCopy = async (text) => {
                    console.log("Attempting to copy missing words to clipboard:", text);
                    try {
                        await navigator.clipboard.writeText(text);
                        console.log("Successfully copied via navigator.clipboard");
                    } catch (err) {
                        console.warn("navigator.clipboard failed, trying fallback...", err);
                        const textArea = document.createElement("textarea");
                        textArea.value = text;
                        textArea.style.position = "fixed";
                        textArea.style.left = "-9999px";
                        textArea.style.top = "0";
                        document.body.appendChild(textArea);
                        textArea.focus();
                        textArea.select();
                        try {
                            const successful = document.execCommand('copy');
                            console.log("Fallback copy success:", successful);
                        } catch (err2) {
                            console.error("Clipboard fallback failed:", err2);
                        }
                        document.body.removeChild(textArea);
                    }
                };

                await performCopy(missingText);
                
                // Diagnostic log for the user
                console.group("⚠️ Generation Diagnostics");
                console.warn(`Summary: Created ${newBatch.cards.length} out of ${words.length} cards.`);
                console.warn(`Missing Words (${missingWords.length}):`, missingWords);
                if (generationErrors.length > 0) {
                    console.warn(`Specific Errors encountered:`);
                    generationErrors.forEach(e => console.warn(`- ${e}`));
                } else {
                    console.warn(`Note: No technical API errors were recorded. This likely means the AI simplified the response or missed some words during successful requests.`);
                }
                console.groupEnd();

                showStatus('warning', 'Generation partially complete', `${newBatch.cards.length} / ${words.length} cards created. Missing words have been copied to your clipboard.`, missingWords);
            } else {
                showStatus('success', 'Success!', `All ${words.length} cards have been generated.`);
            }
        } catch (err) {
            console.error("Critical generation error:", err);
            showStatus('error', 'Error', err.message);
        } finally {
            STATE.isGenerating = false;
            generateBatchBtn.disabled = false;
            generateBatchBtn.innerHTML = originalBtnText;
            renderHistoryTable();
        }
    }

    async function saveBatchHistory() {
        await chrome.storage.local.set({ luminaBatchHistoryV3: STATE.batchHistory });
    }

    function renderHistoryTable() {
        historyTableBody.innerHTML = '';
        if (STATE.batchHistory.length === 0) {
            historyTableBody.innerHTML = '<tr><td colspan="4"><div class="empty-state">No generation history</div></td></tr>';
            return;
        }

        STATE.batchHistory.forEach(batch => {
            const tr = document.createElement('tr');
            tr.style.cursor = 'pointer';
            if (STATE.activeBatchId === batch.id) tr.style.background = '#f0f7ff';

            const dateStr = new Date(batch.timestamp).toLocaleString();
            tr.innerHTML = `
                <td>#${batch.id}</td>
                <td class="words-column">${batch.words.join(', ')}</td>
                <td>${dateStr}</td>
                <td style="display: flex; gap: 8px; justify-content: center;">
                    <button class="icon-btn-text sync-batch-btn" data-id="${batch.id}" title="Sync to Anki">Sync</button>
                    <button class="icon-btn-text danger delete-batch-btn" data-id="${batch.id}">Delete</button>
                </td>
            `;

            tr.onclick = (e) => {
                if (e.target.closest('button')) return;
                STATE.activeBatchId = batch.id;
                renderHistoryTable();
                renderPreview();
            };

            const delBtn = tr.querySelector('.delete-batch-btn');
            delBtn.onclick = async (e) => {
                e.stopPropagation();
                STATE.batchHistory = STATE.batchHistory.filter(b => b.id !== batch.id);
                if (STATE.activeBatchId === batch.id) STATE.activeBatchId = null;
                await saveBatchHistory();
                renderHistoryTable();
                renderPreview();
            };

            const syncBtn = tr.querySelector('.sync-batch-btn');
            syncBtn.onclick = (e) => {
                e.stopPropagation();
                syncBatchToAnki(batch.id);
            };

            historyTableBody.appendChild(tr);
        });
    }

    async function syncBatchToAnki(batchId) {
        const batch = STATE.batchHistory.find(b => b.id === batchId);
        if (!batch || batch.cards.length === 0) return alert('No cards to sync.');

        const currentTmpl = STATE.templates.find(t => t.id === batch.templateId);
        const modelName = currentTmpl ? currentTmpl.model : 'Basic';

        const btn = document.querySelector(`.sync-batch-btn[data-id="${batchId}"]`);
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Syncing...';

        let successCount = 0;
        const liveExistingNoteIds = {};

        try {
            // 1. Instant duplicate check using cache
            const currentTmpl = STATE.templates.find(t => t.id === batch.templateId);
            const modelName = currentTmpl?.model || 'Basic';
            const cacheKey = `${modelName}`;
            
            // If cache is missing (unlikely if they just generated, but possible if page was reloaded)
            if (!STATE.existingWordsCache.has(cacheKey)) {
                const query = `note:"${modelName}"`;
                const allIds = await anki.findNoteIds(query);
                const wordMap = new Map();
                if (allIds.length > 0) {
                    const chunkInfo = await anki.getNotesInfo(allIds);
                    chunkInfo.forEach(n => {
                        const rawVal = (n.fields.Input?.value || n.fields.Front?.value || '').replace(/<[^>]*>/g, '');
                        const val = rawVal.trim().toLowerCase();
                        if (val) wordMap.set(val, n.noteId);
                    });
                }
                STATE.existingWordsCache.set(cacheKey, wordMap);
            }

            const wordMap = STATE.existingWordsCache.get(cacheKey);
            batch.cards.forEach(card => {
                const val = card.word.toLowerCase().trim();
                if (wordMap.has(val)) {
                    liveExistingNoteIds[val] = wordMap.get(val);
                }
            });

            // 2. Prepare batches for New and Updates
            const notesToAdd = [];
            const updateActions = [];

            for (const card of batch.cards) {
                const processedFields = {};
                for (const [key, value] of Object.entries(card.fieldData)) {
                    const fieldDef = currentTmpl.fields.find(f => f.name === key);
                    const isPlainText = fieldDef?.plainText || key.toLowerCase() === 'input';
                    
                    if (isPlainText) {
                        processedFields[key] = (value || '').replace(/<[^>]*>/g, '').trim();
                    } else {
                        processedFields[key] = renderMarkdown(value || '');
                    }
                }

                const wordKey = card.word.toLowerCase().trim();
                const existingId = liveExistingNoteIds[wordKey];

                if (existingId) {
                    updateActions.push({
                        action: "updateNoteFields",
                        params: {
                            note: { id: parseInt(existingId), fields: processedFields }
                        }
                    });
                } else {
                    notesToAdd.push({
                        deckName: batch.deckName,
                        modelName: modelName,
                        fields: processedFields,
                        options: { allowDuplicate: false },
                        tags: ["lumina-batch"]
                    });
                }
            }

            // 3. Execute Batch Add
            if (notesToAdd.length > 0) {
                const ADD_CHUNK = 500;
                for (let i = 0; i < notesToAdd.length; i += ADD_CHUNK) {
                    const chunk = notesToAdd.slice(i, i + ADD_CHUNK);
                    btn.textContent = `Adding ${i + chunk.length}/${notesToAdd.length}`;
                    const results = await anki.addNotes(chunk);
                    successCount += results.filter(r => r !== null).length;
                }
            }

            // 4. Execute Batch Updates
            if (updateActions.length > 0) {
                const UPDATE_CHUNK = 100;
                for (let i = 0; i < updateActions.length; i += UPDATE_CHUNK) {
                    const chunk = updateActions.slice(i, i + UPDATE_CHUNK);
                    btn.textContent = `Updating ${i + chunk.length}/${updateActions.length}`;
                    await anki.multi(chunk);
                    successCount += chunk.length;
                }
            }

            // 3. Trigger Sync to AnkiWeb
            try {
                btn.textContent = 'Syncing to Web...';
                await anki.sync();
            } catch (syncErr) {
                console.warn("AnkiWeb sync failed (but notes were added local):", syncErr);
            }

        } catch (e) {
            console.error("Sync error:", e);
        }

        // alert removed: no notification after successful sync
        btn.disabled = false;
        btn.textContent = originalText;
    }


    function renderPreview() {
        previewContainer.innerHTML = '';
        const batch = STATE.batchHistory.find(b => b.id === STATE.activeBatchId);

        if (!batch) {
            previewContainer.innerHTML = '<div class="empty-state">Select a batch to preview cards</div>';
            genCardCountBadge.classList.add('hidden');
            return;
        }

        const count = batch.cards.length;
        if (count === 0) {
            previewContainer.innerHTML = '<div class="empty-state">No cards in this batch</div>';
            genCardCountBadge.classList.add('hidden');
            return;
        }

        // Update badge
        genCardCountBadge.textContent = `${count} ${count === 1 ? 'card' : 'cards'}`;
        genCardCountBadge.classList.remove('hidden');

        batch.cards.forEach((card, index) => {
            const btn = document.createElement('div');
            btn.className = 'card-label-btn';
            btn.textContent = card.word;
            btn.onclick = () => openGeneratedCardModal(batch.id, index);
            previewContainer.appendChild(btn);
        });
    }

    function openGeneratedCardModal(batchId, cardIndex) {
        const batch = STATE.batchHistory.find(b => b.id === batchId);
        const card = batch.cards[cardIndex];
        const tmpl = STATE.templates.find(t => t.id === batch.templateId);

        // Use a draft card to avoid premature mutation
        const draftCard = JSON.parse(JSON.stringify(card));

        exampleFieldsContainer.innerHTML = '';
        tmpl.fields.forEach(field => {
            const group = document.createElement('div');
            group.className = 'modal-group';

            const isInput = field.name.toLowerCase() === 'input';
            const isPlainText = field.plainText || isInput;
            
            let value = draftCard.fieldData[field.name] || '';
            // If it's Input field and empty in fieldData, fallback to card.word
            if (isInput && !value) value = draftCard.word;

            group.innerHTML = `
                <label>${field.name}</label>
                ${isPlainText
                    ? `<textarea class="plain-text-field edit-ex-field" data-field="${field.name}" placeholder="Plain text...">${value.replace(/<[^>]*>/g, '')}</textarea>`
                    : `<div class="rich-text edit-ex-field" contenteditable="true" data-field="${field.name}">${renderMarkdown(value)}</div>`
                }
            `;
            exampleFieldsContainer.appendChild(group);

            if (isPlainText) return;

            const richEl = group.querySelector('.rich-text');
            setupRichText(richEl, (newContent) => {
                draftCard.fieldData[field.name] = newContent;
            });
            document.execCommand('defaultParagraphSeparator', false, 'p');
        });

        saveExampleBtn.onclick = async () => {

            exampleFieldsContainer.querySelectorAll('.edit-ex-field').forEach(el => {
                const fieldName = el.dataset.field;
                if (el.tagName === 'TEXTAREA') {
                    draftCard.fieldData[fieldName] = el.value.trim();
                    if (fieldName.toLowerCase() === 'input') draftCard.word = el.value.toLowerCase().trim();
                } else {
                    // Loại bỏ <p> rỗng trước khi lưu
                    draftCard.fieldData[fieldName] = sanitizeRichTextHTML(el.innerHTML);
                }
            });

            // Sanitize lại toàn bộ fieldData trước khi lưu (loại <p> rỗng cho mọi field rich text)
            Object.keys(draftCard.fieldData).forEach(fieldName => {
                const val = draftCard.fieldData[fieldName];
                // Nếu có vẻ là HTML (có thẻ p, div, br, b, i, strong...)
                if (typeof val === 'string' && /<\/?(p|div|br|b|i|strong|em|span)[ >]/i.test(val)) {
                    draftCard.fieldData[fieldName] = sanitizeRichTextHTML(val);
                }
            });
            batch.cards[cardIndex] = draftCard;
            await saveBatchHistory();
            exampleModal.classList.add('hidden');
            renderPreview();
        };

        exampleModal.classList.remove('hidden');
    }

    // --- Helpers ---
    function formatDate(ts) {
        if (!ts) return '-';
        return new Date(ts).toLocaleString('en-GB', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
    }

    function renderMarkdown(text) {
        if (!text) return '';
        
        // If it already looks like HTML, just sanitize and return to avoid double-wrapping
        if (typeof text === 'string' && (text.includes('<p>') || text.includes('<div>') || text.includes('<br>'))) {
            return sanitizeRichTextHTML(text);
        }

        // Clean up text and split to paragraphs
        let cleanText = text.toString().trim();
        
        // Split by double newlines or more
        const paragraphs = cleanText.split(/\n\n+/).filter(p => p.trim());
        
        const rendered = paragraphs.map(p => {
            let pContent = p
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/__(.*?)__/g, '<strong>$1</strong>')
                .replace(/\*(.*?)\*/g, '<em>$1</em>')
                .replace(/_(.*?)_/g, '<em>$1</em>')
                .replace(/<u>(.*?)<\/u>/g, '<u>$1</u>')
                .replace(/\n/g, '<br>');
            return `<p>${pContent}</p>`;
        }).join('');

        return rendered;
    }

    // --- Event Listeners ---
    function setupEventListeners() {
        // Tab: Templates
        templateSearch.addEventListener('input', renderTemplatesTable);
        createNewTemplateBtn.addEventListener('click', () => openTemplateEditor(null));
        cancelTemplateBtn.addEventListener('click', () => templateEditor.classList.remove('open'));
        tableRowClick();

        addTemplateFieldBtn.addEventListener('click', () => {
            if (!STATE.currentEditTemplate) return;
            
            // Find 'Input' field to insert before it
            const inputIndex = STATE.currentEditTemplate.fields.findIndex(f => f.name.toLowerCase() === 'input');
            const newField = { name: 'New Field', prompt: '', example: '' };
            
            if (inputIndex !== -1) {
                STATE.currentEditTemplate.fields.splice(inputIndex, 0, newField);
            } else {
                STATE.currentEditTemplate.fields.push(newField);
            }
            
            renderEditFields();
        });

        addExamplePreviewBtn.addEventListener('click', () => {
            if (!STATE.currentEditTemplate.aiModel) {
                highlightAIModelSelector();
                return;
            }
            openExampleModal(-1);
        });

        function highlightAIModelSelector() {
            const selector = document.getElementById('anki-model-btn');
            if (selector) {
                selector.scrollIntoView({ behavior: 'smooth', block: 'center' });
                selector.style.transition = 'all 0.3s ease';
                selector.style.borderColor = '#ff3b30';
                selector.style.boxShadow = '0 0 0 3px rgba(255, 59, 48, 0.2)';
                
                // Shake animation
                selector.animate([
                    { transform: 'translateX(0)' },
                    { transform: 'translateX(-5px)' },
                    { transform: 'translateX(5px)' },
                    { transform: 'translateX(-5px)' },
                    { transform: 'translateX(0)' }
                ], { duration: 300 });

                setTimeout(() => {
                    selector.style.borderColor = '';
                    selector.style.boxShadow = '';
                }, 2000);
            }
        }

        // Click outside to close example modal
        exampleModal.addEventListener('click', (e) => {
            if (e.target === exampleModal) {
                exampleModal.classList.add('hidden');
            }
        });

        saveTemplateBtn.addEventListener('click', saveTemplate);
        deleteTemplateBtn.addEventListener('click', deleteTemplate);

        editTemplateGlobalPrompt.addEventListener('input', () => {
            if (STATE.currentEditTemplate) STATE.currentEditTemplate.globalPrompt = editTemplateGlobalPrompt.value;
        });

        // Tab: Generator
        generateBatchBtn.onclick = handleGenerate;
        
        // Clear cache when deck or template changes
        const invalidateCache = () => STATE.existingWordsCache.clear();
        deckSelect.addEventListener('change', () => {
            invalidateCache();
            chrome.storage.local.set({ lastUsedDeck: deckSelect.value });
        });
        templateSelect.addEventListener('change', () => {
            invalidateCache();
            chrome.storage.local.set({ lastUsedTemplateId: templateSelect.value });
        });
        if (batchSizeInput) {
            batchSizeInput.addEventListener('change', () => {
                chrome.storage.local.set({ lastUsedBatchSize: batchSizeInput.value });
            });
        }

        if (batchInput && batchWordCount) {
            let updateTimeout;
            const updateCount = () => {
                clearTimeout(updateTimeout);
                updateTimeout = setTimeout(() => {
                    const text = batchInput.value.trim();
                    if (!text) {
                        batchWordCount.textContent = '(0)';
                        return;
                    }
                    const words = text.split(/[,\n]/).map(s => s.trim()).filter(s => s);
                    const unique = new Set(words.map(w => w.toLowerCase()));
                    batchWordCount.textContent = `(${unique.size})`;
                }, 300); // Debounce to keep UI responsive with large lists
            };

            const checkDuplicates = () => {
                const text = batchInput.value.trim();
                if (!text) return;

                const words = text.split(/[,\n]/).map(s => s.trim()).filter(s => s);
                const seen = new Set();
                const duplicates = new Set();
                const uniqueWords = [];

                words.forEach(w => {
                    const normalized = w.toLowerCase();
                    if (seen.has(normalized)) {
                        duplicates.add(w);
                    } else {
                        seen.add(normalized);
                        uniqueWords.push(w);
                    }
                });

                if (duplicates.size > 0) {
                    const dupList = Array.from(duplicates).slice(0, 10).join(', ') + (duplicates.size > 10 ? '...' : '');
                    if (confirm(`Found ${duplicates.size} duplicate word(s):\n${dupList}\n\nDo you want to remove them?`)) {
                        const useNewline = text.includes('\n');
                        batchInput.value = uniqueWords.join(useNewline ? '\n' : ', ');
                        updateCount();
                    }
                }
            };

            batchInput.addEventListener('input', updateCount);
            batchInput.addEventListener('blur', checkDuplicates);
            // Trigger check immediately after paste
            batchInput.addEventListener('paste', () => {
                setTimeout(checkDuplicates, 100);
            });
            updateCount(); // Initial count
        }
    }

    function tableRowClick() {
        templateTableBody.addEventListener('click', (e) => {
            const row = e.target.closest('tr');
            if (row && row.dataset.tmplId) {
                openTemplateEditor(row.dataset.tmplId);
            }
        });
    }

    init();
});
