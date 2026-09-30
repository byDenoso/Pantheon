"""Classify runtime completion separately from a scientific verdict."""
OPERATIONAL_DECISIONS = {'INPUT_OR_FIT_UNAVAILABLE', 'INPUT_UNAVAILABLE'}


def classify_payload(exit_code, payload):
    if not isinstance(payload, dict):
        return False, 'SCIENTIFIC_SCRIPT', None
    result = payload.get('result', payload)
    if not isinstance(result, dict):
        return False, 'SCIENTIFIC_SCRIPT', None
    operational = (payload.get('execution_status') in OPERATIONAL_DECISIONS
                   or result.get('decision') in OPERATIONAL_DECISIONS)
    if operational:
        return False, 'INPUT_OR_FIT_UNAVAILABLE', {
            'code': payload.get('execution_status') or result.get('decision'),
            'detail': payload.get('error') or result.get('summary'),
            'statistics': payload.get('statistics') or result.get('statistics')}
    valid = result.get('verdict') in {'PROMOTED', 'REJECTED', 'INCONCLUSIVE'}
    return (True, None, None) if exit_code == 0 and valid else (False, 'SCIENTIFIC_SCRIPT', None)
