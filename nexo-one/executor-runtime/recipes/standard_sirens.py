"""GWTC-3 v1: combina posteriores oficiais sob prior uniforme de H0.

Escolhas K/BJ mudam seleção e pesos dos hosts em GLADE+, não o catálogo GW.
Combinações, intervalos e referência do deslocamento são declarados em params.
"""
import hashlib
import json
import os
import urllib.request

import numpy as np

URL = "https://zenodo.org/records/5645777/files/O3_gwcosmo_H0_event_posteriors.json"
SHA256 = "2c5cd38be1700877674bcbff7cdd4edaaa1df5ac8696cc4c7741da8833f16533"
RUNS = {band: f"Mu_g_32.27_Mmax_112.5_band_{band}_Lambda_4.59" for band in ("K", "bJ")}


def load_data():
    with urllib.request.urlopen(URL, timeout=180) as response:
        raw = response.read()
    if hashlib.sha256(raw).hexdigest() != SHA256:
        raise ValueError("SHA256 do release GWTC-3 divergiu.")
    return json.loads(raw)


def combine(grid, posteriors):
    """Produto do notebook GWcosmo_DR; prior uniforme contado uma única vez."""
    densities = np.asarray(posteriors, dtype=float)
    if (densities.ndim != 2 or densities.shape[1] != len(grid)
            or not np.isfinite(densities).all() or np.any(densities < 0)):
        raise ValueError("Posterior inválida no release.")
    with np.errstate(divide="ignore"):
        logs = np.log(densities).sum(axis=0)
    peak = logs.max()
    if not np.isfinite(peak):
        raise ValueError("As posteriores não têm suporte conjunto.")
    density = np.exp(logs - peak)
    norm = np.trapezoid(density, grid)
    if not np.isfinite(norm) or norm <= 0:
        raise ValueError("Posterior conjunta não normalizável.")
    return density / norm


def interval_mass(grid, density, bounds):
    lo, hi = map(float, bounds)
    if not grid[0] <= lo < hi <= grid[-1]:
        raise ValueError("Intervalo de H0 fora da grade pública.")
    x = np.r_[lo, grid[(grid > lo) & (grid < hi)], hi]
    return float(np.trapezoid(np.interp(x, grid, density), x))


def run(params, data):
    grid = np.asarray(data["H0_grid"], dtype=float)
    if not np.isfinite(grid).all() or np.any(np.diff(grid) <= 0):
        raise ValueError("Grade H0 inválida.")
    bands = params["host_choices"]
    if len(bands) != len(set(bands)) or any(b not in RUNS for b in bands):
        raise ValueError("Use escolhas únicas entre K e bJ.")
    intervals = params["intervals"]
    if set(intervals) != {"inverse", "local"}:
        raise ValueError("Declare os intervalos inverse e local.")
    if max(intervals["inverse"]) > min(intervals["local"]):
        raise ValueError("Os intervalos inverse e local devem ser disjuntos e ordenados.")
    combinations = params["combinations"]
    seen = set()
    rows = []
    for events in combinations:
        identity = tuple(sorted(events))
        if not events or len(identity) != len(set(identity)) or identity in seen:
            raise ValueError("Combinações vazias, eventos repetidos ou combinações duplicadas.")
        seen.add(identity)
        for band in bands:
            # Unknown events raise: never silently drop a member of a combination.
            density = combine(grid, [data[RUNS[band]][event] for event in events])
            masses = {side: interval_mass(grid, density, interval) for side, interval in intervals.items()}
            if min(masses.values()) <= 0:
                raise ValueError("Probabilidade de intervalo nula na grade publicada; odds não identificáveis.")
            side = max(masses, key=masses.get)
            odds = masses[side] / masses["local" if side == "inverse" else "inverse"]
            mean = float(np.trapezoid(grid*density, grid))
            sd = float(np.sqrt(np.trapezoid((grid-mean)**2*density, grid)))
            reference = params.get("shift_reference_h0", {}).get(side)
            if reference is not None and (not np.isfinite(reference) or not grid[0] <= reference <= grid[-1]):
                raise ValueError("Referência de deslocamento fora da grade.")
            shift = None if reference is None else ((mean-reference) if side == "local" else (reference-mean))/sd
            rows.append({"events": events, "host_choice": band, "interval_probabilities": masses,
                         "preferred_side": side, "odds": odds, "mean_h0": mean,
                         "sd_h0": sd, "posterior_h0": density.tolist(), "shift_reference_h0": reference, "shift_sigma": shift})
    stats = {"data_sources": [{"url": URL, "version": "GWTC-3 cosmology v1 / 5645777", "sha256": SHA256}],
             "prior_h0": "uniforme em [20,140] km/s/Mpc", "population": "Mu_g=32.27, Mmax=112.5, Lambda=4.59",
             "intervals": intervals, "n_combinations": len(seen), "rows": rows,
             "grid_h0": grid.tolist(), "overlap_note": "Combinações podem compartilhar eventos; não são multiplicadas entre si."}
    verdict = "INCONCLUSIVE"
    if len(seen) < 5 or len(bands) < 2:
        decision, meaning = "INSUFFICIENT_COMBINATIONS_OR_HOSTS", "Faltam cinco combinações distintas ou duas escolhas de host; o teste não decide."
    elif len({row["preferred_side"] for row in rows}) > 1:
        decision, meaning = "SIDE_REVERSAL", "O lado preferido muda entre as combinações ou escolhas de host; a comparação permanece inconclusiva."
    elif all(row["odds"] < 2 for row in rows):
        verdict, decision, meaning = "REJECTED", "ODDS_BELOW_TWO", "As duas escolhas de host dão odds inferiores a dois para um em todas as combinações; elas não discriminam os dois lados."
    elif any(row["shift_sigma"] is None for row in rows):
        decision, meaning = "SHIFT_REFERENCE_MISSING", "A referência para medir o deslocamento de um erro-padrão precisa ser congelada antes da decisão."
    elif all(row["odds"] >= 3 and row["shift_sigma"] >= 1 for row in rows):
        verdict, decision, meaning = "PROMOTED", "CONSISTENT_SIREN_PREFERENCE", "Todas as combinações favorecem o mesmo lado nas duas escolhas de host, com odds de ao menos três para um e deslocamento de ao menos um erro-padrão."
    else:
        decision, meaning = "INSUFFICIENT_DISCRIMINATION", "As odds ou os deslocamentos não satisfazem o critério congelado em todas as combinações."
    return {"verdict": verdict, "decision": decision, "summary": meaning,
            "statistics": stats, "semantic": {"result_meaning": meaning}}


if __name__ == "__main__":
    try:
        result = run(json.load(open(os.environ["PARAMS_PATH"], encoding="utf-8")), load_data())
    except (OSError, ValueError, KeyError, TypeError) as error:
        meaning = "O dado ou binding congelado não está disponível: " + str(error)
        result = {"verdict": "INCONCLUSIVE", "decision": "INPUT_UNAVAILABLE", "summary": meaning,
                  "statistics": {}, "semantic": {"result_meaning": meaning}}
    with open(os.environ["RESULT_PATH"], "w", encoding="utf-8") as output:
        json.dump(result, output, ensure_ascii=False, allow_nan=False)
    print(result["summary"])
