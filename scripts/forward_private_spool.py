"""Bridge a private scheduled Sheets envelope into the EXISTING Drive Writer inbox.

No Tower mutation and no new credential. Only the existing Writer's authenticated
service account can run this code in its job. The two private Drive folders are
pinned; public Git/Gateway never receive these records. Handoff/TEST/review
semantics remain governed by the unchanged canonical Writer.

A Sheet write is useful when the ChatGPT scheduled file-export bridge is absent.
Do not use this as a substitute for a permission or policy denial.
"""
from __future__ import annotations

import base64
import hashlib
import json
import re
from datetime import datetime, timezone
from typing import Any

SPOOL_ID = "1M2maKkuEjxumZRa145dzei7dEPFi2yKsKlUf7_scC-E"
SHEET_NAME = "Sheet1"
INBOX_ID = "1NxhMy_HiGmHX2XHNLDDTRzqUoYY07HYR"
PROCESSED_ID = "1MOtsIKstwOH48eR2XwEy1tUefA-zWzt9"
DRIVE_API = "https://www.googleapis.com/drive/v3"
DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3/files"
SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets"
MAX_BYTES = 24576
MAX_TRANSFER_PER_PULSE = 32
STABLE_RE = re.compile(r"^sched-v2-[a-z0-9-]{1,51}$")
BASE64_RE = re.compile(r"^[A-Za-z0-9_-]+$")
ROLES = frozenset({
    "PITIA", "LEARNER", "EXECUTOR", "ADVISOR", "ENGINEER",
    "REFEREE_1", "REFUTADOR", "GUARDIAO", "SENTINEL",
    "DAILY", "EMERGENT", "CONVERSA",
})
HANDOFF_ROLES = frozenset({"LEARNER", "ADVISOR", "EXECUTOR", "DAILY", "EMERGENT"})
# Strict allowlist; Writer still evaluates every scientific gate and provenance.
# Never allow forged DENER approvals, direct CONTROL mutations, arbitrary scripts,
# unverifiable runner receipts, or privileged internal maintenance.
KINDS = frozenset({
    "BOARD_POST", "INTEGRITY_REPORT", "LEARNING_SIGNAL",
    "HANDOFF", "HANDOFF_TRANSITION",
    "HYPOTHESIS_PROPOSAL", "LESSON_PROPOSAL", "SEMANTIC_BACKFILL",
    "DATA_BINDING", "RECIPE_BIND", "ROADMAP_ATTACH",
    "ROADMAP_CHARTER", "FAMILY_CHARTER", "MUTATION_PROPOSAL",
    "CONTEST", "VERDICT_REVIEW", "TEST_BATTERY", "FITNESS_REPORT",
    "NEXO_THOUGHT",
})


class PrivateSpoolError(ValueError):
    pass


def _fail(code: str):
    raise PrivateSpoolError(code)


def _pairs_no_duplicates(pairs: list[tuple[str, Any]]) -> dict:
    result: dict = {}
    for key, value in pairs:
        if key in result:
            _fail("DUPLICATE_JSON_KEY")
        result[key] = value
    return result


def _role(role: Any) -> str:
    value = str(role or "").strip().upper()
    return "ADVISOR" if value == "ENGINEER" else value


def parse_row(row: dict) -> tuple[str, bytes, dict]:
    stable = str(row.get("stable_id") or "").strip().lower()
    if not STABLE_RE.fullmatch(stable):
        _fail("STABLE_ID_INVALID")
    encoded = row.get("envelope_b64url")
    if not isinstance(encoded, str) or not 1 <= len(encoded) <= 32768 or not BASE64_RE.fullmatch(encoded):
        _fail("ENCODING_INVALID")
    try:
        raw = base64.b64decode(
            encoded + "=" * (-len(encoded) % 4), altchars=b"-_", validate=True)
        if len(raw) > MAX_BYTES:
            _fail("ENVELOPE_TOO_LARGE")
        # Reject nonfinite constants, duplicate JSON fields and invalid UTF-8.
        envelope = json.loads(raw.decode("utf-8"), object_pairs_hook=_pairs_no_duplicates,
                              parse_constant=lambda _: _fail("NONFINITE_JSON"))
    except (ValueError, UnicodeError, TypeError):
        _fail("ENVELOPE_JSON_INVALID")
    if type(envelope) is not dict or set(envelope) != {
        "kind", "source", "created_at", "intent_id", "payload"
    }:
        _fail("ENVELOPE_FIELDS_INVALID")
    kind, source = envelope["kind"], envelope["source"]
    if type(kind) is not str or kind not in KINDS:
        _fail("KIND_NOT_AUTHORIZED")
    if type(source) is not str or source not in ROLES or row.get("role") != source:
        _fail("SOURCE_ROLE_INVALID")
    if type(envelope["payload"]) is not dict:
        _fail("PAYLOAD_INVALID")
    intent = envelope["intent_id"]
    if type(intent) is not str or not intent or len(intent) > 160 or intent != intent.strip():
        _fail("INTENT_INVALID")
    ts = envelope["created_at"]
    if type(ts) is not str or not ts.endswith(("Z", "+00:00")):
        _fail("TIMESTAMP_NOT_UTC")
    try:
        dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except ValueError:
        _fail("TIMESTAMP_INVALID")
    if dt.tzinfo is None or dt.utcoffset() != timezone.utc.utcoffset(dt):
        _fail("TIMESTAMP_NOT_UTC")
    if kind in {"HANDOFF", "HANDOFF_TRANSITION"}:
        if _role(source) not in HANDOFF_ROLES:
            _fail("HANDOFF_ROLE_NOT_AUTHORIZED")
        field, wrap = ("from_role", "handoff") if kind == "HANDOFF" else ("writer_role", "transition")
        payload = envelope["payload"]
        body = payload.get(wrap) if type(payload.get(wrap)) is dict else payload
        if type(body.get(field)) is not str or _role(body.get(field)) != _role(source):
            _fail("HANDOFF_ACTOR_MISMATCH")
    if kind == "MUTATION_PROPOSAL" and source != "EXECUTOR":
        _fail("RESULT_ROLE_NOT_AUTHORIZED")
    if kind == "CONTEST" and source not in {"REFEREE_1", "REFUTADOR", "SENTINEL"}:
        _fail("CONTEST_ROLE_NOT_AUTHORIZED")
    if kind == "VERDICT_REVIEW" and source not in {"REFEREE_1", "REFUTADOR"}:
        _fail("REVIEW_ROLE_NOT_AUTHORIZED")
    return stable, raw, envelope


def _checked_get(session, url: str, params: dict) -> dict:
    response = session.get(url, params=params, timeout=40)
    response.raise_for_status()
    body = response.json()
    if type(body) is not dict:
        _fail("DRIVE_JSON_RESPONSE_INVALID")
    return body


def _pinned_processed_folder(session) -> None:
    data = _checked_get(session, f"{DRIVE_API}/files/{PROCESSED_ID}",
                        {"fields": "id,mimeType,parents,trashed"})
    if (data.get("id") != PROCESSED_ID or data.get("mimeType") != "application/vnd.google-apps.folder"
            or INBOX_ID not in (data.get("parents") or []) or data.get("trashed") is True):
        _fail("PRIVATE_PROCESSED_FOLDER_MISMATCH")


def _find_exact(session, filename: str) -> list[dict]:
    matches = []
    for folder in (INBOX_ID, PROCESSED_ID):
        token = None
        while True:
            args = {
                "q": f"'{folder}' in parents and name = '{filename}' and trashed = false",
                "fields": "nextPageToken,files(id,name,mimeType,parents,size)",
                "pageSize": 100,
                "supportsAllDrives": "true",
                "includeItemsFromAllDrives": "true",
            }
            if token:
                args["pageToken"] = token
            data = _checked_get(session, f"{DRIVE_API}/files", args)
            for item in data.get("files") or []:
                if item.get("name") == filename and folder in (item.get("parents") or []):
                    matches.append(item)
            token = data.get("nextPageToken")
            if not token:
                break
    return matches


def _readback(session, file_id: str, expected: bytes) -> bool:
    info = _checked_get(session, f"{DRIVE_API}/files/{file_id}",
                        {"fields": "id,name,mimeType,parents,size,trashed"})
    if info.get("id") != file_id or info.get("mimeType") != "application/json":
        _fail("PRIVATE_INBOX_MIME_MISMATCH")
    if not set((info.get("parents") or [])) & {INBOX_ID, PROCESSED_ID}:
        _fail("PRIVATE_INBOX_PARENT_MISMATCH")
    if info.get("size") and int(info["size"]) != len(expected):
        _fail("PRIVATE_INBOX_LENGTH_MISMATCH")
    response = session.get(f"{DRIVE_API}/files/{file_id}",
                           params={"alt": "media", "supportsAllDrives": "true"}, timeout=60)
    response.raise_for_status()
    if response.content != expected:
        _fail("PRIVATE_INBOX_BYTES_MISMATCH")
    return True


def _create_json_file(session, filename: str, raw: bytes) -> str:
    # A single create-only multipart request; never create a Doc then edit it.
    boundary = "nexo-private-spool-multipart"
    meta = json.dumps({"name": filename, "parents": [INBOX_ID],
                       "mimeType": "application/json"}, separators=(",", ":")).encode("utf-8")
    body = (b"--" + boundary.encode() + b"\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n"
            + meta + b"\r\n--" + boundary.encode()
            + b"\r\nContent-Type: application/json\r\n\r\n"
            + raw + b"\r\n--" + boundary.encode() + b"--\r\n")
    response = session.post(
        DRIVE_UPLOAD,
        params={"uploadType": "multipart", "fields": "id,name,mimeType,parents,size",
                "supportsAllDrives": "true"},
        data=body,
        headers={"Content-Type": f"multipart/related; boundary={boundary}"},
        timeout=60,
    )
    response.raise_for_status()
    file_id = (response.json() or {}).get("id")
    if not isinstance(file_id, str) or not file_id:
        _fail("PRIVATE_INBOX_CREATE_NO_FILE_ID")
    return file_id


def deliver(session, stable: str, raw: bytes) -> str:
    filename = "nexo-private-spool-" + hashlib.sha256(stable.encode()).hexdigest()[:32] + ".json"
    files = _find_exact(session, filename)
    if len(files) > 1:
        _fail("PRIVATE_INBOX_DUPLICATE_IDENTITY")
    if files:
        file_id = files[0]["id"]
        _readback(session, file_id, raw)
        return "EXISTS"
    # Unknown outcome (timeout/network failure) is reconciled by _find_exact
    # next Writer pulse. Never immediately retry the same remote create.
    file_id = _create_json_file(session, filename, raw)
    _readback(session, file_id, raw)
    return "DELIVERED"


def _mark_private_sheet_delivery(session, line: int, row: dict, stable: str, digest: str) -> bool:
    # Verify the row still has the exact source identity and envelope before
    # writing ONLY column E. If it moved, skip ACK and reconcile next pulse.
    read = _checked_get(session,
        f"{SHEETS_API}/{SPOOL_ID}/values/{SHEET_NAME}!A{line}:D{line}",
        {"valueRenderOption": "UNFORMATTED_VALUE"})
    values = read.get("values") or []
    if len(values) != 1 or len(values[0]) < 4:
        return False
    if values[0][0] != stable or values[0][3] != row.get("envelope_b64url"):
        return False
    reply = session.put(
        f"{SHEETS_API}/{SPOOL_ID}/values/{SHEET_NAME}!E{line}",
        params={"valueInputOption": "RAW"},
        json={"range": f"{SHEET_NAME}!E{line}", "majorDimension": "ROWS",
              "values": [["DELIVERED:" + digest]]},
        timeout=30,
    )
    reply.raise_for_status()
    return reply.json().get("updatedCells") == 1


def forward_v2_rows(session, indexed_rows: list[tuple[int, dict]]) -> dict:
    """Independent, bounded transfers; one bad row never stalls another."""
    result = {"candidate": len(indexed_rows), "delivered": 0, "already_delivered": 0,
              "acked": 0, "invalid": 0, "transport_error": 0, "remaining": 0}
    attempted = 0
    _pinned_processed_folder(session)
    for line, row in indexed_rows:
        if attempted >= MAX_TRANSFER_PER_PULSE:
            result["remaining"] += 1
            continue
        try:
            stable, raw, _ = parse_row(row)
            digest = hashlib.sha256(raw).hexdigest()
            previous = str(row.get("writer_delivery") or "")
            if previous:
                if previous == "DELIVERED:" + digest:
                    result["already_delivered"] += 1
                    continue
                _fail("PRIVATE_SHEET_DELIVERY_CONFLICT")
            attempted += 1
            outcome = deliver(session, stable, raw)
            result["delivered" if outcome == "DELIVERED" else "already_delivered"] += 1
            try:
                if _mark_private_sheet_delivery(session, line, row, stable, digest):
                    result["acked"] += 1
            except Exception:
                # ACK is a projection. The durable Drive file and later Writer
                # readback remain authoritative; do not repeat the create.
                pass
        except PrivateSpoolError:
            result["invalid"] += 1
        except Exception:
            # Authorization failures do not cause an alternate credential or
            # a retry of a create with unknown outcome in this same pulse.
            result["transport_error"] += 1
    return result
