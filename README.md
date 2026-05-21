# Codex Launcher

在 OpenAI Codex 里用 DeepSeek 和千问，不用花钱买 GPT。

托盘菜单切换模型，填 Key 就能用。没有 sudo、没有 DNS 劫持、没有证书。

## 为什么写这个

Codex 好用，但官方只支持 OpenAI。我们花了半个月逆向它的协议，搞清楚了 WebSocket 通信、Response API 格式、模型映射机制，然后写了一个本地代理把 Codex 的请求转给任意大模型。

这个项目把代理和启动器打包成一个 App，开箱即用。

## 安装

从 [Releases](https://github.com/JiafuLi-phy/codex-launcher/releases) 下载对应系统版本。

macOS 用户首次打开如果提示"无法验证开发者"，去系统设置 → 隐私与安全性 → 点击"仍要打开"。

## 使用

1. 打开 Codex Launcher，点菜单栏图标
2. 点「模型设置」，填 API Key 和模型信息
3. 在菜单栏选一个模型，点「启动 Codex」
4. 回复前面会自动标注模型名，比如 `[DeepSeek V4 Pro]`

切换模型不需要重启 Codex，菜单栏选一下就行。

## 怎么工作的

```
Codex → 127.0.0.1:53683 (本地代理) → 你的模型 API
```

代理做了三件事：
1. 把 Codex 的 WebSocket 协议翻译成标准 Chat Completions
2. 把 Responses API 的嵌套格式转成纯文本
3. 把 developer 角色映射成 system

代理代码在 `proxy.js`，不到 300 行，纯 Node.js 标准库，没有第三方依赖。

## 支持的模型

只要兼容 OpenAI Chat Completions 的都行。默认配了：

- DeepSeek V4 Pro / Flash
- 通义千问 Qwen Max / Plus
- GPT-4o (via OpenRouter)
- Claude Sonnet 4 (via OpenRouter)
- Gemini 2.5 Pro (via OpenRouter)

## 开发

```bash
git clone git@github.com:JiafuLi-phy/codex-launcher.git
cd codex-launcher
npm install
npm start          # 运行
npm run build:mac  # 打包 macOS
npm run build:win  # 打包 Windows
npm run build:linux # 打包 Linux
```

## 踩坑记录

这东西折腾了很久。最早试了环境变量、config.toml、OSS 模式、HTTP 代理，全都不行。最后上了 DNS 劫持 + 443 端口 + WebSocket 协议逆向才跑通。后来又发现有更简单的方案：config.toml 设 `base_url` 指向本地 HTTP 代理，Codex 会通过 WebSocket 连过来。

完整过程写了 LaTeX 文档在 release 里。

## License

MIT
