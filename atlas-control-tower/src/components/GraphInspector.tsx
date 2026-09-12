import type {GraphEdge,GraphNode} from '../graph-engine/types';

type Props={
  node:GraphNode|null;
  edge:GraphEdge|null;
  navigable:boolean;
  onClose:()=>void;
  onOpenSubgraph?:(id:string)=>void;
};

const displayValue=(value:unknown)=>value===null||value===undefined||value===''?'—':typeof value==='object'?JSON.stringify(value):String(value);

export function GraphInspector({node,edge,navigable,onClose,onOpenSubgraph}:Props){
  if(!node&&!edge)return null;
  return <aside className="graph-3d-inspector is-open" aria-label="Inspector do grafo">
    <button className="graph-3d-inspector-close" onClick={onClose} aria-label="Fechar detalhes">×</button>
    {node?<>
      <span className="panel-kicker">NÓ SELECIONADO · {node.type}</span>
      <h3>{node.label}</h3>
      <p>{node.summary||'Sem descrição publicada.'}</p>
      <div className="graph-inspector-actions">
        {navigable?<button className="primary" onClick={()=>onOpenSubgraph?.(node.id)}>Ver subgrafo <span>→</span></button>:null}
        <a href={`/provenance?entity=${encodeURIComponent(node.id)}`}>Proveniência</a>
      </div>
      <dl>
        <div><dt>Tipo</dt><dd>{displayValue(node.type)}</dd></div>
        <div><dt>Status</dt><dd>{displayValue(node.status)}</dd></div>
        <div><dt>ID</dt><dd>{node.id}</dd></div>
        {Object.entries(node.metrics||{}).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{displayValue(value)}</dd></div>)}
      </dl>
    </>:edge?<>
      <span className="panel-kicker">RELAÇÃO</span>
      <h3>{edge.type}</h3>
      <p>{edge.source} → {edge.target}</p>
      <div className="graph-inspector-actions"><a href={`/provenance?edge=${encodeURIComponent(edge.id)}`}>Proveniência</a></div>
      <dl>
        <div><dt>Força</dt><dd>{displayValue(edge.strength)}</dd></div>
        <div><dt>Direção</dt><dd>{displayValue(edge.direction)}</dd></div>
        {Object.entries(edge.metadata||{}).slice(0,8).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{displayValue(value)}</dd></div>)}
      </dl>
    </>:null}
  </aside>;
}
