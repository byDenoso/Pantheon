# NEXO Atlas Unified Observatory Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify Observatório and Grafo into one primary spatial research surface while preserving TOWER_V06 authority, `/mapa` compatibility, one renderer, real-data-only semantics, and the existing read-only trust boundary.

**Architecture:** Keep the current graph engine and `graphs` route as compatibility infrastructure, but route the visible product experience through a new unified Observatório shell. Reuse `GraphsPage` as the single spatial renderer, add synthesis as an overlay over that same renderer, collapse visible navigation to Cockpit/Observatório/Laboratório/Atividade, and keep all source/state labels fail-closed and derived from published projection metadata.

**Tech Stack:** React 19, TypeScript 5.9, Vite 8, Three.js/R3F existing graph engine, Node test runner, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-09-14-atlas-unified-observatory-rework-design.md`

## Global Constraints

- `byDenoso/NEXO-Obsidian-Vault@main:TOWER_V06` remains the sole operational authority.
- The browser receives only sanitized projections; ATLAS remains read-only.
- Preserve internal `graphs`, `GraphsPage`, `/mapa`, deep links, graph tests, and route compatibility.
- Use one graph renderer only; do not revive GraphsV2/Babylon/parallel canvas engines.
- Preserve SYSTEM/ROOT/DOMAIN/PROGRAM/CAMPAIGN/ACTION as published; never normalize canonical types for visual symmetry.
- Preserve `EMPTY` versus `DATA_UNAVAILABLE`; absence never becomes zero or success.
- Do not invent Pulse identity, counts, scientific summaries, uncertainty, confidence, status, or relations.
- Phase 1 visible navigation is Cockpit, Observatório, Laboratório, Atividade.
- The visual default should match the approved deep-space scientific direction while keeping all existing theme presets available.

---

### Task 1: Freeze the unified product contract with failing tests

**Files:**
- Create: `atlas-control-tower/test/unified-observatory-contract.test.mjs`
- Modify: `atlas-control-tower/test/atlas-vnext-contract.test.mjs`
- Modify: `atlas-control-tower/test/atlas-shell-behavior.test.mjs`

**Interfaces:**
- Consumes: `src/App.tsx`, `src/atlas-route.ts`, `src/pages/atlas-pages.tsx`, `src/components/shell/GraphHeader.tsx`, `src/components/ThemeToggle.tsx`, `src/api/hooks.ts`, `src/api/multisurface-adapters.ts`.
- Produces: executable contract proving the new visible navigation, compatibility routes, deep-space default, neutral hierarchy copy, and removal of Drive hardcoding.

- [ ] **Step 1: Add the failing unified contract test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('visible product navigation unifies map and observatory without deleting map compatibility', () => {
  const app = read('src/App.tsx');
  const route = read('src/atlas-route.ts');
  for (const label of ['COCKPIT', 'OBSERVATÓRIO', 'LABORATÓRIO', 'ATIVIDADE']) assert.match(app, new RegExp(`label: '${label}'`));
  assert.doesNotMatch(app, /label: 'GRAFOS'/);
  assert.doesNotMatch(app, /label: 'RESUMO DO UNIVERSO'/);
  assert.match(route, /graphs: 'mapa'/);
  assert.match(route, /observatory: 'pesquisa'/);
});

test('legacy separate-graph product copy is gone while graph infrastructure remains', () => {
  const pages = read('src/pages/atlas-pages.tsx');
  const graphHeader = read('src/components/shell/GraphHeader.tsx');
  assert.doesNotMatch(pages, /ABRIR NO MODO GRAFOS|O Grafo é o mapa; o Observatório é a leitura|Ver campanhas no Grafo/);
  assert.doesNotMatch(graphHeader, /Universo → Domínio → Campanha/);
  assert.match(read('src/pages/graphs-page.tsx'), /GraphRenderer/);
});

test('deep-space is the default visual preset but all presets remain available', () => {
  const theme = read('src/components/ThemeToggle.tsx');
  assert.match(theme, /return saved&&THEMES\.includes\(saved\)\?saved:'deep-space'/);
  for (const preset of ['classic', 'light', 'dark', 'system', 'deep-space', 'high-contrast']) assert.match(theme, new RegExp(preset));
});

test('science read models do not hardcode Google Drive as the live semantic source', () => {
  const source = read('src/api/hooks.ts') + read('src/api/multisurface-adapters.ts');
  assert.doesNotMatch(source, /source:\s*'GOOGLE_DRIVE'/);
});
```

- [ ] **Step 2: Run the new test and observe RED**

Run: `node --test test/unified-observatory-contract.test.mjs`
Expected: FAIL on current GRAFOS/RESUMO navigation, old graph copy, classic default, and hardcoded Drive source.

- [ ] **Step 3: Update old vNext/shell expectations to the approved product contract, without implementing production code yet**

Update the old test that requires four separate public perspectives so it instead requires the four Phase 1 visible surfaces while still asserting `graphs`, `observatory`, `lab`, and `universe` remain in the route compatibility layer. Update `isActiveNavItem` expectations so `graphs`/`universe` can map to the visible Observatório item.

- [ ] **Step 4: Commit the RED contract**

```bash
git add atlas-control-tower/test/unified-observatory-contract.test.mjs atlas-control-tower/test/atlas-vnext-contract.test.mjs atlas-control-tower/test/atlas-shell-behavior.test.mjs
git commit -m "test(atlas): freeze unified observatory product contract"
```

---

### Task 2: Unify visible navigation while preserving `/mapa` and legacy areas

**Files:**
- Modify: `atlas-control-tower/src/App.tsx`
- Modify: `atlas-control-tower/src/state/nav-active.ts`
- Test: `atlas-control-tower/test/unified-observatory-contract.test.mjs`
- Test: `atlas-control-tower/test/atlas-route-public-contract.test.mjs`

**Interfaces:**
- Consumes: existing `AtlasArea`, `routeFor`, `GraphsPage`, `LaboratoryPage`, `AtividadePage`.
- Produces: a visible four-surface navigation and an Observatório active-state alias for internal `graphs`/`universe` routes.

- [ ] **Step 1: Verify route compatibility tests remain green before changing App**

Run: `node --test test/atlas-route-public-contract.test.mjs`
Expected: PASS.

- [ ] **Step 2: Implement active-area aliasing**

```ts
export function isActiveNavItem(currentArea: string, itemArea: string): boolean {
  if (itemArea === 'observatory' && ['observatory', 'graphs', 'universe'].includes(currentArea)) return true;
  return currentArea === itemArea;
}
```

- [ ] **Step 3: Replace visible navigation in `App.tsx`**

```ts
const NAVIGATION: Array<{ area: AtlasArea; label: string; icon: string }> = [
  { area: 'cockpit', label: 'COCKPIT', icon: '◈' },
  { area: 'observatory', label: 'OBSERVATÓRIO', icon: '✧' },
  { area: 'lab', label: 'LABORATÓRIO', icon: '◇' },
  { area: 'atividade', label: 'ATIVIDADE', icon: '◔' }
];
```

Make brand/search/system/domain navigation enter `routeFor('observatory', ...)` for normal product use. Keep `routeFor('graphs')` and graph hydration logic intact for `/mapa` deep links.

- [ ] **Step 4: Route compatibility areas through the unified research surface**

Render the unified Observatório for `observatory`, `graphs`, and `universe`; use the `universe` route only as a compatibility signal to open synthesis initially. Do not delete the internal areas.

- [ ] **Step 5: Run navigation/route tests**

Run: `node --test test/unified-observatory-contract.test.mjs test/atlas-route-public-contract.test.mjs test/atlas-shell-behavior.test.mjs`
Expected: navigation assertions PASS; later visual/source assertions may remain RED until their tasks.

- [ ] **Step 6: Commit**

```bash
git add atlas-control-tower/src/App.tsx atlas-control-tower/src/state/nav-active.ts atlas-control-tower/test
git commit -m "feat(atlas): unify visible research navigation"
```

---

### Task 3: Turn `GraphsPage` into the single Observatório spatial surface

**Files:**
- Create: `atlas-control-tower/src/pages/UnifiedObservatoryPage.tsx`
- Create: `atlas-control-tower/src/components/ObservatorySynthesisRail.tsx`
- Modify: `atlas-control-tower/src/pages/graphs-page.tsx`
- Modify: `atlas-control-tower/src/components/shell/GraphHeader.tsx`
- Modify: `atlas-control-tower/src/App.tsx`
- Test: `atlas-control-tower/test/unified-observatory-contract.test.mjs`

**Interfaces:**
- Produces: `UnifiedObservatoryPage({api,state,actions,context,reducedMotion,compact,initialView})`.
- Extends: `GraphsPage` with optional `synthesisOverlay?: React.ReactNode` and `initialProductMode?: 'structure'|'evidence'|'synthesis'`.
- Keeps: exactly one `GraphRenderer` mounted.

- [ ] **Step 1: Add a failing source-level assertion that synthesis does not instantiate another GraphRenderer**

Assert `UnifiedObservatoryPage.tsx` imports `GraphsPage` and does not import `GraphRenderer`, `Canvas25DGraph`, `Canvas`, or a second engine.

- [ ] **Step 2: Extend GraphsPage modes without removing relations**

Internally keep `explore | relations | evidence | synthesis`. Public labels should be `Estrutura`, `Relações`, `Evidência`, `Síntese`. `synthesis` keeps the same structural projection and displays the supplied overlay; `relations` remains a first-class control so no existing relation behavior is lost.

- [ ] **Step 3: Implement `ObservatorySynthesisRail` using only SRM V2**

Use `useScienceReadModel(api)`. Render compact counts only when arrays are actually present, show the first published observations via existing scientific renderer where useful, and use explicit `DATA_UNAVAILABLE`/`EMPTY` copy when no synthesis exists. Never fabricate an H0 tension or uncertainty.

- [ ] **Step 4: Implement UnifiedObservatoryPage**

```tsx
export function UnifiedObservatoryPage(props: Props) {
  return <GraphsPage
    state={props.state}
    actions={props.actions}
    reducedMotion={props.reducedMotion}
    compact={props.compact}
    initialProductMode={props.initialView}
    synthesisOverlay={<ObservatorySynthesisRail api={props.api}/>}
  />;
}
```

- [ ] **Step 5: Replace universal hierarchy copy**

GraphHeader title becomes `Observatório de Conhecimento`; description becomes `Estrutura publicada, relações, evidências e sínteses em uma única superfície espacial.` No `Universo → Domínio → Campanha` assertion remains.

- [ ] **Step 6: Run relevant tests**

Run: `node --test test/unified-observatory-contract.test.mjs test/graph-entity-contract.test.mjs`
Expected: PASS for single-renderer/universal-hierarchy assertions and existing structural-type contract.

- [ ] **Step 7: Commit**

```bash
git add atlas-control-tower/src/pages/UnifiedObservatoryPage.tsx atlas-control-tower/src/components/ObservatorySynthesisRail.tsx atlas-control-tower/src/pages/graphs-page.tsx atlas-control-tower/src/components/shell/GraphHeader.tsx atlas-control-tower/src/App.tsx atlas-control-tower/test/unified-observatory-contract.test.mjs
git commit -m "feat(atlas): make observatory the spatial research surface"
```

---

### Task 4: Remove separate-graph product copy and absorb Universe links

**Files:**
- Modify: `atlas-control-tower/src/pages/atlas-pages.tsx`
- Modify: `atlas-control-tower/src/pages/CockpitPage.tsx`
- Test: `atlas-control-tower/test/unified-observatory-contract.test.mjs`

**Interfaces:**
- Produces: no user-facing “open Grafos” or separate-Universe CTA; all research exploration points at Observatório.

- [ ] **Step 1: Replace separate graph calls-to-action**

Remove `ABRIR NO MODO GRAFOS`, `O Grafo é o mapa; o Observatório é a leitura`, `Ver campanhas no Grafo`, `Abrir em Grafos`, and `Abrir Grafos`. Use `Explorar no Observatório` or contextual equivalents.

- [ ] **Step 2: Remove duplicate visible Universe shortcut**

Cockpit research shortcuts should point to Observatório. `/pesquisa?scope=universo` remains valid but is no longer presented as a separate product surface.

- [ ] **Step 3: Run contract tests**

Run: `node --test test/unified-observatory-contract.test.mjs test/observatory-questions.test.mjs`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add atlas-control-tower/src/pages/atlas-pages.tsx atlas-control-tower/src/pages/CockpitPage.tsx atlas-control-tower/test
git commit -m "refactor(atlas): remove duplicate graph and universe product chrome"
```

---

### Task 5: Align projection-source labels with TOWER_V06 authority

**Files:**
- Modify: `atlas-control-tower/src/api/hooks.ts`
- Modify: `atlas-control-tower/src/api/multisurface-adapters.ts`
- Test: `atlas-control-tower/test/unified-observatory-contract.test.mjs`

**Interfaces:**
- Produces: projection-source metadata derived from published provenance/client metadata, never hardcoded `GOOGLE_DRIVE`.

- [ ] **Step 1: Add helper for projection-source display**

Use model provenance source when present, then `client.provenance?.source`, then the neutral value `TOWER_V06_PROJECTION`. Do not label the projection itself `TOWER_V06` unless the published metadata explicitly does so.

- [ ] **Step 2: Replace the three hardcoded Drive source assignments**

Update `useScienceReadModel`, `modelSummary`, and `modelQuestions` to use the actual/neutral projection source.

- [ ] **Step 3: Run adapter/source tests**

Run: `node --test test/unified-observatory-contract.test.mjs test/adapters.test.mjs test/atlas-api.test.mjs`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add atlas-control-tower/src/api/hooks.ts atlas-control-tower/src/api/multisurface-adapters.ts atlas-control-tower/test/unified-observatory-contract.test.mjs
git commit -m "fix(atlas): derive science projection source from published metadata"
```

---

### Task 6: Make the approved deep-space preset the default without deleting alternatives

**Files:**
- Modify: `atlas-control-tower/src/components/ThemeToggle.tsx`
- Create: `atlas-control-tower/src/design/unified-observatory.css`
- Modify: `atlas-control-tower/src/design/index.css`
- Test: `atlas-control-tower/test/atlas-shell-behavior.test.mjs`
- Test: `atlas-control-tower/test/atlas-shell-theme-contrast.test.mjs`

**Interfaces:**
- Produces: deep-space as first-run preset; existing classic/light/dark/system/high-contrast remain selectable.

- [ ] **Step 1: Change only the unsaved default**

`ThemeToggle.savedTheme()` returns `deep-space` when no valid saved preference exists. Never override an existing localStorage preference.

- [ ] **Step 2: Add `unified-observatory.css`**

Style the unified surface with restrained starfield gradients, cyan/violet semantic accents, translucent HUDs, synthesis rail, compact empty states, and mobile bottom-sheet behavior. Use existing theme tokens and `color-mix`; do not add raster backgrounds or a new rendering engine.

- [ ] **Step 3: Import the stylesheet at the end of `design/index.css`**

```css
@import './unified-observatory.css';
```

- [ ] **Step 4: Run theme/contract tests**

Run: `node --test test/unified-observatory-contract.test.mjs test/atlas-shell-behavior.test.mjs test/atlas-shell-theme-contrast.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add atlas-control-tower/src/components/ThemeToggle.tsx atlas-control-tower/src/design/unified-observatory.css atlas-control-tower/src/design/index.css atlas-control-tower/test
git commit -m "feat(atlas): apply unified deep-space observatory design"
```

---

### Task 7: Keep Cockpit and Activity fail-closed and decision-first

**Files:**
- Modify: `atlas-control-tower/src/pages/CockpitPage.tsx`
- Modify: `atlas-control-tower/src/pages/AtividadePage.tsx`
- Test: `atlas-control-tower/test/unified-observatory-contract.test.mjs`

**Interfaces:**
- Consumes: existing health/ops/runs/audit sources and activity events.
- Produces: compact operational summary without invented Pulse/cycle identity.

- [ ] **Step 1: Add a test that forbids fabricated Pulse identifiers**

Assert Cockpit/Activity do not contain hardcoded `Pulse #`, `v3.1`, or generated cycle IDs, while still exposing `Atividade operacional` when no cycle contract exists.

- [ ] **Step 2: Reorder Cockpit around actual operational signals**

Lead with source freshness, active work, blockers, checks/readback-like audit signals, then provenance. UNKNOWN remains explicit; zero is shown only when the corresponding source read is READY.

- [ ] **Step 3: Keep Activity chronological**

The current activity payload has no cycle boundary. Preserve the event timeline and label it as operational activity rather than synthesizing hourly Pulse groups.

- [ ] **Step 4: Run tests**

Run: `node --test test/unified-observatory-contract.test.mjs test/activity-multisurface.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add atlas-control-tower/src/pages/CockpitPage.tsx atlas-control-tower/src/pages/AtividadePage.tsx atlas-control-tower/test
git commit -m "refactor(atlas): make operations surfaces fail-closed and decision-first"
```

---

### Task 8: Update browser acceptance and verify exact head

**Files:**
- Modify: `atlas-control-tower/test/browser.cjs`

**Interfaces:**
- Verifies: visible four-item navigation, unified Observatório graph, structure/evidence/synthesis modes, preserved `/mapa`, Lab, Activity, desktop/mobile responsiveness, keyboard search, no page errors.

- [ ] **Step 1: Update browser acceptance paths**

Start at `/pesquisa`, assert the spatial workspace is present there, assert no GRAFOS/RESUMO nav items, test mode switching and inspector, then separately load `/mapa` to prove compatibility. Test mobile on `/pesquisa`.

- [ ] **Step 2: Run full test suite**

Run from `atlas-control-tower/`:

```bash
npm test
npm run typecheck
npm run build
```

Expected: all PASS.

- [ ] **Step 3: Run browser smoke against built/preview runtime**

```bash
ATLAS_BASE_URL=http://127.0.0.1:4173 node test/browser.cjs
```

Expected: PASS, no page errors, no horizontal overflow on mobile.

- [ ] **Step 4: Commit browser acceptance**

```bash
git add atlas-control-tower/test/browser.cjs
git commit -m "test(atlas): verify unified observatory in browser"
```

---

### Task 9: Review, CI, and release gate

**Files:**
- Review all files changed from base to exact head.

**Interfaces:**
- Produces: Draft PR ready for review only after exact-head tests/typecheck/build/browser smoke are green.

- [ ] **Step 1: Open/update Draft PR**

Describe authority boundary, visible product changes, preserved `/mapa`, one-renderer invariant, and explicit non-goals.

- [ ] **Step 2: Review full diff**

Reject any change that leaks raw Tower data, invents science/operations state, creates a second renderer, or changes canonical node types.

- [ ] **Step 3: Verify exact-head GitHub Actions**

Require Atlas Quality and relevant NEXO CI jobs on the exact PR head. Treat Vercel Hobby `build-rate-limit` only as an external deploy blocker when tests/build are otherwise green.

- [ ] **Step 4: Production readback after merge**

Verify GitHub Pages bootstrap, `/pesquisa`, `/mapa` compatibility, Manifest V3, SRM V2, graph drill-down, provenance/authority display, and mobile browser behavior.
