# NEXO ATLAS — mapa operacional

Cockpit visual do NEXO. Um mapa orbital ao vivo, não um dashboard: o humano olha e
entende o que está acontecendo, o que mudou, o que está bloqueado e o que exige ação.

Deploy canônico: <https://nexo-atlas-graph-lab.vercel.app/>. É o único Atlas válido;
deploys antigos ficam fora.

## Hierarquia — uma só

```
NEXO  →  Domínio  →  Program  →  Campaign
```

A estrutura e o estado vêm exclusivamente do **NEXO · SSOT CANONICAL** no Drive.
Nada é inventado e nada é duplicado:

- Um Program declara seu Domínio por `parent_id` ou pela coluna `domain`. Quando o
  SSOT não tem uma linha `domain` própria, o nó é marcado `derived-from-ssot`.
- Uma Campaign fica sob o Program declarado por `parent_id` ou pela relação
  `PRIMARY_PROGRAM`. Sem isso ela é reportada como órfã, não re-parenteada em silêncio.
- Campaign é folha: nunca gera filhos no grafo.
- Todo o resto do SSOT (testes, mini-claims, efeitos de engenharia, políticas,
  objetivos, lições, Olympus) **não vira nó**. Vira contexto do cockpit, ligado ao nó
  que o próprio SSOT nomeia — e, quando não nomeia nenhum, fica no núcleo.

## Expansão progressiva

A tela inicial mostra o NEXO e seus Domínios, mais nada. Um clique num Domínio abre
seus Programs; um clique num Program abre suas Campaigns; um clique de novo recolhe o
subgrafo inteiro. Cada corpo fechado mostra `+N`: o peso do que um clique abriria.

A busca localiza Domínio, Program ou Campaign e abre sozinha todos os ancestrais.
`Recolher` e `⌂ NEXO` voltam à visão global.

## Cockpit

Selecionar qualquer nó abre a lateral contextual, sempre na mesma ordem de leitura
operacional: **Bloqueios · Próximas ações · Últimos testes · Evidências · Relações ·
Mudanças recentes · Integridade**, sobre um cabeçalho com status, resumo e rollup do
subgrafo. No núcleo entram também o loop recursivo (CURRENT_STATE → NEXT_ACTION →
LAST_EFFECT), o Olympus e a doutrina NEXO.

Seção vazia diz o que falta no SSOT em vez de sumir. Integridade informa a autoridade
da leitura (live ou snapshot), a idade da projeção, a cobertura da hierarquia,
campaigns sem Program primário e quantos registros ficaram fora da hierarquia.

## Render

Three.js (WebGL, build vendorizada em `vendor/`) para os corpos, halos e filamentos,
com um canvas 2D por cima para labels, badges e anel de foco — um único
`requestAnimationFrame` para os dois. Sem WebGL, `?renderer=legacy-canvas` desenha o
mesmo grafo em canvas 2D puro, e a falha de inicialização cai nele sozinha.

Layout orbital determinístico: o NEXO na origem, os Domínios num anel completo, e cada
nível mais fundo como sub-órbita ancorada no pai e aberta para fora. Abrir um ramo
nunca move o resto do mapa nem empurra os novos corpos para fora da tela.

Os controles de renderer (preset, sliders, HUD de FPS) são secundários: vivem na
gaveta `⚙`, fechada por padrão.

## Fontes

1. Leitura direta do Drive (`loadSsotGraph`) — abas `Science`, `Relations`, `Olympus`,
   `NEXO`, mais `Engineering` em best-effort.
2. Se o browser bloquear o Sheet privado, a projeção sincronizada
   (`ssot.snapshot.json` + `ssot.hierarchy.snapshot.json`), com a autoridade e a data
   de geração declaradas no cockpit.

`?demo=1` troca tudo por dados sintéticos, e só aí o seletor de dataset fica ativo.

## Deploy

O projeto Vercel serve um único `index.html` que aponta para o jsDelivr pinado num
commit. Depois de dar push, gere-o com o sha real:

```
node graph-lab/build-cdn-index.mjs <commit-sha> > index.html
```

## Testes

`npm test` na raiz de `atlas-control-tower`. A cobertura do mapa está em
`test/graph-lab*.test.mjs`.
