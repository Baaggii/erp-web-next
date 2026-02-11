#!/usr/bin/env bash

PM2_NAME="${PM2_NAME:-erp-app}"
BACKEND_ENTRY="${BACKEND_ENTRY:-api-server/server.js}"

set -e

echo "Installing dependencies…"
rm -rf node_modules
npm install

echo "Deploying backend process…"
pm2 describe "$PM2_NAME" >/dev/null 2>&1 \
  && pm2 restart "$PM2_NAME" --update-env \
  || pm2 start "$BACKEND_ENTRY" --name "$PM2_NAME"

pm2 save
echo "Backend deployment complete"
