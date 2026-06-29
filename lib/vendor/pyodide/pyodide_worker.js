// Monkey-patch global fetch inside Worker to support fallback to CDN for packages not bundled locally
const originalFetch = self.fetch;
self.fetch = async function(input, init) {
    console.log('[Lumina Patched Fetch] Intercepted input:', input, 'type:', typeof input, 'url:', input?.url, 'href:', input?.href);
    let url = "";
    if (typeof input === 'string') {
        url = input;
    } else if (input && typeof input === 'object') {
        url = input.url || input.href || (typeof input.toString === 'function' ? input.toString() : "");
    }
    
    const isTargetFile = url && (url.endsWith('.whl') || url.endsWith('.json') || url.endsWith('.zip'));
    const isLocalOrRelative = url && !url.startsWith('http:') && !url.startsWith('https:');
    
    if (isTargetFile && (url.startsWith('chrome-extension:') || isLocalOrRelative)) {
        try {
            const response = await originalFetch(input, init);
            if (response.ok) {
                return response;
            }
            console.warn(`[Lumina Patched Fetch] Local fetch failed for ${url} (status ${response.status}). Trying CDN fallback...`);
        } catch (e) {
            console.warn(`[Lumina Patched Fetch] Local fetch threw error for ${url}. Trying CDN fallback...`);
        }
        
        const filename = url.substring(url.lastIndexOf('/') + 1);
        const cdnUrl = 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/' + filename;
        console.log(`[Lumina Patched Fetch] Redirecting to CDN: ${cdnUrl}`);
        return originalFetch(cdnUrl, init);
    }
    return originalFetch(input, init);
};

let pyodideInstance = null;

async function initPyodide(indexURL) {
    if (pyodideInstance) return pyodideInstance;
    
    let loaded = false;
    // Attempt local load if indexURL is local
    if (indexURL.startsWith('chrome-extension:') || indexURL.includes('/lib/vendor/')) {
        try {
            importScripts('pyodide.js');
            loaded = true;
        } catch (e) {
            console.warn('[Lumina Python Worker] Local importScripts failed, trying CDN script...', e);
        }
    }
    
    if (!loaded) {
        try {
            importScripts('https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js');
        } catch (e) {
            console.error('[Lumina Python Worker] CDN importScripts failed:', e);
            throw new Error('Failed to load pyodide script: ' + e.message);
        }
    }

    try {
        console.log('[Lumina Python Worker] Initializing loadPyodide with URL:', indexURL);
        pyodideInstance = await loadPyodide({
            indexURL: indexURL
        });
    } catch (err) {
        console.warn('[Lumina Python Worker] Initialization failed with URL:', indexURL, ', trying CDN fallback URL...', err);
        const cdnIndexURL = 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/';
        if (indexURL !== cdnIndexURL) {
            try {
                importScripts('https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js');
            } catch (cdnScriptErr) {
                // Ignore if already loaded or failed
            }
            pyodideInstance = await loadPyodide({
                indexURL: cdnIndexURL
            });
        } else {
            throw err;
        }
    }

    console.log('[Lumina Python Worker] Loading packages (matplotlib, numpy)...');
    await pyodideInstance.loadPackage(['matplotlib', 'numpy']);
    
    // Force Agg backend to prevent Matplotlib from searching for 'document' (DOM) inside Worker
    await pyodideInstance.runPythonAsync(`
import matplotlib
matplotlib.use('Agg')
`);
    console.log('[Lumina Python Worker] Sandbox ready.');
    return pyodideInstance;
}

const taskQueue = [];
let isProcessing = false;

async function processQueue() {
    if (isProcessing || taskQueue.length === 0) return;
    isProcessing = true;

    const task = taskQueue.shift();
    const { code, indexURL, taskId } = task;

    try {
        const py = await initPyodide(indexURL);

        // Delete any existing chart.png file from prior runs to avoid reading stale data
        try {
            py.FS.unlink('chart.png');
        } catch (e) {
            // Ignore if file does not exist
        }

        // Clean up any previous plots
        await py.runPythonAsync(`
import matplotlib.pyplot as plt
plt.clf()
plt.close('all')
`);

        // Dynamically load any extra packages imported in the python code (e.g., scipy, sympy)
        await py.loadPackagesFromImports(code);

        // Run the code
        await py.runPythonAsync(code);

        // Read output image
        const imgData = py.FS.readFile('chart.png');

        // Send back success and transfer the Uint8Array buffer
        self.postMessage({
            type: 'run_ok',
            imgData: imgData,
            taskId: taskId
        }, [imgData.buffer]);
    } catch (err) {
        self.postMessage({
            type: 'error',
            error: err.message || err.toString(),
            taskId: taskId
        });
    } finally {
        isProcessing = false;
        // Schedule processing the next task in the event loop
        setTimeout(processQueue, 0);
    }
}

self.onmessage = async function(e) {
    const { type, code, indexURL, taskId } = e.data;

    if (type === 'init') {
        try {
            await initPyodide(indexURL);
            self.postMessage({ type: 'init_ok', taskId });
        } catch (err) {
            self.postMessage({ type: 'error', error: 'Initialization failed: ' + err.message, taskId });
        }
        return;
    }

    if (type === 'run') {
        taskQueue.push({ code, indexURL, taskId });
        processQueue();
    }
};
