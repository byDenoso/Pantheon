// Authenticated role facade; the existing Writer owns canonical mutations.
import {createHash} from 'node:crypto';
export const ROLE_NAMES=Object.freeze({EXECUTOR:'Executor',ENGENHEIRO:'Engenheiro',CIENTISTA:'Cientista',CRITICO:'Cr\u00edtico'});
export const ROLE_PROMPTS=Object.freeze(Object.fromEntries(Object.entries(ROLE_NAMES).map(([role,name])=>[
  role,`Voc\u00ea \u00e9 o ${name} do NEXO. Consulte o MCP para obter seu trabalho e as a\u00e7\u00f5es dispon\u00edveis; execute e registre o resultado.`
])));
export const MUTATIONS=Object.freeze(['claim_work','prepare_package','validate_package','request_execution','register_delivery']);
export const SCIENTIFIC_MUTATION='request_scientific_execution';
export const OPERATIONAL_TOOL_NAMES=Object.freeze(['get_role_session','get_role_capabilities','get_work','get_scientific_queue',SCIENTIFIC_MUTATION,...MUTATIONS,'get_result']);
const TOOL_MUTATIONS=new Set([...MUTATIONS,SCIENTIFIC_MUTATION]);
const SCIENCE_OWNER_ROLES=Object.freeze({
  EXECUTOR:Object.freeze(['EXECUTOR']),
  ENGENHEIRO:Object.freeze(['ADVISOR','ENGINEER','ENGENHEER','ENGENHEIRO']),
  CIENTISTA:Object.freeze(['LEARNER']),
  CRITICO:Object.freeze(['REFEREE1','REFEREE2','REFEREE_1','REFEREE_2'])
});
const ID=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const INTENT_ID=/^op-[a-f0-9]{48}$/;
const TERMINAL_INTENT_DISPOSITIONS=new Set(['BLOCKED','STALE_VERSION']);
// Closed work remains addressable by test ID, but must not consume active queue pages.
const TERMINAL_SCIENTIFIC_WORK_STATUSES=new Set(['DONE','REJECTED','ARCHIVED','CANCELLED','CANCELED','RESOLVED']);
const ACTIVE_SCIENTIFIC_ATTEMPT_STATUSES=new Set(['PENDING','RESERVED','QUEUED','DISPATCH_PENDING','DISPATCHED','RUNNING','CHECKPOINTED']);
const compareIds=(left,right)=>left<right?-1:left>right?1:0;
export function canonical(value){
  if(value===null||typeof value!=='object')return JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
}
export const sha256=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:canonical(value)).digest('hex');
const fail=code=>{throw Object.assign(new Error(code),{code});};
const requireValue=(condition,code)=>{if(!condition)fail(code);};
export function sessionFor(work){
  const context={work_id:work.id,role:work.role,scope:work.scope,definition_sha256:work.definition_sha256,
    actions:[...MUTATIONS].sort(),writer_only:true,antigravity_required:false};
  return {contract:'NEXO_ROLE_SESSION_V1',session_id:'drive-operational-control-v1',role:work.role,work_id:work.id,
    mcp_endpoint:'https://nexo-one-two.vercel.app/api/mcp',mcp_tool:'get_role_session',
    prompt_sha256:sha256(ROLE_PROMPTS[work.role]),context_sha256:sha256(context)};
}
function safeWork(work){
  const next={READY:'request_execution',CLAIMED:'request_execution',PREPARED:'request_execution',VALIDATED:'request_execution',
    DISPATCH_PENDING:'get_result',DISPATCH_UNKNOWN:'get_result',RUNNING:'get_result',RESULT_AVAILABLE:'register_delivery',DELIVERY_PENDING:'get_result'};
  const definition=work.definition||{};
  return {next_action:next[work.state]||null,
    task:{description:definition.description||'Calcular soma e media do fixture operacional congelado.',
      recipe:definition.recipe||null,input:definition.input||null,known_control:definition.known_result||null,
      destinations_managed_by:'WRITER',independent_review:definition.review?.status||'NOT_REQUIRED_FOR_OPERATIONAL_CONTROL'},
    id:work.id,role:work.role,state:work.state,scope:work.scope,error:work.error||null,version:work.version,
    package_sha256:work.package?.sha256||null,run_id:work.outbox?.run_id||null,result:work.result?.body?.result||null,receipt:work.receipt||null};
}
const safeReasons=value=>Array.isArray(value)?value.filter(item=>typeof item==='string'&&/^[A-Z][A-Z0-9_]{1,79}$/.test(item)).slice(0,20):[];
function scientificQueue(state,role,principalId,args){
  const owners=SCIENCE_OWNER_ROLES[role]||[];
  const source=state.science&&typeof state.science==='object'?state.science:{};
  // Visibility allows preparation by the recipient; it never transfers ownership.
  const recoveries=(Array.isArray(source.recovery)?source.recovery:[]).filter(item=>
    (owners.includes(String(item.owner_role||'').toUpperCase())||
      owners.includes(String(item.target_role||'').toUpperCase()))&&
    (args.test_id||!TERMINAL_SCIENTIFIC_WORK_STATUSES.has(String(item.status||'').toUpperCase())));
  const recoveryTests=new Set(recoveries.map(item=>item.test_id).filter(Boolean));
  const batteries=Array.isArray(source.batteries)?source.batteries:[];
  const attemptFor=item=>{
    if(!item?.battery_id||!item?.attempt_id)return null;
    const battery=batteries.find(row=>row?.id===item.battery_id);
    const attempt=battery?.tests?.find(row=>row?.test_id===item.id&&row?.attempt_id===item.attempt_id);
    return attempt?{id:battery.id,status:battery.status,attempt_id:attempt.attempt_id}:null;
  };
  const projectTest=item=>({id:item.id,status:item.status,domain:item.domain,priority:item.priority,
    roadmap_id:item.roadmap_id,campaign_id:item.campaign_id,version:item.version,
    readiness:{source:'STORED_TOWER_RECORD',verified:item.readiness?.verified===true,
      recorded_eligible:item.readiness?.verified===true?item.readiness.eligible:null,
      policy:item.readiness?.policy||null,recorded_reasons:safeReasons(item.readiness?.reasons)},
    blocker_reasons:safeReasons(item.blocker_reasons),execution_phase:item.execution_phase,attempt:attemptFor(item)});
  const after={test_id:null,recovery_id:null};
  if(args.cursor){
    let cursor;
    try{cursor=JSON.parse(Buffer.from(args.cursor,'base64url').toString('utf8'));}
    catch{fail('SCIENCE_CURSOR_INVALID');}
    const keys=Object.keys(cursor||{}).sort();
    if(!cursor||keys.join(',')!=='after_recovery_id,after_test_id,contract,principal_id,revision,role'||
        cursor.contract!=='NEXO_SCIENTIFIC_CURSOR_V1'||typeof cursor.revision!=='string'||
        (cursor.after_test_id!==null&&!ID.test(cursor.after_test_id))||
        (cursor.after_recovery_id!==null&&!ID.test(cursor.after_recovery_id)))fail('SCIENCE_CURSOR_INVALID');
    if(cursor.revision!==state.revision)fail('SCIENCE_CURSOR_STALE');
    if(cursor.role!==role||cursor.principal_id!==principalId)fail('SCIENCE_CURSOR_SCOPE_MISMATCH');
    after.test_id=cursor.after_test_id;after.recovery_id=cursor.after_recovery_id;
  }
  const sourceTests=Array.isArray(source.tests)?source.tests:[];
  const tests=sourceTests.filter(item=>{
    const attempt=attemptFor(item);
    if(role==='EXECUTOR'&&attempt&&!ACTIVE_SCIENTIFIC_ATTEMPT_STATUSES.has(String(attempt.status||'').toUpperCase()))return false;
    if(recoveryTests.has(item.id)||owners.includes(String(item.owner_role||'').toUpperCase()))return true;
    // The Executor may discover canonically READY, integrity-attested tests
    // that have not been reserved yet; Writer still decides admission.
    return role==='EXECUTOR'&&((item.status==='READY'&&item.readiness?.verified===true&&item.readiness?.eligible===true)||
      ACTIVE_SCIENTIFIC_ATTEMPT_STATUSES.has(String(attempt?.status||'').toUpperCase()));
  }).map(projectTest).sort((a,b)=>compareIds(a.id,b.id));
  const work=recoveries.map(item=>({id:item.id,kind:item.kind,status:item.status,owner_role:item.owner_role,
    target_role:item.target_role,test_id:item.test_id,roadmap_id:item.roadmap_id,priority:item.priority,
    blocker_reasons:safeReasons(item.blocker_reasons),version:item.version})).sort((a,b)=>compareIds(a.id,b.id));
  if(args.test_id){
    requireValue(!args.cursor,'SCIENCE_CURSOR_WITH_TEST_ID_INVALID');
    const direct=sourceTests.find(item=>item.id===args.test_id);
    const terminalExecutorAttempt=role==='EXECUTOR'&&Boolean(attemptFor(direct));
    const explicitlyVisible=tests.some(item=>item.id===args.test_id)||work.some(item=>item.test_id===args.test_id)||terminalExecutorAttempt;
    requireValue(explicitlyVisible,
      'SCIENCE_WORK_NOT_FOUND_OR_FORBIDDEN');
    const explicitTest=tests.find(item=>item.id===args.test_id)||(terminalExecutorAttempt?projectTest(direct):null);
    return {tests:explicitTest?[explicitTest]:[],recoveries:work.filter(item=>item.test_id===args.test_id),next_cursor:null};
  }
  const limit=args.limit||50;
  const remainingTests=tests.filter(item=>!after.test_id||compareIds(item.id,after.test_id)>0);
  const remainingRecovery=work.filter(item=>!after.recovery_id||compareIds(item.id,after.recovery_id)>0);
  const testPage=remainingTests.slice(0,limit),recoveryPage=remainingRecovery.slice(0,limit);
  const hasMore=remainingTests.length>limit||remainingRecovery.length>limit;
  const next_cursor=hasMore?Buffer.from(JSON.stringify({contract:'NEXO_SCIENTIFIC_CURSOR_V1',revision:state.revision,
    role,principal_id:principalId,after_test_id:testPage.at(-1)?.id||after.test_id,
    after_recovery_id:recoveryPage.at(-1)?.id||after.recovery_id})).toString('base64url'):null;
  return {tests:testPage,recoveries:recoveryPage,total_tests:tests.length,total_recoveries:work.length,next_cursor};
}
function eligibleScientificRequest(state,testId){
  const test=(state.science?.tests||[]).find(item=>item.id===testId);
  if(!test)return {test:null,blocker:'SCIENCE_TEST_NOT_FOUND'};
  const visible=scientificQueue(state,'EXECUTOR','',{test_id:testId}).tests.length>0;
  if(!visible)return {test:null,blocker:'SCIENCE_WORK_NOT_FOUND_OR_FORBIDDEN'};
  const readiness=test.readiness||{},binding=test.execution_binding||{};
  if(test.domain!=='SCIENCE')return {test,blocker:'SCIENCE_DOMAIN_REQUIRED'};
  if(test.status!=='READY')return {test,blocker:'CANONICAL_TEST_NOT_READY'};
  if(readiness.verified!==true||readiness.policy!=='SCIENTIFIC_INTEGRITY_V1'||readiness.eligible!==true||
      safeReasons(readiness.reasons).length)
    return {test,blocker:'CANONICAL_READINESS_NOT_ELIGIBLE'};
  if(!Number.isInteger(test.version)||test.version<0)return {test,blocker:'CANONICAL_TEST_VERSION_MISSING'};
  if(typeof binding.recipe!=='string'||! /^[a-z0-9_]{2,40}$/.test(binding.recipe)||
      !binding.params||typeof binding.params!=='object'||Array.isArray(binding.params))
    return {test,blocker:'FROZEN_EXECUTION_BINDING_MISSING'};
  const linked=test.battery_id&&test.attempt_id&&(state.science?.batteries||[]).find(battery=>battery?.id===test.battery_id&&
    (battery.tests||[]).some(row=>row?.test_id===test.id&&row?.attempt_id===test.attempt_id));
  if(linked&&ACTIVE_SCIENTIFIC_ATTEMPT_STATUSES.has(String(linked.status||'').toUpperCase()))return {test,blocker:'ACTIVE_CANONICAL_ATTEMPT_EXISTS'};
  return {test,blocker:null};
}
function toolsForRole(role,principal,state){
  const tools=['get_role_session','get_role_capabilities','get_work','get_scientific_queue'];
  if(role==='EXECUTOR'&&principal.roles.includes('EXECUTOR'))tools.push(SCIENTIFIC_MUTATION);
  const assignedWork=(state.work||[]).some(work=>work.role===role&&principal.roles.includes(work.role)&&(!work.owner||work.owner===principal.id));
  if(assignedWork)tools.push('get_result',...MUTATIONS);
  return tools;
}
function terminalIntents(work){
  if(!work.processed||typeof work.processed!=='object'||Array.isArray(work.processed))return [];
  return Object.entries(work.processed).filter(([id,receipt])=>INTENT_ID.test(id)&&receipt&&typeof receipt==='object'&&
    receipt.intent_id===id&&TERMINAL_INTENT_DISPOSITIONS.has(receipt.disposition)&&
    Number.isInteger(receipt.expected_version)&&Number.isInteger(work.version)&&receipt.expected_version<work.version);
}
function supersessionFor(work,action,principalId){
  const terminal=terminalIntents(work);
  const sameAction=terminal.filter(([,receipt])=>receipt.action===action&&receipt.principal===principalId);
  let candidates=sameAction;
  if(work.state==='BLOCKED'&&!sameAction.length)
    candidates=terminal.filter(([,receipt])=>receipt.disposition==='BLOCKED'&&receipt.principal===principalId);
  candidates.sort((a,b)=>a[1].expected_version-b[1].expected_version||(a[0]<b[0]?-1:a[0]>b[0]?1:0));
  const target=candidates.at(-1)?.[0]||null;
  if(work.state==='BLOCKED'&&terminal.length&&!target)fail('SUPERSESSION_UNAVAILABLE');
  if(work.state!=='BLOCKED'&&sameAction.length&&!target)fail('SUPERSESSION_UNAVAILABLE');
  return {intentId:target,legacyBlocked:work.state==='BLOCKED'&&terminal.length===0};
}
export function createOperationalService({readState,submitIntent,submitScientificRequest}){
  requireValue(typeof readState==='function'&&typeof submitIntent==='function'&&typeof submitScientificRequest==='function','OPERATIONAL_ADAPTERS_REQUIRED');
  return {
    async call(name,args,principal){
      requireValue(principal?.authenticated===true&&Array.isArray(principal.roles)&&/^[0-9a-f]{64}$/.test(principal.id),'AUTHENTICATION_REQUIRED');
      requireValue(OPERATIONAL_TOOL_NAMES.includes(name),'UNKNOWN_OPERATIONAL_TOOL');
      requireValue(args&&typeof args==='object'&&!Array.isArray(args),'INPUT_INVALID');
      const expected=name==='get_scientific_queue'?['role','test_id','limit','cursor']:
        name===SCIENTIFIC_MUTATION?['test_id']:
        ['get_role_session','get_role_capabilities','get_work'].includes(name)?['role']:['work_id'];
      requireValue(Object.keys(args).every(key=>expected.includes(key))&&
        (name==='get_scientific_queue'?Object.hasOwn(args,'role'):Object.keys(args).length===1), 'INPUT_FIELDS_INVALID');
      if(name===SCIENTIFIC_MUTATION)requireValue(principal.roles.includes('EXECUTOR'),'ROLE_FORBIDDEN');
      if(args.role)requireValue(Object.hasOwn(ROLE_PROMPTS,args.role)&&principal.roles.includes(args.role),'ROLE_FORBIDDEN');
      if(args.work_id)requireValue(ID.test(args.work_id),'WORK_ID_INVALID');
      if(args.test_id)requireValue(ID.test(args.test_id),'TEST_ID_INVALID');
      if(args.limit!==undefined)requireValue(Number.isInteger(args.limit)&&args.limit>=1&&args.limit<=100,'LIMIT_INVALID');
      if(args.cursor!==undefined)requireValue(typeof args.cursor==='string'&&args.cursor.length<=2048,'SCIENCE_CURSOR_INVALID');
      if(args.cursor&&args.test_id)fail('SCIENCE_CURSOR_WITH_TEST_ID_INVALID');
      const state=await readState();
      requireValue(state.authority==='TOWER_V06@GOOGLE_DRIVE_PRIVATE'&&state.readback==='PASS','CANONICAL_STATE_UNAVAILABLE');
      if(name==='get_role_capabilities')return {role:args.role,principal_id:principal.id,tools:toolsForRole(args.role,principal,state),
        writer:'NEXO Writer robot',execution:'GITHUB_ACTIONS',antigravity_required:false,
        mutation_model:'IMMUTABLE_INTENT_THEN_WRITER_ACK',availability:'CHECK_ON_USE',
        routine_approval_required:false,request_execution_includes:['claim','prepare','validate','dispatch','collect','register'],
        scientific_result_eligible:false,scientific_queue:{tools:['get_scientific_queue',...(args.role==='EXECUTOR'&&principal.roles.includes('EXECUTOR')?[SCIENTIFIC_MUTATION]:[])],
          mode:args.role==='EXECUTOR'&&principal.roles.includes('EXECUTOR')?'READ_AND_QUEUE_REQUEST':'READ_ONLY',
          authority:state.authority,availability:'LIVE_READBACK',revision:state.revision,
          evidence:{kind:'TOWER_LIVE_READBACK',observed_at:state.observed_at||null,readback:state.readback},
          principal_id:principal.id,scope:'ROLE_BOUND_SCIENCE_QUEUE',authorized:true,exercised:false,
          owner_role_binding:SCIENCE_OWNER_ROLES[args.role],dispatch:false,reservation:false,
          criteria_changes:false,readiness:'STORED_TOWER_ATTESTATION_NOT_RECOMPUTED_BY_MCP'}};
      if(name==='get_scientific_queue'){
        const items=scientificQueue(state,args.role,principal.id,args);
        return {contract:'NEXO_SCIENTIFIC_QUEUE_VIEW_V1',role:args.role,principal_id:principal.id,
          scope:'AUTHENTICATED_READ_ONLY_SCIENTIFIC_QUEUE',authority:state.authority,revision:state.revision,
          evidence:{kind:'TOWER_LIVE_READBACK',observed_at:state.observed_at||null,readback:state.readback},
          readiness_semantics:'RECORDED_TOWER_ATTESTATION_ONLY; WRITER REVALIDATES BEFORE RESERVATION',
          capabilities:{announced:['get_scientific_queue'],authorized:true,exercised:true,
            can_reserve:false,can_dispatch:false,can_collect:false,can_change_criteria:false},
          ...items};
      }
      if(name===SCIENTIFIC_MUTATION){
        const {test,blocker}=eligibleScientificRequest(state,args.test_id);
        if(blocker==='SCIENCE_WORK_NOT_FOUND_OR_FORBIDDEN')fail(blocker);
        if(blocker)return {contract:'NEXO_SCIENTIFIC_REQUEST_V1',status:'BLOCKED',test_id:args.test_id,
          reason_code:blocker,blocker_reasons:blocker==='CANONICAL_READINESS_NOT_ELIGIBLE'?safeReasons(test?.readiness?.reasons):[],
          authority:state.authority,revision:state.revision,readback:'PASS',no_mutation:true};
        const requestIdentity={test_id:test.id,test_version:test.version,recipe:test.execution_binding.recipe,
          params:test.execution_binding.params,prereg_hash:test.execution_binding.prereg_hash};
        const fingerprint=sha256(requestIdentity);
        const envelope={kind:'TEST_BATTERY',source:'MCP_EXECUTOR',payload:{battery_id:`mcp-${fingerprint.slice(0,40)}`,
          tests:[{test_id:test.id,recipe:test.execution_binding.recipe,params:test.execution_binding.params}]}};
        const stable_id=`science-${sha256(envelope).slice(0,48)}`;
        const receipt=await submitScientificRequest(stable_id,envelope,principal);
        const expectedBody=sha256({...envelope,_via:'INBOX_GATEWAY_SHEET'});
        requireValue(receipt?.readback==='PASS'&&receipt?.stable_id===stable_id&&receipt?.body_sha256===expectedBody,
          'SCIENTIFIC_INTENT_READBACK_FAILED');
        return {contract:'NEXO_SCIENTIFIC_REQUEST_V1',status:'PENDING_WRITER',test_id:test.id,
          stable_id,body_sha256:receipt.body_sha256,queue_readback:'PASS',authority:state.authority,revision:state.revision,
          canonical_state:'READY',writer_readiness:'REVALIDATION_REQUIRED',reservation:'PENDING_WRITER_VALIDATION',
          dispatch:'NOT_DISPATCHED_BY_MCP',poll:'get_scientific_queue',idempotent:receipt.reused===true};
      }
      const accessible=state.work.filter(work=>principal.roles.includes(work.role));
      if(name==='get_work'||name==='get_role_session'){
        const work=accessible.filter(item=>item.role===args.role&&(!item.owner||item.owner===principal.id));
        const available=work.filter(item=>!['BLOCKED','FAILED','REGISTERED'].includes(item.state));
        return {role:args.role,prompt:ROLE_PROMPTS[args.role],authority:state.authority,revision:state.revision,
          available:available.map(item=>({...safeWork(item),role_session:sessionFor(item)})),
          blocked:work.filter(item=>item.state==='BLOCKED').map(safeWork),
          // Bootstrap real scientific work from the same verified snapshot; do not
          // make every role rediscover it through a second full Tower download.
          scientific_queue:{...scientificQueue(state,args.role,principal.id,{}),next_tool:'get_scientific_queue'},
          instructions:{recover_technical_failures:true,block_only_affected_item:true,criterion_changes:'EXPLICIT_SCIENTIFIC_DECISION',
            recipe:'REUSE_DEFINED_METHOD; INDEPENDENT_REVIEW_FOR_SCIENTIFIC_CODE_CHANGE',record_via:'WRITER_ONLY',
            routine_approval_required:false,formal_gates:['DESTRUCTIVE_OR_IRREVERSIBLE_ACTION','CRITICAL_CREDENTIAL_OR_ACCESS_CHANGE'],
            persistence:'ONLY_FOR_EXTERNAL_EFFECTS_RECOVERY_OR_CANONICAL_DELIVERY'},actions:toolsForRole(args.role,principal,state)};
      }
      const work=accessible.find(item=>item.id===args.work_id);
      requireValue(work,'WORK_NOT_FOUND_OR_FORBIDDEN');
      if(name==='get_result')return {...safeWork(work),canonical:work.state==='REGISTERED'&&work.receipt?.readback==='PASS'};
      if(name==='claim_work'&&work.owner&&work.owner!==principal.id)fail('WORK_ALREADY_CLAIMED');
      if(name==='request_execution')requireValue(!work.owner||work.owner===principal.id,'CLAIM_OWNERSHIP_REQUIRED');
      else if(name!=='claim_work')requireValue(work.owner===principal.id,'CLAIM_OWNERSHIP_REQUIRED');
      if((name==='claim_work'&&work.owner===principal.id&&work.state!=='READY')||
        (name==='prepare_package'&&work.package&&work.state!=='BLOCKED')||
        (name==='validate_package'&&['VALIDATED','DISPATCH_PENDING','DISPATCH_UNKNOWN','RUNNING','RESULT_AVAILABLE','DELIVERY_PENDING','REGISTERED'].includes(work.state))||
        (name==='request_execution'&&work.outbox&&work.state!=='BLOCKED')||
        (name==='register_delivery'&&['DELIVERY_PENDING','REGISTERED'].includes(work.state)))
        return {...safeWork(work),idempotent:true};
      const supersession=supersessionFor(work,name,principal.id);
      const value={contract:'NEXO_OPERATIONAL_INTENT_V1',action:name,work_id:work.id,principal:principal.id,
        role_session:sessionFor(work),expected_version:work.version,
        ...(supersession.intentId?{supersedes:supersession.intentId}:{})};
      const intent={...value,id:'op-'+sha256(value).slice(0,48)};
      const receipt=await submitIntent(intent,principal);
      requireValue(receipt?.readback==='PASS'&&receipt?.body_sha256===sha256(intent),'INTENT_READBACK_FAILED');
      return {work_id:work.id,state:'PENDING_WRITER',intent_id:intent.id,action:name,
        queue_readback:'PASS',canonical_state:work.state,poll:'get_work',idempotent:Boolean(receipt.reused),
        ...(supersession.legacyBlocked?{recovery_mode:'LEGACY_BLOCKED_WITHOUT_TERMINAL_INTENT_RECEIPT'}:{})};
    }
  };
}
export function registerOperationalTools(server,{service,principal,z}){
  if(!service||!principal?.authenticated)return;
  const exposed=OPERATIONAL_TOOL_NAMES.filter(name=>name!==SCIENTIFIC_MUTATION||principal.roles.includes('EXECUTOR'));
  for(const name of exposed){
    const byRole=['get_role_session','get_role_capabilities','get_work'].includes(name);
    const inputSchema=name==='get_scientific_queue'
      ?z.object({role:z.enum(Object.keys(ROLE_PROMPTS)),test_id:z.string().regex(ID).optional(),limit:z.number().int().min(1).max(100).optional(),cursor:z.string().max(2048).optional()}).strict()
      :name===SCIENTIFIC_MUTATION?z.object({test_id:z.string().regex(ID)}).strict()
      :z.object(byRole?{role:z.enum(Object.keys(ROLE_PROMPTS))}:{work_id:z.string().regex(ID)}).strict();
    server.registerTool(name,{description:`NEXO: ${name.replaceAll('_',' ')} through the canonical Writer.`,inputSchema,
      annotations:{readOnlyHint:!TOOL_MUTATIONS.has(name),destructiveHint:false,idempotentHint:true,openWorldHint:true}},async args=>{
      try{const result=await service.call(name,args,principal);return {content:[{type:'text',text:JSON.stringify(result)}],structuredContent:{result}};}
      catch(error){return {isError:true,content:[{type:'text',text:JSON.stringify({error:error.code||'OPERATIONAL_UNAVAILABLE'})}]};}
    });
  }
}
