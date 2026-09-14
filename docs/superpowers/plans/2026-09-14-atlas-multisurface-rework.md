# NEXO ATLAS Multi-Surface Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework ATLAS into a fast Spatial Canvas 2.5D structural explorer backed by atomic multi-surface public projections, with truthful H0-by-stack, investigative Laboratory, operational Activity/Cockpit, Learning, Search, and fail-closed manual synchronization.

**Architecture:** Keep GitHub Pages as the static public frontend and preserve the last valid snapshot as fallback. Split the public read model into purpose-specific surfaces described by one versioned manifest, validate every changed surface before an atomic in-memory swap, and keep the structural graph sparse. The graph uses one Canvas 2.5D renderer and derives navigation from actual hierarchical children rather than entity type.

**Tech Stack:** React 19, TypeScript, Vite, HTML5 Canvas 2D, Node.js ESM (`node:test`), static JSON artifacts, GitHub Pages, existing NEXO public SSOT bridge.

**Spec:** `docs/superpowers/specs/2026-09-14-atlas-multisurface-rework-design.md`

## Global Constraints

- GitHub Pages remains the primary public frontend.
- Synchronization remains manual and fail-closed; the last valid snapshot survives any validation failure.
- Public artifacts use only `PUBLIC_SANITIZED` data.
- Personal Olympus/person-level records never enter the public manifest unless already aggregated and de-identified upstream.
- Structural graph nodes remain structural; TEST/RESULT/RUN/EVIDENCE/CLAIM/DATASET/ARTIFACT do not become ordinary map nodes.
- The default graph renderer is one Spatial Canvas 2.5D path; no user-facing 2D/WebGL renderer toggle remains.
- `EMPTY`, `DATA_UNAVAILABLE`, `STALE`, `DEGRADED`, and `API_ERROR` remain semantically distinct.
- No H0 uncertainty level, weighted aggregate, baseline, or dataset membership may be invented.
- Each task follows RED -> GREEN -> regression verification -> commit.

---

## File Structure

### Graph and navigation

- `atlas-control-tower/src/graph-engine/navigation-contract.ts` — pure derivation of `childCount` / `expandable` from explicit metadata and hierarchical edges.
- `atlas-control-tower/src/graph-engine/canvas-label-layout.mjs` — deterministic screen-space label priority/collision policy usable from Canvas and directly testable by Node.
- `atlas-control-tower/src/graph-engine/GraphRenderer.tsx` — single Canvas 2.5D renderer entry point.
- `atlas-control-tower/src/graph-engine/Canvas25DGraph.tsx` — orbit/tilt/pan/zoom rendering, depth cues, curved/quieter edges, label LOD and leaf-safe interaction.
- `atlas-control-tower/src/graph-engine/SpatialInspector.tsx` — exposes `Entrar` only for expandable nodes.
- `atlas-control-tower/src/graph-engine/types.ts` — navigation metadata on graph nodes.
- `atlas-control-tower/src/design/graph-25d-v2.css`, `graph-v2.css`, `mobile.css` — spatial shell/controls/mobile density only; canvas paint remains in renderer code.

### Public projections and synchronization

- `atlas-control-tower/lib/public-surface-manifest.mjs` — manifest V2 creation, validation, hashing, state normalization.
- `atlas-control-tower/lib/public-surface-projections.mjs` — builds sanitized observatory/lab/operations/activity/learning/search surfaces from existing canonical projection inputs without mixing them into the graph.
- `atlas-control-tower/lib/campaign-static-state-generator.mjs` — emits manifest V2 + surface artifacts while retaining legacy fallback artifacts during migration.
- `atlas-control-tower/lib/pages-manual-live-api.mjs` — double-read manifest validation, selective surface fetch, hash verification, immutable candidate and atomic swap.
- `atlas-control-tower/src/api/types.ts`, `adapters.ts`, `hooks.ts` — expose surface data without page-specific source invention.

### Observatory and Laboratory

- `atlas-control-tower/lib/h0-stack-projection.mjs` — deterministic H0 configuration/stack extraction; rejects ambiguous metrics.
- `atlas-control-tower/src/components/H0StackForestPlot.tsx` — accessible forest plot plus truthful uncertainty labels.
- `atlas-control-tower/src/pages/atlas-pages.tsx` — Observatory/Universe H0 stack view and Laboratory stages/context lineage.

### Operational surfaces

- `atlas-control-tower/src/pages/CockpitPage.tsx` — last verified sync receipt / operational availability.
- `atlas-control-tower/src/pages/AtividadePage.tsx` — real lifecycle event stream with true EMPTY vs DATA_UNAVAILABLE handling.
- `atlas-control-tower/src/pages/LearningPage.tsx` and existing learning loaders/models — corpus available independently of runtime state.
- existing global search loader/model — routes investigative and quantitative results to their owning surfaces.

### Tests

Use existing suites where the responsibility already exists. Add focused tests only where no suitable unit exists:

- `test/graph-navigation-contract.test.mjs`
- `test/graph-spatial-aesthetics.test.mjs`
- `test/public-surface-manifest-v2.test.mjs`
- `test/h0-stack-projection.test.mjs`
- `test/laboratory-multisurface.test.mjs`
- `test/activity-multisurface.test.mjs`

---

### Task 1: Lock leaf-safe structural navigation

**Files:**
- Create: `atlas-control-tower/src/graph-engine/navigation-contract.ts`
- Modify: `atlas-control-tower/src/graph-engine/types.ts`
- Modify: `atlas-control-tower/src/graph-engine/Canvas25DGraph.tsx`
- Modify: `atlas-control-tower/src/graph-engine/SpatialInspector.tsx`
- Test: `atlas-control-tower/test/graph-navigation-contract.test.mjs`
- Test/adjust: `atlas-control-tower/test/graph-expansion-interaction.test.mjs`

**Interfaces:**
- Produces: `deriveGraphNavigation(nodes, edges): Map<string, { childCount: number; expandable: boolean }>`
- Produces graph-node fields: `childCount?: number`, `expandable?: boolean`
- Consumers: Canvas click handling, SpatialInspector action visibility, later public graph normalization.

- [ ] **Step 1: Write the failing navigation test**

Create a Node test that imports a directly testable JS helper companion if TS cannot be imported by Node, or asserts the TS module through the existing build contract. The behavioral assertions are:

```js
const nodes=[
  {id:'domain:D1',type:'DOMAIN'},
  {id:'CAMP-A',type:'CAMPAIGN'},
  {id:'program:P1',type:'PROGRAM',metadata:{childCount:2}},
  {id:'program:LEAF',type:'PROGRAM'}
];
const edges=[{source:'domain:D1',target:'CAMP-A',type:'CONTAINS'}];
const nav=deriveGraphNavigation(nodes,edges);
assert.deepEqual(nav.get('domain:D1'),{childCount:1,expandable:true});
assert.deepEqual(nav.get('CAMP-A'),{childCount:0,expandable:false});
assert.deepEqual(nav.get('program:P1'),{childCount:2,expandable:true});
assert.deepEqual(nav.get('program:LEAF'),{childCount:0,expandable:false});
```

Also source-check `SpatialInspector.tsx` for an expandability guard around both `Entrar` buttons and reject the old `selected.id!==projection?.focusId`-only condition.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
cd atlas-control-tower
node --test test/graph-navigation-contract.test.mjs test/graph-expansion-interaction.test.mjs
```

Expected: FAIL because the new navigation helper/metadata guard does not exist.

- [ ] **Step 3: Implement minimal navigation derivation**

Use only hierarchical edges plus explicit published count metadata:

```ts
const HIERARCHICAL = new Set(['CONTAINS','PARENT_OF','HAS_CHILD']);

export function deriveGraphNavigation(nodes: GraphNode[], edges: GraphEdge[]) {
  const counts = new Map(nodes.map(node => [node.id, 0]));
  for (const edge of edges) {
    if (!HIERARCHICAL.has(String(edge.type || '').toUpperCase())) continue;
    if (counts.has(edge.source)) counts.set(edge.source, (counts.get(edge.source) || 0) + 1);
  }
  return new Map(nodes.map(node => {
    const explicit = Number(node.childCount ?? node.metadata?.childCount);
    const childCount = Number.isFinite(explicit) && explicit >= 0 ? explicit : (counts.get(node.id) || 0);
    return [node.id, { childCount, expandable: childCount > 0 }];
  }));
}
```

Normalize the current projection once, then use `node.expandable === true` in Canvas and Inspector. Clicking a leaf calls `onSelect(id)` only.

- [ ] **Step 4: Run focused graph tests and verify GREEN**

Run:

```bash
node --test test/graph-navigation-contract.test.mjs test/graph-expansion-interaction.test.mjs test/graph-interaction.test.mjs
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/graph-engine test/graph-navigation-contract.test.mjs test/graph-expansion-interaction.test.mjs
git commit -m "fix(atlas): stop graph navigation at structural leaves"
```

---

### Task 2: Make Spatial Canvas 2.5D the single renderer and improve graph composition

**Files:**
- Create: `atlas-control-tower/src/graph-engine/canvas-label-layout.mjs`
- Modify: `atlas-control-tower/src/graph-engine/GraphRenderer.tsx`
- Modify: `atlas-control-tower/src/graph-engine/Canvas25DGraph.tsx`
- Modify: `atlas-control-tower/src/graph-engine/orbital-2_5d-layout.ts`
- Modify: `atlas-control-tower/src/design/graph-25d-v2.css`
- Modify: `atlas-control-tower/src/design/graph-v2.css`
- Modify: `atlas-control-tower/src/design/mobile.css`
- Test: `atlas-control-tower/test/graph-spatial-aesthetics.test.mjs`
- Test/adjust: `graph-canvas-25d-v2.test.mjs`, `graph-2_5d-navigation.test.mjs`, `graph-v2-mobile-layout.test.mjs`, `renderer-policy.test.mjs`, `graph-scene-3d.test.mjs`

**Interfaces:**
- Produces: `placeSpatialLabels(items, options)` returning accepted screen-space label boxes in deterministic priority order.
- `GraphRenderer` consumes the existing `GraphSurfaceProps` but always renders `Canvas25DGraph`.
- Existing WebGL implementation files may remain dormant for compatibility/tests; they are no longer reachable through normal graph UI.

- [ ] **Step 1: Write failing renderer/aesthetic tests**

The new test must assert:

```js
assert.doesNotMatch(graphRenderer,/GraphScene3D|renderer-mode|WebGL|graph-renderer-switch/);
assert.match(graphRenderer,/Canvas25DGraph/);
```

And label placement behavior:

```js
const labels=placeSpatialLabels([
 {id:'focus',x:100,y:100,width:80,height:18,priority:100,forced:true},
 {id:'selected',x:108,y:108,width:90,height:18,priority:90,forced:true},
 {id:'far-a',x:112,y:112,width:90,height:18,priority:5,forced:false},
 {id:'far-b',x:114,y:114,width:90,height:18,priority:4,forced:false}
]);
assert.ok(labels.some(x=>x.id==='focus'));
assert.ok(labels.some(x=>x.id==='selected'));
assert.ok(labels.filter(x=>x.id.startsWith('far-')).length<=1);
```

Source assertions also require curved edge drawing (`quadraticCurveTo` or `bezierCurveTo`), depth-derived alpha, and mobile label-density branching.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
node --test test/graph-spatial-aesthetics.test.mjs test/graph-canvas-25d-v2.test.mjs test/graph-2_5d-navigation.test.mjs test/renderer-policy.test.mjs
```

Expected: new renderer retirement/LOD assertions fail.

- [ ] **Step 3: Simplify `GraphRenderer`**

Replace mode state, storage, URL mutation, lazy WebGL import and rollback boundary with one wrapper:

```tsx
export function GraphRenderer(props: GraphSurfaceProps & {zoom?:number; onZoomChange?:(zoom:number)=>void}) {
  return <div className="graph-renderer-canvas graph-renderer-spatial">
    <Canvas25DGraph
      projection={props.projection}
      selectedId={props.selectedId ?? null}
      onSelect={props.onSelect}
      onOpenNode={id => props.onOpenNode?.(id)}
      zoom={props.zoom}
      onZoomChange={props.onZoomChange}
    />
  </div>;
}
```

Do not delete dormant Three/R3F modules in this task; removing unreachable dependencies is a later cleanup only if the full regression suite proves they have no other consumers.

- [ ] **Step 4: Implement deterministic label LOD and depth-aware paint**

`placeSpatialLabels` sorts `forced` first, then descending priority, then stable ID. Forced labels remain; ordinary labels are rejected when their padded box overlaps an accepted box.

Canvas paint changes:

```ts
const depth01 = isCenter ? 1 : Math.max(0, Math.min(1, (pos.z + 1) / 2));
const depthScale = isCenter ? 1 : 0.68 + depth01 * 0.42;
const edgeAlpha = selectedEndpoint ? 0.78 : 0.16 + depth01 * 0.22;
```

Edges use a midpoint offset and `quadraticCurveTo`; labels are collected first, passed through collision placement, then drawn. Focus/selected labels are forced. On narrow/mobile widths, lower ordinary-label budget before collision placement.

- [ ] **Step 5: Run graph renderer/navigation/mobile tests**

```bash
node --test test/graph-spatial-aesthetics.test.mjs test/graph-canvas-25d-v2.test.mjs test/graph-2_5d-navigation.test.mjs test/graph-v2-mobile-layout.test.mjs test/renderer-policy.test.mjs test/graph-presentation.test.mjs
```

Expected: PASS. Update legacy 3D tests only where they incorrectly require the retired user-facing path; retain tests for dormant modules if those modules remain.

- [ ] **Step 6: Commit**

```bash
git add src/graph-engine src/design test/graph-spatial-aesthetics.test.mjs test/graph-canvas-25d-v2.test.mjs test/graph-2_5d-navigation.test.mjs test/graph-v2-mobile-layout.test.mjs test/renderer-policy.test.mjs test/graph-presentation.test.mjs
git commit -m "feat(atlas): converge graph UI on spatial canvas"
```

---

### Task 3: Introduce public manifest V2 and per-surface hash validation

**Files:**
- Create: `atlas-control-tower/lib/public-surface-manifest.mjs`
- Modify: `atlas-control-tower/lib/campaign-static-state-generator.mjs`
- Test: `atlas-control-tower/test/public-surface-manifest-v2.test.mjs`
- Test/adjust: `frontend-manifest.test.mjs`, `static-state-generator.test.mjs`, `static-browser-publication-contract.test.mjs`

**Interfaces:**
- Produces: `buildPublicManifest({sourceVersion, generatedAt, authority, surfaces})`
- Produces: `validatePublicManifest(value)`
- Produces: `surfaceFingerprint(manifest)`
- Surface descriptor: `{state:'READY',contract,path,sha256}` or `{state:'DATA_UNAVAILABLE'}`.

- [ ] **Step 1: Write failing manifest tests**

Assert that READY requires path/contract/64-hex hash, DATA_UNAVAILABLE forbids path/hash, graph is required, and top-level fingerprint changes when either a surface hash or surface state changes.

```js
assert.throws(()=>validatePublicManifest({contract:'NEXO_ATLAS_PUBLIC_MANIFEST_V2',surfaces:{graph:{state:'READY'}}}),/SURFACE_DESCRIPTOR_INVALID/);
assert.notEqual(
 buildPublicManifest({...base,surfaces:{...base.surfaces,activity:{state:'READY',contract:'activity-v1',path:'activity/index.json',sha256:'a'.repeat(64)}}}).fingerprint,
 buildPublicManifest({...base,surfaces:{...base.surfaces,activity:{state:'DATA_UNAVAILABLE'}}}).fingerprint
);
```

- [ ] **Step 2: Run and verify RED**

```bash
node --test test/public-surface-manifest-v2.test.mjs
```

Expected: module missing / assertions fail.

- [ ] **Step 3: Implement manifest builder/validator**

Use Node `createHash('sha256')`, stable sorted surface names, and include descriptor state in semantic fingerprint input. Return plain JSON-safe objects only.

- [ ] **Step 4: Emit V2 alongside the current legacy manifest**

During migration, write `current/public-manifest-v2.json` and the same file inside the content-addressed snapshot. Do not remove `current/manifest.json` yet.

- [ ] **Step 5: Verify manifest/static tests GREEN**

```bash
node --test test/public-surface-manifest-v2.test.mjs test/frontend-manifest.test.mjs test/static-state-generator.test.mjs test/static-browser-publication-contract.test.mjs
```

- [ ] **Step 6: Commit**

```bash
git add lib/public-surface-manifest.mjs lib/campaign-static-state-generator.mjs test/public-surface-manifest-v2.test.mjs test/frontend-manifest.test.mjs test/static-state-generator.test.mjs test/static-browser-publication-contract.test.mjs
git commit -m "feat(atlas): add versioned public surface manifest"
```

---

### Task 4: Materialize dedicated sanitized public surfaces

**Files:**
- Create: `atlas-control-tower/lib/public-surface-projections.mjs`
- Modify: `atlas-control-tower/lib/campaign-static-state-generator.mjs`
- Test: `atlas-control-tower/test/public-surface-manifest-v2.test.mjs`
- Test/adjust: `projections.test.mjs`, `olympus-detection.test.mjs`, `static-page-loaders-contract.test.mjs`

**Interfaces:**
- Produces: `buildPublicSurfaces(input)` returning `{observatory,laboratory,learning,operations,activity,audit,search}` descriptors and payloads.
- Every payload has `{contract,state,items/sections,sourceVersion,provenance}` and contains only allowlisted fields.

- [ ] **Step 1: Add failing sanitization/surface tests**

Use a fixture containing structural science, TEST/RESULT, an operational receipt, learning item, and an Olympus person record. Assert:

```js
assert.equal(result.laboratory.items.some(x=>x.type==='TEST'),true);
assert.equal(result.laboratory.items.some(x=>x.type==='RESULT'),true);
assert.equal(result.graph.nodes.some(x=>['TEST','RESULT','RUN'].includes(x.type)),false);
assert.equal(JSON.stringify(result).includes('person@example.com'),false);
assert.equal(JSON.stringify(result).includes('privateDriveId'),false);
```

- [ ] **Step 2: Run focused tests and verify RED**

```bash
node --test test/public-surface-manifest-v2.test.mjs test/projections.test.mjs test/olympus-detection.test.mjs
```

- [ ] **Step 3: Implement allowlist-first projection**

Create records by copying only stable public fields (`id`, `type`, `label/title/question`, `status`, `domain`, `primaryCampaign`, `summary`, `lastVerified/updatedAt`, normalized public provenance). Never deep-spread arbitrary source rows.

- [ ] **Step 4: Write surface JSON files and hashes**

Generate:

```text
surfaces/observatory/index.json
surfaces/laboratory/index.json
surfaces/learning/index.json
surfaces/operations/index.json
surfaces/activity/index.json
surfaces/audit/index.json
surfaces/search/index.json
```

Feed their SHA-256 values into manifest V2. If a source does not publish a surface, emit descriptor state `DATA_UNAVAILABLE`, not an empty READY payload.

- [ ] **Step 5: Verify projection/public-safety tests GREEN**

```bash
node --test test/public-surface-manifest-v2.test.mjs test/projections.test.mjs test/olympus-detection.test.mjs test/static-page-loaders-contract.test.mjs
```

- [ ] **Step 6: Commit**

```bash
git add lib/public-surface-projections.mjs lib/campaign-static-state-generator.mjs test
git commit -m "feat(atlas): publish sanitized purpose-specific surfaces"
```

---

### Task 5: Make manual Pages sync atomic across surfaces

**Files:**
- Modify: `atlas-control-tower/lib/pages-manual-live-api.mjs`
- Modify as required: `atlas-control-tower/src/api/client.ts`
- Test: `atlas-control-tower/test/pages-manual-live-api.test.mjs`
- Test: `atlas-control-tower/test/live-drive-sync.test.mjs`
- Test: `atlas-control-tower/test/sync-receipt.test.mjs`

**Interfaces:**
- Consumes manifest V2 from Task 3 and per-surface payloads from Task 4.
- Produces `lastSync.changedSurfaces: string[]`, before/after fingerprints, `readbackVerified`, and `lastValidPreserved` on failure.

- [ ] **Step 1: Extend sync tests first**

Add test fixtures for two identical manifest reads, a changed Observatory hash, a bad payload hash, and READY -> DATA_UNAVAILABLE. Assert no live state mutates before all changed payloads validate.

```js
assert.deepEqual(receipt.changedSurfaces,['observatory']);
assert.equal(receipt.readbackVerified,true);
assert.equal(await api.research('observatory-summary'),expectedNewObservatory);
```

For bad hash:

```js
assert.equal(receipt.outcome,'FAILED');
assert.equal(receipt.lastValidPreserved,true);
assert.equal(await api.research('observatory-summary'),oldObservatory);
```

- [ ] **Step 2: Run sync tests and verify RED**

```bash
node --test test/pages-manual-live-api.test.mjs test/live-drive-sync.test.mjs test/sync-receipt.test.mjs
```

- [ ] **Step 3: Implement immutable candidate sync**

Keep `active = {manifest, surfaces}`. Fetch A/B manifests with `cache:'no-store'`, compare fingerprints, compute changed descriptors, fetch each changed READY payload, SHA-256 verify serialized response bytes using Web Crypto, then assign `active=candidate` once.

A READY -> DATA_UNAVAILABLE descriptor deletes that surface from the candidate before swap.

- [ ] **Step 4: Route API methods through live surfaces when present**

`research`, `learning`, `ops`, `audit`, `searchIndex`, and activity reads use active V2 surfaces; static API remains fallback when there is no accepted live snapshot. Do not mix a new manifest with old live surface data.

- [ ] **Step 5: Run sync regression suite GREEN**

```bash
node --test test/pages-manual-live-api.test.mjs test/live-drive-sync.test.mjs test/sync-receipt.test.mjs test/pages-primary-manual-sync.test.mjs test/pages-fallback-contract.test.mjs
```

- [ ] **Step 6: Commit**

```bash
git add lib/pages-manual-live-api.mjs src/api/client.ts test/pages-manual-live-api.test.mjs test/live-drive-sync.test.mjs test/sync-receipt.test.mjs
git commit -m "feat(atlas): synchronize public surfaces atomically"
```

---

### Task 6: Build truthful H0-by-stack projection and forest plot

**Files:**
- Create: `atlas-control-tower/lib/h0-stack-projection.mjs`
- Create: `atlas-control-tower/src/components/H0StackForestPlot.tsx`
- Modify: `atlas-control-tower/lib/public-surface-projections.mjs`
- Modify: `atlas-control-tower/src/api/types.ts`
- Modify: `atlas-control-tower/src/api/adapters.ts`
- Modify: `atlas-control-tower/src/pages/atlas-pages.tsx`
- Test: `atlas-control-tower/test/h0-stack-projection.test.mjs`
- Test/adjust: `observatory-contract.test.mjs`, `observatory-v2.test.mjs`, `universe-page.test.mjs`

**Interfaces:**
- Produces `H0StackMeasurement` exactly as specified in the design.
- Produces `extractH0StackMeasurement(record): H0StackMeasurement | {unparsedReason:string}`.

- [ ] **Step 1: Write extraction tests before code**

Cover structured H0, deterministic legacy `H0=71.5884`, explicit `±` only when interval semantics are published, and ambiguity rejection:

```js
assert.equal(extractH0StackMeasurement({id:'T1',primaryCampaign:'C1',label:'Stack A',h0:71.2,uncertaintyLow:.8,uncertaintyHigh:.8,uncertaintyLevel:'68%'}).h0,71.2);
assert.equal(extractH0StackMeasurement({id:'T2',primaryCampaign:'C1',label:'Published configuration',keyMetrics:'authority f=.1, H0=71.5884, Δχ²=-25'}).h0,71.5884);
assert.equal(extractH0StackMeasurement({id:'T3',keyMetrics:'H0 maybe 70 or 72 depending branch'}).unparsedReason,'AMBIGUOUS_H0');
```

No test may infer `68%` or `1σ` from a bare `±` unless the source explicitly labels the interval.

- [ ] **Step 2: Run H0 tests and verify RED**

```bash
node --test test/h0-stack-projection.test.mjs test/observatory-contract.test.mjs
```

- [ ] **Step 3: Implement projection-time extractor**

Prefer structured fields. Legacy parsing accepts only an unambiguous token boundary such as `/\bH0\s*=\s*(\d+(?:\.\d+)?)/i` and rejects multiple distinct H0 matches. Use published record label as `stackLabel` when no more specific structured stack label exists; do not fabricate dataset membership.

- [ ] **Step 4: Implement accessible forest plot**

Render an SVG/HTML hybrid with one row per measurement, axis in `km/s/Mpc`, optional interval only when level is known, and a table fallback in the same DOM. Render delta panel only for rows with `baselineId` and `deltaH0`.

- [ ] **Step 5: Wire Observatory/Universe**

When `h0Stacks.length > 0`, render `Comparativo H0 por stack`. Render a weighted/reference band only if the surface payload carries explicit aggregate combination metadata. Preserve the current honest empty state otherwise.

- [ ] **Step 6: Run Observatory tests GREEN**

```bash
node --test test/h0-stack-projection.test.mjs test/observatory-contract.test.mjs test/observatory-v2.test.mjs test/universe-page.test.mjs
```

- [ ] **Step 7: Commit**

```bash
git add lib/h0-stack-projection.mjs lib/public-surface-projections.mjs src/components/H0StackForestPlot.tsx src/api src/pages/atlas-pages.tsx test/h0-stack-projection.test.mjs test/observatory-contract.test.mjs test/observatory-v2.test.mjs test/universe-page.test.mjs
git commit -m "feat(atlas): visualize H0 by published stack"
```

---

### Task 7: Populate Laboratory from the investigative surface

**Files:**
- Modify: `atlas-control-tower/src/api/types.ts`
- Modify: `atlas-control-tower/src/api/adapters.ts`
- Modify: `atlas-control-tower/src/api/hooks.ts`
- Modify: `atlas-control-tower/src/pages/atlas-pages.tsx`
- Test: `atlas-control-tower/test/laboratory-multisurface.test.mjs`
- Test/adjust: `static-page-loaders-contract.test.mjs`, `rich-science-routing.test.mjs`

**Interfaces:**
- Extend `LabData` with `hypotheses`, `decisions`, `knowledge`.
- Add adapter methods `getDecisions(context)` and `getKnowledge(context)`.
- Lab consumes dedicated investigative records; it does not rely on TEST/RESULT graph nodes.

- [ ] **Step 1: Write failing Lab data test**

Assert the hook/adapters request all nine stages and that source code contains stage rendering for HYPOTHESIS, DECISION and KNOWLEDGE. Assert the structural graph test still excludes TEST/RESULT.

- [ ] **Step 2: Run and verify RED**

```bash
node --test test/laboratory-multisurface.test.mjs test/static-page-loaders-contract.test.mjs test/graph-entity-contract.test.mjs
```

- [ ] **Step 3: Extend adapter/types/hooks minimally**

The `Promise.allSettled` order becomes:

```ts
[
 adapter.getHypotheses(context), adapter.getClaims(context), adapter.getTests(context),
 adapter.getRuns(context), adapter.getResults(context), adapter.getEvidence(context),
 adapter.getDecisions(context), adapter.getKnowledge(context), adapter.getPipelines(context)
]
```

Map each index explicitly into `LabData`.

- [ ] **Step 4: Replace empty contextual-map rectangle**

Render compact breadcrumb/lineage content: current system/domain/campaign/entity, counts by stage, and `Abrir no modo Grafos` only when a structural graph target exists. Do not mount another Canvas renderer.

- [ ] **Step 5: Run Lab + graph separation tests GREEN**

```bash
node --test test/laboratory-multisurface.test.mjs test/static-page-loaders-contract.test.mjs test/graph-entity-contract.test.mjs test/rich-science-routing.test.mjs
```

- [ ] **Step 6: Commit**

```bash
git add src/api src/pages/atlas-pages.tsx test/laboratory-multisurface.test.mjs test/static-page-loaders-contract.test.mjs test/rich-science-routing.test.mjs
git commit -m "feat(atlas): populate investigative laboratory surface"
```

---

### Task 8: Populate Cockpit and Activity from operational surfaces

**Files:**
- Modify: `atlas-control-tower/src/pages/CockpitPage.tsx`
- Modify: `atlas-control-tower/src/pages/AtividadePage.tsx`
- Modify: `atlas-control-tower/src/api/types.ts`
- Modify as needed: existing cockpit source helpers
- Test: `atlas-control-tower/test/activity-multisurface.test.mjs`
- Test/adjust: `cockpit-sources.test.mjs`, `cockpit-projection.test.mjs`, `operations-page-vnext.test.mjs`

**Interfaces:**
- Operations surface supplies blockers, active runs, health evidence and latest accepted sync receipt.
- Activity surface supplies ordered lifecycle events with stage, timestamp, status, work/campaign refs.

- [ ] **Step 1: Write failing Activity/Cockpit tests**

Activity assertions distinguish:

```js
{state:'DATA_UNAVAILABLE'} -> 'Fonte de atividade indisponível'
{state:'READY',items:[]} -> 'Nenhum evento publicado neste recorte.'
{state:'READY',items:[event]} -> renders event stage/status/timestamp
```

Cockpit assertion requires `Último readback verificado` when receipt exists and forbids the hardcoded `sem recibo nesta leitura` copy for a READY receipt.

- [ ] **Step 2: Run tests and verify RED**

```bash
node --test test/activity-multisurface.test.mjs test/cockpit-sources.test.mjs test/cockpit-projection.test.mjs
```

- [ ] **Step 3: Implement Activity read model/UI**

Load the activity surface through the configured client. Sort descending by timestamp with stable ID tie-breaker. Render stage chips from only the six contract stages.

- [ ] **Step 4: Wire Cockpit receipt/operations**

Use published operational state if available; otherwise preserve unknown/unavailable semantics. Do not manufacture health from absence of blockers.

- [ ] **Step 5: Run operational tests GREEN**

```bash
node --test test/activity-multisurface.test.mjs test/cockpit-sources.test.mjs test/cockpit-projection.test.mjs test/operations-page-vnext.test.mjs
```

- [ ] **Step 6: Commit**

```bash
git add src/pages/CockpitPage.tsx src/pages/AtividadePage.tsx src/api test/activity-multisurface.test.mjs test/cockpit-sources.test.mjs test/cockpit-projection.test.mjs test/operations-page-vnext.test.mjs
git commit -m "feat(atlas): surface verified operational activity"
```

---

### Task 9: Separate Learning corpus/runtime and expand search routing

**Files:**
- Modify: `atlas-control-tower/src/pages/LearningPage.tsx`
- Modify: `atlas-control-tower/src/data/load-learning.ts`
- Modify: existing global search loader/model files under `src/`
- Modify: `atlas-control-tower/src/core/PublicSnapshotSource.ts` only if needed to expose corpus separately from scheduler state
- Test/adjust: `learning-page-vnext.test.mjs`, `learning-vnext-loader.test.mjs`, `global-search-loader.test.mjs`, `global-search-model.test.mjs`, `global-search-ui.test.mjs`

**Interfaces:**
- Learning loader returns corpus availability independently from `runtime`/scheduler availability.
- Search routes structural nodes to graphs, investigative records to Lab, quantitative H0 records to Observatory, learning records to Learning.

- [ ] **Step 1: Add failing Learning/search tests**

Assert a payload with corpus READY and runtime DATA_UNAVAILABLE still renders the corpus. Assert TEST/RESULT routes contain `/laboratorio`, H0 measurement routes contain Observatory destination, and DOMAIN/CAMPAIGN preserve graph destination.

- [ ] **Step 2: Run and verify RED**

```bash
node --test test/learning-page-vnext.test.mjs test/learning-vnext-loader.test.mjs test/global-search-loader.test.mjs test/global-search-model.test.mjs test/global-search-ui.test.mjs
```

- [ ] **Step 3: Implement split availability and routing**

Do not let scheduler absence set the whole Learning source to unavailable. Keep runtime state as secondary metadata. Extend existing non-map route map rather than adding graph positions for investigative records.

- [ ] **Step 4: Run Learning/search tests GREEN**

```bash
node --test test/learning-page-vnext.test.mjs test/learning-vnext-loader.test.mjs test/learning-vnext-model.test.mjs test/global-search-loader.test.mjs test/global-search-model.test.mjs test/global-search-ui.test.mjs
```

- [ ] **Step 5: Commit**

```bash
git add src/pages/LearningPage.tsx src/data src/core/PublicSnapshotSource.ts test/learning-* test/global-search-*
git commit -m "feat(atlas): separate learning corpus and route rich search"
```

---

### Task 10: Full regression, public-safety audit, PR and Pages deployment

**Files:**
- Modify only files required by failures proven in this verification task.
- Test: full `atlas-control-tower/test/*.test.mjs`

**Interfaces:**
- Consumes all prior tasks.
- Produces a mergeable PR and verified Pages deployment.

- [ ] **Step 1: Generate a fresh static state**

```bash
cd atlas-control-tower
npm run state:build
```

Expected: generator completes and emits both legacy fallback artifacts and Manifest V2 without leaking forbidden fields.

- [ ] **Step 2: Run the complete test suite**

```bash
npm test
```

Expected: all tests PASS. If a legacy test requires the intentionally retired renderer toggle, update that test only if the new spec makes the old expectation invalid; do not loosen unrelated assertions.

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck
```

Expected: zero TypeScript errors.

- [ ] **Step 4: Run production build**

```bash
npm run build
```

Expected: Vite build exits 0 and static data generation succeeds.

- [ ] **Step 5: Run focused public-safety and Pages contracts once more**

```bash
node --test test/olympus-detection.test.mjs test/projections.test.mjs test/static-browser-publication-contract.test.mjs test/pages-fallback-contract.test.mjs test/pages-primary-manual-sync.test.mjs test/deployment-contract.test.mjs
```

Expected: all PASS.

- [ ] **Step 6: Review feature branch diff against main**

Confirm there are no unrelated infrastructure/auth changes, no secrets, no private Olympus/person records, and no direct-to-main commits.

- [ ] **Step 7: Push/open PR and wait for fresh CI**

PR title:

```text
feat(atlas): rework spatial graph and public read models
```

PR body must enumerate the four delivery phases and explicitly call out any upstream V2-sync capability that remains unavailable because the NEXO One bridge cannot publish it yet.

- [ ] **Step 8: Merge only after fresh CI is green**

Do not treat earlier branch runs as evidence for the merge commit.

- [ ] **Step 9: Verify GitHub Pages deployment/readback**

Validate at minimum:

```text
/Pantheon/
/Pantheon/grafos
/Pantheon/observatorio
/Pantheon/laboratorio
/Pantheon/atividade
```

Verify that Grafos uses the Spatial Canvas path with no renderer toggle, leaf selection cannot enter an empty subgraph, Lab and Activity no longer show false generic blanks when their surface is available, and static fallback survives a failed live sync.

- [ ] **Step 10: Record final readback**

Report merge SHA, Pages workflow run, deployed fingerprint, route smoke status, exact surface availability, and any external blocker separately from completed code.
