import {createHash} from 'node:crypto';
import {createTowerGithubGateway} from './tower-github-gateway.mjs';
import {createDriveClient} from './drive-client.mjs';

const ENTITY_KINDS=['work','hypothesis','interdomain','test','test_group','result','evidence','campaign','program'];
const FIXED_FILES=[
  'CONTROL.json',
  'indexes/active-work.json',
  'indexes/campaigns.json',
  'indexes/programs.json',
  'indexes/interdomain-active.json',
  'manifests/capabilities.json',
  'runtime/artifacts/meta_learning/METALEARNING_CURRENT.json'
];
const ROLE_FILES=['advisor','executor','auditor','architect','reviewer'];

function entityId(value){
  for(const key of ['id','entity_id','work_id','hypothesis_id','test_id','test_group_id','result_id','evidence_id','campaign_id','program_id']){
    if(value?.[key])return String(value[key]);
  }
  return null;
}
function digest(records){
  const normalized=[...records].sort((a,b)=>a.path.localeCompare(b.path)).map(row=>[row.path,row.value]);
  return 'sha256:'+createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}
function snapshotId(){
  return 'SNP-'+new Date().toISOString().replace(/[-:.]/g,'').replace('T','-').replace('Z','Z');
}

export async function bootstrapDriveFromGithub({env=process.env,fetchImpl=globalThis.fetch}={}){
  const source=createTowerGithubGateway({env,fetchImpl});
  const drive=createDriveClient({env,fetchImpl});
  if(!drive.configured)throw new Error('DRIVE_PRIMARY_NOT_CONFIGURED');

  const records=[];
  for(const path of FIXED_FILES){
    const value=await source.readJson(path);
    if(value!==null)records.push({path,value});
  }
  for(const role of ROLE_FILES){
    const path='bootstrap/'+role+'.json';
    const value=await source.readJson(path);
    if(value!==null)records.push({path,value});
  }
  for(const kind of ENTITY_KINDS){
    const values=await source.listJsonDirectory('entities/'+kind);
    for(const value of values){
      const id=entityId(value);
      if(!id)throw new Error('DRIVE_BOOTSTRAP_ENTITY_ID_MISSING:'+kind);
      records.push({path:'entities/'+kind+'/'+id+'.json',value});
    }
  }
  const control=records.find(row=>row.path==='CONTROL.json')?.value;
  if(!control)throw new Error('DRIVE_BOOTSTRAP_CONTROL_MISSING');

  const fingerprint=digest(records);
  const current=await drive.readPath('CURRENT.json');
  if(current?.json?.source_fingerprint===fingerprint){
    return {outcome:'NO_OP',snapshot_id:current.json.snapshot_id,source_fingerprint:fingerprint,records:records.length};
  }

  const id=snapshotId();
  const base='SNAPSHOTS/'+id+'/TOWER';
  for(const row of records)await drive.putJson(base+'/'+row.path,row.value,{conflict:'error'});
  const manifest={
    contract:'NEXO_DRIVE_SNAPSHOT_V1',
    snapshot_id:id,
    source:'GITHUB_TOWER_V06_MIGRATION',
    source_fingerprint:fingerprint,
    generated_at:new Date().toISOString(),
    records:records.length,
    authority:'TOWER_V06',
    immutable:true,
    storage:'GOOGLE_DRIVE_PRIVATE'
  };
  await drive.putJson('SNAPSHOTS/'+id+'/SNAPSHOT.json',manifest,{conflict:'error'});

  const verify=await drive.readPath(base+'/CONTROL.json');
  if(!verify?.json||JSON.stringify(verify.json)!==JSON.stringify(control))throw new Error('DRIVE_BOOTSTRAP_READBACK_FAILED');

  const pointer={
    contract:'NEXO_DRIVE_CURRENT_V1',
    snapshot_id:id,
    source_fingerprint:fingerprint,
    promoted_at:new Date().toISOString(),
    authority:'TOWER_V06',
    storage:'GOOGLE_DRIVE_PRIVATE'
  };
  await drive.putJson('CURRENT.json',pointer,{conflict:'replace'});
  return {outcome:'PROMOTED',snapshot_id:id,source_fingerprint:fingerprint,records:records.length,manifest,pointer};
}
