import {createMcpHandler,McpServer} from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import {executeMcpTool,MCP_TOOL_NAMES as CORE_MCP_TOOL_NAMES} from './tools.mjs';
import {
  buildCapabilities,buildNexoBootstrap,buildHypothesisRegistry,buildHypothesisFrontier,getHypothesis,
  dedupeCandidate,validateFrozenContract,buildExecutionFrontier,buildResultClosureStatus,
  makeHypothesisEntity,makeObjectiveEntity,mutationEnvelope
} from './capabilities.mjs';
import {STYLE_POLICY,buildStyleInstruction,validateStyleText} from '../policy/style-policy.mjs';

const READ_ONLY_ANNOTATIONS=Object.freeze({readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false});
const MUTATION_ANNOTATIONS=Object.freeze({readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false});

const STYLE_MCP_TOOL_NAMES=Object.freeze(['get_style_policy','validate_style_text']);
const CAPABILITY_READ_TOOL_NAMES=Object.freeze([
  'get_capabilities','get_nexo_bootstrap','get_hypothesis_registry','get_hypothesis_frontier','get_hypothesis',
  'dedupe_candidate','validate_frozen_contract','get_execution_frontier','get_result_closure_status'
]);
const MUTATION_MCP_TOOL_NAMES=Object.freeze(['ingest_hypothesis','ingest_objective','canonical_transition','enqueue_test']);
export const NEXO_MCP_TOOL_NAMES=Object.freeze([...CORE_MCP_TOOL_NAMES,...CAPABILITY_READ_TOOL_NAMES,...MUTATION_MCP_TOOL_NAMES,...STYLE_MCP_TOOL_NAMES]);
export const NEXO_MCP_MUTATION_TOOL_NAMES=MUTATION_MCP_TOOL_NAMES;

const criterion=z.union([z.string(),z.number(),z.boolean(),z.record(z.string(),z.unknown())]);
const criteria=z.array(criterion).min(1);
const hypothesisSchema=z.object({
  hypothesis_id:z.string().min(1).optional(),proposition:z.string().min(1),claim_boundary:z.unknown(),
  success_criteria:criteria,kill_criteria:criteria,critical_tests:criteria,max_adaptive_followups:z.number().int().min(0),reopen_policy:z.unknown(),
  program_id:z.string().optional(),domain:z.string().optional(),priority:z.number().optional(),expected_information_gain:z.number().optional(),origin:z.string().optional(),authority:z.string().optional(),status:z.string().optional()
}).passthrough();
const objectiveSchema=z.object({
  objective_id:z.string().min(1).optional(),objective_type:z.enum(['ENGINEERING_OBJECTIVE','OLYMPUS_OBJECTIVE','INTERDOMAIN_CANDIDATE','SYSTEM_IMPROVEMENT']),
  goal:z.string().min(1),title:z.string().optional(),domain:z.string().optional(),program_id:z.string().optional(),origin:z.string().optional(),status:z.string().optional(),
  constraints:z.array(z.unknown()).optional(),success_criteria:z.array(z.unknown()).optional()
}).passthrough();

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

  get_capabilities:{description:'Discover NEXO MCP capabilities, canonical authority and whether governed canonical mutation is available in this runtime.',inputSchema:z.object({})},
  get_nexo_bootstrap:{description:'Read the portable NEXO bootstrap contract for a new chat, app or automation without relying on chat memory.',inputSchema:z.object({})},
  get_hypothesis_registry:{description:'Read the canonical hypothesis registry projection, including live and terminal hypotheses.',inputSchema:z.object({})},
  get_hypothesis_frontier:{description:'Read the live hypothesis frontier; absorbing FALSIFIED/RETIRED hypotheses are excluded.',inputSchema:z.object({})},
  get_hypothesis:{description:'Read one hypothesis with directly linked tests, results, claims and readbacks.',inputSchema:z.object({id:z.string().min(1)})},
  dedupe_candidate:{description:'Check a proposed hypothesis/objective against canonical state before creating another identity.',inputSchema:z.object({kind:z.string().optional(),proposition:z.string().optional(),goal:z.string().optional(),title:z.string().optional(),question:z.string().optional()})},
  validate_frozen_contract:{description:'Validate whether a scientific hypothesis contains the minimum frozen HYPOTHESIS_LIFECYCLE_V1 contract.',inputSchema:z.record(z.string(),z.unknown())},
  get_execution_frontier:{description:'Read active canonical TEST/RUN ownership state for dedupe and bounded execution coordination.',inputSchema:z.object({})},
  get_result_closure_status:{description:'Diagnose whether terminal results satisfy RESULT -> HYPOTHESIS -> CLAIM -> NEXT/TERMINAL -> READBACK without inventing scientific decisions.',inputSchema:z.object({})},

  ingest_hypothesis:{description:'Dedupe and persist a user-directed scientific hypothesis through an injected governed canonical writer. MCP does not execute or judge it.',inputSchema:hypothesisSchema},
  ingest_objective:{description:'Dedupe and persist an engineering, Olympus, interdomain or system objective through an injected governed canonical writer.',inputSchema:objectiveSchema},
  canonical_transition:{description:'Persist an already-decided canonical entity transition through the governed writer. Scientific judgment must be made outside MCP.',inputSchema:z.object({entity_type:z.string().min(1),entity_id:z.string().min(1),transition:z.string().min(1),patch:z.record(z.string(),z.unknown()).optional(),reason:z.string().optional(),evidence_refs:z.array(z.string()).optional()})},
  enqueue_test:{description:'Enqueue exactly one already-frozen canonical TEST candidate through the governed writer; this tool never acquires an execution slot.',inputSchema:z.object({test:z.record(z.string(),z.unknown()),origin_ref:z.string().optional(),authority:z.string().optional()})},

  get_style_policy:{description:'Read the canonical NEXO writing style policy and generator instruction.',inputSchema:z.object({})},
  validate_style_text:{description:'Validate candidate generated text against the canonical NEXO writing style policy.',inputSchema:z.object({text:z.string().max(200000)})}
});

function toolResult(payload){return {content:[{type:'text',text:JSON.stringify(payload)}],structuredContent:{result:payload}};}
function isMutation(name){return MUTATION_MCP_TOOL_NAMES.includes(name);}
async function snapshotFrom(readSnapshot){if(typeof readSnapshot!=='function')throw new TypeError('MCP_READ_SNAPSHOT_REQUIRED');return readSnapshot();}
async function mutate(mutateCanonical,envelope){if(typeof mutateCanonical!=='function')throw new Error('MCP_MUTATION_CAPABILITY_UNAVAILABLE');return mutateCanonical(envelope);}

async function executeCapabilityRead(snapshot,name,args,mutationAvailable){
  switch(name){
    case 'get_capabilities': return buildCapabilities({mutationAvailable});
    case 'get_nexo_bootstrap': return buildNexoBootstrap(snapshot,{mutationAvailable});
    case 'get_hypothesis_registry': return buildHypothesisRegistry(snapshot);
    case 'get_hypothesis_frontier': return buildHypothesisFrontier(snapshot);
    case 'get_hypothesis': return getHypothesis(snapshot,args.id);
    case 'dedupe_candidate': return dedupeCandidate(snapshot,args);
    case 'validate_frozen_contract': return validateFrozenContract(args);
    case 'get_execution_frontier': return buildExecutionFrontier(snapshot);
    case 'get_result_closure_status': return buildResultClosureStatus(snapshot);
    default: return null;
  }
}

async function executeMutation(snapshot,mutateCanonical,name,args){
  if(typeof mutateCanonical!=='function')throw new Error('MCP_MUTATION_CAPABILITY_UNAVAILABLE');
  if(name==='ingest_hypothesis'){
    const entity=makeHypothesisEntity(args),validation=validateFrozenContract(entity);if(!validation.valid)throw new Error(`HYPOTHESIS_CONTRACT_INCOMPLETE:${validation.missing.join(',')}`);
    const dedupe=dedupeCandidate(snapshot,{kind:'SCIENTIFIC_HYPOTHESIS',proposition:entity.proposition});if(dedupe.duplicate&&dedupe.matchId!==entity.hypothesis_id)return {status:'DUPLICATE',dedupe};
    const envelope=mutationEnvelope('hypothesis.ingest','HYPOTHESIS',entity);return mutate(mutateCanonical,envelope);
  }
  if(name==='ingest_objective'){
    const entity=makeObjectiveEntity(args),dedupe=dedupeCandidate(snapshot,{kind:entity.objective_type,goal:entity.goal});if(dedupe.duplicate&&dedupe.matchId!==entity.objective_id)return {status:'DUPLICATE',dedupe};
    return mutate(mutateCanonical,mutationEnvelope('objective.ingest','OBJECTIVE',entity));
  }
  if(name==='canonical_transition')return mutate(mutateCanonical,mutationEnvelope('entity.transition',String(args.entity_type).toUpperCase(),args));
  if(name==='enqueue_test')return mutate(mutateCanonical,mutationEnvelope('test.enqueue','TEST',{...args.test,origin_ref:args.origin_ref,authority:args.authority}));
  throw new Error(`UNKNOWN_MCP_TOOL:${name}`);
}

export async function executeNexoMcpTool({readSnapshot,mutateCanonical},name,args={}){
  if(name==='get_style_policy')return {policy:STYLE_POLICY,instruction:buildStyleInstruction()};
  if(name==='validate_style_text')return {policyId:STYLE_POLICY.id,...validateStyleText(args.text)};
  const snapshot=await snapshotFrom(readSnapshot);
  if(CAPABILITY_READ_TOOL_NAMES.includes(name))return executeCapabilityRead(snapshot,name,args,typeof mutateCanonical==='function');
  if(isMutation(name))return executeMutation(snapshot,mutateCanonical,name,args);
  return executeMcpTool(snapshot,name,args);
}

export function createNexoMcpServer({readSnapshot,mutateCanonical}={}){
  if(typeof readSnapshot!=='function')throw new TypeError('MCP_READ_SNAPSHOT_REQUIRED');
  const server=new McpServer({name:'nexo-capability',version:'1.2.0'});
  for(const name of NEXO_MCP_TOOL_NAMES){
    const definition=TOOL_DEFINITIONS[name];
    server.registerTool(name,{description:definition.description,inputSchema:definition.inputSchema,annotations:isMutation(name)?MUTATION_ANNOTATIONS:READ_ONLY_ANNOTATIONS},async args=>toolResult(await executeNexoMcpTool({readSnapshot,mutateCanonical},name,args)));
  }
  return server;
}

export function createNexoMcpWebHandler({readSnapshot,mutateCanonical}={}){return createMcpHandler(()=>createNexoMcpServer({readSnapshot,mutateCanonical}),{responseMode:'json'});}
