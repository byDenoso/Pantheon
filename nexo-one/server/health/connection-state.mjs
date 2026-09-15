import {configured as sessionConfigured} from '../auth/session.mjs';

const available=id=>provider=>provider?.id===id&&provider?.status==='AVAILABLE';
const statuses=(ids,providers)=>ids.map(id=>providers.find(provider=>provider?.id===id)?.status||'UNAVAILABLE');
const anyAvailable=(ids,providers)=>ids.some(id=>providers.some(available(id)));
const allAvailable=(ids,providers)=>ids.every(id=>providers.some(available(id)));
const present=(env,...keys)=>keys.every(key=>typeof env?.[key]==='string'&&env[key].trim());

function googleConfigured(env){
  if(typeof env?.GOOGLE_CONNECTOR==='string'&&env.GOOGLE_CONNECTOR.trim())return present(env,'VERCEL_OIDC_TOKEN');
  return present(env,'GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','GOOGLE_REFRESH_TOKEN');
}

function connection({configured,runtimeVerified,providerStatuses,access}){
  const observable=String(access||'PRIVATE').toUpperCase()==='PRIVATE';
  return {
    configured,
    authorized:observable?configured&&runtimeVerified:null,
    runtimeVerified:observable&&runtimeVerified,
    verificationState:observable?(runtimeVerified?'VERIFIED':'NOT_VERIFIED'):'PRIVATE_SESSION_REQUIRED',
    providers:providerStatuses,
  };
}

export function summarizeConnectionHealth({env=process.env,providers=[],access='PRIVATE'}={}){
  const googleIds=['drive','gmail','calendar'];
  const googleRuntimeVerified=allAvailable(googleIds,providers);
  const atlasRuntimeVerified=anyAvailable(['atlas'],providers);
  const vercelRuntimeVerified=anyAvailable(['vercel'],providers);
  const googleIsConfigured=googleConfigured(env);
  const atlasIsConfigured=present(env,'ATLAS_GRAPH_URL','ATLAS_SOURCE_TOKEN');
  const vercelIsConfigured=present(env,'VERCEL_READ_TOKEN','VERCEL_PROJECT_ID');
  return {
    session:{configured:sessionConfigured(env)},
    connections:{
      google:connection({configured:googleIsConfigured,runtimeVerified:googleRuntimeVerified,providerStatuses:statuses(googleIds,providers),access}),
      atlas:connection({configured:atlasIsConfigured,runtimeVerified:atlasRuntimeVerified,providerStatuses:statuses(['atlas'],providers),access}),
      vercel:connection({configured:vercelIsConfigured,runtimeVerified:vercelRuntimeVerified,providerStatuses:statuses(['vercel'],providers),access}),
    }
  };
}
