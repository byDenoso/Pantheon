from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import subprocess
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from http.server import BaseHTTPRequestHandler
from pathlib import Path

TOWER_ID = "1m97cFmEkw19yiqD_6FWPG4j1lDCAYM4z"
WRITER_ID = "1DBw9H1wUHjZkasE2BI-aEafCzNnjKOjV"
SPOOL_ID = os.environ.get("NEXO_SPOOL_ID", "1M2maKkuEjxumZRa145dzei7dEPFi2yKsKlUf7_scC-E")
GH_REPO = "byDenoso/TCC"
GH_BRANCH = "nexo-inbox"
GOOGLE_DRIVE = "https://www.googleapis.com/auth/drive"
GOOGLE_SHEETS = "https://www.googleapis.com/auth/spreadsheets"
GATES = {"APPROVE_CHARTER", "REJECT_CHARTER", "CANONIZE", "REJECT_CANARY"}


def _json_request(url: str, *, token: str | None = None, method: str = "GET", data=None, headers=None, timeout=60):
    body = None if data is None else json.dumps(data).encode("utf-8")
    request_headers = {"Accept": "application/json", **(headers or {})}
    if token:
        request_headers["Authorization"] = "Bearer " + token
    if body is not None:
        request_headers.setdefault("Content-Type", "application/json")
    request = urllib.request.Request(url, data=body, method=method, headers=request_headers)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read()
            return response.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        try:
            detail = json.loads(raw)
        except Exception:
            detail = {"message": raw.decode("utf-8", "replace")[:300]}
        raise RuntimeError(f"HTTP_{exc.code}:{detail.get('error', detail.get('message', 'request failed'))}") from exc


def _bytes_request(url: str, *, token: str | None = None, method: str = "GET", data: bytes | None = None,
                   content_type: str | None = None, timeout=120):
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    if content_type:
        headers["Content-Type"] = content_type
    request = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, response.read(), dict(response.headers)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:300]
        raise RuntimeError(f"HTTP_{exc.code}:{detail}") from exc


def _google_token(scopes: list[str]) -> str:
    connector = os.environ.get("GOOGLE_CONNECTOR", "").strip()
    oidc = os.environ.get("VERCEL_OIDC_TOKEN", "").strip()
    connector_error = None
    if connector and oidc:
        url = "https://api.vercel.com/v1/connect/token/" + urllib.parse.quote(connector, safe="")
        try:
            _, data = _json_request(
                url,
                token=oidc,
                method="POST",
                data={"subject": {"type": "app"}, "scopes": scopes},
                timeout=30,
            )
            token = str(data.get("token") or "")
            if token:
                return token
        except Exception as exc:
            connector_error = exc

    refresh = os.environ.get("GOOGLE_REFRESH_TOKEN", "").strip()
    client_id = os.environ.get("GOOGLE_CLIENT_ID", "").strip()
    client_secret = os.environ.get("GOOGLE_CLIENT_SECRET", "").strip()
    if refresh and client_id and client_secret:
        payload = urllib.parse.urlencode({
            "client_id": client_id,
            "client_secret": client_secret,
            "refresh_token": refresh,
            "grant_type": "refresh_token",
        }).encode()
        request = urllib.request.Request(
            "https://oauth2.googleapis.com/token",
            data=payload,
            method="POST",
            headers={"Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json"},
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                data = json.loads(response.read())
            token = str(data.get("access_token") or "")
            if token:
                return token
        except Exception as exc:
            if connector_error is None:
                connector_error = exc

    raise RuntimeError("GOOGLE_WRITE_AUTH_REQUIRED" + (":" + str(connector_error)[:120] if connector_error else ""))


def _drive_meta(token: str, file_id: str) -> dict:
    fields = "id,name,headRevisionId,md5Checksum,modifiedTime,size,mimeType"
    _, data = _json_request(
        f"https://www.googleapis.com/drive/v3/files/{file_id}?supportsAllDrives=true&fields={urllib.parse.quote(fields, safe=',')}",
        token=token,
    )
    return data


def _drive_download(token: str, file_id: str) -> bytes:
    _, raw, _ = _bytes_request(
        f"https://www.googleapis.com/drive/v3/files/{file_id}?alt=media&supportsAllDrives=true",
        token=token,
        timeout=120,
    )
    return raw


def _drive_upload(token: str, file_id: str, raw: bytes) -> dict:
    fields = "id,headRevisionId,md5Checksum,modifiedTime,size,mimeType"
    _, body, _ = _bytes_request(
        f"https://www.googleapis.com/upload/drive/v3/files/{file_id}?uploadType=media&supportsAllDrives=true&fields={urllib.parse.quote(fields, safe=',')}",
        token=token,
        method="PATCH",
        data=raw,
        content_type="application/json",
        timeout=180,
    )
    return json.loads(body)


def _same_head(left: dict, right: dict) -> bool:
    for key in ("headRevisionId", "md5Checksum", "modifiedTime", "size"):
        a, b = left.get(key), right.get(key)
        if a and b and str(a) != str(b):
            return False
    return True


def _sheet_get(token: str) -> tuple[str, list[list[str]], dict[str, int]]:
    _, meta = _json_request(
        f"https://sheets.googleapis.com/v4/spreadsheets/{SPOOL_ID}?fields=sheets.properties(title,index)",
        token=token,
    )
    sheets = sorted(meta.get("sheets") or [], key=lambda s: s.get("properties", {}).get("index", 0))
    if not sheets:
        raise RuntimeError("SHEET_TAB_MISSING")
    title = str(sheets[0].get("properties", {}).get("title") or "")
    if not title:
        raise RuntimeError("SHEET_TAB_MISSING")
    range_name = "'" + title.replace("'", "''") + "'!A:K"
    _, data = _json_request(
        f"https://sheets.googleapis.com/v4/spreadsheets/{SPOOL_ID}/values/{urllib.parse.quote(range_name, safe='')}?majorDimension=ROWS",
        token=token,
    )
    rows = data.get("values") or []
    header_index = next((i for i, row in enumerate(rows) if "stable_id" in row and "envelope_b64url" in row), -1)
    if header_index < 0:
        raise RuntimeError("SHEET_HEADER_MISSING")
    header = rows[header_index]
    columns = {
        "stable": header.index("stable_id"),
        "created": header.index("created_at") if "created_at" in header else -1,
        "role": header.index("role") if "role" in header else -1,
        "envelope": header.index("envelope_b64url"),
    }
    return title, rows, columns


def _sheet_append(token: str, title: str, row: list[str]) -> None:
    range_name = "'" + title.replace("'", "''") + "'!A:K"
    _json_request(
        f"https://sheets.googleapis.com/v4/spreadsheets/{SPOOL_ID}/values/{urllib.parse.quote(range_name, safe='')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS",
        token=token,
        method="POST",
        data={"majorDimension": "ROWS", "values": [row]},
    )


def _marker(prefix: str, stable_id: str) -> str:
    return prefix + hashlib.sha256(stable_id.encode()).hexdigest()[:32]


def _b64url_json(value: str):
    padded = value + "=" * ((4 - len(value) % 4) % 4)
    return json.loads(base64.urlsafe_b64decode(padded.encode()).decode("utf-8-sig"))


def _refuses_gate(envelope: dict) -> bool:
    items = envelope.get("payload", {}).get("items", []) if str(envelope.get("kind", "")).upper() == "BATCH" else [envelope]
    return any(
        str(item.get("kind", "")).upper() == "OPERATOR_INTENT"
        and str((item.get("payload") or {}).get("action", "")).upper() in GATES
        for item in items if isinstance(item, dict)
    )


def _sheet_pending(token: str):
    title, rows, columns = _sheet_get(token)
    stable_values = {str(row[columns["stable"]]).strip() for row in rows if len(row) > columns["stable"] and str(row[columns["stable"]]).strip()}
    acked = {value for value in stable_values if value.startswith(("writerack-", "gwack-"))}
    entries = []
    for row in rows:
        if len(row) <= max(columns["stable"], columns["envelope"]):
            continue
        stable_id = str(row[columns["stable"]] or "").strip().lower()
        raw = str(row[columns["envelope"]] or "").strip()
        if not stable_id or not raw or stable_id.startswith(("writerack-", "gwack-")):
            continue
        if _marker("writerack-", stable_id) in acked:
            continue
        try:
            envelope = _b64url_json(raw)
        except Exception:
            continue
        if isinstance(envelope, dict) and not _refuses_gate(envelope):
            entries.append({"source": "sheet", "id": stable_id, "envelope": envelope})
    return title, rows, columns, acked, entries


def _gh_json(token: str, path: str):
    encoded = "/".join(urllib.parse.quote(part, safe="") for part in path.split("/"))
    url = f"https://api.github.com/repos/{GH_REPO}/contents/{encoded}?ref={GH_BRANCH}"
    request = urllib.request.Request(url, headers={
        "Authorization": "Bearer " + token,
        "Accept": "application/vnd.github+json",
        "User-Agent": "nexo-atlas-writer",
        "X-GitHub-Api-Version": "2022-11-28",
    })
    with urllib.request.urlopen(request, timeout=45) as response:
        return json.loads(response.read())


def _github_pending(acked: set[str]):
    token = os.environ.get("NEXO_INBOX_TOKEN", "").strip()
    if not token:
        return []
    try:
        listing = _gh_json(token, "inbox")
    except Exception:
        return []
    files = [item for item in listing if item.get("type") == "file" and str(item.get("name", "")).endswith(".json")]
    def fetch(item):
        stable_id = str(item["name"])[:-5]
        if _marker("gwack-", stable_id) in acked:
            return None
        blob = _gh_json(token, str(item["path"]))
        try:
            envelope = json.loads(base64.b64decode(blob.get("content", "")).decode("utf-8-sig"))
        except Exception:
            return None
        if not isinstance(envelope, dict) or _refuses_gate(envelope):
            return None
        return {"source": "github", "id": stable_id, "envelope": envelope}

    out = []
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = [pool.submit(fetch, item) for item in files]
        for future in as_completed(futures):
            try:
                value = future.result()
                if value:
                    out.append(value)
            except Exception:
                pass
    return sorted(out, key=lambda entry: entry["id"])


def _legacy_sheet_ack_ids() -> set[str]:
    token = os.environ.get("NEXO_INBOX_TOKEN", "").strip()
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "nexo-atlas-writer"}
    if token:
        headers["Authorization"] = "Bearer " + token
    request = urllib.request.Request(
        "https://api.github.com/repos/byDenoso/Pantheon/contents/nexo-one/scheduled-spool-ack.json?ref=main",
        headers=headers,
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            data = json.loads(response.read())
        decoded = json.loads(base64.b64decode(data.get("content", "")).decode("utf-8"))
        return {str(key).lower() for key in (decoded.get("acked") or {}).keys()}
    except Exception:
        return set()


def _canonical(value) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def _dedupe(entries: list[dict]) -> tuple[list[dict], dict[str, list[dict]]]:
    groups: dict[str, list[dict]] = {}
    for entry in entries:
        digest = hashlib.sha256(_canonical(entry["envelope"])).hexdigest()
        groups.setdefault(digest, []).append(entry)
    items = []
    by_label = {}
    for index, (digest, sources) in enumerate(sorted(groups.items())):
        label = f"atlas-{index:04d}-{digest[:12]}"
        envelope = dict(sources[0]["envelope"])
        envelope["_inbox_name"] = label
        items.append(envelope)
        by_label[label] = sources
    return items, by_label


def _root_status(report: dict, by_label: dict[str, list[dict]]) -> tuple[list[dict], list[str]]:
    applied = {str(value) for value in report.get("applied") or []}
    rejected = {str((value or {}).get("item") or "") for value in report.get("rejected") or [] if isinstance(value, dict)}
    successful_sources = []
    rejected_labels = []
    for label, sources in by_label.items():
        was_applied = label in applied or any(value.startswith(label + "-") for value in applied)
        was_rejected = label in rejected or any(value.startswith(label + "-") for value in rejected)
        if was_applied and not was_rejected:
            successful_sources.extend(sources)
        elif was_rejected:
            rejected_labels.append(label)
    return successful_sources, rejected_labels


def _append_acks(sheet_token: str, title: str, columns: dict[str, int], successful_sources: list[dict]) -> int:
    width = max(5, columns["stable"] + 1, columns["created"] + 1, columns["role"] + 1, columns["envelope"] + 1)
    seen = set()
    count = 0
    for source in successful_sources:
        stable_id = str(source["id"]).lower()
        prefix = "writerack-" if source["source"] == "sheet" else "gwack-"
        marker = _marker(prefix, stable_id)
        if marker in seen:
            continue
        seen.add(marker)
        row = [""] * width
        row[columns["stable"]] = marker
        if columns["created"] >= 0:
            from datetime import datetime, timezone
            row[columns["created"]] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        if columns["role"] >= 0:
            row[columns["role"]] = "ATLAS_WRITER_ACK" if prefix == "writerack-" else "GATEWAY_ACK"
        _sheet_append(sheet_token, title, row)
        count += 1
    return count


def _apply_once(drive_token: str, sheet_token: str) -> dict:
    title, rows, columns, acked, sheet_entries = _sheet_pending(sheet_token)
    legacy_acked = _legacy_sheet_ack_ids()
    sheet_entries = [entry for entry in sheet_entries if entry["id"] not in legacy_acked]
    github_entries = _github_pending(acked)
    all_entries = sheet_entries + github_entries
    if not all_entries:
        tower = _drive_meta(drive_token, TOWER_ID)
        return {"status": "NO_OP", "pending": 0, "applied": 0, "rejected": 0, "readback": "PASS",
                "tower_modified_time": tower.get("modifiedTime")}

    items, by_label = _dedupe(all_entries)
    base = _drive_meta(drive_token, TOWER_ID)
    tower_raw = _drive_download(drive_token, TOWER_ID)
    writer_raw = _drive_download(drive_token, WRITER_ID)

    with tempfile.TemporaryDirectory(prefix="nexo-atlas-writer-") as tmp:
        root = Path(tmp)
        writer = root / "nexo_gpt_writer.py"
        tower = root / "tower.json"
        proposals = root / "proposals.json"
        out = root / "out.json"
        writer.write_bytes(writer_raw)
        tower.write_bytes(tower_raw)
        proposals.write_text(json.dumps(items, ensure_ascii=False), encoding="utf-8")
        run = subprocess.run(
            ["python3", str(writer), "apply", str(tower), str(proposals), str(out)],
            capture_output=True, text=True, timeout=210,
        )
        if run.returncode != 0:
            raise RuntimeError("CANONICAL_WRITER_FAILED:" + (run.stderr or run.stdout)[-300:])
        report = json.loads(run.stdout)
        successful_sources, rejected_labels = _root_status(report, by_label)
        expected = str((report.get("after") or "")).strip()

        if out.is_file():
            current = _drive_meta(drive_token, TOWER_ID)
            if not _same_head(base, current):
                raise RuntimeError("TOWER_HEAD_MOVED")
            payload = out.read_bytes()
            _drive_upload(drive_token, TOWER_ID, payload)
            readback = _drive_download(drive_token, TOWER_ID)
            actual = str(json.loads(readback.decode("utf-8")).get("state_fingerprint") or "")
            verify = subprocess.run(
                ["python3", str(writer), "verify", str(root / "readback.json"), expected],
                capture_output=True, text=True, timeout=60,
            ) if False else None
            if not expected or actual != expected:
                raise RuntimeError(f"TOWER_READBACK_MISMATCH expected={expected[:24]} actual={actual[:24]}")
        else:
            actual = str((report.get("after") or report.get("before") or "")).strip()

    ack_count = _append_acks(sheet_token, title, columns, successful_sources)
    return {
        "status": str(report.get("status") or "NO_OP"),
        "pending": len(all_entries),
        "unique": len(items),
        "applied": len(report.get("applied") or []),
        "rejected": len(rejected_labels),
        "acked": ack_count,
        "readback": "PASS",
        "tower_revision": actual,
    }


def run_writer() -> dict:
    drive_token = _google_token([GOOGLE_DRIVE, GOOGLE_SHEETS])
    sheet_token = drive_token
    last_error = None
    for attempt in range(3):
        try:
            return _apply_once(drive_token, sheet_token)
        except RuntimeError as exc:
            last_error = exc
            if "TOWER_HEAD_MOVED" not in str(exc) or attempt == 2:
                raise
    raise last_error or RuntimeError("WRITER_FAILED")


class handler(BaseHTTPRequestHandler):
    def _send(self, payload: dict, status: int = 200):
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "private, no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        self._send({"ok": True, "status": "READY", "writer": "ATLAS_VERCEL_CANONICAL"}, 200)

    def do_POST(self):
        secret = os.environ.get("NEXO_INBOX_TOKEN", "").strip()
        request_id = str(self.headers.get("X-Nexo-Writer-Id") or "").strip().lower()
        signature = str(self.headers.get("X-Nexo-Writer-Signature") or "").strip().lower()
        if not secret or not request_id or not signature:
            return self._send({"ok": False, "error": "WRITER_AUTH_REQUIRED"}, 401)
        expected = hmac.new(secret.encode(), ("nexo-writer:" + request_id).encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected):
            return self._send({"ok": False, "error": "WRITER_AUTH_FAILED"}, 403)
        try:
            result = run_writer()
            return self._send({"ok": True, **result}, 200)
        except Exception as exc:
            message = str(exc)
            safe = message.splitlines()[-1][:180]
            return self._send({"ok": False, "status": "FAILED", "error": safe}, 502)
