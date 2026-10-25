import copy
import json
import unittest
from unittest.mock import patch
from scripts import nexo_shadow_curation as c
from scripts import nexo_shadow_writer as w

BASE=['OPS-I-DATASETS-INDEX-20261019','Dataset index','PARTIAL','P','P5','Check bindings','','2026-10-21','Keep history']

def event(value='P4', field='prio', before=None, eid=None, role='P'):
    req={'op':'roadmap.set','item':BASE[0],'field':field,'before':before or c.sha(BASE),'value':value}
    return ['2026-10-21T10:00:00Z',role,'WRITER',c.PREFIX+c.compact(req),'','PEDIDO_CURADORIA',BASE[0],eid or c.ROLE_ID+'-20261021-001']

class Response:
    def raise_for_status(self): pass

class Session:
    def __init__(self):
        self.roadmap=BASE.copy();self.mural={};self.summary=[];self.calls=[];self.fail_after_apply=False
    def post(self,url,*,json,timeout):
        self.calls.append(copy.deepcopy(json))
        for r in json['requests']:
            if 'updateCells' in r:
                u=r['updateCells'];col=u['range']['startColumnIndex']
                self.roadmap[col]=u['rows'][0]['values'][0]['userEnteredValue']['stringValue']
            else:
                a=r['appendCells'];values=[v['userEnteredValue']['stringValue'] for v in a['rows'][0]['values']]
                if a['sheetId']==c.RESUMO_ID:self.summary.append(values)
                else:self.mural[values[7]]=tuple(values)
        if self.fail_after_apply and len(self.calls)==1:raise TimeoutError('ambiguous')
        return Response()

class CurationTests(unittest.TestCase):
    def run_request(self,s,row,apply=True):
        def page(session,sheet,tab,last,first=1):
            if tab=='ROADMAP':return iter([(1,c.ROADMAP_HEADER),(2,s.roadmap.copy())])
            if tab=='RESUMO':return iter([(1,c.RESUMO_HEADER),*[(i+2,r) for i,r in enumerate(s.summary)]])
            raise AssertionError('unexpected sheet')
        with patch.object(w,'page_rows',side_effect=page),patch.object(w,'target_index',side_effect=lambda session,tab:dict(s.mural)):
            return c.run(s,[row],apply=apply)

    def test_valid_patch_and_preserved_history(self):
        s=Session();row=event();r=self.run_request(s,row)
        self.assertEqual(r['applied'],1);self.assertEqual(s.roadmap[4],'P4')
        self.assertEqual(len(s.calls),1)
        change=s.calls[0]['requests']
        self.assertEqual(len(change),3)
        self.assertEqual(change[0]['appendCells']['sheetId'],w.TABS['MURAL'][0])
        self.assertEqual(change[1]['updateCells']['range']['sheetId'],c.ROADMAP_ID)
        self.assertEqual(change[2]['appendCells']['sheetId'],w.TABS['MURAL'][0])
        saved=json.loads(list(s.mural.values())[-1][3])
        self.assertEqual((saved['b'],saved['a']),('P5','P4'))
        self.assertEqual(saved['h0'],c.sha(BASE));self.assertEqual(saved['h1'],c.sha(s.roadmap))

    def test_replay_after_later_edit_does_not_restore_old_target(self):
        s=Session();row=event();self.run_request(s,row);s.roadmap[4]='P2'
        r=self.run_request(s,row)
        self.assertEqual(r['already_applied'],1);self.assertEqual(s.roadmap[4],'P2');self.assertEqual(len(s.calls),1)

    def test_stale_precondition_writes_audit_only_never_overwrites_roadmap(self):
        s=Session();s.roadmap[5]='Concurrent edit';row=event()
        r=self.run_request(s,row)
        self.assertEqual(r['superseded'],1)
        self.assertEqual(s.roadmap[5],'Concurrent edit')
        self.assertEqual(len(s.calls),1)
        self.assertEqual(len(s.calls[0]['requests']),1)
        self.assertEqual(list(s.mural.values())[-1][5],'SUPERSEDED')
        again=self.run_request(s,row)
        self.assertEqual(again['already_superseded'],1)
        self.assertEqual(len(s.calls),1)

    def test_stale_preflight_does_not_write_audit(self):
        s=Session();s.roadmap[5]='Concurrent edit'
        r=self.run_request(s,event(),apply=False)
        self.assertEqual(r['superseded_candidate'],1)
        self.assertEqual(s.calls,[])

    def test_reservation_without_apply_never_replays(self):
        s=Session();row=event();request=c.parse(row)
        claim=c.audit(row,'claimed',c.compact({'r':row[7],'h':c.sha(request)}))
        s.mural[claim['stable_id']]=tuple(claim['values'])
        r=self.run_request(s,row)
        self.assertEqual(r['unresolved'],1);self.assertEqual(s.calls,[])

    def test_timeout_after_atomic_apply_recovers_from_receipt(self):
        s=Session();s.fail_after_apply=True;row=event()
        with self.assertRaises(TimeoutError):self.run_request(s,row)
        s.fail_after_apply=False;r=self.run_request(s,row)
        self.assertEqual(r['already_applied'],1);self.assertEqual(len(s.calls),1)

    def test_preflight_is_read_only(self):
        s=Session();r=self.run_request(s,event(),False)
        self.assertEqual(r['eligible'],1);self.assertEqual(s.calls,[])

    def test_recreated_p_identity_can_curate_without_losing_legacy(self):
        s=Session();row=event(eid=c.CURRENT_ROLE_ID+'-20261025-001')
        self.assertEqual(self.run_request(s,row)['applied'],1)
        self.assertEqual(s.roadmap[4],'P4')
        self.assertEqual(c.parse(event(eid=c.ROLE_ID+'-20261024-001'))['op'],'roadmap.set')

    def test_verified_oldest_p_identity_can_reconcile_history(self):
        s=Session();row=event(eid=c.OLDER_ROLE_ID+'-20261024T1055-0300-001')
        self.assertEqual(self.run_request(s,row)['applied'],1)
        self.assertEqual(s.roadmap[4],'P4')

    def test_unlisted_p_identity_is_rejected(self):
        s=Session();row=event(eid='6ade0000000000000000000000000000-20261025-002')
        self.assertEqual(self.run_request(s,row)['invalid'],1)
        self.assertEqual(s.calls,[])

    def test_other_role_cannot_curate(self):
        s=Session();r=self.run_request(s,event(role='S1'))
        self.assertEqual(r['invalid'],1);self.assertEqual(s.calls,[])

    def test_canonical_identity_fields_cannot_be_changed(self):
        for field in ('item','titulo','permissions','task_id'):
            with self.subTest(field=field),self.assertRaises(c.CurationError):c.parse(event(field=field))

    def test_no_unsupported_promotion(self):
        for state in ('READY','RUNNING','CONFIRMED','SURVIVED','DONE_REVIEWED'):
            with self.subTest(state=state),self.assertRaises(c.CurationError):c.parse(event(field='status',value=state))

    def test_duplicate_json_keys_rejected(self):
        row=event();row[3]=c.PREFIX+'{"op":"roadmap.set","op":"run"}'
        with self.assertRaises(c.CurationError):c.parse(row)

    def test_no_formula_execution(self):
        s=Session();r=self.run_request(s,event(field='proximo_teste',value='=IMPORTDATA("example")'))
        self.assertEqual(r['applied'],1)
        self.assertEqual(s.calls[0]['requests'][1]['updateCells']['rows'][0]['values'][0],{'userEnteredValue':{'stringValue':'=IMPORTDATA("example")'}})

    def test_manual_canary_cannot_change_science_or_priority(self):
        s=Session();row=event(value='P5',eid=c.CANARY,role='INTERATIVO')
        self.assertEqual(self.run_request(s,row)['applied'],1);self.assertEqual(s.roadmap,BASE)
        with self.assertRaises(c.CurationError):c.parse(event(value='P4',eid=c.CANARY,role='INTERATIVO'))

    def test_existing_history_is_retained_in_atomic_receipt(self):
        s=Session();s.roadmap[8]='Old scientific context. '*90
        before=s.roadmap.copy()
        row=event(field='nota',value='new',before=c.sha(before))
        self.assertEqual(self.run_request(s,row)['applied'],1)
        self.assertEqual(s.roadmap[8],'new')
        self.assertEqual(len(s.calls),1)
        saved=json.loads(list(s.mural.values())[-1][3])
        self.assertEqual(saved['b'],before[8])
        self.assertEqual(saved['h0'],c.sha(before))
        self.assertEqual(saved['h1'],c.sha(s.roadmap))

    def test_genuinely_oversized_audit_fails_without_data_loss(self):
        s=Session();s.roadmap[8]='Old context. '*5000
        before=s.roadmap.copy()
        row=event(field='nota',value='new',before=c.sha(before))
        self.assertEqual(self.run_request(s,row)['invalid'],1)
        self.assertEqual(s.calls,[])
        self.assertEqual(s.roadmap,before)

    def test_real_cell_bound_allows_previous_long_history(self):
        s=Session();s.roadmap[8]='Old context. '*3500
        before=s.roadmap.copy()
        row=event(field='nota',value='new',before=c.sha(before))
        self.assertEqual(self.run_request(s,row)['applied'],1)
        self.assertEqual(s.roadmap[8],'new')
        saved=json.loads(list(s.mural.values())[-1][3])
        self.assertEqual(saved['b'],before[8])

    def test_roadmap_accepts_long_explanatory_text(self):
        s=Session();value='Detalhe cientifico conservado, sem remover informacao. '*15
        self.assertGreater(len(value),350)
        self.assertEqual(self.run_request(s,event(field='proximo_teste',value=value))['applied'],1)
        self.assertEqual(s.roadmap[5],value)

    def test_summary_fields_keep_long_text(self):
        s=Session();row=event();values=[row[0],'E1',BASE[0],
            'Diagnostico '+('evidencia independente '*50),
            'Limites '+('sem promocao de claim '*60),'RESULTADOS!900']
        row[3]=c.PREFIX+c.compact({'op':'resumo.append','row':values})
        self.assertEqual(self.run_request(s,row)['applied'],1)
        self.assertEqual(s.summary,[values])

    def test_legacy_claim_with_target_changed_is_not_replayed(self):
        s=Session();row=event();request=c.parse(row)
        claim=c.audit(row,'claimed',c.compact({'r':row[7],'h':c.sha(request)}))
        s.mural[claim['stable_id']]=tuple(claim['values'])
        s.roadmap[4]='P4'
        r=self.run_request(s,row)
        self.assertEqual(r['unresolved'],1)
        self.assertEqual(s.roadmap[4],'P4')
        self.assertEqual(s.calls,[])

    def test_summary_append_and_idempotence(self):
        s=Session();row=event();values=[row[0],'OPS',BASE[0],'Changed','No science','existing reference']
        row[3]=c.PREFIX+c.compact({'op':'resumo.append','row':values})
        r=self.run_request(s,row);self.assertEqual(r['applied'],1);self.assertEqual(s.summary,[values])
        self.assertEqual(self.run_request(s,row)['already_applied'],1);self.assertEqual(len(s.summary),1)

    def test_claimed_items_do_not_consume_mutation_budget(self):
        rows=[event(eid=c.ROLE_ID+'-'+str(i)) for i in range(8)]
        states=iter(['unresolved']*7+['applied'])
        with patch.object(c,'process_one',side_effect=lambda *a,**k:next(states)):
            r=c.run(None,rows,apply=True)
        self.assertEqual(r['applied'],1);self.assertEqual(r['unresolved'],7)

    def test_throughput_24_per_cycle(self):
        s=Session()
        rows=[event(eid=c.ROLE_ID+'-batch-'+str(i)) for i in range(25)]
        with patch.object(c,'process_one',side_effect=lambda *args,**kwargs:'applied'):
            counts=c.run(s,rows,apply=True)
        self.assertEqual(counts['applied'],24)
        self.assertEqual(counts['deferred'],1)

    def test_curation_errors_are_reported_as_partial(self):
        for key in ('curation_invalid','curation_unresolved','curation_conflict'):
            self.assertEqual(w.result_status({key:1},True),'PARTIAL_RECONCILIATION')

if __name__=='__main__':unittest.main()
