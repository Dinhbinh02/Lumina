(function() {
    const isSidePanel = new URLSearchParams(window.location.search).get('sidepanel') === '1';
    if (isSidePanel) {
        document.documentElement.classList.add('is-sidepanel');
    }

    if (localStorage.getItem('lumina_sidebar_collapsed') === 'true' && !isSidePanel && window.innerWidth > 768) {
        const style = document.createElement('style');
        style.id = 'sidebar-init-style';
        style.innerHTML = `
            .lumina-sidebar {
                width: 48px !important;
                transition: none !important;
            }
            .lumina-sidebar *, .lumina-sidebar *::before, .lumina-sidebar *::after {
                transition: none !important;
            }
            .brand-name, .action-text, .nav-text, .sidebar-section-title, .user-name, .sidebar-spark-item__title, .sidebar-spark-item__menu-btn, .recent-chats-list, .sidebar-header-actions {
                opacity: 0 !important;
                max-width: 0 !important;
                max-height: 0 !important;
                pointer-events: none !important;
            }
            .sidebar-nav-item {
                padding-left: 10px !important;
                padding-right: 10px !important;
                justify-content: flex-start !important;
                width: 100% !important;
                height: 30px !important;
                border-radius: 8px !important;
                margin: 0 !important;
                gap: 0 !important;
            }
            .sidebar-spark-item {
                padding-left: 6px !important;
                padding-right: 6px !important;
                justify-content: flex-start !important;
                width: 100% !important;
                height: 30px !important;
                border-radius: 8px !important;
                margin: 0 !important;
                gap: 0 !important;
            }
            .sidebar-footer {
                flex-direction: column !important;
                align-items: center !important;
                gap: 8px !important;
                padding-bottom: 8px !important;
                height: 80px !important;
            }
            #sidebar-new-spark-btn, .sidebar-sparks-section .sidebar-section-title {
                display: none !important;
            }
            .sidebar-header {
                justify-content: flex-start !important;
                padding: 0 6px !important;
            }
            .sidebar-brand {
                display: flex !important;
                justify-content: flex-start !important;
                width: 100% !important;
                gap: 0 !important;
            }
            .user-profile {
                justify-content: center !important;
                gap: 0 !important;
            }
        `;
        document.documentElement.appendChild(style);
    }
    const urlParams = new URLSearchParams(window.location.search);
    const viewParam = urlParams.get('view');
    if (viewParam === 'notes' || viewParam === 'sparks') {
        const viewStyle = document.createElement('style');
        viewStyle.id = 'view-init-style';
        if (viewParam === 'notes') {
            const savedNotesWidth = localStorage.getItem('lumina_notes_sidebar_width');
            const notesWidth = savedNotesWidth ? parseInt(savedNotesWidth, 10) : 260;
            viewStyle.innerHTML = `
                #chat-layout, #lumina-topbar, #sparks-page { display: none !important; }
                #notes-page { display: flex !important; }
                .notes-sidebar-pane {
                    width: ${notesWidth}px !important;
                    flex: 0 0 ${notesWidth}px !important;
                }
            `;
        } else if (viewParam === 'sparks') {
            viewStyle.innerHTML = `
                #chat-layout, #lumina-topbar, #notes-page { display: none !important; }
                #sparks-page { display: flex !important; }
            `;
        }
        document.documentElement.appendChild(viewStyle);
    }
})();
