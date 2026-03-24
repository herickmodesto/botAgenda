'use strict';

const { CATEGORY_LABELS, CATEGORY_ICONS } = require('./categories');

const MONTH_NAMES = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
];

/**
 * Formata valor como moeda BRL: R$ 1.250,00
 */
function formatBRL(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

/**
 * Formata data ISO para DD/MM/YYYY HH:MM
 */
function formatDate(isoStr) {
  const d = new Date(isoStr);
  const day  = String(d.getDate()).padStart(2, '0');
  const mon  = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const h    = String(d.getHours()).padStart(2, '0');
  const m    = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${mon}/${year} ${h}:${m}`;
}

/**
 * Confirmação de registro de um lançamento
 */
function formatEntry(entry, category) {
  const icon  = entry.type === 'expense' ? '💸' : '💰';
  const label = entry.type === 'expense' ? 'Gasto registrado' : 'Receita registrada';
  const catIcon  = CATEGORY_ICONS[category] || '📦';
  const catLabel = CATEGORY_LABELS[category] || 'Outros';

  return [
    `*${label}* ✅`,
    `${icon} ${formatBRL(entry.amount)} - ${entry.description}`,
    `${catIcon} Categoria: ${catLabel}`,
    `📅 ${formatDate(new Date().toISOString())}`,
    '',
    '_Use /ajuda para ver os comandos_',
  ].join('\n');
}

/**
 * Lista de lançamentos de hoje
 */
function formatToday(entries) {
  if (entries.length === 0) {
    return '*Hoje*\n\nNenhum lançamento registrado ainda.\n\nEnvie: `gastei 50 almoço` ou `recebi 1000 salário`';
  }

  const today = new Date();
  const label = `${String(today.getDate()).padStart(2,'0')}/${String(today.getMonth()+1).padStart(2,'0')}/${today.getFullYear()}`;

  const expenses = entries.filter(e => e.type === 'expense');
  const incomes  = entries.filter(e => e.type === 'income');

  const totalExpense = expenses.reduce((s, e) => s + e.amount, 0);
  const totalIncome  = incomes.reduce((s, e) => s + e.amount, 0);
  const balance = totalIncome - totalExpense;

  const lines = [`*Lançamentos de Hoje - ${label}*`];

  if (expenses.length > 0) {
    lines.push('\n*💸 Gastos:*');
    for (const e of expenses) {
      const catIcon = CATEGORY_ICONS[e.category] || '📦';
      lines.push(`  ${catIcon} ${formatBRL(e.amount)} - ${e.description} _(ID: ${e.id})_`);
    }
    lines.push(`  *Total gasto: ${formatBRL(totalExpense)}*`);
  }

  if (incomes.length > 0) {
    lines.push('\n*💰 Receitas:*');
    for (const e of incomes) {
      lines.push(`  ✅ ${formatBRL(e.amount)} - ${e.description} _(ID: ${e.id})_`);
    }
    lines.push(`  *Total recebido: ${formatBRL(totalIncome)}*`);
  }

  const balanceIcon = balance >= 0 ? '📈' : '📉';
  lines.push(`\n${balanceIcon} *Saldo do dia: ${formatBRL(balance)}*`);

  return lines.join('\n');
}

/**
 * Resumo mensal simples
 */
function formatMonthlySummary(summary, year, month) {
  const monthName = MONTH_NAMES[month - 1];
  const balance   = summary.income - summary.expense;
  const balanceIcon = balance >= 0 ? '📈' : '📉';

  return [
    `*Resumo - ${monthName}/${year}*`,
    '',
    `💸 Total gasto:    *${formatBRL(summary.expense)}*`,
    `💰 Total recebido: *${formatBRL(summary.income)}*`,
    `${balanceIcon} Saldo do mês:  *${formatBRL(balance)}*`,
  ].join('\n');
}

/**
 * Gastos por categoria
 */
function formatCategories(totals, year, month) {
  const monthName = MONTH_NAMES[month - 1];

  if (totals.length === 0) {
    return `*Categorias - ${monthName}/${year}*\n\nNenhum gasto registrado neste mês.`;
  }

  const grandTotal = totals.reduce((s, t) => s + t.total, 0);

  const lines = [`*Gastos por Categoria - ${monthName}/${year}*`, ''];

  for (const row of totals) {
    const icon  = CATEGORY_ICONS[row.category] || '📦';
    const label = CATEGORY_LABELS[row.category] || row.category;
    const pct   = grandTotal > 0 ? Math.round((row.total / grandTotal) * 100) : 0;
    lines.push(`${icon} *${label}*`);
    lines.push(`   ${formatBRL(row.total)} (${pct}%) — ${row.count} lançamento(s)`);
  }

  lines.push('');
  lines.push(`💸 *Total: ${formatBRL(grandTotal)}*`);

  return lines.join('\n');
}

/**
 * Lista detalhada do mês
 */
function formatMonthList(entries, year, month) {
  const monthName = MONTH_NAMES[month - 1];

  if (entries.length === 0) {
    return `*${monthName}/${year}*\n\nNenhum lançamento neste mês.`;
  }

  const expenses = entries.filter(e => e.type === 'expense');
  const incomes  = entries.filter(e => e.type === 'income');

  const totalExpense = expenses.reduce((s, e) => s + e.amount, 0);
  const totalIncome  = incomes.reduce((s, e) => s + e.amount, 0);

  const lines = [`*Lançamentos - ${monthName}/${year}*`];

  if (expenses.length > 0) {
    lines.push('\n*💸 Gastos:*');
    for (const e of expenses) {
      const catIcon = CATEGORY_ICONS[e.category] || '📦';
      const day = e.created_at.substring(8, 10);
      lines.push(`  ${catIcon} ${day}/${String(month).padStart(2,'0')} - ${formatBRL(e.amount)} - ${e.description} _(${e.id})_`);
    }
    lines.push(`  *Total: ${formatBRL(totalExpense)}*`);
  }

  if (incomes.length > 0) {
    lines.push('\n*💰 Receitas:*');
    for (const e of incomes) {
      const day = e.created_at.substring(8, 10);
      lines.push(`  ✅ ${day}/${String(month).padStart(2,'0')} - ${formatBRL(e.amount)} - ${e.description} _(${e.id})_`);
    }
    lines.push(`  *Total: ${formatBRL(totalIncome)}*`);
  }

  const balance = totalIncome - totalExpense;
  const balanceIcon = balance >= 0 ? '📈' : '📉';
  lines.push(`\n${balanceIcon} *Saldo: ${formatBRL(balance)}*`);

  return lines.join('\n');
}

/**
 * Confirmação de tarefa registrada
 */
function formatTaskCreated(task) {
  const d   = new Date(task.dueAt);
  const day = String(d.getDate()).padStart(2, '0');
  const mon = MONTH_NAMES[d.getMonth()];
  const h   = String(d.getHours()).padStart(2, '0');
  const m   = String(d.getMinutes()).padStart(2, '0');
  const when = `${day} de ${mon} às ${h}:${m}`;

  return [
    '*Tarefa agendada!* 📌',
    `📝 ${task.description}`,
    `📅 ${when}`,
    '',
    '_Você será avisado 1 dia antes, 1 hora antes e na hora._',
  ].join('\n');
}

/**
 * Lista de tarefas pendentes
 */
function formatTaskList(tasks) {
  if (tasks.length === 0) {
    return '*Tarefas* 📋\n\nNenhuma tarefa agendada.\n\nPara agendar: `reunião às 10h do dia 15 de março`';
  }

  const lines = ['*Tarefas Agendadas* 📋', ''];

  for (const t of tasks) {
    const d   = new Date(t.due_at);
    const day = String(d.getDate()).padStart(2, '0');
    const mon = MONTH_NAMES[d.getMonth()];
    const h   = String(d.getHours()).padStart(2, '0');
    const m   = String(d.getMinutes()).padStart(2, '0');
    lines.push(`📌 *${t.description}*`);
    lines.push(`   📅 ${day} de ${mon} às ${h}:${m} _(ID: ${t.id})_`);
  }

  lines.push('');
  lines.push('_/feito <ID> para concluir · /cancelar <ID> para remover_');

  return lines.join('\n');
}

/**
 * Mensagem de ajuda
 */
function formatHelp() {
  return [
    '*Bot de Finanças & Agenda* 💼📋',
    '',
    '*── FINANÇAS ──*',
    '  `gastei 50 almoço`',
    '  `paguei 120 farmácia`',
    '  `recebi 3000 salário`',
    '',
    '  /hoje        → lançamentos de hoje',
    '  /mes         → lançamentos do mês',
    '  /resumo      → total gasto vs recebido',
    '  /categorias  → gastos por categoria',
    '  /apagar <ID> → remove lançamento',
    '',
    '*── TAREFAS & LEMBRETES ──*',
    '  `reunião às 10h do dia 15 de março`',
    '  `lembrar dentista amanhã às 14h`',
    '  `consulta sexta às 9h`',
    '  `tarefa mercado hoje às 18h`',
    '',
    '  /tarefas       → lista tarefas pendentes',
    '  /feito <ID>    → marca tarefa como feita',
    '  /cancelar <ID> → remove tarefa',
    '',
    '  _Lembretes automáticos: 1 dia antes, 1 hora antes e na hora_',
    '',
    '  /ajuda → esta mensagem',
  ].join('\n');
}

module.exports = {
  formatEntry,
  formatToday,
  formatMonthlySummary,
  formatCategories,
  formatMonthList,
  formatTaskCreated,
  formatTaskList,
  formatHelp,
  formatBRL,
};
