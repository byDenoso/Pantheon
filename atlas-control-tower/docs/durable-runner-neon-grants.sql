-- NEXO Durable Runner V1
-- Project: steep-sound-00663650
-- Database: neondb
-- Data API role resolved from the live Neon Data API configuration on 2026-09-08.
--
-- Scope is intentionally narrow. The runner may persist only operational
-- receipts/checkpoints in nexo_ops. It must not gain write authority over
-- science_v1, learning_v1, olympus, actions, truth_states, or other schemas.

GRANT INSERT, UPDATE
ON TABLE nexo_ops.execution_runs, nexo_ops.runtime_events
TO "prj_KylVECcLXdzM8xqfsk6t3SzstVhu";

-- Verification / readback:
-- SELECT table_name, privilege_type
-- FROM information_schema.role_table_grants
-- WHERE grantee = 'prj_KylVECcLXdzM8xqfsk6t3SzstVhu'
--   AND table_schema = 'nexo_ops'
--   AND table_name IN ('execution_runs', 'runtime_events')
-- ORDER BY table_name, privilege_type;
--
-- Expected privileges for each table: INSERT, SELECT, UPDATE.
-- No DELETE or TRUNCATE grant is required or intended.
