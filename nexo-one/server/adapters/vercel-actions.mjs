import {ActionError} from '../execution/contracts.mjs';

const enc=encodeURIComponent;
function credentials(env,write=false){
  const project=String(env.VERCEL_PROJECT_ID||'').trim(),team=String(env.VERCEL_TEAM_ID||'').trim();
  const token=String(write?env.VERCEL_WRITE_TOKEN:env.VERCEL_READ_TOKEN||'').trim();
  if(!project||!token)throw new ActionError('AUTH_REQUIRED');
  return {project,team,token,name:String(env.VERCEL_PROJECT_NAME||'nexo-one').trim()||'nexo-one'};
}
function ensureProject(target,project){const value=String(target||'').trim();if(value&&value!==project)throw new ActionError('AUTHORITY_CONFLICT');}

export async function vercelActionRequest(url,{token,signal,method='GET',body}={},fetcher=fetch){
  if(!token)throw new ActionError('AUTH_REQUIRED');
  const response=await fetcher(url,{method,signal,redirect:'error',headers:{Accept:'application/json',Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},body});
  if(response?.ok){if(response.status===204||response.status===201&&!response.headers?.get?.('content-type')?.includes('json'))return {};return response.json().catch?.(()=>({}))??{};}
  const status=Number(response?.status)||0;
  if(status===401)throw new ActionError('AUTH_REQUIRED');
  if(status===403)throw new ActionError('SCOPE_REQUIRED');
  if(status===409||status===410||status===400)throw new ActionError('PROVIDER_REJECTED');
  if(status===429)throw new ActionError('RATE_LIMITED');
  throw new ActionError('PROVIDER_UNAVAILABLE');
}
const defaultRequester=(url,options)=>vercelActionRequest(url,options);
const qs=team=>team?`?teamId=${enc(team)}`:'';

export async function executeVercel(action,{env=process.env,signal,requester=defaultRequester}={}){
  const {project,team,token,name}=credentials(env,true);ensureProject(action.target_ref,project);
  const p=action.requested_payload||{},type=action.action_type;let data={},effectId='',expected={source_revision:String(p.source_revision||'').trim()||null},source_ref='';
  if(type==='vercel.deploy'){
    const deploymentId=String(p.deployment_id||'').trim(),gitSource=p.gitSource;
    if(!deploymentId&&!gitSource)throw new ActionError('TARGET_AMBIGUOUS');
    const body={name,project,...(deploymentId?{deploymentId}:{gitSource}),target:p.target==='production'?'production':undefined};
    data=await requester(`https://api.vercel.com/v13/deployments${qs(team)}`,{token,signal,method:'POST',body:JSON.stringify(body)});effectId=data.id||data.uid;source_ref=data.url?`https://${data.url}`:`https://vercel.com/${team||'dashboard'}/${name}/${effectId}`;expected.target=body.target||data.target||null;
  }else if(type==='vercel.promote'){
    const deploymentId=String(p.deployment_id||'').trim();if(!deploymentId)throw new ActionError('TARGET_AMBIGUOUS');
    await requester(`https://api.vercel.com/v10/projects/${enc(project)}/promote/${enc(deploymentId)}${qs(team)}`,{token,signal,method:'POST'});effectId=deploymentId;source_ref=`https://vercel.com/${team||'dashboard'}/${name}/${deploymentId}`;expected.target='production';
  }else throw new ActionError('CAPABILITY_BLOCKED');
  if(!effectId)throw new ActionError('PROVIDER_REJECTED');
  return {effect_id:effectId,source_ref,classification:'ACK',expected,target_ref:project,action_type:type,before_revision:p.before_revision||null};
}

function deploymentRevision(data){return data?.meta?.githubCommitSha||data?.gitSource?.sha||data?.gitMetadata?.commitSha||data?.source?.sha||null;}
export async function readbackVercel(receipt,{env=process.env,signal,requester=defaultRequester}={}){
  const {project,team,token,name}=credentials(env,false),id=String(receipt.provider_effect_id||receipt.effect_id||'').trim();if(!id)throw new ActionError('READBACK_TIMEOUT');
  const data=await requester(`https://api.vercel.com/v13/deployments/${enc(id)}${qs(team)}`,{token,signal});
  if(data.projectId&&data.projectId!==project)throw new ActionError('AUTHORITY_CONFLICT');
  const state=String(data.readyState||data.state||'').toUpperCase(),revision=deploymentRevision(data),expectedRevision=receipt.expected?.source_revision||null,source_ref=data.url?`https://${data.url}`:receipt.source_ref||`https://vercel.com/${team||'dashboard'}/${name}/${id}`;
  if(['ERROR','CANCELED','CANCELLED'].includes(state))return {status:'FAILED',readback_status:'MISMATCH',after_revision:revision,source_ref,explanation:`Vercel deployment ended in ${state}.`};
  if(state!=='READY')return {status:'PENDING_READBACK',readback_status:'PENDING',after_revision:revision,source_ref,explanation:`Vercel deployment is ${state||'not terminal'}; readback remains pending.`};
  if(expectedRevision&&revision&&revision!==expectedRevision)return {status:'CONFLICT',readback_status:'MISMATCH',after_revision:revision,source_ref,material:true,explanation:'Production deployment revision differs from the approved source revision.'};
  const expectedTarget=receipt.expected?.target;if(expectedTarget&&data.target&&data.target!==expectedTarget)return {status:'CONFLICT',readback_status:'MISMATCH',after_revision:revision,source_ref,material:true,explanation:'Vercel deployment target differs from the approved target.'};
  return {status:'PASS',readback_status:'MATCH',after_revision:revision||id,source_ref,explanation:'Vercel deployment readback matches the approved effect.'};
}
