const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const isWatch = process.argv.includes('--watch');

// Shared high-performance compiler options for esbuild
const baseCompilerOptions = {
    target: ['chrome110'],
    minify: !isWatch,
    treeShaking: true,
    legalComments: 'none',
    charset: 'utf8',
    sourcemap: false,
    drop: !isWatch ? ['debugger'] : []
};

function copyDirSync(src, dest, filter) {
    if (!fs.existsSync(src)) return;
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
        if (entry.name === '.DS_Store') continue;

        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (filter && !filter(srcPath, entry)) continue;

        if (entry.isDirectory()) {
            copyDirSync(srcPath, destPath, filter);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

function syncStaticAssets() {
    const distDir = path.resolve(__dirname, 'dist');

    // 1. Manifest & DNR rules
    if (fs.existsSync(path.resolve(__dirname, 'manifest.json'))) {
        fs.copyFileSync(
            path.resolve(__dirname, 'manifest.json'),
            path.resolve(distDir, 'manifest.json')
        );
    }
    if (fs.existsSync(path.resolve(__dirname, 'rules.json'))) {
        fs.copyFileSync(
            path.resolve(__dirname, 'rules.json'),
            path.resolve(distDir, 'rules.json')
        );
    }

    // 2. Static assets & libraries
    copyDirSync(path.resolve(__dirname, 'src/assets'), path.resolve(distDir, 'assets'));
    copyDirSync(path.resolve(__dirname, 'src/lib'), path.resolve(distDir, 'lib'));

    if (fs.existsSync(path.resolve(__dirname, '_locales'))) {
        copyDirSync(path.resolve(__dirname, '_locales'), path.resolve(distDir, '_locales'));
    }

    // 3. Static HTML / assets inside src/pages/
    copyDirSync(
        path.resolve(__dirname, 'src/pages'),
        path.resolve(distDir, 'pages'),
        (srcPath, entry) => {
            if (entry.isDirectory() && (entry.name === 'controllers' || entry.name === 'styles')) {
                return false;
            }
            if (srcPath.endsWith('src/pages/nexus/index.js') ||
                srcPath.endsWith('src/pages/nexus/workspace.js') ||
                srcPath.endsWith('src/pages/popup/index.js')) {
                return false;
            }
            return true;
        }
    );
}

async function buildNexusWorkspace() {
    const jsEntry = path.resolve(__dirname, 'src/pages/nexus/index.js');
    const jsDistOut = path.resolve(__dirname, 'dist/pages/nexus/nexus.bundle.js');

    const cssEntry = path.resolve(__dirname, 'src/pages/nexus/styles/index.css');
    const cssDistOut = path.resolve(__dirname, 'dist/pages/nexus/nexus.bundle.css');

    const tasks = [];

    if (fs.existsSync(jsEntry)) {
        tasks.push((async () => {
            const jsContext = await esbuild.context({
                ...baseCompilerOptions,
                entryPoints: [jsEntry],
                bundle: true,
                outfile: jsDistOut,
                format: 'iife'
            });

            if (isWatch) {
                await jsContext.watch();
            } else {
                await jsContext.rebuild();
                await jsContext.dispose();
            }
        })());
    }

    if (fs.existsSync(cssEntry)) {
        tasks.push((async () => {
            const cssContext = await esbuild.context({
                ...baseCompilerOptions,
                entryPoints: [cssEntry],
                bundle: true,
                outfile: cssDistOut,
                loader: {
                    '.svg': 'dataurl',
                    '.woff': 'dataurl',
                    '.woff2': 'dataurl',
                    '.ttf': 'dataurl',
                    '.png': 'dataurl'
                }
            });

            if (isWatch) {
                await cssContext.watch();
            } else {
                await cssContext.rebuild();
                await cssContext.dispose();
            }
        })());
    }

    await Promise.all(tasks);
}

async function buildBackground() {
    const entry = path.resolve(__dirname, 'src/background/index.js');
    const distOutfile = path.resolve(__dirname, 'dist/scripts/background.bundle.js');
    if (!fs.existsSync(entry)) return;

    const ctx = await esbuild.context({
        ...baseCompilerOptions,
        entryPoints: [entry],
        bundle: true,
        outfile: distOutfile,
        format: 'esm'
    });

    if (isWatch) {
        await ctx.watch();
    } else {
        await ctx.rebuild();
        await ctx.dispose();
    }
}

async function buildContent() {
    const entry = path.resolve(__dirname, 'src/content/index.js');
    const distOutfile = path.resolve(__dirname, 'dist/scripts/content.bundle.js');
    if (!fs.existsSync(entry)) return;

    const ctx = await esbuild.context({
        ...baseCompilerOptions,
        entryPoints: [entry],
        bundle: true,
        outfile: distOutfile,
        format: 'iife'
    });

    if (isWatch) {
        await ctx.watch();
    } else {
        await ctx.rebuild();
        await ctx.dispose();
    }
}

async function buildPopup() {
    const entry = path.resolve(__dirname, 'src/pages/popup/index.js');
    const distOutfile = path.resolve(__dirname, 'dist/pages/popup/popup.bundle.js');
    if (!fs.existsSync(entry)) return;

    const ctx = await esbuild.context({
        ...baseCompilerOptions,
        entryPoints: [entry],
        bundle: true,
        outfile: distOutfile,
        format: 'iife'
    });

    if (isWatch) {
        await ctx.watch();
    } else {
        await ctx.rebuild();
        await ctx.dispose();
    }
}

async function run() {
    const distDir = path.resolve(__dirname, 'dist');
    const startTime = Date.now();
    
    console.log('[Nexus Build] Cleaning and preparing dist folder...');
    if (!isWatch && fs.existsSync(distDir)) {
        fs.rmSync(distDir, { recursive: true, force: true });
    }
    fs.mkdirSync(distDir, { recursive: true });

    console.log('[Nexus Build] Syncing static files & assets to dist/ ...');
    syncStaticAssets();

    console.log('[Nexus Build] Compiling all packages in parallel with esbuild...');
    // Parallel compilation across all CPU cores
    await Promise.all([
        buildNexusWorkspace(),
        buildBackground(),
        buildContent(),
        buildPopup()
    ]);

    const elapsed = Date.now() - startTime;
    console.log(`[Nexus Build] Build completed in ${elapsed}ms. All extension files ready in dist/ !`);

    if (isWatch) {
        console.log('[Nexus Build] Watching for file changes in src/ ...');
    }
}

run().catch((err) => {
    console.error('[Nexus Build Error]', err);
    process.exit(1);
});
