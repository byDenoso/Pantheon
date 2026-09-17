const WINDOW_MS=15*60*1000;
const MAX_FAILURES=5;
const failures=new Map();

const normalizeKey=value=>String(value||'unknown').split(',')[0].trim()||'unknown';

export function loginRateLimitKey(req){
  return normalizeKey(req?.headers?.['x-forwarded-for']||req?.headers?.['x-real-ip']||req?.socket?.remoteAddress||'unknown');
}

export function checkLoginAttempt(key,now=Date.now()){
  const normalized=normalizeKey(key),entry=failures.get(normalized);
  if(!entry)return {allowed:true,retryAfterMs:0,failures:0};
  if(now-entry.windowStartedAt>=WINDOW_MS){failures.delete(normalized);return {allowed:true,retryAfterMs:0,failures:0};}
  if(entry.count<MAX_FAILURES)return {allowed:true,retryAfterMs:0,failures:entry.count};
  return {allowed:false,retryAfterMs:Math.max(0,WINDOW_MS-(now-entry.windowStartedAt)),failures:entry.count};
}

export function recordLoginFailure(key,now=Date.now()){
  const normalized=normalizeKey(key),entry=failures.get(normalized);
  if(!entry||now-entry.windowStartedAt>=WINDOW_MS){failures.set(normalized,{count:1,windowStartedAt:now});return 1;}
  entry.count+=1;return entry.count;
}

export function clearLoginFailures(key){failures.delete(normalizeKey(key));}

export const LOGIN_RATE_LIMIT={windowMs:WINDOW_MS,maxFailures:MAX_FAILURES};
