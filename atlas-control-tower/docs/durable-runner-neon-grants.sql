-- NEXO Durable Runner V1
-- Project: steep-sound-00663650
-- Database: neondb
-- Data API role resolved from the live Neon Data API configuration on 2026-09-08.
--
-- Scope is intentionally narrow. The runner may persist operational
-- receipts/checkpoints and perform compare-and-set status transitions on
-- existing nexo_ops.actions. It must not insert/delete actions and must not
-- gain write authority over science_v1, learning_v1, olympus, truth_states,
-- or other schemas.

GRANT INSERT, UPDATE
ON TABLE nexo_ops.execution_runs, nexo_ops.runtime_events
TO "prj_KylVECcLXdzM8xqfsk6t3SzstVhu";

GRANT UPDATE
ON TABLE nexo_ops.actions
TO "prj_KylVECcLXdzM8xqfsk6t3SzstVhu";

-- Verification / readback:
-- SELECT table_name, privilege_type
-- FROM information_schema.role_table_grants
-- WHERE grantee = 'prj_KylVECcLXdzM8xqfsk6t3SzstVhu'
--   AND table_schema = 'nexo_ops'
--   AND table_name IN ('actions', 'execution_runs', 'runtime_events')
-- ORDER BY table_name, privilege_type;
--
-- Expected:
-- actions: SELECT, UPDATE
-- execution_runs: INSERT, SELECT, UPDATE
-- runtime_events: INSERT, SELECT, UPDATE
-- No INSERT on actions. No DELETE or TRUNCATE grant is required or intended.
