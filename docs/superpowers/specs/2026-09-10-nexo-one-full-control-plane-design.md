# NEXO ONE Full Control Plane — Design

Date: 2026-09-10
Status: Proposed for implementation after user review
Scope: Existing `byDenoso/Pantheon` repository, `nexo-one/`, Atlas, existing NEXO SSoT, ACTION_REGISTER/AUTHORITY_MATRIX/CAPABILITY_MATRIX, existing Vercel projects and existing four NEXO automations.

## 1. Objective

Turn NEXO ONE from a partially public projection/dashboard into the private operational control plane for the existing NEXO ecosystem.

The finished system must:

- read live state from the existing canonical and provider sources;
- preserve Truth Owner semantics and TruthGraph authority rules;
- support governed write actions through the same application;
- require explicit confirmation for external or destructive effects;
- fail closed when a capability is not proven;
- record execution receipts and verify effects by provider readback before declaring success;
- surface provider health, capability state, authority conflicts, projection drift and action outcomes in the current NEXO ONE UI;
- keep the public projection mode safe and non-authoritative;
- deploy into the existing Vercel projects only.

## 2. Hard constraints

The implementation must not create:

- a new database;
- a new repository;
- a new automation;
- a new Truth Owner;
- a competing SSoT;
- a client-side secret store.

The existing four automations remain unchanged in identity and responsibility:

- NEXO Daily v0.1
- NEXO Core v0.1
- NEXO Executor v0.1
- NEXO Reconciler v0.1

The existing canonical authority model remains decisive. Provider/runtime evidence can prove effects and liveness but cannot silently replace a Truth Owner.

## 3. Architectural choice

Use the existing NEXO ONE backend as the control plane. Do not add a separate integration service.

The control plane has five layers:

1. **Private session boundary** — authenticates the single-user NEXO ONE session.
2. **Provider adapters** — normalize reads and writes for Google, GitHub, Vercel, NEXO SSoT and Atlas.
3. **Authority + capability gate** — resolves Truth Owner, provider, capability state and risk before execution.
4. **Action Broker** — converts an approved intent into one provider effect, with idempotency and confirmation policy.
5. **Receipt + readback compiler** — re-reads the provider, verifies the effect and projects the result into Execution, Integrity, TruthGraph and Overview.

No UI surface talks directly to external providers. Browser traffic terminates at NEXO ONE server routes.

## 4. Request and effect flow

Canonical flow:

`UI -> private session -> action intent -> authority resolution -> capability gate -> confirmation policy -> provider action -> provider readback -> execution receipt -> SSoT/Integrity projection -> world recompilation -> UI`

A successful transport response is not sufficient to mark an action successful. `PASS` requires effect readback from the provider or canonical source.

If an action cannot be read back, it remains `DEGRADED`, `PENDING_READBACK` or `FAILED`, depending on the observed failure mode.

## 5. Authentication and secret handling

### 5.1 NEXO private session

Use the existing `NEXO_PASSWORD_HASH` + `NEXO_SESSION_SECRET` session implementation.

Requirements:

- password verification remains server-side;
- session cookie remains `HttpOnly`, `Secure`, `SameSite=Strict` in production;
- login remains rate limited;
- provider caches are cleared on logout;
- all private routes require the authenticated session unless explicitly designed for service-to-service OIDC.

### 5.2 Vercel OIDC / service identity

Use the existing Vercel OIDC verifier for trusted service-to-service projection access between the existing Atlas and NEXO ONE projects.

Trust remains pinned to known owner/project/environment claims. No wildcard trust and no static public bearer token.

### 5.3 Google authorization

Prefer the existing Vercel Connect/OIDC path over long-lived refresh tokens.

Read scopes remain least-privilege:

- Drive read
- Gmail read
- Calendar read
- Sheets read

Write scopes are requested only for implemented write capabilities and remain server-side:

- Sheets write for NEXO canonical mutations approved by authority rules;
- Calendar event write for approved scheduling actions;
- Gmail send for approved outgoing mail actions;
- Drive file write limited to files created or explicitly selected for mutation where the provider supports a narrower scope.

If the connection cannot provide the required write scope, the capability remains `BLOCKED` or `UNVERIFIED`; the UI must not offer a functional write control.

### 5.4 GitHub and Vercel credentials

GitHub and Vercel access stays server-side. Tokens or OIDC identities must be scoped to the minimum operations required by the capability matrix.

No token is exposed through `VITE_*`, serialized into world-state JSON, logged, or stored in the public projection snapshot.

## 6. Provider model

Each provider exposes a normalized interface with explicit read and action capabilities.

Conceptual interface:

```text
snapshot(options) -> ProviderSnapshot
search(query, options) -> ProviderSnapshot
health(options) -> ProviderHealth
execute(action, options) -> ProviderEffectReceipt
readback(receipt, options) -> ProviderEffectVerification
```

Not every provider must implement every method. Unsupported methods are fail-closed.

### 6.1 Google Drive

Read:

- list/search files;
- filter by configured folder when present;
- expose revision/modified-time evidence.

Write:

- create a file where explicitly requested;
- update an explicitly targeted supported file when capability and authority permit;
- never infer overwrite targets from fuzzy search alone.

Readback:

- re-fetch file metadata/content identity as appropriate;
- verify target id, revision and expected mutation.

### 6.2 Gmail

Read:

- inbox/search metadata;
- retrieve message/thread context required by NEXO surfaces.

Write:

- send an explicitly confirmed message;
- create draft when the user requests draft-only behavior;
- no bulk send action in this implementation.

Readback:

- verify sent/draft message id and thread metadata from Gmail.

### 6.3 Google Calendar

Read:

- existing upcoming event projection.

Write:

- create/update/delete only when the corresponding capability is PASS and the user confirms the concrete event mutation;
- conflict and duplicate checks occur before writes.

Readback:

- fetch the event by id and compare material fields.

### 6.4 NEXO SSoT / Sheets

Read:

- read the canonical NEXO sheet;
- read `AUTHORITY_MATRIX`;
- read `CAPABILITY_MATRIX`;
- preserve source refs and fingerprints.

Write:

- only bounded canonical mutations whose Truth Owner is NEXO SSoT and whose capability is PASS;
- Integrity receives material conflict lifecycle records and execution-integrity failures;
- no authority declaration is auto-corrected by TruthGraph.

Readback:

- re-read the exact affected range/record and verify canonical state.

### 6.5 GitHub

Read:

- repository state;
- issues/PRs;
- workflow runs and relevant deployment evidence;
- commit/status evidence.

Write:

- create/update issue or PR metadata where explicitly requested;
- create commits/branches/PRs through existing repository rules;
- merge/push-to-protected targets only when capability and repository policy permit and after explicit confirmation.

Readback:

- fetch resulting issue/PR/commit/status by stable id/SHA.

### 6.6 Vercel

Read:

- project deployments;
- deployment status;
- runtime/build evidence exposed by authorized Vercel APIs.

Write:

- trigger/create deployment only for an existing project and approved source revision;
- promote/alias only with explicit confirmation and capability PASS;
- never create a new project as part of this scope.

Readback:

- verify deployment id, target, READY/ERROR state, aliases and source revision.

### 6.7 Atlas

Read:

- consume existing Graph Contract V1 or current Atlas graph endpoint;
- normalize nodes/edges/freshness/fingerprint;
- expose entity provenance in NEXO ONE.

Write:

- no independent Atlas Truth Owner writes are introduced;
- actions affecting Atlas-derived state must mutate the underlying authoritative source and then allow Atlas to re-project it.

Readback:

- verify updated Atlas fingerprint/entity projection only after the underlying authority mutation is proven.

## 7. Action Broker

Create an internal `Action Broker` module inside `nexo-one/server/execution/`.

It is not a new service, database, automation or Truth Owner.

### 7.1 Intent contract

Every action intent contains:

- `action_id`
- `action_type`
- `domain`
- `provider`
- `capability_id`
- `target_ref`
- `requested_payload`
- `requested_at`
- `requested_by`
- `idempotency_key`
- `confirmation_level`

The server derives authority and policy fields. The client cannot assert its own authority decision.

### 7.2 Gate order

The broker evaluates in this order:

1. authenticated private session;
2. syntactically valid intent;
3. known domain and provider;
4. canonical authority resolution;
5. capability exists;
6. capability state is `PASS` for the requested action;
7. provider credential/scope is available;
8. target is unambiguous;
9. confirmation requirement is satisfied;
10. idempotency check permits execution.

Any failed gate returns a structured denial and no provider side effect.

### 7.3 Confirmation policy

Three levels:

- `NONE`: read-only operations and reversible local projection refreshes;
- `CONFIRM`: ordinary external writes such as sending an email, creating an event, updating a file or opening a PR;
- `STRONG_CONFIRM`: destructive or production-impacting actions such as deleting an event, overwriting canonical data, merging protected work or promoting production.

The UI displays the exact provider, target and material diff before confirmation.

### 7.4 Idempotency

Every write action has an idempotency key derived from stable semantic inputs plus user intent id.

Rules:

- retries of the same action must not create duplicate side effects;
- ambiguous provider timeouts force a readback before retry;
- exactly-once claims are made only where both effect identity and readback evidence support them;
- otherwise the receipt explicitly reports at-least-once or uncertain semantics.

## 8. Execution receipt and readback

An execution receipt contains:

- action id;
- provider effect id;
- capability id;
- authority decision;
- before fingerprint/revision;
- provider response classification;
- readback status;
- after fingerprint/revision;
- checked_at;
- source_ref;
- final status;
- explanation.

Final statuses:

- `PASS`
- `PENDING_READBACK`
- `BLOCKED`
- `FAILED`
- `DEGRADED`
- `CONFLICT`

`PASS` is impossible without successful readback for write actions.

## 9. TruthGraph and Integrity integration

TruthGraph remains responsible for authority/provider/freshness/capability coherence.

The Action Broker consumes TruthGraph/authority outputs but does not rewrite them.

Material conflicts persisted to Integrity include:

- authority/provider contradictions;
- canonical write readback mismatch;
- duplicate or ambiguous effects with material impact;
- production deployment revision mismatch;
- failed strong-confirm actions with partial provider effects.

Non-material transients stay in Execution/provider health and do not spam Integrity.

Historical resolved Integrity records remain historical records. Current TruthGraph status reflects current canonical state.

## 10. Projection model

The public projection remains read-only and non-authoritative.

Rules:

- private mode reads canonical/provider sources directly;
- public mode may expose safe GitHub context and the existing TruthGraph projection snapshot;
- the projection snapshot contains no secrets and no private item corpus;
- projection freshness is visible;
- a stale projection can degrade UI state but can never override canonical authority;
- no new automation is created solely to refresh the snapshot.

The existing governance/execution flow may refresh projection artifacts as part of normal work, but the projection is not promoted to Truth Owner.

## 11. API changes

Keep the existing route style under the current server handler.

Add bounded internal routes for actions, for example:

- `GET /api/actions/capabilities`
- `POST /api/actions/plan`
- `POST /api/actions/execute`
- `GET /api/actions/:id/readback`

Exact route names may follow the repository's existing API wrapper pattern, but semantics must remain separated into plan, confirmation/execute and readback.

Writes are no longer globally disabled once the action routes are added; instead, all non-action write attempts remain rejected and action writes pass through the broker only.

Existing public read routes remain backward compatible.

## 12. UI integration

### Overview

Show:

- current world health;
- provider availability;
- projection health;
- material blockers;
- actions awaiting confirmation;
- recent execution/readback outcomes.

The top `PROJECTION BUS DEGRADED` indicator becomes actionable: it names the failed/degraded envelopes/providers/capabilities rather than only reporting a count.

### Precisa de você

Show only human decisions:

- action confirmations;
- strong confirmations;
- authority conflicts requiring human resolution;
- credential/permission actions that cannot be solved automatically.

### Actions

Show planned intents, their target, capability and required confirmation.

### Execution

Show execution trace:

`planned -> gated -> confirmed -> dispatched -> provider_ack -> readback -> final`

Each write displays receipt id, source ref and before/after revision.

### TruthGraph

Keep the authority/capability radar and add links to the exact action/execution evidence causing a status.

### Capabilities

For each capability show:

- declared state;
- last proof;
- provider;
- interactive vs scheduled support;
- write/read scope requirement;
- last successful readback.

### Sources

Show credentials/scopes as capability states, never raw secrets.

### Integrity

Show only material conflict records plus resolution history.

### Atlas

Use the existing live graph integration and attach execution/provenance links to entities where relevant.

### Now / Loops / Day / Context / Recall

Use private live provider data when authenticated. Public mode stays limited to safe projections.

## 13. Error handling

Normalized provider/action errors:

- `AUTH_REQUIRED`
- `SCOPE_REQUIRED`
- `CAPABILITY_BLOCKED`
- `AUTHORITY_CONFLICT`
- `TARGET_AMBIGUOUS`
- `RATE_LIMITED`
- `PROVIDER_UNAVAILABLE`
- `PROVIDER_REJECTED`
- `READBACK_MISMATCH`
- `READBACK_TIMEOUT`
- `IDEMPOTENCY_CONFLICT`

Errors returned to the UI are safe summaries. Provider payloads containing secrets or tokens are never reflected.

## 14. Testing strategy

Implementation follows RED -> GREEN -> refactor.

Required test groups:

### Authentication

- session not configured;
- invalid password;
- valid private session;
- logout/cache clear;
- same-origin enforcement;
- service OIDC positive and negative claim tests.

### Provider adapters

For each provider:

- successful read;
- auth missing;
- scope missing;
- rate limit;
- unavailable provider;
- partial/stale fallback;
- successful write where supported;
- provider rejection;
- ambiguous timeout + readback.

### Authority/capability broker

- unknown capability fails closed;
- `UNVERIFIED`, `PENDING_*`, `BLOCKED` do not execute;
- `PASS` is necessary but not sufficient without authority match;
- authority conflict blocks write;
- confirmation levels enforced;
- client-supplied authority cannot override server resolution.

### Idempotency

- duplicate execute request produces one effect;
- timeout followed by readback does not duplicate;
- conflicting idempotency payload is rejected.

### Readback

- successful provider effect + matching readback -> PASS;
- 2xx provider ack + mismatch -> FAILED/CONFLICT, never PASS;
- no readback -> PENDING/DEGRADED;
- production deployment SHA mismatch -> material Integrity conflict.

### TruthGraph / Integrity

- material conflicts persist once and dedupe;
- transient auth/read issues do not become false material conflicts;
- resolved historical conflicts do not force current conflict state;
- fingerprints remain semantic and stable across checked_at changes.

### Browser

Desktop and mobile browser tests cover:

- login;
- live Overview;
- provider/source drilldown;
- action plan;
- confirmation modal;
- execution trace;
- readback result;
- TruthGraph evidence links;
- degraded provider explanation;
- logout/public fallback.

## 15. Deployment and validation

Use the existing GitHub and Vercel projects.

Release gate:

1. all unit/contract/integration tests green;
2. browser desktop/mobile green;
3. production bundle asset verification;
4. preview deploy;
5. preview API and browser readback;
6. production deploy;
7. production asset MIME/readback checks;
8. private session check;
9. one non-destructive read proof per provider;
10. one safe real write/readback canary per supported write provider;
11. TruthGraph recompile after canaries;
12. Integrity check for unexpected material conflicts.

A provider/capability is reported `LIVE/PASS` only if its actual production readback satisfies the declared contract.

If a credential or external OAuth approval is unavailable, implementation can still ship fail-closed, but that capability remains visibly `AUTH_REQUIRED`, `SCOPE_REQUIRED`, `UNVERIFIED` or `BLOCKED`. It must not be reported as integrated merely because code exists.

## 16. Rollback

Rollback requires no schema migration because no database is introduced.

- revert the NEXO ONE release to the previous verified deployment;
- external effects already confirmed and executed are not automatically reversed;
- receipts/source refs remain in existing canonical/integrity surfaces where they were legitimately persisted;
- public projection remains available as degraded read-only fallback.

## 17. Acceptance criteria

The implementation is complete only when all applicable criteria below are observed in production:

- NEXO private session is configured and usable;
- Drive, Gmail, Calendar, GitHub, Vercel, NEXO SSoT and Atlas provide live authenticated reads or explicitly documented provider-level blockers;
- supported writes are exposed only through Action Broker capability gates;
- user confirmation is required at the defined risk level;
- no blocked/unverified capability can generate a provider effect;
- each executed write has a provider effect id/source ref;
- each executed write is read back before PASS;
- duplicate requests do not create duplicate effects under the supported idempotency contract;
- SSoT authority remains canonical where declared;
- TruthGraph reflects current authority/provider/capability state;
- only material conflicts are persisted in Integrity;
- Overview, Precisa de você, Actions, Execution, TruthGraph, Capabilities, Sources, Integrity, Atlas, Now, Loops, Day, Context and Recall use the integrated world state appropriately;
- public mode exposes no private corpus or secrets;
- no new DB, repo, automation or Truth Owner exists;
- production UI renders on desktop and mobile;
- production JS/CSS assets return correct MIME types;
- release status is based on real production readback, not deployment success alone.
