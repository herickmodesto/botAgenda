'use strict';

const {
  getTodayEntries,
  getMonthEntries,
  getMonthSummary,
  getCategoryTotals,
  deleteEntry,
  getTasks,
  completeTask,
  deleteTask,
} = require('./database');

const {
  formatToday,
  formatMonthlySummary,
  formatCategories,
  formatMonthList,
  formatTaskList,
  formatHelp,
} = require('./formatter');

function currentYearMonth() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function handleHoje(chatId) {
  const entries = getTodayEntries(chatId);
  return formatToday(entries);
}

function handleMes(chatId) {
  const { year, month } = currentYearMonth();
  const entries = getMonthEntries(chatId, year, month);
  return formatMonthList(entries, year, month);
}

function handleResumo(chatId) {
  const { year, month } = currentYearMonth();
  const summary = getMonthSummary(chatId, year, month);
  return formatMonthlySummary(summary, year, month);
}

function handleCategorias(chatId) {
  const { year, month } = currentYearMonth();
  const totals = getCategoryTotals(chatId, year, month);
  return formatCategories(totals, year, month);
}

function handleApagar(chatId, args) {
  const id = parseInt(args, 10);
  if (isNaN(id) || id <= 0) {
    return '❌ Informe o ID do lançamento.\nExemplo: `/apagar 5`\n\nUse /hoje ou /mes para ver os IDs.';
  }
  const result = deleteEntry(id, chatId);
  if (result.changes === 0) {
    return `❌ Lançamento #${id} não encontrado. Verifique o ID com /hoje ou /mes.`;
  }
  return `✅ Lançamento #${id} removido com sucesso.`;
}

function handleTarefas(chatId) {
  const tasks = getTasks(chatId);
  return formatTaskList(tasks);
}

function handleFeito(chatId, args) {
  const id = parseInt(args, 10);
  if (isNaN(id) || id <= 0) {
    return '❌ Informe o ID da tarefa.\nExemplo: `/feito 3`\n\nUse /tarefas para ver os IDs.';
  }
  const result = completeTask(id, chatId);
  if (result.changes === 0) {
    return `❌ Tarefa #${id} não encontrada. Verifique com /tarefas.`;
  }
  return `✅ Tarefa #${id} concluída!`;
}

function handleCancelar(chatId, args) {
  const id = parseInt(args, 10);
  if (isNaN(id) || id <= 0) {
    return '❌ Informe o ID da tarefa.\nExemplo: `/cancelar 3`\n\nUse /tarefas para ver os IDs.';
  }
  const result = deleteTask(id, chatId);
  if (result.changes === 0) {
    return `❌ Tarefa #${id} não encontrada. Verifique com /tarefas.`;
  }
  return `🗑️ Tarefa #${id} cancelada.`;
}

function handleHelp() {
  return formatHelp();
}

// Mapa de comandos → funções
const COMMANDS = {
  '/hoje':       (chatId)       => handleHoje(chatId),
  '/mes':        (chatId)       => handleMes(chatId),
  '/resumo':     (chatId)       => handleResumo(chatId),
  '/categorias': (chatId)       => handleCategorias(chatId),
  '/apagar':     (chatId, args) => handleApagar(chatId, args),
  '/tarefas':    (chatId)       => handleTarefas(chatId),
  '/agenda':     (chatId)       => handleTarefas(chatId),
  '/feito':      (chatId, args) => handleFeito(chatId, args),
  '/cancelar':   (chatId, args) => handleCancelar(chatId, args),
  '/ajuda':      ()             => handleHelp(),
  '/help':       ()             => handleHelp(),
};

/**
 * Despacha um comando
 * @param {string} body   - texto completo da mensagem (ex: "/apagar 5")
 * @param {string} chatId
 * @returns {string|null}  - resposta, ou null se comando desconhecido
 */
function dispatch(body, chatId) {
  const parts   = body.trim().split(/\s+/);
  const command = parts[0].toLowerCase();
  const args    = parts.slice(1).join(' ');

  const handler = COMMANDS[command];
  if (!handler) return null;

  return handler(chatId, args);
}

module.exports = { dispatch };
