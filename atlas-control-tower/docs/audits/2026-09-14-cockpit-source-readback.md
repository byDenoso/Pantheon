# Cockpit: independent source readback

Run: 2026-09-14, 04:30 America/Sao_Paulo. Scope: one bounded operational cockpit improvement.
Starting branch: `rework/first-cut`, starting commit `a5e72b4`; working tree clean.
Remote `main` verified with `git ls-remote`: `82593b60468eb57e6c510a8024af03d3f1acad25`.
No AGENTS.md found in the checkout; supplied task instructions applied. README, frontend documents,
September 14 UX audit, API implementations, static reader and deployment workflows inspected.
Historical frontend documents disagree with the present React runtime; code and live readback governed this change.

## Changes

- Typed public-source loader for health, operations, automation runs and audit. Missing/invalid/error payloads stay unavailable instead of becoming successful empty collections.
- Merge run projections after independent requests settle, eliminating response-order data loss; deduplicate by canonical ID. Only declared active statuses count as active work.
- Display per-source availability and published freshness, allow a read-only retry with client-cache invalidation, and preserve unknown counts as an em dash.
- Normalize top-level snapshot and nested live health metadata. Version `main` is a revision, not a timestamp or sync receipt. Preserve published source links and fingerprint.
- Remove the hardcoded Learner campaign reference from the cockpit. Keep scheduler availability separate from the relationship overlay.
- Distinguish bounded list length from source collection count. Wrap health reasons and improve the mobile source-read layout using existing tokens.

## Validation

- `npm.cmd test`: 669 passed, 0 failed; includes failed, malformed, empty and partial sources, run response ordering/deduplication, missing fingerprint and timestamp, fallback and explicit negative health signals.
- `npm.cmd run typecheck`: passed.
- `npm.cmd run build`: passed. Existing warnings remain: browser externalization of node:crypto from lib/auth.mjs; optional 3D bundles above 500 kB.
- `git diff --check`: passed.
- Live HTTP adapter readback on the canonical alias: health/ops/automation-runs/audit all READY, 2 published actions, 0 runs, 7 audit issues. These are observed read-model counts, not global scientific conclusions.
- Live health contract: github-canonical-live-v1; source github, freshness LIVE, revision main, fingerprint sha256:535dab97986ea590d9d520eba4d7057a3f2c200e957ac60c5041c44c47edba12. No update timestamp or sync receipt in this response.
- Browser: correct checkout served on 127.0.0.1:4173; production build preview on 127.0.0.1:4175. An already-open 4412 instance was inspected initially but not used as proof for this checkout.
- Browser fault injection blocked only operations/current.json: operations/runs showed unavailable and em-dash counts; health/audit remained visible. Clearing the block and pressing Atualizar leitura recovered the data. No network block left enabled.
- Responsive cockpit checked at 390x844 in Claro and Alto contraste; desktop checked at 1440x1000. No horizontal document overflow in these checks. Themes Clássico and Deep Space also inspected.
- Main routes loaded: cockpit, map, Observatório, Resumo do Universo; Laboratório correctly displayed the existing access-setup boundary. D1 through D10 rendered; Science, Engineering, Olympus and Operations systems rendered. Selected the D10 campaign and entered /mapa/system%3ASCIENCE/domain%3AD10/CAMP-LRD-AGN.
- Canvas orbit drag, Shift+arrow pan and wheel zoom produced visible movement. This is not a complete mouse/touch gesture certification.

## Release gates and next pass

- Graph visual acceptance FAILS: labels overlap labels/nodes in the Science system view at 1440x1000 and more severely at 390x844. The narrow build-preview canvas remained inside the viewport (388 px width; no document overflow), but label legibility failed. The graph renderer was not changed in this bounded cockpit pass. Fix label collision/LOD next; do not claim the whole premium experience is ready.
- Remaining domain branches outside D1-D10 and all pinch/Shift-drag combinations were not exhaustively browser-tested.
- Public health API allows the GitHub Pages origin; localhost is not an allowed cross-origin caller. Same-origin production remains the configured path; live adapter readback was via Node HTTP, local browser used explicitly marked static artifacts.
- /api/private/cockpit on the current public alias returned HTTP 200 text/html (SPA), not the private JSON facade in this branch. Do not claim deployed private authentication is validated.
- Canonical Vercel project confirmed by connector: prj_DLQSz5OiIT1HxWMn2i4AgoIv5x8r, team_TLkDXqQIHke6IumXh3qzMDcs, nexo-atlas-control-tower.vercel.app. Connector project read succeeded; local CLI `vercel whoami` reported Logged out, no local VERCEL_TOKEN configured. No secrets were read.
- No push, merge, upload or deployment was performed. Existing published URL is not this build. Local build/commit are separate from production publication.
