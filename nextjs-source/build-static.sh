#!/usr/bin/env bash
# Builds the static (cPanel / public_html) version of DetheAI into ./out and zips it.
#
#   npm run build:static
#   NEXT_PUBLIC_API_BASE=https://api.detheai.com npm run build:static   # with a hosted backend
#
# What it does:
#   1. temporarily moves src/app/api out of the tree (API routes can't be statically exported)
#   2. runs `next build` with STATIC_EXPORT=1  (output: "export")
#   3. restores src/app/api (always — even if the build fails)
#   4. adds .htaccess + 404.html and produces detheai-static-cpanel.zip
set -euo pipefail
cd "$(dirname "$0")/.."

API_DIR="src/app/api"
STASH_DIR=".static-build-stash/api"
ZIP_NAME="detheai-static-cpanel.zip"

restore() {
  if [ -d "$STASH_DIR" ]; then
    rm -rf "$API_DIR"
    mkdir -p "$(dirname "$API_DIR")"
    mv "$STASH_DIR" "$API_DIR"
    rmdir .static-build-stash 2>/dev/null || true
  fi
}
trap restore EXIT

echo "▶ Preparing static build (API routes set aside temporarily)…"
rm -rf .static-build-stash out
mkdir -p .static-build-stash
mv "$API_DIR" "$STASH_DIR"

echo "▶ next build (STATIC_EXPORT=1, API base: '${NEXT_PUBLIC_API_BASE:-<none — server features disabled>}')"
STATIC_EXPORT=1 npx next build

restore
trap - EXIT

echo "▶ Adding cPanel extras (.htaccess, 404.html)…"
cp scripts/static/.htaccess out/.htaccess
cp scripts/static/README-CPANEL.txt out/README-CPANEL.txt
[ -f out/404.html ] || cp out/404/index.html out/404.html 2>/dev/null || true
# Copy of the intro frames README so the frames folder survives an upload
mkdir -p out/frames && cp public/frames/README.txt out/frames/README.txt 2>/dev/null || true

# Drop RSC payload files (not needed for a plain static host)
find out -maxdepth 2 -name "__next.*.txt" -delete 2>/dev/null || true
find out -name "index.txt" -delete 2>/dev/null || true

echo "▶ Zipping → $ZIP_NAME"
rm -f "$ZIP_NAME"
( cd out && zip -qr "../$ZIP_NAME" . -x '*.DS_Store' )

echo
echo "✅ Static build ready:"
echo "   folder : ./out            (upload its CONTENTS to public_html)"
echo "   zip    : ./$ZIP_NAME      (upload + 'Extract' in cPanel File Manager)"
du -sh out "$ZIP_NAME" | sed 's/^/   /'
