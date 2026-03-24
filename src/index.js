'use strict';

require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode  = require('qrcode-terminal');
const path    = require('path');

const { parseMessage }   = require('./parser');
const { parseTask }      = require('./taskParser');
const { detectCategory } = require('./categories');
const { insertEntry, insertTask } = require('./database');
const { formatEntry, formatTaskCreated } = require('./formatter');
const { dispatch }       = require('./commands');
const { startScheduler } = require('./scheduler');
const { isGroupAllowed, addGroup, removeGroup } = require('./config');
const { interpretMessage } = require('./ai');
const { startQRServer, setQR, setConnected } = require('./qrServer');

// ─── Cliente WhatsApp ────────────────────────────────────────────────────────

const AUTH_DIR = process.env.NODE_ENV === 'production'
  ? '/data/.wwebjs_auth'
  : path.join(__dirname, '..', '.wwebjs_auth');

const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: AUTH_DIR,
  }),
  puppeteer: {
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
    ],
    headless: true,
  },
});

// ─── Eventos ─────────────────────────────────────────────────────────────────

// Se PHONE_NUMBER estiver definido, usa código de pareamento (para deploy em nuvem)
// Caso contrário, exibe QR code no terminal (uso local)
const PHONE_NUMBER = process.env.PHONE_NUMBER; // ex: "5511999999999"

client.on('qr', (qr) => {
  setQR(qr);
  if (!PHONE_NUMBER) {
    // Local: também exibe QR no terminal
    console.log('\n📱 Escaneie o QR Code com seu WhatsApp:\n');
    qrcode.generate(qr, { small: true });
  }
});

client.on('authenticated', () => {
  console.log('✅ Autenticado com sucesso!');
});

client.on('auth_failure', (msg) => {
  console.error('❌ Falha na autenticação:', msg);
  process.exit(1);
});

client.on('ready', () => {
  console.log('🤖 Bot de finanças pronto!');
  console.log('   Envie uma mensagem como "gastei 50 almoço" ou /ajuda para começar.\n');
  setConnected('Bot de Finanças & Agenda conectado.');
  botReady = true;
  lastMessageTime = Date.now();
  startScheduler(client);
});

client.on('disconnected', (reason) => {
  console.log('⚠️  Desconectado:', reason, '— encerrando para reiniciar...');
  process.exit(1); // Railway reinicia automaticamente
});

// ─── Health check: detecta estado "zumbi" (conectado mas sem eventos) ────────

let lastMessageTime = Date.now();
let botReady = false;

setInterval(async () => {
  if (!botReady) return;
  const minutesSinceStart = (Date.now() - lastMessageTime) / 60000;
  // Se passou mais de 10 minutos sem nenhum evento, verifica o estado real
  if (minutesSinceStart > 10) {
    try {
      const state = await client.getState();
      console.log(`[health] estado: ${state}`);
      if (state !== 'CONNECTED') {
        console.log('[health] cliente desconectado — reiniciando...');
        process.exit(1);
      }
    } catch (err) {
      console.log('[health] erro ao verificar estado — reiniciando...', err.message);
      process.exit(1);
    }
  }
}, 5 * 60 * 1000); // verifica a cada 5 minutos

// ─── Processamento de mensagem ───────────────────────────────────────────────

async function processMessage(msg) {
  // Ignorar mensagens de status
  if (msg.from === 'status@broadcast') return;

  const body = msg.body?.trim();
  if (!body) return;

  // Determina o chatId
  const isGroup = msg.isGroupMsg
    || msg.to?.endsWith('@g.us')
    || msg.id?.remote?.endsWith('@g.us');

  const groupId = isGroup ? (msg.id?.remote || msg.to) : null;

  // Em grupos: só responde se o grupo estiver na lista de permitidos
  // (exceto para /ativar e /desativar)
  if (isGroup) {
    const lowerBody = body.toLowerCase().trim();
    const isAtivando = lowerBody === '/ativar' || lowerBody === '/desativar';

    if (!isAtivando && !isGroupAllowed(groupId)) return;
  }

  const chatId = isGroup
    ? groupId
    : msg.fromMe
      ? msg.to
      : msg.from;

  try {
    // ── Comandos (começam com /) ──────────────────────────────────────────
    if (body.startsWith('/')) {
      const lowerCmd = body.trim().toLowerCase();

      // /ativar — adiciona grupo à lista
      if (lowerCmd === '/ativar') {
        if (!isGroup) { return; }
        addGroup(groupId);
        const chat = await msg.getChat();
        await chat.sendMessage('✅ *Bot ativado neste grupo!*\nAgora responderei aqui.\n\nUse */ajuda* para ver os comandos.');
        return;
      }

      // /desativar — remove grupo da lista
      if (lowerCmd === '/desativar') {
        if (!isGroup) { return; }
        removeGroup(groupId);
        const chat = await msg.getChat();
        await chat.sendMessage('🔕 Bot desativado neste grupo.');
        return;
      }

      const reply = dispatch(body, chatId);
      if (reply) {
        const chat = await msg.getChat();
        await chat.sendMessage(reply);
      } else {
        const chat = await msg.getChat();
        await chat.sendMessage('❓ Comando desconhecido.\nUse */ajuda* para ver os comandos disponíveis.');
      }
      return;
    }

    // ── Tarefa / lembrete (parser local) ─────────────────────────────
    const task = parseTask(body);
    if (task) {
      const result = insertTask({ ...task, chatId });
      task.id = result.lastInsertRowid;
      const chat = await msg.getChat();
      await chat.sendMessage(formatTaskCreated(task));
      return;
    }

    // ── Lançamento financeiro (parser local) ──────────────────────────
    const parsed = parseMessage(body);
    if (parsed) {
      const category = detectCategory(parsed.description);
      insertEntry({ ...parsed, category, chatId });
      const chat = await msg.getChat();
      await chat.sendMessage(formatEntry(parsed, category));
      return;
    }

    // ── Fallback: Gemini interpreta linguagem natural ─────────────────
    const ai = await interpretMessage(body);
    if (!ai || ai.type === 'ignore') return;

    const chat = await msg.getChat();

    if (ai.type === 'task' && ai.description) {
      // Monta a data a partir do que o Gemini retornou
      const dateStr = ai.date || new Date().toISOString().split('T')[0];
      const timeStr = ai.time || '00:00';
      const dueAt   = new Date(`${dateStr}T${timeStr}:00`);

      if (isNaN(dueAt.getTime()) || dueAt < new Date()) {
        await chat.sendMessage('⚠️ Não consegui entender a data. Tente: `lembrar dentista dia 25 às 14h`');
        return;
      }

      const taskData = { description: ai.description, dueAt };
      const result   = insertTask({ ...taskData, chatId });
      taskData.id    = result.lastInsertRowid;
      await chat.sendMessage(formatTaskCreated(taskData));
      return;
    }

    if ((ai.type === 'expense' || ai.type === 'income') && ai.amount) {
      const entry = { type: ai.type, amount: ai.amount, description: ai.description || body };
      const category = detectCategory(entry.description);
      insertEntry({ ...entry, category, chatId });
      await chat.sendMessage(formatEntry(entry, category));
      return;
    }

    // Gemini entendeu mas faltam dados
    if (ai.type === 'expense' || ai.type === 'income') {
      await chat.sendMessage('⚠️ Não encontrei o valor. Tente: `gastei 50 almoço`');
    }

  } catch (err) {
    console.error('Erro ao processar mensagem:', err);
  }
}

// ─── Deduplicação e filtro de mensagens antigas ───────────────────────────────

const processedIds = new Set();
const BOT_START_TIME = Math.floor(Date.now() / 1000); // timestamp em segundos

function shouldProcess(msg) {
  // Ignora mensagens enviadas ANTES do bot iniciar (mensagens antigas ao reconectar)
  if (msg.timestamp && msg.timestamp < BOT_START_TIME - 5) return false;

  const id = msg.id?._serialized || msg.id?.id;
  if (!id) return true;
  if (processedIds.has(id)) return false;
  processedIds.add(id);
  if (processedIds.size > 500) {
    processedIds.delete(processedIds.values().next().value);
  }
  return true;
}

// ─── Mensagens recebidas (de outros OU suas — local e nuvem) ─────────────────

client.on('message', async (msg) => {
  lastMessageTime = Date.now();
  console.log(`[message] from=${msg.from} to=${msg.to} fromMe=${msg.fromMe} body="${msg.body?.substring(0,30)}"`);
  if (!shouldProcess(msg)) return;
  await processMessage(msg);
});

// ─── Mensagens criadas por você (self-chat e grupos no PC local) ─────────────

client.on('message_create', async (msg) => {
  console.log(`[message_create] from=${msg.from} to=${msg.to} fromMe=${msg.fromMe} body="${msg.body?.substring(0,30)}"`);
  if (!msg.fromMe) return;
  if (!shouldProcess(msg)) return;

  const isSelfChat = msg.from === msg.to;
  const isGroupMsg = msg.to?.endsWith('@g.us') || msg.id?.remote?.endsWith('@g.us');
  if (!isSelfChat && !isGroupMsg) return;

  await processMessage(msg);
});

// ─── Inicialização ───────────────────────────────────────────────────────────

// Qualquer erro não tratado encerra o processo para o Railway reiniciar
process.on('uncaughtException', (err) => {
  console.error('❌ Erro não tratado — reiniciando:', err.message);
  process.exit(1);
});
process.on('unhandledRejection', (err) => {
  console.error('❌ Promise rejeitada — reiniciando:', err?.message || err);
  process.exit(1);
});

startQRServer();
console.log('🚀 Iniciando bot de finanças...');
client.initialize().catch((err) => {
  console.error('❌ Erro ao inicializar o cliente:', err);
  process.exit(1);
});
