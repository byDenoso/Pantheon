# Google Drive Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Classify and simplify the NEXO Drive hierarchy while preserving file IDs, evidence, provenance, and historical auditability.

**Architecture:** Treat `NEXO Research` as the observed working hierarchy, map all Neon-referenced Drive IDs first, then classify other NEXO material. Perform only metadata-safe changes when a file/folder is proven legacy and no consumer depends on its current name/location; never delete evidence automatically.

**Tech Stack:** Google Drive, Docs, Sheets, Neon source references.

**Spec:** `atlas-control-tower/docs/superpowers/specs/2026-09-08-neon-drive-github-optimization-design.md`

## Global Constraints
- Drive remains evidence/provenance, never mutable operational Truth Owner.
- Preserve Drive IDs.
- No evidence deletion.
- Do not create a second NEXO root.

---

### Task 1: Canonical hierarchy inventory

**Files:**
- Create: `atlas-control-tower/docs/audits/2026-09-08-drive-audit.md`

- [ ] **Step 1: Inventory `NEXO Research` root and immediate children**

Record IDs, names, MIME types, parent IDs, modified times and roles for `Comece aqui`, `Projetos`, `Arquivo`, `Sistema`, and other direct children.

- [ ] **Step 2: Inventory NEXO-named folders outside the root**

Search for `NEXO`, `CURRENT_STATE`, `LEGACY_READONLY`, `RESULT_`, `PREREG_`, `EVIDENCE_`, and current scientific test IDs.

- [ ] **Step 3: Identify duplicate-name folders**

For every duplicate title such as `NEXO_READ_MODEL`, inspect metadata and children before classifying.

- [ ] **Step 4: Write classification table**

Use columns: `DRIVE_ID | NAME | PARENT | CLASS | REFERENCED_BY_NEON | ACTION` with classes `CANONICAL`, `VALID_HISTORICAL_COPY`, `OLDER_REVISION`, `EXACT_DUPLICATE`, `SEMANTIC_DUPLICATE`, `LEGACY_READONLY`, `UNREFERENCED`, `UNKNOWN`.

### Task 2: Reference resolution

**Files:**
- Update: `atlas-control-tower/docs/audits/2026-09-08-drive-audit.md`

- [ ] **Step 1: Export distinct Drive IDs referenced by Neon**

Use Science sources/provenance/assets, Olympus source refs, operational refs, and semantic `drive:<id>` entries.

- [ ] **Step 2: Resolve every referenced Drive ID**

For each ID call Drive metadata. Record accessible/not-found and current title/MIME/parent.

- [ ] **Step 3: Validate reverse coverage**

For current NEXO result/prereg/evidence documents under active project folders, check whether Neon has a source/provenance/index projection.

- [ ] **Step 4: Do not create graph edges**

Missing structural relationships remain missing unless a canonical source states them.

### Task 3: Safe naming/placement fixes

**Files:**
- Update: `atlas-control-tower/docs/audits/2026-09-08-drive-audit.md`

- [ ] **Step 1: Select metadata-safe candidates**

Only select objects that are clearly legacy, have stable Drive IDs, and whose current name falsely implies authority.

- [ ] **Step 2: Rename proven legacy state files/folders with `LEGACY_READONLY__` when beneficial**

Use Drive metadata update only. Do not move current scientific result/evidence folders.

- [ ] **Step 3: Readback each renamed object**

Confirm same file ID, same parent, same MIME type, updated display name.

- [ ] **Step 4: Leave duplicate deletion as explicit gate**

Exact duplicates and empty junk folders are listed with deletion rationale, but not deleted automatically.

### Task 4: Final Drive verification

- [ ] **Step 1: Re-run referenced-ID resolution**

Expected: all resolvable IDs still resolve, IDs unchanged.

- [ ] **Step 2: Record before/after counts**

Report canonical, legacy, duplicate candidates, unreferenced and broken refs.

- [ ] **Step 3: Commit audit document**

```bash
git add atlas-control-tower/docs/audits/2026-09-08-drive-audit.md
git commit -m "docs(nexo): record Drive optimization audit"
```
