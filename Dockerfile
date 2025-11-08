# Dockerfile untuk WhatsApp Gateway ChillAjar
FROM node:18-slim

# Install dependencies untuk Puppeteer
RUN apt-get update && apt-get install -y \
    chromium \
    chromium-sandbox \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libgdk-pixbuf2.0-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    wget \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies dengan fallback ke npm install
# npm ci lebih strict, jika gagal fallback ke npm install
RUN npm ci --only=production || npm install --production

# Copy application files
COPY . .

# Copy and set permissions for entrypoint
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Create directories for sessions and media
RUN mkdir -p /app/.wwebjs_auth /app/.wwebjs_cache /app/sessions /app/media /app/logs

# Set permissions
RUN chown -R node:node /app

# Switch to non-root user
USER node

# Expose port
EXPOSE 8086

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=5 \
    CMD node -e "require('http').get('http://localhost:8086/', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start application via entrypoint
ENTRYPOINT ["/entrypoint.sh"]
