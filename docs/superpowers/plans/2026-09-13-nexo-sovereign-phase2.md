# NEXO Sovereign Phase 2 Implementation Plan

**Goal:** Separate generated NEXO state from application code through fingerprinted static artifacts, a compact manifest/entity index, and an atomic publication path that GitHub Pages can consume without Vercel or a live database.

**Architecture:** Existing Drive-derived snapshots remain the source material for this migration step. A deterministic generator creates a complete static-state tree under a staging directory, hashes it, writes manifest/index artifacts last, validates the tree, and exposes the resulting files to the Pages build. A future Drive synchronization workflow can replace the source extraction without changing the browser/runtime contract.

## Tasks

### 1. Deterministic state generator
- Add a Node generator that reads the existing Drive-derived projections.
- Emit bounded science shards, entity/search index, state, health and manifest.
- Generate a deterministic fingerprint from semantic contents, excluding generated timestamps.
- Fail closed if required source artifacts are missing or malformed.

### 2. Artifact contract
- `contractVersion`, `schemaVersion`, `projectionVersion`, `fingerprint`, `sourceVersion`, `source`, `projectionAuthority`, `projectionOnly`.
- Completeness preserved from science projection.
- Manifest enumerates every public artifact and its content hash.

### 3. Public build staging
- Generate state before Vite build.
- Copy only allowlisted public artifacts into `public/data`/build staging.
- Ensure `dist/data/current/manifest.json` and science shards are present.
- Add tests that sensitive/private source classes are absent from public artifacts.

### 4. Browser static artifact loader
- Add a loader that reads `data/current/manifest.json` relative to `import.meta.env.BASE_URL`.
- Resolve science domain/test/result through entity index and shard fetches.
- Cache by fingerprint and shard path.
- No absolute deployment host.

### 5. Atomic publication contract
- Build all state in a temporary tree.
- Validate hashes/schema/completeness before exposing `current`.
- Last-known-good Pages deployment remains unchanged if generation/build fails.
- Add rollback metadata (`previousFingerprint`) to manifest where available.

### 6. CI/readback
- Tests for deterministic fingerprint, artifact hashes, sentinel resolution and missing-source fail-closed behavior.
- Pages workflow verifies manifest, D7 shard and sentinel after build and after deploy.
- Browser smoke blocks retired runtimes.

### Deferred to Phase 3
- Direct Drive read/sync automation into a dedicated `nexo-state` branch.
- Universe/Observatory/Lab/Operations/Learning/Provenance materialization beyond the existing safe projections.
- NEXO ONE migration and final Vercel/Neon cleanup.
