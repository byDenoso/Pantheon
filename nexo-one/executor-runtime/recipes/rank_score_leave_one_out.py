"""Robustez leave-one-out da coorte historica congelada de rank_score.

A receita consome uma projecao publica imutavel, valida SHA256 e seleciona
somente os IDs explicitamente congelados em params. Nenhum caso novo entra.
"""
from __future__ import annotations

import gzip
import hashlib
import json
import math
import os
import urllib.request
from statistics import median

AUC_REPRO_TOLERANCE = 5e-5


def bounded_float_param(params: dict, key: str) -> float:
    value = params.get(key)
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{key} deve ser numero entre 0 e 1.")
    number = float(value)
    if not math.isfinite(number) or not 0.0 <= number <= 1.0:
        raise ValueError(f"{key} deve ser numero finito entre 0 e 1.")
    return number


def positive_int_param(params: dict, key: str) -> int:
    value = params.get(key)
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise ValueError(f"{key} deve ser inteiro positivo.")
    return value


def roc_auc(scores: list[float], labels: list[int]) -> float:
    pos = [s for s, y in zip(scores, labels) if y == 1]
    neg = [s for s, y in zip(scores, labels) if y == 0]
    if not pos or not neg:
        raise ValueError("ROC AUC exige as duas classes.")
    wins = sum((p > n) + 0.5 * (p == n) for p in pos for n in neg)
    return wins / (len(pos) * len(neg))


def walk_dicts(value):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from walk_dicts(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk_dicts(child)


SNAPSHOT_PATH = "nexo-one/executor-runtime/snapshots/public-projection-20260930-194720.json.gz"

def load_projection(url: str, version: str, expected_sha256: str) -> dict:
    if not isinstance(version, str) or len(version) != 40 or any(c not in "0123456789abcdef" for c in version):
        raise ValueError("projection_version deve ser commit Git de 40 hex.")
    expected_url = f"https://raw.githubusercontent.com/byDenoso/Pantheon/{version}/{SNAPSHOT_PATH}"
    if url != expected_url:
        raise ValueError("projection_url deve apontar para o snapshot oficial commit-pinned.")
    if not isinstance(expected_sha256, str):
        raise ValueError("projection_sha256 invalido.")
    expected = expected_sha256.removeprefix("sha256:")
    if len(expected) != 64 or any(c not in "0123456789abcdef" for c in expected):
        raise ValueError("projection_sha256 invalido.")
    with urllib.request.urlopen(url, timeout=180) as response:
        raw = response.read()
    if hashlib.sha256(raw).hexdigest() != expected:
        raise ValueError("SHA256 da projecao publica divergiu.")
    if url.endswith(".gz"):
        raw = gzip.decompress(raw)
    return json.loads(raw)


def extract_cohort(projection: dict, cohort_ids: list[str]) -> list[dict]:
    if (not isinstance(cohort_ids, list) or not cohort_ids
            or any(not isinstance(entity_id, str) or not entity_id.strip() for entity_id in cohort_ids)
            or len(cohort_ids) != len(set(cohort_ids))):
        raise ValueError("cohort_ids deve conter IDs unicos e nao vazios.")
    wanted = set(cohort_ids)
    found = {}
    for row in walk_dicts(projection):
        entity_id = row.get("id")
        if (entity_id in wanted and str(row.get("status") or "").upper() == "DONE"
                and "rank_score" in row and "verdict" in row):
            prior = found.get(entity_id)
            if prior is None or len(row) > len(prior):
                found[entity_id] = row
    missing = [entity_id for entity_id in cohort_ids if entity_id not in found]
    if missing:
        raise ValueError("coorte ausente na projecao: " + ",".join(missing))
    cohort = []
    for entity_id in cohort_ids:
        row = found[entity_id]
        raw_score = row["rank_score"]
        if isinstance(raw_score, bool) or not isinstance(raw_score, (int, float)):
            raise ValueError(f"rank_score invalido: {entity_id}")
        score = float(raw_score)
        if not math.isfinite(score):
            raise ValueError(f"rank_score invalido: {entity_id}")
        raw_verdict = row.get("verdict")
        if not isinstance(raw_verdict, str) or not raw_verdict.strip():
            raise ValueError(f"veredito ausente: {entity_id}")
        verdict = raw_verdict.strip().upper()
        cohort.append({"id": entity_id, "rank_score": score,
                       "verdict": verdict, "label": 1 if verdict == "PROMOTED" else 0})
    return cohort


def run(params: dict, projection: dict) -> dict:
    if not isinstance(params, dict):
        raise ValueError("params deve ser objeto JSON.")
    cohort = extract_cohort(projection, params["cohort_ids"])
    scores = [row["rank_score"] for row in cohort]
    labels = [row["label"] for row in cohort]
    baseline = roc_auc(scores, labels)

    expected_n = positive_int_param(params, "expected_n")
    expected_promoted = positive_int_param(params, "expected_promoted")
    expected_non_promoted = positive_int_param(params, "expected_non_promoted")
    expected_auc = bounded_float_param(params, "expected_auc")
    success_median = bounded_float_param(params, "success_median_ge")
    success_min = bounded_float_param(params, "success_min_ge")
    kill_auc = bounded_float_param(params, "kill_auc_le")
    kill_fraction = bounded_float_param(params, "kill_fraction_ge")
    kill_median = bounded_float_param(params, "kill_median_le")
    if expected_n != expected_promoted + expected_non_promoted:
        raise ValueError("Contagens esperadas nao somam expected_n.")
    if expected_promoted < 2 or expected_non_promoted < 2:
        raise ValueError("Leave-one-out exige pelo menos dois casos de cada classe.")
    if kill_auc > success_min or kill_median > success_median:
        raise ValueError("Limiares kill/success sao inconsistentes.")
    if len(cohort) != expected_n:
        raise ValueError("N da coorte nao reproduz o resultado original.")
    if sum(labels) != expected_promoted or len(labels) - sum(labels) != expected_non_promoted:
        raise ValueError("Contagem das classes nao reproduz o resultado original.")
    if abs(baseline - expected_auc) > AUC_REPRO_TOLERANCE:
        raise ValueError("AUC-base nao reproduz o resultado original.")

    rows = []
    for i, removed in enumerate(cohort):
        kept_scores = scores[:i] + scores[i + 1:]
        kept_labels = labels[:i] + labels[i + 1:]
        rows.append({"removed_id": removed["id"], "auc": roc_auc(kept_scores, kept_labels)})
    aucs = [row["auc"] for row in rows]
    med = float(median(aucs))
    minimum = float(min(aucs))
    low_fraction = sum(value <= kill_auc for value in aucs) / len(aucs)

    success = med >= success_median and minimum >= success_min
    killed = low_fraction >= kill_fraction or med <= kill_median
    if success:
        verdict, decision = "PROMOTED", "LEAVE_ONE_OUT_STABLE"
        meaning = "A AUC permanece acima dos limiares congelados em todas as remocoes e na mediana."
    elif killed:
        verdict, decision = "REJECTED", "LEAVE_ONE_OUT_FRAGILE"
        meaning = "A estabilidade leave-one-out falha pelo criterio congelado."
    else:
        verdict, decision = "INCONCLUSIVE", "LEAVE_ONE_OUT_INTERMEDIATE"
        meaning = "A robustez leave-one-out fica entre os criterios congelados de sucesso e kill."

    return {
        "verdict": verdict,
        "decision": decision,
        "summary": meaning,
        "statistics": {
            "n": len(cohort),
            "promoted": sum(labels),
            "non_promoted": len(labels) - sum(labels),
            "baseline_auc": baseline,
            "leave_one_out_auc_median": med,
            "leave_one_out_auc_min": minimum,
            "fraction_auc_le_kill": low_fraction,
            "rows": rows,
            "cohort_ids": [row["id"] for row in cohort],
        },
        "semantic": {"result_meaning": meaning},
    }


def main() -> None:
    with open(os.environ["PARAMS_PATH"], encoding="utf-8") as source:
        params = json.load(source)
    try:
        projection = load_projection(params["projection_url"], params["projection_version"], params["projection_sha256"])
        result = run(params, projection)
    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError) as error:
        meaning = "O input congelado nao pode ser reproduzido: " + str(error)
        result = {"verdict": "INCONCLUSIVE", "decision": "INPUT_UNAVAILABLE", "summary": meaning,
                  "statistics": {}, "semantic": {"result_meaning": meaning}}
    with open(os.environ["RESULT_PATH"], "w", encoding="utf-8") as target:
        json.dump(result, target, ensure_ascii=False, allow_nan=False)
    print(result["summary"])


if __name__ == "__main__":
    main()
