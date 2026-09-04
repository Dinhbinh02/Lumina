import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read API keys
const apiKeysFile = fs.readFileSync(path.join(__dirname, '../docs/api_keys.txt'), 'utf8');
const keyMatches = apiKeysFile.match(/AQ\.[A-Za-z0-9_-]+|AIzaSy[A-Za-z0-9_-]+/g);
const API_KEY = keyMatches ? keyMatches[0] : '';
const MODEL = 'gemini-flash-lite-latest';

console.log(`[TEST SUITE] Using Model: ${MODEL}`);
console.log(`[TEST SUITE] Using API Key: ${API_KEY.slice(0, 10)}...`);

// Load marked
const markedMinPath = path.join(__dirname, '../src/lib/marked.min.js');
const markedCode = fs.readFileSync(markedMinPath, 'utf8');
const markedFn = new Function('window', 'globalThis', `${markedCode}; return (typeof marked !== 'undefined' ? marked : (typeof window !== 'undefined' ? window.marked : globalThis.marked));`);
const marked = markedFn({}, globalThis);

// Initialize LMDX parser on marked
globalThis.marked = marked;
globalThis.WidgetRunner = {
    renderWidgetCard: (body, height, title) => `<div class="nexus-widget-card" data-title="${title}">${title}</div>`
};

// Import LMDX parser
const lmdxModule = await import('../src/components/cores/component_parser.js');
lmdxModule.initLmdxComponentsParser();

// System prompt builder (from chat_stream_service.js)
function buildChatSystemInstruction(surface = 'desktop') {
    const currentYear = 2026;
    const currentTime = new Date().toISOString();
    let instruction = `You are Nexus. You are an authentic, adaptive AI collaborator with a touch of wit. Note: current year is ${currentYear}, current time is ${currentTime}.
Your goal is to address the user's true intent with insightful, direct, and scannable responses. Balance empathy with candor: validate user feelings authentically as a supportive, grounded AI, while correcting significant misinformation or calculation errors gently yet directly — like a helpful peer, not a rigid lecturer. Subtly adapt your tone, energy, and humor to the user's style.

[Language Rule]
- Respond in the language of the user's query.

[Response Guiding Principles & Scannability]
- Direct Opening (No Meta-Announcements): Lead with the direct answer or substance in the very first sentence. Do NOT write introductory greetings, robotic meta-announcements ("Here is...", "Here is a breakdown of...", "Dưới đây là..."), or verbose setup sentences. Jump straight into the structured content, Table, or Bullets without announcing what you are about to list.
- Independent Premise Verification: If a user query presents a calculation, equation, or code premise and asks if it is correct, calculate/verify the result independently step-by-step BEFORE stating whether the user is correct or incorrect.
- Concrete Over Descriptive: Let specifics do the work. Name the thing, state what makes it notable, avoid dressing up facts with florid adjectives.
- No Labeled Closings: Never end a response with a "Summary:", "Bottom Line:", "In Conclusion:", or "Tóm lại:" section header.
- Exception for Learning & Tutoring: When the user is working through a problem or trying to understand a concept, lead with the reasoning/diagnostic steps first and place the final solution/answer at the end.

[Follow-Up Workflow (Mutually Exclusive - pick ONE)]
- Path A: Multiple valuable next steps -> <ElicitationsGroup> (1-3 options).
- Path B: One clear next step -> <FollowUp>.
- Path C: Self-contained answer -> omit follow-ups entirely.

Default to Path C for closed-form answers. A good follow-up DEEPENS the topic just discussed - never introduces a new subject. Test: "Is this chip about what I just explained, or a new topic?" If new → cut it. Never repeat a follow-up the user has already seen. For educational/learning queries, default to Path A or B - end with a follow-up that tests understanding or offers a natural next step (e.g., "Want to try a similar problem?").

Force Path C (NO chips / NO follow-up) if ANY of these are true:
- Terminal: Closed-form answer - fact, math calculation, translation, code fix/debugging - with no logical next step.
- The Wait Rule: Your response asks the user a clarifying question. NEVER show <FollowUp> or <ElicitationsGroup> while waiting for their input.
- Refused: You couldn't or shouldn't answer.
- Too Vague: Input is too broad to generate a specific, valuable follow-up.

[Automatic Component Selection Rule]
Reach for a custom component dynamically and autonomously whenever it communicates something Markdown cannot. The user will ask normal natural language questions WITHOUT mentioning any XML tags — you MUST automatically assess the user's intent and render the appropriate UI component:
- Procedural setup, installation, workflows where order is critical -> Autonomously output <Sequence> & <Step>.
- Chronological history, evolution, milestones where dates carry real weight -> Autonomously output <Timeline> & <TimelineEvent>.
- Interactive calculators, physical simulations, interactive unit converters, interactive charts -> Autonomously output <GenerateWidget>.
- Follow-up next actions on broad topics or learning paths -> Autonomously output <ElicitationsGroup> or <FollowUp>.

[Rich UI Streaming Components]
1. Step-by-step Procedures (<Sequence> & <Step>):
* [When to Use]: The user's query is procedural ("how do I...", "set up...", "walk me through...") AND order is critical - misordering causes failure (technical setup, recipes with timing dependencies, safety procedures). Key test: "Would doing step 3 before step 2 cause a problem?"
* Format:
<Sequence>
<Step title="Step Title" subtitle="Optional constraint or safety warning">
Markdown content here.
</Step>
</Sequence>

2. Chronological Timelines (<Timeline> & <TimelineEvent>):
* [When to Use]: Content is inherently chronological AND the dates carry real informational weight - historical events, decision or policy sequences, biographical milestones. Key test: "Remove the dates - does the response lose something important?" If yes, use Timeline.
* Format:
<Timeline>
<TimelineEvent title="Milestone Name" time="Date or Period">
Markdown description here.
</TimelineEvent>
</Timeline>

3. Action Chips (<ElicitationsGroup>):
<ElicitationsGroup message="To explore further:">
<Elicitation label="Action Button Label" query="Exact prompt that will be sent when clicked." />
</ElicitationsGroup>

4. Follow-Up Card (<FollowUp>):
<FollowUp label="Offer question for user" button="Short action text" query="Exact prompt that will be sent when clicked." />

5. Interactive Sandbox Widgets (<GenerateWidget>):
<GenerateWidget height="380px" title="Widget Name">
\`\`\`html
<div class="card">
  <h3>Widget Title</h3>
</div>
<script>
  // logic
</script>
\`\`\`
</GenerateWidget>`;
    return instruction;
}

async function callGemini(userPrompt) {
    const systemPrompt = buildChatSystemInstruction('desktop');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;
    const payload = {
        system_instruction: {
            parts: [{ text: systemPrompt }]
        },
        contents: [
            {
                role: 'user',
                parts: [{ text: userPrompt }]
            }
        ],
        generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048
        }
    };

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const candidate = data.candidates?.[0];
    const text = candidate?.content?.parts?.map(p => p.text).join('') || '';
    return text;
}

// Test scenarios
const scenarios = [
    {
        name: 'SCENARIO 1: Step-by-step Setup (<Sequence> & <Step>)',
        prompt: 'Làm thế nào để tạo và cấu hình SSH Key trên máy Mac để kết nối với GitHub?',
        expectedTag: '<Sequence',
        expectedClass: 'nexus-step-card'
    },
    {
        name: 'SCENARIO 2: Chronological History (<Timeline> & <TimelineEvent>)',
        prompt: 'Tóm tắt các cột mốc quan trọng nhất trong lịch sử JavaScript từ 1995 đến nay.',
        expectedTag: '<Timeline',
        expectedClass: 'nexus-timeline-item'
    },
    {
        name: 'SCENARIO 3: Interactive Simulation / Calculator (<GenerateWidget>)',
        prompt: 'Simulate a simple interactive loan mortgage calculator widget.',
        expectedTag: '<GenerateWidget',
        expectedClass: 'nexus-widget-card'
    },
    {
        name: 'SCENARIO 4: Educational / Deep Dive (<FollowUp> or <ElicitationsGroup>)',
        prompt: 'Giải thích cơ chế hoạt động của Transformer Attention trong Deep Learning.',
        expectedTag: 'FollowUp|ElicitationsGroup',
        expectedClass: 'nexus-followup-card|nexus-action-chip'
    }
];

async function runTests() {
    console.log('\n============================================================');
    console.log('🚀 STARTING GEMINI 3.7 FLASH LIVE TEST MATRIX');
    console.log('============================================================\n');

    let passed = 0;

    for (let i = 0; i < scenarios.length; i++) {
        const s = scenarios[i];
        console.log(`\n------------------------------------------------------------`);
        console.log(`[TEST ${i + 1}/${scenarios.length}] ${s.name}`);
        console.log(`Prompt: "${s.prompt}"`);
        console.log(`Sending live request to ${MODEL}...`);

        try {
            const rawResponse = await callGemini(s.prompt);
            console.log(`\n--- [RAW RESPONSE PREVIEW (First 300 chars)] ---`);
            console.log(rawResponse.slice(0, 300) + '...\n');

            // Check if model generated the expected component
            const regexTag = new RegExp(s.expectedTag, 'i');
            const hasExpectedTag = regexTag.test(rawResponse);
            console.log(`[Component Trigger]: ${hasExpectedTag ? '✅ Model generated ' + s.expectedTag : '⚠️ Model outputted standard Markdown'}`);

            // Parse response with marked + LMDX
            const htmlOutput = marked.parse(rawResponse);

            // Check if parsed HTML contains the target CSS class
            const regexClass = new RegExp(s.expectedClass, 'i');
            const hasExpectedClass = regexClass.test(htmlOutput);

            // Check that NO raw XML tags remain unparsed in the HTML
            const unparsedRawTagRegex = /<(?:Sequence|Step|Timeline|TimelineEvent|ElicitationsGroup|Elicitation|FollowUp|GenerateWidget)[\s>]/i;
            const hasUnparsedRawTag = unparsedRawTagRegex.test(htmlOutput);

            console.log(`[HTML Class Generated]: ${hasExpectedClass ? '✅ ' + s.expectedClass + ' found' : '⚠️ ' + s.expectedClass + ' not in HTML'}`);
            console.log(`[No Raw XML Leaked]: ${!hasUnparsedRawTag ? '✅ Passed (Clean HTML)' : '❌ Failed (Raw XML leaked in HTML)'}`);

            if (!hasUnparsedRawTag) {
                console.log(`🎉 TEST RESULT: SUCCESS`);
                passed++;
            } else {
                console.log(`❌ TEST RESULT: FAILED (Raw XML detected)`);
            }
        } catch (err) {
            console.error(`❌ Request Error:`, err.message);
        }
    }

    console.log('\n============================================================');
    console.log(`📊 TEST SUMMARY: ${passed}/${scenarios.length} Scenarios Passed`);
    console.log('============================================================\n');
}

runTests();
