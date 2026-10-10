"""CF4 fixed-shell joint GLS monopole/dipole recipe.
Production admission uses the fixed vector-quadratic dipole statistic.
Synthetic smoke is technical verification only, never a scientific result.
"""
from __future__ import annotations
import math
from typing import Any, Mapping, Sequence
import numpy as np
class ContractInputError(ValueError):
    pass

def require(cond: bool, msg: str) -> None:
    if not cond:
        raise ContractInputError(msg)

def _sym_pd(a: Any, n: int | None = None, name: str = "matriz") -> np.ndarray:
    x = np.asarray(a, dtype=float)
    require(x.ndim == 2 and x.shape[0] == x.shape[1], f"{name}: matriz quadrada obrigatória")
    if n is not None:
        require(x.shape == (n, n), f"{name}: shape precisa ser {n}x{n}")
    require(np.isfinite(x).all(), f"{name}: valor não finito")
    require(np.allclose(x, x.T, atol=1e-12, rtol=0), f"{name}: matriz não simétrica")
    try:
        np.linalg.cholesky(x)
    except np.linalg.LinAlgError as exc:
        raise ContractInputError(f"{name}: matriz precisa ser definida positiva") from exc
    return x

def gls_fit(y: Any, X: Any, C: Any) -> dict[str, Any]:
    y = np.asarray(y, dtype=float).reshape(-1)
    X = np.asarray(X, dtype=float)
    require(X.ndim == 2 and X.shape[0] == y.size, "GLS: X/y incompatíveis")
    C = _sym_pd(C, y.size, "GLS covariance")
    L = np.linalg.cholesky(C)
    yw = np.linalg.solve(L, y)
    Xw = np.linalg.solve(L, X)
    normal = Xw.T @ Xw
    require(np.linalg.matrix_rank(normal) == normal.shape[0], "GLS: matriz normal singular")
    cov_beta = np.linalg.inv(normal)
    beta = cov_beta @ (Xw.T @ yw)
    resid = y - X @ beta
    chi2 = float(resid @ np.linalg.solve(C, resid))
    return {"beta": beta, "cov_beta": cov_beta, "chi2": chi2, "n": int(y.size), "k": int(X.shape[1])}

CF4_SHELL_EDGES = (20.0, 40.0, 60.0, 80.0, 120.0, 160.0)

def _cf4_fixed_shells(distance_mpc: Any, h_i: Any, sigma_h_i: Any, ra_deg: Any, dec_deg: Any) -> list[dict[str, Any]]:
    d=np.asarray(distance_mpc,float).reshape(-1); y=np.asarray(h_i,float).reshape(-1)
    s=np.asarray(sigma_h_i,float).reshape(-1); ra=np.asarray(ra_deg,float).reshape(-1); dec=np.asarray(dec_deg,float).reshape(-1)
    require(d.shape==y.shape==s.shape==ra.shape==dec.shape,"CF4 shell: shapes incompatíveis")
    require(np.all(s>0),"CF4 shell: sigma_H precisa ser positivo")
    out=[]
    for lo,hi in zip(CF4_SHELL_EDGES[:-1],CF4_SHELL_EDGES[1:]):
        m=(d>=lo)&((d<hi) if hi<160.0 else (d<=hi))
        require(int(m.sum())>=4,f"CF4 shell {lo:g}-{hi:g}: menos de 4 linhas")
        fit=gls_monopole_dipole(y[m],s[m],ra[m],dec[m])
        fit.update({"lo_mpc":lo,"hi_mpc":hi,"n":int(m.sum())})
        out.append(fit)
    return out

def gls_monopole_dipole(h_i: Any, sigma_h_i: Any, ra_deg: Any, dec_deg: Any) -> dict[str, Any]:
    y=np.asarray(h_i,float).reshape(-1); s=np.asarray(sigma_h_i,float).reshape(-1)
    ra=np.deg2rad(np.asarray(ra_deg,float).reshape(-1)); dec=np.deg2rad(np.asarray(dec_deg,float).reshape(-1))
    require(y.shape==s.shape==ra.shape==dec.shape and y.size>=4,"CF4 GLS: shapes inválidos")
    require(np.all(np.isfinite(y)) and np.all(np.isfinite(s)) and np.all(s>0),"CF4 GLS: entradas inválidas")
    nvec=np.column_stack([np.cos(dec)*np.cos(ra),np.cos(dec)*np.sin(ra),np.sin(dec)])
    X=np.column_stack([np.ones(y.size),nvec]); fit=gls_fit_diagonal(y,X,s)
    beta=fit["beta"]; cov=fit["cov_beta"]; amp=float(np.linalg.norm(beta[1:]))
    if amp>0:
        g=beta[1:]/amp; var=float(g@cov[1:,1:]@g)
    else:
        var=float(np.trace(cov[1:,1:])/3.0)
    require(var>0,"CF4 GLS: variância do dipolo inválida")
    return {"monopole":float(beta[0]),"monopole_sigma":math.sqrt(float(cov[0,0])),
            "dipole_vector":beta[1:].copy(),"dipole_amplitude":amp,"dipole_sigma":math.sqrt(var),
            "dipole_snr":amp/math.sqrt(var),"chi2":fit["chi2"],"covariance":cov}

def run_cf4_robustness(distance_mpc: Any, h_i: Any, sigma_h_i: Any, ra_deg: Any, dec_deg: Any,
                       region_nside1: Sequence[int], method_family: Sequence[str]) -> dict[str, Any]:
    """Run the frozen five-shell fit plus all 12 HEALPix and FP/TF leave-one-outs."""
    d=np.asarray(distance_mpc,float).reshape(-1); n=d.size
    arrays=[np.asarray(v) for v in (h_i,sigma_h_i,ra_deg,dec_deg)]
    require(all(a.reshape(-1).size==n for a in arrays),"CF4 robustness: vetor incompatível")
    reg=np.asarray(region_nside1,int).reshape(-1); fam=np.asarray([str(x) for x in method_family],dtype=object)
    require(reg.size==fam.size==n,"CF4 robustness: labels incompatíveis")
    require(set(map(int,reg.tolist())).issubset(set(range(12))),"CF4 robustness: regiões precisam estar em 0..11")
    baseline=_cf4_fixed_shells(d,h_i,sigma_h_i,ra_deg,dec_deg)
    region_loo={}
    for r in range(12):
        keep=reg!=r
        region_loo[str(r)]=_cf4_fixed_shells(d[keep],np.asarray(h_i)[keep],np.asarray(sigma_h_i)[keep],np.asarray(ra_deg)[keep],np.asarray(dec_deg)[keep])
    method_loo={}
    for f in ("FP","TF"):
        if np.any(np.isin(fam, (f, "FP+TF"))):
            keep=~np.isin(fam, (f, "FP+TF"))
            method_loo[f]=_cf4_fixed_shells(d[keep],np.asarray(h_i)[keep],np.asarray(sigma_h_i)[keep],np.asarray(ra_deg)[keep],np.asarray(dec_deg)[keep])
    return {"baseline":baseline,"region_loo":region_loo,"method_loo":method_loo,"regions":12}

def cf4_joint_pooled_contrast(distance_mpc: Any, h_i: Any, sigma_h_i: Any,
                              ra_deg: Any, dec_deg: Any) -> dict[str,Any]:
    """Single frozen GLS for 40-120 versus the uncertain 120-160 plateau.

    H_i = H_ref + DeltaH_pool I(40<=D<120) + A_s dot n_i, with an independent
    dipole vector in each of the four frozen shells 40-60,60-80,80-120,120-160.
    """
    d=np.asarray(distance_mpc,float).reshape(-1); h=np.asarray(h_i,float).reshape(-1)
    s=np.asarray(sigma_h_i,float).reshape(-1); ra=np.asarray(ra_deg,float).reshape(-1); dec=np.asarray(dec_deg,float).reshape(-1)
    require(d.size==h.size==s.size==ra.size==dec.size,"CF4 joint: vetores incompatíveis")
    keep=(d>=40.0)&(d<=160.0)
    d,h,s,ra,dec=d[keep],h[keep],s[keep],ra[keep],dec[keep]
    require(d.size>=14 and np.all(np.isfinite(h)) and np.all(np.isfinite(s)) and np.all(s>0),"CF4 joint: dados insuficientes/inválidos")
    edges=((40.,60.),(60.,80.),(80.,120.),(120.,160.0000000001))
    shell=np.full(d.size,-1,int)
    for j,(lo,hi) in enumerate(edges): shell[(d>=lo)&(d<hi)]=j
    require(np.all(shell>=0) and set(shell.tolist())==set(range(4)),"CF4 joint: quatro shells precisam estar representados")
    rr=np.deg2rad(ra); dd=np.deg2rad(dec)
    nvec=np.column_stack([np.cos(dd)*np.cos(rr),np.cos(dd)*np.sin(rr),np.sin(dd)])
    X=np.zeros((d.size,14),float); X[:,0]=1.0; X[:,1]=(d<120.0).astype(float)
    for j in range(4):
        rows=shell==j; X[rows,2+3*j:2+3*(j+1)]=nvec[rows]
    fit=gls_fit_diagonal(h,X,s); beta=fit["beta"]; cb=fit["cov_beta"]
    sig=math.sqrt(float(cb[1,1])); delta=float(beta[1])
    dips={}
    for j,(lo,hi) in enumerate(edges):
        a=np.asarray(beta[2+3*j:2+3*(j+1)],float)
        va=cb[np.ix_(range(2+3*j,2+3*(j+1)),range(2+3*j,2+3*(j+1)))]
        amp=float(np.linalg.norm(a)); sn=float(math.sqrt(max(a@np.linalg.solve(va,a),0.0)))
        dips[f"{int(lo)}-{160 if j==3 else int(hi)}"]={"vector":a,"amplitude":amp,"sn":sn,"marginal_covariance":va.copy()}
    return {"H_ref":float(beta[0]),"delta_h_pool":delta,"sigma_delta_h_pool":sig,
            "lower95":delta-1.959963984540054*sig,"upper95":delta+1.959963984540054*sig,
            "dipoles":dips,"chi2":fit["chi2"],"n":fit["n"],"k":fit["k"]}

def run_cf4_joint_contrast_robustness(distance_mpc: Any, h_i: Any, sigma_h_i: Any,
                                      ra_deg: Any, dec_deg: Any, region_nside1: Sequence[int],
                                      method_family: Sequence[str]) -> dict[str,Any]:
    d=np.asarray(distance_mpc,float).reshape(-1); n=d.size
    vals=[np.asarray(x).reshape(-1) for x in (h_i,sigma_h_i,ra_deg,dec_deg)]
    reg=np.asarray(region_nside1,int).reshape(-1); fam=np.asarray([str(x) for x in method_family],object)
    require(all(x.size==n for x in vals) and reg.size==fam.size==n,"CF4 joint robustness: shapes incompatíveis")
    require(set(map(int,reg.tolist())).issubset(set(range(12))),"CF4 joint robustness: regiões precisam estar em 0..11")
    base=cf4_joint_pooled_contrast(d,h_i,sigma_h_i,ra_deg,dec_deg)
    rloo={}
    for r in range(12):
        q=reg!=r
        rloo[str(r)]=cf4_joint_pooled_contrast(d[q],vals[0][q],vals[1][q],vals[2][q],vals[3][q])
    floo={}
    for f in ("FP","TF"):
        if np.any(np.isin(fam, (f, "FP+TF"))):
            q=~np.isin(fam, (f, "FP+TF")); floo[f]=cf4_joint_pooled_contrast(d[q],vals[0][q],vals[1][q],vals[2][q],vals[3][q])
    pos=sum(1 for x in rloo.values() if x["delta_h_pool"]>0)
    return {"baseline":base,"region_loo":rloo,"method_loo":floo,"positive_region_loo_count":pos}

def _legacy_unselected_classifier(result: Mapping[str, Any]) -> dict[str, Any]:
    """Apply the frozen CF4 H1/H2/kill gates to the joint pooled-contrast output."""
    require(isinstance(result,Mapping) and "baseline" in result and "region_loo" in result,
            "CF4 decision: resultado de robustez ausente")
    b=result["baseline"]; d=float(b["delta_h_pool"]); lo=float(b["lower95"]); hi=float(b["upper95"])
    rloo=result["region_loo"]; require(len(rloo)==12,"CF4 decision: exige 12 LOO regionais")
    pos=sum(float(x["delta_h_pool"])>0 for x in rloo.values())
    mids=[b["dipoles"][k] for k in ("40-60","60-80","80-120")]
    strong=sum(float(x["sn"])>=3.0 for x in mids)
    if d>=1.5 and lo>0.5 and pos>=10:
        verdict="PROMOTED_LOCAL_MONOPOLE"
    elif d<0.5 and strong>=2:
        verdict="CLASSIFY_ANISOTROPIC_H2"
    elif abs(d)<0.5 and hi<1.0 and strong==0:
        verdict="REJECTED_LOCAL_ENVIRONMENT_H0_SHIFT"
    else:
        verdict="INCONCLUSIVE"
    return {"verdict":verdict,"delta_h_pool":d,"lower95":lo,"upper95":hi,
            "positive_region_loo_count":int(pos),"strong_dipole_shell_count_40_120":int(strong),
            "criteria_frozen":True}

CF4_TABLE4_SCHEMA_V1 = {
    "1PGC": (0,7,int), "DMzp": (8,14,float), "e_DMzp": (15,20,float), "Dist": (21,26,float),
    "V3k": (39,44,int), "fV3k": (45,50,int), "Hi": (70,75,float), "RAdeg": (83,91,float), "DEdeg": (92,100,float),
}

def parse_cf4_table4_line(line: str) -> dict[str, Any]:
    require(isinstance(line,str) and len(line)>=100,"CF4 table4: registro precisa cobrir bytes 1-100")
    out={}
    for name,(a,b,typ) in CF4_TABLE4_SCHEMA_V1.items():
        s=line[a:b].strip(); require(s!="",f"CF4 table4: {name} vazio")
        try: out[name]=typ(s)
        except ValueError as exc: raise ContractInputError(f"CF4 table4: {name} inválido") from exc
    require(out["Dist"]>0 and out["Hi"]>=0 and out["e_DMzp"]>=0,"CF4 table4: Dist/Hi/e_DMzp inválidos")
    # The catalogue publishes Hi directly; uncertainty follows solely from mu here.
    out["sigma_Hi"]=(math.log(10.0)/5.0)*out["e_DMzp"]*out["Hi"]
    return out

def parse_cf4_table4(raw: bytes | str) -> list[dict[str, Any]]:
    text=raw.decode("ascii") if isinstance(raw,(bytes,bytearray)) else str(raw)
    rows=[parse_cf4_table4_line(x) for x in text.splitlines() if x.strip()]
    require(rows,"CF4 table4: nenhum registro")
    return rows

def healpix_nside1_ring(ra_deg: Any, dec_deg: Any) -> np.ndarray:
    """Exact HEALPix RING ang2pix for Nside=1, used by the frozen CF4 12-region LOO."""
    ra=np.asarray(ra_deg,float).reshape(-1); dec=np.asarray(dec_deg,float).reshape(-1)
    require(ra.shape==dec.shape and np.isfinite(ra).all() and np.isfinite(dec).all(),"CF4 HEALPix: coordenadas inválidas")
    require(np.all((dec>=-90)&(dec<=90)),"CF4 HEALPix: DEC fora do intervalo")
    phi=np.mod(np.deg2rad(ra),2*np.pi); z=np.sin(np.deg2rad(dec)); tt=phi/(0.5*np.pi)
    out=np.empty(ra.size,dtype=int); nside=1; npix=12; ncap=0
    for i,(zz,t) in enumerate(zip(z,tt)):
        za=abs(float(zz))
        if za<=2.0/3.0:
            jp=math.floor(nside*(0.5+t-0.75*zz)); jm=math.floor(nside*(0.5+t+0.75*zz))
            ir=nside+1+jp-jm; kshift=1-(ir&1)
            ip=(jp+jm-nside+kshift+1)//2+1; ip=((ip-1)%(4*nside))+1
            pix=ncap+(ir-1)*4*nside+ip-1
        else:
            tp=t-math.floor(t); tmp=nside*math.sqrt(3.0*(1.0-za)); jp=math.floor(tp*tmp); jm=math.floor((1.0-tp)*tmp)
            ir=jp+jm+1; ip=math.floor(t*ir)+1
            if zz>0: pix=2*ir*(ir-1)+ip-1
            else: pix=npix-2*ir*(ir+1)+ip-1
        require(0<=pix<12,"CF4 HEALPix: pixel fora de 0..11"); out[i]=pix
    return out

def cf4_rows_with_frozen_regions(rows: Sequence[Mapping[str,Any]]) -> list[dict[str,Any]]:
    require(len(rows)>0,"CF4 integration: nenhuma linha")
    ra=np.asarray([float(r["RAdeg"]) for r in rows]); dec=np.asarray([float(r["DEdeg"]) for r in rows])
    pix=healpix_nside1_ring(ra,dec); out=[]
    for r,p in zip(rows,pix):
        q=dict(r); q["healpix_nside1_ring"]=int(p); out.append(q)
    require(set(pix.tolist()).issubset(set(range(12))),"CF4 integration: região inválida")
    return out

CF4_TABLE3_FAMILY_SCHEMA_V1 = {
    "1PGC": (0,7,int),
    "o_DMfp": (113,116,int),
    "o_DMtf": (130,132,int),
}

def parse_cf4_table3_family_line(line: str) -> dict[str, Any]:
    """Parse only the method-identity fields needed for the frozen FP/TF LOO."""
    require(isinstance(line,str) and len(line)>=97,"CF4 table3: registro precisa cobrir campos obrigatórios 1-97")
    line=line.ljust(132)  # Official fixed-width archive omits trailing blank optional columns.
    out={}
    for name,(a,b,typ) in CF4_TABLE3_FAMILY_SCHEMA_V1.items():
        s=line[a:b].strip()
        if name in {"o_DMfp","o_DMtf"} and s=="": out[name]=0; continue
        require(s!="",f"CF4 table3: {name} vazio")
        try: out[name]=typ(s)
        except ValueError as exc: raise ContractInputError(f"CF4 table3: {name} inválido") from exc
    require(out["o_DMfp"]>=0 and out["o_DMtf"]>=0,"CF4 table3: contagens FP/TF inválidas")
    return out

def parse_cf4_table3_families(raw: bytes | str) -> list[dict[str, Any]]:
    text=raw.decode("ascii") if isinstance(raw,(bytes,bytearray)) else str(raw)
    rows=[parse_cf4_table3_family_line(x) for x in text.splitlines() if x.strip()]
    require(rows,"CF4 table3: nenhum registro")
    ids=[r["1PGC"] for r in rows]; require(len(ids)==len(set(ids)),"CF4 table3: 1PGC duplicado")
    return rows

def cf4_join_method_families(table4_rows: Sequence[Mapping[str,Any]],
                             table3_rows: Sequence[Mapping[str,Any]]) -> list[dict[str,Any]]:
    """Join table3 method identities to table4 by 1PGC for frozen FP/TF LOO."""
    t4=[dict(x) for x in table4_rows]; t3=[dict(x) for x in table3_rows]
    m={int(x["1PGC"]):x for x in t3}; require(len(m)==len(t3),"CF4 join: table3 1PGC não único")
    out=[]
    for r in t4:
        pgc=int(r["1PGC"]); require(pgc in m,f"CF4 join: 1PGC {pgc} ausente da table3")
        s=m[pgc]; fp=int(s.get("o_DMfp",0))>0; tf=int(s.get("o_DMtf",0))>0
        q=dict(r); q["has_fp"]=fp; q["has_tf"]=tf
        q["method_family"]="FP+TF" if fp and tf else "FP" if fp else "TF" if tf else "OTHER"
        out.append(q)
    return out


def gls_fit_diagonal(y, X, sigma):
    """Exact diagonal whitening; no change of weighting or estimator."""
    y=np.asarray(y,float).reshape(-1); X=np.asarray(X,float); sigma=np.asarray(sigma,float).reshape(-1)
    require(X.ndim==2 and X.shape[0]==y.size==sigma.size,"Diagonal GLS: incompatible shapes")
    require(np.isfinite(y).all() and np.isfinite(X).all() and np.isfinite(sigma).all() and np.all(sigma>0),"Diagonal GLS: invalid selected data")
    yw=y/sigma; Xw=X/sigma[:,None]; normal=Xw.T@Xw
    require(np.linalg.matrix_rank(normal)==normal.shape[0],"Diagonal GLS: singular normal matrix")
    cov_beta=np.linalg.inv(normal); beta=cov_beta@(Xw.T@yw)
    resid=(y-X@beta)/sigma
    return {"beta":beta,"cov_beta":cov_beta,"chi2":float(resid@resid),"n":int(y.size),"k":int(X.shape[1])}

import re
def _validate_cf4_environment(params, inputs, manifest):
    """Pure technical admission for the single fixed catalog implementation.

    Identity and source commitments are supplied by the canonical TEST binding.
    They are provenance, not a caller-created scientific approval.
    """
    reasons=[]
    def no(code,detail): reasons.append((code,detail))
    if not isinstance(params,dict):
        return [('RECIPE_PARAMS_INVALID','params must be an object')]
    required={'mode','test_id','prereg_hash','dipole_score','fit_scope','decision_ref','decision_sha256'}
    if set(params)!=required: no('CF4_PARAMS_NOT_EXPLICIT','all seven identity/source fields are required; no extras')
    if params.get('mode')!='cf4_environment': no('UNSUPPORTED_RECIPE_MODE','smoke is never scientific admission')
    if (not isinstance(params.get('test_id'),str) or not params['test_id'].strip()
        or not isinstance(params.get('prereg_hash'),str)
        or not re.fullmatch(r'sha256:[0-9a-f]{64}',params['prereg_hash'])):
        no('FROZEN_TEST_IDENTITY_MISMATCH','canonical TEST identity and preregistration commitment are required')
    if manifest.get('dipole_score')!='vector_quadratic' or params.get('dipole_score')!='vector_quadratic':
        no('DIPOLE_SCORE_UNRESOLVED','this recipe implements the fixed vector_quadratic definition')
    if manifest.get('fit_scope')!='joint_gls_marginal' or params.get('fit_scope')!='joint_gls_marginal':
        no('DIPOLE_FIT_SCOPE_UNRESOLVED','the joint fit uses marginal dipole covariance; shell fits are diagnostics')
    ref=params.get('decision_ref'); sha=params.get('decision_sha256')
    if not isinstance(ref,str) or not ref.strip() or not isinstance(sha,str) or not re.fullmatch(r'[0-9a-f]{64}',sha):
        no('PROSPECTIVE_DECISION_REFERENCE_MISSING','explicit source reference and exact source SHA256 required')
    expected=manifest.get('inputs')
    if not isinstance(expected,list) or len(expected)!=3:
        no('PREFLIGHT_CONTRACT_INVALID','three fixed public inputs are required')
    else:
        required_inputs={(i['name'],i['url'],i['version'],i['sha256']) for i in expected}
        actual=set()
        if isinstance(inputs,list):
            for i in inputs:
                if not isinstance(i,dict): break
                actual.add((i.get('name'),i.get('url'),i.get('version'),str(i.get('sha256') or '').removeprefix('sha256:')))
        if not isinstance(inputs,list) or len(inputs)!=3 or actual!=required_inputs:
            no('INPUT_RECIPE_MANIFEST_MISMATCH','CF4 binding must match all three fixed input identities')
    return reasons

_CATALOG_MANIFEST_SHA256='c801613bd7e57e5e65e81d3e6b6168dfa3b574d687018e0e895eabdd1fc5c84e'
_CATALOG_VALIDATOR_SHA256='696775df30930ffca993d1487396dab8727de7097dc4352dc3d85f1dfc9b812a'
_FROZEN_MANIFEST_JSON='{\n  "contract": "RECIPE_PARAM_PREFLIGHT_V1",\n  "recipe": "cf4_monopole_dipole_shell_gls_v1",\n  "validator": "cf4_environment_v1",\n  "inputs": [\n    {\n      "name": "CF4 ReadMe",\n      "url": "https://cdsarc.cds.unistra.fr/ftp/J/ApJ/944/94/ReadMe",\n      "version": "CDS archive 28-Jan-2025 / J/ApJ/944/94",\n      "sha256": "2cfed1418147d5a626dee1fa37c47252124477c9828490508d9bbe511d34edb4"\n    },\n    {\n      "name": "CF4 table3.dat.gz",\n      "url": "https://cdsarc.cds.unistra.fr/ftp/J/ApJ/944/94/table3.dat.gz",\n      "version": "CDS archive 28-Jan-2025 / J/ApJ/944/94",\n      "sha256": "1c02e2b3829b0b323524a5f3671a5f530cbdccae3c10b432db0c2e2fe09672fe"\n    },\n    {\n      "name": "CF4 table4.dat.gz",\n      "url": "https://cdsarc.cds.unistra.fr/ftp/J/ApJ/944/94/table4.dat.gz",\n      "version": "CDS archive 28-Jan-2025 / J/ApJ/944/94",\n      "sha256": "be91d4fae6fa01552ab3bc85db695411fca3249eeae08b566a712e6ea790bd99"\n    }\n  ],\n  "dipole_score": "vector_quadratic",\n  "fit_scope": "joint_gls_marginal",\n  "definition": "Q=A^T Sigma_A^-1 A; sqrt(Q)>=3; report chi-square(3) diagnostic p. Sigma_A is the marginal covariance of each dipole in the joint GLS. Identity and source commitments belong to the individual canonical TEST binding, not to the generic public catalog."\n}\n'

# Runner integration uses the existing PARAMS_PATH / RESULT_PATH protocol.
import gzip
import hashlib
import json
import os
from pathlib import Path
import tempfile
import urllib.request

RECIPE_NAME='cf4_monopole_dipole_shell_gls_v1'

class OperationalBlock(ContractInputError):
    pass

def _manifest():
    return json.loads(_FROZEN_MANIFEST_JSON)

def _decision_preflight(params):
    manifest=_manifest()
    issues=_validate_cf4_environment(params,manifest['inputs'],manifest)
    if issues:
        raise OperationalBlock(','.join(sorted({code for code,_ in issues})))
    receipt={'contract':'RECIPE_PARAM_PREFLIGHT_V1','eligible':True,'reasons':[],
      'manifest_sha256':_CATALOG_MANIFEST_SHA256,'validator_sha256':_CATALOG_VALIDATOR_SHA256}
    return manifest,receipt

def _download_input(url):
    # Only the catalog's fixed public source URLs reach this function.
    with urllib.request.urlopen(url,timeout=120) as response:
        raw=response.read(8*1024*1024+1)
    require(len(raw)<=8*1024*1024,'CF4 input exceeds bounded byte size')
    return raw

def _load_bound_rows(manifest,fetcher=_download_input):
    data={}; evidence=[]
    for entry in manifest['inputs']:
        raw=fetcher(entry['url'])
        actual=hashlib.sha256(raw).hexdigest()
        require(actual==entry['sha256'],'CF4 input SHA256 mismatch: '+entry['name'])
        data[entry['name']]=raw; evidence.append(dict(entry,bytes=len(raw)))
    table3=parse_cf4_table3_families(gzip.decompress(data['CF4 table3.dat.gz']))
    table4=parse_cf4_table4(gzip.decompress(data['CF4 table4.dat.gz']))
    require(len(table3)==len(table4)==38053,'CF4 release requires exactly 38053 records in each table')
    ids=[r['1PGC'] for r in table4];require(len(ids)==len(set(ids)),'CF4 table4 duplicate groups')
    require(set(ids)=={r['1PGC'] for r in table3},'CF4 release requires identical group-key sets')
    rows=cf4_rows_with_frozen_regions(cf4_join_method_families(table4,table3))
    selected=[r for r in rows if 20.0<=r['Dist']<=160.0]
    require(selected and all(math.isfinite(r['sigma_Hi']) and r['sigma_Hi']>0 for r in selected),'CF4 selected uncertainties invalid')
    return selected,{'inputs':evidence,'total_groups':len(rows),'selected_groups':len(selected),'unselected_zero_Hi':sum(r['Hi']==0 and not 20<=r['Dist']<=160 for r in rows)}

def _columns(rows):
    return [[r[key] for r in rows] for key in ('Dist','Hi','sigma_Hi','RAdeg','DEdeg','healpix_nside1_ring','method_family')]

def explicit_dipole_score(dipole,criterion):
    require(criterion in ('radial_amplitude','vector_quadratic'),'Explicit dipole score required')
    a=np.asarray(dipole['vector'],float);v=_sym_pd(dipole['marginal_covariance'],3,'marginal dipole covariance')
    require(a.shape==(3,) and np.isfinite(a).all(),'Invalid dipole vector')
    amp=float(np.linalg.norm(a))
    if criterion=='vector_quadratic':return float(math.sqrt(max(a@np.linalg.solve(v,a),0.0)))
    if amp==0:return 0.0
    g=a/amp
    return amp/math.sqrt(float(g@v@g))

def dipole_q_chi_square_df3(dipole):
    """Diagnostic p for a three-component Gaussian vector; not a 1D sigma claim."""
    score=explicit_dipole_score(dipole,'vector_quadratic');q=score*score
    require(math.isfinite(q),'Nonfinite dipole quadratic statistic')
    # Exact survival function of chi-square with three degrees of freedom.
    p=math.erfc(math.sqrt(q/2.0))+math.sqrt(2.0*q/math.pi)*math.exp(-q/2.0)
    return {'Q':q,'degrees_of_freedom':3,'p_value':min(1.0,max(0.0,p)),
            'sqrtQ_is_not_gaussian_1d_sigma':True}

def _classify_explicit(pooled,criterion):
    baseline=pooled['baseline'];d=baseline['delta_h_pool'];lo=baseline['lower95'];hi=baseline['upper95']
    require(len(pooled['region_loo'])==12,'Twelve spatial omissions required')
    positive=sum(x['delta_h_pool']>0 for x in pooled['region_loo'].values())
    scores={k:explicit_dipole_score(v,criterion) for k,v in baseline['dipoles'].items()}
    vector_p={k:dipole_q_chi_square_df3(v) for k,v in baseline['dipoles'].items()}
    strong=sum(scores[k]>=3.0 for k in ('40-60','60-80','80-120'))
    if d>=1.5 and lo>0.5 and positive>=10:decision='PROMOTED_LOCAL_MONOPOLE'
    elif d<0.5 and strong>=2:decision='CLASSIFY_ANISOTROPIC_H2'
    elif abs(d)<0.5 and hi<1.0 and strong==0:decision='REJECTED_LOCAL_ENVIRONMENT_H0_SHIFT'
    else:decision='INCONCLUSIVE'
    # Generic runner verdict and detailed frozen scientific branch are both retained.
    verdict={'PROMOTED_LOCAL_MONOPOLE':'PROMOTED','REJECTED_LOCAL_ENVIRONMENT_H0_SHIFT':'REJECTED'}.get(decision,'INCONCLUSIVE')
    return {'verdict':verdict,'decision':decision,'dipole_score':criterion,'dipole_scores':scores,'dipole_chi_square_df3':vector_p,'strong_shells':strong,'positive_region_loo_count':positive}

def _json_value(value):
    if isinstance(value,np.ndarray):return value.tolist()
    if isinstance(value,np.generic):return value.item()
    if isinstance(value,dict):return {k:_json_value(v) for k,v in value.items()}
    if isinstance(value,(list,tuple)):return [_json_value(v) for v in value]
    return value

def scientific_run(params,fetcher=_download_input):
    # Fixed-contract preflight precedes any remote download or scientific fit.
    manifest,admission=_decision_preflight(params)
    rows,inputs=_load_bound_rows(manifest,fetcher)
    cols=_columns(rows)
    pooled=run_cf4_joint_contrast_robustness(*cols)
    diagnostics=run_cf4_robustness(*cols)
    classification=_classify_explicit(pooled,params['dipole_score'])
    return _json_value({'ok':True,**{k:classification[k] for k in ('verdict','decision')},
      'summary':'CF4 joint monopole/dipole calculation completed with the fixed catalog definition.',
      'statistics':{'scientific_result_eligible':True,'inputs':inputs,'pooled':pooled,
       'shell_diagnostics_absolute_monopoles':diagnostics,'classification':classification,
       'decision_binding':{k:params[k] for k in ('test_id','prereg_hash','dipole_score','fit_scope','decision_ref','decision_sha256')},'parameter_admission':admission},
      'semantic':{'result_meaning':'Local observed CF4 environment only; no cosmological frequency or independent distance-ladder evidence.'}})

def synthetic_smoke():
    # No catalogs, no scientific result, and no admission bypass for a TEST.
    ras=[45,135,225,315,0,90,180,270,45,135,225,315]
    decs=[math.degrees(math.asin(2/3))]*4+[0]*4+[-math.degrees(math.asin(2/3))]*4
    rows=[]
    for distance in (30,50,70,100,140):
        for ra,dec in zip(ras,decs):
            for family in ('FP','TF','FP+TF','OTHER'):
                rows.append({'Dist':distance,'Hi':72.0 if distance<120 else 70.0,'sigma_Hi':4.,'RAdeg':ra,'DEdeg':dec,'method_family':family})
    rows=cf4_rows_with_frozen_regions(rows);cols=_columns(rows)
    pooled=run_cf4_joint_contrast_robustness(*cols); diagnostics=run_cf4_robustness(*cols)
    require(math.isclose(pooled['baseline']['delta_h_pool'],2.,abs_tol=1e-10),'Synthetic pooled contrast mismatch')
    require(len(pooled['region_loo'])==12 and set(pooled['method_loo'])=={'FP','TF'},'Synthetic LOO coverage missing')
    return {'ok':True,'execution_status':'TECHNICAL_SMOKE_ONLY','scientific_result_eligible':False,'result':None,'verdict':None,'decision':'TECHNICAL_SMOKE_ONLY','summary':'Synthetic CF4 loader-independent smoke passed; no scientific TEST was executed.','statistics':{'scientific_result_eligible':False,'dataset_kind':'synthetic','checks':{'regions':12,'families':2,'shells':len(diagnostics['baseline'])}},'semantic':{'result_meaning':'Technical smoke on synthetic numbers only; no scientific verdict.'}}

def run(params):
    if isinstance(params,dict) and params=={'mode':'synthetic_smoke'}:return synthetic_smoke()
    return scientific_run(params)

def main():
    code=0
    try:
        params=json.loads(Path(os.environ['PARAMS_PATH']).read_text())
        result=run(params)
    except (ContractInputError,ValueError,KeyError,OSError,np.linalg.LinAlgError) as error:
        code=1
        result={'ok':False,'execution_status':'INPUT_OR_FIT_UNAVAILABLE','error':str(error),'scientific_result_eligible':False}
    Path(os.environ['RESULT_PATH']).write_text(json.dumps(result,ensure_ascii=False,allow_nan=False)+'\n')
    print(result.get('summary') or result.get('error'))
    raise SystemExit(code)

if __name__=='__main__':main()
