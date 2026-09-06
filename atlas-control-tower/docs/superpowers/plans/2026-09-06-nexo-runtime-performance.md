# NEXO Runtime Performance Optimization Plan

**Goal:** Reduce Atlas/Neon/Vercel I/O and tool-call overhead while preserving science_v1/learning_v1 authority, provenance, Graph Contract V1, auditability and fallback safety.

**Baseline evidence (2026-09-06):**
- Browser/session currently fetches graph + state for each recorte and performs an immediate POST sync after the initial load; visibility and 5-minute timer can force more syncs.
- Production logs show repeated graph/graph/state/sync request groups and Vercel cache MISS.
- Direct Neon reader cold science load performs 7 full-table Data API reads; forced refresh also performs 6 learning reads.
- science_v1 seq scans: entities 109, revisions 61, entity_domains 46, relations 37.
- Large legacy storage remains in public.snapshots (~20 MB) and public.sync_changes (~9.1 MB); do not delete in this work.

## Task 1 — TDD guardrail / CI
1. Add branch-scoped Node 24 CI running `npm test` from atlas-control-tower.
2. Add failing regression tests for:
   - concurrent science loads coalesce to one set of source reads;
   - science graph loads do not eagerly read migration issues or full provenance;
   - entity inspection fetches targeted provenance;
   - selective field lists are used for science/learning reads;
   - science refresh does not force learning refresh;
   - graph payload can carry summary so GraphSession avoids a second state request.
3. Verify RED before production code.

## Task 2 — Neon V1 reader fast path
Files: `lib/neon-v1.mjs`, `test/neon-v1.test.mjs`.
- Add single-flight promises for science, learning and audit loads.
- Change whole-table `select=*` reads to only columns consumed by the projector.
- Split migration issues into lazy audit cache.
- Remove full provenance from graph bootstrap; fetch provenance only for requested entity.
- Keep 60s in-function graph TTL and truthful HIT/MISS metadata.
- `refresh()` forces science only; learning refresh remains independent.
- Preserve source IDs, authority and fallback semantics.

## Task 3 — One request per graph recorte
Files: `lib/neon-v1.mjs`, `api/atlas.js`, `lib/atlas-api.mjs`, `lib/graph-session.mjs`, related tests.
- Add `summary` as an optional additive field on graph responses.
- Preserve summary through client normalization.
- GraphSession uses graph.summary and calls `/state` only as compatibility fallback.
- State endpoint remains available for WebMCP/external consumers.

## Task 4 — Remove redundant sync behavior
Files: `app.mjs`, browser/session tests.
- Do not POST sync immediately after the already-current initial Neon graph load.
- Gate visibility/timer auto-sync behind one shared 5-minute elapsed-time guard.
- Manual Sync remains forceful and performs readback.
- No change to science authority or source selection.

## Task 5 — Safe Vercel cache headers
Files: `api/atlas.js`, tests.
- Browser Cache-Control remains no-store/private.
- Add Vercel CDN caching only to idempotent GET reads with a short TTL, never POST sync and never explicit refresh/probe requests.
- Use official Vercel CDN cache-control semantics; short TTL only so scientific freshness is not hidden.
- Add source/fingerprint headers for observability.

## Task 6 — NEXO runtime/skills/Drive fast-path reconciliation
- Do not create new skills/services/schedulers.
- Reuse existing Runtime + tool-call optimization v1 and current 3 canonical automations.
- Add only missing runtime rules: pointer/ID before broad search, metadata/fingerprint before content, batch independent reads, no repeated tool-schema discovery within a run, frozen Tower never full-scanned in normal operation.
- Update the living recovery/STATE map only if current text is stale; preserve history/provenance.

## Task 7 — Verification and benchmark
- Run full `npm test` fresh in CI; zero failures.
- Compare production/query behavior where deploy route is available.
- Neon read-only checks: table sizes, seq scans, EXPLAIN for representative access patterns; no index/schema migration unless benchmark proves a need.
- Confirm authority: science_v1 writer, learning_v1 writer, Tower frozen, cache derived, Atlas consumer.
- Do not delete `public.snapshots`/`sync_changes` in this work.
- Final report uses measured values only; unavailable values = NOT MEASURED.
