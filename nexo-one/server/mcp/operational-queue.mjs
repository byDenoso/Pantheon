import {canonical,sha256,MUTATIONS} from './operational-tools.mjs';
export const SPOOL_ID='1M2maKkuEjxumZRa145dzei7dEPFi2yKsKlUf7_scC-E';
const INTENT_ID=/^op-[a-f0-9]{48}$/;
const PRINCIPAL_ID=/^[0-9a-f]{64}$/;
const WORK_ID=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
export function isOperationalEnvelope(value){
  if(!value||typeof value!=='object')return false;
  if(value.contract==='NEXO_OPERATIONAL_INTENT_V1'||value.kind==='OPERATIONAL_INTENT')return true;
  return Object.values(value).some(child=>child&&typeof child==='object'&&
    (Array.isArray(child)?child.some(isOperationalEnvelope):isOperationalEnvelope(child)));
}
const fail=message=>{throw Object.assign(new Error(message),{code:message});};
export function createOperationalQueue({read,append}){
  return async function submit(intent,principal){
    if(!principal?.authenticated||intent.principal!==principal.id||intent.contract!=='NEXO_OPERATIONAL_INTENT_V1'||
       !MUTATIONS.includes(intent.action))fail('AUTHENTICATED_INTENT_REQUIRED');
    const required=['contract','id','action','work_id','principal','role_session','expected_version'];
    const keys=Object.keys(intent);
    if(required.some(key=>!Object.hasOwn(intent,key))||keys.some(key=>!required.includes(key)&&key!=='supersedes'))
      fail('INTENT_FIELDS_INVALID');
    if(!PRINCIPAL_ID.test(String(intent.principal))||!WORK_ID.test(String(intent.work_id))||
       !intent.role_session||typeof intent.role_session!=='object'||Array.isArray(intent.role_session)||
       !Number.isInteger(intent.expected_version)||intent.expected_version<0)fail('INTENT_FIELDS_INVALID');
    if(Object.hasOwn(intent,'supersedes')&&(!INTENT_ID.test(String(intent.supersedes))||intent.supersedes===intent.id))
      fail('SUPERSESSION_ID_INVALID');
    const {id,...identity}=intent;
    if(!INTENT_ID.test(String(id))||id!=='op-'+sha256(identity).slice(0,48))fail('INTENT_HASH_MISMATCH');
    const bytes=canonical(intent);
    if(Buffer.byteLength(bytes)>32768)fail('INTENT_TOO_LARGE');
    function check(spool){
      if(spool.spreadsheetId!==SPOOL_ID||!spool.title||spool.columns.stable<0||spool.columns.envelope<0)fail('SPOOL_DESTINATION_MISMATCH');
      const rows=spool.rows.filter(row=>row?.[spool.columns.stable]===id);
      for(const row of rows){
        let actual;
        try{actual=JSON.parse(Buffer.from(row[spool.columns.envelope],'base64url').toString('utf8'));}
        catch{fail('SPOOL_IDENTITY_CONFLICT');}
        if(canonical(actual)!==bytes)fail('SPOOL_IDENTITY_CONFLICT');
      }
      return rows.length;
    }
    const before=await read();const count=check(before);
    if(!count)await append(before,{stableId:id,envelope:intent,role:'MCP_ROLE_SERVICE'});
    const after=await read();
    if(!check(after))fail('SPOOL_BODY_READBACK_FAILED');
    return {readback:'PASS',reused:count>0,body_sha256:sha256(bytes),destination:`sheet:${SPOOL_ID}/${after.title}`};
  };
}
export async function submitOperationalIntent(intent,principal,env,request){
  const {readSpool,appendSpoolRow,fullSpoolRow}=await import('../inbox-gateway.mjs');
  return createOperationalQueue({read:()=>readSpool(env,request),
    append:(spool,item)=>appendSpoolRow(spool,fullSpoolRow(spool,item))})(intent,principal);
}
