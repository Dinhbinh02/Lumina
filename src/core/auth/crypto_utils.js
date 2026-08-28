export async function compressData(string) {
    const byteArray = new TextEncoder().encode(string);
    const stream = new CompressionStream("gzip");
    const writer = stream.writable.getWriter();
    writer.write(byteArray);
    writer.close();
    const response = new Response(stream.readable);
    return await response.arrayBuffer();
}

export async function decompressData(arrayBuffer) {
    const stream = new DecompressionStream("gzip");
    const writer = stream.writable.getWriter();
    writer.write(new Uint8Array(arrayBuffer));
    writer.close();
    const response = new Response(stream.readable);
    const buffer = await response.arrayBuffer();
    return new TextDecoder().decode(buffer);
}

export async function sha256Hash(str) {
    try {
        const msgUint8 = new TextEncoder().encode(str);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
        let h = 5381;
        for (let i = 0; i < str.length; i++) {
            h = ((h << 5) + h) + str.charCodeAt(i);
            h |= 0;
        }
        return 'fallback_' + h.toString(36);
    }
}

export const isExcludedKey = (k) => [
    'google_oauth_token', 'google_oauth_token_time',
    'google_user_info', 'last_sync_time', 'last_sync_hash', 'last_sync_md5', 'last_sync_size', 'last_cloud_stats',
    'drive_uploaded_blobs', 'drive_backup_file_id',
    'settings_last_updated', 'optionsLastSection', 'optionsLastScroll', 'optionsScrollPositions',
    'sidepanel_active_tab_index', 'sidepanel_active_group_index', 'sidepanel_secondary_tab_index',
    'sidepanel_is_split_mode', 'sidepanel_split_ratio',
    'nexus_active_tab_index', 'nexus_active_group_index', 'nexus_secondary_tab_index',
    'nexus_is_split_mode', 'nexus_split_ratio',
    'nexusWindowId', 'pendingMicToggle',
    'nexusTemplatesV3', 'nexusBatchHistoryV3', 'lastUsedGenAIModel',
    'lastUsedBatchSize', 'lastUsedDeck', 'lastUsedTemplateId', 'ankiQuickNoteContent',
    'attachments'
].includes(k) || k.includes('_inst_') || k.startsWith('pending_sidepanel_query_') || k.startsWith('rot_') ||
    k === 'audio_cache' || k.startsWith('nexus_img_cache_') || k.startsWith('nexus_img_query_') || k.startsWith('spotlight_history_') || k.startsWith('yt_transcript_');
