import json, os
from astropy.cosmology import FlatLambdaCDM
cosmo = FlatLambdaCDM(H0=67.4, Om0=0.315, Tcmb0=2.7255)
age = float(cosmo.age(1.0).value)
ok = 5.0 < age < 7.0
res = {
  "verdict": "PROMOTED" if ok else "REJECTED",
  "decision": "ASTROPY_DEP_OK" if ok else "ASTROPY_DEP_BAD",
  "summary": f"age_z1_gyr={age:.6f}",
  "statistics": {"age_z1_gyr": age},
  "semantic": {
    "result_meaning": "O runner instalou uma dependência científica extra por teste e executou uma operação cosmológica real.",
    "why_it_matters": "Prova que a bateria consegue materializar dependências fora do runtime base sem esconder falha de instalação."
  }
}
json.dump(res, open(os.environ["RESULT_PATH"], "w"))
print(res["summary"])
