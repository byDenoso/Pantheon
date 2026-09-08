# Graph Projections

Three readings of the same Neon truth owners, each assembled from its own tables.
This is not one array filtered three ways — the layers do not share a query, a
cache entry, or a failure.

`GET /api/projection` · contract `projection-v1` · `lib/projections.mjs`

## Layers

| Layer | Question it answers | Tables it reads |
|---|---|---|
| `science` | O que sabemos, o que testamos e o que isso produziu. | `science_v1.domains, entities, entity_domains, relations, provenance, assets, publication_submissions, result_subjects, entity_display` |
| `execution` | O que rodou, onde rodou, o que produziu e o que travou. | `nexo_ops.actions, execution_runs, runtime_events, attention_items, current_state` |
| `integrity` | De onde a verdade vem e se a projeção ainda corresponde a ela. | `nexo_ops.truth_states, sync_state, execution_runs` · `science_v1.sources, revisions, import_batches, entity_display, migration_issues` · `learning_v1.patterns, migration_issues, import_batches` |

Tiers, in spine order (position drives Z):

- **science** — DOMAIN → CAMPAIGN → HYPOTHESIS → CLAIM → TEST → EVIDENCE → DATASET → PAPER → RESULT
- **execution** — CAMPAIGN → TASK → TEST → RUN → AGENT → RUNTIME → ARTIFACT → DEPENDENCY → BLOCKER → WRITEBACK
- **integrity** — TRUTH_OWNER → SOURCE → SOURCE_VERSION → INGESTION → TRANSFORMATION → NEON_RECORD → ATLAS_PROJECTION → VALIDATION → READBACK → CONTRADICTION → LEARNING

## Query

    /api/projection?layers=science,integrity&zoom=2&tier=TEST&signal=blocked&q=planck
    /api/projection?layers=execution&focus=action:<id>&direction=lineage&depth=3
    /api/projection?describe=1

`layers` takes one, two or three names; an unknown name is reported in
`unknownLayers` rather than dropped. `zoom` is 1 macro / 2 meso / 3 micro, and
zooming in only ever *adds* nodes. `refresh=1` bypasses the 60s cache.

## What the payload promises

    {contract, layer|layers, tiers, nodes, edges, clusters, bridges,
     state, metadata, generatedAt, sourceState, integrity, fingerprint}

**Authority.** Every node declares one of `SCIENCE_CANONICAL`,
`OPERATIONAL_CANONICAL` or `DERIVED_NOT_EVIDENCE`. A derived node also carries
`derivation`, naming the exact rule that produced it. The rules currently in use:

| Derivation | What it means |
|---|---|
| `HYPOTHESIS_STATUS_RESOLUTION` | `science_v1` has no CLAIM type. A hypothesis whose status resolved is projected as a claim beside the hypothesis it came from. |
| `DISTINCT_ACTION_DOMAIN` / `DISTINCT_EVENT_COMPONENT` / `DISTINCT_RUNTIME_ENV` / `DISTINCT_ARTIFACT_HASH` | Groupings of values recorded on the ops rows. |
| `RUNTIME_ENV_TOKEN_SPLIT` | A parse of the runtime string an operator wrote. Not a verified inventory. |
| `REVISIONS_GROUPED_BY_SOURCE_SURFACE` / `ENTITY_DISPLAY_GROUPED_BY_NAMING_METHOD` | Aggregations, carrying the row counts they were computed from. |
| `SELF_DECLARED_PROJECTION` | The Atlas drawing itself. It is a projection, never a truth owner. |

**States.** `state` is one of `OK`, `NO_DATA`, `FILTER_EMPTY`, `BACKEND_ERROR`,
`SOURCE_UNAVAILABLE`, `SYNCING`, `GRAPH_BUILDING`, `PERMISSION_ERROR`. They are
not interchangeable and the UI renders a different surface for each. A layer
whose reader fails reports the table and HTTP status that failed, and is never
replaced by another layer's nodes or by zeros. In a composition, a failed layer
appears in `degraded` while the healthy ones still draw.

**Counts.** An unknown count is absent or `null`, never `0`. A capped tier
reports `{declared, drawn, truncated}` so the map never implies completeness it
does not have. `integrity` is recomputed for whatever the current view actually
shows; the whole-layer figures stay under `integrity.ofLayer`.

**Statusless tiers.** `DATASET`, `EVIDENCE`, `RUNTIME`, `AGENT`, `ARTIFACT`,
`DEPENDENCY`, `NEON_RECORD`, `SOURCE_VERSION`, `TRANSFORMATION` and
`ATLAS_PROJECTION` have no status column. They set `statusDeclared:false` and are
excluded from `unknownSignal`: a tier that never had a status is not a gap in the
read.

## Known limits of the current data

Read against production on 2026-09-08. These are facts about the source, not
defects in the projection:

- `science_v1.entity_assets` is empty, so the 53 rows in `science_v1.assets` are
  drawn as an unlinked catalogue (`link_state: NO_ENTITY_LINK_DECLARED`) instead
  of being attached to a guessed owner.
- All 92 `science_v1.migration_issues` are resolved and no `learning_v1.patterns`
  row records a contradiction, so the `CONTRADICTION` tier is legitimately empty.
- Only 14 of 5 388 provenance rows carry an evidence-grade authority, so
  `EVIDENCE` is small by construction.
- Exactly one `nexo_ops` `source_ref` names a science test, so the execution
  layer's `TEST` tier — and the science↔execution bridge — is currently a single
  node.

## Composition

Each layer keeps its own Z band, so composing reads as depth rather than as one
flattened pile. A node that appears in more than one layer is reported in
`bridges` and drawn once, with `alsoInLayers` naming the others — it is never
silently merged or silently duplicated.

## Local development

The Neon Data API needs a Vercel OIDC token that only exists in a deployment.
For local rendering, point `ATLAS_DEV_FIXTURE` at a JSON bundle of real rows:

    ATLAS_DEV_FIXTURE=/path/to/rows.json node dev.mjs

`dev.mjs` builds the projection from those rows through the exact builders
production uses. It is a rendering harness, not a fallback: `dev.mjs` is not
deployed and `api/projection.js` has no fixture path, so production cannot serve
recorded data as if it were live.
