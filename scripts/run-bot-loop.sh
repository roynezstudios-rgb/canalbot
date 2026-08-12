#!/usr/bin/env bash
set -u

cd "$(dirname "$0")/.."
mkdir -p logs

while true; do
  echo "[$(date -Is)] starting whatsapp guardian" >> logs/bot-main.log
  WA_ENABLE_CONNECT=true \
    WA_DRY_RUN=false \
    WA_PAIRING_PHONE= \
    WA_AUTH_DIR=auth/main \
    WA_SESSION_NAME=main \
    WA_QR_IMAGE_PATH=data/latest-qr.png \
    npm start >> logs/bot-main.log 2>&1
  code=$?
  echo "[$(date -Is)] whatsapp guardian exited with code ${code}; restarting in 5s" >> logs/bot-main.log
  sleep 5
done
