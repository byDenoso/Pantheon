"""T-H0LCDM26-001-R2-LINEAR-CV, linear LCDM velocity-covariance evaluator.

Scientific inputs are four immutable, hash-pinned original artifacts. The
implementation preserves the specified CID grouping, the full STAT+SYS
measurement covariance, the Gaussian isotropic velocity field, the primary
analytic tail and the PCG64DXSM 20,000-draw check. No source substitution,
post-result tuning or synthetic-data production mode is available here.

Operational review point: CID repeats are combined by inverse-covariance BLUE
inside each CID, retaining cross-CID covariance. This prescription and the
standard low-z velocity -> distance-modulus Jacobian must be reconciled against
the existing frozen linear-H0 estimator BEFORE emitting RECIPE_BIND.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
from pathlib import Path
from typing import Any

import numpy as np
from scipy.integrate import quad, simpson
from scipy.special import log_ndtr, spherical_jn

TEST_ID = 'T-H0LCDM26-001-R2-LINEAR-CV'
H0 = 67.4
C = 299792.458
H = H0 / 100.0
SEED = 2601001
N_MOCKS = 20000
TARGET = 6.09
EXPECTED_SHA = {
    'pantheon_table': '1cb0fc379ef066afdc2ffd1857681cc478024570d8a3eba284fb645775198cf8',
    'pantheon_cov': 'abf806d966485e64afdb359c87bffc0ecc00d05eff0a31ced66f247385df0fdc',
    'plin': '8c91ca36071b5bfdb2dea04e1ac2c3c5d805eb99dc428dbd73340e0b9e5e8c2d',
    'manifest': '38c8befbabd6950cb6f252d4ad8c941903e281d94d0021885582a4101f14c1a9',
}


class ScientificInputError(ValueError):
    pass


def require(ok: bool, message: str) -> None:
    if not ok:
        raise ScientificInputError(message)


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda: f.read(1 << 20), b''):
            h.update(block)
    return h.hexdigest()


def verified_inputs(paths: dict[str, str]) -> dict[str, Path]:
    require(set(paths) == set(EXPECTED_SHA), 'four frozen inputs required; no fallbacks')
    out = {}
    for role, expected in EXPECTED_SHA.items():
        path = Path(paths[role])
        require(path.is_file(), f'{role}: original local file missing')
        require(sha256(path) == expected, f'{role}: source SHA256 mismatch')
        out[role] = path
    manifest = json.loads(out['manifest'].read_text(encoding='utf-8'))
    require(manifest.get('test_id') == TEST_ID, 'CAMB manifest TEST identity mismatch')
    require(manifest.get('output', {}).get('sha256') == EXPECTED_SHA['plin'], 'CAMB manifest spectrum mismatch')
    spec = manifest.get('spectrum') or {}
    require(spec.get('npoints') == 512 and spec.get('nonlinear') == 'none' and not spec.get('halofit'),
            'CAMB spectrum grid/mode not frozen')
    cosmo = manifest.get('cosmology') or {}
    for key, value in {'H0': H0, 'ombh2': 0.02237, 'omch2': 0.12,
                       'ns': 0.9649, 'As': 2.1e-9, 'sum_mnu_eV': 0.06}.items():
        require(math.isclose(float(cosmo.get(key, float('nan'))), value, rel_tol=1e-11),
                f'CAMB cosmology mismatch: {key}')
    return out


def load_measurement(table_path: Path, cov_path: Path) -> tuple[np.ndarray, np.ndarray]:
    table = np.genfromtxt(table_path, names=True, dtype=None, encoding='utf-8')
    require(table.ndim == 1 and len(table) > 0, 'Pantheon table invalid')
    names = set(table.dtype.names or [])
    require({'CID', 'USED_IN_SH0ES_HF', 'RA', 'DEC', 'zHD'} <= names,
            'Pantheon required columns absent')
    raw = np.loadtxt(cov_path, dtype=np.float64).reshape(-1)
    count = len(table)
    if raw.size == 1 + count * count:
        require(raw[0] == count, 'Pantheon covariance leading dimension mismatch')
        raw = raw[1:]
    require(raw.size == count * count, f'Pantheon full covariance expected {count}x{count}')
    cov = raw.reshape(count, count)
    require(np.isfinite(cov).all() and np.allclose(cov, cov.T, atol=1e-9, rtol=0),
            'Pantheon covariance non-finite/asymmetric')
    require(np.all(np.diag(cov) > 0), 'Pantheon variance invalid')
    return table, cov


def sky_vectors(ra: np.ndarray, dec: np.ndarray) -> np.ndarray:
    ra, dec = np.deg2rad(ra), np.deg2rad(dec)
    require(np.isfinite(ra).all() and np.isfinite(dec).all(), 'coordinates non-finite')
    require(np.all(np.abs(dec) <= math.pi / 2), 'declination out of range')
    return np.column_stack((np.cos(dec) * np.cos(ra), np.cos(dec) * np.sin(ra), np.sin(dec)))


def collapse_cids(table: np.ndarray, full_cov: np.ndarray, z_min: float) -> dict[str, Any]:
    """Within-CID BLUE, with cross-CID covariance W C W^T retained exactly."""
    z = np.asarray(table['zHD'], float)
    selection = (np.asarray(table['USED_IN_SH0ES_HF'], float) == 1) & (z >= z_min) & (z < 0.15)
    ix = np.flatnonzero(selection)
    require(len(ix) > 0, 'no Hubble-flow rows under frozen selection')
    cid = np.asarray(table['CID'][ix], str)
    original_ids = list(dict.fromkeys(cid))
    Csel = full_cov[np.ix_(ix, ix)]
    directions = sky_vectors(np.asarray(table['RA'][ix], float), np.asarray(table['DEC'][ix], float))
    W = np.zeros((len(original_ids), len(ix)), dtype=float)
    for j, name in enumerate(original_ids):
        group = np.flatnonzero(cid == name)
        c = Csel[np.ix_(group, group)]
        ones = np.ones(len(group))
        try:
            weight = np.linalg.solve(c, ones)
        except np.linalg.LinAlgError as exc:
            raise ScientificInputError(f'CID {name}: non-invertible within-CID covariance') from exc
        require(np.isfinite(weight).all() and abs(float(weight.sum())) > 1e-10,
                f'CID {name}: invalid BLUE weights')
        W[j, group] = weight / weight.sum()
    Ccid = W @ Csel @ W.T
    require(np.isfinite(Ccid).all(), 'collapsed covariance non-finite')
    try:
        np.linalg.cholesky((Ccid + Ccid.T) / 2)
    except np.linalg.LinAlgError as exc:
        raise ScientificInputError('collapsed measurement covariance is not positive definite') from exc
    n = W @ directions
    require(np.all(np.linalg.norm(n, axis=1) > 0), 'invalid CID mean directions')
    n = n / np.linalg.norm(n, axis=1)[:, None]
    return {
        'z': W @ z[ix], 'n': n, 'measurement_cov': Ccid,
        'selected_rows': int(ix.size), 'cids': original_ids,
        'operator': W, 'selected_source_indices': ix,
    }


def flat_lcdm_background(omega_m: float, z: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    require(0 < omega_m < 1 and np.all(z > 0), 'invalid cosmology/redshift')
    E = np.sqrt(omega_m * (1 + z)**3 + 1 - omega_m)
    chi = np.array([C / H0 * quad(
        lambda t: 1 / math.sqrt(omega_m * (1 + t)**3 + 1 - omega_m),
        0.0, float(zz), epsabs=2e-10)[0] for zz in z])
    return E, chi


def flat_lcdm_growth(omega_m: float) -> float:
    """Exact smooth-matter+Lambda growth-rate at a=1 from integral solution."""
    def E(a: float) -> float:
        return math.sqrt(omega_m / a**3 + 1 - omega_m)
    def integral(a: float) -> float:
        return quad(lambda aa: 1 / (aa**3 * E(aa)**3), 1e-9, a, epsabs=1e-10)[0]
    a = 1.0
    I = integral(a)
    require(I > 0, 'growth integral invalid')
    # d ln[H(a)*I(a)] / d ln a at a=1
    growth = -1.5 * omega_m + 1 / I
    require(0 < growth < 1.5, 'growth factor outside physical range')
    return float(growth)


def velocity_covariance(positions_hmpc: np.ndarray, unit_vectors: np.ndarray,
                        k_hmpc: np.ndarray, power_hmpc3: np.ndarray, growth_rate: float,
                        block: int = 24) -> np.ndarray:
    """<v_ri v_rj> from isotropic linear P(k) with j0/j2 tensor kernel.

    k in h/Mpc, P in (Mpc/h)^3, positions in Mpc/h. Factor (100 f)^2
    converts the gradient of the linear potential to (km/s)^2 at z=0.
    """
    pos = np.asarray(positions_hmpc, float)
    unit = np.asarray(unit_vectors, float)
    k = np.asarray(k_hmpc, float)
    power = np.asarray(power_hmpc3, float)
    require(pos.ndim == 2 and pos.shape[1] == 3 and unit.shape == pos.shape,
            'velocity covariance position shape invalid')
    require(k.ndim == 1 and len(k) >= 10 and np.all(np.diff(k) > 0)
            and np.all(power >= 0) and np.isfinite(power).all(), 'P(k) grid invalid')
    require(growth_rate > 0, 'growth rate invalid')
    n = len(unit)
    covariance = np.empty((n, n), float)
    coefficient = (100.0 * growth_rate)**2 / (2 * math.pi**2)
    for start in range(0, n, block):
        end = min(start + block, n)
        dr = pos[start:end, None, :] - pos[None, :, :]
        radius = np.linalg.norm(dr, axis=2)
        dhat = np.divide(dr, radius[:, :, None], out=np.zeros_like(dr), where=radius[:, :, None] > 0)
        dotnn = unit[start:end] @ unit.T
        a = np.einsum('bji,bi->bj', dhat, unit[start:end])
        b = np.einsum('bji,ji->bj', dhat, unit)
        jarg = radius[:, :, None] * k[None, None, :]
        j0 = spherical_jn(0, jarg)
        j2 = spherical_jn(2, jarg)
        kernel = (j0 + j2) * (dotnn[:, :, None] / 3) - j2 * (a * b)[:, :, None]
        covariance[start:end] = coefficient * simpson(power[None, None, :] * kernel,
                                                       x=k, axis=2)
    covariance = (covariance + covariance.T) / 2
    require(np.isfinite(covariance).all(), 'velocity covariance non-finite')
    eig = np.linalg.eigvalsh(covariance)
    require(eig[0] > -max(np.max(np.diag(covariance)), 1.0) * 1e-7,
            'linear velocity covariance violates PSD condition')
    return covariance


def infer_sigma_and_tail(cov_meas: np.ndarray, cov_vel: np.ndarray, z: np.ndarray,
                         omega_m: float, *, seed: int = SEED, n_mock: int = N_MOCKS) -> dict[str, Any]:
    require(n_mock == N_MOCKS and seed == SEED, 'Monte Carlo seed/count frozen')
    n = len(z)
    require(cov_meas.shape == cov_vel.shape == (n, n), 'covariance dimensions mismatch')
    E, chi = flat_lcdm_background(omega_m, z)
    # Standard first-order Doppler impact on d_L(z) at fixed observed z.
    jacobian_mu = (5 / math.log(10)) / C * (1 - (1 + z) * C / (H0 * E * chi))
    one = np.ones(n)
    w = np.linalg.solve(cov_meas, one)
    require(float(w.sum()) > 0, 'invalid intercept GLS denominator')
    w /= w.sum()
    response = -H0 * (math.log(10) / 5) * w * jacobian_mu
    sigma2 = float(response @ cov_vel @ response)
    require(sigma2 > 0 and math.isfinite(sigma2), 'H0 variance invalid')
    sigma = math.sqrt(sigma2)
    # Gaussian-field Monte Carlo in the exact eigenbasis; no retuning or
    # re-estimation of the analytic statistic based on the mock outcomes.
    eigenvalues, U = np.linalg.eigh(cov_vel)
    require(eigenvalues[0] >= -max(eigenvalues[-1], 1.0) * 1e-7,
            'velocity covariance is not semidefinite')
    signal_coeff = (U.T @ response) * np.sqrt(np.maximum(eigenvalues, 0))
    rng = np.random.Generator(np.random.PCG64DXSM(seed))
    mocks = signal_coeff @ rng.standard_normal((n, n_mock))
    sigma_mc = float(np.std(mocks, ddof=1))
    discrepancy = abs(sigma_mc / sigma - 1)
    lp = float(log_ndtr(-TARGET / sigma))
    return {'sigma_cv_km_s_Mpc': sigma, 'sigma_mc_km_s_Mpc': sigma_mc,
            'mc_relative_discrepancy': discrepancy, 'P_deltaH0_ge_6p09': math.exp(lp),
            'log_probability_upper_tail': lp, 'n_mc': n_mock, 'seed': seed,
            'estimator_weights_sum': float(w.sum())}


def analyze(paths: dict[str, str]) -> dict[str, Any]:
    source = verified_inputs(paths)
    table, covariance = load_measurement(source['pantheon_table'], source['pantheon_cov'])
    spectrum = np.loadtxt(source['plin'])
    require(spectrum.shape == (512, 2), 'CAMB linear spectrum grid invalid')
    k, power = spectrum.T
    require(abs(k[0] - 1e-4) < 1e-12 and abs(k[-1] - 1.0) < 1e-10,
            'CAMB k grid deviates from frozen range')
    omega_m = (0.02237 + 0.1200 + 0.06 / 93.14) / H**2
    growth = flat_lcdm_growth(omega_m)
    cuts: dict[str, Any] = {}
    for zmin in (0.023, 0.01):
        selection = collapse_cids(table, covariance, zmin)
        z = selection['z']
        E, chi = flat_lcdm_background(omega_m, z)
        position = selection['n'] * (H * chi[:, None])
        cov_vel = velocity_covariance(position, selection['n'], k, power, growth)
        result = infer_sigma_and_tail(selection['measurement_cov'], cov_vel, z, omega_m)
        result.update(n_selected_rows=selection['selected_rows'], n_unique_cid=len(selection['cids']),
                      min_zHD=float(z.min()), max_zHD=float(z.max()))
        # Selection identity for H2 identifiability, not a second independent sample.
        result['selected_source_indices_sha256'] = hashlib.sha256(
            selection['selected_source_indices'].astype('<i8').tobytes()).hexdigest()
        cuts[str(zmin)] = result
    primary, secondary = cuts['0.023'], cuts['0.01']
    indistinguishable = (primary['selected_source_indices_sha256'] == secondary['selected_source_indices_sha256'])
    mc_pass = primary['mc_relative_discrepancy'] <= 0.10
    p1, p2 = primary['P_deltaH0_ge_6p09'], secondary['P_deltaH0_ge_6p09']
    mc_all_pass = mc_pass and secondary['mc_relative_discrepancy'] <= 0.10
    if not mc_all_pass:
        decision, verdict = 'MONTE_CARLO_SANITY_MISMATCH', 'INCONCLUSIVE'
    elif p1 >= 0.0027:
        decision, verdict = 'PROMOTED_LINEAR_COSMIC_VARIANCE', 'PROMOTED'
    elif p1 < 2.87e-7 and p2 < 2.87e-7:
        decision, verdict = 'REJECTED_FULL_LINEAR_CV_EXPLANATION', 'REJECTED'
    elif not indistinguishable and p1 < 0.0027 and p2 >= 0.0027:
        decision, verdict = 'CLASSIFY_H2_LOW_Z_ONLY', 'INCONCLUSIVE'
    else:
        decision, verdict = 'INCONCLUSIVE', 'INCONCLUSIVE'
    return {'schema':'NEXO_H0LCDM26_001_R2_LINEAR_CV_V1', 'test_id':TEST_ID,
            'scientific_result_eligible': bool(mc_all_pass), 'verdict': verdict,
            'decision':decision,
            'claim_boundary':'Only linear peculiar-velocity cosmic variance in the frozen Pantheon+SH0ES Hubble-flow selection; not the total H0 tension.',
            'statistics': {'primary': primary, 'secondary': secondary,
                           'secondary_cut_adds_rows': not indistinguishable,
                           'H2_identifiability':'UNIDENTIFIABLE_ON_FROZEN_SELECTION' if indistinguishable else 'DISTINCT_CUTS',
                           'omega_m': omega_m,'growth_rate_z0':growth},
            'inputs_sha256':{key:sha256(path) for key,path in source.items()},
            'cid_reduction':'WITHIN_CID_FULL_COV_BLUE_NO_BETWEEN_CID_COV_DISCARD',
            'velocity_model':'LINEAR_LCDM_ISOTROPIC_Pk_J0_J2_TENSOR',
            'measurement_estimator':'FULL_STAT_SYS_GLS_INTERCEPT',
            'sanity_check':'20000_PCG64DXSM_GAUSSIAN_LINEAR_FIELD',
           }


def main() -> int:
    import sys
    if 'PARAMS_PATH' not in os.environ or 'RESULT_PATH' not in os.environ:
        raise SystemExit('PARAMS_PATH and RESULT_PATH required')
    params = json.loads(Path(os.environ['PARAMS_PATH']).read_text(encoding='utf-8'))
    expected = {'test_id', 'prereg_hash', 'inputs'}
    require(set(params) == expected, 'no implicit scientific parameters: test_id/prereg_hash/inputs only')
    require(params['test_id'] == TEST_ID, 'unexpected TEST')
    require(params['prereg_hash'] ==
            'sha256:0aa48ebcbb5f9c1aeaf8f90c3f9e9655836328bee3783e1c1a06ba5911439fa9',
            'frozen TEST preregistration identity changed')
    try:
        result = analyze(params['inputs'])
    except (ScientificInputError, OSError, ValueError, np.linalg.LinAlgError) as exc:
        Path(os.environ['RESULT_PATH']).write_text(json.dumps({
            'status': 'BLOCKED_INPUT', 'scientific_result_eligible': False,
            'reason_code': 'FROZEN_INPUT_OR_RECIPE_PREFLIGHT_FAILED',
            'detail': str(exc), 'test_id':TEST_ID,
        },indent=2)+'\n',encoding='utf-8')
        return 1
    Path(os.environ['RESULT_PATH']).write_text(json.dumps(result,indent=2,sort_keys=True)+'\n',encoding='utf-8')
    print(json.dumps({'status':'DONE', 'test_id':TEST_ID,'verdict':result['verdict']}))
    return 0


if __name__=='__main__':
    raise SystemExit(main())
