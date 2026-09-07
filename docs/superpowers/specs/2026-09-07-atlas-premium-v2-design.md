# NEXO Atlas Premium V2 Design

## Goal
Transform the NEXO Atlas official frontend into a premium product that combines a cinematic cosmic 3D canvas with restrained scientific-luxury controls, while fixing the workspace navigation regressions and preserving the current Neon-backed read-only data contract.

## Product direction
The map is the cinematic stage: near-black space, controlled nebula gradients, crisp neon planets, depth, orbital motion, and high-impact focus states. Navigation, tables, inspectors, Learning, Black Box, and Audit use a quieter laboratory language: dense but readable typography, charcoal/glass surfaces, disciplined spacing, semantic color, and very limited decorative glow.

## Functional requirements
1. Workspace tabs (Mapa, Dados, Learning, Auditoria) behave as real view switches. Selecting a tab must immediately reveal that workspace near the top of the main column, hide irrelevant heavy sections, update aria-selected, and never require the user to scroll past the map to discover the change.
2. Mapa remains the default workspace and preserves the interactive graph, Radar vivo, node inspector, filters, navigation, and Black Box focus behavior.
3. Dados renders the current Graph Contract recorte as a sortable table with the same data already loaded by the map.
4. Learning loads learning_v1 and shows the observation→pattern→lesson→strategy→policy ladder with lineage and emergent buckets.
5. Auditoria loads migration health and shows categories, counts, severity, source, and resolved/open state.
6. Black Box remains a separate system focus backed by nexo_ops and shows actions, runs, runtime events, lineage and integrity.
7. No scientific truth, authority, claims, source data or Neon schema is mutated by this UI work.
8. Manual sync remains uncached; automatic sync stays at the existing 12-hour cadence.

## Interaction model
- Desktop top-level workspace navigation uses accessible tabs with role=tablist / role=tab / aria-selected / aria-controls.
- setMode becomes a single workspace controller that toggles body[data-mode], panel visibility and focus target consistently.
- Switching workspace closes transient inspector state when it obstructs the requested view, but does not destroy graph/session state.
- Switching to Dados, Learning or Auditoria scrolls the selected workspace panel into the visible main area with reduced-motion support.
- Mobile uses the same information architecture, with compact sticky controls and full-width workspace panels.

## Visual system
### Dark
- Background: #02050a family, not navy-grey.
- Surfaces: #07101b to #0b1724.
- Text: near-white primary, blue-grey secondary with WCAG-oriented contrast.
- Accent: cyan for navigation/selection, violet for Learning, magenta for Black Box, emerald for healthy/pass, amber for attention, red for blocked/error.
- Borders are sparse and low-luminance. Glow is reserved for graph selection, active tabs and status pulses.

### Light
- Neutral cool-white canvas and stronger node saturation.
- Darker text, stronger borders and shadows than the current washed-out treatment.
- System colors remain distinct without relying on glow.

## Motion
- 120-180ms UI transitions; 220-280ms panel entrances and node expansion.
- cubic-bezier(.2,.8,.2,1) for tactile controls.
- No transform animations on large layout containers that cause reflow or blur text.
- prefers-reduced-motion disables non-essential motion.
- Graph node transitions remain fluid and quick, with focus rings and restrained pulse.

## Implementation boundaries
- Add `ui/premium-v2.css` as the final presentation layer and stop loading the older overlapping readability/motion layers.
- Add `ui/workspace.mjs` for workspace state mapping and DOM application.
- Keep data access in `lib/atlas-api.mjs`, session state in `lib/graph-session.mjs`, renderer in `graph3d.mjs`, and view modules in `ui/*`.
- Do not add framework dependencies.

## Validation
- Add unit coverage for workspace mode mapping.
- Extend browser regression coverage so each tab proves visibility of its workspace and hiding of the map where appropriate.
- Verify no horizontal overflow at 375px.
- Verify dark and light theme switching.
- Verify health, graph, learning, audit and ops endpoints on preview and production.
- Verify no runtime errors in Vercel logs after promotion.
