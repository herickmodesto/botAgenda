'use strict';

const { CATEGORY_LABELS, CATEGORY_ICONS } = require('./categories');

const MONTH_NAMES = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
];

function formatBRL(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function formatDate(isoStr) {
  const d = new Date(isoStr);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

// ── Confirmação de lançamento ─────────────────────────────────────────────────

function formatEntry(entry, category) {
  const isExpense = entry.type === 'expense';
  const icon     = isExpense ? '💸' : '💰';
  const label    = isExpense ? 'Gasto registrado' : 'Receita registrada';
  const catIcon  = CATEGORY_ICONS[category] || '📦';
  const catLabel = CATEGORY_LABELS[category] || 'Outros';

  const lines = [
    `*${label}* ✅`,
    `${icon} ${formatBRL(entry.amount)} — ${entry.description}`,
    `${catIcon} Categoria: ${catLabel}`,
  ];

  if (entry.installments) {
    lines.push(`📆 Parcelas: ${entry.installments}x de ${formatBRL(entry.amount / entry.installments)}`);
  }

  lines.push(`📅 ${formatDate(new Date().toISOString())}`);
  lines.push('');
  lines.push('_Use /ajuda para ver os comandos_');

  return lines.join('\n');
}

// ── Resumo de período (genérico) ──────────────────────────────────────────────

function buildPeriodSummary(entries, title) {
  if (entries.length === 0) {
    return `*${title}*\n\nNenhum lançamento registrado.\n\nExemplos:\n• \`gastei 50 almoço\`\n• \`recebi 3000 salário\`\n• \`parcelei 1200 TV 12x\``;
  }

  const expenses = entries.filter(e => e.type === 'expense');
  const incomes  = entries.filter(e => e.type === 'income');
  const totalExp = expenses.reduce((s, e) => s + e.amount, 0);
  const totalInc = incomes.reduce((s, e) => s + e.amount, 0);
  const balance  = totalInc - totalExp;
  const balIcon  = balance >= 0 ? '📈' : '📉';

  const lines = [`*${title}*`];

  if (expenses.length > 0) {
    lines.push('\n*💸 Gastos:*');
    for (const e of expenses) {
      const catIcon = CATEGORY_ICONS[e.category] || '📦';
      const day = e.created_at.substring(8, 10);
      const mon = e.created_at.substring(5, 7);
      lines.push(`  ${catIcon} ${day}/${mon} ${formatBRL(e.amount)} — ${e.description} _(${e.id})_`);
    }
    lines.push(`  *Total: ${formatBRL(totalExp)}*`);
  }

  if (incomes.length > 0) {
    lines.push('\n*💰 Receitas:*');
    for (const e of incomes) {
      const day = e.created_at.substring(8, 10);
      const mon = e.created_at.substring(5, 7);
      lines.push(`  ✅ ${day}/${mon} ${formatBRL(e.amount)} — ${e.description} _(${e.id})_`);
    }
    lines.push(`  *Total: ${formatBRL(totalInc)}*`);
  }

  lines.push(`\n${balIcon} *Saldo: ${formatBRL(balance)}*`);
  return lines.join('\n');
}

function formatToday(entries) {
  const today = new Date();
  const label = `${String(today.getDate()).padStart(2,'0')}/${String(today.getMonth()+1).padStart(2,'0')}/${today.getFullYear()}`;
  return buildPeriodSummary(entries, `Hoje — ${label}`);
}

function formatWeek(entries) {
  return buildPeriodSummary(entries, 'Últimos 7 dias');
}

function formatMonthList(entries, year, month) {
  return buildPeriodSummary(entries, `${MONTH_NAMES[month-1]}/${year}`);
}

// ── Resumo mensal ─────────────────────────────────────────────────────────────

function formatMonthlySummary(summary, year, month) {
  const balance = summary.income - summary.expense;
  const balIcon = balance >= 0 ? '📈' : '📉';
  return [
    `*Resumo — ${MONTH_NAMES[month-1]}/${year}*`,
    '',
    `💸 Total gasto:    *${formatBRL(summary.expense)}*`,
    `💰 Total recebido: *${formatBRL(summary.income)}*`,
    `${balIcon} Saldo do mês:  *${formatBRL(balance)}*`,
  ].join('\n');
}

// ── Categorias ────────────────────────────────────────────────────────────────

function formatCategories(totals, year, month) {
  const title = `Gastos por Categoria — ${MONTH_NAMES[month-1]}/${year}`;
  if (totals.length === 0) return `*${title}*\n\nNenhum gasto registrado neste mês.`;

  const grandTotal = totals.reduce((s, t) => s + t.total, 0);
  const lines = [`*${title}*`, ''];

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

// ── Busca ─────────────────────────────────────────────────────────────────────

function formatSearch(entries, term) {
  if (entries.length === 0) return `*Busca: "${term}"*\n\nNenhum lançamento encontrado.`;

  const lines = [`*Busca: "${term}"* (${entries.length} resultado(s))`, ''];
  for (const e of entries) {
    const icon = e.type === 'expense' ? '💸' : '💰';
    const day  = e.created_at.substring(8, 10);
    const mon  = e.created_at.substring(5, 7);
    const year = e.created_at.substring(0, 4);
    lines.push(`${icon} ${day}/${mon}/${year} ${formatBRL(e.amount)} — ${e.description} _(${e.id})_`);
  }
  return lines.join('\n');
}

// ── Tarefas ───────────────────────────────────────────────────────────────────

function formatTaskCreated(task) {
  const d   = new Date(task.dueAt);
  const day = String(d.getDate()).padStart(2, '0');
  const mon = MONTH_NAMES[d.getMonth()];
  const h   = String(d.getHours()).padStart(2, '0');
  const m   = String(d.getMinutes()).padStart(2, '0');
  return [
    '*Tarefa agendada!* 📌',
    `📝 ${task.description}`,
    `📅 ${day} de ${mon} às ${h}:${m}`,
    '',
    '_Você será avisado 1 dia antes, 1 hora antes e na hora._',
  ].join('\n');
}

function formatTaskList(tasks) {
  if (tasks.length === 0) {
    return '*Tarefas* 📋\n\nNenhuma tarefa agendada.\n\nPara agendar:\n• `reunião às 10h do dia 15 de março`\n• `lembrar dentista amanhã às 14h`';
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
  lines.push('_/feito <ID> · /cancelar <ID>_');
  return lines.join('\n');
}

// ── Ajuda ─────────────────────────────────────────────────────────────────────

function formatHelp() {
  return [
    '*Bot de Finanças & Agenda* 💼',
    '',
    '*── GASTOS ──*',
    '  `gastei 50 almoço`',
    '  `paguei 120 farmácia`',
    '  `comprei 89 livro`',
    '  `saiu 35 uber`',
    '  `devo 500 cartão`',
    '  `saquei 200 banco`',
    '  `-50 almoço`  _(sinal negativo)_',
    '  `R$ 50 almoço`  _(prefixo R$)_',
    '',
    '*── PARCELAS ──*',
    '  `parcelei 1200 TV 12x`',
    '  `comprei 600 celular 6x`',
    '  `paguei 2400 notebook em 12x`',
    '',
    '*── PIX ──*',
    '  `pix 50 João`  _(enviado)_',
    '  `recebi pix 200 cliente`  _(recebido)_',
    '',
    '*── MÚLTIPLOS ──*',
    '  `gastei 50 almoço e 30 uber`',
    '  `paguei 80 mercado e 45 farmácia`',
    '',
    '*── RECEITAS ──*',
    '  `recebi 3000 salário`',
    '  `ganhei 500 freela`',
    '  `entrou 1500 cliente`',
    '  `+3000 salário`  _(sinal positivo)_',
    '',
    '*── CONSULTAS ──*',
    '  /hoje         → lançamentos de hoje',
    '  /semana       → últimos 7 dias',
    '  /mes          → lançamentos do mês',
    '  /mesanterior  → mês passado',
    '  /resumo       → total gasto vs recebido',
    '  /categorias   → gastos por categoria',
    '  /buscar <termo> → busca por descrição',
    '  /apagar <ID>    → remove lançamento',
    '',
    '*── TAREFAS & LEMBRETES ──*',
    '  `reunião às 10h do dia 15 de março`',
    '  `lembrar dentista amanhã às 14h`',
    '  `consulta sexta às 9h`',
    '',
    '  /tarefas        → lista tarefas',
    '  /feito <ID>     → conclui tarefa',
    '  /cancelar <ID>  → remove tarefa',
    '',
    '  /ajuda → esta mensagem',
  ].join('\n');
}

module.exports = {
  formatEntry, formatToday, formatWeek, formatMonthlySummary,
  formatCategories, formatMonthList, formatSearch,
  formatTaskCreated, formatTaskList, formatHelp, formatBRL,
};
