# NEXO Canonical Architecture

The sole scientific and operational state owner is:

`TOWER_V06@GOOGLE_DRIVE_PRIVATE`

The sole current operating policy reference for the seven NEXO ChatGPT Tasks is the private Google Drive pseudo-MCP document `MCP_RUNTIME_CONTRACT_V1.json` (stable file ID `1XO_V7Cmb75l8zSWCIsaoQGFRssLwLqMB`), especially `control_retirement_transition.current_verified_rules`. The legacy `CONTROL.json` remains in the live Tower only for compatibility with readers and Writer until full code/Task acceptance gates pass; it is not a requirement for independent scientific execution. Existing security mandates stay enforced.

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

## Writer, readers and sync (2026-10-02)

- **Single unattended writer:** `.github/workflows/nexo-writer-robot.yml` uses the canonical Drive bundle reconciled against tested TCC main. Its existing concurrency group serializes that job. Schedule remains `7,22,37,52 * * * *`; the existing dispatch path can wake it.
- **Public proposals:** `TCC@nexo/dispatch-runtime:nexo_persist/requests/<stable_id>.json` -> pinned relay -> `TCC@nexo-inbox` -> Writer. Staging, delivery and application are different stages confirmed by compatible receipts and exact hashes.
- **Write concurrency:** the same stable Drive file is read, compared, PATCHed and read back. `IN_PLACE_FILE_REVISION_CAS_READBACK` is the legacy contract label; the HTTP transport has no demonstrated atomic conditional write. A local lock does not serialize independent machines. Do not start another canonical writer. Source-compatible policy consumers must be migrated and verified before physically retiring `CONTROL`.
- **ChatGPT scientific Tasks:** the live Task scheduler, not this Git file or historical CONTROL, determines enabled identities, roles, cadence and last-run state. The seven specialist Tasks are Energia Escura, CMB Instrumental, Crescimento e Lentes, Geometria Alto Z, Refutação Independente, Cosmology Framework and Editor de Papers; their current enabled/schedule status requires fresh scheduler readback. Producers persist immutable campaign evidence only through their actually authorized private access. Writer alone consolidates Tower.
- **ATLAS (Pages):** current static Pages job builds a publication-filtered shell and deliberately retrieves no private Tower data. Private Tower and public sanitized projections remain separate; an old README describing automatic Tower-to-Pages sync is not proof of an active publication pipeline.
- **Drift check:** `nexo_tower.py status` compares the Tower `state_fingerprint` with the published `tower-projection/manifest.json` and reports `CURRENT` or `OUTDATED`.
- **Meaning:** `TCC/runtime/nexo_agent_api/contracts/SEMANTIC_TAXONOMY_V1.json` (Git contract). Every projected test/campaign carries a resolved `semantic` block; the ATLAS renders domains/stations from it.
- **MCP:** hosted read-only scientific views. No mutation capability is implied; a read does not stage, deliver or apply a proposal. Pages remains the presentation pipeline and existing Vercel endpoints provide compatibility routes.
- **Projection:** producer allowlist; preserve the last valid observation after failure or an incompatible read. Scientific state, attempt, review, decision, revision and freshness remain separate. Polling never refreshes the time of a historical result.
- **C01:** only the explicitly approved readiness-cache adapter on the corrected baseline, with immutable context and verified mandate. Deterministic 10% assignment, maximum 100 candidate evaluations/day for 7–28 days (maximum 2800). Quality counts at least 600 unique units actually evaluated by the candidate with justified independence/strata; controls are excluded. Insufficient sample, monitor loss or failed readback never promotes. Global scientific gates and CAMB/MCMC remain unchanged.
- **Automations:** source-of-truth is the live scheduler, including enabled state, IDs, cadence, runtime permissions and last-run evidence. Seven historical role identifiers in the pseudo-MCP or Git documentation are not scheduler authority. This repository cannot activate Task credentials or schedules; source-code PASS never proves a scheduled scientific run.

Current Atlas V3 design: `docs/superpowers/specs/2026-09-14-atlas-neural-v3.md`.

Historical sovereign architecture: `docs/superpowers/specs/2026-09-13-nexo-sovereign-architecture.md`.

## Native Docs evidence packages (rollout gated)

TCC implements `NEXO_ARTIFACT_PACKAGE_V1` in its existing Writer bundle. Small evidence
packages (up to 128 KiB of original bytes) remain in immutable private campaign Docs,
with Base64 content, original-byte hashes and provenance. Files can be restored by any
executor implementing the contract; no separate raw-file creation, database or service
account storage quota is required.

Producers create and fill Docs outside consumed folders, verify them, then move the
completed evidence to its campaign and the individual proposal to `NEXO_INBOX`.
The proposal's optional `artifact_packages` references are accepted only on the private
Drive ingress. The same singleton Writer reads the evidence, verifies the pinned private
campaign hierarchy and hashes, and catalogs metadata alongside the requested effects.
Unreachable evidence remains pending; a receipt cannot substitute for effect readback.
The existing Writer summary exposes aggregate `evidence_health` age/counts without private
identities. The technical Actions alert still observes workflow outcomes only.

Source availability is not deployment or Task readiness. Before enabling these references,
verify that the existing Writer is running the compatible tested TCC bundle and can read
the campaign Docs. An owner-only campaign requires explicit operator-managed access before
the Writer can consolidate it; code does not change sharing. Scheduled Task capabilities
must be checked in their own runtime, including after a ChatGPT plan migration.
The old spool and raw JSON paths remain compatible within their existing authorization.
No Task, schedule, permission or live Tower mutation is performed by this source change.

## Expansion (adding a domain, subdomain or automation)

Nothing in the UI or compilers lists domains by hand.

1. **New domain/subdomain/topic:** add it to `TCC/runtime/nexo_agent_api/contracts/SEMANTIC_TAXONOMY_V1.json` (Git contract, PR). Optionally add a tint in `nexo-one/src/viewmodels/galaxy-morphology.mjs` (`DOMAIN_TINTS`); otherwise a neutral tint is used.
2. **Entities:** create TEST/CAMPAIGN/HYPOTHESIS/LESSON through `nexo_tower.py apply` with a `semantic` block using the new ids. Roadmaps and indexes are documents and use `{"document": "roadmaps/X.json", "merge": {...}}` in the same apply.
3. **ATLAS:** the projection carries the taxonomy tree and resolved `semantic`; the galaxy compiler gives every visual domain an arm whose mass, length, thickness, fragmentation and bridges come from the data (fixed constants, comparable snapshots). No front-end change is needed.
4. **Automations:** playbooks live in `TCC/automations/`; new inbox kinds are ignored with a log until a playbook handles them. The frontier (`nexo_tower.py frontier`) reads V1 (inline tests) and V2 (`frontier_refs`) roadmaps and reports invalid ones instead of failing.
