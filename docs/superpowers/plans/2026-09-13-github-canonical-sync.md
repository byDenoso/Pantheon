# GitHub Canonical Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make GitHub the single canonical authority consumed by Atlas Sync while preserving the existing frontend sync/diff contract.

**Architecture:** Add a GitHub-backed canonical snapshot reader in NEXO One, expose canonical Atlas snapshot data with `authority: GITHUB`, and rewire Atlas live sync to consume it. Drive remains an optional projection/provenance source only. Failed refresh preserves the last valid snapshot and reports degraded state.

**Tech Stack:** Node.js ESM, Vercel serverless functions, React/Vite frontend, GitHub Actions node:test.

**Spec:** `docs/superpowers/specs/2026-09-13-github-canonical-sync-design.md`

## Global Constraints
- GitHub is the canonical operational authority.
- Preserve the current `POST /sync` semantic-diff response shape.
- Never replace the last valid snapshot on refresh failure.
- Drive can appear only as projection/provenance, never as canonical authority.
- Static fallback must be marked `STALE` or `DEGRADED`.

---

### Task 1: Freeze the authority contract
**Files:** Modify `atlas-control-tower/test/runtime-live-sync-route.test.mjs`; add NEXO One contract test if needed.
- [ ] Add failing assertions for `authority: GITHUB`, GitHub canonical URL/reader, and absence of canonical Drive labeling.
- [ ] Run Atlas Quality and confirm RED for the missing GitHub authority implementation.

### Task 2: GitHub canonical reader
**Files:** Create `nexo-one/server/adapters/github-canonical.mjs`; modify `nexo-one/server/handler.mjs` and relevant compiler contract.
- [ ] Read the canonical snapshot from GitHub main using a deterministic repository path/ref.
- [ ] Validate contract, authority, fingerprint, and required sections before returning data.
- [ ] Expose sanitized/public and service/private canonical reads without enabling writes.

### Task 3: Rewire Atlas Sync
**Files:** Replace Drive-specific authority wiring in `atlas-control-tower/lib/live-drive-ssot.mjs` with GitHub canonical semantics; modify `atlas-control-tower/api/runtime-orphans.js` only where needed.
- [ ] Fetch GitHub-authoritative snapshot on forced sync.
- [ ] Keep TTL cache for ordinary reads.
- [ ] Compute semantic diff against last valid snapshot.
- [ ] Preserve last valid state on source failure and surface degraded metadata.

### Task 4: Compatibility and provenance
**Files:** Update source descriptors/projections/tests as needed.
- [ ] Keep Drive source references as projection provenance.
- [ ] Ensure no live route reports Drive as canonical authority.
- [ ] Keep frontend route and diff response fields stable.

### Task 5: Verification
- [ ] Run unit/contract tests.
- [ ] Run typecheck and production build.
- [ ] Verify GitHub Actions green on the PR head.
- [ ] Inspect deployment/readback when available and confirm Sync returns `GITHUB` authority plus semantic changes or `NO_CHANGE`.
