import datetime as dt
import json
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

    def test_private_local_receipt_alias_preserves_all_shape_checks(self):
        receipt={'run_id':'fixture-run','runtime':'local_private_sandbox','class':'E1',
                 'script_sha256':'a'*64,'output_sha256':'b'*64,'input_hashes':{'fixture':'c'*64}}
        row=['date','S1','item','event-1','E1','','1','limit','','https://example.org/artifact']
        def check(value):
            return o.executor_receipt(row[:5]+[json.dumps({'EXECUTOR_RECEIPT_V1':value})]+row[6:])
        for runtime in ('local_private_sandbox','local_sandbox','github_actions'):
            with self.subTest(runtime=runtime):
                self.assertTrue(check(dict(receipt,runtime=runtime)))
        for field,value in [('run_id',''),('runtime','private_unverified_backend'),('class','QA'),
                            ('script_sha256','guessed'),('output_sha256','wrong'),
                            ('input_hashes',{}),('input_hashes',{'fixture':'bad'})]:
            with self.subTest(field=field,value=value):
                self.assertFalse(check(dict(receipt,**{field:value})))

    def test_bounded_navigation_keeps_total_and_source(self):
        data={f'id-{i}':['date','S1','item',f'id-{i}','QA','m','0','l','',''] for i in range(10000)}
        v=self.views(results=data)
        self.assertEqual(len(v['EXECUCOES']),501)
        self.assertEqual(dict((r[0],r[2]) for r in v['AUTONOMIA'][1:])['results_records'],'10000')
        self.assertEqual(v['EXECUCOES'][-1][0],'id-9999')

    def checkpoint_fixture(self, pending_ids, date='2026-10-28T10:00:00-03:00', suffix='1'):
        task='a'*32
        key=task+'-checkpoint-'+suffix
        cp={'task_id':task,'run_id':'scheduler-run-'+suffix,'mural_row':10,'result_row':20,
            'pending_ids':pending_ids,'next_action':'READY_NOW legacy science'}
        row=[date,'S1','P','NEXO_CHECKPOINT_V1 '+json.dumps(cp),'','CHECKPOINT','item',key]
        return task,key,row

    def test_checkpoint_pending_requires_exact_target_and_applied(self):
        task,key,cp=self.checkpoint_fixture(['event-1'])
        data={'tab':'RESULTADOS','stable_id':'event-1',
              'values':['date','S1','item','event-1','E0','method','1','limits','','artifact']}
        for state,target,resolved in [
            ('APPLIED:'+w.digest_for(data),data['values'],True),
            ('CLAIMED:'+w.digest_for(data),data['values'],False),
            ('APPLIED:wrong',data['values'],False),
            ('APPLIED:'+w.digest_for(data),None,False),
            ('APPLIED:'+w.digest_for(data),data['values'][:-1]+['other'],False),
        ]:
            with self.subTest(state=state,target=target):
                stored={'MURAL':{key:tuple(cp)},'RESULTADOS':{} if target is None else {'event-1':tuple(target)}}
                pending=[{'data':data,'state':state,'digest':w.digest_for(data),
                          'mark_tab':w.PLAIN_TAB,'mark_column':'O','number':2}]
                views=o.build_views(stored,pending,{},now=self.now,roster={task:'S1'})
                self.assertEqual(json.loads(views['CHECKPOINTS'][1][5]),[] if resolved else ['event-1'])
                self.assertEqual(json.loads(cp[3].split(' ',1)[1])['pending_ids'],['event-1'])

    def test_target_conflict_cannot_resolve_checkpoint_pending(self):
        data={'tab':'MURAL','stable_id':'event-1','values':['date','S1','P','text','','TEST','','event-1']}
        target=w.TargetIndex();target['event-1']=tuple(data['values']);target.conflicts.add('event-1')
        pending=[{'data':data,'state':'APPLIED:'+w.digest_for(data)}]
        self.assertEqual(o.confirmed_event_ids({'MURAL':target},pending),set())

    def test_conflicting_spool_variant_cannot_resolve_checkpoint_pending(self):
        data={'tab':'MURAL','stable_id':'event-1','values':['date','S1','P','text','','TEST','','event-1']}
        changed={**data,'values':data['values'][:3]+['other']+data['values'][4:]}
        stored={'MURAL':{'event-1':tuple(data['values'])}}
        pending=[{'data':data,'state':'APPLIED:'+w.digest_for(data)},{'data':changed,'state':''}]
        self.assertEqual(o.confirmed_event_ids(stored,pending),set())
        pending[1]['state']='INVALID:TARGET_CONTENT_VARIANT_ALREADY_PRESENT'
        self.assertEqual(o.confirmed_event_ids(stored,pending),{'event-1'})

    def test_delayed_older_checkpoint_does_not_replace_current(self):
        task,new_key,new=self.checkpoint_fixture([],suffix='new')
        _,old_key,old=self.checkpoint_fixture(['pending'],'2026-10-27T10:00:00-03:00','old')
        v=self.views(mural={new_key:new,old_key:old},roster={task:'S1'})
        self.assertEqual(v['CHECKPOINTS'][1][7],new_key)

    def test_persisted_question_does_not_return_as_ready_and_next_question_is_visible(self):
        from scripts.tests.test_nexo_scientific_state import event,envelope,stored,identity,NOW
        from scripts import nexo_scientific_state as science
        task,key,cp=self.checkpoint_fixture(['result-001'])
        first=envelope(event(key='question-first'))
        result=envelope(event('CALCULATED',key='result-001'),'RESULTADOS')
        next_identity=identity('different-estimand')
        next_identity['estimand']='variance'
        next_question=envelope(event(key='question-next',science=next_identity))
        source=stored(first,result,next_question);source['MURAL'][key]=tuple(cp)
        pending=[{'data':result,'state':'APPLIED:'+w.digest_for(result),
                  'mark_tab':w.PLAIN_TAB,'mark_column':'O','number':2}]
        views=o.build_views(source,pending,{},now=NOW,roster={task:'S1'})
        projected=views['CHECKPOINTS'][1]
        self.assertEqual(projected[5],'[]')
        self.assertIn(science.scientific_id(next_identity),projected[6])
        self.assertNotIn('READY_NOW',projected[6])
        metrics={r[0]:r[2] for r in views['AUTONOMIA'][1:]}
        self.assertEqual(metrics['distinct_quantitative_questions'],'1')
        self.assertEqual(metrics['scientific_eligible_questions'],'1')
        self.assertEqual(metrics['scientific_results_persisted'],'1')
        self.assertEqual(len(views['EXECUCOES']),3)
        self.assertTrue(all(len(row)==8 for rows in views.values() for row in rows))
        self.assertIn('READY_NOW',cp[3])

    def test_calculation_awaiting_transport_is_visible_and_never_recomputed(self):
        from scripts.tests.test_nexo_scientific_state import event,envelope,stored,NOW
        task,key,cp=self.checkpoint_fixture(['result-001'])
        result=envelope(event('CALCULATED',key='result-001'),'RESULTADOS')
        source=stored(envelope(event()));source['MURAL'][key]=tuple(cp)
        pending=[{'data':result,'state':'CLAIMED:'+w.digest_for(result),
                  'mark_tab':w.PLAIN_TAB,'mark_column':'O','number':2}]
        views=o.build_views(source,pending,{},now=NOW,roster={task:'S1'})
        self.assertTrue(views['CHECKPOINTS'][1][6].startswith('PERSIST existing calculation'))
        self.assertEqual(json.loads(views['CHECKPOINTS'][1][5]),['result-001'])
        metrics={r[0]:r[2] for r in views['AUTONOMIA'][1:]}
        self.assertEqual(metrics['scientific_eligible_questions'],'0')
        self.assertEqual(metrics['scientific_calculations_pending'],'1')
        self.assertEqual(metrics['scientific_results_persisted'],'0')

    def test_closing_question_preserves_result_persistence_metrics(self):
        from scripts.tests.test_nexo_scientific_state import event,envelope,stored,NOW
        result=envelope(event('CALCULATED',key='result-001'),'RESULTADOS')
        closed=envelope(event('CLOSED',key='close-001',reason='answered conditionally',evidence='result-001'))
        views=o.build_views(stored(result,closed),[],{},now=NOW)
        metrics={r[0]:r[2] for r in views['AUTONOMIA'][1:]}
        self.assertEqual(metrics['scientific_results_persisted'],'1')
        self.assertEqual(metrics['distinct_quantitative_questions'],'1')

    def test_new_result_requires_metadata(self):
        d={'tab':'RESULTADOS','stable_id':'event-1','values':['','S1','item','event-1','E0','m','0','l','','']}
        with self.assertRaisesRegex(ValueError,'MISSING_EVENT_METADATA'):w.validate_new_event(d)

    def test_recent_checkpoint_with_missing_optional_hints_is_visible(self):
        task = 'a' * 32
        cp = {'schema':'NEXO_CHECKPOINT_V1', 'task_id':task, 'run_id':'new-run'}
        key = task+'-new'
        row = ['2026-01-10T12:00:00Z','S7','P',
               'NEXO_CHECKPOINT_V1 '+json.dumps(cp),'','CHECKPOINT','S7',key]
        v = self.views(mural={key:row},roster={task:'S7'})
        self.assertEqual(v['CHECKPOINTS'][1][:5], [task,'new-run',row[0],'',''])
        self.assertEqual(v['CHECKPOINTS'][1][7],key)

    def test_real_cell_limit_counts_utf16(self):
        d={'tab':'MURAL','stable_id':'event-1','values':['date','P','P','😀'*25001,'','TEST','','event-1']}
        with self.assertRaisesRegex(ValueError,'CELL_PLATFORM_LIMIT'):w.validate_new_event(d)
        d['values'][3]='x'*10000
        w.validate_new_event(d)

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
