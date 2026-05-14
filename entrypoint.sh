#!/bin/sh
# Entrypoint script untuk mencegah startup issues

set -e

echo "==================================="
echo "WhatsApp Gateway Starting..."
echo "==================================="

# Pastikan directories exist
mkdir -p /app/.wwebjs_auth /app/.wwebjs_cache /app/media /app/logs

# Check Chromium availability (PATH or Puppeteer cache)
CHROME_PATH=""
if command -v chromium > /dev/null 2>&1; then
    CHROME_PATH="$(command -v chromium)"
elif [ -n "${PUPPETEER_EXECUTABLE_PATH:-}" ] && [ -x "$PUPPETEER_EXECUTABLE_PATH" ]; then
    CHROME_PATH="$PUPPETEER_EXECUTABLE_PATH"
else
    CHROME_PATH="$(find /home/pptruser/.cache/puppeteer -type f -path "*/chrome-linux64/chrome" -print -quit 2>/dev/null || true)"
fi

if [ -z "$CHROME_PATH" ]; then
    echo "ERROR: Chromium not found!"
    exit 1
fi

export PUPPETEER_EXECUTABLE_PATH="$CHROME_PATH"
echo "Chromium found: $($CHROME_PATH --version)"

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
