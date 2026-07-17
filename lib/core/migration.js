(async function() {
    const MIGRATION_FLAG = 'lumina_session_migrated_v7';
    const PREV_MIGRATION_FLAGS = [
        'lumina_session_migrated_v2', 
        'lumina_session_migrated_v3', 
        'lumina_session_migrated_v4', 
        'lumina_session_migrated_v5',
        'lumina_session_migrated_v6'
    ];
    
    // Check if main migration has already run
    const flagResult = await chrome.storage.local.get([MIGRATION_FLAG]);
    if (flagResult[MIGRATION_FLAG]) {
        return;
    }
    
    console.log('[Lumina Migration] Running migration v7: Migrating all highlights and chat history to IndexedDB...');
    
    try {
        const allData = await chrome.storage.local.get(null);
        const keysToRemove = [...PREV_MIGRATION_FLAGS];
        
        // Helper to serialize highlights to flat array
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
        
        // --- 1. RUN HIGHLIGHTS & OBSOLETE KEYS CLEANUP ---
        for (const key of Object.keys(allData)) {
            // Remove obsolete spotlight or chatbox keys
            if (
                key.toLowerCase().includes('spotlight') || 
                key.startsWith('chatbox_') || 
                key.toLowerCase().includes('monica') || 
                key.toLowerCase().includes('lynote')
            ) {
                keysToRemove.push(key);
                continue;
            }
            
            // Migrate legacy highlights to IndexedDB using flat arrays
            if (key.startsWith('highlights_')) {
                const legacyHighlights = allData[key] || [];
                if (Array.isArray(legacyHighlights) && legacyHighlights.length > 0) {
                    const flatHighlights = legacyHighlights.map(serializeHighlight).filter(Boolean);
                    if (flatHighlights.length > 0) {
                        try {
                            await LuminaHighlightDB.put(key, flatHighlights);
                            console.log(`[Lumina Migration] Successfully migrated highlights to IndexedDB for key: ${key}`);
                        } catch (dbErr) {
                            console.error(`[Lumina Migration] Failed to save highlights for key: ${key}`, dbErr);
                        }
                    }
                }
                keysToRemove.push(key);
            }
        }
        
        // --- 2. RUN SESSION ID FORMAT CLEANUP & CONVERSION ---
        const sessionsKey = 'lumina_chat_sessions';
        let sessions = allData[sessionsKey] || {};
        let sessionsUpdated = false;
        
        // Fix duplicate session formatting in index
        for (const sessionId of Object.keys(sessions)) {
            if (sessionId.startsWith('session_')) {
                const newSessionId = sessionId.replace('session_', '');
                const sessionMeta = { ...sessions[sessionId] };
                sessionMeta.id = newSessionId;
                sessions[newSessionId] = sessionMeta;
                delete sessions[sessionId];
                sessionsUpdated = true;
                
                // Copy messages key if formatted incorrectly
                const oldSessionKey = `lumina_session_${sessionId}`;
                const newSessionKey = `lumina_session_${newSessionId}`;
                if (allData[oldSessionKey] && !allData[newSessionKey]) {
                    allData[newSessionKey] = allData[oldSessionKey];
                    keysToRemove.push(oldSessionKey);
                }
                const oldHistoryKey = `lumina_history_${sessionId}`;
                const newHistoryKey = `lumina_history_${newSessionId}`;
                if (allData[oldHistoryKey] && !allData[newHistoryKey]) {
                    allData[newHistoryKey] = allData[oldHistoryKey];
                    keysToRemove.push(oldHistoryKey);
                }
            }
        }
        
        // Scan for orphaned double-prefix keys
        for (const key of Object.keys(allData)) {
            if (key.startsWith('lumina_session_session_')) {
                const oldSessionId = key.replace('lumina_session_', '');
                const newSessionId = oldSessionId.replace('session_', '');
                const newSessionKey = `lumina_session_${newSessionId}`;
                allData[newSessionKey] = allData[key];
                keysToRemove.push(key);
                
                const oldHistoryKey = `lumina_history_${oldSessionId}`;
                if (allData[oldHistoryKey]) {
                    const newHistoryKey = `lumina_history_${newSessionId}`;
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
        
        // --- 3. MIGRATE ALL CHATS TO INDEXEDDB (LuminaChatDB) ---
        const migratedSessionIds = new Set();
        
        // A. Migrate all indexed sessions
        for (const sessionId of Object.keys(sessions)) {
            const meta = sessions[sessionId];
            if (meta) {
                // Find messages key (normalized sessionId)
                const normId = sessionId.startsWith('session_') ? sessionId.replace('session_', '') : sessionId;
                const messageKey = `lumina_session_${normId}`;
                const messages = allData[messageKey] || meta.messages || [];
                
                try {
                    // Force session ID property correctness
                    meta.id = normId;
                    
                    // Save to IndexedDB
                    await LuminaChatDB.putSession(meta);
                    await LuminaChatDB.putMessages(normId, messages);
                    migratedSessionIds.add(normId);
                    
                    // Mark local storage keys for purge
                    keysToRemove.push(messageKey);
                    keysToRemove.push(`lumina_history_${normId}`);
                    console.log(`[Lumina Migration] Migrated indexed chat session: ${normId}`);
                } catch (chatDbErr) {
                    console.error(`[Lumina Migration] Failed to migrate chat session ${normId} to IndexedDB:`, chatDbErr);
                }
            }
        }
        
        // B. Scan for unindexed standalone session keys
        for (const key of Object.keys(allData)) {
            if (key.startsWith('lumina_session_')) {
                const rawId = key.replace('lumina_session_', '');
                // Skip common system config keys if they start with lumina_session_ (e.g. lumina_session_settings)
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
                            await LuminaChatDB.putSession(meta);
                            await LuminaChatDB.putMessages(normId, messages);
                            console.log(`[Lumina Migration] Recovered standalone chat session: ${normId}`);
                        } catch (recoveryErr) {
                            console.error(`[Lumina Migration] Failed to recover standalone chat session ${normId}:`, recoveryErr);
                        }
                    }
                    keysToRemove.push(key);
                }
            }
        }
        
        // Always remove the sessions index key
        keysToRemove.push(sessionsKey);
        
        // --- 4. FINALIZE MIGRATION ---
        const dataToSet = {
            [MIGRATION_FLAG]: true
        };
        
        console.log('[Lumina Migration] Purging local storage keys:', keysToRemove);
        await chrome.storage.local.set(dataToSet);
        if (keysToRemove.length > 0) {
            await chrome.storage.local.remove(keysToRemove);
        }
        console.log('[Lumina Migration] Migration completed successfully.');
    } catch (error) {
        console.error('[Lumina Migration] Fatal error during migration:', error);
    }
})();
