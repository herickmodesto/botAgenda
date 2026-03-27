'use strict';

const { getPendingNotifications, markNotified1d, markNotified1h, markNotifiedNow } = require('./database');

const MONTH_NAMES = [
  'janeiro','fevereiro','março','abril','maio','junho',
  'julho','agosto','setembro','outubro','novembro','dezembro',
];

function formatDueAt(dueAtStr) {
  const d = new Date(dueAtStr);
  return `${String(d.getDate()).padStart(2,'0')} de ${MONTH_NAMES[d.getMonth()]} às ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function buildMessage(task, type) {
  const when = formatDueAt(task.due_at);
  if (type === '1d') return `⏰ *Lembrete — amanhã!*\n\n📌 ${task.description}\n📅 ${when}\n\n_(ID: ${task.id} — /feito ${task.id} para concluir)_`;
  if (type === '1h') return `⏰ *Lembrete — em 1 hora!*\n\n📌 ${task.description}\n📅 ${when}\n\n_(ID: ${task.id} — /feito ${task.id} para concluir)_`;
  return `🔔 *Hora do compromisso!*\n\n📌 ${task.description}\n📅 ${when}\n\n_(ID: ${task.id} — /feito ${task.id} para concluir)_`;
}

function startScheduler(sock) {
  console.log('⏱️  Agendador de lembretes iniciado.');

  setInterval(async () => {
    try {
      const tasks = getPendingNotifications();
      const now   = new Date();

      for (const task of tasks) {
        const due     = new Date(task.due_at);
        const diffMin = (due - now) / 60000;
        let type = null;

        if (!task.notified_now && Math.abs(diffMin) <= 2) {
          type = 'now'; markNotifiedNow(task.id);
        } else if (!task.notified_1h && diffMin >= 55 && diffMin <= 65) {
          type = '1h'; markNotified1h(task.id);
        } else if (!task.notified_1d && diffMin >= 23 * 60 && diffMin <= 25 * 60) {
          type = '1d'; markNotified1d(task.id);
        }

        if (!type) continue;

        try {
          await sock.sendMessage(task.chat_id, { text: buildMessage(task, type) });
          console.log(`📨 Notificação [${type}] → ${task.chat_id}: ${task.description}`);
        } catch (err) {
          console.error(`Erro ao notificar ${task.chat_id}:`, err.message);
        }
      }
    } catch (err) {
      console.error('Erro no agendador:', err);
    }
  }, 60 * 1000);
}

module.exports = { startScheduler };
