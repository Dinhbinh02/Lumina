// Nexus Crypto Tracker Widget
// Realtime price + multi-timeframe charts via Binance Public API
// Comprehensive 120+ Cryptocurrencies with Official Names and Full Binance Live Support

import { NexusSearchSelect } from '../ui/nexus_search_select.js';

export const POPULAR_CRYPTO = {
    // Top 30 Market Cap
    BTC: { name: 'Bitcoin', symbol: 'BTC', pair: 'BTCUSDT', defaultPrice: 78800 },
    ETH: { name: 'Ethereum', symbol: 'ETH', pair: 'ETHUSDT', defaultPrice: 3450 },
    SOL: { name: 'Solana', symbol: 'SOL', pair: 'SOLUSDT', defaultPrice: 165.5 },
    BNB: { name: 'BNB', symbol: 'BNB', pair: 'BNBUSDT', defaultPrice: 698.8 },
    XRP: { name: 'XRP', symbol: 'XRP', pair: 'XRPUSDT', defaultPrice: 0.58 },
    DOGE: { name: 'Dogecoin', symbol: 'DOGE', pair: 'DOGEUSDT', defaultPrice: 0.125 },
    ADA: { name: 'Cardano', symbol: 'ADA', pair: 'ADAUSDT', defaultPrice: 0.42 },
    AVAX: { name: 'Avalanche', symbol: 'AVAX', pair: 'AVAXUSDT', defaultPrice: 28.5 },
    SHIB: { name: 'Shiba Inu', symbol: 'SHIB', pair: 'SHIBUSDT', defaultPrice: 0.000018 },
    DOT: { name: 'Polkadot', symbol: 'DOT', pair: 'DOTUSDT', defaultPrice: 6.2 },
    LINK: { name: 'Chainlink', symbol: 'LINK', pair: 'LINKUSDT', defaultPrice: 14.8 },
    NEAR: { name: 'NEAR Protocol', symbol: 'NEAR', pair: 'NEARUSDT', defaultPrice: 5.4 },
    SUI: { name: 'Sui', symbol: 'SUI', pair: 'SUIUSDT', defaultPrice: 2.1 },
    APT: { name: 'Aptos', symbol: 'APT', pair: 'APTUSDT', defaultPrice: 9.8 },
    TON: { name: 'Toncoin', symbol: 'TON', pair: 'TONUSDT', defaultPrice: 5.6 },
    PEPE: { name: 'Pepe', symbol: 'PEPE', pair: 'PEPEUSDT', defaultPrice: 0.0000095 },
    UNI: { name: 'Uniswap', symbol: 'UNI', pair: 'UNIUSDT', defaultPrice: 7.8 },
    LTC: { name: 'Litecoin', symbol: 'LTC', pair: 'LTCUSDT', defaultPrice: 72.5 },
    ATOM: { name: 'Cosmos', symbol: 'ATOM', pair: 'ATOMUSDT', defaultPrice: 5.1 },
    XLM: { name: 'Stellar', symbol: 'XLM', pair: 'XLMUSDT', defaultPrice: 0.11 },
    TRX: { name: 'TRON', symbol: 'TRX', pair: 'TRXUSDT', defaultPrice: 0.16 },
    ARB: { name: 'Arbitrum', symbol: 'ARB', pair: 'ARBUSDT', defaultPrice: 0.58 },
    OP: { name: 'Optimism', symbol: 'OP', pair: 'OPUSDT', defaultPrice: 1.65 },
    POL: { name: 'Polygon Ecosystem Token', symbol: 'POL', pair: 'POLUSDT', defaultPrice: 0.41 },
    RENDER: { name: 'Render', symbol: 'RENDER', pair: 'RENDERUSDT', defaultPrice: 6.2 },
    FET: { name: 'Artificial Superintelligence', symbol: 'FET', pair: 'FETUSDT', defaultPrice: 1.45 },
    TAO: { name: 'Bittensor', symbol: 'TAO', pair: 'TAOUSDT', defaultPrice: 540 },
    AAVE: { name: 'Aave', symbol: 'AAVE', pair: 'AAVEUSDT', defaultPrice: 165 },
    INJ: { name: 'Injective', symbol: 'INJ', pair: 'INJUSDT', defaultPrice: 22.4 },
    KAS: { name: 'Kaspa', symbol: 'KAS', pair: 'KASUSDT', defaultPrice: 0.14 },

    // Layer 1 / Layer 2 / Infra
    TIA: { name: 'Celestia', symbol: 'TIA', pair: 'TIAUSDT', defaultPrice: 6.2 },
    SEI: { name: 'Sei', symbol: 'SEI', pair: 'SEIUSDT', defaultPrice: 0.45 },
    STRK: { name: 'Starknet', symbol: 'STRK', pair: 'STRKUSDT', defaultPrice: 0.42 },
    W: { name: 'Wormhole', symbol: 'W', pair: 'WUSDT', defaultPrice: 0.31 },
    FTM: { name: 'Fantom', symbol: 'FTM', pair: 'FTMUSDT', defaultPrice: 0.72 },
    ICP: { name: 'Internet Computer', symbol: 'ICP', pair: 'ICPUSDT', defaultPrice: 8.5 },
    ALGO: { name: 'Algorand', symbol: 'ALGO', pair: 'ALGOUSDT', defaultPrice: 0.14 },
    HBAR: { name: 'Hedera', symbol: 'HBAR', pair: 'HBARUSDT', defaultPrice: 0.058 },
    STX: { name: 'Stacks', symbol: 'STX', pair: 'STXUSDT', defaultPrice: 1.75 },
    IMX: { name: 'Immutable', symbol: 'IMX', pair: 'IMXUSDT', defaultPrice: 1.45 },
    MANTA: { name: 'Manta Network', symbol: 'MANTA', pair: 'MANTAUSDT', defaultPrice: 0.85 },
    ALT: { name: 'AltLayer', symbol: 'ALT', pair: 'ALTUSDT', defaultPrice: 0.12 },
    DYM: { name: 'Dymension', symbol: 'DYM', pair: 'DYMUSDT', defaultPrice: 1.6 },
    RONIN: { name: 'Ronin', symbol: 'RONIN', pair: 'RONINUSDT', defaultPrice: 1.75 },
    ZK: { name: 'ZKsync', symbol: 'ZK', pair: 'ZKUSDT', defaultPrice: 0.14 },
    ZRO: { name: 'LayerZero', symbol: 'ZRO', pair: 'ZROUSDT', defaultPrice: 3.8 },

    // DeFi & RWA
    PENDLE: { name: 'Pendle', symbol: 'PENDLE', pair: 'PENDLEUSDT', defaultPrice: 4.8 },
    ONDO: { name: 'Ondo', symbol: 'ONDO', pair: 'ONDOUSDT', defaultPrice: 0.78 },
    ENA: { name: 'Ethena', symbol: 'ENA', pair: 'ENAUSDT', defaultPrice: 0.38 },
    JUP: { name: 'Jupiter', symbol: 'JUP', pair: 'JUPUSDT', defaultPrice: 0.88 },
    PYTH: { name: 'Pyth Network', symbol: 'PYTH', pair: 'PYTHUSDT', defaultPrice: 0.34 },
    RUNE: { name: 'THORChain', symbol: 'RUNE', pair: 'RUNEUSDT', defaultPrice: 5.2 },
    MKR: { name: 'Maker', symbol: 'MKR', pair: 'MKRUSDT', defaultPrice: 1650 },
    CRV: { name: 'Curve DAO', symbol: 'CRV', pair: 'CRVUSDT', defaultPrice: 0.32 },
    LDO: { name: 'Lido DAO', symbol: 'LDO', pair: 'LDOUSDT', defaultPrice: 1.25 },
    DYDX: { name: 'dYdX', symbol: 'DYDX', pair: 'DYDXUSDT', defaultPrice: 1.1 },
    GMX: { name: 'GMX', symbol: 'GMX', pair: 'GMXUSDT', defaultPrice: 28.5 },
    CAKE: { name: 'PancakeSwap', symbol: 'CAKE', pair: 'CAKEUSDT', defaultPrice: 1.85 },
    '1INCH': { name: '1inch Network', symbol: '1INCH', pair: '1INCHUSDT', defaultPrice: 0.28 },
    COMP: { name: 'Compound', symbol: 'COMP', pair: 'COMPUSDT', defaultPrice: 48.5 },
    SNX: { name: 'Synthetix', symbol: 'SNX', pair: 'SNXUSDT', defaultPrice: 1.55 },

    // Meme Coins
    WIF: { name: 'dogwifhat', symbol: 'WIF', pair: 'WIFUSDT', defaultPrice: 2.45 },
    BONK: { name: 'Bonk', symbol: 'BONK', pair: 'BONKUSDT', defaultPrice: 0.000022 },
    FLOKI: { name: 'Floki', symbol: 'FLOKI', pair: 'FLOKIUSDT', defaultPrice: 0.00015 },
    BOME: { name: 'BOOK OF MEME', symbol: 'BOME', pair: 'BOMEUSDT', defaultPrice: 0.0085 },
    MEME: { name: 'Memecoin', symbol: 'MEME', pair: 'MEMEUSDT', defaultPrice: 0.012 },
    PEOPLE: { name: 'ConstitutionDAO', symbol: 'PEOPLE', pair: 'PEOPLEUSDT', defaultPrice: 0.065 },
    NEIRO: { name: 'First Neiro on Ethereum', symbol: 'NEIRO', pair: 'NEIROUSDT', defaultPrice: 0.0018 },

    // AI & Big Data & Gaming
    WLD: { name: 'Worldcoin', symbol: 'WLD', pair: 'WLDUSDT', defaultPrice: 2.1 },
    ARKM: { name: 'Arkham', symbol: 'ARKM', pair: 'ARKMUSDT', defaultPrice: 1.65 },
    GALA: { name: 'GALA', symbol: 'GALA', pair: 'GALAUSDT', defaultPrice: 0.024 },
    SAND: { name: 'The Sandbox', symbol: 'SAND', pair: 'SANDUSDT', defaultPrice: 0.28 },
    MANA: { name: 'Decentraland', symbol: 'MANA', pair: 'MANAUSDT', defaultPrice: 0.32 },
    AXS: { name: 'Axie Infinity', symbol: 'AXS', pair: 'AXSUSDT', defaultPrice: 5.2 },
    BEAM: { name: 'Beam', symbol: 'BEAM', pair: 'BEAMXUSDT', defaultPrice: 0.018 },
    ILV: { name: 'Illuvium', symbol: 'ILV', pair: 'ILVUSDT', defaultPrice: 42.5 },
    JASMY: { name: 'JasmyCoin', symbol: 'JASMY', pair: 'JASMYUSDT', defaultPrice: 0.021 }
};

const TIMEFRAMES = [
    { label: '24H', interval: '1h', limit: 24 },
    { label: '7D', interval: '4h', limit: 42 },
    { label: '1M', interval: '1d', limit: 30 },
    { label: '1Y', interval: '1w', limit: 52 }
];

export class NexusCryptoWidget {
    static cachedBinanceCoins = null;

    constructor(containerEl, props = {}) {
        this.containerEl = containerEl;
        this.label = 'Crypto';

        let symbol = (props.symbol || props.coin || props.pair || 'BTC').toUpperCase().replace('USDT', '');
        this.currentCoin = symbol;
        this.currentTimeframe = '24H';

        const meta = this._getCoinMeta(this.currentCoin);
        this.price = meta.defaultPrice || 100;
        this.changePercent = 1.48;
        this.high24h = (meta.defaultPrice || 100) * 1.02;
        this.low24h = (meta.defaultPrice || 100) * 0.98;
        this.volume24h = '1.24B';
        this.chartPoints = [];
        this.isLoading = false;

        this.searchSelect = null;

        this.render();
        this.initSearchDropdown();
        this.bindEvents();
        this.fetchData();
        this.loadAllBinanceCoins();
    }

    _getCoinMeta(coin) {
        return POPULAR_CRYPTO[coin] || { name: coin, symbol: coin, pair: `${coin}USDT`, defaultPrice: 1 };
    }

    _formatPrice(val) {
        if (isNaN(val)) return '$0.00';
        if (val >= 1000) {
            return '$' + Number(val.toFixed(2)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }
        if (val >= 1) {
            return '$' + Number(val.toFixed(2)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
        }
        if (val >= 0.0001) {
            return '$' + Number(val.toFixed(6)).toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 6 });
        }
        return '$' + val.toFixed(8);
    }

    _buildSearchOptions() {
        if (NexusCryptoWidget.cachedBinanceCoins && NexusCryptoWidget.cachedBinanceCoins.length > 0) {
            return NexusCryptoWidget.cachedBinanceCoins;
        }

        return Object.keys(POPULAR_CRYPTO).map(c => {
            const m = POPULAR_CRYPTO[c];
            return {
                value: c,
                label: m.name,
                symbol: m.symbol,
                description: `${m.name} (${m.symbol})`
            };
        });
    }

    initSearchDropdown() {
        const searchContainer = this.containerEl.querySelector('[data-crypto-search-container]');
        if (!searchContainer) return;

        const options = this._buildSearchOptions();

        this.searchSelect = new NexusSearchSelect(searchContainer, {
            value: this.currentCoin,
            options: options,
            placeholder: 'Search 100+ cryptos on Binance...',
            width: '24px',
            popoverWidth: '235px',
            onChange: (coin) => {
                this.selectCoin(coin);
            }
        });
    }

    async loadAllBinanceCoins() {
        if (NexusCryptoWidget.cachedBinanceCoins) {
            if (this.searchSelect) this.searchSelect.setOptions(NexusCryptoWidget.cachedBinanceCoins);
            return;
        }

        try {
            const res = await fetch('https://api.binance.com/api/v3/ticker/price');
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data)) {
                    const usdtCoins = new Set();
                    data.forEach(item => {
                        if (item.symbol && item.symbol.endsWith('USDT')) {
                            const coin = item.symbol.slice(0, -4);
                            // Filter out leveraged derivative tokens and numeric multiplier tokens
                            if (coin && !coin.startsWith('1000') && !coin.includes('UP') && !coin.includes('DOWN') && !coin.includes('BEAR') && !coin.includes('BULL')) {
                                usdtCoins.add(coin);
                            }
                        }
                    });

                    // Prioritize curated coin map first, then add valid Binance coins
                    const known = Object.keys(POPULAR_CRYPTO);
                    const others = Array.from(usdtCoins).filter(c => !POPULAR_CRYPTO[c]).sort();
                    const all = [...known, ...others];

                    NexusCryptoWidget.cachedBinanceCoins = all.map(c => {
                        const meta = POPULAR_CRYPTO[c];
                        return {
                            value: c,
                            label: meta ? meta.name : c,
                            symbol: c,
                            description: meta ? `${meta.name} (${c})` : c
                        };
                    });

                    if (this.searchSelect) {
                        this.searchSelect.setOptions(NexusCryptoWidget.cachedBinanceCoins);
                    }
                }
            }
        } catch (e) {
            console.warn('[Nexus Crypto] Failed to load all Binance coins list:', e);
        }
    }

    selectCoin(coin) {
        if (!coin) return;
        this.currentCoin = coin;
        if (this.searchSelect) this.searchSelect.setValue(coin);
        this.render();
        this.initSearchDropdown();
        this.fetchData();
    }

    selectTimeframe(tf) {
        this.currentTimeframe = tf;
        this._updateTimeframeTabs();
        this.fetchKlines();
    }

    async fetchData() {
        await Promise.all([
            this.fetch24hTicker(),
            this.fetchKlines()
        ]);
    }

    async fetch24hTicker() {
        const meta = this._getCoinMeta(this.currentCoin);
        try {
            const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${meta.pair}`);
            if (res.ok) {
                const data = await res.json();
                if (data && data.lastPrice) {
                    this.price = parseFloat(data.lastPrice);
                    if (this.currentTimeframe === '24H') {
                        this.changePercent = parseFloat(data.priceChangePercent);
                    }
                    this.high24h = parseFloat(data.highPrice);
                    this.low24h = parseFloat(data.lowPrice);
                    const vol = parseFloat(data.quoteVolume);
                    this.volume24h = vol >= 1e9 ? `${(vol / 1e9).toFixed(2)}B` : `${(vol / 1e6).toFixed(2)}M`;
                    this._updateStatsUI();
                }
            }
        } catch (e) {
            console.warn('[Nexus Crypto] 24h ticker fallback:', e);
        }
    }

    async fetchKlines() {
        const meta = this._getCoinMeta(this.currentCoin);
        const tf = TIMEFRAMES.find(t => t.label === this.currentTimeframe) || TIMEFRAMES[0];

        try {
            const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${meta.pair}&interval=${tf.interval}&limit=${tf.limit}`);
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data) && data.length > 0) {
                    this.chartPoints = data.map(k => parseFloat(k[4]));

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
            console.warn('[Nexus Crypto] Kline chart fallback:', e);
        }

        this.chartPoints = [100, 101, 100.5, 102, 103.5, 102.8, 104.5];
        this._updateChartUI();
    }

    _generateChartSvg() {
        const isPositive = this.changePercent >= 0;
        const strokeColor = isPositive ? '#10b981' : '#f43f5e';
        const fillId = `cryptoGrad_${this.currentCoin}_${this.currentTimeframe}`;

        if (!this.chartPoints || this.chartPoints.length < 2) {
            return `<div class="nexus-crypto-chart-empty">Loading chart...</div>`;
        }

        const min = Math.min(...this.chartPoints);
        const max = Math.max(...this.chartPoints);
        const range = max - min || 1;

        const w = 314;
        const h = 54;
        const padding = 4;

        const pts = this.chartPoints.map((val, idx) => {
            const x = (idx / (this.chartPoints.length - 1)) * w;
            const y = h - padding - ((val - min) / range) * (h - padding * 2);
            return [x, y];
        });

        let pathD = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
        for (let i = 1; i < pts.length; i++) {
            const prev = pts[i - 1];
            const curr = pts[i];
            const mx = (prev[0] + curr[0]) / 2;
            pathD += ` C ${mx.toFixed(1)} ${prev[1].toFixed(1)}, ${mx.toFixed(1)} ${curr[1].toFixed(1)}, ${curr[0].toFixed(1)} ${curr[1].toFixed(1)}`;
        }

        const areaD = `${pathD} L ${w} ${h} L 0 ${h} Z`;

        return `
            <svg viewBox="0 0 ${w} ${h}" class="nexus-crypto-area-chart" preserveAspectRatio="none">
                <defs>
                    <linearGradient id="${fillId}" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="${strokeColor}" stop-opacity="0.25"></stop>
                        <stop offset="100%" stop-color="${strokeColor}" stop-opacity="0.0"></stop>
                    </linearGradient>
                </defs>
                <path d="${areaD}" fill="url(#${fillId})"></path>
                <path d="${pathD}" fill="none" stroke="${strokeColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
            </svg>
        `;
    }

    render() {
        const meta = this._getCoinMeta(this.currentCoin);
        const isPositive = this.changePercent >= 0;
        const changeSign = isPositive ? '+' : '';
        const changePillClass = isPositive ? 'is-positive' : 'is-negative';
        const top3Coins = ['BTC', 'ETH', 'SOL'];

        this.containerEl.innerHTML = `
            <div class="nexus-widget">
                <div class="nexus-sol-crypto-card">
                    <!-- Top Bar: Title & Integrated Pill Group (Top 3 + Search) -->
                    <div class="nexus-crypto-top-bar">
                        <div class="nexus-widget-title-badge">
                            <span class="nexus-widget-status-dot is-running-cyan"></span>
                            <span class="nexus-widget-title-text">${this.label}</span>
                        </div>
                        <div class="nexus-crypto-tabs-group">
                            ${top3Coins.map(k => `
                                <button type="button" class="nexus-crypto-tab-btn ${k === this.currentCoin ? 'is-active' : ''}" data-coin="${k}">
                                    ${k}
                                </button>
                            `).join('')}
                            <div class="nexus-crypto-search-slot" data-crypto-search-container></div>
                        </div>
                    </div>

                    <!-- Hero Price & Change Row -->
                    <div class="nexus-crypto-hero-row">
                        <div class="nexus-crypto-price-block">
                            <div class="nexus-crypto-name-row">
                                <span class="nexus-crypto-fullname">${meta.name}</span>
                                <span class="nexus-crypto-symbol-badge">${meta.symbol}</span>
                            </div>
                            <div class="nexus-crypto-price-val" data-price-display>
                                ${this._formatPrice(this.price)}
                            </div>
                        </div>

                        <div class="nexus-crypto-timeframe-block">
                            <div class="nexus-crypto-change-pill ${changePillClass}" data-change-pill>
                                <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                    ${isPositive ? '<polyline points="18 15 12 9 6 15"></polyline>' : '<polyline points="6 9 12 15 18 9"></polyline>'}
                                </svg>
                                <span data-change-text>${changeSign}${this.changePercent.toFixed(2)}%</span>
                            </div>
                            <!-- Timeframe Selector Tabs -->
                            <div class="nexus-crypto-timeframes">
                                ${TIMEFRAMES.map(tf => `
                                    <button type="button" class="nexus-crypto-tf-btn ${tf.label === this.currentTimeframe ? 'is-active' : ''}" data-timeframe="${tf.label}">
                                        ${tf.label}
                                    </button>
                                `).join('')}
                            </div>
                        </div>
                    </div>

                    <!-- Area Chart Visual -->
                    <div class="nexus-crypto-chart-container" data-chart-wrap>
                        ${this._generateChartSvg()}
                    </div>

                    <!-- Key 24h Stats Footer -->
                    <div class="nexus-crypto-stats-row">
                        <div class="nexus-crypto-stat-item">
                            <span class="nexus-crypto-stat-label">24h High</span>
                            <span class="nexus-crypto-stat-val" data-high-val>${this._formatPrice(this.high24h)}</span>
                        </div>
                        <div class="nexus-crypto-stat-item">
                            <span class="nexus-crypto-stat-label">24h Low</span>
                            <span class="nexus-crypto-stat-val" data-low-val>${this._formatPrice(this.low24h)}</span>
                        </div>
                        <div class="nexus-crypto-stat-item">
                            <span class="nexus-crypto-stat-label">24h Volume</span>
                            <span class="nexus-crypto-stat-val" data-vol-val>$${this.volume24h}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    _updateStatsUI() {
        const priceEl = this.containerEl.querySelector('[data-price-display]');
        if (priceEl) priceEl.textContent = this._formatPrice(this.price);

        const highEl = this.containerEl.querySelector('[data-high-val]');
        if (highEl) highEl.textContent = this._formatPrice(this.high24h);

        const lowEl = this.containerEl.querySelector('[data-low-val]');
        if (lowEl) lowEl.textContent = this._formatPrice(this.low24h);

        const volEl = this.containerEl.querySelector('[data-vol-val]');
        if (volEl) volEl.textContent = `$${this.volume24h}`;
    }

    _updateChartUI() {
        const isPositive = this.changePercent >= 0;
        const changeSign = isPositive ? '+' : '';

        const changePill = this.containerEl.querySelector('[data-change-pill]');
        if (changePill) {
            changePill.className = `nexus-crypto-change-pill ${isPositive ? 'is-positive' : 'is-negative'}`;
            changePill.innerHTML = `
                <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    ${isPositive ? '<polyline points="18 15 12 9 6 15"></polyline>' : '<polyline points="6 9 12 15 18 9"></polyline>'}
                </svg>
                <span data-change-text>${changeSign}${this.changePercent.toFixed(2)}%</span>
            `;
        }

        const chartWrap = this.containerEl.querySelector('[data-chart-wrap]');
        if (chartWrap) {
            chartWrap.innerHTML = this._generateChartSvg();
        }
    }

    _updateTimeframeTabs() {
        const tfBtns = this.containerEl.querySelectorAll('[data-timeframe]');
        tfBtns.forEach(btn => {
            btn.classList.toggle('is-active', btn.dataset.timeframe === this.currentTimeframe);
        });
    }

    bindEvents() {
        this.containerEl.addEventListener('click', (e) => {
            const coinBtn = e.target.closest('[data-coin]');
            if (coinBtn) {
                this.selectCoin(coinBtn.dataset.coin);
                return;
            }

            const tfBtn = e.target.closest('[data-timeframe]');
            if (tfBtn) {
                this.selectTimeframe(tfBtn.dataset.timeframe);
                return;
            }
        });
    }
}
