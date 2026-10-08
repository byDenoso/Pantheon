# Operational delivery and private observability

This change hardens an existing ingress and adds read-only private operations views. It does not implement or attest seven days of autonomy. It does not change scientific contracts, automations, the public site, runner workflows or the canonical Writer.

## Delivery

The existing authenticated `/api/inbox-drop` uses its existing configured Sheet spool. Scientific ingress independently retains its stricter canonical destination. Retrying the same stable ID and same payload reconciles the persisted body. A different body or conflicting multipart slot returns 409. Successful transport reports `DELIVERED`, `BODY_HASH` and `application_verification: NOT_CHECKED`; it does not report applied science. An ambiguous append failure instructs retry with the same identity and payload. A check-only request without the expected `body_sha256` is explicitly existence-only, not a verified body readback.

This deliberately tightens the old check-only response: consumers must distinguish `found` from verified identity. The current submit client falls through to an exact-body retry when its old preflight cannot verify a payload; gateway tests cover retry and changed-body rejection. Legacy CLI existence-only checks that infer ABSENT from non-PASS must migrate before operational rollout. Legacy GitHub-only ingress is not a fallback write path.

This is at-least-once delivery. Concurrent identical appends may leave duplicate rows; effect deduplication remains the canonical Writer's responsibility. No cross-process lock or exactly-once transport is claimed. Multipart rows are not deleted by mutable row numbers. Compaction is outside delivery and must preserve unresolved deliveries and receipts.

The existing gateway implementation is retained byte-for-byte as `inbox-gateway-core.mjs`; its robot OIDC, scientific ingress, adapters and legacy read-only lookup remain available. The facade changes only generic drop. Existing code does not gain credentials or permission to approve scientific gates.

## Private operations

`GET /api/atlas-operations-ui` renders a server-only operations page. `GET /api/atlas-operations?view=work|campaigns|receipts&limit=30&cursor=...` returns `NEXO_OPERATIONAL_FRONTIER_V1`. Both reuse the existing Atlas owner-session boundary before source/token/HTML access. There is no new machine grant, CORS allowance, storage or public projection.

The source is the existing verified canonical Drive reader. Work discovery reads canonical TEST and WORK collections rather than a clipped bootstrap. This view never authorizes dispatch. Original statuses, source paths and revision remain visible. Closed campaigns stay closed; technical missing inputs do not become invented human approvals. DONE alone does not attest independent scientific review. Receipt counts are latest historical receipts per operation, not an estimate of live pending work.

Responses are paginated and bounded; a cursor binds source revision and query scope. Source change between pages returns 409 instead of silently mixing generations. Backend reads still fetch the full bounded canonical body per request; this change reduces response size, not upstream source-read cost. Source outages return 503 without a public/cached fallback.

The private page offers work/campaign/receipt tabs, pagination, source identity, refresh and logout. It clears displayed private state on failures, expiry and pagehide. Logout failure does not claim server revocation. Dynamic values use textContent. It links back to the existing web; no replacement of the 3D experience or write controls is included. The existing handler stays byte-for-byte unchanged; the two new private routes enter through `api/index.js`. All other routes retain their original entrypoint and implementation.

## Verification and release

Focused regression command (Node built-ins only):

```sh
node --test test/inbox-reliable-drop.test.mjs test/operational-frontier.test.mjs test/operations-route.test.mjs
```

Run the full existing `npm run check` and private browser checks on the complete repository before release. A synthetic component render is not a live authentication, Drive, Writer or deployment test. Preserve the existing release/privacy prerequisites. After rollout verify anonymous denial before reads, authenticated reads, source revision, exact retry payload, Writer receipt plus entity readback, and unchanged public output. Do not use the rollout to restart active scientific jobs.

Rollback is a code revert with no data migration. Preserve all spool rows, Writer receipts, canonical entities and active run identities.
