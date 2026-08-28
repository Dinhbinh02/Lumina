export function getPaneActiveModel() {
    const model = sessionStorage.getItem('nexus_active_model');
    const providerId = sessionStorage.getItem('nexus_active_provider');
    if (model) {
        return { model, providerId };
    }
    return null;
}

export function setPaneActiveModel(modelObj) {
    if (modelObj && modelObj.model) {
        sessionStorage.setItem('nexus_active_model', modelObj.model);
        if (modelObj.providerId) {
            sessionStorage.setItem('nexus_active_provider', modelObj.providerId);
        } else {
            sessionStorage.removeItem('nexus_active_provider');
        }
    } else {
        sessionStorage.removeItem('nexus_active_model');
        sessionStorage.removeItem('nexus_active_provider');
    }
}

export function getPaneActiveThinking() {
    return sessionStorage.getItem('nexus_active_thinking') || null;
}

export function setPaneActiveThinking(level) {
    if (level) {
        sessionStorage.setItem('nexus_active_thinking', level);
    } else {
        sessionStorage.removeItem('nexus_active_thinking');
    }
}

export function updateUrlSessionId(sidVal, isPopState = false) {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('session_id')) {
        urlParams.delete('session_id');
    }
    const currentUrlSid = urlParams.get('sid') || '';
    if (currentUrlSid !== (sidVal || '')) {
        if (!sidVal) {
            urlParams.delete('sid');
        } else {
            urlParams.set('sid', sidVal);
        }
        const newUrl = window.location.pathname + (urlParams.toString() ? '?' + urlParams.toString() : '');
        if (isPopState) {
            window.history.replaceState({ path: newUrl, sid: sidVal }, '', newUrl);
        } else {
            window.history.pushState({ path: newUrl, sid: sidVal }, '', newUrl);
        }
    }
}
