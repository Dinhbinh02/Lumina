/**
 * Weather Forecast Widget (.nexus-sol-forecast-card)
 * Rich Extended Weather Dashboard via Open-Meteo API (0đ, No key required)
 * Displays:
 *  1. Current header with live condition & high/low range
 *  2. 24-Hour hourly forecast scroller with precipitation probability
 *  3. 7-Day extended forecast with Apple Weather-style dynamic range bars
 *  4. Quick metrics bar (Humidity, Wind, UV Index, Feels-like)
 */

import { WMO_WEATHER_CODES } from './weather_widget.js';

export class WeatherForecastWidget {
    constructor(containerEl, props = {}) {
        this.containerEl = containerEl;
        this.label = props.label || props.title || '7-Day Forecast';

        this.city = props.city || props.location || props.name || 'Hanoi';
        this.unit = (props.unit || 'c').toLowerCase(); // 'c' or 'f'

        this.latitude = parseFloat(props.lat || props.latitude) || 21.0285;
        this.longitude = parseFloat(props.lon || props.longitude) || 105.8542;
        this.resolvedCityName = this.city;

        this.current = {
            temp: 28,
            feelsLike: 31,
            humidity: 75,
            windSpeed: 12,
            weatherCode: 1
        };
        this.hourly = [];
        this.days = [];
        this.todayUv = 6;
        this.isLoading = false;
        this._eventsBound = false;

        this.render();
        this.bindEvents();
        this.fetchForecastData();
    }

    _formatTemp(tempC) {
        if (tempC === null || tempC === undefined || isNaN(tempC)) return '--°';
        if (this.unit === 'f') {
            const f = (tempC * 9) / 5 + 32;
            return Math.round(f) + '°';
        }
        return Math.round(tempC) + '°';
    }

    _getDayLabel(dateStr, idx) {
        if (idx === 0) return 'Today';
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-US', { weekday: 'short' });
    }

    _renderSmallWeatherIcon(iconType) {
        if (iconType === 'sun') {
            return `
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="4" fill="#f59e0b" fill-opacity="0.25"/>
                    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
                </svg>
            `;
        }
        if (iconType === 'thunderstorm') {
            return `
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#a855f7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>
                    <path d="m13 11-4 6h4l-2 5" stroke="#facc15" stroke-width="2"/>
                </svg>
            `;
        }
        if (iconType === 'rain' || iconType === 'rain-heavy' || iconType === 'rain-drizzle') {
            return `
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M17.5 15H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>
                    <path d="M8 18v2M12 18v2M16 18v2" stroke="#38bdf8" stroke-width="2"/>
                </svg>
            `;
        }
        if (iconType === 'snow') {
            return `
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#bae6fd" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M17.5 15H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>
                    <path d="M8 18h.01M12 18h.01M16 18h.01"/>
                </svg>
            `;
        }
        return `
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>
            </svg>
        `;
    }

    async fetchForecastData() {
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

            const url = `https://api.open-meteo.com/v1/forecast?latitude=${this.latitude}&longitude=${this.longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&hourly=temperature_2m,weather_code,precipitation_probability&daily=weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,uv_index_max,precipitation_probability_max,wind_speed_10m_max&timezone=auto`;
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();

                // 1. Current Weather
                if (data.current) {
                    this.current = {
                        temp: data.current.temperature_2m,
                        feelsLike: data.current.apparent_temperature,
                        humidity: data.current.relative_humidity_2m,
                        windSpeed: data.current.wind_speed_10m,
                        weatherCode: data.current.weather_code
                    };
                }

                // 2. 24-Hour Forecast
                if (data.hourly && Array.isArray(data.hourly.time)) {
                    const currentHourIso = new Date().toISOString().slice(0, 13);
                    let startIdx = data.hourly.time.findIndex(t => t.startsWith(currentHourIso));
                    if (startIdx === -1) startIdx = 0;

                    this.hourly = data.hourly.time.slice(startIdx, startIdx + 16).map((timeStr, idx) => {
                        const code = data.hourly.weather_code[startIdx + idx];
                        const temp = data.hourly.temperature_2m[startIdx + idx];
                        const pop = data.hourly.precipitation_probability ? data.hourly.precipitation_probability[startIdx + idx] : 0;
                        const dateObj = new Date(timeStr);
                        const label = idx === 0 ? 'Now' : dateObj.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true });
                        const info = WMO_WEATHER_CODES[code] || { label: 'Clear', icon: 'sun', color: '#f59e0b' };

                        return {
                            label,
                            temp,
                            pop,
                            code,
                            info
                        };
                    });
                }

                // 3. 7-Day Extended Forecast
                if (data.daily && Array.isArray(data.daily.time)) {
                    this.todayUv = data.daily.uv_index_max ? Math.round(data.daily.uv_index_max[0]) : 6;
                    this.days = data.daily.time.slice(0, 7).map((dateStr, idx) => {
                        const code = data.daily.weather_code[idx];
                        const info = WMO_WEATHER_CODES[code] || { label: 'Clear', icon: 'sun', color: '#f59e0b' };
                        return {
                            date: dateStr,
                            label: this._getDayLabel(dateStr, idx),
                            maxTemp: data.daily.temperature_2m_max[idx],
                            minTemp: data.daily.temperature_2m_min[idx],
                            precipProb: data.daily.precipitation_probability_max ? data.daily.precipitation_probability_max[idx] : 0,
                            code,
                            info
                        };
                    });
                }

                this._updateUI();
            }
        } catch (e) {
            console.warn('[WeatherForecastWidget] Fetch fallback:', e);
        } finally {
            this.isLoading = false;
        }
    }

    _getWeekBounds() {
        if (!this.days || this.days.length === 0) return { weekMin: 20, weekMax: 35, span: 15 };
        const mins = this.days.map(d => d.minTemp);
        const maxs = this.days.map(d => d.maxTemp);
        const weekMin = Math.min(...mins);
        const weekMax = Math.max(...maxs);
        return {
            weekMin,
            weekMax,
            span: Math.max(weekMax - weekMin, 1)
        };
    }

    _renderDayRowHtml(d, weekBounds) {
        const leftPercent = Math.max(0, Math.min(100, ((d.minTemp - weekBounds.weekMin) / weekBounds.span) * 100));
        const rightPercent = Math.max(0, Math.min(100, ((d.maxTemp - weekBounds.weekMin) / weekBounds.span) * 100));
        const barWidth = Math.max(12, rightPercent - leftPercent);
        const rainClass = d.precipProb >= 40 ? 'is-rain-high' : (d.precipProb > 0 ? 'is-rain-low' : 'is-rain-zero');

        return `
            <div class="nexus-forecast-day-row">
                <span class="nexus-forecast-day-name ${d.label === 'Today' ? 'is-today' : ''}">${d.label}</span>
                <div class="nexus-forecast-day-icon-col">
                    <span class="nexus-forecast-mini-icon">${this._renderSmallWeatherIcon(d.info.icon)}</span>
                    <span class="nexus-forecast-rain-prob ${rainClass}">${d.precipProb}%</span>
                </div>
                <span class="nexus-forecast-min-temp">${this._formatTemp(d.minTemp)}</span>
                <div class="nexus-forecast-bar-track">
                    <div class="nexus-forecast-bar-fill" style="left: ${leftPercent.toFixed(1)}%; width: ${barWidth.toFixed(1)}%;"></div>
                </div>
                <span class="nexus-forecast-max-temp">${this._formatTemp(d.maxTemp)}</span>
            </div>
        `;
    }

    _renderHourlyScrollerHtml() {
        if (!this.hourly || this.hourly.length === 0) return '';
        return `
            <div class="nexus-forecast-hourly-scroller">
                ${this.hourly.map(h => `
                    <div class="nexus-forecast-hour-card">
                        <span class="nexus-forecast-hour-time">${h.label}</span>
                        <span class="nexus-forecast-hour-icon">${this._renderSmallWeatherIcon(h.info.icon)}</span>
                        <span class="nexus-forecast-hour-pop">${h.pop >= 15 ? `${h.pop}%` : '&nbsp;'}</span>
                        <span class="nexus-forecast-hour-temp">${this._formatTemp(h.temp)}</span>
                    </div>
                `).join('')}
            </div>
        `;
    }

    render() {
        const hasDays = this.days && this.days.length > 0;
        const weekBounds = this._getWeekBounds();
        const currentInfo = WMO_WEATHER_CODES[this.current.weatherCode] || { label: 'Clear Sky', icon: 'sun' };
        const todayHigh = this.days.length > 0 ? this._formatTemp(this.days[0].maxTemp) : '--';
        const todayLow = this.days.length > 0 ? this._formatTemp(this.days[0].minTemp) : '--';

        this.containerEl.innerHTML = `
            <div class="nexus-widget">
                <div class="nexus-sol-forecast-card">
                    <!-- Top Bar with Integrated Control Group -->
                    <div class="nexus-forecast-top-bar">
                        <div class="nexus-forecast-header-left">
                            <div class="nexus-widget-title-badge">
                                <span class="nexus-widget-status-dot is-running-cyan"></span>
                                <span class="nexus-widget-title-text" data-forecast-city>${this.resolvedCityName}</span>
                            </div>
                            <span class="nexus-forecast-subtitle" data-forecast-subtitle>${currentInfo.label} • H: ${todayHigh} L: ${todayLow}</span>
                        </div>
                        <div class="nexus-forecast-control-group">
                            <button type="button" class="nexus-forecast-pill-btn" data-action="toggle-unit" title="Switch °C / °F">
                                <span class="${this.unit === 'c' ? 'is-active' : ''}">°C</span>
                                <span class="nexus-forecast-pill-divider">/</span>
                                <span class="${this.unit === 'f' ? 'is-active' : ''}">°F</span>
                            </button>
                            <button type="button" class="nexus-forecast-ghost-btn" data-action="refresh" title="Refresh weather data">
                                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
                                </svg>
                            </button>
                        </div>
                    </div>

                    <!-- Hourly 24H Carousel -->
                    <div class="nexus-forecast-hourly-section" data-forecast-hourly>
                        ${this._renderHourlyScrollerHtml()}
                    </div>

                    <!-- 7-Day Extended Forecast Grid -->
                    <div class="nexus-forecast-days-list" data-forecast-days>
                        ${hasDays ? this.days.map(d => this._renderDayRowHtml(d, weekBounds)).join('') : `
                            <div class="nexus-forecast-loading-state">Loading weather forecast...</div>
                        `}
                    </div>

                    <!-- Bottom Quick Insights Bar -->
                    <div class="nexus-forecast-insights-bar" data-forecast-insights>
                        <div class="nexus-forecast-insight-item">
                            <span class="nexus-forecast-insight-label">HUMIDITY</span>
                            <span class="nexus-forecast-insight-val">${this.current.humidity}%</span>
                        </div>
                        <div class="nexus-forecast-insight-item">
                            <span class="nexus-forecast-insight-label">WIND</span>
                            <span class="nexus-forecast-insight-val">${Math.round(this.current.windSpeed)} km/h</span>
                        </div>
                        <div class="nexus-forecast-insight-item">
                            <span class="nexus-forecast-insight-label">PEAK UV</span>
                            <span class="nexus-forecast-insight-val">${this.todayUv}</span>
                        </div>
                        <div class="nexus-forecast-insight-item">
                            <span class="nexus-forecast-insight-label">FEELS LIKE</span>
                            <span class="nexus-forecast-insight-val">${this._formatTemp(this.current.feelsLike)}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    _updateUI() {
        const cityEl = this.containerEl.querySelector('[data-forecast-city]');
        if (cityEl) cityEl.textContent = this.resolvedCityName;

        const currentInfo = WMO_WEATHER_CODES[this.current.weatherCode] || { label: 'Clear Sky', icon: 'sun' };
        const todayHigh = this.days.length > 0 ? this._formatTemp(this.days[0].maxTemp) : '--';
        const todayLow = this.days.length > 0 ? this._formatTemp(this.days[0].minTemp) : '--';

        const subEl = this.containerEl.querySelector('[data-forecast-subtitle]');
        if (subEl) subEl.textContent = `${currentInfo.label} • H: ${todayHigh} L: ${todayLow}`;

        const hourlyEl = this.containerEl.querySelector('[data-forecast-hourly]');
        if (hourlyEl) hourlyEl.innerHTML = this._renderHourlyScrollerHtml();

        const listEl = this.containerEl.querySelector('[data-forecast-days]');
        if (listEl && this.days.length > 0) {
            const weekBounds = this._getWeekBounds();
            listEl.innerHTML = this.days.map(d => this._renderDayRowHtml(d, weekBounds)).join('');
        }

        const insightsEl = this.containerEl.querySelector('[data-forecast-insights]');
        if (insightsEl) {
            insightsEl.innerHTML = `
                <div class="nexus-forecast-insight-item">
                    <span class="nexus-forecast-insight-label">HUMIDITY</span>
                    <span class="nexus-forecast-insight-val">${this.current.humidity}%</span>
                </div>
                <div class="nexus-forecast-insight-item">
                    <span class="nexus-forecast-insight-label">WIND</span>
                    <span class="nexus-forecast-insight-val">${Math.round(this.current.windSpeed)} km/h</span>
                </div>
                <div class="nexus-forecast-insight-item">
                    <span class="nexus-forecast-insight-label">PEAK UV</span>
                    <span class="nexus-forecast-insight-val">${this.todayUv}</span>
                </div>
                <div class="nexus-forecast-insight-item">
                    <span class="nexus-forecast-insight-label">FEELS LIKE</span>
                    <span class="nexus-forecast-insight-val">${this._formatTemp(this.current.feelsLike)}</span>
                </div>
            `;
        }

        const unitBtn = this.containerEl.querySelector('[data-action="toggle-unit"]');
        if (unitBtn) {
            unitBtn.innerHTML = `
                <span class="${this.unit === 'c' ? 'is-active' : ''}">°C</span>
                <span class="nexus-forecast-pill-divider">/</span>
                <span class="${this.unit === 'f' ? 'is-active' : ''}">°F</span>
            `;
        }
    }

    bindEvents() {
        if (this._eventsBound) return;
        this._eventsBound = true;

        this.containerEl.addEventListener('click', (e) => {
            const unitBtn = e.target.closest('[data-action="toggle-unit"]');
            if (unitBtn) {
                this.unit = this.unit === 'c' ? 'f' : 'c';
                this._updateUI();
                return;
            }

            const refreshBtn = e.target.closest('[data-action="refresh"]');
            if (refreshBtn) {
                refreshBtn.style.opacity = '0.5';
                setTimeout(() => { refreshBtn.style.opacity = '1'; }, 300);
                this.fetchForecastData();
                return;
            }
        });
    }
}
