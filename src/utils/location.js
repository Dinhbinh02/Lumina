/**
 * UserLocation Service
 * Dynamically detects and caches the user's exact geographical location (City, Country, Timezone)
 * via client IP geolocation for AI context headers and location-aware widgets.
 * Pure dynamic detection — Zero hardcoded city fallbacks.
 */

const STORAGE_KEY = 'nexus_user_location';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours cache

let inMemoryLocation = null;

export const UserLocation = {
    /**
     * Get cached location or fetch dynamic location from IP geolocation
     * Returns null if offline or detection fails (never uses fake hardcoded city fallbacks).
     */
    async getLocation() {
        if (inMemoryLocation && (Date.now() - inMemoryLocation.timestamp < CACHE_TTL_MS)) {
            return inMemoryLocation;
        }

        // Try reading cached location from chrome.storage.local
        try {
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                const stored = await new Promise((resolve) => {
                    chrome.storage.local.get([STORAGE_KEY], (res) => resolve(res ? res[STORAGE_KEY] : null));
                });
                if (stored && stored.city && (Date.now() - (stored.timestamp || 0) < CACHE_TTL_MS)) {
                    inMemoryLocation = stored;
                    return inMemoryLocation;
                }
            }
        } catch (e) {
            console.warn('[UserLocation] Storage read error:', e);
        }

        // 1. Primary GeoIP Provider (ipwho.is)
        try {
            const res = await fetch('https://ipwho.is/', { cache: 'no-store' });
            if (res.ok) {
                const data = await res.json();
                if (data && data.success !== false && (data.city || data.region)) {
                    const city = data.city || data.region;
                    const country = data.country || '';
                    const loc = {
                        city: city,
                        region: data.region || '',
                        country: country,
                        latitude: typeof data.latitude === 'number' ? data.latitude : null,
                        longitude: typeof data.longitude === 'number' ? data.longitude : null,
                        timezone: data.timezone?.id || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
                        formatted: country ? `${city}, ${country}` : city,
                        timestamp: Date.now()
                    };

                    inMemoryLocation = loc;
                    this._saveToStorage(loc);
                    return loc;
                }
            }
        } catch (err) {
            console.warn('[UserLocation] Primary Geo lookup failed, trying secondary:', err);
        }

        // 2. Secondary GeoIP Provider (geojs.io)
        try {
            const res = await fetch('https://get.geojs.io/v1/ip/geo.json', { cache: 'no-store' });
            if (res.ok) {
                const data = await res.json();
                if (data && (data.city || data.region)) {
                    const city = data.city || data.region;
                    const country = data.country || '';
                    const loc = {
                        city: city,
                        region: data.region || '',
                        country: country,
                        latitude: data.latitude ? parseFloat(data.latitude) : null,
                        longitude: data.longitude ? parseFloat(data.longitude) : null,
                        timezone: data.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
                        formatted: country ? `${city}, ${country}` : city,
                        timestamp: Date.now()
                    };

                    inMemoryLocation = loc;
                    this._saveToStorage(loc);
                    return loc;
                }
            }
        } catch (err) {
            console.warn('[UserLocation] Secondary Geo lookup failed:', err);
        }

        // If offline or both lookups fail, return null (NO hardcoded fake city)
        return null;
    },

    /**
     * Manually set user location (e.g. from user profile or explicit user settings)
     */
    async setLocation(customLoc) {
        if (!customLoc || !customLoc.city) return null;
        const loc = {
            city: customLoc.city,
            region: customLoc.region || '',
            country: customLoc.country || '',
            latitude: customLoc.latitude || null,
            longitude: customLoc.longitude || null,
            timezone: customLoc.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
            formatted: customLoc.formatted || (customLoc.country ? `${customLoc.city}, ${customLoc.country}` : customLoc.city),
            timestamp: Date.now()
        };
        inMemoryLocation = loc;
        await this._saveToStorage(loc);
        return loc;
    },

    /**
     * Helper to save location object to chrome.storage
     */
    async _saveToStorage(loc) {
        try {
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                await new Promise((resolve) => {
                    chrome.storage.local.set({ [STORAGE_KEY]: loc }, resolve);
                });
            }
        } catch (e) {
            console.warn('[UserLocation] Storage save error:', e);
        }
    }
};
