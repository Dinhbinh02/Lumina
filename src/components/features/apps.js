import { widgetRegistry } from '../widgets/widget_registry.js';
import { WidgetRunner } from '../widgets/widget_runner.js';
import { NexusMenu, NexusChatInput, NexusModal } from '../ui/index.js';
import { NexusModelHelper } from '../cores/model_helper.js';
import { NexusChatUI } from '../cores/chat_ui.js';
import { NexusCodeEditor } from '../ui/nexus_code_editor.js';
import { NexusAppsCheckpointDB } from '../../db/apps_checkpoint_db.js';

export const APPS_STORAGE_KEY = 'nexus_custom_apps';

function getAppColor(name) {
    const colors = [
        '#64748b', '#ef4444', '#f97316', '#f59e0b', '#10b981', 
        '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', 
        '#d946ef', '#f43f5e', '#14b8a6', '#84cc16'
    ];
    let hash = 0;
    for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
}

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

const APP_BUILDER_SYSTEM_PROMPT = `You are Nexus Engine, a principal software engineer and UI architect inside Nexus App Studio. You design, build, and refine self-contained, production-grade, single-file interactive web applications.

# 1. CORE FRONTEND & DESIGN INSTRUCTIONS (ANTI-SLOP & SOLID UI)
You follow rigorous engineering and modern UI design principles:

### Build the Real Experience (No Boilerplate / No Forced Shells)
- **First-Screen Utility**: Build the actual usable experience as the first screen, NOT a landing page, marketing layout, or decorative shell.
- **NO Rigid Headers or Footers**: Do not force artificial top bars (such as status dots, "LIVE" tags, uppercase subtitle breadcrumbs, or decorative icons) or forced footer bars unless the app's specific feature requires it.
- **NO Card-in-Card**: Do not put UI cards inside other cards. Do not style page sections as floating cards. Only use cards for individual repeated items or genuinely framed tools. Page sections must be clean unframed layouts with constrained inner content.
- **No Visible Meta Text**: Do not use visible in-app text to narrate features, functionality, styling, or how to use the app. Let the UI speak for itself.

### Anti-AI Slop & Palette Rules
- **NO Purple / Purple-Blue Gradients**: Avoid dominant purple, violet, or lavender as default accents. Scan CSS colors and revise if the page reads as a generic AI theme.
- **NO Decorative Gradients or Orbs**: Never add discrete orbs, gradient orbs, bokeh blobs, rainbow borders, or multi-color linear gradients as decoration or backgrounds.
- **NO Heavy Glowing Shadows**: Do not use heavy blurry box-shadows (\`box-shadow: 0 10px 30px rgba(...)\`), neon glow filters, or faux glassmorphism.
- **Pure Solid Surfaces**:
  * Backgrounds: clean solid dark (\`#0a0a0c\`, \`#111114\`, or \`#18181b\`) paired with crisp 1px solid borders (\`1px solid rgba(255, 255, 255, 0.1)\` or solid \`#26262a\`).
  * Sub-elements & Inputs: solid \`#1c1c20\` or \`#222226\` with crisp 1px borders.
  * Interactive States: Hover and active states use solid background shifts (e.g., hover to \`rgba(255, 255, 255, 0.12)\` or \`#27272a\`), NOT shadow glow expansions or layout shifts.
  * Text Contrast: Primary text \`#ffffff\`, Secondary \`rgba(255, 255, 255, 0.7)\`, Muted \`rgba(255, 255, 255, 0.45)\`.

### Solid Layout & Responsive Constraints
- **Stable Dimensions & Max Constraints**: Define stable dimensions with responsive constraints (\`max-width: 520px; width: 100%; margin: 0 auto;\` for tools/cards, or responsive grid tracks) so hover states, labels, or dynamic content cannot resize or shift the layout.
- **Responsive & Box-Sizing**: Always use \`box-sizing: border-box; margin: 0; padding: 0;\`. Ensure elements shrink and adapt gracefully down to mobile screens (320px) using flexbox, grid, and relative units.
- **Typography & Numerical Stability**: Use clean sans-serif (\`'Inter', -apple-system, BlinkMacSystemFont, sans-serif\`) and monospace for code/data. Letter spacing must be 0 or slightly positive, never negative. All numbers, timers, rates, and values MUST use \`font-variant-numeric: tabular-nums;\` to prevent layout jittering during state changes.

# 2. CODE QUALITY & ENGINEERING JUDGMENT
- **Self-Contained & Vanilla**: Output complete, runnable HTML5, modern CSS3, and Vanilla JS (ES6+).
- **Zero Narrative Comments**: Do NOT write comments that narrate the obvious. Write clean, self-documenting code with meaningful function and variable names.
- **Robustness**: Implement complete event listeners, error handling, defensive fallbacks, and clean state management.

# 3. NEXUS RUNTIME SDK CAPABILITIES (window.NexusApp)
The sandbox environment automatically provides \`window.NexusApp\` with enterprise capabilities:
- **AI Engine**:
  * \`await NexusApp.ai.generate({ prompt, systemPrompt, model, temperature })\` -> Generate text.
  * \`NexusApp.ai.stream({ prompt, systemPrompt, model, onChunk, onDone, onError })\` -> Stream tokens realtime.
  * \`await NexusApp.ai.generateJson({ prompt, schema, systemPrompt })\` -> Generate structured JSON matching schema.
  * \`await NexusApp.ai.translate(text, targetLang)\` & \`await NexusApp.ai.summarize(text, maxWords)\` -> Quick helpers.
- **Persistent Storage**:
  * \`localStorage\` or \`NexusApp.storage.get(key)\` / \`NexusApp.storage.set(key, val)\` -> Automatically persists data across reloads.
- **Browser Context**:
  * \`await NexusApp.browser.getSelectedText()\` -> Get highlighted text on current webpage.
  * \`await NexusApp.browser.getPageContent()\` -> Read active page title and text.
  * \`NexusApp.browser.openTab(url)\` -> Open link in new tab.
- **Media & Speech**:
  * \`NexusApp.speak(text, lang, rate)\` (or standard \`speechSynthesis.speak\`) -> Multi-language TTS audio.
- **Network & Files**:
  * \`await NexusApp.fetch(url, options)\` -> Cross-origin fetch without CORS issues.
  * \`NexusApp.download(filename, data, mimeType)\` -> Export CSV, JSON, PNG, or text files.
- **UI & Helpers**:
  * \`NexusApp.toast(message, 'success' | 'error' | 'info')\` -> Glassmorphic floating toast notification.
  * \`NexusApp.copy(text)\` -> Copy text to clipboard safely.
  * \`NexusApp.setupCanvas(canvas)\` -> Auto-scale Canvas 2D for sharp Retina displays.
  * \`NexusApp.confetti()\` -> Trigger celebratory confetti animation.

# 4. DUAL PROTOCOL FOR CODE GENERATION

### PROTOCOL A: NEW APPS / COMPLETE REWRITE (<GenerateApp>)
When building a new app or when a complete rewrite is requested, output the entire runnable document wrapped in <GenerateApp>:

<GenerateApp title="App Name">
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    /* Clean, solid, anti-slop CSS adhering to modern UI principles */
  </style>
</head>
<body>
  <!-- Clean semantic DOM -->
  <script>
    // Robust, interactive logic
  </script>
</body>
</html>
</GenerateApp>

### PROTOCOL B: TARGETED EDITING / REFACTORING (<PatchApp>)
When editing, enhancing, or debugging an existing app, NEVER rewrite the entire file. Output precise SEARCH / REPLACE blocks wrapped in <PatchApp>:

<PatchApp>
<<<<<<< SEARCH
[Exact existing lines to match]
=======
[New replacement lines]
>>>>>>> REPLACE
</PatchApp>

- Match exact whitespace and context lines (1-3 lines of context if needed for uniqueness).
- Keep patches minimal, fast, and targeted.`;

export class AppsPanel {
    constructor() {
        this.container = null;
        this.activeFilter = 'all';
        this.searchTerm = '';
        this.currentApp = null;
        this.customApps = {};
        this.checkpoints = {};
        this.activeStudioTab = 'preview'; // 'preview' | 'code'
        this.isGenerating = false;
        this.currentStreamPort = null;
        this.isInitialized = false;
        this.selectedModel = null;
        this.fileInputEl = null;
        this.speechRecognition = null;
        this.isRecording = false;
        this.isPlayerMode = false;
        this.floatingDiffBar = null;
    }

    async init(targetAppId, mode) {
        this.cacheElements();
        if (!this.isInitialized) {
            this.bindEvents();
            this.isInitialized = true;
        }

        await this.loadCustomApps();

        if (targetAppId) {
            this.showStudioView();
            const foundCustom = this.customApps[targetAppId];
            const foundBuiltin = BUILTIN_APPS_CATALOG.find(b => b.id === targetAppId);
            if (foundCustom) {
                if (mode === 'studio' || mode === 'edit') {
                    await this.openAppStudio(foundCustom);
                } else {
                    await this.launchApp(foundCustom);
                }
            } else if (foundBuiltin) {
                if (mode === 'remix' || mode === 'studio' || mode === 'edit') {
                    await this.remixBuiltinApp(foundBuiltin);
                } else {
                    await this.launchBuiltinApp(foundBuiltin);
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
        this.studioExportBtn = document.getElementById('apps-studio-export-btn');
        this.studioDeleteBtn = document.getElementById('apps-studio-delete-btn');
        this.studioPreviewFrame = document.getElementById('apps-studio-preview-iframe');
        this.studioCodeEditorContainer = document.getElementById('apps-code-editor-container');
        this.studioCodeCopyBtn = document.getElementById('apps-code-copy-btn');
        this.studioTabPreview = document.getElementById('apps-tab-preview');
        this.studioTabCode = document.getElementById('apps-tab-code');
        this.studioPreviewPane = document.getElementById('apps-preview-pane');
        this.nativeWidgetHost = document.getElementById('apps-native-widget-host');
        this.studioCodePane = document.getElementById('apps-code-pane');

        this.studioCodeDiffContainer = document.getElementById('apps-code-diff-container');
        this.studioCodeHeaderTabs = document.getElementById('apps-code-header-tabs');
        this.codeViewMode = 'code';

        if (this.studioCodeEditorContainer && !this.codeEditor) {
            this.codeEditor = new NexusCodeEditor(this.studioCodeEditorContainer, {
                initialCode: this.currentApp?.code || '',
                language: 'html',
                onChange: (newCode) => {
                    if (this.currentApp) {
                        this.currentApp.code = newCode;
                        this.debouncedSaveAndRefresh();
                    }
                }
            });
        }

        this.appsStudioLeftPane = document.getElementById('apps-studio-left-pane') || document.querySelector('.apps-studio-left-pane');
        if (this.appsStudioLeftPane && !this.chatUI) {
            this.chatUI = NexusChatUI.mount(this.appsStudioLeftPane, {
                mode: 'apps_studio',
                placeholder: 'Ask AI to modify, design, or add features...',
                features: {
                    fileUpload: true,
                    modelSelector: true,
                    voiceInput: true
                },
                onSubmit: (prompt, files, options) => {
                    this.handlePromptSubmit(prompt, files, options);
                }
            });
        }

        this.studioPromptInput = this.chatUI?.inputEl || null;
        this.studioSendBtn = this.chatUI?.container?.querySelector('.nexus-action-btn.send') || null;
        this.studioChatMessages = this.chatUI?.historyEl || null;
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

        if (this.studioCodeCopyBtn) {
            this.studioCodeCopyBtn.addEventListener('click', () => {
                const code = this.codeEditor?.getValue() || this.currentApp?.code || '';
                if (!code) return;
                navigator.clipboard.writeText(code);
                const originalHtml = this.studioCodeCopyBtn.innerHTML;
                this.studioCodeCopyBtn.innerHTML = `
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#50fa7b" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                `;
                setTimeout(() => {
                    if (this.studioCodeCopyBtn) this.studioCodeCopyBtn.innerHTML = originalHtml;
                }, 1800);
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

        // Global keyboard shortcut for accepting/rejecting diffs: ⌘+Enter / ⌘+Backspace
        document.addEventListener('keydown', (e) => {
            if (!this.currentApp || this.isPlayerMode) return;
            const pendingCps = Object.values(this.checkpoints).filter(c => c && c.appId === this.currentApp.id && c.status === 'pending');
            if (pendingCps.length === 0) return;
            const latestPending = pendingCps[pendingCps.length - 1];

            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                this.acceptCheckpoint(latestPending.entryIndex);
            } else if ((e.metaKey || e.ctrlKey) && e.key === 'Backspace') {
                e.preventDefault();
                this.rejectCheckpoint(latestPending.entryIndex);
            }
        });

        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
            chrome.storage.onChanged.addListener((changes, area) => {
                if (area === 'local' && changes[APPS_STORAGE_KEY]) {
                    this.customApps = changes[APPS_STORAGE_KEY].newValue || {};
                    this.renderCatalog();
                    if (this.currentApp && this.customApps[this.currentApp.id]) {
                        const updated = this.customApps[this.currentApp.id];
                        this.currentApp = updated;
                        if (this.studioTitleInput) this.studioTitleInput.value = updated.name || 'Untitled App';
                        this.updateCodeView(updated.code || '');
                        this.renderChatMessages();
                        this.refreshStudioPreview();
                    }
                }
            });
        }

        window.addEventListener('message', (event) => {
            if (event.data && event.data.type === 'NEXUS_WIDGET_ERROR') {
                this.lastSandboxError = event.data;
                if (this.onSandboxErrorCallback) {
                    this.onSandboxErrorCallback(event.data);
                }
            } else if (event.data && event.data.type === 'NEXUS_APP_PROMPT' && event.data.prompt) {
                if (this.studioPromptInput && !this.isGenerating) {
                    this.studioPromptInput.value = event.data.prompt;
                    this.resetSendButton();
                    this.handlePromptSubmit();
                }
            }
        });
    }

    async loadCheckpoints(appId) {
        if (!appId) {
            this.checkpoints = {};
            return;
        }
        try {
            const list = await NexusAppsCheckpointDB.getCheckpointsByApp(appId);
            this.checkpoints = {};
            if (Array.isArray(list)) {
                list.forEach(cp => {
                    if (cp && cp.id) {
                        this.checkpoints[cp.id] = cp;
                    }
                });
            }
        } catch (e) {
            console.error('[AppsPanel] Failed to load checkpoints:', e);
            this.checkpoints = {};
        }
    }

    async loadCustomApps() {
        try {
            const res = await chrome.storage.local.get([APPS_STORAGE_KEY]);
            this.customApps = res[APPS_STORAGE_KEY] || {};
            this.syncTitleCache();
        } catch (e) {
            this.customApps = {};
        }
    }

    async saveCustomApps() {
        try {
            await chrome.storage.local.set({ [APPS_STORAGE_KEY]: this.customApps });
            this.syncTitleCache();
            if (typeof NexusSync !== 'undefined' && typeof NexusSync.triggerDebouncedSync === 'function') {
                NexusSync.triggerDebouncedSync();
            }
        } catch (e) {
            console.error('[AppsPanel] Failed to save custom apps:', e);
        }
    }

    syncTitleCache() {
        try {
            const cache = {};
            if (this.customApps) {
                Object.values(this.customApps).forEach(app => {
                    if (app && app.id && app.name) {
                        cache[app.id] = app.name;
                    }
                });
            }
            BUILTIN_APPS_CATALOG.forEach(app => {
                if (app && app.id && app.name) {
                    cache[app.id] = app.name;
                }
            });
            localStorage.setItem('nexus_apps_titles_cache', JSON.stringify(cache));
        } catch (e) {}
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
            chatHistory: [],
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
            chatHistory: [],
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

    async launchApp(app) {
        this.currentApp = app;
        this.showStudioView();
        this.setPlayerMode(true);

        if (this.studioTitleInput) {
            this.studioTitleInput.value = app.name || 'Untitled App';
            this.studioTitleInput.readOnly = !!app.isBuiltin;
        }

        await this.loadCheckpoints(app.id);
        this.updateCodeView(app.code || '');
        this.renderCodeDiffView();
        this.updateFloatingDiffBar();

        this.renderChatMessages();
        this.switchStudioTab('preview');
        this.refreshStudioPreview();

        if (typeof window.NexusViewManager !== 'undefined') {
            window.NexusViewManager.updateUrl('apps', { appId: app.id, mode: 'player' });
        }
    }

    async openAppStudio(app) {
        this.currentApp = app;
        this.showStudioView();
        this.setPlayerMode(false);

        if (this.studioTitleInput) {
            this.studioTitleInput.value = app.name || 'Untitled App';
            this.studioTitleInput.readOnly = false;
        }

        await this.loadCheckpoints(app.id);
        this.updateCodeView(app.code || '');
        this.renderCodeDiffView();
        this.updateFloatingDiffBar();

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
        if (this.appsStudioModeToggleBtn) {
            this.appsStudioModeToggleBtn.title = isPlayer ? 'Open AI Editor' : 'Switch to Play Mode';
            const iconSvg = this.appsStudioModeToggleBtn.querySelector('svg');
            if (iconSvg) {
                if (isPlayer) {
                    iconSvg.innerHTML = `<path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>`;
                } else {
                    iconSvg.innerHTML = `<polygon points="5 3 19 12 5 21 5 3"></polygon>`;
                }
            }
        }
        if (this.appsStudioModeLabel) {
            this.appsStudioModeLabel.textContent = isPlayer ? 'Edit' : 'Play';
        }
        if (!isPlayer) {
            requestAnimationFrame(() => {
                this.renderChatMessages();
                if (this.studioPromptInput) {
                    this.studioPromptInput.focus();
                }
            });
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
            this.updateCodeView(this.currentApp?.code || '');
            this.renderCodeDiffView();
            this.updateFloatingDiffBar();
            if (this.codeViewMode === 'code') {
                setTimeout(() => this.codeEditor?.focus(), 50);
            }
        }
    }

    debouncedSaveAndRefresh() {
        if (this._saveRefreshTimer) clearTimeout(this._saveRefreshTimer);
        this._saveRefreshTimer = setTimeout(() => {
            this.saveCurrentApp();
            this.refreshStudioPreview();
        }, 350);
    }

    updateCodeView(code) {
        const cleanCode = (code !== undefined && code !== null) ? code : (this.currentApp?.code || '');
        if (this.codeEditor) {
            this.codeEditor.setValue(cleanCode);
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
        const fontSize = getComputedStyle(document.documentElement).getPropertyValue('--nexus-fontSize') || '14px';
        const appId = this.currentApp.id || 'nexus_app_default';

        if (this.studioPreviewFrame) {
            this.studioPreviewFrame.setAttribute('data-widget-id', appId);
            this.studioPreviewFrame.setAttribute('data-widget-raw', encodeURIComponent(cleanCode));
        }

        const sendToSandbox = async () => {
            try {
                let storedData = {};
                if (typeof chrome !== 'undefined' && chrome.storage?.local) {
                    try {
                        const storageKey = `nexus_sandbox_${appId}`;
                        const res = await chrome.storage.local.get([storageKey]);
                        if (res[storageKey]) storedData = res[storageKey];
                    } catch (_) {}
                }

                this.studioPreviewFrame.contentWindow?.postMessage({
                    type: 'NEXUS_WIDGET_RENDER',
                    code: cleanCode,
                    isDark,
                    fontSize: fontSize.trim(),
                    appId: appId,
                    storedData: storedData
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
        let raw = String(text);

        // Completely strip <think>...</think> and <thought>...</thought>
        raw = raw.replace(/<(?:think|thought)>[\s\S]*?(?:<\/(?:think|thought)>|$)/gi, '').trim();

        // Clean out widget or block tags if any remain
        if (raw.includes('<GenerateApp')) raw = raw.split('<GenerateApp')[0];
        if (raw.includes('<GenerateWidget')) raw = raw.split('<GenerateWidget')[0];
        if (raw.includes('<PatchApp')) raw = raw.split('<PatchApp')[0];
        if (raw.includes('<PatchWidget')) raw = raw.split('<PatchWidget')[0];
        if (raw.includes('```')) raw = raw.split('```')[0];
        raw = raw.trim();

        if (!raw) return '';

        let parsedMain = '';
        if (typeof marked !== 'undefined' && typeof marked.parse === 'function') {
            parsedMain = marked.parse(raw);
        } else {
            let str = this.escapeHtml(raw);
            str = str.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            str = str.replace(/\*(.*?)\*/g, '<em>$1</em>');
            str = str.replace(/`([^`]+)`/g, '<code>$1</code>');
            str = str.replace(/\n/g, '<br>');
            parsedMain = str;
        }

        return parsedMain ? `<div class="apps-main-response">${parsedMain}</div>` : '';
    }

    stopGeneration() {
        if (this.currentStreamPort) {
            try { this.currentStreamPort.disconnect(); } catch (e) {}
            this.currentStreamPort = null;
        }
        this.isGenerating = false;
        if (this.chatUI) this.chatUI.hideStopButton();
        this.renderChatMessages();
    }

    renderCodeDiffView() {
        if (!this.studioCodeHeaderTabs || !this.currentApp) return;

        const pendingList = Object.values(this.checkpoints).filter(c => c && c.appId === this.currentApp.id && c.status === 'pending');
        const latestPending = pendingList.length > 0 ? pendingList[pendingList.length - 1] : null;

        if (!latestPending || !latestPending.diff || !latestPending.diff.hasChanges) {
            this.codeViewMode = 'code';
            this.studioCodeHeaderTabs.innerHTML = `
                <div class="apps-code-tab active" data-tab="code">
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="16 18 22 12 16 6"></polyline>
                        <polyline points="8 6 2 12 8 18"></polyline>
                    </svg>
                    <span class="apps-code-file-name">index.html</span>
                </div>
            `;
            if (this.studioCodeEditorContainer) this.studioCodeEditorContainer.style.display = 'flex';
            if (this.studioCodeDiffContainer) this.studioCodeDiffContainer.style.display = 'none';
        } else {
            this.codeViewMode = 'diff';
            this.studioCodeHeaderTabs.innerHTML = `
                <div class="apps-code-tab active" data-tab="code">
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="16 18 22 12 16 6"></polyline>
                        <polyline points="8 6 2 12 8 18"></polyline>
                    </svg>
                    <span class="apps-code-file-name">index.html</span>
                    <span class="apps-diff-stats" style="font-size: 11px; margin-left: 6px;">
                        <span class="apps-diff-stat-add">+${latestPending.diff.additions || 0}</span>
                        <span class="apps-diff-stat-del">-${latestPending.diff.deletions || 0}</span>
                    </span>
                </div>
            `;

            if (this.studioCodeDiffContainer) {
                this.studioCodeDiffContainer.innerHTML = this.renderDiffViewerHTML(latestPending.diff.lines, latestPending.beforeCode, latestPending.afterCode);
                this.studioCodeDiffContainer.style.display = 'block';
            }
            if (this.studioCodeEditorContainer) {
                this.studioCodeEditorContainer.style.display = 'none';
            }
        }

        const activeTabEl = this.studioCodeHeaderTabs.querySelector('.apps-code-tab');
        if (activeTabEl) {
            activeTabEl.title = 'Click to jump between modified code blocks';
            activeTabEl.addEventListener('click', (e) => {
                e.stopPropagation();
                this.jumpToNextDiffHunk();
            });
        }
    }

    getDiffHunks() {
        if (!this.studioCodeDiffContainer) return [];
        const lines = Array.from(this.studioCodeDiffContainer.querySelectorAll('.apps-diff-line'));
        const hunks = [];
        let inHunk = false;

        lines.forEach(line => {
            const isChanged = line.classList.contains('added') || line.classList.contains('removed');
            if (isChanged) {
                if (!inHunk) {
                    hunks.push(line);
                    inHunk = true;
                }
            } else {
                inHunk = false;
            }
        });
        return hunks;
    }

    jumpToNextDiffHunk() {
        const container = this.studioCodeDiffContainer;
        if (!container) return;

        const hunks = this.getDiffHunks();
        if (hunks.length === 0) {
            container.scrollTop = 0;
            if (this.studioCodeEditorContainer) this.studioCodeEditorContainer.scrollTop = 0;
            return;
        }

        const containerRect = container.getBoundingClientRect();
        const currentCenterY = container.scrollTop + (container.clientHeight / 2);

        // Find the first hunk that is positioned below the current viewport center
        let nextHunk = hunks.find(hunk => {
            const hunkTop = hunk.getBoundingClientRect().top - containerRect.top + container.scrollTop;
            return hunkTop > (currentCenterY + 15);
        });

        // If no hunk is below current scroll position (we reached the bottom), wrap around to the first hunk
        if (!nextHunk) {
            nextHunk = hunks[0];
        }

        if (nextHunk) {
            nextHunk.scrollIntoView({ behavior: 'auto', block: 'center' });
            nextHunk.classList.remove('apps-diff-hunk-focused');
            void nextHunk.offsetWidth;
            nextHunk.classList.add('apps-diff-hunk-focused');
            setTimeout(() => nextHunk.classList.remove('apps-diff-hunk-focused'), 700);
        }
    }

    scrollToDiffRegion(isNewApp = false) {
        requestAnimationFrame(() => {
            if (isNewApp) {
                if (this.studioCodeDiffContainer) this.studioCodeDiffContainer.scrollTop = 0;
                if (this.studioCodeEditorContainer) this.studioCodeEditorContainer.scrollTop = 0;
            } else {
                const hunks = this.getDiffHunks();
                if (hunks.length > 0) {
                    hunks[0].scrollIntoView({ behavior: 'auto', block: 'center' });
                }
            }
        });
    }

    renderDiffViewerHTML(lines, beforeCode = '', afterCode = '') {
        if (!Array.isArray(lines) || lines.length === 0) return '<div style="padding: 12px 16px; color: rgba(255,255,255,0.4);">No code changes</div>';

        const hljsObj = (typeof hljs !== 'undefined') ? hljs : (typeof window !== 'undefined' ? window.hljs : null);

        let beforeHighlighted = [];
        let afterHighlighted = [];
        if (hljsObj && typeof hljsObj.highlight === 'function') {
            try {
                if (beforeCode) {
                    beforeHighlighted = hljsObj.highlight(beforeCode, { language: 'xml', ignoreIllegals: true }).value.split('\n');
                }
                if (afterCode) {
                    afterHighlighted = hljsObj.highlight(afterCode, { language: 'xml', ignoreIllegals: true }).value.split('\n');
                }
            } catch (e) {
                console.warn('[AppsStudio] Batch syntax highlighting error:', e);
            }
        }

        const rowsHtml = lines.map(l => {
            const prefix = l.type === 'added' ? '+' : (l.type === 'removed' ? '-' : ' ');
            const num = l.newLine || l.oldLine || '';

            let codeHtml = '';
            if (l.type === 'added' && l.newLine && afterHighlighted[l.newLine - 1] !== undefined) {
                codeHtml = afterHighlighted[l.newLine - 1];
            } else if (l.type === 'removed' && l.oldLine && beforeHighlighted[l.oldLine - 1] !== undefined) {
                codeHtml = beforeHighlighted[l.oldLine - 1];
            } else if (l.type === 'unchanged') {
                if (l.newLine && afterHighlighted[l.newLine - 1] !== undefined) {
                    codeHtml = afterHighlighted[l.newLine - 1];
                } else if (l.oldLine && beforeHighlighted[l.oldLine - 1] !== undefined) {
                    codeHtml = beforeHighlighted[l.oldLine - 1];
                }
            }

            if (!codeHtml && l.content !== undefined) {
                if (hljsObj && typeof hljsObj.highlight === 'function') {
                    try {
                        codeHtml = hljsObj.highlight(l.content, { language: 'xml', ignoreIllegals: true }).value;
                    } catch (e2) {
                        codeHtml = this.escapeHtml(l.content);
                    }
                } else {
                    codeHtml = this.escapeHtml(l.content);
                }
            }

            return `<div class="apps-diff-line ${l.type}"><span class="apps-diff-line-num">${num}</span><span class="apps-diff-line-prefix">${prefix}</span><span class="apps-diff-line-content hljs">${codeHtml || '&nbsp;'}</span></div>`;
        }).join('');

        return `<div class="apps-diff-inner">${rowsHtml}</div>`;
    }

    async acceptCheckpoint(entryIndex) {
        if (!this.currentApp) return;
        const id = `${this.currentApp.id}_${entryIndex}`;
        const cp = this.checkpoints[id];
        if (!cp) return;
        cp.status = 'accepted';
        await NexusAppsCheckpointDB.updateStatus(id, 'accepted');
        this.codeViewMode = 'code';
        this.renderCodeDiffView();
        this.updateFloatingDiffBar();
    }

    async rejectCheckpoint(entryIndex) {
        if (!this.currentApp) return;
        const id = `${this.currentApp.id}_${entryIndex}`;
        const cp = this.checkpoints[id];
        if (!cp) return;
        cp.status = 'rejected';
        await NexusAppsCheckpointDB.updateStatus(id, 'rejected');
        if (typeof cp.beforeCode === 'string') {
            this.currentApp.code = cp.beforeCode;
            this.updateCodeView(cp.beforeCode);
            this.saveCurrentApp();
            this.refreshStudioPreview();
        }
        this.codeViewMode = 'code';
        this.renderCodeDiffView();
        this.updateFloatingDiffBar();
    }

    updateFloatingDiffBar() {
        if (!this.studioView || this.isPlayerMode || !this.currentApp) {
            if (this.floatingDiffBar) {
                this.floatingDiffBar.remove();
                this.floatingDiffBar = null;
            }
            return;
        }

        const pendingList = Object.values(this.checkpoints).filter(c => c && c.appId === this.currentApp.id && c.status === 'pending');
        if (pendingList.length === 0) {
            if (this.floatingDiffBar) {
                this.floatingDiffBar.remove();
                this.floatingDiffBar = null;
            }
            return;
        }

        const latestPending = pendingList[pendingList.length - 1];
        const mountPane = this.studioCodePane?.querySelector('.apps-code-card') || this.studioCodePane || this.appsStudioContainer || document.body;

        if (!this.floatingDiffBar) {
            this.floatingDiffBar = document.createElement('div');
            this.floatingDiffBar.className = 'apps-floating-diff-bar';
            mountPane.appendChild(this.floatingDiffBar);
        } else if (this.floatingDiffBar.parentElement !== mountPane) {
            mountPane.appendChild(this.floatingDiffBar);
        }

        this.floatingDiffBar.innerHTML = `
            <span style="font-size: 11.5px; font-weight: 600; color: #f59e0b; display: inline-flex; align-items: center; gap: 5px; margin-right: 4px;">
                <span class="apps-diff-stat-add">+${latestPending.diff?.additions || 0}</span>
                <span class="apps-diff-stat-del">-${latestPending.diff?.deletions || 0}</span>
            </span>
            <button type="button" class="apps-btn-accept floating-btn-accept" style="height: 28px; padding: 0 12px;">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                <span>Accept Changes</span>
            </button>
            <button type="button" class="apps-btn-reject floating-btn-reject" style="height: 28px; padding: 0 12px;">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                <span>Reject</span>
            </button>
        `;

        const accBtn = this.floatingDiffBar.querySelector('.floating-btn-accept');
        const rejBtn = this.floatingDiffBar.querySelector('.floating-btn-reject');
        if (accBtn) accBtn.onclick = () => this.acceptCheckpoint(latestPending.entryIndex);
        if (rejBtn) rejBtn.onclick = () => this.rejectCheckpoint(latestPending.entryIndex);
    }

    renderQuestionFilesHTML(files) {
        if (!Array.isArray(files) || files.length === 0) return '';
        const visibleFiles = files.filter(item => {
            if (typeof item === 'string') return true;
            if (!item || typeof item !== 'object') return false;
            return !item.hiddenInPreview && !item.parentAttachmentId;
        });
        if (visibleFiles.length === 0) return '';

        let html = '<div class="nexus-chat-question-files">';
        visibleFiles.forEach((item, index) => {
            const isString = typeof item === 'string';
            const isImage = isString ? true : (item.isImage || (item.mimeType && item.mimeType.startsWith('image/')) || (typeof item.dataUrl === 'string' && item.dataUrl.startsWith('data:image')));
            const rawSrc = isString ? item : (item.dataUrl || item.previewUrl || item.objectUrl || (item.mimeType && item.data ? `data:${item.mimeType};base64,${item.data}` : ''));
            if (isImage && rawSrc) {
                const alt = (!isString && item.name) ? item.name : `Image ${index + 1}`;
                html += `<img src="${this.escapeHtml(rawSrc)}" alt="${this.escapeHtml(alt)}" class="nexus-clickable-image" />`;
            } else if (!isString) {
                const fileName = item.name || 'File';
                const displayName = typeof NexusChatUI !== 'undefined' && NexusChatUI.getDisplayFileName ? NexusChatUI.getDisplayFileName(fileName) : fileName;
                const category = typeof NexusChatUI !== 'undefined' && NexusChatUI.inferFileCategory ? NexusChatUI.inferFileCategory(item) : 'file';
                const icon = typeof NexusChatUI !== 'undefined' && NexusChatUI.getFileIconByCategory ? NexusChatUI.getFileIconByCategory(category) : '';
                const typeLabel = typeof NexusChatUI !== 'undefined' && NexusChatUI.getFileTypeLabel ? NexusChatUI.getFileTypeLabel(item) : 'FILE';
                html += `<div class="nexus-preview-item is-file nexus-question-file-chip" title="${this.escapeHtml(fileName)}"><div class="nexus-file-preview-info"><span class="nexus-file-name">${this.escapeHtml(displayName)}</span><div class="nexus-file-meta-row"><span class="nexus-file-icon-inline file-${category}">${icon}</span><span class="nexus-file-size-tag">${this.escapeHtml(typeLabel)}</span></div></div></div>`;
            }
        });
        html += '</div>';
        return html;
    }

    renderChatMessages() {
        if (!this.studioChatMessages || !this.currentApp) return;
        const msgs = (this.currentApp.chatHistory || []).filter(m => 
            !(m.role === 'assistant' && (
                m.text.includes('👋 Hello! How can I help') || 
                m.text.includes('Loaded template for')
            ))
        );

        if (msgs.length === 0) {
            const isNewBlankApp = !this.currentApp.code || 
                this.currentApp.name === 'New Custom App' || 
                this.currentApp.name === 'Untitled App' ||
                this.currentApp.code.includes('My New App');

            const appName = this.currentApp.name || (isNewBlankApp ? 'New Custom App' : 'Untitled App');
            const appDesc = isNewBlankApp 
                ? 'Describe the web app, interactive tool, or mini game you want to build from scratch.'
                : (this.currentApp.description || 'Describe how you want to modify, customize, or redesign this app.');
            const color = getAppColor(appName);
            
            let avatarHTML = '';
            let bgStyle = '';
            if (this.currentApp.icon && this.currentApp.icon.includes('<svg')) {
                avatarHTML = this.currentApp.icon;
                bgStyle = `background: ${color}; color: #ffffff;`;
            } else if (this.currentApp.icon && typeof this.currentApp.icon === 'string' && (this.currentApp.icon.startsWith('http') || this.currentApp.icon.startsWith('data:'))) {
                avatarHTML = `<img src="${this.currentApp.icon}" style="width: 100%; height: 100%; object-fit: cover; border-radius: inherit;" />`;
                bgStyle = 'background: transparent;';
            } else {
                avatarHTML = `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"></rect><rect x="14" y="3" width="7" height="7" rx="1.5"></rect><rect x="14" y="14" width="7" height="7" rx="1.5"></rect><rect x="3" y="14" width="7" height="7" rx="1.5"></rect></svg>`;
                bgStyle = `background: ${color}; color: #ffffff;`;
            }

            const suggestions = isNewBlankApp ? [
                { icon: '🃏', title: 'Flashcards & interactive quiz app', prompt: 'Create an interactive flashcard study tool with flip cards, category filters, and quiz mode with score tracking.' },
                { icon: '📋', title: 'Kanban board with drag & drop', prompt: 'Create an interactive Kanban task board with custom columns (To Do, In Progress, Done), drag & drop cards, and tags.' },
                { icon: '🎯', title: 'Habit tracker & daily streak counter', prompt: 'Build a daily habit tracker with streak counters, weekly progress bars, completion checkboxes, and local storage.' },
                { icon: '🎮', title: 'Wordle-style mini puzzle game', prompt: 'Build an interactive Wordle-style word guessing game with on-screen keyboard, animations, and game statistics.' }
            ] : [
                { icon: '✨', title: 'Modern glassmorphism & animations', prompt: 'Redesign this app with a modern glassmorphism UI, smooth micro-interactions, and refined typography.' },
                { icon: '⚡', title: 'Keyboard shortcuts & audio feedback', prompt: 'Add keyboard shortcuts for all key actions and pleasant sound effects on user interaction.' },
                { icon: '🌓', title: 'Responsive layout & dark mode toggle', prompt: 'Make the layout fully responsive across all screen sizes and add a dark mode toggle.' }
            ];

            const suggestionsHTML = suggestions.map(s => `
                <button type="button" class="apps-suggestion-chip" data-prompt="${this.escapeHtml(s.prompt)}">
                    <span>${s.icon}</span> <span>${this.escapeHtml(s.title)}</span>
                </button>
            `).join('');

            this.studioChatMessages.innerHTML = `
                <div class="spark-welcome apps-studio-welcome">
                    <div class="spark-welcome__avatar" style="${bgStyle}">${avatarHTML}</div>
                    <h1 class="spark-welcome__title">${this.escapeHtml(appName)}</h1>
                    <p class="spark-welcome__description" style="color: var(--nexus-sidebar-text-muted); font-size: 0.96em; text-align: center; margin: -10px auto 25px auto; max-width: 480px; line-height: 1.45;">${this.escapeHtml(appDesc)}</p>
                    <div class="apps-prompt-suggestions">
                        ${suggestionsHTML}
                    </div>
                </div>
            `;
            this.studioChatMessages.querySelectorAll('.apps-suggestion-chip').forEach(chip => {
                chip.addEventListener('click', () => {
                    const prompt = chip.dataset.prompt;
                    if (prompt && this.studioPromptInput) {
                        this.studioPromptInput.value = prompt;
                        this.resetSendButton();
                        this.studioPromptInput.focus();
                    }
                });
            });
            this.updateFloatingDiffBar();
            return;
        }
        
        let html = '';
        for (let i = 0; i < msgs.length; i++) {
            const m = msgs[i];

            if (m.role === 'user') {
                const nextMsg = (i + 1 < msgs.length && msgs[i + 1].role === 'assistant') ? msgs[i + 1] : null;
                const assistantRaw = nextMsg ? nextMsg.text.replace(/<(?:think|thought)>[\s\S]*?(?:<\/(?:think|thought)>|$)/gi, '').trim() : 'App code updated according to requirements.';
                const assistantContent = nextMsg ? this.formatMarkdown(nextMsg.text) : '<span>App updated and verified.</span>';
                const filesHTML = this.renderQuestionFilesHTML(m.files);
                
                html += `
                    <div class="nexus-entry" data-entry-type="qa" data-entry-index="${i}">
                        <div class="nexus-question-row">
                            ${filesHTML}
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
                        <div class="nexus-chat-answer" data-raw-text="${this.escapeHtml(assistantRaw)}">
                            <div class="nexus-chat-answer-content markdown-body">
                                <div>${assistantContent}</div>
                            </div>
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
                    </div>
                `;
                if (nextMsg) i++;
            } else {
                const assistantRaw = m.text.replace(/<(?:think|thought)>[\s\S]*?(?:<\/(?:think|thought)>|$)/gi, '').trim();
                html += `
                    <div class="nexus-entry" data-entry-type="assistant" data-entry-index="${i}">
                        <div class="nexus-chat-answer" data-raw-text="${this.escapeHtml(assistantRaw)}">
                            <div class="nexus-chat-answer-content markdown-body">
                                <div>${this.formatMarkdown(m.text)}</div>
                            </div>
                            <div class="nexus-actions">
                                <div class="nexus-actions-left" style="display: flex; align-items: center; gap: 6px;">
                                    <button type="button" class="nexus-answer-action-btn btn-copy" data-text="${this.escapeHtml(assistantRaw)}" title="Copy">
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
        if (typeof NexusChatUI !== 'undefined' && typeof NexusChatUI.processContainer === 'function') {
            NexusChatUI.processContainer(this.studioChatMessages);
        }

        const entries = this.studioChatMessages.querySelectorAll('.nexus-entry');
        if (entries.length > 0) {
            const latestEntry = entries[entries.length - 1];
            if (this.chatUI) {
                this.chatUI.updateEntryMinHeight(latestEntry);
                this.chatUI.adjustEntryMargin(latestEntry, 'immediate');
                const targetScrollTop = NexusChatUI.calculateInitialScrollTarget(latestEntry, this.studioChatMessages);
                this.studioChatMessages.scrollTop = targetScrollTop;
            } else {
                this.studioChatMessages.scrollTop = this.studioChatMessages.scrollHeight;
            }
        } else {
            this.studioChatMessages.scrollTop = this.studioChatMessages.scrollHeight;
        }

        this.bindChatMessageActions();
        this.updateFloatingDiffBar();
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

    showConfirmUndoModal({ files = [] } = {}) {
        return NexusModal.confirm({
            title: 'Confirm Undo',
            description: 'Confirming this undo action will make the following changes:',
            files: files,
            confirmLabel: 'Confirm',
            cancelLabel: 'Cancel',
            isDanger: false,
            confirmIcon: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 10 4 15 9 20"></polyline><path d="M20 4v7a4 4 0 0 1-4 4H4"></path></svg>'
        });
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

        // Undo action with code rollback support and confirm modal
        this.studioChatMessages.querySelectorAll('.btn-undo').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const entryIndex = parseInt(btn.dataset.entryIndex, 10);
                if (!isNaN(entryIndex) && this.currentApp && Array.isArray(this.currentApp.chatHistory)) {
                    const undoneMsg = this.currentApp.chatHistory[entryIndex];

                    // Check if there is a checkpoint to roll back
                    const cpId = `${this.currentApp.id}_${entryIndex}`;
                    const cp = this.checkpoints[cpId];
                    let targetCode = this.currentApp.code || '';
                    if (cp && cp.status !== 'rejected' && typeof cp.beforeCode === 'string') {
                        targetCode = cp.beforeCode;
                    }

                    // Compute diff of the rollback (currentApp.code -> targetCode)
                    const rollbackDiff = NexusAppsCheckpointDB.computeLineDiff(this.currentApp.code || '', targetCode);

                    // Show Confirm Undo modal
                    const confirmed = await this.showConfirmUndoModal({
                        files: [
                            {
                                name: 'index.html',
                                additions: rollbackDiff.additions || 0,
                                deletions: rollbackDiff.deletions || 0
                            }
                        ]
                    });

                    if (!confirmed) return;

                    if (cp && cp.status !== 'rejected' && typeof cp.beforeCode === 'string') {
                        this.currentApp.code = cp.beforeCode;
                        this.updateCodeView(cp.beforeCode);
                        this.refreshStudioPreview();
                    }

                    // Delete checkpoints from this entry index onwards
                    await NexusAppsCheckpointDB.deleteCheckpointsFrom(this.currentApp.id, entryIndex);
                    Object.keys(this.checkpoints).forEach(k => {
                        const item = this.checkpoints[k];
                        if (item && item.appId === this.currentApp.id && item.entryIndex >= entryIndex) {
                            delete this.checkpoints[k];
                        }
                    });

                    this.currentApp.chatHistory = this.currentApp.chatHistory.slice(0, entryIndex);
                    if (undoneMsg && undoneMsg.text && this.studioPromptInput) {
                        this.studioPromptInput.value = undoneMsg.text;
                        this.studioPromptInput.style.removeProperty('height');
                        this.resetSendButton();
                    }
                    this.saveCurrentApp();
                    this.renderChatMessages();
                    this.renderCodeDiffView();
                    this.updateFloatingDiffBar();
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

        this.studioChatMessages.querySelectorAll('.nexus-clickable-image').forEach(img => {
            img.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.chatUI && typeof this.chatUI.showImagePreview === 'function') {
                    this.chatUI.showImagePreview(img.src, img.alt);
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

    async handlePromptSubmit(promptText = null, files = null, options = null) {
        if (this.isGenerating || !this.currentApp) return;
        const prompt = (promptText !== null && promptText !== undefined) 
            ? String(promptText).trim() 
            : (this.studioPromptInput ? this.studioPromptInput.value.trim() : '');
        if (!prompt) return;

        const attachedFiles = Array.isArray(files) 
            ? files 
            : (this.chatUI?.attachedFiles ? [...this.chatUI.attachedFiles] : []);

        if (this.studioPromptInput) {
            this.studioPromptInput.value = '';
            this.studioPromptInput.style.removeProperty('height');
        }
        if (this.chatUI && typeof this.chatUI.clearImages === 'function') {
            this.chatUI.clearImages();
        }

        if (!Array.isArray(this.currentApp.chatHistory)) {
            this.currentApp.chatHistory = [];
        }
        const userEntryIndex = this.currentApp.chatHistory.length;
        this.currentApp.chatHistory.push({
            role: 'user',
            text: prompt,
            files: attachedFiles.length > 0 ? attachedFiles : undefined,
            timestamp: Date.now()
        });

        this.isGenerating = true;
        if (this.chatUI) {
            this.chatUI.showStopButton(() => this.stopGeneration());
        }

        const beforeCode = this.currentApp.code || '';
        const isNewApp = !beforeCode || beforeCode.length < 60 || beforeCode.includes('My New App') || (this.currentApp.chatHistory.length <= 1);
        const filesHTML = this.renderQuestionFilesHTML(attachedFiles);

        const entryDiv = document.createElement('div');
        entryDiv.className = 'nexus-entry';
        entryDiv.dataset.entryType = 'qa';
        entryDiv.dataset.entryIndex = String(userEntryIndex);
        entryDiv.innerHTML = `
            <div class="nexus-question-row">
                ${filesHTML}
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
                <div class="nexus-answer-content markdown-body" style="text-align: left;">
                    <div class="apps-thinking-mount" style="width: 100%;">
                        <div class="nexus-thinking">
                            <div class="nexus-dots-loader"><span></span><span></span><span></span></div>
                            <span class="nexus-status-text">Thinking...</span>
                        </div>
                    </div>
                    <div class="apps-answer-body"></div>
                </div>
            </div>
        `;
        this.studioChatMessages.appendChild(entryDiv);
        if (this.chatUI) {
            this.chatUI.setInitialEntryHeight(entryDiv);
        } else {
            this.studioChatMessages.scrollTop = this.studioChatMessages.scrollHeight;
        }
        this.bindChatMessageActions();

        const thinkingMount = entryDiv.querySelector('.apps-thinking-mount');
        const answerBodyDiv = entryDiv.querySelector('.apps-answer-body');

        const executeStreamTurn = (systemPrompt, turnUserPrompt, stepLabel = 'Thinking...') => {
            return new Promise((resolve, reject) => {
                let streamedText = '';
                const sessionId = 'app_stream_' + Date.now();
                const startTime = Date.now();
                let thinkInterval = null;
                let currentThoughtText = '';

                const updateThinkingTime = (thoughtText = '') => {
                    if (!thinkingMount) return;
                    currentThoughtText = thoughtText;
                    const elapsedSec = Math.max(1, Math.round((Date.now() - startTime) / 1000));
                    const timeLabel = elapsedSec < 60 ? `${elapsedSec}s` : `${Math.floor(elapsedSec / 60)}m ${elapsedSec % 60}s`;
                    const renderedThought = thoughtText ? this.formatMarkdown(thoughtText) : '';

                    if (renderedThought) {
                        thinkingMount.innerHTML = `
                            <div class="nexus-thinking-container">
                                <div class="nexus-thinking-header">
                                    <span class="nexus-thinking-icon">
                                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>
                                    </span>
                                    <span class="nexus-thinking-title">${this.escapeHtml(stepLabel)} (${timeLabel})</span>
                                    <span class="nexus-thinking-chevron">
                                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>
                                    </span>
                                </div>
                                <div class="nexus-thinking-content markdown-body">${renderedThought}</div>
                            </div>
                        `;
                    } else {
                        thinkingMount.innerHTML = `
                            <div class="nexus-thinking">
                                <div class="nexus-dots-loader"><span></span><span></span><span></span></div>
                                <span class="nexus-status-text">${this.escapeHtml(stepLabel)} (${timeLabel})</span>
                            </div>
                        `;
                    }
                };

                thinkInterval = setInterval(() => {
                    updateThinkingTime(currentThoughtText);
                }, 1000);

                try {
                    const port = chrome.runtime.connect({ name: 'nexus-chat-stream' });
                    this.currentStreamPort = port;

                    port.onMessage.addListener((msg) => {
                        if (msg.error) {
                            if (thinkInterval) clearInterval(thinkInterval);
                            reject(new Error(msg.error));
                            return;
                        }
                        if (msg.action === 'chunk' && msg.chunk) {
                            streamedText += msg.chunk;

                            const lastThinkStart = streamedText.lastIndexOf('<think>');
                            const lastThinkEnd = streamedText.lastIndexOf('</think>');
                            const hasThink = lastThinkStart !== -1;
                            const isThinkingComplete = hasThink && (lastThinkEnd > lastThinkStart);

                            if (hasThink && !isThinkingComplete) {
                                const thoughtSoFar = streamedText.substring(lastThinkStart + 7).trim();
                                updateThinkingTime(thoughtSoFar);
                            } else {
                                if (thinkInterval) {
                                    clearInterval(thinkInterval);
                                    thinkInterval = null;
                                }
                                if (hasThink && isThinkingComplete) {
                                    const fullThought = streamedText.substring(lastThinkStart + 7, lastThinkEnd).trim();
                                    if (fullThought) {
                                        const elapsedSec = Math.max(1, Math.round((Date.now() - startTime) / 1000));
                                        const timeLabel = elapsedSec < 60 ? `${elapsedSec}s` : `${Math.floor(elapsedSec / 60)}m ${elapsedSec % 60}s`;
                                        thinkingMount.innerHTML = `
                                            <div class="nexus-thinking-container collapsed">
                                                <div class="nexus-thinking-header">
                                                    <span class="nexus-thinking-icon">
                                                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>
                                                    </span>
                                                    <span class="nexus-thinking-title">${this.escapeHtml(stepLabel)} (${timeLabel})</span>
                                                    <span class="nexus-thinking-chevron">
                                                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>
                                                    </span>
                                                </div>
                                                <div class="nexus-thinking-content markdown-body">${this.formatMarkdown(fullThought)}</div>
                                            </div>
                                        `;
                                    } else {
                                        thinkingMount.innerHTML = '';
                                    }
                                } else {
                                    if (thinkingMount) {
                                        thinkingMount.innerHTML = '';
                                    }
                                }
                                let preview = streamedText.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').trim();
                                if (answerBodyDiv) {
                                    answerBodyDiv.innerHTML = preview ? this.formatMarkdown(preview) : '';
                                }
                            }
                            if (this.chatUI) {
                                if (!this.chatUI.disableAutoScroll && this.chatUI._isNearBottom(28)) {
                                    this.studioChatMessages.scrollTop = this.studioChatMessages.scrollHeight;
                                }
                            } else {
                                const isNearBottom = (this.studioChatMessages.scrollHeight - this.studioChatMessages.scrollTop - this.studioChatMessages.clientHeight) < 30;
                                if (isNearBottom) {
                                    this.studioChatMessages.scrollTop = this.studioChatMessages.scrollHeight;
                                }
                            }
                        }
                        if (msg.action === 'done') {
                            if (thinkInterval) clearInterval(thinkInterval);
                            resolve(streamedText);
                        }
                    });

                    port.postMessage({
                        action: 'chat_stream',
                        sessionId: sessionId,
                        question: turnUserPrompt,
                        images: attachedFiles.filter(f => f && (f.isImage || typeof f === 'string' || (f.mimeType && f.mimeType.startsWith('image/')))),
                        systemOverride: systemPrompt,
                        model: this.selectedModel?.model,
                        providerId: this.selectedModel?.providerId
                    });
                } catch (e) {
                    if (thinkInterval) clearInterval(thinkInterval);
                    reject(e);
                }
            });
        };

        try {
            const currentCode = this.currentApp.code || '';
            const recentHistory = this.currentApp.chatHistory
                .slice(-8)
                .map(m => {
                    let cleanText = (m.text || '').replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').trim();
                    return `${m.role === 'user' ? 'User' : 'Assistant'}: ${cleanText}`;
                })
                .filter(m => m.trim().length > 0)
                .join('\n\n');

            const userPrompt = `Current App Code:\n\`\`\`html\n${currentCode}\n\`\`\`\n\nRecent Conversation History:\n${recentHistory}\n\nUser Message:\n${prompt}`;

            const fullStreamedText = await executeStreamTurn(APP_BUILDER_SYSTEM_PROMPT, userPrompt, 'Thinking & Generating App...');
            
            this.lastSandboxError = null;

            const cleanCode = WidgetRunner.extractWidgetCode(fullStreamedText, currentCode);
            if (cleanCode && cleanCode.length > 20 && cleanCode !== currentCode) {
                this.currentApp.code = cleanCode;
                this.updateCodeView(cleanCode);
                this.saveCurrentApp();
                this.refreshStudioPreview();
            }

            let rawExplanation = fullStreamedText.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').trim();
            if (rawExplanation.includes('<GenerateApp')) rawExplanation = rawExplanation.split('<GenerateApp')[0];
            if (rawExplanation.includes('<GenerateWidget')) rawExplanation = rawExplanation.split('<GenerateWidget')[0];
            if (rawExplanation.includes('<PatchApp')) rawExplanation = rawExplanation.split('<PatchApp')[0];
            if (rawExplanation.includes('<PatchWidget')) rawExplanation = rawExplanation.split('<PatchWidget')[0];
            if (rawExplanation.includes('```')) rawExplanation = rawExplanation.split('```')[0];
            rawExplanation = rawExplanation.trim();

            const isCodeGenerated = !!(cleanCode && cleanCode !== currentCode) || fullStreamedText.includes('<GenerateApp') || fullStreamedText.includes('<GenerateWidget') || fullStreamedText.includes('<PatchApp') || fullStreamedText.includes('<PatchWidget') || fullStreamedText.includes('<<<<<<< SEARCH');
            let finalExplanation = rawExplanation || (isCodeGenerated ? (isNewApp ? 'Application created and verified.' : 'Application updated and verified.') : fullStreamedText.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').trim());

            // Await 500ms to test runtime execution in sandbox
            await new Promise(r => setTimeout(r, 500));

            if (this.lastSandboxError) {
                const runtimeErr = this.lastSandboxError;
                console.warn('[AppsStudio] Sandbox error detected, initiating autonomous repair loop:', runtimeErr);
                
                const repairPrompt = `Current App Code:\n\`\`\`html\n${this.currentApp.code}\n\`\`\`\n\nA runtime error occurred in the sandbox execution:\nError: ${runtimeErr.message || 'Unknown error'}\n${runtimeErr.stack ? 'Stack: ' + runtimeErr.stack : ''}\n\nPlease fix this error and provide the updated complete or patched working HTML/JS/CSS code.`;

                try {
                    const healStreamed = await executeStreamTurn(
                        APP_BUILDER_SYSTEM_PROMPT, 
                        repairPrompt, 
                        `Auto-fixing runtime error: ${runtimeErr.message || 'Unknown error'}`
                    );
                    const healedCode = WidgetRunner.extractWidgetCode(healStreamed, this.currentApp.code);
                    if (healedCode && healedCode.length > 20) {
                        this.currentApp.code = healedCode;
                        this.updateCodeView(healedCode);
                        this.saveCurrentApp();
                        this.refreshStudioPreview();
                    }
                } catch (healErr) {
                    console.error('[AppsStudio Auto-heal error]', healErr);
                }
            }

            // Finished all execution: clear thinking mount completely
            if (thinkingMount) {
                thinkingMount.innerHTML = '';
            }

            const afterCode = this.currentApp.code || '';
            const lineDiff = NexusAppsCheckpointDB.computeLineDiff(beforeCode, afterCode);
            if (lineDiff.hasChanges) {
                const checkpoint = {
                    id: `${this.currentApp.id}_${userEntryIndex}`,
                    appId: this.currentApp.id,
                    entryIndex: userEntryIndex,
                    beforeCode: beforeCode,
                    afterCode: afterCode,
                    status: 'pending',
                    diff: lineDiff,
                    timestamp: Date.now()
                };
                this.checkpoints[checkpoint.id] = checkpoint;
                await NexusAppsCheckpointDB.putCheckpoint(checkpoint);
                this.switchStudioTab('code');
                this.renderCodeDiffView();
                this.updateFloatingDiffBar();
                this.scrollToDiffRegion(isNewApp);
            }

            this.currentApp.chatHistory.push({
                role: 'assistant',
                text: finalExplanation,
                timestamp: Date.now()
            });

            this.renderChatMessages();

        } catch (err) {
            console.error('[AppsStudio Error]', err);
            if (thinkingMount) {
                thinkingMount.innerHTML = '';
            }
            if (answerBodyDiv) {
                answerBodyDiv.innerHTML = `<span style="color: var(--nexus-danger, #ea4335);">Error: ${err.message || 'Failed to complete task'}</span>`;
            }
            this.currentApp.chatHistory.push({
                role: 'assistant',
                text: `Error: ${err.message || 'Failed to process request'}`,
                timestamp: Date.now()
            });
            this.renderChatMessages();
        } finally {
            this.isGenerating = false;
            if (this.chatUI) {
                this.chatUI.hideStopButton();
            }
            this.resetSendButton();
            requestAnimationFrame(() => {
                if (this.studioPromptInput && !this.isPlayerMode) {
                    this.studioPromptInput.focus();
                }
            });
        }
    }

    resetSendButton() {
        if (this.chatUI) {
            this.chatUI.hideStopButton();
        } else if (this.studioSendBtn && this.studioPromptInput) {
            this.studioSendBtn.disabled = !this.studioPromptInput.value.trim();
        }
    }

    saveCurrentApp(notify = false) {
        if (!this.currentApp) return;
        this.currentApp.updatedAt = Date.now();
        this.customApps[this.currentApp.id] = this.currentApp;
        this.saveCustomApps();
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
