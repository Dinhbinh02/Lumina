// Helper private: detect Gemini family
function _isGemini(modelName, providerId, providers = []) {
    const provider = providers.find(p => p.id === providerId);
    return (provider?.type === 'gemini') ||
        (providerId?.toLowerCase().includes('gemini')) ||
        (modelName?.toLowerCase().includes('gemini') && !modelName?.toLowerCase().includes('gemma'));
}

// Helper private: build composite storage key for a model object
function _modelKey(modelObj) {
    return modelObj?.providerId ? `${modelObj.providerId}:${modelObj.model}` : modelObj?.model;
}

// Helper private: look up user's saved preference for this model
function _getAdvParams(modelObj, advancedParamsByModel = {}) {
    if (!modelObj?.model) return {};
    return advancedParamsByModel[_modelKey(modelObj)] || advancedParamsByModel[modelObj.model] || {};
}

export const NexusModelHelper = {
    buildModelChain(data = {}) {
        return (data.models || [])
            .filter(item => {
                const modelVal = item.model || item.modelName;
                return modelVal && modelVal !== 'Gemini Nano (Built-in)' && item.providerId !== 'builtin';
            })
            .map(item => ({ ...item, model: item.model || item.modelName }));
    },

    getThinkingOptions(currentModel, currentProviderId, providers = []) {
        if (_isGemini(currentModel, currentProviderId, providers)) {
            return [
                { value: 'minimal', title: 'Minimal', desc: 'Minimal thinking, very fast' },
                { value: 'low',     title: 'Low',     desc: 'Short thinking, fast response' },
                { value: 'medium',  title: 'Standard', desc: 'Best for most questions' },
                { value: 'high',    title: 'Extended', desc: 'Complex problem solving' }
            ];
        }
        const isGemma4 = /gemma-4/i.test(currentModel || '');
        if (/gemma/i.test(currentModel || '') && !isGemma4) {
            return [{ value: 'none', title: 'None', desc: 'Thinking is not supported' }];
        }
        return [
            { value: 'none',   title: 'None',     desc: 'No reasoning, fastest response' },
            { value: 'low',    title: 'Low',       desc: 'Quick reasoning, low latency' },
            { value: 'medium', title: 'Standard',  desc: 'Best for most questions' },
            { value: 'high',   title: 'Extended',  desc: 'Complex problem solving' }
        ];
    },

    getDefaultThinking(modelName, providerId, providers = []) {
        return _isGemini(modelName, providerId, providers) ? 'minimal' : 'none';
    },

    getModelThinkingPreference(modelObj, advancedParamsByModel = {}, providers = []) {
        if (!modelObj?.model) return 'none';
        const params = _getAdvParams(modelObj, advancedParamsByModel);
        return params.thinkingLevel || this.getDefaultThinking(modelObj.model, modelObj.providerId, providers);
    },

    async resolveSessionSettings(sessionId, metaModel = null, metaThinking = null) {
        const sidKey = sessionId || 'null';
        const data = await chrome.storage.local.get([
            'providers', 'models', 'lastUsedModel', 'lastUsedThinkingLevel',
            'nexus_session_settings', 'advancedParamsByModel'
        ]);
        const saved = (data.nexus_session_settings || {})[sidKey] || {};
        const sessionModel = sessionId ? (saved.selectedModel || metaModel) : null;
        const selectedModel = sessionModel || data.lastUsedModel || metaModel || null;

        const sessionThinking = sessionId ? (saved.thinkingLevel || metaThinking) : null;
        const thinkingLevel = sessionThinking
            || (selectedModel ? this.getModelThinkingPreference(selectedModel, data.advancedParamsByModel, data.providers) : null)
            || data.lastUsedThinkingLevel
            || 'none';

        return { selectedModel, thinkingLevel, storageData: data };
    },

    async saveModelSelection(modelObj, sessionId = null, explicitThinking = null) {
        if (!modelObj?.model) return null;
        const sidKey = sessionId || 'null';
        const data = await chrome.storage.local.get(['nexus_session_settings', 'advancedParamsByModel', 'providers']);
        const settings = data.nexus_session_settings || {};
        const savedModel = { model: modelObj.model, providerId: modelObj.providerId };
        const newThinking = explicitThinking || this.getModelThinkingPreference(modelObj, data.advancedParamsByModel, data.providers);

        settings[sidKey] = { ...(settings[sidKey] || {}), selectedModel: savedModel, thinkingLevel: newThinking };
        settings['null'] = { ...(settings['null'] || {}), selectedModel: savedModel, thinkingLevel: newThinking };

        await chrome.storage.local.set({
            nexus_session_settings: settings,
            lastUsedModel: savedModel,
            lastUsedThinkingLevel: newThinking
        });

        if (sessionId && sessionId !== 'null') {
            await window.NexusChatHistory?.updateSessionModelAndThinking?.(sessionId, savedModel, newThinking);
        }
        return { selectedModel: savedModel, thinkingLevel: newThinking };
    },

    async saveThinkingSelection(thinkingLevel, sessionId = null, currentModel = null) {
        if (!thinkingLevel) return null;
        const sidKey = sessionId || 'null';
        const data = await chrome.storage.local.get(['nexus_session_settings', 'advancedParamsByModel']);
        const settings = data.nexus_session_settings || {};
        const advParams = data.advancedParamsByModel || {};

        settings[sidKey] = { ...(settings[sidKey] || {}), thinkingLevel };
        settings['null'] = { ...(settings['null'] || {}), thinkingLevel };

        if (currentModel?.model) {
            const cKey = _modelKey(currentModel);
            advParams[cKey] = { ...(advParams[cKey] || {}), thinkingLevel };
        }

        await chrome.storage.local.set({
            nexus_session_settings: settings,
            lastUsedThinkingLevel: thinkingLevel,
            advancedParamsByModel: advParams,
            ...(currentModel ? { lastUsedModel: currentModel } : {})
        });

        if (sessionId && sessionId !== 'null') {
            await window.NexusChatHistory?.updateSessionModelAndThinking?.(sessionId, undefined, thinkingLevel);
        }
        return { thinkingLevel };
    }
};

if (typeof window !== 'undefined') {
    window.NexusModelHelper = NexusModelHelper;
}
