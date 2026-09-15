const upper=value=>String(value??'').toUpperCase();

export function nodeVisualRole(node={}){
  const type=upper(node.type);
  const status=upper(node.status);
  if(['BLOCKED','NEGATIVE','FAILED','ATTENTION'].includes(status))return'attention';
  if(type==='SYSTEM'||type==='ROOT')return'core';
  if(type==='DOMAIN'||type==='PROGRAM')return'hub';
  if(type==='AUTOMATION'||type==='FILAMENT')return'automation';
  if(type==='REFERENCE'||type==='EVIDENCE'||type==='RESULT')return'evidence';
  if(type==='CAMPAIGN'||type==='CLAIM'||type==='TEST'||type==='RUN')return'signal';
  return'entity';
}

export function edgeVisualRole(edge={}){
  const type=upper(edge.type);
  if(['CONTRADICTS','BLOCKS','ATTENTION'].includes(type))return'attention';
  if(['SUPPORTS','DERIVED_FROM','EVIDENCE','VALIDATES','PRODUCES'].includes(type))return'evidence';
  if(['CO_DECLARED','CROSS_DOMAIN','LEARNING','FILAMENT'].includes(type))return'learning';
  if(['CONTAINS','PARENT_OF','HAS_CHILD','TESTS','IMPLEMENTS','DEPENDS_ON'].includes(type))return'hierarchy';
  return'association';
}

export function graphRenderBudget({width=1280,compact=false}={}){
  if(compact||width<600)return{visibleBudget:56,labelBudget:12};
  if(width>=1200)return{visibleBudget:220,labelBudget:44};
  return{visibleBudget:140,labelBudget:28};
}
