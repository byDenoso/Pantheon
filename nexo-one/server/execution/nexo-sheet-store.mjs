import {ProviderError} from '../adapters/http.mjs';

const SOURCE='NEXO · SSOT CANONICAL';
const text=value=>String(value??'').trim();
const stamp=value=>{const ms=typeof value==='number'?value:Date.parse(String(value||''));return Number.isFinite(ms)?new Date(ms).toISOString():new Date().toISOString();};
const parse=value=>{try{return value?JSON.parse(value):{};}catch{throw new ProviderError('UNAVAILABLE');}};
const payloadOf=row=>({...parse(row.payload_json),status:row.status});

function canonicalRecord({type,id,status,title,detail='',payload,updatedAt}){
  if(!text(type)||!text(id)||!text(title))throw new ProviderError('UNAVAILABLE');
  return {record_type:text(type),record_id:text(id),status:text(status)||'UNKNOWN',title:text(title),detail:text(detail),payload_json:JSON.stringify(payload||{}),source:SOURCE,updated_at:stamp(updatedAt)};
}

export function createNexoSheetStores({now=new Date().toISOString(),transport}={}){
  if(!transport||typeof transport.list!=='function'||typeof transport.append!=='function'||typeof transport.replace!=='function')throw new Error('NEXO_SHEET_TRANSPORT_REQUIRED');
  const updatedAt=()=>stamp(typeof now==='function'?now():now);
  const matches=async(type,id)=>(await transport.list()).filter(row=>row.record_type===type&&row.record_id===id);
  const one=async(type,id)=>{const rows=await matches(type,id);if(rows.length>1)throw new Error('DUPLICATE_CANONICAL_RECORD');return rows[0]||null;};
  const persist=async(type,id,payload,{title,detail='',status}={})=>{
    const existing=await one(type,id),record=canonicalRecord({type,id,status:status??payload.status,title:title||payload.title||id,detail:detail||payload.detail||'',payload,updatedAt:updatedAt()});
    if(existing)await transport.replace(existing.rowNumber,record);else await transport.append(record);
    const rows=await matches(type,id);if(rows.length!==1)throw new Error('DUPLICATE_CANONICAL_RECORD');
    const saved=rows[0];if(saved.status!==record.status||saved.payload_json!==record.payload_json)throw new Error('CANONICAL_READBACK_MISMATCH');
    return {row:saved,payload:payloadOf(saved)};
  };

  const effectLedger={
    async get(effectKey){const row=await one('effect',text(effectKey));return row?payloadOf(row):null;},
    async reserve(record){
      const id=text(record?.effect_key);if(!id)throw new Error('EFFECT_KEY_REQUIRED');
      const before=await matches('effect',id);
      if(before.length>1)return {acquired:false,existing:payloadOf(before[0]),conflict:'DUPLICATE_CANONICAL_RECORD'};
      if(before.length===1&&text(before[0].status).toUpperCase()!=='FAILED')return {acquired:false,existing:payloadOf(before[0])};
      const full={...record,effect_key:id,status:'PENDING'},next=canonicalRecord({type:'effect',id,status:'PENDING',title:text(record.effect_type)||id,detail:text(record.target),payload:full,updatedAt:updatedAt()});
      if(before.length===1)await transport.replace(before[0].rowNumber,next);else await transport.append(next);
      const after=await matches('effect',id);
      if(after.length!==1)return {acquired:false,existing:after[0]?payloadOf(after[0]):null,conflict:'DUPLICATE_CANONICAL_RECORD'};
      return {acquired:true,effect:payloadOf(after[0])};
    },
    async complete(effectKey,patch){const current=await effectLedger.get(effectKey);if(!current)throw new Error('EFFECT_NOT_FOUND');return (await persist('effect',text(effectKey),{...current,...patch,effect_key:text(effectKey)},{title:current.effect_type||effectKey,detail:current.target,status:patch?.status||current.status})).payload;},
    async fail(effectKey,patch){const current=await effectLedger.get(effectKey);if(!current)throw new Error('EFFECT_NOT_FOUND');return (await persist('effect',text(effectKey),{...current,...patch,effect_key:text(effectKey)},{title:current.effect_type||effectKey,detail:patch?.last_error||current.target,status:patch?.status||'FAILED'})).payload;}
  };

  const executionRuns={
    async start(record){const id=text(record?.run_id);if(!id)throw new Error('RUN_ID_REQUIRED');return (await persist('execution_run',id,{...record,run_id:id},{title:`Execution ${id}`,detail:text(record.action_id),status:record.status||'IN_PROGRESS'})).payload;},
    async finish(id,patch){const row=await one('execution_run',text(id));if(!row)throw new Error('RUN_NOT_FOUND');const current=payloadOf(row);return (await persist('execution_run',text(id),{...current,...patch,run_id:text(id)},{title:`Execution ${id}`,detail:text(current.action_id),status:patch?.status||current.status})).payload;}
  };

  const personalRecords={
    async get(kind,id){const row=await one(text(kind).toLowerCase(),text(id));return row?{record:row,payload:payloadOf(row)}:null;},
    async upsert(record){
      const kind=text(record?.kind),type=kind.toLowerCase();if(!['task','commitment','decision'].includes(type))throw new Error('PERSONAL_RECORD_KIND_UNSUPPORTED');
      const id=text(record?.id);if(!id)throw new Error('PERSONAL_RECORD_ID_REQUIRED');
      const state=text(record.status)||'SCHEDULED',saved=await persist(type,id,{...record,kind,id},{title:text(record.title)||id,detail:text(record.detail),status:state});
      return {verified:saved.payload.id===id&&saved.payload.kind===kind&&saved.row.status===state,record:saved.row,payload:saved.payload};
    }
  };
  return {effectLedger,executionRuns,personalRecords};
}
