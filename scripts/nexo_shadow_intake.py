"""Read-only admission of typed MURAL proposals into the existing Actions pipeline.

A PEDIDO is never execution authority. The Writer's existing human-mandate,
quota, immutable-package and duplicate-run checks remain the only dispatch gate.
This module has no GitHub API calls, no mutation and no public artifact output.
"""
import hashlib
import json
import re

PREFIX = "NEXO_PUBLIC_BATTERY_V1"
BATTERY = re.compile(r"^bat-[a-z0-9-]{4,43}$")
DIGEST = re.compile(r"^[a-f0-9]{64}$")
IDENTITY = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:\-]{5,127}$")
ROLES = {"S1", "S2", "S3", "S4", "R", "D", "I", "P"}
HEADER = ("data", "de", "para", "texto", "link", "tipo", "item", "id")


def parse_request(text):
    """An intentionally small public-only pointer, never raw scientific input."""
    if not isinstance(text, str) or len(text) > 300:
        return None
    parts = text.split(" ")
    if len(parts) != 3 or parts[0] != PREFIX:
        return None
    battery, digest = parts[1:]
    if not BATTERY.fullmatch(battery) or not DIGEST.fullmatch(digest):
        return None
    return {"battery_id": battery, "package_sha256": digest}


def assess(rows):
    """Return pointers for review, NEVER commands for workflow_dispatch."""
    entries = iter(rows)
    try:
        header = next(entries)
    except StopIteration:
        raise ValueError("MURAL_HEADER_MISSING")
    if not isinstance(header, list) or tuple(header[:8]) != HEADER:
        raise ValueError("MURAL_HEADER_INVALID")
    unique = {}
    proposal_count = invalid = collisions = 0
    for row in entries:
        if not isinstance(row, list) or len(row) < 8 or row[5] != "PEDIDO":
            continue
        proposal_count += 1
        request = parse_request(row[3])
        if (not request or row[1] not in ROLES or not IDENTITY.fullmatch(str(row[7]))
                or not isinstance(row[6], str) or not row[6]
                or not isinstance(row[4], str) or len(row[4]) > 400):
            invalid += 1
            continue
        event_id = row[7]
        proof = hashlib.sha256(json.dumps({"event": event_id, "item": row[6],
            "role_claim": row[1], "request": request},sort_keys=True,separators=(",", ":")).encode()).hexdigest()
        candidate = {"event_id":event_id, "item":row[6], "request":request,
                     "request_sha256":proof, "status":"UNATTESTED_NEEDS_VERIFIED_HUMAN_MANDATE"}
        old = unique.setdefault(event_id, candidate)
        if old != candidate:
            collisions += 1
    return {"status":"READ_ONLY_NOT_DISPATCHED", "scanned": proposal_count,
            "candidates": list(unique.values()), "invalid": invalid, "conflicts": collisions}


def main():
    import os
    from scripts.nexo_shadow_writer import SHADOW, page_rows
    from google.oauth2 import service_account
    from google.auth.transport.requests import AuthorizedSession
    raw = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON")
    if not raw:
        raise SystemExit("PRIVATE_WRITER_CREDENTIAL_MISSING")
    credentials = service_account.Credentials.from_service_account_info(json.loads(raw),
        scopes=["https://www.googleapis.com/auth/spreadsheets.readonly"])
    session = AuthorizedSession(credentials)
    rows = [r for _, r in page_rows(session, SHADOW, "MURAL", "H")]
    report = assess(rows)
    print(json.dumps({"status":report["status"], "candidates":len(report["candidates"]),
                      "invalid":report["invalid"], "conflicts":report["conflicts"]}))
    return 0 if not report["conflicts"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
