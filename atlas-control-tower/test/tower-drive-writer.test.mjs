import test from 'node:test';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {buildDriveSnapshotCandidate,fingerprintFiles,isCurrentTowerBundlePath,towerBundlePathRole} from '../lib/tower-drive-writer.mjs';

const base=()=>({contract:'NEXO_TOWER_BUNDLE_V1',authority:'TOWER_V06',source_repository:'byDenoso/NEXO-Obsidian-Vault',source_ref:'main',source_commit:'a'.repeat(40),source_fingerprint:'sha256:'+'b'.repeat(64),files:{'CONTROL.json':{encoding:'json',value:{schema_version:'0.8'}},'snapshot/latest.json':{encoding:'json',value:{event_cursor:'EVT-1'}}}});
const parent={contract:'NEXO_DRIVE_CURRENT_V3',snapshot_id:'SNP-OLD',source_fingerprint:'sha256:'+'b'.repeat(64),source_commit:'a'.repeat(40),generation:4};

test('candidate is immutable Drive revision derived from parent snapshot',()=>{
 const out=buildDriveSnapshotCandidate(base(),parent,{now:new Date('2026-09-20T21:00:00Z'),requestId:'REQ-1'});
 assert.match(out.snapshotId,/^SNP-20260920-210000000Z-D[0-9a-f]{12}$/);
 assert.equal(out.pointer.parent_snapshot_id,'SNP-OLD');
 assert.equal(out.pointer.generation,5);
 assert.equal(out.pointer.last_request_id,'REQ-1');
 assert.equal(out.pointer.event_cursor,'EVT-1');
 assert.equal(out.pointer.source_fingerprint,fingerprintFiles(out.bundle.files));
 assert.equal(out.bundle.storage,'GOOGLE_DRIVE_PRIVATE');
 assert.equal(out.bundle.migration_source_commit,'a'.repeat(40));
 assert.equal('source_commit' in out.bundle,false);
 const decoded=JSON.parse(gunzipSync(out.bytes).toString('utf8'));
 assert.equal(decoded.canonical_revision,out.snapshotId);
});

test('fingerprint is stable under object key order',()=>{
 const a={'x.json':{encoding:'json',value:{b:2,a:1}}};
 const b={'x.json':{encoding:'json',value:{a:1,b:2}}};
 assert.equal(fingerprintFiles(a),fingerprintFiles(b));
});


test('embedded public projection is historical derived state, never a current Tower input',()=>{
 const input=base();
 input.files['projections/public/manifest.json']={encoding:'json',value:{authority:'TOWER_V06',projection_fingerprint:'sha256:'+'c'.repeat(64)}};
 input.files['projections/public/projection.json']={encoding:'json',value:{contract:'NEXO_PUBLIC_PROJECTION_V1'}};
 const out=buildDriveSnapshotCandidate(input,parent,{now:new Date('2026-09-22T21:00:00Z')});
 assert.deepEqual(out.bundle.derived_stale_allowed_prefixes,['projections/public/']);
 assert.equal(out.bundle.derived_stale_policy,'HISTORICAL_ONLY__NEVER_CURRENT_INPUT');
 assert.equal(towerBundlePathRole('projections/public/manifest.json',out.bundle),'DERIVED_STALE_ALLOWED');
 assert.equal(towerBundlePathRole('projections/public/projection.json',out.bundle),'DERIVED_STALE_ALLOWED');
 assert.equal(isCurrentTowerBundlePath('projections/public/manifest.json',out.bundle),false);
 assert.equal(isCurrentTowerBundlePath('CONTROL.json',out.bundle),true);
});
