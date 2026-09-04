import { NexusSync } from './drive_sync.js';
import { isExcludedKey } from './crypto_utils.js';

async function gatherLocalStats() {
    const stats = {
        storage: {},
        chats: { sessionCount: 0, sessions: [] },
        notes: { collectionsCount: 0, notesCount: 0 },
        highlights: { urlCount: 0 },
        tts: { recordingsCount: 0 },
        apps: { count: 0, list: [] },
        attachments: { count: 0 }
    };

    const allLocal = await chrome.storage.local.get(null);

    for (const [k, v] of Object.entries(allLocal)) {
        if (isExcludedKey(k) || k.startsWith('nexus_session_')) continue;
        const size = JSON.stringify(v).length;
        stats.storage[k] = { size, preview: JSON.stringify(v).slice(0, 80) };
    }

    try {
        const customAppsRes = await chrome.storage.local.get(['nexus_custom_apps']);
        const customApps = customAppsRes.nexus_custom_apps || {};
        const appList = Object.values(customApps);
        stats.apps.count = appList.length;
        stats.apps.list = appList.map(a => ({ id: a.id, name: a.name, updatedAt: a.updatedAt ? new Date(a.updatedAt).toLocaleString() : '?' }));
    } catch (e) {
        stats.apps.error = e.message;
    }

    if (typeof NexusChatDB !== 'undefined') {
        try {
            const sessions = await NexusChatDB.getAllSessions().catch(() => ({}));
            const sessionList = Object.values(sessions).filter(s => s && !s.isDeleted);
            stats.chats.sessionCount = sessionList.length;
            stats.chats.sessions = sessionList.map(s => ({
                id: s.id,
                title: s.title || '(no title)',
                updatedAt: s.updatedAt ? new Date(s.updatedAt).toLocaleString() : '?',
                messageCount: s.messageCount || '?'
            }));
        } catch (e) {
            stats.chats.error = e.message;
        }
    }

    if (typeof NotesManager !== 'undefined') {
        try {
            const notes = await NotesManager.getNotes().catch(() => []);
            const cols = await NotesManager.getCollections().catch(() => []);
            stats.notes.notesCount = notes.filter(n => n && !n.isDeleted).length;
            stats.notes.collectionsCount = cols.length;
        } catch (e) {
            stats.notes.error = e.message;
        }
    }

    if (typeof NexusAnnotationDB !== 'undefined') {
        try {
            const highlights = await NexusAnnotationDB.getAll().catch(() => ({}));
            stats.highlights.urlCount = Object.keys(highlights).filter(k => k.startsWith('highlights_')).length;
        } catch (e) {
            stats.highlights.error = e.message;
        }
    }

    if (typeof TTSDB !== 'undefined') {
        try {
            const recs = await TTSDB.getAllRecordings().catch(() => []);
            stats.tts.recordingsCount = recs.filter(r => r && !r.isDeleted).length;
        } catch (e) {
            stats.tts.error = e.message;
        }
    }

    if (typeof NexusAttachmentDB !== 'undefined') {
        try {
            const meta = await NexusAttachmentDB.getAllMetadata().catch(() => []);
            stats.attachments.count = meta.length;
        } catch (e) {
            stats.attachments.error = e.message;
        }
    }

    return stats;
}

async function gatherCloudStats(token) {
    const stats = {
        backupFile: null,
        chats: { sessionCount: 0, sessions: [] },
        notes: { collectionsCount: 0, notesCount: 0 },
        highlights: { urlCount: 0 },
        tts: { recordingsCount: 0 },
        apps: { count: 0, list: [] },
        attachments: { count: 0 },
        driveFiles: []
    };

    const { token: activeToken, remoteFile, fileId, driveFiles } = await NexusSync.getOrFindBackupFile(token, true);

    stats.driveFiles = (driveFiles || []).map(f => ({
        name: f.name,
        size: f.size,
        md5: f.md5Checksum,
        modifiedTime: f.modifiedTime
    }));

    if (!remoteFile || !fileId) {
        stats.backupFile = null;
        return { stats, activeToken };
    }

    stats.backupFile = {
        id: remoteFile.id,
        md5: remoteFile.md5Checksum,
        size: parseInt(remoteFile.size || 0),
        modifiedTime: remoteFile.modifiedTime
    };

    const backup = await NexusSync.downloadBackup(activeToken, fileId);
    if (!backup || !backup.data) return { stats, activeToken };

    const data = backup.data;

    const cloudSessions = data.nexus_chat_sessions || {};
    const activeCloudSessions = Object.values(cloudSessions).filter(s => s && !s.isDeleted);
    stats.chats.sessionCount = activeCloudSessions.length;
    stats.chats.sessions = activeCloudSessions.map(s => ({
        id: s.id,
        title: s.title || '(no title)',
        updatedAt: s.updatedAt ? new Date(s.updatedAt).toLocaleString() : '?',
        messageCount: s.messageCount || '?'
    }));

    const cloudNotes = data.nexus_notes_items || [];
    const cloudCols = data.nexus_notes_collections || [];
    stats.notes.notesCount = cloudNotes.filter(n => n && !n.isDeleted).length;
    stats.notes.collectionsCount = cloudCols.length;

    stats.highlights.urlCount = Object.keys(data).filter(k => k.startsWith('highlights_')).length;

    const cloudTts = data.nexus_tts_recordings || [];
    stats.tts.recordingsCount = cloudTts.filter(r => r && !r.isDeleted).length;

    const cloudApps = data.nexus_custom_apps || {};
    const appList = Object.values(cloudApps);
    stats.apps.count = appList.length;
    stats.apps.list = appList.map(a => ({ id: a.id, name: a.name, updatedAt: a.updatedAt ? new Date(a.updatedAt).toLocaleString() : '?' }));

    const attFiles = (driveFiles || []).filter(f => f.name.startsWith('att_') && f.name.endsWith('.bin'));
    stats.attachments.count = attFiles.length;

    return { stats, activeToken, rawData: data };
}

function printSection(title, data) {
    console.groupCollapsed(`%c${title}`, 'color: #7c9fd4; font-weight: bold; font-size: 13px;');
    console.table(data);
    console.groupEnd();
}

function compareSessionLists(local, cloud) {
    const localMap = new Map(local.map(s => [s.id, s]));
    const cloudMap = new Map(cloud.map(s => [s.id, s]));

    const onlyLocal = local.filter(s => !cloudMap.has(s.id));
    const onlyCloud = cloud.filter(s => !localMap.has(s.id));
    const inBoth = local.filter(s => cloudMap.has(s.id));

    return { onlyLocal, onlyCloud, inBoth };
}

export async function debugSync() {
    console.group('%c🔍 NEXUS SYNC DEBUGGER', 'color: #a78bfa; font-weight: bold; font-size: 15px;');
    console.log('%cGathering local data...', 'color: #6ee7b7');

    let localStats;
    try {
        localStats = await gatherLocalStats();
    } catch (e) {
        console.error('[SyncDebug] Failed to gather local stats:', e);
        console.groupEnd();
        return;
    }

    const syncStorageData = await chrome.storage.local.get([
        'last_sync_time', 'last_sync_md5', 'last_sync_size', 'last_cloud_stats',
        'drive_backup_file_id', 'google_user_info'
    ]);

    const isAuthenticated = typeof NexusAuth !== 'undefined'
        ? NexusAuth.isAuthenticated
        : !!syncStorageData.google_user_info;

    let token = null;
    if (isAuthenticated) {
        try {
            token = await NexusSync.getToken(false);
        } catch (e) {
            console.warn('[SyncDebug] Could not get token:', e.message);
        }
    }

    const lastSyncAt = syncStorageData.last_sync_time
        ? new Date(syncStorageData.last_sync_time).toLocaleString()
        : 'Never';

    console.log('%cSync state:', 'color: #fbbf24; font-weight: bold');
    console.table({
        'Authenticated': isAuthenticated ? '✅ Yes' : '❌ No',
        'Token acquired': token ? '✅ Yes' : '❌ No',
        'Last sync': lastSyncAt,
        'Last sync MD5': syncStorageData.last_sync_md5 || '—',
        'Last sync size': syncStorageData.last_sync_size ? `${(syncStorageData.last_sync_size / 1024).toFixed(1)} KB` : '—',
        'Backup file ID': syncStorageData.drive_backup_file_id || '—'
    });

    console.log('%c📱 LOCAL DATA', 'color: #6ee7b7; font-weight: bold; font-size: 14px;');
    console.table({
        'Chat sessions': localStats.chats.sessionCount,
        'Notes': localStats.notes.notesCount,
        'Note collections': localStats.notes.collectionsCount,
        'Highlighted URLs': localStats.highlights.urlCount,
        'TTS recordings': localStats.tts.recordingsCount,
        'Custom apps': localStats.apps.count,
        'Attachments': localStats.attachments.count
    });

    if (localStats.chats.sessions.length > 0) {
        printSection('📝 Local sessions', localStats.chats.sessions);
    }

    if (!isAuthenticated || !token) {
        console.warn('%c⚠️ Not authenticated or token unavailable - cannot check cloud data.', 'color: #f87171');
        console.groupEnd();
        return { local: localStats, cloud: null };
    }

    console.log('%cFetching cloud data...', 'color: #6ee7b7');

    let cloudStats;
    let rawCloudData;
    try {
        const result = await gatherCloudStats(token);
        cloudStats = result.stats;
        rawCloudData = result.rawData;
    } catch (e) {
        console.error('[SyncDebug] Failed to fetch cloud stats:', e);
        console.groupEnd();
        return { local: localStats, cloud: null, error: e.message };
    }

    console.log('%c☁️ CLOUD DATA', 'color: #93c5fd; font-weight: bold; font-size: 14px;');
    if (cloudStats.backupFile) {
        const backupAge = cloudStats.backupFile.modifiedTime
            ? `${Math.round((Date.now() - new Date(cloudStats.backupFile.modifiedTime).getTime()) / 60000)} min ago`
            : '?';
        console.table({
            'Backup file ID': cloudStats.backupFile.id,
            'Backup size': `${(cloudStats.backupFile.size / 1024).toFixed(1)} KB`,
            'Last modified': backupAge,
            'MD5': cloudStats.backupFile.md5
        });
    } else {
        console.warn('%c⚠️ No backup file found on Google Drive.', 'color: #f87171');
    }

    console.table({
        'Chat sessions': cloudStats.chats.sessionCount,
        'Notes': cloudStats.notes.notesCount,
        'Note collections': cloudStats.notes.collectionsCount,
        'Highlighted URLs': cloudStats.highlights.urlCount,
        'TTS recordings': cloudStats.tts.recordingsCount,
        'Custom apps': cloudStats.apps.count,
        'Attachments': cloudStats.attachments.count
    });

    if (cloudStats.chats.sessions.length > 0) {
        printSection('📝 Cloud sessions', cloudStats.chats.sessions);
    }

    console.log('%c🔀 DIFF (local vs cloud)', 'color: #f9a8d4; font-weight: bold; font-size: 14px;');

    const diff = {
        'Chat sessions (local)': localStats.chats.sessionCount,
        'Chat sessions (cloud)': cloudStats.chats.sessionCount,
        'Notes (local)': localStats.notes.notesCount,
        'Notes (cloud)': cloudStats.notes.notesCount,
        'Highlights (local)': localStats.highlights.urlCount,
        'Highlights (cloud)': cloudStats.highlights.urlCount,
        'TTS (local)': localStats.tts.recordingsCount,
        'TTS (cloud)': cloudStats.tts.recordingsCount,
        'Apps (local)': localStats.apps.count,
        'Apps (cloud)': cloudStats.apps.count,
        'Attachments (local)': localStats.attachments.count,
        'Attachments (cloud)': cloudStats.attachments.count
    };
    console.table(diff);

    const chatDiff = compareSessionLists(localStats.chats.sessions, cloudStats.chats.sessions);

    if (chatDiff.onlyLocal.length > 0) {
        console.warn('%c⚠️ Sessions ONLY on local (not synced to cloud):', 'color: #fbbf24; font-weight: bold');
        console.table(chatDiff.onlyLocal);
    }

    if (chatDiff.onlyCloud.length > 0) {
        console.warn('%c⚠️ Sessions ONLY on cloud (not pulled to local):', 'color: #fbbf24; font-weight: bold');
        console.table(chatDiff.onlyCloud);
    }

    const isMd5Match = syncStorageData.last_sync_md5 && cloudStats.backupFile?.md5
        && syncStorageData.last_sync_md5 === cloudStats.backupFile.md5;

    console.log('%c📊 SYNC HEALTH', 'color: #a3e635; font-weight: bold; font-size: 14px;');
    console.table({
        'MD5 match (local cache vs cloud)': isMd5Match ? '✅ Match' : '⚠️ Mismatch — sync may be needed',
        'Local-only sessions': chatDiff.onlyLocal.length,
        'Cloud-only sessions': chatDiff.onlyCloud.length,
        'Sessions in both': chatDiff.inBoth.length
    });

    if (!isMd5Match) {
        console.warn('%c👉 MD5 mismatch detected. Run NexusSync.syncData() or force push/pull to fix.', 'color: #f87171');
    } else if (chatDiff.onlyLocal.length === 0 && chatDiff.onlyCloud.length === 0) {
        console.log('%c✅ Everything looks in sync!', 'color: #6ee7b7; font-weight: bold');
    }

    console.groupEnd();

    return {
        local: localStats,
        cloud: cloudStats,
        diff: chatDiff,
        syncHealthy: isMd5Match && chatDiff.onlyLocal.length === 0 && chatDiff.onlyCloud.length === 0
    };
}

if (typeof window !== 'undefined') {
    window.debugSync = debugSync;
}
