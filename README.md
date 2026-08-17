<div align="center">
  <img src="assets/icons/icon128.png" alt="Lumina" height="84" />
  <h1><b>Lumina</b></h1>
  <p><b>Fast, private, and flexible AI assistant for your browser.</b></p>
  <p>
    <a href="https://github.com/Dinhbinh02/Lumina">
      <img src="https://img.shields.io/badge/status-active-brightgreen?logo=github" alt="Status" />
    </a>
    <a href="https://github.com/Dinhbinh02/Lumina/blob/main/LICENSE">
      <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License" />
    </a>
    <img src="https://img.shields.io/badge/Chrome_Extension-Manifest_V3-4285F4" alt="Manifest V3" />
  </p>
</div>

## Overview

Lumina is a modern, feature-rich Chrome Extension designed to seamlessly integrate AI assistance into your daily browsing experience. Whether you're researching, writing, studying, or building custom AI agents, Lumina provides an intuitive and elegant workspace right within Google Chrome.

Built with performance, privacy, and aesthetic excellence in mind, Lumina stores data locally, supports multiple AI providers, offers shortcut-driven text actions, and features custom AI agents (**Sparks**).

---

## 🌟 Key Features

### ⚡ AI Provider & Model Ecosystem
- **Multi-provider Support** — Connect to Google Gemini, OpenAI, Claude, Groq, Cerebras, OpenRouter, and local models via Ollama.
- **Model Chain & Selector** — Unified model selector dropdown across Topbar and Spark Preview with automatic fallback and prompt support detection.
- **Key Rotation & Resilience** — Configure multiple API keys per provider to prevent rate-limit interruptions.
- **Advanced Parameters & Thinking Levels** — Customize temperature, topP, maxTokens, and reasoning/thinking levels (Minimal, Low, Standard, Extended).

### 🤖 Sparks System (Custom AI Assistants)
- **Custom Agent Builder** — Create, edit, and personalize dedicated Sparks with custom avatars, descriptions, and instructions.
- **Knowledge Attachments** — Upload files (text, code, CSV, PDF, etc.) for Sparks to reference as knowledge context.
- **Isolated Spark Editor & Interactive Preview** — Resizable modal editor featuring live interactive preview chat with real-time model selection.

### 🌐 Smart Browsing & Context Tools
- **Selection Action Bar** — Highlight text on any web page to trigger instant explanation, translation, grammar correction, or custom prompts.
- **Web Page Context Awareness** — Attach web page contents and live tab sources to your chat context.
- **KaTeX & Code Formatting** — Rich markdown rendering with syntax highlighting, inline LaTeX math equations, and interactive charts.
- **Web Search & Annotation** — Highlights and text annotation persistence across sessions.

### 🔐 Privacy & Cloud Sync
- **Privacy-First Architecture** — API keys, local history, and custom Sparks are stored securely in your local browser storage.
- **Google Drive Auto-Sync** — Seamlessly back up and sync settings, prompts, and chat history using Chrome's native OAuth identity.

---

## 🛠️ Installation & Setup

### Installation
1. Clone or download the repository ZIP and extract it.
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked**.
5. Select the `Lumina` project directory.

### Initial Setup
1. Open Lumina via the Chrome Extension popup or Side Panel.
2. Open **Settings** (gear icon) -> **Providers** and add your API keys.
3. (Optional) Under **Sync**, click **Sign in with Google** to enable automatic Google Drive backup.

---

## 📁 Project Structure

```text
Lumina/
├── manifest.json            # Manifest V3 extension configuration
├── build.py                 # Python build & bundle script (use --watch for dev)
├── build.ps1                # PowerShell build script for Windows
├── PROJECT_SYMBOLS.md       # Auto-generated index of classes, functions, and symbols
├── lib/
│   ├── core/                # Core engines (auth/sync, chat_db, notes_manager, tts_manager, memory, etc.)
│   ├── helpers/             # Utility modules (selection_utils, annotation_utils, file_processor, etc.)
│   ├── parsers/             # Dictionary & text parsers
│   ├── ui/                  # UI panels (notes_panel, tts_panel, history_panel, dictionary_popup)
│   └── vendor/              # Third-party libraries (BlockNote, Marked, KaTeX, Highlight.js, etc.)
├── pages/
│   ├── lumina/              # Main Lumina application (Chat, Notes, Sparks, Settings, Search)
│   ├── popup/               # Extension popup launcher
│   └── offscreen/           # Offscreen document for audio processing
├── scripts/
│   ├── background.js        # Background Service Worker
│   └── content.js           # Web page content script for selection toolbar & annotations
├── tools/                   # Developer & compilation tools (blocknote build, symbol generator)
└── assets/                  # Icons, fonts, and audio assets
```

---

## 🛠️ Development & Build Workflow

Lumina uses a lightweight build script (`build.py`) to bundle source JS/CSS files into `lumina.bundle.js` and `lumina.bundle.css`.

### Development Mode (Auto-rebuild on file change)
```bash
python3 build.py --watch
```

### Production Build
```bash
python3 build.py
```

### Updating Symbol Index
To regenerate `PROJECT_SYMBOLS.md` after adding or changing functions:
```bash
node tools/generate_symbols.js
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

