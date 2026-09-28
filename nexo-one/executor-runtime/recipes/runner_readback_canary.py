"""Receita congelada: replicação do canário do runner com identidade pública e read-back local."""
import hashlib
import json
import os

import numpy as np

params = json.load(open(os.environ["PARAMS_PATH"], encoding="utf-8"))
seed = int(params["seed"])
n = int(params["n"])
lim_mean = float(params.get("max_abs_mean", 0.01))
lim_sd = float(params.get("max_abs_sd_minus_1", 0.01))

x = np.random.default_rng(seed).standard_normal(n)
mean = float(x.mean())
sd = float(x.std(ddof=0))
numeric_ok = abs(mean) < lim_mean and abs(sd - 1.0) < lim_sd
identity = {
    "repository": os.getenv("GITHUB_REPOSITORY", ""),
    "commit_sha": os.getenv("GITHUB_SHA", ""),
    "run_id": os.getenv("GITHUB_RUN_ID", ""),
    "run_attempt": os.getenv("GITHUB_RUN_ATTEMPT", ""),
}
identity_ok = all(identity.values())
core = {"seed": seed, "n": n, "mean": mean, "sd": sd, "numeric_ok": numeric_ok,
        "identity_ok": identity_ok, **identity}
payload_sha256 = hashlib.sha256(
    json.dumps(core, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
).hexdigest()
ok = numeric_ok and identity_ok
payload = {
    "verdict": "PROMOTED" if ok else "REJECTED",
    "decision": "RUNNER_CHAIN_OK" if ok else "RUNNER_CHAIN_DIVERGED",
    "summary": f"Média={mean:.5f}, desvio={sd:.5f}, n={n}; identidade pública presente={identity_ok}.",
    "statistics": {**core, "payload_sha256": payload_sha256},
    "semantic": {
        "result_meaning": "A replicação mediu o sinal sintético congelado e registrou a identidade pública da execução.",
        "verdict_plain": "Critério congelado satisfeito" if ok else "Critério congelado violado",
        "confidence_plain": "alta",
    },
}
raw = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
with open(os.environ["RESULT_PATH"], "w", encoding="utf-8") as handle:
    handle.write(raw)
with open(os.environ["RESULT_PATH"], encoding="utf-8") as handle:
    if handle.read() != raw:
        raise RuntimeError("RESULT_PATH_READBACK_MISMATCH")
print(payload["summary"])
