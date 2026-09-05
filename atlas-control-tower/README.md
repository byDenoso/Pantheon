# NEXO Atlas Control Tower V3

Extends the existing Vercel project `prj_DLQSz5OiIT1HxWMn2i4AgoIv5x8r` / `nexo-atlas-control-tower`.

## Design spec

The central explorer uses deterministic 3D coordinates, perspective projection, orbit, pan, zoom, hit testing and depth ordering. Canvas rendering has no external CDN or library dependency. It is not a WebGL/Three.js implementation. A flat view is available. Scientific data is read-only. Derived navigation and learning remain explicitly marked. Source-sheet row numbers survive blank and invalid rows.

The UI includes overview/explore/audit controls, bounded subgraph loading, node and edge inspection, source links, related files, neighbor/ancestor/descendant exploration, blocker dependencies, two-entity comparison, interactive domain/claim/activity charts, shared filters, search, and fourteen progressive WebMCP tools. Domain expansion prioritizes campaigns. The renderer does not interpret geometric distance as scientific evidence.

## Sources and scope

- PEER Sheet: `1Y9YYAn2x0NDIBTbl1bvkwBbSEGz6kHLxzAl90SQ0-GA`.
- Learning Sheet: `1to_VBC5edy3kHbkn4CDjG2r33tr0jdtky2Ie80afbEI`.
- Existing operational read model: `https://nexo-flight-recorder.vercel.app/api/flight`.
- Baseline frontend recovered from the existing production deployment. Original backend source was not located. The new backend reuses the existing operational endpoint rather than creating a new database identity.

Source capture contained 2,186 distinct test IDs, 84 navigation campaigns, 1,193 hypotheses, 31 decision claims, 1,606 result envelopes, 190 campaign-run IDs, and 28 learning relations. These are captured-source counts, not permanent assertions about the live system. Incomplete relationship references are reported, not fabricated. Runs and files are connected only when source references exist.

## Run and test

Node 24: `npm test` and `npm start`.

`build-snapshot.mjs` consumes directed connector exports in baseline/*.json and compresses the private fallback to lib/snapshot.mjs. Scientific data exports and the generated snapshot are deliberately not tracked in Git. They are rebuildable from their source. Without a snapshot the optional import boots a navigation skeleton. Supply the private snapshot to load science. No credentials belong in Git.

The browser test uses the runtime Playwright package and requires a Chromium installation. `test/render.cjs` uses the runtime native Canvas package to execute the actual 3D renderer independently of a browser.

## Implemented backend

GET /api/state, /api/graph, /api/entity?id=..., /api/entity?id=...&view=lineage, /api/entity?id=...&view=files, /api/automation-runs, /api/learning-relations, /api/ops. POST /api/sync refreshes available sources and preserves last valid data on failure. GET /api/state?refresh=1 provides the same read-model refresh for diagnostics. Source reads have deadlines; concurrent refreshes are coalesced per instance, with a 30s throttle. Google readers compare modified times before reading sheet ranges.

## Configuration still required / unverified

Google runtime authentication: either GOOGLE_SERVICE_ACCOUNT_JSON, or GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + GOOGLE_REFRESH_TOKEN, read-only scopes. Existing ChatGPT connector access does not provision the app. No Google secrets were retrieved or created.

Operational source uses the existing Flight Recorder endpoint. Runtime readback must prove that this remains accessible from the new deployment. It is an indirect Neon reader, not a newly configured direct database connection.

Cache is process memory plus the bundled last-valid fallback. A durable incremental cache and background sync every five minutes are NOT implemented. Vercel Hobby cron does not support that cadence. The browser refreshes on load, focus, button and every five minutes while visible; that does not guarantee unattended background refresh.

Desktop and mobile browser verification is covered by test/browser.cjs. Screenshots are generated locally and excluded from Git. Historical claim evolution and completion percentages are not fabricated from current rows. Critical-path view follows recorded dependencies, not an inferred scientific closure roadmap. It is not a duration-weighted schedule calculation.

Expanded private source data requires verified viewer access control before promotion to public production. Preview deployments inherit the existing project's protection; do not disable it. Production promotion must wait for source access, viewer protection, and browser verification. No new scheduler, database, canonical writer or autonomous agent was created.

## Implementation plan and release gates

1. Recovered baseline and adapters: implemented; tests executed.
2. Data APIs and 3D UI: implemented as candidate.
3. Preview runtime and source readback: inspect latest deployment receipt.
4. Configure Google read-only app access, verify viewer access control, choose existing-infrastructure durable cache strategy.
5. Complete full desktop/mobile browser checks, authenticated sync, failover and real-volume acceptance.
6. Promote to the existing production project only after gates pass.

Rollback production reference: `dpl_Bo7UyMcAqPLRZnHS7GAzKMvKe9tA` (observed 2026-09-05). Re-read current production before changing it, because other sessions may deploy concurrently.


## Visual finish (2026-09-05)

Retains the custom perspective renderer and all scientific API contracts. Expanded map, luminous focal sphere, orbital guides, depth shading, priority label placement avoiding nodes and other labels, immersion toggle (Escape to exit), opt-in automatic orbit with pause and hidden-tab suspension. No automatic camera motion on load. Flat view stops automatic orbit. UI remains dark and responsive. Source geometry is decorative navigation, never a scientific metric.

Recovered HTML/CSS shell and optional snapshot import from the supplied handoff. Preserved daily 08:00 UTC cron. Science freshness and durable cache remain backend work; the daily trigger cannot refresh science without a configured reader. No source registers or automations changed.

Browser test paths are relative to the current project. Use ATLAS_BASE_URL to test a deployed instance; optional ATLAS_CHROMIUM_MODULE points to a Chromium provider's ESM entry when using a serverless binary. The original production before this visual pass was dpl_EeojU1k1TiYUCGds3MBDPNAcfq3n.


## Observatório themes and maintenance

Current visual direction: blue cosmic Observatório, dark/light themes with saved preference. Read [docs/FRONTEND.md](docs/FRONTEND.md) before frontend changes. `ui/tokens.css` owns page palette; `ui/visual-config.mjs` owns Canvas palette and visual knobs. Root preview expands real bounded subsystem children. Use `frontend-files.mjs` and `node scripts/configure-static.mjs` for new public assets.
