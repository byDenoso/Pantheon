# Private nested chunks (draft implementation)

This replaces the public cache/artifact route for **future authorized runs**.
Do not merge into an active auto-continuing campaign. Run #5 is not modified by
this PR. No workflow was dispatched as part of development.

## Invariants

- Scientific likelihood, priors, seeds, live-point counts and target are unchanged.
- A dynesty 3.1.0 checkpoint retains the complete sampler, live points, RNG,
  proposal/bounding state. A chunk budget is not convergence.
- Stop evidence is checked from the remaining-live evidence estimate before live
  points are finalized once. `dlogz_final`, `logZ`, errors and posterior samples
  remain in private result files. A final checkpoint can recover a missing JSON
  without adding its live set again.
- Checkpoints require both source/data hash and runtime binding. Missing or
  changed hashes fail closed; no automatic reset or lost-live-point fallback.
- Source changes include a checkpoint contract change. Old checkpoints are NOT
  silently accepted or edited. Migration requires separate review and an explicit
  approved import procedure; this PR does not provide or perform that migration.

## Private destination configuration (not provisioned by this PR)

Use the already authorized `NEXO_DRIVE_WRITER_JSON` credential. No new credentials
or permissions are created. Operators must supply two secrets containing a private
config file ID and its SHA-256: `NEXO_NESTED_PRIVATE_CONFIG_FILE_ID` and
`NEXO_NESTED_PRIVATE_CONFIG_SHA256`. Config schema:

```json
{
  "schema": "NEXO_NESTED_PRIVATE_V1",
  "campaign": "operator-chosen-unique-campaign",
  "revision": "exact-approved-Git-commit-SHA",
  "output_folder_id": "private-folder-ID",
  "allowed_permission_ids": ["owner-permission-ID", "writer-permission-ID"],
  "slots": {
    "S1-LCDM-s0": ["empty-user-owned-chunk-zero-file-ID", "empty-user-owned-chunk-one-file-ID"]
  }
}
```

Add other legs as required. Each leg/chunk needs a distinct, preallocated empty
user-owned binary in the authorized private folder. Service accounts cannot
create My Drive files with their own storage quota; the code only PATCHES these
explicit slots. Config and folder/file ACLs reject public/domain permissions;
only the configured user/group permission IDs are accepted. Shared Drives are
not supported by this adapter.

No persistent access or configuration has been installed. A missing config,
slot, predecessor, changed revision or unexpected ACL stops the dependent run
before computation. A following chunk requires its exact prior immutable archive,
matching campaign/revision/job/chunk and verified per-file bytes/hash. It never
falls back to a fresh sampler when the predecessor is unavailable.

## Persistence and failure behavior

Each chunk archive contains ckpt, results and private diagnostics, plus a manifest.
Results are not put in Actions artifacts, caches, annotations or summaries.
The sampler process receives neither Drive credentials nor GitHub command-file
variables. stdout/stderr (including library diagnostics) are redirected to a
private local file; worker pools are killed before archival on enforced timeout.

The upload runs once. A timeout is reconciled by reading the destination; a
matching SHA/size succeeds without replay. Redispatch requires successful verified
private delivery and an unused next slot. A nonempty slot is never overwritten.
The emptiness check plus upload is not atomic: each configured slot must be
exclusively reserved, protected by workflow concurrency and operator discipline.
There is no claim of cross-workflow atomicity. Configure separate campaign slots.

The runner is ephemeral. Failed private transfer, hard runner termination or
network failure can lose the newest local chunk; the previously verified private
archive stays intact. No public fallback is permitted. Reconcile a nonempty or
uncertain current slot before retrying; do not erase it. The dispatch API can be
unavailable for a branch-only workflow; this returns a status failure after saving
rather than claiming continuity. No blind dispatch retry is made.

MAX_CHUNKS is an exclusive count (chunk 0 through count-1). Dispatch one model and
seed per call; the old public all-model/push trigger is deliberately removed. An
operator must authorize launch separately; opening this PR does not start work.

## Verification

`python -m unittest discover -s tests -p 'test_nested*.py'`

The analytic Gaussian test compares uninterrupted vs three serialized resumes,
including exact live coordinates/loglikelihood, RNG state and final samples,
weights, lnZ/error arrays. It also tests idempotent final checkpoint recovery.
Transport tests use mocked Drive responses, test private ACL rejection, immutable
slots, path traversal, wrong campaign, failed readback, timeout reconciliation,
credential-free numerical child, and absence of public cache/artifact paths.

No real cosmology chain or live private Drive delivery was executed for this PR.
The unit tests establish software invariants, not scientific discovery or actual
campaign convergence. Actual transport setup/readback remains an integration gate.
