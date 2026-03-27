'use strict';

const path     = require('path');
const fs       = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.NODE_ENV === 'production'
  ? '/data'
  : path.join(__dirname, '..', 'data');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'finance.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS entries (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    type         TEXT    NOT NULL CHECK(type IN ('expense','income')),
    amount       REAL    NOT NULL,
    description  TEXT    NOT NULL,
    category     TEXT    NOT NULL,
    installments INTEGER DEFAULT NULL,
    chat_id      TEXT    NOT NULL,
    created_at   TEXT    NOT NULL
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

  CREATE INDEX IF NOT EXISTS idx_entries_chat    ON entries(chat_id);
  CREATE INDEX IF NOT EXISTS idx_entries_created ON entries(created_at);
  CREATE INDEX IF NOT EXISTS idx_tasks_due       ON tasks(due_at);
  CREATE INDEX IF NOT EXISTS idx_tasks_chat      ON tasks(chat_id);
`);

// ── Entries ───────────────────────────────────────────────────────────────────

const stmtInsert = db.prepare(`
  INSERT INTO entries (type, amount, description, category, installments, chat_id, created_at)
  VALUES (@type, @amount, @description, @category, @installments, @chatId, @createdAt)
`);

const stmtToday = db.prepare(`
  SELECT * FROM entries
  WHERE DATE(created_at) = DATE('now', 'localtime') AND chat_id = ?
  ORDER BY created_at DESC
`);

const stmtWeek = db.prepare(`
  SELECT * FROM entries
  WHERE DATE(created_at) >= DATE('now', '-6 days', 'localtime') AND chat_id = ?
  ORDER BY created_at DESC
`);

const stmtMonth = db.prepare(`
  SELECT * FROM entries
  WHERE strftime('%Y-%m', created_at) = ? AND chat_id = ?
  ORDER BY created_at DESC
`);

const stmtMonthSummary = db.prepare(`
  SELECT type, SUM(amount) AS total
  FROM entries
  WHERE strftime('%Y-%m', created_at) = ? AND chat_id = ?
  GROUP BY type
`);

const stmtCategoryTotals = db.prepare(`
  SELECT category, type, SUM(amount) AS total, COUNT(*) AS count
  FROM entries
  WHERE strftime('%Y-%m', created_at) = ? AND chat_id = ? AND type = 'expense'
  GROUP BY category
  ORDER BY total DESC
`);

const stmtDelete = db.prepare(`DELETE FROM entries WHERE id = ? AND chat_id = ?`);

const stmtSearch = db.prepare(`
  SELECT * FROM entries
  WHERE chat_id = ? AND LOWER(description) LIKE LOWER(?)
  ORDER BY created_at DESC
  LIMIT 20
`);

function insertEntry({ type, amount, description, category, installments, chatId }) {
  const createdAt = new Date().toISOString().replace('T', ' ').substring(0, 19);
  return stmtInsert.run({ type, amount, description, category, installments: installments || null, chatId, createdAt });
}

function getTodayEntries(chatId) { return stmtToday.all(chatId); }
function getWeekEntries(chatId)  { return stmtWeek.all(chatId); }

function getMonthEntries(chatId, year, month) {
  return stmtMonth.all(`${year}-${String(month).padStart(2, '0')}`, chatId);
}

function getLastMonthEntries(chatId) {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  return stmtMonth.all(ym, chatId);
}

function getMonthSummary(chatId, year, month) {
  const ym = `${year}-${String(month).padStart(2, '0')}`;
  const rows = stmtMonthSummary.all(ym, chatId);
  const result = { expense: 0, income: 0 };
  for (const row of rows) result[row.type] = row.total;
  return result;
}

function getCategoryTotals(chatId, year, month) {
  return stmtCategoryTotals.all(`${year}-${String(month).padStart(2, '0')}`, chatId);
}

function deleteEntry(id, chatId)       { return stmtDelete.run(id, chatId); }
function searchEntries(chatId, term)   { return stmtSearch.all(chatId, `%${term}%`); }

// ── Tasks ─────────────────────────────────────────────────────────────────────

const stmtInsertTask = db.prepare(`
  INSERT INTO tasks (description, due_at, chat_id, created_at)
  VALUES (@description, @dueAt, @chatId, @createdAt)
`);

const stmtGetTasks = db.prepare(`
  SELECT * FROM tasks WHERE chat_id = ? AND done = 0 ORDER BY due_at ASC
`);

const stmtGetPendingNotifications = db.prepare(`
  SELECT * FROM tasks WHERE done = 0 AND (
    (notified_1d  = 0 AND due_at <= datetime('now', '+25 hours')   AND due_at > datetime('now', '+23 hours'))
    OR
    (notified_1h  = 0 AND due_at <= datetime('now', '+65 minutes') AND due_at > datetime('now', '+55 minutes'))
    OR
    (notified_now = 0 AND due_at <= datetime('now', '+2 minutes')  AND due_at >= datetime('now', '-2 minutes'))
  )
`);

const stmtMarkNotified1d  = db.prepare(`UPDATE tasks SET notified_1d  = 1 WHERE id = ?`);
const stmtMarkNotified1h  = db.prepare(`UPDATE tasks SET notified_1h  = 1 WHERE id = ?`);
const stmtMarkNotifiedNow = db.prepare(`UPDATE tasks SET notified_now = 1 WHERE id = ?`);
const stmtMarkDone        = db.prepare(`UPDATE tasks SET done = 1 WHERE id = ? AND chat_id = ?`);
const stmtDeleteTask      = db.prepare(`DELETE FROM tasks WHERE id = ? AND chat_id = ?`);

function insertTask({ description, dueAt, chatId }) {
  const createdAt = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const dueAtStr  = dueAt instanceof Date
    ? dueAt.toISOString().replace('T', ' ').substring(0, 19)
    : dueAt;
  return stmtInsertTask.run({ description, dueAt: dueAtStr, chatId, createdAt });
}

function getTasks(chatId)           { return stmtGetTasks.all(chatId); }
function getPendingNotifications()  { return stmtGetPendingNotifications.all(); }
function markNotified1d(id)         { stmtMarkNotified1d.run(id); }
function markNotified1h(id)         { stmtMarkNotified1h.run(id); }
function markNotifiedNow(id)        { stmtMarkNotifiedNow.run(id); }
function completeTask(id, chatId)   { return stmtMarkDone.run(id, chatId); }
function deleteTask(id, chatId)     { return stmtDeleteTask.run(id, chatId); }

module.exports = {
  insertEntry, getTodayEntries, getWeekEntries, getMonthEntries,
  getLastMonthEntries, getMonthSummary, getCategoryTotals,
  deleteEntry, searchEntries,
  insertTask, getTasks, getPendingNotifications,
  markNotified1d, markNotified1h, markNotifiedNow,
  completeTask, deleteTask,
};
