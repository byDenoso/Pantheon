-- Private derived data only. Apply locally for tests; no hosted migration authorized.
CREATE TABLE IF NOT EXISTS retrieval_generations (
  generation TEXT PRIMARY KEY,
  manifest_sha256 TEXT NOT NULL,
  manifest_json TEXT NOT NULL,
  mutation_seq INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL CHECK(state IN ('staging','verified'))
);
CREATE TABLE IF NOT EXISTS retrieval_shards (
  generation TEXT NOT NULL REFERENCES retrieval_generations(generation),
  family TEXT NOT NULL,
  lookup_key TEXT NOT NULL,
  content_sha256 TEXT NOT NULL,
  encoding TEXT NOT NULL CHECK(encoding IN ('json','gzip')),
  payload BLOB NOT NULL,
  PRIMARY KEY(generation,family,lookup_key)
);
CREATE TABLE IF NOT EXISTS retrieval_heads (
  source_id TEXT NOT NULL,
  role TEXT NOT NULL,
  policy TEXT NOT NULL,
  generation TEXT NOT NULL REFERENCES retrieval_generations(generation),
  PRIMARY KEY(source_id,role,policy)
);

CREATE TRIGGER IF NOT EXISTS retrieval_shard_immutable_insert BEFORE INSERT ON retrieval_shards
WHEN (SELECT state FROM retrieval_generations WHERE generation=NEW.generation) IS NOT 'staging'
BEGIN SELECT RAISE(ABORT,'GENERATION_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS retrieval_shard_immutable_update BEFORE UPDATE ON retrieval_shards
WHEN NEW.generation!=OLD.generation OR (SELECT state FROM retrieval_generations WHERE generation=OLD.generation) IS NOT 'staging'
BEGIN SELECT RAISE(ABORT,'GENERATION_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS retrieval_shard_immutable_delete BEFORE DELETE ON retrieval_shards
WHEN (SELECT state FROM retrieval_generations WHERE generation=OLD.generation) IS NOT 'staging'
BEGIN SELECT RAISE(ABORT,'GENERATION_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS retrieval_shard_sequence_insert AFTER INSERT ON retrieval_shards
BEGIN UPDATE retrieval_generations SET mutation_seq=mutation_seq+1 WHERE generation=NEW.generation; END;
CREATE TRIGGER IF NOT EXISTS retrieval_shard_sequence_update AFTER UPDATE ON retrieval_shards
BEGIN UPDATE retrieval_generations SET mutation_seq=mutation_seq+1 WHERE generation=OLD.generation; END;
CREATE TRIGGER IF NOT EXISTS retrieval_shard_sequence_delete AFTER DELETE ON retrieval_shards
BEGIN UPDATE retrieval_generations SET mutation_seq=mutation_seq+1 WHERE generation=OLD.generation; END;
CREATE TRIGGER IF NOT EXISTS retrieval_generation_immutable BEFORE UPDATE ON retrieval_generations
WHEN OLD.state='verified' OR NEW.manifest_json!=OLD.manifest_json OR NEW.manifest_sha256!=OLD.manifest_sha256 OR NEW.generation!=OLD.generation
BEGIN SELECT RAISE(ABORT,'GENERATION_IMMUTABLE'); END;

-- Optional content-addressed producer format. Payload bytes are private and
-- immutable. Generation-specific identity/catalog links bind reused content.
CREATE TABLE IF NOT EXISTS retrieval_payloads (
  content_sha256 TEXT PRIMARY KEY,
  encoding TEXT NOT NULL CHECK(encoding IN ('json','gzip')),
  payload BLOB NOT NULL
);
CREATE TABLE IF NOT EXISTS retrieval_content_shards (
  generation TEXT NOT NULL REFERENCES retrieval_generations(generation),
  family TEXT NOT NULL,
  lookup_key TEXT NOT NULL,
  content_sha256 TEXT NOT NULL REFERENCES retrieval_payloads(content_sha256),
  PRIMARY KEY(generation,family,lookup_key)
);
CREATE TRIGGER IF NOT EXISTS retrieval_payload_immutable_update BEFORE UPDATE ON retrieval_payloads
BEGIN SELECT RAISE(ABORT,'PAYLOAD_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS retrieval_payload_referenced_delete BEFORE DELETE ON retrieval_payloads
WHEN EXISTS(SELECT 1 FROM retrieval_content_shards WHERE content_sha256=OLD.content_sha256)
BEGIN SELECT RAISE(ABORT,'PAYLOAD_REFERENCED'); END;
CREATE TRIGGER IF NOT EXISTS retrieval_content_immutable_insert BEFORE INSERT ON retrieval_content_shards
WHEN (SELECT state FROM retrieval_generations WHERE generation=NEW.generation) IS NOT 'staging'
  OR NOT EXISTS(SELECT 1 FROM retrieval_payloads WHERE content_sha256=NEW.content_sha256)
BEGIN SELECT RAISE(ABORT,'GENERATION_OR_PAYLOAD_INVALID'); END;
CREATE TRIGGER IF NOT EXISTS retrieval_content_immutable_update BEFORE UPDATE ON retrieval_content_shards
WHEN NEW.generation!=OLD.generation OR (SELECT state FROM retrieval_generations WHERE generation=OLD.generation) IS NOT 'staging'
BEGIN SELECT RAISE(ABORT,'GENERATION_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS retrieval_content_immutable_delete BEFORE DELETE ON retrieval_content_shards
WHEN (SELECT state FROM retrieval_generations WHERE generation=OLD.generation) IS NOT 'staging'
BEGIN SELECT RAISE(ABORT,'GENERATION_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS retrieval_content_sequence_insert AFTER INSERT ON retrieval_content_shards
BEGIN UPDATE retrieval_generations SET mutation_seq=mutation_seq+1 WHERE generation=NEW.generation; END;
CREATE TRIGGER IF NOT EXISTS retrieval_content_sequence_update AFTER UPDATE ON retrieval_content_shards
BEGIN UPDATE retrieval_generations SET mutation_seq=mutation_seq+1 WHERE generation=OLD.generation; END;
CREATE TRIGGER IF NOT EXISTS retrieval_content_sequence_delete AFTER DELETE ON retrieval_content_shards
BEGIN UPDATE retrieval_generations SET mutation_seq=mutation_seq+1 WHERE generation=OLD.generation; END;
-- Private build journal allows bounded writes before its final catalog exists.
CREATE TABLE IF NOT EXISTS retrieval_build_shards (
  generation TEXT NOT NULL, family TEXT NOT NULL, lookup_key TEXT NOT NULL,
  content_sha256 TEXT NOT NULL REFERENCES retrieval_payloads(content_sha256),
  PRIMARY KEY(generation,family,lookup_key)
);
CREATE TABLE IF NOT EXISTS retrieval_source_records (
  record_key TEXT PRIMARY KEY,
  content_sha256 TEXT NOT NULL REFERENCES retrieval_payloads(content_sha256)
);
CREATE TRIGGER IF NOT EXISTS retrieval_source_record_immutable BEFORE UPDATE ON retrieval_source_records
BEGIN SELECT RAISE(ABORT,'SOURCE_RECORD_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS retrieval_source_payload_referenced_delete BEFORE DELETE ON retrieval_payloads
WHEN EXISTS(SELECT 1 FROM retrieval_source_records WHERE content_sha256=OLD.content_sha256)
BEGIN SELECT RAISE(ABORT,'PAYLOAD_REFERENCED'); END;
CREATE TABLE IF NOT EXISTS retrieval_source_observations (
  observation_id TEXT PRIMARY KEY,
  manifest_sha256 TEXT NOT NULL,
  manifest_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS retrieval_source_heads (
  source_id TEXT PRIMARY KEY,
  observation_id TEXT NOT NULL REFERENCES retrieval_source_observations(observation_id)
);
CREATE TRIGGER IF NOT EXISTS retrieval_observation_immutable_update BEFORE UPDATE ON retrieval_source_observations
BEGIN SELECT RAISE(ABORT,'OBSERVATION_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS retrieval_observation_immutable_delete BEFORE DELETE ON retrieval_source_observations
BEGIN SELECT RAISE(ABORT,'OBSERVATION_IMMUTABLE'); END;
