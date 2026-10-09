"""Trusted transport glue. Canonical state remains in Drive; no runner gets its credentials."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

try:
    from scripts.github_api_read import read_api_json, NoApiRedirect
    from scripts.collect_battery_runs import _decode_tower, valid_battery_run, battery_id_from_run, page_url
except ModuleNotFoundError:
    from github_api_read import read_api_json, NoApiRedirect
    from collect_battery_runs import _decode_tower, valid_battery_run, battery_id_from_run, page_url

ORIGIN = "https://nexo-one-two.vercel.app"
REPO = "byDenoso/Pantheon"
MODE = "CANONICAL_DRIVE_PACKAGE"
OPERATIONAL_MARKERS = {"nexo-one/tcc-public-inbox-ack.json", "nexo-one/scheduled-spool-ack.json", "nexo-one/tower-head.json"}
TOWER_ID = "1m97cFmEkw19yiqD_6FWPG4j1lDCAYM4z"
OPENER = urllib.request.build_opener(NoApiRedirect())


def request_json(url, *, token=None, body=None):
    headers = {"Accept": "application/json", "User-Agent": "nexo-autonomy-runtime"}
    if token:
        headers["Authorization"] = "Bearer " + token
    data = None
    if body is not None:
        data = json.dumps(body, ensure_ascii=False, allow_nan=False).encode()
        headers["Content-Type"] = "application/json"
    with OPENER.open(urllib.request.Request(url, data=data, headers=headers), timeout=30) as response:
        raw = response.read(1048577)
        if len(raw) > 1048576:
            raise ValueError("RESPONSE_TOO_LARGE")
        return json.loads(raw)


def oidc(audience):
    url = os.environ["ACTIONS_ID_TOKEN_REQUEST_URL"]
    parsed = urllib.parse.urlsplit(url)
    # The Actions-provided token endpoint is not a caller supplied callback.
    if parsed.scheme != "https" or not parsed.hostname or not parsed.hostname.endswith(".actions.githubusercontent.com"):
        raise ValueError("ACTIONS_TOKEN_ENDPOINT_INVALID")
    query = urllib.parse.parse_qsl(parsed.query)
    query.append(("audience", audience))
    url = urllib.parse.urlunsplit(parsed._replace(query=urllib.parse.urlencode(query)))
    return request_json(url, token=os.environ["ACTIONS_ID_TOKEN_REQUEST_TOKEN"])["value"]


def now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def timestamp(value):
    try:
        result = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return result if result.tzinfo else None
    except ValueError:
        return None


def fresh_writer_job(run, jobs, *, run_id, revision, checked_at):
    if (str(run.get("id")) != str(run_id) or run.get("head_sha") != revision
            or run.get("head_branch") != "main" or run.get("run_attempt") != 1
            or run.get("status") != "in_progress"
            or run.get("path") != ".github/workflows/nexo-writer-robot.yml"
            or run.get("head_repository", {}).get("full_name") != REPO):
        return None
    checked = timestamp(checked_at)
    for job in jobs.get("jobs") or []:
        started = timestamp(job.get("started_at"))
        labels = job.get("labels") or []
        if (checked and started and -60 <= (checked - started).total_seconds() <= 3600
                and job.get("name") == "write" and job.get("status") == "in_progress"
                and "ubuntu-latest" in labels and "self-hosted" not in labels
                and str(job.get("runner_name") or "").startswith("GitHub Actions")):
            return job
    return None


def implementation_matches(api, approved, current):
    if not re.fullmatch(r"[0-9a-f]{40}", current or ""):
        return False
    if approved == current:
        return True
    comparison = api(f"https://api.github.com/repos/{REPO}/compare/{approved}...{current}")
    files = comparison.get("files")
    # Writer receipts advance main without changing executable implementation.
    # Any code/content change, divergent history or truncated listing stops admission.
    return (comparison.get("status") == "ahead" and comparison.get("merge_base_commit", {}).get("sha") == approved
            and isinstance(files, list) and len(files) < 300
            and all(row.get("filename") in OPERATIONAL_MARKERS and row.get("status") != "renamed" for row in files))


def verified_context(gateway, *, verify, api, timestamp, implementation_revision=None,
                     current_run_id=None, current_revision=None):
    hashes = set()
    for item in gateway.get("items") or []:
        if not isinstance(item, dict) or not isinstance(item.get("envelope"), dict):
            continue
        envelope = item.get("envelope") or {}
        proof = envelope.get("_human_authorization")
        if not proof:
            continue
        try:
            answer = verify(envelope, proof)
            if not isinstance(answer, dict):
                continue
            value = answer.get("proposal_sha256")
            if answer.get("verified") is True and re.fullmatch(r"[0-9a-f]{64}", value or ""):
                hashes.add(value)
        except (OSError, ValueError, RuntimeError):
            pass  # Keep the proposal pending; no unverified authority is promoted.
    quota = {"status": "UNVERIFIED", "standard_public_runners": True,
             "additional_cost": 0, "checked_at": timestamp}
    try:
        repository = api(f"https://api.github.com/repos/{REPO}")
        workflow = api(f"https://api.github.com/repos/{REPO}/actions/workflows/nexo-test-battery.yml")
        if workflow.get("state") != "active":
            quota["status"] = "UNAVAILABLE"
        elif (repository.get("private") is False and repository.get("visibility") == "public"
              and re.fullmatch(r"[0-9a-f]{40}", implementation_revision or "")
              and implementation_matches(api, implementation_revision, current_revision)
              and re.fullmatch(r"[0-9]+", str(current_run_id or ""))):
            # Exact tested implementation, real hosted runner; no admin billing access.
            query = urllib.parse.urlencode({"head_sha": implementation_revision, "status": "success", "per_page": 5})
            runs = api(f"https://api.github.com/repos/{REPO}/actions/workflows/nexo-one-pr-ci.yml/runs?{query}")
            for run in runs.get("workflow_runs") or []:
                if (run.get("head_sha") != implementation_revision or run.get("status") != "completed"
                        or run.get("conclusion") != "success" or run.get("run_attempt") != 1
                        or run.get("head_repository", {}).get("full_name") != REPO):
                    continue
                jobs = api(f"https://api.github.com/repos/{REPO}/actions/runs/{int(run['id'])}/jobs")
                proven = [job for job in jobs.get("jobs") or [] if job.get("name") == "executor-runtime-smoke"
                          and job.get("status") == "completed" and job.get("conclusion") == "success"
                          and "ubuntu-latest" in (job.get("labels") or [])
                          and str(job.get("runner_name") or "").startswith("GitHub Actions")]
                if proven:
                    current = api(f"https://api.github.com/repos/{REPO}/actions/runs/{current_run_id}")
                    current_jobs = api(f"https://api.github.com/repos/{REPO}/actions/runs/{current_run_id}/jobs")
                    job = fresh_writer_job(current, current_jobs, run_id=current_run_id,
                                           revision=current_revision, checked_at=timestamp)
                    if job:
                        quota.update(status="AVAILABLE_FREE", capacity_run_ref=f"actions/runs/{current_run_id}",
                                     capacity_job_id=job["id"], capacity_started_at=job["started_at"],
                                     implementation_revision=implementation_revision,
                                     observed_revision=current_revision,
                                     tested_ci_run_ref=f"actions/runs/{run['id']}")
                    break
    except (OSError, ValueError, RuntimeError, TypeError, KeyError, AttributeError):
        pass
    return {"proposal_sha256": sorted(hashes), "capacity_observation": {"quota": quota}}


def capacity_candidate(tower):
    """Propose a measured stage from existing evidence; the Writer revalidates it."""
    files = tower.get("files") or {}
    def value(path):
        return files.get(path, {}).get("value", {})
    mandate = value("CONTROL.json").get("autonomy_mandate") or {}
    capacity = value("evolution/autonomy_capacity.json")
    if mandate.get("status") != "ACTIVE" or capacity.get("mandate_id") != mandate.get("id"):
        return {}
    stage = capacity.get("parallelism")
    if type(stage) is not int or stage not in {1, 2}:
        return {}
    batteries = {row.get("id"): row for row in value("evolution/batteries.json").get("batteries") or [] if isinstance(row, dict)}
    candidates = []
    for path, record in files.items():
        if not re.fullmatch(r"entities/evidence/[A-Za-z0-9_-]+\.json", path):
            continue
        report = record.get("value") if isinstance(record, dict) else None
        if not isinstance(report, dict):
            continue
        refs = report.get("battery_refs")
        if (report.get("schema") != "NEXO_CAPACITY_REVIEW_V1" or report.get("decision") != "PASS"
                or report.get("reviewer_role") != "GUARDIAO" or type(report.get("stage")) is not int or report["stage"] != stage
                or not isinstance(refs, list) or not refs or any(not isinstance(ref, str) for ref in refs)
                or len(refs) != len(set(refs))):
            continue
        if all(batteries.get(ref, {}).get("status") == "DONE"
               and batteries[ref].get("conclusion") == "success"
               and batteries[ref].get("mandate_id") == mandate["id"]
               and batteries[ref].get("parallelism") == stage for ref in refs):
            candidates.append({"parallelism": {1: 2, 2: 4}[stage], "review_ref": path, "battery_refs": refs})
    return candidates[0] if len(candidates) == 1 else {}


def read_tower():
    from google.oauth2 import service_account
    from google.auth.transport.requests import AuthorizedSession
    credentials = service_account.Credentials.from_service_account_info(
        json.loads(os.environ["GOOGLE_SERVICE_ACCOUNT_JSON"]),
        scopes=["https://www.googleapis.com/auth/drive.readonly"])
    response = AuthorizedSession(credentials).get(f"https://www.googleapis.com/drive/v3/files/{TOWER_ID}",
        params={"alt": "media", "supportsAllDrives": "true"}, timeout=120)
    response.raise_for_status()
    return _decode_tower(response.content)


def scientific_step_starts(battery, run, jobs, *, checked_at):
    """Read only exact matrix identities and an actively executing scientific step."""
    checked = timestamp(checked_at)
    created = timestamp(run.get("created_at"))
    rows = jobs.get("jobs") if isinstance(jobs, dict) else None
    if (not checked or not created or run.get("status") != "in_progress"
            or run.get("run_attempt") != 1 or not isinstance(rows, list)):
        return {}
    if jobs.get("total_count", len(rows)) != len(rows) or len(rows) > 100:
        return {}  # An incomplete job listing cannot prove a unique matrix shard.
    started = {}
    for index, spec in enumerate(battery.get("tests") or []):
        tid = spec.get("test_id")
        if not isinstance(tid, str) or not tid:
            continue
        names = {f"run ({tid}, {index})", f"run ({index}, {tid})"}
        matches = [job for job in rows if isinstance(job, dict) and job.get("name") in names]
        if len(matches) != 1:
            continue
        job = matches[0]
        job_start = timestamp(job.get("started_at"))
        # The attempt-specific jobs endpoint binds missing job.run_attempt fields.
        # GitHub's documented job schema omits that field; a present value must agree.
        if (str(job.get("run_id")) != str(run.get("id")) or job.get("run_attempt", 1) != 1
                or job.get("head_sha") != run.get("head_sha") or job.get("status") != "in_progress"
                or "ubuntu-latest" not in (job.get("labels") or [])
                or "self-hosted" in (job.get("labels") or [])
                or not str(job.get("runner_name") or "").startswith("GitHub Actions")
                or not job_start or job_start < created):
            continue
        steps = [step for step in job.get("steps") or [] if isinstance(step, dict)
                 and step.get("name") == "Run frozen scientific script"]
        if len(steps) != 1:
            continue
        step = steps[0]
        stamp = timestamp(step.get("started_at"))
        if (step.get("status") == "in_progress" and not step.get("completed_at")
                and stamp and job_start <= stamp <= checked):
            started[tid] = step["started_at"]
    return started


def reconcile(tower, runs, *, api=None, checked_at=None):
    batteries = tower["files"].get("evolution/batteries.json", {}).get("value", {}).get("batteries") or []
    updates = []
    for battery in batteries:
        if battery.get("transport") != MODE or battery.get("status") not in {"DISPATCH_PENDING", "DISPATCHED", "RUNNING"}:
            continue
        reserved_at = timestamp(battery.get("dispatch_requested_at"))
        revision = battery.get("source_revision")
        if not reserved_at or not re.fullmatch(r"[0-9a-f]{40}", revision or ""):
            continue
        matches = [run for run in runs if valid_battery_run(run) and battery_id_from_run(run) == battery.get("id")
                   and run.get("head_branch") == "main" and run.get("head_sha") == revision
                   and timestamp(run.get("created_at")) and timestamp(run["created_at"]) >= reserved_at
                   and int(run["run_attempt"]) == 1]
        # Ambiguous responses never release a second run. A human investigates.
        if len(matches) != 1:
            continue
        run = matches[0]
        ref = f"actions/runs/{run['id']}"
        if battery.get("run_ref") and battery["run_ref"] != ref:
            continue
        updates.append({"kind": "BATTERY_STATUS", "source": "WRITER_ROBOT", "payload": {
            "battery_id": battery["id"], "status": "DISPATCHED", "run_ref": ref, "run_attempt": 1}})
        if api is not None and run.get("status") == "in_progress":
            try:
                jobs = api(f"https://api.github.com/repos/{REPO}/actions/runs/{run['id']}/attempts/1/jobs?per_page=100")
                current = api(f"https://api.github.com/repos/{REPO}/actions/runs/{run['id']}")
                # A retry or completion while jobs are being read cannot publish stale progress.
                if (current.get("id") != run["id"] or current.get("run_attempt") != 1
                        or current.get("head_sha") != revision or current.get("head_branch") != "main"
                        or current.get("status") != "in_progress"):
                    continue
                started = scientific_step_starts(battery, run, jobs, checked_at=checked_at or now())
            except (OSError, ValueError, RuntimeError, TypeError, KeyError, AttributeError):
                continue
            if started:
                updates.append({"kind": "BATTERY_STATUS", "source": "WRITER_ROBOT", "payload": {
                    "battery_id": battery["id"], "status": "RUNNING", "run_ref": ref,
                    "run_attempt": 1, "started_tests": started}})
    return updates


def validate_package(document, battery_id):
    raw = document.get("package_json")
    if not isinstance(raw, str) or len(raw.encode()) > 262144 or hashlib.sha256(raw.encode()).hexdigest() != document.get("package_sha256"):
        raise ValueError("PACKAGE_HASH_INVALID")
    package = json.loads(raw)
    if package.get("schema") != "NEXO_SCIENTIFIC_PACKAGE_V1" or package.get("battery_id") != battery_id:
        raise ValueError("PACKAGE_IDENTITY_INVALID")
    tests = package.get("tests")
    if not isinstance(tests, list) or not 1 <= len(tests) <= 20 or package.get("parallelism") not in {1, 2, 4}:
        raise ValueError("PACKAGE_CAPACITY_INVALID")
    ids = [test.get("test_id") for test in tests]
    if not all(ids) or len(set(ids)) != len(ids):
        raise ValueError("PACKAGE_TEST_IDENTITIES_INVALID")
    return raw


def fetch_package(battery_id, *, wait_seconds=0):
    if not re.fullmatch(r"[a-z0-9-]{3,48}", battery_id) or os.environ.get("GITHUB_RUN_ATTEMPT") != "1":
        raise ValueError("RUN_IDENTITY_INVALID")
    deadline = time.monotonic() + wait_seconds
    while True:
        try:
            document = request_json(ORIGIN + "/api/autonomy-scientific-package?battery_id=" + battery_id,
                                    token=oidc("nexo-autonomy-runner"))
            return validate_package(document, battery_id)
        except urllib.error.HTTPError as error:
            if error.code != 425 or time.monotonic() >= deadline:
                raise
            time.sleep(min(45, max(0, deadline - time.monotonic())))


def dispatch_once(specs, *, invoke, main_revision):
    """Each output is a freshly persisted reservation; never retry an uncertain dispatch."""
    for path in specs:
        spec = json.loads(path.read_text(encoding="utf-8"))
        if spec.get("transport") != MODE:
            continue
        battery_id = spec.get("battery_id") or spec.get("id")
        if not re.fullmatch(r"[a-z0-9-]{3,48}", battery_id or ""):
            raise ValueError("BATTERY_ID_INVALID")
        try:
            head = main_revision()
        except (OSError, ValueError, RuntimeError, TypeError, KeyError, AttributeError):
            head = None
        if (not re.fullmatch(r"[0-9a-f]{40}", spec.get("source_revision") or "")
                or head != spec["source_revision"]):
            print("WORKFLOW_REVISION_RECONCILIATION_REQUIRED: reservation retained; no dispatch", battery_id)
            path.unlink()
            continue
        # Do not disclose scientific parameters or forward a caller-selected ref.
        result = invoke(["gh", "workflow", "run", "nexo-test-battery.yml", "--repo", REPO,
                         "--ref", "main", "-f", "battery_id=" + battery_id, "-f", "transport=" + MODE])
        print("dispatch acknowledgement" if result.returncode == 0 else "dispatch uncertain; reconciliation required", battery_id)
        path.unlink()  # Private, ephemeral delivery file only; canonical reservation persists.


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["context", "reconcile", "package", "dispatch"])
    parser.add_argument("--battery-id")
    parser.add_argument("--output")
    parser.add_argument("--wait-seconds", type=int, default=0)
    args = parser.parse_args()
    if args.command == "context":
        gateway = json.loads(Path("/tmp/gateway.json").read_text(encoding="utf-8"))
        def verify(envelope, proof):
            return request_json(ORIGIN + "/api/autonomy-verify-human", token=oidc("nexo-autonomy-writer"),
                                body={"envelope": envelope, "authorization": proof})
        tower = None
        try:
            tower = read_tower()
            receipt = tower["files"].get("CONTROL.json", {}).get("value", {}).get("autonomy_mandate", {}).get("activation_receipt", {})
            revision = receipt.get("source_revision")
        except (OSError, ValueError, RuntimeError):
            revision = None
        context = verified_context(gateway, verify=verify, api=read_api_json, timestamp=now(), implementation_revision=revision,
                                   current_run_id=os.environ.get("GITHUB_RUN_ID"), current_revision=os.environ.get("GITHUB_SHA"))
        if tower and context["capacity_observation"]["quota"]["status"] == "AVAILABLE_FREE":
            context["capacity_observation"].update(capacity_candidate(tower))
        Path(args.output or "/tmp/nexo-autonomy-context.json").write_text(json.dumps(context), encoding="utf-8")
        print("verified human intents", len(context["proposal_sha256"]), "free capacity", context["capacity_observation"]["quota"]["status"])
    elif args.command == "reconcile":
        tower = read_tower()
        batteries = tower["files"].get("evolution/batteries.json", {}).get("value", {}).get("batteries") or []
        active = [battery for battery in batteries if battery.get("transport") == MODE
                  and battery.get("status") in {"DISPATCH_PENDING", "DISPATCHED", "RUNNING"}]
        if not active:
            print("canonical run bindings 0; no pending reservation")
            return
        anchors = [timestamp(battery.get("dispatch_requested_at")) for battery in active]
        if any(anchor is None for anchor in anchors):
            print("canonical reconciliation pending: reservation timestamp required")
            return
        created = ">=" + min(anchors).isoformat().replace("+00:00", "Z")
        runs = []
        for page in range(1, 11):
            document = read_api_json(page_url(REPO, page=page, created=created))
            rows = document.get("workflow_runs")
            if not isinstance(rows, list):
                raise ValueError("RUN_HISTORY_INVALID")
            runs.extend(rows)
            if len(rows) < 100:
                break
        else:
            print("canonical reconciliation pending: run history incomplete; no binding released")
            return
        path = Path("/tmp/bat/updates.json")
        updates = json.loads(path.read_text(encoding="utf-8"))
        # Existing collector uses a plain list; refuse an unexpected format.
        if not isinstance(updates, list):
            raise ValueError("RUN_UPDATES_INVALID")
        active = reconcile(tower, runs, api=read_api_json, checked_at=now())
        path.write_text(json.dumps(active + updates, ensure_ascii=False), encoding="utf-8")
        print("canonical run bindings", len(active))
    elif args.command == "package":
        raw = fetch_package(args.battery_id, wait_seconds=max(0, min(args.wait_seconds, 2400)))
        path = Path(args.output)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(raw, encoding="utf-8")
    elif args.command == "dispatch":
        dispatch_once(sorted(Path("/tmp/dispatch").glob("*.json")),
                      invoke=lambda command: subprocess.run(command, capture_output=True, text=True),
                      main_revision=lambda: read_api_json(f"https://api.github.com/repos/{REPO}/git/ref/heads/main")["object"]["sha"])


if __name__ == "__main__":
    main()
