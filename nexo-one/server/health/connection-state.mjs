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

export function summarizeConnectionHealth({env=process.env,providers=[]}={}){
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
      google:{configured:googleIsConfigured,authorized:googleIsConfigured&&googleRuntimeVerified,runtimeVerified:googleRuntimeVerified,providers:statuses(googleIds,providers)},
      atlas:{configured:atlasIsConfigured,authorized:atlasIsConfigured&&atlasRuntimeVerified,runtimeVerified:atlasRuntimeVerified,providers:statuses(['atlas'],providers)},
      vercel:{configured:vercelIsConfigured,authorized:vercelIsConfigured&&vercelRuntimeVerified,runtimeVerified:vercelRuntimeVerified,providers:statuses(['vercel'],providers)},
    }
  };
}
