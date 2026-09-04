# Lumina

A modular, privacy-first AI browser extension and workspace built on Chrome Extension Manifest V3. Lumina integrates multi-provider large language model streaming, real-time multimodal audio, intelligent in-page text operations, custom agent runtime (Sparks), rich block-based notes, and local-first data persistence with Google Drive synchronization.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Manifest](https://img.shields.io/badge/Manifest-V3-brightgreen.svg)](manifest.json)
[![Platform](https://img.shields.io/badge/Platform-Chromium-blue.svg)](https://developer.chrome.com/docs/extensions/)
[![Bundler: esbuild](https://img.shields.io/badge/Bundler-esbuild-orange.svg)](https://esbuild.github.io/)

---

## Architectural Overview

Lumina is engineered around a domain-driven, multi-tier architecture designed to maintain strict separation of concerns across extension service workers, content script sandboxes, local storage engines, and user-facing presentation layers.

![Lumina Architecture](assets/architecture.svg)

<details>
<summary>D2 Architecture Specification</summary>

```d2
vars: {
  d2-config: {
    sketch: true
    theme-id: 0
  }
}

presentation_layer: "Presentation Layer (Workspace UI)" {
  chat_ui: "Chat Interface & Stream Renderer\n(Markdown / KaTeX / Charts)"
  sparks_studio: "Sparks Agent Studio\n(Isolated Prompts & Preview)"
  notes_editor: "BlockNote Rich Editor\n(Document Workspace)"
  modals: "Modals & Side Panels\n(Settings / Search / History)"
}

service_layer: "Core & Data Services (src/db/ & src/utils/)" {
  ai_stream: "AI Streaming Dispatcher\n(Multi-provider & Key Rotation)"
  tts_manager: "TTS Synthesis Manager\n(Voice Queue & Audio Fetch)"
  auth_sync: "OAuth & Drive Sync\n(Chrome Identity API)"
  crypto: "AES-GCM Encryption\n(Sync Payload Security)"
}

persistence_layer: "Persistence Layer (IndexedDB / Local Storage)" {
  chat_db: "LuminaChatDB\n(Threads, Messages & Sparks)"
  highlight_db: "LuminaHighlightDB\n(Web Page Annotations)"
  attachment_db: "LuminaAttachmentDB\n(Binary Files & Knowledge)"
  storage_local: "chrome.storage.local\n(Settings, Keys & Sync State)"
}

content_layer: "Content Script & In-Page (src/content/)" {
  action_bar: "Selection Floating Action Bar\n(Translate / Explain / Proofread)"
  extractors: "Web Extractors & Annotations\n(DOM Text, PDF Parser)"
}

runtime_layer: "Extension Runtime (src/background/)" {
  service_worker: "Manifest V3 Background Worker\n(Long-lived Ports, Auto-Naming)"
  sidepanel_offscreen: "Side Panel & Offscreen Bridge\n(Window Bindings & Audio)"
}

presentation_layer -> service_layer: Invokes services
service_layer -> persistence_layer: Stores & retrieves
presentation_layer -> persistence_layer: Reads cache
content_layer <-> runtime_layer: Bi-directional IPC
service_layer <-> runtime_layer: Port streaming
```
</details>

### Layer Breakdown

1. **Extension Lifecycle & Background Layer (`src/background/`)**
   - Implements the Manifest V3 background service worker (`scripts/background.bundle.js`).
   - Manages Side Panel window attachments, offscreen audio document bridging, token bucket management, and unified long-lived messaging channels (`lumina-chat-stream`).
   - Handles multi-provider model routing, automated API key rotation, concurrent auto-naming, and Google Drive debounced synchronization.

2. **Content Script & In-Page Injection Layer (`src/content/`)**
   - Coordinates DOM selection events, in-page annotation highlighting, and contextual floating action bars.
   - Houses document extractors for web context harvesting and local PDF/DOM text parsing.

3. **Core Services & Utils Layer (`src/utils/`, `src/components/cores/`)**
   - Stream parser, markdown/math renderers, code syntax highlighters, memory indexing.
   - Token budgeting, location helpers, file processing, and Chrome messaging utilities.

4. **Persistence & Data Storage Layer (`src/db/`)**
   - Repository-based architecture backed by IndexedDB and AES-GCM encryption.
   - Dedicated object stores for chat sessions and message threads (`LuminaChatDB`), highlights and annotations (`LuminaHighlightDB`), media attachments (`LuminaAttachmentDB`), and TTS audio cache.
   - Migration pipelines ensuring schema backwards compatibility across extension revisions.

5. **UI & Component Layer (`src/components/`, `src/pages/`)**
   - Workspace interface supporting multi-tab management, split view layouts, responsive sidebars, and customizable theme design tokens.
   - Sparks agent studio with dedicated system prompt overrides, knowledge attachment binding, and live interactive sandbox preview.
   - BlockNote-powered rich document workspace integrated alongside chat streams.

---

## Communication & Data Flow

### AI Streaming Pipeline
```
[User Input in Workspace UI]
           │
           ▼
  handleSubmit() in workspace.js
           │
           │  port.postMessage({ action: 'chat_stream', ... })
           ▼
[Background Port: 'lumina-chat-stream']
           │
           ▼
  handleChatStream() in chat_stream_service.js
           │
           ├── Key Rotation & Model Chain Resolution
           ├── Build Context & System Instructions
           └── fetch(Provider API Endpoint, { stream: true })
           │
           ▼
  ReadableStream Loop
           │
           │  broadcastToSession(sessionId, { action: 'chunk', chunk })
           ▼
[Workspace UI Port Listener]
           │
           ▼
  chatUI.appendAssistantChunk() -> Marked Renderer -> DOM Update
```

---

## Key Capabilities

### Multi-Provider AI Engine & Resilience
- Native integration with Google Gemini, OpenAI, Anthropic Claude, Groq, Cerebras, OpenRouter, and local Ollama instances.
- Provider fallback chains and key rotation protocols to mitigate rate limits and service interruptions.
- Granular inference controls including temperature, top-p, token limits, and configurable reasoning/thinking budgets.

### Sparks Custom Agent System
- Create and isolate domain-specific AI agents with custom personas, system instructions, and knowledge files.
- Knowledge base attachment support for structured text, markdown, code, and documents.
- Real-time sandbox testing environment with live parameter inspection.

### In-Page Context & Intelligence
- Floating action bar for on-page text selection: translate, explain, summarize, or proofread.
- Persistent web annotations with color categorization and comment anchoring.
- Direct web context ingestion into active conversation threads without manual copying.

### Document Workspace & Rich Notes
- Block-based document editing powered by BlockNote and ProseMirror.
- Markdown export, KaTeX LaTeX mathematical rendering, syntax highlighting, and Chart.js diagram generation.

### Local-First Security & Cloud Sync
- Local-first architecture: all conversation histories, tokens, and custom agents reside on the user device.
- Optional client-side Google Drive synchronization via standard Chrome OAuth scopes (`drive.appdata` / `drive.file`).

---

## Repository Structure

```text
Nexus/
├── manifest.json                  # Manifest V3 extension definition and permission scopes
├── package.json                   # Dependencies, build scripts, and metadata
├── build.js                       # esbuild build and watch compilation pipeline
├── dist/                          # Compiled distribution artifacts
├── src/
│   ├── assets/                    # Static icons, fonts, templates
│   ├── background/                # Background service worker modules and streaming services
│   ├── components/                # Modular UI components (cores, features, ui, widgets)
│   ├── content/                   # Content scripts, floating action bar, and annotation DOM handlers
│   ├── db/                        # IndexedDB schemas, Drive sync, crypto, and auth
│   ├── lib/                       # Third-party libraries (KaTeX, Marked, Highlight.js)
│   ├── pages/                     # Workspace view controllers, styles, and popup
│   └── utils/                     # Shared utilities, constants, messaging, storage
```

---

## Build Pipeline

Lumina utilizes `esbuild` to compile and bundle modern JavaScript/JSX and CSS into high-performance targets compatible with the extension sandbox.

### Compilation Matrix

| Source Entrypoint | Target Bundle | Format | Target Environment |
|---|---|---|---|
| `src/pages/lumina/index.js` | `pages/lumina/lumina.bundle.js` | IIFE | Chrome 110+ |
| `src/pages/lumina/styles/index.css` | `pages/lumina/lumina.bundle.css` | CSS Bundle | Chrome 110+ |
| `src/background/index.js` | `scripts/background.bundle.js` | ESM | Chrome Service Worker |
| `src/content/index.js` | `scripts/content.bundle.js` | IIFE | Chrome Content Script |
| `tools/blocknote_entry.jsx` | `lib/blocknote.js` | ESM/JSX Bundle | Browser / Workspace |

---

## Installation & Setup

### Prerequisites
- Google Chrome or any Chromium-based browser (v110+)
- Node.js (v18.0.0 or higher)
- npm (v9.0.0 or higher)

### Build from Source

1. Clone the repository:
   ```bash
   git clone https://github.com/Dinhbinh02/Lumina.git
   cd Lumina
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Compile the production bundles:
   ```bash
   npm run build
   ```

4. For active development with hot compilation:
   ```bash
   npm run dev
   ```

### Loading into Chromium

1. Open Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** via the toggle in the top-right corner.
3. Click **Load unpacked**.
4. Select the root `Lumina` directory containing `manifest.json`.

---

## Security & Privacy Model

- **No Remote Telemetry**: Lumina does not operate intermediary servers. All API queries are dispatched directly from the client browser to the configured model provider endpoints.
- **Key Isolation**: API keys are stored in `chrome.storage.local` with strict extension-origin access limits.
- **Minimal Scopes**: Permissions requested in `manifest.json` are bounded strictly to user-initiated browser capabilities (`storage`, `offscreen`, `sidePanel`, `identity`).

---

## License

This project is licensed under the terms of the [MIT License](LICENSE).
