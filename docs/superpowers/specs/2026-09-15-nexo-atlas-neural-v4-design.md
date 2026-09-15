# NEXO Atlas Neural V4 — Design

## Objetivo

Evoluir o Atlas Neural atual sem reconstruir backend, projection pipeline ou contratos existentes. O V4 transforma a experiência canônica em navegação espacial progressiva e previsível, mantendo o backend/TOWER_V06 como Truth Owner e preservando o renderer atual quando ele já entrega valor.

## Estado atual observado

- `GraphsPage` já monta `AtlasNeuralSurface` como experiência canônica.
- `AtlasV3App` já possui layers, busca, histórico de foco, inspector, tema persistido e loading/error/empty states.
- `AtlasCanvas` já oferece WebGL/Canvas fallback, OrbitControls, histórico de câmera local, semantic LOD, label placement e culling básico por visibility/intersection.
- O problema principal deixou de ser ausência de infraestrutura. Agora é densidade visual, semântica de navegação, boot excessivamente aberto, competição entre layers e pouca orientação espacial.

## Princípios

1. Backend/API continua Truth Owner. Nenhum dado cosmético será inventado.
2. Não refazer o pipeline de snapshot/projection se ele já entrega os dados necessários.
3. A câmera é o mecanismo primário de navegação.
4. Zoom muda significado, não apenas escala.
5. Global mostra estrutura; Domain mostra sistemas/clusters; Cluster mostra entidades; Local mostra claims/tests/evidence.
6. Layout precisa ser determinístico e restaurável.
7. Falha de atualização não destrói o último estado válido.
8. Learning, Automations e Evidence são overlays/lenses contextuais, não universos desconectados.
9. O canvas deve dominar visualmente; chrome é mínimo e contextual.
10. Acessibilidade e reduced-motion são requisitos de primeira classe.

## Arquitetura

### 1. Estado semântico

Criar módulo de estado/persistência V4 independente de React com:

- `AtlasSemanticLocation`: layer, focusId, selectedId, zoomLevel, lens, overlays.
- persistência em `sessionStorage` para localização semântica e `localStorage` apenas para preferências estáveis.
- parsing/serialização para query/deep-link sem depender de coordenadas exatas.

O React continua responsável por orquestração, mas a semântica deixa de ficar espalhada em `AtlasV3App`.

### 2. Progressive disclosure

Criar classificador de profundidade semântica por tipo de nó e função de política de visibilidade:

- LOD 0: root/domains.
- LOD 1: systems/programs/clusters.
- LOD 2: campaigns/projects/hypotheses.
- LOD 3: claims/tests/evidence/relations.
- LOD 4: metadata no inspector.

A política sempre inclui foco, seleção, ancestors e vizinhos relevantes. O restante entra por orçamento e profundidade.

### 3. Domain/layer model

Separar `primaryDomain` de `overlays`.

Domínios primários: NEXO, SCIENCE, OPERATIONS, HEALTH.
Overlays: LEARNING, AUTOMATIONS, EVIDENCE.

No V4, o usuário navega por domínio e liga/desliga overlays. Compatibilidade com os layers V3 existentes é mantida por adapter.

### 4. Câmera e navegação

- Back semântico continua em React.
- Câmera mantém snapshots de enquadramento no renderer.
- `Home` restaura visão global.
- `F` enquadra seleção/foco.
- `Ctrl/Cmd+K` abre busca.
- `Escape` fecha UI transitória ou sobe um nível.
- Zoom é relativo ao ponteiro quando o renderer permitir sem regressão.
- Session restore usa localização semântica, nunca apenas coordenadas.

### 5. Last-known-good e sync

`AtlasV3App` mantém `snapshot` e `scene` válidos quando refresh falha. Erro vira estado `STALE/ATTENTION` sem zerar o Atlas. O diff entre snapshots produz um resumo transitório `added/updated/removed` quando identificável por IDs e representação serializável.

### 6. HUD e orientação

Top HUD fica em três regiões:

- esquerda: produto + breadcrumb/localização;
- centro: busca/contexto;
- direita: live/snapshot + layers/preferences.

A barra de layers vira seletor de domínio + botão compacto de overlays.

### 7. Inspector

Preservar dados canônicos existentes. Organizar em hierarquia: Summary, Relations/Activity/Evidence quando houver, Source/metadata e ações contextuais reais. Campos vazios permanecem ocultos.

### 8. Renderer

Manter React Three Fiber + fallback Canvas, mas tornar o comportamento mais 2.5D/canvas-first:

- reduzir rotação livre em `presentationMode=canvas`;
- usar LOD semântico V4 antes do layout;
- labels limitadas por prioridade e colisão;
- reduzir edge density fora do neighborhood selecionado;
- selected/focus sempre legíveis;
- dev metrics por evento `atlas:graph-metrics`.

Não migrar tudo para DOM nem adicionar nova engine.

### 9. Mobile

- canvas full-screen;
- controles compactos inferiores;
- inspector como bottom sheet;
- menos labels por orçamento;
- targets de toque ampliados;
- sem sidebar fixa.

### 10. Acessibilidade

- atalhos documentados e aria-labels;
- representação textual do recorte atual em árvore/lista invisível para screen reader;
- focus visible nos controles;
- reduced motion desativa animações contínuas e transições longas.

## Critérios de aceite

PASS somente se:

1. boot não expõe todos os nós relevantes ao mesmo tempo;
2. domínio primário e overlays têm semânticas distintas;
3. `Back`, `Home`, busca e deep-link preservam localização semântica;
4. sync com erro preserva last-known-good;
5. labels respeitam orçamento/prioridade e não formam pilhas grosseiras;
6. foco/seleção dominam sem apagar completamente o contexto;
7. layout continua determinístico entre reloads;
8. tema continua afetando renderer e HUD;
9. mobile mantém canvas dominante e inspector em sheet;
10. testes existentes continuam passando e novos testes cobrem política V4, persistência e stale state.

## Não-objetivos

- Não alterar contratos do TOWER_V06.
- Não adicionar WebSocket sem suporte real do backend.
- Não implementar histórico temporal falso.
- Não transformar o Atlas em ferramenta analítica pesada de comparação.
- Não criar uma segunda aplicação paralela ao Atlas Neural atual.
