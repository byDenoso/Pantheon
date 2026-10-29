"""Scientific selection projected from existing private Writer events.

No I/O, scheduler, lock or second queue lives here. ``select_next`` recommends;
concurrent producers coordinate through a STARTED reservation accepted by the
existing Writer and its canonical readback, after externally verifying that
the deployed Writer revision supports semantic admission. Literal transport
alone cannot establish this capability. An isolated authorized local calculation
can report CALCULATED directly or STARTED with execution_mode=LOCAL_ISOLATED.
That local marker deduplicates work but grants no distributed reservation.
This projection is not a lock or verification of deployed capability.

Opt-in event: MURAL.texto = ``NEXO_SCIENCE_V1 <JSON>`` or
RESULTADOS.metodo = {"NEXO_SCIENCE_V1": event,
                    "EXECUTOR_RECEIPT_V1": receipt}.
Every event binds schema, event_id, science_id, identity, kind, at and role to
its real row. Identity has a stable ``question`` key (not a paraphrase),
estimand, observable, data[{id,version,sha256}] and a material design object.
Bookkeeping and seeds do not change science_id. A separate equivalence digest
ignores the question label and data aliases while retaining the actual bytes,
estimand, observable and material design. No semantic similarity is claimed.

QUESTION provides activity, dependencies and optional priority. Each dependency
has id, status (verified/missing/failed), evidence, checked_at and expires_at.
STARTED provides run_id and lease_until, with optional execution_mode
LOCAL_ISOLATED or WRITER_COORDINATED (the backward-compatible default).
CALCULATED provides a real receipt,
numeric_result and artifact {uri,sha256}; externally checked durable bytes may
add verified_sha256 and verified_at. This module checks declarations, not bytes.
PERSISTED never establishes persistence: only a CALCULATED RESULTADOS row read
from the canonical stored index, complete receipt and explicit matching artifact
readback do. CLOSED/REFRAMED provide reason and evidence; RECONCILED can release
one unexecuted run only with outcome=not_executed and evidence in stored MURAL.

QUESTION may include an opportunity (rival predictions, discriminator, estimated
cost and information), and explicit prior_evidence links. An equivalent link
consumes a question only after matching the exact canonical source row digest;
it does not mint a calculation or upgrade an old claim. Unstructured historical
rows otherwise remain unclassified. ``previous`` accepts this function's
earlier projection plus only new/changed rows, avoiding reparsing unchanged IDs.
All limits fail explicitly; history is never silently dropped for selection.
"""
from __future__ import annotations

import copy
import datetime as dt
import hashlib
import json
import math
import re
from collections.abc import Mapping
from urllib.parse import urlsplit

SCHEMA = "NEXO_SCIENCE_V1"
PREFIX = SCHEMA + " "
STATE_SCHEMA = "NEXO_SCIENTIFIC_STATE_V1"
MAX_EVENTS = 1000000  # Existing Writer MAX_GRID_ROWS safety bound, not a pulse quota.
MAX_CELL = 100000
ROLES = {"S1", "S2", "S3", "S4", "S5", "S6", "S7", "P", "DENER"}
KINDS = {"QUESTION", "STARTED", "CALCULATED", "PERSISTED", "DEPENDENCY",
         "CLOSED", "REFRAMED", "RECONCILED"}
ACTIVITIES = {"E0", "E1", "E2", "E1-REVIEW", "QA", "TECH_CHECK", "SETUP", "HEARTBEAT"}
SCIENCE = {"E0", "E1", "E2", "E1-REVIEW"}
HASH = re.compile(r"^[a-f0-9]{64}$")
KEY = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:-]{5,127}$")
SCIENCE_KEY = re.compile(r"^science-[a-f0-9]{64}$")
IGNORED_IDENTITY_KEYS = {"task_id", "run_id", "seed", "random_seed", "seeds",
                         "code_version", "script_sha256", "created_at", "updated_at", "title"}


def _json(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True,
                      separators=(",", ":"), allow_nan=False)


def _text(value):
    return isinstance(value, str) and bool(value.strip())


def _timestamp(value):
    if isinstance(value, dt.datetime):
        result = value
    elif isinstance(value, str):
        result = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    else:
        raise ValueError("TIMESTAMP_INVALID")
    if result.tzinfo is None or result.utcoffset() is None:
        raise ValueError("TIMEZONE_REQUIRED")
    return result.astimezone(dt.timezone.utc)


def _clean_design(value):
    if isinstance(value, dict):
        if any(not isinstance(k, str) for k in value):
            raise ValueError("DESIGN_KEY_INVALID")
        return {k: _clean_design(v) for k, v in value.items()
                if k not in IGNORED_IDENTITY_KEYS}
    if isinstance(value, list):
        return [_clean_design(v) for v in value]
    if value is None or isinstance(value, (str, bool, int)):
        return value
    if isinstance(value, float) and math.isfinite(value):
        return value
    raise ValueError("DESIGN_VALUE_INVALID")


def _identity(identity):
    if not isinstance(identity, dict):
        raise ValueError("IDENTITY_REQUIRED")
    required = {"question", "estimand", "observable", "data", "design"}
    if set(identity) - required - IGNORED_IDENTITY_KEYS:
        raise ValueError("UNKNOWN_IDENTITY_FIELD")
    if not all(_text(identity.get(k)) for k in ("question", "estimand", "observable")):
        raise ValueError("STABLE_SCIENTIFIC_IDENTITY_REQUIRED")
    data = identity.get("data")
    if not isinstance(data, list) or not data:
        raise ValueError("DATA_IDENTITY_REQUIRED")
    canonical_data = []
    for item in data:
        if (not isinstance(item, dict) or set(item) != {"id", "version", "sha256"}
                or not _text(item.get("id")) or not _text(item.get("version"))
                or not isinstance(item.get("sha256"), str) or not HASH.fullmatch(item["sha256"])):
            raise ValueError("DATA_IDENTITY_INVALID")
        canonical_data.append(dict(item))
    if len({_json(item) for item in canonical_data}) != len(canonical_data):
        raise ValueError("DUPLICATE_DATA_IDENTITY")
    design = identity.get("design")
    if not isinstance(design, dict) or not _clean_design(design):
        raise ValueError("MATERIAL_DESIGN_REQUIRED")
    return {"question": identity["question"], "estimand": identity["estimand"],
            "observable": identity["observable"],
            "data": sorted(canonical_data, key=_json), "design": _clean_design(design)}


def scientific_id(identity):
    """Fingerprint an explicit stable scientific identity, not execution metadata."""
    return "science-" + hashlib.sha256(_json(_identity(identity)).encode()).hexdigest()


def equivalence_id(identity):
    """Detect structural repeats, never infer synonymy from scientific prose.

    A question/run/title or source alias is not a physical change. Bytes are
    compared independently of their storage label/release label. Material
    selection, likelihood, covariance, priors and controls belong in design.
    A curator must link semantically equivalent but structurally different
    historical descriptions explicitly through prior_evidence.
    """
    value = _identity(identity)
    value.pop("question")
    value["data"] = sorted({item["sha256"] for item in value["data"]})
    return "equivalent-" + hashlib.sha256(_json(value).encode()).hexdigest()


def canonical_row_sha256(row):
    """Digest the exact existing Writer row; no source text interpretation."""
    if not isinstance(row, (list, tuple)) or not all(isinstance(v, str) for v in row):
        raise ValueError("ROW_SCHEMA_INVALID")
    return hashlib.sha256(_json(list(row)).encode()).hexdigest()


def _strict_pairs(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("DUPLICATE_JSON_KEY")
        result[key] = value
    return result


def _loads(raw):
    return json.loads(raw, object_pairs_hook=_strict_pairs,
                      parse_constant=lambda _: (_ for _ in ()).throw(ValueError("NONFINITE_JSON")))


def _has_number(value):
    if isinstance(value, bool):
        return False
    if isinstance(value, (int, float)):
        return math.isfinite(value)
    if isinstance(value, dict):
        return any(_has_number(v) for v in value.values())
    if isinstance(value, list):
        return any(_has_number(v) for v in value)
    return False


def _dependency(value, at):
    if (not isinstance(value, dict) or not _text(value.get("id"))
            or value.get("status") not in {"verified", "missing", "failed"}
            or not _text(value.get("evidence"))):
        raise ValueError("DEPENDENCY_EVIDENCE_REQUIRED")
    checked = _timestamp(value.get("checked_at"))
    expiry = _timestamp(value.get("expires_at"))
    if checked > at or expiry <= checked:
        raise ValueError("DEPENDENCY_TIME_INVALID")
    return dict(value)


def _opportunity(value):
    if not isinstance(value, dict):
        raise ValueError("OPPORTUNITY_INVALID")
    if not all(_text(value.get(k)) for k in ("physical_question", "discriminator")):
        raise ValueError("DISCRIMINATING_QUESTION_REQUIRED")
    hypotheses = value.get("hypotheses")
    if (not isinstance(hypotheses, list) or not 2 <= len(hypotheses) <= 16
            or any(not isinstance(h, dict) or not _text(h.get("id"))
                   or not _text(h.get("prediction")) for h in hypotheses)
            or len({h["id"] for h in hypotheses}) != len(hypotheses)):
        raise ValueError("RIVAL_PREDICTIONS_REQUIRED")
    information, cost = value.get("expected_information"), value.get("cost")
    if (not isinstance(information, dict) or not _text(information.get("basis"))
            or isinstance(information.get("rating"), bool)
            or not isinstance(information.get("rating"), (int, float))
            or not math.isfinite(information["rating"])
            or not 0 <= information["rating"] <= 1):
        raise ValueError("INFORMATION_ESTIMATE_INVALID")
    if (not isinstance(cost, dict) or not _text(cost.get("basis"))
            or isinstance(cost.get("seconds"), bool)
            or not isinstance(cost.get("seconds"), (int, float))
            or not math.isfinite(cost["seconds"]) or cost["seconds"] <= 0):
        raise ValueError("COST_ESTIMATE_INVALID")
    literature = value.get("literature")
    if (not isinstance(literature, dict) or literature.get("status") not in {"searched", "pending"}
            or not _text(literature.get("scope"))
            or not isinstance(literature.get("references"), list)
            or any(not _text(ref) for ref in literature["references"])
            or (literature["status"] == "searched" and not literature["references"])):
        raise ValueError("LITERATURE_SCOPE_REQUIRED")
    return copy.deepcopy(value)


def _prior_evidence(value, at):
    if not isinstance(value, list) or len(value) > 64:
        raise ValueError("PRIOR_EVIDENCE_INVALID")
    result = []
    for link in value:
        if (not isinstance(link, dict) or link.get("tab") not in {"MURAL", "RESULTADOS"}
                or not _text(link.get("stable_id"))
                or not isinstance(link.get("row_sha256"), str) or not HASH.fullmatch(link["row_sha256"])
                or link.get("relation") not in {"equivalent", "informs"}
                or not _text(link.get("basis")) or _timestamp(link.get("checked_at")) > at):
            raise ValueError("PRIOR_EVIDENCE_INVALID")
        result.append(dict(link))
    return result


def _requirements_schema(values, at):
    """Legacy string dependencies require persisted; explicit local uses can opt in."""
    if not isinstance(values, list) or len(values) > 64:
        raise ValueError("REQUIRES_INVALID")
    for value in values:
        if isinstance(value, str) and SCIENCE_KEY.fullmatch(value):
            continue
        if (not isinstance(value, dict) or not isinstance(value.get("science_id"), str)
                or not SCIENCE_KEY.fullmatch(value["science_id"])
                or value.get("minimum_state") not in {"calculated", "persisted"}):
            raise ValueError("REQUIRES_INVALID")
        if value["minimum_state"] == "calculated":
            evidence = value.get("artifact_readback")
            if (not isinstance(evidence, dict) or not _text(evidence.get("uri"))
                    or not isinstance(evidence.get("sha256"), str) or not HASH.fullmatch(evidence["sha256"])
                    or not _text(evidence.get("evidence"))
                    or _timestamp(evidence.get("checked_at")) > at
                    or _timestamp(evidence.get("expires_at")) <= _timestamp(evidence["checked_at"])):
                raise ValueError("DEPENDENT_ARTIFACT_READBACK_REQUIRED")


def _interpretation(value):
    required = ("physical_meaning", "hypothesis_update", "effect_origin",
                "not_identifiable", "next_observation")
    if not isinstance(value, dict) or not all(_text(value.get(k)) for k in required):
        raise ValueError("PHYSICAL_INTERPRETATION_INVALID")
    return dict(value)


def _receipt(event):
    receipt = event.get("receipt")
    if (not isinstance(receipt, dict) or receipt.get("run_id") != event.get("run_id")
            or not _text(receipt.get("runtime")) or receipt.get("class") not in ACTIVITIES):
        raise ValueError("EXECUTOR_RECEIPT_REQUIRED")
    activity = event["activity"]
    if receipt["class"] != activity and not (activity == "E1-REVIEW" and receipt["class"] == "E1"):
        raise ValueError("RECEIPT_ACTIVITY_MISMATCH")
    for field in ("script_sha256", "output_sha256"):
        if not isinstance(receipt.get(field), str) or not HASH.fullmatch(receipt[field]):
            raise ValueError("RECEIPT_HASH_INVALID")
    hashes = receipt.get("input_hashes")
    if (not isinstance(hashes, dict) or not hashes
            or not all(_text(k) and isinstance(v, str) and HASH.fullmatch(v) for k, v in hashes.items())):
        raise ValueError("INPUT_HASHES_REQUIRED")
    if not {v["sha256"] for v in event["identity"]["data"]}.issubset(set(hashes.values())):
        raise ValueError("RECEIPT_DATA_MISMATCH")
    artifact = event.get("artifact")
    if (not isinstance(artifact, dict) or not _text(artifact.get("uri"))
            or artifact.get("sha256") != receipt["output_sha256"]):
        raise ValueError("OUTPUT_ARTIFACT_MISMATCH")
    if "numeric_result" not in event or not _has_number(event["numeric_result"]):
        raise ValueError("NUMERIC_RESULT_REQUIRED")
    _json(event["numeric_result"])
    return receipt


def _artifact_verified(event, now):
    artifact = event["artifact"]
    if artifact.get("verified_sha256") != event["receipt"]["output_sha256"]:
        return False
    try:
        checked = _timestamp(artifact.get("verified_at"))
        uri = urlsplit(artifact["uri"])
        return (_timestamp(event["at"]) <= checked <= now and uri.scheme == "https"
                and bool(uri.hostname) and not uri.username and not uri.password)
    except ValueError:
        return False


def _validate(event, tab, stable_id, row, now):
    if not isinstance(event, dict) or event.get("schema") != SCHEMA:
        raise ValueError("SCIENCE_SCHEMA_INVALID")
    if event.get("event_id") != stable_id:
        raise ValueError("EVENT_ROW_ID_MISMATCH")
    identity = _identity(event.get("identity"))
    if event.get("science_id") != scientific_id(identity):
        raise ValueError("SCIENCE_ID_MISMATCH")
    sender = re.match(r"^(S[1-7]|P|DENER)(?:$|\s|\|)", row[1])
    if event.get("role") not in ROLES or not sender or event["role"] != sender[1]:
        raise ValueError("EVENT_ROLE_MISMATCH")
    at = _timestamp(event.get("at"))
    if at > now:
        raise ValueError("FUTURE_EVENT")
    kind = event.get("kind")
    if kind not in KINDS:
        raise ValueError("EVENT_KIND_INVALID")
    if kind == "STARTED" and tab != "MURAL":
        raise ValueError("RESERVATION_REQUIRES_MURAL")
    event = dict(event, identity=identity)
    if kind in {"QUESTION", "CALCULATED"} and event.get("activity") not in ACTIVITIES:
        raise ValueError("ACTIVITY_INVALID")
    if kind == "QUESTION":
        deps = event.get("dependencies", [])
        if not isinstance(deps, list) or len(deps) > 64:
            raise ValueError("DEPENDENCIES_INVALID")
        event["dependencies"] = [_dependency(d, at) for d in deps]
        if len({d["id"] for d in deps}) != len(deps):
            raise ValueError("DUPLICATE_DEPENDENCY")
        priority = event.get("priority", {})
        if not isinstance(priority, dict) or set(priority) - {"originality", "discrimination", "impact", "cost"}:
            raise ValueError("PRIORITY_INVALID")
        for key, value in priority.items():
            if (isinstance(value, bool) or not isinstance(value, (int, float))
                    or not math.isfinite(value) or value < 0 or (key == "cost" and value <= 0)):
                raise ValueError("PRIORITY_INVALID")
        score = (priority.get("originality", 0) + 2 * priority.get("discrimination", 0)
                 + priority.get("impact", 0)) / priority.get("cost", 1)
        if not math.isfinite(score):
            raise ValueError("PRIORITY_INVALID")
        _requirements_schema(event.get("requires", []), at)
        if "opportunity" in event:
            event["opportunity"] = _opportunity(event["opportunity"])
        event["prior_evidence"] = _prior_evidence(event.get("prior_evidence", []), at)
    elif kind == "DEPENDENCY":
        _dependency(event.get("dependency"), at)
    elif kind in {"STARTED", "CALCULATED", "PERSISTED", "RECONCILED"}:
        if not _text(event.get("run_id")):
            raise ValueError("RUN_ID_REQUIRED")
        if kind == "STARTED":
            if _timestamp(event.get("lease_until")) <= at:
                raise ValueError("LEASE_INVALID")
            if event.get("execution_mode", "WRITER_COORDINATED") not in ("LOCAL_ISOLATED", "WRITER_COORDINATED"):
                raise ValueError("EXECUTION_MODE_INVALID")
        if kind == "CALCULATED":
            _receipt(event)
            if "interpretation" in event:
                event["interpretation"] = _interpretation(event["interpretation"])
        if kind == "RECONCILED" and (event.get("outcome") != "not_executed" or not _text(event.get("evidence"))):
            raise ValueError("RECONCILIATION_EVIDENCE_REQUIRED")
    elif not _text(event.get("reason")) or not _text(event.get("evidence")):
        raise ValueError("CLOSURE_EVIDENCE_REQUIRED")
    _json(event)
    return event


def _extract(tab, row):
    raw = row[3 if tab == "MURAL" else 5]
    if len(raw) > MAX_CELL:
        raise ValueError("SCIENCE_CELL_TOO_LARGE")
    if tab == "MURAL":
        return _loads(raw[len(PREFIX):]) if raw.startswith(PREFIX) else None
    if not raw.lstrip().startswith("{") or '"NEXO_SCIENCE_V1"' not in raw:
        return None
    value = _loads(raw)
    if not isinstance(value, dict) or SCHEMA not in value:
        return None
    event = value[SCHEMA]
    if isinstance(event, dict) and "EXECUTOR_RECEIPT_V1" in value:
        if "receipt" in event and event["receipt"] != value["EXECUTOR_RECEIPT_V1"]:
            raise ValueError("RECEIPT_CONFLICT")
        event = dict(event, receipt=value["EXECUTOR_RECEIPT_V1"])
    return event


def science_event(data, *, now=None):
    """Read one existing Writer envelope; return None for untyped legacy rows.

    Raises ValueError for malformed opted-in science. This is schema checking,
    never authorization, execution proof or a distributed reservation.
    """
    if not isinstance(data, dict):
        raise ValueError("ROW_SCHEMA_INVALID")
    tab, stable_id, row = data.get("tab"), data.get("stable_id"), data.get("values")
    width = {"MURAL": 8, "RESULTADOS": 10}.get(tab)
    if (not width or not isinstance(stable_id, str) or not KEY.fullmatch(stable_id)
            or not isinstance(row, (list, tuple)) or len(row) != width
            or not all(isinstance(v, str) for v in row)
            or row[7 if tab == "MURAL" else 3] != stable_id):
        raise ValueError("ROW_SCHEMA_INVALID")
    event = _extract(tab, row)
    return None if event is None else _validate(
        event, tab, stable_id, row, _timestamp(now or dt.datetime.now(dt.timezone.utc)))


def reservation_error(state, event):
    """Validate STARTED against canonical state before a serial Writer append.

    The caller must exclude not-yet-admitted queue proposals from state and
    perform readback after each acceptance before considering another one.
    None permits an append/reconciliation, never a second execution of a receipt.
    LOCAL_ISOLATED records a local start, never a distributed lock. Coordinated
    use additionally requires external verification of the deployed Writer
    admission capability; this pure projection cannot establish that capability.
    """
    if event is None or event.get("kind") != "STARTED":
        return None
    question = state["questions"].get(event["science_id"])
    if not question:
        return "QUESTION_NOT_DECLARED"
    if question["reconciliation_required"]:
        return "SCIENTIFIC_RECONCILIATION_REQUIRED"
    key = "MURAL:" + event["event_id"]
    prior = state.get("_records", {}).get(key)
    if prior and prior["canonical"] and prior["event"] == event:
        return None  # Same accepted reservation, not a new admission.
    if question["lifecycle"] != "eligible" or question["role"] != event["role"]:
        return "SCIENTIFIC_QUESTION_NOT_ELIGIBLE"
    return None


def _rows(stored, pending):
    for tab in ("MURAL", "RESULTADOS"):
        index = stored.get(tab, {})
        if not isinstance(index, Mapping):
            raise ValueError("STORED_INDEX_REQUIRED")
        for stable_id, row in index.items():
            yield tab, stable_id, row, True, "", stable_id in getattr(index, "conflicts", set())
    for item in pending:
        if not isinstance(item, dict):
            raise ValueError("PENDING_ENVELOPE_INVALID")
        data = item.get("data", item)
        if not isinstance(data, dict):
            raise ValueError("PENDING_DATA_INVALID")
        yield data.get("tab"), data.get("stable_id"), data.get("values"), False, item.get("state", ""), False


def build_state(stored, pending, *, now=None, previous=None):
    """Build a bounded disposable projection; optional previous + delta is incremental."""
    now = _timestamp(now or dt.datetime.now(dt.timezone.utc))
    if not isinstance(stored, Mapping):
        raise ValueError("STORED_REQUIRED")
    if previous is not None and previous.get("schema") != STATE_SCHEMA:
        raise ValueError("PREVIOUS_STATE_INVALID")
    if previous is not None and _timestamp(previous.get("as_of")) > now:
        raise ValueError("PREVIOUS_STATE_FROM_FUTURE")
    records = copy.deepcopy((previous or {}).get("_records", {}))
    incidents = list((previous or {}).get("_ingest_incidents", []))
    invalid = set((previous or {}).get("_invalid_science_ids", []))
    parsed = unchanged = 0
    for count, (tab, stable_id, raw, canonical, transport, conflict) in enumerate(_rows(stored, pending), 1):
        if count > MAX_EVENTS * 2:
            raise ValueError("INPUT_EVENT_LIMIT_EXCEEDED")
        event = None
        try:
            width = {"MURAL": 8, "RESULTADOS": 10}.get(tab)
            if (not width or not isinstance(stable_id, str)
                    or not isinstance(raw, (list, tuple)) or len(raw) != width
                    or not all(isinstance(v, str) for v in raw)
                    or raw[7 if tab == "MURAL" else 3] != stable_id):
                raise ValueError("ROW_SCHEMA_INVALID")
            key = tab + ":" + stable_id
            if not isinstance(transport, str):
                raise ValueError("TRANSPORT_STATE_INVALID")
            digest = canonical_row_sha256(raw)
            old = records.get(key)
            # Historical RESULTADOS titles are also TargetIndex keys and may
            # contain spaces/punctuation. Opt-in must precede the new-event ID
            # contract; legacy text never establishes scientific lifecycle.
            event = old["event"] if old and old["digest"] == digest else _extract(tab, raw)
            if event is None and not (old and old.get("event")):
                if len(records) >= MAX_EVENTS and key not in records:
                    raise ValueError("STATE_EVENT_LIMIT_EXCEEDED")
                records[key] = {"digest": digest, "event": None,
                                "canonical": canonical or bool(old and old["canonical"]),
                                "tab": tab, "transport": transport, "rejected": False,
                                "conflict": conflict or bool(old and old.get("conflict"))}
                unchanged += int(bool(old and old["digest"] == digest))
                parsed += int(not old or old["digest"] != digest)
                continue
            if not KEY.fullmatch(stable_id):
                raise ValueError("ROW_SCHEMA_INVALID")
            if old and old["digest"] != digest:
                if old.get("event"):
                    invalid.add(old["event"]["science_id"])
                raise ValueError("EVENT_CONTENT_CONFLICT")
            if old and not conflict:
                old["canonical"] = old["canonical"] or canonical
                old["transport"] = transport or old["transport"]
                rejected = (old.get("event") and old["event"]["kind"] == "STARTED"
                            and transport.startswith("INVALID:SCIENCE_RESERVATION_"))
                old["rejected"] = bool((old.get("rejected") or rejected) and not old["canonical"])
                if old["rejected"]:
                    incident = {"event_id": stable_id, "tab": tab, "reason": transport}
                    if incident not in incidents:
                        incidents.append(incident)
                if (old.get("event") and not old["canonical"]
                        and not old["rejected"]
                        and transport.startswith(("INVALID:", "PENDING_SYNC", "CONFLICT"))):
                    invalid.add(old["event"]["science_id"])
                unchanged += 1
                continue
            if conflict:
                raise ValueError("CANONICAL_ID_CONFLICT")
            rejected = False
            if event is not None:
                event = _validate(event, tab, stable_id, raw, now)
                rejected = (not canonical and event["kind"] == "STARTED"
                            and transport.startswith("INVALID:SCIENCE_RESERVATION_"))
                if rejected:
                    incident = {"event_id": stable_id, "tab": tab, "reason": transport}
                    if incident not in incidents:
                        incidents.append(incident)
                elif transport.startswith(("INVALID:", "PENDING_SYNC", "CONFLICT")):
                    raise ValueError("TRANSPORT_REQUIRES_RECONCILIATION")
            if len(records) >= MAX_EVENTS and key not in records:
                raise ValueError("STATE_EVENT_LIMIT_EXCEEDED")
            records[key] = {"digest": digest, "event": event, "canonical": canonical,
                            "tab": tab, "transport": transport, "rejected": rejected}
            parsed += 1
        except (TypeError, ValueError, OverflowError) as exc:
            if str(exc).endswith("LIMIT_EXCEEDED"):
                raise
            if isinstance(event, dict):
                try:
                    invalid.add(scientific_id(event.get("identity")))
                except (TypeError, ValueError):
                    pass
            incident = {"event_id": stable_id, "tab": tab, "reason": str(exc)}
            if incident not in incidents:
                incidents.append(incident)
    groups = {}
    for key, record in records.items():
        if record["event"] is not None and not record.get("rejected"):
            groups.setdefault(record["event"]["science_id"], []).append((key, record))
    questions = {sid: _fold(sid, group, now, sid in invalid) for sid, group in groups.items()}
    _resolve_prior_evidence(questions, records)
    _requirements(questions, now)
    _equivalent_questions(questions)
    metrics = {name: sum(q["lifecycle"] == name for q in questions.values())
               for name in ("eligible", "running", "calculated", "persisted", "blocked", "closed", "reframed")}
    # Closure is independent of the result's transport lifecycle: closing a
    # question never hides its existing persisted result or pending evidence.
    metrics.update({"calculated": sum(q["result_state"] == "calculated" for q in questions.values()),
                    "persisted": sum(q["result_state"] == "persisted" for q in questions.values()),
                    "distinct_quantitative": len({q["equivalence_id"] for q in questions.values()
                                                  if q["has_calculation"] and not q["reconciliation_required"]
                                                  and q["activity"] in {"E0", "E1", "E2"}}),
                    "quantitative_reviews": sum(q["has_calculation"] and q["activity"] == "E1-REVIEW" for q in questions.values()),
                    "reconciliation_required": sum(q["reconciliation_required"] for q in questions.values()),
                    "records_persisted": sum(q["record_persisted"] for q in questions.values()),
                    "with_complete_receipt": sum(q["has_calculation"] for q in questions.values()),
                    "duplicate_executions": _duplicate_executions(questions),
                    "historical_equivalents_reused": sum(bool(q["historical_equivalent"]) for q in questions.values()),
                    "equivalent_candidates_suppressed": sum(bool(q["duplicate_of"]) for q in questions.values())})
    return {"schema": STATE_SCHEMA, "as_of": now.isoformat(), "questions": questions,
            "metrics": metrics, "incidents": incidents,
            "legacy_unclassified": sum(r["event"] is None for r in records.values()),
            "seen_events": {k: v["digest"] for k, v in records.items()},
            "ingestion": {"parsed": parsed, "unchanged": unchanged},
            "_records": records, "_ingest_incidents": incidents,
            "_invalid_science_ids": sorted(invalid)}


def _fold(sid, group, now, invalid):
    ordered = sorted(group, key=lambda pair: (_timestamp(pair[1]["event"]["at"]), pair[0]))
    first = ordered[0][1]["event"]
    q = {"science_id": sid, "identity": first["identity"], "role": first["role"],
         "title": first.get("title", first["identity"]["question"]), "activity": None,
         "lifecycle": "blocked", "scientific_status": "UNASSESSED", "reasons": [],
         "reconciliation_required": invalid, "record_persisted": False,
         "artifact_verified": False, "has_calculation": False, "run_id": None,
         "calculated_runs": [], "event_ids": [], "persisted_event_ids": [],
         "requires": [], "dependencies": {}, "priority": {}, "first_at": first["at"],
         "result_state": None, "execution_authorized": False,
         "equivalence_id": equivalence_id(first["identity"]), "duplicate_of": None,
         "opportunity": None, "prior_evidence": [], "evidence_links": [],
         "historical_equivalent": False, "interpretation": None,
         "output_hashes": [], "canonical_question": False}
    question_seen = False
    starts, released, calculated, closed = {}, set(), [], None
    for _, record in ordered:
        event = record["event"]
        kind = event["kind"]
        q["event_ids"].append(event["event_id"])
        if event["role"] != q["role"]:
            q["reconciliation_required"] = True
            q["reasons"].append("SCIENTIFIC_OWNER_CONFLICT")
        if kind == "QUESTION":
            question_seen = True
            q["canonical_question"] |= record["canonical"]
            if q["activity"] not in (None, event["activity"]):
                q["reconciliation_required"] = True
                q["reasons"].append("ACTIVITY_CONFLICT")
            q.update(activity=event["activity"], priority=event.get("priority", {}),
                     title=event.get("title", q["title"]), requires=event.get("requires", []))
            q["dependencies"].update({d["id"]: d for d in event["dependencies"]})
            if "opportunity" in event:
                q["opportunity"] = event["opportunity"]
            for link in event.get("prior_evidence", []):
                if link not in q["prior_evidence"]:
                    q["prior_evidence"].append(link)
        elif kind == "DEPENDENCY":
            dependency = event["dependency"]
            q["dependencies"][dependency["id"]] = dependency
        elif kind == "STARTED":
            starts[event["run_id"]] = record
        elif kind == "RECONCILED" and record["canonical"] and record["tab"] == "MURAL":
            if event["run_id"] in starts:
                released.add(event["run_id"])
        elif kind == "CALCULATED":
            calculated.append(record)
            if q["activity"] not in (None, event["activity"]):
                q["reconciliation_required"] = True
                q["reasons"].append("ACTIVITY_CONFLICT")
            q["activity"] = event["activity"]
            q["scientific_status"] = event.get("scientific_status", "UNASSESSED")
            q["interpretation"] = event.get("interpretation", q["interpretation"])
        elif kind in {"CLOSED", "REFRAMED"} and record["canonical"]:
            closed = kind.lower()
    if invalid:
        q["reasons"].append("INVALID_OR_CONFLICTING_EVENT")
    if calculated:
        q["has_calculation"] = True
        q["calculated_runs"] = sorted({r["event"]["run_id"] for r in calculated})
        q["run_id"] = calculated[-1]["event"]["run_id"]
        hashes_by_run = {}
        for record in calculated:
            event = record["event"]
            hashes_by_run.setdefault(event["run_id"], set()).add(event["receipt"]["output_sha256"])
            if event["receipt"]["output_sha256"] not in q["output_hashes"]:
                q["output_hashes"].append(event["receipt"]["output_sha256"])
            in_results = record["canonical"] and record["tab"] == "RESULTADOS"
            checked = _artifact_verified(event, now)
            q["record_persisted"] |= in_results
            q["artifact_verified"] |= checked
            if in_results and checked:
                q["persisted_event_ids"].append(event["event_id"])
        if any(len(v) > 1 for v in hashes_by_run.values()):
            q["reconciliation_required"] = True
            q["reasons"].append("RUN_OUTPUT_CONFLICT")
        q["result_state"] = "persisted" if q["persisted_event_ids"] else "calculated"
        q["lifecycle"] = closed or q["result_state"]
        if q["result_state"] == "calculated":
            q["reasons"].append("PERSISTENCE_PENDING")
    elif closed:
        q["lifecycle"] = closed
    else:
        active = {rid: r for rid, r in starts.items() if rid not in released}
        if active:
            q["lifecycle"] = "running"
            q["run_id"] = sorted(active)[-1]
            local_execution = any(r["event"].get("execution_mode") == "LOCAL_ISOLATED"
                                  for r in active.values())
            q["execution_authorized"] = (question_seen and len(active) == 1 and
                not local_execution and
                all(r["canonical"] and r["tab"] == "MURAL" for r in active.values()))
            if local_execution:
                q["reasons"].append("LOCAL_EXECUTION_NOT_DISTRIBUTED_RESERVATION")
            elif not q["execution_authorized"]:
                q["reasons"].append("RESERVATION_READBACK_PENDING")
            if any(_timestamp(r["event"]["lease_until"]) <= now for r in active.values()):
                q["reconciliation_required"] = True
                q["reasons"].append("LEASE_EXPIRED_RECONCILE")
            if len(active) > 1:
                q["reconciliation_required"] = True
                q["reasons"].append("CONCURRENT_EXECUTIONS")
        elif question_seen:
            q["lifecycle"] = "eligible"
            if not q["dependencies"]:
                q["reasons"].append("READINESS_EVIDENCE_MISSING")
            for dependency in q["dependencies"].values():
                if _timestamp(dependency["expires_at"]) <= now:
                    q["reasons"].append("DEPENDENCY_RECHECK_REQUIRED:" + dependency["id"])
                elif dependency["status"] != "verified":
                    q["reasons"].append("DEPENDENCY_MISSING:" + dependency["id"])
            if q["activity"] not in SCIENCE:
                q["reasons"].append("NONSCIENTIFIC_ACTIVITY")
            if q["reasons"] or q["reconciliation_required"]:
                q["lifecycle"] = "blocked"
        else:
            q["reasons"].append("QUESTION_NOT_DECLARED")
    q["reasons"] = sorted(set(q["reasons"]))
    q["execution_authorized"] &= not q["reconciliation_required"]
    priority = q["priority"]
    q["score"] = (priority.get("originality", 0) + 2 * priority.get("discrimination", 0)
                  + priority.get("impact", 0)) / priority.get("cost", 1)
    q["score_basis"] = {"kind": "DECLARED_HEURISTIC", "cost_unit": "relative_cost",
                        "formula": "(originality + 2 * discrimination + impact) / cost",
                        "measured_information_gain": False}
    if q["opportunity"] is not None:
        opportunity = q["opportunity"]
        # This is a prioritization judgment, not a forecasted Bayes factor,
        # statistical power or number of independent scientific results.
        novelty = priority.get("originality", 0) if opportunity["literature"]["status"] == "searched" else 0
        q["score"] = (novelty + 2 * opportunity["expected_information"]["rating"]
                      + priority.get("impact", 0)) / opportunity["cost"]["seconds"]
        if not math.isfinite(q["score"]):
            q["reconciliation_required"] = True
            q["reasons"].append("PRIORITY_OVERFLOW")
            q["score"] = 0.0
        q["score_basis"] = {"kind": "DECLARED_HEURISTIC", "cost_unit": "estimated_seconds",
                            "formula": "(searched_originality + 2 * information_rating + impact) / estimated_seconds",
                            "measured_information_gain": False,
                            "information_basis": opportunity["expected_information"]["basis"],
                            "cost_basis": opportunity["cost"]["basis"],
                            "literature_status": opportunity["literature"]["status"]}
    q["evidence_status"] = "RECEIPT_COMPLETE_NOT_INDEPENDENTLY_REPLAYED" if calculated else "NO_CALCULATION_RECEIPT"
    q["next_action"] = _action(q)
    return q


def _resolve_prior_evidence(questions, records):
    """Bridge reviewed history only by an explicit comparison and exact readback."""
    for q in questions.values():
        for link in q["prior_evidence"]:
            record = records.get(link["tab"] + ":" + link["stable_id"])
            verified = bool(record and record["canonical"] and not record.get("conflict")
                            and record["digest"] == link["row_sha256"])
            q["evidence_links"].append(dict(link, source_readback_verified=verified,
                                           equivalence_basis="EXPLICIT_REVIEW_NOT_TEXT_INFERENCE"))
            if link["relation"] == "equivalent":
                if verified:
                    q["historical_equivalent"] = True
                    q["reasons"].append("HISTORICAL_EQUIVALENT_REUSE:" + link["stable_id"])
                elif q["lifecycle"] == "eligible":
                    q["reasons"].append("PRIOR_EQUIVALENCE_READBACK_REQUIRED:" + link["stable_id"])
                    q["lifecycle"] = "blocked"
        if q["historical_equivalent"]:
            # Suppress repeated execution without fabricating a receipt, new
            # result, scientific conclusion, artifact check or persistence.
            # Reusing an exact historical result needs its source readback,
            # not fresh inputs for an execution that must never be repeated.
            # Keep active/finished calculations and unresolved conflicts intact.
            if q["lifecycle"] in {"eligible", "blocked"} and not q["reconciliation_required"]:
                q["lifecycle"] = "closed"
            q["execution_authorized"] = False
        q["reasons"] = sorted(set(q["reasons"]))
        q["next_action"] = _action(q)


def _equivalent_questions(questions):
    groups = {}
    for q in questions.values():
        groups.setdefault(q["equivalence_id"], []).append(q)
    for group in groups.values():
        if len(group) < 2:
            continue
        uncertain = [q for q in group if q["reconciliation_required"] or any(
                     reason.startswith("PRIOR_EQUIVALENCE_READBACK_REQUIRED:") for reason in q["reasons"])]
        if uncertain:
            for q in group:
                if q["lifecycle"] == "eligible":
                    q["lifecycle"] = "blocked"
                    q["reasons"].append("EQUIVALENT_EVIDENCE_RECONCILIATION_REQUIRED")
                    q["next_action"] = _action(q)
        consumed = [q for q in group if q["has_calculation"] or q["historical_equivalent"]
                    or q["lifecycle"] in {"closed", "reframed"}]
        running = [q for q in group if q["lifecycle"] == "running"]
        # Keep the earliest actual question when two producers merely rename
        # the same experiment. A pending duplicate cannot displace its source.
        available = consumed or running or [q for q in group if q["lifecycle"] == "eligible"] or group
        representative = min(available, key=lambda q: (not q["canonical_question"],
                              _timestamp(q["first_at"]), q["science_id"]))
        for q in group:
            q["equivalent_science_ids"] = sorted(other["science_id"] for other in group if other is not q)
            if q is representative:
                continue
            q["duplicate_of"] = representative["science_id"]
            if q["lifecycle"] == "eligible":
                q["lifecycle"] = "blocked"
                reason = "EQUIVALENT_ALREADY_TESTED" if consumed else "EQUIVALENT_RUNNING" if running else "EQUIVALENT_CANDIDATE"
                q["reasons"].append(reason + ":" + representative["science_id"])
            q["execution_authorized"] = False
            q["next_action"] = _action(q)
        if len(running) > 1:
            for q in running:
                q["reconciliation_required"] = True
                q["execution_authorized"] = False
                q["reasons"].append("EQUIVALENT_CONCURRENT_EXECUTIONS")
                q["next_action"] = _action(q)


def _duplicate_executions(questions):
    groups = {}
    for q in questions.values():
        groups.setdefault(q["equivalence_id"], set()).update(q["calculated_runs"])
    return sum(max(0, len(runs) - 1) for runs in groups.values())


def _requirements(questions, now):
    for q in questions.values():
        if q["lifecycle"] != "eligible":
            continue
        for requirement in q["requires"]:
            sid = requirement if isinstance(requirement, str) else requirement["science_id"]
            other = questions.get(sid)
            eligible = bool(other and other["result_state"] == "persisted" and not other["reconciliation_required"])
            if isinstance(requirement, dict) and requirement["minimum_state"] == "calculated":
                readback = requirement["artifact_readback"]
                eligible = bool(other and other["has_calculation"] and not other["reconciliation_required"]
                                and readback["sha256"] in other["output_hashes"]
                                and _timestamp(readback["checked_at"]) <= now < _timestamp(readback["expires_at"]))
            if not eligible:
                q["reasons"].append("QUESTION_DEPENDENCY_PENDING:" + sid)
        if q["reasons"]:
            q["lifecycle"] = "blocked"
            q["next_action"] = _action(q)


def _action(question):
    if question["reconciliation_required"]:
        return "RECONCILE " + question["science_id"] + "; do not re-execute"
    if question.get("historical_equivalent"):
        return "REUSE exact historical evidence; select a materially distinct question"
    if question.get("duplicate_of"):
        return "REUSE equivalent question " + question["duplicate_of"] + "; do not create another execution"
    if question["lifecycle"] == "eligible":
        return ("SELECT " + question["science_id"] + "; recommendation only; authorized isolated local calculation may proceed; "
                "concurrent dispatch requires externally verified deployed Writer admission capability and canonical reservation readback")
    if question["lifecycle"] == "running":
        return "RECONCILE existing run " + str(question["run_id"]) + "; no duplicate dispatch"
    if question["result_state"] == "calculated":
        return "PERSIST existing calculation " + question["science_id"] + "; no recomputation"
    if question["lifecycle"] in {"persisted", "closed", "reframed"}:
        return "SELECT a distinct eligible question"
    return "VERIFY scoped dependency; continue independent questions"


def select_next(state, role, limit=16):
    """Deterministic recommendations only. Does not acquire a lease or dispatch."""
    if role not in ROLES or isinstance(limit, bool) or not isinstance(limit, int) or not 0 <= limit <= 50:
        raise ValueError("SELECTION_ARGUMENT_INVALID")
    candidates = [q for q in state["questions"].values() if q["role"] == role
                  and q["lifecycle"] == "eligible" and not q["reconciliation_required"]]
    return sorted(candidates, key=lambda q: (-q["score"], _timestamp(q["first_at"]), q["science_id"]))[:limit]


def plan_research(state, role, limit=16, *, budget_seconds=None):
    """Explain the next research decisions from the existing event projection.

    The result is disposable and read-only: it is neither a second roadmap nor
    an execution authority. Scientific hypotheses are supplied by the scientist;
    the code checks evidence, equivalence and estimates before ranking. Calling
    again with a CALCULATED/CLOSED/DEPENDENCY delta reevaluates the same state.
    A local authorized calculation need not wait for a distributed reservation;
    concurrent scheduled executors must use the existing Writer protocol.
    """
    if not isinstance(state, dict) or state.get("schema") != STATE_SCHEMA:
        raise ValueError("STATE_SCHEMA_INVALID")
    select_next(state, role, limit)  # shared argument contract
    if budget_seconds is not None and (isinstance(budget_seconds, bool)
            or not isinstance(budget_seconds, (int, float))
            or not math.isfinite(budget_seconds) or budget_seconds < 0):
        raise ValueError("BUDGET_INVALID")
    scoped = sorted((q for q in state["questions"].values() if q["role"] == role),
                    key=lambda q: (-q["score"], _timestamp(q["first_at"]), q["science_id"]))
    recommendations, ranking, repair, reuse, feedback = [], [], [], [], []
    remaining = budget_seconds
    for q in scoped:
        opportunity = q.get("opportunity")
        cost = opportunity["cost"]["seconds"] if opportunity else None
        decision = q["lifecycle"].upper()
        selectable = q["lifecycle"] == "eligible" and not q["reconciliation_required"]
        reasons = list(q["reasons"])
        if selectable and budget_seconds is not None:
            if cost is None:
                selectable = False
                decision = "COST_UNESTIMATED"
                reasons.append("ESTIMATE_COST_FOR_BOUNDED_BUDGET")
            elif cost > remaining:
                selectable = False
                decision = "OUTSIDE_COMPUTE_BUDGET"
                reasons.append("ESTIMATED_SECONDS_EXCEED_REMAINING_BUDGET")
        if selectable and len(recommendations) < limit:
            recommendations.append(copy.deepcopy(q))
            decision = "RECOMMENDED_NOT_RESERVED"
            if remaining is not None:
                remaining -= cost
        elif selectable:
            decision = "ELIGIBLE_AFTER_PULSE_LIMIT"
        ranking.append({"science_id": q["science_id"], "equivalence_id": q["equivalence_id"],
                        "title": q["title"], "activity": q["activity"], "decision": decision,
                        "score": q["score"], "score_basis": copy.deepcopy(q["score_basis"]),
                        "estimated_seconds": cost, "reasons": reasons,
                        "physical_question": opportunity["physical_question"] if opportunity else None,
                        "hypotheses": copy.deepcopy(opportunity["hypotheses"]) if opportunity else [],
                        "discriminator": opportunity["discriminator"] if opportunity else None,
                        "novelty_status": "STRUCTURALLY_DISTINCT_WITHIN_READ_SCOPE" if selectable else "NOT_CLAIMED"})
        if q["historical_equivalent"] or q["duplicate_of"] or q["has_calculation"]:
            reuse.append({"science_id": q["science_id"], "duplicate_of": q["duplicate_of"],
                          "result_state": q["result_state"], "event_ids": list(q["event_ids"]),
                          "source_links": copy.deepcopy(q["evidence_links"]), "action": q["next_action"]})
        if q["lifecycle"] == "blocked" or q["reconciliation_required"]:
            repair.append({"science_id": q["science_id"], "reasons": reasons,
                           "action": q["next_action"], "blocks_other_questions": False})
        if q["has_calculation"]:
            feedback.append({"science_id": q["science_id"], "scientific_status": q["scientific_status"],
                             "interpretation": copy.deepcopy(q["interpretation"]),
                             "status": "RECORDED" if q["interpretation"] else "INTERPRETATION_NOT_RECORDED",
                             "next_step": "Use the recorded discriminator to formulate a materially distinct QUESTION in the same Writer events"})
    cost_units = sorted({row["score_basis"]["cost_unit"] for row in ranking})
    return {"schema": "NEXO_RESEARCH_PLAN_V1", "as_of": state["as_of"], "role": role,
            "recommendations": recommendations, "ranking": ranking,
            "dependency_actions": repair, "evidence_reuse": reuse, "feedback": feedback,
            "budget_seconds": budget_seconds, "remaining_estimated_seconds": remaining,
            "selection_only": True, "dispatch_performed": False,
            "next_action": recommendations[0]["next_action"] if recommendations else
                           "Verify scoped dependencies or formulate a distinct supported question in the existing Writer state",
            "history_coverage": {"typed_questions": len(state["questions"]),
                                 "legacy_unclassified": state["legacy_unclassified"],
                                 "semantic_equivalence_inferred": False,
                                 "complete_history_novelty_claim": False},
            "ranking_caveats": (["MIXED_COST_UNITS: legacy relative costs and estimated seconds need calibrated opportunity metadata"]
                                if len(cost_units) > 1 else []) +
                               ["Expected information and cost are declared estimates, not measured scientific power or evidence"]}


def checkpoint_next_action(state, role, current_text):
    """Replace a stale cursor only when typed evidence supports a concrete choice."""
    candidates = select_next(state, role, 1)
    if candidates:
        q = candidates[0]
        return "NEXT " + q["science_id"] + " | " + q["title"] + " | " + q["next_action"]
    scoped = [q for q in state["questions"].values() if q["role"] == role]
    if not scoped:
        return "UNVERIFIED_CURSOR | " + str(current_text or "") + " | validate typed evidence before selection"
    pending = [q for q in scoped if q["reconciliation_required"] or q["result_state"] == "calculated"]
    if pending:
        return sorted(pending, key=lambda q: q["science_id"])[0]["next_action"]
    return "NO_ELIGIBLE_QUESTION | verify dependencies or formulate a distinct supported test; completed science stays consumed"
