# Atlas Semantic Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make NEXO Atlas domain tabs and overlays select genuinely different semantic subgraphs, eliminate implicit Science fallback, and keep presentation layout separate from canonical knowledge edges.

**Architecture:** Move domain classification/context projection into pure semantic helpers so it can be tested independently. The Neural surface will consume those helpers, use a domain-specific focus anchor, and expose unavailable overlays as unavailable instead of inert. Presentation clusters remain layout metadata; canonical relations remain the only semantic edges.

**Tech Stack:** React 19, TypeScript 5.9, Three/R3F, Node test runner.

**Spec:** User-reported Atlas graph/navigation defect and root-cause audit from 2026-09-16.

## Global Constraints

- TOWER_V06 remains the truth owner; Atlas remains a projection.
- Do not fabricate missing Operations, Health, Evidence, Learning, or Automation entities.
- Keep PRIMARY_DOMAINS as NEXO, SCIENCE, OPERATIONS, HEALTH and overlays as LEARNING, AUTOMATIONS, EVIDENCE.
- Preserve existing public Atlas routes and build pipeline.
- Unknown entities must never silently become SCIENCE.

---

### Task 1: Semantic domain classification and context projection

**Files:**
- Modify: `atlas-control-tower/src/atlas-v3/semantic-v4.mjs`
- Test: `atlas-control-tower/test/atlas-semantic-domain-routing.test.mjs`

**Interfaces:**
- Produces: `semanticDomainForNode(node)`, `focusIdForPrimaryDomain(domain)`, `graphForSemanticContext(scene, domain, overlays)`, `overlayAvailability(scene)`.

- [ ] **Step 1: Write the failing test**

Test explicit Science, Engineering/NEXO, Olympus/Health, domain-aware WORK/ACTION, unknown fallback, domain focus anchors, distinct graph membership, and overlay availability.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern="semantic domain routing"`
Expected: FAIL because the semantic helpers do not yet exist.

- [ ] **Step 3: Write minimal implementation**

Implement classification from declared domain/type, return `UNCLASSIFIED` for unknowns, and build context graphs without cross-domain leakage.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --test-name-pattern="semantic domain routing"`
Expected: PASS.

### Task 2: Separate presentation layout from canonical relations

**Files:**
- Modify: `atlas-control-tower/src/atlas-v3/scene-adapter.mjs`
- Test: `atlas-control-tower/test/atlas-semantic-domain-routing.test.mjs`

**Interfaces:**
- Keeps: `layoutParent` for positioning.
- Produces: `scene.graph.edges` containing canonical source edges only.

- [ ] **Step 1: Add a failing test**

Assert presentation clusters exist and carry layout parentage while synthetic presentation `CONTAINS` edges do not appear in `scene.graph.edges`.

- [ ] **Step 2: Run and observe RED**

Run: `npm test -- --test-name-pattern="presentation layout"`
Expected: FAIL because synthetic presentation edges are currently merged with canonical edges.

- [ ] **Step 3: Implement minimal separation**

Retain synthetic nodes and `layoutParent`, stop appending presentation edges to canonical graph edges.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- --test-name-pattern="presentation layout"`
Expected: PASS.

### Task 3: Make Neural domain tabs operate on semantic contexts

**Files:**
- Modify: `atlas-control-tower/src/atlas-v3/AtlasV3App.tsx`
- Modify: `atlas-control-tower/test/atlas-neural-navigation.test.mjs`

**Interfaces:**
- Consumes: helpers from Task 1.
- Behavior: NEXO starts at NEXO; Science/Operations/Health select their own focus anchor and graph; unavailable overlays are disabled with explicit zero availability.

- [ ] **Step 1: Add failing source/behavior contract assertions**

Assert the app imports the shared semantic projection helpers, defaults to NEXO, and does not contain `return'SCIENCE'` fallback logic.

- [ ] **Step 2: Run and observe RED**

Run: `npm test -- --test-name-pattern="Neural semantic navigation"`
Expected: FAIL on the old duplicated logic.

- [ ] **Step 3: Replace duplicated domain logic**

Use semantic helpers, set domain-specific focus anchors on toolbar click, keep search/open navigation domain-aware, and disable overlays absent from the snapshot.

- [ ] **Step 4: Verify GREEN**

Run targeted tests, then `npm test`, `npm run typecheck`, and `npm run build`.

### Task 4: Prevent shell route hydration from forcing Science

**Files:**
- Modify: `atlas-control-tower/src/App.tsx`
- Modify: `atlas-control-tower/src/atlas-route.ts`
- Test: `atlas-control-tower/test/atlas-route-public-contract.test.mjs`

**Interfaces:**
- Preserve legacy URLs.
- New graph context serialization must not infer Science when no Science segment was specified.

- [ ] **Step 1: Add failing route contract test**

Assert generic `/mapa/<context>` paths do not inject `science` and explicit Science paths still round-trip.

- [ ] **Step 2: Run and observe RED**

Run targeted route tests.

- [ ] **Step 3: Remove implicit Science hydration/serialization fallback**

Hydrate explicit graph paths literally and only use `system:SCIENCE` when the path explicitly names Science.

- [ ] **Step 4: Verify GREEN**

Run full test/typecheck/build suite.

### Task 5: PR, CI, merge, production readback

- [ ] **Step 1:** Open PR from `fix/atlas-semantic-navigation` to `main`.
- [ ] **Step 2:** Confirm Atlas Quality passes unit/contract tests, TypeScript, and production build.
- [ ] **Step 3:** Review PR diff for accidental route/source-contract regressions.
- [ ] **Step 4:** Merge to `main` only after green checks.
- [ ] **Step 5:** Verify the merged SHA and deployment/readback status; report any external deployment blocker instead of claiming production success.
