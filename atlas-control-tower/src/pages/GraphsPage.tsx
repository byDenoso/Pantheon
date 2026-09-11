import {useEffect,useMemo,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {PageHeader} from '../components/PageHeader';
import {loadUniversesSources} from '../data/load-universes';
import {buildUniversesModel} from '../data/universes-model';

const positions=[{x:32,y:28},{x:68,y:28},{x:32,y:70},{x:68,y:70}];

export default function GraphsPage(){
 const navigate=useNavigate();
 const [sources,setSources]=useState<any>(undefined);
 useEffect(()=>{let live=true;void loadUniversesSources().then(value=>{if(live)setSources(value)});return()=>{live=false}},[]);
 const model=useMemo(()=>buildUniversesModel(sources?.root??null,sources?.details??{}),[sources]);
 return <div className="nexo-page graphs-page">
  <PageHeader eyebrow="REDE" title="Grafos" description="Navegue pelos grafos publicados e aprofunde do universo ao subgrafo estrutural."/>
  <section className="graphs-toolbar"><strong>Mapa de grafos</strong><span>{sources===undefined?'Carregando…':model.available?model.sourceLabel.toUpperCase():'Fonte indisponível'}</span></section>
  {!sources?<section className="nexo-empty-state"><h2>Carregando mapa</h2><p>Aguardando a projeção canônica.</p></section>:null}
  {sources&&model.available?<section className="graphs-stage" aria-label="Mapa de grafos publicados">
   <svg viewBox="0 0 1000 680" role="img" aria-label={`${model.items.length} grafos publicados`}>
    <defs><radialGradient id="graphsHub"><stop offset="0" stopColor="#8df4ff"/><stop offset=".5" stopColor="#2979ff"/><stop offset="1" stopColor="#643cff" stopOpacity=".08"/></radialGradient><filter id="graphsGlow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="10" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
    <g className="graphs-rings" aria-hidden="true"><ellipse cx="500" cy="340" rx="360" ry="245"/><ellipse cx="500" cy="340" rx="270" ry="180"/><ellipse cx="500" cy="340" rx="170" ry="110"/></g>
    <g className="graphs-root" aria-hidden="true"><circle cx="500" cy="340" r="66" fill="url(#graphsHub)" filter="url(#graphsGlow)"/><text x="500" y="346" textAnchor="middle">NEXO</text></g>
    {model.items.map((item,index)=>{const pos=positions[index]||{x:50,y:50};const x=pos.x*10,y=pos.y*6.8;return <g key={item.id} className="graphs-domain-node" transform={`translate(${x} ${y})`} role="button" tabIndex={0} aria-label={`Abrir grafo ${item.label}`} onClick={()=>navigate(`/graphs/${item.id}`)} onKeyDown={event=>{if(event.key==='Enter')navigate(`/graphs/${item.id}`)}}><line x1={500-x} y1={340-y} x2="0" y2="0"/><circle className="graphs-node-halo" r="52"/><circle className="graphs-node-core" r="34"/><text className="graphs-node-title" y="62" textAnchor="middle">{item.label}</text><text className="graphs-node-meta" y="82" textAnchor="middle">{item.subdomainCount===null?'—':`${item.subdomainCount} subgrafos`}</text></g>})}
   </svg>
   <aside className="graphs-help"><span className="panel-kicker">DRILL-DOWN</span><h3>Clique em um grafo</h3><p>O próximo nível mostra apenas os subgrafos realmente publicados para aquele universo.</p></aside>
  </section>:null}
  {sources&&!model.available?<section className="nexo-empty-state"><h2>Mapa indisponível</h2><p>Nenhum grafo foi sintetizado para preencher a ausência da SSOT.</p></section>:null}
 </div>;
}
