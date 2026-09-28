"""Receita congelada: ajuste leve w0-wa (CPL, universo plano) com DESI DR2 BAO + Pantheon+, com retiradas.

Dados públicos (baixados na execução, nunca embutidos na proposta):
  BAO  : CobayaSampler/bao_data desi_bao_dr2 (média + covariância gaussianas, todos os traçadores)
  SNe  : PantheonPlusSH0ES/DataRelease Pantheon+SH0ES.dat + covariância STAT+SYS (z_HD > 0.01, sem calibradores)
O CMB não entra por padrão; se o teste precisar, a proposta congela priors gaussianos em `priors`.

Parâmetros (params.json), todos opcionais:
  drop_bao_z:      lista de redshifts efetivos do BAO a retirar (ex.: [0.295] tira o BGS; [2.33] tira o Ly-alpha)
  drop_sn_zbands:  lista de faixas [zmin, zmax) de SNe a retirar (leave-one-band-out)
  use_sn:          true/false (padrão true)
  priors:          {"omega_m": [média, sigma], "w0": [...], "wa": [...]} congelados pela proposta
  criterion:       "delta_chi2_ge" (padrão) -> PROMOTED se Δχ²(ΛCDM − w0wa) no subconjunto ≥ threshold
                   "shift_lt"                -> PROMOTED se o deslocamento de (w0, wa) em relação ao conjunto
                                                completo for < threshold (em unidades de sigma do completo)
  threshold:       número (padrão 4.0 para delta_chi2_ge; 1.0 para shift_lt)
O ajuste do conjunto completo roda sempre, como referência.
"""
import io
import json
import os
import urllib.request

import numpy as np
from scipy.integrate import cumulative_trapezoid
from scipy.optimize import minimize

C_KM_S = 299792.458
BAO_BASE = "https://raw.githubusercontent.com/CobayaSampler/bao_data/master/desi_bao_dr2/desi_gaussian_bao_ALL_GCcomb_"
SN_BASE = "https://raw.githubusercontent.com/PantheonPlusSH0ES/DataRelease/main/Pantheon%2B_Data/4_DISTANCES_AND_COVAR/"


def fetch(url: str) -> str:
    with urllib.request.urlopen(url, timeout=120) as r:
        return r.read().decode("utf-8")


params = json.load(open(os.environ["PARAMS_PATH"], encoding="utf-8"))
drop_bao = [float(z) for z in params.get("drop_bao_z") or []]
drop_bands = [(float(a), float(b)) for a, b in params.get("drop_sn_zbands") or []]
use_sn = bool(params.get("use_sn", True))
priors = params.get("priors") or {}
criterion = str(params.get("criterion") or "delta_chi2_ge")
threshold = float(params.get("threshold", 4.0 if criterion == "delta_chi2_ge" else 1.0))

# ---------- BAO ----------
rows = [l.split() for l in fetch(BAO_BASE + "mean.txt").splitlines() if l.strip() and not l.startswith("#")]
bao_z = np.array([float(r[0]) for r in rows])
bao_v = np.array([float(r[1]) for r in rows])
bao_q = [r[2] for r in rows]
bao_cov = np.loadtxt(io.StringIO(fetch(BAO_BASE + "cov.txt")))

# ---------- SNe ----------
sn_tab = None
if use_sn:
    lines = fetch(SN_BASE + "Pantheon%2BSH0ES.dat").splitlines()
    head = lines[0].split()
    data = np.array([l.split() for l in lines[1:] if l.strip()], dtype=object)
    col = {h: i for i, h in enumerate(head)}
    zhd = data[:, col["zHD"]].astype(float)
    zhel = data[:, col["zHEL"]].astype(float)
    mb = data[:, col["m_b_corr"]].astype(float)
    calib = data[:, col["IS_CALIBRATOR"]].astype(int)
    cov_raw = fetch(SN_BASE + "Pantheon%2BSH0ES_STAT%2BSYS.cov").split()
    n_all = int(cov_raw[0])
    sn_cov_all = np.array(cov_raw[1:], dtype=float).reshape(n_all, n_all)
    sn_tab = {"zhd": zhd, "zhel": zhel, "mb": mb, "calib": calib, "cov": sn_cov_all}

ZGRID = np.linspace(0.0, 2.6, 5201)


def comoving_over_ch0(om, w0, wa):
    """Return ∫0^z dz'/E(z') on ZGRID for flat CPL."""
    a = 1.0 / (1.0 + ZGRID)
    de = (1 - om) * a ** (-3 * (1 + w0 + wa)) * np.exp(-3 * wa * (1 - a))
    e = np.sqrt(om * (1 + ZGRID) ** 3 + de)
    return cumulative_trapezoid(1.0 / e, ZGRID, initial=0.0), e


def bao_model(om, w0, wa, a_rd, z):
    chi, e = comoving_over_ch0(om, w0, wa)
    dm = a_rd * np.interp(z, ZGRID, chi)          # DM/rd, with a_rd = c/(H0 rd)
    dh = a_rd / np.interp(z, ZGRID, e)            # DH/rd
    dv = (z * dm ** 2 * dh) ** (1 / 3)
    return dm, dh, dv


def build(keep_bao, keep_sn):
    bi = np.array(keep_bao)
    binv = np.linalg.inv(bao_cov[np.ix_(bi, bi)])
    sn = None
    if sn_tab is not None and keep_sn is not None and len(keep_sn):
        si = np.array(keep_sn)
        c = sn_tab["cov"][np.ix_(si, si)]
        cinv = np.linalg.inv(c)
        sn = {"z": sn_tab["zhd"][si], "zh": sn_tab["zhel"][si], "mb": sn_tab["mb"][si], "cinv": cinv,
              "ones": np.ones(len(si))}
    return bi, binv, sn


def chi2(theta, bi, binv, sn):
    om, w0, wa, a_rd = theta
    if not (0.05 < om < 0.7 and -3 < w0 < 1 and -5 < wa < 3 and 10 < a_rd < 60) or w0 + wa >= 0:
        return 1e12
    z = bao_z[bi]
    dm, dh, dv = bao_model(om, w0, wa, a_rd, z)
    pred = np.array([{"DM_over_rs": dm[k], "DH_over_rs": dh[k], "DV_over_rs": dv[k]}[bao_q[i]]
                     for k, i in enumerate(bi)])
    r = bao_v[bi] - pred
    total = float(r @ binv @ r)
    if sn is not None:
        chi, _ = comoving_over_ch0(om, w0, wa)
        dl = (1 + sn["zh"]) * np.interp(sn["z"], ZGRID, chi)          # in units of c/H0
        mu = 5 * np.log10(dl)                                          # offset absorbed by M
        d = sn["mb"] - mu
        # analytic marginalisation of the absolute-magnitude/H0 offset
        a = d @ sn["cinv"] @ d
        b = d @ sn["cinv"] @ sn["ones"]
        e = sn["ones"] @ sn["cinv"] @ sn["ones"]
        total += float(a - b * b / e + np.log(e / (2 * np.pi)))
    for name, idx in (("omega_m", 0), ("w0", 1), ("wa", 2)):
        if name in priors:
            m, s = priors[name]
            total += ((theta[idx] - float(m)) / float(s)) ** 2
    return total


def fit(bi, binv, sn, fixed_lcdm=False):
    if fixed_lcdm:
        f = lambda t: chi2([t[0], -1.0, 0.0, t[1]], bi, binv, sn)
        best = min((minimize(f, x0, method="Nelder-Mead", options={"xatol": 1e-6, "fatol": 1e-6, "maxiter": 4000})
                    for x0 in ([0.30, 30.0], [0.33, 29.0])), key=lambda r: r.fun)
        return {"omega_m": best.x[0], "w0": -1.0, "wa": 0.0, "a_rd": best.x[1]}, float(best.fun), None
    f = lambda t: chi2(t, bi, binv, sn)
    starts = ([0.31, -0.9, -0.5, 30.0], [0.32, -0.7, -1.0, 29.5], [0.30, -1.0, 0.0, 30.0])
    best = min((minimize(f, x0, method="Nelder-Mead", options={"xatol": 1e-7, "fatol": 1e-7, "maxiter": 20000})
                for x0 in starts), key=lambda r: r.fun)
    # numerical Hessian for approximate (w0, wa) uncertainties
    x, h = best.x, np.array([1e-3, 1e-2, 3e-2, 1e-2])
    H = np.zeros((4, 4))
    for i in range(4):
        for j in range(4):
            ei, ej = np.eye(4)[i] * h[i], np.eye(4)[j] * h[j]
            H[i, j] = (f(x + ei + ej) - f(x + ei - ej) - f(x - ei + ej) + f(x - ei - ej)) / (4 * h[i] * h[j])
    try:
        cov = np.linalg.inv(H / 2)
    except np.linalg.LinAlgError:
        cov = None
    return {"omega_m": x[0], "w0": x[1], "wa": x[2], "a_rd": x[3]}, float(best.fun), cov


all_bao = list(range(len(bao_z)))
all_sn = None
if sn_tab is not None:
    all_sn = [i for i in range(len(sn_tab["zhd"])) if sn_tab["zhd"][i] > 0.01 and sn_tab["calib"][i] == 0]

keep_bao = [i for i in all_bao if not any(abs(bao_z[i] - z) < 1e-3 for z in drop_bao)]
keep_sn = None if all_sn is None else [i for i in all_sn if not any(a <= sn_tab["zhd"][i] < b for a, b in drop_bands)]

full = build(all_bao, all_sn)
sub = build(keep_bao, keep_sn)
p_full, c_full, cov_full = fit(*full)
p_sub, c_sub, cov_sub = fit(*sub)
_, c_sub_lcdm, _ = fit(*sub, fixed_lcdm=True)
dchi2 = c_sub_lcdm - c_sub

sig = None
shift = None
if cov_full is not None and np.all(np.isfinite(cov_full)):
    sig = [float(np.sqrt(max(cov_full[1, 1], 0))), float(np.sqrt(max(cov_full[2, 2], 0)))]
    dv = np.array([p_sub["w0"] - p_full["w0"], p_sub["wa"] - p_full["wa"]])
    c2 = cov_full[1:3, 1:3]
    try:
        shift = float(np.sqrt(dv @ np.linalg.inv(c2) @ dv))
    except np.linalg.LinAlgError:
        shift = None

if criterion == "shift_lt":
    ok = shift is not None and shift < threshold
    rule = f"deslocamento de (w0, wa) < {threshold} sigma do conjunto completo"
else:
    ok = dchi2 >= threshold
    rule = f"Δχ²(ΛCDM − w0wa) ≥ {threshold} no subconjunto"
decisive = shift is not None or criterion != "shift_lt"
# A fit that slides to the edge of physical space is a degeneracy, not a measurement: say so instead of judging.
edge = [n for n, v, lo, hi in (("omega_m", p_sub["omega_m"], 0.15, 0.55), ("wa", p_sub["wa"], -4.5, 2.5),
                                ("w0", p_sub["w0"], -2.8, 0.8)) if not lo < v < hi]
verdict = "INCONCLUSIVE" if edge else ("PROMOTED" if ok else ("REJECTED" if decisive else "INCONCLUSIVE"))

removed = []
if drop_bao:
    removed.append(f"BAO em z={', '.join(str(z) for z in drop_bao)}")
if drop_bands:
    removed.append("SNe em " + ", ".join(f"{a}–{b}" for a, b in drop_bands))
what = ("sem " + " e ".join(removed)) if removed else "com todos os dados"
fmt = lambda p: f"w0={p['w0']:.3f}, wa={p['wa']:.3f}, Ωm={p['omega_m']:.3f}"
json.dump({
    "verdict": verdict,
    "decision": "DEGENERATE_FIT" if edge else ("CRITERION_MET" if ok else "CRITERION_NOT_MET"),
    "summary": f"Ajuste {what}: {fmt(p_sub)}; Δχ² contra ΛCDM = {dchi2:.2f}. Completo: {fmt(p_full)}. Regra: {rule}.",
    "statistics": {
        "full": {**{k: float(v) for k, v in p_full.items()}, "chi2": c_full, "sigma_w0_wa": sig},
        "subset": {**{k: float(v) for k, v in p_sub.items()}, "chi2": c_sub, "chi2_lcdm": c_sub_lcdm},
        "delta_chi2_lcdm_minus_w0wa": dchi2, "shift_sigma": shift,
        "n_bao": len(keep_bao), "n_sn": 0 if keep_sn is None else len(keep_sn),
        "criterion": criterion, "threshold": threshold, "degenerate_parameters": edge,
        "method_note": "Nelder-Mead + Hessiana numérica; incertezas aproximadas (sem MCMC); sem CMB salvo priors congelados.",
    },
    "semantic": {"result_meaning": (
        f"Sem esses dados o ajuste fica degenerado ({', '.join(edge)} vai para a borda): o teste precisa de um prior do CMB para decidir." if edge else
        f"A preferência por energia escura que muda com o tempo continua {what}." if ok and criterion != "shift_lt" else
        f"O resultado quase não se move {what}." if ok else
        f"A preferência enfraquece {what}." if criterion != "shift_lt" else
        f"O resultado se desloca {what}.")},
}, open(os.environ["RESULT_PATH"], "w", encoding="utf-8"), ensure_ascii=False)
