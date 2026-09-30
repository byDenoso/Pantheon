import copy
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import unittest
import zipfile

spec=importlib.util.spec_from_file_location('collector',Path(__file__).parents[1]/'collect_execution_assessments.py')
c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)


def fixture(change=None, member_name='battery-results.json', duplicate=False):
    row={'test_id':'TEST-APPROVED','ok':True,'attempt_id':'attempt-'+'a'*32,'recipe_sha256':'b'*64,
         'result':{'verdict':'INCONCLUSIVE','decision':'INPUT_OR_FIT_UNAVAILABLE','statistics':{'data_sources':[]}}}
    if change:change(row)
    raw=json.dumps({'results':[row]}).encode();stream=io.BytesIO()
    with zipfile.ZipFile(stream,'w') as z:
        z.writestr(member_name,raw)
        if duplicate:z.writestr('unexpected.json','{}')
    archive=stream.getvalue()
    approved={'test_id':'TEST-APPROVED','battery_id':'bat-approved','run_ref':'actions/runs/123',
              'artifact_id':456,'archive_sha256':hashlib.sha256(archive).hexdigest(),
              'member_sha256':hashlib.sha256(raw).hexdigest(),'attempt_id':'attempt-'+'a'*32,
              'recipe_sha256':'b'*64,'expected_observation_hash':'c'*64,'expected_version':9}
    metadata={'id':456,'name':'battery-results','expired':False,'workflow_run':{'id':123}}
    calls=[]
    def fetch(endpoint):
        calls.append(endpoint)
        return archive if endpoint.endswith('/zip') else json.dumps(metadata).encode()
    return approved,metadata,fetch,calls


class CollectorTests(unittest.TestCase):
    def test_source_contains_original_bytes_and_measured_hashes(self):
        a,m,fetch,calls=fixture();r=c.collect_case(a,fetch)
        self.assertEqual(r['nexo_operation'],'EXECUTION_OBSERVATION_ASSESSMENT')
        self.assertNotIn('_inbox_source',r)
        s=r['assessment']['source']
        self.assertEqual(hashlib.sha256(s['member_utf8'].encode()).hexdigest(),a['member_sha256'])
        self.assertEqual(s['archive_sha256'],a['archive_sha256'])
        self.assertEqual(calls,['repos/byDenoso/Pantheon/actions/artifacts/456','repos/byDenoso/Pantheon/actions/artifacts/456/zip'])

    def test_disabled_collection_never_fetches(self):
        a,_,_,_=fixture()
        r=c.collect_approved({'contract':c.CONTRACT,'enabled':False,'cases':[a]},lambda x:self.fail('disabled fetch'))
        self.assertEqual(r,([],[]))

    def test_foreign_expired_and_wrong_artifact_metadata_fail_before_download(self):
        for field,value in [('id',457),('name','other'),('expired',True),('workflow_run',{'id':124})]:
            a,m,fetch,calls=fixture();m[field]=value
            with self.assertRaisesRegex(c.EvidenceError,'ARTIFACT_IDENTITY'):c.collect_case(a,fetch)
            self.assertEqual(len(calls),1)

    def test_archive_and_member_hash_mismatch_fail(self):
        for field in ['archive_sha256','member_sha256']:
            a,m,fetch,_=fixture();a[field]='0'*64
            with self.assertRaisesRegex(c.EvidenceError,'HASH_MISMATCH'):c.collect_case(a,fetch)

    def test_foreign_receipt_attempt_and_recipe_rejected(self):
        for field,value in [('test_id','OTHER'),('attempt_id','attempt-'+'d'*32),('recipe_sha256','e'*64)]:
            a,_,fetch,_=fixture(lambda row:row.update({field:value}))
            with self.assertRaisesRegex(c.EvidenceError,'RECEIPT_IDENTITY'):c.collect_case(a,fetch)

    def test_no_legitimate_scientific_inconclusive_is_reclassified(self):
        changes=[lambda r:r['result'].update(decision='SAMPLE_TOO_SMALL'),
                 lambda r:r['result'].update(statistics={'delta_chi2':3.0}),
                 lambda r:r['result'].update(verdict='PROMOTED'),lambda r:r.update(ok=False)]
        for change in changes:
            a,_,fetch,_=fixture(change)
            with self.assertRaisesRegex(c.EvidenceError,'NOT_APPROVED'):c.collect_case(a,fetch)

    def test_no_extraction_of_foreign_members(self):
        for name,extra in [('../battery-results.json',False),('battery-results.json',True)]:
            a,_,fetch,_=fixture(member_name=name,duplicate=extra)
            with self.assertRaisesRegex(c.EvidenceError,'MEMBERSHIP'):c.collect_case(a,fetch)

    def test_only_explicit_cases_and_errors_do_not_produce_updates(self):
        a,_,fetch,calls=fixture();a['archive_sha256']='0'*64
        updates,errors=c.collect_approved({'contract':c.CONTRACT,'enabled':True,'cases':[a]},fetch)
        self.assertEqual(updates,[]);self.assertEqual(errors,[{'test_id':'TEST-APPROVED','code':'ARCHIVE_HASH_MISMATCH'}])
        for cases in [[a,a],[a,a,a]]:
            with self.assertRaises(c.EvidenceError):c.collect_approved({'contract':c.CONTRACT,'enabled':True,'cases':cases},fetch)

    def test_reviewed_list_schema_and_existing_spool_integration(self):
        root=Path(__file__).parents[2]
        approval=json.loads((root/'nexo-control/execution-assessment-approvals.json').read_text())
        self.assertEqual(len(approval['cases']),2)
        for case in approval['cases']:c.validate_approval(case)
        workflow=(root/'.github/workflows/nexo-writer-robot.yml').read_text()
        self.assertIn('python scripts/collect_execution_assessments.py --approvals nexo-control/execution-assessment-approvals.json --updates /tmp/bat/updates.json',workflow)
        self.assertIn('NEXO_BATTERY_UPDATES: /tmp/bat/updates.json',workflow)

if __name__=='__main__':unittest.main()
