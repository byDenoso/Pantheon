# NEXO Atlas Breakthrough Canvas 2.5D Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Canvas 2.5D into the primary Breakthrough “Modo Atlas” renderer with full-screen cognitive-map UX, semantic zoom, spatial domain fields, focus tunnel and meaningful learning filaments while preserving NEXO hierarchy and truth contracts.

**Architecture:** Keep `app.mjs` as graph-state owner and the existing renderer factory/runtime as the only renderer-selection authority. Extend the native Canvas renderer through focused drawing/visibility modules so the Breakthrough behavior remains deterministic, mobile-safe and reusable without creating a second graph state. Semantic depth is visual only; hierarchy, SSOT and associative memory stay unchanged.

**Tech Stack:** ES modules, Canvas 2D API, existing deterministic 3.5D layout/projection, GraphRenderer contract, Node test runner, Chromium browser smoke, Vite.

**Spec:** `docs/superpowers/specs/2026-09-10-breakthrough-canvas-25d-design.md`

## Global Constraints

- Preserve canonical NEXO IDs and hierarchy.
- Canvas 2.5D remains `mobileSafe:true` and uses the existing GraphRenderer contract.
- Semantic/procedural memories remain overlay-only and `DERIVED_NOT_TRUTH`.
- Missing filament weight must preserve legacy edge width.
- No WebGL dependency is introduced for this release.
- Respect `prefers-reduced-motion` and existing mobile bottom-sheet/navigation behavior.
- Renderer details remain under Advanced; primary UX exposes product concepts, not library names.

---

### Task 1: Freeze Breakthrough Canvas contracts

**Files:**
- Create: `test/graph-lab-breakthrough-canvas-25d.test.mjs`
- Modify: `graph-lab/graph/renderers/renderer-registry.mjs`
- Test: `test/graph-lab-breakthrough-canvas-25d.test.mjs`

**Interfaces:**
- Consumes: `rendererById(id)`, `rendererCapabilities(id)`.
- Produces: `canvas-25d` remains native/mobile-safe and exposes `supportsDepth:true`; new product preset id `BREAKTHROUGH_ATLAS` is reserved for later tasks.

- [ ] **Step 1: Write failing renderer-contract tests**

```js
assert.equal(RENDERERS['canvas-25d'].implementation,'native');
assert.equal(RENDERERS['canvas-25d'].mobileSafe,true);
assert.equal(rendererCapabilities('canvas-25d').supportsDepth,true);
assert.match(read('graph/renderers/visual-presets.mjs'),/BREAKTHROUGH_ATLAS/);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test test/graph-lab-breakthrough-canvas-25d.test.mjs`
Expected: FAIL because `BREAKTHROUGH_ATLAS` does not exist yet.

- [ ] **Step 3: Add only the preset placeholder contract**

Add `BREAKTHROUGH_ATLAS` to `visual-presets.mjs` with conservative values; detailed values are finalized in Task 7.

- [ ] **Step 4: Re-run focused tests**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add test/graph-lab-breakthrough-canvas-25d.test.mjs graph-lab/graph/renderers/visual-presets.mjs
git commit -m "test(atlas): freeze breakthrough canvas 2.5d contract"
```

### Task 2: Introduce semantic zoom policy

**Files:**
- Create: `graph-lab/graph/renderers/canvas-semantic-zoom.mjs`
- Modify: `graph-lab/graph/legacy-renderer.mjs`
- Test: `test/graph-lab-breakthrough-canvas-25d.test.mjs`

**Interfaces:**
- Produces: `semanticZoomBand(cameraZoom)` returning `overview | domain | program | audit`.
- Produces: `semanticVisibility(node,{band,selectedId,focusId,graph}) -> {visible,priority,alpha}`.

- [ ] **Step 1: Add RED tests for four zoom bands and visibility**

```js
assert.equal(semanticZoomBand(.45),'overview');
assert.equal(semanticZoomBand(.9),'domain');
assert.equal(semanticZoomBand(1.6),'program');
assert.equal(semanticZoomBand(2.6),'audit');
assert.equal(semanticVisibility(memory,{band:'overview',selectedId:null,focusId:'system:NEXO',graph}).visible,false);
```

- [ ] **Step 2: Run focused tests and confirm failure**

- [ ] **Step 3: Implement deterministic semantic zoom**

Use zoom thresholds defined in one exported constant. Overview shows NEXO, three macrodomains and strongest cross-domain filaments. Domain shows local groups/programs. Program shows campaigns/tests plus relevant associative memories. Audit prioritizes selected node and one-hop relations.

- [ ] **Step 4: Integrate visibility into `legacy-renderer.mjs` before projection/drawing**

Do not mutate `this.graph`; derive `visibleNodes` and `visibleEdges` per frame/update.

- [ ] **Step 5: Verify tests and commit**

```bash
git commit -am "feat(atlas): add semantic zoom to canvas 2.5d"
```

### Task 3: Build domain-field geometry

**Files:**
- Create: `graph-lab/graph/renderers/canvas-domain-fields.mjs`
- Modify: `graph-lab/graph/legacy-renderer.mjs`
- Modify: `graph-lab/graph/palette.mjs`
- Test: `test/graph-lab-breakthrough-canvas-25d.test.mjs`

**Interfaces:**
- Produces: `buildDomainField(points,domainId) -> {center,radius,hull,depth}`.
- Produces: `drawDomainField(ctx,field,style)`.

- [ ] **Step 1: Write RED geometry tests**

Assert that a field is derived only from visible descendants of a canonical domain and contains no invented node ids.

- [ ] **Step 2: Implement a deterministic soft hull**

Use projected domain descendants, padded centroid/radius and a small fixed number of contour arcs. No physics simulation and no random values beyond existing deterministic hashes.

- [ ] **Step 3: Add restrained field palette**

Ciência = muted cyan/blue, Olympus = muted violet, Engenharia = muted green, all below 0.16 alpha. NEXO uses warm bone/gold.

- [ ] **Step 4: Draw fields behind filaments and nodes**

Order: background → domain fields → guides → filaments → nodes → labels.

- [ ] **Step 5: Verify screenshots/smoke and commit**

```bash
git commit -am "feat(atlas): render spatial domain fields in canvas 2.5d"
```

### Task 4: Make depth cues physically consistent

**Files:**
- Modify: `graph-lab/graph/projection.mjs`
- Modify: `graph-lab/graph/legacy-renderer.mjs`
- Test: `test/graph-lab-breakthrough-canvas-25d.test.mjs`

**Interfaces:**
- Produces: projected point depth metrics `scale`, `depthAlpha`, `parallax` without changing node semantics.

- [ ] **Step 1: Add RED tests for monotonic depth behavior**

Nearer point must render larger and more opaque than a farther point at the same semantic level.

- [ ] **Step 2: Implement bounded depth transforms**

Clamp scale/alpha so distant nodes never disappear solely because of z. Keep picking radius aligned with visual radius.

- [ ] **Step 3: Add subtle parallax to drag/yaw only**

No continuous floating background. Reduced-motion removes nonessential drift.

- [ ] **Step 4: Verify picking and fit remain correct**

Run existing picking/layout tests plus the Breakthrough suite.

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(atlas): refine canvas 2.5d depth cues"
```

### Task 5: Add Focus Tunnel

**Files:**
- Create: `graph-lab/graph/renderers/canvas-focus-tunnel.mjs`
- Modify: `graph-lab/graph/legacy-renderer.mjs`
- Modify: `graph-lab/graph/experience/node-action-bar.mjs`
- Test: `test/graph-lab-breakthrough-canvas-25d.test.mjs`

**Interfaces:**
- Produces: `focusTunnel(graph,selectedId) -> {nodeIds,edgeIds}`.
- Renderer consumes the returned sets to dim unrelated graph elements.

- [ ] **Step 1: Write RED tests for one-hop and ancestry emphasis**

The tunnel must include selected node, canonical ancestors, direct descendants, direct associative memories and incident learning filaments. It must not expand unrelated macrodomains.

- [ ] **Step 2: Implement graph-only tunnel derivation**

No network calls and no mutation of expanded hierarchy state.

- [ ] **Step 3: Render unrelated content at 0.10–0.18 alpha**

Selected/related content remains full strength. Domain fields outside the tunnel fade as well.

- [ ] **Step 4: Add explicit `FOCAR` / `LIMPAR FOCO` affordance where appropriate**

Reuse existing selection/open semantics; do not make simple click automatically drill down.

- [ ] **Step 5: Verify and commit**

```bash
git commit -am "feat(atlas): add focus tunnel to canvas 2.5d"
```

### Task 6: Upgrade learning-filament visual grammar

**Files:**
- Modify: `graph-lab/graph/filaments.mjs`
- Modify: `graph-lab/graph/legacy-renderer.mjs`
- Test: `test/graph-lab-associative-memory-v1.test.mjs`
- Test: `test/graph-lab-breakthrough-canvas-25d.test.mjs`

**Interfaces:**
- Consumes: `filamentWeight(edge)`, `filamentStatusAlpha(edge)`, `filamentKind(edge)`.
- Produces: deterministic visual style `{width,alpha,dash,pulseDirection,pulseStrength}`.

- [ ] **Step 1: Freeze legacy no-weight behavior in a RED/guard test**

```js
assert.equal(styleFor({kind:'canonical'}).width,legacyWidth);
```

- [ ] **Step 2: Implement weighted/status-aware styling only for declared associative filaments**

Supported = stable line; candidate = lighter/dashed; dormant = faint; contradiction = restrained break/reverse pulse.

- [ ] **Step 3: Make pulse density proportional to explicit weight**

No pulse when reduced-motion is active.

- [ ] **Step 4: Verify canonical edges remain pixel-contract compatible in width/alpha defaults**

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(atlas): encode filament evidence in canvas 2.5d"
```

### Task 7: Create Breakthrough visual preset and rustic atlas identity

**Files:**
- Modify: `graph-lab/graph/renderers/visual-presets.mjs`
- Create: `graph-lab/graph/experience/breakthrough-atlas-v7.css`
- Modify: `graph-lab/graph/experience/editorial-observatory-v5.mjs`
- Modify: `graph-lab/graph/experience/ui-clarity-v6.css`
- Test: `test/graph-lab-breakthrough-canvas-25d.test.mjs`

**Interfaces:**
- Preset id: `BREAKTHROUGH_ATLAS`.
- DOM identity: `data-atlas-visual="breakthrough"`.

- [ ] **Step 1: Add RED tests for the preset and CSS identity hook**

- [ ] **Step 2: Finalize preset**

Recommended starting values: `stars:90`, `glow:.42`, `fog:.28`, `focalLength:790`, `drift:0`, `pulseSpeed:.68`, `filamentCurve:.12`, `maxLabels:20`, `maxVisibleNodes:96`, `transitionMs:360`, `backgroundIntensity:.54`, `autoOrbit:false`.

- [ ] **Step 3: Implement rustic scientific-atlas shell**

Charcoal background, thin bone/sepia dividers, serif entity headings, minimal glass, no high-saturation neon bloom. Keep domain color accents muted and data-driven.

- [ ] **Step 4: Keep renderer selector under Advanced**

Primary UX names the mode `Atlas`/`Breakthrough`, not `Canvas 2.5D`.

- [ ] **Step 5: Verify and commit**

```bash
git commit -am "feat(atlas): add breakthrough atlas visual identity"
```

### Task 8: Full-screen Modo Atlas shell

**Files:**
- Modify: `graph-lab/index.html`
- Modify: `graph-lab/app.mjs`
- Modify: `graph-lab/graph/experience/visual-experience-v4.mjs`
- Modify: `graph-lab/graph/experience/mobile-ux-v6.mjs`
- Modify: `graph-lab/graph/experience/mobile-ui-v6.css`
- Test: `test/graph-lab-ux-navigation-v5.test.mjs`
- Test: `test/graph-lab-mobile-ui-v6.test.mjs`

**Interfaces:**
- Experience id: `BREAKTHROUGH`.
- Default renderer for this experience: desktop `canvas-25d`; mobile `canvas-25d` when safe, fallback `canvas-2d` only on explicit performance degradation policy.

- [ ] **Step 1: Add RED tests for experience resolution**

- [ ] **Step 2: Add the `BREAKTHROUGH` experience**

Select `canvas-25d`, `BREAKTHROUGH_ATLAS`, semantic zoom enabled, focus tunnel enabled, filaments context-sensitive.

- [ ] **Step 3: Reduce permanent chrome**

Graph becomes the dominant stage. Inspector remains contextual. Existing bottom mobile navigation and bottom sheet are reused.

- [ ] **Step 4: Preserve explicit open CTA**

Selection and `ABRIR DOMÍNIO/SUBGRAFO/VER CAMPAIGNS` remain separate actions.

- [ ] **Step 5: Verify and commit**

```bash
git commit -am "feat(atlas): introduce full-screen breakthrough experience"
```

### Task 9: Performance budget and render invalidation

**Files:**
- Modify: `graph-lab/graph/legacy-renderer.mjs`
- Modify: `graph-lab/graph/experience/mobile-ux-v6.mjs`
- Test: `test/graph-lab-native-renderers-v7.test.mjs`
- Test: `test/graph-lab-breakthrough-canvas-25d.test.mjs`

**Interfaces:**
- Add internal dirty flags: `geometryDirty`, `labelsDirty`, `backgroundDirty`.
- No change to public GraphRenderer contract.

- [ ] **Step 1: Add lifecycle tests for no extra RAF/listener leaks**

- [ ] **Step 2: Avoid recomputing labels/domain fields when camera/data did not change**

- [ ] **Step 3: Suspend decorative rendering when mobile bottom sheet is expanded**

- [ ] **Step 4: Keep DPR capped at 2 and reduce background work under `MOBILE_CLEAN`**

- [ ] **Step 5: Commit**

```bash
git commit -am "perf(atlas): optimize breakthrough canvas render loop"
```

### Task 10: Browser E2E for Breakthrough Canvas 2.5D

**Files:**
- Modify: `test/graph-lab-browser-smoke.mjs`
- Modify: `.github/workflows/atlas-quality.yml`

**Interfaces:**
- Browser smoke must accept `?experience=BREAKTHROUGH&renderer-v4=canvas-25d`.

- [ ] **Step 1: Add desktop smoke at 1440×1000**

Assert Canvas 2.5D surface exists, NEXO/three macrodomains render, semantic zoom changes visible-node count, Filamentos toggles associative memory and Focus Tunnel dims unrelated content.

- [ ] **Step 2: Add mobile smoke at 375×812 and 393×852**

Assert no horizontal overflow, touch targets >=44px, bottom nav accessible, cockpit opens/expands/closes, semantic zoom is more aggressive and Canvas remains active.

- [ ] **Step 3: Add reduced-motion smoke**

Emulate `prefers-reduced-motion: reduce` and assert no continuous auto-orbit/pulse animation requirement.

- [ ] **Step 4: Run full quality gate**

```bash
npm test
npm run typecheck
npm run build
node test/graph-lab-browser-smoke.mjs
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git commit -am "test(atlas): gate breakthrough canvas 2.5d experience"
```

### Task 11: Production promotion and readback

**Files:**
- Modify only deployment/bootstrap pin as required by current Graph Lab Vercel wrapper.

- [ ] **Step 1: Verify Atlas Quality is green for the exact head SHA**

- [ ] **Step 2: Deploy the exact tested commit to the Graph Lab Vercel project**

- [ ] **Step 3: Wait for `READY` and production alias assignment**

- [ ] **Step 4: Read back `https://nexo-atlas-graph-lab.vercel.app/`**

Assert HTTP 200 and bootstrap references the exact tested commit.

- [ ] **Step 5: Record release status**

Final report must include commit SHA, CI run, deployment id, alias, renderer/experience selected and any remaining known limitations.

## Rollout Sequence

Phase 1: Tasks 1–4 establish semantic zoom, domain fields and reliable depth without changing shell behavior.

Phase 2: Tasks 5–7 add Focus Tunnel, filament language and the rustic Breakthrough identity.

Phase 3: Tasks 8–9 expose the experience and optimize desktop/mobile rendering.

Phase 4: Tasks 10–11 make the browser gate mandatory and promote only the exact green commit.

## Definition of Done

Canvas 2.5D is the default renderer of the `BREAKTHROUGH` experience; the graph occupies the visual majority of the viewport; macrodomains read as spatial regions; semantic zoom prevents clutter; Focus Tunnel makes relationships understandable; associative memory remains transverse and auditable; mobile preserves bottom navigation and bottom-sheet UX; no existing renderer/hierarchy/truth contract regresses; full CI and browser smoke pass; and Vercel production readback confirms the tested commit.