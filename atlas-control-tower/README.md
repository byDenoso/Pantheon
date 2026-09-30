# NEXO Atlas Control Tower

ATLAS is the read-only visualization and inspection surface for NEXO.

## Authority

Operational truth is owned exclusively by the live Tower in Google Drive:

`TOWER_V06@GOOGLE_DRIVE_PRIVATE`

The live object keeps the stable file identity `1m97cFmEkw19yiqD_6FWPG4j1lDCAYM4z` under contract `NEXO_TOWER_LIVE_V1`. The canonical write model is `IN_PLACE_FILE_REVISION_CAS_READBACK`. Git is code/provenance only after the Drive-primary cutover. ATLAS does not own operational state and cannot write back into TOWER.

The locator contract is `nexo-one/data/canonical.json` (`NEXO_ATLAS_AUTHORITY_V2`) and the public projection is derived from the live Tower. Neon, Git state mirrors, deployment runtimes and caches are compatibility or derived surfaces only. None can override TOWER_V06.

## Hosted NEXO MCP

The current Business-facing MCP is the thin read-only NEXO ONE surface:

`https://nexo-one-two.vercel.app/api/mcp`

Health/discovery can be checked at `https://nexo-one-two.vercel.app/api/mcp/status`. This surface reads the sanitized Tower-derived projection and exposes science, activity, public-safe operations and provenance. It does not mutate canonical state.

The former Atlas Control Tower semantic endpoint at `https://nexo-atlas-control-tower.vercel.app/api/mcp` is a retired compatibility surface after the Drive-primary cutover. It must not be configured as the Business app or treated as a canonical write path.

Canonical mutations keep the existing path `proposal -> relay -> Writer -> live Tower CAS/readback`. GitHub and Google Drive connectors remain the operational fallback when the Business MCP is absent. No MCP-local database, queue, scheduler or second writer exists. If any MCP or projection disagrees with Tower, **TOWER_V06 wins**.

## Read path

```text
Drive: NEXO_TOWER_LIVE.json
          |
          v
       TOWER_V06
          |
          +--> sanitized projection --> ATLAS
          |
          +--> NEXO ONE MCP (read-only)
```

Public state, graph and entity routes are served through the Tower-aware projection runtime. Existing GitHub/Drive-named modules may remain as compatibility adapters, but their names do not grant authority.

If the current projection cannot be refreshed, ATLAS preserves the last valid sanitized snapshot and marks it stale/degraded. It must not invent replacement truth.

## Product boundary

ATLAS provides:

- structural graph navigation;
- science/program/campaign read models;
- Learning and inter-domain overlays;
- Operations, audit, provenance and health views;
- source links and bounded drill-down;
- static GitHub Pages artifacts plus compatible serverless read routes.

Personal Olympus/client health data must never enter the public projection. Derived geometry, graph position and semantic similarity are navigation aids, not scientific evidence.

## API compatibility

Primary public read routes include:

```text
GET  /api/state
GET  /api/graph
GET  /api/entity
GET  /api/health
GET  /api/learning
GET  /api/audit
GET  /api/ops
POST /api/sync
```

`POST /api/sync` is a projection refresh operation, not a canonical mutation. It cannot alter TOWER_V06.

## Runtime

The browser product is a Vite/React application with a route-scoped spatial graph renderer. GitHub Pages is a supported static production target. Vercel compatibility routes may also serve the read model, but deployment providers are not state authorities.

No scheduler, database, cache, MCP, API gateway, or UI runtime is allowed to become a second NEXO truth store.

## Development

From `atlas-control-tower/`:

```bash
npm ci
npm test
npm run typecheck
npm run build
```

The Atlas Quality workflow must pass unit/contract tests, TypeScript checks and the production build before merge. Browser/release verification is performed by the NEXO ONE CI workflow.

## UGI cutover

NEXO UGI Core keeps API and MCP as semantic interfaces over the same canonical state. ATLAS remains downstream of that architecture:

```text
UGI Core
   |
API / MCP
   |
NexoService
   |
TOWER_V06
   |
ATLAS read-only projection
```

On disagreement between ATLAS, Drive, runtime checkpoints, caches, model context or TOWER_V06, **TOWER_V06 wins**.
