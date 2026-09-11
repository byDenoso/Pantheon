import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { loadUniversesSources } from '../data/load-universes';
import { buildUniversesModel } from '../data/universes-model';

type Sources=Awaited<ReturnType<typeof loadUniversesSources>>;
const icons:Record<string,string>={science:'✦',engineering:'⌘',olympus:'△',ai:'◇'};
const value=(n:number|null)=>n===null?'—':new Intl.NumberFormat('pt-BR').format(n);

export default function UniversesPage(){
 const [sources,setSources]=useState<Sources|null>(null);
 const [loading,setLoading]=useState(true);
 const reload=useCallback(async()=>{setLoading(true);setSources(await loadUniversesSources());setLoading(false)},[]);
 useEffect(()=>{void reload()},[reload]);
 const model=useMemo(()=>buildUniversesModel(sources?.root??null,sources?.details??{}),[sources]);
 return <div className="nexo-page universes-page">
  <PageHeader eyebrow="NEXO ATLAS" title="Universos" description="Explore os grandes contextos do NEXO. A landing organiza; o grafo só aparece quando há algo específico para investigar."
   actions={<button className="nexo-button" onClick={()=>void reload()} disabled={loading}>{loading?'Atualizando…':'Atualizar'}</button>}/>
  <div className="universe-source-row">
   <span className={`overview-source ${model.available?'ok':'offline'}`}><i/>{model.available?model.sourceLabel.toUpperCase():'Fonte indisponível'}</span>
  </div>
  {!model.available?<section className="nexo-empty-state"><h2>Universos indisponíveis</h2><p>O catálogo não inventa estrutura quando a projeção raiz não responde.</p></section>:null}  {model.available?<section className="universe-grid" aria-label="Universos declarados">
   {model.items.map(item=><Link className={`universe-card ${item.id}`} to={item.path} key={item.id}>
    <div className="universe-card-top"><span className="universe-icon">{icons[item.id]||'◌'}</span><span className="status-pill">{item.status||'—'}</span></div>
    <div><span className="panel-kicker">UNIVERSO</span><h2>{item.label}</h2><p>{item.description}</p></div>
    <dl className="universe-card-facts">
     <div><dt>Subdomínios</dt><dd>{value(item.subdomainCount)}</dd></div>
     <div><dt>Entidades</dt><dd>{value(item.entityCount)}</dd></div>
    </dl>
    <span className="universe-open">Explorar <b>↗</b></span>
   </Link>)}
  </section>:null}
  {model.available&&model.items.length===0?<section className="nexo-empty-state"><h2>Nenhum universo declarado</h2><p>A projeção raiz respondeu, mas não publicou universos reconhecidos.</p></section>:null}
  <section className="universe-rule">
   <span className="panel-kicker">REGRA DE NAVEGAÇÃO</span>
   <p><b>Universos organizam contexto.</b> Learning e Operação continuam transversais e por isso não aparecem como universos falsos.</p>
  </section>
 </div>;
}
