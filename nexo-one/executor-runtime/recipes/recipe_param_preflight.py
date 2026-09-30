"""Pure, stdlib-only parameter/manifest checks; never fetch data or run a fit.

The immutable manifest and these validator bytes are part of new execution identities.
This proves supported parameter semantics, not successful remote data access or science.
"""
from __future__ import annotations
import hashlib
import json
import math
import re
from pathlib import Path

CONTRACT = 'RECIPE_PARAM_PREFLIGHT_V1'


def finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def validate_params(recipe, params, inputs, recipe_root):
    """Return contract, eligible, reasons, details, manifest_sha256, validator_sha256."""
    root = Path(recipe_root)
    result = {'contract': CONTRACT, 'eligible': False, 'reasons': [], 'details': [],
              'manifest_sha256': None,
              'validator_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}

    def reject(code, detail):
        result['reasons'].append(code)
        result['details'].append(detail)

    if not isinstance(recipe, str) or not re.fullmatch(r'[a-z0-9_]{2,40}', recipe):
        reject('PREFLIGHT_RECIPE_INVALID', 'Invalid recipe name')
        return result
    path = root / 'preflight' / (recipe + '.json')
    if not path.is_file():
        reject('PREFLIGHT_CONTRACT_MISSING', recipe)
        return result
    raw = path.read_bytes()
    result['manifest_sha256'] = hashlib.sha256(raw).hexdigest()
    try:
        manifest = json.loads(raw)
        if (manifest['contract'] != CONTRACT or manifest['recipe'] != recipe
                or manifest['validator'] != 'w0wa_bao_sn_multi_v1'
                or recipe != 'w0wa_bao_sn_multi'):
            raise ValueError('unsupported manifest contract or validator')
        releases = manifest['releases']
        compilations = manifest['compilations']
        if not isinstance(releases, dict) or not isinstance(compilations, dict):
            raise ValueError('invalid manifest tables')
        if not isinstance(params, dict):
            reject('RECIPE_PARAMS_INVALID', 'params must be an object')
            return result
        allowed = {'mode', 'bao_release', 'compilations', 'priors', 'bands', 'tracer_groups'}
        if set(params) - allowed:
            reject('UNSUPPORTED_RECIPE_PARAMS', ', '.join(sorted(set(params) - allowed)))
        mode = params.get('mode')
        release = params.get('bao_release', 'dr2')
        comps = params.get('compilations') or ['pantheon_plus', 'des_sn5yr']
        if mode not in ('bao_tracer_jackknife', 'redshift_jackknife'):
            reject('UNSUPPORTED_RECIPE_MODE', str(mode))
        if not isinstance(release, str) or release not in releases:
            reject('UNSUPPORTED_DATA_RELEASE', str(release))
        valid_comps = (isinstance(comps, list) and bool(comps)
                       and all(isinstance(c, str) and c in compilations for c in comps)
                       and len(set(comps)) == len(comps))
        if not valid_comps:
            reject('UNSUPPORTED_COMPILATIONS', repr(comps))
        priors = params.get('priors') or {}
        if not isinstance(priors, dict):
            reject('RECIPE_PRIORS_INVALID', 'priors must be an object')
        else:
            for name, prior in priors.items():
                if (name not in ('omega_m', 'w0', 'wa', 'a_rd') or not isinstance(prior, list)
                        or len(prior) != 2 or not all(finite(x) for x in prior) or prior[1] <= 0):
                    reject('RECIPE_PRIORS_INVALID', str(name))
        if mode == 'bao_tracer_jackknife':
            if 'bands' in params:
                reject('UNUSED_RECIPE_PARAMS', 'bands are unused by bao_tracer_jackknife')
            groups = params.get('tracer_groups')
            if not isinstance(groups, list) or not groups:
                reject('RECIPE_HOLDOUTS_INVALID', 'tracer_groups must be nonempty')
            else:
                labels = set()
                for group in groups:
                    if (not isinstance(group, dict) or set(group) != {'label', 'z'}
                            or not isinstance(group.get('label'), str) or not group['label'].strip()
                            or group['label'] in labels or not isinstance(group.get('z'), list)
                            or not group['z'] or not all(finite(z) for z in group['z'])
                            or len(set(group['z'])) != len(group['z'])):
                        reject('RECIPE_HOLDOUTS_INVALID', repr(group))
                        continue
                    labels.add(group['label'])
                    if isinstance(release, str) and release in releases:
                        rows = releases[release]['redshift_rows']
                        tolerance = manifest['redshift_match_atol']
                        missing = [z for z in group['z'] if not any(abs(z - actual) < tolerance for actual in rows)]
                        if missing:
                            reject('DATA_RELEASE_PARAM_MISMATCH', f'{release}/{group["label"]}: absent redshifts {missing}')
                        elif sum(not any(abs(z - drop) < tolerance for drop in group['z']) for z in rows) < 4:
                            reject('RECIPE_HOLDOUTS_INVALID', 'fewer than four BAO observations remain')
        elif mode == 'redshift_jackknife':
            if 'tracer_groups' in params:
                reject('UNUSED_RECIPE_PARAMS', 'tracer_groups are unused by redshift_jackknife')
            bands = params.get('bands')
            if (not isinstance(bands, list) or not bands
                    or any(not isinstance(b, list) or len(b) != 2 or not all(finite(x) for x in b)
                           or b[0] >= b[1] for b in bands)):
                reject('RECIPE_HOLDOUTS_INVALID', 'bands require finite increasing endpoints')
        if isinstance(release, str) and release in releases and valid_comps:
            expected = list(releases[release]['inputs'])
            for comp in comps:
                expected.extend(compilations[comp]['inputs'])
            required = {(i['url'], i['sha256'], i['version']) for i in expected}
            actual = set()
            if isinstance(inputs, list):
                for item in inputs:
                    if not isinstance(item, dict):
                        break
                    actual.add((item.get('url'), str(item.get('sha256', '')).removeprefix('sha256:'), item.get('version')))
            if not isinstance(inputs, list) or len(inputs) != len(required) or actual != required:
                reject('INPUT_RECIPE_MANIFEST_MISMATCH', 'binding must match exactly the release and compilation inputs')
    except (KeyError, TypeError, ValueError, OverflowError) as error:
        reject('PREFLIGHT_CONTRACT_INVALID', str(error))
    result['reasons'] = sorted(set(result['reasons']))
    result['eligible'] = not result['reasons']
    return result
