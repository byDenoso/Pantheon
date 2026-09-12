import type {GraphEdge} from './types';
import type {GraphNode25D} from './types25d';

const quadraticPath=(a:GraphNode25D,b:GraphNode25D,index:number)=>{
  const mx=(a.x+b.x)/2;const my=(a.y+b.y)/2;
  const bend=Math.max(-7,Math.min(7,(b.x-a.x)*.07-(b.y-a.y)*.045+(index%3-1)*1.2));
  return `M ${a.x} ${a.y} Q ${mx-bend} ${my+bend} ${b.x} ${b.y}`;
};

export function GraphEdges25D({nodes,edges,selectedId,selectedEdgeId,onSelectEdge}:{nodes:GraphNode25D[];edges:GraphEdge[];selectedId?:string|null;selectedEdgeId?:string|null;onSelectEdge?:(id:string|null)=>void}){
  const byId=new Map(nodes.map(node=>[node.id,node]));
  return <svg className="graph-25d-edges" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
    {edges.map((edge,index)=>{
      const source=byId.get(edge.source);const target=byId.get(edge.target);if(!source||!target)return null;
      const type=String(edge.type||'').toUpperCase();const learning=type.includes('LEARNING');
      const selected=edge.id===selectedEdgeId;const related=selectedId===edge.source||selectedId===edge.target;
      const back=(source.z+target.z)/2<0;
      return <path key={edge.id} d={quadraticPath(source,target,index)} className={`graph-25d-edge${learning?' is-learning':''}${selected?' is-selected':''}${related?' is-related':''}${back?' is-back':''}`} onClick={event=>{event.stopPropagation();onSelectEdge?.(edge.id)}}/>;
    })}
  </svg>;
}
