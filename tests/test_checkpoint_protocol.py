"""Fault injection against an in-memory atomic backend, not a remote qualification."""
import copy
import pathlib
import sys
import unittest
import threading
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, str(pathlib.Path(__file__).parents[1] / 'scripts'))
from checkpoint_protocol import Checkpoints, Conflict, UncertainCommit, UncertainTransition, digest


class AtomicMemory:
    def __init__(self):
        self.lock = threading.RLock()
        self.t = 100.0
        self.rows = {}
        self.blobs = {}
        self.after_put = None
        self.before_cas = None
        self.fail_after_cas = False
        self.corrupt_after_cas = False

    def now(self):
        return self.t

    def read(self, key):
        with self.lock:
            state, revision = self.rows.get(key, (None, None))
            return copy.deepcopy(state), revision

    def cas(self, key, expected, value, lease=None, require_future=False):
        with self.lock:
            return self._cas_locked(key, expected, value, lease, require_future)

    def _cas_locked(self, key, expected, value, lease, require_future):
        if self.before_cas:
            callback, self.before_cas = self.before_cas, None
            callback()
        old, revision = self.rows.get(key, (None, None))
        if expected != revision:
            raise Conflict('CAS mismatch')
        if lease is not None and (old is None or old['owner'] != lease.owner or
                old['fence'] != lease.fence or old['expires'] <= self.t):
            raise Conflict('atomic lease predicate failed')
        if require_future and value['expires'] <= self.t:
            raise Conflict('new lease deadline already expired')
        self.rows[key] = copy.deepcopy(value), (revision or 0) + 1
        if self.corrupt_after_cas and value.get('checkpoint'):
            self.blobs[value['checkpoint']['blob_id']] = b'CORRUPT'
        if self.fail_after_cas:
            self.fail_after_cas = False
            raise OSError('response lost after successful CAS')

    def put_immutable(self, value):
        with self.lock:
            key = 'blob-' + str(len(self.blobs) + 1)
            self.blobs[key] = value
            callback, self.after_put = self.after_put, None
        if callback:
            callback()
        return key

    def get_blob(self, key):
        with self.lock:
            return self.blobs[key]


class ProtocolTests(unittest.TestCase):
    def setUp(self):
        self.b = AtomicMemory()
        self.p = Checkpoints(self.b, 'fixture-only')
        self.lease = self.p.acquire('worker1', 10)

    def test_publish_parent_and_readback(self):
        self.p.publish(self.lease, b'one', None, 'fixture-attempt-0001')
        self.p.publish(self.lease, b'two', digest(b'one'), 'fixture-attempt-0001')
        self.assertEqual(self.p.readback(), b'two')

    def test_competitor_rejected(self):
        with self.assertRaises(Conflict): self.p.acquire('worker2', 10)

    def test_expired_writer_fenced(self):
        self.b.t += 11
        second = self.p.acquire('worker2', 10)
        self.assertGreater(second.fence, self.lease.fence)
        with self.assertRaises(Conflict): self.p.publish(self.lease, b'old', None, 'fixture-attempt-0001')
        self.p.publish(second, b'new', None, 'fixture-attempt-0001')

    def test_expiry_during_upload(self):
        self.b.after_put = lambda: setattr(self.b, 't', 111)
        with self.assertRaises(Conflict): self.p.publish(self.lease, b'slow', None, 'fixture-attempt-0001')
        self.assertIsNone(self.p.readback())

    def test_renew_during_upload_requires_retry(self):
        self.b.after_put = lambda: self.p.renew(self.lease, 20)
        with self.assertRaises(Conflict): self.p.publish(self.lease, b'x', None, 'fixture-attempt-0001')
        self.assertIsNone(self.p.readback())

    def test_expiry_between_check_and_cas(self):
        self.b.before_cas = lambda: setattr(self.b, 't', 111)
        with self.assertRaises(Conflict): self.p.publish(self.lease, b'late', None, 'fixture-attempt-0001')
        self.assertIsNone(self.p.readback())

    def test_wrong_parent_no_upload(self):
        with self.assertRaises(Conflict): self.p.publish(self.lease, b'x', 'wrong', 'fixture-attempt-0001')
        self.assertFalse(self.b.blobs)

    def test_lost_response_is_resolved_without_rewrite(self):
        self.b.fail_after_cas = True
        with self.assertRaises(UncertainCommit) as caught: self.p.publish(self.lease, b'ok', None, 'fixture-attempt-0001')
        self.assertTrue(self.p.resolve(caught.exception.receipt))
        self.assertEqual(len(self.b.blobs), 1)

    def test_corruption_after_publish_is_uncertain_not_success(self):
        self.b.corrupt_after_cas = True
        with self.assertRaises(UncertainCommit) as caught: self.p.publish(self.lease, b'ok', None, 'fixture-attempt-0001')
        with self.assertRaises(ValueError): self.p.resolve(caught.exception.receipt)

    def test_release_preserves_fence_and_checkpoint(self):
        self.p.publish(self.lease, b'one', None, 'fixture-attempt-0001')
        self.p.release(self.lease)
        second = self.p.acquire('worker2', 10)
        self.assertGreater(second.fence, self.lease.fence)
        self.assertEqual(self.p.readback(), b'one')

    def test_stale_controller_revision_rejected(self):
        state, rev = self.b.read('fixture-only')
        self.p.renew(self.lease, 20)
        with self.assertRaises(Conflict): self.b.cas('fixture-only', rev, state)

    def test_acquire_expired_before_cas(self):
        self.p.release(self.lease)
        self.b.before_cas = lambda: setattr(self.b, 't', 111)
        with self.assertRaises(Conflict): self.p.acquire('late', 10)

    def test_renew_new_deadline_expired_before_cas(self):
        self.p.renew(self.lease, 100)
        self.b.before_cas = lambda: setattr(self.b, 't', 102)
        with self.assertRaises(Conflict): self.p.renew(self.lease, 1)

    def test_acquire_lost_response_has_readonly_resolution(self):
        self.p.release(self.lease)
        self.b.fail_after_cas = True
        with self.assertRaises(UncertainTransition) as caught: self.p.acquire('new', 10)
        self.assertTrue(self.p.resolve_transition(caught.exception.expected_state))

    def test_threaded_acquire_only_one_winner(self):
        backend = AtomicMemory()
        barrier = threading.Barrier(8)
        read = backend.read
        def simultaneous_read(key):
            result = read(key)
            barrier.wait(timeout=5)
            return result
        backend.read = simultaneous_read
        def contender(i):
            try: return Checkpoints(backend, 'race').acquire(str(i), 10)
            except Conflict: return None
        with ThreadPoolExecutor(max_workers=8) as pool:
            winners = [v for v in pool.map(contender, range(8)) if v is not None]
        self.assertEqual(len(winners), 1)
        self.assertEqual(winners[0].fence, 1)

    def test_threaded_immutable_blobs_unique_and_intact(self):
        barrier = threading.Barrier(16)
        def writer(i):
            data = ('payload-' + str(i)).encode()
            barrier.wait(timeout=5)
            return self.b.put_immutable(data), data
        with ThreadPoolExecutor(max_workers=16) as pool:
            results = list(pool.map(writer, range(16)))
        self.assertEqual(len({k for k, _ in results}), 16)
        for key, data in results:
            self.assertEqual(self.b.get_blob(key), data)

    def test_expiry_overflow(self):
        self.b.t = 1e308
        with self.assertRaises(ValueError): self.p.acquire('new', 1e308)

    def test_replaced_pointer_with_same_bytes_not_our_success(self):
        original = self.b.cas
        def replace_after_commit(key, rev, value, **guards):
            original(key, rev, value, **guards)
            current, newrev = self.b.read(key)
            receipt = dict(current['checkpoint'], attempt_id='other-attempt-0002')
            self.b.rows[key] = dict(current, checkpoint=receipt), newrev+1
        self.b.cas = replace_after_commit
        with self.assertRaises(UncertainCommit):
            self.p.publish(self.lease, b'one', None, 'fixture-attempt-0001')

    def test_same_bytes_different_attempt_is_not_resolved(self):
        receipt = self.p.publish(self.lease, b'one', None, 'fixture-attempt-0001')
        wrong = dict(receipt, attempt_id='fixture-attempt-0002', fence=receipt['fence']+1)
        self.assertFalse(self.p.resolve(wrong))

    def test_resolve_validates_single_snapshot_blob(self):
        receipt = self.p.publish(self.lease, b'one', None, 'fixture-attempt-0001')
        original = self.b.read
        def swap_after_read(key):
            state, rev = original(key)
            newer = dict(receipt, blob_id='new', sha256=digest(b'two'))
            self.b.blobs['new'] = b'two'
            self.b.rows[key] = dict(state, checkpoint=newer), rev+1
            self.b.blobs[receipt['blob_id']] = b'bad'
            return state, rev
        self.b.read = swap_after_read
        with self.assertRaises(ValueError): self.p.resolve(receipt)

    def test_invalid_ttl(self):
        for ttl in (True, 0, -1, float('inf'), float('nan')):
            with self.assertRaises(ValueError): self.p.renew(self.lease, ttl)

    def test_resolve_wrong_hash_readonly(self):
        self.assertFalse(self.p.resolve(digest(b'absent')))
        self.assertFalse(self.b.blobs)

if __name__ == '__main__': unittest.main()
