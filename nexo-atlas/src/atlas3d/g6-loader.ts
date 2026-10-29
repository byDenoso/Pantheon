import {atlasRouteParam} from './route-params.ts';
const LOCAL_G6_SOURCE = new URL(`${import.meta.env.BASE_URL}vendor/g6.min.js`, window.location.origin).href;
export const G6_SOURCES = [
  LOCAL_G6_SOURCE,
  'https://unpkg.com/@antv/g6@5.1.1/dist/g6.min.js',
  'https://cdn.jsdelivr.net/npm/@antv/g6@5.1.1/dist/g6.min.js',
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
      if(error)reject(error);else resolve();
    };
    const onLoad=()=>((window as any).G6?.Graph?finish():finish(new Error('G6 global ausente após o carregamento')));
    const onError=()=>finish(new Error(`Falha ao carregar ${src}`));
    const timer=window.setTimeout(()=>finish(new Error(`Timeout ao carregar ${src}`)),timeoutMs);
    script.addEventListener('load',onLoad,{once:true});
    script.addEventListener('error',onError,{once:true});
    if(!existing){script.src=src;script.async=true;script.crossOrigin='anonymous';script.referrerPolicy='no-referrer';script.dataset.atlasDependency='g6';document.head.appendChild(script);}
  });
}

export function ensureAtlasG6():Promise<void>{
  const forceFallback=atlasRouteParam('g6Fallback')==='1';
  if(!forceFallback&&document.documentElement.dataset.atlasG6Source==='module'&&(window as any).G6?.Graph)return Promise.resolve();
  if(loading)return loading;
  loading=(async()=>{
    let lastError:unknown=null;
    if(!forceFallback){
      try{
        // Share the same @antv/g-lite module instance with @antv/g-svg. A
        // standalone G6 UMD script bundles a separate renderer runtime.
        const module=await import('@antv/g6');
        if(module.Graph){
          (window as any).G6=module;
          document.documentElement.dataset.atlasG6Source='module';
          return;
        }
        lastError=new Error('G6 module import did not expose Graph');
      }catch(error){lastError=error;}
    }
    if((window as any).G6?.Graph){document.documentElement.dataset.atlasG6Source='preloaded';return;}
    for(const source of G6_SOURCES){
      if(forceFallback&&!source.includes('jsdelivr.net'))continue;
      try{
        await loadScript(source);
        if((window as any).G6?.Graph){
          document.documentElement.dataset.atlasG6Source=source===LOCAL_G6_SOURCE?'local':source.includes('jsdelivr')?'jsdelivr':'unpkg';
          return;
        }
      }catch(error){lastError=error;}
    }
    document.documentElement.dataset.atlasG6Source='unavailable';
    console.error('Atlas G6 dependency unavailable',lastError);
  })().finally(()=>{loading=null;});
  return loading;
}
