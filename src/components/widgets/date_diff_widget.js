import { NexusDatePicker } from '../ui/nexus_date_picker.js';

export class NexusDateDiffWidget {
    constructor(containerEl, props = {}) {
        this.containerEl = containerEl;
        this.label = 'Date Difference';

        const todayStr = NexusDatePicker.getTodayStr();
        const yyyy = new Date().getFullYear();

        this.startDate = props.from || todayStr;
        this.endDate = props.to || `${yyyy}-12-31`;

        this.startPicker = null;
        this.endPicker = null;

        this.render();
    }

    _calculateDiff() {
        const d1 = new Date(this.startDate + 'T00:00:00');
        const d2 = new Date(this.endDate + 'T00:00:00');

        if (isNaN(d1.getTime()) || isNaN(d2.getTime())) {
            return { isValid: false };
        }

        const isPast = d2 < d1;
        const [earlier, later] = isPast ? [d2, d1] : [d1, d2];
        const diffMs = later.getTime() - earlier.getTime();
        const totalDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

        const weeks = Math.floor(totalDays / 7);
        const remainDays = totalDays % 7;

        let workingDays = 0;
        const cur = new Date(earlier);
        while (cur < later) {
            const dayOfWeek = cur.getDay();
            if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                workingDays++;
            }
            cur.setDate(cur.getDate() + 1);
        }

        let y = later.getFullYear() - earlier.getFullYear();
        let m = later.getMonth() - earlier.getMonth();
        let d = later.getDate() - earlier.getDate();
        if (d < 0) {
            m--;
            const prevMonth = new Date(later.getFullYear(), later.getMonth(), 0);
            d += prevMonth.getDate();
        }
        if (m < 0) {
            y--;
            m += 12;
        }

        const isMultiYear = y >= 1;

        return {
            isValid: true,
            totalDays,
            weeks,
            remainDays,
            workingDays,
            years: y,
            months: m,
            days: d,
            isPast,
            isMultiYear
        };
    }

    render() {
        const diff = this._calculateDiff();

        this.containerEl.innerHTML = `
            <div class="nexus-widget">
                <div class="nexus-sol-datediff-card">
                    <!-- Top Bar: Clean Universal Title Badge -->
                    <div class="nexus-datediff-top-bar">
                        <div class="nexus-widget-title-badge">
                            <span class="nexus-widget-status-dot is-running-purple"></span>
                            <span class="nexus-widget-title-text">${this._escapeHtml(this.label)}</span>
                        </div>
                    </div>

                    <!-- Main Hero Counter -->
                    ${diff.isValid ? `
                        <div class="nexus-datediff-hero-section">
                            <div class="nexus-datediff-hero">
                                <span class="nexus-datediff-num">${diff.isMultiYear ? diff.years : diff.totalDays.toLocaleString('en-US')}</span>
                                <span class="nexus-datediff-unit">${diff.isMultiYear ? (diff.isPast ? 'YEARS AGO' : 'YEARS') : (diff.isPast ? 'DAYS AGO' : 'DAYS')}</span>
                            </div>
                            <div class="nexus-datediff-substats">
                                ${diff.isMultiYear ? `
                                    <span><strong>${diff.years}y ${diff.months}m ${diff.days}d</strong></span>
                                    <span class="nexus-dot-sep">·</span>
                                    <span><strong>${diff.totalDays.toLocaleString('en-US')}</strong> total days</span>
                                    <span class="nexus-dot-sep">·</span>
                                    <span><strong>${diff.workingDays.toLocaleString('en-US')}</strong> workdays</span>
                                ` : `
                                    <span><strong>${diff.weeks}w ${diff.remainDays}d</strong></span>
                                    <span class="nexus-dot-sep">·</span>
                                    <span><strong>${diff.workingDays.toLocaleString('en-US')}</strong> workdays</span>
                                    <span class="nexus-dot-sep">·</span>
                                    <span><strong>${diff.months}</strong> months</span>
                                `}
                            </div>
                        </div>
                    ` : `
                        <div class="nexus-datediff-invalid">Please select valid start and end dates.</div>
                    `}

                    <!-- Nexus Custom Date Range Pickers (Shared UI Component) -->
                    <div class="nexus-datediff-pickers-row">
                        <div class="nexus-start-dp-container" style="flex: 1;"></div>
                        <span class="nexus-datediff-arrow">→</span>
                        <div class="nexus-end-dp-container" style="flex: 1;"></div>
                    </div>
                </div>
            </div>
        `;

        // Mount Reusable NexusDatePicker instances
        const startMount = this.containerEl.querySelector('.nexus-start-dp-container');
        const endMount = this.containerEl.querySelector('.nexus-end-dp-container');

        if (startMount) {
            this.startPicker = new NexusDatePicker(startMount, {
                value: this.startDate,
                onChange: (newDate) => {
                    this.startDate = newDate;
                    this.render();
                }
            });
        }

        if (endMount) {
            this.endPicker = new NexusDatePicker(endMount, {
                value: this.endDate,
                onChange: (newDate) => {
                    this.endDate = newDate;
                    this.render();
                }
            });
        }
    }

    _escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
}
