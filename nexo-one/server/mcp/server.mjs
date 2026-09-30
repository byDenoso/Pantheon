import {createMcpHandler,McpServer} from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import {executeMcpTool} from './tools.mjs';
import {STYLE_POLICY,buildStyleInstruction,validateStyleText} from '../policy/style-policy.mjs';
import {getPdfPolicy} from '../policy/pdf-reporting-policy.mjs';

const READ_ONLY_ANNOTATIONS=Object.freeze({
  readOnlyHint:true,
  destructiveHint:false,
  idempotentHint:true,
  openWorldHint:false
});


const TOOL_DEFINITIONS=Object.freeze({
  get_science_state:{
    description:'Read the current public Science Read Model V2 state.',
    inputSchema:z.object({})
  },
  get_changes:{
    description:'Read the current public science activity/change ledger.',
    inputSchema:z.object({})
  },
  search_atlas:{
    description:'Search public Atlas science entities and observations.',
    inputSchema:z.object({query:z.string().max(200).optional(),q:z.string().max(200).optional(),limit:z.number().int().min(1).max(200).optional()})
  },
  get_program:{
    description:'Read one public science program and its campaigns.',
    inputSchema:z.object({id:z.string().max(512).optional(),programId:z.string().max(512).optional(),program_id:z.string().max(512).optional()})
  },
  get_campaign:{
    description:'Read one public science campaign and its linked evidence chain.',
    inputSchema:z.object({id:z.string().max(512).optional(),campaignId:z.string().max(512).optional(),campaign_id:z.string().max(512).optional()})
  },
  get_observations:{
    description:'Read public scientific observations with optional filters.',
    inputSchema:z.object({metricId:z.string().max(512).optional(),metric_id:z.string().max(512).optional(),domain:z.string().max(512).optional(),campaignId:z.string().max(512).optional(),campaign_id:z.string().max(512).optional(),kind:z.string().max(512).optional(),limit:z.number().int().min(1).max(500).optional()})
  },
  get_h0_stacks:{
    description:'Read explicit published H0 observations grouped by source stack without inferring missing uncertainty.',
    inputSchema:z.object({})
  },
  get_evidence_chain:{
    description:'Read the public evidence chain for a campaign, test, or source reference.',
    inputSchema:z.object({campaignId:z.string().max(512).optional(),campaign_id:z.string().max(512).optional(),testId:z.string().max(512).optional(),test_id:z.string().max(512).optional(),sourceRef:z.string().max(512).optional(),source_ref:z.string().max(512).optional()})
  },
  get_operations:{
    description:'Read public-safe NEXO operational work records.',
    inputSchema:z.object({limit:z.number().int().min(1).max(500).optional()})
  },
  get_activity:{
    description:'Read public science activity records.',
    inputSchema:z.object({limit:z.number().int().min(1).max(500).optional()})
  },
  get_provenance:{
    description:'Read provenance for one public entity or for the current science state.',
    inputSchema:z.object({id:z.string().max(512).optional(),entityId:z.string().max(512).optional(),entity_id:z.string().max(512).optional()})
  },
  get_style_policy:{
    description:'Read the canonical NEXO writing style policy and generator instruction.',
    inputSchema:z.object({})
  },
  validate_style_text:{
    description:'Validate candidate generated text against the canonical NEXO writing style policy.',
    inputSchema:z.object({text:z.string().max(200000)})
  },
  get_pdf_policy:{
    description:'Read the canonical NEXO PDF reporting policy, presets, and authoring instruction.',
    inputSchema:z.object({preset:z.string().max(80).optional()})
  }
});

export const NEXO_MCP_TOOL_NAMES=Object.freeze(Object.keys(TOOL_DEFINITIONS));
export const MCP_SERVER_INFO=Object.freeze({name:'nexo-science',version:'1.3.0',transport:'streamable-http',endpoint:'/api/mcp',mode:'read-only',access:'PUBLIC'});
const category=name=>name.includes('policy')||name==='validate_style_text'?'policy':name==='get_operations'?'operations':name==='get_provenance'?'provenance':'science';
export const MCP_TOOL_REGISTRY=Object.freeze(Object.fromEntries(NEXO_MCP_TOOL_NAMES.map(name=>[name,Object.freeze({
  name,...TOOL_DEFINITIONS[name],inputSchema:TOOL_DEFINITIONS[name].inputSchema.strict(),
  category:category(name),access:'PUBLIC',annotations:READ_ONLY_ANNOTATIONS
})])));
const calls=[];
let total=0,errors=0;
export function mcpTelemetry(){return {scope:'process-local',total,errors,calls:calls.map(call=>({...call}))};}
const errorCode=error=>error?.code==='MCP_INVALID_INPUT'?'MCP_INVALID_INPUT':error?.code==='UNKNOWN_MCP_TOOL'?'UNKNOWN_MCP_TOOL':'MCP_SOURCE_UNAVAILABLE';

export async function readNexoMcpStatus({readSnapshot}){
  let model=null,snapshot=null;
  try{snapshot=await readSnapshot();model=await executeMcpTool(snapshot,'get_science_state',{});}catch{}
  return {
    contract:'NEXO_MCP_STATUS_V1',server:MCP_SERVER_INFO,status:model?.state==='READY'?'READY':'DEGRADED',
    generated_at:model?.generatedAt||null,last_read_at:snapshot?.lastReadAt||null,
    fingerprint:model?.fingerprint||null,projectionFingerprint:model?.projectionFingerprint||null,
    sourceVersion:model?.sourceVersion||null,authority:model?.authority||null,freshness:model?.freshness||'UNAVAILABLE',
    provenance:model?.provenance||[],tool_count:NEXO_MCP_TOOL_NAMES.length,
    tools:Object.values(MCP_TOOL_REGISTRY).map(({inputSchema,...definition})=>({
      ...definition,inputSchema:z.toJSONSchema(inputSchema),
      availability:definition.category==='policy'||model?.state==='READY'?'AVAILABLE':'UNAVAILABLE'
    })),telemetry:mcpTelemetry(),access_levels:['PUBLIC','AUTHENTICATED','OPERATIONAL']
  };
}
function toolResult(payload){
  return {content:[{type:'text',text:JSON.stringify(payload)}],structuredContent:{result:payload}};
}

export async function executeNexoMcpTool({readSnapshot},name,args={}){
  const definition=Object.hasOwn(MCP_TOOL_REGISTRY,name)?MCP_TOOL_REGISTRY[name]:null;
  if(!definition)throw Object.assign(new Error('UNKNOWN_MCP_TOOL'),{code:'UNKNOWN_MCP_TOOL'});
  const parsed=definition.inputSchema.safeParse(args);
  if(!parsed.success)throw Object.assign(new Error('MCP_INVALID_INPUT'),{code:'MCP_INVALID_INPUT'});
  args=parsed.data;
  const start=performance.now();
  let payload,code,cache='NOT_USED';
  try{
    if(name==='get_style_policy')payload={policy:STYLE_POLICY,instruction:buildStyleInstruction()};
    else if(name==='validate_style_text')payload={policyId:STYLE_POLICY.id,...validateStyleText(args.text)};
    else if(name==='get_pdf_policy')payload=getPdfPolicy(args.preset);
    else{
      if(typeof readSnapshot!=='function')throw new TypeError('MCP_READ_SNAPSHOT_REQUIRED');
      payload=await executeMcpTool(await readSnapshot(),name,args,{onCache:value=>{cache=value;}});
    }
    return payload;
  }catch(error){code=errorCode(error);throw Object.assign(new Error(code),{code});}
  finally{
    total++;if(code)errors++;
    calls.unshift({tool:name,duration_ms:Math.round((performance.now()-start)*100)/100,status:code?'ERROR':'OK',timestamp:new Date().toISOString(),fingerprint:payload?.fingerprint||null,cache,error:code||null});
    calls.splice(30);
  }
}

export function createNexoMcpServer({readSnapshot}){
  if(typeof readSnapshot!=='function')throw new TypeError('MCP_READ_SNAPSHOT_REQUIRED');
  const server=new McpServer({name:MCP_SERVER_INFO.name,version:MCP_SERVER_INFO.version});
  for(const definition of Object.values(MCP_TOOL_REGISTRY)){
    const {name,description,inputSchema,annotations}=definition;
    server.registerTool(name,{description,inputSchema,annotations},async args=>{
      try{return toolResult(await executeNexoMcpTool({readSnapshot},name,args));}
      catch(error){return {...toolResult({error:errorCode(error)}),isError:true};}
    });
  }
  return server;
}

export function createNexoMcpWebHandler({readSnapshot}){
  const handler=createMcpHandler(()=>createNexoMcpServer({readSnapshot}),{responseMode:'json'});
  return {
    close:()=>handler.close(),
    async fetch(request,options){
      if(request.method==='POST'&&request.body){
        const reader=request.body.getReader(),chunks=[];let size=0;
        while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
          if(size>262144){await reader.cancel();return Response.json({error:'REQUEST_BODY_TOO_LARGE'},{status:413});}
          chunks.push(value);
        }
        request=new Request(request,{body:Buffer.concat(chunks)});
      }
      return handler.fetch(request,options);
    }
  };
}
