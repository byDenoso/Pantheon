# NEXO Atlas Premium UX/UI Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the P0 premium frontend foundation: one semantic design system, a compact responsive shell, a full-bleed graph workspace with explicit context/trust cues, an adaptive premium Inspector, and browser/mobile release gates.

**Architecture:** Keep the current custom route/session model and graph renderer boundaries. Consolidate presentation into semantic tokens and small shell/graph components, remove legacy style ownership from `App.tsx`, and make the graph/Inspector responsive through layout state rather than backend changes. Preserve Canvas/Pixi as default and existing API contracts.

**Tech Stack:** React 19, TypeScript 5.9, Vite 8, PixiJS 8, GSAP, existing custom Atlas routing/session state, Node test runner, GitHub Actions/Chrome headless smoke.

**Spec:** `atlas-control-tower/docs/superpowers/specs/2026-09-13-premium-ux-ui-design.md`

## Global Constraints

- Preserve canonical IDs, API contracts and scientific authority.
- Never invent data or translate unavailable/stale data into confidence.
- Canvas/Pixi remains the safe default renderer; WebGL/WebGPU remains lazy/opt-in.
- Mobile is an explicit layout, not compressed desktop.
- System, Light, Dark, Deep Space and High Contrast share semantic tokens.
- Root render failures must remain visible; blank-screen regressions are release blockers.
- P0 foundation and graph usability land before Temporal Mode or other advanced P2 work.

---

### Task 1: Lock premium shell and token contracts with failing tests

**Files:**
- Create: `atlas-control-tower/test/premium-ux-foundation.test.mjs`
- Modify later: `atlas-control-tower/src/design/tokens.css`
- Modify later: `atlas-control-tower/src/App.tsx`
- Modify later: `atlas-control-tower/src/pages/graphs-page.tsx`

**Interfaces:**
- Produces test-visible contracts for `.atlas-context-bar`, `.atlas-command-trigger`, `.premium-shell`, semantic token names and mobile sheet markers.
- Consumes existing source files as text; no runtime API changes.

- [ ] **Step 1: Write the failing structural tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
const graph=fs.readFileSync(new URL('../src/pages/graphs-page.tsx',import.meta.url),'utf8');
const tokens=fs.readFileSync(new URL('../src/design/tokens.css',import.meta.url),'utf8');
const spatial=fs.readFileSync(new URL('../src/design/spatial-interface.css',import.meta.url),'utf8');

test('premium shell exposes compact context and command entry',()=>{
  assert.match(app,/premium-shell/);
  assert.match(app,/atlas-command-trigger/);
  assert.match(graph,/atlas-context-bar/);
});

test('semantic design tokens own shell graph state and motion',()=>{
  for(const token of ['--surface-overlay','--graph-background','--edge-evidence','--state-stale','--motion-fast','--z-inspector']) assert.match(tokens,new RegExp(token));
});

test('mobile graph inspector is a safe-area bottom sheet',()=>{
  assert.match(spatial,/100dvh/);
  assert.match(spatial,/safe-area-inset-bottom/);
  assert.match(spatial,/spatial-sheet-handle/);
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `node --test test/premium-ux-foundation.test.mjs`
Expected: FAIL because the new premium shell/context/token/sheet contracts are absent.

- [ ] **Step 3: Commit the RED tests**

```bash
git add test/premium-ux-foundation.test.mjs
git commit -m "test(atlas): define premium UX foundation contracts"
```

---

### Task 2: Consolidate semantic tokens and remove legacy style ownership

**Files:**
- Modify: `atlas-control-tower/src/design/tokens.css`
- Modify: `atlas-control-tower/src/design/premium-theme.css`
- Modify: `atlas-control-tower/src/design/theme.css`
- Modify: `atlas-control-tower/src/App.tsx`
- Test: `atlas-control-tower/test/premium-ux-foundation.test.mjs`

**Interfaces:**
- Produces CSS variables used by shell/graph: `--surface-*`, `--text-*`, `--graph-*`, `--edge-*`, `--state-*`, `--space-*`, `--radius-*`, `--motion-*`, `--z-*`.
- Existing legacy variables remain bridged in `premium-theme.css` while consumers migrate.

- [ ] **Step 1: Replace the small legacy token root with semantic families**

```css
:root{
  --surface-base:#07111f;
  --surface-depth:#0a1626;
  --surface-primary:#0d1b2d;
  --surface-elevated:#11233a;
  --surface-overlay:rgba(9,20,34,.88);
  --surface-hover:#17314d;
  --text-primary:#f3f8ff;
  --text-secondary:#b8c7d9;
  --text-tertiary:#7f93aa;
  --border-default:rgba(139,171,204,.18);
  --accent-primary:#77d2ff;
  --graph-background:#050d18;
  --edge-hierarchy:#617f9c;
  --edge-relation:#6e8ca8;
  --edge-evidence:#72e0c4;
  --edge-dependency:#d4a85c;
  --edge-provenance:#b28cff;
  --edge-contradiction:#ff7d87;
  --state-live:#63d69b;
  --state-snapshot:#7dc9ff;
  --state-stale:#d8ad63;
  --state-degraded:#ff8b7b;
  --motion-fast:160ms;
  --motion-panel:280ms;
  --motion-spatial:420ms;
  --z-graph:1;
  --z-hud:20;
  --z-inspector:40;
  --z-modal:80;
}
```

- [ ] **Step 2: Bridge existing legacy variables in the premium theme instead of duplicating palettes**

```css
:root{
  --bg:var(--surface-base);
  --panel:var(--surface-primary);
  --panel-soft:var(--surface-elevated);
  --line:var(--border-default);
  --text:var(--text-primary);
  --muted:var(--text-secondary);
  --subtle:var(--text-tertiary);
  --accent:var(--accent-primary);
}
```

- [ ] **Step 3: Remove `react-atlas.css`, `atlas-shell.css` and `graph-visual.css` imports from `App.tsx` so `design/index.css` owns the visual system**

```tsx
// main.tsx remains the single design-system entrypoint:
import './design/index.css';
```

- [ ] **Step 4: Run focused and legacy style tests**

Run: `npm test -- --test-name-pattern="premium|design system|override|theme"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/design/tokens.css src/design/premium-theme.css src/design/theme.css src/App.tsx test/premium-ux-foundation.test.mjs
git commit -m "refactor(atlas): consolidate semantic design tokens"
```

---

### Task 3: Build compact premium shell, command entry and contextual trust bar

**Files:**
- Create: `atlas-control-tower/src/components/AtlasContextBar.tsx`
- Create: `atlas-control-tower/src/components/CommandEntry.tsx`
- Modify: `atlas-control-tower/src/App.tsx`
- Modify: `atlas-control-tower/src/design/spatial-interface.css`
- Modify: `atlas-control-tower/src/design/premium-theme.css`
- Test: `atlas-control-tower/test/premium-ux-foundation.test.mjs`

**Interfaces:**
- `AtlasContextBar({path, freshness, authority, sourceVersion, navigationKind})` renders the current spatial path and trust metadata without changing session state.
- `CommandEntry({value,onChange,onSubmit,onOpenPalette})` provides the compact global entry and keyboard affordance; it does not invent a new search API.

- [ ] **Step 1: Add a failing source-level assertion for the new component interfaces**

```js
assert.match(app,/CommandEntry/);
assert.match(graph,/AtlasContextBar/);
```

- [ ] **Step 2: Run test and confirm RED**

Run: `node --test test/premium-ux-foundation.test.mjs`
Expected: FAIL on missing imports/components.

- [ ] **Step 3: Implement `AtlasContextBar`**

```tsx
export function AtlasContextBar({path,freshness,authority,sourceVersion,navigationKind}:Props){
  return <div className="atlas-context-bar" role="status">
    <div className="atlas-context-path">{path.map((item,index)=><span key={item.id}>{index>0&&<i>/</i>}<b>{item.label}</b></span>)}</div>
    <div className="atlas-context-trust"><span>{freshness}</span>{authority&&<span>{authority}</span>}{sourceVersion&&<span>{sourceVersion}</span>}<span>{navigationKind==='cross-domain'?'CROSS-DOMAIN':'DRILL DOWN'}</span></div>
  </div>;
}
```

- [ ] **Step 4: Implement `CommandEntry` as the compact topbar control and wire existing search submit**

```tsx
<CommandEntry value={query} onChange={setQuery} onSubmit={runSearch} onOpenPalette={()=>document.dispatchEvent(new CustomEvent('atlas:command-open'))}/>
```

- [ ] **Step 5: Make `App` use `premium-shell` and reduce topbar/sidebar visual competition**

```tsx
return <div className="atlas-app premium-shell">...</div>;
```

- [ ] **Step 6: Put `AtlasContextBar` above the graph stage and feed existing session metadata**

```tsx
<AtlasContextBar path={state.path} freshness={String(state.summary?.projection?.freshness||'SNAPSHOT')} authority={String(state.summary?.projection?.authority||'')} sourceVersion={state.summary?.projection?.sourceVersion} navigationKind={navigationKind}/>
```

- [ ] **Step 7: Run focused test, typecheck and build**

Run: `node --test test/premium-ux-foundation.test.mjs && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/AtlasContextBar.tsx src/components/CommandEntry.tsx src/App.tsx src/pages/graphs-page.tsx src/design/spatial-interface.css src/design/premium-theme.css test/premium-ux-foundation.test.mjs
git commit -m "feat(atlas): add premium shell context and command entry"
```

---

### Task 4: Upgrade graph workspace and adaptive Inspector

**Files:**
- Modify: `atlas-control-tower/src/pages/graphs-page.tsx`
- Modify: `atlas-control-tower/src/graph-engine/SpatialInspector.tsx`
- Modify: `atlas-control-tower/src/design/spatial-interface.css`
- Test: `atlas-control-tower/test/premium-ux-foundation.test.mjs`

**Interfaces:**
- `SpatialInspector` keeps its existing props and session actions.
- Adds visual sheet handle, capability-aware human labels and a trust section while preserving Pin/Compare/Open behaviour.

- [ ] **Step 1: Add failing assertions for premium Inspector semantics**

```js
const inspector=fs.readFileSync(new URL('../src/graph-engine/SpatialInspector.tsx',import.meta.url),'utf8');
assert.match(inspector,/spatial-sheet-handle/);
assert.match(inspector,/Visão Geral/);
assert.match(inspector,/Confiança|Freshness/);
assert.match(inspector,/Detalhes técnicos/);
```

- [ ] **Step 2: Run test and confirm RED**

Run: `node --test test/premium-ux-foundation.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Add human-facing tab labels and a mobile drag/sheet handle**

```tsx
const tabLabel={overview:'Visão Geral',relations:'Relações',evidence:'Evidências',history:'Histórico',runs:'Runs',artifacts:'Artefatos',provenance:'Proveniência'};
...
<div className="spatial-sheet-handle" aria-hidden="true"/>
```

- [ ] **Step 4: Add a trust block using only existing published fields**

```tsx
<section className="spatial-trust-block">
  <span>Freshness <b>{selected.freshness||state.summary?.projection?.freshness||'UNKNOWN'}</b></span>
  {selected.confidence!=null&&<span>Confiança <b>{String(selected.confidence)}</b></span>}
  {selected.domain&&<span>Domínio <b>{selected.domain}</b></span>}
</section>
```

- [ ] **Step 5: Move raw ID/metrics into a collapsed `Detalhes técnicos` disclosure**

```tsx
<details className="spatial-technical-details"><summary>Detalhes técnicos</summary><dl>...</dl></details>
```

- [ ] **Step 6: Make graph stage visually full-bleed and keep HUD/Inspector floating, not card-framed**

```css
.spatial-stage{min-height:0;height:100%;background:radial-gradient(...),var(--graph-background)}
.spatial-inspector{width:min(430px,calc(100% - 24px));z-index:var(--z-inspector)}
```

- [ ] **Step 7: Run test, typecheck and build**

Run: `node --test test/premium-ux-foundation.test.mjs && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/pages/graphs-page.tsx src/graph-engine/SpatialInspector.tsx src/design/spatial-interface.css test/premium-ux-foundation.test.mjs
git commit -m "feat(atlas): refine graph workspace and adaptive inspector"
```

---

### Task 5: Make mobile a dedicated graph layout

**Files:**
- Modify: `atlas-control-tower/src/design/mobile.css`
- Modify: `atlas-control-tower/src/design/spatial-interface.css`
- Modify: `atlas-control-tower/src/design/premium-theme.css`
- Test: `atlas-control-tower/test/premium-ux-foundation.test.mjs`
- Test: `atlas-control-tower/test/browser.cjs`

**Interfaces:**
- Existing DOM remains; CSS defines the mobile shell, snap-like inspector heights and safe-area spacing.
- Browser acceptance continues to use the existing shell and routes.

- [ ] **Step 1: Add failing CSS assertions for `100dvh`, safe areas, 44px touch targets and mobile inspector heights**

```js
for(const pattern of [/100dvh/,/safe-area-inset-top/,/safe-area-inset-bottom/,/min-height:\s*44px/]) assert.match(spatial+mobile,pattern);
```

- [ ] **Step 2: Run focused test and confirm RED**

Run: `node --test test/premium-ux-foundation.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement mobile viewport/safe-area rules**

```css
@media(max-width:760px){
  .premium-shell{min-height:100dvh;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}
  .spatial-knowledge-page,.spatial-workspace{height:100%;min-height:0}
  .spatial-navigation-hud button,.spatial-navigation-hud select{min-height:44px;min-width:44px}
  .spatial-inspector{padding-bottom:env(safe-area-inset-bottom);max-height:95dvh}
  .spatial-inspector.is-quick{max-height:42dvh}
}
```

- [ ] **Step 4: Make primary navigation horizontally scrollable with snap and edge fade rather than truncated text**

```css
@media(max-width:760px){
  .top-navigation{overflow-x:auto;scroll-snap-type:x proximity;scrollbar-width:none}
  .top-navigation a{scroll-snap-align:start;white-space:nowrap;min-height:44px}
}
```

- [ ] **Step 5: Extend browser acceptance with 390x844 checks for no horizontal overflow, visible graph HUD and selectable nav**

```js
await page.setViewportSize({width:390,height:844});
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
assert.equal(await page.locator('.spatial-navigation-hud').isVisible(),true);
```

- [ ] **Step 6: Run full tests, typecheck and build**

Run: `npm test && npm run typecheck && npm run build`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/design/mobile.css src/design/spatial-interface.css src/design/premium-theme.css test/premium-ux-foundation.test.mjs test/browser.cjs
git commit -m "feat(atlas): ship dedicated mobile graph layout"
```

---

### Task 6: Strengthen browser release gate and validate the integrated P0 surface

**Files:**
- Modify: `.github/workflows/atlas-pages-fallback.yml`
- Modify: `atlas-control-tower/test/browser.cjs`
- Test: all `atlas-control-tower/test/*.test.mjs`

**Interfaces:**
- Workflow continues building under `/Pantheon/` and publishing the tested artifact only.
- Browser smoke must fail on blank shell, bootstrap error, pageerror, horizontal overflow or missing graph HUD.

- [ ] **Step 1: Add browser acceptance assertions for the premium shell and context bar**

```js
assert.equal(await page.locator('.premium-shell').isVisible(),true);
assert.equal(await page.locator('.atlas-context-bar').isVisible(),true);
assert.equal(await page.locator('.atlas-command-trigger').isVisible(),true);
```

- [ ] **Step 2: Update Pages browser bootstrap smoke to require premium shell markers**

```bash
grep -q 'premium-shell' /tmp/atlas-pages-dom.html
grep -q 'atlas-app' /tmp/atlas-pages-dom.html
! grep -q 'atlas-bootstrap-error' /tmp/atlas-pages-dom.html
```

- [ ] **Step 3: Run the complete verification locally/CI-equivalent**

Run: `npm test && npm run typecheck && npm run build`
Expected: zero test failures, TypeScript exit 0, Vite exit 0.

- [ ] **Step 4: Review the branch diff against the spec**

Check that no API route, authority model, canonical ID or backend data contract changed. Check that legacy CSS imports are not reintroduced and mobile has safe-area/no-overflow rules.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/atlas-pages-fallback.yml atlas-control-tower/test/browser.cjs
git commit -m "test(atlas): gate premium shell in real browser"
```

- [ ] **Step 6: Open PR, wait for Atlas Quality, review patch, merge only on green, then verify Pages readback**

Expected post-merge evidence: unit/contract suite green, typecheck green, build green, headless browser bootstrap green, Pages deploy/readback green when GitHub Pages is available. Vercel rate limiting is not allowed to block the Pages validation path.
