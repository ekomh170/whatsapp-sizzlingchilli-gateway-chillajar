#!/bin/sh
# Entrypoint script untuk mencegah startup issues

set -e

echo "==================================="
echo "WhatsApp Gateway Starting..."
echo "==================================="

# Pastikan directories exist
mkdir -p /app/.wwebjs_auth /app/.wwebjs_cache /app/media /app/logs

# Check Chromium availability
if ! command -v chromium > /dev/null 2>&1; then
    echo "ERROR: Chromium not found!"
    exit 1
fi

echo "Chromium found: $(chromium --version)"

# Check Node.js version
echo "Node.js version: $(node --version)"

# Check npm packages
if [ ! -d "node_modules" ]; then
    echo "ERROR: node_modules not found!"
    exit 1
fi

echo "Dependencies OK"

# Wait a bit for Docker networking to stabilize
sleep 2

echo "Starting application..."
exec npm start
