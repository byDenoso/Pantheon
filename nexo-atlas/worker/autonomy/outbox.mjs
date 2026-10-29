// Transport only. Tower and the existing Writer remain the sole state owner/applier.
// Adapted from the reviewed Chat artifact and existing public submitHuman contract.
import {createHash, randomBytes} from 'node:crypto';
export const CONTRACT='NEXO_ATLAS_AUTONOMY_OUTBOX_V1';
export const TTL_MS=30*60*1000;
const MAX_BODY=32768, MAX_GET=20;
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const exact=(v,keys)=>object(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const HASH=/^[a-f0-9]{64}$/;
const DATE=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/;
const validDate=v=>typeof v==='string'&&DATE.test(v)&&Number.isFinite(Date.parse(v));
function safe(v,depth=0){
 if(depth>12)throw Error('ENVELOPE_DEPTH');
 if(v===null||typeof v==='boolean')return;
 if(typeof v==='number'){if(!Number.isSafeInteger(v)||Object.is(v,-0))throw Error('ENVELOPE_NUMBER');return;}
 if(typeof v==='string'){if(v.length>MAX_BODY||/[\uD800-\uDFFF]/u.test(v))throw Error('ENVELOPE_STRING');return;}
 if(Array.isArray(v)){if(v.length>32)throw Error('ENVELOPE_ARRAY');for(const x of v)safe(x,depth+1);return;}
 if(!object(v)||Object.getPrototypeOf(v)!==Object.prototype)throw Error('ENVELOPE_VALUE');
 for(const [k,x] of Object.entries(v)){if(!/^[A-Za-z0-9_]{1,80}$/.test(k))throw Error('ENVELOPE_KEY');safe(x,depth+1);}
}
export function canonical(v){return v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';}
export function proposalHash(v){return createHash('sha256').update(canonical(humanProposal(v))).digest('hex');}
export function humanProposal(v){
 safe(v);if(Buffer.byteLength(JSON.stringify(v))>MAX_BODY)throw Error('ENVELOPE_TOO_LARGE');
 if(!exact(v,['kind','source','created_at','payload'])||v.kind!=='OPERATOR_INTENT'||v.source!=='DENER'||!validDate(v.created_at))throw Error('HUMAN_PROPOSAL_INVALID');
 const p=v.payload, approve=p?.action==='APPROVE_AUTONOMY_MANDATE';
 if(!approve&&p?.action!=='REVOKE_AUTONOMY_MANDATE')throw Error('ACTION_INVALID');
 if(!exact(p,['action','mandate_id','expected_revision','approval_ref',...(approve?['activation_receipt']:[])])||typeof p.mandate_id!=='string'||!/^[A-Za-z0-9_-]{3,80}$/.test(p.mandate_id)||!Number.isSafeInteger(p.expected_revision)||p.expected_revision<0||typeof p.approval_ref!=='string'||!/^NEXO_PRIVATE_HUMAN_CONTROL:sha256:[a-f0-9]{64}$/.test(p.approval_ref))throw Error('PAYLOAD_INVALID');
 if(approve){const r=p.activation_receipt, checks=['transport','writer','public_projection','prompts','quota'];
  if(!object(r)||!exact(r.checks,checks)||checks.some(k=>r.checks[k]!==true)||!(/^[a-f0-9]{40}$/).test(r.source_revision)||!(/^[a-f0-9]{40}$/).test(r.tcc_revision)||!(/^sha256:[a-f0-9]{64}$/).test(r.tower_fingerprint)||!validDate(r.checked_at))throw Error('ACTIVATION_RECEIPT_INVALID');
 }
 return v;
}
async function parseBody(request){
 if(request.method!=='POST'||(request.headers.get('content-type')||'').split(';')[0].trim().toLowerCase()!=='application/json')throw Error('JSON_POST_REQUIRED');
 if(Number(request.headers.get('content-length'))>MAX_BODY)throw Error('BODY_TOO_LARGE');
 const reader=request.body?.getReader();let size=0;const chunks=[];
 if(reader)for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BODY){await reader.cancel();throw Error('BODY_TOO_LARGE');}chunks.push(value);}
 const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
 if(!exact(body,['envelope','confirmation_sha256']))throw Error('DECISION_FIELDS');return body;
}
export function revokeProposal(tower,createdAt){
 const m=tower?.files?.['CONTROL.json']?.value?.autonomy_mandate;
 if(!m||m.schema!=='NEXO_AUTONOMY_MANDATE_V1'||m.status!=='ACTIVE'||!Number.isSafeInteger(m.revision)||m.revision<1)return null;
 return humanProposal({kind:'OPERATOR_INTENT',source:'DENER',created_at:createdAt,payload:{action:'REVOKE_AUTONOMY_MANDATE',mandate_id:m.id,expected_revision:m.revision,approval_ref:'NEXO_PRIVATE_HUMAN_CONTROL:'+tower.revision}});
}
function record(row,now,{allowExpired=false}={}){
 if(!row)return null;
 const envelope=humanProposal(JSON.parse(row.envelope_json));
 if(!HASH.test(row.id)||row.id!==row.proposal_sha256||proposalHash(envelope)!==row.id||!Number.isSafeInteger(row.confirmed_at)||!Number.isSafeInteger(row.expires_at)||row.expires_at-row.confirmed_at!==TTL_MS||row.confirmed_at>now||row.confirmed_at<Date.parse(envelope.created_at)||row.confirmed_at-Date.parse(envelope.created_at)>300000||!(/^[a-f0-9]{32}$/).test(row.nonce))throw Error('STORED_DECISION_INVALID');
 if(!allowExpired&&row.expires_at<=now)return null;
 return {id:row.id,proposal_sha256:row.proposal_sha256,envelope,confirmed_at:row.confirmed_at,expires_at:row.expires_at,nonce:row.nonce};
}
const existing=(db,hash)=>db.prepare('SELECT * FROM atlas_autonomy_decisions WHERE proposal_sha256 = ?').bind(hash).first();
const response=body=>({contract:CONTRACT,...body});
function sameBinding(a,b){return a&&b&&['userId','sessionHash','credentialHash','pinHash'].every(k=>a[k]===b[k]);}
function delivered(row,envelope,binding,now,reused){
 const d=record(row,now,{allowExpired:true});
 if(!d||row.user_id!==binding.userId||canonical(d.envelope)!==canonical(envelope))throw Error('DECISION_READBACK_CONFLICT');
 return response({stage:d.expires_at<=now?'EXPIRED':'DELIVERED',readback:'PASS',reused,decision:{id:d.id,proposal_sha256:d.proposal_sha256,confirmed_at:d.confirmed_at,expires_at:d.expires_at}});
}
export async function postDecision(request,env,{db,getBinding,readCanonical,preparedApproval=async()=>null,now=Date.now}){
 const first=await getBinding(request,env,now());if(!first)throw Error('AUTH_REQUIRED');
 const body=await parseBody(request), envelope=humanProposal(body.envelope), hash=proposalHash(envelope);
 if(body.confirmation_sha256!==hash)throw Error('EXACT_PROPOSAL_CONFIRMATION_REQUIRED');
 const before=await existing(db,hash);
 if(before){const again=await getBinding(request,env,now());if(!sameBinding(first,again))throw Error('AUTH_REQUIRED');return delivered(before,envelope,again,now(),true);}
 const tower=await readCanonical(request), current=now();
 if(Date.parse(envelope.created_at)>current||Date.parse(envelope.created_at)<current-300000)throw Error('PROPOSAL_EXPIRED');
 if(envelope.payload.action==='APPROVE_AUTONOMY_MANDATE'){
  const p=envelope.payload,r=p.activation_receipt,c=tower.files['CONTROL.json'].value,m=c.autonomy_mandate;
  if(m!==null&&m!==undefined&&(!object(m)||m.schema!=='NEXO_AUTONOMY_MANDATE_V1'||!['ACTIVE','REVOKED'].includes(m.status)||!Number.isSafeInteger(m.revision)||m.revision<1))throw Error('PROPOSAL_NOT_PREPARED');
  if(m?.status==='ACTIVE'||p.expected_revision!==(m?.revision||0)||(c.revoked_autonomy_mandates||[]).includes(p.mandate_id)||(m?.status==='REVOKED'&&m.id===p.mandate_id)||r.tower_fingerprint!==tower.revision||p.approval_ref!=='NEXO_PRIVATE_HUMAN_CONTROL:'+tower.revision||Date.parse(r.checked_at)>Date.parse(envelope.created_at)||Date.parse(envelope.created_at)-Date.parse(r.checked_at)>TTL_MS)throw Error('PROPOSAL_NOT_PREPARED');
 }
 const prepared=envelope.payload.action==='APPROVE_AUTONOMY_MANDATE'?await preparedApproval(tower):revokeProposal(tower,envelope.created_at);
 if(!prepared||proposalHash(prepared)!==hash||canonical(prepared)!==canonical(envelope))throw Error('PROPOSAL_NOT_PREPARED');
 const binding=await getBinding(request,env,now());if(!sameBinding(first,binding))throw Error('AUTH_REQUIRED');
 const confirmed=now(), nonce=randomBytes(16).toString('hex');
 await db.prepare(`INSERT INTO atlas_autonomy_decisions
 (id,proposal_sha256,envelope_json,confirmed_at,expires_at,nonce,user_id,session_hash,credential_hash)
 SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS (
 SELECT 1 FROM atlas_owner o JOIN atlas_sessions s ON s.token_hash=?
 WHERE o.id=1 AND o.user_id=? AND o.pin_hash=? AND s.credential=? AND s.expires_at>? AND s.expires_at<=?)
 ON CONFLICT(proposal_sha256) DO NOTHING`).bind(hash,hash,canonical(envelope),confirmed,confirmed+TTL_MS,nonce,binding.userId,binding.sessionHash,binding.credentialHash,binding.sessionHash,binding.userId,binding.pinHash,binding.credentialHash,confirmed,confirmed+3600000).run();
 return delivered(await existing(db,hash),envelope,binding,now(),false);
}
export async function listWriterDecisions(request,{db,now=Date.now}){
 const current=now();const rows=await db.prepare('SELECT * FROM atlas_autonomy_decisions WHERE expires_at>? ORDER BY confirmed_at ASC,id ASC LIMIT ?').bind(current,MAX_GET+1).all();
 if(!Array.isArray(rows.results)||rows.results.length>MAX_GET)throw Error('OUTBOX_LIMIT');
 return response({decisions:rows.results.map(row=>record(row,current))});
}
export async function readWriterDecision(request,id,{db,now=Date.now}){
 if(!HASH.test(id))throw Error('DECISION_ID_INVALID');
 const row=await db.prepare('SELECT * FROM atlas_autonomy_decisions WHERE id=?').bind(id).first();return response({decision:record(row,now())});
}
