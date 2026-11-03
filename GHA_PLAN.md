# Nested sampling on GitHub Actions: plan (prepared locally, nothing pushed or dispatched)

## What this repo does
`NEXO PEER nested, stack S1`: dynesty static nested sampling, Cobaya 3.6.2 + CAMB 1.6.6 (EarlyQuintessence n=3), models LCDM / P1 (PEER1P) / P3 (PEER3P), 2 seeds each, stack S1 = Planck PR3 plik-lite TTTEEE + lowl TT/EE + lensing + DESI DR2 BAO13 + CC15 + TRGB(Gaussian H0). Contract: `CONTRACT.md`.

## How a run works
1. Dispatch `nested` (Actions tab, or `gh workflow run nested.yml`) with defaults (S1, all models, all seeds).
2. `smoke` job: one-point lnL on Linux for LCDM/P1/P3 vs `data/smoke_expected.json` (values computed on the local Windows machine). Fails if |dTOTAL| >= 1e-3. The nested legs start only if it passes.
3. `nested` legs (6 in parallel, one per model x seed): restore latest checkpoint (actions/cache, key `ckpt-<job>-<run_id>-<attempt>`, restore-keys `ckpt-<job>-`), run `code/run_n2.py` with a 5.40 h wall budget counted from job start (job timeout 5.75 h), 4 CAMB workers with OMP_NUM_THREADS=1, dynesty checkpoint every 60 s plus a save after every 8 iterations. When the budget ends the process exits with code 3 and the leg saves the cache + artifact, then re-dispatches itself (`workflow_dispatch` with `GITHUB_TOKEN`, `permissions: actions: write`). When the evidence has converged (dlogz 0.05) it writes `results/S1_<model>_s<seed>.json` (+ samples) and uploads artifact `result-<job>` (90 days). Loop stops at `max_chunks` (default 90).
4. `concurrency: nested-<job>` with `cancel-in-progress: false`: two chunks of the same job never run together (the re-dispatched run waits as pending until the current job ends).
5. Contract guard: the checkpoint stores a hash of `build.py`, `n2like.py`, `n2core.py` and the data files; a chunk refuses to resume (exit 4) if they differ. Do not edit those files while a campaign runs.

## Equivalence evidence (what was checked locally, what is open)
- Local, same code (`gha/code`): `Problem('S1', model).loglike` at the smoke point reproduces `smoke_expected.json` to 1e-8 (LCDM -573.917329, P1 -623.258520, P3 -625.261848). With fde_zc=1e-6 the P3 value equals the LCDM value exactly (substitution rule).
- Chunked stop/resume was exercised on an analytic 3D Gaussian (lnZ exact -6.908): timeout at 8 iterations, resume, finish -> lnZ = -6.870 +/- 0.171; identical to the uninterrupted path.
- NOT yet run: the Linux runner. The `smoke` job is the equivalence proof (tolerance 1e-3). Cross-platform differences in CAMB are expected at 1e-6 relative or smaller, not guaranteed.

## S2 (ACT DR6 + SPT-3G D1)
Not in the nested matrix: ~80 sampled dimensions and 13-17 s per CAMB call at ACT accuracy (3 threads, measured locally). Optional `smoke_s2=true` runs a best-effort one-point S2 evaluation on Linux (CAMB default recombination; CosmoRec NOT built, the official ACT setup uses it) to report finiteness and seconds per call. The S2 builder (`code/build.py::make_info_s2`) combines the ACT example params/theory, the SPT D1 TnE cobaya template (internal priors cleared, official Gaussian nuisance priors added once) and the common cosmological priors; it has only been exercised locally as described in STATUS (see report).

## Estimated cost: chunks of ~5.2 h of sampling per leg (4 workers)
Inputs: measured single-thread CAMB+likelihood time per call, LCDM ~3 s and EDE ~5.4 s (local, unloaded machine; the GitHub vCPU speed is unmeasured, so a factor 1.0 is assumed). Calls per chunk: LCDM ~25k, P1/P3 ~14k.
Calls needed: NOT measured yet. The local jobs are still in the failed-prior plateau (ncall/iteration ~2.3). Extrapolation from the BAO-only runs (5D P3: 29 calls/iteration, niter = 8 x nlive) and a rough information estimate H ~ 18-22 nats for the CMB stacks:

| Leg | nlive | iterations | calls/iter | calls | chunks (5.2 h) | sequential wall |
|---|---|---|---|---|---|---|
| LCDM | 500 | ~12k | ~41 | ~5e5 | ~20 | ~4.5 days |
| P1 | 250 | ~6k | ~55 | ~3.4e5 | ~24 | ~5 days |
| P3 | 500 | ~13.5k | ~65 | ~8.8e5 | ~63 | ~14 days |

Uncertainty: factor ~2 either way (calls/iter and H are extrapolated). The 6 legs run in parallel, so wall time is set by P3 (about 2 weeks) and total runner time is ~6 legs x chunks x 5.75 h (free for public repos, not for private).
GitHub Actions does not make a single nested run faster than the local PC: one leg has 4 cores, the local jobs have 3 workers each.

## Legitimate cost reductions (NOT applied; each changes the contract, Dener decides)
1. Split each run into k independent sub-runs of nlive/k and merge them (`dynesty.utils.merge_runs`): same estimator as one run with nlive total, wall time / k (P3: k=4 x nlive 125 -> ~16 chunks, ~3.5 days). Needs a small merge script (not written) and nlive_i >= ~100 in 10D.
2. nlive 500 -> 250 for LCDM and P3: halves calls; per-run sigma(lnZ) goes ~0.26 -> ~0.37, so sigma(lnB) with 2 seeds ~0.37.
3. dlogz 0.05 -> 0.5: saves ~9% only.
4. One seed instead of two: halves runner time, not wall time; loses the seed-agreement check required by the contract.
5. Savage-Dickey check for P1/P3 vs LCDM (nested at fde=0) from an MCMC posterior: independent, much cheaper cross-check, not nested.

## Triggers and monitoring (branch `nested/peer-n2`)
- GitHub lists/dispatches `workflow_dispatch` workflows from the default branch. While `nested.yml` exists only on this branch the primary trigger is a push that changes `control/run.json` (stack/model/seedidx/skip_smoke/smoke_s2/ping/chunk). The smoke job also tests whether the dispatch API accepts this ref (`ping` run); if it does not (HTTP 404/422), the automatic chunk chain cannot continue by itself and each leg fails its last step with an explicit error: push a new `control/run.json` (change `nonce`, set `skip_smoke: true`) to start the next chunk. Checkpoints are cached per job, so a restart resumes where the previous chunk stopped.
- Progress without a token: `monitor_cmd.txt` (public Actions API: runs, jobs, and the `N2 ... progress` notice annotation written at the end of every chunk with it / ncall / logz). Inside a running chunk the log is not readable without a token; the checkpoint state appears at chunk end (<= 5.4 h).
