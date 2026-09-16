# Pantheon+ residual-feature audit

Reproducibility package for a covariance-aware reassessment of an apparent redshift-localized structure in the Pantheon+ Type Ia supernova Hubble residuals.

The repository separates the primary residual-feature analysis from a second set of light- and medium-cost robustness checks. Public-facing analysis names describe the scientific operation directly. Historical workspace identifiers are retained only in `provenance/source_mapping.json` so that the numerical record can be traced without carrying internal workflow terminology into the publication materials.

## Main analyses

- official likelihood reproduction
- covariance definition sensitivity
- covariance integrity checks
- calibrator versus non-calibrator partition
- low-redshift cut sensitivity
- blind residual-feature scan
- historical-window comparison
- global scan significance with Monte Carlo maxima
- template-family robustness
- cosmological-background profiling
- structure-preserving null models
- survey attribution and leave-one-survey-out diagnostics
- survey nuisance absorption
- localization stability
- injection and recovery
- survey-offset sensitivity
- DES-SN5YR external replication
- redshift-frame and peculiar-velocity context

## Additional robustness checks

- exact checkpoint against the official Pantheon+ likelihood
- duplicate-supernova collapse with covariance propagation
- supernova-level influence diagnostics
- Student-t outlier-sensitivity diagnostic
- survey-composition balancing diagnostic
- redshift-frame and sky-sector jackknife checks
- DES-SN5YR STAT+SYS versus STATONLY comparison

## Frozen reference result

The primary scan uses the Pantheon+ non-calibrator sample with `z_min = 0.0233`. The maximum scan statistic is not globally significant under the Gaussian max-statistic calibration, and the conclusion is further weakened under structure-preserving null models. The DES-SN5YR cross-check does not reproduce the same localized feature. The publication-facing conclusion is therefore limited to the absence of a robust, stably localized residual feature under the tested analysis family. No physical cause is inferred.

Numerical values are stored in:

- `results/reference_metrics.json`
- `results/robustness_metrics.json`

The original result hashes and the mapping to the research workspace are stored in `provenance/source_mapping.json`.

## Validation

```bash
python -m pip install -e .[test]
python scripts/validate_reference.py
pytest -q
```

`validate_reference.py` checks the frozen identifiers, required analyses, numerical configuration and publication-facing naming contract.

## Data provenance

The frozen source artifacts preserve the pinned Pantheon+ and DES-SN5YR input commits, file hashes and covariance semantics used by the numerical analysis. This publication snapshot records the workflow artifact identifiers and result hashes that identify those source records. Raw survey data are not redistributed here.

## Software provenance

The numerical implementation that produced the frozen outputs is preserved at the source repository and commit recorded in `provenance/source_mapping.json`. This publication package reorganizes the analysis for readability without changing the frozen numerical results.

## Citation

Citation metadata are provided in `CITATION.cff`.
