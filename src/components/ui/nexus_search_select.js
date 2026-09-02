/**
 * Nexus Shared UI Component: NexusSearchSelect
 * Reusable Searchable Dropdown Popover with Keyboard Navigation (ArrowUp/Down, Enter, Esc).
 * Zero-flicker live filtering and singleton active instance management.
 */

export class NexusSearchSelect {
    static activeInstance = null;

    static closeActive() {
        if (NexusSearchSelect.activeInstance && NexusSearchSelect.activeInstance.isOpen) {
            NexusSearchSelect.activeInstance.close();
        }
        NexusSearchSelect.activeInstance = null;
    }

    constructor(containerEl, options = {}) {
        this.containerEl = containerEl;
        this.options = options.options || []; // Array of { value, label, flag, symbol, description }
        this.value = options.value || (this.options[0] ? this.options[0].value : '');
        this.onChange = options.onChange || (() => {});
        this.placeholder = options.placeholder || 'Search...';
        this.width = options.width || '115px';
        this.popoverWidth = options.popoverWidth || '240px';

        this.isOpen = false;
        this.searchQuery = '';
        this.highlightIndex = 0;
        this.filteredOptions = [...this.options];

        this.boundHandleDocClick = this._handleDocClick.bind(this);
        this.render();
        this.bindEvents();
    }

    setOptions(newOptions) {
        this.options = newOptions || [];
        this._filterOptions();
        this._updateButtonDisplay();
        if (this.isOpen) {
            this._renderList();
        }
    }

    setValue(newValue) {
        this.value = newValue;
        this._updateButtonDisplay();
        if (this.isOpen) {
            this._renderList();
        }
    }

    _getSelectedItem() {
        return this.options.find(o => o.value === this.value) || {
            value: this.value,
            label: this.value,
            flag: '🌐',
            symbol: this.value
        };
    }

    _filterOptions() {
        const q = this.searchQuery.trim().toLowerCase();
        if (!q) {
            this.filteredOptions = [...this.options];
        } else {
            this.filteredOptions = this.options.filter(item => {
                const val = (item.value || '').toLowerCase();
                const lbl = (item.label || '').toLowerCase();
                const desc = (item.description || '').toLowerCase();
                const country = (item.country || '').toLowerCase();
                return val.includes(q) || lbl.includes(q) || desc.includes(q) || country.includes(q);
            });
        }
        this.highlightIndex = 0;
    }

    render() {
        const selected = this._getSelectedItem();

        this.containerEl.innerHTML = `
            <div class="nexus-select-wrap" style="width: ${this.width};">
                <button type="button" class="nexus-select-btn" data-action="toggle-select">
                    <span class="nexus-select-btn-flag">${selected.flag || '🌐'}</span>
                    <span class="nexus-select-btn-val" data-btn-val>${selected.value}</span>
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="nexus-select-chevron">
                        <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                </button>
                <div class="nexus-select-popover ${this.isOpen ? 'is-open' : ''}" style="width: ${this.popoverWidth};" data-select-popover>
                    <div class="nexus-select-search-bar">
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="11" cy="11" r="8"></circle>
                            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                        </svg>
                        <input type="text" class="nexus-select-search-input" placeholder="${this.placeholder}" data-search-input />
                    </div>
                    <div class="nexus-select-list" data-select-list>
                        ${this._generateListHtml()}
                    </div>
                </div>
            </div>
        `;
    }

    _generateListHtml() {
        if (this.filteredOptions.length === 0) {
            return `<div class="nexus-select-empty">No results found</div>`;
        }

        return this.filteredOptions.map((item, idx) => {
            const isSelected = item.value === this.value;
            const isHighlighted = idx === this.highlightIndex;
            return `
                <div class="nexus-select-item ${isSelected ? 'is-selected' : ''} ${isHighlighted ? 'is-highlighted' : ''}" data-item-index="${idx}" data-item-value="${item.value}">
                    ${item.flag ? `<span class="nexus-select-item-flag">${item.flag}</span>` : ''}
                    <div class="nexus-select-item-info">
                        <span class="nexus-select-item-code">${item.value}</span>
                        ${item.label && item.label !== item.value ? `<span class="nexus-select-item-name">${item.label}</span>` : ''}
                    </div>
                    ${item.symbol && item.symbol !== item.value ? `<span class="nexus-select-item-symbol">${item.symbol}</span>` : ''}
                    ${isSelected ? `
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="nexus-select-check">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                    ` : ''}
                </div>
            `;
        }).join('');
    }

    _renderList() {
        const listEl = this.containerEl.querySelector('[data-select-list]');
        if (listEl) {
            listEl.innerHTML = this._generateListHtml();
            this._scrollToHighlighted();
        }
    }

    _scrollToHighlighted() {
        const listEl = this.containerEl.querySelector('[data-select-list]');
        if (!listEl) return;
        const highlightedEl = listEl.querySelector('.is-highlighted');
        if (highlightedEl) {
            highlightedEl.scrollIntoView({ block: 'nearest' });
        }
    }

    _updateButtonDisplay() {
        const selected = this._getSelectedItem();
        const flagEl = this.containerEl.querySelector('.nexus-select-btn-flag');
        const valEl = this.containerEl.querySelector('[data-btn-val]');
        if (flagEl) flagEl.textContent = selected.flag || '🌐';
        if (valEl) valEl.textContent = selected.value;
    }

    open() {
        if (NexusSearchSelect.activeInstance && NexusSearchSelect.activeInstance !== this) {
            NexusSearchSelect.activeInstance.close();
        }
        NexusSearchSelect.activeInstance = this;

        this.isOpen = true;
        this.searchQuery = '';
        this._filterOptions();

        // Highlight currently selected item in list if found
        const selIdx = this.filteredOptions.findIndex(o => o.value === this.value);
        this.highlightIndex = selIdx >= 0 ? selIdx : 0;

        const popover = this.containerEl.querySelector('[data-select-popover]');
        if (popover) popover.classList.add('is-open');

        const searchIn = this.containerEl.querySelector('[data-search-input]');
        if (searchIn) {
            searchIn.value = '';
            setTimeout(() => searchIn.focus(), 10);
        }

        this._renderList();

        setTimeout(() => {
            document.addEventListener('click', this.boundHandleDocClick);
        }, 0);
    }

    close() {
        this.isOpen = false;
        const popover = this.containerEl.querySelector('[data-select-popover]');
        if (popover) popover.classList.remove('is-open');
        document.removeEventListener('click', this.boundHandleDocClick);

        if (NexusSearchSelect.activeInstance === this) {
            NexusSearchSelect.activeInstance = null;
        }
    }

    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    _selectItem(item) {
        if (!item) return;
        this.value = item.value;
        this._updateButtonDisplay();
        this.close();
        this.onChange(item.value, item);
    }

    _selectHighlighted() {
        if (this.filteredOptions.length > 0 && this.highlightIndex >= 0 && this.highlightIndex < this.filteredOptions.length) {
            this._selectItem(this.filteredOptions[this.highlightIndex]);
        }
    }

    _handleDocClick(e) {
        if (!this.containerEl.contains(e.target)) {
            this.close();
        }
    }

    bindEvents() {
        // Toggle button click
        this.containerEl.addEventListener('click', (e) => {
            const toggleBtn = e.target.closest('[data-action="toggle-select"]');
            if (toggleBtn) {
                e.stopPropagation();
                this.toggle();
                return;
            }

            const itemEl = e.target.closest('[data-item-value]');
            if (itemEl) {
                e.stopPropagation();
                const val = itemEl.dataset.itemValue;
                const item = this.options.find(o => o.value === val);
                this._selectItem(item);
            }
        });

        // Search Input filter & Keyboard navigation
        this.containerEl.addEventListener('input', (e) => {
            const searchIn = e.target.closest('[data-search-input]');
            if (searchIn) {
                this.searchQuery = searchIn.value;
                this._filterOptions();
                this._renderList();
            }
        });

        this.containerEl.addEventListener('keydown', (e) => {
            if (!this.isOpen) return;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (this.filteredOptions.length > 0) {
                    this.highlightIndex = (this.highlightIndex + 1) % this.filteredOptions.length;
                    this._renderList();
                }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (this.filteredOptions.length > 0) {
                    this.highlightIndex = (this.highlightIndex - 1 + this.filteredOptions.length) % this.filteredOptions.length;
                    this._renderList();
                }
            } else if (e.key === 'Enter') {
                e.preventDefault();
                this._selectHighlighted();
            } else if (e.key === 'Escape' || e.key === 'Tab') {
                this.close();
            }
        });
    }
}
