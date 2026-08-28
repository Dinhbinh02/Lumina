export function renderVoiceCardHTML(voice, isSelected = false) {
    const accent = voice.accent || 'US';
    const gender = voice.gender || 'neutral';
    const desc = voice.description || '';
    
    return `
        <div class="nexus-voice-card\${isSelected ? ' selected' : ''}" data-voice-id="\${voice.id}">
            <div class="nexus-voice-card-header">
                <span class="nexus-voice-name">\${voice.name}</span>
                <span class="nexus-voice-badge">\${accent.toUpperCase()}</span>
            </div>
            <div class="nexus-voice-card-body">
                <span class="nexus-voice-gender">\${gender}</span>
                \${desc ? \`<p class="nexus-voice-desc">\${desc}</p>\` : ''}
            </div>
        </div>
    `;
}

export function filterVoices(voices, { search = '', gender = 'all', accent = 'all' } = {}) {
    if (!Array.isArray(voices)) return [];
    return voices.filter(v => {
        if (gender !== 'all' && v.gender !== gender) return false;
        if (accent !== 'all' && v.accent !== accent) return false;
        if (search) {
            const query = search.toLowerCase();
            const matchName = v.name && v.name.toLowerCase().includes(query);
            const matchDesc = v.description && v.description.toLowerCase().includes(query);
            if (!matchName && !matchDesc) return false;
        }
        return true;
    });
}

export function getDefaultTTSPresets() {
    return [
        { id: 'preset_story', name: 'Storyteller', rate: 0.95, pitch: 1.0, voice: 'en-US-Neural2-F' },
        { id: 'preset_fast', name: 'Fast Review', rate: 1.35, pitch: 1.05, voice: 'en-US-Neural2-J' },
        { id: 'preset_news', name: 'News Broadcaster', rate: 1.05, pitch: 1.0, voice: 'en-US-Neural2-D' }
    ];
}
