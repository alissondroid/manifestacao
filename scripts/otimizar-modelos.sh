#!/usr/bin/env bash
# Converte as texturas dos modelos (PNG/JPEG) para WebP, sem mexer na geometria nem nos ossos.
# Uso: bash scripts/otimizar-modelos.sh   (precisa de rede: baixa o gltf-transform e o sharp via npx)
set -euo pipefail
cd "$(dirname "$0")/../public/models"
for f in readyplayer.me; do
  tmp="$(mktemp --suffix=.glb)"
  npx --yes -p @gltf-transform/cli@4 -p sharp gltf-transform webp "$f.glb" "$tmp" --quality 85 --slots "*"
  mv "$tmp" "$f.glb"
done
ls -l *.glb
