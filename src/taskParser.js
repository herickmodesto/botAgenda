'use strict';

const chrono = require('chrono-node');

// Palavras que ativam o registro de tarefa
const TASK_TRIGGERS = [
  'lembrar', 'lembre', 'lembrete',
  'reuniao', 'reunião',
  'tarefa', 'compromisso',
  'agendar', 'agenda',
  'marcar', 'evento',
  'consulta', 'dentista',
];

const TRIGGER_REGEX = new RegExp(
  `^(${TASK_TRIGGERS.join('|')})\\s+(.+)$`,
  'i'
);

/**
 * Meses em português para ajudar o chrono
 */
const MONTH_REPLACEMENTS = {
  'janeiro': 'january', 'fevereiro': 'february', 'março': 'march',
  'marco': 'march', 'abril': 'april', 'maio': 'may', 'junho': 'june',
  'julho': 'july', 'agosto': 'august', 'setembro': 'september',
  'outubro': 'october', 'novembro': 'november', 'dezembro': 'december',
};

function translateToChrono(text) {
  let t = text.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\bàs\b/g, 'at').replace(/\bao\b/g, 'at')
    .replace(/\bdia\b/g, 'on the').replace(/\bpróximo\b/g, 'next')
    .replace(/\bproximo\b/g, 'next').replace(/\bamanhã\b/g, 'tomorrow')
    .replace(/\bamanha\b/g, 'tomorrow').replace(/\bhoje\b/g, 'today')
    .replace(/\bsegunda\b/g, 'monday').replace(/\bterça\b/g, 'tuesday')
    .replace(/\bterca\b/g, 'tuesday').replace(/\bquarta\b/g, 'wednesday')
    .replace(/\bquinta\b/g, 'thursday').replace(/\bsexta\b/g, 'friday')
    .replace(/\bsabado\b/g, 'saturday').replace(/\bsábado\b/g, 'saturday')
    .replace(/\bdomingo\b/g, 'sunday');

  for (const [pt, en] of Object.entries(MONTH_REPLACEMENTS)) {
    t = t.replace(new RegExp(`\\b${pt}\\b`, 'g'), en);
  }

  // "25 de março" → "25 march" (remove o "de" entre número e mês)
  t = t.replace(/(\d+)\s+de\s+/g, '$1 ');

  // "10h" → "10:00", "10h30" → "10:30"
  t = t.replace(/(\d{1,2})h(\d{2})?/g, (_, h, m) => `${h}:${m || '00'}`);

  return t;
}

/**
 * Faz parse de uma mensagem de tarefa
 * @param {string} text
 * @returns {{ description: string, dueAt: Date, raw: string } | null}
 */
function parseTask(text) {
  const trimmed = text.trim();
  const match   = trimmed.match(TRIGGER_REGEX);
  if (!match) return null;

  const content    = match[2]; // tudo após o trigger
  const translated = translateToChrono(content);
  const now        = new Date();

  const results = chrono.parse(translated, now, { forwardDate: true });
  if (!results || results.length === 0) return null;

  const parsed = results[0];
  const dueAt  = parsed.date();

  // Descrição = parte sem a data detectada
  const descriptionRaw = content
    .substring(0, parsed.index).trim() +
    ' ' +
    content.substring(parsed.index + parsed.text.length).trim();

  const description = descriptionRaw.trim() || content.trim();

  if (!dueAt || dueAt < now) return null;

  return { description, dueAt, raw: trimmed };
}

module.exports = { parseTask };
