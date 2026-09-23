import {createHash} from 'node:crypto';
import {createTowerDriveGateway} from '../lib/tower-drive-gateway.mjs';
import {buildAtlasProjectionV3} from '../v3/project.mjs';

const TTL=5000;
let cache=null;
const hash=value=>'sha256:'+createHash('sha256').update(JSON.stringify(value)).digest('hex');

async function loadSource(gateway){
  const [meta,control,work,campaigns,hypotheses,interdomain,tests,testGroups]=await Promise.all([
    gateway.getCurrentSnapshotMeta(),
    gateway.readControl(),
    gateway.readActiveWorkIndex().catch(()=>({work:[]})),
    gateway.readCampaignIndex().catch(()=>({campaigns:[]})),
    gateway.listJsonDirectory('entities/hypothesis'),
    gateway.listJsonDirectory('entities/interdomain'),
    gateway.listJsonDirectory('entities/test'),
    gateway.listJsonDirectory('entities/test_group')
  ]);
  return {
    control,
    sourceVersion:String(meta?.revision||control?.event_cursor||control?.revision||control?.schema_version||hash(control)),
    generatedAt:new Date().toISOString(),
    completeness:'DRIVE_TOWER_LIVE',
    publicProjection:true,
    entities:{
      work:Array.isArray(work?.work)?work.work:[],
      campaign:Array.isArray(campaigns?.campaigns)?campaigns.campaigns:[],
      hypothesis:hypotheses,
      interdomain,
      test:tests,
      test_group:testGroups,
      learning:[]
    },
    historicalRegistry:{}
  };
}
function project(snapshot,route,query){
  if(route==='state')return snapshot;
  if(route==='graph')return snapshot.graph;
  if(route==='learning'||route==='learning-relations')return snapshot.learning;
  if(route==='ops'||route==='automation-runs')return snapshot.operations;
  if(route==='entity'){const id=String(query.id||'');return id?snapshot.entities?.[id]||null:{error:'ENTITY_ID_REQUIRED'};}
  if(route==='audit')return {authority:'TOWER_V06',manifest:snapshot.manifest,provenance:snapshot.provenance};
  return snapshot;
}
async function load({force=false,gateway}={}){
  if(!force&&cache&&Date.now()-cache.at<TTL)return cache.snapshot;
  const snapshot=buildAtlasProjectionV3(await loadSource(gateway));
  cache={at:Date.now(),snapshot};
  return snapshot;
}
const urlOf=req=>new URL(req.url||'/','https://atlas.local');
const routeOf=req=>{const u=urlOf(req);return u.searchParams.get('route')||u.pathname.split('/').filter(Boolean).pop()||'health';};
const queryOf=req=>Object.fromEntries(urlOf(req).searchParams);
function send(res,body,status=200,{noStore=true}={}){
  res.statusCode=status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control',noStore?'private, no-store':'private, max-age=5, stale-while-revalidate=5');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-NEXO-Authority','TOWER_V06');
  res.setHeader('X-NEXO-Storage','GOOGLE_DRIVE_PRIVATE');
  res.setHeader('X-Atlas-Authority','TOWER_V06');
  res.setHeader('X-Atlas-Truth-Owner','TOWER_V06@GOOGLE_DRIVE_PRIVATE');
  res.end(JSON.stringify(body));
}
export default async function handler(req,res){
  const gateway=createTowerDriveGateway();
  const route=routeOf(req),query=queryOf(req),method=String(req.method||'GET').toUpperCase();
  if(method==='GET'&&route==='health'){
    try{
      const [meta,control,work]=await Promise.all([
        gateway.getCurrentSnapshotMeta(),
        gateway.readControl(),
        gateway.readActiveWorkIndex().catch(()=>({work:[]}))
      ]);
      return send(res,{
        contract:'DRIVE_TOWER_HEALTH_V1',
        ok:true,
        authority:'TOWER_V06',
        truthOwner:control?.truth_owner||'TOWER_V06',
        storage:'GOOGLE_DRIVE_PRIVATE',
        snapshot_id:null,
        revision:meta.revision,
        updated_at:meta.updated_at,
        file_count:meta.file_count,
        stable_file_id:meta.stable_file_id,
        source_fingerprint:meta.source_fingerprint,
        state_fingerprint:meta.state_fingerprint||meta.source_fingerprint,
        event_cursor:meta.event_cursor||null,
        writer_ready:meta.writer_ready===true,
        completeness:meta.completeness,
        migration_fallback:gateway.configured.migrationFallback===true,
        write_model:gateway.configured.writeModel,
        counts:{active_work:Array.isArray(work?.work)?work.work.length:Number(work?.count||0)}
      },200,{noStore:true});
    }catch(error){
      const detail=String(error?.message||error).slice(0,220);
      if(detail.includes('DRIVE_PRIMARY_NOT_CONFIGURED')){
        return send(res,{
          contract:'DRIVE_TOWER_HEALTH_V1',
          ok:false,
          status:'NONCANONICAL_DEPRECATED',
          error:'LEGACY_RUNTIME_RETIRED',
          detail,
          authority:'TOWER_V06@GOOGLE_DRIVE_PRIVATE',
          storage:'GOOGLE_DRIVE_PRIVATE',
          canonical_current:{
            root_id:'14eRGK6QZnowu32XNOvpiE8AA_ffGVy-E',
            live_file:'NEXO_TOWER_LIVE.json.gz',
            write_model:'IN_PLACE_FILE_REVISION_CAS_READBACK'
          },
          git_state_fallback:false,
          message:'This Vercel runtime has no Drive credentials and is not a canonical health authority after cutover.'
        },410,{noStore:true});
      }
      return send(res,{contract:'DRIVE_TOWER_HEALTH_V1',ok:false,error:'DRIVE_TOWER_UNAVAILABLE',detail,authority:'TOWER_V06@GOOGLE_DRIVE_PRIVATE',storage:'GOOGLE_DRIVE_PRIVATE'},503,{noStore:true});
    }
  }
  if(method==='POST'&&route==='sync'){
    try{const snapshot=await load({force:true,gateway});return send(res,{ok:true,outcome:'PROJECTION_REFRESHED',tower_mutation:false,authority:'TOWER_V06',storage:'GOOGLE_DRIVE_PRIVATE',tower_revision:snapshot.manifest?.sourceVersion,projection_fingerprint:snapshot.manifest?.fingerprint},200,{noStore:true});}
    catch(error){return send(res,{ok:false,error:'DRIVE_TOWER_UNAVAILABLE',detail:String(error?.message||error).slice(0,220)},503,{noStore:true});}
  }
  if(method!=='GET')return send(res,{ok:false,error:'METHOD_NOT_ALLOWED'},405,{noStore:true});
  try{return send(res,project(await load({force:query.refresh==='1',gateway}),route,query));}
  catch(error){return send(res,{ok:false,error:'DRIVE_TOWER_UNAVAILABLE',detail:String(error?.message||error).slice(0,220),authority:'TOWER_V06',storage:'GOOGLE_DRIVE_PRIVATE'},503,{noStore:true});}
}

export const __runtimeDriveInternal={loadSource,project};
