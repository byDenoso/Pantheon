import {useEffect,useMemo,useRef,useState,type CSSProperties,type PointerEvent,type WheelEvent} from 'react';
import './graph25d.css';
import {GraphCluster25D} from './GraphCluster25D';
import {GraphEdges25D} from './GraphEdges25D';
import {GraphNode25D} from './GraphNode25D';
import {GraphOrbit25D} from './GraphOrbit25D';
import {DEFAULT_CAMERA_25D,dollyCamera25D,flyToNode,orbitCamera25D,panCamera25D,type Camera25D} from './camera25d';
import {buildLayout25D} from './layout25d';
import type {GraphSurfaceProps} from './GraphScene3D';

type Props=GraphSurfaceProps&{onUse3D?:()=>void;onRollback?:()=>void};
type DragState={pointerId:number;x:number;y:number;camera:Camera25D;mode:'orbit'|'pan'};
const displayValue=(value:unknown)=>value===null||value===undefined||value===''?'—':typeof value==='object'?JSON.stringify(value):String(value);

export function GraphScene25D({projection,learningEdges=[],learning,selectedId=null,selectedEdgeId=null,onSelect,onSelectEdge,onToggleLearning,onUse3D,onRollback}:Props){
  const layout=useMemo(()=>buildLayout25D(projection),[projection]);
  const edges=useMemo(()=>[
    ...projection.edges,
    ...(learning?learningEdges.map(edge=>({...edge,type:`LEARNING_${edge.type}`})):[]),
  ],[learning,learningEdges,projection.edges]);
  const selected=useMemo(()=>projection.nodes.find(node=>node.id===selectedId)||null,[projection.nodes,selectedId]);
  const selectedEdge=useMemo(()=>edges.find(edge=>edge.id===selectedEdgeId)||null,[edges,selectedEdgeId]);
  const neighbours=useMemo(()=>{
    const ids=new Set<string>();
    if(!selectedId)return ids;
    ids.add(selectedId);
    for(const edge of edges){if(edge.source===selectedId)ids.add(edge.target);if(edge.target===selectedId)ids.add(edge.source)}
    return ids;
  },[edges,selectedId]);
  const labelIds=useMemo(()=>{
    const ranked=[...layout.nodes].sort((a,b)=>b.priority-a.priority||a.id.localeCompare(b.id));
    const ids=new Set(ranked.slice(0,30).map(node=>node.id));
    if(layout.focusId)ids.add(layout.focusId);if(selectedId)ids.add(selectedId);for(const id of neighbours)ids.add(id);
    return ids;
  },[layout.nodes,layout.focusId,neighbours,selectedId]);

  const [camera,setCamera]=useState<Camera25D>(DEFAULT_CAMERA_25D);const [scale,setScale]=useState(1);
  const [autoOrbit,setAutoOrbit]=useState(false);const [showLabels,setShowLabels]=useState(true);const [reducedMotion,setReducedMotion]=useState(false);const [flying,setFlying]=useState(false);
  const drag=useRef<DragState|null>(null);const flyFrame=useRef(0);

  useEffect(()=>{
    const media=window.matchMedia('(prefers-reduced-motion: reduce)');const sync=()=>setReducedMotion(media.matches);sync();media.addEventListener?.('change',sync);return()=>media.removeEventListener?.('change',sync);
  },[]);
  useEffect(()=>()=>cancelAnimationFrame(flyFrame.current),[]);
  useEffect(()=>{
    if(!autoOrbit||reducedMotion||flying)return;
    let frame=0;let last=performance.now();
    const tick=(now:number)=>{const delta=Math.min(40,now-last);last=now;setCamera(value=>orbitCamera25D(value,delta*.055,0));frame=requestAnimationFrame(tick)};
    frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);
  },[autoOrbit,reducedMotion,flying]);

  const animateCamera=(target:Camera25D)=>{
    cancelAnimationFrame(flyFrame.current);
    if(reducedMotion){setCamera(target);return}
    const started=performance.now();const duration=420;const from=camera;setFlying(true);
    const step=(now:number)=>{const t=Math.min(1,(now-started)/duration);const eased=1-Math.pow(1-t,3);setCamera({
      yaw:from.yaw+(target.yaw-from.yaw)*eased,
      pitch:from.pitch+(target.pitch-from.pitch)*eased,
      dolly:from.dolly+(target.dolly-from.dolly)*eased,
      panX:from.panX+(target.panX-from.panX)*eased,
      panY:from.panY+(target.panY-from.panY)*eased,
    });if(t<1)flyFrame.current=requestAnimationFrame(step);else setFlying(false)};
    flyFrame.current=requestAnimationFrame(step);
  };

  const onPointerDown=(event:PointerEvent<HTMLDivElement>)=>{
    const target=event.target as HTMLElement;if(target.closest('button')||target.closest('path'))return;
    event.currentTarget.setPointerCapture(event.pointerId);drag.current={pointerId:event.pointerId,x:event.clientX,y:event.clientY,camera,mode:event.shiftKey?'pan':'orbit'};
  };
  const onPointerMove=(event:PointerEvent<HTMLDivElement>)=>{
    const current=drag.current;if(!current||current.pointerId!==event.pointerId)return;
    const dx=event.clientX-current.x;const dy=event.clientY-current.y;
    setCamera(current.mode==='pan'?panCamera25D(current.camera,dx,dy):orbitCamera25D(current.camera,dx,dy));
  };
  const stopDrag=(event:PointerEvent<HTMLDivElement>)=>{if(drag.current?.pointerId===event.pointerId)drag.current=null;if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId)};
  const onWheel=(event:WheelEvent<HTMLDivElement>)=>{event.preventDefault();setCamera(value=>dollyCamera25D(value,event.deltaY<0?34:-34))};
  const reset=()=>{cancelAnimationFrame(flyFrame.current);setFlying(false);setCamera(DEFAULT_CAMERA_25D);setScale(1)};
  const focusNode=(id:string)=>{const node=layout.nodes.find(candidate=>candidate.id===id);if(!node)return;animateCamera(flyToNode(camera,node))};
  const {yaw,pitch,dolly,panX,panY}=camera;
  const planeStyle={transform:`translate3d(${panX}px,${panY}px,${dolly}px) rotateX(${pitch}deg) rotateY(${yaw}deg) scale(${scale})`} as CSSProperties;

  return <section className="graph-25d-shell" data-renderer="25d">
    <div className="graph-25d-toolbar">
      <div className="graph-25d-status"><i/><strong>{projection.nodes.length} nós</strong><span>{edges.length} relações · CSS 2.5D · navegação 3D</span></div>
      <button className={!learning?'active':''} onClick={()=>onToggleLearning?.(false)}>Estrutura</button>
      <button className={learning?'active':''} onClick={()=>onToggleLearning?.(!learning)}>Learning</button>
      <button className={showLabels?'active':''} onClick={()=>setShowLabels(value=>!value)}>Labels</button>
      <button className={autoOrbit?'active':''} disabled={reducedMotion} onClick={()=>setAutoOrbit(value=>!value)}>Auto orbit</button>
      {onUse3D?<button onClick={onUse3D}>3D legado</button>:null}
      {onRollback?<button onClick={onRollback}>2D</button>:null}
    </div>

    <div className="graph-25d-stage" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={stopDrag} onPointerCancel={stopDrag} onWheel={onWheel} onClick={()=>onSelect(null)}>
      <div className="graph-25d-starfield" aria-hidden="true"/>
      <div className="graph-25d-fog" aria-hidden="true"/>
      <div className="graph-25d-navhint">Arraste: orbitar · Shift + arraste: pan · scroll: profundidade · duplo clique: focar</div>
      <div className="graph-25d-plane" style={planeStyle}>
        <GraphEdges25D nodes={layout.nodes} edges={edges} selectedId={selectedId} selectedEdgeId={selectedEdgeId} onSelectEdge={onSelectEdge}/>
        {layout.clusters.map(cluster=><GraphCluster25D key={cluster.id} cluster={cluster}/>)}
        {layout.orbits.map(orbit=><GraphOrbit25D key={orbit.id} orbit={orbit}/>)}
        {layout.nodes.map(node=>{
          const highlighted=Boolean(selectedId&&neighbours.has(node.id)&&node.id!==selectedId);const dimmed=Boolean(selectedId&&!neighbours.has(node.id)&&!node.isFocus);
          return <GraphNode25D key={node.id} node={node} selected={node.id===selectedId} highlighted={highlighted} dimmed={dimmed} showLabel={showLabels&&(labelIds.has(node.id)||highlighted)} onSelect={onSelect} onFocus={focusNode}/>;
        })}
      </div>
    </div>

    <div className="graph-25d-hud">
      <button type="button" onClick={reset} aria-label="Reenquadrar">↺</button>
      <button type="button" onClick={()=>setScale(value=>Math.max(.72,value-.08))} aria-label="Afastar">−</button>
      <button type="button" onClick={()=>setScale(value=>Math.min(1.45,value+.08))} aria-label="Aproximar">+</button>
    </div>

    <aside className={`graph-25d-inspector ${selected||selectedEdge?'is-open':''}`}>
      {selected?<><span className="panel-kicker">{selected.type}</span><h3>{selected.label}</h3><p>{selected.summary||'Sem descrição publicada.'}</p><button type="button" onClick={()=>focusNode(selected.id)}>Focar em 3D</button><dl><div><dt>Status</dt><dd>{displayValue(selected.status)}</dd></div>{Object.entries(selected.metrics||{}).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{displayValue(value)}</dd></div>)}</dl></>:selectedEdge?<><span className="panel-kicker">RELAÇÃO</span><h3>{selectedEdge.type}</h3><p>{selectedEdge.source} → {selectedEdge.target}</p><button onClick={()=>onSelectEdge?.(null)}>Limpar seleção</button></>:null}
    </aside>

    <div className="graph-25d-a11y">{layout.nodes.slice(0,180).map(node=><button key={node.id} onClick={()=>onSelect(node.id)} onDoubleClick={()=>focusNode(node.id)}>{node.label}</button>)}</div>
  </section>;
}
