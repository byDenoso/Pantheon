const defaultRoot=()=>globalThis.document?.documentElement;

export function publishSemanticBand(band,{root=defaultRoot()}={}){
  const value=String(band||'program');
  if(root?.dataset)root.dataset.atlasSemanticBand=value;
  return value;
}

export function publishFocusTunnelState(focusId,{root=defaultRoot()}={}){
  const value=focusId==null||focusId===''?null:String(focusId);
  if(root?.dataset)root.dataset.atlasFocusTunnel=value?'active':'inactive';
  return value;
}
