#!/usr/bin/env bash

PM2_NAME="${PM2_NAME:-erp-app}"

set -e

echo "Restarting backend only..."
pm2 restart "$PM2_NAME" --update-env
pm2 save

echo "Backend restart complete"
