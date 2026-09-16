# NEXO Semantic Product Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make NEXO Atlas and NEXO ONE use one coherent semantic navigation model, remove dead controls, and ship verified desktop/mobile behavior.

**Architecture:** NEXO Atlas will stop mounting a second self-owned graph session inside `GraphsPage` and will render from the existing `useAtlasSession` state. Graph routing will never synthesize a Science parent. NEXO ONE Atlas will become a progressive 2D semantic drill-down over its `SystemState.graph`, with explicit first-level domains and real Operations routes kept separate from graph domains.

**Tech Stack:** React, TypeScript, Canvas/DOM graph renderer, Node test runner, GitHub Actions, Vercel/GitHub Pages.

**Spec:** user-approved total semantic scan in this conversation.

## Global Constraints

- No `UNKNOWN -> SCIENCE` fallback.
- Root graph exposes Science, Engineering and Olympus as first-level domains; NEXO is the root, not a sibling domain card.
- Operations is an operational workspace, not a substitute semantic domain.
- Presentation/layout relations never become canonical relations.
- Controls without an observable effect are removed or disabled with explanation.
- Browser back/forward and mobile interaction remain functional.

---

### Task 1: Freeze semantic routing regressions

**Files:**
- Modify: `atlas-control-tower/test/atlas-shell-semantic-hydration.test.mjs`
- Modify: `atlas-control-tower/test/atlas-neural-navigation.test.mjs`
- Create: `nexo-one/test/atlas-semantic-drilldown.test.ts`

**Interfaces:**
- Consumes: `routeFor`, Atlas shell source, NEXO ONE graph viewmodel.
- Produces: regression tests proving no synthetic Science parent and real three-domain root.

- [ ] Write failing tests for semantic hydration, split-session removal, and three-domain progressive root.
- [ ] Run focused tests and verify RED.
- [ ] Implement the minimum semantic/navigation repair.
- [ ] Run focused tests and verify GREEN.

### Task 2: Make NEXO Atlas single-owner and functional

**Files:**
- Modify: `atlas-control-tower/src/App.tsx`
- Modify: `atlas-control-tower/src/pages/graphs-page.tsx`

**Interfaces:**
- Consumes: `useAtlasSession` state/actions.
- Produces: one graph session for focus, selection, route, back/forward, filters and controls.

- [ ] Remove the Science hydration fallback.
- [ ] Stop mounting the self-loading Neural surface from `GraphsPage`.
- [ ] Re-enable the existing canonical graph workspace and its controls.
- [ ] Verify navigation controls mutate the same session and URL.

### Task 3: Make NEXO ONE Atlas progressive and comprehensible

**Files:**
- Create: `nexo-one/src/viewmodels/semanticGraph.ts`
- Modify: `nexo-one/src/features/system/Atlas.tsx`
- Modify: `nexo-one/src/styles/app.css` or active equivalent stylesheet.

**Interfaces:**
- Consumes: `SystemState.graph`.
- Produces: `semanticRoot`, `semanticChildren`, `semanticBreadcrumbs`, and a 2D progressive graph surface.

- [ ] Add pure semantic projection helpers.
- [ ] Render root as Science, Engineering and Olympus only.
- [ ] Drill into one domain/node at a time; preserve breadcrumbs/back.
- [ ] Remove 3D clutter from the primary path and keep inspector/details functional.

### Task 4: Remove decorative/dead surfaces

**Files:**
- Modify: `nexo-one/src/app/navigation.ts`
- Modify: `nexo-one/src/app/App.tsx`
- Modify: `atlas-control-tower/src/App.tsx`

**Interfaces:**
- Consumes: current navigation declarations.
- Produces: only routes with real behavior; unavailable capabilities are visibly disabled.

- [ ] Remove non-authoritative GitHub-only visual surface if present.
- [ ] Keep operational views wired to Actions/Execution/Inbox.
- [ ] Make unavailable private controls explicit instead of inert.

### Task 5: Validate and ship

**Files:**
- Modify tests/workflows only if a reproducible CI defect blocks verification.

**Interfaces:**
- Produces: green tests, typecheck, build, browser verification, merge and deployment readback.

- [ ] Run project test suites and typechecks.
- [ ] Run production builds.
- [ ] Verify desktop and mobile controls in Chromium.
- [ ] Merge only after green CI.
- [ ] Verify GitHub Pages and Vercel readback and report any external credential blocker explicitly.
