import type {ActionRecord,InboxItem,SystemState} from '../../contracts/system.ts';
import {HumanInboxItem} from '../../components/composites.tsx';
import {StatusBadge} from '../../components/primitives.tsx';
import {inboxGroups,globalSummary,laneViews,resolvableActions} from '../../viewmodels/system.ts';

const activeAction=(status:string)=>!['APPLIED','NO_OP_ALREADY_APPLIED','FAILED'].includes(status);
const actionClass=(status:string)=>status==='BLOCKED'||status==='FAILED'?'block':status==='AWAITING_HUMAN'||status==='WAITING_SIDE_QUEST'?'wait':status==='APPLIED'||status==='NO_OP_ALREADY_APPLIED'?'pass':'';

export function Overview({state,onOpenAction,onOpenInbox,onNavigate}:{
  state:SystemState;
  onOpenAction:(action:ActionRecord)=>void;
  onOpenInbox:(item:InboxItem)=>void;
  onNavigate:(view:'INBOX'|'ACTIONS'|'TRUTHGRAPH'|'SOURCES')=>void;
}){
  const summary=globalSummary(state);
  const urgent=inboxGroups(state).flatMap(group=>group.items).slice(0,2);
  const resolvable=resolvableActions(state);
  const next=resolvable[0]||state.actions.find(action=>activeAction(action.status))||null;
  const lanes=laneViews(state);
  const unavailable=state.providers.filter(provider=>provider.state==='MISSING_PROVIDER'||provider.state==='BLOCKED').length;
  const outsidePass=state.capabilities.filter(capability=>capability.status!=='PASS').length;

  return <div className="overview-consult">
    <section className="consult-section" aria-labelledby="needs-title">
      <div className="consult-section-head"><h2 id="needs-title">Precisa de você</h2><button className="text-button" onClick={()=>onNavigate('INBOX')}>{summary.needsHuman} pendentes</button></div>
      {urgent.length?<div className="consult-gates">{urgent.map(item=><HumanInboxItem key={item.id} item={item} onOpen={onOpenInbox}/>)}</div>:<div className="consult-empty">Nenhum gate humano publicado nesta leitura.</div>}
    </section>

    <section className="consult-section" aria-labelledby="next-title">
      <div className="consult-section-head"><h2 id="next-title">Próxima ação do sistema</h2><button className="text-button" onClick={()=>onNavigate('ACTIONS')}>Abrir fila</button></div>
      {next?<button className="consult-next" type="button" onClick={()=>onOpenAction(next)}>
        <strong>{next.title}</strong><span>{next.lane} · {next.status}</span><code>{next.action_id}</code>
      </button>:<div className="consult-empty">Próxima ação: não publicada.</div>}
    </section>

    <section className="consult-kpis" aria-label="Indicadores">
      <button className="consult-kpi" type="button" onClick={()=>onNavigate('INBOX')}><span>Gates humanos</span><strong>{summary.needsHuman}</strong></button>
      <button className="consult-kpi" type="button" onClick={()=>onNavigate('ACTIONS')}><span>Blockers</span><strong>{summary.blockers.length}</strong></button>
      <button className="consult-kpi" type="button" onClick={()=>onNavigate('SOURCES')}><span>Capabilities fora de PASS</span><strong>{outsidePass}<small> / {state.capabilities.length}</small></strong></button>
      <button className="consult-kpi" type="button" onClick={()=>onNavigate('SOURCES')}><span>Fontes indisponíveis</span><strong>{unavailable}<small> / {state.providers.length}</small></strong></button>
    </section>

    <section className="consult-section" aria-labelledby="domains-title">
      <div className="consult-section-head"><h2 id="domains-title">Domínios</h2><span>estado e distribuição da fila</span></div>
      <div className="science-table-wrap"><table className="consult-domain-table"><thead><tr><th>Domínio</th><th>Estado</th><th>Fila</th><th>Próxima operação</th></tr></thead><tbody>
        {lanes.map(lane=>{const actions=state.actions.filter(action=>action.lane===lane.domain);return <tr key={lane.domain}><td><strong>{lane.domain}</strong></td><td><StatusBadge state={lane.state}/></td><td><div className="state-distribution" aria-label={`${actions.length} ações no domínio`}>{actions.map(action=><i key={action.action_id} className={actionClass(action.status)} style={{flexGrow:1}} title={action.status}/>)}</div></td><td>{lane.next_action||'não publicado'}</td></tr>;})}
      </tbody></table></div>
    </section>

    <section className="consult-section" aria-labelledby="diff-title">
      <div className="consult-section-head"><h2 id="diff-title">O que mudou desde o último sync</h2><span>comparação de snapshots</span></div>
      <div className="consult-empty">Diff entre snapshots: não publicado neste contrato.</div>
    </section>
  </div>;
}
