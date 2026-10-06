import {googleToken} from '../adapters/google.mjs';
import {readVerifiedCanonicalTower} from '../mcp/operational-state.mjs';
import {compilePrivateTowerRuntime} from './private-tower.mjs';
import {validatePrivateRuntime} from './private-runtime.mjs';
// Only a server-configured, access-controlled source may supply private Atlas
// data. No public Pages/Raw GitHub fallback and no caller-provided upstream URL.
export async function readAtlasPrivatePublication(env=process.env,fetcher=fetch,{tokenProvider=googleToken,reader=readVerifiedCanonicalTower}={}){
  // Prefer the already-authorized canonical Drive reader. No new service or
  // independent stored projection is required. Explicit legacy proxy config
  // below remains a bounded private read transport, never a public fallback.
  if(!env.NEXO_ATLAS_PRIVATE_SOURCE_URL&&env.NEXO_ATLAS_PRIVATE_SOURCE_TOKEN)throw new Error('PRIVATE_SOURCE_NOT_CONFIGURED');
  if(!env.NEXO_ATLAS_PRIVATE_SOURCE_URL){
    const token=await tokenProvider(env,AbortSignal.timeout(8000),{scopes:['https://www.googleapis.com/auth/drive.readonly']});
    const signal=AbortSignal.timeout(12000);
    for(let attempt=0;attempt<2;attempt++){
      try{const {tower}=await reader({token,fetchImpl:fetcher,signal});return compilePrivateTowerRuntime(tower);}
      catch(error){if(attempt||signal.aborted||error?.message!=='TOWER_READ_RACE')throw error;}
    }
  }
  let url;
  try{url=new URL(env.NEXO_ATLAS_PRIVATE_SOURCE_URL);}catch{throw new Error('PRIVATE_SOURCE_NOT_CONFIGURED');}
  if(url.protocol!=='https:'||url.username||url.password||!env.NEXO_ATLAS_PRIVATE_SOURCE_TOKEN)throw new Error('PRIVATE_SOURCE_NOT_CONFIGURED');
  const response=await fetcher(url,{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10000),headers:{Accept:'application/json',Authorization:`Bearer ${env.NEXO_ATLAS_PRIVATE_SOURCE_TOKEN}`}});
  if(!response.ok)throw new Error('PRIVATE_SOURCE_UNAVAILABLE');
  if(Number(response.headers.get('content-length'))>16*1024*1024)throw new Error('PRIVATE_SOURCE_TOO_LARGE');
  const chunks=[];let bytes=0;
  for await(const chunk of response.body){bytes+=chunk.length;if(bytes>16*1024*1024)throw new Error('PRIVATE_SOURCE_TOO_LARGE');chunks.push(chunk);}
  const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if(value?.contract!=='ATLAS_PRIVATE_V1'||!value.data||typeof value.data!=='object'||Array.isArray(value.data))throw new Error('PRIVATE_SOURCE_INVALID');
  return {contract:'ATLAS_PRIVATE_V1',data:validatePrivateRuntime(value.data)};
}
