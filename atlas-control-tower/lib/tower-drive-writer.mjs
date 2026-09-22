import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';

export const DERIVED_STALE_ALLOWED_PREFIXES=Object.freeze(['projections/public/']);
export function towerBundlePathRole(path,bundle={}){
  const normalized=String(path||'').replace(/^\/+/, '');
  const declared=Array.isArray(bundle?.derived_stale_allowed_prefixes)
    ? bundle.derived_stale_allowed_prefixes
    : [];
  const prefixes=[...new Set([...DERIVED_STALE_ALLOWED_PREFIXES,...declared].map(value=>String(value||'').replace(/^\/+/, '')).filter(Boolean))];
  return prefixes.some(prefix=>normalized.startsWith(prefix))?'DERIVED_STALE_ALLOWED':'CURRENT_CANONICAL';
}
export function isCurrentTowerBundlePath(path,bundle={}){
  return towerBundlePathRole(path,bundle)==='CURRENT_CANONICAL';
}

export function canonicalJson(value){
  if(Array.isArray(value))return '['+value.map(canonicalJson).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonicalJson(value[key])).join(',')+'}';
  return JSON.stringify(value);
}
export function fingerprintFiles(files={}){
  const rows=Object.keys(files).sort().map(path=>{
    const entry=files[path]||{};
    const body=entry.encoding==='json'?canonicalJson(entry.value):String(entry.data||'');
    return [path,String(entry.encoding||''),body.length,createHash('sha256').update(body).digest('hex')];
  });
  return 'sha256:'+createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}
function stamp(date){return date.toISOString().replace(/[-:.]/g,'').replace('T','-').replace('Z','Z');}
export function buildDriveSnapshotCandidate(inputBundle,parentPointer,{now=new Date(),requestId=null}={}){
  if(!inputBundle?.files||inputBundle.contract!=='NEXO_TOWER_BUNDLE_V1')throw new Error('DRIVE_CANDIDATE_BUNDLE_INVALID');
  if(!parentPointer?.snapshot_id||!parentPointer?.source_fingerprint)throw new Error('DRIVE_CANDIDATE_PARENT_INVALID');
  const date=now instanceof Date?now:new Date(now);
  if(Number.isNaN(date.getTime()))throw new Error('DRIVE_CANDIDATE_TIME_INVALID');
  const bundle=structuredClone(inputBundle);
  const fingerprint=fingerprintFiles(bundle.files);
  const snapshotId='SNP-'+stamp(date)+'-D'+fingerprint.slice(7,19);
  const migration={
    repository:bundle.migration_source_repository||bundle.source_repository||parentPointer.migration_source_repository||null,
    ref:bundle.migration_source_ref||bundle.source_ref||parentPointer.migration_source_ref||null,
    commit:bundle.migration_source_commit||bundle.source_commit||parentPointer.migration_source_commit||parentPointer.source_commit||null
  };
  bundle.derived_stale_allowed_prefixes=[...DERIVED_STALE_ALLOWED_PREFIXES];
  bundle.derived_stale_policy='HISTORICAL_ONLY__NEVER_CURRENT_INPUT';
  bundle.source_fingerprint=fingerprint;
  bundle.state_fingerprint=fingerprint;
  bundle.storage='GOOGLE_DRIVE_PRIVATE';
  bundle.canonical_revision=snapshotId;
  bundle.parent_snapshot_id=parentPointer.snapshot_id;
  bundle.file_count=Object.keys(bundle.files).length;
  bundle.migration_source_repository=migration.repository;
  bundle.migration_source_ref=migration.ref;
  bundle.migration_source_commit=migration.commit;
  delete bundle.source_repository;delete bundle.source_ref;delete bundle.source_commit;

  const snapshotEntry=bundle.files['snapshot/latest.json'];
  const eventCursor=snapshotEntry?.encoding==='json'?snapshotEntry.value?.event_cursor||null:null;
  const manifest={
    contract:'NEXO_DRIVE_SNAPSHOT_V3',snapshot_id:snapshotId,parent_snapshot_id:parentPointer.snapshot_id,
    source:'DRIVE_TOWER_V06_MUTATION',source_fingerprint:fingerprint,state_fingerprint:fingerprint,
    generated_at:date.toISOString(),files:bundle.file_count,authority:'TOWER_V06',storage:'GOOGLE_DRIVE_PRIVATE',
    completeness:'COMPLETE_TOWER_V06',immutable:true,event_cursor:eventCursor,last_request_id:requestId||null,
    migration_source_repository:migration.repository,migration_source_ref:migration.ref,migration_source_commit:migration.commit,
    bundle_path:'TOWER.bundle.json.gz'
  };
  const pointer={
    contract:'NEXO_DRIVE_CURRENT_V3',snapshot_id:snapshotId,parent_snapshot_id:parentPointer.snapshot_id,
    generation:Number(parentPointer.generation||0)+1,source_fingerprint:fingerprint,state_fingerprint:fingerprint,
    promoted_at:date.toISOString(),authority:'TOWER_V06',storage:'GOOGLE_DRIVE_PRIVATE',
    completeness:'COMPLETE_TOWER_V06',event_cursor:eventCursor,last_request_id:requestId||null,
    migration_source_repository:migration.repository,migration_source_ref:migration.ref,migration_source_commit:migration.commit
  };
  const bytes=gzipSync(Buffer.from(JSON.stringify(bundle),'utf8'),{level:9});
  manifest.bundle_bytes=bytes.length;
  return {bundle,bytes,fingerprint,snapshotId,manifest,pointer};
}
