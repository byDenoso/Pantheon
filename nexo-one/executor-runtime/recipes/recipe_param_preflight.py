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
import urllib.parse

CONTRACT = 'RECIPE_PARAM_PREFLIGHT_V1'


def finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _validate_desi(manifest, params, inputs, reject):
    identity = manifest.get('identity')
    limits = manifest.get('limits')
    statistic_contracts = manifest.get('statistics')
    input_contract = manifest.get('inputs')
    source_receipts = manifest.get('source_receipts')
    expected_receipts = {
        'recipe_bind': {
            'receipt_id': 'OR-8c76795538f2dea31468fa5c4a818ad6',
            'outcome': 'APPLIED',
            'occurred_at': '2026-10-02T19:28:53.411699Z',
            'payload_sha256': 'sha256:50f9b12787adfbffd1fe10e16ea98f7a792a8711dbf97413c6a41a42dccb92ff',
            'result_revision': 'sha256:9a3f391e1980c170e5bf23c2357ad5d10927595dc778444ca89f6c5728d955a5',
        },
        'data_binding': {
            'receipt_id': 'OR-4f4e64f3d1e3ef631e003e6ffa6cc5a2',
            'outcome': 'APPLIED',
            'occurred_at': '2026-10-02T19:32:10.000657Z',
            'payload_sha256': 'sha256:182d94e8c7e7d0593b7e63145ecf30a745cb1bff9bb9a1e55700920b8c3101a1',
            'result_revision': 'sha256:c177cfbfed129c0b9515d4a92cd640d2da6119f94006b687f50f644e41e3a7f8',
        },
    }
    if source_receipts != expected_receipts:
        raise ValueError('DESI public receipt provenance is invalid')
    expected_identity = {
        'test_id': 'GZ01-B03-T03-WINDOW-ROTATION-NULL',
        'prereg_hash': 'sha256:21d38d27b2ef12f17940fb9a01448c0ad3fe73950cb7e0352b1b0c11803b6069',
        'mode': 'window_rotation_null',
        'null_method': 'selection_stratified_permutation',
        'criterion': {
            'promote_p_emp_lte': 0.01,
            'bh_q': 0.1,
            'reject_all_p_emp_gte': 0.1,
        },
        'selection_manifest_sha256': '6ce284a355085679eb528517746b247fa2c48902c6158ca556ae9c197b34c65a',
        'null_count': 199,
        'statistics': [
            {'name': 'max_abs_gaussian_smoothed_delta', 'sigma_cells': 0.32},
        ],
    }
    if identity != expected_identity:
        raise ValueError('DESI preflight identity differs from the recorded T03 contract')
    if limits != {
            'seed_min': 0,
            'seed_max_exclusive': 2**63,
    }:
        raise ValueError('DESI preflight limits are invalid')
    expected_statistics = {
        'max_abs_gaussian_smoothed_delta': {
            'fields': ['name', 'sigma_cells'],
            'sigma_cells_gt': 0,
            'sigma_cells_lte': 20,
        },
        'largest_abs_excursion_component': {
            'fields': ['name', 'abs_delta_gte', 'connectivity'],
            'abs_delta_gte_gt': 0,
            'connectivity': [1, 2, 3],
        },
    }
    if statistic_contracts != expected_statistics:
        raise ValueError('DESI preflight statistic catalog is invalid')
    expected_inputs = {
        'required_names': [
            'desi_dr1_lss_selection_manifest',
            'desi_dr1_lss_3d_map_product',
        ],
        'selection_manifest': {
            'name': 'desi_dr1_lss_selection_manifest',
            'sha256': expected_identity['selection_manifest_sha256'],
            'schema': 'NEXO_DESI_LSS_SELECTION_MANIFEST_V1',
        },
        'product': {
            'name': 'desi_dr1_lss_3d_map_product',
            'schema': 'NEXO_DESI_LSS_3D_PRODUCT_V1',
        },
    }
    if input_contract != expected_inputs:
        raise ValueError('DESI preflight input catalog is invalid')

    if not isinstance(params, dict):
        reject('RECIPE_PARAMS_INVALID', 'params must be an object')
        return
    allowed = {
        'mode', 'test_id', 'prereg_hash', 'null_method', 'null_count',
        'seed', 'statistics', 'criterion',
    }
    if set(params) - allowed:
        reject('UNSUPPORTED_RECIPE_PARAMS', ', '.join(sorted(set(params) - allowed)))
    if params.get('mode') != identity['mode']:
        reject('UNSUPPORTED_RECIPE_MODE', str(params.get('mode')))
    if (params.get('test_id') != identity['test_id']
            or params.get('prereg_hash') != identity['prereg_hash']):
        reject('TEST_CONTRACT_MISMATCH', 'test_id/prereg_hash differ from T03')
    if params.get('null_method') != identity['null_method']:
        reject('UNSUPPORTED_NULL_METHOD', str(params.get('null_method')))
    if params.get('null_count') != identity['null_count']:
        reject('FROZEN_NULL_COUNT_MISMATCH', 'null_count must equal the applied RECIPE_BIND value')
    seed = params.get('seed')
    if (isinstance(seed, bool) or not isinstance(seed, int)
            or not limits['seed_min'] <= seed < limits['seed_max_exclusive']):
        reject('FROZEN_SEED_REQUIRED', 'seed must be frozen in [0, 2^63)')
    if params.get('criterion') != identity['criterion']:
        reject('FROZEN_CRITERION_MISMATCH', 'criterion differs from the recorded thresholds')

    statistics = params.get('statistics')
    if statistics != identity['statistics']:
        reject(
            'FROZEN_STATISTICS_MISMATCH',
            'statistics must equal the applied max_abs_gaussian_smoothed_delta/sigma_cells binding',
        )
    elif (not isinstance(statistics, list) or len(statistics) != 1
            or not finite(statistics[0].get('sigma_cells'))):
        reject('FROZEN_STATISTIC_INVALID', 'applied statistic is malformed')

    required_names = set(input_contract['required_names'])
    actual = {}
    if isinstance(inputs, list):
        for item in inputs:
            if not isinstance(item, dict):
                reject('INPUT_RECIPE_MANIFEST_MISMATCH', 'input bindings must be objects')
                break
            name = item.get('name')
            if not isinstance(name, str) or name in actual:
                reject('INPUT_RECIPE_MANIFEST_MISMATCH', 'input names must be unique strings')
                continue
            url = item.get('url')
            parsed = urllib.parse.urlsplit(url) if isinstance(url, str) else None
            sha256 = item.get('sha256')
            version = item.get('version')
            if (parsed is None or parsed.scheme != 'https' or not parsed.netloc
                    or parsed.username or parsed.password or parsed.query or parsed.fragment
                    or not isinstance(version, str) or not version.strip()
                    or not isinstance(sha256, str)
                    or re.fullmatch(r'[0-9a-f]{64}', sha256) is None):
                reject('INPUT_RECIPE_MANIFEST_MISMATCH', f'invalid frozen binding: {name}')
            actual[name] = item
    else:
        reject('INPUT_RECIPE_MANIFEST_MISMATCH', 'input bindings must be a list')
    if len(actual) != len(required_names) or set(actual) != required_names:
        reject('INPUT_RECIPE_MANIFEST_MISMATCH', 'exactly the two DESI production bindings are required')
    selection = actual.get(input_contract['selection_manifest']['name'])
    if selection is not None and selection.get('sha256') != identity['selection_manifest_sha256']:
        reject('INPUT_RECIPE_MANIFEST_MISMATCH', 'selection-manifest SHA256 differs from the frozen bytes')


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
        if recipe == 'desi_lss_selection_binding_family':
            if (manifest['contract'] != CONTRACT or manifest['recipe'] != recipe
                    or manifest['validator'] != 'desi_lss_selection_binding_family_v1'):
                raise ValueError('unsupported DESI manifest contract or validator')
            _validate_desi(manifest, params, inputs, reject)
            result['reasons'] = sorted(set(result['reasons']))
            result['eligible'] = not result['reasons']
            return result
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
