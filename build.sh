#!/usr/bin/env bash
# Builds dist/index.html: one self-contained page (markup, styles and script inline; fonts from Google Fonts).
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p dist
{
  echo '<!doctype html>'
  echo '<html lang="en">'
  echo '<head>'
  cat src/meta.html src/head.html
  echo '</head>'
  echo '<body>'
  cat src/body.html src/p1.js src/p2.js src/p3.js   # body.html ends with <script>, p3.js ends with </script>
  echo '</body>'
  echo '</html>'
} > dist/index.html
[ -d assets ] && cp -r assets dist/
echo "built dist/index.html ($(wc -c < dist/index.html) bytes)"
