import type {GraphSurfaceProps} from './GraphScene3D';

type Props=GraphSurfaceProps&{onUse3D?:()=>void;onRollback?:()=>void};

export function GraphScene25D({projection,learning,onToggleLearning,onUse3D,onRollback}:Props){
  return <section className="graph-25d-shell" data-renderer="25d">
    <div className="graph-25d-toolbar">
      <strong>{projection.nodes.length} nós</strong>
      <span>{projection.edges.length} relações · CSS 2.5D</span>
      <button className={!learning?'active':''} onClick={()=>onToggleLearning?.(false)}>Estrutura</button>
      <button className={learning?'active':''} onClick={()=>onToggleLearning?.(!learning)}>Learning</button>
      {onUse3D?<button onClick={onUse3D}>3D</button>:null}
      {onRollback?<button onClick={onRollback}>2D</button>:null}
    </div>
  </section>;
}
