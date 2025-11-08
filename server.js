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
app.post("/send-message", async (req, res) => {
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
    res.send("WhatsApp Gateway is running!");
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
