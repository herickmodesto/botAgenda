'use strict';

const path    = require('path');
const fs      = require('fs');
const Database = require('better-sqlite3');

// Em produção (Railway) usa /data, localmente usa data/
const DATA_DIR = process.env.NODE_ENV === 'production'
  ? '/data'
  : path.join(__dirname, '..', 'data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'finance.db');
const db = new Database(DB_PATH);

// Configurações de performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Schema
db.exec(`
  CREATE TABLE IF NOT EXISTS entries (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    type        TEXT    NOT NULL CHECK(type IN ('expense','income')),
    amount      REAL    NOT NULL,
    description TEXT    NOT NULL,
    category    TEXT    NOT NULL,
    chat_id     TEXT    NOT NULL,
    created_at  TEXT    NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    description  TEXT    NOT NULL,
    due_at       TEXT    NOT NULL,
    chat_id      TEXT    NOT NULL,
    notified_1d  INTEGER DEFAULT 0,
    notified_1h  INTEGER DEFAULT 0,
    notified_now INTEGER DEFAULT 0,
    done         INTEGER DEFAULT 0,
    created_at   TEXT    NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_tasks_due    ON tasks(due_at);
  CREATE INDEX IF NOT EXISTS idx_tasks_chat   ON tasks(chat_id);

  CREATE INDEX IF NOT EXISTS idx_created_at ON entries(created_at);
  CREATE INDEX IF NOT EXISTS idx_chat_id    ON entries(chat_id);
`);

// --- Statements preparados ---

const stmtInsert = db.prepare(`
  INSERT INTO entries (type, amount, description, category, chat_id, created_at)
  VALUES (@type, @amount, @description, @category, @chatId, @createdAt)
`);

const stmtToday = db.prepare(`
  SELECT * FROM entries
  WHERE DATE(created_at) = DATE('now', 'localtime')
    AND chat_id = ?
  ORDER BY created_at DESC
`);

const stmtMonth = db.prepare(`
  SELECT * FROM entries
  WHERE strftime('%Y-%m', created_at) = ?
    AND chat_id = ?
  ORDER BY created_at DESC
`);

const stmtMonthSummary = db.prepare(`
  SELECT type, SUM(amount) AS total
  FROM entries
  WHERE strftime('%Y-%m', created_at) = ?
    AND chat_id = ?
  GROUP BY type
`);

const stmtCategoryTotals = db.prepare(`
  SELECT category, type, SUM(amount) AS total, COUNT(*) AS count
  FROM entries
  WHERE strftime('%Y-%m', created_at) = ?
    AND chat_id = ?
    AND type = 'expense'
  GROUP BY category
  ORDER BY total DESC
`);

const stmtDelete = db.prepare(`
  DELETE FROM entries WHERE id = ? AND chat_id = ?
`);

// --- Statements de tarefas ---

const stmtInsertTask = db.prepare(`
  INSERT INTO tasks (description, due_at, chat_id, created_at)
  VALUES (@description, @dueAt, @chatId, @createdAt)
`);

const stmtGetTasks = db.prepare(`
  SELECT * FROM tasks
  WHERE chat_id = ? AND done = 0
  ORDER BY due_at ASC
`);

const stmtGetPendingNotifications = db.prepare(`
  SELECT * FROM tasks
  WHERE done = 0
    AND (
      (notified_1d = 0 AND due_at <= datetime('now', '+25 hours') AND due_at > datetime('now', '+23 hours'))
      OR
      (notified_1h = 0 AND due_at <= datetime('now', '+65 minutes') AND due_at > datetime('now', '+55 minutes'))
      OR
      (notified_now = 0 AND due_at <= datetime('now', '+2 minutes') AND due_at >= datetime('now', '-2 minutes'))
    )
`);

const stmtMarkNotified1d  = db.prepare(`UPDATE tasks SET notified_1d  = 1 WHERE id = ?`);
const stmtMarkNotified1h  = db.prepare(`UPDATE tasks SET notified_1h  = 1 WHERE id = ?`);
const stmtMarkNotifiedNow = db.prepare(`UPDATE tasks SET notified_now = 1 WHERE id = ?`);
const stmtMarkDone        = db.prepare(`UPDATE tasks SET done = 1 WHERE id = ? AND chat_id = ?`);
const stmtDeleteTask      = db.prepare(`DELETE FROM tasks WHERE id = ? AND chat_id = ?`);

// --- Funções exportadas ---

/**
 * Insere um novo lançamento
 */
function insertEntry({ type, amount, description, category, chatId }) {
  const createdAt = new Date().toISOString().replace('T', ' ').substring(0, 19);
  return stmtInsert.run({ type, amount, description, category, chatId, createdAt });
}

/**
 * Retorna lançamentos de hoje
 * @param {string} chatId
 */
function getTodayEntries(chatId) {
  return stmtToday.all(chatId);
}

/**
 * Retorna lançamentos do mês
 * @param {string} chatId
 * @param {number} year
 * @param {number} month  1-12
 */
function getMonthEntries(chatId, year, month) {
  const ym = `${year}-${String(month).padStart(2, '0')}`;
  return stmtMonth.all(ym, chatId);
}

/**
 * Retorna resumo (total de gastos e receitas) do mês
 * @param {string} chatId
 * @param {number} year
 * @param {number} month  1-12
 * @returns {{ expense: number, income: number }}
 */
function getMonthSummary(chatId, year, month) {
  const ym = `${year}-${String(month).padStart(2, '0')}`;
  const rows = stmtMonthSummary.all(ym, chatId);
  const result = { expense: 0, income: 0 };
  for (const row of rows) {
    result[row.type] = row.total;
  }
  return result;
}

/**
 * Retorna totais por categoria (gastos) do mês
 * @param {string} chatId
 * @param {number} year
 * @param {number} month
 */
function getCategoryTotals(chatId, year, month) {
  const ym = `${year}-${String(month).padStart(2, '0')}`;
  return stmtCategoryTotals.all(ym, chatId);
}

/**
 * Deleta um lançamento por ID
 */
function deleteEntry(id, chatId) {
  return stmtDelete.run(id, chatId);
}

/**
 * Insere uma tarefa
 */
function insertTask({ description, dueAt, chatId }) {
  const createdAt = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const dueAtStr  = dueAt instanceof Date
    ? dueAt.toISOString().replace('T', ' ').substring(0, 19)
    : dueAt;
  return stmtInsertTask.run({ description, dueAt: dueAtStr, chatId, createdAt });
}

/**
 * Lista tarefas pendentes de um chat
 */
function getTasks(chatId) {
  return stmtGetTasks.all(chatId);
}

/**
 * Retorna tarefas que precisam de notificação agora
 */
function getPendingNotifications() {
  return stmtGetPendingNotifications.all();
}

function markNotified1d(id)  { stmtMarkNotified1d.run(id); }
function markNotified1h(id)  { stmtMarkNotified1h.run(id); }
function markNotifiedNow(id) { stmtMarkNotifiedNow.run(id); }

/**
 * Marca tarefa como concluída
 */
function completeTask(id, chatId) {
  return stmtMarkDone.run(id, chatId);
}

/**
 * Remove uma tarefa
 */
function deleteTask(id, chatId) {
  return stmtDeleteTask.run(id, chatId);
}

module.exports = {
  insertEntry,
  getTodayEntries,
  getMonthEntries,
  getMonthSummary,
  getCategoryTotals,
  deleteEntry,
  insertTask,
  getTasks,
  getPendingNotifications,
  markNotified1d,
  markNotified1h,
  markNotifiedNow,
  completeTask,
  deleteTask,
};
