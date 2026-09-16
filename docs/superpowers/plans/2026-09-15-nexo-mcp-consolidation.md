# NEXO MCP Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate NEXO semantic operations onto the already-running `nexo-atlas-control-tower.vercel.app/api/mcp` endpoint while keeping `byDenoso/NEXO-Obsidian-Vault@main:TOWER_V06` as the sole operational truth owner.

**Architecture:** Extend the existing Atlas Control Tower MCP with authenticated semantic tools backed by the existing Tower GitHub gateway. Public discovery stays public; private reads and mutations require bearer auth and continue through mutation inbox -> receipt -> exact readback -> runtime dispatch. `services/nexo-api` remains reference/runtime code but stops being a required hosted front door.

**Tech Stack:** Node.js 24, ESM, Vercel Functions, JSON-RPC/MCP, GitHub Contents API, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-15-nexo-mcp-consolidation-design.md`

## Global Constraints

- `byDenoso/NEXO-Obsidian-Vault@main:TOWER_V06` remains the sole operational truth owner.
- No new database, queue, scheduler, truth store, agent fleet or deployment provider.
- Public discovery must remain available without mutation authority.
- Private reads, Tower mutations, runtime dispatch and health lifecycle require bearer authentication.
- Tower writes fail closed without a server-side GitHub credential.
- No arbitrary general CRUD endpoint is introduced.
- Scientific closure remains `RESULT -> HYPOTHESIS_RECONCILIATION -> CLAIM_UPDATE_OR_NO_CHANGE -> NEXT_TEST_OR_TERMINALIZE -> READBACK`.
- Existing scientific intake fingerprint/dedupe and Tower-first persistence remain intact.

---

### Task 1: Freeze the consolidated MCP contract

**Files:**
- Create: `atlas-control-tower/test/mcp-consolidated-surface.test.mjs`
- Modify: `atlas-control-tower/test/scientific-mcp-http.test.mjs`

**Interfaces:**
- Consumes: existing `createScientificMcpHttpHandler`, `handleMcpRpc`, `createTowerGithubGateway`.
- Produces: executable contract for public discovery, authenticated semantic tool discovery, fail-closed mutation auth, and backward compatibility of `nexo_submit_scientific_tests_v1`.

- [ ] **Step 1: Write failing contract tests**

Add Node tests that assert:

```js
assert.equal(publicList.names.includes('nexo.get_bootstrap'), true);
assert.equal(publicList.names.includes('nexo.get_capabilities'), true);
assert.equal(publicList.names.includes('nexo.create_work'), false);
assert.equal(authenticatedList.names.includes('nexo.create_work'), true);
assert.equal(authenticatedList.names.includes('nexo.run_work'), true);
assert.equal(authenticatedList.names.includes('nexo.observe_health_issue'), true);
assert.equal(authenticatedList.names.includes('nexo.start_health_repair'), true);
assert.equal(authenticatedList.names.includes('nexo.resolve_health_issue'), true);
assert.equal(unauthenticatedMutation.statusCode, 401);
```

Preserve a regression assertion that `nexo_submit_scientific_tests_v1` remains discoverable and callable under the existing authenticated scientific path.

- [ ] **Step 2: Run the focused tests and confirm RED**

Run from `atlas-control-tower`:

```bash
node --test test/mcp-consolidated-surface.test.mjs test/scientific-mcp-http.test.mjs
```

Expected: failures because the authenticated semantic tools are not registered yet.

- [ ] **Step 3: Commit the RED contract**

```bash
git add test/mcp-consolidated-surface.test.mjs test/scientific-mcp-http.test.mjs
git commit -m "test(mcp): freeze consolidated semantic surface"
```

### Task 2: Add a provider-neutral Tower semantic gateway

**Files:**
- Modify: `atlas-control-tower/lib/tower-github-gateway.mjs`
- Create: `atlas-control-tower/lib/nexo-semantic-gateway.mjs`
- Create: `atlas-control-tower/test/nexo-semantic-gateway.test.mjs`

**Interfaces:**
- Consumes: existing GitHub content read/write helpers and Tower mutation receipt model.
- Produces: `createNexoSemanticGateway({towerGateway})` with read methods and deterministic semantic mutation helpers used by MCP tools.

Required interface:

```js
{
  status(),
  getState(),
  getWork(workId),
  getNextWork(role),
  getMutation(requestId),
  createWork(input),
  transitionWork(command,input),
  prepareCampaign(input),
  getCampaigns(),
  getInterdomain(),
  readback(runId),
  getEvidence(evidenceId),
  runWork(input),
  runCampaign(input)
}
```

`createWork` and `transitionWork` must build deterministic mutation request ids and call a generalized `submitTowerMutation(request)` on the existing Tower gateway. `submitTowerMutation` must persist to `TOWER_V06/mutations/inbox/<request_id>.json`, wait for `mutations/receipts/<request_id>.json`, then read back the target entity before returning success.

- [ ] **Step 1: Write gateway tests with an in-memory fake Tower gateway**

Assert that `createWork` emits a canonical `entity_kind='work'` mutation, preserves `expected_version`, uses `writer_role`, waits for receipt, and returns entity readback. Assert `runWork` delegates only after canonical work/readback exists.

- [ ] **Step 2: Run focused gateway tests and confirm RED**

```bash
node --test test/nexo-semantic-gateway.test.mjs
```

Expected: module/function not found.

- [ ] **Step 3: Generalize the existing Tower GitHub gateway**

Add methods without changing existing scientific intake behavior:

```js
submitTowerMutation(request)
readEntity(kind,id)
readJson(path)
listJsonDirectory(path)
```

Keep the current `persistTest`, `readbackTest`, `findByFingerprint`, `resolveCapability` and `dispatchTest` as compatibility wrappers.

- [ ] **Step 4: Implement `nexo-semantic-gateway.mjs` minimally**

Use only Tower paths and the existing runtime dispatch contract. Do not create provider-local state.

- [ ] **Step 5: Run focused tests GREEN and commit**

```bash
node --test test/nexo-semantic-gateway.test.mjs test/scientific-mcp.test.mjs test/tower-github-gateway.test.mjs
```

Expected: PASS.

```bash
git add lib/tower-github-gateway.mjs lib/nexo-semantic-gateway.mjs test/nexo-semantic-gateway.test.mjs
git commit -m "feat(mcp): add Tower semantic gateway"
```

### Task 3: Port health dedupe and repair-first semantics onto the same Tower gateway

**Files:**
- Create: `atlas-control-tower/lib/nexo-health.mjs`
- Create: `atlas-control-tower/test/nexo-health.test.mjs`

**Interfaces:**
- Consumes: `createNexoSemanticGateway` work read/mutation methods.
- Produces:

```js
observeHealthIssue(gateway,input)
startHealthRepair(gateway,input)
resolveHealthIssue(gateway,input)
```

The fingerprint input is exactly:

```text
invariant_or_defect_code | affected_entity_kind | affected_entity_id | root_cause_code
```

Normalize whitespace/case, SHA-256 the tuple, derive `WORK-HEALTH-<20 hex>`, and preserve the lifecycle `NEW -> REPAIRING -> RESOLVED`, with recurrence from `RESOLVED` becoming `REGRESSED` under the same work id.

- [ ] **Step 1: Write failing health tests**

Cover:

```js
assert.equal(first.status,'HEALTH_ISSUE_CREATED');
assert.equal(second.status,'NO_OP_DUPLICATE_HEALTH_ISSUE');
assert.equal(second.notify,false);
assert.equal(repair.state,'REPAIRING');
assert.equal(resolved.state,'RESOLVED');
assert.equal(regressed.state,'REGRESSED');
assert.equal(regressed.work_id,first.work_id);
```

Require at least one `resolution_evidence_ref` before resolution.

- [ ] **Step 2: Run RED**

```bash
node --test test/nexo-health.test.mjs
```

- [ ] **Step 3: Implement minimal deterministic health lifecycle**

Port the current Python semantics from `services/nexo-api/app/health_surface.py`, keeping canonical WORK/CAS semantics and no second incident store.

- [ ] **Step 4: Run GREEN and commit**

```bash
node --test test/nexo-health.test.mjs test/nexo-semantic-gateway.test.mjs
```

```bash
git add lib/nexo-health.mjs test/nexo-health.test.mjs
git commit -m "feat(mcp): add canonical health lifecycle"
```

### Task 4: Register authenticated semantic tools on the existing MCP endpoint

**Files:**
- Modify: `atlas-control-tower/lib/scientific-mcp.mjs`
- Modify: `atlas-control-tower/lib/scientific-mcp-http.mjs`
- Modify: `atlas-control-tower/api/mcp.js`
- Modify: `atlas-control-tower/.env.example`
- Test: `atlas-control-tower/test/mcp-consolidated-surface.test.mjs`

**Interfaces:**
- Consumes: `createScientificMcpService`, `createNexoSemanticGateway`, health functions.
- Produces one JSON-RPC/MCP endpoint with public discovery tools and authenticated semantic tools.

Authenticated tool names to register in this migration:

```text
nexo.status
nexo.get_state
nexo.get_work
nexo.get_next_work
nexo.get_mutation
nexo.create_work
nexo.handoff_work
nexo.start_work
nexo.submit_result
nexo.block_work
nexo.complete_work
nexo.prepare_campaign
nexo.run_work
nexo.run_campaign
nexo.readback
nexo.get_evidence
nexo.get_campaigns
nexo.get_interdomain
nexo.observe_health_issue
nexo.start_health_repair
nexo.resolve_health_issue
```

Keep these existing public/discovery/intake names compatible:

```text
nexo.get_bootstrap
nexo.get_capabilities
nexo_submit_scientific_tests_v1
```

- [ ] **Step 1: Split tool discovery by authorization**

`tools/list` must expose public tools to unauthenticated callers and the full semantic surface only to authenticated callers. `tools/call` on private tools without a valid bearer must return the existing unauthorized JSON-RPC error contract.

- [ ] **Step 2: Route tool calls to the semantic gateway**

Map command tools to `transitionWork` with explicit command names. Do not expose arbitrary mutation payloads.

- [ ] **Step 3: Register health tools**

Route the three health tools through `nexo-health.mjs` and return structured MCP results, preserving no-op status/notify fields.

- [ ] **Step 4: Run focused MCP tests GREEN**

```bash
node --test test/mcp-consolidated-surface.test.mjs test/scientific-mcp-http.test.mjs test/scientific-mcp.test.mjs test/nexo-semantic-gateway.test.mjs test/nexo-health.test.mjs
```

- [ ] **Step 5: Commit**

```bash
git add lib/scientific-mcp.mjs lib/scientific-mcp-http.mjs api/mcp.js .env.example test/mcp-consolidated-surface.test.mjs
git commit -m "feat(mcp): consolidate semantic NEXO tools"
```

### Task 5: Verify full project, deploy preview, then promote/document canonical endpoint

**Files:**
- Modify: `atlas-control-tower/README.md`
- Modify: `docs/superpowers/specs/2026-09-15-nexo-mcp-consolidation-design.md` only if implementation exposes a material contract difference.

**Interfaces:**
- Consumes: complete consolidated MCP implementation.
- Produces: verified preview/production behavior and documentation that `https://nexo-atlas-control-tower.vercel.app/api/mcp` is the official hosted NEXO MCP front door.

- [ ] **Step 1: Run complete Atlas Control Tower verification**

```bash
npm test
npm run typecheck
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 2: Open PR and wait for CI**

The PR description must list RED evidence, GREEN evidence, auth model, rollback, and explicitly state that Tower remains sole truth owner.

- [ ] **Step 3: Verify preview endpoint**

Perform real HTTP/MCP checks:

```text
GET /api/mcp -> 200 bootstrap/health descriptor
initialize -> success
tools/list unauthenticated -> public-only surface
private tools/call unauthenticated -> Unauthorized
tools/list authenticated -> full semantic surface
```

If preview lacks a GitHub mutation credential, authenticated mutation must fail closed rather than simulate success.

- [ ] **Step 4: Merge only after CI and preview checks pass**

Use squash merge with expected head SHA.

- [ ] **Step 5: Verify production readback after merge**

Repeat public endpoint checks against `https://nexo-atlas-control-tower.vercel.app/api/mcp`. If production has Tower write credential, exercise one reversible semantic work/health mutation and confirm receipt + exact readback; if not configured, record `towerWriteConfigured=false` as the sole external credential blocker and do not weaken auth.

- [ ] **Step 6: Update README and final migration status**

Document Vercel MCP as official hosted front door and Railway-hosted `services/nexo-api` as non-required for ordinary hosted operation. Do not delete useful Python runtime/reference code in this change.
