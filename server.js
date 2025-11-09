// server.js
// Express server untuk menerima request /send-message dan mengirim pesan WhatsApp

const express = require("express");
const bodyParser = require("body-parser");
const { Client, LocalAuth } = require("./index");
const QRCode = require("qrcode");
const TelegramBot = require("node-telegram-bot-api");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 8086;

app.use(bodyParser.json());

// Deteksi OS Linux untuk menyesuaikan argumen puppeteer
const isLinux = process.platform === "linux";

// Inisialisasi WhatsApp client
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        // Jika di Linux (umumnya server/headless), tambahkan argumen agar puppeteer bisa jalan tanpa sandbox
        // Jika di Windows/Mac (lokal), argumen dikosongkan agar tidak error
        args: isLinux ? ["--no-sandbox", "--disable-setuid-sandbox"] : [],
    },
});

// Initialize dengan error handling
client.initialize().catch(err => {
    console.error('Failed to initialize WhatsApp client:', err);
    // Jangan exit, biarkan health check handle it
});

let telegramBot;
const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
const telegramChatId = process.env.TELEGRAM_CHAT_ID;
if (telegramBotToken) {
    telegramBot = new TelegramBot(telegramBotToken);
}

client.on("qr", (qr) => {
    // Timpa file wa-qr.png jika sudah ada
    QRCode.toFile("wa-qr.png", qr, { overwrite: true }, (err) => {
        if (err) {
            console.error("Gagal membuat QR code:", err);
        } else {
            console.log(
                "QR code disimpan ke wa-qr.png (ditimpa jika sudah ada)"
            );
        }
    });
    // Tampilkan QR code ke log terminal (agar bisa di-scan via log Render.com)
    try {
        const qrcode = require("qrcode-terminal");
        qrcode.generate(qr, { small: true });
        console.log("QR code juga ditampilkan di log (qrcode-terminal)");
    } catch (e) {
        console.warn("qrcode-terminal tidak tersedia:", e.message);
    }
    // Kirim QR code ke Telegram sebagai gambar jika bot dan chat id tersedia
    if (telegramBot && telegramChatId) {
        // Generate QR code PNG ke buffer
        QRCode.toBuffer(qr, { type: "png" }, (err, buffer) => {
            if (err) {
                console.error("Gagal generate QR PNG untuk Telegram:", err);
                // Fallback: kirim string QR
                telegramBot.sendMessage(
                    telegramChatId,
                    `Scan QR WhatsApp:\n\n${qr}`
                );
            } else {
                telegramBot
                    .sendPhoto(telegramChatId, buffer, {
                        caption: "Scan QR WhatsApp untuk login gateway.",
                        filename: "wa-qr.png",
                    })
                    .then(() =>
                        console.log("QR code (gambar) dikirim ke Telegram")
                    )
                    .catch((err) =>
                        console.error(
                            "Gagal kirim QR gambar ke Telegram:",
                            err.message
                        )
                    );
            }
        });
    }
});

let isClientReady = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

client.on("ready", () => {
    isClientReady = true;
    reconnectAttempts = 0; // Reset counter saat berhasil connect
    console.log("WhatsApp client is ready!");
});

client.on("disconnected", (reason) => {
    isClientReady = false;
    console.log("WhatsApp client disconnected:", reason);
    
    // Auto-reconnect dengan limit untuk mencegah infinite loop
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        console.log(`Attempting to reconnect... (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
        setTimeout(() => {
            client.initialize().catch(err => {
                console.error('Reconnect failed:', err.message);
            });
        }, 5000 * reconnectAttempts); // Exponential backoff
    } else {
        console.error('Max reconnect attempts reached. Please restart the container or check WhatsApp session.');
    }
});

// Endpoint untuk menerima request kirim pesan
app.post("/c", async (req, res) => {
    const { phone, message, sender } = req.body;
    if (!phone || !message || !sender) {
        return res.status(400).json({
            status: false,
            message: "phone, message, sender wajib diisi",
        });
    }
    // Validasi nomor pengirim
    if (process.env.WA_SENDER && sender !== process.env.WA_SENDER) {
        return res
            .status(403)
            .json({ status: false, message: "Sender tidak sesuai" });
    }
    // Validasi client ready
    if (!isClientReady) {
        return res.status(503).json({
            status: false,
            message:
                "WhatsApp client belum siap, silakan scan QR code atau tunggu beberapa saat.",
        });
    }
    // Validasi nomor WhatsApp
    if (!/^62\d{9,15}$/.test(phone)) {
        return res.status(400).json({
            status: false,
            message: "Format nomor WhatsApp harus diawali 62 dan hanya angka.",
        });
    }
    try {
        const chatId = phone + "@c.us";
        await client.sendMessage(chatId, message);
        return res.json({ status: true, message: "Pesan berhasil dikirim" });
    } catch (err) {
        return res.status(500).json({
            status: false,
            message: "Gagal mengirim pesan",
            error: err.message,
        });
    }
});

// Endpoint root untuk menampilkan status gateway
app.get("/", (req, res) => {
    res.json({
        service: "WhatsApp Gateway ChillAjar",
        status: "running",
        ready: isClientReady,
        version: "1.31.0",
        endpoints: {
            status: "/status",
            health: "/health",
            qr: "/qr",
            sendMessage: "/send-message"
        }
    });
});

// Endpoint untuk cek status WhatsApp client
app.get("/status", async (req, res) => {
    if (!isClientReady) {
        return res.status(503).json({
            status: false,
            ready: false,
            message: "WhatsApp client belum siap, silakan scan QR code atau tunggu beberapa saat.",
            reconnectAttempts: reconnectAttempts,
            maxAttempts: MAX_RECONNECT_ATTEMPTS
        });
    }

    try {
        const info = await client.info;
        return res.json({
            status: true,
            ready: true,
            message: "WhatsApp client is ready",
            clientInfo: {
                wid: info.wid._serialized,
                pushname: info.pushname,
                platform: info.platform
            }
        });
    } catch (err) {
        return res.status(500).json({
            status: false,
            ready: false,
            message: "Error getting client info",
            error: err.message
        });
    }
});

// Endpoint health check untuk Docker/Kubernetes
app.get("/health", (req, res) => {
    const health = {
        uptime: process.uptime(),
        message: "OK",
        timestamp: Date.now(),
        whatsappReady: isClientReady,
        reconnectAttempts: reconnectAttempts
    };

    if (isClientReady) {
        res.status(200).json(health);
    } else {
        health.message = "WhatsApp client not ready";
        res.status(503).json(health);
    }
});

// Endpoint untuk menampilkan QR code
app.get("/qr", (req, res) => {
    const fs = require("fs");
    const path = require("path");
    const qrPath = path.join(__dirname, "wa-qr.png");

    if (!fs.existsSync(qrPath)) {
        return res.status(404).send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>WhatsApp QR Code</title>
                <meta charset="utf-8">
                <style>
                    body { 
                        font-family: Arial, sans-serif; 
                        text-align: center; 
                        padding: 50px;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white;
                    }
                    .container {
                        background: white;
                        color: #333;
                        padding: 40px;
                        border-radius: 15px;
                        max-width: 600px;
                        margin: 0 auto;
                        box-shadow: 0 10px 30px rgba(0,0,0,0.3);
                    }
                    h1 { color: #667eea; }
                    .status { 
                        padding: 15px; 
                        margin: 20px 0; 
                        border-radius: 8px;
                        background: #fff3cd;
                        border: 1px solid #ffc107;
                    }
                    button {
                        background: #667eea;
                        color: white;
                        border: none;
                        padding: 12px 30px;
                        border-radius: 25px;
                        cursor: pointer;
                        font-size: 16px;
                        margin: 10px;
                    }
                    button:hover { background: #764ba2; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>📱 WhatsApp Gateway</h1>
                    <div class="status">
                        <h2>⚠️ QR Code Tidak Tersedia</h2>
                        <p>QR code belum dibuat atau sudah expired.</p>
                        <p><strong>Status:</strong> ${isClientReady ? '✅ Connected' : '❌ Not Connected'}</p>
                    </div>
                    <div>
                        <button onclick="location.reload()">🔄 Refresh</button>
                        <button onclick="window.location.href='/status'">📊 Check Status</button>
                    </div>
                    <p style="margin-top: 30px; color: #666; font-size: 14px;">
                        Jika sudah scan QR code, gateway akan otomatis connect.<br>
                        Jika belum, restart container untuk generate QR baru.
                    </p>
                </div>
            </body>
            </html>
        `);
    }

    // Kirim HTML dengan QR code image
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>WhatsApp QR Code</title>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body { 
                    font-family: Arial, sans-serif; 
                    text-align: center; 
                    padding: 20px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    margin: 0;
                }
                .container {
                    background: white;
                    color: #333;
                    padding: 40px;
                    border-radius: 15px;
                    max-width: 600px;
                    margin: 0 auto;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.3);
                }
                h1 { color: #667eea; margin-bottom: 10px; }
                .subtitle { color: #666; margin-bottom: 30px; }
                img { 
                    max-width: 100%; 
                    height: auto; 
                    border: 5px solid #667eea; 
                    border-radius: 15px;
                    box-shadow: 0 5px 15px rgba(0,0,0,0.2);
                }
                .instructions {
                    text-align: left;
                    margin: 30px 0;
                    padding: 20px;
                    background: #f8f9fa;
                    border-radius: 10px;
                    border-left: 4px solid #667eea;
                }
                .instructions ol {
                    margin: 10px 0;
                    padding-left: 20px;
                }
                .instructions li {
                    margin: 10px 0;
                    line-height: 1.6;
                }
                .status {
                    display: inline-block;
                    padding: 8px 20px;
                    border-radius: 20px;
                    font-weight: bold;
                    margin: 20px 0;
                }
                .status.ready {
                    background: #d4edda;
                    color: #155724;
                    border: 1px solid #c3e6cb;
                }
                .status.not-ready {
                    background: #fff3cd;
                    color: #856404;
                    border: 1px solid #ffc107;
                }
                button {
                    background: #667eea;
                    color: white;
                    border: none;
                    padding: 12px 30px;
                    border-radius: 25px;
                    cursor: pointer;
                    font-size: 16px;
                    margin: 10px;
                    transition: all 0.3s;
                }
                button:hover { 
                    background: #764ba2; 
                    transform: translateY(-2px);
                    box-shadow: 0 5px 15px rgba(0,0,0,0.2);
                }
                .footer {
                    margin-top: 30px;
                    padding-top: 20px;
                    border-top: 1px solid #ddd;
                    color: #666;
                    font-size: 14px;
                }
                @media (max-width: 600px) {
                    .container { padding: 20px; }
                    h1 { font-size: 24px; }
                    button { padding: 10px 20px; font-size: 14px; }
                }
            </style>
            <script>
                // Auto-refresh setiap 30 detik untuk update status
                setTimeout(() => location.reload(), 30000);
            </script>
        </head>
        <body>
            <div class="container">
                <h1>📱 WhatsApp Gateway QR Code</h1>
                <p class="subtitle">Scan QR code ini dengan WhatsApp untuk menghubungkan gateway</p>
                
                <div class="status ${isClientReady ? 'ready' : 'not-ready'}">
                    ${isClientReady ? '✅ Connected' : '⚠️ Waiting for Scan'}
                </div>
                
                <div style="margin: 30px 0;">
                    <img src="data:image/png;base64,${fs.readFileSync(qrPath).toString('base64')}" 
                         alt="WhatsApp QR Code" />
                </div>
                
                <div class="instructions">
                    <h3 style="margin-top: 0; color: #667eea;">📋 Cara Scan QR Code:</h3>
                    <ol>
                        <li>Buka <strong>WhatsApp</strong> di HP Anda</li>
                        <li>Tap <strong>Menu (⋮)</strong> atau <strong>Settings</strong></li>
                        <li>Pilih <strong>Linked Devices</strong></li>
                        <li>Tap <strong>Link a Device</strong></li>
                        <li>Scan QR code di atas</li>
                        <li>Tunggu hingga status berubah menjadi <strong>Connected ✅</strong></li>
                    </ol>
                </div>
                
                <div>
                    <button onclick="location.reload()">🔄 Refresh QR Code</button>
                    <button onclick="window.location.href='/status'">📊 Check Status</button>
                    <button onclick="window.location.href='/admin'">⚙️ Admin Panel</button>
                    <button onclick="window.location.href='/'">🏠 Home</button>
                </div>
                
                <div class="footer">
                    <p><strong>WhatsApp Gateway ChillAjar</strong></p>
                    <p>Halaman ini akan refresh otomatis setiap 30 detik</p>
                    <p style="font-size: 12px; margin-top: 10px;">
                        Jika QR expired, restart container untuk generate QR baru
                    </p>
                </div>
            </div>
        </body>
        </html>
    `);
});

// Endpoint admin panel untuk management WhatsApp Gateway
app.get("/admin", async (req, res) => {
    const fs = require("fs");
    const path = require("path");
    const qrPath = path.join(__dirname, "wa-qr.png");
    const hasQR = fs.existsSync(qrPath);
    
    let clientInfo = null;
    if (isClientReady) {
        try {
            const info = await client.info;
            clientInfo = {
                wid: info.wid._serialized,
                pushname: info.pushname,
                platform: info.platform
            };
        } catch (err) {
            console.error('Error getting client info:', err);
        }
    }

    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>WhatsApp Gateway - Admin Panel</title>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { 
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    padding: 20px;
                    min-height: 100vh;
                }
                .container {
                    max-width: 1200px;
                    margin: 0 auto;
                }
                .header {
                    background: white;
                    padding: 30px;
                    border-radius: 15px;
                    margin-bottom: 20px;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.3);
                }
                .header h1 {
                    color: #667eea;
                    margin-bottom: 10px;
                }
                .header p {
                    color: #666;
                }
                .grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                    gap: 20px;
                    margin-bottom: 20px;
                }
                .card {
                    background: white;
                    padding: 25px;
                    border-radius: 15px;
                    box-shadow: 0 5px 15px rgba(0,0,0,0.2);
                }
                .card h2 {
                    color: #667eea;
                    margin-bottom: 15px;
                    font-size: 20px;
                }
                .status-badge {
                    display: inline-block;
                    padding: 8px 16px;
                    border-radius: 20px;
                    font-weight: bold;
                    font-size: 14px;
                    margin: 5px 0;
                }
                .status-badge.success {
                    background: #d4edda;
                    color: #155724;
                    border: 1px solid #c3e6cb;
                }
                .status-badge.warning {
                    background: #fff3cd;
                    color: #856404;
                    border: 1px solid #ffc107;
                }
                .status-badge.danger {
                    background: #f8d7da;
                    color: #721c24;
                    border: 1px solid #f5c6cb;
                }
                .info-row {
                    display: flex;
                    justify-content: space-between;
                    padding: 10px 0;
                    border-bottom: 1px solid #eee;
                }
                .info-row:last-child {
                    border-bottom: none;
                }
                .info-label {
                    font-weight: bold;
                    color: #555;
                }
                .info-value {
                    color: #333;
                }
                button, .btn {
                    background: #667eea;
                    color: white;
                    border: none;
                    padding: 12px 24px;
                    border-radius: 25px;
                    cursor: pointer;
                    font-size: 14px;
                    margin: 5px;
                    transition: all 0.3s;
                    display: inline-block;
                    text-decoration: none;
                }
                button:hover, .btn:hover {
                    background: #764ba2;
                    transform: translateY(-2px);
                    box-shadow: 0 5px 15px rgba(0,0,0,0.3);
                }
                button.danger {
                    background: #dc3545;
                }
                button.danger:hover {
                    background: #c82333;
                }
                button.success {
                    background: #28a745;
                }
                button.success:hover {
                    background: #218838;
                }
                .action-buttons {
                    margin-top: 20px;
                    text-align: center;
                }
                .qr-preview {
                    text-align: center;
                    margin: 20px 0;
                }
                .qr-preview img {
                    max-width: 250px;
                    border: 3px solid #667eea;
                    border-radius: 10px;
                }
                .alert {
                    padding: 15px;
                    border-radius: 8px;
                    margin: 15px 0;
                }
                .alert.info {
                    background: #d1ecf1;
                    color: #0c5460;
                    border: 1px solid #bee5eb;
                }
                .alert.success {
                    background: #d4edda;
                    color: #155724;
                    border: 1px solid #c3e6cb;
                }
                .alert.warning {
                    background: #fff3cd;
                    color: #856404;
                    border: 1px solid #ffc107;
                }
                .footer {
                    text-align: center;
                    color: white;
                    margin-top: 30px;
                    padding: 20px;
                }
                @media (max-width: 768px) {
                    .grid {
                        grid-template-columns: 1fr;
                    }
                    .header h1 {
                        font-size: 24px;
                    }
                }
            </style>
            <script>
                function refreshStatus() {
                    fetch('/status')
                        .then(res => res.json())
                        .then(data => {
                            if (data.ready) {
                                location.reload();
                            }
                        });
                }
                
                function forceReconnect() {
                    if (confirm('Apakah Anda yakin ingin reconnect WhatsApp client? Ini akan generate QR code baru.')) {
                        fetch('/admin/reconnect', { method: 'POST' })
                            .then(res => res.json())
                            .then(data => {
                                alert(data.message);
                                setTimeout(() => location.reload(), 2000);
                            })
                            .catch(err => alert('Error: ' + err.message));
                    }
                }
                
                function testMessage() {
                    const phone = prompt('Masukkan nomor WhatsApp (format: 628xxx):');
                    if (!phone) return;
                    
                    const message = prompt('Masukkan pesan test:');
                    if (!message) return;
                    
                    fetch('/send-message', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            phone: phone,
                            message: message,
                            sender: '${process.env.WA_SENDER || '628xxx'}'
                        })
                    })
                    .then(res => res.json())
                    .then(data => {
                        if (data.status) {
                            alert('✅ Pesan berhasil dikirim!');
                        } else {
                            alert('❌ Gagal: ' + data.message);
                        }
                    })
                    .catch(err => alert('Error: ' + err.message));
                }
                
                // Auto-refresh setiap 30 detik
                setInterval(refreshStatus, 30000);
            </script>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>⚙️ WhatsApp Gateway - Admin Panel</h1>
                    <p>Management & Monitoring Dashboard</p>
                </div>
                
                <div class="grid">
                    <!-- Connection Status -->
                    <div class="card">
                        <h2>📡 Connection Status</h2>
                        <div style="text-align: center; margin: 20px 0;">
                            <div class="status-badge ${isClientReady ? 'success' : 'danger'}">
                                ${isClientReady ? '✅ CONNECTED' : '❌ DISCONNECTED'}
                            </div>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Status:</span>
                            <span class="info-value">${isClientReady ? 'Ready' : 'Not Ready'}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Reconnect Attempts:</span>
                            <span class="info-value">${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">QR Code:</span>
                            <span class="info-value">${hasQR ? 'Available' : 'Not Available'}</span>
                        </div>
                    </div>
                    
                    <!-- Client Info -->
                    <div class="card">
                        <h2>📱 Client Information</h2>
                        ${clientInfo ? `
                            <div class="info-row">
                                <span class="info-label">WhatsApp ID:</span>
                                <span class="info-value">${clientInfo.wid}</span>
                            </div>
                            <div class="info-row">
                                <span class="info-label">Push Name:</span>
                                <span class="info-value">${clientInfo.pushname}</span>
                            </div>
                            <div class="info-row">
                                <span class="info-label">Platform:</span>
                                <span class="info-value">${clientInfo.platform}</span>
                            </div>
                        ` : `
                            <div class="alert warning">
                                ⚠️ Client belum terhubung. Silakan scan QR code untuk menghubungkan WhatsApp.
                            </div>
                        `}
                    </div>
                    
                    <!-- System Info -->
                    <div class="card">
                        <h2>🖥️ System Information</h2>
                        <div class="info-row">
                            <span class="info-label">Version:</span>
                            <span class="info-value">1.31.0</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Uptime:</span>
                            <span class="info-value">${Math.floor(process.uptime())} seconds</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Port:</span>
                            <span class="info-value">${port}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Environment:</span>
                            <span class="info-value">${process.env.NODE_ENV || 'production'}</span>
                        </div>
                    </div>
                </div>
                
                ${hasQR && !isClientReady ? `
                <div class="card">
                    <h2>📱 QR Code Preview</h2>
                    <div class="alert info">
                        💡 Scan QR code ini untuk menghubungkan WhatsApp Gateway
                    </div>
                    <div class="qr-preview">
                        <img src="data:image/png;base64,${fs.readFileSync(qrPath).toString('base64')}" 
                             alt="WhatsApp QR Code" />
                    </div>
                    <div class="action-buttons">
                        <button onclick="window.location.href='/qr'">🔍 View Full Size</button>
                    </div>
                </div>
                ` : ''}
                
                ${isClientReady ? `
                <div class="card">
                    <h2>✅ Gateway Connected</h2>
                    <div class="alert success">
                        🎉 WhatsApp Gateway sudah terhubung dan siap digunakan!
                    </div>
                    <div class="action-buttons">
                        <button class="success" onclick="testMessage()">📤 Test Send Message</button>
                        <button onclick="window.location.href='/status'">📊 View Status JSON</button>
                    </div>
                </div>
                ` : ''}
                
                <!-- Actions -->
                <div class="card">
                    <h2>🎛️ Actions</h2>
                    <div class="action-buttons">
                        <button onclick="location.reload()">🔄 Refresh</button>
                        <button onclick="window.location.href='/qr'">📱 View QR Code</button>
                        <button onclick="window.location.href='/status'">📊 Check Status</button>
                        <button onclick="window.location.href='/'">🏠 Home</button>
                        ${!isClientReady ? '<button class="danger" onclick="forceReconnect()">🔌 Force Reconnect</button>' : ''}
                    </div>
                </div>
                
                <!-- Quick Links -->
                <div class="card">
                    <h2>🔗 Quick Links</h2>
                    <div style="line-height: 2;">
                        <a href="/" style="color: #667eea; text-decoration: none;">• Home</a><br>
                        <a href="/status" style="color: #667eea; text-decoration: none;">• Status API</a><br>
                        <a href="/health" style="color: #667eea; text-decoration: none;">• Health Check</a><br>
                        <a href="/qr" style="color: #667eea; text-decoration: none;">• QR Code Page</a><br>
                        <a href="/admin" style="color: #667eea; text-decoration: none;">• Admin Panel (current)</a><br>
                    </div>
                </div>
            </div>
            
            <div class="footer">
                <p><strong>WhatsApp Gateway ChillAjar</strong></p>
                <p>Admin Panel v1.31.0</p>
                <p style="font-size: 12px; margin-top: 10px;">
                    Auto-refresh status every 30 seconds
                </p>
            </div>
        </body>
        </html>
    `);
});

// Endpoint untuk force reconnect (generate QR baru)
app.post("/admin/reconnect", async (req, res) => {
    if (isClientReady) {
        return res.json({
            status: false,
            message: "Client sudah terhubung. Logout dari WhatsApp untuk reconnect."
        });
    }
    
    try {
        console.log('Force reconnect requested from admin panel');
        reconnectAttempts = 0; // Reset counter
        await client.destroy();
        setTimeout(() => {
            client.initialize();
        }, 2000);
        
        res.json({
            status: true,
            message: "Reconnect initiated. QR code akan di-generate dalam beberapa detik."
        });
    } catch (err) {
        res.status(500).json({
            status: false,
            message: "Gagal reconnect: " + err.message
        });
    }
});

const server = app.listen(port, () => {
    console.log(`Gateway listening on http://localhost:${port}`);
});

// Graceful shutdown untuk mencegah restart loop
process.on('SIGTERM', async () => {
    console.log('SIGTERM signal received: closing HTTP server');
    server.close(async () => {
        console.log('HTTP server closed');
        try {
            await client.destroy();
            console.log('WhatsApp client destroyed');
            process.exit(0);
        } catch (err) {
            console.error('Error destroying client:', err);
            process.exit(1);
        }
    });
});

process.on('SIGINT', async () => {
    console.log('SIGINT signal received: closing HTTP server');
    server.close(async () => {
        console.log('HTTP server closed');
        try {
            await client.destroy();
            console.log('WhatsApp client destroyed');
            process.exit(0);
        } catch (err) {
            console.error('Error destroying client:', err);
            process.exit(1);
        }
    });
});

// Handle uncaught errors untuk mencegah crash tanpa log
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    // Tidak exit agar container tidak restart loop
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Tidak exit agar container tidak restart loop
});
