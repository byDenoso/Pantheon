import {useEffect,useRef,useState} from 'react';
import {loadPublic,type PublicState} from '../publicItems.ts';
export const retainVerifiedPublic=(previous:PublicState,next:PublicState)=>next.status==='unavailable'&&(previous.status==='ready'||previous.status==='empty')?previous:next;
export default function usePublicResearch(){
  const [pub,setPub]=useState<PublicState>({status:'loading',items:[],tests:[]});
  const [checking,setChecking]=useState(false),[pending,setPending]=useState(false),[checkedAt,setCheckedAt]=useState<string|null>(null);
  const refresh=useRef<()=>void>(()=>{});
  useEffect(()=>{
    let disposed=false,busy=false,timer:ReturnType<typeof setTimeout>|undefined,controller:AbortController|undefined,failures=0;
    const check=async()=>{
      if(disposed||busy||document.hidden)return;
      clearTimeout(timer);busy=true;setChecking(true);controller=new AbortController();const current=controller;
      const timeout=setTimeout(()=>current.abort(),15000);
      try{
        const next=await loadPublic((u,i)=>fetch(u,i),current.signal);
        if(disposed)return;
        setPub(previous=>{const accepted=retainVerifiedPublic(previous,next);return JSON.stringify(previous)===JSON.stringify(accepted)?previous:accepted;});
        if(next.status==='unavailable'){failures++;setPending(true);}else{failures=0;setPending(false);setCheckedAt(new Date().toISOString());}
      }catch{
        if(!disposed){failures++;setPending(true);setPub(previous=>retainVerifiedPublic(previous,{status:'unavailable',items:[],tests:[]}));}
      }finally{
        clearTimeout(timeout);busy=false;
        if(!disposed){setChecking(false);if(!document.hidden)timer=setTimeout(check,Math.min(300000,60000*2**Math.min(failures,3)));}
      }
    };
    refresh.current=()=>{void check();};
    const visibility=()=>{clearTimeout(timer);if(!document.hidden)void check();};
    document.addEventListener('visibilitychange',visibility);void check();
    return ()=>{disposed=true;clearTimeout(timer);controller?.abort();document.removeEventListener('visibilitychange',visibility);refresh.current=()=>{};};
  },[]);
  return {pub,checking,pending,checkedAt,refresh:()=>refresh.current()};
}
