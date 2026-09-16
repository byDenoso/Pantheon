# Analysis methods

This package records the frozen outputs used by the manuscript and gives each analysis a conventional scientific name. The full numerical implementation is preserved at the source commit listed in `provenance/source_mapping.json`.

## Primary analysis

1. **Official likelihood reproduction**: reproduce the public Pantheon+ baseline under the released full covariance convention.
2. **Covariance definition sensitivity**: compare the released full covariance against the alternative with an additional diagonal uncertainty term.
3. **Covariance integrity**: verify symmetry, positive definiteness, row mapping and numerical conditioning.
4. **Calibrator partition check**: compare the all-SN, non-calibrator and calibrator subsets.
5. **Redshift-cut sensitivity**: repeat the scan over the declared low-redshift cuts.
6. **Residual-feature scan**: scan a hard step over blind redshift pivots using generalized least squares.
7. **Historical-window comparison**: retain the previously discussed mid-redshift window as provenance while the blind scan determines the global maximum.
8. **Global scan significance**: calibrate the maximum scan statistic with Monte Carlo maxima and a plus-one empirical p-value.
9. **Template-family robustness**: compare hard-step, smooth-step, Gaussian-bump and piecewise-linear alternatives.
10. **Cosmology-profile sensitivity**: profile the residual scan across acceptable background fits.
11. **Structure-preserving null models**: use redshift, within-survey and survey-by-redshift permutations.
12. **Survey attribution**: evaluate leave-one-survey-out behavior and score contributions.
13. **Survey nuisance absorption**: add survey intercepts and survey-specific redshift slopes.
14. **Localization stability**: quantify the distribution and entropy of recovered pivot locations.
15. **Injection and recovery**: measure detection power and localization under injected step amplitudes.
16. **Survey-offset sensitivity**: estimate how modest survey offsets reproduce the observed statistic.
17. **DES-SN5YR external replication**: apply the same blind scan to DES-SN5YR with its released covariance product.
18. **Redshift and peculiar-velocity context**: compare redshift frames and peculiar-velocity uncertainty cuts.

## Additional robustness checks

- exact numerical checkpoint against the public Pantheon+ likelihood;
- duplicate-supernova collapse with covariance propagation;
- supernova-level influence and delete-k diagnostics;
- Student-t outlier-sensitivity diagnostic;
- survey-composition balancing where support permits;
- sky-sector jackknife and redshift-frame sensitivity;
- DES-SN5YR STAT+SYS versus STATONLY comparison.

These checks constrain robustness and interpretation. They do not by themselves identify a physical cause for residual structure.
