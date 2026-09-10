# NEXO Atlas Breakthrough Canvas 2.5D Design

## Objective

Transform the current Canvas 2.5D renderer into the visual foundation for the Breakthrough “Modo Atlas” concept: full-screen cognitive map, minimal chrome, semantic depth, spatial domain regions, meaningful filaments and progressive detail. The result must feel like a living scientific atlas, not a graph dashboard.

## Product Principle

The graph remains a projection of NEXO. Canvas 2.5D may change geometry, depth cues, motion, labels and chrome, but it must not change SSOT authority, canonical IDs, hierarchy, associative-memory semantics or learning-filament truth status.

## Visual Direction

Use a dark, rustic scientific-atlas aesthetic: charcoal/ink background, restrained sepia typography, muted cyan for Ciência, muted violet for Olympus, muted green for Engenharia and warm bone/gold for NEXO. Avoid neon bloom, glassmorphism, cyberpunk gradients and gratuitous particles.

## Spatial Model

Canvas 2.5D uses deterministic x/y/z positions from the existing hierarchy layout. Z is visual depth only. It affects apparent scale, alpha, fog, line weight, parallax and focus, never data semantics.

Macrodomains become spatial regions rather than oversized node badges. Their descendants form local constellations around stable domain anchors. Associative memories remain transverse overlays positioned between declared anchors, never fourth-level hierarchy branches.

## Semantic Zoom

Four semantic zoom bands are required:

- Z0 Overview: NEXO + three macrodomains + strongest inter-domain filaments.
- Z1 Domain: domain groups/programs and selected associative bridges.
- Z2 Program/Campaign: campaigns, tests, selected semantic/procedural memories and evidence context.
- Z3 Audit: selected entity, direct relations, evidence/falsifier metadata and minimal surrounding context.

Visibility changes by semantic priority and zoom band, not only geometric size.

## Filament Language

Filament weight affects width and pulse strength only when weight is explicitly published. Missing weight preserves canonical legacy width. Status modifies alpha/dash behavior. Supported is stable, candidate is lighter/dashed, dormant is faint and contradiction receives a restrained break/reverse accent. Motion must communicate activation, not decorate the background.

## Focus Tunnel

Selecting an entity keeps the full graph available but fades unrelated nodes and edges. Direct ancestors, descendants, associative memories, evidence and learning filaments stay emphasized. The cockpit becomes contextual detail, not a permanent wall of controls.

## Domain Fields

Each macrodomain receives a subtle field generated from its visible nodes: low-opacity contour/mesh-like strokes and sparse grain, clipped to the graph stage. Fields must be derived from visible geometry and must not create synthetic entities.

## Interface

Desktop primary shell: slim top navigation, full-stage graph, contextual inspector on demand, compact lens row and minimal map controls. Renderer implementation details stay under Advanced.

Mobile: same graph semantics, Canvas 2.5D preferred when performance permits, semantic zoom more aggressive, maximum visible labels reduced, bottom navigation preserved and contextual inspector rendered as the existing mobile bottom sheet.

## Performance Budget

Canvas 2.5D must remain mobile-safe. Target steady interaction at >= 45 FPS on representative mobile CI smoke conditions and >= 55 FPS on desktop smoke conditions where timing is available. Cap DPR at 2. Avoid per-frame object allocation in hot drawing loops where practical. Pause decorative animation under reduced-motion and while the mobile inspector is expanded.

## Accessibility

Selection, focus and semantic zoom must remain reachable through existing keyboard/touch controls. Respect prefers-reduced-motion. Labels and inspector copy must maintain readable contrast. No critical state may be communicated through color alone.

## Non-Goals

Do not migrate the product to Three/Babylon for this release. Do not create a separate mobile app. Do not create a second graph state. Do not introduce a fourth macrodomain for memory. Do not add temporal Lens/Pulse history in this release beyond hooks/interfaces needed for later work.

## Acceptance

The release is complete when Canvas 2.5D can render the canonical NEXO overview with domain fields, semantic zoom, focus tunnel and weighted associative filaments; mobile remains usable; existing hierarchy and truth-contract tests remain green; browser smoke covers desktop and mobile Canvas 2.5D; and production readback confirms the pinned commit.