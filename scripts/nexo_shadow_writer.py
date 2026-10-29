#!/usr/bin/env python3
"""Single-writer, fail-closed transport: private spool -> canonical Tower SHADOW.

Two ingress formats are accepted during migration:
- legacy Sheet1 A:E with base64url NEXO_SHADOW_ROW_V1 envelopes;
- SHADOW_V2 A:O with plain text columns (preferred for scheduled Tasks).

An ambiguous append is NEVER blindly replayed. A later run reconciles CLAIMED
rows against the full target row before marking APPLIED.
"""
import argparse
import base64
import hashlib
import json
import os
import re
import sys
import time
from urllib.parse import quote

SHADOW = "1wizywUGEMd_8KrNqMcz5PQig3KgOTbZd8ENkTW8nRKw"
SPOOL = "1M2maKkuEjxumZRa145dzei7dEPFi2yKsKlUf7_scC-E"
LEGACY_TAB = "Sheet1"
PLAIN_TAB = "SHADOW_V2"
API = "https://sheets.googleapis.com/v4/spreadsheets"
TABS = {"MURAL": (1148777660, 8, "H"), "RESULTADOS": (247327396, 10, "D")}
KEY = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:\-]{5,127}$")
PAGE_SIZE = 1000
MAX_GRID_ROWS = 1000000  # metadata safety bound; capacity review starts well before this
READBACK_BATCH_SIZE = 8  # batch safe verification reads; independent appends
PLAIN_HEADER = ["stable_id","created_at","role","tab",
                "v1","v2","v3","v4","v5","v6","v7","v8","v9","v10","state"]

class IdentityConflict(RuntimeError):
    """Only this identity is unsafe; unrelated append-only work may continue."""

class AppliedReadbackMissing(RuntimeError):
    """An applied marker without matching evidence must never cause a replay."""

class TargetIndex(dict):
    def __init__(self):
        super().__init__()
        self.conflicts = set()
        self.last_row = 1  # Last observed occupied row; header is row 1.

def strict_obj(pairs):
    output = {}
    for key, value in pairs:
        if key in output:
            raise ValueError("DUPLICATE_KEY")
        output[key] = value
    return output

def _validate_data(stable_id, tab, values_):
    if not KEY.fullmatch(stable_id) or tab not in TABS:
        raise ValueError("INVALID_TAB_OR_ID")
    width = TABS[tab][1]
    if not isinstance(values_, list) or len(values_) != width or not all(isinstance(v, str) for v in values_):
        raise ValueError("INVALID_WIDTH_OR_TYPE")
    if values_[7 if tab == "MURAL" else 3] != stable_id:
        raise ValueError("MISMATCHED_ROW_ID")
    if tab == "MURAL" and not values_[0]:
        raise ValueError("MISSING_TIME")
    return {"stable_id": stable_id, "tab": tab, "values": values_}

def decode(stable_id, encoded):
    """Decode the historical base64url ingress. Non-SHADOW envelopes are ignored."""
    if not KEY.fullmatch(stable_id) or not encoded or len(encoded) > 16000:
        raise ValueError("BAD_STABLE_ID_OR_LENGTH")
    raw = base64.b64decode(encoded + "=" * (-len(encoded) % 4), altchars=b"-_", validate=True)
    data = json.loads(raw.decode("utf-8"), object_pairs_hook=strict_obj,
                      parse_constant=lambda _: (_ for _ in ()).throw(ValueError("NONFINITE")))
    if not isinstance(data, dict):
        raise ValueError("INVALID_OBJECT")
    if data.get("contract") != "NEXO_SHADOW_ROW_V1":
        return None
    if data.get("stable_id") != stable_id:
        raise ValueError("MISMATCHED_STABLE_ID")
    return _validate_data(stable_id, data.get("tab"), data.get("values"))

def decode_plain(row):
    """Decode one SHADOW_V2 row without opaque encoding."""
    if (not isinstance(row, list) or len(row) > len(PLAIN_HEADER)
            or not all(isinstance(value, str) for value in row)):
        raise ValueError("PLAIN_WIDTH_OR_TYPE_INVALID")
    padded = list(row) + [""] * max(0, len(PLAIN_HEADER) - len(row))
    if padded[0] == "stable_id":
        return None
    stable_id, created_at, role, tab = padded[:4]
    if not created_at or not role:
        raise ValueError("PLAIN_METADATA_MISSING")
    width = TABS.get(tab, (None, 0, None))[1]
    if not width:
        raise ValueError("INVALID_TAB_OR_ID")
    values_ = padded[4:4 + width]
    if any(padded[4 + width:14]):
        raise ValueError("PLAIN_TRAILING_VALUES")
    data = _validate_data(stable_id, tab, values_)
    return data, padded[14]

def append_request(data):
    cells = [{"userEnteredValue": {"stringValue": value}} for value in data["values"]]
    args = {"spreadsheet_id": SHADOW, "requests": [{"appendCells": {
        "sheetId": TABS[data["tab"]][0], "rows": [{"values": cells}],
        "fields": "userEnteredValue"}}]}
    return args

def safe_get(session, url, **kwargs):
    """Retry only idempotent Sheets GETs on quota or transient server errors.

    Never retry POST append or ambiguous marker writes through this routine.
    Quota 429 retains the existing bounded exponential retry sequence.
    Other transient HTTP statuses use at most four GET attempts.
    """
    for attempt in range(7):
        response = session.get(url, **kwargs)
        status = getattr(response, 'status_code', None)
        if status not in (408, 429, 500, 502, 503, 504):
            response.raise_for_status()
            return response
        if attempt >= 6 or (status != 429 and attempt >= 3):
            response.raise_for_status()
            return response
        time.sleep(2 ** min(attempt, 5))


def values(session, sheet, range_):
    path = quote(range_, safe="!:$'")
    response = safe_get(session, f"{API}/{sheet}/values/{path}", timeout=60)
    return response.json().get("values", [])

def grid_row_count(session, sheet, tab):
    response = safe_get(session, f"{API}/{sheet}", params={
        "fields": "sheets(properties(title,gridProperties(rowCount)))"
    }, timeout=60)
    sheets = response.json().get("sheets", [])
    matching = [s["properties"]["gridProperties"]["rowCount"] for s in sheets
                if s.get("properties", {}).get("title") == tab]
    if len(matching) != 1 or not isinstance(matching[0], int) or not 1 <= matching[0] <= MAX_GRID_ROWS:
        raise RuntimeError("SHEET_GRID_METADATA_MISMATCH")
    return matching[0]

def page_rows(session, sheet, tab, last_column, first=1):
    capacity = grid_row_count(session, sheet, tab)
    for start in range(first, capacity + 1, PAGE_SIZE):
        end = min(start + PAGE_SIZE - 1, capacity)
        chunk = values(session, sheet, f"'{tab}'!A{start}:{last_column}{end}")
        if len(chunk) > end - start + 1:
            raise RuntimeError("SHEET_PAGE_OVERFLOW")
        for offset, row in enumerate(chunk):
            if row:
                yield start + offset, row

def target_index(session, tab):
    width = TABS[tab][1]
    key_column = 7 if tab == "MURAL" else 3
    result = TargetIndex()
    for number, row in page_rows(session, SHADOW, tab, "H" if tab == "MURAL" else "J", first=2):
        if row:
            result.last_row = max(result.last_row, number)
        if len(row) <= key_column or not row[key_column]:
            continue
        unique_id = row[key_column]
        normalized = tuple((row + [""] * width)[:width])
        if unique_id in result.conflicts:
            continue
        if unique_id in result and result[unique_id] != normalized:
            result.conflicts.add(unique_id)
            del result[unique_id]
            continue
        # Same immutable event recorded twice is not a second execution.
        result[unique_id] = normalized
    return result

def mark(session, tab, column, number, value):
    a1 = f"'{tab}'!{column}{number}"
    path = quote(a1, safe="!:$'")
    response = session.put(f"{API}/{SPOOL}/values/{path}", params={"valueInputOption": "RAW"},
        json={"range": a1, "majorDimension": "ROWS", "values": [[value]]}, timeout=60)
    response.raise_for_status()
    if values(session, SPOOL, a1) != [[value]]:
        raise RuntimeError("STATE_READBACK_FAILED")

def match_target(index, data):
    if data["stable_id"] in getattr(index, "conflicts", ()):
        raise IdentityConflict("DUPLICATE_TARGET_ID")
    existing = index.get(data["stable_id"])
    if existing is None:
        return False
    if existing != tuple(data["values"]):
        raise IdentityConflict("IDENTITY_CONTENT_CONFLICT")
    return True

def digest_for(data):
    raw = json.dumps({"tab": data["tab"], "values": data["values"]},
                     ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()[:16]

def validate_new_event(data):
    """Admission checks for a new event, never retroactive rewriting."""
    row = data['values']
    required = (0, 1, 2, 3, 5, 7) if data['tab'] == 'MURAL' else (0, 1, 2, 3, 4, 5, 6, 7)
    if any(not row[i].strip() for i in required):
        raise ValueError('MISSING_EVENT_METADATA')
    for cell in row:
        if len(cell.encode('utf-16-le')) // 2 > 50000:
            raise ValueError('CELL_PLATFORM_LIMIT')
    if len(json.dumps({'requests':append_request(data)['requests']}).encode()) > 2_000_000:
        raise ValueError('BATCH_PLATFORM_LIMIT')
    if __package__:
        from .nexo_scientific_state import science_event
    else:
        from nexo_scientific_state import science_event
    science_event(data)  # Opt-in schema validation; legacy rows are unchanged.

def _process(session, stored, seen, counts, *, number, data, state, digest, mark_tab, mark_column, apply, queued=None):
    key = (data["tab"], data["stable_id"])
    fingerprint = tuple(data["values"])
    if key in seen:
        if seen[key] != fingerprint:
            raise IdentityConflict("SPOOL_ID_CONTENT_CONFLICT")
        counts["duplicate"] += 1
        # Deduplicate target appends, not source acknowledgements. Each exact
        # copy needs its own receipt after the target is independently read back.
        # A newly queued append may only become visible on the next run; never
        # acknowledge it from the in-memory payload or replay an uncertain write.
        if (apply and state in ("", "CLAIMED:" + digest)
                and match_target(stored[data["tab"]], data)):
            mark(session, mark_tab, mark_column, number, "APPLIED:" + digest)
            counts["reconciled"] += 1
            return "APPLIED:" + digest
        return
    seen[key] = fingerprint
    append_request(data)
    applied = "APPLIED:" + digest
    claimed = "CLAIMED:" + digest
    if state and state not in (applied, claimed):
        counts["quarantined"] += 1
        return
    present = match_target(stored[data["tab"]], data)
    if state == applied:
        if not present:
            raise AppliedReadbackMissing("APPLIED_READBACK_MISSING")
        counts["duplicate"] += 1
        return applied
    if present:
        counts["duplicate"] += 1
        if apply:
            mark(session, mark_tab, mark_column, number, applied)
            counts["reconciled"] += 1
            return applied
        return
    if state == claimed:
        counts["attempted_before"] += 1
        counts["unresolved"] += 1
        return
    validate_new_event(data)
    counts["eligible"] += 1
    if not apply:
        return
    mark(session, mark_tab, mark_column, number, claimed)
    response = session.post(f"{API}/{SHADOW}:batchUpdate",
                            json={"requests": append_request(data)["requests"]}, timeout=60)
    response.raise_for_status()
    if queued is not None:
        # Batch ONLY safe readbacks. Writes stay individually reserved and
        # individually posted; a failed event cannot poison unrelated appends.
        queued.append((data, digest, mark_tab, mark_column, number))
        return
    refreshed = target_index(session, data["tab"])
    if not match_target(refreshed, data):
        raise RuntimeError("WRITE_READBACK_UNKNOWN")
    stored[data["tab"]] = refreshed
    mark(session, mark_tab, mark_column, number, applied)
    counts["written"] += 1
    return applied

def flush_verified_appends(session, stored, counts, queued):
    """Verify acknowledged, individually reserved appends without repeated full scans.

    Only use a narrow tail range when it contains exactly the rows we appended,
    in order. Missing/reordered/unexpected rows trigger the prior full-index
    reconciliation. An ambiguous POST still stays CLAIMED, never replayed.
    """
    if not queued:
        return
    touched = {item[0]["tab"] for item in queued}
    refreshed = {}
    for tab in touched:
        prior = stored[tab]
        events = [item[0] for item in queued if item[0]["tab"] == tab]
        if isinstance(prior, TargetIndex):
            first = prior.last_row + 1
            last = first + len(events) - 1
            col = "H" if tab == "MURAL" else "J"
            window = values(session, SHADOW, f"'{tab}'!A{first}:{col}{last}")
            width = TABS[tab][1]
            exact = len(window) == len(events) and all(
                tuple((row + [""] * width)[:width]) == tuple(data["values"])
                for row, data in zip(window, events))
            if exact and not any(data["stable_id"] in prior for data in events):
                candidate = TargetIndex()
                candidate.update(prior)
                candidate.conflicts.update(prior.conflicts)
                candidate.last_row = last
                for data in events:
                    candidate[data["stable_id"]] = tuple(data["values"])
                refreshed[tab] = candidate
                counts["tail_readback_tabs"] += 1
                continue
            counts["tail_readback_fallbacks"] += 1
        refreshed[tab] = target_index(session, tab)
    for data, _, _, _, _ in queued:
        if not match_target(refreshed[data["tab"]], data):
            raise RuntimeError("WRITE_READBACK_UNKNOWN")
    for data, digest, mark_tab, mark_column, number in queued:
        mark(session, mark_tab, mark_column, number, "APPLIED:" + digest)
        counts["written"] += 1
    stored.update(refreshed)
    counts["readback_batches"] += 1
    queued.clear()

def run(session, *, apply=False, snapshot=None):
    if __package__:
        from .nexo_scientific_state import build_state, science_event, reservation_error
    else:
        from nexo_scientific_state import build_state, science_event, reservation_error
    stored = {tab: target_index(session, tab) for tab in TABS}
    seen = {}
    pending = []
    invalid_ids = set()
    counts = {"eligible": 0, "written": 0, "invalid": 0, "legacy": 0,
              "plain": 0, "duplicate": 0, "attempted_before": 0, "reconciled": 0,
              "unresolved": 0, "conflict": 0, "quarantined": 0,
              "readback_batches": 0, "tail_readback_tabs": 0,
              "tail_readback_fallbacks": 0,
              "preexisting_invalid": 0, "preexisting_quarantined": 0,
              "new_failures": 0,
              "scientific_reservations_accepted": 0,
              "scientific_reservations_rejected": 0,
              "target_conflicts": sum(len(getattr(index, "conflicts", ())) for index in stored.values())}

    legacy_rows = page_rows(session, SPOOL, LEGACY_TAB, "E")
    try:
        n, header = next(legacy_rows)
    except StopIteration:
        raise RuntimeError("SPOOL_HEADER_MISSING")
    if n != 1 or header[:4] != ["stable_id", "created_at", "role", "envelope_b64url"]:
        raise RuntimeError("SPOOL_HEADER_MISMATCH")
    for number, row in legacy_rows:
        if len(row) < 4 or row[0] == "stable_id":
            continue
        try:
            data = decode(row[0], row[3])
            if data is None:
                counts["legacy"] += 1
                continue
            state = row[4] if len(row) > 4 else ""
            digest = hashlib.sha256(row[3].encode("ascii")).hexdigest()[:16]
            pending.append(dict(number=number, data=data, state=state,
                                digest=digest, mark_tab=LEGACY_TAB, mark_column="E"))
        except (ValueError, KeyError, TypeError, UnicodeError):
            counts["invalid"] += 1
            if len(row) > 4 and isinstance(row[4], str) and row[4].startswith('INVALID:'):
                counts['preexisting_invalid'] += 1
            if isinstance(row[0], str) and KEY.fullmatch(row[0]):
                invalid_ids.add(row[0])

    plain_rows = page_rows(session, SPOOL, PLAIN_TAB, "O")
    try:
        n, header = next(plain_rows)
    except StopIteration:
        raise RuntimeError("PLAIN_SPOOL_HEADER_MISSING")
    if n != 1 or (header + [""] * 15)[:15] != PLAIN_HEADER:
        raise RuntimeError("PLAIN_SPOOL_HEADER_MISMATCH")
    for number, row in plain_rows:
        try:
            decoded = decode_plain(row)
            if decoded is None:
                continue
            data, state = decoded
            counts["plain"] += 1
            pending.append(dict(number=number, data=data, state=state,
                                digest=digest_for(data), mark_tab=PLAIN_TAB, mark_column="O"))
        except (ValueError, KeyError, TypeError, UnicodeError):
            counts["invalid"] += 1
            if len(row) > 14 and isinstance(row[14], str) and row[14].startswith('INVALID:'):
                counts['preexisting_invalid'] += 1
            if row and isinstance(row[0], str) and KEY.fullmatch(row[0]):
                invalid_ids.add(row[0])

    # Validate all identities before the first side effect. Otherwise the first
    # colliding proposal could be applied before the second exposes the conflict.
    groups = {}
    for item in pending:
        data = item["data"]
        # A payload variant for an already-persisted ID may be preserved as
        # terminal quarantine, but ONLY if canonical target readback proves a
        # different immutable row with that ID. Exclude that rejected variant
        # from active identity grouping: it cannot poison the valid APPLIED row,
        # and it will never be replayed. Missing/ambiguous target stays unsafe.
        if item["state"] == "INVALID:TARGET_CONTENT_VARIANT_ALREADY_PRESENT":
            index = stored[data["tab"]]
            key = data["stable_id"]
            if (key in getattr(index, "conflicts", ()) or key not in index
                    or tuple(data["values"]) == index[key]):
                counts["conflict"] += 1
            else:
                counts["quarantined"] += 1
                counts["preexisting_quarantined"] += 1
            continue
        groups.setdefault((data["tab"], data["stable_id"]), []).append(item)
    readback_queue = []
    source_rows = {(item['mark_tab'], item['mark_column'], item['number']): item
                   for item in pending}

    def flush_readback_queue():
        # Keep the projection snapshot current only after both exact target
        # readback and the per-source APPLIED marker have succeeded. The source
        # events are immutable; this updates only this run's observation.
        receipts = [(tab, col, number, digest)
                    for _, digest, tab, col, number in readback_queue]
        flush_verified_appends(session, stored, counts, readback_queue)
        for tab, col, number, digest in receipts:
            source_rows[(tab, col, number)]['state'] = 'APPLIED:' + digest

    def scientific_safety_pending(candidate):
        # Uncertain attempts and already-calculated evidence can DENY another
        # reservation even when target readback is absent. Future QUESTION or
        # unattempted STARTED proposals must never authorize work or mutually
        # block the first legitimate reservation. Inspect the whole spool so
        # an uncertain predecessor remains binding regardless of row order.
        observations = []
        candidate_key = (candidate['data']['tab'], candidate['data']['stable_id'])
        for other in pending:
            data, state = other['data'], other['state']
            if (data['tab'], data['stable_id']) == candidate_key:
                continue
            try:
                event = science_event(data)
            except (ValueError, TypeError, KeyError):
                if state.startswith(('CLAIMED:', 'APPLIED:')):
                    observations.append(other)
                continue
            if event is None:
                continue
            if (event['kind'] == 'CALCULATED'
                    or (event['kind'] == 'STARTED' and state.startswith(('CLAIMED:', 'APPLIED:')))
                    or (event['kind'] == 'DEPENDENCY' and event['dependency']['status'] != 'verified')):
                observations.append(other)
        return observations

    for key, items in groups.items():
        fingerprints = {tuple(item["data"]["values"]) for item in items}
        if len(fingerprints) != 1 or key[1] in invalid_ids:
            counts["conflict"] += len(items)
            continue
        if any(item["state"] not in ("", "CLAIMED:"+item["digest"],
                                      "APPLIED:"+item["digest"]) for item in items):
            counts["quarantined"] += len(items)
            counts['preexisting_quarantined'] += sum(
                isinstance(item['state'], str) and
                item['state'].startswith(('INVALID:', 'PENDING_SYNC')) for item in items)
            continue
        # Resolve the strongest existing receipt first within this identity.
        # This never reorders distinct identities for scientific bookkeeping.
        items.sort(key=lambda item: 0 if item["state"].startswith("APPLIED:") else
                   1 if item["state"].startswith("CLAIMED:") else 2)
        for item in items:
            try:
                reservation = False
                if not item['state'] and not match_target(stored[item['data']['tab']], item['data']):
                    event = science_event(item['data'])
                    if event is not None and event['kind'] == 'STARTED':
                        # Reservations share the existing serial Writer. Flush
                        # preceding declarations, then admit against canonical
                        # readback, never against unaccepted future proposals.
                        flush_readback_queue()
                        reason = reservation_error(build_state(stored, scientific_safety_pending(item)), event)
                        if reason is not None:
                            counts['scientific_reservations_rejected'] += 1
                            counts['invalid'] += 1
                            if apply:
                                rejected = 'INVALID:SCIENCE_RESERVATION_' + reason
                                mark(session, item['mark_tab'], item['mark_column'], item['number'], rejected)
                                item['state'] = rejected
                            continue
                        reservation = True
                observed_state = _process(session, stored, seen, counts, **item,
                                          apply=apply, queued=readback_queue)
                if observed_state is not None:
                    item['state'] = observed_state
                if reservation or len(readback_queue) >= READBACK_BATCH_SIZE:
                    flush_readback_queue()
                if reservation and apply:
                    counts['scientific_reservations_accepted'] += 1
            except IdentityConflict:
                counts["conflict"] += 1
            except AppliedReadbackMissing:
                counts["unresolved"] += 1
            except (ValueError, KeyError, TypeError, UnicodeError):
                counts["invalid"] += 1
            # Authentication, transport and unknown failures still stop this run.
            # No retry, alternative route or lost-receipt replay is introduced.
    flush_readback_queue()
    mural_rows = list(stored['MURAL'].values())
    if any(len(row) == 8 and isinstance(row[3], str) and
           row[3].startswith('NEXO_CURATION_V1 ') and row[5] == 'PEDIDO_CURADORIA'
           for row in mural_rows):
        if __package__:
            from .nexo_shadow_curation import run as curate
        else:
            from nexo_shadow_curation import run as curate
        for key, value in curate(session, mural_rows, apply=apply, index=stored['MURAL']).items():
            counts['curation_' + key] = value
    # Separate genuinely new problems from pre-existing, explicitly marked
    # historical debt. Both remain visible; neither is silently discarded.
    counts['new_failures'] = (
        counts['invalid'] - counts['preexisting_invalid'] +
        counts['quarantined'] - counts['preexisting_quarantined'] +
        counts['unresolved'] + counts['conflict'] + counts['target_conflicts'] +
        sum(counts.get('curation_' + key, 0) for key in ('invalid', 'unresolved', 'conflict')))
    if snapshot is not None:
        snapshot.update(stored=stored, pending=pending)
    return counts

def result_status(counts, apply):
    """Report active reconciliation failures, retaining historic quarantine counts.

    An explicitly marked prior rejection remains INVALID/PENDING_SYNC in the
    spool and in the counters, but it does not make a successfully verified
    independent batch permanently PARTIAL. Unmarked errors, inconsistent
    counters, missing receipts and scientific curation conflicts remain partial.
    No rejected event is replayed or upgraded to APPLIED by this classification.
    """
    old_invalid = counts.get("preexisting_invalid", 0)
    old_quarantined = counts.get("preexisting_quarantined", 0)
    invalid = counts.get("invalid", 0)
    quarantined = counts.get("quarantined", 0)
    if old_invalid > invalid or old_quarantined > quarantined:
        return "PARTIAL_RECONCILIATION"
    active = (invalid - old_invalid + quarantined - old_quarantined +
              sum(counts.get(key, 0) for key in (
                  "unresolved", "conflict", "target_conflicts",
                  "curation_invalid", "curation_unresolved", "curation_conflict")))
    if active > 0 or counts.get("new_failures", 0) > 0:
        return "PARTIAL_RECONCILIATION"
    return "READBACK_VERIFIED" if apply else "PREFLIGHT"

_SAFE_ERRORS = frozenset({
    "SHEET_GRID_METADATA_MISMATCH", "SHEET_PAGE_OVERFLOW", "DUPLICATE_TARGET_ID",
    "STATE_READBACK_FAILED", "IDENTITY_CONTENT_CONFLICT", "SPOOL_ID_CONTENT_CONFLICT",
    "APPLIED_READBACK_MISSING", "WRITE_READBACK_UNKNOWN", "SPOOL_HEADER_MISSING",
    "SPOOL_HEADER_MISMATCH", "PLAIN_SPOOL_HEADER_MISSING", "PLAIN_SPOOL_HEADER_MISMATCH",
    "OPERATIONS_VIEW_MISSING", "OPERATIONS_SCHEMA_INVALID", "OPERATIONS_VIEW_CAPACITY",
    "OPERATIONS_PAYLOAD_TOO_LARGE", "OPERATIONS_READBACK_FAILED",
    "CURATION_REJECTION_READBACK_UNKNOWN",
})

def safe_error_code(exc):
    # Never log the exception body, request URL, credentials or row content.
    if type(exc).__name__ == "HTTPError":
        status = getattr(getattr(exc, "response", None), "status_code", None)
        if type(status) is int and 400 <= status <= 599:
            return f"HTTP_{status}"
    value = str(exc)
    return value if value in _SAFE_ERRORS else "UNCLASSIFIED"

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--operations", action="store_true")
    args = parser.parse_args()
    flag = args.apply
    from google.oauth2 import service_account
    from google.auth.transport.requests import AuthorizedSession
    raw = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON")
    if not raw:
        raise SystemExit("WRITER_CREDENTIAL_MISSING")
    creds = service_account.Credentials.from_service_account_info(
        json.loads(raw), scopes=["https://www.googleapis.com/auth/spreadsheets"])
    started = time.monotonic()
    snapshot = {}
    operations = 'NOT_REQUESTED'
    try:
        with AuthorizedSession(creds) as session:
            result = run(session, apply=flag, snapshot=snapshot)
            if args.operations and flag:
                try:
                    if __package__:
                        from .nexo_tower_operations import build_views, publish_views
                    else:
                        from nexo_tower_operations import build_views, publish_views
                    team = values(session, SHADOW, "'EQUIPE'!A1:F100")
                    roster = {r[1]:r[0] for r in team[1:] if len(r)>1 and r[0] in ('S1','S2','S3','S4','S5','S6','S7','P')}
                    views = build_views(**snapshot, counts=result, roster=roster,
                        revision=os.getenv('GITHUB_SHA','unknown'), duration=time.monotonic()-started)
                    operations = publish_views(session, views, sys.modules[__name__])
                except Exception as exc:
                    # Evidence already written stays verified. An operational
                    # projection failure never causes replay of scientific rows.
                    operations = 'FAILED_'+safe_error_code(exc)
    except Exception as exc:
        print(json.dumps({"status": "STOP_NO_RETRY", "error_class": type(exc).__name__,
                          "error_code": safe_error_code(exc)}), file=sys.stderr)
        return 1
    status = result_status(result, flag)
    print(json.dumps({"status": status, "operations":operations, **result}))
    return 1 if status == 'PARTIAL_RECONCILIATION' or operations.startswith('FAILED_') else 0

if __name__ == "__main__":
    raise SystemExit(main())

