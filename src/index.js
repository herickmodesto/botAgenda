'use strict';

require('dotenv').config();

const path = require('path');
const pino = require('pino');

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  isJidGroup,
} = require('@whiskeysockets/baileys');

const { parseMessage }    = require('./parser');
const { parseTask }       = require('./taskParser');
const { detectCategory }  = require('./categories');
const { insertEntry, insertTask } = require('./database');
const { formatEntry, formatTaskCreated } = require('./formatter');
const { dispatch }        = require('./commands');
const { startScheduler }  = require('./scheduler');
const { startQRServer, setQR, setConnected } = require('./qrServer');

// ── Config ────────────────────────────────────────────────────────────────────

const SESSION_DIR = process.env.NODE_ENV === 'production'
  ? '/data/session'
  : path.join(__dirname, '..', '.session');

const ALLOWED_NUMBERS = process.env.ALLOWED_NUMBERS
  ? process.env.ALLOWED_NUMBERS.split(',').map(n => n.trim().replace(/\D/g, ''))
  : [];

const logger = pino({ level: 'silent' });

// ── Helpers ───────────────────────────────────────────────────────────────────

function getBody(msg) {
  return (
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    msg.message?.videoMessage?.caption ||
    ''
  ).trim();
}

function isAllowed(jid) {
  if (ALLOWED_NUMBERS.length === 0) return true;
  const num = jid.replace(/[^0-9]/g, '');
  return ALLOWED_NUMBERS.includes(num);
}

// ── Deduplicação ──────────────────────────────────────────────────────────────

const processedIds = new Set();
const BOT_START_TS = Math.floor(Date.now() / 1000);

function shouldProcess(msg) {
  if (msg.messageTimestamp && Number(msg.messageTimestamp) < BOT_START_TS - 10) return false;
  const id = msg.key.id;
  if (!id) return true;
  if (processedIds.has(id)) return false;
  processedIds.add(id);
  if (processedIds.size > 500) processedIds.delete(processedIds.values().next().value);
  return true;
}

// ── Processamento de mensagem ─────────────────────────────────────────────────

async function processMessage(sock, msg) {
  const body = getBody(msg);
  if (!body) return;

  const jid    = msg.key.remoteJid;
  const fromMe = msg.key.fromMe;

  if (isJidGroup(jid)) return; // grupos ignorados por padrão

  if (!fromMe && !isAllowed(jid)) return;

  const chatId = jid;
  console.log(`[msg] jid=${jid} fromMe=${fromMe} body="${body.substring(0, 40)}"`);

  try {
    // ── Comandos ─────────────────────────────────────────────────────────────
    if (body.startsWith('/')) {
      const reply = dispatch(body, chatId);
      await sock.sendMessage(chatId, {
        text: reply || '❓ Comando desconhecido.\nUse */ajuda* para ver os comandos.',
      });
      return;
    }

    // ── Tarefa / lembrete ─────────────────────────────────────────────────────
    const task = parseTask(body);
    if (task) {
      const result = insertTask({ ...task, chatId });
      task.id = result.lastInsertRowid;
      await sock.sendMessage(chatId, { text: formatTaskCreated(task) });
      return;
    }

    // ── Lançamentos financeiros ───────────────────────────────────────────────
    const entries = parseMessage(body);
    if (entries && entries.length > 0) {
      for (const entry of entries) {
        const category = detectCategory(entry.description);
        insertEntry({ ...entry, category, chatId });
        await sock.sendMessage(chatId, { text: formatEntry(entry, category) });
      }
      return;
    }

    // Mensagem não reconhecida — silêncio
  } catch (err) {
    console.error('Erro ao processar mensagem:', err);
  }
}

// ── Conexão Baileys ───────────────────────────────────────────────────────────

let schedulerStarted = false;

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    printQRInTerminal: false,
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
    markOnlineOnConnect: false,
    getMessage: async () => undefined,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log('[qr] novo QR — acesse a URL do serviço para escanear');
      setQR(qr);
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      console.log(`[connection] fechada (código ${code}) — reconectar: ${!loggedOut}`);
      if (loggedOut) {
        process.exit(1);
      } else {
        setTimeout(connectToWhatsApp, 5000);
      }
    }

    if (connection === 'open') {
      console.log('✅ WhatsApp conectado!');
      setConnected('Bot de Finanças & Agenda conectado. ✅');
      if (!schedulerStarted) {
        schedulerStarted = true;
        startScheduler(sock);
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      if (!shouldProcess(msg)) continue;
      await processMessage(sock, msg);
    }
  });
}

// ── Inicialização ─────────────────────────────────────────────────────────────

process.on('uncaughtException', (err) => {
  console.error('❌ Erro não tratado:', err.message);
  process.exit(1);
});
process.on('unhandledRejection', (err) => {
  console.error('❌ Promise rejeitada:', err?.message || err);
  process.exit(1);
});

startQRServer();
console.log('🚀 Iniciando bot (Baileys — sem Chrome)...');
connectToWhatsApp().catch((err) => {
  console.error('Falha ao conectar:', err);
  process.exit(1);
});
