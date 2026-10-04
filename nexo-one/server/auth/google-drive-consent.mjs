import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {startAuthorization} from '@vercel/connect';
import {authenticated,sameOrigin} from './session.mjs';
import {googleConnectToken,googleRuntimeEnvironment,GOOGLE_SHEETS_SPOOL_SCOPES} from '../adapters/connect.mjs';
import {readOperationalTower} from '../mcp/operational-state.mjs';
import {SPOOL_ID} from '../mcp/operational-queue.mjs';

export const GOOGLE_DRIVE_CONSENT=Object.freeze({
  connector:'google/alizarin-saddle',
  subject:Object.freeze({type:'user',id:'owner'}),
  scopes:Object.freeze(['https://www.googleapis.com/auth/drive.readonly']),
  origin:'https://nexo-one-two.vercel.app'
});
export const GOOGLE_SHEETS_SPOOL_CONSENT=Object.freeze({
  connector:GOOGLE_DRIVE_CONSENT.connector,
  subject:GOOGLE_DRIVE_CONSENT.subject,
  scopes:GOOGLE_SHEETS_SPOOL_SCOPES,
  origin:GOOGLE_DRIVE_CONSENT.origin
});
export const GOOGLE_CONSENT_PROFILES=Object.freeze({
  drive_readonly:GOOGLE_DRIVE_CONSENT,
  sheets_spool_write:GOOGLE_SHEETS_SPOOL_CONSENT
});
const DEFAULT_PROFILE='drive_readonly';
const SHEETS_PROFILE='sheets_spool_write';
const TTL=10*60*1000;
const FLOW_COOKIE='nexo_drive_consent';
const RETURN_COOKIE='nexo_drive_return';
const PENDING_COOKIE='nexo_drive_pending';
const fixedError=(error,status)=>({status,body:{error}});
const equal=(a,b)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};
const digest=value=>createHash('sha256').update(value).digest('hex');
function cookieValue(req,name){return String(req.headers?.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(name+'='))?.slice(name.length+1)||'';}
function sessionBinding(req){return digest(cookieValue(req,'nexo_session'));}
function sign(value,env){return createHmac('sha256',env.NEXO_SESSION_SECRET).update('nexo-drive-consent-v1:'+value).digest('base64url');}
function seal(payload,env){const value=Buffer.from(JSON.stringify(payload)).toString('base64url');return value+'.'+sign(value,env);}
function unseal(value,env,kind,now){
  if(typeof value!=='string'||value.length>2048)return null;
  const parts=value.split('.');
  if(parts.length!==2||!parts.every(v=>/^[A-Za-z0-9_-]+$/.test(v))||!equal(parts[1],sign(parts[0],env)))return null;
  try{
    const raw=JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8'));
    // Before profiles existed, valid signed cookies were Drive-only. Preserve
    // those in-flight callbacks without ever upgrading them to Sheets access.
    const legacyProfile=raw?.profile===undefined;
    const p=legacyProfile?{...raw,profile:DEFAULT_PROFILE,legacyProfile:true}:raw;
    return p?.v===1&&p.kind===kind&&Object.hasOwn(GOOGLE_CONSENT_PROFILES,p.profile)&&Number.isFinite(p.iat)&&Number.isFinite(p.exp)&&
      p.iat<=now&&p.exp===p.iat+TTL&&p.exp>now&&/^[0-9a-f]{64}$/.test(p.session)&&
      /^[0-9a-f]{64}$/.test(p.nonce)?p:null;
  }catch{return null;}
}
function configuredOwner(env,req){
  return env.GOOGLE_CONNECTOR===GOOGLE_DRIVE_CONSENT.connector&&
    (env.GOOGLE_CONNECT_SUBJECT_ID??'owner')==='owner'&&
    env.VERCEL_ENV==='production'&&req.headers?.host==='nexo-one-two.vercel.app'&&
    env.VERCEL_CONNECT_INTERACTIVE_AUTH_MODE!=='detached';
}
function flowCookie(value,clear=false){
  // OAuth return navigation needs Lax. This cookie grants no application access;
  // the existing owner-session cookie remains HttpOnly/Secure/SameSite=Strict.
  return `${FLOW_COOKIE}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/api/google-drive-return; Max-Age=${clear?0:TTL/1000}`;
}
function returnCookie(value,clear=false){return `${RETURN_COOKIE}=${value}; HttpOnly; Secure; SameSite=Strict; Path=/api/google-drive-consent; Max-Age=${clear?0:TTL/1000}`;}
function pendingCookie(value,clear=false){return `${PENDING_COOKIE}=${value}; HttpOnly; Secure; SameSite=Strict; Path=/api/google-drive-consent; Max-Age=${clear?0:TTL/1000}`;}
function pendingProof(req,env,now){
  const p=unseal(cookieValue(req,PENDING_COOKIE),env,'pending',now);
  return p&&equal(p.session,sessionBinding(req))?p:null;
}
function returnProof(req,env,now){
  const p=unseal(cookieValue(req,RETURN_COOKIE),env,'return',now);
  return p&&equal(p.session,sessionBinding(req))?p:null;
}
async function bounded(operation,ms=12000){
  let timer;
  try{return await Promise.race([operation(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(new Error('CONNECTION_DEADLINE'),{code:'CONNECTION_DEADLINE'})),ms);})]);}
  finally{clearTimeout(timer);}
}
function csrfToken(req,env,now,profile=DEFAULT_PROFILE){
  return seal({v:1,kind:'csrf',profile,session:sessionBinding(req),nonce:randomBytes(32).toString('hex'),iat:now,exp:now+TTL},env);
}
function acceptedCsrf(req,env,now,body,profile){
  const p=unseal(body?.csrfToken,env,'csrf',now);
  return !!p&&p.profile===profile&&equal(p.session,sessionBinding(req));
}
function safeAuthorizationUrl(value){
  if(typeof value!=='string'||value.length>4096)throw new Error('CONSENT_RESPONSE_INVALID');
  const url=new URL(value);
  if(url.origin!=='https://connect.vercel.com'||url.username||url.password||url.hash||
     !/^\/authorize\/[A-Za-z0-9_-]+\/?$/.test(url.pathname))throw new Error('CONSENT_RESPONSE_INVALID');
  return value;
}
function providerError(error){
  if(['CONNECT_USER_AUTHORIZATION_REQUIRED','CONNECT_NO_TOKEN'].includes(error?.googleDiagnostic)||error?.code==='user_authorization_required')
    return fixedError('GOOGLE_USER_AUTHORIZATION_REQUIRED',401);
  if(error?.status===401||error?.status===403||error?.code==='AUTH_REQUIRED')return fixedError('GOOGLE_AUTHORIZATION_DENIED',401);
  if(error?.code==='RATE_LIMITED'||error?.status===429)return fixedError('GOOGLE_RATE_LIMITED',429);
  return fixedError('GOOGLE_CONNECTION_UNAVAILABLE',502);
}

export async function googleDriveConsentRoute(req,env,now=Date.now(),{
  body={},startAuthorizationImpl=startAuthorization,tokenImpl=googleConnectToken,readTowerImpl=readOperationalTower,
  readSpoolHeaderImpl=readOperationalSpoolHeader,startTimeoutMs=12000
}={}){
  const method=String(req.method||'GET').toUpperCase();
  if(!['GET','POST'].includes(method))return fixedError('METHOD_NOT_ALLOWED',405);
  if(!authenticated(req,env,now))return fixedError('AUTH_REQUIRED',401);
  if(!configuredOwner(env,req))return fixedError('GOOGLE_CONSENT_CONFIGURATION_MISMATCH',503);
  if(method==='GET'){
    const returned=returnProof(req,env,now),pending=pendingProof(req,env,now);
    const csrfTokens={[DEFAULT_PROFILE]:csrfToken(req,env,now,DEFAULT_PROFILE),[SHEETS_PROFILE]:csrfToken(req,env,now,SHEETS_PROFILE)};
    return {status:200,body:{status:'READY',connector:GOOGLE_DRIVE_CONSENT.connector,
      subject:GOOGLE_DRIVE_CONSENT.subject,scopes:GOOGLE_DRIVE_CONSENT.scopes,
      canVerify:returned?.profile===DEFAULT_PROFILE,canVerifySheetsWrite:returned?.profile===SHEETS_PROFILE,
      returnProfile:returned?.profile||null,pending:!!pending,pendingProfile:pending?.profile||null,
      startUncertain:pending?.uncertain===true,csrfToken:csrfTokens[DEFAULT_PROFILE],csrfTokens,
      profiles:{[DEFAULT_PROFILE]:{scopes:GOOGLE_DRIVE_CONSENT.scopes},[SHEETS_PROFILE]:{scopes:GOOGLE_SHEETS_SPOOL_CONSENT.scopes,spoolId:SPOOL_ID}}}};
  }
  if(!sameOrigin(req)||req.headers?.['sec-fetch-site']==='cross-site')return fixedError('ORIGIN_NOT_ALLOWED',403);
  if(body?.action!=='start'&&body?.action!=='verify')return fixedError('CONSENT_ACTION_INVALID',400);
  const profile=body?.profile===undefined?DEFAULT_PROFILE:body.profile;
  const selected=typeof profile==='string'&&Object.hasOwn(GOOGLE_CONSENT_PROFILES,profile)?GOOGLE_CONSENT_PROFILES[profile]:null;
  if(!selected)return fixedError('CONSENT_PROFILE_INVALID',400);
  if(!acceptedCsrf(req,env,now,body,profile))return fixedError('CSRF_INVALID_OR_EXPIRED',403);
  if(body.subject!==undefined||body.scopes!==undefined||body.connector!==undefined||body.callbackUrl!==undefined)
    return fixedError('CONSENT_PARAMETERS_FIXED',400);
  const scopedEnv=googleRuntimeEnvironment(env,req.headers);
  if(typeof scopedEnv.VERCEL_OIDC_TOKEN!=='string'||!scopedEnv.VERCEL_OIDC_TOKEN||
     scopedEnv.VERCEL_OIDC_TOKEN.length>16384||/[\s\u0000-\u001f\u007f]/u.test(scopedEnv.VERCEL_OIDC_TOKEN))
    return fixedError('GOOGLE_RUNTIME_IDENTITY_REQUIRED',503);
  if(body.action==='verify'){
    const proof=returnProof(req,env,now);
    if(!proof)return fixedError('CONSENT_RETURN_REQUIRED',409);
    if(proof.profile!==profile)return fixedError('CONSENT_PROFILE_MISMATCH',409);
    const deadline=AbortSignal.timeout(20000);
    let token;
    try{token=await tokenImpl(scopedEnv,deadline,{scopes:[...selected.scopes]});}
    catch(error){return providerError(error);}
    try{
      const fetchWithDeadline=(url,options)=>fetch(url,{...options,
        signal:options?.signal?AbortSignal.any([deadline,options.signal]):deadline});
      const tower=await readTowerImpl({token,fetchImpl:fetchWithDeadline});
      if(tower?.readback!=='PASS'||tower?.authority!=='TOWER_V06@GOOGLE_DRIVE_PRIVATE'||!/^sha256:[0-9a-f]{64}$/.test(tower?.revision||''))
        return fixedError('DRIVE_CANONICAL_READBACK_FAILED',502);
      if(profile===SHEETS_PROFILE){
        try{
          const spool=await readSpoolHeaderImpl({token,signal:deadline,fetchImpl:fetchWithDeadline});
          if(spool?.spreadsheetId!==SPOOL_ID||!spool?.title)return fixedError('SHEETS_SPOOL_READBACK_FAILED',502);
        }catch{return fixedError('SHEETS_SPOOL_READBACK_FAILED',502);}
        return {status:200,setCookie:returnCookie('',true),body:{status:'SHEETS_SPOOL_READ_VERIFIED',scopes:selected.scopes,
          towerRevision:tower.revision,readback:'PASS',spoolId:SPOOL_ID,spoolReadback:'PASS',writePerformed:false}};
      }
      return {status:200,setCookie:returnCookie('',true),body:{status:'DRIVE_VERIFIED',scopes:selected.scopes,towerRevision:tower.revision,readback:'PASS'}};
    }catch{return fixedError('DRIVE_CANONICAL_READBACK_FAILED',502);}
  }
  if(profile===DEFAULT_PROFILE&&body.approveReadOnly!==true)return fixedError('READ_ONLY_CONSENT_REQUIRED',400);
  if(profile===SHEETS_PROFILE&&body.approveSheetsWrite!==true)return fixedError('SHEETS_WRITE_CONSENT_REQUIRED',400);
  if(profile===DEFAULT_PROFILE&&body.approveSheetsWrite!==undefined||profile===SHEETS_PROFILE&&body.approveReadOnly!==undefined)
    return fixedError('CONSENT_PROFILE_APPROVAL_MISMATCH',400);
  if(pendingProof(req,env,now))return fixedError('CONSENT_ALREADY_PENDING',409);
  const state={v:1,kind:'flow',profile,session:sessionBinding(req),nonce:randomBytes(32).toString('hex'),iat:now,exp:now+TTL};
  const callbackUrl=selected.origin+'/api/google-drive-return?state='+state.nonce+'&profile='+encodeURIComponent(profile);
  try{
    // Explicit project OIDC prevents SDK discovery from using CLI/user credentials.
    // Connect owns provider PKCE, OAuth state, token exchange and refresh storage.
    const result=await bounded(()=>startAuthorizationImpl(selected.connector,{
      subject:{...selected.subject},scopes:[...selected.scopes]
    },{vercelToken:scopedEnv.VERCEL_OIDC_TOKEN,callbackUrl,deviceCode:false,expiresInMs:TTL}),startTimeoutMs);
    if(result?.connector?.uid&&result.connector.uid!==selected.connector)throw new Error('CONSENT_RESPONSE_INVALID');
    const authorizationUrl=safeAuthorizationUrl(result?.url);
    return {status:200,setCookie:[flowCookie(seal(state,env)),pendingCookie(seal({...state,kind:'pending',uncertain:false},env)),returnCookie('',true)],body:{status:'CONSENT_REQUIRED',authorizationUrl,
      profile,scopes:selected.scopes,expiresAt:state.exp}};
  }catch(error){
    // The SDK has no AbortSignal option. A timeout/network failure does not prove
    // cancellation. Retain a session-bound pending marker and never retry here.
    if(![400,401,403,429].includes(error?.status))return {status:504,
      setCookie:[flowCookie(seal(state,env)),pendingCookie(seal({...state,kind:'pending',uncertain:true},env)),returnCookie('',true)],
      body:{error:'GOOGLE_CONSENT_START_UNCERTAIN',expiresAt:state.exp}};
    return providerError(error);
  }
}

export function googleDriveConsentReturn(req,env,now=Date.now()){
  if(String(req.method).toUpperCase()!=='GET')return fixedError('METHOD_NOT_ALLOWED',405);
  if((env.NEXO_SESSION_SECRET?.length||0)<32||!configuredOwner(env,req))return fixedError('GOOGLE_CONSENT_CONFIGURATION_MISMATCH',503);
  let url;
  try{url=new URL(req.url,GOOGLE_DRIVE_CONSENT.origin);}catch{return fixedError('CONSENT_STATE_INVALID_OR_EXPIRED',400);}
  const p=unseal(cookieValue(req,FLOW_COOKIE),env,'flow',now),states=url.searchParams.getAll('state'),profiles=url.searchParams.getAll('profile');
  const profileMatches=profiles.length===1&&profiles[0]===p?.profile||profiles.length===0&&p?.legacyProfile===true&&p.profile===DEFAULT_PROFILE;
  if(!p||states.length!==1||!profileMatches||!equal(states[0],p.nonce))return fixedError('CONSENT_STATE_INVALID_OR_EXPIRED',400);
  // Strict owner cookies may be absent on the cross-site redirect. A present
  // owner cookie must match the initiating session. This callback only navigates;
  // verification always requires that session again and a fresh Drive readback.
  const session=cookieValue(req,'nexo_session');
  if(session&&(!authenticated(req,env,now)||!equal(p.session,sessionBinding(req))))return fixedError('CONSENT_SESSION_MISMATCH',403);
  const proof={...p,kind:'return',iat:now,exp:now+TTL};
  return {status:303,setCookie:[flowCookie('',true),pendingCookie('',true),returnCookie(seal(proof,env))],
    location:p.profile===DEFAULT_PROFILE?'/google-drive-connect.html?returned=1':'/google-drive-connect.html?returned=1&profile='+encodeURIComponent(p.profile),
    body:{status:'VERIFY_DRIVE_READBACK',profile:p.profile}};
}

export async function readOperationalSpoolHeader({token,signal,fetchImpl=fetch}={}){
  const request=async url=>{
    const response=await fetchImpl(url,{method:'GET',redirect:'error',signal,
      headers:{Authorization:`Bearer ${token}`,Accept:'application/json'}});
    if(!response.ok)throw new Error('SHEETS_SPOOL_READ_FAILED');
    return response.json();
  };
  const root=`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(SPOOL_ID)}`;
  const metadata=await request(`${root}?fields=spreadsheetId,sheets.properties(sheetId,title,index)`);
  const tab=[...(metadata.sheets||[])].sort((a,b)=>(a.properties?.index||0)-(b.properties?.index||0))[0];
  const title=String(tab?.properties?.title||'').trim();
  if(metadata.spreadsheetId!==SPOOL_ID||!title)throw new Error('SHEETS_SPOOL_METADATA_INVALID');
  const range=`'${title.replaceAll("'","''")}'!A1:K1`;
  const values=await request(`${root}/values/${encodeURIComponent(range).replaceAll("'",'%27')}?majorDimension=ROWS`);
  const header=Array.isArray(values.values?.[0])?values.values[0]:[];
  if(!header.includes('stable_id')||!header.includes('envelope_b64url'))throw new Error('SHEETS_SPOOL_HEADER_MISSING');
  return {spreadsheetId:metadata.spreadsheetId,title};
}
