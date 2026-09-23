import {useEffect} from 'react';

// Comportamentos de apresentação compartilhados por todas as abas:
// - seções entram em cena ao rolar (classe .reveal / .is-in);
// - números grandes contam até o valor publicado quando aparecem;
// - a matriz de capabilities ganha mira de linha e coluna.
// Nada aqui altera dados; com prefers-reduced-motion a página fica estática.

const REVEAL_SELECTOR=[
  '.workspace > :not(.workspace-heading):not(.section-tabs)',
  '.overview > section',
  '.workspace section',
  '.card-grid > *',
  '.lane-grid > *',
  '.domain-strip > *',
  '.provider-grid > *',
  '.work-queue > *',
].join(',');
const COUNT_SELECTOR='.pulse-metric strong,.capability-counters strong';

export function useCinematics(routeKey:string,enabled=true){
  useEffect(()=>{
    const root=document.getElementById('workspace');
    if(!root||!enabled){document.documentElement.classList.remove('cinematic');return;}
    const still=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
    const cleanups:Array<()=>void>=[];

    // Revelação e contagem.
    if(!still&&typeof IntersectionObserver==='function'){
      document.documentElement.classList.add('cinematic');
      const counted=new WeakSet<Element>();
      const observer=new IntersectionObserver(entries=>{
        for(const entry of entries){
          if(!entry.isIntersecting)continue;
          const el=entry.target as HTMLElement;
          el.classList.add('is-in');
          observer.unobserve(el);
          el.querySelectorAll(COUNT_SELECTOR).forEach(node=>{if(!counted.has(node)){counted.add(node);countUp(node as HTMLElement);}});
          if(el.matches(COUNT_SELECTOR)&&!counted.has(el)){counted.add(el);countUp(el);}
        }
      },{rootMargin:'0px 0px -8% 0px',threshold:.08});
      let stagger=0;
      const scan=()=>{
        stagger=0;
        root.querySelectorAll<HTMLElement>(REVEAL_SELECTOR).forEach(el=>{
          if(el.classList.contains('reveal'))return;
          el.classList.add('reveal');
          el.style.setProperty('--reveal-delay',`${Math.min(stagger++,8)*55}ms`);
          observer.observe(el);
        });
      };
      scan();
      let pending=0;
      const mutations=new MutationObserver(()=>{cancelAnimationFrame(pending);pending=requestAnimationFrame(scan);});
      mutations.observe(root,{childList:true,subtree:true});
      cleanups.push(()=>{observer.disconnect();mutations.disconnect();cancelAnimationFrame(pending);});
    }

    // Mira da matriz: a linha vem do :hover no CSS; a coluna precisa de JS.
    let marked:Element[]=[];
    const clear=()=>{marked.forEach(el=>el.classList.remove('is-col'));marked=[];};
    const onOver=(event:Event)=>{
      const cell=(event.target as HTMLElement|null)?.closest('td,th') as HTMLTableCellElement|null;
      const table=cell?.closest('.capability-matrix,.envelope-table,.science-table,.system-table') as HTMLTableElement|null;
      clear();
      if(!cell||!table)return;
      const index=cell.cellIndex;
      for(const row of Array.from(table.rows)){const target=row.cells[index];if(target){target.classList.add('is-col');marked.push(target);}}
    };
    root.addEventListener('pointerover',onOver);
    root.addEventListener('pointerleave',clear);
    cleanups.push(()=>{root.removeEventListener('pointerover',onOver);root.removeEventListener('pointerleave',clear);clear();});

    return()=>cleanups.forEach(fn=>fn());
  },[routeKey,enabled]);
}

function countUp(el:HTMLElement){
  const text=(el.textContent||'').trim();
  if(!/^\d{1,6}$/.test(text))return;
  const target=Number(text);
  if(target<2)return;
  const start=performance.now(),duration=Math.min(1400,500+target*18);
  let written=text;
  const step=(now:number)=>{
    // O React pode ter atualizado o valor no meio da animação: desiste.
    if(el.textContent!==written)return;
    const t=Math.min(1,(now-start)/duration);
    const eased=1-Math.pow(1-t,3);
    written=String(Math.round(target*eased));
    el.textContent=written;
    if(t<1)requestAnimationFrame(step);
  };
  written='0';el.textContent='0';
  requestAnimationFrame(step);
}
