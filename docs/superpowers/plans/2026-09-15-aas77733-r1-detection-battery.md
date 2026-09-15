# AAS77733-R1 Detection Battery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and execute the frozen G0-G19 Pantheon+ residual-feature audit with GitHub Actions primary execution and Vercel Sandbox-compatible fallback shards.

**Architecture:** A compact Python science package separates immutable public-data loading, GLS/statistical primitives, gate orchestration, and the runtime CLI. One manifest freezes sources, gate IDs, scan ranges, and closure rules. GitHub runs the complete battery and publishes a machine-readable result; the same `run_shard.py --contract-b64` entrypoint is accepted by the existing Vercel fallback executor.

**Tech Stack:** Python 3.13, NumPy 2.2.x, SciPy 1.15.x, stdlib urllib/hashlib/json/unittest, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-15-aas77733-r1-detection-battery-design.md`

## Global Constraints

- Full Pantheon+ STAT+SYS covariance is mandatory for the primary inference.
- Public sources are pinned to immutable upstream commits.
- G0 through G19 are frozen and G19 uses deterministic fail-closed claim closure.
- The historical exploratory statistic is provenance, not an optimization target.
- GitHub Actions is PRIMARY; Vercel Sandbox is infrastructure-only fallback.
- Scientific/code failures remain failures after backend changes.
- No physical cause is inferred from an unavailable external-tracer gate.

---

### Task 1: Freeze the executable manifest and RED contract tests

**Files:**
- Create: `science/aas77733/manifest.json`
- Create: `science/aas77733/test_battery.py`

**Interfaces:**
- Consumes: the design spec.
- Produces: `load_manifest()`, exact gate registry G0-G19, immutable source records, closure thresholds and deterministic test expectations used by later modules.

- [ ] **Step 1: Write failing tests** for exact gate coverage, pinned upstream commits/blob identities, full-covariance semantics, synthetic scan recovery, deterministic null calibration, nuisance absorption, closure fail-closed behavior, and base64 runtime contracts.
- [ ] **Step 2: Run the test module on the branch.** Expected: import/module failures because production modules do not exist yet.
- [ ] **Step 3: Commit the RED state** so the failure is observable in CI history.

### Task 2: Implement immutable data loaders and integrity gates

**Files:**
- Create: `science/aas77733/__init__.py`
- Create: `science/aas77733/data.py`
- Create: `science/aas77733/config.py`

**Interfaces:**
- Produces: `load_manifest(path=None)`, `download_verified(source, cache_dir)`, `load_pantheon(cache_dir)`, `load_des5yr(cache_dir)`, and Git-blob/SHA-256 provenance receipts.

- [ ] **Step 1:** Implement Git-blob SHA-1 verification (`sha1(b"blob <len>\0" + bytes)`) and runtime SHA-256 recording.
- [ ] **Step 2:** Implement whitespace Pantheon+ parsing, full covariance reshape/row-order checks, and masks.
- [ ] **Step 3:** Implement DES Hubble-diagram parsing and inverse-covariance NPZ loading using the public release semantics.
- [ ] **Step 4:** Run tests; integrity/manifest tests must pass while stats/orchestration tests remain RED.

### Task 3: Implement GLS and scan primitives

**Files:**
- Create: `science/aas77733/stats.py`

**Interfaces:**
- Produces: `distance_modulus_flat_lcdm`, `profile_gls`, `hard_step_scan`, `template_scan`, `scan_null_pvalue`, `structured_permutation_stats`, and nuisance-design helpers.

- [ ] **Step 1:** Implement smooth flat-LCDM distance-modulus shape with zHD/zHEL handling and profiled intercept.
- [ ] **Step 2:** Implement Cholesky-based GLS and projected-template scan without explicit covariance inversion.
- [ ] **Step 3:** Implement scan-space Gaussian null calibration and deterministic structure-preserving permutation ensembles.
- [ ] **Step 4:** Run synthetic recovery/nuisance/determinism tests to GREEN.

### Task 4: Implement G0-G19 orchestration and receipts

**Files:**
- Create: `science/aas77733/gates.py`
- Create: `science/aas77733/run_shard.py`

**Interfaces:**
- Produces: `run_gate(gate_id, context)`, `run_battery(config)`, `close_claim(gate_results)`, CLI `--all`, `--gates`, `--mocks`, `--seed`, `--output`, and `--contract-b64`.

- [ ] **Step 1:** Implement G0-G7 baseline/integrity/feature scans.
- [ ] **Step 2:** Implement G8-G16 global calibration, comparators, nuisance/structured-null/survey/pivot/injection gates.
- [ ] **Step 3:** Implement G17 against DES-SN5YR and G18 as an explicit independent-context availability gate.
- [ ] **Step 4:** Implement G19 frozen closure policy and machine-readable provenance/result hashing.
- [ ] **Step 5:** Run complete unit tests to GREEN.

### Task 5: Add primary GitHub workflow and bounded artifacts

**Files:**
- Create: `.github/workflows/aas77733-r1-battery.yml`

**Interfaces:**
- Produces: manual and code-change-triggered complete battery execution, `aas77733-r1-result.json`, logs, and a retained workflow artifact.

- [ ] **Step 1:** Use Python 3.13 and pinned NumPy/SciPy installation.
- [ ] **Step 2:** Run `python -m unittest science.aas77733.test_battery -v` before scientific execution.
- [ ] **Step 3:** Run the battery with the frozen 500-mock default, persist JSON, and validate `validation_status` and `result_hash`.
- [ ] **Step 4:** Upload result artifact even on scientific FAIL/INCONCLUSIVE; infrastructure/test failures must fail the workflow.

### Task 6: Execute, validate, merge, and read back

**Files:**
- No new source files unless runtime validation exposes a defect.

**Interfaces:**
- Produces: green CI evidence, real public-data result artifact, merged `main`, and post-merge readback of the executable files.

- [ ] **Step 1:** Push implementation and inspect Actions; fix only reproducible defects.
- [ ] **Step 2:** Confirm the result uses pinned public releases, full covariance, fixed scan, deterministic seed, and complete G0-G19 receipts.
- [ ] **Step 3:** Open PR, verify changed-file scope and CI, then merge with expected-head protection.
- [ ] **Step 4:** Read back `main` manifest/runner/workflow and report PASS/FAIL/INCONCLUSIVE without rewriting the scientific verdict.
