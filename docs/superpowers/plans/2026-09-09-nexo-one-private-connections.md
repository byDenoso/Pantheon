# NEXO ONE Private Connections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make NEXO ONE private read providers operational with Vercel Connect for Google while preserving existing contracts, fallback, session isolation and rollback.

**Architecture:** Add one focused Connect token helper, make Google readers prefer it when configured, preserve the legacy refresh-token path as explicit fallback, and add an optional Google Sheets-backed NEXO source that emits the existing owner-export contract. Atlas/GitHub/Vercel contracts stay read-only and unchanged except for configuration/readback documentation.

**Tech Stack:** Node.js 24 ESM, native fetch, node:test, Vercel Functions, Vercel Connect HTTP API, Google REST APIs.

**Spec:** `docs/superpowers/specs/2026-09-09-nexo-one-private-connections-design.md`

## Global Constraints

- No provider secret or user token may be committed.
- Public mode may invoke only the public GitHub provider.
- Google Connect requests only read-only Drive, Gmail, Calendar and Sheets scopes.
- A configured but broken Connect path must fail closed; it must not silently use legacy OAuth secrets.
- Existing Google refresh-token OAuth remains available only when `GOOGLE_CONNECTOR` is absent.
- No canonical data is mutated.

---

### Task 1: Vercel Connect token exchange

**Files:**
- Create: `nexo-one/server/adapters/connect.mjs`
- Modify: `nexo-one/test/adapters.test.mjs`

**Interfaces:**
- Produces: `googleConnectToken(env, signal): Promise<string>`

- [ ] **Step 1: Write failing tests** proving that `GOOGLE_CONNECTOR` uses `POST https://api.vercel.com/v1/connect/token/...`, authenticates with `VERCEL_OIDC_TOKEN`, sends a `user` subject, requests only the four Google read scopes, and normalizes authorization failure as `AUTH_REQUIRED`.
- [ ] **Step 2: Run CI on the test-only commit** and confirm failure is caused by the missing helper/behavior.
- [ ] **Step 3: Implement minimal helper** using native fetch and `ProviderError`.
- [ ] **Step 4: Run CI** and confirm the new tests pass with the full suite.

### Task 2: Google adapter preference and rollback fallback

**Files:**
- Modify: `nexo-one/server/adapters/google.mjs`
- Modify: `nexo-one/test/adapters.test.mjs`

**Interfaces:**
- Consumes: `googleConnectToken(env, signal)`.
- Produces: unchanged `drive`, `gmail`, `calendar` reader signatures.

- [ ] **Step 1: Write failing tests** proving Connect is preferred when configured, legacy OAuth is used only when Connect is absent, and Connect failure never falls through to legacy secrets.
- [ ] **Step 2: Confirm RED in CI.**
- [ ] **Step 3: Implement the smallest token-selection change.**
- [ ] **Step 4: Confirm GREEN in CI.**

### Task 3: NEXO Google Sheets source

**Files:**
- Modify: `nexo-one/server/adapters/nexo.mjs`
- Modify: `nexo-one/test/adapters.test.mjs`

**Interfaces:**
- Adds optional env: `NEXO_SHEET_ID`, `NEXO_SHEET_RANGE`.
- Keeps `nexo({env,signal}) -> {items,revision,partial}`.

- [ ] **Step 1: Write failing tests** for a valid header/row payload and malformed sheet schema.
- [ ] **Step 2: Confirm RED in CI.**
- [ ] **Step 3: Implement Sheets fetch using the same Google Connect credential and deterministic revision.**
- [ ] **Step 4: Confirm GREEN in CI.**

### Task 4: Runtime configuration and documentation

**Files:**
- Modify: `nexo-one/docs/INTEGRACOES.md`
- Modify: `nexo-one/docs/RELEASE.md` only if acceptance wording is stale.

- [ ] **Step 1: Replace the primary Google setup path with Vercel Connect** and document the legacy OAuth path as rollback fallback.
- [ ] **Step 2: Document canonical Atlas URL and NEXO Sheets variables without embedding credentials.**
- [ ] **Step 3: Run final CI/readback checks.**

### Task 5: Review and delivery

- [ ] **Step 1: Inspect the complete PR diff for secret exposure, contract drift, accidental write capability and unnecessary complexity.**
- [ ] **Step 2: Verify CI is green.**
- [ ] **Step 3: Merge only after verification.**
- [ ] **Step 4: Attempt owner-side Vercel/Connect provisioning with available tools; classify any OAuth consent or unavailable credential-management action as `blocked`, not as implemented.**
- [ ] **Step 5: Perform live unauthenticated readback and authenticated readback where credentials permit.**
