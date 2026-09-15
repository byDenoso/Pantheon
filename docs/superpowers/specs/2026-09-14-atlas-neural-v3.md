# Atlas Neural V3

Date: 2026-09-14
Status: APPROVED

## Goal

Build ATLAS as a read-only spatial projection of NEXO canonical state, with one authority, one projection contract, one data SDK and one visual universe.

## Canonical authority

Operational truth is owned exclusively by:

`byDenoso/NEXO-Obsidian-Vault@main:TOWER_V06`

`TOWER_V06/CONTROL.json` is the control-plane authority. Its write model is `GITHUB_CAS_ENTITY_EVENT`.

Google Drive is not an operational truth owner. It may remain an evidence, artifact, dataset or legacy projection provider, but it cannot override TOWER_V06.

Pantheon/ATLAS never mutates TOWER_V06.

## Core rule

> Atlas never decides what is true. Atlas renders a validated, sanitized projection of canonical truth.

## Target flow

```text
TOWER_V06
   |
   v
ATLAS PROJECTION V3
validate -> normalize -> sanitize -> resolve -> index -> fingerprint
   |
   +---------------------+
   v                     v
PUBLIC SNAPSHOT      PRIVATE SNAPSHOT
   |                     |
   +----------+----------+
              v
        ATLAS DATA SDK
              |
              v
        ATLAS NEURAL V3
```

## Projection contract

Every snapshot exposes:

- `contractVersion`
- `schemaVersion`
- `projectionVersion`
- `fingerprint`
- `sourceVersion`
- `generatedAt`
- `authority = TOWER_V06`
- `projectionOnly = true`
- `completeness`
- `freshness`

A projection cannot become a second truth store.

## Scientific spine

The durable scientific model is:

`DOMAIN -> CAMPAIGN -> HYPOTHESIS -> TEST -> RUN -> RESULT -> EVIDENCE -> CLAIM`

Operational work and inter-domain learning attach to that graph without replacing it.

## Inter-domain learning

The existing TOWER inter-domain layer is projected as first-class filaments.

An inter-domain entity becomes a `FILAMENT` in Atlas and retains:

- canonical id;
- source domains;
- target domains;
- source nodes;
- relation type;
- status;
- mapping;
- prediction/utility;
- falsifier;
- test refs;
- evidence refs;
- proposed test;
- entity version.

Filaments are hypotheses/learning relations, not scientific evidence by themselves.

## Layers

Atlas Neural V3 is one spatial universe with switchable layers:

- `SCIENCE`
- `LEARNING`
- `OPERATIONS`
- `EVIDENCE`
- `PROVENANCE`
- `HEALTH`

These are views over the same snapshot, not independent products or truth paths.

## Failure semantics

Projection states are explicit:

- `SNAPSHOT`
- `STALE`
- `UNAVAILABLE`
- `CORRUPT`

A failed refresh preserves the last valid snapshot. Missing artifacts never mean an empty scientific conclusion.

## Privacy

Public projection is allowlist-based.

Personal Olympus/client data must not enter public snapshots. Public Atlas may expose only explicitly sanitized derived structure. Private data requires a separate authenticated projection boundary.

## Migration policy

Atlas V3 is introduced in parallel. The current Atlas remains available until V3 reaches readback parity.

Legacy runtimes, Drive readers, Neon readers, duplicate graph engines and serverless compatibility routes are not removed merely to satisfy architecture aesthetics. They are retired only after the equivalent V3 read path is verified.

## Definition of done

V3 is complete when:

1. TOWER_V06 is the only operational authority declared by Pantheon.
2. Projection V3 deterministically builds a validated snapshot from canonical input.
3. Atlas SDK reads only V3 projection artifacts.
4. Inter-domain learning is represented as graph filaments.
5. Public/private boundaries are explicit.
6. Atlas UI renders the same projected universe through layer changes instead of separate truth paths.
7. CI validates contracts, projection integrity, privacy, typecheck, build and public readback.