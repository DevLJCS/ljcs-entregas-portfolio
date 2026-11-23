// Add significant releases at the top. See AGENTS.md for the release workflow.
export const releases = [
  { version: '1.25.2', date: '2026-11-22', title: 'Dicas nos ícones do menu recolhido', changes: [
    'Ao passar o mouse ou navegar pelo teclado nos ícones da barra lateral recolhida, o nome da seção aparece em uma dica flutuante.'
  ] },
  { version: '1.25.1', date: '2026-11-22', title: 'Atalho da central mais claro', changes: [
    'O atalho “Administrar central” agora vira um ícone de prédio quando o menu lateral está recolhido.',
    'O ícone SVG mantém o acesso identificável e fácil de tocar, sem o texto estreito ocupar a barra.'
  ] },
  { version: '1.25.0', date: '2026-11-22', title: 'Acompanhamento de pagamentos', changes: [
    'Ao registrar uma corrida, escolha se o pagamento já foi recebido ou ainda está pendente.',
    'Marque pagamentos como recebidos ou pendentes depois, direto no histórico de corridas.',
    'Consulte e filtre valores recebidos e pendentes; o saldo considera apenas valores efetivamente recebidos.'
  ] },
  { version: '1.24.2', date: '2026-11-22', title: 'Hodômetro e combustível nas pausas', changes: [
    'Ao pausar e retomar o expediente, informe novamente o hodômetro e o nível atual do marcador de combustível.',
    'O nível informado atualiza o marcador da moto e fica registrado no histórico do expediente.',
    'O sistema impede informar um hodômetro menor que a última leitura da jornada.'
  ] },
  { version: '1.24.1', date: '2026-11-22', title: 'Saldo residual no próximo dia', changes: [
    'O saldo de hoje inclui o déficit que ficou de dias anteriores, calculado pelas corridas e despesas registradas.',
    'Os valores negativos ficam destacados em vermelho no cartão de saldo.',
    'Quando os ganhos compensam o déficit, o dia seguinte começa sem saldo negativo acumulado.'
  ] },
  { version: '1.24.0', date: '2026-11-21', title: 'Cenário noturno futuro', changes: [
    'A nova imagem panorâmica do horizonte iluminado passou a integrar o login, a tela inicial e a Central.',
    'A imagem foi otimizada em WebP e recebe overlays para manter texto, cartões e navegação legíveis.',
    'A composição permanece responsiva no celular e no computador.'
  ] },
  { version: '1.23.0', date: '2026-11-21', title: 'Operação completa e inteligência cotidiana', changes: [
    'Pedidos ganham mensagens seguras, registro de ocorrências, avaliações e posição da rota.',
    'O painel ganhou resumo por voz, exportação em PDF e novos indicadores por expediente e corrida.',
    'Os recursos de mapa, contato, ocorrências e histórico ficam restritos aos participantes da entrega.',
    'Integrações externas como pagamento automático e push continuam exigindo credenciais configuradas.'
  ] },
  { version: '1.22.0', date: '2026-11-21', title: 'Interface neo-futurista cinematográfica', changes: [
    'Nova identidade visual escura, futurista e responsiva com azul-ciano, violeta e amarelo vibrante.',
    'Painéis, botões, navegação e cartões ganharam profundidade, brilho, hover dinâmico e transições suaves.',
    'As marcas agora usam composição transparente e o ícone do navegador foi redesenhado sem fundo.'
  ] },
  { version: '1.21.0', date: '2026-11-21', title: 'Cidade em movimento', changes: [
    'Login, painel e central ganharam um panorama noturno com prédios iluminados e rastros de luz.',
    'O saldo do dia e a seção ativa do menu ganharam mais destaque.'
  ] },
  { version: '1.20.1', date: '2026-11-21', title: 'Ícone do Entregas na tela inicial', changes: [
    'O atalho ganhou um ícone próprio para iPhone e uma versão com margem para o recorte dos ícones no Android.'
  ] },
  { version: '1.20.0', date: '2026-11-21', title: 'Rotas de luz', changes: [
    'O login, o painel e a central ganharam uma paisagem urbana noturna com trilhas de luz.',
    'Os cartões de planos e metas têm novos contrastes, com destaque dourado nas ações principais.'
  ] },
  { version: '1.19.0', date: '2026-11-21', title: 'Jornada completa por quilometragem', changes: [
    'Pausar o expediente agora exige o hodômetro e registra a hora da pausa.',
    'Início, pausa, retomada e encerramento ficam registrados com horário e quilometragem.',
    'Novas médias mostram corridas no expediente, faturamento por corrida, custo estimado por corrida e lucro estimado por corrida.'
  ] },
  { version: '1.18.1', date: '2026-11-21', title: 'Saldos negativos no gráfico diário', changes: [
    'O gráfico diário passou a mostrar faturamento menos despesas para cada dia.',
    'Dias com prejuízo aparecem em vermelho, com o valor negativo visível.'
  ] },
  { version: '1.18.0', date: '2026-11-21', title: 'Histórico completo pelos indicadores', changes: [
    'Clique em Faturamento no relatório para abrir todas as corridas registradas.',
    'Clique em Despesas pagas para abrir o histórico completo de despesas.',
    'Os indicadores seguem permitindo navegar entre áreas em celular e computador.'
  ] },
  { version: '1.17.0', date: '2026-11-19', title: 'Operação própria e planos com acesso direto', changes: [
    'Central da operação em página administrativa própria, separada da apresentação e dos planos.',
    'Cartões dos planos inteiros clicáveis, sem os antigos botões de demonstração.',
    'A demonstração oferece acesso ao cadastro com o plano escolhido já selecionado.',
    'Fonte do painel de gestão aplicada também à central, aos planos, formulários e demonstrações.'
  ] },
  { version: '1.16.2', date: '2026-11-19', title: 'Uma aba exclusiva para a operação', changes: [
    'Central da operação agora tem uma aba própria e identificada no menu do administrador.',
    'Planos e demonstrações abre uma tela separada, abaixo do menu, sem misturar controles administrativos.',
    'Ao alternar as abas, somente o conteúdo da área escolhida fica visível.'
  ] },
  { version: '1.16.1', date: '2026-11-19', title: 'Planos abaixo do menu', changes: [
    'Ao abrir Planos e demonstrações pela navegação, a comparação aparece abaixo do menu.',
    'O menu permanece como referência acima dos planos, incluindo na área de administração.'
  ] },
  { version: '1.16.0', date: '2026-11-19', title: 'Vários e-mails, uma só conta', changes: [
    'Vincule até 10 e-mails à mesma conta e entre com qualquer um deles usando sua senha atual.',
    'Escolha o e-mail principal e remova vínculos adicionais sem perder seus dados, plano ou passkeys.',
    'Gerenciamento disponível no perfil do administrador e em Meu cadastro na central.',
    'Alterações exigem senha atual e login recente; e-mails já vinculados a outra conta são recusados.',
    'O vínculo não verifica a caixa postal por código nesta etapa.'
  ] },
  { version: '1.15.1', date: '2026-11-19', title: 'Navegação com nomes mais claros', changes: [
    'A apresentação da plataforma passa a se chamar Conheça o LJCS.',
    'Na área do estabelecimento, o menu e a tela de pedidos passam a se chamar Solicitar entrega.'
  ] },
  { version: '1.15.0', date: '2026-11-19', title: 'Suas passkeys sob controle', changes: [
    'Administrador, lojas e entregadores podem listar e gerenciar as passkeys da própria conta.',
    'Cadastro de até 10 passkeys, com nomes para identificar aparelhos ou gerenciadores.',
    'Renomeie chaves e remova o acesso das que não usa mais, com confirmação na tela.',
    'Alterações exigem login recente e preservam as passkeys já cadastradas.',
    'No painel do administrador, abra seu perfil; na central, use Meu cadastro para encontrar o gerenciador.'
  ] },
  { version: '1.14.0', date: '2026-11-19', title: 'Rede em formação e mais recursos nos planos', changes: [
    'Apresentação nacional: a cidade da operação aparece publicamente somente após a abertura.',
    'Pedidos reais exigem ao menos 10 lojas e 10 entregadores aprovados com termos atuais, além da confirmação operacional do administrador.',
    'Antes da abertura, lojas entram por convite individual ou registram interesse, sem acesso automático.',
    'Básico ganha painel diário, meta com estimativa e histórico com busca e filtros.',
    'Normal inclui despesas por categoria, restauração e saldo estimado, além de relatórios.',
    'Premium inclui moto, odômetro, lembretes de manutenção, comparativos e exportação dos próprios dados.',
    'Cada plano tem suas telas após o login. A ordem das chamadas continua seguindo a proximidade.'
  ] },
  { version: '1.13.0', date: '2026-11-19', title: 'Uma entrada para toda a rede LJCS', changes: [
    'Administrador, estabelecimento e entregador entram pela tela principal e seguem para suas áreas.',
    'Cadastro com apresentação do LJCS Entregas, escolha de plano para entregadores e aceite obrigatório dos termos.',
    'Aceites registrados por conta, versão e data; contas antigas precisam aceitar os termos para operar.',
    'Lojas e entregadores podem adicionar passkeys à própria conta e usá-las na entrada principal.',
    'Imagem da marca e slogan LJCS: Logística, Jornada, Controle e Segurança.',
    'Contato público de atendimento e privacidade nos termos de uso.'
  ] },
  { version: '1.12.0', date: '2026-11-19', title: 'Compare os planos e experimente as telas', changes: [
    'Comparação pública com os recursos de cada plano e demonstrações interativas com dados fictícios.',
    'Básico: chamadas por proximidade, acompanhamento e histórico recente das entregas.',
    'Normal: recursos do Básico e relatórios de 7 e 30 dias, com totais, média e evolução diária.',
    'Premium: recursos do Normal, período personalizado de até 90 dias e exportação CSV.',
    'As permissões dos relatórios e da exportação são verificadas no servidor.',
    'A distribuição de chamadas continua por proximidade em todos os planos, sem prioridade paga.'
  ] },
  { version: '1.11.0', date: '2026-11-19', title: 'Planos semanais e controle de acesso', changes: [
    'Planos de entregador: Básico por R$ 10, Normal por R$ 25 e Premium por R$ 50 por semana.',
    'Administrador pode registrar pagamentos recebidos, renovar semanas e definir data e hora de vencimento.',
    'Revogação e reativação de acesso, com histórico de pagamentos e alterações por conta.',
    'Assinaturas vencidas ou revogadas bloqueiam as funções da central e novas ofertas, inclusive em sessões abertas.',
    'Entregador consulta seu plano, validade e pagamentos; cobranças e confirmação de pagamento continuam manuais.',
    'Os três planos oferecem o mesmo acesso nesta etapa, com distribuição de chamadas por proximidade.'
  ] },
  { version: '1.10.0', date: '2026-11-19', title: 'Central com cadastro e chamadas por proximidade', changes: [
    'Cadastro de estabelecimentos com endereço salvo, busca por CEP e pin no mapa; retirada alternativa e destino obrigatório.',
    'Cadastros liberados pelo administrador e entregadores disponíveis com GPS ativo.',
    'Ofertas por 5 segundos, do entregador mais próximo ao mais distante, sem escolha pela loja.',
    'Antes do aceite, a oferta mostra apenas estabelecimento, retirada, responsável e valor.',
    'Tarifa de madrugada pelo horário de São Paulo e chuva pela previsão meteorológica de Jaú.',
    'Classificação urbana/rural pela malha do IBGE e aprovação do valor rural antes da solicitação.',
    'As ofertas chegam com a central aberta e visível; chamadas com a tela fechada ainda não estão disponíveis.'
  ] },
  { version: '1.9.0', date: '2026-11-19', title: 'Central de entregas em teste', changes: [
    'A demonstração da Central de Jaú está disponível em /central/.',
    'É um protótipo: não use para pedidos reais e não informe dados pessoais.',
    'Cadastro real, GPS, notificações e operação compartilhada ainda estão em desenvolvimento.'
  ] },
  { version: '1.8.1', date: '2026-11-19', title: 'Data no formato brasileiro', changes: [
    'O campo de data do painel agora mostra e aceita datas como dd/mm/aaaa.',
    'O calendário continua disponível pelo ícone ao lado da data.'
  ] },
  { version: '1.8.0', date: '2026-11-19', title: 'Resumo das corridas', changes: [
    'Veja a quantidade de corridas e o valor total recebido na seleção atual.',
    'Destaque automático para o estabelecimento mais frequente e para a corrida de maior valor.',
    'Os indicadores acompanham a busca e o filtro de plataforma.'
  ] },
  { version: '1.7.0', date: '2026-11-18', title: 'Atalhos nos cartões e garagem de motos', changes: [
    'Faturamento e corridas realizadas abrem Minhas corridas; despesas do dia abre Despesas.',
    'Cadastro de motos com marca, modelo, ano, capacidade total, reserva e tipo de marcador.',
    'Troca de moto na nuvem, preservando abastecimentos, nível do tanque, odômetro, custos e manutenção por veículo.',
    'Catálogo inicial com referências de fabricantes e cadastro manual para outros modelos; dados ausentes precisam de confirmação no manual.',
    'Marcador adaptável para barras digitais, ponteiro ou somente aviso de reserva.'
  ] },
  { version: '1.6.0', date: '2026-11-18', title: 'Ícones modernos e estados mais claros', changes: [
    'Ícones SVG padronizados na navegação, cartões, botões, formulários e listas.',
    'Lápis e lixeira identificam edição e exclusão; alvo, moto e bomba identificam meta, corridas e combustível.',
    'Indicador de nuvem acompanha os estados de conexão, envio e pendências.',
    'Telas sem registros ganham ilustrações vetoriais leves; a identidade LJCS foi preservada.'
  ] },
  { version: '1.5.1', date: '2026-11-18', title: 'Edição da meta pelo objetivo', changes: [
    'Clique ou toque no cartão OBJETIVO para editar a meta diária.',
    'Botão separado de edição removido para simplificar o painel.'
  ] },
  { version: '1.5.0', date: '2026-11-18', title: 'Tema e layout padronizados', changes: [
    'Cores, tipografia, espaçamentos, cartões e botões unificados em todo o site.',
    'Valores e textos se ajustam aos cartões, com tratamento para nomes longos e números altos.',
    'Cabeçalho, listas, histórico e formulários reorganizados para celular, tablet e computador.',
    'Menu recolhido mais compacto e navegação com foco visível e áreas de toque consistentes.'
  ] },
  { version: '1.4.0', date: '2026-11-18', title: 'Novidades e versões', changes: [
    'Nova janela para acompanhar as mudanças significativas do site.',
    'Versão atual sempre disponível no painel, também no celular.'
  ] },
  { version: '1.3.0', date: '2026-11-18', title: 'Visual renovado e carregamento mais leve', retrospective: true, changes: [
    'Textos e números maiores, novos cartões e botões mais fáceis de tocar.',
    'Layout adaptado para telas pequenas, com correção de cortes nas listas.',
    'Imagens da marca mais leves e melhorias no carregamento e nas atualizações da tela.'
  ] },
  { version: '1.2.0', date: '2026-11-18', title: 'Sincronização automática e previsão da meta', retrospective: true, changes: [
    'Envio automático de registros pendentes ao reconectar e ao voltar ao aplicativo.',
    'Atualizações da nuvem a cada 30 segundos com o aplicativo aberto.',
    'Estimativa de quantas corridas de R$ 9,00 faltam para atingir a meta de faturamento.'
  ] },
  { version: '1.1.0', date: '2026-11-18', title: 'Jornada, custos e manutenção', retrospective: true, changes: [
    'Expediente com início, pausas, encerramento e quilometragem.',
    'Faturamento por hora e por km, custos configuráveis e resultado estimado.',
    'Resumos de 7 e 30 dias, exportação e lembretes de manutenção.',
    'Sugestões de estabelecimentos e registro de novas corridas e despesas sem internet.'
  ] },
  { version: '1.0.0', date: '2026-11-18', title: 'Painel inicial de entregas', retrospective: true, changes: [
    'Controle de corridas, despesas, abastecimentos e meta diária.',
    'Histórico, filtros, exportação CSV e indicador manual do tanque.',
    'Acesso por e-mail e senha ou passkey, com edição de perfil.'
  ] }
];

export function initReleaseHistory() {
  const current = releases[0];
  const dialog = document.getElementById('versions-modal');
  const list = document.getElementById('release-list');
  // Text nodes keep release notes as plain text rather than executable markup.
  for (const [index, release] of releases.entries()) {
    const entry = document.createElement('article');
    entry.className = 'release-entry';
    const meta = document.createElement('div'); meta.className = 'release-meta';
    const version = document.createElement('strong'); version.textContent = `v${release.version}`;
    const date = document.createElement('time'); date.dateTime = release.date;
    date.textContent = new Date(`${release.date}T12:00:00`).toLocaleDateString('pt-BR');
    meta.append(version, date);
    if (index === 0) { const badge = document.createElement('span'); badge.className = 'release-current'; badge.textContent = 'Atual'; meta.append(badge); }
    const title = document.createElement('h3'); title.textContent = release.title;
    const changes = document.createElement('ul');
    for (const change of release.changes) { const item = document.createElement('li'); item.textContent = change; changes.append(item); }
    entry.append(meta, title, changes); list.append(entry);
  }
  document.querySelectorAll('[data-release-history]').forEach(button => {
    button.innerHTML = `<span data-icon="list"></span><span>v${current.version} · Novidades</span>`;
    button.dataset.version = `v${current.version}`;
    button.title = `Novidades e versões · v${current.version}`;
    button.addEventListener('click', () => { dialog.showModal(); dialog.scrollTop = 0; });
  });
}
