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
        if self.fail_after_apply and len(self.calls)==2:raise TimeoutError('ambiguous')
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
        self.assertEqual(len(s.calls),2)
        change=s.calls[1]['requests'];self.assertEqual(len(change),2)
        saved=json.loads(list(s.mural.values())[-1][3])
        self.assertEqual((saved['b'],saved['a']),('P5','P4'))
        self.assertEqual(saved['h0'],c.sha(BASE));self.assertEqual(saved['h1'],c.sha(s.roadmap))

    def test_replay_after_later_edit_does_not_restore_old_target(self):
        s=Session();row=event();self.run_request(s,row);s.roadmap[4]='P2'
        r=self.run_request(s,row)
        self.assertEqual(r['already_applied'],1);self.assertEqual(s.roadmap[4],'P2');self.assertEqual(len(s.calls),2)

    def test_stale_precondition_has_no_side_effects(self):
        s=Session();s.roadmap[5]='Concurrent edit';r=self.run_request(s,event())
        self.assertEqual(r['conflict'],1);self.assertEqual(s.calls,[])

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
        self.assertEqual(r['already_applied'],1);self.assertEqual(len(s.calls),2)

    def test_preflight_is_read_only(self):
        s=Session();r=self.run_request(s,event(),False)
        self.assertEqual(r['eligible'],1);self.assertEqual(s.calls,[])

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
        self.assertEqual(s.calls[1]['requests'][0]['updateCells']['rows'][0]['values'][0],{'userEnteredValue':{'stringValue':'=IMPORTDATA("example")'}})

    def test_manual_canary_cannot_change_science_or_priority(self):
        s=Session();row=event(value='P5',eid=c.CANARY,role='INTERATIVO')
        self.assertEqual(self.run_request(s,row)['applied'],1);self.assertEqual(s.roadmap,BASE)
        with self.assertRaises(c.CurationError):c.parse(event(value='P4',eid=c.CANARY,role='INTERATIVO'))

    def test_oversized_history_is_not_discarded(self):
        s=Session();s.roadmap[8]='Old scientific context. '*90
        row=event(field='nota',value='new',before=c.sha(s.roadmap))
        # The legacy append limit rejects the audit before any mutation.
        self.assertEqual(self.run_request(s,row)['invalid'],1)
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

    def test_curation_errors_are_reported_as_partial(self):
        for key in ('curation_invalid','curation_unresolved','curation_conflict'):
            self.assertEqual(w.result_status({key:1},True),'PARTIAL_RECONCILIATION')

if __name__=='__main__':unittest.main()
