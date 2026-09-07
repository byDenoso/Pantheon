# NEXO Atlas Premium V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a premium A+B visual redesign and make every workspace tab visibly functional, then verify the complete Atlas frontend before production promotion.

**Architecture:** Preserve the existing data/session/view separation. Introduce a small workspace controller for deterministic view switching and one final premium stylesheet to replace the competing readability/motion override layers. Keep graph rendering and Neon-backed APIs unchanged except where regression tests prove a UI contract issue.

**Tech Stack:** Vanilla ES modules, Canvas 2D graph renderer, CSS, Node test runner, Playwright browser regression, Vercel, Neon Data API.

**Spec:** `docs/superpowers/specs/2026-09-07-atlas-premium-v2-design.md`

## Global Constraints
- Official scientific truth remains read-only from Neon science_v1.
- Learning remains read-only from learning_v1.
- Black Box remains read-only from nexo_ops.
- No new framework dependencies.
- Manual sync remains uncached; automatic sync cadence remains 12 hours.
- Dark theme combines cosmic canvas with scientific-luxury controls; light theme must preserve strong node distinction.
- `prefers-reduced-motion` must disable non-essential motion.

---

### Task 1: Reproduce and lock the workspace-tab regression

**Files:**
- Create: `atlas-control-tower/test/workspace.test.mjs`
- Modify: `atlas-control-tower/test/browser.cjs`

**Interfaces:**
- Consumes: current `data-mode` button markup and workspace sections.
- Produces: explicit behavioral contract for `modeState(mode)` and browser visibility expectations.

- [ ] **Step 1: Write failing unit tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {modeState} from '../ui/workspace.mjs';

test('workspace modes expose exactly the intended primary surface', () => {
  assert.deepEqual(modeState('overview'), {map:true,data:false,learning:false,audit:false});
  assert.deepEqual(modeState('explore'), {map:false,data:true,learning:false,audit:false});
  assert.deepEqual(modeState('learning'), {map:false,data:false,learning:true,audit:false});
  assert.deepEqual(modeState('audit'), {map:false,data:false,learning:false,audit:true});
});

test('unknown workspace mode falls back to overview', () => {
  assert.deepEqual(modeState('wat'), {map:true,data:false,learning:false,audit:false});
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- test/workspace.test.mjs`
Expected: FAIL because `ui/workspace.mjs` does not exist.

- [ ] **Step 3: Extend the browser contract before implementation**

Add checks after each top-level tab click that the selected tab has `aria-selected="true"`, its panel is visible near the main workspace, and `.universe` is hidden for Dados/Learning/Auditoria but visible for Mapa.

- [ ] **Step 4: Commit tests only**

Commit message: `test(atlas): lock workspace tab behavior`

---

### Task 2: Implement deterministic workspace switching

**Files:**
- Create: `atlas-control-tower/ui/workspace.mjs`
- Modify: `atlas-control-tower/app.mjs`
- Modify: `atlas-control-tower/index.html`
- Modify: `atlas-control-tower/frontend-files.mjs`
- Modify: `atlas-control-tower/vercel.json`

**Interfaces:**
- Produces: `modeState(mode)` and `applyWorkspaceMode(mode,{scroll,focus})`.
- `app.mjs` remains orchestration-only and calls the workspace controller.

- [ ] **Step 1: Implement `modeState` minimally**

```js
const VALID = new Set(['overview','explore','learning','audit']);
export function modeState(mode='overview') {
  const m = VALID.has(mode) ? mode : 'overview';
  return {map:m==='overview',data:m==='explore',learning:m==='learning',audit:m==='audit'};
}
```

- [ ] **Step 2: Run unit test**

Run: `npm test -- test/workspace.test.mjs`
Expected: PASS.

- [ ] **Step 3: Add DOM application**

`applyWorkspaceMode` must set `body.dataset.mode`, `hidden` on the four primary surfaces, `aria-selected` on `[data-mode]`, and `tabindex` consistently. It returns the selected panel element so orchestration can scroll/focus without duplicating selectors.

- [ ] **Step 4: Wire `app.mjs`**

Replace the scattered hidden toggles in `setMode` with `applyWorkspaceMode`. Keep `loadLearning`, `loadAudit`, `renderData`, inspector refresh and session UI state unchanged. When a non-map tab is selected, scroll its panel into view using `behavior: reduced-motion ? 'auto' : 'smooth'`.

- [ ] **Step 5: Add accessible tab semantics**

Add `role="tablist"` to `.tabs`; each workspace button gets `role="tab"` and `aria-controls`. Panels get matching IDs/`role="tabpanel"`.

- [ ] **Step 6: Commit**

Commit message: `fix(atlas): make workspace tabs real view switches`

---

### Task 3: Consolidate the premium visual system

**Files:**
- Create: `atlas-control-tower/ui/premium-v2.css`
- Modify: `atlas-control-tower/index.html`
- Modify: `atlas-control-tower/frontend-files.mjs`
- Modify: `atlas-control-tower/vercel.json`
- Modify: `atlas-control-tower/ui/tokens.css`

**Interfaces:**
- `premium-v2.css` is the final presentation authority.
- Existing `styles.css` and `official-dashboard.css` keep layout/component primitives.
- `motion-impact.css` and `readability.css` are no longer loaded by `index.html`.

- [ ] **Step 1: Define final tokens**

Dark tokens: `--bg:#02050a`, `--surface:#07101b`, `--raised:#0b1724`, `--text:#f4f8fc`, `--muted:#a8b8c9`, cyan/violet/magenta/emerald/amber/red semantic accents. Light tokens use cool white surfaces, `--text:#13263a`, strong borders, saturated node accents.

- [ ] **Step 2: Create premium typography and surfaces**

Use system font stack with stronger optical hierarchy: body 14px/1.55, controls 12px, primary headings 24-28px, inspector body 13-14px. Remove blanket text shadows. Use sparse borders, layered shadows, and glass only for topbar/controls/inspector.

- [ ] **Step 3: Cosmic map treatment**

Keep the canvas interactive. Add restrained nebula gradients and starfield pseudo-elements behind it, stronger vignette, and deeper universe shadow without lowering text contrast.

- [ ] **Step 4: Scientific-luxury controls**

Restyle topbar, sidebar, tabs, filters, cards, data table, Learning ladder, Audit categories, Black Box panels and Inspector with consistent radius/spacing/border rules. Active state uses one luminous edge or underline rather than glow on every border.

- [ ] **Step 5: Motion system**

Use 120-180ms interaction transitions and 220-280ms panel entrances. Avoid translating entire reading surfaces on hover. Keep button press, tab underline, inspector slide and graph control micro-motion. Honor `prefers-reduced-motion`.

- [ ] **Step 6: Mobile**

At 760px: compact topbar, visible sidebar drawer, horizontal tab scroller, full-width panels, table horizontal container without document overflow, inspector bottom-sheet style, minimum 44px touch targets for primary controls.

- [ ] **Step 7: Commit**

Commit message: `feat(atlas): apply Premium V2 cosmic laboratory system`

---

### Task 4: Graph impact and legibility pass

**Files:**
- Modify: `atlas-control-tower/ui/visual-config.mjs`
- Modify: `atlas-control-tower/graph3d.mjs`
- Modify: `atlas-control-tower/test/camera.test.mjs`
- Modify: `atlas-control-tower/test/layers.test.mjs`

**Interfaces:**
- Preserve node IDs, graph contract, navigation and click/open semantics.
- Only visual geometry, animation timing and contrast change.

- [ ] **Step 1: Add assertions for system color separation and node-size hierarchy**

Tests assert unique colors for NEXO/SCIENCE/LEARNING/AUTOMATION/ENGINEERING/OLYMPUS and `coreRadius > groupRadius > nodeRadius`.

- [ ] **Step 2: Verify RED if current config violates new thresholds**

Run: `npm test -- test/camera.test.mjs test/layers.test.mjs`.

- [ ] **Step 3: Tune renderer**

Increase primary node contrast, add crisp outer ring plus restrained halo, increase label contrast in both themes, keep root view to principal system nodes, retain progressive disclosure on click, and shorten expansion easing to ~240ms.

- [ ] **Step 4: Re-run graph tests**

Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat(atlas): sharpen graph hierarchy and motion`

---

### Task 5: Full code review and regression cleanup

**Files:**
- Review: all files under `atlas-control-tower/ui/`, `atlas-control-tower/lib/`, `atlas-control-tower/app.mjs`, `graph3d.mjs`, `api/runtime-v2.js`, `vercel.json`, tests.
- Modify only files with verified defects.

**Interfaces:**
- No new product behavior beyond approved Premium V2 and bug fixes.

- [ ] **Step 1: Static consistency review**

Check dead selectors, duplicate theme overrides, stale English UI copy, missing frontend-file declarations, routes/build declarations, unhandled promise paths, stale selectors in browser tests, missing null guards and mobile overflow rules.

- [ ] **Step 2: API contract review**

Verify `health`, `state`, `graph`, `entity`, `learning`, `audit`, `ops`, `sync` routes remain routed through runtime-v2 and Black Box/Learning special IDs do not fall through to science entity lookup.

- [ ] **Step 3: Fix only confirmed defects with regression tests first**

Each defect gets a failing test or explicit browser assertion before code changes.

- [ ] **Step 4: Commit**

Commit message: `fix(atlas): close Premium V2 regression audit`

---

### Task 6: Preview verification and production promotion

**Files:** no source changes unless verification finds a defect.

- [ ] **Step 1: Run full Node suite**

Run: `npm test`
Expected: 0 failures.

- [ ] **Step 2: Deploy preview**

Deploy the isolated branch/current project as preview.

- [ ] **Step 3: Browser regression**

Run `ATLAS_BASE_URL=<preview> node test/browser.cjs`.
Expected: PASS with no page errors and no mobile horizontal overflow.

- [ ] **Step 4: Endpoint readback**

Verify preview `/api/health`, `/api/state`, `/api/learning`, `/api/audit`, `/api/ops` and representative `/api/graph`/`/api/entity` return 200 and `v1/LIVE/usedFallback=false` where applicable.

- [ ] **Step 5: Runtime log check**

Verify preview has no new runtime errors.

- [ ] **Step 6: Promote source branch to the official Atlas branch and deploy production**

Fast-forward `atlas-control-tower-v3-20260905` to the verified commit, deploy production once.

- [ ] **Step 7: Production readback**

Repeat health, data-source, Learning, Black Box, representative entity, runtime error and production HTML asset-pin checks. Confirm production references the verified commit.
