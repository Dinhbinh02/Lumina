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
