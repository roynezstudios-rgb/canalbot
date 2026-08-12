#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

edition="${1:-}"
skip_migrate="${SKIP_MIGRATE:-false}"
skip_tests="${SKIP_TESTS:-false}"

usage() {
  cat <<'USAGE'
Uso:
  npm run setup -- canalbot
  npm run setup -- guardianbot
  npm run setup -- suite

Variables opcionales:
  SKIP_MIGRATE=true npm run setup -- suite
  SKIP_TESTS=true npm run setup -- suite
USAGE
}

if [[ -z "$edition" ]]; then
  echo "Elige edicion:"
  echo "  1) canalbot"
  echo "  2) guardianbot"
  echo "  3) suite"
  read -r -p "Opcion [1-3]: " option
  case "$option" in
    1) edition="canalbot" ;;
    2) edition="guardianbot" ;;
    3) edition="suite" ;;
    *) echo "Opcion invalida"; usage; exit 1 ;;
  esac
fi

case "$edition" in
  canalbot|guardianbot|suite) ;;
  *) echo "Edicion invalida: $edition"; usage; exit 1 ;;
esac

if ! command -v node >/dev/null 2>&1; then
  echo "Falta Node.js. Instala Node.js 20 o superior."
  exit 1
fi

node_major="$(node -p "Number(process.versions.node.split('.')[0])")"
if [[ "$node_major" -lt 20 ]]; then
  echo "Node.js debe ser 20 o superior. Version actual: $(node -v)"
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "Falta npm."
  exit 1
fi

mkdir -p auth/main data/media-cache logs

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Creado .env desde .env.example"
fi

set_env() {
  local key="$1"
  local value="$2"
  if grep -q "^${key}=" .env; then
    sed -i "s|^${key}=.*|${key}=${value}|" .env
  else
    printf '%s=%s\n' "$key" "$value" >> .env
  fi
}

set_env WA_ENABLE_CONNECT false
set_env WA_AUTH_DIR auth/main
set_env WA_SESSION_NAME main
set_env WA_QR_IMAGE_PATH data/latest-qr.png
set_env WA_DRY_RUN true

case "$edition" in
  canalbot)
    set_env CANALBOT_ENABLE true
    set_env GUARDIAN_ENABLE false
    ;;
  guardianbot)
    set_env CANALBOT_ENABLE false
    set_env GUARDIAN_ENABLE true
    set_env GUARDIAN_DRY_RUN true
    set_env GUARDIAN_OBSERVE_ONLY true
    set_env GUARDIAN_DESTRUCTIVE_ACTIONS false
    ;;
  suite)
    set_env CANALBOT_ENABLE true
    set_env GUARDIAN_ENABLE true
    set_env GUARDIAN_DRY_RUN true
    set_env GUARDIAN_OBSERVE_ONLY true
    set_env GUARDIAN_DESTRUCTIVE_ACTIONS false
    ;;
esac

echo "Instalando dependencias..."
npm install

if [[ "$skip_migrate" != "true" ]]; then
  echo "Aplicando migraciones..."
  npm run migrate
fi

if [[ "$skip_tests" != "true" ]]; then
  echo "Ejecutando pruebas..."
  npm test
fi

cat <<EOF

Instalacion base terminada.
Edicion configurada: ${edition}

Antes de conectar WhatsApp revisa .env:
  MYSQL_HOST, MYSQL_PORT, MYSQL_DATABASE, MYSQL_USER, MYSQL_PASSWORD
  WA_PAIRING_PHONE si quieres codigo de vinculacion

Para vincular por QR:
  npm run pair:qr

Para vincular por codigo:
  npm run pair:code -- --phone 5215551234567

Despues de vincular:
  1. Cambia WA_ENABLE_CONNECT=true en .env.
  2. Ejecuta: npm start

Para dejarlo como servicio Linux lee docs/INSTALACION.md.
EOF
