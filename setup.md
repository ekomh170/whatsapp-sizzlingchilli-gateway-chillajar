# Setup WhatsApp Gateway (whatsapp-sizzlingchilli-gateway-chillajar)

## Struktur Folder
- /home/ubuntu/whatsapp-sizzlingchilli-gateway-chillajar  (WhatsApp Gateway Node.js)

## 1. Update & Install Dependency Umum
sudo apt update && sudo apt upgrade -y
sudo apt install -y nginx git unzip

## 2. Install Node.js & Chromium (untuk Gateway)
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt install -y nodejs
sudo apt install -y chromium-browser
# Jika error puppeteer/Chromium, install juga:
sudo apt install -y libatk-bridge2.0-0 libgtk-3-0 libxss1 libasound2 libgbm1 libnss3 libxshmfence1

## 3. Clone/Upload Project
cd /home/ubuntu
git clone <repo-gateway> whatsapp-sizzlingchilli-gateway-chillajar

## 4. Setup Gateway Node.js
cd ~/whatsapp-sizzlingchilli-gateway-chillajar
npm install
# Edit .env (WA_SENDER, PORT, WA_GATEWAY_URL)

## 5. Jalankan Gateway (Node.js)
cd ~/whatsapp-sizzlingchilli-gateway-chillajar
npm start
# Scan QR code WhatsApp di terminal atau download wa-qr.png
# Jika di server headless:
#   - QR code otomatis disimpan ke wa-qr.png
#   - Download ke lokal: scp -i <key.pem> ubuntu@<ip-server>:/home/ubuntu/whatsapp-sizzlingchilli-gateway-chillajar/wa-qr.png .

## 6. (Opsional) Jalankan Gateway dengan pm2 (Agar Otomatis & Background)
sudo npm install -g pm2
pm2 start server.js --name wa-gateway
pm2 save
pm2 startup
# Jalankan perintah yang diminta PM2 setelah 'pm2 startup'

## 7. Setup Nginx (Opsional)
# Reverse proxy Gateway ke port 80/subdomain

## 8. Security Group AWS
- Buka port 22 (SSH), 80/443 (web), 3000 (gateway, jika perlu)
- Batasi port 3000 hanya untuk backend jika ingin lebih aman

## 9. Testing
- Akses Gateway: http://<ip-server>:3000
- Tes kirim pesan ke endpoint /send-message

---
**Catatan:**
- Jangan upload file .env, node_modules, .wwebjs_auth ke repo publik
- Pastikan hanya 1 device login WhatsApp
- Backup data dan update rutin
- Jika gateway di-restart, sesi WhatsApp tetap login selama folder .wwebjs_auth tidak dihapus
- Untuk troubleshooting puppeteer/Chromium, cek error log dan pastikan semua dependency sudah terinstall
