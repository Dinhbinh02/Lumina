import { ChatHistoryManager } from '../../db/chat_history.js';

export class LuminaSearchModal {
  static init() {
    this.overlay = document.getElementById('lumina-search-overlay');
    this.searchInput = document.getElementById('lumina-search-input');
    this.resultsList = document.getElementById('lumina-search-results-list');
    this.closeBtn = document.getElementById('lumina-search-close-btn');
    this.overlayCloseBtn = document.getElementById('lumina-search-overlay-close-btn');
    this.newChatBtn = document.getElementById('lumina-search-new-chat');
    if (!this.overlay) return;
    if (this.initialized) return;
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.hide();
    });
    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', () => this.hide());
    }
    if (this.overlayCloseBtn) {
      this.overlayCloseBtn.addEventListener('click', () => this.hide());
    }
    if (this.newChatBtn) {
      this.newChatBtn.addEventListener('click', () => {
        const wasInPane = this.overlay ? this.overlay.classList.contains('in-pane') : false;
        this.isSelectingChat = true;
        this.hide();
        if (typeof resetChat === 'function') {
          resetChat(wasInPane);
        } else {
          const sidebarNewChatBtn = document.getElementById('sidebar-new-chat-btn');
          if (sidebarNewChatBtn) sidebarNewChatBtn.click();
        }
      });
    }
    if (this.searchInput) {
      this.searchInput.addEventListener('input', () => this.handleSearch());
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.overlay.style.display === 'flex') {
        this.hide();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        this.show();
      }
    });
    this.sessions = {};
    this.isSelectingChat = false;
    this.initialized = true;
  }
  static async show(inPane = false) {
    this.init();
    if (!this.overlay) return;
    this.isSelectingChat = false;
    if (inPane) {
      this.overlay.classList.add('in-pane');
      const paneSec = document.getElementById('pane-secondary');
      if (paneSec) {
        paneSec.appendChild(this.overlay);
      }
    } else {
      this.overlay.classList.remove('in-pane');
      document.body.appendChild(this.overlay);
    }
    this.overlay.style.display = 'flex';
    if (this.searchInput) {
      this.searchInput.value = '';
    }
    setTimeout(() => {
      if (this.searchInput) {
        this.searchInput.focus();
      }
    }, 50);
    this.sessions = await ChatHistoryManager.getAllHistories();
    this.handleSearch();
  }
  static hide() {
    if (this.overlay) {
      this.overlay.style.display = 'none';
      this.overlay.classList.remove('in-pane');
      document.body.appendChild(this.overlay);
    }
  }
  static escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  static getTimeGroup(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const dDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dNow = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffTime = dNow - dDate;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays <= 3) return 'Previous 3 Days';
    if (diffDays <= 7) return 'Previous 7 Days';
    if (diffDays <= 30) return 'Previous 30 Days';
    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];
    if (date.getFullYear() === now.getFullYear()) {
      return monthNames[date.getMonth()];
    }
    return `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
  }
  static handleSearch() {
    if (!this.resultsList) return;
    const query = this.searchInput ? this.searchInput.value.trim() : '';
    this.resultsList.innerHTML = '';
    const sessionList = Object.values(this.sessions || {}).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    let matchedItems = [];
    if (!query) {
      sessionList.forEach(session => {
        let displayTitle = session.title || 'Untitled Chat';
        let displaySnippet = '';
        let messageIndex = null;
        let itemTimestamp = session.updatedAt || session.createdAt || Date.now();
        if (session.questions && session.questions.length > 0) {
          const latestQ = session.questions[session.questions.length - 1];
          if (!session.isRenamed && !session.autoNamed) {
            displayTitle = latestQ.text || displayTitle;
          }
          displaySnippet = latestQ.snippet || '';
          messageIndex = latestQ.index;
          itemTimestamp = latestQ.timestamp || itemTimestamp;
        }
        matchedItems.push({
          sessionId: session.id,
          session,
          title: displayTitle,
          snippet: displaySnippet,
          messageIndex: messageIndex,
          timestamp: itemTimestamp,
          isEntry: true
        });
      });
    } else {
      const escapedQuery = this.escapeRegExp(query);
      const searchPattern = new RegExp(`(^|[^\\p{L}\\p{N}_])(${escapedQuery})([^\\p{L}\\p{N}_]|$)`, 'iu');
      sessionList.forEach(session => {
        let foundInQuestions = false;
        if (session.questions && session.questions.length > 0) {
          session.questions.forEach(q => {
            if (searchPattern.test(q.text)) {
              foundInQuestions = true;
              matchedItems.push({
                sessionId: session.id,
                session,
                title: q.text,
                snippet: q.snippet || '',
                messageIndex: q.index,
                timestamp: q.timestamp || session.updatedAt || Date.now(),
                isEntry: true,
                matchedQuery: query
              });
            }
          });
        }
        if (!foundInQuestions) {
          if ((session.title && searchPattern.test(session.title)) || (session.searchIndex && searchPattern.test(session.searchIndex))) {
            matchedItems.push({
              sessionId: session.id,
              session,
              title: session.title || 'Untitled Chat',
              snippet: '',
              messageIndex: null,
              timestamp: session.updatedAt || session.createdAt || Date.now(),
              isEntry: false,
              matchedQuery: query
            });
          }
        }
      });
    }

    if (matchedItems.length === 0) {
      this.resultsList.innerHTML = `<div class="lumina-search-empty">No results found for "${this.escapeHtml(query)}"</div>`;
      return;
    }

    matchedItems.sort((a, b) => b.timestamp - a.timestamp);
    const groups = {};
    const groupOrder = [];
    matchedItems.forEach(item => {
      const groupName = this.getTimeGroup(item.timestamp);
      if (!groups[groupName]) {
        groups[groupName] = [];
        groupOrder.push(groupName);
      }
      groups[groupName].push(item);
    });

    groupOrder.forEach(groupName => {
      const groupHeader = document.createElement('div');
      groupHeader.className = 'lumina-search-group-header';
      groupHeader.textContent = groupName;
      this.resultsList.appendChild(groupHeader);
      groups[groupName].forEach(item => {
        const el = this.createResultElement(item);
        this.resultsList.appendChild(el);
      });
    });
  }
  static escapeHtml(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  static highlightMatch(text, query) {
    if (!query) return this.escapeHtml(text);
    const safeText = this.escapeHtml(text);
    const escapedQuery = this.escapeRegExp(this.escapeHtml(query));
    const regex = new RegExp(`(${escapedQuery})`, 'gi');
    return safeText.replace(regex, '<span class="lumina-search-highlight">$1</span>');
  }
  static createResultElement(item) {
    const div = document.createElement('div');
    div.className = 'lumina-search-result-item';
    const displayTitle = item.matchedQuery ? this.highlightMatch(item.title, item.matchedQuery) : this.escapeHtml(item.title);
    let cleanSnippet = (item.snippet || '').replace(/\n/g, ' ').trim();
    if (cleanSnippet.length > 90) {
      cleanSnippet = cleanSnippet.substring(0, 87) + '...';
    }
    const displaySnippet = item.matchedQuery ? this.highlightMatch(cleanSnippet, item.matchedQuery) : this.escapeHtml(cleanSnippet);
    div.innerHTML = `
      <div class="lumina-search-result-icon">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>
      </div>
      <div class="lumina-search-result-content">
        <div class="lumina-search-result-title">${displayTitle}</div>
        ${cleanSnippet ? `<div class="lumina-search-result-snippet">${displaySnippet}</div>` : ''}
      </div>
    `;
    div.addEventListener('click', () => {
      this.openChat(item.sessionId, item.messageIndex);
    });
    return div;
  }
  static async openChat(sessionId, messageIndex = null) {
    const wasInPane = this.overlay ? this.overlay.classList.contains('in-pane') : false;
    this.isSelectingChat = true;
    this.hide();
    const messages = await ChatHistoryManager.getSessionMessages(sessionId);
    if (!messages) {
      alert('Could not load chat history.');
      return;
    }
    const meta = (this.sessions && this.sessions[sessionId]) || { id: sessionId };
    if (typeof window.loadHistoryIntoNewTab === 'function') {
      window.loadHistoryIntoNewTab(messages, meta, sessionId, messageIndex, wasInPane);
    }
  }
}

if (typeof window !== 'undefined') {
  window.LuminaSearchModal = LuminaSearchModal;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (document.getElementById('lumina-search-overlay')) {
        LuminaSearchModal.init();
      }
    });
  } else if (document.getElementById('lumina-search-overlay')) {
    LuminaSearchModal.init();
  }
}
