import {atlasRouteParam} from './route-params.ts';
export const G6_VERSION = '5.1.1';
const G6_SCRIPT_INTEGRITY = 'sha384-UD8c5szelcdeclSWhUiFuz1tiZeIweaJygrWmWcSllSAfocHUyRyQZ5iiQ0J1MGm';
export const G6_SOURCES = [
  `https://unpkg.com/@antv/g6@${G6_VERSION}/dist/g6.min.js`,
  `https://cdn.jsdelivr.net/npm/@antv/g6@${G6_VERSION}/dist/g6.min.js`,
] as const;

let loading:Promise<void>|null=null;

function loadScript(src:string,timeoutMs=4500):Promise<void>{
  return new Promise((resolve,reject)=>{
    const existing=[...document.scripts].find(script=>script.src===src);
    if(existing&&(window as any).G6?.Graph){resolve();return;}
    const script=existing||document.createElement('script');
    let settled=false;
    const finish=(error?:Error)=>{
      if(settled)return;
      settled=true;
      clearTimeout(timer);
      script.removeEventListener('load',onLoad);
      script.removeEventListener('error',onError);
      if(error){
        // A retry must create a new request, rather than reuse a failed tag.
        if(script.dataset.atlasDependency==='g6')script.remove();
        reject(error);
      }else resolve();
    };
    const onLoad=()=>((window as any).G6?.Graph?finish():finish(new Error('G6 global ausente após o carregamento')));
    const onError=()=>finish(new Error(`Falha ao carregar ${src}`));
    const timer=window.setTimeout(()=>finish(new Error(`Timeout ao carregar ${src}`)),timeoutMs);
    script.addEventListener('load',onLoad,{once:true});
    script.addEventListener('error',onError,{once:true});
    if(!existing){script.src=src;script.async=true;script.crossOrigin='anonymous';script.integrity=G6_SCRIPT_INTEGRITY;script.referrerPolicy='no-referrer';script.dataset.atlasDependency='g6';document.head.appendChild(script);}
  });
}

export function ensureAtlasG6():Promise<void>{
  if((window as any).G6?.Graph){document.documentElement.dataset.atlasG6Source='preloaded';return Promise.resolve();}
  if(loading)return loading;
  loading=(async()=>{
    const forceFallback=atlasRouteParam('g6Fallback')==='1';
    let lastError:unknown=null;
    for(const source of G6_SOURCES){
      if(forceFallback&&!source.includes('jsdelivr.net'))continue;
      try{
        await loadScript(source);
        if((window as any).G6?.Graph){
          document.documentElement.dataset.atlasG6Source=source.includes('jsdelivr')?'jsdelivr':'unpkg';
          document.documentElement.dataset.atlasG6Version=G6_VERSION;
          return;
        }
      }catch(error){lastError=error;}
    }
    document.documentElement.dataset.atlasG6Source='unavailable';
    console.error('Atlas G6 dependency unavailable',lastError);
  })().finally(()=>{loading=null;});
  return loading;
}
