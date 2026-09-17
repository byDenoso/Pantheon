import {createHmac} from 'node:crypto';

export const SESSION_TTL_MS=8*60*60*1000;
export const RATE_WINDOW_MS=15*60*1000;

export function isValidPin(pin){return /^\d{4,12}$/.test(String(pin??''));}

function hmacHex(value,secret){return createHmac('sha256',String(secret)).update(String(value),'utf8').digest('hex');}

export function makePinHash(pin,salt,secret){
  if(!isValidPin(pin)||!salt||!secret)throw new Error('INVALID_PIN_HASH_INPUT');
  return `hmac-sha256$${salt}$${hmacHex(`${salt}:${pin}`,secret)}`;
}

export function constantTimeEqual(left,right){
  const a=String(left??''),b=String(right??'');
  const length=Math.max(a.length,b.length);
  let diff=a.length^b.length;
  for(let i=0;i<length;i++)diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);
  return diff===0;
}

export function verifyPin(pin,encoded,secret){
  if(!isValidPin(pin)||typeof encoded!=='string'||!secret)return false;
  const parts=encoded.split('$');
  if(parts.length!==3||parts[0]!=='hmac-sha256'||!parts[1]||!/^[a-f0-9]{64}$/.test(parts[2]))return false;
  let candidate;
  try{candidate=makePinHash(pin,parts[1],secret).split('$')[2];}catch{return false;}
  return constantTimeEqual(candidate,parts[2]);
}

export function isSessionRecordValid(record,now=Date.now()){
  return Boolean(record&&Number.isFinite(record.createdAt)&&Number.isFinite(record.expiresAt)&&record.expiresAt>record.createdAt&&now<record.expiresAt&&record.expiresAt-record.createdAt<=SESSION_TTL_MS);
}

export function nextFailureBucket(bucket,now=Date.now(),windowStart=now){
  if(!bucket||!Number.isFinite(bucket.windowStart)||!Number.isFinite(bucket.count)||now>=bucket.windowStart+RATE_WINDOW_MS){
    return {windowStart:Number(windowStart),count:1};
  }
  return {windowStart:bucket.windowStart,count:bucket.count+1};
}

export function isRateLimited(bucket,now=Date.now(),maxFailures=5){
  if(!bucket||!Number.isFinite(bucket.windowStart)||!Number.isFinite(bucket.count))return false;
  if(now>=bucket.windowStart+RATE_WINDOW_MS)return false;
  return bucket.count>=maxFailures;
}
