"""Cobaya info builders for N2 (stacks S1/S2, models LCDM / P1 / P3). Priors follow NEXO_PEER_NESTED_MATRIX_V2_20261031.
Portable: all paths are relative to the repository root (this file lives in <root>/code)."""
import copy
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))
PKG = str(ROOT / 'data' / 'packages')
SPT_DIR = ROOT / 'data' / 'spt_candl_data' / 'spt_candl_data' / 'SPT3G_D1_TnE_v0'
SPT_INDEX = (SPT_DIR / 'SPT3G_D1_TnE_index.yaml').as_posix()
ACT_EXAMPLE = ROOT / 'data' / 'act_dr6_mflike' / 'examples' / 'act_dr6_example.yml'
SPT_COBAYA = ROOT / 'data' / 'spt_candl_data' / 'cobaya' / 'SPT3G_D1_TnE' / 'cobaya_ttteee.yaml'

COMMON = {
    'H0': {'prior': {'min': 50.0, 'max': 90.0}, 'ref': 68.0, 'latex': 'H_0'},
    'omch2': {'prior': {'min': 0.05, 'max': 0.25}, 'ref': 0.12, 'latex': r'\Omega_c h^2'},
    'ombh2': {'prior': {'min': 0.015, 'max': 0.03}, 'ref': 0.0224, 'latex': r'\Omega_b h^2'},
    'tau': {'prior': {'min': 0.01, 'max': 0.15}, 'ref': 0.055, 'latex': r'\tau'},
    'logA': {'prior': {'min': 1.6094379124341003, 'max': 3.6888794541139363}, 'ref': 3.044, 'drop': True,
             'latex': r'\ln(10^{10}A_s)'},  # As in [5e-10, 4e-9]
    'As': {'value': 'lambda logA: 1e-10*np.exp(logA)', 'latex': 'A_s'},
    'ns': {'prior': {'min': 0.8, 'max': 1.2}, 'ref': 0.965, 'latex': 'n_s'},
}
PEER_FEDE = {'prior': {'min': 0.0, 'max': 0.5}, 'ref': 0.05, 'latex': 'f_{EDE}'}
PEER_THETA = {'prior': {'min': 0.1, 'max': 3.1}, 'ref': 2.0, 'latex': r'\theta_i'}
PEER_LOGZC = {'prior': {'min': 3.0, 'max': 4.3}, 'ref': 3.8, 'drop': True, 'latex': r'\log_{10} z_c'}

CAMB_ARGS_S1 = {'lens_potential_accuracy': 1, 'mnu': 0.06, 'nnu': 3.046, 'num_massive_neutrinos': 1}


def _peer(params, camb_args, model):
    if model in ('P1', 'P3'):
        camb_args.update(dark_energy_model='EarlyQuintessence', n=3, use_zc=True)
        params['fde_zc'] = copy.deepcopy(PEER_FEDE)
        if model == 'P3':
            params['theta_i'] = copy.deepcopy(PEER_THETA)
            params['log10zc'] = copy.deepcopy(PEER_LOGZC)
            params['zc'] = {'value': 'lambda log10zc: 10**log10zc', 'latex': 'z_c'}
        else:
            params['theta_i'] = 2.89155
            params['zc'] = 10 ** 3.81


def _external_likes():
    import n2like
    return {'DESI13': {'external': n2like.DESI13}, 'CC15': {'external': n2like.CC15}, 'TRGBH0': {'external': n2like.TRGBH0}}


def make_info_s1(model):
    params = {k: copy.deepcopy(v) for k, v in COMMON.items()}
    camb_args = dict(CAMB_ARGS_S1)
    _peer(params, camb_args, model)
    like = {'planck_2018_lowl.TT': None, 'planck_2018_lowl.EE': None,
            'planck_2018_highl_plik.TTTEEE_lite_native': None, 'planck_2018_lensing.native': None}
    params['A_planck'] = {'prior': {'dist': 'norm', 'loc': 1.0, 'scale': 0.0025},
                          'ref': {'dist': 'norm', 'loc': 1.0, 'scale': 0.002}, 'latex': 'A_{Planck}'}
    like.update(_external_likes())
    return {'packages_path': PKG, 'likelihood': like, 'params': params,
            'theory': {'camb': {'extra_args': camb_args, 'stop_at_error': False}}, 'sampler': {'evaluate': None}}


def make_info_s2(model):
    """ACT DR6 MFLike (official example theory/params) x SPT-3G D1 TnE (official cobaya template) + DESI13 + CC15 + TRGB.
    Cosmological priors replaced by the common V2 family; tau only with the common prior (no ACT tau Gaussian);
    SPT internal priors cleared and its official nuisance priors added exactly once (clear_internal_priors=true)."""
    import yaml

    class _L(yaml.SafeLoader):  # the SPT template uses !!python/name tags; read them as plain strings (no code is imported)
        pass
    _L.add_multi_constructor('tag:yaml.org,2002:python/name:', lambda loader, suffix, node: suffix)
    act = yaml.load(open(ACT_EXAMPLE, encoding='utf-8'), Loader=_L)
    spt = yaml.load(open(SPT_COBAYA, encoding='utf-8'), Loader=_L)
    from candl.interface import CandlCobayaLikelihood
    params = {k: copy.deepcopy(v) for k, v in COMMON.items()}
    cosmo_keys = set(params) | {'cosmomc_theta', 'sigma8', 'H0', 'T_d'}
    for k, v in act['params'].items():  # ACT foregrounds (+T_d fixed)
        if k not in cosmo_keys:
            params[k] = v
    for k, v in spt['params'].items():  # SPT nuisance parameters only (skip cosmology and derived blocks)
        if isinstance(v, dict) and 'prior' in v and k not in cosmo_keys and k not in ('theta_MC_100', 'logA'):
            params[k] = v
    prior = {k: v for k, v in act.get('prior', {}).items() if 'tau' not in k}  # ACT dust Gaussians kept, tau Gaussian dropped
    prior.update(spt.get('prior', {}))
    like = {}
    like['act_dr6_mflike.ACTDR6MFLike'] = {'input_file': 'dr6_data.fits'}
    like['candl_like'] = {'external': CandlCobayaLikelihood, 'data_set_file': SPT_INDEX,
                          'clear_internal_priors': True, 'feedback': False, 'wrapper': None, 'additional_args': {}}
    like.update(_external_likes())
    camb_args = dict(act['theory']['camb']['extra_args'])
    if not os.environ.get('COSMOREC_PATH'):
        camb_args.pop('recombination_model', None)  # CosmoRec not available: CAMB default recombination (documented deviation)
    camb_args.update(mnu=0.06, nnu=3.046, num_massive_neutrinos=1)
    camb_args['lmax'] = max(int(camb_args.get('lmax', 0)), 9000)
    _peer(params, camb_args, model)
    theory = {'camb': {'stop_at_error': False, 'extra_args': camb_args},
              'mflike.BandpowerForeground': act['theory']['mflike.BandpowerForeground']}
    return {'packages_path': PKG, 'likelihood': like, 'params': params, 'prior': prior, 'theory': theory,
            'sampler': {'evaluate': None}}


def make_info(stack, model):
    if stack == 'S1':
        return make_info_s1(model)
    if stack == 'S2':
        return make_info_s2(model)
    raise ValueError(stack)
