export const LuminaModelHelper = {
    async getPromptSupport() {
        if (typeof window.getPromptApiSupport === 'function') {
            return await window.getPromptApiSupport();
        }
        return { supported: false, status: 'no', reason: 'Prompt API not loaded' };
    },
    buildModelChain(data, promptSupport) {
        const chain = [];
        const modelsList = data.models || [];
        modelsList.forEach(item => {
            const modelVal = item.model || item.modelName;
            if (modelVal && modelVal !== 'Gemini Nano (Built-in)' && item.providerId !== 'builtin') {
                chain.push({
                    ...item,
                    model: modelVal
                });
            }
        });
        return chain;
    },
    getThinkingOptions(currentModel, currentProviderId, providers = []) {
        const provider = providers.find(p => p.id === currentProviderId);
        const isGemini = (provider ? (provider.type === 'gemini') : false) ||
            (currentModel && currentModel.toLowerCase().includes('gemini') && !currentModel.toLowerCase().includes('gemma')) ||
            (currentProviderId && currentProviderId.toLowerCase().includes('gemini'));
        const isGemma4 = currentModel ? /gemma-4/i.test(currentModel) : false;
        const isGemmaOld = currentModel ? (/gemma/i.test(currentModel) && !isGemma4) : false;

        if (isGemini) {
            return [
                { value: 'minimal', title: 'Minimal', desc: 'Minimal thinking, very fast' },
                { value: 'low', title: 'Low', desc: 'Short thinking, fast response' },
                { value: 'medium', title: 'Standard', desc: 'Best for most questions' },
                { value: 'high', title: 'Extended', desc: 'Complex problem solving' }
            ];
        } else if (isGemmaOld) {
            return [
                { value: 'none', title: 'None', desc: 'Thinking is not supported' }
            ];
        } else {
            return [
                { value: 'none', title: 'None', desc: 'No reasoning, fastest response' },
                { value: 'low', title: 'Low', desc: 'Quick reasoning, low latency' },
                { value: 'medium', title: 'Standard', desc: 'Best for most questions' },
                { value: 'high', title: 'Extended', desc: 'Complex problem solving' }
            ];
        }
    },
    getDefaultThinking(modelName, providerId, providers = []) {
        const provider = providers && providers.find(p => p.id === providerId);
        const isGemini = (provider ? (provider.type === 'gemini') : false) ||
            (providerId && providerId.toLowerCase().includes('gemini')) ||
            (modelName && modelName.toLowerCase().includes('gemini') && !modelName.toLowerCase().includes('gemma'));
        return isGemini ? 'minimal' : 'none';
    }
};

if (typeof window !== 'undefined') {
    window.LuminaModelHelper = LuminaModelHelper;
}
