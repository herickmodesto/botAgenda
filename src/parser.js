'use strict';

// ── Triggers ─────────────────────────────────────────────────────────────────

const EXPENSE_TRIGGERS = [
  'gastei', 'gaste', 'paguei', 'pague', 'comprei', 'compre',
  'gasto', 'despesa', 'saiu', 'debitou', 'custou', 'custo',
  'devo', 'deve', 'saquei', 'saque', 'transferi',
  'gastamos', 'pagamos', 'cobrado', 'cobrou',
];

const INCOME_TRIGGERS = [
  'recebi', 'receba', 'ganhei', 'ganhe', 'entrou', 'receita',
  'renda', 'depositou', 'caiu', 'vendi', 'venda', 'recebemos',
  'recebido', 'faturei',
];

const INSTALLMENT_TRIGGERS = ['parcelei', 'parcelado', 'parcelou'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalize(str) {
  return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function parseAmount(raw) {
  const cleaned = raw.replace(/R\$\s*/i, '').trim();
  if (cleaned.includes('.') && cleaned.includes(',')) {
    return parseFloat(cleaned.replace(/\./g, '').replace(',', '.'));
  }
  if (cleaned.includes(',')) {
    return parseFloat(cleaned.replace(',', '.'));
  }
  return parseFloat(cleaned);
}

function formatBRLInline(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

// ── Regexes ───────────────────────────────────────────────────────────────────

const AMT = `(?:R\\$\\s*)?([\\d]+(?:[.,][\\d]{1,3})?)`;

const ALL_TRIGGERS = [...EXPENSE_TRIGGERS, ...INCOME_TRIGGERS];
const TRIGGER_PAT  = ALL_TRIGGERS.join('|');

// 1. Classic: "gastei 50 almoço"
const CLASSIC_RE = new RegExp(`^(${TRIGGER_PAT})\\s+${AMT}\\s+(.+)$`, 'i');

// 2. Installment trigger: "parcelei 1200 TV 12x" / "parcelei 1200 TV em 12x"
const INSTALLMENT_RE = new RegExp(
  `^(${INSTALLMENT_TRIGGERS.join('|')})\\s+${AMT}\\s+(.+?)\\s+(?:em\\s+)?(\\d+)\\s*[xX]$`, 'i'
);

// 3. PIX expense: "pix 50 João"
const PIX_EXP_RE = new RegExp(`^pix\\s+${AMT}\\s+(.+)$`, 'i');

// 4. PIX income: "recebi pix 50 João" / "pix recebido 50 João"
const PIX_INC_RE = new RegExp(
  `^(?:recebi\\s+pix|pix\\s+recebido)\\s+${AMT}\\s+(.+)$`, 'i'
);

// 5. Sign: "-50 almoço" / "+3000 salário"
const SIGN_RE = new RegExp(`^([+-])\\s*${AMT}\\s+(.+)$`);

// 6. Currency prefix: "R$ 50 almoço"
const CURRENCY_RE = new RegExp(`^R\\$\\s*${AMT}\\s+(.+)$`, 'i');

// ── Installment suffix in description: "geladeira 10x" ───────────────────────

const INST_SUFFIX_RE = /^(.+?)\s+(?:em\s+)?(\d+)\s*[xX]$/i;

function applyInstallmentSuffix(type, amount, description) {
  const m = description.match(INST_SUFFIX_RE);
  if (!m) return { type, amount, description };
  const n = parseInt(m[2], 10);
  return {
    type,
    amount,
    description: `${m[1].trim()} (${n}x de ${formatBRLInline(amount / n)})`,
    installments: n,
  };
}

// ── Multiple entries: "gastei 50 almoço e 30 uber" ───────────────────────────

function splitMultiple(type, firstAmount, rawDescription) {
  const parts = rawDescription.split(/\s+e\s+(?=\d)/i);
  if (parts.length === 1) {
    return [applyInstallmentSuffix(type, firstAmount, rawDescription.trim())];
  }

  const entries = [applyInstallmentSuffix(type, firstAmount, parts[0].trim())];

  for (let i = 1; i < parts.length; i++) {
    const m = parts[i].match(new RegExp(`^${AMT}\\s+(.+)$`));
    if (m) {
      const amt = parseAmount(m[1]);
      if (!isNaN(amt) && amt > 0) {
        entries.push(applyInstallmentSuffix(type, amt, m[2].trim()));
      }
    }
  }

  return entries;
}

// ── Main parser ───────────────────────────────────────────────────────────────

/**
 * Faz parse de uma mensagem e retorna array de lançamentos ou null.
 *
 * Formatos suportados:
 *   gastei 50 almoço           → gasto clássico
 *   recebi 3000 salário        → receita clássica
 *   parcelei 1200 TV 12x       → parcelamento
 *   comprei 600 celular 6x     → parcelamento via trigger
 *   pix 50 João                → pix enviado
 *   recebi pix 200 cliente     → pix recebido
 *   -50 almoço                 → gasto (sinal negativo)
 *   +3000 salário              → receita (sinal positivo)
 *   R$ 50 almoço               → gasto (prefixo R$)
 *   gastei 50 almoço e 30 uber → múltiplos gastos
 *
 * @param {string} text
 * @returns {Array<{type,amount,description,installments?}>|null}
 */
function parseMessage(text) {
  const t = text.trim();

  // 1. Installment trigger (mais específico primeiro)
  const instM = t.match(INSTALLMENT_RE);
  if (instM) {
    const [, , amtRaw, desc, parcelas] = instM;
    const total = parseAmount(amtRaw);
    const n = parseInt(parcelas, 10);
    if (!isNaN(total) && total > 0 && n > 0) {
      return [{
        type: 'expense',
        amount: total,
        description: `${desc.trim()} (${n}x de ${formatBRLInline(total / n)})`,
        installments: n,
      }];
    }
  }

  // 2. PIX income
  const pixIncM = t.match(PIX_INC_RE);
  if (pixIncM) {
    const amount = parseAmount(pixIncM[1]);
    if (!isNaN(amount) && amount > 0) {
      return [{ type: 'income', amount, description: `Pix recebido — ${pixIncM[2].trim()}` }];
    }
  }

  // 3. PIX expense
  const pixExpM = t.match(PIX_EXP_RE);
  if (pixExpM) {
    const amount = parseAmount(pixExpM[1]);
    if (!isNaN(amount) && amount > 0) {
      return [{ type: 'expense', amount, description: `Pix — ${pixExpM[2].trim()}` }];
    }
  }

  // 4. Classic trigger (suporta múltiplos com "e")
  const classicM = t.match(CLASSIC_RE);
  if (classicM) {
    const [, trigger, amtRaw, description] = classicM;
    const amount = parseAmount(amtRaw);
    if (isNaN(amount) || amount <= 0) return null;
    const norm = normalize(trigger);
    const type = EXPENSE_TRIGGERS.includes(norm) ? 'expense' : 'income';
    return splitMultiple(type, amount, description);
  }

  // 5. Sign format: "+3000 salário" / "-50 almoço"
  const signM = t.match(SIGN_RE);
  if (signM) {
    const [, sign, amtRaw, description] = signM;
    const amount = parseAmount(amtRaw);
    if (isNaN(amount) || amount <= 0) return null;
    return [applyInstallmentSuffix(sign === '+' ? 'income' : 'expense', amount, description.trim())];
  }

  // 6. Currency prefix: "R$ 50 almoço"
  const currM = t.match(CURRENCY_RE);
  if (currM) {
    const amount = parseAmount(currM[1]);
    if (isNaN(amount) || amount <= 0) return null;
    return [applyInstallmentSuffix('expense', amount, currM[2].trim())];
  }

  return null;
}

module.exports = { parseMessage };
