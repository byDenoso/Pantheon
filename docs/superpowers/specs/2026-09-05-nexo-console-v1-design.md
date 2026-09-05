# NEXO Console V1 — Design

## Goal
Turn the existing NEXO Atlas into one operational app that makes current work, material changes, evidence, capabilities and system topology visible without creating a parallel truth source.

## Scope
V1 contains five surfaces inside one app:

- **NOW** — current state of SCIENCE, ENGINEERING and OLYMPUS; material activity and attention.
- **ACTIVITY** — Flight Recorder focused on material runs and causal progression.
- **EVOLUTION** — measured architecture/runtime changes and baseline status; never fabricate gains.
- **CAPABILITIES** — PASS / PENDING / UNVERIFIED capability matrix.
- **SYSTEM** — preserve Atlas/topology as a secondary view, showing the current 3-task architecture by default and historical retired roles only when requested.

The first release does not add write controls to canonical sources and does not add a new scheduler, agent, database or truth owner.

## Truth and data flow
Canonical sources remain unchanged:

- SCIENCE → PEER Control Tower / canonical scientific state.
- ENGINEERING → Git/GitHub for code and Vercel/runtime for live behavior.
- OLYMPUS → Olympus Drive/Ledger.
- NEXO operational actions/signals/effects/runs/capabilities → ACTION_REGISTER.

`Neon.nexo_ops` remains a derived/reconstructible read model. The app reads Neon for fast current-state rendering, then exposes provenance pointers for drill-down. If Neon diverges, canonical sources win.

Data flow:

`canonical sources -> existing NEXO projection -> nexo_ops -> NEXO Console`

No new recurring sync mechanism is introduced. The existing Continuity projection remains the automatic refresh owner. The app's refresh button re-reads the latest projection and reports deltas versus the browser snapshot; it does not pretend to mutate Drive.

## Runtime integration
The serverless API must try database environment variables in this order:

1. `DATABASE_URL`
2. `POSTGRES_URL`
3. `NEON_DATABASE_URL`

If none exists or Neon is unavailable, return an explicit fallback payload with `source=EMBEDDED_FALLBACK`, `sync.state=DEGRADED`, and a machine-readable reason. Never silently label fallback data as live.

## UI behavior
The app is desktop-first and responsive.

### NOW
Show three domain cards, sync/freshness, material-change counts, attention items and recent material flights. Heartbeats and routine NO_OP runs are visually de-emphasized.

### ACTIVITY
Each flight exposes:

`signal/context -> decision -> action -> effect -> evidence/readback`

When a stage is absent, show it as not reached rather than inventing it.

### EVOLUTION
Show only measured or explicitly recorded changes. Initial examples include:

- runtime architecture `5 tasks -> 3 tasks`;
- active-prompt size `40,452 -> 18,910 chars (-53.3%)` from canonical runtime optimization state;
- tool-call baselines and shadow comparisons with `COLLECTING BASELINE` until gates close.

### CAPABILITIES
Render capability rows grouped by domain/runtime with clear state and evidence pointer. Pending real-action proofs remain pending.

### SYSTEM
Render current topology:

- Continuity
- Scientific Core
- Executor
  - SCIENCE
  - ENGINEERING
  - OLYMPUS

Journal and Guardian are retired/merged historical nodes, hidden by default behind a historical-architecture toggle.

## Provenance
Every action, event or capability detail that has a source pointer must display it. Provenance is part of the product, not hidden debug metadata.

## Error handling
- Database absent/unreachable → fallback with visible degraded banner.
- Projection stale → show last synced time and stale state.
- Partial records → render available fields and mark missing stages as unavailable.
- API failure → retain last successful browser snapshot and show refresh failure without clearing the UI.

## Testing
Use Node's built-in test runner for data-shaping and status logic. UI smoke tests verify required DOM markers in generated/static files. Serverless querying logic is separated so tests can validate mapping without requiring live Neon.

## Deployment and source
Git becomes the source of code. Implementation is developed on `feat/nexo-console-v1`. Production deployment targets the existing Vercel project `nexo-research-os-live`; no new app/project is created unless the existing deployment path proves impossible.
