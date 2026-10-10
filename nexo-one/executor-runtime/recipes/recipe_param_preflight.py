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
        if manifest['contract'] != CONTRACT or manifest['recipe'] != recipe:
            raise ValueError('unsupported manifest contract or validator')
        if recipe == 'cf4_monopole_dipole_shell_gls_v1':
            if manifest.get('validator') != 'cf4_environment_v1':
                raise ValueError('unsupported CF4 parameter validator')
            if not _cf4_embedded_sources_match(root/(recipe+'.py'), raw, Path(__file__)):
                reject('CF4_RUNTIME_PREFLIGHT_DRIFT','standalone runtime must match trusted manifest and validator bytes')
            for code, detail in _validate_cf4_environment(params, inputs, manifest):
                reject(code, detail)
            result['reasons'] = sorted(set(result['reasons']))
            result['eligible'] = not result['reasons']
            return result
        if recipe == 'rank_score_leave_one_out':
            if manifest.get('validator') != 'rank_score_leave_one_out_v1':
                raise ValueError('unsupported manifest contract or validator')
            exact_params = False
            if isinstance(params, dict) and isinstance(manifest.get('params'), dict):
                try:
                    exact_params = (
                        json.dumps(params, sort_keys=True, separators=(',', ':'), allow_nan=False)
                        == json.dumps(manifest['params'], sort_keys=True, separators=(',', ':'), allow_nan=False)
                    )
                except (TypeError, ValueError):
                    exact_params = False
            if not exact_params:
                reject('FROZEN_RECIPE_PARAMS_MISMATCH', 'params must exactly match the frozen manifest')
            expected_inputs = manifest.get('inputs')
            if not isinstance(expected_inputs, list) or not expected_inputs:
                raise ValueError('rank score input manifest missing')
            required = {(item['name'], item['url'], item['version'], item['sha256']) for item in expected_inputs}
            actual = set()
            if isinstance(inputs, list):
                for item in inputs:
                    if not isinstance(item, dict):
                        break
                    actual.add((item.get('name'), item.get('url'), item.get('version'),
                                str(item.get('sha256') or '').removeprefix('sha256:')))
            if not isinstance(inputs, list) or len(inputs) != len(required) or actual != required:
                reject('INPUT_RECIPE_MANIFEST_MISMATCH', 'binding must match the frozen public projection')
            result['reasons'] = sorted(set(result['reasons']))
            result['eligible'] = not result['reasons']
            return result
        if manifest.get('validator') != 'w0wa_bao_sn_multi_v1' or recipe != 'w0wa_bao_sn_multi':
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



def _validate_cf4_environment(params, inputs, manifest):
    """Pure technical admission for the single fixed catalog implementation.

    Identity and source commitments are supplied by the canonical TEST binding.
    They are provenance, not a caller-created scientific approval.
    """
    reasons=[]
    def no(code,detail): reasons.append((code,detail))
    if not isinstance(params,dict):
        return [('RECIPE_PARAMS_INVALID','params must be an object')]
    required={'mode','test_id','prereg_hash','dipole_score','fit_scope','decision_ref','decision_sha256'}
    if set(params)!=required: no('CF4_PARAMS_NOT_EXPLICIT','all seven identity/source fields are required; no extras')
    if params.get('mode')!='cf4_environment': no('UNSUPPORTED_RECIPE_MODE','smoke is never scientific admission')
    if (not isinstance(params.get('test_id'),str) or not params['test_id'].strip()
        or not isinstance(params.get('prereg_hash'),str)
        or not re.fullmatch(r'sha256:[0-9a-f]{64}',params['prereg_hash'])):
        no('FROZEN_TEST_IDENTITY_MISMATCH','canonical TEST identity and preregistration commitment are required')
    if manifest.get('dipole_score')!='vector_quadratic' or params.get('dipole_score')!='vector_quadratic':
        no('DIPOLE_SCORE_UNRESOLVED','this recipe implements the fixed vector_quadratic definition')
    if manifest.get('fit_scope')!='joint_gls_marginal' or params.get('fit_scope')!='joint_gls_marginal':
        no('DIPOLE_FIT_SCOPE_UNRESOLVED','the joint fit uses marginal dipole covariance; shell fits are diagnostics')
    ref=params.get('decision_ref'); sha=params.get('decision_sha256')
    if not isinstance(ref,str) or not ref.strip() or not isinstance(sha,str) or not re.fullmatch(r'[0-9a-f]{64}',sha):
        no('PROSPECTIVE_DECISION_REFERENCE_MISSING','explicit source reference and exact source SHA256 required')
    expected=manifest.get('inputs')
    if not isinstance(expected,list) or len(expected)!=3:
        no('PREFLIGHT_CONTRACT_INVALID','three fixed public inputs are required')
    else:
        required_inputs={(i['name'],i['url'],i['version'],i['sha256']) for i in expected}
        actual=set()
        if isinstance(inputs,list):
            for i in inputs:
                if not isinstance(i,dict): break
                actual.add((i.get('name'),i.get('url'),i.get('version'),str(i.get('sha256') or '').removeprefix('sha256:')))
        if not isinstance(inputs,list) or len(inputs)!=3 or actual!=required_inputs:
            no('INPUT_RECIPE_MANIFEST_MISMATCH','CF4 binding must match all three fixed input identities')
    return reasons

def _cf4_embedded_sources_match(recipe_path, manifest_raw, validator_path):
    """Verify the standalone runtime is generated from this exact admission source."""
    try:
        import ast
        runtime_source=Path(recipe_path).read_text()
        validator_source=Path(validator_path).read_text()
        runtime_tree=ast.parse(runtime_source)
        validator_tree=ast.parse(validator_source)
        constants={}
        for node in runtime_tree.body:
            if isinstance(node,ast.Assign) and len(node.targets)==1 and isinstance(node.targets[0],ast.Name):
                if node.targets[0].id in ('_CATALOG_MANIFEST_SHA256','_CATALOG_VALIDATOR_SHA256','_FROZEN_MANIFEST_JSON'):
                    constants[node.targets[0].id]=ast.literal_eval(node.value)
        def helper(source,tree):
            return next(ast.get_source_segment(source,n) for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='_validate_cf4_environment')
        return (constants.get('_CATALOG_MANIFEST_SHA256')==hashlib.sha256(manifest_raw).hexdigest()
                and constants.get('_CATALOG_VALIDATOR_SHA256')==hashlib.sha256(Path(validator_path).read_bytes()).hexdigest()
                and isinstance(constants.get('_FROZEN_MANIFEST_JSON'),str)
                and constants['_FROZEN_MANIFEST_JSON'].encode()==manifest_raw
                and helper(runtime_source,runtime_tree)==helper(validator_source,validator_tree))
    except (OSError, SyntaxError, StopIteration, ValueError, TypeError):
        return False
