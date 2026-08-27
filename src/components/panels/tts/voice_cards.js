export function renderVoiceCardHTML(voice, isSelected = false) {
    const isCustom = voice.isCustom || false;
    const accent = voice.accent || 'US';
    const gender = voice.gender || 'neutral';
    const desc = voice.description || '';
    
    return `
        <div class="lumina-voice-card\${isSelected ? ' selected' : ''}" data-voice-id="\${voice.id}">
            <div class="lumina-voice-card-header">
                <span class="lumina-voice-name">\${voice.name}</span>
                <span class="lumina-voice-badge">\${accent.toUpperCase()}</span>
            </div>
            <div class="lumina-voice-card-body">
                <span class="lumina-voice-gender">\${gender}</span>
                \${desc ? \`<p class="lumina-voice-desc">\${desc}</p>\` : ''}
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
