# Atlas WebMCP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a progressive, agent-native WebMCP surface to Atlas that shares existing Atlas session actions and preserves NEXO/TOWER_V06 authority.

**Architecture:** A small browser adapter registers bounded WebMCP tools from an injected Atlas Semantic Core. The core reads current Atlas state and invokes existing `AtlasActions`; canonical writes are capability-gated and remain absent when backend write support is unavailable. WebMCP is optional and never becomes a truth owner.

**Tech Stack:** React 19, TypeScript 5.9, Vite 8, Node test runner, Chrome WebMCP Imperative API (`document.modelContext`).

**Spec:** `docs/superpowers/specs/2026-09-16-atlas-webmcp-design.md`

## Global Constraints
- `TOWER_V06` remains the sole operational truth owner.
- No new MCP server, database, queue, scheduler, agent fleet, or browser credential.
- Human UI must work unchanged without WebMCP.
- No generic mutation tool.
- Canonical writes require backend capability and readback.
- WebMCP annotations are hints, not authorization.

---

### Task 1: Freeze WebMCP tool contract

**Files:**
- Create: `atlas-control-tower/test/atlas-webmcp.test.mjs`
- Create: `atlas-control-tower/src/webmcp/atlas-webmcp.mjs`

**Interfaces:**
- Produces: `createAtlasWebMcpToolDescriptors(core)` and `registerAtlasWebMcp({documentLike, core})`.

- [ ] Write failing tests for progressive absence, bounded READ/UI_WRITE descriptors, annotations, execution delegation, and lifecycle unregister.
- [ ] Run Atlas Quality and verify RED occurs only because WebMCP implementation is missing.
- [ ] Implement descriptor generation and registration with `AbortController` lifecycle.
- [ ] Run unit tests and verify GREEN.

### Task 2: Add Atlas Semantic Core

**Files:**
- Create: `atlas-control-tower/src/webmcp/atlas-semantic-core.mjs`
- Extend: `atlas-control-tower/test/atlas-webmcp.test.mjs`

**Interfaces:**
- Consumes: injected `getState`, `actions`, `getRoute`, and capability snapshot.
- Produces: `createAtlasSemanticCore(options)` with `get_status`, `get_current_context`, `get_selection`, `get_entity`, `focus_entity`, `select_entity`, `search`, `sync`, and `get_capabilities`.

- [ ] Write failing behavior tests against real injected state/actions rather than mocks of WebMCP internals.
- [ ] Verify RED.
- [ ] Implement minimal core.
- [ ] Verify GREEN.

### Task 3: Mount progressive WebMCP in React

**Files:**
- Modify: `atlas-control-tower/src/App.tsx`
- Extend: `atlas-control-tower/test/atlas-webmcp.test.mjs`

**Interfaces:**
- Consumes: live `state`, `actions`, current route, and semantic core.
- Produces: one lifecycle effect that registers/re-registers tools when meaningful Atlas context changes.

- [ ] Add failing integration contract proving App mounts one WebMCP adapter and does not branch human UI on WebMCP availability.
- [ ] Verify RED.
- [ ] Add memoized semantic core plus lifecycle effect.
- [ ] Verify unit tests, typecheck, and build.

### Task 4: Capability-gate canonical writes

**Files:**
- Modify: `atlas-control-tower/src/webmcp/atlas-semantic-core.mjs`
- Modify: `atlas-control-tower/src/webmcp/atlas-webmcp.mjs`
- Extend: `atlas-control-tower/test/atlas-webmcp.test.mjs`

**Interfaces:**
- `get_capabilities` reports canonical write availability honestly.
- Write/execute descriptors are emitted only when capability says available; v1 exposes no destructive tool.

- [ ] Write failing tests proving `towerWriteConfigured=false` omits canonical write/execution tools.
- [ ] Verify RED.
- [ ] Implement capability gating.
- [ ] Verify GREEN and no frontend secrets.

### Task 5: PR, CI, deploy/readback

**Files:**
- No new production files.

- [ ] Run complete Atlas Quality on branch.
- [ ] Open PR with RED/GREEN evidence and security boundary.
- [ ] Merge only after tests, typecheck, build, and package succeed.
- [ ] Verify `main` Atlas Quality and Pages readback.
- [ ] Verify Vercel `/api/mcp` remains healthy and no runtime errors appear.
- [ ] Report WebMCP production caveat: browser API remains progressive/experimental and canonical writes remain fail-closed until backend write capability is configured.