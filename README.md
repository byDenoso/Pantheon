# PEER n=3 MCMC, Planck 2018 only (GitHub Actions)

Cobaya 3.6.2 + CAMB 1.6.6 MCMC for three models on the same Planck 2018 PR3 stack
(lowl TT + lowl EE + plik-lite TTTEEE + lensing, A_planck ~ N(1, 0.0025)):

| Model | Dark-energy sector | Free extra parameters |
|---|---|---|
| LCDM | none | none |
| P1 | early quintessence, V ∝ (1 - cos θ)^n with n = 3 | f_EDE(z_c); θ_i = 2.89155, z_c = 10^3.81 fixed |
| P3 | early quintessence, n = 3 | f_EDE(z_c), θ_i, log10 z_c |

Priors (uniform): H0 [50, 90], ω_c [0.05, 0.25], ω_b [0.015, 0.03], τ [0.01, 0.15], ln(10^10 A_s) [ln 5, ln 40],
n_s [0.8, 1.2], f_EDE [1e-4, 0.5], θ_i [0.1, 3.1], log10 z_c [3.0, 4.3]. Σm_ν = 0.06 eV, N_eff = 3.046.

Sampler: 4 MPI chains per model, adaptive proposal, stop at R-1 < 0.02 and R-1(95 % bounds) < 0.2, then BOBYQA
minimization (4 starts) for the best-fit χ².

How it runs: a push that changes `control/run.json` starts the `mcmc` workflow. A one-point likelihood smoke on the
runner must reproduce `data/smoke_expected.json` (computed on Windows with the same versions) to |Δ lnL| < 1e-3. Each
model leg samples for up to 5 h, caches its chains and re-dispatches itself until convergence (at most 40 chunks).
Results: `results/<model>.json` in the `chains-<model>` artifact and in the job summary.
