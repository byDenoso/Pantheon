# NEXO Atlas — Unified Observatory Rework

## Scope

This change restructures the Atlas product experience around one central spatial surface: the Observatório. The existing graph renderer remains the technical engine, but “Grafos” stops being a separate top-level product destination. Cockpit, Observatório, Laboratório and Atividade become the required Phase 1 surfaces. Investigação and Aprendizado are Phase 2 only when their real read models are sufficient; Automação and Configurações are not added merely to fill navigation.

The visual target is the approved “Observatório NEXO — Rede Viva de Conhecimento” direction: dark scientific interface, spatial depth, luminous hubs, restrained filaments, compact overlays and contextual inspection. The mock is a visual reference only and never a data source.

## Authority and trust boundary

Operational truth is owned exclusively by `byDenoso/NEXO-Obsidian-Vault@main:TOWER_V06`.

Read path:

```text
TOWER_V06
  -> sanitized / authorized projection
  -> Science Read Model V2 + public read models
  -> Atlas UI / API / MCP
```

SRM V2 is a semantic read model, not an authority. GitHub/Pantheon is code authority. Google Drive is compatibility/provenance/projection only where current contracts explicitly publish it. Atlas remains read-only. No browser, cache, snapshot, manifest, API, MCP or fallback may override TOWER_V06.

The browser must never receive raw TOWER payloads, secrets, credentials, authorization material, environment values, internal agent prompts, private reasoning, sensitive local paths, personal client data, private Olympus data, or identifiers not intended for the public projection.

## Product model

Each surface answers one question:

- **Cockpit:** is the system moving?
- **Observatório:** how is knowledge connected, and what do the published data show?
- **Laboratório:** how are hypotheses tested and converted into evidence and decisions?
- **Atividade:** what changed?
- **Investigação (Phase 2):** what is still being investigated?
- **Aprendizado (Phase 2):** which evidenced inter-domain relations emerged?

The application should read as one machine rather than independent dashboards.

## Unified Observatório

The Observatório becomes the primary exploration surface and hosts the existing spatial graph engine. “Grafos” is removed from visible primary navigation, but internal compatibility remains intact.

Do not remove in Phase 1:

- internal `AtlasArea = 'graphs'`
- `GraphsPage`
- graph engine modules
- `routeFor('graphs')`
- `/mapa`
- graph deep links
- compatibility adapters
- graph tests

Existing `/mapa` links remain valid and resolve the same structural context. `/pesquisa` becomes the public product destination for the unified Observatory experience. Physical removal or renaming of legacy/internal graph vocabulary is a later migration.

“Resumo do Universo” is removed as a primary destination when its content is represented by Observatory synthesis overlays. Its compatibility route remains valid.

## Structural hierarchy

The UI must not impose a universal hierarchy.

Supported structural node types currently include:

- `SYSTEM`
- `ROOT`
- `DOMAIN`
- `PROGRAM`
- `CAMPAIGN`
- `ACTION`

Published structures differ by subsystem. Examples include Science as `SYSTEM -> DOMAIN -> CAMPAIGN`, Engineering/Olympus as `SYSTEM -> PROGRAM -> CAMPAIGN`, and Operations as `SYSTEM -> ACTION`.

The UI may normalize visual roles such as hub, cluster and terminal, but must not rewrite canonical type, id, parentage, authority or provenance. `DOMAIN` must remain `DOMAIN`; `PROGRAM` must remain `PROGRAM`; `ACTION` must remain `ACTION`.

## Observatory interaction modes

The public UX converges to three modes:

1. **Estrutura** — structural exploration plus secondary relation controls.
2. **Evidência** — evidence-oriented overlay using the existing evidence behavior.
3. **Síntese** — SRM V2 metrics, comparisons, tensions, directional signals, syntheses and recent scientific changes.

The existing internal graph behaviors `explore`, `relations` and `evidence` remain supported. `relations` is not deleted; it becomes a secondary control under Estrutura. Mode changes should reuse the same graph projection/renderer rather than remounting the spatial engine.

## Renderer and graph behavior

Use one active renderer. Reuse the current `GraphRenderer` and graph engine. Do not reactivate parallel legacy engines or create a second Three.js/Babylon/Pixi graph runtime.

Preserve:

- semantic LOD
- bounded projection
- lazy loading
- `childCount` / known-child navigation
- subgraph loading
- orbit/pan/zoom
- context-loss accessible fallback
- reduced-motion behavior
- label handling
- teardown / resource cleanup
- mobile simplification

A node is navigable based on published children, `childCount`, known relationships or validated subgraph descriptors. A node must not be treated as terminal merely because its children are outside the current loaded slice.

Leaf nodes remain selectable, inspectable, pinnable and comparable but do not attempt nonexistent drill-down.

Breadcrumbs follow real hierarchy rather than a hard-coded domain model.

## Relationship rendering

Only published or contract-derived relationships may be shown. Visual semantics may differentiate:

- structural: blue/cyan solid
- scientific relation: softer blue
- learning/cross-domain: violet/magenta
- emergent: restrained pulse
- dependency: amber
- blocked: red only when a blocker is actually published

No relation is created from textual similarity, geometry, embedding proximity, label resemblance or visual inference without an explicit approved contract.

## Inspector

Selecting an entity opens a contextual inspector: side panel on desktop, bottom sheet on mobile.

For structural entities it may display published label, canonical id, type, status, authority, parent, children, related entities, campaigns, activity, metrics, evidence and provenance.

For metrics it may display published metric id, value, unit, uncertainty, confidence level, stack, datasets, source reference, observed time and provenance.

Uncertainty, confidence, counts, timestamps and summaries must never be invented. Technical hashes/checksums belong behind disclosure rather than dominating the primary UI.

## Semantic states

Preserve distinct states:

- `READY`
- `EMPTY`
- `DATA_UNAVAILABLE`
- `PARTIAL`
- `STALE`
- `ERROR`

`EMPTY` is not `DATA_UNAVAILABLE`. Missing data is never rendered as zero, absence of comparison is never rendered as “no tension,” and unavailable tests are never rendered as `0 tests`.

Empty-state UI should be compact so unavailable content does not consume large portions of the viewport.

## Cockpit

Cockpit answers whether the NEXO operational system is progressing. It must not mount the graph renderer.

Priority information:

- operational activity / Pulse when proven
- global operational state
- queues and active executions
- checkpoints and verification
- real blockers
- readback
- integrity
- recent deltas

Scientific blockers, operational blockers, source failures, readback failures and unknown state must remain distinct.

Absence of blockers is not equivalent to proof of system health.

## Pulse model

A Pulse adapter/view-model may aggregate existing operational read models, but it cannot create a new authority or infer fake cycle identity.

Possible optional fields include `pulse_id`, `cycle_id`, `started_at`, `completed_at`, `next_run_at`, `status`, `stages`, `delta`, `readback`, and `issues`.

The UI may call a group “Pulse” only when the source provides sufficient cycle identity or boundary evidence. Events occurring within one hour are not, by themselves, proof of one Pulse cycle. Without proven cycle identity, the UI says “Atividade operacional” and retains the existing chronological timeline.

No hard-coded Pulse version, cadence, counts or stage claims.

## Activity

The Activity Ledger remains the granular source. When a real cycle id exists, activity may be grouped as cycle summary -> delta -> individual events. Without a real cycle id, render the existing event timeline.

No granular event is lost when grouping is available.

## Investigation — Phase 2

Create a dedicated Investigação surface only if existing read models are sufficient. Its purpose is to turn D1…D10/CROSS from a flat catalog into a decision-oriented investigation state: question, status, campaigns, tests, verified results, evidence, last change, gap and next gate, only where published.

These views are facets/read models, not a replacement structural hierarchy.

## Laboratory

Preserve the investigation chain:

```text
Hypothesis -> Claim -> Test -> Run -> Result -> Evidence -> Decision -> Knowledge
```

Laboratório remains the deep technical surface and does not duplicate the full structural graph. Preserve provenance, evidence chain, readback, run context, result and decision information.

Read-only surfaces should not show obsolete “private” chrome when the current product contract says they are public/read-only, but backend authorization is not relaxed.

## Learning — Phase 2

Learning is a transversal overlay, not a mutation of structural graph edges. Only real published learning relations are shown, with relation id/type, status, evidence refs, provenance and update time where available.

No decorative “neural network” edges without evidence.

## SRM V2 and renderer registry

SRM V2 remains the science semantic read model downstream from the sanitized TOWER projection.

Prefer schema-driven scientific rendering:

- scalar -> compact metric
- interval -> estimate / forest plot
- stacked intervals -> stack forest plot
- comparison -> comparison/tension view
- directional -> directional visualization
- timeseries -> trend
- matrix -> heatmap
- distribution -> distribution plot
- categorical -> status/evidence visualization

H0 may retain a specialized renderer. New scientific variables should prefer schema + registry instead of one-off pages.

## Design system

Keep the current dark identity and Recursive typography. Target a deep navy background (`#020812` to `#07131f` range), very dark navy surfaces, low-opacity cyan/blue borders, cyan primary accent, violet secondary accent, green success, amber warning, red danger, off-white primary text and blue-gray secondary text.

Glow is reserved for semantically important elements. The UI should feel scientific and spatial rather than like a generic SaaS dashboard or an overproduced game HUD.

The spatial scene may use subtle star/noise/nebulous ambience, luminous hubs and restrained curved filaments. No automatic camera motion on load.

## Phase 1 navigation

Primary visible navigation:

- Cockpit
- Observatório
- Laboratório
- Atividade

Add Investigação and Aprendizado only if Phase 2 is actually implemented with real read models. Do not create empty Automação or Configurações pages merely to complete a menu.

Remove visible product copy that sends users to “Grafos” as a separate destination. Replace with “Explorar no Observatório” or equivalent contextual wording while preserving internal graph routes.

## Routes and compatibility

Preserve working public routes and deep links including:

- `/mapa`
- `/pesquisa`
- `/laboratorio`
- `/cockpit`
- `/atividade`

Do not rename all `AtlasArea` values in this rework.

## Responsive behavior

Desktop is the full experience. Tablet reduces label density and inspector width. Mobile uses a drawer sidebar, bottom-sheet inspector, graph-first viewport, fewer particles/labels and touch pan/zoom/tap. Do not replace the graph with a static list merely because the viewport is small when the renderer is supported; retain the accessible table fallback for unsupported/lost WebGL contexts.

## Accessibility and performance

Preserve keyboard navigation, focus states, ARIA, reduced motion, touch targets, sufficient contrast and accessible graph fallback. Status cannot be encoded only by color.

Avoid unnecessary projection rebuilds and renderer remounts. Preserve memoization, LOD, bounded edges, lazy loading, subtree loading, hidden-tab pause and resource teardown. Targeted improvements to current unnecessary rerender patterns are allowed only when directly useful to this rework.

## TDD and verification

Behavior changes follow real RED -> GREEN -> REFACTOR. Add or update tests that prove:

- TOWER_V06 remains authority
- Atlas remains read-only and raw TOWER data is not exposed
- SRM V2 remains a read model
- Observatório hosts the primary graph experience
- Grafos is absent from primary visible navigation
- `/mapa` and deep links remain valid
- lazy drill-down and leaf-safe behavior remain correct
- DOMAIN/PROGRAM/ACTION retain their canonical types
- subsystem-specific hierarchies remain valid
- relations behavior remains available
- evidence behavior remains available
- synthesis is a new overlay/read mode rather than a structural rewrite
- semantic absence states remain distinct
- Learning does not rewrite structural edges
- Pulse/cycle identity is not fabricated
- Activity works without Pulse
- provenance remains accessible
- keyboard/reduced-motion/context-loss/mobile behavior remains valid
- renderer teardown does not leak resources

Required exact-head gates before merge:

```text
npm test
npm run typecheck
npm run build
browser smoke: desktop + mobile
```

Smoke flow: Cockpit -> Observatório -> select hub -> drill down -> cluster -> campaign/action where applicable -> back/forward -> Estrutura -> relation controls -> Evidência -> Síntese -> inspector -> provenance -> pin -> compare -> Laboratório -> Atividade -> Observatório.

## Release discipline

Work on a feature branch and open a draft PR. Do not merge until exact-head unit/contract tests, typecheck, production build and browser smoke are green. Review the complete diff, verify TOWER_V06 provenance, confirm `/mapa` compatibility, confirm only one active renderer, and check for sensitive data before merge.

After merge validate GitHub Pages, browser bootstrap, Manifest V3, SRM V2, graph drill-down and TOWER provenance. Vercel failure caused exclusively by external build-rate limits is a deployment blocker, not a code regression.

## Success criteria

The finished product should not feel like “a dashboard containing a graph.” It should feel like one live knowledge and operations system. Cockpit shows system movement, Observatório is the central exploration space, scientific evidence/synthesis appear as trustworthy overlays, Laboratório shows how claims become evidence, Activity shows real changes, and later Investigation/Learning surfaces are introduced only when their data contracts support them.

The approved visual reference should be recognizable in composition and impact, while every rendered fact remains traceable to the real sanitized projection. TOWER_V06 remains truth; Atlas only makes that truth navigable.
