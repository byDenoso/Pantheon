# Atlas: runtime SVG optimization — 04/10/2026

The historical 01/10 visual remains the baseline. Dener explicitly reconfirmed on this run that menus and evidence panels must also remain SVG. The whole Tower vector surface therefore mounts lazily by default; `/?svgMirror=0#/agora` is a native-only diagnostic, not the default presentation.

## Changes

- Cache viewport dimensions outside particle loops, batch label layout reads, and skip unchanged label writes.
- Patch moving labels instead of rebuilding the complete Tower surface. Label-owned clipping rectangles move with their labels; viewport clips remain fixed.
- Build the vector UI in detached groups before replacing its displayed children; reuse style/rectangle reads within each synchronous paint.
- During manual camera movement, adapt only ambient dust projection to a measured 25 ms budget, with a bounded stride. Published tests/events, picking buffers and physics buffers remain complete. Restore the original environmental stride when the camera settles or reduced motion is enabled.
- Use 4 Hz vector updates with a stationary camera and 30 Hz during camera movement. Physics keeps its existing integration and meaning.
- Preserve remote optimizations from 0091d3c: route lazy loading, public-read lifecycle safeguards, environmental point budget and bounded Pages verification.
- Isolate development dependency caches by port and deduplicate Three.js. Shared dependency junctions had loaded two Three.js identities during local verification; SVGRenderer rejected their cameras. Allow the explicit project/dependency roots so linked font files also load correctly.

## Equivalent comparison

Reference: origin/main 0091d3c, full SVG enabled with `svgMirror=1`. Candidate: this isolated worktree, also full SVG. Both use the same local public system/galaxy snapshots and the same development cache/font configuration. Edge headless, 1440 × 960, five-second warmup, three samples each of idle, orbit and scroll. Browser jobs run sequentially with a 180-second limit; errors, font failures and stopped scene rendering fail the harness.

Median measurements:

| Workload | RAF callback CPU before / after (ms per second) | RAF gap p95 before / after (ms) | Maximum gap before / after (median, ms) |
|---|---:|---:|---:|
| Idle panel | 514.43 / 232.62 | 104.8 / 6.6 | 121.5 / 48.6 |
| Orbit | 816.83 / 824.79 | 164.2 / 49.6 | 183.5 / 85.3 |
| Scroll | 491.68 / 383.27 | 127.4 / 55.7 | 140.9 / 111.6 |

Idle animation CPU fell 54.8%; orbit p95 gap fell 69.8%; scroll p95 gap fell 56.3%. Orbit CPU per second did not improve: more projection updates fit into the shorter gesture. The UI no longer fully repaints at every projected label update: idle samples went from six repaints to zero; orbit samples from 30–32 to 0–1.

These are synthetic scheduling measurements, not display FPS or a claim of 60 FPS. Scroll and orbit still have expensive frames. Ambient geometry contains random jitter, so this is an equivalent workload rather than a bitwise geometry comparison. Earlier intermediate runs with HMR or blocked linked fonts are excluded from this final comparison.

Evidence: `output/runtime-performance/fair-published-full-svg.json`, `fair-optimized-full-svg.json`, `output/runtime-fair-baseline.log`, `runtime-fair-optimized.log`. Local comparison worktree: `D:/CODEX/automation-workspace/20261004-atlas-runtime-baseline009`; its only runtime patch matches the candidate development server configuration.

## Validation

- Final `npm run check`: PASS, 710/710 tests, typecheck, style and production build (`output/runtime-final-check.log`).
- SVG interaction suite: PASS, eight gates including clipping, search/evidence, route transitions, live evolution, reduced-motion freeze, adaptive environmental detail and full-detail recovery (`output/runtime-interactions.log`).
- Responsive SVG matrix: PASS, 54 route/theme/desktop-tablet-mobile combinations; no visible canvas, foreignObject, horizontal overflow or unhandled errors (`output/runtime-matrix.log`, screenshots in `output/runtime-matrix/`).
- Current package browser suite: PASS, 14 desktop/mobile/theme and data-state scenarios (`output/runtime-package-browser.log`).
- Independent static review: no selection or scientific-state blocker; temporary LOD applies only to the environment. Manual gestures outside Explore were included after review. Existing illustrative flat-LCDM physics remains a TOY_MODEL; no scientific verdict derives from motion.

Preview: `http://127.0.0.1:4185/#/agora`. Deployment has not yet been executed for this candidate.
