const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const isWatch = process.argv.includes('--watch');

async function buildBlockNote() {
    const entry = path.resolve(__dirname, 'tools/blocknote_entry.jsx');
    const outfile = path.resolve(__dirname, 'lib/vendor/blocknote.js');
    if (!fs.existsSync(entry)) return;
    
    await esbuild.build({
        entryPoints: [entry],
        bundle: true,
        outfile: outfile,
        loader: { '.js': 'jsx', '.jsx': 'jsx' },
        conditions: ['style'],
        define: { 'process.env.NODE_ENV': '"production"' },
        minify: false,
        sourcemap: false
    });
}

async function buildLuminaWorkspace() {
    const jsEntry = path.resolve(__dirname, 'src/pages/lumina/index.js');
    const jsOut = path.resolve(__dirname, 'pages/lumina/lumina.bundle.js');
    const cssEntry = path.resolve(__dirname, 'src/pages/lumina/styles/index.css');
    const cssOut = path.resolve(__dirname, 'pages/lumina/lumina.bundle.css');

    if (fs.existsSync(jsEntry)) {
        const jsContext = await esbuild.context({
            entryPoints: [jsEntry],
            bundle: true,
            outfile: jsOut,
            format: 'iife',
            target: ['chrome110'],
            external: ['katex'],
            sourcemap: false
        });

        if (isWatch) {
            await jsContext.watch();
        } else {
            await jsContext.rebuild();
            await jsContext.dispose();
        }
    }

    if (fs.existsSync(cssEntry)) {
        const cssContext = await esbuild.context({
            entryPoints: [cssEntry],
            bundle: true,
            outfile: cssOut,
            loader: {
                '.svg': 'dataurl',
                '.woff': 'dataurl',
                '.woff2': 'dataurl',
                '.ttf': 'dataurl',
                '.png': 'dataurl'
            },
            sourcemap: false
        });

        if (isWatch) {
            await cssContext.watch();
        } else {
            await cssContext.rebuild();
            await cssContext.dispose();
        }
    }
}

async function buildBackground() {
    const entry = path.resolve(__dirname, 'src/background/index.js');
    const outfile = path.resolve(__dirname, 'dist/background.bundle.js');
    if (!fs.existsSync(entry)) return;

    const ctx = await esbuild.context({
        entryPoints: [entry],
        bundle: true,
        outfile: outfile,
        format: 'esm',
        target: ['chrome110'],
        sourcemap: false
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
    const outfile = path.resolve(__dirname, 'dist/content.bundle.js');
    if (!fs.existsSync(entry)) return;

    const ctx = await esbuild.context({
        entryPoints: [entry],
        bundle: true,
        outfile: outfile,
        format: 'iife',
        target: ['chrome110'],
        sourcemap: false
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
    if (!fs.existsSync(distDir)) {
        fs.mkdirSync(distDir, { recursive: true });
    }

    console.log('[Lumina Build] Compiling packages...');
    await buildBlockNote();
    await buildLuminaWorkspace();
    await buildBackground();
    await buildContent();
    console.log('[Lumina Build] Build completed successfully.');

    if (isWatch) {
        console.log('[Lumina Build] Watching for file changes in src/ ...');
    }
}

run().catch((err) => {
    console.error('[Lumina Build Error]', err);
    process.exit(1);
});
