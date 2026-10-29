import {useEffect} from 'react';
const KEY='nexo.public.catalog.position';
export function useCatalogPosition(ready:boolean,detail:boolean){
 useEffect(()=>{
  if(detail)return;
  let sourceHref:string|null=null;
  const capture=(event:MouseEvent)=>{const anchor=(event.target as Element|null)?.closest?.('a[href]');if(anchor)sourceHref=anchor.getAttribute('href');};
  const save=()=>{try{sessionStorage.setItem(KEY,JSON.stringify({y:window.scrollY,at:Date.now(),href:sourceHref??(document.activeElement as HTMLAnchorElement|null)?.getAttribute?.('href')}));}catch{}};
  document.addEventListener('click',capture,true);
  window.addEventListener('pagehide',save);
  return()=>{document.removeEventListener('click',capture,true);window.removeEventListener('pagehide',save);};
 },[detail]);
 useEffect(()=>{
  if(detail||!ready)return;
  const params=new URLSearchParams(location.search),section=params.get('secao');
  const returning=params.get('retorno')==='1'||(performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming|undefined)?.type==='back_forward';
  let frame=0,second=0;
  frame=requestAnimationFrame(()=>{second=requestAnimationFrame(()=>{
   if(section&&['works','methods','lines','contact'].includes(section)){const el=document.getElementById('s-'+section);el?.scrollIntoView({block:'start'});el?.focus({preventScroll:true});return;}
   if(!returning)return;
   try{const saved=JSON.parse(sessionStorage.getItem(KEY)??'null');if(saved&&Number.isFinite(saved.y)&&saved.y>=0&&Date.now()-saved.at<86400000){window.scrollTo({top:saved.y,behavior:'instant'});if(typeof saved.href==='string')Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]')).find(a=>a.getAttribute('href')===saved.href&&!a.closest('details:not([open])')&&a.getClientRects().length>0)?.focus({preventScroll:true});}}catch{}
  });});
  return()=>{cancelAnimationFrame(frame);cancelAnimationFrame(second);};
 },[ready,detail]);
}
