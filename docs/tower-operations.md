# Tower operations

The serial SHADOW Writer now maintains private, rebuildable operational views after canonical event readback. It continues to use the existing credential, spool, concurrency group and schedule. Historical scientific rows and the disabled JSON LIVE job remain unchanged.

## Views

| View | Purpose |
| --- | --- |
| AUTONOMIA | Timestamped Writer health, active failures, historical quarantine, provenance and capacity observations. |
| INCIDENTES | Bounded navigation to quarantined transport and conflicting role/task attribution. Original evidence stays in the source. |
| EXECUCOES | The latest 500 result records, with declared evidence class and artifact-pointer state. Records are not independent scientific tests. |
| MANUTENCAO | Daily, ISO-weekly, monthly, quarterly and annual maintenance periods; completion requires an explicit evidence-linked receipt. |
| CHECKPOINTS | Latest valid producer checkpoint with task/run identity, read cursors, pending event IDs and next action. |

The operator provisions these named tabs once. `--operations` fails explicitly if a required view is absent. Projection writes never change source science, permissions, schedules or remote execution authority. A projection failure after scientific readback is reported separately; it does not replay the event. Public logs contain counters and allowlisted error codes only.

## Continuity and maintenance

Checkpoint messages use the existing MURAL transport and event type `CHECKPOINT`. Text starts with `NEXO_CHECKPOINT_V1 ` followed by JSON containing `task_id`, real `run_id`, positive integer `mural_row` and `result_row`, `pending_ids`, and `next_action`. The sender must match EQUIPE and the stable ID must begin with the task ID. These are declared producer checkpoints, not cryptographic execution attestations.

Maintenance messages use event type `MANUTENCAO`, sender `P`, an HTTPS evidence link, and `NEXO_MAINTENANCE_V1 ` followed by JSON containing `id`, `period`, and `state=VERIFIED`. The view acknowledges a receipt rather than independently certifying the linked backup or restore. The existing integration task performs and verifies those actions. Missing receipts remain DUE; timeout and missing evidence never turn into success.

Periods use America/Sao_Paulo. Weekly periods use ISO week-year, including year boundaries. No expiration or annual reset discards scientific evidence. At 50,000 source rows or a 300-second Writer duration the view requests capacity review before the 600-second job timeout. These are review triggers, not platform limits. This change does not certify a year of unattended operation or implement automatic destructive archival.

## Admission and rejection

New events require their essential metadata and respect the existing conservative 50,000 UTF-16-unit cell guard and 2 MB batch budget. Historical applied content is reconciled before these admission checks, so the change does not rewrite prior evidence.

Deterministically malformed current-curator requests may receive an immutable REJECTED receipt. The receipt binds the source ID, complete row hash and parse reason; later cycles reconcile it. Unrecognized authors, runtime failures, identity conflicts, and ambiguous applied receipts remain failures. REJECTED never mutates ROADMAP/RESUMO and never upgrades a request to APPLIED.

## Verification and recovery

Run the Writer, curation and operations tests before integration. Verify the live workflow at the integrated SHA and read the private views afterwards. A green GitHub job is not by itself scientific persistence or remote-dispatch evidence.

Rollback can remove `--operations` without changing the canonical sources. Revert code/configuration selectively; never restore an old whole-Tower snapshot over a live file that has received new events.
