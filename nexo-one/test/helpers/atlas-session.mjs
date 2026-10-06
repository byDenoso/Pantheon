import {createHash} from 'node:crypto';
// Synthetic shared-store session fixture; never imported by runtime/client code.
export function atlasTestSession(t){
  const env={NEXO_ATLAS_ORIGIN:'https://atlas.example',NEXO_ATLAS_PIN_HASH:`scrypt$${'a'.repeat(32)}$${'b'.repeat(128)}`,NEXO_ATLAS_REDIS_URL:'https://atlas-store.example',NEXO_ATLAS_REDIS_TOKEN:'synthetic-token'};
  const previous=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));
  Object.assign(process.env,env);
  t.after(()=>{for(const [k,v] of Object.entries(previous))if(v===undefined)delete process.env[k];else process.env[k]=v;});
  return {cookie:`__Host-atlas_session=${'a'.repeat(64)}`,wrap:fetcher=>async(url,options)=>String(url)===env.NEXO_ATLAS_REDIS_URL?Response.json({result:JSON.stringify({exp:Date.now()+60000,credential:createHash('sha256').update(env.NEXO_ATLAS_PIN_HASH).digest('hex')})}):fetcher(url,options)};
}
