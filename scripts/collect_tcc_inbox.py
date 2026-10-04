"""Incremental, fail-closed collector for the public TCC Writer inbox."""
from __future__ import annotations

import base64
import hashlib
import json
import os
import urllib.parse
from urllib.error import HTTPError
from pathlib import Path

try:
    from scripts.github_api_read import read_api_json
except ModuleNotFoundError:  # direct `python scripts/collect_tcc_inbox.py`
    from github_api_read import read_api_json

INBOX_PREFIX = "inbox/"
INBOX_SUFFIX = ".json"
RESOLVED_OUTCOMES = {"APPLIED", "ALREADY_APPLIED", "REJECTED_TERMINAL"}
MAX_COMPARE_PAGES = 10


def _valid_path(value: object) -> str:
    path = str(value or "")
    if not path.startswith(INBOX_PREFIX) or not path.endswith(INBOX_SUFFIX):
        return ""
    if ".." in Path(path).parts:
        return ""
    return path


def _compare_changes(api, repo: str, base: str, head: str):
    """Collect compare metadata; use a tree reconciliation if the API caps it."""
    changes = {}
    total_commits = 0
    raw_file_count = 0
    page_cap_reached = False
    comparison_status = ""
    for page in range(1, MAX_COMPARE_PAGES + 1):
        query = urllib.parse.urlencode({"per_page": 100, "page": page})
        comparison = api(f"https://api.github.com/repos/{repo}/compare/{base}...{head}?{query}")
        commits = comparison.get("commits") or []
        total_commits = max(total_commits, int(comparison.get("total_commits") or 0))
        comparison_status = str(comparison.get("status") or comparison_status)
        page_files = comparison.get("files") or []
        raw_file_count += len(page_files)
        for item in page_files:
            path = _valid_path(item.get("filename"))
            if path:
                changes[path] = item
        if len(commits) < 100:
            break
        if page == MAX_COMPARE_PAGES:
            page_cap_reached = True
    # Compare responses cap the combined file list. A full current-tree read is
    # the recovery path; the saved per-path blob identities make it inexpensive.
    capped = (raw_file_count >= 300 or total_commits > 250 or page_cap_reached
              or comparison_status in {"diverged", "behind"})
    return changes, capped


def _inbox_tree(api, repo: str, head: str):
    """Walk only the inbox tree, failing closed if GitHub reports truncation."""
    root = api(f"https://api.github.com/repos/{repo}/git/trees/{head}")
    if root.get("truncated"):
        raise RuntimeError("GitHub root tree is truncated; refusing to advance inbox cursor")
    inbox = next((item for item in root.get("tree", [])
                  if item.get("type") == "tree" and item.get("path") == "inbox"), None)
    if not inbox:
        return {}
    found = {}
    stack = [(INBOX_PREFIX.rstrip("/"), str(inbox.get("sha") or ""))]
    while stack:
        prefix, tree_sha = stack.pop()
        if not tree_sha:
            raise RuntimeError("Inbox tree entry has no object SHA")
        tree = api(f"https://api.github.com/repos/{repo}/git/trees/{tree_sha}")
        if tree.get("truncated"):
            raise RuntimeError("GitHub inbox tree is truncated; refusing to advance inbox cursor")
        for item in tree.get("tree", []):
            path = f"{prefix}/{item.get('path') or ''}"
            if item.get("type") == "tree":
                stack.append((path, str(item.get("sha") or "")))
            elif item.get("type") == "blob" and _valid_path(path):
                found[path] = str(item.get("sha") or "")
    return found


def _blob_bytes(api, repo: str, head: str, path: str, blob_sha: str):
    if blob_sha:
        blob = api(f"https://api.github.com/repos/{repo}/git/blobs/{blob_sha}")
        if blob.get("encoding") != "base64" or not isinstance(blob.get("content"), str):
            raise RuntimeError(f"Unexpected GitHub blob representation for {path}")
        return base64.b64decode(blob["content"], validate=False)
    # Compatibility fallback for compare records that omit the blob SHA. The
    # captured head, never the moving branch name, pins this read.
    url = "https://raw.githubusercontent.com/" + repo + "/" + head + "/" + urllib.parse.quote(path, safe="/")
    import urllib.request
    request = urllib.request.Request(url, headers={"User-Agent": "nexo-writer-robot"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read()


def cursor_resolved(cursor: dict, path: str, fingerprint: str) -> bool:
    acked = cursor.get("acked") or {}
    receipts = cursor.get("receipts") or {}
    if acked.get(path) == fingerprint:
        return True
    value = receipts.get(path)
    if isinstance(value, dict):
        if value.get("fingerprint") != fingerprint:
            return False
        outcome = value.get("outcome")
        # Preserve pre-OPERATION_RECEIPT_V1 acknowledgements.
        return outcome in RESOLVED_OUTCOMES if outcome else True
    return value == fingerprint


def collect_items(cursor: dict, current_blobs: dict, changed_paths: set[str], removed_paths: set[str],
                  read_blob, *, full_scan: bool):
    """Return changed or unresolved envelopes without reading resolved blobs."""
    known_blobs = cursor.get("blobs") or {}
    pending = cursor.get("pending") or {}
    candidate_paths = set(changed_paths) | set(pending)
    if full_scan:
        candidate_paths.update(path for path, sha in current_blobs.items()
                               if known_blobs.get(path) != sha)
    candidate_paths.difference_update(removed_paths)
    candidate_paths.intersection_update(current_blobs)

    items = []
    for path in sorted(candidate_paths):
        blob_sha = str(current_blobs.get(path) or "")
        if not blob_sha:
            raise RuntimeError(f"Current inbox path has no blob SHA: {path}")
        # A pending item is always retried, even when its content did not move.
        if known_blobs.get(path) == blob_sha and path not in pending:
            continue
        raw = read_blob(path, blob_sha)
        fingerprint = hashlib.sha256(raw).hexdigest()
        if cursor_resolved(cursor, path, fingerprint):
            continue
        try:
            envelope = json.loads(raw.decode("utf-8-sig"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            # Invalid files remain unacknowledged and will be reconsidered when
            # their blob changes or a bounded full reconciliation runs.
            continue
        stable = hashlib.sha256((path + "\0" + fingerprint).encode()).hexdigest()[:32]
        items.append({"id": "tcc-" + stable, "path": path, "fingerprint": fingerprint,
                      "blob_sha": blob_sha, "envelope": envelope})
    return items


def record_cursor_outcomes(cursor: dict, mapping: dict, reported: set[str], resolved: set[str],
                           receipt_items: dict, observed_at: str, tower_revision: str = ""):
    """Persist terminal receipts and retain every unresolved blob for retry."""
    acked = cursor.setdefault("acked", {})
    receipts = cursor.setdefault("receipts", {})
    pending = cursor.setdefault("pending", {})
    blobs = cursor.setdefault("blobs", {})
    for old_path, old_fp in list(acked.items()):
        receipts.setdefault(old_path, {"fingerprint": old_fp, "source": "legacy-acked"})

    for removed in mapping.get("removed_paths") or []:
        pending.pop(removed, None)
        blobs.pop(removed, None)
    observed = mapping.get("observed_blobs") or {}
    blobs.update({str(path): str(sha) for path, sha in observed.items() if path and sha})
    if mapping.get("blob_index_complete"):
        cursor["blob_index_complete"] = True

    for item in mapping.get("items") or []:
        item_id = item.get("id")
        path = item["path"]
        fingerprint = item["fingerprint"]
        blob_sha = item.get("blob_sha")
        if item_id not in reported:
            pending[path] = {"fingerprint": fingerprint, "blob_sha": blob_sha,
                             "reason": "NOT_REPORTED", "observed_at": observed_at}
            continue
        public = receipt_items.get(item_id) or {}
        outcome = public.get("outcome")
        receipts[path] = {
            "fingerprint": fingerprint,
            "outcome": outcome,
            "receipt_ids": public.get("receipt_ids", []),
            "receipts": public.get("receipts", []),
            "observed_at": observed_at,
            "tower_revision": tower_revision or None,
        }
        if item_id in resolved and outcome in RESOLVED_OUTCOMES:
            acked[path] = fingerprint
            pending.pop(path, None)
        else:
            acked.pop(path, None)
            pending[path] = {"fingerprint": fingerprint, "blob_sha": blob_sha,
                             "reason": outcome or "UNRESOLVED", "observed_at": observed_at}

    # Pending identities are durable before the delta base advances. This is
    # what makes DEFERRED_DEPENDENCY retryable after a later unrelated commit.
    cursor["base_commit"] = mapping.get("head_sha") or cursor.get("base_commit")
    cursor["acked"] = {}
    return cursor


def collect(repo: str, branch: str, event: str, cursor: dict, api=read_api_json):
    base = str(cursor.get("base_commit") or "").strip()
    if not base:
        raise RuntimeError("public inbox cursor missing base_commit")
    ref = api(f"https://api.github.com/repos/{repo}/git/ref/heads/{branch}")
    head = str((ref.get("object") or {}).get("sha") or "").strip()
    if not head:
        raise RuntimeError("public inbox ref missing head sha")

    full_scan = event == "workflow_dispatch" or not cursor.get("blob_index_complete")
    if full_scan:
        current_blobs = _inbox_tree(api, repo, head)
        changed_paths = set(current_blobs)
        removed_paths = set((cursor.get("blobs") or {}).keys()) - set(current_blobs)
        mode = "full-scan" if event == "workflow_dispatch" else "index-migration"
    else:
        try:
            changes, capped = _compare_changes(api, repo, base, head)
        except HTTPError as error:
            if error.code not in {404, 409, 422}:
                raise
            # The compare base may have aged out or branch history may have
            # moved. Reconcile path/blob identities against the current tree.
            changes, capped = {}, True
        if capped:
            current_blobs = _inbox_tree(api, repo, head)
            changed_paths = {path for path, sha in current_blobs.items()
                             if (cursor.get("blobs") or {}).get(path) != sha}
            removed_paths = set((cursor.get("blobs") or {}).keys()) - set(current_blobs)
            full_scan = True
            mode = "tree-recovery"
        else:
            changed_paths = set(changes)
            removed_paths = {path for path, item in changes.items() if item.get("status") == "removed"}
            for item in changes.values():
                previous = _valid_path(item.get("previous_filename"))
                if previous:
                    removed_paths.add(previous)
            current_blobs = dict(cursor.get("blobs") or {})
            for path, item in changes.items():
                previous = _valid_path(item.get("previous_filename"))
                if previous:
                    current_blobs.pop(previous, None)
                if item.get("status") == "removed":
                    current_blobs.pop(path, None)
                else:
                    current_blobs[path] = str(item.get("sha") or "")
            mode = "delta"

    pending = cursor.get("pending") or {}
    # Legacy cursors contain fingerprints but no blob index. First full scan is
    # a one-time content reconciliation; subsequent dispatches use SHA deltas.
    read_blob = lambda path, sha: _blob_bytes(api, repo, head, path, sha)
    items = collect_items(cursor, current_blobs, changed_paths | set(pending), removed_paths,
                          read_blob, full_scan=full_scan)
    gateway = {"items": [{"id": item["id"], "envelope": item["envelope"]} for item in items]}
    mapping = {
        "head_sha": head,
        "mode": mode,
        "blob_index_complete": full_scan,
        "items": [{key: value for key, value in item.items() if key != "envelope"} for item in items],
        "observed_blobs": current_blobs,
        "removed_paths": sorted(removed_paths),
    }
    return gateway, mapping


def main():
    cursor = json.loads(Path("nexo-one/tcc-public-inbox-ack.json").read_text(encoding="utf-8"))
    repo = os.environ["TCC_REPO"]
    branch = os.environ.get("TCC_BRANCH", "nexo-inbox")
    event = os.environ.get("EVENT_NAME", "")
    gateway, mapping = collect(repo, branch, event, cursor)
    Path("/tmp/gateway.json").write_text(json.dumps(gateway, ensure_ascii=False), encoding="utf-8")
    Path("/tmp/tcc-public-map.json").write_text(json.dumps(mapping, ensure_ascii=False), encoding="utf-8")
    print("public TCC inbox items", len(mapping["items"]), "mode", mapping["mode"])


if __name__ == "__main__":
    main()
