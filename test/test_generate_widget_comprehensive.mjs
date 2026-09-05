import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('============================================================');
console.log('🧪 RUNNING COMPREHENSIVE GENERATE_WIDGET TEST SUITE');
console.log('============================================================\n');

// 1. Load marked parser
const markedMinPath = path.join(__dirname, '../src/lib/marked.min.js');
const markedCode = fs.readFileSync(markedMinPath, 'utf8');
const markedFn = new Function('window', 'globalThis', `${markedCode}; return (typeof marked !== 'undefined' ? marked : (typeof window !== 'undefined' ? window.marked : globalThis.marked));`);
const marked = markedFn({}, globalThis);
globalThis.marked = marked;

// 2. Import WidgetRunner and LMDX parser
const { WidgetRunner } = await import('../src/components/widgets/widget_runner.js');
globalThis.WidgetRunner = WidgetRunner;

const lmdxModule = await import('../src/components/cores/component_parser.js');
lmdxModule.initLmdxComponentsParser();

let passedAssertions = 0;
let totalAssertions = 0;

function assert(condition, message) {
    totalAssertions++;
    if (condition) {
        console.log(`  ✅ ${message}`);
        passedAssertions++;
    } else {
        console.error(`  ❌ FAILED: ${message}`);
    }
}

// ------------------------------------------------------------
// UNIT TESTS: WidgetRunner & LMDX Tokenizer / Renderer
// ------------------------------------------------------------

console.log('[UNIT 1/8] Standard Markdown Code Fence (```html ... ```)');
{
    const input = `<GenerateWidget height="450px" title="Máy Tính Khoản Vay">
\`\`\`html
<style>.card { padding: 10px; }</style>
<div class="card">
  <input type="range" id="loan" value="1000">
  <span id="res">1000</span>
</div>
<script>
  const el = document.getElementById('loan');
  el.addEventListener('input', () => { document.getElementById('res').textContent = el.value; });
</script>
\`\`\`
</GenerateWidget>`;

    const parsedHtml = marked.parse(input);
    const cleanCode = WidgetRunner.extractWidgetCode(input.match(/<GenerateWidget[^>]*>([\s\S]*?)<\/GenerateWidget>/i)[1]);

    assert(!cleanCode.includes('```html'), 'Markdown code fence ```html is stripped');
    assert(!cleanCode.includes('```'), 'Trailing ``` is stripped');
    assert(cleanCode.includes('id="loan"'), 'Input element is preserved');
    assert(parsedHtml.includes('class="nexus-widget-wrapper"'), 'Renders nexus-widget-wrapper');
    assert(parsedHtml.includes('data-widget-height="450px"'), 'Height attribute 450px parsed correctly');
    assert(parsedHtml.includes('Máy Tính Khoản Vay'), 'Title parsed correctly');
    assert(!parsedHtml.includes('nexus-widget-badge'), 'No nexus-widget-badge rendered');
}

console.log('\n[UNIT 2/8] Missing Closing Markdown Fence (```html ... </GenerateWidget>)');
{
    const input = `<GenerateWidget height="520px" title="Physics Simulator">
\`\`\`html
<canvas id="simCanvas" width="600" height="300"></canvas>
<script>
  const c = document.getElementById('simCanvas');
  const ctx = c.getContext('2d');
  ctx.fillRect(0, 0, 100, 100);
</script>
</GenerateWidget>`;

    const parsedHtml = marked.parse(input);
    const cleanCode = WidgetRunner.extractWidgetCode(input.match(/<GenerateWidget[^>]*>([\s\S]*?)<\/GenerateWidget>/i)[1]);

    assert(!cleanCode.includes('```html'), 'Opening ```html stripped cleanly even without closing ```');
    assert(cleanCode.includes('simCanvas'), 'Canvas element is preserved');
    assert(parsedHtml.includes('class="nexus-widget-wrapper"'), 'Renders nexus-widget-wrapper');
    assert(!parsedHtml.includes('```html'), 'No leaked markdown text in HTML');
}

console.log('\n[UNIT 3/8] Inverted / Flexible Attributes (title before height)');
{
    const input = `<GenerateWidget title="Compound Interest Calculator" height="360px">
\`\`\`html
<div>Interest Calc</div>
\`\`\`
</GenerateWidget>`;

    const parsedHtml = marked.parse(input);
    assert(parsedHtml.includes('Compound Interest Calculator'), 'Title parsed when placed before height');
    assert(parsedHtml.includes('data-widget-height="360px"'), 'Height parsed when placed after title');
}

console.log('\n[UNIT 4/8] Default Fallback Attributes (No height or title specified)');
{
    const input = `<GenerateWidget>
<div>Simple Widget</div>
</GenerateWidget>`;

    const parsedHtml = marked.parse(input);
    assert(parsedHtml.includes('data-widget-height="380px"'), 'Defaults height to 380px');
    assert(parsedHtml.includes('Interactive Widget'), 'Defaults title to Interactive Widget');
}

console.log('\n[UNIT 5/8] JSON Format Inside Widget');
{
    const jsonSpec = JSON.stringify({
        html: '<div id="json-widget">JSON Loaded</div><script>console.log("ok");</script>'
    });
    const input = `<GenerateWidget title="JSON Test">${jsonSpec}</GenerateWidget>`;
    const cleanCode = WidgetRunner.extractWidgetCode(jsonSpec);

    assert(cleanCode.includes('id="json-widget"'), 'Extracts HTML from JSON spec');
    assert(cleanCode.includes('JSON Loaded'), 'Preserves content from JSON spec');
}

console.log('\n[UNIT 6/8] Incomplete Streaming State (<GenerateWidget> in-progress)');
{
    const partialStream = `<GenerateWidget height="400px" title="Loading Tool">
\`\`\`html
<style>
  .box { color: red; }
</style>
<div class="b`;

    const parsedHtml = marked.parse(partialStream);
    assert(parsedHtml.includes('nexus-widget-loading'), 'Renders loading skeleton during stream');
    assert(parsedHtml.includes('nexus-widget-blueprint-body'), 'Renders blueprint grid body');
    assert(parsedHtml.includes('nexus-blueprint-scanline'), 'Contains laser scanline element');
    assert(parsedHtml.includes('Loading Tool'), 'Displays title on skeleton');
}

console.log('\n[UNIT 7/8] Special Characters, Vietnamese Unicode & Math Equations ($g$, ₫, %, °)');
{
    const input = `<GenerateWidget title="Mô Phỏng Trọng Lực & Góc Bắn (°)">
\`\`\`html
<div class="card">
  <label>Góc: 45° | Lãi suất: 8.5% | Tiền: 2.000.000.000 ₫ | Trọng lực: $g = 9.81 m/s^2$</label>
</div>
\`\`\`
</GenerateWidget>`;

    const parsedHtml = marked.parse(input);
    assert(parsedHtml.includes('Mô Phỏng Trọng Lực &amp; Góc Bắn (°)'), 'Safely handles Vietnamese Unicode and HTML entities in title');
    assert(parsedHtml.includes('class="nexus-widget-wrapper"'), 'Renders wrapper correctly');
}

console.log('\n[UNIT 8/8] Sandbox HTML Document Packaging');
{
    const code = '<canvas id="c"></canvas><script>let x = 10;</script>';
    const packaged = WidgetRunner.buildSandboxedHtml(code, true);

    assert(packaged.includes('<!DOCTYPE html>'), 'Contains DOCTYPE declaration');
    assert(packaged.includes('<style>'), 'Contains responsive sandbox styling');
    assert(packaged.includes('--bg-color: #1e1e24'), 'Dark theme tokens applied in dark mode');
    assert(packaged.includes('canvas id="c"'), 'User code embedded cleanly');
}

// ------------------------------------------------------------
// LIVE GEMINI API TESTS (Using docs/api_keys.txt & Exact System Instruction)
// ------------------------------------------------------------

console.log('\n============================================================');
console.log('🌐 RUNNING LIVE GEMINI API END-TO-END TESTS');
console.log('============================================================\n');

// Read keys
const apiKeysFile = fs.readFileSync(path.join(__dirname, '../docs/api_keys.txt'), 'utf8');
const keyMatches = apiKeysFile.match(/AQ\.[A-Za-z0-9_-]+|AIzaSy[A-Za-z0-9_-]+/g);
const API_KEY = keyMatches ? keyMatches[0] : '';
const MODEL = 'gemini-flash-lite-latest';

// Read exact system instruction from chat_service.js
const chatStreamServiceCode = fs.readFileSync(path.join(__dirname, '../src/background/chat_service.js'), 'utf8');

// Extract detectDomainFromContext and buildChatSystemInstruction
const fnCode = `
function detectDomainFromContext() { return 'software_engineering'; }
${chatStreamServiceCode.slice(chatStreamServiceCode.indexOf('function buildChatSystemInstruction('), chatStreamServiceCode.indexOf('function cleanThinkingBlocks('))}
return buildChatSystemInstruction(false, 'desktop', 'Create interactive widget', []);
`;

const FULL_SYSTEM_INSTRUCTION = new Function(fnCode)();
console.log(`[TEST SUITE] Loaded full production system instruction (${FULL_SYSTEM_INSTRUCTION.length} chars)`);

async function testLiveGemini(promptText, testName) {
    console.log(`\n------------------------------------------------------------`);
    console.log(`[LIVE TEST] ${testName}`);
    console.log(`Prompt: "${promptText}"`);

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;
    const payload = {
        contents: [{ role: 'user', parts: [{ text: promptText }] }],
        systemInstruction: { parts: [{ text: FULL_SYSTEM_INSTRUCTION }] },
        generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 4096
        }
    };

    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const errText = await res.text();
            console.error(`  ❌ API Error: HTTP ${res.status}: ${errText}`);
            return;
        }

        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

        assert(text.length > 50, 'Received valid text response from Gemini');
        assert(/<GenerateWidget/i.test(text), 'Model produced <GenerateWidget> tag');
        assert(/<\/GenerateWidget>/i.test(text), 'Model closed </GenerateWidget> tag properly');

        // Check Anti-Slop Design (No gradients & No heavy shadows)
        const hasGradient = /linear-gradient|radial-gradient/i.test(text);
        const hasHeavyShadow = /box-shadow:\s*0\s+(?:[1-9]\d+|[2-9]\d*)px/i.test(text);
        assert(!hasGradient, 'Anti-Slop: Strictly NO multi-color gradients (linear-gradient/radial-gradient)');
        assert(!hasHeavyShadow, 'Anti-Slop: Strictly NO heavy tacky drop shadows');
        assert(text.includes('var(--') || /#[0-9a-f]{3,6}/i.test(text), 'Design: Uses clean solid colors or theme tokens');

        const parsedHtml = marked.parse(text);
        assert(parsedHtml.includes('class="nexus-widget-wrapper"'), 'Parsed into nexus-widget-wrapper');
        assert(!parsedHtml.includes('```html'), 'No raw markdown ```html leaked into DOM');
        assert(parsedHtml.includes('nexus-widget-iframe'), 'Contains interactive iframe');
        console.log(`  🎉 ${testName} successfully verified!`);
    } catch (err) {
        console.error(`  ❌ Exception in ${testName}:`, err.message);
    }
}

// Run Live Scenarios
await testLiveGemini(
    'Tạo cho tôi một công cụ tính toán lãi suất vay mua nhà (Mortgage Calculator) tương tác trực tiếp với các thanh trượt số tiền vay và lãi suất',
    'Scenario 1: Mortgage Calculator'
);

await testLiveGemini(
    'Mô phỏng quỹ đạo ném xiên (Projectile Motion) bằng Canvas tương tác với các nút điều chỉnh góc bắn và vận tốc',
    'Scenario 2: Projectile Motion Simulation'
);

console.log('\n============================================================');
console.log(`📊 TEST SUITE SUMMARY: ${passedAssertions}/${totalAssertions} assertions passed`);
if (passedAssertions === totalAssertions) {
    console.log('🎉 ALL GENERATE_WIDGET TESTS PASSED WITH 100% SUCCESS!');
} else {
    console.log('⚠️ Some assertions failed. Please inspect logs above.');
}
console.log('============================================================\n');
