# NEXO Atlas Control Tower

ATLAS is the read-only visualization and inspection surface for NEXO.

## Authority

Operational truth is owned exclusively by:

`byDenoso/NEXO-Obsidian-Vault@main:TOWER_V06`

The canonical write model is `GITHUB_CAS_ENTITY_EVENT`. ATLAS does not own operational state and cannot write back into TOWER.

The locator contract is `nexo-one/data/canonical.json` (`NEXO_ATLAS_AUTHORITY_V2`). It points at `TOWER_V06/CONTROL.json` and separately identifies sanitized projection artifacts used by the public UI.

Google Drive is legacy projection/provenance only. Neon and old Data API surfaces are legacy compatibility code, not current NEXO truth owners. A projection, cache, deployment runtime, or fallback can never override TOWER_V06.

## Hosted NEXO MCP

The canonical hosted NEXO MCP front door is:

`https://nexo-atlas-control-tower.vercel.app/api/mcp`

It is a semantic transport over the existing Tower/GitHub/runtime contracts, not a state authority. The endpoint exposes public capability/bootstrap discovery and authenticated semantic operations for canonical work, campaigns, runtime dispatch/readback, evidence and health incident lifecycle.

Public discovery never grants mutation authority. Private semantic reads and mutations require bearer authentication, and Tower writes fail closed when an authorized server-side GitHub credential is absent. Canonical mutations continue through `TOWER_V06/mutations/inbox` -> receipt -> exact entity readback; runtime execution continues through canonical launch requests and SingleRuntime.

`byDenoso/NEXO-Obsidian-Vault/services/nexo-api` remains useful as runtime/reference/test code, but its separate Railway-oriented host is not required for the normal hosted MCP path after this consolidation.

No MCP-local database, queue, scheduler or second writer exists. If the MCP disagrees with Tower, **TOWER_V06 wins**.

## Read path

```text
TOWER_V06
   |
   +-- canonical state / provenance
   |
   +--> sanitized projection
              |
              v
           ATLAS
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
