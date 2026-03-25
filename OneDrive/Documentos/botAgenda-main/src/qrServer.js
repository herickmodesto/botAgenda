'use strict';

const express = require('express');
const QRCode  = require('qrcode');

const app  = express();
const PORT = process.env.PORT || 3000;

let currentQR     = null;
let isConnected   = false;
let connectedInfo = '';

app.get('/', async (req, res) => {
  if (isConnected) {
    return res.send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Bot WhatsApp</title>
<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f0f2f5;}
.card{background:white;padding:40px;border-radius:16px;text-align:center;box-shadow:0 2px 20px rgba(0,0,0,.1);}
h2{color:#25d366;margin:0 0 10px;}p{color:#666;}</style></head>
<body><div class="card"><h2>✅ Bot Conectado!</h2><p>${connectedInfo}</p><p>O bot está rodando normalmente.</p></div></body></html>`);
  }

  if (!currentQR) {
    return res.send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta http-equiv="refresh" content="3"><title>Aguardando QR</title>
<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f0f2f5;}
.card{background:white;padding:40px;border-radius:16px;text-align:center;box-shadow:0 2px 20px rgba(0,0,0,.1);}
.spin{font-size:48px;animation:spin 1s linear infinite;}
@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}</style></head>
<body><div class="card"><div class="spin">⏳</div><h2>Gerando QR Code...</h2><p>A página vai atualizar automaticamente.</p></div></body></html>`);
  }

  try {
    const qrImage = await QRCode.toDataURL(currentQR, { width: 300, margin: 2 });
    res.send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta http-equiv="refresh" content="30"><title>Escanear QR</title>
<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f0f2f5;}
.card{background:white;padding:32px;border-radius:16px;text-align:center;box-shadow:0 2px 20px rgba(0,0,0,.1);}
h2{color:#128c7e;margin:0 0 4px;}p{color:#666;margin:4px 0;}img{border:4px solid #25d366;border-radius:8px;margin:16px 0;}
.steps{text-align:left;background:#f8f8f8;padding:16px;border-radius:8px;margin-top:16px;font-size:14px;}
.steps li{margin:6px 0;}</style></head>
<body><div class="card">
  <h2>📱 Escaneie o QR Code</h2>
  <p>O código expira em ~30 segundos — a página atualiza sozinha</p>
  <img src="${qrImage}" alt="QR Code"/>
  <div class="steps"><ol>
    <li>Abra o WhatsApp no celular</li>
    <li>Vá em <strong>Configurações → Dispositivos Vinculados</strong></li>
    <li>Toque em <strong>Vincular dispositivo</strong></li>
    <li>Escaneie o QR Code acima</li>
  </ol></div>
</div></body></html>`);
  } catch (err) {
    res.status(500).send('Erro ao gerar QR Code: ' + err.message);
  }
});

function startQRServer() {
  app.listen(PORT, () => {
    console.log(`🌐 Servidor QR rodando na porta ${PORT}`);
  });
}

function setQR(qr) {
  currentQR = qr;
}

function setConnected(info = '') {
  isConnected   = true;
  currentQR     = null;
  connectedInfo = info;
}

module.exports = { startQRServer, setQR, setConnected };
