const text=value=>String(value??'').trim();
const arr=value=>Array.isArray(value)?value:[];
const allowedFreshness=new Set(['LIVE','SNAPSHOT','STALE','UNKNOWN','DEGRADED']);
const forbidden=[/DERIVED_NOT_EVIDENCE/i,/Conteúdo ainda não indexado em português/i,/Como ainda não indexado/i,/Por quê ainda não indexado/i,/Sem síntese publicada para esta pergunta no payload atual/i];

export function forbiddenUiLeak(value){const raw=typeof value==='string'?value:JSON.stringify(value);return forbidden.some(pattern=>pattern.test(raw))}
function requireField(errors,obj,key,path=key){if(!text(obj?.[key]))errors.push(`missing ${path}`)}
function requireMeta(errors,obj,prefix='payload'){
 requireField(errors,obj,'authority',`${prefix}.authority`);
 requireField(errors,obj,'sourceVersion',`${prefix}.sourceVersion`);
 const freshness=text(obj?.freshness).toUpperCase();
 if(!allowedFreshness.has(freshness))errors.push(`invalid ${prefix}.freshness:${freshness||'<empty>'}`);
}

export function validatePayload(route,payload){
 const errors=[];
 if(!payload||typeof payload!=='object')return ['payload is not an object'];
 if(forbiddenUiLeak(payload))errors.push('forbidden UI placeholder/technical enum leak');
 if(route==='health'){
  if(payload.ok!==true)errors.push('health.ok must be true');
  requireField(errors,payload,'contract','health.contract');
  const ds=payload.dataSource||{};requireMeta(errors,ds,'health.dataSource');
  if(ds.usedFallback===true&&text(ds.effective||ds.effectiveSource||ds.source).toLowerCase()==='github')errors.push('fallback masked as github');
  return errors;
 }
 requireMeta(errors,payload);
 if(route==='graph'){
  if(!Array.isArray(payload.nodes))errors.push('graph.nodes missing');
  if(!Array.isArray(payload.edges))errors.push('graph.edges missing');
  requireField(errors,payload,'contract','graph.contract');
 }
 if(route==='state')requireField(errors,payload,'contract','state.contract');
 if(route==='entity'){
  if(payload.contract!=='nexo-entity-v2')errors.push(`entity.contract=${text(payload.contract)||'<empty>'}`);
  const e=payload.entity;if(!e||typeof e!=='object')errors.push('entity.entity missing');else{
   for(const key of ['id','canonicalId','label','type','status','authority','evidenceClass','freshness','sourceVersion'])requireField(errors,e,key,`entity.${key}`);
   if(!Array.isArray(e.provenance)||!e.provenance.length)errors.push('entity.provenance missing');
   if(!Array.isArray(e.relations))errors.push('entity.relations missing');
   if(!Array.isArray(e.actions))errors.push('entity.actions missing');
   for(const p of arr(e.provenance)){requireField(errors,p,'authority','entity.provenance.authority');requireField(errors,p,'sourceVersion','entity.provenance.sourceVersion');requireField(errors,p,'freshness','entity.provenance.freshness')}
  }
 }
 if(route==='universe'){
  if(payload.contract!=='nexo-universe-v2')errors.push(`universe.contract=${text(payload.contract)||'<empty>'}`);
  const s=payload.synthesis;if(!s||typeof s!=='object')errors.push('universe.synthesis missing');else{
   const availability=text(s.availability).toUpperCase();requireField(errors,s,'availability','universe.synthesis.availability');
   if(['ABSENT','UNKNOWN','UNAVAILABLE'].includes(availability)&&text(s.status).toUpperCase()==='INCONCLUSIVE')errors.push('synthesis absence encoded as INCONCLUSIVE');
   if(availability!=='AVAILABLE'&&!text(s.reason))errors.push('universe.synthesis.reason missing for unavailable synthesis');
   if(!Array.isArray(s.provenance))errors.push('universe.synthesis.provenance missing');
  }
 }
 if(route==='lab'){
  requireField(errors,payload,'contract','lab.contract');requireField(errors,payload,'availability','lab.availability');
  for(const key of ['hypotheses','claims','tests','runs','results','evidence','pipelines'])if(!Array.isArray(payload[key]))errors.push(`lab.${key} missing`);
 }
 return errors;
}

const matrix=[
 ['health','health'],['graph','graph?focus=system:NEXO&depth=1&limit=16'],['state','state'],
 ['entity','entity?id=CAMP-CMB-ANOMALIES'],['universe','universe'],['observatory','observatory'],['lab','lab'],
 ['learning','learning'],['audit','audit'],['provenance','provenance'],['operations','operations'],['ops','ops'],['automation-runs','automation-runs']
];

async function request(base,label,path){
 const response=await fetch(`${base.replace(/\/$/,'')}/${path}`,{headers:{Accept:'application/json','Cache-Control':'no-cache'},redirect:'follow'});
 const contentType=response.headers.get('content-type')||'';let payload=null,parseError='';
 try{payload=await response.json()}catch(error){parseError=String(error?.message||error)}
 const errors=[];
 if(response.status!==200)errors.push(`HTTP ${response.status}`);
 if(!/application\/json/i.test(contentType))errors.push(`content-type ${contentType||'<empty>'}`);
 if(parseError)errors.push(`invalid JSON: ${parseError}`);
 if(payload&&['health','graph','state','entity','universe','lab'].includes(label))errors.push(...validatePayload(label,payload));
 return {label,path,status:response.status,contentType,payload,errors};
}

export async function runReadback(base){
 const rows=[];for(const [label,path] of matrix)rows.push(await request(base,label,path));
 return rows;
}

if(import.meta.url===new URL(`file://${process.argv[1]}`).href){
 const base=process.argv[2]||process.env.ATLAS_API_BASE||'https://nexo-atlas-control-tower.vercel.app/api';
 const rows=await runReadback(base);let failed=false;
 console.log('ENDPOINT | HTTP | FRESHNESS | SOURCE_VERSION | CONTRACT | STATUS');
 for(const row of rows){
  const p=row.payload||{},ds=p.dataSource||{},freshness=p.freshness||ds.freshness||'—',version=p.sourceVersion||ds.sourceVersion||'—',contract=p.contract||'—';
  const status=row.errors.length?`FAIL: ${row.errors.join('; ')}`:'PASS';if(row.errors.length)failed=true;
  console.log(`${row.label} | ${row.status} | ${freshness} | ${version} | ${contract} | ${status}`);
 }
 if(failed)process.exit(1);
}
