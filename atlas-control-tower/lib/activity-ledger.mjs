import {createHash} from 'node:crypto';

const text=value=>String(value??'').trim();
const arr=value=>Array.isArray(value)?value:[];
const eventTypeFor=delta=>`${text(delta?.entityType||'ENTITY').toUpperCase()}_${text(delta?.eventType).toUpperCase()}`;
const stableId=delta=>`activity:${createHash('sha256').update(JSON.stringify([text(delta?.entityType).toUpperCase(),text(delta?.entityId),Number(delta?.revision||0),text(delta?.eventType).toUpperCase()])).digest('hex').slice(0,24)}`;

export function buildActivityEvents(deltas=[],meta={}){
  const sourceVersion=text(meta?.sourceVersion);
  const sourceRef=text(meta?.sourceRef);
  return arr(deltas).map(delta=>{
    const provenance=[];
    if(sourceVersion||sourceRef)provenance.push({source:'GOOGLE_DRIVE',...(sourceVersion?{sourceVersion}:{}),...(sourceRef?{sourceRef}:{})});
    return {
      id:stableId(delta),
      type:eventTypeFor(delta),
      entityId:text(delta?.entityId),
      entityType:text(delta?.entityType||'ENTITY').toUpperCase(),
      observedAt:text(delta?.observedAt),
      revision:Number(delta?.revision||0),
      ...(text(delta?.campaignId)?{campaignId:text(delta.campaignId)}:{}),
      domains:arr(delta?.domains).map(text).filter(Boolean),
      ...(text(delta?.previousHash)?{previousHash:text(delta.previousHash)}:{}),
      ...(text(delta?.currentHash)?{currentHash:text(delta.currentHash)}:{}),
      ...(text(delta?.sourceCreatedAt)?{sourceCreatedAt:text(delta.sourceCreatedAt)}:{}),
      provenance
    };
  });
}
