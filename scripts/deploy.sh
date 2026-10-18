#!/bin/sh
# site/ を GitHub Pages（gh-pages ブランチ）に公開する。
# CSS/JS の読み込みに版番号を付け直して、更新直後に古いファイルとの組み合わせで動かなくなるのを防ぐ。
# 使い方: sh scripts/deploy.sh "コミットメッセージ"（変更をコミットしてから公開。メッセージ省略時は版番号の更新だけ）
set -e
cd "$(dirname "$0")/.."

version=$(date +%Y%m%d%H%M)
sed -i -E "s/\?v=[0-9a-z]+/?v=$version/g" site/index.html

git add -A site
if [ -n "$1" ]; then
  git commit -q -m "$1"
elif ! git diff --cached --quiet; then
  git commit -q -m "Bump asset version to $version"
fi

git subtree split --prefix site -b gh-pages >/dev/null
git push -q origin main gh-pages
echo "deployed (asset version $version)"
