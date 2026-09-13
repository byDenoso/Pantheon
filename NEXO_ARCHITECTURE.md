# NEXO Sovereign Architecture

The NEXO Sovereign Core has two structural providers:

- Google Drive: mutable factual SSOT.
- GitHub: code, contracts, schemas, architecture, workflows, validation, projection compute, generated read-only state, and public distribution through Pages.

Required public read path:

`Google Drive -> GitHub Actions -> generated GitHub projection -> GitHub Pages -> browser local/static API`

Vercel and Neon are retired from required read paths. Optional integrations may exist, but they are not Core dependencies and their outage must not degrade Core health.

Generated snapshots are projection-only and must preserve provenance, source version, fingerprint, schema/projection versions, completeness and freshness semantics.

The browser is read-only. Authorized writes follow validate -> Drive write -> Drive readback -> projection -> publication -> Pages readback.

Full design: `docs/superpowers/specs/2026-09-13-nexo-sovereign-architecture.md`.
