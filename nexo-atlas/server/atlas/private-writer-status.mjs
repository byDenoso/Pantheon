import {normalizePrivateTower} from './private-tower-input.mjs';
import {createHash} from 'node:crypto';

const labels={APPLIED:'Aplicado pelo Writer',ALREADY_APPLIED:'Aplicação anterior confirmada',
  DEFERRED_DEPENDENCY:'Aguardando dependência',REJECTED:'Recusado pelo Writer',
  RETRYABLE_TRANSPORT:'Falha de transporte; reconciliar antes de reenviar'};
const entryValue=entry=>entry?.encoding==='json'?entry.value:null;
function resultRecords(tower,intent,effects,revision) {
  const result=[];
  for(const [path,entry]of Object.entries(tower.files)) {
    const value=entryValue(entry);
    if(path.startsWith('entities/')&&value?.inbox_ref===intent)result.push({id:value.id||value.test_id||value.work_id||null,
      source_ref:path,entity_version:value.entity_version??null,observed_revision:revision,readback:'OBSERVED_IN_CURRENT_TOWER'});
  }
  // The existing single-post converter binds its mutation request to the exact
  // post ID and source. Multi-post batches remain unlinked unless the source
  // supplies a corresponding entity record; do not invent an association.
  for(const post of entryValue(tower.files['evolution/board.json'])?.posts||[]) {
    if(typeof post.id!=='string'||typeof post.from!=='string')continue;
    const suffix=createHash('sha256').update(JSON.stringify({post_ids:[post.id],resolve:[]})).digest('hex').slice(0,16).toUpperCase();
    const requestId=`REQ-BOARD-${post.from}-${suffix}`;
    if(effects.some(effect=>effect.effect_id===requestId&&['APPLIED','ALREADY_APPLIED'].includes(effect.outcome)))result.push({id:post.id,
      source_ref:'evolution/board.json',entity_version:null,observed_revision:revision,readback:'OBSERVED_IN_CURRENT_TOWER',kind:'BOARD_POST'});
  }
  return result;
}

/** Only the authenticated private compiler uses this projection. No local queue or second ledger. */
export function privateWriterOperations(tower,{intent_id=null,expected_revision=null,limit=50}={}) {
  const {revision}=normalizePrivateTower(tower);
  if(expected_revision!==null && expected_revision!==revision) return {status:409,body:{error:'SOURCE_REVISION_CHANGED'}};
  if(intent_id!==null && (typeof intent_id!=='string'||!intent_id.trim()||intent_id.length>512))return {status:400,body:{error:'WRITER_STATUS_REQUEST_INVALID'}};
  if(!Number.isInteger(limit)||limit<1||limit>100)return {status:400,body:{error:'WRITER_STATUS_REQUEST_INVALID'}};
  const receipts=Object.entries(tower.files).filter(([path])=>path.startsWith('operations/receipts/'))
    .map(([,entry])=>entryValue(entry)).filter(row=>row?.contract==='OPERATION_RECEIPT_V1'&&typeof row.intent_id==='string');
  const envelopes=receipts.filter(row=>row.effect_id?.startsWith('envelope-')&&(!intent_id||row.intent_id===intent_id))
    .sort((a,b)=>String(b.observed_at).localeCompare(String(a.observed_at))||String(b.receipt_id).localeCompare(String(a.receipt_id)));
  const latest=new Map();for(const row of envelopes)if(!latest.has(row.intent_id))latest.set(row.intent_id,row);
  const items=[...latest.values()].slice(0,limit).map(row=>{const effects=receipts.filter(effect=>effect.intent_id===row.intent_id&&!effect.effect_id?.startsWith('envelope-'));
    const records=resultRecords(tower,row.intent_id,effects,revision);return {intent_id:row.intent_id,stage:row.stage,outcome:row.outcome,
    label:labels[row.outcome]||'Estado registrado pelo Writer',reason_code:row.reason_code||null,retry_condition:row.retry_condition||null,
    receipt_id:row.receipt_id,payload_sha256:row.payload_sha256,source_revision:row.source_revision,result_revision:row.result_revision,
    observed_at:row.observed_at,effects:effects
      .map(effect=>({effect_id:effect.effect_id,outcome:effect.outcome,receipt_id:effect.receipt_id,reason_code:effect.reason_code||null})),
    result_records:records,entity_readback:records.length?'OBSERVED_IN_CURRENT_TOWER':'REQUIRED_SEPARATELY',scientific_execution:'NOT_ESTABLISHED_BY_RECEIPT'};});
  return {status:200,body:{contract:'ATLAS_PRIVATE_WRITER_STATUS_V1',access:'PRIVATE',source_revision:revision,
    source:'CANONICAL_TOWER_OPERATION_RECEIPTS',items,total:latest.size,has_more:latest.size>items.length,
    stage:items.length?'OBSERVED':'UNOBSERVED',note:'Ausência de recibo não comprova ausência de entrega. Confira a INBOX antes de reenviar.'}};
}
