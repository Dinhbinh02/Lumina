import { NexusAnnotationDB } from './highlight_db.js';
import { NexusChatDB } from './chat_db.js';

export async function runNexusMigrations() {
    try {
        const allLocalData = await chrome.storage.local.get(null);
        const keysToRemove = [];
        for (const key of Object.keys(allLocalData)) {
            if (key.startsWith('highlights_')) {
                const legacyHighlights = allLocalData[key] || [];
                if (Array.isArray(legacyHighlights) && legacyHighlights.length > 0) {
                    const flatHighlights = legacyHighlights.map(h => {
                        if (Array.isArray(h)) return h;
                        if (!h || !h.rangeData) return null;
                        return [
                            h.id,
                            h.color,
                            Array.isArray(h.rangeData.startPath) ? h.rangeData.startPath.join('/') : '',
                            h.rangeData.startOffset,
                            Array.isArray(h.rangeData.endPath) ? h.rangeData.endPath.join('/') : '',
                            h.rangeData.endOffset,
                            h.rangeData.text || '',
                            h.timestamp || Date.now()
                        ];
                    }).filter(Boolean);
                    
                    if (flatHighlights.length > 0) {
                        try {
                            const existing = await NexusAnnotationDB.get(key);
                            if (!existing || existing.length === 0) {
                                await NexusAnnotationDB.put(key, flatHighlights);
                            }
                        } catch (dbErr) {
                            console.error(`[Nexus Migration] Failed to migrate highlights for key: ${key}`, dbErr);
                        }
                    }
                }
                keysToRemove.push(key);
            }
            
            const lowerKey = key.toLowerCase();
            if (
                key.startsWith('chatbox_') || 
                lowerKey.includes('spotlight') || 
                key === 'tavilyApiKey' ||
                lowerKey.includes('monica') || 
                lowerKey.includes('lynote') ||
                key === 'audio_cache' ||
                key.startsWith('nexus_img_cache_') ||
                key.startsWith('nexus_img_query_')
            ) {
                keysToRemove.push(key);
            }
        }
        
        if (keysToRemove.length > 0) {
            await chrome.storage.local.remove(keysToRemove);
        }
    } catch (err) {
        console.error('[Nexus Migration] Standalone highlights/obsolete keys purge failed:', err);
    }

    const MIGRATION_FLAG = 'nexus_session_migrated_v7';
    const PREV_MIGRATION_FLAGS = [
        'nexus_session_migrated_v2', 
        'nexus_session_migrated_v3', 
        'nexus_session_migrated_v4', 
        'nexus_session_migrated_v5',
        'nexus_session_migrated_v6'
    ];
    
    const flagResult = await chrome.storage.local.get([MIGRATION_FLAG]);
    if (flagResult[MIGRATION_FLAG]) {
        return;
    }
    
    try {
        const allData = await chrome.storage.local.get(null);
        const keysToRemove = [...PREV_MIGRATION_FLAGS];
        
        const serializeHighlight = (h) => {
            if (!h || !h.rangeData) return null;
            return [
                h.id,
                h.color,
                Array.isArray(h.rangeData.startPath) ? h.rangeData.startPath.join('/') : '',
                h.rangeData.startOffset,
                Array.isArray(h.rangeData.endPath) ? h.rangeData.endPath.join('/') : '',
                h.rangeData.endOffset,
                h.rangeData.text || '',
                h.timestamp || Date.now()
            ];
        };
        
        for (const key of Object.keys(allData)) {
            if (
                key.toLowerCase().includes('spotlight') || 
                key.startsWith('chatbox_') || 
                key.toLowerCase().includes('monica') || 
                key.toLowerCase().includes('lynote')
            ) {
                keysToRemove.push(key);
                continue;
            }
            
            if (key.startsWith('highlights_')) {
                const legacyHighlights = allData[key] || [];
                if (Array.isArray(legacyHighlights) && legacyHighlights.length > 0) {
                    const flatHighlights = legacyHighlights.map(serializeHighlight).filter(Boolean);
                    if (flatHighlights.length > 0) {
                        try {
                            await NexusAnnotationDB.put(key, flatHighlights);
                        } catch (dbErr) {
                            console.error(`[Nexus Migration] Failed to save highlights for key: ${key}`, dbErr);
                        }
                    }
                }
                keysToRemove.push(key);
            }
        }
        
        const sessionsKey = 'nexus_chat_sessions';
        let sessions = allData[sessionsKey] || {};
        let sessionsUpdated = false;
        
        for (const sessionId of Object.keys(sessions)) {
            if (sessionId.startsWith('session_')) {
                const newSessionId = sessionId.replace('session_', '');
                const sessionMeta = { ...sessions[sessionId] };
                sessionMeta.id = newSessionId;
                sessions[newSessionId] = sessionMeta;
                delete sessions[sessionId];
                sessionsUpdated = true;
                
                const oldSessionKey = `nexus_session_${sessionId}`;
                const newSessionKey = `nexus_session_${newSessionId}`;
                if (allData[oldSessionKey] && !allData[newSessionKey]) {
                    allData[newSessionKey] = allData[oldSessionKey];
                    keysToRemove.push(oldSessionKey);
                }
                const oldHistoryKey = `nexus_history_${sessionId}`;
                const newHistoryKey = `nexus_history_${newSessionId}`;
                if (allData[oldHistoryKey] && !allData[newHistoryKey]) {
                    allData[newHistoryKey] = allData[oldHistoryKey];
                    keysToRemove.push(oldHistoryKey);
                }
            }
        }
        
        for (const key of Object.keys(allData)) {
            if (key.startsWith('nexus_session_session_')) {
                const oldSessionId = key.replace('nexus_session_', '');
                const newSessionId = oldSessionId.replace('session_', '');
                const newSessionKey = `nexus_session_${newSessionId}`;
                allData[newSessionKey] = allData[key];
                keysToRemove.push(key);
                
                const oldHistoryKey = `nexus_history_${oldSessionId}`;
                if (allData[oldHistoryKey]) {
                    const newHistoryKey = `nexus_history_${newSessionId}`;
                    allData[newHistoryKey] = allData[oldHistoryKey];
                    keysToRemove.push(oldHistoryKey);
                }
                
                if (sessions[oldSessionId]) {
                    const sessionMeta = { ...sessions[oldSessionId] };
                    sessionMeta.id = newSessionId;
                    sessions[newSessionId] = sessionMeta;
                    delete sessions[oldSessionId];
                    sessionsUpdated = true;
                }
            }
        }
        
        const migratedSessionIds = new Set();
        
        for (const sessionId of Object.keys(sessions)) {
            const meta = sessions[sessionId];
            if (meta) {
                const normId = sessionId.startsWith('session_') ? sessionId.replace('session_', '') : sessionId;
                const messageKey = `nexus_session_${normId}`;
                const messages = allData[messageKey] || meta.messages || [];
                
                try {
                    meta.id = normId;
                    await NexusChatDB.putSession(meta);
                    await NexusChatDB.putMessages(normId, messages);
                    migratedSessionIds.add(normId);
                    keysToRemove.push(messageKey);
                    keysToRemove.push(`nexus_history_${normId}`);
                } catch (chatDbErr) {
                    console.error(`[Nexus Migration] Failed to migrate chat session ${normId} to IndexedDB:`, chatDbErr);
                }
            }
        }
        
        for (const key of Object.keys(allData)) {
            if (key.startsWith('nexus_session_')) {
                const rawId = key.replace('nexus_session_', '');
                if (rawId === 'settings' || rawId === 'session_settings') continue;
                
                const normId = rawId.startsWith('session_') ? rawId.replace('session_', '') : rawId;
                if (!migratedSessionIds.has(normId)) {
                    const messages = allData[key] || [];
                    if (Array.isArray(messages) && messages.length > 0) {
                        try {
                            const latestTimestamp = messages[messages.length - 1]?.timestamp || Date.now();
                            const meta = {
                                id: normId,
                                title: messages[0]?.content?.substring(0, 40) || 'Recovered Chat',
                                createdAt: messages[0]?.timestamp || latestTimestamp,
                                updatedAt: latestTimestamp,
                                hasContent: true
                            };
                            await NexusChatDB.putSession(meta);
                            await NexusChatDB.putMessages(normId, messages);
                        } catch (recoveryErr) {
                            console.error(`[Nexus Migration] Failed to recover standalone chat session ${normId}:`, recoveryErr);
                        }
                    }
                    keysToRemove.push(key);
                }
            }
        }
        
        keysToRemove.push(sessionsKey);
        
        const dataToSet = {
            [MIGRATION_FLAG]: true
        };
        
        await chrome.storage.local.set(dataToSet);
        if (keysToRemove.length > 0) {
            await chrome.storage.local.remove(keysToRemove);
        }
    } catch (error) {
        console.error('[Nexus Migration] Fatal error during migration:', error);
    }
}

runNexusMigrations();
