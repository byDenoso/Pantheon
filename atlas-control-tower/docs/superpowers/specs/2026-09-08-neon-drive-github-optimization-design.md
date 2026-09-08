# NEXO Neon · Drive · GitHub Optimization Design

Date: 2026-09-08

## Objective
Reduce operational entropy across Neon, Google Drive, and GitHub while preserving authority, provenance, reversibility, and auditability.

## Authority matrix
- `science_v1`: mutable scientific Truth Owner.
- `learning_v1`: learning Truth Owner.
- `nexo_ops`: operational/Black Box Truth Owner.
- `olympus`: operational Olympus Truth Owner.
- Google Drive: evidence, documents, datasets, artifacts, frozen/legacy history, provenance bytes.
- GitHub/Pantheon: source code, tests, migrations, versioned infrastructure.
- Atlas: read-only projection only.

## Scope
1. Inventory Neon project/branches/schema/tables/indexes/constraints/usage and query paths.
2. Inventory NEXO Drive hierarchy, canonical evidence, historical/legacy material, duplicate candidates, and referenced/unreferenced Drive IDs.
3. Inventory Pantheon branches, PRs, workflows, dead code/assets/configuration and migration drift.
4. Reconcile Neon source references against Drive and GitHub runtime/schema assumptions.
5. Apply non-destructive corrections automatically. Destructive removals, branch deletion, or migration finalization remain explicit-gate operations.
6. Record consolidated changes in `nexo_ops` Black Box and perform final readback.

## Neon design
- Keep one NEXO project; treat the unrelated `pendencias` Neon project as out of scope except for inventory classification.
- Treat the current default branch as canonical database branch; old migration branches are candidates for cleanup, never auto-deleted.
- Prefer measured query tuning over speculative indexes.
- Do not delete Black Box history to save marginal storage.
- Legacy `public` read-model/snapshot tables are ancestry unless active runtime usage is proven.
- Semantic index coverage must be measured per source system and against every referenced Drive ID.

## Drive design
- Do not move mutable state back into Drive.
- Use existing NEXO hierarchy. Do not create a parallel root.
- Classify Drive objects as CANONICAL, VALID_HISTORICAL_COPY, OLDER_REVISION, EXACT_DUPLICATE, SEMANTIC_DUPLICATE, LEGACY_READONLY, or UNREFERENCED.
- File IDs remain stable references. Avoid renames/moves unless they materially improve clarity and all consumers are validated.
- Every Drive reference used by Neon must resolve to an accessible file/folder or be explicitly reported broken.

## GitHub design
- `main` remains code Truth Owner.
- Classify every branch into ACTIVE, KEEP, SAFE_TO_DELETE, NEEDS_MERGE, or UNKNOWN. Never delete without explicit confirmation.
- Close only clearly obsolete temporary PRs when closure is reversible and the PR itself states it should not be merged.
- Reduce workflows to active quality/build purposes. Disabled one-shot workflows are candidates for removal only after verifying no current consumer.
- Keep migrations versioned with the code they support.
- Prefer behavioral tests over whitespace/string-format contracts.

## Cross-system reconciliation
For every relevant entity/test/run/result/source:
- Neon record -> Drive evidence/provenance -> GitHub implementation when applicable.
- Detect broken Drive references, Drive evidence with no projection, code that references obsolete schema/routes, and documentation/runtime drift.
- Never invent scientific graph relations to improve cosmetic connectivity.

## Safety
- No project deletion, branch deletion, evidence deletion, or destructive SQL without explicit user confirmation.
- Material schema/index changes are tested on a Neon temporary branch before promotion.
- Black Box records are grouped by meaningful operation rather than micro-events.

## Acceptance
- Truth Owner matrix remains intact.
- Referenced Drive IDs resolve or have an explicit blocker.
- Semantic coverage is measured with zero unexplained indexable orphans.
- Main runtime queries are measured and avoid avoidable full hydrations where practical.
- GitHub open PRs/workflows/branches are classified and obvious reversible clutter is reduced.
- CI/readback are green for any committed code change.
- Black Box contains the optimization operation summary and validation evidence.
