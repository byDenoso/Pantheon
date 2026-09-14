import {createHash} from 'node:crypto';

const arr=value=>Array.isArray(value)?value:[];
const text=value=>String(value??'').trim();

function resolveHash(lookup,id){
  if(typeof lookup==='function')return text(lookup(id));
  if(lookup instanceof Map)return text(lookup.get(id));
  return text(lookup?.[id]);
}

export function dependencyFingerprint(ids=[],lookup={}){
  const unique=[...new Set(arr(ids).map(text).filter(Boolean))].sort();
  const pairs=[];
  for(const id of unique){
    const hash=resolveHash(lookup,id);
    if(!hash)return undefined;
    pairs.push([id,hash]);
  }
  return `sha256:${createHash('sha256').update(JSON.stringify(pairs)).digest('hex')}`;
}

export function selectInvalidatedSyntheses({syntheses=[],hashLookup={}}={}){
  const invalidated=[];
  const stable=[];
  for(const synthesis of arr(syntheses)){
    const ids=[...arr(synthesis?.observationIds),...arr(synthesis?.comparisonIds),...arr(synthesis?.evidenceIds)].map(text).filter(Boolean);
    const missing=ids.some(id=>!resolveHash(hashLookup,id));
    if(missing){
      invalidated.push({...synthesis,dependencyState:'DATA_UNAVAILABLE',nextDependencyFingerprint:undefined});
      continue;
    }
    const next=dependencyFingerprint(ids,hashLookup);
    if(!next||text(synthesis?.dependencyFingerprint)!==next)invalidated.push({...synthesis,dependencyState:'READY',nextDependencyFingerprint:next});
    else stable.push({...synthesis,dependencyState:'READY',nextDependencyFingerprint:next});
  }
  return {invalidated,stable};
}
