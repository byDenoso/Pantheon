import {createHash} from 'node:crypto';
import {validateItem, CONTEXTS} from '../../src/contracts/validate.mjs';
import {classify,rankAttention} from './attention.mjs';
export const stable = value => JSON.stringify(canonical(value));
function canonical(v) { return Array.isArray(v)?v.map(canonical):v && typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v; }
export const hash = x => createHash('sha256').update(stable(x)).digest('hex').slice(0,16).toUpperCase();
export function semantic(item) { const {observedAt,freshness,...rest}=item; return {...rest,freshness:freshness.state}; }
const descriptions = {NEXO:['NEXO','Estado canônico, decisões e ações.'],COSMOLOGY:['Cosmologia','Campanhas, evidências e Atlas.'],OLYMPUS:['Olympus','Planos, check-ins e acompanhamento.'],ENGINEERING:['Engenharia','Repositórios, entregas e infraestrutura.'],PERSONAL:['Pessoal','Agenda e compromissos pessoais.']};
export function worldDiff(previous,current) {
  const a=new Map((previous?.items||[]).map(x=>[x.id,hash(semantic(x))])), b=new Map(current.items.map(x=>[x.id,hash(semantic(x))]));
  return {previous:previous?.fingerprint||null,current:current.fingerprint,
    added:previous?[...b.keys()].filter(id=>!a.has(id)).sort():[], updated:previous?[...b.keys()].filter(id=>a.has(id)&&a.get(id)!==b.get(id)).sort():[],
    removed:previous?[...a.keys()].filter(id=>!b.has(id)).sort():[], providerChanges:previous?current.providers.filter(p=>{const old=previous.providers.find(x=>x.id===p.id);return !old||old.status!==p.status||old.partial!==p.partial||old.revision!==p.revision}).map(p=>p.id):[]};
}
export function compile(results,{now=Date.now(),previous=null,access='PRIVATE'}={}) {
  const issues=[], items=[], providers=[], seen=new Set();
  for (const result of [...results].sort((a,b)=>a.provider.id.localeCompare(b.provider.id))) {
    const p={...result.provider}; let rejected=0;
    for (const raw of result.items||[]) {
      if (!validateItem(raw,p.id) || seen.has(raw.id)) { rejected++; continue; }
      seen.add(raw.id);
      const item={...raw,freshness:{...raw.freshness,state:p.status!=='AVAILABLE'||Date.parse(raw.freshness.expiresAt)<now?'STALE':raw.freshness.state}};
      items.push({...item,...classify(item,now)});
    }
    if(rejected){p.partial=true;p.count=Math.max(0,(p.count||0)-rejected);p.message='Alguns registros não passaram na validação de origem.';issues.push({provider:p.id,code:'INVALID_PROVENANCE'});}
    if(p.status!=='AVAILABLE') issues.push({provider:p.id,code:p.status});
    providers.push(p);
  }
  items.sort((a,b)=>rankAttention(a)-rankAttention(b)||(a.dueAt||'z').localeCompare(b.dueAt||'z')||a.id.localeCompare(b.id));
  const contexts=CONTEXTS.map(id=>({id,title:descriptions[id][0],description:descriptions[id][1],itemIds:items.filter(x=>x.contextId===id).map(x=>x.id),attentionCount:items.filter(x=>x.contextId===id&&['ACT','ESCALATE'].includes(x.attention)).length,coverage:items.some(x=>x.contextId===id)?providers.some(p=>p.status!=='AVAILABLE'||p.partial)?'PARTIAL':'AVAILABLE':'UNAVAILABLE'}));
  const fingerprint='WORLD-'+hash({version:'1',access,items:[...items].sort((a,b)=>a.id.localeCompare(b.id)).map(semantic),providers:providers.map(({id,revision,status,partial})=>({id,revision,status,partial}))});
  const world={version:'1',fingerprint,generatedAt:new Date(now).toISOString(),providers,items,contexts,issues,access};
  return {...world,diff:worldDiff(previous,world)};
}
