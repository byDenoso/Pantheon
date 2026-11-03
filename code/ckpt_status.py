"""Print iteration / ncall / logz of every checkpoint under ckpt/ (works on a copy, safe while a job is running)."""
import glob, os, shutil, sys, time
from pathlib import Path
import numpy as np, dynesty
sys.path.insert(0, str(Path(__file__).resolve().parent))
import n2core  # noqa: F401  (classes needed for unpickling)
root = Path(__file__).resolve().parent.parent
for f in sorted(glob.glob(str(root / 'ckpt' / '*.save'))):
    tmp = f + '.copy'
    shutil.copy(f, tmp)
    try:
        s = dynesty.NestedSampler.restore(tmp)
        r = s.results
        print(os.path.basename(f), 'it', s.it, 'ncall', int(np.sum(s.ncall)), 'logz', round(float(r.logz[-1]), 2), 'age_min', round((time.time() - os.path.getmtime(f)) / 60, 1))
    except Exception as e:
        print(f, 'ERR', repr(e)[:160])
    os.remove(tmp)
