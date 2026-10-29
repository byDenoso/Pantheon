# Atlas privado: revisão de apresentação de 11/10/2026

A implementação revisada é o checkout atual de Sites em `/workspace/atlas-site`, base `aeccc307`. A direção visual mantém Nunito/Barlow, azul, fundos claro/escuro, arte cósmica, cartões e navegação móvel existentes. Ajustes de apresentação preservam os contratos, estados e textos científicos registrados. A exploração inicial do checkout histórico de Pantheon foi arquivada pelo integrador e não substitui esta revisão.

A produção foi investigada pelo integrador e apresentou `reauthentication_required` no conector Google Drive. As telas privadas desta revisão foram verificadas **em backend local com fixtures sintéticas**. Não houve autenticação com credenciais reais nem validação visual dos registros privados vivos. Nenhuma reconexão real, autorização MCP ou alteração da Tower foi feita.

| Aba/fluxo | Observação e resultado |
| --- | --- |
| Conta e código de acesso | Validação de identidade existente preservada. O formulário ganhou composição com hierarquia, contexto de pesquisa, campos acessíveis e aviso associado ao campo recusado. O PIN continua sendo apagado após envio. Código inválido não monta o frame. |
| Reconexão e disponibilidade | A falha do conector tem tela própria. `drive_consent` oferece somente o link normal `target="_top"` para `/signin-with-chatgpt?return_to=%2F%23%2Fprivado`. `drive_unavailable` comunica indisponibilidade sem sugerir nova autorização. Ambos ocultam o PIN irrelevante. A verificação da conexão é manual e revalida a página; não há loop de redirecionamento. |
| Fonte temporariamente indisponível | A ação de tentar novamente respeita `retryAfter`, mostra contagem regressiva e chama o controlador existente somente após o prazo. O término da contagem não faz uma leitura automática. Sair continua disponível. |
| Carregamento privado | O frame conserva o layout por flex e o viewport disponível. A espera apresenta um estado legível até o runtime ser aceito pela ponte existente. Sandbox, origem, canal e revogação seguem os contratos anteriores. |
| Teia | O canvas e as interações existentes continuam funcionando. Foram inspecionados desktop/móvel e tema claro/escuro. Os controles de ciência e o renderer não foram substituídos. |
| Domínios e detalhe do domínio | Cartões, descrições, limites de cobertura, aliases e estrutura atual preservados. A leitura sintética abre Olympus e seus testes. A camada atual já corrigia os links internos dos cartões, portanto não recebeu uma correção duplicada. |
| Testes e filtros | Busca permanece ao alternar Todos/Resultado/Pendências. A chave da fronteira de erros agora acompanha o domínio, evitando remount desnecessário quando apenas o filtro muda. A paginação reinicia no filtro novo e o estado vazio permite limpar a busca. Contagens continuam vindo da leitura. |
| Detalhe do teste | Pergunta, interpretação, valores, limites, relações, execução, revisão, dados e método continuam separados. Paridade SSR entre perfis completo e compacto preservada em PT/EN. Conteúdo JSON profundamente aninhado passou a declarar abreviação quando ultrapassa o limite de texto. Zero e falso permanecem valores válidos. |
| Operação e Writer | Filas e disponibilidade do Writer continuam somente leitura. A revisão não cria novas decisões nem executa trabalhos. Atualização agora exibe seu resultado perto do topo da workspace, em vez de apenas no rodapé distante. |
| Mural dos agentes | Mensagens, referências, respostas e seus estados registrados preservados. Filtro vazio, abertura de teste referenciado e navegação móvel inspecionados. O mural atual conserva as evidências canônicas e as distinções entre mensagem, resposta e confirmação científica. |
| Agora/Continuidade | Todas as legendas editoriais, categorias, papéis, estados de erro e propostas passaram a PT/EN. O texto da fonte permanece original. Decisões e entregas aproveitam duas colunas no desktop; escopo/filtro formam um bloco legível. O máximo de `datetime-local` usa a hora local; datas futuras/inválidas não fazem leitura. Histórico interrompido ao trocar escopo ou desmontar a aba, impedindo respostas antigas de alterar a nova apresentação. |
| Memória: consulta | Navegação entre consulta e registros mantém carregamento sob demanda. A ponte WebMCP identifica sua disponibilidade real; não foi instalado polyfill nem conferida autoridade científica a trechos recuperados. |
| Memória: registros e rascunhos | Lista, filtros, registro individual, fonte/versão e proposta de anotação inspecionados. A fixture gera apenas proposta de sessão com `persisted:false` e `applied:false`; não há botão de gravação. |
| MCP somente leitura | O estado de aprovação desabilitada, o estado ativo e o erro de consulta são inspecionados via GET com fixtures, sem criar ou revogar grants. Foi encontrado texto quase ilegível no tema claro: contraste 1,015:1 causado por um fundo escuro fixo. O painel agora usa os tokens atuais e o checkbox mantém alinhamento e alvo acessível. |
| Organograma | A altura anterior usava um viewport inteiro dentro de um conteúdo já reduzido pelos cabeçalhos, cortando o grafo. O organograma agora ocupa a área disponível; em telas menores o canvas e os controles compartilham essa área com rolagem no painel. A análise do grafo permanece a mesma. |
| Autonomia da pesquisa | O painel existente continua somente leitura. Estado de fonte indisponível foi verificado: a interface mostra estado desconhecido e não conclui que a autonomia está inativa. |
| URLs antigas | Bookmarks legados continuam migrando às rotas atuais, conforme os testes de entrada. O aplicativo antigo não foi reintroduzido. |

## Verificação e evidências

- `npx tsc --noEmit`: passou.
- 28 testes focados de workspace, entrada, startup, continuidade, refinamento e mural: passaram.
- `test/workspace-profile.render.mjs`: paridade PT/EN entre dados completos e compactos, incluindo detalhe carregado; passou.
- `test/private-empty-values.render.mjs`: valores vazios, zero/falso, datas inválidas/ausentes e regressão de aviso de abreviação profunda; passou.
- O integrador executou `npm run check` novamente após a correção de contraste MCP: typecheck, build completo e **506/506 testes passaram**. Log: `/workspace/scratch/site-release-check.log`.
- `PRIVATE_PREMIUM_VERIFY=1 PRIVATE_PREMIUM_SHOTS=/workspace/artifacts/private-premium/sites-after node test/private-premium.browser.mjs`: **passou sobre esse build final**. Verifica as rotas atuais com Chromium, backend sintético, PT/EN, claro/escuro, desktop/móvel, filtros, datas, rascunhos, navegação móvel, estados de conector e remoção do frame ao sair.
- O navegador confirmou contraste MCP de pelo menos 4,5:1 no tema claro, estado sem aprovação, grant ativo e erro de leitura; apenas GET foi permitido e nenhuma autorização foi criada ou revogada. O relatório final registra zero erros de página, zero requisições para origens externas e zero escritas de grant. A disponibilidade da autonomia foi inspecionada em sua resposta indisponível, sem inventar estado ativo.

Evidências locais:

- Antes: `/workspace/artifacts/private-premium/sites-before/`.
- Depois: `/workspace/artifacts/private-premium/sites-after/`.
- Falha confirmada do contraste MCP: `/workspace/artifacts/private-premium/qa-failures/mcp-grant-light-before.png`.
- Relatório estruturado do navegador: `/workspace/artifacts/private-premium/sites-after/report.json`.

Exemplos finais: `01-login-desktop.png`, `13-continuity-desktop.png`, `20c-mcp-grant-inspection.png`, `28-organogram-mobile.png`, `29b-autonomy-unavailable.png` e `31-drive-reconnect.png`, todos na pasta de evidências depois. As imagens de fontes autenticadas nessa pasta representam exclusivamente as fixtures locais.

Arquivos de implementação: `src/atlas/ui/PrivateApp.tsx`, `PrivateFrame.tsx`, `private-area.css`; `src/private-workspace/PrivateWorkspace.tsx`, `Views.tsx`, `Value.tsx`, `ContinuityView.tsx`, `continuity-copy.ts` e `premium-refinements.css`. A verificação adicionou `test/private-premium.browser.mjs` e ampliou `test/private-empty-values.render.mjs`. O contrato de erros de API e o controlador de sessão foram tratados separadamente pela revisão de backend.

A skill `vercel:react-best-practices` foi aplicada como revisão de hooks, lazy loading, ciclos de vida, acessibilidade e renderização. Dados e stores não foram movidos à camada de apresentação. Async de continuidade usa cancelamento e geração; efeitos removem seus timers/listeners; as mudanças de idioma conservam a fonte registrada.

## Limites

Os controles herdados da teia/organograma mantêm alguns rótulos em português. A revisão não traduziu dados científicos e não alterou seus enums. A geração de propostas de memória continua dependendo do Writer para aplicação real. A disponibilidade da memória/indexação e a autonomia dependem de suas fontes e são apresentadas como indisponíveis quando o serviço não pode confirmar o estado. A conexão Drive real depende da renovação pelo proprietário no fluxo oficial de Sites.
