const DEFAULT_BASE='https://ep-cool-lab-aw72uid0.apirest.c-12.us-east-1.aws.neon.tech/neondb/rest/v1';
const SCIENCE=['domains','entities','entity_display','entity_domains','relations','assets','entity_assets','migration_issues','import_batches'];
const LEARNING=['observations','patterns','lessons','strategies','policies','links'];

async function readTable({fetchImpl,baseUrl,token,schema,table,query='select=*'}){
  const r=await fetchImpl(`${baseUrl}/${table}?${query}`,{headers:{Authorization:`Bearer ${token}`,'Accept-Profile':schema,Accept:'application/json'},signal:AbortSignal.timeout(18000)});
  if(!r.ok)throw Error(`NEON_DATA_API_${schema}_${table}_${r.status||'ERROR'}`);
  return r.json();
}

export async function readCanonical({fetchImpl=fetch,token=process.env.VERCEL_OIDC_TOKEN,baseUrl=process.env.NEON_DATA_API_URL||DEFAULT_BASE}={}){
  if(!token)throw Error('VERCEL_OIDC_TOKEN_MISSING');
  const science={},learning={};
  const scienceReads=SCIENCE.map(async table=>{science[table]=await readTable({fetchImpl,baseUrl,token,schema:'science_v1',table,query:table==='import_batches'?'select=*&order=source_observed_at.desc.nullslast&limit=20':'select=*'})});
  const learningReads=LEARNING.map(async table=>{learning[table]=await readTable({fetchImpl,baseUrl,token,schema:'learning_v1',table})});
  await Promise.all([...scienceReads,...learningReads]);
  const audited=(science.import_batches||[]).find(x=>x.status==='AUDITED')||(science.import_batches||[])[0];
  return {science,learning,observedAt:audited?.source_observed_at||audited?.created_at||null,batchId:audited?.batch_id||null,payloadHash:audited?.payload_hash||null};
}
