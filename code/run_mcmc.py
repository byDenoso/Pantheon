#!/usr/bin/env python3
"""Resumable Cobaya MCMC chunk (launch under mpirun, one chain per MPI rank).
python code/run_mcmc.py MODEL            -> MCMC into chains/MODEL/MODEL (resume=True; stops itself at R-1 < 0.02)
python code/run_mcmc.py MODEL --minimize -> BOBYQA from the chain into chains/MODEL/MODEL (.minimum)"""
import argparse, sys
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from build import make_info, MCMC

ap = argparse.ArgumentParser()
ap.add_argument('model')
ap.add_argument('--minimize', action='store_true')
a = ap.parse_args()
out = str(HERE.parent / 'chains' / a.model / a.model)
from cobaya.run import run
if a.minimize:
    run(make_info(a.model, {'minimize': {'method': 'bobyqa', 'best_of': 4}}, out), minimize=True, force=True)
else:
    run(make_info(a.model, MCMC, out), resume=True)
