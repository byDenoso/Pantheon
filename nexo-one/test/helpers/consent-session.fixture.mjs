import {createHash,randomBytes} from 'node:crypto';
const digest=value=>createHash('sha256').update(value).digest('hex');
const records=new Map();
export const atlasTestEnv={NEXO_ATLAS_PIN_HASH:'scrypt$'+'a'.repeat(32)+'$'+'b'.repeat(128),
  NEXO_ATLAS_ORIGIN:'https://nexo-one-two.vercel.app',NEXO_ATLAS_REDIS_URL:'https://store.invalid',NEXO_ATLAS_REDIS_TOKEN:'synthetic'};
export function makeAtlasSession(env,now){
  const token=randomBytes(32).toString('hex');
  records.set('atlas:session:'+digest(token),JSON.stringify({exp:now+3600000,credential:digest(env.NEXO_ATLAS_PIN_HASH)}));
  return token;
}
export async function atlasTestStore(command,key){
  if(command==='GET')return records.get(key)||null;
  throw new Error('unexpected consent storage mutation');
}
