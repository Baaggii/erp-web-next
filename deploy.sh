#!/usr/bin/env bash

# Set defaults for test environment; override for production via env vars
ERP_TARGET="${ERP_TARGET:-$HOME/erp.mgt.mn}"
WEB_TARGET="${WEB_TARGET:-$HOME/public_html}"
PM2_NAME="${PM2_NAME:-erp-app}"

set -e  # stop on error

echo "Building frontends…"
rm -rf node_modules
npm install -g npm@11.7.0
npm run build:homepage
npm run build:erp

# Copy .htaccess or other static files (if needed)
mkdir -p "$ERP_TARGET" "$WEB_TARGET"
cp src/erp.mgt.mn/.htaccess "$ERP_TARGET/.htaccess"
cp src/homepage/.htaccess "$WEB_TARGET/.htaccess"

# Optionally prune dev dependencies
# npm prune --omit=dev

# Restart the appropriate PM2 process
# pm2 restart "$PM2_NAME" --update-env

pm2 describe "$PM2_NAME" >/dev/null 2>&1 \
  && pm2 restart "$PM2_NAME" --update-env \
  || pm2 start api-server/server.js --name "$PM2_NAME"

echo "Deployed ERP to $ERP_TARGET and homepage to $WEB_TARGET using process $PM2_NAME"
