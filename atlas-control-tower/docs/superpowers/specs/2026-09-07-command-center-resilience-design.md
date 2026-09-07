# NEXO Atlas Command Center + Resilient Loading Design

## Objective

Turn the existing Atlas home from a graph-first observatory into a decision-first control surface without replacing the current graph, truth boundaries, or Black Box/Learning projections.

The first screen must answer, in this order:
1. What requires attention now?
2. Are the authoritative sources and operational projections healthy?
3. What changed recently?
4. Where should the operator drill down next?

The 3D graph remains the canonical exploration/drill-down surface.

## Constraints

- Atlas remains read-only projection. It must not become a Truth Owner.
- science_v1 remains the mutable scientific Truth Owner.
- learning_v1 remains the learning Truth Owner.
- nexo_ops remains the operational flight-recorder source.
- No new database, schema, agent, scheduler, or recurring loop.
- No dependency additions.
- Existing graph contract remains backward compatible.
- Existing map/filament behavior remains unchanged unless needed for integration.
- Missing auxiliary data must degrade locally, never blank the whole app.

## Architecture

### 1. Command Center UI

Add an independent `ui/control-tower.mjs` module plus `ui/control-tower.css`.

The module consumes already published API surfaces:
- `/api/health`
- `/api/ops`
- `/api/learning`
- current `/api/state` summary when available

It derives presentation-only state:
- health chips for Science, Semantic Index, Black Box and Learning;
- count and short list of material blockers from `ops.actions`;
- run/readback coverage from `ops.counts`;
- recent runtime changes from `ops.events`;
- promoted/active learning items from `learning.emergent.promoted`;
- scientific corpus counts from the state summary when it arrives.

No derived item may be presented as canonical evidence. The UI labels the source/role explicitly.

The command center renders before the graph workspace and includes drill-down actions that focus existing Atlas systems. It does not create a second navigation model.

### 2. Resilient session loading

`lib/graph-session.mjs` currently couples graph and summary through one `Promise.all`. Replace that with independent reads under the same stale-response sequence guard.

Behavior:
- emit `loading` once;
- launch graph and summary reads concurrently;
- when graph resolves, store it and emit `graph` immediately, even if summary is pending or failed;
- when summary resolves, store it and emit `summary` independently;
- graph failure emits `graph-error` and preserves the previous graph;
- summary failure emits `summary-error` and preserves the previous summary;
- `refresh()` waits until both reads settle before resolving, preserving sync semantics;
- stale responses never overwrite newer state.

`app.mjs` splits rendering into graph-dependent and summary-dependent paths so the map is no longer blocked by metrics.

### 3. API timeouts

Reduce the ordinary browser request timeout from 65 seconds to 20 seconds. Keep sync on a separate 65-second timeout because it may legitimately perform a forced refresh.

Timeout behavior remains an error surfaced to the relevant local UI section; it must not clear previously rendered state.

### 4. Fast root and health backend paths

The initial root graph (`system:NEXO`, children mode, depth 1, no filters) is structurally static and does not need a full science_v1 hydration. Add a pure helper that declares the six system nodes and their `CONTAINS` edges and validates whether a query qualifies for this fast path.

`api/runtime.js` returns that graph before calling `loadScience()`.

`/api/health` must probe science_v1 with the existing one-row read and return immediately. If a science graph cache already exists, it may include its fingerprint/sourceVersion; health must not hydrate the full science graph merely to calculate those optional fields.

All deeper graph queries, filtered root queries, science domain queries, state summaries and entity reads continue through the current science projection.

### 5. Visit delta

The Command Center captures the previous `atlas.commandCenterSeenAt` timestamp before loading. Recent runtime events newer than that timestamp are marked as changes since the previous visit. After a successful command-center load, the current timestamp is persisted for the next visit.

This timestamp is a local UX cursor only. It has no authority and is never sent to Neon.

## Error handling

- `health` failure marks source health as unavailable without blocking graph.
- `ops` failure hides blocker/run details and shows Black Box unavailable.
- `learning` failure hides learning deltas only.
- `state` failure leaves corpus metrics in pending/unavailable state while the graph remains interactive.
- Graph failure preserves the prior graph and shows a concise toast.
- No auxiliary failure may trigger a global empty state.

## Testing

Add unit tests for:
- independent graph/summary completion and independent failures in graph-session;
- default vs sync request timeouts in atlas-api;
- command-center model derivation, blocker detection, health states and visit delta;
- fast-root query qualification and root graph shape;
- public frontend manifest includes the new UI assets.

Run the complete Node test suite before promotion.

## Success criteria

- Root graph can render before state summary finishes.
- State summary failure does not remove/block the graph.
- Root graph and health no longer require full science hydration.
- Home visibly surfaces current blockers, source health, readback coverage and recent changes.
- Existing map, Learning and Black Box navigation remain available.
- Full repository test suite passes with no regressions.