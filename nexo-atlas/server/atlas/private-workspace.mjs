import {normalizePrivateTower} from './private-tower-input.mjs';
import {compilePrivateTowerSystem} from './private-tower-system.mjs';
import {buildLab} from '../../src/features/lab/model.ts';
import {serializeWorkspaceLab,WORKSPACE_CONTRACT} from '../../src/private-workspace/workspace-lab.ts';
import {privateWriterOperations} from './private-writer-status.mjs';

// Only the fields the Conhecimento view reads; the rest of read_model stays server-side.
const pick=(row,keys)=>Object.fromEntries(keys.filter(key=>row[key]!=null).map(key=>[key,row[key]]));
const picked=(rows,keys)=>Object.fromEntries(Object.entries(rows??{}).map(([id,row])=>[id,pick(row,keys)]));
export function knowledgeProjection(model) {
  const tests=Object.fromEntries(Object.entries(model.tests??{}).filter(([,row])=>row.hypothesis_id&&row.verdict).map(([id,row])=>[id,pick(row,['id','hypothesis_id','verdict','review_state','display_name','title','result_meaning','executed_at','created_at','data_lineage','datasets'])]));
  return {hypotheses:picked(model.hypotheses,['id','hypothesis_id','proposition','title','question','status','question_id','campaign_id','roadmap_id']),
    campaigns:picked(model.campaigns,['id','campaign_id','central_question','title','roadmap_id']),claims:model.claims??{},tests,
    ...(model.knowledge??{})};
}

/** The current UI's exact values, without retired screens or duplicate source trees. */
export function compilePrivateWorkspaceRuntime(tower) {
  const context=normalizePrivateTower(tower),system=compilePrivateTowerSystem(context),lab=buildLab(system);
  const {science_projection_v1,read_model,evolution,evolution_partial,...workspace}=system;
  const {revision,generatedAt,sourceRef}=context;
  const publication={contract:'NEXO_PRIVATE_PROJECTION_PUBLICATION_V1',access:'PRIVATE',manifest:{authority:'TOWER_V06',access:'PRIVATE',source_storage:'GOOGLE_DRIVE_PRIVATE',truth_owner:tower.truth_owner,source_state_fingerprint:revision,tower_revision:revision,projection_fingerprint:revision,projection_only:true,writeback:'FORBIDDEN',generated_at:generatedAt},build_meta:{contract:'NEXO_ONE_BUILD_META_V1',projection_fingerprint:revision,built_at:generatedAt}};
  workspace.workspace_lab=serializeWorkspaceLab(lab,revision);
  workspace.writer_operations=privateWriterOperations(tower).body;
  workspace.read_model={version:read_model.version,access:'PRIVATE',source_ref:sourceRef,source_revision:revision,
    evolution:read_model.evolution && Object.hasOwn(read_model.evolution,'board') ? {board:read_model.evolution.board} : {},
    knowledge:knowledgeProjection(read_model),
    scope:'WORKSPACE_BOARD; CANONICAL_TEST_RECORDS_ON_DEMAND'};
  return {contract:'ATLAS_PRIVATE_V1',data:{contract:WORKSPACE_CONTRACT,access:'PRIVATE',generated_at:generatedAt,source_revision:revision,fingerprint:revision,system:workspace,publication,world:null,topology:null,galaxy:null,
    profile:{id:'workspace-v1',test_record_route:'/api/atlas-private/test',omitted_views:['world','topology','galaxy','activity'],cache:'REQUEST_LOCAL_NO_SERVER_CACHE'}}};
}

/** Raw canonical record uses the same compiler and ID normalization as the full read model. */
export function privateWorkspaceTest(tower,{id,expected_revision}={}) {
  if (typeof id!=='string'||!id.trim()||id.length>512||typeof expected_revision!=='string'||!/^sha256:[a-f0-9]{64}$/.test(expected_revision)) return {status:400,body:{error:'PRIVATE_TEST_REQUEST_INVALID'}};
  const context=normalizePrivateTower(tower);
  if(context.revision!==expected_revision) return {status:409,body:{error:'SOURCE_REVISION_CHANGED'}};
  const system=compilePrivateTowerSystem(context),record=Object.hasOwn(system.read_model.tests,id)?system.read_model.tests[id]:null;
  if(!record)return {status:404,body:{error:'PRIVATE_TEST_NOT_FOUND'}};
  return {status:200,body:{contract:'ATLAS_PRIVATE_TEST_V1',access:'PRIVATE',id,source_revision:context.revision,generated_at:context.generatedAt,record}};
}
