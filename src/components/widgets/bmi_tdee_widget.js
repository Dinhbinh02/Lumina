/**
 * BMI & TDEE Health Calculator Widget (.nexus-sol-bmitdee-card)
 * Computes Body Mass Index (BMI), Basal Metabolic Rate (BMR), and Total Daily Energy Expenditure (TDEE)
 * using the Mifflin-St Jeor formula with interactive sliders and goal breakdown.
 */

const ACTIVITY_MULTIPLIERS = {
    sedentary: { label: 'Sedentary (Desk Job)', factor: 1.2 },
    light: { label: 'Lightly Active (1-3 days/wk)', factor: 1.375 },
    moderate: { label: 'Moderately Active (3-5 days/wk)', factor: 1.55 },
    active: { label: 'Very Active (6-7 days/wk)', factor: 1.725 }
};

export class BmiTdeeWidget {
    constructor(containerEl, props = {}) {
        this.containerEl = containerEl;
        this.label = props.label || props.title || 'BMI & Daily Calorie (TDEE)';

        this.heightCm = Math.max(100, Math.min(240, parseFloat(props.height || props.height_cm || 175) || 175));
        this.weightKg = Math.max(30, Math.min(250, parseFloat(props.weight || props.weight_kg || 70) || 70));
        this.age = Math.max(12, Math.min(100, parseInt(props.age || 26, 10) || 26));
        this.gender = (props.gender || 'male').toLowerCase() === 'female' ? 'female' : 'male';
        this.activity = props.activity || 'moderate';

        this.activeTab = 'bmi'; // 'bmi' or 'tdee'
        this._eventsBound = false;

        this.render();
        this.bindEvents();
    }

    _calculateMetrics() {
        const heightM = this.heightCm / 100;
        const bmi = parseFloat((this.weightKg / (heightM * heightM)).toFixed(1));

        let bmiCategory = { label: 'Normal', color: '#10b981', desc: 'Healthy Body Weight' };
        if (bmi < 18.5) {
            bmiCategory = { label: 'Underweight', color: '#38bdf8', desc: 'Below Healthy Range' };
        } else if (bmi >= 25.0 && bmi < 29.9) {
            bmiCategory = { label: 'Overweight', color: '#f59e0b', desc: 'Above Healthy Range' };
        } else if (bmi >= 30.0) {
            bmiCategory = { label: 'Obese', color: '#ef4444', desc: 'Significantly Elevated' };
        }

        // BMR via Mifflin-St Jeor
        let bmr = (10 * this.weightKg) + (6.25 * this.heightCm) - (5 * this.age);
        bmr += this.gender === 'male' ? 5 : -161;
        bmr = Math.round(bmr);

        const factor = ACTIVITY_MULTIPLIERS[this.activity]?.factor || 1.55;
        const tdee = Math.round(bmr * factor);

        return {
            bmi,
            bmiCategory,
            bmr,
            tdee,
            cutCalories: Math.max(1200, tdee - 500),
            bulkCalories: tdee + 500
        };
    }

    render() {
        const data = this._calculateMetrics();
        const markerPercent = Math.min(100, Math.max(0, ((data.bmi - 15) / 25) * 100));

        this.containerEl.innerHTML = `
            <div class="nexus-widget">
                <div class="nexus-sol-bmitdee-card">
                    <!-- Top Bar -->
                    <div class="nexus-bmitdee-top-bar">
                        <div class="nexus-widget-title-badge">
                            <span class="nexus-widget-status-dot" style="background: ${data.bmiCategory.color}; box-shadow: 0 0 0 2px ${data.bmiCategory.color}33;"></span>
                            <span class="nexus-widget-title-text">${this.label}</span>
                        </div>
                        <div class="nexus-bmitdee-tabs">
                            <button type="button" class="nexus-bmitdee-tab-btn ${this.activeTab === 'bmi' ? 'is-active' : ''}" data-tab="bmi">BMI</button>
                            <button type="button" class="nexus-bmitdee-tab-btn ${this.activeTab === 'tdee' ? 'is-active' : ''}" data-tab="tdee">Calories</button>
                        </div>
                    </div>

                    <!-- Main Hero Display -->
                    <div class="nexus-bmitdee-hero-block">
                        ${this.activeTab === 'bmi' ? `
                            <span class="nexus-bmitdee-hero-label">Body Mass Index (BMI)</span>
                            <div class="nexus-bmitdee-hero-row">
                                <span class="nexus-bmitdee-hero-val" data-bmi-val style="color: ${data.bmiCategory.color}">${data.bmi}</span>
                                <span class="nexus-bmitdee-status-chip" data-bmi-chip style="color: ${data.bmiCategory.color}; background: ${data.bmiCategory.color}20; border-color: ${data.bmiCategory.color}40;">
                                    ${data.bmiCategory.label}
                                </span>
                            </div>
                        ` : `
                            <span class="nexus-bmitdee-hero-label">Daily Maintenance (TDEE)</span>
                            <div class="nexus-bmitdee-hero-row">
                                <span class="nexus-bmitdee-hero-val" data-tdee-val style="color: #38bdf8">${data.tdee}</span>
                                <span class="nexus-bmitdee-unit-tag">kcal / day</span>
                            </div>
                        `}
                    </div>

                    ${this.activeTab === 'bmi' ? `
                        <!-- Visual BMI Spectrum Bar -->
                        <div class="nexus-bmitdee-gauge-box">
                            <div class="nexus-bmitdee-spectrum-track">
                                <div class="nexus-bmitdee-gauge-marker" data-bmi-marker style="left: ${markerPercent}%; background: ${data.bmiCategory.color};"></div>
                            </div>
                            <div class="nexus-bmitdee-spectrum-labels">
                                <span style="color: #38bdf8">< 18.5</span>
                                <span style="color: #10b981">18.5 - 24.9</span>
                                <span style="color: #f59e0b">25 - 29.9</span>
                                <span style="color: #ef4444">30+</span>
                            </div>
                        </div>
                    ` : `
                        <!-- Calories Goal Breakdown -->
                        <div class="nexus-bmitdee-goals-row">
                            <div class="nexus-bmitdee-goal-item">
                                <span class="nexus-bmitdee-goal-label">Weight Loss (-500)</span>
                                <span class="nexus-bmitdee-goal-val is-cyan">${data.cutCalories} <small>kcal</small></span>
                            </div>
                            <div class="nexus-bmitdee-goal-item">
                                <span class="nexus-bmitdee-goal-label">Weight Gain (+500)</span>
                                <span class="nexus-bmitdee-goal-val is-amber">${data.bulkCalories} <small>kcal</small></span>
                            </div>
                        </div>
                    `}

                    <!-- Interactive Controls (Height & Weight Sliders) -->
                    <div class="nexus-bmitdee-controls">
                        <!-- Height Slider -->
                        <div class="nexus-bmitdee-control-row">
                            <div class="nexus-bmitdee-control-header">
                                <span class="nexus-bmitdee-label">Height</span>
                                <span class="nexus-bmitdee-num-display" data-height-disp>${this.heightCm} cm</span>
                            </div>
                            <input type="range" class="nexus-bmitdee-slider" min="120" max="220" step="1" value="${this.heightCm}" data-slider="height" />
                        </div>

                        <!-- Weight Slider -->
                        <div class="nexus-bmitdee-control-row">
                            <div class="nexus-bmitdee-control-header">
                                <span class="nexus-bmitdee-label">Weight</span>
                                <span class="nexus-bmitdee-num-display" data-weight-disp>${this.weightKg} kg</span>
                            </div>
                            <input type="range" class="nexus-bmitdee-slider" min="40" max="150" step="0.5" value="${this.weightKg}" data-slider="weight" />
                        </div>
                    </div>

                    <!-- Footer Details: BMR & Ideal Range -->
                    <div class="nexus-bmitdee-summary-row">
                        <div class="nexus-bmitdee-summary-item">
                            <span class="nexus-bmitdee-summary-label">Basal Metabolic (BMR)</span>
                            <span class="nexus-bmitdee-summary-val" data-bmr-val>${data.bmr} kcal</span>
                        </div>
                        <div class="nexus-bmitdee-summary-item">
                            <span class="nexus-bmitdee-summary-label">Healthy Weight</span>
                            <span class="nexus-bmitdee-summary-val" data-ideal-range>${Math.round(18.5 * Math.pow(this.heightCm / 100, 2))} - ${Math.round(24.9 * Math.pow(this.heightCm / 100, 2))} kg</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    _updateMetricsUI() {
        const data = this._calculateMetrics();
        const markerPercent = Math.min(100, Math.max(0, ((data.bmi - 15) / 25) * 100));

        const hDisp = this.containerEl.querySelector('[data-height-disp]');
        if (hDisp) hDisp.textContent = `${this.heightCm} cm`;

        const wDisp = this.containerEl.querySelector('[data-weight-disp]');
        if (wDisp) wDisp.textContent = `${this.weightKg} kg`;

        const bmiVal = this.containerEl.querySelector('[data-bmi-val]');
        if (bmiVal) {
            bmiVal.textContent = data.bmi;
            bmiVal.style.color = data.bmiCategory.color;
        }

        const bmiChip = this.containerEl.querySelector('[data-bmi-chip]');
        if (bmiChip) {
            bmiChip.textContent = data.bmiCategory.label;
            bmiChip.style.color = data.bmiCategory.color;
            bmiChip.style.background = `${data.bmiCategory.color}20`;
            bmiChip.style.borderColor = `${data.bmiCategory.color}40`;
        }

        const marker = this.containerEl.querySelector('[data-bmi-marker]');
        if (marker) {
            marker.style.left = `${markerPercent}%`;
            marker.style.background = data.bmiCategory.color;
        }

        const tdeeVal = this.containerEl.querySelector('[data-tdee-val]');
        if (tdeeVal) tdeeVal.textContent = data.tdee;

        const bmrVal = this.containerEl.querySelector('[data-bmr-val]');
        if (bmrVal) bmrVal.textContent = `${data.bmr} kcal`;

        const idealRange = this.containerEl.querySelector('[data-ideal-range]');
        if (idealRange) {
            const minW = Math.round(18.5 * Math.pow(this.heightCm / 100, 2));
            const maxW = Math.round(24.9 * Math.pow(this.heightCm / 100, 2));
            idealRange.textContent = `${minW} - ${maxW} kg`;
        }
    }

    bindEvents() {
        if (this._eventsBound) return;
        this._eventsBound = true;

        this.containerEl.addEventListener('input', (e) => {
            const slider = e.target.closest('[data-slider]');
            if (!slider) return;

            if (slider.dataset.slider === 'height') {
                this.heightCm = parseFloat(slider.value) || 175;
            } else if (slider.dataset.slider === 'weight') {
                this.weightKg = parseFloat(slider.value) || 70;
            }
            this._updateMetricsUI();
        });

        this.containerEl.addEventListener('click', (e) => {
            const tabBtn = e.target.closest('[data-tab]');
            if (tabBtn) {
                this.activeTab = tabBtn.dataset.tab;
                this.render();
                return;
            }
        });
    }
}
