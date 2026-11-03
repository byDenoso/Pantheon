# N2 nested-sampling contract (written 03/11/2026, before any logZ was seen)

Requested by Dener (03/11/2026): three nested samplings with real CMB likelihoods.
Interpretation adopted (flag if wrong):
- J1 = pNGB (matrix model PEER_N3_FULL_3P: fede, theta_i, log10 zc free) on stack S1.
- J2 = pNGB 3P on stack S2.
- J3 = PEER1P (fede free; zc = 10^3.81, theta_i = 2.89155 fixed) on the SAME stack as J1 (S1). J3@S2 is the alternative reading.
- Reference LCDM on the same stack, same likelihood, same shared priors, for each lnB.

## Stacks
- S1 = Planck 2018 PR3 plik-lite TTTEEE (cobaya native, A_planck free N(1,0.0025)) + lowl TT + lowl EE + Planck 2018 lensing (native) + DESI DR2 BAO 13x13 + CC15 + TRGB.
- S2 = ACT DR6 MFLike (full) + SPT-3G D1 TnE (full multifrequency) + DESI DR2 BAO 13x13 + CC15 + TRGB. tau only with the common prior (V2 rule).

## Likelihood bindings (what each name means here)
- DESI DR2 BAO13: same files and SHA256 as the E0/E1 pilots (mean 9ac154ab..., cov 252a143274...), full 13x13 covariance, Gaussian normalised.
- CC: the 15 Moresco chronometers with the full systematic covariance reconstructed from the official CCcovariance notebook (public notebook table, `data/cc15/`, det 4.5598e33, SPD). The 32-point private catalogue has no full systematic covariance and is NOT used. Deviation from the request ("CC"): CC15, not CC32.
- TRGB: Gaussian H0 anchor, H0 = 69.8 +/- 1.7 km/s/Mpc (the convention of the earlier PEER1P+A_lens campaign, where SH0ES/TRGB entered as independent Gaussian updates). The matrix's `TRGB_anchored_likelihood` (ladder with NGC4258 overlap audit) is still BLOCKED_INPUT in the campaign matrix; this Gaussian is a stand-in and the results are NOT the anchored-ladder TRGB.
- No SH0ES, megamaser, GW or Pantheon term in either stack.

## Priors (matrix V2, NEXO-PROSPECTIVE-COMMON-20261031), all uniform unless noted
H0 [50,90]; omch2 [0.05,0.25]; ombh2 [0.015,0.03]; tau [0.01,0.15]; As [5e-10,4e-9] (sampled as ln(1e10 As) in [ln5, ln40]); ns [0.8,1.2]; A_planck N(1,0.0025) (S1 only);
fde_zc [0,0.5]; theta_i [0.1,3.1]; log10 zc [3.0,4.3] (3P). 1P: fde_zc free, theta_i=2.89155, zc=10^3.81.
Theory: CAMB 1.6.6 EarlyQuintessence, n=3, use_zc=True (fde_zc, zc, theta_i); mnu=0.06, nnu=3.046; Y_He from CAMB BBN default.
Numerical rule: CAMB fails for fde_zc below ~1e-5..1e-7 ("NO PEAK"). For fde_zc < 1e-4 the LCDM likelihood is evaluated instead. Size of the substitution: effect on lnL scales ~fde^2 (about -45 for fde=0.02 at the test point), so below 1e-4 it is < ~2e-3. Probability mass affected: 2e-4 of the fde prior. No other failure region was found for fde >= 1e-4 on a 5x4 (theta_i, zc) grid.

## Sampler
dynesty 3.1.0 (contract names 2.1.5; version differs), static, rslice, nlive 500 (LCDM, 3P) / 250 (1P), dlogz 0.05, checkpoint every 300 s, resumable, pool of CAMB workers (OMP=1). Seeds from the matrix: LCDM_A_TRGB [660365113,1651703512]; A1 [2612844943,225218404]; A2 [1289219989,1774698833]. Max 4 concurrent jobs.
Environment deviation: Python 3.12.10 (contract 3.12.14), Cobaya 3.6.2, CAMB 1.6.6, candl-like 2.0.3.

## Reporting
lnB = logZ(model) - logZ(LCDM, same stack) with sqrt(sum of squares) error; two seeds each; best-fit chi2 difference; no summing of correlated Bayes factors. Failure or seed disagreement (>3 combined sigma) is reported as such.

## Hypothesis
Relative to flat LCDM with identical data and shared priors, early quintessence n=3 (1 or 3 free parameters) changes the Bayesian evidence of S1/S2. No direction is assumed.
