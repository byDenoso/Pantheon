# ATLAS · Visual Evolution V2

Registro técnico para revisão de PR, atualizado em 2026-10-30.
Base: `byDenoso/Pantheon@ef55ea47496568e4e1713daf59265aa40d89d62e` (`ef55ea4`).
Branch de trabalho: `feat/atlas-visual-evolution-v2`.
Estado: implementação e checagem visual concluídas; gates funcionais finais aprovados; produção preservada para revisão.

## Fontes e superfícies verificadas

| Superfície | Fonte e evidência |
| --- | --- |
| `https://nexoresearch.org/` | `nexo-atlas/`. O workflow `.github/workflows/nexo-one-pages.yml`, apesar do nome histórico, compila este diretório e publica `dist/client`. O HTML do build base coincidiu byte a byte com o HTML servido. |
| Estudos públicos | As 19 rotas de `src/atlas/publicStudyRoutes.json` responderam HTTP 200 e carregaram seus títulos no navegador. Os 19 títulos da V2 coincidiram com os publicados; o build de Pages materializa cada rota a partir da aplicação pública. |
| `/metodo.html` e `/publicacoes.html` | Ambas responderam HTTP 200. São páginas de `public-extra/`, com CSS próprio; a harmonização inclui `public-extra/assets/nexo-pages.css`, preferências nos dois HTMLs e fontes IBM Plex locais. |
| Link público para o privado | `https://nexo-one-two.vercel.app/#/privado`, com fonte em `nexo-one/`. A tela publicada de PIN foi observada sem autenticação. |
| Workspace privado | `nexo-one/src/private-workspace/` e `src/knowledge/`; rotas internas preservadas no código e exercitadas com dados sintéticos, sem confirmação de sessão privada publicada. |
| Núcleo científico | `byDenoso/TCC` foi consultado; não recebe alterações neste trabalho. |

O nome de uma pasta ou a existência de uma rota no repositório não foram tratados como prova de publicação.
O frontend histórico em `atlas-control-tower/` e a implementação privada de Sites em `nexo-atlas/` não foram confundidos com o destino privado vinculado pelo site público.

### Implementação encontrada

Os dois frontends usam React 19.2.6, TypeScript 5.9.3 e Vite 8.3.2. AntV G6 5.1.1, Three.js e as famílias IBM Plex já constam das dependências. Nenhum pacote foi acrescentado. A galeria pública e o grafo de conhecimento observado usam componentes SVG existentes; a disponibilidade de G6/Three não foi confundida com a atividade desses renderizadores em cada tela.

No público, `Shell`, `PublicResearchHub`, `PublicStudyPage`, `PublicVisualGallery` e `InteractivePlot` concentram a experiência. A navegação combina seções da página e caminhos `/pesquisa/...`; o workspace privado usa rotas por hash. Os tokens e folhas de refinamento existentes foram reaproveitados. Método e publicações mantêm seu HTML, controlador de idioma/tema e carregador bibliográfico próprios.

### Problemas visuais observados

| Antes | Intervenção |
| --- | --- |
| Cabeçalho com muitos controles simultâneos | Preferências agrupadas e navegação principal em uma linha no desktop. |
| Textura cósmica intensa, margens amplas e títulos arredondados em vários níveis | Fundo discreto, escala tipográfica de leitura e marca institucional preservada. |
| Cartões e espaços generosos na lista operacional | Registros em linhas com estado e ação em posições consistentes. |
| Pouca distinção entre informação principal, contexto e valores | Hierarquia de cor/peso, texto secundário legível e números tabulares. |
| Layout privado superior disputando largura com ferramentas | Navegação lateral no desktop e superior em telas estreitas. |
| Método e publicações com apresentação independente | Mesmos tokens, tipografia, escala de espaços e preferências da V2. |

## Decisões de apresentação

| Área | Mudança |
| --- | --- |
| Tema | Fundo escuro `#090D14`, superfície `#101722`, texto `#E8EEF5` e destaque `#67D4E4`; tema claro mantido, com superfícies neutras e destaque `#006779`. |
| Contraste | Texto de ações usa `--on-cyan`, inclusive botões do catálogo e abas selecionadas. Cor de texto secundário, bordas e foco foram ajustadas nos tokens existentes. A revisão de tokens não equivale a uma certificação global de acessibilidade. |
| Tipografia | IBM Plex Sans para leitura e controles; IBM Plex Mono para valores e contagens. Fontes já disponíveis nas dependências são empacotadas localmente; marca institucional e imagens cosmológicas existentes são preservadas. |
| Densidade pública | Hierarquia mais compacta, títulos proporcionais, colunas de leitura limitadas, menos espaço entre registros e separadores discretos. Conteúdo, gráficos e detalhes continuam acessíveis. |
| Navegação pública | Idioma, tema e movimento agrupados em um `details` de preferências; a navegação de seções e o link privado mantêm seus destinos. |
| Workspace privado | Sidebar de 208 px em desktop, linhas de pesquisa mais compactas, números tabulares, cabeçalhos e estados com hierarquia consistente. |
| Grafo privado | Ajustes de superfície, contraste, controles e painel de inspeção em CSS; topologia, seleção, busca, zoom e modelos de dados não foram reimplementados. |
| Método e publicações | Harmonização das páginas estáticas com a apresentação pública; alterações de JavaScript limitadas ao fechamento e à gestão de foco das preferências. Typecheck, build, projeção de Pages e suíte de 525 testes aprovados após estas adições. |

### Responsividade e teclado

- Público: até 900 px, preferências ficam no fluxo do menu, sem popup absoluto dentro de uma área com rolagem.
- Público: os breakpoints existentes ajustam colunas, abas e espaçamentos; até 600 px, ações e filtros recebem composição própria para a largura disponível.
- Privado: até 980 px, a sidebar retorna à navegação superior; até 600 px, registros e metadados são empilhados e inputs usam 16 px.
- Controles principais preservam alvos de interação de pelo menos 44 px; foco visível e preferências de movimento reduzido continuam contemplados.
- `Escape` fecha as preferências e devolve o foco ao `summary`; `stopPropagation()` evita fechar também o menu móvel.
- O fechamento por `blur` ocorre apenas quando o foco sai de `details`; alternar tema ou idioma dentro do grupo mantém o controle utilizável.

## Invariantes preservadas

- Contrato `ATLAS_PUBLIC_V1`, projeções, filtros, paginação, catálogo, agrupamentos e dados dos gráficos.
- Valores científicos, incertezas, conclusões, proveniência e vínculos para evidências; nenhuma nova afirmação científica foi introduzida.
- Autenticação, PIN, sessão, identidade, proteção de assets, ciclo de vida do iframe privado e transportes de dados.
- Rotas e destinos existentes; handlers funcionais permanecem, exceto o comportamento local de foco e fechamento das preferências.
- Dependências, lockfiles, CI, deploy, configuração de ambientes e código científico do TCC.
- O escopo de código concentra-se em CSS, imports locais de fontes e estrutura de preferências; a lista definitiva de arquivos deve ser lida no diff do PR.

O snapshot público antes e depois do build verificado mantém **673096 bytes** e o mesmo SHA-256:

```text
4ab5330770a09bd32c02911193039bbcc38c5210381a0f9de7c6aaaa3bbc04a3
```

Essa igualdade refere-se a `dist/client/atlas-public.json`; não representa uma validação de resultados científicos novos.

## Verificações realizadas

| Verificação | Resultado e alcance |
| --- | --- |
| Base pública isolada em `ef55ea4` | Typecheck e build aprovados; **525/525 testes**, sem falhas. |
| `nexo-atlas` na versão V2 final | Typecheck e build aprovados; **525/525 testes**, sem falhas, cancelamentos ou testes ignorados. A execução final ocorreu após a harmonização de método/publicações e com build já encerrado. |
| Snapshot de Pages final | `PAGES_PUBLIC_READY`; **673096 bytes**, 169 testes na projeção e 0 campanhas. Hash e tamanho acima iguais ao baseline. A projeção foi gerada após o build final. |
| Rotas públicas publicadas | 19 estudos + método + publicações: **21/21 HTTP 200**. Os 19 estudos também carregaram no navegador, e seus títulos coincidiram na V2. |
| `nexo-one` | Sete arquivos de testes selecionados aprovados; build privado com **107 assets** e `style:lint` aprovado. Não equivale à execução completa de toda a suíte privada. |
| Revisão independente | Correções aplicadas: texto `--on-cyan`, preferências estáticas até 900 px e interrupção da propagação de `Escape`. |
| Checagem visual | Capturas reais de homepage, mapa, figuras, investigação, método, publicações, grafo privado e testes. Temas claro/escuro e larguras CSS 320, 390 e 768 px conferidos em fluxos representativos. |
| Interações no navegador | Preferências, PT-BR/EN, tema, pausa, Escape em dois níveis, seleção de medida e fechamento do diálogo, busca de teste sintético, detalhe de teste, inspetor do grafo e navegação interna exercitados. |

Comandos de referência para repetir as verificações públicas, em `nexo-atlas/`:

```sh
VITE_PUBLIC_API_URL=/atlas-public.json \
VITE_PRIVATE_COCKPIT_URL=https://nexo-one-two.vercel.app/#/privado npm run check
node scripts/build-pages-public.mjs
node scripts/build-pages-public.mjs --check
```

Evidências locais da auditoria: `public-v2-final.log` consolida o gate final; `public-baseline-pristine-tests.log`, `public-v2-npm-test-escalated.log`, `public-v2-typecheck.log`, `public-v2-style-lint.log`, `public-before-manifest.json` e `live-routes.json` preservam as etapas anteriores no diretório de trabalho `atlas-audit/`.
Os logs não são parte do bundle público. O arquivo chamado `public-v2-style-lint.log` registra o comando de lint de `nexo-one`.

### Avisos e restrições do ambiente

- O baseline já emitia avisos de chunks maiores que 500 kB e import dinâmico ineficaz de `PublicVisualGallery.tsx`, também importado estaticamente. Esta mudança não inclui divisão de bundles.
- Mensagens de ausência de artefatos opcionais aprovados preservam o catálogo existente; não foram usadas para inferir que a galeria pública publicada estava vazia.
- O aviso npm sobre `http-proxy` pertence à configuração do ambiente e já estava presente no baseline.
- A primeira execução restrita de testes encontrou bloqueio de subprocesso Python (`EPERM`); a repetição em ambiente que permite o subprocesso passou integralmente, inclusive na base isolada.
- Uma tentativa do gate final iniciou o build enquanto a suíte lia `dist/client`, causando uma falha por ausência transitória de `index.html` (**524/525**). Após o término do build e da projeção, a suíte completa passou sequencialmente (**525/525**), sem alteração de testes ou código para contornar a falha.

## Limites e estado de entrega

O privado publicado permaneceu na tela de PIN, sem sessão autenticada. A validação do workspace usa fixtures sintéticas e não confirma disponibilidade de integrações privadas reais.
As capturas em larguras móveis usam viewport CSS em iframe; não são testes em aparelho físico e não comprovam comportamento específico de navegadores móveis.
A transferência de um CSV pelo navegador de auditoria não foi concluída pela ferramenta de download. O exportador e os dados não receberam alterações; esta etapa não é declarada como validação de download ponta a ponta. Publicações não tem itens no catálogo atual, portanto não houve um item real para exercitar a cópia de BibTeX.
Os gates funcionais e a checagem visual após a harmonização de método/publicações foram concluídos. A revisão inclui capturas e prévia privada explicitamente sintética, sem acesso a dados privados reais.
Nenhum deploy ou merge foi realizado. A proposta permanece isolada em branch para revisão antes da publicação em produção.
