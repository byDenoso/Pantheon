import {useMemo} from 'react';
import {buildOrbitalNodes,type AtlasNode} from '../scene/types';
import type {GraphNode} from '../graph-engine/types';

type Props={nodes:GraphNode[];focusId?:string|null;selectedId?:string|null;onSelect?:(id:string)=>void};

export function GraphMinimap({nodes,focusId,selectedId,onSelect}:Props){
  const positioned=useMemo(()=>buildOrbitalNodes(nodes as AtlasNode[],focusId),[focusId,nodes]);
  const bounds=useMemo(()=>{
    const xs=positioned.map(node=>node.position[0]),ys=positioned.map(node=>node.position[1]);
    const minX=Math.min(...xs,-1),maxX=Math.max(...xs,1),minY=Math.min(...ys,-1),maxY=Math.max(...ys,1);
    return{minX,maxX,minY,maxY,width:Math.max(1,maxX-minX),height:Math.max(1,maxY-minY)};
  },[positioned]);
  return <div className="graph-minimap" aria-label="Minimapa do grafo">
    <div className="graph-minimap-viewport"/>
    {positioned.slice(0,220).map(node=>{
      const left=((node.position[0]-bounds.minX)/bounds.width)*100;
      const top=(1-(node.position[1]-bounds.minY)/bounds.height)*100;
      const focus=node.id===focusId,selected=node.id===selectedId;
      return <button key={node.id} className={`graph-minimap-dot ${focus?'focus':''} ${selected?'selected':''}`} style={{left:`${left}%`,top:`${top}%`}} title={String(node.label||node.id)} onClick={()=>onSelect?.(node.id)} aria-label={`Ir para ${node.label||node.id}`}/>;
    })}
  </div>;
}
