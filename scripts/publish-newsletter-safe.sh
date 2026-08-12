#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 3 ]]; then
  cat >&2 <<'EOF'
Usage:
  scripts/publish-newsletter-safe.sh <newsletter-jid-or-link> <image-path> <text-file>

Environment:
  WA_PUBLISH_LIVE=true|false   default: true
EOF
  exit 64
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="$1"
IMAGE_PATH="$2"
TEXT_FILE="$3"
LIVE="${WA_PUBLISH_LIVE:-true}"
SERVICE="whatsapp-guardian.service"
WAS_ACTIVE=0

if [[ ! -f "$IMAGE_PATH" ]]; then
  echo "BLOCK_IMAGE_NOT_FOUND: $IMAGE_PATH" >&2
  exit 66
fi

if [[ ! -f "$TEXT_FILE" ]]; then
  echo "BLOCK_TEXT_FILE_NOT_FOUND: $TEXT_FILE" >&2
  exit 66
fi

if [[ ! -s "$TEXT_FILE" ]] || [[ -z "$(tr -d '[:space:]' < "$TEXT_FILE")" ]]; then
  echo "BLOCK_CAPTION_REQUIRED: WhatsApp Channel image posts must include a non-empty caption/description" >&2
  exit 65
fi

cleanup() {
  local status=$?
  if [[ "$WAS_ACTIVE" == "1" ]]; then
    systemctl start "$SERVICE" >/dev/null
  fi
  exit "$status"
}
trap cleanup EXIT

cd "$ROOT"

if systemctl is-active --quiet "$SERVICE"; then
  WAS_ACTIVE=1
  systemctl stop "$SERVICE"
fi

WA_NEWSLETTER_JID="$TARGET" \
WA_PUBLISH_IMAGE="$IMAGE_PATH" \
WA_PUBLISH_TEXT="$(cat "$TEXT_FILE")" \
WA_PUBLISH_LIVE="$LIVE" \
npm run newsletter:publish
