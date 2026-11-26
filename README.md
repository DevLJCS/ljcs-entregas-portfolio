# LJCS Entregas

Projeto de portfólio de uma aplicação web para gestão financeira de entregadores e coordenação de entregas. Reúne um painel administrativo, uma central para lojas e entregadores, controles de jornada e relatórios em uma interface responsiva.

**Demonstração:** [entregas.luancordeirolc.com](https://entregas.luancordeirolc.com/)

> A Central de Entregas está em desenvolvimento. As solicitações devem ser usadas apenas para demonstração e testes, não para organizar entregas reais.

## Funcionalidades

- Registro de corridas, estabelecimento, plataforma e situação do pagamento.
- Acompanhamento de valores faturados, recebidos e pendentes.
- Controle de despesas, abastecimentos, hodômetro e nível de combustível.
- Abastecimentos completos ou parciais com marcadores inicial e final; o consumo médio usa intervalos entre tanques completos.
- Jornadas com início, pausa, retomada, encerramento e métricas.
- Saldo diário, despesas, metas, relatórios e exportação CSV.
- Central de demonstração com perfis de loja, entregador e administração.
- Autenticação por senha e passkeys, validações no servidor e armazenamento local/offline.
- Interface futurista responsiva e acessível, com navegação por teclado.
- Termos de uso, política de privacidade, contato de suporte e autoria vinculada ao GitHub.

## Tecnologias

- TypeScript e Cloudflare Workers para a API.
- Cloudflare D1 para os dados financeiros e Cloudflare Durable Objects para a central.
- JavaScript, HTML e CSS para a interface.
- Vite para compilação de assets.
- WebAuthn / passkeys para autenticação sem senha.

## Executar localmente

Requisitos: Node.js 22+ e Wrangler.

```powershell
npm install
Copy-Item wrangler.example.jsonc wrangler.jsonc
npx wrangler d1 create entregas-ljcs-demo
```

Edite `wrangler.jsonc` e substitua o `database_id` de exemplo pelo ID do banco D1 de desenvolvimento recém-criado. Em seguida, prepare o banco e inicie o Worker:

```powershell
npx wrangler d1 execute entregas-ljcs-demo --local --file=schema.sql
npm run dev
```

O painel local fica disponível em `http://127.0.0.1:8787/`. Para testar a configuração inicial da conta, defina `INITIAL_SETUP_TOKEN` como segredo local em `.dev.vars`; esse arquivo já está excluído do Git. Nunca use credenciais ou bancos de produção em testes.

## Compilar e validar

```powershell
npm run typecheck
npm run build
node tests/goal.mjs
```

Os testes de integração precisam de um Worker local ativo e dados de teste locais. As fixtures SQL locais não são incluídas no repositório.

## Publicar uma instância própria

1. Configure uma conta Cloudflare e crie um banco D1 exclusivo para desenvolvimento.
2. Crie `wrangler.jsonc` a partir de `wrangler.example.jsonc` e configure o ID do banco.
3. Crie o esquema no banco e configure `INITIAL_SETUP_TOKEN` com `npx wrangler secret put INITIAL_SETUP_TOKEN`.
4. Revise as variáveis e rotas para o seu ambiente antes de executar `npm run deploy`.

O repositório não contém o arquivo local `wrangler.jsonc`, IDs de recursos, segredos, bancos, logs, backups ou registros pessoais.

As páginas públicas de [termos de uso](https://entregas.luancordeirolc.com/termos-de-uso.html) e [privacidade](https://entregas.luancordeirolc.com/politica-de-privacidade.html) descrevem os recursos e canais de suporte da instância publicada. Ao publicar outra instância, revise os contatos, as práticas de dados e os textos legais para refletir sua própria operação.
