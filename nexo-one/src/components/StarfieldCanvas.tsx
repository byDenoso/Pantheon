import {useEffect,useRef} from 'react';

export type StarCluster={id:string;label:string;color:string;weight:number;detail?:string};

// Céu do hero. Sem clusters é só um campo de estrelas; com clusters, cada domínio
// vira um aglomerado na sua cor, dimensionado pelo peso publicado. O foco é
// compartilhado com a página pelo evento `nexo:domain-focus` e pelo atributo
// data-domain-focus no <html>, nos dois sentidos. Pausa fora da tela e respeita
// prefers-reduced-motion.
export function StarfieldCanvas({className='starfield-canvas',clusters=[]}:{className?:string;clusters?:StarCluster[]}){
  const ref=useRef<HTMLCanvasElement>(null);
  const clustersRef=useRef(clusters);
  clustersRef.current=clusters;
  const clusterKey=clusters.map(c=>`${c.id}:${c.weight}:${c.color}`).join('|');

  useEffect(()=>{
    const canvas=ref.current;const context=canvas?.getContext('2d');
    if(!canvas||!context)return;
    const still=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
    let width=0,height=0,frame=0,time=0,visible=true,focus:string|null=null;
    let stars:Array<{angle:number;radius:number;size:number;seed:number;speed:number}>=[];
    type Placed=StarCluster&{x:number;y:number;r:number;glow:number;members:Array<{dx:number;dy:number;size:number;seed:number}>};
    let placed:Placed[]=[];

    const place=()=>{
      const list=clustersRef.current;
      const max=Math.max(1,...list.map(c=>c.weight));
      placed=list.map((cluster,index)=>{
        // Aglomerados em arco sobre os dois terços direitos, longe do título.
        const t=list.length===1?.5:index/(list.length-1);
        const x=width*(.44+.42*t);
        const y=height*(.46-.16*Math.sin(t*Math.PI)+(index%2?.07:-.05));
        const r=Math.min(width,height)*(.07+.07*(cluster.weight/max));
        const count=Math.round(60+140*(cluster.weight/max));
        const members=Array.from({length:count},()=>{
          const a=Math.random()*Math.PI*2,d=Math.pow(Math.random(),1.8)*r;
          return {dx:Math.cos(a)*d,dy:Math.sin(a)*d*.62,size:Math.random()*1.5+.3,seed:Math.random()};
        });
        const previous=placed.find(p=>p.id===cluster.id);
        return {...cluster,x,y,r,members,glow:previous?.glow??1};
      });
    };

    const resize=()=>{
      const ratio=Math.min(window.devicePixelRatio||1,2);
      width=canvas.clientWidth;height=canvas.clientHeight;
      canvas.width=width*ratio;canvas.height=height*ratio;
      context.setTransform(ratio,0,0,ratio,0,0);
      stars=Array.from({length:Math.min(1200,Math.round(width*height/800))},()=>({
        angle:Math.random()*Math.PI*2,radius:Math.pow(Math.random(),.6)*Math.max(width,height)*.7,
        size:Math.random()*1.3+.2,seed:Math.random(),speed:.00004+Math.random()*.0001,
      }));
      place();
    };

    const draw=()=>{
      const cx=width*.72,cy=height*.4;
      context.fillStyle='#05070B';context.fillRect(0,0,width,height);
      if(!placed.length){
        const glow=context.createRadialGradient(cx,cy,0,cx,cy,Math.max(width,height)*.35);
        glow.addColorStop(0,'rgba(233,179,91,.16)');glow.addColorStop(.4,'rgba(80,110,150,.06)');glow.addColorStop(1,'rgba(0,0,0,0)');
        context.fillStyle=glow;context.fillRect(0,0,width,height);
      }
      for(const star of stars){
        const angle=star.angle+time*star.speed*(400/(star.radius+60));
        context.globalAlpha=(.25+.6*Math.abs(Math.sin(time*.002+star.seed*9)))*(placed.length?.7:1);
        context.fillStyle=!placed.length&&star.seed>.93?'#E9B35B':'#D6DEE8';
        context.fillRect(cx+Math.cos(angle)*star.radius,cy+Math.sin(angle)*star.radius*.42,star.size,star.size);
      }
      for(const cluster of placed){
        const target=focus===null?1:focus===cluster.id?1.9:.28;
        cluster.glow+=(target-cluster.glow)*(still?1:.08);
        const g=cluster.glow;
        const halo=context.createRadialGradient(cluster.x,cluster.y,0,cluster.x,cluster.y,cluster.r*2.4);
        halo.addColorStop(0,hexAlpha(cluster.color,.22*g));halo.addColorStop(1,hexAlpha(cluster.color,0));
        context.globalAlpha=1;context.fillStyle=halo;
        context.fillRect(cluster.x-cluster.r*2.4,cluster.y-cluster.r*2.4,cluster.r*4.8,cluster.r*4.8);
        const spin=time*.00005;
        context.fillStyle=cluster.color;
        for(const m of cluster.members){
          const cos=Math.cos(spin),sin=Math.sin(spin);
          const x=cluster.x+m.dx*cos-m.dy*sin,y=cluster.y+m.dx*sin+m.dy*cos;
          context.globalAlpha=Math.min(1,(.35+.55*Math.abs(Math.sin(time*.0018+m.seed*7)))*Math.min(1,g));
          context.fillRect(x,y,m.size,m.size);
        }
        context.globalAlpha=Math.min(1,.45+.55*Math.min(1,g));
        context.fillStyle=cluster.color;
        context.font='500 10.5px "IBM Plex Mono", ui-monospace, monospace';
        context.fillText(cluster.label.toUpperCase(),cluster.x+cluster.r*.9,cluster.y-cluster.r*.9);
        if(cluster.detail){context.fillStyle='#7A889C';context.fillText(cluster.detail,cluster.x+cluster.r*.9,cluster.y-cluster.r*.9+14);}
      }
      context.globalAlpha=1;time+=16;
      if(!still&&visible)frame=requestAnimationFrame(draw);
    };

    const setFocus=(next:string|null)=>{
      if(next===focus)return;
      focus=next;
      if(next)document.documentElement.dataset.domainFocus=next;else delete document.documentElement.dataset.domainFocus;
      if(still)draw();
    };
    const onFocusEvent=(event:Event)=>setFocus((event as CustomEvent<string|null>).detail??null);
    const onPointer=(event:PointerEvent)=>{
      const box=canvas.getBoundingClientRect();
      const x=event.clientX-box.left,y=event.clientY-box.top;
      const hit=placed.find(c=>Math.hypot(x-c.x,(y-c.y)/.62)<c.r*1.3);
      setFocus(hit?.id??null);
      canvas.style.cursor=hit?'crosshair':'';
    };
    const onLeave=()=>setFocus(null);

    const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(([entry])=>{
      const was=visible;visible=entry.isIntersecting;
      if(visible&&!was&&!still)frame=requestAnimationFrame(draw);
    }):null;
    observer?.observe(canvas);
    // O hero muda de altura depois do carregamento (fontes, dados); medir só no
    // resize da janela deixava o canvas esticado.
    const onResize=()=>{if(canvas.clientWidth===width&&canvas.clientHeight===height)return;resize();if(still)draw();};
    const sizer=typeof ResizeObserver==='function'?new ResizeObserver(onResize):null;
    sizer?.observe(canvas);
    resize();draw();
    window.addEventListener('resize',onResize);
    window.addEventListener('nexo:domain-focus',onFocusEvent);
    canvas.addEventListener('pointermove',onPointer);
    canvas.addEventListener('pointerleave',onLeave);
    return()=>{
      cancelAnimationFrame(frame);observer?.disconnect();sizer?.disconnect();
      window.removeEventListener('resize',onResize);window.removeEventListener('nexo:domain-focus',onFocusEvent);
      canvas.removeEventListener('pointermove',onPointer);canvas.removeEventListener('pointerleave',onLeave);
      delete document.documentElement.dataset.domainFocus;
    };
  },[clusterKey]);

  return <canvas ref={ref} className={className} aria-hidden="true"/>;
}

function hexAlpha(hex:string,alpha:number){
  const value=hex.replace('#','');
  const n=parseInt(value.length===3?value.split('').map(c=>c+c).join(''):value,16);
  return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${Math.max(0,Math.min(1,alpha))})`;
}
