"""Receita congelada: robustez w0-wa em compilações de SNe (Pantheon+, DES-SN5YR, Union3) com DESI DR1 ou DR2 BAO.

Modos:
  redshift_jackknife: leave-one-band-out nas SNe.
  bao_tracer_jackknife: leave-one-tracer-family-out no BAO.
"""
import csv, hashlib, io, json, math, os, urllib.request
from functools import lru_cache
import numpy as np
from scipy.integrate import cumulative_trapezoid
from scipy.optimize import minimize

BAO_BASES={"dr1": "https://raw.githubusercontent.com/CobayaSampler/bao_data/bb0c1c9009dc76d1391300e169e8df38fd1096db/desi_2024_gaussian_bao_ALL_GCcomb_", "dr2": "https://raw.githubusercontent.com/CobayaSampler/bao_data/bb0c1c9009dc76d1391300e169e8df38fd1096db/desi_bao_dr2/desi_gaussian_bao_ALL_GCcomb_"}
PPLUS_BASE="https://raw.githubusercontent.com/PantheonPlusSH0ES/DataRelease/c447f0fea703fcd0fff57de5000947b5ca81286b/Pantheon%2B_Data/4_DISTANCES_AND_COVAR/"
DES_BASE="https://raw.githubusercontent.com/des-science/DES-SN5YR/c9a4fcafc4cbd19bd750dee47fc76194a45c181f/4_DISTANCES_COVMAT/"
SOURCES = {
    "https://raw.githubusercontent.com/CobayaSampler/bao_data/bb0c1c9009dc76d1391300e169e8df38fd1096db/desi_2024_gaussian_bao_ALL_GCcomb_mean.txt": "dd2873a0b88459a491af3c0c0307ba059f62df9211d5b976760f310565a1be68",
    "https://raw.githubusercontent.com/CobayaSampler/bao_data/bb0c1c9009dc76d1391300e169e8df38fd1096db/desi_2024_gaussian_bao_ALL_GCcomb_cov.txt": "bbafa9074b51cf1a45e0d10e4f37db8c0e80a5d1d1788857abb7fc49fb21abcc",
    "https://raw.githubusercontent.com/CobayaSampler/bao_data/bb0c1c9009dc76d1391300e169e8df38fd1096db/desi_bao_dr2/desi_gaussian_bao_ALL_GCcomb_mean.txt": "9ac154ab583ce759c0f7eef3c978c7c70a6ead2d18774caceadf1a350a640585",
    "https://raw.githubusercontent.com/CobayaSampler/bao_data/bb0c1c9009dc76d1391300e169e8df38fd1096db/desi_bao_dr2/desi_gaussian_bao_ALL_GCcomb_cov.txt": "252a143274c8a07c78694c119617d36594f6d7965d00319ca611c6ffb886e509",
    "https://raw.githubusercontent.com/PantheonPlusSH0ES/DataRelease/c447f0fea703fcd0fff57de5000947b5ca81286b/Pantheon%2B_Data/4_DISTANCES_AND_COVAR/Pantheon%2BSH0ES.dat": "1cb0fc379ef066afdc2ffd1857681cc478024570d8a3eba284fb645775198cf8",
    "https://raw.githubusercontent.com/PantheonPlusSH0ES/DataRelease/c447f0fea703fcd0fff57de5000947b5ca81286b/Pantheon%2B_Data/4_DISTANCES_AND_COVAR/Pantheon%2BSH0ES_STAT%2BSYS.cov": "abf806d966485e64afdb359c87bffc0ecc00d05eff0a31ced66f247385df0fdc",
    "https://raw.githubusercontent.com/des-science/DES-SN5YR/c9a4fcafc4cbd19bd750dee47fc76194a45c181f/4_DISTANCES_COVMAT/DES-Dovekie_HD.csv": "2f57019d783eaa976df80a41b0054171a2d994ee9808d715ce850c2df5720aaf",
    "https://raw.githubusercontent.com/des-science/DES-SN5YR/c9a4fcafc4cbd19bd750dee47fc76194a45c181f/4_DISTANCES_COVMAT/STAT%2BSYS.npz": "ffd3124b32148b1372bd95fda9299269f0352a9f8eee02d416c610e38495463b"
}
PROVENANCE = []
ZGRID=np.linspace(0.0,2.6,5201)

@lru_cache(maxsize=12)
def fetch_bytes(url):
    with urllib.request.urlopen(url,timeout=180) as r:
        raw = r.read()
    expected = SOURCES.get(url)
    if expected is None or hashlib.sha256(raw).hexdigest() != expected:
        raise ValueError("Dado sem binding congelado ou sha256 divergente: " + url)
    PROVENANCE.append({"url": url, "sha256": expected})
    return raw
def fetch_text(url):
    return fetch_bytes(url).decode("utf-8")

def load_bao(release="dr2"):
    BAO_BASE = BAO_BASES[release]
    rows=[l.split() for l in fetch_text(BAO_BASE+"mean.txt").splitlines() if l.strip() and not l.startswith("#")]
    z=np.array([float(r[0]) for r in rows]); v=np.array([float(r[1]) for r in rows]); q=[r[2] for r in rows]
    c=np.loadtxt(io.StringIO(fetch_text(BAO_BASE+"cov.txt")))
    return z,v,q,c

def load_pantheon():
    lines=fetch_text(PPLUS_BASE+"Pantheon%2BSH0ES.dat").splitlines(); head=lines[0].split()
    data=np.array([l.split() for l in lines[1:] if l.strip()],dtype=object); col={h:i for i,h in enumerate(head)}
    z=data[:,col["zHD"]].astype(float); zh=data[:,col["zHEL"]].astype(float); mu=data[:,col["m_b_corr"]].astype(float)
    cal=data[:,col["IS_CALIBRATOR"]].astype(int)
    raw=fetch_text(PPLUS_BASE+"Pantheon%2BSH0ES_STAT%2BSYS.cov").split(); n=int(raw[0]); cov=np.array(raw[1:],float).reshape(n,n)
    k=np.where((z>0.01)&(cal==0))[0]
    sub=cov[np.ix_(k,k)]
    return {"name":"Pantheon+","z":z[k],"zhel":zh[k],"mu":mu[k],"cov":sub,"prec":np.linalg.inv(sub)}

def snana_rows(text):
    """DES HD files are SNANA tables: '# ...' comments, one 'VARNAMES:' header, 'SN:' rows split on whitespace."""
    names=None; rows=[]
    for line in text.splitlines():
        parts=line.split()
        if not parts or parts[0].startswith("#"): continue
        if parts[0]=="VARNAMES:": names=parts[1:]
        elif parts[0]=="SN:" and names: rows.append(dict(zip(names,parts[1:])))
    if not rows: raise RuntimeError("DES HD: no SN rows parsed")
    return rows

def load_des():
    rows=snana_rows(fetch_text(DES_BASE+"DES-Dovekie_HD.csv"))
    z=np.array([float(r["zHD"]) for r in rows]); zh=np.array([float(r["zHEL"]) for r in rows]); mu=np.array([float(r["MU"]) for r in rows])
    d=np.load(io.BytesIO(fetch_bytes(DES_BASE+"STAT%2BSYS.npz")))
    n=int(d[d.files[0]][0]); inv=np.zeros((n,n)); inv[np.triu_indices(n)]=d[d.files[1]]
    lo=np.tril_indices(n,-1); inv[lo]=inv.T[lo]
    return {"name":"DES-SN5YR","z":z,"zhel":zh,"mu":mu,"cov":None,"prec":inv}

# Union3 (Rubin et al. 2023), release commit and file hash frozen.
UNION3_URL="https://raw.githubusercontent.com/rubind/union3_release/f5c387349b68f3535fdabf0fbc4f45cd407f9084/mu_mat_union3_cosmo=2_mu.fits"
UNION3_SHA256="ef98b7dde1025ee7134f3242aaea3f1f0ed3f2b29a718458c550a8e4e24d0349"
SOURCES[UNION3_URL] = UNION3_SHA256

def load_union3():
    """Union3 binned: FITS 23x23 float64, row 0 = z nodes, column 0 = mu, the rest = inverse covariance."""
    import hashlib
    b=fetch_bytes(UNION3_URL)
    if hashlib.sha256(b).hexdigest()!=UNION3_SHA256: raise RuntimeError("Union3 file hash mismatch")
    h=b[:2880].decode()
    kv={h[i:i+8].strip():h[i+10:i+30].strip() for i in range(0,2880,80) if h[i+8:i+10]=="= "}
    n1,n2=int(kv["NAXIS1"]),int(kv["NAXIS2"]); a=np.frombuffer(b[2880:2880+8*n1*n2],">f8").reshape(n2,n1).astype(float)
    z=a[0,1:]; prec=a[1:,1:]
    return {"name":"Union3","z":z,"zhel":z,"mu":a[1:,0],"cov":np.linalg.inv(prec),"prec":prec}

def comoving(om,w0,wa):
    a=1/(1+ZGRID); de=(1-om)*a**(-3*(1+w0+wa))*np.exp(-3*wa*(1-a)); e=np.sqrt(om*(1+ZGRID)**3+de)
    return cumulative_trapezoid(1/e,ZGRID,initial=0),e

def model_bao(om,w0,wa,a_rd,z):
    chi,e=comoving(om,w0,wa); dm=a_rd*np.interp(z,ZGRID,chi); dh=a_rd/np.interp(z,ZGRID,e)
    return dm,dh,(z*dm*dm*dh)**(1/3)

def chi2(theta,bao,sn,priors):
    bz,bv,bq,bc=bao; om,w0,wa,a_rd=theta
    if not (0.08<om<0.6 and -3<w0<0.5 and -5<wa<2.5 and 10<a_rd<60) or w0+wa>=0:
        return 1e12
    dm,dh,dv=model_bao(om,w0,wa,a_rd,bz)
    pred=np.array([{"DM_over_rs":dm[i],"DH_over_rs":dh[i],"DV_over_rs":dv[i]}[q] for i,q in enumerate(bq)])
    r=bv-pred; total=float(r@np.linalg.inv(bc)@r)
    chi,_=comoving(om,w0,wa); dl=(1+sn["zhel"])*np.interp(sn["z"],ZGRID,chi); theo=5*np.log10(dl)
    d=sn["mu"]-theo; d=d-d[0]; inv=sn["prec"]; one=np.ones(len(d)); A=d@inv@d; B=d@inv@one; C=one@inv@one
    total+=float(A-B*B/C+np.log(C/(2*np.pi)))
    for name,idx in (("omega_m",0),("w0",1),("wa",2),("a_rd",3)):
        if name in priors:
            m,s=priors[name]; total+=((theta[idx]-float(m))/float(s))**2
    return total

def fit(bao,sn,priors,lcdm=False):
    if lcdm:
        f=lambda t:chi2([t[0],-1.,0.,t[1]],bao,sn,priors)
        best=min((minimize(f,x,method="Nelder-Mead",options={"maxiter":5000}) for x in ([0.315,30.],[0.30,29.],[0.33,31.])),key=lambda x:x.fun)
        if not best.success or not np.isfinite(best.fun) or best.fun>=1e11:
            raise RuntimeError("Ajuste LambdaCDM não convergiu.")
        return {"omega_m":float(best.x[0]),"w0":-1.,"wa":0.,"a_rd":float(best.x[1])},float(best.fun)
    f=lambda t:chi2(t,bao,sn,priors)
    best=min((minimize(f,x,method="Nelder-Mead",options={"maxiter":16000,"xatol":1e-6,"fatol":1e-6}) for x in ([0.315,-0.9,-0.5,30.],[0.30,-0.7,-1.0,30.],[0.315,-1.,0.,30.])),key=lambda x:x.fun)
    if not best.success or not np.isfinite(best.fun) or best.fun>=1e11:
        raise RuntimeError("Ajuste CPL não convergiu.")
    return {"omega_m":float(best.x[0]),"w0":float(best.x[1]),"wa":float(best.x[2]),"a_rd":float(best.x[3])},float(best.fun)

def sub_sn(sn,band):
    if band is None:return sn
    a,b=band; k=np.where(~((sn["z"]>=a)&(sn["z"]<b)))[0]
    if sn["cov"] is None:
        cov=np.linalg.inv(sn["prec"])[np.ix_(k,k)]
    else:
        cov=sn["cov"][np.ix_(k,k)]
    if len(k)<10: raise ValueError("Holdout deixou menos de dez pontos de supernovas.")
    return {**sn,"z":sn["z"][k],"zhel":sn["zhel"][k],"mu":sn["mu"][k],"cov":cov,"prec":np.linalg.inv(cov)}

def sub_bao(bao,drop):
    z,v,q,c=bao
    if any(not np.any(np.isclose(z, float(d), atol=1e-3, rtol=0)) for d in drop):
        raise ValueError("Holdout BAO não existe neste release; fixe os redshifts do release escolhido.")
    k=np.array([i for i,zz in enumerate(z) if not any(abs(float(zz)-float(d))<1e-3 for d in drop)],int)
    if len(k)<4: raise ValueError("Holdout deixou menos de quatro medidas BAO.")
    return z[k],v[k],[q[i] for i in k],c[np.ix_(k,k)]

def dchi(bao,sn,priors):
    p,c=fit(bao,sn,priors,False); _,cl=fit(bao,sn,priors,True)
    return p,float(cl-c)

def cosine(p,q):
    a=np.array([p["w0"]+1,p["wa"]]); b=np.array([q["w0"]+1,q["wa"]]); den=np.linalg.norm(a)*np.linalg.norm(b)
    return None if den==0 else float(a@b/den)

def run(params):
    mode=params["mode"]; priors=params.get("priors") or {}; comps=params.get("compilations") or ["pantheon_plus","des_sn5yr"]
    if len(comps)!=len(set(comps)): raise ValueError("Compilações repetidas não são replicações independentes.")
    if any(len(v)!=2 or not np.isfinite(v).all() or float(v[1])<=0 for v in priors.values()):
        raise ValueError("Prior exige média e desvio positivo finitos.")
    loaders={"pantheon_plus":load_pantheon,"des_sn5yr":load_des,"union3":load_union3}; bao=load_bao(params.get("bao_release", "dr2")); out=[]
    for cname in comps:
        sn=loaders[cname]()
        if len(sn["z"])<10: raise ValueError("Amostra de supernovas com menos de dez pontos.")
        p0,d0=dchi(bao,sn,priors); row={"compilation":sn["name"],"full":{"params":p0,"delta_chi2":d0},"holds":[]}
        if mode=="redshift_jackknife":
            for band in params["bands"]:
                p,d=dchi(bao,sub_sn(sn,band),priors); frac=(d0-d)/abs(d0) if abs(d0)>1e-9 else None
                row["holds"].append({"label":f"{band[0]}-{band[1]}","params":p,"delta_chi2":d,"fraction_removed":frac,"residual_sigma":math.sqrt(max(d,0.0))})
        elif mode=="bao_tracer_jackknife":
            for g in params["tracer_groups"]:
                p,d=dchi(sub_bao(bao,g["z"]),sn,priors); frac=(d0-d)/abs(d0) if abs(d0)>1e-9 else None
                row["holds"].append({"label":g["label"],"params":p,"delta_chi2":d,"fraction_removed":frac,"cosine":cosine(p0,p)})
        else:
            raise ValueError("unsupported mode")
        if not row["holds"]: raise ValueError("Declare pelo menos um holdout congelado.")
        out.append(row)

    if any(r["full"]["delta_chi2"]<=1e-6 for r in out):
        raise RuntimeError("Ganho CPL nulo: fração removida não é identificável.")
    labels=[h["label"] for h in out[0]["holds"]] if out else []
    if len(out)<2:
        verdict,decision="INCONCLUSIVE","INSUFFICIENT_COMPILATIONS"
    elif mode=="redshift_jackknife":
        over50={lab:sum(1 for r in out for h in r["holds"] if h["label"]==lab and h["fraction_removed"] is not None and h["fraction_removed"]>0.5) for lab in labels}
        over70={lab:sum(1 for r in out for h in r["holds"] if h["label"]==lab and h["fraction_removed"] is not None and h["fraction_removed"]>=0.7) for lab in labels}
        residual_ok=all(all(h["residual_sigma"]>=2 for h in r["holds"]) for r in out)
        if any(v>=2 for v in over70.values()) or any(sum(h["residual_sigma"]<1 for r in out for h in r["holds"] if h["label"]==lab)>=2 for lab in labels): verdict,decision="REJECTED","SAME_BAND_DOMINATES"
        elif not any(v>=2 for v in over50.values()) and residual_ok: verdict,decision="PROMOTED","DISTRIBUTED_REDSHIFT_LEVERAGE"
        else: verdict,decision="INCONCLUSIVE","MIXED_REDSHIFT_LEVERAGE"
    else:
        over50={lab:sum(1 for r in out for h in r["holds"] if h["label"]==lab and h["fraction_removed"] is not None and h["fraction_removed"]>0.5) for lab in labels}
        over70={lab:sum(1 for r in out for h in r["holds"] if h["label"]==lab and h["fraction_removed"] is not None and h["fraction_removed"]>0.7) for lab in labels}
        cos_ok=all(all(h["cosine"] is not None and h["cosine"]>=0.8 for h in r["holds"]) for r in out)
        if any(v>=2 for v in over70.values()): verdict,decision="REJECTED","SAME_TRACER_DOMINATES"
        elif not any(v>=2 for v in over50.values()) and cos_ok: verdict,decision="PROMOTED","TRACER_ROBUST"
        else: verdict,decision="INCONCLUSIVE","MIXED_TRACER_ROBUSTNESS"

    # Leitura em português simples, escrita a partir da decisão (o critério congelado não muda).
    def worst(key):
        return max(((h[key] or 0, h["label"]) for r in out for h in r["holds"] if h.get(key) is not None), default=(0, "-"))
    MEANING={
     "INSUFFICIENT_COMPILATIONS":"Só uma coleção de supernovas pôde ser usada; o teste exige duas para comparar, então não decide.",
     "SAME_BAND_DOMINATES":"A preferência por energia escura variável depende quase toda de uma única faixa de distância nas duas coleções de supernovas: tirando essa faixa, ela praticamente some.",
     "DISTRIBUTED_REDSHIFT_LEVERAGE":"A preferência por energia escura variável não depende de uma faixa só: continua de pé quando se tira qualquer faixa de distância, nas duas coleções de supernovas.",
     "MIXED_REDSHIFT_LEVERAGE":"Resultado misto: uma faixa de distância pesa bastante, mas não o suficiente para dizer que a preferência por energia escura variável depende só dela.",
     "SAME_TRACER_DOMINATES":"A preferência por energia escura variável vem quase toda de um único tipo de galáxia no mapa do DESI.",
     "TRACER_ROBUST":"A preferência por energia escura variável aparece com todos os tipos de galáxia do DESI; nenhum sozinho a sustenta.",
     "MIXED_TRACER_ROBUSTNESS":"Resultado misto: um tipo de galáxia do DESI pesa bastante, mas não o suficiente para concluir que a preferência depende só dele.",
    }
    frac,band=worst("fraction_removed")
    detail=f" A faixa que mais pesa ({band}) responde por {frac*100:.0f}% da preferência." if mode=="redshift_jackknife" and out else ""
    VERDICT_PT={"PROMOTED":"Passou no critério","REJECTED":"Não passou no critério","INCONCLUSIVE":"Inconclusivo"}
    payload={"verdict":verdict,"decision":decision,"summary":f"{mode}: {decision} em {len(out)} compilações públicas.","statistics":{"bao_release":params.get("bao_release", "dr2"),"data_sources":PROVENANCE,"mode":mode,"compilations":out,"priors":priors},"semantic":{"result_meaning":MEANING[decision]+detail,"verdict_plain":VERDICT_PT[verdict]}}
    return payload

if __name__ == "__main__":
    try:
        payload = run(json.load(open(os.environ["PARAMS_PATH"],encoding="utf-8")))
    except (OSError, ValueError, KeyError, RuntimeError, np.linalg.LinAlgError) as error:
        payload = {"verdict":"INCONCLUSIVE", "decision":"INPUT_OR_FIT_UNAVAILABLE",
                   "summary":str(error), "statistics":{"data_sources":PROVENANCE},
                   "semantic":{"result_meaning":"O cálculo não pôde ser concluído com os dados e parâmetros congelados: " + str(error)}}
    with open(os.environ["RESULT_PATH"],"w",encoding="utf-8") as result:
        json.dump(payload,result,ensure_ascii=False,allow_nan=False)
    print(payload["summary"])
