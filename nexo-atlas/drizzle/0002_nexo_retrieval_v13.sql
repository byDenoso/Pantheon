-- Rebuildable private current-scientific projection and explicit owner-grant schema.
-- This migration creates no grant and imports no source data.
-- Private derived data only. Apply locally for tests; no hosted migration authorized.
CREATE TABLE IF NOT EXISTS retrieval_generations (
  generation TEXT PRIMARY KEY,
  manifest_sha256 TEXT NOT NULL,
  manifest_json TEXT NOT NULL,
  mutation_seq INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL CHECK(state IN ('staging','verified'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS retrieval_shards (
  generation TEXT NOT NULL REFERENCES retrieval_generations(generation),
  family TEXT NOT NULL,
  lookup_key TEXT NOT NULL,
  content_sha256 TEXT NOT NULL,
  encoding TEXT NOT NULL CHECK(encoding IN ('json','gzip')),
  payload BLOB NOT NULL,
  PRIMARY KEY(generation,family,lookup_key)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS retrieval_heads (
  source_id TEXT NOT NULL,
  role TEXT NOT NULL,
  policy TEXT NOT NULL,
  generation TEXT NOT NULL REFERENCES retrieval_generations(generation),
  PRIMARY KEY(source_id,role,policy)
);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS retrieval_shard_immutable_insert BEFORE INSERT ON retrieval_shards
WHEN (SELECT state FROM retrieval_generations WHERE generation=NEW.generation) IS NOT 'staging'
BEGIN SELECT RAISE(ABORT,'GENERATION_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS retrieval_shard_immutable_update BEFORE UPDATE ON retrieval_shards
WHEN NEW.generation!=OLD.generation OR (SELECT state FROM retrieval_generations WHERE generation=OLD.generation) IS NOT 'staging'
BEGIN SELECT RAISE(ABORT,'GENERATION_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS retrieval_shard_immutable_delete BEFORE DELETE ON retrieval_shards
WHEN (SELECT state FROM retrieval_generations WHERE generation=OLD.generation) IS NOT 'staging'
BEGIN SELECT RAISE(ABORT,'GENERATION_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS retrieval_shard_sequence_insert AFTER INSERT ON retrieval_shards
BEGIN UPDATE retrieval_generations SET mutation_seq=mutation_seq+1 WHERE generation=NEW.generation; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS retrieval_shard_sequence_update AFTER UPDATE ON retrieval_shards
BEGIN UPDATE retrieval_generations SET mutation_seq=mutation_seq+1 WHERE generation=OLD.generation; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS retrieval_shard_sequence_delete AFTER DELETE ON retrieval_shards
BEGIN UPDATE retrieval_generations SET mutation_seq=mutation_seq+1 WHERE generation=OLD.generation; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS retrieval_generation_immutable BEFORE UPDATE ON retrieval_generations
WHEN OLD.state='verified' OR NEW.manifest_json!=OLD.manifest_json OR NEW.manifest_sha256!=OLD.manifest_sha256 OR NEW.generation!=OLD.generation
BEGIN SELECT RAISE(ABORT,'GENERATION_IMMUTABLE'); END;
--> statement-breakpoint
-- Optional content-addressed producer format. Payload bytes are private and
-- immutable. Generation-specific identity/catalog links bind reused content.
CREATE TABLE IF NOT EXISTS retrieval_payloads (
  content_sha256 TEXT PRIMARY KEY,
  encoding TEXT NOT NULL CHECK(encoding IN ('json','gzip')),
  payload BLOB NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS retrieval_content_shards (
  generation TEXT NOT NULL REFERENCES retrieval_generations(generation),
  family TEXT NOT NULL,
  lookup_key TEXT NOT NULL,
  content_sha256 TEXT NOT NULL REFERENCES retrieval_payloads(content_sha256),
  PRIMARY KEY(generation,family,lookup_key)
);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS retrieval_payload_immutable_update BEFORE UPDATE ON retrieval_payloads
BEGIN SELECT RAISE(ABORT,'PAYLOAD_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS retrieval_payload_referenced_delete BEFORE DELETE ON retrieval_payloads
WHEN EXISTS(SELECT 1 FROM retrieval_content_shards WHERE content_sha256=OLD.content_sha256)
BEGIN SELECT RAISE(ABORT,'PAYLOAD_REFERENCED'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS retrieval_content_immutable_insert BEFORE INSERT ON retrieval_content_shards
WHEN (SELECT state FROM retrieval_generations WHERE generation=NEW.generation) IS NOT 'staging'
  OR NOT EXISTS(SELECT 1 FROM retrieval_payloads WHERE content_sha256=NEW.content_sha256)
BEGIN SELECT RAISE(ABORT,'GENERATION_OR_PAYLOAD_INVALID'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS retrieval_content_immutable_update BEFORE UPDATE ON retrieval_content_shards
WHEN NEW.generation!=OLD.generation OR (SELECT state FROM retrieval_generations WHERE generation=OLD.generation) IS NOT 'staging'
BEGIN SELECT RAISE(ABORT,'GENERATION_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS retrieval_content_immutable_delete BEFORE DELETE ON retrieval_content_shards
WHEN (SELECT state FROM retrieval_generations WHERE generation=OLD.generation) IS NOT 'staging'
BEGIN SELECT RAISE(ABORT,'GENERATION_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS retrieval_content_sequence_insert AFTER INSERT ON retrieval_content_shards
BEGIN UPDATE retrieval_generations SET mutation_seq=mutation_seq+1 WHERE generation=NEW.generation; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS retrieval_content_sequence_update AFTER UPDATE ON retrieval_content_shards
BEGIN UPDATE retrieval_generations SET mutation_seq=mutation_seq+1 WHERE generation=OLD.generation; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS retrieval_content_sequence_delete AFTER DELETE ON retrieval_content_shards
BEGIN UPDATE retrieval_generations SET mutation_seq=mutation_seq+1 WHERE generation=OLD.generation; END;
--> statement-breakpoint
-- Private build journal allows bounded writes before its final catalog exists.
CREATE TABLE IF NOT EXISTS retrieval_build_shards (
  generation TEXT NOT NULL, family TEXT NOT NULL, lookup_key TEXT NOT NULL,
  content_sha256 TEXT NOT NULL REFERENCES retrieval_payloads(content_sha256),
  PRIMARY KEY(generation,family,lookup_key)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS retrieval_source_records (
  record_key TEXT PRIMARY KEY,
  content_sha256 TEXT NOT NULL REFERENCES retrieval_payloads(content_sha256)
);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS retrieval_source_record_immutable BEFORE UPDATE ON retrieval_source_records
BEGIN SELECT RAISE(ABORT,'SOURCE_RECORD_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS retrieval_source_payload_referenced_delete BEFORE DELETE ON retrieval_payloads
WHEN EXISTS(SELECT 1 FROM retrieval_source_records WHERE content_sha256=OLD.content_sha256)
BEGIN SELECT RAISE(ABORT,'PAYLOAD_REFERENCED'); END;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS retrieval_source_observations (
  observation_id TEXT PRIMARY KEY,
  manifest_sha256 TEXT NOT NULL,
  manifest_json TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS retrieval_source_heads (
  source_id TEXT PRIMARY KEY,
  observation_id TEXT NOT NULL REFERENCES retrieval_source_observations(observation_id)
);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS retrieval_observation_immutable_update BEFORE UPDATE ON retrieval_source_observations
BEGIN SELECT RAISE(ABORT,'OBSERVATION_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS retrieval_observation_immutable_delete BEFORE DELETE ON retrieval_source_observations
BEGIN SELECT RAISE(ABORT,'OBSERVATION_IMMUTABLE'); END;
--> statement-breakpoint
-- Apply only to the existing private D1 after hosted-import approval.
-- No source bodies, role-withheld documents or credentials are stored here.
CREATE TABLE IF NOT EXISTS retrieval_scope_jobs (
  cursor TEXT PRIMARY KEY,
  previous_cursor TEXT UNIQUE,
  state_json TEXT NOT NULL,
  state_sha256 TEXT NOT NULL
);
--> statement-breakpoint
-- One bounded, trusted SQL invocation atomically inserts a batch's deduplicated
-- payloads and staging links. The inbox row is consumed by its own transaction.
CREATE TABLE IF NOT EXISTS retrieval_scope_stage_inbox (
  id INTEGER PRIMARY KEY, generation TEXT NOT NULL, payload_json TEXT NOT NULL
);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS retrieval_scope_stage_bound BEFORE INSERT ON retrieval_scope_stage_inbox
WHEN length(CAST(NEW.payload_json AS BLOB))>1750000 OR NOT json_valid(NEW.payload_json) OR json_type(NEW.payload_json)!='array'
BEGIN SELECT RAISE(ABORT,'STAGING_BATCH_BOUND'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS retrieval_scope_stage_consume AFTER INSERT ON retrieval_scope_stage_inbox
BEGIN
  SELECT RAISE(ABORT,'SHARD_CONTENT_CONFLICT') WHERE EXISTS(
    SELECT 1 FROM json_each(NEW.payload_json) j WHERE EXISTS(SELECT 1 FROM retrieval_build_shards b
    WHERE b.generation=NEW.generation AND b.family=json_extract(j.value,'$.family') AND b.lookup_key=json_extract(j.value,'$.key')
    AND b.content_sha256!=json_extract(j.value,'$.sha')));
  INSERT INTO retrieval_payloads(content_sha256,encoding,payload)
    SELECT json_extract(value,'$.sha'),'json',CAST(json_extract(value,'$.payload') AS BLOB)
    FROM json_each(NEW.payload_json) WHERE true ON CONFLICT(content_sha256) DO NOTHING;
  INSERT INTO retrieval_build_shards(generation,family,lookup_key,content_sha256)
    SELECT NEW.generation,json_extract(value,'$.family'),json_extract(value,'$.key'),json_extract(value,'$.sha')
    FROM json_each(NEW.payload_json) WHERE true ON CONFLICT(generation,family,lookup_key) DO NOTHING;
  DELETE FROM retrieval_scope_stage_inbox WHERE id=NEW.id;
END;
--> statement-breakpoint
-- Candidate only. Do not apply to hosted D1 until explicit approval.
-- A grant is an owner-bound authorization record, never a bearer credential.
CREATE TABLE IF NOT EXISTS atlas_mcp_grants (
  user_id TEXT PRIMARY KEY NOT NULL,
  grant_id TEXT UNIQUE NOT NULL,
  credential_sha256 TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role = 'LEARNER'),
  policy TEXT NOT NULL CHECK (policy = 'reviewed-contextual-router-v13'),
  scope TEXT NOT NULL CHECK (scope = 'tower-scientific-current-readonly-v13'),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  CHECK (expires_at > created_at AND expires_at <= created_at + 2592000000)
);

--> statement-breakpoint
-- Internal progress only. A cursor never grants source access.
CREATE TABLE IF NOT EXISTS retrieval_automatic_jobs (
  owner_scope TEXT PRIMARY KEY NOT NULL,
  cursor TEXT,
  lease_id TEXT NOT NULL,
  lease_expires_at INTEGER NOT NULL
);
