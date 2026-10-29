-- Internal progress only. A cursor never grants source access.
CREATE TABLE IF NOT EXISTS retrieval_automatic_jobs (
  owner_scope TEXT PRIMARY KEY NOT NULL,
  cursor TEXT,
  lease_id TEXT NOT NULL,
  lease_expires_at INTEGER NOT NULL
);
