# Drive → GitHub Science API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove Neon from Atlas scientific reads so the production path is strictly Drive source → GitHub-authorized snapshot → Atlas API/frontend.

**Architecture:** The canonical Drive workbook remains the scientific data source. A bounded, versioned JSON projection is persisted in GitHub and explicitly authorized by `nexo-one/data/canonical.json`. `api/science.js` reads only that GitHub projection and never queries Neon; unavailable or malformed snapshots fail visibly instead of silently changing authority.

**Tech Stack:** Google Sheets/Drive, GitHub JSON snapshot, Node/Vercel serverless, Vite/React, Node test runner.

**Spec:** user requirement in this task: `Drive > GH > Front end`, no Neon dependency.

## Global Constraints

- GitHub remains the control authority for which projection is accepted.
- Drive remains the source of scientific rows; GitHub stores a projection, not a competing SSOT.
- Production scientific reads must contain no Neon/Data API network dependency.
- Missing fields remain explicit; do not fabricate scientific conclusions.
- Snapshot provenance, source version, truncation and authority must be visible in the contract.

---

### Task 1: Freeze the no-Neon contract

**Files:**
- Modify: `atlas-control-tower/test/drive-github-science.test.mjs`

**Interfaces:**
- Consumes: `nexo-one/data/canonical.json`, `atlas-control-tower/api/science.js`.
- Produces: regression assertions that production science routes reference the GitHub snapshot and contain no Neon/Data API host/schema reads.

- [ ] Write failing tests for an authorized GitHub science snapshot and zero Neon dependency.
- [ ] Run Atlas Quality and confirm the new assertions fail for the intended reason.
- [ ] Keep the failure as evidence before implementation.

### Task 2: Materialize the Drive science snapshot in GitHub

**Files:**
- Create: `atlas-control-tower/data/science-drive-projection.json`
- Modify: `nexo-one/data/canonical.json`

**Interfaces:**
- Snapshot shape: `{contract, source, sourceRef, sourceVersion, generatedAt, domains, nodes, edges, completeness}`.
- Node fields: `id`, `canonicalId`, `type`, `label`, `status`, `domain`, `summary`, `evidenceClass`, `claimImpact`, `nextGate`, `keyMetrics`, `sourceRefs`, `metadata`.
- Manifest authorizes the exact snapshot path and projection contract.

- [ ] Read Drive `PEER_CONTROL_TOWER_CANONICAL` headers and D-domain rows without changing Drive.
- [ ] Build a bounded projection from published rows only, preserving canonical IDs and source references.
- [ ] Record exact source workbook, observed version and completeness/truncation metadata.
- [ ] Commit the projection and manifest authorization.

### Task 3: Replace the production science reader

**Files:**
- Create: `atlas-control-tower/lib/drive-github-science.mjs`
- Modify: `atlas-control-tower/api/science.js`

**Interfaces:**
- `loadDriveGithubScience()` returns the authorized GitHub snapshot.
- `projectDriveGithubScience(snapshot, route, query)` returns `graph`, `state` or `entity` contracts.

- [ ] Implement snapshot validation against the GitHub authority manifest.
- [ ] Implement graph traversal/search/state/entity projection from the snapshot.
- [ ] Remove all imports/calls into `api/atlas.js` and therefore all Neon/Data API reads from `api/science.js`.
- [ ] Return `freshness: SNAPSHOT`, `authority: GITHUB`, `projectionAuthority: GOOGLE_DRIVE`, `projectionOnly: true`.

### Task 4: Verify and publish

**Files:**
- Test: `atlas-control-tower/test/drive-github-science.test.mjs`
- Existing CI: Atlas Quality + NEXO ONE CI.

- [ ] Run unit/contract tests, typecheck and production build.
- [ ] Verify PR diff contains no accidental test-file truncation or unrelated changes.
- [ ] Merge only after both CI workflows pass.
- [ ] Read back `/api/health`, `/api/graph?focus=domain:D7&depth=3`, and an entity route from production.
- [ ] Confirm response contains real Drive-derived TEST/RESULT content and no `SCIENCE_V1_UNAVAILABLE`, `NEON_DATA_API`, or Neon host dependency.
