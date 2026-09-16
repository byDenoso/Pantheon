# Pantheon Residual Audit Repository Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a publication-facing reproducibility package for the AAS77733 Pantheon+ residual analysis using conventional scientific naming and frozen, traceable results.

**Architecture:** Keep the existing research branches as provenance sources, but publish a clean standalone-facing package named `pantheon-residual-audit`. Replace internal gate labels with descriptive analysis names, preserve the mapping only in provenance metadata, and ship frozen reference results plus reproducibility checks. The paper may cite the publication repository; internal NEXO/Tower/agent terminology must not appear in the publication-facing tree.

**Tech Stack:** Python 3.11+, NumPy, SciPy, pytest, JSON/YAML.

**Spec:** User-approved design in the 2026-09-16 conversation: conventional scientific repository structure, descriptive test names, README, frozen configuration, provenance and reference results.

## Global Constraints

- Publication-facing paths and prose must not contain `agent`, `NEXO`, `Tower`, `gate`, `G0`-`G19`, or `H0`-`H6` as primary analysis names.
- Original source identifiers may appear only inside explicit provenance mappings.
- Do not change numerical results while renaming or reorganizing them.
- Preserve source repository, branch, commit/run/artifact identifiers and result hashes.
- The publication battery and light/medium hardening remain separate frozen evidence sets.
- Repository must include a machine-check that descriptive reference results reproduce the frozen source metrics exactly.

---

### Task 1: Build publication-facing result model

**Files:**
- Create: `results/main_analysis.json`
- Create: `results/robustness_checks.json`
- Create: `provenance/source_mapping.json`
- Test: `tests/test_reference_results.py`

**Interfaces:**
- Consumes: frozen publication and hardening JSON artifacts.
- Produces: descriptive analysis keys and provenance mapping.

- [ ] Write a failing test asserting required descriptive analysis keys, source hashes, and no internal labels outside provenance.
- [ ] Run the test and confirm failure before files exist.
- [ ] Transform the frozen JSON without changing numerical values.
- [ ] Run the test and confirm PASS.

### Task 2: Add publication-facing analysis index and configuration

**Files:**
- Create: `config/analysis.yaml`
- Create: `README.md`
- Create: `CITATION.cff`
- Test: `tests/test_repository_contract.py`

**Interfaces:**
- Consumes: descriptive results from Task 1.
- Produces: documented mapping from scientific questions to result files and execution settings.

- [ ] Write failing tests for documented analyses, fixed seed/mock counts, and absence of internal terminology.
- [ ] Run tests and confirm failure.
- [ ] Add configuration and documentation.
- [ ] Run tests and confirm PASS.

### Task 3: Add reproducibility utilities

**Files:**
- Create: `src/pantheon_residuals/reference.py`
- Create: `scripts/validate_reference.py`
- Create: `pyproject.toml`
- Test: `tests/test_reference_validation.py`

**Interfaces:**
- Consumes: result JSON and provenance mapping.
- Produces: deterministic validation command returning zero only when hashes/metrics match.

- [ ] Write failing hash/metric validation tests.
- [ ] Run and confirm failure.
- [ ] Implement canonical JSON hashing and cross-file validation.
- [ ] Run and confirm PASS.

### Task 4: Package and verify

**Files:**
- Create: `.gitignore`
- Create: `LICENSE`

**Interfaces:**
- Consumes: complete package.
- Produces: publication-ready repository snapshot and ZIP.

- [ ] Run `python scripts/validate_reference.py`.
- [ ] Run `pytest -q`.
- [ ] Scan publication-facing files for internal terminology and fail if found outside `provenance/source_mapping.json`.
- [ ] Create a ZIP snapshot for transfer to a dedicated GitHub repository.
