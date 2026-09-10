# NEXO ONE Full Control Plane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing NEXO ONE deployment into the private control plane for live provider reads and capability-gated writes with confirmation, idempotency, execution receipts, provider readback, TruthGraph/Integrity projection, and production validation.

**Architecture:** Keep the existing NEXO ONE server as the only control plane. Add a focused action execution layer under `server/execution/`, extend existing adapters with explicit `execute/readback` functions, expose bounded action routes through the current handler, and project receipts into the current UI. Public mode remains read-only and projection-only; private mode resolves canonical authority and capability state from the existing NEXO SSoT and matrices.

**Tech Stack:** Node.js >=24, React 19, TypeScript 5.9, Vite 8, Node test runner, existing GitHub/Vercel/Google APIs, existing Vercel OIDC/Connect path.

**Spec:** `docs/superpowers/specs/2026-09-10-nexo-one-full-control-plane-design.md`

## Global Constraints

- Do not create a database, repository, automation, Truth Owner, competing SSoT, or browser-side secret store.
- Keep the existing four automations unchanged: NEXO Daily v0.1, NEXO Core v0.1, NEXO Executor v0.1, NEXO Reconciler v0.1.
- Keep credentials server-only. No `VITE_*` secrets and no provider tokens in world-state, logs, snapshots, or receipts.
- Public mode remains read-only and non-authoritative.
- A write can be `PASS` only after provider/canonical readback proves the intended effect.
- Unknown, `UNVERIFIED`, `PENDING_*`, `BLOCKED`, authority-conflicting, unauthenticated, ambiguous-target, or unconfirmed actions fail closed with no provider side effect.
- Strong-impact operations require `STRONG_CONFIRM`; ordinary external writes require `CONFIRM`.
- Deploy only to the existing `nexo-one` Vercel project and validate real production assets/API after promotion.

---

### Task 1: Action contracts and normalized errors

**Files:**
- Create: `nexo-one/server/execution/contracts.mjs`
- Test: `nexo-one/test/action-contracts.test.mjs`

**Interfaces:**
- Produces: `normalizeIntent(input, now)`, `ActionError`, `confirmationFor(actionType)`, `semanticKey(intent)`, status/error constants.

- [ ] **Step 1: Write the failing contract tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeIntent,confirmationFor,ActionError} from '../server/execution/contracts.mjs';

test('intent rejects client authority and missing stable identity',()=>{
  assert.throws(()=>normalizeIntent({authority:'CLIENT',action_type:'gmail.send'},0),/INVALID_INTENT/);
});

test('risk policy is server derived',()=>{
  assert.equal(confirmationFor('gmail.send'),'CONFIRM');
  assert.equal(confirmationFor('calendar.delete'),'STRONG_CONFIRM');
  assert.equal(confirmationFor('vercel.promote'),'STRONG_CONFIRM');
});

test('normalized errors expose safe codes only',()=>{
  assert.equal(new ActionError('CAPABILITY_BLOCKED','secret').code,'CAPABILITY_BLOCKED');
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `cd nexo-one && node --test test/action-contracts.test.mjs`
Expected: FAIL because `contracts.mjs` does not exist.

- [ ] **Step 3: Implement minimal normalized contracts**

```js
export const ACTION_ERRORS=new Set(['AUTH_REQUIRED','SCOPE_REQUIRED','CAPABILITY_BLOCKED','AUTHORITY_CONFLICT','TARGET_AMBIGUOUS','RATE_LIMITED','PROVIDER_UNAVAILABLE','PROVIDER_REJECTED','READBACK_MISMATCH','READBACK_TIMEOUT','IDEMPOTENCY_CONFLICT','INVALID_INTENT','CONFIRMATION_REQUIRED']);
export class ActionError extends Error { constructor(code,message=code){super(message);this.code=ACTION_ERRORS.has(code)?code:'PROVIDER_UNAVAILABLE';} }
const risk=new Map([['gmail.send','CONFIRM'],['gmail.draft','CONFIRM'],['calendar.create','CONFIRM'],['calendar.update','CONFIRM'],['calendar.delete','STRONG_CONFIRM'],['drive.create','CONFIRM'],['drive.update','STRONG_CONFIRM'],['nexo.sheet.update','STRONG_CONFIRM'],['github.issue.create','CONFIRM'],['github.pr.create','CONFIRM'],['github.merge','STRONG_CONFIRM'],['vercel.deploy','CONFIRM'],['vercel.promote','STRONG_CONFIRM']]);
export const confirmationFor=type=>risk.get(type)||'NONE';
export function normalizeIntent(input,now=Date.now()){
  if(!input||typeof input!=='object'||'authority' in input)throw new ActionError('INVALID_INTENT');
  for(const key of ['action_id','action_type','domain','provider','capability_id','target_ref','idempotency_key'])if(typeof input[key]!=='string'||!input[key].trim())throw new ActionError('INVALID_INTENT');
  return {action_id:input.action_id.trim(),action_type:input.action_type.trim(),domain:input.domain.trim().toUpperCase(),provider:input.provider.trim().toLowerCase(),capability_id:input.capability_id.trim(),target_ref:input.target_ref.trim(),requested_payload:input.requested_payload??{},requested_at:new Date(now).toISOString(),requested_by:'private-session',idempotency_key:input.idempotency_key.trim(),confirmation_level:confirmationFor(input.action_type)};
}
export const semanticKey=intent=>JSON.stringify([intent.action_type,intent.domain,intent.provider,intent.capability_id,intent.target_ref,intent.requested_payload]);
```

- [ ] **Step 4: Run tests GREEN and commit**

Run: `cd nexo-one && node --test test/action-contracts.test.mjs`
Expected: PASS.
Commit: `feat(nexo-one): add action intent contracts`

### Task 2: Authority and capability gate

**Files:**
- Create: `nexo-one/server/execution/gate.mjs`
- Test: `nexo-one/test/action-gate.test.mjs`

**Interfaces:**
- Consumes: normalized intent; `truthGraphInput.authorityRows`; `truthGraphInput.capabilityRows`.
- Produces: `gateIntent(intent,{truthGraphInput,confirmed}) -> {allowed,authority,capability,confirmation}` or throws `ActionError`.

- [ ] **Step 1: Write failing gate tests** covering unknown capability, `UNVERIFIED`, `PENDING_CANARY`, `BLOCKED`, authority/provider mismatch, missing confirmation, and client inability to override authority.

```js
const input={authorityRows:[{domain:'ENGINEERING',canonical_truth:'Git/GitHub for versioned code'}],capabilityRows:[{capability_id:'CAP-X',domain:'ENGINEERING',status:'PASS',provider:'github'}]};
assert.throws(()=>gateIntent({...intent,capability_id:'CAP-NOPE'},{truthGraphInput:input,confirmed:true}),/CAPABILITY_BLOCKED/);
assert.throws(()=>gateIntent(intent,{truthGraphInput:input,confirmed:false}),/CONFIRMATION_REQUIRED/);
assert.equal(gateIntent(intent,{truthGraphInput:input,confirmed:true}).allowed,true);
```

- [ ] **Step 2: Verify RED** with `node --test test/action-gate.test.mjs`.
- [ ] **Step 3: Implement domain/authority/provider resolution using canonical matrix rows and exact `PASS` matching.** Treat all non-`PASS` states as blocked. Derive expected provider from canonical authority using the same provider semantics as TruthGraph; never accept a client authority field.
- [ ] **Step 4: Run focused + TruthGraph tests GREEN**: `node --test test/action-gate.test.mjs test/truthgraph.test.mjs` (or the current TruthGraph test filename discovered in the repo).
- [ ] **Step 5: Commit** `feat(nexo-one): gate actions by authority and capability`.

### Task 3: Idempotency and receipt lifecycle without a new database

**Files:**
- Create: `nexo-one/server/execution/ledger.mjs`
- Test: `nexo-one/test/action-idempotency.test.mjs`

**Interfaces:**
- Produces: in-process bounded ledger `begin(intent)`, `ack(actionId,effect)`, `finish(actionId,verification)`, `get(actionId)`, `recent(limit)`.
- The ledger is a runtime execution cache, not canonical storage and not a Truth Owner; durable evidence remains provider/SSoT/Integrity readback.

- [ ] **Step 1: Write RED tests** proving same idempotency key + same semantic payload reuses one receipt, while same key + different semantic payload returns `IDEMPOTENCY_CONFLICT`.
- [ ] **Step 2: Implement a bounded Map ledger** capped at 200 receipts / 8 hours and compute SHA-256 semantic fingerprints.
- [ ] **Step 3: Add lifecycle statuses** `PLANNED -> GATED -> CONFIRMED -> DISPATCHED -> PROVIDER_ACK -> READBACK -> PASS|PENDING_READBACK|BLOCKED|FAILED|DEGRADED|CONFLICT`.
- [ ] **Step 4: Run tests GREEN and commit** `feat(nexo-one): add execution receipt ledger`.

### Task 4: Google write token scopes and adapter actions

**Files:**
- Modify: `nexo-one/server/adapters/connect.mjs`
- Modify: `nexo-one/server/adapters/google.mjs`
- Create: `nexo-one/server/adapters/google-actions.mjs`
- Modify: `nexo-one/scripts/google-auth.mjs`
- Test: `nexo-one/test/google-actions.test.mjs`

**Interfaces:**
- Produces: `googleToken(env,signal,{writeScopes=[]})`; `executeGoogle(action,ctx)`; `readbackGoogle(receipt,ctx)`.

- [ ] **Step 1: RED tests** verify read-only token requests stay least-privilege and Gmail send, Calendar mutation, Drive create/update, and Sheets update request only the needed write scope. Missing scope normalizes to `SCOPE_REQUIRED`.
- [ ] **Step 2: Extend Connect token helper** to accept explicit requested scopes merged with the existing four read scopes, without changing read-only callers.
- [ ] **Step 3: Implement Gmail actions** using Gmail `drafts.create` / `messages.send`; encode RFC 2822 message server-side; return stable message/draft id.
- [ ] **Step 4: Implement Calendar create/update/delete** with duplicate/conflict preflight, stable event id readback, and material-field comparison.
- [ ] **Step 5: Implement Drive create/update only for explicit target ids**; never overwrite from fuzzy search. Return file id/version and re-fetch metadata for readback.
- [ ] **Step 6: Implement Sheets bounded update** only for explicit spreadsheet id + A1 range after broker authority gate; re-read exact range and compare expected values.
- [ ] **Step 7: Run `node --test test/google-actions.test.mjs test/adapters.test.mjs test/google-auth-helper.test.mjs` GREEN and commit** `feat(nexo-one): add governed Google provider actions`.

### Task 5: GitHub action adapter

**Files:**
- Modify: `nexo-one/server/adapters/github.mjs`
- Create: `nexo-one/server/adapters/github-actions.mjs`
- Test: `nexo-one/test/github-actions.test.mjs`

**Interfaces:**
- Produces `executeGitHub(action,{env,signal})` and `readbackGitHub(receipt,{env,signal})`.

- [ ] **Step 1: RED tests** for issue create/update, branch/commit/PR creation, merge confirmation gate integration, provider rejection, and stable id/SHA readback.
- [ ] **Step 2: Implement only explicit repository/target operations** against `GITHUB_REPOSITORY`; reject targets outside the configured repository.
- [ ] **Step 3: Require `GITHUB_TOKEN` only for writes; preserve unauthenticated/public reads where supported.**
- [ ] **Step 4: Re-fetch issue/PR/commit/merge result by stable number/SHA before PASS.**
- [ ] **Step 5: Run focused + adapters tests GREEN and commit** `feat(nexo-one): add governed GitHub actions`.

### Task 6: Vercel action adapter

**Files:**
- Modify: `nexo-one/server/adapters/vercel.mjs`
- Create: `nexo-one/server/adapters/vercel-actions.mjs`
- Test: `nexo-one/test/vercel-actions.test.mjs`

**Interfaces:**
- Produces `executeVercel(action,{env,signal})` and `readbackVercel(receipt,{env,signal})`.

- [ ] **Step 1: RED tests** for existing-project-only deploy, explicit production promote strong-confirm semantics, foreign-project rejection, and source revision mismatch.
- [ ] **Step 2: Use `VERCEL_READ_TOKEN` for reads and `VERCEL_WRITE_TOKEN || VERCEL_READ_TOKEN` for action calls**, always pinning `VERCEL_TEAM_ID` and `VERCEL_PROJECT_ID`.
- [ ] **Step 3: Re-read deployment id until terminal state within the broker readback budget; compare project, target and source revision.**
- [ ] **Step 4: Return `CONFLICT` for READY deployment whose source revision differs from the approved revision; mark it material for Integrity projection.**
- [ ] **Step 5: Run GREEN and commit** `feat(nexo-one): add governed Vercel actions`.

### Task 7: Atlas readback bridge and provider action registry

**Files:**
- Create: `nexo-one/server/execution/providers.mjs`
- Modify: `nexo-one/server/adapters/atlas.mjs`
- Test: `nexo-one/test/action-providers.test.mjs`

**Interfaces:**
- Produces `providerActions={google,github,vercel,nexo,atlas}` with `execute/readback`; Atlas `execute` is unsupported/fail-closed and `readback` verifies projection only.

- [ ] **Step 1: RED test** that Atlas direct writes reject with `CAPABILITY_BLOCKED`, while projection readback can verify an entity/fingerprint after an underlying authority mutation.
- [ ] **Step 2: Implement registry dispatch** from intent provider/action type to the relevant adapter; unknown combinations fail closed.
- [ ] **Step 3: Run GREEN and commit** `feat(nexo-one): register action providers and Atlas readback`.

### Task 8: Action Broker orchestration

**Files:**
- Create: `nexo-one/server/execution/broker.mjs`
- Test: `nexo-one/test/action-broker.test.mjs`

**Interfaces:**
- Produces `planAction(input,ctx)`, `executeAction(input,ctx)`, `readbackAction(actionId,ctx)`, `recentActions(limit)`.

- [ ] **Step 1: RED tests** for full gate order, no side effect before confirmation, duplicate execute one effect, ambiguous timeout followed by readback before retry, 2xx ack + mismatch never PASS, and safe error serialization.
- [ ] **Step 2: Implement `planAction`**: normalize intent, load current private NEXO/TruthGraph inputs, resolve authority/capability, derive confirmation and before revision, persist PLANNED/GATED receipt in bounded ledger.
- [ ] **Step 3: Implement `executeAction`**: re-gate against fresh capability/authority, verify supplied confirmation token/level, dispatch exactly one provider action, record ack, then perform readback.
- [ ] **Step 4: Implement `readbackAction`** and final-state mapping; PASS only on matching provider evidence.
- [ ] **Step 5: Run broker/idempotency/gate tests GREEN and commit** `feat(nexo-one): add capability-gated action broker`.

### Task 9: Integrity projection for material execution failures

**Files:**
- Create: `nexo-one/server/execution/integrity.mjs`
- Modify: `nexo-one/server/execution/broker.mjs`
- Test: `nexo-one/test/action-integrity.test.mjs`

**Interfaces:**
- Produces `materialIncident(receipt)` and `persistMaterialIncident(receipt,ctx)` using the existing SSoT Integrity surface; non-material incidents return no write.

- [ ] **Step 1: RED tests** prove auth/scope/provider transients never persist, while canonical readback mismatch, duplicate ambiguous material effect, production SHA mismatch, and partial strong-confirm effect do persist and dedupe by semantic fingerprint.
- [ ] **Step 2: Implement incident classification** independently from provider transport errors.
- [ ] **Step 3: Persist through the existing NEXO/Sheets write path only after the NEXO authority/capability gate permits it; never alter AUTHORITY_MATRIX automatically.**
- [ ] **Step 4: Re-read the Integrity row to prove persistence and dedupe before returning persisted=true.**
- [ ] **Step 5: Run TruthGraph/Integrity regression suite GREEN and commit** `feat(nexo-one): project material action failures to Integrity`.

### Task 10: API action routes and private session integration

**Files:**
- Modify: `nexo-one/server/handler.mjs`
- Create: `nexo-one/test/action-routes.test.mjs`

**Interfaces:**
- Add current handler semantics for `actions-capabilities`, `actions-plan`, `actions-execute`, `actions-readback`, `actions-recent` (mapped by the existing API wrapper/routing pattern).

- [ ] **Step 1: RED route tests** verify public POST -> 401, same-origin required, arbitrary non-action writes stay 405, plan/execute/readback semantics stay separate, malformed body -> safe 400, and logout clears provider/action caches.
- [ ] **Step 2: Extend body limit only to the smallest value needed for bounded action payloads (64 KiB maximum) and reject larger bodies.**
- [ ] **Step 3: Wire private routes to broker**; do not serialize tokens/provider raw errors.
- [ ] **Step 4: Expose capability/action summaries through `/api/system` for the private UI.**
- [ ] **Step 5: Run session/security/action route tests GREEN and commit** `feat(nexo-one): expose private action broker routes`.

### Task 11: Private system state and projection-health explanations

**Files:**
- Modify: `nexo-one/server/compiler/system-state.mjs`
- Modify: `nexo-one/server/compiler/projection-bus.mjs`
- Test: `nexo-one/test/system-state.test.mjs`
- Test: `nexo-one/test/projection-bus.test.mjs`

**Interfaces:**
- System state gains safe `actions`, `executions`, `capabilityProofs`, and actionable degradation reasons.

- [ ] **Step 1: RED tests** require degraded bus output to name the exact envelope/provider/capability rather than only a count.
- [ ] **Step 2: Add execution summaries** with action id, provider, capability, state, source ref and before/after revision; never raw requested secrets or tokens.
- [ ] **Step 3: Add capability proof projection** from current CAPABILITY_MATRIX + last broker readback evidence.
- [ ] **Step 4: Run compiler tests GREEN and commit** `feat(nexo-one): project action evidence into system state`.

### Task 12: React control-plane surfaces

**Files:**
- Modify: `nexo-one/src/features/Workspace.tsx`
- Modify: `nexo-one/src/features/ProjectionBusStatus.tsx`
- Modify: `nexo-one/src/features/TruthGraphRadar.tsx`
- Create: `nexo-one/src/features/ActionCenter.tsx`
- Create: `nexo-one/src/features/ExecutionCenter.tsx`
- Create: `nexo-one/src/features/SourceHealth.tsx`
- Modify existing system feature files under `nexo-one/src/features/system/` as needed, following current patterns.
- Test: `nexo-one/test/frontend.test.mjs`
- Test: `nexo-one/test/browser.mjs`

**Interfaces:**
- UI calls only NEXO ONE server endpoints with same-origin credentials; no external provider calls.

- [ ] **Step 1: Add RED frontend tests** for actionable projection badge, action planning, exact provider/target/material diff confirmation modal, strong confirmation, execution trace, source scope health, and evidence links.
- [ ] **Step 2: Implement `Precisa de você`** to contain only human decisions: confirmations, authority conflict, credential/scope blockers.
- [ ] **Step 3: Implement `Actions`** with planned intent, target, capability, required confirmation and disabled controls for non-PASS capabilities.
- [ ] **Step 4: Implement `Execution`** trace `planned -> gated -> confirmed -> dispatched -> provider_ack -> readback -> final`, receipt/source refs, before/after revision.
- [ ] **Step 5: Extend TruthGraph/Capabilities/Sources/Integrity/Atlas views** with action/readback evidence and safe capability proof details.
- [ ] **Step 6: Keep Now/Loops/Day/Context/Recall on private live data when authenticated and public-safe projections otherwise.**
- [ ] **Step 7: Run `npm run typecheck`, frontend tests and browser desktop/mobile GREEN; commit** `feat(nexo-one): integrate full control plane UI`.

### Task 13: Environment contract and production configuration diagnostics

**Files:**
- Modify: `nexo-one/.env.example`
- Modify: `nexo-one/README.md`
- Test: `nexo-one/test/security.test.mjs`

**Interfaces:**
- Document `NEXO_SHEET_ID`, `NEXO_ACTION_REGISTER_ID`, Google Connect/OIDC or legacy fallback, `GITHUB_TOKEN`, `VERCEL_READ_TOKEN`, optional `VERCEL_WRITE_TOKEN`, Atlas endpoint/token, and session variables.

- [ ] **Step 1: RED security test** scans build/public state and ensures no secret variable value or secret-like env key is client-exposed.
- [ ] **Step 2: Add safe `/api/health` diagnostics** indicating `configured:true/false` and missing capability class, never values.
- [ ] **Step 3: Update docs and run security/session tests GREEN; commit** `docs(nexo-one): document control plane configuration`.

### Task 14: Full regression, release artifact, and preview deployment

**Files:**
- Modify only release scripts/tests if a release packaging regression is discovered.

- [ ] **Step 1: Run full local/CI-equivalent gate**

Run: `cd nexo-one && npm run check && npm run test:browser`
Expected: all tests and Vite build PASS.

- [ ] **Step 2: Verify release package contains every hashed JS/CSS asset explicitly** using existing `release-config.test.mjs`; correct any regression before deploy.
- [ ] **Step 3: Push branch/PR and require CI GREEN**. Do not promote a red artifact.
- [ ] **Step 4: Deploy exact CI artifact/commit to the existing NEXO ONE Vercel project as preview.**
- [ ] **Step 5: Preview readback**: `/`, hashed JS MIME, hashed CSS MIME, `/api/session`, `/api/world`, public projection privacy, action route unauthenticated denial.
- [ ] **Step 6: If preview private credentials are available, prove live reads without writes. If unavailable, leave exact providers visibly `AUTH_REQUIRED`/`SCOPE_REQUIRED`, not PASS.**

### Task 15: Production promotion and real provider canaries

**Files:** none unless a canary exposes a defect, in which case return to RED/GREEN before promotion.

- [ ] **Step 1: Promote the exact verified release to the existing production project.**
- [ ] **Step 2: Production asset readback** proves HTML, JS `application/javascript`, CSS `text/css`, and API JSON.
- [ ] **Step 3: Production private-session readback** proves `configured:true` and successful login only if the required session secrets are actually configured. If not, classify the release as code-complete but environment-blocked and do not fabricate PASS.
- [ ] **Step 4: For each authorized provider, run one non-destructive live read**: Drive, Gmail, Calendar, GitHub, Vercel, NEXO SSoT, Atlas.
- [ ] **Step 5: For each provider with an approved writable PASS capability and safe reversible target, run one explicitly scoped canary through the Action Broker, then read it back.** Never invent or broaden a target merely to satisfy a test.
- [ ] **Step 6: Recompile TruthGraph and inspect Integrity.** Unexpected material conflict -> release DEGRADED/FAIL until reconciled.
- [ ] **Step 7: Verify duplicate canary request does not produce a second effect under the supported idempotency contract.**
- [ ] **Step 8: Record final release matrix** per provider: code support, credential/scope state, live read proof, write proof, readback proof, final capability status.

## Self-review

- Spec coverage: authentication, service OIDC, every declared provider, broker/gates, confirmation, idempotency, readback, Integrity/TruthGraph, public projection, API/UI, errors, browser testing, deployment, rollback-friendly no-schema design, and production acceptance are each mapped to tasks above.
- Placeholder scan: no `TBD`, `TODO`, “implement later”, or unspecified test step remains.
- Type consistency: normalized intent flows `normalizeIntent -> gateIntent -> ledger -> providerActions -> broker -> API -> system state -> UI`; provider actions always return stable effect evidence and readback finalizes receipts; public routes never enter the broker.
