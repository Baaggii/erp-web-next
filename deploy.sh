rm -rf node_modules
npm install --no-progress
npm run build:homepage
npm run build:erp
cp src/erp.mgt.mn/.htaccess ~/erp.mgt.mn/.htaccess
cp src/homepage/.htaccess ~/public_html/.htaccess
pm2 restart erp-app --update-env
