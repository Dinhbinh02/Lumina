

class LuminaSearchModal {
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

    
    this.searchInput.addEventListener('input', () => this.handleSearch());
    
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

    
    const result = await chrome.storage.local.get([ChatHistoryManager.STORAGE_KEY]);
    this.sessions = result[ChatHistoryManager.STORAGE_KEY] || {};

    this.handleSearch();
  }

  static hide() {
    if (this.overlay) {
      const wasInPane = this.overlay.classList.contains('in-pane');
      this.overlay.style.display = 'none';
      this.overlay.classList.remove('in-pane');
      document.body.appendChild(this.overlay); 

      if (wasInPane && !this.isSelectingChat && typeof isSplitMode !== 'undefined' && isSplitMode) {
        if (typeof toggleSplitMode === 'function') {
          toggleSplitMode();
        }
      }
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
    } else {
      return `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
    }
  }

  static getHighlightHtml(text, query) {
    const escapedQuery = this.escapeRegExp(query);
    const regex = new RegExp(`(${escapedQuery})`, 'gi');
    
    const matchIdx = text.toLowerCase().indexOf(query.toLowerCase());
    let displayText = text;
    
    if (text.length > 100 && matchIdx !== -1) {
      const start = Math.max(0, matchIdx - 40);
      const end = Math.min(text.length, matchIdx + 60);
      displayText = (start > 0 ? '...' : '') + text.substring(start, end) + (end < text.length ? '...' : '');
    }
    
    
    const tempDiv = document.createElement('div');
    tempDiv.textContent = displayText;
    const escapedText = tempDiv.innerHTML;

    
    return escapedText.replace(regex, '<b>$1</b>');
  }

  static handleSearch() {
    const query = this.searchInput.value.trim().toLowerCase();
    this.resultsList.innerHTML = '';

    const historyData = Object.values(this.sessions).sort((a, b) => b.updatedAt - a.updatedAt);

    if (!query) {
      
      const grouped = {};
      historyData.forEach(session => {
        const groupName = this.getTimeGroup(session.updatedAt);
        if (!grouped[groupName]) {
          grouped[groupName] = [];
        }
        grouped[groupName].push(session);
      });

      
      const groupOrder = ['Today', 'Yesterday', 'Previous 3 Days', 'Previous 7 Days', 'Previous 30 Days'];
      const allGroups = Object.keys(grouped).sort((a, b) => {
        const idxA = groupOrder.indexOf(a);
        const idxB = groupOrder.indexOf(b);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        
        
        const parseGroup = (g) => {
          const parts = g.split(' ');
          const monthIndex = [
            "January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"
          ].indexOf(parts[0]);
          const year = parts[1] ? parseInt(parts[1], 10) : new Date().getFullYear();
          return new Date(year, monthIndex, 1).getTime();
        };

        return parseGroup(b) - parseGroup(a);
      });

      allGroups.forEach(groupName => {
        const headerEl = document.createElement('div');
        headerEl.className = 'lumina-search-group-header';
        headerEl.textContent = groupName;
        this.resultsList.appendChild(headerEl);

        grouped[groupName].forEach(session => {
          let displayTitle = session.title;
          if (!session.isRenamed && !session.autoNamed && session.questions && session.questions.length > 0) {
            displayTitle = session.questions[session.questions.length - 1].text || "Untitled Chat";
          }
          if (!displayTitle) displayTitle = "Untitled Chat";

          const activeSessionId = this.getActiveSessionId();
          const isCurrent = activeSessionId === session.id;
          const timeIndicatorHtml = isCurrent 
            ? `<span class="lumina-search-item-current">current</span>`
            : `<span class="lumina-search-item-date">${this.formatDate(session.updatedAt)}</span>`;

          const itemEl = document.createElement('div');
          itemEl.className = 'lumina-search-item';
          itemEl.innerHTML = `
            <div class="lumina-search-item-content">
              <div class="lumina-search-item-top">
                <span class="lumina-search-item-title"></span>
                ${timeIndicatorHtml}
              </div>
            </div>
          `;
          itemEl.querySelector('.lumina-search-item-title').textContent = displayTitle;

          itemEl.addEventListener('click', () => this.openSession(session.id));
          this.resultsList.appendChild(itemEl);
        });
      });

    } else {
      
      const results = [];
      const escapedQuery = this.escapeRegExp(query);
      const regex = new RegExp(escapedQuery, 'i');

      for (let i = 0; i < historyData.length; i++) {
        const session = historyData[i];
        let displayTitle = session.title;
        if (!session.isRenamed && !session.autoNamed && session.questions && session.questions.length > 0) {
          displayTitle = session.questions[session.questions.length - 1].text || "Untitled Chat";
        }
        if (!displayTitle) displayTitle = "Untitled Chat";

        if (session.questions && session.questions.length > 0) {
          session.questions.forEach(q => {
            if (regex.test(q.text)) {
              results.push({
                sessionId: session.id,
                title: displayTitle,
                snippet: q.text,
                messageIndex: q.index,
                timestamp: q.timestamp || session.updatedAt
              });
            }
          });
        } else if (session.title && regex.test(session.title)) {
          results.push({
            sessionId: session.id,
            title: displayTitle,
            snippet: session.title,
            messageIndex: null,
            timestamp: session.updatedAt
          });
        }

        if (results.length >= 20) break;
      }

      const finalResults = results.slice(0, 20);

      if (finalResults.length === 0) {
        this.resultsList.innerHTML = `<div class="lumina-search-no-results">No chats found</div>`;
        return;
      }

      finalResults.forEach(item => {
        const activeSessionId = this.getActiveSessionId();
        const isCurrent = activeSessionId === item.sessionId;
        const timeIndicatorHtml = isCurrent 
          ? `<span class="lumina-search-item-current">current</span>`
          : `<span class="lumina-search-item-date">${this.formatDate(item.timestamp)}</span>`;

        const itemEl = document.createElement('div');
        itemEl.className = 'lumina-search-item';
        itemEl.innerHTML = `
          <div class="lumina-search-item-content">
            <div class="lumina-search-item-top">
              <span class="lumina-search-item-title"></span>
              ${timeIndicatorHtml}
            </div>
            <div class="lumina-search-item-snippet"></div>
          </div>
        `;
        itemEl.querySelector('.lumina-search-item-title').textContent = item.title;
        itemEl.querySelector('.lumina-search-item-snippet').innerHTML = this.getHighlightHtml(item.snippet, query);

        itemEl.addEventListener('click', () => this.openSession(item.sessionId, item.messageIndex));
        this.resultsList.appendChild(itemEl);
      });
    }
  }

  static async openSession(sessionId, messageIndex = null) {
    const wasInPane = this.overlay ? this.overlay.classList.contains('in-pane') : false;
    this.isSelectingChat = true;
    this.hide();
    this.isSelectingChat = false;
    const contentKey = `lumina_session_${sessionId}`;
    const contentData = await chrome.storage.local.get([contentKey]);
    const messages = contentData[contentKey] || [];
    const meta = this.sessions[sessionId] || { id: sessionId };
    
    
    const listContainer = document.getElementById('sidebar-recent-chats');
    if (listContainer) {
      listContainer.querySelectorAll('.recent-chat-item.active').forEach(el => el.classList.remove('active'));
      document.querySelectorAll('#sidebar-sparks-list .sidebar-spark-item.active').forEach(el => el.classList.remove('active'));
      const targetSidebarItem = listContainer.querySelector(`.recent-chat-item[data-session-id="${sessionId}"]`);
      if (targetSidebarItem) {
        targetSidebarItem.classList.add('active');
      }
    }

    if (typeof window.loadHistoryIntoNewTab === 'function') {
      window.loadHistoryIntoNewTab(messages, meta, sessionId, messageIndex, wasInPane);
    }

    
    const sidebar = document.getElementById('lumina-sidebar');
    const backdrop = document.querySelector('.sidebar-backdrop');
    if (sidebar) sidebar.classList.remove('active');
    if (backdrop) backdrop.classList.remove('active');
    document.body.classList.remove('sidebar-open');
  }

  static getActiveSessionId() {
    
    const activeSidebarItem = document.querySelector('#sidebar-recent-chats .recent-chat-item.active');
    if (activeSidebarItem) {
      const sid = activeSidebarItem.getAttribute('data-session-id');
      if (sid) return sid;
    }
    
    
    if (typeof window.LuminaSelectionScope !== 'undefined') {
      const tabs = window.LuminaSelectionScope.getTabs();
      const activeIndex = window.LuminaSelectionScope.getActiveTabIndex();
      if (tabs && activeIndex >= 0 && tabs[activeIndex]) {
        return tabs[activeIndex].sessionId;
      }
    }
    
    return null;
  }

  static formatDate(timestamp) {
    if (!timestamp) return '';
    const d = new Date(timestamp);
    const today = new Date();
    
    const isToday = d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = d.getDate() === yesterday.getDate() && d.getMonth() === yesterday.getMonth() && d.getFullYear() === yesterday.getFullYear();

    if (isToday || isYesterday) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    
    
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const year = String(d.getFullYear()).slice(-2);
    return `${month}/${day}/${year}`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  LuminaSearchModal.init();
});
