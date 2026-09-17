import {withGoogleAuth,send} from './_middleware.mjs';
import {performSync} from './sync.mjs';
import {createTowerGithubGateway} from '../../lib/tower-github-gateway.mjs';
import {createNexoSemanticGateway} from '../../lib/nexo-semantic-gateway.mjs';
import {createAtlasControlPlane} from '../../lib/atlas-control-plane.mjs';

function parseBody(body){
  if(body&&typeof body==='object'&&!Buffer.isBuffer(body))return body;
  if(typeof body==='string'&&body.trim())return JSON.parse(body);
  if(Buffer.isBuffer(body)&&body.length)return JSON.parse(body.toString('utf8'));
  return {};
}

export default withGoogleAuth(async(req,res)=>{
  if(String(req.method||'GET').toUpperCase()!=='POST')return send(res,{error:'METHOD_NOT_ALLOWED'},405);
  let body;
  try{body=parseBody(req.body);}catch{return send(res,{error:'INVALID_JSON'},400);}

  const towerGateway=createTowerGithubGateway();
  const semantic=createNexoSemanticGateway({towerGateway});
  const control=createAtlasControlPlane({semantic,sync:()=>performSync(req)});
  try{
    const result=await control.execute(body);
    const status=result.acceptance==='rejected'?409:200;
    return send(res,result,status);
  }catch(error){
    const message=String(error?.message||error);
    const status=/AUTHORITY_DENIED|FORBIDDEN/.test(message)?403:/WRITE_NOT_CONFIGURED|UNAVAILABLE/.test(message)?503:/VERSION_CONFLICT|CONTENT_CONFLICT|STALE/.test(message)?409:400;
    const action=String(body?.action||'UNKNOWN').toUpperCase();
    const target=String(body?.target||body?.work_id||body?.run_id||'TOWER_V06');
    return send(res,{
      request_id:`ATLAS-ERROR-${Date.now()}`,
      action,
      target,
      requested_at:new Date().toISOString(),
      acceptance:'rejected',
      execution_id:null,
      state:'REJECTED',
      before_revision:null,
      after_revision:null,
      evidence:[],
      blocker:{reason:message},
      readback:null,
    },status);
  }
});
