# Cockpit privado e seleção do que o público mostra

Implementação sobre o código do `byDenoso/Pantheon`. A implantação deve seguir a ordem descrita abaixo.

## O que entra

1. **Cockpit privado** (`/cockpit`, app Vercel nexo-one), com a identidade visual de nexoresearch.org: mesmos tokens de cor, IBM Plex, cabeçalho e numeração `01 / …`.
   - **Seções:** Agora (indicadores e RESUMO), Equipe (EQUIPE), Frentes (ROADMAP), Resultados (RESULTADOS) e Público (seleção).
   - **Login:** usa a sessão PIN já existente (`/api/atlas-session`). Não há credencial nova.
2. **Seleção pública escolhida pelo dono**, com efeito sem deploy:
   - **Catálogo revisado já publicado:** cada estudo de `atlas-public.json` pode ser mostrado ou ocultado.
   - **Linhas de RESULTADOS da SHADOW:** entram com texto público de 4 campos escrito ou revisado no cockpit.
   - **Frentes do ROADMAP:** entram como campanhas públicas (`ATLAS_PUBLIC_CAMPAIGNS_V1`), só com texto escrito no cockpit.
3. **Site público (Pages, nexo-atlas):** lê a seleção ao vivo e aplica:
   - estudos não marcados somem, junto com as figuras ligadas a eles;
   - os itens aprovados no cockpit são acrescentados.

## Fluxo

```
SHADOW (Drive, leitura) ──► GET /api/atlas-cockpit (sessão do dono) ──► /cockpit
atlas-public.json (Pages) ─┘                                              │ PUT /api/atlas-cockpit-selection
                                                                          ▼ (sessão + mesma origem + versão)
                                                      Redis: atlas:public-selection:v1 (+ :audit)
                                                                          │
nexoresearch.org ◄── GET /api/atlas-public-selection (anônimo, CORS só nexoresearch.org/www/bydenoso.github.io, CDN 10 s)
```

- A Tower não é lida nem escrita pela rota pública.
- O Writer, as automações e o MCP não são tocados.
- O documento salvo contém apenas o texto público aprovado, o digest da linha-fonte e a data de aprovação.

## Arquivos

- **nexo-one:**
  - lógica e rotas: `server/atlas/public-selection.mjs` e `server/atlas/cockpit-route.mjs`;
  - integração: `server/atlas/boundary.mjs` (rota pública anônima, GET) e `server/handler.mjs` (rotas do cockpit e CORS);
  - interface: `cockpit.html` e `src/cockpit/*`;
  - build: `vite.config.ts` (entrada nova) e `scripts/static-publication.mjs` (permite `cockpit.html`, que é um shell sem dados);
  - roteamento e cabeçalhos: `vercel.json` e `../vercel.json` (reescrita `/cockpit` e `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `noindex`, `no-store`);
  - testes: `test/atlas-cockpit-selection.test.mjs`.
- **nexo-atlas:**
  - cliente da seleção: `src/atlas/publicSelection.ts`;
  - integração em `src/atlas/publicItems.ts`, `PublicApp.tsx`, `PublicResearchHub.tsx`, `ResearchLaunch.tsx`, `researchExplorer.ts` e `publicCount.ts`;
  - `vite.config.ts`: inclui a origem da seleção em `connect-src` somente quando a variável existe;
  - testes: `test/public-selection.test.mjs`, incluindo um teste de contrato cruzado com o backend.
- **Workflow:** `.github/workflows/nexo-one-pages.yml` ganha `VITE_PUBLIC_SELECTION_URL`.

## Variáveis

| Onde | Variável | Uso |
|---|---|---|
| Vercel (nexo-one) | `NEXO_ATLAS_SHADOW_SOURCE_ENABLED=true` | Já existe e continua desligada por padrão. Liga a leitura da SHADOW também no cockpit. Desligada: o cockpit mostra só catálogo e seleção, e resultados ou frentes novos não podem ser aprovados. |
| Vercel (nexo-one) | `NEXO_PUBLIC_CATALOG_URL` (opcional) | Padrão: `https://nexoresearch.org/atlas-public.json`. |
| Vercel (nexo-one) | Redis/KV, PIN e `NEXO_ATLAS_ORIGIN` | São os mesmos da sessão atual. O cockpit precisa ser servido **na mesma origem de `NEXO_ATLAS_ORIGIN`**: login e publicação exigem `Origin` igual a ela. |
| GitHub Pages | `VITE_PUBLIC_SELECTION_URL` | `https://nexo-one-two.vercel.app/api/atlas-public-selection`. |

Para o cockpit ficar sob nexoresearch.org, criar um subdomínio (exemplo: `painel.nexoresearch.org`) apontando para o projeto Vercel e ajustar `NEXO_ATLAS_ORIGIN` para essa origem. Esse passo envolve DNS e domínio, que não foram alterados aqui.

## Ordem de aplicação, sem mudança visível até a primeira publicação

1. **Deploy Vercel.** `GET /api/atlas-public-selection` responde `{"mode":"UNSET"}`.
2. **Deploy Pages com a variável.** Com `UNSET`, o público continua mostrando o catálogo estático inteiro, como hoje.
3. **Primeira publicação.** O dono abre `/cockpit`, revisa e usa **Ativar seleção** ou **Publicar agora**. O rascunho inicial já vem com todo o catálogo marcado.

## Comportamento e limites

- **Falha fechada:** com `VITE_PUBLIC_SELECTION_URL` configurada, se a seleção não puder ser lida, a área de pesquisa do público mostra o estado “indisponível” em vez de voltar a exibir tudo.
- **Itens ocultos no arquivo estático:** um estudo ocultado continua dentro de `atlas-public.json` até o próximo build do Pages. Como esse texto já era público e revisado, ocultar não equivale a despublicar o arquivo.
- **Fonte alterada (drift):** se a linha-fonte mudar depois da aprovação, o cockpit marca “fonte alterada” ou “sem fonte”. O texto aprovado continua no ar até o dono revisar ou desligar; não há retirada automática.
- Publicar outras alterações sem modificar o texto aprovado preserva o digest anterior e o alerta de fonte alterada.
- **Bloqueios de texto:** são recusados textos com PEER, Olympus, PCDM, pNGB, Miqueias, BOARD/mural, S1–S7/Integrador P, links, e-mails, IDs internos e credenciais. A regra de PEER é a mesma do catálogo revisado e por isso bloqueia também a palavra isolada “per”.
- **Concorrência:** a gravação é atômica (compare-and-set pela versão via `EVAL`). A auditoria guarda até 100 linhas, só com contagens.
- **Campanhas já existentes:** quando a seleção está `LIVE`, as frentes exibidas são somente as escolhidas no cockpit.

## Verificação executada (local, sem credenciais reais)

- **nexo-one:** `npm run check` passou (typecheck, 1286 testes com 1285 aprovados e 1 ignorado, style lint e build). Os 11 testes novos cobrem:
  - contrato público e chaves;
  - texto obrigatório e bloqueios;
  - digest calculado pelo servidor;
  - conflito de versão e auditoria;
  - drift;
  - fonte desligada;
  - falha fechada;
  - fronteira de autenticação, CORS e handler real.
- **nexo-atlas:** typecheck e build passaram com as variáveis do workflow; `build-pages-public.mjs` e `--check` geraram o mesmo `atlas-public.json` (673.096 bytes, 169 testes); a CSP gerada contém a origem da seleção. Dos 532 testes, 529 passaram. As 3 falhas são de paridade Unicode com Python (`test/producer-unicode.test.mjs`) e acontecem igualmente no HEAD sem o patch neste ambiente.
- **Renderização com dados sintéticos:** cockpit em desktop claro e escuro e em celular de 390 px, sem rolagem horizontal; site público com seleção `LIVE` e com seleção indisponível.

**Não executado:**
- login real com PIN;
- leitura real da SHADOW;
- Redis/Upstash real (o script `EVAL` foi testado contra uma simulação em memória);
- deploy;
- testes em celular físico.

## Reversão

- **Público volta ao catálogo estático:** remover `VITE_PUBLIC_SELECTION_URL` do workflow e refazer o deploy do Pages.
- **Mantendo o código:** apagar a chave Redis `atlas:public-selection:v1`. O público passa a receber `UNSET` e mostra o catálogo estático.
