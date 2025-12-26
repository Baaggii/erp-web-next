#!/usr/bin/env bash
set -e

echo "===== VPS DEPLOY START ====="

cd /opt/erp-web-next

echo "[1] Pulling latest ERP code..."
sudo git pull origin master

echo "[2] Installing root dependencies..."
sudo npm install

echo "[3] Building ERP Frontend (VPS config)..."
sudo npx vite build --config vite.vps.config.js

echo "[4] Building Homepage (VPS config)..."
sudo npx vite build --config vite.vps.home.config.js

echo "[5] Deploying ERP Frontend to erpsys.mgt.mn..."
sudo rm -rf /www/wwwroot/erpsys.mgt.mn/*
sudo cp -r dist-erp/* /www/wwwroot/erpsys.mgt.mn/

echo "[6] Deploying Homepage to www.mgt.mn..."
sudo rm -rf /www/wwwroot/www.mgt.mn/*
sudo cp -r dist-home/* /www/wwwroot/www.mgt.mn/

echo "[7] Restarting backend API with PM2..."
pm2 restart erp-api || pm2 start api-server/server.js --name erp-api
pm2 save

echo ""
echo "===== DEPLOY COMPLETE ====="
echo " ERP UI: https://erpsys.mgt.mn"
echo " Homepage: https://www.mgt.mn"
echo " Backend (PM2 Name): erp-api"
echo "==========================================="
