'use strict';

require('dotenv').config();

const app = require('./src/app');
const { log } = require('./src/config/logger');
const { connectToWhatsApp, state } = require('./src/services/whatsapp');

const port = process.env.PORT || 8086;

const server = app.listen(port, () => {
    log.info(`Gateway listening on http://localhost:${port}`);
    connectToWhatsApp().catch(err => log.error('Initial WhatsApp connect failed', { error: err.message }));
});

async function gracefulShutdown(signal) {
    log.info(`${signal} received: shutting down`);
    server.close(async () => {
        if (state.sock) {
            try { state.sock.end(undefined); } catch (_) { /* ignore */ }
        }
        process.exit(0);
    });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));
process.on('uncaughtException',  err    => log.error('Uncaught Exception',  { error: err.message, stack: err.stack }));
process.on('unhandledRejection', reason => log.error('Unhandled Rejection', { reason: String(reason) }));
