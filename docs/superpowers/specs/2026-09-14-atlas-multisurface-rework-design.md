# NEXO ATLAS multi-surface rework design

Date: 2026-09-14
Status: Approved for implementation
Branch: `atlas-multisurface-rework-20260914`

## 1. Purpose

Rework ATLAS so the public application stops treating one structural snapshot as if it were sufficient for every product surface. The graph remains structural and sparse, while Observatory, Laboratory, Cockpit, Activity, Learning and Search receive dedicated sanitized read models derived from the same canonical sources.

The rework must preserve the current fail-closed behavior, manual sync model, GitHub Pages as the primary frontend, and the rule that the public build never invents scientific or operational state.

## 2. Success criteria

The rework is complete when:

1. `Grafos` exposes only structural hierarchy and never floods the map with tests/results.
2. `Grafos` uses one performant Spatial Canvas 2.5D experience with full orbit/tilt/pan/zoom navigation, meaningful depth, readable labels and no 2D/WebGL mode toggle.
3. A leaf node cannot open an empty subgraph. Expandability is derived from real hierarchical children.
4. `Observatório` can render H0 comparisons by published stack, quantitative parameters, tensions and directional signals when the source publishes enough structured data.
5. `Laboratório` can render Hypothesis, Claim, Test, Run, Result, Evidence and Decision/Knowledge from a dedicated investigative index instead of relying on graph nodes.
6. `Cockpit` can show public operational state, sync receipts, blockers, active runs and health signals when those records are published.
7. `Atividade` renders a real public event stream instead of a permanent `DATA_UNAVAILABLE` placeholder.
8. `Learning` separates published learning corpus from scheduler/runtime state.
9. Manual sync updates the changed public surfaces atomically through one manifest and readback protocol, not only Science/Engineering graph projections.
10. Existing public sanitization remains fail-closed. No private Olympus/person-level data is exposed.
11. Regression tests prevent empty-subgraph navigation, partial multi-surface swaps, unverified sync state, accidental reintroduction of private/forbidden records, and reintroduction of the old renderer toggle.

## 3. Chosen approach

Use a **multi-surface public projection manifest**. Keep one canonical authority chain, but materialize purpose-specific public artifacts:

- structural graph
- observatory
- laboratory
- learning
- operations
- activity
- audit
- search

The browser loads the manifest, validates fingerprints and per-surface hashes, then exposes each surface through the existing API client/adapters. Manual sync fetches and independently re-reads the manifest before switching the active live snapshot.

This approach is chosen over two rejected alternatives:

### Rejected: one giant public graph

This would make tests/results/runs first-class visual graph nodes. It creates visual noise, mixes structural and investigative semantics, and makes traversal behavior harder to reason about.

### Rejected: independent per-page fetch pipelines

This would let every page invent its own source logic. It reduces immediate work but creates inconsistent freshness, provenance and failure semantics across ATLAS.

## 4. Public manifest contract

Introduce a versioned public contract with this semantic shape:

```json
{
  "contract": "NEXO_ATLAS_PUBLIC_MANIFEST_V2",
  "authority": "GOOGLE_DRIVE",
  "projectionOnly": true,
  "access": "PUBLIC_SANITIZED",
  "generatedAt": "ISO-8601 timestamp",
  "sourceModifiedAt": "ISO-8601 timestamp",
  "fingerprint": "sha256:<64 hex chars>",
  "surfaces": {
    "graph": { "state": "READY", "contract": "graph-vN", "path": "graph/index.json", "sha256": "<64 hex chars>" },
    "observatory": { "state": "READY", "contract": "observatory-vN", "path": "observatory/index.json", "sha256": "<64 hex chars>" },
    "laboratory": { "state": "READY", "contract": "laboratory-vN", "path": "laboratory/index.json", "sha256": "<64 hex chars>" },
    "learning": { "state": "DATA_UNAVAILABLE" },
    "operations": { "state": "READY", "contract": "operations-vN", "path": "operations/index.json", "sha256": "<64 hex chars>" },
    "activity": { "state": "READY", "contract": "activity-vN", "path": "activity/index.json", "sha256": "<64 hex chars>" },
    "audit": { "state": "READY", "contract": "audit-vN", "path": "audit/index.json", "sha256": "<64 hex chars>" },
    "search": { "state": "READY", "contract": "search-vN", "path": "search/index.json", "sha256": "<64 hex chars>" }
  }
}
```

Rules:

- The top-level fingerprint is computed from contract version, source version and all declared surface states/hashes.
- Every `READY` surface is independently hash-verified.
- `graph` is the only required surface for accepting a new live snapshot. Other surfaces may be explicitly `DATA_UNAVAILABLE`; absence without an explicit state is invalid.
- A `DATA_UNAVAILABLE` surface has no path/hash and is rendered honestly by its consumer.
- The browser switches to a new live manifest only after two independent manifest reads agree on fingerprint and every changed `READY` surface validates.
- On any validation failure, the last valid active snapshot remains untouched.

## 5. Graph contract and navigation

### 5.1 Scope

`Grafos` remains a structural map. Allowed primary structural kinds include SYSTEM, DOMAIN, PROGRAM and CAMPAIGN. Other structural kinds may be added only if they express hierarchy or durable architecture, not investigative execution records.

TEST, RESULT, RUN, EVIDENCE, CLAIM, DATASET and ARTIFACT do not become ordinary map nodes.

### 5.2 Expandability

Every graph node exposed to the UI gains derived navigation metadata:

```ts
{
  expandable: boolean,
  childCount: number
}
```

`expandable` is true only when the current public structural projection proves at least one hierarchical outgoing child.

UI rule:

- expandable node: select + show `Entrar`
- leaf node: select + inspector only
- leaf node never navigates to an empty focus graph

The same rule must be consumed by Canvas, SpatialInspector and search-to-graph navigation.

### 5.3 Spatial Canvas renderer and aesthetic contract

`Canvas25DGraph` becomes the single primary spatial renderer. The WebGL/Three scene is removed from normal navigation and the user-facing `2D`/renderer switch is retired instead of maintained as a second product path.

The canvas must preserve full spatial navigation without a WebGL scene:

- horizontal drag rotates azimuth/orbit;
- vertical drag changes tilt/depth perspective;
- pan remains available through the existing pan gesture/modifier contract;
- wheel/pinch controls zoom;
- keyboard navigation and reduced-motion behavior remain available;
- camera reset remains available.

Visual composition rules:

- hierarchy maps to deliberate depth bands, not arbitrary Z noise;
- the focused/root node anchors the visual composition;
- first-level structural children occupy the dominant readable band;
- secondary/context nodes recede through scale, opacity and depth rather than competing equally with the focus;
- selected, pinned and portal nodes remain visually distinguishable;
- labels use level-of-detail: selected/pinned/focus labels are always shown, nearby high-priority labels are shown when space permits, distant labels collapse before they overlap heavily;
- label collision is handled deterministically in projected screen space;
- edge opacity/weight responds to projected depth and selection; unrelated distant edges are visually quieter;
- edge routing may curve to reduce line-through-node collisions;
- shadows/glows are restrained so depth is communicated by projection and hierarchy rather than large floating cards;
- no dense wall of dark label cards may obscure the graph core;
- mobile uses the same semantic renderer with reduced label density and shallower decorative effects.

The renderer may continue to use the existing Canvas layout/projection helpers, but there must be one navigation semantic contract and one default renderer path.

No second semantic graph is introduced inside Laboratory.

## 6. Observatory contract

Introduce `observatory/index.json` with explicit sections:

```ts
{
  h0Stacks: H0StackMeasurement[],
  parameters: ParameterMeasurement[],
  tensions: TensionMeasurement[],
  directionalSignals: DirectionalSignal[],
  domainSynthesis: DomainSynthesis[]
}
```

### 6.1 H0 by stack

Replace the idea of a single opaque `weightedH0` card with a stack-aware comparison model.

```ts
interface H0StackMeasurement {
  id: string;
  testId: string;
  campaignId: string;
  stackId: string;
  stackLabel: string;
  datasets: string[];
  model: string | null;
  h0: number;
  uncertaintyLow: number | null;
  uncertaintyHigh: number | null;
  uncertaintyLevel: string | null;
  baselineId: string | null;
  deltaH0: number | null;
  evidenceClass: string | null;
  status: string;
  decision: string | null;
  sourceRefs: string[];
  lastVerified: string | null;
}
```

The Observatory renders:

1. forest plot: H0 per published stack
2. delta-H0 comparison relative to an explicit baseline when available
3. stack composition matrix when dataset membership is published
4. optional weighted/reference band only when the source publishes a valid combination rule or covariance-aware aggregate

Chart rules:

- x-axis uses H0 in km/s/Mpc.
- uncertainty bars are shown only when both magnitude and confidence/credibility level can be represented truthfully.
- the UI must not silently call an unknown interval `1σ` or `68%`.
- `deltaH0` is shown only against an explicitly identified baseline.
- if no valid weighting rule is published, the product is labeled `Comparativo H0 por stack`, not `H0 ponderado`.

### 6.2 Extraction rule

Structured source fields are preferred. Legacy free-text `keyMetrics` may be parsed only by a deterministic projection-time extractor with tests. The browser must not scrape arbitrary scientific prose.

Ambiguous records are omitted from quantitative charts and remain visible in provenance/diagnostics as unparsed rather than guessed.

## 7. Laboratory contract

Introduce a dedicated sanitized investigative index independent of graph sanitization.

Supported public stages:

- HYPOTHESIS
- CLAIM
- TEST
- RUN
- RESULT
- EVIDENCE
- DECISION
- KNOWLEDGE
- PIPELINE

The Laboratory read model includes stable IDs, labels, status, domain, campaign relation, summary, timestamps, provenance and declared lineage edges.

### 7.1 Fix existing hook gap

`useLabData()` must actually request hypotheses through `getHypotheses()` and must support decisions/knowledge through explicit adapter methods.

### 7.2 No second graph renderer

The large contextual map area in Laboratory is replaced by a compact lineage/context panel built from investigative relationships and breadcrumbs. It must not instantiate a second spatial graph engine.

## 8. Cockpit contract

Introduce `operations/index.json` with only public-safe operational records:

- current blockers
- active/declared runs
- latest sync receipt
- health plane evidence
- recent verification/readback records
- scheduler/runtime availability signals

Unknown remains unknown. A missing source is not rendered as healthy.

Cockpit must distinguish:

- source freshness
- last successful readback
- active work
- blocked work
- operational data unavailable

## 9. Activity contract

Introduce `activity/index.json` as an append-style public projection of meaningful lifecycle events:

- INTENT
- EXECUTION
- RECEIPT
- MUTATION
- READBACK
- HANDOFF

Each event contains public-safe IDs, type, timestamp, status, related work/campaign references, and provenance where publishable.

Activity no longer hardcodes `DATA_UNAVAILABLE`. If the surface is unavailable, the page explains that the source is unavailable; if available but empty, it renders a true empty state.

## 10. Learning contract

Separate two concepts:

1. **Learning corpus**: observations, patterns, lessons, strategies, policies and declared transfer relations.
2. **Learner runtime**: scheduler/agent execution state.

The public Learning page can be fully useful with only the corpus. Runtime state is optional and appears separately as operational metadata. Missing scheduler state must not make the corpus appear unavailable.

## 11. Search contract

Search receives an investigative index that can return TEST, RESULT, CLAIM, DATASET, ARTIFACT and other non-map records.

Routing rules:

- DOMAIN/CAMPAIGN/other structural nodes -> Graph focus
- TEST/CLAIM/RUN/RESULT/EVIDENCE/DECISION/KNOWLEDGE -> Laboratory deep link
- observatory quantitative records -> Observatory deep link
- learning item -> Learning deep link

Search results never fabricate graph positions for non-map records.

## 12. Manual sync behavior

Extend `createPagesManualSyncApi` from a Science/Engineering-only live overlay into a manifest-driven live snapshot.

Flow:

1. Read live manifest A with cache disabled.
2. Read live manifest B independently.
3. Require matching top-level fingerprints.
4. Compare current active surface states/hashes to B.
5. Fetch only changed `READY` surfaces plus required shared metadata.
6. Verify each changed payload against the manifest hash.
7. Build an immutable candidate snapshot in memory.
8. Validate cross-surface contract/version compatibility.
9. Atomically replace the live snapshot.
10. Publish a local sync receipt containing changed surfaces, before/after fingerprints and readback status.

Failure at steps 2-8 preserves the previous valid snapshot and returns a fail-closed receipt.

A transition from `READY` to `DATA_UNAVAILABLE` is itself a surface change and must be part of the atomic candidate/readback, so stale data from the previous snapshot cannot masquerade as current.

## 13. Public/private boundary

The rework must not make all canonical records public merely because a new surface exists.

Rules:

- Public artifacts contain only `PUBLIC_SANITIZED` fields.
- Personal Olympus records never enter the public manifest unless explicitly aggregated and de-identified by an upstream producer.
- Secrets, private file references, personal names, private Drive IDs and raw sensitive payloads remain excluded.
- Public projections may expose aggregate counts, anonymized statistics and generic structural state only when already approved by source policy.
- Sanitization tests are mandatory for each new surface.

## 14. Error and freshness semantics

Every surface uses the same state vocabulary:

- READY
- EMPTY
- DATA_UNAVAILABLE
- STALE
- DEGRADED
- API_ERROR

Definitions:

- `EMPTY`: source is available and valid, with zero matching records.
- `DATA_UNAVAILABLE`: the source does not publish this surface/data.
- `STALE`: a previously valid surface is intentionally shown after freshness expiry.
- `DEGRADED`: partial source or validation issue with a still-usable subset.
- `API_ERROR`: no valid read for the requested operation.

Pages must not collapse these states into one generic blank panel.

## 15. Implementation boundaries

Target files/modules will be limited to the data-contract, projection, API adapter, sync, graph renderer, graph styling and page/component layers needed for this rework. Unrelated restyling and infrastructure changes are out of scope.

Expected areas:

- `atlas-control-tower/lib/*static-state-generator*`
- `atlas-control-tower/lib/pages-manual-live-api.mjs`
- `atlas-control-tower/src/api/*`
- `atlas-control-tower/src/core/*`
- `atlas-control-tower/src/pages/*`
- `atlas-control-tower/src/graph-engine/*`
- `atlas-control-tower/src/design/graph-25d-v2.css`
- `atlas-control-tower/src/design/graph-v2.css`
- `atlas-control-tower/src/design/mobile.css`
- `atlas-control-tower/test/*`
- public snapshot/projection fixtures only where required by tests

## 16. Test strategy

Implementation follows TDD. Required regression coverage:

### Graph

- leaf node => `expandable=false`
- node with real hierarchical child => `expandable=true`
- inspector hides `Entrar` on leaf
- search never routes non-map investigative records to a graph focus
- default graph route uses the Spatial Canvas path without exposing a renderer toggle
- screen-space label selection is deterministic and preserves focus/selected/pinned labels
- graph aesthetics remain usable under mobile/reduced-density constraints

### Observatory

- deterministic H0 stack normalization
- invalid/ambiguous H0 metrics are omitted rather than guessed
- uncertainty level is never invented
- weighted/reference aggregate is absent unless combination metadata exists
- stack forest-plot view receives stable structured values

### Laboratory

- hypotheses are fetched and rendered
- investigative TEST/RESULT survive dedicated public sanitization
- TEST/RESULT remain absent from structural graph artifacts
- decisions/knowledge have explicit adapters and rendering paths

### Sync

- matching double-read -> candidate accepted
- mismatched fingerprint -> last valid snapshot preserved
- changed surface hash failure -> last valid snapshot preserved
- READY -> DATA_UNAVAILABLE clears the old active surface atomically
- unchanged surfaces are not unnecessarily re-fetched
- receipt lists exact changed surfaces

### Public safety

- forbidden private fields do not appear in any public surface fixture
- Olympus person-level/private records are excluded

### Existing quality gates

- full `npm test`
- typecheck
- production build
- current Pages/route smoke tests
- current deployment/function-budget tests remain green

## 17. Delivery sequence

Implementation is split into four reviewable commits/phases:

### Phase A — Spatial Canvas and structural navigation contract

Make Canvas 2.5D the single default renderer, remove the public renderer toggle, improve depth/label/edge composition, add expandability/childCount derivation and remove empty-subgraph navigation paths.

### Phase B — public multi-surface contracts and sync

Add manifest V2, per-surface artifacts, validation, atomic live sync and receipts.

### Phase C — Observatory and Laboratory

Add H0-by-stack normalization/charts, quantitative Observatory artifacts, investigative Lab index, hypotheses and decision/knowledge stages.

### Phase D — Cockpit, Activity, Learning and Search

Wire operational/event surfaces, split Learning corpus/runtime, and expand search routing.

Each phase must leave the repository in a testable state. No phase may require a partially deployed later phase to keep current pages functional.

## 18. Rollout

The existing static snapshot remains the fallback throughout migration. Manifest V2 support is additive first; once all consumers are green, the old Science/Engineering-only manual live overlay can be removed.

Deployment is only attempted after tests, typecheck and build pass on the feature branch. The rework should merge through a pull request rather than direct-to-main mutation.
