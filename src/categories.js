'use strict';

// Mapa de palavras-chave para categorias (ordem importa - mais específico primeiro)
const KEYWORD_MAP = [
  ['alimentacao', [
    'almoco', 'jantar', 'cafe', 'lanche', 'restaurante', 'pizza', 'hamburguer',
    'sushi', 'ifood', 'rappi', 'delivery', 'mercado', 'feira', 'padaria',
    'supermercado', 'acougue', 'hortifruti', 'churrasco', 'sorvete', 'doce',
    'pao', 'fruta', 'legume', 'bebida', 'refrigerante', 'cerveja', 'vinho'
  ]],
  ['transporte', [
    'uber', '99', 'taxi', 'onibus', 'metro', 'combustivel', 'gasolina',
    'estacionamento', 'pedagio', 'moto', 'bicicleta', 'passagem', 'trem',
    'carro', 'mecanico', 'pneu', 'seguro veiculo'
  ]],
  ['saude', [
    'farmacia', 'remedio', 'consulta', 'medico', 'exame', 'hospital',
    'dentista', 'academia', 'plano saude', 'vacina', 'fisioterapia',
    'psico', 'otica', 'oculos'
  ]],
  ['lazer', [
    'cinema', 'show', 'teatro', 'netflix', 'spotify', 'youtube', 'prime',
    'disney', 'viagem', 'hotel', 'jogo', 'bar', 'festa', 'balada',
    'parque', 'passeio', 'presente', 'gift', 'ingresso'
  ]],
  ['moradia', [
    'aluguel', 'condominio', 'agua', 'luz', 'internet', 'gas', 'iptu',
    'reforma', 'eletricidade', 'energia', 'telefone', 'celular', 'tv',
    'movel', 'eletrodomestico', 'limpeza', 'detergente'
  ]],
  ['educacao', [
    'curso', 'livro', 'escola', 'faculdade', 'material', 'mensalidade',
    'apostila', 'caneta', 'caderno', 'mochila', 'udemy', 'alura'
  ]],
  ['vestuario', [
    'roupa', 'sapato', 'tenis', 'loja', 'shopping', 'camiseta', 'calca',
    'vestido', 'blusa', 'jaqueta', 'meia', 'cueca', 'calcinha', 'bolsa'
  ]],
  ['receita', [
    'salario', 'freelance', 'dividendo', 'rendimento', 'bonus', 'venda',
    'servico', 'pagamento recebido', 'reembolso', 'renda', 'lucro',
    'investimento', 'aluguel recebido', 'comissao'
  ]],
];

/**
 * Remove acentos e converte para minúsculo para comparação
 * @param {string} str
 * @returns {string}
 */
function normalize(str) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Detecta a categoria com base na descrição
 * @param {string} description
 * @returns {string} nome da categoria
 */
function detectCategory(description) {
  const normalized = normalize(description);

  for (const [category, keywords] of KEYWORD_MAP) {
    for (const keyword of keywords) {
      if (normalized.includes(normalize(keyword))) {
        return category;
      }
    }
  }

  return 'outros';
}

/**
 * Nomes amigáveis das categorias em português
 */
const CATEGORY_LABELS = {
  alimentacao: 'Alimentação',
  transporte:  'Transporte',
  saude:       'Saúde',
  lazer:       'Lazer',
  moradia:     'Moradia',
  educacao:    'Educação',
  vestuario:   'Vestuário',
  receita:     'Receita',
  outros:      'Outros',
};

/**
 * Ícones das categorias
 */
const CATEGORY_ICONS = {
  alimentacao: '🍽️',
  transporte:  '🚗',
  saude:       '💊',
  lazer:       '🎉',
  moradia:     '🏠',
  educacao:    '📚',
  vestuario:   '👕',
  receita:     '💰',
  outros:      '📦',
};

module.exports = { detectCategory, CATEGORY_LABELS, CATEGORY_ICONS };
