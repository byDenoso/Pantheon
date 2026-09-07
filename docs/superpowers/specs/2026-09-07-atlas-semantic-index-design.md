# NEXO Atlas Semantic PT-BR Index Design

## Goal
Create a presentation-only semantic overlay for every entity materialized by the Atlas across Science, Learning and Black Box, exposing short PT-BR labels plus O QUÊ / COMO / POR QUÊ without mutating canonical truth.

## Authority boundary
- `science_v1`, `learning_v1` and `nexo_ops` remain truth owners for their domains.
- The overlay is stored in `flight_api.atlas_cockpit_index` and is always `DERIVED_NOT_EVIDENCE`.
- Canonical IDs, titles, statuses, relations, provenance and scientific claims are never overwritten.
- Technical hashes, paths, schemas, commits and payloads stay in Audit only.

## Data contract
Each overlay row contains `entity_id`, `source_system`, `source_entity_type`, `short_label_pt`, `acronym`, `what_pt`, `how_pt`, `why_pt`, `source_language`, `authority`, `index_version`, `source_updated_at`, `indexed_at`.

## Indexing policy
- Use only fields supported by the source tables.
- Prefer curated display labels when already available.
- Use conservative type-specific Portuguese descriptions when the source lacks prose suitable for the cockpit.
- Never translate or infer a scientific conclusion beyond the canonical source.
- When a specific detail cannot be established safely, use `Não informado na fonte.`.
- Generate acronyms only for long labels and keep the full canonical title untouched.

## Runtime integration
The Atlas runtime reads the overlay from `flight_api`, caches it for 60 seconds, and merges only display fields into `entity.metadata`. Science, Learning and Black Box graph semantics remain unchanged.

## Validation
- row uniqueness by `entity_id`;
- coverage by source system and entity type;
- no orphan overlay rows;
- every row authority equals `DERIVED_NOT_EVIDENCE`;
- no obvious hashes/commit-SHA/path/schema leakage in `what_pt`, `how_pt`, `why_pt`;
- live `/api/entity` readback for one Science, one Learning and one Black Box entity;
- existing Atlas tests remain green.
