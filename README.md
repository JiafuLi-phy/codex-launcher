# Codex Launcher

Use any LLM in OpenAI Codex. No OpenAI API key required.

Pick a model from the menu bar, fill in your API key, launch Codex. Model switching is instant with no restart needed.

## How It Works

```
Codex (WebSocket) → localhost:53683 (proxy) → your LLM API (Chat Completions)
```

Codex talks to OpenAI via a WebSocket-based protocol (Responses API). The proxy:

1. Accepts WebSocket connections from Codex
2. Translates Responses API messages to standard Chat Completions requests
3. Forwards to your LLM provider
4. Streams the response back through WebSocket in the format Codex expects

It also handles content format normalization (nested arrays to plain text), role mapping (developer to system), request queuing, and model tag injection so you always see which backend is active.

The proxy is a single file (`proxy.js`, ~300 lines) using only Node.js built-in modules. No dependencies.

## Supported Models

Any provider with an OpenAI-compatible Chat Completions endpoint. Default presets:

- DeepSeek V4 Pro / Flash
- Qwen Max / Plus
- GPT-4o / Claude Sonnet 4 / Gemini 2.5 Pro (via OpenRouter)

## Install

Download from [Releases](https://github.com/JiafuLi-phy/codex-launcher/releases).

macOS users: if you see "cannot verify developer", go to System Settings → Privacy & Security → "Open Anyway".

## Usage

1. Open Codex Launcher, click the menu bar icon
2. Open "Model Settings", enter your API key and model details
3. Select a model from the menu bar, click "Launch Codex"
4. Responses are tagged: `[DeepSeek V4 Pro] Hello!`

## Develop

```bash
git clone git@github.com:JiafuLi-phy/codex-launcher.git
cd codex-launcher
npm install
npm start           # run
npm run build:mac   # package macOS
npm run build:win   # package Windows
npm run build:linux # package Linux
```

## Files

| File | Purpose |
|------|---------|
| `proxy.js` | Embedded proxy: HTTP + WebSocket, protocol translation |
| `main.js` | Electron main process: tray menu, proxy lifecycle, IPC |
| `preload.js` | Secure bridge between main and renderer |
| `src/settings.html` | Settings panel for managing models and keys |

## License

MIT
