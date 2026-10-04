import importlib.util
import json
from pathlib import Path
import unittest
from urllib.error import HTTPError

spec=importlib.util.spec_from_file_location('writer_inbox',Path(__file__).parents[1]/'collect_tcc_inbox.py')
collector=importlib.util.module_from_spec(spec);spec.loader.exec_module(collector)


class InboxCollector(unittest.TestCase):
    def test_dispatch_skips_unchanged_resolved_blobs_but_retries_deferred(self):
        raw_new=b'{"id":"new"}'
        raw_deferred=b'{"id":"later"}'
        cursor={
            'blobs':{'inbox/applied.json':'blob-applied','inbox/later.json':'blob-later'},
            'acked':{'inbox/applied.json':'same-fingerprint'},
            'receipts':{'inbox/applied.json':{'fingerprint':'same-fingerprint','outcome':'APPLIED'}},
            'pending':{'inbox/later.json':{'fingerprint':'old','blob_sha':'blob-later','reason':'DEFERRED_DEPENDENCY'}},
        }
        current={'inbox/applied.json':'blob-applied','inbox/later.json':'blob-later','inbox/new.json':'blob-new'}
        reads=[]
        bodies={'blob-later':raw_deferred,'blob-new':raw_new}
        items=collector.collect_items(cursor,current,set(current),set(),
                                      lambda path,sha:(reads.append((path,sha)) or bodies[sha]),full_scan=True)
        self.assertEqual(reads,[('inbox/later.json','blob-later'),('inbox/new.json','blob-new')])
        self.assertEqual({item['path'] for item in items},{'inbox/later.json','inbox/new.json'})
        self.assertEqual(next(item for item in items if item['path']=='inbox/later.json')['envelope'],{'id':'later'})

    def test_cursor_durably_retries_deferred_and_unreported_items_after_advancing_base(self):
        cursor={'base_commit':'old','acked':{'inbox/legacy.json':'legacy-fp'}}
        mapping={'head_sha':'new','observed_blobs':{'inbox/deferred.json':'blob-d','inbox/new.json':'blob-n'},
                 'items':[
                     {'id':'applied','path':'inbox/applied.json','fingerprint':'fp-a','blob_sha':'blob-a'},
                     {'id':'deferred','path':'inbox/deferred.json','fingerprint':'fp-d','blob_sha':'blob-d'},
                     {'id':'not-reported','path':'inbox/new.json','fingerprint':'fp-n','blob_sha':'blob-n'},
                 ]}
        collector.record_cursor_outcomes(
            cursor,mapping,{'applied','deferred'},{'applied'},
            {'applied':{'outcome':'APPLIED'},'deferred':{'outcome':'DEFERRED_DEPENDENCY'}},
            '2026-10-04T00:00:00Z','tower-r1')
        self.assertEqual(cursor['base_commit'],'new')
        self.assertEqual(cursor['acked'],{})
        self.assertEqual(cursor['receipts']['inbox/legacy.json']['source'],'legacy-acked')
        self.assertNotIn('inbox/applied.json',cursor['pending'])
        self.assertEqual(cursor['pending']['inbox/deferred.json']['reason'],'DEFERRED_DEPENDENCY')
        self.assertEqual(cursor['pending']['inbox/new.json']['reason'],'NOT_REPORTED')
        self.assertEqual(cursor['blobs']['inbox/deferred.json'],'blob-d')

    def test_content_change_bypasses_old_ack_even_when_path_is_the_same(self):
        raw=b'{"id":"changed"}'
        cursor={'blobs':{'inbox/item.json':'blob-old'},'acked':{'inbox/item.json':'old-fingerprint'}}
        items=collector.collect_items(cursor,{'inbox/item.json':'blob-new'},{'inbox/item.json'},set(),
                                      lambda path,sha:raw,full_scan=False)
        self.assertEqual(len(items),1)
        self.assertNotEqual(items[0]['fingerprint'],'old-fingerprint')

    def test_rename_removes_old_blob_identity_and_collects_new_path(self):
        calls=[]
        def api(url):
            calls.append(url)
            if '/git/ref/heads/' in url:
                return {'object':{'sha':'head'}}
            if '/compare/' in url:
                return {'total_commits':1,'commits':[{}], 'files':[{
                    'filename':'inbox/renamed.json','previous_filename':'inbox/old.json',
                    'status':'renamed','sha':'blob-new'}]}
            if '/git/blobs/blob-new' in url:
                import base64
                return {'encoding':'base64','content':base64.b64encode(b'{"id":"renamed"}').decode()}
            raise AssertionError(url)
        cursor={'base_commit':'base','blob_index_complete':True,'blobs':{'inbox/old.json':'blob-old'},
                'pending':{'inbox/old.json':{'blob_sha':'blob-old'}}}
        gateway,mapping=collector.collect('owner/repo','nexo-inbox','schedule',cursor,api=api)
        self.assertEqual(mapping['removed_paths'],['inbox/old.json'])
        self.assertEqual(mapping['items'][0]['path'],'inbox/renamed.json')
        self.assertNotIn('inbox/old.json',mapping['observed_blobs'])
        self.assertEqual(len(gateway['items']),1)

    def test_dispatch_walks_only_inbox_and_uses_blob_identity(self):
        calls=[]
        def api(url):
            calls.append(url)
            if url.endswith('/git/ref/heads/nexo-inbox'):
                return {'object':{'sha':'head'}}
            if url.endswith('/git/trees/head'):
                return {'tree':[{'path':'inbox','type':'tree','sha':'tree-inbox'},{'path':'docs','type':'tree','sha':'tree-docs'}]}
            if url.endswith('/git/trees/tree-inbox'):
                return {'tree':[{'path':'nested','type':'tree','sha':'tree-nested'},{'path':'skip.txt','type':'blob','sha':'txt'}]}
            if url.endswith('/git/trees/tree-nested'):
                return {'tree':[{'path':'item.json','type':'blob','sha':'blob-json'}]}
            if url.endswith('/git/blobs/blob-json'):
                import base64
                return {'encoding':'base64','content':base64.b64encode(b'{"id":"item"}').decode()}
            raise AssertionError(url)
        cursor={'base_commit':'base'}
        gateway,mapping=collector.collect('owner/repo','nexo-inbox','workflow_dispatch',cursor,api=api)
        self.assertEqual([item['id'] for item in gateway['items']],[mapping['items'][0]['id']])
        self.assertEqual(mapping['items'][0]['blob_sha'],'blob-json')
        self.assertEqual(mapping['mode'],'full-scan')
        self.assertFalse(any('/git/trees/tree-docs' in url for url in calls))
        self.assertIn('https://api.github.com/repos/owner/repo/git/blobs/blob-json',calls)

    def test_compare_file_cap_triggers_complete_tree_reconciliation(self):
        calls=[]
        def api(url):
            calls.append(url)
            if url.endswith('/git/ref/heads/nexo-inbox'):
                return {'object':{'sha':'head'}}
            if '/compare/' in url:
                return {'total_commits':1,'commits':[{}],
                        'files':[{'filename':f'docs/{i}.md','status':'modified'} for i in range(300)]}
            if url.endswith('/git/trees/head'):
                return {'tree':[{'path':'inbox','type':'tree','sha':'inbox-tree'}]}
            if url.endswith('/git/trees/inbox-tree'):
                return {'tree':[{'path':'item.json','type':'blob','sha':'new-blob'}]}
            if url.endswith('/git/blobs/new-blob'):
                import base64
                return {'encoding':'base64','content':base64.b64encode(b'{"id":"item"}').decode()}
            raise AssertionError(url)
        gateway,mapping=collector.collect('owner/repo','nexo-inbox','schedule',
            {'base_commit':'base','blob_index_complete':True},api=api)
        self.assertEqual(mapping['mode'],'tree-recovery')
        self.assertEqual(len(gateway['items']),1)
        self.assertTrue(any('/git/trees/head' in url for url in calls))

    def test_truncated_tree_fails_closed(self):
        calls=[]
        def api(url):
            calls.append(url)
            if url.endswith('/git/ref/heads/nexo-inbox'):
                return {'object':{'sha':'head'}}
            return {'truncated':True,'tree':[]}
        with self.assertRaisesRegex(RuntimeError,'truncated'):
            collector.collect('owner/repo','nexo-inbox','workflow_dispatch',{'base_commit':'base'},api=api)

    def test_missing_compare_base_recovers_from_current_blob_index(self):
        def api(url):
            if url.endswith('/git/ref/heads/nexo-inbox'):
                return {'object':{'sha':'head'}}
            if '/compare/' in url:
                raise HTTPError(url,404,'base commit missing',{},None)
            if url.endswith('/git/trees/head'):
                return {'tree':[{'path':'inbox','type':'tree','sha':'inbox-tree'}]}
            if url.endswith('/git/trees/inbox-tree'):
                return {'tree':[{'path':'item.json','type':'blob','sha':'blob-current'}]}
            if url.endswith('/git/blobs/blob-current'):
                import base64
                return {'encoding':'base64','content':base64.b64encode(b'{"id":"item"}').decode()}
            raise AssertionError(url)
        gateway,mapping=collector.collect('owner/repo','nexo-inbox','schedule',
            {'base_commit':'missing','blob_index_complete':True,'blobs':{'inbox/item.json':'blob-old'}},api=api)
        self.assertEqual(mapping['mode'],'tree-recovery')
        self.assertEqual(len(gateway['items']),1)

    def test_legacy_cursor_migrates_to_blob_index_and_retries_old_deferred_receipt(self):
        import base64
        import hashlib
        deferred=b'{"id":"deferred"}'
        applied=b'{"id":"applied"}'
        deferred_fp=hashlib.sha256(deferred).hexdigest()
        applied_fp=hashlib.sha256(applied).hexdigest()
        bodies={'blob-d':deferred,'blob-a':applied}
        calls=[]
        def api(url):
            calls.append(url)
            if url.endswith('/git/ref/heads/nexo-inbox'):
                return {'object':{'sha':'head'}}
            if url.endswith('/git/trees/head'):
                return {'tree':[{'path':'inbox','type':'tree','sha':'inbox-tree'}]}
            if url.endswith('/git/trees/inbox-tree'):
                return {'tree':[{'path':'deferred.json','type':'blob','sha':'blob-d'},
                                {'path':'applied.json','type':'blob','sha':'blob-a'}]}
            if '/git/blobs/' in url:
                sha=url.rsplit('/',1)[-1]
                return {'encoding':'base64','content':base64.b64encode(bodies[sha]).decode()}
            raise AssertionError(url)
        cursor={'base_commit':'base','acked':{'inbox/applied.json':applied_fp},
                'receipts':{
                    'inbox/applied.json':{'fingerprint':applied_fp,'outcome':'APPLIED'},
                    'inbox/deferred.json':{'fingerprint':deferred_fp,'outcome':'DEFERRED_DEPENDENCY'},
                }}
        gateway,mapping=collector.collect('owner/repo','nexo-inbox','schedule',cursor,api=api)
        self.assertEqual(mapping['mode'],'index-migration')
        self.assertTrue(mapping['blob_index_complete'])
        self.assertEqual([item['path'] for item in mapping['items']],['inbox/deferred.json'])
        self.assertIn('https://api.github.com/repos/owner/repo/git/blobs/blob-a',calls)
        self.assertIn('https://api.github.com/repos/owner/repo/git/blobs/blob-d',calls)


if __name__=='__main__':unittest.main()
