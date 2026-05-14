'use strict';

const { Router } = require('express');
const { state, validateClientReady } = require('../services/whatsapp');
const { log } = require('../config/logger');

const router = Router();

function handleSend(req, res) {
    const { phone, message, sender } = req.body;

    if (!phone || !message || !sender) {
        return res.status(400).json({ status: false, message: 'phone, message, sender wajib diisi' });
    }
    if (process.env.WA_SENDER && sender !== process.env.WA_SENDER) {
        return res.status(403).json({ status: false, message: 'Sender tidak sesuai' });
    }

    const validation = validateClientReady();
    if (!validation.valid) {
        return res.status(validation.status).json({ status: false, message: validation.message });
    }
    if (!/^62\d{9,15}$/.test(phone)) {
        return res.status(400).json({ status: false, message: 'Format nomor WhatsApp harus diawali 62 dan hanya angka.' });
    }

    state.sock.sendMessage(phone + '@s.whatsapp.net', { text: message })
        .then(() => res.json({ status: true, message: 'Pesan berhasil dikirim' }))
        .catch(err => {
            log.error('Gagal kirim pesan', { phone, error: err.message });
            res.status(500).json({ status: false, message: 'Gagal mengirim pesan', error: err.message });
        });
}

router.post('/send-message', handleSend);
router.post('/chat/send', handleSend);

module.exports = router;
