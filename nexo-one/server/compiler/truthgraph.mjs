import {createHash} from 'node:crypto';

const STALE_MS=7*24*60*60*1000;
const BLOCKING=new Set(['FAIL','BLOCKED','UNVERIFIED','DISABLED','REVOKED']);
const DEGRADED=new Set(['PENDING','PENDING_CANARY','UNKNOWN','PARTIAL','PASS_CONFIGURED_PENDING_PROSPECTIVE']);
const stable=v=>JSON.stringify(canonical(v));
function canonical(v){return Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;}
const hash=v=>createHash('sha256').update(stable(v)).digest('hex').slice(0,16).toUpperCase();
const text=v=>String(v||'').trim();

function expectedProvider(row){
  const domain=text(row.domain).toUpperCase(),value=text(row.canonical_truth).toLowerCase();
  if(domain==='ARTIFACT')return null;
  if(domain==='NEXO')return 'nexo';
  if(value.includes('github')||value.includes('git/'))return 'github';
  if(value.includes('drive')||value.includes('control tower'))return 'drive';
  if(value.includes('vercel'))return 'vercel';
  if(value.includes('calendar'))return 'calendar';
  if(value.includes('atlas'))return 'atlas';
  return null;
}
function declaredProvider(row){
  if(!row)return null;
  const value=`${text(row.title)} ${text(row.detail)}`.toLowerCase();
  if(value.includes('github'))return 'github';
  if(value.includes('drive'))return 'drive';
  if(value.includes('vercel'))return 'vercel';
  if(value.includes('calendar'))return 'calendar';
  if(value.includes('atlas'))return 'atlas';
  if(value.includes('google sheets')||value.includes('nexo · ssot')||value.includes('nexo ssot'))return 'nexo';
  return null;
}
function domains(value){return text(value).toUpperCase().split(/[\/,;]+/).map(x=>x.trim()).filter(Boolean);}
function capabilityState(rows){
  if(!rows.length)return {state:'N/A',summary:'Nenhuma capability específica declarada.',ids:[]};
  const values=rows.map(r=>text(r.status).toUpperCase());
  const state=values.some(x=>BLOCKING.has(x))?'BLOCKED':values.some(x=>DEGRADED.has(x)||!x.startsWith('PASS'))?'DEGRADED':'PASS';
  return {state,summary:rows.map(r=>`${r.capability_id}:${r.status}`).join(' · '),ids:rows.map(r=>r.capability_id)};
}
function explanation(status,{domain,expected,declared,provider,truth,capability}){
  if(status==='CONFLICT')return `${domain}: autoridade canônica aponta para ${expected||'owner dependente'}, mas a declaração ativa resolve para ${declared||'provider não identificável'}. Nenhuma autoridade foi alterada automaticamente.`;
  if(status==='BLOCKED')return `${domain}: capability necessária está fail-closed (${capability.summary}).`;
  if(status==='MISSING_PROVIDER')return `${domain}: provider canônico ${expected||'esperado'} não está disponível para readback.`;
  if(status==='STALE_DECLARATION')return `${domain}: declaração canônica está além da janela de freshness de 7 dias (${truth?.updated_at||'sem timestamp'}).`;
  if(status==='DEGRADED')return `${domain}: autoridade está coerente, mas provider/capability não tem prova integral (${provider?.partial?'provider parcial':capability.summary}).`;
  return `${domain}: autoridade, provider, freshness e capability estão coerentes no readback atual.`;
}

export function buildTruthGraph({authorityRows=[],truthRows=[],capabilityRows=[],providers=[],refs={},now=Date.now(),inputError=null}={}){
  const checked_at=new Date(now).toISOString();
  if(inputError||!authorityRows.length){
    const semantic={domain:'NEXO',status:'MISSING_PROVIDER',authority:'AUTHORITY_MATRIX',provider:{expected:'nexo',declared:null,status:'UNAVAILABLE'},capability:{state:'N/A',summary:'Matrizes canônicas indisponíveis.',ids:[]},source_ref:refs.authority||refs.ssot||'https://docs.google.com/'};
    const result={...semantic,fingerprint:`TG-${hash(semantic)}`,checked_at,explanation:'NEXO: AUTHORITY_MATRIX/CAPABILITY_MATRIX não puderam ser lidas; o radar não inventa autoridade ausente.',material:true};
    return {fingerprint:`TRUTHGRAPH-${hash([result.fingerprint])}`,checked_at,results:[result],material_conflicts:[result]};
  }
  const providerMap=new Map(providers.map(p=>[p.id,p]));
  const results=authorityRows.filter(r=>text(r.domain)).map(row=>{
    const domain=text(row.domain).toUpperCase();
    const truth=truthRows.find(r=>text(r.record_type).toLowerCase()==='truth'&&text(r.record_id).toUpperCase()===domain&&text(r.status).toUpperCase()==='ACTIVE');
    const expected=expectedProvider(row),declared=declaredProvider(truth);
    const p=expected?providerMap.get(expected):null;
    const caps=capabilityRows.filter(r=>domains(r.domain).includes(domain));
    const capability=capabilityState(caps);
    const updated=truth?Date.parse(truth.updated_at):NaN;
    const stale=truth&&(!Number.isFinite(updated)||now-updated>STALE_MS);
    const conflict=!!(truth&&expected&&declared&&declared!==expected);
    let status='LIVE';
    if(domain==='ARTIFACT')status='LIVE';
    else if(conflict)status='CONFLICT';
    else if(capability.state==='BLOCKED')status='BLOCKED';
    else if(expected&&(!p||p.status!=='AVAILABLE'))status='MISSING_PROVIDER';
    else if(stale)status='STALE_DECLARATION';
    else if((p&&p.partial)||capability.state==='DEGRADED')status='DEGRADED';
    const source_ref=conflict?(refs.ssot||refs.authority):(refs.authority||refs.ssot||p?.sourceRef||'https://docs.google.com/');
    const authority={canonical_truth:text(row.canonical_truth),operational_truth:text(row.operational_truth),chat_role:text(row.chat_role),conflict_rule:text(row.conflict_rule)};
    const provider={expected:expected||'owner-dependent',declared:declared||expected||'owner-dependent',status:p?.status|| (expected?'UNAVAILABLE':'N/A'),partial:!!p?.partial,checked_at:p?.checkedAt||checked_at};
    const semantic={domain,status,source_ref,authority,provider,capability};
    const material=['CONFLICT','BLOCKED','MISSING_PROVIDER','STALE_DECLARATION'].includes(status);
    return {...semantic,fingerprint:`TG-${hash(semantic)}`,checked_at,material,explanation:explanation(status,{domain,expected,declared,provider,truth,capability})};
  });
  const material_conflicts=results.filter(r=>r.material);
  return {fingerprint:`TRUTHGRAPH-${hash(results.map(({checked_at,explanation,...r})=>r))}`,checked_at,results,material_conflicts};
}
