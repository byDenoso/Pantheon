const ENDPOINT='/api/universal-projection';
const KNOWN_STATES=new Set(['LIVE','SNAPSHOT','STALE','DEGRADED','BLOCKED']);

export function projectionViewModel(value){
  const valid=value?.contract==='ProjectionEnvelope/v1'&&value?.bus==='Pantheon/UniversalProjectionBus'&&typeof value?.fingerprint==='string'&&Array.isArray(value?.envelopes);
  if(!valid)return {state:'DEGRADED',fingerprint:'INVALID',sources:[],envelopes:[],message:'Contrato de projeção inválido.'};
  return {
    state:KNOWN_STATES.has(value.state)?value.state:'DEGRADED',
    fingerprint:value.fingerprint,
    sources:Array.isArray(value.sources)?value.sources:[],
    envelopes:value.envelopes,
    message:value.state==='DEGRADED'?'Fonte de projeção degradada. Nenhum fallback local foi aplicado.':'ProjectionEnvelope/v1 · NON_AUTHORITATIVE'
  };
}

export async function readUniversalProjection({fetcher=fetch,endpoint=ENDPOINT}={}){
  try{
    const response=await fetcher(endpoint,{headers:{Accept:'application/json'}});
    if(!response.ok)throw new Error(`HTTP_${response.status}`);
    return projectionViewModel(await response.json());
  }catch(error){
    return {state:'DEGRADED',fingerprint:'UNAVAILABLE',sources:[],envelopes:[],message:`Projection Bus indisponível · ${String(error?.message||error)}`};
  }
}

function line(label,value){
  const row=document.createElement('div');row.style.cssText='display:grid;grid-template-columns:112px 1fr;gap:6px;';
  const b=document.createElement('b');b.textContent=label;const code=document.createElement('code');code.textContent=String(value??'—');code.style.cssText='overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
  row.append(b,code);return row;
}

export async function mountUniversalProjection(){
  const anchor=document.querySelector('#source-status');if(!anchor)return null;
  const details=document.createElement('details');details.id='projection-bus-status';details.dataset.testid='projection-bus-status';details.className='source-status';details.style.position='relative';
  const summary=document.createElement('summary');summary.style.cssText='cursor:pointer;list-style:none;white-space:nowrap;';summary.textContent='◌ PRJ · lendo…';
  const panel=document.createElement('div');panel.style.cssText='position:absolute;right:0;top:calc(100% + 8px);z-index:80;width:min(420px,90vw);padding:10px 12px;border:1px solid rgba(128,128,128,.28);border-radius:10px;background:#080d14;box-shadow:0 12px 36px rgba(0,0,0,.36);display:grid;gap:6px;text-align:left;';
  details.append(summary,panel);anchor.after(details);
  const model=await readUniversalProjection();
  details.dataset.state=model.state;details.dataset.fingerprint=model.fingerprint;summary.textContent=`● PRJ ${model.state}`;
  panel.replaceChildren(line('Contrato','ProjectionEnvelope/v1'),line('Fingerprint',model.fingerprint));
  for(const source of model.sources.slice(0,4))panel.append(line(source.id,`${source.state} · ${source.revision}`));
  for(const env of model.envelopes.slice(0,3))panel.append(line(env.entity_id,`${env.state} · ${env.freshness?.state||'UNKNOWN'} · ${env.source_revision}`));
  const note=document.createElement('small');note.textContent=model.message;note.style.opacity='.7';panel.append(note);
  return {details,model};
}

if(typeof document!=='undefined')mountUniversalProjection();
