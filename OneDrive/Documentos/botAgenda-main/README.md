# Bot de Finanças para WhatsApp

Bot para registrar gastos e receitas diretamente pelo WhatsApp, com relatórios mensais.

## Como usar

### Registrar lançamentos
Envie uma mensagem em linguagem natural:

```
gastei 50 almoço
paguei 120 farmácia
comprei 80 tênis
recebi 3000 salário
ganhei 500 freelance
entrou 200 reembolso
```

### Comandos
| Comando | Descrição |
|---------|-----------|
| `/hoje` | Lançamentos de hoje |
| `/mes` | Todos os lançamentos do mês |
| `/resumo` | Total gasto vs recebido no mês |
| `/categorias` | Gastos por categoria |
| `/apagar <ID>` | Remove um lançamento pelo ID |
| `/ajuda` | Mostra esta ajuda |

## Instalação

### Pré-requisitos
- Node.js 18 ou superior
- (Windows) Visual Studio Build Tools com "Desenvolvimento para desktop com C++"

### Passos

1. Instalar dependências:
```bash
npm install
```

2. Iniciar o bot:
```bash
npm start
```

3. Escanear o QR Code que aparecer no terminal com seu WhatsApp:
   - Abra o WhatsApp no celular
   - Vá em **Configurações → Dispositivos Vinculados → Vincular Dispositivo**
   - Escaneie o QR Code

4. Pronto! A sessão fica salva — na próxima execução não precisa escanear novamente.

## Manter rodando (opcional)

```bash
npm install -g pm2
pm2 start src/index.js --name finance-bot
pm2 save
```

## Estrutura

```
├── src/
│   ├── index.js       ← entrada principal (cliente WhatsApp)
│   ├── database.js    ← SQLite (leitura e escrita)
│   ├── parser.js      ← interpreta mensagens de texto
│   ├── categories.js  ← detecta categoria pelo texto
│   ├── commands.js    ← handlers dos comandos /xxx
│   └── formatter.js   ← formata as respostas
└── data/
    └── finance.db     ← banco de dados (criado automaticamente)
```
