import {json,requireEnv,ProviderError} from './http.mjs';
export async function nexo({env,signal}) {
  requireEnv(env,'NEXO_SOURCE_URL');
  const data=await json(env.NEXO_SOURCE_URL,{token:env.NEXO_SOURCE_TOKEN,signal});
  if(data.version!=='1'||typeof data.revision!=='string'||!Array.isArray(data.items)) throw new ProviderError('UNAVAILABLE');
  // The owner supplies provenance and observation time. Never re-stamp old canonical data as LIVE.
  return {items:data.items,revision:data.revision,partial:!!data.partial};
}
