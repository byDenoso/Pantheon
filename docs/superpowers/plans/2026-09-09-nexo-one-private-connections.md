# NEXO ONE Private Connections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make NEXO ONE private read providers operational with Vercel Connect for Google while preserving existing contracts, fallback, session isolation and rollback.

**Architecture:** Add one focused Connect token helper, make Google readers prefer it when configured, preserve the legacy refresh-token path as explicit fallback, and add an optional Google Sheets-backed NEXO source mapped from the live canonical eight-column SSOT schema. Atlas/GitHub/Vercel contracts stay read-only and unchanged except for configuration/readback documentation.

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

- [x] **Step 1: Write failing tests** proving that `GOOGLE_CONNECTOR` uses `POST https://api.vercel.com/v1/connect/token/...`, authenticates with `VERCEL_OIDC_TOKEN`, sends a `user` subject, requests only the four Google read scopes, and normalizes authorization failure as `AUTH_REQUIRED`.
- [x] **Step 2: Run CI on the test-only commit** and confirm failure is caused by the missing helper/behavior. RED: run `34423432877`.
- [x] **Step 3: Implement minimal helper** using the common HTTPS/provider-error path.
- [x] **Step 4: Run CI** as part of the next integrated cycle.

### Task 2: Google adapter preference and rollback fallback

**Files:**
- Modify: `nexo-one/server/adapters/google.mjs`
- Modify: `nexo-one/test/adapters.test.mjs`

**Interfaces:**
- Consumes: `googleConnectToken(env, signal)`.
- Produces: unchanged `drive`, `gmail`, `calendar` reader signatures plus exported `googleToken` for the NEXO Sheets reader.

- [x] **Step 1: Write failing tests** proving Connect is preferred when configured, legacy OAuth is used only when Connect is absent, and Connect failure never falls through to legacy secrets.
- [x] **Step 2: Confirm RED in CI.** RED: run `34423575586`.
- [x] **Step 3: Implement the smallest token-selection change.**
- [x] **Step 4: Confirm GREEN in CI.** GREEN: run `34423629100`.

### Task 3: NEXO Google Sheets source

**Files:**
- Modify: `nexo-one/server/adapters/nexo.mjs`
- Modify: `nexo-one/test/adapters.test.mjs`

**Interfaces:**
- Adds optional env: `NEXO_SHEET_ID`, `NEXO_SHEET_RANGE`.
- Consumes canonical columns `record_type, record_id, status, title, detail, payload_json, source, updated_at`.
- Keeps `nexo({env,signal,now}) -> {items,revision,partial}`.

- [x] **Step 1: Write failing tests** for the live canonical header/row shape, observation-time preservation and malformed sheet schema.
- [x] **Step 2: Confirm RED in CI.** The first implementation run also caught an over-specific URL-serialization expectation; the test was corrected to the platform's actual URL serialization instead of changing production code to satisfy a false assertion.
- [x] **Step 3: Implement Sheets fetch using the same Google credential and deterministic SHA-256 revision.**
- [x] **Step 4: Confirm GREEN in CI.** GREEN: run `34423876318`.

### Task 4: Runtime configuration and documentation

**Files:**
- Modify: `nexo-one/docs/INTEGRACOES.md`
- Modify: this spec/plan when live-source inspection changes assumptions.

- [x] **Step 1: Replace the primary Google setup path with Vercel Connect** and document the legacy OAuth path as rollback fallback.
- [x] **Step 2: Document canonical NEXO Sheet id/range/schema and canonical Atlas Graph URL without embedding credentials.**
- [ ] **Step 3: Run final CI/readback checks.**

### Task 5: Review and delivery

- [ ] **Step 1: Inspect the complete PR diff for secret exposure, contract drift, accidental write capability and unnecessary complexity.**
- [ ] **Step 2: Verify CI is green after documentation reconciliation.**
- [ ] **Step 3: Merge only after verification.**
- [ ] **Step 4: Attempt owner-side Vercel/Connect provisioning with available tools; classify any OAuth consent or unavailable credential-management action as `blocked`, not as implemented.**
- [ ] **Step 5: Perform live unauthenticated readback and authenticated readback where credentials permit.**
