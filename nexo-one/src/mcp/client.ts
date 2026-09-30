import {fetchSharedJson} from '../data/shared-json.ts';

export type ToolSchema={type?:string;properties?:Record<string,{type?:string;enum?:unknown[];minimum?:number;maximum?:number;maxLength?:number}>;required?:string[]};
export type McpTool={name:string;description:string;category:string;access:string;availability:string;inputSchema:ToolSchema;annotations:{readOnlyHint:boolean|null;destructiveHint:boolean|null;idempotentHint:boolean|null;openWorldHint:boolean|null}};
export type McpCall={tool:string;duration_ms:number;status:string;timestamp:string;fingerprint:string|null;cache:string;error:string|null};
export type McpStatus={contract:string;server:{name:string;version:string;endpoint:string;transport:string;mode:string;access:string};status:string;generated_at:string|null;last_read_at:string|null;fingerprint:string|null;projectionFingerprint:string|null;sourceVersion:string|null;authority:string|null;freshness:string;provenance:unknown[];tools:McpTool[];tool_count:number;telemetry:{scope:string;total:number;errors:number;calls:McpCall[]}|null};
export const MCP_ENDPOINT=import.meta.env.VITE_MCP_ENDPOINT?.trim()||'/api/mcp';
export async function readMcpStatus(signal?:AbortSignal):Promise<McpStatus>{
  try{
    const status=await fetchSharedJson<McpStatus>(`${MCP_ENDPOINT}/status`,{cache:'no-store',signal});
    if(status.contract!=='NEXO_MCP_STATUS_V1')throw new Error('Metadados MCP incompatíveis.');
    return status;
  }catch{
    if(signal?.aborted)throw signal.reason;
    // Older servers expose canonical discovery through MCP before the HTTP status projection exists.
    try{
      const hello=await initialize(signal);
      const discovery=await rpc('tools/list',{},hello.protocolVersion,signal);
      const tools:McpTool[]=discovery.tools.map((tool:McpTool)=>({...tool,annotations:{readOnlyHint:tool.annotations?.readOnlyHint??null,destructiveHint:tool.annotations?.destructiveHint??null,idempotentHint:tool.annotations?.idempotentHint??null,openWorldHint:tool.annotations?.openWorldHint??null},category:'Indisponível',access:'PUBLIC',availability:'DISCOVERED'}));
      return {contract:'NEXO_MCP_STATUS_V1',server:{name:hello.serverInfo.name,version:hello.serverInfo.version,endpoint:MCP_ENDPOINT,transport:'streamable-http',mode:tools.length>0&&tools.every(tool=>tool.annotations?.readOnlyHint===true)?'read-only':'Indisponível',access:'PUBLIC'},status:'PROTOCOL_ONLY',generated_at:null,last_read_at:null,fingerprint:null,projectionFingerprint:null,sourceVersion:null,authority:null,freshness:'UNAVAILABLE',provenance:[],tools,tool_count:tools.length,telemetry:null};
    }catch{
      if(signal?.aborted)throw signal.reason;
      throw new Error('Servidor MCP indisponível. Não foi possível obter os metadados nem descobrir ferramentas pelo protocolo.');
    }
  }
}
const initialize=(signal?:AbortSignal)=>rpc('initialize',{protocolVersion:'2026-07-28',capabilities:{},clientInfo:{name:'nexo-atlas',version:'1.0.0'}},undefined,signal);
async function rpc(method:string,params:unknown,protocol?:string,signal?:AbortSignal){
  const response=await fetch(MCP_ENDPOINT,{method:'POST',cache:'no-store',signal,headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream',...(protocol?{'Mcp-Protocol-Version':protocol}:{})},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
  if(!response.ok)throw new Error(`Servidor MCP respondeu HTTP ${response.status}.`);
  const raw=await response.text();
  const message=response.headers.get('content-type')?.includes('text/event-stream')
    ? raw.split(/\r?\n\r?\n/).map(block=>block.split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n')).filter(Boolean).map(data=>JSON.parse(data)).find(item=>item.id===1)
    : JSON.parse(raw);
  if(!message)throw new Error('O servidor MCP não retornou um resultado.');
  if(message.error)throw new Error(`MCP ${message.error.code}: ${message.error.message}`);
  return message.result;
}
export async function callReadOnlyTool(tool:McpTool,args:Record<string,unknown>,signal?:AbortSignal){
  if(tool.annotations?.readOnlyHint!==true||tool.access!=='PUBLIC')throw new Error('Esta ferramenta exige outro nível de acesso.');
  const hello=await initialize(signal);
  const result=await rpc('tools/call',{name:tool.name,arguments:args},hello.protocolVersion,signal);
  let payload=result.structuredContent?.result;
  if(!payload){try{payload=JSON.parse(result.content?.find((item:{type:string})=>item.type==='text')?.text||'{}');}catch{throw new Error('A ferramenta MCP não retornou um resultado estruturado.');}}
  if(result.isError)throw new Error(payload.error||'A ferramenta MCP falhou.');
  return payload as Record<string,unknown>;
}
