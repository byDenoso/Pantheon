"""Cobaya info for the PEER n=3 MCMC (Planck 2018 only, the stack of MN-26-1736-L).
Stack P18: Planck 2018 PR3 lowl TT + lowl EE + plik-lite TTTEEE (native) + lensing (native), A_planck ~ N(1, 0.0025).
Models: LCDM; P1 = early quintessence n=3, fde_zc free, theta_i = 2.89155 and zc = 10^3.81 fixed;
P3 = early quintessence n=3, fde_zc, theta_i, log10 zc free. Priors: matrix V2 (same as the N2 nested campaign),
except fde_zc lower edge 1e-4 (CAMB fails near fde = 0; the excluded prior mass is 2e-4 of the range).
Paths are relative to the repository root."""
import copy
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PKG = str(ROOT / 'data' / 'packages')

COMMON = {
    'H0': {'prior': {'min': 50.0, 'max': 90.0}, 'ref': {'dist': 'norm', 'loc': 67.5, 'scale': 0.5}, 'proposal': 0.6,
           'latex': 'H_0'},
    'omch2': {'prior': {'min': 0.05, 'max': 0.25}, 'ref': {'dist': 'norm', 'loc': 0.12, 'scale': 0.001},
              'proposal': 0.0012, 'latex': r'\Omega_c h^2'},
    'ombh2': {'prior': {'min': 0.015, 'max': 0.03}, 'ref': {'dist': 'norm', 'loc': 0.02237, 'scale': 0.00015},
              'proposal': 0.00015, 'latex': r'\Omega_b h^2'},
    'tau': {'prior': {'min': 0.01, 'max': 0.15}, 'ref': {'dist': 'norm', 'loc': 0.055, 'scale': 0.006},
            'proposal': 0.007, 'latex': r'\tau'},
    'logA': {'prior': {'min': 1.6094379124341003, 'max': 3.6888794541139363},
             'ref': {'dist': 'norm', 'loc': 3.044, 'scale': 0.01}, 'proposal': 0.014, 'drop': True,
             'latex': r'\ln(10^{10}A_s)'},
    'As': {'value': 'lambda logA: 1e-10*np.exp(logA)', 'latex': 'A_s'},
    'ns': {'prior': {'min': 0.8, 'max': 1.2}, 'ref': {'dist': 'norm', 'loc': 0.965, 'scale': 0.004},
           'proposal': 0.004, 'latex': 'n_s'},
    'A_planck': {'prior': {'dist': 'norm', 'loc': 1.0, 'scale': 0.0025},
                 'ref': {'dist': 'norm', 'loc': 1.0, 'scale': 0.002}, 'proposal': 0.0025, 'latex': 'A_{Planck}'},
    'omegam': {'latex': r'\Omega_m'},
    'sigma8': {'latex': r'\sigma_8'},
    'S8': {'derived': 'lambda sigma8, omegam: sigma8*np.sqrt(omegam/0.3)', 'latex': 'S_8'},
}
FDE = {'prior': {'min': 1e-4, 'max': 0.5}, 'ref': {'dist': 'uniform', 'min': 0.005, 'max': 0.05}, 'proposal': 0.02,
       'latex': r'f_{\rm EDE}(z_c)'}
THETA = {'prior': {'min': 0.1, 'max': 3.1}, 'ref': {'dist': 'uniform', 'min': 1.5, 'max': 3.0}, 'proposal': 0.4,
         'latex': r'\theta_i'}
LOGZC = {'prior': {'min': 3.0, 'max': 4.3}, 'ref': {'dist': 'uniform', 'min': 3.4, 'max': 3.9}, 'proposal': 0.15,
         'drop': True, 'latex': r'\log_{10} z_c'}

CAMB_ARGS = {'lens_potential_accuracy': 1, 'mnu': 0.06, 'nnu': 3.046, 'num_massive_neutrinos': 1}
LIKES = ('planck_2018_lowl.TT', 'planck_2018_lowl.EE', 'planck_2018_highl_plik.TTTEEE_lite_native',
         'planck_2018_lensing.native')
MODELS = ('LCDM', 'P1', 'P3')


def make_info(model, sampler=None, output=None):
    assert model in MODELS, model
    params = {k: copy.deepcopy(v) for k, v in COMMON.items()}
    camb_args = dict(CAMB_ARGS)
    if model in ('P1', 'P3'):
        camb_args.update(dark_energy_model='EarlyQuintessence', n=3, use_zc=True)
        params['fde_zc'] = copy.deepcopy(FDE)
        if model == 'P3':
            params['theta_i'] = copy.deepcopy(THETA)
            params['log10zc'] = copy.deepcopy(LOGZC)
            params['zc'] = {'value': 'lambda log10zc: 10**log10zc', 'latex': 'z_c'}
        else:
            params['theta_i'] = 2.89155
            params['zc'] = 10 ** 3.81
    info = {'packages_path': PKG, 'likelihood': {k: None for k in LIKES}, 'params': params,
            'theory': {'camb': {'extra_args': camb_args, 'stop_at_error': False}},
            'sampler': sampler or {'evaluate': None}}
    if output:
        info['output'] = output
    return info


MCMC = {'mcmc': {'Rminus1_stop': 0.02, 'Rminus1_cl_stop': 0.2, 'Rminus1_cl_level': 0.95, 'learn_proposal': True,
                 'learn_proposal_Rminus1_max': 30.0, 'learn_proposal_Rminus1_max_early': 50.0,
                 'oversample_power': 0.4, 'max_tries': '1000d', 'output_every': '60s', 'burn_in': 0,
                 'measure_speeds': True}}
