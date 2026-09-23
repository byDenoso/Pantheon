import {buildAtlasGraphIndexes,type AtlasMetroModel,type AtlasMetroNode,type AtlasCrossLink} from './atlasAdapter.ts';

export type AtlasLens='operacao'|'ciencia'|'sistema'|'aprendizado';
export const ATLAS_LENSES:Array<[AtlasLens,string]>=[
  ['operacao','Operação'],['ciencia','Ciência'],['sistema','Sistema'],['aprendizado','Aprendizado'],
];

const OPERATION_TYPES=new Set(['ACTION','EFFECT','CAPABILITY','PROVIDER','PROJECTION']);
const SYSTEM_TYPES=new Set(['CAPABILITY','PROVIDER','PROJECTION','MEMORY']);

function addAncestors(model:AtlasMetroModel,id:string,keep:Set<string>){
  let current=model.nodeMap.get(id);
  while(current&&!keep.has(current.id)){
    keep.add(current.id);
    current=current.parentId?model.nodeMap.get(current.parentId):undefined;
  }
}

function descendantCount(childrenMap:Map<string,string[]>,id:string):number{
  let total=0;
  for(const child of childrenMap.get(id)||[])total+=1+descendantCount(childrenMap,child);
  return total;
}

export function normalizeAtlasLens(value:string|null|undefined):AtlasLens{
  const lens=String(value||'').toLowerCase();
  if(lens==='science'||lens==='ciencia')return'ciencia';
  if(lens==='system'||lens==='sistema')return'sistema';
  if(lens==='learning'||lens==='aprendizado')return'aprendizado';
  return'operacao';
}

export function atlasModelForLens(model:AtlasMetroModel,lens:AtlasLens):AtlasMetroModel{
  const keep=new Set<string>();
  let candidateIds:string[]=[];

  if(lens==='ciencia'){
    candidateIds=model.nodes.filter(node=>node.domain==='SCIENCE').map(node=>node.id);
  }else if(lens==='sistema'){
    candidateIds=model.nodes.filter(node=>node.domain==='NEXO'&&(node.entityType==='hub'||node.entityType==='subdomain'||SYSTEM_TYPES.has(String(node.entityType)))).map(node=>node.id);
  }else if(lens==='aprendizado'){
    candidateIds=model.crossLinks.filter(link=>link.isLearning).flatMap(link=>[link.source,link.target]);
  }else{
    candidateIds=model.nodes.filter(node=>node.entityType==='hub'||node.entityType==='subdomain'||OPERATION_TYPES.has(String(node.entityType))).map(node=>node.id);
  }

  candidateIds.forEach(id=>addAncestors(model,id,keep));
  if(!keep.size)model.roots.forEach(id=>keep.add(id));

  const rawNodes=model.nodes.filter(node=>keep.has(node.id));
  const childrenMap=new Map<string,string[]>();
  for(const node of rawNodes){
    childrenMap.set(node.id,(model.childrenMap.get(node.id)||[]).filter(id=>keep.has(id)));
  }

  const crossLinks=(lens==='aprendizado'?model.crossLinks.filter(link=>link.isLearning):model.crossLinks)
    .filter(link=>keep.has(link.source)&&keep.has(link.target));
  const relationCounts=new Map<string,number>();
  for(const link of crossLinks){
    relationCounts.set(link.source,(relationCounts.get(link.source)||0)+1);
    relationCounts.set(link.target,(relationCounts.get(link.target)||0)+1);
  }

  const nodes:AtlasMetroNode[]=rawNodes.map(node=>{
    const children=childrenMap.get(node.id)||[];
    const relations=relationCounts.get(node.id)||0;
    return {...node,childCount:children.length,descendantCount:descendantCount(childrenMap,node.id),relationCount:relations+children.length+(node.parentId&&keep.has(node.parentId)?1:0)};
  });
  const nodeMap=new Map(nodes.map(node=>[node.id,node]));
  const roots=model.roots.filter(id=>keep.has(id));

  return {
    revision:`${model.revision}:lens:${lens}`,
    generatedAt:model.generatedAt,
    roots,
    nodes,
    nodeMap,
    childrenMap,
    crossLinks:crossLinks as AtlasCrossLink[],
    ...buildAtlasGraphIndexes(nodes,crossLinks as AtlasCrossLink[]),
    sourceNodeIds:new Set([...model.sourceNodeIds].filter(id=>keep.has(id))),
  };
}
