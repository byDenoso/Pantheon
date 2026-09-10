import {ActionError} from '../execution/contracts.mjs';

const api='https://api.github.com';
const encodePath=value=>String(value).split('/').map(encodeURIComponent).join('/');
const repoPattern=/^[\w.-]+\/[\w.-]+$/;

function repository(env){
  const repo=String(env.GITHUB_REPOSITORY||'byDenoso/Pantheon').trim();
  if(!repoPattern.test(repo))throw new ActionError('AUTHORITY_CONFLICT');
  return repo;
}
function ensureTargetRepo(target,repo){
  const value=String(target||'').trim();
  const explicit=value.match(/^([\w.-]+\/[\w.-]+)(?:[#:@/].*)?$/)?.[1];
  if(explicit&&explicit!==repo)throw new ActionError('AUTHORITY_CONFLICT');
}
function number(value){const m=String(value||'').match(/(?:issue:|pr:|#)?(\d+)$/);return m?Number(m[1]):null;}

export async function githubActionRequest(url,{token,signal,method='GET',body}={},fetcher=fetch){
  if(!token)throw new ActionError('AUTH_REQUIRED');
  const response=await fetcher(url,{method,signal,redirect:'error',headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${token}`,'X-GitHub-Api-Version':'2022-11-28','User-Agent':'nexo-one',...(body?{'Content-Type':'application/json'}:{})},body});
  if(response?.ok){if(response.status===204)return {};return response.json();}
  const status=Number(response?.status)||0;
  if(status===401)throw new ActionError('AUTH_REQUIRED');
  if(status===403)throw new ActionError(response?.headers?.get?.('x-ratelimit-remaining')==='0'?'RATE_LIMITED':'SCOPE_REQUIRED');
  if(status===409||status===422)throw new ActionError('PROVIDER_REJECTED');
  if(status===429)throw new ActionError('RATE_LIMITED');
  if(status>=400&&status<500)throw new ActionError('PROVIDER_REJECTED');
  throw new ActionError('PROVIDER_UNAVAILABLE');
}
const defaultRequester=(url,options)=>githubActionRequest(url,options);

export async function executeGitHub(action,{env=process.env,signal,requester=defaultRequester}={}){
  const repo=repository(env),token=env.GITHUB_TOKEN;ensureTargetRepo(action.target_ref,repo);
  if(!token)throw new ActionError('AUTH_REQUIRED');
  const p=action.requested_payload||{},type=action.action_type,base=`${api}/repos/${repo}`;
  let data,effectId,expected={},source_ref;
  if(type==='github.issue.create'){
    if(!String(p.title||'').trim())throw new ActionError('TARGET_AMBIGUOUS');
    data=await requester(`${base}/issues`,{token,signal,method:'POST',body:JSON.stringify({title:String(p.title).trim(),body:String(p.body||''),...(Array.isArray(p.labels)?{labels:p.labels}:{})})});effectId=`issue:${data.number}`;expected={title:String(p.title).trim()};source_ref=data.html_url;
  }else if(type==='github.issue.update'){
    const n=number(p.issue_number||action.target_ref);if(!n)throw new ActionError('TARGET_AMBIGUOUS');
    const patch={};for(const key of ['title','body','state'])if(p[key]!==undefined)patch[key]=p[key];if(Array.isArray(p.labels))patch.labels=p.labels;if(!Object.keys(patch).length)throw new ActionError('TARGET_AMBIGUOUS');
    data=await requester(`${base}/issues/${n}`,{token,signal,method:'PATCH',body:JSON.stringify(patch)});effectId=`issue:${n}`;expected=patch;source_ref=data.html_url;
  }else if(type==='github.pr.create'){
    for(const key of ['title','head','base'])if(!String(p[key]||'').trim())throw new ActionError('TARGET_AMBIGUOUS');
    const body={title:String(p.title).trim(),head:String(p.head).trim(),base:String(p.base).trim(),body:String(p.body||''),draft:!!p.draft};
    data=await requester(`${base}/pulls`,{token,signal,method:'POST',body:JSON.stringify(body)});effectId=`pr:${data.number}`;expected={title:body.title,head:body.head,base:body.base};source_ref=data.html_url;
  }else if(type==='github.branch.create'){
    const branch=String(p.branch||'').trim(),sha=String(p.sha||'').trim();if(!branch||!sha||branch.startsWith('refs/'))throw new ActionError('TARGET_AMBIGUOUS');
    data=await requester(`${base}/git/refs`,{token,signal,method:'POST',body:JSON.stringify({ref:`refs/heads/${branch}`,sha})});effectId=`branch:${branch}`;expected={branch,sha};source_ref=`https://github.com/${repo}/tree/${encodeURIComponent(branch)}`;
  }else if(type==='github.commit.create'){
    const path=String(p.path||'').trim(),message=String(p.message||'').trim(),content=String(p.content??'');if(!path||!message)throw new ActionError('TARGET_AMBIGUOUS');
    const body={message,content:Buffer.from(content,'utf8').toString('base64'),...(p.branch?{branch:String(p.branch)}:{}),...(p.sha?{sha:String(p.sha)}:{})};
    data=await requester(`${base}/contents/${encodePath(path)}`,{token,signal,method:'PUT',body:JSON.stringify(body)});if(!data.commit?.sha)throw new ActionError('PROVIDER_REJECTED');effectId=`commit:${data.commit.sha}`;expected={sha:data.commit.sha,path};source_ref=data.content?.html_url||`https://github.com/${repo}/commit/${data.commit.sha}`;
  }else if(type==='github.merge'){
    const n=number(p.pull_number||action.target_ref);if(!n)throw new ActionError('TARGET_AMBIGUOUS');
    const body={...(p.commit_title?{commit_title:String(p.commit_title)}:{}),...(p.merge_method?{merge_method:String(p.merge_method)}:{})};
    data=await requester(`${base}/pulls/${n}/merge`,{token,signal,method:'PUT',body:JSON.stringify(body)});if(!data.merged||!data.sha)throw new ActionError('PROVIDER_REJECTED');effectId=`commit:${data.sha}`;expected={sha:data.sha,merged:true,pull_number:n};source_ref=`https://github.com/${repo}/commit/${data.sha}`;
  }else throw new ActionError('CAPABILITY_BLOCKED');
  if(!effectId)throw new ActionError('PROVIDER_REJECTED');
  return {effect_id:effectId,source_ref,classification:'ACK',expected,target_ref:action.target_ref,action_type:type,before_revision:p.before_revision||null};
}

function subset(actual,expected){for(const [key,value] of Object.entries(expected||{})){if(['head','base','path','pull_number','merged'].includes(key))continue;if(value!==undefined&&actual?.[key]!==value)return false;}return true;}

export async function readbackGitHub(receipt,{env=process.env,signal,requester=defaultRequester}={}){
  const repo=repository(env),token=env.GITHUB_TOKEN;if(!token)throw new ActionError('AUTH_REQUIRED');
  const id=String(receipt.provider_effect_id||receipt.effect_id||''),base=`${api}/repos/${repo}`;let data,match=false,revision=null,source_ref=receipt.source_ref;
  if(id.startsWith('issue:')){
    const n=number(id);data=await requester(`${base}/issues/${n}`,{token,signal});match=subset(data,receipt.expected);revision=data.updated_at||String(data.id);source_ref=data.html_url||source_ref;
  }else if(id.startsWith('pr:')){
    const n=number(id);data=await requester(`${base}/pulls/${n}`,{token,signal});const expected=receipt.expected||{};match=(!expected.title||data.title===expected.title)&&(!expected.head||data.head?.ref===expected.head)&&(!expected.base||data.base?.ref===expected.base);revision=data.updated_at||data.head?.sha;source_ref=data.html_url||source_ref;
  }else if(id.startsWith('branch:')){
    const branch=id.slice(7);data=await requester(`${base}/git/ref/heads/${encodePath(branch)}`,{token,signal});match=!receipt.expected?.sha||data.object?.sha===receipt.expected.sha;revision=data.object?.sha;source_ref=source_ref||`https://github.com/${repo}/tree/${encodeURIComponent(branch)}`;
  }else if(id.startsWith('commit:')){
    const sha=id.slice(7);data=await requester(`${base}/commits/${encodeURIComponent(sha)}`,{token,signal});match=data.sha===sha&&(!receipt.expected?.sha||data.sha===receipt.expected.sha);revision=data.sha;source_ref=data.html_url||source_ref;
  }else throw new ActionError('READBACK_TIMEOUT');
  return match?{status:'PASS',readback_status:'MATCH',after_revision:revision,source_ref,explanation:'GitHub readback matches the approved effect.'}:{status:'FAILED',readback_status:'MISMATCH',after_revision:revision,source_ref,explanation:'GitHub readback does not match the approved effect.'};
}
