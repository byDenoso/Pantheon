# NEXO ONE

Private control plane and public-safe projection surface in `Pantheon/nexo-one`. React 19, TypeScript, Vite, Node 24. No database, no new Truth Owner, no browser-side provider credentials.

## Scope

NEXO ONE compiles live/provider state, TruthGraph, the Universal Projection Bus, ACTION_REGISTER surfaces and the existing Atlas projection. Private mode also exposes a governed Action Broker. The browser never writes directly to Google, GitHub or Vercel.

The write path is:

`UI -> private session -> normalized intent -> authority gate -> capability PASS gate -> confirmation -> provider effect -> provider readback -> receipt -> Integrity when material`

A provider 2xx response is not success. Write actions reach `PASS` only after matching readback. `UNVERIFIED`, `PENDING_*`, `BLOCKED`, missing scopes, authority conflicts, ambiguous targets and missing confirmations fail closed before a provider effect whenever possible.

The existing four NEXO automations are unchanged: NEXO Daily v0.1, NEXO Core v0.1, NEXO Executor v0.1 and NEXO Reconciler v0.1.

## Run

```sh
cd nexo-one
npm ci
npm run check
npm run dev
```

Node 24 is required. Local dev binds to `127.0.0.1:4173`. `npm run preview` serves the production build. CI runs typecheck, unit/integration/security tests, desktop/mobile browser verification and immutable release packaging.

## Private configuration

See `.env.example` for names only. Configure secrets directly in the existing `nexo-one` Vercel project. Never put provider tokens in source, `VITE_*`, world-state payloads, receipts or browser storage.

Required for a usable private control plane:

1. `NEXO_SESSION_SECRET` and `NEXO_PASSWORD_HASH` for the single-user session.
2. Google authorization through the existing Vercel Connect path (`GOOGLE_CONNECTOR`) or the legacy server-side OAuth fallback. Read scopes remain least privilege; write scopes are requested only for the action being executed.
3. `NEXO_SHEET_ID=1e6s2dKOYVLNsPUguHI85RLVLwJKtlCsQZBJ1BE-UhaY` and the existing ACTION_REGISTER id for canonical NEXO/authority/capability reads.
4. `GITHUB_TOKEN` for GitHub writes, pinned by `GITHUB_REPOSITORY=byDenoso/Pantheon`.
5. `VERCEL_READ_TOKEN` and `VERCEL_WRITE_TOKEN` when Vercel read/write actions are enabled, pinned to team `team_TLkDXqQIHke6IumXh3qzMDcs` and existing project `prj_rFoAEgGt4gFNr8DHEOzxY7keS16W`.
6. Optional authorized Atlas graph endpoint. Atlas remains derived/non-authoritative and has no independent write route.

If a credential or scope is absent, health and action routes report the missing capability class without exposing a secret value. A missing credential is not silently converted into `PASS`.

## Read API

`GET /api/world` compiles public-safe or private provider state. `?stream=1` emits incremental NDJSON and `?refresh=1` bypasses the short cache. `GET /api/system` is private and compiles the full control-plane state.

Other projections include `/api/health`, `/api/now`, `/api/loops`, `/api/day`, `/api/context?id=...`, `/api/recall?q=...` and `/api/projections`. Public mode remains read-only and non-authoritative.

`GET/POST/DELETE /api/session` reads, creates and clears the signed HttpOnly session cookie. Logout clears provider and Action Broker runtime caches.

## Action Broker API

Action endpoints are same-origin and private-session only:

- `GET /api/actions-capabilities` returns current capability/authority summaries.
- `GET /api/actions-recent` returns bounded in-process execution receipts.
- `POST /api/actions-plan` validates a normalized intent and returns the required confirmation without dispatching an effect.
- `POST /api/actions-execute` re-gates against fresh authority/capability state, requires `CONFIRM` or `STRONG_CONFIRM` when policy demands it, dispatches one provider effect and immediately attempts readback.
- `POST /api/actions-readback` re-reads an acknowledged effect by receipt id.

All other non-GET API writes remain rejected.

Supported governed action types are currently Gmail draft/send, Calendar create/update/delete, Drive create/update, bounded NEXO Sheets update, GitHub issue/branch/commit/PR/merge operations implemented by the adapter, and Vercel deploy/promote operations pinned to the existing project. Availability still depends on an exact `PASS` row in the current CAPABILITY_MATRIX.

Idempotency is enforced by stable semantic key in a bounded 200-receipt/8-hour runtime ledger. That ledger is an execution cache, not canonical storage. Durable evidence remains the provider/canonical source and material Integrity records.

## Integrity semantics

Execution failures become Integrity records only when material, such as canonical write readback mismatch, production revision mismatch or a partially applied strong-confirm effect. Authentication, scope and ordinary transient provider failures stay in execution/provider health and do not spam Integrity.

Integrity persistence uses the existing 14-column `Integrity` sheet, dedupes by semantic fingerprint and performs a readback of the written row. It never changes AUTHORITY_MATRIX automatically.

## UI

The existing cockpit now exposes:

- Overview with provider/projection/capability degradation diagnostics and recent Action Broker receipts;
- Precisa de você with canonical human gates plus pending Action Broker confirmations;
- Actions with a private Action Broker drawer showing provider, operation, explicit target, payload, idempotency key and required confirmation;
- Execution with the canonical run trace plus the full broker lifecycle `PLANNED -> GATED -> CONFIRMED -> DISPATCHED -> PROVIDER_ACK -> READBACK -> FINAL`;
- TruthGraph, Capabilities, Sources, Integrity and Atlas as evidence/provenance surfaces;
- Now, Loops, Day, Context and Recall using private live data when authenticated and public-safe projections otherwise.

## Security boundaries

- Client input cannot declare authority.
- Canonical NEXO mutations must target the NEXO authority provider.
- GitHub targets are pinned to the configured repository.
- Vercel actions are pinned to the configured existing project/team.
- Atlas writes fail closed.
- Provider raw errors/tokens are not serialized to the UI.
- Same-origin checks apply to private action POSTs.
- Body size for action intents is bounded to 64 KiB.
- Public mode never invokes private action routes.

## Deployment and rollback

The production project is the existing `nexo-one` project (`prj_rFoAEgGt4gFNr8DHEOzxY7keS16W`). `scripts/package-release.mjs` packages the exact built assets and dependency-free server with a SHA-256 manifest. CI artifacts, not an unverified local rebuild, are the release input.

The intended release sequence is CI GREEN -> exact artifact preview -> asset/API readback -> exact release production promotion -> production readback. Missing production credentials remain an explicit configuration blocker rather than a reason to falsify provider liveness.
