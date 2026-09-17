import {createMcpHandler,McpServer} from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import {executeMcpTool,MCP_TOOL_NAMES as CORE_MCP_TOOL_NAMES} from './tools.mjs';
import {STYLE_POLICY,buildStyleInstruction,validateStyleText} from '../policy/style-policy.mjs';
import {getPdfPolicy} from '../policy/pdf-reporting-policy.mjs';

const READ_ONLY_ANNOTATIONS=Object.freeze({
  readOnlyHint:true,
  destructiveHint:false,
  idempotentHint:true,
  openWorldHint:false
});

const STYLE_MCP_TOOL_NAMES=Object.freeze(['get_style_policy','validate_style_text','get_pdf_policy']);
const COCKPIT_MCP_TOOL_NAMES=Object.freeze(['get_system_state','get_world_state','get_capabilities','get_execution_runs','get_graph','get_learning_state','get_provider_health']);
export const NEXO_MCP_TOOL_NAMES=Object.freeze([...CORE_MCP_TOOL_NAMES,...STYLE_MCP_TOOL_NAMES,...COCKPIT_MCP_TOOL_NAMES]);

const TOOL_DEFINITIONS=Object.freeze({
  get_science_state:{description:'Read the current public Science Read Model V2 state.',inputSchema:z.object({})},
  get_changes:{description:'Read the current public science activity/change ledger.',inputSchema:z.object({})},
  search_atlas:{description:'Search public Atlas science entities and observations.',inputSchema:z.object({query:z.string().max(200).optional(),q:z.string().max(200).optional(),limit:z.number().int().min(1).max(200).optional()})},
  get_program:{description:'Read one public science program and its campaigns.',inputSchema:z.object({id:z.string().optional(),programId:z.string().optional(),program_id:z.string().optional()})},
  get_campaign:{description:'Read one public science campaign and its linked evidence chain.',inputSchema:z.object({id:z.string().optional(),campaignId:z.string().optional(),campaign_id:z.string().optional()})},
  get_observations:{description:'Read public scientific observations with optional filters.',inputSchema:z.object({metricId:z.string().optional(),metric_id:z.string().optional(),domain:z.string().optional(),campaignId:z.string().optional(),campaign_id:z.string().optional(),kind:z.string().optional(),limit:z.number().int().min(1).max(500).optional()})},
  get_h0_stacks:{description:'Read explicit published H0 observations grouped by source stack without inferring missing uncertainty.',inputSchema:z.object({})},
  get_evidence_chain:{description:'Read the public evidence chain for a campaign, test, or source reference.',inputSchema:z.object({campaignId:z.string().optional(),campaign_id:z.string().optional(),testId:z.string().optional(),test_id:z.string().optional(),sourceRef:z.string().optional(),source_ref:z.string().optional()})},
  get_operations:{description:'Read public-safe NEXO operational work records.',inputSchema:z.object({limit:z.number().int().min(1).max(500).optional()})},
  get_activity:{description:'Read public science activity records.',inputSchema:z.object({limit:z.number().int().min(1).max(500).optional()})},
  get_provenance:{description:'Read provenance for one public entity or for the current science state.',inputSchema:z.object({id:z.string().optional(),entityId:z.string().optional(),entity_id:z.string().optional()})},
  get_style_policy:{description:'Read the canonical NEXO writing style policy and generator instruction.',inputSchema:z.object({})},
  validate_style_text:{description:'Validate candidate generated text against the canonical NEXO writing style policy.',inputSchema:z.object({text:z.string().max(200000)})},
  get_pdf_policy:{description:'Read the canonical NEXO PDF reporting policy, presets, and authoring instruction.',inputSchema:z.object({preset:z.string().max(80).optional()})},
  get_system_state:{description:'Read the current public-safe NEXO ONE SystemState projection.',inputSchema:z.object({})},
  get_world_state:{description:'Read the current public-safe WorldState projection, including explicit AUTH_REQUIRED placeholders.',inputSchema:z.object({})},
  get_capabilities:{description:'Read public-safe capability state from the canonical SystemState projection.',inputSchema:z.object({})},
  get_execution_runs:{description:'Read public-safe execution runs from the canonical SystemState projection.',inputSchema:z.object({})},
  get_graph:{description:'Read the public-safe canonical system graph used by Atlas.',inputSchema:z.object({})},
  get_learning_state:{description:'Read public-safe learning filaments from the canonical SystemState projection.',inputSchema:z.object({})},
  get_provider_health:{description:'Read public-safe provider health from the canonical SystemState projection.',inputSchema:z.object({})}
});

function toolResult(payload){
  return {content:[{type:'text',text:JSON.stringify(payload)}],structuredContent:{result:payload}};
}

const requiresSystem=name=>['get_system_state','get_capabilities','get_execution_runs','get_graph','get_learning_state','get_provider_health'].includes(name);

export async function executeNexoMcpTool({readSnapshot,readSystemState,readWorldState},name,args={}){
  if(name==='get_style_policy')return {policy:STYLE_POLICY,instruction:buildStyleInstruction()};
  if(name==='validate_style_text')return {policyId:STYLE_POLICY.id,...validateStyleText(args.text)};
  if(name==='get_pdf_policy')return getPdfPolicy(args.preset);
  if(name==='get_world_state'){
    if(typeof readWorldState!=='function')throw new TypeError('MCP_READ_WORLD_STATE_REQUIRED');
    return readWorldState();
  }
  if(requiresSystem(name)){
    if(typeof readSystemState!=='function')throw new TypeError('MCP_READ_SYSTEM_STATE_REQUIRED');
    const system=await readSystemState();
    if(name==='get_system_state')return system;
    if(name==='get_capabilities')return {generatedAt:system.generated_at,items:system.capabilities||[]};
    if(name==='get_execution_runs')return {generatedAt:system.generated_at,items:system.runs||[]};
    if(name==='get_graph')return system.graph||{nodes:[],edges:[]};
    if(name==='get_learning_state')return {generatedAt:system.generated_at,items:system.filaments||[]};
    return {generatedAt:system.generated_at,items:system.providers||[]};
  }
  if(typeof readSnapshot!=='function')throw new TypeError('MCP_READ_SNAPSHOT_REQUIRED');
  return executeMcpTool(await readSnapshot(),name,args);
}

export function createNexoMcpServer(readers){
  if(typeof readers?.readSnapshot!=='function')throw new TypeError('MCP_READ_SNAPSHOT_REQUIRED');
  const server=new McpServer({name:'nexo-science',version:'1.3.0'});
  for(const name of NEXO_MCP_TOOL_NAMES){
    const definition=TOOL_DEFINITIONS[name];
    server.registerTool(name,{description:definition.description,inputSchema:definition.inputSchema,annotations:READ_ONLY_ANNOTATIONS},async args=>toolResult(await executeNexoMcpTool(readers,name,args)));
  }
  return server;
}

export function createNexoMcpWebHandler(readers){
  return createMcpHandler(()=>createNexoMcpServer(readers),{responseMode:'json'});
}
