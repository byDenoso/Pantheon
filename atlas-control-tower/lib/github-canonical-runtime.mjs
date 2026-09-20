import {createHash} from 'node:crypto';
import {readGithubAuthority} from './github-authority.mjs';
import {buildAtlasProjectionV3} from '../v3/project.mjs';

const TTL=30000;let cache=null;
const arr=value=>Array.isArray(value)?value:[];
const hash=value=>`sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
const KEYS=['science','engineering','olympus','learning','crossDomain','integrity','actions'];

function adaptAtlasV3Snapshot(snapshot){
 const entities=Object.values(snapshot?.entities||{});
 const programs=new Map(entities.filter(row=>row?.projectedType==='PROGRAM').map(row=>[String(row.id),row]));
 const campaigns=entities.filter(row=>row?.projectedType==='CAMPAIGN');
 const learning=arr(snapshot?.learning?.filaments).map(row=>({
  id:row.id,title:row.id,status:row.status||'UNKNOWN',
  summary:row.mapping||row.predictionOrUtility||'',
  confidence:null,support:null,contradict:null,
  provenance:snapshot?.manifest?.sourceVersion||null
 }));
 const science=campaigns.map(row=>{
  const programId=String(row.parentId||'SCIENCE');
  const program=programs.get(programId);
  return {
   id:String(row.id),domain:programId,title:program?.label||programId,
   status:row.status||'',summary:row.label||row.id,
   sourceRef:snapshot?.provenance?.sourceVersion||snapshot?.manifest?.sourceVersion||null
  };
 });
 const actions=arr(snapshot?.operations?.works).map(row=>({
  id:String(row.id),title:String(row.id),status:row.status||'UNKNOWN',
  summary:'',updatedAt:snapshot?.manifest?.generatedAt||null
 }));
 const engineering=entities
  .filter(row=>String(row?.domain||'').toUpperCase().includes('ENGINEERING'))
  .map(row=>({id:String(row.id),type:row.projectedType||'ENTITY',title:row.label||row.id,status:row.status||'',summary:'',parentId:row.parentId||null}));
 const olympus=entities
  .filter(row=>/OLYMPUS|BODYBUILD/i.test(String(row?.domain||'')))
  .map(row=>({id:String(row.id),type:row.projectedType||'ENTITY',title:row.label||row.id,status:row.status||'',summary:'',parentId:row.parentId||null}));
 return {
  meta:{
   authority:'TOWER_V06',
   fingerprint:snapshot?.manifest?.fingerprint,
   sourceVersion:snapshot?.manifest?.sourceVersion,
   generatedAt:snapshot?.manifest?.generatedAt,
   contract:'ATLAS_PROJECTION_V3'
  },
  science,engineering,olympus,learning,crossDomain:learning,
  integrity:[],actions,atlasV3:snapshot
 };
}

function validatePayload(payload,authority){
 if(!payload||typeof payload!=='object')throw new Error('INVALID_ATLAS_PROJECTION_PAYLOAD');
 const expected=authority?.projection?.fingerprint,actual=payload?.meta?.fingerprint;
 if(expected&&actual!==expected)throw new Error('ATLAS_PROJECTION_FINGERPRINT_MISMATCH');
 if(!/^sha256:[0-9a-f]{64}$/i.test(String(actual||'')))throw new Error('ATLAS_PROJECTION_FINGERPRINT_INVALID');
 return payload;
}
async function fetchPayload(authority,{fetcher=fetch,signal}={}){
 const projection=authority?.projection||{};
 const repo=projection.repository||authority.repository;
 const ref=projection.ref||authority.ref||'main';
 const path=projection.transportPath;
 if(!repo||!path)throw new Error('ATLAS_PROJECTION_LOCATOR_MISSING');
 const url=`https://api.github.com/repos/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`;
 const response=await fetcher(url,{headers:{Accept:'application/vnd.github.raw+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'nexo-atlas'},signal,cache:'no-store'});
 if(!response?.ok)throw new Error(`ATLAS_PROJECTION_HTTP_${response?.status||0}`);
 const raw=await response.json();
 if(projection.kind==='TOWER_V3_SANITIZED_SOURCE'){
  if(raw?.control?.truth_owner!==authority.truthOwner)throw new Error('ATLAS_V3_TRUTH_OWNER_MISMATCH');
  if(raw?.publicProjection!==true)throw new Error('ATLAS_V3_PUBLIC_PROJECTION_REQUIRED');
  return validatePayload(adaptAtlasV3Snapshot(buildAtlasProjectionV3(raw)),authority);
 }
 return validatePayload(raw,authority);
}
export async function loadGithubCanonical({force=false,fetcher=fetch,signal}={}){
 if(!force&&cache&&Date.now()-cache.at<TTL)return cache;
 const authority=await readGithubAuthority({fetcher,signal}),payload=await fetchPayload(authority,{fetcher,signal});
 cache={at:Date.now(),authority,payload,fingerprint:payload.meta?.fingerprint||hash(payload)};return cache;
}
export function lastGithubCanonical(){return cache}
function diff(before,after){
 if(!before)return {outcome:'REFRESHED',fingerprintBefore:null,fingerprintAfter:after.fingerprint,changedProjections:KEYS,detailAvailable:false};
 if(before.fingerprint===after.fingerprint)return {outcome:'NO_CHANGE',fingerprintBefore:before.fingerprint,fingerprintAfter:after.fingerprint,changedProjections:[],detailAvailable:true};
 const changedProjections=KEYS.filter(key=>hash(arr(before.payload?.[key]))!==hash(arr(after.payload?.[key])));
 return {outcome:'UPDATED',fingerprintBefore:before.fingerprint,fingerprintAfter:after.fingerprint,changedProjections,detailAvailable:true};
}
export async function syncGithubCanonical(options={}){const before=cache,after=await loadGithubCanonical({...options,force:true});return {state:after,diff:diff(before,after)}}
export {adaptAtlasV3Snapshot};
