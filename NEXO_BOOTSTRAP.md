# NEXO Bootstrap

Read `NEXO_AUTHORITY.json`, `NEXO_SYSTEM_STATE.json`, and `NEXO_ARCHITECTURE.md` before architecture-sensitive changes.

Operational truth is owned exclusively by `TOWER_V06@GOOGLE_DRIVE_PRIVATE`.

Bootstrap current state from the stable Drive live Tower:

- file: `NEXO_TOWER_LIVE.json`
- stable file id: `1m97cFmEkw19yiqD_6FWPG4j1lDCAYM4z`
- contract: `NEXO_TOWER_LIVE_V1`
- write model: `IN_PLACE_FILE_REVISION_CAS_READBACK`

Preserve TOWER_V06 as the sole logical authority. Pantheon/GitHub main owns code, contracts, projection logic and presentation, but not operational state. Atlas is projection-only. Git state is provenance/mirror only and must not be used as a silent fallback for current operational truth.

Historical Drive `CURRENT.json -> SNAPSHOTS/<snapshot_id>` remains rollback/archive lineage only.

Atlas V3 architecture: `docs/superpowers/specs/2026-09-14-atlas-neural-v3.md`.

Historical sovereign architecture remains available for migration context at `docs/superpowers/specs/2026-09-13-nexo-sovereign-architecture.md`.
