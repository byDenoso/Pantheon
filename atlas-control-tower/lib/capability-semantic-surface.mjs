import {reconcileCapabilityCandidate,classifyCapabilityDrift} from './capability-reconciler.mjs';

export function createCapabilitySemanticSurface({towerGateway}){
  if(!towerGateway?.readCapabilityManifest)throw new Error('CAPABILITY_MANIFEST_READER_REQUIRED');
  async function getCapabilities(){
    const manifest=await towerGateway.readCapabilityManifest();
    return {authority:'TOWER_V06/manifests/capabilities.json',schema_version:manifest?.schema_version??null,capabilities:manifest?.capabilities??{}};
  }
  async function reconcileCapability(candidate){
    const manifest=await towerGateway.readCapabilityManifest();
    return reconcileCapabilityCandidate(candidate,manifest);
  }
  async function getCapabilityDrift(observed=[]){
    const manifest=await towerGateway.readCapabilityManifest();
    return classifyCapabilityDrift(observed,manifest);
  }
  async function call(name,args={}){
    if(name==='nexo.get_capabilities')return getCapabilities();
    if(name==='nexo.reconcile_capability')return reconcileCapability(args.candidate??args);
    if(name==='nexo.get_capability_drift')return getCapabilityDrift(args.observed??[]);
    throw new Error('CAPABILITY_SEMANTIC_TOOL_NOT_FOUND');
  }
  return {getCapabilities,reconcileCapability,getCapabilityDrift,call};
}
