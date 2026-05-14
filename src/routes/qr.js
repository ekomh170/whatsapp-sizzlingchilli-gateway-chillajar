'use strict';

const { Router } = require('express');
const fs = require('fs');
const { state, QR_PATH } = require('../services/whatsapp');

const router = Router();

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

router.get('/qr', (req, res) => {
    if (!fs.existsSync(QR_PATH)) {
        return res.status(404).send(`<!DOCTYPE html><html><head><title>QR Code - ChillAjar</title>
        <meta charset="utf-8"><link rel="icon" href="/images/favicon.ico">
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <style>${style}</style></head><body><div class="container">
        <img src="/images/logo.png" alt="ChillAjar" style="max-width:150px;margin-bottom:20px;">
        <h1>📱 WhatsApp Gateway</h1>
        <div class="status not-ready">
            <h2>⚠️ QR Code Tidak Tersedia</h2>
            <p>QR code belum dibuat atau sudah expired.</p>
            <p><strong>Status:</strong> ${state.isClientReady ? '✅ Connected' : '❌ Not Connected'}</p>
        </div>
        <button onclick="location.reload()">🔄 Refresh</button>
        <button onclick="location.href='/admin'">⚙️ Admin Panel</button>
        </div></body></html>`);
    }

    const qrBase64 = fs.readFileSync(QR_PATH).toString('base64');
    res.send(`<!DOCTYPE html><html><head><title>QR Code - ChillAjar</title>
    <meta charset="utf-8"><link rel="icon" href="/images/favicon.ico">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <style>${style}</style>
    <script>setTimeout(() => location.reload(), 30000);</script>
    </head><body><div class="container">
    <img src="/images/logo.png" alt="ChillAjar" style="max-width:150px;margin-bottom:20px;">
    <h1>📱 WhatsApp Gateway QR Code</h1>
    <p class="subtitle">Scan QR code ini dengan WhatsApp untuk menghubungkan gateway</p>
    <div class="status ${state.isClientReady ? 'ready' : 'not-ready'}">${state.isClientReady ? '✅ Connected' : '⚠️ Waiting for Scan'}</div>
    <div style="margin:30px 0;"><img class="qr" src="data:image/png;base64,${qrBase64}" alt="WhatsApp QR Code"></div>
    <div class="instructions">
        <h3 style="margin-top:0;color:#2FA1FF;">📋 Cara Scan QR Code:</h3>
        <ol>
            <li>Buka <strong>WhatsApp</strong> di HP Anda</li>
            <li>Tap <strong>Menu (⋮)</strong> atau <strong>Settings</strong></li>
            <li>Pilih <strong>Linked Devices</strong></li>
            <li>Tap <strong>Link a Device</strong></li>
            <li>Scan QR code di atas</li>
            <li>Tunggu hingga status berubah menjadi <strong>Connected ✅</strong></li>
        </ol>
    </div>
    <button onclick="location.reload()">🔄 Refresh</button>
    <button onclick="location.href='/status'">📊 Status</button>
    <button onclick="location.href='/admin'">⚙️ Admin</button>
    <div class="footer">
        <p><strong>WhatsApp Gateway ChillAjar</strong> | Powered by Baileys</p>
        <p>Halaman ini refresh otomatis setiap 30 detik</p>
    </div>
    </div></body></html>`);
});

module.exports = router;
