/**
 * Gold Price Tracker Widget (.nexus-sol-gold-card)
 * Live world gold price (XAU/USD via Binance PAXG feed) with multi-timeframe charts,
 * cached klines, units (Ounce, Tael, Gram), and jitter-free realtime USD price tracking.
 */

const TIMEFRAMES = [
    { label: '24H', interval: '1h', limit: 24 },
    { label: '7D', interval: '4h', limit: 42 },
    { label: '1M', interval: '1d', limit: 30 },
    { label: '1Y', interval: '1w', limit: 52 }
];

export class GoldPriceWidget {
    constructor(containerEl, props = {}) {
        this.containerEl = containerEl;
        this.label = props.label || props.title || 'Gold Spot (XAU/USD)';

        // Supported units: 'oz' (Troy Ounce ~31.1035g), 'tael' (Tael ~37.5g), 'g' (Gram ~1g)
        this.activeUnit = this._normalizeUnit(props.unit);
        this.quantity = parseFloat(props.quantity || props.amount || 1) || 1;
        this.currentTimeframe = '24H';

        // Default & live state
        this.pricePerOz = 2875.50;
        this.changePercent = 0.85;
        this.high24h = 2892.00;
        this.low24h = 2860.20;
        this.volume24h = '$42.5M';
        this.chartPoints = [];
        this.klineCache = {}; // Cache kline data per timeframe to prevent flickering & network spam
        this.isFetchingKlines = false;
        this._eventsBound = false;

        this.render();
        this.bindEvents();
        this.fetchData();
    }

    _normalizeUnit(raw) {
        if (!raw) return 'oz';
        const u = String(raw).toLowerCase().trim();
        if (u === 'tael' || u === 'luong' || u === 'cay') return 'tael';
        if (u === 'g' || u === 'gram' || u === 'grams') return 'g';
        return 'oz';
    }

    _getUnitMultiplier() {
        if (this.activeUnit === 'tael') return 1.205653; // 37.5g / 31.1035g
        if (this.activeUnit === 'g') return 1 / 31.1034768; // 1g / 31.1035g
        return 1.0; // Troy Ounce
    }

    _formatUsd(val, decimals = 2) {
        if (isNaN(val)) return '$0.00';
        return '$' + Number(val.toFixed(decimals)).toLocaleString('en-US', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        });
    }

    async fetchData() {
        await Promise.all([
            this.fetch24hTicker(),
            this.fetchKlines()
        ]);
    }

    async fetch24hTicker() {
        try {
            const res = await fetch('https://api.binance.com/api/v3/ticker/24hr?symbol=PAXGUSDT');
            if (res.ok) {
                const data = await res.json();
                if (data && data.lastPrice) {
                    this.pricePerOz = parseFloat(data.lastPrice);
                    if (this.currentTimeframe === '24H') {
                        this.changePercent = parseFloat(data.priceChangePercent);
                    }
                    this.high24h = parseFloat(data.highPrice);
                    this.low24h = parseFloat(data.lowPrice);
                    const vol = parseFloat(data.quoteVolume);
                    this.volume24h = vol >= 1e9 ? `$${(vol / 1e9).toFixed(2)}B` : `$${(vol / 1e6).toFixed(1)}M`;
                    this._updateStatsUI();
                }
            }
        } catch (e) {
            console.warn('[GoldPriceWidget] 24h ticker fallback:', e);
        }
    }

    async fetchKlines(force = false) {
        const tf = TIMEFRAMES.find(t => t.label === this.currentTimeframe) || TIMEFRAMES[0];
        
        // Use cached kline points if available for instant switch without network latency/flicker
        if (!force && this.klineCache[tf.label] && this.klineCache[tf.label].length >= 2) {
            this.chartPoints = this.klineCache[tf.label];
            const first = this.chartPoints[0];
            const last = this.chartPoints[this.chartPoints.length - 1];
            this.changePercent = ((last - first) / first) * 100;
            this._updateChartUI();
            return;
        }

        if (this.isFetchingKlines) return;
        this.isFetchingKlines = true;

        try {
            const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=PAXGUSDT&interval=${tf.interval}&limit=${tf.limit}`);
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data) && data.length > 0) {
                    const pts = data.map(k => parseFloat(k[4]));
                    this.klineCache[tf.label] = pts;
                    this.chartPoints = pts;

                    if (this.chartPoints.length >= 2) {
                        const first = this.chartPoints[0];
                        const last = this.chartPoints[this.chartPoints.length - 1];
                        this.changePercent = ((last - first) / first) * 100;
                    }
                    this._updateChartUI();
                    return;
                }
            }
        } catch (e) {
            console.warn('[GoldPriceWidget] Kline chart fallback:', e);
        } finally {
            this.isFetchingKlines = false;
        }

        // Mock fallback points if network is unavailable
        this.chartPoints = [2860, 2865, 2862, 2870, 2878, 2872, 2875.5];
        this._updateChartUI();
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

    _generateChartSvg() {
        if (!this.chartPoints || this.chartPoints.length < 2) {
            return `<div class="nexus-gold-chart-empty">Loading chart...</div>`;
        }

        const isPositive = this.changePercent >= 0;
        const strokeColor = isPositive ? '#10b981' : '#f43f5e';
        const gradId = `goldChartGrad_${this.currentTimeframe}`;

        const multiplier = this._getUnitMultiplier();
        const ptsValues = this.chartPoints.map(p => p * multiplier);

        const min = Math.min(...ptsValues);
        const max = Math.max(...ptsValues);
        const range = max - min || 1;

        const w = 310;
        const h = 64;
        const padX = 6;
        const padY = 8;
        const chartW = w - (padX * 2);
        const chartH = h - (padY * 2);

        const stepX = chartW / Math.max(1, ptsValues.length - 1);
        const pts = ptsValues.map((val, idx) => ({
            x: padX + (idx * stepX),
            y: padY + chartH - (((val - min) / range) * chartH)
        }));

        const smoothLine = this._pointsToSmoothPath(pts);
        const smoothArea = `${smoothLine} L ${padX + chartW},${padY + chartH} L ${padX},${padY + chartH} Z`;
        const lastPt = pts[pts.length - 1];

        return `
            <svg class="nexus-gold-chart-svg" viewBox="0 0 ${w} ${h}" width="100%" height="${h}">
                <defs>
                    <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="${strokeColor}" stop-opacity="0.32"/>
                        <stop offset="70%" stop-color="${strokeColor}" stop-opacity="0.05"/>
                        <stop offset="100%" stop-color="${strokeColor}" stop-opacity="0.0"/>
                    </linearGradient>
                    <filter id="goldGlow" x="-20%" y="-20%" width="140%" height="140%">
                        <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="${strokeColor}" flood-opacity="0.4"/>
                    </filter>
                </defs>
                <path d="${smoothArea}" fill="url(#${gradId})" />
                <path d="${smoothLine}" fill="none" stroke="${strokeColor}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" filter="url(#goldGlow)" />
                <circle cx="${lastPt.x.toFixed(1)}" cy="${lastPt.y.toFixed(1)}" r="3" fill="#ffffff" stroke="${strokeColor}" stroke-width="1.5" />
            </svg>
        `;
    }

    render() {
        const isUp = this.changePercent >= 0;
        const changeStr = (isUp ? '+' : '') + this.changePercent.toFixed(2) + '%';
        const multiplier = this._getUnitMultiplier();
        const currentUnitPrice = this.pricePerOz * multiplier;
        const totalPrice = currentUnitPrice * this.quantity;

        const unitDisplayNames = {
            oz: 'Troy Ounce (oz)',
            tael: 'Tael (37.5g)',
            g: 'Gram (g)'
        };

        this.containerEl.innerHTML = `
            <div class="nexus-widget">
                <div class="nexus-sol-gold-card">
                    <!-- Top Bar -->
                    <div class="nexus-gold-top-bar">
                        <div class="nexus-widget-title-badge">
                            <span class="nexus-widget-status-dot is-running-amber"></span>
                            <span class="nexus-widget-title-text">${this.label}</span>
                        </div>
                        <div class="nexus-gold-actions">
                            <span class="nexus-gold-change-badge ${isUp ? 'is-up' : 'is-down'}" data-gold-change>${changeStr}</span>
                            <button type="button" class="nexus-gold-refresh-btn" data-action="refresh" title="Refresh live price">
                                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
                                </svg>
                            </button>
                        </div>
                    </div>

                    <!-- Unit Selector Tabs (English: Ounce, Tael, Gram) -->
                    <div class="nexus-gold-unit-tabs">
                        <button type="button" class="nexus-gold-unit-tab ${this.activeUnit === 'oz' ? 'is-active' : ''}" data-unit="oz">Ounce (oz)</button>
                        <button type="button" class="nexus-gold-unit-tab ${this.activeUnit === 'tael' ? 'is-active' : ''}" data-unit="tael">Tael (37.5g)</button>
                        <button type="button" class="nexus-gold-unit-tab ${this.activeUnit === 'g' ? 'is-active' : ''}" data-unit="g">Gram (g)</button>
                    </div>

                    <!-- Main Hero: Gold Price Display in USD -->
                    <div class="nexus-gold-hero-block">
                        <span class="nexus-gold-hero-label" data-unit-label>Spot Price / ${unitDisplayNames[this.activeUnit]}</span>
                        <div class="nexus-gold-hero-val-row">
                            <span class="nexus-gold-hero-val" data-gold-price-val>${this._formatUsd(currentUnitPrice)}</span>
                        </div>
                    </div>

                    <!-- Timeframe Switcher Tabs (24H, 7D, 1M, 1Y) -->
                    <div class="nexus-gold-timeframe-row">
                        ${TIMEFRAMES.map(tf => `
                            <button type="button" class="nexus-gold-tf-btn ${this.currentTimeframe === tf.label ? 'is-active' : ''}" data-tf="${tf.label}">
                                ${tf.label}
                            </button>
                        `).join('')}
                    </div>

                    <!-- Dynamic Live Chart Area -->
                    <div class="nexus-gold-chart-box" data-gold-chart-box>
                        ${this._generateChartSvg()}
                    </div>

                    <!-- Quantity Stepper & Calculator -->
                    <div class="nexus-gold-calc-box">
                        <div class="nexus-gold-calc-header">
                            <span class="nexus-gold-calc-label">Total for <strong data-qty-text>${this.quantity} ${this.activeUnit.toUpperCase()}</strong></span>
                            <div class="nexus-gold-stepper-row">
                                <button type="button" class="nexus-gold-step-btn" data-step="-1">−</button>
                                <span class="nexus-gold-qty-display" data-qty-display>${this.quantity}</span>
                                <button type="button" class="nexus-gold-step-btn" data-step="1">+</button>
                            </div>
                        </div>
                        <div class="nexus-gold-calc-total-val" data-calc-total>
                            ${this._formatUsd(totalPrice)}
                        </div>
                    </div>

                    <!-- Stats Breakdown Footer (24h Low, High, Volume) -->
                    <div class="nexus-gold-summary-row">
                        <div class="nexus-gold-summary-item">
                            <span class="nexus-gold-summary-label">24h Low</span>
                            <span class="nexus-gold-summary-val" data-gold-low>${this._formatUsd(this.low24h * multiplier)}</span>
                        </div>
                        <div class="nexus-gold-summary-item">
                            <span class="nexus-gold-summary-label">24h High</span>
                            <span class="nexus-gold-summary-val" data-gold-high>${this._formatUsd(this.high24h * multiplier)}</span>
                        </div>
                        <div class="nexus-gold-summary-item">
                            <span class="nexus-gold-summary-label">24h Volume</span>
                            <span class="nexus-gold-summary-val" data-gold-vol>${this.volume24h}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    _updateStatsUI() {
        const isUp = this.changePercent >= 0;
        const changeStr = (isUp ? '+' : '') + this.changePercent.toFixed(2) + '%';
        const multiplier = this._getUnitMultiplier();
        const currentUnitPrice = this.pricePerOz * multiplier;

        const unitDisplayNames = {
            oz: 'Troy Ounce (oz)',
            tael: 'Tael (37.5g)',
            g: 'Gram (g)'
        };

        const unitLabelEl = this.containerEl.querySelector('[data-unit-label]');
        if (unitLabelEl) unitLabelEl.textContent = `Spot Price / ${unitDisplayNames[this.activeUnit]}`;

        const changeEl = this.containerEl.querySelector('[data-gold-change]');
        if (changeEl) {
            changeEl.textContent = changeStr;
            changeEl.className = `nexus-gold-change-badge ${isUp ? 'is-up' : 'is-down'}`;
        }

        const priceEl = this.containerEl.querySelector('[data-gold-price-val]');
        if (priceEl) priceEl.textContent = this._formatUsd(currentUnitPrice);

        const qtyText = this.containerEl.querySelector('[data-qty-text]');
        if (qtyText) qtyText.textContent = `${this.quantity} ${this.activeUnit.toUpperCase()}`;

        const qtyDisp = this.containerEl.querySelector('[data-qty-display]');
        if (qtyDisp) qtyDisp.textContent = `${this.quantity}`;

        const calcTotal = this.containerEl.querySelector('[data-calc-total]');
        if (calcTotal) calcTotal.textContent = this._formatUsd(currentUnitPrice * this.quantity);

        const lowEl = this.containerEl.querySelector('[data-gold-low]');
        if (lowEl) lowEl.textContent = this._formatUsd(this.low24h * multiplier);

        const highEl = this.containerEl.querySelector('[data-gold-high]');
        if (highEl) highEl.textContent = this._formatUsd(this.high24h * multiplier);

        const volEl = this.containerEl.querySelector('[data-gold-vol]');
        if (volEl) volEl.textContent = this.volume24h;
    }

    _updateChartUI() {
        this._updateStatsUI();
        const chartBox = this.containerEl.querySelector('[data-gold-chart-box]');
        if (chartBox) {
            chartBox.innerHTML = this._generateChartSvg();
        }
    }

    bindEvents() {
        if (this._eventsBound) return;
        this._eventsBound = true;

        this.containerEl.addEventListener('click', (e) => {
            // Unit switch (In-place update without re-binding)
            const unitTab = e.target.closest('[data-unit]');
            if (unitTab) {
                this.activeUnit = unitTab.dataset.unit;
                const allTabs = this.containerEl.querySelectorAll('.nexus-gold-unit-tab');
                allTabs.forEach(t => {
                    if (t.dataset.unit === this.activeUnit) {
                        t.classList.add('is-active');
                    } else {
                        t.classList.remove('is-active');
                    }
                });
                this._updateChartUI();
                return;
            }

            // Timeframe switch (Cached & In-place update)
            const tfBtn = e.target.closest('[data-tf]');
            if (tfBtn) {
                this.currentTimeframe = tfBtn.dataset.tf;
                const allTf = this.containerEl.querySelectorAll('.nexus-gold-tf-btn');
                allTf.forEach(btn => {
                    if (btn.dataset.tf === this.currentTimeframe) {
                        btn.classList.add('is-active');
                    } else {
                        btn.classList.remove('is-active');
                    }
                });
                this.fetchKlines();
                return;
            }

            // Quantity stepper (In-place update)
            const stepBtn = e.target.closest('[data-step]');
            if (stepBtn) {
                const delta = parseInt(stepBtn.dataset.step, 10) || 0;
                this.quantity = Math.max(1, Math.min(1000, this.quantity + delta));
                this._updateStatsUI();
                return;
            }

            // Refresh button
            const refreshBtn = e.target.closest('[data-action="refresh"]');
            if (refreshBtn) {
                refreshBtn.style.opacity = '0.5';
                setTimeout(() => { refreshBtn.style.opacity = '1'; }, 300);
                this.klineCache = {}; // Clear cache on explicit user refresh
                this.fetchData();
                return;
            }
        });
    }
}
