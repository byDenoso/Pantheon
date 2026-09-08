# Atlas Layout Integrity Audit Spec

## Goal
Repair the reference-one frontend after the visual rework introduced clipping, competing layout ownership, masked overflow, a hidden wallpaper, and brittle responsive behavior. Preserve the approved deep-navy galactic reference while making the real application structurally correct from 1280x720 through 1920x1080.

## Root causes observed
1. The entrypoint loads `styles.css`, `official-dashboard.css`, `premium-v2.css`, `control-tower.css`, `galactic-theme.css`, `observatory-v2.css`, and `reference-one.css`. Several redefine the same shell/map selectors. ID-based rules such as `[data-theme="dark"] #sidebar` can beat later class-scoped reference rules.
2. `body.reference-one{overflow-x:hidden}` masks structural overflow instead of eliminating it.
3. The reference topbar keeps seven grid columns and large minimum widths until `1250px`, which is too late for common 1366/1440 laptop widths.
4. The five-console deck stays in five columns until `1250px`, forcing unreadably narrow content.
5. The CSS wallpaper is behind the canvas while `Graph3D.draw()` fills the entire canvas with an opaque background, hiding the wallpaper.
6. `ui/theme.mjs` dynamically requests `ui/readability.css` even though that stylesheet is intentionally absent from the public manifest/build.
7. The visualization bar uses multiple intrinsic-width columns plus nowrap hints and an outward-growing compass, producing brittle width pressure.
8. The ambient graph renderer redraws continuously for small graphs while also painting gradients/stars every frame; the new CSS wallpaper duplicates some of that visual work.

## Visual constraints
- Keep the approved reference-one direction: deep navy, starfield, nebula, right galaxy, left asteroid field, planetary horizon, central NEXO system, orbital graph, reference topbar/sidebar, visualization strip, and five operational consoles.
- Decorative wallpaper must remain inside the map, behind the graph, `pointer-events:none`, and must never create layout overflow.
- Real Atlas data remains authoritative. Do not invent mock telemetry.
- Keep the current reference chrome because the latest approved reference explicitly requested all details from that image.

## Architecture
- `tokens.css`: tokens only.
- `styles.css`: base structure and generic components.
- `official-dashboard.css`: semantic dashboard components only; remove its obsolete cosmic shell override block.
- `premium-v2.css`: shared premium component treatment and non-reference workspaces.
- `reference-one.css`: the single owner of the current reference-one shell, map composition, wallpaper, visualization bar, and console layout.
- `galactic-theme.css`, `observatory-v2.css`, and `control-tower.css`: remove from the runtime stylesheet chain. Keep files only if another explicit dependency requires them; otherwise remove from public manifest/build.

## Responsive acceptance
Target viewports: 1920x1080, 1600x900, 1440x900, 1366x768, 1280x720.

- No global horizontal scrolling or clipping mask.
- Sidebar/main offset share one width token.
- Topbar compacts progressively before content collides.
- Hero/map controls stay within the map.
- Console deck: five columns only where readable; then 3/2, then 2/1 as width decreases.
- Text wraps or clamps inside cards; no long status or label expands the grid.
- Canvas is always 100% of its container and resizes from `clientWidth/clientHeight` with bounded DPR.

## Performance constraints
- Preserve reduced-motion behavior.
- Avoid adding decorative DOM beyond the four existing wallpaper elements.
- Remove redundant full-screen cosmic layers from obsolete stylesheets.
- Allow reference-one to use a transparent canvas background so the CSS wallpaper is visible.
- Cap ambient canvas painting to a reasonable frame cadence without changing interaction/transition correctness.

## Deployment constraints
- Work on isolated branch.
- TDD for regressions.
- `npm test` and GitHub Actions must be green.
- Deploy only to the existing Vercel project `nexo-atlas-control-tower` with Preview target.
- Do not promote production.
- Read back build status, delivered HTML/assets, API health where accessible, and runtime errors before closure.
