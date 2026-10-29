import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import './CanvasGraph25D.css';

export type CanvasLodLevel='macro'|'medium'|'local'|'focus';

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
  importance?:number;
  minZoom?:number;
  pulse?:boolean;
  halo?:number;
  broken?:boolean;
};

export type CanvasEdge25D={
  id:string;
  from:string;
  to:string;
  color?:string;
  opacity?:number;
  width?:number;
  dashed?:boolean;
  importance?:number;
  minZoom?:number;
};

export type CanvasArm25D={
  id:string;
  points:Array<{x:number;y:number;z:number}>;
  opacity?:number;
  width?:number;
};

export type Canvas25DViewState={
  yaw:number;
  pitch:number;
  zoom:number;
  target:{x:number;y:number;z:number};
};

export type CanvasGraph25DHandle={
  reset:()=>void;
  focusNode:(id:string,zoom?:number)=>boolean;
  focusDomain:(id:string)=>boolean;
  focusSubdomain:(id:string)=>boolean;
  focusEntity:(id:string)=>boolean;
  focusPoint:(point:{x:number;y:number;z:number},zoom?:number)=>void;
  getView:()=>Canvas25DViewState;
};

type ScreenNode={
  node:CanvasNode25D;
  x:number;
  y:number;
  z:number;
  radius:number;
  depth:number;
};

type PointerState={
  x:number;
  y:number;
  moved:boolean;
  button:number;
};

type Props={
  nodes:CanvasNode25D[];
  edges:CanvasEdge25D[];
  arms?:CanvasArm25D[];
  selectedId:string|null;
  onSelect:(id:string|null)=>void;
  className?:string;
  ariaLabel?:string;
  theme?:'dark'|'light';
};

const DEFAULT_VIEW:Canvas25DViewState={
  yaw:-0.34,
  pitch:0.2,
  zoom:0.92,
  target:{x:0,y:0,z:0},
};

const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
const easeOutCubic=(t:number)=>1-Math.pow(1-t,3);

export function lodForZoom(zoom:number):CanvasLodLevel{
  if(zoom<0.9)return'macro';
  if(zoom<1.45)return'medium';
  if(zoom<2.3)return'local';
  return'focus';
}

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

function rotatePoint(
  point:{x:number;y:number;z:number},
  view:Canvas25DViewState,
){
  const translated={
    x:point.x-view.target.x,
    y:point.y-view.target.y,
    z:point.z-view.target.z,
  };
  const cy=Math.cos(view.yaw),sy=Math.sin(view.yaw);
  const cp=Math.cos(view.pitch),sp=Math.sin(view.pitch);
  const x1=translated.x*cy-translated.z*sy;
  const z1=translated.x*sy+translated.z*cy;
  const y1=translated.y*cp-z1*sp;
  const z2=translated.y*sp+z1*cp;
  return{x:x1,y:y1,z:z2};
}

export const CanvasGraph25D=forwardRef<CanvasGraph25DHandle,Props>(function CanvasGraph25D({
  nodes,
  edges,
  arms=[],
  selectedId,
  onSelect,
  className='',
  ariaLabel='Grafo Canvas 2.5D',
  theme='dark',
},ref){
  const hostRef=useRef<HTMLDivElement|null>(null);
  const canvasRef=useRef<HTMLCanvasElement|null>(null);
  const statusRef=useRef<HTMLDivElement|null>(null);
  const screenRef=useRef<ScreenNode[]>([]);
  const pointersRef=useRef(new Map<number,PointerState>());
  const viewRef=useRef<Canvas25DViewState>({
    ...DEFAULT_VIEW,
    target:{...DEFAULT_VIEW.target},
  });
  const rafRef=useRef<number|null>(null);
  const animationRef=useRef<number|null>(null);
  const drawRef=useRef<()=>void>(()=>{});
  const hoveredRef=useRef<string|null>(null);
  const lastScaleRef=useRef(1);
  const [size,setSize]=useState({width:1,height:1});
  const [canvasFailed,setCanvasFailed]=useState(false);

  const byId=useMemo(()=>new Map(nodes.map(node=>[node.id,node])),[nodes]);
  const safeEdges=useMemo(
    ()=>edges.filter(edge=>byId.has(edge.from)&&byId.has(edge.to)),
    [byId,edges],
  );

  const scheduleDraw=()=>{
    if(rafRef.current!==null)return;
    rafRef.current=requestAnimationFrame(()=>{
      rafRef.current=null;
      drawRef.current();
    });
  };

  const prefersReducedMotion=()=>(
    typeof window!=='undefined'
    && typeof window.matchMedia==='function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  const animateTo=(next:Canvas25DViewState,duration=620)=>{
    if(animationRef.current!==null){
      cancelAnimationFrame(animationRef.current);
      animationRef.current=null;
    }
    const start=viewRef.current;
    const started=performance.now();
    const effectiveDuration=prefersReducedMotion()?0:duration;
    if(effectiveDuration===0){
      viewRef.current={
        ...next,
        target:{...next.target},
      };
      scheduleDraw();
      return;
    }
    const tick=(now:number)=>{
      const p=clamp((now-started)/effectiveDuration,0,1);
      const e=easeOutCubic(p);
      viewRef.current={
        yaw:start.yaw+(next.yaw-start.yaw)*e,
        pitch:start.pitch+(next.pitch-start.pitch)*e,
        zoom:start.zoom+(next.zoom-start.zoom)*e,
        target:{
          x:start.target.x+(next.target.x-start.target.x)*e,
          y:start.target.y+(next.target.y-start.target.y)*e,
          z:start.target.z+(next.target.z-start.target.z)*e,
        },
      };
      scheduleDraw();
      if(p<1)animationRef.current=requestAnimationFrame(tick);
      else animationRef.current=null;
    };
    animationRef.current=requestAnimationFrame(tick);
  };

  const reset=()=>animateTo({
    ...DEFAULT_VIEW,
    target:{...DEFAULT_VIEW.target},
  });

  const focusPoint=(point:{x:number;y:number;z:number},zoom=2)=>{
    animateTo({
      ...viewRef.current,
      zoom:clamp(zoom,0.48,4.2),
      target:{...point},
    });
  };

  const focusNode=(id:string,zoom=2.15)=>{
    const node=byId.get(id);
    if(!node)return false;
    focusPoint(node,zoom);
    return true;
  };

  useImperativeHandle(ref,()=>({
    reset,
    focusNode,
    focusDomain:(id:string)=>focusNode(id,1.55),
    focusSubdomain:(id:string)=>focusNode(id,1.9),
    focusEntity:(id:string)=>focusNode(id,2.35),
    focusPoint,
    getView:()=>({
      ...viewRef.current,
      target:{...viewRef.current.target},
    }),
  }),[byId]);

  useEffect(()=>{
    const host=hostRef.current;
    if(!host)return;
    const update=()=>setSize({
      width:Math.max(1,host.clientWidth),
      height:Math.max(1,host.clientHeight),
    });
    update();
    if(typeof ResizeObserver==='undefined'){
      window.addEventListener('resize',update);
      return()=>window.removeEventListener('resize',update);
    }
    const observer=new ResizeObserver(update);
    observer.observe(host);
    return()=>observer.disconnect();
  },[]);

  useEffect(()=>()=>{
    if(rafRef.current!==null)cancelAnimationFrame(rafRef.current);
    if(animationRef.current!==null)cancelAnimationFrame(animationRef.current);
  },[]);

  useEffect(()=>{
    drawRef.current=()=>{
      const canvas=canvasRef.current;
      if(!canvas)return;
      const ctx=canvas.getContext('2d',{alpha:true});
      if(!ctx){
        setCanvasFailed(true);
        return;
      }

      const view=viewRef.current;
      const reducedMotion=prefersReducedMotion();
      const light=theme==='light';
      const ambientGrid=light?'rgba(3,105,161,.08)':'rgba(121,231,255,.055)';
      const labelBackground=light?'rgba(255,255,255,.92)':'rgba(3,10,18,.86)';
      const labelText=light?'#0f172a':'#eefaff';
      const labelStroke=light?'rgba(3,105,161,.46)':'rgba(121,231,255,.62)';
      const nodeShadowFallback=light?'#0369a1':'#79e7ff';
      const nodeEdgeDark=light?'rgba(255,255,255,.96)':'rgba(3,10,18,.94)';
      const dpr=clamp(window.devicePixelRatio||1,1,2);
      const pixelWidth=Math.max(1,Math.round(size.width*dpr));
      const pixelHeight=Math.max(1,Math.round(size.height*dpr));
      if(canvas.width!==pixelWidth||canvas.height!==pixelHeight){
        canvas.width=pixelWidth;
        canvas.height=pixelHeight;
      }
      ctx.setTransform(dpr,0,0,dpr,0,0);
      ctx.clearRect(0,0,size.width,size.height);

      const reserveBottom=size.width<760?104:76;
      const drawableHeight=Math.max(160,size.height-reserveBottom-28);
      const centerX=size.width/2;
      const centerY=18+drawableHeight/2;

      const rotatedNodes=nodes.map(node=>({node,...rotatePoint(node,view)}));
      const rotatedArms=arms.map(arm=>({
        arm,
        points:arm.points.map(point=>rotatePoint(point,view)),
      }));

      let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity,maxAbsZ=1;
      const include=(point:{x:number;y:number;z:number})=>{
        minX=Math.min(minX,point.x);maxX=Math.max(maxX,point.x);
        minY=Math.min(minY,point.y);maxY=Math.max(maxY,point.y);
        maxAbsZ=Math.max(maxAbsZ,Math.abs(point.z));
      };
      rotatedNodes.forEach(include);
      rotatedArms.forEach(arm=>arm.points.forEach(include));
      if(!Number.isFinite(minX)){
        minX=-1;maxX=1;minY=-1;maxY=1;
      }
      const spanX=Math.max(1,maxX-minX);
      const spanY=Math.max(1,maxY-minY);
      const baseScale=Math.max(
        .08,
        Math.min((size.width*.82)/spanX,(drawableHeight*.8)/spanY),
      );
      const worldScale=baseScale*view.zoom;
      lastScaleRef.current=worldScale;

      const toScreen=(point:{x:number;y:number;z:number})=>{
        const depth=clamp(point.z/maxAbsZ,-1,1);
        const perspective=clamp(1+depth*.22,.72,1.3);
        return{
          x:centerX+point.x*worldScale*perspective,
          y:centerY+point.y*worldScale*perspective,
          depth,
          perspective,
        };
      };

      ctx.save();
      ctx.globalAlpha=.42;
      ctx.strokeStyle=ambientGrid;
      ctx.lineWidth=1;
      for(const radius of [.16,.29,.43]){
        ctx.beginPath();
        ctx.ellipse(centerX,centerY,size.width*radius,drawableHeight*radius*.58,0,0,Math.PI*2);
        ctx.stroke();
      }
      ctx.restore();

      for(const {arm,points} of rotatedArms){
        if(points.length<2)continue;
        const projected=points.map(toScreen);
        for(const layer of [
          {width:(arm.width??1)*18,alpha:(arm.opacity??.28)*.08,blur:24},
          {width:(arm.width??1)*7,alpha:(arm.opacity??.28)*.13,blur:14},
          {width:(arm.width??1)*1.2,alpha:(arm.opacity??.28)*.42,blur:7},
        ]){
          ctx.save();
          ctx.globalAlpha=layer.alpha;
          ctx.strokeStyle='#79e7ff';
          ctx.lineWidth=layer.width;
          ctx.lineCap='round';
          ctx.lineJoin='round';
          ctx.shadowColor='#79e7ff';
          ctx.shadowBlur=layer.blur;
          ctx.beginPath();
          projected.forEach((point,index)=>{
            if(index===0)ctx.moveTo(point.x,point.y);
            else ctx.lineTo(point.x,point.y);
          });
          ctx.stroke();
          ctx.restore();
        }
      }

      let screen:ScreenNode[]=rotatedNodes.map(point=>{
        const projected=toScreen(point);
        const radius=clamp(
          (point.node.radius??1)*5.1*projected.perspective*Math.sqrt(clamp(view.zoom,.65,2.8)),
          3.5,
          34,
        );
        return{
          node:point.node,
          x:projected.x,
          y:projected.y,
          z:point.z,
          radius,
          depth:projected.depth,
        };
      }).filter(item=>
        view.zoom>=(item.node.minZoom??(item.node.major?0:.95))
        && item.x>-90&&item.x<size.width+90
        && item.y>-90&&item.y<size.height+90
      );

      const nodeBudget=size.width<760?720:1500;
      if(screen.length>nodeBudget){
        screen=screen
          .sort((a,b)=>{
            const score=(item:ScreenNode)=>
              (item.node.id===selectedId?100:0)
              +(item.node.major?20:0)
              +(item.node.importance??0)
              +item.depth*.05;
            return score(b)-score(a);
          })
          .slice(0,nodeBudget);
      }
      screenRef.current=screen;
      const screenById=new Map(screen.map(item=>[item.node.id,item]));

      const edgeBudget=size.width<760?420:1100;
      const visibleEdges=safeEdges
        .filter(edge=>{
          const selected=edge.from===selectedId||edge.to===selectedId;
          return(selected||view.zoom>=(edge.minZoom??.95))
            &&screenById.has(edge.from)
            &&screenById.has(edge.to);
        })
        .sort((a,b)=>{
          const score=(edge:CanvasEdge25D)=>
            (edge.from===selectedId||edge.to===selectedId?100:0)+(edge.importance??0);
          return score(b)-score(a);
        })
        .slice(0,edgeBudget)
        .map(edge=>({
          edge,
          from:screenById.get(edge.from)!,
          to:screenById.get(edge.to)!,
        }))
        .sort((a,b)=>(a.from.z+a.to.z)-(b.from.z+b.to.z));

      for(const item of visibleEdges){
        const selected=item.edge.from===selectedId||item.edge.to===selectedId;
        const alpha=clamp(
          (item.edge.opacity??.34)*(selected?1.75:.9+(item.from.depth+item.to.depth)*.08),
          .035,
          .92,
        );
        ctx.save();
        ctx.globalAlpha=alpha;
        ctx.strokeStyle=item.edge.color||'#79e7ff';
        ctx.lineWidth=(item.edge.width??1)*(selected?1.35:1);
        ctx.shadowColor=item.edge.color||'#79e7ff';
        ctx.shadowBlur=selected?8:2;
        if(item.edge.dashed)ctx.setLineDash([7,7]);
        ctx.beginPath();
        ctx.moveTo(item.from.x,item.from.y);
        const mx=(item.from.x+item.to.x)/2;
        const my=(item.from.y+item.to.y)/2-10*Math.abs(item.from.depth-item.to.depth);
        ctx.quadraticCurveTo(mx,my,item.to.x,item.to.y);
        ctx.stroke();
        ctx.restore();
      }

      const now=performance.now();
      const ordered=[...screen].sort((a,b)=>a.z-b.z);
      for(const item of ordered){
        const node=item.node;
        const selected=node.id===selectedId;
        const hot=node.id===hoveredRef.current;
        const baseOpacity=clamp(node.opacity??1,.06,1);
        const depthAlpha=clamp(.62+(item.depth+1)*.16,.5,.98);
        const pulse=node.pulse&&!reducedMotion
          ?1+Math.sin(now*.004+item.x*.01)*.13
          :1;
        const radius=item.radius*pulse;
        const halo=node.halo??(selected?1:hot?0.65:node.major?0.28:0);

        if(halo>0){
          ctx.save();
          const outer=radius+12+halo*10;
          const haloGradient=ctx.createRadialGradient(item.x,item.y,radius*.35,item.x,item.y,outer);
          haloGradient.addColorStop(0,'rgba(121,231,255,.24)');
          haloGradient.addColorStop(.5,'rgba(121,231,255,.09)');
          haloGradient.addColorStop(1,'rgba(121,231,255,0)');
          ctx.globalAlpha=clamp(baseOpacity*halo,.08,.82);
          ctx.fillStyle=haloGradient;
          ctx.beginPath();
          ctx.arc(item.x,item.y,outer,0,Math.PI*2);
          ctx.fill();
          ctx.restore();
        }

        ctx.save();
        ctx.globalAlpha=baseOpacity*depthAlpha;
        ctx.shadowColor=node.color||nodeShadowFallback;
        ctx.shadowBlur=selected?26:hot?19:node.major?14:6;
        const gradient=ctx.createRadialGradient(
          item.x-radius*.25,item.y-radius*.28,1,
          item.x,item.y,radius*1.22,
        );
        gradient.addColorStop(0,'rgba(255,255,255,.98)');
        gradient.addColorStop(.2,node.color||nodeShadowFallback);
        gradient.addColorStop(1,nodeEdgeDark);
        ctx.fillStyle=gradient;
        ctx.beginPath();
        ctx.arc(item.x,item.y,radius,0,Math.PI*2);
        ctx.fill();

        ctx.shadowBlur=0;
        ctx.strokeStyle=selected?(light?'#0f172a':'#ffffff'):node.color||nodeShadowFallback;
        ctx.globalAlpha=selected?1:baseOpacity*.62;
        ctx.lineWidth=selected?2:1;
        if(node.broken)ctx.setLineDash([3,4]);
        ctx.beginPath();
        ctx.arc(item.x,item.y,radius+(selected?6:2),0,Math.PI*2);
        ctx.stroke();

        if(selected){
          ctx.setLineDash([]);
          ctx.globalAlpha=.3;
          ctx.beginPath();
          ctx.arc(item.x,item.y,radius+13,0,Math.PI*2);
          ctx.stroke();
        }
        ctx.restore();
      }

      const labelBudget=size.width<760?14:34;
      const labelNodes=ordered
        .filter(item=>
          item.node.major
          ||item.node.id===selectedId
          ||item.node.id===hoveredRef.current
          ||(view.zoom>=1.45&&(item.node.importance??0)>=.72)
        )
        .sort((a,b)=>{
          const score=(item:ScreenNode)=>
            (item.node.id===selectedId?100:0)
            +(item.node.id===hoveredRef.current?80:0)
            +(item.node.major?20:0)
            +(item.node.importance??0);
          return score(b)-score(a);
        })
        .slice(0,labelBudget);

      ctx.font='700 10px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.textBaseline='middle';
      for(const item of labelNodes){
        const label=item.node.label.length>34?item.node.label.slice(0,33)+'…':item.node.label;
        const metrics=ctx.measureText(label);
        const w=Math.min(190,metrics.width+18);
        const h=24;
        const x=clamp(item.x-w/2,8,size.width-w-8);
        const y=clamp(item.y+item.radius+8,8,size.height-h-8);
        ctx.save();
        ctx.globalAlpha=clamp(item.node.opacity??1,.15,1);
        ctx.fillStyle=labelBackground;
        ctx.strokeStyle=item.node.id===selectedId?(light?'rgba(15,23,42,.8)':'rgba(255,255,255,.82)'):labelStroke;
        ctx.lineWidth=1;
        roundedRect(ctx,x,y,w,h,12);
        ctx.fill();ctx.stroke();
        ctx.fillStyle=labelText;
        ctx.textAlign='center';
        ctx.fillText(label,x+w/2,y+h/2+.5);
        ctx.restore();
      }

      const lod=lodForZoom(view.zoom);
      if(hostRef.current)hostRef.current.dataset.lod=lod;
      if(statusRef.current){
        statusRef.current.textContent=`${screen.length}/${nodes.length} nós · ${visibleEdges.length}/${safeEdges.length} relações · ${lod.toUpperCase()}`;
      }

      if(nodes.some(node=>node.pulse)&&!reducedMotion)scheduleDraw();
    };
    scheduleDraw();
  },[arms,nodes,safeEdges,selectedId,size,theme]);

  useEffect(()=>scheduleDraw(),[selectedId]);

  const hit=(x:number,y:number)=>{
    let best:ScreenNode|null=null;
    for(const item of screenRef.current){
      const distance=Math.hypot(item.x-x,item.y-y);
      if(distance<=item.radius+14&&(!best||item.z>best.z))best=item;
    }
    return best;
  };

  const rotate=(delta:number)=>{
    viewRef.current={...viewRef.current,yaw:viewRef.current.yaw+delta};
    scheduleDraw();
  };

  const pitch=(delta:number)=>{
    viewRef.current={
      ...viewRef.current,
      pitch:clamp(viewRef.current.pitch+delta,-1.02,1.02),
    };
    scheduleDraw();
  };

  const zoom=(factor:number)=>{
    viewRef.current={
      ...viewRef.current,
      zoom:clamp(viewRef.current.zoom*factor,.48,4.2),
    };
    scheduleDraw();
  };

  const pan=(dx:number,dy:number)=>{
    const scale=Math.max(.1,lastScaleRef.current);
    const worldDx=dx/scale;
    const worldDy=dy/scale;
    viewRef.current={
      ...viewRef.current,
      target:{
        ...viewRef.current.target,
        x:viewRef.current.target.x-worldDx,
        y:viewRef.current.target.y-worldDy,
      },
    };
    scheduleDraw();
  };

  return <div
    ref={hostRef}
    className={`canvas25d-root ${className}`}
    data-renderer="canvas-2.5d"
    data-theme={theme}
    data-lod="macro"
  >
    {canvasFailed && <div className="canvas25d-fallback" role="status">
      <strong>Visualização gráfica indisponível.</strong>
      <p>A estrutura continua navegável pela lista de entidades.</p>
      <div className="canvas25d-fallback-list">
        {nodes.slice(0,200).map(node=><button key={node.id} type="button" onClick={()=>onSelect(node.id)}>{node.label}</button>)}
      </div>
    </div>}
    <canvas
      ref={canvasRef}
      className="canvas25d-canvas"
      aria-label={ariaLabel}
      role="img"
      tabIndex={0}
      onContextMenu={event=>event.preventDefault()}
      onDoubleClick={event=>{
        const rect=event.currentTarget.getBoundingClientRect();
        const target=hit(event.clientX-rect.left,event.clientY-rect.top);
        if(target){
          onSelect(target.node.id);
          focusNode(target.node.id,2.25);
        }
      }}
      onPointerDown={event=>{
        const rect=event.currentTarget.getBoundingClientRect();
        pointersRef.current.set(event.pointerId,{
          x:event.clientX-rect.left,
          y:event.clientY-rect.top,
          moved:false,
          button:event.button,
        });
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={event=>{
        const rect=event.currentTarget.getBoundingClientRect();
        const x=event.clientX-rect.left;
        const y=event.clientY-rect.top;
        const current=pointersRef.current.get(event.pointerId);
        if(!current){
          const next=hit(x,y)?.node.id??null;
          if(next!==hoveredRef.current){
            hoveredRef.current=next;
            scheduleDraw();
          }
          return;
        }

        const pointers=[...pointersRef.current.entries()];
        if(pointers.length>=2){
          const before=pointers.slice(0,2).map(([,pointer])=>({x:pointer.x,y:pointer.y}));
          current.x=x;current.y=y;current.moved=true;
          pointersRef.current.set(event.pointerId,current);
          const after=[...pointersRef.current.values()].slice(0,2);
          const oldDistance=Math.max(8,Math.hypot(before[0].x-before[1].x,before[0].y-before[1].y));
          const newDistance=Math.max(8,Math.hypot(after[0].x-after[1].x,after[0].y-after[1].y));
          zoom(clamp(newDistance/oldDistance,.88,1.12));
          return;
        }

        const dx=x-current.x,dy=y-current.y;
        if(Math.abs(dx)+Math.abs(dy)>2)current.moved=true;
        if(event.shiftKey||current.button===1||current.button===2)pan(dx,dy);
        else{
          viewRef.current={
            ...viewRef.current,
            yaw:viewRef.current.yaw+dx*.0065,
            pitch:clamp(viewRef.current.pitch+dy*.0048,-1.02,1.02),
          };
          scheduleDraw();
        }
        current.x=x;current.y=y;
        pointersRef.current.set(event.pointerId,current);
      }}
      onPointerUp={event=>{
        const rect=event.currentTarget.getBoundingClientRect();
        const pointer=pointersRef.current.get(event.pointerId);
        if(pointer&&!pointer.moved&&pointersRef.current.size===1){
          const target=hit(event.clientX-rect.left,event.clientY-rect.top);
          onSelect(target?.node.id??null);
        }
        pointersRef.current.delete(event.pointerId);
        try{event.currentTarget.releasePointerCapture(event.pointerId);}catch{}
      }}
      onPointerCancel={event=>{
        pointersRef.current.delete(event.pointerId);
      }}
      onPointerLeave={()=>{
        if(pointersRef.current.size===0&&hoveredRef.current!==null){
          hoveredRef.current=null;
          scheduleDraw();
        }
      }}
      onWheel={event=>{
        event.preventDefault();
        zoom(event.deltaY<0?1.1:.9);
      }}
      onKeyDown={event=>{
        if(event.key==='+'||event.key==='=')zoom(1.12);
        else if(event.key==='-')zoom(.88);
        else if(event.key==='ArrowLeft')rotate(-.12);
        else if(event.key==='ArrowRight')rotate(.12);
        else if(event.key==='ArrowUp')pitch(-.1);
        else if(event.key==='ArrowDown')pitch(.1);
        else if(event.key==='Home')reset();
        else return;
        event.preventDefault();
      }}
    />
    <div className="canvas25d-status" aria-live="polite">
      <i aria-hidden="true"/><span ref={statusRef}>{nodes.length} nós · {safeEdges.length} relações · MACRO</span>
    </div>
    <div className="canvas25d-controls" role="group" aria-label="Controles da galáxia">
      <button type="button" onClick={reset}>NEXO</button>
      <button type="button" aria-label="Girar para a esquerda" onClick={()=>rotate(-.3)}>←</button>
      <button type="button" aria-label="Girar para a direita" onClick={()=>rotate(.3)}>→</button>
      <button type="button" aria-label="Aproximar" onClick={()=>zoom(1.18)}>+</button>
      <button type="button" aria-label="Afastar" onClick={()=>zoom(.84)}>−</button>
    </div>
  </div>;
});
