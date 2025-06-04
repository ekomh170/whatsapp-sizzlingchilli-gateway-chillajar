// server.js
// Express server untuk menerima request /send-message dan mengirim pesan WhatsApp

const express = require("express");
const bodyParser = require("body-parser");
const { Client, LocalAuth } = require("./index");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json());

// Inisialisasi WhatsApp client
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { headless: true },
});

client.initialize();

client.on("qr", (qr) => {
    console.log("QR RECEIVED", qr);
});

let isClientReady = false;

client.on("ready", () => {
    isClientReady = true;
    console.log("WhatsApp client is ready!");
});

client.on("disconnected", (reason) => {
    isClientReady = false;
    console.log("WhatsApp client disconnected:", reason);
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

app.listen(port, () => {
    console.log(`Gateway listening on http://localhost:${port}`);
});
