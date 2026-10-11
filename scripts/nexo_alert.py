#!/usr/bin/env python3
"""Detect public NEXO alert conditions and reconcile one recoverable GitHub issue."""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import re
import subprocess
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Mapping, Sequence


ISSUE_TITLE = "NEXO: alerta de infraestrutura"
PROJECTION_RESOURCE = "tower-projection/projection.json"
PROJECTION_STALE_HOURS = 3
ROLE_ACTIVITY_STALE_HOURS = 8
TEST_OBSERVATION_STALE_HOURS = 6
PENDING_PROMOTED_THRESHOLD = 5
WRITER_WORKFLOW = "nexo-writer-robot.yml"
ROLES = ("EXECUTOR", "LEARNER", "REFUTADOR", "GUARDIAO")
ACK_MARKER = re.compile(r"<!-- nexo-alert-sig:([0-9a-f]{16,64}) -->")
PENDING_MARKER = re.compile(r"<!-- nexo-alert-pending:([A-Za-z0-9_-]+) -->")


def _canonical(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _parse_instant(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _observed_test_time(test: Mapping[str, Any]) -> datetime | None:
    executed_at = test.get("executed_at")
    if isinstance(executed_at, Mapping):
        executed_at = executed_at.get("at")
    return _parse_instant(executed_at)


def _is_pending_promoted_test(test: Mapping[str, Any]) -> bool:
    contest = test.get("contests_test_id")
    state = test.get("state") or test.get("status") or ""
    review_state = test.get("review_state") or "PENDING_REVIEW"
    return (contest in (None, "")
            and str(state).upper() != "ARCHIVED"
            and str(test.get("verdict") or "").upper() == "PROMOTED"
            and review_state == "PENDING_REVIEW")


def _projection_error(projection: Mapping[str, Any]) -> str | None:
    if projection.get("contract") != "NEXO_PUBLIC_PROJECTION_V1":
        return "projection_contract_invalid"
    manifest = projection.get("manifest")
    if not isinstance(manifest, Mapping):
        return "manifest_missing"
    if manifest.get("authority") != "TOWER_V06":
        return "manifest_authority_invalid"
    if manifest.get("projection_only") is not True:
        return "manifest_projection_only_invalid"
    if manifest.get("writeback") != "FORBIDDEN":
        return "manifest_writeback_invalid"
    live_tower = (re.fullmatch(r"sha256:[0-9a-f]{64}",
                               str(manifest.get("tower_revision") or ""), re.IGNORECASE)
                  and bool(str(manifest.get("tower_file_id") or "").strip()))
    legacy_commit = re.fullmatch(r"[0-9a-f]{40}",
                                 str(manifest.get("tower_commit") or ""), re.IGNORECASE)
    if not live_tower and not legacy_commit:
        return "manifest_tower_identity_invalid"
    event_cursor = manifest.get("event_cursor")
    if not isinstance(event_cursor, str) or not event_cursor.strip():
        return "manifest_event_cursor_missing"
    if projection.get("event_cursor") != event_cursor:
        return "projection_event_cursor_mismatch"
    if not re.fullmatch(r"sha256:[0-9a-f]{64}",
                        str(manifest.get("projection_fingerprint") or ""), re.IGNORECASE):
        return "manifest_fingerprint_invalid"
    if not isinstance(projection.get("work"), list) or not isinstance(projection.get("tests"), list):
        return "projection_work_or_tests_missing"
    cosmology = projection.get("cosmology_state")
    if cosmology is not None:
        if (not isinstance(cosmology, Mapping)
                or cosmology.get("model") != "COSMOLOGY_STATE_V1"
                or cosmology.get("authority") != "TOWER"
                or cosmology.get("projection_only") is not True
                or not isinstance(cosmology.get("frontiers"), list)
                or not isinstance(cosmology.get("historical_tests"), list)):
            return "projection_cosmology_state_invalid"
        test_ids = {
            str(test.get("id", "undefined"))
            for test in [*projection["tests"], *cosmology["historical_tests"]]
            if isinstance(test, Mapping) and not test.get("private")
        }
        for frontier in cosmology["frontiers"]:
            if (not isinstance(frontier, Mapping) or not frontier.get("id")
                    or frontier.get("state") not in {"SOLID", "TENSION", "OPEN"}):
                return "projection_cosmology_frontier_invalid"
            evidence_rows = frontier.get("key_evidence") or []
            if not isinstance(evidence_rows, list):
                return "projection_cosmology_evidence_invalid"
            for evidence in evidence_rows:
                if (not isinstance(evidence, Mapping)
                        or str(evidence.get("id", "undefined")) not in test_ids):
                    return "projection_cosmology_evidence_reference_missing"
    if not isinstance(projection.get("capabilities"), Mapping):
        return "projection_capabilities_missing"
    campaigns = projection.get("campaigns")
    if "campaigns" in projection and not isinstance(campaigns, list):
        return "projection_campaigns_invalid"
    human_gates = projection.get("human_gates")
    js_truthy = human_gates is not None and human_gates is not False \
        and human_gates != 0 and human_gates != ""
    if js_truthy and (not isinstance(human_gates, Mapping)
                      or not isinstance(human_gates.get("work_ids"), list)
                      or type(human_gates.get("count")) is not int):
        return "projection_human_gates_invalid"
    return None


def _problem(identity: Mapping[str, Any], message: str) -> dict[str, Any]:
    return {"identity": dict(identity), "message": message}


def collect_problems(
    projection: Mapping[str, Any] | None,
    writer_conclusions: Sequence[Any],
    now: datetime,
    *,
    projection_invalid: bool = False,
) -> list[dict[str, Any]]:
    """Return observations with stable identities and time-sensitive display text."""
    if now.tzinfo is None:
        raise ValueError("now must be timezone-aware")
    now = now.astimezone(timezone.utc)
    problems: dict[str, dict[str, Any]] = {}

    def add(identity: Mapping[str, Any], message: str) -> None:
        item = _problem(identity, message)
        problems[_canonical(item["identity"])] = item

    if projection is None:
        code = "projection_json_invalid" if projection_invalid else "projection_unavailable"
        message = ("A resposta pública da projeção não contém JSON válido."
                   if projection_invalid else "A projeção pública não respondeu.")
        add({"category": "observability", "code": code, "resource": PROJECTION_RESOURCE},
            f"[Projeção/observabilidade] {message}")
    elif error_code := _projection_error(projection):
        add({"category": "observability", "code": "projection_read_degraded",
             "reason": error_code, "resource": PROJECTION_RESOURCE},
            "[Projeção/observabilidade] A projeção recebida não passou pelo contrato "
            f"NEXO_PUBLIC_PROJECTION_V1 ({error_code}); o conteúdo não foi tratado como vazio.")
    else:
        manifest = projection.get("manifest")
        generated_at = manifest.get("generated_at") if isinstance(manifest, Mapping) else None
        generated = _parse_instant(generated_at)
        if generated is None:
            add({"category": "observability", "code": "manifest_generation_time_unavailable",
                 "resource": PROJECTION_RESOURCE},
                "[Projeção/observabilidade] O manifesto não traz um generated_at válido; "
                "a idade do snapshot não pode ser observada.")
        else:
            age = now - generated
            if age >= timedelta(hours=PROJECTION_STALE_HOURS):
                hours = int(age.total_seconds() // 3600)
                add({"category": "delivery", "code": "projection_stale",
                     "resource": PROJECTION_RESOURCE},
                    f"[Entrega da projeção] O snapshot público tem {hours}h; "
                    f"a última geração informada foi {generated.isoformat()}.")

        activity = projection.get("activity")
        activity = activity if isinstance(activity, list) else []
        for role in ROLES:
            role_times = [_parse_instant(item.get("at")) for item in activity
                          if isinstance(item, Mapping) and item.get("role") == role]
            latest_activity = max((stamp for stamp in role_times if stamp is not None), default=None)
            if latest_activity is None:
                add({"category": "observability", "code": "role_activity_not_observed",
                     "role": role, "resource": PROJECTION_RESOURCE},
                    f"[Observabilidade] A projeção pública não registra atividade para o papel {role}.")
            else:
                activity_age = now - latest_activity
                if activity_age >= timedelta(hours=ROLE_ACTIVITY_STALE_HOURS):
                    hours = int(activity_age.total_seconds() // 3600)
                    add({"category": "observability", "code": "role_activity_not_observed",
                         "role": role, "resource": PROJECTION_RESOURCE},
                        f"[Observabilidade] A última atividade pública do papel {role} "
                        f"foi observada há {hours}h ({latest_activity.isoformat()}); isso não "
                        "confirma que o papel parou.")

        tests = projection.get("tests")
        tests = tests if isinstance(tests, list) else []
        test_times = [_observed_test_time(test) for test in tests if isinstance(test, Mapping)]
        latest_test = max((stamp for stamp in test_times if stamp is not None), default=None)
        if latest_test is not None:
            age = now - latest_test
            if age >= timedelta(hours=TEST_OBSERVATION_STALE_HOURS):
                hours = int(age.total_seconds() // 3600)
                add({"category": "observability", "code": "public_test_execution_not_observed",
                     "resource": PROJECTION_RESOURCE},
                    f"[Observabilidade] A projeção não mostra teste executado há {hours}h "
                    f"(último registro: {latest_test.isoformat()}); isso não confirma que um "
                    "agente parou ou que um scheduler foi pausado.")

        pending_tests = [test for test in tests if isinstance(test, Mapping)
                         and _is_pending_promoted_test(test)]
        if len(pending_tests) > PENDING_PROMOTED_THRESHOLD:
            count = len(pending_tests)
            for test in pending_tests:
                test_id = test.get("id", test.get("test_id", "UNIDENTIFIED"))
                identity: dict[str, Any] = {
                    "category": "science_observation",
                    "code": "promoted_result_awaiting_challenge",
                    "test_id": test_id,
                }
                for field in ("recipe_id", "recipe_version"):
                    if field in test:
                        identity[field] = test[field]
                add(identity,
                    f"[Observação científica] Há {count} resultados promovidos aguardando "
                    f"contestação; registro {test_id}.")

        integrity = projection.get("integrity")
        if isinstance(integrity, Mapping) and str(integrity.get("status", "")).upper() == "RED":
            areas = integrity.get("failing_areas", [])
            stable_areas = sorted(area for area in areas if isinstance(area, str)) \
                if isinstance(areas, list) else []
            label = ", ".join(stable_areas) or "sem áreas listadas"
            add({"category": "science_observation", "code": "integrity_red",
                 "failing_areas": stable_areas},
                f"[Observação científica] A projeção informa saúde RED: {label}.")

        evolution = projection.get("evolution")
        recipe_health = evolution.get("recipe_health") if isinstance(evolution, Mapping) else None
        if isinstance(recipe_health, Mapping):
            for recipe_id in sorted(recipe_health):
                if isinstance(recipe_id, str):
                    add({"category": "science_observation", "code": "recipe_health_open",
                         "recipe_id": recipe_id},
                        f"[Observação científica] Receita com circuito aberto: {recipe_id}.")

    conclusions = list(writer_conclusions) if isinstance(writer_conclusions, Sequence) \
        and not isinstance(writer_conclusions, (str, bytes)) else []
    if [str(value).lower() for value in conclusions[:2]] == ["failure", "failure"]:
        add({"category": "execution", "code": "writer_runs_failed_twice",
             "workflow": WRITER_WORKFLOW},
            f"[Execução no Actions] As duas execuções concluídas mais recentes de "
            f"{WRITER_WORKFLOW} falharam.")

    return [problems[key] for key in sorted(problems)]


def problem_signature(problems: Sequence[Mapping[str, Any]]) -> str:
    identities = [_canonical(problem["identity"]) for problem in problems]
    identities.sort()
    payload = _canonical(identities).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


EMPTY_SIGNATURE = problem_signature([])


def acknowledged_signature(body: str) -> str | None:
    match = ACK_MARKER.search(body)
    return match.group(1) if match else None


def pending_notification(body: str) -> dict[str, Any] | None:
    match = PENDING_MARKER.search(body)
    if not match:
        return None
    encoded = match.group(1)
    try:
        raw = base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4))
        pending = json.loads(raw.decode("utf-8"))
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise RuntimeError("invalid pending NEXO alert marker; refusing to discard it") from error
    required = {"nonce", "target_signature", "kind", "comment_body", "issue_body"}
    if not isinstance(pending, dict) or not required.issubset(pending):
        raise RuntimeError("incomplete pending NEXO alert marker; refusing to discard it")
    return pending


def _scope_text(problems: Sequence[Mapping[str, Any]]) -> str:
    categories = {problem["identity"].get("category") for problem in problems}
    projection = "problema observado" if "observability" in categories else "sem falha observada"
    execution = "falha observada" if "execution" in categories else "sem falha observada"
    delivery = "atraso observado" if "delivery" in categories else "sem atraso observado"
    return (
        "Escopo observado:\n"
        f"- Projeção/observabilidade pública: {projection}.\n"
        f"- Execução observada em GitHub Actions: {execution}; execuções ChatGPT e estado do "
        "scheduler são desconhecidos.\n"
        f"- Entrega da projeção pública: {delivery} segundo generated_at; isso não diagnostica "
        "a causa nem confirma autorização/rede.\n"
        "- Entrega privada, email ou notificação: não verificada por este alarme.\n"
        "- Aplicação canônica no Drive/Tower (APPLIED): não verificada; a projeção pública "
        "não confirma aplicação canônica.\n\n"
        "Quietude pública não comprova agente parado nem scheduler pausado. Este alarme só "
        "observa sinais; não inicia, pausa ou altera a execução científica."
    )


def _render_issue_body(
    problems: Sequence[Mapping[str, Any]],
    now: datetime,
    signature: str,
) -> str:
    now_text = now.astimezone(timezone.utc).strftime("%d/%m %H:%M UTC")
    if problems:
        lines = "\n".join(f"- {problem['message']}" for problem in problems)
        heading = f"Problemas observados (atualizado {now_text}):"
    else:
        lines = "- Nenhum problema ativo consta na observação mais recente."
        heading = f"Problemas resolvidos (observado {now_text}):"
    return (f"{heading}\n\n{lines}\n\n{_scope_text(problems)}\n\n"
            f"<!-- nexo-alert-sig:{signature} -->")


def _pending_marker(pending: Mapping[str, Any]) -> str:
    payload = _canonical(pending).encode("utf-8")
    encoded = base64.urlsafe_b64encode(payload).decode("ascii").rstrip("=")
    return f"<!-- nexo-alert-pending:{encoded} -->"


def _event_marker(nonce: str) -> str:
    return f"<!-- nexo-alert-event:{nonce} -->"


def _comment_body(kind: str, problems: Sequence[Mapping[str, Any]], now: datetime,
                  nonce: str) -> str:
    stamp = now.astimezone(timezone.utc).strftime("%d/%m %H:%M UTC")
    if kind == "recovery":
        lead = f"O conjunto de problemas foi resolvido ({stamp})."
    else:
        lead = f"O conjunto de problemas observados mudou ({stamp})."
    details = "\n".join(f"- {problem['message']}" for problem in problems)
    if not details:
        details = "- Nenhum problema ativo consta na observação mais recente."
    return f"{lead}\n\n{details}\n\n{_scope_text(problems)}\n\n{_event_marker(nonce)}"


def _prepare_pending(github: Any, issue: Mapping[str, Any], problems: Sequence[Mapping[str, Any]],
                     now: datetime, old_signature: str | None, target_signature: str,
                     kind: str) -> dict[str, Any]:
    number = int(issue["number"])
    nonce = uuid.uuid4().hex
    issue_body = _render_issue_body(problems, now, old_signature or EMPTY_SIGNATURE)
    pending = {
        "nonce": nonce,
        "target_signature": target_signature,
        "kind": kind,
        "comment_body": _comment_body(kind, problems, now, nonce),
        "issue_body": issue_body,
    }
    durable_body = f"{issue_body}\n{_pending_marker(pending)}"
    github.edit_issue(number, durable_body)
    return pending


def _finish_pending(github: Any, issue: Mapping[str, Any], pending: Mapping[str, Any]) -> None:
    number = int(issue["number"])
    nonce = pending["nonce"]
    marker = _event_marker(nonce)
    comments = github.list_comments(number)
    if not any(marker in comment for comment in comments):
        try:
            github.create_comment(number, pending["comment_body"])
        except Exception:
            # A timeout can happen after GitHub accepted the comment. Read back by nonce
            # before deciding whether to retry; the pending record remains durable.
            comments = github.list_comments(number)
            if not any(marker in comment for comment in comments):
                raise
    final_body = re.sub(r"<!-- nexo-alert-sig:[0-9a-f]{16,64} -->", "",
                        pending["issue_body"]).rstrip()
    final_body = f"{final_body}\n\n<!-- nexo-alert-sig:{pending['target_signature']} -->"
    github.edit_issue(number, final_body)
    if pending["target_signature"] == EMPTY_SIGNATURE:
        github.close_issue(number)


def reconcile_alert(github: Any, problems: Sequence[Mapping[str, Any]], now: datetime) -> None:
    """Persist a pending notification before commenting; recover it by nonce on retries."""
    if now.tzinfo is None:
        raise ValueError("now must be timezone-aware")
    now = now.astimezone(timezone.utc)
    problems = list(problems)
    target_signature = problem_signature(problems)
    issue = github.find_open_issue(ISSUE_TITLE)
    if issue is None:
        if problems:
            github.create_issue(
                ISSUE_TITLE, _render_issue_body(problems, now, target_signature))
        return

    issue = github.get_issue(int(issue["number"]))
    pending = pending_notification(issue.get("body") or "")
    if pending is not None:
        _finish_pending(github, issue, pending)
        if pending["target_signature"] == EMPTY_SIGNATURE:
            if problems:
                github.create_issue(
                    ISSUE_TITLE, _render_issue_body(problems, now, target_signature))
            return
        issue = github.get_issue(int(issue["number"]))

    old_signature = acknowledged_signature(issue.get("body") or "")
    if target_signature == old_signature:
        github.edit_issue(
            int(issue["number"]), _render_issue_body(problems, now, target_signature))
        if target_signature == EMPTY_SIGNATURE:
            github.close_issue(int(issue["number"]))
        return

    kind = "recovery" if target_signature == EMPTY_SIGNATURE else "changed"
    pending = _prepare_pending(
        github, issue, problems, now, old_signature, target_signature, kind)
    _finish_pending(github, github.get_issue(int(issue["number"])), pending)


class GitHubCLI:
    """Small GitHub CLI adapter; all alert decisions stay testable without network access."""

    def __init__(self, repository: str):
        self.repository = repository

    @staticmethod
    def _run(*args: str) -> str:
        result = subprocess.run(["gh", *args], capture_output=True, text=True)
        if result.returncode:
            detail = result.stderr.strip() or result.stdout.strip() or "sem detalhe"
            raise RuntimeError(f"gh {args[0]} failed ({result.returncode}): {detail}")
        return result.stdout

    def find_open_issue(self, title: str) -> dict[str, Any] | None:
        rows = json.loads(self._run(
            "issue", "list", "--state", "open", "--search", f"{title} in:title",
            "--limit", "100", "--json", "number,title,body,url"))
        return next((row for row in rows if row.get("title") == title), None)

    def get_issue(self, number: int) -> dict[str, Any]:
        return json.loads(self._run(
            "issue", "view", str(number), "--json", "number,title,body,url"))

    def create_issue(self, title: str, body: str) -> None:
        self._run("issue", "create", "--title", title, "--body", body)

    def edit_issue(self, number: int, body: str) -> None:
        self._run("issue", "edit", str(number), "--body", body)

    def list_comments(self, number: int) -> list[str]:
        comments: list[str] = []
        page = 1
        while True:
            endpoint = (f"repos/{self.repository}/issues/{number}/comments"
                        f"?per_page=100&page={page}")
            rows = json.loads(self._run("api", endpoint))
            comments.extend(str(row.get("body", "")) for row in rows)
            if len(rows) < 100:
                return comments
            page += 1

    def create_comment(self, number: int, body: str) -> None:
        self._run("issue", "comment", str(number), "--body", body)

    def close_issue(self, number: int) -> None:
        self._run("issue", "close", str(number))


def _read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _detect_command(args: argparse.Namespace) -> None:
    projection: Mapping[str, Any] | None = None
    projection_invalid = False
    if args.projection.exists():
        try:
            loaded = _read_json(args.projection)
            if isinstance(loaded, Mapping):
                projection = loaded
            else:
                projection_invalid = True
        except (OSError, json.JSONDecodeError, UnicodeError):
            projection_invalid = True
    conclusions = _read_json(args.writer_runs)
    now = _parse_instant(args.now)
    if now is None:
        raise ValueError(f"invalid --now timestamp: {args.now}")
    problems = collect_problems(projection, conclusions, now,
                                projection_invalid=projection_invalid)
    args.output.write_text(json.dumps(problems, ensure_ascii=False, indent=2) + "\n",
                           encoding="utf-8")


def _reconcile_command(args: argparse.Namespace) -> None:
    repository = os.environ.get("GH_REPO")
    if not repository:
        raise RuntimeError("GH_REPO is required to reconcile the NEXO alert")
    problems = _read_json(args.problems)
    if not isinstance(problems, list) or any(not isinstance(row, Mapping) for row in problems):
        raise ValueError("problem file must contain a JSON array of problem objects")
    reconcile_alert(GitHubCLI(repository), problems, datetime.now(timezone.utc))


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    detect = commands.add_parser("detect", help="derive alert observations from public inputs")
    detect.add_argument("--projection", type=Path, required=True)
    detect.add_argument("--writer-runs", type=Path, required=True)
    detect.add_argument("--now", required=True)
    detect.add_argument("--output", type=Path, required=True)
    detect.set_defaults(handler=_detect_command)
    reconcile = commands.add_parser("reconcile", help="open, update or close the issue")
    reconcile.add_argument("--problems", type=Path, required=True)
    reconcile.set_defaults(handler=_reconcile_command)
    args = parser.parse_args(argv)
    try:
        args.handler(args)
    except Exception as error:
        print(f"nexo-alert: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
