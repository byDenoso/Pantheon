import {createHash} from 'node:crypto';

export const ACTION_ERROR_CODES=Object.freeze([
  'AUTH_REQUIRED','SCOPE_REQUIRED','CAPABILITY_BLOCKED','AUTHORITY_CONFLICT',
  'TARGET_AMBIGUOUS','RATE_LIMITED','PROVIDER_UNAVAILABLE','PROVIDER_REJECTED',
  'READBACK_MISMATCH','READBACK_TIMEOUT','IDEMPOTENCY_CONFLICT','INVALID_INTENT',
  'CONFIRMATION_REQUIRED'
]);
const ACTION_ERRORS=new Set(ACTION_ERROR_CODES);

export class ActionError extends Error {
  constructor(code,message=code,meta={}){
    super(message);
    this.name='ActionError';
    this.code=ACTION_ERRORS.has(code)?code:'PROVIDER_UNAVAILABLE';
    this.meta=meta&&typeof meta==='object'?meta:{};
  }
}

const CONFIRMATION_BY_ACTION=Object.freeze({
  'gmail.send':'CONFIRM',
  'gmail.draft':'CONFIRM',
  'calendar.create':'CONFIRM',
  'calendar.update':'CONFIRM',
  'calendar.delete':'STRONG_CONFIRM',
  'drive.create':'CONFIRM',
  'drive.update':'STRONG_CONFIRM',
  'nexo.sheet.update':'STRONG_CONFIRM',
  'github.issue.create':'CONFIRM',
  'github.issue.update':'CONFIRM',
  'github.branch.create':'CONFIRM',
  'github.commit.create':'CONFIRM',
  'github.pr.create':'CONFIRM',
  'github.merge':'STRONG_CONFIRM',
  'vercel.deploy':'CONFIRM',
  'vercel.promote':'STRONG_CONFIRM'
});

export function confirmationFor(actionType){
  return CONFIRMATION_BY_ACTION[actionType]||'NONE';
}

function cleanString(value,max=512){
  return typeof value==='string'?value.trim().slice(0,max):'';
}

export function normalizeIntent(input,now=Date.now()){
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.prototype.hasOwnProperty.call(input,'authority'))throw new ActionError('INVALID_INTENT');
  const required=['action_id','action_type','domain','provider','capability_id','target_ref','idempotency_key'];
  const values=Object.fromEntries(required.map(key=>[key,cleanString(input[key])]));
  if(required.some(key=>!values[key]))throw new ActionError('INVALID_INTENT');
  if(!/^[A-Za-z0-9._:/-]{1,160}$/.test(values.action_id)||!/^[A-Za-z0-9._:-]{1,160}$/.test(values.idempotency_key))throw new ActionError('INVALID_INTENT');
  const actionType=values.action_type.toLowerCase(),provider=values.provider.toLowerCase(),domain=values.domain.toUpperCase();
  const requestedPayload=input.requested_payload===undefined?{}:input.requested_payload;
  if(requestedPayload===null||typeof requestedPayload!=='object'||Array.isArray(requestedPayload))throw new ActionError('INVALID_INTENT');
  return {
    action_id:values.action_id,
    action_type:actionType,
    domain,
    provider,
    capability_id:values.capability_id,
    target_ref:values.target_ref,
    requested_payload:structuredClone(requestedPayload),
    requested_at:new Date(now).toISOString(),
    requested_by:'private-session',
    idempotency_key:values.idempotency_key,
    confirmation_level:confirmationFor(actionType)
  };
}

export function semanticKey(intent){
  return JSON.stringify([
    intent.action_type,
    intent.domain,
    intent.provider,
    intent.capability_id,
    intent.target_ref,
    intent.requested_payload
  ]);
}

export function semanticFingerprint(intent){
  return `ACT-${createHash('sha256').update(semanticKey(intent)).digest('hex').slice(0,16).toUpperCase()}`;
}

export function safeActionError(error){
  const code=ACTION_ERRORS.has(error?.code)?error.code:'PROVIDER_UNAVAILABLE';
  return {error:code};
}
