# PERSONAL_LOOP_V1

## Runtime contract

`PERSONAL_LOOP_V1` closes the first private personal-assistant loop inside the existing NEXO ONE runtime.

```text
Provider
  -> Adapter
  -> Canonical personal entity/event
  -> Proposal
  -> L0-L5 policy
  -> Capability Fabric
  -> Provider mutation
  -> Provider readback
  -> EFFECT + EXECUTION_RUN receipt
  -> Task/Commitment follow-up
  -> NOW / DAY / LOOPS / RECALL
```

The existing NEXO Sheet remains the canonical personal operational store. The capability fabric remains the execution gate. Public SystemState and Atlas/research views keep their anonymous sanitized boundary.

## Private session

Set both server-only values:

- `NEXO_PASSWORD_HASH`: `scrypt$<salt>$<64-byte-derived-key-hex>`
- `NEXO_SESSION_SECRET`: at least 32 characters

`GET /api/session` reports session state. `POST /api/session` establishes an HttpOnly `SameSite=Strict` signed cookie. `DELETE /api/session` clears it. Login/logout are same-origin only.

Authenticated requests can read the private Gmail, Calendar, Drive and NEXO provider adapters. Anonymous provider reads remain public-safe.

## Personal API

### `GET /api/personal`

Requires a valid private NEXO session. Returns:

- provider health;
- canonical personal model;
- deterministic action proposals;
- open/closed follow-ups;
- semantic world fingerprint.

Current canonical entity kinds:

- `Person`
- `Message`
- `Event`
- `Document`
- `Task`
- `Commitment`
- `Decision`

The V1 proposal compiler emits evidence-backed calendar conflict review and tracking of explicit `NEEDS_ME` / `BLOCKED` Task or Commitment records. Gmail metadata alone does not create reply obligations.

### `POST /api/personal/action`

Requires private session plus same-origin request.

Supported V1 action kinds:

| Kind | Policy | Operation |
|---|---|---|
| `UPSERT_NEXO_TASK` | L3 / AUTO | `personal.task.upsert` |
| `UPSERT_NEXO_COMMITMENT` | L3 / AUTO | `personal.commitment.upsert` |
| `CREATE_GMAIL_DRAFT` | L4 / APPROVAL_REQUIRED | `gmail.draft.create` |
| `CREATE_CALENDAR_EVENT` | L4 / APPROVAL_REQUIRED | `calendar.event.create` |

`SEND_GMAIL`, Drive mutations and unregistered operations resolve to L5 / DENY in V1.

For L4, the first request can contain only the proposal. The server returns:

```json
{
  "status": "APPROVAL_REQUIRED",
  "policy_level": "L4",
  "proposal_fingerprint": "PAF-..."
}
```

The approved request must repeat the same proposal and include:

```json
{
  "approval": {
    "approved": true,
    "proposal_fingerprint": "PAF-..."
  }
}
```

Any content change produces a different server fingerprint and invalidates the approval.

## Google authorization

Preferred runtime uses Vercel Connect and requests operation-scoped Google tokens.

Read scopes:

- Drive read-only
- Gmail read-only
- Calendar read-only
- Sheets read-only

Mutation scopes are requested separately:

- Gmail draft: `gmail.compose`
- Calendar event: `calendar.events`
- canonical NEXO Sheet: `spreadsheets`

Legacy OAuth remains supported. Run `npm run google:auth` again after this release so the refresh token contains the V1 write scopes.

## Canonical NEXO Sheet

Configure:

- `NEXO_SHEET_ID`
- optional `NEXO_SHEET_RANGE` (default `NEXO!A1:H1000`)
- optional `NEXO_ACTION_REGISTER_ID`

Expected columns:

```text
record_type | record_id | status | title | detail | payload_json | source | updated_at
```

New V1 record types:

- `task`
- `commitment`
- `decision`
- `effect`
- `execution_run`

`task` and `commitment` rows are projected into `contextId=PERSONAL` and reuse the existing LoopStatus vocabulary. `effect` and `execution_run` stay internal to the NEXO context.

## Readback semantics

Provider mutation completion requires semantic provider readback.

Gmail drafts include deterministic NEXO headers and are fetched back as raw drafts. Calendar events use a deterministic provider event ID plus private `nexoEffectKey` metadata and are fetched back by ID. NEXO Task/Commitment writes are read back from the canonical Sheet.

An EFFECT reaches `DONE/PASS` only after readback returns `verified=true`. Provider HTTP success by itself does not complete the action.

## Retry and concurrency

The canonical Sheet ledger uses deterministic effect IDs, compare-before-write and immediate canonical readback. Duplicate canonical rows fail closed. Calendar event creation also uses a deterministic provider ID so retries converge on the same event.

Google Sheets does not expose a native compare-and-swap primitive. Multi-instance simultaneous reservation of the same brand-new effect therefore still relies on the existing action lease plus duplicate readback defense. A future distributed lock can strengthen Gmail-draft exactly-once behavior if write concurrency expands beyond the current single-user personal runtime.

## Acceptance checks

A release is acceptable when:

1. anonymous `/api/personal` returns `401`;
2. authenticated `/api/personal` reads private providers;
3. L3 canonical write produces a verified NEXO Sheet readback;
4. L4 request without approval returns a proposal fingerprint and performs no provider mutation;
5. stale L4 approval is rejected before provider mutation;
6. Gmail capability creates a draft and never calls send;
7. Calendar capability reads back the deterministic event;
8. repeated verified effect returns `NO_OP_ALREADY_APPLIED`;
9. Task/Commitment state appears in the existing LOOPS/DAY pipeline;
10. full NEXO ONE CI including desktop/mobile browser verification passes.
