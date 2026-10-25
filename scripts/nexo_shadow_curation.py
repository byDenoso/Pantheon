"""Typed, bounded curation inside the existing serial SHADOW Writer.

The shared operator connection is the trust boundary. A role label is not a
cryptographic identity. Requests cannot grant permissions or execute code.
Google Sheets provides atomic batches, not compare-and-swap across writers.
"""
import datetime
import hashlib
import json
import re

try:
    from . import nexo_shadow_writer as w
except ImportError:
    import nexo_shadow_writer as w

PREFIX = 'NEXO_CURATION_V1 '
OLDER_ROLE_ID = '6ad6d608291c8191a518e9667b72bcab'  # verified P Task identity on 21-24 Oct; historical receipts only
ROLE_ID = '6adcbfe8693881919c4f756adafd1ab1'  # historical pending P curation receipts
CURRENT_ROLE_ID = '6ade1cf703648191a46f59f0475894fe'  # live P task in AGENTS 2026-10-25
P_CURATOR_IDS = frozenset((OLDER_ROLE_ID, ROLE_ID, CURRENT_ROLE_ID))
CANARY = 'CORE5-CURATION-473-CANARY'
CANARY_ITEM = 'OPS-I-DATASETS-INDEX-20261019'
ROADMAP_ID = 1202623426
RESUMO_ID = 357453004
ROADMAP_HEADER = ['item','titulo','status','dono','prio','proximo_teste','depende_de','atualizado','nota']
RESUMO_HEADER = ['data_hora','nivel','item','o_que_mudou','impacto','link']
FIELDS = {name:i for i,name in enumerate(ROADMAP_HEADER) if i >= 2}
# READY/RUNNING and scientific promotions belong to execution/review receipts,
# not to an unsupported assertion in a curation request.
OPERATIONAL_STATES = {'OPEN','PARTIAL','BLOCKED_INPUT','HOLD','PARKED','SUPERSEDED','RETIRED'}
# Transport bounds, not editorial limits. Google recommends payloads <= 2 MB:
# https://developers.google.com/workspace/sheets/api/limits
# Count UTF-16 conservatively for the Sheets 50,000-character cell boundary.
MAX_CELL_UTF16 = 50000
MAX_BATCH_BYTES = 2_000_000
MAX_PER_RUN = 24  # bounded throughput; excess curation stays queued for next cycle
DIGEST = re.compile(r'^[a-f0-9]{64}$')

class CurationError(ValueError):
    pass


def compact(obj):
    return json.dumps(obj,ensure_ascii=False,separators=(',',':'),sort_keys=True,allow_nan=False)


def sha(obj):
    return hashlib.sha256(compact(obj).encode('utf-8')).hexdigest()


def validate_cell(value):
    if not isinstance(value, str) or any(ord(ch) < 32 and ch not in '\n\t' for ch in value):
        raise CurationError('CURATION_VALUE_INVALID')
    try:
        units = len(value.encode('utf-16-le')) // 2
    except UnicodeEncodeError as exc:
        raise CurationError('CURATION_VALUE_INVALID') from exc
    if units > MAX_CELL_UTF16:
        raise CurationError('CURATION_CELL_TOO_LARGE')


def cells(values):
    for value in values:
        validate_cell(value)
    return [{'userEnteredValue':{'stringValue':v}} for v in values]


def validate_batch(requests):
    for request in requests:
        for operation in request.values():
            for row in operation.get('rows', []):
                for cell in row.get('values', []):
                    entered = cell.get('userEnteredValue', {})
                    if 'stringValue' in entered:
                        validate_cell(entered['stringValue'])
    # Match requests' default JSON encoding, including escaping and whitespace.
    if len(json.dumps({'requests': requests}, allow_nan=False).encode('utf-8')) > MAX_BATCH_BYTES:
        raise CurationError('CURATION_TRANSACTION_TOO_LARGE')


def parse(row):
    if len(row) != 8 or row[5] != 'PEDIDO_CURADORIA':
        return None
    if not isinstance(row[3],str):
        raise CurationError('CURATION_TYPE_INVALID')
    if not row[3].startswith(PREFIX):
        return None
    if not all(isinstance(v,str) for v in row) or not w.KEY.fullmatch(row[7]):
        raise CurationError('CURATION_IDENTITY_INVALID')
    if row[2] != 'WRITER':
        raise CurationError('CURATION_RECIPIENT_INVALID')
    manual_canary = row[1] == 'INTERATIVO' and row[7] == CANARY
    if not manual_canary and (row[1] != 'P' or not any(row[7].startswith(task_id+'-') for task_id in P_CURATOR_IDS)):
        raise CurationError('CURATION_ROLE_NOT_ALLOWED')
    try:
        request = json.loads(row[3][len(PREFIX):],object_pairs_hook=w.strict_obj,
                             parse_constant=lambda _: (_ for _ in ()).throw(ValueError('NONFINITE')))
    except (ValueError,TypeError) as exc:
        raise CurationError('CURATION_JSON_INVALID') from exc
    if not isinstance(request,dict):
        raise CurationError('CURATION_REQUEST_INVALID')
    if request.get('op') == 'roadmap.set':
        if set(request) != {'op','item','field','before','value'}:
            raise CurationError('CURATION_SCHEMA_INVALID')
        if not all(isinstance(v,str) for v in request.values()):
            raise CurationError('CURATION_TYPE_INVALID')
        if request['item'] != row[6] or request['field'] not in FIELDS or not DIGEST.fullmatch(request['before']):
            raise CurationError('CURATION_TARGET_INVALID')
        value = request['value']; field = request['field']
        validate_cell(value)
        if field == 'prio' and value not in {'P1','P2','P3','P4','P5'}:
            raise CurationError('CURATION_PRIORITY_INVALID')
        if field == 'status' and value not in OPERATIONAL_STATES:
            raise CurationError('CURATION_REVIEW_OR_EXECUTION_REQUIRED')
        if field == 'dono' and value not in {'S1','S2','S3','S4','R','D','I','P'}:
            raise CurationError('CURATION_OWNER_INVALID')
        if manual_canary and (request['item'],field,value) != (CANARY_ITEM,'prio','P5'):
            raise CurationError('CURATION_CANARY_SCOPE_INVALID')
    elif request.get('op') == 'resumo.append':
        if manual_canary or set(request) != {'op','row'}:
            raise CurationError('CURATION_SCHEMA_INVALID')
        values = request['row']
        if (not isinstance(values,list) or len(values) != 6 or
            not all(isinstance(v,str) for v in values) or
            values[2] != row[6] or not values[0] or not values[1]):
            raise CurationError('CURATION_SUMMARY_INVALID')
        for value in values:
            validate_cell(value)
    else:
        raise CurationError('CURATION_OPERATION_NOT_ALLOWED')
    return request


def read_rows(session, tab, header):
    found = list(w.page_rows(session,w.SHADOW,tab,chr(64+len(header))))
    if not found or found[0] != (1,header):
        raise CurationError('CURATION_HEADER_MISMATCH')
    return [(n,(row+['']*len(header))[:len(header)]) for n,row in found[1:]]


def locate(session, item):
    matches=[(n,r) for n,r in read_rows(session,'ROADMAP',ROADMAP_HEADER) if r[0]==item]
    if len(matches) != 1 or not all(isinstance(v,str) for v in matches[0][1]):
        raise CurationError('CURATION_ITEM_AMBIGUOUS')
    return matches[0]


def audit(row, suffix, message):
    eid = 'cur-'+sha([row[7],row[3]])[:40]+'-'+suffix
    value=[row[0],'WRITER','P',message,'',suffix.upper(),row[6],eid]
    return {'stable_id':eid,'tab':'MURAL','values':value}


def append_request(data):
    try:
        return w.append_request(data)
    except ValueError as exc:
        raise CurationError('CURATION_TRANSACTION_TOO_LARGE') from exc


def post(session, requests):
    payload={'requests':requests}
    validate_batch(requests)
    response=session.post(f'{w.API}/{w.SHADOW}:batchUpdate',json=payload,timeout=60)
    response.raise_for_status()


def receipt(session, data):
    return w.match_target(w.target_index(session,'MURAL'),data)


def process_one(session, row, request, *, apply, index=None):
    claim = audit(row, 'claimed', compact({'r':row[7], 'h':sha(request)}))
    done_id = audit(row, 'applied', '')['stable_id']
    idx = index if index is not None else w.target_index(session, 'MURAL')
    if done_id in getattr(idx, 'conflicts', ()):
        raise CurationError('CURATION_RECEIPT_CONFLICT')

    # A verified applied receipt is final even when later curation has changed
    # the target. Avoid repeated full ROADMAP/RESUMO reads for old receipts.
    if done_id in idx:
        try:
            saved = json.loads(idx[done_id][3])
        except (ValueError, TypeError) as exc:
            raise CurationError('CURATION_RECEIPT_INVALID') from exc
        if (saved.get('r') != row[7] or saved.get('h') != sha(request)
                or idx[done_id][5] != 'APPLIED'):
            raise CurationError('CURATION_RECEIPT_INVALID')
        return 'already_applied'

    if claim['stable_id'] in getattr(idx, 'conflicts', ()):
        raise CurationError('CURATION_RECEIPT_CONFLICT')
    reserved = claim['stable_id'] in idx
    if reserved and not w.match_target(idx, claim):
        raise CurationError('CURATION_RECEIPT_CONFLICT')
    if reserved:
        # Legacy CLAIMED proves that a write was attempted, not that it failed.
        # Only an exact APPLIED receipt authorizes idempotent completion. Never
        # replay a potentially ambiguous legacy mutation or append automatically.
        # Leave this identity unresolved for evidence-based reconciliation.
        return 'unresolved'

    if request['op'] == 'roadmap.set':
        n, before = locate(session, request['item'])
        after = before.copy()
        col = FIELDS[request['field']]
        after[col] = request['value']
        if row[7] == CANARY and before[col] != 'P5':
            raise CurationError('CURATION_CANARY_WOULD_CHANGE_VALUE')
        if sha(before) != request['before']:
            return 'conflict'
        message = compact({'r':row[7], 'h':sha(request), 'op':'set',
                           'f':request['field'], 'b':before[col], 'a':after[col],
                           'h0':sha(before), 'h1':sha(after)})
        update = {'updateCells': {'range': {
            'sheetId':ROADMAP_ID, 'startRowIndex':n-1, 'endRowIndex':n,
            'startColumnIndex':col, 'endColumnIndex':col+1},
            'rows':[{'values':cells([after[col]])}], 'fields':'userEnteredValue'}}
    else:
        # Never add an identical summary twice, including legacy CLAIMED cases.
        existing = read_rows(session, 'RESUMO', RESUMO_HEADER)
        if any(saved_row == request['row'] for _, saved_row in existing):
            return 'conflict'
        message = compact({'r':row[7], 'h':sha(request), 'op':'append',
                           'h1':sha(request['row'])})
        update = {'appendCells': {'sheetId':RESUMO_ID,
                                  'rows':[{'values':cells(request['row'])}],
                                  'fields':'userEnteredValue'}}

    done = audit(row, 'applied', message)
    # Sheets applies the CLAIMED marker, mutation, and APPLIED receipt
    # atomically. Legacy CLAIMED without APPLIED is never replayed.
    requests = append_request(claim)['requests'] + [
        update, append_request(done)['requests'][0]]
    validate_batch(requests)
    if not apply:
        return 'eligible'

    # Recheck the precondition just before a ROADMAP mutation. This is not CAS
    # against unrelated external writers; the existing single Writer serializes.
    if request['op'] == 'roadmap.set':
        current_n, current = locate(session, request['item'])
        if n != current_n or before != current:
            return 'conflict'
    post(session, requests)  # one atomic write; never retry the POST blindly
    refreshed = w.target_index(session, 'MURAL')
    if not (w.match_target(refreshed, claim) and
            w.match_target(refreshed, done)):
        raise RuntimeError('CURATION_APPLY_READBACK_UNKNOWN')
    if index is not None:
        index.clear()
        index.update(refreshed)
        if hasattr(index, 'conflicts'):
            index.conflicts = set(getattr(refreshed, 'conflicts', ()))

    if request['op'] == 'roadmap.set':
        _, current = locate(session, request['item'])
        if current != after:
            raise RuntimeError('CURATION_TARGET_READBACK_UNKNOWN')
    elif sum(saved_row == request['row'] for _, saved_row in
             read_rows(session, 'RESUMO', RESUMO_HEADER)) != 1:
        raise RuntimeError('CURATION_TARGET_READBACK_UNKNOWN')
    return 'applied'

def run(session, mural_rows, *, apply=False, index=None):
    counts={key:0 for key in ('eligible','applied','already_applied','unresolved','conflict','invalid','deferred')}
    used=0
    for row in mural_rows:
        try:
            request=parse(list(row))
            if request is None:
                continue
            if used >= MAX_PER_RUN:
                counts['deferred']+=1
                continue
            state=process_one(session,list(row),request,apply=apply,index=index)
            counts[state]+=1
            if state in ('eligible','applied'):
                used+=1
        except (CurationError,w.IdentityConflict):
            counts['invalid']+=1
    return counts
