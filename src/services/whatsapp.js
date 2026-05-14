'use strict';

const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, Browsers, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');
const { log } = require('../config/logger');

const AUTH_FOLDER = path.join(__dirname, '../../auth_info_baileys');
const QR_PATH = path.join(__dirname, '../../wa-qr.png');
const MAX_RECONNECT_ATTEMPTS = 5;

const state = {
    sock: null,
    isClientReady: false,
    reconnectAttempts: 0,
};

function validateClientReady() {
    if (!state.isClientReady || !state.sock) {
        return { valid: false, status: 503, message: 'WhatsApp client belum siap, silakan scan QR code atau tunggu beberapa saat.' };
    }
    return { valid: true };
}

async function connectToWhatsApp() {
    const { state: authState, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
    const { version } = await fetchLatestBaileysVersion();
    log.info(`Menggunakan WhatsApp Web versi ${version.join('.')}`);

    state.sock = makeWASocket({
        version,
        auth: authState,
        browser: Browsers.ubuntu('Chrome'),
        logger: pino({ level: 'silent' }),
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 30000,
        keepAliveIntervalMs: 10000,
    });

    state.sock.ev.on('creds.update', saveCreds);

    state.sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            log.info('QR code baru tersedia, silakan scan');
            QRCode.toFile(QR_PATH, qr, { overwrite: true }, err => {
                if (err) log.error('Gagal simpan QR code', { error: err.message });
                else log.info('QR code disimpan ke wa-qr.png');
            });
            try { require('qrcode-terminal').generate(qr, { small: true }); } catch (_) { /* ignore */ }
        }

        if (connection === 'close') {
            state.isClientReady = false;
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            log.warn('WhatsApp disconnected', { statusCode, shouldReconnect });

            if (shouldReconnect && state.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                state.reconnectAttempts++;
                const delay = 5000 * state.reconnectAttempts;
                log.info(`Reconnecting in ${delay / 1000}s...`, { attempt: `${state.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}` });
                setTimeout(() => connectToWhatsApp().catch(err => log.error('Reconnect failed', { error: err.message })), delay);
            } else if (!shouldReconnect) {
                log.warn('Logged out. Scan QR code lagi untuk login.');
            } else {
                log.error('Max reconnect attempts reached. Restart untuk coba lagi.');
            }
        }

        if (connection === 'open') {
            state.isClientReady = true;
            state.reconnectAttempts = 0;
            log.info('WhatsApp terhubung!', { user: state.sock?.user?.id });
            try { if (fs.existsSync(QR_PATH)) fs.unlinkSync(QR_PATH); } catch (_) { /* ignore */ }
        }
    });
}

async function forceReconnect() {
    state.isClientReady = false;
    state.reconnectAttempts = 0;

    if (state.sock) {
        try { state.sock.end(undefined); } catch (_) { /* ignore */ }
        state.sock = null;
    }

    if (fs.existsSync(AUTH_FOLDER)) fs.rmSync(AUTH_FOLDER, { recursive: true, force: true });
    try { if (fs.existsSync(QR_PATH)) fs.unlinkSync(QR_PATH); } catch (_) { /* ignore */ }

    setTimeout(() => connectToWhatsApp().catch(err => log.error('Re-initialize failed', { error: err.message })), 2000);
}

async function logout() {
    state.isClientReady = false;
    state.reconnectAttempts = 0;

    if (state.sock) {
        try { await state.sock.logout(); } catch (_) { /* ignore */ }
        try { state.sock.end(undefined); } catch (_) { /* ignore */ }
        state.sock = null;
    }

    if (fs.existsSync(AUTH_FOLDER)) fs.rmSync(AUTH_FOLDER, { recursive: true, force: true });
    try { if (fs.existsSync(QR_PATH)) fs.unlinkSync(QR_PATH); } catch (_) { /* ignore */ }

    setTimeout(() => connectToWhatsApp().catch(err => log.error('Re-initialize after logout failed', { error: err.message })), 2000);
}

module.exports = { state, MAX_RECONNECT_ATTEMPTS, QR_PATH, connectToWhatsApp, forceReconnect, logout, validateClientReady };
