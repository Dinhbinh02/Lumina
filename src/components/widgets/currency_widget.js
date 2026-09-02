// Nexus Currency Converter Widget
// Supports 150+ World Currencies via Open Exchange Rates API with Shared UI NexusSearchSelect

import { NexusSearchSelect } from '../ui/nexus_search_select.js';

export const ALL_CURRENCIES = {
    // Major & Asia Pacific
    USD: { name: 'US Dollar', symbol: '$', flag: '🇺🇸', country: 'United States' },
    VND: { name: 'Vietnamese Dong', symbol: '₫', flag: '🇻🇳', country: 'Vietnam' },
    EUR: { name: 'Euro', symbol: '€', flag: '🇪🇺', country: 'European Union' },
    JPY: { name: 'Japanese Yen', symbol: '¥', flag: '🇯🇵', country: 'Japan' },
    GBP: { name: 'British Pound', symbol: '£', flag: '🇬🇧', country: 'United Kingdom' },
    CNY: { name: 'Chinese Yuan', symbol: '¥', flag: '🇨🇳', country: 'China' },
    KRW: { name: 'South Korean Won', symbol: '₩', flag: '🇰🇷', country: 'South Korea' },
    SGD: { name: 'Singapore Dollar', symbol: 'S$', flag: '🇸🇬', country: 'Singapore' },
    AUD: { name: 'Australian Dollar', symbol: 'A$', flag: '🇦🇺', country: 'Australia' },
    CAD: { name: 'Canadian Dollar', symbol: 'C$', flag: '🇨🇦', country: 'Canada' },
    CHF: { name: 'Swiss Franc', symbol: 'CHF', flag: '🇨🇭', country: 'Switzerland' },
    HKD: { name: 'Hong Kong Dollar', symbol: 'HK$', flag: '🇭🇰', country: 'Hong Kong' },
    TWD: { name: 'New Taiwan Dollar', symbol: 'NT$', flag: '🇹🇼', country: 'Taiwan' },
    THB: { name: 'Thai Baht', symbol: '฿', flag: '🇹🇭', country: 'Thailand' },
    MYR: { name: 'Malaysian Ringgit', symbol: 'RM', flag: '🇲🇾', country: 'Malaysia' },
    IDR: { name: 'Indonesian Rupiah', symbol: 'Rp', flag: '🇮🇩', country: 'Indonesia' },
    PHP: { name: 'Philippine Peso', symbol: '₱', flag: '🇵🇭', country: 'Philippines' },
    INR: { name: 'Indian Rupee', symbol: '₹', flag: '🇮🇳', country: 'India' },
    NZD: { name: 'New Zealand Dollar', symbol: 'NZ$', flag: '🇳🇿', country: 'New Zealand' },

    // Europe & Scandinavia
    SEK: { name: 'Swedish Krona', symbol: 'kr', flag: '🇸🇪', country: 'Sweden' },
    NOK: { name: 'Norwegian Krone', symbol: 'kr', flag: '🇳🇴', country: 'Norway' },
    DKK: { name: 'Danish Krone', symbol: 'kr', flag: '🇩🇰', country: 'Denmark' },
    PLN: { name: 'Polish Zloty', symbol: 'zł', flag: '🇵🇱', country: 'Poland' },
    CZK: { name: 'Czech Koruna', symbol: 'Kč', flag: '🇨🇿', country: 'Czech Republic' },
    HUF: { name: 'Hungarian Forint', symbol: 'Ft', flag: '🇭🇺', country: 'Hungary' },
    RON: { name: 'Romanian Leu', symbol: 'lei', flag: '🇷🇴', country: 'Romania' },
    RUB: { name: 'Russian Ruble', symbol: '₽', flag: '🇷🇺', country: 'Russia' },
    TRY: { name: 'Turkish Lira', symbol: '₺', flag: '🇹🇷', country: 'Turkey' },
    UAH: { name: 'Ukrainian Hryvnia', symbol: '₴', flag: '🇺🇦', country: 'Ukraine' },
    BGN: { name: 'Bulgarian Lev', symbol: 'лв', flag: '🇧🇬', country: 'Bulgaria' },
    HRK: { name: 'Croatian Kuna', symbol: 'kn', flag: '🇭🇷', country: 'Croatia' },
    RSD: { name: 'Serbian Dinar', symbol: 'din', flag: '🇷🇸', country: 'Serbia' },
    ISK: { name: 'Icelandic Króna', symbol: 'kr', flag: '🇮🇸', country: 'Iceland' },

    // Americas
    BRL: { name: 'Brazilian Real', symbol: 'R$', flag: '🇧🇷', country: 'Brazil' },
    MXN: { name: 'Mexican Peso', symbol: '$', flag: '🇲🇽', country: 'Mexico' },
    ARS: { name: 'Argentine Peso', symbol: '$', flag: '🇦🇷', country: 'Argentina' },
    CLP: { name: 'Chilean Peso', symbol: '$', flag: '🇨🇱', country: 'Chile' },
    COP: { name: 'Colombian Peso', symbol: '$', flag: '🇨🇴', country: 'Colombia' },
    PEN: { name: 'Peruvian Sol', symbol: 'S/.', flag: '🇵🇪', country: 'Peru' },
    CRC: { name: 'Costa Rican Colón', symbol: '₡', flag: '🇨🇷', country: 'Costa Rica' },
    DOP: { name: 'Dominican Peso', symbol: 'RD$', flag: '🇩🇴', country: 'Dominican Republic' },
    GTQ: { name: 'Guatemalan Quetzal', symbol: 'Q', flag: '🇬🇹', country: 'Guatemala' },
    PAB: { name: 'Panamanian Balboa', symbol: 'B/.', flag: '🇵🇦', country: 'Panama' },
    UYU: { name: 'Uruguayan Peso', symbol: '$U', flag: '🇺🇾', country: 'Uruguay' },
    BOB: { name: 'Bolivian Boliviano', symbol: 'Bs', flag: '🇧🇴', country: 'Bolivia' },
    PYG: { name: 'Paraguayan Guarani', symbol: '₲', flag: '🇵🇾', country: 'Paraguay' },
    JMD: { name: 'Jamaican Dollar', symbol: 'J$', flag: '🇯🇲', country: 'Jamaica' },
    TTD: { name: 'Trinidad and Tobago Dollar', symbol: 'TT$', flag: '🇹🇹', country: 'Trinidad' },
    BSD: { name: 'Bahamian Dollar', symbol: 'B$', flag: '🇧🇸', country: 'Bahamas' },
    BBD: { name: 'Barbadian Dollar', symbol: 'Bds$', flag: '🇧🇧', country: 'Barbados' },

    // Middle East & North Africa
    AED: { name: 'UAE Dirham', symbol: 'AED', flag: '🇦🇪', country: 'United Arab Emirates' },
    SAR: { name: 'Saudi Riyal', symbol: 'SAR', flag: '🇸🇦', country: 'Saudi Arabia' },
    QAR: { name: 'Qatari Riyal', symbol: 'QR', flag: '🇶🇦', country: 'Qatar' },
    KWD: { name: 'Kuwaiti Dinar', symbol: 'KD', flag: '🇰🇼', country: 'Kuwait' },
    BHD: { name: 'Bahraini Dinar', symbol: 'BD', flag: '🇧🇭', country: 'Bahrain' },
    OMR: { name: 'Omani Rial', symbol: 'OMR', flag: '🇴🇲', country: 'Oman' },
    ILS: { name: 'Israeli Shekel', symbol: '₪', flag: '🇮🇱', country: 'Israel' },
    JOD: { name: 'Jordanian Dinar', symbol: 'JD', flag: '🇯🇴', country: 'Jordan' },
    EGP: { name: 'Egyptian Pound', symbol: 'E£', flag: '🇪🇬', country: 'Egypt' },
    MAD: { name: 'Moroccan Dirham', symbol: 'MAD', flag: '🇲🇦', country: 'Morocco' },
    DZD: { name: 'Algerian Dinar', symbol: 'DA', flag: '🇩🇿', country: 'Algeria' },
    TND: { name: 'Tunisian Dinar', symbol: 'DT', flag: '🇹🇳', country: 'Tunisia' },
    LBP: { name: 'Lebanese Pound', symbol: 'L£', flag: '🇱🇧', country: 'Lebanon' },
    IQD: { name: 'Iraqi Dinar', symbol: 'IQD', flag: '🇮🇶', country: 'Iraq' },

    // Sub-Saharan Africa
    ZAR: { name: 'South African Rand', symbol: 'R', flag: '🇿🇦', country: 'South Africa' },
    NGN: { name: 'Nigerian Naira', symbol: '₦', flag: '🇳🇬', country: 'Nigeria' },
    KES: { name: 'Kenyan Shilling', symbol: 'KSh', flag: '🇰🇪', country: 'Kenya' },
    GHS: { name: 'Ghanaian Cedi', symbol: 'GH₵', flag: '🇬🇭', country: 'Ghana' },
    TZS: { name: 'Tanzanian Shilling', symbol: 'TSh', flag: '🇹🇿', country: 'Tanzania' },
    UGX: { name: 'Ugandan Shilling', symbol: 'USh', flag: '🇺🇬', country: 'Uganda' },
    MUR: { name: 'Mauritian Rupee', symbol: '₨', flag: '🇲🇺', country: 'Mauritius' },
    BWP: { name: 'Botswanan Pula', symbol: 'P', flag: '🇧🇼', country: 'Botswana' },
    XAF: { name: 'Central African CFA Franc', symbol: 'FCFA', flag: '🇨🇲', country: 'Central Africa' },
    XOF: { name: 'West African CFA Franc', symbol: 'CFA', flag: '🇸🇳', country: 'West Africa' },

    // Other Asia & Global
    PKR: { name: 'Pakistani Rupee', symbol: '₨', flag: '🇵🇰', country: 'Pakistan' },
    BDT: { name: 'Bangladeshi Taka', symbol: '৳', flag: '🇧🇩', country: 'Bangladesh' },
    LKR: { name: 'Sri Lankan Rupee', symbol: 'Rs', flag: '🇱🇰', country: 'Sri Lanka' },
    NPR: { name: 'Nepalese Rupee', symbol: '₨', flag: '🇳🇵', country: 'Nepal' },
    KZT: { name: 'Kazakhstani Tenge', symbol: '₸', flag: '🇰🇿', country: 'Kazakhstan' },
    UZS: { name: 'Uzbekistani Som', symbol: 'UZS', flag: '🇺🇿', country: 'Uzbekistan' },
    GEL: { name: 'Georgian Lari', symbol: '₾', flag: '🇬🇪', country: 'Georgia' },
    AZN: { name: 'Azerbaijani Manat', symbol: '₼', flag: '🇦🇿', country: 'Azerbaijan' },
    KHR: { name: 'Cambodian Riel', symbol: '៛', flag: '🇰🇭', country: 'Cambodia' },
    LAK: { name: 'Laotian Kip', symbol: '₭', flag: '🇱🇦', country: 'Laos' },
    MMK: { name: 'Myanmar Kyat', symbol: 'K', flag: '🇲🇲', country: 'Myanmar' },
    MOP: { name: 'Macanese Pataca', symbol: 'MOP$', flag: '🇲🇴', country: 'Macau' },
    BND: { name: 'Brunei Dollar', symbol: 'B$', flag: '🇧🇳', country: 'Brunei' },
    MNT: { name: 'Mongolian Tugrik', symbol: '₮', flag: '🇲🇳', country: 'Mongolia' },
    FJD: { name: 'Fijian Dollar', symbol: 'FJ$', flag: '🇫🇯', country: 'Fiji' }
};

const FALLBACK_USD_RATES = {
    USD: 1,
    VND: 25450,
    EUR: 0.92,
    JPY: 154.5,
    GBP: 0.78,
    CNY: 7.24,
    KRW: 1375,
    SGD: 1.35,
    AUD: 1.52,
    CAD: 1.36,
    CHF: 0.90,
    HKD: 7.82,
    TWD: 32.2,
    THB: 36.5,
    MYR: 4.72,
    IDR: 16250,
    PHP: 58.2,
    INR: 83.5,
    NZD: 1.66,
    SEK: 10.6,
    NOK: 10.8,
    DKK: 6.88,
    PLN: 3.95,
    CZK: 23.2,
    HUF: 365,
    RON: 4.58,
    RUB: 91.5,
    TRY: 33.0,
    BRL: 5.45,
    MXN: 18.2,
    ARS: 935,
    CLP: 940,
    COP: 4100,
    PEN: 3.75,
    AED: 3.67,
    SAR: 3.75,
    QAR: 3.64,
    KWD: 0.31,
    ILS: 3.72,
    ZAR: 18.3,
    EGP: 48.5
};

export class NexusCurrencyWidget {
    constructor(containerEl, props = {}) {
        this.containerEl = containerEl;
        this.label = 'Currency Converter';

        this.fromCurrency = (props.from || 'USD').toUpperCase();
        this.toCurrency = (props.to || 'VND').toUpperCase();

        this.amount = parseFloat(props.amount || props.value || 1) || 1;
        this.ratesMap = { ...FALLBACK_USD_RATES };

        this.fromSelect = null;
        this.toSelect = null;

        this.rate = this._calculateRate(this.fromCurrency, this.toCurrency);
        this.isLoading = false;

        this.render();
        this.initSelects();
        this.bindEvents();
        this.fetchLiveRates();
    }

    _getMeta(code) {
        return ALL_CURRENCIES[code] || { name: code, symbol: code, flag: '🌐', country: code };
    }

    _calculateRate(from, to) {
        const fromRate = this.ratesMap[from] || (FALLBACK_USD_RATES[from] ? 1 / FALLBACK_USD_RATES[from] : 1);
        const toRate = this.ratesMap[to] || (FALLBACK_USD_RATES[to] ? 1 / FALLBACK_USD_RATES[to] : 1);
        if (this.ratesMap[from] && this.ratesMap[to]) {
            return this.ratesMap[to] / this.ratesMap[from];
        }
        const fromUsd = FALLBACK_USD_RATES[from] || 1;
        const toUsd = FALLBACK_USD_RATES[to] || 1;
        return toUsd / fromUsd;
    }

    _buildSelectOptions() {
        const codes = Object.keys(ALL_CURRENCIES);
        if (this.ratesMap) {
            Object.keys(this.ratesMap).forEach(c => {
                if (!ALL_CURRENCIES[c]) codes.push(c);
            });
        }

        return codes.map(code => {
            const meta = this._getMeta(code);
            return {
                value: code,
                label: meta.name,
                flag: meta.flag,
                symbol: meta.symbol,
                country: meta.country || meta.name
            };
        });
    }

    initSelects() {
        const fromContainer = this.containerEl.querySelector('[data-from-select-container]');
        const toContainer = this.containerEl.querySelector('[data-to-select-container]');
        const options = this._buildSelectOptions();

        if (fromContainer) {
            this.fromSelect = new NexusSearchSelect(fromContainer, {
                value: this.fromCurrency,
                options: options,
                placeholder: 'Search currency or country...',
                width: '115px',
                popoverWidth: '245px',
                onChange: (val) => {
                    this.fromCurrency = val;
                    this.rate = this._calculateRate(this.fromCurrency, this.toCurrency);
                    this._updateOutput();
                    this._updateSymbolDisplay();
                    this.fetchLiveRates();
                }
            });
        }

        if (toContainer) {
            this.toSelect = new NexusSearchSelect(toContainer, {
                value: this.toCurrency,
                options: options,
                placeholder: 'Search currency or country...',
                width: '115px',
                popoverWidth: '245px',
                onChange: (val) => {
                    this.toCurrency = val;
                    this.rate = this._calculateRate(this.fromCurrency, this.toCurrency);
                    this._updateOutput();
                    this._updateSymbolDisplay();
                    this.fetchLiveRates();
                }
            });
        }
    }

    async fetchLiveRates() {
        this.isLoading = true;
        try {
            const res = await fetch(`https://open.er-api.com/v6/latest/${this.fromCurrency}`);
            if (res.ok) {
                const data = await res.json();
                if (data && data.rates) {
                    this.ratesMap = data.rates;
                    if (data.rates[this.toCurrency]) {
                        this.rate = data.rates[this.toCurrency];
                    } else {
                        this.rate = this._calculateRate(this.fromCurrency, this.toCurrency);
                    }

                    // Update option lists in selects
                    const options = this._buildSelectOptions();
                    if (this.fromSelect) this.fromSelect.setOptions(options);
                    if (this.toSelect) this.toSelect.setOptions(options);

                    this._updateRateDisplay();
                    this._updateOutput();
                }
            }
        } catch (e) {
            console.warn('[Nexus Currency] Using fallback rates:', e);
        } finally {
            this.isLoading = false;
        }
    }

    _formatNumber(val) {
        if (isNaN(val)) return '0';
        if (val >= 100) {
            return Number(val.toFixed(2)).toLocaleString('en-US', { maximumFractionDigits: 2 });
        }
        return Number(val.toFixed(4)).toLocaleString('en-US', { maximumFractionDigits: 4 });
    }

    render() {
        const converted = this.amount * this.rate;
        const fromMeta = this._getMeta(this.fromCurrency);
        const toMeta = this._getMeta(this.toCurrency);

        this.containerEl.innerHTML = `
            <div class="nexus-widget">
                <div class="nexus-sol-currency-card">
                    <!-- Top Bar: Universal Title Badge -->
                    <div class="nexus-currency-top-bar">
                        <div class="nexus-widget-title-badge">
                            <span class="nexus-widget-status-dot is-running-emerald"></span>
                            <span class="nexus-widget-title-text">${this.label}</span>
                        </div>
                        <span class="nexus-currency-rate-badge" data-rate-display>
                            1 ${this.fromCurrency} = ${this._formatNumber(this.rate)} ${this.toCurrency}
                        </span>
                    </div>

                    <!-- Main Conversion Body -->
                    <div class="nexus-currency-body">
                        <!-- From Currency Row -->
                        <div class="nexus-currency-row">
                            <div class="nexus-currency-input-box">
                                <span class="nexus-currency-symbol" data-from-symbol>${fromMeta.symbol}</span>
                                <input type="number" class="nexus-currency-input" value="${this.amount}" step="any" min="0" data-from-input />
                            </div>
                            <div data-from-select-container></div>
                        </div>

                        <!-- Quick Swap Button Divider -->
                        <div class="nexus-currency-divider">
                            <button type="button" class="nexus-currency-swap-btn" data-action="swap" title="Swap currencies">
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M7 10h14l-4-4"></path>
                                    <path d="M17 14H3l4 4"></path>
                                </svg>
                            </button>
                        </div>

                        <!-- To Currency Row -->
                        <div class="nexus-currency-row">
                            <div class="nexus-currency-input-box">
                                <span class="nexus-currency-symbol" data-to-symbol>${toMeta.symbol}</span>
                                <input type="number" class="nexus-currency-input" value="${Number(converted.toFixed(2))}" step="any" min="0" data-to-input />
                            </div>
                            <div data-to-select-container></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    _updateSymbolDisplay() {
        const fromSym = this.containerEl.querySelector('[data-from-symbol]');
        const toSym = this.containerEl.querySelector('[data-to-symbol]');
        if (fromSym) fromSym.textContent = this._getMeta(this.fromCurrency).symbol;
        if (toSym) toSym.textContent = this._getMeta(this.toCurrency).symbol;
    }

    _updateOutput() {
        const toInput = this.containerEl.querySelector('[data-to-input]');
        if (toInput) {
            const converted = this.amount * this.rate;
            toInput.value = Number(converted.toFixed(2));
        }
        this._updateRateDisplay();
    }

    _updateRateDisplay() {
        const rateEl = this.containerEl.querySelector('[data-rate-display]');
        if (rateEl) {
            rateEl.textContent = `1 ${this.fromCurrency} = ${this._formatNumber(this.rate)} ${this.toCurrency}`;
        }
    }

    bindEvents() {
        this.containerEl.addEventListener('input', (e) => {
            const fromInput = e.target.closest('[data-from-input]');
            if (fromInput) {
                this.amount = parseFloat(fromInput.value) || 0;
                this._updateOutput();
                return;
            }

            const toInput = e.target.closest('[data-to-input]');
            if (toInput) {
                const targetVal = parseFloat(toInput.value) || 0;
                this.amount = this.rate > 0 ? targetVal / this.rate : 0;
                const fromIn = this.containerEl.querySelector('[data-from-input]');
                if (fromIn) fromIn.value = Number(this.amount.toFixed(2));
            }
        });

        this.containerEl.addEventListener('click', (e) => {
            const swapBtn = e.target.closest('[data-action="swap"]');
            if (swapBtn) {
                const temp = this.fromCurrency;
                this.fromCurrency = this.toCurrency;
                this.toCurrency = temp;

                if (this.fromSelect) this.fromSelect.setValue(this.fromCurrency);
                if (this.toSelect) this.toSelect.setValue(this.toCurrency);

                this.rate = this._calculateRate(this.fromCurrency, this.toCurrency);
                this._updateSymbolDisplay();
                this._updateOutput();
                this.fetchLiveRates();
            }
        });
    }
}
