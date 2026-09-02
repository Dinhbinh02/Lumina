/**
 * Weather Widget (.nexus-sol-weather-card)
 * Realtime weather via Open-Meteo API (0đ, No API key needed)
 * Displays temperature, feels-like, weather condition icon, humidity, wind, and °C/°F toggle.
 */

// WMO Weather interpretation codes (WW)
export const WMO_WEATHER_CODES = {
    0: { label: 'Clear Sky', icon: 'sun', color: '#f59e0b' },
    1: { label: 'Mainly Clear', icon: 'sun-cloud', color: '#fbbf24' },
    2: { label: 'Partly Cloudy', icon: 'cloud-sun', color: '#94a3b8' },
    3: { label: 'Overcast', icon: 'cloud', color: '#64748b' },
    45: { label: 'Foggy', icon: 'fog', color: '#94a3b8' },
    48: { label: 'Depositing Rime Fog', icon: 'fog', color: '#94a3b8' },
    51: { label: 'Light Drizzle', icon: 'rain-drizzle', color: '#38bdf8' },
    53: { label: 'Moderate Drizzle', icon: 'rain-drizzle', color: '#0284c7' },
    55: { label: 'Dense Drizzle', icon: 'rain', color: '#0284c7' },
    61: { label: 'Slight Rain', icon: 'rain', color: '#38bdf8' },
    63: { label: 'Moderate Rain', icon: 'rain', color: '#2563eb' },
    65: { label: 'Heavy Rain', icon: 'rain-heavy', color: '#1d4ed8' },
    71: { label: 'Slight Snow', icon: 'snow', color: '#e0f2fe' },
    73: { label: 'Moderate Snow', icon: 'snow', color: '#bae6fd' },
    75: { label: 'Heavy Snow', icon: 'snow', color: '#7dd3fc' },
    80: { label: 'Rain Showers', icon: 'rain', color: '#38bdf8' },
    81: { label: 'Moderate Showers', icon: 'rain', color: '#2563eb' },
    82: { label: 'Violent Showers', icon: 'rain-heavy', color: '#1e40af' },
    95: { label: 'Thunderstorm', icon: 'thunderstorm', color: '#a855f7' },
    96: { label: 'Thunderstorm with Hail', icon: 'thunderstorm', color: '#9333ea' },
    99: { label: 'Heavy Thunderstorm with Hail', icon: 'thunderstorm', color: '#7e22ce' }
};

export class WeatherWidget {
    constructor(containerEl, props = {}) {
        this.containerEl = containerEl;
        this.label = props.label || props.title || 'Live Weather';

        this.city = props.city || props.location || props.name || 'Hanoi';
        this.unit = (props.unit || 'c').toLowerCase(); // 'c' or 'f'

        // Coordinates (Default Hanoi)
        this.latitude = parseFloat(props.lat || props.latitude) || 21.0285;
        this.longitude = parseFloat(props.lon || props.longitude) || 105.8542;
        this.resolvedCityName = this.city;

        // Current weather state
        this.tempC = 28.5;
        this.feelsLikeC = 31.0;
        this.humidity = 75;
        this.windSpeed = 12.5; // km/h
        this.weatherCode = 1;
        this.isDay = 1;
        this.precipitation = 0.0;
        this.isLoading = false;
        this._eventsBound = false;

        this.render();
        this.bindEvents();
        this.fetchWeatherData();
    }

    _getWeatherInfo() {
        return WMO_WEATHER_CODES[this.weatherCode] || { label: 'Fair Weather', icon: 'sun-cloud', color: '#38bdf8' };
    }

    _renderWeatherIconSvg(iconType, isDay = 1) {
        if (iconType === 'sun') {
            return isDay ? `
                <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="4" fill="#f59e0b" fill-opacity="0.25"/>
                    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
                </svg>
            ` : `
                <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" fill="#38bdf8" fill-opacity="0.25"/>
                </svg>
            `;
        }
        if (iconType === 'thunderstorm') {
            return `
                <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="#a855f7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" fill="#a855f7" fill-opacity="0.15"/>
                    <path d="m13 11-4 6h4l-2 5" stroke="#facc15" stroke-width="2.2"/>
                </svg>
            `;
        }
        if (iconType === 'rain' || iconType === 'rain-heavy' || iconType === 'rain-drizzle') {
            return `
                <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M17.5 15H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" fill="#38bdf8" fill-opacity="0.15"/>
                    <path d="M8 19v2M12 19v2M16 19v2" stroke="#38bdf8" stroke-width="2.2"/>
                </svg>
            `;
        }
        if (iconType === 'snow') {
            return `
                <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="#bae6fd" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M17.5 15H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" fill="#bae6fd" fill-opacity="0.15"/>
                    <path d="M8 18h.01M12 18h.01M16 18h.01M10 21h.01M14 21h.01"/>
                </svg>
            `;
        }
        // Cloud / Partly Cloudy default
        return `
            <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" fill="#94a3b8" fill-opacity="0.2"/>
                <circle cx="12" cy="7" r="3" stroke="#f59e0b" fill="#f59e0b" fill-opacity="0.3"/>
            </svg>
        `;
    }

    _formatTemp(tempC) {
        if (this.unit === 'f') {
            const f = (tempC * 9) / 5 + 32;
            return Math.round(f) + '°F';
        }
        return Math.round(tempC) + '°C';
    }

    async fetchWeatherData() {
        if (this.isLoading) return;
        this.isLoading = true;

        try {
            // If custom city name was given without coords, geocode it first
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

            // Fetch live current weather from Open-Meteo
            const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${this.latitude}&longitude=${this.longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m&timezone=auto`;
            const res = await fetch(weatherUrl);
            if (res.ok) {
                const data = await res.json();
                if (data && data.current) {
                    this.tempC = data.current.temperature_2m;
                    this.feelsLikeC = data.current.apparent_temperature;
                    this.humidity = data.current.relative_humidity_2m;
                    this.windSpeed = data.current.wind_speed_10m;
                    this.weatherCode = data.current.weather_code;
                    this.isDay = data.current.is_day;
                    this.precipitation = data.current.precipitation || 0.0;
                    this._updateUI();
                }
            }
        } catch (e) {
            console.warn('[WeatherWidget] Weather fetch fallback:', e);
        } finally {
            this.isLoading = false;
        }
    }

    render() {
        const info = this._getWeatherInfo();

        this.containerEl.innerHTML = `
            <div class="nexus-widget">
                <div class="nexus-sol-weather-card">
                    <!-- Top Bar -->
                    <div class="nexus-weather-top-bar">
                        <div class="nexus-widget-title-badge">
                            <span class="nexus-widget-status-dot is-running-cyan"></span>
                            <span class="nexus-widget-title-text" data-weather-city>${this.resolvedCityName}</span>
                        </div>
                        <div class="nexus-weather-actions">
                            <button type="button" class="nexus-weather-unit-btn ${this.unit === 'c' ? 'is-active' : ''}" data-action="toggle-unit">
                                ${this.unit === 'c' ? '°C' : '°F'}
                            </button>
                            <button type="button" class="nexus-weather-refresh-btn" data-action="refresh" title="Refresh weather">
                                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
                                </svg>
                            </button>
                        </div>
                    </div>

                    <!-- Main Hero: Big Temperature & Weather Icon -->
                    <div class="nexus-weather-hero-row">
                        <div class="nexus-weather-temp-block">
                            <span class="nexus-weather-temp-val" data-weather-temp>${this._formatTemp(this.tempC)}</span>
                            <span class="nexus-weather-condition-tag" data-weather-condition style="color: ${info.color}">
                                ${info.label}
                            </span>
                        </div>
                        <div class="nexus-weather-icon-box" data-weather-icon-box>
                            ${this._renderWeatherIconSvg(info.icon, this.isDay)}
                        </div>
                    </div>

                    <!-- Environmental Metrics Grid (Feels Like, Humidity, Wind, Precip) -->
                    <div class="nexus-weather-stats-grid">
                        <div class="nexus-weather-stat-item">
                            <span class="nexus-weather-stat-label">Feels Like</span>
                            <span class="nexus-weather-stat-val" data-weather-feels>${this._formatTemp(this.feelsLikeC)}</span>
                        </div>
                        <div class="nexus-weather-stat-item">
                            <span class="nexus-weather-stat-label">Humidity</span>
                            <span class="nexus-weather-stat-val" data-weather-humidity>${this.humidity}%</span>
                        </div>
                        <div class="nexus-weather-stat-item">
                            <span class="nexus-weather-stat-label">Wind</span>
                            <span class="nexus-weather-stat-val" data-weather-wind>${this.windSpeed.toFixed(1)} km/h</span>
                        </div>
                        <div class="nexus-weather-stat-item">
                            <span class="nexus-weather-stat-label">Precipitation</span>
                            <span class="nexus-weather-stat-val" data-weather-precip>${this.precipitation.toFixed(1)} mm</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    _updateUI() {
        const info = this._getWeatherInfo();

        const cityEl = this.containerEl.querySelector('[data-weather-city]');
        if (cityEl) cityEl.textContent = this.resolvedCityName;

        const tempEl = this.containerEl.querySelector('[data-weather-temp]');
        if (tempEl) tempEl.textContent = this._formatTemp(this.tempC);

        const condEl = this.containerEl.querySelector('[data-weather-condition]');
        if (condEl) {
            condEl.textContent = info.label;
            condEl.style.color = info.color;
        }

        const iconBox = this.containerEl.querySelector('[data-weather-icon-box]');
        if (iconBox) iconBox.innerHTML = this._renderWeatherIconSvg(info.icon, this.isDay);

        const feelsEl = this.containerEl.querySelector('[data-weather-feels]');
        if (feelsEl) feelsEl.textContent = this._formatTemp(this.feelsLikeC);

        const humEl = this.containerEl.querySelector('[data-weather-humidity]');
        if (humEl) humEl.textContent = `${this.humidity}%`;

        const windEl = this.containerEl.querySelector('[data-weather-wind]');
        if (windEl) windEl.textContent = `${this.windSpeed.toFixed(1)} km/h`;

        const precipEl = this.containerEl.querySelector('[data-weather-precip]');
        if (precipEl) precipEl.textContent = `${this.precipitation.toFixed(1)} mm`;

        const unitBtn = this.containerEl.querySelector('[data-action="toggle-unit"]');
        if (unitBtn) unitBtn.textContent = this.unit === 'c' ? '°C' : '°F';
    }

    bindEvents() {
        if (this._eventsBound) return;
        this._eventsBound = true;

        this.containerEl.addEventListener('click', (e) => {
            // Unit toggle (°C / °F)
            const unitBtn = e.target.closest('[data-action="toggle-unit"]');
            if (unitBtn) {
                this.unit = this.unit === 'c' ? 'f' : 'c';
                this._updateUI();
                return;
            }

            // Refresh button
            const refreshBtn = e.target.closest('[data-action="refresh"]');
            if (refreshBtn) {
                refreshBtn.style.opacity = '0.5';
                setTimeout(() => { refreshBtn.style.opacity = '1'; }, 300);
                this.fetchWeatherData();
                return;
            }
        });
    }
}
