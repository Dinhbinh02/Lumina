export const NexusViewManager = {
    currentView: 'chat',

    views: {
        chat: {
            el: '#chat-layout',
            hasTopbar: true,
            displayType: '',
            onOpen: () => {
                document.getElementById('sidebar-notes-btn')?.classList.remove('active');
                document.getElementById('sidebar-tts-btn')?.classList.remove('active');
                const topBar = document.getElementById('nexus-topbar');
                if (topBar) {
                    topBar.style.removeProperty('display');
                }
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

                if (!window.nexusNotesPanelInstance && typeof NotesPanel !== 'undefined') {
                    window.nexusNotesPanelInstance = new NotesPanel();
                }
                if (window.nexusNotesPanelInstance) {
                    window.nexusNotesPanelInstance.init(params?.noteId, params?.colId);
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

                if (!window.nexusTTSPanelInstance && typeof TTSPanel !== 'undefined') {
                    window.nexusTTSPanelInstance = new TTSPanel();
                }
                if (window.nexusTTSPanelInstance && typeof window.nexusTTSPanelInstance.init === 'function') {
                    window.nexusTTSPanelInstance.init(params?.recordingId);
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

        const mainContent = document.querySelector('.nexus-main-content');
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
            document.title = 'Nexus';
        }

        if (targetView !== 'chat') {
            document.querySelectorAll('.recent-chat-item.active').forEach(el => el.classList.remove('active'));
            document.querySelectorAll('.sidebar-spark-item.active').forEach(el => el.classList.remove('active'));
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
            urlParams.delete('recordingId');
            if (params.sparkId) {
                urlParams.set('sparkId', params.sparkId);
            } else if (!params.preserveSparkId) {
                urlParams.delete('sparkId');
            }
            const primaryTab = (typeof window.tabs !== 'undefined' && typeof window.activeTabIndex !== 'undefined') ? window.tabs[window.activeTabIndex] : null;
            const sidVal = params.sid || (primaryTab && primaryTab.sessionId ? primaryTab.sessionId : '');
            if (sidVal) {
                urlParams.set('sid', sidVal);
            } else {
                urlParams.delete('sid');
            }
        }
        const newUrl = window.location.pathname + (urlParams.toString() ? '?' + urlParams.toString() : '');
        if (params.replaceState) {
            window.history.replaceState({ view: viewName, ...params }, '', newUrl);
        } else {
            window.history.pushState({ view: viewName, ...params }, '', newUrl);
        }
    }
};

export function updateNotesUrl(noteId, colId) {
    NexusViewManager.updateUrl('notes', { noteId, colId });
}

export function notesOpenPage(noteIdToLoad, colIdToLoad) {
    NexusViewManager.switchView('notes', { noteId: noteIdToLoad, colId: colIdToLoad });
}

export function notesClosePage() {
    NexusViewManager.switchView('chat');
}

export function sparksOpenPage(sparkId) {
    NexusViewManager.switchView('sparks', { sparkId });
}

export function sparksClosePage() {
    NexusViewManager.switchView('chat');
}

export function ttsOpenPage() {
    NexusViewManager.switchView('tts');
}

export function ttsClosePage() {
    NexusViewManager.switchView('chat');
}

if (typeof window !== 'undefined') {
    window.NexusViewManager = NexusViewManager;
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
            NexusViewManager.switchView('notes', { noteId: urlParams.get('noteId'), colId: urlParams.get('colId') });
        } else if (view === 'sparks') {
            NexusViewManager.switchView('sparks', { sparkId: urlParams.get('sparkId') });
        } else if (view === 'tts') {
            NexusViewManager.switchView('tts', { recordingId: urlParams.get('recordingId') });
        }
    });
}
