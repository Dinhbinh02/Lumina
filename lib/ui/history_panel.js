
class LuminaHistory {
    constructor() {
        this.isOpen = false;
        this.historyData = [];
        this.displayedCount = 0;
        this.PAGE_SIZE = 20;
        this.sidebar = document.getElementById('lumina-history-sidebar');
        this.overlay = document.getElementById('lumina-history-overlay');
        this.toggleBtn = document.getElementById('lumina-history-toggle-btn');
        this.closeBtn = document.getElementById('lumina-history-close-btn');
        this.settingsBtn = document.getElementById('lumina-history-settings-btn');
        this.searchInput = document.getElementById('lumina-history-search-input');
        this.searchLoader = document.getElementById('lumina-history-loader');
        this.listContainer = document.getElementById('lumina-history-list-container');
        this.storageText = document.getElementById('storage-usage-text');
        this.deleteAllBtn = document.getElementById('lumina-history-delete-all-btn');
        this.topbarToggleBtn = document.getElementById('topbar-history-btn');
        this.contextMenu = document.getElementById('lumina-history-context-menu');
        this.menuRename = document.getElementById('menu-rename');
        this.menuDuplicate = document.getElementById('menu-duplicate');
        this.menuDelete = document.getElementById('menu-delete');
        this.activeContextSessionId = null;
        this.handleScroll = this.handleScroll.bind(this);
        this.handleClickOutside = this.handleClickOutside.bind(this);
        this.handleSearch = this.handleSearch.bind(this);
        this.hideTooltip = this.hideTooltip.bind(this);
        this.init();
    }
    init() {
        if (!this.sidebar) return;
        if (this.toggleBtn) {
            this.toggleBtn.addEventListener('click', () => this.togglePanel());
        }
        if (this.topbarToggleBtn) {
            this.topbarToggleBtn.addEventListener('click', () => this.togglePanel());
        }
        this.closeBtn.addEventListener('click', () => this.closePanel());
        if (this.settingsBtn) {
            this.settingsBtn.addEventListener('click', () => {
                chrome.runtime.openOptionsPage();
                this.closePanel();
            });
        }
        this.searchInput.addEventListener('input', () => {
            if (this.searchLoader) this.searchLoader.style.display = 'block';
            if (this.searchTimeout) clearTimeout(this.searchTimeout);
            this.searchTimeout = setTimeout(() => {
                this.handleSearch();
                if (this.searchLoader) this.searchLoader.style.display = 'none';
            }, 400);
        });
        this.listContainer.addEventListener('scroll', this.handleScroll);
        if (this.deleteAllBtn) {
            this.deleteAllBtn.addEventListener('click', () => this.handleDeleteAll());
        }
        if (this.overlay) {
            this.overlay.addEventListener('click', () => this.closePanel());
        }
        this.menuRename.addEventListener('click', () => {
            if (this.activeContextSessionId) this.renameItem(this.activeContextSessionId);
            this.hideContextMenu();
        });
        this.menuDuplicate.addEventListener('click', () => {
            if (this.activeContextSessionId) this.duplicateItem(this.activeContextSessionId);
            this.hideContextMenu();
        });
        this.menuDelete.addEventListener('click', () => {
            if (this.activeContextSessionId) this.deleteItem(this.activeContextSessionId);
            this.hideContextMenu();
        });
        document.addEventListener('mousedown', (e) => {
            if (this.contextMenu.style.display === 'block' && !this.contextMenu.contains(e.target)) {
                this.hideContextMenu();
            }
        });
        this.syncProfileContainer = document.getElementById('sidebar-footer') || document.getElementById('lumina-history-sync-profile');
        if (this.syncProfileContainer && typeof LuminaAuth !== 'undefined' && typeof LuminaSync !== 'undefined') {
            const renderSyncUI = (isAuthenticated, user) => {
                if (!isAuthenticated) {
                    this.syncProfileContainer.innerHTML = `
                        <button class="sync-btn sync-btn--login" id="sidebar-login-btn" style="width: 100%;">
                            <svg class="google-icon" viewBox="0 0 24 24" style="width: 16px; height: 16px; margin-right: 8px;"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/></svg>
                            Sign in with Google
                        </button>
                    `;
                    const loginBtn = document.getElementById('sidebar-login-btn');
                    if (loginBtn) {
                        loginBtn.onclick = async () => {
                            try {
                                loginBtn.disabled = true;
                                loginBtn.textContent = 'Signing in...';
                                await LuminaAuth.login();
                            } catch (e) {
                                console.error('Sign in failed:', e);
                                alert('Sign in failed: ' + e.message);
                                renderSyncUI(false, null);
                            }
                        };
                    }
                } else {
                    const avatarUrl = user?.picture || '../../assets/default-avatar.png';
                    const userName = user?.name || 'User Profile';
                    this.syncProfileContainer.innerHTML = `
                        <div class="sync-profile">
                            <img class="sync-profile__avatar" src="${avatarUrl}" alt="Avatar" referrerpolicy="no-referrer">
                            <div class="sync-profile__info">
                                <span class="sync-profile__name">${userName}</span>
                                <span class="sync-profile__status" id="sidebar-sync-status">Checking sync...</span>
                            </div>
                            <button id="sidebar-sync-now-btn" class="sync-icon-btn" title="Sync Now">
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l6.07-5.19"/></svg>
                            </button>
                            <button id="sidebar-logout-btn" class="sync-icon-btn sync-icon-btn--logout" title="Sign Out">
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>
                            </button>
                        </div>
                    `;
                    const syncBtn = document.getElementById('sidebar-sync-now-btn');
                    const logoutBtn = document.getElementById('sidebar-logout-btn');
                    const statusText = document.getElementById('sidebar-sync-status');
                    const updateSyncStatus = (status, lastSync) => {
                        if (statusText) {
                            if (lastSync) {
                                const timeStr = new Date(lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                statusText.textContent = `Synced at ${timeStr}`;
                            } else {
                                statusText.textContent = status;
                            }
                        }
                    };
                    LuminaSync.getLastSyncTime().then(time => {
                        if (time && time !== 'Never') {
                            statusText.textContent = `Synced`;
                        } else {
                            statusText.textContent = 'Not synced';
                        }
                    });
                    if (syncBtn) {
                        syncBtn.onclick = async () => {
                            syncBtn.style.transform = 'rotate(360deg)';
                            syncBtn.style.transition = 'transform 0.5s ease';
                            try {
                                syncBtn.disabled = true;
                                if (statusText) statusText.textContent = 'Syncing...';
                                await LuminaSync.syncUp();
                            } catch (e) {
                                console.error('Sync failed:', e);
                            } finally {
                                syncBtn.disabled = false;
                                syncBtn.style.transform = 'none';
                                syncBtn.style.transition = 'none';
                            }
                        };
                    }
                    if (logoutBtn) {
                        logoutBtn.onclick = async () => {
                            if (confirm('Are you sure you want to sign out?')) {
                                await LuminaAuth.logout();
                            }
                        };
                    }
                    LuminaSync.addListener(updateSyncStatus);
                }
            };
            LuminaAuth.addListener(renderSyncUI);
            renderSyncUI(LuminaAuth.isAuthenticated, LuminaAuth.user);
        }
    }
    async togglePanel() {
        this.isOpen = !this.isOpen;
        if (this.isOpen) {
            this.sidebar.classList.add('open');
            if (this.overlay) this.overlay.classList.add('active');
            document.addEventListener('mousedown', this.handleClickOutside);
            await this.refreshData();
            this.updateStorageUsage();
            this.searchInput.focus();
        } else {
            this.closePanel();
        }
    }
    closePanel() {
        this.isOpen = false;
        this.sidebar.classList.remove('open');
        if (this.overlay) this.overlay.classList.remove('active');
        document.removeEventListener('mousedown', this.handleClickOutside);
        this.hideContextMenu();
    }
    handleClickOutside(e) {
        if (window.innerWidth > 600 && document.body.classList.contains('is-sidepanel')) {
            return;
        }
        const clickedToggle = (this.toggleBtn && this.toggleBtn.contains(e.target)) || (this.topbarToggleBtn && this.topbarToggleBtn.contains(e.target));
        if (!this.sidebar.contains(e.target) && !clickedToggle && !this.contextMenu.contains(e.target)) {
            this.closePanel();
        }
    }
    async updateStorageUsage() {
        const bytes = await ChatHistoryManager.getStorageUsage();
        const mb = (bytes / (1024 * 1024)).toFixed(1);
        if (this.storageText) this.storageText.textContent = `${mb} MB`;
    }
    async refreshData() {
        const result = await chrome.storage.local.get([ChatHistoryManager.STORAGE_KEY]);
        const sessions = result[ChatHistoryManager.STORAGE_KEY] || {};
        this.historyData = Object.values(sessions).sort((a, b) => b.updatedAt - a.updatedAt);
        this.handleSearch();
    }
    handleSearch() {
        const query = this.searchInput.value.trim();
        this.listContainer.innerHTML = '';
        this.displayedCount = 0;
        this.filteredData = [];
        if (!query) {
            this.filteredData = this.historyData.map(session => {
                if (session.questions && session.questions.length > 0) {
                    const latestQ = session.questions[session.questions.length - 1];
                    return {
                        isEntry: true,
                        id: session.id,
                        messageIndex: latestQ.index,
                        title: (session.isRenamed || session.autoNamed) ? session.title : (latestQ.text || "Untitled Chat"),
                        snippet: latestQ.snippet || "View full answer",
                        isRenamed: session.isRenamed,
                        updatedAt: latestQ.timestamp || session.updatedAt
                    };
                }
                return {
                    ...session,
                    isEntry: false,
                };
            });
        } else {
            const escapedQuery = this.escapeRegExp(query);
            const searchPattern = new RegExp(`(^|[^\\p{L}\\p{N}_])(${escapedQuery})([^\\p{L}\\p{N}_]|$)`, 'iu');
            this.historyData.forEach(session => {
                if (session.questions && session.questions.length > 0) {
                    session.questions.forEach(q => {
                        if (searchPattern.test(q.text)) {
                            this.filteredData.push({
                                isEntry: true,
                                id: session.id,
                                messageIndex: q.index,
                                title: q.text,
                                snippet: q.snippet || "View full answer",
                                isRenamed: session.isRenamed,
                                updatedAt: q.timestamp || session.updatedAt
                            });
                        }
                    });
                } else if (session.searchIndex && searchPattern.test(session.searchIndex)) {
                    this.filteredData.push({
                        ...session,
                        isEntry: false
                    });
                }
            });
        }
        if (this.filteredData.length === 0) {
            this.listContainer.innerHTML = `<div class="lumina-history-empty-state">No chat history found.</div>`;
            return;
        }
        this.renderNextBatch();
    }
    escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    renderNextBatch() {
        const fragment = document.createDocumentFragment();
        const start = this.displayedCount;
        const end = Math.min(start + this.PAGE_SIZE, this.filteredData.length);
        for (let i = start; i < end; i++) {
            const item = this.filteredData[i];
            const el = this.createHistoryElement(item);
            fragment.appendChild(el);
        }
        this.listContainer.appendChild(fragment);
        this.displayedCount = end;
    }
    handleScroll() {
        if (this.displayedCount >= this.filteredData.length) return;
        const container = this.listContainer;
        if (container.scrollTop + container.clientHeight >= container.scrollHeight - 50) {
            this.renderNextBatch();
        }
    }
    formatDate(timestamp) {
        const d = new Date(timestamp);
        const today = new Date();
        const isToday = d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
        if (isToday) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
    ensureTooltip() {
        if (this.tooltip) return;
        this.tooltip = document.createElement('div');
        this.tooltip.className = 'lumina-tooltip';
        document.body.appendChild(this.tooltip);
    }
    showTooltip(text, target) {
        this.ensureTooltip();
        this.tooltip.textContent = text;
        this.tooltip.classList.add('active');
        const rect = target.getBoundingClientRect();
        const tooltipRect = this.tooltip.getBoundingClientRect();
        let top = rect.top - tooltipRect.height - 8;
        let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
        if (top < 10) top = rect.bottom + 8;
        if (left < 10) left = 10;
        if (left + tooltipRect.width > window.innerWidth - 10) {
            left = window.innerWidth - tooltipRect.width - 10;
        }
        this.tooltip.style.top = `${top}px`;
        this.tooltip.style.left = `${left}px`;
    }
    hideTooltip() {
        if (this.tooltip) {
            this.tooltip.classList.remove('active');
        }
    }
    highlightAndCrop(text, query) {
        if (!query) return text;
        const escapedQuery = this.escapeRegExp(query);
        const searchPattern = new RegExp(`(^|[^\\p{L}\\p{N}_])(${escapedQuery})([^\\p{L}\\p{N}_]|$)`, 'iu');
        const match = text.match(searchPattern);
        if (!match) return text;
        const matchText = match[2];
        const matchIndex = text.indexOf(matchText);
        let start = 0;
        let prefix = '';
        if (matchIndex > 25) {
            start = matchIndex - 15;
            prefix = '...';
        }
        let displayText = text.substring(start);
        const div = document.createElement('div');
        div.textContent = prefix + displayText;
        let safeHTML = div.innerHTML;
        const highlightRegex = new RegExp(`(${this.escapeRegExp(matchText)})`, 'gi');
        return safeHTML.replace(highlightRegex, '<span class="lumina-history-highlight">$1</span>');
    }
    createHistoryElement(item) {
        const query = this.searchInput.value.trim();
        const div = document.createElement('div');
        div.className = 'lumina-history-item';
        div.dataset.id = item.id;
        if (item.isEntry) div.dataset.messageIndex = item.messageIndex;
        const titleClasses = (item.isRenamed && !query) ? 'lumina-history-item-title renamed' : 'lumina-history-item-title';
        const displayTitle = item.isEntry && query ? this.highlightAndCrop(item.title, query) : item.title;
        let cleanSnippet = (item.snippet || 'No messages yet').replace(/\n/g, ' ').trim();
        if (cleanSnippet.length > 100) {
            cleanSnippet = cleanSnippet.substring(0, 97) + '...';
        }
        div.innerHTML = `
            <div class="${titleClasses}">${displayTitle}</div>
            <div class="lumina-history-item-snippet">${cleanSnippet}</div>
            <div class="lumina-history-item-meta">
                <span>${this.formatDate(item.updatedAt)}</span>
            </div>
        `;
        const titleEl = div.querySelector('.lumina-history-item-title');
        titleEl.addEventListener('mouseenter', (e) => this.showTooltip(item.title, e.target));
        titleEl.addEventListener('mouseleave', this.hideTooltip);
        div.addEventListener('click', () => {
            this.openSession(item.id, item.messageIndex);
        });
        div.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.showContextMenu(e, item.id, div);
        });
        return div;
    }
    showContextMenu(e, sessionId, element) {
        const allItems = this.listContainer.querySelectorAll('.lumina-history-item');
        allItems.forEach(el => el.classList.remove('context-menu-active'));
        element.classList.add('context-menu-active');
        this.activeContextSessionId = sessionId;
        this.contextMenu.style.display = 'block';
        let x = e.clientX;
        let y = e.clientY;
        if (x + this.contextMenu.offsetWidth > window.innerWidth) {
            x = window.innerWidth - this.contextMenu.offsetWidth - 10;
        }
        if (y + this.contextMenu.offsetHeight > window.innerHeight) {
            y = window.innerHeight - this.contextMenu.offsetHeight - 10;
        }
        this.contextMenu.style.left = `${x}px`;
        this.contextMenu.style.top = `${y}px`;
    }
    hideContextMenu() {
        this.contextMenu.style.display = 'none';
        this.activeContextSessionId = null;
        const allItems = this.listContainer.querySelectorAll('.lumina-history-item');
        allItems.forEach(el => el.classList.remove('context-menu-active'));
    }
    async renameItem(sessionId) {
        const item = this.historyData.find(i => i.id === sessionId);
        if (!item) return;
        const el = this.listContainer.querySelector(`.lumina-history-item[data-id="${sessionId}"]`);
        if (!el) return;
        const titleEl = el.querySelector('.lumina-history-item-title');
        const oldTitle = item.title;
        const input = document.createElement('input');
        input.type = 'text';
        input.value = oldTitle;
        input.className = 'lumina-history-rename-input';
        titleEl.textContent = '';
        titleEl.appendChild(input);
        input.focus();
        input.select();
        const saveRename = async () => {
            const newTitle = input.value.trim() || oldTitle;
            titleEl.textContent = newTitle;
            if (newTitle !== oldTitle) {
                titleEl.classList.add('renamed');
                await ChatHistoryManager.renameChat(sessionId, newTitle);
                item.title = newTitle;
                item.isRenamed = true;
            }
        };
        input.addEventListener('blur', saveRename);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') input.blur();
            if (e.key === 'Escape') {
                input.value = oldTitle;
                input.blur();
            }
        });
    }
    async duplicateItem(sessionId) {
        const id = await ChatHistoryManager.duplicateChat(sessionId);
        if (id) {
            await this.refreshData();
        }
    }
    async deleteItem(sessionId) {
        await ChatHistoryManager.deleteChat(sessionId);
        await this.refreshData();
        this.updateStorageUsage();
    }
    resetDeleteAll() {
        if (!this.deleteAllConfirming) return;
        this.deleteAllConfirming = false;
        clearTimeout(this.deleteAllTimeout);
        document.removeEventListener('mousedown', this.handleDeleteAllOutsideClick);
        if (this.deleteAllBtn) {
            this.deleteAllBtn.textContent = 'Delete All';
            this.deleteAllBtn.style.color = '';
            this.deleteAllBtn.style.background = '';
        }
    }
    handleDeleteAllOutsideClick(e) {
        if (this.deleteAllBtn && !this.deleteAllBtn.contains(e.target)) {
            this.resetDeleteAll();
        }
    }
    async handleDeleteAll() {
        if (!this.deleteAllConfirming) {
            this.deleteAllConfirming = true;
            if (this.deleteAllBtn) {
                this.deleteAllBtn.textContent = 'Are you sure?';
                this.deleteAllBtn.style.color = '#fff';
                this.deleteAllBtn.style.background = '#e53e3e';
            }
            this.handleDeleteAllOutsideClick = this.handleDeleteAllOutsideClick.bind(this);
            document.addEventListener('mousedown', this.handleDeleteAllOutsideClick);
            this.deleteAllTimeout = setTimeout(() => {
                this.resetDeleteAll();
            }, 3000);
            return;
        }
        if (this.deleteAllBtn) {
            this.deleteAllBtn.textContent = 'Deleting...';
            this.deleteAllBtn.disabled = true;
        }
        await ChatHistoryManager.clearAllHistory();
        await this.refreshData();
        this.updateStorageUsage();
        if (this.deleteAllBtn) {
            this.deleteAllBtn.textContent = 'Delete All';
            this.deleteAllBtn.disabled = false;
        }
    }
    async openSession(sessionId, messageIndex = null) {
        const contentKey = `lumina_session_${sessionId}`;
        const contentData = await chrome.storage.local.get([contentKey]);
        const messages = contentData[contentKey];
        if (!messages) {
            alert('Could not load chat history. Data may be corrupted or deleted.');
            return;
        }
        const meta = this.historyData.find(i => i.id === sessionId);
        this.closePanel();
        if (typeof window.loadHistoryIntoNewTab === 'function') {
            window.loadHistoryIntoNewTab(messages, meta, sessionId, messageIndex);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.luminaHistory = new LuminaHistory();
});
