const STATE_RANK={LIVE:0,SNAPSHOT:1,STALE:2,DEGRADED:3,BLOCKED:4,MISSING_PROVIDER:5,CONFLICT:6};
const PROJECTION_STATES=new Set(Object.keys(STATE_RANK));
const TRUTH_STATES=new Set(['LIVE','SNAPSHOT','DEGRADED','CONFLICT','STALE_DECLARATION','MISSING_PROVIDER','BLOCKED']);
const materialSeverity=status=>status==='CONFLICT'?'P1':status==='MISSING_PROVIDER'?'P1':['BLOCKED','DEGRADED','STALE_DECLARATION'].includes(status)?'P2':'INFO';
const rank=state=>STATE_RANK[state]??STATE_RANK.DEGRADED;
const worst=states=>[...states].filter(Boolean).sort((a,b)=>rank(b)-rank(a))[0]||'LIVE';

function providerProjectionState(provider){
  if(!provider)return 'MISSING_PROVIDER';
  if(provider.status==='AVAILABLE')return provider.partial?'SNAPSHOT':'LIVE';
  if(provider.status==='AUTH_REQUIRED')return 'SNAPSHOT';
  return provider.lastSuccessAt?'DEGRADED':'MISSING_PROVIDER';
}

/**
 * A superfície pública não possui credenciais privadas por design. AUTH_REQUIRED e
 * projection-only significam SNAPSHOT, não falha operacional. Material degradation
 * continua visível quando a fonte realmente falha, conflita ou desaparece.
 */
export function normalizePublicSystemState(state,world){
  if(world?.access!=='PUBLIC')return state;
  const truthByDomain=new Map((world?.truthGraph?.results||[]).map(row=>[String(row.domain||'').toUpperCase(),row]));
  const rawProviders=new Map((world?.providers||[]).map(provider=>[provider.id,provider]));

  state.findings=(state.findings||[]).map(finding=>{
    const raw=truthByDomain.get(finding.domain),status=String(raw?.status||finding.status).toUpperCase();
    if(!TRUTH_STATES.has(status))return finding;
    return {...finding,status,severity:materialSeverity(status),explanation:raw?.explanation||finding.explanation,
      authority:{...finding.authority,class:status==='LIVE'?'TRUTH_OWNER':'DERIVED'}};
  });

  state.providers=(state.providers||[]).map(provider=>{
    const raw=rawProviders.get(provider.id),projection=providerProjectionState(raw);
    return {...provider,state:projection,explanation:raw?.status==='AUTH_REQUIRED'
      ?'Fonte privada representada por snapshot público; autenticação não é exigida desta superfície.'
      :provider.explanation};
  });

  state.lanes=(state.lanes||[]).map(lane=>{
    const raw=truthByDomain.get(lane.domain),projection=String(raw?.status||lane.state).toUpperCase();
    return {...lane,state:PROJECTION_STATES.has(projection)?projection:lane.state,
      current_state:raw?.explanation&&!(state.actions||[]).some(action=>action.lane===lane.domain)?raw.explanation:lane.current_state};
  });

  const providerStates=new Map(state.providers.map(provider=>[provider.id,provider.state]));
  const domainStates=new Map(state.lanes.map(lane=>[lane.domain,lane.state]));
  if(state.graph?.nodes){
    state.graph.nodes=state.graph.nodes.map(node=>{
      if(node.type==='DOMAIN')return {...node,state:domainStates.get(node.domain)||node.state};
      if(node.type==='PROVIDER'){
        const id=String(node.id||'').replace(/^provider:/,'');
        return {...node,state:providerStates.get(id)||node.state};
      }
      return node;
    });
  }

  const globalProviders=(state.providers||[]).filter(provider=>provider.id!=='vercel');
  state.global_state=worst([state.bus?.state,...globalProviders.map(p=>p.state),...state.findings.map(f=>f.status),...state.lanes.map(l=>l.state)]);
  return state;
}
