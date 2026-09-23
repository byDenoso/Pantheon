# NEXO Canonical Architecture

The sole operational truth owner is:

`TOWER_V06@GOOGLE_DRIVE_PRIVATE`

The canonical live object is the stable Google Drive file `NEXO_TOWER_LIVE.json` (stable file id `1m97cFmEkw19yiqD_6FWPG4j1lDCAYM4z`). Its live contract is `NEXO_TOWER_LIVE_V1` and the operational write model is `IN_PLACE_FILE_REVISION_CAS_READBACK`.

`byDenoso/NEXO-Obsidian-Vault@main:TOWER_V06` is no longer operational state authority. Git remains code and provenance only. Historical `CURRENT.json -> SNAPSHOTS/<snapshot_id>` lineage is retained for rollback/archive and must not silently override the live Tower.

Pantheon owns code, contracts, projection logic, validation and presentation. ATLAS is a read-only derived projection and cannot write operational truth.

Required Atlas V3 read path:

`Drive Live Tower -> Atlas Projection V3 -> validated fingerprinted projection -> Atlas Data SDK -> Atlas Neural V3`

Projection failures preserve the last valid projection while canonical Tower state remains unchanged. Projection state must remain distinguishable from canonical state.

Public projections are allowlist-based. Personal Olympus/client health data must not enter the public Atlas projection.

Canonical mutation loop:

`READ LIVE TOWER -> MUTATE -> VALIDATE -> WRITE SAME FILE ID -> READBACK TOWER -> REFRESH ATLAS -> READBACK ATLAS`

No dual-write to Git is permitted.

Current Atlas V3 design: `docs/superpowers/specs/2026-09-14-atlas-neural-v3.md`.

Historical sovereign architecture: `docs/superpowers/specs/2026-09-13-nexo-sovereign-architecture.md`.
