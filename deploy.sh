rm -rf node_modules
npm install -g npm@11.6.0
npm run build:homepage
npm run build:erp
cp src/erp.mgt.mn/.htaccess ~/erp.mgt.mn/.htaccess
cp src/homepage/.htaccess ~/public_html/.htaccess
npm prune --omit=dev
pm2 restart erp-app --update-env
