import {createHash} from 'node:crypto';

const TERMINAL=new Set(['DONE','VERIFIED','FAILED','INCONCLUSIVE','SUPERSEDED','REJECTED','RESULT']);
const REQUIRED_ACTIVE_TEST_FIELDS=[
  'roadmap_test_id','question','dataset_and_selection','null','rival','priors','likelihood','covariance',
  'observable','cuts','parameterization','method','decision_rule','success_criteria','kill_criteria','claim_boundary'
];
const SCALAR_FIELDS=['question','dataset_and_selection','null','rival','priors','likelihood','covariance','observable','cuts','parameterization','method','decision_rule','claim_boundary'];
const LIST_FIELDS=['datasets','model_constraints','success_criteria','kill_criteria'];
const PRIORITY={P0:0,CRITICAL:1,HIGH:2,MEDIUM_HIGH:3,MEDIUM:4,NORMAL:5,LOW:6};

const clean=value=>String(value??'').trim().replace(/\s+/g,' ');
const fold=value=>clean(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('und');
const canonList=value=>{
  if(value==null||value==='')return [];
  if(!Array.isArray(value))throw new Error('SCIENTIFIC_LIST_FIELD_MUST_BE_ARRAY');
  return [...new Set(value.map(fold).filter(Boolean))].sort();
};
const canonical=value=>{
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
  return JSON.stringify(value);
};
const present=value=>value!==null&&value!==undefined&&(!(typeof value==='string'||Array.isArray(value))||value.length>0)&&(!(value&&typeof value==='object'&&!Array.isArray(value))||Object.keys(value).length>0);
const normalizePath=value=>String(value||'').replace(/^TOWER_V\d+\//,'').replace(/^\/+/,'');

export function scientificFingerprintV2(spec={}){
  const payload=Object.fromEntries(SCALAR_FIELDS.map(field=>[field,fold(spec[field])||null]));
  for(const field of LIST_FIELDS)payload[field]=canonList(spec[field]);
  payload.fingerprint_version=2;
  return 'sha256:'+createHash('sha256').update(canonical(payload)).digest('hex');
}
function specFromTest(roadmapId,item){
  const spec=Object.fromEntries(Object.entries(item).filter(([key])=>!['roadmap_test_id','depends_on','sequence','lane','adaptive'].includes(key)));
  if(!spec.title)spec.title=item.question;
  spec.roadmap_id=roadmapId;
  spec.roadmap_test_id=item.roadmap_test_id;
  return spec;
}
function ids(roadmapId,item){
  const fingerprint=scientificFingerprintV2(specFromTest(roadmapId,item));
  const testId='T-SCI-'+fingerprint.slice(7,27).toUpperCase();
  return {fingerprint,testId,workId:'WORK::'+testId};
}
async function workFor(towerGateway,roadmapId,item){
  const identity=ids(roadmapId,item);
  let work=await towerGateway.readEntity('work',identity.workId);
  if(!work&&typeof towerGateway.readActiveWorkIndex==='function'){
    const index=await towerGateway.readActiveWorkIndex();
    work=(index?.work||[]).find(row=>String(row?.id||row?.work_id||'')===identity.workId)||null;
  }
  return {work,...identity};
}
function validateActive(document){
  if(String(document?.state||'').toUpperCase()!=='ACTIVE')return;
  const missing=['roadmap_id','title','domain','tests','execution_policy','claim_boundary'].filter(field=>!present(document[field]));
  if(missing.length)throw new Error('ACTIVE_ROADMAP_INVALID:'+missing.join(','));
  if(!Array.isArray(document.tests)||!document.tests.length)throw new Error('ACTIVE_ROADMAP_INVALID:tests');
  const seen=new Set();
  for(const [index,item] of document.tests.entries()){
    if(!item||typeof item!=='object'||Array.isArray(item))throw new Error('ACTIVE_ROADMAP_INVALID:test:'+String(index+1));
    const absent=REQUIRED_ACTIVE_TEST_FIELDS.filter(field=>!Object.hasOwn(item,field)||item[field]===null||item[field]===undefined||(typeof item[field]==='string'&&!item[field].trim()));
    if(absent.length)throw new Error('ACTIVE_ROADMAP_TEST_INVALID:'+String(item.roadmap_test_id||index+1)+':'+absent.join(','));
    const id=String(item.roadmap_test_id);
    if(seen.has(id))throw new Error('ACTIVE_ROADMAP_DUPLICATE_TEST:'+id);
    seen.add(id);
  }
  for(const item of document.tests)for(const dep of item.depends_on||[])if(!seen.has(String(dep)))throw new Error('ACTIVE_ROADMAP_UNKNOWN_DEPENDENCY:'+String(dep));
}

export function createRoadmapSurface({towerGateway}={}){
  if(!towerGateway)throw new Error('TOWER_GATEWAY_REQUIRED');
  async function index(){
    const control=await towerGateway.readControl();
    const path=normalizePath(control?.scientific_roadmap_index||'indexes/active-roadmaps.json');
    const value=await towerGateway.readJson(path);
    return value&&typeof value==='object'?value:{items:[]};
  }
  async function getRoadmaps(){
    const raw=await index();
    const items=(raw.items||[]).filter(x=>x&&typeof x==='object'&&!Array.isArray(x)).map(x=>({...x}));
    return {contract:raw.contract||'SCIENTIFIC_ROADMAP_INDEX_V1',authority:'TOWER_V06',items,count:items.length};
  }
  async function getRoadmap(roadmapId){
    const id=clean(roadmapId);
    if(!id)throw new Error('ROADMAP_ID_REQUIRED');
    const registry=await getRoadmaps();
    const entry=registry.items.find(item=>String(item.roadmap_id||'')===id);
    if(!entry)throw new Error('ROADMAP_NOT_FOUND');
    const path=normalizePath(entry.relative_path||entry.canonical_path);
    if(!path||!path.startsWith('roadmaps/'))throw new Error('ROADMAP_PATH_INVALID');
    const document=await towerGateway.readJson(path);
    if(!document)throw new Error('ROADMAP_NOT_FOUND');
    if(String(document.roadmap_id||'')!==id)throw new Error('ROADMAP_IDENTITY_MISMATCH');
    validateActive(document);
    return {entry:{...entry},roadmap:structuredClone(document)};
  }
  async function getNextRoadmapTest(roadmapId=null){
    const selected=[];
    if(roadmapId)selected.push(await getRoadmap(roadmapId));
    else{
      const registry=await getRoadmaps();
      for(const item of registry.items){
        if(String(item.state||'').toUpperCase()==='ACTIVE')selected.push(await getRoadmap(String(item.roadmap_id)));
      }
    }
    if(!selected.length)return {state:'NO_ACTIVE_ROADMAP',roadmap_id:null,next:null};
    selected.sort((a,b)=>(PRIORITY[String(a.entry.priority||'NORMAL').toUpperCase()]??9)-(PRIORITY[String(b.entry.priority||'NORMAL').toUpperCase()]??9)||String(a.entry.roadmap_id).localeCompare(String(b.entry.roadmap_id)));
    const waiting=[];
    for(const resolved of selected){
      const roadmap=resolved.roadmap,rid=String(roadmap.roadmap_id);
      if(String(roadmap.state||'').toUpperCase()!=='ACTIVE')continue;
      const tests=roadmap.tests.map(item=>({...item})).sort((a,b)=>(PRIORITY[String(a.priority||'NORMAL').toUpperCase()]??9)-(PRIORITY[String(b.priority||'NORMAL').toUpperCase()]??9)||(Number(a.sequence)||1e9)-(Number(b.sequence)||1e9)||String(a.roadmap_test_id).localeCompare(String(b.roadmap_test_id)));
      const byId=new Map(tests.map(item=>[String(item.roadmap_test_id),item]));
      const terminalIds=new Set();
      const observed=new Map();
      for(const item of tests){
        const x=await workFor(towerGateway,rid,item);observed.set(String(item.roadmap_test_id),x);
        if(x.work&&TERMINAL.has(String(x.work.status||'').toUpperCase()))terminalIds.add(String(item.roadmap_test_id));
      }
      if(terminalIds.size===tests.length)continue;
      for(const item of tests){
        const ref=String(item.roadmap_test_id);if(terminalIds.has(ref))continue;
        const deps=(item.depends_on||[]).map(String),unresolved=deps.filter(dep=>!terminalIds.has(dep));
        const x=observed.get(ref),status=String(x.work?.status||'').toUpperCase();
        if(x.work&&!unresolved.length&&!TERMINAL.has(status)){
          const state=status==='WAIT_DEPENDENCY'?'RECONCILE_EXISTING':['RUNNING','CHECKPOINTED','READY'].includes(status)?'CONTINUE_EXISTING':'RECOVER_EXISTING';
          return {state,roadmap_id:rid,roadmap_test_id:ref,canonical_test_id:x.testId,work_id:x.workId,work_status:status,fingerprint:x.fingerprint,test:item,progress:{terminal:terminalIds.size,total:tests.length}};
        }
      }
      for(const item of tests){
        const ref=String(item.roadmap_test_id);if(terminalIds.has(ref))continue;
        const deps=(item.depends_on||[]).map(String),unresolved=deps.filter(dep=>!terminalIds.has(dep));
        const x=observed.get(ref),status=String(x.work?.status||'').toUpperCase();
        if(!x.work&&!unresolved.length)return {state:'READY_TO_MATERIALIZE',roadmap_id:rid,roadmap_test_id:ref,canonical_test_id:x.testId,work_id:x.workId,fingerprint:x.fingerprint,test:item,progress:{terminal:terminalIds.size,total:tests.length}};
        if(unresolved.length)waiting.push({roadmap_id:rid,roadmap_test_id:ref,work_id:x.work?x.workId:null,work_status:status||null,waiting_on:unresolved});
        else if(x.work&&!TERMINAL.has(status))return {state:'RECOVER_EXISTING',roadmap_id:rid,roadmap_test_id:ref,canonical_test_id:x.testId,work_id:x.workId,work_status:status||'UNKNOWN',fingerprint:x.fingerprint,test:item,progress:{terminal:terminalIds.size,total:tests.length}};
      }
    }
    if(waiting.length)return {state:'WAIT_DEPENDENCY',roadmap_id:null,next:null,waiting,rule:'WAIT_ONLY_AFFECTED_CHAIN; CONTINUE_OTHER_NON_ROADMAP_LANES'};
    return {state:'COMPLETE',roadmap_id:null,next:null};
  }
  async function materializationPayload({roadmap_id,roadmap_test_id,correlation_id,execute=true,data_bounded=false}={}){
    const rid=clean(roadmap_id),testRef=clean(roadmap_test_id),corr=clean(correlation_id);
    if(!rid)throw new Error('ROADMAP_ID_REQUIRED');
    if(!testRef)throw new Error('ROADMAP_TEST_ID_REQUIRED');
    if(!corr)throw new Error('CORRELATION_ID_REQUIRED');
    const resolved=await getRoadmap(rid),document=resolved.roadmap;
    if(String(document.state||'').toUpperCase()!=='ACTIVE')throw new Error('ROADMAP_NOT_ACTIVE');
    const match=(document.tests||[]).find(item=>String(item?.roadmap_test_id||'')===testRef);
    if(!match)throw new Error('ROADMAP_TEST_NOT_FOUND');
    const byId=new Map((document.tests||[]).map(item=>[String(item.roadmap_test_id),item]));
    const terminalDependencies=[],unresolvedDependencies=[];
    for(const dep of (match.depends_on||[]).map(String)){
      const depItem=byId.get(dep);
      if(!depItem){unresolvedDependencies.push(dep);continue;}
      const x=await workFor(towerGateway,rid,depItem);
      if(x.work&&TERMINAL.has(String(x.work.status||'').toUpperCase()))terminalDependencies.push(dep);
      else unresolvedDependencies.push(dep);
    }
    if(unresolvedDependencies.length)throw new Error('ROADMAP_DEPENDENCY_PENDING:'+unresolvedDependencies.join(','));
    const spec=specFromTest(rid,match);
    spec.roadmap_ref=resolved.entry.canonical_path||resolved.entry.relative_path||null;
    return {
      correlation_id:corr,
      execute:Boolean(execute),
      data_bounded:Boolean(data_bounded),
      tests:[spec],
      roadmap:{roadmap_id:rid,roadmap_test_id:testRef,canonical_path:resolved.entry.canonical_path||null,terminal_dependencies:terminalDependencies}
    };
  }
  return {getRoadmaps,getRoadmap,getNextRoadmapTest,materializationPayload};
}
