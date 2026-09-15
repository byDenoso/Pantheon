# AAS77733-R1 Detection Battery Design

## Scope

Implement a reproducible, falsification-first battery for the Pantheon+ z~0.4 residual feature discussed in AAS77733 Review 1. The battery tests whether the feature exists in the public release, whether it survives the official covariance and survey structure, whether it is globally unusual after scanning, whether it can be recovered under controlled injections, and whether an analogous signal appears in an independent DES-SN5YR/Dovekie release.

The battery is an audit of an existing residual claim. It must not promote a new physical mechanism and must not describe standard statistical machinery as novel.

## Canonical scientific baseline

- Pantheon+ source: `PantheonPlusSH0ES/DataRelease` pinned to commit `c447f0fea703fcd0fff57de5000947b5ca81286b`.
- Data vector: `Pantheon+SH0ES.dat`.
- Primary covariance: `Pantheon+SH0ES_STAT+SYS.cov`, full 1701x1701 covariance.
- Redshift coordinate: `zHD`; use `zHEL` in the distance relation consistently with the released likelihood convention.
- Primary subset: `IS_CALIBRATOR == 0` and `zHD > 0.01`.
- Sensitivity subset: primary subset with `IDSURVEY != 1`.
- Primary scan: hard step on `0.25 <= z_t <= 0.60`, spacing 0.01.
- Historical values such as delta-chi2=7.91 at z_t=0.360 are provenance only. They are never a target that the code is allowed to force.

## Independent replication source

- DES-SN5YR source: `des-science/DES-SN5YR` pinned to commit `c9a4fcafc4cbd19bd750dee47fc76194a45c181f`.
- Hubble diagram: `4_DISTANCES_COVMAT/DES-Dovekie_HD.csv`.
- Precision matrix: `4_DISTANCES_COVMAT/STAT+SYS.npz`. The public DES README states this file is already an inverse covariance matrix and the Hubble-diagram file is the correctly ordered companion.

## Gate registry

| Gate | Name | Decisive question |
|---|---|---|
| G0 | Priority/state-of-art | Are all methods correctly scoped as established tools and the public inputs pinned? |
| G1 | Official-likelihood reproduction | Can the release convention and a smooth flat-LCDM baseline be reproduced without diagonal-covariance shortcuts? |
| G2 | Covariance adjudication | Does full covariance load, factorize, match row ordering, and materially define the inference? |
| G3 | Data-vector audit | Are masks, row counts, survey IDs, redshifts, and finite values internally consistent? |
| G4 | Calibrator branches | Does explicit calibrator inclusion/exclusion change the apparent feature or only the absolute-scale branch? |
| G5 | z_min sweep | Does the feature survive reasonable low-redshift cuts? |
| G6 | Feature existence | What hard-step maximum is present in the primary full-covariance scan? |
| G7 | Blind/global pivot scan | Is the preferred pivot localized rather than a broad scan maximum? |
| G8 | Look-elsewhere calibration | Is the maximum unusual under a scan-aware Gaussian null? |
| G9 | Comparator templates | Do hard-step and Gaussian-bump templates tell the same evidentiary story after scan calibration? |
| G10 | Cosmological profiling | Is the feature stable after profiling the smooth background parameter Omega_m and intercept? |
| G11 | Nuisance profiling | Does the split survive survey intercepts, redshift trend, and host-mass nuisance structure? |
| G12 | Structured nulls | Is the observed maximum unusual under redshift shuffle, intra-survey shuffle, and survey+redshift block permutation? |
| G13 | Survey attribution/absorption | Is the result robust to leave-one-survey-out and survey-nuisance absorption? |
| G14 | Pivot stability | Is pivot localization stable under covariance-respecting perturbations/bootstrap-like resampling? |
| G15 | Injection recovery | Does the pipeline recover injected signals with known pivot/amplitude at scientifically relevant strength? |
| G16 | Survey-structured false positives | Can modest survey/family offsets produce statistics at least as large as observed? |
| G17 | Independent DES-SN5YR replication | Does an analogous scan in Dovekie support the same redshift-localized feature? |
| G18 | Physical-context discipline | Is there independent external-tracer evidence in this implementation? If not, the physical-cause gate remains OPEN rather than being silently inferred. |
| G19 | Claim closure | What claim survives all preceding gates under a frozen deterministic policy? |

## Claim-closure policy

The terminal gate is absorbing for one run and is computed from persisted gate outputs, never from prose.

1. If G1-G3 fail integrity, return `BLOCKED_INTEGRITY`.
2. A physical-transition-supporting verdict is allowed only when G6 shows a nontrivial feature, G8 and G12 are globally unusual at p<0.05, G11 does not absorb it, G14 localizes it, G15 shows adequate recovery power, G17 independently replicates it, and G18 contains actual independent physical-context evidence.
3. If the feature exists but any of G8/G11/G12/G13/G14/G16 defeats the physical reading, return `RESIDUAL_DIAGNOSTIC_ONLY` with the defeating gates recorded.
4. If evidence is too weak or a required non-integrity gate is unavailable, return `INCONCLUSIVE_OPEN_GATES`.
5. A scientific/code failure is never converted into success by changing compute backend.

## Execution architecture

- GitHub Actions is the primary executor.
- The same Python runner lives under `science/aas77733/run_shard.py` so it is eligible for the already-governed Vercel Sandbox cold-standby executor.
- Every run is seeded deterministically and emits JSON receipts with source commit, input Git blob identities, runtime SHA-256 digests, gate outputs, validation status, and result hash.
- Network downloads are immutable-commit URLs. No floating `main` data URL is used at runtime.
- The runner supports `--contract-b64` for Vercel fallback and normal CLI flags for GitHub/manual execution.

## Numerical strategy

- Use NumPy/SciPy with Cholesky solves, never explicit dense inversion of the Pantheon covariance.
- Analytically profile linear nuisance terms in the GLS metric.
- Precompute projected scan templates so structured permutations and null ensembles reduce to matrix products rather than repeated dense solves.
- Gaussian look-elsewhere mocks are generated in scan-statistic space from the covariance of projected templates. This is exact for the fixed Gaussian linear null and avoids thousands of 1580-dimensional Cholesky draws.
- Default audit ensemble: 500 structured mocks to match the refined manuscript; `--mocks` may increase precision without changing the test definition.

## Validation

Tests must prove at minimum:
- exact G0-G19 registry with no duplicate/missing gate;
- synthetic hard-step recovery;
- nuisance absorption behavior;
- scan-aware p-value bounds and determinism;
- claim-closure fail-closed semantics;
- immutable public-data contracts and DES inverse-covariance semantics;
- Vercel-compatible contract parsing and structured receipt output.
