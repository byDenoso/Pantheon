# Neon Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Audit and optimize the NEXO Neon project without changing Truth Owner boundaries or deleting recoverable history.

**Architecture:** Operate on the current default branch of `nexo-research-cockpit`, measuring first and applying only non-destructive fixes automatically. Material schema/index changes are tested on a Neon temporary branch and promoted only through the migration/tuning gate.

**Tech Stack:** PostgreSQL 18, Neon MCP, `science_v1`, `learning_v1`, `nexo_ops`, `olympus`, `flight_api`.

**Spec:** `atlas-control-tower/docs/superpowers/specs/2026-09-08-neon-drive-github-optimization-design.md`

## Global Constraints
- `science_v1`, `learning_v1`, `nexo_ops`, and `olympus` remain Truth Owners for their domains.
- Atlas remains read-only projection.
- No destructive SQL, project deletion, or branch deletion without explicit approval.
- Preserve Black Box history and provenance.

---

### Task 1: Inventory and integrity baseline

**Files:**
- Create: `atlas-control-tower/docs/audits/2026-09-08-neon-audit.md`

**Interfaces:**
- Consumes: Neon project `steep-sound-00663650`, default branch `br-dark-hill-awc89q2k`.
- Produces: measured baseline and integrity counts used by later tasks.

- [ ] **Step 1: Record project and branch inventory**

Run Neon `describe_project`, `list_branches`, `list_postgres_endpoints`, and `list_snapshots` for `steep-sound-00663650`.

- [ ] **Step 2: Run structural inventory SQL**

```sql
SELECT n.nspname AS schema_name, c.relkind, c.relname,
       pg_total_relation_size(c.oid) AS total_bytes
FROM pg_class c
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname IN ('science_v1','learning_v1','nexo_ops','olympus','flight_api','public')
  AND c.relkind IN ('r','p','v','m','S')
ORDER BY 1,2,3;
```

- [ ] **Step 3: Run integrity readbacks**

```sql
SELECT 'science_relation_from_missing' issue, count(*) n
FROM science_v1.relations r LEFT JOIN science_v1.entities e ON e.entity_id=r.from_entity_id
WHERE e.entity_id IS NULL
UNION ALL
SELECT 'science_relation_to_missing', count(*)
FROM science_v1.relations r LEFT JOIN science_v1.entities e ON e.entity_id=r.to_entity_id
WHERE e.entity_id IS NULL
UNION ALL
SELECT 'science_provenance_owner_missing', count(*)
FROM science_v1.provenance p LEFT JOIN science_v1.entities e ON e.entity_id=p.owner_entity_id
WHERE e.entity_id IS NULL
UNION ALL
SELECT 'science_revision_owner_missing', count(*)
FROM science_v1.revisions r LEFT JOIN science_v1.entities e ON e.entity_id=r.entity_id
WHERE e.entity_id IS NULL
UNION ALL
SELECT 'science_entity_domain_entity_missing', count(*)
FROM science_v1.entity_domains d LEFT JOIN science_v1.entities e ON e.entity_id=d.entity_id
WHERE e.entity_id IS NULL
UNION ALL
SELECT 'science_entity_domain_domain_missing', count(*)
FROM science_v1.entity_domains d LEFT JOIN science_v1.domains x ON x.domain_id=d.domain_id
WHERE x.domain_id IS NULL
UNION ALL
SELECT 'olympus_current_state_person_missing', count(*)
FROM olympus.current_state c LEFT JOIN olympus.people p ON p.id=c.person_id
WHERE p.id IS NULL;
```

- [ ] **Step 4: Write baseline audit document**

Record exact counts, sizes, branch roles, and any integrity failures. Do not infer missing relations.

- [ ] **Step 5: Commit**

```bash
git add atlas-control-tower/docs/audits/2026-09-08-neon-audit.md
git commit -m "docs(nexo): record Neon audit baseline"
```

### Task 2: Query-path measurement

**Files:**
- Modify if needed: `atlas-control-tower/api/runtime-semantic.js`
- Modify if needed: `atlas-control-tower/api/runtime-orphans.js`
- Test if code changes: `atlas-control-tower/test/system-overview.test.mjs`, `atlas-control-tower/test/source-links.test.mjs`

**Interfaces:**
- Consumes: current Atlas Data API query shapes.
- Produces: measured plans and any bounded query-shape optimization.

- [ ] **Step 1: Inspect Atlas runtime query shapes**

Read every `select(...)` call against `science_v1.entities`, `science_v1.relations`, `science_v1.provenance`, `flight_api.atlas_cockpit_index`, and `nexo_ops` tables.

- [ ] **Step 2: EXPLAIN representative entity lookup**

```sql
SELECT entity_id,entity_type,title,summary,status,current_revision_id,source_surface,source_row_key,updated_at
FROM science_v1.entities
WHERE entity_id='T-PEER-S0-GLOBAL-META-20260907'
LIMIT 1;
```

- [ ] **Step 3: EXPLAIN representative relation lookup**

```sql
SELECT relation_id,from_entity_id,to_entity_id,relation_type,status,source_surface,source_ref,evidence_class
FROM science_v1.relations
WHERE from_entity_id='T-PEER-S0-GLOBAL-META-20260907'
   OR to_entity_id='T-PEER-S0-GLOBAL-META-20260907';
```

- [ ] **Step 4: EXPLAIN semantic lookup**

```sql
SELECT entity_id,source_system,source_entity_type,short_label_pt,what_pt,how_pt,why_pt,source_updated_at,index_version,indexed_at
FROM flight_api.atlas_cockpit_index
WHERE entity_id='T-PEER-S0-GLOBAL-META-20260907'
LIMIT 1;
```

- [ ] **Step 5: If an avoidable full hydration exists, write failing contract test first**

The test must assert the narrowed query/probe behavior rather than SQL whitespace.

- [ ] **Step 6: Implement minimal query-shape fix and run**

```bash
cd atlas-control-tower && npm test
```

Expected: all tests pass.

### Task 3: Index and storage candidates

**Files:**
- Create only if justified: `atlas-control-tower/migrations/2026-09-08-neon-query-indexes.sql`
- Update: `atlas-control-tower/docs/audits/2026-09-08-neon-audit.md`

**Interfaces:**
- Consumes: EXPLAIN evidence and Neon index/scan statistics.
- Produces: either no-change decision or a tested migration proposal.

- [ ] **Step 1: Run `table-sizes`, `index-sizes`, `unused-indexes`, `seq-scans`, `vacuum-stats`, and `bloat` checks**

Do not drop an index solely because scan count is low.

- [ ] **Step 2: Classify legacy `public` tables**

Confirm current runtime references to `public.snapshots`, `public.sync_changes`, `public.entities`, `public.relations`, `public.sources`, `public.source_refs`, `public.metrics`, `public.sync_runs`, and `public.app_state` in GitHub.

- [ ] **Step 3: If a new index materially improves a measured Atlas query, prepare it on a temporary Neon tuning/migration branch**

Example only when evidence supports it:

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS <measured_index_name>
ON <measured_table>(<measured_columns>);
```

Do not promote without explicit migration/tuning approval.

- [ ] **Step 4: Record storage candidates without deletion**

The  legacy snapshot/read-model tables are marked `LEGACY_STORAGE_CANDIDATE` only when no active code path references them.

### Task 4: Semantic and source coverage

**Files:**
- Update: `atlas-control-tower/docs/audits/2026-09-08-neon-audit.md`

**Interfaces:**
- Consumes: all Truth Owner entities and Drive IDs.
- Produces: per-system semantic coverage and source-reference coverage.

- [ ] **Step 1: Measure semantic index counts by source system**

```sql
SELECT source_system, source_entity_type, count(*)
FROM flight_api.atlas_cockpit_index
GROUP BY 1,2 ORDER BY 1,2;
```

- [ ] **Step 2: Measure source-system orphans**

Compare Science, Learning, Black Box, and Olympus canonical object IDs against expected semantic IDs. Count missing and extra projections separately.

- [ ] **Step 3: Measure Drive-ID coverage**

Build the distinct set of Drive IDs referenced by Science provenance/sources/assets, Olympus `source_ref`, and NEXO operational source references. Confirm a `drive:<id>` semantic entry exists for every indexable Drive reference.

- [ ] **Step 4: Record no-invented-relation decision**

Indexed-but-unrelated entities remain unrelated unless a canonical relation exists.

### Task 5: Neon final verification

**Files:**
- Update: `atlas-control-tower/docs/audits/2026-09-08-neon-audit.md`

- [ ] **Step 1: Re-run integrity SQL and coverage SQL**

Expected: no new integrity regressions; unexplained indexable semantic orphans = 0.

- [ ] **Step 2: Re-run any changed EXPLAIN plan**

Record before/after execution and planning evidence.

- [ ] **Step 3: Record unresolved gated actions**

Branch deletion, extension installation, destructive legacy-table cleanup, and material migration promotion remain explicit gates.
