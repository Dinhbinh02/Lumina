/**
 * Spotlight Chat History Controller
 * Handles sliding panel, lazy loading, context menu, and loading past sessions
 */
class LuminaHistory {
    constructor() {
        this.isOpen = false;
        this.historyData = [];
        this.displayedCount = 0;
        this.PAGE_SIZE = 20;

        // Elements
        this.sidebar = document.getElementById('lumina-history-sidebar');
        this.overlay = document.getElementById('lumina-history-overlay');
        this.toggleBtn = document.getElementById('lumina-history-toggle-btn');
        this.closeBtn = document.getElementById('lumina-history-close-btn');
        this.searchInput = document.getElementById('lumina-history-search-input');
        this.searchLoader = document.getElementById('lumina-history-loader');
        this.listContainer = document.getElementById('lumina-history-list-container');
        this.storageText = document.getElementById('storage-usage-text');
        this.deleteAllBtn = document.getElementById('lumina-history-delete-all-btn');
        
        // Context Menu
        this.contextMenu = document.getElementById('lumina-history-context-menu');
        this.menuRename = document.getElementById('menu-rename');
        this.menuDuplicate = document.getElementById('menu-duplicate');
        this.menuDelete = document.getElementById('menu-delete');
        this.activeContextSessionId = null;

        // Binds
        this.handleScroll = this.handleScroll.bind(this);
        this.handleClickOutside = this.handleClickOutside.bind(this);
        this.handleSearch = this.handleSearch.bind(this);
        this.hideTooltip = this.hideTooltip.bind(this);

        this.init();
    }

    init() {
        if (!this.toggleBtn || !this.sidebar) return;

        this.toggleBtn.addEventListener('click', () => this.togglePanel());
        this.closeBtn.addEventListener('click', () => this.closePanel());

        // Search debounce
        this.searchInput.addEventListener('input', () => {
            if (this.searchLoader) this.searchLoader.style.display = 'block';
            if (this.searchTimeout) clearTimeout(this.searchTimeout);
            this.searchTimeout = setTimeout(() => {
                this.handleSearch();
                if (this.searchLoader) this.searchLoader.style.display = 'none';
            }, 400); // Slightly longer for better visual feedback
        });

        // Lazy load on scroll
        this.listContainer.addEventListener('scroll', this.handleScroll);

        // Delete All
        this.deleteAllBtn.addEventListener('click', () => this.handleDeleteAll());

        // Overlay click to close
        if (this.overlay) {
            this.overlay.addEventListener('click', () => this.closePanel());
        }

        // Context menu actions
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

        // Click outside context menu
        document.addEventListener('mousedown', (e) => {
            if (this.contextMenu.style.display === 'block' && !this.contextMenu.contains(e.target)) {
                this.hideContextMenu();
            }
        });
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
        if (!this.sidebar.contains(e.target) && !this.toggleBtn.contains(e.target) && !this.contextMenu.contains(e.target)) {
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
        
        // Convert to array and sort by latest updated
        this.historyData = Object.values(sessions).sort((a, b) => b.updatedAt - a.updatedAt);
        this.handleSearch(); // Applies filter if exists and renders
    }

    handleSearch() {
        const query = this.searchInput.value.trim();
        this.listContainer.innerHTML = '';
        this.displayedCount = 0;
        this.filteredData = [];

        if (!query) {
            // Default Mode: One entry per session, showing its latest question
            this.filteredData = this.historyData.map(session => {
                if (session.questions && session.questions.length > 0) {
                    const latestQ = session.questions[session.questions.length - 1];
                    return {
                        isEntry: true,
                        id: session.id,
                        messageIndex: latestQ.index,
                        title: session.isRenamed ? session.title : (latestQ.text || "Untitled Chat"),
                        snippet: latestQ.snippet || "View full answer",
                        isRenamed: session.isRenamed,
                        updatedAt: latestQ.timestamp || session.updatedAt
                    };
                }
                return {
                    ...session,
                    isEntry: false, // Fallback for sessions with no questions
                };
            });
        } else {
            // Search Mode: Entry-based (Kiểu B) with Regex whole-word accent-sensitive matching
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
                                title: q.text, // The matched question is now the title
                                snippet: q.snippet || "View full answer",
                                isRenamed: session.isRenamed,
                                updatedAt: q.timestamp || session.updatedAt
                            });
                        }
                    });
                } else if (session.searchIndex && searchPattern.test(session.searchIndex)) {
                    // Fallback for old history without granular questions
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
        
        // If within 50px of bottom, load more
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

        // Position it
        const rect = target.getBoundingClientRect();
        const tooltipRect = this.tooltip.getBoundingClientRect();
        
        let top = rect.top - tooltipRect.height - 8;
        let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);

        // Clamping to screen
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
        // Use the same search pattern logic
        const searchPattern = new RegExp(`(^|[^\\p{L}\\p{N}_])(${escapedQuery})([^\\p{L}\\p{N}_]|$)`, 'iu');
        
        const match = text.match(searchPattern);
        if (!match) return text;

        const matchText = match[2]; // The group that captured the query
        const matchIndex = text.indexOf(matchText);
        
        let start = 0;
        let prefix = '';
        
        // If match is deep in the string, crop the beginning
        if (matchIndex > 25) {
            start = matchIndex - 15;
            prefix = '...';
        }

        let displayText = text.substring(start);
        
        // Escape HTML to prevent XSS before adding our highlight spans
        const div = document.createElement('div');
        div.textContent = prefix + displayText;
        let safeHTML = div.innerHTML;

        // Re-apply regex to add highlight spans
        // We use a simpler regex for final highlighting that just targets the query text specifically
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
        
        // Only highlight the title (Question)
        const displayTitle = item.isEntry && query ? this.highlightAndCrop(item.title, query) : item.title;
        
        // Snippet (Answer) should NOT be highlighted and should be safely truncated
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

        // Adjust position
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
        
        this.deleteAllBtn.textContent = 'Delete All';
        this.deleteAllBtn.style.color = '';
        this.deleteAllBtn.style.background = '';
    }

    handleDeleteAllOutsideClick(e) {
        if (this.deleteAllBtn && !this.deleteAllBtn.contains(e.target)) {
            this.resetDeleteAll();
        }
    }

    async handleDeleteAll() {
        if (!this.deleteAllConfirming) {
            this.deleteAllConfirming = true;
            this.deleteAllBtn.textContent = 'Are you sure?';
            this.deleteAllBtn.style.color = '#fff';
            this.deleteAllBtn.style.background = '#e53e3e';
            
            // Revert on outside click
            this.handleDeleteAllOutsideClick = this.handleDeleteAllOutsideClick.bind(this);
            document.addEventListener('mousedown', this.handleDeleteAllOutsideClick);

            this.deleteAllTimeout = setTimeout(() => {
                this.resetDeleteAll();
            }, 3000);
            return;
        }

        // Confirmed - proceed with deletion
        const originalText = this.deleteAllBtn.textContent;
        this.resetDeleteAll();
        this.deleteAllBtn.textContent = 'Deleting...';
        this.deleteAllBtn.disabled = true;

        await ChatHistoryManager.clearAllHistory();
        await this.refreshData();
        this.updateStorageUsage();
        
        this.deleteAllBtn.textContent = 'Delete All';
        this.deleteAllBtn.disabled = false;
    }

    async openSession(sessionId, messageIndex = null) {
        // Load messages
        const contentKey = `lumina_session_${sessionId}`;
        const contentData = await chrome.storage.local.get([contentKey]);
        const messages = contentData[contentKey];

        if (!messages) {
            alert('Could not load chat history. Data may be corrupted or deleted.');
            return;
        }

        const meta = this.historyData.find(i => i.id === sessionId);

        // Switch to main view
        this.closePanel();

        // Let spotlight handle creating a new tab from loaded history messages
        if (typeof window.loadHistoryIntoNewTab === 'function') {
            window.loadHistoryIntoNewTab(messages, meta, sessionId, messageIndex);
        }
    }
}

// Initialize when ready
document.addEventListener('DOMContentLoaded', () => {
    window.luminaHistory = new LuminaHistory();
});
