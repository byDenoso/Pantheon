import {drive,gmail,calendar} from './google.mjs';
import {github} from './github.mjs';
import {vercel} from './vercel.mjs';
import {nexo} from './nexo.mjs';
import {atlas} from './atlas.mjs';
import {hash,semantic} from '../compiler/world-state.mjs';
export const readers={drive,gmail,calendar,github,vercel,nexo,atlas};
export const labels={drive:'Google Drive',gmail:'Gmail',calendar:'Calendar',github:'GitHub',vercel:'Vercel',nexo:'NEXO SSoT',atlas:'Atlas'};
const cache=new Map(), inflight=new Map();
export function pending(id,now,message='Aguardando leitura.') {return {provider:{id,label:labels[id],status:'UNAVAILABLE',lastSuccessAt:null,checkedAt:new Date(now).toISOString(),revision:null,message,partial:false,count:null},items:[]};}
export async function readProvider(id,{env=process.env,now=Date.now(),access='PUBLIC',query='',reader=readers[id],timeout=8000,force=false}={}) {
  const key=`${access}:${id}`;
  if(access==='PUBLIC'&&id!=='github')return {...pending(id,now,'Conecte sua conta para consultar esta fonte.'),provider:{...pending(id,now).provider,status:'AUTH_REQUIRED',message:'Acesso privado ainda não configurado.'}};
  const effectiveEnv=access==='PUBLIC'?{GITHUB_REPOSITORY:env.GITHUB_REPOSITORY}:env;
  const old=cache.get(key);
  if(!query&&!force&&old&&now-Date.parse(old.provider.lastSuccessAt)<60000)return old;
  if(!query&&inflight.has(key))return inflight.get(key);
  const controller=new AbortController();let timer;
  const work=(async()=>{
    try{
      const result=await Promise.race([reader({env:effectiveEnv,signal:controller.signal,now,query}),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('UNAVAILABLE'));},timeout);})]);
      if(!Array.isArray(result.items))throw new Error('UNAVAILABLE');
      const revision=result.revision||hash(result.items.map(semantic).sort((a,b)=>a.id.localeCompare(b.id)));
      const out={items:result.items,...(result.truthGraphInput?{truthGraphInput:result.truthGraphInput}:{}),provider:{id,label:labels[id],status:'AVAILABLE',lastSuccessAt:new Date(now).toISOString(),checkedAt:new Date(now).toISOString(),revision,message:result.partial?'Leitura parcial; há mais registros na fonte.':'Leitura concluída.',partial:!!result.partial,count:result.items.length}};
      if(!query)cache.set(key,out);return out;
    }catch(error){
      const code=['AUTH_REQUIRED','RATE_LIMITED'].includes(error.code||error.message)?error.code||error.message:'UNAVAILABLE';
      if(code==='AUTH_REQUIRED'&&!query)cache.delete(key);
      const fallback=!query&&code!=='AUTH_REQUIRED'?old:null;
      return {items:fallback?fallback.items.map(x=>({...x,freshness:{...x.freshness,state:'STALE'}})):[],...(fallback?.truthGraphInput?{truthGraphInput:fallback.truthGraphInput}:{}),provider:{...pending(id,now).provider,status:code,lastSuccessAt:fallback?.provider.lastSuccessAt||null,revision:fallback?.provider.revision||null,count:fallback?.items.length??null,partial:!!fallback,message:code==='AUTH_REQUIRED'?'Credencial ou permissão de leitura necessária.':code==='RATE_LIMITED'?'Limite de consultas atingido.':fallback?'Fonte indisponível; exibindo a última leitura válida.':'Não foi possível consultar esta fonte.'}};
    }finally{clearTimeout(timer);}
  })();
  if(!query)inflight.set(key,work);
  try{return await work;}finally{if(!query)inflight.delete(key);}
}
export function clearProviderCache(){cache.clear();inflight.clear();}
export function adapter(id,options={}) {return {snapshot:()=>readProvider(id,options),health:async()=>(await readProvider(id,options)).provider,search:query=>readProvider(id,{...options,query})};}
