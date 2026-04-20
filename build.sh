#!/bin/bash

# WebSketch 打包脚本
# 用于创建 Chrome Web Store 上传包

echo "🎨 WebSketch - 打包工具"
echo "========================"

# 获取版本号
VERSION=$(grep -o '"version": *"[^"]*"' manifest.json | cut -d'"' -f4)
echo "📦 当前版本: v$VERSION"

# 清理旧的打包文件
if [ -f "../websketch-v${VERSION}.zip" ]; then
    echo "🗑️  删除旧的打包文件..."
    rm "../websketch-v${VERSION}.zip"
fi

# 创建打包目录
BUILD_DIR="../websketch-build"
if [ -d "$BUILD_DIR" ]; then
    echo "🧹 清理构建目录..."
    rm -rf "$BUILD_DIR"
fi

echo "📂 创建构建目录..."
mkdir -p "$BUILD_DIR"

# 复制必要文件
echo "📋 复制文件..."
cp -r manifest.json background content popup assets "$BUILD_DIR/"

# 排除不需要的文件
echo "🔍 清理不必要的文件..."
find "$BUILD_DIR" -name ".DS_Store" -delete
find "$BUILD_DIR" -name "*.py" -delete
find "$BUILD_DIR" -name "*.md" -delete

# 打包成 ZIP
echo "📦 创建 ZIP 包..."
cd ..
zip -r "websketch-v${VERSION}.zip" websketch-build/

# 清理构建目录
rm -rf websketch-build

echo ""
echo "✅ 打包完成！"
echo "📦 文件位置: $(pwd)/websketch-v${VERSION}.zip"
echo "🌐 可以上传到 Chrome Web Store 了"
echo ""
echo "💡 下一步："
echo "   1. 访问 https://chrome.google.com/webstore/devconsole/"
echo "   2. 点击「新增物品」"
echo "   3. 上传 websketch-v${VERSION}.zip"
