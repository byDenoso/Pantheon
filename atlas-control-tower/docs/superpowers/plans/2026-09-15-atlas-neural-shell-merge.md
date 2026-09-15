# Atlas Neural Shell Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with verification after each task.

**Goal:** Make Atlas Neural the primary `/mapa` graph experience while retaining the existing Atlas shell, data contracts, accessible fallback, and standalone V3 route.

**Architecture:** Extract the reusable Neural V3 surface from its standalone bootstrap, inject it into the existing `GraphsPage`, and use explicit shell callbacks for focus, selection, inspector, theme, and navigation. Keep V3 static projection loading as the only Neural data path; leave the legacy API for non-graph surfaces.

**Tech Stack:** React, TypeScript, Vite, React Three Fiber/WebGL fallback, Node test runner, GitHub Pages static publication.

**Spec:** `docs/superpowers/specs/2026-09-15-atlas-neural-shell-merge-design.md`

## Global Constraints

- `/mapa` must open the Neural graph at `system:NEXO`.
- The Neural V3 manifest and validated snapshot remain the only graph data authority for the merged surface.
- No private Olympus/client data may enter the public static projection.
- Only one graph renderer may be mounted in the merged surface.
- WebGL failure must preserve an accessible graph table or truthful error state.
- GitHub Pages is the publication target while Vercel deployment quota is exhausted.

### Task 1: Lock the integration boundary with failing tests

**Files:**
- Create: `test/atlas-neural-shell-merge.test.mjs`
- Modify: `test/premium-ux-shell.test.mjs`

**Interfaces:**
- Consumes: current `src/App.tsx`, `src/pages/graphs-page.tsx`, `src/atlas-v3/AtlasV3App.tsx` source contracts.
- Produces: assertions covering main-route Neural mounting, stale focus reset, shared V3 loader, and no duplicate legacy renderer.

- [ ] **Step 1: Write the failing tests**

```js
test('the main Grafos route mounts the reusable Neural surface', () => {
  const app = read('src/App.tsx');
  const graph = read('src/pages/graphs-page.tsx');
  assert.match(graph, /AtlasNeuralSurface/);
  assert.match(app, /GraphsPage/);
});

test('opening Grafos resets a stale system layer before rendering the map', () => {
  const app = read('src/App.tsx');
  assert.match(app, /item\.area === 'graphs'[\s\S]*actions\.home\(\)/);
});

test('the embedded Neural surface and standalone route share the V3 loader', () => {
  const neural = read('src/atlas-v3/AtlasNeuralSurface.tsx');
  const standalone = read('src/atlas-v3/AtlasV3App.tsx');
  assert.match(neural, /loadAtlasV3Snapshot/);
  assert.match(standalone, /loadAtlasV3Snapshot/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test test/atlas-neural-shell-merge.test.mjs test/premium-ux-shell.test.mjs`

Expected: FAIL because `AtlasNeuralSurface` and the stale-focus reset do not yet exist.

### Task 2: Extract the reusable Neural surface

**Files:**
- Create: `src/atlas-v3/AtlasNeuralSurface.tsx`
- Modify: `src/atlas-v3/AtlasV3App.tsx`
- Modify: `src/atlas-v3/types.ts`

**Interfaces:**
- Consumes: `loadAtlasV3Snapshot`, `buildAtlasV3Scene`, existing `AtlasCanvas`, `Inspector`, layer projection helpers, and theme utilities.
- Produces: `AtlasNeuralSurfaceProps` and `AtlasNeuralSurface` reusable by both the main Atlas shell and standalone V3 bootstrap.

- [ ] **Step 1: Define the component contract**

```ts
export type AtlasNeuralSurfaceProps = {
  compact?: boolean;
  initialLayer?: AtlasV3Layer;
  onOpenEntity?: (node: AtlasNode) => void;
  onClose?: () => void;
  embedded?: boolean;
};
```

- [ ] **Step 2: Move the V3 loading, layer filtering, canvas, inspector, and error state into `AtlasNeuralSurface`**

The component must load the same `data/v3/current/manifest.json`, validate the fingerprint, derive the scene with `buildAtlasV3Scene`, render the existing canvas, and expose the same truthful empty/error states. It must not call `/api` or the legacy graph client.

- [ ] **Step 3: Make `AtlasV3App` a thin standalone wrapper**

`AtlasV3App` supplies standalone defaults and renders `AtlasNeuralSurface`, preserving `/atlas-v3/` behavior and the current V3 browser smoke selectors.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `node --test test/atlas-neural-shell-merge.test.mjs && npm run typecheck`

Expected: extraction contract tests PASS and TypeScript reports no errors.

### Task 3: Mount Neural in the main Atlas graph route

**Files:**
- Modify: `src/pages/graphs-page.tsx`
- Modify: `src/App.tsx`
- Modify: `src/design/spatial-interface.css`
- Modify: `src/design/mobile.css`

**Interfaces:**
- Consumes: `AtlasNeuralSurface`, `AtlasActions.focusSystem`, `AtlasActions.open`, shared workspace theme state, and main route navigation.
- Produces: `/mapa` with Neural as the single graph renderer and the legacy accessible table retained only as a capability fallback.

- [ ] **Step 1: Add the stale-focus regression test to the existing shell test**

The test must assert that clicking the primary `GRAFOS` navigation invokes `actions.home()` before or alongside route navigation.

- [ ] **Step 2: Change the primary `GRAFOS` click handler**

Use:

```tsx
onClick={event => {
  event.preventDefault();
  if (item.area === 'graphs') void actions.home();
  go(item.area);
}}
```

- [ ] **Step 3: Replace the legacy graph renderer in `GraphsPage` with `AtlasNeuralSurface`**

Keep the shell context bar and route boundary. Pass compact mode, an entity-open callback, and an explicit `embedded` flag. Do not render `GraphRenderer` in the same branch as Neural. Preserve a table fallback when the browser reports no WebGL capability.

- [ ] **Step 4: Add embedded-shell layout rules**

Make the Neural stage fill the existing Atlas graph workspace, avoid double headers/docks, preserve 44px touch targets, and maintain mobile no-overflow behavior. Do not duplicate V3 global `html/body` sizing rules inside the shell.

- [ ] **Step 5: Run focused tests**

Run: `node --test test/atlas-neural-shell-merge.test.mjs test/premium-ux-shell.test.mjs test/graph-canvas-only.test.mjs test/atlas-v3-mobile-contract.test.mjs`

Expected: PASS with only the Neural renderer mounted in `/mapa`.

### Task 4: Unify shell callbacks, theme, and inspector behavior

**Files:**
- Modify: `src/atlas-v3/AtlasNeuralSurface.tsx`
- Modify: `src/atlas-v3/theme-mode.mjs`
- Modify: `src/components/WorkspacePreferencesDrawer.tsx`
- Modify: `src/state/workspace-preferences.ts`
- Modify: `test/workspace-preferences.test.mjs`

**Interfaces:**
- Consumes: existing workspace preference persistence and Atlas route callbacks.
- Produces: one persisted theme state and one navigation path from Neural node selection to Atlas inspection.

- [ ] **Step 1: Add tests for embedded theme initialization and node callback propagation**

Assert that embedded mode accepts the shell theme and that selecting a canonical node calls the supplied callback without exposing presentation-only nodes as canonical entities.

- [ ] **Step 2: Implement shell-controlled theme mode**

Standalone mode keeps the existing V3 theme controls. Embedded mode reads the Atlas workspace preference and emits theme changes through the shell callback; it must not create a second conflicting localStorage key.

- [ ] **Step 3: Connect canonical node selection to the Atlas inspector**

Use the existing `actions.select`/`actions.open` path where the node exists in the Atlas session. Presentation-only nodes remain visual and show only the Neural inspector context.

- [ ] **Step 4: Run focused preference and Neural tests**

Run: `node --test test/workspace-preferences.test.mjs test/atlas-neural-shell-merge.test.mjs`

Expected: PASS with persisted theme and selection behavior.

### Task 5: Validate data completeness and publication

**Files:**
- Modify: `test/pages-graph-lifecycle-smoke-contract.test.mjs`
- Modify: `test/static-browser-publication-contract.test.mjs`
- Modify: `.github/workflows/atlas-pages-fallback.yml` only if readback needs the merged route selector.

**Interfaces:**
- Consumes: merged `/mapa`, V3 manifest/snapshot, GitHub Pages workflow.
- Produces: verified static publication with non-empty Neural graph and truthful fallback behavior.

- [ ] **Step 1: Run the full local verification suite**

Run: `npm test && npm run typecheck && npm run build`

Expected: all tests pass, typecheck passes, and build produces `dist/`.

- [ ] **Step 2: Build the Pages artifact**

Run: `npm run state:build && npm run build -- --base=/Pantheon/ && cp dist/index.html dist/404.html`

Expected: `dist/data/v3/current/manifest.json`, its validated snapshot, and `dist/atlas-v3/index.html` exist.

- [ ] **Step 3: Commit the implementation**

```bash
git add src test docs
git commit -m "feat: merge Atlas Neural into the primary graph workspace"
```

- [ ] **Step 4: Push to `main` and wait for Atlas Deploy**

The existing `Atlas Deploy` workflow must complete with `conclusion: success` for the implementation commit.

- [ ] **Step 5: Read back the public URL**

Verify `https://bydenoso.github.io/Pantheon/` contains the merged shell, opens `/mapa` with the Neural graph, loads the V3 manifest, and does not request retired Vercel API endpoints. Verify mobile viewport behavior through the existing browser smoke workflow.

