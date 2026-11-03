"""External Cobaya likelihoods for the N2 campaign: DESI DR2 BAO13, CC15 (Moresco, full cov), TRGB H0 anchor."""
import hashlib
from pathlib import Path

import numpy as np
from cobaya.likelihood import Likelihood

HERE = Path(__file__).resolve().parent
DATA = HERE.parent / 'data'
V3 = DATA / 'cc15'
MEAN_HASH = '9ac154ab583ce759c0f7eef3c978c7c70a6ead2d18774caceadf1a350a640585'
COV_HASH = '252a143274c8a07c78694c119617d36594f6d7965d00319ca611c6ffb886e509'
C_KMS = 299792.458


class DESI13(Likelihood):
    """DESI DR2 13 BAO observables, full 13x13 covariance (same files and hashes as the E0/E1 pilots)."""

    def initialize(self):
        mean, cov = DATA / 'desi_gaussian_bao_ALL_GCcomb_mean.txt', DATA / 'desi_gaussian_bao_ALL_GCcomb_cov.txt'
        assert hashlib.sha256(mean.read_bytes()).hexdigest() == MEAN_HASH
        assert hashlib.sha256(cov.read_bytes()).hexdigest() == COV_HASH
        rows = [r.split() for r in mean.read_text().splitlines() if r.strip() and not r.startswith('#')]
        self.zs = np.array([float(r[0]) for r in rows])
        self.obs = np.array([float(r[1]) for r in rows])
        self.labels = [r[2] for r in rows]
        C = np.loadtxt(cov)
        self.L = np.linalg.cholesky(C)
        self.lognorm = -0.5 * (len(self.obs) * np.log(2 * np.pi) + 2 * np.log(np.diag(self.L)).sum())

    def get_requirements(self):
        zl = sorted(set(self.zs.tolist()))
        return {'angular_diameter_distance': {'z': zl}, 'Hubble': {'z': zl, 'units': 'km/s/Mpc'}, 'rdrag': None}

    def logp(self, **params):
        zl = sorted(set(self.zs.tolist()))
        da = np.atleast_1d(self.provider.get_angular_diameter_distance(zl))
        hz = np.atleast_1d(self.provider.get_Hubble(zl, units='km/s/Mpc'))
        rd = self.provider.get_param('rdrag')
        idx = {z: i for i, z in enumerate(zl)}
        vals = np.empty(len(self.zs))
        for k, (z, lab) in enumerate(zip(self.zs, self.labels)):
            dm = (1 + z) * da[idx[z]]
            dh = C_KMS / hz[idx[z]]
            if lab == 'DM_over_rs':
                vals[k] = dm / rd
            elif lab == 'DH_over_rs':
                vals[k] = dh / rd
            else:
                vals[k] = (z * dm ** 2 * dh) ** (1 / 3) / rd
        e = np.linalg.solve(self.L, vals - self.obs)
        return float(-0.5 * (e @ e) + self.lognorm)


class CC15(Likelihood):
    """15 Moresco cosmic chronometers with the reconstructed official-notebook covariance (V3 package, cc15/)."""

    def initialize(self):
        rows = np.genfromtxt(V3 / 'CC15_original_numeric.csv', delimiter=',', names=True)
        self.z = np.atleast_1d(rows['z'])
        self.h = np.atleast_1d(rows['H_kms_Mpc'])
        C = np.load(V3 / 'CC15_COV_MM20_VERIFIED.npy')
        assert C.shape == (15, 15)
        self.L = np.linalg.cholesky(C)
        self.lognorm = -0.5 * (15 * np.log(2 * np.pi) + 2 * np.log(np.diag(self.L)).sum())

    def get_requirements(self):
        return {'Hubble': {'z': self.z.tolist(), 'units': 'km/s/Mpc'}}

    def logp(self, **params):
        hz = np.atleast_1d(self.provider.get_Hubble(self.z.tolist(), units='km/s/Mpc'))
        e = np.linalg.solve(self.L, hz - self.h)
        return float(-0.5 * (e @ e) + self.lognorm)


class TRGBH0(Likelihood):
    """Gaussian TRGB H0 anchor, H0 = 69.8 +/- 1.7 km/s/Mpc (convention of the PEER1P+A_lens campaign, Drive doc 1L6ClJ5w...)."""
    mean = 69.8
    sigma = 1.7

    def get_requirements(self):
        return {'H0': None}

    def logp(self, **params):
        h0 = self.provider.get_param('H0')
        return float(-0.5 * ((h0 - self.mean) / self.sigma) ** 2 - np.log(self.sigma * np.sqrt(2 * np.pi)))
