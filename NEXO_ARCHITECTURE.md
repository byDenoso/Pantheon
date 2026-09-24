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

## Writer, readers and sync (2026-09-23)

- **Single writer:** `byDenoso/TCC:scripts/nexo_tower.py apply` (local lock -> download -> mutate -> head re-read -> write same file id -> readback -> `repository_dispatch` to Pages). It runs on the operator's machine under the Claude automations (`TCC/automations/`). Credential: an Editor service account on the Tower file only.
- **ChatGPT** reads the Tower through its Drive connector and never writes it. Proposals, hypotheses and learning signals go to the create-only Drive folder `NEXO_INBOX`; the writer applies them.
- **ATLAS (Pages)** reads the Tower from Drive with a Reader-only secret (`NEXO_DRIVE_READER_JSON`) and builds the public projection inside the job. The vault export mirror is a fallback only while that secret is absent. The scheduled cron is a slow reconciler (GitHub runs it every few hours); the writer's dispatch is the sync path.
- **Drift check:** `nexo_tower.py status` compares the Tower `state_fingerprint` with the published `tower-projection/manifest.json` and reports `CURRENT` or `OUTDATED`.
- **Meaning:** `TCC/runtime/nexo_agent_api/contracts/SEMANTIC_TAXONOMY_V1.json` (Git contract). Every projected test/campaign carries a resolved `semantic` block; the ATLAS renders domains/stations from it.
- **MCP:** optional and currently not hosted. No consumer needs it: ChatGPT reads the Tower through its Drive connector and proposes via `NEXO_INBOX`; Claude automations use `nexo_tower.py`; ATLAS reads Drive in the Pages build. The Railway service is retired (trial). If a hosted MCP is ever needed, revive the free Vercel `nexo-atlas-control-tower` endpoint as a read-only view of the live Tower; mutations still go only through the writer.

Current Atlas V3 design: `docs/superpowers/specs/2026-09-14-atlas-neural-v3.md`.

Historical sovereign architecture: `docs/superpowers/specs/2026-09-13-nexo-sovereign-architecture.md`.

## Expansion (adding a domain, subdomain or automation)

Nothing in the UI or compilers lists domains by hand.

1. **New domain/subdomain/topic:** add it to `TCC/runtime/nexo_agent_api/contracts/SEMANTIC_TAXONOMY_V1.json` (Git contract, PR). Optionally add a tint in `nexo-one/src/viewmodels/galaxy-morphology.mjs` (`DOMAIN_TINTS`); otherwise a neutral tint is used.
2. **Entities:** create TEST/CAMPAIGN/HYPOTHESIS/LESSON through `nexo_tower.py apply` with a `semantic` block using the new ids. Roadmaps and indexes are documents and use `{"document": "roadmaps/X.json", "merge": {...}}` in the same apply.
3. **ATLAS:** the projection carries the taxonomy tree and resolved `semantic`; the galaxy compiler gives every visual domain an arm whose mass, length, thickness, fragmentation and bridges come from the data (fixed constants, comparable snapshots). No front-end change is needed.
4. **Automations:** playbooks live in `TCC/automations/`; new inbox kinds are ignored with a log until a playbook handles them. The frontier (`nexo_tower.py frontier`) reads V1 (inline tests) and V2 (`frontier_refs`) roadmaps and reports invalid ones instead of failing.

