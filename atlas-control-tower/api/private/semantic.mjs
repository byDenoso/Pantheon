import {withGoogleAuth,send} from './_middleware.mjs';
import {createTowerGithubGateway} from '../../lib/tower-github-gateway.mjs';
import {createNexoSemanticGateway} from '../../lib/nexo-semantic-gateway.mjs';

const ALLOWED_COMMANDS=new Set([
  'nexo.status','nexo.get_state','nexo.get_work','nexo.get_next_work','nexo.get_mutation',
  'nexo.get_campaigns','nexo.get_interdomain','nexo.get_hypotheses','nexo.get_hypothesis','nexo.get_hypothesis_frontier',
  'nexo.validate_hypothesis_contract','nexo.readback','nexo.get_evidence',
  'nexo.create_work','nexo.handoff_work','nexo.start_work','nexo.submit_result','nexo.block_work','nexo.complete_work',
  'nexo.prepare_campaign','nexo.run_work','nexo.run_campaign'
]);
const WRITE_COMMANDS=new Set([
  'nexo.create_work','nexo.handoff_work','nexo.start_work','nexo.submit_result','nexo.block_work','nexo.complete_work',
  'nexo.prepare_campaign','nexo.run_work','nexo.run_campaign'
]);

function parseBody(body){
  if(body&&typeof body==='object'&&!Buffer.isBuffer(body))return body;
  if(typeof body==='string'&&body.trim())return JSON.parse(body);
  if(Buffer.isBuffer(body)&&body.length)return JSON.parse(body.toString('utf8'));
  return {};
}

export default withGoogleAuth(async(req,res)=>{
  if(String(req.method||'GET').toUpperCase()!=='POST') return send(res,{error:'METHOD_NOT_ALLOWED'},405);
  let body;
  try{body=parseBody(req.body);}catch{return send(res,{error:'INVALID_JSON'},400);}
  const command=String(body?.command||'').trim();
  const args=body?.args&&typeof body.args==='object'&&!Array.isArray(body.args)?body.args:{};
  if(!ALLOWED_COMMANDS.has(command)) return send(res,{error:'COMMAND_NOT_ALLOWED',command},400);

  const towerGateway=createTowerGithubGateway();
  if(WRITE_COMMANDS.has(command)&&!towerGateway.configured.towerWrite){
    return send(res,{error:'TOWER_WRITE_NOT_CONFIGURED',command,write_available:false},503);
  }
  const semantic=createNexoSemanticGateway({towerGateway});
  try{
    const result=await semantic.call(command,args);
    return send(res,{ok:true,command,write_available:Boolean(towerGateway.configured.towerWrite),result});
  }catch(error){
    const message=String(error?.message||error);
    const status=/AUTHORITY_DENIED|FORBIDDEN/.test(message)?403:/VERSION_CONFLICT|CONTENT_CONFLICT|STALE/.test(message)?409:400;
    return send(res,{ok:false,error:message,command,write_available:Boolean(towerGateway.configured.towerWrite)},status);
  }
});

export {_internal as __gatewayInternal} from '../../lib/nexo-semantic-gateway.mjs';
export const _internal={ALLOWED_COMMANDS,WRITE_COMMANDS};
