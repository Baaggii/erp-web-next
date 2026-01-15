#!/usr/bin/env bash

ERP_TARGET="${ERP_TARGET:-$HOME/erp.mgt.mn}"
WEB_TARGET="${WEB_TARGET:-$HOME/public_html}"
PM2_NAME="${PM2_NAME:-erp-app}"

set -e

echo "Installing dependencies…"
rm -rf node_modules
npm install

echo "Building frontends…"
npm run build:homepage
npm run build:erp

mkdir -p "$ERP_TARGET" "$WEB_TARGET"
cp src/erp.mgt.mn/.htaccess "$ERP_TARGET/.htaccess"
cp src/homepage/.htaccess "$WEB_TARGET/.htaccess"

pm2 describe "$PM2_NAME" >/dev/null 2>&1 \
  && pm2 restart "$PM2_NAME" --update-env \
  || pm2 start api-server/server.js --name "$PM2_NAME"

pm2 save
echo "Deployment complete"
