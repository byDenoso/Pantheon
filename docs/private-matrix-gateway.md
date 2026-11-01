# Private matrix gateway — draft, not launch-ready

This adds a separate manual workflow; it does not edit the legacy runner,
checkpoints, sampler, scientific priors, or existing workflows. No private
matrix, posterior, dataset, manifest ID, scientific value or credential is
included in this change.

## Implemented

- Explicit campaign/model/replica selection and private manifest SHA binding.
- Matrix alias and blocked-input rejection; distinct integer seeds.
- Private binding and adapter fetched only after SHA checks.
- Full runtime-lock artifact hash and exact installed-distribution comparison.
- Fresh nonce-bound real-joint-point receipt validation with finite likelihood,
  nuisance, overlap, payload and checkpoint-write claims.
- Private stdout/stderr; public output restricted to generic status tokens.
- Immutable action commits; no artifact/cache publication or dependency install.

## Deliberately not activated

Segment mode always fails closed. A scientifically reviewed adapter must first
implement the actual joint likelihood, exclusive checkpoint lease, bounded
sampling, atomic private checkpoint upload and readback. Receipt flags alone
are not scientific validation. The adapter must be reviewed against its raw
inputs, model, likelihood normalization and nuisance contract. No such adapter
is supplied here, and this change cannot launch a scientific campaign.

The existing Python setup supplies only Python, not the locked scientific or
Google authentication dependencies. No package installation or alternative
registry route is used: registry access needs separate resolution. A validated
private runtime binding is still required. Transitive versions must be recorded
as resolved and tested; do not silently substitute an unrelated runtime.

## Private execution schema (not a real manifest)

`nexo.private.matrix.execution.v1` references `matrix: {id, sha256}` and
`bindings: {"<campaign>:<model>": {id, sha256}}`.
Each `nexo.private.matrix.binding.v1` binds the matrix digest, campaign/model,
review status, registry authorization, runner `{id, sha256}`, lock resource
`{id, sha256}`, exact `runtime_lock`, `lock_sha256`, data and nuisance digests.
All values remain in the private source. Never place actual manifests in GitHub.

The adapter CLI is `--preflight request.json --receipt receipt.json`.
It must not start sampling. Output schema is `nexo.private.joint_point.receipt.v1`;
see validator for required provenance, nonce and verified scientific claims.

## Tests / limits

Run `python -m unittest discover -s tests -p test_private_matrix_gateway.py -v`.
These are software tests with fixtures, not scientific likelihood tests or new
experiments. A passing test suite is not a passed runtime gate.

New `workflow_dispatch` workflows must exist on the default branch before
manual dispatch, per GitHub documentation. This draft requires a separate
review/merge decision; do not merge or reuse legacy workflows to bypass it:
https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow
