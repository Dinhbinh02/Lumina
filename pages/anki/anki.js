// Main Logic for Anki Page (Browser & Connection)

document.addEventListener('DOMContentLoaded', async () => {
    const anki = new AnkiClient();

    // UI References
    const connectionStatus = document.getElementById('connectionStatusSidebar');
    const statusText = connectionStatus?.querySelector('.status-text');
    
    // Sidebar Tabs
    const tabs = document.querySelectorAll('.nav-item[data-tab]');
    const tabContents = document.querySelectorAll('.tab-content');

    // State
    let isConnected = false;
    let allNoteIds = [];
    let loadedNoteDetails = [];
    let renderedCount = 0;
    let sortKey = 'created';
    let sortDirection = 'desc';
    const BATCH_SIZE = 50;
    const browserResultsContainer = document.querySelector('.browser-results-container');
    let backgroundLoadCancelToken = 0;
    let lastCheckedIndex = null;

    // --- Browser State & UI Refs ---
    const STATE = {
        selectedDeck: 'all',
        selectedField: 'all'
    };
    const selectedNoteIds = new Set();
    const selectAllCheckbox = document.getElementById('selectAllCards');
    const moveModal = document.getElementById('moveCardsModal');
    const moveDeckList = document.getElementById('moveDeckList');
    const moveDeckSearch = document.getElementById('moveDeckSearch');
    let selectedTargetDeck = null;

    // --- Connection ---

    async function checkConnection() {
        if (!connectionStatus || !statusText) return;

        try {
            statusText.textContent = 'Connecting...';
            await anki.getVersion();
            isConnected = true;
            statusText.textContent = 'Connected';
            connectionStatus.classList.remove('disconnected');
            connectionStatus.classList.add('connected');

            // Load Initial Data
            await loadDecks();
            loadBrowser();
            if (window.ankiHeatmap) {
                window.ankiHeatmap.init();
            }
        } catch (e) {
            isConnected = false;
            statusText.textContent = 'Disconnected';
            connectionStatus.classList.remove('connected');
            connectionStatus.classList.add('disconnected');
            console.error("Anki connection failed:", e);
        }
    }

    async function loadDecks() {
        try {
            const decks = await anki.invoke('deckNames');
            populateCustomDropdown('deckDropdownList', ['All Decks', ...decks], 'deckPillValue', (val) => {
                STATE.selectedDeck = val === 'All Decks' ? 'all' : val;
                loadBrowser();
            });

            // Models/Fields - Only from models that actually have notes
            const modelNames = await anki.invoke('modelNames');
            const fieldSet = new Set();
            
            // Find which models are actually being used by notes
            const modelUsageData = await Promise.all(modelNames.map(async (name) => {
                const ids = await anki.invoke('findNotes', { query: `note:"${name}"` });
                return { name, used: ids.length > 0 };
            }));

            for (const item of modelUsageData) {
                if (item.used) {
                    const fields = await anki.invoke('modelFieldNames', { modelName: item.name });
                    fields.forEach(f => fieldSet.add(f));
                }
            }

            // Field selector removed as per visual update
            
        } catch (e) {
            console.error("Failed to load initial data:", e);
        }
    }

    function populateCustomDropdown(containerId, items, valueDisplayId, onSelect) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        container.innerHTML = items.map(item => `
            <div class="dropdown-item" data-value="${item}">${item}</div>
        `).join('');

        container.querySelectorAll('.dropdown-item').forEach(el => {
            el.addEventListener('click', (e) => {
                const val = e.target.dataset.value;
                document.getElementById(valueDisplayId).textContent = val;
                onSelect(val);
                e.target.closest('.custom-dropdown').classList.remove('open');
                e.target.closest('.filter-pill').classList.remove('active');
            });
        });
    }

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetId = tab.dataset.tab;
            
            // UI Update
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            tabContents.forEach(c => c.classList.remove('active'));
            const content = document.getElementById(`tab-${targetId}`);
            if (content) content.classList.add('active');

            // Persist
            localStorage.setItem('lastAnkiTab', targetId);

            // Action
            if (targetId === 'browser') {
                if (allNoteIds.length === 0) {
                    loadBrowser();
                }
            } else if (targetId === 'setup') {
                const deckList = document.getElementById('deckList');
                if (deckList && deckList.children.length === 0) {
                    if (window.initAnkiManager) window.initAnkiManager();
                }
            }
        });
    });

    // --- Global Quick Paste Logic ---
    window.addEventListener('paste', (e) => {
        const active = document.activeElement;
        const isEditable = active.tagName === 'INPUT' || 
                           active.tagName === 'TEXTAREA' || 
                           active.isContentEditable;

        // If we're already in batchInput, let the default paste happen
        if (active.id === 'batchInput') return;

        // If targeting another input/editable, assume intentional local paste
        if (isEditable) return;

        // Quick jump to generator and paste
        const genTab = document.querySelector('.nav-item[data-tab="generator"]');
        const batchInput = document.getElementById('batchInput');
        
        if (genTab && batchInput) {
            const text = e.clipboardData.getData('text');
            if (!text) return;

            e.preventDefault();
            genTab.click(); // Switch to tab

            const currentVal = batchInput.value.trim();
            const separator = currentVal ? '\n' : '';
            batchInput.value = currentVal + separator + text;
            batchInput.focus();

            // Move cursor to end
            batchInput.selectionStart = batchInput.selectionEnd = batchInput.value.length;
            
            // Trigger count update
            batchInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
    });


    // --- Custom Dropdown Handlers ---
    function setupCustomDropdowns() {
        const pills = ['deckPill'];
        
        pills.forEach(pillId => {
            const pill = document.getElementById(pillId);
            if (!pill) return;
            
            const dropdown = pill.querySelector('.custom-dropdown');
            if (!dropdown) return;
            
            const searchInput = dropdown.querySelector('.dropdown-search');
            if (!searchInput) return;
            
            pill.addEventListener('click', (e) => {
                if (e.target.closest('.custom-dropdown')) return;
                
                // Close others
                document.querySelectorAll('.filter-pill').forEach(p => {
                    if (p !== pill) {
                        p.classList.remove('active');
                        p.querySelector('.custom-dropdown')?.classList.remove('open');
                    }
                });

                const isOpen = dropdown.classList.toggle('open');
                pill.classList.toggle('active', isOpen);
                if (isOpen) searchInput.focus();
            });

            // Dropdown Search Logic
            searchInput.addEventListener('input', (e) => {
                const term = e.target.value.toLowerCase();
                const items = dropdown.querySelectorAll('.dropdown-item');
                items.forEach(item => {
                    const text = item.textContent.toLowerCase();
                    item.style.display = text.includes(term) ? 'block' : 'none';
                });
            });
        });

        // Click outside to close
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.filter-pill')) {
                document.querySelectorAll('.custom-dropdown').forEach(d => d.classList.remove('open'));
                document.querySelectorAll('.filter-pill').forEach(p => {
                     // Check if it has an active value that isn't default to decide if it stays styled active
                     // But for now, just remove UI active class
                     p.classList.remove('active');
                });
            }
        });
    }
    setupCustomDropdowns();

    async function loadBrowser() {
        if (!isConnected) return;
        
        const tbody = document.getElementById('browserTableBody');
        const searchTerm = document.getElementById('browserSearch')?.value.trim().toLowerCase() || '';

        // Reset Selection when loading new data
        if (typeof selectedNoteIds !== 'undefined') {
            selectedNoteIds.clear();
        }
        if (typeof selectAllCheckbox !== 'undefined' && selectAllCheckbox) {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
        }
        


        backgroundLoadCancelToken++;
        const currentToken = backgroundLoadCancelToken;

        // 1. Build Query
        let query = "";
        if (STATE.selectedDeck !== 'all') query += `deck:"${STATE.selectedDeck}" `;
        
        if (searchTerm) {
            query += `"${searchTerm}" `;
        }



        if (!query.trim()) query = "deck:current";

        try {
            if (tbody) tbody.innerHTML = '<tr><td colspan="5" style="text-align:center">Loading cards...</td></tr>';

            const newNoteIds = await anki.findNoteIds(query.trim());
            if (currentToken !== backgroundLoadCancelToken) return;

            if (newNoteIds.length === 0) {
                if (tbody) tbody.innerHTML = '<tr><td colspan="5" style="text-align:center">No cards found</td></tr>';
                loadedNoteDetails = [];
                updateCount(0);
                return;
            }

            const CHUNK_SIZE = 500;
            let allDetails = [];
            let firstRenderDone = false;

            for (let i = 0; i < newNoteIds.length; i += CHUNK_SIZE) {
                if (currentToken !== backgroundLoadCancelToken) return;
                const chunkIds = newNoteIds.slice(i, i + CHUNK_SIZE);
                const chunkData = await anki.getNotesInfo(chunkIds);
                
                // Fetch deck names for these notes
                const cardIds = chunkData.map(n => n.cards ? n.cards[0] : null).filter(c => c);
                let deckMap = {};

                // Optimization: if a specific deck is selected, we already know the deck name
                if (STATE.selectedDeck !== 'all') {
                    chunkData.forEach(n => { deckMap[n.noteId] = STATE.selectedDeck; });
                } else if (cardIds.length > 0) {
                    const cardsInfo = await anki.invoke('cardsInfo', { cards: cardIds });
                    cardsInfo.forEach(c => {
                        deckMap[c.note] = c.deckName;
                    });
                }

                const processedChunk = processNotes(chunkData, deckMap);
                allDetails = allDetails.concat(processedChunk);
                
                // Update state incrementally
                loadedNoteDetails = allDetails;
                allNoteIds = allDetails.map(n => n.noteId);

                // FASTER FIRST LOAD: Show the first few cards as soon as the first chunk is ready
                if (!firstRenderDone && allDetails.length > 0) {
                    tbody.innerHTML = '';
                    applySort(); // Sort what we have so far
                    renderInitialBatch();
                    updateCount(newNoteIds.length); // Show total found immediately
                    firstRenderDone = true;
                }
            }

            if (currentToken !== backgroundLoadCancelToken) return;

            // Final sort and potential count update when everything is in
            applySort();
            // If the user hasn't scrolled yet, we don't need to re-render everything, 
            // but the count and full list are now ready.
            updateCount(allNoteIds.length);

        } catch (e) {
            console.error("Browser Load Error:", e);
            if (tbody) tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:red">Error: ${e}</td></tr>`;
        }
    }

    function updateCount(count) {
        const countBadge = document.getElementById('cardCountBadge');
        if (countBadge) countBadge.textContent = `${count} cards`;
    }

    function processNotes(notes, deckMap = {}) {
        return notes.map(n => {
            const contentStr = Object.values(n.fields)
                .sort((a, b) => a.order - b.order)
                .map(f => f.value)
                .join(' ');

            return {
                noteId: n.noteId,
                content: contentStr,
                deck: deckMap[n.noteId] || '-',
                created: n.noteId,
                modified: (n.mod || 0) * 1000
            };
        });
    }

    function renderInitialBatch() {
        const tbody = document.getElementById('browserTableBody');
        if (!tbody) return;
        tbody.innerHTML = '';
        renderedCount = 0;
        const initial = loadedNoteDetails.slice(0, BATCH_SIZE);
        renderRows(initial);
        renderedCount = initial.length;
    }

    function renderRows(notes) {
        const tbody = document.getElementById('browserTableBody');
        if (!tbody) return;
        const html = notes.map(n => {
            const plainText = n.content.replace(/<[^>]*>/g, ' ');
            const isChecked = selectedNoteIds.has(n.noteId.toString());
            return `
                <tr data-note-id="${n.noteId}">
                    <td class="checkbox-cell">
                        <input type="checkbox" class="row-checkbox" ${isChecked ? 'checked' : ''}>
                    </td>
                    <td class="truncate">${escapeHtml(n.deck)}</td>
                    <td class="truncate">${escapeHtml(plainText)}</td>
                    <td>${formatTime(n.created)}</td>
                    <td>${formatTime(n.modified)}</td>
                </tr>
            `;
        }).join('');
        tbody.insertAdjacentHTML('beforeend', html);
    }

    function applySort() {
        loadedNoteDetails.sort((a, b) => {
            let valA = a[sortKey];
            let valB = b[sortKey];
            if (typeof valA === 'string') valA = valA.toLowerCase();
            if (typeof valB === 'string') valB = valB.toLowerCase();

            if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
            if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
            return 0;
        });
    }

    // Scroll Lazy Load
    browserResultsContainer?.addEventListener('scroll', () => {
        const { scrollTop, clientHeight, scrollHeight } = browserResultsContainer;
        if (scrollTop + clientHeight >= scrollHeight - 200) {
            if (renderedCount < loadedNoteDetails.length) {
                const next = loadedNoteDetails.slice(renderedCount, renderedCount + BATCH_SIZE);
                renderRows(next);
                renderedCount += next.length;
            }
        }
    });

    // Search input logic
    document.getElementById('browserSearch')?.addEventListener('input', () => {
        loadBrowser();
    });

    // --- Selection Logic ---

    selectAllCheckbox?.addEventListener('change', (e) => {
        const checked = e.target.checked;
        
        if (checked) {
            // Select ALL loaded notes, regardless of whether they are rendered
            loadedNoteDetails.forEach(note => {
                selectedNoteIds.add(note.noteId.toString());
            });
        } else {
            selectedNoteIds.clear();
        }

        // Update visual state of all currently rendered checkboxes
        const checkboxes = document.querySelectorAll('.row-checkbox');
        checkboxes.forEach(cb => {
            cb.checked = checked;
        });
    });

    document.getElementById('browserTableBody')?.addEventListener('click', (e) => {
        if (e.target.classList.contains('row-checkbox')) {
            const checkboxes = Array.from(document.querySelectorAll('.row-checkbox'));
            const currentIndex = checkboxes.indexOf(e.target);
            const noteId = e.target.closest('tr').dataset.noteId;

            if (e.shiftKey && lastCheckedIndex !== null) {
                const start = Math.min(currentIndex, lastCheckedIndex);
                const end = Math.max(currentIndex, lastCheckedIndex);
                const isChecking = e.target.checked;

                for (let i = start; i <= end; i++) {
                    const cb = checkboxes[i];
                    const rowId = cb.closest('tr').dataset.noteId;
                    cb.checked = isChecking;
                    if (isChecking) {
                        selectedNoteIds.add(rowId);
                    } else {
                        selectedNoteIds.delete(rowId);
                    }
                }
            } else {
                if (e.target.checked) {
                    selectedNoteIds.add(noteId);
                } else {
                    selectedNoteIds.delete(noteId);
                }
            }

            lastCheckedIndex = currentIndex;
            handleSelectAllState();
        }
    });

    function handleSelectAllState() {
        if (!selectAllCheckbox || loadedNoteDetails.length === 0) return;
        
        // Accurate check: do we have as many IDs as notes found?
        const allSelected = selectedNoteIds.size === loadedNoteDetails.length;
        selectAllCheckbox.checked = allSelected;
        
        // Also handle indeterminate state if some but not all are selected
        selectAllCheckbox.indeterminate = selectedNoteIds.size > 0 && selectedNoteIds.size < loadedNoteDetails.length;
    }

    // --- Action Button Logic ---
    document.getElementById('deleteSelectedBtn')?.addEventListener('click', async () => {
        if (selectedNoteIds.size === 0) return alert('Please select cards to delete.');
        if (!confirm(`Are you sure you want to delete ${selectedNoteIds.size} cards?`)) return;

        try {
            const ids = Array.from(selectedNoteIds).map(id => parseInt(id));
            await anki.deleteNotes(ids);
            selectedNoteIds.clear();
            if (selectAllCheckbox) selectAllCheckbox.checked = false;
            loadBrowser();
            // Sync to AnkiWeb
            try { await anki.sync(); } catch (sErr) { console.warn("AnkiWeb sync failed:", sErr); }
        } catch (e) {
            alert('Error deleting cards: ' + e);
        }
    });

    document.getElementById('regenerateSelectedBtn')?.addEventListener('click', async () => {
        if (selectedNoteIds.size === 0) return alert('Please select cards to regenerate.');

        try {
            const ids = Array.from(selectedNoteIds).map(id => parseInt(id));
            const notes = await anki.getNotesInfo(ids);
            
            // Extract the word/main content. Strictly use "Input" field for consistency.
            const words = notes.map(n => {
                const keys = Object.keys(n.fields);
                const inputField = keys.find(k => k.toLowerCase() === 'input');
                return inputField ? n.fields[inputField].value.replace(/<[^>]*>/g, '').trim() : null;
            }).filter(w => w);

            if (words.length > 0) {
                // Save to localStorage for the generator tab
                localStorage.setItem('regenerate_words', words.join('\n'));
                
                // Navigate to Generator Tab
                const genTab = document.querySelector('.nav-item[data-tab="generator"]');
                if (genTab) {
                    genTab.click();
                    // Dispatch a custom event and/or the generator script will check localStorage
                    window.dispatchEvent(new CustomEvent('triggerRegenerate', { detail: { words: words.join('\n') } }));
                }
            }
        } catch (e) {
            alert('Error getting card info: ' + e);
        }
    });

    // --- Move to Deck Logic ---

    document.getElementById('moveSelectedBtn')?.addEventListener('click', () => {
        if (selectedNoteIds.size === 0) return alert('Please select cards to move.');
        moveModal.classList.remove('hidden');
        populateMoveDecks();
    });

    async function populateMoveDecks() {
        try {
            const decks = await anki.invoke('deckNames');
            renderMoveDecks(decks);

            moveDeckSearch.oninput = (e) => {
                const term = e.target.value.toLowerCase();
                const filtered = decks.filter(d => d.toLowerCase().includes(term));
                renderMoveDecks(filtered);
            };
        } catch (e) {
            console.error("Failed to load decks for move:", e);
        }
    }

    function renderMoveDecks(decks) {
        moveDeckList.innerHTML = decks.map(d => `
            <div class="dropdown-item ${selectedTargetDeck === d ? 'selected' : ''}" data-deck="${d}">${d}</div>
        `).join('');

        moveDeckList.querySelectorAll('.dropdown-item').forEach(el => {
            el.onclick = () => {
                moveDeckList.querySelectorAll('.dropdown-item').forEach(i => i.classList.remove('selected'));
                el.classList.add('selected');
                selectedTargetDeck = el.dataset.deck;
            };
        });
    }

    document.getElementById('confirmMoveBtn')?.addEventListener('click', async () => {
        if (!selectedTargetDeck) return alert('Please select a target deck.');
        
        try {
            const ids = Array.from(selectedNoteIds).map(id => parseInt(id));
            // To move cards in AnkiConnect, we usually need the card IDs, not note IDs.
            // But 'changeDeck' action usually works on cards.
            const notes = await anki.getNotesInfo(ids);
            const cardIds = notes.flatMap(n => n.cards);

            if (cardIds.length > 0) {
                await anki.invoke('changeDeck', { cards: cardIds, deck: selectedTargetDeck });
                moveModal.classList.add('hidden');
                selectedNoteIds.clear();
                if (selectAllCheckbox) selectAllCheckbox.checked = false;
                loadBrowser();
                // Sync to AnkiWeb
                try { await anki.sync(); } catch (sErr) { console.warn("AnkiWeb sync failed:", sErr); }
            }
        } catch (e) {
            alert('Error moving cards: ' + e);
        }
    });

    const cancelMoveBtn = document.getElementById('cancelMoveBtn');
    if (cancelMoveBtn) cancelMoveBtn.onclick = () => moveModal.classList.add('hidden');
    
    const closeMoveModalBtn = document.getElementById('closeMoveModalBtn');
    if (closeMoveModalBtn) closeMoveModalBtn.onclick = () => moveModal.classList.add('hidden');

    const closeHeatmapModalBtn = document.getElementById('closeHeatmapModalBtn');
    if (closeHeatmapModalBtn) closeHeatmapModalBtn.onclick = () => document.getElementById('heatmapDetailsModal').classList.add('hidden');

    // --- Editor Logic ---
    let selectedNoteId = null;

    document.getElementById('browserTableBody')?.addEventListener('click', (e) => {
        if (e.target.type === 'checkbox' || e.target.classList.contains('checkbox-cell')) return;
        
        const row = e.target.closest('tr');
        if (row?.dataset.noteId) {
            document.querySelectorAll('#browserTableBody tr').forEach(r => r.classList.remove('selected'));
            row.classList.add('selected');
            openEditor(row.dataset.noteId);
        }
    });

    async function openEditor(noteId) {
        selectedNoteId = noteId;
        const editorContent = document.getElementById('editorContent');
        const sideEditor = document.getElementById('sideEditor');
        const footer = document.querySelector('.side-editor-footer');

        if (!sideEditor || !editorContent) return;

        sideEditor.classList.add('open');
        editorContent.innerHTML = '<div class="editor-empty-state">Loading card details...</div>';
        if (footer) footer.style.display = 'none';

        try {
            const notes = await anki.getNotesInfo([noteId]);
            if (!notes?.length) throw new Error("Note not found");

            const note = notes[0];
            if (footer) footer.style.display = 'block';

            let fieldsHtml = '';
            const sortedFields = Object.entries(note.fields).sort((a, b) => a[1].order - b[1].order);
            sortedFields.forEach(([name, data]) => {
                const isInput = name.toLowerCase() === 'input';
                fieldsHtml += `
                    <div class="field-edit-group">
                        <label class="field-label">${name}</label>
                        ${isInput 
                            ? `<textarea class="plain-text-field edit-ex-field" data-field="${name}" style="width:100%; min-height:60px; padding:8px; border:1px solid #ddd; border-radius:4px; font-family:inherit;">${data.value.replace(/<[^>]*>/g, '')}</textarea>`
                            : `<div class="rich-text" contenteditable="true" data-field="${name}">${data.value}</div>`
                        }
                    </div>
                `;
            });
            editorContent.innerHTML = fieldsHtml;

            // Setup rich text fields for paste hygiene
            editorContent.querySelectorAll('.rich-text').forEach(el => {
                setupRichText(el);
            });
            // Force paragraph behavior for better HTML structure
            document.execCommand('defaultParagraphSeparator', false, 'p');
        } catch (e) {
            editorContent.innerHTML = `<div class="editor-empty-state" style="color:red">Error: ${e}</div>`;
        }
    }

    document.getElementById('cancelCardBtn')?.addEventListener('click', () => {
        document.getElementById('sideEditor')?.classList.remove('open');
        document.querySelectorAll('#browserTableBody tr').forEach(r => r.classList.remove('selected'));
        selectedNoteId = null;
    });

    // Click outside to close side editor
    document.addEventListener('click', (e) => {
        const sideEditor = document.getElementById('sideEditor');
        if (!sideEditor || !sideEditor.classList.contains('open')) return;

        // Don't close if clicking inside editor, or on a row (let row click handle switching), or on top action buttons
        if (sideEditor.contains(e.target) || 
            e.target.closest('#browserTableBody tr') || 
            e.target.closest('.unified-search-bar') ||
            e.target.closest('.modal-content')) return;

        sideEditor.classList.remove('open');
        document.querySelectorAll('#browserTableBody tr').forEach(r => r.classList.remove('selected'));
        selectedNoteId = null;
    });

    document.getElementById('saveCardBtn')?.addEventListener('click', async () => {
        if (!selectedNoteId) return;
        const saveBtn = document.getElementById('saveCardBtn');
        try {
            saveBtn.disabled = true;
            const updatedFields = {};
            document.getElementById('editorContent').querySelectorAll('[data-field]').forEach(el => {
                const fieldName = el.dataset.field;
                if (el.tagName === 'TEXTAREA') {
                    updatedFields[fieldName] = el.value.trim();
                } else {
                    updatedFields[fieldName] = el.innerHTML;
                }
            });
            // Gọi updateNoteFields để sync với Anki
            await anki.updateNoteFields(selectedNoteId, updatedFields);
            document.getElementById('sideEditor')?.classList.remove('open');
            // Cập nhật lại đúng 1 row vừa sửa, không reload cả table
            const notes = await anki.getNotesInfo([selectedNoteId]);
            if (notes && notes.length) {
                const n = notes[0];
                // Cập nhật loadedNoteDetails
                const idx = loadedNoteDetails.findIndex(x => x.noteId == n.noteId);
                if (idx !== -1) {
                    // Cập nhật content và modified
                    loadedNoteDetails[idx].content = Object.values(n.fields).sort((a, b) => a.order - b.order).map(f => f.value).join(' ');
                    loadedNoteDetails[idx].modified = (n.mod || 0) * 1000;
                }
                // Cập nhật lại row trong DOM
                const row = document.querySelector(`#browserTableBody tr[data-note-id="${n.noteId}"]`);
                if (row) {
                    const tds = row.querySelectorAll('td');
                    if (tds.length >= 5) {
                        tds[2].innerHTML = escapeHtml(loadedNoteDetails[idx].content.replace(/<[^>]*>/g, ' '));
                        tds[4].innerHTML = formatTime(loadedNoteDetails[idx].modified);
                    }
                }
            }
            // Sync to AnkiWeb
            try { await anki.sync(); } catch (sErr) { console.warn("AnkiWeb sync failed:", sErr); }
        } catch (e) {
            alert('Error: ' + e);
        } finally {
            saveBtn.disabled = false;
        }
    });

    document.getElementById('deleteCardBtn')?.addEventListener('click', async () => {
        if (!selectedNoteId || !confirm('Delete this card?')) return;
        try {
            await anki.deleteNotes([parseInt(selectedNoteId)]);
            loadBrowser();
            document.getElementById('sideEditor')?.classList.remove('open');
            // Sync to AnkiWeb
            try { await anki.sync(); } catch (sErr) { console.warn("AnkiWeb sync failed:", sErr); }
        } catch (e) {
            alert('Error: ' + e);
        }
    });

    // --- Helpers ---
    function formatTime(ms) {
        return ms ? new Date(ms).toLocaleString('en-GB', { hour12: false }) : '-';
    }

    function escapeHtml(text) {
        return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    function setupRichText(el) {
        // Paste hygiene
        el.addEventListener('paste', (e) => {
            e.preventDefault();
            const text = e.clipboardData.getData('text/plain');
            const html = e.clipboardData.getData('text/html');
            
            if (html) {
                // Sanitize HTML to remove font-family, font-size, line-height etc.
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                
                // Deep clean and consolidate structure
                const sanitize = (body) => {
                    // 1. Remove all comments
                    const iterator = doc.createNodeIterator(body, NodeFilter.SHOW_COMMENT);
                    let comment;
                    while (comment = iterator.nextNode()) comment.remove();

                    // 2. Convert styles to semantic tags before stripping attributes (crucial for GDocs)
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

                    // 3. Remove all attributes
                    body.querySelectorAll('*').forEach(el => {
                        while (el.attributes.length > 0) el.removeAttribute(el.attributes[0].name);
                    });

                    // 4. Flatten and unwrap metadata/junk wrappers
                    const flatten = (node) => {
                        const children = Array.from(node.childNodes);
                        for (const child of children) {
                            if (child.nodeType === 1) {
                                const tag = child.tagName;
                                // Unwrap spans, fonts, and metadata tags
                                if (['SPAN', 'FONT', 'META', 'STYLE', 'LINK'].includes(tag)) {
                                    while (child.firstChild) node.insertBefore(child.firstChild, child);
                                    child.remove();
                                    flatten(node);
                                    return;
                                }
                                // Unwrap formatting tags that contain block elements (common in GDocs metadata)
                                if (['B', 'I', 'U', 'STRONG', 'EM'].includes(tag)) {
                                    const hasBlock = Array.from(child.childNodes).some(n => n.nodeType === 1 && ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'UL', 'OL', 'LI'].includes(n.tagName));
                                    if (hasBlock) {
                                        while (child.firstChild) node.insertBefore(child.firstChild, child);
                                        child.remove();
                                        flatten(node);
                                        return;
                                    }
                                }
                                // Convert DIV to P
                                if (tag === 'DIV') {
                                    const p = doc.createElement('p');
                                    while (child.firstChild) p.appendChild(node.firstChild);
                                    node.replaceChild(p, child);
                                    flatten(p);
                                    continue;
                                }
                                flatten(child);
                            }
                        }
                    };
                    flatten(body);

                    // 5. Consolidation: Paragraphify loose inline content
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

                    // 6. Recursive deep cleanup of empty tags
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
                document.execCommand('insertHTML', false, doc.body.innerHTML);
            } else {
                document.execCommand('insertText', false, text);
            }
        });

        // Basic formatting support
        el.addEventListener('keydown', (e) => {
            if (e.metaKey || e.ctrlKey) {
                if (e.key === 'b') { e.preventDefault(); document.execCommand('bold', false, null); }
                if (e.key === 'i') { e.preventDefault(); document.execCommand('italic', false, null); }
                if (e.key === 'u') { e.preventDefault(); document.execCommand('underline', false, null); }
            }
        });
    }

    // Expose for Generator
    window.anki = anki;

    // Start
    // --- Init ---
    checkConnection();

    // Restore last active tab or use URL param
    const urlParams = new URLSearchParams(window.location.search);
    const targetTabId = urlParams.get('tab') || localStorage.getItem('lastAnkiTab') || 'generator';
    const initialTab = document.querySelector(`.nav-item[data-tab="${targetTabId}"]`);
    
    // Check for pending words from Quick Note
    const pendingWords = localStorage.getItem('lumina_pending_words');
    if (pendingWords) {
        // Ensure we are on the generator tab
        const genTab = document.querySelector('.nav-item[data-tab="generator"]');
        if (genTab) genTab.click();

        // Give a small delay for the DOM to settle if needed, but since it's already in DOM, we can try directly
        const checkExist = setInterval(() => {
            const batchInput = document.getElementById('batchInput');
            if (batchInput) {
                batchInput.value = pendingWords;
                // Trigger input event to update word count if any listener exists
                batchInput.dispatchEvent(new Event('input', { bubbles: true }));
                localStorage.removeItem('lumina_pending_words');
                clearInterval(checkExist);
            }
        }, 100);
        
        // Timeout after 5 seconds to avoid infinite loop
        setTimeout(() => clearInterval(checkExist), 5000);
    } else if (initialTab) {
        initialTab.click(); 
    } else {
        // Fallback to first tab if ID mismatch
        tabs[0]?.click();
    }

    // PWA Service Worker Registration
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('sw.js')
                .then(reg => console.log('Service Worker registered!'))
                .catch(err => console.log('Service Worker registration failed: ', err));
        });
    }
});
