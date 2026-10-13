"""One technical Writer incident; never infer private health from public data."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

TITLE = "NEXO: falhas técnicas do Writer"
FAILURES = frozenset({"failure", "timed_out"})
CODE = "WRITER_RECENT_FAILURES"
FINGERPRINT = hashlib.sha256(CODE.encode()).hexdigest()
MARKER = "<!-- nexo-alert-condition:" + FINGERPRINT + " -->"


def observation(payload):
    """A success proves recovery of the workflow, not of scientific state."""
    if not isinstance(payload, dict) or not isinstance(payload.get("workflow_runs"), list):
        raise ValueError("WRITER_RUNS_RESPONSE_INVALID")
    rows = payload["workflow_runs"]
    for row in rows:
        if (not isinstance(row, dict) or type(row.get("id")) is not int
                or row.get("status") != "completed" or not isinstance(row.get("conclusion"), str)):
            raise ValueError("WRITER_RUNS_RESPONSE_INVALID")
    if rows and rows[0]["conclusion"] == "success":
        return {"state": "RECOVERED", "runs": rows[:1]}
    if len(rows) >= 2 and all(row["conclusion"] in FAILURES for row in rows[:2]):
        return {"state": "FAILED", "runs": rows[:2]}
    return {"state": "UNCONFIRMED", "runs": rows[:2]}


def gh(args):
    result = subprocess.run(["gh", *args], text=True, capture_output=True, timeout=60)
    if result.returncode:
        # Never print command stderr, which may contain credentials or URLs.
        raise RuntimeError("GITHUB_ALERT_API_UNAVAILABLE")
    return result.stdout


def incident_body(repo, observed):
    links = "\n".join("- [Execução " + str(row["id"]) + "](https://github.com/"
                      + repo + "/actions/runs/" + str(row["id"]) + "): "
                      + row["conclusion"] for row in observed["runs"])
    return (MARKER + "\nDuas execuções concluídas recentes do workflow Writer falharam.\n\n"
            + links + "\n\nVerifique os logs técnicos em Actions. Este alerta não mede atividade "
            "das tarefas privadas, produção científica ou efeito aplicado na Tower.\n")


def verify_issue(command, repo, number, state, body=None):
    observed = json.loads(command(["issue", "view", str(number), "--repo", repo,
                                   "--json", "number,title,state,body"]))
    if (not isinstance(observed, dict) or observed.get("number") != number
            or observed.get("title") != TITLE or observed.get("state") != state
            or body is not None and observed.get("body") != body):
        raise ValueError("ALERT_ISSUE_READBACK_FAILED")


def reconcile(repo, observed, issues, command=gh):
    matching = [row for row in issues if row.get("title") == TITLE]
    if len(matching) > 1:
        raise ValueError("ALERT_ISSUE_IDENTITY_AMBIGUOUS")
    existing = matching[0] if matching else None
    if existing and MARKER not in (existing.get("body") or ""):
        return "UNMANAGED"  # Never adopt, overwrite or close a manually scoped incident.
    if observed["state"] == "UNCONFIRMED":
        return "UNCONFIRMED"  # A cancellation or single failure is no recovery proof.
    if observed["state"] == "RECOVERED":
        if existing:
            command(["issue", "close", str(existing["number"]), "--repo", repo, "--comment",
                     "O workflow Writer concluiu success na execução " + str(observed["runs"][0]["id"])
                     + ". Recuperação técnica observada; não atesta estado privado ou científico."])
            verify_issue(command, repo, existing["number"], "CLOSED")
            return "CLOSED"
        return "NO_INCIDENT"
    if existing and MARKER in (existing.get("body") or ""):
        return "UNCHANGED"
    with tempfile.TemporaryDirectory(prefix="nexo-alert-") as tmp:
        body = Path(tmp) / "body.md"
        content = incident_body(repo, observed)
        body.write_text(content, encoding="utf-8")
        created = command(["issue", "create", "--repo", repo, "--title", TITLE, "--body-file", str(body)]).strip()
        match = re.fullmatch("https://github\\.com/" + re.escape(repo) + "/issues/([1-9][0-9]*)", created)
        if not match:
            raise ValueError("ALERT_ISSUE_CREATE_RESULT_INVALID")
        verify_issue(command, repo, int(match.group(1)), "OPEN", content)
        return "OPENED"


def main():
    repo = os.environ["GITHUB_REPOSITORY"]
    # API failure aborts before any issue mutation; never close on an empty fallback.
    observed = observation(json.loads(gh(["api", "repos/" + repo
        + "/actions/workflows/nexo-writer-robot.yml/runs?per_page=4&status=completed"])))
    issues = json.loads(gh(["issue", "list", "--state", "open", "--search", TITLE + " in:title",
                           "--json", "number,title,body"]))
    if not isinstance(issues, list) or any(not isinstance(row, dict) for row in issues):
        raise ValueError("ALERT_ISSUES_RESPONSE_INVALID")
    print(json.dumps({"writer_alert": reconcile(repo, observed, issues)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
