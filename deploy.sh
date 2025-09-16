#!/usr/bin/env bash
set -e

APP_DIR="$HOME/apps/erp-web-next"
DOCROOT_HOME="$HOME/public_html"
DOCROOT_ERP="$HOME/erp.mgt.mn"

cd "$APP_DIR"
export NPM_CONFIG_PRODUCTION=false

# Install deps and build
npm ci --no-audit --no-fund
npm run build:homepage
npm run build:erp

# Copy only .htaccess files into docroots
cp src/homepage/.htaccess "$DOCROOT_HOME/.htaccess"
cp src/erp.mgt.mn/.htaccess "$DOCROOT_ERP/.htaccess"

# Fix ownership and permissions
chmod 711 "$HOME"
chown -R mgtmn:mgtmn "$DOCROOT_HOME" "$DOCROOT_ERP"
find "$DOCROOT_HOME" -type d -exec chmod 755 {} \;
find "$DOCROOT_HOME" -type f -exec chmod 644 {} \;
find "$DOCROOT_ERP"  -type d -exec chmod 755 {} \;
find "$DOCROOT_ERP"  -type f -exec chmod 644 {} \;

# Prune dev dependencies for runtime
export NPM_CONFIG_PRODUCTION=true
npm prune --omit=dev || true

# Restart your PM2 app
pm2 restart erp-app --update-env
