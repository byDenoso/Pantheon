import {createHash} from 'node:crypto';

// Public storage is a replaceable projection. Only the Drive Tower is scientific authority.
export const PUBLIC_CATALOG_CONTRACT='NEXO_APPROVED_PUBLIC_CATALOG_V1';
export const EMPTY_PUBLIC_CATALOG=Object.freeze({contract:'ATLAS_PUBLIC_V1',items:[],links:[]});
const HEAD='nexo:atlas:approved-public:v1:head';
const VERSION='nexo:atlas:approved-public:v1:version:';
const FIELDS=['question','answers','method','result','limits'];
const PRIVATE=/(?:^|[^a-z])(?:peer|olympus|client|patient|private|secret)(?:[^a-z]|$)/i;
const ID=/^[a-z][a-z0-9-]{2,79}$/;
const SHA=/^sha256:[0-9a-f]{64}$/;
const isObject=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const stable=x=>Array.isArray(x)?x.map(stable):isObject(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])])):x;
export const catalogDigest=x=>'sha256:'+createHash('sha256').update(JSON.stringify(stable(x))).digest('hex');
function fail(code){throw Object.assign(new Error(code),{code});}
function requiredText(value,max=4000){if(typeof value!=='string'||!value.trim()||value.length>max||PRIVATE.test(value))fail('PUBLIC_CONTENT_INVALID');return value.trim();}
function bilingual(value){if(!isObject(value)||Object.keys(value).sort().join(',')!=='en,pt-BR')fail('PUBLIC_BILINGUAL_REQUIRED');return {'pt-BR':requiredText(value['pt-BR']),en:requiredText(value.en)};}
function sourceRecord(tower,testId){
  if(typeof testId!=='string'||!/^[A-Za-z0-9_.-]{3,190}$/.test(testId)||PRIVATE.test(testId))fail('SOURCE_PRIVATE_OR_INVALID');
  const path=`entities/test/${testId}.json`,record=tower.files?.[path]?.value;
  if(!isObject(record)||record.kind!=='TEST'||record.id!==testId||record.domain!=='SCIENCE'||record.private===true||record.visibility==='PRIVATE'||PRIVATE.test(String(record.roadmap_id||''))||PRIVATE.test(String(record.campaign_id||''))||PRIVATE.test(String(record.semantic?.domain_id||''))||PRIVATE.test(String(record.semantic?.model_id||'')))fail('SOURCE_NOT_ELIGIBLE');
  if(!['DONE','VERIFIED','RESULT'].includes(record.status)||record.review_state!=='CONFIRMED'||record.archive_reason||record.contests?.some?.(c=>!['REVIEWED','CLOSED','RESOLVED'].includes(String(c?.status||'').toUpperCase())))fail('SOURCE_REVIEW_INCOMPLETE');
  if(typeof record.result_summary!=='string'||!record.result_summary.trim()||/n[aã]o executad[oa]|not executed/i.test(record.result_summary))fail('SOURCE_RESULT_MISSING');
  return {path,record};
}
function evidencePaths(tower,testId,record,source){
  if(!isObject(source)||typeof source.artifactPath!=='string'||typeof source.resultPath!=='string'||typeof source.reviewPath!=='string')fail('SOURCE_EVIDENCE_REQUIRED');
  const a=source.artifactPath,r=source.resultPath,v=source.reviewPath;
  if(!/^runtime\/artifacts\/[A-Za-z0-9_.-]+\.json$/.test(a)||!/^runtime\/results\/[A-Za-z0-9_.-]+\.json$/.test(r)||!/^events\/[A-Za-z0-9_.-]+\.json$/.test(v))fail('SOURCE_EVIDENCE_INVALID');
  const artifact=tower.files?.[a]?.value,result=tower.files?.[r]?.value,review=tower.files?.[v]?.value;
  if(!isObject(artifact)||!isObject(result)||!isObject(review))fail('SOURCE_EVIDENCE_MISSING');
  const run=String(result.run_id||'');
  if(!run||artifact.run_id!==run||artifact.id!==result.artifact_ref||artifact.test_id!==testId||result.test_id!==testId)fail('SOURCE_EVIDENCE_UNLINKED');
  if(typeof artifact.digest!=='string'||!/^([a-f0-9]{64}|sha256:[a-f0-9]{64})$/.test(artifact.digest)||!['PASS','VERIFIED'].includes(artifact.validation_status))fail('SOURCE_ARTIFACT_UNVERIFIED');
  if(review.test_id!==testId||review.role!=='REFEREE_1'||review.verdict!=='CONFIRMED'||review.run_id!==run||review.producer===review.reviewer)fail('SOURCE_REVIEW_UNLINKED');
  if(record.execution?.run_id&&record.execution.run_id!==run)fail('SOURCE_RUN_CHANGED');
  return [a,r,v];
}
function claimRefs(tower,refs,required){
  if(!isObject(refs)||Object.keys(refs).sort().join(',')!==FIELDS.slice().sort().join(','))fail('CLAIM_REFS_INVALID');
  return Object.fromEntries(FIELDS.map(field=>{
    const paths=refs[field];
    if(!Array.isArray(paths)||!paths.length||paths.length>6||paths.some(p=>typeof p!=='string'||!required.includes(p)||!tower.files[p]))fail('CLAIM_PROVENANCE_INCOMPLETE');
    return [field,[...new Set(paths)]];
  }));
}
export function preparePublicCatalog(tower,packet){
  if(tower?.contract!=='NEXO_TOWER_LIVE_V1'||tower?.authority!=='TOWER_V06'||tower?.storage!=='GOOGLE_DRIVE_PRIVATE'||tower?.revision!==tower?.state_fingerprint||!SHA.test(String(tower?.revision||'')))fail('TOWER_IDENTITY_INVALID');
  if(packet?.contract!=='NEXO_PUBLIC_CATALOG_PROPOSAL_V1'||packet.sourceRevision!==tower.revision||!Array.isArray(packet.cards)||packet.cards.length>300||typeof packet.approvalId!=='string'||!/^APPROVAL-[A-Z0-9-]{8,100}$/.test(packet.approvalId))fail('PUBLIC_PACKET_INVALID');
  const ids=new Set(),findings=new Set(),sources=new Set(),publicCards=[],internal=[];
  for(const entry of packet.cards){
    if(!isObject(entry)||!isObject(entry.source)||!isObject(entry.public))fail('PUBLIC_ENTRY_INVALID');
    const {testId,sourceDigest,artifactPath,resultPath,reviewPath}=entry.source;
    const {path,record}=sourceRecord(tower,testId);
    if(sourceDigest!==catalogDigest(record))fail('SOURCE_DIGEST_STALE');
    const evidence=evidencePaths(tower,testId,record,{artifactPath,resultPath,reviewPath});
    const p=entry.public;
    if(!ID.test(p.id)||!ID.test(p.campaign)||!ID.test(p.finding)||PRIVATE.test(p.id)||PRIVATE.test(p.campaign)||PRIVATE.test(p.finding))fail('PUBLIC_ID_INVALID');
    if(!record.roadmap_id||!tower.files?.[`roadmaps/${record.roadmap_id}.json`]?.value)fail('SOURCE_ROADMAP_MISSING');
    const roadmap=tower.files[`roadmaps/${record.roadmap_id}.json`].value;
    if(roadmap.status==='PROPOSED'||roadmap.status==='RETRACTED'||roadmap.status==='WITHDRAWN')fail('SOURCE_ROADMAP_INELIGIBLE');
    const findingKey=p.campaign+'/'+p.finding;
    if(ids.has(p.id)||findings.has(findingKey)||sources.has(testId))fail('PUBLIC_DUPLICATE_FINDING');
    ids.add(p.id);findings.add(findingKey);sources.add(testId);
    const publicCard={id:p.id,campaign:p.campaign,finding:p.finding,...Object.fromEntries(FIELDS.map(f=>[f,bilingual(p[f])]))};
    // Ref paths stay inside the private version; no raw Tower fields are returned.
    const refs=claimRefs(tower,entry.claimRefs,[path,...evidence,`roadmaps/${record.roadmap_id}.json`]);
    publicCards.push(publicCard);
    internal.push({publicId:p.id,testId,roadmapId:record.roadmap_id,sourceDigest,sourceRevision:tower.revision,claimRefs:refs});
  }
  publicCards.sort((a,b)=>a.campaign.localeCompare(b.campaign)||a.id.localeCompare(b.id));
  internal.sort((a,b)=>a.publicId.localeCompare(b.publicId));
  const body={contract:PUBLIC_CATALOG_CONTRACT,approvalId:packet.approvalId,tests:publicCards,provenance:internal};
  const revision=catalogDigest(body);
  return {revision,...body,sourceRevision:tower.revision};
}
function publicPart(document){
  if(document?.contract!==PUBLIC_CATALOG_CONTRACT||!SHA.test(String(document?.revision||''))||!Array.isArray(document.tests)||catalogDigest({contract:document.contract,approvalId:document.approvalId,tests:document.tests,provenance:document.provenance})!==document.revision)fail('PUBLIC_CATALOG_CORRUPT');
  // Reproject known keys only, even if the stored snapshot has unknown fields.
  const tests=document.tests.map(x=>{
    if(!ID.test(x.id)||!ID.test(x.campaign)||!ID.test(x.finding)||PRIVATE.test(x.id)||PRIVATE.test(x.campaign)||PRIVATE.test(x.finding))fail('PUBLIC_CATALOG_CORRUPT');
    return {id:x.id,campaign:x.campaign,finding:x.finding,...Object.fromEntries(FIELDS.map(f=>[f,bilingual(x[f])]))};
  });
  return {...EMPTY_PUBLIC_CATALOG,tests};
}
export async function readPublicCatalog(store){
  const head=await store('GET',HEAD);
  if(!head)return EMPTY_PUBLIC_CATALOG;
  if(!SHA.test(head))fail('PUBLIC_CATALOG_HEAD_INVALID');
  const data=await store('GET',VERSION+head);
  if(typeof data!=='string')fail('PUBLIC_CATALOG_VERSION_MISSING');
  return publicPart(JSON.parse(data));
}
export async function readPrivateCatalog(store){
  const head=await store('GET',HEAD);
  if(!head)return {revision:null,tests:[],provenance:[]};
  const data=await store('GET',VERSION+head);
  if(!data)fail('PUBLIC_CATALOG_VERSION_MISSING');
  const parsed=JSON.parse(data);publicPart(parsed);
  return parsed;
}
const SWAP="local cur=redis.call('GET',KEYS[1]); if (cur or '')~=ARGV[1] then return 'CONFLICT' end; if cur==ARGV[2] then return 'UNCHANGED' end; redis.call('SET',KEYS[2],ARGV[3]); redis.call('SET',KEYS[1],ARGV[2]); return 'PUBLISHED'";
export async function publishPublicCatalog(store,tower,packet){
  const candidate=preparePublicCatalog(tower,packet);
  const prior=await readPrivateCatalog(store);
  const expected=packet.expectedHead??null;
  if(expected!==prior.revision)fail('PUBLIC_CATALOG_STALE_HEAD');
  // Identity must remain stable across corrections, preventing reruns as new results.
  const previous=new Map(prior.tests.map(x=>[x.campaign+'/'+x.finding,x.id]));
  for(const row of candidate.tests){const id=previous.get(row.campaign+'/'+row.finding);if(id&&id!==row.id)fail('PUBLIC_FINDING_ID_CHANGED');}
  if(prior.revision===candidate.revision)return {status:'UNCHANGED',revision:prior.revision,counts:{published:0,updated:0,withdrawn:0}};
  const before=new Map(prior.tests.map(x=>[x.campaign+'/'+x.finding,x]));
  const after=new Map(candidate.tests.map(x=>[x.campaign+'/'+x.finding,x]));
  const counts={published:0,updated:0,withdrawn:0};
  for(const [key,row] of after){const old=before.get(key);if(!old)counts.published++;else if(catalogDigest(old)!==catalogDigest(row))counts.updated++;}
  for(const key of before.keys())if(!after.has(key))counts.withdrawn++;
  const out=await store('EVAL',SWAP,2,HEAD,VERSION+candidate.revision,expected||'',candidate.revision,JSON.stringify(candidate));
  if(out==='CONFLICT')fail('PUBLIC_CATALOG_STALE_HEAD');
  if(out!=='PUBLISHED'&&out!=='UNCHANGED')fail('PUBLIC_CATALOG_WRITE_UNCONFIRMED');
  const readback=await readPrivateCatalog(store);
  if(readback.revision!==candidate.revision)fail('PUBLIC_CATALOG_READBACK_FAILED');
  return {status:out,revision:candidate.revision,counts};
}
