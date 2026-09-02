export class NexusUnitConverterWidget {
    constructor(containerEl, props = {}) {
        this.containerEl = containerEl;
        this.label = 'Unit Converter';

        this.categories = {
            length: {
                name: 'Length',
                base: 'm',
                units: {
                    m: { name: 'Meter (m)', factor: 1 },
                    km: { name: 'Kilometer (km)', factor: 1000 },
                    cm: { name: 'Centimeter (cm)', factor: 0.01 },
                    mm: { name: 'Millimeter (mm)', factor: 0.001 },
                    mi: { name: 'Mile (mi)', factor: 1609.344 },
                    yd: { name: 'Yard (yd)', factor: 0.9144 },
                    ft: { name: 'Foot (ft)', factor: 0.3048 },
                    in: { name: 'Inch (in)', factor: 0.0254 }
                }
            },
            weight: {
                name: 'Weight / Mass',
                base: 'kg',
                units: {
                    kg: { name: 'Kilogram (kg)', factor: 1 },
                    g: { name: 'Gram (g)', factor: 0.001 },
                    mg: { name: 'Milligram (mg)', factor: 0.000001 },
                    lb: { name: 'Pound (lb)', factor: 0.45359237 },
                    oz: { name: 'Ounce (oz)', factor: 0.028349523125 },
                    ton: { name: 'Metric Ton (t)', factor: 1000 }
                }
            },
            temperature: {
                name: 'Temperature',
                isSpecial: true,
                units: {
                    c: { name: 'Celsius (°C)' },
                    f: { name: 'Fahrenheit (°F)' },
                    k: { name: 'Kelvin (K)' }
                }
            },
            speed: {
                name: 'Speed',
                base: 'm/s',
                units: {
                    'm/s': { name: 'Meter/sec (m/s)', factor: 1 },
                    'km/h': { name: 'Km/hour (km/h)', factor: 1 / 3.6 },
                    'mph': { name: 'Miles/hour (mph)', factor: 0.44704 },
                    'knot': { name: 'Knot (kn)', factor: 0.514444 }
                }
            },
            volume: {
                name: 'Volume',
                base: 'l',
                units: {
                    l: { name: 'Liter (L)', factor: 1 },
                    ml: { name: 'Milliliter (mL)', factor: 0.001 },
                    gal: { name: 'US Gallon (gal)', factor: 3.78541 },
                    cup: { name: 'Cup (US)', factor: 0.236588 },
                    floz: { name: 'Fluid Ounce (fl oz)', factor: 0.0295735 }
                }
            },
            data: {
                name: 'Digital Data',
                base: 'B',
                units: {
                    B: { name: 'Bytes (B)', factor: 1 },
                    KB: { name: 'Kilobytes (KB)', factor: 1024 },
                    MB: { name: 'Megabytes (MB)', factor: 1024 ** 2 },
                    GB: { name: 'Gigabytes (GB)', factor: 1024 ** 3 },
                    TB: { name: 'Terabytes (TB)', factor: 1024 ** 4 }
                }
            },
            area: {
                name: 'Area',
                base: 'm2',
                units: {
                    m2: { name: 'Square Meter (m²)', factor: 1 },
                    km2: { name: 'Square Km (km²)', factor: 1000000 },
                    ha: { name: 'Hectare (ha)', factor: 10000 },
                    ft2: { name: 'Square Foot (ft²)', factor: 0.092903 },
                    ac: { name: 'Acre (ac)', factor: 4046.86 }
                }
            }
        };

        this.currentCategoryKey = this._detectCategory(props);
        const cat = this.categories[this.currentCategoryKey];
        const unitKeys = Object.keys(cat.units);

        this.fromUnit = (props.from || unitKeys[0]).toLowerCase();
        if (!cat.units[this.fromUnit]) this.fromUnit = unitKeys[0];

        this.toUnit = (props.to || unitKeys[1] || unitKeys[0]).toLowerCase();
        if (!cat.units[this.toUnit]) this.toUnit = unitKeys[1] || unitKeys[0];

        this.fromValue = props.value !== undefined && props.value !== '' ? parseFloat(props.value) : 1;
        if (isNaN(this.fromValue)) this.fromValue = 1;

        this.openDropdown = null; // 'category' | 'from' | 'to' | null

        this.render();
        this.bindEvents();
    }

    _detectCategory(props) {
        if (props.category && this.categories[props.category.toLowerCase()]) {
            return props.category.toLowerCase();
        }
        const from = (props.from || '').toLowerCase();
        const to = (props.to || '').toLowerCase();
        for (const [key, cat] of Object.entries(this.categories)) {
            if (cat.units[from] || cat.units[to]) return key;
        }
        return 'length';
    }

    _convert(val, fromKey, toKey, catKey) {
        if (isNaN(val)) return 0;
        const cat = this.categories[catKey];
        if (!cat) return val;

        if (cat.isSpecial && catKey === 'temperature') {
            let c = val;
            if (fromKey === 'f') c = (val - 32) * (5 / 9);
            else if (fromKey === 'k') c = val - 273.15;

            if (toKey === 'c') return c;
            if (toKey === 'f') return c * (9 / 5) + 32;
            if (toKey === 'k') return c + 273.15;
            return c;
        }

        const fromFactor = cat.units[fromKey]?.factor || 1;
        const toFactor = cat.units[toKey]?.factor || 1;
        const baseValue = val * fromFactor;
        return baseValue / toFactor;
    }

    render() {
        const cat = this.categories[this.currentCategoryKey];
        const fromUnitObj = cat.units[this.fromUnit] || { name: this.fromUnit };
        const toUnitObj = cat.units[this.toUnit] || { name: this.toUnit };

        const toValue = this._convert(this.fromValue, this.fromUnit, this.toUnit, this.currentCategoryKey);
        const formattedToValue = this._formatNumber(toValue);

        const formulaHint = this._getFormulaText();

        this.containerEl.innerHTML = `
            <div class="nexus-widget">
                <div class="nexus-sol-converter-card">
                    <!-- Top Bar: Title Badge & Custom Nexus Category Dropdown -->
                    <div class="nexus-converter-top-bar">
                        <div class="nexus-widget-title-badge">
                            <span class="nexus-widget-status-dot is-running-cyan"></span>
                            <span class="nexus-widget-title-text">${this.label}</span>
                        </div>

                        <!-- Custom Nexus Category Dropdown -->
                        <div class="nexus-custom-dropdown-wrap ${this.openDropdown === 'category' ? 'is-open' : ''}">
                            <button type="button" class="nexus-custom-dropdown-trigger" data-toggle-dropdown="category">
                                <span>${cat.name}</span>
                                <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="6 9 12 15 18 9"></polyline>
                                </svg>
                            </button>
                            <div class="nexus-custom-dropdown-menu">
                                ${Object.entries(this.categories).map(([k, c]) => `
                                    <div class="nexus-custom-dropdown-item ${k === this.currentCategoryKey ? 'is-active' : ''}" data-select-category="${k}">
                                        <span>${c.name}</span>
                                        ${k === this.currentCategoryKey ? `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>` : ''}
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>

                    <!-- Main Conversion Row -->
                    <div class="nexus-sol-converter-row">
                        <!-- From Field Group -->
                        <div class="nexus-sol-converter-group">
                            <input type="number" step="any" class="nexus-sol-converter-input" value="${this.fromValue}" data-input-from />
                            
                            <!-- Custom Nexus From-Unit Dropdown -->
                            <div class="nexus-custom-dropdown-wrap is-inline ${this.openDropdown === 'from' ? 'is-open' : ''}">
                                <button type="button" class="nexus-custom-dropdown-trigger is-unit" data-toggle-dropdown="from">
                                    <span>${fromUnitObj.name}</span>
                                    <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                        <polyline points="6 9 12 15 18 9"></polyline>
                                    </svg>
                                </button>
                                <div class="nexus-custom-dropdown-menu is-unit-menu">
                                    ${Object.entries(cat.units).map(([uKey, uVal]) => `
                                        <div class="nexus-custom-dropdown-item ${uKey === this.fromUnit ? 'is-active' : ''}" data-select-from="${uKey}">
                                            <span>${uVal.name}</span>
                                            ${uKey === this.fromUnit ? `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>` : ''}
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        </div>

                        <!-- Swap Button -->
                        <button type="button" class="nexus-sol-swap-btn" data-action="swap" title="Swap Units">
                            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="m16 3 4 4-4 4"></path>
                                <path d="M20 7H4"></path>
                                <path d="m8 21-4-4 4-4"></path>
                                <path d="M4 17h16"></path>
                            </svg>
                        </button>

                        <!-- To Field Group -->
                        <div class="nexus-sol-converter-group">
                            <input type="number" step="any" class="nexus-sol-converter-input is-result" value="${formattedToValue}" data-input-to />
                            
                            <!-- Custom Nexus To-Unit Dropdown -->
                            <div class="nexus-custom-dropdown-wrap is-inline ${this.openDropdown === 'to' ? 'is-open' : ''}">
                                <button type="button" class="nexus-custom-dropdown-trigger is-unit" data-toggle-dropdown="to">
                                    <span>${toUnitObj.name}</span>
                                    <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                        <polyline points="6 9 12 15 18 9"></polyline>
                                    </svg>
                                </button>
                                <div class="nexus-custom-dropdown-menu is-unit-menu">
                                    ${Object.entries(cat.units).map(([uKey, uVal]) => `
                                        <div class="nexus-custom-dropdown-item ${uKey === this.toUnit ? 'is-active' : ''}" data-select-to="${uKey}">
                                            <span>${uVal.name}</span>
                                            ${uKey === this.toUnit ? `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>` : ''}
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Bottom Formula Reference (Bright, Readable & Clean) -->
                    <div class="nexus-sol-converter-formula">
                        <span class="nexus-formula-tag">Formula</span>
                        <span class="nexus-formula-expr">${formulaHint}</span>
                    </div>
                </div>
            </div>
        `;
    }

    bindEvents() {
        this.containerEl.addEventListener('input', (e) => {
            const fromInput = e.target.closest('[data-input-from]');
            if (fromInput) {
                this.fromValue = parseFloat(fromInput.value);
                if (isNaN(this.fromValue)) this.fromValue = 0;
                this._updateToField();
                return;
            }

            const toInput = e.target.closest('[data-input-to]');
            if (toInput) {
                const toVal = parseFloat(toInput.value);
                if (!isNaN(toVal)) {
                    this.fromValue = this._convert(toVal, this.toUnit, this.fromUnit, this.currentCategoryKey);
                    const fromInputEl = this.containerEl.querySelector('[data-input-from]');
                    if (fromInputEl) {
                        fromInputEl.value = Number.isInteger(this.fromValue) ? this.fromValue : parseFloat(this.fromValue.toFixed(4));
                    }
                    this._updateFormulaHint();
                }
                return;
            }
        });

        this.containerEl.addEventListener('click', (e) => {
            // Dropdown Toggle
            const toggleTrigger = e.target.closest('[data-toggle-dropdown]');
            if (toggleTrigger) {
                e.stopPropagation();
                const wrap = toggleTrigger.closest('.nexus-custom-dropdown-wrap');
                const wasOpen = wrap ? wrap.classList.contains('is-open') : false;
                // Close all open dropdowns first
                this.containerEl.querySelectorAll('.nexus-custom-dropdown-wrap.is-open').forEach(el => el.classList.remove('is-open'));
                if (wrap && !wasOpen) {
                    wrap.classList.add('is-open');
                }
                return;
            }

            // Category select
            const catItem = e.target.closest('[data-select-category]');
            if (catItem) {
                e.stopPropagation();
                this.currentCategoryKey = catItem.dataset.selectCategory;
                const cat = this.categories[this.currentCategoryKey];
                const unitKeys = Object.keys(cat.units);
                this.fromUnit = unitKeys[0];
                this.toUnit = unitKeys[1] || unitKeys[0];
                this.render();
                return;
            }

            // From unit select
            const fromItem = e.target.closest('[data-select-from]');
            if (fromItem) {
                e.stopPropagation();
                this.fromUnit = fromItem.dataset.selectFrom;
                this.render();
                return;
            }

            // To unit select
            const toItem = e.target.closest('[data-select-to]');
            if (toItem) {
                e.stopPropagation();
                this.toUnit = toItem.dataset.selectTo;
                this.render();
                return;
            }

            // Swap button
            const swapBtn = e.target.closest('[data-action="swap"]');
            if (swapBtn) {
                const temp = this.fromUnit;
                this.fromUnit = this.toUnit;
                this.toUnit = temp;
                this.render();
                return;
            }

            // Clicking elsewhere inside widget closes dropdowns
            this.containerEl.querySelectorAll('.nexus-custom-dropdown-wrap.is-open').forEach(el => el.classList.remove('is-open'));
        });

        // Global outside click listener
        document.addEventListener('click', (e) => {
            if (!this.containerEl.contains(e.target)) {
                this.containerEl.querySelectorAll('.nexus-custom-dropdown-wrap.is-open').forEach(el => el.classList.remove('is-open'));
            }
        });
    }

    _formatNumber(val) {
        if (val === 0 || isNaN(val)) return '0';
        if (Number.isInteger(val)) return val.toString();
        const abs = Math.abs(val);
        if (abs >= 1) {
            return parseFloat(val.toFixed(4)).toString();
        }
        if (abs >= 0.000001) {
            return parseFloat(val.toFixed(6)).toString();
        }
        return parseFloat(val.toPrecision(4)).toString();
    }

    _updateToField() {
        const toInput = this.containerEl.querySelector('[data-input-to]');
        if (toInput) {
            const toValue = this._convert(this.fromValue, this.fromUnit, this.toUnit, this.currentCategoryKey);
            toInput.value = this._formatNumber(toValue);
        }
        this._updateFormulaHint();
    }

    _getFormulaText() {
        const cat = this.categories[this.currentCategoryKey];
        if (!cat) return '';

        if (this.currentCategoryKey === 'temperature') {
            if (this.fromUnit === 'f' && this.toUnit === 'c') return 'C = (F − 32) × 5/9';
            if (this.fromUnit === 'c' && this.toUnit === 'f') return 'F = (C × 9/5) + 32';
            if (this.fromUnit === 'c' && this.toUnit === 'k') return 'K = C + 273.15';
            if (this.fromUnit === 'k' && this.toUnit === 'c') return 'C = K − 273.15';
            if (this.fromUnit === 'f' && this.toUnit === 'k') return 'K = (F − 32) × 5/9 + 273.15';
            if (this.fromUnit === 'k' && this.toUnit === 'f') return 'F = (K − 273.15) × 9/5 + 32';
            return 'C = (F − 32) × 5/9';
        }

        const fromUnitObj = cat.units[this.fromUnit] || { name: this.fromUnit };
        const toUnitObj = cat.units[this.toUnit] || { name: this.toUnit };
        const fromShort = fromUnitObj.name.includes('(') ? fromUnitObj.name.split('(')[1].replace(')', '') : fromUnitObj.name.split(' ')[0];
        const toShort = toUnitObj.name.includes('(') ? toUnitObj.name.split('(')[1].replace(')', '') : toUnitObj.name.split(' ')[0];

        const forward = this._convert(1, this.fromUnit, this.toUnit, this.currentCategoryKey);
        if (forward >= 0.001) {
            const formatted = Number.isInteger(forward) ? forward.toLocaleString('en-US') : parseFloat(forward.toFixed(6));
            return `1 ${fromShort} = ${formatted} ${toShort}`;
        } else {
            const reverse = this._convert(1, this.toUnit, this.fromUnit, this.currentCategoryKey);
            const formattedRev = Number.isInteger(reverse) ? reverse.toLocaleString('en-US') : parseFloat(reverse.toFixed(6));
            return `1 ${toShort} = ${formattedRev} ${fromShort}`;
        }
    }

    _updateFormulaHint() {
        const formulaEl = this.containerEl.querySelector('.nexus-formula-expr');
        if (formulaEl) {
            formulaEl.textContent = this._getFormulaText();
        }
    }
}
