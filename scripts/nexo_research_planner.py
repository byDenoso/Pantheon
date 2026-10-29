#!/usr/bin/env python3
"""Read-only research planning over the existing Tower/Writer event stream.

This command has no credentials, network writes, scheduler or durable queue.
Snapshots and state outputs are disposable projections, not another authority.
The connected producer supplies bounded canonical reads and submits reviewed
plain SHADOW_V2 proposals through the existing Writer only.
"""
import argparse
import datetime as dt
import hashlib
import json
import math
from pathlib import Path
import re
import sys

if __package__:
    from .nexo_scientific_state import build_state, plan_research, science_event
    from .nexo_shadow_writer import TargetIndex, decode_plain, validate_new_event
else:
    from nexo_scientific_state import build_state, plan_research, science_event
    from nexo_shadow_writer import TargetIndex, decode_plain, validate_new_event

SNAPSHOT_SCHEMA = "NEXO_RESEARCH_SNAPSHOT_V1"
REPORT_SCHEMA = "NEXO_RESEARCH_PLANNER_REPORT_V1"
WIDTHS = {"MURAL": 8, "RESULTADOS": 10}


def strict_pairs(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("DUPLICATE_JSON_KEY:" + key)
        result[key] = value
    return result


def read_json(path):
    raw = Path(path).read_bytes()
    document = json.loads(raw.decode("utf-8-sig"), object_pairs_hook=strict_pairs,
                          parse_constant=lambda _: (_ for _ in ()).throw(ValueError("NONFINITE_JSON")))
    return document, hashlib.sha256(raw).hexdigest()


def unwrap_read(document, expected_tab=None):
    """Accept native values responses and their connector wrappers, never text guesses."""
    for _ in range(6):
        if isinstance(document, dict) and document.get("isError"):
            raise ValueError("SOURCE_READ_FAILED")
        if isinstance(document, dict) and "values" in document:
            if expected_tab is not None:
                expected_end = {"MURAL": "H", "RESULTADOS": "J", "SHADOW_V2": "O"}[expected_tab]
                range_ = document.get("range", "")
                match = re.fullmatch(r"(?:'([^']+)'|([^!]+))!\$?A\$?([1-9][0-9]*):\$?([A-Z]+)\$?([1-9][0-9]*)", range_)
                if (not match or (match.group(1) or match.group(2)) != expected_tab
                        or match.group(4) != expected_end or int(match.group(5)) < int(match.group(3))):
                    raise ValueError("SOURCE_RANGE_MISMATCH:" + expected_tab)
                if document.get("majorDimension") != "ROWS":
                    raise ValueError("SOURCE_ROWS_DIMENSION_REQUIRED")
                if not isinstance(document["values"], list) or len(document["values"]) > int(match.group(5)) - int(match.group(3)) + 1:
                    raise ValueError("SOURCE_ROW_BOUNDS_MISMATCH")
            return document
        if isinstance(document, dict) and isinstance(document.get("structuredContent"), dict):
            document = document["structuredContent"]
            continue
        raise ValueError("VALUES_READ_REQUIRED")
    raise ValueError("SOURCE_WRAPPER_DEPTH")


def add_rows(index, rows, tab):
    if not isinstance(rows, list):
        raise ValueError("ROWS_REQUIRED:" + tab)
    width = WIDTHS[tab]
    for row in rows:
        if not isinstance(row, (list, tuple)) or len(row) > width or not all(isinstance(x, str) for x in row):
            raise ValueError("CANONICAL_ROW_INVALID:" + tab)
        if not row or not any(row) or row[0] == "data":
            continue
        normalized = tuple(row) + ("",) * (width - len(row))
        key = normalized[7 if tab == "MURAL" else 3]
        if not key:
            raise ValueError("CANONICAL_ID_MISSING:" + tab)
        if key in index and index[key] != normalized:
            index.conflicts.add(key)
        else:
            index[key] = normalized


def load_snapshot(document):
    if not isinstance(document, dict) or document.get("schema") != SNAPSHOT_SCHEMA:
        raise ValueError("SNAPSHOT_SCHEMA_INVALID")
    if not isinstance(document.get("stored", {}), dict) or not isinstance(document.get("pending", []), list):
        raise ValueError("SNAPSHOT_CONTENT_INVALID")
    stored = {tab: TargetIndex() for tab in WIDTHS}
    for tab, content in document.get("stored", {}).items():
        if tab not in WIDTHS:
            raise ValueError("UNSUPPORTED_SOURCE_TAB:" + tab)
        if isinstance(content, dict):
            for key, row in content.items():
                if not isinstance(row, list) or len(row) != WIDTHS[tab] or row[7 if tab == "MURAL" else 3] != key:
                    raise ValueError("CANONICAL_INDEX_KEY_MISMATCH")
            content = list(content.values())
        add_rows(stored[tab], content, tab)
    return stored, list(document.get("pending", [])), document.get("coverage", {})


def event_envelope(event, *, recipient="P"):
    """Prepare the existing Writer envelope; does not submit, reserve or dispatch."""
    if not isinstance(event, dict):
        raise ValueError("EVENT_REQUIRED")
    event_id, at, role = event.get("event_id"), event.get("at"), event.get("role")
    if event.get("kind") == "CALCULATED":
        if not isinstance(event.get("limitations"), str) or not event["limitations"].strip():
            raise ValueError("RESULT_LIMITATIONS_REQUIRED")
        method = {"NEXO_SCIENCE_V1": event}
        if "receipt" in event:
            method["EXECUTOR_RECEIPT_V1"] = event["receipt"]
        values = [at, role, event["identity"]["question"], event_id,
                  event.get("scientific_status", "UNASSESSED"), json.dumps(method, ensure_ascii=False, allow_nan=False),
                  json.dumps(event.get("numeric_result"), ensure_ascii=False, allow_nan=False),
                  event["limitations"], event.get("references", ""), event.get("artifact", {}).get("uri", "")]
        tab = "RESULTADOS"
    else:
        values = [at, role, recipient, "NEXO_SCIENCE_V1 " + json.dumps(event, ensure_ascii=False, allow_nan=False),
                  "", "SCIENCE_STATE", event["identity"]["question"], event_id]
        tab = "MURAL"
    envelope = {"tab": tab, "stable_id": event_id, "values": values}
    validate_new_event(envelope)
    return envelope


def plain_spool_row(envelope):
    """Reuse the actual Writer decoder/validator for producer-side preparation."""
    validate_new_event(envelope)
    row = envelope["values"]
    plain = [envelope["stable_id"], row[0], row[1], envelope["tab"]] + row + [""] * (10 - len(row)) + [""]
    decoded, state = decode_plain(plain)
    if state or decoded != envelope:
        raise ValueError("SPOOL_ROUNDTRIP_FAILED")
    return plain


def run_plan(stored, pending, *, roles, now, proposals=(), previous=None, limit=16,
             budget_seconds=None, coverage=None):
    """Fold canonical/delta data and unsubmitted proposals without promoting them."""
    prepared = []
    for item in proposals:
        envelope = item if isinstance(item, dict) and "tab" in item else event_envelope(item)
        validate_new_event(envelope)
        science_event(envelope, now=now)
        prepared.append(envelope)
    state = build_state(stored, list(pending) + [{"data": p, "state": ""} for p in prepared],
                        now=now, previous=previous)
    plans = {role: plan_research(state, role, limit, budget_seconds=budget_seconds) for role in roles}
    report = {"schema": REPORT_SCHEMA, "as_of": state["as_of"], "mode": "READ_ONLY_RECOMMENDATIONS",
              "reservation_acquired": False, "network_writes": 0, "execution_dispatched": False,
              "coverage": coverage or {}, "plans": plans, "metrics": state["metrics"],
              "incidents": state["incidents"], "unsubmitted_proposal_ids": [p["stable_id"] for p in prepared],
              "limitations": ["Scoped source reads cannot certify absence of uninspected historical equivalents.",
                              "Priority and information ratings are declared planning estimates, not measured discovery probabilities.",
                              "A recommendation is not an accepted reservation or proof of installed Writer capabilities."]}
    return report, state, [plain_spool_row(p) for p in prepared]


def write_json(path, document):
    output = json.dumps(document, ensure_ascii=False, allow_nan=False, indent=2, sort_keys=True) + "\n"
    if path:
        target = Path(path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(output, encoding="utf-8")
    else:
        sys.stdout.write(output)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot", help="Scoped NEXO_RESEARCH_SNAPSHOT_V1 JSON, not a second queue")
    parser.add_argument("--mural-read", action="append", default=[], help="Bounded Sheets values response JSON; repeat for deltas")
    parser.add_argument("--results-read", action="append", default=[], help="Bounded Sheets values response JSON")
    parser.add_argument("--spool-read", action="append", default=[], help="Existing SHADOW_V2 values response JSON")
    parser.add_argument("--events", help="Optional proposed typed events or existing Writer envelopes, JSON list")
    parser.add_argument("--previous", help="Disposable previous state for incremental projection")
    parser.add_argument("--role", choices=["S1", "S2", "S3", "S4", "S5", "S6", "S7", "P", "all"], default="all")
    parser.add_argument("--limit", type=int, default=16)
    parser.add_argument("--budget-seconds", type=float)
    parser.add_argument("--now", help="Explicit ISO-8601 timestamp for a reproducible historical replay")
    parser.add_argument("--out", help="Planning report; stdout when omitted")
    parser.add_argument("--state-out", help="Disposable projection for subsequent delta reads")
    parser.add_argument("--spool-out", help="Plain A:O proposal rows only; still unsubmitted")
    args = parser.parse_args(argv)
    try:
        input_paths = [p for p in [args.snapshot, args.events, args.previous] + args.mural_read + args.results_read + args.spool_read if p]
        output_paths = [p for p in [args.out, args.state_out, args.spool_out] if p]
        resolved_inputs = {Path(p).resolve() for p in input_paths}
        resolved_outputs = [Path(p).resolve() for p in output_paths]
        if len(set(resolved_outputs)) != len(resolved_outputs) or resolved_inputs.intersection(resolved_outputs):
            raise ValueError("INPUT_OUTPUT_PATH_COLLISION")
        if not (args.snapshot or args.mural_read or args.results_read or args.spool_read or args.previous):
            raise ValueError("CANONICAL_SOURCE_OR_PREVIOUS_REQUIRED")
        if args.budget_seconds is not None and (not math.isfinite(args.budget_seconds) or args.budget_seconds <= 0):
            raise ValueError("BUDGET_INVALID")
        stored = {tab: TargetIndex() for tab in WIDTHS}
        pending, coverage, inputs, quarantined = [], {}, [], []
        if args.snapshot:
            document, digest = read_json(args.snapshot)
            stored, pending, coverage = load_snapshot(document)
            inputs.append({"path": args.snapshot, "sha256": digest})
        for tab, paths in (("MURAL", args.mural_read), ("RESULTADOS", args.results_read), ("SHADOW_V2", args.spool_read)):
            for path in paths:
                document, digest = read_json(path)
                data = unwrap_read(document, expected_tab=tab)
                inputs.append({"path": path, "sha256": digest, "range": data.get("range"), "tab": tab})
                if tab in WIDTHS:
                    add_rows(stored[tab], data["values"], tab)
                else:
                    first_row = int(re.search(r"!\$?A\$?([0-9]+):", data["range"]).group(1))
                    for offset, row in enumerate(data["values"]):
                        if not row or not any(row):
                            continue
                        try:
                            decoded = decode_plain(row)
                        except ValueError as exc:
                            # An explicitly quarantined malformed legacy row is
                            # recorded as an incident, never a queue-wide veto.
                            # Unmarked/ambiguous malformed input still fails.
                            marker = row[14] if isinstance(row, list) and len(row) == 15 else ""
                            if not isinstance(marker, str) or not marker.startswith("INVALID:"):
                                raise
                            quarantined.append({"event_id": row[0], "tab": tab,
                                                "row": first_row + offset, "reason": str(exc),
                                                "observed_marker": marker,
                                                "row_sha256": hashlib.sha256(json.dumps(row, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest(),
                                                "scope": "EXPLICITLY_QUARANTINED_LEGACY_ROW"})
                            continue
                        if decoded is not None:
                            envelope, marker = decoded
                            pending.append({"data": envelope, "state": marker})
        proposals = read_json(args.events)[0] if args.events else []
        if not isinstance(proposals, list):
            raise ValueError("PROPOSAL_LIST_REQUIRED")
        previous = read_json(args.previous)[0] if args.previous else None
        now = args.now or dt.datetime.now(dt.timezone.utc).isoformat()
        roles = ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "P"] if args.role == "all" else [args.role]
        report, state, spool = run_plan(stored, pending, roles=roles, now=now, proposals=proposals,
                                       previous=previous, limit=args.limit, budget_seconds=args.budget_seconds,
                                       coverage={"declared": coverage, "reads": inputs})
        report["source_quarantine"] = quarantined
        write_json(args.out, report)
        if args.state_out:
            write_json(args.state_out, state)
        if args.spool_out:
            write_json(args.spool_out, spool)
        return 0
    except (ValueError, TypeError, KeyError, OSError) as exc:
        sys.stderr.write("PLANNER_INPUT_ERROR: " + str(exc) + "\n")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
