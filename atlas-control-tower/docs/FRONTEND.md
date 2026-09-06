# Atlas frontend — guide for the next agent

## Approved direction

Observatório (concept 01): a map-first cosmic knowledge explorer. Blue and white light theme; blue and navy dark theme. Restrained atmospheric shading, no strong neon. Preserve custom perspective Canvas, orbit/pan/zoom, explicit source links and scientific authority. The reference image is a composition target; never fabricate its sample metrics or edges.

## Change map

| Concern | Edit |
|---|---|
| Theme colors, surfaces, contrast | `ui/tokens.css` |
| Canvas theme palettes, star count, halo, core size, orbit speed | `ui/visual-config.mjs` |
| Theme persistence and accessible toggle | `ui/theme.mjs` |
| Root overview data expansion and cluster positions | `ui/map-data.mjs` |
| Layout, spacing, responsive rules, components | `styles.css` |
| Shell and stable DOM IDs | `index.html` |
| Camera, projection, picking and drawing | `graph3d.mjs` |
| API orchestration, charts, inspector, filters, WebMCP | `app.mjs` |
| Explicit list of public assets | `frontend-files.mjs` |

CSS and Canvas need their respective palette entries when adding a theme. Both use semantic roles. Do not hardcode new surface colors in components. Status colors are retained in charts and chips; node colors encode the visual blue theme, not evidence strength.

## Data and DOM boundaries

Keep all existing element IDs unless their JS consumers and browser tests are updated together. `Graph3D` consumes `{nodes, edges}` and `focus`; selection/open callbacks receive the original node. Root expansion reads a bounded number of actual children for each subsystem, deduplicates IDs and preserves edge authority. It tolerates failed group reads. It is a preview, not an exhaustive representation of all 6,000+ entities. Drill-down remains the authoritative route to the full bounded subgraph. Geometry never measures scientific confidence.

Science and operational readers live in `lib/` and `api/`. No redesign should change source status semantics or the private snapshot. The root graph's node count is the currently visible preview count. The global metrics remain API counts.

## Local workflow

1. Node 24, `npm start` from project root (port 3000).
2. `npm test` for model, camera, adapters, sync and overview contracts.
3. `node test/browser.cjs` with Playwright available in `CODEX_PRIMARY_RUNTIME_NODE_MODULES`. Optional `ATLAS_CHROMIUM_MODULE` is an absolute ESM provider entry. `ATLAS_BASE_URL` changes the test host.
4. Inspect generated `preview-desktop.png`, `preview-light.png`, mobile screenshots and inspector. Theme persistence is tested across reload. Screenshots are local QA artifacts, excluded from Git.
5. `node test/render.cjs` tests the actual Canvas renderer with the native Canvas dependency.

New client module? Add it to `frontend-files.mjs`, then run `node scripts/configure-static.mjs`. This regenerates only static builds in vercel.json; preserves API builds/routes and cron. The dev server uses the same asset list. Never add snapshot, readers, environment files or private exports to this public manifest.

## Delivery and known limits

Repo `byDenoso/Pantheon`, active branch `atlas-control-tower-v3-20260905`, directory `atlas-control-tower/`. Vercel project `prj_DLQSz5OiIT1HxWMn2i4AgoIv5x8r`. Project is not Git-connected; code push does not deploy. Verify provider state before publishing. Previous production rollback for this pass: `dpl_7tzijKNf5EpZqCJBVaTahPSRBCkj`.

Science still uses a bundled private snapshot without configured Google authentication. Durable cache and automatic scientific refresh are separate backend work. Keep source timestamps visible. Do not describe snapshot science as live. Native-browser screenshots verify desktop/mobile viewport rendering, not a physical phone.

## Tower layers
The toolbar selects 1–3 edge hops (default 3), sent as `depth` to the existing graph API. `layeredSubgraph` in `lib/model.mjs` follows existing directed navigation edges, emits layer/layoutParent for geometry, caps each branch at 8 children and the UI at 120 nodes. Truncated views show RECORTE; drill into a node or choose 1 camada for its paginated immediate children. No extra per-node HTTP calls. Authority is unchanged.

## Graph Contract V1

`lib/atlas-api.mjs` is the only place that talks to the API. It returns
`{nodes, edges, total, hasMore, truncated, depth, fingerprint, sourceVersion, issues}`
and fills in every field a payload omits, so a backend or projector change cannot
reach `Graph3D`, which still consumes `{nodes, edges}` and `focus`. Edges whose
endpoint is absent from `nodes` are dropped before the renderer sees them.

Reads are cached in memory keyed by the projection `fingerprint`; a new fingerprint
clears the cache and `POST /api/sync` is never cached. The cache is a repeat-request
short circuit, never an authority. `lib/graph-session.mjs` owns focus, mode, filters,
offset, depth and path, and still issues exactly one graph read plus one summary read
per recorte with the stale-response guard.

## Learning

`lib/learning.mjs` (server) derives the Observation → Pattern → Lesson → Strategy →
Policy ladder, the emergent buckets and the entity overlay; `ui/learning-view.mjs`
renders them. Every bucket is computed from fields the source publishes —
`status`, `relation_type`, `support_count`, `contradiction_count`,
`successful_uses`, `failed_uses`, `confidence`. Nothing is scored synthetically and
confidence is shown only when the source published one. Stages with no record in the
projection are drawn as pending and name the source they still need
(`PROCEDURAL_MEMORY`, `STRATEGY_REGISTRY`, `ADAPTIVE_POLICY`).

The inspector overlay (`Aprendizado relacionado`) lists only learning records whose
own `evidence_refs` cite the open entity. It never reclassifies the entity, and when
nothing cites it the panel says the link is absent from the source rather than
inferring one. `GET /api/learning` returns the report; `GET /api/learning?id=` returns
the overlay for one entity.

## Migration Health

`lib/audit.mjs` (server) and `ui/audit-view.mjs` own the Audit tab. Categories:
broken references, unresolved domain, result without owner, ambiguous mapping,
legacy alias, other. Counts are complete and samples are bounded and labelled as
such. Empty categories are still listed, as "sem ocorrências".

`UNMAPPED` is not a scientific domain: it is excluded from the domain chart, from the
sidebar domain list and from `GET /api/state` `domains`, and appears only here and as
`projection.unresolvedDomain`, which links straight into the tab. The underlying nodes
are untouched — this is a presentation boundary, not a data repair.

## WebMCP

`webmcp/tools.mjs` builds every tool on the same client as the visual Atlas; there is
no second data path. `atlas_get_learning`, `atlas_explain_learning_origin` and
`atlas_get_migration_issues` join the read tools. Only the view-moving tools listed in
`VIEW_TOOLS` are non-read, and none of them mutates scientific state.

## Module map

`app.mjs` is bootstrap and wiring. Rendering lives in `ui/metrics.mjs`,
`ui/inspector.mjs`, `ui/filters.mjs`, `ui/learning-view.mjs`, `ui/audit-view.mjs`,
with shared helpers in `ui/dom.mjs`. `lib/audit.mjs` and `lib/learning.mjs` are
server-side and deliberately absent from `frontend-files.mjs`.

## Graph Contract V1 and the datasource switch

`lib/graph-contract.mjs` is the shared shape (producer and consumer):
`{focus, nodes, edges, total, hasMore, truncated, depth, fingerprint, sourceVersion,
source, freshness, cache, issues}`. Unknown keys survive under `extra`, missing
optional keys fall back, and `contractIssues()` reports drift by level instead of
throwing. Edges whose endpoint is absent are dropped before `Graph3D` sees them.

`lib/datasource.mjs` chooses the reader from `ATLAS_DATA_SOURCE` = `legacy | v1 | auto`
(default `auto`) plus `ATLAS_V1_BASE_URL` and optional `ATLAS_V1_ENVIRONMENT`.
`auto` uses science_v1 when `/health` answers and otherwise serves the legacy
snapshot; an unconfigured V1 under `auto` is `SNAPSHOT`, not a degraded fallback.
A requested-but-unreachable V1 is always `FRESHNESS.FALLBACK` and ships a
`DATASOURCE_FALLBACK` issue that the UI renders as a loud note. Snapshot science is
never labelled live.

The client cache is keyed by projection fingerprint and cleared whenever the
fingerprint changes; `api.cacheKeyFor()` produces the documented
`graph:v1:<source>:<fingerprint>:<focus>:<depth>:<filters>` form. `POST /api/sync`
is never cached. Camera movement issues no request; focus, depth and filters do.

## Naming

`lib/naming.mjs` decides what a human reads first without touching canonical
identifiers. Priority: curated label → backend label/display_name → campaign-derived
→ short scientific question → humanised id → canonical id. Every node carries
`label`, `canonicalId`, `canonicalTitle`, `displaySource` and a `searchText` that
covers label, canonical id, question and campaign. Operational records
(RUN, AUTOMATION_RUN, RESULT, FILE, ARTIFACT, DATASET) keep their code, because
their summary is an outcome paragraph rather than a title. `tidySourceLabel` only
cleans SHOUTED source strings (`PEER MICRO FINGERPRINT` → `Microphysics Fingerprint`)
and `humanizeId` expands only the small glossary; unknown abbreviations are never
decoded. The inspector always prints the canonical id and the label's provenance.

## Buttons that were dead

The decorative `DP` avatar is now `#provenance`, the source/freshness pill.
The `Dados` tab is a real sortable table (`ui/data-view.mjs`) over the same recorte
the map is showing, with no extra request. `#more` now appears on a truncated
layered recorte and raises the node cap instead of paging an offset that layered
views ignore. `#mode-chip` names the active exploration mode (VIZINHANÇA,
ANCESTRAIS, …) and returns to layered expansion.
