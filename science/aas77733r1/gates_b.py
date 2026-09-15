from __future__ import annotations

import numpy as np

from science.aas77733.stats import distance_modulus_flat_lcdm
from . import settings
from .context import Context
from .stats import (
    adaptive_mock_target, binned_gls, gaussian_bump_projection, gaussian_scan_maxima,
    piecewise_linear_projection, scan_null_pvalue, tanh_projection, template_scan, whiten_residual,
)
from .utils import gate_result


def _publication_state(ctx: Context):
    return ctx.state("non_calibrator",0.01)


def g6(ctx: Context, results: dict) -> dict:
    s = _publication_state(ctx); scan=s["scan"]
    w = whiten_residual(s["covariance"],s["residual"])
    raw = [{"z":float(z),"residual_mag":float(r)} for z,r in zip(s["z"],s["residual"],strict=True)]
    whitened = [{"z":float(z),"whitened_residual":float(r)} for z,r in zip(s["z"],w,strict=True)]
    return gate_result("G6","PASS" if scan["delta_chi2"]>0 else "FAIL",metrics={
        "n":int(s["idx"].size),"omega_m":float(s["fit"]["best"]["omega_m"]),
        "best_z":float(scan["best_z"]),"delta_chi2":float(scan["delta_chi2"]),"step_amplitude_mag":float(scan["amplitude"]),
        "raw_residuals":raw,"binned_gls":binned_gls(s["z"],s["residual"],s["covariance"],bins=20),"whitened_residuals":whitened,
        "whitened_mean":float(np.mean(w)),"whitened_std":float(np.std(w)),
    })


def g7(ctx: Context, results: dict) -> dict:
    s=_publication_state(ctx); scan=s["scan"]
    left=int(np.count_nonzero(s["z"]<=scan["best_z"])); right=int(np.count_nonzero(s["z"]>scan["best_z"]))
    historical=[r for r in scan["scan"] if settings.HISTORICAL_SCAN["z_min"]<=r["z"]<=settings.HISTORICAL_SCAN["z_max"]]
    hbest=max(historical,key=lambda r:r["delta_chi2"]) if historical else None
    return gate_result("G7","PASS",metrics={
        "discovery_statistic":"max_z delta_chi2(z)","scan_min":float(s["pivots"][0]),"scan_max":float(s["pivots"][-1]),"scan_step":settings.BLIND_SCAN["z_step"],
        "min_side_count":settings.BLIND_SCAN["min_side_count"],"best_z":float(scan["best_z"]),"T_obs":float(scan["delta_chi2"]),"left_n":left,"right_n":right,
        "scan":scan["scan"],"historical_window_provenance":hbest,
    })


def g8(ctx: Context, results: dict) -> dict:
    s=_publication_state(ctx); projection=s["scan"]["projection"]; obs=float(s["scan"]["delta_chi2"])
    base=max(int(ctx.mocks),settings.DEFAULT_MOCKS)
    maxima=gaussian_scan_maxima(projection,mocks=base,rng=ctx.rng("G8"))
    p0=scan_null_pvalue(observed=obs,maxima=maxima)
    target=adaptive_mock_target(p0,base=base,tail_trigger=settings.MOCK_POLICY["tail_trigger_p"],tail=settings.MOCK_POLICY["tail"])
    if target>base:
        maxima=gaussian_scan_maxima(projection,mocks=target,rng=ctx.rng("G8",1))
    p=scan_null_pvalue(observed=obs,maxima=maxima)
    return gate_result("G8","PASS" if p<0.05 else "FAIL",metrics={"T_obs":obs,"p_initial":p0,"p_global":p,"mocks":int(maxima.size),"adaptive_target":target,"null_q95":float(np.quantile(maxima,0.95)),"formula":"(1 + count(T_mock >= T_obs))/(N+1)"})


def _family(ctx:Context,name:str):
    s=_publication_state(ctx); p=s["pivots"]
    if name=="hard_step": return s["scan"]["projection"]
    if name=="tanh_step": return tanh_projection(s["z"],metric=s["metric"],pivots=p,widths=[0.02,0.05])
    if name=="gaussian_bump": return gaussian_bump_projection(s["z"],metric=s["metric"],centers=p,widths=[0.025,0.05,0.075,0.10])
    if name=="piecewise_linear": return piecewise_linear_projection(s["z"],metric=s["metric"],pivots=p)
    raise ValueError(name)


def g9(ctx: Context, results: dict) -> dict:
    s=_publication_state(ctx); rows=[]; decisions=[]
    for i,name in enumerate(settings.TEMPLATE_FAMILIES):
        proj=_family(ctx,name); observed=template_scan(proj,s["residual"])
        n=max(int(ctx.mocks),settings.DEFAULT_MOCKS)
        maxima=gaussian_scan_maxima(proj,mocks=n,rng=ctx.rng("G9",i+1)); p=scan_null_pvalue(observed=observed["delta_chi2"],maxima=maxima)
        rows.append({"family":name,"best":observed["metadata"],"delta_chi2":float(observed["delta_chi2"]),"amplitude":float(observed["amplitude"]),"p_global":p,"mocks":n})
        decisions.append(p<0.05)
    consistent=len(set(decisions))==1
    return gate_result("G9","PASS" if consistent else "FAIL",metrics={"templates":rows,"significance_story_consistent":consistent})


def g10(ctx: Context, results: dict) -> dict:
    s=_publication_state(ctx); best=float(s["fit"]["best"]["chi2"]); rows=[]
    for bg in s["fit"]["grid"]:
        if float(bg["chi2"])>best+1.0: continue
        omega=float(bg["omega_m"]); residual=s["observed"]-distance_modulus_flat_lcdm(s["z"],s["zhel"],omega)
        ev=s["scan"]["projection"].evaluate(residual)
        rows.append({"omega_m":omega,"delta_background_chi2":float(bg["chi2"]-best),"best_z":float(ev["metadata"]["z"]),"step_delta_chi2":float(ev["delta_chi2"])})
    piv=np.asarray([r["best_z"] for r in rows]); pr=float(np.ptp(piv)) if piv.size else float("inf")
    stable=pr<=0.05
    return gate_result("G10","PASS" if stable else "FAIL",metrics={"continuous_best_omega_m":float(s["fit"]["best"]["omega_m"]),"profile_rows":rows,"pivot_range":pr,"stable":stable})


GATES={"G6":g6,"G7":g7,"G8":g8,"G9":g9,"G10":g10}
