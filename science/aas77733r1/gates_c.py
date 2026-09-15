from __future__ import annotations

import numpy as np

from science.aas77733.stats import fit_omega_m
from . import settings
from .context import Context
from .nulls import permutation_maxima
from .stats import (
    GLSMetric, entropy_from_pivots, hard_step_scan, pivot_draws, scan_null_pvalue,
    survey_intercept_slope_design, survey_score_contributions,
)
from .utils import gate_result


def _state(ctx:Context): return ctx.state("non_calibrator",0.01)


def g11(ctx:Context,results:dict)->dict:
    s=_state(ctx); proj=s["scan"]["projection"]; obs=float(s["scan"]["delta_chi2"])
    n=max(int(ctx.mocks),settings.DEFAULT_MOCKS); rows={}
    if "G8" in results and "p_global" in results["G8"].get("metrics",{}):
        rows["gaussian"]=float(results["G8"]["metrics"]["p_global"])
    modes=[("redshift_shuffle",0.05),("intra_survey_shuffle",0.05)]
    for i,(mode,width) in enumerate(modes,1):
        maxima=permutation_maxima(proj,residual=s["residual"],z=s["z"],survey=s["survey"],mocks=n,rng=ctx.rng("G11",i),mode=mode,block_width=width)
        rows[mode]=scan_null_pvalue(observed=obs,maxima=maxima)
    for j,width in enumerate([0.03,0.05,0.08,0.10],10):
        maxima=permutation_maxima(proj,residual=s["residual"],z=s["z"],survey=s["survey"],mocks=n,rng=ctx.rng("G11",j),mode="survey_redshift_block",block_width=width)
        rows[f"survey_redshift_block_{width:.3f}"]=scan_null_pvalue(observed=obs,maxima=maxima)
    structured=[v for k,v in rows.items() if k!="gaussian"]
    maxp=float(max(structured)); survives=maxp<0.05
    return gate_result("G11","PASS" if survives else "FAIL",metrics={"hierarchy":rows,"max_structured_p":maxp,"mocks_per_null":n,"survives_structure_preserving_nulls":survives})


def _scan_mask(ctx:Context,mask:np.ndarray)->dict:
    b=ctx.pantheon; idx=np.flatnonzero(mask); c=b.columns
    z=np.asarray(c["zHD"],float)[idx]; zhel=np.asarray(c["zHEL"],float)[idx]; obs=np.asarray(c["m_b_corr"],float)[idx]
    cov=b.covariance[np.ix_(idx,idx)]; metric=GLSMetric(idx.size,covariance=cov)
    fit=fit_omega_m(zhd=z,zhel=zhel,observed=obs,metric=metric,grid=ctx.omega_grid)
    from .stats import blind_pivots
    piv=blind_pivots(z,**settings.BLIND_SCAN); scan=hard_step_scan(z=z,residual=fit["residual"],metric=metric,pivots=piv)
    return {"n":int(idx.size),"omega_m":float(fit["best"]["omega_m"]),"best_z":float(scan["best_z"]),"delta_chi2":float(scan["delta_chi2"]),"amplitude_mag":float(scan["amplitude"])}


def g12(ctx:Context,results:dict)->dict:
    s=_state(ctx); raw=float(s["scan"]["delta_chi2"]); b=ctx.pantheon; c=b.columns
    base=ctx.mask("non_calibrator",0.01); surveys,counts=np.unique(s["survey"],return_counts=True); order=np.argsort(counts)[::-1]
    rows=[]
    for value in surveys[order]:
        mask=base & (np.asarray(c["IDSURVEY"],int)!=int(value)); row=_scan_mask(ctx,mask); row["excluded_survey"]=int(value); rows.append(row)
    min_delta=min(r["delta_chi2"] for r in rows); drop=float(max(0.0,raw-min_delta)/raw) if raw>0 else 1.0
    best_index=int(np.argmax(np.asarray(s["scan"]["scores"])**2))
    contrib=survey_score_contributions(s["scan"]["projection"],s["residual"],s["survey"],best_index)
    maxfrac=float(contrib[0]["abs_score_fraction"]) if contrib else 1.0
    robust=drop<=settings.THRESHOLDS["survey_max_leave_one_out_drop_fraction"] and maxfrac<=settings.THRESHOLDS["survey_max_abs_score_fraction"]
    return gate_result("G12","PASS" if robust else "FAIL",metrics={"leave_one_survey_out":rows,"max_drop_fraction":drop,"score_contributions":contrib,"max_abs_score_fraction":maxfrac,"robust_to_survey_attribution":robust})


def g13(ctx:Context,results:dict)->dict:
    s=_state(ctx); raw=s["scan"]
    m2=survey_intercept_slope_design(survey=s["survey"],z=s["z"],include_slopes=False)
    m3=survey_intercept_slope_design(survey=s["survey"],z=s["z"],include_slopes=True)
    scan2=hard_step_scan(z=s["z"],residual=s["residual"],metric=s["metric"],pivots=s["pivots"],nuisance=m2)
    scan3=hard_step_scan(z=s["z"],residual=s["residual"],metric=s["metric"],pivots=s["pivots"],nuisance=m3)
    d1=float(raw["delta_chi2"]); d2=float(scan2["delta_chi2"]); d3=float(scan3["delta_chi2"]); frac=d3/d1 if d1>0 else 0.0
    survives=frac>=settings.THRESHOLDS["nuisance_min_delta_fraction"]
    return gate_result("G13","PASS" if survives else "FAIL",metrics={
        "M0":{"definition":"intercept only"},
        "M1":{"definition":"intercept + step","delta_chi2_A":d1,"best_z":float(raw["best_z"])},
        "M2":{"definition":"survey intercepts + step","delta_chi2_A":d2,"best_z":float(scan2["best_z"])},
        "M3":{"definition":"survey intercepts + survey-specific z slopes + step","delta_chi2_A":d3,"best_z":float(scan3["best_z"])},
        "final_delta_fraction":float(frac),"survives_nuisance_absorption":survives,
    })


def g14(ctx:Context,results:dict)->dict:
    s=_state(ctx); n=max(int(ctx.mocks),settings.DEFAULT_MOCKS)
    piv=pivot_draws(s["scan"]["projection"],s["scan"]["scores"],mocks=n,rng=ctx.rng("G14"))
    p16,p25,p50,p75,p84=np.quantile(piv,[0.16,0.25,0.5,0.75,0.84]); width=float(p84-p16); iqr=float(p75-p25)
    nominal=float(s["scan"]["best_z"]); half=settings.THRESHOLDS["pivot_localization_halfwidth"]; loc=float(np.mean(np.abs(piv-nominal)<=half)); ent=entropy_from_pivots(piv)
    stable=width<=settings.THRESHOLDS["max_pivot_p16_p84_width"] and loc>=settings.THRESHOLDS["minimum_localization_fraction"]
    values,counts=np.unique(piv,return_counts=True); order=np.argsort(counts)[::-1][:5]
    modes=[{"z":float(values[i]),"fraction":float(counts[i]/n)} for i in order]
    return gate_result("G14","PASS" if stable else "FAIL",metrics={"nominal_z":nominal,"p16":float(p16),"median":float(p50),"p84":float(p84),"p16_p84_width":width,"iqr":iqr,"localization_fraction":loc,"localization_halfwidth":half,"normalized_entropy":ent,"dominant_modes":modes,"stable":stable,"mocks":n})


GATES={"G11":g11,"G12":g12,"G13":g13,"G14":g14}
