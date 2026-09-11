#!/usr/bin/env bash
# build.sh - chaine de build js13k + Wavedash.
#
#   js13k-game.zip          archive du concours (racine du depot)
#   dist/js13k/index.html   page compressee (terser + roadroller), contenu du zip
#   dist/wavedash/index.html page non minifiee, pointee par wavedash.toml
#
# Usage:
#   bash build.sh [src/index.html]
#   RRBEST=8 bash build.sh          garde le plus petit de 8 tirages roadroller
#   RRSEL=9  bash build.sh          moins de contextes : zip plus gros, demarrage
#                                   plus rapide (voir le tableau plus bas)
#   FAST=1   bash build.sh          sans roadroller, ecrit dans dist/fast/, ne
#                                   touche ni au zip ni a dist/js13k/
set -euo pipefail

SRC="${1:-src/index.html}"
LIMIT=13312   # 13 * 1024
ROOT="$(cd "$(dirname "$0")" && pwd)"
ZIP="$ROOT/js13k-game.zip"
RRBEST="${RRBEST:-1}"
# Nombre de contextes roadroller. Moins de contextes = zip plus gros, mais
# decodage bien plus rapide au chargement, ce que la machine de test du site
# mesure. Mesures sur ce jeu, apres advzip :
#   x12 (defaut roadroller) 12651 o  6139 ms sous bridage x8
#   x9                      12747 o  4814 ms
#   x8                      12808 o  3945 ms
#   x6                      13155 o  3412 ms
RRSEL="${RRSEL:-12}"
FAST="${FAST:-0}"

if [ ! -f "$SRC" ]; then echo "Source introuvable: $SRC"; exit 1; fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# Outils : terser + roadroller. On les cherche dans plusieurs emplacements
# usuels ; si absents, on installe en global (compatible avec les .npmrc qui
# imposent un prefix). En dernier recours on se rabat sur npx.
find_tool(){  # $1 = nom du binaire
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
  echo "Installation de terser + roadroller (npm -g) ..."
  npm install -g terser roadroller >/dev/null 2>&1 || \
    npm install terser roadroller >/dev/null 2>&1 || \
    echo "ATTENTION: npm install a echoue. Si le reseau est restreint, autorisez registry.npmjs.org."
  TERSER="$(find_tool terser || echo "npx --yes terser")"
  ROADROLLER="$(find_tool roadroller || echo "npx --yes roadroller")"
fi

# 1) Extraire le contenu du dernier <script>...</script> et le <style>.
python3 - "$SRC" "$WORK" <<'PY'
import re, sys
src, work = sys.argv[1], sys.argv[2]
html = open(src, encoding='utf-8').read()
m = re.search(r'<script>(.*)</script>', html, re.S)
if not m:
    print("Aucun bloc <script> trouve"); sys.exit(1)
open(work + '/game.js', 'w', encoding='utf-8').write(m.group(1))
# Recupere le <style> pour le reinjecter dans le HTML minimal
sm = re.search(r'<style>(.*?)</style>', html, re.S)
open(work + '/style.css', 'w', encoding='utf-8').write(sm.group(1) if sm else '')
PY

# 2) Verifier la syntaxe puis minifier avec terser.
#    Pas de booleans_as_integers : il reecrit true en 1 et le SDK Wavedash,
#    qui valide les types de ses arguments, rejette alors tous les appels en
#    silence. Voir README, section Wavedash.
node --check "$WORK/game.js" && echo "Syntaxe JS: OK"
$TERSER "$WORK/game.js" -c passes=3,unsafe=true -m toplevel=true -o "$WORK/game.min.js" 2>/dev/null \
  || cp "$WORK/game.js" "$WORK/game.min.js"
echo "JS minifie (terser): $(wc -c < "$WORK/game.min.js") octets"

# 3) roadroller. Sa recherche de parametres est aleatoire : le meme source
#    sort entre 16431 et 16475 octets d'un tirage a l'autre. RRBEST=n relance
#    n fois et garde le plus petit.
if [ "$FAST" = "1" ]; then
  echo "FAST=1 : roadroller saute."
  cp "$WORK/game.min.js" "$WORK/game.rr.js"
elif [ -n "$ROADROLLER" ]; then
  BESTSZ=0
  for i in $(seq 1 "$RRBEST"); do
    if $ROADROLLER "$WORK/game.min.js" -S "x$RRSEL" -o "$WORK/cand.js" 2>/dev/null; then
      SZ=$(wc -c < "$WORK/cand.js")
      if [ "$BESTSZ" = "0" ] || [ "$SZ" -lt "$BESTSZ" ]; then BESTSZ=$SZ; cp "$WORK/cand.js" "$WORK/game.rr.js"; fi
      [ "$RRBEST" -gt 1 ] && printf "  tirage %s/%s: %s octets\n" "$i" "$RRBEST" "$SZ"
    fi
  done
  if [ "$BESTSZ" = "0" ]; then
    echo "roadroller indisponible: on garde la version terser."
    cp "$WORK/game.min.js" "$WORK/game.rr.js"
  else
    echo "JS roadrolled: $BESTSZ octets ($RRSEL contextes, meilleur de $RRBEST)"
  fi
else
  echo "roadroller indisponible: on garde la version terser."
  cp "$WORK/game.min.js" "$WORK/game.rr.js"
fi

# 4) Reconstruire un HTML minimal autour du JS compresse.
python3 - "$WORK" <<'PY'
import sys
work = sys.argv[1]
css = open(work + '/style.css', encoding='utf-8').read().strip()
js = open(work + '/game.rr.js', encoding='utf-8').read()
style = ('<style>' + css + '</style>') if css else ''
html = '<!doctype html><meta charset=utf-8><title>Rainbow Gallop</title>' + style + '<canvas id=c></canvas><script>' + js + '</script>'
open(work + '/out.html', 'w', encoding='utf-8').write(html)
PY

# Mode rapide : livrable isole, on ne touche pas aux sorties officielles.
if [ "$FAST" = "1" ]; then
  mkdir -p "$ROOT/dist/fast"
  cp "$WORK/out.html" "$ROOT/dist/fast/index.html"
  echo "FAST: $ROOT/dist/fast/index.html ($(wc -c < "$ROOT/dist/fast/index.html") octets, hors budget). ZIP inchange."
  exit 0
fi

# 5) Zipper dans le temporaire, verifier, puis seulement remplacer les livrables.
cp "$WORK/out.html" "$WORK/index.html"
( cd "$WORK" && zip -9 -q new.zip index.html )
# advzip recompresse le meme contenu avec zopfli : ~2,7 % rendus gratuitement,
# le contenu extrait reste identique bit pour bit (verifie plus bas).
if command -v advzip >/dev/null 2>&1; then
  Z0=$(wc -c < "$WORK/new.zip")
  advzip -z -4 -q "$WORK/new.zip" 2>/dev/null || true
  Z1=$(wc -c < "$WORK/new.zip")
  if [ "$Z1" -lt "$Z0" ]; then echo "advzip: $Z0 -> $Z1 octets (-$((Z0 - Z1)))"; fi
else
  echo "advzip absent (brew install advancecomp) : ~2,7 % de l'archive non recuperes."
fi
Z=$(wc -c < "$WORK/new.zip")
# Le contenu extrait doit etre bit pour bit la page construite.
( cd "$WORK" && mkdir -p verify && unzip -qo new.zip -d verify && cmp -s verify/index.html out.html ) \
  || { echo "ECHEC: le contenu du zip differe de la page construite."; exit 1; }

mkdir -p "$ROOT/dist/js13k" "$ROOT/dist/wavedash"
cp "$WORK/out.html" "$ROOT/dist/js13k/index.html"
# Cible Wavedash : la source telle quelle, sans minification ni roadroller.
cp "$SRC" "$ROOT/dist/wavedash/index.html"
cp "$WORK/new.zip" "$ZIP"

MARGIN=$((LIMIT - Z))
echo "----------------------------------------"
echo "ZIP final:  $Z octets  /  $LIMIT max"
if [ "$Z" -le "$LIMIT" ]; then
  echo "DANS LE BUDGET. Marge: $MARGIN octets."
else
  echo "DEPASSEMENT de $((Z - LIMIT)) octets. Reduire le code ou verifier roadroller."
fi
echo "Livrables:"
echo "  - $ZIP                        (a soumettre)"
echo "  - $ROOT/dist/js13k/index.html     (apercu compresse)"
echo "  - $ROOT/dist/wavedash/index.html  (cible Wavedash, non compressee)"
[ "$Z" -le "$LIMIT" ]
