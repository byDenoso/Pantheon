"""Receita congelada: robustez w0-wa em compilações de SNe (Pantheon+, DES-SN5YR, Union3) com DESI DR2 BAO.

Modos:
  redshift_jackknife: leave-one-band-out nas SNe.
  bao_tracer_jackknife: leave-one-tracer-family-out no BAO.
"""
import csv, io, json, math, os, urllib.request
import numpy as np
from scipy.integrate import cumulative_trapezoid
from scipy.optimize import minimize

BAO_BASE="https://raw.githubusercontent.com/CobayaSampler/bao_data/master/desi_bao_dr2/desi_gaussian_bao_ALL_GCcomb_"
PPLUS_BASE="https://raw.githubusercontent.com/PantheonPlusSH0ES/DataRelease/main/Pantheon%2B_Data/4_DISTANCES_AND_COVAR/"
DES_BASE="https://raw.githubusercontent.com/des-science/DES-SN5YR/main/4_DISTANCES_COVMAT/"
ZGRID=np.linspace(0.0,2.6,5201)

def fetch_bytes(url):
    with urllib.request.urlopen(url,timeout=180) as r:
        return r.read()
def fetch_text(url):
    return fetch_bytes(url).decode("utf-8")

def load_bao():
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
    d=np.load(io.BytesIO(fetch_bytes(DES_BASE+"STAT+SYS.npz")))
    n=int(d[d.files[0]][0]); inv=np.zeros((n,n)); inv[np.triu_indices(n)]=d[d.files[1]]
    lo=np.tril_indices(n,-1); inv[lo]=inv.T[lo]
    return {"name":"DES-SN5YR","z":z,"zhel":zh,"mu":mu,"cov":None,"prec":inv}

UNION3_URL="https://raw.githubusercontent.com/rubind/union3_release/main/mu_mat_union3_cosmo=2_mu.fits"

def load_union3():
    """Union3 binned: FITS 23x23 float64, row 0 = z nodes, column 0 = mu, the rest = inverse covariance."""
    b=fetch_bytes(UNION3_URL); h=b[:2880].decode()
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
    d=sn["mu"]-theo; inv=sn["prec"]; one=np.ones(len(d)); A=d@inv@d; B=d@inv@one; C=one@inv@one
    total+=float(A-B*B/C+np.log(C/(2*np.pi)))
    for name,idx in (("omega_m",0),("w0",1),("wa",2),("a_rd",3)):
        if name in priors:
            m,s=priors[name]; total+=((theta[idx]-float(m))/float(s))**2
    return total

def fit(bao,sn,priors,lcdm=False):
    if lcdm:
        f=lambda t:chi2([t[0],-1.,0.,t[1]],bao,sn,priors)
        best=min((minimize(f,x,method="Nelder-Mead",options={"maxiter":5000}) for x in ([0.315,30.],[0.30,29.],[0.33,31.])),key=lambda x:x.fun)
        return {"omega_m":float(best.x[0]),"w0":-1.,"wa":0.,"a_rd":float(best.x[1])},float(best.fun)
    f=lambda t:chi2(t,bao,sn,priors)
    best=min((minimize(f,x,method="Nelder-Mead",options={"maxiter":16000,"xatol":1e-6,"fatol":1e-6}) for x in ([0.315,-0.9,-0.5,30.],[0.30,-0.7,-1.0,30.],[0.315,-1.,0.,30.])),key=lambda x:x.fun)
    return {"omega_m":float(best.x[0]),"w0":float(best.x[1]),"wa":float(best.x[2]),"a_rd":float(best.x[3])},float(best.fun)

def sub_sn(sn,band):
    if band is None:return sn
    a,b=band; k=np.where(~((sn["z"]>=a)&(sn["z"]<b)))[0]
    if sn["cov"] is None:
        cov=np.linalg.inv(sn["prec"])[np.ix_(k,k)]
    else:
        cov=sn["cov"][np.ix_(k,k)]
    return {**sn,"z":sn["z"][k],"zhel":sn["zhel"][k],"mu":sn["mu"][k],"cov":cov,"prec":np.linalg.inv(cov)}

def sub_bao(bao,drop):
    z,v,q,c=bao; k=np.array([i for i,zz in enumerate(z) if not any(abs(float(zz)-float(d))<1e-3 for d in drop)],int)
    return z[k],v[k],[q[i] for i in k],c[np.ix_(k,k)]

def dchi(bao,sn,priors):
    p,c=fit(bao,sn,priors,False); _,cl=fit(bao,sn,priors,True)
    return p,float(cl-c)

def cosine(p,q):
    a=np.array([p["w0"]+1,p["wa"]]); b=np.array([q["w0"]+1,q["wa"]]); den=np.linalg.norm(a)*np.linalg.norm(b)
    return None if den==0 else float(a@b/den)

params=json.load(open(os.environ["PARAMS_PATH"],encoding="utf-8"))
mode=params["mode"]; priors=params.get("priors") or {}; comps=params.get("compilations") or ["pantheon_plus","des_sn5yr"]
loaders={"pantheon_plus":load_pantheon,"des_sn5yr":load_des,"union3":load_union3}; bao=load_bao(); out=[]
for cname in comps:
    sn=loaders[cname](); p0,d0=dchi(bao,sn,priors); row={"compilation":sn["name"],"full":{"params":p0,"delta_chi2":d0},"holds":[]}
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
    out.append(row)

labels=[h["label"] for h in out[0]["holds"]] if out else []
if len(out)<2:
    verdict,decision="INCONCLUSIVE","INSUFFICIENT_COMPILATIONS"
elif mode=="redshift_jackknife":
    over50={lab:sum(1 for r in out for h in r["holds"] if h["label"]==lab and h["fraction_removed"] is not None and h["fraction_removed"]>0.5) for lab in labels}
    over70={lab:sum(1 for r in out for h in r["holds"] if h["label"]==lab and h["fraction_removed"] is not None and h["fraction_removed"]>=0.7) for lab in labels}
    residual_ok=all(all(h["residual_sigma"]>=2 for h in r["holds"]) for r in out)
    if any(v>=2 for v in over70.values()): verdict,decision="REJECTED","SAME_BAND_DOMINATES"
    elif not any(v>=2 for v in over50.values()) and residual_ok: verdict,decision="PROMOTED","DISTRIBUTED_REDSHIFT_LEVERAGE"
    else: verdict,decision="INCONCLUSIVE","MIXED_REDSHIFT_LEVERAGE"
else:
    over50={lab:sum(1 for r in out for h in r["holds"] if h["label"]==lab and h["fraction_removed"] is not None and h["fraction_removed"]>0.5) for lab in labels}
    over70={lab:sum(1 for r in out for h in r["holds"] if h["label"]==lab and h["fraction_removed"] is not None and h["fraction_removed"]>=0.7) for lab in labels}
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
payload={"verdict":verdict,"decision":decision,"summary":f"{mode}: {decision} em {len(out)} compilações públicas.","statistics":{"mode":mode,"compilations":out,"priors":priors},"semantic":{"result_meaning":MEANING[decision]+detail,"verdict_plain":VERDICT_PT[verdict]}}
raw=json.dumps(payload,ensure_ascii=False,sort_keys=True,separators=(",",":"))
open(os.environ["RESULT_PATH"],"w",encoding="utf-8").write(raw)
print(payload["summary"])
