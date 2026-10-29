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
