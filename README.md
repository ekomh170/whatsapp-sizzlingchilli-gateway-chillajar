# WhatsApp SizzlingChilli Gateway ChillAjar

> **Disclaimer**
>
> Aplikasi ini **bukan hasil karya saya pribadi**. Saya hanya menggunakan dan memodifikasi dari [whatsapp-web.js](https://wwebjs.dev/). Terima kasih banyak kepada developer whatsapp-web.js yang telah membuat library ini dan saya izin menggunakan untuk keperluan tugas kampus.

Gateway  whatsapp-web.js untuk mengirim notifikasi WhatsApp otomatis dari sistem Chill Ajar.

## Fitur Utama
- Mengirim pesan WhatsApp ke pelanggan secara otomatis saat event tertentu (misal: mentor klik "Selesai Sesi" di aplikasi Chill Ajar).
- Mendukung endpoint `/send-message` yang menerima parameter:
  - `phone`: nomor tujuan (format 62xxxxxxxxxxx)
  - `message`: isi pesan
  - `sender`: nomor sistem pengirim (harus sama dengan nomor WhatsApp yang login di gateway)
- Dapat dijalankan di server lokal, VPS, atau cloud (misal AWS EC2).
- Terintegrasi dengan backend Laravel Chill Ajar melalui HTTP API.

## Cara Kerja
1. Jalankan gateway dan login dengan nomor WhatsApp sistem (scan QR code di awal).
2. Backend Laravel mengirim request ke endpoint gateway untuk mengirim pesan ke pelanggan.
3. Gateway meneruskan pesan ke WhatsApp menggunakan whatsapp-web.js.

## Catatan
- Nomor WhatsApp sistem hanya bisa aktif di satu device/browser pada satu waktu.
- Untuk multi-device/multi-sender, perlu modifikasi lebih lanjut.
- Pastikan port 3000 (atau port yang digunakan) terbuka untuk backend.

---

<div align="center">
    <br />
    <p>
        <a href="https://wwebjs.dev"><img src="https://github.com/wwebjs/logos/blob/main/4_Full%20Logo%20Lockup_Small/small_banner_blue.png?raw=true" title="whatsapp-web.js" alt="WWebJS Website" width="500" /></a>
    </p>
    <br />
    <p>
        <a href="https://www.npmjs.com/package/whatsapp-web.js"><img src="https://img.shields.io/npm/v/whatsapp-web.js.svg" alt="npm" /></a>
        <a href="https://depfu.com/github/pedroslopez/whatsapp-web.js?project_id=9765"><img src="https://badges.depfu.com/badges/4a65a0de96ece65fdf39e294e0c8dcba/overview.svg" alt="Depfu" /></a>
        <img src="https://img.shields.io/badge/WhatsApp_Web-2.3000.1017054665-brightgreen.svg" alt="WhatsApp_Web 2.2346.52" />
        <a href="https://discord.gg/H7DqQs4"><img src="https://img.shields.io/discord/698610475432411196.svg?logo=discord" alt="Discord server" /></a>
    </p>
    <br />
</div>

## About
**A WhatsApp API client that connects through the WhatsApp Web browser app**

The library works by launching the WhatsApp Web browser application and managing it using Puppeteer to create an instance of WhatsApp Web, thereby mitigating the risk of being blocked. The WhatsApp API client connects through the WhatsApp Web browser app, accessing its internal functions. This grants you access to nearly all the features available on WhatsApp Web, enabling dynamic handling similar to any other Node.js application.