# NEXO ONE Private MCP + Graphs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add secure PIN-backed private access, scoped MCP/API integration, and multiple graph projections to NEXO ONE while keeping GitHub Pages public-safe and backend-independent.

**Architecture:** Keep one canonical chain from adapters through WorldState/SystemState/Projection Bus and derive every graph from that state. GitHub Pages continues to serve public static snapshots; the private runtime serves session, personal, action and private projection routes. Authentication reuses the existing scrypt/HttpOnly session design; authorization remains risk-aware and capability-gated.

**Tech Stack:** Node.js 24+, React 19, TypeScript 5.9, Vite 8, Babylon.js 9, Node test runner, Playwright browser tests, MCP Node SDK, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-16-nexo-one-private-mcp-graphs-design.md`

## Global Constraints

- Literal PIN `2301` must never appear in frontend bundles, source maps, static Pages artifacts, query strings, browser storage, public JSON/NDJSON or public MCP payloads.
- Store only the derived `scrypt` hash in `NEXO_PASSWORD_HASH`; keep `NEXO_SESSION_SECRET` private and at least 32 bytes.
- Public GitHub Pages must render without Vercel or any private backend.
- Public MCP/API must never expose private-provider payloads.
- Private + LOW risk may execute only with PASS capability, executable contract and expected readback path.
- MEDIUM/HIGH risk always retains an explicit Human Gate.
- The frontend remains non-authoritative; every graph is a projection of canonical state.
- No decorative 3D; position/size/relations must have deterministic semantics.

---

### Task 1: Auth hardening and PIN rate limiting

**Files:**
- Create: `nexo-one/server/auth/login-rate-limit.mjs`
- Modify: `nexo-one/server/auth/session-route.mjs`
- Modify: `nexo-one/server/handler.mjs`
- Test: `nexo-one/test/session.test.mjs`
- Test: `nexo-one/test/private-access.test.mjs`

**Interfaces:**
- Produces: `checkLoginAttempt(key, now)`, `recordLoginFailure(key, now)`, `clearLoginFailures(key)`.
- Consumes: existing `verifyPassword`, `makeSession`, `cookie`, `sameOrigin`.

- [ ] **Step 1: Write failing tests**

Add tests covering wrong PIN => 401, fifth failed attempt => 429, successful auth clears failure counter, logout => PUBLIC, expired session => PUBLIC, and generated cookie contains `HttpOnly`, `SameSite=Strict`, and `Secure` for non-local hosts.

- [ ] **Step 2: Verify tests fail**

Run: `cd nexo-one && node --test test/session.test.mjs test/private-access.test.mjs`
Expected: FAIL for missing rate-limit behavior.

- [ ] **Step 3: Implement in-memory bounded rate limiter**

Implement a small runtime-local limiter keyed by request IP/fallback key with 5 failures per 15 minutes. Return 429 without disclosing secret details. Document that durability is per runtime instance.

- [ ] **Step 4: Wire limiter into session POST**

Before password verification, reject locked keys. On wrong PIN, record failure. On success, clear failure state and issue existing signed cookie.

- [ ] **Step 5: Verify tests pass**

Run the focused tests, then `npm run typecheck`.

- [ ] **Step 6: Commit**

Commit message: `feat(auth): harden private PIN sessions`

---

### Task 2: Risk-aware action authorization

**Files:**
- Modify: `nexo-one/server/personal/service.mjs`
- Modify: `nexo-one/server/handler.mjs`
- Test: `nexo-one/test/personal-actions.test.mjs`

**Interfaces:**
- Produces: policy that permits autonomous private execution only for LOW risk + PASS capability + expected readback path.
- Consumes: existing proposal/approval contract and capability state.

- [ ] **Step 1: Write failing authorization tests**

Cover LOW/PASS/readback expected => executable without extra approval; MEDIUM/HIGH => approval required; UNVERIFIED/UNKNOWN/BLOCKED => denied; missing readback path => denied.

- [ ] **Step 2: Verify tests fail**

Run: `cd nexo-one && node --test test/personal-actions.test.mjs`

- [ ] **Step 3: Implement minimal policy**

Centralize the eligibility check in `server/personal/service.mjs` and keep the handler thin.

- [ ] **Step 4: Verify focused tests pass**

Run focused tests and `npm run typecheck`.

- [ ] **Step 5: Commit**

Commit message: `feat(actions): enforce risk-aware private execution`

---

### Task 3: Scoped MCP cockpit read tools

**Files:**
- Modify: `nexo-one/server/mcp/server.mjs`
- Modify: `nexo-one/server/mcp/tools.mjs`
- Modify: `nexo-one/server/handler.mjs`
- Test: `nexo-one/test/mcp-server.test.mjs`
- Test: `nexo-one/test/mcp-access.test.mjs`

**Interfaces:**
- Adds public-safe tools: `get_system_state`, `get_world_state`, `get_capabilities`, `get_execution_runs`, `get_graph`, `get_learning_state`, `get_provider_health`.
- Public tool execution receives PUBLIC projections only.
- Private MCP access must be explicit and never inferred from unrelated browser state.

- [ ] **Step 1: Write failing MCP tests**

Assert new tools are registered, return structured content, and public calls cannot surface Gmail/Calendar/private Drive content.

- [ ] **Step 2: Verify tests fail**

Run: `cd nexo-one && node --test test/mcp-server.test.mjs test/mcp-access.test.mjs`

- [ ] **Step 3: Implement projection-backed tools**

Build responses directly from existing WorldState/SystemState data; do not duplicate adapter logic in MCP files.

- [ ] **Step 4: Wire explicit access scope in handler**

Keep `/api/mcp` public-safe by default. If private MCP is exposed later, use a distinct explicit server-side access decision.

- [ ] **Step 5: Verify tests pass**

Run focused tests and `npm run typecheck`.

- [ ] **Step 6: Commit**

Commit message: `feat(mcp): expose scoped cockpit read models`

---

### Task 4: Pure graph projection builders

**Files:**
- Create: `nexo-one/src/viewmodels/graph-modes.ts`
- Modify: `nexo-one/src/contracts/system.ts`
- Test: `nexo-one/test/graph-modes.test.mjs`

**Interfaces:**
- Produces: `GraphMode = 'general'|'operations'|'truth'|'capabilities'|'learning'|'nexo'`.
- Produces: `buildGraphMode(state, mode, access)` returning `{nodes, edges}` using existing `GraphNode`/`GraphEdge` contracts.

- [ ] **Step 1: Write failing projection tests**

Cover Operations mapping `ACTION -> CAPABILITY -> RUNTIME -> EFFECT -> READBACK`; Truth mapping SUPPORTS/CONTRADICTS/VERIFIES; Capability mapping capability/provider/runtime/evidence; Learning preserving support/contradiction/boundary semantics; NEXO public placeholders for private entities.

- [ ] **Step 2: Verify tests fail**

Run: `cd nexo-one && node --test test/graph-modes.test.mjs`

- [ ] **Step 3: Extend graph contract minimally**

Add only the node types/relation kinds required by the spec, preserving backward compatibility for General Atlas.

- [ ] **Step 4: Implement pure builders**

No DOM, Babylon, fetch or React logic in projection builders. Inputs and outputs stay deterministic/testable.

- [ ] **Step 5: Verify tests pass**

Run focused tests and `npm run typecheck`.

- [ ] **Step 6: Commit**

Commit message: `feat(graph): add deterministic NEXO graph projections`

---

### Task 5: Atlas graph-mode navigation and deep links

**Files:**
- Modify: `nexo-one/src/app/navigation.ts`
- Modify: `nexo-one/src/app/App.tsx`
- Modify: `nexo-one/src/features/system/Atlas.tsx`
- Test: `nexo-one/test/cockpit-audit.test.mjs`
- Test: `nexo-one/test/graph-navigation.test.mjs`

**Interfaces:**
- Produces stable links for `#atlas/general`, `#atlas/operations`, `#atlas/truth`, `#atlas/capabilities`, `#atlas/learning`, `#atlas/nexo`.
- Preserves existing `#atlas` compatibility by normalizing it to General.

- [ ] **Step 1: Write failing navigation tests**

Cover initial parse, refresh restore, hashchange, back/forward and legacy `#atlas` compatibility.

- [ ] **Step 2: Verify tests fail**

Run focused navigation tests.

- [ ] **Step 3: Implement graph-mode parsing/serialization**

Keep the view ID `ATLAS`; encode mode as nested hash state without breaking other views.

- [ ] **Step 4: Add selector wiring**

Desktop: segmented/select control. Mobile: compact dropdown/sheet. Persist selected entity only when it exists in the new graph.

- [ ] **Step 5: Verify tests pass**

Run focused tests and typecheck.

- [ ] **Step 6: Commit**

Commit message: `feat(atlas): add graph modes and deep links`

---

### Task 6: Render all graph modes in Atlas

**Files:**
- Modify: `nexo-one/src/features/system/Atlas.tsx`
- Modify: `nexo-one/src/components/Atlas3DCanvas.tsx`
- Modify: `nexo-one/src/components/inspector.tsx`
- Modify: `nexo-one/src/styles/*.css`
- Test: `nexo-one/test/browser.mjs`

**Interfaces:**
- Consumes: `buildGraphMode` and graph mode from Task 4/5.
- Preserves General Atlas behavior and existing filters.

- [ ] **Step 1: Add browser assertions before UI code**

Assert each graph mode renders, inspector opens, selector works, and mobile uses bottom-sheet inspector without horizontal overflow.

- [ ] **Step 2: Verify browser test fails**

Run targeted browser suite locally/CI-compatible path.

- [ ] **Step 3: Render projected graphs**

Reuse the same 3D canvas and inspector. Map state/authority/freshness deterministically; do not add decorative animation.

- [ ] **Step 4: Add mode-aware legend/filter behavior**

Only show filters meaningful for the active graph while preserving search.

- [ ] **Step 5: Verify browser tests pass**

Run `npm run test:browser`.

- [ ] **Step 6: Commit**

Commit message: `feat(atlas): render operational truth capability learning graphs`

---

### Task 7: Private access UX and runtime handoff

**Files:**
- Modify: `nexo-one/src/app/App.tsx`
- Modify: `nexo-one/src/app/useSession.ts`
- Modify: `nexo-one/src/features/PersonalCockpit.tsx`
- Modify: `nexo-one/src/styles/*.css`
- Test: `nexo-one/test/browser.mjs`
- Test: `nexo-one/test/cockpit-audit.test.mjs`

**Interfaces:**
- Public Pages redirects to configured private runtime while preserving current view/mode.
- Private runtime opens PIN dialog, authenticates through `/api/session`, then refreshes private world/system state.

- [ ] **Step 1: Write failing browser/unit tests**

Assert public Pages never submits PIN cross-origin, private runtime shows PIN modal, generic invalid-PIN error, PRIVATE indicator after success, logout returns PUBLIC, runtime unavailable is explicit.

- [ ] **Step 2: Verify tests fail**

Run focused tests.

- [ ] **Step 3: Implement session-aware UX**

Keep PIN input ephemeral in React state only; clear immediately after submit; never persist it.

- [ ] **Step 4: Preserve active deep link across public/private handoff**

Carry only view/graph mode, never credentials.

- [ ] **Step 5: Verify tests pass**

Run focused unit/browser tests.

- [ ] **Step 6: Commit**

Commit message: `feat(private): add secure cockpit access flow`

---

### Task 8: Overview, Sources, Execution and entity table cleanup

**Files:**
- Modify: `nexo-one/src/features/system/Overview.tsx`
- Modify: `nexo-one/src/features/system/Integrity.tsx`
- Modify: `nexo-one/src/features/system/Operations.tsx`
- Modify relevant table/viewmodel files under `nexo-one/src/viewmodels/`
- Test: `nexo-one/test/cockpit-audit.test.mjs`
- Test: `nexo-one/test/browser.mjs`

**Interfaces:**
- Zero counters include coverage.
- Capability cards show summary counts with expandable detail.
- Execution renders full trace when runs exist.
- GitHub issue rows prioritize title/status/domain/relation; raw ID is secondary.

- [ ] **Step 1: Add failing regression assertions**

Cover all four UI semantics above.

- [ ] **Step 2: Verify tests fail**

Run focused tests.

- [ ] **Step 3: Implement UI changes**

Keep current visual language and accessibility patterns.

- [ ] **Step 4: Verify tests pass**

Run focused tests plus browser suite.

- [ ] **Step 5: Commit**

Commit message: `feat(cockpit): make coverage execution and capabilities operational`

---

### Task 9: Public artifact secret scan and Pages independence

**Files:**
- Modify: `nexo-one/scripts/build-pages-system.mjs`
- Modify: `.github/workflows/nexo-one-pages.yml`
- Create: `nexo-one/scripts/verify-public-artifact.mjs`
- Modify: `nexo-one/package.json`
- Test: `nexo-one/test/pages-public.test.mjs`

**Interfaces:**
- Produces public `system.json` and `world-public.ndjson` with no private payload.
- Produces artifact verification command that scans built output for forbidden literals/config markers and backend dependency regressions.

- [ ] **Step 1: Write failing public-artifact tests**

Assert public snapshot has no Gmail/Calendar/private provider payload and Pages env contains no private backend dependency required for rendering.

- [ ] **Step 2: Verify tests fail where appropriate**

Run focused tests.

- [ ] **Step 3: Implement artifact verifier**

Scan `dist/` for the literal PIN, `NEXO_PASSWORD_HASH`, `NEXO_SESSION_SECRET`, private cookies and other forbidden secret markers. Fail non-zero on detection.

- [ ] **Step 4: Add verifier to `npm run check` and Pages workflow**

Run after build/static compilation.

- [ ] **Step 5: Verify tests/build pass**

Run `npm run check` and explicit static build flow.

- [ ] **Step 6: Commit**

Commit message: `test(pages): enforce public artifact isolation`

---

### Task 10: Full verification and production readback

**Files:**
- No feature code unless a verification failure proves a defect.

**Interfaces:**
- Produces evidence for final SHA, CI, Pages, API/MCP, graph modes and private runtime status.

- [ ] **Step 1: Run full check**

Run: `cd nexo-one && npm run check`
Expected: all typecheck/tests/style/build PASS.

- [ ] **Step 2: Run browser suite**

Run: `cd nexo-one && npm run test:browser`
Expected: desktop/mobile dark/light and graph/private flows PASS.

- [ ] **Step 3: Verify GitHub Pages workflow**

Confirm Pages deploy succeeds on final SHA and public URL serves current assets.

- [ ] **Step 4: Read back public artifacts**

Verify `system.json` and `world-public.ndjson` return current generated state and contain no private data.

- [ ] **Step 5: Verify private runtime**

Confirm `/api/session`, `/api/personal`, `/api/world`, `/api/system`, `/api/mcp`; authenticate using the server-side hash derived from the chosen PIN and verify PRIVATE readback.

- [ ] **Step 6: Verify authorization**

Demonstrate LOW/PASS/readback action eligibility and MEDIUM/HIGH Human Gate retention without executing destructive/high-risk side effects.

- [ ] **Step 7: Report exact blockers**

If deployment infrastructure still blocks the private runtime, report the exact platform error and keep public completion separate from private-runtime completion.
