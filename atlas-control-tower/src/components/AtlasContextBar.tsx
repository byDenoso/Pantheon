type ContextItem={id:string;label?:string};

type AtlasContextBarProps={
  path:ContextItem[];
  freshness?:string|null;
  authority?:string|null;
  sourceVersion?:string|null;
  navigationKind?:string|null;
};

function humanState(value?:string|null){
  const state=String(value||'UNKNOWN').toUpperCase();
  if(state==='LIVE')return'Live';
  if(state==='SNAPSHOT')return'Snapshot';
  if(state==='STALE')return'Desatualizado';
  if(state==='DEGRADED')return'Degradado';
  return state==='UNKNOWN'?'Estado desconhecido':state.replaceAll('_',' ');
}

export function AtlasContextBar({path,freshness,authority,sourceVersion,navigationKind}:AtlasContextBarProps){
  const visible=path.length?path:[{id:'system:NEXO',label:'NEXO'}];
  return <div className="atlas-context-bar" role="status" aria-label="Contexto atual do Atlas">
    <div className="atlas-context-path" aria-label="Caminho atual">
      {visible.map((item,index)=><span key={`${item.id}:${index}`}>{index>0&&<i aria-hidden="true">/</i>}<b>{item.label||item.id}</b></span>)}
    </div>
    <div className="atlas-context-trust" aria-label="Estado e proveniência da projeção">
      <span className={`context-state context-state-${String(freshness||'unknown').toLowerCase()}`}>{humanState(freshness)}</span>
      {authority&&<span title="Autoridade da projeção">{humanState(authority)}</span>}
      {sourceVersion&&<span title="Versão da fonte">{sourceVersion}</span>}
      <span className={navigationKind==='cross-domain'?'context-jump':'context-drill'}>{navigationKind==='cross-domain'?'Cross-domain':'Drill down'}</span>
    </div>
  </div>;
}
