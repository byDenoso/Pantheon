import {createHash} from 'node:crypto';
import {json} from './http.mjs';
export const GITHUB_CANONICAL_CONTRACT='NEXO_CANONICAL_GITHUB_V1';
export const ATLAS_CONTRACT='NEXO_ATLAS_SSOT_V1';
const text=value=>String(value??'').trim(),arr=value=>Array.isArray(value)?value:[];
const digest=value=>`sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
const hierarchy=rows=>arr(rows).map(row=>({record_type:text(row.type).toUpperCase(),record_id:text(row.id),status:text(row.status),title:text(row.title),summary:text(row.summary),parent_id:text(row.parentId),source_ref:text(row.sourceRef)}));
export function buildGithubCanonicalSnapshot(payload,{repository='byDenoso/Pantheon',ref='main',path='atlas-control-tower/data/nexo-drive-projection.json',sourceRevision='',generatedAt=new Date().toISOString()}={}){
 const sections={THREADS:[],WORK:arr(payload?.actions).map(row=>({work_id:text(row.id),status:text(row.status),question:text(row.title),next_step:text(row.summary),authority:'GITHUB'})).filter(row=>row.work_id),EVENTS:[],KNOWLEDGE:[],DECISIONS:[],SYSTEM:[]};
 const projections={Science:arr(payload?.science).map(row=>({record_type:'CAMPAIGN',record_id:text(row.id),status:text(row.status),title:text(row.title),summary:text(row.summary),domain:text(row.domain),source_ref:text(row.sourceRef)})),Engineering:hierarchy(payload?.engineering),Olympus:hierarchy(payload?.olympus),StructuralLearning:[],CrossDomain:[],Integrity:arr(payload?.integrity)};
 const sourceFileId=`${repository}:${path}@${ref}`,fingerprint=digest({authority:'GITHUB',sourceFileId,sourceRevision,sections,projections});
 return {contract:ATLAS_CONTRACT,canonicalContract:GITHUB_CANONICAL_CONTRACT,authority:'GITHUB',projectionAuthority:'DERIVED_FROM_GITHUB_CANONICAL',projectionOnly:true,sourceFileId,sourceRevision,generatedAt,fingerprint,sections,projections,provenance:{projectionSources:['GOOGLE_DRIVE']}};
}
export async function readGithubCanonical({env=process.env,signal,now=Date.now()}={}){
 const repository=text(env.GITHUB_CANONICAL_REPOSITORY)||'byDenoso/Pantheon',ref=text(env.GITHUB_CANONICAL_REF)||'main',path=text(env.GITHUB_CANONICAL_PATH)||'atlas-control-tower/data/nexo-drive-projection.json';
 const payload=await json(`https://api.github.com/repos/${repository}/contents/${path}?ref=${encodeURIComponent(ref)}`,{signal,headers:{Accept:'application/vnd.github.raw+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'nexo-one'}});
 return buildGithubCanonicalSnapshot(payload,{repository,ref,path,sourceRevision:text(payload?.meta?.fingerprint),generatedAt:new Date(now).toISOString()});
}
