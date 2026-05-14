#!/bin/sh
set -e

echo "==================================="
echo "WhatsApp Gateway ChillAjar Starting"
echo "==================================="

mkdir -p /app/auth_info_baileys /app/logs

echo "Node.js: $(node --version)"

if [ ! -d "node_modules" ]; then
    echo "ERROR: node_modules not found!"
    exit 1
fi

echo "Starting application..."
exec npm start
