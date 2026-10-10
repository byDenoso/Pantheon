import {createOperationalService} from './operational-tools.mjs';
import {readOperationalTower,readVerifiedCanonicalTower} from './operational-state.mjs';
import {submitOperationalIntent} from './operational-queue.mjs';
import {operationalPrincipal} from './operational-auth.mjs';
import {createRetrievalService} from './retrieval-tools.mjs';
import {submitScientificGatewayEnvelope} from '../inbox-gateway.mjs';
import {googleRuntimeEnvironment,GOOGLE_AUTH_DIAGNOSTICS} from '../adapters/connect.mjs';

export const OPERATIONAL_READ_SCOPES=Object.freeze(['https://www.googleapis.com/auth/drive.readonly']);
const SAFE_ERRORS=new Set(['AUTH_REQUIRED','RATE_LIMITED','UNAVAILABLE','EXISTING_GOOGLE_AUTH_REQUIRED',
  'CANONICAL_TOWER_INVALID','TOWER_METADATA_UNAVAILABLE','TOWER_METADATA_INVALID','TOWER_TOO_LARGE',
  'TOWER_UNAVAILABLE','TOWER_BODY_HASH_MISMATCH','TOWER_READ_RACE','SPOOL_DESTINATION_MISMATCH',
  'SPOOL_IDENTITY_CONFLICT','SPOOL_BODY_READBACK_FAILED','SHEETS_SPOOL_TAB_MISSING','SHEETS_SPOOL_HEADER_MISSING']);
export async function operationalSource(stage,read){
  try{return await read();}
  catch(error){
    const candidate=error?.code||error?.message;
    const code=SAFE_ERRORS.has(candidate)?candidate:'OPERATIONAL_SOURCE_UNAVAILABLE';
    const diagnostic=GOOGLE_AUTH_DIAGNOSTICS.includes(error?.googleDiagnostic)?error.googleDiagnostic:null;
    console.warn(JSON.stringify({component:'NEXO_OPERATIONAL_RUNTIME',stage,code,...(diagnostic?{diagnostic}:{})}));
    throw Object.assign(new Error(code),{code});
  }
}
export async function operationalForRequest(request,env=process.env){
  const headers=Object.fromEntries(request.headers);
  if(!headers.host)headers.host=new URL(request.url).host;
  const nodeRequest={headers,method:request.method};
  const principal=await operationalPrincipal(request,env);
  if(!principal)return {principal:null,service:null,retrieval:null};
  const {googleToken}=await import('../adapters/google.mjs');
  const scopedEnv=googleRuntimeEnvironment(env,headers);
  const driveToken=()=>googleToken(scopedEnv,undefined,{scopes:OPERATIONAL_READ_SCOPES});
  const service=createOperationalService({
    // Role context needs Drive only, never Gmail, Calendar or Sheets read scopes.
    readState:()=>operationalSource('READ_CANONICAL_CONTEXT',async()=>readOperationalTower({
      token:await driveToken()})),
    submitIntent:(intent,identity)=>operationalSource('WRITE_PRIVATE_INTENT',()=>
      submitOperationalIntent(intent,identity,scopedEnv,nodeRequest)),
    submitScientificRequest:(stableId,envelope)=>operationalSource('WRITE_SCIENTIFIC_QUEUE',()=>
      submitScientificGatewayEnvelope(stableId,envelope,scopedEnv,nodeRequest))
  });
  const retrieval=createRetrievalService({
    readTower:()=>operationalSource('READ_CANONICAL_RETRIEVAL',async()=>{
      const {tower}=await readVerifiedCanonicalTower({token:await driveToken()});
      return {tower,observedAt:new Date().toISOString()};
    })
  });
  return {principal,service,retrieval};
}
