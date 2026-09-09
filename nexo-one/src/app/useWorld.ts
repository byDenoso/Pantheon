import {useCallback,useEffect,useRef,useState} from 'react';
import type {WorldState} from '../contracts/world';
import {diffWorld} from './model';
export function useWorld(){
  const [world,setWorld]=useState<WorldState|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
  const previous=useRef<WorldState|null>(null),controller=useRef<AbortController|null>(null);
  const refresh=useCallback(async(reset=false)=>{
    controller.current?.abort();const ctrl=new AbortController();controller.current=ctrl;setLoading(true);setError('');
    if(reset){previous.current=null;setWorld(null);}
    try{
      const response=await fetch('/api/world?stream=1&refresh=1',{signal:ctrl.signal,credentials:'same-origin'});
      if(!response.ok||!response.body)throw new Error('Falha ao ler as fontes.');
      const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',last:WorldState|null=null;
      const consume=(line:string)=>{if(!line.trim())return;const value=JSON.parse(line) as WorldState;if(value.version!=='1'||!Array.isArray(value.items)||!Array.isArray(value.providers))throw new Error('Resposta incompatível.');last=value;if(!previous.current)setWorld(value);};
      while(true){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});let index;while((index=buffer.indexOf('\n'))>=0){consume(buffer.slice(0,index));buffer=buffer.slice(index+1);}}
      buffer+=decoder.decode();consume(buffer);
      if(ctrl.signal.aborted)return;
      if(last){const next=last as WorldState;next.diff=diffWorld(previous.current,next);previous.current=next;setWorld(next);}else throw new Error('Nenhuma leitura recebida.');
    }catch(e){if(!ctrl.signal.aborted){setError('Sincronização interrompida. O estado exibido pode estar desatualizado.');setWorld(old=>old?{...old,items:old.items.map(i=>({...i,freshness:{...i.freshness,state:'STALE'},attention:'NOTICE'})),providers:old.providers.map(p=>({...p,status:'STALE',message:'Sincronização interrompida.'}))}:null);}}
    finally{if(controller.current===ctrl)setLoading(false);}
  },[]);
  useEffect(()=>{void refresh();const resume=()=>{if(document.visibilityState==='visible'&&Date.now()-Date.parse(previous.current?.generatedAt||'1970-01-01')>60000)void refresh();};const timer=setInterval(()=>{if(document.visibilityState==='visible')void refresh();},300000);window.addEventListener('focus',resume);document.addEventListener('visibilitychange',resume);return()=>{controller.current?.abort();clearInterval(timer);window.removeEventListener('focus',resume);document.removeEventListener('visibilitychange',resume);};},[refresh]);
  return {world,loading,error,refresh};
}
