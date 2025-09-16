#!/usr/bin/env bash
set -euo pipefail

# --- CONFIG ---
APP_DIR="$HOME/apps/erp-web-next"
DOCROOT_ERP="$HOME/erp.mgt.mn"
DOCROOT_HOME="$HOME/public_html"
HTACCESS_ERP_SRC="$APP_DIR/src/erp.mgt.mn/.htaccess"
HTACCESS_HOME_SRC="$APP_DIR/src/homepage/.htaccess"
PM2_APP="erp-app"
NODE_BIN="$(command -v node || true)"
NPM_BIN="$(command -v npm || true)"

echo "==> Starting deploy in: $APP_DIR"
cd "$APP_DIR"

# 0) Safe umask so new files/dirs are world-readable
umask 022

# 1) Ensure we’re not in prod-only mode during build
export NPM_CONFIG_PRODUCTION=false
export NODE_ENV=production

# 2) Clean install (prefer ci if lockfile is correct; fallback to install)
rm -rf node_modules
if [ -f package-lock.json ]; then
  echo "==> npm ci (using existing lockfile)"
  if ! npm ci --no-audit --no-fund; then
    echo "!! npm ci failed, falling back to npm install"
    npm install --no-audit --no-fund
  fi
else
  echo "==> No lockfile; running npm install"
  npm install --no-audit --no-fund
fi

# 3) Build homepage and ERP SPA
echo "==> Building homepage"
npm run build:homepage
echo "==> Building ERP"
npm run build:erp

# 4) Sync built assets to docroots (delete old hashes)
#    Vite already wrote straight into these paths, but rsync keeps things clean if you ever change outputs.
# rsync -rtv --delete "$DOCROOT_HOME/" "$DOCROOT_HOME/"
# rsync -rtv --delete "$DOCROOT_ERP/"  "$DOCROOT_ERP/"
# Instead of rsync
cp -rf "$APP_DIR/dist-homepage/"* "$DOCROOT_HOME/"
cp -rf "$APP_DIR/dist-erp/"*       "$DOCROOT_ERP/"


# 5) Ensure correct .htaccess files (subdomain vs /erp/ base rules)
install -m 0644 "$HTACCESS_HOME_SRC" "$DOCROOT_HOME/.htaccess"
install -m 0644 "$HTACCESS_ERP_SRC"  "$DOCROOT_ERP/.htaccess"

# 6) Fix ownership & permissions to prevent 403s
echo "==> Fixing ownership & permissions"
chmod 711 "$HOME"                            # Apache must traverse home dir
chown -R mgtmn:mgtmn "$DOCROOT_HOME" "$DOCROOT_ERP"
find "$DOCROOT_HOME" -type d -exec chmod 755 {} \;
find "$DOCROOT_HOME" -type f -exec chmod 644 {} \;
find "$DOCROOT_ERP"  -type d -exec chmod 755 {} \;
find "$DOCROOT_ERP"  -type f -exec chmod 644 {} \;

# 7) After build, keep only runtime deps for the Node server
echo "==> Pruning devDependencies (keeping runtime deps)"
export NPM_CONFIG_PRODUCTION=true
npm prune --omit=dev || true

# 8) Restart PM2 app
echo "==> Restarting PM2 app: $PM2_APP"
pm2 restart "$PM2_APP" --update-env
pm2 ls

# 9) Health checks
echo "==> Health checks"
urls=(
  "https://erp.mgt.mn/"
  "https://erp.mgt.mn/#/login"
  "https://erp.mgt.mn/api/healthz"
  "http://127.0.0.1:3002/api/healthz"
)
for u in "${urls[@]}"; do
  code=$(curl -o /dev/null -s -w "%{http_code}" -I "$u")
  echo "$code  $u"
done

echo "==> Deploy complete."
