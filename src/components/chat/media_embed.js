export function buildYoutubeEmbedUrl(href) {
    if (!href || href.startsWith('youtube://search')) return '';
    let id = '';
    let isPlaylist = false;
    if (href.startsWith('youtube://')) {
        id = href.replace('youtube://', '');
        if (id.startsWith('list_')) {
            id = id.replace('list_', '');
            isPlaylist = true;
        }
    } else if (href.includes('youtube.com/playlist')) {
        try {
            const urlParams = new URLSearchParams(new URL(href).search);
            id = urlParams.get('list') || '';
            isPlaylist = true;
        } catch (e) { }
    } else if (href.includes('youtube.com') || href.includes('youtu.be')) {
        const match = href.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
        id = match ? match[1] : '';
    }
    if (!id) return '';
    if (isPlaylist) {
        return `https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(id)}`;
    }
    return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`;
}

export function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
