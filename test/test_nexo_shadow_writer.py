"""Unit tests for legacy and plain-text SHADOW writer ingress."""
import base64
import json
import unittest
from scripts import nexo_shadow_writer as w

ID = "S2-SHADOW-WRITER-TEST-20261020"

def encode(tab="MURAL", text="NO_OP"):
    values = (["2026-10-20T15:30:40-03:00","S2","P",text,"RESULTADOS!223","BLOQUEIO","",ID]
      if tab == "MURAL" else ["2026-10-20T15:30:40-03:00","S2","R3-3.1",ID,text,"QA","0","BIND","ROADMAP!17","RESULTADOS!223"])
    d = {"contract":"NEXO_SHADOW_ROW_V1","stable_id":ID,"tab":tab,"values":values}
    return base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip("=")

def plain(tab="MURAL", text="NO_OP", state=""):
    values = (["2026-10-20T15:30:40-03:00","S2","P",text,"RESULTADOS!223","BLOQUEIO","",ID]
      if tab == "MURAL" else ["2026-10-20T15:30:40-03:00","S2","R3-3.1",ID,text,"QA","0","BIND","ROADMAP!17","RESULTADOS!223"])
    return [ID,"2026-10-20T15:30:40-03:00","S2",tab,*values,*[""]*(10-len(values)),state]

class TestWriter(unittest.TestCase):
    def test_valid_legacy_mural(self):
        d=w.decode(ID,encode())
        self.assertEqual(w.append_request(d)["requests"][0]["appendCells"]["sheetId"],1148777660)

    def test_valid_legacy_resultados(self):
        d=w.decode(ID,encode("RESULTADOS"))
        self.assertEqual(w.append_request(d)["requests"][0]["appendCells"]["sheetId"],247327396)

    def test_plain_mural(self):
        d,state=w.decode_plain(plain())
        self.assertEqual(state,"")
        self.assertEqual(d["stable_id"],ID)
        self.assertEqual(len(d["values"]),8)

    def test_plain_resultados(self):
        d,state=w.decode_plain(plain("RESULTADOS"))
        self.assertEqual(state,"")
        self.assertEqual(len(d["values"]),10)
        self.assertEqual(d["values"][3],ID)

    def test_plain_state(self):
        d,state=w.decode_plain(plain(state="CLAIMED:abcd"))
        self.assertEqual(d["tab"],"MURAL")
        self.assertEqual(state,"CLAIMED:abcd")

    def test_plain_trailing_rejected(self):
        row=plain()
        row[12]="unexpected"
        with self.assertRaises(ValueError):
            w.decode_plain(row)

    def test_large_target_append_is_allowed(self):
        for size in (2500, 5000, 10000):
            with self.subTest(size=size):
                request = w.append_request(w.decode(ID, encode(text="x" * size)))
                row = request["requests"][0]["appendCells"]["rows"][0]["values"]
                self.assertIn("x" * size, [cell["userEnteredValue"]["stringValue"] for cell in row])

    def test_legacy_non_shadow_skipped(self):
        b=base64.urlsafe_b64encode(b'{"contract":"NEXO_TOWER_LIVE_V1"}').decode()
        self.assertIsNone(w.decode(ID,b))

    def test_wrong_tab_legacy(self):
        raw=encode()
        d=json.loads(base64.urlsafe_b64decode(raw+"="*(-len(raw)%4)))
        d["tab"]="LOG_CIENTISTA"
        b=base64.urlsafe_b64encode(json.dumps(d).encode()).decode()
        with self.assertRaises(ValueError):
            w.decode(ID,b)

    def test_wrong_tab_plain(self):
        row=plain()
        row[3]="LOG_CIENTISTA"
        with self.assertRaises(ValueError):
            w.decode_plain(row)

    def test_digest_stable(self):
        a,_=w.decode_plain(plain())
        b,_=w.decode_plain(plain())
        self.assertEqual(w.digest_for(a),w.digest_for(b))


from unittest.mock import patch

def _recovery_data(key='event-one', text='unchanged'):
    return {'stable_id':key, 'tab':'MURAL',
            'values':['2026-10-21T09:00:00Z','S1','P',text,'','TEST','',key]}


def _recovery_plain(d, state=''):
    return [d['stable_id'],d['values'][0],d['values'][1],d['tab'],*d['values'],'','',state]


class Response:
    def raise_for_status(self):
        pass


class Session:
    def __init__(self, records=None, fail_after_append=False):
        self.records = records or {'MURAL':{},'RESULTADOS':{}}
        self.marks = []
        self.posts = []
        self.fail_after_append = fail_after_append
    def post(self, url, *, json, timeout):
        self.posts.append(json)
        request=json['requests'][0]['appendCells']
        tab=next(k for k,v in w.TABS.items() if v[0]==request['sheetId'])
        row=[v['userEnteredValue']['stringValue'] for v in request['rows'][0]['values']]
        key=row[7 if tab=='MURAL' else 3]
        self.records[tab][key]=tuple(row)
        if self.fail_after_append:
            raise TimeoutError('simulated ambiguous transport')
        return Response()


class Recovery(unittest.TestCase):
    def invoke(self, rows, *, records=None, apply=True, fail=False, legacy=None):
        session=Session(records,fail)
        sources={w.PLAIN_TAB:[(1,w.PLAIN_HEADER),*[(i+2,r) for i,r in enumerate(rows)]],
                 w.LEGACY_TAB:[(1,['stable_id','created_at','role','envelope_b64url'])]+(legacy or [])}
        with patch.object(w,'page_rows',side_effect=lambda s,sh,tab,col,first=1:iter(sources[tab])), \
             patch.object(w,'target_index',side_effect=lambda s,tab:dict(s.records[tab])), \
             patch.object(w,'mark',side_effect=lambda s,tab,col,n,value:s.marks.append((n,value))):
            result=w.run(session,apply=apply)
        return result, session

    def test_fresh_event_written_and_marked(self):
        d=_recovery_data(); counts,s=self.invoke([_recovery_plain(d)])
        self.assertEqual(counts['written'],1); self.assertEqual(len(s.posts),1)
        self.assertEqual(s.marks,[(2,'CLAIMED:'+w.digest_for(d)),(2,'APPLIED:'+w.digest_for(d))])

    def test_existing_event_reconciles_without_append(self):
        d=_recovery_data(); counts,s=self.invoke([_recovery_plain(d)],records={'MURAL':{d['stable_id']:tuple(d['values'])},'RESULTADOS':{}})
        self.assertEqual(counts['reconciled'],1); self.assertEqual(s.posts,[])
        self.assertEqual(s.marks,[(2,'APPLIED:'+w.digest_for(d))])

    def test_claimed_missing_target_never_retried(self):
        d=_recovery_data(); counts,s=self.invoke([_recovery_plain(d,'CLAIMED:'+w.digest_for(d))])
        self.assertEqual(counts['unresolved'],1); self.assertEqual(s.posts,[]); self.assertEqual(s.marks,[])

    def test_claimed_present_target_recovers(self):
        d=_recovery_data(); counts,s=self.invoke([_recovery_plain(d,'CLAIMED:'+w.digest_for(d))],records={'MURAL':{d['stable_id']:tuple(d['values'])},'RESULTADOS':{}})
        self.assertEqual(counts['reconciled'],1); self.assertEqual(s.posts,[])

    def test_applied_missing_target_isolated_not_replayed(self):
        a=_recovery_data(); b=_recovery_data('event-two'); counts,s=self.invoke([_recovery_plain(a,'APPLIED:'+w.digest_for(a)),_recovery_plain(b)])
        self.assertEqual(counts['unresolved'],1); self.assertEqual(counts['written'],1)
        self.assertNotIn(a['stable_id'],s.records['MURAL'])

    def test_spool_collision_quarantines_both_before_any_write(self):
        a=_recovery_data(text='first'); b=_recovery_data(text='different'); c=_recovery_data('event-independent')
        counts,s=self.invoke([_recovery_plain(a),_recovery_plain(b),_recovery_plain(c)])
        self.assertEqual(counts['conflict'],2); self.assertEqual(counts['written'],1)
        self.assertNotIn(a['stable_id'],s.records['MURAL'])

    def test_target_content_conflict_does_not_stop_other_identity(self):
        a=_recovery_data(); b=_recovery_data('event-independent'); other=_recovery_data(text='prior')
        counts,s=self.invoke([_recovery_plain(a),_recovery_plain(b)],records={'MURAL':{a['stable_id']:tuple(other['values'])},'RESULTADOS':{}})
        self.assertEqual(counts['conflict'],1); self.assertEqual(counts['written'],1)
        self.assertEqual(s.records['MURAL'][a['stable_id']],tuple(other['values']))

    def test_same_spool_payload_is_not_executed_twice(self):
        a=_recovery_data(); counts,s=self.invoke([_recovery_plain(a),_recovery_plain(a)])
        self.assertEqual(counts['written'],1); self.assertEqual(counts['duplicate'],1)
        self.assertEqual(len(s.posts),1)

    def test_invalid_marker_does_not_get_erased(self):
        d=_recovery_data(); counts,s=self.invoke([_recovery_plain(d,'APPLIED:wrong')])
        self.assertEqual(counts['quarantined'],1); self.assertEqual(s.marks,[])

    def test_timeout_does_not_trigger_second_request(self):
        s=Session(fail_after_append=True); d=_recovery_data(); stored={'MURAL':{},'RESULTADOS':{}}
        counts={k:0 for k in ['eligible','written','invalid','duplicate','attempted_before','reconciled','unresolved','conflict','quarantined']}
        with patch.object(w,'mark',side_effect=lambda s,t,c,n,v:s.marks.append((n,v))):
            with self.assertRaises(TimeoutError):
                w._process(s,stored,{},counts,number=2,data=d,state='',digest=w.digest_for(d),mark_tab=w.PLAIN_TAB,mark_column='O',apply=True)
        self.assertEqual(len(s.posts),1); self.assertEqual(len(s.marks),1)

    def test_preflight_is_read_only(self):
        counts,s=self.invoke([_recovery_plain(_recovery_data())],apply=False)
        self.assertEqual(counts['eligible'],1); self.assertEqual(s.posts,[]); self.assertEqual(s.marks,[])

    def test_invalid_row_keeps_other_work_running(self):
        invalid=_recovery_plain(_recovery_data()); invalid[12]='stray'
        counts,s=self.invoke([invalid,_recovery_plain(_recovery_data('event-good'))])
        self.assertEqual(counts['invalid'],1); self.assertEqual(counts['written'],1)
        self.assertEqual(w.result_status(counts,True),'PARTIAL_RECONCILIATION')

    def test_extra_columns_are_rejected(self):
        with self.assertRaises(ValueError): w.decode_plain(_recovery_plain(_recovery_data())+['unseen'])

    def test_metadata_must_be_text(self):
        for col in (0,1,2,3,14):
            row=_recovery_plain(_recovery_data()); row[col]=7
            with self.subTest(column=col), self.assertRaises(ValueError): w.decode_plain(row)

    def test_identical_target_duplicates_are_not_global_failure(self):
        d=_recovery_data()
        with patch.object(w,'page_rows',return_value=iter([(2,d['values']),(3,d['values'])])):
            idx=w.target_index(None,'MURAL')
        self.assertEqual(idx[d['stable_id']],tuple(d['values']))

    def test_differing_target_duplicates_are_isolated(self):
        a=_recovery_data(); b=_recovery_data(text='different'); c=_recovery_data('event-other')
        with patch.object(w,'page_rows',return_value=iter([(2,a['values']),(3,b['values']),(4,c['values'])])):
            idx=w.target_index(None,'MURAL')
        self.assertIn(a['stable_id'],idx.conflicts)
        self.assertTrue(w.match_target(idx,c))
        with self.assertRaises(w.IdentityConflict): w.match_target(idx,a)

    def test_only_clean_result_is_readback_verified(self):
        clean={k:0 for k in ['invalid','unresolved','quarantined','conflict']}
        self.assertEqual(w.result_status(clean,True),'READBACK_VERIFIED')
        self.assertEqual(w.result_status(clean,False),'PREFLIGHT')
        for key in clean:
            with self.subTest(key=key):
                self.assertEqual(w.result_status(dict(clean,**{key:1}),True),'PARTIAL_RECONCILIATION')

    def test_empty_duplicate_cannot_replay_later_claimed_record(self):
        d=_recovery_data(); counts,s=self.invoke([_recovery_plain(d),_recovery_plain(d,'CLAIMED:'+w.digest_for(d))])
        self.assertEqual(s.posts,[]); self.assertEqual(counts['unresolved'],1)

    def test_empty_duplicate_cannot_replay_later_applied_record(self):
        d=_recovery_data(); counts,s=self.invoke([_recovery_plain(d),_recovery_plain(d,'APPLIED:'+w.digest_for(d))])
        self.assertEqual(s.posts,[]); self.assertEqual(counts['unresolved'],1)

    def test_invalid_state_quarantines_equal_fresh_duplicate(self):
        d=_recovery_data(); counts,s=self.invoke([_recovery_plain(d),_recovery_plain(d,'UNKNOWN')])
        self.assertEqual(s.posts,[]); self.assertEqual(counts['quarantined'],2)

    def test_invalid_record_quarantines_same_identity(self):
        d=_recovery_data(); bad=_recovery_plain(d); bad[12]='unexpected'
        counts,s=self.invoke([_recovery_plain(d),bad,_recovery_plain(_recovery_data('unrelated-event'))])
        self.assertNotIn(d['stable_id'],s.records['MURAL'])
        self.assertEqual(counts['written'],1)

    def test_diagnostic_does_not_leak_exception_text(self):
        self.assertEqual(w.safe_error_code(RuntimeError('token=private-secret')),'UNCLASSIFIED')
        self.assertEqual(w.safe_error_code(RuntimeError('SPOOL_HEADER_MISSING')),'SPOOL_HEADER_MISSING')

    def test_1000_row_page_needs_only_one_values_read(self):
        calls=[]
        with patch.object(w,'grid_row_count',return_value=1000), \
             patch.object(w,'values',side_effect=lambda session,sheet,rng: calls.append(rng) or []):
            self.assertEqual(list(w.page_rows(None,w.SHADOW,'MURAL','H')),[])
        self.assertEqual(calls,["'MURAL'!A1:H1000"])

    def test_429_retry_is_only_for_safe_get(self):
        class ReadResponse:
            def __init__(self,status):
                self.status_code=status
            def raise_for_status(self):
                if self.status_code!=200:
                    raise RuntimeError('unexpected read failure')
        class FakeSession:
            def __init__(self):
                self.calls=0
            def get(self,url,**kwargs):
                self.calls+=1
                return ReadResponse(429 if self.calls < 3 else 200)
        session=FakeSession()
        with patch.object(w.time,'sleep') as sleep:
            response=w.safe_get(session,'https://sheets.googleapis.com/test',timeout=60)
        self.assertEqual(response.status_code,200)
        self.assertEqual(session.calls,3)
        self.assertEqual(sleep.call_count,2)

    def test_http_status_without_private_exception_details(self):
        class HTTPError(Exception):
            pass
        error=HTTPError('sensitive_request_url token=secret')
        error.response=type('Resp',(),{'status_code':429})()
        self.assertEqual(w.safe_error_code(error),'HTTP_429')
        self.assertNotIn('secret',w.safe_error_code(error))

    def test_applied_curation_skips_redundant_resumo_scan(self):
        from scripts import nexo_shadow_curation as c
        request={'op':'resumo.append','row':['2026-10-21 16:57','E1','CORE4_TEST_WAVE_3','sum','impact','link']}
        event_id=c.ROLE_ID+'-20261021T1657-0300-test'
        row=['2026-10-21 16:57','P','WRITER',c.PREFIX+json.dumps(request),
             '','PEDIDO_CURADORIA','CORE4_TEST_WAVE_3',event_id]
        receipt_id=c.audit(row,'applied','')['stable_id']
        saved=(row[0],'WRITER','P',json.dumps({'r':event_id,'h':c.sha(request)}),
               '','APPLIED',row[6],receipt_id)
        with patch.object(c.w,'target_index',return_value={receipt_id:saved}), \
             patch.object(c,'read_rows',side_effect=AssertionError('redundant read')):
            self.assertEqual(c.process_one(None,row,request,apply=True),'already_applied')


    def _curation_summary_fixture(self, reserved=False, existing=False):
        from scripts import nexo_shadow_curation as c
        request={'op':'resumo.append','row':[
            '2026-10-21 16:57','E1','CORE4_TEST_WAVE_3',
            'Verified scientific summary','No promotion','RESULTADOS!307:342']}
        event_id=c.ROLE_ID+'-20261021T1657-0300-recovery-test'
        row=['2026-10-21 16:57','P','WRITER',
             c.PREFIX+json.dumps(request,ensure_ascii=False),
             '','PEDIDO_CURADORIA','CORE4_TEST_WAVE_3',event_id]
        claim=c.audit(row,'claimed',c.compact({'r':event_id,'h':c.sha(request)}))
        mural={claim['stable_id']:tuple(claim['values'])} if reserved else {}
        summaries=[request['row']] if existing else []
        written=[]
        def fake_post(session, batch):
            written.append(batch)
            for command in batch:
                if 'appendCells' not in command:
                    continue
                append=command['appendCells']
                value=[v['userEnteredValue']['stringValue']
                       for v in append['rows'][0]['values']]
                if append['sheetId']==c.RESUMO_ID:
                    summaries.append(value)
                elif append['sheetId']==c.w.TABS['MURAL'][0]:
                    mural[value[7]]=tuple(value)
        def fake_read_rows(session, tab, header):
            if tab!='RESUMO':
                raise AssertionError('Unexpected table read')
            return [(i+2,v) for i,v in enumerate(summaries)]
        with patch.object(c,'post',side_effect=fake_post), \
             patch.object(c,'read_rows',side_effect=fake_read_rows), \
             patch.object(c.w,'target_index',side_effect=lambda s,t:dict(mural)):
            first=c.process_one(None,row,request,apply=True,index=mural)
            second=c.process_one(None,row,request,apply=True,index=mural)
        return c,first,second,written,summaries,mural

    def test_curation_new_summary_is_single_atomic_batch(self):
        c,first,second,batches,summaries,mural=self._curation_summary_fixture()
        self.assertEqual((first,second),('applied','already_applied'))
        self.assertEqual(len(batches),1)
        self.assertEqual(len(batches[0]),3)
        self.assertEqual(
            [x['appendCells']['sheetId'] if 'appendCells' in x else None
             for x in batches[0]],
            [c.w.TABS['MURAL'][0],c.RESUMO_ID,c.w.TABS['MURAL'][0]])
        self.assertEqual(len(summaries),1)

    def test_curation_legacy_claim_recovers_once(self):
        c,first,second,batches,summaries,mural=self._curation_summary_fixture(reserved=True)
        self.assertEqual((first,second),('applied','already_applied'))
        self.assertEqual(len(batches),1)
        self.assertEqual(len(batches[0]),2)
        self.assertEqual(len(summaries),1)
        self.assertIn('APPLIED',[v[5] for v in mural.values()])

    def test_curation_claim_with_existing_summary_does_not_replay(self):
        _,first,second,batches,summaries,_=self._curation_summary_fixture(
            reserved=True, existing=True)
        self.assertEqual((first,second),('unresolved','unresolved'))
        self.assertEqual(batches,[])
        self.assertEqual(len(summaries),1)


if __name__ == "__main__":
    unittest.main()
