# NEXO Atlas Observatory V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recompose the Atlas overview around the first approved observatory mockup, making the interactive map the primary surface and moving operational summaries below it.

**Architecture:** Preserve all API/model/session behavior. Change only the overview HTML ordering, the Command Center renderer, and presentation CSS. The existing `buildControlTowerModel()` remains the data contract; `renderControlTower()` becomes a post-map overview deck. A new `observatory-v2.css` layer owns the visual composition and is loaded last.

**Tech Stack:** Vanilla HTML, CSS, ES modules, Node 24 test runner, Vercel static/serverless deployment.

**Spec:** `docs/superpowers/specs/2026-09-07-observatory-v2-design.md`

## Global Constraints

- Deep navy observatory, not cyan/neon SaaS.
- No `X, não Y` copy constructions.
- No fake operational facts or decorative coordinates.
- No new backend routes, databases, schedulers, agents, dependencies or truth stores.
- Existing map/session/API behavior stays intact.
- Command Center sources continue loading independently.
- Reduced-motion behavior stays intact.

---

### Task 1: Lock the overview structure with a failing contract test

**Files:**
- Create: `test/observatory-v2.test.mjs`
- Read: `index.html`
- Read: `ui/control-tower.mjs`

**Interfaces:**
- Consumes: current `renderControlTower(root, model, callbacks)`.
- Produces: an executable contract for DOM ordering, overview deck sections and copy rules.

- [ ] **Step 1: Write the failing test**

Create a test that reads `index.html`, invokes `renderControlTower()` against a tiny fake root, and asserts:

```js
assert.ok(index.indexOf('id="map-workspace"') < index.indexOf('id="command-center"'));
assert.match(index,/O conhecimento é um sistema\./);
assert.match(index,/ui\/observatory-v2\.css/);
assert.match(root.innerHTML,/Status operacional/);
assert.match(root.innerHTML,/Visão geral/);
assert.match(root.innerHTML,/Atividade recente/);
assert.match(root.innerHTML,/Prioridades operacionais/);
assert.doesNotMatch(root.innerHTML,/LEARNING PROMOVIDO/);
assert.doesNotMatch(index,/FRONTEND OFICIAL/);
assert.doesNotMatch(index,/Estado rastreável/);
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
node --test test/observatory-v2.test.mjs
```

Expected: FAIL because the map still follows the Command Center and `observatory-v2.css` does not exist.

- [ ] **Step 3: Commit the RED test**

```bash
git add test/observatory-v2.test.mjs
git commit -m "test(atlas): lock observatory v2 overview contract"
```

---

### Task 2: Reorder the overview around the map

**Files:**
- Modify: `index.html`
- Create: `ui/observatory-v2.css`
- Modify: `frontend-files.mjs`
- Modify: `vercel.json`

**Interfaces:**
- Consumes: existing DOM ids used by `app.mjs` (`map-workspace`, filters, graph controls, `command-center`).
- Produces: map-first source order and a last-loaded presentation layer.

- [ ] **Step 1: Move the headline and map ahead of `command-center`**

Use this overview copy:

```html
<p class="eyebrow">MAPA DO SISTEMA</p>
<h1>O conhecimento <span>é um sistema.</span></h1>
<p class="subtitle">Conecte domínios, rastreie relações e priorize o que exige ação.</p>
```

Place `#command-center` immediately after `#map-workspace`.

- [ ] **Step 2: Integrate filters with the map header**

Keep all existing filter ids and option values; only move their wrapper so the filters visually sit with map controls.

- [ ] **Step 3: Add the observatory CSS asset**

`ui/observatory-v2.css` must define:

```css
[data-theme="dark"] main{background:transparent}
[data-theme="dark"] .page-head{display:flex!important}
[data-theme="dark"] .graph-stage{min-height:620px}
[data-theme="dark"] .observatory-space{position:absolute;inset:0;pointer-events:none}
[data-theme="dark"] .observatory-horizon{position:absolute;right:-12%;bottom:-44%;width:72%;aspect-ratio:1;border-radius:50%}
```

The complete file must also provide restrained stars, nebula depth, lower border density, compact sidebar treatment and responsive breakpoints.

- [ ] **Step 4: Expose the asset through public manifests**

Add `ui/observatory-v2.css` to `frontend-files.mjs` and the Vercel static builds list.

- [ ] **Step 5: Run the focused test**

Run:

```bash
node --test test/observatory-v2.test.mjs
```

Expected: still FAIL until Task 3 reshapes Command Center markup.

---

### Task 3: Recompose the Command Center into the post-map deck

**Files:**
- Modify: `ui/control-tower.mjs`
- Modify: `ui/control-tower.css`
- Test: `test/control-tower.test.mjs`
- Test: `test/observatory-v2.test.mjs`

**Interfaces:**
- Consumes: unchanged model fields `health`, `attention`, `corpus`, `recent`, `promoted`.
- Produces: the same `renderControlTower(root, model, {onFocus,onMap})` signature with new markup.

- [ ] **Step 1: Keep the model unchanged**

Do not alter source fetching or truth semantics.

- [ ] **Step 2: Render three primary panels**

Create:

```html
<div class="ct-observatory-grid">
  <article class="ct-console ct-status-console">Status operacional …</article>
  <article class="ct-console ct-overview-console">Visão geral …</article>
  <article class="ct-console ct-recent-console">Atividade recente …</article>
</div>
<section class="ct-console ct-priorities-console">Prioridades operacionais …</section>
```

Status is derived from health states and blockers. Overview uses real corpus/tests/blockers/readback values. Recent activity uses `model.recent.items`. Priorities uses real blocker actions.

- [ ] **Step 3: Remove overview Learning promotion cards**

Learning remains reachable through the existing sidebar/system focus; do not duplicate it on the default overview.

- [ ] **Step 4: Keep drill-down handlers**

Recent and priority rows retain `data-ct-focus="system:AUTOMATION"`; status console items may retain current system focus buttons where useful.

- [ ] **Step 5: Run focused tests**

```bash
node --test test/control-tower.test.mjs test/observatory-v2.test.mjs
```

Expected: PASS.

---

### Task 4: Verify the full frontend and deployment boundary

**Files:**
- Test: all `test/*.test.mjs`

**Interfaces:**
- Consumes: complete branch state.
- Produces: a deployable preview with no backend/schema changes.

- [ ] **Step 1: Run full suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 2: Create a preview deployment**

Deploy the branch/payload to the existing Vercel project with target `preview` only.

- [ ] **Step 3: Read back deployment HTML and health**

Verify:
- HTTP 200 for `/`.
- `observatory-v2.css` is referenced.
- `map-workspace` precedes `command-center` in returned HTML.
- removed chrome does not reappear.
- `/api/health` still returns successfully through the preview routing strategy.

- [ ] **Step 4: Check runtime/build errors**

Require no new runtime errors attributable to the redesign.

- [ ] **Step 5: Merge only after preview validation**

Keep production untouched unless the user explicitly requests promotion.