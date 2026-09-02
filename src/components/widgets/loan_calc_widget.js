// Nexus Loan & Mortgage Amortization Calculator Widget
// Interactive sliders, monthly annuity payment & principal/interest visual breakdown

export class NexusLoanCalcWidget {
    constructor(containerEl, props = {}) {
        this.containerEl = containerEl;
        this.label = 'Loan Calculator';

        // Initial values with defaults
        const rawAmount = parseFloat(props.amount || props.principal || 1000000000);
        this.amount = isNaN(rawAmount) || rawAmount <= 0 ? 1000000000 : rawAmount; // 1 tỷ VND default or custom
        this.rate = Math.max(0.1, Math.min(30, parseFloat(props.rate || props.interest || 8.0) || 8.0));
        this.years = Math.max(1, Math.min(35, parseInt(props.years || props.term || 15, 10) || 15));
        this.isVnd = this.amount >= 1000000; // Auto-detect VND vs USD based on magnitude

        this.render();
        this.bindEvents();
    }

    _calculateAmortization() {
        const P = this.amount;
        const annualRate = this.rate / 100;
        const monthlyRate = annualRate / 12;
        const totalMonths = this.years * 12;

        let monthlyPayment = 0;
        if (monthlyRate === 0) {
            monthlyPayment = P / totalMonths;
        } else {
            const factor = Math.pow(1 + monthlyRate, totalMonths);
            monthlyPayment = (P * monthlyRate * factor) / (factor - 1);
        }

        const totalPayment = monthlyPayment * totalMonths;
        const totalInterest = Math.max(0, totalPayment - P);
        const principalRatio = totalPayment > 0 ? (P / totalPayment) * 100 : 100;
        const interestRatio = 100 - principalRatio;

        return {
            monthlyPayment,
            totalPayment,
            totalInterest,
            principalRatio,
            interestRatio,
            totalMonths
        };
    }

    _formatMoney(val) {
        if (isNaN(val)) return '0';
        if (this.isVnd) {
            return Math.round(val).toLocaleString('vi-VN') + ' đ';
        }
        return '$' + Number(val.toFixed(0)).toLocaleString('en-US');
    }

    render() {
        const data = this._calculateAmortization();

        this.containerEl.innerHTML = `
            <div class="nexus-widget">
                <div class="nexus-sol-loan-card">
                    <!-- Top Bar: Universal Title Badge & Reset -->
                    <div class="nexus-loan-top-bar">
                        <div class="nexus-widget-title-badge">
                            <span class="nexus-widget-status-dot is-running-cyan"></span>
                            <span class="nexus-widget-title-text">${this.label}</span>
                        </div>
                    </div>

                    <!-- Main Hero: Monthly Payment (Left-aligned & Structured) -->
                    <div class="nexus-loan-hero-block">
                        <span class="nexus-loan-hero-label">Estimated Monthly Payment</span>
                        <div class="nexus-loan-hero-val-row">
                            <span class="nexus-loan-hero-val" data-monthly-val>${this._formatMoney(data.monthlyPayment)}</span>
                            <span class="nexus-loan-hero-per">/ mo</span>
                        </div>
                    </div>

                    <!-- Visual Principal vs Interest Ratio Bar -->
                    <div class="nexus-loan-ratio-wrap">
                        <div class="nexus-loan-ratio-bar" title="Principal (Blue) vs Interest (Amber) Ratio">
                            <div class="nexus-loan-ratio-segment is-principal" style="flex: ${data.principalRatio.toFixed(2)}; width: auto;" data-bar-principal></div>
                            <div class="nexus-loan-ratio-segment is-interest" style="flex: ${data.interestRatio.toFixed(2)}; width: auto;" data-bar-interest></div>
                        </div>
                    </div>

                    <!-- Interactive Control Sliders -->
                    <div class="nexus-loan-controls">
                        <!-- Loan Amount Control -->
                        <div class="nexus-loan-control-row">
                            <div class="nexus-loan-control-header">
                                <span class="nexus-loan-label">Loan Amount</span>
                                <span class="nexus-loan-num-display" data-amount-display>${this._formatMoney(this.amount)}</span>
                            </div>
                            <input type="range" class="nexus-loan-slider" min="${this.isVnd ? 50000000 : 5000}" max="${this.isVnd ? 10000000000 : 1000000}" step="${this.isVnd ? 50000000 : 5000}" value="${this.amount}" data-slider="amount" />
                        </div>

                        <!-- Interest Rate Control -->
                        <div class="nexus-loan-control-row">
                            <div class="nexus-loan-control-header">
                                <span class="nexus-loan-label">Interest Rate</span>
                                <span class="nexus-loan-num-display" data-rate-display>${this.rate.toFixed(1)}% / yr</span>
                            </div>
                            <input type="range" class="nexus-loan-slider" min="1" max="20" step="0.1" value="${this.rate}" data-slider="rate" />
                        </div>

                        <!-- Term Control -->
                        <div class="nexus-loan-control-row">
                            <div class="nexus-loan-control-header">
                                <span class="nexus-loan-label">Loan Term</span>
                                <span class="nexus-loan-num-display" data-years-display>${this.years} Years (${data.totalMonths} mos)</span>
                            </div>
                            <input type="range" class="nexus-loan-slider" min="1" max="30" step="1" value="${this.years}" data-slider="years" />
                        </div>
                    </div>

                    <!-- Summary Stats Breakdown Footer (2 Columns: Interest & Total) -->
                    <div class="nexus-loan-summary-row">
                        <div class="nexus-loan-summary-item">
                            <span class="nexus-loan-summary-label">Total Interest</span>
                            <span class="nexus-loan-summary-val is-amber" data-sum-interest>${this._formatMoney(data.totalInterest)}</span>
                        </div>
                        <div class="nexus-loan-summary-item">
                            <span class="nexus-loan-summary-label">Total Payment</span>
                            <span class="nexus-loan-summary-val" data-sum-total>${this._formatMoney(data.totalPayment)}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    _updateLiveUI() {
        const data = this._calculateAmortization();

        const monthlyEl = this.containerEl.querySelector('[data-monthly-val]');
        if (monthlyEl) monthlyEl.textContent = this._formatMoney(data.monthlyPayment);

        const amtDisp = this.containerEl.querySelector('[data-amount-display]');
        if (amtDisp) amtDisp.textContent = this._formatMoney(this.amount);

        const rateDisp = this.containerEl.querySelector('[data-rate-display]');
        if (rateDisp) rateDisp.textContent = `${this.rate.toFixed(1)}% / yr`;

        const yrsDisp = this.containerEl.querySelector('[data-years-display]');
        if (yrsDisp) yrsDisp.textContent = `${this.years} Years (${data.totalMonths} mos)`;

        const barP = this.containerEl.querySelector('[data-bar-principal]');
        const barI = this.containerEl.querySelector('[data-bar-interest]');
        if (barP) barP.style.flex = `${data.principalRatio.toFixed(2)}`;
        if (barI) barI.style.flex = `${data.interestRatio.toFixed(2)}`;

        const sumI = this.containerEl.querySelector('[data-sum-interest]');
        const sumT = this.containerEl.querySelector('[data-sum-total]');
        if (sumI) sumI.textContent = this._formatMoney(data.totalInterest);
        if (sumT) sumT.textContent = this._formatMoney(data.totalPayment);
    }

    bindEvents() {
        this.containerEl.addEventListener('input', (e) => {
            const slider = e.target.closest('[data-slider]');
            if (slider) {
                const type = slider.dataset.slider;
                if (type === 'amount') {
                    this.amount = parseFloat(slider.value) || 0;
                } else if (type === 'rate') {
                    this.rate = parseFloat(slider.value) || 0;
                } else if (type === 'years') {
                    this.years = parseInt(slider.value, 10) || 1;
                }
                this._updateLiveUI();
            }
        });
    }
}
