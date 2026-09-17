# NEXO Capability Reconciliation P0 Design

## Goal
Implement once -> reconcile once -> discover everywhere, without creating a second capability registry.

## Authority
`byDenoso/NEXO-Obsidian-Vault@main:TOWER_V06` remains operational truth. `TOWER_V06/manifests/capabilities.json` is the canonical capability registry. Pantheon, MCP, API, agents and chats are consumers/origins of changes, not truth owners.

## P0
Add a stateless capability reconciliation module to Pantheon that:
1. normalizes a capability candidate;
2. computes a transport/provider-independent semantic fingerprint;
3. compares candidate against the canonical manifest;
4. classifies NEW, UNCHANGED, UPDATE, DUPLICATE, CONFLICT or INVALID;
5. emits a proposed canonical record, never silently trusting discovery;
6. exposes discovery through the semantic gateway;
7. proves cross-surface behavior with a disposable reconciliation probe.

## Safety
P0 does not auto-promote privileged/destructive capabilities. Canonical mutation remains behind Tower CAS/readback. Discovery is not trust. Existing capability manifest remains the only registry.

## Success
A probe implemented outside the registry is normalized/fingerprinted, reconciled to a canonical candidate, visible through the semantic surface, and removal/drift can be classified without inventing another source of truth.
