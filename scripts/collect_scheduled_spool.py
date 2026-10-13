"""Read the private Sheet spool independently, reconciling exact Writer receipts.

No public acknowledgement ledger is read or written. Failure leaves the existing
gateway feed intact; the singleton Writer still collects its independent inbox.
"""
from __future__ import annotations

import base64
import csv
import io
import json
import os
from pathlib import Path
import re
import runpy
import time
from types import SimpleNamespace

from scripts.scheduled_spool_policy import ScheduledSpoolError, validate_scheduled_envelope

try:
    from requests.exceptions import ConnectionError as RequestsConnectionError, Timeout
    READ_ERRORS = (RequestsConnectionError, Timeout, TimeoutError)
except ImportError:  # Read-only adapters and tests can use a standard-library session.
    READ_ERRORS = (ConnectionError, TimeoutError)

TOWER_ID = "1m97cFmEkw19yiqD_6FWPG4j1lDCAYM4z"
DRIVE = "https://www.googleapis.com/drive/v3/files"
STABLE = re.compile(r"^[a-z0-9][a-z0-9._-]{0,121}$")


class SourceUnavailable(RuntimeError):
    def __init__(self, status):
        self.status = status
        super().__init__(status)


def get_bounded(session, url, *, params, pause=time.sleep):
    """Retry transient read failures on the same authorized source, at most 3x."""
    for attempt in range(3):
        try:
            response = session.get(url, params=params, timeout=15)
        except READ_ERRORS:
            status = "TRANSPORT_TIMEOUT"
        else:
            if response.status_code in {401, 403}:
                raise SourceUnavailable("AUTHORIZATION_DENIED")
            if response.status_code == 200:
                return response
            if response.status_code not in {408, 429, 500, 502, 503, 504}:
                raise SourceUnavailable("HTTP_REJECTED")
            status = "TRANSIENT_HTTP"
        if attempt < 2:
            pause(2 ** attempt)
    raise SourceUnavailable(status)


def load_runtime(bundle="/tmp/nexo_gpt_writer.py"):
    # Use the same inspected Writer bundle selected by this workflow. Loading
    # with a non-main name exposes its reader; it does not run the Writer CLI.
    runpy.run_path(bundle, run_name="nexo_spool_reader")
    from runtime.nexo_agent_api import gpt_writer, inbox_client, live_tower, operation_receipts
    if getattr(gpt_writer, "PRIVATE_SHEET_SPOOL_CONTRACT", None) != "NEXO_PRIVATE_SHEET_SPOOL_V1":
        raise SourceUnavailable("WRITER_BUNDLE_INCOMPATIBLE")
    return SimpleNamespace(receipt_status=inbox_client.receipt_status,
                           receipt_index=inbox_client.receipt_index,
                           payload_hash=operation_receipts.payload_hash,
                           read=live_tower.read_live_tower_bytes,
                           verify=live_tower.verify_live_tower)


def collect(session, spool_id, gateway, runtime, *, pause=time.sleep):
    response = get_bounded(session, f"{DRIVE}/{TOWER_ID}",
                           params={"alt": "media", "supportsAllDrives": "true"}, pause=pause)
    tower = runtime.read(response.content)
    revision = runtime.verify(tower)
    if tower.get("stable_file_id") != TOWER_ID or tower.get("revision") != revision:
        raise ValueError("CANONICAL_TOWER_ID_OR_REVISION_INVALID")
    index = runtime.receipt_index(tower)
    response = get_bounded(session, f"{DRIVE}/{spool_id}/export",
                           params={"mimeType": "text/csv"}, pause=pause)
    reader = csv.DictReader(io.StringIO(response.text))
    if not {"stable_id", "envelope_b64url"}.issubset(reader.fieldnames or []):
        raise ValueError("SHEET_EXPORT_FIELDS_INVALID")
    additions, seen, rejected, resolved = [], {}, 0, 0
    for row in reader:
        stable = (row.get("stable_id") or "").strip().lower()
        raw = (row.get("envelope_b64url") or "").strip()
        if not stable or not raw:
            continue
        if not STABLE.fullmatch(stable):
            rejected += 1
            continue
        try:
            if stable.startswith("sched-v1-"):
                envelope = validate_scheduled_envelope(row)
            else:
                # Earlier rows keep the original admission contract, but never
                # accept a truncated/non-object payload or duplicate JSON keys.
                from scripts.scheduled_spool_policy import _no_duplicate_keys, _nonfinite
                envelope = json.loads(base64.b64decode(raw + "=" * (-len(raw) % 4),
                    altchars=b"-_", validate=True).decode("utf-8"),
                    object_pairs_hook=_no_duplicate_keys, parse_constant=_nonfinite)
                if not isinstance(envelope, dict):
                    raise ValueError("ENVELOPE_INVALID")
        except (ValueError, UnicodeError, ScheduledSpoolError):
            rejected += 1
            continue
        digest = runtime.payload_hash(envelope)
        if stable in seen:
            if seen[stable] != digest:
                raise ValueError("SHEET_STABLE_ID_CONFLICT")
            continue
        seen[stable] = digest
        item_id = "sheet-" + stable
        intent = envelope.get("intent_id") or "gateway:" + item_id
        status = runtime.receipt_status(tower, {"intent_id": intent, "payload_sha256": digest}, index=index)
        receipt = status.get("receipt") or {}
        if receipt.get("outcome") in {"APPLIED", "ALREADY_APPLIED", "REJECTED_TERMINAL"}:
            resolved += 1
            continue
        additions.append({"id": item_id, "source": "SHEET_PRIVATE", "envelope": envelope})
    # Only commit this source once every read and identity check completed.
    return {**gateway, "items": [*(gateway.get("items") or []), *additions]}, {
        "collected": len(additions), "resolved": resolved, "rejected": rejected,
    }


def authorized_session():
    from google.oauth2 import service_account
    from google.auth.transport.requests import AuthorizedSession
    credentials = service_account.Credentials.from_service_account_info(
        json.loads(os.environ["GOOGLE_SERVICE_ACCOUNT_JSON"]),
        scopes=["https://www.googleapis.com/auth/drive.readonly"])
    return AuthorizedSession(credentials)


def main():
    path = Path(os.environ.get("NEXO_GATEWAY_ITEMS", "/tmp/gateway.json"))
    try:
        gateway = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {"items": []}
        result, counts = collect(authorized_session(), os.environ["SPOOL_ID"],
                                 gateway, load_runtime())
        staged = path.with_suffix(".spool.tmp")
        staged.write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
        staged.replace(path)
        print(json.dumps({"sheet_spool": "COLLECTED", **counts}))
    except Exception as exc:
        # No URL, payload, identity or private receipt reaches public logs.
        print(json.dumps({"sheet_spool": "DEFERRED", "reason": getattr(exc, "status", type(exc).__name__)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
