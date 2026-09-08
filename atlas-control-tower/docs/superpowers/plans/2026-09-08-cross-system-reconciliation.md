# Cross-System Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove Neon ↔ Drive ↔ GitHub consistency, apply remaining non-destructive repairs, and close with Black Box/readback evidence.

**Architecture:** Build a traceability matrix from canonical Neon records outward to Drive evidence and GitHub implementation. Only canonical evidence creates relationships; projections remain derived. Finish by recording one consolidated operational event in `nexo_ops`.

**Tech Stack:** Neon PostgreSQL, Google Drive, GitHub/Pantheon, Atlas API.

**Spec:** `atlas-control-tower/docs/superpowers/specs/2026-09-08-neon-drive-github-optimization-design.md`

## Global Constraints
- No duplicate Truth Owners.
- No invented relations.
- No destructive cleanup without explicit approval.
- Final claims require fresh readback evidence.

---

### Task 1: Traceability matrix

**Files:**
- Create: `atlas-control-tower/docs/audits/2026-09-08-cross-system-readback.md`

- [ ] **Step 1: Build canonical source families**

Include Science entities/results/tests, Learning records, Black Box actions/runs/events, Olympus people/state/events, Drive evidence IDs, and GitHub runtime/migration references.

- [ ] **Step 2: Validate Neon -> Drive**

For every distinct Drive ID referenced by current Truth Owner schemas, verify Drive metadata resolution and semantic `drive:<id>` projection where indexable.

- [ ] **Step 3: Validate Drive -> Neon for active evidence**

For current result/prereg/evidence files under active NEXO project folders, verify source/provenance/index presence or classify why no projection is required.

- [ ] **Step 4: Validate GitHub -> Neon schema assumptions**

Search live runtime code for schemas/tables/routes and compare against the default Neon branch. Any mismatch is fixed through code or versioned migration, never by undocumented production drift.

### Task 2: Authority and orphan readback

**Files:**
- Update: `atlas-control-tower/docs/audits/2026-09-08-cross-system-readback.md`

- [ ] **Step 1: Read `nexo_ops.truth_states`**

Confirm science, learning, ops and Olympus owners match the authority matrix.

- [ ] **Step 2: Re-run semantic coverage by system**

Report expected canonical object counts, indexed canonical counts, source projection counts and unexplained missing counts separately.

- [ ] **Step 3: Re-run source-reference coverage**

Report referenced Drive IDs, resolved IDs, broken IDs and index projection coverage.

### Task 3: Black Box record

**Files:**
- None outside database unless a migration is required.

- [ ] **Step 1: Insert one consolidated runtime event**

Use `nexo_ops.runtime_events` with event type `INFRA_OPTIMIZATION`, component `NEXO_INFRA`, domain `OPS`, status matching actual outcome, a concise summary, `source_kind='GITHUB'`, `source_id='byDenoso/Pantheon'`, and payload containing before/after metrics, PR/commit refs and gated leftovers.

- [ ] **Step 2: Read back the inserted event by event_id**

Confirm payload, occurred_at and source fields exactly.

- [ ] **Step 3: Ensure semantic/index projection policy is respected**

Index the Black Box event only if current Black Box projection rules require runtime events to be searchable; otherwise document why it is intentionally absent.

### Task 4: Final verification and merge

- [ ] **Step 1: Run GitHub CI for the audit/cleanup PR**

Expected: Atlas Quality green.

- [ ] **Step 2: Read Atlas health**

Expected: `science_v1` live, semantic index available, no regression.

- [ ] **Step 3: Write before/after table**

Include semantic coverage, orphan entities, broken Drive refs, duplicate candidates, stale branches, obsolete PRs, redundant workflows, legacy storage candidates and measured query timings.

- [ ] **Step 4: Merge only the verified non-destructive code/docs changes**

Destructive candidates remain unexecuted until separately approved.
