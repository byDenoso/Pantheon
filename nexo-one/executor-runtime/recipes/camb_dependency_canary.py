import json, os
import camb
pars = camb.CAMBparams()
pars.set_cosmology(H0=67.4, ombh2=0.0224, omch2=0.12, mnu=0.06, omk=0.0)
pars.InitPower.set_params(As=2.1e-9, ns=0.965)
bg = camb.get_background(pars)
h0 = float(bg.hubble_parameter(0.0))
ok = abs(h0 - 67.4) < 1e-3
res = {
  "verdict": "PROMOTED" if ok else "REJECTED",
  "decision": "CAMB_DEP_OK" if ok else "CAMB_DEP_BAD",
  "summary": f"H0={h0:.6f}",
  "statistics": {"H0": h0},
  "semantic": {
    "result_meaning": "O runner instalou e executou CAMB em um shard isolado.",
    "why_it_matters": "Valida a principal dependência cosmológica compilada que vários testes podem exigir."
  }
}
json.dump(res, open(os.environ["RESULT_PATH"], "w"))
print(res["summary"])
