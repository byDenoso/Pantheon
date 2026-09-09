# NEXO Atlas Drive → GitHub Pages Cutover

**Goal:** restore Google Drive as the NEXO truth owner, compile a deterministic static Atlas projection with Apps Script, publish the Atlas from GitHub Pages, and remove Neon/Vercel from the operational read path.

**Architecture:** Drive keeps canonical science, learning, operations and provenance on existing NEXO surfaces. A small Apps Script compiler reads those surfaces, normalizes them into the Atlas Graph Contract, hashes the projection, and writes GitHub only when the fingerprint changes. GitHub stores code plus the compiled projection. GitHub Pages serves the same 3.5D frontend without a backend API. Explore and Present consume the same projection.

## Task 1 — Freeze the migration contract
- Add contract tests requiring static-data reads, Drive truth-owner labels, a deterministic projection file, Apps Script compiler source, and Pages deployment workflow.
- Verify tests fail against the current Neon/Vercel implementation.

## Task 2 — Reconcile Neon → Drive
- Compare science_v1, learning_v1 and nexo_ops with current Drive surfaces.
- Preserve only material Neon deltas not already represented in Drive.
- Reuse PEER Control Tower, Nexo Associative Learning, ACTION_REGISTER, Dener AI OS Index and durable Drive evidence.
- Do not copy derived cache noise or migration-only debris.

## Task 3 — Build deterministic Drive compiler
- Add `apps-script/Code.gs` plus manifest/source documentation.
- Read configured Drive spreadsheets/documents with explicit IDs and bounded ranges.
- Normalize to one static `data/atlas.json` projection with nodes, edges, provenance, activity and present/story metadata.
- Compute SHA-256 over canonical JSON and skip GitHub writes when unchanged.
- Store GitHub token only in Apps Script Properties; never in source.

## Task 4 — Remove runtime API dependency
- Switch NextGen Atlas from `/api/ng` to relative static `./data/atlas.json` reads.
- Implement local graph slicing for macro/scientific/provenance views, lineage, health and local refresh.
- Preserve 3.5D renderer, inspector, search, filters, mobile controls, labels and navigation.

## Task 5 — Explore + Present
- Make parent/current/children hierarchy explicit: NEXO → Domain → Campaign → Claim/Hypothesis → Test → Result → Source.
- Add Present mode derived from the same projection: investigation, why it matters, hypotheses, tests, results, changes, evidence, current state and next step.

## Task 6 — GitHub Pages
- Add Pages workflow that uploads `atlas-control-tower/` as the static artifact.
- Keep the quality test job as a required pre-deploy gate.
- Validate published HTML, JS, CSS and `data/atlas.json` from the actual Pages URL.

## Task 7 — Cutover and readback
- Update permanent NEXO references only after Pages validation.
- Change Drive, run compiler, verify GitHub commit, Pages deploy and Atlas readback.
- Remove Neon/Vercel references and dead runtime code from the Atlas path.
- Keep a minimal migration backup only.

## Task 8 — Retirement
- After end-to-end evidence is green, remove Neon/Vercel from operational automations and documentation.
- Physical Neon deletion requires the provider's explicit destructive-action confirmation immediately before deletion.
