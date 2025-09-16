#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$HOME/apps/erp-web-next"
DOCROOT_ERP="$HOME/erp.mgt.mn"
DOCROOT_HOME="$HOME/public_html"
HTACCESS_ERP_SRC="$APP_DIR/src/erp.mgt.mn/.htaccess"
HTACCESS_HOME_SRC="$APP_DIR/src/homepage/.htaccess"
PM2_APP="erp-app"

cd "$APP_DIR"
umask 022
export NODE_ENV=production
export NPM_CONFIG_PRODUCTION=false   # build needs devDeps

# Clean install (prefer ci)
rm -rf node_modules
if [ -f package-lock.json ]; then
  npm ci --no-audit --no-fund || npm install --no-audit --no-fund
else
  npm install --no-audit --no-fund
fi

# Build
npm run build:homepage
npm run build:erp

# Ensure docroots exist
mkdir -p "$DOCROOT_HOME" "$DOCROOT_ERP"

# Since Vite already emitted into those docroots, we just ensure perms/htaccess.
# If you ever change output folders, use cp -rf from your build dirs to the docroots here.

# .htaccess (subdomain + homepage)
install -m 0644 "$HTACCESS_HOME_SRC" "$DOCROOT_HOME/.htaccess"
# Use the dual-rule version that supports /api and /erp/api
cat > "$DOCROOT_ERP/.htaccess" <<'HTACCESS'
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /

  RewriteRule ^api/(.*)$ http://127.0.0.1:3002/api/$1 [P,L,QSA]
  RewriteRule ^erp/api/(.*)$ http://127.0.0.1:3002/api/$1 [P,L,QSA]

  RewriteCond %{REQUEST_FILENAME} -f [OR]
  RewriteCond %{REQUEST_FILENAME} -d
  RewriteRule ^ - [L]

  RewriteRule . /index.html [L]
</IfModule>

Options -Indexes
HTACCESS
chmod 0644 "$DOCROOT_ERP/.htaccess"

# Permissions to avoid 403
chmod 711 "$HOME"
chown -R mgtmn:mgtmn "$DOCROOT_HOME" "$DOCROOT_ERP"
find "$DOCROOT_HOME" -type d -exec chmod 755 {} \;
find "$DOCROOT_HOME" -type f -exec chmod 644 {} \;
find "$DOCROOT_ERP"  -type d -exec chmod 755 {} \;
find "$DOCROOT_ERP"  -type f -exec chmod 644 {} \;

# Runtime: slim deps (optional if you only run Node API here)
export NPM_CONFIG_PRODUCTION=true
npm prune --omit=dev || true

# Restart api
pm2 restart "$PM2_APP" --update-env

# Health
for u in \
  "https://erp.mgt.mn/" \
  "https://erp.mgt.mn/#/login" \
  "https://erp.mgt.mn/api/healthz" \
  "https://erp.mgt.mn/erp/api/healthz" \
  "http://127.0.0.1:3002/api/healthz"
do
  code=$(curl -o /dev/null -s -w "%{http_code}" -I "$u")
  echo "$code  $u"
done

echo "Deploy done."
