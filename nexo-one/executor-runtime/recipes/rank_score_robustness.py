"""Frozen META recipe: robustness of pre-result rank_score against case influence or label permutations."""
from __future__ import annotations

import gzip
import hashlib
import json
import math
import os
import re
import statistics
import urllib.request

DEFAULT_SNAPSHOT_URL = (
    "https://raw.githubusercontent.com/byDenoso/Pantheon/4f7fe6980476a4c1cd00c205a85336269153b35a/"
    "nexo-one/executor-runtime/snapshots/public-projection-20260930-194720.json.gz"
)
DEFAULT_SNAPSHOT_SHA256 = "8b4c0da9ddb63b07f1043c53a1dab3cfd7d88cf3ec6c372ee63d00a2b1888b"
OFFICIAL_SNAPSHOT = re.compile(
    r"https://raw[.]githubusercontent[.]com/byDenoso/Pantheon/[0-9a-f]{40}/"
    r"nexo-one/executor-runtime/snapshots/public-projection-[0-9]{8}-[0-9]{6}[.]json(?:[.]gz)?"
)
GOOD = {"PROMOTED", "PROMOVIDO", "CONFIRMED", "SUPPORTED", "SURVIVED"}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError("projection redirects are forbidden")


def fetch_bytes(url: str) -> bytes:
    opener = urllib.request.build_opener(NoRedirect())
    with opener.open(url, timeout=60) as response:
        return response.read()


def load_projection():
    input_path = os.environ.get("INPUTS_PATH")
    required = os.environ.get("NEXO_REQUIRE_FROZEN_INPUTS") == "1"
    if input_path:
        inputs = json.load(open(input_path, encoding="utf-8"))
        if not isinstance(inputs, list) or len(inputs) != 1 or not isinstance(inputs[0], dict):
            raise ValueError("rank_score_robustness requires exactly one frozen public projection")
        binding = inputs[0]
        url = str(binding.get("url") or "")
        version = str(binding.get("version") or "").strip()
        expected = str(binding.get("sha256") or "").removeprefix("sha256:")
        if not OFFICIAL_SNAPSHOT.fullmatch(url) or not version or not re.fullmatch(r"[0-9a-f]{64}", expected):
            raise ValueError("frozen projection binding is incomplete or not official")
        raw = fetch_bytes(url)
        actual = hashlib.sha256(raw).hexdigest()
        if actual != expected:
            raise ValueError("frozen projection SHA256 mismatch")
        fmt = str(binding.get("format") or "")
        decoded = gzip.decompress(raw) if fmt == "json.gz" or url.endswith(".gz") else raw
        scope = "FROZEN_INPUT_BYTES_VERIFIED"
    elif required:
        raise ValueError("production rank_score_robustness requires INPUTS_PATH")
    else:
        url = DEFAULT_SNAPSHOT_URL
        version = "smoke-public-projection-20260930-194720"
        raw = fetch_bytes(url)
        actual = hashlib.sha256(raw).hexdigest()
        if actual != DEFAULT_SNAPSHOT_SHA256:
            raise ValueError("smoke projection SHA256 mismatch")
        decoded = gzip.decompress(raw)
        scope = "LIVE_SMOKE_ONLY"
    projection = json.loads(decoded)
    if not isinstance(projection, dict) or not isinstance(projection.get("tests"), list):
        raise ValueError("invalid public projection")
    return projection, {"url": url, "version": version, "sha256": actual, "scope": scope}


def auc(rows):
    pos = [r for r in rows if r["label"] == 1]
    neg = [r for r in rows if r["label"] == 0]
    if not pos or not neg:
        return None
    wins = 0.0
    for p in pos:
        for n in neg:
            wins += 1.0 if p["score"] > n["score"] else 0.5 if p["score"] == n["score"] else 0.0
    return wins / (len(pos) * len(neg))


def select_cohort(projection, ids):
    if not isinstance(ids, list) or len(ids) != len(set(ids)) or not ids:
        raise ValueError("cohort_ids must be a non-empty unique list")
    by_id = {str(t.get("id")): t for t in projection["tests"] if isinstance(t, dict) and t.get("id")}
    rows = []
    for tid in ids:
        t = by_id.get(str(tid))
        if not t:
            raise ValueError("cohort member missing from frozen projection: " + str(tid))
        score = t.get("rank_score")
        verdict = str(t.get("verdict") or "").upper()
        status = str(t.get("status_group") or t.get("status") or "").upper()
        if isinstance(score, bool) or not isinstance(score, (int, float)) or not math.isfinite(float(score)):
            raise ValueError("cohort member has no finite rank_score: " + str(tid))
        if status != "DONE" or not verdict:
            raise ValueError("cohort member is not a decided DONE test: " + str(tid))
        rows.append({"id": str(tid), "score": float(score), "label": int(verdict in GOOD), "verdict": verdict})
    return rows


def validate_identity(rows, params):
    observed = auc(rows)
    expected_n = params.get("expected_n")
    expected_auc = params.get("expected_auc")
    if expected_n is not None and len(rows) != int(expected_n):
        raise ValueError(f"cohort identity mismatch: n={len(rows)} expected={int(expected_n)}")
    if expected_auc is not None:
        if observed is None or abs(observed - float(expected_auc)) > float(params.get("auc_tolerance", 5e-5)):
            raise ValueError(f"cohort identity mismatch: auc={observed} expected={float(expected_auc)}")
    return observed


def run_leave_one_out(rows, params):
    baseline = validate_identity(rows, params)
    held = []
    for i, removed in enumerate(rows):
        value = auc(rows[:i] + rows[i + 1:])
        held.append({"removed_id": removed["id"], "auc": value})
    valid = [r["auc"] for r in held if r["auc"] is not None]
    if len(valid) != len(held):
        verdict, decision = "INCONCLUSIVE", "CLASS_LOST_AFTER_HOLDOUT"
    else:
        med = float(statistics.median(valid))
        low_frac = sum(v <= 0.55 for v in valid) / len(valid)
        min_auc = min(valid)
        if med >= 0.70 and min_auc >= 0.60:
            verdict, decision = "PROMOTED", "LOO_STABLE"
        elif low_frac >= 0.25 or med <= 0.60:
            verdict, decision = "REJECTED", "LOO_FRAGILE"
        else:
            verdict, decision = "INCONCLUSIVE", "LOO_MIXED"
    med = None if not valid else float(statistics.median(valid))
    low_frac = None if not valid else float(sum(v <= 0.55 for v in valid) / len(valid))
    return {
        "verdict": verdict,
        "decision": decision,
        "summary": f"Leave-one-out em {len(rows)} casos: AUC base={baseline:.6f}; mediana={med}; fração AUC<=0,55={low_frac}.",
        "statistics": {"mode": "leave_one_out", "baseline_auc": baseline, "n": len(rows),
                       "promoted": sum(r["label"] for r in rows), "non_promoted": sum(1-r["label"] for r in rows),
                       "loo_median_auc": med, "fraction_auc_le_055": low_frac, "holdouts": held},
        "semantic": {"result_meaning": "Mede se a discriminação histórica da nota depende de algum caso individual, sem recalibrar pesos ou seleção."},
    }


def run_permutation(rows, params):
    observed = validate_identity(rows, params)
    nperm = int(params.get("permutations", 10000))
    if nperm != 10000:
        raise ValueError("the frozen contract requires exactly 10000 label permutations")
    seed = params.get("seed")
    if seed is None:
        return {"verdict": "INCONCLUSIVE", "decision": "FROZEN_SEED_MISSING",
                "summary": "O contrato exige 10000 permutações, mas o binding ainda não fixa uma semente reproduzível.",
                "statistics": {"mode": "label_permutation", "baseline_auc": observed, "n": len(rows), "permutations": nperm},
                "semantic": {"result_meaning": "A coorte pode ser validada, mas a execução estocástica ainda não tem semente congelada; nenhum p foi fabricado."}}
    import numpy as np
    rng = np.random.default_rng(int(seed))
    labels = np.array([r["label"] for r in rows], dtype=int)
    scores = [r["score"] for r in rows]
    exceed = 0
    for _ in range(nperm):
        perm = rng.permutation(labels)
        pr = [{"score": scores[i], "label": int(perm[i])} for i in range(len(rows))]
        a = auc(pr)
        if a is not None and a >= observed:
            exceed += 1
    p = (exceed + 1) / (nperm + 1)
    if observed >= 0.70 and p <= 0.05:
        verdict, decision = "PROMOTED", "PERMUTATION_RARE"
    elif observed <= 0.55 or p >= 0.20:
        verdict, decision = "REJECTED", "PERMUTATION_COMPATIBLE_WITH_CHANCE"
    else:
        verdict, decision = "INCONCLUSIVE", "PERMUTATION_MIXED"
    return {"verdict": verdict, "decision": decision,
            "summary": f"AUC observada={observed:.6f}; p_perm={p:.6f} em 10000 permutações.",
            "statistics": {"mode": "label_permutation", "baseline_auc": observed, "n": len(rows),
                           "permutations": nperm, "seed": int(seed), "exceed": exceed, "p_permutation": p},
            "semantic": {"result_meaning": "Compara a AUC congelada à distribuição obtida permutando apenas os rótulos, sem recalibrar a rubrica."}}


def run(params, projection):
    rows = select_cohort(projection, params["cohort_ids"])
    mode = str(params.get("mode") or "")
    if mode == "leave_one_out":
        return run_leave_one_out(rows, params)
    if mode == "label_permutation":
        return run_permutation(rows, params)
    raise ValueError("unsupported mode")


if __name__ == "__main__":
    try:
        params = json.load(open(os.environ["PARAMS_PATH"], encoding="utf-8"))
        projection, provenance = load_projection()
        result = run(params, projection)
        result["statistics"] = {**result["statistics"], "input_provenance": provenance,
                                "cohort_ids": params.get("cohort_ids")}
    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError) as error:
        meaning = "A coorte pública congelada não pôde ser validada: " + str(error)
        result = {"verdict": "INCONCLUSIVE", "decision": "FROZEN_COHORT_UNAVAILABLE", "summary": meaning,
                  "statistics": {}, "semantic": {"result_meaning": meaning}}
    with open(os.environ["RESULT_PATH"], "w", encoding="utf-8") as output:
        json.dump(result, output, ensure_ascii=False, allow_nan=False)
    print(result["summary"])
