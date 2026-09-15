# NEXO Capability MCP Design

## Goal
Turn the current read-only Science MCP into a governed NEXO capability layer without creating a second source of truth.

## Authority
- Canonical operational truth remains `byDenoso/NEXO-Obsidian-Vault@main:TOWER_V06`.
- MCP exposes discovery, ingress, validation and governed mutation capabilities.
- MCP never becomes a database, scheduler, scientific judge or claim authority.

## Core flow
`CHAT / APP / AUTOMATION -> NEXO MCP -> TOWER_V06 -> AUTOCONSISTENTE / META`.

## Read capabilities
- `get_capabilities`
- `get_nexo_bootstrap`
- `get_hypothesis_registry`
- `get_hypothesis_frontier`
- `get_hypothesis`
- `dedupe_candidate`
- `validate_frozen_contract`
- `get_execution_frontier`
- `get_result_closure_status`

These are projections over the supplied canonical snapshot. They must fail closed on unavailable data and must not infer scientific support.

## Write capabilities
- `ingest_hypothesis`
- `ingest_objective`
- `canonical_transition`
- `enqueue_test`

Write tools are thin governed adapters. They validate structure, produce stable mutation envelopes, and call an injected canonical mutation capability. If that capability is absent, they fail with `MCP_MUTATION_CAPABILITY_UNAVAILABLE`. No fallback store is allowed.

## Ingress vocabulary
- `SCIENTIFIC_HYPOTHESIS`
- `ENGINEERING_OBJECTIVE`
- `OLYMPUS_OBJECTIVE`
- `INTERDOMAIN_CANDIDATE`
- `SYSTEM_IMPROVEMENT`

The MCP may classify/normalize ingress but does not decide scientific truth. Autoconsistente owns scientific methodology, prioritization, RESULT reconciliation and TEST execution. Meta-Improvement owns health/interdomain candidate generation under existing contracts.

## Hypothesis frontier
The registry is canonical hypothesis entities. The frontier is a projection of non-absorbing hypotheses that are scientifically live and eligible for further discrimination. `FALSIFIED` and `RETIRED` are excluded by default. Ranking data may be surfaced, but MCP does not manufacture scores that are absent from state.

## Closure health
A material terminal result is closed only when canonical state demonstrates:
`RESULT -> HYPOTHESIS_RECONCILIATION -> CLAIM_UPDATE_OR_NO_CHANGE -> NEXT_TEST_OR_TERMINALIZE -> READBACK`.
The MCP may diagnose missing links; it must not invent the scientific reconciliation.

## Cross-chat discovery
`get_nexo_bootstrap` is the portable contract for any new chat/runtime. It declares canonical truth, ingress types, lifecycle invariants and recommended first calls. This replaces dependence on chat memory.

## Safety
- Existing public read tools remain sanitized.
- Private/Olympus data are never exposed through public MCP views.
- Mutation tools are non-destructive/idempotent by contract and require an injected governed writer.
- No new scheduler, DB, agent fleet or truth owner.
