# PERSONAL_LOOP_V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make NEXO ONE capable of privately sensing Gmail/Calendar/Drive, normalizing personal state, proposing safe actions, executing the bounded V1 write surface, verifying provider effects, and retaining follow-up state.

**Architecture:** Restore the existing private-session boundary, add a pure personal-loop compiler, extend Google adapters with operation-scoped mutations, persist effects/runs/personal records in the existing NEXO canonical sheet, and execute provider mutations through the existing capability fabric. Public SystemState and Atlas/science paths retain their current anonymous read-only boundary.

**Tech Stack:** Node.js 24 ESM, native `node:test`, TypeScript contracts, Google REST APIs, Vercel Connect/OAuth, NEXO Google Sheet SSOT, existing capability-fabric.

**Spec:** `docs/superpowers/specs/2026-09-15-personal-loop-v1-design.md`

## Global Constraints

- Adapters do not become Truth Owners.
- Reasoning does not write directly to providers.
- HTTP success does not count as execution success without provider readback.
- Gmail send and Drive mutations remain unavailable in V1.
- Anonymous requests never read personal providers or personal canonical state.
- L4 mutations require explicit approval bound to a proposal fingerprint.
- Existing public SystemState and Atlas/science behavior must remain green.

---

### Task 1: Restore the private session boundary

**Files:**
- Modify: `server/handler.mjs`
- Modify: `test/public-readonly-mode.test.mjs`
- Create: `test/private-session-handler.test.mjs`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `configured`, `authenticated`, `makeSession`, `verifyPassword`, `cookie`, `sameOrigin` from `server/auth/session.mjs`.
- Produces: GET/POST/DELETE `/api/session`; authenticated requests derive `access='PRIVATE'`.

- [ ] Write tests proving anonymous public SystemState remains public, GET session reflects configuration/auth state, cross-origin login/logout fail closed, valid login emits HttpOnly cookie, valid session exposes private access, and logout clears the cookie.
- [ ] Push tests only and verify GitHub Actions RED because `handler.mjs` still hardcodes `PUBLIC_READ_ONLY`.
- [ ] Implement the smallest handler change that passes the tests while retaining anonymous public routes.
- [ ] Verify targeted tests and full branch CI GREEN.

### Task 2: Add the canonical personal-loop compiler

**Files:**
- Create: `server/personal/loop.mjs`
- Create: `src/contracts/personal.ts`
- Create: `test/personal-loop.test.mjs`

**Interfaces:**
- `buildPersonalModel(world,{now}) -> {version, fingerprint, entities, events}`
- `proposePersonalActions(model,{now}) -> PersonalProposal[]`
- `classifyPersonalProposal(proposal) -> {level, policy}`
- `reconcilePersonalFollowUps(model,receipts,{now}) -> PersonalFollowUp[]`

- [ ] Write failing tests for stable canonical IDs/provenance, overlapping Calendar conflict proposal, explicit NEEDS_ME/BLOCKED proposal behavior, L3/L4/L5 policy mapping, and follow-up remaining open until verified source/effect evidence closes it.
- [ ] Verify RED on the missing module.
- [ ] Implement deterministic pure functions with no provider calls.
- [ ] Run targeted tests and full CI.

### Task 3: Persist effects, runs and personal records in NEXO Sheet

**Files:**
- Create: `server/execution/nexo-sheet-store.mjs`
- Modify: `server/adapters/connect.mjs`
- Modify: `scripts/google-auth.mjs`
- Modify: `server/adapters/nexo.mjs`
- Modify: `test/google-auth-helper.test.mjs`
- Create: `test/nexo-sheet-store.test.mjs`
- Modify: `test/adapters.test.mjs`

**Interfaces:**
- `googleConnectToken(env,signal,{scopes})`
- `createNexoSheetStores({env,signal,now}) -> {effectLedger,executionRuns,personalRecords}`
- Store methods match `capability-fabric.mjs`: effect `get/reserve/complete/fail`; runs `start/finish`.
- `personalRecords.upsert(record)` performs write then provider readback.

- [ ] Write failing tests for operation-scoped write scopes, effect reservation conflict, verified effect persistence, execution run lifecycle, task/commitment upsert/readback, and NEXO adapter projection of personal record statuses into PERSONAL context/LOOPS.
- [ ] Verify RED.
- [ ] Implement Sheets compare-before-write using the existing eight-column NEXO schema and deterministic record IDs.
- [ ] Keep read-only token acquisition unchanged for reads; request `spreadsheets`, `gmail.compose`, or `calendar.events` only for write operations.
- [ ] Run targeted tests and full CI.

### Task 4: Add Gmail Draft and Calendar create/readback adapters

**Files:**
- Modify: `server/adapters/google.mjs`
- Create: `test/google-write.test.mjs`

**Interfaces:**
- `gmailDraftCapability({env,signal}) -> {mutating:true,target:'gmail',execute,readback}`
- `calendarEventCapability({env,signal}) -> {mutating:true,target:'calendar',execute,readback}`

- [ ] Write failing tests using a controlled `fetch` implementation to assert exact provider requests and semantic readback validation.
- [ ] Gmail test requires `X-Nexo-Effect-Key`, deterministic Message-ID, draft creation only, and GET readback verification.
- [ ] Calendar test requires deterministic event ID derived from effect key and GET readback verification of summary/start/end.
- [ ] Verify RED.
- [ ] Implement minimal adapters. Do not add Gmail send or Drive writes.
- [ ] Run targeted tests and full CI.

### Task 5: Wire private snapshot, policy and execution routes

**Files:**
- Create: `server/personal/service.mjs`
- Modify: `server/handler.mjs`
- Create: `test/personal-service.test.mjs`
- Create: `test/personal-routes.test.mjs`

**Interfaces:**
- `buildPersonalSnapshot({env,now,reader})`
- `executePersonalAction({env,now,proposal,approval,actor,writeToken})`
- Routes: GET `/api/personal`; POST `/api/personal/action`.

- [ ] Write failing tests proving anonymous personal access returns 401, authenticated snapshot reads private providers, L5 is denied, stale/mismatched L4 approval is denied before mutation, L3 NEXO task write executes with readback, and supported L4 Gmail/Calendar operations route through `executeCapabilityAware`.
- [ ] Verify RED.
- [ ] Implement the service and routes with same-origin/auth checks and explicit approval fingerprint binding.
- [ ] Run targeted tests and full CI.

### Task 6: Project follow-up into existing cockpit surfaces

**Files:**
- Modify: `server/adapters/nexo.mjs`
- Modify: `server/compiler/attention.mjs` only if required by observed test behavior.
- Modify: `test/core.test.mjs`
- Modify: `test/personal-loop.test.mjs`

**Interfaces:**
- Canonical `task`/`commitment` rows become PERSONAL `CockpitItem` records with existing LoopStatus values so `/api/loops` and `/api/day` pick them up without new UI truth state.

- [ ] Write failing projection tests for NEEDS_ME, WAITING_OTHER, SCHEDULED, BLOCKED, DONE and due dates.
- [ ] Verify RED.
- [ ] Extend NEXO row normalization only as required for the existing NOW/DAY/LOOPS selectors.
- [ ] Run targeted tests and full CI.

### Task 7: Update integration runbook and release proof

**Files:**
- Modify: `docs/INTEGRACOES.md`
- Modify: `.env.example`
- Create or modify regression tests only if needed to protect the final contract.

**Interfaces:**
- Documents exact Google read/write scopes, session configuration, canonical sheet records, V1 allowed mutations, denied mutations, and acceptance readbacks.

- [ ] Update the runbook with exact configuration and reauthorization requirement for legacy OAuth refresh tokens.
- [ ] Run full GitHub Actions CI including browser verification and release packaging.
- [ ] Open PR from `feat/personal-loop-v1` to `main`, review diff and CI status, then merge only when green.
- [ ] Read back `main` commit and deployed health/personal endpoints when deployment credentials/environment make live validation possible.
