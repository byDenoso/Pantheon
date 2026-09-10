import type {TruthGraphFinding,WorldState} from '../contracts/world';
import {dateTime} from '../app/model';

const STATUS_CLASS:Record<string,string>={LIVE:'available',DEGRADED:'',CONFLICT:'',STALE_DECLARATION:'',MISSING_PROVIDER:'',BLOCKED:''};

function Finding({finding}:{finding:TruthGraphFinding}){
  const authority=typeof finding.authority==='string'?finding.authority:finding.authority.canonical_truth;
  return <div className="provider-line truthgraph-finding" data-status={finding.status}>
    <div>
      <strong>{finding.domain} · {finding.status}</strong>
      <span>{finding.explanation}</span>
      <small>Autoridade: {authority}</small>
      <small>Provider real: {finding.provider.actual||'—'} · {finding.provider.status} · alvo da autoridade: {finding.provider.expected} · {finding.provider.expected_status}</small>
      <small>Capability: {finding.capability.summary}</small>
      <small className="mono">{finding.fingerprint} · {dateTime(finding.checked_at)}</small>
    </div>
    <a className={`provider-pill ${STATUS_CLASS[finding.status]||''}`} href={finding.source_ref} target="_blank" rel="noopener noreferrer">SOURCE ↗</a>
  </div>;
}

export function TruthGraphRadar({world,domain}:{world:WorldState|null;domain:string}){
  const graph=world?.truthGraph;if(!graph)return null;
  const results=domain==='NEXO'?graph.results:graph.results.filter(r=>r.domain===domain);
  if(!results.length)return null;
  const conflicts=results.filter(r=>r.status==='CONFLICT').length,material=results.filter(r=>r.material).length;
  return <section aria-label="TruthGraph Authority & Capability Radar">
    <div className="section-head secondary"><h2>TruthGraph <span>{material||'0'}</span></h2><span className="eyebrow">AUTHORITY × CAPABILITY</span></div>
    <div className="notice-box"><strong>{conflicts?`${conflicts} conflito${conflicts>1?'s':''} de autoridade`:'Radar reconciliado'}</strong><br/><span className="mono">{graph.fingerprint}</span> · checked {dateTime(graph.checked_at)} · somente conflitos materiais seguem para Integrity.</div>
    <div className="provider-list">{results.map(r=><Finding key={`${r.domain}:${r.fingerprint}`} finding={r}/>)}</div>
    <a className="atlas-launch" href="https://nexo-atlas-control-tower.vercel.app" target="_blank" rel="noopener noreferrer"><span><span className="eyebrow">ATLAS</span><strong>Authority & Capability view</strong><small>Continuar exploração no observatório existente</small></span><span className="atlas-orbit" aria-hidden="true">✧</span><span>↗</span></a>
  </section>;
}
