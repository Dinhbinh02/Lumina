// Mock AnkiConnect client that redirects all actions to the extension's local storage database
class LocalAnkiMock {
    constructor() {
        this.version = 6;
    }

    async invoke(action, params = {}) {
        await LuminaFlashcardsDB.initPromise;
        if (action === 'deckNames') {
            return Object.values(LuminaFlashcardsDB.state.decks).map(d => d.name);
        }
        if (action === 'modelNames') {
            return Object.values(LuminaFlashcardsDB.state.templates).map(t => t.name);
        }
        if (action === 'modelFieldNames') {
            const t = Object.values(LuminaFlashcardsDB.state.templates).find(tmp => tmp.name === params.modelName);
            return t ? t.fields : ['Front', 'Back'];
        }
        return [];
    }

    async findNoteIds(query) {
        return [];
    }

    async getNotesInfo(ids) {
        return [];
    }

    async addNotes(notes) {
        await LuminaFlashcardsDB.initPromise;
        const results = [];
        for (const note of notes) {
            const deck = Object.values(LuminaFlashcardsDB.state.decks).find(d => d.name === note.deckName);
            const deckId = deck ? deck.id : 'deck_default';

            const t = Object.values(LuminaFlashcardsDB.state.templates).find(tmp => tmp.name === note.modelName);
            const templateId = t ? t.id : 'tpl_default';

            const cardId = await LuminaFlashcardsDB.addCard(deckId, templateId, note.fields);
            results.push(cardId);
        }
        // Force refresh deck view after import
        const pageInstance = window.LuminaFlashcardsUI;
        if (pageInstance && typeof pageInstance.renderDecks === 'function') {
            pageInstance.renderDecks();
        }
        return results;
    }

    async sync() {
        return true;
    }
}

// Global window registration
window.anki = new LocalAnkiMock();

class FlashcardsPage {
    constructor() {
        this.currentTab = 'decks';
        this.collapsedDecks = new Set();
        this.activeTemplateId = null;
        this.activeCardId = null;
        this.studySession = {
            cards: [],
            currentIndex: 0
        };
        this.init();
    }

    async init() {
        // Wait for DB initialization
        if (typeof LuminaFlashcardsDB !== 'undefined') {
            await LuminaFlashcardsDB.initPromise;
        }

        // All flashcard logic runs locally in the extension database.
        
        this.bindEvents();
        this.renderAll();

        // Listen for dictionary popup triggers to add flashcards
        chrome.runtime.onMessage.addListener((request) => {
            if (request.action === 'add_to_flashcards') {
                this.openPage();
                this.switchTab('cards');
                this.openCardModal(null);
                
                setTimeout(() => {
                    const frontInput = document.querySelector('.fc-field-input[data-field="Front"]');
                    const backInput = document.querySelector('.fc-field-input[data-field="Back"]');
                    if (frontInput) frontInput.value = request.word || '';
                    if (backInput) backInput.value = request.definition || '';
                }, 150);
            }
        });
    }

    openPage() {
        const splitContainer = document.getElementById('split-container');
        const sparksPage = document.getElementById('sparks-page');
        const flashcardsPage = document.getElementById('flashcards-page');
        
        if (splitContainer && flashcardsPage) {
            // Close sparks first if open
            if (typeof sparksClosePage === 'function') sparksClosePage();
            
            splitContainer.style.display = 'none';
            if (sparksPage) sparksPage.style.display = 'none';
            
            flashcardsPage.style.display = 'flex';
            document.getElementById('sidebar-flashcards-btn')?.classList.add('active');
            document.querySelectorAll('.recent-chat-item.active').forEach(el => el.classList.remove('active'));
            this.renderAll();
        }
    }

    closePage() {
        const splitContainer = document.getElementById('split-container');
        const flashcardsPage = document.getElementById('flashcards-page');
        
        if (splitContainer && flashcardsPage && flashcardsPage.style.display !== 'none') {
            flashcardsPage.style.display = 'none';
            splitContainer.style.display = 'flex';
            document.getElementById('sidebar-flashcards-btn')?.classList.remove('active');
        }
    }

    bindEvents() {
        // Tab switching
        document.querySelectorAll('.flashcards-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.switchTab(btn.dataset.tab);
            });
        });

        // Decks actions
        const addDeckBtn = document.getElementById('fc-add-deck-btn');
        if (addDeckBtn) {
            addDeckBtn.addEventListener('click', async () => {
                const name = prompt('Enter new deck name:');
                if (name && name.trim()) {
                    await LuminaFlashcardsDB.addDeck(name.trim());
                    this.renderDecks();
                    this.updateDropdowns();
                }
            });
        }

        // Cards controls
        const newCardBtn = document.getElementById('fc-new-card-btn');
        if (newCardBtn) {
            newCardBtn.addEventListener('click', () => this.openCardModal());
        }

        const batchImportBtn = document.getElementById('fc-batch-import-btn');
        if (batchImportBtn) {
            batchImportBtn.addEventListener('click', () => this.openBatchModal());
        }

        const cardSearch = document.getElementById('fc-card-search');
        if (cardSearch) {
            cardSearch.addEventListener('input', () => this.renderCardsTable());
        }

        const deckFilter = document.getElementById('fc-deck-filter');
        if (deckFilter) {
            deckFilter.addEventListener('change', () => this.renderCardsTable());
        }

        // Templates actions
        const newTemplateBtn = document.getElementById('fc-new-template-btn');
        if (newTemplateBtn) {
            newTemplateBtn.addEventListener('click', () => this.createNewTemplateForm());
        }

        const saveTemplateBtn = document.getElementById('fc-save-template-btn');
        if (saveTemplateBtn) {
            saveTemplateBtn.addEventListener('click', () => this.saveTemplate());
        }

        const deleteTemplateBtn = document.getElementById('fc-delete-template-btn');
        if (deleteTemplateBtn) {
            deleteTemplateBtn.addEventListener('click', () => this.deleteTemplate());
        }

        // Modals closing
        document.getElementById('fc-close-card-modal-btn')?.addEventListener('click', () => this.closeCardModal());
        document.getElementById('fc-card-cancel-btn')?.addEventListener('click', () => this.closeCardModal());
        document.getElementById('fc-close-batch-modal-btn')?.addEventListener('click', () => this.closeBatchModal());
        document.getElementById('fc-batch-cancel-btn')?.addEventListener('click', () => this.closeBatchModal());

        // Modal card save
        document.getElementById('fc-card-save-btn')?.addEventListener('click', () => this.saveCard());

        // Template select triggers dynamic fields inside editor
        document.getElementById('fc-card-tpl-select')?.addEventListener('change', (e) => {
            this.renderModalFields(e.target.value);
        });

        // Batch save
        document.getElementById('fc-batch-save-btn')?.addEventListener('click', () => this.saveBatchImport());

        // Study overlay
        document.getElementById('fc-start-review-btn')?.addEventListener('click', () => this.startStudySession());
        document.getElementById('fc-close-study-btn')?.addEventListener('click', () => this.closeStudySession());
        
        const flashcardElement = document.getElementById('fc-flashcard');
        if (flashcardElement) {
            flashcardElement.addEventListener('click', () => this.flipCard());
        }
        document.getElementById('fc-show-answer-btn')?.addEventListener('click', () => this.flipCard());

        document.querySelectorAll('.fc-ans-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const quality = parseInt(btn.dataset.quality);
                this.answerCurrentCard(quality);
            });
        });

        // Sidebar Flashcards Button click toggle
        document.getElementById('sidebar-flashcards-btn')?.addEventListener('click', () => {
            const page = document.getElementById('flashcards-page');
            if (page && page.style.display !== 'none') {
                this.closePage();
            } else {
                this.openPage();
            }
        });

        // Close flashcards when starting new chats or selecting a chat session
        document.getElementById('sidebar-new-chat-btn')?.addEventListener('click', () => this.closePage());
        document.getElementById('topbar-new-chat-btn')?.addEventListener('click', () => this.closePage());
        document.getElementById('sidebar-new-spark-btn')?.addEventListener('click', () => this.closePage());
        
        document.addEventListener('click', (e) => {
            // Close if clicked recent chat or spark item
            if (e.target.closest('.recent-chat-item') || e.target.closest('#sidebar-sparks-list')) {
                this.closePage();
            }
            if (e.target.closest('#sidebar-sparks-btn')) {
                this.closePage();
            }
        });
    }

    switchTab(tabName) {
        this.currentTab = tabName;
        document.querySelectorAll('.flashcards-tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });
        document.querySelectorAll('.flashcards-tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `fc-tab-${tabName}`);
        });

        this.renderAll();
    }

    renderAll() {
        this.renderDashboard();
        if (this.currentTab === 'decks') this.renderDecks();
        if (this.currentTab === 'cards') {
            this.updateDropdowns();
            this.renderCardsTable();
        }
    }

    // --- Dashboard ---
    renderDashboard() {
        const now = Date.now();
        const cards = LuminaFlashcardsDB.state.cards;
        
        const dueCount = cards.filter(c => c.srs.dueDate <= now).length;
        const newCount = cards.filter(c => c.srs.repetitions === 0).length;

        document.getElementById('fc-stat-due').textContent = dueCount;
        document.getElementById('fc-stat-new').textContent = newCount;
        // Mock streak or fetch from daily log
        document.getElementById('fc-stat-streak').textContent = "5"; 
    }

    // --- Decks ---
    renderDecks() {
        const tbody = document.getElementById('fc-decks-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        const decks = LuminaFlashcardsDB.state.decks;
        const cards = LuminaFlashcardsDB.state.cards;
        const now = Date.now();

        // Sort decks alphabetically to keep hierarchy parent-first
        const sortedDecks = Object.values(decks).sort((a, b) => a.name.localeCompare(b.name));

        if (sortedDecks.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">No decks found.</td></tr>';
            return;
        }

        sortedDecks.forEach(deck => {
            const parts = deck.name.split('::');
            const depth = parts.length - 1;
            const displayName = parts[parts.length - 1];

            // Check if any ancestor is collapsed
            let isHidden = false;
            let currentPrefix = '';
            for (let i = 0; i < parts.length - 1; i++) {
                currentPrefix = currentPrefix ? `${currentPrefix}::${parts[i]}` : parts[i];
                if (this.collapsedDecks.has(currentPrefix)) {
                    isHidden = true;
                    break;
                }
            }

            // Filter cards matching this deck (and subdecks)
            const deckCards = cards.filter(c => c.deckId === deck.id);
            
            const newCount = deckCards.filter(c => c.srs.repetitions === 0).length;
            const learnCount = deckCards.filter(c => c.srs.repetitions > 0 && c.srs.interval <= 1).length;
            const dueCount = deckCards.filter(c => c.srs.repetitions > 0 && c.srs.interval > 1 && c.srs.dueDate <= now).length;

            const hasSubdecks = sortedDecks.some(d => d.name.startsWith(deck.name + '::'));
            const isCollapsed = this.collapsedDecks.has(deck.name);

            const row = document.createElement('tr');
            row.style.cursor = 'pointer';
            row.className = 'fc-deck-row';
            if (isHidden) {
                row.style.display = 'none';
            }

            row.innerHTML = `
                <td style="padding-left: ${16 + (depth * 20)}px; font-weight: ${depth === 0 ? '600' : 'normal'}; display: flex; align-items: center; gap: 4px;">
                    ${hasSubdecks 
                        ? `<span class="fc-deck-toggle" style="cursor: pointer; padding: 2px 6px; font-size: 10px; opacity: 0.7; user-select: none;">${isCollapsed ? '▶' : '▼'}</span>` 
                        : `<span style="width: 20px; display: inline-block;"></span>`
                    }
                    <span style="opacity: 0.5; margin-right: 4px;">${depth > 0 ? '└─' : '•'}</span>
                    ${displayName}
                </td>
                <td style="text-align: center; font-weight: 600; color: ${newCount > 0 ? '#2563eb' : '#94a3b8'};">${newCount}</td>
                <td style="text-align: center; font-weight: 600; color: ${learnCount > 0 ? '#ea580c' : '#94a3b8'};">${learnCount}</td>
                <td style="text-align: center; font-weight: 600; color: ${dueCount > 0 ? '#16a34a' : '#94a3b8'};">${dueCount}</td>
                <td style="text-align: right; padding-right: 16px;">
                    <button class="fc-deck-settings-btn" style="background: transparent; border: none; cursor: pointer; padding: 4px 8px; font-size: 14px; opacity: 0.6; display: flex; align-items: center; justify-content: center; margin-left: auto;">
                        ⚙
                    </button>
                </td>
            `;

            // Toggle collapse when clicking chevron icon
            row.querySelector('.fc-deck-toggle')?.addEventListener('click', (e) => {
                e.stopPropagation();
                if (isCollapsed) {
                    this.collapsedDecks.delete(deck.name);
                } else {
                    this.collapsedDecks.add(deck.name);
                }
                this.renderDecks();
            });

            // Row click starts review session
            row.addEventListener('click', (e) => {
                if (e.target.classList.contains('fc-deck-settings-btn') || e.target.classList.contains('fc-deck-toggle')) {
                    return;
                }
                this.startStudySession(deck.id);
            });

            // Settings gear dropdown menu
            row.querySelector('.fc-deck-settings-btn')?.addEventListener('click', (e) => {
                e.stopPropagation();
                
                // Remove existing menu if open
                const existing = document.getElementById('fc-deck-context-menu');
                if (existing) existing.remove();

                const menu = document.createElement('div');
                menu.id = 'fc-deck-context-menu';
                menu.style.position = 'absolute';
                menu.style.background = 'var(--lumina-ui-bg, #ffffff)';
                menu.style.border = '1px solid var(--lumina-ui-border, rgba(0,0,0,0.06))';
                menu.style.borderRadius = '8px';
                menu.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
                menu.style.padding = '4px 0';
                menu.style.zIndex = '1000';
                menu.style.minWidth = '110px';
                
                menu.innerHTML = `
                    <div class="fc-menu-item" style="padding: 8px 16px; cursor: pointer; font-size: 13px; font-weight: 500;" id="fc-menu-rename">Rename</div>
                    ${deck.id !== 'deck_default' ? `<div class="fc-menu-item" style="padding: 8px 16px; cursor: pointer; font-size: 13px; font-weight: 500; color: #ef4444; border-top: 1px solid var(--lumina-ui-border, rgba(0,0,0,0.04));" id="fc-menu-delete">Delete</div>` : ''}
                `;

                const rect = e.target.getBoundingClientRect();
                menu.style.top = `${rect.bottom + window.scrollY}px`;
                menu.style.left = `${rect.left + window.scrollX - 85}px`;
                document.body.appendChild(menu);

                // Rename action
                menu.querySelector('#fc-menu-rename').onclick = async (evt) => {
                    evt.stopPropagation();
                    const name = prompt('Rename deck:', deck.name);
                    if (name && name.trim()) {
                        await LuminaFlashcardsDB.renameDeck(deck.id, name.trim());
                        this.renderDecks();
                    }
                    menu.remove();
                };

                // Delete action
                const deleteItem = menu.querySelector('#fc-menu-delete');
                if (deleteItem) {
                    deleteItem.onclick = async (evt) => {
                        evt.stopPropagation();
                        if (confirm('Delete this deck? Cards inside will be moved to the General Vocabulary deck.')) {
                            await LuminaFlashcardsDB.deleteDeck(deck.id, false);
                            this.renderDecks();
                        }
                        menu.remove();
                    };
                }

                // Close menu when clicking anywhere else
                const onOutsideClick = () => {
                    menu.remove();
                    document.removeEventListener('click', onOutsideClick);
                };
                setTimeout(() => document.addEventListener('click', onOutsideClick), 50);
            });

            tbody.appendChild(row);
        });

        // Update heatmap local rendering
        this.renderHeatmap();



        // Update studied summary stats from local cards
        this.updateStudiedSummary();
    }

    updateStudiedSummary() {
        const summaryEl = document.getElementById('fc-decks-studied-summary');
        if (!summaryEl) return;

        const cards = LuminaFlashcardsDB.state.cards;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayStart = today.getTime();

        const studiedToday = cards.filter(c => c.updatedAt >= todayStart && c.srs.repetitions > 0).length;
        summaryEl.textContent = `Studied ${studiedToday} card(s) today.`;
    }

    renderHeatmap() {
        const container = document.getElementById('cal-heatmap');
        if (!container) return;
        container.innerHTML = '';

        const cards = LuminaFlashcardsDB.state.cards;
        const reviewCounts = {};

        // Group cards updated time by day
        cards.forEach(c => {
            if (c.updatedAt) {
                const dateStr = new Date(c.updatedAt).toDateString();
                reviewCounts[dateStr] = (reviewCounts[dateStr] || 0) + 1;
            }
        });

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', '100%');
        svg.setAttribute('height', '110');
        svg.setAttribute('viewBox', '0 0 680 110');
        svg.style.fontFamily = 'inherit';
        svg.style.maxWidth = '680px';
        svg.style.display = 'block';
        svg.style.margin = '0 auto';

        const cellSize = 10;
        const cellGap = 2;
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

        // Get date 365 days ago aligned to start of week (Sunday)
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 365);
        const startDay = startDate.getDay();
        startDate.setDate(startDate.getDate() - startDay); // Shift to Sunday

        let currentDate = new Date(startDate);

        for (let col = 0; col < 53; col++) {
            const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            g.setAttribute('transform', `translate(${col * (cellSize + cellGap) + 40}, 15)`);

            for (let row = 0; row < 7; row++) {
                const dateStr = currentDate.toDateString();
                const count = reviewCounts[dateStr] || 0;

                const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                rect.setAttribute('width', cellSize);
                rect.setAttribute('height', cellSize);
                rect.setAttribute('y', row * (cellSize + cellGap));
                rect.setAttribute('rx', '2');
                
                // Color levels matching local review counts
                let color = 'var(--lumina-ui-border, rgba(0,0,0,0.06))'; 
                if (count > 0 && count <= 2) color = '#bbf7d0'; 
                else if (count > 2 && count <= 5) color = '#4ade80'; 
                else if (count > 5) color = '#15803d'; 

                rect.setAttribute('fill', color);
                
                const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
                title.textContent = `${dateStr}: ${count} card(s) updated`;
                rect.appendChild(title);

                g.appendChild(rect);
                currentDate.setDate(currentDate.getDate() + 1);
            }
            svg.appendChild(g);
        }

        // Draw weekday labels
        for (let i = 1; i < 7; i += 2) {
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', '5');
            text.setAttribute('y', 15 + i * (cellSize + cellGap) + 9);
            text.setAttribute('fill', 'var(--lumina-text-secondary, #757575)');
            text.setAttribute('font-size', '9');
            text.textContent = days[i];
        }
        container.appendChild(svg);

        // Calculate statistics based on local reviews
        const uniqueDays = Object.keys(reviewCounts).map(d => new Date(d).getTime()).sort((a, b) => a - b);
        const totalReviews = Object.values(reviewCounts).reduce((a, b) => a + b, 0);
        
        const dailyAvg = uniqueDays.length > 0 ? Math.round(totalReviews / uniqueDays.length) : 0;
        const daysLearned = Math.round((uniqueDays.length / 365) * 100);

        let longestStreak = 0;
        let currentStreak = 0;
        let tempStreak = 0;

        const tsArray = uniqueDays.map(t => {
            const d = new Date(t);
            d.setHours(0, 0, 0, 0);
            return Math.floor(d.getTime() / 1000);
        });

        for (let i = 0; i < tsArray.length; i++) {
            if (i > 0 && tsArray[i] === tsArray[i - 1] + 86400) {
                tempStreak++;
            } else {
                tempStreak = 1;
            }
            if (tempStreak > longestStreak) longestStreak = tempStreak;
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayTs = Math.floor(today.getTime() / 1000);
        const yesterdayTs = todayTs - 86400;

        if (tsArray.includes(todayTs) || tsArray.includes(yesterdayTs)) {
            let checkTs = tsArray.includes(todayTs) ? todayTs : yesterdayTs;
            let idx = tsArray.indexOf(checkTs);
            while (idx >= 0 && tsArray[idx] === checkTs) {
                currentStreak++;
                checkTs -= 86400;
                idx = tsArray.indexOf(checkTs);
            }
        }

        const statsDiv = document.createElement('div');
        statsDiv.style.display = 'flex';
        statsDiv.style.justifyContent = 'center';
        statsDiv.style.flexWrap = 'wrap';
        statsDiv.style.gap = '16px';
        statsDiv.style.marginTop = '12px';
        statsDiv.style.fontSize = '12px';
        statsDiv.style.fontWeight = '500';
        statsDiv.style.color = 'var(--lumina-text-secondary, #757575)';
        statsDiv.style.width = '100%';
        statsDiv.style.maxWidth = '680px';
        statsDiv.style.margin = '12px auto 0 auto';
        
        statsDiv.innerHTML = `
            <span>Daily average: <strong style="color: #16a34a;">${dailyAvg} cards</strong></span>
            <span>Days learned: <strong style="color: #16a34a;">${daysLearned}%</strong></span>
            <span>Longest streak: <strong style="color: #16a34a;">${longestStreak} days</strong></span>
            <span>Current streak: <strong style="color: #16a34a;">${currentStreak} days</strong></span>
        `;
        
        container.appendChild(statsDiv);
    }

    // --- Cards Table ---
    renderCardsTable() {
        const tbody = document.getElementById('fc-cards-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        const searchQuery = document.getElementById('fc-card-search').value.toLowerCase();
        const deckFilter = document.getElementById('fc-deck-filter').value;
        const cards = LuminaFlashcardsDB.state.cards;
        const decks = LuminaFlashcardsDB.state.decks;

        const filtered = cards.filter(card => {
            const matchDeck = deckFilter === 'all' || card.deckId === deckFilter;
            const cardFieldsStr = Object.values(card.fields).join(' ').toLowerCase();
            const matchSearch = cardFieldsStr.includes(searchQuery);
            return matchDeck && matchSearch;
        });

        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">No cards found.</td></tr>';
            return;
        }

        filtered.forEach(card => {
            const tr = document.createElement('tr');
            const deckName = decks[card.deckId]?.name || 'Unknown';
            const frontVal = card.fields.Front || Object.values(card.fields)[0] || '';
            const backVal = card.fields.Back || Object.values(card.fields)[1] || '';
            const dueStr = new Date(card.srs.dueDate).toLocaleDateString();

            tr.innerHTML = `
                <td><strong>${deckName}</strong></td>
                <td>
                    <div class="fc-card-text-preview"><strong>F:</strong> ${frontVal}</div>
                    <div class="fc-card-text-preview"><strong>B:</strong> ${backVal}</div>
                </td>
                <td>${card.srs.interval} days</td>
                <td>${dueStr}</td>
                <td>
                    <button class="fc-btn-secondary fc-card-edit" data-id="${card.id}" style="padding: 6px 12px; font-size:12px;">Edit</button>
                    <button class="fc-btn-danger fc-card-delete" data-id="${card.id}" style="padding: 6px 12px; font-size:12px; background:#ef4444; color:white;">Delete</button>
                </td>
            `;

            tr.querySelector('.fc-card-edit').addEventListener('click', () => this.openCardModal(card.id));
            tr.querySelector('.fc-card-delete').addEventListener('click', async () => {
                if (confirm('Delete this card?')) {
                    await LuminaFlashcardsDB.deleteCard(card.id);
                    this.renderCardsTable();
                }
            });

            tbody.appendChild(tr);
        });
    }

    updateDropdowns() {
        const deckFilter = document.getElementById('fc-deck-filter');
        if (deckFilter) {
            const savedVal = deckFilter.value;
            deckFilter.innerHTML = '<option value="all">All Decks</option>';
            Object.values(LuminaFlashcardsDB.state.decks).forEach(d => {
                deckFilter.innerHTML += `<option value="${d.id}">${d.name}</option>`;
            });
            deckFilter.value = savedVal || 'all';
        }
    }

    // --- Card Modals ---
    openCardModal(cardId = null) {
        this.activeCardId = cardId;
        const modal = document.getElementById('fc-card-modal');
        const title = document.getElementById('fc-card-modal-title');
        
        const deckSelect = document.getElementById('fc-card-deck-select');
        const tplSelect = document.getElementById('fc-card-tpl-select');
        
        deckSelect.innerHTML = '';
        Object.values(LuminaFlashcardsDB.state.decks).forEach(d => {
            deckSelect.innerHTML += `<option value="${d.id}">${d.name}</option>`;
        });

        tplSelect.innerHTML = '';
        Object.values(LuminaFlashcardsDB.state.templates).forEach(t => {
            tplSelect.innerHTML += `<option value="${t.id}">${t.name}</option>`;
        });

        if (cardId) {
            title.textContent = 'Edit Card';
            const card = LuminaFlashcardsDB.state.cards.find(c => c.id === cardId);
            deckSelect.value = card.deckId;
            tplSelect.value = card.templateId;
            this.renderModalFields(card.templateId, card.fields);
        } else {
            title.textContent = 'Add Card';
            tplSelect.value = 'tpl_default';
            this.renderModalFields('tpl_default');
        }

        modal.style.display = 'flex';
    }

    closeCardModal() {
        document.getElementById('fc-card-modal').style.display = 'none';
        this.activeCardId = null;
    }

    renderModalFields(tplId, values = {}) {
        const container = document.getElementById('fc-card-fields-container');
        container.innerHTML = '';
        const template = LuminaFlashcardsDB.state.templates[tplId];
        if (!template) return;

        template.fields.forEach(f => {
            const val = values[f] || '';
            const group = document.createElement('div');
            group.className = 'fc-form-group';
            group.innerHTML = `
                <label>${f}</label>
                <textarea class="fc-textarea fc-field-input" data-field="${f}">${val}</textarea>
            `;
            container.appendChild(group);
        });
    }

    async saveCard() {
        const deckId = document.getElementById('fc-card-deck-select').value;
        const templateId = document.getElementById('fc-card-tpl-select').value;
        
        const fields = {};
        document.querySelectorAll('.fc-field-input').forEach(textarea => {
            fields[textarea.dataset.field] = textarea.value;
        });

        if (this.activeCardId) {
            await LuminaFlashcardsDB.updateCard(this.activeCardId, fields);
            await LuminaFlashcardsDB.moveCard(this.activeCardId, deckId);
        } else {
            await LuminaFlashcardsDB.addCard(deckId, templateId, fields);
        }

        this.closeCardModal();
        this.renderAll();
    }

    // --- Batch Import ---
    openBatchModal() {
        const modal = document.getElementById('fc-batch-modal');
        const deckSelect = document.getElementById('fc-batch-deck-select');
        const tplSelect = document.getElementById('fc-batch-tpl-select');

        deckSelect.innerHTML = '';
        Object.values(LuminaFlashcardsDB.state.decks).forEach(d => {
            deckSelect.innerHTML += `<option value="${d.id}">${d.name}</option>`;
        });

        tplSelect.innerHTML = '';
        Object.values(LuminaFlashcardsDB.state.templates).forEach(t => {
            tplSelect.innerHTML += `<option value="${t.id}">${t.name}</option>`;
        });

        modal.style.display = 'flex';
    }

    closeBatchModal() {
        document.getElementById('fc-batch-modal').style.display = 'none';
        document.getElementById('fc-batch-textarea').value = '';
    }

    async saveBatchImport() {
        const deckId = document.getElementById('fc-batch-deck-select').value;
        const templateId = document.getElementById('fc-batch-tpl-select').value;
        const text = document.getElementById('fc-batch-textarea').value;
        const template = LuminaFlashcardsDB.state.templates[templateId];

        if (!text.trim() || !template) return;

        const lines = text.split('\n');
        for (let line of lines) {
            line = line.trim();
            if (!line) continue;

            const parts = line.split('|').map(p => p.trim());
            const fields = {};
            
            // Map pipe separated parts to template fields
            template.fields.forEach((fieldName, index) => {
                fields[fieldName] = parts[index] || '';
            });

            await LuminaFlashcardsDB.addCard(deckId, templateId, fields);
        }

        this.closeBatchModal();
        this.renderAll();
    }

    // --- Study Overlay & Card Flip Review ---
    startStudySession(deckId = null) {
        const now = Date.now();
        const cards = LuminaFlashcardsDB.state.cards;
        
        // Filter cards due today in specific deck or all decks
        let dueCards = cards.filter(c => c.srs.dueDate <= now);
        if (deckId) {
            dueCards = dueCards.filter(c => c.deckId === deckId);
        }

        if (dueCards.length === 0) {
            alert('No cards due for review in this deck!');
            return;
        }

        // Shuffle cards for a randomized review session
        this.studySession = {
            cards: dueCards.sort(() => Math.random() - 0.5),
            currentIndex: 0
        };

        const overlay = document.getElementById('fc-study-overlay');
        const deckName = deckId ? (LuminaFlashcardsDB.state.decks[deckId]?.name || 'Deck') : 'All Decks';
        document.getElementById('fc-study-deck-name').textContent = `${deckName} (1/${dueCards.length})`;

        overlay.style.display = 'flex';
        this.renderCurrentStudyCard();
    }

    closeStudySession() {
        document.getElementById('fc-study-overlay').style.display = 'none';
        this.renderDashboard();
    }

    renderCurrentStudyCard() {
        const session = this.studySession;
        const card = session.cards[session.currentIndex];
        if (!card) {
            alert('Study session complete!');
            this.closeStudySession();
            return;
        }

        const countText = `${session.currentIndex + 1}/${session.cards.length}`;
        document.getElementById('fc-study-deck-name').textContent = countText;

        const tpl = LuminaFlashcardsDB.state.templates[card.templateId] || LuminaFlashcardsDB.state.templates['tpl_default'];

        // Card flipper state reset
        const cardElement = document.getElementById('fc-flashcard');
        cardElement.classList.remove('flipped');
        document.getElementById('fc-show-answer-btn').style.display = 'block';
        document.getElementById('fc-answer-buttons').style.display = 'none';

        // Custom template styles compilation
        let styleTag = document.getElementById('fc-custom-tpl-styles');
        if (!styleTag) {
            styleTag = document.createElement('style');
            styleTag.id = 'fc-custom-tpl-styles';
            document.head.appendChild(styleTag);
        }
        styleTag.innerHTML = tpl.css || '';

        // Compile HTML by replacing placeholders: {{FieldName}}
        const renderHtml = (htmlStr) => {
            let res = htmlStr;
            Object.entries(card.fields).forEach(([fName, val]) => {
                res = res.replaceAll(`{{${fName}}}`, val);
            });
            return res;
        };

        document.getElementById('fc-card-front-content').innerHTML = renderHtml(tpl.frontHtml);
        document.getElementById('fc-card-back-content').innerHTML = renderHtml(tpl.backHtml);
    }

    flipCard() {
        const cardElement = document.getElementById('fc-flashcard');
        if (!cardElement.classList.contains('flipped')) {
            cardElement.classList.add('flipped');
            document.getElementById('fc-show-answer-btn').style.display = 'none';
            document.getElementById('fc-answer-buttons').style.display = 'grid';
        }
    }

    async answerCurrentCard(quality) {
        const session = this.studySession;
        const card = session.cards[session.currentIndex];
        if (!card) return;

        await LuminaFlashcardsDB.answerCard(card.id, quality);

        // Move to next card
        session.currentIndex += 1;
        if (session.currentIndex >= session.cards.length) {
            alert('Amazing! You finished all your cards for today!');
            this.closeStudySession();
        } else {
            this.renderCurrentStudyCard();
        }
    }
}

// Inject page controller on DOM Load
document.addEventListener('DOMContentLoaded', () => {
    window.LuminaFlashcardsUI = new FlashcardsPage();
});
