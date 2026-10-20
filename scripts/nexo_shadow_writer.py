#!/usr/bin/env python3
"""Existing NEXO writer: strictly one-way private Sheets spool -> Tower SHADOW.
Legacy Tower JSON envelopes cannot be converted into scientific claims.
The private spool's column E durably records an attempt BEFORE its append.
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
    values = data.get("values")
    if not isinstance(values, list) or len(values) != TABS[tab][1] or not all(isinstance(v, str) for v in values):
        raise ValueError("INVALID_WIDTH_OR_TYPE")
    if values[7 if tab == "MURAL" else 3] != stable_id:
        raise ValueError("MISMATCHED_ROW_ID")
    if tab == "MURAL" and not values[0]:
        raise ValueError("MISSING_TIME")
    return data

def append_request(data):
    values = [{"userEnteredValue": {"stringValue": value}} for value in data["values"]]
    args = {"spreadsheet_id": SHADOW, "requests": [{"appendCells": {
        "sheetId": TABS[data["tab"]][0], "rows": [{"values": values}],
        "fields": "userEnteredValue"}}]}
    count = len(json.dumps(args, ensure_ascii=False, separators=(",", ":")).encode("utf-16-le")) // 2
    if count > LIMIT:
        raise ValueError("FULL_ARGUMENTS_ABOVE_LIMIT")
    return args

def values(session, sheet, range_):
    path = quote(range_, safe="!:$'")
    r = session.get(f"{API}/{sheet}/values/{path}", timeout=60)
    r.raise_for_status()
    return r.json().get("values", [])

def mark(session, number, value):
    a1 = f"'Sheet1'!E{number}"
    path = quote(a1, safe="!:$'")
    r = session.put(f"{API}/{SPOOL}/values/{path}",
        params={"valueInputOption": "RAW"},
        json={"range": a1, "majorDimension": "ROWS", "values": [[value]]}, timeout=60)
    r.raise_for_status()
    if values(session, SPOOL, a1) != [[value]]:
        raise RuntimeError("STATE_READBACK_FAILED")

def run(session, *, apply=False):
    rows = values(session, SPOOL, "'Sheet1'!A1:E1000")
    if not rows or rows[0][:4] != ["stable_id", "created_at", "role", "envelope_b64url"]:
        raise RuntimeError("SPOOL_HEADER_MISMATCH")
    if len(rows) >= 1000:
        raise RuntimeError("SPOOL_CAPACITY_MUST_BE_REVIEWED")
    stored = {tab: {v[0] for v in values(session, SHADOW, f"'{tab}'!{c}2:{c}1000") if v}
              for tab, (_, _, c) in TABS.items()}
    seen = set()
    counts = {"eligible": 0, "written": 0, "invalid": 0,
              "legacy": 0, "duplicate": 0, "attempted_before": 0}
    for number, row in enumerate(rows[1:], 2):
        if len(row) < 4 or row[0] == "stable_id":
            continue
        if len(row) >= 5 and row[4]:
            counts["attempted_before"] += 1
            continue
        try:
            data = decode(row[0], row[3])
            if data is None:
                counts["legacy"] += 1
                continue
            key = (data["tab"], data["stable_id"])
            if key in seen or key[1] in stored[key[0]]:
                counts["duplicate"] += 1
                continue
            seen.add(key)
            args = append_request(data)
        except (ValueError, KeyError, TypeError, UnicodeError):
            counts["invalid"] += 1
            continue
        counts["eligible"] += 1
        if not apply:
            continue
        # Single-writer concurrency; claim FIRST. Any error leaves CLAIMED.
        # Future scheduled runs must not replay even when outcome is unknown.
        digest = hashlib.sha256(row[3].encode("ascii")).hexdigest()[:16]
        mark(session, number, "CLAIMED:" + digest)
        result = session.post(f"{API}/{SHADOW}:batchUpdate",
                              json={"requests": args["requests"]}, timeout=60)
        result.raise_for_status()  # never retry a denied append
        tab, unique_id = key
        found = [v[0] for v in values(session, SHADOW, f"'{tab}'!{TABS[tab][2]}2:{TABS[tab][2]}1000") if v]
        if found.count(unique_id) != 1:
            raise RuntimeError("WRITE_READBACK_UNKNOWN")
        stored[tab].add(unique_id)
        counts["written"] += 1
        mark(session, number, "APPLIED:" + digest)
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
        # Private row contents, URLs and provider response bodies stay in private Sheets.
        print(json.dumps({"status": "STOP_NO_RETRY", "error_class": type(exc).__name__}), file=sys.stderr)
        return 1
    print(json.dumps({"status": "READBACK_VERIFIED" if flag else "PREFLIGHT", **result}))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
