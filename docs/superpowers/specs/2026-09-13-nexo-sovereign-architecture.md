# NEXO Sovereign Architecture v1

Date: 2026-09-13
Status: Approved

## Goal

Reduce the NEXO required runtime to two structural providers: Google Drive and GitHub. Google Drive owns mutable factual state. GitHub owns code, schemas, contracts, architecture, projection logic, validation, compute through Actions, generated read-only snapshots, and public distribution through Pages.

Vercel, Neon, serverless databases, and equivalent external runtimes are retired from required read paths. Optional integrations may exist, but their outage must not degrade the Sovereign Core.

## Authority

- `GOOGLE_DRIVE`: mutable factual SSOT.
- `GITHUB_MAIN`: code, contracts, schemas, architecture, workflows, validation and projection rules.
- `GITHUB_NEXO_STATE`: generated projection only, never factual authority.
- `GITHUB_PAGES`: presentation/distribution only.
- `CHAT_MEMORY`: convenience context only, never authority.

## Core dependency classes

### CORE
- Google Drive
- GitHub

### OPTIONAL
- Gmail
- Calendar
- ChatGPT/connectors
- Spotify and future user integrations

### RETIRED FROM REQUIRED RUNTIME
- Vercel
- Neon
- serverless read databases introduced only to serve projections

An OPTIONAL provider failure must not make Core health DEGRADED.

## Target flow

```text
GOOGLE DRIVE
  mutable SSOT
      |
      v
GITHUB ACTIONS
  read -> validate -> normalize -> sanitize -> project
  fingerprint -> integrity tests -> publish
      |
      +--------------------+
      v                    v
GITHUB MAIN           GITHUB NEXO-STATE
code/contracts         generated snapshots
      \                    /
       \                  /
        v                v
          GITHUB PAGES
       frontend + static data
                |
                v
              BROWSER
          local static API
```

## Static runtime

Frontend contracts stay stable (`graph`, `entity`, `state`, `health`, `learning`, `audit`, `ops`, search/research surfaces), but required reads resolve locally from published static artifacts. The browser must not require a remote `/api` server.

All paths must be relative so the build works on GitHub Pages, localhost, or another static host without source changes.

## Snapshot model

Generated state must be immutable by fingerprint and atomically published. Recommended shape:

```text
snapshots/<fingerprint>/
  manifest.json
  state.json
  health.json
  graph/root.json
  graph/science.json
  science/index.json
  science/D1.json ... D10.json
  science/CROSS.json
  entities/index.json
  search/index.json
  universe/summary.json
  observatory/current.json
  operations/current.json
  learning/current.json
  provenance/index.json
  changes/current.json
current/manifest.json
```

`current` moves only after every expected artifact validates. A failed projection preserves the last-known-good snapshot.

## Artifact contract

Every generated artifact must expose or inherit:

- `contractVersion`
- `schemaVersion`
- `projectionVersion`
- `fingerprint`
- `sourceVersion`
- `generatedAt`
- `source`
- `projectionAuthority`
- `projectionOnly`
- completeness metadata where bounded/partial

Static projection reads use `SNAPSHOT`, `STALE`, `OFFLINE`, `UNAVAILABLE`, or `CORRUPT`. `LIVE` is not used for static projected state.

## Scientific spine

The target scientific model is:

`DOMAIN -> CAMPAIGN -> HYPOTHESIS -> TEST -> RUN -> RESULT -> EVIDENCE -> CLAIM`

Stable IDs are mandatory join keys. Labels and row positions are never foreign keys.

## Privacy

Public projections are allowlist-based. Sensitive/private Drive fields never flow to public Pages unless explicitly approved. Olympus/private personal data requires a private projection boundary and must not leak into the public repository or site.

## Write path

The browser stays read-only. Authorized agents/runners write using:

`intent -> validate -> Drive write -> Drive readback -> verify -> project -> publish -> Pages readback`

Writes use stable `effect_key`, idempotency and expected-version checks where concurrent automation is possible.

## Health

Health separates `CORE`, `OPTIONAL`, and `USER_CONNECTED` providers. Only Core failure degrades Core health. Static health validates manifest integrity, schema compatibility, expected artifacts, snapshot age, completeness and last successful projection/readback.

## Failure behavior

- Drive unavailable: keep last-known-good snapshot.
- Actions failure: keep published Pages and current snapshot unchanged.
- Optional integration unavailable: mark that integration unavailable without degrading Core.
- Missing/corrupt artifact: fail explicitly; never reinterpret absence as an empty scientific conclusion.

## Cross-chat continuity

Repository bootstrap documents are authoritative for architecture continuity:

- `NEXO_BOOTSTRAP.md`
- `NEXO_ARCHITECTURE.md`
- `NEXO_SYSTEM_STATE.json`
- `NEXO_AUTHORITY.json`

Any agent working on NEXO should read them before architecture-sensitive changes.

## Constitutional CI gates

CI must fail if required runtime paths reintroduce retired providers. At minimum:

- Pages build must not inject `vercel.app` or Neon API bases.
- Browser read-only flows must work with Vercel/Neon network requests blocked.
- Static runtime modules must not import retired database readers.
- D7, `T-ALENS-001`, and `result:T-ALENS-001` must resolve without a remote API.
- `PRODUCES` relation must be preserved.
- local static build must reproduce the public read-only product without provider credentials.

## Migration sequence

1. Constitutional documents + Atlas static runtime reference implementation.
2. Pages-only read path with remote runtime blocked in browser acceptance.
3. Atomic `nexo-state` publication and manifest/index contracts.
4. Move Universe, Observatory, Lab, Operations, Learning, Provenance and Search to generated static artifacts.
5. Migrate NEXO ONE read surfaces and provider health model.
6. Retire Vercel/Neon workflows, handlers, OIDC, environment variables and dead server code.
7. Optional offline/PWA after deterministic static runtime is stable.

## New dependency rule

A new required external runtime dependency needs explicit architecture approval documenting why Drive/GitHub/browser cannot satisfy the requirement, free/cost limits, failure behavior, SPOF impact, and exit strategy.

## Definition of done

The Sovereign Core is complete when read-only NEXO remains functional with Vercel and Neon blocked, GitHub Pages is the required public runtime, Drive remains mutable-data SSOT, GitHub remains code/contract authority, generated state remains projection-only, CI enforces those boundaries, and cross-chat bootstrap documents accurately describe current architecture.