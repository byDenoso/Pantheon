# NEXO GitHub / Pantheon Audit · 2026-09-08

## Authority

Repository: `byDenoso/Pantheon`.

`main` is the code Truth Owner for active source, tests, migrations and versioned infrastructure. Runtime/DB truth remains in its domain-specific Neon schema; GitHub does not replace Science/Learning/Olympus state.

## Inventory

GitHub returned **47 branches** across two pages at audit time.

Latest `main` observed during the audit advanced concurrently from `cebdaf08...` (Durable Runner bridge) to `c3666014...` (`docs(atlas): version Durable Runner Neon grants`). The audit treats this as legitimate concurrent change and does not overwrite it.

### Active / preserve

| Branch | Head | Class | Reason |
|---|---|---|---|
| `main` | current moving head | ACTIVE | code Truth Owner |
| `ops/nexo-infra-audit-20260908` | audit branch | ACTIVE | this audit/cleanup PR |
| `atlas-cosmic-command-center-20260908` | `2b2f79c...` | ACTIVE / NEEDS_MERGE_REVIEW | recent work; comparison with current main is diverged, 2 ahead / 2 behind |
| `feat/nexo-console-v1` | `02f034b...` | KEEP / REVIEW | distinct product surface, no deletion evidence established |
| `nexo-desi-falsification-temp-20260826` | `0f253b0...` | KEEP / REVIEW | scientific/experimental branch; do not infer obsolescence |
| `ops/mpi-dependency-builder-20260821` | `cb68f03...` | KEEP / REVIEW | operational work with potentially unique commits |
| `ops-vercel-fix-20260817` | `10c778b...` | KEEP / REVIEW | deployment ancestry; unique SHA |
| `project-atlas-v5` | `9827552...` | KEEP / HISTORICAL_PRODUCT | distinct historical line |
| `project-atlas-v6-cloud` | `7d39682...` | KEEP / HISTORICAL_PRODUCT | distinct historical line |

### Merged-feature branches: safe deletion candidates after explicit approval

These branches correspond to work already merged through PRs or superseded in `main`; their branch refs are redundant, while their commits remain in Git history:

- `feat/atlas-source-links-tower-wide-20260908` (merged PR #11)
- `feat/atlas-ux-command-center-20260908` (merged PR #12)
- `feature/atlas-command-center-20260907` (merged PR #6)
- `feature/atlas-observatory-v2-20260907` (merged PR #7)
- `feature/atlas-reference-one-20260907` (merged PR #9)
- `fix/atlas-layout-audit-20260907` (merged PR #10)
- `atlas-olympus-detection-20260907` (merged PR #8)
- `atlas-semantic-index-20260907` (merged PR #5)
- `atlas-theme-cyberuniverse` (merged PR #4 through its integration chain)
- `nexo-durable-runner-v1` (merged PR #13)

No branch ref was deleted in this audit because branch deletion is destructive and remains an explicit gate.

### Exact-SHA branch duplication

The repository contains several branch-name aliases pointing to identical commits, pure namespace entropy:

**9 branches at `c9b855202bedb5fd274bc156776df3e58250b9c5`:**
- `atlas-premium-v2-20260907-finalwork`
- `atlas-premium-v2-20260907`
- `atlas-premium-v2-final-20260907`
- `atlas-premium-v2-impl2-20260907`
- `atlas-premium-v2-impl3-20260907`
- `atlas-premium-v2-impl4-20260907`
- `atlas-premium-v2-impl5-20260907`
- `atlas-premium-v2-impl-20260907`
- `atlas-premium-v2-work-20260907`

Separate related-but-not-identical branches remain review-only: `atlas-premium-v2-impl6-20260907` (`688b472...`) and `atlas-premium-v2-progressive-20260907` (`d8accc2...`).

**3 branches at `260fe3c213eac56bc07c05f0c3875c4b56f27fdc`:**
- `atlas-v7-deploy-transport`
- `atlas-v72-deploy-transport`
- `atlas-v721-deploy-transport`

**2 branches at `415601e53ed18129702f4fda837873b737a3c38e`:**
- `atlas-static-transport`
- `peer-studio-mark-iii-preview`

These alias groups are high-confidence branch-deletion candidates after explicit approval because deleting refs does not delete the shared commit object.

## Pull requests

Before cleanup, two ancient draft PRs remained open despite declaring themselves non-merge work:

- PR #1 `Trigger Project Atlas v3 migration`: body explicitly said `Do not merge this PR into main`.
- PR #2 `Build Project Atlas standalone Windows app`: body explicitly said `PR temporário e não destinado a merge`.

Both were **closed, not merged**. Closure is reversible; their branches and commits were preserved.

After the safe cleanup, the only open PR owned by the user in Pantheon was this audit PR (#14).

## Workflow audit

### Removed

`.github/workflows/apply-project-atlas-v3.yml`

It contained only a manual dispatch job that printed:
- migration disabled;
- use a dedicated repository.

The one-shot PR it supported was explicitly non-merge and has now been closed. No active code reference to the workflow was found. Keeping it would preserve obsolete instructions and encourage repository sprawl.

### Retained

`.github/workflows/atlas-quality.yml`

Retained because it is the active Node 24 test/contract gate and still packages `atlas-control-tower/` as a one-day verified artifact used by the current non-Git-linked Vercel deployment workflow.

## TDD evidence for workflow cleanup

A behavioral contract was added in `atlas-control-tower/test/workflow-governance.test.mjs`:
- retired one-shot workflow must be absent;
- Atlas Quality must remain present and retain Node 24 / PR test behavior.

RED:
- Atlas Quality run #103 failed while `apply-project-atlas-v3.yml` still existed.

GREEN:
- after deleting only that workflow, Atlas Quality run #104 succeeded.

This demonstrates that the cleanup changed exactly the intended workflow state instead of merely editing YAML cosmetically.

## Runtime/schema drift scan

Current Atlas runtime references `science_v1`, `learning_v1`, `nexo_ops`, `olympus`, and `flight_api`, matching the live Neon default branch.

The newly merged Durable Runner bridge uses an explicit allowlist for reads and restricts writes to Black Box receipts/checkpoints. The following `main` change also versioned the minimal Neon grants for `nexo_ops.execution_runs` and `nexo_ops.runtime_events`, preserving authority boundaries.

No live GitHub search result was found requiring the old `public.snapshots` / `public.sync_changes` read model; those remain database legacy candidates rather than code dependencies.

## Frontend / asset drift

The previous layout repair already removed the dead runtime `readability.css` request and the active asset contract is covered by the Atlas manifest/layout tests. No additional frontend asset was removed during this infrastructure audit.

## Before / after

| Metric | Before | After safe cleanup |
|---|---:|---:|
| open obsolete non-merge PRs | 2 | 0 |
| active open audit/work PRs | 0 | 1 (#14) |
| obsolete one-shot workflow files | 1 | 0 |
| active Atlas quality workflow | 1 | 1 |
| branch refs deleted | 0 | 0 |
| exact-SHA redundant branch refs identified | 14+ | 14+ classified |

## Explicit destructive gate

Branch deletion is intentionally not included in this PR. The merged-feature branches and exact-SHA alias groups above can be deleted in a later one-shot cleanup after explicit approval, with `main`, current active branches and unique scientific/ops branches excluded.
