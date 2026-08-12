#!/usr/bin/env bash
set -euo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v node >/dev/null 2>&1 || [[ "$(node -p "Number(process.versions.node.split('.')[0])")" -lt 20 ]]; then
  echo "CanalBot requiere Node.js 20 o superior."
  exit 1
fi

mkdir -p auth/main data/media-cache logs
[[ -f .env ]] || cp .env.example .env
echo "Instalando dependencias..."
npm install

if [[ "${SKIP_MIGRATE:-false}" != "true" ]]; then npm run migrate; fi
if [[ "${SKIP_TESTS:-false}" != "true" ]]; then npm test; fi

cat <<'EOF'

CanalBot quedó instalado.

1. Configura MYSQL_HOST, MYSQL_DATABASE, MYSQL_USER y MYSQL_PASSWORD en .env.
2. Vincula WhatsApp con: npm run pair:qr
   O usa código: npm run pair:code -- --phone 5215551234567
3. Tras vincular, cambia WA_ENABLE_CONNECT=true en .env.
4. Inicia CanalBot: npm start

EOF
