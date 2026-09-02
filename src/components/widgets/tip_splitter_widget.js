/**
 * Tip & Group Bill Splitter Widget (.nexus-sol-tip-card)
 * Interactive bill splitting with tip presets and people counter.
 */
export class TipSplitterWidget {
    constructor(containerEl, props = {}) {
        this.containerEl = containerEl;
        this.label = props.label || props.title || 'Bill Splitter';

        const rawBill = parseFloat(props.bill || props.total || props.total_bill || props.amount);
        const rawTip = parseFloat(props.tip || props.tip_percent || props.tip_rate);
        const rawPeople = parseInt(props.people || props.num_people || props.split || props.count, 10);

        let cur = (props.currency || props.unit || '').toUpperCase().trim();
        if (!cur) {
            cur = (props.isVnd === true || (!isNaN(rawBill) && rawBill > 1000)) ? 'VND' : 'USD';
        }
        this.currency = cur;
        this.isVnd = this.currency === 'VND' || this.currency === 'Đ' || this.currency === 'VNĐ';

        this.bill = !isNaN(rawBill) && rawBill > 0 ? rawBill : (this.isVnd ? 850000 : 85);
        this.tipPercent = !isNaN(rawTip) && rawTip >= 0 ? rawTip : 10;
        this.people = !isNaN(rawPeople) && rawPeople >= 1 ? Math.min(50, rawPeople) : 3;

        this.render();
        this.bindEvents();
    }

    _formatMoney(val) {
        if (isNaN(val)) return '0';
        if (this.isVnd) {
            return Math.round(val).toLocaleString('vi-VN') + ' đ';
        }
        if (this.currency === 'USD' || this.currency === '$') {
            return '$' + Number(val.toFixed(2)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }
        if (this.currency === 'EUR' || this.currency === '€') {
            return '€' + Number(val.toFixed(2)).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }
        if (this.currency === 'GBP' || this.currency === '£') {
            return '£' + Number(val.toFixed(2)).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }
        if (this.currency === 'JPY' || this.currency === '¥') {
            return '¥' + Math.round(val).toLocaleString('ja-JP');
        }
        return Number(val.toFixed(2)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + this.currency;
    }

    _calculateSplit() {
        const tipAmount = this.bill * (this.tipPercent / 100);
        const totalWithTip = this.bill + tipAmount;
        const perPerson = this.people > 0 ? totalWithTip / this.people : totalWithTip;
        const tipPerPerson = this.people > 0 ? tipAmount / this.people : 0;

        return {
            bill: this.bill,
            tipPercent: this.tipPercent,
            tipAmount,
            totalWithTip,
            people: this.people,
            perPerson,
            tipPerPerson
        };
    }

    render() {
        const data = this._calculateSplit();
        const tipPresets = [0, 5, 10, 15, 20];

        this.containerEl.innerHTML = `
            <div class="nexus-widget">
                <div class="nexus-sol-tip-card">
                    <!-- Top Bar -->
                    <div class="nexus-tip-top-bar">
                        <div class="nexus-widget-title-badge">
                            <span class="nexus-widget-status-dot is-running-cyan"></span>
                            <span class="nexus-widget-title-text">${this.label}</span>
                        </div>
                    </div>

                    <!-- Main Hero: Amount Per Person -->
                    <div class="nexus-tip-hero-block">
                        <span class="nexus-tip-hero-label">Each Person Pays</span>
                        <div class="nexus-tip-hero-val-row">
                            <span class="nexus-tip-hero-val" data-per-person-val>${this._formatMoney(data.perPerson)}</span>
                            <span class="nexus-tip-hero-per">/ person</span>
                        </div>
                    </div>

                    <!-- Controls Section -->
                    <div class="nexus-tip-controls">
                        <!-- Bill Amount Slider -->
                        <div class="nexus-tip-control-row">
                            <div class="nexus-tip-control-header">
                                <span class="nexus-tip-label">Bill Amount</span>
                                <span class="nexus-tip-num-display" data-bill-display>${this._formatMoney(this.bill)}</span>
                            </div>
                            <input type="range" class="nexus-tip-slider" min="${this.isVnd ? 50000 : 10}" max="${this.isVnd ? 10000000 : 1000}" step="${this.isVnd ? 50000 : 5}" value="${this.bill}" data-slider="bill" />
                        </div>

                        <!-- Tip Percentage Chips Row -->
                        <div class="nexus-tip-control-row">
                            <div class="nexus-tip-control-header">
                                <span class="nexus-tip-label">Tip: <strong data-tip-percent-text>${this.tipPercent}%</strong> (+${this._formatMoney(data.tipAmount)})</span>
                            </div>
                            <div class="nexus-tip-chips-row">
                                ${tipPresets.map(p => `
                                    <button type="button" class="nexus-tip-chip ${this.tipPercent === p ? 'is-active' : ''}" data-tip-val="${p}">
                                        ${p === 0 ? 'No Tip' : `${p}%`}
                                    </button>
                                `).join('')}
                            </div>
                        </div>

                        <!-- Number of People Stepper & Slider -->
                        <div class="nexus-tip-control-row">
                            <div class="nexus-tip-control-header">
                                <span class="nexus-tip-label">Number of People</span>
                                <div class="nexus-tip-stepper-box">
                                    <button type="button" class="nexus-tip-step-btn" data-step="-1" title="Decrease person">−</button>
                                    <span class="nexus-tip-stepper-count" data-people-count>${this.people}</span>
                                    <button type="button" class="nexus-tip-step-btn" data-step="1" title="Increase person">+</button>
                                </div>
                            </div>
                            <input type="range" class="nexus-tip-slider" min="1" max="20" step="1" value="${this.people}" data-slider="people" />
                        </div>
                    </div>

                    <!-- Summary Stats Breakdown Footer -->
                    <div class="nexus-tip-summary-row">
                        <div class="nexus-tip-summary-item">
                            <span class="nexus-tip-summary-label">Total Tip</span>
                            <span class="nexus-tip-summary-val is-cyan" data-sum-tip>+${this._formatMoney(data.tipAmount)}</span>
                        </div>
                        <div class="nexus-tip-summary-item">
                            <span class="nexus-tip-summary-label">Total Bill + Tip</span>
                            <span class="nexus-tip-summary-val" data-sum-total>${this._formatMoney(data.totalWithTip)}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    _updateLiveUI() {
        const data = this._calculateSplit();

        const perPersonEl = this.containerEl.querySelector('[data-per-person-val]');
        if (perPersonEl) perPersonEl.textContent = this._formatMoney(data.perPerson);

        const billDisp = this.containerEl.querySelector('[data-bill-display]');
        if (billDisp) billDisp.textContent = this._formatMoney(this.bill);

        const tipText = this.containerEl.querySelector('[data-tip-percent-text]');
        if (tipText) tipText.textContent = `${this.tipPercent}%`;

        const peopleCount = this.containerEl.querySelector('[data-people-count]');
        if (peopleCount) peopleCount.textContent = `${this.people}`;

        const peopleSlider = this.containerEl.querySelector('[data-slider="people"]');
        if (peopleSlider) peopleSlider.value = this.people;

        const sumTip = this.containerEl.querySelector('[data-sum-tip]');
        if (sumTip) sumTip.textContent = `+${this._formatMoney(data.tipAmount)}`;

        const sumTotal = this.containerEl.querySelector('[data-sum-total]');
        if (sumTotal) sumTotal.textContent = this._formatMoney(data.totalWithTip);

        const chips = this.containerEl.querySelectorAll('.nexus-tip-chip');
        chips.forEach(chip => {
            const val = parseFloat(chip.dataset.tipVal);
            if (val === this.tipPercent) {
                chip.classList.add('is-active');
            } else {
                chip.classList.remove('is-active');
            }
        });
    }

    bindEvents() {
        this.containerEl.addEventListener('click', (e) => {
            // Tip chip click
            const tipChip = e.target.closest('[data-tip-val]');
            if (tipChip) {
                this.tipPercent = parseFloat(tipChip.dataset.tipVal) || 0;
                this._updateLiveUI();
                return;
            }

            // Stepper button click
            const stepBtn = e.target.closest('[data-step]');
            if (stepBtn) {
                const delta = parseInt(stepBtn.dataset.step, 10) || 0;
                this.people = Math.max(1, Math.min(30, this.people + delta));
                this._updateLiveUI();
                return;
            }
        });

        this.containerEl.addEventListener('input', (e) => {
            const slider = e.target.closest('[data-slider]');
            if (slider) {
                const type = slider.dataset.slider;
                if (type === 'bill') {
                    this.bill = parseFloat(slider.value) || 0;
                } else if (type === 'people') {
                    this.people = parseInt(slider.value, 10) || 1;
                }
                this._updateLiveUI();
            }
        });
    }
}
