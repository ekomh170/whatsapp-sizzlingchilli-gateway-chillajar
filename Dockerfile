# Dockerfile untuk WhatsApp Gateway ChillAjar
FROM ghcr.io/puppeteer/puppeteer:latest

USER root

# Set working directory
WORKDIR /app

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_CACHE_DIR=/home/pptruser/.cache/puppeteer

# Copy package files
COPY package*.json ./

# Install dependencies dengan fallback ke npm install
# npm ci lebih strict, jika gagal fallback ke npm install
RUN npm ci --omit=dev || npm install --omit=dev

# Copy application files
COPY . .

# Copy and set permissions for entrypoint
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh \
    && mkdir -p /app/.wwebjs_auth /app/.wwebjs_cache /app/sessions /app/media /app/logs \
    && chown -R pptruser:pptruser /app

# Switch to non-root user
USER pptruser

# Expose port
EXPOSE 8086

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=5 \
    CMD node -e "require('http').get('http://localhost:8086/', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start application via entrypoint
ENTRYPOINT ["/entrypoint.sh"]
