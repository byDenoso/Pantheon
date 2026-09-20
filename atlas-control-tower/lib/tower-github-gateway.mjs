const API='https://api.github.com';
const TOWER_REPO='byDenoso/NEXO-Obsidian-Vault';
const TOWER_REF='main';
const DISPATCH_REPO='byDenoso/TCC';
const DISPATCH_REF='nexo/dispatch-runtime';
const DEFAULT_RECEIPT_ATTEMPTS=28;
const DEFAULT_RECEIPT_DELAY_MS=500;
const MAINTENANCE_REPO='byDenoso/Pantheon';
const MAINTENANCE_BASE_REF='main';
const BRANCH_CLEANUP_PREFIXES=['atlas-','feat/atlas-','chatgpt/nexo-','claude/nexo-','backup/nexo-one-','feat/nexo-atlas-'];
const FROZEN_CAPABILITIES={cosmology_benchmark_v1:{capability_id:'cosmology_benchmark_v1',task_id:'cosmology_benchmark',repository:'byDenoso/TCC',source_revision:'a9949e036220da7ab369a77aaa01b27e90149832',runtime_requirement:'MCMC',required_outputs:['benchmark_result.json'],timeout_minutes:15,seed:20260915}};

export function selectGitHubToken(env=process.env){return env?.NEXO_TOWER_GITHUB_TOKEN||env?.NEXO_GITHUB_TOKEN||env?.GITHUB_TOKEN||env?.GH_TOKEN||null;}
function encodePath(path){return String(path).split('/').map(encodeURIComponent).join('/');}
function b64(value){return Buffer.from(String(value),'utf8').toString('base64');}
function fromB64(value){return Buffer.from(String(value),'base64').toString('utf8');}
function sleepDefault(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
function safeJson(text,label='JSON'){try{return JSON.parse(text);}catch{throw new Error(`${label}_INVALID_JSON`);}}
function requestHeaders(token,hasBody=false){return {Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',...(token?{Authorization:`Bearer ${token}`}:{ }),...(hasBody?{'Content-Type':'application/json'}:{})};}
function exactEntityIdFromFingerprint(fingerprint){const hex=String(fingerprint||'').replace(/^sha256:/,'');if(!/^[0-9a-f]{64}$/i.test(hex))throw new Error('INVALID_SCIENTIFIC_FINGERPRINT');return `T-CHAT-${hex.slice(0,12).toUpperCase()}`;}
async function githubFetch(fetchImpl,token,url,init={}){const response=await fetchImpl(url,{...init,headers:{...requestHeaders(token,Boolean(init.body)),...(init.headers||{})}});let payload=null;const raw=await response.text();if(raw)payload=safeJson(raw,'GITHUB_RESPONSE');return {response,payload};}
async function readContent({fetchImpl,token,repo,path,ref}){const url=`${API}/repos/${repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`;const {response,payload}=await githubFetch(fetchImpl,token,url);if(response.status===404)return null;if(!response.ok)throw new Error(`GITHUB_READ_FAILED:${response.status}:${payload?.message||'UNKNOWN'}`);if(!payload||payload.encoding!=='base64'||typeof payload.content!=='string')throw new Error('GITHUB_CONTENT_INVALID');const text=fromB64(payload.content);return {sha:payload.sha,text,json:safeJson(text,'GITHUB_CONTENT')};}
async function listJsonDirectoryContents({fetchImpl,token,repo,path,ref}){const url=`${API}/repos/${repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`;const {response,payload}=await githubFetch(fetchImpl,token,url);if(response.status===404)return [];if(!response.ok)throw new Error(`GITHUB_READ_FAILED:${response.status}:${payload?.message||'UNKNOWN'}`);if(!Array.isArray(payload))throw new Error('GITHUB_DIRECTORY_INVALID');const files=payload.filter(item=>item?.type==='file'&&String(item?.name||'').endsWith('.json')).sort((a,b)=>String(a.path||'').localeCompare(String(b.path||'')));const values=[];for(const item of files){const file=await readContent({fetchImpl,token,repo,path:String(item.path),ref});if(file?.json&&typeof file.json==='object'&&!Array.isArray(file.json))values.push(file.json);}return values;}
async function createContent({fetchImpl,token,repo,path,ref,message,json}){if(!token)throw new Error('GITHUB_WRITE_NOT_CONFIGURED');const existing=await readContent({fetchImpl,token,repo,path,ref});const text=JSON.stringify(json,null,2)+'\n';if(existing){if(JSON.stringify(existing.json)===JSON.stringify(json))return {idempotent:true,sha:existing.sha,commit_sha:null,path};throw new Error(`GITHUB_CONTENT_CONFLICT:${path}`);}const url=`${API}/repos/${repo}/contents/${encodePath(path)}`;const {response,payload}=await githubFetch(fetchImpl,token,url,{method:'PUT',body:JSON.stringify({message,content:b64(text),branch:ref})});if(!response.ok)throw new Error(`GITHUB_WRITE_FAILED:${response.status}:${payload?.message||'UNKNOWN'}`);return {idempotent:false,sha:payload?.content?.sha||null,commit_sha:payload?.commit?.sha||null,path};}

export function resolveFrozenCapability(spec,env=process.env){const requested=String(spec?.execution_capability||'').trim();if(!requested)return null;const builtIn=FROZEN_CAPABILITIES[requested];if(builtIn)return {...builtIn,required_outputs:[...builtIn.required_outputs]};const raw=env?.NEXO_SCIENCE_CAPABILITIES_JSON;if(!raw)return null;let registry;try{registry=JSON.parse(raw);}catch{return null;}const candidate=registry?.[requested];if(!candidate||candidate.task_id!=='cosmology_benchmark'||candidate.repository!=='byDenoso/TCC')return null;if(!/^[0-9a-f]{40}$/i.test(String(candidate.source_revision||'')))return null;if(!Array.isArray(candidate.required_outputs)||!candidate.required_outputs.every(item=>typeof item==='string'&&item))return null;return {capability_id:requested,task_id:'cosmology_benchmark',repository:'byDenoso/TCC',source_revision:candidate.source_revision,runtime_requirement:String(candidate.runtime_requirement||'MCMC'),required_outputs:[...candidate.required_outputs],timeout_minutes:Number(candidate.timeout_minutes||15),seed:candidate.seed??20260915};}
export function buildDispatchPayload({testId,correlationId,spec,capability,attempt=1}){if(!capability)throw new Error('EXECUTION_CAPABILITY_REQUIRED');return {work_id:testId,correlation_id:correlationId,domain:'SCIENCE',adapter:'execution',source_revision:capability.source_revision,attempt,args:{runtime_requirement:capability.runtime_requirement,task_id:capability.task_id,repository:capability.repository,required_outputs:[...capability.required_outputs],parameters:{question:String(spec?.question||'')},seed:capability.seed??null,timeout_minutes:Number(capability.timeout_minutes||15),test_id:testId,lane_id:'SCIENCE-MCP',priority:'HIGH',execute:true}};}

export function createTowerGithubGateway({env=process.env,fetchImpl=globalThis.fetch,sleep=sleepDefault,receiptAttempts=DEFAULT_RECEIPT_ATTEMPTS,receiptDelayMs=DEFAULT_RECEIPT_DELAY_MS,towerRepo=TOWER_REPO,towerRef=TOWER_REF,dispatchRepo=DISPATCH_REPO,dispatchRef=DISPATCH_REF}={}){
  if(typeof fetchImpl!=='function')throw new Error('FETCH_REQUIRED');
  const token=selectGitHubToken(env),readTower=path=>readContent({fetchImpl,token,repo:towerRepo,path,ref:towerRef});
  async function readJson(relative){const path=String(relative).startsWith('TOWER_V06/')?String(relative):`TOWER_V06/${String(relative).replace(/^\/+/, '')}`;const file=await readTower(path);return file?.json??null;}
  async function listJsonDirectory(relative){const path=String(relative).startsWith('TOWER_V06/')?String(relative):`TOWER_V06/${String(relative).replace(/^\/+/, '')}`;return listJsonDirectoryContents({fetchImpl,token,repo:towerRepo,path,ref:towerRef});}
  async function requireJson(relative){const value=await readJson(relative);if(value===null)throw new Error(`CANONICAL_READ_MISSING:${relative}`);return value;}
  async function readEntity(kind,id){return readJson(`entities/${String(kind).toLowerCase()}/${id}.json`);}
  async function readReceipt(requestId){return readJson(`mutations/receipts/${requestId}.json`);}
  async function submitTowerMutation(request){if(!token)throw new Error('GITHUB_WRITE_NOT_CONFIGURED');if(!request?.request_id||!request?.entity_name||!request?.entity_kind)throw new Error('INVALID_TOWER_MUTATION');const existingReceipt=await readReceipt(request.request_id);if(existingReceipt)return {request_id:request.request_id,status:'COMPLETE',receipt:existingReceipt};const inbox=`TOWER_V06/mutations/inbox/${request.request_id}.json`;await createContent({fetchImpl,token,repo:towerRepo,path:inbox,ref:towerRef,message:`nexo(mcp): submit ${request.entity_name}`,json:request});for(let attempt=0;attempt<receiptAttempts;attempt+=1){const receipt=await readReceipt(request.request_id);if(receipt)return {request_id:request.request_id,status:'COMPLETE',receipt};if(attempt+1<receiptAttempts)await sleep(receiptDelayMs);}throw new Error('TOWER_MUTATION_RECEIPT_TIMEOUT');}
  async function dispatchRuntime({trigger_id,run_id,work_id,capability_id,data_bounded=false}){if(!token)throw new Error('GITHUB_WRITE_NOT_CONFIGURED');for(const [key,value] of Object.entries({trigger_id,run_id,work_id,capability_id}))if(!String(value||'').trim())throw new Error(`${key.toUpperCase()}_REQUIRED`);const launch={schema_version:'1.0.0',event_type:'RUNTIME_LAUNCH_REQUESTED',trigger_id,run_id,work_id,capability_id,data_bounded:Boolean(data_bounded)};const path=`TOWER_V06/runtime/launch/inbox/${run_id}.json`;const existing=await readTower(path);if(existing){const actual=existing.json||{},expected={trigger_id,run_id,work_id,capability_id,data_bounded:Boolean(data_bounded)};if(Object.keys(expected).some(key=>actual[key]!==expected[key]))throw new Error(`RUNTIME_LAUNCH_CONFLICT:${run_id}`);return {status:'ACCEPTED',dispatch_mode:'LAUNCH_EVENT',ref:towerRef,trigger_id,run_id,work_id,capability_id,already_enqueued:true,launch_commit:null};}const write=await createContent({fetchImpl,token,repo:towerRepo,path,ref:towerRef,message:`nexo(mcp): launch ${run_id}`,json:launch});return {status:'ACCEPTED',dispatch_mode:'LAUNCH_EVENT',ref:towerRef,trigger_id,run_id,work_id,capability_id,already_enqueued:Boolean(write.idempotent),launch_commit:write.commit_sha||null};}

  async function cleanupMergedBranches({repo=MAINTENANCE_REPO,baseRef=MAINTENANCE_BASE_REF,minAgeHours=72,dryRun=false}={}){
    if(!token)throw new Error('GITHUB_WRITE_NOT_CONFIGURED');
    if(repo!==MAINTENANCE_REPO)throw new Error('REPOSITORY_CLEANUP_SCOPE_FORBIDDEN');
    if(baseRef!==MAINTENANCE_BASE_REF)throw new Error('BASE_REF_CLEANUP_SCOPE_FORBIDDEN');
    const ageHours=Number(minAgeHours);
    if(!Number.isFinite(ageHours)||ageHours<24)throw new Error('MIN_AGE_HOURS_INVALID');
    const cutoff=Date.now()-ageHours*60*60*1000;
    const branches=[];
    for(let page=1;page<=10;page+=1){
      const {response,payload}=await githubFetch(fetchImpl,token,`${API}/repos/${repo}/branches?per_page=100&page=${page}`);
      if(!response.ok)throw new Error(`GITHUB_BRANCH_LIST_FAILED:${response.status}:${payload?.message||'UNKNOWN'}`);
      const batch=Array.isArray(payload)?payload:[];
      branches.push(...batch);
      if(batch.length<100)break;
    }
    const deleted=[],kept=[];
    for(const item of branches){
      const branch=String(item?.name||'');
      if(!branch||branch===baseRef||!BRANCH_CLEANUP_PREFIXES.some(prefix=>branch.startsWith(prefix)))continue;
      const sha=String(item?.commit?.sha||'');
      if(!sha){kept.push({branch,reason:'MISSING_SHA'});continue;}
      const commitRead=await githubFetch(fetchImpl,token,`${API}/repos/${repo}/commits/${sha}`);
      if(!commitRead.response.ok){kept.push({branch,reason:'COMMIT_READ_FAILED'});continue;}
      const committedAt=Date.parse(commitRead.payload?.commit?.committer?.date||commitRead.payload?.commit?.author?.date||'');
      if(!Number.isFinite(committedAt)||committedAt>cutoff){kept.push({branch,reason:'RECENT_OR_UNKNOWN_AGE'});continue;}
      const compare=await githubFetch(fetchImpl,token,`${API}/repos/${repo}/compare/${encodeURIComponent(branch)}...${encodeURIComponent(baseRef)}`);
      if(!compare.response.ok){kept.push({branch,reason:'COMPARE_FAILED'});continue;}
      if(Number(compare.payload?.behind_by||0)!==0){kept.push({branch,reason:'UNMERGED_COMMITS'});continue;}
      if(dryRun){deleted.push({branch,sha,dry_run:true});continue;}
      const del=await githubFetch(fetchImpl,token,`${API}/repos/${repo}/git/refs/heads/${encodePath(branch)}`,{method:'DELETE'});
      if(!del.response.ok&&del.response.status!==204){kept.push({branch,reason:`DELETE_FAILED_${del.response.status}`});continue;}
      deleted.push({branch,sha});
    }
    return {repository:repo,base_ref:baseRef,min_age_hours:ageHours,dry_run:Boolean(dryRun),deleted,kept,policy:'DELETE_ONLY_MERGED_STALE_MATCHING_BRANCHES'};
  }

  return {
    configured:{towerWrite:Boolean(token),towerRepo,towerRef,dispatchRepo,dispatchRef},
    readJson,
    listJsonDirectory,
    readControl:()=>requireJson('CONTROL.json'),
    readEntity,
    readActiveWorkIndex:()=>requireJson('indexes/active-work.json'),
    readRoleView:role=>requireJson(`bootstrap/${String(role).toLowerCase()}.json`),
    readReceipt,
    readCapabilityManifest:()=>requireJson('manifests/capabilities.json'),
    readRuntimeReport:runId=>readJson(`runtime/reports/${runId}.json`),
    readEvidence:evidenceId=>readJson(`runtime/evidence/${evidenceId}.json`),
    readCampaignIndex:()=>requireJson('indexes/campaigns.json'),
    readInterdomainIndex:()=>requireJson('indexes/interdomain-active.json'),
    submitTowerMutation,
    dispatchRuntime,
    cleanupMergedBranches,
    async findByFingerprint(fingerprint,{testId}={}){const id=testId||exactEntityIdFromFingerprint(fingerprint),entity=await readEntity('test',id);if(!entity)return null;if(entity.scientific_fingerprint&&entity.scientific_fingerprint!==fingerprint)return null;return entity;},
    async persistTest(request){const result=await submitTowerMutation({...request,entity_kind:request.entity_kind||'test'});return result.receipt;},
    async readbackTest(testId){const entity=await readEntity('test',testId);if(!entity)throw new Error('TOWER_TEST_READBACK_MISSING');return entity;},
    async resolveCapability(spec){return resolveFrozenCapability(spec,env);},
    async dispatchTest({testId,correlationId,spec,capability}){if(!token)throw new Error('GITHUB_WRITE_NOT_CONFIGURED');const attempt=1,payload=buildDispatchPayload({testId,correlationId,spec,capability,attempt}),path=`nexo_dispatch/requests/${testId}-A${attempt}.json`;const write=await createContent({fetchImpl,token,repo:dispatchRepo,path,ref:dispatchRef,message:`nexo(mcp): dispatch ${testId}`,json:payload});return write.commit_sha?`github:commit:${write.commit_sha}`:`github:request:${path}`;},
  };
}

export const _internal={readContent,listJsonDirectoryContents,createContent,exactEntityIdFromFingerprint,FROZEN_CAPABILITIES};
