import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const apiKeysFile = fs.readFileSync(path.join(__dirname, '../docs/api_keys.txt'), 'utf8');
const keyMatches = apiKeysFile.match(/AQ\.[A-Za-z0-9_-]+|AIzaSy[A-Za-z0-9_-]+/g);
const API_KEY = keyMatches ? keyMatches[0] : '';
const MODEL = 'gemini-flash-lite-latest';

// Read exact system instruction from chat_stream_service.js
const chatStreamServiceCode = fs.readFileSync(path.join(__dirname, '../src/background/chat_stream_service.js'), 'utf8');
const fnCode = `
function detectDomainFromContext() { return 'general'; }
${chatStreamServiceCode.slice(chatStreamServiceCode.indexOf('function buildChatSystemInstruction('), chatStreamServiceCode.indexOf('function buildProofreadSystemPrompt('))}
return buildChatSystemInstruction(false, 'desktop', 'general chat', []);
`;

const FULL_SYSTEM_INSTRUCTION = new Function(fnCode)();

const SHORT_PROMPTS = [
  { id: '1. Pomodoro Timer', prompt: 'làm đồng hồ pomodoro' },
  { id: '2. Bill Split & Tip', prompt: 'tính tiền tip và chia bill' },
  { id: '3. Pendulum Physics', prompt: 'mô phỏng con lắc đơn' },
  { id: '4. BMI Calculator', prompt: 'tính chỉ số bmi' },
  { id: '5. Budget Planner', prompt: 'lập kế hoạch phân bổ ngân sách 50/30/20' },
];

async function callGemini(userPrompt, systemInstruction) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;
  const payload = {
    contents: [
      { role: 'user', parts: [{ text: userPrompt }] }
    ],
    systemInstruction: {
      parts: [{ text: FULL_SYSTEM_INSTRUCTION }]
    },
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 3000
    }
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API Error: ${res.status} ${errText}`);
  }

  const json = await res.json();
  return json.candidates[0].content.parts[0].text;
}

function analyzeWidget(text) {
  const hasTag = /<GenerateWidget\b[^>]*>([\s\S]*?)<\/GenerateWidget>/i.test(text);
  const tagMatch = text.match(/<GenerateWidget\s+([^>]+)>/i);
  const titleMatch = tagMatch ? tagMatch[1].match(/title="([^"]+)"/i) : null;
  const heightMatch = tagMatch ? tagMatch[1].match(/height="([^"]+)"/i) : null;
  
  const innerHtml = hasTag ? text.match(/<GenerateWidget\b[^>]*>([\s\S]*?)<\/GenerateWidget>/i)[1] : '';
  const hasGradients = /linear-gradient|radial-gradient/i.test(innerHtml);
  const hasShadows = /box-shadow:\s*(?!none)[^;]+/i.test(innerHtml);
  const hasScript = /<script\b[^>]*>([\s\S]*?)<\/script>/i.test(innerHtml);
  const hasInputsOrButtons = /<input|<button|<select|<canvas/i.test(innerHtml);

  return {
    hasTag,
    title: titleMatch ? titleMatch[1] : 'Interactive Widget',
    height: heightMatch ? heightMatch[1] : 'default',
    hasGradients,
    hasShadows,
    hasScript,
    hasInputsOrButtons,
    snippet: innerHtml.slice(0, 180).replace(/\n/g, ' ')
  };
}

async function run() {
  console.log('============================================================');
  console.log('🧪 TESTING SHORT & NATURAL USER PROMPTS WITH GEMINI FLASH LITE');
  console.log('============================================================\n');

  console.log(`[Instruction] Loaded system instruction (${FULL_SYSTEM_INSTRUCTION.length} chars)\n`);

  let passed = 0;

  for (const testCase of SHORT_PROMPTS) {
    console.log(`------------------------------------------------------------`);
    console.log(`[TEST] ${testCase.id}`);
    console.log(`Prompt: "${testCase.prompt}"`);

    try {
      const response = await callGemini(testCase.prompt, FULL_SYSTEM_INSTRUCTION);
      const analysis = analyzeWidget(response);

      console.log(`  Response length: ${response.length} chars`);
      console.log(`  Widget Title: "${analysis.title}"`);
      console.log(`  Initial Height: "${analysis.height}"`);

      assert.strictEqual(analysis.hasTag, true, 'Model must produce <GenerateWidget> tag');
      console.log('  ✅ Automatically triggered <GenerateWidget> from short prompt');

      assert.strictEqual(analysis.hasInputsOrButtons, true, 'Must contain interactive controls');
      console.log('  ✅ Generated interactive controls (sliders / buttons / inputs / canvas)');

      assert.strictEqual(analysis.hasScript, true, 'Must contain functional script logic');
      console.log('  ✅ Included functional script logic with auto-startup');

      assert.strictEqual(analysis.hasGradients, false, 'Must not use tacky gradients');
      console.log('  ✅ Anti-Slop: Clean solid styling (No linear-gradient)');

      passed++;
      console.log(`  🎉 ${testCase.id} PASSED!\n`);
    } catch (err) {
      console.error(`  ❌ Failed:`, err.message);
    }
  }

  console.log('============================================================');
  console.log(`📊 BENCHMARK SUMMARY: ${passed}/${SHORT_PROMPTS.length} short prompts passed cleanly!`);
  console.log('============================================================');
}

run();
