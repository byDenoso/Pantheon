# NEXO Spatial Knowledge Interface v2

## Product decision

NEXO is an operational knowledge space. The graph is the primary navigation surface; sidebar, Inspector, Observatory, Laboratory, Runtime and Search are auxiliary instruments. The experience must preserve spatial, semantic, navigation and operational depth at the same time.

## Core interaction model

The first implementation authority is the triad:

1. **Context Shell**: the current context dominates while ancestors remain as subdued anchors behind it.
2. **Relation Horizon**: semantically important non-hierarchical neighbors appear as portal nodes and permit cross-domain jumps.
3. **Navigation Stack**: navigation stores and restores the whole scene, not only a parent ID.

Each navigation frame carries root/focus, selection, camera/zoom/orientation, filters, expanded relations, visible layers and timestamp. Back and Forward restore frames. Breadcrumb navigation is direct. Cross-domain jumps are visibly distinguished from drill-down.

## Graph model

The graph distinguishes hierarchy, relation, evidence, dependency and provenance edges. Depth is arbitrary. X/Y encode spatial relationship in the current context; Z communicates semantic depth and ancestry, not decoration.

Stable layout is seeded by canonical entity ID. Working set is progressively disclosed and should normally remain in the 50-250 visible-node range even when the logical graph is much larger.

Graph modes are projections over the same data model:

- Explore: hierarchy-first navigation.
- Relations: external relationships expanded.
- Evidence: Hypothesis -> Test -> Result -> Evidence -> Claim emphasized.

Semantic zoom changes both visual scale and information density across macro, meso, micro and detail levels.

## Renderer policy

`GraphRenderer` is the abstraction boundary. Canvas/Pixi 2.5D is the default renderer because it is already validated. WebGL/R3F is retained as an opt-in renderer and may become default only after profiling demonstrates a material benefit. Renderer choice must not own navigation, state, layout semantics or product UX.

## Inspector and investigation state

Selection opens a Quick Inspector. The expanded inspector exposes Overview, Relations, Evidence, History, Runs, Artifacts and Provenance when the backend advertises those capabilities. Contextual actions come from entity capabilities rather than frontend guesses.

Nodes may be pinned. Compare mode holds two selected entities and highlights shared relations/evidence when available.

## Theme system

Supported modes are System, Light, Dark, Deep Space and High Contrast. Theme state uses semantic tokens shared by DOM and graph renderer. Theme changes invalidate renderer visual caches but do not reload or discard graph state.

Required graph tokens include canvas background, grid, edge, label, focus, node palette and relation semantics. Light mode is independently designed rather than a CSS inversion.

## Loading, refresh and reliability

Startup order is shell -> last valid snapshot -> background refresh -> validated state -> reconciliation. A failed refresh never destroys the previous valid graph. STALE must expose age/freshness. EMPTY must not invent entities.

Refresh applies graph diffs and exposes change awareness. Module-level error boundaries keep unrelated surfaces usable.

## Data contract direction

The target graph envelope is:

```ts
GraphSnapshot {
  schemaVersion
  graphVersion
  generatedAt
  freshness
  root
  nodes[]
  edges[]
  capabilities
}
```

Nodes carry canonical identity, type/domain/status, parent/child relationships, importance/confidence/freshness, timestamps, provenance, metrics and capabilities. Lazy reads use root, neighborhood and relations endpoints; visited sectors are cached locally and selected nodes are prefetched.

## Responsive and accessible operation

Desktop supports expanded, compact and immersive navigation shells. Mobile gives the graph the viewport and moves Inspector to a bottom sheet. Keyboard covers selection, movement, Enter, Escape and Back. `prefers-reduced-motion` removes non-essential motion while preserving navigation feedback. Canvas exposes a parallel semantic DOM tree.

## Performance targets

- perceived shell < 500 ms
- cached graph < 1 s
- selection feedback < 50 ms
- camera interaction >= 45 FPS in the defined working set
- navigation transition <= 650 ms
- theme switch < 250 ms

Adaptive quality may reduce particles, blur, background effects, label density and DPR, but never data fidelity.

## Release gates

The product is not accepted if Back loses scene state, Forward is absent, theme only changes surrounding DOM, labels collide chaotically, layout drifts between sessions, loading becomes a white screen, a failed refresh deletes valid information, or the graph behaves like a decorative animation.

The central product test is continuity: a user must be able to traverse Science -> Cosmology -> Dark Energy -> Campaign -> Hypothesis -> Test -> Run -> Result -> Evidence -> Claim while still feeling inside one continuous knowledge space.