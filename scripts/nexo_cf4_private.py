"""CF4 private transport. No result, exception text, URL or ID goes to stdout.

Configuration and credentials are read only by transport steps; the numerical
child receives neither. No permissions are created/changed and no upload retries
are performed. All scientific equations and frozen dataset bindings stay intact.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tarfile

API = "https://www.googleapis.com/drive/v3/files"
SCOPE = "https://www.googleapis.com/auth/drive"
RECIPE = Path("nexo-one/executor-runtime/recipes/cf4_velocity.py")
SHA = re.compile(r"[0-9a-f]{64}\Z")
ID = re.compile(r"[A-Za-z0-9_-]{10,}\Z")


class PrivateDeliveryError(Exception):
    pass


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def checked(response):
    if not 200 <= response.status_code < 300:
        raise PrivateDeliveryError("DRIVE_OPERATION_FAILED")
    return response


def metadata(session, file_id):
    if not ID.fullmatch(file_id):
        raise PrivateDeliveryError("INVALID_FILE_ID")
    value = checked(session.get(API + "/" + file_id,
        params={"fields": "id,mimeType,trashed,parents,size,driveId"}, timeout=60)).json()
    # My Drive only: inherited shared-drive policies need a separate review.
    if value.get("trashed") is not False or value.get("driveId"):
        raise PrivateDeliveryError("UNSUPPORTED_DESTINATION")
    return value


def permissions(session, file_id, allowed=None):
    rows, token = [], None
    while True:
        query = {"fields": "permissions(id,type,deleted),nextPageToken", "pageSize": 100}
        if token:
            query["pageToken"] = token
        value = checked(session.get(API + "/" + file_id + "/permissions", params=query, timeout=60)).json()
        rows.extend(value.get("permissions", []))
        token = value.get("nextPageToken")
        if not token:
            break
    if not rows or any(p.get("deleted") or p.get("type") not in {"user", "group"}
                       or not p.get("id") or (allowed is not None and p["id"] not in allowed) for p in rows):
        raise PrivateDeliveryError("PRIVATE_ACL_REQUIRED")
    return rows


def session_from_env():
    from google.auth.transport.requests import AuthorizedSession
    from google.oauth2 import service_account
    creds = service_account.Credentials.from_service_account_info(
        json.loads(os.environ["GOOGLE_SERVICE_ACCOUNT_JSON"]), scopes=[SCOPE])
    return AuthorizedSession(creds)


def prepare(root, session):
    file_id = os.environ["CF4_PRIVATE_CONFIG_FILE_ID"]
    expected = os.environ["CF4_PRIVATE_CONFIG_SHA256"]
    if not SHA.fullmatch(expected):
        raise PrivateDeliveryError("CONFIG_HASH_REQUIRED")
    metadata(session, file_id)
    permissions(session, file_id)
    raw = checked(session.get(API + "/" + file_id, params={"alt": "media"}, timeout=60)).content
    if len(raw) > 65536 or digest(raw) != expected:
        raise PrivateDeliveryError("CONFIG_BINDING_FAILED")
    cfg = json.loads(raw)
    if cfg.get("schema") != "NEXO_CF4_PRIVATE_V1" or not isinstance(cfg.get("params"), dict):
        raise PrivateDeliveryError("CONFIG_SCHEMA_INVALID")
    allowed = cfg.get("allowed_permission_ids")
    if not isinstance(allowed, list) or not allowed or any(not isinstance(x, str) or not x for x in allowed):
        raise PrivateDeliveryError("ACL_ALLOWLIST_REQUIRED")
    permissions(session, file_id, allowed)
    folder = cfg["output_folder_id"]
    if metadata(session, folder).get("mimeType") != "application/vnd.google-apps.folder":
        raise PrivateDeliveryError("PRIVATE_FOLDER_REQUIRED")
    permissions(session, folder, allowed)
    if cfg.get("recipe_sha256") != digest(RECIPE.read_bytes()):
        raise PrivateDeliveryError("RECIPE_BINDING_FAILED")
    (root / "config.json").write_bytes(raw)
    (root / "params.json").write_text(json.dumps(cfg["params"], allow_nan=False), encoding="utf-8")


def execute(root, invoke=subprocess.run):
    cfg = json.loads((root / "config.json").read_text())
    if cfg.get("recipe_sha256") != digest(RECIPE.read_bytes()):
        raise PrivateDeliveryError("RECIPE_BINDING_FAILED")
    # Deliberately no inherited credentials, Actions tokens, command files or PYTHONPATH.
    env = {"PATH": os.defpath, "HOME": str(root), "LANG": "C.UTF-8", "OPENBLAS_NUM_THREADS": "1",
           "OMP_NUM_THREADS": "1", "PARAMS_PATH": str(root / "params.json"),
           "RESULT_PATH": str(root / "result.json"), "NEXO_CF4_PRIVATE_OUTPUT": "1"}
    with (root / "run.log").open("wb") as log:
        try:
            proc = invoke([sys.executable, str(RECIPE.resolve())], env=env, cwd=root,
                          stdout=log, stderr=subprocess.STDOUT, timeout=18000, check=False)
            rc = proc.returncode
        except subprocess.TimeoutExpired:
            rc = 124
    (root / "execution.json").write_text(json.dumps({"exit_code": rc}), encoding="utf-8")
    if rc:
        raise PrivateDeliveryError("COMPUTE_FAILED")
    value = json.loads((root / "result.json").read_text())
    if not isinstance(value, dict) or not {"verdict", "decision", "summary", "statistics", "semantic"} <= value.keys():
        raise PrivateDeliveryError("RESULT_SCHEMA_INVALID")


def upload(root, session):
    cfg = json.loads((root / "config.json").read_text())
    folder, allowed = cfg["output_folder_id"], cfg["allowed_permission_ids"]
    if metadata(session, folder).get("mimeType") != "application/vnd.google-apps.folder":
        raise PrivateDeliveryError("PRIVATE_FOLDER_REQUIRED")
    permissions(session, folder, allowed)
    files = [p for p in (root / n for n in ("params.json", "execution.json", "result.json", "run.log")) if p.is_file()]
    if not files:
        raise PrivateDeliveryError("NO_PRIVATE_OUTPUT")
    manifest = {"schema": "NEXO_CF4_PRIVATE_RESULT_V1", "recipe_sha256": cfg["recipe_sha256"],
                "config_sha256": digest((root / "config.json").read_bytes()),
                "revision": os.environ["GITHUB_SHA"], "run_id": os.environ["GITHUB_RUN_ID"],
                "run_attempt": os.environ["GITHUB_RUN_ATTEMPT"],
                "files": {p.name: {"bytes": p.stat().st_size, "sha256": digest(p.read_bytes())} for p in files}}
    (root / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w:gz") as archive:
        for path in files + [root / "manifest.json"]:
            archive.add(path, arcname=path.name, recursive=False)
    payload = buffer.getvalue()
    # No automatic retries after an uncertain create. Reconcile manually by run identity.
    name = "cf4-" + os.environ["GITHUB_RUN_ID"] + "-" + os.environ["GITHUB_RUN_ATTEMPT"] + ".tar.gz"
    boundary = "nexo_cf4_" + os.urandom(16).hex()
    body = (f"--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n".encode()
            + json.dumps({"name": name, "parents": [folder]}).encode()
            + f"\r\n--{boundary}\r\nContent-Type: application/gzip\r\n\r\n".encode()
            + payload + f"\r\n--{boundary}--\r\n".encode())
    reply = checked(session.post("https://www.googleapis.com/upload/drive/v3/files",
        params={"uploadType": "multipart", "fields": "id"},
        headers={"Content-Type": "multipart/related; boundary=" + boundary}, data=body, timeout=180)).json()
    file_id = reply["id"]
    # Keep uncertain delivery identity local before readback; never print it.
    (root / "delivery.json").write_text(json.dumps({"id": file_id, "verified": False}), encoding="utf-8")
    meta = metadata(session, file_id)
    permissions(session, file_id, allowed)
    permissions(session, folder, allowed)
    actual = checked(session.get(API + "/" + file_id, params={"alt": "media"}, timeout=180)).content
    if meta.get("parents") != [folder] or int(meta.get("size", -1)) != len(payload) or digest(actual) != digest(payload):
        raise PrivateDeliveryError("PRIVATE_READBACK_FAILED")
    (root / "delivery.json").write_text(json.dumps({"id": file_id, "verified": True,
        "bytes": len(payload), "sha256": digest(payload)}), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["prepare", "execute", "upload"])
    args = parser.parse_args()
    os.umask(0o077)
    root = Path(os.environ["RUNNER_TEMP"]) / "cf4-private"
    root.mkdir(mode=0o700, exist_ok=True)
    try:
        if args.action == "execute":
            execute(root)
        else:
            globals()[args.action](root, session_from_env())
    except Exception:
        # Details can include IDs, scientific arrays or Google credential errors.
        print("STATUS FAILED")
        return 1
    print("STATUS " + {"prepare": "PREPARED", "execute": "COMPUTED", "upload": "PRIVATE_READBACK_VERIFIED"}[args.action])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
