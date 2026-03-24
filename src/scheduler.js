'use strict';

const {
  getPendingNotifications,
  markNotified1d,
  markNotified1h,
  markNotifiedNow,
} = require('./database');

const MONTH_NAMES = [
  'janeiro','fevereiro','março','abril','maio','junho',
  'julho','agosto','setembro','outubro','novembro','dezembro'
];

function formatDueAt(dueAtStr) {
  const d   = new Date(dueAtStr);
  const day = String(d.getDate()).padStart(2, '0');
  const mon = MONTH_NAMES[d.getMonth()];
  const h   = String(d.getHours()).padStart(2, '0');
  const m   = String(d.getMinutes()).padStart(2, '0');
  return `${day} de ${mon} às ${h}:${m}`;
}

function buildMessage(task, type) {
  const when = formatDueAt(task.due_at);
  if (type === '1d') {
    return `⏰ *Lembrete - amanhã!*\n\n📌 ${task.description}\n📅 ${when}\n\n_(ID: ${task.id} — use /feito ${task.id} para concluir)_`;
  }
  if (type === '1h') {
    return `⏰ *Lembrete - em 1 hora!*\n\n📌 ${task.description}\n📅 ${when}\n\n_(ID: ${task.id} — use /feito ${task.id} para concluir)_`;
  }
  return `🔔 *Hora do compromisso!*\n\n📌 ${task.description}\n📅 ${when}\n\n_(ID: ${task.id} — use /feito ${task.id} para concluir)_`;
}

/**
 * Inicia o agendador de notificações (verifica a cada minuto)
 * @param {import('whatsapp-web.js').Client} client
 */
function startScheduler(client) {
  console.log('⏱️  Agendador de lembretes iniciado.');

  setInterval(async () => {
    try {
      const tasks = getPendingNotifications();
      const now   = new Date();

      for (const task of tasks) {
        const due     = new Date(task.due_at);
        const diffMs  = due - now;
        const diffMin = diffMs / 60000;

        let type = null;

        if (!task.notified_now && Math.abs(diffMin) <= 2) {
          type = 'now';
          markNotifiedNow(task.id);
        } else if (!task.notified_1h && diffMin >= 55 && diffMin <= 65) {
          type = '1h';
          markNotified1h(task.id);
        } else if (!task.notified_1d && diffMin >= 23 * 60 && diffMin <= 25 * 60) {
          type = '1d';
          markNotified1d(task.id);
        }

        if (!type) continue;

        const message = buildMessage(task, type);

        try {
          const chat = await client.getChatById(task.chat_id);
          await chat.sendMessage(message);
          console.log(`📨 Notificação [${type}] enviada para ${task.chat_id}: ${task.description}`);
        } catch (err) {
          console.error(`Erro ao enviar notificação para ${task.chat_id}:`, err.message);
        }
      }
    } catch (err) {
      console.error('Erro no agendador:', err);
    }
  }, 60 * 1000); // verifica a cada 1 minuto
}

module.exports = { startScheduler };
