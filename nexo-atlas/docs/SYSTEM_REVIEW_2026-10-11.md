# Atlas, MCP e cadeia Tower: revisão de 11/10/2026

A interface ativa é o projeto Sites `appgprj_6ac45767d678819182c86c56d11e0d37`, cujo código inicial nesta revisão era `aeccc307361e36751f26f290ef2950c69b54e55f`. A publicação anterior é a versão 63. O runtime histórico no Pantheon é uma superfície distinta; alterações nele não atualizam este Site.

O trabalho foi dividido entre cinco subagentes GPT-6.1 Sol, esforço xhigh: backend; Tower/MCP; GitHub e integridade de projeções; interface pública; interface privada. A integração, comparação das fontes, validação final e publicação ficaram com o agente principal.

## Interface

A direção visual conserva Barlow/Nunito, azul, arte cósmica, temas claro/escuro e PT/EN. A revisão melhora hierarquia, alinhamento, contraste, espaçamento, navegação móvel e estados vazios/indisponíveis. Resultados, métodos e limites científicos permanecem os publicados.

- [Revisão pública por aba](PREMIUM_PUBLIC_REVIEW_2026-10-11.md): abertura, atualizações, mapa, figuras, comparação, catálogo, estudo individual, metodologia e publicações.
- [Revisão privada por aba](PREMIUM_PRIVATE_REVIEW_2026-10-11.md): acesso, continuidade, teia, domínios, testes, operação, mural, memória, organograma, autonomia e painel MCP.

As telas privadas foram exercitadas com dados sintéticos, inclusive navegação, filtros, revogação, formatos compactos/completos, recuperação da fonte e contraste. Não se apresenta isso como uma leitura dos registros privados vivos.

## Backend e MCP ativos

- A resposta pública estática é reutilizada por instância do Worker. O cache considera datas de publicação e recuos do relógio; cabeçalhos continuam `private, no-store`. Nenhuma fonte privada, identidade ou estado de conector entra nele.
- A comparação local manteve o JSON público de 673.096 bytes idêntico ao baseline: 169 análises e 72 visuais. Chamadas repetidas passaram de aproximadamente 136–195 ms para 3,3–9,9 ms; a primeira chamada medida levou 89,5 ms. Esses números medem execução local, não latência em produção.
- Falhas do Drive distinguem consentimento expirado, indisponibilidade de configuração e falha temporária. A interface deixa de pedir PIN para um problema de conexão. A repetição respeita `Retry-After`; consultas de sessão simultâneas são agrupadas.
- A autorização é conferida novamente após falha de leitura, assim como já ocorria após resposta privada bem-sucedida. Diagnósticos usam campos permitidos e nunca expõem o corpo retornado pelo provedor.
- A negociação gzip respeita qualidades, exclusões e curingas válidos.
- MCP passa a aceitar descoberta moderna `2026-07-28` e mantém clientes legados. O classificador de falhas separa consulta inválida, índice ausente/desatualizado, reconexão necessária e indisponibilidade da fonte. [Detalhes técnicos](../worker/mcp/README.md).

A inspeção inicial da produção encontrou HTTP 400 na descoberta moderna e `reauthentication_required` no conector Drive usado pela API privada. O código corrige protocolo e recuperação; a renovação do consentimento real continua dependendo do proprietário no fluxo oficial. A revisão preserva PIN, grants, identidade da Tower e permissões existentes. Nenhuma gravação científica foi realizada.

## GitHub e Tower

As correções de repositório foram publicadas como propostas concretas, ainda sem merge:

- [Pantheon PR 448](https://github.com/byDenoso/Pantheon/pull/448): limites por bytes para requisições, compressão assíncrona, isolamento de caches por fonte/credenciais, invalidação por geração, prazo total de leitura da Tower, limites de streaming e diagnósticos seguros. Os workflows usam o SHA testado do TCC, verificam novamente a proveniência e executam a proteção de publicação após a montagem final dos arquivos.
- [TCC PR 158](https://github.com/byDenoso/TCC/pull/158): projeções são verificadas pelo conteúdo real; arquivos e manifests faltantes/corrompidos são reparados sem falsificar a proveniência de conteúdo inalterado. Workflows passam a executar testes funcionais com pytest e evitam duplicações.

O caminho autorizado da Tower e as políticas de escrita permanecem os existentes. A revisão não substitui o MCP por uma conexão paralela nem cria outra fonte de verdade.

Os quatro workflows de PR também concluíram com sucesso no GitHub: NEXO ONE PR CI, NEXO Writer selection CI, NEXO Live Tower CI e NEXO Runtime Reconciler CI.

## Validação

| Superfície | Resultado local |
| --- | --- |
| Atlas Sites | `npm run check`: TypeScript, build completo e 506 testes aprovados. |
| MCP real em workerd e D1 efêmero | 386 asserções, 50 chamadas SDK; corpus e grants sintéticos, rede externa bloqueada. |
| Retrieval e sincronização em workerd | 268 e 178 asserções, respectivamente; atualização incremental exercitada até autenticação. |
| Pantheon / nexo-one | 1.224 testes aprovados; tipos, estilo, builds e proteção final de publicação aprovados. |
| TCC | 1.100 testes e 170 subtestes aprovados. |
| Compatibilidade exigida do runtime antigo | 16 testes, tipos e build aprovados. |

A suíte histórica completa de `atlas-control-tower` tem 88 falhas preexistentes em 979 testes, ligadas também a páginas e workflows retirados. O checkout original reproduziu os mesmos 88 nomes de falha. Elas não foram ocultadas nem contabilizadas como testes aprovados. Os relatórios de navegador identificam a cobertura visual e seus limites.

## Publicação e reversão

O artefato de publicação contém somente `dist/client`, `dist/server` e os metadados de hospedagem gerados pelo build. Assets privados ficam embutidos no Worker e são servidos apenas pelas rotas protegidas. O público, o domínio, as conexões read-only e os bindings existentes são preservados.

A versão 63 permanece disponível como referência de reversão: `appgprj_6ac45767d678819182c86c56d11e0d37~appgver_46d2864780c481919c399ae4dcc966da`. O recibo da nova publicação deve registrar o SHA exato, a versão salva e o estado final de implantação; um build local aprovado sozinho não prova publicação nem consentimento do Drive.
