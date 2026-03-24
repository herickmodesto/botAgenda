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
  startScheduler(client);
});

client.on('disconnected', (reason) => {
  console.log('⚠️  Desconectado:', reason);
  console.log('   Tentando reconectar...');
  client.initialize().catch(console.error);
});

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

// ─── Mensagens recebidas de outros (incluindo membros do grupo) ──────────────

client.on('message', async (msg) => {
  if (msg.fromMe) return; // tratado pelo message_create
  await processMessage(msg);
});

// ─── Mensagens enviadas por você (self-chat E grupos) ────────────────────────

client.on('message_create', async (msg) => {
  if (!msg.fromMe) return;

  const isSelfChat = msg.from === msg.to;
  const isGroupMsg = msg.to?.endsWith('@g.us') || msg.id?.remote?.endsWith('@g.us');

  if (!isSelfChat && !isGroupMsg) return;

  await processMessage(msg);
});

// ─── Inicialização ───────────────────────────────────────────────────────────

startQRServer();
console.log('🚀 Iniciando bot de finanças...');
client.initialize().catch((err) => {
  console.error('❌ Erro ao inicializar o cliente:', err);
  process.exit(1);
});
