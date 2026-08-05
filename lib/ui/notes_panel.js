/**
 * notes_panel.js
 * UI Logic for Lumina Notes & BlockNote Integration (Apple Notes Toolbar Style)
 */

class NotesPanel {
    constructor() {
        this.activeCollectionId = 'all';
        this.activeNoteId = null;
        this.blocknoteInstance = null;
        this.autoSaveTimer = null;
        this.isInitialized = false;
        this.sortMode = 'modified'; // 'modified' | 'created' | 'az'
        this._contextMenu = null;
    }

    async init(targetNoteId) {
        this.cacheElements();
        if (!this.isInitialized) {
            this.bindEvents();
            this.bindSortBar();
            this.initCollectionPickerPill();
            this.isInitialized = true;
        }
        if (targetNoteId) {
            this.activeNoteId = targetNoteId;
            // Pre-set title directly from DB to prevent "Untitled Note" flashing
            try {
                const note = await NotesManager.getNote(targetNoteId);
                if (note && this.noteTitleInput) {
                    this.noteTitleInput.value = note.title || '';
                }
            } catch (e) {
                console.warn('Pre-fetch title error:', e);
            }
        }
        await this.renderCollections();
        await this.renderNotesList('', targetNoteId);
    }

    bindSortBar() {
        const controls = document.getElementById('notes-sort-controls');
        if (!controls) return;
        controls.addEventListener('click', (e) => {
            const btn = e.target.closest('.notes-sort-btn');
            if (!btn) return;
            controls.querySelectorAll('.notes-sort-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            this.sortMode = btn.getAttribute('data-sort');
            this.renderNotesList(this.notesSearchInput?.value?.trim()?.toLowerCase() || '');
        });
    }

    timeAgo(ts) {
        const now = Date.now();
        const diff = now - ts;
        const mins = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);
        if (mins < 1) return 'Just now';
        if (mins < 60) return `${mins}m ago`;
        if (hours < 24) return `${hours}h ago`;
        if (days === 1) return 'Yesterday';
        if (days < 7) return `${days}d ago`;
        return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }

    cacheElements() {
        this.container = document.getElementById('notes-page');
        this.collectionsList = document.getElementById('notes-collections-list');
        this.notesList = document.getElementById('notes-list');
        this.newCollectionBtn = document.getElementById('notes-new-collection-btn');
        this.newNoteBtn = document.getElementById('notes-new-note-btn');
        this.noteTitleInput = document.getElementById('note-title-input');
        this.editorContainer = document.getElementById('editorjs');
        this.notesSearchInput = document.getElementById('notes-search-input');
        this.notesEmptyState = document.getElementById('notes-empty-state');
        this.notesEditorPane = document.getElementById('notes-editor-pane');

        // Immediately restore saved sidebar width to prevent width jump/flash on reload
        const leftPane = document.querySelector('.notes-sidebar-pane');
        const rightPane = document.querySelector('.notes-editor-pane');
        if (leftPane) {
            const savedWidth = localStorage.getItem('lumina_notes_sidebar_width');
            const width = savedWidth ? parseInt(savedWidth, 10) : 260;
            leftPane.style.width = `${width}px`;
            leftPane.style.flex = `0 0 ${width}px`;
            if (rightPane) rightPane.style.flex = `1 1 0%`;
        }

        // Apple Notes Toolbar Elements
        this.tbH1 = document.getElementById('note-tb-h1');
        this.tbH2 = document.getElementById('note-tb-h2');
        this.tbH3 = document.getElementById('note-tb-h3');
        this.tbChecklist = document.getElementById('note-tb-checklist');
        this.tbBullet = document.getElementById('note-tb-bullet');
        this.tbNumber = document.getElementById('note-tb-number');
        this.tbTable = document.getElementById('note-tb-table');
        this.tbImage = document.getElementById('note-tb-image');
        this.tbUndo = document.getElementById('note-tb-undo');
        this.tbRedo = document.getElementById('note-tb-redo');
        this.tbCopy = document.getElementById('note-tb-copy');
        this.tbMore = document.getElementById('note-tb-more');
        this.moreMenu = document.getElementById('notes-more-menu');
        this.actionExport = document.getElementById('note-action-export-md');
        this.actionDelete = document.getElementById('note-action-delete');

        // Word count pill
        this.wordCountEl = document.getElementById('notes-word-count');

        // Collection Picker Pill Elements
        this.colPickerWrapper = document.getElementById('notes-col-picker-wrapper');
        this.colPickerPill = document.getElementById('notes-col-picker-pill');
        this.colPickerLabel = document.getElementById('notes-col-picker-label');
        this.colPickerDropdown = document.getElementById('notes-col-picker-dropdown');
    }

    bindEvents() {
        if (this.newCollectionBtn) {
            this.newCollectionBtn.addEventListener('click', () => this.handleCreateCollection());
        }

        if (this.newNoteBtn) {
            this.newNoteBtn.addEventListener('click', () => this.handleCreateNote());
        }

        if (this.noteTitleInput) {
            this.noteTitleInput.addEventListener('input', (e) => {
                const titleVal = e.target.value.trim() || 'Untitled Note';
                document.title = titleVal;
                this.triggerAutoSave();
            });

            this.noteTitleInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const ed = this.blocknoteInstance?.editor;
                    if (!ed) return;

                    try {
                        const doc = ed.document;
                        if (doc && doc.length > 0) {
                            const firstBlock = doc[0];
                            const isEmpty = !firstBlock.content ||
                                            firstBlock.content.length === 0 ||
                                            (firstBlock.content.length === 1 && !firstBlock.content[0].text);

                            if (isEmpty) {
                                // If first block is already empty, focus to it directly
                                ed.setTextCursorPosition(firstBlock, 'start');
                            } else {
                                // If first block has text/content, insert a new empty paragraph before it and focus
                                const newBlocks = ed.insertBlocks(
                                    [{ type: 'paragraph' }],
                                    firstBlock,
                                    'before'
                                );
                                if (newBlocks && newBlocks[0]) {
                                    ed.setTextCursorPosition(newBlocks[0], 'start');
                                }
                            }
                        } else {
                            // If doc has no blocks, insert a new paragraph
                            const newBlocks = ed.insertBlocks([{ type: 'paragraph' }]);
                            if (newBlocks && newBlocks[0]) {
                                ed.setTextCursorPosition(newBlocks[0], 'start');
                            }
                        }
                        ed.focus();
                    } catch (err) {
                        console.warn('Enter key from title handler error:', err);
                    }
                }
            });
        }

        if (this.notesSearchInput) {
            this.notesSearchInput.addEventListener('input', (e) => {
                this.renderNotesList(e.target.value.trim().toLowerCase());
            });
        }

        // Helper to insert or convert block at active cursor position
        const insertOrUpdateBlock = (ed, blockSpec) => {
            if (!ed) return;
            try {
                const cursorPosition = ed.getTextCursorPosition();
                const currentBlock = cursorPosition?.block;

                const isEmpty = !currentBlock || 
                    !currentBlock.content || 
                    currentBlock.content.length === 0 || 
                    (currentBlock.content.length === 1 && !currentBlock.content[0].text);

                if (currentBlock && isEmpty) {
                    ed.updateBlock(currentBlock, blockSpec);
                } else {
                    ed.insertBlocks([blockSpec], currentBlock || undefined, 'after');
                }
                ed.focus();
            } catch (e) {
                console.warn('Failed to insert/update block:', e);
            }
        };

        // --- Toolbar Buttons ---
        if (this.tbH1) {
            this.tbH1.addEventListener('click', () => {
                const ed = this.blocknoteInstance?.editor;
                insertOrUpdateBlock(ed, {
                    type: 'heading',
                    props: { level: 1 },
                    content: [{ type: 'text', text: '', styles: {} }]
                });
            });
        }

        if (this.tbH2) {
            this.tbH2.addEventListener('click', () => {
                const ed = this.blocknoteInstance?.editor;
                insertOrUpdateBlock(ed, {
                    type: 'heading',
                    props: { level: 2 },
                    content: [{ type: 'text', text: '', styles: {} }]
                });
            });
        }

        if (this.tbH3) {
            this.tbH3.addEventListener('click', () => {
                const ed = this.blocknoteInstance?.editor;
                insertOrUpdateBlock(ed, {
                    type: 'heading',
                    props: { level: 3 },
                    content: [{ type: 'text', text: '', styles: {} }]
                });
            });
        }

        if (this.tbChecklist) {
            this.tbChecklist.addEventListener('click', () => {
                const ed = this.blocknoteInstance?.editor;
                insertOrUpdateBlock(ed, {
                    type: 'checkListItem',
                    content: [{ type: 'text', text: '', styles: {} }]
                });
            });
        }

        if (this.tbBullet) {
            this.tbBullet.addEventListener('click', () => {
                const ed = this.blocknoteInstance?.editor;
                insertOrUpdateBlock(ed, {
                    type: 'bulletListItem',
                    content: [{ type: 'text', text: '', styles: {} }]
                });
            });
        }

        if (this.tbNumber) {
            this.tbNumber.addEventListener('click', () => {
                const ed = this.blocknoteInstance?.editor;
                insertOrUpdateBlock(ed, {
                    type: 'numberedListItem',
                    content: [{ type: 'text', text: '', styles: {} }]
                });
            });
        }

        if (this.tbTable) {
            this.tbTable.addEventListener('click', () => {
                const ed = this.blocknoteInstance?.editor;
                insertOrUpdateBlock(ed, {
                    type: 'table',
                    content: {
                        type: 'tableContent',
                        rows: [
                            {
                                cells: [
                                    [{ type: 'text', text: '', styles: {} }],
                                    [{ type: 'text', text: '', styles: {} }]
                                ]
                            },
                            {
                                cells: [
                                    [{ type: 'text', text: '', styles: {} }],
                                    [{ type: 'text', text: '', styles: {} }]
                                ]
                            }
                        ]
                    }
                });
            });
        }

        if (this.tbImage) {
            this.tbImage.addEventListener('click', () => {
                const ed = this.blocknoteInstance?.editor;
                insertOrUpdateBlock(ed, {
                    type: 'image',
                    props: {
                        url: '',
                        caption: '',
                        name: ''
                    }
                });
            });
        }

        if (this.tbUndo) {
            this.tbUndo.addEventListener('click', () => {
                const ed = this.blocknoteInstance?.editor;
                if (ed?._tiptapEditor) {
                    ed._tiptapEditor.commands.undo();
                    ed.focus();
                }
            });
        }

        if (this.tbRedo) {
            this.tbRedo.addEventListener('click', () => {
                const ed = this.blocknoteInstance?.editor;
                if (ed?._tiptapEditor) {
                    ed._tiptapEditor.commands.redo();
                    ed.focus();
                }
            });
        }

        if (this.tbCopy) {
            this.tbCopy.addEventListener('click', async () => {
                if (!this.activeNoteId) return;
                const note = await NotesManager.getNote(this.activeNoteId);
                if (!note) return;
                const mdText = `# ${note.title || 'Untitled Note'}\n\n` + this.getNoteMarkdown(note);
                try {
                    await navigator.clipboard.writeText(mdText);
                    const originalTitle = this.tbCopy.getAttribute('title');
                    this.tbCopy.setAttribute('title', 'Copied!');
                    setTimeout(() => this.tbCopy.setAttribute('title', originalTitle), 1500);
                } catch (e) {
                    console.warn('Copy failed:', e);
                }
            });
        }

        if (this.tbMore && this.moreMenu) {
            this.tbMore.addEventListener('click', (e) => {
                e.stopPropagation();
                const isHidden = this.moreMenu.style.display === 'none';
                this.moreMenu.style.display = isHidden ? 'flex' : 'none';
            });

            document.addEventListener('click', (e) => {
                if (this.moreMenu && !e.target.closest('#notes-more-dropdown')) {
                    this.moreMenu.style.display = 'none';
                }
            });
        }

        if (this.actionExport) {
            this.actionExport.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (this.moreMenu) this.moreMenu.style.display = 'none';
                if (!this.activeNoteId) return;
                const note = await NotesManager.getNote(this.activeNoteId);
                if (!note) return;

                const mdText = `# ${note.title || 'Untitled Note'}\n\n` + this.getNoteMarkdown(note);
                const blob = new Blob([mdText], { type: 'text/markdown;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `${(note.title || 'Note').replace(/[^a-z0-9]/gi, '_')}.md`;
                link.click();
                URL.revokeObjectURL(url);
            });
        }

        if (this.actionDelete) {
            this.actionDelete.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.moreMenu) this.moreMenu.style.display = 'none';
                this.handleDeleteCurrentNote();
            });
        }

        // Bind Resizer Dragging
        this.bindResizer();
    }

    bindResizer() {
        const resizer = document.getElementById('notes-resizer');
        const leftPane = document.querySelector('.notes-sidebar-pane');
        const rightPane = document.querySelector('.notes-editor-pane');
        const notesContainer = document.getElementById('notes-page');

        if (resizer && leftPane && rightPane && notesContainer) {
            let isDragging = false;
            let animationFrameId = null;

            // Load saved width or default to 260px (matching Lumina main sidebar)
            const savedWidth = localStorage.getItem('lumina_notes_sidebar_width');
            const initialWidth = savedWidth ? parseInt(savedWidth, 10) : 260;
            leftPane.style.width = `${initialWidth}px`;
            leftPane.style.flex = `0 0 ${initialWidth}px`;
            rightPane.style.flex = `1 1 0%`;

            resizer.addEventListener('mousedown', (e) => {
                e.preventDefault();
                isDragging = true;
                resizer.classList.add('dragging');
                notesContainer.classList.add('dragging');
                document.body.style.cursor = 'col-resize';
            });

            document.addEventListener('mousemove', (e) => {
                if (!isDragging) return;
                if (animationFrameId) {
                    cancelAnimationFrame(animationFrameId);
                }
                animationFrameId = requestAnimationFrame(() => {
                    const containerRect = notesContainer.getBoundingClientRect();
                    let relativeX = e.clientX - containerRect.left;

                    // Boundaries: min 180px, max 450px
                    if (relativeX < 180) relativeX = 180;
                    if (relativeX > 450) relativeX = 450;

                    // Snap to 260px if close
                    if (Math.abs(relativeX - 260) < 6) {
                        relativeX = 260;
                    }

                    leftPane.style.width = `${relativeX}px`;
                    leftPane.style.flex = `0 0 ${relativeX}px`;
                    rightPane.style.flex = `1 1 0%`;

                    localStorage.setItem('lumina_notes_sidebar_width', relativeX.toString());
                });
            });

            document.addEventListener('mouseup', () => {
                if (isDragging) {
                    isDragging = false;
                    resizer.classList.remove('dragging');
                    notesContainer.classList.remove('dragging');
                    document.body.style.cursor = '';
                    if (animationFrameId) {
                        cancelAnimationFrame(animationFrameId);
                        animationFrameId = null;
                    }
                }
            });
        }
    }

    async renderCollections() {
        if (!this.collectionsList) return;
        const collections = await NotesManager.getCollections();

        // Fetch counts in parallel
        const allCount = await NotesManager.getNoteCount('all');
        const colCounts = await Promise.all(collections.map(c => NotesManager.getNoteCount(c.id)));

        const makeColBtn = (colId, icon, name, count, isActive) => {
            const hasMenu = colId !== 'all';
            return `
                <div class="notes-col-item-wrapper ${isActive ? 'active' : ''}">
                    <button class="notes-col-item" data-col-id="${colId}">
                        <svg class="notes-col-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                            ${icon}
                        </svg>
                        <span class="notes-col-name">${this.escapeHtml(name)}</span>
                        ${count > 0 ? `<span class="notes-col-badge">${count}</span>` : ''}
                    </button>
                    ${hasMenu ? `
                        <button class="notes-col-menu-btn" title="Collection actions" data-col-id="${colId}">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                                <circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/>
                            </svg>
                        </button>
                    ` : ''}
                </div>
            `;
        };

        const folderIcon = '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>';
        const allIcon = '<rect x="3" y="3" width="7" height="7" rx="1"></rect><rect x="14" y="3" width="7" height="7" rx="1"></rect><rect x="3" y="14" width="7" height="7" rx="1"></rect><rect x="14" y="14" width="7" height="7" rx="1"></rect>';

        let html = makeColBtn('all', allIcon, 'All Notes', allCount, this.activeCollectionId === 'all');
        collections.forEach((col, i) => {
            html += makeColBtn(col.id, folderIcon, col.name, colCounts[i], this.activeCollectionId === col.id);
        });

        this.collectionsList.innerHTML = html;

        // Bind clicks, context menus & Drag-and-Drop targets
        this.collectionsList.querySelectorAll('.notes-col-item-wrapper').forEach(wrapper => {
            const btn = wrapper.querySelector('.notes-col-item');
            const colId = btn.getAttribute('data-col-id');

            btn.addEventListener('click', (e) => {
                this.activeCollectionId = colId;
                this.renderCollections();
                this.renderNotesList();
            });

            // Drag & Drop: Drop target
            btn.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                btn.classList.add('drag-over');
            });

            btn.addEventListener('dragleave', () => {
                btn.classList.remove('drag-over');
            });

            btn.addEventListener('drop', async (e) => {
                e.preventDefault();
                btn.classList.remove('drag-over');
                const noteId = e.dataTransfer.getData('text/plain');
                if (!noteId || !colId) return;

                const targetColId = colId === 'all' ? 'col_default' : colId;
                await NotesManager.moveNote(noteId, targetColId);
                await this.renderCollections();
                await this.renderNotesList(this.notesSearchInput?.value?.trim()?.toLowerCase() || '');
            });

            // Menu actions button click
            const menuBtn = wrapper.querySelector('.notes-col-menu-btn');
            if (menuBtn) {
                menuBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    await this.showCollectionContextMenu(e, colId);
                });
            }
        });
    }

    async showCollectionContextMenu(e, colId) {
        this.closeContextMenu();

        const collections = await NotesManager.getCollections();
        // Handle default collection info manually since it's not always in db collection list
        let colName = 'General';
        if (colId !== 'col_default') {
            const found = collections.find(c => c.id === colId);
            if (found) colName = found.name;
        } else {
            // Get current name of col_default from DB or memory if renamed
            const db = await NotesManager.getDB();
            const tx = db.transaction(NotesManager.STORE_COLLECTIONS, 'readonly');
            const store = tx.objectStore(NotesManager.STORE_COLLECTIONS);
            const res = await new Promise(r => {
                const req = store.get('col_default');
                req.onsuccess = () => r(req.result);
                req.onerror = () => r(null);
            });
            if (res) colName = res.name;
        }

        const menu = document.createElement('div');
        menu.className = 'notes-context-menu';
        menu.setAttribute('role', 'menu');

        menu.innerHTML = `
            <button class="notes-ctx-item" id="ctx-col-rename">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 20h9"></path>
                    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path>
                </svg>
                Rename collection
            </button>
            <div class="notes-ctx-divider"></div>
            <button class="notes-ctx-item notes-ctx-danger" id="ctx-col-delete">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6l-1 14H6L5 6"></path>
                    <path d="M10 11v6"></path>
                    <path d="M14 11v6"></path>
                    <path d="M9 6V4h6v2"></path>
                </svg>
                Delete collection
            </button>
        `;

        document.body.appendChild(menu);
        const menuW = 200;
        const menuH = menu.offsetHeight || 100;
        let x = e.clientX;
        let y = e.clientY;
        if (x + menuW > window.innerWidth) x = window.innerWidth - menuW - 8;
        if (y + menuH > window.innerHeight) y = window.innerHeight - menuH - 8;
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;
        this._contextMenu = menu;

        // Bind Rename
        menu.querySelector('#ctx-col-rename').addEventListener('click', async () => {
            this.closeContextMenu();
            let newName = null;
            if (typeof window.showCustomPopup === 'function') {
                newName = await window.showCustomPopup({
                    title: 'Rename Collection',
                    body: `Enter new name for "${colName}":`,
                    isInput: true,
                    placeholder: 'Collection Name',
                    value: colName,
                    confirmLabel: 'Save'
                });
            } else {
                newName = prompt(`Rename collection "${colName}" to:`, colName);
            }

            if (newName && typeof newName === 'string' && newName.trim() && newName.trim() !== colName) {
                await NotesManager.renameCollection(colId, newName.trim());
                await this.renderCollections();
                if (this.activeNoteId) {
                    const currentNote = await NotesManager.getNote(this.activeNoteId);
                    if (currentNote) this.updateCollectionPickerPill(currentNote);
                }
            }
        });

        // Bind Delete
        menu.querySelector('#ctx-col-delete').addEventListener('click', async () => {
            this.closeContextMenu();
            let confirmed = false;
            const bodyMsg = colId === 'col_default' 
                ? 'Are you sure you want to delete the default collection? This will ALSO delete all notes inside it.'
                : 'Are you sure you want to delete this collection? Notes inside will be moved to the default collection.';
            
            if (typeof window.showCustomPopup === 'function') {
                confirmed = await window.showCustomPopup({
                    title: 'Delete Collection',
                    body: bodyMsg,
                    confirmLabel: 'Delete',
                    isDanger: true
                });
            } else {
                confirmed = confirm(bodyMsg);
            }

            if (confirmed) {
                await NotesManager.deleteCollection(colId);
                if (this.activeCollectionId === colId) {
                    this.activeCollectionId = 'all';
                }
                await this.renderCollections();
                await this.renderNotesList();
            }
        });

        // Close on outside click
        const closeHandler = (ev) => {
            if (!menu.contains(ev.target)) {
                this.closeContextMenu();
                document.removeEventListener('click', closeHandler);
            }
        };
        setTimeout(() => document.addEventListener('click', closeHandler), 0);
    }

    async renderNotesList(searchTerm = '', targetNoteId) {
        if (!this.notesList) return;
        let notes = await NotesManager.getNotes(this.activeCollectionId);

        if (searchTerm) {
            notes = notes.filter(n =>
                (n.title && n.title.toLowerCase().includes(searchTerm)) ||
                (n.content && JSON.stringify(n.content).toLowerCase().includes(searchTerm))
            );
        }

        // Apply sort
        if (this.sortMode === 'az') {
            notes.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
        } else if (this.sortMode === 'created') {
            notes.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        } else {
            notes.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        }

        if (notes.length === 0) {
            const emptyMsg = searchTerm
                ? `No results for "${this.escapeHtml(searchTerm)}"`
                : 'No notes yet';
            this.notesList.innerHTML = `
                <div class="notes-list-empty">
                    <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom:8px;opacity:0.3">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                    </svg>
                    <span>${emptyMsg}</span>
                </div>
            `;
            if (!this.activeNoteId) this.showEmptyEditorState();
            return;
        }

        const effectiveNoteId = targetNoteId || this.activeNoteId || notes[0].id;
        const activeNoteObj = notes.find(n => n.id === effectiveNoteId) || notes[0];

        const pinned = notes.filter(n => n.pinned);
        const recent = notes.filter(n => !n.pinned);

        const renderNoteCard = (note) => {
            const isActive = activeNoteObj.id === note.id ? 'active' : '';
            const isPinned = note.pinned ? 'pinned' : '';
            const timeLabel = this.timeAgo(note.updatedAt);
            // Full-text search: show snippet around matched text, highlight it
            const snippetText = searchTerm ? this.extractSearchSnippet(note, searchTerm) : this.getNotePreviewText(note);
            const previewHtml = this.highlightSnippet(snippetText, searchTerm);
            const titleHtml = this.highlightSnippet(note.title || 'Untitled Note', searchTerm);
            const pinIcon = note.pinned
                ? '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>'
                : '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';
            return `
                <div class="notes-item ${isActive} ${isPinned}" data-note-id="${note.id}" draggable="true">
                    <div class="notes-item-header">
                        <div class="notes-item-title">${titleHtml}</div>
                        <div class="notes-item-quick-actions">
                            <button class="notes-qa-btn notes-pin-btn" title="${note.pinned ? 'Unpin' : 'Pin'}" data-pinned="${note.pinned ? '1' : '0'}">${pinIcon}</button>
                            <button class="notes-qa-btn notes-menu-btn" title="More options"><svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg></button>
                        </div>
                    </div>
                    <div class="notes-item-preview">${previewHtml}</div>
                    <div class="notes-item-time">${timeLabel}</div>
                </div>
            `;
        };

        let html = '';
        if (pinned.length > 0) {
            html += `<div class="notes-group-header"><svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg> Pinned</div>`;
            pinned.forEach(n => { html += renderNoteCard(n); });
        }
        if (recent.length > 0) {
            if (pinned.length > 0) {
                html += `<div class="notes-group-header">Recent</div>`;
            }
            recent.forEach(n => { html += renderNoteCard(n); });
        }

        this.notesList.innerHTML = html;

        // Bind note selection & Drag-and-Drop dragstart
        this.notesList.querySelectorAll('.notes-item').forEach(item => {
            const noteId = item.getAttribute('data-note-id');

            item.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', noteId);
                e.dataTransfer.effectAllowed = 'move';
                item.classList.add('dragging');
            });

            item.addEventListener('dragend', () => {
                item.classList.remove('dragging');
            });

            item.addEventListener('click', (e) => {
                if (e.target.closest('.notes-item-quick-actions')) return;
                this.notesList.querySelectorAll('.notes-item.active').forEach(el => el.classList.remove('active'));
                item.classList.add('active');
                this.loadNote(noteId);
            });

            // Pin button
            const pinBtn = item.querySelector('.notes-pin-btn');
            if (pinBtn) {
                pinBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const noteId = item.getAttribute('data-note-id');
                    const curPinned = pinBtn.getAttribute('data-pinned') === '1';
                    await NotesManager.pinNote(noteId, !curPinned);
                    await this.renderNotesList(this.notesSearchInput?.value?.trim()?.toLowerCase() || '');
                });
            }

            // Context menu button
            const menuBtn = item.querySelector('.notes-menu-btn');
            if (menuBtn) {
                menuBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const noteId = item.getAttribute('data-note-id');
                    const note = notes.find(n => n.id === noteId);
                    await this.showNoteContextMenu(e, note);
                });
            }

            // Right-click context menu
            item.addEventListener('contextmenu', async (e) => {
                e.preventDefault();
                const noteId = item.getAttribute('data-note-id');
                const note = notes.find(n => n.id === noteId);
                await this.showNoteContextMenu(e, note);
            });
        });

        // Load active note
        if (activeNoteObj) {
            if (this.noteTitleInput) {
                this.noteTitleInput.value = activeNoteObj.title || '';
            }
            await this.loadNote(activeNoteObj.id);
        }
    }

    async showNoteContextMenu(e, note) {
        this.closeContextMenu();

        const collections = await NotesManager.getCollections();
        const menu = document.createElement('div');
        menu.className = 'notes-context-menu';
        menu.setAttribute('role', 'menu');

        const isPinned = note.pinned;
        const pinLabel = isPinned ? 'Unpin note' : 'Pin note';
        const pinIcon = isPinned
            ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>'
            : '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';

        // Move to submenu items
        const moveItems = collections
            .filter(c => c.id !== note.collectionId)
            .map(c => `<button class="notes-ctx-item notes-ctx-move-item" data-col-id="${c.id}">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                ${this.escapeHtml(c.name)}
            </button>`).join('');

        menu.innerHTML = `
            <button class="notes-ctx-item" id="ctx-pin">${pinIcon} ${pinLabel}</button>
            ${moveItems.length ? `<div class="notes-ctx-divider"></div><div class="notes-ctx-group-label">Move to</div>${moveItems}` : ''}
            <div class="notes-ctx-divider"></div>
            <button class="notes-ctx-item notes-ctx-danger" id="ctx-delete">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14H6L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4h6v2"></path></svg>
                Delete note
            </button>
        `;

        // Position menu
        document.body.appendChild(menu);
        const menuW = 200;
        const menuH = menu.offsetHeight || 160;
        let x = e.clientX;
        let y = e.clientY;
        if (x + menuW > window.innerWidth) x = window.innerWidth - menuW - 8;
        if (y + menuH > window.innerHeight) y = window.innerHeight - menuH - 8;
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;
        this._contextMenu = menu;

        // Bind actions
        menu.querySelector('#ctx-pin').addEventListener('click', async () => {
            this.closeContextMenu();
            await NotesManager.pinNote(note.id, !isPinned);
            await this.renderNotesList(this.notesSearchInput?.value?.trim()?.toLowerCase() || '');
        });

        menu.querySelectorAll('.notes-ctx-move-item').forEach(btn => {
            btn.addEventListener('click', async () => {
                this.closeContextMenu();
                const colId = btn.getAttribute('data-col-id');
                await NotesManager.moveNote(note.id, colId);
                await this.renderCollections();
                await this.renderNotesList(this.notesSearchInput?.value?.trim()?.toLowerCase() || '');
            });
        });

        menu.querySelector('#ctx-delete').addEventListener('click', async () => {
            this.closeContextMenu();
            await this.handleDeleteCurrentNote();
        });

        // Close on outside click
        const closeHandler = (ev) => {
            if (!menu.contains(ev.target)) {
                this.closeContextMenu();
                document.removeEventListener('click', closeHandler);
            }
        };
        setTimeout(() => document.addEventListener('click', closeHandler), 0);
    }

    closeContextMenu() {
        if (this._contextMenu) {
            this._contextMenu.remove();
            this._contextMenu = null;
        }
    }

    async handleCreateCollection() {
        let name = null;
        if (typeof window.showCustomPopup === 'function') {
            name = await window.showCustomPopup({
                title: 'New Collection',
                body: 'Enter a name for the new collection:',
                isInput: true,
                placeholder: 'Collection Name',
                confirmLabel: 'Create'
            });
        } else {
            name = prompt('Enter new Collection name:');
        }

        if (name && typeof name === 'string' && name.trim()) {
            const newCol = await NotesManager.createCollection(name.trim());
            this.activeCollectionId = newCol.id;
            await this.renderCollections();
            await this.handleCreateNote();
        }
    }

    async handleCreateNote() {
        const colId = this.activeCollectionId === 'all' ? 'col_default' : this.activeCollectionId;
        const newNote = await NotesManager.createNote(colId, 'Untitled Note');

        // Immediately update active note ID & clear active status from previous note
        this.activeNoteId = newNote.id;
        if (this.notesList) {
            this.notesList.querySelectorAll('.notes-item.active').forEach(el => el.classList.remove('active'));
        }

        await this.renderCollections();
        await this.renderNotesList('', newNote.id);
        if (this.noteTitleInput) {
            this.noteTitleInput.focus();
            this.noteTitleInput.select();
        }
    }

    async handleDeleteCurrentNote() {
        if (!this.activeNoteId) return;

        let confirmed = false;
        if (typeof window.showCustomPopup === 'function') {
            confirmed = await window.showCustomPopup({
                title: 'Delete Note',
                body: 'Are you sure you want to delete this note? This action cannot be undone.',
                confirmLabel: 'Delete',
                isDanger: true
            });
        } else {
            confirmed = confirm('Are you sure you want to delete this note? This action cannot be undone.');
        }

        if (confirmed) {
            await NotesManager.deleteNote(this.activeNoteId);
            this.activeNoteId = null;
            await this.renderCollections();
            await this.renderNotesList();
        }
    }

    async loadNote(noteId) {
        this.activeNoteId = noteId;
        const note = await NotesManager.getNote(noteId);
        if (!note) {
            this.showEmptyEditorState();
            return;
        }

        if (typeof window.updateNotesUrl === 'function') {
            window.updateNotesUrl(noteId);
        }

        if (this.notesEditorPane) {
            this.notesEditorPane.style.display = 'flex';
        }
        if (this.notesEmptyState) {
            this.notesEmptyState.style.display = 'none';
        }

        // Highlight in list
        if (this.notesList) {
            this.notesList.querySelectorAll('.notes-item').forEach(el => {
                el.classList.toggle('active', el.getAttribute('data-note-id') === noteId);
            });
        }

        // Update title input & document title (browser tab title)
        const noteTitle = note.title || 'Untitled Note';
        if (this.noteTitleInput) {
            this.noteTitleInput.value = note.title || '';
        }
        document.title = noteTitle;

        // Update Collection Picker Pill
        await this.updateCollectionPickerPill(note);

        // Mount BlockNote
        await this.initEditorInstance(note.content);

        // Update word count with loaded content (count fires only on change, not on load)
        const blocks = Array.isArray(note.content) ? note.content : [];
        this.updateWordCount(blocks);
    }

    showEmptyEditorState() {
        document.title = 'Lumina';
        if (this.notesEditorPane) {
            this.notesEditorPane.style.display = 'none';
        }
        if (this.notesEmptyState) {
            this.notesEmptyState.style.display = 'flex';
        }
    }

    async initEditorInstance(initialData) {
        if (this.blocknoteInstance && typeof this.blocknoteInstance.unmount === 'function') {
            try {
                this.blocknoteInstance.unmount();
            } catch (e) {
                console.warn('Error unmounting BlockNote:', e);
            }
            this.blocknoteInstance = null;
        }

        if (this.editorContainer) {
            this.editorContainer.innerHTML = '';
        }

        if (!window.LuminaBlockNote) {
            if (typeof window.luminaLoadScript === 'function') {
                try {
                    await Promise.all([
                        window.luminaLoadCSS('../../lib/vendor/blocknote.css'),
                        window.luminaLoadScript('../../lib/vendor/blocknote.js')
                    ]);
                } catch (e) {
                    console.error('Failed to load BlockNote dynamic scripts:', e);
                }
            }
        }

        if (!window.LuminaBlockNote) {
            console.error('BlockNote library is not loaded');
            return;
        }

        try {
            const initialBlocks = (initialData && Array.isArray(initialData)) ? initialData : undefined;
            this.blocknoteInstance = window.LuminaBlockNote.mount(
                this.editorContainer,
                initialBlocks,
                (updatedBlocks) => {
                    this.triggerAutoSave(updatedBlocks);
                }
            );

            // Bind selection word count
            this._bindSelectionCount();
        } catch (err) {
            console.error('Failed to initialize BlockNote:', err);
        }
    }

    triggerAutoSave(blocksFromEvent) {
        if (this.autoSaveTimer) {
            clearTimeout(this.autoSaveTimer);
        }

        // Update word count immediately on every keystroke
        this.updateWordCount(blocksFromEvent || (this.blocknoteInstance ? this.blocknoteInstance.getBlocks() : []));

        this.autoSaveTimer = setTimeout(async () => {
            if (!this.activeNoteId || !this.blocknoteInstance) return;

            try {
                const outputData = blocksFromEvent || this.blocknoteInstance.getBlocks();
                const title = this.noteTitleInput ? this.noteTitleInput.value.trim() : 'Untitled Note';

                await NotesManager.saveNote(this.activeNoteId, {
                    title: title || 'Untitled Note',
                    content: outputData
                });

                // Refresh item title in left pane
                const activeItemTitle = this.notesList ? this.notesList.querySelector(`.notes-item[data-note-id="${this.activeNoteId}"] .notes-item-title`) : null;
                if (activeItemTitle) {
                    activeItemTitle.textContent = title || 'Untitled Note';
                }
            } catch (e) {
                console.warn('Auto-save error:', e);
            }
        }, 400);
    }

    updateWordCount(blocks, selectionText) {
        if (!this.wordCountEl) return;

        if (selectionText && selectionText.trim()) {
            // Show selection word count
            const words = selectionText.trim().split(/\s+/).filter(Boolean).length;
            this.wordCountEl.textContent = `${words} ${words === 1 ? 'word' : 'words'} selected`;
            const bar = document.getElementById('notes-word-count-bar');
            if (bar) bar.classList.add('has-selection');
            return;
        }

        const bar = document.getElementById('notes-word-count-bar');
        if (bar) bar.classList.remove('has-selection');

        let fullText = '';
        if (Array.isArray(blocks)) {
            for (const block of blocks) {
                if (block.content && Array.isArray(block.content)) {
                    fullText += block.content.map(i => i.text || '').join(' ') + ' ';
                }
                if (block.children && Array.isArray(block.children)) {
                    for (const child of block.children) {
                        if (child.content && Array.isArray(child.content)) {
                            fullText += child.content.map(i => i.text || '').join(' ') + ' ';
                        }
                    }
                }
            }
        }
        fullText = fullText.trim();
        const words = fullText ? fullText.split(/\s+/).filter(Boolean).length : 0;
        this.wordCountEl.textContent = `${words.toLocaleString()} ${words === 1 ? 'word' : 'words'}`;
    }

    _bindSelectionCount() {
        // Remove previous listener if any
        if (this._selectionHandler) {
            document.removeEventListener('selectionchange', this._selectionHandler);
        }
        this._selectionHandler = () => {
            const sel = window.getSelection();
            if (!sel || sel.isCollapsed) {
                // No selection — show total word count
                if (this.blocknoteInstance) {
                    const blocks = this.blocknoteInstance.getBlocks ? this.blocknoteInstance.getBlocks() : [];
                    this.updateWordCount(blocks);
                }
                return;
            }
            // Check selection is within the editor
            const editorEl = this.editorContainer;
            if (!editorEl) return;
            const anchorNode = sel.anchorNode;
            if (!editorEl.contains(anchorNode)) return;

            const selectedText = sel.toString();
            this.updateWordCount(null, selectedText);
        };
        document.addEventListener('selectionchange', this._selectionHandler);
    }

    getNoteMarkdown(note) {
        if (!note.content || !Array.isArray(note.content)) return '';
        let lines = [];
        for (let block of note.content) {
            let text = '';
            if (block.content && Array.isArray(block.content)) {
                text = block.content.map(i => i.text || '').join('');
            }
            if (block.type === 'heading') lines.push(`## ${text}`);
            else if (block.type === 'checkListItem') lines.push(`- [ ] ${text}`);
            else if (block.type === 'bulletListItem') lines.push(`- ${text}`);
            else if (block.type === 'numberedListItem') lines.push(`1. ${text}`);
            else lines.push(text);
        }
        return lines.join('\n');
    }

    getNotePreviewText(note) {
        if (!note.content) return 'Empty note...';
        if (Array.isArray(note.content)) {
            for (let block of note.content) {
                if (block.content && Array.isArray(block.content)) {
                    for (let inline of block.content) {
                        if (inline.text && inline.text.trim()) return inline.text.trim();
                    }
                }
            }
        }
        return 'Empty note...';
    }

    // Extract a snippet of text from note content around a search term
    extractSearchSnippet(note, term) {
        if (!term || !note.content || !Array.isArray(note.content)) {
            return this.getNotePreviewText(note);
        }
        const lowerTerm = term.toLowerCase();
        for (const block of note.content) {
            if (block.content && Array.isArray(block.content)) {
                const fullText = block.content.map(i => i.text || '').join('');
                const idx = fullText.toLowerCase().indexOf(lowerTerm);
                if (idx !== -1) {
                    const start = Math.max(0, idx - 30);
                    const end = Math.min(fullText.length, idx + term.length + 60);
                    let snippet = (start > 0 ? '…' : '') + fullText.slice(start, end) + (end < fullText.length ? '…' : '');
                    return snippet;
                }
            }
        }
        return this.getNotePreviewText(note);
    }

    highlightSnippet(text, term) {
        if (!term) return this.escapeHtml(text);
        const escaped = this.escapeHtml(text);
        const escapedTerm = this.escapeHtml(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return escaped.replace(new RegExp(`(${escapedTerm})`, 'gi'), '<mark class="notes-search-highlight">$1</mark>');
    }

    initCollectionPickerPill() {
        if (!this.colPickerPill) return;

        this.colPickerPill.addEventListener('click', async (e) => {
            e.stopPropagation();
            const isOpen = this.colPickerDropdown.classList.contains('active');
            if (isOpen) {
                this.closeCollectionPickerPill();
                return;
            }

            const collections = await NotesManager.getCollections();
            const currentNote = this.activeNoteId ? await NotesManager.getNote(this.activeNoteId) : null;
            const currentColId = currentNote ? currentNote.collectionId : 'col_default';

            let itemsHtml = collections.map(col => {
                const isSelected = col.id === currentColId ? 'selected' : '';
                return `
                    <button type="button" class="notes-col-picker-item ${isSelected}" data-col-id="${col.id}">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                        </svg>
                        <span>${this.escapeHtml(col.name)}</span>
                        ${col.id === currentColId ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" class="notes-col-picker-check"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}
                    </button>
                `;
            }).join('');

            this.colPickerDropdown.innerHTML = itemsHtml;
            this.colPickerDropdown.classList.add('active');

            // Bind item click
            this.colPickerDropdown.querySelectorAll('.notes-col-picker-item').forEach(item => {
                item.addEventListener('click', async (ev) => {
                    ev.stopPropagation();
                    const newColId = item.getAttribute('data-col-id');
                    this.closeCollectionPickerPill();

                    if (this.activeNoteId && newColId) {
                        await NotesManager.moveNote(this.activeNoteId, newColId);
                        const updatedNote = await NotesManager.getNote(this.activeNoteId);
                        if (updatedNote) await this.updateCollectionPickerPill(updatedNote);
                        await this.renderCollections();
                        await this.renderNotesList(this.notesSearchInput?.value?.trim()?.toLowerCase() || '');
                    }
                });
            });
        });

        // Close on outside click
        document.addEventListener('click', (ev) => {
            if (this.colPickerWrapper && !this.colPickerWrapper.contains(ev.target)) {
                this.closeCollectionPickerPill();
            }
        });
    }

    closeCollectionPickerPill() {
        if (this.colPickerDropdown) {
            this.colPickerDropdown.classList.remove('active');
        }
    }

    async updateCollectionPickerPill(note) {
        if (!this.colPickerLabel) return;
        if (!note || !note.collectionId) {
            this.colPickerLabel.textContent = 'General';
            return;
        }

        const collections = await NotesManager.getCollections();
        const col = collections.find(c => c.id === note.collectionId);
        this.colPickerLabel.textContent = col ? col.name : 'General';
    }

    escapeHtml(str) {
        return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
}

if (typeof window !== 'undefined') {
    window.NotesPanel = NotesPanel;
}

