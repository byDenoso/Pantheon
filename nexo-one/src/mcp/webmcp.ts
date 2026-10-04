import {readMcpStatus,callReadOnlyTool,type McpTool} from './client.ts';

type BrowserTool={name:string;description:string;inputSchema:McpTool['inputSchema'];annotations:{readOnlyHint:true};execute:(args:Record<string,unknown>,context?:{signal?:AbortSignal})=>Promise<Record<string,unknown>>};
type ModelContext={registerTool:(tool:BrowserTool,options?:{signal:AbortSignal})=>void|Promise<void>;unregisterTool?:(name:string)=>void};
type WebMcpSurface={modelContext?:ModelContext};
type RegistrationOptions={readStatus?:typeof readMcpStatus;callTool?:typeof callReadOnlyTool;signal?:AbortSignal};

// The current specification uses Document; preview browsers used Navigator.
export function browserModelContext(doc:WebMcpSurface,nav:WebMcpSurface):ModelContext|undefined{
  const context=doc.modelContext??nav.modelContext;
  return typeof context?.registerTool==='function'?context:undefined;
}

export async function registerWebMcp(context:ModelContext|undefined,{readStatus=readMcpStatus,callTool=callReadOnlyTool,signal}:RegistrationOptions={}){
  const controller=new AbortController();
  const registered:string[]=[];
  let disposed=false;
  const dispose=()=>{
    if(disposed)return;
    disposed=true;controller.abort();signal?.removeEventListener('abort',dispose);
    for(const name of registered){try{context?.unregisterTool?.(name);}catch{/* Signal-based implementations already removed the tool. */}}
  };
  if(!context)return {state:'UNSUPPORTED',registered,dispose};
  signal?.addEventListener('abort',dispose,{once:true});
  if(signal?.aborted){dispose();return {state:'UNAVAILABLE',registered,dispose};}
  try{
    const status=await readStatus(controller.signal);
    for(const tool of status.tools){
      controller.signal.throwIfAborted();
      if(tool.access!=='PUBLIC'||tool.annotations.readOnlyHint!==true||tool.availability!=='AVAILABLE')continue;
      const name=`nexo_${tool.name}`;
      await context.registerTool({name,description:tool.description,inputSchema:tool.inputSchema,annotations:{readOnlyHint:true},
        execute:(args,invocation)=>callTool(tool,args,invocation?.signal
          ?AbortSignal.any([controller.signal,invocation.signal]):controller.signal)}, {signal:controller.signal});
      registered.push(name);
    }
    return {state:registered.length?'REGISTERED':'UNAVAILABLE',registered,dispose};
  }catch{
    dispose();
    return {state:'UNAVAILABLE',registered:[],dispose};
  }
}

export function startWebMcp(){
  const context=browserModelContext(document as WebMcpSurface,navigator as WebMcpSurface);
  document.documentElement.dataset.webmcp=context?'CONNECTING':'UNSUPPORTED';
  if(!context)return;
  let generation=0;
  let lifecycle:AbortController;
  let dispose=()=>{};
  const activate=()=>{
    const current=++generation;lifecycle=new AbortController();
    document.documentElement.dataset.webmcp='CONNECTING';
    void registerWebMcp(context,{signal:lifecycle.signal}).then(result=>{
      if(current!==generation){result.dispose();return;}
      dispose=result.dispose;
      document.documentElement.dataset.webmcp=result.state;
      document.documentElement.dataset.webmcpTools=String(result.registered.length);
    });
  };
  window.addEventListener('pagehide',()=>{generation++;lifecycle.abort();dispose();});
  window.addEventListener('pageshow',event=>{if(event.persisted)activate();});
  activate();
}
