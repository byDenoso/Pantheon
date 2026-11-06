import datetime as dt
import unittest
from unittest.mock import patch
from scripts import nexo_tower_operations as o
from scripts import nexo_shadow_writer as w
from scripts import nexo_shadow_curation as c

class OperationsTests(unittest.TestCase):
    def setUp(self):
        self.now=dt.datetime(2026,10,28,12,tzinfo=dt.timezone(dt.timedelta(hours=-3)))

    def views(self, results=None, mural=None, **kw):
        return o.build_views({'MURAL':mural or {},'RESULTADOS':results or {}},[],{},now=self.now,**kw)

    def test_empty_state_is_not_fabricated_science(self):
        v=self.views()
        rows={r[0]:r for r in v['AUTONOMIA'][1:]}
        self.assertEqual(rows['results_records'][2],'0')
        self.assertEqual(rows['remote_dispatch'][1],'NOT_CERTIFIED_BY_WRITER')

    def test_naive_clock_rejected(self):
        with self.assertRaises(ValueError):
            o.build_views({},[],{},now=dt.datetime(2026,1,1))

    def test_week_and_year_rollover(self):
        self.assertEqual(o.period_key('WEEKLY',dt.datetime(2027,1,1)),'2026-W53')
        self.assertEqual(o.period_key('YEARLY',dt.datetime(2027,1,1)),'2027')
        self.assertEqual(o.period_key('QUARTERLY',dt.datetime(2026,12,31)),'2026-Q4')
        self.assertEqual(o.period_key('QUARTERLY',dt.datetime(2027,1,1)),'2027-Q1')

    def test_full_year_has_distinct_daily_jobs(self):
        periods={o.period_key('DAILY',self.now+dt.timedelta(days=d)) for d in range(366)}
        self.assertEqual(len(periods),366)

    def test_empty_maintenance_receipt_does_not_complete_job(self):
        r=['date','P','WRITER','NEXO_MAINTENANCE_V1 {"id":"daily-health","period":"2026-10-28","state":"VERIFIED"}',
           '', 'MANUTENCAO','daily-health','receipt-1']
        self.assertEqual(o.maintenance_rows([r],self.now)[1][3],'DUE')
        r[4]='https://example.org/private-evidence'
        self.assertEqual(o.maintenance_rows([r],self.now)[1][3],'VERIFIED_RECEIPT')
        self.assertEqual(o.maintenance_rows([r],self.now+dt.timedelta(days=1))[1][3],'DUE')

    def test_metadata_is_not_independent_execution_proof(self):
        row=['date','S1','claim','event-1','EXECUTED_E0','method','1','limited','ref','https://example.org/artifact']
        v=self.views(results={'event-1':row})
        self.assertEqual(v['EXECUCOES'][1][4],'E0')
        self.assertEqual(v['EXECUCOES'][1][5],'DECLARED_NOT_INDEPENDENTLY_VERIFIED')
        self.assertEqual(v['EXECUCOES'][1][6],'POINTER_PRESENT_NOT_REVALIDATED')

    def test_foreign_task_attribution_is_flagged(self):
        task='a'*32
        row=['date','S3|task_id='+task,'item','event-1','E0','method','1','limit','','']
        v=self.views(results={'event-1':row},roster={task:'S2'})
        self.assertEqual(v['INCIDENTES'][1][1],'PROVENANCE_CONFLICT')
        self.assertEqual(row[1],'S3|task_id='+task)

    def test_bounded_navigation_keeps_total_and_source(self):
        data={f'id-{i}':['date','S1','item',f'id-{i}','QA','m','0','l','',''] for i in range(10000)}
        v=self.views(results=data)
        self.assertEqual(len(v['EXECUCOES']),501)
        self.assertEqual(dict((r[0],r[2]) for r in v['AUTONOMIA'][1:])['results_records'],'10000')
        self.assertEqual(v['EXECUCOES'][-1][0],'id-9999')

    def test_new_result_requires_metadata(self):
        d={'tab':'RESULTADOS','stable_id':'event-1','values':['','S1','item','event-1','E0','m','0','l','','']}
        with self.assertRaisesRegex(ValueError,'MISSING_EVENT_METADATA'):w.validate_new_event(d)

    def test_real_cell_limit_counts_utf16(self):
        d={'tab':'MURAL','stable_id':'event-1','values':['date','P','P','😀'*25001,'','TEST','','event-1']}
        with self.assertRaisesRegex(ValueError,'CELL_PLATFORM_LIMIT'):w.validate_new_event(d)
        d['values'][3]='x'*10000
        w.validate_new_event(d)

    def test_writer_never_replaces_task_owned_checkpoints(self):
        views = self.views()
        self.assertNotIn('CHECKPOINTS', o.VIEW_TITLES)
        self.assertNotIn('CHECKPOINTS', views)
        existing_checkpoint = ['task_id','run_id','2026-11-06','cursor1','cursor2','','','']
        # Simulate the real metadata, including an occupied Task-owned tab.
        tab_id = 202610284
        sheets = [{'properties':{'title':title, 'sheetId':i+100,
                    'gridProperties':{'rowCount':1000,'columnCount':8}}}
                  for i,title in enumerate(o.VIEW_TITLES)]
        sheets.append({'properties':{'title':'CHECKPOINTS','sheetId':tab_id,
                       'gridProperties':{'rowCount':100,'columnCount':8}}})
        captured = []
        class Resp:
            def __init__(self, payload=None): self.payload=payload
            def json(self): return self.payload
            def raise_for_status(self): return None
        class Session:
            def post(self, url, *, json, timeout):
                captured.extend(json['requests'])
                return Resp()
        with patch.object(w,'safe_get',return_value=Resp({'sheets':sheets})), \
             patch.object(w,'values',side_effect=lambda sess, sheet, a1: views[a1.split("'")[1]]):
            self.assertEqual(o.publish_views(Session(), views, w), 'READBACK_VERIFIED')
        self.assertTrue(captured)
        self.assertTrue(all(req.get('updateCells',{}).get('range',{}).get('sheetId') != tab_id
                            for req in captured))
        self.assertEqual(existing_checkpoint[0], 'task_id')

    def test_execution_projection_uses_stable_identity_not_question(self):
        stable = 'S5-20261106T1425-JADESDR5-REDSHIFT-E0-01'
        row = ['date','S5|E0',stable,'Does this result change the conclusion?',
               'E0','method','42','scope','literature','artifact']
        views = self.views(results={stable:row})
        self.assertEqual(views['EXECUCOES'][1][0], stable)
        self.assertIn(stable, views['EXECUCOES'][1][7])
        self.assertNotEqual(views['EXECUCOES'][1][0], row[3])

    def test_projection_missing_is_no_write(self):
        class Resp:
            def json(self):return {'sheets':[]}
        class Session:
            def post(self,*a,**k):raise AssertionError('must not write')
        with patch.object(w,'safe_get',return_value=Resp()):
            with self.assertRaisesRegex(RuntimeError,'OPERATIONS_VIEW_MISSING'):
                o.publish_views(Session(),self.views(),w)

    def test_projection_write_ambiguity_never_replayed(self):
        class Resp:
            def json(self):return {'sheets':[{'properties':{'title':t,'sheetId':i,
                'gridProperties':{'rowCount':1000,'columnCount':8}}} for i,t in enumerate(o.VIEW_TITLES)]}
        class Session:
            calls=0
            def post(self,*a,**k):
                self.calls+=1
                raise TimeoutError('unknown')
        s=Session()
        with patch.object(w,'safe_get',return_value=Resp()):
            with self.assertRaises(TimeoutError):o.publish_views(s,self.views(),w)
        self.assertEqual(s.calls,1)

    def test_parse_rejection_is_durable_without_roadmap_mutation(self):
        row=['date','P | task_id='+c.CURRENT_ROLE_ID,'WRITER',c.PREFIX+'{}','','PEDIDO_CURADORIA','item',c.CURRENT_ROLE_ID+'-bad-001']
        saved={};posts=[]
        class Resp:
            def raise_for_status(self):pass
        class Session:
            def post(self,url,*,json,timeout):
                posts.append(json)
                for req in json['requests']:
                    assert 'appendCells' in req
                    cells=req['appendCells']['rows'][0]['values']
                    r=[x['userEnteredValue']['stringValue'] for x in cells]
                    saved[r[7]]=tuple(r)
                return Resp()
        with patch.object(w,'target_index',side_effect=lambda *a:dict(saved)):
            a=c.run(Session(),[row],apply=True)
            b=c.run(Session(),[row],apply=True)
        self.assertEqual(a['rejected'],1)
        self.assertEqual(b['already_rejected'],1)
        self.assertEqual(len(posts),1)
        self.assertEqual(next(iter(saved.values()))[5],'REJECTED')

if __name__=='__main__':unittest.main()
