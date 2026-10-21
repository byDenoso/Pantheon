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
from urllib.parse import quote

SHADOW = "1wizywUGEMd_8KrNqMcz5PQig3KgOTbZd8ENkTW8nRKw"
SPOOL = "1M2maKkuEjxumZRa145dzei7dEPFi2yKsKlUf7_scC-E"
LEGACY_TAB = "Sheet1"
PLAIN_TAB = "SHADOW_V2"
API = "https://sheets.googleapis.com/v4/spreadsheets"
TABS = {"MURAL": (1148777660, 8, "H"), "RESULTADOS": (247327396, 10, "D")}
KEY = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:\-]{5,127}$")
PAGE_SIZE = 250
MAX_GRID_ROWS = 200000
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

def values(session, sheet, range_):
    path = quote(range_, safe="!:$'")
    response = session.get(f"{API}/{sheet}/values/{path}", timeout=60)
    response.raise_for_status()
    return response.json().get("values", [])

def grid_row_count(session, sheet, tab):
    response = session.get(f"{API}/{sheet}", params={
        "fields": "sheets(properties(title,gridProperties(rowCount)))"
    }, timeout=60)
    response.raise_for_status()
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
    for _, row in page_rows(session, SHADOW, tab, "H" if tab == "MURAL" else "J", first=2):
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

def _process(session, stored, seen, counts, *, number, data, state, digest, mark_tab, mark_column, apply):
    key = (data["tab"], data["stable_id"])
    fingerprint = tuple(data["values"])
    if key in seen:
        if seen[key] != fingerprint:
            raise IdentityConflict("SPOOL_ID_CONTENT_CONFLICT")
        counts["duplicate"] += 1
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
        return
    if present:
        counts["duplicate"] += 1
        if apply:
            mark(session, mark_tab, mark_column, number, applied)
            counts["reconciled"] += 1
        return
    if state == claimed:
        counts["attempted_before"] += 1
        counts["unresolved"] += 1
        return
    counts["eligible"] += 1
    if not apply:
        return
    mark(session, mark_tab, mark_column, number, claimed)
    response = session.post(f"{API}/{SHADOW}:batchUpdate",
                            json={"requests": append_request(data)["requests"]}, timeout=60)
    response.raise_for_status()
    refreshed = target_index(session, data["tab"])
    if not match_target(refreshed, data):
        raise RuntimeError("WRITE_READBACK_UNKNOWN")
    stored[data["tab"]] = refreshed
    mark(session, mark_tab, mark_column, number, applied)
    counts["written"] += 1

def run(session, *, apply=False):
    stored = {tab: target_index(session, tab) for tab in TABS}
    seen = {}
    pending = []
    invalid_ids = set()
    counts = {"eligible": 0, "written": 0, "invalid": 0, "legacy": 0,
              "plain": 0, "duplicate": 0, "attempted_before": 0, "reconciled": 0,
              "unresolved": 0, "conflict": 0, "quarantined": 0,
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
            if row and isinstance(row[0], str) and KEY.fullmatch(row[0]):
                invalid_ids.add(row[0])

    # Validate all identities before the first side effect. Otherwise the first
    # colliding proposal could be applied before the second exposes the conflict.
    groups = {}
    for item in pending:
        data = item["data"]
        groups.setdefault((data["tab"], data["stable_id"]), []).append(item)
    for key, items in groups.items():
        fingerprints = {tuple(item["data"]["values"]) for item in items}
        if len(fingerprints) != 1 or key[1] in invalid_ids:
            counts["conflict"] += len(items)
            continue
        if any(item["state"] not in ("", "CLAIMED:"+item["digest"],
                                      "APPLIED:"+item["digest"]) for item in items):
            counts["quarantined"] += len(items)
            continue
        # Resolve the strongest existing receipt first within this identity.
        # This never reorders distinct identities for scientific bookkeeping.
        items.sort(key=lambda item: 0 if item["state"].startswith("APPLIED:") else
                   1 if item["state"].startswith("CLAIMED:") else 2)
        for item in items:
            try:
                _process(session, stored, seen, counts, **item, apply=apply)
            except IdentityConflict:
                counts["conflict"] += 1
            except AppliedReadbackMissing:
                counts["unresolved"] += 1
            except (ValueError, KeyError, TypeError, UnicodeError):
                counts["invalid"] += 1
            # Authentication, transport and unknown failures still stop this run.
            # No retry, alternative route or lost-receipt replay is introduced.
    mural_rows = list(stored['MURAL'].values())
    if any(len(row) == 8 and isinstance(row[3], str) and
           row[3].startswith('NEXO_CURATION_V1 ') and row[5] == 'PEDIDO_CURADORIA'
           for row in mural_rows):
        if __package__:
            from .nexo_shadow_curation import run as curate
        else:
            from nexo_shadow_curation import run as curate
        for key, value in curate(session, mural_rows, apply=apply).items():
            counts['curation_' + key] = value
    return counts

def result_status(counts, apply):
    if any(counts.get(key, 0) for key in
           ("invalid", "unresolved", "quarantined", "conflict", "target_conflicts",
            "curation_invalid", "curation_unresolved", "curation_conflict")):
        return "PARTIAL_RECONCILIATION"
    return "READBACK_VERIFIED" if apply else "PREFLIGHT"

_SAFE_ERRORS = frozenset({
    "SHEET_GRID_METADATA_MISMATCH", "SHEET_PAGE_OVERFLOW", "DUPLICATE_TARGET_ID",
    "STATE_READBACK_FAILED", "IDENTITY_CONTENT_CONFLICT", "SPOOL_ID_CONTENT_CONFLICT",
    "APPLIED_READBACK_MISSING", "WRITE_READBACK_UNKNOWN", "SPOOL_HEADER_MISSING",
    "SPOOL_HEADER_MISMATCH", "PLAIN_SPOOL_HEADER_MISSING", "PLAIN_SPOOL_HEADER_MISMATCH",
})

def safe_error_code(exc):
    value = str(exc)
    return value if value in _SAFE_ERRORS else "UNCLASSIFIED"

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    flag = parser.parse_args().apply
    from google.oauth2 import service_account
    from google.auth.transport.requests import AuthorizedSession
    raw = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON")
    if not raw:
        raise SystemExit("WRITER_CREDENTIAL_MISSING")
    creds = service_account.Credentials.from_service_account_info(
        json.loads(raw), scopes=["https://www.googleapis.com/auth/spreadsheets"])
    try:
        with AuthorizedSession(creds) as session:
            result = run(session, apply=flag)
    except Exception as exc:
        print(json.dumps({"status": "STOP_NO_RETRY", "error_class": type(exc).__name__,
                          "error_code": safe_error_code(exc)}), file=sys.stderr)
        return 1
    status = result_status(result, flag)
    print(json.dumps({"status": status, **result}))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
