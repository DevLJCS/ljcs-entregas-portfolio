# Central de Jaú — 1.13.0

Aplicação publicada em `/central/`, compilada com `npm run build` e servida pelo Worker existente. Desenvolvimento completo: `npm run build` e `npm run dev`, em http://127.0.0.1:8787/central/. `npm run dev:dispatch` é opcional para o frontend e encaminha as APIs ao Worker local.

## Operação

### Assinaturas manuais

Básico R$10, Normal R$25, Premium R$50 por semana. Básico inclui chamadas, acompanhamento e histórico recente. Normal acrescenta relatórios de 7 e 30 dias com total das entregas, média e evolução diária. Premium acrescenta período personalizado de até 90 dias e CSV. Nenhum plano muda a ordem por proximidade. A conta do proprietário e os estabelecimentos não pagam semanal nesta implementação. O painel financeiro pessoal continua reservado ao proprietário; a assinatura cobre a central do entregador.

O administrador abre a conta do entregador em Administração, libera o cadastro e registra o pagamento recebido. Cada semana acrescenta 7 dias ao maior prazo entre agora e a validade atual. Pode informar validade personalizada, plano, valor efetivamente recebido, data do pagamento e observação visível ao entregador. Não há cobrança nem recebimento de dinheiro pelo site. Registrar pagamento reativa a assinatura; cadastro suspenso ainda exige liberação separada.

“Ajustar plano e prazo” permite corrigir a validade ou conceder acesso manualmente sem inventar pagamento. “Revogar acesso agora” bloqueia a assinatura preservando o histórico. Para reativar sem novo pagamento, salve uma validade futura e desmarque “Manter acesso revogado”. Datas exibidas e editadas em São Paulo. O vencimento ocorre no instante escolhido; uma data sem horário não presume fim do dia.

Novas contas e contas antigas sem validade liberada ficam bloqueadas até regularização. As validações são feitas no servidor a cada chamada, na escolha de candidatos e nos alarmes de validade. Sessão aberta não contorna bloqueio. Conta vencida/revogada vê apenas cadastro e informações da assinatura; funções de entrega são bloqueadas. Pedidos já aceitos preservam a atribuição e ficam visíveis ao administrador e à loja. Antes de bloquear uma conta com entrega em andamento, o administrador vê um aviso e deve acompanhar a conclusão/cancelamento operacionalmente; não há redistribuição silenciosa de entrega já aceita.

Pagamentos usam chave de idempotência e revisão da assinatura para impedir renovação duplicada ou sobrescrita entre administradores/abas. Histórico persistido nas tabelas subscriptions, subscription_payments e subscription_events, criadas sem modificar contas existentes. Não há exclusão de pagamentos. Ajustes ficam registrados como novos eventos. O histórico exibido é limitado aos últimos 500 pagamentos gerais / 100 do próprio entregador e 200 alterações gerais.

Teste local específico: `node tests/subscriptions.mjs`. Verifica preços, 7 dias, renovação antecipada/vencida, duplicação, concorrência, permissões, privacidade, revogação, expiração e retirada das ofertas. Não cria cobranças ou registros de pagamento na produção.

Estabelecimentos e entregadores criam contas próprias. O proprietário acessa Administração usando a sessão já autenticada do painel financeiro e libera cada cadastro. O endereço da loja é salvo; outra retirada é permitida. Destino completo e pin são obrigatórios. CEP preenche rua, bairro, cidade e UF, sem presumir a localização exata de um número.

O coordenador persistente `DispatchCity`, separado do D1 financeiro, usa um Durable Object SQLite por município (código de Jaú 3525300). O servidor guarda contas, sessões, cotações, pedidos e eventos. As ofertas são exclusivas, duram 5 segundos e expiram por alarme no servidor. Leituras também verificam expirações. Aceites e decisões de atribuição são transações síncronas, sem I/O externo entre verificação e atualização. Eventos guardam criação, oferta, recusa, expiração, aceite, cancelamento e conclusão. Chaves de idempotência e consumo da cotação impedem duplicações por reenvio.

Proximidade é distância geodésica até o pin da retirada, não tempo de percurso. Somente entregadores aprovados, disponíveis, com heartbeat de até 15s e GPS de até 45s/precisão de até 250m participam. Ocupados e já ofertados para o mesmo pedido são excluídos. A fila espera por disponibilidade por até 10 minutos. Sem aceite, a loja precisa fazer uma nova solicitação. O frontend consulta ofertas a cada segundo. Precisa permanecer aberto e visível; GPS depende da autorização do usuário. Não há push em segundo plano. Não há perfis fictícios nem seleção de entregador pela loja.

Antes do aceite, a API do entregador usa uma lista explícita: estabelecimento, endereço de retirada, responsável, valor, além do identificador/estado/prazo necessários para responder. Destino só é liberado após aceite. Lojas veem apenas seus pedidos. Administração é permitida somente pela autenticação existente do proprietário, verificada pelo Worker; nenhuma autorização administrativa vem do navegador.

## Tarifas e fontes

Hora do servidor com fuso America/Sao_Paulo: base R$10; 00h–00h59 R$12; 01h–04h59 R$13. Sempre maior valor aplicável com chuva R$11 e Posto Peixinho R$15. Posto Peixinho é identificado pela opção da loja; não foi inventada uma geocerca do posto. Não é possível editar clima/horário/preço pelo cliente. Volume pesado calcula duas viagens; troca multiplica as viagens por dois; reentrega soma uma. Retornos gratuitos não acrescentam valor.

Zona rural: valor total aprovado pelo administrador, com confirmação posterior da loja. Malha IBGE 2022 com geometrias locais completas, sem círculo aproximado: `shared/jau-zones.json`. Foram consultadas as camadas `CGMAT:qg_2022_705_areaurbanapormunicipiopfc_agreg` e `CGMAT:qg_2022_700_arearuralpormunicipiopfc_agreg` no WFS https://geoservicos.ibge.gov.br/geoserver/ows, filtradas por `cd_mun='3525300'`, EPSG:4326. Limite histórico, podendo divergir de expansão urbana atual. Fora do município não é atendido nesta versão.

Clima: https://api.met.no/doc/TermsOfService, aceitos explicitamente pelo proprietário em 19/11/2026. Locationforecast, coordenada fixa de Jaú, cache de 3h conforme intervalo mínimo fora da região nórdica. Tarifa derivada de precipitação prevista para a hora atual; não é sensor de chuva na rua. Fonte e horário são exibidos, com atribuição CC BY 4.0. Falha/ausência de previsão exige valor revisado pelo administrador, sem supor tempo seco. Nenhum endereço de cliente é enviado ao provedor meteorológico.

Busca de CEP: https://viacep.com.br/ com cache e limite de consultas. Mapa Leaflet local e tiles https://tile.openstreetmap.org, somente ao abrir o mapa, crédito visível e cache nativo do navegador. Sem geocodificação em serviços externos ou prefetch de tiles. Provedores públicos podem ficar indisponíveis; campos manuais continuam disponíveis para endereços, mas o pin precisa ser confirmado.

## Verificação e limites

`node tests/central.mjs` testa somente http://127.0.0.1:8787: tarifas, malha real, cadastro/aprovação, privacidade, proximidade, expiração em 5s, aceite concorrente, recusa, entregador ocupado, cancelamento, isolamento de lojas, idempotência, aprovação rural e GPS recente. Usa contas fictícias apenas no ambiente local. `npm run typecheck` e `npm run build` verificam contratos e compilação.

Ainda não inclui recuperação de senha por e-mail, verificação documental, acerto financeiro automatizado, mapa ao vivo do entregador ou notificações com tela fechada. A localização é a fornecida pelo aparelho; não há detecção antifraude de GPS. A malha rural/urbana e a precisão meteorológica devem ser conferidas no piloto operacional. Não foi demonstrada capacidade para todos os entregadores simultâneos da cidade por teste de carga.

## Comparação, demonstrações e relatórios — 1.12

A página pública da central apresenta os três planos antes do cadastro, com funções, preços e demonstrações de telas em diálogo. As demonstrações são independentes das APIs de pedido e pagamento, identificam todos os dados como fictícios e não geram corridas nem arquivos reais. Usuários autenticados abrem a comparação pelo botão “Planos e demonstrações”. A escolha no cadastro também mostra os benefícios do plano selecionado.

O catálogo compartilhado em src/subscription-rules.ts é usado na API e no frontend, mantendo preços e funções na mesma fonte. Benefícios são cumulativos: Básico → Normal → Premium. As permissões de relatório e CSV são verificadas no servidor, além dos controles visuais e da validade da assinatura.

Relatórios consideram apenas pedidos concluídos atribuídos ao próprio entregador, pela data do evento de conclusão. Registros legados sem evento usam a data de criação como compatibilidade. Totais são valores das entregas, antes de despesas, sem confirmar acerto da loja ou recebimento bancário. Dias sem entregas não geram barras. Fuso São Paulo, limites inclusivos por dia. Consultas limitadas a 30/minuto por conta. CSV comporta até 10.000 linhas por exportação, acima disso solicita período menor; valores e totais não são truncados silenciosamente. Nomes que poderiam virar fórmulas em planilha são neutralizados no CSV.

Teste: node tests/reports.mjs cobre permissão por plano, isolamento entre entregadores, totais e agrupamento diário, datas locais, CSV, neutralização de fórmulas e bloqueio de assinatura revogada. Mantidos os testes de assinaturas e despacho. Estes testes usam somente o Worker local.

## Entrada única, termos e passkeys — 1.13

A tela principal em `/` atende os três perfis. `/api/access/login/password` reconhece o e-mail administrativo existente no D1 ou autentica a conta da central; o usuário não escolhe uma função privilegiada. Administrador entra no financeiro e tem link para `/central/?area=admin`; loja/entregador seguem para a própria central. Novos cadastros são somente loja ou entregador. O e-mail administrativo fica reservado. A troca de conta e a saída unificada revogam a sessão anterior e limpam os cookies correspondentes. A interface remove o cache financeiro ao entrar em conta da central; uso financeiro offline exige marcador de entrada administrativa verificada.

O link de cadastro em `/central/?cadastro=1` apresenta a rede, o funcionamento por perfil, planos do entregador e termos específicos. `shared/terms.ts` contém o texto, a versão e contatos de exemplo; configure os contatos públicos da sua instância antes de publicar. Não foi inventada razão social ou CNPJ. O texto descreve condições operacionais e dados tratados, sem declarar certificação de conformidade jurídica. Novos cadastros precisam enviar aceite explícito e a versão corrente; registro na tabela terms_acceptances associa conta, função, versão e data do servidor. Contas antigas sem aceite ficam impedidas de operar e não recebem ofertas até aceitar. Dados existentes não são excluídos. Versões futuras do texto exigem nova versão e novo aceite. Não há caixa pré-marcada ou consentimento de publicidade.

Senha é criada no cadastro. Passkey é opcional e pode ser adicionada em Meu cadastro após entrada recente (15 minutos). Credenciais e desafios de cadastro ficam no SQLite da central e são vinculados ao usuário autenticado. Desafios expiram em 5 minutos e são de uso único. User verification e credenciais descobríveis são exigidas. Chaves públicas/counters são salvos, sem biometria. Limite de 10 passkeys por conta. A entrada principal usa desafio único armazenado no D1 e descobre a conta pelo ID da credencial; mantém compatibilidade com as passkeys administrativas existentes no D1. Origem, RP ID, assinatura e contador são verificados pela versão instalada de SimpleWebAuthn. Passkey não contorna assinatura, aprovação de cadastro ou termos. Não há recuperação/revogação de chaves pela interface nesta etapa; a senha continua como alternativa.

O desenvolvimento local usa `--infer-origin-from-routes=false`, mantendo a origem localhost real para WebAuthn. Use http://localhost:8787 para testes de navegador. A produção continua no domínio HTTPS existente.

`node tests/accounts.mjs`: autenticação unificada por função, cookies/sessões ao trocar conta, bloqueio de e-mail reservado, aceite obrigatório/versionado, isolamento de passkeys, registro e login WebAuthn com chave EC de teste, rejeição de origem e contador, uso único de desafio, assinatura bloqueada e saída. O teste usa somente localhost e autenticador criptográfico sintético; não altera passkeys de pessoas nem contas de produção. Passkeys em aparelhos físicos dependem do navegador/aparelho; não foram cadastradas chaves reais durante a execução.
