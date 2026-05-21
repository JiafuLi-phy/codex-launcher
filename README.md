# 🤖 Codex Launcher

Use **any LLM** in OpenAI Codex — DeepSeek, Qwen, GPT, Claude, Gemini, and more.

Menu bar model switcher + embedded proxy + one-click Codex launcher.

**No sudo. No DNS hijacking. No SSL certificates.** Just fill in your model and API key.

## ✨ Features

- 🔄 **Menu bar model switching** — change models without restarting Codex
- 🏠 **Zero privilege** — high port HTTP, no root/sudo needed
- 🔌 **Any OpenAI-compatible API** — DeepSeek, Qwen, OpenRouter, Ollama, etc.
- 📊 **Model tag injection** — responses prefixed with `[Model-Name]` so you always know which backend you're using
- 🌍 **Cross-platform** — macOS, Windows, Linux
- 🚀 **Hot reload** — switch models in the tray menu, instant effect

## 📦 Installation

### Option 1: Pre-built packages

Download from [Releases](https://github.com/codex-launcher/codex-launcher/releases):

| Platform | Package |
|----------|---------|
| macOS (Apple Silicon) | `Codex Launcher-*-arm64.dmg` |
| macOS (Intel) | `Codex Launcher-*.dmg` |
| Windows | `Codex Launcher Setup *.exe` |
| Linux | `Codex Launcher-*.AppImage` |

### Option 2: Run from source

```bash
git clone https://github.com/codex-launcher/codex-launcher.git
cd codex-launcher
npm install
npm start
```

### Option 3: Build from source

```bash
npm install
npm run build:mac     # macOS DMG
npm run build:win     # Windows installer
npm run build:linux   # Linux AppImage
npm run build:all     # All platforms
```

## 🚀 Quick Start

1. Launch **Codex Launcher**
2. Click the tray icon → **Model Settings**
3. Fill in your model's **API Key**
4. Click **Launch Codex** in the tray menu
5. Start coding — model tags show which backend is active

## ⚙️ Configuration

All settings are stored in `~/.codex-launcher/config.json`:

```json
{
  "port": 53683,
  "activeModel": "deepseek-v4-pro",
  "models": [
    {
      "id": "deepseek-v4-pro",
      "name": "DeepSeek V4 Pro",
      "provider": "deepseek",
      "apiKey": "sk-your-key-here",
      "apiHost": "api.deepseek.com",
      "pathPrefix": ""
    }
  ]
}
```

Codex config is auto-written to `~/.codex/config.toml` pointing to the local proxy.

## 🔧 How It Works

```
Codex (config.toml) → 127.0.0.1:53683 (local proxy) → Your LLM backend
                           ↑ HTTP/WS
                     Protocol translation
                     (Responses ↔ Chat Completions)
```

1. **Codex sends Responses API** requests to the local proxy (via `config.toml base_url`)
2. **Proxy translates** Responses API → Chat Completions API
3. **Forwards to your LLM** (DeepSeek, Qwen, OpenRouter, etc.)
4. **Streams response back** in Responses format with model tag injected

## 📁 Project Structure

```
main.js          Electron main process (tray, IPC, proxy lifecycle)
preload.js       Secure IPC bridge
proxy.js         Embedded proxy (HTTP + WebSocket, protocol translation)
src/settings.html Settings panel UI
package.json     Build configuration (electron-builder)
```

## 🛠 Tech Stack

- **Runtime**: Electron 33
- **Proxy**: Node.js (embedded, ~300 lines)
- **Build**: electron-builder (cross-platform packaging)
- **No external dependencies** — proxy uses only Node.js built-ins

## 📄 License

MIT — see [LICENSE](LICENSE)

## 🙏 Acknowledgments

Built after 13 iterations of reverse-engineering Codex's WebSocket protocol.
See the full story in the companion LaTeX document.
