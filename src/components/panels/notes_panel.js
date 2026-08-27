import { NotesManager } from '../../db/notes_manager.js';

export class NotesPanel {
    constructor() {
        this.activeCollectionId = 'all';
        this.activeNoteId = null;
        this.blocknoteInstance = null;
        this.autoSaveTimer = null;
        this.isInitialized = false;
        this.sortMode = 'modified'; 
        this._contextMenu = null;
    }
    async init(targetNoteId, targetColId) {
        this.cacheElements();
        if (!this.isInitialized) {
            this.bindEvents();
            this.bindSortBar();
            this.initCollectionPickerPill();
            this.isInitialized = true;
        }
        const urlParams = new URLSearchParams(window.location.search);
        const colFromUrl = targetColId || urlParams.get('colId');
        const savedCol = localStorage.getItem('lumina_active_collection_id');
        if (colFromUrl) {
            this.activeCollectionId = colFromUrl;
        } else if (savedCol) {
            this.activeCollectionId = savedCol;
        } else {
            this.activeCollectionId = 'all';
        }
        if (targetNoteId) {
            this.activeNoteId = targetNoteId;
            try {
                const note = await NotesManager.getNote(targetNoteId);
                if (note && this.noteTitleInput) {
                    this.noteTitleInput.value = note.title || '';
                }
                if (note && note.collectionId && !colFromUrl && !savedCol) {
                    this.activeCollectionId = note.collectionId;
                }
            } catch (e) {
                console.warn('Pre-fetch title error:', e);
            }
            this.showEditorView();
        } else if (window.innerWidth <= 680) {
            this.showListView();
        }
        localStorage.setItem('lumina_active_collection_id', this.activeCollectionId);
        this.updateUrlParams();
        await this.renderCollections();
        await this.renderNotesList('', targetNoteId);
    }
    showEditorView() {
        if (!this.container) return;
        this.container.classList.add('show-editor');
        this.container.classList.remove('show-list');
    }
    showListView() {
        if (!this.container) return;
        this.container.classList.remove('show-editor');
        this.container.classList.add('show-list');
    }
    updateUrlParams() {
        if (typeof window.updateNotesUrl === 'function') {
            window.updateNotesUrl(this.activeNoteId, this.activeCollectionId);
        } else {
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.get('view') === 'notes') {
                if (this.activeNoteId) urlParams.set('noteId', this.activeNoteId);
                else urlParams.delete('noteId');
                if (this.activeCollectionId && this.activeCollectionId !== 'all') {
                    urlParams.set('colId', this.activeCollectionId);
                } else {
                    urlParams.delete('colId');
                }
                const newUrl = window.location.pathname + '?' + urlParams.toString();
                window.history.replaceState(null, '', newUrl);
            }
        }
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
        const leftPane = document.querySelector('.notes-sidebar-pane');
        const rightPane = document.querySelector('.notes-editor-pane');
        if (leftPane && window.innerWidth > 680) {
            const savedWidth = localStorage.getItem('lumina_notes_sidebar_width');
            const width = savedWidth ? parseInt(savedWidth, 10) : 260;
            leftPane.style.width = `${width}px`;
            leftPane.style.flex = `0 0 ${width}px`;
            if (rightPane) rightPane.style.flex = `1 1 0%`;
        }
        this.backBtn = document.getElementById('notes-back-btn');
        this.tbH1 = document.getElementById('note-tb-h1');
        this.tbH2 = document.getElementById('note-tb-h2');
        this.tbH3 = document.getElementById('note-tb-h3');
        this.tbChecklist = document.getElementById('note-tb-checklist');
        this.tbBullet = document.getElementById('note-tb-bullet');
        this.tbNumber = document.getElementById('note-tb-number');
        this.tbTable = document.getElementById('note-tb-table');
        this.tablePickerMenu = document.getElementById('notes-table-picker-menu');
        this.tableGrid = document.getElementById('notes-table-grid');
        this.tableGridLabel = document.getElementById('notes-table-grid-label');
        this.tbImage = document.getElementById('note-tb-image');
        this.tbUndo = document.getElementById('note-tb-undo');
        this.tbRedo = document.getElementById('note-tb-redo');
        this.tbCopy = document.getElementById('note-tb-copy');
        this.tbMore = document.getElementById('note-tb-more');
        this.moreMenu = document.getElementById('notes-more-menu');
        this.actionExport = document.getElementById('note-action-export-md');
        this.actionDelete = document.getElementById('note-action-delete');
        this.wordCountEl = document.getElementById('notes-word-count');
        this.colPickerWrapper = document.getElementById('notes-col-picker-wrapper');
        this.colPickerPill = document.getElementById('notes-col-picker-pill');
        this.colPickerLabel = document.getElementById('notes-col-picker-label');
        this.colPickerDropdown = document.getElementById('notes-col-picker-dropdown');
    }
    bindEvents() {
        if (this.backBtn) {
            this.backBtn.addEventListener('click', () => {
                this.showListView();
            });
        }
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
                                ed.setTextCursorPosition(firstBlock, 'start');
                            } else {
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
        const editorBody = document.querySelector('.notes-editor-body');
        if (editorBody) {
            editorBody.addEventListener('click', (e) => {
                if (e.target === this.noteTitleInput) return;
                const isInsideBlock = e.target.closest('.bn-block, .bn-inline-content, [contenteditable="true"]');
                if (!isInsideBlock) {
                    const ed = this.blocknoteInstance?.editor;
                    if (!ed) return;
                    try {
                        const doc = ed.document;
                        if (doc && doc.length > 0) {
                            const lastBlock = doc[doc.length - 1];
                            ed.setTextCursorPosition(lastBlock, 'end');
                        }
                        ed.focus();
                    } catch (_) {}
                }
            });
        }
        let lastCmdATime = 0;
        let lastCmdAText = '';
        const handleTableKeydown = (e) => {
            const ed = this.blocknoteInstance?.editor;
            if (!ed) return;
            if ((e.metaKey || e.ctrlKey) && (e.key === 'a' || e.key === 'A') && !e.shiftKey && !e.altKey) {
                try {
                    const now = Date.now();
                    const winSel = window.getSelection();
                    const currentSelectedText = winSel ? winSel.toString() : '';
                    const isSecondPress = (now - lastCmdATime < 1800 && lastCmdATime > 0) || (currentSelectedText.length > 0 && currentSelectedText === lastCmdAText);
                    if (isSecondPress) {
                        e.preventDefault();
                        e.stopPropagation();
                        lastCmdATime = 0;
                        lastCmdAText = '';
                        if (ed.document && ed.document.length > 1) {
                            try {
                                const firstBlock = ed.document[0];
                                const lastBlock = ed.document[ed.document.length - 1];
                                ed.setSelection(firstBlock, lastBlock);
                            } catch (_) {}
                        }
                        const editorEl = document.querySelector('.bn-editor');
                        if (editorEl) {
                            const range = document.createRange();
                            range.selectNodeContents(editorEl);
                            if (winSel) {
                                winSel.removeAllRanges();
                                winSel.addRange(range);
                            }
                        }
                        return;
                    }
                    lastCmdATime = now;
                    lastCmdAText = currentSelectedText;
                } catch (err) {
                    console.warn('Error handling Cmd+A select all:', err);
                }
            }
            if (e.key === 'Enter' && !e.shiftKey) {
                try {
                    const tiptap = ed._tiptapEditor;
                    const state = tiptap?.state;
                    if (!state) return;
                    const sel = state.selection;
                    const $pos = sel.$from;
                    let cellDepth = -1;
                    for (let d = $pos.depth; d > 0; d--) {
                        const name = $pos.node(d).type?.name;
                        if (name === 'tableCell' || name === 'tableHeader') {
                            cellDepth = d;
                            break;
                        }
                    }
                    if (cellDepth > 0) {
                        const isInsideRow = $pos.node(cellDepth - 1).type?.name === 'tableRow';
                        const tableNode = isInsideRow ? $pos.node(cellDepth - 2) : $pos.node(cellDepth - 1);
                        const rowNode = $pos.node(cellDepth - 1);
                        if (tableNode && rowNode && tableNode.type?.name === 'table') {
                            const rowIndex = isInsideRow ? $pos.index(cellDepth - 2) : 0;
                            const colIndex = $pos.index(cellDepth - 1);
                            const isLastRow = rowIndex === tableNode.childCount - 1;
                            const isLastCell = colIndex === rowNode.childCount - 1;
                            const isCmdEnter = e.metaKey || e.ctrlKey;
                            if ((isLastRow && isLastCell) || isCmdEnter) {
                                e.preventDefault();
                                e.stopPropagation();
                                let tableBlock = null;
                                const curBlock = ed.getTextCursorPosition()?.block;
                                if (curBlock && curBlock.type === 'table') {
                                    tableBlock = curBlock;
                                } else if (ed.document) {
                                    const tableEl = document.querySelector('.bn-editor table:has(.ProseMirror-focused), .bn-editor table') ||
                                                    document.activeElement?.closest('table');
                                    if (tableEl) {
                                        const blockId = tableEl.closest('.bn-block-outer')?.getAttribute('data-id');
                                        if (blockId) tableBlock = ed.getBlock(blockId);
                                    }
                                    if (!tableBlock) tableBlock = ed.document.find(b => b.type === 'table');
                                }
                                if (tableBlock) {
                                    const nextBlock = ed.getNextBlock(tableBlock);
                                    if (nextBlock) {
                                        ed.setTextCursorPosition(nextBlock, 'start');
                                    } else {
                                        const newBlocks = ed.insertBlocks([{ type: 'paragraph' }], tableBlock, 'after');
                                        if (newBlocks && newBlocks[0]) {
                                            ed.setTextCursorPosition(newBlocks[0], 'start');
                                        }
                                    }
                                    ed.focus();
                                    return;
                                }
                            }
                        }
                    }
                } catch (err) {
                    console.warn('Error handling Enter in table:', err);
                }
            }
            if (e.key === 'Tab' && !e.shiftKey) {
                try {
                    const tiptap = ed._tiptapEditor;
                    const state = tiptap?.state;
                    if (!state) return;
                    const sel = state.selection;
                    const $pos = sel.$from;
                    let cellDepth = -1;
                    for (let d = $pos.depth; d > 0; d--) {
                        const name = $pos.node(d).type?.name;
                        if (name === 'tableCell' || name === 'tableHeader') {
                            cellDepth = d;
                            break;
                        }
                    }
                    if (cellDepth > 0) {
                        const isInsideRow = $pos.node(cellDepth - 1).type?.name === 'tableRow';
                        const tableNode = isInsideRow ? $pos.node(cellDepth - 2) : $pos.node(cellDepth - 1);
                        const rowNode = $pos.node(cellDepth - 1);
                        if (tableNode && rowNode && tableNode.type?.name === 'table') {
                            const rowIndex = isInsideRow ? $pos.index(cellDepth - 2) : 0;
                            const colIndex = $pos.index(cellDepth - 1);
                            const isLastRow = rowIndex === tableNode.childCount - 1;
                            const isLastCell = colIndex === rowNode.childCount - 1;
                            if (isLastRow && isLastCell) {
                                e.preventDefault();
                                e.stopPropagation();
                                let tableBlock = null;
                                const curBlock = ed.getTextCursorPosition()?.block;
                                if (curBlock && curBlock.type === 'table') {
                                    tableBlock = curBlock;
                                } else if (ed.document) {
                                    const tableEl = document.querySelector('.bn-editor table:has(.ProseMirror-focused), .bn-editor table') ||
                                                    document.activeElement?.closest('table');
                                    if (tableEl) {
                                        const blockId = tableEl.closest('.bn-block-outer')?.getAttribute('data-id');
                                        if (blockId) tableBlock = ed.getBlock(blockId);
                                    }
                                    if (!tableBlock) tableBlock = ed.document.find(b => b.type === 'table');
                                }
                                if (tableBlock && tableBlock.content?.rows) {
                                    const rows = tableBlock.content.rows;
                                    const numCols = rows[0]?.cells?.length || rowNode.childCount || 2;
                                    const newEmptyCells = Array.from({ length: numCols }, () => [{ type: 'text', text: '', styles: {} }]);
                                    const newRows = [...rows, { cells: newEmptyCells }];
                                    ed.updateBlock(tableBlock, {
                                        type: 'table',
                                        content: {
                                            type: 'tableContent',
                                            rows: newRows
                                        }
                                    });
                                    setTimeout(() => {
                                        try {
                                            const curTiptap = this.blocknoteInstance?.editor?._tiptapEditor;
                                            if (curTiptap) {
                                                let lastCellPos = null;
                                                curTiptap.state.doc.descendants((node, pos) => {
                                                    if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
                                                        lastCellPos = pos + 1;
                                                    }
                                                });
                                                if (lastCellPos !== null && curTiptap.commands?.setTextSelection) {
                                                    curTiptap.commands.setTextSelection(lastCellPos);
                                                    curTiptap.commands.focus();
                                                }
                                            }
                                        } catch (_) {}
                                    }, 10);
                                }
                                return;
                            }
                        }
                    }
                } catch (err) {
                    console.warn('Error handling Tab key in table:', err);
                }
            }
            if (e.key === 'Backspace' || e.key === 'Delete') {
                const winSel = window.getSelection();
                const editorEl = document.querySelector('.bn-editor');
                if (editorEl && winSel && !winSel.isCollapsed && ed.document && ed.document.length > 1) {
                    const selStr = winSel.toString().trim();
                    const edStr = (editorEl.innerText || '').trim();
                    if (selStr.length > 0 && edStr.length > 0 && selStr.length >= edStr.length * 0.7) {
                        e.preventDefault();
                        e.stopPropagation();
                        const newBlocks = ed.replaceBlocks(ed.document, [{ type: 'paragraph' }]);
                        if (newBlocks && newBlocks[0]) {
                            ed.setTextCursorPosition(newBlocks[0], 'start');
                        }
                        ed.focus();
                        return;
                    }
                }
                try {
                    const tiptap = ed._tiptapEditor;
                    const state = tiptap?.state;
                    const sel = state?.selection;
                    if (!sel) return;
                    const isCellSel = sel.constructor?.name === 'CellSelection' ||
                                      typeof sel.forEachCell === 'function' ||
                                      !!sel.$anchorCell;
                    if (!isCellSel) return;
                    let tableBlock = null;
                    const selectedBlocks = ed.getSelection()?.blocks || [];
                    tableBlock = selectedBlocks.find(b => b.type === 'table');
                    if (!tableBlock && ed.document) {
                        const tableEl = document.querySelector('.bn-editor table:has(.ProseMirror-selectednode)') ||
                                        document.querySelector('.bn-editor .tableWrapper:has(.ProseMirror-selectednode)') ||
                                        document.activeElement?.closest('table');
                        if (tableEl) {
                            const blockOuter = tableEl.closest('.bn-block-outer');
                            const blockId = blockOuter?.getAttribute('data-id');
                            if (blockId) tableBlock = ed.getBlock(blockId);
                        }
                        if (!tableBlock) {
                            tableBlock = ed.document.find(b => b.type === 'table');
                        }
                    }
                    const tableExt = ed.getExtension ? (ed.getExtension('tableHandles') || Object.values(ed.extensions || {}).find(x => x?.removeRowOrColumn)) : null;
                    const cellSel = tableExt?.getCellSelection ? tableExt.getCellSelection() : null;
                    let fromRow = cellSel?.from?.row;
                    let toRow = cellSel?.to?.row;
                    let fromCol = cellSel?.from?.col;
                    let toCol = cellSel?.to?.col;
                    if (fromRow === undefined && typeof sel.isRowSelection === 'function' && sel.isRowSelection()) {
                        const totalRows = tableBlock?.content?.rows?.length || 0;
                        const totalCols = tableBlock?.content?.rows?.[0]?.cells?.length || 0;
                        fromCol = 0;
                        toCol = totalCols - 1;
                        let minR = totalRows, maxR = -1;
                        sel.forEachCell((_cell, pos) => {
                            const resolved = state.doc.resolve(pos);
                            const rowNode = resolved.parent;
                            if (rowNode && rowNode.type?.name === 'tableRow') {
                                const tableNode = state.doc.resolve(resolved.before()).parent;
                                if (tableNode && tableNode.type?.name === 'table') {
                                    let rIdx = 0;
                                    tableNode.forEach((child, _offset, index) => {
                                        if (child === rowNode) rIdx = index;
                                    });
                                    minR = Math.min(minR, rIdx);
                                    maxR = Math.max(maxR, rIdx);
                                }
                            }
                        });
                        if (maxR >= 0) {
                            fromRow = minR;
                            toRow = maxR;
                        }
                    }
                    if (tableBlock && tableBlock.content?.rows && fromRow !== undefined && toRow !== undefined && fromCol !== undefined && toCol !== undefined) {
                        e.preventDefault();
                        e.stopPropagation();
                        const rows = tableBlock.content.rows;
                        const newRows = rows.map((r, rIdx) => ({
                            ...r,
                            cells: r.cells.map((cell, cIdx) => {
                                if (rIdx >= fromRow && rIdx <= toRow && cIdx >= fromCol && cIdx <= toCol) {
                                    return [{ type: 'text', text: '', styles: {} }];
                                }
                                return cell;
                            })
                        }));
                        ed.updateBlock(tableBlock, {
                            type: 'table',
                            content: {
                                type: 'tableContent',
                                rows: newRows
                            }
                        });
                        ed.focus();
                        return;
                    }
                } catch (err) {
                    console.warn('Error handling table backspace:', err);
                }
            }
        };
        const handleTableDblClick = (e) => {
            const cellEl = e.target.closest('td, th');
            if (!cellEl) return;
            if (document.caretRangeFromPoint) {
                const r = document.caretRangeFromPoint(e.clientX, e.clientY);
                if (r && r.startContainer && r.startContainer.nodeType === Node.TEXT_NODE) {
                    const rects = r.getClientRects();
                    for (let i = 0; i < rects.length; i++) {
                        const rect = rects[i];
                        if (e.clientX >= rect.left - 3 && e.clientX <= rect.right + 3 &&
                            e.clientY >= rect.top && e.clientY <= rect.bottom) {
                            return;
                        }
                    }
                }
            }
            const ed = this.blocknoteInstance?.editor;
            if (!ed) return;
            try {
                const tiptap = ed._tiptapEditor;
                if (!tiptap) return;
                const view = tiptap.view;
                const pos = view.posAtDOM ? view.posAtDOM(cellEl, 0) : undefined;
                if (pos !== undefined) {
                    const $pos = tiptap.state.doc.resolve(pos);
                    let cellDepth = -1;
                    for (let d = $pos.depth; d > 0; d--) {
                        const name = $pos.node(d).type?.name;
                        if (name === 'tableCell' || name === 'tableHeader') {
                            cellDepth = d;
                            break;
                        }
                    }
                    if (cellDepth > 0) {
                        const cellNode = $pos.node(cellDepth);
                        const cellStart = $pos.start(cellDepth);
                        if (cellNode && cellNode.content.size > 0) {
                            e.preventDefault();
                            e.stopPropagation();
                            const from = cellStart + 1;
                            const to = cellStart + cellNode.content.size - 1;
                            if (to >= from && tiptap.commands?.setTextSelection) {
                                tiptap.commands.setTextSelection({ from, to });
                                tiptap.commands.focus();
                                return;
                            }
                        }
                    }
                }
                const inlineEl = cellEl.querySelector('.bn-inline-content') || cellEl.querySelector('p') || cellEl;
                const selection = window.getSelection();
                if (selection) {
                    e.preventDefault();
                    e.stopPropagation();
                    const range = document.createRange();
                    range.selectNodeContents(inlineEl);
                    selection.removeAllRanges();
                    selection.addRange(range);
                }
            } catch (err) {
                console.warn('Error handling table cell double-click:', err);
            }
        };
        if (this.editorContainer) {
            this.editorContainer.addEventListener('keydown', handleTableKeydown, true);
            this.editorContainer.addEventListener('dblclick', handleTableDblClick, true);
        }
        const updateActiveBlockType = (ed, blockSpec) => {
            if (!ed) return;
            try {
                const cursorPosition = ed.getTextCursorPosition();
                const currentBlock = cursorPosition?.block;
                if (currentBlock) {
                    ed.updateBlock(currentBlock, {
                        type: blockSpec.type,
                        props: blockSpec.props || {}
                    });
                } else {
                    ed.insertBlocks([blockSpec], undefined, 'after');
                }
                ed.focus();
            } catch (e) {
                console.warn('Failed to update block type:', e);
            }
        };
        const insertOrUpdateBlock = (ed, blockSpec) => {
            if (!ed) return;
            try {
                let cursorPosition = null;
                try {
                    cursorPosition = ed.getTextCursorPosition();
                } catch (_) {}
                let currentBlock = cursorPosition?.block;
                if (!currentBlock && ed.document && ed.document.length > 0) {
                    const first = ed.document[0];
                    const isFirstEmpty = (!first.content || first.content.length === 0 ||
                                         (first.content.length === 1 && !first.content[0].text));
                    if (isFirstEmpty) {
                        currentBlock = first;
                    }
                }
                const isEmptyParagraph = currentBlock &&
                    currentBlock.type === 'paragraph' &&
                    (!currentBlock.content || currentBlock.content.length === 0 ||
                     (currentBlock.content.length === 1 && !currentBlock.content[0].text));
                let targetBlock = null;
                if (isEmptyParagraph) {
                    if (blockSpec.type === 'table') {
                        const newBlocks = ed.replaceBlocks([currentBlock], [blockSpec]);
                        targetBlock = newBlocks && newBlocks[0];
                    } else {
                        ed.updateBlock(currentBlock, {
                            type: blockSpec.type,
                            props: blockSpec.props || {}
                        });
                        targetBlock = currentBlock;
                    }
                } else {
                    const newBlocks = ed.insertBlocks([blockSpec], currentBlock || undefined, 'after');
                    targetBlock = newBlocks && newBlocks[0];
                }
                if (targetBlock) {
                    const targetPos = blockSpec.type === 'table' ? 'start' : 'end';
                    ed.setTextCursorPosition(targetBlock, targetPos);
                }
                ed.focus();
                if (blockSpec.type === 'table') {
                    setTimeout(() => {
                        try {
                            const tiptap = ed._tiptapEditor;
                            if (tiptap) {
                                let firstCellPos = null;
                                const tableEl = document.querySelector('.bn-editor table:has(.ProseMirror-focused), .bn-editor table') ||
                                                document.activeElement?.closest('table');
                                if (tableEl) {
                                    const firstTd = tableEl.querySelector('td, th');
                                    if (firstTd) {
                                        const pmPos = tiptap.view?.posAtDOM ? tiptap.view.posAtDOM(firstTd, 0) : undefined;
                                        if (pmPos !== undefined) {
                                            firstCellPos = pmPos + 1;
                                        }
                                    }
                                }
                                if (firstCellPos === null) {
                                    tiptap.state.doc.descendants((node, pos) => {
                                        if (firstCellPos === null && (node.type.name === 'tableCell' || node.type.name === 'tableHeader')) {
                                            firstCellPos = pos + 1;
                                        }
                                    });
                                }
                                if (firstCellPos !== null && tiptap.commands?.setTextSelection) {
                                    tiptap.commands.setTextSelection(firstCellPos);
                                }
                                tiptap.commands?.focus?.();
                            }
                        } catch (_) {}
                    }, 15);
                }
            } catch (e) {
                console.warn('Failed to insert or update block:', e);
            }
        };
        if (this.tbH1) {
            this.tbH1.addEventListener('click', () => {
                const ed = this.blocknoteInstance?.editor;
                updateActiveBlockType(ed, {
                    type: 'heading',
                    props: { level: 1 }
                });
            });
        }
        if (this.tbH2) {
            this.tbH2.addEventListener('click', () => {
                const ed = this.blocknoteInstance?.editor;
                updateActiveBlockType(ed, {
                    type: 'heading',
                    props: { level: 2 }
                });
            });
        }
        if (this.tbH3) {
            this.tbH3.addEventListener('click', () => {
                const ed = this.blocknoteInstance?.editor;
                updateActiveBlockType(ed, {
                    type: 'heading',
                    props: { level: 3 }
                });
            });
        }
        if (this.tbChecklist) {
            this.tbChecklist.addEventListener('click', () => {
                const ed = this.blocknoteInstance?.editor;
                insertOrUpdateBlock(ed, {
                    type: 'checkListItem'
                });
            });
        }
        if (this.tbBullet) {
            this.tbBullet.addEventListener('click', () => {
                const ed = this.blocknoteInstance?.editor;
                insertOrUpdateBlock(ed, {
                    type: 'bulletListItem'
                });
            });
        }
        if (this.tbNumber) {
            this.tbNumber.addEventListener('click', () => {
                const ed = this.blocknoteInstance?.editor;
                insertOrUpdateBlock(ed, {
                    type: 'numberedListItem'
                });
            });
        }
        if (this.tableGrid && this.tableGridLabel) {
            const DEFAULT_ROWS = 6;
            const DEFAULT_COLS = 10;
            const MAX_ROWS = 20;
            const MAX_COLS = 20;
            let visibleRows = DEFAULT_ROWS;
            let visibleCols = DEFAULT_COLS;
            let currentSelRows = 0;
            let currentSelCols = 0;
            const buildGridDOM = (selRows = 0, selCols = 0) => {
                currentSelRows = selRows;
                currentSelCols = selCols;
                this.tableGrid.style.gridTemplateColumns = `repeat(${visibleCols}, 13px)`;
                this.tableGrid.style.gridTemplateRows = `repeat(${visibleRows}, 13px)`;
                this.tableGrid.innerHTML = '';
                if (this.tableGridLabel) {
                    this.tableGridLabel.textContent = (selRows > 0 && selCols > 0)
                        ? `${selCols} x ${selRows}`
                        : '0 x 0';
                }
                for (let r = 1; r <= visibleRows; r++) {
                    for (let c = 1; c <= visibleCols; c++) {
                        const colFromRight = visibleCols - c + 1;
                        const isHighlighted = (selRows > 0 && selCols > 0 && r <= selRows && colFromRight <= selCols);
                        const cell = document.createElement('div');
                        cell.className = 'notes-table-grid-cell' + (isHighlighted ? ' highlighted' : '');
                        cell.dataset.row = String(r);
                        cell.dataset.col = String(colFromRight);
                        cell.addEventListener('mouseenter', () => {
                            handleCellHover(r, colFromRight);
                        });
                        cell.addEventListener('click', (e) => {
                            e.stopPropagation();
                            if (this.tablePickerMenu) this.tablePickerMenu.style.display = 'none';
                            const ed = this.blocknoteInstance?.editor;
                            if (!ed) return;
                            const insertRows = r;
                            const insertCols = colFromRight;
                            const rows = [];
                            for (let i = 0; i < insertRows; i++) {
                                const rowCells = [];
                                for (let j = 0; j < insertCols; j++) {
                                    rowCells.push([{ type: 'text', text: '', styles: {} }]);
                                }
                                rows.push({ cells: rowCells });
                            }
                            insertOrUpdateBlock(ed, {
                                type: 'table',
                                content: {
                                    type: 'tableContent',
                                    rows: rows
                                }
                            });
                        });
                        this.tableGrid.appendChild(cell);
                    }
                }
            };
            const updateHighlightOnly = (selRows, selCols) => {
                currentSelRows = selRows;
                currentSelCols = selCols;
                if (this.tableGridLabel) {
                    this.tableGridLabel.textContent = (selRows > 0 && selCols > 0)
                        ? `${selCols} x ${selRows}`
                        : '0 x 0';
                }
                const cells = this.tableGrid.children;
                for (let i = 0; i < cells.length; i++) {
                    const cell = cells[i];
                    const r = Number(cell.dataset.row);
                    const colFromRight = Number(cell.dataset.col);
                    if (selRows > 0 && selCols > 0 && r <= selRows && colFromRight <= selCols) {
                        cell.classList.add('highlighted');
                    } else {
                        cell.classList.remove('highlighted');
                    }
                }
            };
            const handleCellHover = (targetRow, targetColFromRight) => {
                const targetRows = Math.min(MAX_ROWS, Math.max(DEFAULT_ROWS, targetRow + 1));
                const targetCols = Math.min(MAX_COLS, Math.max(DEFAULT_COLS, targetColFromRight + 1));
                if (targetRows !== visibleRows || targetCols !== visibleCols) {
                    visibleRows = targetRows;
                    visibleCols = targetCols;
                    buildGridDOM(targetRow, targetColFromRight);
                } else {
                    updateHighlightOnly(targetRow, targetColFromRight);
                }
            };
            const computeIndex = (dist, maxLimit) => {
                if (dist <= 0) return 1;
                const cellW = 13;
                const pitch = 15.5; 
                let idx = 1;
                if (dist > cellW) {
                    idx = Math.floor((dist - cellW) / pitch) + 2;
                }
                return Math.max(1, Math.min(maxLimit, idx));
            };
            const handleMouseMove = (e) => {
                const rect = this.tableGrid.getBoundingClientRect();
                if (!rect.width || !rect.height) return;
                const relY = e.clientY - rect.top;
                const distFromRight = rect.right - e.clientX;
                const colFromRight = computeIndex(distFromRight, MAX_COLS);
                const rowFromTop = computeIndex(relY, MAX_ROWS);
                handleCellHover(rowFromTop, colFromRight);
            };
            this.tableGrid.addEventListener('mousemove', handleMouseMove);
            const resetGrid = () => {
                visibleRows = DEFAULT_ROWS;
                visibleCols = DEFAULT_COLS;
                buildGridDOM(0, 0);
            };
            this.tableGrid.addEventListener('mouseleave', () => {
                resetGrid();
            });
            this.resetTableGrid = resetGrid;
            resetGrid();
        }
        if (this.tbTable && this.tablePickerMenu) {
            const toggleTablePicker = (e) => {
                e.stopPropagation();
                if (this.moreMenu) this.moreMenu.style.display = 'none';
                const isHidden = !this.tablePickerMenu.style.display || this.tablePickerMenu.style.display === 'none' || window.getComputedStyle(this.tablePickerMenu).display === 'none';
                this.tablePickerMenu.style.display = isHidden ? 'flex' : 'none';
                if (isHidden && typeof this.resetTableGrid === 'function') {
                    this.resetTableGrid();
                }
            };
            this.tbTable.addEventListener('click', toggleTablePicker);
            const tableDropdownEl = document.getElementById('notes-table-dropdown');
            if (tableDropdownEl) {
                tableDropdownEl.addEventListener('click', (e) => {
                    if (e.target.closest('#notes-table-picker-menu')) return;
                    if (e.target === this.tbTable || this.tbTable.contains(e.target)) return;
                    toggleTablePicker(e);
                });
            }
            document.addEventListener('click', (e) => {
                if (this.tablePickerMenu && !e.target.closest('#notes-table-dropdown')) {
                    this.tablePickerMenu.style.display = 'none';
                }
            });
        }
        if (this.tbImage) {
            this.tbImage.addEventListener('click', async () => {
                const ed = this.blocknoteInstance?.editor;
                if (!ed) return;
                let url = null;
                if (typeof window.showCustomPrompt === 'function') {
                    url = await window.showCustomPrompt({
                        title: 'Insert Image',
                        message: 'Enter image URL:',
                        placeholder: 'https://example.com/image.png',
                        confirmLabel: 'Insert'
                    });
                } else {
                    url = prompt('Enter image URL:');
                }
                if (url && url.trim()) {
                    insertOrUpdateBlock(ed, {
                        type: 'image',
                        props: {
                            url: url.trim()
                        }
                    });
                }
            });
        }
        if (this.tbUndo) {
            this.tbUndo.addEventListener('click', () => {
                const ed = this.blocknoteInstance?.editor;
                if (!ed) return;
                try {
                    if (typeof ed.undo === 'function') {
                        ed.undo();
                    } else if (ed._tiptapEditor && typeof ed._tiptapEditor.commands?.undo === 'function') {
                        ed._tiptapEditor.commands.undo();
                    }
                    ed.focus();
                } catch (e) {
                    console.warn('Undo failed:', e);
                }
            });
        }
        if (this.tbRedo) {
            this.tbRedo.addEventListener('click', () => {
                const ed = this.blocknoteInstance?.editor;
                if (!ed) return;
                try {
                    if (typeof ed.redo === 'function') {
                        ed.redo();
                    } else if (ed._tiptapEditor && typeof ed._tiptapEditor.commands?.redo === 'function') {
                        ed._tiptapEditor.commands.redo();
                    }
                    ed.focus();
                } catch (e) {
                    console.warn('Redo failed:', e);
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
        const moreChecklist = document.getElementById('note-more-checklist');
        const moreBullet = document.getElementById('note-more-bullet');
        const moreNumber = document.getElementById('note-more-number');
        const moreTable = document.getElementById('note-more-table');
        if (moreChecklist) {
            moreChecklist.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.moreMenu) this.moreMenu.style.display = 'none';
                const ed = this.blocknoteInstance?.editor;
                insertOrUpdateBlock(ed, { type: 'checkListItem' });
            });
        }
        if (moreBullet) {
            moreBullet.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.moreMenu) this.moreMenu.style.display = 'none';
                const ed = this.blocknoteInstance?.editor;
                insertOrUpdateBlock(ed, { type: 'bulletListItem' });
            });
        }
        if (moreNumber) {
            moreNumber.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.moreMenu) this.moreMenu.style.display = 'none';
                const ed = this.blocknoteInstance?.editor;
                insertOrUpdateBlock(ed, { type: 'numberedListItem' });
            });
        }
        if (moreTable) {
            moreTable.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.moreMenu) this.moreMenu.style.display = 'none';
                const ed = this.blocknoteInstance?.editor;
                if (!ed) return;
                insertOrUpdateBlock(ed, {
                    type: 'table',
                    content: {
                        type: 'tableContent',
                        rows: [
                            { cells: [[{ type: 'text', text: '', styles: {} }], [{ type: 'text', text: '', styles: {} }]] },
                            { cells: [[{ type: 'text', text: '', styles: {} }], [{ type: 'text', text: '', styles: {} }]] }
                        ]
                    }
                });
            });
        }
        const moreH1 = document.getElementById('note-more-h1');
        const moreH2 = document.getElementById('note-more-h2');
        const moreH3 = document.getElementById('note-more-h3');
        const moreUndo = document.getElementById('note-more-undo');
        const moreRedo = document.getElementById('note-more-redo');
        if (moreH1) {
            moreH1.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.moreMenu) this.moreMenu.style.display = 'none';
                const ed = this.blocknoteInstance?.editor;
                updateActiveBlockType(ed, { type: 'heading', props: { level: 1 } });
            });
        }
        if (moreH2) {
            moreH2.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.moreMenu) this.moreMenu.style.display = 'none';
                const ed = this.blocknoteInstance?.editor;
                updateActiveBlockType(ed, { type: 'heading', props: { level: 2 } });
            });
        }
        if (moreH3) {
            moreH3.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.moreMenu) this.moreMenu.style.display = 'none';
                const ed = this.blocknoteInstance?.editor;
                updateActiveBlockType(ed, { type: 'heading', props: { level: 3 } });
            });
        }
        if (moreUndo) {
            moreUndo.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.moreMenu) this.moreMenu.style.display = 'none';
                const ed = this.blocknoteInstance?.editor;
                if (!ed) return;
                try {
                    if (typeof ed.undo === 'function') ed.undo();
                    else if (ed._tiptapEditor?.commands?.undo) ed._tiptapEditor.commands.undo();
                    ed.focus();
                } catch (_) {}
            });
        }
        if (moreRedo) {
            moreRedo.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.moreMenu) this.moreMenu.style.display = 'none';
                const ed = this.blocknoteInstance?.editor;
                if (!ed) return;
                try {
                    if (typeof ed.redo === 'function') ed.redo();
                    else if (ed._tiptapEditor?.commands?.redo) ed._tiptapEditor.commands.redo();
                    ed.focus();
                } catch (_) {}
            });
        }
        this.setupToolbarOverflowObserver();
    }
    setupToolbarOverflowObserver() {
        const header = document.querySelector('.notes-editor-header');
        const headerLeft = document.querySelector('.notes-editor-header-left');
        const toolbarRight = document.querySelector('.notes-toolbar-right');
        const overflowDivider = document.querySelector('.notes-overflow-divider');
        if (!header || !headerLeft || !toolbarRight) return;
        const COLLAPSIBLE_ITEMS = [
            { tbId: 'notes-table-dropdown', moreId: 'note-more-table' },
            { tbId: 'note-tb-number', moreId: 'note-more-number' },
            { tbId: 'note-tb-bullet', moreId: 'note-more-bullet' },
            { tbId: 'note-tb-checklist', moreId: 'note-more-checklist' },
            { tbId: 'note-tb-redo', moreId: 'note-more-redo' },
            { tbId: 'note-tb-undo', moreId: 'note-more-undo' },
            { tbId: 'note-tb-h3', moreId: 'note-more-h3' },
            { tbId: 'note-tb-h2', moreId: 'note-more-h2' },
            { tbId: 'note-tb-h1', moreId: 'note-more-h1' }
        ];
        const updateOverflow = () => {
            COLLAPSIBLE_ITEMS.forEach(item => {
                const tbEl = document.getElementById(item.tbId);
                const moreEl = document.getElementById(item.moreId);
                if (tbEl) tbEl.style.display = '';
                if (moreEl) moreEl.style.display = 'none';
            });
            if (overflowDivider) overflowDivider.style.display = 'none';
            let hasOverflow = false;
            for (let i = 0; i < COLLAPSIBLE_ITEMS.length; i++) {
                const leftRect = headerLeft.getBoundingClientRect();
                const rightRect = toolbarRight.getBoundingClientRect();
                const headerRect = header.getBoundingClientRect();
                if (headerRect.width === 0) break;
                const isColliding = (rightRect.left < leftRect.right + 8) || (rightRect.right > headerRect.right - 6);
                if (!isColliding) {
                    break;
                }
                const item = COLLAPSIBLE_ITEMS[i];
                const tbEl = document.getElementById(item.tbId);
                const moreEl = document.getElementById(item.moreId);
                if (tbEl) tbEl.style.display = 'none';
                if (moreEl) moreEl.style.display = 'flex';
                hasOverflow = true;
            }
            if (overflowDivider) {
                overflowDivider.style.display = hasOverflow ? 'block' : 'none';
            }
        };
        requestAnimationFrame(updateOverflow);
        if (window.ResizeObserver) {
            const ro = new ResizeObserver(() => {
                requestAnimationFrame(updateOverflow);
            });
            ro.observe(header);
            ro.observe(headerLeft);
        }
        window.addEventListener('resize', updateOverflow);
    }
    async renderCollections() {
        if (!this.collectionsList) return;
        const collections = await NotesManager.getCollections();
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
        this.collectionsList.querySelectorAll('.notes-col-item-wrapper').forEach(wrapper => {
            const btn = wrapper.querySelector('.notes-col-item');
            const colId = btn.getAttribute('data-col-id');
            btn.addEventListener('click', (e) => {
                this.activeCollectionId = colId;
                localStorage.setItem('lumina_active_collection_id', colId);
                this.updateUrlParams();
                this.renderCollections();
                this.renderNotesList();
            });
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
                const targetColId = (colId === 'all' || colId === 'col_default') ? null : colId;
                await NotesManager.moveNote(noteId, targetColId);
                await this.renderCollections();
                await this.renderNotesList(this.notesSearchInput?.value?.trim()?.toLowerCase() || '');
            });
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
        let colName = 'Collection';
        const found = collections.find(c => c.id === colId);
        if (found) colName = found.name;
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
        menu.querySelector('#ctx-col-rename').addEventListener('click', async () => {
            this.closeContextMenu();
            let newName = null;
            if (typeof window.showCustomPrompt === 'function') {
                newName = await window.showCustomPrompt({
                    title: 'Rename Collection',
                    message: 'Enter new collection name:',
                    defaultValue: colName,
                    confirmLabel: 'Save'
                });
            } else {
                newName = prompt('Enter new collection name:', colName);
            }
            if (newName && newName.trim()) {
                await NotesManager.renameCollection(colId, newName.trim());
                await this.renderCollections();
                if (this.activeNoteId) {
                    const currentNote = await NotesManager.getNote(this.activeNoteId);
                    if (currentNote) this.updateCollectionPickerPill(currentNote);
                }
            }
        });
        menu.querySelector('#ctx-col-delete').addEventListener('click', async () => {
            this.closeContextMenu();
            let confirmed = false;
            const bodyMsg = 'Are you sure you want to delete this collection? Notes inside will be unassigned.';
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
            const menuBtn = item.querySelector('.notes-menu-btn');
            if (menuBtn) {
                menuBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const noteId = item.getAttribute('data-note-id');
                    const note = notes.find(n => n.id === noteId);
                    await this.showNoteContextMenu(e, note);
                });
            }
            item.addEventListener('contextmenu', async (e) => {
                e.preventDefault();
                const noteId = item.getAttribute('data-note-id');
                const note = notes.find(n => n.id === noteId);
                await this.showNoteContextMenu(e, note);
            });
        });
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
            localStorage.setItem('lumina_active_collection_id', newCol.id);
            this.updateUrlParams();
            await this.renderCollections();
            await this.renderNotesList();
        }
    }
    async handleCreateNote() {
        const colId = (this.activeCollectionId === 'all' || this.activeCollectionId === 'col_default') ? null : this.activeCollectionId;
        const newNote = await NotesManager.createNote(colId, 'Untitled Note');
        this.activeNoteId = newNote.id;
        if (this.notesList) {
            this.notesList.querySelectorAll('.notes-item.active').forEach(el => el.classList.remove('active'));
        }
        this.showEditorView();
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
            this.updateUrlParams();
            if (window.innerWidth <= 680) {
                this.showListView();
            }
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
        this.showEditorView();
        this.updateUrlParams();
        if (this.notesEditorPane) {
            this.notesEditorPane.style.display = '';
        }
        if (this.notesEmptyState) {
            this.notesEmptyState.style.display = 'none';
        }
        if (this.notesList) {
            this.notesList.querySelectorAll('.notes-item').forEach(el => {
                el.classList.toggle('active', el.getAttribute('data-note-id') === noteId);
            });
        }
        const noteTitle = note.title || 'Untitled Note';
        if (this.noteTitleInput) {
            this.noteTitleInput.value = note.title || '';
        }
        document.title = noteTitle;
        await this.updateCollectionPickerPill(note);
        await this.initEditorInstance(note.content);
        const blocks = Array.isArray(note.content) ? note.content : [];
        this.updateWordCount(blocks);
    }
    showEmptyEditorState() {
        document.title = 'Lumina';
        if (window.innerWidth <= 680) {
            this.showListView();
        }
        if (this.notesEditorPane && window.innerWidth > 680) {
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
                    const cssUrl = (typeof chrome !== 'undefined' && chrome.runtime?.getURL)
                        ? chrome.runtime.getURL('lib/vendor/blocknote.css')
                        : '../../lib/vendor/blocknote.css';
                    const jsUrl = (typeof chrome !== 'undefined' && chrome.runtime?.getURL)
                        ? chrome.runtime.getURL('lib/vendor/blocknote.js')
                        : '../../lib/vendor/blocknote.js';
                    await Promise.all([
                        window.luminaLoadCSS(cssUrl),
                        window.luminaLoadScript(jsUrl)
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
            let initialBlocks = undefined;
            if (initialData && Array.isArray(initialData)) {
                initialBlocks = initialData;
            } else if (initialData?.blocks && Array.isArray(initialData.blocks)) {
                initialBlocks = initialData.blocks;
            }
            this.blocknoteInstance = window.LuminaBlockNote.mount(
                this.editorContainer,
                initialBlocks,
                (updatedBlocks) => {
                    this.triggerAutoSave(updatedBlocks);
                }
            );
            this._bindSelectionCount();
        } catch (err) {
            console.error('Failed to initialize BlockNote:', err);
        }
    }
    triggerAutoSave(blocksFromEvent) {
        if (this.autoSaveTimer) {
            clearTimeout(this.autoSaveTimer);
        }
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
        if (this._selectionHandler) {
            document.removeEventListener('selectionchange', this._selectionHandler);
        }
        this._selectionHandler = () => {
            const sel = window.getSelection();
            if (!sel || sel.isCollapsed) {
                if (this.blocknoteInstance) {
                    const blocks = this.blocknoteInstance.getBlocks ? this.blocknoteInstance.getBlocks() : [];
                    this.updateWordCount(blocks);
                }
                return;
            }
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
