# Private B6 launch integration

This branch adds an isolated manual launch route. Legacy workflows and frozen
checkpoints are unchanged. No merge or scientific dispatch has been performed
by the implementation tests.

The public repository contains only a generic SHA-bound capsule loader, a pinned
public-registry runtime lock, and workflow routing. Scientific code, priors,
acceptance records, model/replica contracts, inputs and output IDs stay in the
reviewed private capsule and per-attempt manifest.

The loader requires a separately reviewed numerical-acceptance record. It does
not change numerical tolerances, relabel qualification history, or select a pilot
on the operator's behalf. Scientific qualification details remain private.

## Before dispatch

1. Publish the reviewed private capsule and per-attempt manifests to the existing
   private campaign folder using separately authorized publication.
2. Pre-provision a new private empty output file for each attempt and record its
   exact initial hash. Never reuse a legacy or accepted snapshot ID.
3. Review and merge this branch only after explicit merge authorization. GitHub
   needs the workflow registered on the default branch. Merge alone starts no job.
4. Dispatch the exact campaign/model/replica and manifest ID/hash. Check for an
   equivalent running attempt first. No automatic dispatch or workflow permission
   expansion is included.

## Persistence and limits

GH concurrency plus a declared sole owner covers this workflow in this repository,
not arbitrary external writers. Each attempt writes a different private snapshot;
resume names its immutable predecessor explicitly. Media PATCH is followed by MD5,
size and full-byte GET verification. Uncertain writes require read-only resolution,
not a blind PATCH retry. No unsupported distributed CAS/lease guarantee is claimed.

Initialization can span segments: a contract-scoped transactional evaluation
journal replays the same seeded initial sequence without reevaluating committed
calls. After initialization, restore the actual native dynesty sampler checkpoint;
the journal never replaces it. A killed unfinished likelihood may be recomputed.

Solver and likelihood subprocesses run serially to bound memory. Their combined
per-evaluation timeout leaves time for private checkpoint transfer. Complete job
wall time includes provisioning and public payload downloads. Private stdout and
stderr are captured; public logs show only allowlisted status tokens.

Snapshots are bounded to 512 MiB uncompressed/10000 members in the current transport.
Before approaching this bound, a streaming transport extension is required; no
claim is made that the maximum likelihood-call budget fits this transport.
Diagnostics are per segment, with explicit truncation metadata; previous diagnostic
history remains in the immutable predecessor snapshots. No scientific data or log
is uploaded as a public Actions artifact.

## Validation limits

Local tests cover normalized prior binding, saved-spectrum native likelihood
regression, bandpass-state reversibility, serial-process receipt validation,
resumable initialization/proposals, native final live-point inclusion, phase-aware
snapshot readback, and malicious/mismatched manifest rejection. These are not new
scientific sampling campaigns. Remote runtime provisioning and first private
snapshot readback are only verified after an authorized actual run.
