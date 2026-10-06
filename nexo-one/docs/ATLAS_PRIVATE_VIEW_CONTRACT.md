# Private Atlas view contract and integration map

Code inspection only. No real private payloads, connected sources, deployed APIs,
or credentials were read. This note specifies a read-only integration; it does
not authorize publication, credential setup, Tower writes, or a visual redesign.

## Finding

The original generic-data placeholder has been replaced by a protected legacy
mount. `PrivateApp` now opens the authenticated frame containing the retained
App/NexoStore and private-only aliases. Source compilation, data delivery and
asset delivery are server-authenticated; runtime data stays in frame memory.
Independent browser acceptance remains pending because Chromium cannot launch
in this executor. The contract and migration map below describe the integrated
implementation, with source completeness still requiring live readback.

## Retained surfaces and routes

Routes below are legacy route paths, not a recommendation to make them public.
An authenticated nested router must keep all of them within the private area.

| Surface | Existing implementation | Existing route / state dependency |
| --- | --- | --- |
| Observatory, activity replay, cosmic-web selection | `features/lab/LabApp.tsx`, `ObservatoryScene.tsx`, `LiveNowPanel.tsx` | `#/agora`, `#/ciclo`; `SystemState`, especially `read_model`, `evolution`, `guardian` |
| Universe and frontier detail | `features/lab/UniversePage.tsx` | `#/universo`, `#/universo/:id`; `cosmology_state` |
| Roadmaps, evidence, entity detail and search | `features/lab/LabApp.tsx`, `model.ts`, `routes.ts` | `#/roadmaps`, `#/roadmap/:id`, `#/evidencia?v=...&q=...`, `#/e/:id` |
| Operational summary, decisions, tasks, executions | `features/system/Overview.tsx`, `Operations.tsx`, `MissionControl.tsx`, composites/drawers | `#/cockpit/comando`, `?view=needs`, `#/cockpit/pipeline`, `?view=execution`; `actions`, `inbox`, `runs`, `lanes`, `projected_work` |
| Authority, capabilities, sources and integrity | `features/system/Integrity.tsx`, `ExecutionIntegrityPanel.tsx`, `EvolutionPanel.tsx` | `#/cockpit/prova?tab=autoridade|capabilities|fontes|integridade`; `findings`, `providers`, `capabilities`, `bus`, execution/evolution |
| Interactive Atlas map, 2D/3D, filters, lenses, inspector and learning links | `atlas3d/EmbeddedAtlas3D.tsx`, `Atlas3DApp.tsx`, `atlasAdapter.ts`, `components/NexoGraph.tsx` | `#/atlas?lente=operacao&view=2d`; `SystemState.graph`, `filaments`, provenance, semantic metadata |
| Scientific campaigns/tests/hypotheses/learning/charts | `features/ScienceWorkspace.tsx` | `#/cockpit/ciencia?tab=campanhas|testes|hipoteses|aprendizado|graficos`; `science_projection_v1`, `filaments` |
| System topology, tool/capability/runtime/role tables, graph, provenance | `mcp/EmbeddedMcp.tsx`, `McpAtlasApp.tsx`, `McpControlPanel.tsx` | `#/sistema?tab=overview|mcp|tools|capabilities|runtimes|roles|relations|provenance|graph`; topology and publication, separate MCP status |
| Personal attention, loops, day, contexts, recall and source drawer | `features/PersonalCockpit.tsx`, `Workspace.tsx`, `shell/FocusDrawer.tsx` | `#/cockpit/pessoal/now|loops|day|context|recall`; `WorldState`, protected recall |
| Galaxy renderer/event controls | `atlas3d/GalaxyView.tsx`, `components/GalaxyThree3D.tsx` | galaxy snapshot. The private build alias restores `#/galaxia`; the public build never imports this renderer. Independent browser rendering remains unverified here. |

The old full entry and CSS/font imports are in `src/legacy/main.tsx`. The current
entry `src/main.tsx` deliberately does not import them. Reuse the components and
necessary styles through server-only authenticated asset delivery rather than
replacing the public entry wholesale or restoring obsolete auth/side effects.
A lazy chunk alone remains publicly downloadable and is not sufficient. The
minimal routing boundary is a same-origin authenticated iframe: outer #/privado
remains stable while existing inner #/atlas, #/sistema and other hashes work.
Destroy that frame on logout, expiry or authorization/source failure.

### Olympus is a cross-surface domain, not a generic new panel

- `contracts/system.ts` includes `OLYMPUS` in `DOMAINS`; retain Olympus nodes,
  actions, lane, capabilities, findings, inbox gates, evidence and filaments.
- `contracts/world.ts` includes Olympus context packs and items. World compiler
  describes it as plans, check-ins and follow-up. Retain those source-backed items.
- `atlas3d/atlasAdapter.ts`, semantic taxonomy and the galaxy compiler handle the
  Olympus branch; preserve semantic parent IDs and cross-domain edge endpoints.
- `features/lab/model.ts` accepts Olympus tests from graph/science/read_model;
  do not change a test's domain to SCIENCE just because it is a test.
- Empty source content may truthfully remain empty. A synthetic Olympus fixture
  only establishes preservation, never actual production coverage.

## Authenticated runtime shape

`GET /api/atlas-private` retains the outer contract `ATLAS_PRIVATE_V1` and `data`
object. The server now validates the typed inner shape and cross-view
classification/fingerprints below. This is an implemented interface; the actual
private upstream remains unconfigured/unverified:

```ts
{
  contract: 'ATLAS_PRIVATE_V1',
  data: {
    contract: 'NEXO_ATLAS_PRIVATE_RUNTIME_V1',
    access: 'PRIVATE',
    generated_at: string,
    source_revision: string,
    fingerprint: string,
    system: SystemState & { read_model?: ReadModel },
    world: WorldState & { access: 'PRIVATE' },
    topology: PrivateTopology,
    publication: PrivatePublicationMetadata,
    galaxy: PrivateGalaxySnapshot
  }
}
```

Use one authenticated atomic source generation, or reject mismatched versions.
Carry availability/failure explicitly if a genuinely optional surface is absent;
do not fill absent private collections from Pages, fixtures or a public mirror.
An adapter can derive a read-only reload and sync status from the same protected
runtime. A read-only refresh does not dispatch any public publication workflow.

### SystemState: validator minimum and feature minimum differ

`src/data/adapters/source.ts::assertSystemState` requires:

- `contract_version: '1'`
- arrays `envelopes`, `findings`, `actions`, `inbox`, `capabilities`, `runs`,
  `lanes`, `filaments`, `providers`
- `graph.nodes`, `graph.edges` arrays and string `bus.fingerprint`
- each envelope: nonempty `source_ref`, `fingerprint`, `freshness`, and
  `authoritative === false`

The actual components additionally depend on the typed fields in
`src/contracts/system.ts`: `scenario_id`, `scenario_label`, `generated_at`,
`global_state`; bus generated time/state/count/sources/consumers; complete graph
node identity/type/label/domain/state/authority/source/revision/fingerprint/
freshness/checked time/summary; edges `id/from/to/kind/weight/explanation`.

Do not strip optional-but-functional fields merely to pass the shallow validator:

- `projected_work`: full read-only work queue independent of graph shaping.
- `science_projection_v1`: contract/version/source/fingerprint and
  campaigns/hypotheses/tests. Fields use `{value, unavailable_reason, source_ref,
  fingerprint}`; campaign/test/hypothesis IDs and reference links must agree.
- `read_model`: an existing extension read by `features/lab/model.ts` through a
  cast, absent from the declared `SystemState` interface. Includes `tests` and
  `historical_tests` dictionaries, `hypotheses`, `roadmaps`, `activity`.
  Test detail uses question/semantic display name, status/review/verdict/domain,
  campaign/hypothesis/roadmap IDs, preregistration (metric, threshold, prediction,
  null/rival, success/kill criteria, ref/hash/time), reviews, lineage,
  execution/time, blocker, readiness, limitations and claim boundary.
- `evolution`: gates, review queue, roadmaps, genome, decoys, charters, thoughts,
  incidents, watchdog, board, families, learning and autonomy where present.
- `guardian`: status, checked times, check counts and failing areas.
- `cosmology_state`: its existing contract in `contracts/cosmology.ts`; preserve
  frontiers and referenced historical tests so Universe links resolve.
- Graph optional semantic fields, campaign/test-group IDs, independent scientific,
  attempt and review states, explicit human-gate state, source links, blockers,
  owner/priority and automation eligibility are used by filters and inspectors.
- Filaments retain evidence, endpoint IDs/domains, scope and learning refs;
  cross-domain relationships must never disappear due to public sanitization.

### WorldState

`src/app/useWorld.ts` only checks version/items/providers, but
`src/contracts/world.ts` is the real presentation contract:

- `version:'1'`, `fingerprint`, `generatedAt`, `access:'PRIVATE'`, providers,
  items, contexts, issues, truthGraph, diff; optional provider totals/read_valid.
- Item: `id`, `kind`, `title`, `source`, `sourceRef`, `authority`, `freshness`
  (`state/observedAt/expiresAt`), `attention`, `actions`, `observedAt`; retain
  summary, context, loop status, due/end time, all-day, waitingOn, nextAction,
  priority and attention reason when declared.
- Provider: `id/label/status/lastSuccessAt/checkedAt/revision/message/partial/count`.
- Context: `id/title/description/itemIds/attentionCount/coverage`.
- Truth graph: fingerprint/time/results/material_conflicts with original source,
  provider, authority/capability states; no fake success for missing providers.
- Current world transport is NDJSON. A typed inner object can replace it only
  through an adapter; sending an object as a stream without changing transport
  is not required and must not be confused with the existing API response.

### Topology and publication

`src/mcp/McpAtlasApp.tsx` expects:

- topology `contract`, `generated_at`, `source`, `stats`, `nodes`, `links`.
- Source authority/repository/commit/manifest/mcp_server/remote_mcp, optional
  source_storage/snapshot/state-fingerprint/promoted time/projection_fingerprint.
- Nodes `id,label,kind,group,status,summary?,meta?`; kinds ROOT/LAYER/TRANSPORT/
  TOOL/FAMILY/CAPABILITY/BACKEND/ROLE. Links `id,source,target,kind,weight`.
- Stats tools/remote_tools/internal_tools/capabilities/backends/roles/families,
  status_counts and backend_counts.

`NexoStore.loadPublishedContext` returns `{topology,buildMeta,towerManifest}`.
It currently accepts only `NEXO_PUBLIC_PROJECTION_PUBLICATION_V1` and validates
`build_meta.projection_fingerprint === manifest.projection_fingerprint`, plus
matching `topology.source.projection_fingerprint` when present. A private
counterpart should preserve this consistency check while using explicit private
classification; do not label a private publication PUBLIC to satisfy this check.
No full raw canonical Tower dump is needed just to satisfy this method.

### Galaxy

The runtime consumer contract is `contracts/atlasObservation.ts` plus
`data/atlasObservation.ts`, not only the older `contracts/galaxy.ts` type.
It requires `NEXO_ONE_GALAXY_V1`, snapshot ID, ISO generated_at, tower revision,
sha256 fingerprint, provenance authority/source_fingerprint, entities, events,
needs_you, relations and exact matching stats lengths. Current validator accepts
only a 40-hex `tower_revision`, even though newer source manifests may have a
sha256 Drive revision; a private source adapter must resolve that explicitly,
never invent a Git commit. Each entity requires unique ID and finite x/y/z
layout; source fingerprints must match the runtime. Preserve canonical_id, kind,
domain/visual_domain, title/plain/meaning, status and independent scientific /
attempt / review values. Events require unique ID, known visual kind, finite
x/y/z/intensity, and source-backed entity/time. Morphology supplies the existing
arms/core/bridges rather than asking the UI to infer a new visual language.

The current observer stamps `observation.access:'PUBLIC_PROJECTION'`, and its
reducer retains old snapshots on every failed request. Reuse only its pure
geometry/provenance validation through a private-aware adapter. Private
invalidation must clear every old snapshot. `server/compiler/galaxy-v1.mjs`
explicitly requires a public projection contract; do not relabel private source
content PUBLIC merely to run this compiler.

## Existing private/source adapters and prohibited shortcuts

- `server/atlas/private-source.mjs`: authenticated HTTPS upstream reader,
  no-store, no redirects, timeout/body-size checks; `private-runtime.mjs` now
  validates the complete private runtime classification/shape/fingerprints.
  Missing sections or incompatible generations fail closed.
- `server/adapters/atlas-ssot.mjs` -> `compiler/atlas-ssot.mjs`: reads canonical
  tables and preserves Science, Engineering, Olympus, StructuralLearning,
  CrossDomain, Integrity projections. It is credential-backed legacy SSOT code,
  not proof of current runtime authorization or the sole canonical Tower source.
- `server/adapters/system-input.mjs` + `compiler/system-state.mjs`: private
  legacy action/capability/run/side-quest/filament compiler. It preserves Olympus
  but does not carry the full newer lab/evolution/read_model features by itself.
- `server/adapters/registry.mjs`: access-separated provider caches, 60-second
  success cache/in-flight dedupe and stale fallback. Cache key is access+provider,
  not user/session. Never let these caches substitute for per-request auth.
- `server/compiler/world-state.mjs`: compile provider records with
  `access:'PRIVATE'`; retains context and source provenance, returns availability.
- Do NOT use `buildPublicAtlasSsot`: explicitly empties Olympus, learning,
  cross-domain and integrity sections and emits `privacyGate:OLYMPUS_EXCLUDED`.
- Do NOT use `readResearchSnapshot`: fixed public publication fallback.
- Do NOT use `buildAtlasResearchView` / public research filtering to recreate
  private content: those contracts are PUBLIC_SANITIZED and exclude private,
  Olympus/person/client rows.
- Do NOT use `buildPagesProjection` / `publicReadModel` as the private compiler:
  their contract is PUBLIC and private tests/hypotheses/roadmaps are filtered.
- Existing `/api/system` deliberately reads the sanctioned PUBLIC SystemState
  even for an authenticated session. Authentication alone does not change it.

## Fetch, cache and persistence migration checklist

| Current path | Consumer | Required private behavior |
| --- | --- | --- |
| `/api/atlas-session`, `/api/atlas-private` | `atlas/api.ts`, `privateSession.ts` | Keep same-origin credentials, no-store, redirect:error, opaque cookie and strict lifetime |
| `/api/system` or `VITE_SYSTEM_ENDPOINT` | `data/adapters/remote.ts` | Dedicated private source; map 401/503 to global wipe; module-level 3-second promise must not cross session generations |
| `/api/world?stream=1&refresh=1` or `VITE_WORLD_ENDPOINT` | `app/useWorld.ts` | Protected data transport, abort on wipe, no public/static fallback; current stale preservation is not sufficient for 401/503 |
| `mcp/topology.json`, `tower-projection/publication.json` | `data/NexoStore.tsx` | Protected runtime sections or protected endpoints, atomic private fingerprint validation |
| `./galaxy/latest.json` / `VITE_GALAXY_ENDPOINT` | `atlas3d/GalaxyView.tsx` | Protected galaxy section, private-aware observer and wipe |
| `build-meta.json` every 20 s | `data/useSystem.ts` | Protected revision check or authenticated runtime reload; no Pages heartbeat |
| public publication/manifest/projection/build-meta plus optional POST sync bridge | `data/projectionSync.ts` | Private read-only refresh; no public fallback or workflow dispatch without separate authority |
| `/api/recall?q=...` | `features/Workspace.tsx` | Protected recall; private queries must not enter public URLs/analytics or static fallback |
| `/api/session` | `app/useSession.ts` | Do not require or recreate legacy cookie; use canonical Atlas session state |
| `/api/mcp/status`, MCP initialize/tools/list/tools/call | `mcp/client.ts` | Keep existing independently scoped machine rules. A browser session does not grant machine write calls. Read-only UI status needs an explicitly protected read adapter. |

Data-bearing localStorage writes currently include
`nexo.public-projection-receipt.v1` (fingerprints, source IDs and counts) and
`nexo.lab.baseline.v1` (counts/time). They must be disabled or made session-only
memory for private use. Theme/view/glow/event-filter/quality/legend/flat-mode
preferences contain no payload and can remain if their values stay generic.
Narration persistence stores seed/cursors only; source receipt IDs/text are
already restricted to bounded memory. Inspect all newly enabled paths before
assuming old public storage behavior is safe.

`privateSession.ts` is the required lifecycle owner: it already clears data on
expiry, logout, any private-load failure, pagehide, route disposal, revalidation,
and cross-tab wipe, with generation tokens and an honest revocation result.
Mount the interactive private store only while authenticated. All derived state,
request dedupe promises, selected private objects, graph caches and drawers must
be scoped to that mount/session generation, and late responses must be ignored.

The outer area router recognizes only `#/privado...`; existing links use root
hashes. A private route mapping is mandatory. Merely nesting App inside
PrivateApp without remapping links causes it to leave the private area.

## Synthetic acceptance matrix

Use generic synthetic IDs only and no network/credential reads:

1. Authorised synthetic runtime renders existing surfaces, not flattenData rows.
2. Olympus node, test detail, context item, action/gate and cross-domain filament
   survive source -> adapter -> view-model with their original private meaning.
3. Graph selection/filter/lens/deep-link works; Back/Forward stays under private
   routing. Lab entity/roadmap links and 2D/3D controls remain functional.
4. Source fingerprint agrees across system, publication, topology and galaxy;
   wrong generation is rejected; incomplete providers stay visibly unavailable.
5. Anonymous/expired/forged sessions cause zero upstream/data-cache reads;
   logout/expiry/401/503 clears DOM and memory, including late-response, bfcache,
   multi-tab and private-to-public route transitions.
6. Private refresh never fetches Pages/static/raw mirrors, writes localStorage
   payload/receipt, or dispatches public publication.
7. Public response remains the empty allowlist. Production bundle/static output
   contains no synthetic fixture or private content. Backend tests alone do not
   prove the interactive migration is complete.

## Current acceptance status (mandatory, not an optional parity choice)

| Requirement | Status from this inspection / synthetic test |
| --- | --- |
| Full existing private interactive UI mounted after authentication | **IMPLEMENTED, browser acceptance pending**: authenticated private frame mounts preserved App/NexoStore; server-only build and real HTTP asset denial tests pass. |
| Olympus source -> retained lab/Atlas/operation models preserves private records | **PASS, synthetic only**: the new test feeds actual `buildLab`, `buildAtlasMetroModel`, `globalSummary`, `humanActions`. |
| Full five-section private runtime shape and atomic generation checks | **PASS, synthetic source and production-validator tests**: the source boundary and helper accept complete synthetic sections and reject public labels or inconsistent fingerprints/counts. Actual upstream completeness is unverified. |
| Private routing, 2D/3D interaction, search/drawers and all surface navigation | **IMPLEMENTED / INDEPENDENT BROWSER UNVERIFIED**: private adapters and routes are wired; cloud Chromium execution remains blocked. |
| Production private source has all required fields including Olympus | **UNVERIFIED**: no real source read or field inventory was performed. |
| Private session wipes all retained component state/caches | **INCOMPLETE** until integrated stores, requests, drawers and observers are lifecycle-bound and browser-tested. Existing session controller alone does not prove future component caches are safe. |
| Protected UI asset backend | Parent implementation supplies `/api/atlas-private-ui` and `/api/atlas-private-assets/:name` with a `server/private-ui` build and `ATLAS_PRIVATE_ASSETS_V1` SHA-256 file manifest. The separate private build and mount are now integrated; neither is copied into public dist. |
| New frontend or visual design changes | None in this mapping task. |

### Exact Olympus source coverage still needed

There is no specialised Olympus patient/plan/check-in contract in the retained
frontend files. Its existing contract is the same source-backed domain graph,
scientific/test records, operational records and world-context representation:

1. `system.graph.nodes`: every relevant Olympus canonical ID, type, domain and
   source fields; declared campaign/semantic parent IDs and actual detail fields.
   Edges must point at retained IDs. Do not fabricate missing IDs or relationships.
2. `system.science_projection_v1` + `system.read_model.tests/hypotheses/roadmaps`:
   the Olympus records actually present at the source, including private flags,
   scientific evidence, preregistration, review, lineage and source references.
   The current public read-model filters explicitly drop private records.
3. `system.actions/inbox/lanes/projected_work/capabilities/findings/runs`:
   source-declared Olympus tasks, gate requirements, status/readback and providers.
   A row's domain or lane must stay Olympus; a successful test does not imply
   successful execution or an approved decision.
4. `system.filaments` and graph learning edges: original Olympus endpoints,
   evidence, domain scope and destination links.
5. `world.items` and `world.contexts`: Olympus records with titles/details,
   sourceRef, freshness, attention/status/nextAction where declared, and matching
   context itemIds. These can represent plans/check-ins without inventing a new
   visual panel or clinical schema.
6. Galaxy entities and topology/publication metadata must be derived from this
   same private source generation, with explicit PRIVATE classification.

Which concrete production records/fields are absent cannot be established from
source-code inspection. The mapping proves the required transport and consumer
fields; it does not claim that the configured upstream is available or complete.

## Added verification artifacts

- `test/helpers/private-runtime.fixture.mjs`: entirely synthetic proposed runtime
  with generic IDs and example.invalid source references; not a build input.
- `test/helpers/private-view-contract.mjs`: test-only shape validator and
  component/route/field/regression-suite map. It is not an authorization check and
  must not be imported into production as a replacement for backend validation.
- `test/atlas-private-view-contract.test.mjs`: five passing tests, invoked with
  `node --test nexo-one/test/atlas-private-view-contract.test.mjs` from repo root.

The tests do not call the upstream, log in, read any real private payload, build
or deploy a frontend, or establish that the required interactive UI is ready.
