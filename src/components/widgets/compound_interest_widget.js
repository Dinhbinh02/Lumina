/**
 * Compound Interest Growth Calculator Widget (.nexus-sol-compound-card)
 * Interactive multi-year growth simulator with dynamic SVG growth chart.
 */
export class CompoundInterestWidget {
    constructor(containerEl, props = {}) {
        this.containerEl = containerEl;
        this.label = props.label || props.title || 'Compound Growth';

        // Parse initial values with smart defaults
        const rawInitial = parseFloat(props.initial || props.principal || props.initial_amount);
        const rawMonthly = parseFloat(props.monthly || props.deposit || props.monthly_deposit);
        const rawRate = parseFloat(props.rate || props.interest || props.annual_rate);
        const rawYears = parseInt(props.years || props.term || props.duration, 10);

        let cur = (props.currency || props.unit || '').toUpperCase().trim();
        if (!cur) {
            cur = (props.isVnd === true || (!isNaN(rawInitial) && rawInitial > 1000) || (!isNaN(rawMonthly) && rawMonthly > 1000)) ? 'VND' : 'USD';
        }
        this.currency = cur;
        this.isVnd = this.currency === 'VND' || this.currency === 'Đ' || this.currency === 'VNĐ';

        this.initial = !isNaN(rawInitial) ? rawInitial : (this.isVnd ? 50000000 : 5000);
        this.monthly = !isNaN(rawMonthly) ? rawMonthly : (this.isVnd ? 5000000 : 500);
        this.rate = !isNaN(rawRate) ? rawRate : 10.0;
        this.years = !isNaN(rawYears) && rawYears >= 1 ? Math.min(40, rawYears) : 10;

        this.render();
        this.bindEvents();
    }

    _formatMoney(val) {
        if (isNaN(val)) return '0';
        if (this.isVnd) {
            return Math.round(val).toLocaleString('vi-VN') + ' đ';
        }
        if (this.currency === 'USD' || this.currency === '$') {
            return '$' + Number(val.toFixed(0)).toLocaleString('en-US');
        }
        if (this.currency === 'EUR' || this.currency === '€') {
            return '€' + Number(val.toFixed(0)).toLocaleString('de-DE');
        }
        if (this.currency === 'GBP' || this.currency === '£') {
            return '£' + Number(val.toFixed(0)).toLocaleString('en-GB');
        }
        return Number(val.toFixed(0)).toLocaleString('en-US') + ' ' + this.currency;
    }

    _calculateGrowth() {
        const r = this.rate / 100 / 12;
        const totalMonths = this.years * 12;

        let totalDeposits = this.initial + (this.monthly * totalMonths);
        let futureValue = this.initial * Math.pow(1 + r, totalMonths);

        if (r > 0) {
            futureValue += this.monthly * ((Math.pow(1 + r, totalMonths) - 1) / r);
        } else {
            futureValue = totalDeposits;
        }

        const totalInterest = Math.max(0, futureValue - totalDeposits);

        // Yearly trajectory for SVG Chart
        const trajectory = [];
        for (let y = 1; y <= this.years; y++) {
            const m = y * 12;
            let fv = this.initial * Math.pow(1 + r, m);
            if (r > 0) {
                fv += this.monthly * ((Math.pow(1 + r, m) - 1) / r);
            } else {
                fv = this.initial + (this.monthly * m);
            }
            const dep = this.initial + (this.monthly * m);
            trajectory.push({
                year: y,
                deposits: dep,
                total: fv,
                interest: Math.max(0, fv - dep)
            });
        }

        return {
            totalDeposits,
            totalInterest,
            futureValue,
            trajectory
        };
    }

    _pointsToSmoothPath(pts) {
        if (pts.length === 0) return '';
        if (pts.length === 1) return `M ${pts[0].x},${pts[0].y}`;
        let d = `M ${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
        for (let i = 0; i < pts.length - 1; i++) {
            const p0 = pts[Math.max(0, i - 1)];
            const p1 = pts[i];
            const p2 = pts[i + 1];
            const p3 = pts[Math.min(pts.length - 1, i + 2)];

            const cp1x = p1.x + (p2.x - p0.x) / 6;
            const cp1y = p1.y + (p2.y - p0.y) / 6;
            const cp2x = p2.x - (p3.x - p1.x) / 6;
            const cp2y = p2.y - (p3.y - p1.y) / 6;

            d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
        }
        return d;
    }

    _generateChartSvg(trajectory, futureValue) {
        if (!trajectory || trajectory.length === 0) return '';

        const maxVal = Math.max(1, futureValue);
        const svgW = 310;
        const svgH = 72;
        const padX = 6;
        const padY = 8;
        const chartW = svgW - (padX * 2);
        const chartH = svgH - (padY * 2);

        const numPoints = trajectory.length;
        const stepX = chartW / Math.max(1, numPoints - 1);

        // Map Total FV points
        const totalPts = trajectory.map((item, idx) => ({
            x: padX + (idx * stepX),
            y: padY + chartH - ((item.total / maxVal) * chartH)
        }));

        // Map Principal Deposit points
        const depPts = trajectory.map((item, idx) => ({
            x: padX + (idx * stepX),
            y: padY + chartH - ((item.deposits / maxVal) * chartH)
        }));

        const smoothTotalLine = this._pointsToSmoothPath(totalPts);
        const smoothTotalArea = `${smoothTotalLine} L ${padX + chartW},${padY + chartH} L ${padX},${padY + chartH} Z`;
        const depLine = `M ${depPts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L ')}`;

        const lastTotal = totalPts[totalPts.length - 1];

        return `
            <svg class="nexus-compound-chart-svg" viewBox="0 0 ${svgW} ${svgH}" width="100%" height="${svgH}">
                <defs>
                    <linearGradient id="nexusGrowthGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="#10b981" stop-opacity="0.32"/>
                        <stop offset="70%" stop-color="#10b981" stop-opacity="0.06"/>
                        <stop offset="100%" stop-color="#10b981" stop-opacity="0.0"/>
                    </linearGradient>
                    <filter id="nexusGlow" x="-20%" y="-20%" width="140%" height="140%">
                        <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#10b981" flood-opacity="0.45"/>
                    </filter>
                </defs>
                <!-- Smooth Area Gradient -->
                <path d="${smoothTotalArea}" fill="url(#nexusGrowthGrad)" />
                <!-- Principal Benchmark Baseline (Clean Dashed Guide) -->
                <path d="${depLine}" fill="none" stroke="rgba(255, 255, 255, 0.2)" stroke-width="1.2" stroke-dasharray="3,3" />
                <!-- Top Glowing Growth Line -->
                <path d="${smoothTotalLine}" fill="none" stroke="#10b981" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" filter="url(#nexusGlow)" />
                <!-- End Value Pulsing Dot -->
                <circle cx="${lastTotal.x.toFixed(1)}" cy="${lastTotal.y.toFixed(1)}" r="3" fill="#ffffff" stroke="#10b981" stroke-width="1.5" />
            </svg>
        `;
    }

    render() {
        const data = this._calculateGrowth();

        this.containerEl.innerHTML = `
            <div class="nexus-widget">
                <div class="nexus-sol-compound-card">
                    <!-- Top Bar -->
                    <div class="nexus-compound-top-bar">
                        <div class="nexus-widget-title-badge">
                            <span class="nexus-widget-status-dot is-running-emerald"></span>
                            <span class="nexus-widget-title-text">${this.label}</span>
                        </div>
                    </div>

                    <!-- Main Hero: Total Future Value -->
                    <div class="nexus-compound-hero-block">
                        <span class="nexus-compound-hero-label">Total Future Balance</span>
                        <div class="nexus-compound-hero-val" data-fv-val>${this._formatMoney(data.futureValue)}</div>
                    </div>

                    <!-- Dynamic SVG Growth Trajectory Chart -->
                    <div class="nexus-compound-chart-box" data-chart-box>
                        ${this._generateChartSvg(data.trajectory, data.futureValue)}
                    </div>

                    <!-- Interactive Control Sliders -->
                    <div class="nexus-compound-controls">
                        <!-- Initial Principal -->
                        <div class="nexus-compound-control-row">
                            <div class="nexus-compound-control-header">
                                <span class="nexus-compound-label">Initial Principal</span>
                                <span class="nexus-compound-num-display" data-initial-display>${this._formatMoney(this.initial)}</span>
                            </div>
                            <input type="range" class="nexus-compound-slider" min="0" max="${this.isVnd ? 1000000000 : 100000}" step="${this.isVnd ? 5000000 : 500}" value="${this.initial}" data-slider="initial" />
                        </div>

                        <!-- Monthly Contribution -->
                        <div class="nexus-compound-control-row">
                            <div class="nexus-compound-control-header">
                                <span class="nexus-compound-label">Monthly Deposit</span>
                                <span class="nexus-compound-num-display" data-monthly-display>${this._formatMoney(this.monthly)}</span>
                            </div>
                            <input type="range" class="nexus-compound-slider" min="0" max="${this.isVnd ? 100000000 : 10000}" step="${this.isVnd ? 500000 : 50}" value="${this.monthly}" data-slider="monthly" />
                        </div>

                        <!-- Annual Return % -->
                        <div class="nexus-compound-control-row">
                            <div class="nexus-compound-control-header">
                                <span class="nexus-compound-label">Annual Return</span>
                                <span class="nexus-compound-num-display" data-rate-display>${this.rate.toFixed(1)}% / yr</span>
                            </div>
                            <input type="range" class="nexus-compound-slider" min="1" max="25" step="0.5" value="${this.rate}" data-slider="rate" />
                        </div>

                        <!-- Investment Horizon (Years) -->
                        <div class="nexus-compound-control-row">
                            <div class="nexus-compound-control-header">
                                <span class="nexus-compound-label">Time Horizon</span>
                                <span class="nexus-compound-num-display" data-years-display>${this.years} Years</span>
                            </div>
                            <input type="range" class="nexus-compound-slider" min="1" max="40" step="1" value="${this.years}" data-slider="years" />
                        </div>
                    </div>

                    <!-- Summary Stats Footer -->
                    <div class="nexus-compound-summary-row">
                        <div class="nexus-compound-summary-item">
                            <span class="nexus-compound-summary-label">Total Deposits</span>
                            <span class="nexus-compound-summary-val" data-sum-deposits>${this._formatMoney(data.totalDeposits)}</span>
                        </div>
                        <div class="nexus-compound-summary-item">
                            <span class="nexus-compound-summary-label">Total Interest</span>
                            <span class="nexus-compound-summary-val is-emerald" data-sum-interest>+${this._formatMoney(data.totalInterest)}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    _updateLiveUI() {
        const data = this._calculateGrowth();

        const fvEl = this.containerEl.querySelector('[data-fv-val]');
        if (fvEl) fvEl.textContent = this._formatMoney(data.futureValue);

        const initDisp = this.containerEl.querySelector('[data-initial-display]');
        if (initDisp) initDisp.textContent = this._formatMoney(this.initial);

        const mDisp = this.containerEl.querySelector('[data-monthly-display]');
        if (mDisp) mDisp.textContent = this._formatMoney(this.monthly);

        const rateDisp = this.containerEl.querySelector('[data-rate-display]');
        if (rateDisp) rateDisp.textContent = `${this.rate.toFixed(1)}% / yr`;

        const yrsDisp = this.containerEl.querySelector('[data-years-display]');
        if (yrsDisp) yrsDisp.textContent = `${this.years} Years`;

        const chartBox = this.containerEl.querySelector('[data-chart-box]');
        if (chartBox) chartBox.innerHTML = this._generateChartSvg(data.trajectory, data.futureValue);

        const sumDep = this.containerEl.querySelector('[data-sum-deposits]');
        const sumInt = this.containerEl.querySelector('[data-sum-interest]');
        if (sumDep) sumDep.textContent = this._formatMoney(data.totalDeposits);
        if (sumInt) sumInt.textContent = `+${this._formatMoney(data.totalInterest)}`;
    }

    bindEvents() {
        this.containerEl.addEventListener('input', (e) => {
            const slider = e.target.closest('[data-slider]');
            if (slider) {
                const type = slider.dataset.slider;
                if (type === 'initial') {
                    this.initial = parseFloat(slider.value) || 0;
                } else if (type === 'monthly') {
                    this.monthly = parseFloat(slider.value) || 0;
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
