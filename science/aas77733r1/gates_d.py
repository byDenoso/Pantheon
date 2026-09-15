from __future__ import annotations

import numpy as np

from science.aas77733.stats import fit_omega_m
from . import settings
from .context import Context
from .nulls import survey_offset_maxima
from .stats import GLSMetric, blind_pivots, gaussian_scan_maxima, gaussian_score_draws, hard_step_scan, scan_null_pvalue
from .utils import gate_result


def _state(ctx:Context): return ctx.state("non_calibrator",0.01)


def _injection_row(ctx:Context,s:dict,*,amplitude:float,pivot:float,n:int,salt:int,q95:float)->dict:
    proj=s["scan"]["projection"]; injection=float(amplitude)*(s["z"]>float(pivot)).astype(float); mean=proj.q@injection
    draws=gaussian_score_draws(proj,mocks=n,rng=ctx.rng("G15",salt),mean_scores=mean); stats=np.max(draws*draws,axis=1); idx=np.argmax(draws*draws,axis=1)
    recovered=np.asarray([float(proj.metadata[i]["z"]) for i in idx]); detected=stats>=float(q95); half=settings.THRESHOLDS["pivot_localization_halfwidth"]
    return {"amplitude_mag":float(amplitude),"pivot":float(pivot),"detection_power":float(np.mean(detected)),"localization_fraction":float(np.mean(np.abs(recovered-float(pivot))<=half)),"localization_bias":float(np.mean(recovered-float(pivot))),"coverage_pm_halfwidth":float(np.mean(np.abs(recovered-float(pivot))<=half))}


def g15(ctx:Context,results:dict)->dict:
    s=_state(ctx); n=max(int(ctx.mocks),settings.DEFAULT_MOCKS); proj=s["scan"]["projection"]
    null=gaussian_scan_maxima(proj,mocks=n,rng=ctx.rng("G15",700)); q95=float(np.quantile(null,0.95)); rows=[]
    salt=1
    for amp in [0.005,0.01,0.015,0.02,0.03,0.05]:
        for pivot in [0.25,0.35,0.45,0.55]:
            rows.append(_injection_row(ctx,s,amplitude=amp,pivot=pivot,n=n,salt=salt,q95=q95)); salt+=1
    observed=_injection_row(ctx,s,amplitude=float(s["scan"]["amplitude"]),pivot=float(s["scan"]["best_z"]),n=n,salt=999,q95=q95)
    threshold=settings.THRESHOLDS["minimum_injection_detection_power"]; adequate=observed["detection_power"]>=threshold
    return gate_result("G15","PASS" if adequate else "FAIL",metrics={"null_q95":q95,"power_grid":rows,"canonical_observed_injection":observed,"adequate_power_at_observed_level":adequate,"threshold":threshold,"historical_manuscript_target_used":False,"mocks":n})


def g16(ctx:Context,results:dict)->dict:
    s=_state(ctx); proj=s["scan"]["projection"]; n=max(int(ctx.mocks),settings.DEFAULT_MOCKS); obs=float(s["scan"]["delta_chi2"])
    noise=gaussian_score_draws(proj,mocks=n,rng=ctx.rng("G16",700)); rows=[]; first=None
    for i,offset in enumerate([0.005,0.01,0.015,0.02,0.03],1):
        maxima=survey_offset_maxima(proj,survey=s["survey"],offset=offset,mocks=n,rng=ctx.rng("G16",i),noise_scores=noise)
        prob=float(np.mean(maxima>=obs)); rows.append({"offset_mag":offset,"probability_T_ge_Tobs":prob})
        if first is None and prob>=settings.THRESHOLDS["false_positive_fail_probability"]: first=float(offset)
    robust=first is None or first>settings.THRESHOLDS["false_positive_fail_offset_mag"]
    return gate_result("G16","PASS" if robust else "FAIL",metrics={"T_obs":obs,"curve":rows,"minimum_offset_reproducing_Tobs_at_50pct":first,"robust_to_modest_survey_offsets":robust,"mocks":n})


def g17(ctx:Context,results:dict)->dict:
    b=ctx.des; z=np.asarray(b.columns["zHD"],float); mask=z>0; idx=np.flatnonzero(mask); z=z[idx]; zhel=np.asarray(b.columns["zHEL"],float)[idx]; obs=np.asarray(b.columns["MU"],float)[idx]
    precision=b.precision[np.ix_(idx,idx)]; metric=GLSMetric(idx.size,precision=precision); fit=fit_omega_m(zhd=z,zhel=zhel,observed=obs,metric=metric,grid=ctx.omega_grid); piv=blind_pivots(z,**settings.BLIND_SCAN); scan=hard_step_scan(z=z,residual=fit["residual"],metric=metric,pivots=piv)
    n=max(int(ctx.mocks),settings.DEFAULT_MOCKS); maxima=gaussian_scan_maxima(scan["projection"],mocks=n,rng=ctx.rng("G17")); p=scan_null_pvalue(observed=float(scan["delta_chi2"]),maxima=maxima)
    pz=float(_state(ctx)["scan"]["best_z"]); shift=abs(float(scan["best_z"])-pz); consistent=p<0.05 and shift<=settings.THRESHOLDS["des_replication_max_pivot_shift"]
    return gate_result("G17","PASS" if consistent else "FAIL",metrics={"n":int(idx.size),"omega_m":float(fit["best"]["omega_m"]),"best_z":float(scan["best_z"]),"delta_chi2":float(scan["delta_chi2"]),"p_global":p,"pantheon_best_z":pz,"pivot_shift":shift,"consistent_replication":consistent,"mocks":n},evidence=b.receipts)


def _alt_scan(ctx:Context,z_alt:np.ndarray,keep:np.ndarray|None=None)->dict:
    s=_state(ctx); keep=np.ones(s["z"].size,dtype=bool) if keep is None else np.asarray(keep,bool); idx=np.flatnonzero(keep); cov=s["covariance"][np.ix_(idx,idx)]; metric=GLSMetric(idx.size,covariance=cov)
    z=np.asarray(z_alt,float)[idx]; zhel=s["zhel"][idx]; obs=s["observed"][idx]; fit=fit_omega_m(zhd=z,zhel=zhel,observed=obs,metric=metric,grid=ctx.omega_grid); piv=blind_pivots(z,**settings.BLIND_SCAN); scan=hard_step_scan(z=z,residual=fit["residual"],metric=metric,pivots=piv)
    return {"n":int(idx.size),"omega_m":float(fit["best"]["omega_m"]),"best_z":float(scan["best_z"]),"delta_chi2":float(scan["delta_chi2"]),"amplitude_mag":float(scan["amplitude"])}


def g18(ctx:Context,results:dict)->dict:
    s=_state(ctx); baseline={"n":int(s["z"].size),"best_z":float(s["scan"]["best_z"]),"delta_chi2":float(s["scan"]["delta_chi2"])}
    zcmb=_alt_scan(ctx,s["zcmb"]); keep=s["vpecerr"]<=300.0; pvcut=_alt_scan(ctx,s["z"],keep=keep)
    metrics={"baseline":baseline,"zHD_vs_zCMB":{"zCMB_branch":zcmb},"high_vpecerr_excision":{"threshold_km_s":300.0,"result":pvcut},"local_structure_external":{"status":"OPEN","fresh_crossmatch":False},"void_external":{"status":"OPEN","fresh_crossmatch":False},"physical_context_complete":False}
    return gate_result("G18","OPEN",metrics=metrics,note="Internal redshift/peculiar-velocity sensitivities are executed, but independent density/void context remains open; no physical cause is inferred.")


GATES={"G15":g15,"G16":g16,"G17":g17,"G18":g18}
