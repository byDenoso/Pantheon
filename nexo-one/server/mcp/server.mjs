import {createMcpHandler,McpServer} from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import {executeMcpTool,MCP_TOOL_NAMES} from './tools.mjs';

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
    inputSchema:z.object({id:z.string().optional(),programId:z.string().optional(),program_id:z.string().optional()})
  },
  get_campaign:{
    description:'Read one public science campaign and its linked evidence chain.',
    inputSchema:z.object({id:z.string().optional(),campaignId:z.string().optional(),campaign_id:z.string().optional()})
  },
  get_observations:{
    description:'Read public scientific observations with optional filters.',
    inputSchema:z.object({metricId:z.string().optional(),metric_id:z.string().optional(),domain:z.string().optional(),campaignId:z.string().optional(),campaign_id:z.string().optional(),kind:z.string().optional(),limit:z.number().int().min(1).max(500).optional()})
  },
  get_h0_stacks:{
    description:'Read explicit published H0 observations grouped by source stack without inferring missing uncertainty.',
    inputSchema:z.object({})
  },
  get_evidence_chain:{
    description:'Read the public evidence chain for a campaign, test, or source reference.',
    inputSchema:z.object({campaignId:z.string().optional(),campaign_id:z.string().optional(),testId:z.string().optional(),test_id:z.string().optional(),sourceRef:z.string().optional(),source_ref:z.string().optional()})
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
    inputSchema:z.object({id:z.string().optional(),entityId:z.string().optional(),entity_id:z.string().optional()})
  }
});

function toolResult(payload){
  return {
    content:[{type:'text',text:JSON.stringify(payload)}],
    structuredContent:{result:payload}
  };
}

export function createNexoMcpServer({readSnapshot}){
  if(typeof readSnapshot!=='function')throw new TypeError('MCP_READ_SNAPSHOT_REQUIRED');
  const server=new McpServer({name:'nexo-science',version:'1.0.0'});
  for(const name of MCP_TOOL_NAMES){
    const definition=TOOL_DEFINITIONS[name];
    server.registerTool(name,{
      description:definition.description,
      inputSchema:definition.inputSchema,
      annotations:READ_ONLY_ANNOTATIONS
    },async args=>toolResult(await executeMcpTool(await readSnapshot(),name,args)));
  }
  return server;
}

export function createNexoMcpWebHandler({readSnapshot}){
  return createMcpHandler(()=>createNexoMcpServer({readSnapshot}),{responseMode:'json'});
}
