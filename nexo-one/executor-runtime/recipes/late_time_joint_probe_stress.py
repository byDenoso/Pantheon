"""Frozen recipe family for approved late-time joint-probe stress tests.

Approved family modes:
  - sn_redshift_jackknife
  - bao_tracer_jackknife
  - sn_covariance_response
  - lowz_velocity_perturbation
  - shared_calibration_factor

The recipe never invents a missing scientific binding. Modes that require a
pre-registered response product must receive it explicitly (inline declarative
numbers or a public JSON URL). Missing mandatory bindings return INCONCLUSIVE.

Public default datasets used by the BAO/jackknife path are fixed to DESI DR2
BAO and, through the existing sibling recipe, Pantheon+ / DES-SN5YR.
"""
from __future__ import annotations

import io
import json
import math
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import urllib.request

import numpy as np
from scipy.integrate import cumulative_trapezoid
from scipy.optimize import minimize

BAO_MEAN_URL = "https://raw.githubusercontent.com/CobayaSampler/bao_data/master/desi_bao_dr2/desi_gaussian_bao_ALL_GCcomb_mean.txt"
BAO_COV_URL = "https://raw.githubusercontent.com/CobayaSampler/bao_data/master/desi_bao_dr2/desi_gaussian_bao_ALL_GCcomb_cov.txt"
ZGRID = np.linspace(0.0, 2.6, 5201)
SEED = 260928


def _fetch_text(url: str) -> str:
    with urllib.request.urlopen(url, timeout=180) as r:
        return r.read().decode("utf-8")


def _read_text(binding: str | None, default_url: str) -> str:
    if binding:
        p = Path(binding)
        if p.exists() and os.environ.get("NEXO_RECIPE_SELF_CHECK") == "1":
            return p.read_text(encoding="utf-8")
        if binding.startswith("https://"):
            return _fetch_text(binding)
        raise ValueError(f"unsupported data binding: {binding}")
    return _fetch_text(default_url)


def _write(result: dict) -> None:
    result.setdefault("statistics", {})
    result.setdefault("semantic", {})
    with open(os.environ["RESULT_PATH"], "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)


def inconclusive(decision: str, summary: str, **stats) -> None:
    _write({
        "verdict": "INCONCLUSIVE",
        "decision": decision,
        "summary": summary,
        "statistics": stats,
        "semantic": {"result_meaning": summary},
    })


def _comoving(om: float, w0: float, wa: float):
    a = 1.0 / (1.0 + ZGRID)
    de = (1.0 - om) * a ** (-3.0 * (1.0 + w0 + wa)) * np.exp(-3.0 * wa * (1.0 - a))
    e = np.sqrt(om * (1.0 + ZGRID) ** 3 + de)
    return cumulative_trapezoid(1.0 / e, ZGRID, initial=0.0), e


def _bao_model(om, w0, wa, a_rd, z):
    chi, e = _comoving(om, w0, wa)
    dm = a_rd * np.interp(z, ZGRID, chi)
    dh = a_rd / np.interp(z, ZGRID, e)
    dv = (z * dm * dm * dh) ** (1.0 / 3.0)
    return dm, dh, dv


def _load_bao(params):
    ov = params.get("data_overrides") or {}
    mean_text = _read_text(ov.get("bao_mean"), BAO_MEAN_URL)
    cov_text = _read_text(ov.get("bao_cov"), BAO_COV_URL)
    rows = [line.split() for line in mean_text.splitlines() if line.strip() and not line.lstrip().startswith("#")]
    z = np.array([float(r[0]) for r in rows], float)
    val = np.array([float(r[1]) for r in rows], float)
    qty = [r[2] for r in rows]
    cov = np.loadtxt(io.StringIO(cov_text))
    if cov.shape != (len(rows), len(rows)):
        raise RuntimeError(f"BAO covariance shape {cov.shape} != {(len(rows), len(rows))}")
    return z, val, qty, cov


def _bao_chi2(theta, bao, priors):
    z, val, qty, cov = bao
    om, w0, wa, a_rd = map(float, theta)
    if not (0.08 < om < 0.6 and -3.0 < w0 < 0.5 and -5.0 < wa < 2.5 and 10.0 < a_rd < 60.0):
        return 1e12
    if w0 + wa >= 0:
        return 1e12
    dm, dh, dv = _bao_model(om, w0, wa, a_rd, z)
    pred = np.array([{"DM_over_rs": dm[i], "DH_over_rs": dh[i], "DV_over_rs": dv[i]}[q] for i, q in enumerate(qty)])
    r = val - pred
    total = float(r @ np.linalg.solve(cov, r))
    for name, idx in (("omega_m", 0), ("w0", 1), ("wa", 2), ("a_rd", 3)):
        if name in priors:
            m, s = priors[name]
            total += ((theta[idx] - float(m)) / float(s)) ** 2
    return total


def _fit_bao(bao, priors):
    f = lambda t: _bao_chi2(t, bao, priors)
    starts = ([0.315, -0.9, -0.5, 30.0], [0.30, -0.7, -1.0, 30.0], [0.315, -1.0, 0.0, 30.0])
    best = min(
        (minimize(f, x, method="Nelder-Mead", options={"maxiter": 16000, "xatol": 1e-6, "fatol": 1e-6}) for x in starts),
        key=lambda x: x.fun,
    )
    return {
        "omega_m": float(best.x[0]),
        "w0": float(best.x[1]),
        "wa": float(best.x[2]),
        "a_rd": float(best.x[3]),
        "chi2": float(best.fun),
    }


def _subset_bao(bao, drop_z):
    z, val, qty, cov = bao
    keep = np.array([i for i, zz in enumerate(z) if not any(abs(float(zz) - float(d)) < 1e-3 for d in drop_z)], int)
    return z[keep], val[keep], [qty[i] for i in keep], cov[np.ix_(keep, keep)]


def _cosine_params(a, b):
    va = np.array([a["w0"] + 1.0, a["wa"]])
    vb = np.array([b["w0"] + 1.0, b["wa"]])
    den = np.linalg.norm(va) * np.linalg.norm(vb)
    return None if den <= 0 else float(va @ vb / den)


def bao_tracer_jackknife(params):
    priors = params.get("priors") or {}
    mandatory = {"omega_m", "w0", "wa"}
    if not mandatory.issubset(priors):
        return inconclusive(
            "MISSING_FROZEN_PRIORS",
            "O jackknife BAO precisa dos priors externos congelados do teste; a receita não escolhe CMB/prior por conta própria.",
            missing_priors=sorted(mandatory - set(priors)),
        )
    groups = params.get("tracer_groups") or []
    if not groups:
        return inconclusive("MISSING_FROZEN_BINDING", "Nenhuma família BAO foi pré-registrada em tracer_groups.")
    bao = _load_bao(params)
    full = _fit_bao(bao, priors)
    holds = []
    for g in groups:
        if not g.get("label") or not g.get("z"):
            raise ValueError("each tracer_group needs label and z[]")
        p = _fit_bao(_subset_bao(bao, g["z"]), priors)
        holds.append({"label": g["label"], "drop_z": g["z"], "params": p, "cosine": _cosine_params(full, p)})
    cos = [abs(h["cosine"]) for h in holds if h["cosine"] is not None]
    threshold = params.get("criterion") or {}
    if threshold.get("type") == "min_direction_cosine":
        cut = float(threshold["min_abs_cosine"])
        ok = bool(cos) and min(cos) >= cut
        verdict = "PROMOTED" if ok else "REJECTED"
        decision = "CRITERION_MET" if ok else "CRITERION_NOT_MET"
        rule = f"min |cos| >= {cut}"
    else:
        verdict, decision, rule = "INCONCLUSIVE", "NO_LITERAL_CRITERION", "critério literal não fornecido"
    _write({
        "verdict": verdict,
        "decision": decision,
        "summary": f"Jackknife BAO em {len(holds)} famílias; {rule}.",
        "statistics": {"mode": "bao_tracer_jackknife", "full": full, "holds": holds, "criterion": threshold,
                       "public_data": [BAO_MEAN_URL, BAO_COV_URL]},
        "semantic": {"result_meaning": "Robustez direcional do ajuste w0-wa sob retirada de famílias DESI DR2 BAO, condicionada aos priors congelados."},
    })


def delegate_existing_multi(params, mode):
    script = Path(__file__).with_name("w0wa_bao_sn_multi.py")
    if not script.exists():
        return inconclusive("MISSING_SIBLING_RECIPE", "A receita w0wa_bao_sn_multi.py não está disponível no catálogo local.")
    delegate = dict(params)
    delegate["mode"] = mode
    delegate.pop("data_overrides", None)
    with tempfile.TemporaryDirectory() as td:
        pp = Path(td) / "params.json"
        rr = Path(td) / "result.json"
        pp.write_text(json.dumps(delegate, ensure_ascii=False), encoding="utf-8")
        env = os.environ.copy()
        env["PARAMS_PATH"] = str(pp)
        env["RESULT_PATH"] = str(rr)
        cp = subprocess.run([sys.executable, str(script)], env=env, capture_output=True, text=True, timeout=int(params.get("delegate_timeout_s", 1200)))
        if cp.returncode != 0 or not rr.exists():
            return inconclusive("DELEGATE_RUNTIME_FAILURE", "O submodo validado falhou no runtime; não houve substituição de método.",
                                returncode=cp.returncode, stderr_tail=cp.stderr[-1200:])
        out = json.loads(rr.read_text(encoding="utf-8"))
    out.setdefault("statistics", {})["family_recipe"] = "late_time_joint_probe_stress"
    out["statistics"]["delegated_recipe"] = "w0wa_bao_sn_multi"
    _write(out)


def _load_response_sets(params):
    if params.get("response_sets") is not None:
        return params["response_sets"]
    url = params.get("response_sets_url")
    if not url:
        return None
    if not str(url).startswith("https://"):
        raise ValueError("response_sets_url must be public https")
    return json.loads(_fetch_text(url))


def _flatten_responses(sets):
    rows = []
    for comp in sets:
        cname = comp.get("compilation") or comp.get("name")
        for m in comp.get("modes") or []:
            if not all(k in m for k in ("label", "delta_h0", "delta_w0", "delta_wa")):
                raise ValueError("each response mode needs label, delta_h0, delta_w0, delta_wa")
            rows.append({"compilation": cname, **m})
    return rows


def _perm_corr_p(x, y, observed, nperm):
    rng = np.random.default_rng(SEED)
    n = len(x)
    if n < 3:
        return None
    count = 0
    for _ in range(nperm):
        yp = y[rng.permutation(n)]
        r = np.corrcoef(x, yp)[0, 1]
        if np.isfinite(r) and abs(r) >= abs(observed):
            count += 1
    return float((count + 1) / (nperm + 1))


def response_orthogonality(params, mode):
    sets = _load_response_sets(params)
    if not sets:
        return inconclusive("MISSING_FROZEN_BINDING", f"{mode} exige response_sets ou response_sets_url congelado pelo teste.")
    rows = _flatten_responses(sets)
    comps = sorted({r["compilation"] for r in rows})
    if len(comps) < 2:
        return inconclusive("INSUFFICIENT_COMPILATIONS", "A especificação exige pelo menos duas compilações independentes.", compilations=comps)
    per = []
    nperm = int(params.get("permutations", 10000))
    for comp in comps:
        rr = [r for r in rows if r["compilation"] == comp]
        h = np.array([float(r["delta_h0"]) for r in rr])
        w = np.array([math.hypot(float(r["delta_w0"]), float(r["delta_wa"])) for r in rr])
        if len(rr) < 3 or np.std(h) == 0 or np.std(w) == 0:
            corr, p = None, None
        else:
            corr = float(np.corrcoef(h, w)[0, 1])
            p = _perm_corr_p(h, w, corr, nperm)
        common = min(float(np.sum(h*h)), float(np.sum(w*w))) / max(float(np.sum(h*h)), float(np.sum(w*w)), 1e-15)
        signs = [np.sign(float(r["delta_h0"])) == np.sign(float(r["delta_w0"]) + float(r["delta_wa"])) for r in rr]
        per.append({"compilation": comp, "n_modes": len(rr), "corr": corr, "permutation_p": p,
                    "shared_response_fraction": float(common), "same_sign_fraction": float(np.mean(signs))})
    crit = params.get("criterion") or {}
    verdict, decision = "INCONCLUSIVE", "NO_LITERAL_CRITERION"
    if crit.get("type") == "h0_w0wa_orthogonality":
        succ_corr = float(crit.get("success_abs_corr_lt", 0.3))
        kill_corr = float(crit.get("kill_abs_corr_ge", 0.6))
        succ_p = float(crit.get("success_p_le", 0.05))
        valid = [r for r in per if r["corr"] is not None and r["permutation_p"] is not None]
        if len(valid) >= 2 and all(abs(r["corr"]) < succ_corr and r["permutation_p"] <= succ_p for r in valid[:2]):
            verdict, decision = "PROMOTED", "ORTHOGONAL_RESPONSE"
        elif len(valid) >= 2 and all(abs(r["corr"]) >= kill_corr for r in valid[:2]):
            verdict, decision = "REJECTED", "SHARED_RESPONSE"
        else:
            verdict, decision = "INCONCLUSIVE", "MIXED_RESPONSE"
    _write({
        "verdict": verdict, "decision": decision,
        "summary": f"{mode}: {len(rows)} modos em {len(comps)} compilações; decisão {decision}.",
        "statistics": {"mode": mode, "per_compilation": per, "criterion": crit, "n_modes": len(rows)},
        "semantic": {"result_meaning": "Compara a direção das respostas de H0 e w0-wa usando somente modos explicitamente ligados pelo teste."},
    })


def shared_factor(params):
    sets = _load_response_sets(params)
    if not sets:
        return inconclusive("MISSING_FROZEN_BINDING", "shared_calibration_factor exige response_sets ou response_sets_url congelado.")
    rows = _flatten_responses(sets)
    comps = sorted({r["compilation"] for r in rows})
    if len(comps) < 2 or len(rows) < 5:
        return inconclusive("INSUFFICIENT_COVERAGE", "O teste exige duas compilações e pelo menos cinco modos comparáveis.",
                            compilations=len(comps), n_modes=len(rows))
    X = np.array([[float(r["delta_h0"]), float(r["delta_w0"]), float(r["delta_wa"])] for r in rows], float)
    X = X - X.mean(axis=0, keepdims=True)
    scale = X.std(axis=0, ddof=1)
    if np.any(scale <= 0):
        return inconclusive("DEGENERATE_RESPONSE_MATRIX", "Uma dimensão da resposta não varia; o fator comum não é identificável.")
    Z = X / scale
    s = np.linalg.svd(Z, full_matrices=False, compute_uv=False)
    var = s*s
    ev1 = float(var[0]/var.sum())
    ev2 = float(var[:2].sum()/var.sum())
    gain = float((ev2-ev1)/max(1.0-ev1,1e-12))
    rng = np.random.default_rng(SEED)
    nperm = int(params.get("permutations", 10000))
    exceed = 0
    for _ in range(nperm):
        P = Z.copy(); P[:,0] = P[rng.permutation(len(P)),0]
        sp = np.linalg.svd(P, full_matrices=False, compute_uv=False); vp=sp*sp
        if float(vp[0]/vp.sum()) >= ev1: exceed += 1
    pval = float((exceed+1)/(nperm+1))
    crit = params.get("criterion") or {}
    if crit.get("type") != "shared_factor_vs_separate":
        verdict, decision = "INCONCLUSIVE", "NO_LITERAL_CRITERION"
    else:
        if ev1 < float(crit.get("success_common_lt",0.30)) and gain >= float(crit.get("success_separate_gain_ge",0.20)) and pval <= float(crit.get("success_p_le",0.05)):
            verdict, decision = "PROMOTED", "SEPARATE_FACTORS_FAVORED"
        elif ev1 >= float(crit.get("kill_common_ge",0.50)) and gain < float(crit.get("kill_separate_gain_lt",0.10)):
            verdict, decision = "REJECTED", "COMMON_FACTOR_SUFFICIENT"
        else:
            verdict, decision = "INCONCLUSIVE", "MIXED_FACTOR_EVIDENCE"
    _write({
        "verdict": verdict, "decision": decision,
        "summary": f"Fator comum explica {ev1:.3f}; dois fatores {ev2:.3f}; ganho relativo {gain:.3f}; p_perm={pval:.4g}.",
        "statistics": {"mode":"shared_calibration_factor","common_factor_variance":ev1,"two_factor_variance":ev2,
                       "separate_factor_gain":gain,"permutation_p":pval,"n_modes":len(rows),"compilations":comps,"criterion":crit},
        "semantic": {"result_meaning":"Compara um fator comum de calibração com estrutura de resposta separada, sem escolher modos fora do contrato congelado."},
    })


def main():
    params = json.load(open(os.environ["PARAMS_PATH"], encoding="utf-8"))
    mode = str(params.get("mode") or "")
    try:
        if mode == "bao_tracer_jackknife":
            if os.environ.get("NEXO_RECIPE_SELF_CHECK") == "1" and params.get("data_overrides"):
                return bao_tracer_jackknife(params)
            return delegate_existing_multi(params, "bao_tracer_jackknife")
        if mode == "sn_redshift_jackknife":
            return delegate_existing_multi(params, "redshift_jackknife")
        if mode in {"sn_covariance_response", "lowz_velocity_perturbation"}:
            return response_orthogonality(params, mode)
        if mode == "shared_calibration_factor":
            return shared_factor(params)
        return inconclusive("UNSUPPORTED_MODE", f"Modo não aprovado/implementado: {mode or '(vazio)'}")
    except Exception as exc:
        return inconclusive("SCIENTIFIC_SCRIPT_ERROR", f"Falha explícita sem substituição de contrato: {type(exc).__name__}: {exc}")


if __name__ == "__main__":
    main()
