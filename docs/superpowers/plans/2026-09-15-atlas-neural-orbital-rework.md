# ATLAS Neural V3 — orbital rework + Tower sync

## Goal
Rework `/atlas-v3/` into the approved orbital/galactic graph language while preserving the constitutional boundary: TOWER_V06 owns truth, Atlas is a read-only public projection, and the browser never writes or invents state.

## Delivery slice
1. Replace the flat ring renderer with deterministic orbital clusters around a presentation-only NEXO focus.
2. Keep all canonical nodes/edges sourced from `ATLAS_PROJECTION_V3`; derived cluster hubs remain presentation-only.
3. Add graph search, pan/zoom/reset, label LOD, inspector and six layer overlays without changing authority.
4. Replace the misleading browser “sync” control with honest snapshot reload/status.
5. Replace the frozen bootstrap source with a sanitized Tower hot-set source.
6. Add a deterministic Tower-to-V3 source builder that reads a local authorized Tower checkout and allowlists public fields before anything reaches Pantheon.
7. Keep automatic cross-repository refresh optional/authenticated; absence of a private-repo token must not break public Pages deployment.
8. Extend tests, browser smoke and public readback before merge.

## Verification
- Node contract/unit suite.
- Typecheck + Vite build.
- V3 browser smoke: orbital shell, Tower authority, controls, no retired runtime calls.
- Public Pages readback: V3 manifest/snapshot, current Tower source revision, filament sentinel, operations non-empty, privacy gate.
