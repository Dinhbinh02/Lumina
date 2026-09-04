(function EarlyInit() {
    'use strict';

    const urlParams = new URLSearchParams(window.location.search);
    const isSidePanel = urlParams.get('sidepanel') === '1';

    function injectStyle(id, cssRules) {
        const style = document.createElement('style');
        style.id = id;
        style.textContent = cssRules;
        (document.head || document.documentElement).appendChild(style);
    }

    if (isSidePanel) {
        document.documentElement.classList.add('is-sidepanel');
    }

    if (localStorage.getItem('nexus_sidebar_collapsed') === 'true' && !isSidePanel && window.innerWidth > 768) {
        injectStyle('sidebar-init-style', `
            .nexus-sidebar { width: 48px !important; transition: none !important; }
            .nexus-sidebar *, .nexus-sidebar *::before, .nexus-sidebar *::after { transition: none !important; }
            .brand-name, .action-text, .nav-text, .sidebar-section-title, .user-name, 
            .sidebar-spark-item__title, .sidebar-spark-item__menu-btn, .recent-chats-list, .sidebar-header-actions {
                opacity: 0 !important; max-width: 0 !important; max-height: 0 !important; pointer-events: none !important;
            }
            .sidebar-nav-item, .sidebar-spark-item {
                padding-left: 6px !important; padding-right: 6px !important;
                justify-content: flex-start !important; width: 100% !important; height: 30px !important;
                border-radius: 8px !important; margin: 0 !important; gap: 0 !important;
            }
            .sidebar-nav-item { padding-left: 10px !important; padding-right: 10px !important; }
            .sidebar-footer { flex-direction: column !important; align-items: center !important; gap: 8px !important; padding-bottom: 8px !important; height: 80px !important; }
            #sidebar-new-spark-btn, .sidebar-sparks-section .sidebar-section-title { display: none !important; }
            .sidebar-header { justify-content: flex-start !important; padding: 0 6px !important; }
            .sidebar-brand { display: flex !important; justify-content: flex-start !important; width: 100% !important; gap: 0 !important; }
            .user-profile { justify-content: center !important; gap: 0 !important; }
        `);
    }

    try {
        const cachedUserRaw = localStorage.getItem('nexus_cached_user');
        if (cachedUserRaw) {
            const user = JSON.parse(cachedUserRaw);
            if (user && (user.name || user.picture)) {
                injectStyle('auth-prerender-style', `
                    #sidebar-login-btn { display: none !important; }
                    .user-profile { display: flex !important; visibility: visible !important; }
                `);

                document.addEventListener('DOMContentLoaded', () => {
                    const avatarEl = document.querySelector('.user-profile .user-avatar');
                    const nameEl = document.querySelector('.user-profile .user-name');
                    if (nameEl && user.name) nameEl.textContent = user.name;
                    if (avatarEl) {
                        if (user.picture) {
                            avatarEl.innerHTML = `<img src="${user.picture}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;" />`;
                        } else if (user.name) {
                            const initials = user.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
                            avatarEl.textContent = initials;
                        }
                    }
                });
            }
        }
    } catch (e) {}

    const viewParam = urlParams.get('view') || 'chat';
    const appId = urlParams.get('app');
    const noteId = urlParams.get('noteId');

    const pageIdMap = {
        apps: 'apps-page',
        notes: 'notes-page',
        sparks: 'sparks-page',
        tts: 'tts-page',
        chat: 'chat-page'
    };
    const activePageId = pageIdMap[viewParam] || 'chat-page';

    const titleMap = {
        apps: 'Apps',
        notes: 'Notes',
        sparks: 'Sparks',
        tts: 'TTS Studio',
        chat: 'Nexus'
    };
    document.title = titleMap[viewParam] || 'Nexus';

    injectStyle('view-init-style', `
        .nexus-page-view { display: none !important; }
        #${activePageId} { display: flex !important; }
        ${viewParam === 'apps' && appId ? `
        #apps-hub-view { display: none !important; }
        #apps-studio-view { display: flex !important; }
        ` : ''}
        ${viewParam === 'notes' && noteId ? `
        #notes-hub-view { display: none !important; }
        #notes-detail-view { display: flex !important; }
        ` : ''}
    `);

    document.addEventListener('DOMContentLoaded', () => {
        const mainContent = document.querySelector('.nexus-main-content');
        if (mainContent) {
            mainContent.setAttribute('data-active-view', viewParam);
        }
    });
})();
