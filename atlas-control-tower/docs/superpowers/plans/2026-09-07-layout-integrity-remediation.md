# Atlas Layout Integrity Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair the reference-one frontend so the approved galactic visual system is visible, responsive, margin-safe, and materially simpler to maintain.

**Architecture:** Reduce runtime style ownership to base + shared premium + reference-one. Make reference-one own the current shell and map composition, add explicit transparent-background support to `Graph3D`, and encode responsive layout contracts in tests before implementation. Keep APIs and scientific graph contracts unchanged.

**Tech Stack:** HTML, CSS, vanilla ES modules, Canvas 2D, Node 24 `node:test`, Vercel static/serverless deployment.

**Spec:** `docs/superpowers/specs/2026-09-07-layout-integrity-audit.md`

## Global Constraints
- Preserve reference-one visual direction and real data.
- No production deploy; Preview only.
- No global horizontal overflow mask.
- Wallpaper stays inside map and never captures input.
- 1920/1600/1440/1366/1280 desktop widths must have defined responsive behavior.
- `npm test` and GitHub Actions must be green before merge/deploy closure.

---

### Task 1: Encode regression contracts

**Files:**
- Create: `test/layout-integrity.test.mjs`
- Modify: `test/frontend-manifest.test.mjs`
- Modify: `test/graph-presentation.test.mjs`

**Interfaces:**
- Consumes: current `index.html`, `frontend-files.mjs`, `vercel.json`, `reference-one.css`, `graph3d.mjs`, `theme.mjs`.
- Produces: source-level contracts for stylesheet ownership, responsive breakpoints, visible wallpaper support, and dead stylesheet removal.

- [ ] **Step 1: Write failing tests**

```js
assert.doesNotMatch(index,/galactic-theme\.css|observatory-v2\.css|control-tower\.css/);
assert.doesNotMatch(referenceCss,/overflow-x\s*:\s*hidden/);
assert.match(referenceCss,/--reference-sidebar-width/);
assert.match(referenceCss,/@media\s*\(max-width:\s*1600px\)/);
assert.match(referenceCss,/@media\s*\(max-width:\s*1366px\)/);
assert.match(graphSource,/transparentBackground/);
assert.doesNotMatch(themeSource,/readability\.css/);
```

- [ ] **Step 2: Run CI on test-only commit**
Expected: FAIL because the current implementation still loads competing stylesheets, masks overflow, paints an opaque canvas, and requests `readability.css`.

- [ ] **Step 3: Keep the failing output as RED evidence**
Do not alter production code until the expected failures are observed.

### Task 2: Simplify runtime CSS ownership

**Files:**
- Modify: `index.html`
- Modify: `frontend-files.mjs`
- Modify: `vercel.json`
- Modify: `ui/official-dashboard.css`
- Modify: `ui/reference-one.css`

**Interfaces:**
- Consumes: stylesheet load order from `index.html`.
- Produces: runtime chain `styles.css` → `official-dashboard.css` → `premium-v2.css` → `reference-one.css` with reference-one as the only current shell owner.

- [ ] **Step 1: Remove obsolete runtime layers from entrypoint**
Remove `control-tower.css`, `galactic-theme.css`, and `observatory-v2.css` links.

- [ ] **Step 2: Remove those assets from `frontendFiles` and Vercel static builds**
Keep source files in history; do not deploy dead override layers.

- [ ] **Step 3: Strip the legacy cosmic-shell override section from `official-dashboard.css`**
Preserve recorte/radar/Black Box component styles, remove the block beginning `/* Cosmic dark-mode rework... */` and its shell/map selectors.

- [ ] **Step 4: Run focused tests**
Expected: stylesheet ownership tests pass; component-manifest tests remain green after expectations are updated.

### Task 3: Repair shell and responsive layout at the source

**Files:**
- Modify: `ui/reference-one.css`
- Modify: `index.html` only if a wrapper/accessibility correction is needed.

**Interfaces:**
- Produces shared variables `--reference-sidebar-width`, `--reference-gutter`, and responsive console/topbar policies.

- [ ] **Step 1: Replace duplicated sidebar/main widths with shared tokens**
```css
.reference-one{--reference-sidebar-width:178px;--reference-gutter:16px}
.reference-sidebar{width:var(--reference-sidebar-width)}
.reference-main{margin-left:var(--reference-sidebar-width);padding-inline:var(--reference-gutter);min-width:0}
```

- [ ] **Step 2: Remove `overflow-x:hidden` masking**
Use `min-width:0`, bounded children, and container overflow where appropriate. Body must not hide structural overflow.

- [ ] **Step 3: Make topbar resilient**
Use `minmax(0,1fr)` for search, `min-width:0` on grid children, and progressive breakpoints around 1600, 1440/1366, and 980. Compact optional chrome before collision.

- [ ] **Step 4: Make map height responsive**
Use `clamp()` tied to viewport height instead of one fixed `535px` desktop height; keep a usable 1280x720 minimum without pushing controls outside.

- [ ] **Step 5: Contain the visualization bar**
Use `minmax(0,1fr)`, allow hint truncation, and keep compass geometry inside its own box.

- [ ] **Step 6: Reflow consoles before they become microscopic**
Large desktop: 5 columns. <=1600: 3 columns with remaining panels on row 2. <=1366: 2 columns. <=860: 1 column. All console text gets `min-width:0`, `overflow-wrap:anywhere`, and sensible clamping.

- [ ] **Step 7: Run focused and full tests**
Expected: layout contracts green and no existing functional tests regress.

### Task 4: Make the approved wallpaper actually visible

**Files:**
- Modify: `graph3d.mjs`
- Modify: `app.mjs`
- Modify: `test/graph-presentation.test.mjs`

**Interfaces:**
- `new Graph3D(canvas,{...,transparentBackground?:boolean})`
- When true, clear the canvas but do not paint the full opaque background rectangle; nodes, filaments, guide orbits, haze, stars, and vignette remain functional.

- [ ] **Step 1: Add failing behavior/source contract**
Verify the renderer accepts and stores `transparentBackground`, and skips the opaque background fill when enabled.

- [ ] **Step 2: Implement constructor option**
```js
constructor(canvas,{select,open,edge,transparentBackground=false}){
 this.transparentBackground=!!transparentBackground;
 ...
}
```

- [ ] **Step 3: Skip only the opaque base fill in `draw()`**
Do not remove graph geometry or interaction.

- [ ] **Step 4: Pass the option from `app.mjs` for reference-one**
```js
transparentBackground: document.body.classList.contains('reference-one')
```

- [ ] **Step 5: Run graph tests**
Expected: transparency contract green, hit testing and renderer tests unchanged.

### Task 5: Remove dead runtime dependency and cheap performance waste

**Files:**
- Modify: `ui/theme.mjs`
- Modify: `graph3d.mjs`
- Modify: `ui/visual-config.mjs` if a named ambient cadence constant is useful.
- Test: `test/frontend-manifest.test.mjs`, renderer tests.

**Interfaces:**
- No dynamic `readability.css` request.
- Ambient animation remains reduced-motion aware and interaction-correct.

- [ ] **Step 1: Remove dynamic readability stylesheet injection**
Premium/reference CSS owns typography. The dead request must disappear.

- [ ] **Step 2: Cap ambient canvas painting cadence**
Keep requestAnimationFrame scheduling for smooth transitions/interaction, but avoid repainting the full starfield at 60fps when only ambient drift/pulses are active. Target about 30fps for ambient-only frames.

- [ ] **Step 3: Preserve transition and pointer responsiveness**
Transitions and explicit kicks still draw every animation frame while active.

- [ ] **Step 4: Run full test suite**
Expected: 100% green.

### Task 6: CI, diff review, merge and Preview readback

**Files:**
- No production source edits unless verification exposes a real regression.

**Interfaces:**
- GitHub PR into `main`.
- Existing Vercel project `nexo-atlas-control-tower`, Preview target only.

- [ ] **Step 1: Open PR and wait for `Atlas Quality`**
Expected: success.

- [ ] **Step 2: Review changed-file diff**
Confirm no backend/API/data contract changes and no temporary workflow/debug files.

- [ ] **Step 3: Merge green PR into main**
Only after diff and CI are clean.

- [ ] **Step 4: Deploy exact green frontend to Preview**
Do not promote production.

- [ ] **Step 5: Read back deployment**
Check deployment READY, build logs, runtime errors, entrypoint stylesheet chain, reference wallpaper markup/style asset, and `/api/health` where Vercel auth allows.

- [ ] **Step 6: Report closure**
Provide root causes, modified files, removed/deployed layers, test count, CI result, deployment ID, Preview URL, runtime errors, and any remaining limitation.
