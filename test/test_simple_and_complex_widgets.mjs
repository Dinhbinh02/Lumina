import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Load marked parser
const markedMinPath = path.join(__dirname, '../lib/vendor/marked.min.js');
const markedCode = fs.readFileSync(markedMinPath, 'utf8');
const markedFn = new Function('window', 'globalThis', `${markedCode}; return (typeof marked !== 'undefined' ? marked : (typeof window !== 'undefined' ? window.marked : globalThis.marked));`);
const marked = markedFn({}, globalThis);
globalThis.marked = marked;

// 2. Import WidgetRunner and LMDX parser
const { WidgetRunner } = await import('../src/components/widgets/widget_runner.js');
globalThis.WidgetRunner = WidgetRunner;

const lmdxModule = await import('../src/components/chat/lmdx_components_parser.js');
lmdxModule.initLmdxComponentsParser();

// Read keys
const apiKeysFile = fs.readFileSync(path.join(__dirname, '../docs/api_keys.txt'), 'utf8');
const keyMatches = apiKeysFile.match(/AQ\.[A-Za-z0-9_-]+|AIzaSy[A-Za-z0-9_-]+/g);
const API_KEY = keyMatches ? keyMatches[0] : '';
const MODEL = 'gemini-flash-lite-latest';

// Read exact system instruction from chat_stream_service.js
const chatStreamServiceCode = fs.readFileSync(path.join(__dirname, '../src/background/chat_stream_service.js'), 'utf8');
const fnCode = `
function detectDomainFromContext() { return 'software_engineering'; }
${chatStreamServiceCode.slice(chatStreamServiceCode.indexOf('function buildChatSystemInstruction('), chatStreamServiceCode.indexOf('function buildProofreadSystemPrompt('))}
return buildChatSystemInstruction(false, 'desktop', 'Create interactive widget', []);
`;

const systemInstruction = new Function(fnCode)();
console.log(`[TEST SUITE] Loaded full production system instruction (${systemInstruction.length} chars)`);

async function callGemini(prompt, systemInstruction) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;
    const payload = {
        contents: [
            {
                role: 'user',
                parts: [{ text: prompt }]
            }
        ],
        systemInstruction: {
            parts: [{ text: systemInstruction }]
        },
        generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 5000
        }
    };

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Gemini API Error ${res.status}: ${errText}`);
    }

    const data = await res.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

const scenarios = [
    {
        category: 'ĐƠN GIẢN (Simple #1: Unit / Currency Converter)',
        prompt: 'Tạo công cụ chuyển đổi tiền tệ USD, EUR, JPY sang VND có thể nhập số tiền và đổi chiều chuyển đổi tức thì',
    },
    {
        category: 'ĐƠN GIẢN (Simple #2: Bill Split & Tip Calculator)',
        prompt: 'Tạo công cụ tính tiền Tip và chia tiền hóa đơn ăn uống theo số người và phần trăm tip trực tiếp',
    },
    {
        category: 'PHỨC TẠP (Complex #1: 3-Body Gravitational Orbit Simulation)',
        prompt: 'Mô phỏng chuyển động quỹ đạo lực hấp dẫn 3 thiên thể (3-Body Gravitational Orbit) trên Canvas với vector vận tốc, vệt chuyển động (trajectory trace), nút điều chỉnh khối lượng và tốc độ thời gian',
    },
    {
        category: 'PHỨC TẠP (Complex #2: Multi-Asset Investment & Compound Interest)',
        prompt: 'Tạo công cụ phân tích và trực quan hóa phân bổ danh mục đầu tư tài chính đa tài sản (Cổ phiếu, Trái phiếu, Vàng, Bất động sản) với biểu đồ tăng trưởng lãi kép đa giai đoạn và bảng số liệu chi tiết',
    }
];

async function runAll() {
    console.log('============================================================');
    console.log('🌐 RUNNING SIMPLE & COMPLEX WIDGET BENCHMARK SUITE');
    console.log('============================================================');

    let totalPassed = 0;
    let totalTests = 0;

    for (const sc of scenarios) {
        totalTests++;
        console.log(`\n------------------------------------------------------------`);
        console.log(`[TEST ${totalTests}/${scenarios.length}] ${sc.category}`);
        console.log(`Prompt: "${sc.prompt}"`);

        const text = await callGemini(sc.prompt, systemInstruction);
        
        assert(text && text.length > 50, 'Received valid text response from Gemini');
        console.log('  ✅ Received response from Gemini (' + text.length + ' chars)');

        if (!/<GenerateWidget/i.test(text)) {
            console.log('--- RESPONSE PREVIEW (First 600 chars) ---');
            console.log(text.slice(0, 600));
            console.log('--- END PREVIEW ---');
        }
        assert(/<GenerateWidget/i.test(text), 'Produced <GenerateWidget> tag');
        console.log('  ✅ Produced <GenerateWidget> tag');

        assert(/<\/GenerateWidget>/i.test(text), 'Closed </GenerateWidget> tag properly');
        console.log('  ✅ Closed </GenerateWidget> tag properly');

        // Check Anti-Slop
        const hasGradient = /linear-gradient|radial-gradient/i.test(text);
        assert(!hasGradient, 'Strictly NO multi-color gradients');
        console.log('  ✅ Anti-Slop: No multi-color gradients');

        const hasHeavyShadow = /box-shadow:\s*0\s+(?:[1-9]\d+|[2-9]\d*)px/i.test(text);
        assert(!hasHeavyShadow, 'Strictly NO heavy tacky drop shadows');
        console.log('  ✅ Anti-Slop: No heavy tacky drop shadows');

        // Check Markdown Parsing
        const parsedHtml = marked.parse(text);
        assert(parsedHtml.includes('class="nexus-widget-wrapper"'), 'Parsed into nexus-widget-wrapper');
        assert(!parsedHtml.includes('```html'), 'No raw markdown code fences leaked');
        assert(parsedHtml.includes('class="nexus-widget-iframe"'), 'Contains interactive iframe');
        console.log('  ✅ Parsed into clean HTML with iframe sandbox');

        // Extract clean code
        const rawCode = WidgetRunner.extractWidgetCode(text);
        assert(rawCode.includes('<script') && rawCode.includes('</script>'), 'Contains executable script tag');
        console.log('  ✅ Contains complete executable JS logic');

        totalPassed++;
        console.log(`  🎉 ${sc.category} PASSED 100%!`);
    }

    console.log('\n============================================================');
    console.log(`📊 BENCHMARK SUMMARY: ${totalPassed}/${totalTests} Scenarios Passed 100%`);
    console.log('============================================================');
}

runAll().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
