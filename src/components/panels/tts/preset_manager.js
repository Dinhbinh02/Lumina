export class TTSPresetManager {
    static async getCustomPresets() {
        try {
            const raw = localStorage.getItem('lumina_tts_custom_presets');
            return raw ? JSON.parse(raw) : [];
        } catch (_) {
            return [];
        }
    }
    static async saveCustomPresets(presets) {
        try {
            localStorage.setItem('lumina_tts_custom_presets', JSON.stringify(presets));
        } catch (_) {}
    }
}
