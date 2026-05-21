#!/bin/bash
# Codex Launcher 一键安装 + 构建脚本
set -e

echo "============================================"
echo "  Codex Launcher - 安装与构建"
echo "  跨平台: macOS / Windows / Linux"
echo "============================================"

cd "$(dirname "$0")"

# 1. 安装依赖
echo "[1/4] 安装 Node.js 依赖..."
npm install --save-dev electron electron-builder 2>&1 | tail -3

# 2. 生成图标 (简单的 16x16 彩色方块 PNG)
echo "[2/4] 生成应用图标..."
node -e "
const fs = require('fs');
// 最小 PNG: 16x16 蓝色圆圈
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAHklEQVQ4T2NkYPj/n4EBBJgYKAQYqSUMDAwM/wHxAADJXgMXQ+EZAAAAAElFTkSuQmCC','base64');
fs.writeFileSync('icon.png', png);
" 2>/dev/null || echo "Using placeholder icon"

# 3. 检查 Codex 配置
echo "[3/4] 检查 Codex 环境..."
if [ -f ~/.codex/config.toml ]; then
  echo "  ✓ Codex 已配置"
else
  echo "  - 将在首次启动时自动配置"
fi

# 4. 构建
echo "[4/4] 构建应用..."
PLATFORM=$(uname -s)
case "$PLATFORM" in
  Darwin)
    npm run build:mac 2>&1 | tail -5
    echo ""
    echo "✅ macOS App 已构建: dist/Codex Launcher-*.dmg"
    ;;
  Linux)
    npm run build:linux 2>&1 | tail -5
    echo ""
    echo "✅ Linux App 已构建: dist/Codex Launcher-*.AppImage"
    ;;
  *)
    echo "当前平台: $PLATFORM"
    echo "运行 'npm run build:win' 构建 Windows 版本"
    echo "运行 'npm run build:all' 构建所有平台"
    ;;
esac

echo ""
echo "============================================"
echo "  直接运行: npm start"
echo "============================================"
