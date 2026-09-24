import {useEffect,useRef} from 'react';

export type StarCluster={id:string;label:string;color:string;weight:number;detail?:string};
/** Cross-domain relations: each becomes a filament of the cosmic web, denser with more relations. */
export type StarLink={a:string;b:string;count:number};

// Céu do hero. Sem clusters é só um campo de estrelas; com clusters, cada domínio
// vira um aglomerado na sua cor, dimensionado pelo peso publicado. O foco é
// compartilhado com a página pelo evento `nexo:domain-focus` e pelo atributo
// data-domain-focus no <html>, nos dois sentidos. Pausa fora da tela e respeita
// prefers-reduced-motion.
// Teia cósmica: domínios são nós; relações entre domínios viram filamentos de
// galáxias (densidade e brilho pela contagem). Pares sem relação ganham só um fio
// tênue, para a teia ler como estrutura contínua sem inventar vínculo.
export function StarfieldCanvas({className='starfield-canvas',clusters=[],links=[]}:{className?:string;clusters?:StarCluster[];links?:StarLink[]}){
  const ref=useRef<HTMLCanvasElement>(null);
  const clustersRef=useRef(clusters);
  clustersRef.current=clusters;
  const linksRef=useRef(links);
  linksRef.current=links;
  const clusterKey=clusters.map(c=>`${c.id}:${c.weight}:${c.color}`).join('|')+'#'+links.map(l=>`${l.a}-${l.b}:${l.count}`).join('|');

  useEffect(()=>{
    const canvas=ref.current;const context=canvas?.getContext('2d');
    if(!canvas||!context)return;
    const still=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
    let width=0,height=0,frame=0,time=0,visible=true,focus:string|null=null;
    let stars:Array<{angle:number;radius:number;size:number;seed:number;speed:number}>=[];
    type Placed=StarCluster&{x:number;y:number;r:number;glow:number;members:Array<{dx:number;dy:number;size:number;seed:number}>};
    let placed:Placed[]=[];
    type Strand={a:Placed;b:Placed;count:number;bend:number;beads:Array<{t:number;off:number;size:number;seed:number}>};
    let strands:Strand[]=[];
    // Background web: faint knots and dotted threads, the domains embedded in it.
    let web:Array<{x1:number;y1:number;x2:number;y2:number;dots:Array<{t:number;off:number;seed:number}>}>=[];
    let knots:Array<{x:number;y:number;r:number;seed:number}>=[];

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
      // Filaments: published relations, plus a faint thread to the nearest
      // neighbour for clusters that would otherwise float alone.
      const byId=new Map(placed.map(c=>[c.id,c]));
      const pairs=new Map<string,{a:Placed;b:Placed;count:number}>();
      for(const link of linksRef.current){
        const a=byId.get(link.a),b=byId.get(link.b);
        if(a&&b&&a!==b)pairs.set([a.id,b.id].sort().join('|'),{a,b,count:link.count});
      }
      for(const c of placed){
        if([...pairs.values()].some(p=>p.a===c||p.b===c))continue;
        const near=placed.filter(o=>o!==c).sort((m,n)=>Math.hypot(m.x-c.x,m.y-c.y)-Math.hypot(n.x-c.x,n.y-c.y))[0];
        if(near)pairs.set([c.id,near.id].sort().join('|'),{a:c,b:near,count:0});
      }
      const nodes=[
        ...Array.from({length:34},()=>({x:width*(.3+.72*Math.random()),y:height*(.04+.86*Math.random())})),
        ...placed.map(c=>({x:c.x,y:c.y})),
      ];
      knots=nodes.slice(0,34).map(n=>({...n,r:1+Math.random()*2.2,seed:Math.random()}));
      const seen=new Set<string>();web=[];
      nodes.forEach((n,i)=>{
        nodes.map((m,j)=>({j,d:Math.hypot(m.x-n.x,m.y-n.y)})).filter(o=>o.j!==i).sort((p,q)=>p.d-q.d).slice(0,3).forEach(({j,d})=>{
          const key=[i,j].sort().join('-');if(seen.has(key)||d>Math.max(width,height)*.32)return;seen.add(key);
          const m=nodes[j]!;
          web.push({x1:n.x,y1:n.y,x2:m.x,y2:m.y,dots:Array.from({length:Math.round(d/3.5)},()=>({t:Math.random(),off:(Math.random()+Math.random()-1)*4,seed:Math.random()}))});
        });
      });
      const maxLink=Math.max(1,...[...pairs.values()].map(p=>p.count));
      strands=[...pairs.values()].map(({a,b,count})=>{
        const beads=Math.round(24+(count?150*Math.sqrt(count/maxLink):0));
        return {a,b,count,bend:(Math.random()-.5)*.5,beads:Array.from({length:beads},()=>({
          t:Math.random(),off:(Math.random()+Math.random()-1)*(count?9+14*count/maxLink:5),size:Math.random()*1.3+.3,seed:Math.random(),
        }))};
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
      for(const w of web){
        const dx=w.x2-w.x1,dy=w.y2-w.y1,len=Math.hypot(dx,dy)||1,nx=-dy/len,ny=dx/len;
        context.fillStyle='#9fb0cc';
        for(const d of w.dots){
          context.globalAlpha=(.1+.22*Math.abs(Math.sin(time*.001+d.seed*11)))*(placed.length?1:.6);
          context.fillRect(w.x1+dx*d.t+nx*d.off,w.y1+dy*d.t+ny*d.off,1.2,1.2);
        }
      }
      for(const k of knots){
        const halo=context.createRadialGradient(k.x,k.y,0,k.x,k.y,k.r*6);
        halo.addColorStop(0,'rgba(190,205,230,.14)');halo.addColorStop(1,'rgba(190,205,230,0)');
        context.globalAlpha=1;context.fillStyle=halo;context.fillRect(k.x-k.r*6,k.y-k.r*6,k.r*12,k.r*12);
        context.globalAlpha=.35+.3*Math.abs(Math.sin(time*.0012+k.seed*7));context.fillStyle='#d6dee8';
        context.fillRect(k.x-.6,k.y-.6,1.3,1.3);
      }
      // Filaments first, under the nodes: a bent strand whose colour fades from one domain to the other.
      for(const s of strands){
        const {a,b}=s;const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1;
        const nx=-dy/len,ny=dx/len;
        const mx=(a.x+b.x)/2+nx*len*s.bend,my=(a.y+b.y)/2+ny*len*s.bend;
        const lit=Math.min(1,(a.glow+b.glow)/2);
        const strength=s.count?.35+.65*Math.min(1,s.count/10):.12;
        const grad=context.createLinearGradient(a.x,a.y,b.x,b.y);
        grad.addColorStop(0,hexAlpha(a.color,.07*strength*lit));grad.addColorStop(1,hexAlpha(b.color,.07*strength*lit));
        context.globalAlpha=1;context.strokeStyle=grad;context.lineWidth=s.count?6+10*strength:1;
        context.beginPath();context.moveTo(a.x,a.y);context.quadraticCurveTo(mx,my,b.x,b.y);context.stroke();
        for(const bead of s.beads){
          const t=bead.t,u=1-t;
          const x=u*u*a.x+2*u*t*mx+t*t*b.x+nx*bead.off,y=u*u*a.y+2*u*t*my+t*t*b.y+ny*bead.off;
          context.fillStyle=t<.5?a.color:b.color;
          context.globalAlpha=(.2+.55*Math.abs(Math.sin(time*.0015+bead.seed*9)))*strength*lit;
          context.fillRect(x,y,bead.size,bead.size);
        }
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
        // Labels flip to the left of the cluster instead of running off the right edge.
        const label=cluster.label.toUpperCase();
        const labelWidth=Math.max(context.measureText(label).width,cluster.detail?context.measureText(cluster.detail).width:0);
        const labelX=cluster.x+cluster.r*.9+labelWidth>context.canvas.clientWidth-12?cluster.x-cluster.r*.9-labelWidth:cluster.x+cluster.r*.9;
        context.fillText(label,labelX,cluster.y-cluster.r*.9);
        if(cluster.detail){context.fillStyle='#7A889C';context.fillText(cluster.detail,labelX,cluster.y-cluster.r*.9+14);}
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
