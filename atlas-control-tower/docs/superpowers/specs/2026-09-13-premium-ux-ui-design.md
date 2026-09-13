# NEXO Atlas Premium UX/UI Design

## Product decision

The approved visual direction becomes the frontend north star: NEXO Atlas should feel like a scientific knowledge instrument, a research cockpit and a spatial knowledge interface. The graph remains the primary exploration surface; Observatory, Laboratory, Universe Summary, Operations, Search and Inspector support that surface rather than compete with it.

The redesign must preserve data contracts, scientific authority and canonical identifiers. It may improve adapters and presentation semantics, but it must never invent data, hide unavailable states, relabel stale data as live or turn backend uncertainty into decorative confidence.

## UX invariant

Every primary surface should answer five questions with minimal effort:

1. Where am I?
2. What am I looking at?
3. Why does it matter?
4. How trustworthy/current is it?
5. What is the next useful action?

When a screen cannot answer these questions, the UI is considered incomplete even if it is visually polished.

## Shell architecture

Desktop uses a three-region shell:

- **left rail**: compact systems/navigation rail, recent/favorite/saved-entry affordances later;
- **center workspace**: full-bleed graph or page-specific scientific surface;
- **right contextual inspector**: persistent entity context when selected.

The top bar is compact and contains brand, principal areas, global command/search entry, freshness/system status, theme control and operations entry. Secondary navigation must not create a second permanent toolbar that steals graph height.

Mobile is not compressed desktop. It uses a compact header, horizontally scrollable/snapping primary navigation, full-viewport graph, bottom control dock and an inspector bottom sheet. Layout must respect `100dvh`, safe areas and browser chrome.

## Semantic design system

All visual surfaces derive from semantic tokens rather than page-specific hardcoded values.

Required token families:

- background: base, depth;
- surfaces: default, raised, overlay, hover;
- text: primary, secondary, muted;
- borders: subtle, strong;
- semantic accents: accent, success, warning, danger, info;
- graph: background, focus, primary, secondary, muted, selection, label tiers;
- edge semantics: hierarchy, relation, evidence, dependency, provenance, contradiction;
- system states: live, snapshot, stale, degraded, unknown, derived, published;
- spacing, typography, radius, shadow, blur, motion and z-index.

System, Light, Dark, Deep Space and High Contrast are all first-class themes over the same token graph. Theme changes must update DOM and graph renderer without discarding navigation state.

## Graph workspace

The graph is full-bleed and never framed as a conventional card. Controls float over it as instruments.

The existing spatial model is preserved and strengthened:

- **Ancestor Shell** keeps previous semantic context visible but subdued;
- **Current Space** dominates the scene;
- **Relation Horizon** shows relevant non-hierarchical portals;
- **Navigation Stack** restores scene state, not only route strings.

Cross-domain transitions are visually distinct from hierarchical drill-down. The graph should preserve continuity rather than teleport between unrelated compositions.

### Semantic LOD

Four product levels are explicit:

- **Macro**: systems, universes, domains;
- **Meso**: campaigns, hypotheses, datasets;
- **Micro**: tests, runs, results;
- **Detail**: evidence, claims, provenance, artifacts.

Zoom changes information density, not only node scale. Focus and selected nodes cannot be dropped by LOD. Visible-node, edge, label and animated-edge budgets are bounded.

### Nodes, labels and edges

Node presentation distinguishes focus, primary, secondary, context, portal, pinned and selected roles. Canonical IDs remain available for audit/inspector but do not dominate the canvas.

Labels use priority, collision avoidance and LOD. Focus and selection labels remain visible. Long labels are compacted for the canvas and expanded in the Inspector.

Edges use a consistent semantic grammar for hierarchy, relation, evidence, dependency, provenance and contradiction. Secondary edge noise is attenuated; active paths may be highlighted without promoting derived relationships to evidence.

## Context Bar

A compact contextual strip exposes the navigation path and, where available, freshness/authority metadata. It should communicate `NEXO / Science / Cosmology / …` without becoming another tall header.

## Inspector

Desktop Inspector targets roughly 380–460 px and remains visually elevated above the graph. Mobile Inspector becomes a bottom sheet with approximately 30%, 65% and 95% snap levels.

The Inspector adapts to entity capabilities and type. Baseline sections are:

- Overview;
- Relations;
- Evidence;
- History;
- Runs;
- Artifacts;
- Provenance.

Overview prioritizes human-facing `what`, `how`, `why`, summary, type, status, domain, authority/evidence class, freshness, confidence and source. Raw technical metadata is secondary and collapsible. Technical enum values may remain canonical internally but require separate human labels in normal presentation.

## Quick Peek, Pin and Compare

Desktop can show a lightweight Quick Peek from hover/focus; mobile may use long press. It must preserve the current context.

Pin keeps important entities visually present. Compare supports two entities and surfaces meaningful differences in status, evidence, confidence, source, freshness, provenance, relations and conclusion where fields exist.

## Command palette and productivity

`Cmd/Ctrl+K` becomes the global command/search entry rather than only focusing an input. Search results are grouped by meaningful entity types and product areas. Commands may navigate/focus/select entities and invoke safe read-only actions.

Later productivity layers include Saved Views, Recent, Favorites and `What Changed`. They must persist complete context (route, focus, camera, zoom, filters, LOD, selection/inspector, pins and compare) rather than shallow URLs only.

## Product surfaces

### Observatory

Observatory is a situation room. It prioritizes what changed, what matters and what needs attention: recent signals, anomalies, scientific changes and high-value metrics. It should not degrade into a wall of identical cards.

### Laboratory

Laboratory communicates the investigative flow `Hypothesis -> Test -> Run -> Result -> Evidence`. Current stage, inputs, outputs, blockers, artifacts and provenance should be visible when the backend supplies them.

### Operations

Operations is an execution cockpit, prioritizing runtime health, blockers, automation state, recent executions, failures, readbacks and critical path. Its visual grammar may be denser and more operational than Observatory while staying within the same design system.

### Universe Summary

Universe Summary uses editorial hierarchy rather than a uniform card matrix: question, synthesis, status, evidence, freshness/provenance and actions to open related graph/evidence. Missing synthesis is represented as a precise state, never fabricated prose.

## State language

The product uses distinct states for Loading, Empty, Filter Empty, Unknown, Unavailable, Snapshot, Stale, Degraded and Error. A generic `sem dados` catch-all is not allowed.

Loading is localized. Failed refresh preserves the last valid state. Errors present a human message with expandable technical details. Root render failures must remain visible through the bootstrap boundary rather than produce a blank screen.

## Motion

Motion communicates continuity:

- fast control feedback: roughly 120–180 ms;
- panels/sheets: roughly 220–320 ms;
- spatial transitions: roughly 350–500 ms.

`prefers-reduced-motion` removes non-essential motion while preserving state change feedback.

## Accessibility

Keyboard navigation, visible focus, semantic landmarks, ARIA labelling, focus traps for modal/sheet surfaces, screen-reader state announcements, AA contrast and reduced-motion support are required. Status cannot depend on colour alone.

## Performance

Canvas/Pixi remains the safe default renderer. WebGL/WebGPU stays lazy and opt-in until profiling proves a product benefit.

Frontend budgets are explicit: useful shell as early as possible, immediate selection feedback, perceived navigation below a few hundred milliseconds where cached/local state permits, stable frame rate under the bounded working set, lazy page/render-engine loading and semantic density budgets.

Adaptive quality may later expose High, Balanced and Performance modes, selected from hardware, viewport and graph density without reducing data fidelity.

## Testing and release gates

The redesign must add or strengthen:

- unit and structural contract tests;
- interaction tests;
- browser bootstrap acceptance;
- route/keyboard/mobile acceptance;
- horizontal-overflow checks;
- screenshot coverage for desktop/tablet/iPhone and primary themes;
- graph/inspector/state screenshots;
- no-pageerror/no-fatal-console assertions.

A build is not release evidence by itself. A phase is accepted only when tests, typecheck, production build and browser acceptance are green, and the published surface has a successful readback when deployment is available.

## Delivery order

1. **Foundation**: semantic tokens, shell hierarchy, responsive/mobile foundation, state language and theme coherence.
2. **Graph experience**: full-bleed workspace, Context Bar, HUD hierarchy, labels/edges/LOD polish and minimap integration.
3. **Context**: adaptive Inspector, mobile sheet behaviour, Quick Peek foundations, Pin/Compare presentation.
4. **Productivity**: command palette, navigation memory refinements, recent/favorites/saved-view foundations and change awareness.
5. **Product surfaces**: Observatory, Laboratory, Operations and Universe Summary composition.
6. **Polish**: motion, accessibility, performance budgets and visual regression.
7. **Advanced later**: Temporal Mode, global graph diff, snapshot comparison and presentation/story modes.

P0 foundation and graph usability must land before advanced P2 features. The project must not trade structural usability for decorative effects.