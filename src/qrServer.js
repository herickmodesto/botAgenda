'use strict';

const express = require('express');
const QRCode  = require('qrcode');

const app = express();

let _qr     = null;
let _status = 'Aguardando conexão...';

app.get('/', async (req, res) => {
  if (_qr) {
    try {
      const qrImg = await QRCode.toDataURL(_qr, { width: 300, margin: 2 });
      res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Bot — Escaneie o QR</title>
  <style>
    body { background:#111; color:#fff; font-family:sans-serif; text-align:center; padding:40px 20px; }
    img  { border-radius:12px; max-width:300px; width:90vw; }
    p    { color:#aaa; max-width:400px; margin:16px auto; }
  </style>
</head>
<body>
  <h2>📱 Escaneie com seu WhatsApp</h2>
  <img src="${qrImg}" alt="QR Code">
  <p>WhatsApp → Dispositivos conectados → Conectar dispositivo</p>
  <p style="font-size:0.85em">Atualiza automaticamente a cada 15s.</p>
  <script>setTimeout(()=>location.reload(),15000)</script>
</body>
</html>`);
    } catch {
      res.status(500).send('Erro ao gerar QR.');
    }
  } else {
    res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Bot de Finanças</title>
  <style>
    body { background:#111; color:#fff; font-family:sans-serif; text-align:center; padding:60px 20px; }
    .ok  { font-size:1.2em; color:#4ade80; margin-top:24px; }
  </style>
</head>
<body>
  <h2>🤖 Bot de Finanças & Agenda</h2>
  <div class="ok">${_status}</div>
  <script>setTimeout(()=>location.reload(),10000)</script>
</body>
</html>`);
  }
});

function setQR(qr)         { _qr = qr; }
function setConnected(msg) { _qr = null; _status = msg || 'Conectado!'; }

function startQRServer() {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`🌐 Servidor web rodando na porta ${PORT}`));
}

module.exports = { startQRServer, setQR, setConnected };
