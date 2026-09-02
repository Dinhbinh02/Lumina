/**
 * Nexus Shared UI Component: NexusDatePicker
 * Reusable dark-mode multi-level calendar (Days -> Months -> Years -> Decades).
 * Zero-flicker 60fps transitions.
 */
export class NexusDatePicker {
    static activeInstance = null;

    static closeActive() {
        if (NexusDatePicker.activeInstance && NexusDatePicker.activeInstance.isOpen) {
            NexusDatePicker.activeInstance.close();
        }
        NexusDatePicker.activeInstance = null;
    }

    constructor(containerEl, options = {}) {
        this.containerEl = containerEl;
        this.value = options.value || NexusDatePicker.getTodayStr();
        this.onChange = options.onChange || (() => {});
        this.format = options.format || 'DD/MM/YYYY';

        this.isOpen = false;
        this.viewMode = 'days'; // 'days' | 'months' | 'years' | 'decades'

        const initialDate = new Date(this.value + 'T00:00:00');
        const now = new Date();
        this.viewYear = isNaN(initialDate.getFullYear()) ? now.getFullYear() : initialDate.getFullYear();
        this.viewMonth = isNaN(initialDate.getMonth()) ? now.getMonth() : initialDate.getMonth();

        this.boundHandleDocClick = this._handleDocClick.bind(this);
        this.render();
        this.bindEvents();
    }

    static getTodayStr() {
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    }

    static formatDisplayDate(dateStr) {
        if (!dateStr) return '';
        const parts = dateStr.split('-');
        if (parts.length !== 3) return dateStr;
        const [y, m, d] = parts;
        return `${d}/${m}/${y}`;
    }

    setValue(dateStr, triggerChange = true) {
        this.value = dateStr;
        const d = new Date(dateStr + 'T00:00:00');
        if (!isNaN(d.getTime())) {
            this.viewYear = d.getFullYear();
            this.viewMonth = d.getMonth();
        }
        this._updateDisplay();
        if (triggerChange && typeof this.onChange === 'function') {
            this.onChange(this.value);
        }
    }

    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    open() {
        if (NexusDatePicker.activeInstance && NexusDatePicker.activeInstance !== this) {
            NexusDatePicker.activeInstance.close();
        }
        NexusDatePicker.activeInstance = this;

        this.isOpen = true;
        this.viewMode = 'days';
        const d = new Date(this.value + 'T00:00:00');
        if (!isNaN(d.getTime())) {
            this.viewYear = d.getFullYear();
            this.viewMonth = d.getMonth();
        }
        this._updateDisplay();
        document.removeEventListener('click', this.boundHandleDocClick);
        setTimeout(() => {
            if (this.isOpen) {
                document.addEventListener('click', this.boundHandleDocClick);
            }
        }, 0);
    }

    close() {
        if (NexusDatePicker.activeInstance === this) {
            NexusDatePicker.activeInstance = null;
        }
        this.isOpen = false;
        this._updateDisplay();
        document.removeEventListener('click', this.boundHandleDocClick);
    }

    _handleDocClick(e) {
        if (!this.containerEl.contains(e.target)) {
            this.close();
        }
    }

    _generateCalendarHtml() {
        const monthNames = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];
        const monthShorts = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        const todayStr = NexusDatePicker.getTodayStr();
        const selectedDate = new Date(this.value + 'T00:00:00');
        const selYear = selectedDate.getFullYear();
        const selMonth = selectedDate.getMonth();

        // 1. DAYS VIEW
        if (this.viewMode === 'days') {
            const firstDayOfMonth = new Date(this.viewYear, this.viewMonth, 1).getDay();
            const startOffset = (firstDayOfMonth === 0 ? 7 : firstDayOfMonth) - 1;
            const daysInMonth = new Date(this.viewYear, this.viewMonth + 1, 0).getDate();
            const daysInPrevMonth = new Date(this.viewYear, this.viewMonth, 0).getDate();

            let daysHtml = '';
            for (let i = startOffset - 1; i >= 0; i--) {
                const dayNum = daysInPrevMonth - i;
                daysHtml += `<div class="nexus-dp-day is-dimmed">${dayNum}</div>`;
            }

            for (let day = 1; day <= daysInMonth; day++) {
                const mm = String(this.viewMonth + 1).padStart(2, '0');
                const dd = String(day).padStart(2, '0');
                const iso = `${this.viewYear}-${mm}-${dd}`;
                const isSelected = iso === this.value;
                const isToday = iso === todayStr;

                daysHtml += `
                    <button type="button" class="nexus-dp-day ${isSelected ? 'is-selected' : ''} ${isToday ? 'is-today' : ''}" data-dp-select="${iso}">
                        ${day}
                    </button>
                `;
            }

            const totalCells = startOffset + daysInMonth;
            const remaining = (7 - (totalCells % 7)) % 7;
            for (let day = 1; day <= remaining; day++) {
                daysHtml += `<div class="nexus-dp-day is-dimmed">${day}</div>`;
            }

            return `
                <div class="nexus-dp-header">
                    <button type="button" class="nexus-dp-nav-btn" data-dp-nav="-1" title="Previous Month">
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
                    </button>
                    <button type="button" class="nexus-dp-month-title is-interactive" data-dp-drill="up" title="Select Month & Year">
                        ${monthNames[this.viewMonth]} ${this.viewYear}
                    </button>
                    <button type="button" class="nexus-dp-nav-btn" data-dp-nav="1" title="Next Month">
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
                    </button>
                </div>

                <div class="nexus-dp-weekdays">
                    <span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span><span>Su</span>
                </div>

                <div class="nexus-dp-grid">
                    ${daysHtml}
                </div>

                <div class="nexus-dp-footer">
                    <button type="button" class="nexus-dp-today-btn" data-dp-today>Today</button>
                </div>
            `;
        }

        // 2. MONTHS VIEW (12 Months Grid)
        if (this.viewMode === 'months') {
            let monthsHtml = '';
            for (let m = 0; m < 12; m++) {
                const isSelected = selYear === this.viewYear && selMonth === m;
                monthsHtml += `
                    <button type="button" class="nexus-dp-item-cell ${isSelected ? 'is-selected' : ''}" data-dp-month="${m}">
                        ${monthShorts[m]}
                    </button>
                `;
            }

            return `
                <div class="nexus-dp-header">
                    <button type="button" class="nexus-dp-nav-btn" data-dp-nav="-1" title="Previous Year">
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
                    </button>
                    <button type="button" class="nexus-dp-month-title is-interactive" data-dp-drill="up" title="Select Year Range">
                        ${this.viewYear}
                    </button>
                    <button type="button" class="nexus-dp-nav-btn" data-dp-nav="1" title="Next Year">
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
                    </button>
                </div>

                <div class="nexus-dp-large-grid">
                    ${monthsHtml}
                </div>
            `;
        }

        // 3. YEARS VIEW (Decade Grid e.g. 2020 - 2029)
        if (this.viewMode === 'years') {
            const decadeStart = Math.floor(this.viewYear / 10) * 10;
            const decadeEnd = decadeStart + 9;

            let yearsHtml = '';
            // Pre-decade year
            yearsHtml += `<button type="button" class="nexus-dp-item-cell is-dimmed" data-dp-year="${decadeStart - 1}">${decadeStart - 1}</button>`;

            for (let y = decadeStart; y <= decadeEnd; y++) {
                const isSelected = selYear === y;
                yearsHtml += `
                    <button type="button" class="nexus-dp-item-cell ${isSelected ? 'is-selected' : ''}" data-dp-year="${y}">
                        ${y}
                    </button>
                `;
            }
            // Post-decade year
            yearsHtml += `<button type="button" class="nexus-dp-item-cell is-dimmed" data-dp-year="${decadeEnd + 1}">${decadeEnd + 1}</button>`;

            return `
                <div class="nexus-dp-header">
                    <button type="button" class="nexus-dp-nav-btn" data-dp-nav="-1" title="Previous Decade">
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
                    </button>
                    <button type="button" class="nexus-dp-month-title is-interactive" data-dp-drill="up" title="Select Century Range">
                        ${decadeStart} – ${decadeEnd}
                    </button>
                    <button type="button" class="nexus-dp-nav-btn" data-dp-nav="1" title="Next Decade">
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
                    </button>
                </div>

                <div class="nexus-dp-large-grid">
                    ${yearsHtml}
                </div>
            `;
        }

        // 4. DECADES VIEW (Century Grid e.g. 2000 - 2099)
        if (this.viewMode === 'decades') {
            const centuryStart = Math.floor(this.viewYear / 100) * 100;
            const centuryEnd = centuryStart + 99;

            let decadesHtml = '';
            for (let d = centuryStart; d <= centuryEnd; d += 10) {
                const isSelected = selYear >= d && selYear < d + 10;
                decadesHtml += `
                    <button type="button" class="nexus-dp-item-cell ${isSelected ? 'is-selected' : ''}" data-dp-decade="${d}">
                        ${d}s
                    </button>
                `;
            }

            return `
                <div class="nexus-dp-header">
                    <button type="button" class="nexus-dp-nav-btn" data-dp-nav="-1" title="Previous Century">
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
                    </button>
                    <span class="nexus-dp-month-title">
                        ${centuryStart} – ${centuryEnd}
                    </span>
                    <button type="button" class="nexus-dp-nav-btn" data-dp-nav="1" title="Next Century">
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
                    </button>
                </div>

                <div class="nexus-dp-large-grid">
                    ${decadesHtml}
                </div>
            `;
        }

        return '';
    }

    render() {
        this.containerEl.innerHTML = `
            <div class="nexus-datepicker-wrap ${this.isOpen ? 'is-open' : ''}">
                <button type="button" class="nexus-datepicker-trigger" data-action="toggle-picker">
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="16" y1="2" x2="16" y2="6"></line>
                        <line x1="8" y1="2" x2="8" y2="6"></line>
                        <line x1="3" y1="10" x2="21" y2="10"></line>
                    </svg>
                    <span data-display-date>${NexusDatePicker.formatDisplayDate(this.value)}</span>
                </button>
                <div class="nexus-datepicker-popover" style="${this.isOpen ? 'display:flex;' : 'display:none;'}">
                    ${this.isOpen ? this._generateCalendarHtml() : ''}
                </div>
            </div>
        `;
    }

    _updateDisplay() {
        const wrap = this.containerEl.querySelector('.nexus-datepicker-wrap');
        const popover = this.containerEl.querySelector('.nexus-datepicker-popover');
        const labelEl = this.containerEl.querySelector('[data-display-date]');

        if (labelEl) {
            labelEl.textContent = NexusDatePicker.formatDisplayDate(this.value);
        }

        if (wrap) {
            wrap.classList.toggle('is-open', this.isOpen);
        }

        if (popover) {
            if (this.isOpen) {
                popover.style.display = 'flex';
                popover.innerHTML = this._generateCalendarHtml();
            } else {
                popover.style.display = 'none';
                popover.innerHTML = '';
            }
        }
    }

    bindEvents() {
        this.containerEl.addEventListener('click', (e) => {
            e.stopPropagation();

            // 1. Toggle Popover
            const toggleBtn = e.target.closest('[data-action="toggle-picker"]');
            if (toggleBtn) {
                this.toggle();
                return;
            }

            // 2. Drill-up header click (Days -> Months -> Years -> Decades)
            const drillBtn = e.target.closest('[data-dp-drill]');
            if (drillBtn) {
                if (this.viewMode === 'days') this.viewMode = 'months';
                else if (this.viewMode === 'months') this.viewMode = 'years';
                else if (this.viewMode === 'years') this.viewMode = 'decades';
                this._updateDisplay();
                return;
            }

            // 3. Navigation Prev / Next
            const navBtn = e.target.closest('[data-dp-nav]');
            if (navBtn) {
                const dir = parseInt(navBtn.dataset.dpNav, 10);
                if (this.viewMode === 'days') {
                    this.viewMonth += dir;
                    if (this.viewMonth < 0) {
                        this.viewMonth = 11;
                        this.viewYear--;
                    } else if (this.viewMonth > 11) {
                        this.viewMonth = 0;
                        this.viewYear++;
                    }
                } else if (this.viewMode === 'months') {
                    this.viewYear += dir;
                } else if (this.viewMode === 'years') {
                    this.viewYear += (dir * 10);
                } else if (this.viewMode === 'decades') {
                    this.viewYear += (dir * 100);
                }
                this._updateDisplay();
                return;
            }

            // 4. Drill-down selections
            // Decade selected -> go to years
            const decadeBtn = e.target.closest('[data-dp-decade]');
            if (decadeBtn) {
                this.viewYear = parseInt(decadeBtn.dataset.dpDecade, 10);
                this.viewMode = 'years';
                this._updateDisplay();
                return;
            }

            // Year selected -> go to months
            const yearBtn = e.target.closest('[data-dp-year]');
            if (yearBtn) {
                this.viewYear = parseInt(yearBtn.dataset.dpYear, 10);
                this.viewMode = 'months';
                this._updateDisplay();
                return;
            }

            // Month selected -> go to days
            const monthBtn = e.target.closest('[data-dp-month]');
            if (monthBtn) {
                this.viewMonth = parseInt(monthBtn.dataset.dpMonth, 10);
                this.viewMode = 'days';
                this._updateDisplay();
                return;
            }

            // 5. Day Click -> select date and close
            const dayBtn = e.target.closest('[data-dp-select]');
            if (dayBtn) {
                const selectedIso = dayBtn.dataset.dpSelect;
                this.setValue(selectedIso, true);
                this.close();
                return;
            }

            // 6. Today Button
            const todayBtn = e.target.closest('[data-dp-today]');
            if (todayBtn) {
                const todayStr = NexusDatePicker.getTodayStr();
                this.setValue(todayStr, true);
                this.close();
                return;
            }
        });
    }

    destroy() {
        document.removeEventListener('click', this.boundHandleDocClick);
        this.containerEl.innerHTML = '';
    }
}
