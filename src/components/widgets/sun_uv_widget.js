/**
 * Sun & UV Index Widget (.nexus-sol-sunuv-card)
 * Live UV Index, Sunrise, Sunset, and celestial solar arc via Open-Meteo API (0đ, No key required)
 */

export class SunUvWidget {
    constructor(containerEl, props = {}) {
        this.containerEl = containerEl;
        this.label = props.label || props.title || 'Sun & UV Index';

        this.city = props.city || props.location || props.name || 'Hanoi';
        this.latitude = parseFloat(props.lat || props.latitude) || 21.0285;
        this.longitude = parseFloat(props.lon || props.longitude) || 105.8542;
        this.resolvedCityName = this.city;

        // Current Sun & UV state
        this.currentUv = 6.2;
        this.maxUv = 8.5;
        this.sunriseStr = '05:48';
        this.sunsetStr = '18:15';
        this.daylightHours = '12h 27m';
        this.solarProgress = 0.65; // 0.0 at sunrise, 1.0 at sunset
        this.isLoading = false;
        this._eventsBound = false;

        this.render();
        this.bindEvents();
        this.fetchSunUvData();
    }

    _getUvSeverity(uv) {
        if (uv <= 2.9) {
            return { label: 'Low', color: '#10b981', advice: 'No protection required.' };
        }
        if (uv <= 5.9) {
            return { label: 'Moderate', color: '#f59e0b', advice: 'Wear sunglasses & SPF 30+.' };
        }
        if (uv <= 7.9) {
            return { label: 'High', color: '#f97316', advice: 'Seek shade during midday & hat.' };
        }
        if (uv <= 10.9) {
            return { label: 'Very High', color: '#ef4444', advice: 'Avoid sun 10AM-4PM. Cover up.' };
        }
        return { label: 'Extreme', color: '#a855f7', advice: 'Take full precautions outdoors.' };
    }

    async fetchSunUvData() {
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

            const url = `https://api.open-meteo.com/v1/forecast?latitude=${this.latitude}&longitude=${this.longitude}&daily=sunrise,sunset,uv_index_max&hourly=uv_index&timezone=auto`;
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                if (data && data.daily && data.daily.sunrise && data.daily.sunrise.length > 0) {
                    const sunriseDate = new Date(data.daily.sunrise[0]);
                    const sunsetDate = new Date(data.daily.sunset[0]);
                    const now = new Date();

                    this.sunriseStr = sunriseDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
                    this.sunsetStr = sunsetDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

                    const totalMs = sunsetDate - sunriseDate;
                    const elapsedMs = now - sunriseDate;
                    if (totalMs > 0) {
                        const mins = Math.round(totalMs / 60000);
                        this.daylightHours = `${Math.floor(mins / 60)}h ${mins % 60}m`;
                        this.solarProgress = Math.max(0, Math.min(1, elapsedMs / totalMs));
                    }

                    this.maxUv = parseFloat((data.daily.uv_index_max[0] || 7.5).toFixed(1));

                    // Current hour UV
                    if (data.hourly && Array.isArray(data.hourly.uv_index)) {
                        const currentHour = now.getHours();
                        this.currentUv = parseFloat((data.hourly.uv_index[currentHour] || (this.maxUv * 0.7)).toFixed(1));
                    }
                    this._updateUI();
                }
            }
        } catch (e) {
            console.warn('[SunUvWidget] Fetch fallback:', e);
        } finally {
            this.isLoading = false;
        }
    }

    _generateSolarArcSvg() {
        const w = 310;
        const h = 76;
        const padX = 20;
        const radius = (w - padX * 2) / 2;
        const centerX = w / 2;
        const centerY = h - 6;

        // Path for celestial semi-circle
        const arcPath = `M ${padX},${centerY} A ${radius},${radius * 0.75} 0 0,1 ${w - padX},${centerY}`;

        // Compute current sun point along ellipse arc (angle from 180 deg to 0 deg)
        const angleRad = Math.PI * (1 - this.solarProgress);
        const sunX = centerX + (radius * Math.cos(angleRad));
        const sunY = centerY - (radius * 0.75 * Math.sin(angleRad));

        const isDaytime = this.solarProgress > 0 && this.solarProgress < 1;

        return `
            <svg class="nexus-sunuv-arc-svg" viewBox="0 0 ${w} ${h}" width="100%" height="${h}">
                <defs>
                    <linearGradient id="sunArcGrad" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stop-color="#f59e0b" stop-opacity="0.4"/>
                        <stop offset="50%" stop-color="#facc15" stop-opacity="0.9"/>
                        <stop offset="100%" stop-color="#f97316" stop-opacity="0.4"/>
                    </linearGradient>
                    <filter id="sunGlow" x="-50%" y="-50%" width="200%" height="200%">
                        <feDropShadow dx="0" dy="0" stdDeviation="4" flood-color="#facc15" flood-opacity="0.7"/>
                    </filter>
                </defs>
                <!-- Horizon line -->
                <line x1="${padX - 8}" y1="${centerY}" x2="${w - padX + 8}" y2="${centerY}" stroke="rgba(255, 255, 255, 0.12)" stroke-dasharray="3 3"/>
                <!-- Sun Arc -->
                <path d="${arcPath}" fill="none" stroke="url(#sunArcGrad)" stroke-width="2" stroke-dasharray="4 3" />
                <!-- Sun body icon -->
                ${isDaytime ? `
                    <circle cx="${sunX.toFixed(1)}" cy="${sunY.toFixed(1)}" r="6" fill="#facc15" stroke="#ffffff" stroke-width="1.8" filter="url(#sunGlow)"/>
                ` : `
                    <circle cx="${padX}" cy="${centerY}" r="4" fill="#38bdf8" stroke="rgba(255,255,255,0.4)" stroke-width="1"/>
                `}
            </svg>
        `;
    }

    render() {
        const severity = this._getUvSeverity(this.currentUv);

        this.containerEl.innerHTML = `
            <div class="nexus-widget">
                <div class="nexus-sol-sunuv-card">
                    <!-- Top Bar -->
                    <div class="nexus-sunuv-top-bar">
                        <div class="nexus-widget-title-badge">
                            <span class="nexus-widget-status-dot is-running-amber"></span>
                            <span class="nexus-widget-title-text" data-sunuv-city>${this.resolvedCityName}</span>
                        </div>
                        <button type="button" class="nexus-sunuv-refresh-btn" data-action="refresh" title="Refresh UV & Sun">
                            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
                            </svg>
                        </button>
                    </div>

                    <!-- Main Hero: Big UV Index Display -->
                    <div class="nexus-sunuv-hero-block">
                        <span class="nexus-sunuv-hero-label">Current UV Index</span>
                        <div class="nexus-sunuv-hero-row">
                            <span class="nexus-sunuv-hero-val" data-sunuv-val style="color: ${severity.color}">${this.currentUv}</span>
                            <span class="nexus-sunuv-status-chip" data-sunuv-chip style="color: ${severity.color}; background: ${severity.color}22; border-color: ${severity.color}40;">
                                ${severity.label}
                            </span>
                        </div>
                    </div>

                    <!-- Solar Celestial Arc Tracker -->
                    <div class="nexus-sunuv-arc-box" data-sunuv-arc-box>
                        ${this._generateSolarArcSvg()}
                    </div>

                    <!-- Sunrise, Sunset & Peak UV Breakdown -->
                    <div class="nexus-sunuv-summary-grid">
                        <div class="nexus-sunuv-summary-item">
                            <span class="nexus-sunuv-summary-label">Sunrise</span>
                            <span class="nexus-sunuv-summary-val" data-sunuv-sunrise>${this.sunriseStr}</span>
                        </div>
                        <div class="nexus-sunuv-summary-item">
                            <span class="nexus-sunuv-summary-label">Sunset</span>
                            <span class="nexus-sunuv-summary-val" data-sunuv-sunset>${this.sunsetStr}</span>
                        </div>
                        <div class="nexus-sunuv-summary-item">
                            <span class="nexus-sunuv-summary-label">Peak UV</span>
                            <span class="nexus-sunuv-summary-val" data-sunuv-max>${this.maxUv}</span>
                        </div>
                        <div class="nexus-sunuv-summary-item">
                            <span class="nexus-sunuv-summary-label">Daylight</span>
                            <span class="nexus-sunuv-summary-val" data-sunuv-daylight>${this.daylightHours}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    _updateUI() {
        const severity = this._getUvSeverity(this.currentUv);

        const cityEl = this.containerEl.querySelector('[data-sunuv-city]');
        if (cityEl) cityEl.textContent = this.resolvedCityName;

        const valEl = this.containerEl.querySelector('[data-sunuv-val]');
        if (valEl) {
            valEl.textContent = this.currentUv;
            valEl.style.color = severity.color;
        }

        const chipEl = this.containerEl.querySelector('[data-sunuv-chip]');
        if (chipEl) {
            chipEl.textContent = severity.label;
            chipEl.style.color = severity.color;
            chipEl.style.background = `${severity.color}22`;
            chipEl.style.borderColor = `${severity.color}40`;
        }

        const arcBox = this.containerEl.querySelector('[data-sunuv-arc-box]');
        if (arcBox) arcBox.innerHTML = this._generateSolarArcSvg();

        const sunriseEl = this.containerEl.querySelector('[data-sunuv-sunrise]');
        if (sunriseEl) sunriseEl.textContent = this.sunriseStr;

        const sunsetEl = this.containerEl.querySelector('[data-sunuv-sunset]');
        if (sunsetEl) sunsetEl.textContent = this.sunsetStr;

        const maxEl = this.containerEl.querySelector('[data-sunuv-max]');
        if (maxEl) maxEl.textContent = this.maxUv;

        const daylightEl = this.containerEl.querySelector('[data-sunuv-daylight]');
        if (daylightEl) daylightEl.textContent = this.daylightHours;
    }

    bindEvents() {
        if (this._eventsBound) return;
        this._eventsBound = true;

        this.containerEl.addEventListener('click', (e) => {
            const refreshBtn = e.target.closest('[data-action="refresh"]');
            if (refreshBtn) {
                refreshBtn.style.opacity = '0.5';
                setTimeout(() => { refreshBtn.style.opacity = '1'; }, 300);
                this.fetchSunUvData();
                return;
            }
        });
    }
}
