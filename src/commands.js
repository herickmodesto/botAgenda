'use strict';

const {
  getTodayEntries, getWeekEntries, getMonthEntries, getLastMonthEntries,
  getMonthSummary, getCategoryTotals, deleteEntry, searchEntries,
  getTasks, completeTask, deleteTask,
} = require('./database');

const {
  formatToday, formatWeek, formatMonthlySummary, formatCategories,
  formatMonthList, formatSearch, formatTaskList, formatHelp,
} = require('./formatter');

function currentYM() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function lastYM() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

const COMMANDS = {
  '/hoje': (chatId) => formatToday(getTodayEntries(chatId)),

  '/semana': (chatId) => formatWeek(getWeekEntries(chatId)),

  '/mes': (chatId) => {
    const { year, month } = currentYM();
    return formatMonthList(getMonthEntries(chatId, year, month), year, month);
  },

  '/mesanterior': (chatId) => {
    const { year, month } = lastYM();
    return formatMonthList(getLastMonthEntries(chatId), year, month);
  },

  '/resumo': (chatId) => {
    const { year, month } = currentYM();
    return formatMonthlySummary(getMonthSummary(chatId, year, month), year, month);
  },

  '/categorias': (chatId) => {
    const { year, month } = currentYM();
    return formatCategories(getCategoryTotals(chatId, year, month), year, month);
  },

  '/buscar': (chatId, args) => {
    if (!args || args.trim().length < 2) {
      return '❌ Informe o termo.\nExemplo: `/buscar almoço`';
    }
    return formatSearch(searchEntries(chatId, args.trim()), args.trim());
  },

  '/apagar': (chatId, args) => {
    const id = parseInt(args, 10);
    if (isNaN(id) || id <= 0) {
      return '❌ Informe o ID.\nExemplo: `/apagar 5`\n\nUse /hoje ou /mes para ver os IDs.';
    }
    const result = deleteEntry(id, chatId);
    return result.changes === 0
      ? `❌ Lançamento #${id} não encontrado.`
      : `✅ Lançamento #${id} removido.`;
  },

  '/tarefas': (chatId) => formatTaskList(getTasks(chatId)),
  '/agenda':  (chatId) => formatTaskList(getTasks(chatId)),

  '/feito': (chatId, args) => {
    const id = parseInt(args, 10);
    if (isNaN(id) || id <= 0) return '❌ Informe o ID.\nExemplo: `/feito 3`';
    const result = completeTask(id, chatId);
    return result.changes === 0
      ? `❌ Tarefa #${id} não encontrada.`
      : `✅ Tarefa #${id} concluída!`;
  },

  '/cancelar': (chatId, args) => {
    const id = parseInt(args, 10);
    if (isNaN(id) || id <= 0) return '❌ Informe o ID.\nExemplo: `/cancelar 3`';
    const result = deleteTask(id, chatId);
    return result.changes === 0
      ? `❌ Tarefa #${id} não encontrada.`
      : `🗑️ Tarefa #${id} cancelada.`;
  },

  '/ajuda': () => formatHelp(),
  '/help':  () => formatHelp(),
};

function dispatch(body, chatId) {
  const parts   = body.trim().split(/\s+/);
  const command = parts[0].toLowerCase();
  const args    = parts.slice(1).join(' ');
  const handler = COMMANDS[command];
  if (!handler) return null;
  return handler(chatId, args);
}

module.exports = { dispatch };
