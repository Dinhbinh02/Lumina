export class NexusWorldClockWidget {
    constructor(containerEl, props = {}) {
        this.containerEl = containerEl;
        this.label = props.label || props.title || 'World Clock';

        // Predefined popular cities & country alias map
        this.cityDatabase = {
            // Vietnam / Local
            'hanoi': { name: 'Hanoi, VN', tzName: 'ICT', tz: 'Asia/Ho_Chi_Minh' },
            'saigon': { name: 'Ho Chi Minh City, VN', tzName: 'ICT', tz: 'Asia/Ho_Chi_Minh' },
            'vietnam': { name: 'Hanoi, VN', tzName: 'ICT', tz: 'Asia/Ho_Chi_Minh' },
            'việt nam': { name: 'Hanoi, VN', tzName: 'ICT', tz: 'Asia/Ho_Chi_Minh' },

            // Australia & Oceania
            'sydney': { name: 'Sydney, Australia', tzName: 'AEST', tz: 'Australia/Sydney' },
            'melbourne': { name: 'Melbourne, Australia', tzName: 'AEST', tz: 'Australia/Melbourne' },
            'brisbane': { name: 'Brisbane, Australia', tzName: 'AEST', tz: 'Australia/Brisbane' },
            'perth': { name: 'Perth, Australia', tzName: 'AWST', tz: 'Australia/Perth' },
            'australia': { name: 'Sydney, Australia', tzName: 'AEST', tz: 'Australia/Sydney' },
            'úc': { name: 'Sydney, Australia', tzName: 'AEST', tz: 'Australia/Sydney' },
            'auckland': { name: 'Auckland, NZ', tzName: 'NZST', tz: 'Pacific/Auckland' },

            // Asia
            'tokyo': { name: 'Tokyo, Japan', tzName: 'JST', tz: 'Asia/Tokyo' },
            'japan': { name: 'Tokyo, Japan', tzName: 'JST', tz: 'Asia/Tokyo' },
            'nhật': { name: 'Tokyo, Japan', tzName: 'JST', tz: 'Asia/Tokyo' },
            'nhật bản': { name: 'Tokyo, Japan', tzName: 'JST', tz: 'Asia/Tokyo' },
            'seoul': { name: 'Seoul, South Korea', tzName: 'KST', tz: 'Asia/Seoul' },
            'korea': { name: 'Seoul, South Korea', tzName: 'KST', tz: 'Asia/Seoul' },
            'hàn quốc': { name: 'Seoul, South Korea', tzName: 'KST', tz: 'Asia/Seoul' },
            'beijing': { name: 'Beijing, China', tzName: 'CST', tz: 'Asia/Shanghai' },
            'shanghai': { name: 'Shanghai, China', tzName: 'CST', tz: 'Asia/Shanghai' },
            'china': { name: 'Beijing, China', tzName: 'CST', tz: 'Asia/Shanghai' },
            'trung quốc': { name: 'Beijing, China', tzName: 'CST', tz: 'Asia/Shanghai' },
            'singapore': { name: 'Singapore', tzName: 'SGT', tz: 'Asia/Singapore' },
            'bangkok': { name: 'Bangkok, Thailand', tzName: 'ICT', tz: 'Asia/Bangkok' },
            'thailand': { name: 'Bangkok, Thailand', tzName: 'ICT', tz: 'Asia/Bangkok' },
            'dubai': { name: 'Dubai, UAE', tzName: 'GST', tz: 'Asia/Dubai' },

            // Europe
            'london': { name: 'London, UK', tzName: 'GMT', tz: 'Europe/London' },
            'uk': { name: 'London, UK', tzName: 'GMT', tz: 'Europe/London' },
            'anh': { name: 'London, UK', tzName: 'GMT', tz: 'Europe/London' },
            'paris': { name: 'Paris, France', tzName: 'CEST', tz: 'Europe/Paris' },
            'france': { name: 'Paris, France', tzName: 'CEST', tz: 'Europe/Paris' },
            'pháp': { name: 'Paris, France', tzName: 'CEST', tz: 'Europe/Paris' },
            'berlin': { name: 'Berlin, Germany', tzName: 'CEST', tz: 'Europe/Berlin' },
            'germany': { name: 'Berlin, Germany', tzName: 'CEST', tz: 'Europe/Berlin' },
            'đức': { name: 'Berlin, Germany', tzName: 'CEST', tz: 'Europe/Berlin' },
            'rome': { name: 'Rome, Italy', tzName: 'CEST', tz: 'Europe/Rome' },
            'moscow': { name: 'Moscow, Russia', tzName: 'MSK', tz: 'Europe/Moscow' },

            // Americas
            'new york': { name: 'New York, NY', tzName: 'EDT', tz: 'America/New_York' },
            'ny': { name: 'New York, NY', tzName: 'EDT', tz: 'America/New_York' },
            'san francisco': { name: 'San Francisco, CA', tzName: 'PDT', tz: 'America/Los_Angeles' },
            'los angeles': { name: 'Los Angeles, CA', tzName: 'PDT', tz: 'America/Los_Angeles' },
            'california': { name: 'Los Angeles, CA', tzName: 'PDT', tz: 'America/Los_Angeles' },
            'us': { name: 'New York, NY', tzName: 'EDT', tz: 'America/New_York' },
            'usa': { name: 'New York, NY', tzName: 'EDT', tz: 'America/New_York' },
            'mỹ': { name: 'New York, NY', tzName: 'EDT', tz: 'America/New_York' },
            'chicago': { name: 'Chicago, IL', tzName: 'CDT', tz: 'America/Chicago' },
            'toronto': { name: 'Toronto, Canada', tzName: 'EDT', tz: 'America/Toronto' }
        };

        this.targetCity = this._resolveCity(props.cities || props.location || props.city);
        this.intervalId = null;
        this.render();
        this.startTicking();
    }

    _resolveCity(input) {
        if (!input) return this.cityDatabase['new york'];
        const clean = String(input).split(/[,;+&]/)[0].trim().toLowerCase();
        if (this.cityDatabase[clean]) return this.cityDatabase[clean];

        for (const [key, val] of Object.entries(this.cityDatabase)) {
            if (key.includes(clean) || clean.includes(key)) return val;
        }

        try {
            new Intl.DateTimeFormat('en-US', { timeZone: input.trim() });
            const parts = input.trim().split('/');
            return {
                name: parts[1]?.replace('_', ' ') || parts[0],
                tzName: 'TZ',
                tz: input.trim()
            };
        } catch (_) {
            return this.cityDatabase['new york'];
        }
    }

    _getTimeData(tz) {
        const now = new Date();
        try {
            // Target Time Parts
            const formatter = new Intl.DateTimeFormat('en-US', {
                timeZone: tz,
                hour12: false,
                year: 'numeric',
                month: 'numeric',
                day: 'numeric',
                hour: 'numeric',
                minute: 'numeric',
                second: 'numeric'
            });
            const parts = formatter.formatToParts(now);
            const p = {};
            parts.forEach(part => { p[part.type] = part.value; });

            const hours = parseInt(p.hour, 10);
            const minutes = parseInt(p.minute, 10);
            const seconds = parseInt(p.second, 10);
            const targetYear = parseInt(p.year, 10);
            const targetMonth = parseInt(p.month, 10);
            const targetDay = parseInt(p.day, 10);

            // Digital String HH:MM
            const hh = String(hours).padStart(2, '0');
            const mm = String(minutes).padStart(2, '0');
            const digitalTime = `${hh}:${mm}`;

            // Relative date vs local
            const localNow = new Date();
            let relativeDay = 'Today';
            if (targetDay > localNow.getDate() || targetMonth > localNow.getMonth() + 1) {
                relativeDay = 'Tomorrow';
            } else if (targetDay < localNow.getDate() || targetMonth < localNow.getMonth() + 1) {
                relativeDay = 'Yesterday';
            }

            // Time difference in hours vs local
            // Create UTC timestamps for comparison
            const targetUtc = new Date(Date.UTC(targetYear, targetMonth - 1, targetDay, hours, minutes, seconds));
            const localUtc = new Date(Date.UTC(localNow.getFullYear(), localNow.getMonth(), localNow.getDate(), localNow.getHours(), localNow.getMinutes(), localNow.getSeconds()));
            const diffHours = Math.round((targetUtc.getTime() - localUtc.getTime()) / (1000 * 60 * 60));

            let diffText = '';
            if (diffHours === 0) diffText = 'Same time';
            else if (diffHours > 0) diffText = `+${diffHours}hrs`;
            else diffText = `${diffHours}hrs`;

            // Analog clock angles
            const secAngle = (seconds / 60) * 360;
            const minAngle = ((minutes + seconds / 60) / 60) * 360;
            const hrAngle = (((hours % 12) + minutes / 60) / 12) * 360;

            return {
                digitalTime,
                relativeText: `${relativeDay}, ${diffText}`,
                secAngle,
                minAngle,
                hrAngle
            };
        } catch (e) {
            return {
                digitalTime: '--:--',
                relativeText: 'Time unavailable',
                secAngle: 0,
                minAngle: 0,
                hrAngle: 0
            };
        }
    }

    _generateClockNumbers() {
        const numbers = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
        const center = 44;
        const radius = 32;
        return numbers.map((num, idx) => {
            const angle = (idx * 30 - 90) * (Math.PI / 180);
            const x = center + radius * Math.cos(angle);
            const y = center + radius * Math.sin(angle);
            return `<text x="${x.toFixed(1)}" y="${(y + 3.5).toFixed(1)}" text-anchor="middle" class="nexus-analog-num">${num}</text>`;
        }).join('');
    }

    render() {
        const { digitalTime, relativeText, hrAngle, minAngle, secAngle } = this._getTimeData(this.targetCity.tz);

        this.containerEl.innerHTML = `
            <div class="nexus-widget">
                <div class="nexus-sol-clock-card">
                    <div class="nexus-sol-clock-left">
                        <div class="nexus-sol-clock-time" data-clock-digital>${digitalTime}</div>
                        <div class="nexus-sol-clock-title">${this._escapeHtml(this.targetCity.name)} (${this._escapeHtml(this.targetCity.tzName)})</div>
                        <div class="nexus-sol-clock-relative" data-clock-relative>${relativeText}</div>
                    </div>
                    <div class="nexus-sol-clock-right">
                        <svg class="nexus-sol-analog-clock" viewBox="0 0 88 88" width="88" height="88">
                            <!-- Clock Face Dial -->
                            <circle cx="44" cy="44" r="42" class="nexus-analog-dial" />
                            ${this._generateClockNumbers()}
                            <!-- Hour Hand -->
                            <line x1="44" y1="44" x2="44" y2="24" class="nexus-analog-hour-hand" data-clock-hour style="transform: rotate(${hrAngle}deg); transform-origin: 44px 44px;" />
                            <!-- Minute Hand -->
                            <line x1="44" y1="44" x2="44" y2="16" class="nexus-analog-min-hand" data-clock-min style="transform: rotate(${minAngle}deg); transform-origin: 44px 44px;" />
                            <!-- Second Hand (Accent Blue) -->
                            <line x1="44" y1="50" x2="44" y2="13" class="nexus-analog-sec-hand" data-clock-sec style="transform: rotate(${secAngle}deg); transform-origin: 44px 44px;" />
                            <!-- Pivot Center Cap -->
                            <circle cx="44" cy="44" r="3" class="nexus-analog-center-cap" />
                        </svg>
                    </div>
                </div>
            </div>
        `;
    }

    startTicking() {
        if (this.intervalId) clearInterval(this.intervalId);
        this.intervalId = setInterval(() => {
            const { digitalTime, relativeText, hrAngle, minAngle, secAngle } = this._getTimeData(this.targetCity.tz);

            const digitalEl = this.containerEl.querySelector('[data-clock-digital]');
            const relativeEl = this.containerEl.querySelector('[data-clock-relative]');
            const hrHand = this.containerEl.querySelector('[data-clock-hour]');
            const minHand = this.containerEl.querySelector('[data-clock-min]');
            const secHand = this.containerEl.querySelector('[data-clock-sec]');

            if (digitalEl) digitalEl.textContent = digitalTime;
            if (relativeEl) relativeEl.textContent = relativeText;
            if (hrHand) hrHand.style.transform = `rotate(${hrAngle}deg)`;
            if (minHand) minHand.style.transform = `rotate(${minAngle}deg)`;
            if (secHand) secHand.style.transform = `rotate(${secAngle}deg)`;
        }, 1000);
    }

    _escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
}
