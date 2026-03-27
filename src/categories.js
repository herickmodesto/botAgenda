'use strict';

const KEYWORD_MAP = [
  ['alimentacao', [
    'almoco', 'jantar', 'cafe', 'lanche', 'restaurante', 'pizza', 'hamburguer',
    'sushi', 'ifood', 'rappi', 'delivery', 'mercado', 'feira', 'padaria',
    'supermercado', 'acougue', 'hortifruti', 'churrasco', 'sorvete', 'doce',
    'pao', 'fruta', 'legume', 'bebida', 'refrigerante', 'cerveja', 'vinho',
    'agua', 'suco', 'marmita', 'self service', 'lanchonete', 'mcdonalds',
    'burger king', 'subway', 'kfc', 'rodizio', 'açai', 'acai',
  ]],
  ['transporte', [
    'uber', '99', 'taxi', 'onibus', 'metro', 'combustivel', 'gasolina',
    'etanol', 'alcool', 'estacionamento', 'pedagio', 'moto', 'bicicleta',
    'passagem', 'trem', 'carro', 'mecanico', 'pneu', 'seguro veiculo',
    'oficina', 'revisao', 'oleo', 'lavagem', 'brt', 'van', 'mototaxi',
    'patinete', 'carsharing', 'combustivel', 'tanque',
  ]],
  ['saude', [
    'farmacia', 'remedio', 'consulta', 'medico', 'exame', 'hospital',
    'dentista', 'academia', 'plano saude', 'vacina', 'fisioterapia',
    'psicologo', 'psiquiatra', 'otica', 'oculos', 'cirurgia', 'internacao',
    'pronto socorro', 'nutricionista', 'personal', 'pilates', 'yoga',
    'crossfit', 'suplemento', 'vitamina', 'curativo', 'pomada',
  ]],
  ['lazer', [
    'cinema', 'show', 'teatro', 'netflix', 'spotify', 'youtube', 'prime',
    'disney', 'viagem', 'hotel', 'jogo', 'bar', 'festa', 'balada',
    'parque', 'passeio', 'presente', 'ingresso', 'streaming', 'xbox',
    'playstation', 'steam', 'game', 'serie', 'clube', 'boliche',
    'karaoke', 'cruzeiro', 'pousada', 'airbnb', 'resort', 'excursao',
  ]],
  ['moradia', [
    'aluguel', 'condominio', 'iptu', 'reforma', 'eletricidade', 'energia',
    'internet', 'gas', 'luz', 'tv por assinatura', 'movel', 'eletrodomestico',
    'limpeza', 'detergente', 'sabao', 'faxina', 'diarista',
    'pintura', 'encanador', 'eletricista', 'seguro casa', 'financiamento',
    'prestacao casa', 'mudanca', 'material construcao',
  ]],
  ['educacao', [
    'curso', 'livro', 'escola', 'faculdade', 'material', 'mensalidade',
    'apostila', 'caneta', 'caderno', 'mochila', 'udemy', 'alura',
    'coursera', 'duolingo', 'ingles', 'espanhol', 'idioma', 'aula',
    'professor', 'tutoria', 'uniforme', 'matricula', 'pos graduacao',
    'mba', 'workshop', 'treinamento', 'certificacao',
  ]],
  ['vestuario', [
    'roupa', 'sapato', 'tenis', 'loja', 'shopping', 'camiseta', 'calca',
    'vestido', 'blusa', 'jaqueta', 'meia', 'cueca', 'calcinha', 'bolsa',
    'relogio', 'bone', 'chapeu', 'cinto', 'mala', 'carteira',
    'renner', 'riachuelo', 'hm', 'zara', 'nike', 'adidas', 'havaianas',
  ]],
  ['beleza', [
    'salao', 'cabeleireiro', 'manicure', 'pedicure', 'barbearia', 'corte',
    'coloracao', 'escova', 'hidratacao', 'perfume', 'maquiagem', 'batom',
    'esmalte', 'shampoo', 'condicionador', 'creme', 'protetor solar',
    'depilacao', 'sobrancelha', 'spa', 'massagem', 'estetica',
  ]],
  ['pets', [
    'veterinario', 'vete', 'racao', 'pet shop', 'petshop', 'cachorro',
    'gato', 'banho tosa', 'vacina pet', 'remedio pet', 'brinquedo pet',
    'coleira', 'areia gato', 'aquario',
  ]],
  ['investimento', [
    'acao', 'fii', 'fundo', 'poupanca', 'cdb', 'lci', 'lca', 'tesouro',
    'crypto', 'bitcoin', 'ethereum', 'cripto', 'xp invest', 'nubank invest',
    'rico', 'clear', 'btg', 'reserva', 'previdencia', 'aplicacao',
  ]],
  ['receita', [
    'salario', 'freelance', 'freela', 'dividendo', 'rendimento', 'bonus',
    'venda', 'servico', 'reembolso', 'lucro', 'comissao',
    'aluguel recebido', '13 salario', 'ferias', 'hora extra', 'gorjeta',
    'pix recebido', 'transferencia recebida',
  ]],
];

function normalize(str) {
  return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function detectCategory(description) {
  const normalized = normalize(description);
  for (const [category, keywords] of KEYWORD_MAP) {
    for (const keyword of keywords) {
      if (normalized.includes(normalize(keyword))) return category;
    }
  }
  return 'outros';
}

const CATEGORY_LABELS = {
  alimentacao:  'Alimentação',
  transporte:   'Transporte',
  saude:        'Saúde',
  lazer:        'Lazer',
  moradia:      'Moradia',
  educacao:     'Educação',
  vestuario:    'Vestuário',
  beleza:       'Beleza',
  pets:         'Pets',
  investimento: 'Investimento',
  receita:      'Receita',
  outros:       'Outros',
};

const CATEGORY_ICONS = {
  alimentacao:  '🍽️',
  transporte:   '🚗',
  saude:        '💊',
  lazer:        '🎉',
  moradia:      '🏠',
  educacao:     '📚',
  vestuario:    '👕',
  beleza:       '💅',
  pets:         '🐾',
  investimento: '📈',
  receita:      '💰',
  outros:       '📦',
};

module.exports = { detectCategory, CATEGORY_LABELS, CATEGORY_ICONS };
