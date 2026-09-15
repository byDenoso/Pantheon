# Atlas Neural + Atlas Shell Merge Design

**Date:** 2026-09-15  
**Status:** Approved for implementation  
**Scope:** Merge the existing Atlas workspace with the Atlas Neural spatial graph interface.

## Goal

Make the Atlas Neural canvas the primary graph experience at `/mapa`, while preserving the current Atlas shell, public data contracts, operational surfaces, and accessible fallback behavior.

## Product decision

The current Atlas shell remains the application frame: header, workspace preferences, search, synchronization status, Cockpit, Observatório, Laboratório, activity, provenance, and route handling remain owned by the main Atlas application. The current legacy graph renderer is replaced only inside the `GRAFOS` surface by the Atlas Neural V3 experience.

The existing standalone `/atlas-v3/` entry point remains available during the merge as a diagnostic compatibility route. It must consume the same V3 snapshot and must not become a second data authority.

## Architecture

### Shell boundary

`src/App.tsx` continues to own route selection, global session state, preferences, primary navigation, and shared overlays. `GraphsPage` becomes the integration boundary for Neural V3 instead of directly owning a second graph implementation.

### Neural boundary

`src/atlas-v3/AtlasV3App.tsx` remains the owner of the spatial canvas, Neural layer controls, camera interaction, scene adapter, labels, inspector, theme resolution, and responsive behavior. Its data loader continues to read `data/v3/current/manifest.json` and the validated snapshot behind that manifest.

The integration must expose a shell-embeddable Neural component with explicit props for:

- `snapshot` or an injected `loadSnapshot` promise;
- current theme and theme changes;
- initial layer/focus;
- compact/mobile mode;
- navigation callbacks for opening an entity in the Atlas inspector or research surface;
- an accessible fallback when WebGL is unavailable.

The standalone entry point can use the same component with its current defaults.

### Data flow

```text
GitHub Pages / Vercel shell
  -> V3 manifest
  -> validated V3 snapshot
  -> scene adapter
  -> Neural layer projection
  -> spatial canvas or accessible graph table
```

The legacy static API remains responsible for non-Neural Atlas surfaces and compatibility routes. The Neural graph must not call retired Vercel endpoints from GitHub Pages and must not fabricate nodes when a snapshot is unavailable.

## Interaction model

- Opening `GRAFOS` always resets the graph focus to `system:NEXO`, preventing a previous `Aprendizado`, `Health`, or domain focus from leaving the main map visually empty.
- Neural layer toggles are the primary graph navigation: `NEXO`, `SCIENCE`, `OPERATIONS`, `HEALTH`, `AUTOMATIONS`, and `EVIDENCES`.
- `HEALTH` continues to display the sanitized Olympus synchronization panel.
- Selecting a canonical node opens the shared Atlas inspector or an equivalent Neural inspector with type, status, domain, authority, summary, and provenance navigation.
- Presentation-only nodes remain visual scaffolding and are never exposed as canonical data.
- Theme selection is shared with the Atlas shell where possible; persistence must not create conflicting theme states between shell and Neural route.

## Responsive and performance requirements

- Only one graph renderer is mounted for the main graph surface.
- The Neural chunk remains lazy-loaded so Cockpit and Observatório do not pay the canvas cost before entering Grafos.
- On WebGL/WebGPU failure, the graph remains usable through the accessible table and explicit state messaging.
- Mobile retains a full-height stage, reachable controls, no horizontal overflow, and touch targets of at least 44px.
- The existing spacing and camera recalibration from Neural V3 remains the source of truth; the merge must not shrink the graph merely to fit the shell.

## Error handling

- Invalid or unavailable V3 manifest: show `Projeção indisponível` with the concrete loader error and a retry action.
- Empty layer: show a truthful empty state for that layer; do not render a fake graph.
- WebGL context loss: switch to the accessible graph table for the current projection.
- Shell route or overlay failure: keep the graph surface mounted and expose a local error state rather than blanking the entire application.

## Testing and validation

Add or update tests for:

1. `GRAFOS` resets a stale graph-layer focus to `system:NEXO`.
2. The main `/mapa` surface mounts the Neural component and does not mount the legacy renderer simultaneously.
3. The embedded Neural component and standalone `/atlas-v3/` consume the same V3 loader contract.
4. Layer selection produces non-empty projections for the published NEXO, Science, Operations, Health/Olympus, Automations, and Evidences data where the snapshot contains matching nodes.
5. Invalid/empty snapshot states remain explicit and truthful.
6. WebGL fallback, mobile overflow, touch-target, theme persistence, and Olympus health synchronization continue to pass.
7. GitHub Pages build, browser smoke, static readback, and production URL verification pass after publication.

## Non-goals

- Replacing the Atlas data authority model.
- Publishing private Olympus/client data.
- Rebuilding the V3 scene adapter or inventing a second graph layout engine.
- Removing the standalone Neural route before the merged surface has passed production readback.
