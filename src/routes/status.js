'use strict';

const { Router } = require('express');
const { state, MAX_RECONNECT_ATTEMPTS } = require('../services/whatsapp');

const router = Router();

router.get('/', (req, res) => {
    res.json({
        service: 'WhatsApp Gateway ChillAjar',
        engine: 'Baileys (no Puppeteer)',
        status: 'running',
        ready: state.isClientReady,
        version: '2.0.0',
        endpoints: { status: '/status', health: '/health', qr: '/qr', sendMessage: '/send-message' },
    });
});

router.get('/status', (req, res) => {
    if (!state.isClientReady || !state.sock) {
        return res.status(503).json({
            status: false,
            ready: false,
            message: 'WhatsApp client belum siap',
            reconnectAttempts: state.reconnectAttempts,
            maxAttempts: MAX_RECONNECT_ATTEMPTS,
        });
    }
    const user = state.sock.user;
    res.json({
        status: true,
        ready: true,
        message: 'WhatsApp client is ready',
        clientInfo: { wid: user?.id || '-', pushname: user?.name || '-', platform: 'Baileys' },
    });
});

router.get('/health', (req, res) => {
    const health = {
        uptime: process.uptime(),
        message: state.isClientReady ? 'OK' : 'WhatsApp client not ready',
        timestamp: Date.now(),
        whatsappReady: state.isClientReady,
        reconnectAttempts: state.reconnectAttempts,
        engine: 'Baileys',
    };
    res.status(state.isClientReady ? 200 : 503).json(health);
});

module.exports = router;
