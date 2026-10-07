# CF4 fixed-shell joint GLS

Generic public recipe using the existing PARAMS_PATH / RESULT_PATH runner protocol. The single Python file is self-contained and needs NumPy.

Production admission fixes vector_quadratic: Q = A^T Sigma_A^-1 A, with each dipole's marginal 3x3 covariance from the joint GLS. The existing sqrt(Q) >= 3 threshold is retained, and the chi-square(3) p-value is diagnostic. sqrt(Q) is not a one-dimensional Gaussian sigma. The radial-amplitude helper is retained only for regression comparison; production parameters cannot select it.

The release uses the three SHA256-pinned public CDS files. Each data table must have exactly 38,053 unique, identical group keys and a one-to-one join. Fixed shells, pooled contrast, uncertainty propagation, twelve ICRS HEALPix Nside=1 omissions, FP/TF exclusions, and existing classification thresholds are unchanged.

A binding provides mode, test_id, prereg_hash, dipole_score, fit_scope, decision_ref and decision_sha256. The Writer verifies the canonical frozen TEST; the catalog checks technical shape, the fixed implementation, and input identities. Source references are provenance, not reviewer approval. No private conversation URL, operation receipt, author message, or TEST instance is stored in this catalog. Use a content-addressed source reference if results are retained in public CI artifacts.

The manifest and pure validator are embedded into the standalone recipe. Catalog admission rejects drift between their bytes. Missing/malformed configuration fails before download or fit, with exit 1 and no scientific verdict.

The synthetic_smoke mode exercises synthetic data only, returns scientific_result_eligible=false and verdict=null, and cannot be bound as a real TEST. The portable test file checks copied-file execution, immutable selection, drift, input mismatches, and both mathematical score helpers. Real scientific execution is separate from this smoke.
