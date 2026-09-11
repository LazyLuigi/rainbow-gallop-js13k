#!/usr/bin/env bash
# build.sh - js13k + Wavedash build chain.
#
#   js13k-game.zip           contest archive (repo root)
#   dist/js13k/index.html    compressed page (terser + roadroller), the zip content
#   dist/wavedash/index.html unminified page, pointed at by wavedash.toml
#
# Usage:
#   bash build.sh [src/index.html]
#   RRBEST=8 bash build.sh          keep the smallest of 8 roadroller draws
#   RRSEL=12 bash build.sh          more contexts: smaller zip, slower startup
#                                   (see the table below)
#   FAST=1   bash build.sh          no roadroller, writes to dist/fast/, touches
#                                   neither the zip nor dist/js13k/
set -euo pipefail

SRC="${1:-src/index.html}"
LIMIT=13312   # 13 * 1024
ROOT="$(cd "$(dirname "$0")" && pwd)"
ZIP="$ROOT/js13k-game.zip"
RRBEST="${RRBEST:-1}"
# Number of roadroller contexts. Fewer contexts means a bigger zip but a much
# faster decode at load time, which is what the submission site measures.
# Measured on this game, after advzip:
#   x12 (roadroller default) 12651 bytes  6139 ms under 8x CPU throttling
#   x9                       12747 bytes  4814 ms
#   x8                       12808 bytes  3945 ms
#   x6                       13155 bytes  3412 ms
RRSEL="${RRSEL:-9}"
FAST="${FAST:-0}"

if [ ! -f "$SRC" ]; then echo "Source not found: $SRC"; exit 1; fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# Tools: terser + roadroller. Looked for in the usual places; if missing, they
# are installed globally (which works with .npmrc files that force a prefix).
# As a last resort, fall back to npx.
find_tool(){  # $1 = binary name
  local name="$1" p
  for p in \
    "$ROOT/node_modules/.bin/$name" \
    "$HOME/node_modules/.bin/$name" \
    "$(npm root -g 2>/dev/null)/.bin/$name" \
    "$(npm config get prefix 2>/dev/null)/bin/$name"; do
    [ -x "$p" ] && { echo "$p"; return 0; }
  done
  command -v "$name" >/dev/null 2>&1 && { echo "$name"; return 0; }
  return 1
}
TERSER="$(find_tool terser || true)"
ROADROLLER="$(find_tool roadroller || true)"
if [ -z "$TERSER" ] || [ -z "$ROADROLLER" ]; then
  echo "Installing terser + roadroller (npm -g) ..."
  npm install -g terser roadroller >/dev/null 2>&1 || \
    npm install terser roadroller >/dev/null 2>&1 || \
    echo "WARNING: npm install failed. On a restricted network, allow registry.npmjs.org."
  TERSER="$(find_tool terser || echo "npx --yes terser")"
  ROADROLLER="$(find_tool roadroller || echo "npx --yes roadroller")"
fi

# 1) Extract the contents of the last <script>...</script> and the <style>.
python3 - "$SRC" "$WORK" <<'PY'
import re, sys
src, work = sys.argv[1], sys.argv[2]
html = open(src, encoding='utf-8').read()
m = re.search(r'<script>(.*)</script>', html, re.S)
if not m:
    print("No <script> block found"); sys.exit(1)
open(work + '/game.js', 'w', encoding='utf-8').write(m.group(1))
# Keep the <style> so it can go back into the minimal HTML
sm = re.search(r'<style>(.*?)</style>', html, re.S)
open(work + '/style.css', 'w', encoding='utf-8').write(sm.group(1) if sm else '')
PY

# 2) Check the syntax, then minify with terser.
#    No booleans_as_integers: it rewrites true as 1, and the Wavedash SDK,
#    which validates its argument types, then rejects every call in silence.
#    See the Wavedash section of the README.
node --check "$WORK/game.js" && echo "JS syntax: OK"
$TERSER "$WORK/game.js" -c passes=3,unsafe=true -m toplevel=true -o "$WORK/game.min.js" 2>/dev/null \
  || cp "$WORK/game.js" "$WORK/game.min.js"
echo "Minified JS (terser): $(wc -c < "$WORK/game.min.js") bytes"

# 3) roadroller. Its parameter search is random: the same source came out
#    anywhere between 16431 and 16475 bytes across draws. RRBEST=n runs it n
#    times and keeps the smallest.
if [ "$FAST" = "1" ]; then
  echo "FAST=1: roadroller skipped."
  cp "$WORK/game.min.js" "$WORK/game.rr.js"
elif [ -n "$ROADROLLER" ]; then
  BESTSZ=0
  for i in $(seq 1 "$RRBEST"); do
    if $ROADROLLER "$WORK/game.min.js" -S "x$RRSEL" -o "$WORK/cand.js" 2>/dev/null; then
      SZ=$(wc -c < "$WORK/cand.js")
      if [ "$BESTSZ" = "0" ] || [ "$SZ" -lt "$BESTSZ" ]; then BESTSZ=$SZ; cp "$WORK/cand.js" "$WORK/game.rr.js"; fi
      [ "$RRBEST" -gt 1 ] && printf "  draw %s/%s: %s bytes\n" "$i" "$RRBEST" "$SZ"
    fi
  done
  if [ "$BESTSZ" = "0" ]; then
    echo "roadroller unavailable: keeping the terser output."
    cp "$WORK/game.min.js" "$WORK/game.rr.js"
  else
    echo "Roadrolled JS: $BESTSZ bytes ($RRSEL contexts, best of $RRBEST)"
  fi
else
  echo "roadroller unavailable: keeping the terser output."
  cp "$WORK/game.min.js" "$WORK/game.rr.js"
fi

# 4) Rebuild a minimal HTML around the compressed JS.
python3 - "$WORK" <<'PY'
import sys
work = sys.argv[1]
css = open(work + '/style.css', encoding='utf-8').read().strip()
js = open(work + '/game.rr.js', encoding='utf-8').read()
style = ('<style>' + css + '</style>') if css else ''
html = '<!doctype html><meta charset=utf-8><title>Rainbow Gallop</title>' + style + '<canvas id=c></canvas><script>' + js + '</script>'
open(work + '/out.html', 'w', encoding='utf-8').write(html)
PY

# Fast mode: isolated artefact, the official outputs are left alone.
if [ "$FAST" = "1" ]; then
  mkdir -p "$ROOT/dist/fast"
  cp "$WORK/out.html" "$ROOT/dist/fast/index.html"
  echo "FAST: $ROOT/dist/fast/index.html ($(wc -c < "$ROOT/dist/fast/index.html") bytes, over budget). Zip untouched."
  exit 0
fi

# 5) Zip in the temporary directory, verify, and only then replace the artefacts.
cp "$WORK/out.html" "$WORK/index.html"
( cd "$WORK" && zip -9 -q new.zip index.html )
# advzip recompresses the same content with zopfli: about 2.7% back for free,
# and the extracted content stays identical byte for byte (verified below).
if command -v advzip >/dev/null 2>&1; then
  Z0=$(wc -c < "$WORK/new.zip")
  advzip -z -4 -q "$WORK/new.zip" 2>/dev/null || true
  Z1=$(wc -c < "$WORK/new.zip")
  if [ "$Z1" -lt "$Z0" ]; then echo "advzip: $Z0 -> $Z1 bytes (-$((Z0 - Z1)))"; fi
else
  echo "advzip missing (brew install advancecomp): about 2.7% of the archive left on the table."
fi
Z=$(wc -c < "$WORK/new.zip")
# The extracted content must be the built page, byte for byte.
( cd "$WORK" && mkdir -p verify && unzip -qo new.zip -d verify && cmp -s verify/index.html out.html ) \
  || { echo "FAILED: the zip content differs from the built page."; exit 1; }

mkdir -p "$ROOT/dist/js13k" "$ROOT/dist/wavedash"
cp "$WORK/out.html" "$ROOT/dist/js13k/index.html"
# Wavedash target: the source as it is, no minification and no roadroller.
cp "$SRC" "$ROOT/dist/wavedash/index.html"
cp "$WORK/new.zip" "$ZIP"

MARGIN=$((LIMIT - Z))
echo "----------------------------------------"
echo "Final zip:  $Z bytes  /  $LIMIT max"
if [ "$Z" -le "$LIMIT" ]; then
  echo "WITHIN BUDGET. Margin: $MARGIN bytes."
else
  echo "OVER by $((Z - LIMIT)) bytes. Cut code or check roadroller."
fi
echo "Artefacts:"
echo "  - $ZIP                        (to submit)"
echo "  - $ROOT/dist/js13k/index.html     (compressed preview)"
echo "  - $ROOT/dist/wavedash/index.html  (Wavedash target, uncompressed)"
[ "$Z" -le "$LIMIT" ]
