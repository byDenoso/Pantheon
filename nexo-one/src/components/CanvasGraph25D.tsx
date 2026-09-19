import {useEffect,useMemo,useRef,useState} from 'react';
import './CanvasGraph25D.css';

export type CanvasNode25D={
  id:string;
  label:string;
  x:number;
  y:number;
  z:number;
  radius?:number;
  color?:string;
  opacity?:number;
  major?:boolean;
};

export type CanvasEdge25D={
  id:string;
  from:string;
  to:string;
  color?:string;
  opacity?:number;
  width?:number;
  dashed?:boolean;
};

type ViewState={yaw:number;pitch:number;zoom:number};
type ScreenNode={
  node:CanvasNode25D;
  x:number;
  y:number;
  z:number;
  radius:number;
  depth:number;
};

const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));

function roundedRect(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r:number){
  const radius=Math.min(r,w/2,h/2);
  ctx.beginPath();
  ctx.moveTo(x+radius,y);
  ctx.arcTo(x+w,y,x+w,y+h,radius);
  ctx.arcTo(x+w,y+h,x,y+h,radius);
  ctx.arcTo(x,y+h,x,y,radius);
  ctx.arcTo(x,y,x+w,y,radius);
  ctx.closePath();
}

function rotatePoint(node:CanvasNode25D,view:ViewState){
  const cy=Math.cos(view.yaw),sy=Math.sin(view.yaw);
  const cp=Math.cos(view.pitch),sp=Math.sin(view.pitch);
  const x1=node.x*cy-node.z*sy;
  const z1=node.x*sy+node.z*cy;
  const y1=node.y*cp-z1*sp;
  const z2=node.y*sp+z1*cp;
  return {x:x1,y:y1,z:z2};
}

export function CanvasGraph25D({
  nodes,edges,selectedId,onSelect,className='',ariaLabel='Grafo Canvas 2.5D',
}:{
  nodes:CanvasNode25D[];
  edges:CanvasEdge25D[];
  selectedId:string|null;
  onSelect:(id:string|null)=>void;
  className?:string;
  ariaLabel?:string;
}){
  const hostRef=useRef<HTMLDivElement|null>(null);
  const canvasRef=useRef<HTMLCanvasElement|null>(null);
  const screenRef=useRef<ScreenNode[]>([]);
  const pointerRef=useRef<{id:number;x:number;y:number;moved:boolean}|null>(null);
  const [size,setSize]=useState({width:1,height:1});
  const [hovered,setHovered]=useState<string|null>(null);
  const [view,setView]=useState<ViewState>({yaw:-0.38,pitch:0.18,zoom:1});

  const byId=useMemo(()=>new Map(nodes.map(node=>[node.id,node])),[nodes]);
  const safeEdges=useMemo(()=>edges.filter(edge=>byId.has(edge.from)&&byId.has(edge.to)),[byId,edges]);

  useEffect(()=>{
    const host=hostRef.current;
    if(!host)return;
    const update=()=>setSize({width:Math.max(1,host.clientWidth),height:Math.max(1,host.clientHeight)});
    update();
    if(typeof ResizeObserver==='undefined'){
      window.addEventListener('resize',update);
      return()=>window.removeEventListener('resize',update);
    }
    const observer=new ResizeObserver(update);
    observer.observe(host);
    return()=>observer.disconnect();
  },[]);

  useEffect(()=>{
    const canvas=canvasRef.current;
    if(!canvas)return;
    const ctx=canvas.getContext('2d',{alpha:true});
    if(!ctx)return;

    const dpr=clamp(window.devicePixelRatio||1,1,2);
    canvas.width=Math.max(1,Math.round(size.width*dpr));
    canvas.height=Math.max(1,Math.round(size.height*dpr));
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,size.width,size.height);

    if(nodes.length===0){
      screenRef.current=[];
      return;
    }

    const rotated=nodes.map(node=>({node,...rotatePoint(node,view)}));
    const xs=rotated.map(point=>point.x);
    const ys=rotated.map(point=>point.y);
    const zs=rotated.map(point=>point.z);
    const spanX=Math.max(1,Math.max(...xs)-Math.min(...xs));
    const spanY=Math.max(1,Math.max(...ys)-Math.min(...ys));
    const maxAbsZ=Math.max(1,...zs.map(value=>Math.abs(value)));
    const reserveBottom=size.width<760?100:72;
    const drawableHeight=Math.max(120,size.height-reserveBottom-46);
    const baseScale=Math.max(.1,Math.min((size.width*.72)/spanX,(drawableHeight*.68)/spanY));
    const centerX=size.width/2;
    const centerY=42+drawableHeight/2;

    const screen:ScreenNode[]=rotated.map(point=>{
      const depthNorm=clamp(point.z/maxAbsZ,-1,1);
      const perspective=1+depthNorm*.2;
      const scale=baseScale*view.zoom*perspective;
      const radius=clamp((point.node.radius??1)*5.2*perspective,4,30);
      return {
        node:point.node,
        x:centerX+point.x*scale,
        y:centerY+point.y*scale,
        z:point.z,
        radius,
        depth:depthNorm,
      };
    });
    screenRef.current=screen;
    const screenById=new Map(screen.map(item=>[item.node.id,item]));

    ctx.save();
    ctx.strokeStyle='rgba(121,231,255,.055)';
    ctx.lineWidth=1;
    for(const radius of [.18,.31,.44]){
      ctx.beginPath();
      ctx.ellipse(centerX,centerY,size.width*radius,drawableHeight*radius*.66,0,0,Math.PI*2);
      ctx.stroke();
    }
    ctx.restore();

    const edgeViews=safeEdges.map(edge=>{
      const from=screenById.get(edge.from)!;
      const to=screenById.get(edge.to)!;
      return {edge,from,to,z:(from.z+to.z)/2};
    }).sort((a,b)=>a.z-b.z);

    for(const item of edgeViews){
      const alpha=clamp((item.edge.opacity??.38)*(.82+(item.from.depth+item.to.depth)*.08),.08,.82);
      ctx.save();
      ctx.globalAlpha=alpha;
      ctx.strokeStyle=item.edge.color||'#68829b';
      ctx.lineWidth=(item.edge.width??1)*(.8+((item.from.depth+item.to.depth+2)/4)*.5);
      if(item.edge.dashed)ctx.setLineDash([7,6]);
      ctx.beginPath();
      ctx.moveTo(item.from.x,item.from.y);
      const mx=(item.from.x+item.to.x)/2;
      const my=(item.from.y+item.to.y)/2-10*Math.abs(item.from.depth-item.to.depth);
      ctx.quadraticCurveTo(mx,my,item.to.x,item.to.y);
      ctx.stroke();
      ctx.restore();
    }

    const ordered=[...screen].sort((a,b)=>a.z-b.z);
    for(const item of ordered){
      const node=item.node;
      const selected=node.id===selectedId;
      const hot=node.id===hovered;
      const baseOpacity=clamp(node.opacity??1,.08,1);
      const depthAlpha=clamp(.68+(item.depth+1)*.14,.55,.98);

      ctx.save();
      ctx.globalAlpha=baseOpacity*depthAlpha;
      ctx.shadowColor=node.color||'#79e7ff';
      ctx.shadowBlur=selected?24:hot?18:node.major?13:7;
      const gradient=ctx.createRadialGradient(
        item.x-item.radius*.28,item.y-item.radius*.32,1,
        item.x,item.y,item.radius*1.25,
      );
      gradient.addColorStop(0,'rgba(255,255,255,.96)');
      gradient.addColorStop(.18,node.color||'#79e7ff');
      gradient.addColorStop(1,'rgba(3,10,18,.92)');
      ctx.fillStyle=gradient;
      ctx.beginPath();
      ctx.arc(item.x,item.y,item.radius,0,Math.PI*2);
      ctx.fill();

      ctx.shadowBlur=0;
      ctx.strokeStyle=selected?'#ffffff':node.color||'#79e7ff';
      ctx.globalAlpha=selected?1:baseOpacity*.68;
      ctx.lineWidth=selected?2:1;
      ctx.beginPath();
      ctx.arc(item.x,item.y,item.radius+(selected?6:2),0,Math.PI*2);
      ctx.stroke();

      if(selected){
        ctx.globalAlpha=.32;
        ctx.beginPath();
        ctx.arc(item.x,item.y,item.radius+12,0,Math.PI*2);
        ctx.stroke();
      }
      ctx.restore();
    }

    const labelNodes=ordered.filter(item=>item.node.major||item.node.id===selectedId||item.node.id===hovered);
    ctx.font='700 10px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.textBaseline='middle';
    for(const item of labelNodes){
      const label=item.node.label.length>34?item.node.label.slice(0,33)+'…':item.node.label;
      const metrics=ctx.measureText(label);
      const w=Math.min(188,metrics.width+18);
      const h=24;
      const x=clamp(item.x-w/2,8,size.width-w-8);
      const y=clamp(item.y+item.radius+8,8,size.height-h-8);
      ctx.save();
      ctx.globalAlpha=clamp(item.node.opacity??1,.16,1);
      ctx.fillStyle='rgba(3,10,18,.88)';
      ctx.strokeStyle=item.node.id===selectedId?'rgba(255,255,255,.8)':item.node.color||'#79e7ff';
      ctx.lineWidth=1;
      roundedRect(ctx,x,y,w,h,12);
      ctx.fill();ctx.stroke();
      ctx.fillStyle='#eefaff';
      ctx.textAlign='center';
      ctx.fillText(label,x+w/2,y+h/2+.5);
      ctx.restore();
    }
  },[hovered,nodes,safeEdges,selectedId,size,view]);

  const hit=(x:number,y:number)=>{
    let best:ScreenNode|null=null;
    for(const item of screenRef.current){
      const distance=Math.hypot(item.x-x,item.y-y);
      if(distance<=item.radius+14&&(!best||item.z>best.z))best=item;
    }
    return best;
  };

  const reset=()=>setView({yaw:-.38,pitch:.18,zoom:1});
  const rotate=(delta:number)=>setView(current=>({...current,yaw:current.yaw+delta}));
  const zoom=(factor:number)=>setView(current=>({...current,zoom:clamp(current.zoom*factor,.48,3.2)}));

  return <div ref={hostRef} className={`canvas25d-root ${className}`} data-renderer="canvas-2.5d">
    <canvas
      ref={canvasRef}
      className="canvas25d-canvas"
      aria-label={ariaLabel}
      role="img"
      onPointerDown={event=>{
        const rect=event.currentTarget.getBoundingClientRect();
        pointerRef.current={id:event.pointerId,x:event.clientX-rect.left,y:event.clientY-rect.top,moved:false};
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={event=>{
        const rect=event.currentTarget.getBoundingClientRect();
        const x=event.clientX-rect.left,y=event.clientY-rect.top;
        const pointer=pointerRef.current;
        if(pointer&&pointer.id===event.pointerId){
          const dx=x-pointer.x,dy=y-pointer.y;
          if(Math.abs(dx)+Math.abs(dy)>2)pointer.moved=true;
          setView(current=>({
            ...current,
            yaw:current.yaw+dx*.007,
            pitch:clamp(current.pitch+dy*.005,-1.05,1.05),
          }));
          pointer.x=x;pointer.y=y;
        }else{
          setHovered(hit(x,y)?.node.id??null);
        }
      }}
      onPointerUp={event=>{
        const rect=event.currentTarget.getBoundingClientRect();
        const pointer=pointerRef.current;
        if(pointer&&pointer.id===event.pointerId&&!pointer.moved){
          const target=hit(event.clientX-rect.left,event.clientY-rect.top);
          onSelect(target?.node.id??null);
        }
        pointerRef.current=null;
        try{event.currentTarget.releasePointerCapture(event.pointerId);}catch{}
      }}
      onPointerCancel={()=>{pointerRef.current=null;}}
      onPointerLeave={()=>{if(!pointerRef.current)setHovered(null);}}
      onWheel={event=>{
        event.preventDefault();
        zoom(event.deltaY<0?1.1:.9);
      }}
    />
    <div className="canvas25d-status" aria-live="polite">
      <i/>{nodes.length} nós · {safeEdges.length} relações · Canvas 2.5D
    </div>
    <div className="canvas25d-controls" role="group" aria-label="Controles do grafo">
      <button type="button" onClick={reset}>Enquadrar</button>
      <button type="button" aria-label="Girar para a esquerda" onClick={()=>rotate(-.32)}>←</button>
      <button type="button" aria-label="Girar para a direita" onClick={()=>rotate(.32)}>→</button>
      <button type="button" aria-label="Aproximar" onClick={()=>zoom(1.18)}>+</button>
      <button type="button" aria-label="Afastar" onClick={()=>zoom(.84)}>−</button>
    </div>
  </div>;
}
