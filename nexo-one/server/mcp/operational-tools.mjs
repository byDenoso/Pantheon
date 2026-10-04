// Authenticated role facade; the existing Writer owns canonical mutations.
import {createHash} from 'node:crypto';
export const ROLE_NAMES=Object.freeze({EXECUTOR:'Executor',ENGENHEIRO:'Engenheiro',CIENTISTA:'Cientista',CRITICO:'Cr\u00edtico'});
export const ROLE_PROMPTS=Object.freeze(Object.fromEntries(Object.entries(ROLE_NAMES).map(([role,name])=>[
  role,`Voc\u00ea \u00e9 o ${name} do NEXO. Consulte o MCP para obter seu trabalho e as a\u00e7\u00f5es dispon\u00edveis; execute e registre o resultado.`
])));
export const MUTATIONS=Object.freeze(['claim_work','prepare_package','validate_package','request_execution','register_delivery']);
export const OPERATIONAL_TOOL_NAMES=Object.freeze(['get_role_session','get_role_capabilities','get_work',...MUTATIONS,'get_result']);
const ID=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const INTENT_ID=/^op-[a-f0-9]{48}$/;
const TERMINAL_INTENT_DISPOSITIONS=new Set(['BLOCKED','STALE_VERSION']);
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
export function createOperationalService({readState,submitIntent}){
  requireValue(typeof readState==='function'&&typeof submitIntent==='function','OPERATIONAL_ADAPTERS_REQUIRED');
  return {
    async call(name,args,principal){
      requireValue(principal?.authenticated===true&&Array.isArray(principal.roles)&&/^[0-9a-f]{64}$/.test(principal.id),'AUTHENTICATION_REQUIRED');
      requireValue(OPERATIONAL_TOOL_NAMES.includes(name),'UNKNOWN_OPERATIONAL_TOOL');
      requireValue(args&&typeof args==='object'&&!Array.isArray(args),'INPUT_INVALID');
      const expected=['get_role_session','get_role_capabilities','get_work'].includes(name)?['role']:['work_id'];
      requireValue(Object.keys(args).length===1&&Object.keys(args).every(key=>expected.includes(key)),'INPUT_FIELDS_INVALID');
      if(args.role)requireValue(Object.hasOwn(ROLE_PROMPTS,args.role)&&principal.roles.includes(args.role),'ROLE_FORBIDDEN');
      if(args.work_id)requireValue(ID.test(args.work_id),'WORK_ID_INVALID');
      if(name==='get_role_capabilities')return {role:args.role,tools:OPERATIONAL_TOOL_NAMES,
        writer:'NEXO Writer robot',execution:'GITHUB_ACTIONS',antigravity_required:false,
        mutation_model:'IMMUTABLE_INTENT_THEN_WRITER_ACK',availability:'CHECK_ON_USE',
        routine_approval_required:false,request_execution_includes:['claim','prepare','validate','dispatch','collect','register'],
        scientific_result_eligible:false};
      const state=await readState();
      requireValue(state.authority==='TOWER_V06@GOOGLE_DRIVE_PRIVATE'&&state.readback==='PASS','CANONICAL_STATE_UNAVAILABLE');
      const accessible=state.work.filter(work=>principal.roles.includes(work.role));
      if(name==='get_work'||name==='get_role_session'){
        const work=accessible.filter(item=>item.role===args.role&&(!item.owner||item.owner===principal.id));
        const available=work.filter(item=>!['BLOCKED','FAILED','REGISTERED'].includes(item.state));
        return {role:args.role,prompt:ROLE_PROMPTS[args.role],authority:state.authority,revision:state.revision,
          available:available.map(item=>({...safeWork(item),role_session:sessionFor(item)})),
          blocked:work.filter(item=>item.state==='BLOCKED').map(safeWork),
          instructions:{recover_technical_failures:true,block_only_affected_item:true,criterion_changes:'EXPLICIT_SCIENTIFIC_DECISION',
            recipe:'REUSE_DEFINED_METHOD; INDEPENDENT_REVIEW_FOR_SCIENTIFIC_CODE_CHANGE',record_via:'WRITER_ONLY',
            routine_approval_required:false,formal_gates:['DESTRUCTIVE_OR_IRREVERSIBLE_ACTION','CRITICAL_CREDENTIAL_OR_ACCESS_CHANGE'],
            persistence:'ONLY_FOR_EXTERNAL_EFFECTS_RECOVERY_OR_CANONICAL_DELIVERY'},actions:OPERATIONAL_TOOL_NAMES};
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
  for(const name of OPERATIONAL_TOOL_NAMES){
    const byRole=['get_role_session','get_role_capabilities','get_work'].includes(name);
    const inputSchema=z.object(byRole?{role:z.enum(Object.keys(ROLE_PROMPTS))}:{work_id:z.string().regex(ID)}).strict();
    server.registerTool(name,{description:`NEXO: ${name.replaceAll('_',' ')} through the canonical Writer.`,inputSchema,
      annotations:{readOnlyHint:!MUTATIONS.includes(name),destructiveHint:false,idempotentHint:true,openWorldHint:true}},async args=>{
      try{const result=await service.call(name,args,principal);return {content:[{type:'text',text:JSON.stringify(result)}],structuredContent:{result}};}
      catch(error){return {isError:true,content:[{type:'text',text:JSON.stringify({error:error.code||'OPERATIONAL_UNAVAILABLE'})}]};}
    });
  }
}
