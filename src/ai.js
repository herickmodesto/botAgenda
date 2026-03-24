'use strict';

const { GoogleGenerativeAI } = require('@google/generative-ai');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

let model = null;

function getModel() {
  if (!GEMINI_API_KEY) return null;
  if (!model) {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    // gemini-2.5-flash = Gemini 3 Flash | gemini-2.5-flash-lite = Gemini 3.1 Flash-Lite
    model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
  }
  return model;
}

const SYSTEM_PROMPT = `Você é um assistente pessoal de WhatsApp que gerencia finanças e agenda.
Analise a mensagem do usuário e retorne APENAS um JSON válido (sem markdown, sem explicação).

Classifique a mensagem em um destes tipos:

1. "task" — compromisso, lembrete, evento, aniversário, consulta, reunião, etc.
2. "expense" — gasto, compra, pagamento
3. "income" — receita, salário, dinheiro recebido
4. "ignore" — mensagem que não é nenhum dos anteriores

Formato de resposta:

Para task:
{"type":"task","description":"descrição clara do evento","date":"YYYY-MM-DD","time":"HH:MM","confidence":0.9}

Para expense:
{"type":"expense","amount":50.00,"description":"descrição do gasto","confidence":0.9}

Para income:
{"type":"income","amount":1000.00,"description":"descrição da receita","confidence":0.9}

Para ignore:
{"type":"ignore"}

Regras importantes:
- Para datas: use o ano atual (${new Date().getFullYear()}) se não especificado
- Se só falar "dia 25" sem mês, use o próximo dia 25 a partir de hoje
- Se não tiver horário, use "00:00"
- Se não tiver valor para expense/income, use null
- confidence entre 0 e 1 indicando sua certeza
- Responda SOMENTE o JSON, nada mais`;

/**
 * Interpreta uma mensagem usando Gemini
 * @param {string} text
 * @returns {Promise<{type:string, description?:string, date?:string, time?:string, amount?:number, confidence?:number} | null>}
 */
async function interpretMessage(text) {
  const m = getModel();
  if (!m) return null;

  try {
    const today = new Date().toISOString().split('T')[0];
    const prompt = `Hoje é ${today}.\n\nMensagem: "${text}"`;

    const result = await m.generateContent([
      { text: SYSTEM_PROMPT },
      { text: prompt },
    ]);

    const raw = result.response.text().trim()
      .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();

    const parsed = JSON.parse(raw);

    // Ignora respostas com baixa confiança
    if (parsed.confidence !== undefined && parsed.confidence < 0.6) return null;

    return parsed;
  } catch (err) {
    console.error('Erro no Gemini:', err.message);
    return null;
  }
}

module.exports = { interpretMessage };
