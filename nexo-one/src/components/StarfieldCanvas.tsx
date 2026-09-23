import {useEffect,useRef} from 'react';

// Céu decorativo para superfícies de abertura. Não lê dados, pausa fora da tela
// e respeita prefers-reduced-motion.
export function StarfieldCanvas({className='starfield-canvas'}:{className?:string}){
  const ref=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{
    const canvas=ref.current;const context=canvas?.getContext('2d');
    if(!canvas||!context)return;
    const still=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
    let width=0,height=0,frame=0,time=0,visible=true;
    let stars:Array<{angle:number;radius:number;size:number;seed:number;speed:number}>=[];
    const resize=()=>{
      const ratio=Math.min(window.devicePixelRatio||1,2);
      width=canvas.clientWidth;height=canvas.clientHeight;
      canvas.width=width*ratio;canvas.height=height*ratio;
      context.setTransform(ratio,0,0,ratio,0,0);
      stars=Array.from({length:Math.min(1400,Math.round(width*height/700))},()=>({
        angle:Math.random()*Math.PI*2,radius:Math.pow(Math.random(),.6)*Math.max(width,height)*.7,
        size:Math.random()*1.4+.2,seed:Math.random(),speed:.00004+Math.random()*.0001,
      }));
    };
    const draw=()=>{
      const cx=width*.72,cy=height*.4;
      context.fillStyle='#05070B';context.fillRect(0,0,width,height);
      const glow=context.createRadialGradient(cx,cy,0,cx,cy,Math.max(width,height)*.35);
      glow.addColorStop(0,'rgba(233,179,91,.16)');glow.addColorStop(.4,'rgba(80,110,150,.06)');glow.addColorStop(1,'rgba(0,0,0,0)');
      context.fillStyle=glow;context.fillRect(0,0,width,height);
      for(const star of stars){
        const angle=star.angle+time*star.speed*(400/(star.radius+60));
        context.globalAlpha=.3+.7*Math.abs(Math.sin(time*.002+star.seed*9));
        context.fillStyle=star.seed>.93?'#E9B35B':'#D6DEE8';
        context.fillRect(cx+Math.cos(angle)*star.radius,cy+Math.sin(angle)*star.radius*.42,star.size,star.size);
      }
      context.globalAlpha=1;time+=16;
      if(!still&&visible)frame=requestAnimationFrame(draw);
    };
    const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(([entry])=>{
      const was=visible;visible=entry.isIntersecting;
      if(visible&&!was&&!still)frame=requestAnimationFrame(draw);
    }):null;
    observer?.observe(canvas);
    const onResize=()=>{resize();if(still)draw();};
    resize();draw();window.addEventListener('resize',onResize);
    return()=>{cancelAnimationFrame(frame);observer?.disconnect();window.removeEventListener('resize',onResize);};
  },[]);
  return <canvas ref={ref} className={className} aria-hidden="true"/>;
}
