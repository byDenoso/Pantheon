# NEXO Canonical Architecture

The sole operational truth owner is:

`byDenoso/NEXO-Obsidian-Vault@main:TOWER_V06`

`TOWER_V06/CONTROL.json` is the canonical control-plane declaration. The operational write model is `GITHUB_CAS_ENTITY_EVENT`.

Pantheon owns code, contracts, projection logic, validation and presentation. ATLAS is a read-only projection and cannot write operational truth.

Google Drive is not an operational SSOT. It may remain an evidence/artifact/dataset provider and legacy projection/provenance surface, but it cannot override TOWER_V06 and Drive writeback to truth is forbidden.

Required Atlas V3 read path:

`TOWER_V06 -> Atlas Projection V3 -> immutable fingerprinted snapshot -> Atlas Data SDK -> Atlas Neural V3`

Projection failures preserve the last valid snapshot. Projection state must remain distinguishable from canonical state.

Public projections are allowlist-based. Personal Olympus/client health data must not enter the public Atlas projection.

The previous Drive-as-mutable-SSOT architecture is superseded for operational state by the active TOWER_V06 authority contract.

Current Atlas V3 design: `docs/superpowers/specs/2026-09-14-atlas-neural-v3.md`.

Historical sovereign architecture: `docs/superpowers/specs/2026-09-13-nexo-sovereign-architecture.md`.
