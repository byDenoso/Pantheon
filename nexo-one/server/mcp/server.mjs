import {createMcpHandler,McpServer} from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import {atlasAuthenticated,atlasSameOrigin} from '../auth/atlas-session.mjs';
import {executeMcpTool} from './tools.mjs';
import {registerOperationalTools} from './operational-tools.mjs';
import {operationalForRequest} from './operational-runtime.mjs';
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
  get_capabilities:{
    description:'Read public MCP tool availability, access scope, and canonical projection health.',
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
export const MCP_SERVER_INFO=Object.freeze({name:'nexo-science',version:'1.4.0',transport:'streamable-http',endpoint:'/api/mcp',mode:'read-only',access:'PUBLIC'});
const category=name=>name==='get_capabilities'?'capabilities':name.includes('policy')||name==='validate_style_text'?'policy':name==='get_operations'?'operations':name==='get_provenance'?'provenance':'science';
export const MCP_TOOL_REGISTRY=Object.freeze(Object.fromEntries(NEXO_MCP_TOOL_NAMES.map(name=>[name,Object.freeze({
  name,...TOOL_DEFINITIONS[name],inputSchema:TOOL_DEFINITIONS[name].inputSchema.strict(),
  category:TOOL_DEFINITIONS[name].category||category(name),access:TOOL_DEFINITIONS[name].access||'PUBLIC',annotations:TOOL_DEFINITIONS[name].annotations||READ_ONLY_ANNOTATIONS
})])));
export const isPublicReadOnlyMcpTool=definition=>definition?.access==='PUBLIC'&&definition?.annotations?.readOnlyHint===true;
const publicTools=()=>Object.values(MCP_TOOL_REGISTRY).filter(isPublicReadOnlyMcpTool);
export const ANONYMOUS_PUBLIC_CATALOG_TOOL='get_public_catalog_status';
const PUBLIC_CATALOG_STATUS=Object.freeze({
  contract:'NEXO_PUBLIC_CATALOG_STATUS_V1',status:'DEGRADED',availability:'UNAVAILABLE',items:[],reason:'CATALOG_UNAVAILABLE'
});
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
    projectionOnly:snapshot?.projectionOnly===true?true:null,writeback:snapshot?.manifest?.writeback||null,
    provenance:model?.provenance||[],tool_count:publicTools().length,
    tools:publicTools().map(({inputSchema,...definition})=>({
      ...definition,inputSchema:z.toJSONSchema(inputSchema),
      availability:['capabilities','policy'].includes(definition.category)||model?.state==='READY'?'AVAILABLE':'UNAVAILABLE'
    })),telemetry:mcpTelemetry(),access_levels:['PUBLIC','AUTHENTICATED','OPERATIONAL']
  };
}
function publicCapabilities(status){
  const tools=status.tools.map(({name,description,category,access,annotations,availability,inputSchema})=>({
    name,description,category,access,annotations,availability,inputSchema
  }));
  return {
    contract:'NEXO_MCP_CAPABILITIES_V1',status:status.status,
    public_surface:{access:'PUBLIC',mode:'READ_ONLY',authority:status.authority,
      projection_only:status.projectionOnly,writeback:status.writeback,
      freshness:status.freshness,generated_at:status.generated_at,last_read_at:status.last_read_at,
      source_version:status.sourceVersion,fingerprint:status.fingerprint,
      projection_fingerprint:status.projectionFingerprint},
    tools,tool_count:tools.length,
    authenticated_surface:{operational_tools_access:'AUTHENTICATED',operational_tools_discoverable:'AUTHENTICATED_ONLY',mutations:'WRITER_MEDIATED'}
  };
}
function toolResult(payload){
  return {content:[{type:'text',text:JSON.stringify(payload)}],structuredContent:{result:payload}};
}

export async function executeNexoMcpTool({readSnapshot},name,args={}){
  const definition=Object.hasOwn(MCP_TOOL_REGISTRY,name)?MCP_TOOL_REGISTRY[name]:null;
  if(!definition)throw Object.assign(new Error('UNKNOWN_MCP_TOOL'),{code:'UNKNOWN_MCP_TOOL'});
  if(!isPublicReadOnlyMcpTool(definition))throw Object.assign(new Error('UNKNOWN_MCP_TOOL'),{code:'UNKNOWN_MCP_TOOL'});
  const parsed=definition.inputSchema.safeParse(args);
  if(!parsed.success)throw Object.assign(new Error('MCP_INVALID_INPUT'),{code:'MCP_INVALID_INPUT'});
  args=parsed.data;
  const start=performance.now();
  let payload,code,cache='NOT_USED';
  try{
    if(name==='get_style_policy')payload={policy:STYLE_POLICY,instruction:buildStyleInstruction()};
    else if(name==='validate_style_text')payload={policyId:STYLE_POLICY.id,...validateStyleText(args.text)};
    else if(name==='get_pdf_policy')payload=getPdfPolicy(args.preset);
    else if(name==='get_capabilities')payload=publicCapabilities(await readNexoMcpStatus({readSnapshot}));
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

export function createNexoMcpServer({readSnapshot,operational=null}){
  if(typeof readSnapshot!=='function')throw new TypeError('MCP_READ_SNAPSHOT_REQUIRED');
  const server=new McpServer({name:MCP_SERVER_INFO.name,version:MCP_SERVER_INFO.version});
  for(const definition of publicTools()){
    const {name,description,inputSchema,annotations}=definition;
    server.registerTool(name,{description,inputSchema,annotations},async args=>{
      try{return toolResult(await executeNexoMcpTool({readSnapshot},name,args));}
      catch(error){return {...toolResult({error:errorCode(error)}),isError:true};}
    });
  }
  if(operational)registerOperationalTools(server,{...operational,z});
  return server;
}

function createAnonymousPublicCatalogServer(){
  const server=new McpServer({name:MCP_SERVER_INFO.name,version:MCP_SERVER_INFO.version});
  server.registerTool(ANONYMOUS_PUBLIC_CATALOG_TOOL,{
    description:'Read only the availability of the approved public catalog. No records are returned while the catalog is unavailable.',
    inputSchema:z.object({}).strict(),
    annotations:READ_ONLY_ANNOTATIONS
  },async()=>toolResult(PUBLIC_CATALOG_STATUS));
  return server;
}

function anonymousPublicMcpRequest(body){
  if(!body||typeof body!=='object'||Array.isArray(body)||body.jsonrpc!=='2.0'||typeof body.method!=='string')return false;
  if(['initialize','notifications/initialized','ping','server/discover','tools/list','resources/list','prompts/list'].includes(body.method))return true;
  if(body.method!=='tools/call'||!body.params||typeof body.params!=='object'||Array.isArray(body.params))return false;
  if(Object.keys(body.params).some(key=>!['name','arguments','_meta'].includes(key)))return false;
  if(body.params.name!==ANONYMOUS_PUBLIC_CATALOG_TOOL)return false;
  const args=body.params.arguments;
  return args===undefined||Boolean(args&&typeof args==='object'&&!Array.isArray(args)&&Object.keys(args).length===0);
}

function anonymousRequest(request,body){
  const headers=new Headers();
  for(const name of ['accept','content-type','mcp-protocol-version','mcp-method','mcp-name','origin']){
    const value=request.headers.get(name);
    if(value)headers.set(name,value);
  }
  const safeBody={jsonrpc:'2.0',method:body.method};
  if(Object.hasOwn(body,'id'))safeBody.id=body.id;
  if(body.method==='initialize'){
    safeBody.params={
      protocolVersion:body.params?.protocolVersion,
      capabilities:{},
      clientInfo:{name:'anonymous-client',version:'1.0.0'}
    };
  }else if(body.method==='tools/call'){
    safeBody.params={name:ANONYMOUS_PUBLIC_CATALOG_TOOL,arguments:{}};
  }
  return new Request(request.url,{method:'POST',headers,body:Buffer.from(JSON.stringify(safeBody)),signal:request.signal});
}

function noStore(response){
  const headers=new Headers(response.headers);
  headers.set('Cache-Control','private, no-store');
  headers.set('Vary','Authorization, Origin, Cookie');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

function anonymousDenied(){
  return Response.json({error:'AUTH_REQUIRED'},{status:401,headers:{
    'Cache-Control':'private, no-store','Vary':'Authorization, Origin, Cookie','X-Content-Type-Options':'nosniff'
  }});
}

async function atlasSessionAccess(request){
  const cookie=String(request.headers.get('cookie')||'');
  if(!cookie.split(';').some(value=>value.trim().startsWith('__Host-atlas_session=')))return 'anonymous';
  const req={method:request.method,headers:Object.fromEntries(request.headers.entries())};
  try{
    if(!await atlasAuthenticated(req,process.env,Date.now()))return 'anonymous';
    if(request.method==='POST'&&!atlasSameOrigin(req,process.env))return 'origin-denied';
    return 'authenticated';
  }catch{return 'anonymous';}
}

function originDenied(){
  return Response.json({error:'ORIGIN_NOT_ALLOWED'},{status:403,headers:{
    'Cache-Control':'private, no-store','Vary':'Authorization, Origin, Cookie','X-Content-Type-Options':'nosniff'
  }});
}

export function createNexoMcpWebHandler({readSnapshot}){
  const publicHandler=createMcpHandler(()=>createAnonymousPublicCatalogServer(),{responseMode:'json'});
  const atlasSessionHandler=createMcpHandler(()=>createNexoMcpServer({readSnapshot}),{responseMode:'json'});
  return {
    close:async()=>{await Promise.all([publicHandler.close(),atlasSessionHandler.close()]);},
    async fetch(request,options){
      let parsedBody=null;
      if(request.method==='POST'&&request.body){
        const reader=request.body.getReader(),chunks=[];let size=0;
        while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
          if(size>262144){await reader.cancel();return noStore(Response.json({error:'REQUEST_BODY_TOO_LARGE'},{status:413}));}
          chunks.push(value);
        }
        const bytes=Buffer.concat(chunks);
        try{parsedBody=JSON.parse(bytes.toString('utf8'));}catch{}
        request=new Request(request,{body:bytes});
      }
      const operational=await operationalForRequest(request);
      if(operational.principal){
        const privateHandler=createMcpHandler(()=>createNexoMcpServer({readSnapshot,operational}),{responseMode:'json'});
        try{return await privateHandler.fetch(request,options);}
        finally{await privateHandler.close();}
      }
      const atlasAccess=await atlasSessionAccess(request);
      if(atlasAccess==='origin-denied')return originDenied();
      if(atlasAccess==='authenticated')return noStore(await atlasSessionHandler.fetch(request,options));
      if(request.method!=='POST'||!anonymousPublicMcpRequest(parsedBody))return anonymousDenied();
      return noStore(await publicHandler.fetch(anonymousRequest(request,parsedBody),options));
    }
  };
}
