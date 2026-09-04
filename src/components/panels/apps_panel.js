import { widgetRegistry } from '../widgets/widget_registry.js';
import { WidgetRunner } from '../widgets/widget_runner.js';
import { NexusMenu, NexusChatInput } from '../ui/index.js';
import { NexusModelHelper } from '../chat/model_helper.js';

export const APPS_STORAGE_KEY = 'nexus_custom_apps';

export const BUILTIN_APPS_CATALOG = [
    {
        id: 'timer',
        name: 'Countdown Timer',
        category: 'productivity',
        description: 'Set countdown timers with instant presets, sound alerts, and full-screen focus mode.',
        icon: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`,
        tags: ['Timer', 'Focus', 'Clock'],
        defaultCode: `<div class="card" style="text-align: center; padding: 24px;">
  <h2 style="margin-bottom: 8px;">Countdown Timer</h2>
  <div id="display" style="font-size: 42px; font-weight: 700; font-variant-numeric: tabular-nums; margin: 16px 0;">05:00</div>
  <div class="row" style="justify-content: center; gap: 8px;">
    <button id="start-btn" style="background: #1a73e8; color: #fff;">Start</button>
    <button id="reset-btn">Reset</button>
  </div>
</div>
<script>
  let seconds = 300;
  let timer = null;
  const disp = document.getElementById('display');
  const btn = document.getElementById('start-btn');
  function update() {
    const m = String(Math.floor(seconds / 60)).padStart(2, '0');
    const s = String(seconds % 60).padStart(2, '0');
    disp.textContent = m + ':' + s;
  }
  btn.onclick = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
      btn.textContent = 'Start';
    } else {
      btn.textContent = 'Pause';
      timer = setInterval(() => {
        if (seconds > 0) { seconds--; update(); }
        else { clearInterval(timer); timer = null; btn.textContent = 'Start'; alert('Time is up!'); }
      }, 1000);
    }
  };
  document.getElementById('reset-btn').onclick = () => {
    clearInterval(timer);
    timer = null;
    seconds = 300;
    btn.textContent = 'Start';
    update();
  };
  update();
</script>`
    },
    {
        id: 'pomodoro',
        name: 'Pomodoro Focus',
        category: 'productivity',
        description: '25/5 focus & break interval cycles with ambient sound alerts and session tracking.',
        icon: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M12 3v3"></path><path d="M12 9v6l3 2"></path></svg>`,
        tags: ['Work', 'Pomodoro', 'Productivity']
    },
    {
        id: 'stopwatch',
        name: 'Precision Stopwatch',
        category: 'productivity',
        description: 'Millisecond-accurate lap stopwatch with split timings and data export.',
        icon: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"></circle><path d="M12 9v4l2 2"></path><path d="M10 2h4"></path></svg>`,
        tags: ['Stopwatch', 'Lap', 'Time']
    },
    {
        id: 'unit_converter',
        name: 'Multi-Unit Converter',
        category: 'utilities',
        description: 'Convert length, mass, temperature, speed, volume, and digital storage units.',
        icon: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 16-4 4-4-4"></path><path d="M17 20V4"></path><path d="m3 8 4-4 4 4"></path><path d="M7 4v16"></path></svg>`,
        tags: ['Converter', 'Math', 'Units']
    },
    {
        id: 'world_clock',
        name: 'World Timezones',
        category: 'utilities',
        description: 'Realtime international clock with multi-city timezone differences and solar status.',
        icon: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>`,
        tags: ['Timezone', 'World', 'Clock']
    },
    {
        id: 'date_diff',
        name: 'Date Diff & Countdown',
        category: 'utilities',
        description: 'Calculate exact elapsed days, weeks, business days, and live event countdowns.',
        icon: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>`,
        tags: ['Date', 'Calendar', 'Countdown']
    },
    {
        id: 'qr_generator',
        name: 'QR Studio Generator',
        category: 'utilities',
        description: 'Generate high-resolution customizable QR codes for links, Wi-Fi, and contact cards.',
        icon: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>`,
        tags: ['QR Code', 'Generator', 'Link']
    },
    {
        id: 'currency',
        name: 'Currency Exchange',
        category: 'finance',
        description: 'Live global exchange rates with multi-currency comparison and offline caching.',
        icon: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>`,
        tags: ['Forex', 'USD', 'VND', 'Rates']
    },
    {
        id: 'crypto',
        name: 'Crypto Market',
        category: 'finance',
        description: 'Realtime cryptocurrency market prices, 24h gainers/losers, and sparkline trends.',
        icon: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.5 9h5c1 0 2 .5 2 1.5s-1 1.5-2 1.5M9.5 12h5.5c1 0 2 .5 2 1.5s-1 1.5-2 1.5h-5.5"></path><line x1="9.5" y1="7" x2="9.5" y2="17"></line></svg>`,
        tags: ['Bitcoin', 'ETH', 'Crypto', 'Market']
    },
    {
        id: 'loan_calc',
        name: 'Loan & Mortgage',
        category: 'finance',
        description: 'Calculate monthly loan amortizations, interest breakdowns, and payoff timelines.',
        icon: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"></path><path d="M5 21V7l8-4v18"></path><path d="M19 21V11l-6-4"></path><path d="M9 9v.01"></path><path d="M9 12v.01"></path><path d="M9 15v.01"></path><path d="M9 18v.01"></path></svg>`,
        tags: ['Mortgage', 'Bank', 'Interest']
    },
    {
        id: 'compound_interest',
        name: 'Compound Interest',
        category: 'finance',
        description: 'Project wealth growth with recurring deposits, compounding frequencies, and charts.',
        icon: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>`,
        tags: ['Savings', 'Investment', 'Growth']
    },
    {
        id: 'tip_splitter',
        name: 'Tip & Bill Splitter',
        category: 'finance',
        description: 'Calculate custom tip percentages and divide restaurant bills evenly across groups.',
        icon: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`,
        tags: ['Dining', 'Split', 'Bill']
    },
    {
        id: 'gold_price',
        name: 'Gold Price Monitor',
        category: 'finance',
        description: 'Live SJC, 9999 ring, and international gold prices with buy/sell spreads.',
        icon: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>`,
        tags: ['Gold', 'SJC', 'XAU', 'Finance']
    },
    {
        id: 'weather',
        name: 'Live Weather',
        category: 'health',
        description: 'Current temperature, atmospheric pressure, wind velocity, and radar conditions.',
        icon: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"></path></svg>`,
        tags: ['Weather', 'Rain', 'Temperature']
    },
    {
        id: 'weather_forecast',
        name: '7-Day Forecast',
        category: 'health',
        description: 'Extended weekly weather outlook with rain probability and thermal trends.',
        icon: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v2"></path><path d="m4.93 4.93 1.41 1.41"></path><path d="M20 12h2"></path><path d="m19.07 4.93-1.41 1.41"></path><path d="M15.947 12.65a4 4 0 0 0-5.925-4.128"></path><path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z"></path></svg>`,
        tags: ['Forecast', 'Weekly', 'Weather']
    },
    {
        id: 'air_quality',
        name: 'Air Quality (AQI)',
        category: 'health',
        description: 'Realtime PM2.5, PM10, and AQI pollution levels with health advice.',
        icon: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2"></path></svg>`,
        tags: ['AQI', 'PM2.5', 'Health', 'Air']
    },
    {
        id: 'sun_uv',
        name: 'Sun & UV Index',
        category: 'health',
        description: 'Solar elevation, sunrise, sunset, and UV radiation index with skin protection guides.',
        icon: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="12" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`,
        tags: ['UV', 'Sun', 'Sunrise', 'Sunset']
    },
    {
        id: 'bmi_tdee',
        name: 'BMI & TDEE Calculator',
        category: 'health',
        description: 'Calculate Body Mass Index, Basal Metabolic Rate (BMR), and daily calorie targets.',
        icon: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"></path></svg>`,
        tags: ['Fitness', 'Calories', 'BMI', 'Health']
    },
    {
        id: 'function_plotter',
        name: 'Function Plotter',
        category: 'science',
        description: 'Interactive 2D mathematical function graphing calculator with pan and zoom.',
        icon: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="3" x2="3" y2="21"></line><line x1="3" y1="21" x2="21" y2="21"></line><path d="M3 18c3-3 6-12 9-12s6 9 9 9"></path></svg>`,
        tags: ['Math', 'Plotter', 'Graph', 'Calculus']
    },
    {
        id: 'periodic_table',
        name: 'Periodic Table',
        category: 'science',
        description: 'Interactive Mendeleev chemical table with atomic numbers, electron shells, and masses.',
        icon: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2v7.31"></path><path d="M14 9.3V1.99"></path><path d="M8.5 2h7"></path><path d="M14 9.3a6.5 6.5 0 1 1-4 0"></path><path d="M5.52 16h12.96"></path></svg>`,
        tags: ['Chemistry', 'Elements', 'Science']
    }
];

const APP_BUILDER_SYSTEM_PROMPT = `You are Codex, an expert full-stack AI engineer and interactive web application architect inside Nexus App Studio. You collaborate with the user to brainstorm, design, build, and refine self-contained, production-grade interactive web applications.

# GENERAL
You bring a senior engineer’s judgment to the work. You read the current app code and recent conversation history first, resist easy assumptions, and let the existing patterns guide how you move.

- You prefer the existing patterns, styling conventions, and helper logic over inventing unnecessary abstractions.
- You keep edits closely scoped to the user's intent and behavioral requirements.
- You build feature-complete, robust, and delightful experiences that a target user would naturally expect.

# INTENT CLASSIFICATION & AUTONOMY
1. **Conversational Intent (Chat / Explain / Discuss)**:
   - When the user is greeting you ("hi", "hello"), asking general questions, discussing architecture or possible features, asking for explanations, or brainstorming, RESPOND CONVERSATIONALLY in concise, helpful Markdown.
   - DO NOT output code or the <GenerateApp> / <PatchApp> tags when the user is merely conversing.

2. **Code Generation & Modification Intent (Build / Modify / Fix)**:
   - When the user asks to create a new app or do a major redesign, output the complete executable code inside the <GenerateApp> block.
   - When the user asks to modify, fix, or enhance an existing app, output targeted SEARCH / REPLACE edits inside the <PatchApp> block.
   - Lead with a concise 1-2 sentence overview of what was added or changed before the code block.

# DEFAULT NEXUS COMPONENT DESIGN SYSTEM (STRICT CONSISTENCY)
Unless the user explicitly requests a custom aesthetic, theme, or different design style, ALL created mini apps MUST strictly adhere to the Nexus Component Design System for maximum visual consistency:

### 1. Theme, Surfaces & Colors
- **Canvas / Body**: Set \`body { background: transparent; color: #ffffff; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 16px; box-sizing: border-box; }\` so the widget card floats cleanly on the canvas.
- **Card Shell**: Background \`#0d0d0d\`, border \`1px solid rgba(255, 255, 255, 0.08)\`, border-radius \`18px\`, padding \`16px 20px\`, max-width \`480px\` (or \`350px-480px\` centered), box-shadow \`0 4px 20px rgba(0, 0, 0, 0.25)\`, box-sizing \`border-box\`.
- **Inputs & Inner Boxes**: Background \`#18181b\`, border \`1px solid rgba(255, 255, 255, 0.12)\`, border-radius \`8px\`-\`10px\`, height \`38px\`, color \`#ffffff\`. Focus-within: border-color \`rgba(255, 255, 255, 0.35)\`.
- **Text Palette**: Primary \`#ffffff\` (100%), Secondary \`rgba(255, 255, 255, 0.65)\`, Tertiary/Muted \`rgba(255, 255, 255, 0.45)\`.
- **Accents**: Emerald \`#10b981\` (active/success/running), Cyan \`#38bdf8\` (time/data/info), Amber \`#f59e0b\` (warning/pending), Rose \`#f43f5e\` (danger/loss), Indigo \`#6366f1\`.

### 2. Standard Widget Layout & Component Anatomy
- **Top Bar Header**:
  * Left: Title badge with status dot (\`width: 6px; height: 6px; border-radius: 50%; background: #10b981; box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.4); flex-shrink: 0;\`) + uppercase title text (\`font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.6); text-transform: uppercase; letter-spacing: 0.04em;\`).
  * Right: Live status badge, rate display, or action icon button (\`background: rgba(255,255,255,0.06); padding: 2px 8px; border-radius: 20px; font-size: 11px; font-family: monospace; color: rgba(255,255,255,0.7);\`).
- **Hero Display Block** (for timers, clocks, calculators, counters, big metrics):
  * Label: \`font-size: 11px; font-weight: 600; text-transform: uppercase; color: rgba(255,255,255,0.5); letter-spacing: 0.04em;\`.
  * Value: \`font-size: 32px\` to \`42px\`, \`font-weight: 700\`, \`font-variant-numeric: tabular-nums\`, \`letter-spacing: -0.02em\`, \`line-height: 1.1\`, \`color: #ffffff\`.
- **Buttons & Controls**:
  * Primary CTA: \`background: #ffffff; color: #000000; font-weight: 700; border-radius: 8px; height: 36px; padding: 0 16px; border: none; box-shadow: 0 1px 4px rgba(0,0,0,0.2); transition: all 0.15s ease;\` (Hover: \`background: #f0f0f0; transform: translateY(-1px);\`, Active: \`transform: translateY(0) scale(0.98);\`).
  * Secondary Button: \`background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.1); color: #ffffff; border-radius: 8px; height: 36px; padding: 0 14px;\` (Hover: \`background: rgba(255, 255, 255, 0.12);\`).
  * Icon Button: \`width: 32px; height: 32px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center;\`.
- **Segmented Tabs / Switchers**:
  * Track: \`background: rgba(255, 255, 255, 0.04); padding: 3px; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.06); display: flex; gap: 4px;\`.
  * Active tab: \`background: rgba(255, 255, 255, 0.12); color: #ffffff; border-radius: 6px; box-shadow: 0 1px 4px rgba(0,0,0,0.2);\`.
- **Stat Summary Grid**:
  * Container: \`display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 10px; margin-top: 12px;\`.
  * Item Box: \`background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 10px; padding: 10px 12px;\`.

### 3. Typography & Numerical Precision
- Primary Font: \`'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif\`.
- All numbers, timers, rates, and values MUST use \`font-variant-numeric: tabular-nums;\` to prevent layout jittering during state changes.

# USER OVERRIDES
If the user explicitly asks for a custom visual theme (e.g. "make it light mode", "retro cyberpunk", "pastel minimal", "full-page dashboard", "game canvas"), fulfill their specific creative request while maintaining clean code architecture and responsive stability.

# CODE QUALITY & CONSTRAINTS
- Output clean, self-contained HTML5, modern CSS3, and Vanilla JavaScript (ES6+).
- **Zero Narrative Comments**: Do not write comments that narrate the obvious (e.g., avoid "// Define function", "// Add event listener", "// Increment counter"). Code must be self-documenting.
- **Robustness**: Implement complete event handlers, input validation, and defensive fallbacks (e.g. localStorage caching when appropriate). Avoid placeholder functions or incomplete TODOs.

# DUAL PROTOCOL FOR CODE GENERATION & TARGETED EDITING

### PROTOCOL A: CREATING A NEW APP OR COMPLETE REWRITE (&lt;GenerateApp&gt;)
When creating an app from scratch or when the user explicitly requests a complete redesign/rewrite, output the entire runnable document wrapped in &lt;GenerateApp&gt;:

<GenerateApp title="App Name" height="480px">
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    /* Domain-tailored CSS adhering to Nexus Component Design System */
  </style>
</head>
<body>
  <!-- Semantic DOM elements -->
  <script>
    // Robust, interactive logic
  </script>
</body>
</html>
</GenerateApp>

### PROTOCOL B: TARGETED EDITING / REFACTORING / FIXING EXISTING APPS (&lt;PatchApp&gt;)
When modifying an existing app (adding features, changing colors, tweaking layout, fixing bugs, updating functions), DO NOT regenerate the entire file. Use precise SEARCH / REPLACE blocks wrapped inside &lt;PatchApp&gt;:

<PatchApp>
<<<<<<< SEARCH
[Exact lines of existing code to match]
=======
[New replacement lines of code]
>>>>>>> REPLACE
</PatchApp>

- **SEARCH block rules**:
  * Must match the existing code in the app character-for-character, including indentation and formatting.
  * Include 1 to 3 lines of surrounding context if necessary to ensure unique matching.
  * You can include multiple SEARCH / REPLACE blocks inside a single &lt;PatchApp&gt; tag to make non-contiguous edits in one turn.
- **Speed & Token Optimization**:
  * Keep patches minimal and tightly scoped to what the user requested. Never rewrite unchanged sections.`;

export class AppsPanel {
    constructor() {
        this.container = null;
        this.activeFilter = 'all';
        this.searchTerm = '';
        this.currentApp = null;
        this.customApps = {};
        this.activeStudioTab = 'preview'; // 'preview' | 'code'
        this.isGenerating = false;
        this.currentStreamPort = null;
        this.isInitialized = false;
        this.selectedModel = null;
        this.fileInputEl = null;
        this.speechRecognition = null;
        this.isRecording = false;
        this.isPlayerMode = false;
    }

    async init(targetAppId, mode) {
        this.cacheElements();
        if (!this.isInitialized) {
            this.bindEvents();
            this.isInitialized = true;
        }

        await this.loadCustomApps();
        await this.initStudioModelSelector();

        if (targetAppId) {
            this.showStudioView();
            const foundCustom = this.customApps[targetAppId];
            const foundBuiltin = BUILTIN_APPS_CATALOG.find(b => b.id === targetAppId);
            if (foundCustom) {
                if (mode === 'studio' || mode === 'edit') {
                    this.openAppStudio(foundCustom);
                } else {
                    this.launchApp(foundCustom);
                }
            } else if (foundBuiltin) {
                if (mode === 'remix' || mode === 'studio' || mode === 'edit') {
                    this.remixBuiltinApp(foundBuiltin);
                } else {
                    this.launchBuiltinApp(foundBuiltin);
                }
            } else {
                this.showHubView();
            }
        } else {
            this.showHubView();
        }
    }

    cacheElements() {
        this.container = document.getElementById('apps-page');
        this.hubView = document.getElementById('apps-hub-view');
        this.studioView = document.getElementById('apps-studio-view');
        this.appsStudioContainer = document.querySelector('.apps-studio-container');
        this.catalogGrid = document.getElementById('apps-catalog-grid');
        this.searchInput = document.getElementById('apps-search-input');
        this.createAppBtn = document.getElementById('apps-create-btn');
        this.filterPills = document.querySelectorAll('.apps-filter-pill');

        this.studioBackBtn = document.getElementById('apps-studio-back-btn');
        this.studioTitleInput = document.getElementById('apps-studio-title-input');
        this.appsStudioModeToggleBtn = document.getElementById('apps-studio-mode-toggle-btn');
        this.appsStudioModeLabel = document.getElementById('apps-studio-mode-label');
        this.studioReloadBtn = document.getElementById('apps-studio-reload-btn');
        this.studioSaveBtn = document.getElementById('apps-studio-save-btn');
        this.studioExportBtn = document.getElementById('apps-studio-export-btn');
        this.studioDeleteBtn = document.getElementById('apps-studio-delete-btn');
        this.studioPreviewFrame = document.getElementById('apps-studio-preview-iframe');
        this.studioCodeEditor = document.getElementById('apps-studio-code-editor');
        this.studioPromptInput = document.getElementById('apps-studio-prompt-input');
        this.studioSendBtn = document.getElementById('apps-studio-send-btn');
        this.studioChatMessages = document.getElementById('apps-studio-chat-messages');
        this.studioTabPreview = document.getElementById('apps-tab-preview');
        this.studioTabCode = document.getElementById('apps-tab-code');
        this.studioPreviewPane = document.getElementById('apps-preview-pane');
        this.nativeWidgetHost = document.getElementById('apps-native-widget-host');
        this.studioCodePane = document.getElementById('apps-code-pane');

        this.appsUploadBtn = document.getElementById('apps-upload-btn');
        this.appsModelBtn = document.getElementById('apps-model-btn');
        this.appsModelLabel = document.getElementById('apps-model-label');
        this.appsMicBtn = document.getElementById('apps-mic-btn');
    }

    bindEvents() {
        if (this.searchInput) {
            this.searchInput.addEventListener('input', (e) => {
                this.searchTerm = e.target.value.trim().toLowerCase();
                this.renderCatalog();
            });
        }

        if (this.filterPills) {
            this.filterPills.forEach(pill => {
                pill.addEventListener('click', () => {
                    this.filterPills.forEach(p => p.classList.remove('active'));
                    pill.classList.add('active');
                    this.activeFilter = pill.dataset.filter || 'all';
                    this.renderCatalog();
                });
            });
        }

        if (this.createAppBtn) {
            this.createAppBtn.addEventListener('click', () => {
                this.createNewCustomApp();
            });
        }

        if (this.studioBackBtn) {
            this.studioBackBtn.addEventListener('click', () => {
                this.showHubView();
            });
        }

        if (this.studioTitleInput) {
            this.studioTitleInput.addEventListener('change', () => {
                if (this.currentApp) {
                    this.currentApp.name = this.studioTitleInput.value.trim() || 'Untitled App';
                    this.saveCurrentApp();
                }
            });
        }

        if (this.studioReloadBtn) {
            this.studioReloadBtn.addEventListener('click', () => {
                this.refreshStudioPreview();
            });
        }

        if (this.studioSaveBtn) {
            this.studioSaveBtn.addEventListener('click', () => {
                if (this.activeStudioTab === 'code' && this.studioCodeEditor && this.currentApp) {
                    this.currentApp.code = this.studioCodeEditor.value;
                }
                this.saveCurrentApp(true);
            });
        }

        if (this.studioExportBtn) {
            this.studioExportBtn.addEventListener('click', () => {
                this.exportAppHtml();
            });
        }

        if (this.studioDeleteBtn) {
            this.studioDeleteBtn.addEventListener('click', () => {
                this.deleteCurrentApp();
            });
        }

        if (this.appsStudioModeToggleBtn) {
            this.appsStudioModeToggleBtn.addEventListener('click', () => {
                if (this.isPlayerMode) {
                    if (this.currentApp?.isBuiltin) {
                        const builtin = BUILTIN_APPS_CATALOG.find(b => b.id === this.currentApp.id);
                        if (builtin) {
                            this.remixBuiltinApp(builtin);
                        } else {
                            this.setPlayerMode(false);
                        }
                    } else {
                        this.setPlayerMode(false);
                    }
                } else {
                    this.setPlayerMode(true);
                }
            });
        }

        if (this.studioTabPreview) {
            this.studioTabPreview.addEventListener('click', () => {
                this.switchStudioTab('preview');
            });
        }

        if (this.studioTabCode) {
            this.studioTabCode.addEventListener('click', () => {
                this.switchStudioTab('code');
            });
        }

        if (this.studioSendBtn) {
            this.studioSendBtn.addEventListener('click', () => {
                this.handlePromptSubmit();
            });
        }

        if (this.studioPromptInput) {
            NexusChatInput.bindAutoGrow(this.studioPromptInput);
            this.studioPromptInput.addEventListener('input', () => {
                if (this.studioSendBtn) {
                    this.studioSendBtn.disabled = !this.studioPromptInput.value.trim();
                }
            });
            this.studioPromptInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.handlePromptSubmit();
                }
            });
        }

        this.bindStudioInputActions();

        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
            chrome.storage.onChanged.addListener((changes, area) => {
                if (area === 'local' && changes[APPS_STORAGE_KEY]) {
                    this.customApps = changes[APPS_STORAGE_KEY].newValue || {};
                    this.renderCatalog();
                    if (this.currentApp && this.customApps[this.currentApp.id]) {
                        const updated = this.customApps[this.currentApp.id];
                        this.currentApp = updated;
                        if (this.studioTitleInput) this.studioTitleInput.value = updated.name || 'Untitled App';
                        if (this.studioCodeEditor) this.studioCodeEditor.value = updated.code || '';
                        this.renderChatMessages();
                        this.refreshStudioPreview();
                    }
                }
            });
        }
    }

    async initStudioModelSelector() {
        try {
            const data = await chrome.storage.local.get(['providers', 'models', 'advancedParamsByModel', 'lastUsedModel']);
            const chain = (typeof window !== 'undefined' && window.NexusModelHelper)
                ? window.NexusModelHelper.buildModelChain(data)
                : ((typeof NexusModelHelper !== 'undefined') ? NexusModelHelper.buildModelChain(data) : []);
            let currentModel = this.selectedModel?.model || data.lastUsedModel?.model;
            let currentProviderId = this.selectedModel?.providerId || data.lastUsedModel?.providerId;
            if (!currentModel && chain.length > 0) {
                currentModel = chain[0].model;
                currentProviderId = chain[0].providerId;
            }
            if (currentModel) {
                this.selectedModel = { model: currentModel, providerId: currentProviderId };
                const found = chain.find(c => c.model === currentModel && c.providerId === currentProviderId) || chain.find(c => c.model === currentModel);
                const displayName = found ? (found.displayName || found.name || found.model) : currentModel;
                if (this.appsModelLabel) {
                    this.appsModelLabel.textContent = displayName;
                }
            }
        } catch (e) {
            console.warn('[AppsPanel] Model init error:', e);
        }
    }

    bindStudioInputActions() {
        if (this.appsModelBtn) {
            this.appsModelBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                try {
                    const data = await chrome.storage.local.get(['providers', 'models', 'advancedParamsByModel', 'lastUsedModel']);
                    const chain = (typeof window !== 'undefined' && window.NexusModelHelper)
                        ? window.NexusModelHelper.buildModelChain(data)
                        : ((typeof NexusModelHelper !== 'undefined') ? NexusModelHelper.buildModelChain(data) : []);
                    if (chain.length === 0) return;

                    let currentModel = this.selectedModel?.model || data.lastUsedModel?.model;
                    let currentProviderId = this.selectedModel?.providerId || data.lastUsedModel?.providerId;
                    if (!currentModel && chain.length > 0) {
                        currentModel = chain[0].model;
                        currentProviderId = chain[0].providerId;
                    }

                    const items = chain.map(item => {
                        const isSelected = (currentModel === item.model && currentProviderId === item.providerId) || currentModel === item.model;
                        const displayName = item.displayName || item.name || item.model;
                        return {
                            label: displayName,
                            subtitle: item.providerName || item.providerId,
                            active: !!isSelected,
                            action: async () => {
                                this.selectedModel = { model: item.model, providerId: item.providerId };
                                if (this.appsModelLabel) {
                                    this.appsModelLabel.textContent = displayName;
                                }
                                await chrome.storage.local.set({ lastUsedModel: this.selectedModel });
                            }
                        };
                    });

                    NexusMenu.show({
                        anchor: this.appsModelBtn,
                        placement: 'top-start',
                        items
                    });
                } catch (err) {
                    console.warn('[AppsPanel] Model menu error:', err);
                }
            });
        }

        if (this.appsUploadBtn) {
            this.appsUploadBtn.addEventListener('click', () => {
                if (!this.fileInputEl) {
                    this.fileInputEl = document.createElement('input');
                    this.fileInputEl.type = 'file';
                    this.fileInputEl.id = 'apps-hidden-file-input';
                    this.fileInputEl.style.display = 'none';
                    this.fileInputEl.multiple = true;
                    this.fileInputEl.accept = '.txt,.js,.html,.css,.json,.md,image/*';
                    document.body.appendChild(this.fileInputEl);

                    this.fileInputEl.addEventListener('change', async (e) => {
                        const files = Array.from(e.target.files || []);
                        if (files.length === 0) return;
                        for (const file of files) {
                            if (file.type.startsWith('text/') || file.name.match(/\.(txt|js|html|css|json|md|py|ts)$/i)) {
                                const content = await file.text();
                                const snippet = `\n\n--- Attached File: ${file.name} ---\n${content}\n--- End of File ---\n`;
                                if (this.studioPromptInput) {
                                    this.studioPromptInput.value = (this.studioPromptInput.value + snippet).trim();
                                    NexusChatInput.bindAutoGrow(this.studioPromptInput);
                                    if (this.studioSendBtn) this.studioSendBtn.disabled = !this.studioPromptInput.value.trim();
                                }
                            } else if (file.type.startsWith('image/')) {
                                const reader = new FileReader();
                                reader.onload = (re) => {
                                    const snippet = `\n\n[Attached image: ${file.name}]\n`;
                                    if (this.studioPromptInput) {
                                        this.studioPromptInput.value = (this.studioPromptInput.value + snippet).trim();
                                        NexusChatInput.bindAutoGrow(this.studioPromptInput);
                                        if (this.studioSendBtn) this.studioSendBtn.disabled = !this.studioPromptInput.value.trim();
                                    }
                                };
                                reader.readAsDataURL(file);
                            }
                        }
                        this.fileInputEl.value = '';
                    });
                }
                this.fileInputEl.click();
            });
        }

        if (this.appsMicBtn) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (SpeechRecognition) {
                this.speechRecognition = new SpeechRecognition();
                this.speechRecognition.continuous = false;
                this.speechRecognition.interimResults = false;
                this.speechRecognition.lang = navigator.language || 'en-US';

                this.speechRecognition.onstart = () => {
                    this.isRecording = true;
                    this.appsMicBtn.classList.add('recording');
                    this.appsMicBtn.style.color = '#EA4335';
                };

                this.speechRecognition.onresult = (event) => {
                    const transcript = event.results[0][0].transcript;
                    if (transcript && this.studioPromptInput) {
                        const currentVal = this.studioPromptInput.value;
                        this.studioPromptInput.value = currentVal ? `${currentVal} ${transcript}` : transcript;
                        NexusChatInput.bindAutoGrow(this.studioPromptInput);
                        if (this.studioSendBtn) this.studioSendBtn.disabled = false;
                    }
                };

                this.speechRecognition.onerror = (err) => {
                    console.warn('[AppsMic Error]', err);
                    this.isRecording = false;
                    this.appsMicBtn.classList.remove('recording');
                    this.appsMicBtn.style.removeProperty('color');
                };

                this.speechRecognition.onend = () => {
                    this.isRecording = false;
                    this.appsMicBtn.classList.remove('recording');
                    this.appsMicBtn.style.removeProperty('color');
                };

                this.appsMicBtn.addEventListener('click', () => {
                    if (!this.speechRecognition) return;
                    if (this.isRecording) {
                        this.speechRecognition.stop();
                    } else {
                        this.speechRecognition.start();
                    }
                });
            } else {
                this.appsMicBtn.title = 'Voice input not supported in this browser';
                this.appsMicBtn.style.opacity = '0.5';
            }
        }
    }

    async loadCustomApps() {
        try {
            const res = await chrome.storage.local.get([APPS_STORAGE_KEY]);
            this.customApps = res[APPS_STORAGE_KEY] || {};
        } catch (e) {
            this.customApps = {};
        }
    }

    async saveCustomApps() {
        try {
            await chrome.storage.local.set({ [APPS_STORAGE_KEY]: this.customApps });
            if (typeof NexusSync !== 'undefined' && typeof NexusSync.triggerDebouncedSync === 'function') {
                NexusSync.triggerDebouncedSync();
            }
        } catch (e) {
            console.error('[AppsPanel] Failed to save custom apps:', e);
        }
    }

    showHubView() {
        if (this.container) {
            this.container.classList.remove('is-detail');
        }
        if (this.hubView) {
            this.hubView.style.display = 'flex';
        }
        if (this.studioView) {
            this.studioView.style.display = 'none';
        }
        if (typeof window.NexusViewManager !== 'undefined') {
            window.NexusViewManager.updateUrl('apps');
        }
        this.renderCatalog();
    }

    showStudioView() {
        if (this.container) {
            this.container.classList.add('is-detail');
        }
        if (this.hubView) {
            this.hubView.style.display = 'none';
        }
        if (this.studioView) {
            this.studioView.style.display = 'flex';
        }
    }

    renderCatalog() {
        if (!this.catalogGrid) return;

        const customList = Object.values(this.customApps).map(a => ({
            ...a,
            isCustom: true
        }));

        const builtinList = BUILTIN_APPS_CATALOG.map(b => ({
            ...b,
            isCustom: false
        }));

        let combined = [];

        if (this.activeFilter === 'all') {
            combined = [...customList, ...builtinList];
        } else if (this.activeFilter === 'my_apps') {
            combined = customList;
        } else if (this.activeFilter === 'builtin') {
            combined = builtinList;
        } else {
            combined = [...customList, ...builtinList].filter(item => item.category === this.activeFilter);
        }

        if (this.searchTerm) {
            combined = combined.filter(item => {
                const nameMatch = (item.name || '').toLowerCase().includes(this.searchTerm);
                const descMatch = (item.description || '').toLowerCase().includes(this.searchTerm);
                const tagMatch = (item.tags || []).some(t => t.toLowerCase().includes(this.searchTerm));
                return nameMatch || descMatch || tagMatch;
            });
        }

        if (combined.length === 0) {
            const isMyApps = this.activeFilter === 'my_apps';
            this.catalogGrid.innerHTML = `
                <div class="apps-empty-state" style="grid-column: 1 / -1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 56px 16px; text-align: center;">
                    <div style="font-size: 32px; margin-bottom: 8px;">🧩</div>
                    <div style="font-weight: 600; font-size: 15px; margin-bottom: 4px; color: var(--nexus-text-primary);">${isMyApps ? 'No custom apps yet' : 'No apps found'}</div>
                    <div style="color: var(--nexus-text-secondary); font-size: 13px; margin-bottom: 16px;">${isMyApps ? 'Create your own AI-powered custom apps or remix existing built-in tools.' : 'Try another search keyword or create a new custom AI App.'}</div>
                    ${isMyApps ? `<button type="button" class="nexus-primary-btn" id="apps-empty-create-btn" style="height: 30px; font-size: 13px;">+ Create New App</button>` : ''}
                </div>
            `;
            const emptyBtn = this.catalogGrid.querySelector('#apps-empty-create-btn');
            if (emptyBtn) {
                emptyBtn.addEventListener('click', () => this.createNewCustomApp());
            }
            return;
        }

        this.catalogGrid.innerHTML = combined.map(app => {
            const isCustom = !!app.isCustom;
            const categoryLabel = (app.category || 'Utility').toUpperCase();
            const iconSvg = app.icon || `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>`;

            return `
                <div class="nexus-hub-card app-catalog-card" data-app-id="${app.id}" data-is-custom="${isCustom}">
                    <div class="app-card-top" style="display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 10px;">
                        <div class="app-card-icon-box" style="width: 38px; height: 38px; border-radius: 9px; display: flex; align-items: center; justify-content: center; background: var(--nexus-question-bg, rgba(0,0,0,0.04)); color: var(--nexus-text-primary);">
                            ${iconSvg}
                        </div>
                        <div style="display: flex; align-items: center; gap: 6px;">
                            ${isCustom ? `<span class="app-custom-badge" style="font-size: 10px; font-weight: 600; padding: 2px 6px; border-radius: 5px; background: rgba(26,115,232,0.12); color: #1a73e8;">MY APP</span>` : ''}
                            <span class="app-category-badge" style="font-size: 10px; font-weight: 600; padding: 2px 6px; border-radius: 5px; background: var(--nexus-question-bg, rgba(0,0,0,0.04)); color: var(--nexus-text-secondary);">${categoryLabel}</span>
                        </div>
                    </div>
                    <div class="app-card-title" style="font-weight: 600; font-size: 14px; margin-bottom: 5px; color: var(--nexus-text-primary);">${app.name}</div>
                    <div class="app-card-desc" style="font-size: 12.5px; line-height: 1.45; color: var(--nexus-text-secondary); flex: 1; margin-bottom: 14px;">${app.description || 'Interactive custom web application created with Nexus AI.'}</div>
                    <div class="app-card-actions" style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: auto; padding-top: 4px;">
                        <button type="button" class="nexus-primary-btn app-launch-btn" style="flex: 1; height: 28px; font-size: 12px;" data-id="${app.id}">
                            <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                            Launch
                        </button>
                        <button type="button" class="nexus-secondary-btn app-remix-btn" style="height: 28px; font-size: 12px;" data-id="${app.id}" title="${isCustom ? 'Edit with AI' : 'Customize with AI'}">
                            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                            ${isCustom ? 'Edit' : 'Remix'}
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        this.catalogGrid.querySelectorAll('.app-launch-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const appId = btn.dataset.id;
                const custom = this.customApps[appId];
                const builtin = BUILTIN_APPS_CATALOG.find(b => b.id === appId);
                if (custom) {
                    this.launchApp(custom);
                } else if (builtin) {
                    this.launchBuiltinApp(builtin);
                }
            });
        });

        this.catalogGrid.querySelectorAll('.app-remix-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const appId = btn.dataset.id;
                const custom = this.customApps[appId];
                const builtin = BUILTIN_APPS_CATALOG.find(b => b.id === appId);
                if (custom) {
                    this.openAppStudio(custom);
                } else if (builtin) {
                    this.remixBuiltinApp(builtin);
                }
            });
        });
    }

    createNewCustomApp() {
        const id = 'app_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
        const newApp = {
            id: id,
            name: 'New Custom App',
            description: 'Custom web application powered by Nexus AI.',
            category: 'utilities',
            code: `<div class="card" style="text-align: center; padding: 32px 16px;">
  <h2 style="margin-bottom: 8px;">✨ My New App</h2>
  <p style="color: #666; margin-bottom: 20px;">Use the AI Assistant on the left to describe what you want this app to do!</p>
  <button id="demo-btn" style="background: #1a73e8; color: #fff; padding: 8px 18px; border-radius: 8px;">Click Me</button>
</div>
<script>
  let count = 0;
  document.getElementById('demo-btn').onclick = () => {
    count++;
    document.getElementById('demo-btn').textContent = 'Clicked ' + count + ' times! 🚀';
  };
</script>`,
            chatHistory: [
                {
                    role: 'assistant',
                    text: "👋 Hello! How can I help you customize or enhance this app? Feel free to describe any features, design improvements, or logic you'd like to add.",
                    timestamp: Date.now()
                }
            ],
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        this.customApps[id] = newApp;
        this.saveCustomApps();
        this.openAppStudio(newApp);
    }

    remixBuiltinApp(builtin) {
        const id = 'app_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
        const starterCode = builtin.defaultCode || `<div class="card" style="padding: 20px; text-align: center;">
  <h2>${builtin.name}</h2>
  <p style="margin: 12px 0;">${builtin.description}</p>
  <div data-nexus-widget-placeholder data-widget-name="${builtin.id}"></div>
</div>`;

        const remixedApp = {
            id: id,
            name: `${builtin.name} (Custom Remix)`,
            description: `Customized version of ${builtin.name}`,
            category: builtin.category || 'utilities',
            code: starterCode,
            chatHistory: [
                {
                    role: 'assistant',
                    text: `🛠️ Loaded template for **${builtin.name}**. What features or design enhancements would you like to add? Let me know below!`,
                    timestamp: Date.now()
                }
            ],
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        this.customApps[id] = remixedApp;
        this.saveCustomApps();
        this.openAppStudio(remixedApp);
    }

    launchBuiltinApp(builtin) {
        const tempApp = {
            id: builtin.id,
            name: builtin.name,
            description: builtin.description,
            category: builtin.category || 'utilities',
            code: builtin.defaultCode || `<div class="card" style="padding: 20px; text-align: center;"><h2>${builtin.name}</h2><p style="margin: 12px 0;">${builtin.description}</p><div data-nexus-widget-placeholder data-widget-name="${builtin.id}"></div></div>`,
            isBuiltin: true
        };
        this.launchApp(tempApp);
    }

    launchApp(app) {
        this.currentApp = app;
        this.showStudioView();
        this.setPlayerMode(true);

        if (this.studioTitleInput) {
            this.studioTitleInput.value = app.name || 'Untitled App';
            this.studioTitleInput.readOnly = !!app.isBuiltin;
        }

        if (this.studioCodeEditor) {
            this.studioCodeEditor.value = app.code || '';
        }

        this.renderChatMessages();
        this.switchStudioTab('preview');
        this.refreshStudioPreview();

        if (typeof window.NexusViewManager !== 'undefined') {
            window.NexusViewManager.updateUrl('apps', { appId: app.id, mode: 'player' });
        }
    }

    openAppStudio(app) {
        this.currentApp = app;
        this.showStudioView();
        this.setPlayerMode(false);

        if (this.studioTitleInput) {
            this.studioTitleInput.value = app.name || 'Untitled App';
            this.studioTitleInput.readOnly = false;
        }

        if (this.studioCodeEditor) {
            this.studioCodeEditor.value = app.code || '';
        }

        this.renderChatMessages();
        this.switchStudioTab('preview');
        this.refreshStudioPreview();

        requestAnimationFrame(() => {
            if (this.studioPromptInput && !this.isPlayerMode) {
                this.studioPromptInput.focus();
            }
        });

        if (typeof window.NexusViewManager !== 'undefined') {
            window.NexusViewManager.updateUrl('apps', { appId: app.id, mode: 'studio' });
        }
    }

    setPlayerMode(isPlayer) {
        this.isPlayerMode = isPlayer;
        if (this.appsStudioContainer) {
            if (isPlayer) {
                this.appsStudioContainer.classList.add('is-player');
            } else {
                this.appsStudioContainer.classList.remove('is-player');
            }
        }
        if (this.appsStudioModeLabel) {
            this.appsStudioModeLabel.textContent = isPlayer ? 'Edit with AI' : 'Player';
        }
    }

    switchStudioTab(tab) {
        this.activeStudioTab = tab;
        if (tab === 'preview') {
            this.studioTabPreview?.classList.add('active');
            this.studioTabCode?.classList.remove('active');
            if (this.studioPreviewPane) this.studioPreviewPane.style.display = 'flex';
            if (this.studioCodePane) this.studioCodePane.style.display = 'none';
            this.refreshStudioPreview();
        } else {
            this.studioTabCode?.classList.add('active');
            this.studioTabPreview?.classList.remove('active');
            if (this.studioPreviewPane) this.studioPreviewPane.style.display = 'none';
            if (this.studioCodePane) this.studioCodePane.style.display = 'flex';
            if (this.studioCodeEditor && this.currentApp) {
                this.studioCodeEditor.value = this.currentApp.code || '';
            }
        }
    }

    refreshStudioPreview() {
        if (!this.currentApp) return;

        if (this.currentApp.isBuiltin && widgetRegistry.has(this.currentApp.id) && this.nativeWidgetHost) {
            if (this.studioPreviewFrame) this.studioPreviewFrame.style.display = 'none';
            this.nativeWidgetHost.style.display = 'flex';
            this.nativeWidgetHost.innerHTML = '';
            widgetRegistry.mount(this.currentApp.id, this.nativeWidgetHost);
            return;
        }

        if (this.nativeWidgetHost) this.nativeWidgetHost.style.display = 'none';
        if (!this.studioPreviewFrame) return;
        this.studioPreviewFrame.style.display = 'block';

        const rawCode = this.currentApp.code || '';
        const cleanCode = WidgetRunner.extractWidgetCode(rawCode, rawCode) || rawCode;
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

        const sendToSandbox = () => {
            try {
                this.studioPreviewFrame.contentWindow?.postMessage({
                    type: 'NEXUS_WIDGET_RENDER',
                    code: cleanCode,
                    isDark
                }, '*');
            } catch (e) {
                console.error('[AppsStudio] PostMessage to sandbox error:', e);
            }
        };

        const sandboxUrl = (typeof chrome !== 'undefined' && chrome.runtime?.getURL)
            ? chrome.runtime.getURL('pages/sandbox/widget_sandbox.html')
            : '/pages/sandbox/widget_sandbox.html';

        if (!this.studioPreviewFrame.src || !this.studioPreviewFrame.src.includes('widget_sandbox.html')) {
            this.studioPreviewFrame.onload = () => sendToSandbox();
            this.studioPreviewFrame.src = sandboxUrl;
        } else {
            sendToSandbox();
        }
    }

    escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    formatMarkdown(text) {
        if (!text) return '';
        let str = this.escapeHtml(text);
        str = str.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        str = str.replace(/\*(.*?)\*/g, '<em>$1</em>');
        str = str.replace(/`([^`]+)`/g, '<code>$1</code>');
        str = str.replace(/\n/g, '<br>');
        return str;
    }

    renderChatMessages() {
        if (!this.studioChatMessages || !this.currentApp) return;
        const msgs = this.currentApp.chatHistory || [];
        
        let html = '';
        for (let i = 0; i < msgs.length; i++) {
            const m = msgs[i];
            if (m.role === 'user') {
                const nextMsg = (i + 1 < msgs.length && msgs[i + 1].role === 'assistant') ? msgs[i + 1] : null;
                const assistantHtml = nextMsg ? this.formatMarkdown(nextMsg.text) : '';
                const assistantRaw = nextMsg ? nextMsg.text : '';
                
                html += `
                    <div class="nexus-entry" data-entry-type="qa" data-entry-index="${i}">
                        <div class="nexus-question-row">
                            <div class="nexus-chat-question" data-raw-text="${this.escapeHtml(m.text)}">
                                <div class="nexus-question-content">${this.escapeHtml(m.text).replace(/\n/g, '<br>')}</div>
                            </div>
                            <div class="nexus-actions nexus-question-actions-row">
                                <button type="button" class="nexus-answer-action-btn btn-undo" data-entry-index="${i}" title="Undo">
                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>
                                </button>
                                <button type="button" class="nexus-answer-action-btn btn-copy" data-text="${this.escapeHtml(m.text)}" title="Copy">
                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                </button>
                                <button type="button" class="nexus-answer-action-btn btn-edit" data-entry-index="${i}" title="Edit">
                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path><path d="m15 5 4 4"></path></svg>
                                </button>
                            </div>
                        </div>
                        ${nextMsg ? `
                            <div class="nexus-chat-answer" data-raw-text="${this.escapeHtml(assistantRaw)}">
                                <div class="nexus-chat-answer-content markdown-body">${assistantHtml}</div>
                                <div class="nexus-actions">
                                    <div class="nexus-actions-left" style="display: flex; align-items: center; gap: 6px;">
                                        <button type="button" class="nexus-answer-action-btn btn-regenerate" data-entry-index="${i}" data-prompt="${this.escapeHtml(m.text)}" title="Regenerate">
                                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"></path><path d="M21 3v5h-5"></path></svg>
                                        </button>
                                        <button type="button" class="nexus-answer-action-btn btn-copy" data-text="${this.escapeHtml(assistantRaw)}" title="Copy">
                                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ` : ''}
                    </div>
                `;
                if (nextMsg) i++;
            } else {
                html += `
                    <div class="nexus-entry" data-entry-type="assistant" data-entry-index="${i}">
                        <div class="nexus-chat-answer" data-raw-text="${this.escapeHtml(m.text)}">
                            <div class="nexus-chat-answer-content markdown-body">${this.formatMarkdown(m.text)}</div>
                            <div class="nexus-actions">
                                <div class="nexus-actions-left" style="display: flex; align-items: center; gap: 6px;">
                                    <button type="button" class="nexus-answer-action-btn btn-copy" data-text="${this.escapeHtml(m.text)}" title="Copy">
                                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }
        }

        this.studioChatMessages.innerHTML = html;
        this.studioChatMessages.scrollTop = this.studioChatMessages.scrollHeight;

        this.bindChatMessageActions();
    }

    enterQuestionEditMode(questionDiv, entryIndex) {
        if (!questionDiv || questionDiv.classList.contains('is-editing')) return;
        const row = questionDiv.closest('.nexus-question-row');
        const contentDiv = questionDiv.querySelector('.nexus-question-content') || questionDiv;
        const originalText = questionDiv.getAttribute('data-raw-text') || contentDiv.innerText || '';

        questionDiv.__originalRaw = originalText;
        questionDiv.classList.add('is-editing');
        if (row) row.classList.add('nexus-question-row-editing');

        contentDiv.contentEditable = 'plaintext-only';
        contentDiv.spellcheck = false;

        const toolbar = document.createElement('div');
        toolbar.className = 'nexus-edit-toolbar nexus-question-edit-toolbar';
        toolbar.contentEditable = 'false';
        toolbar.innerHTML = `
            <button type="button" class="nexus-edit-btn nexus-edit-cancel" title="Cancel">Cancel</button>
            <button type="button" class="nexus-edit-btn nexus-edit-save" title="Update">Update</button>
        `;
        toolbar.onmousedown = (e) => e.preventDefault();

        const saveBtn = toolbar.querySelector('.nexus-edit-save');
        const cancelBtn = toolbar.querySelector('.nexus-edit-cancel');

        const exitEdit = (save) => {
            if (!questionDiv.classList.contains('is-editing')) return;
            const newText = (contentDiv.innerText || contentDiv.textContent || '').trim();
            contentDiv.contentEditable = 'false';
            questionDiv.classList.remove('is-editing');
            if (row) row.classList.remove('nexus-question-row-editing');
            toolbar.remove();

            if (save && newText) {
                if (this.currentApp && Array.isArray(this.currentApp.chatHistory)) {
                    this.currentApp.chatHistory = this.currentApp.chatHistory.slice(0, entryIndex);
                    this.saveCurrentApp();
                }
                if (this.studioPromptInput) {
                    this.studioPromptInput.value = newText;
                    this.studioPromptInput.style.removeProperty('height');
                }
                this.handlePromptSubmit();
            } else {
                contentDiv.innerHTML = this.escapeHtml(originalText).replace(/\n/g, '<br>');
            }
        };

        cancelBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            exitEdit(false);
        };

        saveBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            exitEdit(true);
        };

        const keyHandler = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                exitEdit(false);
                contentDiv.removeEventListener('keydown', keyHandler);
            } else if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                exitEdit(true);
                contentDiv.removeEventListener('keydown', keyHandler);
            }
        };
        contentDiv.addEventListener('keydown', keyHandler);

        if (row) {
            row.appendChild(toolbar);
        } else {
            questionDiv.appendChild(toolbar);
        }

        contentDiv.focus();
        try {
            const range = document.createRange();
            const sel = window.getSelection();
            range.selectNodeContents(contentDiv);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
        } catch (e) {}
    }

    bindChatMessageActions() {
        if (!this.studioChatMessages) return;

        this.studioChatMessages.querySelectorAll('.btn-copy').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const text = btn.dataset.text || '';
                if (text) {
                    navigator.clipboard.writeText(text);
                    const origHTML = btn.innerHTML;
                    btn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
                    btn.title = 'Copied!';
                    setTimeout(() => {
                        btn.innerHTML = origHTML;
                        btn.title = 'Copy';
                    }, 1500);
                }
            });
        });

        this.studioChatMessages.querySelectorAll('.btn-undo').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const entryIndex = parseInt(btn.dataset.entryIndex, 10);
                if (!isNaN(entryIndex) && this.currentApp && Array.isArray(this.currentApp.chatHistory)) {
                    const undoneMsg = this.currentApp.chatHistory[entryIndex];
                    this.currentApp.chatHistory = this.currentApp.chatHistory.slice(0, entryIndex);
                    if (undoneMsg && undoneMsg.text && this.studioPromptInput) {
                        this.studioPromptInput.value = undoneMsg.text;
                        this.studioPromptInput.style.removeProperty('height');
                        this.resetSendButton();
                    }
                    this.saveCurrentApp();
                    this.renderChatMessages();
                }
            });
        });

        this.studioChatMessages.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const entryIndex = parseInt(btn.dataset.entryIndex, 10);
                const entry = btn.closest('.nexus-entry');
                const questionDiv = entry?.querySelector('.nexus-chat-question');
                if (questionDiv) {
                    this.enterQuestionEditMode(questionDiv, entryIndex);
                }
            });
        });

        this.studioChatMessages.querySelectorAll('.btn-regenerate').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const entryIndex = parseInt(btn.dataset.entryIndex, 10);
                const prompt = btn.dataset.prompt || '';
                if (!isNaN(entryIndex) && this.currentApp && Array.isArray(this.currentApp.chatHistory)) {
                    this.currentApp.chatHistory = this.currentApp.chatHistory.slice(0, entryIndex);
                    this.saveCurrentApp();
                }
                if (prompt && this.studioPromptInput) {
                    this.studioPromptInput.value = prompt;
                    this.studioPromptInput.style.removeProperty('height');
                    this.handlePromptSubmit();
                }
            });
        });
    }

    addChatMessage(role, text) {
        if (!this.currentApp) return;
        if (!Array.isArray(this.currentApp.chatHistory)) {
            this.currentApp.chatHistory = [];
        }
        this.currentApp.chatHistory.push({
            role,
            text,
            timestamp: Date.now()
        });
        this.renderChatMessages();
        this.saveCurrentApp();
    }

    async handlePromptSubmit() {
        if (this.isGenerating || !this.studioPromptInput || !this.currentApp) return;
        const prompt = this.studioPromptInput.value.trim();
        if (!prompt) return;

        this.studioPromptInput.value = '';
        this.studioPromptInput.style.removeProperty('height');
        if (this.studioSendBtn) this.studioSendBtn.disabled = true;

        if (!Array.isArray(this.currentApp.chatHistory)) {
            this.currentApp.chatHistory = [];
        }
        const userEntryIndex = this.currentApp.chatHistory.length;
        this.currentApp.chatHistory.push({
            role: 'user',
            text: prompt,
            timestamp: Date.now()
        });

        this.isGenerating = true;

        const entryDiv = document.createElement('div');
        entryDiv.className = 'nexus-entry';
        entryDiv.dataset.entryType = 'qa';
        entryDiv.dataset.entryIndex = String(userEntryIndex);
        entryDiv.innerHTML = `
            <div class="nexus-question-row">
                <div class="nexus-chat-question" data-raw-text="${this.escapeHtml(prompt)}">
                    <div class="nexus-question-content">${this.escapeHtml(prompt).replace(/\n/g, '<br>')}</div>
                </div>
                <div class="nexus-actions nexus-question-actions-row">
                    <button type="button" class="nexus-answer-action-btn btn-undo" data-entry-index="${userEntryIndex}" title="Undo">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>
                    </button>
                    <button type="button" class="nexus-answer-action-btn btn-copy" data-text="${this.escapeHtml(prompt)}" title="Copy">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                    </button>
                    <button type="button" class="nexus-answer-action-btn btn-edit" data-entry-index="${userEntryIndex}" title="Edit">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path><path d="m15 5 4 4"></path></svg>
                    </button>
                </div>
            </div>
            <div class="nexus-chat-answer">
                <div class="nexus-chat-answer-content markdown-body">
                    <span class="apps-typing-indicator" style="display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: var(--nexus-text-secondary);">
                        <svg class="nexus-spin" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line></svg>
                        Thinking...
                    </span>
                </div>
            </div>
        `;
        this.studioChatMessages.appendChild(entryDiv);
        this.studioChatMessages.scrollTop = this.studioChatMessages.scrollHeight;
        this.bindChatMessageActions();

        const currentCode = this.currentApp.code || '';
        const recentHistory = this.currentApp.chatHistory
            .slice(-8)
            .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`)
            .join('\n\n');

        const userPrompt = `Current App Code:\n\`\`\`html\n${currentCode}\n\`\`\`\n\nRecent Conversation History:\n${recentHistory}\n\nUser Message:\n${prompt}`;

        let fullStreamedText = '';
        const sessionId = 'app_stream_' + Date.now();
        const answerContentDiv = entryDiv.querySelector('.nexus-chat-answer-content');

        try {
            const port = chrome.runtime.connect({ name: 'nexus-chat-stream' });
            this.currentStreamPort = port;

            port.onMessage.addListener((msg) => {
                if (msg.error) {
                    console.error('[AppsStudio Stream Error]', msg.error);
                    if (answerContentDiv) answerContentDiv.innerHTML = `⚠️ Error: ${msg.error}`;
                    this.isGenerating = false;
                    this.resetSendButton();
                    return;
                }

                if (msg.action === 'chunk' && msg.chunk) {
                    fullStreamedText += msg.chunk;
                    if (answerContentDiv) {
                        let previewExplanation = fullStreamedText;
                        if (previewExplanation.includes('<GenerateApp')) previewExplanation = previewExplanation.split('<GenerateApp')[0];
                        if (previewExplanation.includes('<GenerateWidget')) previewExplanation = previewExplanation.split('<GenerateWidget')[0];
                        if (previewExplanation.includes('<PatchApp')) previewExplanation = previewExplanation.split('<PatchApp')[0];
                        if (previewExplanation.includes('<PatchWidget')) previewExplanation = previewExplanation.split('<PatchWidget')[0];
                        if (previewExplanation.includes('```')) previewExplanation = previewExplanation.split('```')[0];
                        previewExplanation = previewExplanation.trim();

                        answerContentDiv.innerHTML = previewExplanation ? this.formatMarkdown(previewExplanation) : '<span style="color: var(--nexus-text-secondary); font-size: 13px;">⚡ Applying smart patch...</span>';
                        this.studioChatMessages.scrollTop = this.studioChatMessages.scrollHeight;
                    }
                }

                if (msg.action === 'done') {
                    this.isGenerating = false;
                    this.resetSendButton();

                    const currentCode = this.currentApp.code || '';
                    const cleanCode = WidgetRunner.extractWidgetCode(fullStreamedText, currentCode);

                    if (cleanCode && cleanCode.length > 20 && cleanCode !== currentCode) {
                        this.currentApp.code = cleanCode;
                        if (this.studioCodeEditor) {
                            this.studioCodeEditor.value = cleanCode;
                        }
                        this.saveCurrentApp();
                        this.refreshStudioPreview();
                    }

                    let rawExplanation = fullStreamedText;
                    if (rawExplanation.includes('<GenerateApp')) rawExplanation = rawExplanation.split('<GenerateApp')[0];
                    if (rawExplanation.includes('<GenerateWidget')) rawExplanation = rawExplanation.split('<GenerateWidget')[0];
                    if (rawExplanation.includes('<PatchApp')) rawExplanation = rawExplanation.split('<PatchApp')[0];
                    if (rawExplanation.includes('<PatchWidget')) rawExplanation = rawExplanation.split('<PatchWidget')[0];
                    if (rawExplanation.includes('```')) rawExplanation = rawExplanation.split('```')[0];
                    rawExplanation = rawExplanation.trim();

                    const isCodeGenerated = !!(cleanCode && cleanCode !== currentCode) || fullStreamedText.includes('<GenerateApp') || fullStreamedText.includes('<GenerateWidget') || fullStreamedText.includes('<PatchApp') || fullStreamedText.includes('<PatchWidget') || fullStreamedText.includes('<<<<<<< SEARCH');
                    const finalExplanation = rawExplanation || (isCodeGenerated ? (fullStreamedText.includes('<PatchApp') || fullStreamedText.includes('<<<<<<< SEARCH') ? '⚡ Applied targeted patch successfully!' : '✅ App updated successfully!') : fullStreamedText);
                    this.currentApp.chatHistory.push({
                        role: 'assistant',
                        text: finalExplanation,
                        timestamp: Date.now()
                    });
                    this.renderChatMessages();

                    requestAnimationFrame(() => {
                        if (this.studioPromptInput && !this.isPlayerMode) {
                            this.studioPromptInput.focus();
                        }
                    });
                }
            });

            port.postMessage({
                action: 'chat_stream',
                sessionId: sessionId,
                question: userPrompt,
                systemOverride: APP_BUILDER_SYSTEM_PROMPT,
                model: this.selectedModel?.model,
                providerId: this.selectedModel?.providerId
            });

        } catch (e) {
            console.error('[AppsStudio Error]', e);
            if (answerContentDiv) answerContentDiv.innerHTML = `⚠️ Failed to connect to AI streaming service.`;
            this.isGenerating = false;
            this.resetSendButton();
        }
    }

    resetSendButton() {
        if (this.studioSendBtn && this.studioPromptInput) {
            this.studioSendBtn.disabled = !this.studioPromptInput.value.trim();
        }
    }

    saveCurrentApp(notify = false) {
        if (!this.currentApp) return;
        this.currentApp.updatedAt = Date.now();
        this.customApps[this.currentApp.id] = this.currentApp;
        this.saveCustomApps();
        if (notify && this.studioSaveBtn) {
            const originalText = this.studioSaveBtn.innerHTML;
            this.studioSaveBtn.innerHTML = 'Saved ✓';
            setTimeout(() => {
                this.studioSaveBtn.innerHTML = originalText;
            }, 1200);
        }
    }

    exportAppHtml() {
        if (!this.currentApp) return;
        const cleanCode = WidgetRunner.extractWidgetCode(this.currentApp.code || '');
        const fullHtml = WidgetRunner.buildSandboxedHtml(cleanCode, false);
        const blob = new Blob([fullHtml], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${(this.currentApp.name || 'nexus_app').toLowerCase().replace(/\s+/g, '_')}.html`;
        a.click();
        URL.revokeObjectURL(url);
    }

    deleteCurrentApp() {
        if (!this.currentApp) return;
        const confirmed = confirm(`Are you sure you want to delete "${this.currentApp.name}"?`);
        if (confirmed) {
            delete this.customApps[this.currentApp.id];
            this.saveCustomApps();
            this.showHubView();
        }
    }
}

if (typeof window !== 'undefined') {
    window.AppsPanel = AppsPanel;
}
