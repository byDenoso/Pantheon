# NEXO Sovereign Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Atlas the first NEXO Sovereign reference implementation by running GitHub Pages entirely from local static projections with no required Vercel or Neon read path.

**Architecture:** Preserve the existing `AtlasApiClient` contract, but make the default Pages/browser client use the existing local projection path. Route science focuses through the Drive→GitHub scientific snapshot, keep non-science through the existing Drive projection, remove remote API injection/readback from Pages, and add constitutional repository documents plus CI tests preventing retired runtime dependencies from returning.

**Tech Stack:** React 19, Vite 8, Node 24, Node test runner, GitHub Actions, GitHub Pages, static JSON projections.

**Spec:** `docs/superpowers/specs/2026-09-13-nexo-sovereign-architecture.md`

## Global Constraints

- Google Drive remains mutable factual SSOT.
- GitHub main remains code/contract/architecture authority.
- Generated snapshots remain projection-only.
- Browser remains read-only and receives no credentials.
- Vercel and Neon must not be required for Atlas read paths.
- Static projection health uses `SNAPSHOT`, not `LIVE`.
- Do not publish sensitive/private Drive fields to public Pages.
- Preserve existing frontend API method signatures.

---

### Task 1: Constitutional bootstrap

**Files:**
- Create: `NEXO_BOOTSTRAP.md`
- Create: `NEXO_ARCHITECTURE.md`
- Create: `NEXO_SYSTEM_STATE.json`
- Create: `NEXO_AUTHORITY.json`

**Interfaces:**
- Produces: canonical architecture/bootstrap context for future agents and chats.

- [ ] **Step 1: Add bootstrap document** requiring agents to read authority, system state, architecture and relevant contracts before architecture-sensitive changes.
- [ ] **Step 2: Add architecture document** summarizing Sovereign Core and linking the full spec.
- [ ] **Step 3: Add machine-readable system state** with `NEXO_SOVEREIGN_V1`, GitHub Pages, `STATIC_LOCAL`, GitHub Actions, Drive/GitHub Core and Vercel/Neon retired from required runtime.
- [ ] **Step 4: Add machine-readable authority map** separating factual authority, code authority, projection and presentation.
- [ ] **Step 5: Commit.**

### Task 2: RED contracts for static runtime

**Files:**
- Modify: `atlas-control-tower/test/pages-runtime-debug.test.mjs`
- Modify: `atlas-control-tower/test/deployment-contract.test.mjs`
- Create: `atlas-control-tower/test/sovereign-runtime.test.mjs`

**Interfaces:**
- Consumes: current Pages workflow/client/runtime.
- Produces: failing assertions for local-only read behavior and science sentinel resolution.

- [ ] **Step 1: Replace Pages readback assertion** so it forbids `VITE_NEXO_API_BASE_URL` and `vercel.app` in the Pages workflow.
- [ ] **Step 2: Replace Vercel deployment contract tests** with static-host portability assertions; no test should require `vercel.json` serverless APIs for product correctness.
- [ ] **Step 3: Add sovereign runtime test** that constructs the default local API and asserts `system:SCIENCE`, `domain:D7`, `T-ALENS-001`, `result:T-ALENS-001`, `PRODUCES`, and static health semantics.
- [ ] **Step 4: Run CI and confirm RED** before implementation.
- [ ] **Step 5: Commit RED tests.**

### Task 3: Local rich science runtime

**Files:**
- Modify: `atlas-control-tower/lib/drive-ssot.mjs`
- Modify: `atlas-control-tower/src/api/client.ts`
- Test: `atlas-control-tower/test/sovereign-runtime.test.mjs`

**Interfaces:**
- Consumes: `loadDriveGithubScience()` and `projectDriveGithubScience()` from `lib/drive-github-science.mjs`.
- Produces: `driveRoute()` responses with rich science for science graph/entity/state while retaining generic Drive projection for other surfaces.

- [ ] **Step 1: Route science graph focuses** (`system:SCIENCE`, `domain:D*`, campaign/test/result scientific entities) through `projectDriveGithubScience`.
- [ ] **Step 2: Merge science TEST/RESULT counts into local state** while retaining non-science state fields.
- [ ] **Step 3: Resolve scientific entities locally first**, then fall back to generic Drive entity resolution.
- [ ] **Step 4: Update local health** to report `runtime: STATIC_LOCAL`, `authority: GITHUB`, `projectionAuthority: GOOGLE_DRIVE`, `freshness: SNAPSHOT`, `usedFallback: false`.
- [ ] **Step 5: Make default browser client local** by not injecting a fetch implementation when no explicit remote base URL is configured. Explicit remote bases remain available only for development/compatibility during migration.
- [ ] **Step 6: Run unit tests and commit GREEN implementation.**

### Task 4: Pages-only read path

**Files:**
- Modify: `.github/workflows/atlas-pages-fallback.yml`
- Modify: `atlas-control-tower/test/pages-runtime-debug.test.mjs`

**Interfaces:**
- Consumes: static local API runtime from Task 3.
- Produces: public Pages deployment that requires no Vercel API.

- [ ] **Step 1: Remove `VITE_NEXO_API_BASE_URL`** from Pages build.
- [ ] **Step 2: In Playwright smoke, abort any request targeting `vercel.app`, `neon`, `supabase`, or `firebase` and fail if attempted.
- [ ] **Step 3: Keep shell/context/bootstrap assertions** and add navigation/read assertion for the local science graph where practical.
- [ ] **Step 4: Replace post-deploy Vercel API readback** with Pages shell/static-runtime readback. Do not curl Vercel.
- [ ] **Step 5: Run workflow contract tests and commit.**

### Task 5: Retired-runtime constitutional gate

**Files:**
- Create: `atlas-control-tower/test/retired-runtime-gate.test.mjs`
- Modify: `.github/workflows/atlas-quality.yml` only if required for test inclusion (normally `npm test` already includes the file).

**Interfaces:**
- Produces: CI failure if retired runtime dependencies re-enter required Pages/browser read paths.

- [ ] **Step 1: Assert client and Pages workflow do not contain required Vercel/Neon URLs.**
- [ ] **Step 2: Assert local runtime modules do not import Neon readers or Vercel server handlers.**
- [ ] **Step 3: Assert scientific sentinel resolves with no HTTP fetch implementation.**
- [ ] **Step 4: Run full tests, typecheck and build.**
- [ ] **Step 5: Commit.**

### Task 6: Integration and publication

**Files:**
- Modify PR metadata/documentation as needed.

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces: reviewed, merged Sovereign Phase 1 with public Pages readback.

- [ ] **Step 1: Run `npm test`, `npm run typecheck`, and `npm run build` in CI and require green results.**
- [ ] **Step 2: Review PR diff for accidental data exposure, remote runtime references in active paths, and unrelated refactors.**
- [ ] **Step 3: Merge only after green CI.**
- [ ] **Step 4: Require Pages workflow green including browser smoke and public readback.**
- [ ] **Step 5: Verify public Pages boots with Vercel unavailable and record current main SHA.**

## Follow-up plans

After Phase 1 is green and published, create separate implementation plans for:

1. Atomic `nexo-state` fingerprinted snapshots, entity/search indexes and last-known-good publication.
2. Universe/Observatory/Lab/Operations/Learning/Provenance generated artifacts.
3. NEXO ONE migration from Vercel server handler to static/public projections plus optional connected integrations.
4. Retirement cleanup of Vercel/Neon handlers, OIDC, workflows, configs and stale docs.
5. Optional offline/PWA cache only after deterministic static runtime is stable.
