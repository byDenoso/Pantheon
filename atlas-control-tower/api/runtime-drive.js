import {createHash} from 'node:crypto';
import {createTowerDriveGateway} from '../lib/tower-drive-gateway.mjs';
import {buildAtlasProjectionV3} from '../v3/project.mjs';

const TTL=30000;
let cache=null;
const TRUTH_OWNER='byDenoso/NEXO-Obsidian-Vault@main:TOWER_V06';
const hash=value=>'sha256:'+createHash('sha256').update(JSON.stringify(value)).digest('hex');

async function loadSource(gateway){
  const [control,work,campaigns,hypotheses,interdomain,tests,testGroups]=await Promise.all([
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
    sourceVersion:String(control?.event_cursor||control?.revision||control?.schema_version||hash(control)),
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
  if(route==='health')return {ok:true,authority:'TOWER_V06',truthOwner:TRUTH_OWNER,storage:'GOOGLE_DRIVE',manifest:snapshot.manifest,counts:snapshot.universe?.counts||{}};
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
function send(res,body,status=200,{noStore=false}={}){
  res.statusCode=status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control',noStore?'private, no-store':'public, max-age=30, stale-while-revalidate=120');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-NEXO-Authority','TOWER_V06');
  res.setHeader('X-NEXO-Storage','GOOGLE_DRIVE');
  res.end(JSON.stringify(body));
}
export default async function handler(req,res){
  const gateway=createTowerDriveGateway();
  const route=routeOf(req),query=queryOf(req),method=String(req.method||'GET').toUpperCase();
  if(method==='POST'&&route==='sync'){
    try{const snapshot=await load({force:true,gateway});return send(res,{ok:true,outcome:'REFRESHED',authority:'TOWER_V06',storage:'GOOGLE_DRIVE',fingerprint:snapshot.manifest?.fingerprint},200,{noStore:true});}
    catch(error){return send(res,{ok:false,error:'DRIVE_TOWER_UNAVAILABLE',detail:String(error?.message||error).slice(0,220)},503,{noStore:true});}
  }
  if(method!=='GET')return send(res,{ok:false,error:'METHOD_NOT_ALLOWED'},405,{noStore:true});
  try{return send(res,project(await load({force:query.refresh==='1',gateway}),route,query));}
  catch(error){return send(res,{ok:false,error:'DRIVE_TOWER_UNAVAILABLE',detail:String(error?.message||error).slice(0,220),authority:'TOWER_V06',storage:'GOOGLE_DRIVE'},503,{noStore:true});}
}
