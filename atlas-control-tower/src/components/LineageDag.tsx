import { useMemo } from 'react';
import { buildLineageLayout } from '../data/lineage-layout';

type Props={model:any;selectedId?:string|null;onSelect?:(id:string)=>void};
const short=(value:string,max=24)=>value.length>max?`${value.slice(0,max-1)}…`:value;
const kind=(type:string)=>String(type||'entity').toLowerCase().replace(/[^a-z0-9]+/g,'-');

export function LineageDag({model,selectedId,onSelect}:Props){
 const layout=useMemo(()=>buildLineageLayout(model),[model]);
 if(!model?.available)return <div className="lineage-empty">Selecione uma entidade para carregar a cadeia.</div>;
 return <div className="lineage-dag-wrap">
  <svg className="lineage-dag" viewBox="0 0 100 100" role="img" aria-label="Cadeia de lineage">
   <defs>
    <marker id="lineage-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
     <path d="M0,0 L6,3 L0,6 z" className="lineage-arrow"/>
    </marker>
   </defs>
   <g className="lineage-edges">
    {layout.edges.map((edge:any)=><path key={edge.id||`${edge.source}:${edge.target}`} d={edge.path} markerEnd="url(#lineage-arrow)" className={`lineage-edge ${kind(edge.type)}`}/>) }
   </g>
   <g className="lineage-nodes">
    {layout.nodes.map((node:any)=>{
     const selected=node.id===(selectedId||model.focusId);
     return <g key={node.id} className={`lineage-node ${kind(node.type)} ${selected?'selected':''}`} transform={`translate(${node.x} ${node.y})`} onClick={()=>onSelect?.(node.id)} role="button" tabIndex={0}>
      <circle r={selected?4.2:3.4}/>
      <text y="-5.2" textAnchor="middle" className="lineage-node-type">{String(node.type||'ENTITY').toUpperCase()}</text>
      <text y="6.2" textAnchor="middle" className="lineage-node-label">{short(String(node.label||node.id))}</text>
     </g>;
    })}
   </g>
  </svg>
 </div>;
}
