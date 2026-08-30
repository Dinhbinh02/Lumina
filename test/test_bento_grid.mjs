import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('Testing <BentoGrid> Component in Marked Parser...');

// 1. Load marked parser from vendor
const markedMinPath = path.join(__dirname, '../lib/vendor/marked.min.js');
const markedCode = fs.readFileSync(markedMinPath, 'utf8');
const markedFn = new Function('window', 'globalThis', `${markedCode}; return (typeof marked !== 'undefined' ? marked : (typeof window !== 'undefined' ? window.marked : globalThis.marked));`);
const marked = markedFn({}, globalThis);
globalThis.marked = marked;

// 2. Import LMDX parser
const lmdxModule = await import('../src/components/chat/lmdx_components_parser.js');
lmdxModule.initLmdxComponentsParser();

console.log('Testing <BentoGrid> Complete Parsing...');
const fullXml = `
<BentoGrid title="Next.js 15 Core Highlights">
<BentoItem title="React 19 & React Compiler" span="2" tag="Flagship" icon="sparkles">
Full support for React 19, async request lifecycles, and automated build-time memoization.
</BentoItem>
<BentoItem title="Turbopack Dev" span="1" tag="Performance" icon="zap">
Up to 76.7% faster local server startup.
</BentoItem>
<BentoItem title="Enhanced Security" span="1" tag="Security" icon="shield">
Server Actions with unguessable action IDs.
</BentoItem>
</BentoGrid>
`;

const parsedHtml = marked.parse(fullXml);
console.log('Parsed BentoGrid HTML:\n', parsedHtml);

assert(parsedHtml.includes('nexus-bento-container'), 'Should contain nexus-bento-container');
assert(parsedHtml.includes('Next.js 15 Core Highlights'), 'Should contain title');
assert(parsedHtml.includes('span-2'), 'Should contain span-2 for hero item');
assert(parsedHtml.includes('nexus-bento-tag'), 'Should contain tag badge');
assert(parsedHtml.includes('React 19 &amp; React Compiler') || parsedHtml.includes('React 19 & React Compiler'), 'Should contain item title');

console.log('Testing <BentoGrid> Partial Streaming Parsing...');
const streamChunk = `
<BentoGrid title="Rust Core Pillars">
<BentoItem title="Memory Safety" span="2" tag="Core" icon="shield">
Ownership system without a garbage collector.
</BentoItem>
<BentoItem title="Concurrency" span="1" tag="Async" icon="zap">
Fearless concurrency model.
`;

const parsedStreamHtml = marked.parse(streamChunk);
assert(parsedStreamHtml.includes('nexus-bento-container'), 'Should render container during streaming');
assert(parsedStreamHtml.includes('Memory Safety'), 'Should render first completed item during streaming');
assert(parsedStreamHtml.includes('Concurrency'), 'Should render open item during streaming');

console.log('✅ ALL BENTO GRID TESTS PASSED 100%!');
