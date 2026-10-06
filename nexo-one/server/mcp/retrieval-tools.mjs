import {createHash} from 'node:crypto';
/** Reuse operational-auth.mjs principal. Never add these tools to the public registry. */
import {RetrievalClient,RetrievalError} from './retrieval-client.mjs';
import definitions from './retrieval-tools.json' with {type:'json'};
export const RETRIEVAL_TOOL_NAMES=Object.freeze(definitions.map(d=>d.name));
function binding(principal,env){
  if(!principal?.authenticated||!Array.isArray(principal.roles))throw new RetrievalError('AUTHENTICATION_REQUIRED');
  let bindings;try{bindings=JSON.parse(env.NEXO_RETRIEVAL_TOKEN_BINDINGS_JSON||'{}');}catch{throw new RetrievalError('INVALID_RUNTIME_BINDING');}
  const b=bindings[principal.id];
  if(!b?.token||!env.NEXO_RETRIEVAL_ENDPOINT)throw new RetrievalError('CONNECTOR_NOT_CONFIGURED');
  return b;
}
export async function executeRetrieval({principal,env=process.env,fetchImpl=fetch},name,args={}){
  if(!RETRIEVAL_TOOL_NAMES.includes(name))throw new RetrievalError('UNKNOWN_RETRIEVAL_TOOL');
  const b=binding(principal,env);
  if(args.role&&!principal.roles.includes(args.role))throw new RetrievalError('ROLE_FORBIDDEN');
  const expectedSubject=createHash('sha256').update('nexo-remote-mcp:'+b.token).digest('hex');
  const client=new RetrievalClient({endpoint:env.NEXO_RETRIEVAL_ENDPOINT,token:b.token,expectedSubject,fetchImpl});
  try{
    const capabilities=await client.connect();
    if(capabilities.roles.some(role=>!principal.roles.includes(role)))throw new RetrievalError('UPSTREAM_SCOPE_TOO_BROAD');
    return await client.call(name,args);
  }finally{await client.close();}
}
function schema(z,definition){
  const fields={};for(const [name,prop] of Object.entries(definition.inputSchema.properties)){
    let s=prop.enum?z.enum(prop.enum):prop.type==='integer'?z.number().int().min(prop.minimum).max(prop.maximum):prop.type==='boolean'?z.boolean():prop.type==='object'?z.record(z.string(),z.unknown()):z.string().max(4000);
    if(!definition.inputSchema.required.includes(name))s=s.optional();fields[name]=s;
  }
  return z.object(fields).strict();
}
export function registerRetrievalTools(server,{principal,z,env=process.env,fetchImpl=fetch}){
  if(!principal?.authenticated)return;
  for(const d of definitions)server.registerTool(d.name,{description:d.description,inputSchema:schema(z,d),annotations:d.annotations},async args=>{
    try{const result=await executeRetrieval({principal,env,fetchImpl},d.name,args);return {content:[{type:'text',text:JSON.stringify(result)}],structuredContent:result};}
    catch(error){const code=/^[A-Z_]{3,80}$/.test(error?.code||'')?error.code:'RETRIEVAL_UNAVAILABLE';return {content:[{type:'text',text:code}],isError:true};}
  });
}
