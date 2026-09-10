# Atlas Mobile + UI/UX Design

## Goal
Make NEXO Atlas feel native on phones while simplifying the desktop shell, without changing SSOT authority, hierarchy, renderer contracts, or associative-memory semantics.

## Core UX
The graph remains the primary surface. Mobile chrome must reserve space instead of stacking absolute overlays. Primary navigation becomes a safe-area-aware bottom bar with NEXO, Ciência, Olympus, Engenharia and Filamentos. Search stays in the top bar. Renderer tuning remains secondary and collapsed.

## Mobile interaction
Use `100dvh` and `env(safe-area-inset-*)`. Primary tap targets are at least 44px. The contextual node action is a compact bottom sheet above navigation. Cockpit opens as a draggable/responsive sheet with compact and expanded states. The graph stays visible behind it. Technical controls are hidden unless explicitly opened.

## Visual hierarchy
Status becomes one compact readout. NEXO/domain navigation and node actions never occupy the same band. Labels respect reserved UI regions. Semantic/procedural-memory nodes remain overlay-only and appear only with Filamentos enabled.

## Performance
Mobile defaults to Canvas/Pixi. Heavy renderers continue to fall back. Mobile preset reduces labels, visible nodes, glow, fog and automatic motion. When cockpit or settings covers most of the stage, animation work is throttled or paused.

## General UI/UX improvements
Reduce duplicate controls, pill density and simultaneous panels. Keep one visible primary action per context. Strengthen typography and information hierarchy. Make empty/loading/error states explicit. Preserve keyboard and reduced-motion support.

## Acceptance
No horizontal overflow at 375x812 or 393x852. No overlap between status, action bar, navigation, dock or cockpit. Filamentos is reachable on mobile. Search, select, open-subgraph, cockpit, back/home and renderer fallback work by touch. Desktop remains unchanged unless a simplification is explicitly shared.