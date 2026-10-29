-- Apply only to the existing private D1 after hosted-import approval.
-- No source bodies, role-withheld documents or credentials are stored here.
CREATE TABLE IF NOT EXISTS retrieval_scope_jobs (
  cursor TEXT PRIMARY KEY,
  previous_cursor TEXT UNIQUE,
  state_json TEXT NOT NULL,
  state_sha256 TEXT NOT NULL
);
-- One bounded, trusted SQL invocation atomically inserts a batch's deduplicated
-- payloads and staging links. The inbox row is consumed by its own transaction.
CREATE TABLE IF NOT EXISTS retrieval_scope_stage_inbox (
  id INTEGER PRIMARY KEY, generation TEXT NOT NULL, payload_json TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS retrieval_scope_stage_bound BEFORE INSERT ON retrieval_scope_stage_inbox
WHEN length(CAST(NEW.payload_json AS BLOB))>1750000 OR NOT json_valid(NEW.payload_json) OR json_type(NEW.payload_json)!='array'
BEGIN SELECT RAISE(ABORT,'STAGING_BATCH_BOUND'); END;
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
