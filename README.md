# WhatsApp SizzlingChilli Gateway — ChillAjar

> Gateway WhatsApp berbasis [Baileys](https://github.com/WhiskeySockets/Baileys) untuk mengirim notifikasi otomatis dari sistem ChillAjar. Tidak menggunakan Puppeteer/browser — koneksi langsung via WebSocket ke WhatsApp Web.

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-brightgreen)](https://nodejs.org)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

---

## Fitur

- Kirim pesan WhatsApp ke pelanggan secara otomatis saat event tertentu (misal: mentor klik "Selesai Sesi")
- Login sekali via QR code — sesi disimpan di `auth_info_baileys/` (persisten)
- Admin panel di `/admin` untuk monitoring status dan reconnect
- QR code tersedia di `/qr` jika belum login
- Endpoint `/send-message` dan `/chat/send` untuk integrasi backend
- Logging ke file via Winston (`logs/combined.log`, `logs/error.log`)
- Siap deploy dengan Docker

---

## Teknologi

| Komponen | Keterangan |
|---|---|
| [Baileys](https://github.com/WhiskeySockets/Baileys) | WhatsApp Web protocol client (no Puppeteer) |
| Express.js | HTTP API server |
| Winston | Logging ke file & console |
| Docker | Containerization untuk production |

---

## Cara Kerja

1. Gateway login ke WhatsApp dengan scan QR code — sesi disimpan otomatis
2. Backend Laravel (ChillAjar) mengirim HTTP POST ke endpoint gateway saat ada event
3. Gateway meneruskan pesan ke nomor WhatsApp tujuan via Baileys

---

## Struktur Folder

```
.
├── server.js               # Entry point
├── src/
│   ├── app.js              # Express app setup
│   ├── config/
│   │   └── logger.js       # Winston logger
│   ├── routes/
│   │   ├── index.js
│   │   ├── message.js      # POST /send-message, /chat/send
│   │   ├── status.js       # GET /, /status, /health
│   │   ├── qr.js           # GET /qr
│   │   ├── admin.js        # GET /admin, POST /admin/reconnect|logout
│   │   └── logs.js         # GET/DELETE /admin/logs/*
│   └── services/
│       └── whatsapp.js     # Baileys connection & state
├── docker/
│   ├── Dockerfile
│   ├── entrypoint.sh
│   ├── docker-compose.yml
│   └── docker-compose.local.yml
├── scripts/
│   ├── deploy.ps1
│   └── build-and-push.sh
└── public/                 # Static assets (HTML halaman utama)
```

---

## Setup Lokal

### Prasyarat

- Node.js >= 18
- npm

### Instalasi

```bash
git clone https://github.com/ekomh170/whatsapp-sizzlingchilli-gateway-chillajar.git
cd whatsapp-sizzlingchilli-gateway-chillajar
npm install
```

### Konfigurasi

Salin `.env.example` ke `.env` dan sesuaikan:

```bash
cp .env.example .env
```

| Variabel | Contoh | Keterangan |
|---|---|---|
| `PORT` | `8086` | Port server |
| `WA_SENDER` | `6281234567890` | Nomor WA yang login sebagai gateway |
| `API_KEY` | `rahasia123` | API key untuk autentikasi request |

### Jalankan

```bash
npm start
```

Buka `http://localhost:8086/qr` untuk scan QR code saat pertama kali login.

---

## Deploy dengan Docker

```bash
# Build & jalankan
npm run docker:up

# Lihat logs (termasuk QR code)
npm run docker:logs

# Stop
npm run docker:down
```

Atau manual:

```bash
docker compose -f docker/docker-compose.yml up -d
docker logs chillajar_wa_gateway -f
```

Volume `wa_auth` menyimpan sesi WA secara persisten — tidak perlu scan ulang setiap restart.

---

## API Endpoints

### Kirim Pesan

```
POST /send-message
POST /chat/send
```

**Body:**

```json
{
  "phone": "6281234567890",
  "message": "Sesi telah selesai. Terima kasih!",
  "sender": "6281234567890"
}
```

**Header:**

```
x-api-key: <API_KEY>
```

### Status

```
GET /          → info gateway
GET /status    → status koneksi WA
GET /health    → health check
GET /qr        → halaman QR code (jika belum login)
```

### Admin

```
GET  /admin              → dashboard admin
POST /admin/reconnect    → paksa reconnect
POST /admin/logout       → logout & reset sesi
```

---

## Catatan Operasional

- **`auth_info_baileys/`** setara dengan credential — jangan di-commit, jangan masuk ke Docker image. Sudah di-exclude via `.gitignore` dan `.dockerignore`.
- **Logs** mengandung metadata pesan dan JID. Jangan expose ke publik.
- Nomor WhatsApp gateway hanya bisa aktif di satu device pada satu waktu.
- Gateway auto-reconnect saat koneksi terputus (maks 5 kali, exponential backoff).

---

## Lisensi

Apache 2.0 — lihat [LICENSE](LICENSE).

Gateway ini menggunakan [Baileys](https://github.com/WhiskeySockets/Baileys) yang dilisensikan di bawah MIT License.
