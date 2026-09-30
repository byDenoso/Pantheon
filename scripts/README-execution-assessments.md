# Bounded execution assessment intake

`collect_execution_assessments.py` appends verified observations to the same
`/tmp/bat/updates.json` spool used by the Writer. It does not write the Tower or
change a verdict. The Writer owns assessment validation and its atomic mutation.

The versioned `nexo-control/execution-assessment-approvals.json` lists only the
two reviewed historical technical failures, with exact test, battery, run,
artifact, attempt, recipe, observation and content hashes plus expected entity
versions. The collector checks GitHub artifact metadata, both ZIP/member hashes
and the original receipt. Raw bytes remain in the private Writer evidence.

The list ships disabled. Enable it only after the matching TCC assessment
contract has passed CI and is active; its change wakes the existing Writer.
After both canonical assessments and public projections have been read back,
set `enabled` to false while preserving the reviewed descriptors. This ends only
the bounded intake, without changing schedules or discarding its audit trail.

A source failure produces a warning and no assessment for that case. It does not
stop normal battery collection. Never substitute a current result, broaden the
list automatically, fabricate a missing artifact or refresh a CAS version
without verifying that the approved observation still matches.
