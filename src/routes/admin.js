'use strict';

const { Router } = require('express');
const fs = require('fs');
const { state, MAX_RECONNECT_ATTEMPTS, QR_PATH, forceReconnect, logout } = require('../services/whatsapp');
const { log } = require('../config/logger');

const router = Router();

router.get('/admin', (req, res) => {
    const hasQR = fs.existsSync(QR_PATH);
    const qrBase64 = hasQR ? fs.readFileSync(QR_PATH).toString('base64') : null;
    const user = state.sock?.user;
    const clientInfo = state.isClientReady && user
        ? { wid: user.id || '-', pushname: user.name || '-', platform: 'Baileys' }
        : null;

    res.send(`<!DOCTYPE html>
<html>
<head>
    <title>WhatsApp Gateway - Admin Panel ChillAjar</title>
    <meta charset="utf-8">
    <link rel="icon" href="/images/favicon.ico">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', sans-serif; background: linear-gradient(135deg, #2FA1FF 0%, #298FE4 100%); padding: 20px; min-height: 100vh; }
        .container { max-width: 1200px; margin: 0 auto; }
        .header { background: white; padding: 30px; border-radius: 15px; margin-bottom: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.3); }
        .header h1 { color: #2FA1FF; margin-bottom: 10px; }
        .header p { color: #666; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-bottom: 20px; }
        .card { background: white; padding: 25px; border-radius: 15px; box-shadow: 0 5px 15px rgba(0,0,0,0.2); }
        .card h2 { color: #2FA1FF; margin-bottom: 15px; }
        .badge { display: inline-block; padding: 8px 16px; border-radius: 20px; font-weight: bold; font-size: 14px; }
        .badge.success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
        .badge.danger  { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
        .info-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
        .info-row:last-child { border-bottom: none; }
        .info-label { font-weight: bold; color: #555; }
        .alert { padding: 15px; border-radius: 8px; margin: 15px 0; }
        .alert.info    { background: #d1ecf1; color: #0c5460; border: 1px solid #bee5eb; }
        .alert.success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
        .alert.warning { background: #fff3cd; color: #856404; border: 1px solid #ffc107; }
        .qr-preview { text-align: center; margin: 20px 0; }
        .qr-preview img { max-width: 250px; border: 3px solid #2FA1FF; border-radius: 10px; }
        .actions { margin-top: 20px; text-align: center; }
        button { background: #2FA1FF; color: white; border: none; padding: 12px 24px; border-radius: 25px; cursor: pointer; font-size: 14px; margin: 5px; transition: all 0.3s; }
        button:hover  { background: #298FE4; transform: translateY(-2px); }
        button.danger { background: #dc3545; }
        button.danger:hover { background: #c82333; }
        button.success { background: #28a745; }
        button.success:hover { background: #218838; }
        .footer { text-align: center; color: white; margin-top: 30px; padding: 20px; font-size: 12px; }
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
        function logoutWA() {
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
            <img src="/images/logo.png" alt="ChillAjar" style="max-width:120px;margin-bottom:15px;">
            <h1>⚙️ WhatsApp Gateway - Admin Panel</h1>
            <p>Management & Monitoring Dashboard | Powered by Baileys</p>
        </div>

        <div class="grid">
            <div class="card">
                <h2>📡 Connection Status</h2>
                <div style="text-align:center;margin:20px 0;">
                    <div class="badge ${state.isClientReady ? 'success' : 'danger'}">${state.isClientReady ? '✅ CONNECTED' : '❌ DISCONNECTED'}</div>
                </div>
                <div class="info-row"><span class="info-label">Status:</span><span>${state.isClientReady ? 'Ready' : 'Not Ready'}</span></div>
                <div class="info-row"><span class="info-label">Reconnect Attempts:</span><span>${state.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}</span></div>
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
                <div class="info-row"><span class="info-label">Uptime:</span><span>${Math.floor(process.uptime())}s</span></div>
                <div class="info-row"><span class="info-label">Port:</span><span>${process.env.PORT || 8086}</span></div>
                <div class="info-row"><span class="info-label">Environment:</span><span>${process.env.NODE_ENV || 'production'}</span></div>
            </div>
        </div>

        ${hasQR && !state.isClientReady ? `
        <div class="card" style="margin-bottom:20px;">
            <h2>📱 QR Code Preview</h2>
            <div class="alert info">💡 Scan QR code ini untuk menghubungkan WhatsApp Gateway</div>
            <div class="qr-preview"><img src="data:image/png;base64,${qrBase64}" alt="WhatsApp QR Code"></div>
            <div class="actions"><button onclick="location.href='/qr'">🔍 View Full Size</button></div>
        </div>` : ''}

        ${state.isClientReady ? `
        <div class="card" style="margin-bottom:20px;">
            <h2>✅ Gateway Connected</h2>
            <div class="alert success">🎉 WhatsApp Gateway sudah terhubung dan siap digunakan!</div>
            <div class="actions">
                <button class="success" onclick="testMessage()">📤 Test Send Message</button>
                <button onclick="location.href='/status'">📊 View Status JSON</button>
            </div>
        </div>` : ''}

        <div class="grid">
            <div class="card">
                <h2>🎛️ Actions</h2>
                <div class="actions">
                    <button onclick="location.reload()">🔄 Refresh</button>
                    <button onclick="location.href='/qr'">📱 QR Code</button>
                    <button onclick="location.href='/status'">📊 Status</button>
                    <button onclick="location.href='/'">🏠 Home</button>
                    ${!state.isClientReady ? '<button class="danger" onclick="forceReconnect()">🔌 Force Reconnect</button>' : ''}
                    ${state.isClientReady ? '<button class="danger" onclick="logoutWA()">🚪 Logout & Reset</button>' : ''}
                </div>
            </div>
            <div class="card">
                <h2>🔗 Quick Links</h2>
                <div style="line-height:2.2;">
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
        <p>WhatsApp Gateway ChillAjar | Admin Panel v2.0.0 | Auto-refresh every 30s</p>
    </div>
</body>
</html>`);
});

router.post('/admin/reconnect', async (req, res) => {
    try {
        log.info('Force reconnect requested');
        await forceReconnect();
        res.json({ status: true, message: '🔄 Reconnect initiated! QR code akan muncul dalam 10-15 detik.' });
    } catch (err) {
        log.error('Reconnect error', { error: err.message });
        res.status(500).json({ status: false, message: 'Gagal reconnect: ' + err.message });
    }
});

router.post('/admin/logout', async (req, res) => {
    try {
        log.info('Logout requested');
        await logout();
        res.json({ status: true, message: 'Logout berhasil. QR code baru akan di-generate.' });
    } catch (err) {
        log.error('Logout error', { error: err.message });
        res.status(500).json({ status: false, message: 'Gagal logout: ' + err.message });
    }
});

module.exports = router;
