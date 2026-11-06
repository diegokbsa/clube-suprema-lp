#!/usr/bin/env bash
# Renderiza as peças com o Edge sem tela no tamanho exato. Uso: bash render.sh [id ...]  (sem id = todas)
set -u
AQUI="$(cd "$(dirname "$0")" && pwd)"
SAIDA="$(dirname "$AQUI")"
EDGE="/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
PERFIL="${TMP:-/tmp}/hotpoker-edge-perfil"
declare -A TAM=( [feed]=1080,1350 [story]=1080,1920 [quadrado]=1080,1080 )
TODAS="f01-boas-vindas f02-como-entrar f03-pix-dois-sentidos f04-texas-vs-omaha f05-ranking-de-maos f06-grade-exemplo f07-sem-senha f08-redes
s01-salve-os-numeros s02-suporte-24h s03-limite-antes-de-sentar s04-como-entrar s05-enquete-texas-omaha s06-site-no-ar
q01-anota-ai q02-posicoes-na-mesa q03-falas-da-mesa q04-quiz-qual-mais-forte
c01-primeira-compra-1 c01-primeira-compra-2 c01-primeira-compra-3 c02-glossario-1 c02-glossario-2 c02-glossario-3"
IDS="${*:-$TODAS}"
BASE="file:///$(cygpath -m "$AQUI")"
for id in $IDS; do
  case "$id" in f*|c*|k*) fmt=feed;; s*) fmt=story;; q*) fmt=quadrado;; esac
  "$EDGE" --headless=new --disable-gpu --hide-scrollbars --user-data-dir="$PERFIL" --virtual-time-budget=8000 \
    --window-size="${TAM[$fmt]}" --screenshot="$(cygpath -m "$SAIDA")/$id.png" "$BASE/$fmt.html?id=$id" >/dev/null 2>&1
  echo "ok $id ($fmt ${TAM[$fmt]})"
done
