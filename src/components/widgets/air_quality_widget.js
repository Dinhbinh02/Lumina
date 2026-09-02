/**
 * Air Quality Index (AQI) Widget (.nexus-sol-aqi-card)
 * Live AQI, PM2.5, PM10, Ozone, and health advice via Open-Meteo Air Quality API (0đ, No key required)
 */

export class AirQualityWidget {
    constructor(containerEl, props = {}) {
        this.containerEl = containerEl;
        this.label = props.label || props.title || 'Air Quality Index';

        this.city = props.city || props.location || props.name || 'Hanoi';
        this.latitude = parseFloat(props.lat || props.latitude) || 21.0285;
        this.longitude = parseFloat(props.lon || props.longitude) || 105.8542;
        this.resolvedCityName = this.city;

        // Current AQI state
        this.usAqi = 85;
        this.pm25 = 28.4;
        this.pm10 = 54.2;
        this.o3 = 45.0;
        this.no2 = 22.1;
        this.isLoading = false;
        this._eventsBound = false;

        this.render();
        this.bindEvents();
        this.fetchAqiData();
    }

    _getAqiStatus(aqi) {
        if (aqi <= 50) {
            return {
                label: 'Good',
                color: '#10b981',
                bg: 'rgba(16, 185, 129, 0.15)',
                advice: 'Air quality is satisfactory. Enjoy outdoor activities.'
            };
        }
        if (aqi <= 100) {
            return {
                label: 'Moderate',
                color: '#f59e0b',
                bg: 'rgba(245, 158, 11, 0.15)',
                advice: 'Acceptable quality. Sensitive individuals should take care.'
            };
        }
        if (aqi <= 150) {
            return {
                label: 'Unhealthy for Sensitive Groups',
                color: '#f97316',
                bg: 'rgba(249, 115, 22, 0.15)',
                advice: 'Wear a mask outdoors if you have respiratory conditions.'
            };
        }
        if (aqi <= 200) {
            return {
                label: 'Unhealthy',
                color: '#ef4444',
                bg: 'rgba(239, 68, 68, 0.15)',
                advice: 'Everyone should wear a mask and keep windows closed.'
            };
        }
        if (aqi <= 300) {
            return {
                label: 'Very Unhealthy',
                color: '#a855f7',
                bg: 'rgba(168, 85, 247, 0.15)',
                advice: 'Health alert: Avoid outdoor exertion and run air purifiers.'
            };
        }
        return {
            label: 'Hazardous',
            color: '#b91c1c',
            bg: 'rgba(185, 28, 28, 0.2)',
            advice: 'Emergency conditions. Remain indoors with air filtration.'
        };
    }

    async fetchAqiData() {
        if (this.isLoading) return;
        this.isLoading = true;

        try {
            if (this.city && (!this.latitude || !this.longitude || this.city !== 'Hanoi')) {
                const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(this.city)}&count=1&language=en&format=json`);
                if (geoRes.ok) {
                    const geoData = await geoRes.json();
                    if (geoData && geoData.results && geoData.results.length > 0) {
                        const loc = geoData.results[0];
                        this.latitude = loc.latitude;
                        this.longitude = loc.longitude;
                        this.resolvedCityName = `${loc.name}${loc.country_code ? ', ' + loc.country_code : ''}`;
                    }
                }
            }

            const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${this.latitude}&longitude=${this.longitude}&current=us_aqi,pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,ozone&timezone=auto`;
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                if (data && data.current) {
                    this.usAqi = Math.round(data.current.us_aqi || 50);
                    this.pm25 = parseFloat((data.current.pm2_5 || 15).toFixed(1));
                    this.pm10 = parseFloat((data.current.pm10 || 30).toFixed(1));
                    this.o3 = parseFloat((data.current.ozone || 40).toFixed(1));
                    this.no2 = parseFloat((data.current.nitrogen_dioxide || 20).toFixed(1));
                    this._updateUI();
                }
            }
        } catch (e) {
            console.warn('[AirQualityWidget] Fetch fallback:', e);
        } finally {
            this.isLoading = false;
        }
    }

    render() {
        const status = this._getAqiStatus(this.usAqi);
        const gaugePercent = Math.min(100, Math.max(0, (this.usAqi / 300) * 100));

        this.containerEl.innerHTML = `
            <div class="nexus-widget">
                <div class="nexus-sol-aqi-card">
                    <!-- Top Bar -->
                    <div class="nexus-aqi-top-bar">
                        <div class="nexus-widget-title-badge">
                            <span class="nexus-widget-status-dot" style="background: ${status.color}; box-shadow: 0 0 0 2px ${status.bg};"></span>
                            <span class="nexus-widget-title-text" data-aqi-city>${this.resolvedCityName}</span>
                        </div>
                        <button type="button" class="nexus-aqi-refresh-btn" data-action="refresh" title="Refresh AQI">
                            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
                            </svg>
                        </button>
                    </div>

                    <!-- Main Hero: Big AQI & Status Badge -->
                    <div class="nexus-aqi-hero-block">
                        <span class="nexus-aqi-hero-label">US Air Quality Index</span>
                        <div class="nexus-aqi-hero-row">
                            <span class="nexus-aqi-hero-val" data-aqi-val style="color: ${status.color}">${this.usAqi}</span>
                            <span class="nexus-aqi-status-chip" data-aqi-chip style="color: ${status.color}; background: ${status.bg}; border-color: ${status.color}40;">
                                ${status.label}
                            </span>
                        </div>
                    </div>

                    <!-- Visual Linear Spectrum Gauge -->
                    <div class="nexus-aqi-gauge-box">
                        <div class="nexus-aqi-spectrum-track">
                            <div class="nexus-aqi-gauge-marker" data-aqi-marker style="left: ${gaugePercent}%; background: ${status.color};"></div>
                        </div>
                        <div class="nexus-aqi-spectrum-labels">
                            <span>0 Good</span>
                            <span>100</span>
                            <span>200</span>
                            <span>300+ Haz</span>
                        </div>
                    </div>

                    <!-- Pollutants Breakdown Grid (PM2.5, PM10, O3, NO2) -->
                    <div class="nexus-aqi-pollutants-grid">
                        <div class="nexus-aqi-pollutant-item">
                            <span class="nexus-aqi-pollutant-label">PM2.5</span>
                            <span class="nexus-aqi-pollutant-val" data-aqi-pm25>${this.pm25} <small>µg/m³</small></span>
                        </div>
                        <div class="nexus-aqi-pollutant-item">
                            <span class="nexus-aqi-pollutant-label">PM10</span>
                            <span class="nexus-aqi-pollutant-val" data-aqi-pm10>${this.pm10} <small>µg/m³</small></span>
                        </div>
                        <div class="nexus-aqi-pollutant-item">
                            <span class="nexus-aqi-pollutant-label">Ozone (O₃)</span>
                            <span class="nexus-aqi-pollutant-val" data-aqi-o3>${this.o3} <small>µg/m³</small></span>
                        </div>
                        <div class="nexus-aqi-pollutant-item">
                            <span class="nexus-aqi-pollutant-label">NO₂</span>
                            <span class="nexus-aqi-pollutant-val" data-aqi-no2>${this.no2} <small>µg/m³</small></span>
                        </div>
                    </div>

                    <!-- Health Recommendation Footer -->
                    <div class="nexus-aqi-advice-row">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="${status.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="m12 14 4-4M3.34 17a10 10 0 1 1 17.32 0"/>
                        </svg>
                        <span class="nexus-aqi-advice-text" data-aqi-advice>${status.advice}</span>
                    </div>
                </div>
            </div>
        `;
    }

    _updateUI() {
        const status = this._getAqiStatus(this.usAqi);
        const gaugePercent = Math.min(100, Math.max(0, (this.usAqi / 300) * 100));

        const cityEl = this.containerEl.querySelector('[data-aqi-city]');
        if (cityEl) cityEl.textContent = this.resolvedCityName;

        const valEl = this.containerEl.querySelector('[data-aqi-val]');
        if (valEl) {
            valEl.textContent = this.usAqi;
            valEl.style.color = status.color;
        }

        const chipEl = this.containerEl.querySelector('[data-aqi-chip]');
        if (chipEl) {
            chipEl.textContent = status.label;
            chipEl.style.color = status.color;
            chipEl.style.background = status.bg;
            chipEl.style.borderColor = `${status.color}40`;
        }

        const markerEl = this.containerEl.querySelector('[data-aqi-marker]');
        if (markerEl) {
            markerEl.style.left = `${gaugePercent}%`;
            markerEl.style.background = status.color;
        }

        const pm25El = this.containerEl.querySelector('[data-aqi-pm25]');
        if (pm25El) pm25El.innerHTML = `${this.pm25} <small>µg/m³</small>`;

        const pm10El = this.containerEl.querySelector('[data-aqi-pm10]');
        if (pm10El) pm10El.innerHTML = `${this.pm10} <small>µg/m³</small>`;

        const o3El = this.containerEl.querySelector('[data-aqi-o3]');
        if (o3El) o3El.innerHTML = `${this.o3} <small>µg/m³</small>`;

        const no2El = this.containerEl.querySelector('[data-aqi-no2]');
        if (no2El) no2El.innerHTML = `${this.no2} <small>µg/m³</small>`;

        const adviceEl = this.containerEl.querySelector('[data-aqi-advice]');
        if (adviceEl) adviceEl.textContent = status.advice;
    }

    bindEvents() {
        if (this._eventsBound) return;
        this._eventsBound = true;

        this.containerEl.addEventListener('click', (e) => {
            const refreshBtn = e.target.closest('[data-action="refresh"]');
            if (refreshBtn) {
                refreshBtn.style.opacity = '0.5';
                setTimeout(() => { refreshBtn.style.opacity = '1'; }, 300);
                this.fetchAqiData();
                return;
            }
        });
    }
}
