# NEXO Atlas Native Graph Renderers Design

## Goal

Make Canvas, PixiJS, Three.js and Babylon.js first-class renderers of the same Atlas graph projection. Remove the shadow environment-renderer path and legacy Renderer Lab state while preserving SSOT authority, hierarchy, cockpit semantics and mobile safety.

## Architecture

`app.mjs` owns graph state and asks `renderer-factory.mjs` for one renderer selected by `renderer-runtime.mjs`. Every renderer implements the same contract: `setGraph`, `setSelected`, `setTheme`, `setOptions`, `setPreset`, `fit`, `focusNode`, `reset`, `zoom`, `toggleFlat`, `start`, `stop`, and `destroy`.

The renderer never owns hierarchy. All engines consume the exact same result of `hierarchyView` / section projections. Switching engines may change drawing, camera and motion only.

## Renderers

- Canvas 2D / 2.5D: native Canvas renderer, safe on mobile and universal fallback.
- PixiJS 2D: native Pixi geometry and filaments, Canvas overlay only for crisp labels/picking text.
- Three.js 2.5D / 3D: existing native Three renderer with deterministic visual extensions loaded by the factory.
- Babylon.js 2.5D / 3D: native Babylon meshes, lines and ArcRotateCamera, Canvas overlay only for labels/picking UI.

## State authority

Experience chooses the renderer by default. A user renderer choice becomes one explicit manual override stored under `nexo-atlas-renderer-runtime-v7`. URL state uses `renderer-v4`; the old `renderer` parameter remains only as a standalone bootstrap compatibility hint. There is no environment renderer shadow state.

## Mobile

Canvas and Pixi are mobile-safe. Three and Babylon resolve to Canvas on mobile by default. No heavy renderer may leave a blank stage; failed renderer initialization falls back to Canvas.

## Legacy removal

Delete `engine-bridge-auto.mjs` and `renderer-lab-preferences.mjs`. `canvas-reference-background.mjs` is limited to Canvas visual treatment and no longer owns renderer registry, persistence, viewport policy or renderer UI.

## Hierarchy invariants

The renderer layer cannot change canonical graph IDs or structure. Graph Lab remains `NEXO -> CIÊNCIA / OLYMPUS / ENGENHARIA -> local subgraphs`, with alternative filaments as an opt-in edge overlay.

## Verification

The change requires graph-lab contract tests, runtime coherence tests, renderer source syntax checks, full Atlas CI typecheck/build, and production readback. Browser smoke coverage should exercise at least Canvas, Pixi, Three and Babylon selection plus mobile fallback when the runtime environment provides a browser.
