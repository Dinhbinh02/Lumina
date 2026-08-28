export function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export function timeAgo(timestamp) {
    if (!timestamp) return '';
    const now = Date.now();
    const diff = Math.floor((now - timestamp) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function extractNoteText(content) {
    if (!content) return '';
    if (typeof content === 'string') {
        try {
            content = JSON.parse(content);
        } catch {
            return content.trim();
        }
    }
    if (content && Array.isArray(content.blocks)) {
        const texts = [];
        function parseBlock(b) {
            if (!b) return;
            if (Array.isArray(b.content)) {
                b.content.forEach(item => {
                    if (typeof item === 'string') texts.push(item);
                    else if (item && item.text) texts.push(item.text);
                });
            } else if (typeof b.content === 'string') {
                texts.push(b.content);
            }
            if (Array.isArray(b.children)) {
                b.children.forEach(parseBlock);
            }
        }
        content.blocks.forEach(parseBlock);
        return texts.join(' ').trim();
    }
    return '';
}

export function extractSearchSnippet(text, query, snippetLength = 120) {
    if (!text) return '';
    if (!query) return text.slice(0, snippetLength);
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const index = lowerText.indexOf(lowerQuery);
    if (index === -1) return text.slice(0, snippetLength);
    const start = Math.max(0, index - Math.floor(snippetLength / 3));
    const end = Math.min(text.length, start + snippetLength);
    let snippet = text.slice(start, end);
    if (start > 0) snippet = '...' + snippet;
    if (end < text.length) snippet = snippet + '...';
    return snippet;
}

export function highlightSnippet(snippet, query) {
    if (!query || !snippet) return escapeHtml(snippet);
    const escapedSnippet = escapeHtml(snippet);
    const escapedQuery = escapeHtml(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedQuery})`, 'gi');
    return escapedSnippet.replace(regex, '<mark class="nexus-search-match">$1</mark>');
}

export function filterNotesByCollection(notes, collectionId) {
    if (!Array.isArray(notes)) return [];
    if (!collectionId || collectionId === 'all') {
        return notes.filter(n => !n.isDeleted && !n.isArchived);
    }
    if (collectionId === 'trash') {
        return notes.filter(n => n.isDeleted);
    }
    if (collectionId === 'uncategorized') {
        return notes.filter(n => !n.isDeleted && !n.collectionId);
    }
    return notes.filter(n => !n.isDeleted && n.collectionId === collectionId);
}
