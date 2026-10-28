"""Private operational projections maintained by the existing serial Writer.

These views are disposable: source events remain in MURAL/RESULTADOS/spool.
No scientific verdict, permission, task or backend is changed by this module.
"""
import datetime as dt
import hashlib
import json
import re

VERSION = 'TOWER_OPERATIONS_V1'
VIEW_TITLES = ('AUTONOMIA', 'INCIDENTES', 'EXECUCOES', 'MANUTENCAO', 'CHECKPOINTS')
RECENT_LIMIT = 500
MAINTENANCE = (
    ('daily-health', 'DAILY', 'P', 'Reconciliar agendador, Writer e incidentes ativos; atuar somente na causa observada.'),
    ('weekly-recovery', 'WEEKLY', 'P', 'Criar snapshot privado da Tower; reler metadados e amostra; registrar ID e evidência.'),
    ('monthly-capacity', 'MONTHLY', 'P', 'Reavaliar volume, custo, dependências, recursos e restauração local de snapshot; preservar originais.'),
    ('quarterly-capabilities', 'QUARTERLY', 'P', 'Revalidar capacidades utilizadas, versões, testes de recuperação e dependências materiais.'),
    ('annual-rollover', 'YEARLY', 'P', 'Revisar horizonte e capacidade; particionar histórico somente com paridade verificada e plano de reversão.'),
)

def period_key(cadence, now):
    if cadence == 'DAILY':
        return now.date().isoformat()
    if cadence == 'WEEKLY':
        y, w, _ = now.isocalendar()
        return f'{y}-W{w:02d}'
    if cadence == 'MONTHLY':
        return now.strftime('%Y-%m')
    if cadence == 'QUARTERLY':
        return f'{now.year}-Q{(now.month-1)//3+1}'
    if cadence == 'YEARLY':
        return str(now.year)
    raise ValueError('UNKNOWN_CADENCE')

def maintenance_rows(mural, now):
    receipts = {}
    for row in mural:
        if len(row) != 8 or row[5] != 'MANUTENCAO' or row[1] != 'P':
            continue
        if not row[3].startswith('NEXO_MAINTENANCE_V1 '):
            continue
        try:
            record = json.loads(row[3].split(' ', 1)[1])
        except (ValueError, TypeError):
            continue
        # A claim without a durable evidence link is not a completed operation.
        if (isinstance(record, dict) and record.get('state') == 'VERIFIED'
                and isinstance(record.get('id'), str) and isinstance(record.get('period'), str)
                and row[4].startswith('https://') and row[7]):
            receipts[(record['id'], record['period'])] = row
    out = [['job', 'cadencia', 'periodo_local', 'estado', 'dono', 'acao', 'recibo', 'evidencia']]
    for job, cadence, owner, action in MAINTENANCE:
        period = period_key(cadence, now)
        found = receipts.get((job, period))
        out.append([job, cadence, period, 'VERIFIED_RECEIPT' if found else 'DUE',
                    owner, action, found[7] if found else '', found[4] if found else ''])
    return out

def executor_receipt(row):
    """Validate receipt shape only; hashes are declarations, not independent replay."""
    try:
        method = json.loads(row[5])
        receipt = method.get('EXECUTOR_RECEIPT_V1', method)
        if not isinstance(receipt, dict):
            return False
        if not all(isinstance(receipt.get(k), str) and receipt[k] for k in ('run_id', 'runtime', 'class')):
            return False
        if receipt['runtime'] not in ('local_sandbox', 'github_actions') or receipt['class'] not in ('E0', 'E1', 'E2'):
            return False
        if not all(isinstance(receipt.get(k), str) and re.fullmatch(r'[a-f0-9]{64}', receipt[k]) for k in ('script_sha256', 'output_sha256')):
            return False
        hashes = receipt.get('input_hashes')
        return isinstance(hashes, dict) and bool(hashes) and all(
            isinstance(k, str) and k and isinstance(v, str) and re.fullmatch(r'[a-f0-9]{64}', v)
            for k, v in hashes.items())
    except (ValueError, TypeError, AttributeError, IndexError):
        return False


def build_views(stored, pending, counts, *, now=None, roster=None, revision='unknown', duration=0):
    from zoneinfo import ZoneInfo
    now = now or dt.datetime.now(ZoneInfo('America/Sao_Paulo'))
    if now.tzinfo is None:
        raise ValueError('TIMEZONE_REQUIRED')
    stamp = now.isoformat(timespec='seconds')
    mural = list(stored.get('MURAL', {}).values())
    results = list(stored.get('RESULTADOS', {}).values())
    roster = roster or {}
    incidents = [['id', 'estado', 'origem', 'dono', 'causa', 'acao', 'observado_em', 'escopo']]
    active = counts.get('new_failures', 0)
    for item in pending:
        state = item['state']
        if state.startswith(('INVALID:', 'PENDING_SYNC')):
            incidents.append([item['data']['stable_id'], 'QUARANTINED',
                f"{item['mark_tab']}!{item['mark_column']}{item['number']}", 'P', state,
                'Preservar original; corrigir apenas com nova versão e evidência; não replay.', stamp, 'TRANSPORT'])
        elif state.startswith('CLAIMED:'):
            data = item['data']
            if stored.get(data['tab'], {}).get(data['stable_id']) != tuple(data['values']):
                incidents.append([data['stable_id'], 'PENDING_RECONCILIATION',
                    f"{item['mark_tab']}!A{item['number']}", 'P', 'CLAIMED_WITHOUT_EXACT_TARGET',
                    'Reconciliar recibo e destino; nunca despachar de novo por timeout.', stamp, 'TRANSPORT'])
    executions = [['id', 'data', 'produtor_declarado', 'item', 'classe_declarada', 'proveniencia', 'artefato_declarado', 'fonte']]
    missing_artifacts = identity_conflicts = receipt_complete = 0
    for row in results:
        padded = list(row) + [''] * (10-len(row))
        source_role = padded[1]
        task_ids = re.findall(r'(?<![0-9a-f])[0-9a-f]{32}(?![0-9a-f])', source_role)
        declared = re.match(r'^(S[1-4]|P)(?:\b|\|)', source_role)
        conflict = bool(declared and any(t in roster and roster[t] != declared[1] for t in task_ids))
        if conflict:
            identity_conflicts += 1
            incidents.append([padded[3], 'PROVENANCE_CONFLICT', 'RESULTADOS', 'P',
                'ROLE_TASK_MISMATCH', 'Conferir execução/artefato; corrigir por evento vinculado, sem sobrescrever.', stamp, 'IDENTITY'])
        artifact = padded[9]
        missing = not artifact or 'LOCAL_ONLY' in artifact
        missing_artifacts += int(missing)
        valid_receipt = executor_receipt(padded)
        receipt_complete += int(valid_receipt)
        classification = re.search(r'(?<![A-Za-z0-9])(E[012]|QA|TECH_CHECK|REVIEW)(?![A-Za-z0-9])', ' '.join(padded[2:6]))
        executions.append([padded[3], padded[0], source_role, padded[2],
            classification[1] if classification else 'UNCLASSIFIED',
            'CONFLICT' if conflict else ('EXECUTOR_RECEIPT_SHAPE_VALID_NOT_REPLAYED' if valid_receipt else 'DECLARED_NOT_INDEPENDENTLY_VERIFIED'),
            'LOCAL_OR_MISSING' if missing else 'POINTER_PRESENT_NOT_REVALIDATED',
            f'RESULTADOS · id={padded[3]}'])
    # A bounded navigation view; full evidence remains in RESULTADOS.
    executions = executions[:1] + executions[1:][-RECENT_LIMIT:]
    status = 'ATTENTION' if active or identity_conflicts else 'READBACK_VERIFIED'
    summary = [['metrica', 'estado', 'valor', 'observado_em', 'fonte', 'acao', 'dono', 'escopo']]
    def metric(k, state, value, source, action='', owner='P', scope='OPERATIONS'):
        summary.append([k, state, str(value), stamp, source, action, owner, scope])
    metric('writer', status, VERSION, 'Writer serial; post-readback', 'Conferir idade desta observação; >45 min exige leitura do workflow.')
    metric('implementation', 'OBSERVED', revision, 'GITHUB_SHA')
    metric('duration_seconds', 'CAPACITY_REVIEW' if duration >= 300 else 'OBSERVED', round(duration, 3), 'Relógio monotônico', '>=300 s: investigar custo de leitura antes do timeout de 600 s.')
    metric('results_records', 'RECORDS_NOT_TEST_COUNT', len(results), 'RESULTADOS', 'Linhas incluem QA, revisão e ciência; não somar como testes independentes.', scope='EVIDENCE')
    metric('mural_records', 'OBSERVED', len(mural), 'MURAL')
    metric('verified_quantitative_runs', 'RECEIPT_SHAPE_ONLY_NOT_REPLAYED', receipt_complete, 'RESULTADOS.metodo', 'Não equiparar recibo declarado a execução reproduzida.', scope='EVIDENCE')
    metric('written_this_cycle', 'READBACK_VERIFIED', counts.get('written', 0), 'Writer counters')
    metric('active_failures', 'ATTENTION' if active else 'CLEAR', active, 'Writer counters')
    metric('historical_quarantine', 'PRESERVED', counts.get('preexisting_invalid',0)+counts.get('preexisting_quarantined',0), 'Spool', 'Não liberar recusas; causa e escopo continuam visíveis.')
    metric('curation_rejected', 'PRESERVED', counts.get('curation_rejected',0)+counts.get('curation_already_rejected',0), 'MURAL · REJECTED', 'Novo pedido corrigido requer hash real da linha atual.')
    metric('identity_conflicts', 'ATTENTION' if identity_conflicts else 'CLEAR', identity_conflicts, 'EQUIPE × RESULTADOS', 'Conferir fonte antes de atribuir execução.', scope='IDENTITY')
    metric('incident_records', 'DERIVED_ONLY', len(incidents)-1, 'INCIDENTES', 'Navegação limitada aos últimos 500; originais permanecem nas fontes.')
    metric('artifact_local_or_missing', 'POINTER_AUDIT_ONLY', missing_artifacts, 'RESULTADOS.link_dados', 'Reconciliar arquivos materiais; isto não invalida automaticamente o cálculo.', scope='EVIDENCE')
    metric('navigation_window', 'DERIVED_ONLY', min(len(results), RECENT_LIMIT), 'EXECUCOES', 'Últimos registros; histórico integral em RESULTADOS.')
    for tab, index in stored.items():
        last = getattr(index, 'last_row', len(index)+1)
        metric('rows_'+tab, 'CAPACITY_REVIEW' if last >= 50000 else 'OBSERVED', last, tab,
               '50 mil linhas: avaliar particionamento com paridade; jamais excluir automaticamente.')
    metric('remote_dispatch', 'NOT_CERTIFIED_BY_WRITER', 'read-only intake ≠ execução', 'Backend receipt required', 'Usar somente backend autorizado e comprovado; cálculo local segue independente.')
    checkpoints = {}
    for row in mural:
        if len(row) != 8 or row[5] != 'CHECKPOINT' or not row[3].startswith('NEXO_CHECKPOINT_V1 '):
            continue
        try:
            cp = json.loads(row[3].split(' ',1)[1])
            task = cp.get('task_id')
            if (task not in roster or row[1] != roster[task] or not row[7].startswith(task+'-')
                    or not isinstance(cp.get('run_id'),str) or not cp['run_id']
                    or any(type(cp.get(k)) is not int or cp[k]<1 for k in ('mural_row','result_row'))
                    or not isinstance(cp.get('pending_ids'),list)
                    or not all(isinstance(x,str) and x for x in cp['pending_ids'])
                    or not isinstance(cp.get('next_action'),str)):
                continue
            checkpoints[task]=[task,cp['run_id'],row[0],str(cp['mural_row']),str(cp['result_row']),
                               json.dumps(cp['pending_ids'],ensure_ascii=False),cp['next_action'],row[7]]
        except (ValueError,TypeError,AttributeError):
            continue
    cp_rows=[['task_id','run_id_declarado','data','cursor_mural','cursor_resultados','pending_ids','proxima_acao','recibo']]
    cp_rows.extend(checkpoints.values())
    incidents = incidents[:1] + incidents[1:][-RECENT_LIMIT:]
    return {'AUTONOMIA':summary, 'INCIDENTES':incidents, 'EXECUCOES':executions,
            'MANUTENCAO':maintenance_rows(mural, now), 'CHECKPOINTS':cp_rows}

def publish_views(session, views, writer):
    """Replace only named derived views; exact readback, no POST retry."""
    meta = writer.safe_get(session, f'{writer.API}/{writer.SHADOW}',
        params={'fields':'sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)))'}, timeout=60).json()
    sheets = {s['properties']['title']:s['properties'] for s in meta.get('sheets',[])}
    requests = []
    for title in VIEW_TITLES:
        if title not in sheets or title not in views:
            raise RuntimeError('OPERATIONS_VIEW_MISSING')
        props, rows = sheets[title], views[title]
        if any(len(r) != 8 or any(not isinstance(v, str) for v in r) for r in rows):
            raise ValueError('OPERATIONS_SCHEMA_INVALID')
        needed = max(len(rows), props['gridProperties']['rowCount'])
        if needed > 2000:
            raise RuntimeError('OPERATIONS_VIEW_CAPACITY')
        if len(rows) > props['gridProperties']['rowCount']:
            requests.append({'updateSheetProperties': {'properties':{'sheetId':props['sheetId'],
                'gridProperties':{'rowCount':len(rows)}}, 'fields':'gridProperties.rowCount'}})
        requests.append({'updateCells':{'range':{'sheetId':props['sheetId'], 'startRowIndex':0,
            'endRowIndex':needed, 'startColumnIndex':0, 'endColumnIndex':8},
            'rows':[{'values':[{'userEnteredValue':{'stringValue':v}} for v in row]} for row in rows],
            'fields':'userEnteredValue'}})
    payload = {'requests': requests}
    if len(json.dumps(payload).encode()) > 2_000_000:
        raise RuntimeError('OPERATIONS_PAYLOAD_TOO_LARGE')
    response = session.post(f'{writer.API}/{writer.SHADOW}:batchUpdate',json=payload,timeout=60)
    response.raise_for_status()
    for title in VIEW_TITLES:
        expected = views[title]
        actual = writer.values(session, writer.SHADOW, f"'{title}'!A1:H{len(expected)}")
        if [r+['']*(8-len(r)) for r in actual] != expected:
            raise RuntimeError('OPERATIONS_READBACK_FAILED')
    return 'READBACK_VERIFIED'
