"""Governed, fileless private ChatGPT Task ingress via the existing Writer spool.

Only owner+Writer have write permission on the pinned private Google Sheet.
This adapter cannot authenticate a ChatGPT task or elevate a caller; role claims
remain subject to the canonical Writer. Human decisions, handoffs (which require
a Drive inbox file), private protocols and runner receipts stay excluded.
"""
from __future__ import annotations

import base64
import json
import re
from datetime import datetime, timezone

KINDS = frozenset({
    "BOARD_POST", "INTEGRITY_REPORT", "LEARNING_SIGNAL",
    "HYPOTHESIS_PROPOSAL", "LESSON_PROPOSAL", "SEMANTIC_BACKFILL",
    "DATA_BINDING", "RECIPE_BIND", "ROADMAP_ATTACH",
    "ROADMAP_CHARTER", "FAMILY_CHARTER", "MUTATION_PROPOSAL",
    "CONTEST", "VERDICT_REVIEW", "TEST_BATTERY",
    "FITNESS_REPORT", "NEXO_THOUGHT",
})
ROLES = frozenset({
    "PITIA", "LEARNER", "EXECUTOR", "ADVISOR", "ENGINEER",
    "REFEREE_1", "REFUTADOR", "GUARDIAO", "SENTINEL",
    "DAILY", "EMERGENT", "CONVERSA",
})
STABLE_RE = re.compile(r"^sched-v1-[a-z0-9-]{1,51}$")
ENC_RE = re.compile(r"^[A-Za-z0-9_-]+$")


class ScheduledSpoolError(ValueError):
    pass


def _no_duplicate_keys(pairs):
    out = {}
    for key, value in pairs:
        if key in out:
            raise ScheduledSpoolError("DUPLICATE_JSON_KEY")
        out[key] = value
    return out


def _nonfinite(_):
    raise ScheduledSpoolError("NONFINITE_JSON")


def validate_scheduled_envelope(row):
    """Return one governed envelope without changing source or Writer authority."""
    stable = row.get("stable_id")
    raw = row.get("envelope_b64url")
    if not isinstance(stable, str) or not STABLE_RE.fullmatch(stable):
        raise ScheduledSpoolError("STABLE_ID_INVALID")
    if not isinstance(raw, str) or not 1 <= len(raw) <= 32768 or not ENC_RE.fullmatch(raw):
        raise ScheduledSpoolError("ENCODING_INVALID")
    try:
        binary = base64.b64decode(raw + "=" * (-len(raw) % 4),
                                  altchars=b"-_", validate=True)
        if len(binary) > 24576:
            raise ScheduledSpoolError("ENVELOPE_TOO_LARGE")
        envelope = json.loads(binary.decode("utf-8"),
                              object_pairs_hook=_no_duplicate_keys,
                              parse_constant=_nonfinite)
    except (UnicodeError, ValueError) as error:
        if isinstance(error, ScheduledSpoolError):
            raise
        raise ScheduledSpoolError("JSON_INVALID") from None
    if type(envelope) is not dict or set(envelope) != {
        "kind", "source", "created_at", "intent_id", "payload",
    }:
        raise ScheduledSpoolError("ENVELOPE_FIELDS_INVALID")
    source, kind = envelope["source"], envelope["kind"]
    if type(source) is not str or source not in ROLES or row.get("role") != source:
        raise ScheduledSpoolError("ROLE_NOT_AUTHORIZED")
    if type(kind) is not str or kind not in KINDS:
        raise ScheduledSpoolError("KIND_NOT_AUTHORIZED")
    if type(envelope["payload"]) is not dict:
        raise ScheduledSpoolError("PAYLOAD_INVALID")
    intent = envelope["intent_id"]
    if type(intent) is not str or not intent or len(intent) > 160 or intent.strip() != intent:
        raise ScheduledSpoolError("INTENT_INVALID")
    created = envelope["created_at"]
    if type(created) is not str or not created.endswith(("Z", "+00:00")):
        raise ScheduledSpoolError("TIMESTAMP_INVALID")
    try:
        when = datetime.fromisoformat(created.replace("Z", "+00:00"))
        if when.tzinfo is None or when.utcoffset() != timezone.utc.utcoffset(when):
            raise ValueError("non UTC")
    except ValueError:
        raise ScheduledSpoolError("TIMESTAMP_INVALID") from None
    if kind == "MUTATION_PROPOSAL" and source != "EXECUTOR":
        raise ScheduledSpoolError("RESULT_ROLE_INVALID")
    if kind == "VERDICT_REVIEW" and source not in {"REFEREE_1", "REFUTADOR"}:
        raise ScheduledSpoolError("REVIEW_ROLE_INVALID")
    if kind == "CONTEST" and source not in {"REFEREE_1", "REFUTADOR", "SENTINEL"}:
        raise ScheduledSpoolError("CONTEST_ROLE_INVALID")
    return envelope
