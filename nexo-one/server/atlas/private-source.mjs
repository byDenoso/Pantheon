import {googleToken} from '../adapters/google.mjs';
import {readVerifiedCanonicalTower} from '../mcp/operational-state.mjs';
import {compilePrivateTowerRuntime} from './private-tower.mjs';
import {validatePrivateRuntime} from './private-runtime.mjs';
// Only a server-configured, access-controlled source may supply private Atlas
// data. No public Pages/Raw GitHub fallback and no caller-provided upstream URL.
async function readFromDrive(env,fetcher,tokenProvider,reader){
  const token=await tokenProvider(env,AbortSignal.timeout(8000),{scopes:['https://www.googleapis.com/auth/drive.readonly']});
  const signal=AbortSignal.timeout(20000);
  for(let attempt=0;attempt<2;attempt++){
    try{const {tower}=await reader({token,fetchImpl:fetcher,signal});return compilePrivateTowerRuntime(tower);}
    catch(error){if(attempt||signal.aborted||error?.message!=='TOWER_READ_RACE')throw error;}
  }
}
async function readFromProxy(env,fetcher){
  let url;
  try{url=new URL(env.NEXO_ATLAS_PRIVATE_SOURCE_URL);}catch{throw new Error('PRIVATE_SOURCE_NOT_CONFIGURED');}
  if(url.protocol!=='https:'||url.username||url.password||!env.NEXO_ATLAS_PRIVATE_SOURCE_TOKEN)throw new Error('PRIVATE_SOURCE_NOT_CONFIGURED');
  const response=await fetcher(url,{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10000),headers:{Accept:'application/json',Authorization:`Bearer ${env.NEXO_ATLAS_PRIVATE_SOURCE_TOKEN}`}});
  if(response.status===401||response.status===403){
    const denied=new Error('PRIVATE_SOURCE_UNAVAILABLE');
    denied.code='PRIVATE_SOURCE_ACCESS_DENIED';
    throw denied;
  }
  if(!response.ok)throw new Error('PRIVATE_SOURCE_UNAVAILABLE');
  if(Number(response.headers.get('content-length'))>16*1024*1024)throw new Error('PRIVATE_SOURCE_TOO_LARGE');
  const chunks=[];let bytes=0;
  for await(const chunk of response.body){bytes+=chunk.length;if(bytes>16*1024*1024)throw new Error('PRIVATE_SOURCE_TOO_LARGE');chunks.push(chunk);}
  const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if(value?.contract!=='ATLAS_PRIVATE_V1'||!value.data||typeof value.data!=='object'||Array.isArray(value.data))throw new Error('PRIVATE_SOURCE_INVALID');
  return {contract:'ATLAS_PRIVATE_V1',data:validatePrivateRuntime(value.data)};
}
// Never log upstream error strings: clients and upstreams may return secrets.
// Keep only explicit, bounded failure codes for operational diagnosis.
function safePrivateFailure(error){
  if(error?.code==='PRIVATE_SOURCE_ACCESS_DENIED')return error.code;
  const code=String(error?.message||'');
  const known=['PRIVATE_SOURCE_NOT_CONFIGURED','PRIVATE_SOURCE_UNAVAILABLE',
    'PRIVATE_SOURCE_TOO_LARGE','PRIVATE_SOURCE_INVALID','AUTH_REQUIRED','TOWER_READ_RACE'];
  if(known.includes(code))return code;
  if(error?.status===401||error?.status===403)return 'PRIVATE_SOURCE_ACCESS_DENIED';
  if(error?.name==='AbortError'||error?.name==='TimeoutError')return 'TIMEOUT';
  return 'UNCLASSIFIED_ERROR';
}
function safeProxyError(error){
  // Retain stable documented errors, not untrusted network details.
  if(error instanceof SyntaxError)return new SyntaxError('PRIVATE_SOURCE_INVALID_JSON');
  const code=safePrivateFailure(error);
  if(['PRIVATE_SOURCE_UNAVAILABLE','PRIVATE_SOURCE_TOO_LARGE','PRIVATE_SOURCE_INVALID'].includes(code))return error;
  return new Error('PRIVATE_SOURCE_UNAVAILABLE');
}
export async function readAtlasPrivatePublication(env=process.env,fetcher=fetch,{tokenProvider=googleToken,reader=readVerifiedCanonicalTower}={}){
  if(!env.NEXO_ATLAS_PRIVATE_SOURCE_URL&&env.NEXO_ATLAS_PRIVATE_SOURCE_TOKEN)throw new Error('PRIVATE_SOURCE_NOT_CONFIGURED');
  if(!env.NEXO_ATLAS_PRIVATE_SOURCE_URL)return readFromDrive(env,fetcher,tokenProvider,reader);
  // Legacy proxy first when configured; if it is down, the canonical Drive read
  // (same authorization, same Tower) keeps the Atlas up instead of failing.
  try{return await readFromProxy(env,fetcher);}
  catch(error){
    // An explicit upstream denial is not an availability failure and must not
    // authorize another identity or transport as a fallback.
    if(error?.message==='PRIVATE_SOURCE_NOT_CONFIGURED'||error?.code==='PRIVATE_SOURCE_ACCESS_DENIED')throw error;
    const proxyCode=safePrivateFailure(error);
    console.error('atlas-private proxy failed; canonical Drive fallback',proxyCode);
    try{return await readFromDrive(env,fetcher,tokenProvider,reader);}
    catch(driveError){
      console.error('atlas-private canonical Drive fallback failed',safePrivateFailure(driveError));
      // Do not leak arbitrary exception messages into the caller's logs.
      throw safeProxyError(error);
    }
  }
}
