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
Retire the standalone V3 SVG renderer and reuse the repository's mature React Three Fiber `AtlasCanvas` as the single WebGL spatial engine. Do not fork a second 3D engine: the existing renderer already owns real XYZ layout, orbital guides, star field, animated node/edge transitions, semantic label LOD, WebGL failure containment and Canvas fallback.

The Projection V3 adapter adds only presentation hierarchy: NEXO and deterministic cluster hubs sit above canonical projection nodes via `layoutParent`. Canonical snapshot objects are never mutated. Interdomain relations remain canonical edges and traverse spatial regions as visually distinct filaments.

Visual language:
- emissive node cores and restrained aura/glow;
- depth-aware particles and star field;
- 3D filaments and orbital guides;
- atmospheric depth cues;
- selected-node focus and camera transition;
- labels culled by semantic importance and camera projection;
- cinematic camera interpolation rather than hard jumps.

Visual effects are presentation only and never alter graph semantics.

## Navigation
Desktop:
- orbit/rotate, pan and dolly/zoom;
- click node to focus/select and open inspector;
- structural nodes drill into their subgraph;
- keyboard escape returns one navigation level;
- search result can focus an entity;
- reset/home returns to NEXO overview.

Mobile:
- one-finger orbit;
- two-finger pinch zoom and pan through OrbitControls;
- tap selects;
- no hover-only controls;
- inspector becomes a bottom sheet;
- compact HUD and search sheet;
- controls respect safe-area insets and browser dynamic viewport units.

## Responsive architecture
Do not shrink the desktop grid. At narrow viewports the graph becomes the primary full-screen surface. Desktop side rails collapse into drawers/bottom sheets. Header metrics collapse into a compact status row. Minimum hit targets are 44 CSS px. No horizontal page overflow is allowed.

Use `100dvh`, `env(safe-area-inset-*)`, pointer-capable R3F controls and explicit `touch-action` rules for the canvas/control surfaces.

## Adaptive quality
Reuse the renderer's semantic LOD and compact budgets instead of bolting a second quality governor onto the scene. Compact surfaces receive smaller visible-node and label budgets; selected/focused entities are preserved by semantic LOD. Rendering is suspended when the document is hidden. Reduced-motion removes continuous decorative motion and snaps graph transitions. The V3 shell also reduces label footprint and decorative density on narrow screens.

This is intentionally conservative: the current public V3 hot set is small enough that a second frame-budget controller would add renderer coupling without measurable benefit. If the full Tower projection later pushes the graph beyond the existing LOD envelope, frame-time/DPR adaptation becomes a separate measured change with its own performance gate.

## Loading / failure / accessibility
- deterministic loading state while manifest/snapshot/renderer load;
- explicit WebGL-unavailable fallback with a usable Canvas graph, never a blank canvas;
- projection error keeps the existing no-invented-state principle;
- stage has an accessible summary and entity inspector remains keyboard reachable;
- hidden search/inspector controls are unmounted so they cannot become focus traps;
- visible focus states and semantic buttons;
- sufficient text contrast over glass surfaces.

## Implementation audit
Before fixes, reproduce mobile failures and trace root causes across HTML/CSS, renderer sizing, pointer handling, viewport units and graph data flow. Add regression tests before each root fix.

Verified root causes to address:
- the old V3 fixed 1600×900 SVG viewBox scaled poorly to phone aspect ratios;
- mobile overlays were independently fixed-positioned and could cover one another;
- wheel/drag logic had no true pinch/dolly camera model;
- hidden panels remained mounted and could retain keyboard focus;
- desktop inspector/header geometry was being compressed rather than recomposed for mobile;
- the V3 page was a public static script, preventing reuse of the mature R3F renderer and its fallback/navigation behavior.

After functional fixes, sweep for:
- overflow and clipping;
- stale event listeners / resize behavior;
- renderer fallback and lifecycle;
- label collision/occlusion;
- unreachable controls;
- loading/error/empty states;
- keyboard and touch navigation;
- visual hierarchy and information density;
- performance on constrained viewport profiles.

## Test and release gates
- contract tests for 3D renderer and no authority regression;
- responsive tests for phone portrait, phone landscape, tablet and desktop;
- WebGL fallback and reduced-motion tests;
- full unit suite, typecheck and production build;
- Playwright/browser smoke at multiple viewports, including resize/orientation;
- production Pages deploy and HTTP readback;
- no merge/deploy success claim until fresh evidence passes.

## Delivery strategy
Implement on `feat/atlas-v3-cinematic-3d-mobile`. Keep the current public V3 intact until the branch passes CI. Merge through PR, then require canonical Pages deploy and public readback before considering the rework complete.