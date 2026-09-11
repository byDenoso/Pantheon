import {useMemo,useState} from 'react';
import {useNavigate} from 'react-router-dom';

type Position={x:number;y:number;z:number};
type Node={id:string;label:string;summary:string;status:string;relationCount:number;relationStrength:number|null;position:Position};
type Edge={id:string;source:string;target:string;strength:number|null};
type Model={universeLabel:string;domains:Node[];relations:Edge[]};
type Props={model:Model;basePath:string};

const pt=(position:Position)=>({x:position.x*10,y:position.y*6.5});
const curve=(a:Position,b:Position)=>{const p1=pt(a),p2=pt(b);const mx=(p1.x+p2.x)/2;const my=(p1.y+p2.y)/2;return 'M '+p1.x+' '+p1.y+' Q '+mx+' '+(my-40)+' '+p2.x+' '+p2.y};

export function SubgraphMap({model,basePath}:Props){
 const navigate=useNavigate();
 const [selectedId,setSelectedId]=useState<string|null>(null);
 const selected=model.domains.find(item=>item.id===selectedId)||null;
 const byId=useMemo(()=>new Map(model.domains.map(item=>[item.id,item])),[model.domains]);
 const related=useMemo(()=>{const ids=new Set<string>();if(!selectedId)return ids;ids.add(selectedId);for(const edge of model.relations){if(edge.source===selectedId)ids.add(edge.target);if(edge.target===selectedId)ids.add(edge.source)}return ids},[model.relations,selectedId]);
 const open=(node:Node)=>navigate(basePath+'/'+node.id);
 return <section className="subgraph-explorer">
  <div className="subgraph-canvas" onClick={()=>setSelectedId(null)}>
   <div className="subgraph-caption"><span>SUBGRAFOS</span><h2>{model.universeLabel}</h2><p>Clique para selecionar. Duplo clique ou Enter abre o grafo detalhado.</p></div>
   <svg viewBox="0 0 1000 680" role="img" aria-label={'Subgrafos de '+model.universeLabel}>
    <defs><radialGradient id="subgraphCore"><stop offset="0" stopColor="#c8fbff"/><stop offset=".28" stopColor="#5ac8ff"/><stop offset=".72" stopColor="#4c66ff"/><stop offset="1" stopColor="#6d35e8" stopOpacity=".3"/></radialGradient><linearGradient id="subgraphEdge" x1="0" x2="1"><stop stopColor="#44d9ff"/><stop offset=".52" stopColor="#4679ff"/><stop offset="1" stopColor="#a653ff"/></linearGradient><filter id="subgraphGlow" x="-90%" y="-90%" width="280%" height="280%"><feGaussianBlur stdDeviation="9" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
    <g className="subgraph-grid" aria-hidden="true"><ellipse cx="500" cy="350" rx="390" ry="250"/><ellipse cx="500" cy="350" rx="300" ry="190"/><ellipse cx="500" cy="350" rx="205" ry="126"/></g>
    <g className="subgraph-edges" aria-hidden="true">{model.relations.map(edge=>{const a=byId.get(edge.source),b=byId.get(edge.target);if(!a||!b)return null;const active=!selectedId||edge.source===selectedId||edge.target===selectedId;return <path key={edge.id} d={curve(a.position,b.position)} className={active?'active':'dim'}/>})}</g>
    <g className="subgraph-parent" aria-hidden="true"><circle cx="500" cy="350" r="72" fill="url(#subgraphCore)" filter="url(#subgraphGlow)"/><circle cx="500" cy="350" r="94"/><circle cx="500" cy="350" r="118"/><text x="500" y="346" textAnchor="middle">{model.universeLabel}</text><text className="meta" x="500" y="373" textAnchor="middle">{model.domains.length} subgrafos</text></g>
    <g>{model.domains.map(node=>{const p=pt(node.position);const selectedNode=node.id===selectedId;const dim=Boolean(selectedId&&!related.has(node.id));return <g key={node.id} className={'subgraph-node '+(selectedNode?'selected ':'')+(dim?'dim':'')} transform={'translate('+p.x+' '+p.y+')'} role="button" tabIndex={0} aria-label={'Abrir subgrafo '+node.label} onClick={event=>{event.stopPropagation();setSelectedId(node.id)}} onDoubleClick={event=>{event.stopPropagation();open(node)}} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();open(node)}if(event.key==='Escape'){event.preventDefault();setSelectedId(null)}}}><title>{node.label}</title><circle className="orbit outer" r="54"/><circle className="orbit" r="42"/><circle className="halo" r="40"/><circle className="core" r="29"/><text className="code" y="5" textAnchor="middle">{node.id}</text><text className="title" y="68" textAnchor="middle">{node.label}</text><text className="meta" y="87" textAnchor="middle">{node.relationCount} relações</text></g>})}</g>
   </svg>
  </div>
  <aside className="subgraph-inspector" aria-live="polite">{selected?<><span className="panel-kicker">SUBGRAFO SELECIONADO</span><strong>{selected.id}</strong><h3>{selected.label}</h3><p>{selected.summary||'Sem resumo publicado.'}</p><dl><div><dt>Status</dt><dd>{selected.status||'—'}</dd></div><div><dt>Relações</dt><dd>{selected.relationCount}</dd></div><div><dt>Testes compartilhados</dt><dd>{selected.relationStrength===null?'—':selected.relationStrength}</dd></div></dl><button type="button" onClick={()=>open(selected)}>Abrir grafo detalhado →</button></>:<><span className="panel-kicker">EXPLORAÇÃO</span><h3>Escolha um subgrafo</h3><p>O mapa mostra apenas recortes e relações publicados. Selecione um nó para inspecionar suas relações.</p></>}</aside>
 </section>;
}
