# Prompt: retheme NEXO Atlas to "Cyberuniverse" (light + dark)

You are doing a **theme-only** pass on the NEXO Atlas frontend. Change colours,
nothing else. No layout, no behaviour, no new elements, no renderer geometry.

## Repo

- `byDenoso/Pantheon`, directory `atlas-control-tower/`
- Base branch: `atlas-observatorio-visual` (the latest frontend; it already has the
  Graph Contract V1 client, the datasource switch, the real Dados table, the
  Learning + Audit tabs, and the depth/curvature visual rework).
- Work on a derived branch, e.g. `atlas-theme-cyberuniverse`. Do not force-push a
  shared branch. Read `docs/FRONTEND.md` first.

## The only 4 files you may touch

| File | What it owns |
|---|---|
| `ui/tokens.css` | Every page colour, as CSS custom properties, per `[data-theme]`. |
| `ui/visual-config.mjs` | `MAP_THEMES.dark` / `MAP_THEMES.light` — the Canvas palette (18 keys each). Also `MAP_CONFIG` numeric knobs; leave those alone unless a colour change needs a matching alpha. |
| `styles.css` | Only if a rule hardcodes a colour that should be a token. Prefer moving it into a token over editing the rule. Do **not** restructure. |
| `index.html` | Only the one-line inline `<script>` that sets `data-theme` before paint, and the `<meta name="theme-color">` value — see "theme-color" below. |
| `ui/theme.mjs` | Only the two `theme-color` hex values inside `apply()`. Nothing else. |

Everything else is off limits: `app.mjs`, `graph3d.mjs` geometry, `lib/*`,
`ui/*.mjs` except `theme.mjs`/`visual-config.mjs`, `webmcp/`, all of `test/`.

## Hard constraints — do not break these

1. **Two themes only**, toggled by `document.documentElement.dataset.theme`
   (`"dark"` | `"light"`), persisted in `localStorage["atlas.theme"]`. `dark` is
   the default. The toggle button is `#theme-toggle`; `ui/theme.mjs` already wires
   it. Do not add a third theme or an "auto" mode.
2. **`ui/tokens.css` structure stays**: `:root,[data-theme="dark"]{…}` then
   `[data-theme="light"]{…}`. Keep `color-scheme:dark` / `color-scheme:light`.
3. **Keep every token name.** Components reference them by name across `styles.css`
   (49× `--muted`, 37× `--line`, 17× `--accent`, …). Current names, both themes:
   `--bg --surface --raised --glass --line --text --muted --accent --soft
   --shadow --warning --map-background --chart`. You may **add** tokens; you may
   not rename or remove one.
4. **`--map-background` must equal `MAP_THEMES[theme].background`** in each theme.
   The canvas and the CSS behind it have to be the same colour or you get a seam.
5. **Status colours are not theme colours.** `graph3d.mjs` exports
   `colors = {supported, partial, negative, blocked, active, legacy, unknown}` and
   the charts/chips reuse them. **Do not touch that object.** They must stay
   legible on both new backgrounds — if your dark or light surface kills the
   contrast of e.g. `unknown:#a2b3ce`, tune the *surface*, not the status colour.
6. **`MAP_THEMES` keeps all 18 keys per theme**, same names:
   `background haze stars guide node core edge derived text muted label border
   highlight sphereMid sphereShadow rim badge badgeText`.
   - `label`, `glass`, `badge` are drawn over the map and **must carry an alpha
     suffix** (`…ee`, `…f2`, `…ed`) so the map shows through slightly. Keep that.
   - `haze` is a very low-alpha tint (`…18` / `…24`). Keep it subtle; it is
     atmosphere, not a glow.
   - `mixHex()` blends `node`/`edge`/`sphere*`/`rim` toward `background` for depth
     fog. Your `background` and your `node` must be far enough apart in luminance
     that a fully-fogged node is still faintly visible (roughly ΔL* ≥ 25).
7. **Contrast**: body text (`--text` on `--surface`, `text` on `background`) ≥ 7:1.
   Muted text (`--muted`, `muted`) ≥ 4.5:1. Focus ring is `--accent` — keep it ≥
   3:1 against `--surface` in both themes. Run an actual contrast check, don't eyeball.
8. **No neon dependence.** "Cyberuniverse" can lean saturated/electric on the dark
   theme, but the interface must still be readable for a long session — accent and
   line stay restrained, saturation lives in `accent`, `stars`, `guide`, `core`,
   `rim`, not in every surface. The light theme is a *bright* cyber look (near-white
   ground, electric accent), not a tinted-grey inversion of the dark one — design
   it independently.
9. **`theme-color`**: two places must agree with the new backgrounds —
   `index.html` `<meta name="theme-color" content="…">` (the pre-paint default,
   set it to the dark bg) and the two hexes in `ui/theme.mjs` `apply()`
   (`theme==='light' ? '<light bg>' : '<dark bg>'`).
10. Respect `@media(prefers-reduced-motion:reduce)` — it already kills
    transitions; don't add motion.

## Cyberuniverse direction (interpret, don't copy literally)

- **Dark**: deep space-black to indigo ground, an electric primary (cyan / azure /
  violet — pick one and commit), thin luminous lines, starfield that reads as
  data points not glitter. Surfaces are near-black with a faint cool tint, not
  slate-blue. Think "holographic HUD over the void", low chrome, high signal.
- **Light**: crisp near-white / very pale cyan ground, the same electric primary
  darkened for contrast, hairline cool-grey borders, soft shadow. Clean lab
  console, not a washed-out dark theme.
- The 3D map is the hero in both. Keep the atmospheric depth and the vignette
  working — they need a `background` that the fog can pull toward.
- `core` (focal node) and `rim` (sphere edge light) are where the "universe"
  glow lives. `guide` (orbital rings) should be barely-there structure.

## Deliverable

1. New `ui/tokens.css` (both `[data-theme]` blocks, every existing token present,
   contrast-checked).
2. New `MAP_THEMES.dark` and `MAP_THEMES.light` in `ui/visual-config.mjs` (18 keys
   each, alphas preserved on `label`/`glass`/`badge`/`haze`).
3. Updated `theme-color` in `index.html` and `ui/theme.mjs`.
4. Any hardcoded colour you found in `styles.css` moved to a token (list them).

## Verify before you call it done — do not report PASS without running these

```
npm test                 # 74 tests, must stay 74/74 (they don't assert colours,
                          # but a syntax slip in visual-config breaks graph3d)
node test/render.cjs      # native canvas renderer; must print "Selection and orbit PASS"
node test/browser.cjs     # desktop 1440 + mobile 375, BOTH themes, theme persists
                          # across reload; must end "PASS …"; needs Chromium via
                          # CODEX_PRIMARY_RUNTIME_NODE_MODULES and a dev server on :3000
```

Then eyeball `preview-*.png` (generated by `test/browser.cjs`, git-ignored) in
both themes: map, Dados table, Learning ladder, Audit panel, inspector, mobile.
Check the toggle both directions and after a reload.

## Report back

- branch + commit SHA
- files changed
- the two token blocks and the two `MAP_THEMES` entries, verbatim
- contrast numbers for `--text`/`--muted`/`--accent` on `--surface`, both themes
- test results (npm test / render.cjs / browser.cjs), actually run
- screenshots reviewed
- if you deployed a preview: deployment ID + URL; do NOT promote to production and
  do NOT overwrite another agent's production deploy. If you did not deploy, say so.

## Do not

- rename/remove a token or a `MAP_THEMES` key
- touch `graph3d.mjs` `colors` (status palette) or any renderer geometry
- edit `app.mjs`, `lib/*`, `webmcp/`, tests, `frontend-files.mjs`
- add a build step, a dependency, or a CDN font
- introduce a third theme or auto-switching
- change `MAP_CONFIG` numbers (fog/vignette/edgeCurve/etc.) unless a colour needs
  a matching alpha, and then say why
