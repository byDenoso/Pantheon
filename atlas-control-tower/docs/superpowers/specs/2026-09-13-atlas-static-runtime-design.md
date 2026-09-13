# NEXO Atlas Static Runtime Design

Date: 2026-09-13
Status: Approved design, pending implementation
Branch: `feat/atlas-static-runtime`

## 1. Goal

Remove Vercel, Neon, and any other third-party runtime dependency from the NEXO Atlas read path.

The target architecture is deliberately narrow:

- Google Drive owns mutable factual state.
- GitHub `main` owns code, schemas, contracts, workflows, and architecture.
- GitHub stores machine-generated, versioned, read-only projections of Drive state.
- GitHub Actions performs validation, normalization, projection, tests, and publication.
- GitHub Pages serves the frontend and the projected data together.
- The browser resolves Atlas API contracts locally from static artifacts.
- No browser credential or secret is exposed.
- No live database is required to render or navigate the product.

The system must remain usable when Vercel, Neon, or any optional external provider is unavailable.

## 2. Non-goals

This design does not:

- turn GitHub Pages into a traditional server-side API;
- let the browser write directly to Google Drive;
- expose OAuth tokens, service-account keys, GitHub tokens, or Drive credentials to the browser;
- invent a new canonical data owner;
- replace Google Drive as mutable-data authority;
- make generated GitHub snapshots authoritative truth;
- add Cloudflare, Firebase, Supabase, or another hosting provider;
- require a third-party database for read paths.

## 3. Authority model

Authority is explicit and split by responsibility.

### 3.1 Google Drive

Authority for mutable factual data:

- science campaigns;
- hypotheses;
- tests;
- runs;
- results;
- evidence;
- claims;
- Operations state;
- Learning state;
- Olympus state;
- source provenance owned by Drive documents/sheets.

Drive is the mutable SSOT.

### 3.2 GitHub main

Authority for:

- source code;
- schemas;
- projection contracts;
- architecture;
- validation rules;
- CI/CD workflows;
- runtime behavior;
- allowed projection versions.

### 3.3 Generated projection

Generated snapshots are projection-only.

They must always carry enough metadata to prove origin and freshness:

```json
{
  "source": "GOOGLE_DRIVE",
  "authority": "GITHUB",
  "projectionAuthority": "GOOGLE_DRIVE",
  "projectionOnly": true,
  "sourceVersion": "...",
  "fingerprint": "...",
  "generatedAt": "...",
  "freshness": "SNAPSHOT"
}
```

`authority: GITHUB` means the code/contract accepted the artifact. It does not mean GitHub owns the scientific facts.

### 3.4 GitHub Pages

Presentation only. Never authority.

### 3.5 Chat memory

Convenience context only. Never authority.

Cross-chat continuity must come from repository bootstrap/state documents, not from relying on conversational memory.

## 4. Target architecture

```text
GOOGLE DRIVE
  mutable SSOT
      |
      v
GITHUB ACTIONS
  detect changes
  read allowed Drive sources
  validate schemas
  normalize
  project
  fingerprint
  test
      |
      v
GITHUB
  code + contracts on main
  generated static projection artifacts
      |
      v
GITHUB PAGES
  frontend + static data artifacts
      |
      v
BROWSER
  StaticAtlasApi
  graph/entity/state/health/learning/audit/ops
```

There is no required Vercel hop and no required database hop.

## 5. Runtime model

The existing `AtlasApiClient` contract remains the frontend boundary.

The UI continues to call methods such as:

- `api.graph()`;
- `api.entity()`;
- `api.state()`;
- `api.health()`;
- `api.learning()`;
- `api.audit()`;
- `api.ops()`.

The implementation changes from remote HTTP API calls to a local static runtime backed by published JSON artifacts.

The frontend must not need to know whether the source was previously a serverless function.

## 6. Static projection layout

The published data must be shardable and bounded.

Recommended layout inside the Pages artifact:

```text
/data/current/manifest.json
/data/current/health.json
/data/current/state.json

/data/graph/root.json
/data/graph/science.json
/data/graph/engineering.json
/data/graph/olympus.json
/data/graph/operations.json

/data/science/index.json
/data/science/D1.json
/data/science/D2.json
/data/science/D3.json
/data/science/D4.json
/data/science/D5.json
/data/science/D6.json
/data/science/D7.json
/data/science/D8.json
/data/science/D9.json
/data/science/D10.json
/data/science/CROSS.json

/data/entities/index.json
/data/learning/current.json
/data/operations/current.json
/data/provenance/index.json
```

Existing science-drive projection files may be reused or copied into the build artifact rather than duplicated conceptually.

## 7. Manifest contract

`manifest.json` is the first artifact loaded by the browser.

Required fields:

```json
{
  "contract": "nexo-static-runtime-v1",
  "architectureVersion": "6.0",
  "source": "GOOGLE_DRIVE",
  "authority": "GITHUB",
  "projectionAuthority": "GOOGLE_DRIVE",
  "projectionOnly": true,
  "fingerprint": "sha256:...",
  "sourceVersion": "...",
  "generatedAt": "...",
  "freshness": "SNAPSHOT",
  "artifacts": {}
}
```

The manifest must be small enough to load immediately and must enumerate available shards and their hashes or fingerprints.

## 8. Local API resolution

Introduce a static runtime adapter, for example `StaticAtlasApi` or equivalent internal module.

Resolution rules:

### graph

- `system:NEXO` resolves root graph artifact.
- `system:SCIENCE` resolves science index/root artifact.
- `domain:Dn` resolves only the corresponding science shard.
- engineering/olympus/operations resolve their own bounded artifacts.
- test/result/entity focus resolves through the entity index and then the owning shard.

### entity

Use `entities/index.json` to locate the entity without loading the full corpus.

Example:

```json
{
  "T-ALENS-001": {
    "type": "TEST",
    "domain": "D7",
    "artifact": "science/D7.json"
  }
}
```

### state

Resolve `current/state.json`.

### health

Health is computed from the manifest and artifact integrity, not from a server heartbeat.

Expected healthy static state:

```json
{
  "ok": true,
  "runtime": "STATIC",
  "source": "GOOGLE_DRIVE",
  "authority": "GITHUB",
  "projectionAuthority": "GOOGLE_DRIVE",
  "freshness": "SNAPSHOT"
}
```

### learning / audit / ops

Resolve their dedicated artifacts. Do not route through a remote API.

## 9. Lazy loading

The frontend must never load the full corpus by default.

Required behavior:

- App bootstrap loads shell + manifest only.
- Science landing loads science index only.
- Opening D7 loads `D7.json` only.
- Opening a test in D7 reuses the loaded D7 shard.
- Cross-domain view loads only the CROSS shard and referenced domain metadata.
- Search loads the compact entity index, not every domain shard.

The design must remain usable on iPhone-class devices.

## 10. Browser caching and offline behavior

Use standard browser cache first. A service worker/PWA layer may be added after the static runtime is stable.

If PWA caching is added, cache:

- app shell;
- current manifest;
- most recently used shards;
- compact entity index.

When offline, the UI may serve the last valid snapshot with an explicit state such as:

`OFFLINE · SNAPSHOT`

It must never claim LIVE freshness.

## 11. Update pipeline

GitHub Actions becomes the read-path compute layer.

Required pipeline:

```text
Drive read
→ detect source version/change
→ validate input
→ normalize
→ build projection shards
→ build entity index
→ build manifest
→ calculate fingerprints
→ run unit/contract tests
→ run integrity checks
→ build Pages
→ browser acceptance
→ publish Pages
→ readback static artifacts
```

On Drive read failure:

- preserve last known-good projection;
- do not overwrite artifacts with empty output;
- mark freshness/staleness explicitly on the next successful metadata update if possible;
- fail the workflow rather than publish fabricated state.

## 12. Write path

Browser remains read-only.

Authorized writes may come from:

- GitHub Actions;
- ChatGPT connectors with explicit authorization;
- other approved agents/runners.

All writes must follow:

```text
write to Drive
→ readback from Drive
→ verify expected state
→ project new snapshot
→ commit/publish
```

No UI action may require a public write-capable server just to read state.

## 13. Cross-chat bootstrap

Add canonical repository documents so every future chat/agent can reconstruct the architecture without relying on memory.

Required documents:

- `NEXO_BOOTSTRAP.md`
- `NEXO_ARCHITECTURE.md`
- `NEXO_SYSTEM_STATE.json`
- `NEXO_AUTHORITY.json`

### NEXO_BOOTSTRAP.md

Short mandatory starting point for agents.

It must state:

1. read authority map;
2. read current system state;
3. inspect relevant projection contracts;
4. preserve Drive as mutable SSOT;
5. preserve GitHub as code/contract authority;
6. never reintroduce retired runtime dependencies without explicit architectural approval.

### NEXO_SYSTEM_STATE.json

Machine-readable current architecture and runtime state.

Example:

```json
{
  "architectureVersion": "6.0",
  "authority": {
    "mutableData": "GOOGLE_DRIVE",
    "codeAndContracts": "GITHUB_MAIN",
    "projection": "GITHUB_STATIC_ARTIFACTS"
  },
  "runtime": {
    "frontend": "GITHUB_PAGES",
    "readApi": "LOCAL_STATIC",
    "compute": "GITHUB_ACTIONS"
  },
  "retired": ["VERCEL_RUNTIME", "NEON_RUNTIME"],
  "currentFingerprint": null,
  "lastProjectionAt": null
}
```

This file is authoritative for architecture state, not for scientific facts.

## 14. Retired dependencies

The following must be removed from the required runtime path:

- Vercel serverless API;
- Neon/Data API;
- OIDC required only for those read paths;
- remote `/api` base injected into Pages builds;
- production readback that depends on Vercel availability.

Legacy code may remain temporarily only if:

- it is not imported by production bundles;
- it is not invoked by any active workflow;
- tests prove it is not part of the runtime path;
- a follow-up deletion issue is recorded.

Preferred end state is deletion, not dormant fallback.

## 15. CI contracts

Add tests that fail if any required runtime dependency is reintroduced.

Required assertions:

- Pages build does not inject `vercel.app` API base.
- Browser product does not require `/api` remote reads.
- No production static runtime module imports Neon readers.
- Science graph resolves D7 from static artifacts.
- `T-ALENS-001` resolves locally.
- `result:T-ALENS-001` exists with `PRODUCES` relation.
- `health` reports static snapshot semantics.
- browser acceptance passes with outbound requests to Vercel blocked.
- browser acceptance passes with outbound requests to Neon blocked.
- root graph, search, inspector, Universe Summary, Observatory, Lab, Operations, Learning, and Provenance remain renderable from static artifacts where their data exists.

## 16. Readback contracts

After Pages publish, verify directly from the public Pages origin:

- app shell renders;
- manifest returns valid JSON;
- fingerprint matches expected build artifact;
- science index loads;
- D7 shard loads;
- `T-ALENS-001` is present;
- its result node is present;
- no required network request targets Vercel or Neon;
- current architecture metadata reports `GITHUB_PAGES + LOCAL_STATIC`.

## 17. Migration sequence

### Phase 1: static runtime contract

- add manifest and entity index;
- add local static API adapter;
- wire rich science projection into local route resolution;
- add contract tests.

### Phase 2: Pages-only read path

- remove `VITE_NEXO_API_BASE_URL` from Pages workflow;
- make Pages use static runtime by default;
- add browser test with Vercel/Neon blocked;
- publish and read back.

### Phase 3: expand all product surfaces

Move remaining read surfaces to static artifacts:

- state;
- Observatory;
- Universe Summary;
- Laboratory;
- Operations;
- Learning;
- Provenance;
- Search.

### Phase 4: GitHub Actions projection pipeline

- formalize Drive read + projection workflow;
- incremental change detection;
- last-good preservation;
- fingerprinted publication;
- bounded shards.

### Phase 5: retirement cleanup

- delete unused Vercel read handlers;
- delete Neon/Data API readers;
- remove obsolete environment variables;
- remove serverless read tests;
- update docs and bootstrap state.

### Phase 6: optional offline cache

Only after the static runtime is stable:

- service worker;
- last-good local cache;
- explicit offline freshness state.

## 18. Failure semantics

The system must distinguish:

- `SNAPSHOT`: valid published static projection;
- `STALE`: valid last-known projection older than policy threshold;
- `OFFLINE`: browser cannot reach Pages origin but has cached data;
- `UNAVAILABLE`: requested artifact does not exist;
- `CORRUPT`: hash/contract validation failed.

`LIVE` is not used for static projection reads.

A missing artifact must never silently become an empty scientific conclusion.

## 19. Security

- no secrets in frontend bundles;
- no Drive tokens in browser;
- no GitHub write tokens in browser;
- all generated artifacts treated as public if repo/Pages is public;
- private or sensitive source fields must be sanitized before projection;
- provenance links must be explicitly allowlisted;
- writes remain authenticated outside the browser.

## 20. Success criteria

The migration is complete only when all are true:

1. GitHub Pages is the only required public frontend runtime.
2. The frontend can boot and navigate with Vercel unavailable.
3. The frontend can boot and navigate with Neon unavailable.
4. Science D7 exposes real tests and results from local static artifacts.
5. `T-ALENS-001` and its result resolve without remote API calls.
6. Main product read surfaces use static artifacts or explicitly declare unsupported state.
7. Drive remains mutable-data authority.
8. GitHub remains code/contract authority.
9. Generated snapshots remain projection-only.
10. Cross-chat bootstrap documents exist and describe the architecture unambiguously.
11. CI prevents accidental reintroduction of retired runtime dependencies.
12. Pages browser smoke and readback are green.

## 21. Architectural rule

The default question for any new dependency is:

> Can this capability be implemented with Drive + GitHub + browser-local computation without materially harming correctness, security, or usability?

If yes, do not add another runtime provider.

A new external runtime dependency requires explicit architectural approval and must document:

- why Drive/GitHub/browser cannot satisfy the requirement;
- failure behavior when the provider is unavailable;
- free-tier or cost limits;
- migration/exit path;
- whether the provider becomes a single point of failure.

This rule applies to future NEXO subsystems as well as Atlas.
