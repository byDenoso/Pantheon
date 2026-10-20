#!/usr/bin/env python3
"""Single-writer, fail-closed transport: private spool -> canonical Tower SHADOW.

Existing envelope and Sheets layout stay unchanged. An ambiguous append is NEVER
blindly replayed: a later run reconciles it with a full target-row readback.
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
API = "https://sheets.googleapis.com/v4/spreadsheets"
TABS = {"MURAL": (1148777660, 8, "H"), "RESULTADOS": (247327396, 10, "D")}
KEY = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:\-]{5,127}$")
LIMIT = 1200
PAGE_SIZE = 250
MAX_GRID_ROWS = 200000

def strict_obj(pairs):
    output = {}
    for key, value in pairs:
        if key in output:
            raise ValueError("DUPLICATE_KEY")
        output[key] = value
    return output

def decode(stable_id, encoded):
    if not KEY.fullmatch(stable_id) or not encoded or len(encoded) > 16000:
        raise ValueError("BAD_STABLE_ID_OR_LENGTH")
    raw = base64.b64decode(encoded + "=" * (-len(encoded) % 4), altchars=b"-_", validate=True)
    data = json.loads(raw.decode("utf-8"), object_pairs_hook=strict_obj,
                      parse_constant=lambda _: (_ for _ in ()).throw(ValueError("NONFINITE")))
    if not isinstance(data, dict):
        raise ValueError("INVALID_OBJECT")
    if data.get("contract") != "NEXO_SHADOW_ROW_V1":
        return None
    tab = data.get("tab")
    if data.get("stable_id") != stable_id or tab not in TABS:
        raise ValueError("INVALID_TAB_OR_ID")
    values_ = data.get("values")
    if not isinstance(values_, list) or len(values_) != TABS[tab][1] or not all(isinstance(v, str) for v in values_):
        raise ValueError("INVALID_WIDTH_OR_TYPE")
    if values_[7 if tab == "MURAL" else 3] != stable_id:
        raise ValueError("MISMATCHED_ROW_ID")
    if tab == "MURAL" and not values_[0]:
        raise ValueError("MISSING_TIME")
    return data

def append_request(data):
    cells = [{"userEnteredValue": {"stringValue": value}} for value in data["values"]]
    args = {"spreadsheet_id": SHADOW, "requests": [{"appendCells": {
        "sheetId": TABS[data["tab"]][0], "rows": [{"values": cells}],
        "fields": "userEnteredValue"}}]}
    count = len(json.dumps(args, ensure_ascii=False, separators=(",", ":")).encode("utf-16-le")) // 2
    if count > LIMIT:
        raise ValueError("FULL_ARGUMENTS_ABOVE_LIMIT")
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
    """Read every allocated row, including pages after internal empty stretches."""
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
    result = {}
    for _, row in page_rows(session, SHADOW, tab, "H" if tab == "MURAL" else "J", first=2):
        if len(row) <= key_column or not row[key_column]:
            continue
        unique_id = row[key_column]
        normalized = tuple((row + [""] * width)[:width])
        if unique_id in result:
            raise RuntimeError("DUPLICATE_TARGET_ID")
        result[unique_id] = normalized
    return result

def mark(session, number, value):
    a1 = f"'Sheet1'!E{number}"
    path = quote(a1, safe="!:$'")
    response = session.put(f"{API}/{SPOOL}/values/{path}", params={"valueInputOption": "RAW"},
        json={"range": a1, "majorDimension": "ROWS", "values": [[value]]}, timeout=60)
    response.raise_for_status()
    if values(session, SPOOL, a1) != [[value]]:
        raise RuntimeError("STATE_READBACK_FAILED")

def match_target(index, data):
    existing = index.get(data["stable_id"])
    if existing is None:
        return False
    if existing != tuple(data["values"]):
        raise RuntimeError("IDENTITY_CONTENT_CONFLICT")
    return True

def run(session, *, apply=False):
    rows = page_rows(session, SPOOL, "Sheet1", "E")
    try:
        header_number, header = next(rows)
    except StopIteration:
        raise RuntimeError("SPOOL_HEADER_MISSING")
    if header_number != 1 or header[:4] != ["stable_id", "created_at", "role", "envelope_b64url"]:
        raise RuntimeError("SPOOL_HEADER_MISMATCH")
    stored = {tab: target_index(session, tab) for tab in TABS}
    seen = {}
    counts = {"eligible": 0, "written": 0, "invalid": 0, "legacy": 0,
              "duplicate": 0, "attempted_before": 0, "reconciled": 0, "unresolved": 0,
              "conflict": 0, "quarantined": 0}
    for number, row in rows:
        if row[0] == "stable_id" or len(row) < 4:
            continue
        try:
            data = decode(row[0], row[3])
            if data is None:
                counts["legacy"] += 1
                continue
            key = (data["tab"], data["stable_id"])
            fingerprint = tuple(data["values"])
            if key in seen:
                if seen[key] != fingerprint:
                    raise RuntimeError("SPOOL_ID_CONTENT_CONFLICT")
                counts["duplicate"] += 1
                continue
            seen[key] = fingerprint
            args = append_request(data)
            digest = hashlib.sha256(row[3].encode("ascii")).hexdigest()[:16]
            state = row[4] if len(row) > 4 else ""
            applied = "APPLIED:" + digest
            claimed = "CLAIMED:" + digest
            if state and state not in (applied, claimed):
                counts["quarantined"] += 1
                continue
            present = match_target(stored[data["tab"]], data)
        except (ValueError, KeyError, TypeError, UnicodeError):
            counts["invalid"] += 1
            continue
        if state == applied:
            if not present:
                raise RuntimeError("APPLIED_READBACK_MISSING")
            counts["duplicate"] += 1
            continue
        if present:
            counts["duplicate"] += 1
            if apply:
                mark(session, number, applied)
                counts["reconciled"] += 1
            continue
        if state == claimed:
            # A timeout/denial may have happened after Google applied the append.
            # Absence is not proof that an unknown request can safely be replayed.
            counts["attempted_before"] += 1
            counts["unresolved"] += 1
            continue
        counts["eligible"] += 1
        if not apply:
            continue
        # Claim first. Never automatically reappend after an uncertain write.
        mark(session, number, claimed)
        response = session.post(f"{API}/{SHADOW}:batchUpdate",
                                json={"requests": args["requests"]}, timeout=60)
        response.raise_for_status()
        # Full readback checks BOTH identity and all values, beyond row 1000.
        refreshed = target_index(session, data["tab"])
        if not match_target(refreshed, data):
            raise RuntimeError("WRITE_READBACK_UNKNOWN")
        stored[data["tab"]] = refreshed
        mark(session, number, applied)
        counts["written"] += 1
    return counts

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
        result = run(AuthorizedSession(creds), apply=flag)
    except Exception as exc:
        # Never print row contents, provider response bodies, or credentials.
        print(json.dumps({"status": "STOP_NO_RETRY", "error_class": type(exc).__name__}), file=sys.stderr)
        return 1
    status = "PARTIAL_RECONCILIATION" if result["unresolved"] or result["quarantined"] else (
        "READBACK_VERIFIED" if flag else "PREFLIGHT")
    print(json.dumps({"status": status, **result}))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
