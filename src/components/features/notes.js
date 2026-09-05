import { NotesManager } from '../../db/notes_manager.js';
import { NexusMenu } from '../ui/index.js';
import { Editor } from '@tiptap/core';
import { StarterKit } from '@tiptap/starter-kit';
import { Placeholder } from '@tiptap/extension-placeholder';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import { Link } from '@tiptap/extension-link';
import { Highlight } from '@tiptap/extension-highlight';
import { Underline } from '@tiptap/extension-underline';

// ============================================================================
// 1. NOTES UTILITIES
// ============================================================================

export function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export function timeAgo(timestamp) {
    if (!timestamp) return '';
    const now = Date.now();
    const diff = Math.floor((now - timestamp) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function extractNoteText(content) {
    if (!content) return '';
    if (typeof content === 'string') {
        try {
            content = JSON.parse(content);
        } catch {
            return content.trim();
        }
    }
    // TipTap Doc
    if (content && content.type === 'doc' && Array.isArray(content.content)) {
        const texts = [];
        function parseNode(node) {
            if (!node) return;
            if (node.text) texts.push(node.text);
            if (Array.isArray(node.content)) {
                node.content.forEach(parseNode);
            }
        }
        content.content.forEach(parseNode);
        return texts.join(' ').trim();
    }
    return '';
}

export function extractSearchSnippet(text, query, snippetLength = 120) {
    if (!text) return '';
    if (!query) return text.slice(0, snippetLength);
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const index = lowerText.indexOf(lowerQuery);
    if (index === -1) return text.slice(0, snippetLength);
    const start = Math.max(0, index - Math.floor(snippetLength / 3));
    const end = Math.min(text.length, start + snippetLength);
    let snippet = text.slice(start, end);
    if (start > 0) snippet = '...' + snippet;
    if (end < text.length) snippet = snippet + '...';
    return snippet;
}

export function highlightSnippet(snippet, query) {
    if (!query || !snippet) return escapeHtml(snippet);
    const escapedSnippet = escapeHtml(snippet);
    const escapedQuery = escapeHtml(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedQuery})`, 'gi');
    return escapedSnippet.replace(regex, '<mark class="nexus-search-match">$1</mark>');
}

export function filterNotesByCollection(notes, collectionId) {
    if (!Array.isArray(notes)) return [];
    if (!collectionId || collectionId === 'all') {
        return notes.filter(n => !n.isDeleted && !n.isArchived);
    }
    if (collectionId === 'trash') {
        return notes.filter(n => n.isDeleted);
    }
    if (collectionId === 'uncategorized') {
        return notes.filter(n => !n.isDeleted && !n.collectionId);
    }
    return notes.filter(n => !n.isDeleted && n.collectionId === collectionId);
}

// ============================================================================
// 2. TIPTAP MARGIN CLICK ENGINE
// ============================================================================

/**
 * Checks if a target position's coordinate is on the same visual line as [lineTop, lineBottom].
 */
function isOnSameLine(coords, lineTop, lineBottom) {
    if (!coords) return false;
    const mid = (coords.top + coords.bottom) / 2;
    const padding = 2;
    return mid >= (lineTop - padding) && mid <= (lineBottom + padding);
}

/**
 * Finds the start position (before first character) of the visual line containing `pos`.
 */
function findVisualLineStart(view, doc, pos) {
    try {
        const $pos = doc.resolve(pos);
        const isBlock = $pos.parent?.isTextblock;
        const blockStart = isBlock ? $pos.start() : 1;
        const blockEnd = isBlock ? $pos.end() : Math.max(1, doc.content.size - 1);
        if (blockStart >= blockEnd) return blockStart;

        const refCoords = view.coordsAtPos(pos, 1) || view.coordsAtPos(pos, -1);
        if (!refCoords) return pos;

        const lineTop = refCoords.top;
        const lineBottom = refCoords.bottom;

        let cur = pos;
        while (cur > blockStart) {
            const testCoords = view.coordsAtPos(cur - 1, 1);
            if (!testCoords || !isOnSameLine(testCoords, lineTop, lineBottom)) {
                break;
            }
            cur--;
        }
        return cur;
    } catch {
        return pos;
    }
}

/**
 * Finds the end position (after last visible character) of the visual line containing `pos`.
 * Ensures the position stays on the current line and does not land after the trailing space
 * (which would cause Chromium to render the caret at the start of the next line).
 */
function findVisualLineEnd(view, doc, pos) {
    try {
        const $pos = doc.resolve(pos);
        const isBlock = $pos.parent?.isTextblock;
        const blockStart = isBlock ? $pos.start() : 1;
        const blockEnd = isBlock ? $pos.end() : Math.max(1, doc.content.size - 1);
        if (blockStart >= blockEnd) return blockEnd;

        const refCoords = view.coordsAtPos(pos, -1) || view.coordsAtPos(pos, 1);
        if (!refCoords) return pos;

        const lineTop = refCoords.top;
        const lineBottom = refCoords.bottom;

        let cur = pos;

        // If pos itself is already at or past the wrap boundary, step backward
        while (cur > blockStart) {
            const downstream = view.coordsAtPos(cur, 1);
            if (downstream && !isOnSameLine(downstream, lineTop, lineBottom)) {
                cur--;
            } else {
                break;
            }
        }

        // Walk forward to find the last position whose downstream coords stay on this line
        while (cur < blockEnd) {
            const nextUpstream = view.coordsAtPos(cur + 1, -1);
            if (!nextUpstream || !isOnSameLine(nextUpstream, lineTop, lineBottom)) {
                break;
            }
            const nextDownstream = view.coordsAtPos(cur + 1, 1);
            if (nextDownstream && !isOnSameLine(nextDownstream, lineTop, lineBottom)) {
                // cur + 1 is at the soft-wrap boundary (e.g. trailing space before next line).
                // Stopping at `cur` keeps the caret immediately after the last character on this line.
                break;
            }
            cur++;
        }
        return cur;
    } catch {
        return pos;
    }
}

/**
 * Finds the valid start and end positions inside textblocks in the document.
 */
function getValidTextRange(doc) {
    let startPos = 1;
    while (startPos < doc.content.size && !doc.resolve(startPos).parent?.isTextblock) {
        startPos++;
    }
    let endPos = Math.max(startPos, doc.content.size - 1);
    while (endPos > startPos && !doc.resolve(endPos).parent?.isTextblock) {
        endPos--;
    }
    return { startPos, endPos };
}

/**
 * Returns the ProseMirror document position for a margin click.
 *
 * @param {import('prosemirror-view').EditorView} view
 * @param {number} clientX - original click X (in the margin or window)
 * @param {number} clientY - original click Y
 * @returns {number|null}
 */
export function getDocPositionFromPoint(view, clientX, clientY) {
    if (!view?.dom || !view.state?.doc) return null;

    const doc = view.state.doc;
    if (doc.content.size <= 2) {
        return 1;
    }

    const pmRect = view.dom.getBoundingClientRect();
    const isLeft = clientX < pmRect.left;

    const { startPos, endPos } = getValidTextRange(doc);

    let firstCoords = null;
    let lastCoords = null;
    try {
        firstCoords = view.coordsAtPos(startPos, 1);
        lastCoords = view.coordsAtPos(endPos, -1);
    } catch {}

    if (!firstCoords || !lastCoords) {
        return isLeft ? startPos : endPos;
    }

    const topTextY = firstCoords.top;
    const bottomTextY = lastCoords.bottom;

    // ── CASE 1: Click is ABOVE all text ──────────────────────────────────────
    if (clientY < topTextY) {
        if (isLeft) {
            return startPos;
        }
        return findVisualLineEnd(view, doc, startPos);
    }

    // ── CASE 2: Click is BELOW all text (e.g. empty space / bottom padding) ──
    if (clientY > bottomTextY) {
        if (!isLeft) {
            return endPos;
        }
        // Left margin below text: start of the LAST visual line
        return findVisualLineStart(view, doc, endPos);
    }

    // ── CASE 3: Click is alongside text (left or right margin) ───────────────
    const centerX = (pmRect.left + pmRect.right) / 2;
    let probeResult = null;

    try {
        probeResult = view.posAtCoords({ left: centerX, top: clientY });
    } catch {}

    if (!probeResult) {
        try {
            probeResult = view.posAtCoords({ left: pmRect.left + 20, top: clientY });
        } catch {}
    }

    if (!probeResult) {
        const clampedY = Math.max(topTextY, Math.min(clientY, bottomTextY));
        try {
            probeResult = view.posAtCoords({ left: centerX, top: clampedY });
        } catch {}
    }

    if (!probeResult || typeof probeResult.pos !== 'number') {
        return isLeft ? startPos : endPos;
    }

    const pos = probeResult.pos;

    if (isLeft) {
        return findVisualLineStart(view, doc, pos);
    } else {
        return findVisualLineEnd(view, doc, pos);
    }
}

// ============================================================================
// 3. TIPTAP EDITOR WRAPPER
// ============================================================================

/**
 * Normalizes note content into standard TipTap doc JSON or text
 */
function normalizeContent(data) {
    if (!data) {
        return { type: 'doc', content: [{ type: 'paragraph' }] };
    }

    if (typeof data === 'string') {
        try {
            data = JSON.parse(data);
        } catch {
            return data;
        }
    }

    if (data && data.type === 'doc') {
        return data;
    }

    return data;
}

export class NexusTipTapEditor {
    constructor(options = {}) {
        this.container = options.container;
        this.onChange = options.onChange;
        this.initialContent = normalizeContent(options.initialContent);
        this.editor = null;
        this.init();
    }

    init() {
        if (!this.container) return;
        this.container.innerHTML = '';

        this.editor = new Editor({
            element: this.container,
            extensions: [
                StarterKit.configure({
                    heading: {
                        levels: [1, 2, 3, 4, 5, 6]
                    },
                    codeBlock: {
                        HTMLAttributes: {
                            class: 'nexus-code-block'
                        }
                    }
                }),
                Placeholder.configure({
                    placeholder: 'Type something or write with Markdown...',
                    emptyEditorClass: 'is-editor-empty',
                    emptyNodeClass: 'is-empty'
                }),
                TaskList.configure({
                    HTMLAttributes: {
                        class: 'nexus-task-list'
                    }
                }),
                TaskItem.configure({
                    nested: true,
                    HTMLAttributes: {
                        class: 'nexus-task-item'
                    }
                }),
                Table.configure({
                    resizable: true,
                    HTMLAttributes: {
                        class: 'nexus-table'
                    }
                }),
                TableRow,
                TableHeader,
                TableCell,
                Link.configure({
                    openOnClick: false,
                    HTMLAttributes: {
                        class: 'nexus-editor-link'
                    }
                }),
                Highlight.configure({
                    multicolor: true
                }),
                Underline
            ],
            content: this.initialContent,
            editorProps: {
                attributes: {
                    class: 'nexus-tiptap-content',
                    spellcheck: 'false'
                }
            },
            onUpdate: ({ editor }) => {
                if (typeof this.onChange === 'function') {
                    this.onChange(editor.getJSON());
                }
            }
        });
    }

    getJSON() {
        return this.editor ? this.editor.getJSON() : null;
    }

    getHTML() {
        return this.editor ? this.editor.getHTML() : '';
    }

    getText() {
        return this.editor ? this.editor.getText() : '';
    }

    focus(position = null) {
        if (!this.editor || this.editor.isDestroyed) return;
        if (position !== null && position !== undefined) {
            this.editor.commands.focus(position);
        } else {
            this.editor.commands.focus();
        }
    }

    getDocPositionFromPoint(clientX, clientY) {
        if (!this.editor || this.editor.isDestroyed || !this.editor.view) return null;
        return getDocPositionFromPoint(this.editor.view, clientX, clientY);
    }

    focusAtCoords(clientX, clientY) {
        if (!this.editor || this.editor.isDestroyed || !this.editor.view) return;
        const pos = this.getDocPositionFromPoint(clientX, clientY);
        if (pos !== null) {
            this.editor.commands.setTextSelection(pos);
            this.editor.commands.focus();
        } else {
            this.focus();
        }
    }

    unmount() {
        if (this.editor) {
            this.editor.destroy();
            this.editor = null;
        }
        if (this.container) {
            this.container.innerHTML = '';
        }
    }

    destroy() {
        this.unmount();
    }

    static mount(container, initialContent, onChange) {
        return new NexusTipTapEditor({
            container,
            initialContent,
            onChange
        });
    }
}

// ============================================================================
// 4. NOTES PANEL COMPONENT
// ============================================================================

export class NotesPanel {
    constructor() {
        this.activeCollectionId = 'all';
        this.activeNoteId = null;
        this.editorInstance = null;
        this.autoSaveTimer = null;
        this.isInitialized = false;
        this.sortMode = 'modified';
        this.viewMode = localStorage.getItem('nexus_notes_view_mode') || 'grid';
        this.isBatchMode = false;
        this.selectedNoteIds = new Set();
        this._contextMenu = null;
        this._selectionHandler = null;
    }

    async init(targetNoteId, targetColId) {
        this.cacheElements();
        if (!this.isInitialized) {
            this.bindEvents();
            this.bindToolbarEvents();
            this.initCollectionPickerPill();
            this.isInitialized = true;
        }

        const urlParams = new URLSearchParams(window.location.search);
        const colFromUrl = targetColId || urlParams.get('colId');
        const savedCol = localStorage.getItem('nexus_active_collection_id');
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
            await this.loadNote(targetNoteId);
        } else {
            this.showHubView();
        }

        localStorage.setItem('nexus_active_collection_id', this.activeCollectionId);
        await this.renderCollections();
        await this.renderNotesList();
    }

    showHubView() {
        if (this.activeNoteId) {
            this.checkAndDiscardEmptyNote(this.activeNoteId);
        }
        this.activeNoteId = null;
        if (this.container) {
            this.container.classList.remove('is-detail');
        }
        if (this.hubView) {
            this.hubView.style.display = 'flex';
        }
        if (this.detailView) {
            this.detailView.style.display = 'none';
        }
        this.updateUrlParams();
        document.title = 'Notes - Nexus';
        this.renderCollections();
        this.renderNotesList(this.notesSearchInput?.value?.trim()?.toLowerCase() || '');
    }

    async showDetailView(noteId) {
        this.activeNoteId = noteId;
        if (this.container) {
            this.container.classList.add('is-detail');
        }
        if (this.hubView) {
            this.hubView.style.display = 'none';
        }
        if (this.detailView) {
            this.detailView.style.display = 'flex';
        }
        this.updateUrlParams();
    }

    async checkAndDiscardEmptyNote(noteId) {
        if (!noteId) return;
        try {
            const note = await NotesManager.getNote(noteId);
            if (!note) return;
            const title = (note.title || '').trim();
            const textContent = extractNoteText(note.content).trim();
            const isUntitled = !title || title.toLowerCase() === 'untitled note' || title.toLowerCase() === 'untitled';
            if (isUntitled && !textContent) {
                await NotesManager.deleteNote(noteId);
            }
        } catch (err) {
            console.warn('Error checking empty note:', err);
        }
    }

    updateUrlParams() {
        if (typeof window.updateNotesUrl === 'function') {
            window.updateNotesUrl(this.activeNoteId, this.activeCollectionId);
        } else {
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.get('view') === 'notes') {
                if (this.activeNoteId) {
                    urlParams.set('noteId', this.activeNoteId);
                } else {
                    urlParams.delete('noteId');
                }
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

    cacheElements() {
        this.container = document.getElementById('notes-page');
        this.hubView = document.getElementById('notes-hub-view');
        this.detailView = document.getElementById('notes-detail-view');
        this.collectionsPills = document.getElementById('notes-collections-pills');
        this.cardsContainer = document.getElementById('notes-hub-cards-container');
        this.newCollectionBtn = document.getElementById('notes-new-collection-btn');
        this.newNoteBtn = document.getElementById('notes-new-note-btn');
        this.notesSearchInput = document.getElementById('notes-search-input');
        this.sortBtn = document.getElementById('notes-sort-btn');
        this.sortLabel = document.getElementById('notes-sort-label');
        this.gridBtn = document.getElementById('notes-view-grid-btn');
        this.listBtn = document.getElementById('notes-view-list-btn');
        this.batchModeBtn = document.getElementById('notes-batch-mode-btn');
        this.batchBar = document.getElementById('notes-batch-bar');
        this.batchCountEl = document.getElementById('notes-batch-count');
        this.batchMoveBtn = document.getElementById('notes-batch-move-btn');
        this.batchDeleteBtn = document.getElementById('notes-batch-delete-btn');
        this.batchCancelBtn = document.getElementById('notes-batch-cancel-btn');
        this.emptyState = document.getElementById('notes-empty-state');
        this.backBtn = document.getElementById('notes-back-btn');
        this.editorPane = document.getElementById('notes-editor-pane');
        this.editorBody = this.editorPane ? this.editorPane.querySelector('.notes-editor-body') : null;
        this.noteTitleInput = document.getElementById('note-title-input');
        this.editorContainer = document.getElementById('editorjs');
        this.colPickerWrapper = document.getElementById('notes-col-picker-wrapper');
        this.colPickerPill = document.getElementById('notes-col-picker-pill');
        this.colPickerLabel = document.getElementById('notes-col-picker-label');
        this.colPickerDropdown = document.getElementById('notes-col-picker-dropdown');
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
        this.tbUndo = document.getElementById('note-tb-undo');
        this.tbRedo = document.getElementById('note-tb-redo');
        this.tbMore = document.getElementById('note-tb-more');
    }

    bindEvents() {
        if (this.backBtn) {
            this.backBtn.addEventListener('click', () => {
                this.showHubView();
            });
        }

        if (this.newCollectionBtn) {
            this.newCollectionBtn.addEventListener('click', () => this.handleCreateCollection());
        }

        if (this.newNoteBtn) {
            this.newNoteBtn.addEventListener('click', () => this.handleCreateNote());
        }

        if (this.notesSearchInput) {
            this.notesSearchInput.addEventListener('input', (e) => {
                this.renderNotesList(e.target.value.trim().toLowerCase());
            });
        }

        if (this.sortBtn) {
            this.sortBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                NexusMenu.show({
                    anchor: this.sortBtn,
                    placement: 'bottom-end',
                    items: [
                        {
                            label: 'Last Modified',
                            active: this.sortMode === 'modified',
                            action: () => this.setSortMode('modified')
                        },
                        {
                            label: 'Date Created',
                            active: this.sortMode === 'created',
                            action: () => this.setSortMode('created')
                        },
                        {
                            label: 'Alphabetical (A–Z)',
                            active: this.sortMode === 'az',
                            action: () => this.setSortMode('az')
                        }
                    ]
                });
            });
        }

        if (this.gridBtn && this.listBtn) {
            this.gridBtn.addEventListener('click', () => this.setViewMode('grid'));
            this.listBtn.addEventListener('click', () => this.setViewMode('list'));
        }

        if (this.batchModeBtn) {
            this.batchModeBtn.addEventListener('click', () => {
                this.isBatchMode = !this.isBatchMode;
                this.batchModeBtn.classList.toggle('active', this.isBatchMode);
                if (!this.isBatchMode) {
                    this.clearBatchSelection();
                }
                this.renderNotesList(this.notesSearchInput?.value?.trim()?.toLowerCase() || '');
            });
        }

        if (this.batchCancelBtn) {
            this.batchCancelBtn.addEventListener('click', () => {
                this.clearBatchSelection();
                this.isBatchMode = false;
                if (this.batchModeBtn) this.batchModeBtn.classList.remove('active');
                this.renderNotesList(this.notesSearchInput?.value?.trim()?.toLowerCase() || '');
            });
        }

        if (this.batchDeleteBtn) {
            this.batchDeleteBtn.addEventListener('click', () => this.handleBatchDelete());
        }

        if (this.batchMoveBtn) {
            this.batchMoveBtn.addEventListener('click', (e) => this.handleBatchMove(e));
        }

        if (this.noteTitleInput) {
            this.noteTitleInput.addEventListener('input', (e) => {
                const titleVal = e.target.value.trim() || 'Untitled Note';
                document.title = `${titleVal} - Notes`;
                this.triggerAutoSave();
            });
            this.noteTitleInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (this.editorInstance) {
                        this.editorInstance.focus();
                    }
                }
            });
        }

        if (this.editorPane) {
            let marginDragStartPos = null;

            this.editorPane.addEventListener('mousedown', (e) => {
                if (e.target.closest('button, a, .nexus-dropdown-menu, .notes-col-picker-dropdown, .nexus-table-handle')) {
                    return;
                }
                if (e.target.tagName === 'INPUT' && e.target !== this.noteTitleInput) {
                    return;
                }

                const pmDom = this.editorInstance?.editor?.view?.dom;
                const pmRect = pmDom?.getBoundingClientRect() ?? null;
                const titleRect = this.noteTitleInput?.getBoundingClientRect() ?? null;

                // ── 1. Title Area Margin Handling (Positions 1-6) ───────────────────
                if (this.noteTitleInput && titleRect && pmRect) {
                    const titleEditorBoundaryY = (titleRect.bottom + pmRect.top) / 2;

                    if (e.clientY < titleEditorBoundaryY) {
                        // Click is inside or level with the title zone (above editor)
                        if (e.target === this.noteTitleInput) {
                            // Native input click handles caret position inside the text field
                            return;
                        }

                        // If clicking directly inside the title input bounds, allow default behavior
                        const inTitleHorizontalBounds = e.clientX >= titleRect.left && e.clientX <= titleRect.right;
                        const isDirectlyInsideTitleBox = inTitleHorizontalBounds && e.clientY >= titleRect.top && e.clientY <= titleRect.bottom;
                        if (isDirectlyInsideTitleBox) {
                            return;
                        }

                        e.preventDefault();
                        this.noteTitleInput.focus();
                        const valLen = this.noteTitleInput.value.length;

                        // Left side (positions 1, 2, 3) -> Caret at START of title
                        // Right side (positions 4, 5, 6) -> Caret at END of title
                        const titleCenter = (titleRect.left + titleRect.right) / 2;
                        if (e.clientX < titleCenter) {
                            this.noteTitleInput.setSelectionRange(0, 0);
                        } else {
                            this.noteTitleInput.setSelectionRange(valLen, valLen);
                        }
                        return;
                    }
                }

                if (!this.editorInstance?.editor) return;

                // ── 2. Editor Body Margin Handling ──────────────────────────────────
                if (pmRect) {
                    const inPmHorizontalBounds = e.clientX >= pmRect.left && e.clientX <= pmRect.right;
                    if (inPmHorizontalBounds) {
                        // Native browser text hit-testing handles this - do nothing
                        return;
                    }
                }

                // Click is in the left or right margin outside ProseMirror column
                e.preventDefault();

                const pos = this.editorInstance.getDocPositionFromPoint(e.clientX, e.clientY);
                if (pos !== null) {
                    this.editorInstance.editor.commands.setTextSelection(pos);
                    this.editorInstance.editor.commands.focus();
                    marginDragStartPos = pos;
                }
            });

            window.addEventListener('mousemove', (e) => {
                if (marginDragStartPos === null || !this.editorInstance?.editor) return;
                if (!(e.buttons & 1)) {
                    marginDragStartPos = null;
                    return;
                }
                const currentPos = this.editorInstance.getDocPositionFromPoint(e.clientX, e.clientY);
                if (currentPos !== null && currentPos !== marginDragStartPos) {
                    this.editorInstance.editor.commands.setTextSelection({
                        from: Math.min(marginDragStartPos, currentPos),
                        to: Math.max(marginDragStartPos, currentPos)
                    });
                }
            });

            window.addEventListener('mouseup', () => {
                marginDragStartPos = null;
            });
        }

        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const activeEl = document.activeElement;
                const isEditingText = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable);
                if (this.container?.classList.contains('is-detail') && !isEditingText) {
                    this.showHubView();
                }
            }
        });

        window.addEventListener('popstate', () => {
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.get('view') === 'notes') {
                const noteId = urlParams.get('noteId');
                const colId = urlParams.get('colId') || 'all';
                this.activeCollectionId = colId;
                if (noteId) {
                    this.loadNote(noteId);
                } else {
                    this.showHubView();
                }
            }
        });
    }

    setViewMode(mode) {
        this.viewMode = mode;
        localStorage.setItem('nexus_notes_view_mode', mode);
        if (this.gridBtn) this.gridBtn.classList.toggle('active', mode === 'grid');
        if (this.listBtn) this.listBtn.classList.toggle('active', mode === 'list');
        this.renderNotesList(this.notesSearchInput?.value?.trim()?.toLowerCase() || '');
    }

    setSortMode(mode) {
        this.sortMode = mode;
        if (this.sortLabel) {
            const map = {
                modified: 'Last Modified',
                created: 'Date Created',
                az: 'Alphabetical (A–Z)'
            };
            this.sortLabel.textContent = map[mode] || 'Last Modified';
        }
        this.renderNotesList(this.notesSearchInput?.value?.trim()?.toLowerCase() || '');
    }

    clearBatchSelection() {
        this.selectedNoteIds.clear();
        if (this.batchBar) this.batchBar.classList.remove('is-active');
        if (this.batchCountEl) this.batchCountEl.textContent = '0 selected';
    }

    updateBatchBar() {
        const count = this.selectedNoteIds.size;
        if (!this.batchBar) return;
        if (count > 0) {
            this.batchBar.classList.add('is-active');
            if (this.batchCountEl) this.batchCountEl.textContent = `${count} selected`;
        } else {
            this.batchBar.classList.remove('is-active');
        }
    }

    async handleBatchDelete() {
        if (this.selectedNoteIds.size === 0) return;
        let confirmed = false;
        const msg = `Are you sure you want to delete ${this.selectedNoteIds.size} selected notes?`;
        if (typeof window.showCustomPopup === 'function') {
            confirmed = await window.showCustomPopup({
                title: 'Delete Selected Notes',
                body: msg,
                confirmLabel: 'Delete',
                isDanger: true
            });
        } else {
            confirmed = confirm(msg);
        }
        if (confirmed) {
            for (const noteId of this.selectedNoteIds) {
                await NotesManager.deleteNote(noteId);
            }
            this.clearBatchSelection();
            await this.renderCollections();
            await this.renderNotesList(this.notesSearchInput?.value?.trim()?.toLowerCase() || '');
        }
    }

    async handleBatchMove(e) {
        if (this.selectedNoteIds.size === 0 || !e.target) return;
        const collections = await NotesManager.getCollections();
        
        const folderIcon = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`;

        const items = [
            {
                label: 'General (Unassigned)',
                icon: folderIcon,
                action: async () => {
                    for (const noteId of this.selectedNoteIds) {
                        await NotesManager.moveNote(noteId, null);
                    }
                    this.clearBatchSelection();
                    await this.renderCollections();
                    await this.renderNotesList(this.notesSearchInput?.value?.trim()?.toLowerCase() || '');
                }
            },
            ...collections.map(col => ({
                label: col.name,
                icon: folderIcon,
                action: async () => {
                    for (const noteId of this.selectedNoteIds) {
                        await NotesManager.moveNote(noteId, col.id);
                    }
                    this.clearBatchSelection();
                    await this.renderCollections();
                    await this.renderNotesList(this.notesSearchInput?.value?.trim()?.toLowerCase() || '');
                }
            }))
        ];

        NexusMenu.show({
            anchor: e.target,
            placement: 'top-start',
            items
        });
    }

    async renderCollections() {
        if (!this.collectionsPills) return;
        const collections = await NotesManager.getCollections();
        const allNotes = await NotesManager.getNotes('all');
        const allCount = allNotes.filter(n => !n.isDeleted).length;
        const colCounts = await Promise.all(collections.map(async c => {
            const notes = await NotesManager.getNotes(c.id);
            return notes.filter(n => !n.isDeleted).length;
        }));

        let pillsHtml = `
            <button type="button" class="nexus-hub-pill ${this.activeCollectionId === 'all' ? 'active' : ''}" data-col-id="all" role="tab">
                <span>All Notes</span>
                <span class="nexus-pill-count">${allCount}</span>
            </button>
        `;

        collections.forEach((col, idx) => {
            const isActive = this.activeCollectionId === col.id ? 'active' : '';
            pillsHtml += `
                <button type="button" class="nexus-hub-pill ${isActive}" data-col-id="${col.id}" role="tab" title="Right click or hold for options">
                    <span>${escapeHtml(col.name)}</span>
                    <span class="nexus-pill-count">${colCounts[idx]}</span>
                </button>
            `;
        });

        this.collectionsPills.innerHTML = pillsHtml;

        this.collectionsPills.querySelectorAll('.nexus-hub-pill').forEach(pill => {
            const colId = pill.getAttribute('data-col-id');
            pill.addEventListener('click', () => {
                this.activeCollectionId = colId;
                localStorage.setItem('nexus_active_collection_id', colId);
                this.updateUrlParams();
                this.renderCollections();
                this.renderNotesList(this.notesSearchInput?.value?.trim()?.toLowerCase() || '');
            });

            pill.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                pill.classList.add('drag-over');
            });

            pill.addEventListener('dragleave', () => {
                pill.classList.remove('drag-over');
            });

            pill.addEventListener('drop', async (e) => {
                e.preventDefault();
                pill.classList.remove('drag-over');
                const noteId = e.dataTransfer.getData('text/plain');
                if (!noteId || !colId) return;
                const targetColId = colId === 'all' ? null : colId;
                await NotesManager.moveNote(noteId, targetColId);
                await this.renderCollections();
                await this.renderNotesList(this.notesSearchInput?.value?.trim()?.toLowerCase() || '');
            });

            if (colId !== 'all') {
                pill.addEventListener('contextmenu', async (e) => {
                    e.preventDefault();
                    await this.showCollectionContextMenu(e, colId);
                });
            }
        });
    }

    async showCollectionContextMenu(e, colId) {
        const collections = await NotesManager.getCollections();
        const col = collections.find(c => c.id === colId);
        if (!col || !e.target) return;
        const colName = col.name;

        NexusMenu.show({
            anchor: e.target,
            placement: 'bottom-start',
            items: [
                {
                    label: 'Rename collection',
                    icon: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path><path d="m15 5 4 4"></path></svg>`,
                    action: async () => {
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
                    }
                },
                {
                    label: 'Delete collection',
                    icon: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`,
                    action: async () => {
                        let confirmed = false;
                        const bodyMsg = `Are you sure you want to delete collection "${colName}"? Notes inside will be moved to General.`;
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
                            await this.renderNotesList(this.notesSearchInput?.value?.trim()?.toLowerCase() || '');
                        }
                    }
                }
            ]
        });
    }

    closeContextMenu() {
        NexusMenu.close();
    }

    async renderNotesList(searchTerm = '') {
        if (!this.cardsContainer) return;
        let notes = await NotesManager.getNotes(this.activeCollectionId);
        const collections = await NotesManager.getCollections();
        const colMap = new Map(collections.map(c => [c.id, c.name]));

        if (searchTerm) {
            notes = notes.filter(n => {
                const titleMatch = (n.title || '').toLowerCase().includes(searchTerm);
                const textContent = extractNoteText(n.content).toLowerCase();
                const contentMatch = textContent.includes(searchTerm);
                return titleMatch || contentMatch;
            });
        }

        if (this.sortMode === 'az') {
            notes.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
        } else if (this.sortMode === 'created') {
            notes.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        } else {
            notes.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        }

        if (notes.length === 0) {
            if (this.emptyState) {
                this.emptyState.style.display = 'flex';
                const emptyText = this.emptyState.querySelector('.nexus-empty-text');
                if (emptyText) {
                    emptyText.textContent = searchTerm ? `No notes matching "${searchTerm}"` : 'No notes yet in this collection';
                }
            }
            this.cardsContainer.innerHTML = '';
            if (this.emptyState) this.cardsContainer.appendChild(this.emptyState);
            return;
        }

        if (this.emptyState) {
            this.emptyState.style.display = 'none';
        }

        const pinned = notes.filter(n => n.pinned);
        const unpinned = notes.filter(n => !n.pinned);

        const renderCard = (note) => {
            const isSelected = this.selectedNoteIds.has(note.id);
            const isPinned = !!note.pinned;
            const colName = colMap.get(note.collectionId) || 'General';
            const plainText = extractNoteText(note.content);
            const rawSnippet = extractSearchSnippet(plainText, searchTerm, 140) || 'Empty note...';
            const snippetHtml = highlightSnippet(rawSnippet, searchTerm);
            const rawTitle = note.title || 'Untitled Note';
            const titleHtml = highlightSnippet(rawTitle, searchTerm);
            const timeStr = timeAgo(note.updatedAt || note.createdAt);

            return `
                <div class="nexus-hub-card ${isSelected ? 'is-selected' : ''}" data-note-id="${note.id}" draggable="true">
                    <div class="nexus-card-top">
                        <div class="nexus-card-top-left">
                            <input type="checkbox" class="nexus-card-checkbox" data-note-id="${note.id}" ${isSelected ? 'checked' : ''} style="${this.isBatchMode ? 'display:block;' : ''}">
                            <span class="nexus-card-badge" title="Collection: ${escapeHtml(colName)}">
                                <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                                </svg>
                                <span>${escapeHtml(colName)}</span>
                            </span>
                        </div>
                        <div class="nexus-card-top-right">
                            <button type="button" class="nexus-card-pin-btn ${isPinned ? 'pinned' : ''}" data-note-id="${note.id}" title="${isPinned ? 'Unpin' : 'Pin'}">
                                <svg viewBox="0 0 24 24" width="13" height="13" fill="${isPinned ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                                    <line x1="12" y1="17" x2="12" y2="22"></line>
                                    <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.89A2 2 0 0 1 15 10.77V6a3 3 0 0 0-6 0v4.77a2 2 0 0 1-1.11 1.79l-1.78.89A2 2 0 0 0 5 15.24V17z"></path>
                                </svg>
                            </button>
                            <button type="button" class="nexus-card-menu-btn" data-note-id="${note.id}" title="More options">
                                <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
                                    <circle cx="12" cy="5" r="2"></circle>
                                    <circle cx="12" cy="12" r="2"></circle>
                                    <circle cx="12" cy="19" r="2"></circle>
                                </svg>
                            </button>
                        </div>
                    </div>
                    <div class="nexus-card-body">
                        <h3 class="nexus-card-title">${titleHtml}</h3>
                        <p class="nexus-card-snippet">${snippetHtml}</p>
                    </div>
                    <div class="nexus-card-footer">
                        <span>${timeStr}</span>
                    </div>
                </div>
            `;
        };

        const containerClass = this.viewMode === 'list' ? 'nexus-hub-list' : 'nexus-hub-grid';
        let html = '';

        if (pinned.length > 0) {
            html += `
                <div class="nexus-section-block">
                    <div class="nexus-section-header">
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                        <span>Pinned</span>
                    </div>
                    <div class="${containerClass}">
                        ${pinned.map(renderCard).join('')}
                    </div>
                </div>
            `;
        }

        if (unpinned.length > 0) {
            if (pinned.length > 0) {
                html += `
                    <div class="nexus-section-block">
                        <div class="nexus-section-header">
                            <span>Other Notes</span>
                        </div>
                        <div class="${containerClass}">
                            ${unpinned.map(renderCard).join('')}
                        </div>
                    </div>
                `;
            } else {
                html += `
                    <div class="${containerClass}">
                        ${unpinned.map(renderCard).join('')}
                    </div>
                `;
            }
        }

        this.cardsContainer.innerHTML = html;
        this.bindCardInteractions(notes);
    }

    bindCardInteractions(notes) {
        this.cardsContainer.querySelectorAll('.nexus-hub-card').forEach(card => {
            const noteId = card.getAttribute('data-note-id');
            const note = notes.find(n => n.id === noteId);

            card.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', noteId);
                e.dataTransfer.effectAllowed = 'move';
                card.classList.add('is-dragging');
            });

            card.addEventListener('dragend', () => {
                card.classList.remove('is-dragging');
            });

            card.addEventListener('click', (e) => {
                if (e.target.closest('.nexus-card-top-right') || e.target.closest('.nexus-card-checkbox')) {
                    return;
                }
                if (this.isBatchMode) {
                    const chk = card.querySelector('.nexus-card-checkbox');
                    if (chk) {
                        chk.checked = !chk.checked;
                        this.handleToggleCardSelection(noteId, chk.checked, card);
                    }
                    return;
                }
                this.loadNote(noteId);
            });

            const checkbox = card.querySelector('.nexus-card-checkbox');
            if (checkbox) {
                checkbox.addEventListener('change', (e) => {
                    e.stopPropagation();
                    this.handleToggleCardSelection(noteId, checkbox.checked, card);
                });
            }

            const pinBtn = card.querySelector('.nexus-card-pin-btn');
            if (pinBtn) {
                pinBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const isPinned = note?.pinned;
                    await NotesManager.pinNote(noteId, !isPinned);
                    await this.renderNotesList(this.notesSearchInput?.value?.trim()?.toLowerCase() || '');
                });
            }

            const menuBtn = card.querySelector('.nexus-card-menu-btn');
            if (menuBtn) {
                menuBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    await this.showNoteContextMenu(e, note);
                });
            }

            card.addEventListener('contextmenu', async (e) => {
                e.preventDefault();
                await this.showNoteContextMenu(e, note);
            });
        });
    }

    handleToggleCardSelection(noteId, isChecked, cardEl) {
        if (isChecked) {
            this.selectedNoteIds.add(noteId);
            cardEl.classList.add('is-selected');
        } else {
            this.selectedNoteIds.delete(noteId);
            cardEl.classList.remove('is-selected');
        }
        this.updateBatchBar();
    }

    async showNoteContextMenu(e, note) {
        if (!note || !e.target) return;
        const collections = await NotesManager.getCollections();
        const isPinned = !!note.pinned;
        const pinLabel = isPinned ? 'Unpin note' : 'Pin note';

        const items = [
            {
                label: pinLabel,
                icon: `<svg viewBox="0 0 24 24" width="14" height="14" fill="${isPinned ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><line x1="12" y1="17" x2="12" y2="22"></line><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.89A2 2 0 0 1 15 10.77V6a3 3 0 0 0-6 0v4.77a2 2 0 0 1-1.11 1.79l-1.78.89A2 2 0 0 0 5 15.24V17z"></path></svg>`,
                action: async () => {
                    await NotesManager.pinNote(note.id, !isPinned);
                    await this.renderNotesList(this.notesSearchInput?.value?.trim()?.toLowerCase() || '');
                }
            },
            ...collections
                .filter(c => c.id !== note.collectionId)
                .map(c => ({
                    label: `Move to: ${c.name}`,
                    icon: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`,
                    action: async () => {
                        await NotesManager.moveNote(note.id, c.id);
                        await this.renderCollections();
                        await this.renderNotesList(this.notesSearchInput?.value?.trim()?.toLowerCase() || '');
                    }
                })),
            { divider: true },
            {
                label: 'Delete note',
                danger: true,
                icon: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14H6L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4h6v2"></path></svg>`,
                action: async () => {
                    await NotesManager.deleteNote(note.id);
                    await this.renderCollections();
                    await this.renderNotesList(this.notesSearchInput?.value?.trim()?.toLowerCase() || '');
                }
            }
        ];

        NexusMenu.show({
            anchor: e.target,
            placement: 'bottom-start',
            items
        });
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
            localStorage.setItem('nexus_active_collection_id', newCol.id);
            this.updateUrlParams();
            await this.renderCollections();
            await this.renderNotesList();
        }
    }

    async handleCreateNote() {
        const colId = (this.activeCollectionId === 'all' || this.activeCollectionId === 'col_default') ? null : this.activeCollectionId;
        const newNote = await NotesManager.createNote(colId, '');
        this.activeNoteId = newNote.id;
        await this.showDetailView(newNote.id);
        await this.loadNote(newNote.id);
        if (this.noteTitleInput) {
            this.noteTitleInput.value = '';
            this.noteTitleInput.focus();
        }
    }

    async loadNote(noteId) {
        this.activeNoteId = noteId;
        const note = await NotesManager.getNote(noteId);
        if (!note) {
            this.showHubView();
            return;
        }
        await this.showDetailView(noteId);
        if (this.noteTitleInput) {
            this.noteTitleInput.value = note.title || '';
        }
        document.title = `${note.title || 'Untitled Note'} - Notes`;
        await this.updateCollectionPickerPill(note);
        await this.updatePinDetailBtn(note);
        await this.initEditorInstance(note.content);
    }

    async updatePinDetailBtn(note) {
        if (!this.pinDetailBtn || !this.pinDetailLabel) return;
        const isPinned = !!note?.pinned;
        this.pinDetailLabel.textContent = isPinned ? 'Unpin Note' : 'Pin Note';
    }

    async initEditorInstance(initialData) {
        if (this.editorInstance && typeof this.editorInstance.unmount === 'function') {
            try {
                this.editorInstance.unmount();
            } catch (e) {
                console.warn('Error unmounting TipTap:', e);
            }
            this.editorInstance = null;
        }
        if (this.editorContainer) {
            this.editorContainer.innerHTML = '';
        }

        try {
            this.editorInstance = NexusTipTapEditor.mount(
                this.editorContainer,
                initialData,
                (updatedDoc) => {
                    this.triggerAutoSave(updatedDoc);
                }
            );
        } catch (err) {
            console.error('Failed to initialize TipTap editor:', err);
        }
    }

    triggerAutoSave(docFromEvent) {
        if (this.autoSaveTimer) {
            clearTimeout(this.autoSaveTimer);
        }
        this.autoSaveTimer = setTimeout(async () => {
            if (!this.activeNoteId || !this.editorInstance) return;
            try {
                const outputData = docFromEvent || this.editorInstance.getJSON();
                const title = this.noteTitleInput ? this.noteTitleInput.value.trim() : '';
                await NotesManager.saveNote(this.activeNoteId, {
                    title: title || 'Untitled Note',
                    content: outputData
                });
            } catch (e) {
                console.warn('Auto-save error:', e);
            }
        }, 350);
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
            const currentColId = currentNote ? currentNote.collectionId : null;

            let itemsHtml = `
                <button type="button" class="notes-col-picker-item ${!currentColId ? 'selected' : ''}" data-col-id="all">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                    </svg>
                    <span>General</span>
                    ${!currentColId ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" class="notes-col-picker-check"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}
                </button>
            `;

            collections.forEach(col => {
                const isSelected = col.id === currentColId ? 'selected' : '';
                itemsHtml += `
                    <button type="button" class="notes-col-picker-item ${isSelected}" data-col-id="${col.id}">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                        </svg>
                        <span>${escapeHtml(col.name)}</span>
                        ${col.id === currentColId ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" class="notes-col-picker-check"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}
                    </button>
                `;
            });

            this.colPickerDropdown.innerHTML = itemsHtml;
            this.colPickerDropdown.classList.add('active');

            this.colPickerDropdown.querySelectorAll('.notes-col-picker-item').forEach(item => {
                item.addEventListener('click', async (ev) => {
                    ev.stopPropagation();
                    const newColId = item.getAttribute('data-col-id');
                    this.closeCollectionPickerPill();
                    if (this.activeNoteId) {
                        const targetCol = newColId === 'all' ? null : newColId;
                        await NotesManager.moveNote(this.activeNoteId, targetCol);
                        const updatedNote = await NotesManager.getNote(this.activeNoteId);
                        if (updatedNote) await this.updateCollectionPickerPill(updatedNote);
                        await this.renderCollections();
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

    bindToolbarEvents() {
        if (this.tbH1) {
            this.tbH1.addEventListener('click', () => {
                this.editorInstance?.editor?.chain().focus().toggleHeading({ level: 1 }).run();
            });
        }
        if (this.tbH2) {
            this.tbH2.addEventListener('click', () => {
                this.editorInstance?.editor?.chain().focus().toggleHeading({ level: 2 }).run();
            });
        }
        if (this.tbH3) {
            this.tbH3.addEventListener('click', () => {
                this.editorInstance?.editor?.chain().focus().toggleHeading({ level: 3 }).run();
            });
        }
        if (this.tbChecklist) {
            this.tbChecklist.addEventListener('click', () => {
                this.editorInstance?.editor?.chain().focus().toggleTaskList().run();
            });
        }
        if (this.tbBullet) {
            this.tbBullet.addEventListener('click', () => {
                this.editorInstance?.editor?.chain().focus().toggleBulletList().run();
            });
        }
        if (this.tbNumber) {
            this.tbNumber.addEventListener('click', () => {
                this.editorInstance?.editor?.chain().focus().toggleOrderedList().run();
            });
        }
        if (this.tbUndo) {
            this.tbUndo.addEventListener('click', () => {
                this.editorInstance?.editor?.chain().focus().undo().run();
            });
        }
        if (this.tbRedo) {
            this.tbRedo.addEventListener('click', () => {
                this.editorInstance?.editor?.chain().focus().redo().run();
            });
        }

        if (this.tbMore) {
            this.tbMore.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (!this.activeNoteId) return;
                const note = await NotesManager.getNote(this.activeNoteId);
                if (!note) return;
                const isPinned = !!note.pinned;

                NexusMenu.show({
                    anchor: this.tbMore,
                    placement: 'bottom-end',
                    items: [
                        {
                            label: isPinned ? 'Unpin Note' : 'Pin Note',
                            icon: `<svg viewBox="0 0 24 24" width="14" height="14" fill="${isPinned ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"></line><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.89A2 2 0 0 1 15 10.77V6a3 3 0 0 0-6 0v4.77a2 2 0 0 1-1.11 1.79l-1.78.89A2 2 0 0 0 5 15.24V17z"></path></svg>`,
                            action: async () => {
                                const newPinned = !isPinned;
                                await NotesManager.pinNote(this.activeNoteId, newPinned);
                                note.pinned = newPinned;
                                await this.updatePinDetailBtn(note);
                            }
                        },
                        {
                            label: 'Export Markdown',
                            icon: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
                            action: () => {
                                const mdText = `# ${note.title || 'Untitled'}\n\n${extractNoteText(note.content)}`;
                                const blob = new Blob([mdText], { type: 'text/markdown' });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `${(note.title || 'Untitled').replace(/[^a-z0-9_-]/gi, '_')}.md`;
                                document.body.appendChild(a);
                                a.click();
                                document.body.removeChild(a);
                                URL.revokeObjectURL(url);
                            }
                        },
                        { divider: true },
                        {
                            label: 'Delete Note',
                            danger: true,
                            icon: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
                            action: async () => {
                                let confirmed = false;
                                const msg = 'Are you sure you want to delete this note?';
                                if (typeof window.showCustomPopup === 'function') {
                                    confirmed = await window.showCustomPopup({
                                        title: 'Delete Note',
                                        body: msg,
                                        confirmLabel: 'Delete',
                                        isDanger: true
                                    });
                                } else {
                                    confirmed = confirm(msg);
                                }
                                if (confirmed) {
                                    await NotesManager.deleteNote(this.activeNoteId);
                                    this.showHubView();
                                }
                            }
                        }
                    ]
                });
            });
        }
    }
}

if (typeof window !== 'undefined') {
    window.NotesPanel = NotesPanel;
}
