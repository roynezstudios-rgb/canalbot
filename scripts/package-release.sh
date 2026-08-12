#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

name="${1:-canalbot-0.2.1}"
release_dir="release/${name}"
zip_path="release/${name}.zip"

rm -rf "$release_dir" "$zip_path"
mkdir -p "$release_dir"

rsync -a \
  --exclude '.env' \
  --exclude '.git/' \
  --exclude 'auth/' \
  --exclude 'data/' \
  --exclude 'logs/' \
  --exclude 'node_modules/' \
  --exclude 'release/' \
  --exclude 'backups/' \
  --exclude 'graphify-out/' \
  --exclude 'tmp/' \
  --exclude 'tasks/' \
  --exclude 'diagnostico-vinculacion-*.txt' \
  --exclude 'ARQUITECTURA_FLUJO_CANALBOT.txt' \
  --exclude 'scripts/pairing-panel.js' \
  --exclude '*.bak*' \
  --exclude 'temp_*' \
  ./ "$release_dir/"

(cd release && zip -qr "${name}.zip" "$name")

echo "$zip_path"
