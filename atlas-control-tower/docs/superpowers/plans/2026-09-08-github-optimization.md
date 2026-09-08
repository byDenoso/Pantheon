# GitHub Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce Pantheon branch/workflow/code entropy while preserving unique work and keeping `main` as the code Truth Owner.

**Architecture:** Classify before deleting. Apply reversible cleanup such as closing explicitly temporary PRs and removing a proven-dead workflow through a normal PR; branch deletion remains an explicit user-confirmation gate.

**Tech Stack:** GitHub, GitHub Actions, Node 24, Pantheon/atlas-control-tower.

**Spec:** `atlas-control-tower/docs/superpowers/specs/2026-09-08-neon-drive-github-optimization-design.md`

## Global Constraints
- `main` is the code Truth Owner.
- No branch with unique commits is deleted automatically.
- CI must stay green.
- Workflow changes must not break the current Atlas packaging/deploy path without a replacement.

---

### Task 1: Branch and PR classification

**Files:**
- Create: `atlas-control-tower/docs/audits/2026-09-08-github-audit.md`

- [ ] **Step 1: Inventory all branches and current head SHAs**

Group branches that point to the same SHA. Mark exact-main aliases separately.

- [ ] **Step 2: Compare active-looking branches to `main`**

Use GitHub compare for branches with recent feature/ops names or unique SHAs. Classify `ACTIVE`, `KEEP`, `SAFE_TO_DELETE`, `NEEDS_MERGE`, `UNKNOWN`.

- [ ] **Step 3: Inventory open PRs**

Record PR number, title, purpose, merge intent and whether superseded.

- [ ] **Step 4: Close clearly temporary non-merge PRs**

Only close PRs whose own description explicitly states they are temporary/not intended for merge and whose work has been superseded or preserved elsewhere. Closure is reversible.

### Task 2: Workflow audit

**Files:**
- Modify if justified: `.github/workflows/atlas-quality.yml`
- Delete if proven dead: `.github/workflows/apply-project-atlas-v3.yml`
- Update: `atlas-control-tower/docs/audits/2026-09-08-github-audit.md`

- [ ] **Step 1: Search all references to both workflow names and their branch triggers**

Confirm whether `apply-project-atlas-v3.yml` has any active consumer and whether artifact packaging in `atlas-quality.yml` is still required by the current manual Vercel deploy process.

- [ ] **Step 2: Write a failing test/contract for desired active workflow behavior if workflow behavior changes**

Test behavior, not whitespace. The contract should assert that Atlas quality runs for PRs touching Atlas and for `main` pushes if main CI is required.

- [ ] **Step 3: Remove only proven-dead one-shot workflow**

Git history preserves it. Do not remove Atlas packaging if it is still the validated bridge to non-Git-linked Vercel.

- [ ] **Step 4: Run Atlas test suite**

```bash
cd atlas-control-tower && npm test
```

Expected: all tests pass.

### Task 3: Dead-code and migration drift scan

**Files:**
- Update: `atlas-control-tower/docs/audits/2026-09-08-github-audit.md`

- [ ] **Step 1: Search for legacy public read-model table names**

Search for `snapshots`, `sync_changes`, `source_refs`, old Drive/Tower paths and obsolete runtime route names. Distinguish migration/legacy documentation from live runtime references.

- [ ] **Step 2: Search for retired CSS/themes/assets/modules**

Use frontend manifest, HTML imports and module imports as the active graph. Classify unreferenced files as candidates only; remove only when tests prove no runtime/build dependency.

- [ ] **Step 3: Search migrations vs live Neon schema**

Confirm every material current schema addition has a versioned migration or explicit documented cutover. Create migration files only for new changes made in this optimization.

### Task 4: Final GitHub verification

- [ ] **Step 1: Run full Atlas suite on final branch**

```bash
cd atlas-control-tower && npm test
```

- [ ] **Step 2: Open PR against `main`**

Summarize safe cleanup, retained candidates and destructive gates.

- [ ] **Step 3: Require CI green before merge**

Do not merge on a red run.

- [ ] **Step 4: Leave branch-deletion candidates for explicit confirmation**

Provide grouped branch names and SHAs so deletion can be done in one deliberate batch later.
