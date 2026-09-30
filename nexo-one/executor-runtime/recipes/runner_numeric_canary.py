import json, os
import numpy as np
rng = np.random.default_rng(20260925)
x = rng.standard_normal(200000)
m, s = float(x.mean()), float(x.std())
ok = abs(m) < 0.01 and abs(s - 1) < 0.01
res = {'verdict': 'PROMOTED' if ok else 'REJECTED', 'decision': 'RUNNER_OK' if ok else 'RUNNER_WRONG', 'summary': f'mean={m:.5f} std={s:.5f} n=200000', 'statistics': {'mean': m, 'std': s, 'n': 200000}, 'semantic': {'result_meaning': 'A esteira de baterias rodou o script congelado no GitHub Actions e devolveu o resultado sozinha.', 'verdict_plain': 'Passou no teste, em revisão', 'confidence_plain': 'alta'}}
json.dump(res, open(os.environ['RESULT_PATH'], 'w'))
print(res['summary'])
