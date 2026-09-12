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
# Measured on the finished game (trophies and leaderboards included), best of
# 8 draws, after advzip:
#   x12  13125 bytes, margin 187   7065 ms under 8x CPU throttling
#   x10  13194 bytes, margin 118   5501 ms
#   x9   13280 bytes, margin  32   4964 ms
# x10 is the default: x9 leaves less margin than the draw-to-draw variance.
RRSEL="${RRSEL:-10}"
FAST="${FAST:-0}"

if [ ! -f "$SRC" ]; then echo "Source not found: $SRC"; exit 1; fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# Use the lockfile's local tools. Never install or silently substitute tools.
TERSER="$ROOT/node_modules/.bin/terser"
ROADROLLER="$ROOT/node_modules/.bin/roadroller"
for tool in "$TERSER" "$ROADROLLER"; do
  [ -x "$tool" ] || { echo "Missing $tool. Run npm ci first."; exit 1; }
done
[[ "$RRBEST" =~ ^[1-9][0-9]*$ ]] || { echo "RRBEST must be a positive integer"; exit 1; }
[[ "$RRSEL" =~ ^[1-9][0-9]*$ ]] || { echo "RRSEL must be a positive integer"; exit 1; }
cp "$SRC" "$WORK/source.html"
SRC="$WORK/source.html"

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
node --check "$WORK/game.js"
echo "JS syntax: OK"
$TERSER "$WORK/game.js" -c passes=3,unsafe=true -m toplevel=true -o "$WORK/game.min.js"
echo "Minified JS (terser): $(wc -c < "$WORK/game.min.js") bytes"

# 3) roadroller. Its parameter search is random: the same source came out
#    anywhere between 16431 and 16475 bytes across draws. RRBEST=n runs it n
#    times and keeps the smallest.
if [ "$FAST" = "1" ]; then
  echo "FAST=1: roadroller skipped."
  cp "$WORK/game.min.js" "$WORK/game.rr.js"
else
  BESTSZ=0
  for i in $(seq 1 "$RRBEST"); do
    if $ROADROLLER "$WORK/game.min.js" -S "x$RRSEL" -o "$WORK/cand.js" 2>/dev/null; then
      SZ=$(wc -c < "$WORK/cand.js")
      if [ "$BESTSZ" = "0" ] || [ "$SZ" -lt "$BESTSZ" ]; then BESTSZ=$SZ; cp "$WORK/cand.js" "$WORK/game.rr.js"; fi
      [ "$RRBEST" -gt 1 ] && printf "  draw %s/%s: %s bytes\n" "$i" "$RRBEST" "$SZ"
    fi
  done
  if [ "$BESTSZ" = "0" ]; then
    echo "FAILED: no successful Roadroller draw; official outputs untouched."
    exit 1
  else
    echo "Roadrolled JS: $BESTSZ bytes ($RRSEL contexts, best of $RRBEST)"
  fi
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

if [ "$Z" -gt "$LIMIT" ]; then
  echo "FAILED: $Z bytes exceeds $LIMIT by $((Z - LIMIT)). Official outputs untouched."
  exit 1
fi
# These two directories are owned by the build; remove stale generated files.
rm -rf "$ROOT/dist/js13k" "$ROOT/dist/wavedash"
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
