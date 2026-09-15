# Atlas Neural V3 — Cinematic 3D + Mobile Rework

## Goal
Transform the current orbital Atlas V3 into a true spatial graph workspace while preserving the existing TOWER_V06 projection boundary. Fix the mobile breakage at the layout/input/rendering roots, then perform a separate UI/UX and implementation audit.

## Non-negotiable invariants
- TOWER_V06 remains the sole operational authority.
- Browser remains read-only and consumes Projection V3 only.
- No fallback may invent canonical state.
- Public projection remains privacy allowlist-first.
- NEXO and visual cluster hubs remain presentation-only.
- Legacy Atlas remains available until production readback proves the new surface.

## Renderer
Replace the current 2D SVG graph renderer with a WebGL spatial renderer based on Three.js / React Three Fiber or an equivalent thin Three.js layer if integrating React into the standalone V3 shell creates unnecessary coupling.

The graph uses meaningful XYZ positions. Domain/program hubs occupy separated spatial regions; campaign, hypothesis, test, work, result, evidence and filament nodes form local constellations. Interdomain relations traverse regions as visually distinct filaments.

Visual language:
- emissive node cores with restrained bloom;
- depth-aware particles and star field;
- curved 3D edges/filaments;
- atmospheric fog/depth cues;
- selected-node halo and focus transition;
- labels that scale/cull by camera distance and importance;
- cinematic camera interpolation rather than hard jumps.

Visual effects are presentation only and never alter graph semantics.

## Navigation
Desktop:
- orbit/rotate, pan and dolly/zoom;
- click node to focus and open inspector;
- double click / explicit focus action to fly camera to cluster;
- keyboard escape returns one navigation level;
- search result can fly to entity;
- reset/home returns to NEXO overview.

Mobile:
- one-finger orbit;
- two-finger pinch zoom and pan where supported;
- tap selects;
- no hover-only controls;
- inspector becomes a bottom sheet;
- compact HUD and search sheet;
- controls respect safe-area insets and browser dynamic viewport units.

## Responsive architecture
Do not shrink the desktop grid. At narrow viewports the graph becomes the primary full-screen surface. Desktop side rails collapse into drawers/bottom sheets. Header metrics collapse into a compact status row. Minimum hit targets are 44 CSS px. No horizontal page overflow is allowed.

Use `100dvh` with safe fallbacks, `env(safe-area-inset-*)`, pointer events instead of mouse-only listeners, and explicit `touch-action` rules for the canvas/control surfaces.

## Adaptive quality
Introduce a renderer quality tier selected from viewport, DPR, reduced-motion preference and observed frame budget. Cap DPR on mobile. Expensive effects degrade in this order: particle density -> bloom quality -> edge animation -> star density. Graph semantics, labels for selected/focused entities and navigation must never disappear.

Respect `prefers-reduced-motion` by disabling continuous camera drift and shortening focus transitions.

## Loading / failure / accessibility
- deterministic loading state while manifest/snapshot/renderer load;
- explicit WebGL-unavailable fallback with a usable non-cinematic graph/list surface, never a blank canvas;
- projection error keeps the existing no-invented-state principle;
- canvas has an accessible summary and entity inspector remains keyboard reachable;
- visible focus states and semantic buttons;
- sufficient text contrast over glass surfaces.

## Implementation audit
Before fixes, reproduce mobile failures and trace root causes across HTML/CSS, renderer sizing, pointer handling, viewport units and graph data flow. Add regression tests before each root fix.

After functional fixes, perform a separate sweep for:
- overflow and clipping;
- stale event listeners / resize observers;
- renderer disposal and memory leaks;
- device pixel ratio misuse;
- label collision/occlusion;
- unreachable controls;
- loading/error/empty states;
- keyboard and touch navigation;
- visual hierarchy and information density;
- performance on constrained viewport/GPU profiles.

## Test and release gates
- contract tests for 3D renderer and no authority regression;
- responsive tests for phone portrait, phone landscape, tablet and desktop;
- pointer/touch navigation tests;
- WebGL fallback test;
- reduced-motion test;
- full unit suite, typecheck and production build;
- Playwright/browser smoke at multiple viewports;
- production Pages deploy and HTTP readback;
- no merge/deploy success claim until fresh evidence passes.

## Delivery strategy
Implement on `feat/atlas-v3-cinematic-3d-mobile`. Keep the current public V3 intact until the branch passes CI. Merge through PR, then require canonical Pages deploy and public readback before considering the rework complete.