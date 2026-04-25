#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
DIST_DIR="$ROOT_DIR/dist"
EXT_DIR="$DIST_DIR/chrome-extension"
VERSION=$(grep -o '"version": *"[^"]*"' "$ROOT_DIR/manifest.json" | cut -d'"' -f4)
ZIP_PATH="$DIST_DIR/websketch-v${VERSION}.zip"

echo "WebSketch 打包"
echo "版本: v$VERSION"

rm -rf "$EXT_DIR"
mkdir -p "$EXT_DIR"

cp -r \
  "$ROOT_DIR/manifest.json" \
  "$ROOT_DIR/_locales" \
  "$ROOT_DIR/assets" \
  "$ROOT_DIR/background" \
  "$ROOT_DIR/content" \
  "$ROOT_DIR/popup" \
  "$EXT_DIR/"

find "$EXT_DIR" -name ".DS_Store" -delete

rm -f "$ZIP_PATH"
(
  cd "$EXT_DIR"
  zip -qr "$ZIP_PATH" .
)

echo ""
echo "构建完成"
echo "扩展目录: $EXT_DIR"
echo "ZIP 文件: $ZIP_PATH"
