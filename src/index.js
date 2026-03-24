'use strict';

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

client.on('qr', async (qr) => {
  if (PHONE_NUMBER) {
    // Nuvem: solicita código de pareamento em vez de QR
    try {
      const code = await client.requestPairingCode(PHONE_NUMBER);
      console.log(`\n📱 Código de pareamento: ${code}`);
      console.log('   No WhatsApp: Configurações → Dispositivos Vinculados → Vincular com número de telefone\n');
    } catch (err) {
      console.error('Erro ao solicitar código de pareamento:', err.message);
    }
  } else {
    // Local: exibe QR no terminal
    console.log('\n📱 Escaneie o QR Code com seu WhatsApp (Dispositivos Vinculados → Vincular dispositivo):\n');
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

    // ── Tarefa / lembrete ─────────────────────────────────────────────
    const task = parseTask(body);
    if (task) {
      const result = insertTask({ ...task, chatId });
      task.id = result.lastInsertRowid;
      const chat = await msg.getChat();
      await chat.sendMessage(formatTaskCreated(task));
      return;
    }

    // ── Lançamento financeiro ─────────────────────────────────────────
    const parsed = parseMessage(body);
    if (!parsed) return;

    const category = detectCategory(parsed.description);
    insertEntry({ ...parsed, category, chatId });

    const reply = formatEntry(parsed, category);
    const chat = await msg.getChat();
    await chat.sendMessage(reply);

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

console.log('🚀 Iniciando bot de finanças...');
client.initialize().catch((err) => {
  console.error('❌ Erro ao inicializar o cliente:', err);
  process.exit(1);
});
