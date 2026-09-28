"""Receita congelada: replicação por sementes de uma amostra normal padrão.

Parâmetros (params.json):
  seeds: lista de sementes inteiras (ex.: [104729, 130363, 155921])
  n: inteiro ou lista de inteiros (tamanhos de amostra)
  max_abs_mean: limite para |média| (padrão 0.01)
  max_abs_sd_minus_1: limite para |desvio - 1| (padrão 0.01)
Passa se TODAS as combinações semente × n ficarem dentro dos dois limites.
"""
import json
import os

import numpy as np

params = json.load(open(os.environ["PARAMS_PATH"], encoding="utf-8"))
seeds = [int(s) for s in params["seeds"]]
sizes = params["n"] if isinstance(params["n"], list) else [params["n"]]
lim_mean = float(params.get("max_abs_mean", 0.01))
lim_sd = float(params.get("max_abs_sd_minus_1", 0.01))

rows = []
for seed in seeds:
    for n in sizes:
        x = np.random.default_rng(seed).normal(size=int(n))
        mean, sd = float(x.mean()), float(x.std(ddof=0))
        rows.append({"seed": seed, "n": int(n), "mean": mean, "sd": sd,
                     "ok": abs(mean) < lim_mean and abs(sd - 1) < lim_sd})

passed = sum(r["ok"] for r in rows)
verdict = "PROMOTED" if passed == len(rows) else "REJECTED"
json.dump({
    "verdict": verdict,
    "decision": "ALL_WITHIN_BOUNDS" if verdict == "PROMOTED" else "BOUND_VIOLATION",
    "summary": f"{passed} de {len(rows)} combinações dentro dos limites (|média|<{lim_mean}, |desvio-1|<{lim_sd}).",
    "statistics": {"combinations": len(rows), "within_bounds": passed,
                   "max_abs_mean": max(abs(r["mean"]) for r in rows),
                   "max_abs_sd_minus_1": max(abs(r["sd"] - 1) for r in rows), "rows": rows},
    "semantic": {"result_meaning": "Os limites congelados valeram em todas as repetições." if verdict == "PROMOTED"
                 else "Pelo menos uma repetição saiu dos limites congelados."},
}, open(os.environ["RESULT_PATH"], "w", encoding="utf-8"), ensure_ascii=False)
