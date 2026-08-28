export const LuminaViewManager = {
    currentView: 'chat',

    views: {
        chat: {
            el: '#chat-layout',
            hasTopbar: true,
            displayType: '',
            onOpen: () => {
                document.getElementById('sidebar-notes-btn')?.classList.remove('active');
                document.getElementById('sidebar-tts-btn')?.classList.remove('active');
            }
        },
        notes: {
            el: '#notes-page',
            hasTopbar: false,
            displayType: 'flex',
            onOpen: (params) => {
                document.getElementById('sidebar-notes-btn')?.classList.add('active');
                document.getElementById('sidebar-tts-btn')?.classList.remove('active');
                document.getElementById('sidebar-new-chat-btn')?.classList.remove('active');
                document.querySelectorAll('.recent-chat-item.active').forEach(el => el.classList.remove('active'));

                if (!window.luminaNotesPanelInstance && typeof NotesPanel !== 'undefined') {
                    window.luminaNotesPanelInstance = new NotesPanel();
                }
                if (window.luminaNotesPanelInstance) {
                    window.luminaNotesPanelInstance.init(params?.noteId, params?.colId);
                }
            }
        },
        tts: {
            el: '#tts-page',
            hasTopbar: false,
            displayType: 'flex',
            onOpen: (params) => {
                document.getElementById('sidebar-tts-btn')?.classList.add('active');
                document.getElementById('sidebar-notes-btn')?.classList.remove('active');
                document.getElementById('sidebar-new-chat-btn')?.classList.remove('active');
                document.querySelectorAll('.recent-chat-item.active').forEach(el => el.classList.remove('active'));

                if (!window.luminaTTSPanelInstance && typeof TTSPanel !== 'undefined') {
                    window.luminaTTSPanelInstance = new TTSPanel();
                }
                if (window.luminaTTSPanelInstance && typeof window.luminaTTSPanelInstance.init === 'function') {
                    window.luminaTTSPanelInstance.init(params?.recordingId);
                }
            }
        },
        sparks: {
            el: '#sparks-page',
            hasTopbar: false,
            displayType: 'flex',
            onOpen: (params) => {
                document.getElementById('sidebar-notes-btn')?.classList.remove('active');
                document.getElementById('sidebar-tts-btn')?.classList.remove('active');
                document.getElementById('sidebar-new-chat-btn')?.classList.remove('active');
                document.querySelectorAll('.recent-chat-item.active').forEach(el => el.classList.remove('active'));

                if (params && params.sparkId && typeof window.sparksLoadSpark === 'function') {
                    window.sparksLoadSpark(params.sparkId);
                }
            }
        }
    },

    switchView(targetView, params = {}) {
        if (!this.views[targetView]) return;
        this.currentView = targetView;

        const initStyle = document.getElementById('view-init-style');
        if (initStyle) initStyle.remove();

        const mainContent = document.querySelector('.lumina-main-content');
        if (mainContent) {
            mainContent.setAttribute('data-active-view', targetView);
        }

        if (targetView === 'tts') {
            document.title = 'TTS Studio';
        } else if (targetView === 'notes') {
            document.title = 'Notes';
        } else if (targetView === 'sparks') {
            document.title = 'Sparks';
        } else {
            document.title = 'Lumina';
        }

        this.updateUrl(targetView, params);

        if (this.views[targetView].onOpen) {
            this.views[targetView].onOpen(params);
        }
    },

    updateUrl(viewName, params = {}) {
        const urlParams = new URLSearchParams(window.location.search);
        if (viewName === 'notes') {
            urlParams.delete('sid');
            urlParams.delete('sparkId');
            urlParams.delete('recordingId');
            urlParams.set('view', 'notes');
            if (params.noteId) {
                urlParams.set('noteId', params.noteId);
            } else {
                urlParams.delete('noteId');
            }
            if (params.colId && params.colId !== 'all') {
                urlParams.set('colId', params.colId);
            } else {
                urlParams.delete('colId');
            }
        } else if (viewName === 'sparks') {
            urlParams.delete('sid');
            urlParams.delete('noteId');
            urlParams.delete('colId');
            urlParams.delete('recordingId');
            urlParams.set('view', 'sparks');
            if (params.sparkId) {
                urlParams.set('sparkId', params.sparkId);
            } else {
                urlParams.delete('sparkId');
            }
        } else if (viewName === 'tts') {
            urlParams.delete('sid');
            urlParams.delete('noteId');
            urlParams.delete('colId');
            urlParams.delete('sparkId');
            urlParams.set('view', 'tts');
            if (params.recordingId) {
                urlParams.set('recordingId', params.recordingId);
            } else {
                urlParams.delete('recordingId');
            }
        } else {
            urlParams.delete('view');
            urlParams.delete('noteId');
            urlParams.delete('colId');
            urlParams.delete('sparkId');
            urlParams.delete('recordingId');
            const primaryTab = (typeof window.tabs !== 'undefined' && typeof window.activeTabIndex !== 'undefined') ? window.tabs[window.activeTabIndex] : null;
            const sidVal = params.sid || (primaryTab && primaryTab.sessionId ? primaryTab.sessionId : '');
            if (sidVal) {
                urlParams.set('sid', sidVal);
            } else {
                urlParams.delete('sid');
            }
        }
        const newUrl = window.location.pathname + (urlParams.toString() ? '?' + urlParams.toString() : '');
        window.history.pushState({ view: viewName, ...params }, '', newUrl);
    }
};

export function updateNotesUrl(noteId, colId) {
    LuminaViewManager.updateUrl('notes', { noteId, colId });
}

export function notesOpenPage(noteIdToLoad, colIdToLoad) {
    LuminaViewManager.switchView('notes', { noteId: noteIdToLoad, colId: colIdToLoad });
}

export function notesClosePage() {
    LuminaViewManager.switchView('chat');
}

export function sparksOpenPage(sparkId) {
    LuminaViewManager.switchView('sparks', { sparkId });
}

export function sparksClosePage() {
    LuminaViewManager.switchView('chat');
}

export function ttsOpenPage() {
    LuminaViewManager.switchView('tts');
}

export function ttsClosePage() {
    LuminaViewManager.switchView('chat');
}

if (typeof window !== 'undefined') {
    window.LuminaViewManager = LuminaViewManager;
    window.updateNotesUrl = updateNotesUrl;
    window.notesOpenPage = notesOpenPage;
    window.notesClosePage = notesClosePage;
    window.sparksOpenPage = sparksOpenPage;
    window.sparksClosePage = sparksClosePage;
    window.ttsOpenPage = ttsOpenPage;
    window.ttsClosePage = ttsClosePage;

    document.addEventListener('DOMContentLoaded', () => {
        const urlParams = new URLSearchParams(window.location.search);
        const view = urlParams.get('view');
        if (view === 'notes') {
            LuminaViewManager.switchView('notes', { noteId: urlParams.get('noteId'), colId: urlParams.get('colId') });
        } else if (view === 'sparks') {
            LuminaViewManager.switchView('sparks', { sparkId: urlParams.get('sparkId') });
        } else if (view === 'tts') {
            LuminaViewManager.switchView('tts', { recordingId: urlParams.get('recordingId') });
        }
    });
}
