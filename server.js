'use strict';

const express = require("express");
const bodyParser = require("body-parser");
const QRCode = require("qrcode");
const TelegramBot = require("node-telegram-bot-api");
const winston = require("winston");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 8086;

// ================================
// Winston Logger
// ================================
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true }),
        winston.format.printf(info => {
            const { timestamp, level, message, ...meta } = info;
            const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
            return `[${timestamp}] ${level.toUpperCase()}: ${message} ${metaStr}`;
        })
    ),
    transports: [
        new winston.transports.File({
            filename: path.join(logsDir, 'combined.log'),
            maxsize: 5242880,
            maxFiles: 5
        }),
        new winston.transports.File({
            filename: path.join(logsDir, 'error.log'),
            level: 'error',
            maxsize: 5242880,
            maxFiles: 5
        }),
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.printf(info => `[${info.timestamp}] ${info.level}: ${info.message}`)
            )
        })
    ]
});

const log = {
    info: (msg, meta = {}) => logger.info(msg, meta),
    error: (msg, meta = {}) => logger.error(msg, meta),
    warn: (msg, meta = {}) => logger.warn(msg, meta),
    debug: (msg, meta = {}) => logger.debug(msg, meta)
};

app.use(bodyParser.json());
app.use(express.static('public'));

// ================================
// Telegram Bot (opsional)
// ================================
let telegramBot;
if (process.env.TELEGRAM_BOT_TOKEN) {
    telegramBot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);
}

// ================================
// WhatsApp State (Baileys)
// ================================
const AUTH_FOLDER = path.join(__dirname, 'auth_info_baileys');

let sock = null;
let isClientReady = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, Browsers, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
    const { version } = await fetchLatestBaileysVersion();
    log.info(`Menggunakan WhatsApp Web versi ${version.join('.')}`);

    sock = makeWASocket({
        version,
        auth: state,
        browser: Browsers.ubuntu('Chrome'),
        logger: pino({ level: 'silent' }),
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 30000,
        keepAliveIntervalMs: 10000,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            log.info('QR code baru tersedia, silakan scan');
            QRCode.toFile('wa-qr.png', qr, { overwrite: true }, err => {
                if (err) log.error('Gagal simpan QR code', { error: err.message });
                else log.info('QR code disimpan ke wa-qr.png');
            });
            try {
                require('qrcode-terminal').generate(qr, { small: true });
            } catch (e) { /* ignore */ }
        }

        if (connection === 'close') {
            isClientReady = false;
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

            log.warn(`WhatsApp disconnected`, { statusCode, shouldReconnect });

            if (shouldReconnect && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                reconnectAttempts++;
                const delay = 5000 * reconnectAttempts;
                log.info(`Reconnecting in ${delay / 1000}s...`, { attempt: `${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}` });
                setTimeout(() => connectToWhatsApp().catch(err => log.error('Reconnect failed', { error: err.message })), delay);
            } else if (!shouldReconnect) {
                log.warn('Logged out. Scan QR code lagi untuk login.');
            } else {
                log.error('Max reconnect attempts reached. Restart untuk coba lagi.');
            }
        }

        if (connection === 'open') {
            isClientReady = true;
            reconnectAttempts = 0;
            log.info('WhatsApp terhubung!', { user: sock?.user?.id });
            // Hapus QR lama setelah connect
            const qrPath = path.join(__dirname, 'wa-qr.png');
            try { if (fs.existsSync(qrPath)) fs.unlinkSync(qrPath); } catch (e) { /* ignore */ }
        }
    });
}

// ================================
// Helper: Validasi Client Ready
// ================================
function validateClientReady() {
    if (!isClientReady || !sock) {
        return { valid: false, status: 503, message: "WhatsApp client belum siap, silakan scan QR code atau tunggu beberapa saat." };
    }
    return { valid: true };
}

// ================================
// POST /send-message
// ================================
app.post("/send-message", async (req, res) => {
    const { phone, message, sender } = req.body;
    if (!phone || !message || !sender) {
        return res.status(400).json({ status: false, message: "phone, message, sender wajib diisi" });
    }
    if (process.env.WA_SENDER && sender !== process.env.WA_SENDER) {
        return res.status(403).json({ status: false, message: "Sender tidak sesuai" });
    }
    const validation = validateClientReady();
    if (!validation.valid) {
        return res.status(validation.status).json({ status: false, message: validation.message });
    }
    if (!/^62\d{9,15}$/.test(phone)) {
        return res.status(400).json({ status: false, message: "Format nomor WhatsApp harus diawali 62 dan hanya angka." });
    }
    try {
        await sock.sendMessage(phone + "@s.whatsapp.net", { text: message });
        return res.json({ status: true, message: "Pesan berhasil dikirim" });
    } catch (err) {
        log.error('Gagal kirim pesan', { phone, error: err.message });
        return res.status(500).json({ status: false, message: "Gagal mengirim pesan", error: err.message });
    }
});

// ================================
// POST /chat/send (alternatif)
// ================================
app.post("/chat/send", async (req, res) => {
    const { phone, message, sender } = req.body;
    if (!phone || !message || !sender) {
        return res.status(400).json({ status: false, message: "phone, message, sender wajib diisi" });
    }
    if (process.env.WA_SENDER && sender !== process.env.WA_SENDER) {
        return res.status(403).json({ status: false, message: "Sender tidak sesuai" });
    }
    const validation = validateClientReady();
    if (!validation.valid) {
        return res.status(validation.status).json({ status: false, message: validation.message });
    }
    if (!/^62\d{9,15}$/.test(phone)) {
        return res.status(400).json({ status: false, message: "Format nomor WhatsApp harus diawali 62 dan hanya angka." });
    }
    try {
        await sock.sendMessage(phone + "@s.whatsapp.net", { text: message });
        return res.json({ status: true, message: "Pesan berhasil dikirim" });
    } catch (err) {
        log.error('Gagal kirim pesan', { phone, error: err.message });
        return res.status(500).json({ status: false, message: "Gagal mengirim pesan", error: err.message });
    }
});

// ================================
// GET /
// ================================
app.get("/", (req, res) => {
    res.json({
        service: "WhatsApp Gateway ChillAjar",
        engine: "Baileys (no Puppeteer)",
        status: "running",
        ready: isClientReady,
        version: "2.0.0",
        endpoints: { status: "/status", health: "/health", qr: "/qr", sendMessage: "/send-message" }
    });
});

// ================================
// GET /status
// ================================
app.get("/status", (req, res) => {
    if (!isClientReady || !sock) {
        return res.status(503).json({
            status: false, ready: false,
            message: "WhatsApp client belum siap",
            reconnectAttempts, maxAttempts: MAX_RECONNECT_ATTEMPTS
        });
    }
    const user = sock.user;
    return res.json({
        status: true, ready: true,
        message: "WhatsApp client is ready",
        clientInfo: { wid: user?.id || '-', pushname: user?.name || '-', platform: 'Baileys' }
    });
});

// ================================
// GET /health
// ================================
app.get("/health", (req, res) => {
    const health = {
        uptime: process.uptime(),
        message: isClientReady ? "OK" : "WhatsApp client not ready",
        timestamp: Date.now(),
        whatsappReady: isClientReady,
        reconnectAttempts,
        engine: "Baileys"
    };
    res.status(isClientReady ? 200 : 503).json(health);
});

// ================================
// GET /qr
// ================================
app.get("/qr", (req, res) => {
    const qrPath = path.join(__dirname, "wa-qr.png");
    const style = `
        body { font-family: Arial, sans-serif; text-align: center; padding: 20px; background: linear-gradient(135deg, #2FA1FF 0%, #298FE4 100%); color: white; margin: 0; }
        .container { background: white; color: #333; padding: 40px; border-radius: 15px; max-width: 600px; margin: 0 auto; box-shadow: 0 10px 30px rgba(0,0,0,0.3); }
        h1 { color: #2FA1FF; margin-bottom: 10px; }
        .subtitle { color: #666; margin-bottom: 30px; }
        img.qr { max-width: 100%; border: 5px solid #2FA1FF; border-radius: 15px; }
        .instructions { text-align: left; margin: 30px 0; padding: 20px; background: #f8f9fa; border-radius: 10px; border-left: 4px solid #2FA1FF; }
        .status { display: inline-block; padding: 8px 20px; border-radius: 20px; font-weight: bold; margin: 20px 0; }
        .ready { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
        .not-ready { background: #fff3cd; color: #856404; border: 1px solid #ffc107; }
        button { background: #667eea; color: white; border: none; padding: 12px 30px; border-radius: 25px; cursor: pointer; font-size: 16px; margin: 10px; }
        button:hover { background: #764ba2; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 14px; }`;

    if (!fs.existsSync(qrPath)) {
        return res.status(404).send(`<!DOCTYPE html><html><head><title>QR Code - ChillAjar</title><meta charset="utf-8">
        <link rel="icon" href="/images/favicon.ico"><meta name="viewport" content="width=device-width,initial-scale=1">
        <style>${style}</style></head><body><div class="container">
        <img src="/images/logo.png" alt="ChillAjar" style="max-width:150px;margin-bottom:20px;">
        <h1>📱 WhatsApp Gateway</h1>
        <div class="status not-ready"><h2>⚠️ QR Code Tidak Tersedia</h2>
        <p>QR code belum dibuat atau sudah expired.</p>
        <p><strong>Status:</strong> ${isClientReady ? '✅ Connected' : '❌ Not Connected'}</p></div>
        <button onclick="location.reload()">🔄 Refresh</button>
        <button onclick="location.href='/admin'">⚙️ Admin Panel</button>
        </div></body></html>`);
    }

    const qrBase64 = fs.readFileSync(qrPath).toString('base64');
    res.send(`<!DOCTYPE html><html><head><title>QR Code - ChillAjar</title><meta charset="utf-8">
    <link rel="icon" href="/images/favicon.ico"><meta name="viewport" content="width=device-width,initial-scale=1">
    <style>${style}</style><script>setTimeout(() => location.reload(), 30000);</script>
    </head><body><div class="container">
    <img src="/images/logo.png" alt="ChillAjar" style="max-width:150px;margin-bottom:20px;">
    <h1>📱 WhatsApp Gateway QR Code</h1>
    <p class="subtitle">Scan QR code ini dengan WhatsApp untuk menghubungkan gateway</p>
    <div class="status ${isClientReady ? 'ready' : 'not-ready'}">${isClientReady ? '✅ Connected' : '⚠️ Waiting for Scan'}</div>
    <div style="margin:30px 0;"><img class="qr" src="data:image/png;base64,${qrBase64}" alt="WhatsApp QR Code"></div>
    <div class="instructions"><h3 style="margin-top:0;color:#2FA1FF;">📋 Cara Scan QR Code:</h3><ol>
    <li>Buka <strong>WhatsApp</strong> di HP Anda</li>
    <li>Tap <strong>Menu (⋮)</strong> atau <strong>Settings</strong></li>
    <li>Pilih <strong>Linked Devices</strong></li>
    <li>Tap <strong>Link a Device</strong></li>
    <li>Scan QR code di atas</li>
    <li>Tunggu hingga status berubah menjadi <strong>Connected ✅</strong></li>
    </ol></div>
    <button onclick="location.reload()">🔄 Refresh</button>
    <button onclick="location.href='/status'">📊 Status</button>
    <button onclick="location.href='/admin'">⚙️ Admin</button>
    <div class="footer"><p><strong>WhatsApp Gateway ChillAjar</strong> | Powered by Baileys</p>
    <p>Halaman ini refresh otomatis setiap 30 detik</p></div>
    </div></body></html>`);
});

// ================================
// GET /admin
// ================================
app.get("/admin", (req, res) => {
    const qrPath = path.join(__dirname, "wa-qr.png");
    const hasQR = fs.existsSync(qrPath);
    const qrBase64 = hasQR ? fs.readFileSync(qrPath).toString('base64') : null;
    const user = sock?.user;
    const clientInfo = isClientReady && user
        ? { wid: user.id || '-', pushname: user.name || '-', platform: 'Baileys' }
        : null;

    res.send(`<!DOCTYPE html>
<html>
<head>
    <title>WhatsApp Gateway - Admin Panel ChillAjar</title>
    <meta charset="utf-8">
    <link rel="icon" type="image/x-icon" href="/images/favicon.ico">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: linear-gradient(135deg, #2FA1FF 0%, #298FE4 100%); padding: 20px; min-height: 100vh; }
        .container { max-width: 1200px; margin: 0 auto; }
        .header { background: white; padding: 30px; border-radius: 15px; margin-bottom: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.3); }
        .header h1 { color: #2FA1FF; margin-bottom: 10px; }
        .header p { color: #666; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-bottom: 20px; }
        .card { background: white; padding: 25px; border-radius: 15px; box-shadow: 0 5px 15px rgba(0,0,0,0.2); }
        .card h2 { color: #2FA1FF; margin-bottom: 15px; font-size: 20px; }
        .status-badge { display: inline-block; padding: 8px 16px; border-radius: 20px; font-weight: bold; font-size: 14px; margin: 5px 0; }
        .status-badge.success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
        .status-badge.danger { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
        .info-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
        .info-row:last-child { border-bottom: none; }
        .info-label { font-weight: bold; color: #555; }
        button { background: #2FA1FF; color: white; border: none; padding: 12px 24px; border-radius: 25px; cursor: pointer; font-size: 14px; margin: 5px; transition: all 0.3s; }
        button:hover { background: #298FE4; transform: translateY(-2px); box-shadow: 0 5px 15px rgba(0,0,0,0.3); }
        button.danger { background: #dc3545; }
        button.danger:hover { background: #c82333; }
        button.success { background: #28a745; }
        button.success:hover { background: #218838; }
        .action-buttons { margin-top: 20px; text-align: center; }
        .qr-preview { text-align: center; margin: 20px 0; }
        .qr-preview img { max-width: 250px; border: 3px solid #2FA1FF; border-radius: 10px; }
        .alert { padding: 15px; border-radius: 8px; margin: 15px 0; }
        .alert.info { background: #d1ecf1; color: #0c5460; border: 1px solid #bee5eb; }
        .alert.success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
        .alert.warning { background: #fff3cd; color: #856404; border: 1px solid #ffc107; }
        .footer { text-align: center; color: white; margin-top: 30px; padding: 20px; }
        @media (max-width: 768px) { .grid { grid-template-columns: 1fr; } }
    </style>
    <script>
        function refreshStatus() {
            fetch('/status').then(r => r.json()).then(d => { if (d.ready) location.reload(); });
        }
        function forceReconnect() {
            if (!confirm('Reconnect WhatsApp? Ini akan generate QR code baru.')) return;
            const btn = event.target;
            btn.disabled = true; btn.textContent = '⏳ Reconnecting...';
            fetch('/admin/reconnect', { method: 'POST' }).then(r => r.json())
                .then(d => { alert(d.message); setTimeout(() => location.reload(), 5000); })
                .catch(e => { alert('Error: ' + e.message); btn.disabled = false; btn.textContent = '🔌 Force Reconnect'; });
        }
        function logoutWhatsApp() {
            if (!confirm('Logout? Anda harus scan QR code lagi.')) return;
            const btn = event.target;
            btn.disabled = true; btn.textContent = '⏳ Logging out...';
            fetch('/admin/logout', { method: 'POST' }).then(r => r.json())
                .then(d => { alert(d.message); setTimeout(() => location.reload(), 5000); })
                .catch(e => { alert('Error: ' + e.message); btn.disabled = false; btn.textContent = '🚪 Logout'; });
        }
        function testMessage() {
            const phone = prompt('Nomor WhatsApp (format: 628xxx):');
            if (!phone) return;
            const message = prompt('Pesan test:');
            if (!message) return;
            fetch('/send-message', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, message, sender: '${process.env.WA_SENDER || '628xxx'}' })
            }).then(r => r.json()).then(d => alert(d.status ? '✅ Berhasil!' : '❌ Gagal: ' + d.message))
              .catch(e => alert('Error: ' + e.message));
        }
        setInterval(refreshStatus, 30000);
    </script>
</head>
<body>
    <div class="container">
        <div class="header">
            <img src="/images/logo.png" alt="ChillAjar Logo" style="max-width: 120px; margin-bottom: 15px;">
            <h1>⚙️ WhatsApp Gateway - Admin Panel</h1>
            <p>Management & Monitoring Dashboard | Powered by Baileys (No Puppeteer)</p>
        </div>
        <div class="grid">
            <div class="card">
                <h2>📡 Connection Status</h2>
                <div style="text-align:center;margin:20px 0;">
                    <div class="status-badge ${isClientReady ? 'success' : 'danger'}">${isClientReady ? '✅ CONNECTED' : '❌ DISCONNECTED'}</div>
                </div>
                <div class="info-row"><span class="info-label">Status:</span><span>${isClientReady ? 'Ready' : 'Not Ready'}</span></div>
                <div class="info-row"><span class="info-label">Reconnect Attempts:</span><span>${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}</span></div>
                <div class="info-row"><span class="info-label">QR Code:</span><span>${hasQR ? 'Available' : 'Not Available'}</span></div>
                <div class="info-row"><span class="info-label">Engine:</span><span>Baileys (No Puppeteer)</span></div>
            </div>
            <div class="card">
                <h2>📱 Client Information</h2>
                ${clientInfo ? `
                <div class="info-row"><span class="info-label">WhatsApp ID:</span><span>${clientInfo.wid}</span></div>
                <div class="info-row"><span class="info-label">Push Name:</span><span>${clientInfo.pushname}</span></div>
                <div class="info-row"><span class="info-label">Platform:</span><span>${clientInfo.platform}</span></div>
                ` : '<div class="alert warning">⚠️ Client belum terhubung. Silakan scan QR code.</div>'}
            </div>
            <div class="card">
                <h2>🖥️ System Information</h2>
                <div class="info-row"><span class="info-label">Version:</span><span>2.0.0</span></div>
                <div class="info-row"><span class="info-label">Uptime:</span><span>${Math.floor(process.uptime())} seconds</span></div>
                <div class="info-row"><span class="info-label">Port:</span><span>${port}</span></div>
                <div class="info-row"><span class="info-label">Environment:</span><span>${process.env.NODE_ENV || 'production'}</span></div>
            </div>
        </div>

        ${hasQR && !isClientReady ? `
        <div class="card" style="margin-bottom:20px;">
            <h2>📱 QR Code Preview</h2>
            <div class="alert info">💡 Scan QR code ini untuk menghubungkan WhatsApp Gateway</div>
            <div class="qr-preview"><img src="data:image/png;base64,${qrBase64}" alt="WhatsApp QR Code"></div>
            <div class="action-buttons"><button onclick="location.href='/qr'">🔍 View Full Size</button></div>
        </div>` : ''}

        ${isClientReady ? `
        <div class="card" style="margin-bottom:20px;">
            <h2>✅ Gateway Connected</h2>
            <div class="alert success">🎉 WhatsApp Gateway sudah terhubung dan siap digunakan!</div>
            <div class="action-buttons">
                <button class="success" onclick="testMessage()">📤 Test Send Message</button>
                <button onclick="location.href='/status'">📊 View Status JSON</button>
            </div>
        </div>` : ''}

        <div class="grid">
            <div class="card">
                <h2>🎛️ Actions</h2>
                <div class="action-buttons">
                    <button onclick="location.reload()">🔄 Refresh</button>
                    <button onclick="location.href='/qr'">📱 View QR Code</button>
                    <button onclick="location.href='/status'">📊 Check Status</button>
                    <button onclick="location.href='/'">🏠 Home</button>
                    ${!isClientReady ? '<button class="danger" onclick="forceReconnect()">🔌 Force Reconnect</button>' : ''}
                    ${isClientReady ? '<button class="danger" onclick="logoutWhatsApp()">🚪 Logout & Reset</button>' : ''}
                </div>
            </div>
            <div class="card">
                <h2>🔗 Quick Links</h2>
                <div style="line-height:2;">
                    <a href="/" style="color:#2FA1FF;text-decoration:none;">• Home</a><br>
                    <a href="/status" style="color:#2FA1FF;text-decoration:none;">• Status API</a><br>
                    <a href="/health" style="color:#2FA1FF;text-decoration:none;">• Health Check</a><br>
                    <a href="/qr" style="color:#2FA1FF;text-decoration:none;">• QR Code Page</a><br>
                    <a href="/admin/logs/list" style="color:#2FA1FF;text-decoration:none;">• Log Files</a><br>
                </div>
            </div>
        </div>
    </div>
    <div class="footer">
        <p><strong>WhatsApp Gateway ChillAjar</strong> | Admin Panel v2.0.0</p>
        <p style="font-size:12px;margin-top:10px;">Auto-refresh status every 30 seconds</p>
    </div>
</body>
</html>`);
});

// ================================
// POST /admin/reconnect
// ================================
app.post("/admin/reconnect", async (req, res) => {
    try {
        log.info('Force reconnect requested');
        isClientReady = false;
        reconnectAttempts = 0;

        if (sock) {
            try { sock.end(undefined); } catch (e) { /* ignore */ }
            sock = null;
        }

        // Hapus auth folder untuk generate QR baru
        if (fs.existsSync(AUTH_FOLDER)) {
            fs.rmSync(AUTH_FOLDER, { recursive: true, force: true });
            log.info('Auth folder deleted for fresh start');
        }

        const qrPath = path.join(__dirname, 'wa-qr.png');
        try { if (fs.existsSync(qrPath)) fs.unlinkSync(qrPath); } catch (e) { /* ignore */ }

        setTimeout(() => {
            connectToWhatsApp().catch(err => log.error('Re-initialize failed', { error: err.message }));
        }, 2000);

        res.json({ status: true, message: "🔄 Reconnect initiated! QR code akan muncul dalam 10-15 detik. Refresh halaman ini secara berkala." });
    } catch (err) {
        log.error('Reconnect error', { error: err.message });
        res.status(500).json({ status: false, message: "Gagal reconnect: " + err.message });
    }
});

// ================================
// POST /admin/logout
// ================================
app.post("/admin/logout", async (req, res) => {
    try {
        log.info('Logout requested');
        isClientReady = false;
        reconnectAttempts = 0;

        if (sock) {
            try { await sock.logout(); } catch (e) { /* ignore */ }
            try { sock.end(undefined); } catch (e) { /* ignore */ }
            sock = null;
        }

        if (fs.existsSync(AUTH_FOLDER)) {
            fs.rmSync(AUTH_FOLDER, { recursive: true, force: true });
        }

        const qrPath = path.join(__dirname, 'wa-qr.png');
        try { if (fs.existsSync(qrPath)) fs.unlinkSync(qrPath); } catch (e) { /* ignore */ }

        setTimeout(() => {
            connectToWhatsApp().catch(err => log.error('Re-initialize after logout failed', { error: err.message }));
        }, 2000);

        res.json({ status: true, message: "Logout berhasil. QR code baru akan di-generate. Silakan refresh halaman." });
    } catch (err) {
        log.error('Logout error', { error: err.message });
        res.status(500).json({ status: false, message: "Gagal logout: " + err.message });
    }
});

// ================================
// Logs Management
// ================================
app.get("/admin/logs/list", (req, res) => {
    try {
        if (!fs.existsSync(logsDir)) return res.json({ status: true, files: [] });
        const files = fs.readdirSync(logsDir)
            .filter(f => f.endsWith('.log'))
            .map(f => {
                const stats = fs.statSync(path.join(logsDir, f));
                return { name: f, size: stats.size, sizeHuman: (stats.size / 1024).toFixed(2) + ' KB', modified: stats.mtime };
            })
            .sort((a, b) => b.modified - a.modified);
        res.json({ status: true, files });
    } catch (err) {
        res.status(500).json({ status: false, message: err.message });
    }
});

app.get("/admin/logs/view/:filename", (req, res) => {
    try {
        const { filename } = req.params;
        const lines = parseInt(req.query.lines) || 500;
        if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
            return res.status(400).json({ status: false, message: 'Invalid filename' });
        }
        const logPath = path.join(logsDir, filename);
        if (!fs.existsSync(logPath)) return res.status(404).json({ status: false, message: 'Log file not found' });
        const allLines = fs.readFileSync(logPath, 'utf8').split('\n');
        res.json({ status: true, filename, totalLines: allLines.length, returnedLines: Math.min(lines, allLines.length), content: allLines.slice(-lines).join('\n') });
    } catch (err) {
        res.status(500).json({ status: false, message: err.message });
    }
});

app.get("/admin/logs/combined", (req, res) => {
    try {
        const lines = parseInt(req.query.lines) || 1000;
        const combinedPath = path.join(logsDir, 'combined.log');
        if (!fs.existsSync(combinedPath)) return res.json({ status: true, content: 'No logs available yet.' });
        const allLines = fs.readFileSync(combinedPath, 'utf8').split('\n');
        res.json({ status: true, totalLines: allLines.length, returnedLines: Math.min(lines, allLines.length), content: allLines.slice(-lines).join('\n') });
    } catch (err) {
        res.status(500).json({ status: false, message: err.message });
    }
});

app.delete("/admin/logs/clear", (req, res) => {
    try {
        if (!fs.existsSync(logsDir)) return res.json({ status: true, message: 'No logs to clear' });
        const files = fs.readdirSync(logsDir).filter(f => f.endsWith('.log'));
        files.forEach(f => fs.unlinkSync(path.join(logsDir, f)));
        log.warn('All logs cleared by admin');
        res.json({ status: true, message: `${files.length} log files cleared`, filesDeleted: files });
    } catch (err) {
        res.status(500).json({ status: false, message: err.message });
    }
});

// ================================
// Start Server
// ================================
const server = app.listen(port, () => {
    log.info(`Gateway listening on http://localhost:${port}`);
    connectToWhatsApp().catch(err => log.error('Initial WhatsApp connect failed', { error: err.message }));
});

// ================================
// Graceful Shutdown
// ================================
async function gracefulShutdown(signal) {
    log.info(`${signal} received: shutting down`);
    server.close(async () => {
        if (sock) { try { sock.end(undefined); } catch (e) { /* ignore */ } }
        process.exit(0);
    });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('uncaughtException', err => log.error('Uncaught Exception', { error: err.message, stack: err.stack }));
process.on('unhandledRejection', reason => log.error('Unhandled Rejection', { reason: String(reason) }));
