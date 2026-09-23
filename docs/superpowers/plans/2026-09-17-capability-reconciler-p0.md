# Capability Reconciler P0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the gap between implemented capability candidates and the canonical Tower capability registry.

**Architecture:** Keep Tower's existing `manifests/capabilities.json` as the only registry. Add a stateless reconciler in Pantheon that normalizes/fingerprints candidates, compares them with Tower state, and exposes reconciliation/discovery through the existing semantic gateway. Canonical writes continue through Tower CAS/readback.

**Tech Stack:** Node.js ESM, existing Pantheon semantic gateway/Tower GitHub gateway, node:test.

**Spec:** `docs/superpowers/specs/2026-09-17-capability-reconciliation-design.md`

## Global Constraints
- No second capability registry.
- Chat/API/MCP are not authority.
- Discovery does not imply trust or executability.
- Canonical mutation must preserve Tower CAS/readback.

---

### Task 1: Pure capability reconciliation core
**Files:** Create `atlas-control-tower/lib/capability-reconciler.mjs`; create `atlas-control-tower/test/capability-reconciler.test.mjs`.
**Interfaces:** Produces `normalizeCapabilityCandidate(candidate)`, `semanticCapabilityFingerprint(candidate)`, `classifyCapabilityCandidate(candidate, manifest)` and `reconcileCapabilityCandidate(candidate, manifest)`.
- [ ] Write tests for deterministic fingerprint, provider/transport invariance, NEW, UNCHANGED, DUPLICATE and CONFLICT.
- [ ] Run `node --test atlas-control-tower/test/capability-reconciler.test.mjs` and verify failure.
- [ ] Implement minimal pure reconciler.
- [ ] Run the test and verify PASS.
- [ ] Commit `feat(nexo): add capability reconciliation core`.

### Task 2: Tower manifest discovery surface
**Files:** Modify `atlas-control-tower/lib/nexo-semantic-gateway.mjs`; use existing `towerGateway.readCapabilityManifest()`.
**Interfaces:** Produces semantic calls `nexo.get_capabilities` and `nexo.reconcile_capability` where reconciliation is dry-run/candidate classification in P0.
- [ ] Add failing semantic-gateway tests for manifest discovery and candidate classification.
- [ ] Run focused tests and verify failure.
- [ ] Wire reconciler to existing Tower manifest read.
- [ ] Run tests and verify PASS.
- [ ] Commit `feat(nexo): expose capability discovery and reconciliation`.

### Task 3: MCP derived view
**Files:** Modify MCP semantic tool descriptor source discovered in repository; do not create an independent registry.
**Interfaces:** MCP descriptors delegate to semantic gateway calls from Task 2.
- [ ] Add failing descriptor/dispatch test.
- [ ] Run and verify failure.
- [ ] Add derived MCP descriptors only.
- [ ] Run and verify PASS.
- [ ] Commit `feat(mcp): expose canonical capability discovery`.

### Task 4: Reconciliation probe
**Files:** Create `atlas-control-tower/test/capability-reconciliation-probe.test.mjs` and fixture local to test.
**Interfaces:** Probe `nexo.capability.reconciliation_probe` must begin absent from a fixture manifest, classify NEW, reconcile to a candidate record, then be discoverable through a second semantic surface fixture; removal classifies STALE in drift comparison.
- [ ] Write failing cross-surface probe.
- [ ] Run and verify failure.
- [ ] Implement only missing drift/probe behavior.
- [ ] Run probe and all relevant tests; verify PASS.
- [ ] Commit `test(nexo): prove capability reconciliation cross-surface`.

### Task 5: Verification
**Files:** No production changes unless tests reveal a defect.
- [ ] Run all atlas-control-tower tests.
- [ ] Inspect diff for duplicated authority/hardcoded capability additions.
- [ ] Confirm no canonical production mutation occurred from tests.
- [ ] Record exact evidence and remaining gap to E4/E5.
