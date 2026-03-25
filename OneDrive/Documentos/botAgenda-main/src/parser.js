'use strict';

// Palavras que indicam gasto
const EXPENSE_TRIGGERS = ['gastei', 'paguei', 'comprei', 'gasto', 'despesa'];
// Palavras que indicam receita
const INCOME_TRIGGERS  = ['recebi', 'ganhei', 'entrou', 'receita', 'renda'];

const ALL_TRIGGERS = [...EXPENSE_TRIGGERS, ...INCOME_TRIGGERS].join('|');

// Regex: <ação> <valor> <descrição>
// Exemplos: "gastei 50 almoço", "recebi 1000,00 salário", "paguei 1.500 aluguel"
const ENTRY_REGEX = new RegExp(
  `^(${ALL_TRIGGERS})\\s+([\\d]+(?:[.,][\\d]{1,2})?)\\s+(.+)$`,
  'i'
);

/**
 * Converte string de valor para float
 * "1.500,00" → 1500.00
 * "1500,00"  → 1500.00
 * "50.5"     → 50.50
 * "50"       → 50.00
 * @param {string} raw
 * @returns {number}
 */
function parseAmount(raw) {
  // Se tem ponto E vírgula, o ponto é separador de milhar
  if (raw.includes('.') && raw.includes(',')) {
    return parseFloat(raw.replace('.', '').replace(',', '.'));
  }
  // Se tem só vírgula, é separador decimal no padrão BR
  if (raw.includes(',')) {
    return parseFloat(raw.replace(',', '.'));
  }
  return parseFloat(raw);
}

/**
 * Faz parse de uma mensagem de texto livre
 * @param {string} text
 * @returns {{ type: 'expense'|'income', amount: number, description: string, raw: string } | null}
 */
function parseMessage(text) {
  const trimmed = text.trim();
  const match = trimmed.match(ENTRY_REGEX);
  if (!match) return null;

  const [, trigger, amountRaw, description] = match;
  const normalizedTrigger = trigger.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const type = EXPENSE_TRIGGERS.includes(normalizedTrigger) ? 'expense' : 'income';
  const amount = parseAmount(amountRaw);

  if (isNaN(amount) || amount <= 0) return null;

  return {
    type,
    amount,
    description: description.trim(),
    raw: trimmed,
  };
}

module.exports = { parseMessage };
