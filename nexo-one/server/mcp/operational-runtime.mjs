import {createOperationalService} from './operational-tools.mjs';
import {readOperationalTower} from './operational-state.mjs';
import {submitOperationalIntent} from './operational-queue.mjs';
import {operationalPrincipal} from './operational-auth.mjs';
export async function operationalForRequest(request,env=process.env){
  const headers=Object.fromEntries(request.headers);
  if(!headers.host)headers.host=new URL(request.url).host;
  const nodeRequest={headers,method:request.method};
  const principal=await operationalPrincipal(request,env);
  if(!principal)return {principal:null,service:null};
  const {googleToken}=await import('../adapters/google.mjs');
  const {GOOGLE_READ_SCOPES}=await import('../adapters/connect.mjs');
  const scopedEnv=headers['x-vercel-oidc-token']&&!env.VERCEL_OIDC_TOKEN?{...env,VERCEL_OIDC_TOKEN:headers['x-vercel-oidc-token']}:env;
  const service=createOperationalService({
    readState:async()=>readOperationalTower({token:await googleToken(scopedEnv,undefined,{scopes:GOOGLE_READ_SCOPES})}),
    submitIntent:(intent,identity)=>submitOperationalIntent(intent,identity,scopedEnv,nodeRequest)
  });
  return {principal,service};
}
