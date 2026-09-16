# NEXO MCP Consolidation Design

Date: 2026-09-15
Status: Proposed / user-approved design, implementation pending written-spec review

## Objective

Consolidate NEXO semantic MCP operations onto the already-running Vercel MCP at:

`https://nexo-atlas-control-tower.vercel.app/api/mcp`

The goal is one official MCP front door for ChatGPT, Codex and agents, while preserving `byDenoso/NEXO-Obsidian-Vault@main:TOWER_V06` as the sole operational truth owner.

This change is intended to reduce duplicated hosting, duplicated contracts, low-level GitHub/Tower handling by clients, and inconsistent tool availability between MCP surfaces.

## Current State

### Working production MCP

`nexo-atlas-control-tower` is deployed on Vercel and its `/api/mcp` endpoint currently responds successfully. It exposes capability/bootstrap discovery and scientific intake. The existing gateway already persists through canonical Tower mutation requests, waits for receipts/readback, and dispatches execution through GitHub.

Current hosted tools include:

- `nexo.get_bootstrap`
- `nexo.get_capabilities`
- `nexo_submit_scientific_tests_v1`

The endpoint currently reports `tower_write_configured=false` in production, so write operations remain fail-closed until a server-side GitHub credential is configured.

### Other MCP surfaces

`nexo-one` contains a separate native MCP implementation with public read-only science tools. It is not the chosen canonical front door for this change.

`byDenoso/NEXO-Obsidian-Vault/services/nexo-api` contains a Python/FastAPI remote MCP implementation with richer semantic operations and a Railway-oriented hosting contract. It remains useful as reference/runtime code, but its separate host must cease being required for normal NEXO operation.

## Decision

Promote `nexo-atlas-control-tower.vercel.app/api/mcp` to the single official hosted MCP endpoint for NEXO.

Do not introduce another truth store, queue, scheduler, database, agent fleet, mutation path or deployment provider as part of this migration.

## Architecture

```text
ChatGPT / Codex / Agents / Automations
                 |
                 v
  nexo-atlas-control-tower.vercel.app/api/mcp
                 |
        semantic MCP boundary
                 |
       Tower GitHub Gateway
                 |
                 v
 byDenoso/NEXO-Obsidian-Vault@main:TOWER_V06
                 |
       mutation receipts / readback
                 |
                 +----> GitHub Actions / SingleRuntime
                 |              |
                 +<--- evidence/result/readback
```

The MCP is a transport and semantic interface only. It never becomes a second canonical writer or truth owner.

## MCP Surface

### Public discovery/read tools

Remain callable without mutation authority:

- `nexo.get_bootstrap`
- `nexo.get_capabilities`
- public-safe science discovery already present where appropriate

Public responses must never expose secrets, private Tower payloads, Olympus/client health data or private operational records.

### Authenticated semantic tools

The consolidated MCP should expose the semantic operations needed for ordinary NEXO use, using existing Tower/CAS/runtime semantics rather than direct entity CRUD.

Target groups:

#### State and work

- `nexo.status`
- `nexo.get_state`
- `nexo.get_work`
- `nexo.get_next_work`
- `nexo.get_mutation`

#### Work and request ingress

- `nexo.create_work`
- canonical objective/request ingress where already defined
- `nexo.handoff_work`
- `nexo.start_work`
- `nexo.submit_result`
- `nexo.block_work`
- `nexo.complete_work`

#### Campaigns and execution

- `nexo.prepare_campaign`
- `nexo.run_work`
- `nexo.run_campaign`
- `nexo.readback`
- `nexo.get_evidence`
- `nexo.get_campaigns`
- `nexo.get_interdomain`

#### Scientific intake

Preserve the current explicit user-directed scientific test intake semantics, including stable scientific fingerprinting, Tower-first persistence, exact readback before dispatch, capability resolution and dedupe/attach-to-existing behavior.

#### Health lifecycle

Expose the canonical health operations already implemented over Tower WORK/EVENT/CAS:

- `nexo.observe_health_issue`
- `nexo.start_health_repair`
- `nexo.resolve_health_issue`

The same fingerprint must map to the same logical health WORK. Repeated unchanged observation returns `NO_OP_DUPLICATE_HEALTH_ISSUE` and does not generate duplicate user notification.

## Auth and Permission Model

Use one hosted endpoint with two permission classes.

### Public

Only discovery and explicitly public-safe read tools.

### Authenticated

Private reads, Tower mutations, runtime dispatch and health lifecycle operations require bearer authentication.

Bearer verification remains server-side. Secrets never appear in MCP arguments, browser bundles, repository files, TOWER entities, telemetry or client-visible discovery payloads.

Tower writes remain fail-closed when no authorized server-side GitHub credential is available.

Expected server-side credential resolution should preserve the existing contract where possible, including support for `NEXO_TOWER_GITHUB_TOKEN` and compatible existing server-side GitHub credential names.

## Canonical Mutation Model

All operational mutations must continue through the existing Tower mutation/CAS model.

Clients must not gain general arbitrary `PATCH`, `PUT`, delete or direct entity CRUD semantics.

For semantic mutation:

1. derive deterministic semantic intent/request;
2. persist into the canonical Tower mutation path;
3. wait for mutation receipt;
4. perform exact canonical readback;
5. dispatch runtime only when the contract permits it;
6. return stable IDs and readback references to the MCP client.

Dispatch acceptance is not a scientific result.

## Scientific Closure Compatibility

The consolidated MCP must preserve the current scientific closure invariant:

`RESULT -> HYPOTHESIS_RECONCILIATION -> CLAIM_UPDATE_OR_NO_CHANGE -> NEXT_TEST_OR_TERMINALIZE -> READBACK`

A successfully executed scientific test may remain `PENDING_SCIENTIFIC_CLOSURE`; MCP responses must not convert runtime verification into scientific closure.

Existing `SCIENTIFIC_CLOSURE_REQUIRED` routing to `NEXO Autoconsistente v1.3` remains authoritative.

## Migration Strategy

### Phase 1: Contract freeze and tests

Add failing contract tests for the consolidated hosted MCP surface before implementation.

Tests must cover:

- public discovery remains accessible;
- authenticated tool listing exposes the semantic surface;
- unauthenticated mutation calls fail closed;
- authenticated mutation routes through Tower gateway;
- mutation receipt/readback is required;
- duplicate health issue returns no-op;
- health lifecycle can progress to `RESOLVED`;
- scientific intake still deduplicates existing tests;
- scientific mutation never bypasses Tower-first persistence;
- no new truth store is created.

### Phase 2: Shared semantic adapter

Extend the existing Vercel MCP implementation with a thin semantic adapter that maps MCP tools to existing Tower/GitHub/runtime operations.

Prefer reusing existing gateway/service modules already present in Pantheon or importing/porting only the minimal semantic logic from `services/nexo-api` required for equivalence.

Do not perform a broad Python-to-JavaScript rewrite.

### Phase 3: Hosted integration

Register the new authenticated semantic tools on the existing Vercel MCP endpoint.

Preserve existing public discovery compatibility and current MCP protocol behavior.

### Phase 4: E2E verification

Production/preview verification must demonstrate:

`initialize -> tools/list -> authenticated tools/call -> Tower mutation -> receipt -> exact readback`

For an executable work item, additionally demonstrate:

`dispatch -> runtime -> evidence/result -> readback`

For health, demonstrate:

`observe -> duplicate observe -> no-op -> start repair -> resolve -> readback`

### Phase 5: Deprecate duplicate hosting requirement

Once equivalence is proven:

- document the Vercel endpoint as the only official hosted NEXO MCP front door;
- remove Railway hosting as a normal operational dependency;
- keep `services/nexo-api` only where it still provides useful library/runtime/tests until separately simplified;
- do not delete useful reference code merely to make the repository look tidy.

## Rollback

Rollback must be cheap and must not affect canonical scientific state.

If the expanded MCP causes regression:

1. revert the Vercel MCP semantic-surface commit;
2. preserve the existing discovery/scientific intake endpoint;
3. continue direct Tower/GitHub execution temporarily;
4. no data restore is required because no MCP-local truth exists.

## Non-Goals

This migration will not:

- move truth out of `TOWER_V06`;
- add a database;
- add another queue or scheduler;
- replace GitHub Actions/SingleRuntime;
- expand Gmail/Drive permissions;
- merge NEXO ONE private personal actions into the science MCP unless required by an existing canonical capability;
- reorganize unrelated Vercel projects;
- rewrite all Python NEXO API code into Node;
- remove working code solely for aesthetic consolidation.

## Acceptance Criteria

The migration is complete only when all of the following are true:

1. `nexo-atlas-control-tower.vercel.app/api/mcp` is the documented canonical hosted MCP endpoint.
2. Public discovery continues to work without mutation authority.
3. Private semantic operations require authentication.
4. Authorized semantic mutation persists through Tower and proves receipt/readback.
5. Work/campaign execution can be invoked semantically without the client knowing mutation inbox paths or workflow details.
6. Health dedupe and repair-first operations are available through the hosted MCP.
7. Scientific intake preserves Tower-first persistence and closure rules.
8. The duplicate Railway-hosted MCP is no longer required for normal operation.
9. CI passes and production/preview MCP E2E passes.
10. No new operational truth owner or persistence layer has been introduced.

## Expected Daily Impact

After migration, user intent should normally resolve through one path:

`human request -> NEXO MCP -> Tower -> runtime -> evidence/readback`

Clients should no longer need to choose between multiple NEXO MCP hosts or know which internal GitHub file, mutation request or workflow implements the operation.
