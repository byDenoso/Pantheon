AAS77733-R1 REPRODUCIBILITY PACKAGE
==================================

Purpose
-------
This package supports the revised manuscript
"A global test of an apparent mid-redshift residual feature in Pantheon+ Type Ia supernovae".
The scientific result is a globally calibrated non-detection / identifiability result for the historical z~0.4 candidate.

Canonical public inputs
-----------------------
Pantheon+SH0ES DataRelease:
  https://github.com/PantheonPlusSH0ES/DataRelease

Primary Pantheon+ files:
  Pantheon+_Data/4_DISTANCES_AND_COVAR/Pantheon+SH0ES.dat
  Pantheon+_Data/4_DISTANCES_AND_COVAR/Pantheon+SH0ES_STAT+SYS.cov

Covariance-semantics references in the same public release:
  Pantheon+_Data/4_DISTANCES_AND_COVAR/README
  Pantheon+_Data/5_COSMOLOGY/cosmosis_likelihoods/Pantheon+_only_cosmosis_likelihood.py

The public likelihood loads the released STAT+SYS covariance and returns the selected covariance matrix directly. The release README explicitly warns that the *_ERR_DIAG columns are for plotting/visual purposes and are not a substitute for the full covariance in cosmological fits. The operative covariance convention for this package is anchored to the executable public likelihood and its numerical reproduction.

Frozen numerical outputs
------------------------
  results/reference_metrics.json
  results/robustness_metrics.json

The publication-facing reference values include:
  official likelihood: Omega_m = 0.331576, chi2 = 1402.919 (1590-row public selection)
  fiducial sample: IS_CALIBRATOR = 0, zHD > 0.0233, N = 1365
  blind maximum: Delta chi2 = 2.224 at z_t = 0.03
  historical z_t = 0.36: Delta chi2 = 1.841
  global max-statistic p = 0.8378 from 10,000 covariance realizations
  survey-aware null probabilities: 0.9023--0.9960
  matched covariance sensitivity: Delta chi2 4.349 -> 1.376 after adding a second variance diagonal

Validation
----------
Runtime:
  Python >= 3.11

Core package validation:
  python -m pip install -e .[test]
  python scripts/validate_reference.py
  pytest -q

Test dependencies:
  pytest >= 8
  PyYAML >= 6

Figure-1 descriptive visualization
----------------------------------
The direct Hubble-residual panel added for the referee is a descriptive plot, not an inferential statistic. It uses the public Pantheon+ table, the fiducial non-calibrator zHD > 0.0233 selection, Omega_m = 0.327697, and the released diagonal plotting uncertainties only for the displayed bin means/error bars. All significance calculations in the manuscript continue to use the full covariance.

Reproduction command:
  python scripts/plot_hubble_residuals.py \
    --data /path/to/Pantheon+SH0ES.dat \
    --png figure1_hubble_residuals.png \
    --csv figure1_binned_residuals.csv

Figure dependencies:
  numpy >= 1.26
  pandas >= 2.0
  scipy >= 1.11
  matplotlib >= 3.8

A frozen copy of the plotted binned values is stored as:
  results/figure1_binned_residuals.csv

Provenance
----------
Primary AAS77733-R1 implementation commit:
  1e944e34f30d3d4948f60a6f045e5557d733c8b6

Additional sensitivity-integration commit:
  3aaec79fd6e6b43931a29d03afa4676c2163af6d

The repository publication snapshot reorganizes the outputs for readability without changing the frozen headline numerical results. Raw survey data are not redistributed.

Data Editor / DOI finalization
------------------------------
Before journal resubmission:
  1. Freeze the final package/release.
  2. Deposit that release in a DOI-issuing repository (Zenodo requested by the Data Editor).
  3. Submit the Zenodo record to the AAS Journals Community.
  4. Insert the minted DOI in the AASTeX manuscript using:
       \dataset[Reproducibility package]{10.5281/zenodo.REAL_DOI_HERE}
  5. Replace any DOI placeholder in the response package with the real DOI.

No DOI is fabricated in this package. Until the Zenodo record is minted, the DOI step remains intentionally pending.
