import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {createTowerDriveGateway} from '../lib/tower-drive-gateway.mjs';

const FILE_ID='drive-live-1';
const REVISION='sha256:'+'a'.repeat(64);
function livePayload(overrides={}){
  const control={truth_owner:'TOWER_V06@GOOGLE_DRIVE_PRIVATE',write_model:'IN_PLACE_FILE_REVISION_CAS_READBACK',cutover_state:'DRIVE_PRIMARY_ACTIVE__GIT_CODE_PROVENANCE_ONLY'};
  return {
    contract:'NEXO_TOWER_LIVE_V1',authority:'TOWER_V06',truth_owner:'TOWER_V06@GOOGLE_DRIVE_PRIVATE',storage:'GOOGLE_DRIVE_PRIVATE',
    write_model:'IN_PLACE_FILE_REVISION_CAS_READBACK',stable_file_id:FILE_ID,revision:REVISION,state_fingerprint:REVISION,updated_at:'2026-09-23T12:32:03Z',file_count:3,
    files:{'CONTROL.json':{encoding:'json',value:control},'entities/work/WORK-1.json':{encoding:'json',value:{id:'WORK-1',status:'READY'}},'indexes/active-work.json':{encoding:'json',value:{work:[{id:'WORK-1'}]}}},
    ...overrides
  };
}
function fakeDrive(payload){
  let reads=0;
  return {
    configured:true,rootId:'drive-root',
    async findChild(parentId,name){assert.equal(parentId,'drive-root');assert.equal(name,'NEXO_TOWER_LIVE.json.gz');return {id:FILE_ID,name};},
    async getBuffer(id){assert.equal(id,FILE_ID);reads+=1;return gzipSync(Buffer.from(JSON.stringify(payload)));},
    get reads(){return reads}
  };
}

test('Drive gateway reads the stable live Tower file and never CURRENT snapshots',async()=>{
  const drive=fakeDrive(livePayload()),gateway=createTowerDriveGateway({env:{},driveClient:drive,fetchImpl:async()=>{throw new Error('unexpected network')}});
  assert.equal(gateway.configured.towerWrite,false);
  assert.equal(gateway.configured.writeModel,'IN_PLACE_FILE_REVISION_CAS_READBACK');
  assert.equal((await gateway.readControl()).truth_owner,'TOWER_V06@GOOGLE_DRIVE_PRIVATE');
  assert.deepEqual(await gateway.readEntity('work','WORK-1'),{id:'WORK-1',status:'READY'});
  assert.equal(drive.reads,1);
  assert.equal((await gateway.getCurrentSnapshotMeta()).revision,REVISION);
  assert.equal((await gateway.getCurrentSnapshotMeta()).snapshot_id,null);
  assert.equal(drive.reads,1);
  await assert.rejects(()=>gateway.submitTowerMutation({}),/DRIVE_V2_CORE_DIRECT_ONLY/);
  await assert.rejects(()=>gateway.dispatchRuntime({}),/DRIVE_V2_CORE_DIRECT_ONLY/);
});

test('Drive gateway rejects stale snapshot contracts and inconsistent live identity',async()=>{
  const stale=fakeDrive({...livePayload(),contract:'NEXO_TOWER_BUNDLE_V1'}),staleGateway=createTowerDriveGateway({env:{},driveClient:stale,fetchImpl:async()=>{throw new Error('unexpected network')}});
  await assert.rejects(()=>staleGateway.readControl(),/DRIVE_LIVE_TOWER_CONTRACT_INVALID/);

  const mismatched=fakeDrive(livePayload({stable_file_id:'other-file'})),mismatchGateway=createTowerDriveGateway({env:{},driveClient:mismatched,fetchImpl:async()=>{throw new Error('unexpected network')}});
  await assert.rejects(()=>mismatchGateway.readControl(),/DRIVE_LIVE_TOWER_FILE_ID_MISMATCH/);
});

test('Drive gateway fails closed when the live Tower CONTROL disagrees with its envelope',async()=>{
  const payload=livePayload();payload.files['CONTROL.json'].value.write_model='DRIVE_IMMUTABLE_SNAPSHOT_SINGLE_WRITER_CURRENT';
  const gateway=createTowerDriveGateway({env:{NEXO_DRIVE_MIGRATION_FALLBACK_GITHUB:'1'},driveClient:fakeDrive(payload),fetchImpl:async()=>{throw new Error('unexpected network')}});
  assert.equal(gateway.configured.migrationFallback,false);
  await assert.rejects(()=>gateway.readControl(),/DRIVE_LIVE_TOWER_CONTROL_MISMATCH/);
});
