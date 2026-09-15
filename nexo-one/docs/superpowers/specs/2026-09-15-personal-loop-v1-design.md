# PERSONAL_LOOP_V1 Design

## Goal

Close the first operational personal-assistant loop inside the existing NEXO ONE architecture:

`provider -> adapter -> canonical personal model -> proposal -> L0-L5 policy -> execution -> provider readback -> receipt -> follow-up -> NOW/DAY/LOOPS/RECALL`.

The implementation extends existing session, provider, World State and capability-fabric contracts. It does not create a parallel brain, policy system, or UI truth owner.

## Acceptance gates

1. **READ_LIVE**: an authenticated NEXO session can read configured private Gmail, Calendar, Drive and NEXO Sheet providers. Anonymous access remains public-safe.
2. **CANONICAL PERSONAL MODEL**: provider items normalize to personal entities/events with stable IDs, provider provenance and correlation IDs. Supported entity kinds are `Person`, `Message`, `Event`, `Document`, `Task`, `Commitment`, and `Decision`.
3. **ACTION PROPOSAL**: deterministic proposals are generated only from observable evidence. V1 covers calendar conflicts, explicit `NEEDS_ME`/`BLOCKED` personal records, and review of actionable provider items. It does not claim that an email needs a reply without evidence.
4. **ACTION POLICY**: existing L0-L5 semantics control execution. L0 observe, L1 infer, L2 propose, L3 reversible internal write, L4 approval-required external reversible write, L5 human-only/denied automation.
5. **WRITE**: V1 supports NEXO task/commitment upsert, Gmail draft creation, and Calendar event creation. Gmail send and Drive mutations remain L5 and unavailable in V1.
6. **READBACK**: provider mutation success requires observed provider state. The existing capability fabric remains the execution contract and records effect/run state in the canonical NEXO Sheet.
7. **FOLLOW_UP**: canonical tasks/commitments stay open across requests and are projected into LOOPS/DAY until source state or verified effect closes them.

## Security boundary

Private routes require a valid HttpOnly NEXO session. Session login/logout are same-origin only. Public `system` and public Atlas/science routes remain usable without a private session and never read private providers.

Google read tokens keep read-only scopes. Mutation code requests separate write scopes only for the requested operation. Legacy OAuth authorization is updated so a newly issued refresh token can support the V1 write surface. Existing credentials that do not contain write scopes fail closed with `AUTH_REQUIRED`.

## Canonical persistence

The existing `NEXO · SSOT CANONICAL` sheet remains the personal operational store using its existing schema:

`record_type | record_id | status | title | detail | payload_json | source | updated_at`

V1 adds records with `record_type` values `task`, `commitment`, `decision`, `effect`, and `execution_run`. Effect and run payloads contain the capability-fabric fields; personal records contain canonical payload and provenance. No secrets, email bodies, or arbitrary Drive document contents are persisted into the sheet.

## Components

### Session/private boundary

`server/handler.mjs` reconnects the already existing `server/auth/session.mjs` implementation. `/api/session` supports GET/POST/DELETE. Private reads derive `access=PRIVATE` only from a valid session.

### Personal loop compiler

`server/personal/loop.mjs` owns pure deterministic functions for canonicalization, proposal generation, L0-L5 classification, and follow-up reconciliation. It consumes World State items and never calls providers directly.

### Google mutations

`server/adapters/google.mjs` gains operation-scoped token retrieval plus Gmail draft and Calendar event execute/readback adapters. Provider readback verifies stable semantic fields, not HTTP status alone.

### NEXO Sheet execution store

`server/execution/nexo-sheet-store.mjs` implements the `effectLedger` and `executionRuns` methods required by `capability-fabric.mjs`, plus personal task/commitment upsert. It uses deterministic record IDs and compare-before-write behavior to make repeated requests safe.

### Personal service/routes

`server/personal/service.mjs` builds the private personal snapshot and executes only policy-eligible actions. L4 writes require an explicit approval payload bound to the proposal fingerprint. L5 operations are rejected.

Routes:

- `GET /api/personal` returns canonical entities/events/proposals/follow-ups.
- `POST /api/personal/action` executes an approved supported proposal through the capability fabric.

## Provider-specific V1 behavior

### Gmail

Creates drafts only. The draft contains `X-Nexo-Effect-Key` and a deterministic `Message-ID`. Readback fetches the created draft and verifies recipients, subject and effect marker. Sending is absent from the action registry.

### Calendar

Creates events only. A deterministic Google Calendar event ID is derived from the effect key so retries converge on one provider object. Readback fetches that event and verifies summary/start/end.

### NEXO tasks/commitments

Writes the canonical sheet record, reads it back, and verifies semantic payload/status. These are L3 when reversible and local to NEXO.

## Failure behavior

- Missing auth/scope: `AUTH_REQUIRED`.
- Unavailable provider/readback mismatch: execution fails and effect is never marked verified.
- Duplicate verified effect: `NO_OP_ALREADY_APPLIED`.
- Policy mismatch or stale proposal fingerprint: action rejected before provider mutation.
- Anonymous personal access: `401 AUTH_REQUIRED`.
- Public SystemState and science/Atlas projections keep their existing public boundary.

## Testing and release

TDD is required. First commit failing tests for private session restoration, canonical personal model, policy, follow-up, provider write/readback, and persistent execution store. CI must show RED for missing behavior. Production code follows in minimal increments until `npm run check` and browser verification pass in GitHub Actions. Merge only after branch CI is green. Final acceptance includes readback of repository state and, when deployment credentials are configured, live `/api/session`, `/api/health`, `/api/personal` behavior without exposing private data anonymously.
