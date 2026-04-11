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

Lumina is a Chrome Extension built to bring AI assistance directly into your browsing workflow. It helps you chat, summarize, translate, explain, and organize knowledge without leaving the page.

Designed with privacy and speed in mind, Lumina stores data locally in the browser and supports multiple AI providers, shortcut-driven actions, and integrated study tools.

## Key Features

- **Multi-provider AI support** — Connect to Google Gemini, Groq, Cerebras, or local models through Ollama.
- **Side-panel chat** — Open a persistent chat panel anytime with keyboard shortcuts.
- **Selection tools** — Highlight text to quickly trigger explanation, translation, or grammar correction.
- **Shortcut automation** — Work faster with configurable shortcuts for common actions.
- **Custom prompts** — Personalize system prompts and assistant behavior.
- **Anki integration** — Generate and manage flashcards more efficiently.
- **Key rotation** — Use multiple API keys to reduce rate-limit interruptions.
- **Privacy-first storage** — Keep API keys and history inside your browser.

## Installation

1. Download the ZIP from GitHub and extract it.
2. Open Google Chrome and go to `chrome://extensions/`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the `Lumina-main` folder.

## Setup

After loading the extension:

1. Open the Lumina popup or side panel.
2. Configure your preferred provider.
3. Add API keys.
4. Customize shortcuts and prompts to match your workflow.

## Usage

- **Chat** — Start a conversation from the side panel.
- **Selection actions** — Highlight text on any page and trigger quick actions.
- **Study workflow** — Use the Anki tools to turn useful content into flashcards.
- **Keyboard-first control** — Use shortcuts for fast access without relying on the mouse.

## Project Structure

- `manifest.json` — Extension manifest
- `pages/` — UI pages for options, chat, spotlight, Anki, and other surfaces
- `scripts/` — Background, content, and page scripts
- `assets/` — Icons, images, and styles
- `lib/` — Shared libraries and vendor code
- `docs/` — Project documentation

## Development

This project is built as a Chrome Extension Manifest V3 app.

To modify or extend the extension:

- update the relevant page or script in `pages/` or `scripts/`
- adjust permissions and entry points in `manifest.json`
- keep shared utilities inside `lib/`

## Contributing

Contributions are welcome.

1. Fork the repository.
2. Create a feature branch.
3. Make your changes.
4. Open a pull request.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
