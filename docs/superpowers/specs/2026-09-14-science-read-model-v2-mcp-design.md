# Science Read Model V2 + NEXO MCP Design

## Goal

Create one canonical read model for scientific state that is produced from Google Drive/SSOT, versioned through deterministic projection ledgers, consumed identically by Atlas Pages and NEXO One, and exposed read-only through a new MCP endpoint. The design must also eliminate the current false-empty states caused by stale DOMAIN-centric readers after the canonical Science hierarchy moved to Program → Campaign.

## Authority and responsibility boundaries

- Google Drive remains the Truth Owner for scientific and operational source records.
- GitHub remains code/contract authority and may carry generated public snapshots/projections.
- The ingestion layer reads and normalizes source data. It does not synthesize scientific claims.
- The Diff Engine determines record-level change from stable identity plus content hash.
- The Projection Ledger remembers what has previously been observed.
- The Activity Ledger records deltas between observations.
- Science Read Model V2 represents the current normalized scientific read state.
- Synthesis derives only from data explicitly available in SRM V2 and must preserve provenance and missingness.
- Atlas, NEXO One API and NEXO MCP are read-only consumers of the same SRM V2 contract.
- No client or MCP tool writes back to the SSOT in this version.

## End-to-end flow

```text
Google Drive / SSOT
        ↓
Ingestion Reader
        ↓
Normalizer + source validation
        ↓
Diff Engine
        ↓
Projection Ledger ──────┐
        ↓               │
Activity Ledger ◀───────┘
        ↓
Science Read Model V2
        ↓
Dependency-aware synthesis
        ↓
Projection Manifest
        ↓
Independent readback
        ↓
Atomic promotion
        ↓
Atlas Pages / NEXO One API / NEXO MCP
```

A failed validation, hash mismatch or readback mismatch never replaces the last valid promoted state.

## Source ingestion

The source reader must discover the current scientific shards instead of assuming that the canonical science index always carries a populated `shards` map. Discovery order:

1. explicit shard catalog from the source projection when present;
2. known generated shard artifacts under `data/science-drive-projection/*.json`;
3. fail as `DATA_UNAVAILABLE` if neither can prove the shard set.

Each shard descriptor contains:

```ts
type ShardDescriptor = {
  id: string;
  path: string;
  sha256: string;
  sourceVersion?: string;
  declaredCount?: number;
  includedCount: number;
  truncated: boolean;
  state: 'READY' | 'DATA_UNAVAILABLE' | 'PARTIAL' | 'STALE' | 'ERROR';
};
```

A campaign declaring tests while no corresponding source shard can be proven must not silently become zero tests.

## Stable identity and hashing

Each investigation record uses its canonical ID as stable identity, e.g. `T-PEER-...` for a test.

`record_hash` is SHA-256 over a canonical JSON projection of scientifically meaningful public fields. For tests the minimum set is:

- `id`
- `primaryCampaign`
- `domains`
- `status`
- `summary`
- `keyMetrics`
- `evidenceClass`
- `sourceRef`
- `lastVerified`

Ordering is canonicalized before hashing.

## Projection Ledger

The Projection Ledger is durable state used only to compare observations over time. It does not become scientific authority.

```ts
type ProjectionLedgerEntry = {
  entityId: string;
  entityType: string;
  firstSeenAt: string;
  lastSeenAt: string;
  sourceCreatedAt?: string;
  sourceUpdatedAt?: string;
  firstHash: string;
  currentHash: string;
  previousHash?: string;
  revision: number;
  campaignId?: string;
  domains: string[];
  state: 'PUBLISHED' | 'UNPUBLISHED';
};
```

`firstSeenAt` means first observation by NEXO, not source creation time. `sourceCreatedAt` is only populated when the source explicitly provides it.

## Diff Engine

For every normalized entity:

- missing previously, present now → `ADDED`
- present previously, hash changed → `UPDATED`
- campaign/domain membership changed → `RELINKED` in addition to `UPDATED`
- present previously, absent now → `UNPUBLISHED`
- same ID and same hash → `UNCHANGED`

The engine emits deterministic deltas and increments revision only for changed records.

```ts
type ProjectionDelta = {
  eventType: 'ADDED' | 'UPDATED' | 'RELINKED' | 'UNPUBLISHED';
  entityId: string;
  entityType: string;
  observedAt: string;
  previousHash?: string;
  currentHash?: string;
  revision: number;
  campaignId?: string;
  domains: string[];
};
```

## Activity Ledger

The Activity Ledger stores the user-visible consequences of projection deltas. Initial event kinds include:

- `TEST_ADDED`
- `TEST_UPDATED`
- `TEST_RELINKED`
- `TEST_UNPUBLISHED`
- `CAMPAIGN_CHANGED`
- `SYNTHESIS_CHANGED`
- `SURFACE_CHANGED`

Activity events reference source deltas and retain provenance. They are append-only within generated projection history.

## Science Read Model V2

Contract name: `NEXO_SCIENCE_READ_MODEL_V2`.

```ts
type ScienceReadModelV2 = {
  contract: 'NEXO_SCIENCE_READ_MODEL_V2';
  generatedAt: string;
  sourceVersion: string;
  fingerprint: string;
  freshness: 'LIVE' | 'SNAPSHOT' | 'STALE' | 'DEGRADED';
  structure: StructureView;
  observations: ScientificObservation[];
  comparisons: ScientificComparison[];
  syntheses: ScientificSynthesis[];
  investigation: InvestigationView;
  activity: ActivityEvent[];
  shards: ShardDescriptor[];
  provenance: Provenance[];
};
```

### Structure

The canonical structural hierarchy is:

```text
SYSTEM → PROGRAM → CAMPAIGN
```

D1…D10 and CROSS remain scientific facets/tags, not structural parents. Readers must never infer absence of science from the absence of DOMAIN nodes in the structural graph.

### Generic observations

```ts
type ScientificObservation = {
  id: string;
  metricId: string;
  label: string;
  kind: 'scalar' | 'interval' | 'distribution' | 'directional' | 'timeseries' | 'matrix' | 'categorical';
  value?: number | string | boolean;
  unit?: string;
  uncertainty?: { low?: number; high?: number; sigma?: number; confidenceLevel?: string };
  stackId?: string;
  stackLabel?: string;
  datasets: string[];
  model?: string;
  programId?: string;
  campaignId?: string;
  testId?: string;
  domains: string[];
  status?: string;
  evidenceClass?: string;
  sourceRef?: string;
  observedAt?: string;
  provenance: Provenance[];
};
```

New metrics such as H0, S8, Ωm, rd, w0, wa, Bayes factors or future quantities enter as data in this schema. They do not require new page contracts.

### H0

H0 is represented with `metricId = "cosmology.H0"`.

If multiple observations exist, Atlas may render a stack forest plot and delta-to-baseline view. Missing uncertainty remains missing. The system must not infer a confidence interval from a bare `±` unless the source explicitly labels its meaning.

### Comparisons

```ts
type ScientificComparison = {
  id: string;
  kind: 'tension' | 'delta' | 'consistency' | 'baseline';
  metricId?: string;
  observationIds: string[];
  value?: number;
  unit?: string;
  significance?: number;
  status?: string;
  summary?: string;
  provenance: Provenance[];
};
```

### Syntheses

Syntheses are explicit records with dependency lists. A synthesis may target campaign, program, domain/facet or global scope.

```ts
type ScientificSynthesis = {
  id: string;
  scope: 'campaign' | 'program' | 'domain' | 'global';
  scopeId: string;
  status: string;
  narrative?: string;
  observationIds: string[];
  comparisonIds: string[];
  evidenceIds: string[];
  dependencyFingerprint: string;
  updatedAt: string;
  provenance: Provenance[];
};
```

Only syntheses whose dependencies changed are recomputed.

### Investigation

The investigation lane remains separate from the structural graph:

```text
hypothesis → claim → test → run → result → evidence → decision → knowledge
```

Tests/results never become normal spatial graph children simply because they exist in SRM V2.

## Rendering registry

Atlas uses a registry by observation kind rather than metric-specific page code:

- `scalar` → Parameter Card
- `interval` → Parameter Card or Forest Plot when grouped
- `directional` → Sky Map
- `timeseries` → Trend plot
- `matrix` → Heatmap
- `distribution` → Distribution plot
- `categorical` → Status/Evidence panel

Custom renderers such as H0-by-stack are optional overrides keyed by `metricId`, not separate data contracts.

## Surface states

Every surface and collection distinguishes:

- `READY`
- `EMPTY`
- `DATA_UNAVAILABLE`
- `PARTIAL`
- `STALE`
- `ERROR`

`EMPTY` means a successful read proved zero records. `DATA_UNAVAILABLE` means the source did not publish enough information to answer. These states must never be conflated.

## Projection Manifest V3

The existing multi-surface manifest evolves to include SRM V2 and ledger descriptors while retaining backward-compatible V2 surface entries during rollout.

The manifest stores:

- global fingerprint
- SRM V2 SHA-256
- per-surface SHA-256
- Projection Ledger SHA-256
- Activity Ledger SHA-256
- shard catalog and counts
- sourceVersion
- generatedAt
- freshness
- completeness

Promotion requires an independent second read of manifest + critical artifacts. Hash mismatch preserves the previous promoted state.

## Atlas changes

- Observatory reads generic observations/comparisons/syntheses from SRM V2.
- Universe Summary derives its cards from SRM V2 instead of searching for DOMAIN nodes.
- Cockpit derives campaign/program counts from `structure` rather than the spatial root graph.
- Laboratory reads `investigation` directly.
- Activity reads Activity Ledger events.
- Existing structural graph remains bounded to systems/programs/campaigns and lazy navigation.
- Existing public privacy rules for Olympus remain unchanged.

## NEXO One API

NEXO One exposes SRM V2 through the existing single Vercel function. API and Pages adapters consume the same contract.

Required read routes:

- `science-read-model`
- `science-changes`
- `science-observations`
- `science-comparisons`
- `science-syntheses`

Existing routes stay available during migration.

## NEXO MCP

A remote MCP endpoint is added to NEXO One at `/api/mcp`, reusing the existing `api/index.js` function so the project does not increase Vercel function count.

Transport: Streamable HTTP.

Version 1 is read-only.

Initial MCP tools/resources:

- `get_science_state`
- `get_changes`
- `search_atlas`
- `get_program`
- `get_campaign`
- `get_observations`
- `get_h0_stacks`
- `get_evidence_chain`
- `get_operations`
- `get_activity`
- `get_provenance`

All MCP results are projections from SRM V2 or existing public operational read models. No tool receives a Drive credential and no MCP method mutates Drive, GitHub or execution state.

The MCP server must reject unsupported write-like calls and expose provenance/freshness in every scientific response.

## Synchronization semantics

Manual Atlas synchronization remains the initial trigger.

```text
Sync → read Drive → normalize → diff → ledgers → SRM V2 → affected syntheses → manifest → readback → atomic promote
```

If no hashes change, result is `NO_CHANGE`.

If any entity/surface changes and readback succeeds, result is `UPDATED` with changed entity/surface counts.

If readback fails, result is `FAILED`, `lastValidPreserved = true`.

Webhook/change notification may be added later only as a trigger optimization. It does not replace deterministic diffing.

## Migration and compatibility

- Keep existing `NEXO_ATLAS_PUBLIC_MANIFEST_V2` readable while Manifest V3 rolls out.
- Existing H0 stack extraction is reused as an initial observation adapter.
- Existing D1…D10/CROSS shard files are discovered even when the canonical science index omits an explicit shard map.
- Existing Observatório and Laboratory contracts remain compatibility adapters over SRM V2 during migration.
- No existing public route loses data before its SRM V2 replacement is verified.

## Error handling

- Missing source credential: `DATA_UNAVAILABLE` or source-specific auth error; do not emit fake empty state.
- Missing shard with declared tests: `PARTIAL`/`DATA_UNAVAILABLE`, never zero.
- Invalid record identity: reject record into projection diagnostics; do not invent an ID.
- Ambiguous metric extraction: retain test/result but omit the observation and record a rejected-observation diagnostic.
- Manifest or artifact hash mismatch: fail promotion and retain previous snapshot.
- MCP backend unavailable: MCP returns tool error with source/readback context; it must not fabricate cached success unless the promoted snapshot itself is the selected source.

## Testing requirements

TDD is mandatory for all implementation changes.

Minimum coverage:

1. shard discovery without explicit index `shards`;
2. declared test count with missing shard yields unavailable/partial, not empty;
3. deterministic test record hashing;
4. ADDED / UPDATED / RELINKED / UNPUBLISHED / UNCHANGED diff behavior;
5. firstSeenAt versus sourceCreatedAt semantics;
6. activity event generation;
7. SRM V2 generic observation extraction including H0 with missing uncertainty;
8. Program → Campaign readers in Cockpit, Observatório and Universe Summary;
9. selective synthesis invalidation by dependency fingerprint;
10. manifest V3 hash/readback/fail-closed behavior;
11. static Pages and live NEXO One adapters returning the same SRM V2 shape;
12. MCP tool discovery and read-only calls;
13. MCP write-like operation rejection;
14. no increase beyond the current single `nexo-one/api/index.js` Vercel function;
15. production browser smoke and public endpoint readback.

## Non-goals

- No autonomous writes to Drive.
- No scientific inference from missing fields.
- No automatic webhook requirement in V2.
- No replacement of the structural Spatial Canvas with test/result nodes.
- No private Olympus/client data in public SRM V2 or MCP.
