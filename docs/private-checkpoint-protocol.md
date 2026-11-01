# Checkpoint protocol — backend-independent design and local fault tests

This is not a Drive adapter, remote lease qualification or enabled scientific
runner. No real checkpoint is read or written by the included tests.

Required backend primitives:
- authoritative monotonic time for lease validity;
- linearizable read and atomic create/compare-and-swap on controller revision;
- an atomic CAS lease predicate (owner, monotonically increasing fence, expiry);
- immutable blob creation and byte readback.

A local process lock, two independent HTTP calls or checking an ETag without
providing the required lease predicate is not an implementation of this contract.
No new database or service is proposed or provisioned here. An existing authorized
backend must demonstrate these semantics before integration can be enabled.

The protocol uploads an immutable blob, verifies bytes, then publishes its pointer
through guarded CAS. Partial upload or conflict leaves at most an unreferenced
blob, never a changed checkpoint pointer. There is no automatic garbage collection.
A lost CAS response is an uncertain result: resolve by readback before retrying.
An expired writer cannot publish using an old fence even if it finishes later.

Tests inject expiration during upload and immediately before CAS, competing owners,
renewal, stale revisions, wrong parent, corruption after publication and a lost
successful CAS response. They prove behavior of the algorithm against the stated
mock primitives, not existence of those guarantees in any cloud provider.
