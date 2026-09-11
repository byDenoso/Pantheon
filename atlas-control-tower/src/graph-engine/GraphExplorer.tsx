import {useEffect,useMemo,useRef,useState} from 'react';
import '../design/graph-v2.css';
import {loadGraphRuntime} from './runtime';
import type {GraphEdge,GraphNode,GraphProjection} from './types';

type Props={projection:GraphProjection;learningEdges?:GraphEdge[];learning:boolean;selectedId?:string|null;onSelect:(id:string|null)=>void;onOpen?:(node:GraphNode)=>void;onToggleLearning?:(value:boolean)=>void};
const colorFor=(type:string)=>{const t=type.toUpperCase();if(t==='ROOT')return 0xb9fbff;if(t==='DOMAIN')return 0x5cc8ff;if(t==='SUBGRAPH')return 0x7b72ff;if(t==='TEST')return 0xffcc78;if(t==='CLAIM')return 0xd98cff;if(t==='RESULT'||t==='EVIDENCE')return 0x69e7be;return 0x8ca8ff};
const px=(value:number|undefined,size:number)=>((value??50)/100)*size;

export function GraphExplorer({projection,learningEdges=[],learning,selectedId=null,onSelect,onOpen,onToggleLearning}:Props){
 const hostRef=useRef<HTMLDivElement|null>(null);
 const [runtimeError,setRuntimeError]=useState(false);
 const [zoom,setZoom]=useState(1);
 const selected=useMemo(()=>projection.nodes.find(node=>node.id===selectedId)||null,[projection.nodes,selectedId]);
 useEffect(()=>{
  let disposed=false;let cleanup=()=>{};
  void loadGraphRuntime().then(async({PIXI,gsap})=>{
   if(disposed||!hostRef.current)return;
   const host=hostRef.current;host.innerHTML='';setRuntimeError(false);
   const app=new PIXI.Application();
   await app.init({resizeTo:host,backgroundAlpha:0,antialias:true,resolution:Math.min(devicePixelRatio||1,2),autoDensity:true});
   if(disposed){app.destroy(true);return}
   host.appendChild(app.canvas);const stage=app.stage;stage.eventMode='static';
   const draw=()=>{
    stage.removeChildren();
    const width=Math.max(host.clientWidth,760),height=Math.max(host.clientHeight,560);
    const byId=new Map(projection.nodes.map(node=>[node.id,node]));
    const structural=new PIXI.Graphics();
    for(const edge of projection.edges){
     const a=byId.get(edge.source),b=byId.get(edge.target);if(!a||!b)continue;
     const x1=px(a.x,width),y1=px(a.y,height),x2=px(b.x,width),y2=px(b.y,height);
     const dim=Boolean(selectedId&&edge.source!==selectedId&&edge.target!==selectedId);
     structural.moveTo(x1,y1).bezierCurveTo((x1+x2)/2,y1-18,(x1+x2)/2,y2+18,x2,y2).stroke({width:edge.type==='CONTEXT'?1.2:1.8,color:0x426dff,alpha:dim?.14:.42});
    }
    stage.addChild(structural);
    if(learning){
     const layer=new PIXI.Graphics();
     for(const edge of learningEdges){
      const a=byId.get(edge.source),b=byId.get(edge.target);if(!a||!b)continue;
      const x1=px(a.x,width),y1=px(a.y,height),x2=px(b.x,width),y2=px(b.y,height);
      const cross=String(edge.metadata?.scope||'')==='cross-domain';
      layer.moveTo(x1,y1).bezierCurveTo((x1+x2)/2,y1-42,(x1+x2)/2,y2+42,x2,y2).stroke({width:2.6,color:cross?0x58e7ff:0xb16cff,alpha:.78});
     }
     stage.addChild(layer);
    }
    for(const node of projection.nodes){
     const wrap=new PIXI.Container();wrap.x=px(node.x,width);wrap.y=px(node.y,height);wrap.eventMode='static';wrap.cursor='pointer';
     const graphics=new PIXI.Graphics();const radius=node.type==='ROOT'?38:node.type==='DOMAIN'?30:node.type==='SUBGRAPH'?24:16;
     graphics.circle(0,0,radius+10).fill({color:colorFor(node.type),alpha:.08});
     graphics.circle(0,0,radius).fill({color:colorFor(node.type),alpha:selectedId&&selectedId!==node.id?.52:.95}).stroke({width:selectedId===node.id?3:1.2,color:0xd7f7ff,alpha:selectedId===node.id?.95:.38});
     wrap.addChild(graphics);
     const label=new PIXI.Text({text:node.label,style:{fontFamily:'Recursive,system-ui',fontSize:node.type==='ROOT'?15:12,fill:0xeaf7ff,fontWeight:'600',align:'center'}});label.anchor.set(.5,0);label.y=radius+12;wrap.addChild(label);
     let lastTap=0;wrap.on('pointertap',()=>{const now=performance.now();if(now-lastTap<360&&onOpen)onOpen(node);else onSelect(node.id);lastTap=now});stage.addChild(wrap);
    }
    stage.scale.set(zoom);gsap.fromTo(stage,{alpha:0},{alpha:1,duration:.34,ease:'power2.out'});
   };
   draw();const resize=new ResizeObserver(draw);resize.observe(host);cleanup=()=>{resize.disconnect();app.destroy(true,{children:true})};
  }).catch(()=>setRuntimeError(true));
  return()=>{disposed=true;cleanup()};
 },[projection,learningEdges,learning,selectedId,onOpen,onSelect,zoom]);
 return <section className="graph-v2-shell"><div className="graph-v2-toolbar"><div><strong>{projection.breadcrumbs.map(item=>item.label).join(' / ')||'NEXO'}</strong><span>{projection.nodes.length} nós · {projection.edges.length} relações</span></div><div className="graph-v2-controls"><button className={!learning?'active':''} onClick={()=>onToggleLearning?.(false)}>Estrutura</button><button className={learning?'active':''} onClick={()=>onToggleLearning?.(true)}>Learning</button><button aria-label="Reduzir zoom" onClick={()=>setZoom(value=>Math.max(.7,+(value-.1).toFixed(2)))}>−</button><button aria-label="Aumentar zoom" onClick={()=>setZoom(value=>Math.min(1.6,+(value+.1).toFixed(2)))}>+</button></div></div><div className="graph-v2-main"><div className="graph-v2-canvas" ref={hostRef}>{runtimeError?<div className="nexo-empty-state"><h3>Renderer indisponível</h3><p>O estado canônico foi preservado.</p></div>:null}</div><aside className="graph-v2-inspector" aria-live="polite">{selected?<><span className="panel-kicker">{selected.type}</span><h3>{selected.label}</h3><p>{selected.summary||'Sem descrição publicada.'}</p><dl>{Object.entries(selected.metrics||{}).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{value??'—'}</dd></div>)}</dl>{onOpen?<button onClick={()=>onOpen(selected)}>Explorar →</button>:null}</>:<><span className="panel-kicker">EXPLORAÇÃO</span><h3>Selecione um nó</h3><p>Um clique inspeciona. Dois cliques aprofundam. Learning adiciona filamentos sem mover a estrutura.</p></>}</aside></div></section>;
}
