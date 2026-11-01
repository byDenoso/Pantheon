"""Checkpoint publication protocol over REQUIRED linearizable backend primitives.

This module does not implement a Drive backend or enable the scientific runner.
An adapter MUST supply authoritative clock, atomic create/CAS with server-time lease predicates and immutable blobs.
A per-process lock or a check-then-write remote implementation is insufficient.
Only successful pointer CAS publishes data; unreferenced immutable blobs may remain.
"""
from dataclasses import dataclass
import hashlib
import math


class Conflict(Exception):
    pass


class UncertainTransition(Exception):
    def __init__(self, expected_state):
        super().__init__('resolve controller transition before retry')
        self.expected_state = dict(expected_state)


class UncertainCommit(Exception):
    def __init__(self, message, receipt):
        super().__init__(message)
        self.receipt = dict(receipt)


@dataclass(frozen=True)
class Lease:
    owner: str
    fence: int


def digest(value):
    return hashlib.sha256(value).hexdigest()


class Checkpoints:
    def __init__(self, backend, scope):
        if not isinstance(scope, str) or not scope:
            raise ValueError('scope required')
        self.backend = backend
        self.scope = scope

    def _time(self):
        now = self.backend.now()
        if type(now) not in (int, float) or not math.isfinite(now):
            raise ValueError('authoritative finite time required')
        return now

    @staticmethod
    def _ttl(ttl):
        if type(ttl) not in (int, float) or not math.isfinite(ttl) or ttl <= 0:
            raise ValueError('positive finite ttl required')

    def _expiry(self, ttl):
        expiry = self._time() + ttl
        if not math.isfinite(expiry):
            raise ValueError('expiry overflow')
        return expiry

    def acquire(self, owner, ttl):
        self._ttl(ttl)
        if not isinstance(owner, str) or not owner:
            raise ValueError('owner required')
        state, revision = self.backend.read(self.scope)
        now = self._time()
        if state is None:
            state = dict(fence=0, owner=None, expires=0, checkpoint=None)
        if state['owner'] is not None and state['expires'] > now:
            raise Conflict('lease occupied')
        fresh = dict(state, owner=owner, fence=state['fence'] + 1, expires=self._expiry(ttl))
        self._transition(revision, fresh, require_future=True)
        return Lease(owner, fresh['fence'])

    def _owned(self, lease):
        state, revision = self.backend.read(self.scope)
        if (state is None or state['owner'] != lease.owner or
                state['fence'] != lease.fence or state['expires'] <= self._time()):
            raise Conflict('expired or fenced lease')
        return state, revision

    def renew(self, lease, ttl):
        self._ttl(ttl)
        state, revision = self._owned(lease)
        self._transition(revision, dict(state, expires=self._expiry(ttl)), lease=lease, require_future=True)

    def release(self, lease):
        state, revision = self._owned(lease)
        self._transition(revision, dict(state, owner=None, expires=0), lease=lease)

    def _transition(self, revision, state, **guards):
        try:
            self.backend.cas(self.scope, revision, state, **guards)
        except Conflict:
            raise
        except Exception as exc:
            raise UncertainTransition(state) from exc

    def resolve_transition(self, expected_state):
        """Read-only exact state resolution; False means not current, not failure."""
        current, _ = self.backend.read(self.scope)
        return current == expected_state

    def publish(self, lease, data, expected_parent, attempt_id):
        if not isinstance(attempt_id, str) or not 16 <= len(attempt_id) <= 128:
            raise ValueError('unique stable attempt id required')
        if not isinstance(data, bytes):
            raise TypeError('checkpoint must be bytes')
        state, revision = self._owned(lease)
        current = state['checkpoint']
        if (current['sha256'] if current else None) != expected_parent:
            raise Conflict('parent mismatch')
        sha = digest(data)
        # Backend contract: id is immutable, cannot overwrite an existing object.
        blob_id = self.backend.put_immutable(data)
        if self.backend.get_blob(blob_id) != data:
            raise ValueError('blob readback failed before publication')
        # Recheck fencing/expiry after potentially slow upload. CAS at the original
        # revision prevents renewal/other writers from invalidating this decision.
        latest, latest_revision = self._owned(lease)
        if latest_revision != revision:
            raise Conflict('controller changed during upload')
        receipt = dict(blob_id=blob_id, sha256=sha, bytes=len(data),
                       fence=lease.fence, owner=lease.owner, attempt_id=attempt_id,
                       parent_sha256=expected_parent)
        try:
            self.backend.cas(self.scope, revision, dict(latest, checkpoint=receipt), lease=lease)
        except Conflict:
            raise
        except Exception as exc:
            # A transport failure does not prove CAS did not take effect.
            raise UncertainCommit('resolve publication before retry', receipt) from exc
        try:
            if not self.resolve(receipt):
                raise ValueError('publication no longer current')
        except Exception as exc:
            raise UncertainCommit('published pointer requires resolution', receipt) from exc
        return receipt

    def _receipt_bytes(self, receipt):
        value = self.backend.get_blob(receipt['blob_id'])
        if len(value) != receipt['bytes'] or digest(value) != receipt['sha256']:
            raise ValueError('checkpoint integrity mismatch')
        return value

    def readback(self):
        state, _ = self.backend.read(self.scope)
        if state is None or state['checkpoint'] is None:
            return None
        return self._receipt_bytes(state['checkpoint'])

    def resolve(self, expected_receipt):
        """Verify this exact attempt using one controller snapshot, never retry CAS.

        False means NOT CURRENT, not proof that an earlier publication never
        occurred. The caller must not overwrite a newer checkpoint to retry.
        """
        state, _ = self.backend.read(self.scope)
        if state is None or state['checkpoint'] is None:
            return False
        if state['checkpoint'] != expected_receipt:
            return False
        self._receipt_bytes(state['checkpoint'])
        return True
